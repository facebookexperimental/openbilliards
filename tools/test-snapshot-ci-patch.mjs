#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-snapshot-ci-patch.mjs — the public snapshot's CI workflows.
//
// scripts/opensource/sync-public-snapshot rewrites .github/workflows/ci.yml for the public tree
// (sync.apply_ci_patch): jobs that run on a self-hosted runner drop, and so do the manifest's
// CI_DROP_JOBS and, inside kept jobs, the CI_DROP_STEPS steps that cannot run there. Earlier, the
// self-hosted test was "any line of the job block mentions self-hosted", comments included, and a
// job's leading comment run was attached to the job above it: four hosted jobs (test, perf,
// ci-bands-lint, g-kernel-corpus) dropped on prose alone. This arm asserts, at --rev (default HEAD):
//   C0  the exported ci.yml carries exactly the pinned public job set, each job with exactly its
//       pinned steps (EXPECTED_PUBLIC; a step is its name, else its uses, else the first line of its
//       run, and a step with none of the three is red): any change to what the public CI runs is a
//       conscious edit here (on a mismatch the arm prints the exported set to paste after review);
//   C1  every workflow file at --rev has its pinned public fate (EXPECTED_FATE: shipped or
//       excluded), and every shipped one exports (sync.check_workflow_runners refuses an exported
//       workflow that still runs a job on a self-hosted runner);
//   C2  export_paths.py prints exactly one JSON object on stdout for the workflow files (the
//       dropped-jobs line goes to stderr);
//   C3  the exported web/app.html keeps its token-grep exemption comment (the public CI runs
//       token-grep, and the meta theme-color literal is legal only through that comment) while
//       the other HTML comments are still stripped;
//   C4  sync.main() runs the pin-drift check over the whole ship set and adds its rows to the battery
//       failures (a static check of main's body: the sync ceremony needs a public checkout);
//   C5  port-judgment exports ci.yml at the recorded last sync base under that base's own rules,
//       non-strict, without refusing; a target export with a stale CI_DROP_STEPS row still refuses;
//   K15 the step reader counts only items under a job's `steps:` key (a block-list runs-on is not steps),
//       commented job and steps headers included; K16 a self-hosted job with a commented header drops;
//   K1-K12 the patch's rules on synthetic workflows (cases below; K3b/K3c the block- and flow-mapping
//       runner forms, K6b an unsupported mapping key, K14 a non-strict historical export);
//   K13 the battery's pin-drift check (sync.check_pin_drift): a shipped file that pins the sha256
//       or blob id of a file the export changes (a header-less .rs gets the copyright header)
//       fails the sync by name, unless manifest PIN_DRIFT_ALLOW records that file with at least
//       as many drifted pins; a pinned file the export leaves byte-identical is not drift.
// --selftest then runs the arm against pipeline copies, each with one of these rules reverted, and
// requires the named assertion red:
//   P1  the old matcher (any "self-hosted" in the block) -> K1, and C1 (the real export
//       refuses: CI_DROP_STEPS then names jobs the matcher dropped)
//   P2  the old attribution (a leading comment run joins the job above) -> K5
//   P3  an unreadable runs-on read as a hosted label instead of refusing -> K6
//   P4  no needs-closure refusal -> K7
//   P5  the dropped-jobs line on stdout -> K8, C2
//   P6  CI_DROP_STEPS ignored -> K9, C0
//   P7  CI_DROP_STEPS without its 0-or-many refusal -> K10
//   P8  check_workflow_runners as a no-op -> K11
//   P9  the HTML comment strip without the exemption keep -> K12, C3
//   P10 a manifest copy missing one CI_DROP_STEPS row -> C0
//   P11 a manifest copy that ships e2e-nightly.yml -> C1
//   P12 check_pin_drift as a no-op -> K13
//   P13 a pipeline copy whose main() no longer runs the pin-drift check -> C4
//   P14 an unnamed step (ts-sdk's `- run: npm ci`) dropped from the export -> C0
//   P15 a flow-mapping runs-on read as one literal -> K3
//   P16 port-judgment exporting the base under TODAY's rules (the r1 defect) -> C5
//   P17 a non-strict export that still refuses a row matching no step -> K14
//   P16c an ISOLATED root (a git dir borrowing this repo's objects) whose real sync cursor is this tip,
//       the state a finalized sync leaves: this arm with P16's plant is red on C5 there, and the r2 arm
//       (its base read from that cursor) planted back in is green there — the fixed base is load-bearing
//   P18 the step reader without its `steps:` tracking -> K15
//   P19 the step reader without trailing-comment keys (`  job: # c`, `    steps: # c`) -> K15
//   P20 sync's job-header pattern without trailing comments -> K16
//
// Usage: node tools/test-snapshot-ci-patch.mjs [--rev <rev>] [--sync-dir <dir>] [--selftest | --port-check]
//   --port-check: C5 alone (the isolated-root P16c runs it).
// Exit 0 green, 1 red, 2 could not run. Private tree only: the public snapshot excludes
// scripts/opensource, so there the arm prints a named SKIP (positive evidence: the rev's tree lacks
// the helper) and exits 0.

