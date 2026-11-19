#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

/** Local source law supplement to the shared ci-bands lint. */
import fs from 'node:fs';
import { isRoxMain } from './lib/cli_rox.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRoxPortInventory } from './lib/ports_rox.mjs';

export const PORT_INVENTORY = { http: 0, cdp: 0 };

export function sourceProblems(text, file) {
  const problems = [];
  // The retired scratch band must never return as a port guard or default.
  // Word boundaries exclude SHA digests; this also audits usage examples.
  for (const [i, line] of text.split('\n').entries()) {
    if (/\b93[7-9][0-9]\b/.test(line)) problems.push(`${file}:${i + 1}: ROX_PRIVATE_PORT_RANGE_REFUSED`);
  }
  if (file.endsWith('.mjs')) {
    try {
      if (!parseRoxPortInventory(text)) problems.push(`${file}: ROX_PORT_INVENTORY_MISSING`);
    } catch (error) { problems.push(`${file}: ROX_PORT_INVENTORY_REFUSED: ${error.message}`); }
  }
  return problems;
}

export function sourceFence(root) {
  const problems = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== '__pycache__') problems.push(...sourceFence(file));
    if (entry.isFile() && /\.(mjs|py|sh|md)$/.test(file)) problems.push(...sourceProblems(fs.readFileSync(file, 'utf8'), file));
  }
  return problems;
}

if (isRoxMain(import.meta.url)) {
  const args = process.argv.slice(2), i = args.indexOf('--root');
  const root = i >= 0 ? path.resolve(args[i + 1]) : fileURLToPath(new URL('.', import.meta.url));
  const problems = sourceFence(root);
  console.log(JSON.stringify({ passed: !problems.length, root, problems }, null, 2));
  if (problems.length) process.exitCode = 1;
}
