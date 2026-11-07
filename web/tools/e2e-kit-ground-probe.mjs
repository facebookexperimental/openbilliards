// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-kit-ground-probe.mjs — the A2 "text-2 ground" RECEIPT probe (GH-638 venue
// lighting, #727 ORDER-LIGHT-C2-FIX21 CORRIGENDUM-1 §1): e2e-ui --audit prints
// ink / ground / ratio for FAILING runs only, so a green register leaves no
// number behind. This probe poses the same frames the audit judged red on
// 2026-09-16 (shell play / shell replays at 1440x900, the carom fork at
// 1440x900 + 844x390 with the decision prompt up, the phone shell at 844x390,
// phone play at 844x390 + 667x375), feeds kit-laws' a2TextRunsJs into
// judgeTextGround(runs, img, { cssW, min: 99 }) — min 99 makes EVERY run
// answer — and prints, per run, the ink, the RENDERED ground, the WCAG ratio,
// the ground's linear luminance Y and the ceiling that ink needs for 4.5:1
// ((Yink + 0.05) / 4.5 − 0.05: text-2 ≤ 0.0141, text-1 ≤ 0.0589, accent
// ≤ 0.1132, text-0 ≤ 0.1424). It also prints the COMPUTED register of every
// play-games card / variant row (aria-current / aria-selected / browsed and
// the computed background-color + background-image) and of the four FIX21
// surfaces, so the cascade the fix relies on is read from the page, not from
// the sheet. e2e-ui.mjs and kit-laws.mjs are imported, never edited.
//
// The probe's own verdict is the law: any run < 4.5:1 → E2E-KIT-GROUND FAIL.
//
//   node web/tools/e2e-kit-ground-probe.mjs --port <http> --cdp <cdp>
//        [--venue off] [--stills <dir>] [--webdir <dir>] [--locales en,de]
//        [--pages "shell play,phone play 667x375"] [--reduced-transparency] [--dry]
//   node web/tools/e2e-kit-ground-probe.mjs --selftest-fork      (no ports, no browser: the fork pose's ORDER witnessed on a stub client)
//   node web/tools/e2e-kit-ground-probe.mjs --selftest-preflight (no lane-band port, no browser; one ephemeral loopback listener: the --webdir preflight's seven cases)
//   node web/tools/e2e-kit-ground-probe.mjs --selftest-receipt   (no ports, no browser: four receipts through judgeReceipts — an unparsed receipt is a FAIL by name)
//
// 'phone equipment 844x390' (ORDER-LIGHT-C2-FIX26 class AT-P): when that page is in the plan the phone client goes to Equipment, poses station cues
// (`__atelier.go('cues')`) and reads the atelier host's computed background / backdrop-filter against the resolved --ob-glass-solid — glass-on, then
// with body.ob-glass-off toggled (no e2e gate drives that class) — printing `[kitground] A11Y phone equipment 844x390[ glass-off]: atelier host = solid
// rung (…)`, then judges the page's runs (the cues hint's RUN line among them); a prepared client that does not mount FAILS by name; fork clients
// print the equipment SKIP line; a plan carrying the page with `a11y-equipment judged 0` FAILS by name.
//
// --webdir <dir> (ORDER-LIGHT-C2-FIX25; review 727c6 P2): the probe may judge ANOTHER export's web root (the plant a17463b5 carries no probe of its
// own). cdp.mjs launchChrome's preflightServedTree fires on ANY loopback http URL (path-independent — the ORIGIN bootstrap included) and compares
// the served tree with THIS checkout's web/, so a foreign root is refused before Chrome. With --webdir the probe OWNS the preflight of the selected
// root: before EVERY client launch it GETs <origin>app.html and the kit.css stylesheet that app.html links (?v= stripped for the local path only),
// byte-compares both with the root's files and prints `[kitground] PREFLIGHT (own, --webdir <abs>): app.html <sha16>=<sha16> kit.css <sha16>=<sha16>
// OK (<attempts> attempts, <ms> ms)`; a received response with the wrong status / bytes → `E2E-KIT-GROUND REFUSED: served tree ≠ --webdir <abs>:
// <file> served <sha16|status NNN> vs local <sha16>`; nothing answering within the budget (default 15000 ms, OB_CDP_PREFLIGHT_MS honoured, per-attempt
// AbortSignal.timeout(2000); 3000 ms once the server is known bound) → `E2E-KIT-GROUND REFUSED: nothing answered <url> within <N> ms — <cause>`, the
// cause by evidence (CORRIGENDUM-2 R1): a response received earlier in this run → 'the server stopped answering <rel> after app.html answered';
// an attempt that ended in TimeoutError → 'no timely answer (attempt timeout <ms> ms)'; else 'the static server never bound :<port>'. Both
// refusal classes stop the static server and exit 2. Only after the own preflight passed does the launch carry
// launchChrome's PER-CALL `preflight: false` (no process.env write). Without --webdir every launch keeps cdp's checkout preflight.
//
// --reduced-transparency (ORDER-LIGHT-C2-FIX22 class A11Y): Emulation.setEmulatedMedia
// { prefers-reduced-transparency: reduce } is applied to every client BEFORE its
// navigation; the page must then read matchMedia('(prefers-reduced-transparency: reduce)').matches
// === true (asserted — FAIL, never skip: some media features are not emulatable in this
// Chrome), and on a 'shell …' page the practice and equipment hosts are mounted first so
// their computed background is read: the practice section MUST equal the resolved
// --ob-glass-solid (the a11y rung), else FAIL.
//
// Ports are the launcher's (run-gate / the lane band): no numeric defaults.
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { setPhoneMetrics } from './touch-cdp.mjs';
import { a2Sample, judgeTextGround, contrast } from './kit-laws.mjs';

export const PORT_FLAGS = { '--port': 'http', '--cdp': 'cdp' };
// the primary client + the fork hop (cdp + 1)
export const PORT_INVENTORY = { http: 1, cdp: 2 };

const LOCALES_ALL = ['en', 'zh-CN', 'es', 'ja', 'de', 'fr', 'ko'];
const ROLE_INKS = { 'text-2': [138, 134, 121], 'text-1': [181, 177, 165], accent: [187, 219, 255], 'text-0': [239, 233, 216] };
const s2l = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * s2l(r) + 0.7152 * s2l(g) + 0.0722 * s2l(b);
const ceilingFor = (ink) => (lum(ink) + 0.05) / 4.5 - 0.05;
const roleOf = (ink) => {
  let best = 'other', d0 = 1e9;
  for (const [role, ref] of Object.entries(ROLE_INKS)) {
    const d = Math.abs(ink[0] - ref[0]) + Math.abs(ink[1] - ref[1]) + Math.abs(ink[2] - ref[2]);
    if (d < d0) { d0 = d; best = role; }
  }
  return d0 <= 24 ? best : 'other';
};
const ROW_RE = /^(.*?) "(.*)" (\d+(?:\.\d+)?)px ([\d.]+):1 \(ink rgb\((\d+),(\d+),(\d+)\) on rgb\((\d+),(\d+),(\d+)\)\)$/s; // FIX27: fractional font sizes parse (13.33px); `s` lets a text run with an internal newline parse
let nUnparsed = 0; // FIX27: receipts the probe could not judge — each is a FAIL by name, never a dropped run
// FIX24 class PT: the verdict is kit-laws' exported contrast() over the parsed INTEGER triplets — bit-identical to the judge's c (computed after the
// integer rounding); the printed `4.50:1` is toFixed(2): (138,134,121) on (25,33,34) = 4.49836 reads '4.50' yet fails the law
const LAW_MIN = 4.5;
// FIX24 class PF: at 844x390 the fork host sits clipped inside Play's scroller and a2TextRunsJs drops clipped text — pose it PER LOCALE at BOTH fork
// registers as auditCaromFork does (e2e-ui.mjs:1004-1005 + focus(marked, { preventScroll: true })); a run is a FORK run when its text is part of
// one of the fork host's label / hint texts (the 'fork runs' key = text match; the run name carries no id for the host)
const FORK_POSE = `(() => { const host = document.querySelector('[data-ob="play-carom2b"]'); host?.scrollIntoView({ block: 'nearest' }); host?.querySelector('input[value="marked"]')?.focus({ preventScroll: true }); return !!host; })()`;
const FORK_TEXTS = `(() => { const host = document.querySelector('[data-ob="play-carom2b"]'); if (!host || host.hidden) return []; const out = []; for (const el of host.querySelectorAll('label, legend, .ob-hint, .ob-caps, [data-ob="play-carom2b-hint"]')) { const t = (el.textContent || '').trim(); if (t) out.push(t); } if (!out.length) out.push((host.textContent || '').trim()); return out; })()`;

