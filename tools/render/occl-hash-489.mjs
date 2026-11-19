// Copyright (c) Meta Platforms, Inc. and affiliates.

// occl-hash-489.mjs — the aOccl determinism witness (GH-489 SNK-R32; the ballreturn lane's cross-lane
// finding: obPocketCap's aOccl hashed differently on every page load because the census read it while
// the asynchronous bake was still landing). Reads a clay-study dump (schema 3: every attribute) and
// prints, per mesh carrying `aOccl`, sha256 of its raw bytes, plus the sorted multiset digest — the
// construction gate's OCCL-DETERMINISM row prints the same digests from the live page after the settle
// seam, so the battery can read three loads (dump A, dump B, the gate) as one line.
//   node tools/render/occl-hash-489.mjs <dump.json> [--json]
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const file = process.argv[2];
if (!file) { console.error('usage: node tools/render/occl-hash-489.mjs <dump.json> [--json]'); process.exit(2); }
const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = [];
for (const m of d.meshes || []) {
  const a = m.attributes && m.attributes.aOccl;
  if (!a || !a.b64) continue;
  const buf = Buffer.from(a.b64, 'base64');
  rows.push({ name: m.name, count: a.count, sha256: createHash('sha256').update(buf).digest('hex') });
}
const keyOf = (r) => r.name + ':' + r.count + ':' + r.sha256;
rows.sort((p, q) => (keyOf(p) < keyOf(q) ? -1 : keyOf(p) > keyOf(q) ? 1 : 0)); // code-point order, the gate sorts the same way
const digest = createHash('sha256').update(rows.map((r) => `${r.name}:${r.count}:${r.sha256}`).join('\n')).digest('hex');
const out = { file, table: d.table, occl_settled: d.occl_settled ?? null, served_tree: d.served_tree ?? null, meshes: rows.length, digest, rows };
if (process.argv.includes('--json')) console.log(JSON.stringify(out));
else {
  console.log(`[occl-hash] ${d.table} ${file}: ${rows.length} meshes carry aOccl; multiset digest ${digest.slice(0, 16)}; settled ${JSON.stringify(out.occl_settled)}`);
  for (const r of rows) console.log(`  ${r.name.padEnd(28)} ${String(r.count).padStart(7)}  ${r.sha256.slice(0, 16)}`);
}
