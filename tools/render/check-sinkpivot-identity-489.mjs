#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * check-sinkpivot-identity-489 — GH-489 SNK-R36 (review round 10 P2 B, arm B3): the drop pose law of TWO trees'
 * web/app/sinkpivot.js compared on a deterministic spec set, bit for bit.
 *
 * The SNK-R36 pre-roll branch may change ONLY the corner-class entry (a steering disc that is not the throat and a
 * capture outside the throat). Every other class — pool / chinese8 (fall === pocket, no throat), a stale table.js (no
 * throat source), the snooker middles (throat == steering disc), an out-of-fall degrade, malformed input — must build
 * the SAME entry (JSON) and the SAME poses (400 samples over the ttl) in both trees. The corner class must DIFFER, and
 * the new tree's entry must carry `roll`. Exit 0 iff both halves hold; 1 otherwise; 2 on usage.
 *
 *   node tools/render/check-sinkpivot-identity-489.mjs --old <tree-a> --new <tree-b> [--ignore-fields f1,f2] [--expect-corner differ|same]
 *
 * `--expect-corner` (default `differ`, the SNK-R36 census: the old tree pivots at the capture rim, the new one rolls) — `same`
 * for a census between two trees of the SAME pose law (SNK-R37: the R36 seal → this tree), where every class incl. the corner
 * must be byte-identical in poses (and in entries modulo the ignored additive fields).
 *
 * `--ignore-fields` names ADDITIVE entry fields the new tree is allowed to carry (SNK-R37: `tEnd`, a plain number read from the
 * entry's own pose law); entries are compared with those fields removed, poses always strictly, and the fields actually added
 * are reported so an unlisted addition still fails the census.
 *
 * (a tree = a checkout or a `git archive` export with web/app/sinkpivot.js; the module's own guarded table.js import
 * resolves to null in node — no active table — so both files read the SAME `spec.throats`/`spec.falls` inputs.)
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const opt = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const OLD = opt('--old'), NEW = opt('--new');
const IGNORE = new Set(String(opt('--ignore-fields', '')).split(',').map((x) => x.trim()).filter(Boolean));
const EXPECT_CORNER = opt('--expect-corner', 'differ');
if (!['differ', 'same'].includes(EXPECT_CORNER)) { console.error(`[sinkpivot-identity] unknown --expect-corner '${EXPECT_CORNER}' (differ | same)`); process.exit(2); }
if (!OLD || !NEW) { console.error('usage: check-sinkpivot-identity-489 --old <tree> --new <tree>'); process.exit(2); }
const load = async (t) => {
  const f = path.join(path.resolve(t), 'web', 'app', 'sinkpivot.js');
  if (!fs.existsSync(f)) { console.error(`[sinkpivot-identity] REFUSED — ${f} missing`); process.exit(2); }
  return import(pathToFileURL(f).href);
};
const A = await load(OLD), B = await load(NEW);

const R = 0.02625;
const cup = { x: 1.832125, z: 0.936625, r: 0.0889 };            // snooker kernel corner cup (S2p pocket 5)
const throat = { x: 1.81242, z: 0.91692, r: 0.0420751 };         // its plate datum
const midCup = { x: 0.9405874, z: 0, r: 0.0531876 };             // snooker kernel middle cup
const poolCup = { x: 1.27, z: 0.635, r: 0.0635 };                // a pool-class cup (fall === pocket)
const q0 = [0.1, 0.2, 0.3, Math.sqrt(1 - 0.14)];
const rim = (c, ang, dOut = 0) => ({ x0: c.x + (c.r + dOut) * Math.cos(ang), z0: c.z + (c.r + dOut) * Math.sin(ang) });
const spin = { wx: 0.4, wy: 2.1, wz: -0.7 };
const cases = [];
for (const v of [0.12, 0.265, 0.5, 0.909, 2.213, 3.447, 6.797]) {
  for (const ang of [3.6, 3.9, 4.2]) {
    const p = rim(cup, ang);
    // velocity roughly toward the cup centre with a tangential component
    const cx = cup.x - p.x0, cz = cup.z - p.z0, cl = Math.hypot(cx, cz);
    const ux = (cx / cl) * 0.92 - (cz / cl) * 0.39, uz = (cz / cl) * 0.92 + (cx / cl) * 0.39, ul = Math.hypot(ux, uz);
    const base = { ...p, vx: v * ux / ul, vz: v * uz / ul, ...spin, q0, r: R };
    cases.push({ cls: 'pool (fall === pocket, no throat)', spec: { ...base, px: poolCup.x, pz: poolCup.z, pr: poolCup.r, x0: poolCup.x + poolCup.r * Math.cos(ang), z0: poolCup.z + poolCup.r * Math.sin(ang), falls: [], throats: [] }, mustMatch: true });
    cases.push({ cls: 'stale table.js (no fall / throat source)', spec: { ...base, px: cup.x, pz: cup.z, pr: cup.r, falls: undefined, throats: undefined }, mustMatch: true });
    const mp = rim(midCup, ang);
    cases.push({ cls: 'snooker middle (throat == steering disc)', spec: { ...base, ...mp, px: midCup.x, pz: midCup.z, pr: midCup.r, falls: [midCup], throats: [midCup] }, mustMatch: true });
    cases.push({ cls: 'snooker corner, capture inside the throat (no roll)', spec: { ...base, x0: throat.x + 0.02 * Math.cos(ang), z0: throat.z + 0.02 * Math.sin(ang), px: cup.x, pz: cup.z, pr: cup.r, falls: [cup], throats: [throat] }, mustMatch: true });
    cases.push({ cls: 'snooker corner (capture on the capture-disc rim, throat 19 mm on)', spec: { ...base, px: cup.x, pz: cup.z, pr: cup.r, falls: [cup], throats: [throat] }, mustMatch: false });
  }
}
cases.push({ cls: 'out-of-fall re-base degrade', spec: { x0: cup.x + 0.2, z0: cup.z, vx: -1, vz: 0, ...spin, q0, r: R, px: cup.x, pz: cup.z, pr: cup.r + 0.01, falls: [cup], throats: [throat] }, mustMatch: true });
cases.push({ cls: 'malformed input', spec: { x0: NaN, z0: 0, vx: 1, vz: 0, ...spin, q0, r: R, px: 0, pz: 0, pr: 0.05, throats: [throat] }, mustMatch: true });

const strip = (e) => { if (!e) return e; const o = { ...e }; for (const k of IGNORE) delete o[k]; return o; };
const added = new Set();
const run = (M, spec) => {
  const e = M.buildSinkPivot({ ...spec });
  if (!e) return { entry: null, poses: null };
  const poses = [];
  const ttl = e.ttl ?? 0.75;
  for (let i = 0; i <= 400; i++) poses.push(M.poseInSink(e, (ttl * i) / 400, {}));
  return { entry: e, poses };
};
const same = (a, b) => JSON.stringify({ entry: strip(a.entry), poses: a.poses }) === JSON.stringify({ entry: strip(b.entry), poses: b.poses });
let bad = 0, matched = 0, differed = 0;
const perClass = {};
for (const c of cases) {
  const a = run(A, c.spec), b = run(B, c.spec);
  // additive fields are censused where entries MUST match (and on the corner in a same-law census); the R36 corner's `roll` is the expected difference
  if (a.entry && b.entry && (c.mustMatch || EXPECT_CORNER === 'same')) for (const k of Object.keys(b.entry)) if (!(k in a.entry)) added.add(k);
  const same_ = same(a, b);
  const roll = !!(b.entry && b.entry.roll);
  const cornerSame = EXPECT_CORNER === 'same';
  const ok = c.mustMatch ? (same_ && !roll) : (cornerSame ? (same_ && roll) : (!same_ && roll && a.entry && !a.entry.roll));
  perClass[c.cls] = perClass[c.cls] || { n: 0, ok: 0 };
  perClass[c.cls].n++; if (ok) perClass[c.cls].ok++;
  if (!ok) { bad++; console.log(`[sinkpivot-identity] FAIL ${c.cls}: ${c.mustMatch ? (same_ ? 'matched but the new entry rolled' : 'entries/poses DIFFER between the trees') : (cornerSame ? (same_ ? 'identical but no roll record' : 'the corner class DIFFERS between two trees of the same law') : (same_ ? 'IDENTICAL — the corner class did not change (no pre-roll in the new tree?)' : (roll ? 'old entry already rolls' : 'differs without a roll record')))}`); }
  else if (c.mustMatch) matched++; else differed++;
}
for (const [cls, r] of Object.entries(perClass)) console.log(`[sinkpivot-identity] ${cls}: ${r.ok}/${r.n} as expected`);
const unlisted = [...added].filter((k) => !IGNORE.has(k));
console.log(`[sinkpivot-identity] entry fields ADDED by the new tree: ${added.size ? [...added].join(', ') : 'none'}${IGNORE.size ? ` (ignored by request: ${[...IGNORE].join(', ')})` : ''}${unlisted.length ? ` — UNLISTED addition(s): ${unlisted.join(', ')}` : ''}`);
console.log(`[sinkpivot-identity] ${bad || unlisted.length ? 'FAIL' : 'PASS'} — ${matched} non-corner specs byte-identical (entry${IGNORE.size ? ' minus ' + [...IGNORE].join('/') : ''} + 401 poses) across ${OLD} → ${NEW}; ${differed} corner specs ${EXPECT_CORNER === 'same' ? 'byte-identical WITH a roll record (same law)' : 'differ WITH a roll record'}; ${bad} unexpected`);
process.exit(bad || unlisted.length ? 1 : 0);
