// Copyright (c) Meta Platforms, Inc. and affiliates.

// dump-slide-chutes-489.mjs — the six ball-return chutes of the snooker table as the SCENE builds them
// (GH-489 SNK-R33, review r7 P2 B: the track export had re-typed the wire polyline and skipped P1; the
// export and the export check now read THIS, generated from web/scene/table.js snkSlideChutes — one
// construction). Output: JSON in millimetres, the scene frame (x along the table, y up from the bed,
// z across; = TCS-TBL-01 (X, Y, Z)): per pocket the derived support geometry (ballR, wireR, gauge,
// levelGap, hSeat, upperHalf, dxyMin, bendD) with the reachable-domain census behind upperHalf (entry pivot /
// lead / P1 arc / slope / rest: each piece's least in-plane distance to the upper path and its clearance, the limiting
// piece, the rest's tangent length) and each wire's breakpoints P0/P1/P2/P3/pIn/pOut plus its 49-point
// spaced centreline (the TubeGeometry's own 48 segments).
//   node tools/render/dump-slide-chutes-489.mjs [--web <dir>] [--prefix] [tableId=wpbsa_snooker_12ft]
//     --web    import that tree's web/scene/table.js (a git-archive export) instead of the checkout's
//     --prefix the pre-SNK-R33 upper-pair offset (the census red arm), for the record only
//   Options are parsed FIRST (an option's value is never a positional); the first remaining argument is the
//   table id, validated against the imported module's TABLE_SPECS — an unknown option, a second positional or
//   an id not in the catalog is refused BY NAME, exit 2 (SNK-R34, review r8 P2: `--web web` had selected the table
//   "web" and reported "not a snooker table").
// Pure node, no port, no browser.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoRoot } from './lib/ensure-three.mjs';
const args = process.argv.slice(2);
const opts = { web: null, prefix: false };
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--web') {
    if (i + 1 >= args.length || args[i + 1].startsWith('--')) { console.error('dump-slide-chutes-489: --web needs a directory'); process.exit(2); }
    opts.web = args[++i];
  } else if (a === '--prefix') opts.prefix = true;
  else if (a.startsWith('--')) { console.error(`dump-slide-chutes-489: unknown option ${a} (known: --web <dir>, --prefix)`); process.exit(2); }
  else positional.push(a);
}
if (positional.length > 1) { console.error(`dump-slide-chutes-489: one table id at most, got ${positional.map((p) => `'${p}'`).join(' ')}`); process.exit(2); }
const TABLE = positional[0] || 'wpbsa_snooker_12ft';
const WEB = opts.web;
// the measured tree's web/ dir: the checkout's by default, --web's otherwise (resolved against the caller's cwd)
const webDir = WEB ? path.resolve(WEB) : path.join(repoRoot, 'web');
// SNK-R34 (review r8 P2, class C): resolve the MEASURED tree's bare `three` import to the three THAT tree ships —
// the same instrument as check-jaw-sections-489.mjs ensureThreeFor. lib/ensure-three.mjs ensureRealThree aliases the
// checkout's three at the checkout root, which is not on the module-resolution path of an archive's web/scene/table.js
// (node walks up from the IMPORTER): `--web <fresh git archive>/web` died with ERR_MODULE_NOT_FOUND 'three'. The alias
// sits at dirname(webDir)/node_modules/three — for the default that IS the repo root (the shipped behaviour unchanged),
// for an archive its root; never inside the served web/ docroot (ensure-three.mjs's own rule). Content-compared.
const ensureThreeFor = (wd) => {
  const vendor = path.join(wd, 'vendor', 'three.module.min.js');
  if (!fs.existsSync(vendor)) { console.error(`dump-slide-chutes-489: no vendored three at ${vendor}`); process.exit(2); }
  const bytes = fs.readFileSync(vendor);
  const pkgJson = JSON.stringify({ name: 'three', version: '0.0.0-vendored-copy', type: 'module', main: 'index.js' });
  const dir = path.join(path.dirname(wd), 'node_modules', 'three');
  fs.mkdirSync(dir, { recursive: true });
  const idx = path.join(dir, 'index.js');
  const pkg = path.join(dir, 'package.json');
  if (!fs.existsSync(idx) || !fs.readFileSync(idx).equals(bytes)) fs.writeFileSync(idx, bytes);
  if (!fs.existsSync(pkg) || fs.readFileSync(pkg, 'utf8') !== pkgJson) fs.writeFileSync(pkg, pkgJson);
};
ensureThreeFor(webDir);
const url = pathToFileURL(path.join(webDir, 'scene/table.js')).href;
const T = await import(url);
if (typeof T.snkSlideChutes !== 'function') { console.error(`dump-slide-chutes-489: ${url} exports no snkSlideChutes (a pre-SNK-R33 tree)`); process.exit(2); }
// the id is judged against the module's own catalog before anything is built: a misspelled id is a refusal by name,
// not a "not a snooker table" verdict on a table that does not exist
const catalog = T.TABLE_SPECS && typeof T.TABLE_SPECS === 'object' ? Object.keys(T.TABLE_SPECS) : null;
if (!catalog) { console.error(`dump-slide-chutes-489: ${url} exports no TABLE_SPECS catalog`); process.exit(2); }
if (!catalog.includes(TABLE)) { console.error(`dump-slide-chutes-489: unknown table id '${TABLE}' (not in TABLE_SPECS: ${catalog.join(', ')})`); process.exit(2); }
const chutes = T.snkSlideChutes(TABLE, { prefix: opts.prefix });
if (!chutes) { console.error(`dump-slide-chutes-489: ${TABLE} is not a snooker table (no chutes)`); process.exit(2); }
const mm = (v) => Array.isArray(v) ? v.map((x) => +(x * 1000).toFixed(4)) : +(v * 1000).toFixed(4);
// the reachable-domain census (snkChuteCensus): points/lengths to mm, angles/flags/labels as they are
const censusMm = (ce) => ({ limit: ce.limit, dxyMin: mm(ce.dxyMin), R: mm(ce.R), pieceDxy: Object.fromEntries(Object.entries(ce.pieceDxy).map(([k, v]) => [k, mm(v)])),
  clear: Object.fromEntries(Object.entries(ce.clear).map(([k, v]) => [k, mm(v)])), P: ce.P.map(mm), nLead: ce.nLead, nSlope: ce.nSlope, rest: mm(ce.rest), stop: ce.stop,
  restTangent: mm(ce.restTangent), rampLen: mm(ce.rampLen), slopeTangent: mm(ce.slopeTangent), restToBend: mm(ce.restToBend), restClearsBend: ce.restClearsBend, convexP1: ce.convexP1,
  arcsDeg: Object.fromEntries(Object.entries(ce.arcs).map(([k, v]) => [k, k.endsWith('Steps') ? v : v * 180 / Math.PI])),
  pieces: { entryEnds: ce.pieces.entryEnds.map(mm), lead: ce.pieces.lead.map(mm), arcEnds: ce.pieces.arcEnds.map(mm), slope: ce.pieces.slope.map(mm), rest: mm(ce.pieces.rest) } });