function args() {
  const a = process.argv.slice(2); const out = { locales: LOCALES_ALL, pages: null, venue: null, stills: null, dry: false, webdir: null, port: null, cdp: null, reduced: false, selftest: false };
  for (let i = 0; i < a.length; i++) {
    const k = a[i], v = a[i + 1];
    if (k === '--port') { out.port = Number(v); i++; } else if (k === '--cdp') { out.cdp = Number(v); i++; }
    else if (k === '--venue') { out.venue = v; i++; } else if (k === '--stills') { out.stills = v; i++; }
    else if (k === '--webdir') { out.webdir = v; i++; } else if (k === '--locales') { out.locales = v.split(','); i++; }
    else if (k === '--pages') { out.pages = v.split(',').map((s) => s.trim()); i++; } else if (k === '--dry') out.dry = true;
    else if (k === '--reduced-transparency') out.reduced = true; else if (k === '--selftest-fork') out.selftest = true; else if (k === '--selftest-ratio') out.selftestRatio = true;
    else if (k === '--selftest-preflight') out.selftestPreflight = true; else if (k === '--selftest-receipt') out.selftestReceipt = true;
    else throw new Error(`unknown argument ${k}`);
  }
  if (out.selftest || out.selftestRatio || out.selftestPreflight || out.selftestReceipt) return out; // the stub runs take no ports
  if (!out.port) out.port = Number(process.env.OB_E2E_PORT) || null;
  if (!out.cdp) out.cdp = Number(process.env.OB_E2E_CDP_PORT) || null;
  if (!out.port || !out.cdp) throw new Error('--port <http> and --cdp <cdp> are required (or OB_E2E_PORT / OB_E2E_CDP_PORT): the launcher passes the claimed ports');
  if (out.venue !== null && out.venue !== 'off') throw new Error("--venue takes only 'off' (the venue is on by default)");
  return out;
}

const PLAY_MOUNTED = `window.__shell?.isOpen?.() === true && window.__shell.place() === 'play' && !!document.querySelector('section[data-place="play"].ob-play-host')`;
const FORK_READY = `(() => { const host = document.querySelector('[data-ob="play-carom2b"]'); if (!host || host.hidden) return false; const r = host.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`;
const CARD_REGISTERS = `(() => { const cs = (el) => getComputedStyle(el); const bg = (el) => ({ bgc: cs(el).backgroundColor, bgi: cs(el).backgroundImage.slice(0, 72), bdf: cs(el).backdropFilter || cs(el).webkitBackdropFilter || 'none' });
  const cards = [...document.querySelectorAll('section[data-place="play"].ob-play-host [data-ob="play-games"] > button')].map((b, i) => ({ i, kind: 'game', name: (b.querySelector('.ob-cardrail-name, .ob-card-option__name')?.textContent || '').trim().slice(0, 24), current: b.getAttribute('aria-current'), selected: b.getAttribute('aria-selected'), browsed: b.getAttribute('data-ob-browsed'), disabled: b.getAttribute('aria-disabled'), ...bg(b) }));
  const variants = [...document.querySelectorAll('section[data-place="play"].ob-play-host [data-ob="play-variants"] .ob-card-option')].map((b, i) => ({ i, kind: 'variant', name: (b.textContent || '').trim().slice(0, 24), current: b.getAttribute('aria-current'), selected: b.getAttribute('aria-selected'), browsed: b.getAttribute('data-ob-browsed'), disabled: b.getAttribute('aria-disabled'), ...bg(b) }));
  const surf = {}; for (const sel of ['section.ob-play-host', 'section.ob-replays-host', 'section.ob-practice-host', 'section.ob-atelier-host', '#ob-replays-rail', '#ob-shell-decision']) { const el = document.querySelector(sel); surf[sel] = el ? bg(el) : null; }
  const ref = document.createElement('div'); document.body.appendChild(ref); ref.style.backgroundColor = 'var(--ob-glass-solid)'; const solidRef = cs(ref).backgroundColor; ref.style.backgroundColor = 'var(--ob-glass-bg)'; const smokeRef = cs(ref).backgroundColor; ref.remove();
  const rows = document.querySelectorAll('#ob-replays-list .ob-pb-row').length; const railHidden = document.getElementById('ob-replays-rail')?.hidden ?? null;
  return { cards, variants, surf, solidRef, smokeRef, rows, railHidden, glassOff: document.body.classList.contains('ob-glass-off'), reduced: matchMedia('(prefers-reduced-transparency: reduce)').matches }; })()`;
// the replays seeding, e2e-ui's own recipe (e2e-ui.mjs:6898-6947 desktop / :5551-5590 phone): an archive-armed boot (?archive=1 — archive.js disarms
// scripted boots otherwise), one shot, settle, flush, ≥ 1 archived session; then the place, the leaf, ≥ 1 visible session row
const SHOOT = `__test.shoot({ v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })`;
const SESSIONS = `(async () => (await window.__archive?.sessions?.())?.length ?? 0)()`;
const ROWS = `document.querySelectorAll('#ob-replays-list .ob-pb-row').length`;
const RAIL_SHOWN = `(() => { const r = document.getElementById('ob-replays-rail'); return !!r && r.hidden !== true; })()`;
const REDUCED_ON = `matchMedia('(prefers-reduced-transparency: reduce)').matches === true`;
// the per-page mount decision under --reduced-transparency is a TRACED eval at the judge call site (FIX23 CORRIGENDUM-1 §3): the fork client
// visits Play only (a hop would disturb its posed decision prompt) and prints the named SKIP; the desktop and phone clients PREPARE Practice
// and Equipment first (e2e-ui.mjs:5477-5483 does it on the phone shell) so their pages judge the rung
const PRACTICE_MOUNTED = `!!document.querySelector('section.ob-practice-host')`;
const skipLine = (page) => `[kitground] A11Y ${page}: practice not mounted on this client (fork boot visits Play only) — not judged (SKIP)`;
const skipLineEquipment = (page) => `[kitground] A11Y ${page}: equipment not mounted on this client (fork boot visits Play only) — not judged (SKIP)`;
// ORDER-LIGHT-C2-FIX26 class AT-P: the equipment host's computed register, read at station arrival (before any pick — atelier.js hides the cues
// hint on coarse after the first pick) beside the resolved --ob-glass-solid reference
const ATELIER_REG = `(() => { const cs = (el) => getComputedStyle(el); const h = document.querySelector('section.ob-atelier-host'); const ref = document.createElement('div'); document.body.appendChild(ref); ref.style.backgroundColor = 'var(--ob-glass-solid)'; const solidRef = cs(ref).backgroundColor; ref.remove(); return h ? { bgc: cs(h).backgroundColor, bdf: (() => { const v = cs(h).backdropFilter ?? cs(h).webkitBackdropFilter; return (v === undefined || v === '') ? null : v; })(), solidRef, station: window.__atelier?.station?.() ?? null, glassOff: document.body.classList.contains('ob-glass-off') } : null; })()`;

/** The carom second-ball fork pose (the decision prompt up), in e2e-ui's own order (e2e-ui.mjs:887-928 hopToPlay =
 * ready + PLAY_MOUNTED + the cardrail leaf; :1041-1043 the localStorage 'ob-settings-v1' game = 'carom_3cushion' + reload;
 * :984-996 bootFork with FORK_READY): bootPlay() → plant → reload → bootFork() → judge 1440x900 → 844x390 → navigate →
 * bootFork() → judge. `h` is the hop client (real, or the --selftest-fork stub); `io` carries the harness verbs. */
