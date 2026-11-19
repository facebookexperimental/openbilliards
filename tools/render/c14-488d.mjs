// Copyright (c) Meta Platforms, Inc. and affiliates.

// c14-488d.mjs — GH-488D wave A2: gate C14 "section-curve disjointness" for
// the DIAMOND Pro-Am 9 ft table (diamond_proam_9ft).
//
// WHAT THIS IS. A thin runner. The law lives in tools/render/c14-disjoint.mjs
// and is imported VERBATIM — not forked, not copied, not edited. This file
// only does the three things the library cannot do for itself:
//   1. boot the diamond table in chrome-headless-shell and extract the six
//      pocket bays' triangle soup out of the LIVE scene graph;
//   2. name the families the diamond way (dm-*, not the snooker obSnk*), and
//      pick the slice ladder + the mouth-band stations from THIS table's own
//      geometry rather than from snooker constants;
//   3. print the census and archive the record.
//
// The structural template is tools/render/check-pocket-construction.mjs
// (its C14 section at :812 — the C14_BOX, the chunked window.__c14Chunk
// transfer, the cup list, the bar() calls, the --c14-json dump). Everything
// that differs from it below differs for a measured reason, recorded inline.
//
// FOUR DIFFERENCES FROM THE SNOOKER RUNNER, all forced by the subject:
//
//  A. SIX BAYS, not four corners. The diamond side pocket is a real bay with
//     its own jaw pair (kernel side mouth SP-01 127 mm, side jaw radius
//     SP-06, its own boot SP-10 and trap cup), so it is sectioned like any
//     other bay. The snooker runner only ever ran corners. (Wave A2 also
//     named a side C-channel liner SP-11; D621-ALIGN r6 retired it.)
//
//  B. FAMILY KEYS ARE dm-*. The diamond furniture was named in wave A2
//     (web/scene/table.js :9164 dmFor) as `dm-<family>[-<instance>]`, where
//     the instance suffix is an ordinal (`-3`), a pocket tag (`-c0`, `-s4`)
//     or a leg corner (`-fr`). The family is the name with those suffixes
//     stripped: dm-cushion-7 -> dm-cushion, dm-bootsleeve-c0-1 ->
//     dm-bootsleeve, dm-falllip-c5 -> dm-falllip. Instances of one family
//     are merged, exactly as the snooker run merges its per-corner copies:
//     c14Run keys its family map on the name, and two instances of the same
//     part are one surface for the purposes of "do two SURFACES cross".
//     Names are read from the scene, never re-derived from material
//     identity — every mesh in these bays carries one.
//
//  C. THE SLICE LADDER IS THIS TABLE'S. defaultSlices() is authored on
//     snooker heights (rail top 43.5, nose 36.75). The diamond ladder is
//     authored on OB-488D-GEO-001 r2: bed 0 (datum A), cushion nose
//     36.5125 (CU-03), rubber-rail top 44.45 (CU-09), rail-top wood plane
//     (RB-02 / render frameTop), the casting's own extrude span
//     [-22.5, +47.5] (table.js diamond shield opts) and the boot furniture
//     below the bed. Step and anchor discipline are the library's.
//
//  D. THE MOUTH LAW RUNS ON CORNERS ONLY, and says so. mouthExposure's
//     frame is a CORNER frame: it bounds two flank rectangles, one per axis,
//     each running inboard from a nose corner, and it gates each on cloth
//     being present in that flank's ray corridor. A side bay has both jaws
//     on the SAME rail and no nose corner, so the second (cross-rail)
//     rectangle lands in open playfield, finds no cushion cloth and trips
//     the library's fail-closed NO-CLOTH clause. That would be a false red,
//     not a measurement. Side-bay mouth intrusion is therefore reported by
//     the CENSUS here (which is bay-shaped and needs no corner frame), and
//     the side mouth-exposure row is printed ABSENT with this reason. It is
//     a gap in the instrument, and it is named rather than papered over.
//
// BASELINE DISCIPLINE. defaultBaseline() names snooker construction
// (obPocket* hardware, obSnkPanel/Soffit/Slab carcass, the obPocketCap
// leather rebate); none of those names exist on this table, so it returns
// null for every dm-* pair and baselines nothing. diamondBaseline() below
// therefore carries this table's own entries — and each one is held to three
// rules, because a baseline entry is a decision NOT to adjudicate a crossing:
//
//   1. RED BASIS FIRST. Two red bases ride in this directory, both taken
//      with the hook EMPTY: c14-red-basis-488d.json (wave A2, the hook
//      shipped with zero entries; the pre-D621 casting + boot-stack
//      construction) and c14-red-basis-488d-r6.json (D621-ALIGN r6,
//      `--hook-empty`; the purchased-model construction the entries below
//      describe). Every record any entry now clears is on file as a red one
//      in the r6 basis.
//   2. DERIVED, NOT FITTED. Every window quotes an authored constant from
//      web/scene/table.js (the diamond_proam_9ft render keys, tagged
//      MFR/MODEL/DERIVED there) or a pin read live off the app (see
//      setDiamondPins) — never a number read off the artifact it is meant to
//      admit. The hook is FAIL-CLOSED: with no pins, DM is null and nothing
//      is baselined. The r6 windows are bay-shaped (the boot's own U
//      footprint about the cup's axis), so the runner calls c14Run one bay at
//      a time and tells the hook which bay it is judging (runCensus /
//      setDiamondCup); the records are identical to a single all-bays call.
//   3. RED-ARMED. `--red-arm` moves the family each clause names by a known
//      offset that takes the contact out of the construction described, and
//      shows the clause stops firing (see RED_ARMS).
//
// Three entries are labelled INSTRUMENT LIMITATION rather than construction:
// they name a reading the section ladder cannot take honestly — an unsigned
// embed on a clearance (dm8), a parity read in a shared or degenerate plane
// (dm6/dm6b, dm9) — and each is backed by a measurement recorded at the
// clause. Two of them (dm8, dm9) exist because the r6 cap top is CROWNED:
// every station between the crown's outer fall and the plateau cuts the top
// surface, and the chained iso-line does not close, which turns the
// ADJUDICATE-class rail-lap lamination into NO-EXIT reads and makes parity
// against the caps undefined there. The wave A2 entries for the casting
// rebate (dm2a/b/c) and the nested boot shells were RETIRED in r6 with the
// anatomy they described, and the A2 sub-rail tuck (dm3) and side-notch
// (dm5) entries were retired as dormant — no r6 red record carries their
// signature, and --red-arm treats an unexercised clause as a failed one
// (see diamondBaseline; the tag numbers are kept stable, so the sequence has
// gaps).
//
// Usage:
//   node tools/render/c14-488d.mjs [--inventory] [--json <record.json>]
//     [--cups all|corners|sides] [--top N] [--no-mouth] [--red-arm]
//     [--hook-empty]              (RED BASIS: every dm-* entry returns null)
//     [--dump-tris <soup.json>]   (diagnostic soup, see DUMP_TRIS)
//     [--slices a,b,c]            (diagnostic ladder, see SLICES_OVERRIDE)
// Ports: OB_E2E_PORT / OB_E2E_CDP_PORT pin, else the 488d lane band
// 24470-24499 via claimPortBand (the /tmp/ob-port-bands registry makes the
// lane mutex-safe against the other agents running concurrently).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// FIX3 (review round 3 on #731 P2 (a), refuter pass 3 sweep): the C14 record (bars + verdicts) at an explicit --json is removed as the
// FIRST effect of the run, from the raw command line, before any option guard can refuse
// FIX8 (review round 8 on #731 P2 A + B): MODE-SCOPED through the shared resolver — `--inventory` prints and returns before the
// record write, so it owns nothing at --json (it used to remove the record); the census (re)produces the record. The --cups
// selection is validated against its known set BEFORE the removal: an unknown value used to filter to zero bays and rewrite the
// record over an empty cup set after the prior record was gone.
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — help exits 0, errors exit 2 — BEFORE any effect; destinations, selections and the mode come from the PARSED result, never from a re-read of argv
const __P = __parseArgv({ tag: 'c14-488d', value: ['--json', '--cups', '--top', '--slices', '--dump-tris'], bool: ['--inventory', '--no-mouth', '--red-arm'] });
{ const { resolveMode: __rm0, invalidateForMode: __ifm0, validateSelection: __vs0 } = await import('./lib/mode-outputs.mjs');
  const __j0 = __P.value('--json'); const __cups0 = __P.value('--cups');
  const __mode0 = __rm0(__P.args, [['--inventory', 'inventory']], { defaultMode: 'census' });
  let __t1 = []; if (__j0) { const __f0 = path.resolve(String(__j0)); __t1 = __ifm0({ OUT: null, mode: __mode0, outputs: { census: [__f0], inventory: [] }, tag: 'c14-488d' }); } // tier 1: the explicit record is the tool's own literal destination (absolute, as given — FIX4)
  if (__cups0 !== null) __vs0({ values: [__cups0], known: ['all', 'corners', 'sides'], what: 'cups selection', tag: 'c14-488d', removed: __t1 }); } // the selection's known-set check (tier 2), after the parse

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const webDir = path.join(REPO, 'web');
const cdp = await import(path.join(webDir, 'tools', 'cdp.mjs'));
const {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand,
} = cdp;
const c14 = await import(new URL('./c14-disjoint.mjs', import.meta.url).href);

const argv = (await import('./lib/argv.mjs')).expandEqArgs(process.argv.slice(2)); // FIX10 (Fable pass 1): the run's view of the argv is the =-expanded view the parse consumed
const argOf = (k, d) => { const i = argv.lastIndexOf(k); return i >= 0 ? argv[i + 1] : d; };
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value

const INVENTORY = argv.includes('--inventory');
const JSON_OUT = __pathOpt('--json', { default: null, tag: 'c14-488d' });
const CUPS_SEL = __stringOpt('--cups', { default: 'all', tag: 'c14-488d' }); // FIX8 (Fable pass 1): the same reader the validation used (argOf read the FIRST space-form occurrence)
const TOP = Number(argOf('--top', 12));
const NO_MOUTH = argv.includes('--no-mouth');
// Diagnostic side-channel, never part of a verdict: writes the transferred
// triangle soup (family-keyed, world metres) so a red record can be
// re-measured and PERTURBED offline against the same law module without
// relaunching the browser. That is how this instrument's teeth are proven:
// translate one family by a known offset, re-run c14Run on the same soup,
// and watch the census move by the amount the offset predicts.
const DUMP_TRIS = __pathOpt('--dump-tris', { default: null, tag: 'c14-488d' });
// Diagnostic ladder override, never a verdict ladder: `--slices 46.7,46.8,46.9`
// runs the census on exactly those stations. It exists so a single record can
// be interrogated in its own neighbourhood (is this reading confined to one
// plane, or does it survive a 0.1 mm move of the cut?) without paying for the
// full 92-station run. Any record written with it is stamped DIAGNOSTIC in the
// JSON `_note` and must never be quoted as a gate result.
const SLICES_OVERRIDE = argOf('--slices', null);
// Instrument-teeth proof for the baseline hook (see diamondBaseline). For each
// clause that fired, translate the family it exempts by a known offset and
// re-run the census on that clause's OWN stations: an honest clause stops
// firing and its records go back to FAIL. Runs in-process on the same live
// mesh, so it proves the teeth of the shipped run, not of a stale soup.
const RED_ARM = argv.includes('--red-arm');
// RED BASIS switch (D621-ALIGN r6). With --hook-empty diamondBaseline returns
// null for every dm-* pair, so the census is the unexempted red state of the
// build under test — the same thing wave A2 did by shipping the hook with
// zero entries. The pins are still read and the ladder is still derived from
// them, so a red basis and the run that clears it share one ladder exactly.
// Two red-basis files ride in this directory:
//   c14-red-basis-488d.json     wave A2 (hook with zero entries), the
//                               pre-D621 casting/boot-stack construction —
//                               kept as the historical basis;
//   c14-red-basis-488d-r6.json  D621-ALIGN r6 (--hook-empty), the
//                               purchased-model construction this file's
//                               clauses now describe.
const HOOK_EMPTY = argv.includes('--hook-empty');

const TABLE = 'diamond_proam_9ft';

// Extraction box, per bay. Admission is triangle-AABB vs this box —
// deliberately NOT an exact triangle-box test, and deliberately generous:
// the box decides only what is TRANSFERRED, while c14Run applies its own
// r <= 150 mm ROI test to reported crossings and never to the geometry.
// Over-admission is therefore free; under-admission would open a section
// curve the measurement needs shut. y spans the whole furniture stack:
// wave A2 MEASURED (--inventory) the return shaft bottoming at -203.5 mm and
// the boot collar cresting at +53.5 mm; the D621-ALIGN r6 construction puts
// the trap cup's bottom at -146.2 mm (pocketCup.bottom) and the boot crest at
// +56.2 mm (bootSection.section), both still inside [-210, +60], so every bay
// part is transferred whole — no truncated solid can fake an open curve at a
// cut plane. (The legs, the cabinet walls and the apron band run on below
// -210; their side quads are admitted whole by the AABB test, so their
// sections stay closed at every station the ladder reaches.)
const C14_BOX = { dxz: 0.22, y0: -0.21, y1: 0.06 };

/**
 * The diamond family key. Runtime names are `dm-<family>[-<instance>]`;
 * the instance suffix is an ordinal, a pocket tag (`c0`..`s5`), a leg
 * corner (`fr`/`hl`) or — D621-ALIGN r6 — a single end/side letter
 * (`dm-cabinet-end-f`/`-h`, `dm-cabinet-side-l`/`-r`, `dm-kerffloor-l`/`-r`).
 * Everything before the first instance token is the family. Non-dm names
 * (anything the diamond namer did not reach) pass through unchanged so they
 * can never be silently merged into a dm family.
 */
const INSTANCE = /^(?:\d+|[cs]\d+|[fh][lr]|[fhlr])$/;
export function familyOf(name) {
  if (!name || !name.startsWith('dm-')) return name || '(anon)';
  const parts = name.split('-');
  const out = [parts[0]];
  for (let i = 1; i < parts.length; i++) {
    if (INSTANCE.test(parts[i])) break;
    out.push(parts[i]);
  }
  return out.join('-');
}

/**
 * The diamond slice ladder. Same construction as defaultSlices() — a uniform
 * 2.5 mm step plus mandatory anchors on authored heights — but the span and
 * the anchors are this table's. Two generations of anchors ride together,
 * because the ladder's contract is a STRICT SUPERSET of every red basis it
 * has ever been compared against (a dropped station could only hide a
 * crossing a basis recorded):
 *
 *   -150 .. +59  the whole bay stack. D621-ALIGN r6: the trap cup bottoms at
 *                -146.2 (pocketCup.bottom; the corner cups' floors are raised
 *                to the leg top + 1 mm = -131.9, table.js diamondPocket) and
 *                the boot crests at +56.2 (bootSection.section), so both ends
 *                of the ladder sit outside real bay geometry and no part is
 *                judged half-seen. (Wave A2 ran -140 .. +59 on the old boot
 *                hem at -135.8 / collar crest at +56.8; the r6 floor is four
 *                step stations lower on the same 2.5 mm grid phase.) The legs,
 *                cabinet walls and apron band continue below -150 — carcass,
 *                not bay construction; transferred whole, not laddered.
 *
 *   LITERAL ANCHORS (kept verbatim from wave A2 / A2.5 for the superset
 *   contract even where the feature they named is retired):
 *   -132.5  A2 boot skirt bottom / hem ring top (retired anatomy)
 *    -22.5  A2 pocket casting extrusion bottom (casting RETIRED in r6)
 *    -13.8  A2 boot collar bottom (CP-11 inner shim; retired)
 *     -4.8  fall lip bottom (table.js FALL_LIP_R 3/16 in — still built)
 *      0.0  datum A, the playing surface (bed cloth top)
 *     13.0  the library's own lower mouth-band anchor
 *     33.0  jaw mid-height (library anchor)
 *   36.5125 CU-03 cushion nose height above bed (kernel-collision pin)
 *     41.3  A2 collar buried face bottom = old SHELF 50.8 - 9.5 (retired)
 *     42.0  library anchor
 *    44.45  CU-09 rubber-rail top plane above bed = cushion crest
 *     46.8  A2 wing-shim sealed lower edge = old SHELF - 4.0 (retired)
 *     47.0  r1 rail top (retired spec value; kept)
 *     47.5  A2 casting extrusion top (retired)
 *     50.8  A2.5 RB-02 rail top (retired in r6 — the cap top is 44.68 now)
 *     53.5  A2 first-cut collar crest (retired)
 *     56.8  A2 collar crest = old SHELF + 6 (retired)
 *
 *   PIN-DERIVED ANCHORS (D621-ALIGN r6; added from the live pins when they
 *   are set — see setDiamondPins — so a repin moves them instead of
 *   orphaning them the way RB-02 orphaned the A2 literals). On the r6 build:
 *    -14.2  boot throat sleeve bottom (bootSection.section min z, "skirt")
 *     -7.1  trap cup open top (pocketCup.top)
 *     42.3  boot outer-wall top (bootSection.wallTop)
 *    44.45  cushion top (cushionProfile zTop; coincides with CU-09)
 *    44.68  SHELF = render.frameTop + castingProud: the crowned cap's
 *           plateau, the plane every wedge/cap clause is measured from
 *     56.2  boot crest (bootSection.section max z)
 *   The r6 red basis (c14-red-basis-488d-r6.json) was taken with the pins
 *   set, so it carries exactly this ladder; the A2 basis
 *   (c14-red-basis-488d.json) carries the -140 .. +59 / 87-station ladder,
 *   of which this is a strict superset.
 */
