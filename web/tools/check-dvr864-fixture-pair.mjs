// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-dvr864-fixture-pair.mjs — GH-864 (DVR live schedule), DESIGN-864 ruling 1: the savePlan pin's
// before/after export fixture pair for one late-drop record (the byte diff quoted, replays identical, the
// positive control on both), with the OQ4 provenance of each arm's run (run id, export tree, the launchd
// wrapper receipt). Plain node: no browser, no suite, no cdp.mjs. It compares bytes and never plans.
//
// The late-drop record is segment 1 of the two-record witness plan: main pins its trim endT at durs[1]
// (ANCHOR below), the fix at segEndSec(1, 0) = completions[1] (FIXED), and the export renders segment 1 in
// 313 frames against 386. The control session's pin sits at segEndSec(1, 0) = durs[1] on both trees.
//
// Modes:
//   node web/tools/check-dvr864-fixture-pair.mjs
//       the check over the committed pair (fixtures/dvr864/export-before.json and export-after.json next to
//       this file). Each row prints 'ok   <name>: ...' or 'FAIL <name>: ...'; the last line is
//       'DVR864-FIXTURE PAIR OK (7 rows)' (exit 0) or 'DVR864-FIXTURE PAIR FAIL (<k> of 7 rows red)' (exit 1).
//       Row 1 without its anchor prints 'ANCHOR MISSING — INVALID' and exits 1; no later row runs.
//   node web/tools/check-dvr864-fixture-pair.mjs --extract <dir>/readings-864.json
//       --states <dir>/control-states-864.json --tree <source sha> --source-tree <source tree>
//       --run-dir <abs run dir> --out web/tools/fixtures/dvr864/export-{before,after}.json
//       writes one arm's fixture (schema dvr864-export-fixture/1) from its dump and its run directory.
//       Every refusal prints 'EXTRACT INVALID: <what>' and exits 1; nothing is written unless every field
//       is present.
//   node web/tools/check-dvr864-fixture-pair.mjs --selftest
//       the five plants on in-memory copies of the COMMITTED pair: 'DVR864-FIXTURE SELFTEST PASS (5 plants)'.
//       With either committed file absent it prints 'SELFTEST INVALID: committed pair missing' and exits 1;
//       it never falls back to a synthetic pair.
//   node web/tools/check-dvr864-fixture-pair.mjs --selftest-synthetic
//       the same five plants on an explicitly synthetic, witness-shaped pair built in memory:
//       'DVR864-FIXTURE SELFTEST PASS (5 plants, synthetic)'. It reads nothing under fixtures/ and writes
//       nothing, so the plants stay runnable without the committed pair.
// A plant turns its own row red or the selftest fails; a plant whose anchor is absent from the copy prints
// 'PLANT ANCHOR MISSING <name> — INVALID' and fails the selftest. A malformed command line prints
// '[dvr864-fixture] REFUSED — <why>' and exits 2.
//
// The fixture document (one per arm): schema, tree (the source commit, the --tree value; recorded, never
// compared), sourceTree (the source commit's tree, the --source-tree value), witnessPlanJson
// (readings.l6.planJson), witnessSegments (readings.l6.res.segments), controlPlanJson
// (readings.ctrl.trim.planJson), controlStatesSha256 ({ empty, beat, trim }: the sha256 of
// JSON.stringify(states[k].fields) from control-states-864.json) and provenance ({ runId, band,
// exportCommit, exportTree, exportEnd, launchdReceipt, launchdEnd }, each copied verbatim from the arm's run
// directory by the patterns in PROV_RULES / provenanceFromRunDir). No field records a filesystem path. The
// provenance fields are excluded from every byte compare (rows 2-5) and judged only by row 6, which compares
// exportTree with sourceTree; the fixture's tree and the exportEnd tree are compared with nothing.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const TAG = '[dvr864-fixture]';
const SCHEMA = 'dvr864-export-fixture/1';
const READINGS_SCHEMA = 'dvr864-readings/1';
const STATES_SCHEMA = 'dvr864-control-states/1';
const BAND = '9490-9519';
const ANCHOR = '"endT":2.749541361494376';
const FIXED = '"endT":3.963942325313526';
const CONTROL_PIN = '"endT":1.8104935650783585';
const CONTROL_PIN_PLANT = '"endT":1.8104935650783586';
const SEGMENTS = { before: [341, 313], after: [341, 386] };
const ARMS = ['before', 'after'];
const STATE_KEYS = ['empty', 'beat', 'trim'];
const FIXTURE_FIELDS = ['schema', 'tree', 'sourceTree', 'witnessPlanJson', 'witnessSegments', 'controlPlanJson',
  'controlStatesSha256', 'provenance'];
