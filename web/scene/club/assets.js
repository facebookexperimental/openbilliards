// Copyright (c) Meta Platforms, Inc. and affiliates.

// assets.js — the club look's asset loader (CONTRACT.md section 3). Ids resolve through web/assets/club/manifest.json
// ({ "<id>": { "file": "<name>", "lite": "<name at 1024 px>", "high": { … }, "bytes": n, "sha256": "…" } }; `lite` and `high`
// are optional, `high` is described below). texture() returns a usable texture
// at once (the caller's fallback, or a neutral 2x2 texture) and swaps the image in when the file arrives; a missing manifest,
// a missing id or a failed request keeps the fallback and is counted, never thrown. Nothing here is requested unless the club
// look is on (this module is reached only through club/index.js).
//
// The swap keeps the returned object (consumers hold the reference) and replaces what it shows. Two facts of three r170
// shape it (both were measured by the assets role on its dev page):
//   * storage is immutable: the GPU texture of a stand-in that was drawn once has the stand-in's size, and a later upload of
//     a 1024 or 2048 px image into it fails silently. So the texture is disposed before the image is assigned; the next draw
//     allocates storage at the file's size.
//   * a DataTexture uploads `image.data`, so an <img> assigned to one draws black. A DataTexture stand-in (the caller's, or
//     the no-DOM default below) is therefore turned into a plain image texture at the swap: the flag is cleared and the
//     DataTexture defaults (no mipmaps, nearest filters, flipY off, 1-byte rows, its own format and type) are reset.
// A clone of the returned texture made BEFORE the file arrives shares the stand-in's GPU texture and is not swapped: ask
// texture() again with the other `repeat` instead (it shares the image and the upload), or clone after `ready([id])`.
//
// What an id costs on the GPU is decided here and nowhere else (tiers.js is the table, CONTRACT.md 11.2): the cap on its
// longer side (`textureSize`, `textureSizeData` for normal and roughness maps, `textureSizes` for single ids; tools:
// `?clubtex=id:px`), the file taken (the manifest's 1024 px file where the cap is 1024 or less), and the upload format (RG8
// for roughness maps under `roughRG`). state().gpu lists every id with its size, cap, file, bytes per texel and bytes.
//
// One decoded image per id: every texture object of an id points at one THREE.Source, so two modules asking for the same id
// make one request, and objects that differ only in `repeat` make one GPU upload (three keys GPU textures by source and
// sampling parameters; `repeat` is a UV transform and not part of that key).
//
// The high tier's pack (CONTRACT.md 14.2). A manifest row may carry `"high": { "file": "high/<name>.jpg", "bytes", "sha256" }`:
// a larger file for the desktop high tier, kept under web/assets/club/high/ (JPEG only: that extension is outside the service
// worker's precache list, so the pack is never precached). The loader takes it ONLY when the tier is `high` (highOf() below is
// the one place that reads the member, and it answers null on every other tier): on lite and base no request names `high/`.
// A high file is authored at the size the high tier is meant to hold (4096 px for a hero id, 2048 px otherwise: the assets arm
// pins the sizes), so the tier's general cap does not draw it down; a per-id cap (`textureSizes`, `?clubtex=id:px`) still
// does. A high file that fails to load falls back to the row's default file (counted in `highMissed`), then to the stand-in.
// A row without the member (every row of the club venue) loads exactly as before.
import * as THREE from 'three';

const BASE = new URL('../../assets/club/', import.meta.url);
// a high-tier file name: one plain JPEG name inside high/ (nothing that leaves the directory, no other extension)
const HIGH_FILE = /^high\/[A-Za-z0-9][A-Za-z0-9._-]*\.jpe?g$/;

// the default stand-in: a plain 2x2 mid-grey image texture (a canvas where there is a document; a DataTexture otherwise,
// which the swap converts)
function neutral(srgb) {
  const v = 128;
  let t = null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    const g = c.getContext('2d');
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(0, 0, 2, 2);
    t = new THREE.CanvasTexture(c);
  } catch {
    t = new THREE.DataTexture(new Uint8Array([v, v, v, 255, v, v, v, 255, v, v, v, 255, v, v, v, 255]), 2, 2);
  }
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * Show a loaded file on a texture object that may already have been drawn with a stand-in of another size or kind. The
 * object takes the id's SHARED source (one decoded image per id): three keys its GPU textures by source and sampling
 * parameters, so every object of an id with the same colour space, filters, anisotropy and flipY uses ONE upload, whatever
 * its `repeat`. `first` marks the object that announces the new image to the source; the others only bump their own version.
 */