export function diamondSlices(pins = DM) {
  const s = [];
  for (let y = -150; y <= 59 + 1e-9; y += 2.5) s.push(+y.toFixed(4));
  const anchors = [-132.5, -22.5, -13.8, -4.8, 13, 33, 36.5125, 41.3, 42,
    44.45, 46.8, 47, 47.5, 50.8, 53.5, 56.8];
  if (pins) {
    anchors.push(pins.SKIRT_BOTTOM, pins.CUP_TOP, pins.WALL_TOP, pins.ZTOP,
      pins.SHELF, pins.CREST);
  }
  // Dedupe at 0.01 mm, not 1e-6: the pin-derived cushion top is 44.4495 and
  // the literal CU-09 anchor is 44.45 — two stations half a micron apart are
  // one station read twice (the first r6 dry run carried both).
  for (const a of anchors) {
    if (!s.some((v) => Math.abs(v - a) < 1e-2)) s.push(+a.toFixed(4));
  }
  return s.sort((a, b) => a - b);
}

/** Mouth-band ladder: the library's, plus the diamond nose anchor. The band
 *  bounds (13 .. 41) still hold here — this table's nose (36.5125) and rail
 *  top (44.45 rubber / 50.8 cap, r2) sit close enough to snooker's (36.75 /
 *  43.5) that the band still brackets the same two features,
 *  so the same band brackets "the height at which the jaw section closes"
 *  and "the crest fillet where the mouth side is degenerate". */
export function diamondMouthSlices() {
  const s = c14.mouthSlices();
  if (!s.some((v) => Math.abs(v - 36.5125) < 1e-6)) s.push(36.5125);
  return s.sort((a, b) => a - b);
}

/**
 * Geometry the baseline clauses are DERIVED from, filled in from the live
 * app's own pins before c14Run is called (setDiamondPins, below). Never
 * literals: every window and every bound in diamondBaseline() is expressed
 * against these, so a repin of the rail stack or of the boot moves the
 * exemptions with it instead of orphaning them the way the flap heights were
 * orphaned by RB-02 (and the way the A2 casting-rebate clauses were orphaned
 * by D621-ALIGN, which retired the casting altogether).
 *
 * FAIL-CLOSED: while this is null every dm-* clause returns null and the
 * census is the RED BASIS. A run that cannot read the pins baselines nothing.
 * The r6 pins require the purchased-model keys (mouthCollar.landing/legRun,
 * bootSection, pocketCup, railJoint) — an entry without them is not the
 * construction these clauses describe, and gets no exemption.
 */
let DM = null;
/** The bay under adjudication. c14Run hands the hook a contact's offset from
 *  the cup centre but not the cup, and the r6 windows are the bay's OWN boot
 *  footprint (which needs the cup's axis and its corner/side family), so the
 *  runner calls c14Run one bay at a time and sets this first (runCensus). */
let CUR = null;
export function setDiamondCup(cup) { CUR = cup; }

// Three literals quoted from web/scene/table.js that the live pins cannot
// carry because they are block-local constants there. Each is named at its
// source; none is a number read off the artifact it admits.
const FALL_LIP_R_MM = 4.8;      // table.js diamondPocket `FALL_LIP_R = 0.0048` (3/16 in, D21)
const THROAT_LIP_MM = 3.8;      // table.js collarSectionModel `rT = rw - 0.0038`
const WEDGE_UNDER_WALL_MM = 0.8; // table.js wedge ceiling `wallCeil = wallTop - 0.0008`
const WEDGE_UNDER_CAP_MM = 0.1;  // table.js wedge ceiling `crowned cap top - 0.0001`

/**
 * @param pins the PINS_EVAL payload (live G).
 *  SHELF   = frameTop + castingProud — the crowned cap's plateau (table.js
 *            castingTop()); 44.68 on r6 (MODEL). Every cap/wedge window is
 *            measured DOWN from it.
 *  RWS     = every boot lathe axis radius on this table, p.r + 4 mm
 *            (table.js diamondPocket `rw = p.r + 0.004`) — 52.26 mm at the
 *            four corners, 54.80 mm at the two sides.
 *  SNR     = the rail cap's side-pocket notch radius = the side boot's own
 *            outer wall, rw_side + mouthCollar.landing.side (table.js
 *            proamRailPlans `rN`) — 99.8 on r6. (Wave A2: side r + 16 + 20.)
 *  fam     = per boot family (corner / side): RW, LANDING (mouthCollar), the
 *            outer wall R_OUT = RW + LANDING, LEG_RUN (mouthCollar.legRun; 0
 *            at the sides), THROAT_IN = the deepest throat inset below RW
 *            (collarSectionModel: rT = RW - 3.8, and the section's most
 *            negative t times the band LANDING + 3.8), and R_CUT = the
 *            wedge-ceiling footprint radius R_OUT + railJoint.cutClear +
 *            railJoint.kerf / 2 (table.js `rCutK`).
 *  WALL_TOP / CREST / SKIRT_BOTTOM / UNDERSIDE = bootSection heights: the
 *            outer wall top (wallTop), the section's max z, its min z (the
 *            throat sleeve's bottom) and the lowest group-5 (underside) row.
 *  CUP_TOP / CUP_R / CUP_BOTTOM = pocketCup; CUP_FLOOR_CORNER = the corner
 *            floor, raised to the leg top + 1 mm (table.js diamondPocket
 *            `legTopY`).
 *  ZTOP    = the cushion top (cushionProfile zTop), the plane the wedge's
 *            flange rows are capped at (table.js FLAP / capY).
 *  CROWN_MAX_DROP = the deepest capCrown row, the cap top's fall at the
 *            outer edge.
 *  NOTCH_ARC = the side notch's run between its two crossings of the
 *            cushion's rear face: SNR * (pi + 2 asin((sidePocketDepth - CW)
 *            / SNR)).
 */
export function setDiamondPins(pins) {
  const R = pins.render ?? {};
  const mc = R.mouthCollar, bs = R.bootSection, cup = R.pocketCup, rj = R.railJoint;
  const pk = pins.pockets ?? [];
  // D621-PLAN-1: ring entries (mouthCollar.ring) replace the legRun letter —
  // the boot hangs on the MODEL circles about a centre `ring.centre` out
  // along the pocket axis from the nose-line intersection, and its arms end
  // on the CU-10 glue plane (table.js bootRingPlan). The pins below are the
  // same quantities derived from those keys.
  const RING = mc?.ring ?? null;
  if (!pk.length || !mc?.landing || !(mc?.legRun || RING) || !bs?.section?.length
    || !cup || !rj || pins.cushionTop == null) return;   // fail-closed
  const rs = pk.map((p) => p.r * 1000 + 4);
  const side = pk.filter((p) => !p.corner).map((p) => p.r * 1000);
  const corner = pk.filter((p) => p.corner).map((p) => p.r * 1000);
  if (!side.length || !corner.length) return;
  const zs = bs.section.map((row) => row[1]);
  const tMin = Math.min(...bs.section.map((row) => row[0]));
  const under = bs.section.filter((row) => row[2] === 5).map((row) => row[1]);
  const CWmm = pins.CW * 1000;
  const bevelR = ((pins.subRailBevelDeg ?? 0) * Math.PI) / 180;
  const ZTOPmm = pins.cushionTop * 1000;
  const glue0 = CWmm - ZTOPmm * Math.tan(bevelR);   // the glue plane behind the nose at the bed (table.js glueAt(0))
  // the kernel disc centre's depth behind the nose lines: corner cd per axis (= cornerPocketDepth/√2), side sidePocketDepth
  const cornerCd = (pins.cd ?? 0) * 1000;
  const sideCd = (pins.sidePocketDepth ?? 0) * 1000;
  const fam = (kind, rMm) => {
    const RW = rMm + 4;
    if (RING && RING[kind]) {
      const R = RING[kind];
      const R_OUT = R.rOut * 1000, U_OUT = R.centre * 1000, U_IN = R.throatCentre * 1000,
        R_IN = R.throatR * 1000, W_LEG = R.legInner * 1000;
      const BAND = R_OUT - (U_IN + R_IN - U_OUT);      // the apex band (outer wall - throat apex)
      const LANDING = R_OUT - RW;                       // the wall past the fall wall (the letter's meaning, derived)
      // the ring centre's offset from the cup (kernel disc) centre, outboard along the axis
      const OFF = U_OUT - (kind === 'corner' ? cornerCd * Math.SQRT2 : sideCd);
      const LEG_RUN = kind === 'corner' ? U_OUT + R_OUT - Math.SQRT2 * glue0 : U_OUT - glue0;
      return {
        kind, RW, LANDING, R_OUT, RING: true, U_OUT, U_IN, R_IN, W_LEG, OFF, BAND,
        LEG_RUN: Math.max(0, LEG_RUN),
        THROAT_IN: Math.max(0, -tMin) * BAND,            // the throat's deepest inset below its wall
        R_CUT: R_OUT + (rj.cutClear ?? 0) * 1000 + ((rj.kerf ?? 0) * 1000) / 2,
      };
    }
    const LANDING = mc.landing[kind] * 1000;
    const band = LANDING + THROAT_LIP_MM;             // collarSectionModel R - rT
    return {
      kind, RW, LANDING, R_OUT: RW + LANDING, RING: false, OFF: 0, BAND: band,
      LEG_RUN: (mc.legRun[kind] ?? 0) * 1000,
      THROAT_IN: THROAT_LIP_MM + Math.max(0, -tMin) * band,
      R_CUT: RW + LANDING + (rj.cutClear ?? 0) * 1000 + ((rj.kerf ?? 0) * 1000) / 2,
    };
  };
  const SHELF = (pins.frameTop + (pins.castingProud ?? 0)) * 1000;
  const SNR = RING?.side ? RING.side.rOut * 1000 : Math.min(...side) + 4 + mc.landing.side * 1000;
  const WALL_TOP = bs.wallTop * 1000, CREST = Math.max(...zs);
  const CW = pins.CW * 1000;
  const ZTOP = pins.cushionTop * 1000;
  const LAP = (R.railLap ?? 0.002) * 1000;               // frameGeom LAP
  const bevel = ((pins.subRailBevelDeg ?? 0) * Math.PI) / 180;
  DM = {
    SHELF,
    L_HALF: (pins.L * 1000) / 2, W_HALF: (pins.W * 1000) / 2,
    LAP,
    // the height above which the bevelled rear face stands behind the cap's
    // inner edge (the lap is LAP at the top and closes LAP / tan(bevel) down)
    LAP_Y0: bevel > 0 ? ZTOP - LAP / Math.tan(bevel) : 0,
    FACING_RAD: { corner: ((pins.facingDeg?.corner ?? 0) * Math.PI) / 180,
      side: ((pins.facingDeg?.side ?? 0) * Math.PI) / 180 },
    CUT_CLEAR: (rj.cutClear ?? 0) * 1000,
    RWS: [...new Set(rs)].sort((a, b) => a - b),
    RW_MIN: Math.min(...rs),
    RW_MAX: Math.max(...rs),
    SNR,
    NOTCH_ARC: SNR * (Math.PI + 2 * Math.asin(Math.min(1,
      Math.max(0, (RING?.side ? RING.side.centre * 1000 : pins.sidePocketDepth * 1000) - CW) / SNR))),
    CW,
    RING: !!RING,
    GLUE0: glue0,
    fam: { corner: fam('corner', Math.min(...corner)), side: fam('side', Math.min(...side)) },
    WALL_TOP, CREST,
    // D621-PLAN-2: ring entries loft the model's top profile — the leg crest
    // is that table's highest leg row; the legCrest fraction serves the
    // pre-ring fallback only
    LEG_CREST: (bs.topProfile && bs.topProfile.corner && bs.topProfile.corner.legBySpan)
      ? Math.max(...bs.topProfile.corner.legBySpan.flatMap((r) => r[1]))
      : WALL_TOP + (CREST - WALL_TOP) * (bs.legCrest ?? 1),
    SKIRT_BOTTOM: Math.min(...zs),
    UNDERSIDE: under.length ? Math.min(...under) : 0,
    CUP_TOP: cup.top * 1000, CUP_R: cup.r * 1000, CUP_BOTTOM: cup.bottom * 1000,
    CUP_FLOOR_CORNER: (R.apronBand && R.legSection)
      ? Math.max(cup.bottom * 1000, -R.apronBand.height * 1000 + 1) : cup.bottom * 1000,
    ZTOP,
    CROWN_MAX_DROP: Math.max(0, ...((R.capCrown ?? []).map((row) => row[1]))),
  };
}
export function diamondPins() { return DM; }

/**
 * Where a contact sits in the bay's boot footprint, in the frame table.js
 * itself uses for the wedge ceiling (diamondPocket / the "wedge lies UNDER
 * the boot's leather" block): s = axial offset INTO the table along the
 * pocket axis (corner: the diagonal toward the table centre; side: across
 * the table), l = |lateral| from that axis, r = plan distance from the cup
 * centre. The footprint is the U: the outboard half-disc (s <= 0, r <= R)
 * plus the two legs (0 <= s <= LEG_RUN, l <= R). Returned for two radii:
 * inBoot uses the boot's own outer wall R_OUT (+slack, tessellation only),
 * inCut the wedge-ceiling radius R_CUT that table.js clamps under the wall.
 */
function bootFootprint(u, v, slack = 0.5) {
  const F = CUR.corner ? DM.fam.corner : DM.fam.side;
  const ux = CUR.corner ? -Math.sign(CUR.x) * Math.SQRT1_2 : 0;
  const uz = CUR.corner ? -Math.sign(CUR.z) * Math.SQRT1_2 : -Math.sign(CUR.z);
  // D621-PLAN-1: on ring entries the U is about the MODEL ring centre, F.OFF
  // further outboard than the cup axis the contact offsets are given from
  const s = u * ux + v * uz + (F.OFF ?? 0);
  const l = Math.abs(-u * uz + v * ux);
  const r = Math.hypot(s, l);
  const inU = (rad) => (s <= 0 ? r <= rad + slack
    : (s <= F.LEG_RUN + slack && l <= rad + slack));
  return { s, l, r, F, inBoot: inU(F.R_OUT), inCut: inU(F.R_CUT) };
}

