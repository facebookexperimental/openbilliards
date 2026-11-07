// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-lighting-matrix-judge.mjs — node selftest of the lighting tools' validity rule (GH-975). No browser.
//   1. the matrix judge (lib/lighting-judge.mjs): a green cell passes; a missing (null), non-finite (NaN / Infinity),
//      too-thin or non-positive read FAILS with a NAMED reason, and real out-of-range cells still fail their row
//      (review r2 P2: null/null made NaN and every NaN comparison passed);
//   2. the shared guards (lib/lighting-guard.mjs) behind the env arms, the live arm and the gain solver (review r3 P2:
//      a zero-filled cube read passed E1/E2; a null centre made the solver write Infinity / NaN gains; review r4 P2: a
//      latched env-tail failure reads left 0 and was taken for a drained tail);
//   3. STATIC: the committed MATCH_GAINS and BAKED_MATCH_GAINS tables in scene/lightingvisuals.js hold only finite
//      positive numbers, one MATCH_GAINS row per user table, and the solver's writer round-trips them byte for byte;
//      in-memory plants of a bad literal must be refused by the same parse + check.
//   4. GH-996 C1 (card 45): the cue-ball clipping census — every user table at every brightness passes at its bar and
//      fails one pixel over; the class split (a pool row between the 0.07 and 0.09 bars fails, its snooker twin passes)
//      and the brightness split; a missing / invalid census read or bar fails by name; STATIC: the committed bars
//      fixture partitions the user tables, holds the owner-signed values and keeps >= 1 px over the measured maximum,
//      and in-memory plants of a bad fixture are refused by name.
//   node web/tools/test-lighting-matrix-judge.mjs   (exit 0 = every expectation held)
import fs from 'node:fs';
import { judgeMatrix, giBakeExpected, refFixture, whyBadBars, censusBar } from './lib/lighting-judge.mjs';
import { within, atMost, atLeast, must, InvalidRead, whyListsDiffer, envDrift, whyBadCentre, envTailState, parseGainsBlock,
  whyBadGains, renderGainsBlock, prepareGainsWrite } from './lib/lighting-guard.mjs';
import { USER_TABLES, GAME_FOR } from './lib/lighting-matrix.mjs';

export const PORT_FLAGS = {};

let bad = 0, total = 0;
const report = (name, ok, detail = '') => { total++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };

// ---- 1. judge
const bed = (o = {}) => ({ n: 420, nCentre: 30, nCorner: 40, centre: 0.4, corner: 0.3, uniformity: 0.75, clipPct: 0, crushPct: 0, p5: 0.3, p95: 0.42, ...o });
// the player camera carries the GH-996 C1 census read: a clean cue ball (0 of the 282 disc pixels of a 9-ft table)
const cams = (pb = {}, ob = {}, strip = 0.8, pairs = 46, census = {}) => ({
  player: { bed: bed(pb), cushionStrip: { n: 40, ratio: 0.8 }, ballClip: 0, ballClipN: 282, ...census },
  overhead: { bed: bed(ob), cushionStrip: { n: pairs, ratio: strip } },
});
const TAIL_OK = Object.freeze({ left: 0, boot: 'done', size: 2, error: null });
const TAIL_FAILED = Object.freeze({ left: 0, boot: 'done', size: 2, error: 'env tail: planted tail capture failure' }); // the review r4 shape
const light = (i = [7.8], o = {}) => ({ exposure: 0.85, visRects: i, expected: i, shellOpen: false, envTail: TAIL_OK, ...o });
const P3 = [150, 150, 150];
// a fixture GI manifest in the committed shape: the pool canopy and pdt_studio are baked; the ring and the pendant are
// honesty-gated (absent / unbaked); the snooker class bakes its canopy and its luminaire
const MF = Object.freeze({
  looks: { default: {}, sp: {} },
  fixtures: { perimeter_ring: { unbaked: true }, pendant_bar: { unbaked: true }, pdt_studio: { looks: { default: { files: {} }, sp: { files: {} } } } },
  tables: { snooker_12ft: { looks: { default: {}, sp: {} }, fixtures: { snooker_luminaire: { looks: { sp: { files: {} } } } } }, pool_8ft: { looks: { sp: {} }, fixtures: {} } },
});
// GH-1131: the occlusion drain record (SNK_OCCL_FLUSH_SRC) and a camera's render-time census of a settled snooker boot
const OCCL_DRAIN_OK = Object.freeze({ seam: true, ms: 3600, err: null, bakeBefore: 1, bakeAfter: 2, rebakeFired: true });
const OCCL_RENDER_OK = Object.freeze({ seam: true, pending: 0, readers: 168, unbaked: 18 });
const row = (fixture, c, o = {}) => {
  const r = { leg: 'factory', table: 'pool_pro_9ft', fixture, b: 1, verdict: 'MEASURED', light: light(), cams: c, envTailAfter: TAIL_OK, occl: OCCL_DRAIN_OK, ...o };
  // the GI census a pool-table boot reports (a case's own light fields win)
  r.light = { giClass: 'pool', giLook: 'sp', giFixture: fixture, uGiOn: giBakeExpected(MF, 'sp', fixture, 'pool') ? 1 : 0, ...r.light };
  // every camera carries a settled render-time occlusion census unless the case writes its own (GH-1131)
  if (r.cams && typeof r.cams === 'object') r.cams = Object.fromEntries(Object.entries(r.cams).map(([k, v]) => [k, v && typeof v === 'object' && !('occl' in v) ? { ...v, occl: OCCL_RENDER_OK } : v]));
  return r;
};
const pair = (cell, ref = cams()) => [row('canopy_panel', ref), row('pendant_bar', cell, { light: light(P3) })];
// cams() with a case's own render-time occlusion census per camera (undefined keeps row()'s settled default)
const ocams = (player, overhead) => { const c = cams(); if (player !== undefined) c.player.occl = player; if (overhead !== undefined) c.overhead.occl = overhead; return c; };
const nulls = { n: 0, nCentre: 0, nCorner: 0, centre: null, uniformity: null, clipPct: null, crushPct: null };

