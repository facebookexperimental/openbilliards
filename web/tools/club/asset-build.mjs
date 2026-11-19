// Copyright (c) Meta Platforms, Inc. and affiliates.

// asset-build.mjs — builds and checks the shipped texture set of the `club` look (node, no packages; `sips` and `unzip` are
// macOS system tools).
//
//   node web/tools/club/asset-build.mjs --src <originals dir>            rebuild every file, manifest.json, credits.json, CREDITS.md
//   node web/tools/club/asset-build.mjs --check [--src <originals dir>]  verify the shipped set (no encoder is run)
//   options: --out <dir> (default web/assets/club)
//            --only <id,id,...>  build: re-encode only these ids; other ids keep their files, and an id with no file yet is
//                                left out of the manifest (staged delivery: consumers fall back until it appears)
//            --complete          check: every row of the table must be present (the default allows a staged, partial set)
//
// The originals are never committed: they live outside the repo, one directory per source asset, exactly as downloaded
// (SOURCES below records URL, bytes and sha256 of each; a build refuses an original whose sha256 differs).
// Everything written is a pure function of the originals, the two tables below and the encoder (`sips`, recorded in
// credits.json): no timestamps, fixed key order, so a rebuild on the same macOS release is byte-identical and `--check` proves a
// tree against its own manifest and credits.
//
// Rules enforced here (the looks' asset ruling): CC0 sources only, each side <= 2048 px, JPEG or PNG, the whole set <= 12 MB.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hdrToRgbePng } from './asset-hdr-to-rgbe-png.mjs';

export const MAX_SIDE = 2048;
export const MAX_TOTAL_BYTES = 12 * 1000 * 1000; // the ruling's 12 MB, read as decimal megabytes (the stricter reading)
export const PLAN_TOTAL_BYTES = 10.9 * 1000 * 1000; // PLAN-R0 section 7 total for the whole look
const CC0 = 'CC0-1.0';
const PH_LICENCE = 'https://polyhaven.com/license (site-wide: every asset is CC0; the asset API carries no per-asset licence field)';
const ACG_LICENCE = 'https://docs.ambientcg.com/license/ (site-wide: every asset is CC0 1.0 Universal; the asset API carries no per-asset licence field)';
const PH_TEX = 'https://dl.polyhaven.org/file/ph-assets/Textures';

