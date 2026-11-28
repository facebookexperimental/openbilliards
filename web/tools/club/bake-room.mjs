#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// bake-room.mjs — the node half of the club room's light bake (bake role). No packages; zlib and crypto from node itself.
//
// The compute half is web/tools/club/bake-room.html: it runs in a headless browser (on the lane's loan host, through the
// lane's page-mode screenshot tool), bakes the map and leaves it in the job's record file as `eval` = window.__bake
// ({ meta, size, rows, gz: base64 of gzip of RGBA8 rows, ... }). This script turns such records into the shipped file.
//
//   node web/tools/club/bake-room.mjs write <record.json> [<record.json> ...] [--host "<the kind of machine>"] [--dry] [--force]
//       One record with every row, or several records whose row bands cover the atlas (a job is capped at 300 s; each job
//       can bake a band: ?rows=a-b). Writes web/assets/club/room-light.png (RGBA8, adaptive row filters, zlib level 6, the
//       bake's record in a tEXt chunk, the light volume of the job that holds row 0 in a private `rlVo` chunk) and its rows
//       in manifest.json, credits.json (with the totals) and CREDITS.md. Other
//       rows are not touched. The PNG bytes are a pure function of the records and of node's zlib. Before it writes, it
//       builds the room from THIS tree (bake-room-node.mjs --hash) and compares content hashes of the blocker triangles, the
//       emitter table and the albedo hints with the record: a bake of another tree is refused (--force writes it anyway and
//       says so in the credits row). The digests of the source files at that moment go into the credits row.
//   node web/tools/club/bake-room.mjs verify <record.json>
//       The record of a job run with ?dump=1 (its `eval` = { bake: window.__bake, scene: window.__bakeScene }): re-computes
//       the map here, in node, single-threaded, from the dumped scene with the same core (bake-room-core.mjs) and compares
//       it byte for byte with what the browser produced. Use a reduced size (?size=256): about 1/16 of the work.
//   node web/tools/club/bake-room.mjs check
//       For each shipped file (room-light.png for the base and high tiers, room-light-lite.png for the lite tier: the record's
//       tier decides which one `write` makes): reads it back: PNG structure, the record in it, digest against the manifest and credits rows; then the
//       same tree test as `write`: exit 1 with "STALE" and the owner whose geometry moved when the tree no longer builds the
//       baked scene (about 1 s). This is the exact staleness test; the run-time test is the room's signature (room.js).
//   node web/tools/club/bake-room.mjs selftest
//       The core against brute force on a tiny scene, the PNG writer against the reader, base64 both ways (about 1 s).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as CORE from './bake-room-core.mjs';
import * as ENV from './bake-room-env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, '../../assets/club');
// One file per room: the base and high tiers build the same room plan (one signature) and share `room.light`; the lite tier
// builds a smaller room (fewer lamps, no far table) and has its own, smaller file under its own id (a bake of
// ?clubtier=lite&size=512). The record's tier decides which one a `write` makes.
const TARGETS = Object.freeze({
  full: Object.freeze({ file: 'room-light.png', id: 'room.light', variant: 'full', bake: 'size=1024' }),
  lite: Object.freeze({ file: 'room-light-lite.png', id: 'room.light.lite', variant: 'lite', bake: 'clubtier=lite&size=512' }),
});
// The arena venue (web/scene/club/arena/room.js; CONTRACT.md section 13) has its own two files under its own ids: a record
// baked with ?venue=arena carries `scene.venue: 'arena'`, and that decides the target, the inputs and the tree test.
const ARENA_TARGETS = Object.freeze({
  full: Object.freeze({ file: 'arena-light.png', id: 'arena.light', variant: 'full', bake: 'venue=arena&size=1024', venue: 'arena' }),
  lite: Object.freeze({ file: 'arena-light-lite.png', id: 'arena.light.lite', variant: 'lite', bake: 'venue=arena&clubtier=lite&size=512', venue: 'arena' }),
});
const targetOf = (tier, venue = null) => (venue === 'arena' ? (tier === 'lite' ? ARENA_TARGETS.lite : ARENA_TARGETS.full) : (tier === 'lite' ? TARGETS.lite : TARGETS.full));
// The hall's static cube (CONTRACT 19.1, round A7; bake-room-env.mjs): two files beside the arena's light maps, each
// captured under the light file of its tier (`light`). Both together stay under ENV_CAP bytes.
const ENV_TARGETS = Object.freeze({
  full: Object.freeze({ file: 'arena-env.png', id: 'arena.env', variant: 'full', light: 'full', bake: 'venue=arena&clubtier=high&envonly=1' }),
  lite: Object.freeze({ file: 'arena-env-lite.png', id: 'arena.env.lite', variant: 'lite', light: 'lite', bake: 'venue=arena&clubtier=lite&envonly=1' }),
});
const ENV_CAP = 400000;
const TEXT_KEY = 'club-room-light';
const VOLUME_CHUNK = 'rlVo'; // the light volume: a private ancillary chunk (web/scene/club/room/lightmap.js LM_VOLUME_CHUNK)
const ZLIB_LEVEL = 6;        // (level 9 saves about 1 % and takes three times as long on a shared machine)

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const die = (msg) => { console.error(`bake-room: ${msg}`); process.exit(1); };

