// replays-stale-pre-tap.mjs — TEST-ONLY fixture source for the "stale
// replays.js" pose (e2e-replays arm X1 R-STALE-REPLAYS; contract
// the replays contract (feature 035, internal) §7 row 53 (a)).
//
// GH-668 S5 replays r7 (review r4 P2-1): the cache-poison contract
// (the ownership ledger (internal) mixed-freshness law) treats FRESH-CSS + STALE-JS as
// a SUPPORTED pairing. Round 3's coarse sheet hid the card's Open pill and
// hold hint unconditionally, but a cached pre-tap replays.js never installs
// the body-tap handler that replaced them — the latest-session card lost its
// click AND keyboard launch path. The fix keys the hides on a marker the
// tap implementation writes (`data-ob-tap="body"` on the host section) and
// this fixture is the STALE side of that gate. ARMS NEVER READ GIT HISTORY
// (CI checkouts are shallow), so the pose is DERIVED from the CURRENT
// module by a documented transform (the r5 precedent,
// dialog-stale-pre-trap.mjs, states the derive-over-copy reasons: a frozen
// fork drifts from what it impersonates; deriving keeps every OTHER
// behaviour fresh, so the arm isolates exactly the gated hunk; the transform
// is fail-closed).
//
// The transform (two hunks):
//   1. the marker write — drop the single `section.dataset.obTap = 'body';`
//      statement line (a pre-r7 module has no such line).
//   2. the body-tap arming — syncTap()'s `const target = seeded ? (scrolls
//      ? dayEl : latest) : null;` becomes `const target = null;`: no element
//      ever carries role=button, tapArmed stays null, the click / keyup
//      handlers return before launching (a pre-tap module never armed the
//      body). Everything else — the card, the Open pill's own click, the
//      rail, the seams — stays the current module's.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** the marker the coarse sheet keys its hides on (replays.js writes it) */
export const MARKER_ATTR = 'data-ob-tap';
export const MARKER_VALUE = 'body';

const MARKER_RE = /\n[ \t]*section\.dataset\.obTap = 'body';[^\n]*\n/;
const ARM_RE = /\n([ \t]*)const target = seeded \? \(scrolls \? dayEl : latest\) : null;\n/;

/** Pure transform: current replays.js source → the stale pose's source.
 * Returns { src, markerStripped, armStripped }; never throws. */
export function deriveStaleReplays(src) {
  let out = src;
  const markerStripped = MARKER_RE.test(out);
  if (markerStripped) out = out.replace(MARKER_RE, '\n');
  const armStripped = ARM_RE.test(out);
  if (armStripped) out = out.replace(ARM_RE, '\n$1const target = null; // STALE POSE: the pre-tap module never arms the body\n');
  return { src: out, markerStripped, armStripped };
}

/** Read `<webDir>/app/replays.js`, derive the stale pose and VERIFY it.
 * Returns { src, problems: string[], bytes, derivedBytes }; `problems` is
 * empty when the pose is sound (no marker write, no arming expression, the
 * two hunks found, the module parses under `node --check`). Callers fail
 * their arm on any problem — never fall back. */
export function loadStaleReplays(webDir, { syntaxCheck = true } = {}) {
  const file = path.join(webDir, 'app', 'replays.js');
  const cur = fs.readFileSync(file, 'utf8');
  const d = deriveStaleReplays(cur);
  const problems = [];
  if (!d.markerStripped) problems.push(`the marker write \`section.dataset.obTap = 'body'\` was not found in ${file} (transform hunk 1)`);
  if (!d.armStripped) problems.push('the syncTap arming expression was not found (transform hunk 2)');
  if (/dataset\.obTap\s*=/.test(d.src)) problems.push('the derived module still writes the tap marker');
  if (/scrolls \? dayEl : latest/.test(d.src)) problems.push('the derived module still arms the body tap');
  if (!/function syncTap\(\)/.test(d.src) || !/function openLatest\(\)/.test(d.src)) problems.push('the derived module lost syncTap()/openLatest() (the transform must stay surgical)');
  if (syntaxCheck && problems.length === 0) {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ob-replays-stale-')), 'replays.mjs');
    try {
      fs.writeFileSync(tmp, d.src);
      const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8', timeout: 20000 });
      if (r.status !== 0) problems.push(`the derived module does not parse: ${(r.stderr || '').trim().split('\n')[0]}`);
    } finally { try { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); } catch { /* scratch */ } }
  }
  return { src: d.src, problems, bytes: cur.length, derivedBytes: d.src.length };
}
