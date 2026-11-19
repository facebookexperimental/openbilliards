// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-cushion-profile.mjs — numeric gate for the per-family cushion loft
// (web/scene/table.js family loft or the scene's OX construction). Runs under
// plain node against the COMMITTED real three module (web/vendor/
// three.module.min.js, aliased into the gitignored node_modules by
// lib/ensure-three.mjs) — the retired minimal stub triangulated caps with
// the OPPOSITE winding contract to real earcut and thereby validated the
// inverted end-rail caps of issue #308. Asserts, per catalog entry and per
// rail body:
//   1. profile sanity: finite rows, ascending z, apex row EXACTLY at
//      (o = 0, z = noseHeightFrac × profileBallD), base inside the plan
//      depth (009 colinearity law: the extreme fiber is the kernel plane);
//   2. every offset ring is finite and simple (no self-intersection at any
//      profile height — miter crossovers must have been welded);
//   3. ringAt(0) reproduces the plan polygon BIT-EXACTLY in doubles (the
//      kernel nose line IS a mesh edge ring), and the f32 mesh vertices
//      carry it within float32 quantization;
//   4. carom mating: the corner-miter junction vertices of adjacent bodies
//      coincide at every profile height (seamless 45° miters);
//   5. cap orientation (issue #308): every top-cap triangle of every loft
//      faces UP — the cloth materials are single-sided, so a down-facing
//      cap is a back-face-culled see-through hole in the rail. The cap is
//      selected at the FAMILY's cap height, prof.zTop − jointTuck (GH-666:
//      a tucked family lays its cap under the deck; selecting at zTop read
//      the horizontal deck bands instead and a reversed or missing tucked
//      cap passed — review round 1 on #672);
//   6. occlusion regression at the exact owner-caught scene (issue #308):
//      from the wpa-lag strike camera, sight rays to the sub-nose surface
//      of the cue ball frozen on the head-cushion nose (and to the bed
//      contact-shadow region behind the nose) must strike the cushion
//      lofts BEFORE the ball sphere / bed — with the meshes' real
//      single-sided raycast semantics, so a culled cap cannot pass.
//
//   node web/tools/render/check-cushion-profile.mjs
//   node web/tools/render/check-cushion-profile.mjs --perturb=flip-tucked-cap
//     the rule-5 arm: every triangle at a tucked family's cap height has its
//     winding reversed before the checks — rule 5 must then FAIL on every
//     tucked loft and no untucked loft may change; exit 0 iff ARMED.
//   node tools/render/check-cushion-profile.mjs --sweep-mm=<step>
//     additionally sweep plan insets from zero through the family's maximum
//     row offset, including the endpoint; dense failure rows start [dense].
//     Labels round to the requested step's decimal places in millimetres;
//     an off-grid endpoint retains its precision. Tested offsets are unchanged.
//     Report-only: combining --sweep-mm with --expect-baseline or --perturb
//     is a bad argument (exit code 2), since dense rows have separate identities.
//     Without the flag the original check rows and failure identities remain.
//   node tools/render/check-cushion-profile.mjs --perturb=midjaw-overrun
//     restore the historical unconditional middle-jaw closure through the
//     shared arc law; require exactly the recorded differential AND crossing
//     coordinates on the live kernel back line. Also bound the difference
//     from the live circle/back-line crossing by one arc segment's sagitta,
//     and report its delta against the order window recorded in the fixture.
//     No other table may change.
//   node tools/render/check-cushion-profile.mjs --perturb=pairwise-jaw-weld
//     clear only the context's jawArcSegments opt-in on unchanged exported
//     plans. Require the recorded differential, each first-crossing coordinate,
//     and its LIVE facing/nose erosion vertex. Missing recordings fail closed.
//   Shared TABLE_SPECS objects are checked once; all say + fail events are
//     replayed under each alias id, preserving console rows and failure sets.
//     The end-of-run summary always annotates each alias pair. N is the number
//     of those cached check events replayed instead of recomputed, summed
//     across both runs in arm modes; summary annotations are not check events.
//   node tools/render/check-cushion-profile.mjs --profile-sources [<file>]
//     the L-CCP PROFILE-SOURCE census (main): classify the prof each catalog
//     statement produced by digest identity; a file pins the class per table.
//   node tools/render/check-cushion-profile.mjs --profile-sources <file> --perturb=drop-profile-argument
//     the census red plant: the first non-us_pool_k66 table loses its family
//     before the unchanged statement and the census must read DIFF.
//   --expect-baseline [<file>] compares against that file instead of the
//     committed fixture; a blank value is refused by name.
//   --help prints usage, including the report-only sweep restriction and single-use options.
//   node web/tools/render/check-cushion-profile.mjs --perturb=plant-degenerate
//   node web/tools/render/check-cushion-profile.mjs --perturb=plant-collinear
//   node web/tools/render/check-cushion-profile.mjs --perturb=plant-weldonly
//   node web/tools/render/check-cushion-profile.mjs --perturb=inflate-degenerate
//     the degenerate arms (issue #728): each plant's zero-area triangle on the cap plane must
//     be SKIPPED by rule 5 (perturbed set == unperturbed == baseline) while exactly its
//     definition class rises by 1 per loft (index reuse and weld-only feed cap-repeated,
//     collinear feeds cap-zero-area); a finite down-facing 1 mm triangle must add exactly one
//     rule-5 row per loft. All print the shared DEGENERATE census line per loft.
import { ensureRealThree, repoUrl } from './lib/ensure-three.mjs';
import { MM, ringCrossings, denseOffsets } from './lib/cushion-ring.mjs';
import { denseOffsetLabel } from './lib/dense-offset-label.mjs';
import { renameAliasEvent, renameAliasRow } from './lib/alias-replay.mjs';
import { readMidjawInputs, midjawOverrun, assessMidjawArm } from './lib/midjaw-overrun.mjs';
import { assessJawWeldArm, JAW_WELD_TABLE } from './lib/jaw-weld-arm.mjs';
import { liveJawAnchor } from './lib/jaw-erosion.mjs';

ensureRealThree();
const THREE = await import('three');
const { TABLE_SPECS, makeGeom, railPolysFor, cushionProfile, CUSHION_FAMILIES,
  cushionPlanCtx, cushionGeom, CN8_MID, SNK_CUSHION, roxCushionFor } = await import(repoUrl('web/scene/table.js'));
const { isDegenerateTri, degenerateCensus, CAP_PLANE_F32Z } = await import('./lib/loft-degenerate.mjs');
const { plantDegenerate, inflateDegenerate, plantCollinear, plantWeldOnly } = await import('./lib/loft-degenerate-arms.mjs');
const { DATA } = await import(repoUrl('web/tools/scenario-catalog-data.mjs'));

// One RUN = every check over every entry; its failure set is the list of FAIL rows (strings whose
// identity is the table, rail, rule and the measured numbers). The arm and the baseline row are
// DIFFERENTIAL (review round 2 on #672): they compare whole failure sets by row identity, never counts.
let current = []; let failPrefix = 'FAIL:'; let entryEvents = null;
const say = (msg) => { entryEvents?.push({ kind: 'log', msg }); console.log(msg); };
const fail = (msg) => {
  current.push(msg);
  entryEvents?.push({ kind: 'fail', msg });
  if (msg.startsWith('[dense] ')) console.error(msg);
  else console.error(failPrefix, msg);
};
// Opt-in plan sweep: back inset is zero (the plan back line); the original
// profile-height checks below still exercise each row's height-dependent back.
const USAGE = 'usage: node tools/render/check-cushion-profile.mjs '
  + '[--expect-baseline[=<file>] | --profile-sources[=<file>] | --perturb=flip-tucked-cap | --perturb=midjaw-overrun'
  + ' | --perturb=pairwise-jaw-weld | --perturb=drop-profile-argument | --perturb=plant-degenerate'
  + ' | --perturb=plant-collinear | --perturb=plant-weldonly | --perturb=inflate-degenerate | --sweep-mm=<step>]';
