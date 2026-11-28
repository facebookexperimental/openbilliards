// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/floor/paint.js — the two small canvases of the floor's furniture (owner: floor). No three import: SWATCHES and the
// layout are plain data (the node arm reads them); the painters need a 2D canvas only when they are called.
//
//   colour   256 x 256: flat swatches (one colour per cell: a primitive samples the middle of its cell, so no mip level ever
//            mixes two cells) and, in the lower half, the three soft shapes of the shadow overlays (multiplied over the
//            carpet: white = no change);
//   data     the same cells: green = roughness, blue = metalness (three's own channels for roughnessMap / metalnessMap), so
//            one material draws rubber, satin paint, anodised aluminium, chrome and coated glass; red = the emissive mask
//            (the material's emissive colour is pure red, so red x mask is the lit tally lamp and nothing else glows).
// Nothing here is a word, a logo, a number or a picture: flat colours and three radial ramps. A camera's label is a blank
// plate (the `label` swatch).

//
// THE ALBEDO LAW (CONTRACT 15.2, round A3). A swatch that belongs to a material class of arena/layout.js ALBEDO is not a
// free colour: it is a TONE (relative linear red, green, blue: the finish's shade and hue within its class) and the
// painter scales the class so that the MEAN diffuse reflectance over what is built lands on the table's value:
//   mean = sum(share x luminance(k x tone)) x SHADE = ALBEDO   ->   k per class
// `share` = the swatch's share of the class's built area (measured by the arm on the high room and pinned there within a
// tolerance); SHADE = the mean of the baked vertex shade over the class (the kit's contact darkening multiplies the
// albedo, so it is part of the mean; measured and pinned by the arm too). Black finishes are DIELECTRICS at their real
// albedo (round A2 gave them a metal share to hide the 4 % glare of a dielectric under five times too much light: with
// the hall's levels down to the real ones, that glare is the sheen a matt black camera shows its form by).
import { ALBEDO } from '../layout.js';

const num = (v, d) => (Number.isFinite(v) && v > 0 ? v : d);
/** The class values this part builds to (the layout's table; CONTRACT 15.2 when a row is missing). */
export const CLASS_ALBEDO = Object.freeze({
  black: num(ALBEDO?.camera, 0.04),         // camera bodies, pedestals, the stool's pad, gaffer tape, the side tables' laminate
  cloth: num(ALBEDO?.refereeCloth, 0.04),   // the cloth of the table by the boards
  leather: num(ALBEDO?.leather, 0.06),      // the players' chairs
  deck: num(ALBEDO?.deck, 0.10),            // the camera platforms' deck and kick rail: dark painted board
  nosing: num(ALBEDO?.nosing, 0.45),        // the pale strip on a platform's step-up side
});
// the mean baked vertex shade over each class's built surface (the arm measures it on the high room and pins it)
// (round A4, geometry revision 6: the cameras' cables, ties and finder hoods are rubber; the desk's folds are uneven)
// (the cloth: built 0.8989; written 0.9015 because the swatch is one 8-bit colour, and a step of it is 2.3 % of the
// mean: at 0.9015 the rounded swatch lands the built mean on 0.0396)
export const CLASS_SHADE = Object.freeze({ black: 0.9554, cloth: 0.9015, leather: 0.8685, deck: 0.9906, nosing: 1 });
// what the club's leather colour file holds (web/assets/club/leather-color.jpg, 1024 px): its linear mean, measured
// offline (sips to BMP, sRGB decoded; scratch/floor/lin.mjs of the lane). The high room multiplies the map by
// ALBEDO.leather / (this luminance x SHADE) so the chair's mean lands on the table's value.
export const LEATHER_FILE_MEAN = Object.freeze({ rgb: Object.freeze([0.0804, 0.0285, 0.0126]), luminance: 0.0384 });