const cases = [
  { name: 'green pair', rows: pair(cams({ centre: 0.402 })), want: { out: 0 } },
  { name: 'null bed metrics on cell AND reference', rows: [row('canopy_panel', cams(nulls, nulls, null)), row('pendant_bar', cams(nulls, nulls, null), { light: light(P3) })],
    want: { out: 2, reasons: ['N0 invalid read', 'cell player bed samples 0 < 40', 'reference player bed samples 0 < 40'] } },
  { name: 'NaN centre on the cell', rows: pair(cams({ centre: NaN })), want: { out: 1, reasons: ['cell player centre=NaN'] } },
  { name: 'Infinity cushion strip on the reference', rows: pair(cams(), cams({}, {}, Infinity)), want: { out: 2, reasons: ['reference overhead cushion strip=Infinity'] } },
  { name: 'reference luminance 0', rows: [row('canopy_panel', cams({ centre: 0 })), row('pendant_bar', cams({ centre: 0 }), { light: light(P3) })],
    want: { out: 2, reasons: ['reference player centre 0 is not positive'] } },
  { name: 'reference corner/centre 0 (would make N5 vacuous)', rows: pair(cams(), cams({}, { uniformity: 0 })), want: { out: 2, reasons: ['reference overhead corner/centre 0 is not positive'] } },
  { name: 'reference cushion strip 0 (would make N8 vacuous)', rows: pair(cams(), cams({}, {}, 0)), want: { out: 2, reasons: ['reference overhead cushion strip 0 is not positive'] } },
  { name: 'too few bed samples', rows: pair(cams({ n: 3 })), want: { out: 1, reasons: ['cell player bed samples 3 < 40'] } },
  { name: 'too few centre patches', rows: pair(cams({ nCentre: 2 })), want: { out: 1, reasons: ['cell player centre samples 2 < 8'] } },
  { name: 'too few corner patches', rows: pair(cams({}, { nCorner: 3 })), want: { out: 1, reasons: ['cell overhead corner samples 3 < 12'] } },
  { name: 'too few cushion-strip pairs', rows: pair(cams({}, {}, 0.8, 5)), want: { out: 1, reasons: ['cell overhead cushion-strip pairs 5 < 22'] } },
  { name: 'neutral leg with a null centre', rows: [{ ...row('canopy_panel', cams()), leg: 'neutral' }, { ...row('pendant_bar', cams({ centre: null }), { light: light(P3) }), leg: 'neutral' }],
    want: { out: 1, reasons: ['cell player centre=null'] } },
  { name: 'empty live emitter list', rows: [row('canopy_panel', cams()), row('pendant_bar', cams(), { light: light([]) })], want: { out: 1, reasons: ['N9 rects [] is empty'] } },
  { name: 'NaN live emitter', rows: [row('canopy_panel', cams()), row('pendant_bar', cams(), { light: light([NaN, 150, 150]) })], want: { out: 1, reasons: ['N9 rects[0]=NaN'] } },
  { name: 'NaN exposure', rows: [row('canopy_panel', cams()), row('pendant_bar', cams(), { light: light(P3, { exposure: NaN }) })], want: { out: 1, reasons: ['N9 exposure NaN'] } },
  { name: 'hall state unread', rows: [row('canopy_panel', cams()), row('pendant_bar', cams(), { light: light(P3, { shellOpen: null }) })], want: { out: 1, reasons: ['N9 hall state unread (shellOpen=null)'] } },
  { name: 'NaN brightness on the rows', rows: [row('canopy_panel', cams(), { b: NaN }), row('pendant_bar', cams(), { light: light(P3), b: NaN })], want: { out: 2, reasons: ['cell b=NaN'] } },
  { name: 'env tail failed while the cell was measured (left 0, boot done, error set)', rows: pair(cams()).map((r, i) => (i ? { ...r, envTailAfter: TAIL_FAILED } : r)),
    want: { out: 1, reasons: ['N9 after the measurement: env tail failed: env tail: planted tail capture failure'] } },
  { name: 'env tail failed at the boot census', rows: [row('canopy_panel', cams()), row('pendant_bar', cams(), { light: light(P3, { envTail: TAIL_FAILED }) })],
    want: { out: 1, reasons: ['N9 at the boot census: env tail failed: env tail: planted tail capture failure'] } },
  { name: 'env tail still owing a bake at the boot census', rows: [row('canopy_panel', cams()), row('pendant_bar', cams(), { light: light(P3, { envTail: { ...TAIL_OK, left: 1 } }) })],
    want: { out: 1, reasons: ['N9 at the boot census: env tail owes 1 bake(s)'] } },
  { name: 'no env tail census after the measurement', rows: pair(cams()).map((r, i) => (i ? { ...r, envTailAfter: undefined } : r)),
    want: { out: 1, reasons: ['N9 after the measurement: env tail census unavailable'] } },
  // GH-1131: the snooker occlusion transport (drained before the settle; nothing pending at each render; readers/unbaked recorded only)
  { name: 'occlusion: no drain record', rows: pair(cams()).map((r, i) => (i ? { ...r, occl: undefined } : r)),
    want: { out: 1, reasons: ['N9 occlusion drain record unavailable (undefined)'] } },
  { name: 'occlusion: the page publishes no __snkOccl seam', rows: pair(cams()).map((r, i) => (i ? { ...r, occl: { ...OCCL_DRAIN_OK, seam: false } } : r)),
    want: { out: 1, reasons: ['N9 occlusion drain: the page publishes no window.__snkOccl seam'] } },
  { name: 'occlusion: the drain threw', rows: pair(cams()).map((r, i) => (i ? { ...r, occl: { ...OCCL_DRAIN_OK, err: 'TypeError: planted' } } : r)),
    want: { out: 1, reasons: ['N9 occlusion drain threw: TypeError: planted'] } },
  { name: "occlusion: bootCell's catch record (a rejected evaluation) names the CDP error, not a missing seam",
    rows: pair(cams()).map((r, i) => (i ? { ...r, occl: { seam: null, err: 'Error: Execution context was destroyed.' } } : r)),
    want: { out: 1, reasons: ['N9 occlusion drain eval failed: Error: Execution context was destroyed.'] } },
  { name: 'occlusion: 23 traces pending at the player render (the pre-fix snooker capture)', rows: pair(ocams({ ...OCCL_RENDER_OK, pending: 23 })),
    want: { out: 1, reasons: ['N9 player occlusion transport still landing when the camera rendered: 23 job(s) pending'] } },
  { name: 'occlusion: by-design default readers (18 unbaked, nothing pending) are recorded, not judged', rows: pair(ocams({ ...OCCL_RENDER_OK, readers: 168, unbaked: 18 }, { ...OCCL_RENDER_OK, readers: 168, unbaked: 18 })),
    want: { out: 0 } },
  { name: 'occlusion: no render census', rows: pair(ocams(null)), want: { out: 1, reasons: ['N9 player occlusion census unavailable (null)'] } },
  { name: 'occlusion: a NaN pending count', rows: pair(ocams({ ...OCCL_RENDER_OK, pending: NaN })), want: { out: 1, reasons: ['N9 player occlusion pending=NaN'] } },
  { name: 'occlusion: a fractional pending count', rows: pair(ocams({ ...OCCL_RENDER_OK, pending: 0.5 })),
    want: { out: 1, reasons: ['N9 player occlusion pending 0.5 is not an integer'] } },
  { name: 'occlusion: an unread pending count at the overhead render', rows: pair(ocams(undefined, { ...OCCL_RENDER_OK, pending: null })),
    want: { out: 1, reasons: ['N9 overhead occlusion pending=null'] } },
  { name: 'occlusion: no pending seam at the render', rows: pair(ocams({ ...OCCL_RENDER_OK, seam: false })),
    want: { out: 1, reasons: ['N9 player occlusion census: no window.__snkOccl.pending seam'] } },
  { name: 'occlusion: a pending reference row fails the reference too', rows: pair(cams(), ocams({ ...OCCL_RENDER_OK, pending: 1 })),
    want: { out: 1, reasons: ['N9 player occlusion transport still landing when the camera rendered: 1 job(s) pending'] } },
  { name: 'GI honesty: a dropped bake the runtime still binds', rows: [row('canopy_panel', cams()), row('perimeter_ring', cams(), { light: light([7.8], { uGiOn: 1 }) })],
    want: { out: 1, reasons: ['N9 GI honesty: uGiOn 1 but the manifest has no bake for perimeter_ring on class pool (look sp)'] } },
  { name: 'GI honesty: a committed bake the runtime did not bind', rows: [row('canopy_panel', cams(), { light: light([7.8], { uGiOn: 0 }) }), row('pendant_bar', cams(), { light: light(P3) })],
    want: { out: 1, reasons: ['N9 GI honesty: uGiOn 0 but the manifest commits bake for canopy_panel on class pool (look sp)'] } },
  { name: 'GI honesty: an unread uGiOn', rows: [row('canopy_panel', cams()), row('pendant_bar', cams(), { light: light(P3, { uGiOn: null }) })],
    want: { out: 1, reasons: ['N9 GI honesty: uGiOn=null'] } },
  { name: 'GI honesty: a failed GI load (gi.js reset the class to null) is not the null-class gate',
    rows: [row('canopy_panel', cams()), row('pendant_bar', cams(), { light: light(P3, { uGiOn: 0, giClass: null, giLook: null, giLoadError: 'asset fetch rejected' }) })],
    want: { out: 1, reasons: ['N9 GI honesty: the GI load failed (asset fetch rejected)'] } },
  { name: 'GI honesty: no applied look', rows: [row('canopy_panel', cams()), row('pendant_bar', cams(), { light: light(P3, { giLook: null }) })],
    want: { out: 1, reasons: ['N9 GI honesty: gi.js applied no look (giLook=null)'] } },
  { name: 'GI honesty: no manifest to judge against', manifest: null, rows: pair(cams()),
    want: { out: 2, reasons: ['N9 GI honesty: no manifest to judge against'] } },
  { name: 'real out-of-range rows still fail (N1 N3 N4 N5 N8)', rows: pair(cams({ centre: 0.5, clipPct: 0.2 }, { crushPct: 0.1, uniformity: 0.2 }, 1.2)),
    want: { out: 1, reasons: ['N1 centre 0.5 = 1.250x', 'N3 player bed clipped 0.2 %', 'N4 overhead bed crushed 0.1 %', 'N5 corner/centre 0.2', 'N8 cushion strip 1.2 outside'] } },
];
// ---- GH-996 C1: the cue-ball clipping census against the committed card-45 bars
const BARS = JSON.parse(fs.readFileSync(new URL('./fixtures/lighting-census-bars.json', import.meta.url), 'utf8'));
const ccams = (t, clip, o = {}) => cams({}, {}, 0.8, 46, { ballClip: clip, ballClipN: BARS.disc_px[t], ...o });
// the table's reference row + a pendant cell at brightness b; the cell's player clip = clip (the reference's = refClip)
const cpair = (t, b, clip, { leg = 'factory', refClip = 0 } = {}) => {
  const o = { table: t, b, leg, ...(leg === 'neutral' ? { cloth: 'steel_gray' } : {}) };
  return [row(refFixture(t), ccams(t, refClip), o), row('pendant_bar', ccams(t, clip), { ...o, light: light(P3) })];
};
for (const t of USER_TABLES) for (const b of [0.6, 1, 1.4]) {
  const { bar, cls, n } = censusBar(BARS, t, b);
  const k = Math.floor(bar * n + 1e-9), at = +(k / n).toFixed(4), over = +((k + 1) / n).toFixed(4);
  if (!(at <= bar && over > bar)) throw new Error(`selftest construction: ${t} b ${b} ${at} / ${over} vs ${bar}`);
  cases.push({ name: `C1 ${t} b ${b}: ${k}/${n} px = ${at}, at the ${cls} bar ${bar}, passes`, rows: cpair(t, b, at), want: { out: 0 } });
  cases.push({ name: `C1 ${t} b ${b}: one pixel over (${k + 1}/${n} = ${over}) fails`, rows: cpair(t, b, over),
    want: { out: 1, reasons: [`C1 cue-ball clip ${over} > bar ${bar} (${cls}, b ${b}; ${k + 1}/${n} px; `] } });
}
cases.push(
  // the class split (the owner's snooker bars sit ABOVE the other nine's, so the red side is the pool row)
  { name: 'C1 class split: a pool row at 0.084 (between the 0.07 and 0.09 bars) fails', rows: cpair('pool_pro_9ft', 1, 0.084),
    want: { out: 1, reasons: ['C1 cue-ball clip 0.084 > bar 0.07 (other, b 1;'] } },
  { name: 'C1 class split: its snooker twin at the same 0.084 passes (bar 0.09)', rows: cpair('wpbsa_snooker_12ft', 1, 0.084), want: { out: 0 } },
  // the brightness split
  { name: 'C1 brightness split: a snooker b 1 row at 0.1221 (between 0.09 and 0.15) fails', rows: cpair('wpbsa_snooker_12ft', 1, 0.1221),
    want: { out: 1, reasons: ['C1 cue-ball clip 0.1221 > bar 0.09 (snooker, b 1;'] } },
  { name: 'C1 brightness split: the same 0.1221 at b 1.4 passes (bar 0.15)', rows: cpair('wpbsa_snooker_12ft', 1.4, 0.1221), want: { out: 0 } },
  { name: 'C1 brightness split: a pool b 1 row at 0.0887 fails', rows: cpair('pool_pro_9ft', 1, 0.0887),
    want: { out: 1, reasons: ['C1 cue-ball clip 0.0887 > bar 0.07 (other, b 1;'] } },
  { name: 'C1 brightness split: the same 0.0887 at b 1.4 passes (bar 0.10)', rows: cpair('pool_pro_9ft', 1.4, 0.0887), want: { out: 0 } },
  { name: 'C1 brightness split: a pool b 0.6 row at 0.0709 fails', rows: cpair('pool_pro_9ft', 0.6, 0.0709),
    want: { out: 1, reasons: ['C1 cue-ball clip 0.0709 > bar 0.07 (other, b 0.6;'] } },
  // the bar is inclusive (<=), and the census is judged on a row with no measured reference cell too
  { name: 'C1 a clip exactly at the bar (0.07) passes: the bar is inclusive', rows: cpair('pool_pro_9ft', 1, 0.07), want: { out: 0 } },
  { name: 'C1 a row with no measured reference cell is still judged', rows: [cpair('pool_pro_9ft', 1, 0.0709)[1]],
    want: { out: 1, reasons: ['no measured reference cell', 'C1 cue-ball clip 0.0709 > bar 0.07 (other, b 1;'] } },
  // coverage: the neutral leg is judged; the overhead camera is not the census
  { name: 'C1 neutral leg: a steel_gray row at 0.0709 fails', rows: cpair('pool_pro_9ft', 1, 0.0709, { leg: 'neutral' }),
    want: { out: 1, reasons: ['C1 cue-ball clip 0.0709 > bar 0.07 (other, b 1;'] } },
  { name: 'C1 reads the player camera only: overhead ballClip 0.9 with player 0 passes',
    rows: cpair('pool_pro_9ft', 1, 0).map((r, i) => (i ? { ...r, cams: { ...r.cams, overhead: { ...r.cams.overhead, ballClip: 0.9 } } } : r)), want: { out: 0 } },
  // a missing reference census read fails the REFERENCE row only, and a missing census read hides no other failure
  { name: 'C1 a null census read on the reference row fails that row only', rows: cpair('pool_pro_9ft', 1, 0, { refClip: null }),
    want: { out: 1, reasons: ['factory|pool_pro_9ft|canopy_panel|1 C1 N0 invalid read: cell player ballClip=null'] } },
  { name: 'C1 a null census read does not hide the row\'s N1 failure',
    rows: cpair('pool_pro_9ft', 1, null).map((r, i) => (i ? { ...r, cams: { ...r.cams, player: { ...r.cams.player, bed: bed({ centre: 0.5 }) } } } : r)),
    want: { out: 1, reasons: ['C1 N0 invalid read: cell player ballClip=null', 'N1 centre 0.5 = 1.250x'] } },
  // the bars: missing, lacking the table, lacking the brightness
  { name: 'C1 census: no bars fails every measured row by name', bars: null, rows: cpair('pool_pro_9ft', 1, 0),
    want: { out: 2, reasons: ['C1 census: no bars to judge against'] } },
  { name: 'C1 census: a table the bars lack fails by name',
    bars: { ...BARS, classes: { ...BARS.classes, other: { ...BARS.classes.other, tables: BARS.classes.other.tables.filter((t) => t !== 'pool_pro_9ft') } } },
    rows: cpair('pool_pro_9ft', 1, 0), want: { out: 2, reasons: ['C1 census: no bar for table pool_pro_9ft'] } },
  { name: 'C1 census: a brightness the card did not measure (b 1.2) fails by name', rows: cpair('pool_pro_9ft', 1.2, 0),
    want: { out: 2, reasons: ['C1 census: no bar for b 1.2 (other)'] } },
);
// invalid census reads, each named (the guard's validity rule before the bar applies)
for (const [label, v, why] of [['null', null, 'cell player ballClip=null'], ['absent', undefined, 'cell player ballClip=undefined'],
  ['NaN', NaN, 'cell player ballClip=NaN'], ['-0.01', -0.01, 'cell player ballClip -0.01 < 0'], ['1.2', 1.2, 'cell player ballClip 1.2 > 1'],
  ['the string "0.05"', '0.05', 'cell player ballClip="0.05"']]) {
  const rows = cpair('pool_pro_9ft', 1, 0);
  rows[1] = { ...rows[1], cams: { ...rows[1].cams, player: { ...rows[1].cams.player, ballClip: v } } };
  if (v === undefined) delete rows[1].cams.player.ballClip;
  cases.push({ name: `C1 invalid read: ballClip ${label} fails by name`, rows, want: { out: 1, reasons: [`C1 N0 invalid read: ${why}`] } });
}
for (const [label, v, why] of [['absent', undefined, 'cell player ballClipN=undefined'], ['290 (a moved pose)', 290, 'cell player ballClipN 290 != disc_px 282'],
  ['282.5', 282.5, 'cell player ballClipN 282.5 is not an integer'], ['0', 0, 'cell player ballClipN 0 is not positive']]) {
  const rows = cpair('pool_pro_9ft', 1, 0);
  rows[1] = { ...rows[1], cams: { ...rows[1].cams, player: { ...rows[1].cams.player, ballClipN: v } } };
  if (v === undefined) delete rows[1].cams.player.ballClipN;
  cases.push({ name: `C1 invalid read: ballClipN ${label} fails by name`, rows, want: { out: 1, reasons: [`C1 N0 invalid read: ${why}`] } });
}
for (const c of cases) {
  const j = judgeMatrix(c.rows, { manifest: 'manifest' in c ? c.manifest : MF, bars: 'bars' in c ? c.bars : BARS });
  const outLines = j.lines.filter((l) => l.startsWith('MATRIX OUT'));
  const missing = (c.want.reasons || []).filter((s) => !outLines.some((l) => l.includes(s)));
  const ok = j.out === c.want.out && !missing.length;
  report(`judge: ${c.name}`, ok, `out ${j.out} (want ${c.want.out})${missing.length ? `; reasons NOT named: ${missing.join(' / ')}` : ''}`);
  if (!ok) for (const l of j.lines) console.log('     ' + l);
}

