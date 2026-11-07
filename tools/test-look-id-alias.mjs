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

process.stdout.write(`test-look-id-alias: ${bad ? `${bad} FAILURE(S)` : 'OK'}\n`);
process.exit(bad ? 1 : 0);
