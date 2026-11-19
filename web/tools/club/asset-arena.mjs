// Copyright (c) Meta Platforms, Inc. and affiliates.

// asset-arena.mjs — builds and checks the texture files of the `arena` venue (round A2): the default-tier files in
// web/assets/club/ and the high tier's pack in web/assets/club/high/ (node, no packages; `sips` and `unzip` are macOS system
// tools). It is the arena's counterpart of asset-build.mjs (the club venue's table, which this tool never touches).
//
//   node web/tools/club/asset-arena.mjs --src <originals dir>            build every row and merge its rows into
//                                                                         manifest.json, credits.json and CREDITS.md
//   node web/tools/club/asset-arena.mjs --check [--src <originals dir>]  verify the shipped arena files against the table,
//                                                                         the manifest and the credits (no encoder is run)
//   node web/tools/club/asset-arena.mjs --ready                          print one line per id for the roles that use the
//                                                                         maps (files, pixels, tile size, mean colour)
//   options: --out <dir> (default web/assets/club), --only <id,id,...> (build: these ids only)
//
// Three files are shared with the bake role (manifest.json, credits.json, CREDITS.md): this tool re-reads each one at the
// moment it writes, changes only the rows of the ids in ROWS below (plus the totals, which are sums over the rows), and
// refuses to write a JSON file that is not in the canonical form both tools write (two-space JSON.stringify and a final
// newline), so every other row keeps its bytes. No existing file of the club venue is read, re-encoded or renamed.
//
// The originals are never committed: one directory per source asset under --src, exactly as downloaded (SOURCES records
// URL, bytes and sha256; a build refuses an original whose sha256 differs). Everything written is a pure function of the
// originals, the tables and the encoder: no timestamps, fixed key order.
//
// Rules enforced here: CC0 sources from the two named sites only; the default-tier file of a row is at most 1024 px (the lane's
// lazy 12 MB cap covers it); a high-tier file is a JPEG under high/ (that extension is outside the service worker's precache
// list), 4096 px for a hero id and at most 2048 px otherwise.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './asset-png.mjs';

const CC0 = 'CC0-1.0';
const ACG_LICENCE = 'https://docs.ambientcg.com/license/ (site-wide: every asset is CC0 1.0 Universal)';
const PH_LICENCE = 'https://polyhaven.com/license (site-wide: every asset is CC0)';
const PH_TEX = 'https://dl.polyhaven.org/file/ph-assets/Textures';
// the licence sentence of an ambientCG asset page (the same on every asset page; fetched for each asset used here)
const ACG_STATEMENT = 'All assets are released under the Creative Commons CC0 license, making them free to use without attribution - even in commercial circumstances.';
// the copyright notice in the record of a Poly Haven asset page (fetched for each asset used here; the record's licence
// member is https://creativecommons.org/publicdomain/zero/1.0/)
const PH_STATEMENT = 'CC0 1.0 Universal - public domain dedication, no attribution required';
// the grey conversion of a colour map: the ColorSync profile `sips -m` matches to (a system file of macOS)
const GREY_PROFILE = '/System/Library/ColorSync/Profiles/Generic Gray Gamma 2.2 Profile.icc';

