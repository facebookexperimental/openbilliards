#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-assets.mjs — node arm for the club look's shipped assets (web/assets/club). Independent of the build tool
// (asset-build.mjs): it reads only the directory, manifest.json and credits.json, with no packages.
//
// THE ASSERTION. The arm is red when:
//   MANIFEST   manifest.json is not { "<id>": { "file", "lite"?, "high"?, "bytes", "sha256" } } (the schema club/assets.js
//              reads); `high` is { "file": "high/<name>.jpg", "bytes", "sha256" }: the high tier's file (CONTRACT.md 14.2)
//   MISSING    a file the manifest names is not in the directory
//   DIGEST     a full-size file's bytes or sha256 differ from its manifest row, or any file's from its credits row
//   CREDIT     a shipped file has no credits row, or the row lacks a source URL, an author, a licence, a date, the sha256
//              of the original or the sha256 of the shipped file (a derived file names its inputs and its tool instead)
//   LICENCE    a licence other than CC0 / public domain
//   SIZE       a side over 2048 px (1024 px for a lite variant), or a file whose header cannot be read (JPEG, PNG, WebP);
//              in the high pack: a side over 4096 px for an id named hero (HERO_IDS) and over 2048 px for any other
//   ORPHAN     a file in the directory that the manifest does not name, or a credits row for a file that is not shipped
//   BUDGET     the default tier (everything outside high/) holds more than 12 000 000 bytes (sound files would count: the
//              cap covers every shipped byte), or the high pack (high/) holds more than 26 000 000 bytes
//   HIGH       a file under high/ that is not a JPEG by name and by header (.jpg is outside the service worker's precache
//              extension list, web/tools/gen-sw-precache.mjs; a PNG or WebP there would be precached for every player)
//   LOADER     club/assets.js could ask for a high/ path on a tier other than `high`: its source reads a row's `high`
//              member outside the one guarded function, or a stub-fetch run of the real loader over the real manifest
//              requests a high/ path on lite or base (or does not request the high files on high)
//   SOUND      a sound file in the directory (round 4 ruling: every sound of the look is synthesised in code and the lane
//              ships none; a CC0 sound file needs a new ruling, an asset id and a credits row before this arm lets it in)
// Read-only. Usage:
//   node web/tools/club/test-club-assets.mjs [--dir <assets dir>]   exit 0 = green, 1 = red (each failure printed)
//   node web/tools/club/test-club-assets.mjs --selftest             plants each failure on a copy and requires its code
//   node web/tools/club/test-club-assets.mjs --table [--dir <dir>]  the licence table as Markdown on stdout: one row per asset
//                                                                   id from manifest.json and credits.json (id, file, source
//                                                                   URL, author, licence, date, sha256, bytes), then the
//                                                                   content this project made itself (OWN_WORK below). Exit 1
//                                                                   and no table when the directory is not green: a table is
//                                                                   only printed from files this arm has just verified.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(HERE, '..', '..', 'assets', 'club');
export const MAX_SIDE = 2048;
export const MAX_LITE_SIDE = 1024;
export const MAX_TOTAL_BYTES = 12_000_000;
export const MAX_HIGH_BYTES = 26_000_000; // the high tier's pack, counted apart (round A2)
export const MAX_HIGH_SIDE = 2048;
export const MAX_HERO_SIDE = 4096;
/** The ids whose high-tier file may be 4096 px (the hero textures). Every other high-tier file is 2048 px at most. */
export const HERO_IDS = Object.freeze(new Set(['arena.carpet.color', 'arena.carpet.normal', 'arena.carpet.rough']));
const HIGH_DIR = 'high';
const HIGH_NAME = /^high\/[A-Za-z0-9][A-Za-z0-9._-]*\.jpe?g$/;
const isHigh = (name) => name.startsWith(`${HIGH_DIR}/`);
const META = new Set(['manifest.json', 'credits.json', 'CREDITS.md']);
const SOUND_FILE = /\.(?:wav|wave|mp3|ogg|oga|opus|m4a|aac|flac|aif|aiff|caf|weba|webm|mid|midi|sf2)$/i;
const LICENCES = new Set(['cc0', 'cc0-1.0', 'cc0 1.0', 'cc0 1.0 universal', 'public domain', 'public-domain', 'pd']);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const filled = (v) => (Array.isArray(v) ? v.length > 0 && v.every((x) => typeof x === 'string' && x.trim()) : typeof v === 'string' && v.trim().length > 0);

/** { format, width, height } read from a JPEG, PNG or WebP header, or null. */
export function imageSize(buf) {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a && buf.toString('latin1', 12, 16) === 'IHDR') {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const m = buf[i + 1];
      if (m === 0xff) { i += 1; continue; } // fill byte
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; } // markers without a length
      const len = buf.readUInt16BE(i + 2);
      // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { format: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  if (buf.length >= 30 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    const kind = buf.toString('latin1', 12, 16);
    if (kind === 'VP8X') return { format: 'webp', width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { format: 'webp', width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { format: 'webp', width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) }; }
  }
  return null;
}

/**
 * tree = Map<name, Buffer> of the directory: plain names for the default tier, `high/<name>` for the high tier's pack.
 * Returns { failures: [{ code, where, msg }], counts }.
 */
