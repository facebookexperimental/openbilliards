// dialog-stale-pre-trap.mjs — TEST-ONLY fixture source for the "stale
// ui/dialog.js" pose (e2e-replays arm F1i, capture-525-replays dvrStalePass;
// contract the replays contract (feature 035, internal) §7 rows 49 / 51).
//
// GH-668 S5 replays r5 (checker P1, CI-fatal): round 4 obtained the stale
// leaf via `git show c1b78943:web/app/ui/dialog.js`. CI checkouts are SHALLOW
// (actions/checkout@v4 default depth 1) and hold no such commit, so the arm
// failed hard on the runner. ARMS NEVER READ GIT HISTORY. The pose is now
// DERIVED from the CURRENT kit leaf by a documented transform, chosen over
// an in-tree copy of the base bytes because (a) a 500-line fork of a frozen
// kit file under fixtures/ is kit code outside the kit that no gate pins and
// that drifts from the leaf it impersonates, (b) the law the arm judges is
// "a dialog.js WITHOUT the capability and WITHOUT the group stop" paired
// with a FRESH caller — deriving from the current leaf keeps every OTHER kit
// behaviour fresh (openPanel semantics, the other DIALOG_CAPS keys), so the
// arm isolates exactly the gated hunk, and (c) the transform is fail-closed:
// two content assertions + a syntax check here, and the arm's own
// in-document guards (the served leaf lacks the capability and the
// group-stop code; the leaf LOADED — openPanel ran, .ob-backdrop present,
// no kit-less scrim). Measured on the r5 tip: the derived module differs
// from the c1b78943 bytes only in focusables()' form (`const vis = …;
// return vis;` vs a direct return) — behaviourally the base leaf.
//
// The transform (two hunks, both the integrator-authorized kit edit):
//   1. DIALOG_CAPS: drop the `trapRadioGroups: true,` key together with the
//      contiguous `//` comment lines directly above it (the registry entry).
//   2. focusables(): drop the radio-group stop — everything between the
//      visibility filter and the closing brace becomes `return vis;`.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** the registry key playback.js feature-detects (dialog?.DIALOG_CAPS?.[CAP_KEY]) */
export const CAP_KEY = 'trapRadioGroups';
/** the group-stop hunk's own comment sentence (the arm's in-document probe) */
export const GROUP_STOP_MARK = 'a radio GROUP is ONE tab stop';

const CAP_RE = /\n(?:[ \t]*\/\/[^\n]*\n)*[ \t]*trapRadioGroups: true,\n/;
const GROUP_RE = /(\n  const vis = \[\.\.\.el\.querySelectorAll\(FOCUSABLE\)\]\n    \.filter\([^\n]*\n)[\s\S]*?\n  return vis\.filter\([\s\S]*?\);\n\}/;

/** Pure transform: current dialog.js source → the stale pose's source.
 * Returns { src, capStripped, groupStripped }; never throws. */
export function deriveStaleDialog(src) {
  let out = src;
  const capStripped = CAP_RE.test(out);
  if (capStripped) out = out.replace(CAP_RE, '\n');
  const groupStripped = GROUP_RE.test(out);
  if (groupStripped) out = out.replace(GROUP_RE, '$1  return vis;\n}');
  return { src: out, capStripped, groupStripped };
}

/** Read `<webDir>/app/ui/dialog.js`, derive the stale pose and VERIFY it.
 * Returns { src, problems: string[], bytes, derivedBytes }; `problems` is
 * empty when the pose is sound (no capability key, no group-stop code, the
 * two hunks found, the module parses under `node --check`). Callers fail
 * their arm on any problem — never fall back. */
export function loadStaleDialog(webDir, { syntaxCheck = true } = {}) {
  const file = path.join(webDir, 'app', 'ui', 'dialog.js');
  const cur = fs.readFileSync(file, 'utf8');
  const d = deriveStaleDialog(cur);
  const problems = [];
  if (!d.capStripped) problems.push(`the DIALOG_CAPS \`${CAP_KEY}\` key was not found in ${file} (transform hunk 1)`);
  if (!d.groupStripped) problems.push('the focusables() group-stop hunk was not found (transform hunk 2)');
  if (d.src.includes(CAP_KEY)) problems.push(`the derived module still names \`${CAP_KEY}\``);
  if (d.src.includes(GROUP_STOP_MARK) || /groups\.get\(/.test(d.src)) problems.push('the derived module still carries the group-stop code');
  if (!/export const DIALOG_CAPS = Object\.freeze\(\{/.test(d.src)) problems.push('the derived module lost the DIALOG_CAPS registry');
  if (syntaxCheck && problems.length === 0) {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ob-dialog-stale-')), 'dialog.js');
    try {
      fs.writeFileSync(tmp, d.src);
      const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8', timeout: 20000 });
      if (r.status !== 0) problems.push(`the derived module does not parse: ${(r.stderr || '').trim().split('\n')[0]}`);
    } finally { try { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); } catch { /* scratch */ } }
  }
  return { src: d.src, problems, bytes: cur.length, derivedBytes: d.src.length };
}