// One entry per source asset. `dir` is its directory under --src; `files` are the originals exactly as downloaded;
// `members` are the image members taken out of an archive (nothing else in an archive is ever extracted or used).
// `tileMetres` is the real-world size of one repeat as the source's own record states it.
export const SOURCES = {
  carpet016: {
    provider: 'ambientCG', assetId: 'Carpet016', name: 'Carpet 016', page: 'https://ambientcg.com/a/Carpet016',
    authors: ['ambientCG'], licence: CC0, licenceEvidence: ACG_LICENCE, licenceStatement: ACG_STATEMENT,
    published: '2023-11-05', tileMetres: 1.7, method: 'photogrammetry scan (the source\'s record: PBRPhotogrammetry)',
    dir: 'acg_Carpet016',
    files: {
      'Carpet016_4K-JPG.zip': { url: 'https://ambientcg.com/get?file=Carpet016_4K-JPG.zip', bytes: 111252536, sha256: 'a1c26db39c84a3c72ff3c5b7230ac2264c2a33f3c995d3ab821be98a69aa7a4c', downloaded: '2026-11-15T00:17:37Z' },
    },
    members: {
      'Carpet016_4K-JPG_Color.jpg': { archive: 'Carpet016_4K-JPG.zip', sha256: 'f457b9848d64647d9a64832f5464dd67eff9988d4d565b65fe6293ee02ae90a4' },
      'Carpet016_4K-JPG_NormalGL.jpg': { archive: 'Carpet016_4K-JPG.zip', sha256: '6598bd96aeae5e63059f56359598a5472f6421d05dbf2fad7186cd6a0548ce43' },
      'Carpet016_4K-JPG_Roughness.jpg': { archive: 'Carpet016_4K-JPG.zip', sha256: '5c92173e56a68661017d8ab7e015416bb97efb358f83d855a9a2ffc2bb8c462b' },
    },
  },
  velour_velvet: {
    provider: 'Poly Haven', assetId: 'velour_velvet', name: 'Velour Velvet', page: 'https://polyhaven.com/a/velour_velvet',
    authors: ['colormass', 'Rico Cilliers'], licence: CC0, licenceEvidence: PH_LICENCE, licenceStatement: PH_STATEMENT,
    published: '2025-09-05', tileMetres: [0.284, 0.273], method: 'fabric scan (the source\'s record: photography and processing)',
    dir: 'velour_velvet',
    files: {
      'velour_velvet_diff_4k.jpg': { url: `${PH_TEX}/jpg/4k/velour_velvet/velour_velvet_diff_4k.jpg`, bytes: 13005232, sha256: 'c186d0c369aef2204be81f5eb8c9ca8b271d7480f65bb53785ed484647dfa7c6', downloaded: '2026-11-15T00:34:27Z' },
      'velour_velvet_nor_gl_4k.jpg': { url: `${PH_TEX}/jpg/4k/velour_velvet/velour_velvet_nor_gl_4k.jpg`, bytes: 9222989, sha256: '2817fba6736d2dca3efbcf9b988421bf96ab206dfc833c2b77a8bd99368364fa', downloaded: '2026-11-15T00:34:30Z' },
      'velour_velvet_rough_4k.jpg': { url: `${PH_TEX}/jpg/4k/velour_velvet/velour_velvet_rough_4k.jpg`, bytes: 15136265, sha256: '3ae05783ad283854b588c01ec715805591881a74b45fed4b5a8913d21ed85bdd', downloaded: '2026-11-15T00:34:32Z' },
    },
  },
  caban: {
    provider: 'Poly Haven', assetId: 'caban', name: 'Caban', page: 'https://polyhaven.com/a/caban',
    authors: ['colormass', 'Rico Cilliers'], licence: CC0, licenceEvidence: PH_LICENCE, licenceStatement: PH_STATEMENT,
    published: '2025-09-05', tileMetres: [0.274, 0.273], method: 'fabric scan (the source\'s record: photography and processing)',
    dir: 'caban',
    files: {
      'caban_nor_gl_4k.jpg': { url: `${PH_TEX}/jpg/4k/caban/caban_nor_gl_4k.jpg`, bytes: 8440015, sha256: '74ac71b9557d29c60feb110693c3f5411d6d58ed12fc02c000de601478d3cf3c', downloaded: '2026-11-15T00:35:17Z' },
      'caban_rough_4k.jpg': { url: `${PH_TEX}/jpg/4k/caban/caban_rough_4k.jpg`, bytes: 16811133, sha256: 'fb0666f72a7af51994c40a24c45c23e5e07538d91af9ed5d3c6bb2cffd86f9a0', downloaded: '2026-11-15T00:35:20Z' },
    },
  },
};

