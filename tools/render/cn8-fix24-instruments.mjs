// Copyright (c) Meta Platforms, Inc. and affiliates.

// CPU reader/writer only. The page operations are injected into an already
// authorized capture; this CLI never launches or connects to a browser.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from '../../web/tools/png.mjs';
import { strictDifference, decodeIds, legibility, calibration, hudMask, attributeDifference, attributionSensitivity } from './lib/cn8-fix24-metrics.mjs';
export { pageExpression } from './lib/cn8-fix24-page.mjs';
const sha = data => createHash('sha256').update(data).digest('hex');
const need = (ok, message) => { if (!ok) throw new Error(`CN8_FIX24_${message}`); };

export function packId(raw) {
  need(raw.original_scene_materials_untouched === true, 'ID_SCENE_RESTORE_FAILED');
  const pixels = Buffer.from(raw.rgba_base64, 'base64');
  need(pixels.length === raw.width * raw.height * 4, 'ID_READBACK_SIZE_MISMATCH');
  decodeIds({ w: raw.width, h: raw.height, ch: 4, data: pixels }, raw.legend);
  const png = encodePng(raw.width, raw.height, pixels);
  const { rgba_base64: _rgba, ...record } = raw;
  return { png, record: { ...record, png_sha256: sha(png) } };
}
export function requirePairBinding(beauty, id) {
  const a = beauty.actual_state, b = id.actual_state;
  need(a?.camera && b?.camera && JSON.stringify(a.camera) === JSON.stringify(b.camera), 'ID_CAMERA_MISMATCH');
  need(typeof a.activeTableId_raw === 'string' && a.activeTableId_raw === b.activeTableId_raw
    && a.table_beacon === a.activeTableId_raw && b.table_beacon === b.activeTableId_raw, 'ID_TABLE_MISMATCH');
  need(JSON.stringify(a.equipment) === JSON.stringify(b.equipment), 'ID_EQUIPMENT_MISMATCH');
  need(JSON.stringify(a.canvas_rect_css) === JSON.stringify(b.canvas_rect_css)
    && a.device_pixel_ratio === b.device_pixel_ratio, 'ID_VIEWPORT_MISMATCH');
}
export function mechanismInDiff(root, base, head, mechanism) {
  need(/^[a-f0-9]{40}$/.test(base) && /^[a-f0-9]{40}$/.test(head), 'MECHANISM_COMMIT_BINDING_REQUIRED');
  need(mechanism && typeof mechanism.file === 'string' && Number.isInteger(mechanism.line), 'MECHANISM_SOURCE_REQUIRED');
  const diff = execFileSync('git', ['diff', '--no-ext-diff', '--unified=0', base, head, '--', mechanism.file], { cwd: root, encoding: 'utf8' });
  return [...diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].some(match => {
    const start = +match[1], count = match[2] === undefined ? 1 : +match[2];
    return mechanism.line >= start && mechanism.line < start + Math.max(1, count);
  });
}
export function runJob(job, directory) {
  const inputs = [];
  const file = name => {
    need(typeof name === 'string' && name.length > 0, 'INPUT_PATH_REQUIRED');
    const filename = path.resolve(directory, name), bytes = fs.readFileSync(filename);
    inputs.push({ path: filename, bytes: bytes.length, sha256: sha(bytes) }); return filename;
  };
  const json = name => JSON.parse(fs.readFileSync(file(name), 'utf8'));
  const png = name => decodePng(file(name));
  const bound = row => {
    const beautyFile = file(row.png), idFile = file(row.id_png);
    const beautyRecord = json(row.beauty_json), idRecord = json(row.id_json);
    need(beautyRecord.png_sha256 === sha(fs.readFileSync(beautyFile)), 'BEAUTY_HASH_MISMATCH');
    need(idRecord.png_sha256 === sha(fs.readFileSync(idFile)), 'ID_HASH_MISMATCH');
    requirePairBinding(beautyRecord, idRecord);
    const image = decodePng(beautyFile), id = decodePng(idFile);
    need(image.w === id.w && image.h === id.h, 'ID_SIZE_MISMATCH');
    const rect = beautyRecord.actual_state.canvas_rect_css, dpr = beautyRecord.actual_state.device_pixel_ratio;
    need(rect[0] === 0 && rect[1] === 0 && rect[2] * dpr === image.w && rect[3] * dpr === image.h,
      'NONFULL_CANVAS_REQUIRES_EXPLICIT_ID_PLACEMENT');
    return { image, ids: decodeIds(id, idRecord.legend), legend: idRecord.legend, record: beautyRecord };
  };
  let result;
  if (job.kind === 'A3') {
    need(Array.isArray(job.rows) && job.rows.length > 0, 'A3_ROWS_REQUIRED');
    const rows = job.rows.map(row => {
      const data = bound(row);
      return { frame: row.frame, ...legibility(data.image, data.ids, data.legend, row.selection) };
    });
    result = job.calibration ? calibration(rows)
      : { status: rows.some(r => r.status === 'FAIL') ? 'FAIL' : 'PASS', rows };
  } else if (job.kind === 'B1') {
    const a = bound(job.before), b = bound(job.after);
    requirePairBinding(a.record, b.record);
    const controls = [job.before, job.after].map((r, i) => {
      const d = strictDifference(i ? b.image : a.image, png(r.replay_png));
      return { side: i ? 'after' : 'before', changed_pixels: d.changed_pixels, max_channel_delta: d.max_channel_delta };
    });
    need(controls.every(r => r.changed_pixels === 0), 'PAIR_REPLAY_NONZERO_UNMEASURED');
    const hud = row => hudMask(png(row.black), png(row.white), png(row.black_replay), row.canvas_box);
    const ha = hud(job.before.hud), hb = hud(job.after.hud);
    const mechanisms = structuredClone(job.mechanisms ?? {});
    for (const mechanism of Object.values(mechanisms)) {
      need(mechanismInDiff(path.resolve(directory, job.repo), job.base, job.head, mechanism), 'MECHANISM_NOT_IN_PR_DIFF');
    }
    const args = [a.image, b.image, a.ids, b.ids, a.legend, b.legend, ha, hb, mechanisms];
    result = attributeDifference(...args); result.sensitivity = attributionSensitivity(args);
    result.replay_controls = controls;
    if (result.sensitivity.status === 'FAIL') result.status = 'FAIL';
    result.base = job.base; result.head = job.head;
  } else throw new Error('CN8_FIX24_JOB_KIND_INVALID');
  return { tool: 'tools/render/cn8-fix24-instruments.mjs', ...result, inputs };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { job: { type: 'string' }, out: { type: 'string' } }, strict: true, allowPositionals: false });
    need(values.job?.trim() && values.out?.trim(), 'JOB_AND_NEW_OUTPUT_REQUIRED');
    const jobPath = path.resolve(values.job), out = path.resolve(values.out);
    need(!fs.existsSync(out), 'DESTINATION_EXISTS');
    // All input parsing and measurement precede creation of a new receipt.
    const result = runJob(JSON.parse(fs.readFileSync(jobPath, 'utf8')), path.dirname(jobPath));
    result.job_sha256 = sha(fs.readFileSync(jobPath));
    fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ status: result.status, out }));
    process.exitCode = result.status === 'PASS' ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
