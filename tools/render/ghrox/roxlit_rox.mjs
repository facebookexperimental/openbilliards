#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
// roxlit_rox.mjs — A2 gate 10 (provenance): every numeric literal inside the rox additions of
// web/scene/table.js (the TABLE_SPECS.rasson_ox_9ft entry, the rox* helper block, the
// style === 'rasson_ox' branches) must sit on a line — or directly under a comment line — that
// names the OB-ROX-GEO-001 row it comes from (`PF-01`, `RB-04`, `RC-07`, ...), and that row must
// EXIST in the JSON. Untagged = defect (LAW-PURCHASED-BASELINE §4). Structural integers (0, 1, 2,
// -1, segment counts <= 64 written as integers, array indices) and unit conversions (1000, 25.4,
// Math.PI fractions) are exempt and listed as such.
// r9b (maintainer blocker B2): COLOURS are literals too. Every `0xrrggbb` and every '#rrggbb' in
// the rox regions is scanned under the same citation rule, and — because a shading constant has no
// derivation to hide behind — a literal cited to an APPEARANCE row (kind=="appearance") must appear
// verbatim in that row's value.constants. r9's aluminium was a set of numbers no row carried; this
// is the check that makes that state unreachable.
// Usage: node tools/render/ghrox/roxlit_rox.mjs [--json docs/geometry/rasson-ox-9ft-table-definition.json] [--judge]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)); const REPO = path.resolve(HERE, '..', '..', '..');
const argv = process.argv.slice(2); const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const JSON_PATH = path.resolve(REPO, argOf('--json', 'docs/geometry/rasson-ox-9ft-table-definition.json'));
const JUDGE = argv.includes('--judge');
const doc = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8')); const rows = new Set(doc.features.map((f) => f.id));
const src = fs.readFileSync(path.join(REPO, 'web/scene/table.js'), 'utf8').split('\n');
// rox regions (raw source, comments kept — the citations live in comments)
const regions = [];
const isEntry = (l) => /^\s*pool_pro_9ft_k55: \{\s*$/.test(l);
const isHelper = (l) => /^\s*(export )?(async )?(function\*? |const |let )(rox[A-Z_]\w*|ROX_\w*)/.test(l);
const isBranch = (l) => /(?:^|\}\s*)(?:else )?if \((?:style|G\.render\.style) === 'rasson_ox'\)\s*\{/.test(l);
for (let i = 0; i < src.length;) {
  const l = src[i];
  if (isEntry(l) || isHelper(l) || isBranch(l)) {
    let depth = 0, j = i, opened = false, end = i;
    for (; j < src.length; j++) {
      const t = (j === i && /^\s*\}/.test(src[j])) ? src[j].replace(/^\s*\}/, '') : src[j];
      const code = t.replace(/\/\/.*$/, '');
      // a chain branch ends BEFORE the base's next `} else …` line (its leading brace is the branch's close)
      if (opened && j > i && /^\s*\}/.test(src[j]) && depth - 1 <= 0) { end = /^\s*\}\s*$/.test(src[j]) && !isBranch(l) ? j : j - 1; if (isBranch(l) && /^\s*\}\s*$/.test(src[j]) && !/^\s*\}\s*else/.test(l)) end = j; break; }
      depth += (code.match(/\{/g) || []).length - (code.match(/\}/g) || []).length; if (code.includes('{')) opened = true;
      end = j;
      if (opened && depth <= 0) break;
    }
    regions.push([i, end]); i = end + 1; continue;
  }
  i++;
}
const ROW = /\b(PF|CU|CP|SP|RB|EN|PK|VR|RC)-\d{2}[a-z]?(?:-[a-z])?\b/g;
// r9b: a colour is a literal — `0xrrggbb`, and the CSS form a cube face or a canvas fill is written in
const COLOR = /0x[0-9a-fA-F]{3,8}|'#[0-9a-fA-F]{3,8}'|"#[0-9a-fA-F]{3,8}"/g;
// r9b: the constants an appearance row publishes, as the strings a source line would write them
const APPEARANCE = new Map();
for (const feat of doc.features) {
  if (feat.kind === 'material-identity') {
    // FIX19: an identity row may only retain the existing fresh pearlMat.
    // This is exact source equality, not a new appearance calibration or a
    // missing frame band. The shared constructor is also fenced against main.
    const declaration = src.join('\n').match(/const pearlMat = new THREE\.MeshStandardMaterial\(\{([^}]+)\}\)/);
    const fields = { albedo_hex: 'color', roughness: 'roughness', metalness: 'metalness', env_map_intensity: 'envMapIntensity' };
    const constants = feat.value?.constants || {};
    const same = declaration && feat.id === 'RC-35' && feat.value?.baseline_material === 'pearlMat'
      && Object.keys(constants).length === Object.keys(fields).length
      && Object.entries(fields).every(([key, field]) => {
        const value = declaration[1].match(new RegExp(`\\b${field}:\\s*(0x[0-9a-fA-F]+|[0-9.]+)`));
        return value && Number(constants[key]) === Number(value[1]);
      });
    if (!same) throw new Error(`MATERIAL_IDENTITY_REFUSED: ${feat.id} must equal the fresh pearlMat constructor`);
  } else if (feat.kind !== 'appearance') continue;
  const set = new Set();
  for (const v of Object.values((feat.value && feat.value.constants) || {})) {
    if (typeof v === 'string') set.add(v.toLowerCase());
    else if (typeof v === 'number') { set.add(String(v)); set.add(v.toFixed(1)); set.add(v.toFixed(2)); set.add(v.toFixed(3)); }
  }
  APPEARANCE.set(feat.id, set);
}
// a literal cited ONLY to appearance rows must be one of their published constants: an appearance row
// carries no construction, so there is nothing for an uncarried number to be derived from
// The rule binds on ANY appearance citation, not only on lines that cite nothing else: citing a
// geometry row alongside must not launder a shading number the appearance row never published.
const appearanceMiss = (ids, tok) => {
  const app = ids.filter((id) => APPEARANCE.has(id));
  if (!app.length) return null;
  const t = tok.replace(/['"]/g, '').toLowerCase();
  const hit = app.find((id) => APPEARANCE.get(id).has(t) || APPEARANCE.get(id).has(String(Number(t))));
  return hit ? null : `cited to appearance row(s) ${app.join(',')} but ${t} is not one of their published constants`;
};
const EXEMPT = new Set(['0', '1', '2', '3', '4', '-1', '0.5', '1000', '2000', '25.4', '180', '360', '90', '45', '0.0', '1.0', '2.0']); // 1000 / 2000 = mm→m and half-mm→m unit conversions
const findings = []; const construction = []; let literals = 0, cited = 0, colours = 0, colourCited = 0;
for (const [a, b] of regions) {
  for (let i = a; i <= b; i++) {
    const line = src[i]; const code = line.replace(/\/\/.*$/, ''); const comment = line.slice(code.length);
    if (/^\s*\/\//.test(line)) continue;
    const nums = code.match(/(?<![\w.])-?\d+(?:\.\d+)?(?:e-?\d+)?(?![\w.])/g) || [];
    // `// roxlit: construction` marks a line whose literals are construction artefacts, not dimensions
    // (a polygon-closing point inside the body, a sub-millimetre proudness to defeat z-fighting): they are
    // COUNTED and PRINTED, never silent, and the rule refuses any such literal above 2 mm (0.002).
    if (/roxlit: construction/.test(comment)) {
      for (const n of nums) { if (!EXEMPT.has(n) && !(/^\d+$/.test(n) && +n <= 64)) { construction.push({ line: i + 1, literal: n }); if (Math.abs(+n) > 0.002 && !/^\d+$/.test(n)) findings.push({ line: i + 1, literal: n, text: line.trim().slice(0, 110), why: 'construction literal above 2 mm needs a row' }); } }
      continue;
    }
    for (const c of (code.match(COLOR) || [])) {
      colours++;
      const here = (line.match(ROW) || []); const above = (src[i - 1] || '').match(ROW) || []; const above2 = (src[i - 2] || '').match(ROW) || [];
      const ids = [...here, ...above, ...above2];
      if (!ids.length) { findings.push({ line: i + 1, literal: c, text: line.trim().slice(0, 110), why: 'colour literal with no row id on the line or the two lines above' }); continue; }
      const known = ids.filter((id) => rows.has(id));
      if (!known.length) { findings.push({ line: i + 1, literal: c, text: line.trim().slice(0, 110), why: `cited row(s) ${ids.join(',')} not in the JSON` }); continue; }
      const app = known.filter((id) => APPEARANCE.has(id));
      if (!app.length) { findings.push({ line: i + 1, literal: c, text: line.trim().slice(0, 110), why: `colour cited to ${known.join(',')}, none of which is a material row that publishes it` }); continue; }
      const off = appearanceMiss(app, c);
      if (off) { findings.push({ line: i + 1, literal: c, text: line.trim().slice(0, 110), why: off }); continue; }
      colourCited++;
    }
    for (const n of nums) {
      if (EXEMPT.has(n)) continue;
      if (/^\d+$/.test(n) && +n <= 64) continue; // segment counts / indices
      literals++;
      const here = (line.match(ROW) || []); const above = (src[i - 1] || '').match(ROW) || []; const above2 = (src[i - 2] || '').match(ROW) || [];
      const ids = [...here, ...above, ...above2];
      if (!ids.length) { findings.push({ line: i + 1, literal: n, text: line.trim().slice(0, 110), why: 'no row id on the line or the two lines above' }); continue; }
      const missing = ids.filter((id) => !rows.has(id));
      if (missing.length === ids.length) { findings.push({ line: i + 1, literal: n, text: line.trim().slice(0, 110), why: `cited row(s) ${missing.join(',')} not in the JSON` }); continue; }
      const off = appearanceMiss(ids.filter((id) => rows.has(id)), n);
      if (off) { findings.push({ line: i + 1, literal: n, text: line.trim().slice(0, 110), why: off }); continue; }
      cited++;
    }
  }
}
console.log(`roxlit: ${regions.length} rox region(s), ${literals} numeric literal(s), ${cited} cited to existing rows, ${colours} colour literal(s), ${colourCited} cited to a material row that publishes them, ${construction.length} declared construction literal(s) [${construction.map((c) => `L${c.line}:${c.literal}`).join(' ')}], ${findings.length} untagged`);
for (const f of findings.slice(0, 40)) console.log(`  L${f.line} ${f.literal}: ${f.why} — ${f.text}`);
console.log(findings.length ? 'PROVENANCE GATE RED' : 'PROVENANCE GATE OK');
process.exit(JUDGE && findings.length ? 1 : 0);