/**
 * Does a contact sit in the cap's lip band — the strip between the cap's
 * inner edge (CW - LAP behind a nose line; frameGeom KIN) and the cushion's
 * rear face at the top (CW)? The band is where the authored railLap tuck
 * puts wood inside the cushion so the wood|cloth seam carries no daylight;
 * the law's ADJUDICATE tier already names it along the rails. Measured
 * against BOTH nose lines (a corner bay sees two rails), +-0.5 mm slack.
 */
function lipBand(u, v, slack = 0.5) {
  const wx = CUR.x * 1000 + u, wz = CUR.z * 1000 + v;
  const kx = Math.abs(wx) - DM.L_HALF, kz = Math.abs(wz) - DM.W_HALF;
  const lo = DM.CW - DM.LAP - slack, hi = DM.CW + slack;
  return (kx >= lo && kx <= hi) || (kz >= lo && kz <= hi);
}

/** The below-bed ball-return furniture on r6: the trap cup (MODEL
 *  pool_trap01/03 — an open-top slot, r 74.4 about the ring centre, walls
 *  from bed -7.1 down to -146.2) and its floor (a flat sheet ON the wall
 *  bottom plane). The A2 rim / bowl / skirt / hem / return-shaft anatomy is
 *  not built for entries that declare bootSection (table.js diamondPocket
 *  `if (!bootModel)`). Both live strictly below datum A. */
const DM_BOOT_HW = new Set(['dm-pocketcup', 'dm-pocketcupfloor']);
/** The two throat parts that bridge the bed plane: the tall padded boot ring
 *  (CP-11 / SP-10, from the purchased model — its throat sleeve hangs to
 *  -14.2 below the bed) and the cloth fall lip (CP-09) that carries the bed
 *  cloth over the hole edge. */
const DM_BOOT_THROAT = new Set(['dm-bootcollar', 'dm-falllip']);
/** The finished cap wood: six crowned caps (RB-01/RB-02, cut round the boot)
 *  and the four keystone corner blocks (CP-15; MFR "Rail Cap"). The casting
 *  (CP-10) and the side liner (SP-11) are RETIRED in r6 and no longer exist
 *  on this table (table.js `noShields`). */
const DM_CAPPING = new Set(['dm-railtop', 'dm-cornerblock']);
/** The jaw facing stack the boot's U legs drape over: the cloth-covered
 *  facing wedge (CP-03; bootSleeveCloth), the cushion end it skins and the
 *  sub-rail beam behind the glue plane. */
const DM_FACING = new Set(['dm-bootsleeve', 'dm-cushion', 'dm-subrail']);

/**
 * Baseline hook — the D621-ALIGN r6 entries, each with its construction, its
 * window and its MEASURED bounds. The wave A2 entries (dm1 nested boot
 * shells, dm2a/b/c collar rebate into the casting) described anatomy that no
 * longer exists on this table and were RETIRED, not carried: the boot is now
 * the purchased model's tall padded ring standing on the bed with its throat
 * sleeve hanging into a trap cup, the caps are cut 2 mm clear of it, and
 * there is no casting to be let into. The red basis this file's entries
 * clear is c14-red-basis-488d-r6.json (taken with --hook-empty on the r6
 * build); the A2 basis c14-red-basis-488d.json stays on file for the record.
 *
 * A baseline entry is a decision not to adjudicate a crossing: the gate
 * records it, prints it, and stops asking whether it is a defect. Every entry
 * is therefore a place a real defect can hide. Three disciplines keep these
 * honest, all inherited from defaultBaseline:
 *   - every bound is DERIVED from an authored constant in web/scene/table.js
 *     (the diamond_proam_9ft render keys carry MFR/MODEL/DERIVED tags) or a
 *     pin read live off the app, and is quoted here with its source;
 *   - every bound is fail-closed — a missing measurement means no exemption;
 *   - every entry is red-arm proven: `--red-arm` perturbs the offending
 *     family on the live mesh and shows the clause STOPS firing (RED_ARMS).
 *
 * The library's own honesty rule — "no entry can name obSnkJawWrap, cloth or
 * railwood above the bed, so the defect this gate was written for cannot hide
 * behind it" — has diamond analogues that ARE named here, deliberately and
 * bounded: clause (2) names the cushion and the cloth wedge INSIDE the
 * leather leg, but only inside this bay's own boot footprint and only below
 * the cap top — a jaw-scale excursion of either OUT of the leather is not a
 * crossing with the leather and is not admitted by anything here; clauses
 * (7) and (8) name the cushion / the wedge against the cap only ON the cap's
 * 2 mm rail-lap band, at the authored lap depth (7) or with the NO-EXIT +
 * far-side signature no burial can produce (8).
 *
 * It delegates to defaultBaseline for any non-dm name so that a mesh this
 * runner failed to name still gets the library's own judgement.
 */
export function diamondBaseline(a, b, Ymm, meas = {}) {
  const A = String(a), B = String(b);
  if (!(A.startsWith('dm-') && B.startsWith('dm-'))) {
    return c14.defaultBaseline(a, b, Ymm, meas);
  }
  if (HOOK_EMPTY) return null;                // --hook-empty: the red basis
  if (!DM || !CUR) return null;               // fail-closed: no pins / no bay, no entry
  const { SHELF, CW, SKIRT_BOTTOM, CUP_TOP, CUP_R, UNDERSIDE,
    ZTOP, CROWN_MAX_DROP, LAP, LAP_Y0, CUT_CLEAR } = DM;
  const F = CUR.corner ? DM.fam.corner : DM.fam.side;
  const embed = meas.embed ?? Infinity;       // fail-closed on a missing depth
  const arc = meas.arc ?? Infinity;
  // Crossings carry the contact's plan position; containments do not (the
  // library calls baseline(own, host, Ymm, {embed, arc}) with no u/v). A
  // clause that needs a position therefore says so and refuses the other
  // path rather than defaulting it to "in range".
  const rXZ = (meas.u == null || meas.v == null)
    ? null : Math.hypot(meas.u, meas.v);
  const fp = rXZ === null ? null : bootFootprint(meas.u, meas.v);
  const pair = (S1, S2) => (S1.has(A) && S2.has(B)) || (S1.has(B) && S2.has(A));
  const one = (name, S) => (A === name && S.has(B)) || (B === name && S.has(A));
  const SLEEVE = new Set(['dm-bootsleeve']);
  const COLLAR = new Set(['dm-bootcollar']);

  // (1) THE BALL-RETURN FURNITURE BELOW DATUM A.
  // 1a  The trap cup and its floor. pocketCup is one open-top slot; its floor
  //     is a flat sheet placed ON the wall-bottom plane (table.js
  //     diamondPocket `fg.translate(0, yB, 0)`), so the two are coplanar by
  //     construction and any read of one against the other is a parity read
  //     in their shared plane. Bound: below datum A, the only place either
  //     exists.
  if (Ymm < 0 && DM_BOOT_HW.has(A) && DM_BOOT_HW.has(B)) {
    return '[dm1a] ball-return trap cup and its floor below datum A (pocketCup: '
      + 'one open-top slot, floor sheet on the wall-bottom plane)';
  }
  // 1b  The boot's throat sleeve hanging inside the cup. bootSection.section
  //     runs the sleeve down to SKIRT_BOTTOM (-14.2) at r ~ rw - 0.6, and the
  //     cup's open top is at CUP_TOP (-7.1) with its wall at CUP_R (74.4)
  //     about the same centre — the sleeve's closed ring sits inside the
  //     cup's closed slot for the 7.1 mm they share, nested by construction
  //     (the model's own boot drops into its own trap). Parity names the
  //     NEAREST surface as the host, which at the top of the band is the
  //     fall-lip roll above the sleeve rather than the cup wall 20+ mm away,
  //     so the host may be either. Containment only (a CROSSING of the sleeve
  //     with the cup wall would mean the cup is not concentric with the
  //     throat it receives — judged; see arm dm1-xz), inside the shared band,
  //     and never deeper than the cup's own radius.
  if (rXZ === null && Ymm >= SKIRT_BOTTOM - 0.05 && Ymm <= CUP_TOP + 0.05
    && embed <= CUP_R + 0.5
    && (one('dm-bootcollar', DM_BOOT_HW) || one('dm-bootcollar', new Set(['dm-falllip'])))) {
    return `[dm1b] boot throat sleeve hanging inside the trap cup (sleeve to `
      + `${SKIRT_BOTTOM.toFixed(1)} = bootSection.section min z, cup top `
      + `${CUP_TOP.toFixed(1)} = pocketCup.top; nested by construction, `
      + 'parity host = nearest surface)';
  }
  // 1c  The fall lip under the ring's underside. The cloth roll is a quarter
  //     round r rw .. rw + FALL_LIP_R, y -FALL_LIP_R .. 0 (table.js
  //     diamondPocket lipPts) and the ring's underside (bootSection group 5)
  //     runs at y -0.3 .. UNDERSIDE (-3.7) from the outer wall in to the
  //     throat — the roll sits under and inside the ring by construction;
  //     "the roll IS the hole edge, no cliff, no seam" (table.js). Bound:
  //     the roll's own band below datum A; a crossing must lie on the roll's
  //     annulus about this bay's rw; a containment can be no deeper than the
  //     roll's height plus the underside's, the most a roll point can be
  //     from the ring's underside plane.
  // 10  (D621-PLAN-1, ring entries only) THE MODEL THROAT OVER THE KERNEL
  //     BED-HOLE RIM. The ring's throat is the MODEL's (leg inner edges legInner
  //     from the pocket axis, the throat arch about its own centre) while the
  //     bed hole stays the kernel's — rw + FALL_LIP_R about the disc centre
  //     (order: "the kernel disc centre keeps physics and the bed hole"). Where
  //     the throat boundary lies inside that rim (the corner legs over u 20..51:
  //     rim 57.06 vs legInner 55.0, 2.1 mm; the side arch between u 75 and the
  //     apex) the throat's below-bed rows (THROAT_IN inset) cross the cloth
  //     roll: a DISCLOSED identity deviation (JSON O23; cure = a slate opening
  //     that follows the throat, O18), bounded by its own derivation — a
  //     crossing on the roll's annulus about the disc centre, the contact ON
  //     the throat boundary band (the leg line or the throat circle, ± the
  //     throat inset), depth no more than the roll's radial width plus the
  //     throat inset. Every other collar|falllip record stays with dm1c's
  //     construction (the roll under the ring's underside). Own arm group
  //     (dm10) so the dm1 arms do not vouch for it.
  if (DM.RING && rXZ !== null && pair(COLLAR, new Set(['dm-falllip']))
    && Ymm >= -FALL_LIP_R_MM - 0.05 && Ymm <= 0
    && rXZ >= F.RW - 0.5 && rXZ <= F.RW + FALL_LIP_R_MM + 0.5
    && embed <= FALL_LIP_R_MM + F.THROAT_IN + 0.5) {
    // the contact in the ring frame: fp.s axial from the ring centre (into the table positive), fp.l lateral
    const onLeg = fp.s > 0 && Math.abs(fp.l - F.W_LEG) <= F.THROAT_IN + 0.5;
    const dThroat = Math.hypot(-fp.s - (F.U_IN - F.U_OUT), fp.l);   // distance from the throat circle centre (outboard of the ring centre by U_OUT - U_IN)
    const onArch = Math.abs(dThroat - F.R_IN) <= F.THROAT_IN + 0.5;
    if (onLeg || onArch) {
      return `[dm10] model throat over the kernel bed-hole rim (D621-PLAN-1: throat ${onLeg ? 'leg edge legInner ' + F.W_LEG.toFixed(1) : 'arch r ' + F.R_IN.toFixed(1) + ' about ' + F.U_IN.toFixed(1)} `
        + `vs the rim rw + ${FALL_LIP_R_MM} = ${(F.RW + FALL_LIP_R_MM).toFixed(2)} about the disc centre; throat inset `
        + `${F.THROAT_IN.toFixed(2)}; disclosed O23, cure O18)`;
    }
  }
  // (D621-PLAN-1: on ring entries a CROSSING of the roll by the leather is
  // dm10's business — the throat over the kernel rim — and is not admitted
  // here; dm1c keeps the containment path, the roll under the ring)
  if (DM_BOOT_THROAT.has(A) && DM_BOOT_THROAT.has(B) && A !== B
    && Ymm >= -FALL_LIP_R_MM - 0.05 && Ymm <= 0
    && (rXZ === null ? embed <= FALL_LIP_R_MM + Math.abs(UNDERSIDE) + 0.5
      : (!DM.RING && rXZ >= F.RW - 0.5 && rXZ <= F.RW + FALL_LIP_R_MM + 0.5))) {
    return `[dm1c] bed-cloth fall lip under the boot ring's underside (roll r `
      + `rw .. rw + ${FALL_LIP_R_MM}, y -${FALL_LIP_R_MM} .. 0 vs the ring `
      + `underside at ${UNDERSIDE.toFixed(1)}; the roll IS the hole edge — `
      + 'table.js diamondPocket)';
  }

  // (2) THE JAW FACING INSIDE THE LEATHER LEG THAT DRAPES OVER IT.
  // table.js buildCollarGeoU sweeps the FULL boot section along the pocket
  // axis to make the U's legs (corner legRun 84.3, MODEL leather01): throat
  // wall at rw - THROAT_IN, outer wall at rw + LANDING, underside at -3.7,
  // crest at LEG_CREST. The section is translated, not trimmed to what it
  // lands on, so the jaw facing under the leg — the cloth wedge (clamped
  // WEDGE_UNDER_WALL_MM under the wall top: "the cloth runs under the
  // leather"), the cushion end it skins and the sub-rail beam behind the
  // glue plane — stands INSIDE the leather's closed section, and the census
  // reads both directions: the facing's curve contained in / crossing the
  // leg's outline, and the leg's outline crossing the cushion body. That is a
  // sewn-through lap by construction (the leather drapes over the facing;
  // nothing of the facing is proud of the leather), the same class as the
  // A2 nested shells. MEASURED (r6 red basis): 378 collar x cushion, 192
  // collar x sub-rail, 96 collar x wedge records over y 2.5 .. 42.5 at the
  // four corners, none at the sides.
  //
  // WHY THE CROSSING PATH CARRIES NO DEPTH OR ARC CAP. The cushion loft's
  // section is OPEN at the jaw (its end is the cloth wedge, a separate
  // family), so a leg that enters the cushion's rear face never re-crosses
  // the cushion's own curve; the library then pairs the two legs' entries
  // across the U's outboard arc — a closed loop with two crossings, whose
  // shorter side IS the arc (measured 382 mm) and whose "depth" is that
  // arc's clearance from the cushions (measured 106 mm). Those numbers
  // describe the pairing, not the lap; a section-derived cap would exclude
  // exactly the honest readings and admit nothing more. What bounds the lap
  // is the construction itself: the contact must lie in THIS bay's boot
  // footprint (bootFootprint, the U about the cup's own axis, R_OUT + 0.5 mm
  // of slack), between datum A and the cap top SHELF (the facing stack is
  // authored under it: wedge <= zTop, cushion <= zTop, beam under the cap).
  // A containment carries no position and a TRUE 3D depth, so it is admitted
  // on the height band and on the inradius bound instead: a point inside a
  // solid is never further from its surface than half the wider of the two
  // sections, max(CW, LANDING + THROAT_IN) / 2.
  // At the sides LEG_RUN is 0, so the footprint is the outboard half-disc
  // alone, and the cushion body ends 4.8 mm before the ring's tangent row
  // (CW behind the nose vs sidePocketDepth) — only the wedge's flange rows
  // (o up to 44 mm past the cushion back, clamped under the wall top there
  // too) can meet the side ring, and only inside that half-disc.
  // D621-PLAN-1: RETIRED on ring entries — the arm no longer drapes over the
  // facing; every row ends on the cushion glue plane (plan gate rows a/b) and
  // the sub-rail beam is cut around the boot (railBodyCutTrim), so a collar x
  // facing / cushion / sub-rail record IS a defect there and is judged. The
  // clause (and its dm2-z arm) stays for legRun entries.
  if (!DM.RING) {
    const sectionCap = Math.max(CW, F.LANDING + F.THROAT_IN) / 2 + 0.5;
    if (pair(COLLAR, DM_FACING) && Ymm >= -0.05 && Ymm <= SHELF + 0.05
      && (rXZ === null ? embed <= sectionCap : fp.inBoot)) {
      return `[dm2] jaw facing inside the leather leg that drapes over it `
        + `(table.js buildCollarGeoU: the full boot section, throat rw - `
        + `${F.THROAT_IN.toFixed(1)} .. wall rw + ${F.LANDING.toFixed(1)}, swept `
        + `${F.LEG_RUN.toFixed(1)} mm along the pocket axis; the wedge lies `
        + `${WEDGE_UNDER_WALL_MM} mm under the wall top by construction; inside this `
        + `bay's footprint, below the cap top ${SHELF.toFixed(2)})`;
    }
  }

  // (3) RETIRED on r6 — the sub-rail beam's authored OVER = 2.0 mm tuck under
  // the cushion rear wall (table.js subRailBeamGeom) produced NO record of
  // any level on the r6 red basis — subrail x cushion never crosses at any
  // of the 102 stations (A2 measured one 2.20 mm crossing at y = 35) — so
  // the wave A2 clause that admitted it (dm3: subrail x cushion, y 0 .. 40,
  // <= 2.5 mm)
  // would be a dormant exemption with no red record behind it. A dormant
  // clause is an unproven one (--red-arm calls it NOT EXERCISED and fails
  // the bar), so it is removed rather than kept; re-adding it is a
  // one-clause change if a future basis shows the record again.

  // (4) THE JAW PAD GLUED TO THE BEAM FACE.
  // dm-bootsleeve is the jaw facing wedge; its back face and the sub-rail
  // beam's front face are the SAME authored plane, so the two surfaces float
  // against each other at facet scale. MEASURED independently (A2) on the
  // dumped soup: of 182 sampled pad points at y = 2.5, twenty sit inside the
  // beam body and the deepest is 0.169 mm — 3.4x touchTol, three orders
  // under the pad's own thickness.
  if (pair(SLEEVE, new Set(['dm-subrail']))
    && embed <= 0.25 && arc <= 0.5) {
    return '[dm4] jaw facing pad against the beam face it is glued to: '
      + 'coincident authored plane, 0.17 mm facet float';
  }

  // (5) RETIRED on r6 — the side-notch clearance misread (wave A2 dm5: the
  // cap's notch arc about the side cup swung out of the cushion and back,
  // read by the unsigned embed as a 60+ mm "depth" over a 286 mm run). The
  // r6 caps are SPLIT at the side pocket by the 5 mm kerf (proamRailPlans),
  // so each half-cap's outline leaves the notch up the kerf face to the
  // outer edge instead of coming back to the cushion, and the notch reading
  // lands in the ADJUDICATE tier (beyond-bay, arc > warnArc) or the
  // lip-band class of clause (8). No record on the r6 red basis carries the
  // notch signature; the clause is removed for the same reason as (3). SNR
  // and NOTCH_ARC stay as printed pins for the record.

  // (6) THE BED-DATUM COPLANAR STATION.
  // INSTRUMENT LIMITATION. At Ymm = 0 the bed cloth top face, the fall-lip
  // roll's top ring and the cushion footprint are all in ONE plane — table.js
  // builds the roll "to rw + lip (populate bed loop) so the roll IS the hole
  // edge — no cliff, no seam". A containment parity read taken IN that shared
  // plane cannot tell continuation from burial: it sees a closed ring inside
  // a closed outline and calls it contained. MEASURED (A2): re-running the
  // parity on the dumped soup at y = 0 puts 0 of 41 fall-lip points inside
  // the cancelled union, and no individual family claims one — the reading
  // does not survive a change of triangle set, which is what an artifact
  // does and a burial does not.
  if (Ymm === 0 && A === 'dm-falllip') {
    return '[dm6] bed-datum coplanar station: the fall-lip roll IS the '
      + 'bed-cloth hole edge, and parity read in their shared plane is '
      + 'degenerate';
  }
  // 6b  The roll's OTHER degenerate station. The lathe's bottom ring lies IN
  //     the plane y = -FALL_LIP_R, so the section there is the ring itself,
  //     and the only other throat family live at that height is the boot's
  //     sleeve — at the sides an OPEN half-arc (the half-ring's tangent-row
  //     end caps are degenerate at this height), against which even-odd
  //     parity is undefined. MEASURED: S1/S4 only, "depth" 69.4 mm = the
  //     distance to the half-ring's far end cap, a clearance in the open
  //     mouth, not a burial. Containment only, this station only.
  if (rXZ === null && Math.abs(Ymm + FALL_LIP_R_MM) <= 0.01
    && DM_BOOT_THROAT.has(A) && DM_BOOT_THROAT.has(B) && A !== B) {
    return `[dm6b] fall-lip bottom-ring coplanar station (y = -${FALL_LIP_R_MM}): `
      + 'the roll\'s lathe ring lies in the cut plane and parity against the '
      + 'sleeve\'s open arc is degenerate';
  }

  // (7) THE WEDGE'S END INSIDE THE CAP'S RAIL-LAP TUCK.
  // frameGeom tucks the cap's inner edge LAP = 2 mm inside the cushion's
  // rear face (KIN = -(CW - LAP)) "so the wood|cloth boundary carries no
  // daylight"; the census names that tuck along every rail as the
  // ADJUDICATE tier (cushion x railtop). The cloth wedge ends on the same
  // rear-face line, so where its rows reach the cap it ends LAP inside the
  // cap's lip face — entering through that face at the jaw's own facing
  // angle, which makes the buried run LAP / cos(facing). MEASURED (r6 red
  // basis): 24 records, all corners, y 42 .. 42.5, embed 1.98 .. 2.00 mm,
  // arc 3.18 mm = 2.0 / cos(51 deg), NO-EXIT (the wedge ends in the tuck).
  // Bound: on the lip band, the authored LAP plus 0.1 mm, the facing-angle
  // run plus 0.5 mm, under the cushion top.
  {
    const facing = CUR.corner ? DM.FACING_RAD.corner : DM.FACING_RAD.side;
    const runCap = LAP / Math.max(Math.cos(facing), 1e-3) + 0.5;
    if (pair(SLEEVE, DM_CAPPING) && rXZ !== null && lipBand(meas.u, meas.v)
      && Ymm >= -0.05 && Ymm <= ZTOP + 0.05
      && embed <= LAP + 0.1 && arc <= runCap) {
      return `[dm7] cloth wedge ending inside the cap's rail-lap tuck (frameGeom `
        + `LAP ${LAP.toFixed(1)} mm behind the cushion rear face; run <= LAP / `
        + `cos(facing ${((facing * 180) / Math.PI).toFixed(0)} deg) = `
        + `${(runCap - 0.5).toFixed(2)} mm)`;
    }
  }

  // (8) THE RAIL-LAP TUCK READ NO-EXIT WHERE THE CROWNED TOP CUTS THE PLANE.
  // INSTRUMENT LIMITATION. The same LAP tuck as (7), read from the cap's own
  // outline: the cap's inner edge enters the cushion's rear face where the
  // pocket cut meets the lip (proamRailPlans A_L / the side notch lip) and
  // runs inside it along the whole rail — a beyond-bay lamination, which is
  // what the ADJUDICATE tier is for, and what wave A2 recorded here (28
  // records, y 40 .. 44.45). On r6 the cap top is CROWNED, and every station
  // between the crown's outer fall (SHELF - 14.6) and the plateau cuts the
  // top surface: the cap's section then includes the crown's iso-line,
  // chained out of 3 mm grid cells, and that chain does not close at the
  // joints/chamfer. The outline has raw ends, so the library's "shorter
  // side" of the lip crossing runs BACKWARDS round the pocket cut to a raw
  // end and reads NO-EXIT, with the far side's clearance (the cut's distance
  // from the cushion, 73 .. 116 mm) as its "depth" — no burial in a CW-wide
  // cushion can be that deep. At the cushion-top station itself (ZTOP) the
  // cushion's section is its top face, coplanar and degenerate (the dm6
  // class), and the same crossing reads 9.7 mm / NO-EXIT. MEASURED (r6 red
  // basis): 52 records, all six bays, y 40 .. 44.45, every one on the lip
  // band (kx/kz 48.87 .. 50.81), every one NO-EXIT. The bevelled rear face
  // stands behind the lip only above LAP_Y0 = ZTOP - LAP / tan(bevel).
  // Bound: on the lip band, in the lap's height band, NO-EXIT, and either
  // a "depth" no burial could have (>= CW) or the coplanar top station.
  if (pair(DM_CAPPING, new Set(['dm-cushion'])) && rXZ !== null
    && lipBand(meas.u, meas.v) && meas.exited === false
    && Ymm >= LAP_Y0 - 0.05 && Ymm <= ZTOP + 0.05
    && (embed >= CW || Math.abs(Ymm - ZTOP) <= 0.01)) {
    return `[dm8] rail-lap tuck (frameGeom LAP ${LAP.toFixed(1)} mm) read NO-EXIT: `
      + 'the crowned cap top\'s section iso-line does not chain closed, so the '
      + 'lip crossing\'s shorter side runs to a raw end round the pocket cut '
      + 'and the unsigned embed reports the cut\'s clearance (>= CW) or the '
      + `coplanar cushion-top station ${ZTOP.toFixed(2)}`;
  }

  // (9) THE KEYSTONE BLOCK'S PARITY READ IN THE CROWN BAND.
  // INSTRUMENT LIMITATION. The block's joint faces are the caps' joint faces
  // (proamRailPlans: one plane, C_L -> J_L, shared by construction), and its
  // inner face sits on the pocket-cut circle R_OUT + cutClear, 2 mm clear of
  // the boot — the census finds NO crossing of any cap or block with the
  // boot at any station (brief item (d): DISJOINT). At stations that cut
  // the crowned top (see 8) the caps' outlines are chained iso-lines with
  // raw ends, and even-odd parity of the block's outline against that union
  // is undefined: MEASURED (r6 red basis), one station (y = 35) of the 17 in
  // the band, 10 of 84 block points "inside", host = the boot (the nearest
  // surface), depth 2.03 mm = the authored clearance itself. A real burial
  // of the block in the boot would be a CROSSING of the block's outline
  // with the boot's outer wall and is judged on that path; this clause is
  // containment-only, bounded to the crown band, to the cut clearance plus
  // the boot arc's 56-segment sagitta, and to the block-or-cap / boot pair.
  if (rXZ === null && DM_CAPPING.has(A) && B === 'dm-bootcollar'
    && Ymm >= SHELF - CROWN_MAX_DROP - 0.05 && Ymm <= SHELF + 0.05
    && embed <= CUT_CLEAR + 0.2) {
    return `[dm9] cap/keystone parity read in the crown band (y ${(SHELF - CROWN_MAX_DROP).toFixed(1)} `
      + `.. ${SHELF.toFixed(2)}): the block's "depth" is the authored pocket-cut `
      + `clearance ${CUT_CLEAR.toFixed(1)} mm to the boot wall; no cap or block `
      + 'crosses the boot at any station';
  }

  return null;
}