const badArguments = (message) => {
  console.error(`check-cushion-profile: ${message}`);
  process.exit(2);
};
const [, , ...options] = process.argv;
// Strict argument loop (ring fence, #765) over the UNION of both sides' options: main's
// `--expect-baseline [<file>]` / `--profile-sources [<file>]` take an optional value in the
// `=<file>` or the `<file>` (next token) form, exactly as lib/argv.mjs optValue reads them;
// every other token must be a known switch or a `--perturb=` / `--sweep-mm=` form.
const VALUE_OPTIONS = ['--expect-baseline', '--profile-sources'];
const isKnownOption = (arg) => arg === '--help' || arg === '--sweep-mm' || arg.startsWith('--sweep-mm=')
  || arg.startsWith('--perturb=') || VALUE_OPTIONS.some((flag) => arg === flag || arg.startsWith(`${flag}=`));
const consumesNext = (arg, next) => VALUE_OPTIONS.includes(arg) && next !== undefined && !next.startsWith('--');
const unknownOption = (() => {
  for (let i = 0; i < options.length; i++) {
    if (!isKnownOption(options[i])) return options[i];
    if (consumesNext(options[i], options[i + 1])) i++;
  }
  return undefined;
})();
if (unknownOption !== undefined) badArguments(`unknown argument ${unknownOption}; ${USAGE}`);
// Single-use law (#766): each option family may be given once; a consumed value token is not an option.
const argumentsByFamily = new Map();
for (let i = 0; i < options.length; i++) {
  const option = options[i];
  const family = option.split('=')[0];
  const given = argumentsByFamily.get(family) ?? [];
  given.push(option);
  argumentsByFamily.set(family, given);
  if (given.length > 1) badArguments(`duplicate argument ${family} (${given.join(', ')}); each option may be given once; ${USAGE}`);
  if (consumesNext(option, options[i + 1])) i++;
}
if (process.argv.includes('--help')) {
  console.log(`${USAGE}\n`
    + '--sweep-mm=<step> is report-only and cannot be combined with --expect-baseline, --perturb or --profile-sources <file>.\n'
    + 'Alias summaries always count cached check rows replayed instead of recomputed.\n'
    + 'Each option may be given once.');
  process.exit();
}
const sweepArg = process.argv.find((a) => a.startsWith('--sweep-mm='));
const SWEEP_MM = sweepArg === undefined ? null : Number(sweepArg.slice('--sweep-mm='.length));
const SWEEP = SWEEP_MM === null ? null : SWEEP_MM / MM;
if (process.argv.includes('--sweep-mm') || (SWEEP !== null && (!Number.isFinite(SWEEP) || !(SWEEP > 0)))) {
  badArguments(`--sweep-mm=<step> requires a finite positive millimetre step; ${USAGE}`);
}
// FIX2 (review round 2 on #731 P2 (b)): `--perturb=` blank or trailing is refused, never read as the unperturbed run
const PERTURB = (await import('./lib/argv.mjs')).stringOpt('--perturb', { default: null, tag: 'cushion-profile' });
if (PERTURB && PERTURB !== 'flip-tucked-cap' && PERTURB !== 'midjaw-overrun' && PERTURB !== 'pairwise-jaw-weld' && PERTURB !== 'drop-profile-argument' && PERTURB !== 'plant-degenerate' && PERTURB !== 'plant-collinear' && PERTURB !== 'plant-weldonly' && PERTURB !== 'inflate-degenerate') {
  badArguments(`unknown --perturb ${PERTURB} (flip-tucked-cap | midjaw-overrun | pairwise-jaw-weld | drop-profile-argument | plant-degenerate | plant-collinear | plant-weldonly | inflate-degenerate); ${USAGE}`);
}
// FIX2 (review round 2 on #731 P2 (b)): `--expect-baseline` alone = the committed fixture; `--expect-baseline <file>` /
// `=<file>` = that file (must exist); `--expect-baseline=` blank = REFUSED by name (never "no baseline")
const { optPresent: bPresent, optValue: bValue } = await import('./lib/argv.mjs');
const EXPECT_BASELINE = bPresent('--expect-baseline');
const BASELINE_ARG = (() => { if (!EXPECT_BASELINE) return null; const v = bValue('--expect-baseline'); if (v === undefined) return null; /* the bare flag = the committed fixture */ if (!v.trim()) { const eqForm = process.argv.some((a) => a.startsWith('--expect-baseline=')); console.error(`[cushion-profile] REFUSED — --expect-baseline${eqForm ? '=' : ''} given without a value${eqForm ? '' : ' (blank)'}; pass a file or the bare flag`); process.exit(2); } return v; })(); // FIX4: one reader for both forms (argv.mjs optValue: the LAST occurrence wins, the value as given; blank refused, named by its form; existence judged on the path as given below)
if (BASELINE_ARG !== null && BASELINE_ARG !== '' && !(await import('node:fs')).existsSync(BASELINE_ARG)) { console.error(`[cushion-profile] REFUSED — --expect-baseline ${BASELINE_ARG}: file not found`); process.exit(2); }
if (SWEEP !== null && (EXPECT_BASELINE || PERTURB)) {
  const incompatible = [EXPECT_BASELINE && '--expect-baseline', PERTURB && `--perturb=${PERTURB}`].filter(Boolean);
  badArguments(`--sweep-mm cannot be combined with ${incompatible.join(' or ')} (dense sweep is report-only)`);
}
// The committed UNPERTURBED failure set, now empty after GH-671 (any row breaks it), or the file named by --expect-baseline <file>
const BASELINE_URL = BASELINE_ARG ? (await import('node:url')).pathToFileURL((await import('node:path')).resolve(BASELINE_ARG)) : repoUrl('tools/render/fixtures/cushion-profile-baseline-490.json');
const loadBaseline = async () => JSON.parse(await (await import('node:fs/promises')).readFile(new URL(BASELINE_URL), 'utf8'));
const setDiff = (a, b) => { const sb = new Set(b), sa = new Set(a); return { added: a.filter((m) => !sb.has(m)), gone: b.filter((m) => !sa.has(m)) }; };
// L-CCP (landing rule, 2026-09-11 — the Rasson lane's ceremony dry run; spec CEREMONY-READINESS-2026-09-11 §5): the PROFILE-SOURCE
// CENSUS. The two `const prof = cushionProfile(...)` statements — site 1 = runAll's catalog loop, site 2 = the wpa-lag scenario check
// (main :80 / :262, this tree :85 / :270 — the STATEMENT is the key, not the line) — are L-CCP territory: four lanes edit them at their
// landings (the snooker lane's third argument, the D621 companion's fourth, the Rasson OX wrapper at site 1 only); a side-pick at any
// landing silently drops another lane's argument and BASELINE HELD does not see it. Keep both statements in the exact upstream shape.
// The census CLASSIFIES `prof` — the object the rules judged — by DIGEST IDENTITY against candidates built in the same run from the
// unperturbed spec (never by re-reading G.render.*: a spec-reading classifier would print the class the gate did not judge):
// digest = sha256 over rows (9 dp) + zTop + oTop, first 8 hex; classes rox-specific (roxCushionFor(G)?.profile) → entry-profile
// (cushionProfile(family, zNose, CW, G.render.cushionProfile)) → snooker-depth (ARGUMENT-DECLARED: the third argument !== G.CW, tested
// before the digest — the loft bytes can be identical) → family (cushionProfile(family, zNose, CW)) → unclassified (RED). On this tree
// the candidates are family only; each landing lane adds its candidate line below. `--profile-sources <file>` pins the class per table
// (tools/render/fixtures/cushion-profile-sources-490.json — later lanes extend it) and prints the two sites' argument lists, which must
// be textually identical after comments / whitespace are stripped (site 2 cannot be covered by the census: wpa-lag's table is a family
// row). Red plant: `--perturb=drop-profile-argument` drops the family of the first non-us_pool_k66 catalog table before the unchanged
// statement — `prof` becomes the us_pool_k66 fallback, its digest leaves every candidate, the census reads DIFF naming the table.
const PROFILE_SOURCES = bPresent('--profile-sources');
const SOURCES_ARG = (() => { if (!PROFILE_SOURCES) return null; const v = bValue('--profile-sources'); if (v === undefined) return ''; if (!v.trim()) { console.error('[cushion-profile] REFUSED — --profile-sources= given without a value (the bare flag prints the census; a file pins it)'); process.exit(2); } return v; })();
if (SOURCES_ARG && !(await import('node:fs')).existsSync(SOURCES_ARG)) { console.error(`[cushion-profile] REFUSED — --profile-sources ${SOURCES_ARG}: file not found`); process.exit(2); }
if (SWEEP !== null && SOURCES_ARG) badArguments('--sweep-mm cannot be combined with --profile-sources <file> (dense sweep is report-only)');
if (PERTURB === 'drop-profile-argument' && !PROFILE_SOURCES) { console.error('[cushion-profile] REFUSED — --perturb=drop-profile-argument is the census red plant: give --profile-sources <file>'); process.exit(2); }
const sources = {};
const { createHash } = await import('node:crypto');
const profDigest = (p) => createHash('sha256').update(JSON.stringify([p.rows.map((r) => [r.o.toFixed(9), r.z.toFixed(9), r.crease ? 1 : 0]), p.zTop.toFixed(9), p.oTop.toFixed(9)])).digest('hex').slice(0, 8);
const DROP_ID = PERTURB === 'drop-profile-argument' ? Object.keys(TABLE_SPECS).find((id) => makeGeom(id).render.cushionFamily !== 'us_pool_k66') : null;
function classifyProfile(id, G, prof, depth) {
  // candidates from the UNPERTURBED spec (a fresh makeGeom), digested in this run — extension points for the later landings:
  //   cand.rox   = roxCushionFor(G0)?.profile                                         (the Rasson OX branch)
  //   cand.entry = cushionProfile(G0.render.cushionFamily, zNose0, G0.CW, G0.render.cushionProfile)   (the D621 companion)
  // and the snooker lane replaces `depth` (the statement's third argument as this tree passes it) with its ternary.
  const G0 = makeGeom(id); const zNose0 = G0.kernel.noseHeightFrac * G0.render.profileBallD;
  const cand = { family: cushionProfile(G0.render.cushionFamily, zNose0, G0.CW) };
  if (G0.render.cushionProfile) cand.entry = cushionProfile(G0.render.cushionFamily, zNose0, G0.CW, G0.render.cushionProfile); // D621 (the documented extension point) — GUARDED and only ever a DEFINED candidate: an unguarded call equals the family digest and would re-label every family table; an undefined key would crash profDigest
  const rox = roxCushionFor(G0)?.profile; if (rox) cand.rox = rox; // Rasson OX (the documented extension point; landing rule L-CCP, ADDENDUM-1 R-RB1) — GUARDED ASSIGNMENT: a non-OX table leaves the key ABSENT, never `undefined` (profDigest(undefined) would throw before any HELD/DIFF line)
  const d = profDigest(prof); const dig = Object.fromEntries(Object.entries(cand).map(([k, v]) => [k, profDigest(v)]));
  let cls = 'unclassified';
  if (cand.rox && dig.rox === d) cls = 'rox-specific';
  else if (cand.entry && dig.entry === d) cls = 'entry-profile';
  else if (depth !== G.CW) cls = 'snooker-depth';
  else if (dig.family === d) cls = 'family';
  return { cls, digest: d, candidates: dig, depth: +depth.toFixed(6), cw: +G.CW.toFixed(6), family: G0.render.cushionFamily };
}
// rule-5 bookkeeping for the arm: tucked lofts (jointTuck > 0) vs the rest
let tuckedLofts = 0, rule5Tucked = 0, rule5Untucked = 0;
let midjawCrossings = [];
let jawWeldCrossings = [], jawWeldPlans = [];
const midjawLaw = PERTURB === 'midjaw-overrun' ? {
  ...await import(repoUrl('web/scene/cn8midlaw.js')),
  CN8_MID,
} : null;
const aliasReplays = new Map();
// per-loft degenerate census for the #728 arms (reset per runAll, like tuckedLofts)
let loftCensus = [];


