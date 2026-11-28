// Copyright (c) Meta Platforms, Inc. and affiliates.

// gen-discipline-cue-1042-fixture.mjs — mint the GH-1042 old-stamp snooker
// share link and its SENDER capture on a pre-fix tree, for e2e-settings D2g.
//
// Before GH-1042 the app racked snooker on the kernel's default pairing (cue
// standard) while the share codec encoded the SELECTED spec (first visit:
// cue snooker_ash). A link minted then must replay on that pairing to show
// what the sender saw. This tool serves the pre-fix tree's web/ straight
// from git objects (no export, no file churn), boots it, switches to
// snooker the way a player does (settings changeGame), plays one fixed
// shot, and records the share link plus the sender's event bytes:
//
//   web/tools/fixtures/discipline-cue-1042.json
//     snooker.hash               the #r= link the pre-fix app minted
//     snooker.kernel_version     its stamp (a KERNEL_DEFAULT_DISCIPLINE_PAIRING_STAMPS member)
//     snooker.selected_cue       the cue the link encodes
//     snooker.sender_cue         the cue the sender's record pinned
//     snooker.sender_events_sha256  sha256 of JSON.stringify(record.events)
//
//   node web/tools/run-gate.mjs --band <lane band> -- \
//     node web/tools/gen-discipline-cue-1042-fixture.mjs --rev <pre-fix rev> [--write]
//
// Ports come from OB_E2E_PORT / OB_E2E_CDP_PORT (run-gate derives them from
// the claimed band).
//
// Without --write it prints the fixture. The rev must be a tree whose
// committed kernel stamp is in the frozen pre-fix set.

import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const REV = arg('--rev');
const PORT = Number(process.env.OB_E2E_PORT);
const CDP = Number(process.env.OB_E2E_CDP_PORT);
// GH-410 port inventory: one http server, one CDP port (offset +0 each).
export const PORT_INVENTORY = { http: 1, cdp: 1 };
if (!REV || !PORT || !CDP) {
  console.error('usage: run-gate --band <band> -- node gen-discipline-cue-1042-fixture.mjs --rev <rev> [--write]'
    + ' (needs OB_E2E_PORT and OB_E2E_CDP_PORT)');
  process.exit(2);
}
const SHOT = { v0: 3.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 };
const commit = execFileSync('git', ['rev-parse', `${REV}^{commit}`], { cwd: ROOT, encoding: 'utf8' }).trim();

// web/ of the rev through one `git cat-file --batch` process
const cat = spawn('git', ['cat-file', '--batch'], { cwd: ROOT, stdio: ['pipe', 'pipe', 'inherit'] });
let pending = Buffer.alloc(0);
const queue = [];
cat.stdout.on('data', (d) => {
  pending = Buffer.concat([pending, d]);
  for (;;) {
    const job = queue[0];
    if (!job) return;
    const nl = pending.indexOf(10);
    if (nl < 0) return;
    const head = pending.subarray(0, nl).toString();
    if (head.endsWith(' missing')) { pending = pending.subarray(nl + 1); queue.shift(); job(null); continue; }
    const size = Number(head.split(' ')[2]);
    if (pending.length < nl + 1 + size + 1) return;
    const body = pending.subarray(nl + 1, nl + 1 + size);
    pending = pending.subarray(nl + 1 + size + 1);
    queue.shift();
    job(Buffer.from(body));
  }
});
const readBlob = (rel) => new Promise((resolve) => { queue.push(resolve); cat.stdin.write(`${commit}:web/${rel}\n`); });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary',
  '.hdr': 'application/octet-stream', '.bin': 'application/octet-stream', '.webp': 'image/webp' };
const server = createServer(async (req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const body = rel.includes('..') ? null : await readBlob(rel);
  if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(rel)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(body);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

let chrome = null;
try {
  chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?obtool=1&seed=1&arm=gen1042`, { port: CDP, preflight: false });
  const until = async (expr, what, tries = 300) => {
    for (let i = 0; i < tries; i++) {
      if (await chrome.eval(expr).catch(() => false)) return;
      await sleep(200);
    }
    throw new Error(`${what} never came true`);
  };
  await until('window.__test?.ready === true', 'boot');
  await chrome.eval(`__settings.set('soundOn', false)`);
  const kv = await chrome.eval(`(async () => (await import('/dist/pool-wasm/pool_wasm.js')).kernel_version())()`);
  if (await chrome.eval(`__settings.changeGame('snooker', { skipConfirm: true })`) !== true) {
    throw new Error('changeGame(snooker) refused');
  }
  await until(`window.__settings.get().game === 'snooker' && (window.__test.equipment() || {}).table_id === 'wpbsa_snooker_12ft'`, 'snooker rack');
  for (let d = 0; d < 4; d++) {
    const pend = await chrome.eval('window.__rules?.matchState?.()?.pendingDecision?.kind ?? null');
    if (!pend) break;
    await chrome.eval('window.__rules.decide(1)');
    await sleep(300);
  }
  const selected = await chrome.eval('window.__settings.get().equipment.cue_id');
  const err = await chrome.eval(`__test.shoot(${JSON.stringify(SHOT)})`);
  if (err) throw new Error(`shot rejected: ${err}`);
  await until(`!['PLAYBACK', 'SIMULATING'].includes(window.__test.state())`, 'shot settle', 600);
  const recs = await chrome.eval('__share.records()');
  if (recs.length !== 1) throw new Error(`expected one record, got ${recs.length}`);
  const rec = JSON.parse(recs[0]);
  const url = await chrome.eval('__share.encode()');
  const fixture = {
    _what: 'GH-1042 old-stamp snooker share link + its SENDER capture (e2e-settings D2g)',
    _how: `node web/tools/gen-discipline-cue-1042-fixture.mjs --rev ${commit.slice(0, 8)} (pre-fix app: snooker racked on the kernel default pairing while the link encodes the selected spec)`,
    snooker: {
      hash: url.slice(url.indexOf('#')),
      kernel_version: kv,
      selected_cue: selected,
      sender_cue: rec.initial?.equipment?.cue_id ?? 'standard',
      sender_has_options_cue: rec.options?.cue !== undefined,
      shot: SHOT,
      sender_events_sha256: createHash('sha256').update(JSON.stringify(rec.events)).digest('hex'),
      sender_n_events: rec.events.length,
    },
  };
  const text = `${JSON.stringify(fixture, null, 2)}\n`;
  if (process.argv.includes('--write')) {
    writeFileSync(path.join(ROOT, 'web/tools/fixtures/discipline-cue-1042.json'), text);
    console.log('wrote web/tools/fixtures/discipline-cue-1042.json');
  }
  process.stdout.write(text);
} finally {
  await chrome?.closeAndWait?.();
  server.close();
  cat.stdin.end();
}
