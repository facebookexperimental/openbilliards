// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { generatedBootCopy, KEYS, TARGETS } from './gen_boot_copy.mjs';

const ROOT = new URL('../../../', import.meta.url);
const APP_COPY = 'web/app/locales/boot.js';
const SCENE_COPY = 'web/scene/cn8-boot-copy.js';
const readCopy = target => fs.readFileSync(new URL(target, ROOT), 'utf8');
// Identity rule: the two generated copies are WHOLE-FILE byte-identical (the
// generated header names the generator, never the emitted path).
const identicalCopies = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
function assertIdenticalCopies(app, scene, label) {
  assert.ok(app.length > 0 && scene.length > 0, label + ': empty copy');
  assert.ok(identicalCopies(app, scene), label + ': the two generated copies differ');
}
const source = readCopy(SCENE_COPY);
const readLocale = locale => JSON.parse(fs.readFileSync(new URL('../../../web/app/locales/' + locale + '.json', import.meta.url), 'utf8'));

async function labels(translator) {
  const context = vm.createContext({ window: { __i18n: translator } });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => { throw new Error('Recovery copy must not load a locale or a module'); });
  await module.evaluate();
  return module.namespace;
}

test('I1 the recovery bundle is byte-generated from keys present in all seven locales', () => {
  assert.deepEqual([...TARGETS], [APP_COPY, SCENE_COPY]);
  for (const target of TARGETS) assert.equal(readCopy(target), generatedBootCopy(), target);
  for (const locale of ['en', 'zh-CN', 'es', 'ja', 'de', 'fr', 'ko']) {
    const dict = readLocale(locale);
    for (const key of KEYS) assert.equal(typeof dict[key], 'string', locale + ': ' + key);
    assert.match(dict['error.reloadMessage'], /\{message\}/);
  }
});

test('I2 the app-side and scene-side copies are whole-file byte-identical', () => {
  const app = readCopy(APP_COPY), scene = readCopy(SCENE_COPY);
  assertIdenticalCopies(app, scene, APP_COPY + ' vs ' + SCENE_COPY);
  assert.equal(scene, source);
  // Layering: the scene imports its own copy and never reaches into web/app.
  const table = fs.readFileSync(new URL('web/scene/table.js', ROOT), 'utf8');
  assert.equal(table.match(/^import \* as bootCopy from '\.\/cn8-boot-copy\.js';$/m)?.length, 1);
  assert.doesNotMatch(table, /from '\.\.\/app\//);
});

test('I2 negative arm: a one-byte divergence of a scratch copy is refused', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'cn8-boot-copy-arm-'));
  const app = readCopy(APP_COPY);
  const appScratch = path.join(scratch, 'boot.js'), sceneScratch = path.join(scratch, 'cn8-boot-copy.js');
  fs.writeFileSync(appScratch, app);
  const at = app.indexOf('fallback[key]');
  assert.ok(at > 0);
  fs.writeFileSync(sceneScratch, app.slice(0, at) + 'F' + app.slice(at + 1));
  const a = fs.readFileSync(appScratch, 'utf8'), b = fs.readFileSync(sceneScratch, 'utf8');
  assert.equal(a.length, b.length);
  assert.notEqual(a, b);
  assert.throws(() => assertIdenticalCopies(a, b, 'scratch'), /the two generated copies differ/);
  // The real copies are untouched by the arm.
  assert.ok(identicalCopies(readCopy(APP_COPY), readCopy(SCENE_COPY)));
});

test('I1 translated error labels and the message parameter use the live locale', async () => {
  for (const locale of ['en', 'zh-CN', 'es', 'ja', 'de', 'fr', 'ko']) {
    const dict = readLocale(locale), calls = [];
    const api = await labels({ keys: () => Object.keys(dict),
      t(key, params) { calls.push(key); return dict[key].replace(/\{message\}/g, () => params?.message); } });
    assert.equal(api.t('error.reloadPage'), dict['error.reloadPage']);
    assert.equal(api.t('error.reloadMessage', { message: 'CN8_TRANSPORT_ARTIFACT_MISSING' }),
      dict['error.reloadMessage'].replace('{message}', 'CN8_TRANSPORT_ARTIFACT_MISSING'));
    assert.equal(api.t('error.dismissErrors'), dict['error.dismissErrors']);
    assert.equal(calls.length, 3);
  }
});

test('I1 missing or not-yet-ready i18n uses the same English key without a loader or raw-key paint', async () => {
  for (const translator of [undefined, { keys: () => [], t() { throw new Error('Uninitialized locale'); } }]) {
    const api = await labels(translator), dict = readLocale('en');
    for (const key of KEYS) {
      assert.equal(api.t(key, { message: 'E' }), dict[key].replace('{message}', 'E'));
    }
  }
});

function literalFindings(text) {
  const rows = [];
  for (const match of text.matchAll(/(?:\.textContent\s*=\s*|setAttribute\(\s*['"]aria-label['"]\s*,\s*)(['"])([^'"\r\n]*)\1/g)) {
    if (/[A-Za-z]/.test(match[2])) rows.push(match[2]);
  }
  for (const literal of ['Reload page', ' Reload this page to retry.', 'Building the room', 'dismiss errors']) {
    if (text.includes("'" + literal + "'") || text.includes('"' + literal + '"')) rows.push(literal);
  }
  return rows;
}
test('I1 the touched modules have no orphan textContent/aria English or any of the seven retired literal sites', () => {
  for (const file of ['app/main.js', 'app/settings.js', 'scene/table.js']) {
    const text = fs.readFileSync(new URL('../../../web/' + file, import.meta.url), 'utf8');
    assert.deepEqual(literalFindings(text), [], file);
  }
  assert.ok(literalFindings("button.textContent = 'A new untranslated action';").length);
  assert.ok(literalFindings("button.setAttribute('aria-label', 'A new accessible label');").length);
});