const PROV_FIELDS = ['runId', 'band', 'exportCommit', 'exportTree', 'exportEnd', 'launchdReceipt', 'launchdEnd'];
const ROWS = 7;
const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
// a committed value must be exactly what the extract pattern takes from the run directory
const PROV_RULES = {
  runId: /^run-\d{8}T\d{6}Z$/,
  band: /^9490-9519$/,
  exportCommit: SHA40,
  exportTree: SHA40,
  exportEnd: /^export at END: tree [0-9a-f]{40} porcelain 0$/,
  launchdReceipt: /^\S+ lj [a-z0-9-]+ RECEIPT job pid \d+ pri 31 \(want 31\)$/,
  launchdEnd: /^\S+ lj [a-z0-9-]+ end after \d+s rc \d+$/,
};
const PAIR_FILES = {
  before: { url: new URL('./fixtures/dvr864/export-before.json', import.meta.url), rel: 'web/tools/fixtures/dvr864/export-before.json' },
  after: { url: new URL('./fixtures/dvr864/export-after.json', import.meta.url), rel: 'web/tools/fixtures/dvr864/export-after.json' },
};

const str = (x) => (typeof x === 'string' ? x : null);
const count = (hay, needle) => (typeof hay === 'string' ? hay.split(needle).length - 1 : 0);
const clone = (o) => JSON.parse(JSON.stringify(o));
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const shown = (x) => (typeof x === 'string' && x ? x : '(missing)');
function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return n;
}