async function runAll(perturbMode) {
  current = []; tuckedLofts = 0; rule5Tucked = 0; rule5Untucked = 0; loftCensus = [];
  midjawCrossings = [];
  jawWeldCrossings = []; jawWeldPlans = [];
  failPrefix = perturbMode ? `[perturbed ${perturbMode}] FAIL:` : 'FAIL:';
  // Identity, not equality of fields: rules 3a/3b/5 execute once per spec.
  // The scenario-specific rule 6 below already executes only once per run.
  const checkedSpecs = new Map();
  for (const id of Object.keys(TABLE_SPECS)) {
    const spec = TABLE_SPECS[id], cached = checkedSpecs.get(spec);
    if (cached) {
      const rename = (msg) => renameAliasRow(msg, cached.id, id);
      const replay = aliasReplays.get(id) ?? { source: cached.id, runs: [] };
      replay.runs.push(cached.events.length);
      aliasReplays.set(id, replay);
      // Rehydrate EVERY failure under the alias identity for the baseline and
      // all differential arms, including all original console rows.
      for (const event of cached.events) {
        const msg = renameAliasEvent(event, cached.id, id);
        if (event.kind === 'fail') fail(msg);
        else console.log(msg);
      }
      tuckedLofts += cached.tucked;
      rule5Tucked += cached.rule5Tucked;
      rule5Untucked += cached.rule5Untucked;
      midjawCrossings.push(...cached.crossings.map((c) => ({ ...c, id, row: rename(c.row) })));
      jawWeldCrossings.push(...cached.jawCrossings.map((c) => ({ ...c, id, row: rename(c.row) })));
      jawWeldPlans.push(...cached.jawPlans.map((p) => ({ ...p, id })));
      // L-CCP census (main): the alias shares the TABLE_SPECS object, so the statement produced
      // its prof once; the class is replayed under the alias id, never recomputed.
      if (PROFILE_SOURCES && sources[cached.id]) sources[id] = sources[cached.id];
      // #728 census (rebase adaptation): the alias shares the geometry, so its DEGENERATE
      // lines and loftCensus entries replay under the alias id, exactly like its failures
      // above — the cross-gate arm compares per-id census lines, so an alias with no line
      // could never agree. Printed directly (not via entryEvents): renameAliasEvent's
      // grammar covers `id: `/`id ` rows, not the DEGENERATE shape.
      for (const entry of cached.census) {
        loftCensus.push({ ...entry, id });
        console.log(`DEGENERATE ${id} rail${entry.rail} repeated=${entry.repeated} zero-area=${entry.zeroArea} cap-plane=${entry.capPlane}`);
      }
      continue;
    }
    const countsBefore = { tuckedLofts, rule5Tucked, rule5Untucked };
    const censusBefore = loftCensus.length;
    const crossingsBefore = midjawCrossings.length;
    const jawCrossingsBefore = jawWeldCrossings.length, jawPlansBefore = jawWeldPlans.length;
    entryEvents = [];
    const failuresBeforeEntry = current.length;
    const G = makeGeom(id);
    if (perturbMode === 'drop-profile-argument' && id === DROP_ID) G.render = { ...G.render, cushionFamily: undefined }; // L-CCP red plant: the statement below receives no family
    const zNose = G.kernel.noseHeightFrac * G.render.profileBallD;
    if (!CUSHION_FAMILIES[G.render.cushionFamily]) {
      fail(`${id}: unknown cushionFamily ${G.render.cushionFamily}`);
      // L-CCP red plant (main, --perturb=drop-profile-argument): the dropped family must reach
      // the statement below so the census digests the fallback it produced; every other run
      // keeps the ring fence's hard failure and never evaluates a generic fallback profile.
      if (!(perturbMode === 'drop-profile-argument' && id === DROP_ID)) {
        entryEvents = null;
        continue;
      }
    }
    // R3-SNK-11 B2: the snooker body runs to the capping — landing rule L-CCP keeps this lane's depth term as the third ARGUMENT (the family's deepest row
    // 28.0 sits inside both clamps, so the loft bytes are identical and the census's depth= column is the witness); the census requires site 1 and site 2
    // to carry TEXTUALLY IDENTICAL argument lists, so the ternary is written out here exactly as at site 2
    // The OX scene replaces its nominal K-55 loft with the MODEL section
    // and fixed-facing plan. Judge that emitted construction; applying the
    // generic all-front inset to its 2.962 mm jaw invents crossing rings.
    const specific = roxCushionFor(G);
    const prof = specific?.profile ?? cushionProfile(G.render.cushionFamily, zNose, G.render.style === 'snooker' ? SNK_CUSHION.bodyDepth : G.CW, G.render.cushionProfile); // L-CCP + D621: the fourth argument is the entry-profile form (render.cushionProfile), undefined for every family table
    if (PROFILE_SOURCES) sources[id] = classifyProfile(id, G, prof, G.render.style === 'snooker' ? SNK_CUSHION.bodyDepth : G.CW); // L-CCP census: digest identity of the prof the statement above produced; the third argument !== G.CW → the snooker-depth class
    // 1. profile sanity
    for (const r of prof.rows) {
      if (!Number.isFinite(r.o) || !Number.isFinite(r.z)) {
        fail(`${id}: non-finite profile row ${JSON.stringify(r)}`);
      }
    }
    for (let k = 1; k < prof.rows.length; k++) {
      if (!(prof.rows[k].z >= prof.rows[k - 1].z - 1e-12)) {
        fail(`${id}: profile rows not ascending at ${k}`);
      }
    }
    const apex = prof.rows.find((r) => r.o === 0);
    if (!apex || apex.z !== zNose) {
      fail(`${id}: apex row not exactly (0, ${zNose}): ${JSON.stringify(apex)}`);
    }
    const oMax = Math.max(...prof.rows.map((r) => r.o));
    if (!(oMax <= G.CW - 0.0029)) {
      fail(`${id}: profile base ${oMax} not inside plan depth CW=${G.CW}`);
    }
    // 1b. anti-cantilever gate (owner critique 2026-07-12): below the nose
    // the silhouette must recede monotonically toward the apex — o
    // non-increasing as z rises from the bed to the nose. The first-attempt
    // profile hung the rubber underside from a glue-face edge ~44 mm back,
    // a cantilevered overhang no real cushion has (traced references:
    // /tmp/ob-cushion-rework provenance, mirrored in the audit doc).
    {
      let prevO = Infinity;
      for (const r of prof.rows) {
        if (r.z > zNose + 1e-12) break;
        if (r.o > prevO + 1e-9) {
          fail(`${id}: below-nose overhang at z=${(r.z * 1000).toFixed(2)}mm `
            + `(o ${(r.o * 1000).toFixed(2)} > ${(prevO * 1000).toFixed(2)})`);
        }
        prevO = r.o;
      }
    }
    say(`${id}: zNose=${(zNose * 1000).toFixed(2)}mm `
      + `zTop=${(prof.zTop * 1000).toFixed(2)}mm `
      + `oBase=${(oMax * 1000).toFixed(2)}mm `
      + `oTop=${(prof.oTop * 1000).toFixed(2)}mm rows=${prof.rows.length}`);
    const exportedPolys = railPolysFor(G);
    const midjawInputs = perturbMode === 'midjaw-overrun' && G.render.style === 'cn8'
      ? readMidjawInputs(G, exportedPolys, midjawLaw) : null;
    const polys = perturbMode === 'midjaw-overrun' ? midjawOverrun(G, exportedPolys, midjawLaw) : exportedPolys;
    // Perturb the shared offset law only. Build the polygon with the ORIGINAL
    // G: clearing the plan's opt-in would erase its fillet samples instead.
    const ctxG = perturbMode === 'pairwise-jaw-weld'
      ? { ...G, render: { ...G.render, jawArcSegments: 0 } } : G;
    const ctxs = polys.map((p) => specific ? specific.plan(p) : cushionPlanCtx(ctxG, p));
    const offsets = SWEEP === null ? [] : [...denseOffsets(oMax, SWEEP)];
    polys.forEach((poly, pi) => {
      const ctx = ctxs[pi];
      if (perturbMode === 'pairwise-jaw-weld') jawWeldPlans.push({ id, rail: pi, G, prof, poly, ctx });
      // 3a. the o = 0 ring is the plan polygon bit-exactly (doubles)
      const r0 = ctx.ringAt(0);
      poly.forEach(([px, py], vi) => {
        if (r0[vi][0] !== px || r0[vi][1] !== py) {
          fail(`${id} rail${pi}: ringAt(0)[${vi}] != plan vertex `
            + `(${r0[vi]}) vs (${px}, ${py})`);
        }
      });
      // GH-488D CU-10: an entry that declares a sub-rail bevel builds its rear
      // closure as the glue PLANE, so the fixed (slate-edge) back face recedes
      // with height — cushionGeom's backAt, mirrored here so this gate keeps
      // measuring the ring the mesh actually has. Entries without the flag get
      // backT = 0 and every check below stays byte-identical.
      const backT = Math.tan(((G.render.subRailBevelDeg || 0) * Math.PI) / 180);
      const backAt = (z) => (backT ? Math.max(0, (prof.zTop - z) * backT) : 0);
      // 3b. mesh vertices carry the nose ring within f32 quantization
      const geo = specific ? specific.geometry(poly) : cushionGeom(G, poly, prof);
      const pos = geo.attributes.position.array;
      const tuck = prof.jointTuck || 0;
      const zCap = prof.zTop - tuck; // the family's cap height (GH-666)
      if (tuck > 0) tuckedLofts++;
      if (perturbMode === 'flip-tucked-cap' && tuck > 0) {
        // the arm: reverse every triangle lying at the tucked cap height
        const ia = geo.index.array; const F32Z = 1e-6;
        for (let t = 0; t < ia.length; t += 3) {
          const at = (v) => Math.abs(pos[ia[v] * 3 + 1] - zCap) <= F32Z;
          if (at(t) && at(t + 1) && at(t + 2)) { const b = ia[t + 1]; ia[t + 1] = ia[t + 2]; ia[t + 2] = b; }
        }
      }
      // the degenerate perturbations (issue #728), applied where the flip arm applies
      let placed = true;
      if (perturbMode === 'plant-degenerate') placed = plantDegenerate(geo, zCap);
      if (perturbMode === 'plant-collinear') placed = plantCollinear(geo, zCap);
      if (perturbMode === 'plant-weldonly') placed = plantWeldOnly(geo, zCap);
      if (perturbMode === 'inflate-degenerate') placed = inflateDegenerate(geo, zCap);
      const posNow = geo.attributes.position.array; // the perturbations may replace the position attribute
      const deg = degenerateCensus(geo, zCap);
      loftCensus.push({ id, rail: pi, placed, ...deg });
      console.log(`DEGENERATE ${id} rail${pi} repeated=${deg.repeated} zero-area=${deg.zeroArea} cap-plane=${deg.capPlane}`);
      for (let i = 0; i < posNow.length; i++) {
        if (!Number.isFinite(posNow[i])) { fail(`${id} rail${pi}: NaN position`); break; }
      }
      const F32 = 5e-7; // fround quantization at |coord| ≤ 2.6 m
      const found = new Array(poly.length).fill(false);
      for (let i = 0; i < posNow.length; i += 3) {
        if (Math.abs(posNow[i + 1] - zNose) > F32) continue;
        const kx = posNow[i + 2] + G.W / 2, ky = posNow[i] + G.L / 2;
        poly.forEach(([px, py], vi) => {
          if (Math.abs(kx - px) <= 1e-6 && Math.abs(ky - py) <= 1e-6) found[vi] = true;
        });
      }
      found.forEach((f, vi) => {
        // A front/FIXED junction vertex is a back-face corner, not a kernel
        // cushion-segment endpoint (checkRailKernelAlignment gates those), so a
        // beveled entry legitimately carries it inboard at the nose height. The
        // exemption is keyed on the flag: unflagged entries stay fully covered.
        if (!f && backT
          && ctx.front[vi] !== ctx.front[(vi - 1 + ctx.M) % ctx.M]) return;
        if (!f) fail(`${id} rail${pi}: plan vertex ${vi} missing from the nose ring`);
      });
      // 2. ring simplicity at every profile height
      for (const row of prof.rows) {
        const ring = ctx.ringAt(row.o, row.o, backAt(row.z));
        const crossing = ringCrossings(ring).next().value;
        if (crossing) {
          const msg = `${id} rail${pi}: ring self-intersection at z=${row.z.toFixed(4)} `
            + `(o=${(row.o * 1000).toFixed(1)}mm) edges ${crossing.edges.join('/')}`;
          fail(msg);
          if (perturbMode === 'pairwise-jaw-weld') jawWeldCrossings.push({
            row: msg, id, rail: pi, z: row.z, o: row.o, ...crossing,
          });
          if (perturbMode === 'midjaw-overrun') midjawCrossings.push({
            row: msg, id, rail: pi, ...crossing, CW: G.CW, W: G.W, L: G.L,
            middle: G.middle, midjawInputs,
          });
        }
      }
      for (const o of offsets) {
        const crossing = ringCrossings(ctx.ringAt(o, o)).next().value;
        if (crossing) fail(`[dense] ${id} rail${pi}: ring self-intersection at o=${denseOffsetLabel(o, SWEEP_MM, oMax)}mm edges ${crossing.edges.join('/')}`);
      }
      // 5. cap orientation (issue #308): every top-cap triangle faces UP.
      // The cloth material is single-sided, so a down-facing cap is a
      // back-face-culled see-through hole — the wpa-lag defect exposed the
      // frozen cue ball's bottom through exactly such a hole in the head
      // rail. Earcut emits shape-space-CCW triangles regardless of the
      // contour winding; cushionGeom must push them unflipped.
      // The cap is the flat top-fill at the family's cap height zCap =
      // prof.zTop − jointTuck (GH-666): for a tucked family the deck bands
      // sit at zTop and the cap 0.4 mm under them; selecting at zTop read
      // the deck instead of the cap (review round 1 on #672).
      // Zero-area cap triangles carry no surface and are skipped (issue #728: the ONE
      // definition in lib/loft-degenerate.mjs, shared with check-loft-manifold).
      {
        const idxArr = geo.index.array;
        const F32Z = CAP_PLANE_F32Z; // the shared cap-plane half-thickness (was the 1e-6 literal)
        let up = 0, down = 0, skipped = 0;
        for (let t = 0; t < idxArr.length; t += 3) {
          const [a, b, c] = [idxArr[t], idxArr[t + 1], idxArr[t + 2]];
          if (Math.abs(posNow[a * 3 + 1] - zCap) > F32Z
            || Math.abs(posNow[b * 3 + 1] - zCap) > F32Z
            || Math.abs(posNow[c * 3 + 1] - zCap) > F32Z) continue;
          if (isDegenerateTri(posNow, a, b, c)) { skipped++; continue; }
          // n_y of the tri (A,B,C) with vertices in the XZ plane:
          // ((B−A) × (C−A))_y = (B−A)_z (C−A)_x − (B−A)_x (C−A)_z
          const ny = (posNow[b * 3 + 2] - posNow[a * 3 + 2]) * (posNow[c * 3] - posNow[a * 3])
            - (posNow[b * 3] - posNow[a * 3]) * (posNow[c * 3 + 2] - posNow[a * 3 + 2]);
          if (ny > 0) up++; else down++;
        }
        if (down > 0 || up === 0) {
          if (tuck > 0) rule5Tucked++; else rule5Untucked++;
          fail(`${id} rail${pi}: top cap (at ${(zCap * 1000).toFixed(2)} mm`
            + `${tuck > 0 ? ', tucked' : ''}) has ${down} down-facing / ${up} `
            + 'up-facing triangles (want all up — a down-facing cap is a '
            + 'back-face-culled hole, issue #308)'
            + (skipped > 0 ? `; ${skipped} zero-area skipped` : ''));
        }
      }
    });
    // 4. carom mating seams
    if (G.kernel.pocketless) {
      for (const row of prof.rows) {
        const rings = ctxs.map((c) => c.ringAt(row.o));
        let matched = 0;
        for (let a = 0; a < rings.length; a++) {
          for (let b = a + 1; b < rings.length; b++) {
            for (const va of rings[a]) {
              for (const vb of rings[b]) {
                if (Math.abs(va[0] - vb[0]) < 1e-9 && Math.abs(va[1] - vb[1]) < 1e-9) matched++;
              }
            }
          }
        }
        if (matched < 4) {
          fail(`${id}: carom miter junctions not shared at z=${row.z.toFixed(4)} `
            + `(matched ${matched} < 4)`);
        }
      }
    }
    if (SWEEP !== null) {
      const denseRows = current.slice(failuresBeforeEntry).filter((m) => m.startsWith('[dense] '));
      say(`[dense] ${id}: ${offsets.length} offsets per rail, back inset 0, ${denseRows.length} failure(s)`);
    }
    checkedSpecs.set(spec, { id, events: entryEvents,
      tucked: tuckedLofts - countsBefore.tuckedLofts,
      rule5Tucked: rule5Tucked - countsBefore.rule5Tucked,
      rule5Untucked: rule5Untucked - countsBefore.rule5Untucked,
      crossings: midjawCrossings.slice(crossingsBefore),
      jawCrossings: jawWeldCrossings.slice(jawCrossingsBefore),
      jawPlans: jawWeldPlans.slice(jawPlansBefore),
      census: loftCensus.slice(censusBefore),
    });
    entryEvents = null;
  }

  // 6. occlusion regression at the exact owner-caught scene (issue #308):
  // the wpa-lag strike camera vs that catalog entry's own staging — the cue
  // ball frozen on the head-cushion nose. Sight rays to the ball's sub-nose
  // surface and to the bed contact-shadow strip behind the nose must strike
  // a cushion loft FRONT face before the ball sphere / the bed target. The
  // raycast runs with the meshes' real single-sided semantics
  // (MeshBasicMaterial FrontSide), so a back-face-culled cap reads as the
  // hole it renders as. Frames: the record/camera are kernel CENTER-origin
  // (x across, y along, z up); meshes live in the THREE frame
  // (x, y, z) = (kernel.y, kernel.z, kernel.x), the cushionGeom mapping.
  {
    const failuresBefore = current.length;
    const sc = DATA['wpa-lag'];
    const tableId = sc.equipment.find(([axis]) => axis === 'table_id')[1];
    // FAIL CLOSED (ORDER-CN8-731-FIX1): the scenario's table id must be a catalog key — makeGeom's
    // specFor would otherwise build the scripted pin under this scenario's name
    if (!TABLE_SPECS[tableId]) { console.error(`[cushion-profile] REFUSED — scenario wpa-lag names table '${tableId}', not in the catalog`); process.exit(2); }
    const G = makeGeom(tableId);
    const zNose = G.kernel.noseHeightFrac * G.render.profileBallD;
    const prof = cushionProfile(G.render.cushionFamily, zNose, G.render.style === 'snooker' ? SNK_CUSHION.bodyDepth : G.CW, G.render.cushionProfile); // R3-SNK-11 B2 + D621 fourth argument — TEXTUALLY IDENTICAL to site 1 (the census requires it)
    const mat = new THREE.MeshBasicMaterial(); // FrontSide: real culling
    const lofts = railPolysFor(G).map((poly) => {
      const m = new THREE.Mesh(cushionGeom(G, poly, prof), mat);
      m.updateMatrixWorld();
      return m;
    });
    const cam = sc.cameras.strike;
    const camPos = new THREE.Vector3(cam.cam[1], cam.cam[2], cam.cam[0]);
    const ball = sc.segments[0].battery.system.balls
      .find((b) => b.state.pos.y < 0);
    const rBall = ball.params.r;
    const bc = new THREE.Vector3(ball.state.pos.y, ball.state.pos.z,
      ball.state.pos.x);
    // staging sanity: the gate is only meaningful while the catalog freezes
    // this ball tangent to the head nose plane (three.x = −L/2). A restage
    // that moves it must update this gate consciously, not skate past it.
    if (Math.abs(bc.x - rBall - (-G.L / 2)) > 1e-9 || bc.y !== rBall) {
      fail(`wpa-lag occlusion gate: staging no longer freezes the cue ball `
        + `on the head nose (center ${bc.toArray()}, r ${rBall}) — restage `
        + 'the gate targets alongside the catalog');
    }
    const ray = new THREE.Raycaster();
    const sphere = new THREE.Sphere(bc, rBall);
    const hitP = new THREE.Vector3();
    const cast = (target, what, dMust) => {
      ray.set(camPos, target.clone().sub(camPos).normalize());
      ray.far = Infinity;
      const hits = ray.intersectObjects(lofts, false);
      const d = hits.length ? hits[0].distance : Infinity;
      if (!(d < dMust)) {
        fail(`wpa-lag occlusion: ray to ${what} reaches its target `
          + `(first front-facing loft hit at ${d === Infinity ? 'none'
            : d.toFixed(4) + ' m'}, target at ${dMust.toFixed(4)} m) — the `
          + 'rail is see-through from the strike camera (issue #308)');
      }
    };
    // (a) sub-nose ball surface, camera-facing points at heights 1–32 mm
    // (the nose sits at 36.29 mm; the ball above it is legitimately visible)
    for (const hmm of [1, 2, 4, 8, 12, 16, 20, 24, 28.575, 32]) {
      const y = hmm / 1000;
      const rho = Math.sqrt(rBall * rBall - (y - rBall) ** 2);
      const toCam = new THREE.Vector3(camPos.x - bc.x, 0, camPos.z - bc.z)
        .normalize();
      const target = new THREE.Vector3(bc.x, y, bc.z)
        .addScaledVector(toCam, rho * 0.995);
      ray.set(camPos, target.clone().sub(camPos).normalize());
      const dBall = ray.ray.intersectSphere(sphere, hitP)
        ? camPos.distanceTo(hitP) : Infinity;
      cast(target, `ball surface h=${hmm}mm`, dBall);
    }
    // (b) the bed contact-shadow strip just behind the nose
    for (const [kx, dy] of [[0, 0.006], [0.02, 0.010], [-0.02, 0.015],
      [0, 0.022]]) {
      const target = new THREE.Vector3(-G.L / 2 + dy, 0.0005, kx);
      cast(target, `bed shadow at kernel.x=${kx}, ${(dy * 1000).toFixed(0)}mm `
        + 'behind the nose', camPos.distanceTo(target));
    }
    if (current.length === failuresBefore) {
      console.log('wpa-lag occlusion gate: strike-camera rays to the frozen '
        + 'ball\'s sub-nose surface + bed shadow strip are loft-occluded — OK');
    }
  }

  // ---- bake-mirror bed margin gate (GH-395) ----------------------------------
  // The offline GI bake (tools/render/lib/scene.mjs buildBakeScene) traces a
  // bed sheet at L/2 + CW + bedMargin per TABLES class. The live builder's
  // margin is class-dependent (table.js populate(): template family 0.11 —
  // sealing the deep corner falls — pool entries and populateCarom 0.10); a
  // flat mirror margin baked the snooker lightmaps against a bed missing a
  // 10 mm cloth strip around the outer edge and pocket throats (review on the
  // GH-381 lane). Assert the mirror margin EQUALS the runtime margin of each
  // class's representative entry, using table.js's own resolution expression.
  {
    const failuresBefore = current.length;
    const { TABLES } = await import(repoUrl('tools/render/lib/scene.mjs'));
    const REP = {
      pool: 'wpa_generic_9ft',
      snooker_12ft: 'wpbsa_snooker_12ft',
      carom_284: 'umb_carom_284',
    };
    for (const [cls, id] of Object.entries(REP)) {
      const tb = TABLES[cls];
      if (!tb || typeof tb.bedMargin !== 'number') {
        fail(`bake mirror TABLES.${cls} carries no bedMargin (GH-395)`);
        continue;
      }
      const G = makeGeom(id);
      // table.js populate() margin resolution (pool/template); populateCarom
      // hardcodes 0.10, which this expression reproduces (no side pockets).
      // GH-518: the template base is min(0.11, fw − 0.004) — the Star-band
      // snooker frame is narrower than the legacy 0.11 margin (chinese8
      // still resolves to 0.11 exactly).
      const live = Math.max(
        G.template ? Math.min(0.11, G.render.frameWidth - 0.004) : 0.10,
        (G.kernel.sidePocketDepth ?? 0) + (G.kernel.sidePocketRadius ?? 0)
          + 0.004 - G.CW + 0.01);
      if (tb.bedMargin !== live) {
        fail(`bake mirror TABLES.${cls}.bedMargin ${tb.bedMargin} != the `
          + `runtime bed margin ${live} of ${id} (GH-395)`);
      }
    }
    if (current.length === failuresBefore) {
      console.log('bake-mirror bed margins match the runtime per class '
        + '(GH-395) — OK');
    }
  }
  if (!PERTURB || perturbMode) {
    for (const [id, { source, runs }] of aliasReplays) {
      const rows = runs.reduce((sum, count) => sum + count);
      console.log(`${id} is an alias of ${source} — ${rows} rows not repeated`);
    }
  }
  return current;
}