// One entry per source asset. `dir` is its directory under --src. `files` are the originals exactly as downloaded.
// `tileMetres` is the real-world size of one texture repeat as stated by the source (null where the source gives none).
export const SOURCES = {
  wood_floor: {
    provider: 'Poly Haven', assetId: 'wood_floor', name: 'Wood Floor', page: 'https://polyhaven.com/a/wood_floor',
    authors: ['Dimitrios Savva'], licence: CC0, licenceEvidence: PH_LICENCE, published: '2023-10-24', tileMetres: 1.7,
    dir: 'wood_floor',
    files: {
      'wood_floor_diff_2k.jpg': { url: `${PH_TEX}/jpg/2k/wood_floor/wood_floor_diff_2k.jpg`, bytes: 2983667, sha256: '7c3ff1164c8dd0758ef2c048e9a266d28174120de01052ec40e6ca486177345c', downloaded: '2026-11-14T01:32:42Z' },
      'wood_floor_nor_gl_2k.png': { url: `${PH_TEX}/png/2k/wood_floor/wood_floor_nor_gl_2k.png`, bytes: 19399802, sha256: '2364421a19aba9392bcd0ba14617e7e91ac2869ca3fab16d83563b5250d71bc8', downloaded: '2026-11-14T01:39:13Z' },
      'wood_floor_rough_2k.jpg': { url: `${PH_TEX}/jpg/2k/wood_floor/wood_floor_rough_2k.jpg`, bytes: 2267559, sha256: '297eda0d75f2020cc541dbf242e1f5fd058053249567f49a4506fc2c5b1a172b', downloaded: '2026-11-14T01:32:42Z' },
    },
  },
  dark_wood: {
    provider: 'Poly Haven', assetId: 'dark_wood', name: 'Dark Wood', page: 'https://polyhaven.com/a/dark_wood',
    authors: ['Dario Barresi', 'Dimitrios Savva', 'Rico Cilliers'], licence: CC0, licenceEvidence: PH_LICENCE, published: '2022-12-15', tileMetres: 2.0,
    dir: 'dark_wood',
    files: {
      'dark_wood_diff_2k.jpg': { url: `${PH_TEX}/jpg/2k/dark_wood/dark_wood_diff_2k.jpg`, bytes: 2894186, sha256: 'ff811f97ab46f1148f2753451fd9d64abf0ab9101e85922ed9f45fc3595a3cf2', downloaded: '2026-11-14T01:39:14Z' },
      'dark_wood_nor_gl_2k.png': { url: `${PH_TEX}/png/2k/dark_wood/dark_wood_nor_gl_2k.png`, bytes: 18635244, sha256: '5607cf76d8da2844ee285fbabdc79976e18240e13efe6927a368c8cb06bf9148', downloaded: '2026-11-14T01:39:14Z' },
      'dark_wood_rough_2k.jpg': { url: `${PH_TEX}/jpg/2k/dark_wood/dark_wood_rough_2k.jpg`, bytes: 2325418, sha256: '09eb42a24aeadcd5dd04d19f89d8df4116fd9cdbd405d0dab17e263b54ece133', downloaded: '2026-11-14T01:39:14Z' },
    },
  },
  beige_wall_001: {
    provider: 'Poly Haven', assetId: 'beige_wall_001', name: 'Beige Wall 001', page: 'https://polyhaven.com/a/beige_wall_001',
    authors: ['Dimitrios Savva', 'Rico Cilliers'], licence: CC0, licenceEvidence: PH_LICENCE, published: '2021-07-20', tileMetres: 3.0,
    dir: 'beige_wall_001',
    files: {
      'beige_wall_001_nor_gl_2k.jpg': { url: `${PH_TEX}/jpg/2k/beige_wall_001/beige_wall_001_nor_gl_2k.jpg`, bytes: 815507, sha256: '7f5cbecd6766f44034f3b78b4addb1559e12bdd5a77501bd418a736609e7cedc', downloaded: '2026-11-14T01:39:14Z' },
      'beige_wall_001_rough_2k.jpg': { url: `${PH_TEX}/jpg/2k/beige_wall_001/beige_wall_001_rough_2k.jpg`, bytes: 656368, sha256: 'a76e2307d8ec47d1be1d4710851fc4545db7aecfa176333738a6756358b64767', downloaded: '2026-11-14T01:39:14Z' },
    },
  },
  leather_red_02: {
    provider: 'Poly Haven', assetId: 'leather_red_02', name: 'Leather Red 02', page: 'https://polyhaven.com/a/leather_red_02',
    authors: ['Rob Tuytel'], licence: CC0, licenceEvidence: PH_LICENCE, published: '2020-06-18', tileMetres: 0.6,
    dir: 'leather_red_02',
    files: {
      'leather_red_02_coll1_2k.jpg': { url: `${PH_TEX}/jpg/2k/leather_red_02/leather_red_02_coll1_2k.jpg`, bytes: 4160234, sha256: 'a900630e541991b7ee63aab820f425610fbf2db32f7ae6c63b6ef4fc2325ab60', downloaded: '2026-11-14T01:39:14Z' },
      'leather_red_02_nor_gl_2k.jpg': { url: `${PH_TEX}/jpg/2k/leather_red_02/leather_red_02_nor_gl_2k.jpg`, bytes: 4324549, sha256: 'be8e0525fe6cc7d0215d4fc81f2761a2f8485f85baad3bcd4b9bcdeb843ea925', downloaded: '2026-11-14T01:39:15Z' },
      'leather_red_02_rough_2k.jpg': { url: `${PH_TEX}/jpg/2k/leather_red_02/leather_red_02_rough_2k.jpg`, bytes: 3529399, sha256: '0dd604b493aef28488a7f8a4c86846c1ec7313c16bd5198a9deec8a7f880b43d', downloaded: '2026-11-14T01:39:15Z' },
    },
  },
  rosewood_veneer1: {
    provider: 'Poly Haven', assetId: 'rosewood_veneer1', name: 'Rosewood Veneer1', page: 'https://polyhaven.com/a/rosewood_veneer1',
    authors: ['Jenelle van Heerden'], licence: CC0, licenceEvidence: PH_LICENCE, published: '2024-03-28', tileMetres: 2.43,
    dir: 'rosewood_veneer1',
    files: {
      'rosewood_veneer1_diff_2k.jpg': { url: `${PH_TEX}/jpg/2k/rosewood_veneer1/rosewood_veneer1_diff_2k.jpg`, bytes: 3294736, sha256: '4aae1766165d5058ae0311d94d53fb0d5c7cb55d3314916e801b9505cf34ed8e', downloaded: '2026-11-14T01:39:15Z' },
      'rosewood_veneer1_nor_gl_2k.jpg': { url: `${PH_TEX}/jpg/2k/rosewood_veneer1/rosewood_veneer1_nor_gl_2k.jpg`, bytes: 1569067, sha256: '9ae97e960494ffc5cd948ad89225f694a4624a228418f107bd7145d020dd728d', downloaded: '2026-11-14T01:39:15Z' },
    },
  },
  terlenka: {
    provider: 'Poly Haven', assetId: 'terlenka', name: 'Terlenka', page: 'https://polyhaven.com/a/terlenka',
    authors: ['colormass', 'Rico Cilliers'], licence: CC0, licenceEvidence: PH_LICENCE, published: '2025-09-05', tileMetres: 0.266,
    dir: 'terlenka',
    files: {
      'terlenka_nor_gl_2k.jpg': { url: `${PH_TEX}/jpg/2k/terlenka/terlenka_nor_gl_2k.jpg`, bytes: 4113359, sha256: '7fd916e6d897dfe003dac3400c81dd919e11e3441558bac04c26e07be380e6a0', downloaded: '2026-11-14T01:39:15Z' },
    },
  },
  metal009: {
    provider: 'ambientCG', assetId: 'Metal009', name: 'Metal 009', page: 'https://ambientcg.com/a/Metal009',
    authors: ['ambientCG'], licence: CC0, licenceEvidence: ACG_LICENCE, published: '2018-08-16', tileMetres: null,
    dir: 'acg_Metal009',
    files: {
      'Metal009_2K-JPG.zip': { url: 'https://ambientcg.com/get?file=Metal009_2K-JPG.zip', bytes: 16660145, sha256: '6f79f53d5073e65707c5765316fa9257f4604e1790093be5a51ed8226761a7f0', downloaded: '2026-11-14T01:39:16Z' },
    },
    // Only these two image members are ever extracted; the archive's other members (material and scene description files) are not used.
    members: {
      'Metal009_2K-JPG_NormalGL.jpg': { archive: 'Metal009_2K-JPG.zip', sha256: '8773d9e97a4b057ced3e538d8ecc6069d27c8948191d61daf79b9ad93d93e3b3' },
      'Metal009_2K-JPG_Roughness.jpg': { archive: 'Metal009_2K-JPG.zip', sha256: 'e802f013b93cb1bd4b55cd91f02a1863233475a7f8bd0e6755cfaa447a729674' },
    },
  },
  warm_bar: {
    provider: 'Poly Haven', assetId: 'warm_bar', name: 'Warm Bar', page: 'https://polyhaven.com/a/warm_bar',
    authors: ['Greg Zaal', 'Jarod Guest'], licence: CC0, licenceEvidence: PH_LICENCE, published: '2024-10-14', tileMetres: null,
    dir: 'warm_bar',
    files: {
      'warm_bar_1k.hdr': { url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/warm_bar_1k.hdr', bytes: 1487340, sha256: '610f4496687a175cca1d993f01931c1a0c42e81ad8878d3ada6363b2334c5555', downloaded: '2026-11-14T01:39:15Z' },
    },
  },
};

// One row per manifest id, in delivery priority order. kind 'jpeg': `sips -Z <size> -s format jpeg -s formatOptions <quality>`.
// `lite` adds the 1024 px variant the lite tier loads. colorSpace: 'srgb' for colour maps, 'linear' for data maps.
export const ROWS = [
  { id: 'floor.color', source: 'wood_floor', from: 'wood_floor_diff_2k.jpg', file: 'floor-color.jpg', size: 2048, quality: 55, lite: { file: 'floor-color-1024.jpg', size: 1024, quality: 60 }, colorSpace: 'srgb', notes: 'Smoked-oak planks, 9 boards across one repeat, boards run along V (image vertical).' },
  { id: 'floor.normal', source: 'wood_floor', from: 'wood_floor_nor_gl_2k.png', file: 'floor-normal.jpg', size: 2048, quality: 88, lite: { file: 'floor-normal-1024.jpg', size: 1024, quality: 90 }, colorSpace: 'linear', notes: 'OpenGL convention (+Y up), from the lossless PNG original.' },
  { id: 'floor.rough', source: 'wood_floor', from: 'wood_floor_rough_2k.jpg', file: 'floor-rough.jpg', size: 1024, quality: 60, colorSpace: 'linear', notes: 'Roughness, single channel (grey JPEG).' },
  { id: 'wood_dark.color', source: 'dark_wood', from: 'dark_wood_diff_2k.jpg', file: 'wood-dark-color.jpg', size: 2048, quality: 55, lite: { file: 'wood-dark-color-1024.jpg', size: 1024, quality: 60 }, colorSpace: 'srgb', notes: 'Dark red-brown mahogany-type cabinet wood, grain runs along U (image horizontal).' },
  { id: 'wood_dark.normal', source: 'dark_wood', from: 'dark_wood_nor_gl_2k.png', file: 'wood-dark-normal.jpg', size: 1024, quality: 90, colorSpace: 'linear', notes: 'OpenGL convention (+Y up), from the lossless PNG original.' },
  { id: 'wood_dark.rough', source: 'dark_wood', from: 'dark_wood_rough_2k.jpg', file: 'wood-dark-rough.jpg', size: 1024, quality: 50, colorSpace: 'linear', notes: 'Roughness.' },
  { id: 'wall.normal', source: 'beige_wall_001', from: 'beige_wall_001_nor_gl_2k.jpg', file: 'wall-normal.jpg', size: 1024, quality: 75, colorSpace: 'linear', notes: 'Smooth painted plaster, low relief; OpenGL convention (+Y up).' },
  { id: 'wall.rough', source: 'beige_wall_001', from: 'beige_wall_001_rough_2k.jpg', file: 'wall-rough.jpg', size: 512, quality: 60, colorSpace: 'linear', notes: 'Roughness.' },
  { id: 'leather.color', source: 'leather_red_02', from: 'leather_red_02_coll1_2k.jpg', file: 'leather-color.jpg', size: 1024, quality: 50, colorSpace: 'srgb', notes: 'Dark brown pebbled upholstery leather (the source asset\'s colour variant 1).' },
  { id: 'leather.normal', source: 'leather_red_02', from: 'leather_red_02_nor_gl_2k.jpg', file: 'leather-normal.jpg', size: 1024, quality: 60, colorSpace: 'linear', notes: 'OpenGL convention (+Y up).' },
  { id: 'leather.rough', source: 'leather_red_02', from: 'leather_red_02_rough_2k.jpg', file: 'leather-rough.jpg', size: 512, quality: 60, colorSpace: 'linear', notes: 'Roughness.' },
  { id: 'veneer.color', source: 'rosewood_veneer1', from: 'rosewood_veneer1_diff_2k.jpg', file: 'veneer-color.jpg', size: 2048, quality: 55, lite: { file: 'veneer-color-1024.jpg', size: 1024, quality: 60 }, colorSpace: 'srgb', notes: 'Figured rosewood veneer, book-matched columns, grain runs along V (image vertical).' },
  { id: 'veneer.normal', source: 'rosewood_veneer1', from: 'rosewood_veneer1_nor_gl_2k.jpg', file: 'veneer-normal.jpg', size: 1024, quality: 95, colorSpace: 'linear', notes: 'OpenGL convention (+Y up).' },
  { id: 'felt.normal', source: 'terlenka', from: 'terlenka_nor_gl_2k.jpg', file: 'felt-normal.jpg', size: 1024, quality: 90, colorSpace: 'linear', notes: 'Fine twill weave, low relief, for small-scale tiling on the cloth; OpenGL convention (+Y up).' },
  { id: 'metal.normal', source: 'metal009', from: 'Metal009_2K-JPG_NormalGL.jpg', file: 'metal-normal.jpg', size: 1024, quality: 90, colorSpace: 'linear', notes: 'Brushed metal, brush lines run along U (image horizontal); OpenGL convention (+Y up). A procedural CC0 material, not a scan.' },
  { id: 'metal.rough', source: 'metal009', from: 'Metal009_2K-JPG_Roughness.jpg', file: 'metal-rough.jpg', size: 1024, quality: 60, colorSpace: 'linear', notes: 'Roughness with brush streaks.' },
  { id: 'hdri.room', source: 'warm_bar', from: 'warm_bar_1k.hdr', file: 'hdri-room.png', kind: 'rgbe-png', colorSpace: 'linear', notes: 'Equirectangular interior (a warm bar at night), RGBE bytes in an RGBA PNG: linear RGB = (R, G, B) * 2^(A - 128) / 255; row 0 is the zenith. Alpha is data: decode before any filtering, never through a 2D canvas. Every row uses PNG filter type 1 (see asset-hdr-to-rgbe-png.mjs).' },
];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.resolve(HERE, '../../assets/club');
const GENERATED = ['manifest.json', 'credits.json', 'CREDITS.md'];

/** Pixel size of a JPEG or PNG from its header. */
export function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), channels: { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[buf[25]] };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length && buf[o] === 0xff) {
      const m = buf[o + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        const n = buf[o + 9];
        const sampling = [];
        for (let i = 0; i < n; i += 1) sampling.push(`${buf[o + 11 + i * 3] >> 4}x${buf[o + 11 + i * 3] & 15}`);
        return { format: 'jpeg', width: buf.readUInt16BE(o + 7), height: buf.readUInt16BE(o + 5), channels: n, sampling: sampling.join(',') };
      }
      o += 2 + buf.readUInt16BE(o + 2);
    }
  }
  throw new Error('imageSize: not a JPEG or PNG');
}