// One row per manifest id. `def` is the default-tier file (lite, base; also the high tier's second attempt), `high` the
// high tier's file. `hero` allows 4096 px. `grey` makes a colour map neutral, so that the consumer's material colour sets
// the hue: 'luma' = the system's grey conversion (a near-neutral scan), 'value' = each pixel's strongest channel (a
// saturated scan: its luma would be too dark to tint up; the strongest channel is the fabric's shading at full strength).
// kind 'jpeg': sips [-m <grey profile>] -Z <size> -s format jpeg -s formatOptions <quality>.
export const ROWS = [
  { id: 'arena.carpet.color', source: 'carpet016', from: 'Carpet016_4K-JPG_Color.jpg', grey: 'luma', hero: true, colorSpace: 'srgb',
    def: { file: 'arena-carpet-color.jpg', size: 1024, quality: 55 }, high: { file: 'high/arena-carpet-color.jpg', size: 4096, quality: 80 },
    notes: 'Loop-pile carpet (a wool berber: loops about 7 mm wide at the source\'s scale, rows run along U), converted to neutral grey so that the material\'s colour sets the tint; the scan\'s darker flecks stay as darker specks. Tiles without a seam.' },
  { id: 'arena.carpet.normal', source: 'carpet016', from: 'Carpet016_4K-JPG_NormalGL.jpg', hero: true, colorSpace: 'linear',
    def: { file: 'arena-carpet-normal.jpg', size: 1024, quality: 40 }, high: { file: 'high/arena-carpet-normal.jpg', size: 4096, quality: 62 },
    notes: 'OpenGL convention (+Y up). Strong relief: the mean tilt of the 4096 px original is 18 degrees. At 1024 px a loop is about 4 px wide, so the default-tier file holds the pile as grain of the right strength rather than as loops.' },
  { id: 'arena.carpet.rough', source: 'carpet016', from: 'Carpet016_4K-JPG_Roughness.jpg', hero: true, colorSpace: 'linear',
    def: { file: 'arena-carpet-rough.jpg', size: 1024, quality: 35 }, high: { file: 'high/arena-carpet-rough.jpg', size: 4096, quality: 40 },
    notes: 'Roughness, single channel (grey JPEG).' },
  // seat fabric: a short velour (upholstery)
  { id: 'arena.seat.color', source: 'velour_velvet', from: 'velour_velvet_diff_4k.jpg', grey: 'value', colorSpace: 'srgb',
    def: { file: 'arena-seat-color.jpg', size: 512, quality: 70 }, high: { file: 'high/arena-seat-color.jpg', size: 2048, quality: 80 },
    notes: 'Short velour upholstery fabric, made neutral (the scan is red: each pixel keeps its strongest channel, so the map holds the nap\'s light and dark patches near full scale and the material\'s colour sets the hue). Low contrast by nature: the look of a velour is in its sheen, not in this map.' },
  { id: 'arena.seat.normal', source: 'velour_velvet', from: 'velour_velvet_nor_gl_4k.jpg', colorSpace: 'linear',
    def: { file: 'arena-seat-normal.jpg', size: 512, quality: 75 }, high: { file: 'high/arena-seat-normal.jpg', size: 2048, quality: 80 },
    notes: 'OpenGL convention (+Y up). Low relief (a napped surface).' },
  { id: 'arena.seat.rough', source: 'velour_velvet', from: 'velour_velvet_rough_4k.jpg', colorSpace: 'linear',
    def: { file: 'arena-seat-rough.jpg', size: 512, quality: 60 }, high: { file: 'high/arena-seat-rough.jpg', size: 2048, quality: 35 },
    notes: 'Roughness, single channel (grey JPEG).' },
  // drape: a heavy napped wool cloth (the kind a stage drape is made of); normal and roughness only, the colour is the consumer's
  { id: 'arena.drape.normal', source: 'caban', from: 'caban_nor_gl_4k.jpg', colorSpace: 'linear',
    def: { file: 'arena-drape-normal.jpg', size: 1024, quality: 60 }, high: { file: 'high/arena-drape-normal.jpg', size: 2048, quality: 75 },
    notes: 'Heavy napped wool cloth; OpenGL convention (+Y up).' },
  { id: 'arena.drape.rough', source: 'caban', from: 'caban_rough_4k.jpg', colorSpace: 'linear',
    def: { file: 'arena-drape-rough.jpg', size: 1024, quality: 35 }, high: { file: 'high/arena-drape-rough.jpg', size: 2048, quality: 35 },
    notes: 'Roughness, single channel (grey JPEG).' },
];

export const DEFAULT_MAX_SIDE = 1024;
export const HIGH_MAX_SIDE = 2048;
export const HERO_MAX_SIDE = 4096;
const HIGH_FILE = /^high\/[A-Za-z0-9][A-Za-z0-9._-]*\.jpg$/;
const SOURCE_URL = /^https:\/\/(dl\.polyhaven\.org|ambientcg\.com)\//;

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.resolve(HERE, '../../assets/club');
const canonical = (obj) => `${JSON.stringify(obj, null, 2)}\n`;