// name: [sRGB hex | { cls, tone: [r, g, b], share }, roughness, metalness, emissive mask (0 or 1; default 0)]
const SPEC = {
  housing: [{ cls: 'black', tone: [1.0, 1.0, 1.04], share: 0.2137 }, 0.50, 0], // camera housings: matt black paint, a slight sheen
  lens: [{ cls: 'black', tone: [1.22, 1.23, 1.28], share: 0.1423 }, 0.44, 0],  // the box lens: a shade lighter, a little glossier
  rubber: [{ cls: 'black', tone: [0.62, 0.62, 0.62], share: 0.2883 }, 0.92, 0], // hood, grips, bumpers, wheels, cables, ties, the finder's hood
  skirt: [{ cls: 'black', tone: [0.86, 0.86, 0.89], share: 0.1803 }, 0.60, 0], // the pedestal's skirt: moulded, matt
  column: [{ cls: 'black', tone: [1.3, 1.31, 1.36], share: 0.1652 }, 0.38, 0], // black anodised parts: column, plates, bars
  label: [{ cls: 'black', tone: [1.9, 1.9, 1.95], share: 0.0102 }, 0.45, 0],   // a blank plate
  top: [{ cls: 'black', tone: [1.1, 1.1, 1.12], share: 0 }, 0.44, 0],          // the side table's top: black laminate, satin (at 0.30 its rim stood at 231 and 239 in the TV pose under A4's floods: shots/floor/f5-CAM.jpg)
  pad: [{ cls: 'black', tone: [0.95, 0.95, 0.95], share: 0 }, 0.78, 0],        // the stool's pad: black vinyl, matt (at 0.55 its top stood over the deck's level in the app: shots/floor/b8-CAM.jpg, 44 against 34)
  tape: [{ cls: 'black', tone: [0.8, 0.8, 0.8], share: 0 }, 0.95, 0],          // gaffer tape: a matt cloth tape
  cloth: [{ cls: 'cloth', tone: [0.97, 1.0, 1.08], share: 1 }, 0.96, 0],       // the desk's cloth: black cotton, a cool cast
  // (round A7: roughness 0.5 -> 0.66. The base room's west chair is upholstered in this cell on plain faces: at 0.5
  // its arm tops and seat stood as white patches from the far end, 127 to 135 with a peak of 238 on a bed of 132,
  // shots/floor/a7a3-CAM.jpg; the base room's leather material itself stands at 0.6 since round A5 for the same reason)
  leatherFlat: [{ cls: 'leather', tone: [2.09, 0.74, 0.33], share: 1 }, 0.75, 0],  // the chairs without a leather map (the lite room's; the base room's west chair): the file's hue
  deck: [{ cls: 'deck', tone: [1.0, 1.0, 1.03], share: 1 }, 0.8, 0],           // deck board and kick rail under a dark grey deck paint
  nosing: [{ cls: 'nosing', tone: [1.0, 1.0, 0.97], share: 1 }, 0.85, 0],      // the pale anti-slip strip
  // (round A4: the two mirrors of the part come down. A3's chrome stage reached 210 of 255 and its lens glass 238 to 253
  // in a few pixels against a bed mean of 135: a small highlight stays, nothing of this part stands over the bed's peak.
  // The first A4 frame, shots/floor/f1-V10.jpg, still had the glass at 252 in one pixel, the stage at 223 and the bare
  // scaffold tube at 223 against a bed peak of 240 to 244: a second step down, and the tube is behind a skirt now. The
  // glass took a third: at roughness 0.10 one pixel of the east camera's still stood at 253, shots/floor/f2-V10.jpg)
  // (ROUND A7, CONTRACT 19.1: the metals at their REAL reflectance. Every lit material of the part reads the HALL's
  // baked cube through the env service's handle (floor.js: the tag `clubHall`), a picture of the hall from the hall,
  // so a metal mirrors the carpet, the boards and the stands it stands among. The mid greys of rounds A4 to A6
  // (chrome 0.12, aluminium 0.25, steel 0.18, brass 0.21, brushed steel 0.25) were DARKENED METALS: they kept the
  // mirror image of the app's cube, a picture from 11.5 cm over the cloth, under the bed's peak. They are deleted.)
  chrome: ['#c3c6c9', 0.32, 1],        // the column's inner stage, chair glides, a case's latches, a cart's frame: satin chrome plate (0.55)
  alu: ['#cdd0d2', 0.42, 1],           // brushed aluminium: thresholds, a flight case's edge extrusions, a stand's inner tube (0.62)
  steel: ['#a6a8ab', 0.52, 1],         // galvanised box section and tube: platform frames, scaffold tube, the stool (0.38)
  // (round A6: under the work lamps the lens's highlight peaks at 84 and 153 at V10, far under the bed's 247:
  // shots/floor/q1-V10.jpg. The value stays A5's.)
  glass: ['#1c2838', 0.20, 1],       // the lens's front element: the coating's tint, a mirror for the lit table (round A5: 0.16 -> 0.20; at 0.16 its highlight stood at 238 on 2 px in the close frame shots/floor/h4-CAM.jpg, ten levels under the bed's peak)
  screen: ['#06070a', 0.10, 0],        // the finder's dark screen
  tallyOff: ['#3d0a07', 0.25, 0],      // an unlit tally lamp
  tally: ['#5c0d08', 0.25, 0, 1],      // a lit one's core: the same lamp, the cell with the full emissive mask
  tallyRim: ['#4a0b07', 0.25, 0, 0.3], // a lit one's rim: the diffuser round the core, at three tenths of the core's level
  tray: ['#6b4226', 0.36, 0],          // the ball tray: lacquered mahogany (albedo 0.07)
  lining: ['#39424d', 0.97, 0],        // its felt lining (albedo 0.05)
  wood: ['#9a6c40', 0.40, 0],          // the rack triangle, the rest's shaft: lacquered maple (albedo 0.18)
  brass: ['#c4a058', 0.34, 1],         // the rest's bridge: lacquered brass (0.37)
  // stainless steel, brushed, at its real reflectance (0.55): the ice bucket and the steel bottle, on the hard material
  // of every room (round A7: it reads the hall's cube, which holds the carpet and the boards under its horizon; on
  // the app's cube in round A6 the wall stood at 0 to 2 of 255 from above and its inner wall at 251,
  // shots/floor/m11-CAM.jpg, m4-CAM.jpg, and the steel was a mid grey of 0.25. The cell stands where `bottle` stood,
  // a darkened steel of round A4 that nothing draws any more)
  steelBrushed: ['#c4c5c6', 0.45, 1],
  // (round A5: the towel over a chair's arm stands at 101 with a peak of 176 at V10 under the east key,
  // shots/floor/k1-V10.jpg [1242,372 12x8]: far under the bed's peak; the white spot on that chair is the leather)
  towel: ['#b2b0ab', 0.96, 0],         // a folded towel: off-white cotton (albedo 0.44)
  chalk: ['#2c5f9e', 0.92, 0],         // a cube of chalk
  chalkWrap: ['#141c2c', 0.7, 0],      // its paper band, blank
  piping: ['#120d0a', 0.5, 0],         // a seam's shadow line, a crease's floor
  wear: ['#8c7354', 0.85, 0],          // a deck's paint worn through to the plywood (albedo 0.18)
  cover: ['#6d7278', 0.45, 0],         // a camera's rain cover, folded: grey coated nylon (albedo 0.17)
  // ---- round A5, the dress of the playing floor (five cells in the free strip under the shadow shapes: cellOf)
  // (roughness 0.08 -> 0.12 at the final frames: the bin's liner drew one pixel at 244 against a bed peak of 247 in
  // BACK, shots/floor/k4-CAM.jpg; nothing of this part stands over the bed's peak)
  water: ['#6c7882', 0.12, 0],         // a clear bottle of water, a glass: what a clear thing shows of a lit hall from across it (a pale cool grey under a hard gloss; albedo 0.18)
  capGreen: ['#2f7d4f', 0.6, 0],       // a bottle's cap, green (the other bottle's is the chalk's blue)
  glowScreen: ['#07080a', 0.28, 0],    // a screen that is on and shows nothing: black glass with a dim glow (GLOW)
  glowBar: ['#0a0b0c', 0.28, 0],       // a plain level bar on such a screen (GLOW)
  // (round A7: the cell `satin` is DELETED. It drew the ice bucket in rounds A5 and A6: a grey body without the metal
  // flag, a stand-in for the mirror image a steel wall had no cube for. The bucket is `steelBrushed` below.)
  // ---- round A6 (CONTRACT 18: the last stand-ins). Five more cells in the same strip (its cells are 16 px wide now).
  glowLamp: ['#0b0b0a', 0.3, 0],       // a work lamp's lit opening: a dark diffuser that glows (GLOW)
  // clear glass, for the high room's BLENDED material only (floor.js `arena.floor.bright`; ALPHA below): a nearly black
  // body, so what the shell adds to the frame is its highlight and its mirror image of the hall over the scene behind
  // it, dimmed by its alpha. `glassThick` is the same glass seen through more of it: a tumbler's base, a bottle's lip
  glassThin: ['#0c1210', 0.05, 0],
  glassThick: ['#0e1714', 0.06, 0],
  // (round A7: brushed steel left this strip for the table above: `steelBrushed`)
  // an opaque dark bottle glass for the rooms without the blended material (the base room, 8 of 8 draw calls): green
  // glass under a hard gloss, which shows the lamps as a clear highlight (albedo 0.012)
  bottleGlass: ['#12241b', 0.07, 0],
  // a bottle's green glass, for the blended material (ALPHA): thicker and tinted, so a bottle reads as a bottle where
  // a tumbler's wall is nearly nothing (at the tumbler's alpha the bottle was invisible and its cap floated: the dev
  // page's first picture of the set, shots/floor/d1.jpg)
  glassBottle: ['#0f2a1c', 0.06, 0],
  // ---- round A7 (CONTRACT 19.3: tape that reads as tape). Spike tape: a matt cloth tape in a muted yellow (albedo
  // 0.25: twice the island's carpet, half of the pale strips of rounds A5 and A6, which read as stray white dashes)
  spike: ['#9c883c', 0.95, 0],
  // ---- round A8 (CONTRACT 20.2 row 2: the low camera reads as a camera, by material). The strip's last two cells.
  // `body`: the remote head's casting (body, cover plate, yoke, pan drum) under a light grey powder coat, matt as
  // `pad` (albedo 0.43; the towel stays the palest thing of the part). `zoom`: its zoom's front, the summed
  // reflection of a stack of coated surfaces (0.13, a coating's green cast) where `glass` is ONE coating's 1 to 4 %.
  // Roughness 0.12: at 0.20 the lamp's glint in it peaked at 52 at the TV pose, shots/floor/a8a2-CAM.jpg, a dark
  // disc. The stand cameras keep `glass`: their glints peak at 79 and 130 at V10 already (sheets a7-V10).
  body: ['#adafb1', 0.78, 0],
  zoom: ['#5b675d', 0.12, 1],
};
// ROUND A6: the cells whose colour canvas pixels carry an alpha under 1. Only a BLENDED material reads it (three sets
// the alpha of an opaque material to 1 before anything else): the hard material draws these cells as it draws any other.
export const ALPHA = Object.freeze({ glassThin: 0.09, glassThick: 0.4, glassBottle: 0.32 });
// ROUND A5: what glows. Per swatch, linear red, green, blue as a share of the tally's level (floor.js FLOOR_LEVELS.tally:
// the hard material's emissive colour is white at that level and its emissive map is the glow canvas below, black in
// every other cell). The tally's two cells are round A4's masks (pure red: the hall's one red point). The two screen
// cells are dim and neutral: a monitor that shows black (about 27 of 255 by arithmetic: 0.012 x 1.3 x 0.73) and a plain
// level bar on it (about 105 of 255: under the hung screens' 95 to 130 and far under the bed).
// (round A6: a work lamp's lit opening, at the tally's level in the lamp's own warm white: 1.3 scene-linear, a white
// dot under the post chain's bloom threshold. The lamp's LIGHT is the light role's bake emitter, not this cell.)
export const GLOW = Object.freeze({ tally: Object.freeze([1, 0, 0]), tallyRim: Object.freeze([0.3, 0, 0]), glowScreen: Object.freeze([0.012, 0.014, 0.017]), glowBar: Object.freeze([0.15, 0.16, 0.15]),
  // (round A7: NO cell for a lens's front element. Round A6 lit it with a constant, 3, 4 and 6 of 255 x 1.3, a
  // stand-in for a mirror image; the constant is DELETED: the lens is a coated mirror on the hard material and shows
  // the hall's cube. Nothing in this table stands in for a reflection.)
  glowLamp: Object.freeze([1, 0.9, 0.74]) });