// ---- what the map was baked against ---------------------------------------------------------------------------------------------
// The source files a bake reads (the room, its light service, the props, the luminaire, and the tool's own scene rules).
const REPO = path.resolve(here, '../../..');
const INPUTS = [
  'web/scene/club/room.js', 'web/scene/club/room/shell.js', 'web/scene/club/room/light.js', 'web/scene/club/room/lightmap.js',
  'web/scene/club/room/props.js', 'web/scene/club/room/props/', 'web/scene/club/room/lamp.js', 'web/scene/club/room/lamp/',
];
const ARENA_INPUTS = [
  'web/scene/club/arena/room.js', 'web/scene/club/arena/shell.js', 'web/scene/club/arena/shell/', 'web/scene/club/arena/layout.js', 'web/scene/club/room/light.js', 'web/scene/club/room/lightmap.js',
  'web/scene/club/arena/rig.js', 'web/scene/club/arena/rig/', 'web/scene/club/arena/surround.js', 'web/scene/club/arena/surround/',
  'web/scene/club/arena/floor.js', 'web/scene/club/arena/floor/',
];
const inputsOf = (venue) => (venue === 'arena' ? ARENA_INPUTS : INPUTS);
const TOOL_INPUTS = ['web/tools/club/bake-room-core.mjs', 'web/tools/club/bake-room-scene.mjs', 'web/tools/club/bake-room.html', 'web/tools/club/bake-room-worker.mjs'];
/** sha256 of every input file (directories expanded, paths sorted) and one digest over the list "sha256  path\n". */
function inputDigest(list = [...INPUTS, ...TOOL_INPUTS]) {
  const files = [];
  const walk = (rel) => {
    const abs = path.join(REPO, rel);
    if (!fs.existsSync(abs)) return;
    if (fs.statSync(abs).isDirectory()) { for (const n of fs.readdirSync(abs).sort()) walk(path.posix.join(rel, n)); } else files.push(rel.replace(/\/$/, ''));
  };
  for (const rel of list) walk(rel);
  files.sort();
  const each = {};
  for (const f of files) each[f] = sha256(fs.readFileSync(path.join(REPO, f)));
  return { files: files.length, sha256: sha256(Buffer.from(files.map((f) => `${each[f]}  ${f}\n`).join(''), 'utf8')), each };
}
/** The scene THIS tree builds (bake-room-node.mjs --hash: the real room in node, about 1 s): signature and content hashes. */
function liveScene(tier = 'base', gain = 2, venue = null) {
  const r = spawnSync(process.execPath, [path.join(here, 'bake-room-node.mjs'), '--hash', '--tier', String(tier), '--gain', String(gain), ...(venue === 'arena' ? ['--venue', 'arena'] : [])], { encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) return { error: (r.stderr || r.error?.message || `exit ${r.status}`).trim().slice(0, 400) };
  try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch (e) { return { error: `unreadable answer: ${e.message}` }; }
}
/** Which parts of the baked scene differ from the live one ([] = the tree builds exactly what was baked). */
function sceneDiff(meta, live) {
  if (live.error) return [`the live room could not be built here (${live.error})`];
  const out = [];
  if (live.sig !== meta.sig) out.push(`signature (baked ${meta.sig}, tree ${live.sig}): the room refuses this map at run time`);
  const c = meta.scene?.content;
  if (!c) { out.push('the record carries no content hashes (baked by an older tool): re-bake'); return out; }
  // (the arena's record also splits the blockers by part: the report names the role whose geometry moved)
  const byPart = c.parts && live.content?.parts ? Object.keys({ ...c.parts, ...live.content.parts }).filter((k) => c.parts[k]?.hash !== live.content.parts[k]?.hash) : [];
  for (const k of ['shell', 'props', 'luminaire', 'table', 'emitters', 'albedo']) if (c[k] !== live.content?.[k]) out.push(`${k} (baked ${c[k]}, tree ${live.content?.[k]})`);
  for (const k of byPart) out.push(`the ${k}'s geometry (baked ${c.parts[k]?.hash ?? 'none'} with ${c.parts[k]?.triangles ?? 0} triangles, tree ${live.content.parts[k]?.hash ?? 'none'} with ${live.content.parts[k]?.triangles ?? 0})`);
  if (!out.length && c.geometry !== live.content?.geometry) out.push(`geometry order (baked ${c.geometry}, tree ${live.content?.geometry})`);
  // the main lamp's pool (room/light.js POOL) shapes the lamp's light on the floor in the shader and the bounce in the bake
  const pb = meta.lamp?.pool, pl = live.pool;
  if (Array.isArray(pb) && Array.isArray(pl) && (pb[0] !== pl[0] || pb[1] !== pl[1] || (pb[2] ?? 1) !== (pl[2] ?? 1))) out.push(`lamp pool (baked ${pb.join(' / ')}, tree ${pl.join(' / ')}): room/light.js POOL moved`);
  return out;
}

// ---- PNG ----------------------------------------------------------------------------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); };
/** RGBA8 -> PNG: per row the filter (0..4) with the smallest sum of absolute residuals, zlib, tEXt chunks, and `extra`
 * ({ type: bytes }: private ancillary chunks, each stored as a zlib stream) before the image data. */
export function encodePng(width, height, rgba, text, extra = null) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    const sums = [0, 0, 0, 0, 0];
    for (let x = 0; x < stride; x++) {
      const v = rgba[row + x];
      const a = x >= 4 ? rgba[row + x - 4] : 0, b = y > 0 ? rgba[row + x - stride] : 0, c = (x >= 4 && y > 0) ? rgba[row + x - stride - 4] : 0;
      const r = [v, (v - a) & 0xff, (v - b) & 0xff, (v - ((a + b) >> 1)) & 0xff, (v - paeth(a, b, c)) & 0xff];
      for (let f = 0; f < 5; f++) { cand[f][x] = r[f]; sums[f] += r[f] < 128 ? r[f] : 256 - r[f]; }
    }
    let best = 0;
    for (let f = 1; f < 5; f++) if (sums[f] < sums[best]) best = f;
    raw[y * (stride + 1)] = best;
    raw.set(cand[best], y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const chunks = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr)];
  for (const [k, v] of Object.entries(text ?? {})) chunks.push(chunk('tEXt', Buffer.concat([Buffer.from(k, 'latin1'), Buffer.from([0]), Buffer.from(v, 'latin1')])));
  for (const [type, bytes] of Object.entries(extra ?? {})) chunks.push(chunk(type, zlib.deflateSync(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength), { level: 9 })));
  chunks.push(chunk('IDAT', zlib.deflateSync(raw, { level: ZLIB_LEVEL })), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}
export function decodePng(buf) {
  let off = 8, width = 0, height = 0, depth = 0, colorType = 0;
  const idat = [], text = {}, extra = {};
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString('latin1', off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (crc32(buf.subarray(off + 4, off + 8 + len)) !== buf.readUInt32BE(off + 8 + len)) throw new Error(`chunk ${type}: bad CRC`);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'tEXt') { const z = data.indexOf(0); text[data.toString('latin1', 0, z)] = data.toString('latin1', z + 1); }
    else if (type === VOLUME_CHUNK) extra[type] = new Uint8Array(zlib.inflateSync(data));
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || colorType !== 6) throw new Error('not an 8-bit RGBA PNG');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? rgba[dst + x - 4] : 0, b = y > 0 ? rgba[dst + x - stride] : 0, c = (x >= 4 && y > 0) ? rgba[dst + x - stride - 4] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) v += paeth(a, b, c);
      rgba[dst + x] = v & 0xff;
    }
  }
  return { width, height, rgba, text, extra };
}

// ---- records --------------------------------------------------------------------------------------------------------------------
function readRecord(file) {
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const bake = rec.eval?.bake ?? rec.eval;
  if (!bake || typeof bake.gz !== 'string' || !bake.meta) die(`${file}: no bake in the record (run the page with --eval "return window.__bake")`);
  const volume = typeof bake.volume?.gz === 'string' ? new Uint8Array(zlib.gunzipSync(Buffer.from(CORE.fromBase64(bake.volume.gz)))) : null;
  return { file, rec, bake, band: zlib.gunzipSync(Buffer.from(CORE.fromBase64(bake.gz))), volume };
}
// the mean indirect light of the room from the bands' own sums (see bake-room-core.mjs meanIndirect)
function ambientOf(sums) {
  const mean = (a) => (a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3]] : [0, 0, 0]);
  const sky = mean(sums[0]), wall = mean(sums[1]), ground = mean(sums[2]);
  const side = wall.map((v, i) => Math.max(0, v - (sky[i] + ground[i]) / 2));
  const r4 = (a) => a.map((v) => Math.round(v * 10000) / 10000);
  return { sky: r4(sky), ground: r4(ground), side: r4(side) };
}