function parseArgs(argv) {
  const opt = { src: process.env.CLUB_ASSETS_SRC || null, out: DEFAULT_OUT, check: false, only: null, complete: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--src') opt.src = argv[++i];
    else if (a === '--out') opt.out = path.resolve(argv[++i]);
    else if (a === '--check') opt.check = true;
    else if (a === '--complete') opt.complete = true;
    else if (a === '--only') opt.only = new Set(argv[++i].split(','));
    else throw new Error(`unknown argument ${a}`);
  }
  return opt;
}

/** Path of a row's original (extracting an archive member into tmp when needed), with its sha256 verified against SOURCES. */
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
  if (!member) return { path: p, rec, member: null };
  const dir = path.join(tmp, `x-${row.source}`);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, row.from);
  if (!fs.existsSync(out)) execFileSync('unzip', ['-j', '-o', '-q', p, row.from, '-d', dir], { stdio: ['ignore', 'ignore', 'inherit'] });
  if (sha256(fs.readFileSync(out)) !== member.sha256) throw new Error(`${row.id}: archive member ${row.from} does not match its recorded sha256`);
  return { path: out, rec, member: { name: row.from, sha256: member.sha256 } };
}

function sipsJpeg(src, dst, size, quality) {
  execFileSync('sips', ['-Z', String(size), '-s', 'format', 'jpeg', '-s', 'formatOptions', String(quality), src, '--out', dst], { stdio: ['ignore', 'ignore', 'inherit'] });
}

