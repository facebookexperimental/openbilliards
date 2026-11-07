// Copyright (c) Meta Platforms, Inc. and affiliates.

// verdict-grammar.mjs — #1194: ONE verdict grammar for run-gate's ledger. countArms() and failArms() read the
// same classification of each log line (verdictLines), built from a census of every run-gate suite's PASS and FAIL
// formats (48 suites). A line is a verdict only at the VERDICT POSITION, so prose that merely contains a verdict word
// never counts, and a passing arm whose NAME holds FAILED ('terminal BOOT FAILED honest: …') is never a failure. Pure
// functions, no side effects: run-gate imports them, and tests import this module directly.
//
// Scope:
//   - an e2e-retry log is split into attempts at the wrapper's retry banner ('E2E-RETRY: attempt N <class> — retrying
//     …', printed before the next attempt starts). The final attempt runs to the end of the log, so a suite's last
//     lines that land after the wrapper's 'E2E-RETRY: attempt N … rows=…' report (stdout and stderr interleave) and an
//     attempt cut short by a signal (no report at all) still count. countArms reads the FINAL attempt (the run that
//     decided the verdict, never counted twice); failArms reads every attempt in order (a red names what failed, also
//     when its last attempt died without a word);
//   - the wrapper's own lines ('E2E-RETRY:', 'E2E-RETRY-SUMMARY', 'e2e-retry:', and its closing 'E2E-X RED: …' /
//     'E2E-X FLAKE: …' verdict) and run-gate's '[run-gate]' lines are never verdicts.
// A line is classified by its FIRST verdict word only (a word: not glued to a letter, digit, '_', '-' or '=', nor
// after a '.'); only a line's first 4000 characters are read:
//   - count line      'TAG: N OK / M RED (…)'                       pass when M is 0, else a failure named TAG
//   - failure phrase  '… failure(s) in this arm — OK line withheld (X OK)', '<leg>: N failure(s) so far — …',
//                     '<leg>: N failure(s) — done line withheld', '<arm>: N failure line(s) above', 'E2E-X: N failure(s)',
//                     'N FAILURES'
//   - suite summary   'E2E-X PASS (…)', 'E2E-X: ALL PASS', 'E2E-X: all arms PASS', '[tag] HARNESS-X PASS (…)',
//                     'e2e-x: PASS', 'ALL PASS'; 'E2E-X FAIL', 'E2E-X: FAILED', '[tag] X FAIL (n failing …)', 'E2E-X SLOW'
//   - lead            '[tag] PASS name', 'PASS  name', 'ok: name', 'not ok: name', '  OK   [page] …', 'FAIL: key: …',
//                     '[tag] WATCHDOG: …', '[tag] SLOW: …' (unnamed); 'ok: false,' is a property dump, never a verdict
//   - subject         'LABEL OK: …', 'LABEL OK (qualifier): …', 'LABEL ok', 'LABEL: OK', '  - LABEL: green',
//                     'LABEL: PASS (qualifier)', 'LABEL: FAIL (qualifier)', 'E2E-X FAIL: name', 'LABEL FAILED — why',
//                     'LABEL RED (n …)', 'E2E-X: LABEL red (n)', 'MATRIX OK cell …', 'MATRIX OUT cell …', 'TAG CRASH: …'
//     LABEL holds a letter or digit and no ': ' (so 'P-STALE-DICT 1024 ja: … boot ok (…' is prose). The word after it
//     ends the line or is followed by ':', ' (qualifier)' or ' — ' — or, for PASS / OK / ok / FAIL / FAILED / OUT, by
//     anything at all when LABEL is one upper-case tag (MATRIX, ENV, E2E-X). After 'LABEL:' the word ends the line, or
//     is PASS / FAIL followed by ' (qualifier)' ('[e2e-share] CP MALFORMED ARM: PASS (garbage/… ignored with a warn; …)').
//     A failure is named by its text after the word; after an arm LABEL (not a tag), by the label and that text;
//     'LABEL RED (…)' and 'LABEL red (n)' by the label. A text that opens with a count ('(3 failing …)', 'N/M in
//     range', 'N failure') makes it a summary, which names no arm.
//   - SKIP, SKIPPED, SOFT-SKIP, INVALID, UNJUDGEABLE, REFUSED, INFO, NOTE, FLAKE, KNOWN-RED: never a verdict
// An uncaught error — a column-0 '<Name>Error: msg' or '<Name>Exception [Kind]: msg', '    at …' frames within 40 lines
// of it and a 'Node.js vNN' line after them, and no verdict after that block in its attempt — is one failure, named
// 'uncaught: <class>: <message>' (#1210: the name says it was a crash, and which class: 'uncaught: Error: …',
// 'uncaught: DOMException [TimeoutError]: …').

