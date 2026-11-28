#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// Full-history local negative control. The normal gate and its CPU builder
// do not read historical revisions and can run in a depth-one CI checkout.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {checkPocketAssembly} from './check-pocket-assembly.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const options = {'--expect-red': true};
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--exact') { options['--exact'] = true; continue; }
  if (!['--out', '--tables', '--source-ref', '--expect-defects'].includes(args[i]) || !args[i + 1]) {
    throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  options[args[i]] = args[++i];
}
if (!options['--source-ref']) throw new Error('--source-ref is required');
const sourceRef = execFileSync('git', ['rev-parse', '--verify', `${options['--source-ref']}^{commit}`],
  {cwd: root, encoding: 'utf8'}).trim();
const readSource = relative => execFileSync('git', ['show', `${sourceRef}:${relative}`],
  {cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
const report = await checkPocketAssembly(options, {readSource, sourceRef});
process.exitCode = report.verdict === 'EXPECTED_RED' ? 0 : 1;
