// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-realtime-capture-meta.mjs — issue #983 (review r1 P2): a realtime
// capture's blob meta describes the size the capture RECORDED, not the size
// the live canvas has after the capture.
//
// playback.js's realtime capture (GH-250) drops the player's live latch for
// the run (main.js then defers a window resize) and re-latches on every
// settled path (relatchLive), which applies the deferred resize. The blob's
// `uhd` flag then gates the Photos conversion offer (transcodeOkFor). Read at
// meta time, the live canvas already has the post-capture size: a 2560×1440
// capture resized to 1280×720 mid-run was marked uhd:false and offered a
// conversion the UHD probes refuse; the reverse withheld a supported one.
//
// The production code runs in a vm, sliced from the tree by the vendored acorn:
// main.js's resize block (pendingResize … the window 'resize' listener) and
// its __test.setManual; playback.js's relatchLive, transcodeOkFor, and from
// startRealtime the capture-start dims read (`let capDims` + its try) and the
// realtime lastBlobMeta assignment. Legs:
//   shrink  capture at 2560×1440, window → 1280×720 mid-capture: the resize
//           waits (canvas still 2560×1440), lands at relatchLive (canvas
//           1280×720), and the meta says uhd:true — no Photos offer on a
//           matrix without the UHD probes.
//   grow    capture at 1280×720, window → 2560×1440: canvas grows at the
//           re-latch, the meta says uhd:false — the HD offer stands.
// A leg whose resize never landed is INVALID (the test would prove nothing).
//
//   node web/tools/test-realtime-capture-meta.mjs   # exit 0 PASS, 1 FAIL, 2 INVALID
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as acorn from '../../tools/render/lib/vendor/acorn/acorn.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const MAIN = fs.readFileSync(path.join(ROOT, 'web', 'app', 'main.js'), 'utf8');
const PB = fs.readFileSync(path.join(ROOT, 'web', 'app', 'playback.js'), 'utf8');

let invalid = 0, failed = 0;
const P = (s) => console.log(`[capmeta] ${s}`);
const bad = (s) => { failed += 1; console.log(`[capmeta] FAIL ${s}`); };
const inval = (s) => { invalid += 1; console.log(`[capmeta] INVALID ${s}`); };

function nodes(src, pred) {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (typeof n.type === 'string' && pred(n)) out.push(n);
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' }));
  return out;
}
function one(list, what) {
  if (list.length !== 1) { inval(`${what}: ${list.length} matches (want exactly 1)`); return null; }
  return list[0];
}

// ---- slices -------------------------------------------------------------------
const rzA = MAIN.indexOf('  let pendingResize = false;');
const rzB = MAIN.indexOf("  window.addEventListener('resize', () => {", rzA);
const rzEnd = rzB < 0 ? -1 : MAIN.indexOf('\n  });\n', rzB);
if (rzA < 0 || rzB < 0 || rzEnd < 0) inval('main.js resize block (pendingResize … the resize listener) not found');
const latch = one(nodes(MAIN, (n) => n.type === 'Property' && n.key?.name === 'setManual'), 'main.js __test.setManual');
const relatch = one(nodes(PB, (n) => n.type === 'FunctionDeclaration' && n.id?.name === 'relatchLive'), 'playback.js relatchLive');
const gate = one(nodes(PB, (n) => n.type === 'FunctionDeclaration' && n.id?.name === 'transcodeOkFor'), 'playback.js transcodeOkFor');
const rt = one(nodes(PB, (n) => n.type === 'FunctionDeclaration' && n.id?.name === 'startRealtime'), 'playback.js startRealtime');
let capRead = null, meta = null;
if (rt) {
  const body = rt.body.body;
  const i = body.findIndex((s) => s.type === 'VariableDeclaration' && s.declarations.some((d) => d.id?.name === 'capDims'));
  if (i < 0 || body[i + 1]?.type !== 'TryStatement') inval('startRealtime: `let capDims` followed by its try (the capture-start dims read) not found');
  else capRead = PB.slice(body[i].start, body[i + 1].end);
  meta = one(nodes(PB.slice(rt.start, rt.end), (n) => n.type === 'AssignmentExpression'
    && n.left?.name === 'lastBlobMeta' && n.right?.type === 'ObjectExpression'), 'startRealtime lastBlobMeta = { … }');
  if (meta) meta = PB.slice(rt.start, rt.end).slice(meta.start, meta.end);
}
if (invalid) { P(`verdict INVALID (${invalid})`); process.exit(2); }