const VERDICT_WORD = /(?<![-\w=.])(not ok|PASS|OK|ok|FAIL(?:ED)?|RED|red|OUT|CRASH|green|WATCHDOG|SLOW|SKIP(?:PED)?|SOFT-SKIP|INVALID|UNJUDGEABLE|REFUSED|INFO|NOTE|FLAKE)(?![-\w=])/;
const PASS_WORDS = new Set(['PASS', 'OK', 'ok', 'green']);
const FAIL_WORDS = new Set(['FAIL', 'FAILED', 'RED', 'red', 'OUT', 'CRASH', 'WATCHDOG', 'not ok']);
const ANY_TAIL_WORDS = new Set(['PASS', 'OK', 'ok', 'FAIL', 'FAILED', 'OUT']); // after one upper-case tag, any text may follow
const TAG = String.raw`\[[^\]]*\]`; // a leading [tag] ('[e2e-aimhud]', '[Z2 S2p v0 2.5 (control)]')
const SUITE_TAG = String.raw`(?:E2E-[A-Z0-9-]+(?: [A-Z]+)?|e2e-[a-z0-9-]+|[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+)`;
const UPPER_TAG = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;
const LEAD = new RegExp(String.raw`^\s*(?:- )?(?:${TAG}\s+)?$`);
const SUBJECT = new RegExp(String.raw`^(\s*(?:- )?(?:${TAG}\s+)?(?:E2E-[A-Z0-9-]+: )?)(.+?) $`);
const SUMMARY_PASS = new RegExp(String.raw`^\s*(?:${TAG} )?(?:${SUITE_TAG}:? (?:ALL |all arms )?|ALL )PASS\b`);
const SUMMARY_FAIL = new RegExp(String.raw`^\s*(?:${TAG} )?${SUITE_TAG}:? (?:FAIL(?:ED)?|SLOW)(?: \((?:\d[^)]*)\).*)?$`);
const HARVEST = /^\s*(?:\[[^\]]*\] )?E2E-[A-Z0-9-]+(?: [A-Z]+)?:? (?:ALL )?PASS\b[^(]*\((\d+)\s/; // a summary's own arm count
const COUNT_LINE = new RegExp(String.raw`^\s*(?:${TAG} )?([A-Z][A-Z0-9-]+): \d+ OK / (\d+) RED\b`);
const WITHHELD_NAMED = /failure\(s\) in this arm — OK line withheld \((.+?) OK(?: \([^)]*\))?\)/;
const WITHHELD_ARM = /failure\(s\) in arm (\S+) — OK line withheld/;
const FAILURE_PHRASE = new RegExp(String.raw`^\s*(?:${TAG} )?(.+?): (?:\d+ )?failure(?: line)?\(s\)(?:$| (?:so far|in the block|in this arm|above)\b| — )`);
const SUMMARY_NAME = /^(?:\(\d+(?:\/\d+)?(?:[ ;,][^)]*)?\)|\d+(?:\/\d+)? in range\b|\d+ failure)/;
const UNCAUGHT = /^((?:[A-Z][A-Za-z]*)?(?:Error|Exception)(?: \[[A-Za-z_]+\])?): (.+)$/;
const WRAPPER = /^(?:E2E-RETRY[:-]|e2e-retry:|\[run-gate\] |E2E-[A-Z0-9-]+ (?:RED|FLAKE): )/;
const REPORT = /^E2E-RETRY: attempt \d+ \S+ rows=\d+/; // printed after an attempt ends
const BANNER = /^E2E-RETRY: attempt \d+ /; // any other attempt line: the retry banner, printed before the next attempt

