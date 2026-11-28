// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/props/levels.js — the light levels and the light-carrying colours of the club props (owner: props). Pure data, no
// imports: props.js and atlas.js read it, and the node arm (web/tools/club/test-club-props.mjs) puts every level through the
// grade and the tone map to hold the rule below.
//
// The rule. Levels are scene-linear multipliers over an atlas colour. At the app's exposure (0.85, times the club grade's 0.92
// and its contrast) the tone map puts 0.5 at about 70 % of display white, 1.0 at about 88 %, 2.0 at 95 % and 4.0 at 98 %.
// So SURFACES (the lit shelf panels, shades, a sign's halo) stay near 1: bright, with their colour and their gradient left,
// and a blur of them is still a picture of a shelf. Only POINT-LIKE sources (flames, bulbs, pilot lamps, the hot core of a
// tube, the glint on a bottle's shoulder) go far above 1: a few pixels wide, they are what the lens turns into discs and what
// the bloom threshold picks up.
//
// The played table leads (CONTRACT.md 10.2): the second table's cloth and lamp are held clearly under the main bed in every
// frame (FAR below; the node arm pins the display values).
//
// Round 2's values are kept beside the current ones (R2 at the end) for the tool switch `clubprops=r2`: on / off pictures
// of the same tree.

// HDR level of each kind of emissive primitive (the emissive batch's per-vertex level, kit.js `hdr`)
export const EMIT = Object.freeze({
  panel: 0.9,      // back-lit shelf panel at its brightest (the middle of a pool of light at the foot of a display row), times
                   // SHELF_GLOW (which falls to dark wood at the top of the row and between the pools: a lit recess, not a light box)
  strip: 2.4,      // the thin strip at the back of each shelf, behind the bottles
  sign: 2.6,       // tube-letter signs (the tube's core clips to white, its halo keeps the colour)
  shade: 0.34,     // glass shades of the far lamp: saturated amber glass, its rim at about three quarters of the main bed's
                   // luminance (lit, and still a secondary source)
  bulb: 3.0,       // the inside of the bar lamp's shade
  farBulb: 0.26,   // the inside of a far shade (seen only from under its rim: held under the main bed too)
  hot: 14,         // a bulb seen directly
  flame: 26,       // a candle flame (9 mm: a disc source)
  pilot: 9,        // a pilot lamp on a device (12 mm lens, a saturated colour: a small coloured disc behind the lens)
  fairy: 11,       // a bulb of the string along the front of the lower shelf board (9 mm: a row of small discs behind the lens)
  dial: 1.1,       // the lit dial window of the receiver on the back counter
  jar: 1.0,        // the candle's glass jar
  banker: 4.0,     // the green glass shade of the bar lamp (a dark colour: this is about 0.8 green)
  dim: 4.5,        // the dim strip under the counter lip (a dark colour: about 0.6)
});
export const GLOW = 0.34;     // emissive share of the self-lit lit material (a drink on a side table)
export const GLASS = 0.95;    // how much of the lit panel's level comes through a bottle (times its palette colour)

