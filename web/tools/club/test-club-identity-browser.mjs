#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-identity-browser.mjs — the browser part of the identity arm: compares the records of two boots of the app with
// the `club` look OFF (tournament or green), one from the base commit's tree and one from the tip tree, taken by the lane's
// shot tool with `--requests` and the program census as `--json`:
//
//   --requests --json "(async () => { const r = __dbg.renderer, gl = r.getContext(), enc = new TextEncoder();
//     const h = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s)))))
//       .map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
//     const out = []; for (const p of r.info.programs) out.push([await h(p.cacheKey), await h(gl.getShaderSource(p.vertexShader)),
//       await h(gl.getShaderSource(p.fragmentShader)), String(p.name), String(p.cacheKey).length].join(' '));
//     return { n: out.length, programs: out.sort(), club: typeof window.__club, textures: r.info.memory.textures,
//       geometries: r.info.memory.geometries }; })()"
//
// Each program row is: digest of three's program cache key, digest of the vertex source the driver received, digest of the
// fragment source, the shader name, the key length. Equal sorted lists mean the look-off boot compiled the same programs
// from the same text.
//
// THE ASSERTION, per pair (base record, tip record). Red when:
//   RECORD    a record is not an app-mode record with a request log and a census, the two looks differ, the look is `club`,
//             or a record carries an app error
//   REQUEST   a request path under /scene/club/ or /assets/club/ in either log
//   REQUESTS  the two request logs differ as multisets of paths
//   PROGRAMS  the two program censuses differ
//   COUNTS    a view's draw calls, triangles, programs, textures or geometries differ
//   CLUB      window.__club exists on the page
//   ROUND4    (round 4, when the tip record carries `json.r4`, see below) the scene holds the motion root, a resource entry
//             of the page names a club path, or a window global of the look exists. The request log is the proof that no
//             listener and no audio node of the look exists with the look off: every one of them is made by code under
//             /scene/club/, and no such file was fetched (REQUEST names the round-4 modules when it fires).
// The round-4 census adds one member to the `--json` object above:
//     r4: { motionRoot: !!__dbg.scene.getObjectByName('obAimClubMotion'),
//           resources: performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname).filter((p) => /\/(scene|assets)\/club\//.test(p)),
//           globals: Object.keys(window).filter((k) => /^__club/i.test(k)) }
// Informational: when the JPEG a record names sits beside it, its sha256 is printed and compared (equal bytes are expected
// from the software renderer the loan host uses; the pinned captures on the capture GPU are a separate proof).
//
// Usage:
//   node web/tools/club/test-club-identity-browser.mjs <base-record.json> <tip-record.json> [<base> <tip> ...]
//   node web/tools/club/test-club-identity-browser.mjs --selftest      (also what a run without arguments does)
// exit 0 = every pair equal, 1 = red, 2 = could not run.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CLUB_PATH = /^\/(?:scene|assets)\/club\//;
const ROUND4_PATH = /^\/scene\/club\/(?:audio|motion)(?:\.js$|\/)/;
const COUNT_KEYS = ['calls', 'triangles', 'programs', 'textures', 'geometries'];