// ---- one capture in a vm --------------------------------------------------------
// the matrix of an engine whose transcoder decodes VP9 and encodes AVC at HD but
// has no UHD leg: an above-HD clip must not earn the Photos conversion offer
const HD_ONLY = { ok: true, vp9: true, vp8: true, avcUhd: false, vp9Uhd: false, vp8Uhd: false };
function capture(tag, from, to) {
  const canvas = { width: from[0], height: from[1] };
  const handlers = {};
  const win = { innerWidth: from[0], innerHeight: from[1], addEventListener: (k, f) => { handlers[k] = f; } };
  const box = vm.createContext({
    window: win,
    document: { querySelector: (sel) => (sel === 'body > canvas' ? canvas : null) },
    renderer: { setSize: (w, h) => { canvas.width = w; canvas.height = h; } },
    composer: { setSize() {}, render() {} },
    camera: { aspect: 1, updateProjectionMatrix() {} },
    manual: false, homePose: null, homeResizePending: false, atHome: () => false, camHome() {},
    pb: {}, rec: { mime: 'video/webm;codecs=vp9' }, lastBlobMeta: null, transcodeCap: HD_ONLY,
  });
  vm.runInContext(`${MAIN.slice(rzA, rzEnd + '\n  });'.length)}
window.__test = { setManual: ${MAIN.slice(latch.value.start, latch.value.end)} };
${PB.slice(relatch.start, relatch.end)}
${PB.slice(gate.start, gate.end)}`, box);
  // the player is open (live latch); the capture starts: latch dropped, dims read
  vm.runInContext('window.__test.setManual(true, { live: true });', box);
  vm.runInContext(`window.__test.setManual(true);\n${capRead}`, box);
  // the window resizes mid-capture
  win.innerWidth = to[0]; win.innerHeight = to[1];
  handlers.resize?.();
  const during = { ...canvas };
  // the capture settles: re-latch (the deferred resize lands), then the meta
  // (top-level let bindings — capDims, pendingResize — persist across scripts of one context)
  vm.runInContext(`relatchLive();\n${meta};\nglobalThis.__offer = transcodeOkFor();`, box);
  const after = { ...canvas };
  const m = vm.runInContext('lastBlobMeta', box);
  const offer = vm.runInContext('globalThis.__offer', box);
  const wantUhd = from[0] > 1920 || from[1] > 1080;
  P(`${tag} ${from.join('x')} -> ${to.join('x')}: canvas during ${during.width}x${during.height}, after re-latch ${after.width}x${after.height}; meta ${JSON.stringify(m)}; Photos offer ${offer}`);
  if (during.width !== from[0] || during.height !== from[1]) inval(`${tag}: the mid-capture resize was not held back (canvas ${during.width}x${during.height})`);
  if (after.width !== to[0] || after.height !== to[1]) inval(`${tag}: the deferred resize never landed at the re-latch (canvas ${after.width}x${after.height}) — the leg proves nothing`);
  if (m?.uhd !== wantUhd) bad(`${tag}: the meta must describe the RECORDED ${from.join('x')} (uhd ${wantUhd}), got uhd ${m?.uhd} — the post-capture canvas leaked into the blob's meta`);
  if (offer !== !wantUhd) bad(`${tag}: the Photos conversion offer must be ${!wantUhd} on an HD-only transcoder for a ${from.join('x')} clip, got ${offer}`);
}
capture('shrink', [2560, 1440], [1280, 720]);
capture('grow', [1280, 720], [2560, 1440]);

const verdict = invalid ? 'INVALID' : failed ? 'FAIL' : 'PASS';
P(`verdict ${verdict}${invalid ? ` (${invalid} invalid)` : failed ? ` (${failed} failed)` : ' — 2 legs: the blob meta keeps the recorded size across a mid-capture resize, both ways'}`);
process.exit(invalid ? 2 : failed ? 1 : 0);