// ------------------------------------------------------------------ provenance
function provenanceLine(arm, x) {
  const p = x && typeof x.provenance === 'object' && x.provenance ? x.provenance : {};
  return `${arm} provenance runId ${shown(p.runId)} band ${shown(p.band)} commit ${shown(p.exportCommit)}`
    + ` tree ${shown(p.exportTree)} source ${shown(x?.tree)} sourceTree ${shown(x?.sourceTree)}`
    + ` | ${shown(p.exportEnd)} | ${shown(p.launchdReceipt)} | ${shown(p.launchdEnd)}`;
}
// row 6 for one arm: the seven fields and sourceTree by their patterns, then exportTree against sourceTree
function provenanceFaults(arm, x) {
  const out = [];
  const p = x && typeof x.provenance === 'object' && x.provenance ? x.provenance : {};
  for (const f of PROV_FIELDS) if (typeof p[f] !== 'string' || !PROV_RULES[f].test(p[f])) out.push(`${arm}.${f} missing`);
  const srcOk = typeof x?.sourceTree === 'string' && SHA40.test(x.sourceTree);
  if (!srcOk) out.push(`${arm}.sourceTree missing`);
  if (srcOk && typeof p.exportTree === 'string' && SHA40.test(p.exportTree) && p.exportTree !== x.sourceTree) {
    out.push(`${arm} exportTree is not the source tree`);
  }
  return out;
}
// the extract's patterns over a run directory: each must match exactly one line
function provenanceFromRunDir(dir) {
  const prov = {};
  const missing = [];
  const notes = [];
  const one = (text, re) => {
    const m = [...text.matchAll(re)];
    return m.length === 1 ? m[0] : null;
  };
  const runId = path.basename(path.resolve(dir));
  if (/^run-\d{8}T\d{6}Z$/.test(runId)) prov.runId = runId;
  else { missing.push('runId'); notes.push(`run dir basename ${JSON.stringify(runId)} is not run-<YYYYMMDD>T<HHMMSS>Z`); }
  prov.band = BAND;
  let steps = null;
  try { steps = fs.readFileSync(path.join(dir, 'steps.txt'), 'utf8'); } catch (e) { notes.push(`steps.txt unreadable (${e.code || e.message})`); }
  if (steps !== null) {
    const starts = steps.split('\n').filter((l) => l.startsWith('START '));
    const m = starts.length === 1 ? one(starts[0], / commit ([0-9a-f]{40}) tree ([0-9a-f]{40}) /g) : null;
    if (m) { prov.exportCommit = m[1]; prov.exportTree = m[2]; }
    else {
      missing.push('exportCommit', 'exportTree');
      notes.push(`steps.txt: ${starts.length} START line(s) (want 1)${starts.length === 1 ? ', no single " commit <sha> tree <sha> " on it' : ''}`);
    }
    const end = one(steps, /^export at END: tree [0-9a-f]{40} porcelain 0$/gm);
    if (end) prov.exportEnd = end[0];
    else { missing.push('exportEnd'); notes.push('steps.txt: no single "export at END: tree <sha> porcelain 0" line'); }
  } else {
    missing.push('exportCommit', 'exportTree', 'exportEnd');
  }
  let names = [];
  try { names = fs.readdirSync(dir).sort(); } catch (e) { notes.push(`run dir unreadable (${e.code || e.message})`); }
  const lj = names.filter((n) => /^lj-[a-z0-9-]+\.txt$/.test(n)).filter((n) => {
    try { return fs.lstatSync(path.join(dir, n)).isFile(); } catch { return false; }
  });
  let ljText = null;
  if (lj.length === 1) {
    try { ljText = fs.readFileSync(path.join(dir, lj[0]), 'utf8'); } catch (e) { notes.push(`${lj[0]} unreadable (${e.code || e.message})`); }
  } else {
    notes.push(`run dir: ${lj.length} regular lj-*.txt file(s) (want 1)${lj.length ? `: ${lj.join(', ')}` : ''}`);
  }
  if (ljText !== null) {
    const rec = one(ljText, /^\S+ lj [a-z0-9-]+ RECEIPT job pid \d+ pri 31 \(want 31\)$/gm);
    if (rec) prov.launchdReceipt = rec[0];
    else { missing.push('launchdReceipt'); notes.push(`${lj[0]}: no single "<UTC> lj <tag> RECEIPT job pid <n> pri 31 (want 31)" line`); }
    const end = one(ljText, /^\S+ lj [a-z0-9-]+ end after \d+s rc \d+/gm);
    if (end) prov.launchdEnd = end[0];
    else { missing.push('launchdEnd'); notes.push(`${lj[0]}: no single "<UTC> lj <tag> end after <n>s rc <rc>" line`); }
  } else {
    missing.push('launchdReceipt', 'launchdEnd');
  }
  return { prov, missing, notes };
}