// ---------------------------------------------------------------------------
// page evals
// ---------------------------------------------------------------------------

/**
 * Geometry pins read from the LIVE app's own table build — never from
 * literals here.
 *
 * THE TWO MOUTH-BAND STATIONS. mouthExposure wants a jaw span expressed as
 * inboard distances from the nose corner along a flank axis (snooker's
 * MOUTH_TANGENCY_MM 90.30 / MOUTH_TIP_MM 37.03 are exactly that). The
 * diamond is not a template table, so it has no G.utc / G.corner.x; its rail
 * plan is railPolysKernel's six-point polygon, whose FIRST THREE points on a
 * long rail carry both stations directly (table.js :1511):
 *
 *   [0, pwc + dc]                 the nose point — where the jaw round hands
 *                                 over to the STRAIGHT nose line. This is the
 *                                 station the true mouth is measured between:
 *                                 pwc + dc = cornerMouth / sqrt(2), so the two
 *                                 rails' nose points are CP-01 114.3 mm apart.
 *                                 -> tangencyMm
 *   [-CW, pwc - CW*tanCa]         the facing's back foot — the deepest station
 *                                 of the cushion body, where the miter facing
 *                                 (CP-02, angle ca) meets the back line.
 *                                 -> tipMm
 *
 * Between them is the jaw: the stretch of table the cushion loft owns and the
 * only stretch where an arc standing on the play side is unambiguously a
 * defect. Inboard of the nose point the rail is straight and no furniture
 * exists at all; outboard of the back foot the bay belongs to the fall.
 *
 * The side-bay twins ((L-sw)/2 - ds and (L-sw)/2 + sjb, restated as distances
 * from the side meridian) are measured and recorded too, so the side jaw span
 * is on the record even though the corner-framed law cannot consume it.
 */
const PINS_EVAL = `(async () => {
  const T = await import('./scene/table.js');
  const G = T.makeGeom(${JSON.stringify(TABLE)});
  if (G.template) throw new Error('unexpected template family for ' + G.id);
  return JSON.stringify({
    id: G.id, style: G.render.style,
    L: G.L, W: G.W, CW: G.CW,
    // corner jaw, stations inboard from the nose corner along a flank axis
    cornerNosePt: G.pwc + G.dc,
    cornerBackFoot: G.pwc - G.CW * G.tanCa,
    cornerRoundEnd: G.pwc - G.dc * G.sinCa,
    // side jaw, stations from the side-pocket meridian along the long rail
    sideNosePt: G.sw / 2 + G.ds,
    sideBackFoot: G.sw / 2 - G.sjb,
    facingDeg: { corner: G.ca * 180 / Math.PI, side: G.sa * 180 / Math.PI },
    dc: G.dc, ds: G.ds, cd: G.cd, pwc: G.pwc, sw: G.sw,
    frameTop: G.render.frameTop,
    // castingProud: the pocket casting's top stands this far above the rail
    // plank. SHELF = frameTop + castingProud is the plane the boot collar
    // lands on (table.js castingTop()), and every baseline window below is
    // measured DOWN from it — read live, never guessed here.
    castingProud: G.render.castingProud ?? 0.0005,
    railSeatY: G.render.railSeatY ?? 0.006,
    noseHeight: G.kernel.noseHeightFrac * G.render.profileBallD,
    cornerMouth: G.kernel.cornerMouth, sideMouth: G.kernel.sideMouth,
    pockets: G.pockets.map((p) => ({ x: p.x, z: p.z, r: p.r, corner: !!p.corner })),
    // D621-ALIGN r6 pins. The cushion top is the plane the wedge's flange
    // rows are capped at (table.js FLAP / capY); sidePocketDepth places the
    // side cup centre behind the nose line (the notch arc's chord); the
    // render keys are the purchased-model construction the r6 clauses are
    // derived from, passed through VERBATIM with their MFR/MODEL/DERIVED
    // provenance living at their definition in table.js.
    cushionTop: T.cushionProfile(G.render.cushionFamily,
      G.kernel.noseHeightFrac * G.render.profileBallD, G.CW, G.render.cushionProfile).zTop,
    sidePocketDepth: G.kernel.sidePocketDepth,
    // CU-10 sub-rail glue plane: the cushion's rear face recedes inboard
    // going down at this angle from the back-top corner (table.js
    // subRailBevelDeg), which is what puts the cap's 2 mm railLap tuck
    // inside the cushion only over the top LAP / tan(bevel) of its height.
    subRailBevelDeg: G.render.subRailBevelDeg ?? 0,
    render: {
      mouthCollar: G.render.mouthCollar ?? null,
      bootSection: G.render.bootSection ?? null,
      pocketCup: G.render.pocketCup ?? null,
      railJoint: G.render.railJoint ?? null,
      capCrown: G.render.capCrown ?? null,
      apronBand: G.render.apronBand ?? null,
      legSection: G.render.legSection ?? null,
      railLap: G.render.railLap ?? 0.002,
      bootSleeveCloth: !!G.render.bootSleeveCloth,
    },
  });
})()`;