// The second table. Its cloth, cushions and balls are plain emissive surfaces (the emissive batch: no room light, no
// reflection): what the display shows is the painted colour x the level and nothing else, in every view and under every
// bake. Round 2 held the cloth at one flat dark green (a slab); now the cloth carries three pools of light, one under each
// shade, falling to a dark cloth at the cushions, and the shadows of its balls, with the pool centre still clearly under
// the main bed.
export const FAR = Object.freeze({
  // The whole lit top of this table was brought down at the end of round 3 (0.4 -> 0.27 on the cloth, the cushions and the
  // balls with it): at 0.4 a pool centre stood at 87 of 255, 67 % of the main bed's centre from the high view and ABOVE the
  // main bed's own darkest played cloth (72, its near end under the restored lamp pool), which CONTRACT.md 10.2 forbids
  // (the second table is never brighter than the main bed in any frame). The form stays by contrast inside the lower
  // range (the painted pool is unchanged: the same ratios centre : mid : edge), not by level.
  cloth: 0.27,         // HDR level of the far cloth (times the painted pool, FAR_POOL): (6, 81, 39), luminance 62 predicted at a pool
                       // centre: under half of the main bed's centre (130 to 142) and under its darkest played cloth (72)
  cushion: 0.21,       // the cushion cloth's top (the `clothRim` swatch); its face toward the bed is in its own shade
  lamp: 2.6,           // intensity of the far lamp's emitter in the room light (unchanged since round 2: the bake holds it)
  ball: [0.035, 0.26], // a far ball, underside -> top (times its own colour): lit from straight above, like the cloth. The cue
                       // ball's top is (130, 126, 115) predicted: under the main bed's centre too
  ballSpark: 0.6,      // the lamp's highlight on a far ball (a 9 mm dot; under the bloom threshold)
});
// The second table's BODY (apron and legs, the wood batch) under the room's light. After the room's round-3 re-levelling the
// wall lamps no longer reach it and the floor's bounce around it is weaker: the body fell to a silhouette (about 8 of 255
// from across the room, 15 in round 2). `lift` multiplies the DIFFUSE light the body's wood returns, in the material
// (props.js FAR_BODY_FRAGMENT: fragments inside the body's box only): the same on the display as an albedo twice as light on
// those triangles, without touching what the room's bake reads (vertex shade, material colour, geometry, emitters), so the
// baked files stay current. The bake's bounce off the body stays that of the unlifted wood (a dark surface 0.5 m2 across:
// nothing the map shows). Reflections are not lifted. 1 = no lift.
export const FAR_BODY = Object.freeze({ lift: 2.0, top: 0.755 });   // `top`: metres above the floor; the lacquered rails start above it
// The far cloth (sRGB; atlas.js paints three round pools with these, one under each shade): `centre` in the middle of a pool,
// `mid` four fifths of the way out, `edge` the cloth no pool reaches (the corners, and the strip under the cushions).
// `profile` = [radius 0..1, share of `mid`] between them: a flat top, then a steady fall. The pools stand a little inside the
// shades (`at`, metres along the table) so that the two ends of the cloth fall to about two fifths of a pool's centre, as
// its long sides do: the pool reads from every side. (The first round-3 painting had the pools under the shades at 0.62 m
// radius: the ends kept 60 % of the centre, flatter along the table than round 2's single gradient.)
export const FAR_POOL = Object.freeze({
  centre: '#62b87e', mid: '#357e52', edge: '#1c4a32', radius: 0.6, at: [-0.5, 0, 0.5],
  profile: [[0, 0], [0.35, 0.1], [0.6, 0.5], [0.8, 1]],
});
// the far balls: [atlas swatch, x, z] on the bed (metres from the table centre; fartable.js builds them, atlas.js paints their
// shadows into the cloth). A game in progress under the middle and the right-hand shade.
export const FAR_BALLS = Object.freeze([
  ['ballCue', -0.5, 0.16], ['ball1', 0.3, -0.2], ['ball3', 0.46, 0.13], ['ball5', 0.06, 0.27], ['ball2', -0.14, -0.18],
  ['ball8', 0.66, -0.07], ['ball6', -0.7, -0.12], ['ball7', 0.17, 0.0], ['ball4', -0.28, 0.1],
]);
// the far cloth as built and as painted: [length, width] of the lit quad, metres (fartable.js builds it, atlas.js maps the
// pools and the balls' shadows onto it)
export const FAR_BED = Object.freeze([2.08, 1.09]);
// the glass of a far shade, top of the cone -> rim (sRGB): saturated amber, brightest at the rim
export const FAR_SHADE = Object.freeze([[0, '#7a2e08'], [0.45, '#d0641a'], [0.88, '#ffa63c'], [1, '#ffb24a']]);

// The lit back panel of a display row, FOOT (just over the strip) to TOP: [position 0..1, sRGB colour]. Amber at the strip,
// then deep orange and dark stained wood as the light falls off up the panel: the upper part of a row, where no bottle
// stands, is dark, so a row reads as a recess with light at the back of the shelf and not as a blank light box.
export const SHELF_GLOW = Object.freeze([[0, '#ffd9a0'], [0.1, '#f6bc70'], [0.26, '#d08238'], [0.48, '#8e4e1e'], [0.74, '#5c3418'], [1, '#4a2c16']]);
// Along a bay the panel is not even either: the light stands in POOLS (small uplights at the back of the shelf), at these
// fractions of the bay's clear width, each a bell of this width; between two pools the panel keeps `base` of its level.
// atlas.js paints the panel with it and bar.js lights each bottle by where it stands: a bottle in a pool glows in its
// liquid's colour, a bottle between two pools is a dark shape with a lit rim.
export const SHELF_POOLS = Object.freeze({ at: [0.23, 0.77], width: 0.2, base: 0.38 });
/** How much of the panel's light stands behind a point at fraction u (0..1) of a bay: `base` .. 1. */
export function shelfPool(u) {
  let m = 0;
  for (const c of SHELF_POOLS.at) m = Math.max(m, Math.exp(-(((u - c) / SHELF_POOLS.width) ** 2)));
  return SHELF_POOLS.base + (1 - SHELF_POOLS.base) * m;
}

