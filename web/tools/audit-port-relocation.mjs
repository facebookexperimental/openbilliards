// Copyright (c) Meta Platforms, Inc. and affiliates.

// audit-port-relocation.mjs — collateral audit of a port-literal relocation (GH-725 review r3 P2-1:
// the #705/#725 token sweep rewrote a pinned SHA-256 in orbitsweep-488p.mjs because the port
// literal 9714 occurred INSIDE the hex digest).
//
//   node web/tools/audit-port-relocation.mjs <range> [<range>...]     e.g. a6d7b32d..ded11f42 ded11f42
//
// For every MODIFIED line pair in the given diffs (a removed line paired with an added line of
// the same non-digit skeleton = a pure literal move), every changed token must be a BARE 4-5
// digit port literal (1024-65535, a whole alphanumeric token). Anything else on such a line —
// a digit run inside a longer word (a digest, an id), a small integer, a renamed word — is
// COLLATERAL and is listed in section 1, which is expected EMPTY. Lines with no skeleton twin
// are hand edits and are only counted (section 3). Section 2 counts the legitimate moves.
import { execFileSync } from 'node:child_process';
const ranges = process.argv.slice(2); // e.g. a6d7b32d..ded11f42 ded11f42..HEAD
const TOKEN = /[A-Za-z0-9_]+/g;
const skel = (l) => l.replace(/\d+/g, '#');
const isPort = (t) => /^\d{4,5}$/.test(t) && Number(t) >= 1024 && Number(t) <= 65535;
let collateral = [], ports = 0, portFiles = new Set(), hand = [], pairs = 0;
for (const range of ranges) {
  const diff = execFileSync('git', ['diff', '--no-color', '-U0', range, '--', '.', ':!web/dist', ':!*.lock'], { encoding: 'utf8', maxBuffer: 256 << 20 });
  let file = null, oldLn = 0, removed = [], added = [];
  const flush = () => {
    // pair removed/added lines by identical skeleton (a pure literal move); the rest are hand edits
    const used = new Set();
    for (const r of removed) {
      const j = added.findIndex((a, k) => !used.has(k) && skel(a.text) === skel(r.text));
      if (j < 0) { hand.push({ range, file, ln: r.ln, kind: '-', text: r.text }); continue; }
      used.add(j); pairs++;
      const ot = r.text.match(TOKEN) ?? [], nt = added[j].text.match(TOKEN) ?? [];
      for (let k = 0; k < Math.max(ot.length, nt.length); k++) {
        if (ot[k] === nt[k]) continue;
        if (isPort(ot[k] ?? '') && isPort(nt[k] ?? '')) { ports++; portFiles.add(file); continue; }
        collateral.push({ range, file, ln: r.ln, from: ot[k], to: nt[k], line: added[j].text.trim().slice(0, 120) });
      }
    }
    added.forEach((a, k) => { if (!used.has(k)) hand.push({ range, file, ln: a.ln, kind: '+', text: a.text }); });
    removed = []; added = [];
  };
  for (const l of diff.split('\n')) {
    if (l.startsWith('diff --git')) { flush(); file = l.split(' b/')[1]; continue; }
    if (l.startsWith('@@')) { flush(); const m = /^@@ -(\d+)/.exec(l); oldLn = Number(m[1]); continue; }
    if (l.startsWith('---') || l.startsWith('+++')) continue;
    if (l.startsWith('-')) { removed.push({ ln: oldLn++, text: l.slice(1) }); continue; }
    if (l.startsWith('+')) { added.push({ ln: oldLn, text: l.slice(1) }); continue; }
  }
  flush();
}
console.log(`== 1. COLLATERAL (changed tokens on relocated lines that are NOT bare port literals): ${collateral.length}`);
for (const c of collateral) console.log(`   ${c.range} ${c.file}:${c.ln} ${c.from} -> ${c.to} | ${c.line}`);
console.log(`== 2. port-literal replacements: ${ports} tokens on ${pairs} lines across ${portFiles.size} files`);
const byFile = {}; for (const h of hand) { byFile[h.file] = (byFile[h.file] ?? 0) + 1; }
console.log(`== 3. hand-edited lines (no skeleton twin: added/removed/rewritten text): ${hand.length} lines in ${Object.keys(byFile).length} files`);
for (const [f, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${f}`);
