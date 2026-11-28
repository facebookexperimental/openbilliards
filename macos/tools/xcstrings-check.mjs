#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// xcstrings-check.mjs — 7-locale completeness gate for the macOS shell
// string catalog (feature 023, T020; SC-007; the menu-i18n contract §3).
//
// Law (the menu-i18n contract §2–§3, FROZEN):
//   - EVERY key of the frozen 19-key list (menu-i18n contract §2 v1.1) exists in
//     macos/App/Resources/Localizable.xcstrings;
//   - every key present carries a non-empty, `translated`-state value in
//     ALL 7 locales (en, de, es, fr, ja, ko, zh-Hans — zh-Hans IS the
//     game's zh-CN arm, the one required Simplified Chinese);
//   - extra/unknown keys are flagged against the frozen list (adding a
//     key is an integration decision recorded in the contract table,
//     never a silent lane edit);
//   - extra/unknown locale arms are flagged;
//   - exit 0 = pass; nonzero with a per-key/per-locale report.
//
// Usage: node macos/tools/xcstrings-check.mjs [path-to-xcstrings]
// (mirrored at runtime by macos/MacAppTests/StringsMirrorTests.swift;
// runs in .github/workflows/macos.yml — SC-007's machine check).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOCALES = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'zh-Hans'];

// the menu-i18n contract §2 v1.1 — FROZEN key list (14 menu + 3 recovery
// + 2 download-failure; menu.help.* added by the 024 US5 Changelog
// amendment). Changing this list is a contract amendment routed
// through the integrator, never a lane edit.
const FROZEN_KEYS = [
  'menu.app.about',
  'menu.app.quit',
  'menu.edit.title',
  'menu.edit.cut',
  'menu.edit.copy',
  'menu.edit.paste',
  'menu.edit.selectAll',
  'menu.view.title',
  'menu.view.fullscreen',
  'menu.window.title',
  'menu.window.minimize',
  'menu.window.zoom',
  'menu.help.title',
  'menu.help.item',
  'shell.recovery.title',
  'shell.recovery.body',
  'shell.recovery.retry',
  'shell.download.failed.title',
  'shell.download.failed.body',
];

const catalogPath = process.argv[2]
  ?? fileURLToPath(new URL('../App/Resources/Localizable.xcstrings', import.meta.url));

function fail(msg) {
  console.error(`xcstrings-check: FAIL — ${msg}`);
  process.exit(1);
}

let catalog;
try {
  catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
} catch (err) {
  fail(`cannot read/parse ${catalogPath}: ${err.message}`);
}

const problems = [];

if (catalog.sourceLanguage !== 'en') {
  problems.push(`catalog sourceLanguage is ${JSON.stringify(catalog.sourceLanguage)}, expected "en"`);
}

const strings = catalog.strings ?? {};
const presentKeys = Object.keys(strings);

// 1. Frozen-list membership, both directions.
for (const key of FROZEN_KEYS) {
  if (!Object.hasOwn(strings, key)) problems.push(`${key}: MISSING key (frozen list, menu-i18n contract §2)`);
}
for (const key of presentKeys) {
  if (!FROZEN_KEYS.includes(key)) {
    problems.push(`${key}: UNKNOWN key not in the frozen list (adding a key is an integration decision, menu-i18n contract §2)`);
  }
}

// 2. Per-key locale completeness: exactly the 7 locales, each a non-empty
//    `translated`-state value.
for (const key of FROZEN_KEYS) {
  const entry = strings[key];
  if (!entry) continue; // already reported missing
  const locs = entry.localizations ?? {};
  for (const locale of LOCALES) {
    const unit = locs[locale]?.stringUnit;
    if (!unit) {
      problems.push(`${key} [${locale}]: missing locale arm`);
      continue;
    }
    if (unit.state !== 'translated') {
      problems.push(`${key} [${locale}]: state ${JSON.stringify(unit.state)} (want "translated")`);
    }
    if (typeof unit.value !== 'string' || unit.value.trim() === '') {
      problems.push(`${key} [${locale}]: empty/non-string value`);
    }
  }
  for (const locale of Object.keys(locs)) {
    if (!LOCALES.includes(locale)) {
      problems.push(`${key} [${locale}]: extra/unknown locale arm (frozen set: ${LOCALES.join(', ')})`);
    }
  }
}

if (problems.length > 0) {
  console.error(`xcstrings-check: FAIL — ${problems.length} problem(s) in ${catalogPath}`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `xcstrings-check: PASS — ${FROZEN_KEYS.length} keys x ${LOCALES.length} locales `
  + `(${LOCALES.join(', ')}) complete in ${catalogPath}`,
);
