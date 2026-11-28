// drills-stale-pre-notice.mjs — TEST-ONLY fixture source for the "stale
// drills.js" pose (e2e-practice-stale arm S4; GH-668 S5 slice 4 round 10,
// review r2 P2-3 — the versioned-copy precedent, OWNERSHIP boot-graph law).
//
// The pairing the arm judges: a RETURNING client whose cached drills.js
// predates the slice-4 end NOTICE (its completion summary is ONE string
// composed from the legacy keys `drills.completeBanner` /
// `drills.runEndedBanner` WITH `{name} {score} {max}` params — the base
// bytes on main) meets FRESH locale JSON. Round 9 covered only the opposite
// pairing (fresh module, stale dictionary). Under the round-9 dictionary the
// legacy keys had lost their placeholders ("Drill complete"), so this client
// lost the drill name and score on every run end. Round 10 restores the
// legacy templates verbatim under the legacy keys and moves the sentence
// verdicts to NEW keys (`drills.endComplete` / `drills.endRunEnded`).
//
// ARMS NEVER READ GIT HISTORY (CI checkouts are shallow; the replays lane's
// fixtures/dialog-stale-pre-trap.mjs precedent). The pose is DERIVED from the
// CURRENT web/app/drills.js by ONE documented transform: the notice's
// versioned compose closure (`holdBanner(() => (i18nNs.hasLocal?.(…) === true
// ? { title, body } : { title, body }))`) is replaced by the base's
// one-template compose expression — the legacy key selected by `ranOut`,
// interpolated with the same `params()` (main's own line, word for word:
// `t(ranOut ? 'drills.runEndedBanner' : 'drills.completeBanner', {…})`) as
// the notice TITLE, an empty body. Every OTHER behaviour stays fresh (the
// notice surface, the hold, the tap seam, the record write), so the arm
// isolates exactly the KEY contract: does a module that composes ONLY from
// the legacy keys still put the name and score on screen over the fresh
// dictionary? The transform is fail-closed: the hunk must be found, the
// derived module must not call the versioned keys, must carry the base
// expression, and must parse under `node --check`; the arm's own in-document
// probe re-reads the served bytes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** the base's compose expression the derived module carries (the in-document probe reads it back) */
export const BASE_COMPOSE = "holdBanner(() => ({ title: t(ranOut ? 'drills.runEndedBanner' : 'drills.completeBanner', params()), body: '' }));";
/** the versioned compose's opening (the hunk the transform removes; the probe asserts its absence) */
export const VERSIONED_MARK = 'holdBanner(() => (i18nNs.hasLocal?.(';

// the whole versioned closure: from its opening line through the closing
// `}));` of the ternary's second object (both the round-9 form gated on
// 'drills.endTitle' and the round-10 form gated on the verdict key)
const COMPOSE_RE = /\n    holdBanner\(\(\) => \(i18nNs\.hasLocal\?\.\([^\n]*\n[\s\S]*?\n      \}\)\);\n/;

/** Pure transform: current drills.js source → the stale pose's source.
 * Returns { src, composeStripped }; never throws. */
export function deriveStaleDrills(src) {
  const composeStripped = COMPOSE_RE.test(src);
  const out = composeStripped ? src.replace(COMPOSE_RE, `\n    ${BASE_COMPOSE}\n`) : src;
  return { src: out, composeStripped };
}

/** Read `<webDir>/app/drills.js`, derive the stale pose and VERIFY it.
 * Returns { src, problems: string[], bytes, derivedBytes }; `problems` is
 * empty when the pose is sound. Callers fail their arm on any problem —
 * never fall back. */
export function loadStaleDrills(webDir, { syntaxCheck = true } = {}) {
  const file = path.join(webDir, 'app', 'drills.js');
  const cur = fs.readFileSync(file, 'utf8');
  const d = deriveStaleDrills(cur);
  const problems = [];
  if (!d.composeStripped) problems.push(`the versioned end-notice compose closure was not found in ${file} (transform hunk)`);
  if (d.src.includes(VERSIONED_MARK)) problems.push('the derived module still carries the versioned compose');
  if (/t\('drills\.endTitle'/.test(d.src)) problems.push("the derived module still calls t('drills.endTitle')");
  if (/t\(verdictKey/.test(d.src)) problems.push('the derived module still calls t(verdictKey)');
  if (!d.src.includes(BASE_COMPOSE)) problems.push('the derived module lost the base compose expression');
  if (!/function holdBanner\(compose\)/.test(d.src)) problems.push('the derived module lost holdBanner');
  if (syntaxCheck && problems.length === 0) {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ob-drills-stale-')), 'drills.js');
    try {
      fs.writeFileSync(tmp, d.src);
      const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8', timeout: 20000 });
      if (r.status !== 0) problems.push(`the derived module does not parse: ${(r.stderr || '').trim().split('\n')[0]}`);
    } finally { try { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); } catch { /* scratch */ } }
  }
  return { src: d.src, problems, bytes: cur.length, derivedBytes: d.src.length };
}