import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- the pinned public CI: tools/fixtures/snapshot-ci-public.json (exported step names, the sync's
// rewrite applied; read after the public-tree SKIP below) and every workflow file's public fate ----
const PUBLIC_PIN = 'tools/fixtures/snapshot-ci-public.json';
const EXPECTED_FATE = {
  '.github/workflows/brand-gate.yml': 'shipped',
  '.github/workflows/ci.yml': 'shipped',
  '.github/workflows/e2e-nightly.yml': 'excluded',
  '.github/workflows/hillclimb.yml': 'shipped',
  '.github/workflows/ios.yml': 'shipped',
  '.github/workflows/macos.yml': 'shipped',
  '.github/workflows/pages.yml': 'shipped',
  '.github/workflows/reproduce-paper.yml': 'excluded',
  '.github/workflows/rl-research.yml': 'excluded',
  '.github/workflows/site-data.yml': 'shipped',
};

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SYNC = 'scripts/opensource/sync-public-snapshot';
const HELPER = `${SYNC}/export_paths.py`;

for (const n of readdirSync(tmpdir())) {
  const m = n.match(/^obw-ci-patch-(\d+)-/);
  if (!m) continue;
  try { process.kill(Number(m[1]), 0); } catch (e) { if (e.code === 'ESRCH') rmSync(join(tmpdir(), n), { recursive: true, force: true }); }
}
const PARENT = mkdtempSync(join(tmpdir(), `obw-ci-patch-${process.pid}-`));
process.on('exit', () => rmSync(PARENT, { recursive: true, force: true }));
const die = (why) => { process.stdout.write(`snapshot ci-patch: could not run — ${why}\n`); process.exit(2); };
const argv = process.argv.slice(2);
let revArg = 'HEAD';
let selftest = false;
let portCheck = false;   // r4: only C5 (the isolated-root P16c runs this)
let syncArg = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--selftest') selftest = true;
  else if (argv[i] === '--port-check') portCheck = true;
  else if (argv[i] === '--rev' || argv[i] === '--sync-dir') {
    const v = argv[++i];
    if (v === undefined || v.startsWith('--')) die(`${argv[i - 1]} needs a value`);
    if (argv[i - 1] === '--rev') revArg = v; else syncArg = v;
  } else die(`unknown argument '${argv[i]}'`);
}