// ------------------------------------------------------------------ the check (rows 1-7)
function checkPair(pair) {
  const lines = [];
  const before = pair?.before ?? null;
  const after = pair?.after ?? null;
  let red = 0;
  const row = (name, fails, okText, extra = []) => {
    if (fails.length) { red++; for (const f of fails) lines.push(`FAIL ${name}: ${f}`); }
    else lines.push(`ok   ${name}: ${okText}`);
    lines.push(...extra);
  };
  // 1. the anchor, exactly once in the before witness plan; anything else is INVALID, not a row verdict
  const wb = str(before?.witnessPlanJson);
  const nAnchor = count(wb, ANCHOR);
  if (nAnchor !== 1) {
    lines.push(`     ${ANCHOR} occurs ${nAnchor} time(s) in before.witnessPlanJson (want 1)`);
    lines.push('ANCHOR MISSING — INVALID');
    return { lines, ok: false, invalid: true, red: 0 };
  }
  const off = wb.indexOf(ANCHOR);
  row('anchor', [], `${ANCHOR} once in before.witnessPlanJson`);
  // 2. the whole witness byte diff is that one number
  const want = wb.slice(0, off) + FIXED + wb.slice(off + ANCHOR.length);
  const wa = str(after?.witnessPlanJson);
  if (wa === want) {
    row('witness byte diff', [], `before with ${ANCHOR} -> ${FIXED} is after, byte for byte (${wa.length} chars)`, [`@${off} -${ANCHOR} +${FIXED}`]);
  } else {
    row('witness byte diff', ['not the one endT number'], '', [wa === null ? '     after.witnessPlanJson missing'
      : `     first difference at ${firstDiff(want, wa)} (before with the one number replaced: ${want.length} chars; after: ${wa.length} chars)`]);
  }
  // 3. records byte-equal: a replay is derived from the records, so replays from either output play identically
  {
    const fails = [];
    const recs = {};
    for (const arm of ARMS) {
      let p = null;
      try { p = JSON.parse(str(pair?.[arm]?.witnessPlanJson)); } catch { fails.push(`${arm} witnessPlanJson does not parse`); continue; }
      if (!p || !Array.isArray(p.records)) { fails.push(`${arm} witness plan carries no records array`); continue; }
      if (p.records.length !== 2) fails.push(`${arm} has ${p.records.length} records (want 2)`);
      recs[arm] = p.records;
    }
    if (recs.before && recs.after) {
      const n = Math.max(recs.before.length, recs.after.length);
      for (let i = 0; i < n; i++) {
        const b = recs.before[i], a = recs.after[i];
        if (typeof b !== 'string' || typeof a !== 'string') fails.push(`record ${i} is not a string on both`);
        else if (b !== a) fails.push(`record ${i} differs`);
      }
    }
    row('records byte-equal', fails, fails.length ? '' : `2 records, identical strings (${recs.before.map((r) => r.length).join(', ')} chars)`);
  }
  // 4. the export window: segment 1 in 313 frames before, 386 after
  {
    const fails = [];
    for (const arm of ARMS) {
      const s = pair?.[arm]?.witnessSegments;
      if (JSON.stringify(s) !== JSON.stringify(SEGMENTS[arm])) fails.push(`${arm} ${JSON.stringify(s ?? null)} (want ${JSON.stringify(SEGMENTS[arm])})`);
    }
    row('witness segments', fails, `before ${JSON.stringify(SEGMENTS.before)} after ${JSON.stringify(SEGMENTS.after)}`);
  }
  // 5. the positive control on both captures
  {
    const fails = [];
    const cb = str(before?.controlPlanJson), ca = str(after?.controlPlanJson);
    if (cb === null || ca === null || cb !== ca) fails.push('control plan bytes differ');
    for (const arm of ARMS) {
      const n = count(str(pair?.[arm]?.controlPlanJson), CONTROL_PIN);
      if (n !== 1) fails.push(`${arm} control pin ${CONTROL_PIN} occurs ${n} time(s) (want 1)`);
    }
    let digestsOk = true;
    for (const arm of ARMS) {
      const d = pair?.[arm]?.controlStatesSha256;
      const keys = d && typeof d === 'object' ? Object.keys(d).sort().join(',') : '';
      if (keys !== [...STATE_KEYS].sort().join(',')) { digestsOk = false; fails.push(`${arm}.controlStatesSha256 keys [${keys}] (want ${STATE_KEYS.join(', ')})`); continue; }
      for (const k of STATE_KEYS) if (typeof d[k] !== 'string' || !SHA256.test(d[k])) { digestsOk = false; fails.push(`${arm}.controlStatesSha256.${k} missing`); }
    }
    if (digestsOk) {
      const differ = STATE_KEYS.filter((k) => before.controlStatesSha256[k] !== after.controlStatesSha256[k]);
      if (differ.length) fails.push(`control state digests differ (${differ.join(', ')})`);
    }
    row('positive control', fails, `control plan byte-identical (${cb?.length} chars), ${CONTROL_PIN} once on both, state digests equal (${STATE_KEYS.join(', ')})`);
  }
  // 6. provenance: printed from the check's own output, then judged
  lines.push(provenanceLine('before', before), provenanceLine('after', after));
  row('provenance', [...provenanceFaults('before', before), ...provenanceFaults('after', after)],
    'both arms carry the seven fields and sourceTree by the extract patterns; exportTree is the source tree on both');
  // 7. any other difference is a STOP (a design class), never a fixture edit
  {
    const fails = [];
    for (const arm of ARMS) {
      const x = pair?.[arm];
      if (!x || typeof x !== 'object') { fails.push(`${arm} is not a fixture object — STOP`); continue; }
      if (x.schema !== SCHEMA) fails.push(`${arm}.schema ${JSON.stringify(x.schema ?? null)} (want ${SCHEMA}) — STOP`);
      const extra = Object.keys(x).filter((k) => !FIXTURE_FIELDS.includes(k));
      if (extra.length) fails.push(`${arm} carries field(s) outside the schema: ${extra.join(', ')} — STOP`);
      const p = x.provenance && typeof x.provenance === 'object' ? x.provenance : {};
      const pextra = Object.keys(p).filter((k) => !PROV_FIELDS.includes(k));
      if (pextra.length) fails.push(`${arm}.provenance carries field(s) outside the seven: ${pextra.join(', ')} — STOP`);
    }
    row('other difference', fails, `none (schema ${SCHEMA}; no field outside the rows above on either arm)`);
  }
  const ok = red === 0;
  lines.push(ok ? `DVR864-FIXTURE PAIR OK (${ROWS} rows)` : `DVR864-FIXTURE PAIR FAIL (${red} of ${ROWS} rows red)`);
  return { lines, ok, invalid: false, red };
}