const nameOf = (s) => {
  let n = s.replace(/^[:\s]+/, '').split(/: \{| \{/)[0].trimEnd();
  while (n.endsWith('—')) n = n.slice(0, -1).trimEnd();
  return n.slice(0, 120);
};

/** the log's attempts, in order: one array of lines per e2e-retry attempt (one attempt when the run was not wrapped,
 * or was not retried), the last one running to the end of the log; wrapper and run-gate lines dropped */
export function attemptsOf(logText) {
  const out = [[]];
  for (const l of logText.split(/\r?\n/)) {
    if (BANNER.test(l) && !REPORT.test(l)) out.push([]);
    else if (!WRAPPER.test(l)) out[out.length - 1].push(l);
  }
  return out;
}

/** one line's verdict: null, or { kind: 'pass' | 'fail', name?: string, summary?: true, count?: number } */
export function verdictOf(line) {
  const l = (line.length > 4000 ? line.slice(0, 4000) : line).trimEnd();
  if (!l.trim()) return null;
  const c = COUNT_LINE.exec(l);
  if (c) return Number(c[2]) === 0 ? { kind: 'pass' } : { kind: 'fail', name: c[1] };
  const wn = WITHHELD_NAMED.exec(l);
  if (wn) return { kind: 'fail', name: nameOf(wn[1]) };
  const wa = WITHHELD_ARM.exec(l);
  if (wa) return { kind: 'fail', name: `arm ${wa[1]}` };
  if (/^\d+ FAILURES$/.test(l.trim())) return { kind: 'fail', summary: true };
  const f = FAILURE_PHRASE.exec(l);
  if (f) {
    const label = f[1].replace(/^E2E-[A-Z0-9-]+: /, '');
    return /^E2E-[A-Z0-9-]+$/.test(label) ? { kind: 'fail', summary: true } : { kind: 'fail', name: nameOf(label) };
  }
  if (SUMMARY_PASS.test(l)) { const h = HARVEST.exec(l); return { kind: 'pass', summary: true, ...(h ? { count: Number(h[1]) } : {}) }; }
  if (SUMMARY_FAIL.test(l)) return { kind: 'fail', summary: true };
  const m = VERDICT_WORD.exec(l);
  if (!m) return null;
  const word = m[1];
  const head = l.slice(0, m.index);
  const tail = l.slice(m.index + word.length);
  const lead = LEAD.test(head); // the word opens the line, after indentation, a list mark and one [tag]
  if (word === 'SLOW') return lead && tail.startsWith(':') ? { kind: 'fail', summary: true } : null; // '[tag] SLOW: …' is red
  if (!PASS_WORDS.has(word) && !FAIL_WORDS.has(word)) return null; // SKIP, INVALID, UNJUDGEABLE, …: never a verdict
  const pass = PASS_WORDS.has(word);
  if (lead) {
    if (!/^(?:$|[\s:])/.test(tail) || word === 'green' || word === 'red' || word === 'OUT' || word === 'CRASH') return null;
    if ((word === 'ok' || word === 'OK') && /^:\s*(?:true|false)\b/.test(tail)) return null; // 'ok: false,': a property dump
    if (pass) return { kind: 'pass' };
    const name = nameOf(word === 'WATCHDOG' ? `WATCHDOG${tail}` : tail);
    return !name || SUMMARY_NAME.test(name) ? { kind: 'fail', summary: true } : { kind: 'fail', name };
  }
  const sm = SUBJECT.exec(head); // '[tag] ' and 'E2E-X: ' may precede the LABEL
  if (!sm) return null;
  let label = sm[2];
  const endsLine = tail === '';
  if (label.endsWith(':')) { // 'LABEL: OK' at the line end; 'LABEL: PASS (qualifier)' / 'LABEL: FAIL (qualifier)'
    if (!endsLine && !((word === 'PASS' || word === 'FAIL') && tail.startsWith(' ('))) return null;
    label = label.slice(0, -1);
  }
  if (!/[A-Za-z0-9]/.test(label) || label.includes(': ')) return null;
  const tagLabel = UPPER_TAG.test(label); // MATRIX, ENV, E2E-X, DVR864, D1
  if (word === 'green' && !(endsLine && head.endsWith(': '))) return null;
  if (word === 'red' && !/^ \(\d+\)$/.test(tail)) return null;
  if ((word === 'OUT' || word === 'CRASH') && !tagLabel) return null;
  if (word === 'WATCHDOG' || word === 'not ok') return null;
  const shaped = endsLine || /^(?::(?: |$)| \((?:[^()]|\([^()]*\))*\)(?:$|:| —| \S)| — )/.test(tail);
  if (!shaped && !(tagLabel && ANY_TAIL_WORDS.has(word))) return null;
  if (pass) return { kind: 'pass' };
  if (word === 'RED' || word === 'red') return { kind: 'fail', name: nameOf(label) };
  const said = nameOf(tail);
  const name = tagLabel ? said : nameOf(`${label}${tail}`);
  return !name || SUMMARY_NAME.test(said) || /see FAIL lines above/.test(name) ? { kind: 'fail', summary: true } : { kind: 'fail', name };
}

/** every verdict of one attempt's lines, in order, with its uncaught-error failure (if any) at its place */
function verdictsOf(lines) {
  const out = lines.map((line, i) => ({ i, line, v: verdictOf(line) }));
  for (let i = 0; i < lines.length; i++) {
    const u = UNCAUGHT.exec(lines[i]);
    if (!u) continue;
    let j = i + 1;
    while (j < lines.length && !/^ {4}at /.test(lines[j]) && j - i < 40) j++;
    if (j >= lines.length || !/^ {4}at /.test(lines[j])) continue;
    let k = j;
    while (k < lines.length && !/^Node\.js v\d+/.test(lines[k]) && k - j < 80) k++;
    if (k >= lines.length || !/^Node\.js v\d+/.test(lines[k])) continue;
    if (out.slice(k + 1).some((r) => r.v)) continue; // a relayed crash: the suite went on judging after it
    out[i].v = { kind: 'fail', name: `uncaught: ${u[1]}: ${nameOf(u[2])}`.slice(0, 120), uncaught: true }; // the message's own cut, then the 120 cap
    break;
  }
  return out.filter((r) => r.v);
}

/** every verdict of the log, per attempt: [{ attempt, i, line, v }], attempts in order */
export function verdictLines(logText) {
  return attemptsOf(logText).flatMap((lines, attempt) => verdictsOf(lines).map((r) => ({ attempt, ...r })));
}

/** the arm count: passing verdicts of the final attempt, or the suite summary's own count when that is larger
 * (a count-bearing summary keeps its inventory and is never one more arm itself, so 'E2E-X PASS (0 arms)' alone reads
 * 0; arm lines never add their detail numbers). With { summaryArm: false } no suite summary is an arm, so a count-less
 * one adds nothing either: for a suite whose OK lines are its arms, its logs from before its summary carried a count
 * read as its later ones do */
export function countArms(logText, { summaryArm = true } = {}) {
  const attempts = attemptsOf(logText);
  let passes = 0;
  let claimed = 0;
  for (const { v } of verdictsOf(attempts[attempts.length - 1])) {
    if (v.kind !== 'pass') continue;
    if (v.count !== undefined) claimed = Math.max(claimed, v.count);
    else if (summaryArm || !v.summary) passes += 1;
  }
  return Math.max(passes, claimed);
}

/** the names of the arms the log failed, every attempt in order, deduped, at most `max` (summaries name no arm) */
export function failArms(logText, max = 24) {
  const out = [];
  for (const { v } of verdictLines(logText)) {
    if (v.kind === 'fail' && v.name && !out.includes(v.name) && out.length < max) out.push(v.name);
  }
  return out;
}

/** the ledger's arm fields for a finished run (#1194: versioned, so counts from an older parser are never compared with
 * these — main's arms, or the arms_v2 of this change's first round, where a count-bearing summary counted once more):
 * the arm count, and the failed arms' names — none for a green run, whose retried first attempt may have failed */
export function ledgerArmFields(logText, result, opts = {}) {
  return { arms_v3: countArms(logText, opts), failArms_v3: result === 'green' ? [] : failArms(logText) };
}