async function forkPose(h, { APP, pages, judgePage, fail, waitReady, waitFor, sleep: zz, setPhoneMetrics: spm, precondition, reduced = false, skipA11y = () => {}, skipEquipment = () => {}, noScroll = false }) {
  const judgeFork = async (page, coarse) => {
    let a11y = false;
    if (reduced) { a11y = !!(await h.eval(PRACTICE_MOUNTED).catch(() => false)); if (!a11y) { console.log(skipLine(page)); skipA11y(page); } }
    if (pages.includes('phone equipment 844x390')) { console.log(skipLineEquipment(page)); skipEquipment(page); } // FIX26 AT-P: the fork boot visits Play only
    await judgePage(h, page, coarse, { a11y, pose: noScroll ? null : () => h.eval(FORK_POSE).catch(() => false) }); // the per-locale scroll pose (PF)
  };
  const bootPlay = async () => {
    if (!(await waitReady(h))) return 'not ready';
    if (!(await waitFor(h, PLAY_MOUNTED, 100, 150))) return 'play never mounted';
    await waitFor(h, `!!document.querySelector('[data-ob="play-games"] .ob-cardrail-card')`, 30, 150);
    await zz(700); return null;
  };
  const bootFork = async () => {
    if (!(await waitReady(h))) return 'not ready';
    if (!(await waitFor(h, PLAY_MOUNTED, 100, 150))) return 'play never mounted';
    if (!(await waitFor(h, FORK_READY, 40, 150))) return 'the second-ball fork never showed';
    await zz(700); return null;
  };
  let why = await bootPlay();
  if (why) { fail(`play fork: ${why} (the initial pool boot, before the carom plant)`); return; }
  if (precondition && !(await precondition(h, 'play fork'))) return;
  await h.eval(CAROM_PLANT).catch(() => null);
  why = await bootFork();
  if (why) { fail(`play fork 1440x900: ${why} (after the carom plant + reload)`); return; }
  if (pages.includes('play fork 1440x900')) await judgeFork('play fork 1440x900', false);
  if (pages.includes('play fork 844x390')) {
    await spm(h, { width: 844, height: 390 });
    await h.send('Page.navigate', { url: `${APP}&obtool=1&obshell=1&u=kgforkp` });
    why = await bootFork();
    if (why) { fail(`play fork 844x390: ${why}`); return; }
    await judgeFork('play fork 844x390', true);
  }
}
const CAROM_PLANT = `(() => { const s = JSON.parse(localStorage.getItem('ob-settings-v1') || '{}'); s.game = 'carom_3cushion'; localStorage.setItem('ob-settings-v1', JSON.stringify(s)); location.reload(); return true; })()`;

/** --selftest-fork: a stub client records EVERY eval / send in order; FORK_READY answers true only AFTER the plant was
 * evaluated (a fresh non-carom page). The witness is the ORDER: caromPlantIndex < firstForkCheckIndex, caromPlantCalls ≥ 1. */
async function selftestFork() {
  const normal = await selftestForkRun({ noScroll: false });
  console.log('[kitground] SELFTEST-FORK PLANT (scroll pose removed): the order assertion must FAIL by name …');
  const plant = await selftestForkRun({ noScroll: true, quiet: true });
  const ok = normal.ok && !plant.ok && plant.why.includes('scroll');
  console.log(`[kitground] SELFTEST-FORK PLANT verdict: ${plant.ok ? 'PASSED (arm broken: the plant was not caught)' : 'FAILED by name — ' + plant.why}`);
  console.log(ok ? 'E2E-KIT-GROUND SELFTEST-FORK PASS (the plant precedes the first fork check; the scroll pose precedes each fork judge; both fork pages judged; 2 practice mount-checks answered false → 2 named SKIP lines, 0 A11Y fails; 2 equipment SKIP lines; the scroll-removed plant FAILS by name)' : 'E2E-KIT-GROUND SELFTEST-FORK FAIL');
  if (!ok) process.exitCode = 1;
}
async function selftestForkRun({ noScroll, quiet = false }) {
  const log = quiet ? () => {} : console.log;
  const trace = []; let planted = false;
  const h = {
    eval: async (expr) => {
      const i = trace.push({ kind: 'eval', expr: String(expr).slice(0, 60) }) - 1;
      if (expr === CAROM_PLANT) { planted = true; trace[i].tag = 'carom-plant'; return true; }
      if (expr === FORK_READY) { trace[i].tag = 'fork-ready'; return planted; }
      if (expr === PRACTICE_MOUNTED) { trace[i].tag = 'practice-mount-check'; return false; } // a fresh fork boot never mounted Practice
      if (expr === FORK_POSE) { trace[i].tag = 'fork-scroll-pose'; return true; }
      return true; // ready / mounted / leaf / language / registers answer true
    },
    send: async (method, params) => { trace.push({ kind: 'send', expr: method + ' ' + JSON.stringify(params || {}).slice(0, 40) }); return {}; },
  };
  const judged = []; const skipped = [];
  // the stub judgePage runs the SAME per-locale hook the real one runs (pose, then the runs) before it records the judge
  const eqSkipped = [];
  await forkPose(h, { APP: 'stub://app', pages: ['play fork 1440x900', 'play fork 844x390', 'phone equipment 844x390'], reduced: true, noScroll, skipA11y: (page) => { skipped.push(page); trace.push({ kind: 'skip', expr: skipLine(page) }); }, skipEquipment: (page) => { eqSkipped.push(page); trace.push({ kind: 'skip-equipment', expr: skipLineEquipment(page) }); }, judgePage: async (c, page, coarse, opt) => { if (opt?.pose) await opt.pose(); judged.push(page); trace.push({ kind: 'judge', expr: page + (opt?.a11y ? ' (a11y judged)' : ' (a11y not judged)') }); },
    fail: (m) => { trace.push({ kind: 'fail', expr: m }); }, waitReady: async () => true, waitFor: async (c, expr) => !!(await c.eval(expr)), sleep: async () => {}, setPhoneMetrics: async (c, m) => { await c.send('Emulation.setDeviceMetricsOverride', m); }, precondition: null });
  const forkChecks = trace.map((t, i) => [t, i]).filter(([t]) => t.tag === 'fork-ready').map(([, i]) => i);
  const plants = trace.map((t, i) => [t, i]).filter(([t]) => t.tag === 'carom-plant').map(([, i]) => i);
  const fails = trace.filter((t) => t.kind === 'fail');
  const mountChecks = trace.filter((t) => t.tag === 'practice-mount-check').length; const skipLines = trace.filter((t) => t.kind === 'skip').length; const equipmentSkipLines = trace.filter((t) => t.kind === 'skip-equipment').length;
  for (const [i, t] of trace.entries()) log(`[kitground] TRACE ${i} ${t.kind}${t.tag ? ' ' + t.tag : ''} ${t.expr}`);
  const judges = trace.map((t, i) => [t, i]).filter(([t]) => t.kind === 'judge').map(([, i]) => i);
  const poses = trace.map((t, i) => [t, i]).filter(([t]) => t.tag === 'fork-scroll-pose').map(([, i]) => i);
  const poseBeforeJudge = judges.length === 2 && poses.length === 2 && poses[0] < judges[0] && poses[1] < judges[1] && poses[1] > judges[0];
  const witness = { forkReadyChecks: forkChecks.length, caromPlantCalls: plants.length, caromPlantIndex: plants[0] ?? null, firstForkCheckIndex: forkChecks[0] ?? null, judged, fails: fails.length, practiceMountChecks: mountChecks, practiceMountAnswers: 'false', a11ySkipLines: skipLines, a11yFails: 0, equipmentSkipLines, scrollPoseIndices: poses, forkJudgeIndices: judges, scrollBeforeEachJudge: poseBeforeJudge };
  log('[kitground] SELFTEST-FORK fresh non-carom page fixture:' + (noScroll ? ' (PLANT: scroll pose removed)' : '') + ' ' + JSON.stringify(witness));
  const ok = plants.length >= 1 && forkChecks.length >= 1 && plants[0] < forkChecks[0] && fails.length === 0 && judged.length === 2 && mountChecks === 2 && skipLines === 2 && equipmentSkipLines === 2 && poseBeforeJudge;
  const why = !poseBeforeJudge ? `scroll pose index must precede each fork judge (poses ${JSON.stringify(poses)} vs judges ${JSON.stringify(judges)})` : ok ? '' : 'order / count witness failed';
  return { ok, why };
}