const LUM = [0.2126, 0.7152, 0.0722];
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hex2 = (v) => Math.max(0, Math.min(255, Math.round(255 * toSrgb(v)))).toString(16).padStart(2, '0');
/** The linear red, green, blue of an sRGB hex colour. */
export function linearOf(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => toLinear(c / 255)); }
export const luminance = (rgb) => LUM[0] * rgb[0] + LUM[1] * rgb[1] + LUM[2] * rgb[2];

/** The scale of a class: what its tones are multiplied by so the built mean (shares, shade) lands on the class value. */
export function classScale(cls) {
  let lum = 0, share = 0;
  for (const [c] of Object.values(SPEC)) if (typeof c === 'object' && c.cls === cls && c.share > 0) { lum += c.share * luminance(c.tone); share += c.share; }
  return CLASS_ALBEDO[cls] / ((lum / share) * CLASS_SHADE[cls]);
}

/** name -> the swatch's class (null: a free colour: a metal, glass, wood, a small coloured thing). */
export const SWATCH_CLASS = Object.freeze(Object.fromEntries(Object.entries(SPEC).map(([name, [c]]) => [name, typeof c === 'object' ? c.cls : null])));
/** name -> its designed share of its class's built area (0: the same material on another item; not in the class's scale). */
export const SWATCH_SHARE = Object.freeze(Object.fromEntries(Object.entries(SPEC).map(([name, [c]]) => [name, typeof c === 'object' ? c.share : 0])));