export function judge(tree, { maxTotalBytes = MAX_TOTAL_BYTES, maxHighBytes = MAX_HIGH_BYTES } = {}) {
  const failures = [];
  const fail = (code, where, msg) => failures.push({ code, where, msg });
  const json = (name) => {
    if (!tree.has(name)) { fail('MANIFEST', name, 'missing'); return null; }
    try { return JSON.parse(tree.get(name).toString('utf8')); } catch (e) { fail('MANIFEST', name, `not JSON: ${e.message}`); return null; }
  };
  const manifest = json('manifest.json');
  const shipped = [...tree.keys()].filter((n) => !META.has(n)).sort();
  // the default tier is everything outside high/ (the three metadata files included, as before); the high pack is apart
  const total = [...tree].reduce((n, [name, b]) => n + (isHigh(name) ? 0 : b.length), 0);
  const highTotal = [...tree].reduce((n, [name, b]) => n + (isHigh(name) ? b.length : 0), 0);
  const counts = { ids: 0, files: shipped.length, bytes: total, maxSide: 0, credited: 0, derived: 0, highFiles: shipped.filter(isHigh).length, highCredited: 0, highBytes: highTotal, highMaxSide: 0, highGpuBytes: 0 };
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    if (manifest) fail('MANIFEST', 'manifest.json', 'not an object of rows');
    return { failures, counts };
  }
  // credits.json is required as soon as one file ships
  let credits = null;
  if (shipped.length || tree.has('credits.json')) credits = json('credits.json');
  const rows = new Map(); // file -> credits row
  if (credits) {
    if (!Array.isArray(credits.files)) fail('CREDIT', 'credits.json', 'no "files" array');
    else for (const c of credits.files) {
      if (!c || typeof c.file !== 'string') { fail('CREDIT', 'credits.json', 'a row without a file name'); continue; }
      if (rows.has(c.file)) fail('CREDIT', c.file, 'two credits rows');
      if (isHigh(c.file)) fail('CREDIT', c.file, 'a high-tier file is credited under "highFiles", not "files"');
      rows.set(c.file, c);
    }
    // the high tier's pack has its own list (the totals of "files" stay the default tier's)
    if (credits.highFiles !== undefined && !Array.isArray(credits.highFiles)) fail('CREDIT', 'credits.json', '"highFiles" is not an array');
    else for (const c of credits.highFiles ?? []) {
      if (!c || typeof c.file !== 'string') { fail('CREDIT', 'credits.json', 'a high-tier row without a file name'); continue; }
      if (rows.has(c.file)) fail('CREDIT', c.file, 'two credits rows');
      if (!isHigh(c.file)) fail('CREDIT', c.file, 'a row of "highFiles" names a file outside high/');
      rows.set(c.file, c);
    }
  }
  const named = new Map(); // file -> { id, lite, high }
  const claimed = new Set(); // files a malformed row points at: the row is the failure, the file is not an orphan on top of it
  const claim = (row) => {
    for (const v of [row?.file, row?.lite]) if (typeof v === 'string') claimed.add(path.basename(v));
    if (typeof row?.high?.file === 'string') claimed.add(`${HIGH_DIR}/${path.basename(row.high.file)}`);
  };
  const ROW_KEYS = new Set(['bytes,file,sha256', 'bytes,file,lite,sha256', 'bytes,file,high,sha256', 'bytes,file,high,lite,sha256']);
  for (const [id, row] of Object.entries(manifest)) {
    counts.ids += 1;
    const keys = row && typeof row === 'object' ? Object.keys(row).sort().join(',') : '';
    if (!ROW_KEYS.has(keys)) { claim(row); fail('MANIFEST', id, `row keys are [${keys}], want file, lite?, high?, bytes, sha256`); continue; }
    if (row.high !== undefined) {
      const h = row.high;
      const hk = h && typeof h === 'object' && !Array.isArray(h) ? Object.keys(h).sort().join(',') : '';
      if (hk !== 'bytes,file,sha256' || typeof h.file !== 'string' || !HIGH_NAME.test(h.file) || !Number.isInteger(h.bytes) || h.bytes <= 0 || !/^[0-9a-f]{64}$/.test(String(h.sha256))) {
        claim(row); fail('MANIFEST', id, 'high is { file: "high/<plain name>.jpg", bytes: a positive integer, sha256: 64 hex digits }'); continue;
      }
    }
    if (typeof row.file !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(row.file) || (row.lite !== undefined && (typeof row.lite !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(row.lite)))) {
      claim(row); fail('MANIFEST', id, 'file names are plain names inside the directory'); continue;
    }
    if (!Number.isInteger(row.bytes) || row.bytes <= 0 || !/^[0-9a-f]{64}$/.test(String(row.sha256))) { claim(row); fail('MANIFEST', id, 'bytes is a positive integer and sha256 is 64 hex digits'); continue; }
    for (const [name, lite] of [[row.file, false], ...(row.lite ? [[row.lite, true]] : [])]) {
      if (META.has(name)) { fail('MANIFEST', id, `${name} is a metadata file`); continue; }
      if (named.has(name)) fail('MANIFEST', id, `${name} is also the file of ${named.get(name).id}`);
      named.set(name, { id, lite });
      const buf = tree.get(name);
      if (!buf) { fail('MISSING', name, `named by ${id}, not in the directory`); continue; }
      if (!lite && (buf.length !== row.bytes || sha256(buf) !== row.sha256)) fail('DIGEST', name, `bytes or sha256 differ from the manifest row of ${id}`);
    }
    if (row.high) {
      const name = row.high.file;
      if (named.has(name)) fail('MANIFEST', id, `${name} is also the file of ${named.get(name).id}`);
      named.set(name, { id, lite: false, high: true });
      const buf = tree.get(name);
      if (!buf) fail('MISSING', name, `named by ${id} (high tier), not in the directory`);
      else if (buf.length !== row.high.bytes || sha256(buf) !== row.high.sha256) fail('DIGEST', name, `bytes or sha256 differ from the manifest's high member of ${id}`);
    }
  }
  for (const name of shipped) {
    const buf = tree.get(name);
    const use = named.get(name);
    // round 4: no sound file ships (its bytes still count in the budget below); nothing else is judged on it
    if (SOUND_FILE.test(name)) { fail('SOUND', name, 'a sound file: the look\'s sounds are synthesised in code (web/scene/club/audio.js); the lane ships no sound file'); continue; }
    if (!use && !claimed.has(name)) fail('ORPHAN', name, 'in the directory, not named by the manifest');
    const size = imageSize(buf);
    if (isHigh(name)) {
      // the high pack: JPEG only, by name and by header (the precache rule), 4096 px for a hero id, 2048 px otherwise
      if (!HIGH_NAME.test(name) || size?.format !== 'jpeg') fail('HIGH', name, 'a file under high/ is a JPEG named .jpg (PNG, WebP and the other precached extensions never go there)');
      if (size) {
        counts.highMaxSide = Math.max(counts.highMaxSide, size.width, size.height);
        counts.highGpuBytes += Math.round(size.width * size.height * 4 * 4 / 3); // RGBA8 with a full mip chain
        const cap = use && HERO_IDS.has(use.id) ? MAX_HERO_SIDE : MAX_HIGH_SIDE;
        if (size.width > cap || size.height > cap || size.width < 1 || size.height < 1) fail('SIZE', name, `${size.width} x ${size.height} exceeds ${cap} px (${use && HERO_IDS.has(use.id) ? 'a hero id' : 'not a hero id'})`);
      }
    } else if (!size) fail('SIZE', name, 'not a JPEG, PNG or WebP header this arm can read');
    else {
      counts.maxSide = Math.max(counts.maxSide, size.width, size.height);
      const cap = use?.lite ? MAX_LITE_SIDE : MAX_SIDE;
      if (size.width > cap || size.height > cap || size.width < 1 || size.height < 1) fail('SIZE', name, `${size.width} x ${size.height} exceeds ${cap} px`);
    }
    const c = rows.get(name);
    if (!c) { fail('CREDIT', name, 'no credits row'); continue; }
    if (isHigh(name)) counts.highCredited += 1; else counts.credited += 1;
    if (c.bytes !== buf.length || c.sha256 !== sha256(buf)) fail('DIGEST', name, 'bytes or sha256 differ from the credits row');
    if (use && c.id !== undefined && c.id !== use.id) fail('CREDIT', name, `the credits row names id ${c.id}, the manifest ${use.id}`);
    if (!filled(c.licence) || !LICENCES.has(String(c.licence).trim().toLowerCase())) fail('LICENCE', name, `licence ${JSON.stringify(c.licence)} is not CC0 or public domain`);
    const derived = Array.isArray(c.inputs);
    if (derived) {
      // a file made by a lane tool (a baked lightmap, a LUT): its inputs and the tool, each input credited itself or a repo path
      counts.derived += 1;
      if (!c.inputs.length || !c.inputs.every((x) => typeof x === 'string' && x.trim())) fail('CREDIT', name, 'a derived file lists its inputs');
      for (const k of ['generatedBy', 'processing']) if (!filled(c[k])) fail('CREDIT', name, `a derived file states ${k}`);
    } else {
      if (!filled(c.sourceUrl) || !/^https:\/\/[^\s/]+\/\S+$/.test(c.sourceUrl)) fail('CREDIT', name, 'no https source URL');
      if (!filled(c.authors) && !filled(c.author)) fail('CREDIT', name, 'no author');
      const date = c.downloaded ?? c.date;
      if (!filled(date) || Number.isNaN(Date.parse(date))) fail('CREDIT', name, 'no download date');
      if (!/^[0-9a-f]{64}$/.test(String(c.originalSha256))) fail('CREDIT', name, 'no sha256 of the original');
    }
  }
  for (const name of rows.keys()) if (!tree.has(name) || META.has(name)) fail('ORPHAN', name, 'a credits row for a file that is not shipped');
  if (credits && Number.isFinite(credits.totalBytes)) {
    const sum = shipped.reduce((n, f) => n + (isHigh(f) ? 0 : tree.get(f).length), 0);
    if (credits.totalBytes !== sum) fail('DIGEST', 'credits.json', `totalBytes ${credits.totalBytes} != ${sum} shipped`);
  }
  if (credits && Number.isFinite(credits.highTotalBytes) && credits.highTotalBytes !== highTotal) fail('DIGEST', 'credits.json', `highTotalBytes ${credits.highTotalBytes} != ${highTotal} shipped under high/`);
  if (total > maxTotalBytes) fail('BUDGET', 'web/assets/club', `${total} bytes > ${maxTotalBytes}`);
  if (highTotal > maxHighBytes) fail('BUDGET', 'web/assets/club/high', `${highTotal} bytes > ${maxHighBytes}`);
  return { failures, counts };
}

