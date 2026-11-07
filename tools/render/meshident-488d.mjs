// Copyright (c) Meta Platforms, Inc. and affiliates.

// meshident-488d.mjs — GH-488D wave A2.5, A3 return item 1: the cross-table
// mesh-identity proof.
//
// WHY THIS EXISTS. This wave is render-only and scoped to ONE table entry,
// `diamond_proam_9ft`. Every other entry in TABLE_SPECS is supposed to come out
// of the wave byte-identical. That claim was made three times in SPIKE-REPORT
// and discharged each time by INSPECTION — "the site sits inside a style gate",
// "the arithmetic reduces to the old literal". Inspection missed one: the sight
// z-fight guard in `addSights` was landed as a bare literal in SHARED code
// (0.0006 -> 0.0002), which moved the sight inlays of five other entries by
// 0.4 mm. A reasoned argument about a diff is not a measurement of the output.
//
// So this instrument measures the output. It boots every table entry twice —
// once against a BASELINE web tree, once against the candidate — and digests
// every mesh the table builds: world-space vertex soup, triangle count, world
// AABB, visibility, and a material descriptor. Two captures, one comparison.
//
// THE ARM. A proof that only ever says "identical" is indistinguishable from a
// blind instrument. `--compare` therefore takes `--expect-differ ID` and fails
// (exit 3) when a table that MUST differ comes back identical, exactly as it
// fails when a table that must not differ moves. The diamond entry is the
// positive control for every run.
//
// Usage:
//   node tools/render/meshident-488d.mjs --out FILE.json [--web DIR]
//        [--tables a,b,c]
//   node tools/render/meshident-488d.mjs --compare BASE.json HEAD.json
//        [--expect-differ id[,id...]]
//
//   --web DIR  serve a CANDIDATE web tree instead of ./web (the
//              asmodeled-drawings-488d.mjs idiom). This is how the baseline
//              side is captured: copy web/, drop the baseline scene/table.js
//              into the copy, serve the copy. Nothing in the real tree moves,
//              so an interrupted run cannot leave a dirty worktree.
//   OB_E2E_PORT / OB_E2E_CDP_PORT pin ports; otherwise the 488d lane claims
//   its own band out of 25010-25039 (mutex via /tmp/ob-port-bands).
//
// Exit: 0 proof holds / 2 usage / 3 identity violated (either direction) /
//       4 capture starved or structurally uncomparable.
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand,
} from '../../web/tools/cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const argv = (await import('./lib/argv.mjs')).expandEqArgs(process.argv.slice(2));

const USAGE = 'usage: meshident-488d.mjs --out FILE.json [--web DIR] '
  + '[--tables a,b,c]\n'
  + '       meshident-488d.mjs --compare BASE.json HEAD.json '
  + '[--expect-differ id[,id...]] [--allow-sharing id[,id...]] [--json-out verdict.json]';

// Every table entry in TABLE_SPECS. Kept as a literal rather than parsed out of
// the source: if the wave ADDS or REMOVES an entry, this list stops matching
// and the run says so, which is the behaviour a proof wants. A silently
// self-updating list would let a deleted entry pass unnoticed.
const ALL_TABLES = [
  'wpa_generic_9ft', 'wpa_spec_9ft', 'diamond_redlabel_9ft',
  'diamond_proam_9ft', 'predator_apex_9ft', 'wpbsa_snooker_12ft',
  'umb_carom_284', 'chinese8_pro_9ft',
  'joy_q8_9ft', 'pool_pro_9ft_measured', // the two alias keys are catalog entries too (FIX2 sweep)
  // GH-621 (catalog v18): the Diamond Pro-Am size variants — derived
  // entries (table.js diamondProAmSize), each its own TABLE_SPECS key.
  'diamond_proam_8ft', 'diamond_proam_7ft',
];

// --- argv: strict. An unrecognised flag is a usage error, never a silent
// no-op. (A3 return item 3 found a sibling instrument whose --web arm was
// silently ignored, so a run that believed it was serving a candidate tree was
// serving the real one. Strictness here is not pedantry; it is the difference
// between a proof and a coincidence.)
const FLAGS_1 = new Set(['--out', '--web', '--tables', '--expect-differ', '--perturb', '--json-out', '--allow-sharing']); // union: main's --perturb + D621's --json-out / --allow-sharing (the card's identity fold passes them)
const FLAGS_2 = new Set(['--compare']);
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — the strict parser of this tool IS this call (unknown flags refused, every value checked, help exits 0) — BEFORE any effect; destinations, selections and the mode come from the PARSED result
const __P = __parseArgv({ tag: 'meshident-488d', usage: USAGE, value: [...FLAGS_1], multi: { '--compare': 2 }, unknown: 'refuse', positionals: 'none' }, argv);
const opt = {}; for (const f of FLAGS_1) if (__P.has(f)) opt[f.slice(2)] = __P.value(f); if (__P.has('--compare')) opt.compare = __P.value('--compare');
// FIX8 (mode-scoped: `--compare BASE HEAD` writes nothing and owns nothing at --out; capture owns the identity JSON) → FIX10: the first effect comes AFTER the parse, from the parsed destination
{ const { resolveMode: __rm, invalidateForMode: __ifm } = await import('./lib/mode-outputs.mjs');
  const __mode = __rm(__P.args, [['--compare', 'compare']], { defaultMode: 'capture' });
  if (opt.out) { const __f = path.resolve(String(opt.out)); __ifm({ OUT: null, mode: __mode, outputs: { capture: [__f], compare: [] }, tag: 'meshident-488d' }); } }