function swapSource(tex, source, flipY, first, format = null) {
  tex.dispose(); // frees the stand-in's immutable GPU storage; the next draw binds (or allocates) the file's texture
  if (tex.isDataTexture) {
    tex.isDataTexture = false;
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.internalFormat = null;
    tex.unpackAlignment = 4;
  }
  // a two-channel upload (roughness maps on the tiers with `roughRG`): the storage is allocated at the next draw, so the
  // format can change here; three keys the GPU texture by format too, and every object of the id gets the same one
  if (format !== null) { tex.format = format; tex.type = THREE.UnsignedByteType; tex.internalFormat = null; }
  tex.source = source;
  tex.flipY = flipY;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  if (first) tex.needsUpdate = true; else tex.version += 1;
}

/**
 * The tier's texture size as a hard cap (tiers.js `textureSize`, `textureSizeData` for normal and roughness maps, and the
 * per-id caps of `textureSizes`): an image whose longer side is larger is drawn once onto a canvas of that size, and the
 * canvas is what gets uploaded. Where the cap is 1024 or less the loader asks for the manifest's 1024 px file when a row has
 * one (every 2048 px row has one), so a 2048 px image is never decoded on the lite and base tiers; the 512 px data maps of
 * those tiers are made here, at load, from the shipped 1024 px files (no 512 px file is shipped: the download is the 1024 px
 * file's, the GPU cost a quarter of it). A 2D canvas resamples the stored byte values, which is right for colour and for
 * data maps (normals, roughness) alike; the maps are opaque, so premultiplied alpha does not come into it. A halved normal
 * map is not renormalised: three normalises the sampled vector in the shader.
 */
function capImage(image, maxSide) {
  const w = image?.naturalWidth || image?.width || 0, h = image?.naturalHeight || image?.height || 0;
  if (!(maxSide > 0) || !(w > 0 && h > 0) || Math.max(w, h) <= maxSide) return image;
  try {
    const k = maxSide / Math.max(w, h);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(image, 0, 0, c.width, c.height);
    return c;
  } catch { return image; } // no 2D canvas: the full-size image stays
}

// data maps (normals, roughness): the tier may cap them lower than colour maps (tiers.js `textureSizeData`)
const DATA_ID = /\.(normal|rough)$/;
// roughness maps: grey files, and three's standard shader reads the G channel alone, so RG8 holds all of it in half the bytes
// (R8 would be a quarter, but then G reads 0: that needs a shader change in every consumer)
const ROUGH_ID = /\.rough$/;
const BYTES_PER_TEXEL = (format) => (format === THREE.RGFormat ? 2 : format === THREE.RedFormat ? 1 : 4);

/** `?clubtex=id:px,id:px` (tools): per-id caps for an on / off pair, over the tier's own (`0` = no cap for that id). Pure. */
export function sizesFromQuery(query) {
  const out = {};
  let raw = null;
  try { raw = query?.get?.('clubtex') ?? null; } catch { raw = null; }
  if (typeof raw !== 'string' || !raw) return out;
  for (const part of raw.split(',')) {
    const i = part.lastIndexOf(':');
    if (i <= 0) continue;
    const id = part.slice(0, i).trim(), n = Number(part.slice(i + 1));
    if (/^[a-z0-9_.]+$/i.test(id) && Number.isFinite(n) && n >= 0 && n <= 8192) out[id] = Math.floor(n);
  }
  return out;
}

