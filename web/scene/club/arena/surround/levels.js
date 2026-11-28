// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/surround/levels.js — albedos, light levels, colours and surface numbers of the arena's surround (owner: surround).
// Pure data and arithmetic; its only import is the layout (pure too): surround.js, seat.js, paint.js, plan.js and the node
// arm (web/tools/club/test-club-arena-surround.mjs) read it.
//
// Round A3 (CONTRACT 15: real materials under real light levels). Three laws shape this file:
//   15.2  every surface carries the albedo of its material class (ALBEDO below, from the layout's table); a colour is a HUE
//         (the layout's PALETTE) brought to that albedo (withLuminance); nothing is darkened to fix a frame, and no painted
//         shade stands in for light (round A2's vertex shades on decks, frames, posts and seats are gone);
//   15.3  nothing is shown, hidden or dimmed by where the camera is. The lit rail is a real LED profile (plan.js BOARD.profile):
//         what a camera sees of it follows from the profile's section and from the emission law of an opal sheet, both
//         written below as arithmetic (slotView, opalLaw) and mirrored in the rail's shader (surround.js patchRail), which
//         reads the eye only through the surface's own view angle;
//   15.4  the seats are graphite.
// Round A4 (CONTRACT 16: the light of a real empty hall). The physics of round A3 stays; three things change here:
//   16.3  the boards carry their own light: LED panels (the face emits: BOARD_LED) or a front-lit print (PRINT, lit by the
//         wash under a deep cap), chosen by BOARDS.default; the other is a tool's arm (`?clubsurround=boards:print|led`);
//   16.4  the rail's profile is re-cut: a corner profile whose chamfer faces the playing floor, a slit of light on it,
//         at half of round A3's emission (RAIL below; plan.js BOARD.profile has the section);
//   the board frames' aluminium no longer takes the table's reflection cube as its picture of the hall (SURFACE.metal).
// Round A5 (CONTRACT 17: light with shape, and colour). Four things change here:
//   17.3  the seats are ONE muted colour, a real fabric albedo: OCHRE, chosen from a same-tree pair (SEATS; petrol and
//         graphite stay behind `?clubsurround=seats:<kind>`); the light on them is the light role's (warm floods whose
//         level follows this albedo);
//   the rail is drawn through a reconstruction filter (RAIL.filterPx): the same slit at the same level, without beads;
//   the LED faces have cabinets, hairline seams and an emission law (BOARD_LED.cabinetWidth, seam, pocket);
//   the real seat is sewn (plan.js SEAT, seat.js): a welt, a seam, a cushion, plates: geometry, no number of this file.
//
// Units. Levels are scene-linear radiance. In the arena's frames (exposure 0.92 under the filmic tone map; measured on app
// frames of rounds A1 and A2) an emissive level of 0.2 shows at about 170 of 255, 0.7 at about 234, 1.22 at 244 to 248, 1.9
// clips; the played bed stands at about 0.10 (124 to 146 of 255). The post chain's bloom (post/tune.js: threshold 1.35, its
// bright pass at half size) takes a texel whose mean over 2 x 2 pixels is over the threshold.
import * as LAYOUT from '../layout.js';

