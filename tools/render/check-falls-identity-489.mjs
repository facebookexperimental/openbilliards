// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-falls-identity-489.mjs — GH-489 SNK-R34 (maintainer ruling A, identity form): the drop animation's aperture
// (web/scene/table.js pocketVisualFalls) IS the kernel capture disc, bit for bit, and the frozen game.js gate reads that
// identity in ONE condition (the ownership ledger (internal) "Recorded deviation (frozen game.js, one condition)"). Two fences:
//   F1  every fall pocketVisualFalls(id) returns equals makeGeom(id).pockets[i] EXACTLY (x, z, r — `===`, no epsilon:
//       the render fall copies the kernel record verbatim); pocketPlateDatums(id) differs from it on the corners (the
//       plate datum is a different datum, 27.87 mm inboard) — the two exports must not be aliases of each other
//   F2  the copy happens at ONE site: web/scene/table.js builds `falls:` exactly once, both branches `{ x: p.x, z: p.z,
//       r: p.r, kernel: … }` from the kernel pocket `p`; and game.js carries the identity condition exactly once
// Red arm: `--arm falls-perturb` re-imports the module with OB_ARM=falls-perturb (table.js obArmOn's node path): the
// +x+z corner's r moves by 1e-9 → F1 must FAIL naming the pocket and the delta (ARMED iff exit 1 with that row).
//   node tools/render/check-falls-identity-489.mjs [--table <id>] [--web <dir>] [--arm falls-perturb]
// Pure node, no port, no browser. Exit 0 = both fences hold; 1 = a fence fails; 2 = refused / cannot run.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ensureRealThree, repoUrl, repoRoot } from './lib/ensure-three.mjs';

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const TABLE = opt('--table') || 'wpbsa_snooker_12ft';
const WEB = opt('--web');
const ARM = opt('--arm');
if (args.includes('--arm') && ARM !== 'falls-perturb') { console.error(`[falls-identity] REFUSED — unknown arm '${ARM}' (known: falls-perturb)`); process.exit(2); }
if (ARM && !process.env.OB_ARM) {
  // the arm: this very check under the module's arm switch — it must FAIL F1 by name
  const r = spawnSync(process.execPath, [process.argv[1], ...args.filter((a) => a !== '--arm' && a !== 'falls-perturb')], { env: { ...process.env, OB_ARM: 'falls-perturb' }, encoding: 'utf8' });
  process.stdout.write(r.stdout); process.stderr.write(r.stderr);
  const armed = r.status === 1 && /^FAIL  F1 .*p5 corner: .*r differs 1\.000e-9/m.test(r.stdout + r.stderr);
  console.log(`[falls-identity] --arm falls-perturb: ${armed ? 'ARMED' : 'NOT ARMED'} (inner exit ${r.status}; F1 must fail naming the perturbed corner)`);
  process.exit(armed ? 0 : 1);
}
const webDir = WEB ? path.resolve(WEB) : path.join(repoRoot, 'web');
// the selected tree's own three (the jaw-section checker's rule: the alias sits above the tree's web/)
{
  const vendor = path.join(webDir, 'vendor', 'three.module.min.js');
  if (!fs.existsSync(vendor)) { console.error(`[falls-identity] REFUSED — no vendored three at ${vendor}`); process.exit(2); }
  if (WEB) {
    const dir = path.join(path.dirname(webDir), 'node_modules', 'three'); fs.mkdirSync(dir, { recursive: true });
    const bytes = fs.readFileSync(vendor); const idx = path.join(dir, 'index.js'), pkg = path.join(dir, 'package.json');
    const pkgJson = JSON.stringify({ name: 'three', version: '0.0.0-vendored-copy', type: 'module', main: 'index.js' });
    if (!fs.existsSync(idx) || !fs.readFileSync(idx).equals(bytes)) fs.writeFileSync(idx, bytes);
    if (!fs.existsSync(pkg) || fs.readFileSync(pkg, 'utf8') !== pkgJson) fs.writeFileSync(pkg, pkgJson);
  } else ensureRealThree();
}
const T = await import(WEB ? pathToFileURL(path.join(webDir, 'scene/table.js')).href : repoUrl('web/scene/table.js'));
if (typeof T.pocketVisualFalls !== 'function' || typeof T.makeGeom !== 'function') { console.error('[falls-identity] REFUSED — the module exports no pocketVisualFalls / makeGeom'); process.exit(2); }
// SNK-R35 class B: the entry validated through the lane's one reader (lib/entry-489.mjs) — own-key test, exit 2 by name
const { resolveEntry } = await import('./lib/entry-489.mjs');
resolveEntry(T, TABLE, { tool: 'falls-identity', webDir });
let fails = 0;
const row = (ok, name, text) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${text}`); if (!ok) fails++; };
// ---- F1: bit-for-bit identity with the kernel pockets ----
const G = T.makeGeom(TABLE);
const falls = T.pocketVisualFalls(TABLE, { contract: 'kernel' }); // LAND-26 (i): F1 judges the OPTED (kernel-disc) contract
const unopted = T.pocketVisualFalls(TABLE); // LAND-26 (i): the un-opted call = the pre-R34 safe aperture (F1c below)
const plates = typeof T.pocketPlateDatums === 'function' ? T.pocketPlateDatums(TABLE) : null;
if (!Array.isArray(falls) || falls.length !== G.pockets.length) {
  row(false, 'F1', `pocketVisualFalls('${TABLE}') is not one fall per kernel pocket (${Array.isArray(falls) ? falls.length : String(falls)} vs ${G.pockets.length})`);
} else {
  const bad = [];
  falls.forEach((f, i) => { const p = G.pockets[i]; if (!(f.x === p.x && f.z === p.z && f.r === p.r)) bad.push(`p${i} ${p.corner ? 'corner' : 'middle'}: x ${f.x === p.x ? '=' : `differs ${(f.x - p.x).toExponential(3)}`} z ${f.z === p.z ? '=' : `differs ${(f.z - p.z).toExponential(3)}`} r ${f.r === p.r ? '=' : `differs ${(f.r - p.r).toExponential(3)}`}`); });
  row(bad.length === 0, 'F1', `every fall equals its kernel pocket bit for bit (x, z, r via ===) — ${bad.length ? 'FAIL ' + bad.join(' · ') : `${falls.length}/${falls.length} identical (corners ${falls.filter((f) => f.kernel).length} carry the kernel construction flag)`}`);
  if (plates) {
    const aliased = falls.filter((f, i) => G.pockets[i].corner && f.x === plates[i].x && f.z === plates[i].z && f.r === plates[i].r).length;
    row(aliased === 0, 'F1b', `the plate datum is a different datum on the corners (pocketPlateDatums ≠ pocketVisualFalls) — ${aliased === 0 ? `corner plate 27.87 mm inboard of the fall (${(Math.hypot(plates[0].x - falls[0].x, plates[0].z - falls[0].z) * 1000).toFixed(2)} mm), r ${(plates[0].r * 1000).toFixed(2)} vs ${(falls[0].r * 1000).toFixed(2)}` : `${aliased} corner plate datums alias the fall`}`);
  } else row(false, 'F1b', 'pocketPlateDatums is not exported (a pre-SNK-R34 tree)');
}
// ---- F2: one copy site (table.js) + one gate condition (game.js) ----
const tableSrc = fs.readFileSync(path.join(webDir, 'scene', 'table.js'), 'utf8');
const gameSrc = fs.readFileSync(path.join(webDir, 'app', 'game.js'), 'utf8');
const copySites = tableSrc.match(/falls: G\.pockets\.map\(\(p\) => \(p\.corner\s*\n?\s*\? \{ x: p\.x, z: p\.z, r: p\.r, kernel: true \}\s*\n?\s*: \{ x: p\.x, z: p\.z, r: p\.r, kernel: false \}\)\),/g) || [];
row(copySites.length === 1, 'F2', `the render falls copy the kernel record at ONE site (table.js snookerFallCtx \`falls:\`, both branches { x: p.x, z: p.z, r: p.r }) — found ${copySites.length}`);
const gateSites = gameSrc.match(/fall\.x === pocket\.x && fall\.z === pocket\.z && fall\.r === pocket\.r/g) || [];
row(gateSites.length === 1, 'F2b', `game.js carries the identity condition exactly once (the recorded deviation) — found ${gateSites.length}`);
const returnSites = tableSrc.match(/return fcx\.falls;/g) || [];
row(returnSites.length === 1, 'F2c', `pocketVisualFalls returns the render falls at one site — found ${returnSites.length}`);
// LAND-26 (i): the mixed-pairing contract — a caller WITHOUT `{ contract: 'kernel' }` receives the plate cups (pocketPlateDatums) exactly
const plate = typeof T.pocketPlateDatums === 'function' ? T.pocketPlateDatums(TABLE) : null;
const unoptedOk = Array.isArray(unopted) && Array.isArray(plate) && unopted.length === plate.length && unopted.every((f, i) => f.x === plate[i].x && f.z === plate[i].z && f.r === plate[i].r);
row(unoptedOk, 'F1c', `pocketVisualFalls('${TABLE}') WITHOUT the kernel opt-in returns the plate datums bit for bit (the pre-R34 safe aperture for a cached game.js) — ${unoptedOk ? 'yes' : 'NO'}`);
console.log(`[falls-identity] ${fails ? 'FAIL' : 'PASS'} — ${fails} failing row(s) on ${TABLE}${process.env.OB_ARM ? ` (OB_ARM=${process.env.OB_ARM})` : ''}`);
process.exit(fails ? 1 : 0);