function assemble(files) {
  const recs = files.map(readRecord).sort((a, b) => a.bake.rows[0] - b.bake.rows[0]);
  const first = recs[0].bake;
  const size = first.size;
  const same = (m) => JSON.stringify({ ...m, ambient: null, volume: null, scene: m.scene?.content ?? null });
  const rgba = new Uint8Array(size * size * 4);
  let next = 0;
  const sums = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (const r of recs) {
    const b = r.bake;
    if (b.size !== size || same(b.meta) !== same(first.meta)) die(`${r.file}: this band was baked with another room, size or settings than ${recs[0].file}`);
    if (b.rows[0] !== next) die(`${r.file}: rows ${b.rows[0]}..${b.rows[1]} do not continue at row ${next}`);
    if (r.band.length !== (b.rows[1] - b.rows[0]) * size * 4) die(`${r.file}: band size`);
    rgba.set(r.band, b.rows[0] * size * 4);
    next = b.rows[1];
    for (let k = 0; k < 3; k++) for (let c = 0; c < 4; c++) sums[k][c] += b.ambientSums[k][c];
  }
  if (next !== size) die(`rows ${next}..${size} are missing`);
  // the light volume: made by the job that holds row 0
  const withVol = recs.find((r) => r.volume && r.bake.meta.volume);
  const vm = withVol?.bake.meta.volume ?? null;
  if (withVol && withVol.volume.length !== vm.dims[0] * vm.dims[1] * vm.dims[2] * 6 * 4) die(`${withVol.file}: the light volume's size does not fit its record`);
  const meta = { ...first.meta, ambient: ambientOf(sums), volume: vm };
  return { size, rgba, meta, recs, volume: withVol?.volume ?? null, volumeStats: withVol?.bake.volume?.stats ?? null };
}

function replaceSection(md, heading, body) {
  const start = md.indexOf(heading);
  if (start < 0) return `${md.replace(/\n*$/, '\n')}\n${heading}\n\n${body}\n`;
  const rest = md.indexOf('\n### ', start + heading.length);
  return `${md.slice(0, start)}${heading}\n\n${body}\n${rest < 0 ? '' : md.slice(rest)}`;
}

// The credits are public: `--host` says what KIND of machine baked (an operating system, an architecture, the GL), never a
// machine's name, a network name or the name of a tool outside this repository.
// (round A5) A volume whose COMPUTED peak is over the file's full scale: the printed "peak" is what the solve found at a
// grid point in the near field of an emitter (1 / d^2 a few centimetres from a fixture), not what the file holds. The
// file stores such a sample AT the full scale: the line says so, with the count. Nothing is added while the peak is
// inside the full scale (every club bake: the club's lines read as they always did).
const volumeClipNote = (vs, meta) => (Number.isFinite(vs?.peak) && Number.isFinite(meta?.fullScale) && vs.peak > meta.fullScale
  ? ` COMPUTED (the near field of an emitter); the file stores at most its full scale ${meta.fullScale}: ${vs.clippedSamples ?? '?'} of ${(vs.points ?? 0) * 6} samples are stored clipped at ${meta.fullScale}` : '');