/** Publish the mesh list + the chunked extractor. Verbatim in method with
 *  check-pocket-construction's C14 transfer (:882-:950): whole-scene
 *  traverse, visibility chain, ball/cue/hud exclusion, world-space triangle
 *  AABB vs the per-cup box, 1 µm rounding. */
const setupEval = (cups) => `(() => {
  const BOX = ${JSON.stringify(C14_BOX)};
  const CUPS = ${JSON.stringify(cups.map((c) => [c.x, c.z]))};
  const scene = window.__dbg.scene;
  scene.updateMatrixWorld(true);
  const list = [];
  const chainVisible = (o) => {
    for (let p = o; p; p = p.parent) if (p.visible === false) return false;
    return true;
  };
  scene.traverse((o) => {
    if (!o.isMesh || !o.geometry || !chainVisible(o)) return;
    if (/ball|cue|hud|marker/i.test(o.name)) return;
    if (!o.geometry.getAttribute('position')) return;
    list.push(o);
  });
  window.__c14 = { list, BOX, CUPS };
  window.__c14Info = (mi) => {
    const o = window.__c14.list[mi];
    const g = o.geometry;
    const pos = g.getAttribute('position');
    return JSON.stringify({
      name: o.name || '(anon)',
      nt: (g.index ? g.index.count : pos.count) / 3,
      matUuid: (o.material && o.material.uuid) || '',
    });
  };
  window.__c14Chunk = (mi, t0, t1) => {
    const o = window.__c14.list[mi];
    const { BOX: B, CUPS: C } = window.__c14;
    const g = o.geometry;
    const pos = g.getAttribute('position');
    const idx = g.index;
    const e = o.matrixWorld.elements;
    const nt = (idx ? idx.count : pos.count) / 3;
    const soup = [];
    const w = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let t = t0; t < Math.min(t1, nt); t++) {
      let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity,
        by1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k;
        const vx = pos.getX(vi), vy = pos.getY(vi), vz = pos.getZ(vi);
        const x = e[0] * vx + e[4] * vy + e[8] * vz + e[12];
        const y = e[1] * vx + e[5] * vy + e[9] * vz + e[13];
        const z = e[2] * vx + e[6] * vy + e[10] * vz + e[14];
        w[k][0] = x; w[k][1] = y; w[k][2] = z;
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
        if (y < by0) by0 = y; if (y > by1) by1 = y;
        if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
      }
      if (by1 < B.y0 || by0 > B.y1) continue;
      let near = false;
      for (const c of C) {
        if (bx1 < c[0] - B.dxz || bx0 > c[0] + B.dxz) continue;
        if (bz1 < c[1] - B.dxz || bz0 > c[1] + B.dxz) continue;
        near = true; break;
      }
      if (!near) continue;
      for (let k = 0; k < 3; k++) {
        soup.push(Math.round(w[k][0] * 1e6) / 1e6,
          Math.round(w[k][1] * 1e6) / 1e6,
          Math.round(w[k][2] * 1e6) / 1e6);
      }
    }
    return JSON.stringify(soup);
  };
  return list.length;
})()`;

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// the baseline hook's own teeth (--red-arm)
// ---------------------------------------------------------------------------
//
// A baseline entry is a decision NOT to judge a crossing. The only honest way
// to ship one is to show that the gate would still be red WITHOUT it, and that
// the entry is scoped to the construction it names rather than to the bay it
// sits in. The red basis (c14-red-basis-488d.json, hook empty) proves the
// first. This harness proves the second: for each clause, translate the family
// it exempts by a known offset that takes the contact OUT of the construction
// the clause describes, re-run the census on that clause's OWN stations, and
// watch the exemption stop firing.
//
// Every row reports two independent facts and a label that summarises them:
//   RELEASED  the tag's own count FELL — the clause let go of records.
//   ARMED     FAIL rose — the gate judged the moved geometry red.
// label = TEETH (both) | VANISHED (released only) | SCOPE-RED (armed only)
//       | NO-EFFECT (neither: whatever the offset changed, it is not what the
//         clause is keyed to).
//
// The bar does NOT compare the label to an expected label. It checks the fact
// the clause's KIND actually claims, because the three kinds make three
// different claims and two of them cannot produce TEETH by construction.
// Pretending otherwise would be the dishonest reading in one direction, and
// failing a clause for being MORE falsifiable than its row declared is the
// dishonest reading in the other.
//
//   kind 'window' — the clause carries a measured window (depth, radius,
//     height). Moving the construction out of the window must make the clause
//     let go, and the geometry it let go of must then be judged.
//     PASS iff RELEASED and ARMED.
//   kind 'scope' — the clause carries NO measured window; it is scoped by
//     family membership and the side of datum A. Nothing inside that scope can
//     falsify it, and that is the point — a nested stack stays a nested stack
//     however it is nested. What must be shown is that the exemption does not
//     REACH material it does not name, so the arm drives the exempted family
//     into unnamed material. The tag's own count may rise (the displaced part
//     meets more of its own stack) or fall (it leaves part of the stack
//     behind); both are consistent with a correctly scoped clause and neither
//     is the thing under test, so the row prints both numbers and the bar
//     reads only the one that matters. PASS iff ARMED.
//   kind 'plane' — the clause is keyed to one degenerate station (Ymm === 0)
//     and one family name. The only geometric falsifier is to take the part
//     off that plane, which removes the record rather than reddening it, so a
//     rise in FAIL cannot be required here. Read the clause's real
//     justification at its own comment (an independent parity re-measurement),
//     not here. PASS iff RELEASED.
//
// It runs on the SAME live mesh the census just judged, in-process — not on a
// dumped soup that may have drifted from the scene it came from.
const RED_ARMS = [
  { id: 'dm1-xz', tag: 'dm1', kind: 'scope', fam: 'dm-pocketcup', d: [0.060, 0, 0],
    note: 'drive the trap cup 60 mm along the table, off the boot axis it is '
      + 'authored concentric with. Below the bed it then meets the leg '
      + 'column, the apron band or a cabinet wall — material no boot-'
      + 'furniture clause names — and the throat sleeve that hung inside it '
      + 'now CROSSES its wall, which dm1b (containment only) does not admit. '
      + 'The bay must read red.' },
  { id: 'dm1-y', tag: 'dm1', kind: 'scope', fam: 'dm-pocketcup', d: [0, 0.020, 0],
    slices: [0, 2.5, 5, 7.5, 10, 12.5],
    note: 'lift the trap cup 20 mm, so its open top (-7.1) stands 12.9 mm '
      + 'ABOVE the bed. Every clause (1) is bounded below datum A, so a cup '
      + 'wall standing in the playing surface — through the wedge, the '
      + 'cushion ends, the boot legs — has to be judged, and is.' },
  { id: 'dm2-z', tag: 'dm2', kind: 'window', fam: 'dm-bootcollar', d: [0, 0, 0.045],
    note: 'slide the boot 45 mm across the table. At the corners that is '
      + '31.8 mm along AND 31.8 mm across the pocket axis, so one leg leaves '
      + 'this bay\'s footprint window (R_OUT + 0.5 mm) and its facing '
      + 'contacts stop being admitted, while the moved ring reaches the cap '
      + 'and the corner block — material clause 2 does not name. At the '
      + 'sides the half-ring is driven 45 mm into the table past its own '
      + 'tangent row, into jaws it never touches as authored.' },
  { id: 'dm4-z', tag: 'dm4', kind: 'window', fam: 'dm-bootsleeve', d: [0, 0, 0.0003],
    note: 'push the glued jaw pad 0.3 mm through the beam face it is glued '
      + 'to — deliberately SMALL, so the pad stays in contact and the arm '
      + 'tests the 0.25 mm depth window rather than knocking the two parts '
      + 'apart. The measured float is 0.17 mm; 0.3 mm of travel clears the '
      + 'window while leaving the contact intact.' },
  { id: 'dm10-xz', tag: 'dm10', kind: 'window', fam: 'dm-bootcollar', d: [0.005, 0, -0.005],
    ring: true,
    note: 'slide the boot 5 mm along +x and -z (D621-PLAN-1 ring entries only): '
      + '7.1 mm ACROSS the pocket axis at the +x+z / -x-z corners. The throat '
      + 'leg lines move 7 mm off the axis, so the crossing with the kernel '
      + 'hole rim lands 7 mm outside the throat band this clause requires the '
      + 'contact in (legInner - throat inset .. legInner) and is judged; '
      + 'dm1c admits no crossing on ring entries, so nothing else can vouch '
      + 'for it. (Pushing the ROLL instead slid the rim along the leg lines '
      + 'and the records VANISHED instead of reddening — a window arm must '
      + 'keep the contact.)' },
  { id: 'dm6-y', tag: 'dm6', kind: 'plane', fam: 'dm-falllip', d: [0, -0.010, 0],
    slices: [-12.5, -10, -7.5, -5, -2.5, 0],
    note: 'drop the fall lip 10 mm below the bed plane. The clause is keyed '
      + 'to the ONE degenerate station where the roll and the cloth share a '
      + 'plane, so taking the part off that plane can only remove the record '
      + '(VANISHED is the declared expectation, not a near miss). The '
      + 'stations below the bed are included so the relocated part is seen '
      + 'to be re-measured rather than dropped.' },
  { id: 'dm7-xz', tag: 'dm7', kind: 'window', fam: 'dm-bootsleeve', d: [0.003, 0, 0.003],
    note: 'slide the cloth wedges 3 mm along both axes. At the +x/+z corner '
      + 'the wedge end drives past the LAP + 0.1 mm depth window into the '
      + 'cap; at the -x/-z corner it leaves the lip band. Both take the '
      + 'record out of the tuck window and the deepened lap is judged.' },
  { id: 'dm8-x', tag: 'dm8', kind: 'window', fam: 'dm-railtop', d: [0.004, 0, 0],
    note: 'swing the rail caps 4 mm along the table. The END caps\' inner '
      + 'edges leave the lip band (kx 44.9 or 52.9 instead of 48.8 .. 50.8), '
      + 'so the lip-band test cannot claim their crossings, and the cap '
      + 'driven 4 mm into its cushion is judged for the deeper lap it now '
      + 'makes.' },
  { id: 'dm9-xz', tag: 'dm9', kind: 'window', fam: 'dm-cornerblock', d: [0.003, 0, 0.003],
    note: 'slide the keystone blocks 3 mm along both axes: at the -x/-z '
      + 'corner the inner face moves 4.2 mm toward the boot and CROSSES its '
      + 'outer wall (2.2 mm past the 2 mm clearance) — judged on the crossing '
      + 'path this clause never touches; at the +x/+z corner the clearance '
      + 'grows to 6.2 mm, past the CUT_CLEAR + 0.2 depth window.' },
];

/** Tag of the clause that produced a record, or null. */
const whyTag = (why) => {
  const m = /^\[(dm[0-9a-z]+)\]/.exec(String(why ?? ''));
  return m ? m[1] : null;
};
/** Family-level tag (dm2a/dm2b/dm2c all belong to arm dm2). */
const armOf = (tag) => (tag ? tag.replace(/^(dm\d+).*$/, '$1') : null);

function armTally(census) {
  const t = new Map();
  const bump = (k) => t.set(k, (t.get(k) ?? 0) + 1);
  for (const c of census.corners) {
    for (const s of c.slices) {
      for (const x of [...(s.crossings ?? []), ...(s.containments ?? [])]) {
        const lv = x.level ?? 'FAIL';
        if (lv === 'BASELINE') bump(whyTag(x.why) ?? '(untagged)');
        else if (lv === 'FAIL') bump('FAIL');
      }
    }
  }
  return t;
}

function shifted(meshes, fam, [dx, dy, dz]) {
  return meshes.map((m) => {
    if (m.name !== fam) return m;
    const tris = Array.from(m.tris);
    for (let i = 0; i < tris.length; i += 3) {
      tris[i] += dx; tris[i + 1] += dy; tris[i + 2] += dz;
    }
    return { name: m.name, tris };
  });
}

/** Stations where the given arm's clauses fired, capped and reported. */
function armSlices(census, arm, cap = 6) {
  const ys = new Set();
  for (const c of census.corners) {
    for (const s of c.slices) {
      for (const x of [...(s.crossings ?? []), ...(s.containments ?? [])]) {
        if ((x.level ?? 'FAIL') !== 'BASELINE') continue;
        if (armOf(whyTag(x.why)) === arm) ys.add(s.y);
      }
    }
  }
  const all = [...ys].sort((a, b) => a - b);
  if (all.length <= cap) return { slices: all, dropped: 0, of: all.length };
  const step = (all.length - 1) / (cap - 1);
  const pick = [];
  for (let i = 0; i < cap; i++) pick.push(all[Math.round(i * step)]);
  const slices = [...new Set(pick)];
  return { slices, dropped: all.length - slices.length, of: all.length };
}

/**
 * c14Run one bay at a time, so diamondBaseline knows WHICH bay a record
 * belongs to (the library hands the hook a contact's offset from the cup
 * centre but not the cup; the r6 windows are the bay's own boot footprint,
 * which needs the cup's axis and its corner/side family — bootFootprint).
 * The records are identical to one all-bays call: every per-slice structure
 * in c14Run (the family sections, their indices, the cancelled union) is
 * cup-independent, and only the ROI test and the report frame are per cup.
 * Cost: the shared per-slice work is repeated once per bay (printed as the
 * census seconds; the A2 all-bays run took 211 s for 92 x 6).
 */
function runCensus(meshes, cups, opts) {
  const out = { corners: [], fails: 0, warns: 0, adjudicate: 0, baseline: 0,
    touch: 0, slices: 0 };
  try {
    for (const cup of cups) {
      setDiamondCup(cup);
      const r = c14.c14Run(meshes, [cup], opts);
      out.corners.push(...r.corners);
      for (const k of ['fails', 'warns', 'adjudicate', 'baseline', 'touch']) {
        out[k] += r[k] ?? 0;
      }
      out.slices = r.slices;
    }
  } finally {
    setDiamondCup(null);
  }
  return out;
}

