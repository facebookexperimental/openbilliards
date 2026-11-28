#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-look-id-alias — the retired look id 'sp' (GH-973), the legs that run without a browser.
//
// The look id 'sp' is retired, and the look is now 'tournament'. The browser entry points
// (a stored settings blob, ?look=sp, settings.set, __test.setLook, __gi.setLook) are pinned by
// e2e-settings arm D2e; tools/check-competitor-brands.mjs keeps the quoted id out of shipped text
// outside the declared alias sites. This test pins the rest:
//   1. the bug-report reader: a bundle filed before the rename (app.look 'sp') reads as the
//      tournament look and names the legacy id; a current bundle reads unchanged.
//   2. the bake scene: tools/render/lib/scene.mjs LOOKS keys name the gi-<look>-* files and the
//      manifest keys bake-lightmap writes, so they are exactly default + tournament; the legacy
//      id still builds the tournament scene and lamp.
//   3. the shipped lightmap set: no gi-sp-* file under web/assets/gi; every 'tournament' look entry
//      also ships under 'sp', deep-equal (the key a cached pre-rename gi.js asks for, review r1); every
//      file the manifest names exists.
//   4. the look label key: the key settings.js renders is the key the pre-rename build rendered
//      (settings.lookSp, kept through the rename so a cached dictionary or settings.js still pairs)
//      and all seven locales carry it.
//   5. web/tools/fixtures/gh973-legacy/: the real pre-rename files e2e-settings D2f serves are byte
//      for byte the base blobs they claim (git blob ids in BASE.json); private tree only (the public
//      snapshot excludes the directory).
// The flip (the tournament hall becomes what Tournament shows on a passing device) adds three legs:
//   6. a stored 'arena' (the hall's former opt-in id) is Tournament: settings.js's sanitizer and set()
//      rewrite it to 'tournament', and main.js's boot rules, run as text, read it as Tournament (the
//      hall on a passing device, the old room on a failing one).
//   7. 'tournament-legacy' and the legacy id are the old room on EVERY device, by URL only:
//      main.js's boot rules give no leaf for either on a passing device, and settings.js never
//      names 'tournament-legacy' (never stored, never listed). A scripted ?look=tournament keeps
//      the old room too (a tool asks for a grade by name); ?look=arena stays the tool value.
//   8. the bug-report reader prints what the boot showed (app.lookBoot) and the per-device verdict
//      record (app.lookVerdict) of a bundle filed after the flip, and adds no line to an older bundle;
//      bugreport.js reads the record under the key main.js writes it under.
// Exit 0 = every leg holds; 1 = a leg failed (each failure printed).
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const check = (name, ok, detail = '') => {
  if (!ok) bad++;
  process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}\n`);
};

// 1. the bug-report reader (tools/analyze-bugreport.mjs; a half-empty bundle is a normal input)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'look-id-alias-'));
try {
  const appLine = (look) => {
    const f = path.join(tmp, `${look}.json`);
    fs.writeFileSync(f, JSON.stringify({ app: { look, game: 'nine_ball' } }));
    const out = execFileSync(process.execPath, [path.join(ROOT, 'tools/analyze-bugreport.mjs'), f], { encoding: 'utf8' });
    return out.split('\n').find((l) => l.includes(' look=')) ?? '(no look= line)';
  };
  const legacy = appLine('sp');
  check("bug-report reader: a pre-rename bundle (look 'sp') reads as tournament and names the legacy id",
    / look=tournament \(recorded under the legacy look id sp/.test(legacy), legacy.trim());
  const current = appLine('tournament');
  check('bug-report reader: a current bundle reads unchanged',
    / look=tournament$/.test(current), current.trim());
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// 2. the bake scene
const scene = await import(path.join(ROOT, 'tools/render/lib/scene.mjs'));
const keys = Object.keys(scene.LOOKS);
check('bake scene: LOOKS keys are default + tournament (they name the gi files and manifest keys)',
  keys.length === 2 && keys.includes('default') && keys.includes('tournament'), JSON.stringify(keys));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let legacyScene = null;
try { legacyScene = scene.buildBakeScene('sp'); } catch (e) { legacyScene = { error: String(e && e.message) }; }
const current = scene.buildBakeScene('tournament');
check("bake scene: the legacy id builds the tournament scene (buildBakeScene('sp'))",
  !legacyScene.error && same(legacyScene.lamp, current.lamp) && legacyScene.objs.length === current.objs.length,
  legacyScene.error ?? 'lamp or object set differs');
let legacyLamp = null;
try { legacyLamp = scene.fixtureLamp('sp', 'pendant_bar'); } catch (e) { legacyLamp = String(e && e.message); }
check("bake scene: the legacy id resolves the tournament fixture lamp (fixtureLamp('sp', 'pendant_bar'))",
  same(legacyLamp, scene.fixtureLamp('tournament', 'pendant_bar')), JSON.stringify(legacyLamp));

// 3. the shipped lightmap set
const GI = path.join(ROOT, 'web/assets/gi');
const stale = fs.readdirSync(GI).filter((f) => f.startsWith('gi-sp-'));
check('lightmaps: no gi-sp-* file under web/assets/gi', stale.length === 0, stale.slice(0, 3).join(', '));
const mf = JSON.parse(fs.readFileSync(path.join(GI, 'gi-manifest.json'), 'utf8'));
const named = [];
const pairs = [];
(function walk(o, at) {
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (k === 'looks' && v && typeof v === 'object') pairs.push({ at, looks: v });
    if (k === 'files' && v && typeof v === 'object') named.push(...Object.values(v).filter((x) => typeof x === 'string'));
    walk(v, `${at}.${k}`);
  }
})(mf, 'manifest');
const unpaired = pairs.filter(({ looks }) => looks.tournament && !same(looks.sp, looks.tournament)).map(({ at }) => at);
const orphan = pairs.filter(({ looks }) => looks.sp && !looks.tournament).map(({ at }) => at);
check(`lightmaps: every 'tournament' look entry also ships under 'sp', deep-equal (${pairs.filter((p) => p.looks.tournament).length} levels)`,
  pairs.some((p) => p.looks.tournament) && unpaired.length === 0 && orphan.length === 0,
  [...unpaired.map((a) => `${a}: sp missing or different`), ...orphan.map((a) => `${a}: sp without tournament`)].slice(0, 3).join('; '));
// the alias covers the looks maps gi.js reads, nothing else: an unbaked marker's measuredKB (a recorded
// size per look, read by no loader) keeps 'default' + 'tournament' and gains no 'sp' twin
const kbTwins = [];
(function walkKB(o, at) {
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (k === 'measuredKB' && v && typeof v === 'object' && 'sp' in v) kbTwins.push(at);
    walkKB(v, `${at}.${k}`);
  }
})(mf, 'manifest');
check("lightmaps: no measuredKB map carries an 'sp' key (the alias covers looks maps only)", kbTwins.length === 0, kbTwins.slice(0, 3).join(', '));
const missing = named.filter((f) => !fs.existsSync(path.join(GI, f)));
check(`lightmaps: every file the manifest names exists (${named.length} named)`,
  named.length > 0 && missing.length === 0, missing.slice(0, 3).join(', '));

// 4. the look label key
const settingsJs = fs.readFileSync(path.join(ROOT, 'web/app/settings.js'), 'utf8');
const opt = /<option value="tournament" data-i18n="([^"]+)">/.exec(settingsJs);
const LABEL_KEY = 'settings.lookSp'; // the key the pre-rename build (8769fbf7) rendered for this option
const lacking = ['en', 'de', 'fr', 'es', 'ja', 'ko', 'zh-CN'].filter((loc) => {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, `web/app/locales/${loc}.json`), 'utf8'));
  return typeof d[LABEL_KEY] !== 'string' || !d[LABEL_KEY];
});
check(`look label: settings.js renders ${LABEL_KEY}, the pre-rename key, and all 7 locales carry it`,
  opt?.[1] === LABEL_KEY && lacking.length === 0, `settings.js key ${opt?.[1] ?? '(no tournament option)'}; missing in: ${lacking.join(', ')}`);

// 5. the real-base fixtures (private tree only)
const LEGACY = path.join(ROOT, 'web/tools/fixtures/gh973-legacy');
const privateTree = fs.existsSync(path.join(ROOT, 'scripts/opensource/sync-public-snapshot'));
if (!fs.existsSync(LEGACY)) {
  check('real-base fixtures present (the private tree carries web/tools/fixtures/gh973-legacy)', !privateTree, 'missing in the private tree');
  if (!privateTree) process.stdout.write('  SKIP real-base fixtures: the public snapshot excludes web/tools/fixtures/gh973-legacy\n');
} else {
  const rec = JSON.parse(fs.readFileSync(path.join(LEGACY, 'BASE.json'), 'utf8'));
  const off = Object.entries(rec.files).filter(([name, { blob }]) => {
    const b = fs.readFileSync(path.join(LEGACY, name));
    return crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex') !== blob;
  }).map(([name]) => name);
  check(`real-base fixtures: ${Object.keys(rec.files).length} copies match their base blob ids (${rec.base.slice(0, 8)})`,
    Object.keys(rec.files).length >= 3 && off.length === 0, off.join(', '));
}

// 6 + 7. the flip's ids: main.js's boot rules as text (the lines between its two marks are pure), settings.js's two rewrites
const mainJs = fs.readFileSync(path.join(ROOT, 'web/app/main.js'), 'utf8');
const r0 = mainJs.indexOf('// >>> LOOK-BOOT-RULES'), r1 = mainJs.indexOf('// <<< LOOK-BOOT-RULES');
let rules = null;
try { rules = new Function(`${mainJs.slice(r0, r1)}\n; return { lookDecide };`)(); } catch (e) { rules = { error: String(e && e.message) }; }
check('boot rules: main.js carries them between its two marks and they run as text', r0 > 0 && r1 > r0 && typeof rules.lookDecide === 'function', rules.error ?? 'marks missing');
if (typeof rules.lookDecide === 'function') {
  const PASS = { coarse: false, userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64', touchPoints: 0, gpu: 'ANGLE (a hardware GPU)', webgl2: true, maxTextureSize: 16384, floatBuffers: true, memoryGB: 8 };
  const LITE = { ...PASS, coarse: true };
  const decide = (query, stored, facts, scripted = false) => rules.lookDecide({ bootQ: new URLSearchParams(query), scripted, stored: () => stored, facts: () => facts, record: () => null, app: 'test', now: 0 });
  const row = (d) => `${d.asked} -> ${d.shown} (${d.flow}, ${d.why})`;
  const a1 = decide('', 'arena', PASS), a2 = decide('', 'arena', LITE), t1 = decide('', 'tournament', PASS);
  check("a stored 'arena' is Tournament: the hall by the stage flow on a passing device, as a stored 'tournament' is",
    a1.asked === 'stored:arena' && a1.shown === 'hall' && a1.flow === 'stage' && t1.shown === 'hall' && t1.flow === 'stage', `${row(a1)}; ${row(t1)}`);
  check("a stored 'arena' on a failing device: the old room, no leaf", a2.shown === 'old' && a2.flow === 'none' && a2.why === 'tier-lite', row(a2));
  for (const id of ['tournament-legacy', 'sp']) {
    const real = decide(`look=${id}`, 'tournament', PASS), tool = decide(`look=${id}`, undefined, PASS, true);
    check(`?look=${id}: the old room with no leaf on a passing device, real-user and scripted`,
      real.shown === 'old' && real.flow === 'none' && tool.shown === 'old' && tool.flow === 'none' && real.why === 'url-legacy', `${row(real)}; ${row(tool)}`);
  }
  const toolT = decide('look=tournament', 'tournament', PASS, true), realT = decide('look=tournament', 'green', PASS);
  check('?look=tournament: a scripted boot keeps the grade it names (the old room, no leaf, on a passing device); a real-user boot is Tournament',
    toolT.shown === 'old' && toolT.flow === 'none' && toolT.why === 'url-scripted' && realT.shown === 'hall' && realT.flow === 'stage', `${row(toolT)}; ${row(realT)}`);
  const toolA = decide('look=arena', 'green', LITE, true);
  check('?look=arena stays the tool value: the hall by the curtain flow on any tier', toolA.shown === 'hall' && toolA.flow === 'curtain' && toolA.why === 'url-arena', row(toolA));
  const stored = decide('', 'tournament-legacy', PASS);
  check("'tournament-legacy' is a URL value only: as a stored value it is not an id (the default, Tournament)", stored.asked === 'default' && stored.shown === 'hall', row(stored));
}
// settings.js: the sanitizer's two lines run as text (the first is the pre-flip line, the second keeps `club` only), and set()'s rewrite
const sanAt = settingsJs.indexOf("    if (v.look === 'sp') v.look = 'tournament';"), sanEnd = settingsJs.indexOf('\n', settingsJs.indexOf('\n', sanAt) + 1);
const sanitize = (look) => { const saved = { look }, v = { ...saved }; new Function('saved', 'v', 'DEFAULTS', settingsJs.slice(sanAt, sanEnd))(saved, v, { look: 'tournament' }); return v.look; };
let san = null;
try { san = ['arena', 'club', 'sp', 'green', 'tournament', 'tournament-legacy', undefined].map(sanitize); } catch (e) { san = String(e && e.message); }
check("settings sanitizer: a stored 'arena' is rewritten to 'tournament' where the legacy id is; 'club' stays; 'tournament-legacy' is not a stored id",
  sanAt > 0 && JSON.stringify(san) === JSON.stringify(['tournament', 'club', 'tournament', 'green', 'tournament', 'tournament', 'tournament']), JSON.stringify(san));
check("settings.set('look', 'arena') is rewritten to 'tournament' (the line above the legacy id's rewrite)",
  /function set\(key, value, options = \{\}\) \{\n    if \(key === 'look' && value === 'arena'\) value = 'tournament';/.test(settingsJs));
check("settings.js never names 'tournament-legacy' or an arena label (never stored, never listed)",
  !settingsJs.includes('tournament-legacy') && !settingsJs.includes('lookArena') && !/<option\b[^>]*value="arena"/.test(settingsJs));

// 8. the bug-report reader: the flip's two facts
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'look-id-alias-'));
try {
  const lines = (name, app) => {
    const f = path.join(tmp2, `${name}.json`);
    fs.writeFileSync(f, JSON.stringify({ app }));
    return execFileSync(process.execPath, [path.join(ROOT, 'tools/analyze-bugreport.mjs'), f], { encoding: 'utf8' }).split('\n');
  };
  const verdict = { v: 1, app: '0.1.0+k|html|1', verdict: 'old', why: 'pace-median', at: 1763452800000, passed: false, slow: 1, fails: { fetch: 0, build: 0, timeout: 0 }, failAt: null, reason: null,
    pace: { period: 16.67, how: 'shortest stable interval', hall: { frames: 120, median: 33.4, p95: 50.1, over: 0.93, closedBy: 'frames' }, stage: { dirty: true, frames: 40, median: 41, p95: 120, over: 0.7, before: null }, hidden: 0 } };
  const after = lines('after', { look: 'tournament', game: 'nine_ball', lookBoot: { asked: 'default', shown: 'old', flow: 'none', tier: 'base', why: 'verdict-old' }, lookVerdict: JSON.stringify(verdict) });
  const boot = after.find((l) => l.includes('look-boot:')) ?? '', rec = after.find((l) => l.includes('look-verdict:')) ?? '', pace = after.find((l) => l.includes('look-verdict pace:')) ?? '';
  check('bug-report reader: a bundle filed after the flip says what the boot showed',
    /look-boot: asked=default shown=old flow=none tier=base why=verdict-old \(the old tournament room\)$/.test(boot), boot.trim() || '(no look-boot line)');
  check('bug-report reader: ... and prints the per-device verdict record with the numbers it was made from',
    /look-verdict: verdict=old why=pace-median app=0\.1\.0\+k\|html\|1 at=2025-11-18T08:00:00\.000Z passed=false slow=1 fails=fetch:0,build:0,timeout:0$/.test(rec)
    && /period=16\.67 ms; hall at rest: frames=120 median=33\.4 p95=50\.1 over=0\.93; stage \(taken while the leaf loads, decides nothing\): frames=40 /.test(pace), `${rec.trim()} | ${pace.trim()}`);
  check('bug-report reader: the look= line of such a bundle is the line it was', / look=tournament$/.test(after.find((l) => l.includes(' look=')) ?? ''));
  const none = lines('none', { look: 'green', game: 'nine_ball', lookBoot: { asked: 'stored:green', shown: 'green', flow: 'none', tier: null, why: 'stored-green' }, lookVerdict: null });
  check('bug-report reader: no stored record reads as none', none.some((l) => /look-verdict: <none stored>$/.test(l)) && none.some((l) => /look-boot: asked=stored:green shown=green flow=none tier=null why=stored-green$/.test(l)));
  const corrupt = lines('corrupt', { look: 'tournament', lookBoot: null, lookVerdict: '{not json' });
  check('bug-report reader: a corrupt record and an absent fact are printed, not thrown', corrupt.some((l) => l.includes('look-verdict: <record unparseable>')) && corrupt.some((l) => /look-boot: null$/.test(l)));
  const before = lines('before', { look: 'tournament', game: 'nine_ball' });
  check('bug-report reader: a bundle filed before the flip gains no line', !before.some((l) => l.includes('look-boot') || l.includes('look-verdict')));
} finally {
  fs.rmSync(tmp2, { recursive: true, force: true });
}
const bugJs = fs.readFileSync(path.join(ROOT, 'web/app/bugreport.js'), 'utf8');
const keyOf = (text) => /const LOOK_VERDICT_KEY = '([^']+)';/.exec(text)?.[1] ?? null;
check('bug report: bugreport.js reads the verdict record under the key main.js writes it under, and records the boot fact',
  keyOf(mainJs) !== null && keyOf(mainJs) === keyOf(bugJs) && /lookBoot: window\.__test\?\.lookBoot \?\? null,/.test(bugJs) && /lookVerdict: sec\(\(\) => localStorage\.getItem\(LOOK_VERDICT_KEY\)\),/.test(bugJs),
  `main ${keyOf(mainJs)}, bugreport ${keyOf(bugJs)}`);

process.stdout.write(`test-look-id-alias: ${bad ? `${bad} FAILURE(S)` : 'OK'}\n`);
process.exit(bad ? 1 : 0);