// ---- 2. shared guards
const envRead = (faces, unwritten = [0, 0, 0, 0, 0, 0], texels = 1024) => ({ faces, unwritten, texels });
const F = [0.31, 0.32, 0.5, 0.12, 0.29, 0.3];
const guardCases = [
  ['env: two good reads give the largest face change', () => { const d = envDrift('boot', envRead(F), 'after', envRead(F.map((v, i) => (i === 2 ? v * 1.02 : v)))); return [!d.why && within(d.value, 0.02, 1e-9), JSON.stringify(d)]; }],
  ['env: a zero-filled (black) cube is refused', () => { const d = envDrift('boot', envRead([0, 0, 0, 0, 0, 0]), 'after', envRead([0, 0, 0, 0, 0, 0])); return [!!d.why && d.why.includes('boot face means[0] 0 is not positive'), d.why]; }],
  ['env: a no-op readback (every sampled texel unwritten) is refused', () => { const d = envDrift('boot', envRead([null, null, null, null, null, null], [1024, 1024, 1024, 1024, 1024, 1024]), 'after', envRead(F)); return [!!d.why && d.why.includes('boot readback left [1024, 1024, 1024, 1024, 1024, 1024] of 1024 sampled texels per face unwritten'), d.why]; }],
  ['env: a NaN face mean is refused', () => { const d = envDrift('boot', envRead(F), 'after', envRead([0.31, 0.32, NaN, 0.12, 0.29, 0.3])); return [!!d.why && d.why.includes('after face means[2]=NaN'), d.why]; }],
  ['env: the pre-r3 read shape (a bare list of six zeros) is refused', () => { const d = envDrift('boot', [0, 0, 0, 0, 0, 0], 'after', [0, 0, 0, 0, 0, 0]); return [!!d.why && d.why.includes('is malformed'), d.why]; }],
  ['env: a missing face is refused', () => { const d = envDrift('boot', envRead(F.slice(0, 5), [0, 0, 0, 0, 0]), 'after', envRead(F)); return [!!d.why, d.why]; }],
  ['live: two empty emitter lists are not equal', () => { const w = whyListsDiffer('live rects', [], 'profile', []); return [w === 'live rects [] is empty', w]; }],
  ['live: a null profile is not a list', () => { const w = whyListsDiffer('live rects', [7.8], 'profile', null); return [w === 'profile null is not a list', w]; }],
  ['live: NaN emitters are not equal', () => { const w = whyListsDiffer('live rects', [NaN], 'profile', [NaN]); return [w === 'live rects[0]=NaN', w]; }],
  ['live: equal multisets pass, a moved gain fails', () => { const a = whyListsDiffer('live', [150, 122.8, 150], 'profile', [122.8, 150, 150]), b = whyListsDiffer('live', [149.53], 'profile', [122.79]); return [a === null && !!b && b.includes('!='), `${a} / ${b}`]; }],
  ['solver: an empty centre set is refused', () => { const w = whyBadCentre('cell perimeter_ring player', { n: 420, nCentre: 0, centre: null }); return [w === 'cell perimeter_ring player centre samples 0 < 8', w]; }],
  ['solver: a failed mask readback (0 patches) is refused', () => { const w = whyBadCentre('reference canopy_panel player', { n: 0, nCentre: 0, centre: null }); return [w === 'reference canopy_panel player bed samples 0 < 40', w]; }],
  ['solver: a good centre read passes', () => { const w = whyBadCentre('cell', bed()); return [w === null, w]; }],
  ['env tail: a drained tail is settled', () => { const st = envTailState(TAIL_OK); return [st.settled && !st.failed && st.why === null, JSON.stringify(st)]; }],
  ['env tail: a latched failure (left 0) is NOT settled and is named (review r4)', () => { const st = envTailState(TAIL_FAILED); return [!st.settled && st.failed && st.why === 'env tail failed: env tail: planted tail capture failure', st.why]; }],
  ['env tail: a failed boot tail is failed', () => { const st = envTailState({ left: 0, boot: 'failed', size: 2, error: 'env tail: x' }); return [!st.settled && st.failed, st.why]; }],
  ['env tail: owed bakes are unsettled, not failed', () => { const st = envTailState({ ...TAIL_OK, left: 2 }); return [!st.settled && !st.failed && st.why === 'env tail owes 2 bake(s)', st.why]; }],
  ['env tail: a running boot tail is unsettled', () => { const st = envTailState({ ...TAIL_OK, boot: 'running' }); return [!st.settled && !st.failed && st.why === 'env boot tail running', st.why]; }],
  ['env tail: no census is unsettled', () => { const a = envTailState(null), b = envTailState(undefined), d = envTailState({ boot: 'done', error: null }); return [!a.settled && !b.settled && !d.settled && a.why.startsWith('env tail census unavailable') && d.why === 'env tail owes undefined bake(s)', `${a.why} / ${b.why} / ${d.why}`]; }],
  ['GI mirror: the pool canopy binds; the honesty-gated ring and pendant do not', () => [giBakeExpected(MF, 'sp', 'canopy_panel', 'pool') && !giBakeExpected(MF, 'sp', 'perimeter_ring', 'pool') && !giBakeExpected(MF, 'sp', 'pendant_bar', 'pool') && giBakeExpected(MF, 'sp', 'pdt_studio', 'pool'), '']],
  ['GI mirror: class bakes resolve the class entry; a fixture the class did not bake is off', () => [giBakeExpected(MF, 'sp', 'snooker_luminaire', 'snooker_12ft') && giBakeExpected(MF, 'sp', 'canopy_panel', 'snooker_12ft') && !giBakeExpected(MF, 'sp', 'perimeter_ring', 'snooker_12ft') && !giBakeExpected(MF, 'default', 'snooker_luminaire', 'snooker_12ft') && !giBakeExpected(MF, 'sp', 'perimeter_ring', 'pool_8ft'), '']],
  ['GI mirror: a null class (#52 footprint gate) and a look the manifest lacks are off', () => [!giBakeExpected(MF, 'sp', 'canopy_panel', null) && !giBakeExpected(MF, 'night', 'canopy_panel', 'pool') && !giBakeExpected(null, 'sp', 'canopy_panel', 'pool'), '']],
  ['GI mirror: the de-brand look alias resolves both manifest shapes', () => { const T = { looks: { tournament: {} }, fixtures: { pdt_studio: { looks: { tournament: { files: {} } } } } }; return [giBakeExpected(MF, 'tournament', 'canopy_panel', 'pool') && giBakeExpected(MF, 'tournament', 'pdt_studio', 'pool') && giBakeExpected(T, 'sp', 'pdt_studio', 'pool') && giBakeExpected(T, 'tournament', 'canopy_panel', 'pool'), '']; }],
  ['within: NaN / null are never within', () => [!within(NaN, 1, 0.1) && !within(null, 0, 1) && !within(1, 1, NaN) && within(1.05, 1, 0.1), '']],
  // GH-1040: the trap the helpers exist for — null coerces to 0, so a negated bare comparison passes a null read
  ['atMost / atLeast: null, undefined and NaN are never in range (a bare !(null <= 0.02) passes)', () => {
    const trap = !(null <= 0.02) === false;
    const ok = !atMost(null, 0.02) && !atMost(undefined, 0.02) && !atMost(NaN, 0.02) && atMost(0.01, 0.02) && !atMost(0.03, 0.02)
      && !atLeast(null, -1) && !atLeast(undefined, 0) && atLeast(0.5, 0.1) && !atLeast(0.05, 0.1) && !atMost(0.01, null);
    return [trap && ok, `bare !(null <= 0.02) = ${!(null <= 0.02)}`]; }],
  ['must: throws a named InvalidRead', () => { try { must('next gain', NaN, { positive: true }); return [false, 'did not throw']; } catch (e) { return [e instanceof InvalidRead && e.message === 'N0 invalid read: next gain=NaN', e.message]; } }],
];
for (const [name, fn] of guardCases) { const [ok, detail] = fn(); report(`guard: ${name}`, ok, detail ?? ''); }