// ------------------------------------------------------------------ the five plants
function recordOneNeedle(x) {
  try {
    const r = JSON.parse(x.witnessPlanJson).records;
    return Array.isArray(r) && r.length > 1 ? JSON.stringify(r[1]) : null;
  } catch { return null; }
}
const firstDigit = (s) => s.search(/[0-9]/);
const flipDigit = (d) => (d === '9' ? '8' : String(Number(d) + 1));
const PLANTS = [
  { name: 'F-P1', title: 'endT unreverted', expect: 'FAIL witness byte diff: not the one endT number',
    anchorText: 'after.witnessPlanJson',
    anchor: (p) => (typeof p.after?.witnessPlanJson === 'string' ? 1 : 0),
    edit: (p) => { p.after.witnessPlanJson = p.before.witnessPlanJson; } },
  { name: 'F-P2', title: 'records drift', expect: 'FAIL records byte-equal: record 1 differs',
    anchorText: 'one digit inside records[1] of after.witnessPlanJson',
    anchor: (p) => {
      const needle = p.after ? recordOneNeedle(p.after) : null;
      return needle === null || firstDigit(needle) < 0 ? 0 : count(p.after.witnessPlanJson, needle);
    },
    edit: (p) => {
      const w = p.after.witnessPlanJson;
      const needle = recordOneNeedle(p.after);
      const at = w.indexOf(needle), j = firstDigit(needle);
      const planted = needle.slice(0, j) + flipDigit(needle[j]) + needle.slice(j + 1);
      p.after.witnessPlanJson = w.slice(0, at) + planted + w.slice(at + needle.length);
    } },
  { name: 'F-P3', title: 'control drift', expect: 'FAIL positive control: control plan bytes differ',
    anchorText: `${CONTROL_PIN} in after.controlPlanJson`,
    anchor: (p) => count(p.after?.controlPlanJson, CONTROL_PIN),
    edit: (p) => {
      const c = p.after.controlPlanJson, at = c.indexOf(CONTROL_PIN);
      p.after.controlPlanJson = c.slice(0, at) + CONTROL_PIN_PLANT + c.slice(at + CONTROL_PIN.length);
    } },
  { name: 'F-P4', title: 'anchor missing', expect: 'ANCHOR MISSING — INVALID', invalid: true,
    anchorText: `${ANCHOR} in before.witnessPlanJson`,
    anchor: (p) => count(p.before?.witnessPlanJson, ANCHOR),
    edit: (p) => {
      const w = p.before.witnessPlanJson, at = w.indexOf(ANCHOR);
      p.before.witnessPlanJson = w.slice(0, at) + w.slice(at + ANCHOR.length);
    } },
  { name: 'F-P5', title: 'provenance missing', expect: 'FAIL provenance: after.launchdReceipt missing',
    anchorText: 'after.provenance.launchdReceipt',
    anchor: (p) => (p.after?.provenance && Object.prototype.hasOwnProperty.call(p.after.provenance, 'launchdReceipt') ? 1 : 0),
    edit: (p) => { delete p.after.provenance.launchdReceipt; } },
];