const HOST_DEFAULT = 'a Linux x86_64 host (software GL)';
const HOST_BARRED = /\d{4,}|\.(com|net|org|internal)\b|\bvm\w*\d|dshot|loan|lane\b|@/i;
function write(files, { host = null, dry = false, force = false } = {}) {
  host = host ?? HOST_DEFAULT;
  if (HOST_BARRED.test(host)) die(`--host "${host}" reads like a machine name or a private tool name: say what kind of machine it was (default: "${HOST_DEFAULT}")`);
  const { size, rgba, meta, recs, volume, volumeStats } = assemble(files);
  const venue = meta.scene?.venue === 'arena' ? 'arena' : null;
  const { file: FILE, id: ID, variant } = targetOf(meta.scene?.tier, venue);
  // the tree this file is written into must build the scene that was baked (else the map is stale the moment it lands)
  const live = liveScene(meta.scene?.tier ?? 'base', meta.params?.gain ?? 2, venue);
  const stale = sceneDiff(meta, live);
  const inputs = inputDigest([...inputsOf(venue), ...TOOL_INPUTS]);
  if (stale.length) {
    console.error(`bake-room: this tree does not build the baked scene:\n  ${stale.join('\n  ')}`);
    if (!force) die('not written (re-bake against this tree, or pass --force to write it anyway)');
  } else console.log(`tree check: this tree builds the baked scene (geometry ${meta.scene.content.geometry}, emitters ${meta.scene.content.emitters}, albedo ${meta.scene.content.albedo})`);
  const png = encodePng(size, size, rgba, { [TEXT_KEY]: JSON.stringify(meta) }, volume ? { [VOLUME_CHUNK]: volume } : null);
  const back = decodePng(png);
  if (Buffer.compare(Buffer.from(back.rgba), Buffer.from(rgba)) !== 0 || back.text[TEXT_KEY] !== JSON.stringify(meta)) die('the written PNG does not read back');
  if (volume && Buffer.compare(Buffer.from(back.extra[VOLUME_CHUNK] ?? []), Buffer.from(volume)) !== 0) die('the light volume in the written PNG does not read back');
  if (!volume) console.warn('WARNING: no light volume in these records (the job that holds row 0 was run with vol=0?): the furniture keeps the analytic light');
  else console.log(`light volume ${meta.volume.dims.join(' x ')} grid points x 6 faces, ${volume.length} bytes raw${volumeStats ? `, ${volumeStats.valid} valid, ${volumeStats.filled} filled from neighbours, ${volumeStats.left} left on the mean, peak ${volumeStats.peak.toFixed(2)}${volumeClipNote(volumeStats, meta)}` : ''}`);
  const digest = sha256(png);
  const run = recs.map((r) => r.bake.run);
  const ua = run[0]?.userAgent ?? 'unknown';
  const browser = (ua.match(/(HeadlessChrome|Chrome)\/[0-9.]+/) ?? [ua])[0];
  const seconds = run.reduce((n, r) => n + (r?.laps?.packed ?? 0), 0) / 1000;
  console.log(`${FILE}  ${size} x ${size} RGBA8  ${png.length} bytes  sha256 ${digest}`);
  console.log(`signature ${meta.sig} (levels ${meta.soft}), full scale ${meta.fullScale}, ambient ${JSON.stringify(meta.ambient)}`);
  console.log(`baked in ${recs.length} job(s), ${seconds.toFixed(1)} s of page time, ${run[0]?.workers} workers, ${browser}; node ${process.version} zlib ${process.versions.zlib}`);
  if (png.length > 1500000) console.warn(`WARNING: ${png.length} bytes is over the 1.5 MB target`);
  if (dry) return;
  fs.writeFileSync(path.join(ASSETS, FILE), png);
  // manifest: this id only
  const manifestPath = path.join(ASSETS, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest[ID] = { file: FILE, bytes: png.length, sha256: digest };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  // credits.json: this file's row, and the totals (sums over the rows)
  const creditsPath = path.join(ASSETS, 'credits.json');
  const credits = JSON.parse(fs.readFileSync(creditsPath, 'utf8'));
  const what = venue === 'arena'
    ? ['the arena hall\'s carpet and backdrop', 'the hall, the rig, the surround, the floor furniture and the table']
    : ['the club room\'s shell', 'the shell, the props, the luminaire and both tables'];
  const processing = `Light map of ${what[0]}: for each texel of the shell's second UV set, the irradiance of every fixed emitter with soft shadows (CPU ray casting against ${what[1]}), bounced light and an occlusion-weighted ambient, and in alpha the visible share of the main lamp. RGB = irradiance / ${meta.fullScale} through the sRGB curve with a 4 x 4 ordered dither; ${size} x ${size} RGBA8 PNG, adaptive row filters, zlib level ${ZLIB_LEVEL}, the bake's record in a tEXt chunk.${volume ? ` The same light on a ${meta.volume.dims.join(' x ')} grid over the room (six receiver directions per grid point, the same encoding) rides in a private ancillary chunk (${VOLUME_CHUNK}, ${volume.length} bytes before zlib): the furniture reads it.` : ''} Deterministic: the same tree gives the same bytes.`;
  const row = {
    file: FILE, id: ID, variant, bytes: png.length, sha256: digest, width: size, height: size, format: 'png',
    colorSpace: 'RGB: irradiance through the sRGB curve; A: linear',
    provider: 'made by this project (baked)', authors: ['OpenBilliards contributors'], licence: 'CC0-1.0',
    inputs: inputsOf(venue).slice(),
    generatedBy: 'web/tools/club/bake-room.html + bake-room-scene.mjs + bake-room-core.mjs + bake-room-worker.mjs (compute), web/tools/club/bake-room.mjs (file)',
    processing,
    bake: {
      signature: meta.sig, levels: meta.soft, fullScale: meta.fullScale, params: meta.params, lamp: meta.lamp, scene: recs[0].bake.meta.scene,
      volume: meta.volume ? { ...meta.volume, bytes: volume.length, stats: volumeStats } : null, ambient: meta.ambient,
      host, browser, userAgent: ua, workers: run[0]?.workers ?? null, jobs: recs.length,
      pageSeconds: +seconds.toFixed(1), node: process.version, zlib: process.versions.zlib,
      // what was baked: content hashes of the scene in the record (see bake-room-scene.mjs), whether the tree the file was
      // written into built that scene, and the digests of the source files at that moment
      content: meta.scene?.content ?? null, treeBuildsBakedScene: stale.length === 0,
      inputFiles: { count: inputs.files, sha256: inputs.sha256, each: inputs.each },
    },
    tileMetres: null,
    // the arena's run-time rule differs (arena/room.js): only the hall's own signature refuses the file; a part or an
    // emitter that moved is reported and the file stays in use. The club's sentence is unchanged.
    notes: `No third-party input: geometry, emitters and albedo hints all come from the code listed under inputs. ${venue === 'arena'
      ? 'At run time the room refuses the file when the hall\'s signature (layout version, the lite or full plan, the hall\'s box, the island, the backdrop, the light-map charts) does not equal the live room, then the analytic light is used; a part (shell, rig, surround, floor furniture) or an emitter that changed since the bake is named in the room\'s state and the file stays in use.'
      : 'At run time the room refuses the file when its signature (shell layout, light-map charts, emitter ids and positions, the props plan) does not equal the live room, then the analytic light is used.'}` + ' The exact test is the tool\'s: `node web/tools/club/bake-room.mjs check` rebuilds the room from the tree and compares content hashes of every blocker triangle, the emitter table and the albedo hints with the record in the file; re-bake when it reports a difference.',
  };
  const at = credits.files.findIndex((f) => f.file === FILE);
  if (at >= 0) credits.files[at] = row; else credits.files.push(row);
  const sum = (pred) => credits.files.filter(pred).reduce((n, f) => n + f.bytes, 0);
  if (Number.isFinite(credits.totalBytes)) credits.totalBytes = sum(() => true);
  if (Number.isFinite(credits.fullTierBytes)) credits.fullTierBytes = sum((f) => f.variant !== 'lite');
  fs.writeFileSync(creditsPath, `${JSON.stringify(credits, null, 2)}\n`);
  // CREDITS.md: this file's section
  const mdPath = path.join(ASSETS, 'CREDITS.md');
  const body = [
    `- shipped: ${size} x ${size} PNG (RGBA8), ${png.length} bytes, sha256 \`${digest}\``,
    '- made by this project: a baked light map, no third-party input; licence: CC0-1.0',
    `- inputs: ${row.inputs.map((x) => `\`${x}\``).join(', ')}`,
    `- tool: ${row.generatedBy}`,
    `- bake: signature \`${meta.sig}\` (levels \`${meta.soft}\`), ${recs.length} job(s), ${seconds.toFixed(1)} s of page time on ${row.bake.workers} workers, host: ${row.bake.host}, browser: ${browser}; file written with node ${process.version} (zlib ${process.versions.zlib})`,
    `- baked against: ${meta.scene?.content ? `scene content hashes: geometry \`${meta.scene.content.geometry}\` (shell \`${meta.scene.content.shell}\`, props \`${meta.scene.content.props}\`, luminaire \`${meta.scene.content.luminaire}\`, table stand-in \`${meta.scene.content.table}\`${meta.scene.content.parts ? Object.entries(meta.scene.content.parts).map(([k, p]) => `, ${k} \`${p.hash}\` (${p.triangles} triangles)`).join('') : ''}), emitters \`${meta.scene.content.emitters}\`, albedo hints \`${meta.scene.content.albedo}\`` : 'no content hashes in the record'}; the tree it was written into ${stale.length ? 'did NOT build that scene (written with --force)' : 'built exactly that scene'}; its ${inputs.files} source files (the inputs above and the bake tool) had the combined sha256 \`${inputs.sha256}\` (per file in credits.json)`,
    `- processing: ${processing}`,
    `- notes: ${row.notes} Alpha is data: the loader decodes the PNG itself (web/scene/club/room/lightmap.js), never through an image element or a 2D canvas.`,
  ].join('\n');
  fs.writeFileSync(mdPath, replaceSection(fs.readFileSync(mdPath, 'utf8'), `### \`${FILE}\` (${ID})`, body));
  if (variant === 'lite') console.log('(the lite tier asks for this id; the base and high tiers never request it)');
  console.log(`wrote ${path.relative(process.cwd(), path.join(ASSETS, FILE))} and its rows in manifest.json, credits.json, CREDITS.md`);
}