// ---- 2b. STATIC: the GH-1131 occlusion drain wiring. The matrix drains the snooker aOccl transport between the ready
// wait and the settle predicate, censuses it in the same synchronous run as each camera's renders, and carries both
// reads onto every row. In-memory plants of each missing link must be refused by the same check.
const why1131 = (lib0, gate0, page0) => {
  // match CODE: full-line and trailing // comments are stripped first, so a fix kept alive only in a comment is refused
  const code = (s) => s.split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/\s\/\/\s.*$/, ''))).join('\n');
  const lib = code(lib0), gate = code(gate0), page = page0;
  const w = [];
  if (!/import \{[^}]*\bSNK_OCCL_FLUSH_SRC\b[^}]*\} from '\.\.\/\.\.\/\.\.\/tools\/render\/lib\/lighting-page\.mjs'/.test(lib)) w.push('the lib does not import SNK_OCCL_FLUSH_SRC from lighting-page.mjs');
  const b0 = lib.indexOf('export async function bootCell('), b1 = lib.indexOf('\n}\n', b0);
  const boot = b0 >= 0 && b1 > b0 ? lib.slice(b0, b1) : '';
  const iReady = boot.indexOf("'window.__test?.ready === true'"), iFlush = boot.indexOf('c.eval(SNK_OCCL_FLUSH_SRC)'), iSettle = boot.indexOf('await waitSettled(c)');
  if (!(iReady >= 0 && iFlush > iReady && iSettle > iFlush)) w.push(`bootCell does not drain between the ready wait and the settle (ready ${iReady}, flush ${iFlush}, settle ${iSettle})`);
  if (!boot.includes('bootMs: Date.now() - t0, occl }')) w.push('bootCell does not return the drain record');
  const m0 = lib.indexOf('export const MEASURE_BODY'), m1 = lib.indexOf('\n`;\n', m0); // #1221: MEASURE_SRC runs this body held on the page
  const meas = m0 >= 0 && m1 > m0 ? lib.slice(m0, m1) : '';
  const iRender = meas.indexOf('__test.renderAt(0); window.__lampfade?.snapNext?.(); __test.renderAt(0);'), iCensus = meas.indexOf('const occl = (() => {');
  if (!(iRender >= 0 && iCensus > iRender)) w.push('MEASURE_SRC does not census the occlusion transport after its renders');
  else if (/\bawait\b/.test(meas.slice(iRender, iCensus))) w.push('MEASURE_SRC awaits between its renders and the occlusion census');
  if (!(meas.includes('prog.getAttributes()') && meas.includes('at.aOccl') && meas.includes("getAttribute('aOccl')") && meas.includes('S.pending()'))) w.push('the census does not read the compiled program attributes, the geometry aOccl and the pending count');
  if (!meas.includes('fov: camera.fov }, occl,')) w.push('MEASURE_SRC does not return the occlusion census');
  if (!gate.includes('occl: bc.occl')) w.push('the gate does not carry the drain record onto its rows');
  const f0 = page.indexOf('export const SNK_OCCL_FLUSH_SRC'), f1 = page.indexOf('})()`;', f0);
  if (!(f0 >= 0 && f1 > f0 && page.slice(f0, f1).includes('window.__snkOccl.flush();'))) w.push('lighting-page.mjs SNK_OCCL_FLUSH_SRC no longer drains through window.__snkOccl.flush()');
  return w;
};
{
  const rd = (u) => fs.readFileSync(new URL(u, import.meta.url), 'utf8');
  const lib = rd('./lib/lighting-matrix.mjs'), gate = rd('./e2e-lighting-matrix.mjs'), page = rd('../../tools/render/lib/lighting-page.mjs');
  const w = why1131(lib, gate, page);
  report('static: GH-1131 the matrix drains the occlusion transport before the settle and censuses it at every render', w.length === 0, w.join('; '));
  const FLUSH = 'const occl = ready ? await c.eval(SNK_OCCL_FLUSH_SRC).catch((e) => ({ seam: null, err: String(e) })) : null;';
  const SETTLE = 'const st = ready ? await waitSettled(c) : null;';
  const RENDER = '__test.renderAt(0); window.__lampfade?.snapNext?.(); __test.renderAt(0);';
  const plants = [
    ['no drain in bootCell', lib.replace(FLUSH, 'const occl = null;'), gate, page],
    ['the drain after the settle', lib.replace(`${FLUSH}\n  ${SETTLE}`, `${SETTLE}\n  ${FLUSH}`), gate, page],
    ['the drain record not returned', lib.replace('bootMs: Date.now() - t0, occl }', 'bootMs: Date.now() - t0 }'), gate, page],
    ['no render census', lib.replace('const occl = (() => {', 'const occlX = (() => {'), gate, page],
    ['an await between the renders and the census', lib.replace(RENDER, `${RENDER} await null;`), gate, page],
    ['the census stops reading the compiled program attributes', lib.replace('prog.getAttributes()', 'prog.getUniforms()'), gate, page],
    ['the drain kept only in a comment', lib.replace(FLUSH, `const occl = null; // ${FLUSH}`), gate, page],
    ['the census not returned', lib.replace('fov: camera.fov }, occl,', 'fov: camera.fov },'), gate, page],
    ['the import dropped', lib.replace('HIDE_UI_SRC, SNK_OCCL_FLUSH_SRC }', 'HIDE_UI_SRC }'), gate, page],
    ['the gate drops the record', lib, gate.replace('occl: bc.occl', 'occlX: bc.occl'), page],
    ['the seam source no longer flushes', lib, gate, (() => { const f0 = page.indexOf('export const SNK_OCCL_FLUSH_SRC');
      return page.slice(0, f0) + page.slice(f0).replace('window.__snkOccl.flush();', 'window.__snkOccl.pending();'); })()],
  ];
  for (const [name, l, g, p] of plants) {
    const pw = why1131(l, g, p);
    report(`static: GH-1131 plant refused: ${name}`, l + g + p !== lib + gate + page && pw.length > 0, l + g + p === lib + gate + page ? 'PLANT DID NOT APPLY' : (pw.join('; ') || 'NOT REFUSED'));
  }
}

