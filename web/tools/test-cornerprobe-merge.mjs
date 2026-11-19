// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-cornerprobe-merge.mjs — node arm for lib/cornerprobe.mjs's split (GH-248 class: one evaluate per corner, merged).
// The suites' parity checks run on green trees (zero fails, carom has no open-bay exemptions), so the merge paths a red
// snooker day depends on are pinned here on synthetic parts, built the way PROBE_SRC builds its result:
//   * counts sum (probes, failCount, exempts) and exemptByCorner merges in corner order;
//   * fails keep sweep order and the single call's 40 cap — an early corner with 40+ fails fills the list, a corner
//     straddling the cap contributes exactly the remainder;
//   * bays must agree across parts (a disagreement is a fail put first, never dropped); bays null stays null;
//   * an invalid part makes the whole result invalid (the judge reports "no verdict");
//   * runCornerProbe issues one corner per evaluate in CORNERS order with poses [], then the poses with corners [], and
//     the corner key leads each expression (a CDP deadline cuts the label to 120 characters).
// Plain node, no browser, no wasm.   node web/tools/test-cornerprobe-merge.mjs   (exit 1 on any failed check)
import { CORNERS, mergeCornerProbe, runCornerProbe } from './lib/cornerprobe.mjs';

let fails = 0, checks = 0;
const check = (name, ok, got) => { checks++; if (!ok) { fails++; console.log(`FAIL ${name}${got !== undefined ? ' — got ' + JSON.stringify(got).slice(0, 300) : ''}`); } };
const fail = (corner, i) => ({ tag: `${corner} az${i} el8`, o: [0, 0.1, 0], t: [1, 0.03, 0.5], why: 'non-table', p: [1, -0.5, 2] });
const part = (corner, { probes = 1458, failN = 0, recorded = Math.min(failN, 40), exempts = 0, bays = null } = {}) => ({
  probes, failCount: failN, fails: Array.from({ length: recorded }, (_, i) => fail(corner, i)), exempts,
  exemptByCorner: exempts ? { [corner]: exempts } : {}, bays,
});
const BAYS = { '-x-z': { cup: [-1.7, -0.86, 0.04], open: true, stations: [] }, '+x+z': { cup: [1.7, 0.86, 0.04], open: true, stations: [] } };