// ---- the hall's cube: the file of a record's `env` (bake-room.html `env=1` or `envonly=1`) -------------------------------------
function envOf(file) {
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const bake = rec.eval?.bake ?? rec.eval;
  return bake?.env && typeof bake.env.gz === 'string' && bake.env.record ? { file, bake, env: bake.env } : null;
}
/** Was the cube captured under the light file that is on disk? -> 'current' or the reason it was not. */
function envLight(record, target) {
  const lt = ARENA_TARGETS[target.light], lp = path.join(ASSETS, lt.file);
  if (!fs.existsSync(lp)) return `${lt.file} is not on disk`;
  const lb = fs.readFileSync(lp), lm = JSON.parse(decodePng(lb).text[TEXT_KEY] ?? 'null');
  if (lm?.sig !== record.light?.sig || lm?.soft !== record.light?.soft) return `the hall was lit by another light map (the cube's: signature ${record.light?.sig}, levels ${record.light?.soft}; ${lt.file}: ${lm?.sig}, ${lm?.soft})`;
  if (record.light?.bytes != null && record.light.bytes !== lb.length) return `the hall was lit by another light file (${record.light.bytes} bytes; ${lt.file} has ${lb.length})`;
  if (record.sig !== lm.sig) return `the cube's hall (${record.sig}) is not the light map's (${lm.sig})`;
  return 'current';
}
function writeEnv(file, { host = null, dry = false, force = false } = {}) {
  host = host ?? HOST_DEFAULT;
  if (HOST_BARRED.test(host)) die(`--host "${host}" reads like a machine name or a private tool name: say what kind of machine it was (default: "${HOST_DEFAULT}")`);
  const e = envOf(file);
  if (!e) die(`${file}: no cube in the record (run the page with env=1 or envonly=1)`);
  const { env, bake } = e, record = { ...env.record, host };
  const rgba = new Uint8Array(zlib.gunzipSync(Buffer.from(CORE.fromBase64(env.gz))));
  const sizes = ENV.envSizes(record.n);
  if (rgba.length !== env.width * env.height * 4 || env.width !== 6 * record.n || env.height !== sizes.reduce((a, v) => a + v, 0) || record.levels.length !== sizes.length || record.levels.some((l, k) => l.s !== sizes[k])) die(`${file}: the cube's picture does not fit its record`);
  if (record.v !== ENV.ENV_VERSION || record.enc !== 'rgbe') die(`${file}: cube record version ${record.v}, coding ${record.enc}`);
  const target = record.tier === 'lite' ? ENV_TARGETS.lite : ENV_TARGETS.full;
  const from = envLight(record, target);
  if (from !== 'current') { console.error(`bake-room: ${target.file}: ${from}`); if (!force) die('the cube is not written (capture it under the light file on disk, or pass --force)'); }
  else console.log(`cube check: captured under ${ARENA_TARGETS[target.light].file} as it is on disk (signature ${record.light.sig}, levels ${record.light.soft})`);
  const png = encodePng(env.width, env.height, rgba, { [ENV.ENV_TEXT_KEY]: JSON.stringify(record) });
  const back = decodePng(png);
  if (Buffer.compare(Buffer.from(back.rgba), Buffer.from(rgba)) !== 0 || back.text[ENV.ENV_TEXT_KEY] !== JSON.stringify(record)) die('the written cube does not read back');
  const digest = sha256(png);
  const ua = bake.run?.userAgent ?? 'unknown', browser = (ua.match(/(HeadlessChrome|Chrome)\/[0-9.]+/) ?? [ua])[0];
  console.log(`${target.file}  ${env.width} x ${env.height} RGBA8 (RGBE)  ${png.length} bytes  sha256 ${digest}`);
  console.log(`cube: faces of ${record.n} px, levels ${record.levels.map((l) => `${l.s} px rough ${l.rough}`).join(', ')}; probe ${JSON.stringify(record.probe)} (x, metres over the floor, z); hall signature ${record.sig} (levels ${record.soft})`);
  for (const f of env.stats ?? []) console.log(`  face ${f.face}: mean ${f.mean}, peak ${f.peak}${f.zero ? `, ${f.zero} empty texels` : ''}`);
  const other = record.tier === 'lite' ? ENV_TARGETS.full : ENV_TARGETS.lite, op = path.join(ASSETS, other.file);
  const both = png.length + (fs.existsSync(op) ? fs.statSync(op).size : 0);
  if (both > ENV_CAP) { console.error(`bake-room: the cube's files hold ${both} bytes together, over the ${ENV_CAP} of CONTRACT 19.1`); if (!force) die('the cube is not written (a smaller face: envsize=96)'); }
  if (dry) return;
  fs.writeFileSync(path.join(ASSETS, target.file), png);
  const manifestPath = path.join(ASSETS, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest[target.id] = { file: target.file, bytes: png.length, sha256: digest };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const creditsPath = path.join(ASSETS, 'credits.json');
  const credits = JSON.parse(fs.readFileSync(creditsPath, 'utf8'));
  const processing = `The arena hall as seen from one point (${record.probe[0]}, ${record.probe[1]} m over the floor, ${record.probe[2]}): six 90-degree views of the hall under its baked light map (no balls, no cue, no haze; the table as a matt stand-in), rendered linear without tone mapping at four times the face's size and averaged into faces of ${record.n} px in the GL cube convention. ${record.levels.length} levels, each the cube through a cosine-power lobe for a roughness (${record.levels.map((l) => l.rough).join(', ')}), stacked top to bottom in one ${env.width} x ${env.height} RGBA8 PNG, six faces a row; RGBE (rgb x 2^(A - 136), scene-linear radiance); adaptive row filters, zlib level ${ZLIB_LEVEL}, the record in a tEXt chunk. No cube is rendered at run time.`;
  const row = {
    file: target.file, id: target.id, variant: target.variant, bytes: png.length, sha256: digest, width: env.width, height: env.height, format: 'png',
    colorSpace: 'RGBE: scene-linear radiance, rgb x 2^(A - 136)',
    provider: 'made by this project (baked)', authors: ['OpenBilliards contributors'], licence: 'CC0-1.0',
    inputs: [...inputsOf('arena'), `web/assets/club/${ARENA_TARGETS[target.light].file}`],
    generatedBy: 'web/tools/club/bake-room.html + bake-room-env.mjs (capture, chain, coding), web/tools/club/bake-room.mjs (file)',
    processing,
    bake: { signature: record.sig, levels: record.soft, light: record.light, capturedUnderTheLightFileOnDisk: from === 'current', n: record.n, chain: record.levels, probe: record.probe, box: record.box, unit: record.unit, faces: env.stats ?? null, target: env.type ?? null, hidden: env.hidden ?? null, host, browser, userAgent: ua, node: process.version, zlib: process.versions.zlib },
    tileMetres: null,
    notes: 'No third-party input: a picture of this project\'s own hall. The env service (web/scene/club/env/hall.js) decodes the PNG itself and refuses a cube whose hall signature is not the light map\'s. `node web/tools/club/bake-room.mjs check` reads the record and tells whether the cube was captured under the light file on disk.',
  };
  const at = credits.files.findIndex((f) => f.file === target.file);
  if (at >= 0) credits.files[at] = row; else credits.files.push(row);
  const sum = (pred) => credits.files.filter(pred).reduce((n, f) => n + f.bytes, 0);
  if (Number.isFinite(credits.totalBytes)) credits.totalBytes = sum(() => true);
  if (Number.isFinite(credits.fullTierBytes)) credits.fullTierBytes = sum((f) => f.variant !== 'lite');
  fs.writeFileSync(creditsPath, `${JSON.stringify(credits, null, 2)}\n`);
  const mdPath = path.join(ASSETS, 'CREDITS.md');
  const body = [
    `- shipped: ${env.width} x ${env.height} PNG (RGBA8, RGBE-coded), ${png.length} bytes, sha256 \`${digest}\``,
    '- made by this project: a baked picture of its own hall, no third-party input; licence: CC0-1.0',
    `- inputs: ${row.inputs.map((x) => `\`${x}\``).join(', ')}`,
    `- tool: ${row.generatedBy}`,
    `- capture: hall signature \`${record.sig}\` (levels \`${record.soft}\`), under the light map \`${record.light?.sig}\` / \`${record.light?.soft}\`${from === 'current' ? ' (the file on disk)' : ' (NOT the file on disk: written with --force)'}; host: ${host}, browser: ${browser}; file written with node ${process.version} (zlib ${process.versions.zlib})`,
    `- processing: ${processing}`,
    `- notes: ${row.notes}`,
  ].join('\n');
  fs.writeFileSync(mdPath, replaceSection(fs.readFileSync(mdPath, 'utf8'), `### \`${target.file}\` (${target.id})`, body));
  console.log(`wrote ${path.relative(process.cwd(), path.join(ASSETS, target.file))} and its rows in manifest.json, credits.json, CREDITS.md (the cube's two files: ${both} of ${ENV_CAP} bytes)`);
}