// ---- 3. STATIC: the committed gains tables
const SRC = new URL('../scene/lightingvisuals.js', import.meta.url);
const source = fs.readFileSync(SRC, 'utf8');
const tryParse = (text, name) => { try { return { g: parseGainsBlock(text, name) }; } catch (e) { return { err: e.message }; } };
{
  const { g, err } = tryParse(source, 'MATCH_GAINS');
  const why = err ?? whyBadGains(g, 'MATCH_GAINS');
  const nums = g ? Object.values(g).flatMap((r) => Object.values(r)) : [];
  report('static: the committed MATCH_GAINS holds only finite positive numbers', !why && nums.length > 0, why ?? `${Object.keys(g).length} rows, ${nums.length} gains`);
  const missing = g ? USER_TABLES.filter((t) => !g[t]) : USER_TABLES;
  report('static: MATCH_GAINS has a row for every user table', !missing.length, missing.length ? `missing ${missing.join(', ')}` : `${USER_TABLES.length} tables`);
  const block = source.match(/^export const MATCH_GAINS = Object\.freeze\(\{\n[\s\S]*?\n\}\);\n/m)?.[0];
  report('static: the writer renders the committed block byte for byte', !!g && renderGainsBlock(g) === block, '');
  const w = g ? prepareGainsWrite(source, g) : { why: 'unparsed' };
  report('static: a write of the unchanged gains is a byte-identical no-op', !w.why && w.text === source, w.why ?? '');
  const baked = tryParse(source, 'BAKED_MATCH_GAINS');
  const bw = baked.err ?? whyBadGains(baked.g, 'BAKED_MATCH_GAINS');
  report('static: the committed BAKED_MATCH_GAINS (a divisor) holds only finite positive numbers', !bw, bw ?? JSON.stringify(baked.g));
}
// in-memory plants: the same parse + check must refuse each bad literal by name
const plant = (lit) => source.replace(/(\n {2}pool_pro_9ft: Object\.freeze\(\{[^}\n]*?perimeter_ring: )[^,}\s]+/, (_, a) => a + lit);
for (const lit of ['NaN', 'Infinity', '1e400', '0', '-1.0966', 'null', 'undefined']) {
  const text = plant(lit);
  const { g, err } = tryParse(text, 'MATCH_GAINS');
  const why = err ?? whyBadGains(g, 'MATCH_GAINS');
  report(`static plant: perimeter_ring: ${lit} is refused`, text !== source && !!why && why.includes('pool_pro_9ft.perimeter_ring'), why ?? 'PASSED');
}
{
  const text = source.replace(/(\n {2}pool_pro_8ft: Object\.freeze\(\{[^\n]*)\}\),\n/, (_, a) => `${a}),\n`);
  const { err } = tryParse(text, 'MATCH_GAINS');
  report('static plant: a malformed row is a parse error, not a skipped row', text !== source && !!err && err.includes('not a row'), err ?? 'PARSED');
}
// the writer's gate (tools/render/lighting-match-solve.mjs writes only through prepareGainsWrite)
{
  const g = parseGainsBlock(source);
  for (const v of [NaN, Infinity, 0, -1]) {
    const w = prepareGainsWrite(source, { ...g, pool_pro_9ft: { ...g.pool_pro_9ft, perimeter_ring: v } });
    report(`writer: a solved gain of ${v} is refused`, !!w.why && !w.text && w.why.includes('MATCH_GAINS.pool_pro_9ft.perimeter_ring'), w.why ?? 'WROTE');
  }
  const w = prepareGainsWrite(source, { ...g, pool_pro_9ft: { ...g.pool_pro_9ft, perimeter_ring: 1.2345 } });
  const back = w.text ? parseGainsBlock(w.text) : null;
  report('writer: a finite positive gain is written and parses back', !w.why && back?.pool_pro_9ft?.perimeter_ring === 1.2345, w.why ?? '');
}