/** Pixel size, channel count and chroma sampling of a JPEG from its header. */
export function jpegInfo(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('jpegInfo: not a JPEG');
  let o = 2;
  while (o + 9 < buf.length && buf[o] === 0xff) {
    const m = buf[o + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      const n = buf[o + 9];
      return { format: 'jpeg', width: buf.readUInt16BE(o + 7), height: buf.readUInt16BE(o + 5), channels: n };
    }
    o += 2 + buf.readUInt16BE(o + 2);
  }
  throw new Error('jpegInfo: no frame header');
}

function parseArgs(argv) {
  const opt = { src: process.env.CLUB_ARENA_ASSETS_SRC || null, out: DEFAULT_OUT, check: false, ready: false, only: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--src') opt.src = argv[++i];
    else if (a === '--out') opt.out = path.resolve(argv[++i]);
    else if (a === '--check') opt.check = true;
    else if (a === '--ready') opt.ready = true;
    else if (a === '--only') opt.only = new Set(argv[++i].split(','));
    else throw new Error(`unknown argument ${a}`);
  }
  return opt;
}

/** Path of a row's original image (an archive member is extracted into tmp), sha256 verified against SOURCES. */
function original(row, srcDir, tmp, verified) {
  const source = SOURCES[row.source];
  const member = source.members?.[row.from];
  const fileName = member ? member.archive : row.from;
  const rec = source.files[fileName];
  if (!rec) throw new Error(`${row.id}: ${fileName} is not recorded in SOURCES.${row.source}`);
  const p = path.join(srcDir, source.dir, fileName);
  if (!verified.has(p)) {
    const buf = fs.readFileSync(p);
    if (buf.length !== rec.bytes || sha256(buf) !== rec.sha256) throw new Error(`${row.id}: original ${fileName} does not match its recorded sha256`);
    verified.add(p);
  }
  if (!member) return p;
  const dir = path.join(tmp, `x-${row.source}`);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, row.from);
  if (!fs.existsSync(out)) execFileSync('unzip', ['-j', '-o', '-q', p, row.from, '-d', dir], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (sha256(fs.readFileSync(out)) !== member.sha256) throw new Error(`${row.id}: archive member ${row.from} does not match its recorded sha256`);
  return out;
}

const sipsArgs = (row, v) => [...(row.grey === 'luma' ? ['-m', GREY_PROFILE] : []), '-Z', String(v.size), '-s', 'format', 'jpeg', '-s', 'formatOptions', String(v.quality)];
function sipsJpeg(row, v, src, dst) {
  execFileSync('sips', [...sipsArgs(row, v), src, '--out', dst], { stdio: ['ignore', 'ignore', 'inherit'] });
}
/** grey 'value': the original decoded (sips to PNG, the lane's PNG reader), each pixel's strongest channel kept, written as a
 * grey PNG at the original's size; the JPEG encodes start from that file. Deterministic: no resampling, no rounding. */
function valueGrey(src, tmp) {
  const full = path.join(tmp, `value-in-${path.basename(src)}.png`);
  const out = path.join(tmp, `value-${path.basename(src)}.png`);
  if (fs.existsSync(out)) return out;
  execFileSync('sips', ['-s', 'format', 'png', src, '--out', full], { stdio: ['ignore', 'ignore', 'inherit'] });
  const { width, height, data } = decodePng(fs.readFileSync(full));
  const grey = new Uint8Array(width * height);
  for (let i = 0; i < grey.length; i += 1) grey[i] = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  fs.writeFileSync(out, encodePng(width, height, 1, grey, { level: 1 }));
  fs.rmSync(full, { force: true });
  return out;
}

/** Mean of a shipped image: sRGB bytes per channel and the mean of the linearised values (what a tint multiplies). */
function meanColour(file, tmp) {
  const png = path.join(tmp, `mean-${path.basename(file)}.png`);
  execFileSync('sips', ['-Z', '256', '-s', 'format', 'png', file, '--out', png], { stdio: ['ignore', 'ignore', 'inherit'] });
  const { width, height, data } = decodePng(fs.readFileSync(png));
  const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const s = [0, 0, 0], l = [0, 0, 0];
  for (let i = 0; i < width * height; i += 1) for (let k = 0; k < 3; k += 1) { s[k] += data[i * 4 + k]; l[k] += lin(data[i * 4 + k]); }
  const n = width * height;
  return { meanBytes: s.map((v) => +(v / n).toFixed(1)), meanLinear: l.map((v) => +(v / n).toFixed(4)) };
}