// ---- verify: the same computation, here ----------------------------------------------------------------------------------------
function verify(file) {
  const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dump = rec.eval?.scene, bake = rec.eval?.bake;
  if (!dump?.tris || !bake?.gz) die(`${file}: needs a job run with ?dump=1 and --eval "return { bake: window.__bake, scene: window.__bakeScene }"`);
  const un = (b64, Type) => { const u8 = zlib.gunzipSync(Buffer.from(CORE.fromBase64(b64))); return new Type(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)); };
  const t0 = Date.now();
  const scene = { tris: un(dump.tris, Float32Array), flags: un(dump.flags, Uint8Array), albedo: un(dump.albedo, Float32Array), emitters: un(dump.emitters, Float32Array), lamp: dump.lamp, chartIgnore: Uint8Array.from(dump.chartIgnore) };
  const tex = { count: dump.tex.count, pos: un(dump.tex.pos, Float32Array), nor: un(dump.tex.nor, Float32Array), chart: un(dump.tex.chart, Int16Array), x: un(dump.tex.x, Uint16Array), y: un(dump.tex.y, Uint16Array) };
  const size = dump.size;
  tex.index = new Int32Array(size * size).fill(-1);
  for (let s = 0; s < tex.count; s++) tex.index[tex.y[s] * size + tex.x[s]] = s;
  const bvh = CORE.buildBVH(scene.tris, scene.flags);
  const patchLight = CORE.solvePatches(scene, bvh, { rays: dump.params.patch, bounces: dump.params.bounces });
  const shaded = new Float32Array(tex.count * CORE.TEXEL_STRIDE);
  const MARGIN = 12;
  let from = -1;
  const flush = (to) => { if (from >= 0) { shaded.set(CORE.shadeTexels(scene, bvh, patchLight, tex, from, to, dump.opts), from * CORE.TEXEL_STRIDE); from = -1; } };
  for (let s = 0; s < tex.count; s++) {
    const inBand = tex.y[s] >= dump.rows[0] - MARGIN && tex.y[s] < dump.rows[1] + MARGIN;
    if (inBand && from < 0) from = s;
    if (!inBand) flush(s);
  }
  flush(tex.count);
  const fin = CORE.finish(tex, shaded, size, { fullScale: dump.params.full });
  // the light volume of the same job, when it made one (--novol skips it: it is about as much work as a 256 px map)
  if (dump.grid && typeof bake.volume?.gz === 'string' && !process.argv.includes('--novol')) {
    const n = dump.grid.dims[0] * dump.grid.dims[1] * dump.grid.dims[2];
    const fv = CORE.finishVolume(CORE.shadeVolume(scene, bvh, patchLight, dump.grid, 0, n, dump.opts), dump.grid, { fullScale: dump.params.full });
    const theirsV = zlib.gunzipSync(Buffer.from(CORE.fromBase64(bake.volume.gz)));
    const sameV = Buffer.compare(Buffer.from(fv.rgba), theirsV) === 0;
    console.log(`verify: light volume ${dump.grid.dims.join(' x ')}: here sha256 ${sha256(Buffer.from(fv.rgba)).slice(0, 16)}..., browser ${sha256(theirsV).slice(0, 16)}... ${sameV ? 'identical bytes' : 'DIFFERENT'}`);
    if (!sameV) die('the light volume computed here differs from the browser\'s');
  }
  const mine = Buffer.from(fin.rgba.subarray(dump.rows[0] * size * 4, dump.rows[1] * size * 4));
  const theirs = zlib.gunzipSync(Buffer.from(CORE.fromBase64(bake.gz)));
  let diff = 0, maxDiff = 0;
  for (let i = 0; i < mine.length; i++) if (mine[i] !== theirs[i]) { diff += 1; maxDiff = Math.max(maxDiff, Math.abs(mine[i] - theirs[i])); }
  console.log(`verify: ${size} x ${size}, rows ${dump.rows[0]}..${dump.rows[1]}, ${scene.tris.length / 9} triangles, ${tex.count} texels, ${((Date.now() - t0) / 1000).toFixed(1)} s in node ${process.version}`);
  console.log(`here    sha256 ${sha256(mine)}`);
  console.log(`browser sha256 ${sha256(theirs)}  (${bake.run?.userAgent ?? 'unknown browser'})`);
  if (diff) die(`${diff} of ${mine.length} bytes differ (largest difference ${maxDiff})`);
  console.log('verify: identical bytes');
}

function check() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8'));
  const credits = JSON.parse(fs.readFileSync(path.join(ASSETS, 'credits.json'), 'utf8'));
  let n = 0;
  const targets = [...Object.entries(TARGETS), ...Object.entries(ARENA_TARGETS)];
  for (const [tierName, target] of targets) {
    const { file: FILE, id: ID } = target, venue = target.venue ?? null;
    const p = path.join(ASSETS, FILE);
    if (!fs.existsSync(p)) {
      if (manifest[ID]) die(`${FILE} is in the manifest and not on disk`);
      console.log(`${FILE}: not shipped (${venue === 'arena' ? 'the arena keeps the analytic light on this tier' : tierName === 'lite' ? 'the lite tier keeps the analytic light' : 'no baked light'})`);
      continue;
    }
    n += 1;
    const buf = fs.readFileSync(p);
    const png = decodePng(buf);
    const meta = JSON.parse(png.text[TEXT_KEY] ?? 'null');
    if (!meta?.sig) die(`${FILE}: no bake record in the file`);
    const row = manifest[ID], c = credits.files.find((f) => f.file === FILE);
    const digest = sha256(buf);
    if (!row || row.bytes !== buf.length || row.sha256 !== digest) die(`${FILE}: the manifest row does not match the file`);
    if (!c || c.bytes !== buf.length || c.sha256 !== digest) die(`${FILE}: the credits row does not match the file`);
    let lo = 255, hi = 0, aLo = 255;
    for (let i = 0; i < png.rgba.length; i += 4) { lo = Math.min(lo, png.rgba[i + 1]); hi = Math.max(hi, png.rgba[i + 1]); aLo = Math.min(aLo, png.rgba[i + 3]); }
    console.log(`${FILE}: ${png.width} x ${png.height}, ${buf.length} bytes, sha256 ${digest}`);
    console.log(`  record: version ${meta.v}, tier ${meta.scene?.tier}, signature ${meta.sig}, levels ${meta.soft}, full scale ${meta.fullScale}, ambient ${JSON.stringify(meta.ambient)}`);
    console.log(`  green ${lo}..${hi}, lowest alpha ${aLo}; manifest and credits rows match`);
    const vol = png.extra[VOLUME_CHUNK];
    if (meta.volume) {
      if (!vol || vol.length !== meta.volume.dims[0] * meta.volume.dims[1] * meta.volume.dims[2] * 6 * 4) die(`${FILE}: the record names a light volume that is not in the file (or has another size)`);
      console.log(`  light volume: ${meta.volume.dims.join(' x ')} grid points x 6 faces, ${vol.length} bytes, box ${JSON.stringify(meta.volume.min)}..${JSON.stringify(meta.volume.max)} (heights above the floor)`);
    } else console.log('  light volume: none in this file (the furniture keeps the analytic light)');
    // is the map still the map of this tree? The exact test: build the room here and compare content hashes with the record.
    if ((meta.scene?.venue === 'arena') !== (venue === 'arena')) die(`${FILE}: the record in the file was baked for another venue`);
    const stale = sceneDiff(meta, liveScene(meta.scene?.tier ?? 'base', meta.params?.gain ?? 2, venue));
    const now = inputDigest([...inputsOf(venue), ...TOOL_INPUTS]), then = c.bake?.inputFiles ?? null;
    const moved = then ? Object.keys({ ...then.each, ...now.each }).filter((f) => then.each[f] !== now.each[f]) : null;
    if (moved) console.log(moved.length ? `  source files changed since the file was written: ${moved.join(', ')}` : `  source files: all ${now.files} as they were when the file was written (${now.sha256.slice(0, 16)}...)`);
    if (stale.length) die(`STALE: ${FILE}: this tree does not build the baked scene:\n  ${stale.join('\n  ')}\n  re-bake (web/tools/club/bake-room.html?${target.bake} on the host, then bake-room.mjs write)`);
    console.log(`  current: this tree builds exactly the baked scene (geometry ${meta.scene.content.geometry}, emitters ${meta.scene.content.emitters}, albedo ${meta.scene.content.albedo})`);
  }
  // the hall's cube (CONTRACT 19.1): its record, its rows, and whether it was captured under the light file on disk
  for (const target of Object.values(ENV_TARGETS)) {
    const p = path.join(ASSETS, target.file);
    if (!fs.existsSync(p)) {
      if (manifest[target.id]) die(`${target.file} is in the manifest and not on disk`);
      console.log(`${target.file}: not shipped (the env service keeps its stand-in on this tier)`);
      continue;
    }
    const buf = fs.readFileSync(p), png = decodePng(buf), record = JSON.parse(png.text[ENV.ENV_TEXT_KEY] ?? 'null');
    if (!record?.sig || !Array.isArray(record.levels)) die(`${target.file}: no cube record in the file`);
    const row = manifest[target.id], c = credits.files.find((f) => f.file === target.file), digest = sha256(buf);
    if (!row || row.bytes !== buf.length || row.sha256 !== digest) die(`${target.file}: the manifest row does not match the file`);
    if (!c || c.bytes !== buf.length || c.sha256 !== digest) die(`${target.file}: the credits row does not match the file`);
    const sizes = ENV.envSizes(record.n);
    if (png.width !== 6 * record.n || png.height !== sizes.reduce((a, v) => a + v, 0) || record.levels.length !== sizes.length) die(`${target.file}: the picture does not fit its record`);
    console.log(`${target.file}: ${png.width} x ${png.height}, ${buf.length} bytes, sha256 ${digest}`);
    console.log(`  record: version ${record.v}, tier ${record.tier}, faces of ${record.n} px, ${record.levels.length} levels (rough ${record.levels.map((l) => l.rough).join(', ')}), probe ${JSON.stringify(record.probe)}, hall signature ${record.sig}, levels ${record.soft}; manifest and credits rows match`);
    const from = envLight(record, target);
    if (from !== 'current') die(`STALE: ${target.file}: ${from}\n  capture it again (web/tools/club/bake-room.html?${target.bake} on the host, then bake-room.mjs write)`);
    console.log(`  current: captured under ${ARENA_TARGETS[target.light].file} as it is on disk (signature ${record.light.sig}, levels ${record.light.soft})`);
    n += 1;
  }
  if (!n) die('no baked file is shipped');
}