/**
 * Content of the club look that is this project's own work and is NOT a downloaded file: drawn or computed by the code named,
 * at run time or by a lane tool. Listed in the licence table after the asset rows (the baked light map is a shipped file and
 * has its own row above, from credits.json). A new texture made in code gets a row here; the self-test checks that every
 * source file named exists.
 */
export const OWN_WORK = Object.freeze([
  { what: 'props atlas (swatches, glows, bottle palette, framed pictures, chalkboard, clock, plaque, the two lit signs)', how: 'drawn in code at run time on one canvas (2048 x 1024; 1024 x 512 on the lite tier); generic content only: geometric patterns, a table diagram, plain game words; no photograph, logo or label', source: 'web/scene/club/room/props/atlas.js' },
  { what: 'stroke font of the signs and the chalkboard', how: 'single-stroke glyph tables written for this project; no font file, no device font', source: 'web/scene/club/room/props/strokefont.js' },
  { what: 'grade LUT (3D table, log2-indexed gain)', how: 'computed in code from the analytic grade; no file', source: 'web/scene/club/post/gradelut.js' },
  { what: 'luminaire face and glass textures', how: 'drawn in code at run time (two small canvases)', source: 'web/scene/club/room/lamp.js' },
  { what: 'room shell stand-ins (planks, panelling, plaster) and small detail maps (night window, lamp shade, door glass, blind slats)', how: 'drawn in code at run time from seeded noise; the stand-ins show until the downloaded maps load', source: 'web/scene/club/room/tex.js' },
  { what: 'cloth weave stand-in (a normal table)', how: 'computed in code; the weave itself is the downloaded `felt.normal` above', source: 'web/scene/club/mat/cloth/weave.js' },
  { what: 'rail wood stand-in', how: 'drawn in code at run time; the veneer strips on the rails are crops of the downloaded `veneer.color` / `veneer.normal` above', source: 'web/scene/club/mat/wood.js' },
  // round 4 (sound and motion): nothing here is a file
  { what: 'room tone, the sparse far sounds of the room and the chalking sound', how: 'synthesised in code at run time from seeded noise and oscillators; no sound file, no recording, no voice or speech', source: 'web/scene/club/audio/render.js' },
  { what: 'chalk dust at the cue tip', how: 'closed-form particles computed in code from the shot record and the playback time; no texture file', source: 'web/scene/club/motion/dust.js' },
  { what: 'marks on the cloth (chalk speck, burn track, landing dot)', how: 'computed in code from the shot record and the playback time (a small table of numbers, no image)', source: 'web/scene/club/motion/marks.js' },
  { what: 'occlusion atlases (table and floor visibility)', how: 'baked on the GPU at load from the table\'s own geometry; no file', source: 'web/scene/club/occ/baker.js' },
]);

/**
 * The licence table as Markdown lines (no I/O). One row per (asset id, shipped file) in manifest order, full-size file first,
 * built from the manifest row and the file's credits row; then one row per OWN_WORK entry. `tree` as for judge().
 */
