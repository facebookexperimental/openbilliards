// playback-stale-pre-segmented.mjs — TEST-ONLY fixture source for the
// "stale playback.js" pose (e2e-replays arm X2 R-STALE-PLAYBACK; contract
// the replays contract (feature 035, internal) §7 row 53 (b)).
//
// GH-668 S5 replays r7 (review r4 P2-2): the cache-poison contract
// (the ownership ledger (internal) mixed-freshness law) treats FRESH-CSS + STALE-JS as
// a SUPPORTED pairing. The G4 refit made the DVR's filter strip and speed
// detents kit `.ob-segmented` radios (legacy fallback: kit `.ob-btn--toggle`)
// and deleted the rules the PRE-segmented module's own buttons stood on —
// `.ob-pb-filterbtn` (span.ob-pb-filters[role=group], aria-pressed,
// data-filter) and `.ob-nums.ob-pb-speedbtn` (span.ob-pb-speed, aria-pressed).
// A cached module of that shape under the fresh sheet lost the selected
// state and the coarse 44 px floor. The fix restates NARROW rules for
// exactly those two classes; this fixture is the STALE side. ARMS NEVER
// READ GIT HISTORY (CI checkouts are shallow), so the pose is DERIVED from
// the CURRENT module by a documented transform (r5 precedent:
// dialog-stale-pre-trap.mjs — derive-over-copy keeps every other behaviour
// fresh and the transform fail-closed).
//
// The transform (three hunks; the class names re-emitted are the ones the
// pre-segmented module used, quoted from the review r4 finding):
//   A. the capability read `const radioTrap = dialog?.DIALOG_CAPS?.
//      trapRadioGroups === true;` becomes `const radioTrap = false;` — the
//      filter strip takes the module's own button branch (span.ob-pb-filters
//      role=group, one button per filter, aria-pressed, data-filter).
//   B. inside that branch the kit class-set `'ob-btn ob-btn--toggle'`
//      (anchored to the following `b.dataset.filter = f;`) becomes
//      `'ob-pb-filterbtn'` — the legacy element-level register class.
//   C. the speed strip — from `speed.className = 'ob-pb-speed ob-segmented';`
//      through the kit `upgradeSegmented` import — becomes the legacy button
//      loop: span.ob-pb-speed, one `button.ob-nums.ob-pb-speedbtn` per
//      detent (text 1× / 0.5× / 0.25×, aria-pressed = the selected detent,
//      the click writes pb.speed + every sibling's aria-pressed and calls the
//      same repaint seams). `P.speedBtns` maps detent → button (the setSpeed
//      seam's `x.checked = …` write lands on a plain property there — the
//      legacy shape's own behaviour).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const FILTER_CLASS = 'ob-pb-filterbtn';
export const SPEED_CLASS = 'ob-pb-speedbtn';

const CAP_RE = /const radioTrap = dialog\?\.DIALOG_CAPS\?\.trapRadioGroups === true;/;
const FILTER_RE = /b\.className = 'ob-btn ob-btn--toggle';\n([ \t]*)b\.dataset\.filter = f;/;
const SPEED_RE = /speed\.className = 'ob-pb-speed ob-segmented';\n[\s\S]*?\.catch\(\(\) => \{ \/\* stale kit: the strip is still a segmented \*\/ \}\);\n/;
const SPEED_LEGACY = `speed.className = 'ob-pb-speed'; // STALE POSE: the pre-segmented detent buttons
    P.speedBtns = new Map();
    for (const s of SPEEDS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ob-nums ob-pb-speedbtn';
      b.dataset.speed = String(s);
      b.textContent = s === 1 ? '1×' : \`\${s}×\`;
      b.setAttribute('aria-pressed', String(s === pb.speed));
      b.addEventListener('click', () => {
        if (!pb) return;
        pb.speed = s;
        for (const [k, x] of P.speedBtns) x.setAttribute('aria-pressed', String(k === s));
        syncMontage();
        setLiveFade(pb.captureLatch ? 0 : evalAlpha(pb.T));
        syncLiveStrike(locate(pb.T), pb.T);
      });
      P.speedBtns.set(s, b);
      speed.appendChild(b);
    }
`;

/** Pure transform: current playback.js source → the stale pose's source.
 * Returns { src, capStripped, filterStripped, speedStripped }; never throws. */
export function deriveStalePlayback(src) {
  let out = src;
  const capStripped = CAP_RE.test(out);
  if (capStripped) out = out.replace(CAP_RE, 'const radioTrap = false; // STALE POSE: the pre-segmented module knew no capability');
  const filterStripped = FILTER_RE.test(out);
  if (filterStripped) out = out.replace(FILTER_RE, `b.className = '${FILTER_CLASS}';\n$1b.dataset.filter = f;`);
  const speedStripped = SPEED_RE.test(out);
  if (speedStripped) out = out.replace(SPEED_RE, SPEED_LEGACY);
  return { src: out, capStripped, filterStripped, speedStripped };
}

/** Read `<webDir>/app/playback.js`, derive the stale pose and VERIFY it.
 * Returns { src, problems: string[], bytes, derivedBytes }; `problems` is
 * empty when the pose is sound (the three hunks found; the derived module
 * names both legacy classes exactly once each as a class-set write, builds
 * no segmented speed strip, parses under `node --check`). Callers fail
 * their arm on any problem — never fall back. */
export function loadStalePlayback(webDir, { syntaxCheck = true } = {}) {
  const file = path.join(webDir, 'app', 'playback.js');
  const cur = fs.readFileSync(file, 'utf8');
  const d = deriveStalePlayback(cur);
  const problems = [];
  if (!d.capStripped) problems.push(`the capability read (DIALOG_CAPS.trapRadioGroups) was not found in ${file} (transform hunk A)`);
  if (!d.filterStripped) problems.push('the filter branch class-set write was not found (transform hunk B)');
  if (!d.speedStripped) problems.push('the segmented speed strip hunk was not found (transform hunk C)');
  if ((d.src.match(/className = 'ob-pb-filterbtn'/g) || []).length !== 1) problems.push('the derived module must write the legacy filter class exactly once');
  if ((d.src.match(/className = 'ob-nums ob-pb-speedbtn'/g) || []).length !== 1) problems.push('the derived module must write the legacy speed class exactly once');
  if (/'ob-pb-speed ob-segmented'/.test(d.src)) problems.push('the derived module still builds the segmented speed strip');
  if (/upgradeSegmented\?\.\(speed\)/.test(d.src)) problems.push('the derived module still upgrades the speed strip through the kit');
  if (!/const PB_CSS_V = '/.test(d.src)) problems.push('the derived module lost PB_CSS_V (the transform must stay surgical)');
  if (syntaxCheck && problems.length === 0) {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ob-playback-stale-')), 'playback.mjs');
    try {
      fs.writeFileSync(tmp, d.src);
      const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8', timeout: 20000 });
      if (r.status !== 0) problems.push(`the derived module does not parse: ${(r.stderr || '').trim().split('\n')[0]}`);
    } finally { try { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); } catch { /* scratch */ } }
  }
  return { src: d.src, problems, bytes: cur.length, derivedBytes: d.src.length };
}