// The bottle palette, as the light of the lit panel comes THROUGH each bottle (the glass material adds it as emission):
// [liquid, the glass above the fill line, cap (dark: a cap passes no light), paper band (false | a plain dark colour: paper
// passes no back light), fill line 0..0.9 of the bottle's height (default 0.8)]. Saturated liquids (what is left of a bottle
// behind the lens is its colour), tinted glass above the fill line instead of cream, and four DARK bottles (thick dark
// glass passes next to nothing: a silhouette with a coloured rim against the lit panel).
// Plain colours and plain bands: no label design, no words, no marks.
export const BOTTLES = Object.freeze([
  // the ambers and browns a back bar is mostly made of
  ['#ff9a1e', '#b8641a', '#151210', '#3a2c1c'], ['#f08a14', '#b06420', '#2a1808', false], ['#e0700c', '#a85a1c', '#3a2a10', '#241c18'],
  ['#c8480a', '#8a3c14', '#1c1c1c', '#4a1a14'], ['#ffc42e', '#c89a34', '#40300c', false], ['#a83c08', '#7a3410', '#101010', false],
  // the accents: one bottle each of a green, a red, a blue, a yellow-green, a rose, a violet and a pale aqua glass
  ['#18b044', '#149040', '#1a1410', false], ['#e8141c', '#a82a22', '#201010', false], ['#1a78f0', '#2a6ac0', '#202428', false],
  ['#c0d820', '#98a82c', '#283010', false], ['#f04c62', '#b84a58', '#30241c', false], ['#8a48d8', '#6a44a0', '#241c22', false],
  ['#7cc6d6', '#6aaaba', '#30343a', '#1c2a3a'],
  // dark glass: next to no light comes through (a silhouette against the panel; the rim and the glint draw it)
  ['#0c3a18', '#0c3a18', '#181410', false], ['#3a1806', '#3a1806', '#101010', '#6a5a40'], ['#0c1a4a', '#0c1a4a', '#14141c', false], ['#120c0a', '#120c0a', '#3a2a10', false],
  // a part-empty bottle: the same liquid with the fill line lower
  ['#ff9a1e', '#a86220', '#151210', false, 0.42],
]);
// How often each column of the palette is drawn (bar.js picks a bottle's colour from this list): the six ambers three times
// each, the four dark glasses twice, the seven accents and the part-empty bottle once. A back bar is mostly amber and brown
// with a few coloured bottles; drawn evenly, the accents made a shelf of sweets.
export const BOTTLE_PICK = Object.freeze([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 7, 8, 9, 10, 11, 12, 13, 13, 14, 14, 15, 15, 16, 16, 17]);
// an empty glass in front of the lit panel: it passes the panel's light (top = the rim, bottom = the thick base)
export const GLASSWARE = Object.freeze([[0, '#f0c890'], [0.08, '#b07c40'], [0.8, '#9a6a34'], [1, '#e0a860']]);

// colours of the emitters ([name, sRGB colour]; atlas.js adds them to its swatches)
export const EMIT_COLORS = Object.freeze([
  ['strip', '#ffcf8c'], ['candle', '#d8742a'], ['bulb', '#ffe4b4'], ['hot', '#ffffff'], ['bankerGreen', '#1c7a44'], ['dimWarm', '#6a4320'],
  ['flame', '#ffc878'], ['filament', '#ffd49a'], ['pilotRed', '#ff3a1c'], ['pilotGreen', '#10a048'], ['pilotAmber', '#dc861a'], ['dial', '#e89a3c'], ['niche', '#e0a060'],
  ['fairy', '#ffd9a0'],
]);