export function licenceTable(tree) {
  const manifest = JSON.parse(tree.get('manifest.json').toString('utf8'));
  const credits = JSON.parse(tree.get('credits.json').toString('utf8'));
  const rows = new Map([...(credits.files ?? []), ...(credits.highFiles ?? [])].map((c) => [c.file, c]));
  const cell = (v) => String(v ?? '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim() || '-';
  const day = (c) => { const d = c.downloaded ?? c.date ?? c.generated ?? c.baked ?? null; return typeof d === 'string' && !Number.isNaN(Date.parse(d)) ? new Date(d).toISOString().slice(0, 10) : '-'; };
  const out = [];
  out.push('| asset id | file | source URL | author | licence | date | sha256 of the shipped file | bytes |');
  out.push('|---|---|---|---|---|---|---|---:|');
  let files = 0, bytes = 0;
  for (const [id, row] of Object.entries(manifest)) {
    for (const name of [row.file, ...(row.lite ? [row.lite] : []), ...(row.high?.file ? [row.high.file] : [])]) {
      const c = rows.get(name) ?? {};
      const buf = tree.get(name);
      const own = Array.isArray(c.inputs);
      const source = own ? `own work: ${cell(c.generatedBy)}` : cell(c.sourceUrl);
      const author = cell(Array.isArray(c.authors) ? c.authors.join(', ') : (c.authors ?? c.author));
      out.push(`| \`${cell(id)}\` | \`${cell(name)}\`${name === row.lite ? ' (1024 px variant)' : ''}${name === row.high?.file ? ' (high tier)' : ''} | ${source} | ${author} | ${cell(c.licence)}${own ? ' (own work)' : ''} | ${day(c)} | \`${buf ? sha256(buf) : cell(c.sha256)}\` | ${buf ? buf.length : cell(c.bytes)} |`);
      files += 1; bytes += buf ? buf.length : 0;
    }
  }
  out.push('');
  out.push(`${Object.keys(manifest).length} asset ids, ${files} shipped files, ${bytes} bytes. Every downloaded file is CC0-1.0 (public domain dedication); its credits row in \`web/assets/club/credits.json\` also holds the asset page, the licence evidence, the sha256 of the original and the processing step.`);
  out.push('');
  out.push('| own work (no downloaded file) | how it is made | source |');
  out.push('|---|---|---|');
  for (const w of OWN_WORK) out.push(`| ${cell(w.what)} | own work: ${cell(w.how)} | \`${cell(w.source)}\` |`);
  return out;
}

/**
 * The directory as Map<name, Buffer>: its plain files, and the files of high/ (the high tier's pack) as `high/<name>`.
 * Any other sub-directory, and anything inside high/ that is not a plain file, is a failure of its own (`extra`): the
 * loader resolves plain names in the directory and one level of high/.
 */
export function readTree(dir) {
  const tree = new Map();
  const extra = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (ent.name === '.DS_Store') continue;
    if (ent.isFile()) tree.set(ent.name, fs.readFileSync(path.join(dir, ent.name)));
    else if (ent.isDirectory() && ent.name === HIGH_DIR) {
      for (const sub of fs.readdirSync(path.join(dir, HIGH_DIR), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (sub.name === '.DS_Store') continue;
        if (sub.isFile()) tree.set(`${HIGH_DIR}/${sub.name}`, fs.readFileSync(path.join(dir, HIGH_DIR, sub.name)));
        else extra.push(`${HIGH_DIR}/${sub.name}`);
      }
    } else extra.push(ent.name);
  }
  return { tree, extra };
}

// ---- the loader: no high/ request on lite and base (CONTRACT.md 14.2) ---------------------------------------------------------
const LOADER_SOURCE = path.resolve(HERE, '..', '..', 'scene', 'club', 'assets.js');
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

/**
 * The source half of the proof (pure; `text` = club/assets.js). The loader may read a manifest row's `high` member in ONE
 * place, a function that answers null unless the tier is `high`; nothing else in its code may name the member or the
 * directory. Returns failures with the code LOADER.
 */
export function judgeLoaderSource(text) {
  const failures = [];
  const fail = (msg) => failures.push({ code: 'LOADER', where: 'web/scene/club/assets.js', msg });
  const code = stripComments(text);
  if (!/const high = club\?\.tier === 'high';/.test(code)) fail('`high` is not defined as `club?.tier === \'high\'`');
  const fn = code.match(/const highOf = \(row\) => \{([\s\S]*?)\n  \};/);
  if (!fn) fail('no `highOf(row)` function (the one reader of a row\'s `high` member)');
  else {
    if (!/^\s*if \(!high\) return null;/.test(fn[1])) fail('`highOf` does not begin with `if (!high) return null;`');
    const rest = code.replace(fn[0], '');
    const reads = rest.match(/\.high\b|\[\s*['"`]high['"`]\s*\]/g) ?? [];
    if (reads.length) fail(`the \`high\` member is read outside \`highOf\` (${reads.length} place(s))`);
    const inFn = fn[1].match(/\.high\b/g) ?? [];
    if (inFn.length !== 1) fail(`\`highOf\` reads the member ${inFn.length} times, want once (\`row?.high\`)`);
  }
  // the directory's name: only inside the one pattern that validates a high file name
  const dirNames = (code.match(/high\\?\//g) ?? []).length;
  const pattern = (code.match(/const HIGH_FILE = \/\^high\\\/[^\n]*\$\/;/g) ?? []).length;
  if (pattern !== 1) fail('no single `HIGH_FILE` pattern that pins a high file name to high/<plain name>.jpg');
  if (dirNames !== pattern) fail(`the text \`high/\` appears ${dirNames} time(s) in the code, want once (the HIGH_FILE pattern)`);
  return failures;
}

/**
 * The run half of the proof: the real loader (club/assets.js) on a stub `fetch` and a stub image loader, over the manifest
 * given (the real one), once per tier; every id is asked for as a texture and, on a second loader, as raw bytes. Returns
 * { failures, asked, skipped }: LOADER when a lite or base run names a high/ path, when the high run does not ask for
 * exactly the rows' high files, when a row without the member is not served by its own file, or when a missing high
 * file is not followed by the row's default file.
 */
export async function judgeLoaderRequests(manifest) {
  const failures = [];
  const fail = (msg) => failures.push({ code: 'LOADER', where: 'web/scene/club/assets.js', msg });
  let nodeModule = null;
  try { nodeModule = await import('node:module'); } catch { nodeModule = null; }
  if (typeof nodeModule?.registerHooks !== 'function') return { failures, asked: 0, skipped: 'node:module registerHooks is not available in this node (22.15 or later has it): the stub-fetch run was skipped' };
  const threeUrl = new URL('../../vendor/three.module.min.js', import.meta.url).href;
  nodeModule.registerHooks({ resolve(specifier, context, next) { return specifier === 'three' ? { url: threeUrl, shortCircuit: true } : next(specifier, context); } });
  const THREE = await import('three');
  const { createAssets } = await import('../../scene/club/assets.js');
  const { TIERS } = await import('../../scene/club/tiers.js');
  const ids = Object.keys(manifest);
  const rel = (u) => { const s = String(u); const i = s.indexOf('/assets/club/'); return i >= 0 ? s.slice(i + '/assets/club/'.length) : s; };
  const run = async (tier, { missing = () => false, query = null } = {}) => {
    const urls = [];
    const saved = { fetch: globalThis.fetch, load: THREE.TextureLoader.prototype.load };
    globalThis.fetch = async (u) => {
      const f = rel(u); urls.push(f);
      if (f === 'manifest.json') return { ok: true, status: 200, json: async () => manifest };
      return missing(f) ? { ok: false, status: 404 } : { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
    };
    THREE.TextureLoader.prototype.load = function load(u, onLoad, _onProgress, onError) {
      const f = rel(u); urls.push(f);
      setTimeout(() => (missing(f) ? onError(new Error('404')) : onLoad({ image: { width: 8, height: 8, file: f } })), 0);
    };
    try {
      const club = () => ({ tier, knobs: TIERS[tier], ...(query ? { ctx: { query: new URLSearchParams(query) } } : {}) });
      const a = createAssets(club());
      for (const id of ids) a.texture(id);
      await a.ready();
      const b = createAssets(club());
      await Promise.all(ids.map((id) => b.bytes(id)));
      return { urls: urls.filter((f) => f !== 'manifest.json'), texture: a.state(), raw: b.state() };
    } finally { globalThis.fetch = saved.fetch; THREE.TextureLoader.prototype.load = saved.load; }
  };
  const highRows = ids.filter((id) => manifest[id]?.high?.file);
  let asked = 0;
  for (const tier of ['lite', 'base']) {
    const r = await run(tier);
    asked += r.urls.length;
    const bad = r.urls.filter((f) => /(^|\/)high\//.test(f));
    if (bad.length) fail(`tier ${tier} asked for ${bad.length} high/ path(s): ${[...new Set(bad)].slice(0, 3).join(', ')}`);
    if (r.urls.length !== 2 * ids.length) fail(`tier ${tier}: ${r.urls.length} requests for ${ids.length} ids asked twice (as a texture and as bytes)`);
    if (r.texture.highFiles || r.raw.highFiles || r.texture.highMissed || r.raw.highMissed) fail(`tier ${tier}: the loader counts a high file`);
  }
  {
    const r = await run('high');
    asked += r.urls.length;
    const want = new Map(ids.map((id) => [id, manifest[id].high?.file ?? manifest[id].file]));
    const got = new Set(r.urls);
    for (const [id, f] of want) if (!got.has(f)) fail(`tier high did not ask for ${f} (${id})`);
    for (const id of highRows) if (got.has(manifest[id].file)) fail(`tier high asked for the default file of ${id} beside its high file`);
    if (r.urls.length !== 2 * ids.length) fail(`tier high: ${r.urls.length} requests for ${ids.length} ids asked twice`);
    if (r.texture.highFiles !== highRows.length || r.raw.highFiles !== highRows.length) fail(`tier high: ${r.texture.highFiles} / ${r.raw.highFiles} high files counted, want ${highRows.length}`);
  }
  if (highRows.length) {
    // a high file that does not arrive: the row's default file is the next request, and nothing falls back to a stand-in
    const r = await run('high', { missing: (f) => /^high\//.test(f) });
    for (const id of highRows) {
      const at = r.urls.indexOf(manifest[id].high.file);
      if (at < 0 || !r.urls.includes(manifest[id].file)) fail(`a missing high file of ${id} was not followed by its default file`);
    }
    if (r.texture.highMissed !== highRows.length || r.texture.fallback !== 0) fail(`missing high files: ${r.texture.highMissed} counted, ${r.texture.fallback} stand-ins kept (want ${highRows.length} and 0)`);
    // a per-id cap of 1024 px or less on the high tier is served by the default file
    const id = highRows[0];
    const c = await run('high', { query: `clubtex=${id}:1024` });
    if (c.urls.filter((f) => f === manifest[id].high.file).length !== 1) fail(`\`?clubtex=${id}:1024\`: the texture request should take the default file (the raw request alone names the high file)`);
  }
  return { failures, asked, skipped: null };
}

async function report(dir) {
  const { tree, extra } = readTree(dir);
  const { failures, counts } = judge(tree);
  for (const name of extra) failures.push({ code: 'ORPHAN', where: name, msg: 'not a plain file (the loader resolves plain names in the directory and in high/)' });
  // the loader half: its source, then the real loader on a stub fetch over this directory's manifest
  let loader = 'loader: not run (no manifest)';
  try {
    failures.push(...judgeLoaderSource(fs.readFileSync(LOADER_SOURCE, 'utf8')));
    if (tree.has('manifest.json')) {
      const manifest = JSON.parse(tree.get('manifest.json').toString('utf8'));
      const r = await judgeLoaderRequests(manifest);
      failures.push(...r.failures);
      loader = r.skipped ? `loader: source checked; ${r.skipped}` : `loader: lite and base ask for no high/ path, high asks for ${Object.values(manifest).filter((row) => row?.high?.file).length} high file(s) (${r.asked} stub requests over ${Object.keys(manifest).length} ids x 3 tiers)`;
    }
  } catch (e) { failures.push({ code: 'LOADER', where: 'web/scene/club/assets.js', msg: `the loader arm threw: ${e?.message ?? e}` }); }
  for (const f of failures) process.stdout.write(`  FAIL ${f.code} ${f.where}: ${f.msg}\n`);
  process.stdout.write(`test-club-assets: ${failures.length ? `${failures.length} FAILURE(S)` : 'OK'} — ${counts.ids} ids, ${counts.files - counts.highFiles} files`
    + ` (${counts.credited} credited, ${counts.derived} derived), ${counts.bytes} bytes of ${MAX_TOTAL_BYTES}, largest side ${counts.maxSide} px of ${MAX_SIDE}`
    + `; high pack: ${counts.highFiles} files (${counts.highCredited} credited), ${counts.highBytes} bytes of ${MAX_HIGH_BYTES}, largest side ${counts.highMaxSide} px of ${MAX_HERO_SIDE} (hero) / ${MAX_HIGH_SIDE}, GPU with mips ${counts.highGpuBytes} bytes; ${loader}\n`);
  if (!failures.length && counts.files === 0) process.stdout.write('  NOTE the manifest names no file yet: every texture is the procedural fallback\n');
  return failures;
}

// a synthetic, valid tree for the self-test: two tiny PNG headers (never decoded), one with a lite variant
function pngHeader(w, h, salt) {
  const b = Buffer.alloc(40 + salt);
  b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(0x0d0a1a0a, 4); b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}
// a baseline JPEG frame header (never decoded)
function jpegHeader(w, h, salt) {
  const b = Buffer.alloc(24 + salt);
  Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 0x01, 0x11, 0x00]).copy(b);
  return b;
}
function synthetic() {
  // `high/a.jpg` is the high tier's file of x.a (not a hero id: 2048 px at most)
  const files = { 'a.png': pngHeader(2048, 1024, 1), 'a-1024.png': pngHeader(1024, 512, 2), 'b.png': pngHeader(512, 512, 3), 'lut.png': pngHeader(1024, 32, 4), 'high/a.jpg': jpegHeader(2048, 2048, 5) };
  const credit = (file, id, more = {}) => ({ file, id, bytes: files[file].length, sha256: sha256(files[file]),
    sourceUrl: 'https://example.org/textures/a.zip', authors: ['An Author'], licence: 'CC0-1.0', downloaded: '2026-11-13T00:00:00Z', originalSha256: 'ab'.repeat(32), ...more });
  const manifest = { 'x.a': { file: 'a.png', lite: 'a-1024.png', high: { file: 'high/a.jpg', bytes: files['high/a.jpg'].length, sha256: sha256(files['high/a.jpg']) }, bytes: files['a.png'].length, sha256: sha256(files['a.png']) },
    'x.b': { file: 'b.png', bytes: files['b.png'].length, sha256: sha256(files['b.png']) },
    'x.lut': { file: 'lut.png', bytes: files['lut.png'].length, sha256: sha256(files['lut.png']) } };
  const credits = { highTotalBytes: files['high/a.jpg'].length, files: [credit('a.png', 'x.a'), credit('a-1024.png', 'x.a'), credit('b.png', 'x.b'),
    { file: 'lut.png', id: 'x.lut', bytes: files['lut.png'].length, sha256: sha256(files['lut.png']), licence: 'CC0-1.0', inputs: ['web/tools/club/bake-lut.mjs'], generatedBy: 'web/tools/club/bake-lut.mjs', processing: 'identity LUT, graded' }],
    highFiles: [credit('high/a.jpg', 'x.a')] };
  return { files, manifest, credits };
}
function build({ files, manifest, credits }) {
  const tree = new Map(Object.entries(files));
  tree.set('manifest.json', Buffer.from(JSON.stringify(manifest)));
  tree.set('credits.json', Buffer.from(JSON.stringify(credits)));
  tree.set('CREDITS.md', Buffer.from('# credits\n'));
  return tree;
}

function selftest() {
  let ok = true;
  const say = (good, line) => { ok &&= good; process.stdout.write(`${good ? 'ok  ' : 'FAIL'} ${line}\n`); };
  const codes = (r) => [...new Set(r.failures.map((f) => f.code))];
  // header reader against known bytes
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc2, 0x00, 0x0b, 0x08, 0x08, 0x00, 0x04, 0x00, 0x03, 0x11, 0x00, 0x00, 0x00]);
  say(JSON.stringify(imageSize(jpeg)) === '{"format":"jpeg","height":2048,"width":1024}', 'reader: a progressive JPEG frame header after an APP0 segment');
  say(JSON.stringify(imageSize(pngHeader(300, 200, 0))) === '{"format":"png","width":300,"height":200}', 'reader: a PNG IHDR');
  const webp = Buffer.alloc(30); webp.write('RIFF', 0, 'latin1'); webp.write('WEBP', 8, 'latin1'); webp.write('VP8X', 12, 'latin1'); webp.writeUIntLE(2047, 24, 3); webp.writeUIntLE(1023, 27, 3);
  say(JSON.stringify(imageSize(webp)) === '{"format":"webp","width":2048,"height":1024}', 'reader: an extended WebP header');
  say(imageSize(Buffer.from('not an image at all, just text')) === null, 'reader: text is not an image');
  // control
  const control = judge(build(synthetic()));
  say(control.failures.length === 0, `control: the synthetic tree is green (${control.failures.map((f) => `${f.code} ${f.where}`).join('; ') || 'no failure'})`);
  const plants = [
    ['a tampered byte in a shipped file', 'DIGEST', (s) => { s.files['b.png'] = Buffer.from(s.files['b.png']); s.files['b.png'][39] ^= 1; }],
    ['a manifest row with the wrong byte count', 'DIGEST', (s) => { s.manifest['x.b'].bytes += 1; }],
    ['a file the manifest names is gone', 'MISSING', (s) => { delete s.files['b.png']; s.credits.files = s.credits.files.filter((c) => c.file !== 'b.png'); }],
    ['a shipped file without a credits row', 'CREDIT', (s) => { s.credits.files = s.credits.files.filter((c) => c.file !== 'a-1024.png'); }],
    ['a credits row without a source URL', 'CREDIT', (s) => { delete s.credits.files[0].sourceUrl; }],
    ['a credits row without an author', 'CREDIT', (s) => { s.credits.files[0].authors = []; }],
    ['a credits row without a date', 'CREDIT', (s) => { delete s.credits.files[0].downloaded; }],
    ['a credits row without the sha256 of the original', 'CREDIT', (s) => { s.credits.files[0].originalSha256 = 'unknown'; }],
    ['a derived file that names no input', 'CREDIT', (s) => { s.credits.files[3].inputs = []; }],
    ['a licence that is not CC0 or public domain', 'LICENCE', (s) => { s.credits.files[2].licence = 'CC-BY-4.0'; }],
    ['a 4096 px side', 'SIZE', (s) => {
      s.files['b.png'] = pngHeader(4096, 512, 3);
      s.manifest['x.b'] = { file: 'b.png', bytes: s.files['b.png'].length, sha256: sha256(s.files['b.png']) };
      Object.assign(s.credits.files[2], { bytes: s.files['b.png'].length, sha256: sha256(s.files['b.png']) });
    }],
    ['a lite variant over 1024 px', 'SIZE', (s) => {
      s.files['a-1024.png'] = pngHeader(2048, 1024, 2);
      Object.assign(s.credits.files[1], { bytes: s.files['a-1024.png'].length, sha256: sha256(s.files['a-1024.png']) });
    }],
    ['a file that is not an image', 'SIZE', (s) => {
      s.files['b.png'] = Buffer.from('<html>not a texture</html>');
      s.manifest['x.b'] = { file: 'b.png', bytes: s.files['b.png'].length, sha256: sha256(s.files['b.png']) };
      Object.assign(s.credits.files[2], { bytes: s.files['b.png'].length, sha256: sha256(s.files['b.png']) });
    }],
    ['a file the manifest does not name', 'ORPHAN', (s) => { s.files['stray.png'] = pngHeader(8, 8, 9); s.credits.files.push({ ...s.credits.files[2], file: 'stray.png', bytes: s.files['stray.png'].length, sha256: sha256(s.files['stray.png']) }); }],
    ['a sound file in the directory (even with a manifest and a credits row)', 'SOUND', (s) => {
      s.files['room-tone.ogg'] = Buffer.from('OggS not really');
      s.manifest['x.tone'] = { file: 'room-tone.ogg', bytes: s.files['room-tone.ogg'].length, sha256: sha256(s.files['room-tone.ogg']) };
      s.credits.files.push({ ...s.credits.files[2], file: 'room-tone.ogg', id: 'x.tone', bytes: s.files['room-tone.ogg'].length, sha256: sha256(s.files['room-tone.ogg']) });
    }],
    ['a stray wav in the directory', 'SOUND', (s) => { s.files['click.WAV'] = Buffer.from('RIFF....WAVE'); }],
    ['a manifest row with an unknown key', 'MANIFEST', (s) => { s.manifest['x.b'].url = 'https://example.org/b.png'; }],
    ['a manifest file name that leaves the directory', 'MANIFEST', (s) => { s.manifest['x.b'].file = '../b.png'; }],
    // the high tier's pack (round A2)
    ['a PNG in the high pack (under a .jpg name)', 'HIGH', (s) => {
      s.files['high/a.jpg'] = pngHeader(2048, 2048, 5);
      Object.assign(s.manifest['x.a'].high, { bytes: s.files['high/a.jpg'].length, sha256: sha256(s.files['high/a.jpg']) });
      Object.assign(s.credits.highFiles[0], { bytes: s.files['high/a.jpg'].length, sha256: sha256(s.files['high/a.jpg']) });
      s.credits.highTotalBytes = s.files['high/a.jpg'].length;
    }],
    ['a high-tier file of 4096 px for an id that is not named hero', 'SIZE', (s) => {
      s.files['high/a.jpg'] = jpegHeader(4096, 4096, 5);
      Object.assign(s.manifest['x.a'].high, { bytes: s.files['high/a.jpg'].length, sha256: sha256(s.files['high/a.jpg']) });
      Object.assign(s.credits.highFiles[0], { bytes: s.files['high/a.jpg'].length, sha256: sha256(s.files['high/a.jpg']) });
    }],
    ['a high-tier file without a credits row', 'CREDIT', (s) => { s.credits.highFiles = []; }],
    ['a high-tier file credited under "files"', 'CREDIT', (s) => { s.credits.files.push(s.credits.highFiles.pop()); }],
    ['a tampered byte in a high-tier file', 'DIGEST', (s) => { s.files['high/a.jpg'] = Buffer.from(s.files['high/a.jpg']); s.files['high/a.jpg'][20] ^= 1; }],
    ['a wrong total of the high pack in the credits', 'DIGEST', (s) => { s.credits.highTotalBytes += 1; }],
    ['a file in high/ the manifest does not name', 'ORPHAN', (s) => {
      s.files['high/stray.jpg'] = jpegHeader(512, 512, 9);
      s.credits.highFiles.push({ ...s.credits.highFiles[0], file: 'high/stray.jpg', bytes: s.files['high/stray.jpg'].length, sha256: sha256(s.files['high/stray.jpg']) });
      s.credits.highTotalBytes += s.files['high/stray.jpg'].length;
    }],
    ['a high member whose file leaves high/', 'MANIFEST', (s) => { s.manifest['x.a'].high.file = 'high/../a.jpg'; }],
    ['a high member with an unknown key', 'MANIFEST', (s) => { s.manifest['x.a'].high.url = 'https://example.org/a.jpg'; }],
  ];
  for (const [name, code, plant] of plants) {
    const s = synthetic();
    plant(s);
    const r = judge(build(s));
    const got = codes(r);
    say(got.length === 1 && got[0] === code, `plant ${name}: want ${code}, got [${got.join(', ')}]`);
  }
  {
    const r = judge(build(synthetic()), { maxTotalBytes: 100 });
    say(codes(r).join() === 'BUDGET', `plant the directory over its byte budget: want BUDGET, got [${codes(r).join(', ')}]`);
    const h = judge(build(synthetic()), { maxHighBytes: 10 });
    say(codes(h).join() === 'BUDGET' && h.failures[0].where.endsWith('/high'), `plant the high pack over its byte budget: want BUDGET on high/, got [${codes(h).join(', ')}]`);
    // the counts keep the two apart: the default tier's bytes hold no high file
    const c = judge(build(synthetic())).counts;
    say(c.highFiles === 1 && c.highBytes === 29 && c.highMaxSide === 2048 && c.highGpuBytes === Math.round(2048 * 2048 * 4 * 4 / 3) && c.maxSide === 2048, `counts: the high pack is counted apart (${c.highFiles} file, ${c.highBytes} bytes, ${c.highGpuBytes} GPU bytes with mips)`);
    // a file named .png (or .webp) under high/, with the manifest and the credits following the name: the row and the file fail
    const png = (() => {
      const s = synthetic();
      s.files['high/a.png'] = s.files['high/a.jpg']; delete s.files['high/a.jpg'];
      s.manifest['x.a'].high.file = 'high/a.png'; s.credits.highFiles[0].file = 'high/a.png';
      return codes(judge(build(s))).sort().join();
    })();
    say(png === 'HIGH,MANIFEST', `plant a file named .png in the high pack: want HIGH and MANIFEST, got [${png}]`);
    // a hero id may hold 4096 px in the high pack; 4097 px is over
    const hero = (side) => {
      const s = synthetic();
      const id = [...HERO_IDS][0];
      s.files['high/a.jpg'] = jpegHeader(side, side, 5);
      s.manifest[id] = { ...s.manifest['x.a'], high: { file: 'high/a.jpg', bytes: s.files['high/a.jpg'].length, sha256: sha256(s.files['high/a.jpg']) } };
      delete s.manifest['x.a'];
      for (const row of [...s.credits.files, ...s.credits.highFiles]) if (row.id === 'x.a') row.id = id;
      Object.assign(s.credits.highFiles[0], { bytes: s.files['high/a.jpg'].length, sha256: sha256(s.files['high/a.jpg']) });
      return codes(judge(build(s)));
    };
    say(hero(4096).length === 0 && hero(4097).join() === 'SIZE', `hero ids: 4096 px passes in the high pack, 4097 px is SIZE ([${hero(4096).join(', ')}] / [${hero(4097).join(', ')}])`);
  }
  // the loader's source (the pure half of the LOADER proof): the real file is green, two planted leaks are caught
  {
    const text = fs.readFileSync(LOADER_SOURCE, 'utf8');
    say(judgeLoaderSource(text).length === 0, `loader source: club/assets.js reads a row's high member in one guarded place (${judgeLoaderSource(text).map((f) => f.msg).join('; ') || 'no failure'})`);
    const noGuard = text.replace('if (!high) return null;', '');
    say(noGuard !== text && judgeLoaderSource(noGuard).some((f) => f.code === 'LOADER'), 'loader plant: the tier guard removed from highOf: LOADER');
    const leak = text.replace('const file = row ? (useLite ? row.lite : row.file) : null;', 'const file = row ? (useLite ? row.lite : row.high?.file ?? row.file) : null;');
    say(leak !== text && judgeLoaderSource(leak).some((f) => f.code === 'LOADER'), 'loader plant: the high member read outside highOf: LOADER');
    const literal = text.replace('entry.file = name;', "entry.file = name.replace('x', 'high/y');");
    say(literal !== text && judgeLoaderSource(literal).some((f) => f.code === 'LOADER'), 'loader plant: a second place that names the high/ directory: LOADER');
  }
  // the real directory, copied to a temp dir and tampered: one flipped byte must turn the arm red (and the copy must be
  // judged exactly as the original before the flip)
  const { tree } = readTree(DEFAULT_DIR);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'club-assets-'));
  try {
    for (const [name, buf] of tree) { fs.mkdirSync(path.dirname(path.join(tmp, name)), { recursive: true }); fs.writeFileSync(path.join(tmp, name), buf); }
    const live = judge(tree).failures.length;
    const copy = judge(readTree(tmp).tree).failures.length;
    say(copy === live, `temp copy of web/assets/club: judged as the original (${copy} failure(s), original ${live})`);
    const victim = [...tree.keys()].filter((n) => !META.has(n)).sort()[0];
    if (!victim) say(true, 'temp copy: the directory ships no file yet, so the tampered-file plant ran on the synthetic tree only (see above)');
    else {
      const buf = Buffer.from(tree.get(victim)); buf[buf.length - 1] ^= 0x01;
      fs.writeFileSync(path.join(tmp, victim), buf);
      const r = judge(readTree(tmp).tree);
      const hit = r.failures.filter((f) => f.code === 'DIGEST' && f.where === victim).length;
      say(hit >= 1 && r.failures.length > live, `temp copy with one flipped byte in ${victim}: DIGEST (${r.failures.length} failure(s), original ${live})`);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  // the licence table: one row per shipped file of the synthetic tree, the derived file marked as own work, every own-work
  // source in the repo, and no cell that breaks the table
  {
    const lines = licenceTable(build(synthetic()));
    const body = lines.filter((l) => /^\| `x\./.test(l));
    say(body.length === 5 && body[0].includes('`x.a`') && body[1].includes('(1024 px variant)') && body[2].includes('`high/a.jpg` (high tier)') && body[0].includes('https://example.org/textures/a.zip') && body[0].includes('An Author') && body[0].includes('CC0-1.0') && body[0].includes('2026-11-13'),
      `table: one row per shipped file with source, author, licence and date, the high tier's file marked (${body.length} rows)`);
    say(/own work: web\/tools\/club\/bake-lut\.mjs/.test(body[4]) && body[4].includes('(own work)'), 'table: a derived file is marked as own work with its tool');
    say(body.every((l) => l.split('|').length === 10), 'table: eight cells in every asset row');
    const root = path.resolve(HERE, '..', '..', '..');
    const missing = OWN_WORK.filter((w) => !fs.existsSync(path.join(root, w.source))).map((w) => w.source);
    say(missing.length === 0, `table: every own-work source file exists (${missing.join(', ') || 'all present'})`);
    say(lines.filter((l) => l.includes('own work: ')).length >= OWN_WORK.length, 'table: the own-work rows are printed');
  }
  process.stdout.write(`selftest: ${ok ? 'every plant caught, the control green' : 'a plant was missed or the control went red'} (${plants.length + 2} plants + 4 reader arms + control + 3 high-pack arms + 4 loader-source arms + temp copy + 5 table arms)\n`);
  return ok;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);
  const at = argv.indexOf('--dir');
  const dir = at >= 0 ? path.resolve(argv[at + 1] ?? '') : DEFAULT_DIR;
  if (!fs.existsSync(dir)) { process.stdout.write(`test-club-assets: no such directory ${dir}\n`); process.exit(2); }
  if (argv.includes('--table')) {
    // the table is printed only from a directory this arm has just judged green (the failures go to stderr)
    const { tree, extra } = readTree(dir);
    const { failures } = judge(tree);
    if (failures.length || extra.length) {
      for (const f of failures) process.stderr.write(`  FAIL ${f.code} ${f.where}: ${f.msg}\n`);
      process.stderr.write(`test-club-assets: no table (${failures.length + extra.length} failure(s))\n`);
      process.exit(1);
    }
    process.stdout.write(licenceTable(tree).join('\n') + '\n');
    process.exit(0);
  }
  process.exit((await report(dir)).length ? 1 : 0);
}