// name: [sRGB hex, roughness, metalness, emissive mask]: what the painters and the arm read
export const SWATCHES = Object.freeze(Object.fromEntries(Object.entries(SPEC).map(([name, [c, rough, metal, glow = 0]]) => {
  if (typeof c === 'string') return [name, Object.freeze([c, rough, metal, glow])];
  const k = classScale(c.cls);
  return [name, Object.freeze([`#${c.tone.map((t) => hex2(k * t)).join('')}`, rough, metal, glow])];
})));
/** The diffuse albedo a swatch gives a surface (linear luminance; a metal has none). */
export function albedoOf(name) { const [hex, , metal] = SWATCHES[name]; return luminance(linearOf(hex)) * (1 - metal); }

// (round A5: `extraY`, `extraH`, `extraCols`: up to six more cells in the strip under the `blob` and `box` shapes, left of
// `cast`: the LOWER half of that strip, so a white band of 16 px lies between a shape and a cell's colour and no mip level
// an overlay is drawn at mixes the two. A swatch is sampled at ONE point, the middle of its cell, at mip level 0.)
// (round A6: the strip's cells are `extraW` = 16 px wide, twelve of them in the same 192 px; a swatch is one point)
export const ATLAS = Object.freeze({ size: 256, cell: 32, cols: 8, shadowY: 128, shadow: 96, extraY: 240, extraH: 16, extraW: 16, extraCols: 12 });
const ROW_CELLS = ATLAS.cols * (ATLAS.shadowY / ATLAS.cell);
/** The cell of the i-th swatch as [x, y, w, h] in pixels. */
function cellOf(i) {
  const c = ATLAS.cell;
  return i < ROW_CELLS ? [(i % ATLAS.cols) * c, Math.floor(i / ATLAS.cols) * c, c, c] : [(i - ROW_CELLS) * ATLAS.extraW, ATLAS.extraY, ATLAS.extraW, ATLAS.extraH];
}
// the soft shapes of the shadow overlays: [x, y, w, h] in pixels
export const SHADOW_REGION = Object.freeze({ blob: [0, 128, 96, 96], box: [96, 128, 96, 96], touch: [192, 128, 64, 64], cast: [192, 192, 64, 64] });
// what an overlay multiplies the carpet by at its darkest (sRGB levels of 255)
export const SHADOW_LEVEL = Object.freeze({ blob: 112, box: 104, touch: 168, cast: 150 });