/** --selftest-ratio (FIX24 class PT): the judgement reads the UNROUNDED ratio. Scans grey grounds under the text-2 ink for the closest
 * ratio below 4.5 (→ FAIL) and the closest at/above (→ PASS), and reports any ground whose two-decimal text reads '4.50' while the true
 * ratio is below the law (the rounding trap the printed text would hide). */
function selftestRatio() {
  const ink = ROLE_INKS['text-2']; let below = null, above = null; const traps = [];
  for (let r = 0; r < 256; r++) for (let g = Math.max(0, r - 6); g <= Math.min(255, r + 6); g++) for (let b = Math.max(0, g - 6); b <= Math.min(255, g + 6); b++) {
    const ratio = contrast(ink, [r, g, b]);
    if (ratio < LAW_MIN && (!below || ratio > below.ratio)) below = { ground: [r, g, b], ratio };
    if (ratio >= LAW_MIN && (!above || ratio < above.ratio)) above = { ground: [r, g, b], ratio };
    if (ratio < LAW_MIN && ratio.toFixed(2) === '4.50') traps.push({ ground: [r, g, b], ratio });
  }
  const judge = (ratio) => (ratio < LAW_MIN ? 'FAIL' : 'PASS');
  const pair = [[25, 33, 34], [25, 33, 33]].map((g) => ({ ground: g, ratio: contrast(ink, g) }));
  for (const c of pair) console.log(`[kitground] SELFTEST-RATIO named cell: ink rgb(${ink}) on rgb(${c.ground}) ratio ${c.ratio.toFixed(5)} (prints ${c.ratio.toFixed(2)}) → ${judge(c.ratio)}`);
  console.log(`[kitground] SELFTEST-RATIO below: ground rgb(${below.ground}) ratio ${below.ratio.toFixed(5)} (prints ${below.ratio.toFixed(2)}) → ${judge(below.ratio)}`);
  console.log(`[kitground] SELFTEST-RATIO above: ground rgb(${above.ground}) ratio ${above.ratio.toFixed(5)} (prints ${above.ratio.toFixed(2)}) → ${judge(above.ratio)}`);
  console.log(`[kitground] SELFTEST-RATIO rounding traps (text '4.50' yet < 4.5): ${traps.length}${traps.length ? ' e.g. rgb(' + traps[0].ground + ') ratio ' + traps[0].ratio.toFixed(5) + ' → ' + judge(traps[0].ratio) : ''}`);
  const ok = judge(below.ratio) === 'FAIL' && judge(above.ratio) === 'PASS' && traps.every((t) => judge(t.ratio) === 'FAIL') && judge(pair[0].ratio) === 'FAIL' && judge(pair[1].ratio) === 'PASS';
  console.log(ok ? 'E2E-KIT-GROUND SELFTEST-RATIO PASS (unrounded judgement: below 4.5 fails even when the text reads 4.50; at/above passes)' : 'E2E-KIT-GROUND SELFTEST-RATIO FAIL');
  if (!ok) process.exitCode = 1;
}

const sha16 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);
/** The probe's OWN served-tree preflight for a --webdir root (FIX25 C1/C3/C5/C7). Pair 1 = app.html; pair 2 = the <link rel="stylesheet"> whose
 * href matches /kit\.css/ in the SELECTED root's app.html (served as written; ?v= stripped for the local path). Connection errors (no response at
 * all) are retried within `budgetMs` with a per-attempt timeout; ONLY a received response decides the TREE verdict; no response inside the budget is
 * the distinct NEVER-BOUND refusal. Returns { ok, kind: 'OK'|'TREE'|'NEVER-BOUND', text } — the caller prints / refuses. */
