// Copyright (c) Meta Platforms, Inc. and affiliates.

// spike-shot.mjs — headless screenshots of spike.html (full + closeup views).
//   node web/tools/spike-shot.mjs [outdir]   (default: web/)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] ? path.resolve(process.argv[2]) : webDir;
const PORT = 20350;

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const shots = [
  ['full', 'spike-preview.png', 9231],
  ['closeup', 'spike-closeup.png', 9232],
];
let failed = false;
for (const [view, file, port] of shots) {
  const errors = [];
  const chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/spike.html?view=${view}`, { width: 1600, height: 900, port });
  chrome.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      errors.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      errors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    }
  });
  await sleep(3500);
  const title = await chrome.eval('document.title');
  console.log(view, '|', title);
  await chrome.screenshot(path.join(outDir, file));
  if (errors.length) { failed = true; console.error(view, 'console errors:', errors); }
  chrome.close();
}
await stopStaticServer(server);
if (failed) process.exit(1);
console.log('spike shots written to', outDir);
