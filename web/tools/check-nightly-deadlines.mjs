// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-nightly-deadlines.mjs — GH-1140: every e2e-nightly step that runs run-gate passes it
// --deadline = the step's timeout-minutes x 60 - 60. The deadline is the suite's sized budget
// and the runner's step timeout sits one minute above it, so run-gate ends the suite's tree and
// frees the band on its own clock first (the minute covers the 10 s grace, the reap windows and
// the ledger, with margin). A step budget retuned without its deadline, a run-gate step with no
// budget or no deadline, a deadline in a form run-gate does not read, a repeated deadline, or a
// deadline that does not match fails here.
//
//   node web/tools/check-nightly-deadlines.mjs [workflow.yml]   # default .github/workflows/e2e-nightly.yml
//   node web/tools/check-nightly-deadlines.mjs --selftest       # the rule over fixture workflows (and the repo's file)
//
// Line-based (no YAML library in the repo): the steps are the `- ` items of every `steps:`
// list (at the indentation of the list's first item); a step ends at the next item or at a
// shallower line; its budget is the `timeout-minutes:` key one level inside it (never the
// job's, never one nested deeper). Only run-gate's OWN arguments count: the text from
// `web/tools/run-gate.mjs` to its first standalone `--` (what follows is the suite's command),
// and only the two-token form `--deadline <digits>` that run-gate parses.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT = path.join(REPO, '.github', 'workflows', 'e2e-nightly.yml');
export const TEARDOWN_ALLOWANCE_S = 60;
const DEADLINE_MAX_S = 86400; // run-gate's own bound
const GATE = 'web/tools/run-gate.mjs';

const indentOf = (l) => l.length - l.trimStart().length;
const isComment = (l) => l.trimStart().startsWith('#');

/** run-gate's own argument tokens for each invocation in a step's (comment-free, joined) text */
function gateArgs(joined) {
  const out = [];
  for (let at = joined.indexOf(GATE); at >= 0; at = joined.indexOf(GATE, at + GATE.length)) {
    const toks = joined.slice(at + GATE.length).trim().split(/\s+/);
    const end = toks.indexOf('--');
    out.push(end < 0 ? toks : toks.slice(0, end));
  }
  return out;
}

