// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-judge.mjs — the lighting matrix's per-cell judgment (GH-975). Pure: measured rows in, verdict lines out —
// shared by web/tools/e2e-lighting-matrix.mjs (live runs and --rejudge of saved rows) and its node selftest
// web/tools/test-lighting-matrix-judge.mjs. Nothing here touches a browser or a port. Every read passes the shared
// validity rule (lib/lighting-guard.mjs) before a tolerance applies, and every tolerance is written fail-closed.
import { within, atMost, isNum, whyInvalid, whyListsDiffer, whyBadCentre, envTailState, MIN_BED_SAMPLES, MIN_CENTRE_SAMPLES,
  MIN_CORNER_SAMPLES, MIN_STRIP_PAIRS } from './lighting-guard.mjs';
import { whyOcclDrain, whyOcclRender } from './lighting-guard.mjs';

/** The reference rig per table: the canopy (the #117 canopy-truth law); on the 12-ft snooker table its approved
 * photo-fit default. */
export const refFixture = (t) => (t === 'wpbsa_snooker_12ft' ? 'auto' : 'canopy_panel');
/** Each table's venue-default rig when it is an explicit fixture id (lightingvisuals.js CLASS_FIXTURES). */
export const VENUE_DEFAULT = Object.freeze({ wpbsa_snooker_12ft: 'snooker_luminaire', umb_carom_284: 'carom_luminaire' });
/** The GI bake web/scene/gi.js must bind for (look, fixture, bake class): true when uGiOn must read 1. A pure mirror of
 * gi.js entryFor and its gates: a look the manifest lacks errors to the fallback; a null class (no committed
 * footprint) is the #52 neutral; a fixture with no committed set (absent, or `unbaked`) is the #89 honesty gate; the
 * pool canopy resolves the top-level looks. The runtime's look id may be the canonical 'tournament' while the manifest
 * still keys 'sp', or the reverse (the de-brand alias). */
export function giBakeExpected(mf, look, fixture, cls) {
  const keyOf = (looks) => (looks?.[look] ? look : look === 'tournament' && looks?.sp ? 'sp'
    : look === 'sp' && looks?.tournament ? 'tournament' : look);
  const has = (looks) => { const e = looks?.[keyOf(looks)]; return !!e && !e.unbaked; };
  if (!mf || !mf.looks?.[keyOf(mf.looks)] || cls == null) return false;
  if (cls !== 'pool') {
    return fixture && fixture !== 'canopy_panel' ? has(mf.tables?.[cls]?.fixtures?.[fixture]?.looks) : has(mf.tables?.[cls]?.looks);
  }
  return !fixture || fixture === 'canopy_panel' ? !!mf.looks[keyOf(mf.looks)] : has(mf.fixtures?.[fixture]?.looks);
}

export const cellKey = (r) => `${r.leg}|${r.table}|${r.fixture}|${r.b}`;

// GH-996 (card 45 C1): the cue-ball clipping census. The owner's card-45 bars (web/tools/fixtures/lighting-census-bars.json)
// bound cams.player.ballClip — the share of cue-ball disc pixels within 0.9 R with a display channel >= 250 — on every
// MEASURED row of both legs. The bars are pixel-derived (measured maximum + one disc pixel), so the row's disc pixel
// count must equal the fixture's for its table: a new pose, viewport or ball radius fails by name until re-derived.
const show = (v) => (typeof v === 'string' ? JSON.stringify(v) : String(v));
/** null when the census bars fixture is usable for `tables` (the matrix's USER_TABLES — a parameter keeps this module
 * free of the browser-side imports), else the named reason: the schema; classes that partition the tables exactly (a
 * missing and an extra table are both named); the same brightness keys in every class; every bar a number in (0, 1];
 * every table's disc pixel count a positive integer. */