function selftest() {
  let n = 0;
  const ok = (name, cond) => { if (!cond) die(`selftest FAILED: ${name}`); n += 1; console.log(`OK ${name}`); };
  // deterministic math
  let worst = 0;
  for (let i = -200; i <= 200; i++) { const x = i * 0.0314; worst = Math.max(worst, Math.abs(CORE.dsin(x) - Math.sin(x)), Math.abs(CORE.dcos(x) - Math.cos(x))); }
  ok(`sine / cosine within 1e-12 of the library (${worst.toExponential(1)})`, worst < 1e-12);
  // base64
  const bytes = Uint8Array.from({ length: 1001 }, (_, i) => (i * 37 + 11) & 255);
  ok('base64 round trip', Buffer.compare(Buffer.from(CORE.fromBase64(CORE.toBase64(bytes))), Buffer.from(bytes)) === 0 && CORE.toBase64(bytes) === Buffer.from(bytes).toString('base64'));
  // PNG
  const px = Uint8Array.from({ length: 16 * 16 * 4 }, (_, i) => (i * 73 + (i >> 3)) & 255);
  const png = encodePng(16, 16, px, { [TEXT_KEY]: '{"v":1}' });
  const back = decodePng(png);
  ok('PNG round trip with a text chunk', Buffer.compare(Buffer.from(back.rgba), Buffer.from(px)) === 0 && back.text[TEXT_KEY] === '{"v":1}');
  // BVH against brute force: a deterministic soup of triangles, random rays
  let seed = 12345;
  const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  const T = 400;
  const tris = new Float32Array(T * 9);
  for (let t = 0; t < T; t++) { const c = [rnd() * 4 - 2, rnd() * 4 - 2, rnd() * 4 - 2]; for (let v = 0; v < 3; v++) for (let a = 0; a < 3; a++) tris[9 * t + 3 * v + a] = c[a] + rnd() * 0.6 - 0.3; }
  const flags = Uint8Array.from({ length: T }, (_, t) => (t % 7 === 0 ? 1 : 0));
  const bvh = CORE.buildBVH(tris, flags);
  const brute = (o, d, tmax, ignore) => {
    let best = tmax, tri = -1;
    for (let t = 0; t < T; t++) {
      if (flags[t] & ignore) continue;
      // edges rounded to single precision, as the BVH stores them
      const p = 9 * t, f = Math.fround;
      const e1 = [f(tris[p + 3] - tris[p]), f(tris[p + 4] - tris[p + 1]), f(tris[p + 5] - tris[p + 2])], e2 = [f(tris[p + 6] - tris[p]), f(tris[p + 7] - tris[p + 1]), f(tris[p + 8] - tris[p + 2])];
      const pv = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
      const det = e1[0] * pv[0] + e1[1] * pv[1] + e1[2] * pv[2];
      if (det > -1e-12 && det < 1e-12) continue;
      const inv = 1 / det, s = [o[0] - tris[p], o[1] - tris[p + 1], o[2] - tris[p + 2]];
      const u = (s[0] * pv[0] + s[1] * pv[1] + s[2] * pv[2]) * inv;
      if (u < 0 || u > 1) continue;
      const qv = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
      const v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) * inv;
      if (v < 0 || u + v > 1) continue;
      const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * inv;
      if (tt > 1e-6 && tt < best) { best = tt; tri = t; }
    }
    return { t: best, tri };
  };
  let bad = 0;
  for (let k = 0; k < 3000; k++) {
    const o = [rnd() * 6 - 3, rnd() * 6 - 3, rnd() * 6 - 3];
    let d = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1];
    const l = Math.hypot(...d) || 1; d = d.map((x) => x / l);
    const ignore = k % 3 === 0 ? 1 : 0, tmax = k % 5 === 0 ? 1.5 : 1e9;
    const want = brute(o, d, tmax, ignore);
    const got = CORE.nearest(bvh, o[0], o[1], o[2], d[0], d[1], d[2], tmax, ignore);
    if (got !== want.tri || (got >= 0 && Math.abs(CORE.HIT.t - want.t) > 1e-9)) bad += 1;
    if (CORE.occluded(bvh, o[0], o[1], o[2], d[0], d[1], d[2], tmax, ignore) !== (want.tri >= 0)) bad += 1;
  }
  ok('BVH nearest hit and any hit equal brute force on 3000 rays', bad === 0);
  // tessellation keeps the area; what is left with an edge over 0.3 m is smaller than a full patch (0.045 m2)
  const one = Float32Array.from([0, 0, 0, 4, 0, 0, 0, 3, 0, 0, 0, 5, 9, 0, 5, 9, 0.01, 5]);
  const te = CORE.tessellate(one, Uint8Array.from([5, 5]), Float32Array.from([0.1, 0.2, 0.3, 0.1, 0.2, 0.3]), 0.3);
  let area = 0, longest = 0, bigLong = 0, sliver = 0;
  for (let t = 0; t < te.tris.length / 9; t++) {
    const p = 9 * t, a = [te.tris[p + 3] - te.tris[p], te.tris[p + 4] - te.tris[p + 1]], b = [te.tris[p + 6] - te.tris[p], te.tris[p + 7] - te.tris[p + 1]];
    const ar = Math.abs(a[0] * b[1] - a[1] * b[0]) / 2;
    let edge = 0;
    for (const [i, j] of [[0, 3], [3, 6], [6, 0]]) edge = Math.max(edge, Math.hypot(te.tris[p + i] - te.tris[p + j], te.tris[p + i + 1] - te.tris[p + j + 1], te.tris[p + i + 2] - te.tris[p + j + 2]));
    if (te.tris[p + 2] === 5) { sliver += 1; continue; }
    area += ar; longest = Math.max(longest, edge);
    if (edge > 0.3 + 1e-6 && ar > 0.045 + 1e-6) bigLong += 1;
  }
  ok(`tessellation: area kept (${area.toFixed(6)}), no full patch with an edge over 0.3 m (longest ${longest.toFixed(3)}), a 9 m sliver stays ${sliver} triangle(s)`, Math.abs(area - 6) < 1e-4 && bigLong === 0 && longest < 0.6 && sliver <= 2 && te.flags.every((f) => f === 5));
  // a closed form: a point light over a floor, half hidden by a wall -> the lit side equals the shader's formula, the far side is 0
  {
    const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
    const sceneTris = Float32Array.from([...quad([-5, 0, -5], [-5, 0, 5], [5, 0, 5], [5, 0, -5]), ...quad([0, 0, -5], [0, 0, 5], [0, 3, 5], [0, 3, -5])]);
    const E = new Float32Array(CORE.EM_STRIDE);
    E.set([-2, 1, 0, 8, 3, 3, 3, 0, 0, 0, 0, 0.1, 0, 1, 0, 0, 0.05, 0.08]);
    const scene = { tris: sceneTris, flags: new Uint8Array(4), albedo: new Float32Array(12).fill(0.5), emitters: E, lamp: null, chartIgnore: Uint8Array.from([0]) };
    const b2 = CORE.buildBVH(scene.tris, scene.flags);
    const tex = { count: 2, pos: Float32Array.from([-2, 0, 1, 2, 0, 1]), nor: Float32Array.from([0, 1, 0, 0, 1, 0]), chart: Int16Array.from([0, 0]), x: Uint16Array.from([0, 1]), y: Uint16Array.from([0, 0]) };
    const out = CORE.shadeTexels(scene, b2, new Float32Array(12), tex, 0, 2, { gatherRays: 8 });
    const d2 = 1 + 1, w = (1 - (d2 / 64) ** 2) ** 2, expect = (3 * w * (1 / Math.sqrt(d2))) / (d2 + 0.01);
    ok(`direct light: lit side ${out[0].toFixed(5)} = closed form ${expect.toFixed(5)}, behind the wall ${out[CORE.TEXEL_STRIDE]}`, Math.abs(out[0] - expect) < 1e-5 && out[CORE.TEXEL_STRIDE] === 0);
  }
  // the light volume: one grid point over the lit side: its up face holds the closed form, its down face nothing; a point
  // inside a closed box is invalid and takes its neighbour's light; the bytes ride a private chunk through the PNG
  {
    const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
    const box = (x0, x1, y0, y1, z0, z1) => [ // outward faces
      ...quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]), ...quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]),
      ...quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]), ...quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]),
      ...quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]), ...quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0])];
    const tris = Float32Array.from([...quad([-5, 0, -5], [-5, 0, 5], [5, 0, 5], [5, 0, -5]), ...box(-1.4, -0.6, 0.1, 0.9, 0.6, 1.4)]);
    const E = new Float32Array(CORE.EM_STRIDE);
    E.set([-2, 1, 0, 8, 3, 3, 3, 0, 0, 0, 0, 0.1, 0, 1, 0, 0, 0.05, 0.08]);
    const T = tris.length / 9;
    const scene = { tris, flags: new Uint8Array(T), albedo: new Float32Array(3 * T).fill(0.5), emitters: E, lamp: null, chartIgnore: Uint8Array.from([0]) };
    const bvh = CORE.buildBVH(scene.tris, scene.flags);
    const grid = { dims: [2, 1, 1], min: [-2.5, 0, 0.5], max: [-0.5, 1, 1.5] }; // points at (-2, 0.5, 1) and (-1, 0.5, 1): the second inside the box
    const sh = CORE.shadeVolume(scene, bvh, new Float32Array(3 * T), grid, 0, 2, { gatherRays: 8, volumePhases: 2 });
    const d2 = 0.25 + 1, w = (1 - (d2 / 64) ** 2) ** 2, expect = (3 * w * (0.5 / Math.sqrt(d2))) / (d2 + 0.01);
    const fv = CORE.finishVolume(sh, grid, { fullScale: 16 });
    ok(`light volume: up face ${sh[8].toFixed(5)} = closed form ${expect.toFixed(5)}, down face ${sh[12]}, the point inside the box is invalid and filled (${fv.stats.valid} valid, ${fv.stats.filled} filled)`,
      Math.abs(sh[8] - expect) < 1e-5 && sh[12] === 0 && sh[24] === 1 && sh[CORE.VOLUME_STRIDE + 24] === 0 && fv.stats.valid === 1 && fv.stats.filled === 1 && fv.rgba[4 * (0 + 2 * 2)] === fv.rgba[4 * (1 + 2 * 2)] && fv.rgba[4 * (0 + 2 * 2)] > 0);
    const png2 = encodePng(4, 4, new Uint8Array(64).fill(7), { [TEXT_KEY]: '{}' }, { [VOLUME_CHUNK]: fv.rgba });
    const back2 = decodePng(png2);
    ok('light volume: the private chunk reads back byte for byte', Buffer.compare(Buffer.from(back2.extra[VOLUME_CHUNK]), Buffer.from(fv.rgba)) === 0 && back2.rgba[0] === 7);
  }
  console.log(`bake-room selftest: ${n} checks passed`);
}

// ---- main -----------------------------------------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? (argv[i + 1] ?? true) : null; };
const files = argv.slice(1).filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--host');
if (cmd === 'write') {
  if (!files.length) die('write: name at least one record file');
  const opts = { host: typeof flag('--host') === 'string' ? flag('--host') : null, dry: argv.includes('--dry'), force: argv.includes('--force') };
  // (a record of `envonly=1` holds the hall's cube and no light map; a record of `env=1` holds both: the map first)
  const maps = files.filter((f) => { const r = JSON.parse(fs.readFileSync(f, 'utf8')); return (r.eval?.bake ?? r.eval)?.envOnly !== true; });
  if (maps.length) write(maps, opts);
  for (const f of files) if (envOf(f)) writeEnv(f, opts);
}
else if (cmd === 'verify') { if (files.length !== 1) die('verify: name one record file'); verify(files[0]); }
else if (cmd === 'check') check();
else if (cmd === 'selftest') selftest();
else { console.log('usage: bake-room.mjs write <record.json>... [--host "<text>"] [--dry] [--force] | verify <record.json> | check | selftest'); process.exit(cmd ? 2 : 0); }