function selftest(pair, label) {
  const base = checkPair(clone(pair));
  if (!base.ok) {
    for (const l of base.lines) console.log(l);
    console.log(`SELFTEST INVALID: the unplanted ${label} pair is not green, so no plant can certify its row`);
    return 1;
  }
  console.log(`baseline (${label} pair, unplanted): ${base.lines[base.lines.length - 1]}`);
  let bad = 0;
  for (const P of PLANTS) {
    const copy = clone(pair);
    const n = P.anchor(copy);
    if (n !== 1) {
      bad++;
      console.log(`PLANT ANCHOR MISSING ${P.name} — INVALID`);
      console.log(`     anchor count ${n} (want 1): ${P.anchorText}`);
      continue;
    }
    const pre = JSON.stringify(copy);
    P.edit(copy);
    if (JSON.stringify(copy) === pre) {
      bad++;
      console.log(`PLANT DID NOT FIRE ${P.name} — INVALID (the copy is unchanged)`);
      continue;
    }
    const r = checkPair(copy);
    const red = r.lines.includes(P.expect) && !r.ok && r.invalid === Boolean(P.invalid);
    if (red) console.log(`plant ${P.name} ${P.title}: ${P.expect} — RED (as required)`);
    else {
      bad++;
      const got = r.lines.filter((l) => l.startsWith('FAIL ') || l.endsWith('— INVALID'));
      console.log(`plant ${P.name} ${P.title}: NOT RED — ${JSON.stringify(P.expect)} not printed (printed: ${got.length ? got.join(' / ') : r.lines[r.lines.length - 1]})`);
    }
  }
  const tail = label === 'synthetic' ? `${PLANTS.length} plants, synthetic` : `${PLANTS.length} plants`;
  console.log(bad ? `DVR864-FIXTURE SELFTEST FAIL (${bad} of ${tail})` : `DVR864-FIXTURE SELFTEST PASS (${tail})`);
  return bad ? 1 : 0;
}

// the explicitly synthetic, witness-shaped pair (in memory only): the main-run pins, identical records, the
// main-run segments, and provenance shaped like the probe run's, labelled synthetic by its zero run stamp and
// zero UTC stamps (the probe's commit, tree, END line and wrapper lines otherwise verbatim)
function syntheticPair() {
  const records = [
    JSON.stringify({ kernel_version: 'synthetic', format_version: 1, shots: [{ v0: 2.5, phi: 91.25, theta: 0 }] }),
    JSON.stringify({ kernel_version: 'synthetic', format_version: 1, shots: [{ v0: 3.75, phi: 177.5, theta: 0 }] }),
  ];
  const opts = (endT) => ({ tier: 'synthetic', trims: [{ startT: 0, endT: null }, { startT: 0, endT }], leads: [0, 0], fades: [] });
  const witness = (endT) => JSON.stringify({ records, opts: opts(endT) });
  const controlRecords = [records[1], records[0]];
  const controlPlanJson = JSON.stringify({ records: controlRecords, opts: opts(1.8104935650783585) });
  const fields = {
    empty: { state: '{"synthetic":"empty"}', plan: JSON.stringify({ records: controlRecords, opts: opts(null) }) },
    beat: { state: '{"synthetic":"beat"}', plan: controlPlanJson, walkSpec: 'null', bracket: '[0,0]' },
    trim: { state: '{"synthetic":"trim"}', plan: controlPlanJson },
  };
  const controlStatesSha256 = Object.fromEntries(STATE_KEYS.map((k) => [k, sha256(JSON.stringify(fields[k]))]));
  const provenance = {
    runId: 'run-00000000T000000Z',
    band: BAND,
    exportCommit: 'b9827bd281224dc700ed827efbbf2f353ff0d011',
    exportTree: '43ee287767c3e44d07c7f6fd42d53f3ac5b22b08',
    exportEnd: 'export at END: tree 43ee287767c3e44d07c7f6fd42d53f3ac5b22b08 porcelain 0',
    launchdReceipt: '0000-00-00T00:00:00Z lj dvr RECEIPT job pid 63529 pri 31 (want 31)',
    launchdEnd: '0000-00-00T00:00:00Z lj dvr end after 117s rc 0',
  };
  const fixture = (endT, segments) => ({
    schema: SCHEMA,
    tree: '0e6b7a335a31f73ffecff523dae99d22db5abb68',
    sourceTree: '43ee287767c3e44d07c7f6fd42d53f3ac5b22b08',
    witnessPlanJson: witness(endT),
    witnessSegments: segments,
    controlPlanJson,
    controlStatesSha256: { ...controlStatesSha256 },
    provenance: { ...provenance },
  });
  return { before: fixture(2.749541361494376, SEGMENTS.before), after: fixture(3.963942325313526, SEGMENTS.after) };
}