const boundOrigins = new Set(); // R1 (b): origins that answered at least once in this process (one origin per run — the process's bound flag)
async function preflightSelectedRoot(origin, webDir, { budgetMs = null, attemptMs = 2000, client = null } = {}) {
  // the budget env read in cdp.mjs's own two-step idiom (:245-247): a millisecond knob, not a port default — ci-bands' tool-default-overlap rule
  // reads `Number(env) || N` on a CDP-named env as a derived port window shared with tools/render/liveswitch-628.mjs
  const envBudget = Number(process.env.OB_CDP_PREFLIGHT_MS);
  const explicitBudget = Number.isFinite(envBudget) && envBudget > 0;
  const budget = budgetMs ?? (explicitBudget ? envBudget : 15000);
  const t0 = Date.now(); let attempts = 0; const suffix = client ? ` — before client ${client}` : '';
  const abs = path.resolve(webDir); const port = new URL(origin).port;
  const appLocalPath = path.join(abs, 'app.html');
  const appLocal = fs.existsSync(appLocalPath) ? fs.readFileSync(appLocalPath) : null;
  if (appLocal === null) return { ok: false, kind: 'TREE', text: `E2E-KIT-GROUND REFUSED: served tree ≠ --webdir ${abs}: app.html absent under ${abs}${suffix}` }; // R2: tested FIRST
  // R2: the kit.css stylesheet link in EITHER attribute order, resolved as a URL against the origin (served path + query as written; local path = pathname)
  const html = appLocal.toString('utf8');
  const link = /<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]*kit\.css[^"]*)"/.exec(html) || /<link\b[^>]*\bhref="([^"]*kit\.css[^"]*)"[^>]*\brel="stylesheet"/.exec(html);
  if (!link) return { ok: false, kind: 'TREE', text: `E2E-KIT-GROUND REFUSED: served tree ≠ --webdir ${abs}: no kit.css stylesheet link in ${abs}/app.html${suffix}` };
  const ku = new URL(link[1], origin);
  const pairs = [['app.html', 'app.html', appLocalPath], ['kit.css', ku.pathname.slice(1) + ku.search, path.join(abs, ku.pathname)]];
  let sawTimeout = false; // R1 (c)
  const get = async (rel) => {
    for (;;) {
      attempts += 1;
      try { const r = await fetch(`${origin}${rel}`, { signal: AbortSignal.timeout(attemptMs) }); const body = Buffer.from(await r.arrayBuffer()); boundOrigins.add(origin); return { status: r.status, body }; }
      catch (e) { if (e?.name === 'TimeoutError') sawTimeout = true; if (Date.now() - t0 >= budget) return null; await sleep(Math.min(250, attemptMs)); }
    }
  };
  const got = [];
  for (const [name, servedRel, localPath] of pairs) {
    const r = await get(servedRel);
    if (!r) { // R1: the class stays binary (no response); the trailing clause states the cause the evidence carries — (b) over (c) over (a)
      const cause = boundOrigins.has(origin) ? `the server stopped answering ${servedRel} after app.html answered` : sawTimeout ? `no timely answer (attempt timeout ${attemptMs} ms)` : `the static server never bound :${port}`;
      return { ok: false, kind: 'NEVER-BOUND', text: `E2E-KIT-GROUND REFUSED: nothing answered ${origin}${servedRel} within ${budget} ms — ${cause}${suffix}` };
    }
    const local = fs.existsSync(localPath) ? fs.readFileSync(localPath) : null; const localSha = local ? sha16(local) : 'ABSENT';
    if (r.status !== 200) return { ok: false, kind: 'TREE', text: `E2E-KIT-GROUND REFUSED: served tree ≠ --webdir ${abs}: ${name} served status ${r.status} vs local ${localSha}${suffix}` };
    const servedSha = sha16(r.body);
    if (!local || !r.body.equals(local)) return { ok: false, kind: 'TREE', text: `E2E-KIT-GROUND REFUSED: served tree ≠ --webdir ${abs}: ${name} served ${servedSha} vs local ${localSha}${suffix}` };
    got.push(`${name} ${servedSha}=${localSha}`);
  }
  return { ok: true, kind: 'OK', text: `[kitground] PREFLIGHT (own, --webdir ${abs}): ${got.join(' ')} OK (${attempts} attempts, ${Date.now() - t0} ms)` };
}
/** --selftest-preflight (FIX25 C6): a witnessing cell — no lane-band port, no browser; one ephemeral loopback listener. Four cases. */
async function selftestPreflight() {
  console.log('[kitground] SELFTEST-PREFLIGHT: no lane-band port, no browser; one ephemeral loopback listener');
  const os = await import('node:os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-kg-preflight-')); fs.mkdirSync(path.join(root, 'app', 'ui'), { recursive: true });
  const appHtml = '<!doctype html><link rel="stylesheet" href="./app/ui/tokens.css?v=015" data-optional><link rel="stylesheet" href="./app/ui/kit.css?v=039" data-optional><title>fixture</title>';
  const kitCss = ':root{--ob-glass-solid:oklch(16.5% 0.011 165 / 0.94)}';
  fs.writeFileSync(path.join(root, 'app.html'), appHtml); fs.writeFileSync(path.join(root, 'app', 'ui', 'kit.css'), kitCss); fs.writeFileSync(path.join(root, 'app', 'ui', 'tokens.css'), ':root{}');
  const served = { 'app.html': appHtml, 'app/ui/kit.css': kitCss };
  const srv = http.createServer((req, res) => { const rel = req.url.replace(/^\//, '').split('?')[0]; if (rel in served) { res.writeHead(200); res.end(served[rel]); } else { res.writeHead(404); res.end(); } });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const origin = `http://127.0.0.1:${srv.address().port}/`;
  const SHA = /[0-9a-f]{16}/g; const results = [];
  const cell = (name, r, want) => { const shas = (r.text.match(SHA) || []).length; const ok = want(r, shas); results.push(ok); console.log(`[kitground] SELFTEST-PREFLIGHT case ${name}: ${r.text}`); console.log(`[kitground] SELFTEST-PREFLIGHT case ${name} → ${ok ? 'as expected' : 'FAIL by name'} (kind ${r.kind}, shas printed ${shas})`); };
  try {
    cell('i identical', await preflightSelectedRoot(origin, root, { budgetMs: 3000, attemptMs: 500 }), (r, n) => r.ok && r.text.startsWith('[kitground] PREFLIGHT (own, --webdir ') && n === 4 && / OK \(\d+ attempts, \d+ ms\)$/.test(r.text));
    served['app.html'] = appHtml + ' ';
    cell('ii app.html one byte', await preflightSelectedRoot(origin, root, { budgetMs: 3000, attemptMs: 500 }), (r, n) => !r.ok && r.kind === 'TREE' && r.text.startsWith('E2E-KIT-GROUND REFUSED: served tree ≠ --webdir ') && /: app\.html served [0-9a-f]{16} vs local [0-9a-f]{16}$/.test(r.text) && n === 2 && !r.text.includes('nothing answered'));
    served['app.html'] = appHtml; served['app/ui/kit.css'] = kitCss + ' ';
    cell('iii kit.css one byte', await preflightSelectedRoot(origin, root, { budgetMs: 3000, attemptMs: 500 }), (r, n) => !r.ok && r.kind === 'TREE' && /: kit\.css served [0-9a-f]{16} vs local [0-9a-f]{16}$/.test(r.text) && n === 2 && !r.text.includes('nothing answered'));
    served['app/ui/kit.css'] = kitCss;
    const dead = http.createServer(); await new Promise((r) => dead.listen(0, '127.0.0.1', r)); const deadPort = dead.address().port; await new Promise((r) => dead.close(r));
    cell('iv closed port', await preflightSelectedRoot(`http://127.0.0.1:${deadPort}/`, root, { budgetMs: 1200, attemptMs: 300 }), (r, n) => !r.ok && r.kind === 'NEVER-BOUND' && r.text.startsWith(`E2E-KIT-GROUND REFUSED: nothing answered http://127.0.0.1:${deadPort}/app.html within 1200 ms — the static server never bound :${deadPort}`) && !r.text.includes('served tree ≠'));
    // (v) LATE BIND: the listener starts ~400 ms after the first GET — the bind-wait retry must carry the call to OK with attempts > 1
    const late = http.createServer((req, res) => { const rel = req.url.replace(/^\//, '').split('?')[0]; if (rel in served) { res.writeHead(200); res.end(served[rel]); } else { res.writeHead(404); res.end(); } });
    const pick = http.createServer(); await new Promise((r) => pick.listen(0, '127.0.0.1', r)); const latePort = pick.address().port; await new Promise((r) => pick.close(r));
    setTimeout(() => late.listen(latePort, '127.0.0.1'), 400);
    const rv = await preflightSelectedRoot(`http://127.0.0.1:${latePort}/`, root, { budgetMs: 3000, attemptMs: 300 }); const attemptsV = Number((/\((\d+) attempts,/.exec(rv.text) || [])[1] || 0);
    cell(`v late bind (attempts ${attemptsV})`, rv, (r, n) => r.ok && attemptsV > 1 && n === 4);
    await new Promise((r) => late.close(r));
    // (vi) HANG: a listener that accepts and never responds — the per-attempt timeout bounds the call; clause (c)
    const hang = http.createServer(() => { /* accept, never respond */ }); await new Promise((r) => hang.listen(0, '127.0.0.1', r)); const hangPort = hang.address().port;
    const tvi = Date.now(); const rvi = await preflightSelectedRoot(`http://127.0.0.1:${hangPort}/`, root, { budgetMs: 900, attemptMs: 300 }); const elapsedVi = Date.now() - tvi;
    cell(`vi hang (elapsed ${elapsedVi} ms)`, rvi, (r, n) => !r.ok && r.kind === 'NEVER-BOUND' && r.text.includes(' — no timely answer (attempt timeout 300 ms)') && !r.text.includes('never bound') && !r.text.includes('served tree ≠') && elapsedVi < 1500);
    hang.closeAllConnections?.(); await new Promise((r) => hang.close(r));
    // (vii) clause (b): a listener that answers app.html, then destroys every later connection — 'stopped answering <rel> after app.html answered'
    const dies = http.createServer((req, res) => { const rel = req.url.replace(/^\//, '').split('?')[0]; if (rel === 'app.html') { res.writeHead(200); res.end(served['app.html']); } else req.socket.destroy(); });
    await new Promise((r) => dies.listen(0, '127.0.0.1', r)); const diesPort = dies.address().port;
    cell('vii answers app.html then dies (clause b)', await preflightSelectedRoot(`http://127.0.0.1:${diesPort}/`, root, { budgetMs: 900, attemptMs: 300 }), (r, n) => !r.ok && r.kind === 'NEVER-BOUND' && r.text.startsWith(`E2E-KIT-GROUND REFUSED: nothing answered http://127.0.0.1:${diesPort}/app/ui/kit.css?v=039 within 900 ms — the server stopped answering app/ui/kit.css?v=039 after app.html answered`) && !r.text.includes('served tree ≠'));
    dies.closeAllConnections?.(); await new Promise((r) => dies.close(r));
  } finally { await new Promise((r) => srv.close(r)); fs.rmSync(root, { recursive: true, force: true }); }
  const ok = results.length === 7 && results.every(Boolean);
  console.log(ok ? 'E2E-KIT-GROUND SELFTEST-PREFLIGHT PASS (i identical → OK; ii app.html byte → TREE naming app.html; iii kit.css byte → TREE naming kit.css; iv closed port → NEVER-BOUND clause (a) without the tree wording; v late bind → OK with attempts > 1; vi hang → clause (c) under the attempt timeout, elapsed < 1500 ms; + vii answers-then-dies → clause (b))' : 'E2E-KIT-GROUND SELFTEST-PREFLIGHT FAIL');
  if (!ok) process.exitCode = 1;
}

/** FIX27: the row judgement, ONE function main() and the --selftest-receipt cell both call. Under min: 99 kit-laws emits a receipt for EVERY
 * sampled run; a parsed receipt is not a failure by itself — only ratio < LAW_MIN (the RUN line) or an UNPARSED receipt (a run the probe could
 * not judge) fails. Prints the RUN / UNPARSED lines; returns { parsed, low, over, unparsed }. */
function judgeReceipts(rows, { page, locale, fail }) {
  let low = 0, over = 0, parsed = 0, unparsed = 0;
  for (const row of rows) {
    const m = ROW_RE.exec(row);
    if (!m) { console.log(`[kitground] RUN ${page} [${locale}] UNPARSED ${row}`); nUnparsed += 1; unparsed += 1; fail(`${page} [${locale}] receipt UNPARSED (a run the probe could not judge): ${row}`); continue; }
    parsed++;
    const ink = [+m[5], +m[6], +m[7]], ground = [+m[8], +m[9], +m[10]], printed = +m[4];
    const ratio = contrast(ink, ground); // unrounded — the judgement; `printed` stays in the receipt
    const y = lum(ground), ceil = ceilingFor(ink), role = roleOf(ink);
    const lowRow = ratio < LAW_MIN, overRow = y > ceil;
    if (lowRow) low++; if (overRow) over++;
    console.log(`[kitground] RUN ${page} [${locale}] ${role} ${m[1]} "${m[2]}" ${m[3]}px ${ratio.toFixed(4)}:1 (printed ${printed.toFixed(2)}) ink rgb(${ink}) ground rgb(${ground}) Y ${y.toFixed(4)} ceiling ${ceil.toFixed(4)} ${overRow ? 'OVER' : 'ok'}${lowRow ? ' <4.5 LAW-RED' : ''}`);
  }
  return { parsed, low, over, unparsed };
}
/** --selftest-receipt (FIX27 C1/C2): under min: 99 the judge emits every run; a parsed receipt is not a failure by itself; only ratio < 4.5 or an
 * unparsed receipt fails. Four receipts through the SAME judgeReceipts with a recording stub; exits 0/1. */
function selftestReceipt() {
  console.log('[kitground] SELFTEST-RECEIPT: under min: 99 the judge emits every run; a parsed receipt is not a failure by itself; only ratio < 4.5 or an unparsed receipt fails');
  const cases = [
    ['1 integer px, low', 'p[atelier.cues.hint] "Wähle ein Queue" 14px 3.76:1 (ink rgb(181,177,165) on rgb(107,69,29))', (r, f) => r.parsed === 1 && r.low === 1 && r.unparsed === 0 && f.length === 0, 'parsed / FAIL-by-ratio'],
    ['2 fractional px, low', 'button "Weiter" 13.33px 3.76:1 (ink rgb(181,177,165) on rgb(107,69,29))', (r, f) => r.parsed === 1 && r.low === 1 && r.unparsed === 0 && f.length === 0, 'parsed / FAIL-by-ratio'],
    ['3 malformed (no :1)', 'p[atelier.cues.hint] "Wähle ein Queue" 14px 3.93 (ink rgb(181,177,165) on rgb(107,69,29))', (r, f) => r.parsed === 0 && r.unparsed === 1 && f.length === 1 && f[0].includes('receipt UNPARSED'), 'UNPARSED / FAIL by name'],
    ['4 passing', 'h3.ob-caps "Discipline" 14px 6.74:1 (ink rgb(235,235,230) on rgb(80,80,80))', (r, f) => r.parsed === 1 && r.low === 0 && r.unparsed === 0 && f.length === 0, 'parsed / PASS, no failure'],
  ];
  let ok = true;
  for (const [name, receipt, want, kind] of cases) {
    const recorded = []; const record = (m) => recorded.push(m);
    const r = judgeReceipts([receipt], { page: 'selftest', locale: 'xx', fail: record });
    const good = want(r, recorded); ok = ok && good;
    console.log(`[kitground] SELFTEST-RECEIPT case ${name}: ${JSON.stringify(r)} recorded ${recorded.length}${recorded.length ? ' (' + recorded[0].slice(0, 60) + '…)' : ''} → ${kind} → ${good ? 'as expected' : 'FAIL by name'}`);
  }
  console.log(ok ? 'E2E-KIT-GROUND SELFTEST-RECEIPT PASS (integer px low → FAIL-by-ratio; fractional px low → FAIL-by-ratio; malformed → UNPARSED FAIL by name; passing → no failure)' : 'E2E-KIT-GROUND SELFTEST-RECEIPT FAIL');
  if (!ok) process.exitCode = 1;
}

async function main() {
  const o = args();
  if (o.selftest) { await selftestFork(); return; }
  if (o.selftestRatio) { selftestRatio(); return; }
  if (o.selftestPreflight) { await selftestPreflight(); return; }
  if (o.selftestReceipt) { selftestReceipt(); return; }
  const webDir = o.webdir || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = o.port, CDP = o.cdp;
  const APP = `http://127.0.0.1:${PORT}/app.html?seed=1${o.venue === 'off' ? '&venue=off' : ''}`;
  const PAGES = ['shell play', 'shell replays', 'play fork 1440x900', 'play fork 844x390', 'phone shell 844x390', 'phone equipment 844x390', 'phone play 844x390', 'phone play 667x375'];
  const pages = o.pages ? PAGES.filter((p) => o.pages.includes(p)) : PAGES;
  if (o.pages && pages.length !== o.pages.length) throw new Error(`unknown page(s): ${o.pages.filter((p) => !PAGES.includes(p)).join(', ')}`);
  console.log(`[kitground] PLAN webdir ${webDir} app ${APP} ports http ${PORT} cdp ${CDP}/${CDP + 1} pages ${pages.length} locales ${o.locales.join(',')} venue ${o.venue === 'off' ? 'OFF' : 'on'} stills ${o.stills || '-'} reduced-transparency ${o.reduced ? 'EMULATED (asserted in page)' : 'no'} preflight ${o.webdir ? 'OWN' : 'cdp.mjs'}`);
  if (o.dry) { console.log('[kitground] DRY: no server, no browser'); return; }
  if (o.stills) fs.mkdirSync(o.stills, { recursive: true });
  let nFail = 0, nRuns = 0, nOver = 0, a11yJudged = 0, a11ySkipped = 0, replaysRows = null, nForkRuns = 0, a11yEqJudged = 0, a11yEqSkipped = 0;
  const fail = (msg) => { console.error('E2E-KIT-GROUND FAIL:', msg); process.exitCode = 1; };
  const slug = (s) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const server = spawnStaticServer(webDir, PORT); // started before the helpers: the own preflight (--webdir) bind-waits on it before the first launch

  const waitReady = async (c, tries = 300) => { for (let i = 0; i < tries; i++) { await sleep(200); try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* booting */ } } return false; };
  const waitFor = async (c, expr, tries = 100, ms = 150) => { for (let i = 0; i < tries; i++) { if (await c.eval(expr).catch(() => false)) return true; await sleep(ms); } return false; };
  // every client bootstraps on the SERVED ORIGIN `new URL(APP).origin + '/'` (the http.server listing — no app byte), opened with { tool: false }
  // so withToolParam does not stamp it (cdp.mjs launchChrome attaches only to an http page target — an about:blank boot never comes up;
  // touch-cdp.mjs launchPhone boots the origin the same way); then metrics, then the media emulation (if any), then Page.navigate to the app
  // document (ORDER-LIGHT-C2-FIX24 class PB)
  const ORIGIN = new URL(APP).origin + '/';
  let preflightRuns = 0; // C7: in --webdir mode the own preflight runs before EVERY client (bind-wait budget on the first; 3000 ms once bound)
  const openClient = async (url, opts, { phone = null, client = 'shell' } = {}) => {
    let skip = false;
    if (o.webdir) {
      const r = await preflightSelectedRoot(ORIGIN, webDir, { budgetMs: preflightRuns ? 3000 : null, client: preflightRuns ? client : null });
      if (!r.ok) { console.error(r.text); await stopStaticServer(server); process.exit(2); }
      console.log(r.text); preflightRuns += 1; skip = true; // the own preflight PASSED: cdp's checkout comparison is switched off for THIS call
    } else if (!preflightRuns) { console.log('[kitground] PREFLIGHT (cdp.mjs, this checkout)'); preflightRuns += 1; }
    const c = await launchChrome(ORIGIN, { ...opts, tool: false, ...(skip ? { preflight: false } : {}) }); // the ORIGIN bootstrap URL triggers cdp's preflight too
    if (phone) await setPhoneMetrics(c, phone);
    if (o.reduced) await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    await c.send('Page.navigate', { url });
    return c;
  };
  const precondition = async (c, tag) => {
    if (!o.reduced) return true;
    const on = await c.eval(REDUCED_ON).catch(() => false);
    if (on !== true) { fail(`${tag}: --reduced-transparency asked, but the page reads matchMedia('(prefers-reduced-transparency: reduce)').matches !== true — the media feature did not emulate in this Chrome (not skipped: FAIL)`); return false; }
    return true;
  };
  // desktop / phone judge call site: the traced mount-check; these clients PREPARED Practice, so a false answer is a FAIL by name
  const judgeMounted = async (c, page, coarse) => {
    let a11y = false;
    if (o.reduced) { a11y = !!(await c.eval(PRACTICE_MOUNTED).catch(() => false)); if (!a11y) fail(`${page}: --reduced-transparency — section.ob-practice-host is not mounted on this client after the mount step (not a fork client: no SKIP)`); }
    await judgePage(c, page, coarse, { a11y });
  };
  const closeClient = async (c) => { try { if (typeof c.closeAndWait === 'function') await c.closeAndWait(); else { c.close(); await sleep(800); } } catch { /* closed */ } };

  // one posed frame: every locale → runs + still → every run printed with its ceiling; the card / surface registers once (en)
  const judgePage = async (c, page, coarse, { a11y = true, pose = null } = {}) => {
    for (const locale of o.locales) {
      await c.eval(`window.__settings.set('language', '${locale}')`).catch(() => null);
      await sleep(400);
      if (pose) { await pose(); await sleep(250); } // the per-locale pose (fork pages: scrollIntoView + focus, a traced eval on the client)
      const [w, h, dpr] = await c.eval('[innerWidth, innerHeight, devicePixelRatio]');
      if (h > w) { console.log(`[kitground] ${page} [${locale}] portrait — not a posed frame`); continue; }
      // GH-877: ONE STATE for ink + ground via a2Sample (settle, read, still, re-read)
      const sampled = await a2Sample(c, { w, h, coarse, dpr });
      if (!sampled.settled) { fail(`${page} [${locale}]: ${sampled.unsettled} (instrument: attempts ${sampled.attemptsUsed}, settle polls ${sampled.settlePollsUsed})`); continue; }
      const runs = sampled.runs;
      if (page.startsWith('play fork')) {
        const texts = await c.eval(FORK_TEXTS).catch(() => []);
        const forkRuns = runs.filter((r) => r.text && r.text.length >= 2 && texts.some((t) => t.includes(r.text)));
        console.log(`[kitground] ${page} [${locale}] fork runs sampled ${forkRuns.length} (of ${texts.length} fork texts; key = text match against the fork host's label / hint texts)`);
        if (!forkRuns.length) fail(`${page} [${locale}]: fork runs not sampled (clipped) — 0 runs matched the fork host's texts (FIX24 PF)`);
        nForkRuns += forkRuns.length;
      }
      if (o.stills) fs.writeFileSync(path.join(o.stills, `${slug(page)}-${locale}${o.venue === 'off' ? '-venueoff' : ''}.png`), sampled.buf);
      const rows = judgeTextGround(runs, sampled.img, { cssW: w, min: 99 });
      const { parsed, low, over } = judgeReceipts(rows, { page, locale, fail });
      nRuns += parsed; nFail += low; nOver += over;
      console.log(`[kitground] ${page} [${locale}] runs ${runs.length} parsed ${parsed} <4.5: ${low} ceiling-over: ${over}${low ? ' RED' : ' green'}`);
      if (low) fail(`${page} [${locale}]: ${low} run(s) below 4.5:1 (see RUN lines)`);
      if (locale === o.locales[0]) {
        const reg = await c.eval(CARD_REGISTERS).catch((e) => ({ error: String(e) }));
        if (reg.error) console.log(`[kitground] REGISTERS ${page}: unreadable ${reg.error}`);
        else {
          if (page === 'shell replays') replaysRows = reg.rows;
          console.log(`[kitground] REGISTERS ${page} glass-off ${reg.glassOff} reduced-transparency ${reg.reduced} rows=${reg.rows} rail-hidden=${reg.railHidden} solid=${reg.solidRef} smoke=${reg.smokeRef}: ` + Object.entries(reg.surf).map(([k, v]) => `${k}=${v ? `${v.bgc} | ${v.bgi} | ${v.bdf}` : 'absent'}`).join(' ; '));
          if (o.reduced && a11y) {
            const pr = reg.surf['section.ob-practice-host'];
            a11yJudged += 1;
            if (!pr) fail(`${page}: --reduced-transparency — section.ob-practice-host is absent after the mount step, its rung cannot be read`);
            else if (pr.bgc !== reg.solidRef || (pr.bdf && pr.bdf !== 'none')) fail(`${page}: --reduced-transparency — the practice section computes ${pr.bgc} / ${pr.bdf}, want the solid rung ${reg.solidRef} / none (review 727c3 P2 #1 class)`);
            else console.log(`[kitground] A11Y ${page}: practice section = solid rung ${pr.bgc}, backdrop-filter ${pr.bdf} — OK`);
          }
          for (const cd of [...reg.cards, ...reg.variants]) console.log(`[kitground] CARD ${page} ${cd.kind}#${cd.i} "${cd.name}" current=${cd.current} selected=${cd.selected} browsed=${cd.browsed} disabled=${cd.disabled} bg ${cd.bgc} | ${cd.bgi}`);
        }
      }
    }
    await c.eval(`window.__settings.set('language', 'en')`).catch(() => null);
    await sleep(300);
  };

  try {
    // ---- desktop shell places (1440x900): shell play / shell replays -------
    if (pages.some((p) => p.startsWith('shell '))) {
      const c = await openClient(`${APP}&obtool=1&obshell=1&archive=1&u=kgshell`, { port: CDP, width: 1440, height: 900 }, { client: 'shell' });
      try {
        if (!(await waitReady(c))) fail('shell boot never became ready');
        else if (!(await waitFor(c, 'window.__shell?.isOpen?.() === true', 60, 200))) fail('obshell boot never opened the shell');
        else if (!(await precondition(c, 'shell'))) { /* FAIL recorded */ }
        else {
          if (o.reduced) { // mount the smoke-keeping hosts so their computed rung is readable on the judged page
            for (const [place, host] of [['practice', 'section.ob-practice-host'], ['equipment', 'section.ob-atelier-host']]) {
              await c.eval(`window.__shell.go('${place}')`);
              if (!(await waitFor(c, `!!document.querySelector('${host}')`, 60, 150))) fail(`shell ${place}: the host never mounted (needed for the reduced-transparency register read)`);
            }
          }
          for (const place of ['play', 'replays']) {
            const page = `shell ${place}`; if (!pages.includes(page)) continue;
            if (place === 'replays') { // seed ONE session first (e2e-ui's recipe); the play frame above was judged before the shot
              const err = await c.eval(SHOOT).catch((e) => String(e));
              let st = 'PLAYBACK';
              for (let i = 0; i < 200 && (st === 'PLAYBACK' || st === 'SIMULATING'); i++) { await sleep(300); st = await c.eval('__test.state()').catch(() => 'unknown'); }
              await c.eval('window.__archive?.flush?.()').catch(() => null);
              const n = await c.eval(SESSIONS).catch(() => 0);
              if (err || !(n >= 1)) { fail(`replays: no archived session after the shot (${err ? 'shot rejected: ' + err : n + ' archived'}, state ${st}) — 'shell replays' not judged`); continue; }
              console.log(`[kitground] shell replays: ${n} archived session(s) after one shot (state ${st})`);
            }
            await c.eval(`window.__shell.go('${place}')`);
            const host = place === 'play' ? 'section[data-place="play"].ob-play-host' : 'section.ob-replays-host';
            if (!(await waitFor(c, `!!document.querySelector('${host}')`, 60, 150))) { fail(`${page}: the place host never mounted`); continue; }
            if (place === 'play') await waitFor(c, `!!document.querySelector('[data-ob="play-games"] .ob-cardrail-card')`, 30, 150);
            if (place === 'replays') {
              if (!(await waitFor(c, 'typeof window.__replays === "object"', 40, 150))) { fail('shell replays: the replays leaf never mounted — not judged'); continue; }
              if (!(await waitFor(c, `(${ROWS}) >= 1 && ${RAIL_SHOWN}`, 40, 150))) { fail(`replays rail empty: not judged (rows ${await c.eval(ROWS).catch(() => '?')}, rail shown ${await c.eval(RAIL_SHOWN).catch(() => '?')})`); continue; }
            }
            await sleep(700);
            await judgeMounted(c, page, false);
          }
        }
      } finally { await closeClient(c); }
    }
    // ---- the carom second-ball fork (the decision prompt up): 1440x900 + 844x390
    if (pages.some((p) => p.startsWith('play fork'))) {
      const h = await openClient(`${APP}&obtool=1&obshell=1&u=kgfork`, { port: CDP + 1, width: 1440, height: 900 }, { client: 'fork' });
      try { await forkPose(h, { APP, pages, judgePage, fail, waitReady, waitFor, sleep, setPhoneMetrics, precondition, reduced: o.reduced, skipA11y: () => { a11ySkipped += 1; }, skipEquipment: () => { a11yEqSkipped += 1; } }); }
      finally { await closeClient(h); }
    }
    // ---- the phone registers: shell at 844x390, play at 844x390 + 667x375 --
    if (pages.some((p) => p.startsWith('phone '))) {
      const c = await openClient(`${APP}&obtool=1&obshell=1&u=kgshellphone`, { port: CDP, width: 844, height: 390 }, { phone: { width: 844, height: 390 }, client: 'phone' });
      try {
        if (!(await waitReady(c))) fail('phone boot never became ready');
        else if (!(await waitFor(c, 'window.__shell?.isOpen?.() === true', 60, 200))) fail('obshell phone boot never opened the shell');
        else if (!(await precondition(c, 'phone'))) { /* FAIL recorded */ }
        else {
          if (o.reduced) { // prepare Practice + Equipment on the phone client too (e2e-ui.mjs:5477-5483), then return to the boot place
            const place0 = await c.eval('window.__shell.place()').catch(() => 'play');
            for (const [place, host] of [['practice', 'section.ob-practice-host'], ['equipment', 'section.ob-atelier-host']]) {
              await c.eval(`window.__shell.go('${place}')`);
              if (!(await waitFor(c, `!!document.querySelector('${host}')`, 60, 150))) fail(`phone ${place}: the host never mounted (needed for the reduced-transparency register read)`);
            }
            await c.eval(`window.__shell.go('${place0}')`); await sleep(500);
          }
          if (pages.includes('phone shell 844x390')) { await sleep(500); await judgeMounted(c, 'phone shell 844x390', true); }
          if (pages.includes('phone equipment 844x390')) { // FIX26 class AT-P: the equipment host's register + the cues hint's runs, keyed on the PAGE
            const page = 'phone equipment 844x390';
            const place0 = await c.eval('window.__shell.place()').catch(() => 'play');
            await c.eval(`window.__shell.go('equipment')`);
            if (!(await waitFor(c, `!!document.querySelector('section.ob-atelier-host') && !!document.querySelector('#ob-atelier')`, 60, 150))) fail(`${page}: section.ob-atelier-host is not mounted on this client after the mount step (not a fork client: no SKIP)`);
            else {
              await c.eval(`window.__atelier.go('cues')`);
              if (!(await waitFor(c, `window.__atelier?.station?.() === 'cues'`, 60, 150))) fail(`${page}: station cues never arrived (__atelier.station() !== 'cues')`);
              else {
                await sleep(600);
                const reg = await c.eval(ATELIER_REG).catch(() => null);
                a11yEqJudged += 1;
                if (reg && reg.bgc === reg.solidRef && reg.bdf === 'none') console.log(`[kitground] A11Y ${page}: atelier host = solid rung (bg ${reg.bgc} == solid ${reg.solidRef}, blur none)`);
                else fail(`${page}: the atelier host computes ${reg?.bgc ?? 'unread'} / ${reg?.bdf === null ? 'backdrop-filter UNREADABLE' : (reg?.bdf ?? 'unread')}, want the solid rung ${reg?.solidRef ?? '?'} / none`);
                // CORR-1 C3: register (b) body.ob-glass-off — no e2e gate drives the class; the probe toggles it here and re-reads
                await c.eval(`(document.body.classList.add('ob-glass-off'), true)`); await sleep(250);
                const reg2 = await c.eval(ATELIER_REG).catch(() => null);
                if (reg2 && reg2.glassOff && reg2.bgc === reg2.solidRef && reg2.bdf === 'none') console.log(`[kitground] A11Y ${page} glass-off: atelier host = solid rung (bg ${reg2.bgc} == solid ${reg2.solidRef}, blur none)`);
                else fail(`${page} glass-off: the atelier host computes ${reg2?.bgc ?? 'unread'} / ${reg2?.bdf === null ? 'backdrop-filter UNREADABLE' : (reg2?.bdf ?? 'unread')} (glass-off ${reg2?.glassOff}), want the solid rung ${reg2?.solidRef ?? '?'} / none`);
                await c.eval(`(document.body.classList.remove('ob-glass-off'), true)`); await sleep(250);
                await setPhoneMetrics(c, { width: 844, height: 390 }); await sleep(300);
                await judgeMounted(c, page, true); // the A2 runs of the equipment page — the cues hint's RUN line among them
              }
            }
            await c.eval(`window.__shell.go('${place0}')`); await sleep(500);
          }
          if (pages.some((p) => p.startsWith('phone play'))) {
            await c.eval(`window.__shell.go('play')`);
            if (!(await waitFor(c, `!!document.querySelector('section[data-place="play"].ob-play-host')`, 60, 150))) fail('phone play: the play host never mounted');
            else {
              await waitFor(c, `!!document.querySelector('[data-ob="play-games"] .ob-cardrail-card')`, 30, 150);
              for (const [w, hh] of [[844, 390], [667, 375]]) {
                const page = `phone play ${w}x${hh}`; if (!pages.includes(page)) continue;
                await setPhoneMetrics(c, { width: w, height: hh }); await sleep(600);
                await judgeMounted(c, page, true);
              }
            }
          }
        }
      } finally { await closeClient(c); }
    }
  } finally { await stopStaticServer(server); }
  if (o.reduced && a11yJudged === 0) fail(`--reduced-transparency: no page judged the practice rung (plan had no shell page) — judged 0, skipped ${a11ySkipped}`);
  if (pages.includes('phone equipment 844x390') && a11yEqJudged === 0) fail(`phone equipment 844x390 was in the plan but a11y-equipment judged 0 (skipped ${a11yEqSkipped}) — the phone client never reached the equipment register`);
  if (pages.includes('shell replays') && !(replaysRows >= 1)) fail(`replays rows ${replaysRows ?? 'unread'}: 'shell replays' produced no visible session row in the samples`);
  console.log(`[kitground] SUMMARY runs ${nRuns} unparsed ${nUnparsed} <4.5: ${nFail} ceiling-over: ${nOver} venue ${o.venue === 'off' ? 'OFF' : 'on'} a11y-practice judged ${a11yJudged} skipped ${a11ySkipped} replays rows ${replaysRows ?? '-'} fork runs ${nForkRuns} a11y-equipment judged ${a11yEqJudged} skipped ${a11yEqSkipped}`);
  console.log(process.exitCode ? `E2E-KIT-GROUND FAIL (${nFail} run(s) below 4.5:1, ${nUnparsed} unparsed receipt(s))` : 'E2E-KIT-GROUND PASS');
}

const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  try { await main(); } catch (e) { console.error('E2E-KIT-GROUND FAIL:', e?.message ?? e); process.exit(2); }
}
