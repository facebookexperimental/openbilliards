// Copyright (c) Meta Platforms, Inc. and affiliates.

// GH-911 C4 (X1): the generator of web/tools/fixtures/povpose-corpus-911.json,
// the committed POV corpus a CI checkout has. The issue corpus sits under
// the RL-research runs/ dir (internal), which .gitignore:80-81 ignores (card:3199-3207).
// "card" is the GH-911 design card DESIGN-911 and "plan" its build plan
// PLAN-911-IMPL (C4); playback.js line cites are at BASE 10197041.
//
//   node web/tools/mk-povpose-corpus.mjs --rev <REV> [--out <path>] [--main-out <path>] <records.jsonl>
//
// Per record the fixture keeps only what recCueId, povTImpact, povAnchors and
// the leaf read (card:3208-3213): events[0] (the Strike), the first BallBall
// event and the struck ball's first BallLinearCushion event, each {t, kind} in
// record order; the struck ball's {id, state.pos, params.r}; and shot.phi.
// Beside them, "main" holds <REV>'s povAnchors output on each FULL record. The
// header names the source sha256, the record count, the rev and the sha256 of
// the `git show <REV>:web/app/playback.js` bytes (card:3212-3213).
//
// main is the rev's, never the working file's: the text is read with
// `git show <REV>:web/app/playback.js` in the repo that holds this script, so a
// working povAnchors that reads the leaf (C3) does not reach "main" (plan C4).
// recCueId, povTImpact, povScript, POV_FOV and povAnchors are sliced from that
// text with the vendored acorn (tools/render/lib/vendor/acorn, 8.17.0): exactly
// one FunctionDeclaration each for the four functions and one VariableDeclarator
// for POV_FOV (sliced as its whole VariableDeclaration), each [start, end); zero
// or two matches throw. At BASE they start at playback.js:3884, :3913, :3948,
// :3961 and :3967. They run through new Function on record data alone.
//
// Beside the corpus it writes web/tools/fixtures/povpose-main-911.json
// (--main-out): the rev's recCueId, povTImpact and povAnchors declaration
// texts, each with its sha256, which test-povpose.mjs runs under the running
// engine as case 1's reference (the stored "main" was computed on one engine;
// presentation math may differ by 1 ulp across CPU architectures).
// Re-running on the same source and rev writes identical bytes (card:3228-3229).
// The test reads the fixture and never regenerates it (X1, card:3231); a
// different corpus is a new fixture under a new name (card:3230).
// Imports: node built-ins and the vendored acorn only; no browser, no network.
// slicePovDecls is exported for K1 (plan C5, r6; web/tools/test-povpose-k1.mjs); the CLI runs only when this
// file is the entry module.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as acorn from '../../tools/render/lib/vendor/acorn/acorn.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const FIXTURE = path.join(HERE, 'fixtures', 'povpose-corpus-911.json');
const FIXTURE_MAIN = path.join(HERE, 'fixtures', 'povpose-main-911.json');
const FNS = ['recCueId', 'povTImpact', 'povScript', 'povAnchors'];
const ORDER = ['recCueId', 'povTImpact', 'povScript', 'POV_FOV', 'povAnchors']; // BASE source order
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** GH-911 C4: the five POV declarations of a playback.js text, by AST. Returns
 * { recCueId, povTImpact, povScript, POV_FOV, povAnchors }, each
 * { name, start, end, line, endLine, firstLine, text } with text =
 * src.slice(start, end) and 1-based '\n' line numbers. Throws unless each
 * name has exactly one declaration (a FunctionDeclaration for the four
 * functions, a VariableDeclarator for POV_FOV). */
export function slicePovDecls(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const hits = Object.fromEntries(ORDER.map((n) => [n, []]));
  const walk = (node, parent) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'FunctionDeclaration' && FNS.includes(node.id?.name)) hits[node.id.name].push(node);
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.id.name === 'POV_FOV') hits.POV_FOV.push(parent);
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v)) { for (const c of v) walk(c, node); } else if (v && typeof v.type === 'string') walk(v, node);
    }
  };
  walk(ast, null);
  const lineAt = (i) => src.slice(0, i).split('\n').length;
  const out = {};
  for (const name of ORDER) {
    const found = hits[name];
    if (found.length !== 1) throw new Error(`slicePovDecls: ${found.length} declarations of ${name} (exactly one required)`);
    const n = found[0];
    const text = src.slice(n.start, n.end);
    out[name] = { name, start: n.start, end: n.end, line: lineAt(n.start), endLine: lineAt(n.end),
      firstLine: text.split('\n')[0], text };
  }
  return out;
}

/** GH-911 case 1 reference: the bytes of povpose-main-911.json for a rev, from
 * that rev's playback.js bytes and its slicePovDecls slices. */