const git = (args) => execFileSync('git', ['-C', ROOT, ...args], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
const gitText = (args) => git(args).toString('utf8').trim();
let REV;
try { REV = gitText(['rev-parse', '--verify', '--quiet', `${revArg}^{commit}`]); } catch { REV = ''; }
if (!REV) die(`--rev ${revArg} does not resolve to a commit`);
if (!gitText(['ls-tree', '--name-only', REV, '--', HELPER])) {
  process.stdout.write(`snapshot ci-patch: SKIP — ${HELPER} is not in ${REV.slice(0, 9)}'s tree `
    + `(the public snapshot excludes ${SYNC})\n`);
  process.exit(0);
}
let EXPECTED_PUBLIC;
try { EXPECTED_PUBLIC = JSON.parse(readFileSync(join(ROOT, PUBLIC_PIN), 'utf8')); } catch (e) { die(`${PUBLIC_PIN}: ${e.message}`); }
const SYNC_DIR = syncArg ? resolve(syncArg) : join(ROOT, SYNC);
for (const f of ['sync.py', 'manifest.py', 'export_paths.py']) {
  try { readFileSync(join(SYNC_DIR, f)); } catch { die(`--sync-dir ${SYNC_DIR} has no ${f}`); }
}
const WORKFLOWS = gitText(['ls-tree', '--name-only', REV, '--', '.github/workflows/']).split('\n')
  .filter((p) => /\.ya?ml$/.test(p));

// a copy of the pipeline (the *.py of the sync dir) with exact-once text edits per file
function pipelineCopy(tag, edits) {
  const d = mkdtempSync(join(PARENT, `${tag}-`));
  for (const n of readdirSync(SYNC_DIR)) if (n.endsWith('.py')) copyFileSync(join(SYNC_DIR, n), join(d, n));
  for (const [file, pairs] of Object.entries(edits)) {
    let s = readFileSync(join(d, file), 'utf8');
    for (const [a, b] of pairs) {
      if (a === null) { s += `\n${b}\n`; continue; }
      const n = s.split(a).length - 1;
      if (n !== 1) die(`plant ${tag}: '${a.slice(0, 60)}' occurs ${n} times in ${file}`);
      s = s.replace(a, b);
    }
    writeFileSync(join(d, file), s);
  }
  return d;
}

// ---- K1-K12: synthetic workflows through the pipeline's own functions -----------------------
const H = 'name: ci\non:\n  push:\njobs:\n';
const job = (name, runsOn, body = '', lead = '') => `${lead}  ${name}:\n    runs-on: ${runsOn}\n${body}    steps:\n      - run: echo ${name}\n`;
const CASES = {
  K1: { what: 'a hosted job whose own body and leading comment run mention self-hosted is KEPT',
    yml: H + job('lint', 'ubuntu-latest', '    # the self-hosted browser slot is scarce\n', '  # self-hosted runners elsewhere\n  # never decide a hosted fate\n')
      + job('e2e', '[self-hosted, ob-browser]'), keep: ['lint'], drop: ['e2e'] },
  K2: { what: 'a flow-list self-hosted runs-on drops',
    yml: H + job('e2e', '[self-hosted, ob-browser]') + job('ok', 'ubuntu-latest'), keep: ['ok'], drop: ['e2e'] },
  K3: { what: 'a block-list self-hosted runs-on drops',
    yml: `${H}  e2e:\n    runs-on:\n      - self-hosted\n      - ob-browser\n    steps:\n      - run: x\n${job('ok', 'ubuntu-latest')}`, keep: ['ok'], drop: ['e2e'] },
  K4: { what: 'a matrix runs-on resolving to self-hosted drops; a hosted matrix job is kept',
    yml: `${H}  m1:\n    strategy:\n      matrix:\n        os: \${{ github.x && fromJSON('["self-hosted", "ubuntu-latest"]') || fromJSON('["ubuntu-latest"]') }}\n    runs-on: \${{ matrix.os }}\n    steps:\n      - run: x\n`
      + '  m2:\n    strategy:\n      matrix:\n        os: [ubuntu-latest, macos-latest]\n    runs-on: ${{ matrix.os }}\n    steps:\n      - run: x\n',
    keep: ['m2'], drop: ['m1'] },
  K5: { what: 'a dropped job takes its own leading comment run; the job above keeps none of it',
    yml: H + job('a', 'ubuntu-latest') + job('b', '[self-hosted, x]', '', '  # B HEADER 1\n  # B HEADER 2\n  # B HEADER 3\n'),
    keep: ['a'], drop: ['b'], absent: 'B HEADER' },
  K6: { what: 'an unreadable runs-on refuses', yml: H + job('x', '${{ inputs.runner }}'), refuse: 'cannot read' },
  K6b: { what: 'a runner mapping with a key that is not labels or group refuses', yml: H + job('x', '{labels: [ubuntu-latest], size: big}'), refuse: 'not a label or group' },
  K3b: { what: 'a block-mapping runs-on whose labels list self-hosted drops',
    yml: `${H}  e2e:\n    runs-on:\n      group: big\n      labels:\n        - self-hosted\n        - ob-browser\n    steps:\n      - run: x\n${job('ok', 'ubuntu-latest')}`, keep: ['ok'], drop: ['e2e'] },
  K3c: { what: 'a flow-mapping runs-on with self-hosted labels drops; a hosted flow mapping is kept',
    yml: H + job('e2e', '{labels: [self-hosted, ob-browser]}') + job('ok', '{group: pool, labels: ubuntu-latest}'), keep: ['ok'], drop: ['e2e'] },
  K14: { what: 'a historical (non-strict) export skips a row written for a later ci.yml', yml: H + job('ok', 'ubuntu-latest'), steps: { ok: ['no such step'] }, strict: false, keep: ['ok'] },
  K16: { what: 'a self-hosted job whose header carries a trailing comment still drops',
    yml: `${H}${job('ok', 'ubuntu-latest')}  e2e: # a commented job header\n    runs-on: [self-hosted, ob-browser]\n    steps:\n      - run: x\n`, keep: ['ok'], absent: 'self-hosted' },
  K7: { what: 'a kept job that needs a dropped job refuses',
    yml: `${H}${job('e2e', '[self-hosted, x]')}  after:\n    needs: e2e\n    runs-on: ubuntu-latest\n    steps:\n      - run: x\n`, refuse: 'need dropped jobs' },
  K8: { what: 'the dropped-jobs line goes to stderr, never stdout', yml: H + job('e2e', '[self-hosted, x]') + job('ok', 'ubuntu-latest'), quiet: true },
  K9: { what: 'a CI_DROP_STEPS row drops its step with its comment run, and only it',
    yml: `${H}  ok:\n    runs-on: ubuntu-latest\n    steps:\n      - name: keep me\n        run: a\n      # STEP COMMENT for the dropped one\n      - name: drop me (needs history)\n        run: b\n      # next step's comment\n      - name: keep me too\n        run: c\n`,
    steps: { ok: ['drop me'] }, keepSteps: ['keep me', 'keep me too'], absent: 'STEP COMMENT', present: "next step's comment" },
  K10a: { what: 'a CI_DROP_STEPS prefix matching no step refuses', yml: H + job('ok', 'ubuntu-latest'), steps: { ok: ['no such step'] }, refuse: 'matches 0 steps' },
  K10b: { what: 'a CI_DROP_STEPS prefix matching two steps refuses',
    yml: `${H}  ok:\n    runs-on: ubuntu-latest\n    steps:\n      - name: twin a\n        run: a\n      - name: twin b\n        run: b\n`, steps: { ok: ['twin'] }, refuse: 'matches 2 steps' },
  K10c: { what: 'a CI_DROP_STEPS row naming a dropped job refuses', yml: H + job('e2e', '[self-hosted, x]') + job('ok', 'ubuntu-latest'), steps: { e2e: ['x'] }, refuse: 'dropped or absent jobs' },
};
const RUNNER_CASES = {
  K11a: { what: 'an exported workflow with a self-hosted job refuses', yml: H + job('e2e', '[self-hosted, ob-browser]'), refuse: 'self-hosted runner' },
  K11b: { what: 'a hosted-only workflow passes the runner check', yml: H + job('ok', 'ubuntu-latest') },
};
const HTML = '<!doctype html>\n<!-- private narration -->\n<meta name="theme-color" content="#050907"><!-- ob-color-exempt: resolved token -->\n<p>x</p><!-- a note that mentions ob-color-exempt later -->\n';

function runCases(syncDir) {
  const code = `
import contextlib, io, re
import sync as S, manifest as M
cases, runner, html = json.loads(sys.stdin.read())
out = {}
def jobs(t):
    i = t.find("\\njobs:\\n")
    return re.findall(r"^  ([A-Za-z0-9_-]+):\\s*$", t[i:], re.M) if i >= 0 else []
def steps(t):
    return [m.strip().strip("'\\"") for m in re.findall(r"^      - name:(.*)$", t, re.M)]
for k, c in cases.items():
    S.CI_RULES = ((), c.get("steps", {}), c.get("strict", True))
    o, e = io.StringIO(), io.StringIO()
    r = {"err": None}
    with contextlib.redirect_stdout(o), contextlib.redirect_stderr(e):
        try:
            t = S.apply_ci_patch(c["yml"])
            r.update(jobs=jobs("\\n" + t), steps=steps(t), text=t)
        except SystemExit as x:
            r["err"] = str(x)
        except Exception as x:
            r["err"] = "EXC " + type(x).__name__ + ": " + str(x)
    r.update(stdout=o.getvalue(), stderr=e.getvalue())
    out[k] = r
for k, c in runner.items():
    try:
        S.check_workflow_runners(".github/workflows/x.yml", c["yml"]); out[k] = {"err": None}
    except SystemExit as x:
        out[k] = {"err": str(x)}
S.CI_RULES = (tuple(M.CI_DROP_JOBS), dict(M.CI_DROP_STEPS), True)
S.SHIP_SET.clear(); S.EXPORT_REV = None
out["K12"] = {"text": S.rewrite(html, ".html", "web/x.html")}
import hashlib
rs = b"//! a normalizer whose bytes a fixture pins\\npub fn n() {}\\n"
hdr = ("// " + M.HEADER + "\\n\\n").encode() + rs
def pub(p, b):
    x = S.export_blob(p, b, ".rs")
    return x.encode() if isinstance(x, str) else x
def pin(b, kind):
    return hashlib.sha256(b).hexdigest() if kind == "sha256" else hashlib.sha1(b"blob %d\\0" % len(b) + b).hexdigest()
pd = {}
for tag, src, kind, allow in (("a", rs, "sha256", {}), ("b", hdr, "sha256", {}), ("c", rs, "blob", {}),
                              ("d", rs, "sha256", {"t/pin.json": (1, "x")}), ("e", rs, "sha256", {"t/pin.json": (0, "x")})):
    M.PIN_DRIFT_ALLOW = allow
    fx = ('{"pins": ["' + pin(src, kind) + '"]}').encode()
    pairs = {"t/n.rs": (src, pub("t/n.rs", src)), "t/pin.json": (fx, fx)}
    f, n = S.check_pin_drift(pairs)
    pd[tag] = {"fails": f, "notes": n, "changed": pairs["t/n.rs"][0] != pairs["t/n.rs"][1]}
out["K13"] = pd
print(json.dumps(out))
`;
  const r = spawnSync('python3', ['-I', '-c', `import sys, json; sys.path.insert(0, sys.argv[1]); ${code}`, syncDir],
    { cwd: ROOT, encoding: 'utf8', input: JSON.stringify([CASES, RUNNER_CASES, HTML]), maxBuffer: 1 << 26 });
  if (r.status !== 0) return { fatal: (r.stderr || r.stdout).trim().split('\n').slice(-3).join(' | ') };
  return JSON.parse(r.stdout);
}

function judgeCases(res) {
  const red = [];
  if (res.fatal) return [`K* the cases could not run: ${res.fatal}`];
  for (const [k, c] of Object.entries(CASES)) {
    const r = res[k];
    const tag = `${k.slice(0, 3).replace(/[a-c]$/, '')} ${c.what}`;
    if (c.refuse) {
      if (!r.err || !r.err.includes(c.refuse)) red.push(`${tag}: expected a refusal naming '${c.refuse}', got ${r.err ? `'${r.err}'` : 'an export'}`);
      continue;
    }
    if (r.err) { red.push(`${tag}: refused unexpectedly: ${r.err}`); continue; }
    for (const j of c.keep ?? []) if (!r.jobs.includes(j)) red.push(`${tag}: job ${j} was dropped`);
    for (const j of c.drop ?? []) if (r.jobs.includes(j)) red.push(`${tag}: job ${j} was kept`);
    if (c.absent && r.text.includes(c.absent)) red.push(`${tag}: '${c.absent}' survived`);
    if (c.present && !r.text.includes(c.present)) red.push(`${tag}: '${c.present}' was removed`);
    if (c.keepSteps && JSON.stringify(r.steps) !== JSON.stringify(c.keepSteps)) red.push(`${tag}: steps ${JSON.stringify(r.steps)}`);
    if (c.quiet && (r.stdout.trim() !== '' || !r.stderr.includes('dropped'))) red.push(`${tag}: stdout ${JSON.stringify(r.stdout.trim())}, stderr ${JSON.stringify(r.stderr.trim())}`);
  }
  for (const [k, c] of Object.entries(RUNNER_CASES)) {
    const r = res[k];
    if (c.refuse ? !(r.err ?? '').includes(c.refuse) : r.err) red.push(`K11 ${c.what}: ${r.err ? `'${r.err}'` : 'no refusal'}`);
  }
  const pd = res.K13;
  const pdRed = (k, why) => red.push(`K13 ${why}: ${JSON.stringify(pd[k])}`);
  if (!pd.a.changed || !pd.a.fails.some((f) => f.includes('PIN DRIFT') && f.includes('t/pin.json'))) pdRed('a', 'a pinned header-less .rs the export changes was not caught');
  if (pd.b.changed || pd.b.fails.length) pdRed('b', 'a pinned .rs that already carries the header is not drift');
  if (!pd.c.fails.some((f) => f.includes('PIN DRIFT'))) pdRed('c', 'a blob-id pin of a changed file was not caught');
  if (pd.d.fails.length) pdRed('d', 'a PIN_DRIFT_ALLOW row at its recorded count must pass');
  if (!pd.e.fails.some((f) => f.includes('PIN DRIFT'))) pdRed('e', 'more drifted pins than PIN_DRIFT_ALLOW records must fail');
  const t = res.K12.text;
  if (!t.includes('<!-- ob-color-exempt: resolved token -->') || t.includes('private narration') || t.includes('mentions ob-color-exempt later')) {
    red.push(`K12 the HTML strip keeps exactly the comments that BEGIN with ob-color-exempt: got ${JSON.stringify(t)}`);
  }
  return red;
}

// ---- C0-C3: the real workflows at --rev -----------------------------------------------------
function exportPaths(syncDir, paths) {
  const out = mkdtempSync(join(PARENT, 'export-'));
  const r = spawnSync('python3', ['-I', join(syncDir, 'export_paths.py'), '--rev', REV, '--out', out],
    { cwd: ROOT, input: paths.join('\n'), encoding: 'utf8', maxBuffer: 1 << 26 });
  return { out, status: r.status, stdout: r.stdout, stderr: r.stderr };
}
// Every step gets an identity, named or not (an unnamed `- run:` step was once invisible to the pin):
// its name, else its uses, else the first line of its run; a step with none of the three is UNSUPPORTED and red.
function stepId(lines) {
  const head = lines[0].replace(/^ {6}- /, '');
  const key = (l, k) => { const m = l.match(new RegExp(`^(?: {6}- | {8})${k}:\\s*(.*)$`)); return m ? m[1].trim() : null; };
  for (const k of ['name', 'uses']) {
    for (const l of lines) { const v = key(l, k); if (v !== null) return `${k}: ${v.replace(/^['"]|['"]$/g, '')}`; }
  }
  for (let i = 0; i < lines.length; i++) {
    const v = key(lines[i], 'run');
    if (v === null) continue;
    if (!/^[|>][-+]?$/.test(v)) return `run: ${v}`;
    const body = lines.slice(i + 1).find((l) => l.trim());
    return `run: ${body ? body.trim() : ''}`;
  }
  return `UNSUPPORTED step header: ${head}`;
}
// A step starts only inside a job's `steps:` key (a block-list runs-on's `      - label` items are not
// steps); `trackSteps: false` is the --selftest plant that drops this tracking.
function publicSet(ciText, { trackSteps = true, commentedKeys = true } = {}) {
  const tail = commentedKeys ? '\\s*(?:#.*)?$' : '\\s*$';   // r4: a key may carry a trailing YAML comment
  const JOB = new RegExp(`^ {2}([A-Za-z0-9_-]+):${tail}`);
  const STEPS = new RegExp(`^ {4}steps:${tail}`);
  const res = {};
  let jobName = null;
  let step = null;
  let inSteps = false;
  const flush = () => { if (step && jobName) res[jobName].push(stepId(step)); step = null; };
  const sec = ciText.slice(ciText.indexOf('\njobs:\n'));
  for (const l of sec.split('\n')) {
    const m = l.match(JOB);
    if (m) { flush(); jobName = m[1]; res[jobName] = []; inSteps = false; continue; }
    if (/^ {4}[A-Za-z0-9_-]+:/.test(l)) { flush(); inSteps = STEPS.test(l); continue; }
    if (/^ {6}- /.test(l) && (inSteps || !trackSteps)) { flush(); step = [l]; continue; }
    if (step && (/^ {8}/.test(l) || !l.trim())) { step.push(l); continue; }
    if (step && /^ {0,6}\S/.test(l)) flush();
  }
  flush();
  return res;
}
function judgeTree(syncDir) {
  const red = [];
  const fates = Object.fromEntries(WORKFLOWS.map((p) => [p, null]));
  const known = Object.keys(EXPECTED_FATE).sort();
  if (JSON.stringify(WORKFLOWS.slice().sort()) !== JSON.stringify(known)) {
    red.push(`C1 workflow files at ${REV.slice(0, 9)} ${JSON.stringify(WORKFLOWS)} are not the pinned set ${JSON.stringify(known)}: give the new file a public fate here`);
  }
  const ex = exportPaths(syncDir, [...WORKFLOWS, 'web/app.html']);
  if (ex.status !== 0) {
    red.push(`C1 the workflow export refused: ${(ex.stderr || ex.stdout).trim().split('\n').slice(-2).join(' | ')}`);
    return red;
  }
  let parsed;
  try {
    parsed = JSON.parse(ex.stdout);
    if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not one object');
  } catch (e) {
    red.push(`C2 export_paths.py stdout is not exactly one JSON object (${e.message}): ${JSON.stringify(ex.stdout.slice(0, 160))}`);
    return red;
  }
  for (const p of WORKFLOWS) fates[p] = parsed.excluded.includes(p) ? 'excluded' : 'shipped';
  for (const p of WORKFLOWS) if (EXPECTED_FATE[p] && fates[p] !== EXPECTED_FATE[p]) red.push(`C1 ${p} is ${fates[p]}, pinned ${EXPECTED_FATE[p]}`);
  const ciPath = '.github/workflows/ci.yml';
  const ciText = parsed.exported.includes(ciPath) ? readFileSync(join(ex.out, ciPath), 'utf8') : git(['cat-file', 'blob', `${REV}:${ciPath}`]).toString('utf8');
  const got = publicSet(ciText);
  if (JSON.stringify(got) !== JSON.stringify(EXPECTED_PUBLIC)) {
    const gj = Object.keys(got);
    const ej = Object.keys(EXPECTED_PUBLIC);
    const diff = [];
    for (const j of ej) if (!gj.includes(j)) diff.push(`job ${j} missing`);
    for (const j of gj) if (!ej.includes(j)) diff.push(`job ${j} unpinned`);
    for (const j of gj.filter((x) => ej.includes(x))) {
      const a = got[j]; const b = EXPECTED_PUBLIC[j];
      for (const s of b) if (!a.includes(s)) diff.push(`${j}: step '${s}' missing`);
      for (const s of a) if (!b.includes(s)) diff.push(`${j}: step '${s}' unpinned`);
      if (!diff.length && JSON.stringify(a) !== JSON.stringify(b)) diff.push(`${j}: step order changed`);
    }
    red.push(`C0 the public ci.yml differs from ${PUBLIC_PIN}: ${diff.slice(0, 6).join('; ')}`);
    writeFileSync(join(PARENT, 'public-ci-set.json'), `${JSON.stringify(got, null, 1)}\n`);
    if (!selftest) process.stdout.write(`snapshot ci-patch: exported set (review, then paste into the fixture):\n${JSON.stringify(got, null, 1)}\n`);
  }
  const unsupported = Object.entries(got).flatMap(([j, st]) => st.filter((x) => x.startsWith('UNSUPPORTED')).map((x) => `${j}: ${x}`));
  if (unsupported.length) red.push(`C0 the public ci.yml has step(s) with no name, uses or run: ${unsupported.slice(0, 3).join('; ')}`);
  const app = parsed.exported.includes('web/app.html') ? readFileSync(join(ex.out, 'web/app.html'), 'utf8') : '';
  const comments = app.match(/<!--[\s\S]*?-->/g) ?? [];
  const exempt = comments.filter((c) => /^<!--\s*ob-color-exempt\b/.test(c));
  const other = comments.filter((c) => !/^<!--\s*ob-color-exempt\b/.test(c) && !/generated:/.test(c) && !/Copyright|SPDX|license/i.test(c));
  if (!exempt.some((c) => app.includes(`content="#050907">${c}`))) red.push('C3 the exported web/app.html lost the token-grep exemption on its meta theme-color');
  if (other.length) red.push(`C3 the exported web/app.html kept ${other.length} other HTML comment(s): ${JSON.stringify(other[0].slice(0, 80))}`);
  return red;
}

// C5: port-judgment exports a historical base through this pipeline under that base's own rules,
// non-strict; it must not trip on rows written for today's ci.yml, while a TARGET export with a stale row still
// refuses. The base is FIXED, never the moving sync cursor (last-sync-base): 5da70a30's manifest predates
// CI_DROP_STEPS, so today's rows can never match its ci.yml and P16 (today's rules on the base) stays visible
// after every future sync.
const PORT_BASE = '5da70a307f14e5976123b31b2756b579e6d5a2d7';
function judgePort(syncDir) {
  const base = PORT_BASE;
  try { git(['cat-file', '-e', `${base}^{commit}`]); } catch { return [`C5 the fixed port base ${base.slice(0, 9)} is not in the object store (a shallow checkout?)`]; }
  const code = `
import importlib.util, os
spec = importlib.util.spec_from_file_location('pj', os.path.join(sys.argv[1], 'port-judgment.py'))
pj = importlib.util.module_from_spec(spec); spec.loader.exec_module(pj)
S, M = pj.S, pj.M
base = sys.argv[2]
out = {}
try:
    t = pj.base_export(base, '.github/workflows/ci.yml')
    out['base'] = {'ok': True, 'jobs': len(t)}
except SystemExit as x:
    out['base'] = {'ok': False, 'err': str(x)}
M.CI_DROP_STEPS = {**M.CI_DROP_STEPS, 'test': list(M.CI_DROP_STEPS.get('test', [])) + ['no such step']}
try:
    pj.target_export('HEAD', '.github/workflows/ci.yml')
    out['stale'] = {'refused': False}
except SystemExit as x:
    out['stale'] = {'refused': 'matches 0 steps' in str(x), 'err': str(x)}
print(json.dumps(out))
`;
  const r = spawnSync('python3', ['-I', '-c', `import sys, json; sys.path.insert(0, sys.argv[1]); ${code}`, syncDir, base],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) return [`C5 the port-judgment check could not run: ${(r.stderr || r.stdout).trim().split('\n').slice(-2).join(' | ')}`];
  const o = JSON.parse(r.stdout.trim().split('\n').pop());
  const red = [];
  if (!o.base.ok) red.push(`C5 port-judgment's export of ci.yml at the last sync base ${base.slice(0, 9)} refused: ${o.base.err}`);
  if (!o.stale.refused) red.push(`C5 a target export with a stale CI_DROP_STEPS row did not refuse: ${o.stale.err ?? 'exported'}`);
  return red;
}
function judgeMain(syncDir) {
  const src = readFileSync(join(syncDir, 'sync.py'), 'utf8');
  const body = src.slice(src.indexOf('\ndef main():'));
  const ok = /drift_fails, drift_notes = check_pin_drift\(ship_pairs\(public, ship, rev\)\)\n\s+fails \+= drift_fails/.test(body)
    && body.indexOf('check_pin_drift(') < body.indexOf('if fails:\n        print("BATTERY FAILURES');
  return ok ? [] : ['C4 sync.main() does not add the pin-drift rows to the battery failures before it judges them'];
}
// K15 (r3): a kept job whose runs-on is a block list (`      - label` items) yields its real steps, not runner labels
const K15_YML = 'jobs:\n  ok:\n    runs-on:\n      - ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm ci\n'
  + '      - name: build\n        run: make\n'
  + '  commented: # a job header comment (r4)\n    runs-on: ubuntu-latest\n    steps: # the steps key comment (r4)\n      - name: lint\n        run: x\n';
function judgePublicSet({ trackSteps = true, commentedKeys = true } = {}) {
  const got = publicSet(`\n${K15_YML}`, { trackSteps, commentedKeys });
  const want = { ok: ['uses: actions/checkout@v4', 'run: npm ci', 'name: build'], commented: ['name: lint'] };
  return JSON.stringify(got) === JSON.stringify(want) ? []
    : [`K15 a block-list runs-on is read as steps: ${JSON.stringify(got)}`];
}
function arm(syncDir, opts = {}) {
  return [...judgeCases(runCases(syncDir)), ...judgeTree(syncDir), ...judgeMain(syncDir), ...judgePort(syncDir), ...judgePublicSet(opts)];
}

if (portCheck) {
  const r = judgePort(SYNC_DIR);
  for (const x of r) process.stdout.write(`  RED  ${x}\n`);
  process.exit(r.length ? 1 : 0);
}
const red = arm(SYNC_DIR);
if (red.length) {
  for (const r of red) process.stdout.write(`  RED  ${r}\n`);
  process.stdout.write(`snapshot ci-patch: RED (${red.length})\n`);
  process.exit(1);
}
process.stdout.write(`snapshot ci-patch: OK at ${REV.slice(0, 9)} — ${Object.keys(EXPECTED_PUBLIC).length} public jobs, `
  + `${Object.values(EXPECTED_PUBLIC).reduce((n, s) => n + s.length, 0)} public steps, ${WORKFLOWS.length} workflow files with their pinned fate, `
  + `${Object.keys(CASES).length + Object.keys(RUNNER_CASES).length + 6} rule cases\n`);
if (!selftest) process.exit(0);

// ---- --selftest: each rule reverted in a pipeline copy must turn its assertion red -----
const PLANTS = [
  ['P1', ['K1', 'C1'], { 'sync.py': [[null, 'def ci_runs_on_labels(name, block):  # planted: the old matcher\n    return ["self-hosted"] if any("self-hosted" in b for b in block) else ["ubuntu-latest"]']] }],
  ['P2', ['K5'], { 'sync.py': [[null, '_spans_1123 = ci_job_spans\ndef ci_job_spans(lines):  # planted: the run joins the job above\n    sp = [list(s) for s in _spans_1123(lines)]\n    for s in sp:\n        s[1] = s[2] - 1 if s[2] > s[1] and lines[s[2] - 1].startswith("  #") else s[2]\n    for a, b in zip(sp, sp[1:]):\n        a[3] = b[1]\n    return [tuple(s) for s in sp]']] }],
  ['P3', ['K6'], { 'sync.py': [['raise SystemExit(f"ci.yml job {name}: runs-on {v} is an expression this patch cannot read")', 'return ["ubuntu-latest"]  # planted']] }],
  ['P4', ['K7'], { 'sync.py': [['    if orphan and strict:\n', '    if False:  # planted\n']] }],
  ['P5', ['K8', 'C2'], { 'sync.py': [['print(f"  ci.yml: dropped self-hosted jobs {dropped}", file=sys.stderr)', 'print(f"  ci.yml: dropped self-hosted jobs {dropped}")']] }],
  ['P6', ['K9', 'C0'], { 'sync.py': [['drop_steps.get(name, []), strict))', '[], strict))  # planted']] }],
  ['P7', ['K10'], { 'sync.py': [['        if len(hits) != 1:\n', '        if not hits:\n            continue\n        if False:  # planted\n']] }],
  ['P8', ['K11'], { 'sync.py': [[null, 'def check_workflow_runners(rel, text):  # planted\n    return None']] }],
  ['P9', ['K12', 'C3'], { 'sync.py': [['(?!\\s*ob-color-exempt\\b)', '']] }],
  ['P10', ['C0'], { 'manifest.py': [['        "CI port bands match web/tools/ci-bands.json",\n', '']] }],
  ['P11', ['C1'], { 'manifest.py': [['    ".github/workflows/e2e-nightly.yml",\n', '']] }],
  ['P12', ['K13'], { 'sync.py': [[null, 'def check_pin_drift(pairs):  # planted\n    return [], []']] }],
  ['P13', ['C4'], { 'sync.py': [['    fails += drift_fails\n', '    pass  # planted\n']] }],
  ['P14', ['C0'], { 'sync.py': [[null, '_patch_1123 = apply_ci_patch\ndef apply_ci_patch(text):  # planted: an unnamed step dropped\n    return _patch_1123(text).replace("      - run: npm ci\\n", "", 1)']] }],
  ['P15', ['K3'], { 'sync.py': [[null, 'def _runner_mapping(name, v):  # planted: a flow mapping read as one literal\n    return [v]']] }],
  ['P16', ['C5'], { 'port-judgment.py': [['    return pipeline(base, rel, S.hold_at(base), S.ci_rules_at(base),\n', '    return pipeline(base, rel, S.hold_at(base), (tuple(M.CI_DROP_JOBS), dict(M.CI_DROP_STEPS), True),  # planted: today\'s rules on the base\n']] }],
  ['P17', ['K14'], { 'sync.py': [['            if not strict:\n                continue\n', '']] }],
  ['P18', ['K15'], {}, { trackSteps: false }],
  ['P19', ['K15'], {}, { commentedKeys: false }],
  ['P20', ['K16'], { 'sync.py': [['CI_JOB_RX = re.compile(r"^  ([A-Za-z0-9_-]+):\\s*(?:#.*)?$")', 'CI_JOB_RX = re.compile(r"^  ([A-Za-z0-9_-]+):\\s*$")  # planted']] }],
];
let bad = 0;
for (const [name, want, edits, opts = {}] of PLANTS) {
  const reds = arm(pipelineCopy(name.toLowerCase(), edits, opts), opts);
  const tags = new Set(reds.map((r) => r.split(' ')[0].replace(/^(K\d+)[a-c]$/, '$1')));
  const missing = want.filter((w) => !tags.has(w));
  if (missing.length) { bad++; process.stdout.write(`  BAD  ${name}: expected red on ${want.join(', ')}, missing ${missing.join(', ')} (got ${[...tags].join(', ') || 'green'})\n`); }
  else process.stdout.write(`  ok   ${name}: red on ${want.join(', ')} (${reds.length} red line(s))\n`);
}
{
  // P16c (r4): an ISOLATED root whose real sync cursor (scripts/opensource/sync-public-snapshot/last-sync-base) is
  // this tip — the state a finalized sync leaves — built as a git dir that borrows this repo's objects, so the arm
  // that runs there reads the same commits. This arm, there, with P16's plant: C5 red. The r2 arm (its base read
  // from that cursor) planted back in, there, with the same plant: green — P16 turned invisible, so the fixed base
  // is what keeps it visible.
  const root = mkdtempSync(join(PARENT, 'isolated-'));
  execFileSync('git', ['init', '-q', root]);
  const objects = gitText(['rev-parse', '--path-format=absolute', '--git-common-dir']) + '/objects';
  writeFileSync(join(root, '.git', 'objects', 'info', 'alternates'), `${objects}\n`);
  execFileSync('git', ['-C', root, 'update-ref', 'refs/heads/main', REV]);
  execFileSync('git', ['-C', root, 'symbolic-ref', 'HEAD', 'refs/heads/main']);
  mkdirSync(join(root, 'tools', 'fixtures'), { recursive: true });
  mkdirSync(join(root, SYNC), { recursive: true });
  for (const n of readdirSync(SYNC_DIR)) if (n.endsWith('.py')) copyFileSync(join(SYNC_DIR, n), join(root, SYNC, n));
  writeFileSync(join(root, SYNC, 'last-sync-base'), `${REV} 6\n`);
  copyFileSync(join(ROOT, PUBLIC_PIN), join(root, PUBLIC_PIN));
  const self = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const fixed = '  const base = PORT_BASE;\n';
  if (self.split(fixed).length !== 2) die('P16c: the fixed-base line is not found exactly once in this arm');
  const r2 = self.replace(fixed, "  const base = readFileSync(join(ROOT, SYNC, 'last-sync-base'), 'utf8').trim().split(/\\s+/)[0];  // planted: the r2 cursor read\n");
  writeFileSync(join(root, 'tools', 'test-snapshot-ci-patch.mjs'), self);
  writeFileSync(join(root, 'tools', 'test-snapshot-ci-patch-r2.mjs'), r2);
  const p16 = PLANTS.find(([n]) => n === 'P16');
  const plantDir = pipelineCopy('p16c', p16[2]);
  const runAt = (script) => spawnSync('node', [join(root, 'tools', script), '--port-check', '--sync-dir', plantDir], { cwd: root, encoding: 'utf8' });
  const now = runAt('test-snapshot-ci-patch.mjs');
  const old = runAt('test-snapshot-ci-patch-r2.mjs');
  if (now.status === 1 && old.status === 0) process.stdout.write('  ok   P16c: cursor at this tip (isolated root): this arm red on C5, the r2 cursor-reading arm green\n');
  else { bad++; process.stdout.write(`  BAD  P16c: this arm rc ${now.status} (want 1), the r2 arm rc ${old.status} (want 0): ${(now.stdout + now.stderr + old.stdout + old.stderr).trim().split('\n').slice(-2).join(' | ')}\n`); }
}
if (bad) { process.stdout.write(`snapshot ci-patch --selftest: ${bad} plant(s) not caught\n`); process.exit(1); }
process.stdout.write(`snapshot ci-patch --selftest: OK (${PLANTS.length} plants)\n`);