export function createAssets(club) {
  const lite = club?.tier === 'lite';
  const high = club?.tier === 'high';
  /** The row's high-tier file ({ file, bytes }) on the high tier, else null. The ONE reader of a row's `high` member. */
  const highOf = (row) => {
    if (!high) return null;
    const h = row?.high;
    return h && typeof h === 'object' && typeof h.file === 'string' && HIGH_FILE.test(h.file) ? { file: h.file, bytes: Number(h.bytes) || 0 } : null;
  };
  const maxSide = Number(club?.knobs?.textureSize) > 0 ? Number(club.knobs.textureSize) : 0; // 0 = no cap
  const dataSide = Number(club?.knobs?.textureSizeData) > 0 ? Number(club.knobs.textureSizeData) : 0; // 0 = as colour maps
  // per-id caps: the tier's own (tiers.js `textureSizes`), then the tool switch `?clubtex=id:px` over them
  const ownSides = { ...(club?.knobs?.textureSizes && typeof club.knobs.textureSizes === 'object' ? club.knobs.textureSizes : {}), ...sizesFromQuery(club?.ctx?.query) };
  /** The cap on the longer side of an id's image: its own cap when it has one, else the tier's texture size, and the lower
   * data-map size for a data map. 0 = no cap. */
  const sideFor = (id) => {
    if (Object.prototype.hasOwnProperty.call(ownSides, id) && Number(ownSides[id]) >= 0) return Number(ownSides[id]);
    return dataSide > 0 && DATA_ID.test(id) ? (maxSide > 0 ? Math.min(maxSide, dataSide) : dataSide) : maxSide;
  };
  const roughRG = club?.knobs?.roughRG === true;
  /** The upload format of an id's image, or null for the default (RGBA8). */
  const formatFor = (id) => (roughRG && ROUGH_ID.test(id) ? THREE.RGFormat : null);
  // The tier's ONE anisotropy (tiers.js `anisotropy`): every request that asks for anisotropic sampling (more than 1) gets
  // this value, so two modules that ask for 4 and for 8 on the same id share one GPU texture instead of holding two copies
  // of the image (three keys a GPU texture by source AND sampling state). 0 = no rule: each request keeps its own value.
  const tierAniso = Number(club?.knobs?.anisotropy) >= 1 ? Number(club.knobs.anisotropy) : 0;
  // requested / loaded / fallback count IDS (one file each, textures and raw files alike; rawFiles = the ids read as bytes,
  // rawSettled = how many of those have loaded or fallen back; capped = images drawn down to the tier's texture size);
  // calls counts texture() calls; shared counts the calls that were served the object of an earlier call; textures counts
  // the distinct objects handed out. bytes: the manifest's byte count of every full-size file loaded (a lite variant has no
  // byte count in the manifest: it is counted in `liteFiles`). highFiles / highBytes: the high-tier files loaded and their
  // manifest byte counts (not in `bytes`); highMissed: high files that failed and were replaced by the row's default file.
  const counts = { requested: 0, loaded: 0, fallback: 0, bytes: 0, liteFiles: 0, rawFiles: 0, rawSettled: 0, capped: 0, calls: 0, shared: 0, textures: 0, clonedFallbacks: 0, anisotropySet: 0, highFiles: 0, highBytes: 0, highMissed: 0 };
  // id -> { promise, source: THREE.Source | null, status, variants: Map<options key, texture>, objects: [{ tex, flipY }] }
  const entries = new Map();
  const raws = new Map(); // id -> { promise: Promise<ArrayBuffer | null>, status } (files read as bytes: bytes())
  const handed = new Set(); // every object this loader manages (a caller's fallback handed in twice is cloned, never shared)
  const failed = [];
  const missed = []; // ids whose high-tier file did not arrive (the default file was asked for instead)
  const loader = new THREE.TextureLoader();
  let manifest = null;
  const manifestReady = fetch(new URL('manifest.json', BASE))
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`manifest.json ${r.status}`))))
    .then((m) => { manifest = m && typeof m === 'object' ? m : {}; })
    .catch((e) => { manifest = {}; failed.push(`manifest: ${e?.message ?? e}`); });

  // one file request per id, started by the first texture() call for it
  function entryFor(id) {
    let entry = entries.get(id);
    if (entry) return entry;
    entry = { promise: null, source: null, status: 'pending', variants: new Map(), objects: [], format: formatFor(id), side: sideFor(id), file: null };
    entries.set(id, entry);
    counts.requested += 1;
    const keep = (why) => { counts.fallback += 1; entry.status = 'fallback'; failed.push(`${id}: ${why}`); };
    entry.promise = manifestReady.then(() => new Promise((resolve) => {
      const row = manifest[id];
      // the manifest's 1024 px file: on the lite tier, and wherever this id's cap is 1024 or less (a smaller download
      // than the full file drawn down)
      const side = sideFor(id);
      const useLite = !!(row?.lite && (lite || (side > 0 && side <= 1024)));
      const file = row ? (useLite ? row.lite : row.file) : null;
      if (!file) { keep('not in the manifest'); resolve(); return; }
      // one attempt: `cap` is the cap on the image's longer side, `count` books the bytes once the image is shown
      const attempt = (name, cap, count, onError) => {
        entry.file = name; entry.side = cap;
        loader.load(new URL(name, BASE).href, (loaded) => {
          try {
            const image = capImage(loaded.image, cap);
            if (image !== loaded.image) counts.capped += 1;
            entry.source = new THREE.Source(image);
            entry.objects.forEach((o, i) => swapSource(o.tex, entry.source, o.flipY, i === 0, entry.format));
            counts.loaded += 1; entry.status = 'loaded';
            count();
          } catch (e) { entry.source = null; keep(`swap failed (${e?.message ?? e})`); }
          resolve();
        }, undefined, onError);
      };
      const plain = () => attempt(file, side, () => { if (useLite) counts.liteFiles += 1; else counts.bytes += Number(row.bytes) || 0; },
        () => { keep(`request failed (${file})`); resolve(); });
      // the high tier's file, where the row has one: at its own size unless this id has a cap of its own; the row's default
      // file is the second attempt if it does not arrive
      // (an own cap of 1024 or less is served by the default file: no 4096 px download to draw down)
      const ownCap = Object.prototype.hasOwnProperty.call(ownSides, id) && Number(ownSides[id]) >= 0 ? Number(ownSides[id]) : 0;
      const hi = ownCap > 0 && ownCap <= 1024 ? null : highOf(row);
      if (!hi) { plain(); return; }
      attempt(hi.file, ownCap, () => { counts.highFiles += 1; counts.highBytes += hi.bytes; },
        () => { counts.highMissed += 1; missed.push(id); plain(); });
    }));
    return entry;
  }

  /**
   * texture(id, { srgb, repeat: [u, v], anisotropy, fallback, flipY }) -> THREE.Texture (stable object: put it on a material now).
   * Per-id cache: a second call with the same id and the same options (srgb, repeat, anisotropy, flipY) returns the SAME
   * object as the first; a call with other options returns its own object on the id's shared image (no second request, and
   * no second upload when only `repeat` differs). The returned object is the caller's `fallback` when one is given and no
   * earlier call owns these options; keep the RETURNED reference. A `fallback` given to a call that is served an earlier
   * object is swapped too, so a caller that kept its own object still sees the file. A `fallback` object that this loader
   * already manages for another id or other options is cloned (one stand-in handed to several ids would end up showing the
   * file that loaded last on all of them).
   */
  function texture(id, { srgb = false, repeat = null, anisotropy: asked = 8, fallback = null, flipY = true } = {}) {
    counts.calls += 1;
    const entry = entryFor(id);
    const anisotropy = tierAniso > 0 && asked > 1 ? tierAniso : asked;
    if (anisotropy !== asked) counts.anisotropySet += 1;
    const key = `${srgb ? 1 : 0}|${repeat ? `${repeat[0]},${repeat[1]}` : ''}|${anisotropy}|${flipY ? 1 : 0}`;
    const dress = (tex) => {
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      if (repeat) tex.repeat.set(repeat[0], repeat[1]);
      tex.anisotropy = anisotropy;
      handed.add(tex);
      entry.objects.push({ tex, flipY });
      // the file is already here: show it at once (the source is current, so only this object's version moves)
      if (entry.source) { try { swapSource(tex, entry.source, flipY, false, entry.format); } catch (e) { failed.push(`${id}: swap failed (${e?.message ?? e})`); } }
      return tex;
    };
    const cached = entry.variants.get(key);
    if (cached) {
      counts.shared += 1;
      if (fallback && fallback !== cached && !handed.has(fallback)) dress(fallback); // the caller's own object follows the file too
      return cached;
    }
    let tex = fallback ?? neutral(srgb);
    if (handed.has(tex)) { tex = tex.clone(); counts.clonedFallbacks += 1; }
    counts.textures += 1;
    entry.variants.set(key, tex);
    return dress(tex);
  }

  /**
   * Raw fetch of a manifest file as an ArrayBuffer (a baked light map decoded by its owner, RGBE environments, LUT strips
   * read as bytes); null on any failure. One request per id: a second call gets the same promise and the SAME buffer (read
   * it, do not transfer or detach it). A raw id counts like a texture id in state() (requested / loaded / fallback, its
   * manifest byte count, its status under `ids`) and ready() waits for it, so the show pass and the reflection service's
   * late-arrival watch see it. The lite tier takes the row's `lite` file when it has one.
   */
  function bytes(id) {
    let entry = raws.get(id);
    if (entry) return entry.promise;
    entry = { promise: null, status: 'pending' };
    raws.set(id, entry);
    counts.requested += 1; counts.rawFiles += 1;
    const keep = (why) => { counts.fallback += 1; counts.rawSettled += 1; entry.status = 'fallback'; failed.push(`${id}: ${why}`); return null; };
    entry.promise = manifestReady.then(async () => {
      const row = manifest[id];
      const useLite = !!(lite && row?.lite);
      const file = row ? (useLite ? row.lite : row.file) : null;
      if (!file) return keep('not in the manifest');
      const get = async (name) => {
        const r = await fetch(new URL(name, BASE));
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      };
      // the high tier's file first, where the row has one (the row's default file if it does not arrive)
      const hi = highOf(row);
      if (hi) {
        try {
          const buf = await get(hi.file);
          counts.loaded += 1; counts.rawSettled += 1; entry.status = 'loaded';
          counts.highFiles += 1; counts.highBytes += hi.bytes;
          return buf;
        } catch { counts.highMissed += 1; missed.push(id); }
      }
      try {
        const buf = await get(file);
        counts.loaded += 1; counts.rawSettled += 1; entry.status = 'loaded';
        if (useLite) counts.liteFiles += 1; else counts.bytes += Number(row.bytes) || 0;
        return buf;
      } catch (e) { return keep(`request failed (${file}: ${e?.message ?? e})`); }
    });
    return entry.promise;
  }

  /** Resolves when the named ids (default: everything requested so far, textures and raw files) have loaded or fallen back. */
  function ready(ids = null) {
    const of = (id) => entries.get(id)?.promise ?? raws.get(id)?.promise;
    const list = ids ? ids.map(of).filter(Boolean) : [...entries.values(), ...raws.values()].map((e) => e.promise);
    return Promise.all(list).then(() => undefined);
  }

  /**
   * What the loaded textures cost on the GPU if every object handed out is drawn: three keys a GPU texture by image source
   * and sampling state, so objects of one id that differ only in `repeat` share one upload, and a different colour space,
   * anisotropy or flipY is a second upload of the same image. RGBA8 (RG8 for a roughness map under `roughRG`) with a full mip
   * chain (x 4/3). An upper bound: an object that is never drawn is never uploaded (`drawn` in a row counts the objects
   * the renderer holds a GPU texture for, when the renderer can be asked). Raw files are not textures here (their owner
   * decodes and uploads them).
   */
  function gpu() {
    let textures = 0, bytesOnGpu = 0;
    const perId = {};
    for (const [id, e] of entries) {
      const im = e.source?.data;
      if (!im) continue;
      const w = im.naturalWidth || im.width || 0, h = im.naturalHeight || im.height || 0;
      const uploads = new Set(e.objects.map((o) => `${o.tex.colorSpace}|${o.tex.anisotropy}|${o.flipY ? 1 : 0}`)).size;
      const bpt = BYTES_PER_TEXEL(e.format);
      const b = Math.round(uploads * w * h * bpt * 4 / 3);
      textures += uploads; bytesOnGpu += b;
      perId[id] = { w, h, uploads, objects: e.objects.length, bytes: b, bytesPerTexel: bpt, cap: e.side, file: e.file };
    }
    return { textures, bytes: bytesOnGpu, ids: perId };
  }

  const state = () => ({
    ...counts, maxSide, dataSide, ownSides: { ...ownSides }, roughRG, anisotropy: tierAniso, failed: failed.slice(), highMissedIds: missed.slice(),
    ids: Object.fromEntries([...[...entries].map(([id, e]) => [id, e.status]), ...[...raws].map(([id, e]) => [id, e.status])]),
    gpu: gpu(),
  });
  return { enabled: true, texture, bytes, ready, state, base: BASE.href };
}
