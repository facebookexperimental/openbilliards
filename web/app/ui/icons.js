// Copyright (c) Meta Platforms, Inc. and affiliates.

// icons.js — the single inline-SVG icon source for the game chrome
// (issue #49 de-slop pass; register law in the product charter "Real icons").
//
// Grammar: 20px optical grid (viewBox 0 0 20 20), 1.5px stroke,
// currentColor, round caps/joins, geometric-minimal to match Space
// Grotesk's instrument-panel character. Every path below is ORIGINAL
// hand-drawn geometry (the gear outline is generated from first
// principles: 8 teeth, root r=5.1 / tip r=7.1, half-widths 14.5°/8.5°) —
// no icon fonts, no external assets, no third-party icon sets.
//
// LEAF module (cache-poison contract, the ownership ledger (internal) "UI kit"):
// zero imports, zero import-time side effects. ui/ siblings may import it
// statically; modules outside ui/ reach it via guarded dynamic import()
// and keep their previous text glyph as the stale-cache fallback content.
// Exports are FROZEN-STABLE (additive only): a stale cached icons.js next
// to a fresher consumer must keep resolving.
//
// Colors: currentColor ONLY (the CI design-token grep gates this file).

const PATHS = {
  // 8-tooth gear ring + hub — the settings mark
  gear: '<path d="M8.72 5.06L8.95 2.98A7.1 7.1 0 0 1 11.05 2.98L11.28 5.06'
    + 'A5.1 5.1 0 0 1 12.59 5.61L14.22 4.29A7.1 7.1 0 0 1 15.71 5.78'
    + 'L14.39 7.41A5.1 5.1 0 0 1 14.94 8.72L17.02 8.95A7.1 7.1 0 0 1 '
    + '17.02 11.05L14.94 11.28A5.1 5.1 0 0 1 14.39 12.59L15.71 14.22'
    + 'A7.1 7.1 0 0 1 14.22 15.71L12.59 14.39A5.1 5.1 0 0 1 11.28 14.94'
    + 'L11.05 17.02A7.1 7.1 0 0 1 8.95 17.02L8.72 14.94A5.1 5.1 0 0 1 '
    + '7.41 14.39L5.78 15.71A7.1 7.1 0 0 1 4.29 14.22L5.61 12.59'
    + 'A5.1 5.1 0 0 1 5.06 11.28L2.98 11.05A7.1 7.1 0 0 1 2.98 8.95'
    + 'L5.06 8.72A5.1 5.1 0 0 1 5.61 7.41L4.29 5.78A7.1 7.1 0 0 1 '
    + '5.78 4.29L7.41 5.61Z"/><circle cx="10" cy="10" r="1.9"/>',
  // question mark: hook + stem stroke, filled terminal dot
  help: '<path d="M7.15 7.2C7.15 5.62 8.35 4.55 10 4.55C11.65 4.55 12.85 '
    + '5.62 12.85 7.1C12.85 9.4 10 9.25 10 11.8"/>'
    + '<circle cx="10" cy="15.1" r="1.05" fill="currentColor" stroke="none"/>',
  close: '<path d="M5.75 5.75L14.25 14.25M14.25 5.75L5.75 14.25"/>',
  // delete a RECORD (GH-668 B-K08): the waste bin — lid line, a short
  // handle riding on it, a body tapering 0.8 u per side to a rounded foot,
  // two inner ribs. The row renderer's per-row delete wore the `close` cross
  // at 14 px next to the foul cross and the modal's own close cross (three
  // ✕ at one weight per phone DVR row); a destructive verb gets its own
  // glyph and never a twin of dismiss. Hand-derived on the 20 grid: lid
  // y = 6 (x 4..16), handle 8..12 × 3.5..6 with 1 u corners, body from
  // (5.5, 6) / (14.5, 6) to a 1.6 u-radius foot at y = 16.6, ribs x = 8.6 /
  // 11.4 from y 9 to 13.6 (≥ 1.9 u clear of the body walls at every y).
  trash: '<path d="M4 6H16"/>'
    + '<path d="M8 6V4.5A1 1 0 0 1 9 3.5H11A1 1 0 0 1 12 4.5V6"/>'
    + '<path d="M5.5 6L6.3 15.1A1.6 1.6 0 0 0 7.9 16.6H12.1'
    + 'A1.6 1.6 0 0 0 13.7 15.1L14.5 6"/>'
    + '<path d="M8.6 9V13.6M11.4 9V13.6"/>',
  'chevron-down': '<path d="M5.5 7.75L10 12.25L14.5 7.75"/>',
  'chevron-left': '<path d="M12.25 5.5L7.75 10L12.25 14.5"/>',
  'chevron-right': '<path d="M7.75 5.5L12.25 10L7.75 14.5"/>',
  // replay transport (share.js #ob-rp-*)
  play: '<path d="M7.25 5L15 10L7.25 15Z"/>',
  pause: '<path d="M7.25 5.25V14.75M12.75 5.25V14.75"/>',
  'skip-back': '<path d="M5.75 5.25V14.75M14.75 5.5L8.5 10L14.75 14.5Z"/>',
  'skip-forward': '<path d="M14.25 5.25V14.75M5.25 5.5L11.5 10L5.25 14.5Z"/>',
  // practice-drills mark (issue #66): concentric target — ring + filled bull
  target: '<circle cx="10" cy="10" r="6.5"/>'
    + '<circle cx="10" cy="10" r="2.1" fill="currentColor" stroke="none"/>',
  // drill dock (issue GH-120): stop = rounded square (the transport-stop mark)
  stop: '<rect x="6" y="6" width="8" height="8" rx="1.2"/>',
  // record dock (issue GH-150, replacing the GH-139 ring+bull lens): the
  // classic RECORD mark — one solid filled dot, no outer ring. The old
  // lens read as a twin of the drills 'target' (ring + bull) on-device;
  // a bare filled circle is the unmistakable record voice (every camera
  // app). r=5.6 fills the 20px grid without touching the 44px pill's
  // optical edge; currentColor fill so the OWNING control picks the tint.
  // CONSUMERLESS since GH-225 Phase D (2026-07-27): the record pill + dock
  // are retired, the .ob-rec-accent class that tinted the opener --ob-danger
  // no longer exists, and nothing in the app requests 'record' or
  // 'record-stop'. Both entries are KEPT (an unused map entry costs one
  // string and the delivery machinery behind __record is kept too) —
  // whoever re-producers a record control inherits the ruled glyphs.
  record: '<circle cx="10" cy="10" r="5.6" fill="currentColor" stroke="none"/>',
  // record dock STOP (build-4 QA): the dual-dock composition put the plain
  // transport square 4px from the drill dock's IDENTICAL square, color the
  // only differentiator — this variant carries the recorder's filled bull
  // inside the square (dot-in-square) so the record stop reads as "stop
  // THE RECORDING" at a glance. Square grown to 9x9 (vs stop's 8x8) so
  // the bull keeps ≥1.7px of clear field inside the stroke.
  'record-stop': '<rect x="5.5" y="5.5" width="9" height="9" rx="1.4"/>'
    + '<circle cx="10" cy="10" r="2.2" fill="currentColor" stroke="none"/>',
  // drill dock (issue GH-120): reset = circular retry arrow — a 5.1-radius
  // ring open at the top-right, arrowhead at the top end pointing along
  // the travel direction (clockwise re-lay). Hand-derived on the 20 grid:
  // arc from (15.1, 10) the long way (large-arc, clockwise) to (10, 4.9).
  reset: '<path d="M15.1 10A5.1 5.1 0 1 1 10 4.9"/>'
    + '<path d="M8.2 3.2L10 4.9L8.3 6.7"/>',
  // ==== chrome diet (issue GH-156) — secondary actions become icon pills ====
  // re-rack: the rack triangle (apex up) with one ball resting inside near
  // the base — reads "rack the balls" without text
  rack: '<path d="M10 3.9L17 15.6H3Z"/>'
    + '<circle cx="10" cy="12.2" r="1.7"/>',
  // clear table: the landscape table outline with a small × inside —
  // "empty the table's contents" (deliberately landscape so it never reads
  // as a window-close; the × is scaled well under the #err dismiss mark)
  clear: '<rect x="2.9" y="5.3" width="14.2" height="9.4" rx="1.6"/>'
    + '<path d="M8.1 8.1L11.9 11.9M11.9 8.1L8.1 11.9"/>',
  // undo placement: the classic counter-turn arrow — flat run to the left
  // terminus (arrowhead) with the return curve swinging under
  undo: '<path d="M5.2 8.4H12.1A3.6 3.6 0 0 1 12.1 15.6H8.6"/>'
    + '<path d="M8.1 5.4L5.1 8.4L8.1 11.4"/>',
  // snap to grid: a ball (stroked ring) seated on the center node of a
  // 3x3 dot lattice — "placements land on the lattice"
  snap: '<circle cx="10" cy="10" r="2.1"/>'
    + '<circle cx="4.5" cy="4.5" r=".95" fill="currentColor" stroke="none"/>'
    + '<circle cx="10" cy="4.5" r=".95" fill="currentColor" stroke="none"/>'
    + '<circle cx="15.5" cy="4.5" r=".95" fill="currentColor" stroke="none"/>'
    + '<circle cx="4.5" cy="10" r=".95" fill="currentColor" stroke="none"/>'
    + '<circle cx="15.5" cy="10" r=".95" fill="currentColor" stroke="none"/>'
    + '<circle cx="4.5" cy="15.5" r=".95" fill="currentColor" stroke="none"/>'
    + '<circle cx="10" cy="15.5" r=".95" fill="currentColor" stroke="none"/>'
    + '<circle cx="15.5" cy="15.5" r=".95" fill="currentColor" stroke="none"/>',
  // playground/sandbox mode mark: the four-way move cross — free ball
  // placement is the sandbox's defining gesture
  move: '<path d="M10 3.4V16.6M3.4 10H16.6"/>'
    + '<path d="M8.1 5.3L10 3.4L11.9 5.3"/>'
    + '<path d="M8.1 14.7L10 16.6L11.9 14.7"/>'
    + '<path d="M5.3 8.1L3.4 10L5.3 11.9"/>'
    + '<path d="M14.7 8.1L16.6 10L14.7 11.9"/>',
  // share replay: the three-node share graph (two edges fanning right)
  share: '<circle cx="14.7" cy="5.1" r="2.1"/>'
    + '<circle cx="5.3" cy="10" r="2.1"/>'
    + '<circle cx="14.7" cy="14.9" r="2.1"/>'
    + '<path d="M7.2 9L12.8 6.1M7.2 11L12.8 13.9"/>',
  // export video: down arrow landing in a tray — "produce a file"
  export: '<path d="M10 3.2V11.6M6.9 8.5L10 11.6L13.1 8.5"/>'
    + '<path d="M3.8 13.4V15A1.6 1.6 0 0 0 5.4 16.6H14.6'
    + 'A1.6 1.6 0 0 0 16.2 15V13.4"/>',
  // Playback / DVR mark (GH-225 Phase C intent, GH-246 retune): a replay
  // ring WRAPPING a solid play triangle — "re-watch what was recorded".
  // The owner's stated intent is unchanged; the PROPORTIONS were wrong.
  //
  // GH-246 defect 2 — the shipped geometry (r=5.1 arc, a stroked chevron
  // arrowhead, a 3.9x4.4 solid triangle) left a measured 1.687 viewBox-unit
  // clear counter between triangle and ring, i.e. 1.69 CSS px at the shipped
  // size 20 and 1.10 CSS px at size 13: at 20px the two shapes read as one
  // filled swirl. Two mechanisms, both measured by web/tools/glyph-audit.mjs:
  //   1. the chevron head plunged 1.39 u PAST the ring's inner ink edge
  //      (its lower wing node sat at r=3.712 vs the 4.35 clear radius), so
  //      the "arrowhead" was a hook hanging into the counter beside the
  //      triangle instead of a mark riding the band;
  //   2. the arc's own clear interior (2*(5.1-0.75) = 8.7 u) was only 2.2x
  //      the triangle's width.
  // Retune: ring r=6.0 (clear interior 10.5 u — still the SMALLEST ring in
  // the toolbar family: `target` is r=6.5 and the gear's tip r=7.1, so the
  // drills mark stays optically larger and the two never trade places), the
  // triangle keeps its shipped 4.40 height at 3.81 width with its vertex
  // radii balanced (base corners 2.54 u, apex 2.54 u — the max-vertex-radius
  // minimum for that width), and the head becomes a SOLID tangential
  // arrowhead whose radial base is centred on the band at the arc terminus
  // (radii 4.5..7.5) with the tip 2.7 u along the travel direction. The
  // arc's round cap lands INSIDE that base, so head and ring fuse into one
  // arrow instead of forming a lump. Direction is preserved (arrow points
  // -x at 12 o'clock = counter-clockwise = "back in time").
  // Measured min clear counter: 2.627 u = 2.63 CSS px @20 (7.88 device px at
  // DPR3), 2.89 @22, 1.71 @13 — the 13px counter now equals what 20px used
  // to give. Gated by glyph-audit.mjs (--gap floor 2.4 u).
  playback: '<path d="M4 10A6 6 0 1 0 10 4"/>'
    + '<path d="M10 2.5L7.3 4L10 5.5Z" fill="currentColor" stroke="none"/>'
    + '<path d="M8.73 7.8L12.54 10L8.73 12.2Z" fill="currentColor" stroke="none"/>',
  // ==== 030 Phase C player faces (owner-signed mockup glyphs, additive) ====
  // Broadcast camera: TV camera body + lens wedge
  'cam-broadcast': '<rect x="2.9" y="6" width="10.2" height="8" rx="1.6"/>'
    + '<path d="M13.1 9.2L17.1 7V13L13.1 10.8Z"/>',
  // Chase camera: ball with motion streaks
  'cam-chase': '<circle cx="13" cy="10" r="2.6"/>'
    + '<path d="M3 7.2H8.4M4.6 10H7.6M3 12.8H8.4"/>',
  // Overhead camera: down arrow onto the table slab
  'cam-overhead': '<path d="M10 3V8.6M8.1 6.9L10 8.8L11.9 6.9"/>'
    + '<rect x="3.4" y="11.6" width="13.2" height="5" rx="1.2"/>',
  // Rail camera: ball at the rail line + cue butt
  'cam-rail': '<path d="M3 14.2H17"/><circle cx="7.6" cy="11" r="2.7"/>'
    + '<path d="M12.6 11H15.6"/>',
  // Close camera: magnifier
  'cam-close': '<circle cx="9" cy="9" r="5.1"/><path d="M12.7 12.7L16.6 16.6"/>',
  // POV camera (GH-275): the shooter's head with the first-person view
  // frustum opening down-table — "the shot from the player's eyes". Same
  // composition grammar as cam-broadcast (body + lens wedge): the wedge
  // base sits on the head circle's right edge (x = 9) exactly like the
  // broadcast wedge sits on its body edge.
  'cam-pov': '<circle cx="6.2" cy="10" r="2.8"/>'
    + '<path d="M9 8.9L16.6 5.6V14.4L9 11.1Z"/>',
  // Custom tripod camera (GH-301 director strip slots CAM 1/2/3): camera
  // head on three legs. Deliberately NOT the cam-broadcast body — a slot
  // pill face must never be a pixel-twin of the Broadcast preset pill (the
  // GH-242 indistinguishable-face lesson).
  'cam-tripod': '<circle cx="10" cy="6.3" r="2.7"/>'
    + '<path d="M10 9V12M10 12L6.4 16.8M10 12L13.6 16.8M10 12V16.8"/>',
  // foul marker glyph (GH-242, owner decision 2026-07-28): the red CROSS.
  // Two clean strokes at 45°, no interior detail and no enclosed counter, so
  // it survives the marker strip's 12px box — where the alternative slashed
  // circle collapses (its ring lands at 2.64 device px on a DPR2 desktop over
  // a ~3 CSS px counter) and shape-collides with `.ob-pb-pot--dark`, the
  // ringed 8-ball pot dot. DELIBERATE per-path stroke-width override (the
  // `fill="currentColor"` precedent above overrides the same way): the house
  // 1.5 renders 0.90 CSS px at size 12 and dissolves at strip scale, while
  // 3.0 on the 20-grid is the measured 1.80 CSS px the decision sheet judged.
  // Legs run 4.25→15.75 so the round-capped union ink is 36.98 CSS px² =
  // 0.96× a 7px pot dot — the sheet's budget, so the mark reads without
  // shouting over the pot vocabulary it sits beside.
  foul: '<path d="M4.25 4.25L15.75 15.75M15.75 4.25L4.25 15.75"'
    + ' stroke-width="3"/>',
  // ivory sparkle — the win / drill-complete marker glyph
  sparkle: '<path d="M10 2.8C10.6 6.8 13.2 9.4 17.2 10C13.2 10.6 10.6 13.2 '
    + '10 17.2C9.4 13.2 6.8 10.6 2.8 10C6.8 9.4 9.4 6.8 10 2.8Z" '
    + 'fill="currentColor" stroke="none"/>',
  // replay link: chain
  link: '<path d="M8.3 11.7L11.7 8.3"/>'
    + '<path d="M7.2 9L5.3 10.9A3 3 0 0 0 9.1 14.7L11 12.8"/>'
    + '<path d="M12.8 11L14.7 9.1A3 3 0 0 0 10.9 5.3L9 7.2"/>',
  // copy: two offset sheets
  copy: '<rect x="6.8" y="6.8" width="9" height="9" rx="1.4"/>'
    + '<path d="M4.2 12.4A1.4 1.4 0 0 1 3 11V4.4A1.4 1.4 0 0 1 4.4 3H11'
    + 'A1.4 1.4 0 0 1 12.4 4.2"/>',
  // Photos destination: framed landscape photo
  photos: '<rect x="3" y="4" width="14" height="12" rx="1.6"/>'
    + '<circle cx="7.1" cy="7.9" r="1.25"/>'
    + '<path d="M5.1 14.4L9.6 10.2L12.1 12.7L13.9 11.2L14.9 12.1"/>',
  // Files destination: folder
  folder: '<path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H7.8L9.8 6H15.5'
    + 'A1.5 1.5 0 0 1 17 7.5V14.5A1.5 1.5 0 0 1 15.5 16H4.5'
    + 'A1.5 1.5 0 0 1 3 14.5Z"/>',
};

export const ICON_NAMES = Object.keys(PATHS);

/** Inline-SVG markup for `name` (aria-hidden decorative graphic; the OWNING
 * control carries the localized title/aria-label). '' for unknown names so
 * fresher consumers degrade to their text-glyph fallback. */
export function iconHtml(name, { size = 20 } = {}) {
  const d = PATHS[name];
  if (!d) return '';
  return `<svg viewBox="0 0 20 20" width="${size}" height="${size}"`
    + ` fill="none" stroke="currentColor" stroke-width="1.5"`
    + ` stroke-linecap="round" stroke-linejoin="round"`
    + ` aria-hidden="true" focusable="false" data-icon="${name}">${d}</svg>`;
}

/** SVGElement for `name` (null for unknown names — callers keep their text
 * fallback). Fresh element per call; safe to adopt anywhere. */
export function icon(name, opts) {
  const html = iconHtml(name, opts);
  if (!html) return null;
  const holder = document.createElement('div');
  holder.innerHTML = html;
  return holder.firstElementChild;
}