const NAMES = Object.keys(SWATCHES);

/** The middle of a swatch's cell as [u, v] (v from the bottom, the way a flipped canvas texture is sampled). */
export function swatchUV(name) {
  const i = NAMES.indexOf(name);
  if (i < 0 || i >= ROW_CELLS + ATLAS.extraCols) throw new Error(`no swatch called ${name}`);
  const [x, y, w, h] = cellOf(i);
  return [(x + w / 2) / ATLAS.size, 1 - (y + h / 2) / ATLAS.size];
}

/** The swatch whose cell holds the atlas point (u, v): the albedo ledger reads a built triangle's finish back with it. */
export function swatchAt(u, v) {
  const k = ATLAS.size / ATLAS.cell;
  const col = Math.min(ATLAS.cols - 1, Math.max(0, Math.floor(u * k))), row = Math.max(0, Math.floor((1 - v) * k));
  if ((1 - v) * ATLAS.size >= ATLAS.extraY) return NAMES[ROW_CELLS + Math.min(ATLAS.extraCols - 1, Math.max(0, Math.floor((u * ATLAS.size) / ATLAS.extraW)))] ?? 'none';
  return row * ATLAS.cols + col < ROW_CELLS ? NAMES[row * ATLAS.cols + col] ?? 'none' : 'none';
}