const base = await runAll(PERTURB === 'drop-profile-argument' ? 'drop-profile-argument' : null);
if (PROFILE_SOURCES) {
  const ids = Object.keys(sources).sort();
  for (const id of ids) { const r = sources[id]; console.log(`PROFILE-SOURCE ${id} ${r.cls} digest=${r.digest} ${Object.entries(r.candidates).map(([k, v]) => `${k}=${v}`).join(' ')} depth=${r.depth} cw=${r.cw} fam=${r.family}`); }
  // the two L-CCP sites: their cushionProfile(...) argument lists must be textually identical (comments / whitespace stripped)
  const self = await (await import('node:fs/promises')).readFile(new URL(import.meta.url), 'utf8');
  const sites = [...self.matchAll(/^[ \t]*const prof = (?:specific\?\.profile \?\? )?cushionProfile\(([^;]*)\);[ \t]*(?:\/\/.*)?$/gm)].map((m) => m[1].replace(/\/\/.*$/gm, '').replace(/\s+/g, ''));
  const problems = [];
  if (sites.length !== 2) problems.push(`expected exactly 2 L-CCP statements in this file, found ${sites.length}`);
  else { console.log(`PROFILE-SITES site1=(${sites[0]}) site2=(${sites[1]}) ${sites[0] === sites[1] ? 'IDENTICAL' : 'DIFF'}`); if (sites[0] !== sites[1]) problems.push(`the two statements' argument lists differ: (${sites[0]}) vs (${sites[1]})`); }
  if (SOURCES_ARG) {
    const pinned = JSON.parse(await (await import('node:fs/promises')).readFile(SOURCES_ARG, 'utf8'));
    const keys = [...new Set([...ids, ...Object.keys(pinned).filter((k) => !k.startsWith('_'))])].sort();
    for (const id of keys) { const p = pinned[id], r = sources[id]; if (!r) problems.push(`${id}: pinned ${p}, not in the catalog`); else if (p !== r.cls) problems.push(`${id}: pinned ${p ?? '(absent)'}, resolved ${r.cls} (digest ${r.digest}${r.cls === 'unclassified' ? ' matches no candidate: ' + Object.entries(r.candidates).map(([k, v]) => `${k}=${v}`).join(' ') : ''})`); }
    if (!problems.length) { console.log(`[cushion-profile] PROFILE-SOURCES HELD — ${ids.length} catalog tables classify as pinned by digest identity (${SOURCES_ARG}); the two L-CCP statements' argument lists are identical${PERTURB ? ` [perturbed ${PERTURB}]` : ''}`); process.exit(0); }
    console.error(`[cushion-profile] PROFILE-SOURCES DIFF — ${problems.length} problem(s) against ${SOURCES_ARG}${PERTURB ? ` [perturbed ${PERTURB}]` : ''}: ${problems.slice(0, 5).join(' | ')}`);
    process.exit(1);
  }
  if (problems.length) { console.error(`[cushion-profile] PROFILE-SOURCES DIFF — ${problems.join(' | ')}`); process.exit(1); }
  console.log(`[cushion-profile] PROFILE-SOURCES — ${ids.length} catalog tables classified (no expectation given; pass --profile-sources <file> to pin)`);
  process.exit(0);
}
if (PERTURB === 'pairwise-jaw-weld') {
  const pert = await runAll('pairwise-jaw-weld');
  // Preserve full-precision first-run evidence. The assessment derives w
  // again from live plans; it never accepts this diagnostic or fixture w.
  const target = jawWeldPlans.find((p) => p.id === JAW_WELD_TABLE);
  if (target) {
    const { createHash } = await import('node:crypto');
    const { G, prof } = target;
    console.log(`[jaw-weld inputs] ${JSON.stringify({ table: G.id,
      cushionFamily: G.render.cushionFamily, jawArcSegments: G.render.jawArcSegments,
      jawArcSampled: G.render.jawArcSampled ?? null,
      cornerJawRadius: G.kernel.cornerJawRadius, sideJawRadius: G.kernel.sideJawRadius,
      rows: prof.rows, plans: jawWeldPlans.filter((p) => p.id === JAW_WELD_TABLE)
        .map(({ rail, poly }) => ({ rail, M: poly.length,
          sha256: createHash('sha256').update(JSON.stringify(poly)).digest('hex') })) })}`);
  }
  for (const c of jawWeldCrossings.filter((c) => !base.includes(c.row))) {
    console.log(`[jaw-weld crossing] ${JSON.stringify({ ...c, anchor: liveJawAnchor(c, jawWeldPlans) })}`);
  }
  const fixtureUrl = repoUrl('tools/render/fixtures/cushion-profile-jawweld-arm-671.json');
  let fixture;
  try { fixture = JSON.parse(await (await import('node:fs/promises')).readFile(new URL(fixtureUrl), 'utf8')); }
  catch (e) { console.error(`[perturb pairwise-jaw-weld] FAIL — arm recording unavailable: ${e.message}`); process.exit(1); }
  const { problems, added } = assessJawWeldArm({ base, pert, baseline: await loadBaseline(),
    fixture, crossings: jawWeldCrossings, plans: jawWeldPlans });
  if (problems.length) {
    console.error(`[perturb pairwise-jaw-weld] FAIL — ${problems.join('; ')}`);
    process.exit(1);
  }
  console.log(`[perturb pairwise-jaw-weld] ARMED — differential: unperturbed set == committed baseline (${base.length} rows); `
    + `perturbed set == unperturbed + exactly ${added.length} recorded ring rows; `
    + 'every first crossing matches its recording and live erosion vertex w within 1e-9 m; no other table changed');
  process.exit(0);
}
if (PERTURB === 'midjaw-overrun') {
  const pert = await runAll('midjaw-overrun');
  // Full-precision, first crossing per body; all profile-row intersections
  // participate in assessMidjawArm below, not just these compact log lines.
  const seen = new Set();
  for (const c of midjawCrossings.filter((c) => !base.includes(c.row))) {
    const key = `${c.id} rail${c.rail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { id, rail, edges, point } = c;
    console.log(`[midjaw crossing] ${JSON.stringify({ id, rail, edges, point, uAbsMm: Math.abs(point[1] - c.L / 2) * MM })}`);
  }
  const fixtureUrl = repoUrl('tools/render/fixtures/cushion-profile-midjaw-arm-666.json');
  let fixture;
  try { fixture = JSON.parse(await (await import('node:fs/promises')).readFile(new URL(fixtureUrl), 'utf8')); }
  catch (e) { console.error(`[perturb midjaw-overrun] FAIL — arm recording unavailable: ${e.message}`); process.exit(1); }
  const { problems, added, lawChecks } = assessMidjawArm({ base, pert,
    baseline: await loadBaseline(), fixture, crossings: midjawCrossings, law: midjawLaw });
  for (const { id, rail, uLaw, uMeasured, delta, bound, orderDeltaMm } of lawChecks) {
    console.log(`[midjaw law] ${JSON.stringify({ id, rail, unit: 'mm',
      uLaw: uLaw * MM, uMeasured: uMeasured * MM, delta: delta * MM, bound: bound * MM,
      orderDeltaMm, orderWindowMm: fixture.order_window.halfWidthMm })}`);
  }
  if (problems.length) {
    console.error(`[perturb midjaw-overrun] FAIL — ${problems.join('; ')}`);
    process.exit(1);
  }
  console.log(`[perturb midjaw-overrun] ARMED — differential: unperturbed set == committed baseline (${base.length} rows); `
    + `perturbed set == unperturbed + exactly ${added.length} recorded ring rows; ${seen.size} bodies on the kernel back line; no other table changed`);
  process.exit(0);
}
const isTuckedCapRow = (m) => /: top cap \(at [0-9.]+ mm, tucked\) has /.test(m);
if (PERTURB === 'flip-tucked-cap') {
  // DIFFERENTIAL arm: (perturbed set) must equal (unperturbed set) + exactly the tucked-cap rule-5 rows,
  // one per tucked loft, and the unperturbed set must equal the committed baseline by row identity.
  const baseTucked = tuckedLofts;
  const pert = await runAll('flip-tucked-cap');
  const d = setDiff(pert, base);
  const bl = await loadBaseline(); const bd = setDiff(base, bl.rows);
  const problems = [];
  if (bd.added.length) problems.push(`unperturbed set has ${bd.added.length} row(s) not in the committed baseline: ${bd.added.slice(0, 3).join(' | ')}`);
  if (bd.gone.length) problems.push(`${bd.gone.length} baseline row(s) missing from the unperturbed set: ${bd.gone.slice(0, 3).join(' | ')}`);
  if (d.gone.length) problems.push(`${d.gone.length} unperturbed row(s) vanished under the perturbation: ${d.gone.slice(0, 3).join(' | ')}`);
  const notTuck = d.added.filter((m) => !isTuckedCapRow(m));
  if (notTuck.length) problems.push(`${notTuck.length} added row(s) are not tucked-cap rule-5 rows: ${notTuck.slice(0, 3).join(' | ')}`);
  const tuckRows = d.added.filter(isTuckedCapRow);
  if (tuckRows.length !== baseTucked || baseTucked === 0) problems.push(`rule 5 fired on ${tuckRows.length} of ${baseTucked} tucked lofts`);
  if (!problems.length) {
    console.log(`[perturb flip-tucked-cap] ARMED — differential: unperturbed set == committed baseline (${base.length} rows); `
      + `perturbed set == unperturbed + exactly ${tuckRows.length} tucked-cap rule-5 rows (${baseTucked} tucked lofts)`);
    process.exit(0);
  }
  console.error(`[perturb flip-tucked-cap] FAIL — ${problems.join('; ')}`);
  process.exit(1);
}
const isSingleDownRow = (m) => /: top cap \(at [0-9.]+ mm(, tucked)?\) has 1 down-facing /.test(m);
if (PERTURB === 'plant-degenerate' || PERTURB === 'plant-collinear' || PERTURB === 'plant-weldonly') {
  // DIFFERENTIAL plant arms (issue #728): the planted zero-area triangle must be skipped by rule 5,
  // so the perturbed failure set equals the unperturbed set (which itself must equal the committed
  // baseline by row identity), while exactly the plant's definition class rises by 1 on every loft
  // (index reuse and weld-only feed cap-repeated, collinear feeds cap-zero-area) and the cap-plane
  // count rises by 1 (the plant lands on the plane). True dynamic counts: N-of-N, N == 0 refused.
  const want = { 'plant-degenerate': [1, 0, 'degenerate'], 'plant-collinear': [0, 1, 'zero-area'], 'plant-weldonly': [1, 0, 'repeated'] }[PERTURB];
  const cleanCensus = loftCensus;
  const pert = await runAll(PERTURB);
  const pertCensus = loftCensus;
  const d = setDiff(pert, base);
  const bl = await loadBaseline(); const bd = setDiff(base, bl.rows);
  const problems = [];
  if (!cleanCensus.length) problems.push('no lofts iterated (N is 0) — refusing a vacuous pass');
  if (bd.added.length) problems.push(`unperturbed set has ${bd.added.length} row(s) not in the committed baseline: ${bd.added.slice(0, 3).join(' | ')}`);
  if (bd.gone.length) problems.push(`${bd.gone.length} baseline row(s) missing from the unperturbed set: ${bd.gone.slice(0, 3).join(' | ')}`);
  if (d.added.length) problems.push(`${d.added.length} row(s) added under the plant: ${d.added.slice(0, 3).join(' | ')}`);
  if (d.gone.length) problems.push(`${d.gone.length} unperturbed row(s) vanished under the plant: ${d.gone.slice(0, 3).join(' | ')}`);
  const unplaced = pertCensus.filter((r) => !r.placed);
  if (unplaced.length) problems.push(`no ${PERTURB} site on ${unplaced.length} loft(s): ${unplaced.slice(0, 3).map((r) => `${r.id} rail${r.rail}`).join(' | ')}`);
  const bad = pertCensus.filter((r, i) => r.placed && (r.capRepeated !== cleanCensus[i].capRepeated + want[0] || r.capZeroArea !== cleanCensus[i].capZeroArea + want[1] || r.capPlane !== cleanCensus[i].capPlane + 1));
  if (bad.length) problems.push(`cap-plane ${want[2]} +1 (cap-plane +1) on ${pertCensus.length - bad.length} of ${pertCensus.length} lofts: ${bad.slice(0, 3).map((r) => `${r.id} rail${r.rail}`).join(' | ')}`);
  if (!problems.length) {
    console.log(`[perturb ${PERTURB}] ARMED — perturbed failure set == unperturbed (${base.length} rows == committed baseline); `
      + `cap-plane ${want[2]} +1 on ${cleanCensus.length} of ${cleanCensus.length} lofts`);
    process.exit(0);
  }
  console.error(`[perturb ${PERTURB}] FAIL — ${problems.join('; ')}`);
  process.exit(1);
}
if (PERTURB === 'inflate-degenerate') {
  // DIFFERENTIAL arm (issue #728): the finite down-facing triangle must add exactly one rule-5
  // row per loft ('has 1 down-facing') to the unperturbed set (which itself must equal the
  // committed baseline), with no row removed and the degenerate census unchanged. N-of-N over
  // the iterated lofts; N == 0 is a named refusal.
  const cleanCensus = loftCensus;
  const pert = await runAll('inflate-degenerate');
  const pertCensus = loftCensus;
  const d = setDiff(pert, base);
  const bl = await loadBaseline(); const bd = setDiff(base, bl.rows);
  const problems = [];
  if (!cleanCensus.length) problems.push('no lofts iterated (N is 0) — refusing a vacuous pass');
  if (bd.added.length) problems.push(`unperturbed set has ${bd.added.length} row(s) not in the committed baseline: ${bd.added.slice(0, 3).join(' | ')}`);
  if (bd.gone.length) problems.push(`${bd.gone.length} baseline row(s) missing from the unperturbed set: ${bd.gone.slice(0, 3).join(' | ')}`);
  if (d.gone.length) problems.push(`${d.gone.length} unperturbed row(s) vanished under the inflate: ${d.gone.slice(0, 3).join(' | ')}`);
  const notSingle = d.added.filter((m) => !isSingleDownRow(m));
  if (notSingle.length) problems.push(`${notSingle.length} added row(s) are not 'has 1 down-facing' rule-5 rows: ${notSingle.slice(0, 3).join(' | ')}`);
  const singleRows = d.added.filter(isSingleDownRow);
  if (singleRows.length !== cleanCensus.length) problems.push(`rule 5 added ${singleRows.length} 'has 1 down-facing' row(s) on ${cleanCensus.length} lofts`);
  const bad = pertCensus.filter((r, i) => r.placed && ((r.repeated + r.zeroArea) !== (cleanCensus[i].repeated + cleanCensus[i].zeroArea) || r.capPlane !== cleanCensus[i].capPlane + 1));
  if (bad.length) problems.push(`degenerate census changed or cap-plane +1 missed on ${bad.length} loft(s): ${bad.slice(0, 3).map((r) => `${r.id} rail${r.rail}`).join(' | ')}`);
  if (!problems.length) {
    console.log(`[perturb inflate-degenerate] ARMED — perturbed == unperturbed + exactly ${singleRows.length} rule-5 rows, each 'has 1 down-facing'`);
    process.exit(0);
  }
  console.error(`[perturb inflate-degenerate] FAIL — ${problems.join('; ')}`);
  process.exit(1);
}
if (EXPECT_BASELINE) {
  // the battery's UNPERTURBED row: the failure set must equal the committed baseline by row identity —
  // GH-671 retired the Predator rows; any row appearing or vanishing breaks the baseline.
  const bl = await loadBaseline(); const bd = setDiff(base, bl.rows);
  if (!bd.added.length && !bd.gone.length) {
    console.log(`[cushion-profile] BASELINE HELD — the unperturbed failure set equals the committed baseline by row identity `
      + `(${base.length} rows: ${bl.what})`);
    process.exit(0);
  }
  console.error(`[cushion-profile] BASELINE BROKEN — +${bd.added.length} new row(s)${bd.added.length ? ': ' + bd.added.slice(0, 5).join(' | ') : ''}; `
    + `-${bd.gone.length} row(s) gone${bd.gone.length ? ': ' + bd.gone.slice(0, 5).join(' | ') : ''}`);
  process.exit(1);
}
if (base.length) {
  console.error(`\ncheck-cushion-profile: ${base.length} failure(s)`);
  process.exit(1);
}
console.log('\ncheck-cushion-profile: all entries OK');