const processingText = (row, v) => (row.kind === 'rgbe-png'
  ? 'Radiance .hdr decoded (run-length RGBE) and its RGBE bytes written unchanged as an 8-bit RGBA PNG (asset-hdr-to-rgbe-png.mjs, PNG filter type 1 on every row, zlib level 9); no resize, no tone change.'
  : `Resampled to fit ${v.size} px and re-encoded as JPEG: sips -Z ${v.size} -s format jpeg -s formatOptions ${v.quality}.${SOURCES[row.source].members ? ' The original is one image member of the downloaded archive; nothing else from the archive is used.' : ''}`);

function fileRecord(row, variant, v, buf) {
  const source = SOURCES[row.source];
  const member = source.members?.[row.from];
  const rec = source.files[member ? member.archive : row.from];
  const size = imageSize(buf);
  return {
    file: v.file,
    id: row.id,
    variant,
    bytes: buf.length,
    sha256: sha256(buf),
    width: size.width,
    height: size.height,
    format: size.format,
    colorSpace: row.colorSpace,
    provider: source.provider,
    asset: source.assetId,
    assetPage: source.page,
    sourceUrl: rec.url,
    ...(member ? { archiveMember: row.from, archiveMemberSha256: member.sha256 } : {}),
    authors: source.authors,
    licence: source.licence,
    licenceEvidence: source.licenceEvidence,
    downloaded: rec.downloaded,
    originalBytes: rec.bytes,
    originalSha256: rec.sha256,
    processing: processingText(row, v),
    tileMetres: source.tileMetres,
    notes: row.notes,
  };
}

