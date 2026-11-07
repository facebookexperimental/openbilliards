// Copyright (c) Meta Platforms, Inc. and affiliates.

// ORDER-12 ADDENDUM 3: a page boot is an instrument state, not a pixel tolerance.
import fs from 'node:fs';
import { createHash } from 'node:crypto';

export const WARM_PAGE_RULE = 'The first CN8 page in a browser process is warm-up only. '
  + 'Each compared export is captured after reload, with two identical post-warm-up '
  + 'page boots in that process. C7 submitted-input identity remains the primary gate.';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const bindingKeys = ['commit', 'tree', 'table_sha256'];

function requireBoot(boot, label) {
  if (!boot || !Number.isFinite(boot.time_origin) || !Number.isInteger(boot.browser_pid)
    || !boot.ready || typeof boot.url !== 'string' || !boot.table) {
    throw new Error('Incomplete ' + label + ' page-boot receipt');
  }
}

function frameBytes(row) {
  if (!row || !row.name || !row.file || !/^[0-9a-f]{64}$/.test(row.sha256)) {
    throw new Error('Incomplete native frame receipt');
  }
  const bytes = fs.readFileSync(row.file);
  if (sha(bytes) !== row.sha256) throw new Error('Native frame digest differs: ' + row.name);
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error('A native PNG frame is required');
  }
  return bytes;
}

/** Validate actual, independently recorded boots and frame files; never infer warmth from order alone. */
export function verifyWarmPageClosure({ warmup, proof, compared }, expectedNames) {
  requireBoot(warmup, 'warm-up'); requireBoot(proof, 'proof'); requireBoot(compared, 'compared');
  if (warmup.excluded_from_comparison !== true || warmup.frames?.length) {
    throw new Error('The first page must be excluded from compared captures');
  }
  if (warmup.browser_pid !== proof.browser_pid || proof.browser_pid !== compared.browser_pid
    || !(warmup.time_origin < proof.time_origin && proof.time_origin < compared.time_origin)) {
    throw new Error('Two distinct reloaded boots must follow warm-up in the same process');
  }
  if (proof.url !== compared.url || proof.table !== compared.table
    || !proof.binding || !compared.binding
    || bindingKeys.some(k => proof.binding[k] !== compared.binding[k])) {
    throw new Error('The two page boots must use the same bound export and alias');
  }
  if (!Array.isArray(expectedNames) || !expectedNames.length || new Set(expectedNames).size !== expectedNames.length
    || !same(proof.frames?.map(row => row.name), expectedNames)
    || !same(compared.frames?.map(row => row.name), expectedNames)) {
    throw new Error('The two-boot proof must cover every compared view exactly once');
  }
  const rows = proof.frames.map((before, i) => {
    const after = compared.frames[i];
    if (before.file === after.file || before.browser_pid !== proof.browser_pid || after.browser_pid !== compared.browser_pid
      || ['commit', 'tree'].some(k => before[k] !== proof.binding[k] || after[k] !== compared.binding[k])) {
      throw new Error('Each boot needs its own bound native frame: ' + before.name);
    }
    for (const key of ['view', 'projection', 'viewport', 'dpr', 'lights']) {
      if (!same(before.camera?.[key], after.camera?.[key])) throw new Error('Two-boot pose differs: ' + key);
    }
    const a = frameBytes(before), b = frameBytes(after);
    const identical = a.equals(b);
    return { name: before.name, proof_file: before.file, compared_file: after.file,
      proof_sha256: before.sha256, compared_sha256: after.sha256, identical };
  });
  return { schema: 'ob-cn8-warm-page-closure/1', tag: 'DERIVED; ORDER-12 ADDENDUM 3 instrument ruling',
    rule: WARM_PAGE_RULE, status: rows.every(row => row.identical) ? 'PASS' : 'FAIL',
    method: 'Byte-identical native PNGs at every held view, from two distinct post-warm-up page boots. '
      + 'No changed-mesh exclusion or pixel tolerance applies to this same-export closure.',
    browser_pid: compared.browser_pid, table: compared.table, binding: compared.binding,
    warmup, proof_boot: { ...proof, frames: undefined }, compared_boot: { ...compared, frames: undefined },
    views: rows.length, differing_views: rows.filter(row => !row.identical).length, rows };
}