export function whyBadBars(bars, tables) {
  if (!bars || typeof bars !== 'object') return `C1 bars ${show(bars)} are not a fixture`;
  if (bars.schema !== 'lighting-census-bars/1') return `C1 bars schema ${show(bars.schema)} is not lighting-census-bars/1`;
  const classes = bars.classes && typeof bars.classes === 'object' ? Object.entries(bars.classes) : [];
  if (!classes.length) return 'C1 bars carry no classes';
  const seen = new Map();
  let keys = null;
  for (const [cls, c] of classes) {
    if (!Array.isArray(c?.tables) || !c.tables.length) return `C1 bars class ${cls} lists no tables`;
    for (const t of c.tables) {
      if (seen.has(t)) return `C1 bars table ${t} is in two classes (${seen.get(t)}, ${cls})`;
      seen.set(t, cls);
    }
    const ks = c.bars && typeof c.bars === 'object' ? Object.keys(c.bars).sort() : [];
    if (!ks.length) return `C1 bars class ${cls} has no bars`;
    if (keys === null) keys = ks;
    else if (ks.join() !== keys.join()) return `C1 bars class ${cls} brightness keys [${ks}] differ from [${keys}]`;
    for (const k of ks) {
      const v = c.bars[k];
      if (!(isNum(v) && v > 0 && v <= 1)) return `C1 bars ${cls} b ${k} = ${show(v)} is not in (0, 1]`;
    }
  }
  const missing = tables.filter((t) => !seen.has(t)), extra = [...seen.keys()].filter((t) => !tables.includes(t));
  if (missing.length || extra.length) {
    return `C1 bars tables differ from the matrix's: ${[missing.length ? `missing ${missing.join(', ')}` : '',
      extra.length ? `extra ${extra.join(', ')}` : ''].filter(Boolean).join('; ')}`;
  }
  for (const t of tables) {
    const why = whyInvalid(`C1 bars disc_px.${t}`, bars.disc_px?.[t], { int: true, positive: true });
    if (why) return why;
  }
  return null;
}
/** The C1 bar for (table, b): { bar, cls, n } or { why }. b is looked up by its exact key ('0.6', '1', '1.4' — the
 * matrix's brightnesses), so a brightness the card did not measure fails by name instead of borrowing a bar. */
export function censusBar(bars, table, b) {
  for (const [cls, c] of Object.entries(bars?.classes ?? {})) {
    if (!c?.tables?.includes(table)) continue;
    const bar = c.bars?.[String(b)];
    if (!isNum(bar)) return { why: `C1 census: no bar for b ${b} (${cls})` };
    return { bar, cls, n: bars.disc_px?.[table] };
  }
  return { why: `C1 census: no bar for table ${table}` };
}
/** null when the row's player-camera cue-ball clip is within its bar, else the named C1 reason. Judged on every
 * MEASURED row of both legs, independent of the reference cell and of N0's bed reads (a missing census read never
 * hides another row's failure, and another read's failure never hides the census). */
export function whyCensus(r, bars) {
  if (!bars) return 'C1 census: no bars to judge against';
  const cb = censusBar(bars, r.table, r.b);
  if (cb.why) return cb.why;
  const P = r.cams?.player ?? {};
  const bad = whyInvalid('cell player ballClip', P.ballClip, { min: 0 })
    ?? (P.ballClip > 1 ? `cell player ballClip ${P.ballClip} > 1` : null)
    ?? whyInvalid('cell player ballClipN', P.ballClipN, { int: true, positive: true })
    ?? (P.ballClipN !== cb.n ? `cell player ballClipN ${P.ballClipN} != disc_px ${cb.n} (pixel-derived bars: re-derive them)` : null);
  if (bad) return `C1 N0 invalid read: ${bad}`;
  if (!atMost(P.ballClip, cb.bar)) {
    return `C1 cue-ball clip ${P.ballClip} > bar ${cb.bar} (${cb.cls}, b ${r.b}; ${Math.round(P.ballClip * cb.n)}/${cb.n} px; `
      + 'the owner-signed bars and their rule: web/tools/fixtures/lighting-census-bars.json)';
  }
  return null;
}

/** Judge every row. Returns { lines, out, refused, judged }. A row fails with a NAMED reason; a MEASURED row whose
 * judged reads are missing, non-finite, too thin (lighting-guard.mjs floors) or — for a luminance, a ratio or the
 * reference's denominators — not positive fails N0 before any tolerance is applied (review r2 P2: null/null made NaN
 * and every NaN comparison passed). `opts.manifest` = the served web/assets/gi/gi-manifest.json: N9's GI honesty
 * read (uGiOn == the manifest's committed bake for the row's rig, class and look) fails without it. `opts.bars` = the
 * card-45 census bars (GH-996 C1, whyCensus): every MEASURED row's cue-ball clip fails without them. */