function runRedArm(meshes, cups, census) {
  const out = [];
  console.log('\nRED ARM — the baseline hook\'s own teeth. Each row moves one '
    + 'family by a known offset and re-runs the census on the stations that '
    + 'clause fired at.');
  // D621-PLAN-1: on ring entries clause dm2 is retired and the dm-bootsleeve
  // family does not exist (dm4 / dm7 have no subject); their arms would read
  // NOT EXERCISED for the right reason, so they are listed as RETIRED instead
  // of failing the bar. dm1d exists only on ring entries.
  const D0 = diamondPins();
  const armsHere = RED_ARMS.filter((a) => {
    if (a.ring) return !!D0?.RING;
    if (D0?.RING && (a.tag === 'dm2' || a.fam === 'dm-bootsleeve')) {
      console.log(`  ${a.id}: RETIRED on the model-hung ring (D621-PLAN-1) — `
        + (a.tag === 'dm2' ? 'clause dm2 admits nothing there (arms end on the glue plane; collar x facing is judged)'
          : 'no dm-bootsleeve family (the model has no facing wedge)'));
      return false;
    }
    if (D0?.RING && a.tag === 'dm9' && !armSlices(census, 'dm9').of) {
      // dm9 admits ONE parity artefact (the block read "inside" the boot at a
      // crown-band station by the authored clearance); on the ring build the
      // census carries no such record, so there is nothing for the arm to
      // release — said here, not silently counted as dead
      console.log(`  ${a.id}: RETIRED on the model-hung ring (D621-PLAN-1) — no crown-band `
        + 'parity record on this build (the keystone inner face sits on the cut about '
        + 'the model ring centre; the census finds no cap/block containment to release)');
      return false;
    }
    return true;
  });
  for (const a of armsHere) {
    const found = armSlices(census, a.tag);
    const slices = a.slices
      ? [...new Set([...a.slices, ...found.slices])].sort((p, q) => p - q)
      : found.slices;
    if (!found.of) {
      console.log(`  ${a.id}: NOT EXERCISED — no BASELINE record carries tag `
        + `${a.tag} in the shipped census`);
      out.push({ ...a, exercised: false });
      continue;
    }
    if (found.dropped) {
      console.log(`  ${a.id}: sampling ${found.slices.length} of ${found.of} `
        + `stations the clause fired at (${found.dropped} not re-run — the arm `
        + 'is a proof, not a census)');
    }
    const opts = { slices, baseline: diamondBaseline };
    const ctl = armTally(runCensus(meshes, cups, opts));
    const arm = armTally(runCensus(shifted(meshes, a.fam, a.d), cups, opts));
    let base0 = 0, base1 = 0;
    for (const [k, v] of ctl) if (armOf(k) === a.tag) base0 += v;
    for (const [k, v] of arm) if (armOf(k) === a.tag) base1 += v;
    const f0 = ctl.get('FAIL') ?? 0, f1 = arm.get('FAIL') ?? 0;
    // Two independent facts, then a per-kind pass predicate over them. The
    // LABEL is a readable summary of both; the PASS is decided on the fact the
    // clause's kind actually claims (see the kind docblock above), never on
    // the label. Deciding on the label would fold in a fact the charter for
    // that kind explicitly calls irrelevant — for a 'scope' arm the docblock
    // says in as many words that the tag's own count may rise or fall and
    // "neither is the thing under test" — and would then fail a clause for
    // being MORE falsifiable than its row declared. dm1-y is exactly that
    // case: it released 16 records AND put 104 FAILs on the board, strictly
    // stronger than the scope claim, and the first cut of this code called
    // that a miss.
    const released = base1 < base0;   // the clause let go of records
    const armed = f1 > f0;            // red appeared where the clause cannot reach
    const verdict = released ? (armed ? 'TEETH' : 'VANISHED')
      : (armed ? 'SCOPE-RED' : 'NO-EFFECT');
    const want = a.kind === 'scope' ? 'FAIL must rise'
      : a.kind === 'plane' ? 'the clause must release the record'
        : 'the clause must release AND FAIL must rise';
    const ok = a.kind === 'scope' ? armed
      : a.kind === 'plane' ? released
        : (released && armed);
    console.log(`  ${a.id} ${verdict}${ok ? '' : ` (WANTED: ${want})`}: shift `
      + `${a.fam} by [${a.d.map((v) => (v * 1000).toFixed(1)).join(', ')}] mm `
      + `over y ${slices.join('/')} — baselined ${base0} -> ${base1}, `
      + `FAIL ${f0} -> ${f1}`);
    console.log(`      ${a.note}`);
    out.push({ ...a, exercised: true, slices, sampledOf: found.of,
      base0, base1, fail0: f0, fail1: f1, verdict, want, ok });
  }
  const bad = out.filter((r) => r.exercised && !r.ok);
  const dead = out.filter((r) => !r.exercised);
  bar('C14-RED-ARM every baseline clause is held to the claim its own kind '
    + 'makes: a windowed clause must release the record AND let a FAIL take '
    + 'its place, a scope clause must put FAIL on the board when its family is '
    + 'driven into material it does not name, a single-plane clause must '
    + 'release the record when the part leaves that plane',
  bad.length === 0 && dead.length === 0,
  `${out.length} arm(s): `
    + out.map((r) => `${r.id} ${r.exercised ? r.verdict : 'NOT EXERCISED'}`)
      .join(', '));
  return out;
}

// ---------------------------------------------------------------------------
// CP-14 — JAW FACING PAD OUTWARD PROJECTION (spec row AUTHORED in wave A2)
// ---------------------------------------------------------------------------
//
// WHY THIS ROW EXISTS. C14-MOUTH-PAD above measures the pad's exposed RUN —
// the longest contiguous arc of dm-bootsleeve standing on the mouth side of
// the cushion (mouthExposure accumulates `run` in ARC LENGTH along the
// section curve; c14-disjoint.mjs:1189-1192). A run is the right instrument
// for "does this part intrude" and the WRONG one for "how proud is it": the
// jaw facing is supposed to run the length of the jaw, because it IS the jaw
// skin. Its 61.22 mm therefore reads alarming and says almost nothing — it is
// roughly the jaw span (10.67..80.82 mm) and would be about the same for a
// facing one micron thick. The quantity that decides whether the pad reads as
// a facing or as a fang is its PERPENDICULAR projection, and OB-488D-GEO-001
// has no row for it in EITHER revision — r2 re-verified: CP-03/SP-03 pin the
// pad's 4.7625 mm material thickness (MFR), which is a different quantity.
// That gap is the report's conflict N5.
//
// THE MEASUREMENT. At every judged mouth station, section dm-bootsleeve and
// dm-cushion; keep the pad samples falling inside the same two flank
// rectangles the mouth law judges (so the two numbers are commensurable);
// drop samples lying INSIDE the cushion section, because buried is not proud
// and the census already owns that failure; take each survivor's distance to
// the nearest cushion surface. The worst survivor is the outward projection.
//
// THE BOUND, AND ITS STATED UNCERTAINTY. There is no direct measurement to
// bound this with, and the dossier says so in as many words:
// docs/reference/MANIFEST.md §4, "No dimensioned pocket-leather reference",
// lists leather thickness and OUTWARD PROJECTION among the unmeasured
// quantities, "no photo in the dossier carries a scale bar for the leather".
// So the bound is DERIVED, in one step, from the best dossier measurement
// that bears on it:
//
//     a facing cannot project more material than the facing has.
//
// How much material it has is CP-03 / audit row D10 — "3/16 in Neoprene
// rubber facing on each end of every Cushion", manufacturer VERBATIM, tier
// MFR, graded HIGH confidence at docs/fidelity/table-dimension-audit.md:74.
//
//   NOMINAL CEILING  4.7625 mm  CP-03 (MFR, HIGH). 3/16 in.
//   UNCERTAINTY      +1.5875 mm WPA §9 legal facing band is 1/16..1/4 in
//                               (1.5875..6.3500 mm; same audit row). A table
//                               built at the top of the legal band carries
//                               6.3500 mm of facing, so a reading between
//                               4.7625 and 6.3500 is out of spec for THIS
//                               table yet still legal pool furniture. Both
//                               ceilings are printed; both are red-armed.
//   FLOOR            none       the taper to -0.02 mm across the apex is
//                               authored (table.js `proud`, PROUD = 0.4 mm
//                               over a 3 mm arc) and nothing in the dossier
//                               bounds the low side. Not gated, not implied.
//
// INSTRUMENT VALIDITY. The render authors this offset as a literal —
// PROUD = 0.0004 m (web/scene/table.js:10041), applied along the profile
// normal. A correct instrument must therefore read ~0.40 mm on the shipped
// mesh. That is not the bound and is not evidence for it; it is the check
// that the measurement is measuring the thing it names.
const PAD_NOMINAL_MM = 4.7625; // CP-03 / D10, MFR verbatim, 3/16 in
const PAD_LEGAL_MM = 6.3500;   // WPA §9 upper legal facing thickness, 1/4 in

/** Even-odd point-in-section test over raw section segments. */
function insideSection(segs, p) {
  let c = 0;
  for (const [a, b] of segs) {
    if ((a[1] > p[1]) === (b[1] > p[1])) continue;
    const x = a[0] + ((p[1] - a[1]) / (b[1] - a[1])) * (b[0] - a[0]);
    if (x > p[0]) c += 1;
  }
  return c % 2 === 1;
}

/** Closest point on segment ab to p, and its squared distance. */
function closestOnSeg(a, b, p) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2))
    : 0;
  const q = [a[0] + dx * t, a[1] + dy * t];
  return { q, d2: (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 };
}

/**
 * Worst perpendicular projection of the pad family beyond the cushion
 * surface, inside the mouth law's own judged flank rectangles.
 */
function padProjection(meshes, cups, opts) {
  const { padName, clothName, slices, tangencyMm, tipMm, noseMm } = opts;
  const half = opts.halfWidthMm ?? 30;
  const step = opts.stepMm ?? 0.5;
  const padT = meshes.filter((m) => m.name === padName).map((m) => m.tris);
  const cloT = meshes.filter((m) => m.name === clothName).map((m) => m.tris);
  if (!padT.length || !cloT.length) return null;
  let worst = -1; let worstAt = null; let samples = 0;
  const perY = [];
  for (const Ymm of slices) {
    const Y = Ymm / 1000;
    const padSeg = padT.flatMap((t) => c14.sectionAt(t, Y));
    const cloSeg = cloT.flatMap((t) => c14.sectionAt(t, Y));
    if (!padSeg.length || !cloSeg.length) { perY.push({ y: Ymm, worst: null }); continue; }
    let yWorst = -1;
    for (const cup of cups) {
      const cx = cup.x * 1000; const cz = cup.z * 1000;
      const ou = Math.sign(cx) || 1; const ov = Math.sign(cz) || 1;
      const S = (p) => [(p[0] - cx) * ou, (p[1] - cz) * ov];
      const offX = Math.abs(cx) - noseMm.x; const offZ = Math.abs(cz) - noseMm.z;
      const loX = -(tangencyMm + offX); const hiX = -(tipMm + offX);
      const loZ = -(tangencyMm + offZ); const hiZ = -(tipMm + offZ);
      // Which flank rectangle a sample belongs to, L first — the same
      // priority the mouth law gives it (c14-disjoint.mjs:1133-1134). The
      // rectangles are disjoint, so at most one claims a sample.
      //   L (u across the jaw, v straddling the cup): the z-rail flank. Its
      //     facing looks at the playfield down -v, which is why the law
      //     shoots its exposure ray along axis 1 there.
      //   U: the x-rail flank, mouth down -u, ray axis 0.
      const band = (s) => {
        if (s[0] >= loX && s[0] <= hiX && s[1] >= -half && s[1] <= half) return 1;
        if (s[0] >= -half && s[0] <= half && s[1] >= loZ && s[1] <= hiZ) return 0;
        return -1;
      };
      for (const [a, b] of padSeg) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(1, Math.ceil(len / step));
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          const sp = S(p);
          const ax = band(sp);
          if (ax < 0) continue;
          if (insideSection(cloSeg, p)) continue;
          let d2 = Infinity; let q = null;
          for (const [u, v] of cloSeg) {
            const c = closestOnSeg(u, v, p);
            if (c.d2 < d2) { d2 = c.d2; q = c.q; }
          }
          if (!q) continue;
          // MOUTH SIDE ONLY. The pad also has a back/return wall that stands
          // clear of the cushion on the OUTBOARD side, tens of mm away from
          // the nearest cushion surface; counting it would report the pad's
          // depth, not its proudness. In the S() frame both axes grow
          // outboard, so the pad stands in the mouth iff it is displaced from
          // its nearest cushion point in the NEGATIVE flank direction. (First
          // cut of this row omitted the test and read 8.984 mm at
          // C0 y=41 sheet u -40.24 v +23.57 — a point 23 mm OUTBOARD of the
          // cup, on the return wall. The authored offset is 0.4 mm; the
          // instrument-validity row below is what caught it.)
          const sq = S(q);
          if (!(sp[ax] - sq[ax] < 0)) continue;
          samples += 1;
          const d = Math.sqrt(d2);
          if (d > yWorst) yWorst = d;
          if (d > worst) {
            worst = d;
            worstAt = {
              corner: cup.label, y: Ymm, flank: ax === 1 ? 'L' : 'U',
              at: [+sp[0].toFixed(2), +sp[1].toFixed(2)],
            };
          }
        }
      }
    }
    perY.push({ y: Ymm, worst: yWorst < 0 ? null : +yWorst.toFixed(3) });
  }
  return {
    worst: worst < 0 ? null : +worst.toFixed(3), worstAt, perY, samples,
    judged: slices.length,
  };
}

// The row's own teeth. A bound authored from a DERIVED ceiling is worth
// nothing until it is shown to bite, so each arm drives the pad toward the
// playfield by a known offset and requires the bar to go red. +x is chosen
// because it is perpendicular-into-the-mouth on the x-rail flank of the two
// -x corners (C0, C3) and merely tangential on their z-rail flank, so the
// arm adds its own length to the projection on a real jaw face rather than
// sliding the part along itself. The bar reads the max over all corners, so
// the two +x corners burying deeper does not mask it.
const PAD_ARMS = [
  { id: 'cp14-nominal', d: [0.005, 0, 0], ceil: PAD_NOMINAL_MM,
    note: 'push the jaw pad 5.0 mm into the mouth: past the CP-03 nominal '
      + 'facing thickness (4.7625) but still INSIDE the WPA legal band, so '
      + 'the arm tests the row this table is held to and not a strawman.' },
  { id: 'cp14-legal', d: [0.0065, 0, 0], ceil: PAD_LEGAL_MM,
    note: 'push it 6.5 mm: past 1/4 in, the thickest facing WPA §9 permits '
      + 'on any table. A pad standing this proud is out of spec under the '
      + 'most generous reading of the uncertainty, so this arm must bite '
      + 'even for a reader who rejects the CP-03 nominal.' },
];

function runPadArm(meshes, cups, opts, base) {
  const out = [];
  console.log('\nCP-14 RED ARM — the projection bound\'s own teeth. Each row '
    + 'moves the pad family into the mouth by a known offset and re-measures.');
  for (const a of PAD_ARMS) {
    const r = padProjection(shifted(meshes, opts.padName, a.d), cups, opts);
    const got = r?.worst ?? null;
    const ok = got != null && got > a.ceil;
    console.log(`  ${a.id} ${ok ? 'TEETH' : 'NO-EFFECT (WANTED: projection '
      + `must exceed ${a.ceil.toFixed(4)} mm)`}: shift ${opts.padName} by `
      + `[${a.d.map((v) => (v * 1000).toFixed(1)).join(', ')}] mm — projection `
      + `${base == null ? 'n/a' : base.toFixed(3)} -> `
      + `${got == null ? 'n/a' : got.toFixed(3)} mm against a `
      + `${a.ceil.toFixed(4)} mm ceiling`);
    console.log(`      ${a.note}`);
    out.push({ ...a, base, got, ok });
  }
  bar('C14-PAD-PROUD-ARM the CP-14 projection ceiling bites: driving the jaw '
    + 'pad into the mouth past the nominal facing thickness, and past the '
    + 'widest facing WPA §9 permits, must both turn the row red',
  out.every((r) => r.ok),
  `${out.length} arm(s): ${out.map((r) => `${r.id} ${r.ok ? 'TEETH' : 'NO-EFFECT'}`).join(', ')}`);
  return out;
}