function encoderId() {
  try { return execFileSync('sips', ['--version'], { encoding: 'utf8' }).trim().split('\n')[0]; } catch { return 'sips (version unknown)'; }
}

function creditsMarkdown(credits) {
  const L = [];
  L.push('# Club look: asset credits', '');
  L.push('Every file in this directory is derived from a CC0 (public-domain dedication) original. Nothing here needs attribution;');
  L.push('this file and `credits.json` record provenance: where each original came from, who made it, its licence, when it was');
  L.push('downloaded, the sha256 of the original and of the shipped derivative, and what was done to it.');
  L.push('Generated by `web/tools/club/asset-build.mjs`; do not edit by hand.', '');
  L.push(`Shipped set: ${credits.files.length} files, ${credits.totalBytes} bytes (cap ${credits.budget.maxTotalBytes}); largest side ${Math.max(...credits.files.map((f) => Math.max(f.width, f.height)))} px (cap ${credits.budget.maxSide}).`, '');
  L.push('## Sources', '');
  L.push('| asset | provider | page | author(s) | licence | published |', '|---|---|---|---|---|---|');
  const seen = new Set();
  for (const f of credits.files) {
    if (seen.has(f.asset)) continue;
    seen.add(f.asset);
    const s = Object.values(SOURCES).find((x) => x.assetId === f.asset);
    L.push(`| ${s.name} (\`${s.assetId}\`) | ${s.provider} | ${s.page} | ${s.authors.join(', ')} | ${s.licence} | ${s.published} |`);
  }
  L.push('', 'Licence evidence:', '');
  for (const e of [...new Set(credits.files.map((f) => f.licenceEvidence))]) L.push(`- ${e}`);
  L.push('', '## Files', '');
  for (const f of credits.files) {
    L.push(`### \`${f.file}\` (${f.id}${f.variant === 'lite' ? ', lite tier' : ''})`, '');
    L.push(`- shipped: ${f.width} x ${f.height} ${f.format.toUpperCase()}, ${f.bytes} bytes, ${f.colorSpace === 'srgb' ? 'sRGB colour' : 'linear data'}, sha256 \`${f.sha256}\``);
    L.push(`- original: ${f.sourceUrl}${f.archiveMember ? ` (archive member \`${f.archiveMember}\`, sha256 \`${f.archiveMemberSha256}\`)` : ''}`);
    L.push(`- original sha256 \`${f.originalSha256}\` (${f.originalBytes} bytes), downloaded ${f.downloaded}`);
    L.push(`- asset page: ${f.assetPage}; author(s): ${f.authors.join(', ')}; licence: ${f.licence}`);
    L.push(`- processing: ${f.processing}`);
    L.push(`- notes: ${f.notes}${f.tileMetres ? ` One repeat covers ${f.tileMetres} m in the source.` : ''}`, '');
  }
  return `${L.join('\n').replace(/\n+$/, '')}\n`;
}