// ------------------------------------------------------------------ the committed pair
function readCommittedPair() {
  const missing = ARMS.filter((arm) => !fs.existsSync(PAIR_FILES[arm].url));
  if (missing.length) return { missing };
  const pair = {};
  for (const arm of ARMS) {
    try { pair[arm] = JSON.parse(fs.readFileSync(PAIR_FILES[arm].url, 'utf8')); } catch (e) {
      return { unreadable: `${PAIR_FILES[arm].rel} (${String((e && e.message) || e).split('\n')[0]})` };
    }
  }
  return { pair };
}

// ------------------------------------------------------------------ --extract
function readJson(file, what, bad) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    bad.push(`${what} unreadable (${String((e && e.message) || e).split('\n')[0]})`);
    return null;
  }
}
function runExtract(opts) {
  const bad = [];
  const need = (flag) => {
    const v = opts.get(flag);
    if (!v) bad.push(`${flag} missing`);
    return v || null;
  };
  const readingsPath = opts.get('--extract') || null;
  if (!readingsPath) bad.push('--extract <readings-864.json> missing');
  const statesPath = need('--states');
  // --tree is recorded as given (no refusal): no step compares the source commit with anything
  const tree = opts.get('--tree') || null;
  const sourceTree = opts.get('--source-tree') || null;
  const sourceOk = sourceTree !== null && SHA40.test(sourceTree);
  if (!sourceOk) bad.push('--source-tree missing');
  const runDir = need('--run-dir');
  const out = need('--out');
  const readings = readingsPath ? readJson(readingsPath, 'readings', bad) : null;
  const states = statesPath ? readJson(statesPath, 'states', bad) : null;
  if (readings && readings.schema !== READINGS_SCHEMA) bad.push(`readings schema ${JSON.stringify(readings.schema ?? null)} (want ${READINGS_SCHEMA})`);
  if (states && states.schema !== STATES_SCHEMA) bad.push(`states schema ${JSON.stringify(states.schema ?? null)} (want ${STATES_SCHEMA})`);
  const R = readings?.readings ?? null;
  const witnessPlanJson = str(R?.l6?.planJson);
  const segs = R?.l6?.res?.segments;
  const witnessSegments = Array.isArray(segs) && segs.length && segs.every(Number.isFinite) ? segs : null;
  const controlPlanJson = str(R?.ctrl?.trim?.planJson);
  if (readings) {
    if (!witnessPlanJson) bad.push('witnessPlanJson missing');
    if (!witnessSegments) bad.push('witnessSegments missing');
    if (!controlPlanJson) bad.push('controlPlanJson missing');
  }
  const controlStatesSha256 = {};
  if (states) {
    for (const k of STATE_KEYS) {
      const f = states.states?.[k]?.fields;
      if (f === null || f === undefined || typeof f !== 'object') bad.push(`controlStatesSha256.${k} missing`);
      else controlStatesSha256[k] = sha256(JSON.stringify(f));
    }
  }
  let notes = [];
  let prov = null;
  if (runDir) {
    const r = provenanceFromRunDir(runDir);
    prov = r.prov;
    notes = r.notes;
    for (const f of r.missing) bad.push(`provenance.${f} missing`);
    if (sourceOk && typeof prov.exportTree === 'string' && prov.exportTree !== sourceTree) {
      bad.push('provenance.exportTree is not the source tree');
      notes.push(`exportTree ${prov.exportTree} vs --source-tree ${sourceTree}`);
    }
  }
  if (!bad.length) {
    const doc = {
      schema: SCHEMA, tree, sourceTree, witnessPlanJson, witnessSegments, controlPlanJson, controlStatesSha256,
      provenance: Object.fromEntries(PROV_FIELDS.map((f) => [f, prov[f]])),
    };
    // the written document must satisfy row 6's own judgement of one arm
    for (const f of provenanceFaults('extract', doc)) bad.push(`provenance: ${f}`);
    if (!bad.length) {
      const text = `${JSON.stringify(doc, null, 2)}\n`;
      console.log(`extract witnessPlanJson ${witnessPlanJson.length} chars (${ANCHOR} x${count(witnessPlanJson, ANCHOR)}, ${FIXED} x${count(witnessPlanJson, FIXED)});`
        + ` witnessSegments ${JSON.stringify(witnessSegments)}; controlPlanJson ${controlPlanJson.length} chars (${CONTROL_PIN} x${count(controlPlanJson, CONTROL_PIN)})`);
      console.log(`extract controlStatesSha256 ${STATE_KEYS.map((k) => `${k} ${controlStatesSha256[k]}`).join(' ')}`);
      console.log(provenanceLine('extract', doc));
      try {
        fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
        const tmp = `${out}.partial-${process.pid}`;
        fs.writeFileSync(tmp, text);
        fs.renameSync(tmp, out);
      } catch (e) {
        console.log(`EXTRACT INVALID: --out not written (${String((e && e.message) || e).split('\n')[0]})`);
        return 1;
      }
      console.log(`EXTRACT OK: wrote ${out} (${Buffer.byteLength(text)} bytes)`);
      return 0;
    }
  }
  for (const b of bad) console.log(`EXTRACT INVALID: ${b}`);
  for (const n of notes) console.log(`     ${n}`);
  return 1;
}