/** sRGB hex colour -> scene-linear [r, g, b]. */
export function linearOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
}
// The glass material (props.js GLASS_FRAGMENT). `facing` = N.V.
//   body:  the transmitted light, emission x mix(floor, 1, pow(saturate((facing - lo) / (hi - lo)), power)): full in the
//          middle of the silhouette and falling toward the outline, so a bottle shades like a cylinder of liquid and not
//          like a flat cut-out (round 2: power 1.6, which left a narrow lit core and a pale average behind the lens)
//   rim:   the back light bent round the outline through the liquid: a thin line of the bottle's own colour at grazing
//          angles, rimLevel x smoothstep(rimLo, rimHi, 1 - facing) (a share of the full transmitted light)
//   key:   the highlight of the room's key light (the table lamp) on the glass: a vertical streak, keyLevel x pow(cos, keyPower)
//   glint: the same light where the glass turns up toward it (the shoulder, normal.y in glintLo .. glintHi): a spot a few
//          millimetres across at a point source's level, on the bottles that carry a glint (the kit's second shade channel).
//          Behind the lens each is a small disc; sharp, a sparkle.
export const GLASS_EDGE = Object.freeze({
  floor: 0.05, lo: 0.1, hi: 1.0, power: 1.1, rimLo: 0.45, rimHi: 0.8, rimLevel: 0.85, keyLevel: 0.6, keyPower: 120,
  glintLevel: 12, glintPower: 80, glintLo: [0.18, 0.3], glintHi: [0.46, 0.62],
});
// how much lit panel stands behind a bottle on the shelves, foot -> top (the kit's baked shade of the glass batch): the panel
// falls off up the row (SHELF_GLOW), and so does the light through the bottle; the neck is drawn by the rim and the highlight
export const GLASS_UP = Object.freeze([1.0, 0.45]);
// the bottom display row, which a low eye sees only above the front counter's top: `reach` = the share of the panel gradient
// (from its foot) spread over the whole row (a taller light), `up` = the light through a bottle at its top (GLASS_UP[1] there)
export const LOW_ROW = Object.freeze({ reach: 0.6, up: 0.75 });
/** The body falloff in plain arithmetic (the shader text in props.js is built from GLASS_EDGE). */
export function glassFacing(facing, power = GLASS_EDGE.power) {
  const t = Math.min(1, Math.max(0, (facing - GLASS_EDGE.lo) / (GLASS_EDGE.hi - GLASS_EDGE.lo)));
  return GLASS_EDGE.floor + (1 - GLASS_EDGE.floor) * t ** power;
}
/** The rim term in plain arithmetic. */
export function glassRim(facing) {
  const t = Math.min(1, Math.max(0, (1 - facing - GLASS_EDGE.rimLo) / (GLASS_EDGE.rimHi - GLASS_EDGE.rimLo)));
  return GLASS_EDGE.rimLevel * t * t * (3 - 2 * t);
}

// ---- round 2's values, for the tool switch `clubprops=r2` (shelves:r2 | far:r2): same-tree on / off pictures -----------------
export const R2 = Object.freeze({
  // the panel: a cream wash, even along the bay
  SHELF_GLOW: Object.freeze([[0, '#ffe9c6'], [0.14, '#f6d6a6'], [0.34, '#d9a970'], [0.58, '#a87646'], [0.8, '#6e4a2a'], [1, '#4a301c']]),
  strip: '#ffdcae', niche: '#e2b47c',
  // the palette: paler liquids, cream glass above the fill line, cream paper bands
  BOTTLES: Object.freeze([
    ['#d98a2b', '#dcaa70', '#151210', '#857454'], ['#3f7a3a', '#5f9a56', '#1a1410', false], ['#c8301c', '#dca878', '#201010', false],
    ['#8a4a16', '#d4a66c', '#3a2a10', '#857454'], ['#e8b83a', '#deb478', '#40300c', false], ['#e8c088', '#dcaa70', '#1c1c1c', '#857454'],
    ['#4f9ac8', '#8fc0dc', '#202428', false], ['#5a2e10', '#70401a', '#101010', false], ['#ee7a1a', '#dcaa70', '#2a1808', false],
    ['#e88a7a', '#dcaa84', '#30241c', '#857454'], ['#1f5a2c', '#2f6f3a', '#181410', false], ['#c99a3a', '#d6ac70', '#2a2010', false],
    ['#d98a2b', '#dcaa70', '#151210', false, 0.34], ['#8a4a16', '#d4a66c', '#3a2a10', '#857454', 0.5], ['#c8301c', '#dca878', '#201010', false, 0.42],
    ['#3f7a3a', '#5f9a56', '#1a1410', false, 0.45], ['#5a2e10', '#8a6a4a', '#101010', '#857454', 0.4], ['#b06a9a', '#d8a898', '#241c22', false, 0.58],
  ]),
  fill: 0.74, band: [0.2, 0.46],
  GLASS: 0.92, GLASS_UP: Object.freeze([1.0, 0.3]), power: 1.6,
  // the second table: one flat radial gradient on the cloth, dull shades, lit balls
  FAR: Object.freeze({ cloth: 0.38, cushion: 0.3, shade: 0.3, farBulb: 0.9, ballShade: 0.55 }),
  FAR_CLOTH: Object.freeze([[0, '#66b282'], [0.35, '#559a6e'], [0.75, '#3e7652'], [1, '#33684a']]),
  FAR_SHADE: Object.freeze([[0, '#7a4a1e'], [0.45, '#c98a48'], [0.9, '#f0c890'], [1, '#f6d8a8']]),
  FAR_BALLS: Object.freeze([
    ['ballCue', -0.52, 0.18], ['ball1', 0.31, -0.22], ['ball3', 0.44, 0.12], ['ball5', 0.08, 0.3], ['ball2', -0.2, -0.3],
    ['ball8', 0.62, -0.06], ['ball6', -0.74, -0.14], ['ball7', 0.2, 0.02],
  ]),
});