export function mainSlicesBody(mainRev, gitBytes, S) {
  const head = { schema: 'povpose-main/1', main_rev: mainRev, main_playback_sha256: sha(gitBytes),
    note: `${mainRev} recCueId, povTImpact and povAnchors, each the whole declaration [start, end) with the sha256 of its text; test-povpose.mjs case 1 runs them under the running engine` };
  const names = ['recCueId', 'povTImpact', 'povAnchors'];
  return ['{',
    ...Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
    '  "slices": {',
    ...names.map((n, i) => `    ${JSON.stringify(n)}: ${JSON.stringify({ sha256: sha(S[n].text), text: S[n].text })}${i + 1 < names.length ? ',' : ''}`),
    '  }',
    '}', ''].join('\n');
}

function usage(msg) {
  console.error(`mk-povpose-corpus: ${msg}`);
  console.error('usage: node web/tools/mk-povpose-corpus.mjs --rev <REV> [--out <path>] [--main-out <path>] <records.jsonl>');
  process.exit(2);
}

function main(argv) {
  let rev = null, outPath = FIXTURE, mainOutPath = FIXTURE_MAIN, recPath = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--rev' || a === '--out' || a === '--main-out') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('-')) usage(`${a} needs a value`);
      if (a === '--rev') rev = v; else if (a === '--out') outPath = path.resolve(v); else mainOutPath = path.resolve(v);
    } else if (a.startsWith('-')) usage(`unknown flag ${a}`);
    else if (recPath === null) recPath = a;
    else usage(`one records.jsonl only (extra ${a})`);
  }
  if (rev === null) usage('--rev <REV> is required');
  if (recPath === null) usage('<records.jsonl> is required');

  const git = (args, encoding) => execFileSync('git', ['-C', ROOT, ...args], { encoding, maxBuffer: 1 << 26 });
  let mainRev;
  try { mainRev = git(['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], 'utf8').trim(); } catch { usage(`--rev ${rev} is not a commit of this repo`); }
  const gitBytes = git(['show', `${mainRev}:web/app/playback.js`], 'buffer');
  const gitText = gitBytes.toString('utf8');
  const S = slicePovDecls(gitText);
  const P = (s) => console.log(s);
  P(`[inputs] ${mainRev}:web/app/playback.js sha256 ${sha(gitBytes)}; bytes ${gitBytes.length}`);
  for (const d of Object.values(S)) P(`[slice] ${d.name} :${d.line}-${d.endLine} ${JSON.stringify(d.firstLine)}`);
  const { recCueId, povTImpact } = new Function(`${S.recCueId.text}\n${S.povTImpact.text}\nreturn { recCueId, povTImpact };`)();
  const mkScript = (povAnchors) => new Function('povAnchors', `${S.povScript.text}\n${S.POV_FOV.text}\nreturn povScript;`)(povAnchors);
  const pvaMain = new Function('recCueId', 'povTImpact', `${S.povAnchors.text}\nreturn povAnchors;`)(recCueId, povTImpact);
  const scriptMain = mkScript(pvaMain);

  const srcBytes = fs.readFileSync(recPath);
  const recs = srcBytes.toString('utf8').trim().split('\n').map((l) => JSON.parse(JSON.parse(l).record_json));
  const N = recs.length;
  P(`[source] ${path.basename(recPath)} sha256 ${sha(srcBytes)}; bytes ${srcBytes.length}; records ${N}`);

  // ---- reduce ----
  function reduce(rec) {
    const cueId = recCueId(rec);
    const evs = rec.events ?? [];
    const keep = new Set([0]);
    const bb = evs.findIndex((e) => { const k = e?.kind; return k && typeof k !== 'string' && k.BallBall; });
    const bc = evs.findIndex((e) => { const k = e?.kind; return k && typeof k !== 'string' && k.BallLinearCushion?.ball === cueId; });
    if (bb >= 0) keep.add(bb);
    if (bc >= 0) keep.add(bc);
    const events = [...keep].sort((a, b) => a - b).map((i) => ({ t: evs[i].t, kind: evs[i].kind }));
    const ball = rec.initial.balls.find((b) => b.id === cueId);
    return { events, initial: { balls: [{ id: ball.id, state: { pos: ball.state.pos }, params: { r: ball.params.r } }] }, shot: { phi: rec.shot.phi } };
  }
  const red = recs.map(reduce);
  const struck = {};
  for (const r of recs) { const c = recCueId(r); struck[c] = (struck[c] ?? 0) + 1; }
  const evCount = {};
  for (const r of red) evCount[r.events.length] = (evCount[r.events.length] ?? 0) + 1;
  P(`[census] struck-ball ids ${JSON.stringify(struck)}; kept events per record ${JSON.stringify(evCount)}; full events per record min ${Math.min(...recs.map((r) => r.events.length))} max ${Math.max(...recs.map((r) => r.events.length))}`);

  // every printed "k of N" count below must read N of N, else the run exits 1
  const counts = [];
  const count = (label, k) => { counts.push([label, k]); return k; };
  const FIELDS = ['d', 'addrCam', 'addrLook', 'standCam', 'standLook'];
  const pvaEq = (h, m) => (h === null && m === null) || (!!h && !!m && Object.is(h.ti, m.ti) && FIELDS.every((f) => m[f].length === h[f].length && m[f].every((v, c) => Object.is(h[f][c], v))));
  const numsEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const cueBall = (rec) => rec.initial.balls.find((b) => b.id === recCueId(rec));
  {
    let a = 0, s = 0, g = 0, nullF = 0;
    recs.forEach((rec, i) => {
      const mf = pvaMain(rec), mr = pvaMain(red[i]);
      if (mf === null) nullF++;
      if (pvaEq(mf, mr)) a++;
      if (numsEq(scriptMain(rec), scriptMain(red[i]))) s++;
      const bf = cueBall(rec), br = cueBall(red[i]);
      if (Object.is(bf.state.pos.x, br.state.pos.x) && Object.is(bf.state.pos.y, br.state.pos.y) && Object.is(bf.state.pos.z, br.state.pos.z)
        && Object.is(bf.params.r, br.params.r) && Object.is(Number(rec.shot.phi), Number(red[i].shot.phi)) && Object.is(povTImpact(rec), povTImpact(red[i])) && recCueId(rec) === recCueId(red[i])) g++;
    });
    P(`[reduce] main povAnchors full vs reduced, Object.is every field: ${count('reduce povAnchors', a)} of ${N}; main povAnchors null on full records: ${nullF}`);
    P(`[reduce] main povScript full vs reduced, JSON-equal: ${count('reduce povScript', s)} of ${N}`);
    P(`[reduce] grid inputs (struck id, pos x/y/z, params.r, phi, ti) Object.is: ${count('reduce grid inputs', g)} of ${N}`);
  }

  // ---- write the fixture: one record per line ----
  const mainOut = recs.map((rec) => pvaMain(rec));
  const head = { schema: 'povpose-corpus/1', source_sha256: sha(srcBytes), source_records: N,
    main_rev: mainRev, main_playback_sha256: sha(gitBytes),
    note: `reduced #911 replay corpus: events[0], first BallBall, first struck-ball BallLinearCushion; struck ball id/pos/r; shot.phi; main = ${mainRev} povAnchors on the full record` };
  const body = [
    '{',
    ...Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
    '  "records": [',
    ...red.map((r, i) => `    ${JSON.stringify(r)}${i + 1 < red.length ? ',' : ''}`),
    '  ],',
    '  "main": [',
    ...mainOut.map((m, i) => `    ${JSON.stringify(m)}${i + 1 < mainOut.length ? ',' : ''}`),
    '  ]',
    '}', ''].join('\n');
  fs.writeFileSync(outPath, body);
  const back = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  P(`[fixture] ${outPath.split(path.sep).slice(-2).join('/')}: bytes ${Buffer.byteLength(body)}; sha256 ${sha(body)}; records ${back.records.length}; main ${back.main.length}`);
  {
    let rt = 0, st = 0;
    back.records.forEach((r, i) => { if (pvaEq(pvaMain(r), mainOut[i])) rt++; if (pvaEq(back.main[i], mainOut[i])) st++; });
    P(`[round-trip] main povAnchors on parsed fixture records == on full records: ${count('round-trip records', rt)} of ${N}; parsed "main" == computed: ${count('round-trip main', st)} of ${N}`);
  }

  // ---- ORACLE on the fixture: the pose math transcribed from povAnchors (playback.js:3973-3979) ----
  function ORACLE(p, phi) {
    const dx = Math.cos(phi), dy = Math.sin(phi);
    return { d: [dx, dy],
      addrCam: [p.x - 1.05 * dx, p.y - 1.05 * dy, p.z + 0.36],
      addrLook: [p.x + 1.40 * dx, p.y + 1.40 * dy, p.z],
      standCam: [p.x - 1.75 * dx, p.y - 1.75 * dy, 0.81],
      standLook: [0, 0, 0.02] };
  }
  {
    let eq = 0;
    back.records.forEach((r, i) => { const o = { ti: back.main[i].ti, ...ORACLE(cueBall(r).state.pos, Number(r.shot.phi)) }; if (pvaEq(o, back.main[i])) eq++; });
    P(`[oracle] ORACLE (+ stored ti) vs fixture "main", Object.is every field: ${count('oracle', eq)} of ${N}`);
  }

  const mainBody = mainSlicesBody(mainRev, gitBytes, S);
  fs.writeFileSync(mainOutPath, mainBody);
  P(`[fixture] ${mainOutPath.split(path.sep).slice(-2).join('/')}: bytes ${Buffer.byteLength(mainBody)}; sha256 ${sha(mainBody)}`);

  const bad = counts.filter(([, k]) => k !== N);
  P(`[verdict] ${bad.length === 0 ? 'OK' : 'FAIL'}: ${counts.length - bad.length} of ${counts.length} counts read ${N} of ${N}${bad.length ? `; failing: ${bad.map(([l, k]) => `${l} ${k}`).join(', ')}` : ''}`);
  if (bad.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