/** A shadow region as [u0, v0, u1, v1], inset by `inset` pixels. */
export function regionUV(name, inset = 2) {
  const r = SHADOW_REGION[name];
  if (!r) throw new Error(`no shadow region called ${name}`);
  const S = ATLAS.size;
  return [(r[0] + inset) / S, 1 - (r[1] + r[3] - inset) / S, (r[0] + r[2] - inset) / S, 1 - (r[1] + inset) / S];
}

const grey = (v) => `rgb(${v},${v},${v})`;

/** Paint the colour canvas. Returns { canvas, w, h, bytes }. */
export function paintColour() {
  const S = ATLAS.size, c = ATLAS.cell;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  void c;
  NAMES.forEach((name, i) => { g.fillStyle = SWATCHES[name][0]; g.fillRect(...cellOf(i)); });
  // (round A6: the cells of ALPHA are cleared and filled again at their alpha: the canvas holds colour and alpha there)
  for (const [name, a] of Object.entries(ALPHA)) {
    const cellAt = cellOf(NAMES.indexOf(name)), v = parseInt(SWATCHES[name][0].slice(1), 16);
    g.clearRect(...cellAt);
    g.fillStyle = `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
    g.fillRect(...cellAt);
  }
  // the soft shapes: a radial ramp from the darkest level to white; the box is a ramp across one axis with round ends
  const radial = (name, stops) => {
    const [x, y, w, h] = SHADOW_REGION[name];
    const gr = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w / 2 - 1);
    for (const [t, v] of stops) gr.addColorStop(t, grey(v));
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  };
  radial('blob', [[0, SHADOW_LEVEL.blob], [0.42, SHADOW_LEVEL.blob + 34], [0.8, 236], [1, 255]]);
  radial('touch', [[0, SHADOW_LEVEL.touch], [0.4, SHADOW_LEVEL.touch + 26], [0.78, 238], [1, 255]]);
  radial('cast', [[0, SHADOW_LEVEL.cast], [0.5, SHADOW_LEVEL.cast + 30], [0.82, 240], [1, 255]]);
  {
    // the box: dark in the middle half, falling to white over the outer quarter on every side
    const [x, y, w, h] = SHADOW_REGION.box, q = w / 4;
    g.fillStyle = grey(SHADOW_LEVEL.box); g.fillRect(x + q, y + q, w - 2 * q, h - 2 * q);
    const ramp = (x0, y0, x1, y1, rx, ry, rw, rh) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, grey(SHADOW_LEVEL.box)); gr.addColorStop(0.55, grey(214)); gr.addColorStop(1, grey(255)); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
    ramp(x + q, 0, x + 1, 0, x, y + q, q, h - 2 * q);
    ramp(x + w - q, 0, x + w - 1, 0, x + w - q, y + q, q, h - 2 * q);
    ramp(0, y + q, 0, y + 1, x + q, y, w - 2 * q, q);
    ramp(0, y + h - q, 0, y + h - 1, x + q, y + h - q, w - 2 * q, q);
    for (const [cx, cy, rx, ry] of [[x + q, y + q, x, y], [x + w - q, y + q, x + w - q, y], [x + q, y + h - q, x, y + h - q], [x + w - q, y + h - q, x + w - q, y + h - q]]) {
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, q - 1);
      gr.addColorStop(0, grey(SHADOW_LEVEL.box)); gr.addColorStop(0.55, grey(214)); gr.addColorStop(1, grey(255));
      g.fillStyle = gr; g.fillRect(rx, ry, q, q);
    }
  }
  return { canvas, w: S, h: S, bytes: Math.round(S * S * 4 * 1.34) };
}

/** Paint the data canvas (red = emissive mask, green = roughness, blue = metalness per cell). Returns { canvas, w, h, bytes }. */
export function paintData() {
  const S = ATLAS.size, c = ATLAS.cell;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgb(0,230,0)'; g.fillRect(0, 0, S, S);
  NAMES.forEach((name, i) => {
    const [, rough, metal, glow = 0] = SWATCHES[name];
    g.fillStyle = `rgb(${Math.round(255 * Math.max(0, Math.min(1, glow)))},${Math.round(255 * rough)},${Math.round(255 * metal)})`;
    g.fillRect(...cellOf(i));
  });
  void c;
  return { canvas, w: S, h: S, bytes: Math.round(S * S * 4 * 1.34) };
}

// the glow canvas: the atlas's cell layout at a quarter of its size (sampled unfiltered at a cell's middle, no mip levels)
export const GLOW_SIZE = 64;
/** ROUND A5: paint the glow canvas (GLOW: linear red, green, blue per cell; black everywhere else). Returns { canvas, w, h, bytes }. */
export function paintGlow() {
  const S = GLOW_SIZE, k = S / ATLAS.size;
  const canvas = document.createElement('canvas');
  canvas.width = S; canvas.height = S;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgb(0,0,0)'; g.fillRect(0, 0, S, S);
  for (const [name, rgb] of Object.entries(GLOW)) {
    const [x, y, w, h] = cellOf(NAMES.indexOf(name));
    g.fillStyle = `rgb(${rgb.map((v) => Math.round(255 * Math.max(0, Math.min(1, v)))).join(',')})`;
    g.fillRect(x * k, y * k, w * k, h * k);
  }
  return { canvas, w: S, h: S, bytes: S * S * 4 };
}

/**
 * The pixels of the stand-in for the club's leather map on the default tier (RGBA, sRGB, `size` x `size`, tiling): dark
 * brown aniline leather, mottled, with a pore grain. Pure arithmetic from a fixed seed (no canvas), so the arm reads the
 * same pixels the page draws; the pattern is scaled so that its LINEAR mean x CLASS_SHADE.leather lands on ALBEDO.leather.
 */
export function leatherPixels(size = 256) {
  let a = 0x51ed27 >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const n = size * size, level = new Float32Array(n).fill(1);
  // mottling: soft dark and light patches, wrapped so the pattern tiles
  for (let i = 0; i < 70; i++) {
    const cx = rnd() * size, cy = rnd() * size, r = 10 + rnd() * 34, gain = rnd() < 0.55 ? -0.30 : 0.22;
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      const k = (1 - d * d) * (1 - d * d);
      level[(((y % size) + size) % size) * size + (((x % size) + size) % size)] *= 1 + gain * k;
    }
  }
  // pores: short dark and light ticks
  for (let i = 0; i < 2600; i++) {
    const x = Math.floor(rnd() * size), y = Math.floor(rnd() * size), len = 1 + Math.floor(rnd() * 2), gain = rnd() < 0.6 ? 0.62 : 1.22;
    for (let k = 0; k < len; k++) level[y * size + ((x + k) % size)] *= gain;
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += level[i];
  mean /= n;
  // the hue of the club's leather file; the mean on the table's value
  const hue = LEATHER_FILE_MEAN.rgb.map((c) => c / LEATHER_FILE_MEAN.luminance);
  const k = CLASS_ALBEDO.leather / CLASS_SHADE.leather / mean;
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) data[4 * i + c] = Math.round(255 * toSrgb(Math.min(1, level[i] * k * hue[c])));
    data[4 * i + 3] = 255;
  }
  return data;
}

/** The linear mean (red, green, blue, luminance) of RGBA sRGB pixels. */
export function linearMean(data) {
  const s = [0, 0, 0], n = data.length / 4;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) s[c] += toLinear(data[4 * i + c] / 255);
  const rgb = s.map((v) => v / n);
  return { rgb, luminance: luminance(rgb) };
}

/** The stand-in for the club's leather map on the default tier, on a canvas (leatherPixels). */
export function paintLeather(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = `#${LEATHER_FILE_MEAN.rgb.map((c) => hex2((c / LEATHER_FILE_MEAN.luminance) * CLASS_ALBEDO.leather / CLASS_SHADE.leather)).join('')}`;
  g.fillRect(0, 0, size, size);
  const img = g.createImageData?.(size, size);
  if (img?.data?.set) { img.data.set(leatherPixels(size)); g.putImageData(img, 0, 0); }
  return { canvas, w: size, h: size, bytes: Math.round(size * size * 4 * 1.34) };
}