// ---- 4. STATIC: the committed census bars (GH-996 C1)
{
  const why = whyBadBars(BARS, USER_TABLES);
  report('static: the committed census bars partition the user tables (bars in (0, 1], integer disc counts)', why === null, why ?? `${USER_TABLES.length} tables`);
  const SIGNED = { other: { '0.6': 0.07, 1: 0.07, 1.4: 0.10 }, snooker: { '0.6': 0.09, 1: 0.09, 1.4: 0.15 } };
  const drift = Object.entries(SIGNED).flatMap(([cls, bs]) => Object.entries(bs).filter(([k, v]) => BARS.classes?.[cls]?.bars?.[k] !== v)
    .map(([k, v]) => `${cls} b ${k}: ${BARS.classes?.[cls]?.bars?.[k]} != ${v}`));
  const extraKeys = Object.entries(BARS.classes).flatMap(([cls, c]) => Object.keys(c.bars).filter((k) => !(k in (SIGNED[cls] ?? {}))).map((k) => `${cls} b ${k}`));
  report('static: the bars are the owner-signed card-45 values (option A, snooker included)', !drift.length && !extraKeys.length && Object.keys(BARS.classes).length === 2,
    [...drift, ...extraKeys].join('; '));
  const snk = USER_TABLES.filter((t) => GAME_FOR[t] === 'snooker');
  report('static: the snooker class is exactly the snooker-game tables', JSON.stringify(BARS.classes.snooker?.tables) === JSON.stringify(snk), JSON.stringify(BARS.classes.snooker?.tables));
  // the card's rule on the measured data: every bar keeps at least one disc pixel over the class's measured maximum
  const margin = Object.entries(BARS.classes).flatMap(([cls, c]) => Object.entries(c.bars).map(([k, bar]) => {
    const m = BARS.measured_max?.[cls]?.[k];
    if (!Array.isArray(m) || m.length !== 3) return `${cls} b ${k}: no measured maximum`;
    const [kk, n, cell] = m, t = String(cell).split('|')[1];
    if (!Number.isInteger(kk) || kk < 0 || BARS.disc_px[t] !== n || !c.tables.includes(t)) return `${cls} b ${k}: measured ${JSON.stringify(m)} is not a ${cls} cell's pixel count`;
    return bar >= (kk + 1) / n ? null : `${cls} b ${k}: bar ${bar} < (${kk} + 1) / ${n}`;
  })).filter(Boolean);
  report('static: every bar keeps >= 1 disc pixel over the measured maximum (the card rule)', !margin.length, margin.join('; '));
}
// in-memory plants: whyBadBars must refuse each bad fixture by name
const plantBars = (f) => { const c = JSON.parse(JSON.stringify(BARS)); f(c); return c; };
for (const [name, fixture, want] of [
  ['a missing user table', plantBars((c) => { c.classes.other.tables = c.classes.other.tables.filter((t) => t !== 'pool_pro_7ft'); }), 'missing pool_pro_7ft'],
  ['a non-user table', plantBars((c) => { c.classes.other.tables.push('pool_pro_9ft_measured'); }), 'extra pool_pro_9ft_measured'],
  ['a table in two classes', plantBars((c) => { c.classes.snooker.tables.push('pool_pro_9ft'); }), 'is in two classes'],
  ['a bar of null', plantBars((c) => { c.classes.other.bars['1'] = null; }), 'C1 bars other b 1 = null is not in (0, 1]'],
  ['a bar of 0', plantBars((c) => { c.classes.other.bars['1'] = 0; }), 'C1 bars other b 1 = 0 is not in (0, 1]'],
  ['a bar of -0.1', plantBars((c) => { c.classes.snooker.bars['1.4'] = -0.1; }), 'C1 bars snooker b 1.4 = -0.1 is not in (0, 1]'],
  ['a bar of 1.5', plantBars((c) => { c.classes.snooker.bars['0.6'] = 1.5; }), 'C1 bars snooker b 0.6 = 1.5 is not in (0, 1]'],
  ['a bar of "0.07"', plantBars((c) => { c.classes.other.bars['0.6'] = '0.07'; }), 'C1 bars other b 0.6 = "0.07" is not in (0, 1]'],
  ['a bar of NaN', (() => { const c = plantBars(() => {}); c.classes.other.bars['1.4'] = NaN; return c; })(), 'C1 bars other b 1.4 = NaN is not in (0, 1]'],
  ['a class without the b 1.4 bar', plantBars((c) => { delete c.classes.other.bars['1.4']; }), 'brightness keys'],
  ['a non-integer disc count', plantBars((c) => { c.disc_px.pool_pro_8ft = 351.5; }), 'C1 bars disc_px.pool_pro_8ft 351.5 is not an integer'],
  ['a missing disc count', plantBars((c) => { delete c.disc_px.umb_carom_284; }), 'C1 bars disc_px.umb_carom_284=undefined'],
  ['another schema', plantBars((c) => { c.schema = 'lighting-census-bars/0'; }), 'C1 bars schema "lighting-census-bars/0"'],
]) {
  const why = whyBadBars(fixture, USER_TABLES);
  report(`static plant: census bars with ${name} are refused`, !!why && why.includes(want), why ?? 'ACCEPTED');
}

console.log(`LIGHTING-JUDGE SELFTEST ${bad ? 'FAIL' : 'PASS'} (${total - bad}/${total})`);
process.exit(bad ? 1 : 0);