const bars = [];
let failures = 0;
const bar = (name, ok, detail) => {
  bars.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${detail}`);
  if (!ok) failures += 1;
};
const infos = [];
const info = (name, detail) => {
  infos.push({ name, detail });
  console.log(`INFO  ${name} — ${detail}`);
};

async function main() {
  let PORT = process.env.OB_E2E_PORT ? Number(process.env.OB_E2E_PORT) : null;
  let CDPP = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : null;
  let band = null;
  if (!PORT || !CDPP) {
    band = await claimPortBand(24470, 24499);
    PORT = band.http(0); CDPP = band.cdp(0);
  }
  const server = spawnStaticServer(webDir, PORT);
  await sleep(800);
  let chrome = null;
  try {
    const url = `http://127.0.0.1:${PORT}/app.html?table=${TABLE}`
      + '&cinema=1&seed=7&look=default';
    chrome = await launchChrome(url, { port: CDPP, width: 1280, height: 800 });
    let ready = false;
    for (let i = 0; i < 240 && !ready; i++) {
      await sleep(200);
      ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
    }
    if (!ready) throw new Error('app never became ready');
    // __gi.state is a PROPERTY (calling it as a function throws)
    for (let i = 0; i < 200; i++) {
      const st = await chrome.eval(
        '(() => { const s = window.__gi && window.__gi.state;'
        + ' return s ? JSON.stringify({r: !!s.ready, b: !!s.baked}) : null; })()')
        .catch(() => null);
      if (st && JSON.parse(st).r && JSON.parse(st).b) break;
      await sleep(200);
    }
    await sleep(1500);

    const G = JSON.parse(await chrome.eval(PINS_EVAL));
    if (G.id !== TABLE) throw new Error(`wrong table: ${G.id}`);
    // Arm the baseline clauses from the LIVE pins. Until this runs, DM is
    // null and diamondBaseline() exempts nothing (see setDiamondPins).
    setDiamondPins(G);
    const mm = (v) => (v * 1000).toFixed(3);
    {
      const D = diamondPins();
      if (!D) {
        console.log('pins: NOT ARMED — the r6 render keys (mouthCollar.landing + '
          + 'legRun or ring, bootSection, pocketCup, railJoint) or the cushion top are '
          + 'missing; diamondBaseline exempts nothing (fail-closed)');
      } else {
        if (D.RING) {
          console.log(`pins (D621-PLAN-1 ring): corner ring centre ${D.fam.corner.U_OUT.toFixed(2)} out `
            + `(off the disc centre ${D.fam.corner.OFF.toFixed(2)}), R_out ${D.fam.corner.R_OUT.toFixed(2)}, throat `
            + `${D.fam.corner.U_IN.toFixed(2)} / ${D.fam.corner.R_IN.toFixed(2)}, legInner ${D.fam.corner.W_LEG.toFixed(1)}, `
            + `apex band ${D.fam.corner.BAND.toFixed(1)}; side ${D.fam.side.U_OUT.toFixed(2)} (off ${D.fam.side.OFF.toFixed(2)}), `
            + `R_out ${D.fam.side.R_OUT.toFixed(2)}, throat ${D.fam.side.U_IN.toFixed(2)} / ${D.fam.side.R_IN.toFixed(2)}, `
            + `legInner ${D.fam.side.W_LEG.toFixed(1)}; glue plane at the bed ${D.GLUE0.toFixed(2)}; derived leg runs `
            + `${D.fam.corner.LEG_RUN.toFixed(1)} / ${D.fam.side.LEG_RUN.toFixed(1)}`);
        }
        console.log(`pins: SHELF ${D.SHELF.toFixed(2)} rw corner `
          + `${D.fam.corner.RW.toFixed(2)} / side ${D.fam.side.RW.toFixed(2)} `
          + `landing ${D.fam.corner.LANDING.toFixed(1)} / ${D.fam.side.LANDING.toFixed(1)} `
          + `legRun ${D.fam.corner.LEG_RUN.toFixed(1)} / ${D.fam.side.LEG_RUN.toFixed(1)} `
          + `throatIn ${D.fam.corner.THROAT_IN.toFixed(2)} / ${D.fam.side.THROAT_IN.toFixed(2)} `
          + `R_cut ${D.fam.corner.R_CUT.toFixed(2)} / ${D.fam.side.R_CUT.toFixed(2)} `
          + `SNR ${D.SNR.toFixed(2)} notchArc ${D.NOTCH_ARC.toFixed(1)} wallTop `
          + `${D.WALL_TOP.toFixed(1)} crest ${D.CREST.toFixed(1)} legCrest `
          + `${D.LEG_CREST.toFixed(2)} skirt ${D.SKIRT_BOTTOM.toFixed(1)} underside `
          + `${D.UNDERSIDE.toFixed(1)} cup top ${D.CUP_TOP.toFixed(1)} r `
          + `${D.CUP_R.toFixed(1)} bottom ${D.CUP_BOTTOM.toFixed(1)} (corner floor `
          + `${D.CUP_FLOOR_CORNER.toFixed(1)}) zTop ${D.ZTOP.toFixed(2)} crown drop `
          + `${D.CROWN_MAX_DROP.toFixed(1)}${HOOK_EMPTY ? ' — HOOK EMPTY (red basis run)' : ''}`);
      }
    }
    console.log(`table ${G.id} (style ${G.style}) L=${G.L} W=${G.W} `
      + `CW=${mm(G.CW)}mm frameTop=${mm(G.frameTop)}mm nose=${mm(G.noseHeight)}mm`);
    console.log(`corner jaw span: back foot ${mm(G.cornerBackFoot)} .. round end `
      + `${mm(G.cornerRoundEnd)} .. nose point ${mm(G.cornerNosePt)} mm inboard `
      + `of the nose corner (mouth ${mm(G.cornerMouth)} mm, facing `
      + `${G.facingDeg.corner.toFixed(2)} deg, cd ${mm(G.cd)} mm)`);
    console.log(`side jaw span:   back foot ${mm(G.sideBackFoot)} .. nose point `
      + `${mm(G.sideNosePt)} mm from the side meridian (mouth `
      + `${mm(G.sideMouth)} mm, facing ${G.facingDeg.side.toFixed(2)} deg)`);

    const allCups = G.pockets.map((p, i) => ({
      x: p.x, z: p.z, corner: p.corner,
      label: `${p.corner ? 'C' : 'S'}${i} (${p.x > 0 ? '+x' : (p.x < 0 ? '-x' : ' x0')}`
        + `,${p.z > 0 ? '+z' : '-z'})`,
    }));
    const cups = allCups.filter((c) => (CUPS_SEL === 'all')
      || (CUPS_SEL === 'corners' && c.corner)
      || (CUPS_SEL === 'sides' && !c.corner));
    console.log(`bays: ${cups.map((c) => `${c.label}@(${c.x.toFixed(4)},`
      + `${c.z.toFixed(4)})`).join(' ')}`);

    const nMesh = await chrome.eval(setupEval(cups));
    const meshes = [];
    const invRows = [];
    let bayTris = 0;
    for (let mi = 0; mi < nMesh; mi++) {
      const inf = JSON.parse(await chrome.eval(`window.__c14Info(${mi})`));
      const tris = [];
      for (let t0 = 0; t0 < inf.nt; t0 += 15000) {
        const part = JSON.parse(await chrome.eval(
          `window.__c14Chunk(${mi}, ${t0}, ${t0 + 15000})`));
        for (const f of part) tris.push(f);
      }
      if (!tris.length) continue;
      const fam = familyOf(inf.name);
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let k = 0; k < tris.length; k += 3) {
        for (let c = 0; c < 3; c++) {
          if (tris[k + c] < lo[c]) lo[c] = tris[k + c];
          if (tris[k + c] > hi[c]) hi[c] = tris[k + c];
        }
      }
      invRows.push({ name: inf.name, fam, nt: inf.nt, kept: tris.length / 9,
        y0: +(lo[1] * 1000).toFixed(2), y1: +(hi[1] * 1000).toFixed(2),
        aabb: [lo, hi].map((v) => v.map((q) => +(q * 1000).toFixed(1))),
        mat: inf.matUuid.slice(0, 8) });
      meshes.push({ name: fam, tris });
      bayTris += tris.length / 9;
    }
    const famRows = new Map();
    for (const r of invRows) {
      const e = famRows.get(r.fam)
        ?? { fam: r.fam, meshes: 0, kept: 0, y0: Infinity, y1: -Infinity };
      e.meshes += 1; e.kept += r.kept;
      e.y0 = Math.min(e.y0, r.y0); e.y1 = Math.max(e.y1, r.y1);
      famRows.set(r.fam, e);
    }
    console.log(`\nscene meshes ${nMesh}, in-bay meshes ${invRows.length}, `
      + `families ${famRows.size}, bay triangles ${bayTris}`);
    for (const e of [...famRows.values()].sort((a, b) => b.kept - a.kept)) {
      console.log(`  ${e.fam.padEnd(22)} ${String(e.meshes).padStart(3)} mesh `
        + `${String(e.kept).padStart(7)} tri   y [${e.y0.toFixed(2)}, `
        + `${e.y1.toFixed(2)}] mm`);
    }
    if (DUMP_TRIS) {
      fs.writeFileSync(path.resolve(DUMP_TRIS), JSON.stringify({
        table: TABLE, cups, box: C14_BOX, bayTris,
        meshes: meshes.map((m) => ({ name: m.name, tris: m.tris })),
      }));
      console.log(`triangle soup -> ${path.resolve(DUMP_TRIS)}`);
    }
    if (INVENTORY) {
      console.log('\nper-mesh:');
      for (const r of invRows.sort((a, b) => a.name.localeCompare(b.name))) {
        console.log(`  ${r.name.padEnd(26)} fam=${r.fam.padEnd(20)} `
          + `kept ${String(r.kept).padStart(6)}/${String(r.nt).padStart(7)} `
          + `aabb x[${r.aabb[0][0]}, ${r.aabb[1][0]}] y[${r.y0}, ${r.y1}] `
          + `z[${r.aabb[0][2]}, ${r.aabb[1][2]}] mat ${r.mat}`);
      }
      return;
    }

    // ---- mouth exposure, corners only (difference D in the header) ---------
    // Stations come from the live build (see PINS_EVAL): the band runs from
    // the facing's back foot to the nose point, both inboard distances from
    // the nose corner along a flank axis — the same convention the library's
    // snooker constants carry (37.03 / 90.30).
    //
    // JUDGED subjects: furniture that must never stand on the play side of
    // the cushion facing inside the jaw span. MEASURED-only subject:
    // dm-bootsleeve, the leather jaw facing pad (CP-03), which is lofted at a
    // deliberate PROUD offset over the cushion profile (table.js
    // `proud[k]` / `ringsS`) — it IS the visible jaw skin on this table, so
    // standing on the mouth side is its design, not a defect. Its exposure is
    // printed as an INFO row because the number is worth having (it says how
    // proud the leather reads and where its termination wall lands), never as
    // a bar. This is the one place the diamond and the snooker subject differ
    // in kind: obSnkJawWrap was a cloth wrap that had to stay masked.
    // D621-ALIGN r6: the casting (CP-10), the side liner (SP-11) and the boot
    // rim are retired; the keystone corner block (CP-15) joins the judged set.
    // The trap cup lives entirely below the bed and cannot section in the
    // mouth band, so it is not listed (a listed family with no section would
    // only trip the NO-CLOTH clause).
    // D621-ALIGN r6, second MEASURED-only subject: dm-bootcollar. Since
    // D621-LOOK-2 (spec r4/r5 CP-11 leg_run_mm) the boot is a U whose two
    // straight legs run INTO the table along the jaw from the arc's tangent
    // rows (corner legRun 84.3 mm, MODEL leather01), draped over the cloth
    // facing — the leather leg IS designed to stand on the mouth side of the
    // cushion facing over the inboard half of the jaw, and the cuestick
    // clearance mirror floors it there (CUE_CLEARANCE_CAPS.mouthCollarLegs,
    // single-sourced from the same legRun key). The corner-frame mouth law
    // cannot tell a draped leg from a fang: on the r6 red basis it read
    // every corner station 13 .. 41 as exposed (worst 37.4 mm at y = 41)
    // and NO-CLOTH (portions of the leg lie where its ray line meets no
    // cushion at all, past the facing). That is the same situation the
    // dm-bootsleeve row was moved to MEASURED for in wave A2, so the collar
    // joins it: its exposure is printed, never barred. The census rows
    // (clause dm2) are where the leg's contact with the facing is judged.
    const mouthSubjects = ['dm-cornerblock', 'dm-railtop', 'dm-falllip'];
    const mouthMeasured = ['dm-bootsleeve', 'dm-bootcollar'];
    const measuredWhy = {
      'dm-bootsleeve': 'the cloth jaw facing pad is lofted proud of the cushion by design',
      'dm-bootcollar': 'the boot\'s U legs run along the pocket axis BEHIND the '
        + 'cushion back (D621-PLAN-1: each arm ends on the CU-10 glue plane of its '
        + 'rail, the model relation; plan gate rows a/b judge that contact), so the '
        + 'corner-frame ray law, which walks the jaw facing, meets no cushion on '
        + 'their stations and reads NO-CLOTH by construction — before PLAN-1 the '
        + 'legs were authored to drape over the facing (mouthCollar.legRun)',
    };
    const cornerCups = cups.filter((c) => c.corner);
    const mouth = {};
    if (!NO_MOUTH && cornerCups.length) {
      for (const subj of [...mouthSubjects, ...mouthMeasured]) {
        if (!famRows.has(subj)) continue;
        const r = c14.mouthExposure(meshes, cornerCups, {
          wrapName: subj,
          clothName: 'dm-cushion',
          slices: diamondMouthSlices(),
          tangencyMm: G.cornerNosePt * 1000,
          tipMm: G.cornerBackFoot * 1000,
          noseMm: { x: (G.L / 2) * 1000, z: (G.W / 2) * 1000 },
        });
        mouth[subj] = r;
        const badRows = r.corners.flatMap((c) => c.slices
          .filter((s) => s.judged && (s.worst > 0 || s.noCloth))
          .map((s) => `${c.cup.label}@y${s.y}:${s.noCloth ? 'NO-CLOTH'
            : `${s.worst.toFixed(2)}mm(L${s.L.toFixed(1)}/U${s.U.toFixed(1)})`}`));
        const detail = `worst exposed run ${r.worst.toFixed(2)} mm over `
          + `${r.judged} judged slices x ${cornerCups.length} corner(s)`
          + (r.worstAt ? ` (at ${r.worstAt.corner} y=${r.worstAt.y}, sheet `
            + `${r.worstAt.u}, ${r.worstAt.v})` : '')
          + (badRows.length ? ` — ${badRows.slice(0, 6).join(' ')}` : '');
        if (mouthMeasured.includes(subj)) {
          info(`C14-MOUTH-PAD ${subj} (MEASURED, never judged: ${measuredWhy[subj]})`,
            detail);
          continue;
        }
        bar(`C14-MOUTH ${subj}: no arc stands in the MOUTH (play side of the `
          + `cushion facing) over the jaw span `
          + `${(G.cornerBackFoot * 1000).toFixed(2)}..`
          + `${(G.cornerNosePt * 1000).toFixed(2)} mm inboard of the nose corner`,
        badRows.length === 0 && r.judged > 0, detail);
      }
      info('C14-MOUTH side bays', 'ABSENT — mouthExposure is a CORNER-framed '
        + 'law (two flank rectangles, one per axis, each running inboard from '
        + 'a nose corner). A side bay has both jaws on one rail and no nose '
        + 'corner, so the cross-rail rectangle lands in open playfield, finds '
        + 'no cushion cloth and trips the fail-closed NO-CLOTH clause: a false '
        + 'red, not a measurement. Side-bay mouth intrusion is judged by the '
        + 'census rows below.');

      // ---- CP-14: the pad's PERPENDICULAR projection (see the docblock) ----
      // STATION SCOPE. CP-03 governs the facing on each cushion END — the
      // face the ball strikes, which runs from the bed up to the nose (CU-03,
      // 36.5125 mm). Above the nose the pad is not a facing at all: it is the
      // wrap over the cushion's top, and bounding a top wrap by a facing
      // thickness is a category error. The stations above the nose are still
      // MEASURED and printed, with the caveat they need: a constant-height
      // section is ill-conditioned on a near-horizontal surface, because a
      // 0.4 mm normal offset there maps to a large in-plane displacement, so
      // any number this instrument reports above the nose is an upper bound
      // on the conditioning error and not a proudness. Judging that number
      // would be judging the instrument.
      const noseTopMm = 36.5125;
      const allMouth = diamondMouthSlices();
      const padOptsBase = {
        padName: 'dm-bootsleeve',
        clothName: 'dm-cushion',
        tangencyMm: G.cornerNosePt * 1000,
        tipMm: G.cornerBackFoot * 1000,
        noseMm: { x: (G.L / 2) * 1000, z: (G.W / 2) * 1000 },
      };
      const padOpts = {
        ...padOptsBase, slices: allMouth.filter((y) => y <= noseTopMm),
      };
      const pp = padProjection(meshes, cornerCups, padOpts);
      const ppTop = padProjection(meshes, cornerCups, {
        ...padOptsBase, slices: allMouth.filter((y) => y > noseTopMm),
      });
      mouth['cp14-abovenose'] = ppTop;
      if (ppTop && ppTop.worst != null) {
        info('C14-PAD-PROUD above the nose (MEASURED, NOT judged — see the '
          + 'station-scope note: CP-03 governs the cushion END facing, and a '
          + 'constant-height section cannot measure proudness on the '
          + 'near-horizontal cushion top)',
        `${ppTop.worst.toFixed(3)} mm over ${ppTop.judged} station(s) above `
          + `${noseTopMm} mm`
          + (ppTop.worstAt ? ` (at ${ppTop.worstAt.corner} y=${ppTop.worstAt.y} `
            + `flank ${ppTop.worstAt.flank}, sheet ${ppTop.worstAt.at[0]}, `
            + `${ppTop.worstAt.at[1]})` : '')
          + '. Read as the conditioning bound it is, not as a defect: the '
          + 'authored offset is the same 0.4 mm at every row.');
      }
      mouth['cp14-projection'] = pp;
      // D621-PLAN-1: ring entries (mouthCollar.ring) draw NO jaw facing pad —
      // the purchased model has none; the cushion loft's own cloth facing is
      // the jaw's cover and the leather arm ends on the rubber's back. The
      // CP-14 projection row has no subject there: N/A by construction, said
      // out loud (an absent family is a fail-closed red everywhere else).
      const ringEntry = !!(G.render.mouthCollar && G.render.mouthCollar.ring);
      if (ringEntry && !famRows.has('dm-bootsleeve')) {
        info('C14-PAD-PROUD (CP-14) — N/A on the model-hung ring (D621-PLAN-1)',
          'no dm-bootsleeve family: the entry declares mouthCollar.ring, the '
          + 'model has no facing wedge, the arm ends on the CU-10 glue plane '
          + '(plan gate rows a/b); the projection bound has no subject');
      } else if (!pp || pp.worst == null) {
        bar('C14-PAD-PROUD (CP-14, authored wave A2) jaw facing pad outward '
          + 'projection', false,
        'NOT MEASURED — dm-bootsleeve or dm-cushion produced no section in the '
          + 'judged band, so the row cannot answer. Fail closed.');
      } else {
        const authored = 0.40; // web/scene/table.js:10041 PROUD = 0.0004 m
        const dev = Math.abs(pp.worst - authored);
        bar('C14-PAD-PROUD (CP-14, authored wave A2 — DERIVED bound, the '
          + 'dossier has no dimensioned pocket-leather reference: '
          + 'MANIFEST.md §4 lists leather thickness and outward projection as '
          + 'UNMEASURED) jaw facing pad projects no further than the facing '
          + 'it is made of: CP-03/D10 3/16 in neoprene = 4.7625 mm, '
          + 'manufacturer verbatim, tier MFR, confidence HIGH',
        pp.worst <= PAD_NOMINAL_MM,
        `worst projection ${pp.worst.toFixed(3)} mm over ${pp.judged} judged `
          + `slices x ${cornerCups.length} corner(s), ${pp.samples} in-band `
          + `samples`
          + (pp.worstAt ? ` (at ${pp.worstAt.corner} y=${pp.worstAt.y} flank `
            + `${pp.worstAt.flank}, sheet ${pp.worstAt.at[0]}, `
            + `${pp.worstAt.at[1]})` : '')
          + ` — nominal ceiling ${PAD_NOMINAL_MM.toFixed(4)} mm (CP-03), `
          + `uncertainty carries it to ${PAD_LEGAL_MM.toFixed(4)} mm (WPA §9 `
          + `legal facing band 1/16..1/4 in); margin `
          + `${(PAD_NOMINAL_MM - pp.worst).toFixed(3)} mm to nominal, `
          + `${(PAD_LEGAL_MM - pp.worst).toFixed(3)} mm to legal`);
        info('C14-PAD-PROUD instrument validity',
          `the render authors this offset as the literal PROUD = 0.4 mm `
          + `(web/scene/table.js:10041), so a measurement that means what it `
          + `says must land near it: read ${pp.worst.toFixed(3)} mm, deviation `
          + `${dev.toFixed(3)} mm. This is a check on the INSTRUMENT, not `
          + `evidence for the bound — the bound is derived from CP-03 and `
          + `would be the same number if the render had authored anything else.`);
        if (RED_ARM && !(ringEntry && !famRows.has('dm-bootsleeve'))) runPadArm(meshes, cornerCups, padOpts, pp.worst);
      }
    }

    // ---- MEASURED: the brief-literal disjointness census -------------------
    const slices = SLICES_OVERRIDE
      ? SLICES_OVERRIDE.split(',').map(Number).sort((p, q) => p - q)
      : diamondSlices();
    if (SLICES_OVERRIDE) {
      console.log(`DIAGNOSTIC LADDER (--slices): ${slices.join(', ')} — this `
        + 'run is an interrogation, not a gate result');
    }
    const t0 = Date.now();
    const census = runCensus(meshes, cups, {
      slices, baseline: diamondBaseline,
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const tally = {};
    const worst = [];
    for (const c of census.corners) {
      for (const s of c.slices) {
        for (const x of s.crossings ?? []) {
          tally[x.level] = (tally[x.level] ?? 0) + 1;
          if (x.level === 'FAIL' || x.level === 'WARN') {
            worst.push({ ...x, y: s.y, c: c.cup.label });
          }
        }
        for (const x of s.containments ?? []) {
          const k = `CONTAINED-${x.level ?? 'FAIL'}`;
          tally[k] = (tally[k] ?? 0) + 1;
          if ((x.level ?? 'FAIL') === 'FAIL') {
            worst.push({ a: x.own, b: x.host, key: `${x.own}|${x.host}`,
              embed: x.depth, arc: null, u: x.u, v: x.v, level: 'FAIL',
              y: s.y, c: c.cup.label, contained: true });
          }
        }
      }
    }
    worst.sort((a, b) => (b.embed ?? 0) - (a.embed ?? 0));
    const pairs = {};
    for (const f of worst) {
      if (f.level !== 'FAIL') continue;
      pairs[f.key] = (pairs[f.key] ?? 0) + 1;
    }
    // Per-class measured envelopes for the two counted-but-not-judged tiers.
    const tierBand = (lvl) => {
      const acc = new Map();
      for (const c of census.corners) {
        for (const s of c.slices) {
          for (const x of s.crossings ?? []) {
            if (x.level !== lvl) continue;
            const k = `${x.a}|${x.b}`;
            const e = acc.get(k) ?? { n: 0, e0: Infinity, e1: -Infinity,
              a0: Infinity, a1: -Infinity, y0: Infinity, y1: -Infinity };
            e.n += 1;
            e.e0 = Math.min(e.e0, x.embed ?? 0); e.e1 = Math.max(e.e1, x.embed ?? 0);
            e.a0 = Math.min(e.a0, x.arc ?? 0); e.a1 = Math.max(e.a1, x.arc ?? 0);
            e.y0 = Math.min(e.y0, s.y); e.y1 = Math.max(e.y1, s.y);
            acc.set(k, e);
          }
        }
      }
      return [...acc.entries()].sort((p, q) => q[1].n - p[1].n)
        .map(([k, e]) => `${k} x${e.n} y[${e.y0}..${e.y1}] `
          + `embed ${e.e0.toFixed(2)}..${e.e1.toFixed(2)} mm `
          + `arc ${e.a0.toFixed(2)}..${e.a1.toFixed(2)} mm`)
        .join('; ') || 'none';
    };
    // CHARTER (GH-488D wave A2). This bar judges FAIL only. WARN and
    // ADJUDICATE are counted and their measured envelopes printed, but they
    // are not bars. Four reasons, each checkable in the law's own source:
    //   1. c14-disjoint.mjs:819 applies the baseline demotion to FAIL alone
    //      (`if (rec.level === 'FAIL' && why) rec.level = 'BASELINE'`), so a
    //      WARN can never be cleared by an honest, documented exemption — only
    //      by moving geometry. Barring on WARN makes the hook a dead letter.
    //   2. The law's own ladder ranks WARN BELOW FAIL as the benign tier
    //      ("shallow, short, and it comes back out"). Barring on it inverts
    //      the severity ordering the library ships.
    //   3. The law's ADJUDICATE comment says outright that "this slice ladder
    //      is not the instrument that can judge it" — the cushion cloth lying
    //      inside the rail-wood block for 371 mm down every rail is one
    //      uniform condition along the whole table, not a pocket defect.
    //   4. The shipped consumer check-pocket-construction.mjs:1001 does not
    //      gate on this census at all; it reports it via info(..., 'NOT
    //      judged'). A FAIL-only bar is therefore still strictly stricter
    //      than any precedent in the tree.
    // The first cut of this file barred on fails+warns+adjudicate. That was
    // stricter than the law's own semantics and than every shipped consumer,
    // and is disclosed as a charter change in SPIKE-REPORT.md § 9.
    bar('C14-CENSUS section-curve disjointness: zero FAIL crossings in every '
      + 'diamond bay (the brief-literal law: two surfaces may abut and may '
      + 'share a skin, but a curve that dives through another surface and '
      + 'keeps going is an interpenetration). WARN/ADJUDICATE are counted, '
      + 'not judged — see the CHARTER comment above this bar',
    census.fails === 0,
    `${slices.length} slices x ${cups.length} bays, ${bayTris} bay triangles, `
      + `${secs}s: `
      + Object.entries(tally).sort().map(([k, v]) => `${k} ${v}`).join(', '));
    // Everything the hook cleared, itemized by clause. A baseline entry is a
    // decision not to judge, so the gate has to print how much it is not
    // judging and under which entry — a lump "BASELINE n" would let an entry
    // widen unnoticed.
    {
      const byTag = new Map();
      for (const c of census.corners) {
        for (const s of c.slices) {
          for (const x of [...(s.crossings ?? []), ...(s.containments ?? [])]) {
            if ((x.level ?? 'FAIL') !== 'BASELINE') continue;
            const t = whyTag(x.why) ?? '(untagged)';
            const e = byTag.get(t) ?? { n: 0, y0: Infinity, y1: -Infinity,
              e0: Infinity, e1: -Infinity, pairs: new Set() };
            const dep = x.embed ?? x.depth ?? 0;
            e.n += 1;
            e.y0 = Math.min(e.y0, s.y); e.y1 = Math.max(e.y1, s.y);
            e.e0 = Math.min(e.e0, dep); e.e1 = Math.max(e.e1, dep);
            e.pairs.add(`${x.a ?? x.own}|${x.b ?? x.host}`);
            byTag.set(t, e);
          }
        }
      }
      info('C14-CENSUS BASELINED, by clause (every record here was RED in '
        + 'c14-red-basis-488d-r6.json, which was taken with --hook-empty on '
        + 'the r6 build; each clause is derived from an authored constant and '
        + 'red-armed — see diamondBaseline and --red-arm)',
      [...byTag.entries()].sort((p, q) => q[1].n - p[1].n)
        .map(([t, e]) => `${t} x${e.n} y[${e.y0}..${e.y1}] `
          + `depth ${e.e0.toFixed(2)}..${e.e1.toFixed(2)} mm `
          + `{${[...e.pairs].join(', ')}}`).join('; ') || 'none');
    }
    info('C14-CENSUS WARN tier (MEASURED, not judged: the law demotes only '
      + 'FAIL on a baseline hit — c14-disjoint.mjs:819 — so a WARN is '
      + 'un-clearable by disclosure, and the ladder ranks it BELOW FAIL as '
      + 'the benign "shallow, short, and it comes back out" tier)',
    `${census.warns} record(s): ${tierBand('WARN')}`);
    info('C14-CENSUS ADJUDICATE tier (MEASURED, not judged: the law states in '
      + 'source that "this slice ladder is not the instrument that can judge '
      + 'it" — a beyond-bay run is the uniform rail-length lamination, not a '
      + 'pocket condition)',
    `${census.adjudicate} record(s): ${tierBand('ADJUDICATE')}`);
    for (const c of census.corners) {
      console.log(`  ${c.cup.label.padEnd(12)} FAIL ${String(c.fails).padStart(4)} `
        + `WARN ${String(c.warns).padStart(4)} ADJ ${String(c.adjudicate ?? 0).padStart(4)} `
        + `BASE ${String(c.baseline ?? 0).padStart(4)} `
        + `TOUCH ${String(c.touch ?? 0).padStart(4)}`);
    }
    info('C14-CENSUS pairs (FAIL only)', Object.entries(pairs)
      .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} x${v}`).join(', ')
      || 'none');
    console.log(`\ndeepest ${Math.min(TOP, worst.length)} of ${worst.length} `
      + 'FAIL/WARN records:');
    for (const f of worst.slice(0, TOP)) {
      console.log(`  ${f.level.padEnd(4)} ${f.a} x ${f.b}`
        + `${f.contained ? '(contained)' : ''} ${f.c} y=${f.y} `
        + `(u ${f.u}, v ${f.v}) embed ${f.embed} mm`
        + `${f.arc === null ? '' : ` arc ${f.arc} mm`}`
        + `${f.exited === false ? ' NO-EXIT' : ''}${f.beyond ? ' beyond-bay' : ''}`);
    }

    // ---- the baseline hook's own teeth --------------------------------
    let redArm = null;
    if (RED_ARM) redArm = runRedArm(meshes, cups, census);

    if (JSON_OUT) {
      const rec = {
        ...census,
        redArm,
        _note: `C14 red basis for ${TABLE}, produced by `
          + 'tools/render/c14-488d.mjs over the LIVE runtime mesh '
          + `(app.html?table=${TABLE}&cinema=1&seed=7&look=default). `
          + `${slices.length}-station ladder x ${cups.length} bays `
          + `(${cups.map((c) => c.label).join(', ')}), ${bayTris} transferred `
          + 'triangles, family keys dm-* from the scene names. Law module '
          + 'tools/render/c14-disjoint.mjs imported VERBATIM; baseline hook '
          + `is ${HOOK_EMPTY ? 'EMPTY (--hook-empty: this record is the RED '
            + 'BASIS of this build; pins read, ladder derived, nothing exempted)'
            : diamondPins() ? 'ARMED from the live pins '
            + `(SHELF ${diamondPins().SHELF.toFixed(2)} mm, rw `
            + `${diamondPins().RW_MIN.toFixed(2)}..`
            + `${diamondPins().RW_MAX.toFixed(2)} mm, landing corner/side `
            + `${diamondPins().fam.corner.LANDING.toFixed(1)}/`
            + `${diamondPins().fam.side.LANDING.toFixed(1)} mm, legRun `
            + `${diamondPins().fam.corner.LEG_RUN.toFixed(1)}/`
            + `${diamondPins().fam.side.LEG_RUN.toFixed(1)} mm, SNR `
            + `${diamondPins().SNR.toFixed(1)} mm, wall top `
            + `${diamondPins().WALL_TOP.toFixed(1)}, crest `
            + `${diamondPins().CREST.toFixed(1)}, sleeve `
            + `${diamondPins().SKIRT_BOTTOM.toFixed(1)}, cup top `
            + `${diamondPins().CUP_TOP.toFixed(1)} mm)` : 'DISARMED (no pins)'}`
          + ' — see diamondBaseline for the entries and their derivations. '
          + 'Mouth exposure is corner-only by construction of the library '
          + '(see header, D).',
        table: TABLE,
        box: C14_BOX,
        bayTris,
        cups,
        sliceLadder: slices,
        families: [...famRows.values()].sort((a, b) => b.kept - a.kept),
        meshes: invRows,
        tally,
        pairs,
        worst: worst.slice(0, 200),
        mouth,
        bars,
        infos,
        pins: G,
      };
      fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify(Object.assign({ tool: 'tools/render/c14-488d.mjs', mode: 'census' }, rec), null, 1)); // FIX8: tool + mode first
      console.log(`\nC14 record -> ${path.resolve(JSON_OUT)}`);
    }
    console.log(`\n${failures} bar(s) RED of ${bars.length}`);
  } finally {
    if (chrome && chrome.close) await Promise.resolve(chrome.close()).catch(() => {});
    await stopStaticServer(server);
    if (band) band.release?.();
  }
}

await main();