/** Compare two shot records. Returns { failures: [{ code, msg }], facts }. */
export function judgePair(base, tip) {
  const failures = [];
  const fail = (code, msg) => failures.push({ code, msg });
  for (const [name, r] of [['base', base], ['tip', tip]]) {
    if (!r || r.mode !== 'app') { fail('RECORD', `${name}: not an app-mode record`); continue; }
    if (!Array.isArray(r.requests)) fail('RECORD', `${name}: no request log (run with --requests)`);
    if (!r.json || !Array.isArray(r.json.programs)) fail('RECORD', `${name}: no program census (run with the --json census)`);
    if (r.look === 'club' || r.look === 'arena') fail('RECORD', `${name}: the look is ${r.look}; this arm compares look-off boots`); // round A1: `arena` loads the same leaf
    if (Array.isArray(r.errors) && r.errors.length) fail('RECORD', `${name}: app errors: ${r.errors.join(' | ').slice(0, 200)}`);
    if (r.error) fail('RECORD', `${name}: ${String(r.error).slice(0, 200)}`);
  }
  if (failures.length) return { failures, facts: {} };
  if (base.look !== tip.look || base.table !== tip.table) fail('RECORD', `the pair differs in look or table (${base.look}/${base.table} vs ${tip.look}/${tip.table})`);
  for (const [name, r] of [['base', base], ['tip', tip]]) {
    const hits = r.requests.filter((p) => CLUB_PATH.test(p));
    if (hits.length) fail('REQUEST', `${name}: ${hits.length} request(s) into the club directories: ${hits.slice(0, 4).join(', ')}`);
    if (r.json.club !== undefined && r.json.club !== 'undefined') fail('CLUB', `${name}: window.__club is ${r.json.club}`);
    const r4hits = hits.filter((p) => ROUND4_PATH.test(p));
    if (r4hits.length) fail('ROUND4', `${name}: a round-4 module was requested with the look off: ${r4hits.slice(0, 4).join(', ')}`);
    const r4 = r.json.r4;
    if (r4 && typeof r4 === 'object') {
      if (r4.motionRoot === true) fail('ROUND4', `${name}: the motion root obAimClubMotion is in the scene`);
      if (Array.isArray(r4.resources) && r4.resources.length) fail('ROUND4', `${name}: resource entries under the club directories: ${r4.resources.slice(0, 4).join(', ')}`);
      if (Array.isArray(r4.globals) && r4.globals.length) fail('ROUND4', `${name}: window globals of the look: ${r4.globals.join(', ')}`);
    } else if (name === 'tip' && r4 !== undefined) fail('RECORD', 'tip: json.r4 is not an object');
  }
  const multiset = (list) => { const m = new Map(); for (const p of list) m.set(p, (m.get(p) ?? 0) + 1); return m; };
  const a = multiset(base.requests), b = multiset(tip.requests);
  const onlyBase = [...a].filter(([p, n]) => (b.get(p) ?? 0) < n).map(([p]) => p), onlyTip = [...b].filter(([p, n]) => (a.get(p) ?? 0) < n).map(([p]) => p);
  if (onlyBase.length || onlyTip.length) fail('REQUESTS', `the request logs differ: only or more often at the base [${onlyBase.slice(0, 5).join(', ')}], at the tip [${onlyTip.slice(0, 5).join(', ')}]`);
  const pa = base.json.programs.slice().sort(), pb = tip.json.programs.slice().sort();
  if (pa.length !== pb.length || pa.some((x, i) => x !== pb[i])) {
    const sa = new Set(pa), sb = new Set(pb);
    fail('PROGRAMS', `the program censuses differ: ${pa.length} at the base, ${pb.length} at the tip; only at the base [${pa.filter((x) => !sb.has(x)).slice(0, 2).join(' | ')}], only at the tip [${pb.filter((x) => !sa.has(x)).slice(0, 2).join(' | ')}]`);
  }
  const views = [...new Set([...Object.keys(base.views ?? {}), ...Object.keys(tip.views ?? {})])].sort();
  for (const v of views) {
    const ca = base.views?.[v]?.counts, cb = tip.views?.[v]?.counts;
    if (!ca || !cb) { fail('COUNTS', `view ${v} is missing on one side`); continue; }
    const diff = COUNT_KEYS.filter((k) => ca[k] !== cb[k]);
    if (diff.length) fail('COUNTS', `view ${v}: ${diff.map((k) => `${k} ${ca[k]} -> ${cb[k]}`).join(', ')}`);
  }
  return { failures, facts: { look: base.look, requests: base.requests.length, programs: pa.length, views, r4: tip.json.r4 && typeof tip.json.r4 === 'object' } };
}

