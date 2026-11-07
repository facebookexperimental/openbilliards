// Copyright (c) Meta Platforms, Inc. and affiliates.

// FIX24 CPU instruments. Thresholds are the order's encoded-sRGB law, not fits.
export const CLASSES = Object.freeze([
  'pocket_furniture', 'rail_top_wood', 'rail_side', 'cushion_rubber_cloth',
  'cloth_bed', 'balls', 'room_bench_indirect', 'HUD',
]);
export const CALIBRATION = Object.freeze({
  G05: 'base', G06: 'old_tip', G11: 'base', G12: 'old_tip',
  G17: 'base', G18: 'old_tip', G23: 'base', G24: 'old_tip',
});
const need = (ok, code) => { if (!ok) throw new Error(`CN8_FIX24_${code}`); };
function raster(a) {
  need(a && Number.isInteger(a.w) && a.w > 0 && Number.isInteger(a.h) && a.h > 0
    && [3, 4].includes(a.ch) && a.data?.length === a.w * a.h * a.ch, 'RASTER_INVALID');
}
function sameSize(a, b) {
  raster(a); raster(b); need(a.w === b.w && a.h === b.h, 'RASTER_SIZE_MISMATCH');
}
export function strictDifference(a, b) {
  sameSize(a, b);
  const mask = new Uint8Array(a.w * a.h);
  let changed = 0, maxChannelDelta = 0;
  for (let i = 0; i < mask.length; i++) {
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a.data[i * a.ch + c] - b.data[i * b.ch + c]);
      maxChannelDelta = Math.max(maxChannelDelta, d);
      if (d) mask[i] = 1;
    }
    changed += mask[i];
  }
  return { changed_pixels: changed, max_channel_delta: maxChannelDelta, mask };
}
export function decodeIds(image, legend) {
  raster(image);
  need(legend && typeof legend === 'object', 'ID_LEGEND_REQUIRED');
  const ids = new Uint32Array(image.w * image.h);
  for (let i = 0; i < ids.length; i++) {
    const j = i * image.ch;
    ids[i] = image.data[j] | (image.data[j + 1] << 8) | (image.data[j + 2] << 16);
    need(Object.hasOwn(legend, ids[i]), `ID_NOT_IN_LEGEND_${ids[i]}`);
  }
  return ids;
}
function box(bbox, w, h) {
  need(Array.isArray(bbox) && bbox.length === 4 && bbox.every(Number.isInteger)
    && bbox[0] >= 0 && bbox[1] >= 0 && bbox[2] <= w && bbox[3] <= h
    && bbox[0] < bbox[2] && bbox[1] < bbox[3], 'BODY_BBOX_REQUIRED');
}
export function legibility(image, ids, legend, selection) {
  raster(image); need(ids.length === image.w * image.h, 'ID_SIZE_MISMATCH');
  const { bbox, body_ids: bodyIds, source, role } = selection ?? {};
  box(bbox, image.w, image.h);
  need(typeof source === 'string' && source.trim(), 'BODY_SELECTION_SOURCE_REQUIRED');
  need(['base', 'old_tip', 'new_tip', 'middle'].includes(role), 'LEGIBILITY_ROLE_INVALID');
  need(Array.isArray(bodyIds) && bodyIds.length > 0 && bodyIds.every(id => legend[id]
    && legend[id].class === 'pocket_furniture' && legend[id].cover === true), 'COVER_BODY_IDS_REQUIRED');
  const selected = new Set(bodyIds), values = [];
  let black = 0, exactlyBlack = 0;
  for (let y = bbox[1]; y < bbox[3]; y++) for (let x = bbox[0]; x < bbox[2]; x++) {
    const i = y * image.w + x; if (!selected.has(ids[i])) continue;
    const j = i * image.ch, r = image.data[j], g = image.data[j + 1], b = image.data[j + 2];
    const value = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    values.push(value); if (value < 24) black++; if (r === 0 && g === 0 && b === 0) exactlyBlack++;
  }
  need(values.length > 0, 'COVER_BODY_MASK_EMPTY');
  values.sort((a, b) => a - b);
  // Empirical nearest-rank quantiles; no interpolation or gamma decoding.
  const q = p => values[Math.max(0, Math.ceil(p * values.length) - 1)];
  const fraction = black / values.length;
  const pass = role === 'old_tip' ? fraction >= 0.90 : fraction <= 0.05;
  return { tag: 'DERIVED / encoded 8-bit sRGB PNG', role, bbox, body_ids: bodyIds, source,
    pixels: values.length, p5: q(0.05), p50: q(0.5), p95: q(0.95),
    spread_advisory: q(0.95) - q(0.05), black_cutoff_exclusive: 24,
    black_pixels: black, black_fraction: fraction, exact_black_fraction: exactlyBlack / values.length,
    status: role === 'middle' ? 'RECORD' : (pass ? 'PASS' : 'FAIL'),
    predicate: role === 'old_tip' ? 'calibration detects defect: black fraction >= 0.90'
      : (role === 'middle' ? 'middle is a different construction; no corner parity gate' : 'black fraction <= 0.05') };
}
export function calibration(rows) {
  need(rows.length === Object.keys(CALIBRATION).length
    && new Set(rows.map(r => r.frame)).size === rows.length
    && rows.every(r => CALIBRATION[r.frame] === r.role), 'CALIBRATION_POPULATION_MISMATCH');
  return { status: rows.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL', rows };
}
export function hudMask(black, white, blackReplay, canvasBox) {
  // Two opaque canvas UNDERLAYS expose DOM compositing without hiding the HUD.
  // Bare canvas changes by exactly 255. Any smaller change is HUD coverage.
  sameSize(black, white); sameSize(black, blackReplay); box(canvasBox, black.w, black.h);
  const control = strictDifference(black, blackReplay);
  need(control.changed_pixels === 0, 'HUD_PROBE_REPLAY_NONZERO');
  const mask = new Uint8Array(black.w * black.h);
  for (let y = 0; y < black.h; y++) for (let x = 0; x < black.w; x++) {
    const i = y * black.w + x;
    if (x < canvasBox[0] || x >= canvasBox[2] || y < canvasBox[1] || y >= canvasBox[3]) { mask[i] = 1; continue; }
    for (let c = 0; c < 3; c++) {
      const delta = white.data[i * white.ch + c] - black.data[i * black.ch + c];
      need(delta >= 0, 'HUD_PROBE_NONMONOTONE');
      if (delta < 255) mask[i] = 1;
    }
  }
  return mask;
}
function classAt(ids, legend, i) { return legend[ids[i]]?.class ?? 'UNCLASSIFIED'; }
export function attributeDifference(a, b, idA, idB, legendA, legendB, hudA, hudB, mechanisms) {
  const diff = strictDifference(a, b), size = diff.mask.length;
  need([idA, idB, hudA, hudB].every(x => x?.length === size), 'ATTRIBUTION_MASKS_REQUIRED');
  const counts = Object.fromEntries([...CLASSES, 'UNCLASSIFIED'].map(c => [c, 0])), transitions = {};
  for (let i = 0; i < size; i++) {
    if (!diff.mask[i]) continue;
    const ca = classAt(idA, legendA, i), cb = classAt(idB, legendB, i);
    // Assign the after surface; when it is background, retain a removed
    // before surface's identity. Transitions are disclosed, never erased.
    const cls = hudA[i] || hudB[i] ? 'HUD'
      : (cb === 'room_bench_indirect' && ca !== cb ? ca : cb);
    const key = Object.hasOwn(counts, cls) ? cls : 'UNCLASSIFIED';
    counts[key]++;
    const transition = `${ca} -> ${cb}`; transitions[transition] = (transitions[transition] ?? 0) + 1;
  }
  const rows = Object.entries(counts).map(([cls, count]) => {
    const mechanism = mechanisms?.[cls];
    const named = cls !== 'UNCLASSIFIED' && typeof mechanism?.cause === 'string' && mechanism.cause.trim()
      && typeof mechanism?.file === 'string' && Number.isInteger(mechanism.line) && mechanism.line > 0
      && typeof mechanism?.evidence === 'string' && mechanism.evidence.trim();
    return { class: cls, count, share: diff.changed_pixels ? count / diff.changed_pixels : 0,
      mechanism: mechanism ?? null, status: count === 0 ? 'ZERO' : (named ? 'PASS' : 'FAIL') };
  });
  return { tag: 'DERIVED / strict RGB any-channel delta, tolerance zero',
    changed_pixels: diff.changed_pixels, max_channel_delta: diff.max_channel_delta,
    assignment: 'HUD union first; after ID, with before foreground for newly exposed room/background',
    status: rows.some(r => r.status === 'FAIL') ? 'FAIL' : 'PASS', rows, transitions };
}
export function shiftMask(values, w, h, dx, dy, fill = 0) {
  need(values.length === w * h && Number.isInteger(dx) && Number.isInteger(dy), 'SHIFT_INVALID');
  const out = new values.constructor(values.length); out.fill(fill);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x - dx, sy = y - dy;
    if (sx >= 0 && sx < w && sy >= 0 && sy < h) out[y * w + x] = values[sy * w + sx];
  }
  return out;
}
export function attributionSensitivity(args) {
  const [a, b, ia, ib, la, lb, ha, hb, mechanisms] = args;
  const baseline = attributeDifference(...args);
  const shifted = attributeDifference(a, b, shiftMask(ia, a.w, a.h, 1, 0),
    shiftMask(ib, b.w, b.h, 1, 0), la, lb, ha, hb, mechanisms);
  const moved = baseline.rows.some((r, i) => r.count !== shifted.rows[i].count);
  return { tag: 'TEST / id masks translated +1 physical pixel in x; no tolerance',
    status: moved ? 'PASS' : 'FAIL', class_counts_moved: moved,
    baseline: baseline.rows.map(r => ({ class: r.class, count: r.count })),
    shifted: shifted.rows.map(r => ({ class: r.class, count: r.count })) };
}