/** { steps, problems }: steps = run-gate steps checked; problems = one message per defect */
export function checkDeadlines(text) {
  const lines = text.split('\n');
  const live = (i) => lines[i].trim() !== '' && !isComment(lines[i]);
  const problems = [];
  let steps = 0;
  let attributed = 0; // run-gate lines inside a checked step
  for (let k = 0; k < lines.length; k++) {
    const km = /^(\s*)steps:\s*(?:#.*)?$/.exec(lines[k]);
    if (!km || isComment(lines[k])) continue;
    // the `steps:` list: its items sit at the indentation of its first `- ` line
    let i = k + 1;
    while (i < lines.length && !live(i)) i++;
    const first = /^(\s*)- /.exec(lines[i] ?? '');
    if (!first || first[1].length <= km[1].length) continue;
    const ind = first[1].length;
    for (let s = i; s < lines.length;) {
      if (!live(s)) { s++; continue; }
      if (indentOf(lines[s]) < ind || (indentOf(lines[s]) === ind && !/^\s*- /.test(lines[s]))) break; // the list ended
      let e = s + 1;
      while (e < lines.length && !(live(e) && (indentOf(lines[e]) < ind || (indentOf(lines[e]) === ind && /^\s*- /.test(lines[e]))))) e++;
      const body = lines.slice(s, e).filter((l) => !isComment(l));
      const gateLines = body.filter((l) => l.includes(GATE)).length;
      if (gateLines) {
        steps++;
        attributed += gateLines;
        const name = (/^\s*- name:\s*(.+)$/.exec(lines[s]) ?? [null, `at line ${s + 1}`])[1].trim();
        const where = `step '${name}' (line ${s + 1})`;
        const budget = body.map((l) => /^(\s*)timeout-minutes:\s*(\d+)/.exec(l)).find((x) => x && x[1].length === ind + 2);
        // YAML comments on key lines are not shell text; the run block's own lines are kept whole
        const joined = body.map((l) => (/^\s*[\w-]+:\s/.test(l) && !/^\s*run:/.test(l) ? l.replace(/\s#.*$/, '') : l)).join(' ');
        if (!budget) {
          problems.push(`${where}: runs run-gate but has no step-level timeout-minutes, so no deadline can be derived`);
        } else {
          const want = Number(budget[2]) * 60 - TEARDOWN_ALLOWANCE_S;
          const how = `timeout-minutes ${budget[2]} x 60 - ${TEARDOWN_ALLOWANCE_S}`;
          if (want < 1 || want > DEADLINE_MAX_S) problems.push(`${where}: ${how} = ${want} is outside run-gate's deadline range 1-${DEADLINE_MAX_S}`);
          for (const args of gateArgs(joined)) {
            const eq = args.find((t) => t.startsWith('--deadline='));
            const at = args.indexOf('--deadline');
            const count = args.filter((t) => t === '--deadline').length;
            if (count > 1) problems.push(`${where}: --deadline given ${count} times among run-gate's own arguments (run-gate refuses a repeat) — pass it once, --deadline ${want}`);
            else if (eq) problems.push(`${where}: ${eq} is not a form run-gate reads (it would become the child command) — pass --deadline ${want}`);
            else if (at < 0) problems.push(`${where}: run-gate runs with no --deadline among its own arguments (before its --); it needs --deadline ${want} (${how})`);
            else if (args[at + 1] !== String(want)) problems.push(`${where}: --deadline ${args[at + 1] ?? '(no value)'}, want ${want} (${how})`);
          }
        }
      }
      s = e;
    }
  }
  const total = lines.filter((l) => !isComment(l) && l.includes(GATE)).length;
  if (total !== attributed) problems.push(`${total - attributed} run-gate line(s) sit outside every steps: list and were not checked`);
  return { steps, problems };
}

function selftest() {
  const step = (name, budget, run, extra = []) => [`      - name: ${name}`, '        if: ${{ !cancelled() }}',
    ...(budget === null ? [] : [`        timeout-minutes: ${budget} # a comment`]), ...extra, '        run: >', ...run.map((r) => `          ${r}`)];
  const wf = (...steps) => ['jobs:', '  battery:', '    timeout-minutes: 99', '    steps:', '      - uses: actions/checkout@v4', ...steps.flat(), ''].join('\n');
  const gate = (extra) => `exec bash tools/ci-step-runner.sh node ${GATE} --no-canary --no-belt${extra} --`;
  const cases = [
    ['S1', 'matching deadlines pass; a step without run-gate needs none', wf(step('a', 7, [gate(' --deadline 360'), 'node web/tools/e2e-a.mjs']), step('b', 5, ['node web/tools/storm-baseline.mjs']), step('c', 36, [gate(' --deadline 2100'), 'node web/tools/e2e-c.mjs'])), 2, 0],
    ['S2', 'a deadline that does not match its budget fails, naming the step and the wanted value', wf(step('a', 7, [gate(' --deadline 420'), 'node web/tools/e2e-a.mjs'])), 1, 1, /step 'a' .*--deadline 420, want 360/],
    ['S3', 'a run-gate step with no --deadline fails', wf(step('a', 7, [gate(''), 'node web/tools/e2e-a.mjs'])), 1, 1, /no --deadline among its own arguments/],
    ['S4', 'a run-gate step with no step-level timeout-minutes fails', wf(step('a', null, [gate(' --deadline 360'), 'node web/tools/e2e-a.mjs'])), 1, 1, /no step-level timeout-minutes/],
    ['S5', 'a timeout-minutes nested deeper in the step (under with:) is never the step budget', wf(step('a', null, [gate(' --deadline 5880'), 'node web/tools/e2e-a.mjs'], ['        with:', '          timeout-minutes: 99'])), 1, 1, /no step-level timeout-minutes/],
    ['S6', 'a commented-out run-gate line is not an invocation', wf(step('a', 5, ['# node web/tools/run-gate.mjs --deadline 1 --', 'node web/tools/storm-baseline.mjs'])), 0, 0],
    ['S7', 'the one-token --deadline=N fails: run-gate would take it as the child command', wf(step('a', 7, [gate(' --deadline=360'), 'node web/tools/e2e-a.mjs'])), 1, 1, /--deadline=360 is not a form run-gate reads/],
    ['S8', 'a --deadline after run-gate\'s -- is the suite\'s argument, never run-gate\'s', wf(step('a', 7, [gate(''), 'node web/tools/e2e-a.mjs --deadline 360'])), 1, 1, /no --deadline among its own arguments/],
    ['S9', 'a --deadline in a YAML comment does not count', ['jobs:', '  battery:', '    steps:', '      - name: a', '        timeout-minutes: 7 # --deadline 360', '        run: >', `          ${gate('')}`, '          node web/tools/e2e-a.mjs', ''].join('\n'), 1, 1, /no --deadline among its own arguments/],
    ['S10', 'a `steps: # comment` line still opens a steps list', ['jobs:', '  battery:', '    steps: # the battery', '      - name: a', '        timeout-minutes: 7', '        run: >', `          ${gate(' --deadline 300')}`, '          node web/tools/e2e-a.mjs', ''].join('\n'), 1, 1, /--deadline 300, want 360/],
    ['S11', 'a 1-minute budget leaves no valid deadline', wf(step('a', 1, [gate(' --deadline 0'), 'node web/tools/e2e-a.mjs'])), 1, 1, /= 0 is outside run-gate's deadline range/],
    ['S12', 'a run-gate line outside every steps list is reported, never silently skipped', ['jobs:', '  battery:', '    env:', `      CMD: node ${GATE} --deadline 1 --`, '    steps:', '      - name: a', '        timeout-minutes: 5', '        run: node web/tools/storm-baseline.mjs', ''].join('\n'), 0, 1, /1 run-gate line\(s\) sit outside every steps: list/],
    ['S14', 'a repeated --deadline fails (run-gate refuses it; a lint reading only the first would pass 900 then 1800)', wf(step('a', 16, [gate(' --deadline 900 --deadline 1800'), 'node web/tools/e2e-a.mjs'])), 1, 1, /--deadline given 2 times/],
  ];
  let bad = 0;
  for (const [id, desc, text, steps, nProblems, re] of cases) {
    const r = checkDeadlines(text);
    const ok = r.steps === steps && r.problems.length === nProblems && (!re || r.problems.some((p) => re.test(p)));
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${desc}${ok ? '' : `: ${JSON.stringify(r)}`}`);
  }
  const real = checkDeadlines(fs.readFileSync(DEFAULT, 'utf8'));
  const ok = real.steps > 0 && real.problems.length === 0;
  if (!ok) bad++;
  console.log(`${ok ? 'PASS' : 'FAIL'} S13 — the repo's e2e-nightly.yml passes (${real.steps} run-gate step(s))${ok ? '' : `: ${real.problems.join(' | ')}`}`);
  console.log(bad ? `NIGHTLY-DEADLINES SELFTEST FAIL (${bad} of ${cases.length + 1})` : `NIGHTLY-DEADLINES SELFTEST PASS (${cases.length + 1})`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  if (process.argv.includes('--selftest')) selftest();
  const file = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT;
  const { steps, problems } = checkDeadlines(fs.readFileSync(file, 'utf8'));
  for (const p of problems) console.log(`FAIL ${p}`);
  if (!steps) console.log(`FAIL no run-gate step found in ${path.relative(REPO, file)}`);
  const bad = problems.length || !steps;
  console.log(bad ? `NIGHTLY-DEADLINES FAIL (${problems.length || 1} problem(s) in ${steps} run-gate step(s))` : `NIGHTLY-DEADLINES OK (${steps} run-gate steps in ${path.relative(REPO, file)})`);
  process.exit(bad ? 1 : 0);
}