const lin = (b) => { const v = b / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const enc = (l) => Math.max(0, Math.min(255, Math.round(255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055))));
const rgbOf = (hex) => { const n = parseInt(String(hex).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/** The linear luminance (Rec.709 Y) of an sRGB hex colour: the mean diffuse reflectance a surface painted with it has. */
export const luminance = (hex) => { const [r, g, b] = rgbOf(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
/** The hue of `hex` at linear luminance `y`, as an sRGB hex colour (the method of web/scene/room.js "ROOM DRESSING ALBEDOS":
 * the authored colour stays as the hue, its level becomes the material class's). */
export function withLuminance(hex, y) {
  const c = rgbOf(hex).map(lin), y0 = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const out = y0 > 1e-6 ? c.map((v) => Math.min(1, (v * y) / y0)) : [y, y, y];
  return `#${out.map((v) => enc(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * THE ALBEDOS of the surround's surfaces (CONTRACT 15.2): mean diffuse reflectance, linear. The values are the layout's
 * (arena/layout.js ALBEDO, the light role's table); the literals are the contract's and stand in only if the table is absent.
 * Board frames, posts, nosing trims and the LED profile are metal: no diffuse albedo (their swatches are reflectances).
 */
const LA = LAYOUT.ALBEDO ?? {};

/**
 * THE SEATS' FABRIC (round A5, CONTRACT 17.3): one muted colour inside the palette's exclusions (no red, no violet),
 * as a REAL fabric albedo: a hue (sRGB hex) brought to the mean diffuse reflectance of that cloth (`albedo`, linear).
 * Three candidates are built from the same tree; `default` is the one the round's same-tree pair chose (the lane's
 * scratch/surround/SEAT-COLOUR.md has the frames and the numbers), the other two are the tool's arms
 * `?clubsurround=seats:petrol|ochre|graphite` (each with its own signature suffix: never baked).
 *   petrol    a deep petrol green wool-blend: hue about 190 degrees, muted (HSV saturation 0.5), albedo 0.065
 *   ochre     a muted mustard-gold (not orange, not red): hue about 48 degrees at an HSV saturation of 0.36, albedo
 *             0.18 (linear rgb 0.2135 / 0.1800 / 0.0813). THE CHOSEN ONE. The hue is set a little to the yellow side
 *             of gold because the house floods are warm (the light role's LEVELS-A5: 1.0 / 0.76 / 0.50): under them
 *             the cloth reads at about 41 degrees, a mustard-gold, where a 45 degree fabric would read 37 (amber).
 *             The tone curve steepens a dark colour's saturation: a fabric at 0.43 (#948854, frame s4) displayed at
 *             0.66 against the bed's 0.76, a neutral one (graphite, frame s3) at 0.25 under the same floods; 0.36
 *             sits between. (The first candidate, #9a8648 at 0.20, read as a saturated yellow beside the navy
 *             boards: frame s1.)
 *   graphite  round A4's neutral, slightly cool grey at 0.09 (the layout's round-A3 palette entry, held here as a
 *             literal: the layout's table follows the chosen colour)
 * `sheen`: the colour of the nap's sheen lobe: the fibre's own pale tint.
 * Why ochre (the pair: frames s2 petrol | s4 ochre | s3 graphite at V10 and V3, the same tree under the analytic A5
 * light): the stands are to sit in WARM light against a neutral island (CONTRACT 17.1); a warm fabric carries that
 * light and a petrol one swallows it (its red reflectance is a quarter of its blue: under the floods it showed
 * 41/64/56, a dark olive-teal beside navy boards and a blue bed: three cool surfaces); graphite under the same floods
 * is a sepia picture (80/72/60). The hall photographs show warm fabric under warm house light.
 */
export const SEATS = Object.freeze({
  kinds: Object.freeze(['petrol', 'ochre', 'graphite']),
  default: 'ochre',
  petrol: Object.freeze({ hue: '#2a4d54', albedo: 0.065, sheen: '#8fb0b5' }),
  ochre: Object.freeze({ hue: '#92875d', albedo: 0.18, sheen: '#d6cba0' }),
  graphite: Object.freeze({ hue: '#525559', albedo: 0.09, sheen: '#a6a9ae' }),
});

// a blank number plate (a seat's, a row's): a pale satin tag of anodised aluminium or ABS, no digits (round A5)
const PLATE_ALBEDO = 0.35;
export const ALBEDO = Object.freeze({
  seatFabric: SEATS[SEATS.default].albedo,   // the upholstery of the chosen colour (SEATS above)
  plate: PLATE_ALBEDO,
  shell: LA.seatShell ?? 0.04,         // seat shells, standards, armrests, handrails, kick plates, feet: black powder coat / polypropylene
  deck: LA.deck ?? 0.10,               // decks, treads, risers, fascias: dark painted board
  nosing: LA.nosing ?? 0.45,           // step nosings: a pale anti-slip strip
  board: LA.board ?? 0.05,             // the printed board face (the MEAN over a panel: ground, marks and words together)
});

/**
 * THE LIT RAIL: an LED profile on top of the boards (plan.js BOARD.profile has its section).
 *
 * What it is (round A3's section; round A4 re-cut it, see below: the two lines of the section and the law are the same).
 * A black anodised aluminium extrusion, 60 x 40 mm, with a slot 30 mm wide in its top. An LED tape lies in the
 * slot under an opal cover that slides into grooves 2 mm under the top of the two lips (the lands a slide-in cover needs
 * over it), so the lit face lies `recess` below the lips and the lips' inner walls stand vertical over it. Nothing else:
 * no dome, no visor.
 *
 * What a camera sees (slotView): looking across the profile from an elevation e, the near lip hides the opal up to
 * recess / tan e from its foot; below atan(recess / slot) = 3.8 degrees the opal is not seen at all and the opening shows
 * the far lip's inner wall, lit by the opal at its foot; from there up the opal's visible share grows without a step
 * (1 - recess / (slot tan e)): 18 % at 4.7 degrees, 41 % at 6.4, 58 % at 9, 88 % at 30, all of it from above.
 *
 * What the face emits (opalLaw): luminance L(theta) = level x cos(theta) ^ power, theta from the face's normal. An opal
 * PMMA sheet over a strip is close to a Lambertian emitter with a loss toward grazing: the light leaves through a smooth
 * surface (Fresnel transmission out of n = 1.49 is 0.96 at 0, 0.91 at 60, 0.61 at 80, 0.39 at 85 degrees: ratios 1, 0.95,
 * 0.64, 0.41) and the sheet's scattering is forward-biased (makers quote beam angles of 100 to 115 degrees for opal covers,
 * a Lambertian sheet would give 120: an exponent of 0.25 to 0.6 on the luminance). power 0.5: 1, 0.71, 0.42, 0.30 at
 * 0, 60, 80 and 85 degrees. It is a law of the SURFACE: the shader evaluates it from dot(normal, view direction).
 *
 * The level. A 14.4 W/m tape gives about 1,450 lm/m; through an opal cover (transmission about 0.7) into a 30 mm slot that is
 * an exitance of 34,000 lm/m2, a luminance of about 10,600 cd/m2. A bed under 2,000 lx of broadcast light on a cloth of
 * reflectance 0.2 has 127 cd/m2: the face is about 83 times the bed. The bed stands at 0.10 here: level 8. (A high-output
 * 30 W/m tape would be 16; a tape dimmed to bed level would be 0.1, which is what a rail that had to stay under the bed
 * while fully in view would need: this profile does not need it, see the arm's play-pose arithmetic.)
 *
 * The far wall (wallShare): black anodised aluminium (diffuse reflectance `wallAlbedo`), lit by the opal beside it: its
 * irradiance is the opal's law integrated over the cover as seen from the wall (0.96 x level at its foot against 1.57 x for
 * a Lambertian face: the law sends less toward grazing), times albedo / pi: about 1.4 % of the face's level.
 *
 * On screen (filterPx; round A5). Seen from the review poses the slit is a fraction of a pixel wide. Rounds A3 and A4
 * drew it as a quad at least 1.5 pixels wide at the same energy, point sampled: as the line crossed pixel rows a column
 * of pixels held one sample of it or two, so the energy on screen swung by a factor of two along the rail (the "beads"
 * of round A4's V1 frame; scratch/surround/tent.mjs: column sums 0.48 to 0.96 for a 0.72 pixel line). Round A5: the
 * opening is drawn THROUGH A RECONSTRUCTION FILTER, analytically: the quad is the slit's true width on screen plus
 * `filterPx` pixels on either side, and each fragment takes the integral of the slit's profile under a tent of that
 * radius centred on the pixel (surround.js RAIL_GLSL: a closed form of the fragment's distance from the slit's middle
 * line in pixels; what lies inside the slit, opal and far wall, is the same section as before, box-filtered over the
 * pixel's footprint). The column sum is then the slit's energy exactly, wherever the line lies on the pixel grid
 * (a tent of a WHOLE number of pixels sums to one over the grid), and nothing depends on a pose: it reads the
 * raster's size and the fragment's own place across the quad.
 * The radius. With 1 pixel the column sum was exact and the line still beaded in the app (frame s7, V1, east rail,
 * scratch/surround/col.py: the brightest pixel 176 to 214 of 255 along 80 columns, the DISPLAYED light of a column
 * swinging 1.8 : 1; round A4: 2.0 : 1): a 0.72 pixel line leaves 0.59 of its light in one pixel when it lies on a
 * pixel's centre and 0.36 in each of two when it lies between, and at the rail's radiance those values sit on the
 * tone curve's shoulder, where two pixels at 0.36 show far more light than one at 0.59. With 2 pixels the brightest
 * pixel holds 0.33 on a centre and 0.27 between two (a swing of 1.2 where radius 1 has 1.64), lower on the curve:
 * the line is a soft line two pixels wide at half height, as a lens draws a slit a hundred times brighter than its
 * surround, and not a hairline. It is the raster's filter, the same at every pose and in every capture: no glow is
 * painted (the light a pixel shows is light the slit sends through that pixel's share of the filter, nothing more).
 * The slit's level, width and section are untouched: the mean over the rail's height in a lens blur is the same.
 *
 * ROUND A4, THE RE-CUT (CONTRACT 16.4). Round A3's section showed a play view nothing (its top was level: an eye 3.6
 * degrees over it saw the far lip's wall, 16 of 255) and a wide view a hairline at the tape's full luminance (244 to 248
 * against a bed of 233 to 235). The section is re-cut (plan.js BOARD.profile): a CORNER profile with a slit of light.
 *   - the extrusion keeps its 60 x 40 mm, with a level top over its back half and its table-side corner cut to a
 *     CHAMFER of `tilt` = 45 degrees; the slit lies on the chamfer. Every eye inside the ring looks at the opening 45
 *     degrees more steeply than its own elevation: the line's width on screen goes with sin(elevation + 45), so a
 *     cue's height and a standing eye see nearly the same line (0.71 of the slit's width at 0 degrees, 0.82 at 10);
 *   - the opening is a SLIT, 4 mm wide (a line-of-light profile: a 3 mm tape behind an opal lens), the opal 1.6 mm
 *     under the lips: the near lip hides recess / tan(elevation + tilt) of it. The cut-off (21.8 degrees over the
 *     slit's own plane) lies 23 degrees BELOW the horizon of the ring, so no eye inside it is near it: the opal's
 *     visible share is 60 % at 0 degrees, 62 at 1.6 (V2), 65 at 3.6 (V3), 68 at 6.6, 73 at 10.7 (V1), 88 at 28, all of
 *     it at 45. No step anywhere: the same two lines (slotView) with the tilt added to the eye's elevation, which the
 *     shader gets for nothing (it works in the surface's own frame). Behind the boards the tilt works against the eye:
 *     the stands (up to 30 degrees over the rail) see none of the opal and the lit far wall only from 45 degrees up;
 *   - the level is HALF of round A3's: 4. (Over a slit of 4 mm that is a fifteenth of round A3's flux per metre:
 *     an accent line of about 100 lm/m, a low-power tape at a fraction of its rating. The rail is a line to see, not
 *     a lamp: what lights the carpet is the wash under the cap.) In a frame the opal's luminance is the level x the
 *     luminance of its colour (the palette's cool white, 0.914): 3.66.
 * Why a slit. Round A4's first section was a 15 degree wedge with a 22 mm opening; its first app frame (m1) read 250
 * at V1 against the bed's 239, where the mean over the drawn line had said 226: the visible opal was a band a third of
 * a pixel wide inside a 1.5 pixel line, and a band under a pixel lands in ONE pixel: the pixel's value is the band's
 * whole energy (radiance x pixels), not the line's mean (railSeen `peak`). At level 4 a resolved opal (a pixel or more
 * of it) is over 3 in scene units, over any bed; the only rail under the bed's peak at this level is one whose opal is
 * under a third of a pixel in the review poses, and the slit's width is what sets that, the same from every pose.
 * (The width was tried on app frames at the same pixels. 3.5 mm: a mean of 72 over the rail's height at V3 in the
 * lens blur and a peak of 223 to 224 at V1, frame m2. 4 mm, the value kept: 78 at V3, 230 to 231 at V1, 194 to 210
 * at V10, 219 to 230 at BACK, frames m3 and m4, against the bed's brightest pixels in the same frames: 255, 253, 243,
 * 248.) The far lip's wall takes 1.38 % of the face's level (0.05 units: level 47 of 255).
 * What it gives, by railSeen at the opal's luminance (the lane's scratch/surround/optics-a4.mjs; `peak`: the brightest
 * pixel): the east rail from V3 0.78 to 0.84 (level 215 to 217 before the lens blur), from V2 0.87 to 1.06 (219 to
 * 226), from V7 0.90 to 1.20 (220 to 229, in that pose's blur); over the rail's own 40 mm (5 to 7 pixels of black
 * extrusion) a mean radiance of 0.13 to 0.155, under the bed's mean (0.24). The wide views: V10 0.33 to 0.82 (166 to
 * 216), V1 north 0.58 to 1.13 (200 to 228), BACK up to 0.86 (218), V9 up to 0.94 (222), TV 0.72 to 0.91 (211 to
 * 220): everywhere under the bed's brightest pixels (about 1.4) and under the post chain's bloom threshold (1.35):
 * from no review pose does the rail bloom by itself. From close (a lens that puts some 500 pixels on a metre there
 * resolves the opal) it shows at its own 3 and blooms: a real slit of light does.
 */
export const RAIL = Object.freeze({
  face: Object.freeze({ level: 4, power: 0.5 }),
  wallAlbedo: 0.05,
  filterPx: 2,
  /**
   * The board wash: a second LED run, hidden in the underside of the nose of each board's cap (plan.js BOARD.cap,
   * BOARD.wash; one room-light tube per side, one-sided: a cosine lobe about its `normal`). It exists because the lit
   * rail cannot light what is below it (round A3: a strip that faces up out of a recess lights nothing below its own
   * lips). The run has no visible part: it lies in the nose's underside, 0.86 m up, and the app's camera is never
   * under 1.1 m at the boards. Its place, aim and level depend on what the board is (BOARDS below).
   */
  wash: Object.freeze({ radius: 6.0, sourceRadius: 0.012 }),
});

/**
 * WHAT A BOARD IS (CONTRACT 16.2, 16.3: board faces at a mean of 45 to 70 of 255 with the words plainly legible; round
 * A3's print at 0.05 under a grazing run stood at 19). Two candidates, both built; `default` is the one the same-tree
 * pair chose (the round's report shows it), the other is the tool's arm `?clubsurround=boards:<kind>`.
 *
 *   led    LED PANELS (BOARD_LED): the face is a display, its own source: a navy ground and white marks at a modest,
 *          even luminance (ground 0.05, white 0.22: nothing near the bloom threshold), with a pixel pitch that shows
 *          from close and merges with distance. It needs no light in front of it, so the cap keeps its short nose
 *          (60 mm) and the run under it is turned AWAY from the screen: tilted 45 degrees toward the playing floor
 *          behind the nose's lower lip (a screen is not lit from above: its black mask would grey). The run lights
 *          the carpet at the boards' feet and little else: by the room light's tube law at `perMetre` 0.5 (4.73 a
 *          side: two rows of tape), on the carpet 0.15 m / 0.3 / 0.6 / 1 / 2 / 3 m in front of the board line: 0.72 /
 *          0.79 / 0.70 / 0.45 / 0.13 / 0.05 units on top of the hall's 1.16 there (the light role's LEVELS-A4: level
 *          41 by its table): level 52 / 53 / 51 / 45 / 37 / 35 (the contract's 45 to 60 at the boards), back to the
 *          hall's level two metres out. (Measured on an app pair, wash off | on, single pixels 0.45 / 0.6 / 0.8 /
 *          1.0 / 1.5 / 2.0 m in front of the north boards: 40 / 42 / 45 / 50 / 67 / 79 without the wash, 57 / 58 /
 *          59 / 61 / 73 / 82 with it, 55 / 55 / 56 / 58 / 67 / 78 under the baked hall light: the hall's own light
 *          falls toward the boards and the wash fills the last metre.) On the cabinet's black face it leaves 0.8 units 0.1 m under the cap and 0.22
 *          at 0.4 m (level 7 and 2 on a 4 % mask: under what the display shows). The face's own emission is not
 *          registered: as a strip source at a mean radiance of 0.068 it adds 0.07 units at 0.3 m (two levels).
 *   print  FRONT-LIT PRINT (PRINT): the round-A3 board with a real wash. A grazing run 70 mm from a face lights a band
 *          (50 : 1 from 50 mm to 800 mm under it); an even wash needs a stand-off of a fifth of the face's height, so
 *          the cap grows a nose of 160 mm (a light shelf) and the run looks straight down from 170 mm in front of the
 *          face. At `perMetre` 1.2 (11.35 a side: five rows of tape) the face takes 3.5 / 5.1 / 4.3 / 1.8 / 0.9 /
 *          0.55 units at 0.05 / 0.1 / 0.2 / 0.4 / 0.6 / 0.77 m under the run (9 : 1 over the face, 2.8 : 1 over its
 *          upper half: no tube with a cosine lobe does better from one edge), 2.3 on average; with the hall's 1.0 the
 *          navy ground (0.045) stands at 57 of 255 under the cap, 28 half way down and 14 at the foot, the light
 *          print (0.20) at 154 / 99 / 63. The same run puts 2.3 units on the carpet 0.15 to 0.3 m in front of the
 *          board (a 13 % carpet under the light that makes a 5 % print read): level 85 with the hall, as bright as
 *          the carpet beside the table (the frame's anchor, 87), and 74 still at 0.6 m.
 */
export const BOARDS = Object.freeze({
  kinds: Object.freeze(['led', 'print']),
  default: 'led',
  led: Object.freeze({ nose: 0.06, standoff: 0.07, tilt: 45, perMetre: 0.5 }),
  print: Object.freeze({ nose: 0.16, standoff: 0.17, tilt: 0, perMetre: 1.2 }),
});

/**
 * The LED panels (BOARDS.led). `ground`, `hi`, `white`, `amber`: what the display shows, as LINEAR radiance before `gain`
 * (the navy ground, the slanted bars a shade over it, the white marks and words, the amber accents: the same draw lists
 * as the print, content.js PANELS); `gain`: the display's level (ground 0.05, white 0.22 in scene units: the played bed
 * stands at 0.10 to 0.25, the bloom threshold at 1.35). `pitch`: the LED pitch in metres (two atlas texels: 8.3 x 7.9 mm:
 * an indoor "P8" perimeter panel); `fill`: the lit share of a cell's width (the rest is the black mask): a lit LED
 * shows 1 / fill^2 of the cell's mean, so the face's mean does not move as the grid merges with distance. `cabinet`:
 * the spread of level between cabinets (two to a module; modules of an LED wall are never matched to the last step).
 * `desat`: the ground pulled toward its own grey (the bed stays the most saturated thing in the frame: at 0.45 the first
 * app frame's ground read rgb 23/39/75, as saturated as the bed's 87/167/230 by (max - min) / max: 0.69 against 0.62).
 */
export const BOARD_LED = Object.freeze({ ground: 0.045, hi: 0.075, white: 0.255, amber: 0.14, gain: 1.1, pitch: Object.freeze([2 * 2.0 / 480, 2 * 0.85 / 216]), fill: 0.72, cabinet: 0.03, desat: 0.6,
  // Round A5: the face is not flat (surround.js RAIL_GLSL, the LED branch):
  //   cabinetWidth  a perimeter board is built of cabinets about half a metre wide: four to a 2 m module (its lit face
  //                 is 1.91 m: 0.478 m each), each at its own level (`cabinet` either way);
  //   seam          the hairline gap between two cabinets, metres (1.6 mm: a third of a pixel at V1, a sixth at V10: a
  //                 faint dark line that fades with distance);
  //   pocket        the display's emission law. Each LED sits a little under the face of the black mask (0.6 mm in an
  //                 opening of fill x pitch = 6 mm: 0.1), so a grazing eye sees less of it: the share seen is
  //                 1 - pocket x tan(theta): 0.9 at 45 degrees from the face's normal, 0.83 at 60, 0.73 at 70, 0.43
  //                 at 80, nothing beyond 84 (a real board dims and then goes dark along its length the same way).
  //                 Head on nothing changes: the levels of round A4 are the head-on levels.
  cabinetWidth: 0.48, seam: 0.0016, pocket: 0.1,
  // Round A6 (CONTRACT 18.1: the board words at least 75 of 255 in the lead's 9 x 9 box centred (215,392) of V10; the
  // box read 82 in round A4 and 68 in round A5). What the round found: the words did not lose level. Their strokes
  // read 133 to 135 in both rounds and the word's whole rectangle 61 in both; the hall was raised 21.9 mm in round A5
  // and the picture moved two pixel rows: the same box two rows higher reads 82 on round A5's frame. A box that mixes
  // a stroke with the ground follows the strokes' place. To hold it against such a shift the words get more light in
  // the box: `stroke` (a factor on the draw lists' stroke weight ON THE DISPLAY'S PIXEL GRID: 1 = round A5's: a
  // word's strokes are 5 LEDs wide, 1.2 makes them 6) and `white` above (round A4 and A5: 0.20; a lit white LED from
  // close now shows 0.54: far under the bloom threshold; the face's mean stays inside 45 to 70).
  stroke: 1.2 });

/** The opal face's luminance toward a direction whose cosine to the face's normal is `cos`, as a share of its normal luminance. */
export const opalLaw = (cos, power = RAIL.face.power) => Math.max(0, cos) ** power;

/**
 * What an eye sees in the profile's opening, looking across it from an elevation whose tangent (in the plane of the
 * profile's section) is `tan`: `opal` = the share of the opening's width that shows the lit face (from the near lip),
 * `wall` = the share that shows the far lip's inner wall. The same two lines are the shader's.
 */
export function slotView(tan, slot, recess) {
  const opal = tan > 0 ? Math.max(0, Math.min(1, 1 - recess / (slot * tan))) : 0;
  return { opal, wall: 1 - opal };
}

/**
 * The radiance of the far lip's inner wall as a share of the face's normal luminance: its irradiance from the opal beside
 * it (the opal's law integrated over the directions that reach the cover from a point `h` up the wall, averaged over the
 * wall's height) times albedo / pi.
 */
export function wallShare(slot, recess, albedo = RAIL.wallAlbedo, power = RAIL.face.power) {
  const NH = 6, NP = 48, NT = 160;
  let sum = 0;
  for (let i = 0; i < NH; i++) {
    const h = (recess * (i + 0.5)) / NH;
    let e = 0;
    for (let j = 0; j < NP; j++) {
      const phi = ((j + 0.5) / NP - 0.5) * Math.PI, cp = Math.cos(phi), tMax = Math.atan(slot / (h * cp));
      for (let k = 0; k < NT; k++) { const t = (tMax * (k + 0.5)) / NT, st = Math.sin(t); e += Math.cos(t) ** power * st * st * cp * (tMax / NT) * (Math.PI / NP); }
    }
    sum += e;
  }
  return ((sum / NH) * albedo) / Math.PI;
}

/** The integral of a unit tent (radius 1, area 1) from -1 to x: what the raster's filter gathers up to a distance. */
export const tentCdf = (x) => { const t = Math.max(-1, Math.min(1, x)); return t < 0 ? 0.5 * (t + 1) ** 2 : 1 - 0.5 * (1 - t) ** 2; };
/** What a pixel gathers of a line `w` pixels wide whose middle lies `d` pixels from the pixel's centre, through a tent of radius `r` pixels (0..1). */
export const tentCover = (d, w, r = RAIL.filterPx) => tentCdf((d + w / 2) / r) - tentCdf((d - w / 2) / r);

/**
 * The rail from an eye `dy` metres above the profile's top, at perpendicular distance `perp` from the rail, looking at a
 * point of it `range` metres away (range >= hypot(perp, dy)); `px` = pixels per metre at that range. Returns what the
 * opening shows there: the opal's visible share, the face's luminance toward the eye, and the line's energy on screen
 * (`levelPx`: radiance x pixels of height, opal and wall together), the mean it leaves on the two pixel rows a thin
 * line lights (`line`) and its brightest pixel through the raster's tent filter (`peak`).
 */
export function railSeen({ dy, perp, range = Math.hypot(perp, dy), px, slot, recess, tilt = 0, level = RAIL.face.level }) {
  // `tilt` (degrees): the slot's plane leans toward the eye's side by so much (round A4; an eye behind the boards passes
  // a negative tilt). In the plane of the section the eye stands at elevation e over the rail; over the slot's own plane
  // it stands at e + tilt: the two lines of the section (slotView) and the law take that angle.
  const t = (tilt * Math.PI) / 180, e = Math.atan2(dy, perp) + t;
  if (e <= 0) return { opal: 0, cos: 0, luminance: 0, levelPx: 0, line: 0, peak: 0, heightPx: 0 };
  const view = slotView(Math.tan(Math.min(e, Math.PI / 2 - 1e-6)), slot, recess);
  // the cosine of the view direction to the face's normal (the normal leans `tilt` toward the eye in the section's plane)
  const cos = Math.max(0, (dy * Math.cos(t) + perp * Math.sin(t)) / range);
  const luminance = level * opalLaw(cos);
  // the opening's height on screen: its width seen at that angle (a line's thickness: nothing shortens it along the rail)
  const heightPx = slot * Math.sin(Math.min(e, Math.PI / 2)) * px;
  const wall = level * wallShare(slot, recess);
  const levelPx = heightPx * (view.opal * luminance + view.wall * wall);
  // `line`: the line's energy over the two pixel rows a thin line lights (or over its own height when it is wider).
  // `peak`: the brightest pixel (round A4's first app frame taught the difference: a 15 degree wedge read 250 at V1
  // where the mean said 226). Round A5: through the raster's tent filter (see RAIL above) the brightest pixel is the
  // one whose centre lies on the opal band's middle: it gathers tentCover(0, band) of the opal's luminance and the
  // rest of what it gathers of the slit from the far wall
  const width = Math.max(2 * RAIL.filterPx, heightPx), band = view.opal * heightPx;
  const peak = tentCover(0, band) * luminance + (tentCover((heightPx - band) / 2, heightPx) - tentCover(0, band)) * wall;
  return { opal: view.opal, cos, luminance, heightPx, levelPx, line: levelPx / width, peak: Math.max(peak, levelPx / width) };
}

/**
 * THE ROUND'S LEVEL FACTOR on the surround's room-light emitters (CONTRACT 15.2: the light role publishes the factors per
 * emitter group in the lane's scratch/light/LEVELS.md; a part role applies them to its own emitters). `wash`: on the board
 * wash; `score`: on the scoreboard's spill. The VISIBLE faces (the rail's opal, the step lights, the LED wall) are sources
 * seen directly: their levels are luminances against the bed, which did not move, so they take no factor.
 */
export const LEVEL = Object.freeze({
  wash: 1.0,    // round A4 (the light role's LEVELS-A4.md: "board washes: yours"): BOARDS.<kind>.perMetre is the level as registered
  score: 1.0,   // row "scoreboard": tied to its own face (3.84 m2 at a mean radiance of 0.55): 2.2 stays
});

/** The aisle step lights: small warm windows in the risers, one pair per row. A source seen directly; no room-light emitter
 * (the surround's share is 6) and, from round A3, no painted pool on the tread either: paint is not light (15.2). */
export const STEP = Object.freeze({ level: 1.5 });

/** The scoreboard: an LED wall showing a title card. */
export const SCORE = Object.freeze({
  level: 1.05,         // HDR level of a fully lit white LED. Three of four pixels of a cell are lit and the title is thin
                       // strokes: at a distance the title reads at about 0.5 to 0.6, the face's mean far under the bed
  // Its spill: ONE omni tube along the wall's middle, `off` in front of the LED face (round A2's place and size). `intensity`
  // is round A2's; LEVEL.score scales it.
  glow: Object.freeze({ intensity: 2.2, radius: 7.0, off: 0.25, sourceRadius: 0.05, color: '#cfd8ff' }),
});

/**
 * ROUND A6 (CONTRACT 18.1: the scoreboard's lit face at 95 to 130 of 255, under the bed's peak): THE SCOREBOARD AS A
 * LIT SLIDE, a screen like the rig's hanging ones. Rounds A1 to A5 showed a title card on a black ground (a face mean
 * of 33) with a spill sized for round A2's face, five times brighter than the face in the tree. `on` switches the
 * whole of it in: the face's picture, its level and its emitter.
 *   the picture  the SAME draw list (content.js SCOREBOARD: the words 9-BALL and FINAL, chevrons, rules, two diamonds)
 *                in a slide's tones: a cool white ground, navy ink, a blue for the chevrons, the palette's amber
 *                (`ground`, `ink`, `dim`, `blue`, `amber`: sRGB hex; no red, no violet);
 *   level        the HDR level of a lit LED. Three of four texels of a cell are lit in each direction (0.5625 of the
 *                face) and the ground's white is 0.9: the ground stands at 0.49 x level = 0.21 in scene units, 129 of
 *                255 through the app's tone map at the arena's exposure, about 120 in a frame's corner; with the ink
 *                (about a sixth of the face) the face's mean is about 0.185. A lit LED from close: 0.39, far under
 *                the post chain's bloom threshold (1.35): a surface, not a source; the words are ink, not light: no halo;
 *   glow         the spill's level as registered with the room light (the same tube at the same place). A face of
 *                3.84 m2 at a mean radiance of 0.185 is 0.71 units x m2 toward its normal; by the light role's rule
 *                for a screen (radiance / 0.728) 0.98; the room light's tube law (level / (d^2 + half length x d))
 *                gives that face's irradiance at 1 m with a level of 1.0 (round A2 to A5: 2.2);
 *   normal       the spill is ONE-SIDED: a screen sends nothing behind its own face. The omni tube of rounds A2 to
 *                A5, 0.25 m in front of the face, lit the backdrop around the cabinet (1.4 units 0.7 m from it at a
 *                level of 2.2: light a wall-mounted screen cannot put there).
 */
export const SCORE_SLIDE = Object.freeze({ on: true, level: 0.43, glow: 1.0, normal: Object.freeze([1, 0, 0]),
  ground: '#f1f4fb', ink: '#14254a', dim: '#a9b3c9', blue: '#2f56a8', amber: '#c27a1c' });

/**
 * ROUND A6 (CONTRACT 18.1: seat cards on base and lite within 10 of the high tier): THE CARD IS SHADED AS THE SEAT IT
 * STANDS FOR. What the round found (app frames c1, c2 against round A5's sheet; the lane's reports/a6-surround.md):
 * under the same air a card's row and a real row agree in their MEANS (within 2 of 255); a 9 x 9 pixel box does not,
 * because a card is one flat Lambert sheet with a painted seat on it: it takes ONE irradiance (the baked volume for
 * the sheet's normal) where the real seat's flanks take the volume for THEIR normals (a bolster's top flank looks at
 * the roof: 2.8 units in a front row where the sheet gets 1.6; 0.25 against 0.6 in a top row), and it stood 0.11 m
 * behind the real pad (plan.js UPHOLSTERY.card). From `on`:
 *   - the card's paint is FLAT albedo (paint.js paintSeatCardFlat: cloth, shell, plate; no painted roll, shade or
 *     seam: paint is not light);
 *   - the card's material bends its shading normal to the seat's form, from the card's own coordinates (surround.js
 *     CARD_GLSL: the two bolsters, the seam's groove, the cushion's nose: the numbers of plan.js SEAT and UPHOLSTERY),
 *     so the room light's baked volume is read for the normal the real seat has there: what the card SAMPLES;
 *   - the cloth's pile: a sheen term on the baked irradiance by the surface's own view angle (the DFG fit of a sheen
 *     lobe of `sheenRoughness`, the form three's physical material uses under an environment; `sheenGain` x the
 *     fabric's sheen colour). The real seat's lobe is evaluated per emitter (it knows each flood's direction); a card
 *     has no emitter loop on base and lite: this is the same lobe under the light field the bake holds.
 * No term reads the camera's place: the view enters as the surface's own view angle, as in any BRDF.
 *   - `lobes` (base; found under the half-way bake: the top rows' cards stood 7 to 17 levels under the real seats, whose
 *     top rolls are lit by their own per-emitter lobes): where the room light keeps an emitter loop (every tier but
 *     lite) the card's material IS the fabric's (physical, the fabric's roughness and sheen lobe, masked to the cloth
 *     of the card), so the card's bent normal gets the same rough specular and pile from every flood that the real
 *     seat gets; the sheen term on the baked irradiance stays for lite alone (no emitter loop there).
 */
export const CARD_FORM = Object.freeze({ on: true, sheenGain: 1.0, sheenRoughness: 0.45, lobes: true });

/**
 * ROUND A7 (CONTRACT 19.3: seat cards on base and lite within 10 of the high tier, aim 5). THE ROW'S LIGHT FOR A CARD
 * WITHOUT AN EMITTER LOOP. Round A6 found why the lite tier's top rows miss: the real seat's cloth is lit by
 * per-emitter lobes (rough specular, pile) and the lite room compiles no emitter loop. From `on`, where the card's
 * program has no loop (lite), the card's material is the fabric's own (physical, the roughness and sheen lobe of the
 * real seat and of the base card) and its lobes take ONE light per place along the row, read from the bake: the LIGHT
 * VECTOR of the baked volume at the pad (the differences of the volume's six axis irradiances at the pad's place and
 * height: for one source exactly its direction and its irradiance on a surface that faces it, for several their net
 * flux, with the bake's shadows and the row in front in it). surround.js writes it into a small table (one line per
 * card, `samples` places along the row; `at`: the pad's middle as a share of the card's height) whenever the room
 * light's bake changes; the card's fragment reads the table and hands that light to three's own direct-light law for
 * the specular and the pile. No emitter loop, no number per block: the level is the bake's.
 */
export const CARD_ROW = Object.freeze({ on: true, samples: 16, at: 0.716 });

/**
 * ROUND A7 (CONTRACT 19.3, the cards against the real seats): THE CARD'S NOSE FOLLOWS THE REAL ROLL. Round A6 turned
 * the card's shading normal over the cushion's nose by a ramp of its own (a slope of 2.5 at the top falling to -0.4
 * over 70 % of the band). Under one light (frame a7d4: the dev page, a card beside a real seat) that holds the roll's
 * top over a third of the band: 13 rows at 130 over a hem at 74, where the real roll shows 3 rows of highlight over
 * a face at 107. From `on` the card takes the turn from the cushion's own mesh (seat.js cushionRollTurn: its smooth
 * normals at the nose, the chin and the hem, in the folded pose): no free number.
 */
export const CARD_ROLL = Object.freeze({ on: true });

/**
 * ROUND A7 (CONTRACT 19.3 "fabric at distance": at V10 and V3 the seats show weave or nap variation). What rows of
 * real seats show from 10 to 15 m is not the weave's thread (under a pixel) but the PILE: every pad is brushed a
 * little differently, so pad differs from pad by a few per cent and each pad carries soft strokes; the front roll of
 * a pan, handled at every folding, is paler. As a law of the surface, not paint:
 *   lean       the pile leans: the tangent of the lean of the fibres' mean axis from the pad's normal (0.14: about 8
 *              degrees), in a direction of the pad's own plane that differs from seat to seat (plan.js planSeats: a
 *              fixed seed; its length a share `spread` either way). The shading normal leans with it: the baked
 *              light and every lobe are read for the fibres' axis, so a pad brushed toward a flood is paler and one
 *              brushed away from it darker, and the difference turns with the light;
 *   cells      the strokes inside a pad: two octaves of a smooth field over the pad's own coordinates (cells of
 *              `cells` metres, each octave's share `gain` of the lean), each faded out as its cell falls under about
 *              two pixels (band-limited by the screen derivative: tone variation that survives distance, no moire:
 *              the fine octave shows from the play views, the coarse one from across the hall);
 *   wear       the cushion's front roll: its albedo up by `wear` x the seat's own wear (plan.js: 0.3 to 1; worn pile
 *              lies flat and pale), its pile lobe down by `wearSheen` x the same;
 *   card       the row cards carry the same rhythm (a per-seat lean and tone from a hash of the seat's place on its
 *              card, the same strokes in the card's own coordinates);
 *   seats      the cards take every seat's OWN tone, lean and wear from the plan (plan.js planSeats: the numbers the
 *              real seat's instance carries on the high tier; a table of one line per card) in place of the hash: a
 *              seat of a card then reads as the real seat that stands there on the high tier. Found on the first
 *              frames of the round: a pad-only box compares one real seat with one card seat, and with a tone and a
 *              lean from two different draws the two differ by up to 10 % before any light does.
 * The fabric's mean albedo does not move (the roll is under 3 % of a seat's cloth: 0.18 -> 0.1803).
 */
export const NAP = Object.freeze({ on: true, lean: 0.14, spread: 0.5, cells: Object.freeze([0.085, 0.028]), gain: Object.freeze([0.6, 0.4]), wear: 0.10, wearSheen: 0.5, card: true, seats: true });

/**
 * ROUND A7 (CONTRACT 19.1: one reflection of the hall; it ended round A4's stand-in on the frames' metal: "0.04 of
 * the table's cube and a diffuse share"). The aluminium is a METAL and nothing else (SURFACE.metal below: its
 * numbers), and with `on` what it mirrors is the hall's baked cube through the env service: the material carries the
 * service's tag (`material.userData.clubHall = { share: 1, keep: 0 }`: box-corrected, at the material's own
 * roughness; none of the table's cube, so no blue of the bed). `frames`: the swatch of an LED board's stiles and
 * bottom member ('alu': natural anodised, the reflectance of SWATCH.alu; the cap that carries the lit rail stays
 * black anodised). Without the service (a dev page, the service switched off, a tool's `hall:0`) the metal keeps
 * its highlights and mirrors nothing: there is no second stand-in.
 */
export const METAL_HALL = Object.freeze({ on: true, frames: 'alu' });

/** Surface numbers of the lit materials (roughness, metalness, share of the reflection cube). */
export const SURFACE = Object.freeze({
  // printed panels: a satin laminate with a slight gloss over a faint waviness (`normalScale` of the panel's own normal map)
  board: Object.freeze({ roughness: 0.34, metalness: 0, env: 0.22, normalScale: 0.55 }),
  // dark painted board (decks, risers, fascias) and everything powder coated or moulded black that is merged with it
  // (standards, handrails, kick plates, feet, housings): matt
  deck: Object.freeze({ roughness: 0.9, metalness: 0, env: 0.03 }),
  // aluminium: board frames, posts, nosing trims, the LED profile: brushed, anodised. Its swatch is its reflectance.
  // A METAL and nothing else (round A7, CONTRACT 19.1; METAL_HALL above): no diffuse share (`metalness` 1), a brushed
  // anodised face (`roughness` 0.42), and what it mirrors is the hall's own baked cube from the member's own place
  // (the material carries the env service's tag: box-corrected, at this roughness). None of the table's cube (`env`
  // 0): that cube is captured 0.45 m over the bed's middle, its whole lower half IS the bed, and a lobe of this
  // roughness reads a prefiltered level that mixes a third of that blue into a horizontal look-up (round A3, at a
  // share of 0.15: stiles at rgb 9/16/34). Rounds A4 to A6 stood in for the missing picture of the hall with 0.04 of
  // the table's cube and a diffuse share of the swatch (metalness 0.85, roughness 0.55): that stand-in is DELETED.
  metal: Object.freeze({ roughness: 0.42, metalness: 1, env: 0 }),
  seats: Object.freeze({ roughness: 0.9, metalness: 0, env: 0.03, alphaTest: 0.35 }),   // the seat-row cards (detail 0 and 1): a flat sheet must not shine
  // the real seats' upholstery: a woven cloth with a nap (`tile`: metres per repeat of its normal map: the scan's tile is
  // 0.284 x 0.273 m). Roughness 0.74 is the scan's mean (and under 0.85, so the room light keeps the emitters' highlights
  // and sheen on it under a bake). `sheen`, `sheenRoughness`: the lobe that lights a nap toward grazing angles: without it
  // the scan's almost flat maps read as felt (the assets role's note)
  fabric: Object.freeze({ roughness: 0.74, metalness: 0, env: 0.02, normalScale: 1.0, tile: 0.28, sheen: 1.0, sheenRoughness: 0.45 }),
  shell: Object.freeze({ roughness: 0.42, metalness: 0, env: 0.16 }),   // the real seats' moulded pans: black polypropylene with a soft sheen
});

/**
 * The seats' colours (sRGB hex) for a kind of fabric (SEATS; default: the chosen one). Round A5 (CONTRACT 17.3): a
 * muted OCHRE upholstery on black shells (round A3 and A4: graphite; round A2's garnet is gone: red seats with navy
 * boards are the blue-and-red scheme the accepted plan excluded). The real seats carry `fabric` (the hue at the
 * fabric's albedo) as their vertex colour, the seat card paints it plus `cardVeil`.
 *   sheen     the colour of the nap's sheen lobe: the fibre's own pale tint;
 *   cardVeil  what the sheen lobe adds to a real seat's pad on average, as LINEAR albedo added to the fabric in the
 *             seat CARD's paint (a card is a Lambert surface: it has no lobe; the lobe depends on the view and a card
 *             cannot follow it: the veil is what a base | high pair measures). Graphite, round A4, app frames under
 *             the baked hall light at V10 (m9 | m7, the same pad pixels): 0.021 / 0.021 / 0.018, which is 0.053 of
 *             its sheen colour; the other kinds take the same share of their own sheen colour until a base | high
 *             pair of this round measures them;
 *   shell     back shells, the pans' undersides, armrests: black polypropylene; `frame`: the standards' black coat;
 *   plate     the blank number plate on a pan's lip and the row plate on an aisle standard: a pale satin tag, no digits;
 *   vary      the per-seat spread of the fabric's level (fixed seed, plan.js planSeats): wear, not a stamped pattern.
 * (The one occlusion a real seat carries in itself, the pad in the slot behind the tipped-up pan, is no number of this
 * file: seat.js padSlot / slotOpen take it from the seat's own section.) Pure.
 */
const SHELL_HEX = withLuminance(LAYOUT.PALETTE?.seatFrame ?? '#38383a', LA.seatShell ?? 0.04);
const linOfHex = (hex) => rgbOf(hex).map(lin);
export function seatColor(kind = SEATS.default) {
  const k = SEATS.kinds.includes(kind) ? kind : SEATS.default, s = SEATS[k];
  const veil = k === 'graphite' ? [0.021, 0.021, 0.018] : linOfHex(s.sheen).map((v) => Math.round(v * 0.053 * 1000) / 1000);
  return Object.freeze({ kind: k, albedo: s.albedo, fabric: withLuminance(s.hue, s.albedo), sheen: s.sheen, cardVeil: Object.freeze(veil), shell: SHELL_HEX, frame: SHELL_HEX,
    plate: withLuminance('#b9bcc2', PLATE_ALBEDO), vary: 0.07 });
}
export const SEAT_COLOR = seatColor(SEATS.default);

/** The assets role's ids for the seat fabric (CONTRACT 14.2; scratch/assets/READY.md). Only the normal map is taken: the
 * scan's colour map is flat (the tint is the colour) and its roughness is one number (SURFACE.fabric.roughness). */
export const SEAT_ASSETS = Object.freeze({ normal: 'arena.seat.normal' });

/** Shadow overlays (multiply blended): the darkest value each kind leaves (0 = black, 1 = nothing). */
export const SHADOW = Object.freeze({ contact: 0.12, cast: 0.55 });

/**
 * The swatches of the atlas as [hue, level]: `level` is a diffuse albedo for a painted or moulded surface (the law's
 * values), a reflectance for a metal (`alu`, `aluDark`, `post`, `channel`: no law), a colour as it is for the two sources.
 * paint.js paints withLuminance(hue, level); the arm pins every level.
 */
export const SWATCH = Object.freeze({
  // aluminium (metal batch): natural anodised frames and posts, dark anodised trims, the black anodised LED profile
  alu: ['#8d9096', 0.62], post: ['#8d9096', 0.62], aluDark: ['#5b5e64', 0.25], channel: ['#2a2b2e', 0.05],
  // dark painted board
  deck: ['#2e3038', ALBEDO.deck], tread: ['#3a3c40', ALBEDO.deck], fascia: ['#2c2e35', ALBEDO.deck],
  nosing: ['#8d887b', ALBEDO.nosing],
  // black powder coat, black moulded plastic, rubber, painted steel
  steel: ['#3b3d42', ALBEDO.shell], rubber: ['#111113', ALBEDO.shell], housing: ['#0c0d10', ALBEDO.shell], seatFrame: ['#38383a', ALBEDO.shell],
  arm: ['#38383a', ALBEDO.shell], plinth: ['#0e0e10', ALBEDO.shell], hoop: ['#17171a', ALBEDO.shell], kick: ['#1d1e22', ALBEDO.shell],
  bezel: ['#08080a', ALBEDO.shell],
  // the blank row plate on an aisle standard (round A5): a pale satin tag
  plate: ['#b9bcc2', ALBEDO.plate],
  // the plain back of a printed panel: the same laminate, unprinted
  panelBack: ['#3a3e48', ALBEDO.board],
  seat: [SEATS[SEATS.default].hue, ALBEDO.seatFabric],
});
/** On the lite room the aluminium is folded into the matt batch (a dielectric): what a satin aluminium member reads as
 * under a dim hall, as a diffuse albedo (TIER LINE, owner: surround). */
export const SWATCH_LITE = Object.freeze({ alu: 0.12, post: 0.12, aluDark: 0.07 });

/**
 * Print values of the board panels (BOARDS.print). The layout's PALETTE gives the hues. `desat`: the
 * ground pulled toward its own grey (with a blue cloth the bed has to stay the most saturated thing in the frame).
 * `soil`: how much darker the lowest part of a print is than its middle (scuffs and dust gather low: detail, a few per
 * cent; round A2 painted 22 % there, which was a shade standing in for light).
 */
export const PRINT = Object.freeze({ desat: 0.7, soil: 0.06,
  // Round A4 (CONTRACT 16.3: "a printed face may use an albedo up to 0.20 for its light parts, with the navy ground kept
  // dark"): the print's albedos, painted as they are (no scaling of a panel to a mean any more: the mean of a panel is
  // what its marks make it, 0.055 to 0.066, and paint.js reports it): the navy ground, the slanted bars, the white
  // words and marks, the amber accents.
  ground: 0.045, hi: 0.075, light: 0.20, amber: 0.15 });

/** Round A3's values that round A4 replaced (the BEFORE arm of the round's pairs is sheets/a3/a3-<pose>.jpg). */
export const ROUND_A3 = Object.freeze({
  rail: { level: 8, slot: 0.030, recess: 0.002, tilt: 0 }, wash: { perMetre: 0.47, factor: 0.8, nose: 0.06, standoff: 0.07, tilt: 0 },
  print: { board: 2.0, boardHi: 1.4, white: 0.42, mean: 0.05 }, surface: { metal: { roughness: 0.45, metalness: 1, env: 0.15 } },
  seat: { padOcclusion: 0.45, cardVeil: [0.016, 0.016, 0.017] },
});

/** Round A2's values that round A3 replaced (the BEFORE arm of the round's pairs is sheets/a2/a2-<pose>.jpg). */
export const ROUND_A2 = Object.freeze({
  rail: { body: 0.16, core: { level: 40, sin0: 0.064, sin1: 0.078 }, capture: 52, tube: { intensity: 4.5, inset: 0.26, omni: true } },
  seat: { fabric: '#7d2f37', sheen: '#b4505a', cardVeil: [0.02, 0.016, 0.016] }, step: { pool: 0.3 }, score: { glow: 2.2 },
  print: { board: 2.0, tread: 1.3, soil: 0.22 }, surface: { metal: { roughness: 0.42, metalness: 0.55, env: 0.45 } },
});