const processingText = (row, v) => `${row.grey === 'luma' ? 'Converted to neutral grey (sips -m, the system\'s "Generic Gray Gamma 2.2" profile), resampled' : row.grey === 'value' ? 'Made neutral (each pixel\'s strongest channel, computed on the decoded original by web/tools/club/asset-arena.mjs), resampled' : 'Resampled'} to fit ${v.size} px and re-encoded as JPEG: sips ${row.grey === 'luma' ? '-m <grey profile> ' : ''}-Z ${v.size} -s format jpeg -s formatOptions ${v.quality}.${SOURCES[row.source].members ? ' The original is one image member of the downloaded archive; nothing else from the archive is used.' : ''}`;
const tileText = (t) => (Array.isArray(t) ? `${t[0]} x ${t[1]} m` : `${t} m`);

function fileRecord(row, variant, v, buf, mean) {
  const source = SOURCES[row.source];
  const member = source.members?.[row.from];
  const rec = source.files[member ? member.archive : row.from];
  const info = jpegInfo(buf);
  return {
    file: v.file,
    id: row.id,
    variant,
    bytes: buf.length,
    sha256: sha256(buf),
    width: info.width,
    height: info.height,
    format: info.format,
    colorSpace: row.colorSpace,
    provider: source.provider,
    asset: source.assetId,
    assetPage: source.page,
    sourceUrl: rec.url,
    ...(member ? { archiveMember: row.from, archiveMemberSha256: member.sha256 } : {}),
    authors: source.authors,
    licence: source.licence,
    licenceEvidence: source.licenceEvidence,
    licenceStatement: source.licenceStatement,
    downloaded: rec.downloaded,
    originalBytes: rec.bytes,
    originalSha256: rec.sha256,
    processing: processingText(row, v),
    tileMetres: source.tileMetres,
    ...(mean ? { meanBytes: mean.meanBytes, meanLinear: mean.meanLinear } : {}),
    notes: row.notes,
  };
}

const heading = (f) => `### \`${f.file}\` (${f.id}${f.variant === 'high' ? ', high tier' : ''})`;
function sectionBody(f) {
  const L = [];
  L.push(`- shipped: ${f.width} x ${f.height} ${f.format.toUpperCase()}, ${f.bytes} bytes, ${f.colorSpace === 'srgb' ? 'sRGB colour' : 'linear data'}, sha256 \`${f.sha256}\`${f.variant === 'high' ? ' (the high tier\'s file: requested only with the high tier selected, never precached)' : ''}`);
  L.push(`- original: ${f.sourceUrl}${f.archiveMember ? ` (archive member \`${f.archiveMember}\`, sha256 \`${f.archiveMemberSha256}\`)` : ''}`);
  L.push(`- original sha256 \`${f.originalSha256}\` (${f.originalBytes} bytes), downloaded ${f.downloaded}`);
  L.push(`- asset page: ${f.assetPage}; author(s): ${f.authors.join(', ')}; licence: ${f.licence} (the asset page: "${f.licenceStatement}")`);
  L.push(`- processing: ${f.processing}`);
  L.push(`- notes: ${f.notes}${f.tileMetres ? ` One repeat covers ${tileText(f.tileMetres)} in the source.` : ''}${f.meanBytes ? ` Mean of the shipped file: ${f.meanBytes.join(', ')} of 255 (linear ${f.meanLinear.join(', ')}).` : ''}`);
  return L.join('\n');
}
// the same section rule as the bake tool's: a heading, a blank line, the body, up to the next `### ` heading
function replaceSection(md, head, body) {
  const start = md.indexOf(`${head}\n`);
  if (start < 0) return `${md.replace(/\n*$/, '\n')}\n${head}\n\n${body}\n`;
  const rest = md.indexOf('\n### ', start + head.length);
  return `${md.slice(0, start)}${head}\n\n${body}\n${rest < 0 ? '' : md.slice(rest)}`;
}
function sourceRow(s) { return `| ${s.name} (\`${s.assetId}\`) | ${s.provider} | ${s.page} | ${s.authors.join(', ')} | ${s.licence} | ${s.published} |`; }
/** CREDITS.md with this tool's source rows, header lines and file sections brought up to date; every other line as it is. */
function mergeMarkdown(md, credits, mine) {
  let out = md;
  // the Sources table: a row per arena source, after the table's last row
  const lines = out.split('\n');
  const at = lines.indexOf('## Sources');
  if (at >= 0) {
    let last = -1;
    for (let i = at + 1; i < lines.length; i += 1) { if (lines[i].startsWith('|')) last = i; else if (last >= 0) break; }
    const used = [...new Set(mine.map((f) => f.asset))].map((id) => Object.values(SOURCES).find((s) => s.assetId === id));
    const add = used.filter((s) => !lines.some((l) => l.startsWith(`| ${s.name} (\`${s.assetId}\`) |`))).map(sourceRow);
    for (const s of used) { const i = lines.findIndex((l) => l.startsWith(`| ${s.name} (\`${s.assetId}\`) |`)); if (i >= 0) lines[i] = sourceRow(s); }
    if (last >= 0 && add.length) lines.splice(last + 1, 0, ...add);
    out = lines.join('\n');
  }
  // the two header lines that state who writes the file and what is shipped
  const def = credits.files, high = credits.highFiles ?? [];
  const side = (list) => Math.max(0, ...list.map((f) => Math.max(f.width ?? 0, f.height ?? 0)));
  out = out.replace(/^Generated by .*$/m, 'Written by `web/tools/club/asset-build.mjs` (the club venue\'s rows), `web/tools/club/asset-arena.mjs` (the arena venue\'s rows) and `web/tools/club/bake-room.mjs` (the baked light files); do not edit by hand.');
  out = out.replace(/^Shipped set: .*$/m, `Shipped set: ${def.length} files, ${def.reduce((n, f) => n + f.bytes, 0)} bytes (cap ${credits.budget?.maxTotalBytes ?? 12000000}); largest side ${side(def)} px (cap ${credits.budget?.maxSide ?? 2048}). The high tier's pack (\`high/\`: requested only with the desktop high tier selected, never precached, counted apart): ${high.length} files, ${high.reduce((n, f) => n + f.bytes, 0)} bytes; largest side ${side(high)} px.`);
  for (const f of mine) out = replaceSection(out, heading(f), sectionBody(f));
  return out;
}