/** Ids in a directory's manifest that are not rows of this tool's table (the baked light files, the arena venue's rows). */
function foreignIds(outDir) {
  try { return Object.keys(JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'))).filter((id) => !ROWS.find((r) => r.id === id)); } catch { return []; }
}

function build(opt) {
  if (!opt.src) throw new Error('build needs --src <originals dir> (or CLUB_ASSETS_SRC)');
  // A build writes manifest.json, credits.json and CREDITS.md WHOLE from this table. Since round 1b the shipped directory
  // also holds rows of other tools (bake-room.mjs, asset-arena.mjs): building into it would delete them. Build into another
  // directory (--out) and compare, or add the row to the tool that owns it.
  const foreign = foreignIds(opt.out);
  if (foreign.length) throw new Error(`not built: ${opt.out} holds ${foreign.length} manifest rows of other tools (${foreign.slice(0, 4).join(', ')}…) and this tool writes its three metadata files whole; use --out <another directory>`);
  const srcDir = path.resolve(opt.src);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'club-assets-'));
  const verified = new Set();
  const files = [];
  const manifest = {};
  fs.mkdirSync(opt.out, { recursive: true });
  try {
    for (const row of ROWS) {
      const variants = row.kind === 'rgbe-png' ? [['full', { file: row.file }]] : [['full', { file: row.file, size: row.size, quality: row.quality }], ...(row.lite ? [['lite', row.lite]] : [])];
      const skip = Boolean(opt.only) && !opt.only.has(row.id);
      if (skip && !variants.every(([, v]) => fs.existsSync(path.join(opt.out, v.file)))) { console.log(`pending ${row.id}`); continue; }
      const orig = skip ? null : original(row, srcDir, tmp, verified);
      const entry = { file: row.file };
      for (const [variant, v] of variants) {
        const dst = path.join(opt.out, v.file);
        if (skip) {
          // kept as it is on disk
        } else if (row.kind === 'rgbe-png') {
          fs.writeFileSync(dst, hdrToRgbePng(fs.readFileSync(orig.path)).png);
        } else {
          const t = path.join(tmp, v.file);
          sipsJpeg(orig.path, t, v.size, v.quality);
          fs.copyFileSync(t, dst);
        }
        const buf = fs.readFileSync(dst);
        const rec = fileRecord(row, variant, v, buf);
        files.push(rec);
        if (variant === 'full') { entry.bytes = rec.bytes; entry.sha256 = rec.sha256; } else entry.lite = v.file;
        console.log(`${skip ? 'kept ' : 'built'} ${v.file.padEnd(28)} ${String(rec.width).padStart(4)} x ${String(rec.height).padEnd(4)} ${String(rec.bytes).padStart(8)} bytes`);
      }
      manifest[row.id] = { file: entry.file, ...(entry.lite ? { lite: entry.lite } : {}), bytes: entry.bytes, sha256: entry.sha256 };
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const totalBytes = files.reduce((n, f) => n + f.bytes, 0);
  const credits = {
    schema: 1,
    generatedBy: 'web/tools/club/asset-build.mjs',
    encoder: encoderId(),
    budget: { maxSide: MAX_SIDE, maxTotalBytes: MAX_TOTAL_BYTES, planTotalBytes: PLAN_TOTAL_BYTES },
    totalBytes,
    liteTierBytes: files.filter((f) => f.variant === 'lite' || !ROWS.find((r) => r.id === f.id).lite).reduce((n, f) => n + f.bytes, 0),
    fullTierBytes: files.filter((f) => f.variant === 'full').reduce((n, f) => n + f.bytes, 0),
    files,
  };
  fs.writeFileSync(path.join(opt.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(opt.out, 'credits.json'), `${JSON.stringify(credits, null, 2)}\n`);
  fs.writeFileSync(path.join(opt.out, 'CREDITS.md'), creditsMarkdown(credits));
  console.log(`total ${totalBytes} bytes in ${files.length} files (full tier ${credits.fullTierBytes}, lite tier ${credits.liteTierBytes})`);
  return check({ ...opt, complete: opt.complete || !opt.only });
}

/** Verifies the shipped directory against manifest.json, credits.json and the rules. Returns the number of problems. */
export function check(opt) {
  const problems = [];
  const bad = (m) => problems.push(m);
  const read = (name) => fs.readFileSync(path.join(opt.out, name));
  let manifest = {}; let credits = { files: [] };
  try { manifest = JSON.parse(read('manifest.json')); } catch (e) { bad(`manifest.json: ${e.message}`); }
  try { credits = JSON.parse(read('credits.json')); } catch (e) { bad(`credits.json: ${e.message}`); }
  const byFile = new Map((credits.files || []).map((f) => [f.file, f]));
  const listed = new Set();
  // Rows of other tools (the baked light files of bake-room.mjs, the arena venue's rows of asset-arena.mjs with their high
  // tier's files under high/) are not this tool's to judge: it checks the rows of its own table, and that nothing in the
  // directory is unnamed. test-club-assets.mjs judges the directory as a whole.
  const others = new Set(); // every file another tool's row names
  const foreign = new Set(Object.keys(manifest).filter((id) => !ROWS.find((r) => r.id === id)));
  for (const id of foreign) for (const n of [manifest[id]?.file, manifest[id]?.lite, manifest[id]?.high?.file]) if (typeof n === 'string') others.add(n);
  for (const [id, row] of Object.entries(manifest)) {
    if (foreign.has(id)) continue;
    const keys = Object.keys(row).sort().join(',');
    if (keys !== 'bytes,file,sha256' && keys !== 'bytes,file,lite,sha256') bad(`${id}: manifest keys are [${keys}]`);
    for (const [variant, name] of [['full', row.file], ['lite', row.lite]]) {
      if (!name) continue;
      listed.add(name);
      let buf;
      try { buf = read(name); } catch { bad(`${id}: ${name} is missing`); continue; }
      const c = byFile.get(name);
      if (!c) { bad(`${id}: ${name} has no credits entry`); continue; }
      const size = imageSize(buf);
      if (c.id !== id || c.variant !== variant) bad(`${name}: credits id/variant mismatch`);
      if (c.bytes !== buf.length || c.sha256 !== sha256(buf)) bad(`${name}: bytes or sha256 differ from credits.json`);
      if (variant === 'full' && (row.bytes !== buf.length || row.sha256 !== c.sha256)) bad(`${name}: bytes or sha256 differ from manifest.json`);
      if (size.width > MAX_SIDE || size.height > MAX_SIDE) bad(`${name}: ${size.width} x ${size.height} exceeds ${MAX_SIDE} px`);
      if (c.width !== size.width || c.height !== size.height) bad(`${name}: recorded size differs from the file`);
      if (variant === 'lite' && Math.max(size.width, size.height) > 1024) bad(`${name}: a lite variant must be <= 1024 px`);
      if (!/\.(jpg|png)$/.test(name) || size.format !== (name.endsWith('.png') ? 'png' : 'jpeg')) bad(`${name}: format is not JPEG or PNG as named`);
      if (c.licence !== CC0) bad(`${name}: licence ${c.licence}`);
      for (const k of ['sourceUrl', 'assetPage', 'authors', 'licence', 'licenceEvidence', 'downloaded', 'originalSha256', 'processing']) {
        if (c[k] == null || c[k].length === 0) bad(`${name}: credits field ${k} is empty`);
      }
      if (!/^https:\/\/(dl\.polyhaven\.org|ambientcg\.com)\//.test(c.sourceUrl || '')) bad(`${name}: source URL is not Poly Haven or ambientCG`);
      if (!/^[0-9a-f]{64}$/.test(c.originalSha256 || '')) bad(`${name}: originalSha256 is not a sha256`);
    }
  }
  const pending = ROWS.filter((r) => !manifest[r.id]).map((r) => r.id);
  if (opt.complete) for (const id of pending) bad(`${id}: missing from manifest.json`);
  for (const f of credits.files || []) if (!listed.has(f.file) && !others.has(f.file)) bad(`${f.file}: in credits.json but not in manifest.json`);
  const onDisk = fs.readdirSync(opt.out, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));
  for (const e of onDisk) {
    if (e.isDirectory() && e.name === 'high' && [...others].some((n) => n.startsWith('high/'))) continue; // the high tier's pack (asset-arena.mjs)
    if (!listed.has(e.name) && !others.has(e.name) && !GENERATED.includes(e.name)) bad(`${e.name}: stray file in the asset directory`);
  }
  const size = (name) => (fs.existsSync(path.join(opt.out, name)) ? fs.statSync(path.join(opt.out, name)).size : 0);
  const total = [...listed].reduce((n, name) => n + size(name), 0);
  // credits.totalBytes is the default tier of every tool (everything outside high/)
  const allTotal = total + [...others].filter((n) => !n.startsWith('high/')).reduce((n, name) => n + size(name), 0);
  if (credits.totalBytes !== allTotal) bad(`credits.totalBytes ${credits.totalBytes} != ${allTotal}`);
  if (allTotal > MAX_TOTAL_BYTES) bad(`total ${allTotal} bytes exceeds ${MAX_TOTAL_BYTES}`);
  try {
    const md = read('CREDITS.md').toString('utf8');
    if (!foreign.size) { if (md !== creditsMarkdown(credits)) bad('CREDITS.md is not what credits.json generates'); }
    else {
      // with other tools' sections in the file, the whole cannot be regenerated here: each of this table's files must have
      // its section with the shipped line as this tool writes it
      for (const name of listed) {
        const c = byFile.get(name);
        if (!c) continue;
        const head = `### \`${c.file}\` (${c.id}${c.variant === 'lite' ? ', lite tier' : ''})\n\n- shipped: ${c.width} x ${c.height} ${String(c.format).toUpperCase()}, ${c.bytes} bytes, ${c.colorSpace === 'srgb' ? 'sRGB colour' : 'linear data'}, sha256 \`${c.sha256}\`\n`;
        if (!md.includes(head)) bad(`CREDITS.md: no current section for ${name}`);
      }
    }
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
  console.log(`check: ${listed.size} files, ${total} bytes of ${MAX_TOTAL_BYTES} (${(total / 1e6).toFixed(3)} MB; plan total for the whole look ${(PLAN_TOTAL_BYTES / 1e6).toFixed(1)} MB), ${problems.length} problem(s)${pending.length ? `, pending: ${pending.join(' ')}` : ''}${opt.src ? ', originals verified' : ''}`);
  return problems.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opt = parseArgs(process.argv.slice(2));
  const n = opt.check ? check(opt) : build(opt);
  process.exit(n ? 1 : 0);
}