function pictures(recordPath, record) {
  const out = {};
  for (const [v, row] of Object.entries(record.views ?? {})) {
    const f = path.join(path.dirname(recordPath), String(row.file ?? ''));
    try { out[v] = createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch { out[v] = null; }
  }
  return out;
}

function run(pairs) {
  let red = 0;
  for (const [basePath, tipPath] of pairs) {
    let base, tip;
    try { base = JSON.parse(fs.readFileSync(basePath, 'utf8')); tip = JSON.parse(fs.readFileSync(tipPath, 'utf8')); } catch (e) {
      process.stdout.write(`test-club-identity-browser: could not read a record — ${e.message}\n`);
      return 2;
    }
    const { failures, facts } = judgePair(base, tip);
    red += failures.length;
    const label = `${path.basename(basePath)} vs ${path.basename(tipPath)}`;
    for (const f of failures) process.stdout.write(`  FAIL ${f.code} ${label}: ${f.msg}\n`);
    if (!failures.length) {
      process.stdout.write(`  ok   ${label}: look ${facts.look}, ${facts.requests} requests equal (none into the club directories), ${facts.programs} programs equal`
        + ` (key, vertex text, fragment text), counts equal at ${facts.views.join(', ') || 'no view'}, no window.__club`
        + `${facts.r4 ? '; round 4: no motion root, no club resource entry, no global of the look' : '; round 4: the tip record has no json.r4 (request log only)'}\n`);
    }
    const pa = pictures(basePath, base), pb = pictures(tipPath, tip);
    for (const v of Object.keys(pa)) {
      if (pa[v] && pb[v]) process.stdout.write(`  note ${label}: picture ${v} ${pa[v] === pb[v] ? 'is byte-equal' : 'DIFFERS in bytes'} (sha256 ${pa[v].slice(0, 16)} / ${pb[v].slice(0, 16)}; software renderer, informational)\n`);
    }
  }
  process.stdout.write(`test-club-identity-browser: ${red ? `${red} FAILURE(S)` : 'OK'} — ${pairs.length} pair(s)\n`);
  return red ? 1 : 0;
}

function selftest() {
  let ok = true;
  const rec = (over = {}) => ({ mode: 'app', look: 'tournament', table: 'pool_pro_9ft', errors: [],
    requests: ['/app.html', '/app/main.js', '/scene/table.js', '/app/main.js'],
    views: { V1: { file: 'x-V1.jpg', counts: { calls: 197, triangles: 356937, programs: 42, textures: 66, geometries: 178 } } },
    json: { n: 2, programs: ['aa bb cc  260', 'dd ee ff OutputShader 66'], club: 'undefined' }, ...over });
  const arm = (name, want, base, tip) => {
    const codes = [...new Set(judgePair(base, tip).failures.map((f) => f.code))];
    const good = want === null ? codes.length === 0 : codes.length === 1 && codes[0] === want;
    ok &&= good;
    process.stdout.write(`${good ? 'ok  ' : 'FAIL'} ${name}: want ${want ?? 'no failure'}, got [${codes.join(', ')}]\n`);
  };
  arm('control: two equal records (request order may differ)', null, rec(), rec({ requests: ['/app/main.js', '/app.html', '/app/main.js', '/scene/table.js'] }));
  arm('plant: the tip requests a club module', 'REQUEST', rec({ requests: [...rec().requests, '/scene/club/index.js'] }), rec({ requests: [...rec().requests, '/scene/club/index.js'] }));
  arm('plant: the tip requests a club asset', 'REQUEST', rec({ requests: [...rec().requests, '/assets/club/manifest.json'] }), rec({ requests: [...rec().requests, '/assets/club/manifest.json'] }));
  arm('plant: the tip requests one more file', 'REQUESTS', rec(), rec({ requests: [...rec().requests, '/vendor/jsm/postprocessing/GTAOPass.js'] }));
  arm('plant: the tip requests a file twice', 'REQUESTS', rec(), rec({ requests: [...rec().requests, '/scene/table.js'] }));
  arm('plant: one program text differs', 'PROGRAMS', rec(), rec({ json: { n: 2, programs: ['aa bb c0  260', 'dd ee ff OutputShader 66'], club: 'undefined' } }));
  arm('plant: one more program', 'PROGRAMS', rec(), rec({ json: { n: 3, programs: ['aa bb cc  260', 'dd ee ff OutputShader 66', 'gg hh ii  300'], club: 'undefined' } }));
  arm('plant: one more draw call at a view', 'COUNTS', rec(), rec({ views: { V1: { file: 'x-V1.jpg', counts: { calls: 198, triangles: 356937, programs: 42, textures: 66, geometries: 178 } } } }));
  arm('plant: window.__club exists', 'CLUB', rec(), rec({ json: { ...rec().json, club: 'object' } }));
  // round 4
  const r4 = (over = {}) => ({ ...rec().json, r4: { motionRoot: false, resources: [], globals: [], ...over } });
  const codesOf = (base, tip) => [...new Set(judgePair(base, tip).failures.map((f) => f.code))].sort().join(',');
  arm('control: a tip record with the round-4 census, a base record without it', null, rec(), rec({ json: r4() }));
  arm('plant: the motion root is in the scene with the look off', 'ROUND4', rec(), rec({ json: r4({ motionRoot: true }) }));
  arm('plant: a resource entry under the club directories', 'ROUND4', rec(), rec({ json: r4({ resources: ['/scene/club/audio/bed.js'] }) }));
  arm('plant: a global of the look on the window', 'ROUND4', rec(), rec({ json: r4({ globals: ['__clubAudio'] }) }));
  {
    const got = codesOf(rec(), rec({ requests: [...rec().requests, '/scene/club/motion/dust.js'] }));
    const good = got === 'REQUEST,REQUESTS,ROUND4';
    ok &&= good;
    process.stdout.write(`${good ? 'ok  ' : 'FAIL'} plant: the tip requests a round-4 module: want REQUEST + REQUESTS + ROUND4, got [${got}]\n`);
  }
  arm('plant: a record without a request log', 'RECORD', rec(), rec({ requests: undefined }));
  arm('plant: a club boot handed to the look-off arm', 'RECORD', rec(), rec({ look: 'club' }));
  arm('plant: an arena boot handed to the look-off arm', 'RECORD', rec(), rec({ look: 'arena' }));
  arm('plant: tournament compared with green', 'RECORD', rec(), rec({ look: 'green' }));
  arm('plant: an app error on one side', 'RECORD', rec(), rec({ errors: ['TypeError: x is not a function'] }));
  process.stdout.write(`selftest: ${ok ? 'every plant caught, the control green' : 'a plant was missed or the control went red'}\n`);
  return ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2).filter((a) => a.endsWith('.json') || a.startsWith('--'));
  const files = argv.filter((a) => !a.startsWith('--'));
  if (argv.includes('--selftest') || files.length === 0) {
    if (!argv.includes('--selftest')) process.stdout.write('test-club-identity-browser: no record pair given — running the self-test only (usage: <base-record.json> <tip-record.json> ...)\n');
    process.exit(selftest());
  }
  if (files.length % 2) { process.stdout.write('test-club-identity-browser: records come in pairs (base, tip)\n'); process.exit(2); }
  const pairs = [];
  for (let i = 0; i < files.length; i += 2) pairs.push([files[i], files[i + 1]]);
  process.exit(run(pairs));
}