/** Re-read the three shared files and write this tool's rows into them (one synchronous step per file). */
function mergeRows(outDir, built) {
  const ids = new Set(ROWS.map((r) => r.id));
  const readCanonical = (name) => {
    const text = fs.readFileSync(path.join(outDir, name), 'utf8');
    const obj = JSON.parse(text);
    if (canonical(obj) !== text) throw new Error(`${name} is not in the canonical form (two-space JSON and a final newline): not written, so that no other row changes`);
    return obj;
  };
  // manifest.json: this tool's ids only
  const manifest = readCanonical('manifest.json');
  for (const b of built) {
    manifest[b.row.id] = { file: b.def.file, ...(b.high ? { high: { file: b.high.file, bytes: b.high.bytes, sha256: b.high.sha256 } } : {}), bytes: b.def.bytes, sha256: b.def.sha256 };
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), canonical(manifest));
  // credits.json: `files` holds the default tier (as before), `highFiles` the high tier's pack; the totals are sums
  const credits = readCanonical('credits.json');
  if (!Array.isArray(credits.files)) throw new Error('credits.json has no "files" array');
  const put = (list, rec) => { const i = list.findIndex((f) => f.file === rec.file); if (i >= 0) list[i] = rec; else list.push(rec); };
  const highFiles = Array.isArray(credits.highFiles) ? credits.highFiles : [];
  for (const b of built) { put(credits.files, b.def); if (b.high) put(highFiles, b.high); }
  const next = {};
  for (const [k, v] of Object.entries(credits)) {
    if (k === 'files') { next.highTotalBytes = highFiles.reduce((n, f) => n + f.bytes, 0); next.files = v; next.highFiles = highFiles; } else if (k !== 'highFiles' && k !== 'highTotalBytes') next[k] = v;
  }
  if (Number.isFinite(next.totalBytes)) next.totalBytes = next.files.reduce((n, f) => n + f.bytes, 0);
  if (Number.isFinite(next.fullTierBytes)) next.fullTierBytes = next.files.filter((f) => f.variant !== 'lite').reduce((n, f) => n + f.bytes, 0);
  fs.writeFileSync(path.join(outDir, 'credits.json'), canonical(next));
  // CREDITS.md: this tool's sections, source rows and the two header lines
  const mdPath = path.join(outDir, 'CREDITS.md');
  const mine = [...next.files, ...next.highFiles].filter((f) => ids.has(f.id));
  fs.writeFileSync(mdPath, mergeMarkdown(fs.readFileSync(mdPath, 'utf8'), next, mine));
}