// D621-PLAN-3: names for the in-page matFields() columns (compare reports)
const MAT_FIELD_NAMES = ['type', 'name', 'color', 'emissive', 'roughness', 'metalness', 'opacity',
  'transparent', 'side', 'depthWrite', 'depthTest', 'envMapIntensity', 'alphaTest', 'blending',
  'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'visible', 'clearcoat',
  'clearcoatRoughness', 'specularIntensity', 'sheen', 'sheenRoughness', 'transmission', 'ior',
  'iridescence', 'reflectivity', 'aoMapIntensity', 'emissiveIntensity', 'normalScale', 'vertexColors',
  'flatShading', 'obClass', 'userData', 'onBeforeCompile',
  'programCacheKey', 'map', 'normalMap', 'roughnessMap', 'alphaMap', 'emissiveMap', 'aoMap', 'bumpMap',
  'metalnessMap', 'clearcoatMap'];

// ---------------------------------------------------------------------------
// COMPARE
// ---------------------------------------------------------------------------
if (opt.compare) {
  const [aPath, bPath] = opt.compare;
  for (const p of [aPath, bPath]) if (!p || !existsSync(p)) { console.error(`[meshident-488d] REFUSED — --compare ${JSON.stringify(p)}: file not found`); process.exit(2); } // FIX2
  const A = JSON.parse(readFileSync(aPath, 'utf8'));
  const B = JSON.parse(readFileSync(bPath, 'utf8'));
  const mustDiffer = new Set((opt['expect-differ'] || '').split(',')
    .map((s) => s.trim()).filter(Boolean));
  // D621-PLAN-3-RECORD: known, content-neutral instance-sharing deltas (e.g. the
  // Red Label's two side boots moving onto collarMatSide) — stated in the verdict
  const allowSharing = new Set((opt['allow-sharing'] || '').split(',')
    .map((s) => s.trim()).filter(Boolean));

  console.log(`# mesh identity: ${path.basename(aPath)}  vs  ${path.basename(bPath)}`);
  console.log(`#   A: ${A.label}  (${A.tables.length} tables)`);
  console.log(`#   B: ${B.label}  (${B.tables.length} tables)`);
  if (mustDiffer.size) console.log(`#   expect-differ: ${[...mustDiffer].join(', ')}`);
  console.log('');

  const ids = [...new Set([...A.tables.map((t) => t.id), ...B.tables.map((t) => t.id)])];
  let violations = 0;
  const verdicts = [];
  // D621-PLAN-3: an expect-differ id that was never captured used to pass
  // vacuously (the id was simply not in the loop) — it is a violation now
  for (const id of mustDiffer) {
    if (!ids.includes(id)) {
      console.log(`${id.padEnd(22)} EXPECTED TO DIFFER but captured on neither side <<< VIOLATION`);
      violations++;
      verdicts.push({ id, want: 'DIFFER', got: 'ABSENT', ok: false, diffs: ['absent'] });
    }
  }
  for (const id of ids) {
    const a = A.tables.find((t) => t.id === id);
    const b = B.tables.find((t) => t.id === id);
    const want = mustDiffer.has(id) ? 'DIFFER' : 'IDENTICAL';
    if (((!a) || (a && a.error && b && !b.error)) && b && mustDiffer.has(id)) {
      // D621-PLAN-3: an expect-differ table that the BASE never had (a new
      // catalog entry) is the branch's own — present on head only, not a leak
      console.log(`${id.padEnd(22)} NEW on B   want ${want.padEnd(10)} ok  (absent on the base: a new entry, not an identity question)`);
      verdicts.push({ id, want, got: 'NEW', ok: true, diffs: ['new on B'] });
      continue;
    }
    if (!a || !b) {
      console.log(`${id.padEnd(22)} ABSENT on ${a ? 'B' : 'A'} side — uncomparable`);
      violations++;
      verdicts.push({ id, want, got: 'ABSENT', ok: false, diffs: [`absent on ${a ? 'B' : 'A'}`] });
      continue;
    }
    if (a.error || b.error) {
      console.log(`${id.padEnd(22)} CAPTURE ERROR — A: ${a.error || 'ok'} / B: ${b.error || 'ok'}`);
      violations++;
      verdicts.push({ id, want, got: 'ERROR', ok: false, diffs: [`capture error A: ${a.error || 'ok'} / B: ${b.error || 'ok'}`] });
      continue;
    }
    // Field-level, so a verdict never has to be taken on trust: the report
    // says WHICH of geometry / names / materials / counts moved.
    const diffs = [];
    if (a.n !== b.n) diffs.push(`mesh count ${a.n} -> ${b.n}`);
    if (a.geom_sha !== b.geom_sha) diffs.push('geometry');
    if (a.attr_sha !== undefined && b.attr_sha !== undefined && a.attr_sha !== b.attr_sha) diffs.push('attributes'); // NOTE-FENCE-NORMALS: normals / uvs / tangents / colors / custom attributes / index / groups
    if (a.name_sha !== b.name_sha) diffs.push('names');
    if (a.mat_sha !== b.mat_sha) diffs.push('materials');
    if (a.vis_sha !== b.vis_sha) diffs.push('visibility');
    // D621-PLAN-3-RECORD: material instance sharing (per-mesh group-id sequence)
    if (a.share_sha !== undefined && b.share_sha !== undefined && a.share_sha !== b.share_sha) {
      diffs.push(`instance sharing (${a.n_material_instances} -> ${b.n_material_instances} material instances)`);
    }
    const contentSame = !diffs.some((d) => !d.startsWith('instance sharing'));
    const sharingOnly = diffs.length > 0 && contentSame;
    const allowed = sharingOnly && allowSharing.has(id);
    const same = diffs.length === 0;
    const got = same ? 'IDENTICAL' : (sharingOnly ? 'SHARING-DELTA' : 'DIFFER');
    // an allowed sharing delta satisfies an IDENTICAL expectation (content-identical, sharing restructured — stated, never hidden)
    const ok = got === want || (want === 'IDENTICAL' && allowed);
    if (!ok) violations++;
    verdicts.push({ id, want, got, ok, diffs, sharing_delta_allowed: allowed || undefined,
      n_material_instances: [a.n_material_instances, b.n_material_instances], tex_census: [a.tex_census, b.tex_census] });
    console.log(`${id.padEnd(22)} ${got.padEnd(13)} want ${want.padEnd(10)} `
      + `${ok ? (allowed ? 'ok (allowed sharing delta, content identical)' : 'ok') : '<<< VIOLATION'}${diffs.length ? `  [${diffs.join(', ')}]` : ''}`);

    // Per-mesh detail for anything that moved — a table-level hash tells you
    // that something changed, which is useless for judging whether the change
    // was the intended one.
    if (!same) {
      const rows = [];
      const nn = Math.max(a.meshes.length, b.meshes.length);
      for (let i = 0; i < nn; i++) {
        const ma = a.meshes[i]; const mb = b.meshes[i];
        if (!ma || !mb) { rows.push(`    [${i}] present on one side only: `
          + `${(ma || mb).name}`); continue; }
        const f = [];
        if (ma.name !== mb.name) f.push(`name ${ma.name} -> ${mb.name}`);
        if (ma.nt !== mb.nt) f.push(`tris ${ma.nt} -> ${mb.nt}`);
        if (ma.g !== mb.g) {
          const dy = mb.bb.map((v, k) => Math.round((v - ma.bb[k]) * 1e4) / 1e4);
          f.push(`geom${dy.some((v) => v) ? ` (bb delta mm ${dy.join(' ')})` : ' (bb equal)'}`);
        }
        if (ma.m !== mb.m) {
          // D621-PLAN-3: say WHICH material fields moved (first three)
          const fa = String(ma.mat || '').split(','), fb = String(mb.mat || '').split(',');
          const moved = [];
          for (let k = 0; k < Math.max(fa.length, fb.length) && moved.length < 3; k++) {
            if (fa[k] !== fb[k]) moved.push(`${MAT_FIELD_NAMES[k] || ('f' + k)} ${fa[k]} -> ${fb[k]}`);
          }
          f.push(`material${moved.length ? ` (${moved.join('; ')})` : ''}`);
        }
        if (ma.v !== mb.v) f.push(`visible ${ma.v} -> ${mb.v}`);
        if (ma.mg !== undefined && mb.mg !== undefined && ma.mg !== mb.mg) f.push(`material instance ${ma.mg} -> ${mb.mg}`);
        if (f.length) rows.push(`    [${i}] ${(mb.name || ma.name)}: ${f.join('; ')}`);
      }
      const CAP = 24;
      for (const r of rows.slice(0, CAP)) console.log(r);
      // No silent truncation: a capped list that does not say it is capped
      // reads as a complete one.
      if (rows.length > CAP) {
        console.log(`    … ${rows.length - CAP} more differing meshes not printed `
          + `(${rows.length} total)`);
      }
    }
  }
  console.log('');
  if (opt['json-out']) {
    // D621-PLAN-3: a machine-readable verdict the ALIGN gate folds in as the
    // MATERIAL-IDENTITY law rows (one per table; expect-differ ids must differ)
    const fileSha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
    writeFileSync(opt['json-out'], JSON.stringify({
      tool: 'meshident-488d', schema: 'd621-meshident/3',
      a: { path: aPath, label: A.label, web_dir: A.web_dir, web_table_js_sha256: A.web_table_js_sha256, capture_sha256: fileSha(aPath), tex_census: A.tex_census },
      b: { path: bPath, label: B.label, web_dir: B.web_dir, web_table_js_sha256: B.web_table_js_sha256, capture_sha256: fileSha(bPath), tex_census: B.tex_census },
      expect_differ: [...mustDiffer], allow_sharing: [...allowSharing], tables: ids, verdicts, violations,
      fields: ['geometry', 'names', 'materials (every shader scalar + texture content identity incl. DataTexture bytes + envMap)', 'instance sharing', 'visibility', 'mesh count'],
    }, null, 1) + '\n');
    console.log(`[meshident] verdict json -> ${opt['json-out']}`);
  }
  if (violations) {
    console.error(`[meshident] ${violations} identity violation(s) — exit 3`);
    process.exit(3);
  }
  console.log('[meshident] identity holds on every table, and every '
    + 'expect-differ table did differ (the instrument is not blind).');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// CAPTURE
// ---------------------------------------------------------------------------
if (!opt.out) { console.error(USAGE); process.exit(2); }
// FIX2: a --web that is given must be a directory that exists; a --compare pair must name two readable files
if (opt.web !== undefined && !(existsSync(opt.web) && statSync(opt.web).isDirectory())) { console.error(`[meshident-488d] REFUSED — --web ${JSON.stringify(opt.web)}: not a directory`); process.exit(2); }
const webDir = opt.web ? path.resolve(opt.web) : path.join(REPO, 'web');
// FIX1/FIX2: every id validated before any boot and the validator's RETURN is the list used (a blank
// `--tables=` is refused by the validator, never silently ALL_TABLES)
const tables = await (await import('./lib/table-ids.mjs')).requireTableIds(opt.tables !== undefined ? opt.tables.split(',') : ALL_TABLES, 'meshident-488d');

let PORT = process.env.OB_E2E_PORT ? Number(process.env.OB_E2E_PORT) : null;
let CDP = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : null;
let band = null;

async function waitReady(chrome) {
  let ready = false;
  for (let i = 0; i < 300 && !ready; i++) {
    await sleep(200);
    ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
  }
  if (!ready) throw new Error('__test.ready never went true');
  // GI settle: materials carry baked env intensity, and comparing a settled
  // capture against an unsettled one would report material drift that is only
  // timing. Geometry is unaffected either way.
  for (let i = 0; i < 200; i++) {
    const st = await chrome.eval('(() => { const s = window.__gi && window.__gi.state; '
      + 'return s ? JSON.stringify({ r: !!s.ready, b: !!s.baked }) : null; })()')
      .catch(() => null);
    if (st) { const v = JSON.parse(st); if (v.r && v.b) return 'gi-settled'; }
    await sleep(200);
  }
  return 'gi-unsettled';
}

/** The in-page digest. Hashing happens in the browser, incrementally, so a
 * 20k-triangle cloth never has to cross CDP as a megabyte of numbers. */
const DIGEST_FN = `(() => {
  const scene = window.__dbg.scene;
  scene.updateMatrixWorld(true);
  let tbl = null;
  scene.traverse((o) => { if (o.name === 'obTable') tbl = o; });
  if (!tbl) return JSON.stringify({ error: 'no obTable in scene' });
  const chainVisible = (o) => {
    for (let p = o; p; p = p.parent) if (p.visible === false) return false;
    return true;
  };
  const q = (v) => Math.round(v * 1e7);
  const num = (v) => (v === undefined || v === null ? ''
    : String(Math.round(v * 1e6) / 1e6));
  // D621-PLAN-3 (review r4 P1): MATERIAL IDENTITY per mesh — every scalar the
  // shader reads (clearcoatRoughness / specularIntensity / normalScale were
  // missing), the analytic-injection fingerprint (obClass, an onBeforeCompile
  // hook, the program-cache key) and a STABLE identity for every texture
  // (name, size, wrap/repeat/colour space and a 16x16 pixel hash of its
  // image — uuids are per session and cannot be compared across exports).
  // Presence bits alone let a re-materialled table through the fence.
  // D621-PLAN-3-RECORD: every texture slot gets a CONTENT hash — a DataTexture
  // ({data,width,height}, no drawImage) is hashed over its raw bytes, an
  // image / canvas / bitmap over a 16x16 readback; the census below counts the
  // path each slot took so a blind slot can never hide as 'tainted' again
  const census = { px: 0, data: 0, noimg: 0, tainted: 0 };
  const pixHash = (img) => {
    if (!img) { census.noimg++; return 'noimg'; }
    if (img.data && img.data.length !== undefined && !(typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement)) {
      // DataTexture / compressed mip: hash the raw buffer bytes (all of them)
      const raw = img.data.buffer ? new Uint8Array(img.data.buffer, img.data.byteOffset || 0, img.data.byteLength) : new Uint8Array(img.data);
      let h = 2166136261 >>> 0, g = 2654435761 >>> 0;
      for (let i = 0; i < raw.length; i++) { h ^= raw[i]; h = Math.imul(h, 16777619) >>> 0; g = Math.imul(g ^ raw[i], 2246822519) >>> 0; }
      census.data++;
      return 'd' + h.toString(16).padStart(8, '0') + g.toString(16).padStart(8, '0') + ':' + raw.length;
    }
    try {
      if (!(img.width > 0) || !(img.height > 0)) { census.noimg++; return 'noimg'; }
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, 16, 16);
      const d = x.getImageData(0, 0, 16, 16).data;
      let h = 2166136261 >>> 0;
      for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; }
      census.px++;
      return 'p' + h.toString(16).padStart(8, '0');
    } catch (e) { census.tainted++; return 'tainted'; }
  };
  const texId = (t) => (t ? [
    t.name || '', t.image ? (t.image.width || 0) : 0, t.image ? (t.image.height || 0) : 0,
    t.wrapS, t.wrapT, num(t.repeat && t.repeat.x), num(t.repeat && t.repeat.y),
    num(t.offset && t.offset.x), num(t.offset && t.offset.y), num(t.rotation),
    t.colorSpace || '', t.flipY ? 1 : 0, t.anisotropy || 0, pixHash(t.image),
  ].join(':') : '0');
  const udDesc = (ud) => {
    const seen = new Set();
    const ser = (v, depth) => {
      if (v === undefined || v === null || v === false) return null;   // absent == false (=== true reads)
      if (v === true) return 'T';
      if (typeof v === 'number') return num(v);
      if (typeof v === 'string') return JSON.stringify(v);
      if (typeof v === 'function') return 'fn';
      if (depth > 4) return '…';
      if (v.isTexture) return 'tex:' + texId(v);
      if (v.isVector3 || v.isColor) return '[' + num(v.x !== undefined ? v.x : v.r) + ',' + num(v.y !== undefined ? v.y : v.g) + ',' + num(v.z !== undefined ? v.z : v.b) + ']';
      if (v.isVector2) return '[' + num(v.x) + ',' + num(v.y) + ']';
      if (Array.isArray(v) || ArrayBuffer.isView(v)) return '[' + Array.from(v).map((x) => ser(x, depth + 1)).join(',') + ']';
      if (typeof v === 'object') {
        if (seen.has(v)) return 'cyc';
        seen.add(v);
        const keys = Object.keys(v).sort();
        const parts = [];
        for (const k of keys) { const r = ser(v[k], depth + 1); if (r !== null) parts.push(k + ':' + r); }
        return '{' + parts.join(',') + '}';
      }
      return String(v);
    };
    const r = ser(ud || {}, 0);
    return r === null ? '{}' : r;
  };
  const matFields = (m) => (m ? [
    m.type, m.name || '',
    m.color ? m.color.getHexString() : '',
    m.emissive ? m.emissive.getHexString() : '',
    num(m.roughness), num(m.metalness), num(m.opacity),
    m.transparent ? 1 : 0, m.side, m.depthWrite ? 1 : 0, m.depthTest ? 1 : 0,
    num(m.envMapIntensity), num(m.alphaTest), m.blending,
    m.polygonOffset ? 1 : 0, num(m.polygonOffsetFactor),
    num(m.polygonOffsetUnits), m.visible ? 1 : 0,
    num(m.clearcoat), num(m.clearcoatRoughness), num(m.specularIntensity),
    num(m.sheen), num(m.sheenRoughness), num(m.transmission), num(m.ior),
    num(m.iridescence), num(m.reflectivity), num(m.aoMapIntensity),
    num(m.emissiveIntensity),
    m.normalScale ? num(m.normalScale.x) + '/' + num(m.normalScale.y) : '',
    m.vertexColors ? 1 : 0, m.flatShading ? 1 : 0,
    (m.userData && m.userData.obClass) || '',
    // D621-PLAN-3-RECORD-2 addendum (review r5 P3): every shader-read holder on
    // the material's userData is hashed BY VALUE — { value: number }, { value:
    // Vector3 }, arrays, booleans, strings, nested objects — not by presence.
    // A present-but-false flag and an absent flag still read the same (the
    // shaders test === true; the presence-aware setters delete instead of
    // writing false), so false / undefined are dropped before hashing.
    'ud=' + udDesc(m.userData),
    typeof m.onBeforeCompile === 'function' && !/^\s*onBeforeCompile\s*\(\s*\)\s*\{\s*\}\s*$/.test(String(m.onBeforeCompile)) ? 'obc' : '',
    typeof m.customProgramCacheKey === 'function' ? String(m.customProgramCacheKey()) : '',
    'map=' + texId(m.map), 'nrm=' + texId(m.normalMap), 'rgh=' + texId(m.roughnessMap),
    'alp=' + texId(m.alphaMap), 'emi=' + texId(m.emissiveMap), 'ao=' + texId(m.aoMap),
    'bmp=' + texId(m.bumpMap), 'mtl=' + texId(m.metalnessMap), 'cc=' + texId(m.clearcoatMap),
    'env=' + texId(m.envMap), // per-material envMap (scene.environment is not on the material; recorded when set)
  ].join(',') : 'null');
  const matDesc = (mm) => (Array.isArray(mm) ? mm : [mm]).map(matFields).join('|');
  const strHash = (s) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    let g = 2654435761 >>> 0;
    for (let i = s.length - 1; i >= 0; i--) { g = Math.imul(g ^ s.charCodeAt(i), 2246822519) >>> 0; }
    return h.toString(16).padStart(8, '0') + g.toString(16).padStart(8, '0');
  };
  /** world-space vertex soup, quantised to 0.1 um. Two independent
   * accumulators: one order-sensitive FNV-1a, one mixing multiplier. */
  const geomHash = (o) => {
    const g = o.geometry;
    const pos = g.getAttribute('position');
    if (!pos) return 'nopos';
    const idx = g.index;
    const e = o.matrixWorld.elements;
    const n = idx ? idx.count : pos.count;
    let h1 = 2166136261 >>> 0;
    let h2 = 2654435761 >>> 0;
    for (let i = 0; i < n; i++) {
      const vi = idx ? idx.getX(i) : i;
      const vx = pos.getX(vi); const vy = pos.getY(vi); const vz = pos.getZ(vi);
      const wx = q(e[0] * vx + e[4] * vy + e[8] * vz + e[12]) | 0;
      const wy = q(e[1] * vx + e[5] * vy + e[9] * vz + e[13]) | 0;
      const wz = q(e[2] * vx + e[6] * vy + e[10] * vz + e[14]) | 0;
      h1 = Math.imul(h1 ^ wx, 16777619) >>> 0;
      h1 = Math.imul(h1 ^ wy, 16777619) >>> 0;
      h1 = Math.imul(h1 ^ wz, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ ((wx * 3 + wy * 5 + wz * 7) | 0), 2246822519) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  };
  // NOTE-FENCE-NORMALS (2026-09-09): a positions+index hash lets a normals-only
  // change pass while the renderer installs those normals. attrHash covers the
  // RAW BYTES of every attribute the renderer reads (sorted by name — position,
  // normal, uv, tangent, color and every custom attribute such as aOccl), the
  // index, the groups and the draw range; order-sensitive, two FNV accumulators.
  const attrHash = (o) => {
    const g = o.geometry;
    let h1 = 2166136261 >>> 0, h2 = 2654435761 >>> 0;
    const feed = (bytes) => { for (let i = 0; i < bytes.length; i++) { h1 = Math.imul(h1 ^ bytes[i], 16777619) >>> 0; h2 = Math.imul(h2 ^ ((bytes[i] * 3 + i) | 0), 2246822519) >>> 0; } };
    const feedStr = (str) => { for (let i = 0; i < str.length; i++) { h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619) >>> 0; h2 = Math.imul(h2 ^ (str.charCodeAt(i) * 7 + i), 2246822519) >>> 0; } };
    const bytesOf = (a) => { const arr = a.isInterleavedBufferAttribute ? a.data.array : a.array; return new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); };
    for (const k of Object.keys(g.attributes).sort()) { const a = g.attributes[k]; feedStr(k + ':' + a.itemSize + ':' + (a.normalized ? 1 : 0) + ':' + (a.array ? a.array.constructor.name : 'i') + ';'); feed(bytesOf(a)); }
    if (g.index) { feedStr('index:' + g.index.array.constructor.name + ';'); feed(bytesOf(g.index)); }
    feedStr('groups:' + JSON.stringify(g.groups || []) + ';range:' + g.drawRange.start + ':' + String(g.drawRange.count));
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  };
  const meshes = [];
  // D621-PLAN-3-RECORD: material INSTANCE sharing — each distinct material
  // object gets a group id in first-seen order (M0, M1, …); the per-mesh
  // sequence of group ids is compared main vs head, so a table whose meshes
  // move between shared instances (content-identical or not) reads as a
  // sharing delta, never as IDENTICAL
  const groupOf = new Map();
  const mgId = (mm) => (Array.isArray(mm) ? mm : [mm]).map((m) => {
    if (!m) return 'null';
    if (!groupOf.has(m)) groupOf.set(m, 'M' + groupOf.size);
    return groupOf.get(m);
  }).join('+');
  // EVERY mesh, visible or not: a leak that only moves a hidden mesh is still
  // a leak, and visibility itself is recorded so a hide/show is caught too.
  tbl.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const pos = o.geometry.getAttribute('position');
    if (!pos) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    const md = matDesc(o.material); // once per mesh (the texture census counts each slot once)
    meshes.push({
      name: o.name || '(anon)',
      nt: (o.geometry.index ? o.geometry.index.count : pos.count) / 3,
      bb: [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z]
        .map((v) => Math.round(v * 1e6) / 1e3),
      g: geomHash(o),
      ab: attrHash(o),         // NOTE-FENCE-NORMALS: every attribute's raw bytes + index + groups + draw range
      m: strHash(md),
      mat: md,                  // the fields themselves, so a compare names WHAT moved
      mg: mgId(o.material),     // material instance group id (sharing structure)
      v: chainVisible(o) ? 1 : 0,
    });
  });
  return JSON.stringify({
    n: meshes.length,
    geom_sha: strHash(meshes.map((r) => r.g).join(';')),
    attr_sha: strHash(meshes.map((r) => r.ab).join(';')),
    name_sha: strHash(meshes.map((r) => r.name).join(';')),
    mat_sha: strHash(meshes.map((r) => r.m).join(';')),
    share_sha: strHash(meshes.map((r) => r.mg).join(';')),
    n_material_instances: groupOf.size,
    vis_sha: strHash(meshes.map((r) => r.v).join(';')),
    tex_census: census,
    meshes,
  });
})()`;

const SETTLE_SIG = "(() => {\n  const scene = window.__dbg && window.__dbg.scene; if (!scene) return 'noscene';\n  const sig = [];\n  scene.traverse((o) => {\n    if (!o.isMesh || !o.geometry) return; const g = o.geometry;\n    for (const k of Object.keys(g.attributes).sort()) { const a = g.attributes[k]; sig.push((o.name || '(anon)') + ':' + k + ':' + a.version + ':' + a.count); }\n    if (g.index) sig.push((o.name || '(anon)') + ':index:' + g.index.version + ':' + g.index.count);\n    sig.push((o.name || '(anon)') + ':attrs:' + Object.keys(g.attributes).sort().join(','));\n  });\n  return sig.join('|');\n})()";
async function settleAttributes(chrome, { stillReads = 3, stepMs = 250, capMs = 30000 } = {}) {
  // ADOPTION finding (2026-09-11, card 4a4316e9): the runtime occlusion transport (table.js snkApplyOccl -> aOccl) is
  // traced in 12 ms slices and each mesh's attribute is ATTACHED only when its job completes — a version poll cannot see
  // a queue that has not attached anything yet, so two boots of the SAME tree hashed different aOccl sets (11 snooker
  // pocket meshes). The documented render-determinism seam drains every pending trace synchronously (review env-r13 P2):
  // flush FIRST, then require stillness. Measured after the flush: 0 attribute differences across boots and trees.
  const tD = Date.now();
  const drained = await chrome.eval("(() => { const f = window.__snkOccl && window.__snkOccl.flush; if (!f) return 'noseam'; f(); return 'flushed'; })()");
  const drain_ms = Date.now() - tD;
  const t0 = Date.now(); let prev = null, still = 0, reads = 0, changes = 0, firstChange = null, lastChange = null, lastDiff = [];
  while (Date.now() - t0 < capMs) {
    const sig = await chrome.eval(SETTLE_SIG); reads++;
    if (sig === prev) still++;
    else {
      if (prev !== null) { changes++; lastChange = Date.now() - t0; if (firstChange === null) firstChange = lastChange;
        const A = new Set(prev.split('|')), B = new Set(sig.split('|')); lastDiff = [...B].filter((x) => !A.has(x)).slice(0, 8); }
      still = 0; prev = sig;
    }
    if (still >= stillReads - 1) return { drained, drain_ms, reads, seconds: Math.round((Date.now() - t0) / 100) / 10, changes, first_change_s: firstChange === null ? null : firstChange / 1000, last_change_s: lastChange === null ? null : lastChange / 1000, entries: prev.split('|').length };
    await sleep(stepMs);
  }
  throw new Error(`attribute census did not settle within ${capMs / 1000} s (${changes} changes; last movers: ${lastDiff.join(', ') || '?'})`);
}

async function capture() {
  if (!PORT || !CDP) {
    band = await claimPortBand(25010, 25039);
    PORT = band.http(0);
    CDP = band.cdp(0);
  }
  // FIX11 (review round 11 on #731 P2 A): ONE readiness law — the shared preflight's bounded wait, then the FIX3 checks (ownership by
  // pid lineage, served bytes = the requested --web tree's); never-binds exits 78 by name; `--perturb=slow-server` binds the same owned
  // server 4 s late (the arm). Inside the try so a refusal still reaches the finally that stops the server.
  if (opt.perturb !== undefined && opt.perturb !== 'slow-server') { console.error(`[meshident-488d] REFUSED — unknown perturbation ${JSON.stringify(opt.perturb)} (known: slow-server)`); process.exit(2); }
  const { awaitOwnedServer, spawnOwnedServerDelayed } = await import('./lib/serve-check.mjs');
  // COMPANION-1b: an if/else, not a ternary — main's ci-bands lint reads `x = cond ? a : b` as a pin/fallback pair and judged the
  // spawnStaticServer branch as an "unpinned fallback" (derived-default-unparsed); the two statements below are the same two spawns
  let server;
  if (opt.perturb === 'slow-server') server = spawnOwnedServerDelayed(webDir, PORT, 4000);
  else server = spawnStaticServer(webDir, PORT);
  const out = [];
  try {
    await awaitOwnedServer(server, PORT, webDir, 'meshident-488d');
    await sleep(800);
    for (const id of tables) {
      const url = `http://127.0.0.1:${PORT}/app.html?table=${id}&cinema=1&seed=7&look=default`;
      let chrome = null;
      try {
        chrome = await launchChrome(url, { port: CDP, width: 900, height: 600 });
        const gi = await waitReady(chrome);
        await sleep(1200);
        // NOTE-CENSUS-SETTLE (2026-09-09): hash only once every mesh's attribute + index
        // versions (and the attribute set) have held still for >= 3 reads at 250 ms; cap
        // 30 s -> refuse BY NAME (a baked occlusion apply lands in stages after ready)
        const settle = await settleAttributes(chrome);
        // Refuse to digest a table the app did not actually build. Without
        // this, a boot that silently fell back to the scripted-pin entry would
        // be recorded under the requested id and would compare "identical"
        // for the most boring possible reason.
        const active = await chrome.eval(
          "import('./scene/table.js').then((t) => t.activeTableId())");
        if (active !== id) {
          out.push({ id, error: `app built '${active}', not '${id}'` });
          console.log(`${id.padEnd(22)} SKIPPED — app built '${active}'`);
          continue;
        }
        const rec = JSON.parse(await chrome.eval(DIGEST_FN));
        rec.settle = settle;
        if (rec.error) { out.push({ id, error: rec.error }); console.log(`${id.padEnd(22)} ${rec.error}`); continue; }
        out.push({ id, gi, ...rec });
        console.log(`${id.padEnd(22)} ${String(rec.n).padStart(4)} meshes  `
          + `geom ${rec.geom_sha}  mat ${rec.mat_sha}  names ${rec.name_sha}  (${gi})`);
      } catch (e) {
        out.push({ id, error: String(e && e.message ? e.message : e) });
        console.log(`${id.padEnd(22)} ERROR ${e && e.message ? e.message : e}`);
      } finally {
        if (chrome) { try { chrome.close(); } catch { /* already gone */ } }
        await sleep(300);
      }
    }
  } finally {
    stopStaticServer(server);
    if (band && band.release) { try { await band.release(); } catch { /* best effort */ } }
  }
  return out;
}

const captured = await capture().catch((e) => { if (e && e.refused) { console.error(e.message); process.exit(e.exitCode ?? 2); } throw e; }); // a refusal exits 2 after the finally has stopped the server
// D621-PLAN-3-RECORD: the capture is BOUND to the served tree — the digest of
// its scene/table.js is what the ALIGN fold compares against the dump's own
// served tree, so a verdict from another tree cannot be folded in
const tableJsPath = path.join(webDir, 'scene', 'table.js');
const webTableJsSha256 = existsSync(tableJsPath) ? createHash('sha256').update(readFileSync(tableJsPath)).digest('hex') : null;
const texTotals = captured.reduce((acc, t) => { const c = t.tex_census || {}; for (const k of Object.keys(c)) acc[k] = (acc[k] || 0) + c[k]; return acc; }, {});
const record = {
  tool: 'meshident-488d',
  schema: 'd621-meshident-capture/3', // /3: per-mesh attribute-bytes hash (attr_sha) + the settle wait
  label: opt.web ? `candidate tree ${webDir}` : 'repo tree ./web',
  web_dir: webDir,
  web_table_js_sha256: webTableJsSha256,
  tex_census: texTotals,
  tables: captured,
};
console.log(`[meshident] texture slots: ${JSON.stringify(texTotals)} — px = image readback hash, data = DataTexture byte hash, noimg = a texture with no readable image (render-target environment maps: compared by parameters, content out of scope), tainted must be 0`);
mkdirSync(path.dirname(path.resolve(opt.out)), { recursive: true });
writeFileSync(path.resolve(opt.out), `${JSON.stringify(Object.assign({ tool: 'tools/render/meshident-488d.mjs', mode: 'capture' }, record), null, 2)}\n`); // FIX8: tool + mode first
console.log(`\n[meshident] wrote ${opt.out}`);
const starved = captured.filter((t) => t.error);
if (starved.length) {
  console.error(`[meshident] ${starved.length} table(s) failed to capture — exit 4`);
  process.exit(4);
}
