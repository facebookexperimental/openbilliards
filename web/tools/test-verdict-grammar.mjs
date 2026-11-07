// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-verdict-grammar.mjs — #1194: the ONE verdict grammar run-gate's ledger reads (lib/verdict-grammar.mjs), judged
// against lines from a census of every run-gate suite's PASS/FAIL formats. Plain node, no browser.
//
//   G1    every line of fixtures/verdict-grammar/census-lines.json gets the class the grammar is meant to give it:
//         the census's verbatim pass / fail examples from every run-gate suite (home paths scrubbed), one line of every
//         'LABEL: <verdict word> …' shape found in the gate ledger's logs of those suites and e2e-share, e2e-share's
//         other verdict forms, and prose from the census's pitfalls. A 'none' row carries its why — verdict-shaped prose
//         ('terminal BOOT FAILED honest: …' is a passing arm, never a failure), or a census form the grammar
//         deliberately does not read (a label holding ': ', 'LABEL: PASS — text')
//   G2    those lines cover at least 45 run-gate suites
//   L<n>  each whole-log case (fixtures/verdict-grammar/logs.json) gets its countArms and failArms, and where given its
//         ledger fields: retried runs (the final attempt counts, every attempt names; a retry cut short by a signal),
//         uncaught crashes (named once, 'uncaught: <class>: <message>' (#1210); a relayed one is not; L27 is #1210's
//         e2e-userboot replay: ten counted arms and its one crash), a summary's own count against an arm line's detail
//         number (a count-bearing summary is its count, never one more arm: '(0 arms)' reads 0), failures with no
//         FAIL word, failure names, e2e-share's 'LABEL: PASS (qualifier)' arms and the FAIL half of that form
//   S1    { summaryArm: false } (run-gate's rule for a suite in ARMS_REV): no suite summary is an arm, so N OK lines and
//         a count-less summary read N, as N OK lines and '(N arms)' do
//   R1    run-gate reads the arm fields through this module and writes arms_v3 / failArms_v3 (source pins)
//
//   node web/tools/test-verdict-grammar.mjs      # exit 0/1; last line VERDICT-GRAMMAR SELFTEST PASS (n) / FAIL (k of n: ids)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countArms, failArms, ledgerArmFields, verdictOf } from './lib/verdict-grammar.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures', 'verdict-grammar');
const J = JSON.stringify;
const rows = [];
const row = (id, ok, desc, detail = '') => { rows.push({ id, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${desc}${ok ? '' : `: ${String(detail).slice(0, 600)}`}`); };

const census = JSON.parse(fs.readFileSync(path.join(FIX, 'census-lines.json'), 'utf8')).rows;
const bad = census.filter((r) => { const v = verdictOf(r.line); return (v ? v.kind : 'none') !== r.want; });
row('G1', census.length >= 200 && bad.length === 0,
  `all ${census.length} census lines get their class (${census.filter((r) => r.want === 'pass').length} pass, ${census.filter((r) => r.want === 'fail').length} fail, ${census.filter((r) => r.want === 'none').length} none)`,
  bad.slice(0, 5).map((r) => `[${r.suite}] want ${r.want} got ${verdictOf(r.line)?.kind ?? 'none'}: ${r.line.slice(0, 120)}`).join(' | '));
row('G2', new Set(census.map((r) => r.suite)).size >= 45, 'the census lines cover the run-gate suites', `${new Set(census.map((r) => r.suite)).size} suites`);

for (const c of JSON.parse(fs.readFileSync(path.join(FIX, 'logs.json'), 'utf8')).cases) {
  const text = c.lines.join('\n');
  const got = { arms: countArms(text), failArms: failArms(text), ...(c.ledger ? { ledger: { result: c.ledger.result, ...ledgerArmFields(text, c.ledger.result) } } : {}) };
  const want = { arms: c.arms, failArms: c.failArms, ...(c.ledger ? { ledger: c.ledger } : {}) };
  row(c.id, J(got) === J(want), c.what, `got ${J(got)} want ${J(want)}`);
}

{
  // e2e-replays before and after its summary carried a count (#1194 follow-up): the same 2 OK lines
  const before = '0 OK: a\n1 OK: b\nE2E-REPLAYS: PASS'; const after = '0 OK: a\n1 OK: b\nE2E-REPLAYS: PASS (2 arms)';
  const got = [countArms(before), countArms(before, { summaryArm: false }), countArms(after), countArms(after, { summaryArm: false }),
    countArms('E2E-REPLAYS: PASS', { summaryArm: false }), ledgerArmFields(before, 'green', { summaryArm: false }).arms_v3];
  row('S1', J(got) === J([3, 2, 2, 2, 0, 2]), "{ summaryArm: false }: 2 OK lines and a count-less summary read 2, as 2 OK lines and '(2 arms)' do; the summary alone reads 0", J(got));
}
const RG = fs.readFileSync(path.join(HERE, 'run-gate.mjs'), 'utf8');
row('R1', RG.includes("from './lib/verdict-grammar.mjs'") && !/export function (countArms|failArms)\(/.test(RG)
  && /arms_v3: arms, failArms_v3: failed, \.\.\.\(armsRevOf\(identity\.suiteBase\) \? \{ armsRev: armsRevOf\(identity\.suiteBase\) \} : \{\}\)/.test(RG)
  && /ledgerArmFields\(logText, result, armOpts\(identity\.suiteBase\)\)/.test(RG)
  && (RG.match(/Number\.isFinite\(e\.arms_v3\)/g) ?? []).length >= 3 && !/Number\.isFinite\(e\.arms(?:_v2)?\)/.test(RG),
  'run-gate reads the arm fields through this module only, writes arms_v3 / failArms_v3, and compares arms_v3 alone (source pins)');

const failed = rows.filter((r) => !r.ok);
console.log(failed.length ? `VERDICT-GRAMMAR SELFTEST FAIL (${failed.length} of ${rows.length}: ${failed.map((r) => r.id).join(', ')})` : `VERDICT-GRAMMAR SELFTEST PASS (${rows.length})`);
process.exit(failed.length ? 1 : 0);