check('CORNERS is the sweep order', JSON.stringify(CORNERS) === JSON.stringify(['-x-z', '-x+z', '+x-z', '+x+z']), CORNERS);
{ // counts + exempt map
  const m = mergeCornerProbe(CORNERS.map((c, i) => part(c, { exempts: 464, failN: i, bays: BAYS })));
  check('probes sum', m.probes === 4 * 1458, m.probes);
  check('failCount sums every part', m.failCount === 0 + 1 + 2 + 3, m.failCount);
  check('exempts sum', m.exempts === 4 * 464, m.exempts);
  check('exemptByCorner merges in corner order', JSON.stringify(m.exemptByCorner) === JSON.stringify({ '-x-z': 464, '-x+z': 464, '+x-z': 464, '+x+z': 464 }), m.exemptByCorner);
  check('bays carried', JSON.stringify(m.bays) === JSON.stringify(BAYS), m.bays);
  check('result key order matches PROBE_SRC', JSON.stringify(Object.keys(m)) === JSON.stringify(['probes', 'failCount', 'fails', 'exempts', 'exemptByCorner', 'bays']), Object.keys(m));
  check('fails in sweep order', JSON.stringify(m.fails.map((f) => f.tag.split(' ')[0])) === JSON.stringify(['-x+z', '+x-z', '+x-z', '+x+z', '+x+z', '+x+z']), m.fails.map((f) => f.tag));
}
{ // the 40 cap: an early corner with 55 fails (40 recorded) fills the list
  const m = mergeCornerProbe([part('-x-z', { failN: 55 }), part('-x+z', { failN: 3 }), part('+x-z'), part('+x+z', { failN: 1 })]);
  check('cap: 40 kept, all from the first corner, failCount 59', m.fails.length === 40 && m.fails.every((f) => f.tag.startsWith('-x-z ')) && m.failCount === 59, [m.fails.length, m.failCount]);
}
{ // a corner straddling the cap contributes exactly the remainder
  const m = mergeCornerProbe([part('-x-z', { failN: 30 }), part('-x+z', { failN: 25 }), part('+x-z'), part('+x+z')]);
  const tags = m.fails.map((f) => f.tag.split(' ')[0]);
  check('straddle: 30 then the first 10 of the next corner', m.fails.length === 40 && tags.filter((t) => t === '-x-z').length === 30 && tags.slice(30).every((t) => t === '-x+z') && m.fails[30].tag === '-x+z az0 el8', tags.slice(28, 32));
}
{ // bays disagreement is a fail, first, and survives the cap
  const other = { ...BAYS, '+x+z': { ...BAYS['+x+z'], open: false } };
  const m = mergeCornerProbe([part('-x-z', { failN: 45, bays: BAYS }), part('-x+z', { bays: BAYS }), part('+x-z', { bays: other }), part('+x+z', { bays: BAYS })]);
  check('bays differ: counted, listed first, cap kept', m.failCount === 46 && m.fails[0].why === 'bays differ between the per-corner evaluates' && m.fails.length === 40, [m.failCount, m.fails[0], m.fails.length]);
}
{ // null bays (no openBay) stay null and agree
  const m = mergeCornerProbe(CORNERS.map((c) => part(c)));
  check('bays null: no split fail', m.bays === null && m.failCount === 0 && m.fails.length === 0, m);
}
{ // an invalid part invalidates the result
  check('a null part -> null', mergeCornerProbe([part('-x-z'), null, part('+x-z'), part('+x+z')]) === null);
  const bad = { error: 'boom' };
  check('a non-verdict part is returned as is', mergeCornerProbe([part('-x-z'), bad, part('+x-z'), part('+x+z')]) === bad);
}
{ // runCornerProbe: the evaluates it issues
  const exprs = [];
  const evalFn = async (e) => { exprs.push(e); const spec = JSON.parse(e.slice('window.__obCornerProbe('.length, -1)); return part(spec.corners[0] ?? 'poses', { probes: spec.corners.length ? 1458 : spec.poses.length }); };
  const poses = [{ tag: 'owner-high-pxpz', o: [0.9, 0.2, 1.1], t: [1.5, 0.05, 0.77] }];
  const parts = [];
  const m = await runCornerProbe(evalFn, { L: 2.84, W: 1.42, CW: 0.05, FW: 0.135, topPin: true, strict: true, poses }, { onPart: (k) => parts.push(k) });
  const specs = exprs.map((e) => JSON.parse(e.slice('window.__obCornerProbe('.length, -1)));
  check('one evaluate per corner in CORNERS order, then the poses', JSON.stringify(specs.map((s) => s.corners)) === JSON.stringify([['-x-z'], ['-x+z'], ['+x-z'], ['+x+z'], []]), specs.map((s) => s.corners));
  check('corner parts carry no poses; the poses part carries them all', specs.slice(0, 4).every((s) => Array.isArray(s.poses) && s.poses.length === 0) && JSON.stringify(specs[4].poses) === JSON.stringify(poses));
  check('every part keeps the rest of the spec', specs.every((s) => s.L === 2.84 && s.W === 1.42 && s.CW === 0.05 && s.FW === 0.135 && s.topPin === true && s.strict === true));
  check('the corner key leads each expression (survives a 120-char cut)', exprs.slice(0, 4).every((e, i) => e.slice(0, 120).includes(`"corners":["${CORNERS[i]}"]`)), exprs[0].slice(0, 120));
  check('onPart told per evaluate', JSON.stringify(parts) === JSON.stringify([...CORNERS, 'poses']), parts);
  check('merged probes = corners + poses', m.probes === 4 * 1458 + 1, m.probes);
  const exprs2 = []; const parts2 = [];
  await runCornerProbe(async (e) => { exprs2.push(e); return part('x'); }, { L: 3.569, W: 1.778, CW: 0.047625, FW: 0.0935, topPin: false, openBay: { geom: 'wpbsa_snooker_12ft' } }, { onPart: (k) => parts2.push(k) });
  check('no poses -> no poses evaluate (snooker)', exprs2.length === 4 && JSON.stringify(parts2) === JSON.stringify(CORNERS), parts2);
  check('the snooker corner key survives the 120-char cut too', exprs2.every((e, i) => e.slice(0, 120).includes(`"corners":["${CORNERS[i]}"]`)), exprs2[3].slice(0, 120));
}

console.log(fails ? `CORNERPROBE-MERGE TEST FAIL (${fails} of ${checks})` : `CORNERPROBE-MERGE TEST PASS (${checks} checks)`);
process.exit(fails ? 1 : 0);
