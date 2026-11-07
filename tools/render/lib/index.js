// Copyright (c) Meta Platforms, Inc. and affiliates.

// Explicit directory entry for `node --test tools/render/lib/` on Node
// versions that resolve directory arguments through their module loader.
import { readdir } from 'node:fs/promises';

const directory = new URL('.', import.meta.url);
const tests = (await readdir(directory)).filter((name) => name.endsWith('.test.mjs')).sort();
if (!tests.length) throw new Error('render library test entry found no tests');
for (const name of tests) await import(new URL(name, directory));