function build(opt) {
  if (!opt.src) throw new Error('build needs --src <originals dir> (or CLUB_ARENA_ASSETS_SRC)');
  const srcDir = path.resolve(opt.src);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'club-arena-assets-'));
  const verified = new Set();
  const built = [];
  fs.mkdirSync(path.join(opt.out, 'high'), { recursive: true });
  try {
    for (const row of ROWS) {
      if (opt.only && !opt.only.has(row.id)) continue;
      const orig = original(row, srcDir, tmp, verified);
      const from = row.grey === 'value' ? valueGrey(orig, tmp) : orig;
      const b = { row, def: null, high: null };
      for (const [variant, v] of [['full', row.def], ...(row.high ? [['high', row.high]] : [])]) {
        const t = path.join(tmp, path.basename(`${variant}-${v.file}`));
        sipsJpeg(row, v, from, t);
        const dst = path.join(opt.out, v.file);
        const buf = fs.readFileSync(t);
        // an unchanged file is left alone (its bytes and its time stamp stay)
        if (!fs.existsSync(dst) || sha256(fs.readFileSync(dst)) !== sha256(buf)) fs.copyFileSync(t, dst);
        const mean = variant === 'full' && row.colorSpace === 'srgb' ? meanColour(dst, tmp) : null;
        const rec = fileRecord(row, variant, v, buf, mean);
        if (variant === 'full') b.def = rec; else b.high = rec;
        console.log(`built ${v.file.padEnd(34)} ${String(rec.width).padStart(4)} x ${String(rec.height).padEnd(4)} ${String(rec.bytes).padStart(9)} bytes${mean ? `  mean ${mean.meanBytes.join(',')}` : ''}`);
      }
      built.push(b);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  mergeRows(opt.out, built);
  return check(opt);
}

/** Verifies the arena rows: files, manifest rows, credits rows, sizes, sources. Returns the number of problems. */
export function check(opt) {
  const problems = [];
  const bad = (m) => problems.push(m);
  const read = (name) => fs.readFileSync(path.join(opt.out, name));
  let manifest = {}; let credits = { files: [] };
  try { manifest = JSON.parse(read('manifest.json')); } catch (e) { bad(`manifest.json: ${e.message}`); }
  try { credits = JSON.parse(read('credits.json')); } catch (e) { bad(`credits.json: ${e.message}`); }
  const def = new Map((credits.files ?? []).map((f) => [f.file, f]));
  const high = new Map((credits.highFiles ?? []).map((f) => [f.file, f]));
  let defBytes = 0, highBytes = 0, gpuHigh = 0, files = 0;
  const pending = [];
  for (const row of ROWS) {
    const m = manifest[row.id];
    if (!m) { pending.push(row.id); continue; }
    if (m.file !== row.def.file) bad(`${row.id}: the manifest names ${m.file}, the table ${row.def.file}`);
    if ((m.high?.file ?? null) !== (row.high?.file ?? null)) bad(`${row.id}: the manifest's high file is ${m.high?.file ?? 'none'}, the table's ${row.high?.file ?? 'none'}`);
    for (const [variant, v, c, mrow] of [['full', row.def, def.get(row.def.file), m], ...(row.high ? [['high', row.high, high.get(row.high.file), m.high ?? {}]] : [])]) {
      let buf;
      try { buf = read(v.file); } catch { bad(`${row.id}: ${v.file} is missing`); continue; }
      files += 1;
      if (variant === 'high') highBytes += buf.length; else defBytes += buf.length;
      if (!c) { bad(`${v.file}: no credits row`); continue; }
      let info;
      try { info = jpegInfo(buf); } catch (e) { bad(`${v.file}: ${e.message}`); continue; }
      const cap = variant === 'high' ? (row.hero ? HERO_MAX_SIDE : HIGH_MAX_SIDE) : DEFAULT_MAX_SIDE;
      if (Math.max(info.width, info.height) > cap) bad(`${v.file}: ${info.width} x ${info.height} exceeds ${cap} px`);
      if (variant === 'high') { gpuHigh += Math.round(info.width * info.height * 4 * 4 / 3); if (!HIGH_FILE.test(v.file)) bad(`${v.file}: a high-tier file is a .jpg under high/`); }
      if (c.id !== row.id || c.variant !== variant) bad(`${v.file}: credits id or variant mismatch`);
      if (c.bytes !== buf.length || c.sha256 !== sha256(buf)) bad(`${v.file}: bytes or sha256 differ from credits.json`);
      if (mrow.bytes !== buf.length || mrow.sha256 !== c.sha256) bad(`${v.file}: bytes or sha256 differ from manifest.json`);
      if (c.width !== info.width || c.height !== info.height) bad(`${v.file}: recorded size differs from the file`);
      if (c.licence !== CC0) bad(`${v.file}: licence ${c.licence}`);
      for (const k of ['sourceUrl', 'assetPage', 'authors', 'licence', 'licenceEvidence', 'licenceStatement', 'downloaded', 'originalSha256', 'processing']) {
        if (c[k] == null || c[k].length === 0) bad(`${v.file}: credits field ${k} is empty`);
      }
      if (!SOURCE_URL.test(c.sourceUrl || '')) bad(`${v.file}: source URL is not Poly Haven or ambientCG`);
      if (!/^[0-9a-f]{64}$/.test(c.originalSha256 || '')) bad(`${v.file}: originalSha256 is not a sha256`);
      if (c.processing !== processingText(row, v)) bad(`${v.file}: the credits' processing text is not the table's`);
    }
  }
  if (Number.isFinite(credits.highTotalBytes) && credits.highTotalBytes !== (credits.highFiles ?? []).reduce((n, f) => n + f.bytes, 0)) bad('credits.highTotalBytes is not the sum of its rows');
  try {
    const md = read('CREDITS.md').toString('utf8');
    const mine = [...(credits.files ?? []), ...(credits.highFiles ?? [])].filter((f) => ROWS.some((r) => r.id === f.id));
    if (mergeMarkdown(md, credits, mine) !== md) bad('CREDITS.md: the arena sections, source rows or header lines are not what credits.json gives');
  } catch (e) { bad(`CREDITS.md: ${e.message}`); }
  if (opt.src) {
    for (const [key, s] of Object.entries(SOURCES)) {
      for (const [name, rec] of Object.entries(s.files)) {
        const p = path.join(path.resolve(opt.src), s.dir, name);
        if (!fs.existsSync(p)) { bad(`original ${key}/${name} is missing under --src`); continue; }
        const buf = fs.readFileSync(p);
        if (buf.length !== rec.bytes || sha256(buf) !== rec.sha256) bad(`original ${key}/${name} differs from its recorded sha256`);
      }
    }
  }
  for (const p of problems) console.error(`FAIL ${p}`);
  console.log(`asset-arena check: ${files} files of ${ROWS.length} ids; default tier ${defBytes} bytes, high pack ${highBytes} bytes (GPU with mips ${gpuHigh} bytes), ${problems.length} problem(s)${pending.length ? `, pending: ${pending.join(' ')}` : ''}${opt.src ? ', originals verified' : ''}`);
  return problems.length;
}

/** One line per id for the roles that put the maps on surfaces. */
function ready(opt) {
  const credits = JSON.parse(fs.readFileSync(path.join(opt.out, 'credits.json'), 'utf8'));
  const all = [...(credits.files ?? []), ...(credits.highFiles ?? [])];
  for (const row of ROWS) {
    const d = all.find((f) => f.file === row.def.file), h = row.high ? all.find((f) => f.file === row.high.file) : null;
    if (!d) { console.log(`${row.id}: pending`); continue; }
    console.log(`${row.id}: default ${d.file} ${d.width} x ${d.height} (${d.bytes} bytes)${h ? `; high ${h.file} ${h.width} x ${h.height} (${h.bytes} bytes)` : ''}; one tile = ${d.tileMetres ? tileText(d.tileMetres) : 'not stated'}${d.meanBytes ? `; mean ${d.meanBytes.join(', ')} of 255, linear ${d.meanLinear.join(', ')}` : ''}; ${d.colorSpace}`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opt = parseArgs(process.argv.slice(2));
  const n = opt.ready ? ready(opt) : opt.check ? check(opt) : build(opt);
  process.exit(n ? 1 : 0);
}