export function judgeMatrix(results, { manifest = null, bars = null } = {}) {
  const by = new Map(results.map((r) => [cellKey(r), r]));
  const lines = []; let out = 0, refused = 0;
  for (const r of results) {
    const key = cellKey(r);
    if (r.verdict !== 'MEASURED') { refused++; lines.push(`MATRIX REFUSED ${key} ${(r.mismatch || []).join('; ')}`); continue; }
    const fails = [], notes = [];
    const ref = by.get(`${r.leg}|${r.table}|${refFixture(r.table)}|${r.b}`);
    const refOk = !!ref && ref.verdict === 'MEASURED';
    const L = r.light || {};
    // N9 integrity: live emitters == the lighting profile, hall closed, the look's exposure, and the env tail settled
    // both at the boot census and after the measurement (GH-971, review r4: a failed tail is never settled)
    const rects = whyListsDiffer('rects', L.visRects, 'profile', L.expected, 1e-4);
    if (rects) fails.push(`N9 ${rects}`);
    if (L.shellOpen !== false) fails.push(L.shellOpen === true ? 'N9 hall open' : `N9 hall state unread (shellOpen=${L.shellOpen})`);
    if (!within(L.exposure, 0.85, 1e-9)) fails.push(`N9 exposure ${L.exposure}`);
    const envBoot = envTailState(L.envTail), envAfter = envTailState(r.envTailAfter);
    if (!envBoot.settled) fails.push(`N9 at the boot census: ${envBoot.why}`);
    if (!envAfter.settled) fails.push(`N9 after the measurement: ${envAfter.why}`);
    // GH-1131: the snooker occlusion transport was drained before the settle (bootCell), and no job was pending when
    // each camera rendered (the census's readers / unbaked counts are recorded only). A capture taken while the trace
    // lands photographs a per-boot mix of lamp-lit and occluded parts.
    const occlDrain = whyOcclDrain(r.occl);
    if (occlDrain) fails.push(`N9 ${occlDrain}`);
    for (const cam of ['player', 'overhead']) { const why = whyOcclRender(r.cams?.[cam]?.occl); if (why) fails.push(`N9 ${cam} ${why}`); }
    // GH-975 S2: the GI honesty gate binds exactly the committed bakes (a dropped bake must stay off, every other one
    // must still bind)
    // gi.js's error path (settleOnError) resets bakeClass to null, which the mirror would read as the #52 null-class
    // gate and expect GI off: a failed load, or no applied look, is refused by name before the mirror is consulted
    if (!manifest) fails.push('N9 GI honesty: no manifest to judge against');
    else if (L.giLoadError) fails.push(`N9 GI honesty: the GI load failed (${L.giLoadError})`);
    else if (typeof L.giLook !== 'string') fails.push(`N9 GI honesty: gi.js applied no look (giLook=${L.giLook})`);
    else if (L.uGiOn !== 0 && L.uGiOn !== 1) fails.push(`N9 GI honesty: uGiOn=${L.uGiOn}`);
    else {
      const want = giBakeExpected(manifest, L.giLook, L.giFixture, L.giClass);
      if ((L.uGiOn === 1) !== want) {
        fails.push(`N9 GI honesty: uGiOn ${L.uGiOn} but the manifest ${want ? 'commits' : 'has no'} bake for ${L.giFixture} on class ${L.giClass} (look ${L.giLook})`);
      }
    }
    // GH-996 C1: the cue-ball clipping census (opts.bars = the card-45 bars fixture; fails without it, as N9 GI does)
    const c1 = whyCensus(r, bars);
    if (c1) fails.push(c1);
    // N0 read validity (the cell AND its reference)
    const bad = [];
    const add = (why) => { if (why) bad.push(why); };
    const bedOf = (row, cam) => row?.cams?.[cam]?.bed ?? {};
    const factory = r.leg !== 'neutral';
    add(whyInvalid('cell b', r.b, { positive: true }));
    for (const [tag, row] of [['cell', r], ['reference', refOk ? ref : null]]) {
      if (!row) continue;
      add(whyBadCentre(`${tag} player`, bedOf(row, 'player')));
      if (!factory) continue;
      const O = bedOf(row, 'overhead'), S = row?.cams?.overhead?.cushionStrip;
      add(whyInvalid(`${tag} overhead bed samples`, O.n, { min: MIN_BED_SAMPLES }));
      add(whyInvalid(`${tag} overhead centre samples`, O.nCentre, { min: MIN_CENTRE_SAMPLES }));
      add(whyInvalid(`${tag} overhead corner samples`, O.nCorner, { min: MIN_CORNER_SAMPLES }));
      add(whyInvalid(`${tag} overhead corner/centre`, O.uniformity, { positive: true }));
      add(whyInvalid(`${tag} overhead cushion-strip pairs`, S?.n, { min: MIN_STRIP_PAIRS }));
      add(whyInvalid(`${tag} overhead cushion strip`, S?.ratio, { positive: true }));
    }
    if (factory) for (const cam of ['player', 'overhead']) {
      add(whyInvalid(`cell ${cam} clip%`, bedOf(r, cam).clipPct, { min: 0 }));
      add(whyInvalid(`cell ${cam} crush%`, bedOf(r, cam).crushPct, { min: 0 }));
    }
    if (!refOk) fails.push('no measured reference cell');
    if (bad.length) fails.push(`N0 invalid read: ${bad.join(', ')}`);
    const valid = refOk && !bad.length;
    const pc = bedOf(r, 'player').centre, rc = refOk ? bedOf(ref, 'player').centre : null;
    if (valid && !factory) {
      // the gains are solved per table on the FACTORY cloth; a cloth-colour override keeps the lamp-colour x
      // cloth-colour residual (the neutral-cloth leg reads it), judged only against a gross 20 % bound
      if (!within(pc / rc, 1, 0.20)) fails.push(`N1n centre ${pc} = ${(pc / rc).toFixed(3)}x reference ${rc} (> 20 %)`);
    } else if (valid) {
      const tol = r.b === 1 ? 0.05 : 0.10; // solved at 1.0; the brightness scale leaves the hemi stand-in out by design
      if (!within(pc / rc, 1, tol)) fails.push(`N1 centre ${pc} = ${(pc / rc).toFixed(3)}x reference ${rc} (> ${100 * tol} %)`);
      for (const cam of ['player', 'overhead']) {
        const bd = bedOf(r, cam);
        if (!(bd.clipPct <= (r.b <= 1 ? 0 : 0.5))) fails.push(`N3 ${cam} bed clipped ${bd.clipPct} %`);
        if (!(bd.crushPct <= 0)) fails.push(`N4 ${cam} bed crushed ${bd.crushPct} %`);
      }
      // N5 / N8 judge the light FIELD's geometry against the reference rig. Not judged: the table's own approved venue
      // rig (its geometry is the signed-off look).
      const venueRig = r.fixture === 'auto' || r.fixture === VENUE_DEFAULT[r.table];
      const geo = (row, msg) => { if (venueRig) notes.push(`${row}-obs ${msg}`); else fails.push(`${row} ${msg}`); };
      const u = bedOf(r, 'overhead').uniformity, ru = bedOf(ref, 'overhead').uniformity;
      if (!(u >= Math.min(0.35, 0.85 * ru))) geo('N5', `corner/centre ${u} < min(0.35, 0.85 x ${ru})`);
      const st = r.cams.overhead.cushionStrip.ratio, rst = ref.cams.overhead.cushionStrip.ratio;
      if (!(st >= Math.min(0.6, 0.85 * rst) && st <= 1.07)) geo('N8', `cushion strip ${st} outside [min(0.6, 0.85 x ${rst}), 1.07]`);
    }
    if (fails.length) { out++; lines.push(`MATRIX OUT ${key} ${fails.join(' | ')}${notes.length ? ' || ' + notes.join(' | ') : ''}`); }
    else lines.push(`MATRIX OK ${key} centre ${pc} ref ${rc}${notes.length ? ' || ' + notes.join(' | ') : ''}`);
  }
  return { lines, out, refused, judged: results.length - refused };
}