const out = { table: TABLE, units: 'mm', frame: 'scene (x along, y up from the bed, z across) = TCS-TBL-01 (X, Y, Z)', source: WEB ? path.resolve(WEB) : 'checkout web/scene/table.js', prefix: args.includes('--prefix'),
  chutes: chutes.map((c) => ({ index: c.index, corner: c.corner, cup: mm(c.cup), dirx: c.dirx, run: mm(c.run), xEnd: mm(c.xEnd),
    ballR: mm(c.ballR), wireR: mm(c.wireR), gauge: mm(c.gauge), levelGap: mm(c.levelGap), hSeat: mm(c.hSeat), upperHalf: mm(c.upperHalf), dxyMin: mm(c.dxyMin), bendD: mm(c.bendD), census: censusMm(c.census), ring: c.ring ? { x: mm(c.ring.x), z: mm(c.ring.z), y: mm(c.ring.y), R: mm(c.ring.R), tube: mm(c.ring.tube), need: mm(c.ring.need) } : null,
    ringClear: c.ringClear ? { upperStartAlong: mm(c.ringClear.upperStartAlong), onLead: c.ringClear.onLead, iterations: c.ringClear.iterations, residual: mm(c.ringClear.residual), lower: mm(c.ringClear.lower), upper: mm(c.ringClear.upper) } : null,
    wires: c.wires.map((w) => ({ lvl: w.lvl, side: w.side, z: mm(w.z), breakpoints: Object.fromEntries(Object.entries(w.breakpoints).map(([k, v]) => [k, mm(v)])), centreline: w.centreline.map(mm) })) })) };
process.stdout.write(JSON.stringify(out) + '\n');