// ------------------------------------------------------------------ command line
const VALUE_FLAGS = new Set(['--extract', '--states', '--tree', '--source-tree', '--run-dir', '--out']);
const MODE_FLAGS = new Set(['--selftest', '--selftest-synthetic']);
function parseArgs(argv) {
  const opts = new Map();
  const errs = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.startsWith('--') ? a.indexOf('=') : -1;
    const flag = eq > 0 ? a.slice(0, eq) : a;
    if (opts.has(flag)) { errs.push(`${flag} given twice`); continue; }
    if (MODE_FLAGS.has(flag)) {
      if (eq > 0) errs.push(`${flag} takes no value`);
      else opts.set(flag, true);
    } else if (VALUE_FLAGS.has(flag)) {
      let v;
      if (eq > 0) v = a.slice(eq + 1);
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) v = argv[++i];
      // a blank or trailing value is kept as '' so the extract names the flag as missing
      opts.set(flag, v === undefined || !v.trim() ? '' : v);
    } else {
      errs.push(`unknown argument ${JSON.stringify(a)}`);
    }
  }
  const modes = ['--extract', ...MODE_FLAGS].filter((f) => opts.has(f));
  if (modes.length > 1) errs.push(`one mode at a time (given ${modes.join(', ')})`);
  if (!opts.has('--extract')) {
    const stray = [...VALUE_FLAGS].filter((f) => f !== '--extract' && opts.has(f));
    if (stray.length) errs.push(`${stray.join(', ')} belong(s) to --extract`);
  }
  return { opts, errs };
}

function main() {
  const { opts, errs } = parseArgs(process.argv.slice(2));
  if (errs.length) {
    for (const e of errs) console.error(`${TAG} REFUSED — ${e}`);
    return 2;
  }
  if (opts.has('--extract')) return runExtract(opts);
  if (opts.has('--selftest-synthetic')) return selftest(syntheticPair(), 'synthetic');
  const got = readCommittedPair();
  if (opts.has('--selftest')) {
    if (got.missing) { console.log('SELFTEST INVALID: committed pair missing'); return 1; }
    if (got.unreadable) { console.log(`SELFTEST INVALID: committed pair unreadable: ${got.unreadable}`); return 1; }
    return selftest(got.pair, 'committed');
  }
  if (got.missing) {
    console.log(`DVR864-FIXTURE PAIR INVALID: committed pair missing (${got.missing.map((arm) => PAIR_FILES[arm].rel).join(', ')})`);
    return 1;
  }
  if (got.unreadable) { console.log(`DVR864-FIXTURE PAIR INVALID: committed pair unreadable: ${got.unreadable}`); return 1; }
  console.log(`DVR864-FIXTURE check: ${PAIR_FILES.before.rel} vs ${PAIR_FILES.after.rel}`);
  const r = checkPair(got.pair);
  for (const l of r.lines) console.log(l);
  return r.ok ? 0 : 1;
}

process.exitCode = main();
