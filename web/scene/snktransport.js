// Copyright (c) Meta Platforms, Inc. and affiliates.

// snktransport.js — the SHIPPED snooker occlusion transport (GH-1131 option A). The data module holds table.js's own aOccl
// bake: every job output of a snooker build, keyed by the runtime bake-cache key, lossless Float32 in the CN8 transport's
// carrier (cn8transport-codec.js: word runs, base64 and the FIPS 180-4 SHA-256 of cn8transport-core.js). The carrier uses no
// platform stream or crypto API, so it decodes wherever the CN8 transport does, the native shells included. The data module
// is generated in node by tools/render/gen-snk-transport.mjs and compared byte for byte in CI.
// table.js imports this module only for a snooker table (prepareTableTransport), before the build, and reads the map
// ahead of its runtime bake. Every failure here rejects with a named SNK_TRANSPORT_* code, and table.js then bakes at
// runtime (SNK_TRANSPORT_ARTIFACT_MISSING).
import { artifact } from './snktransport-data.js';
import * as carrier from './cn8transport-codec.js';

const fail = (code, detail) => { const e = new Error(`${code}: ${detail}`); e.code = code; return e; };
// the carrier's own failures, by name (a corrupt base64 payload throws atob's DOMException: INVALID as well)
const named = (e) => {
  const m = String(e?.message || e);
  if (/ENDIAN/.test(m)) return 'SNK_TRANSPORT_ENDIAN_UNSUPPORTED';
  return /HASH_MISMATCH/.test(m) ? 'SNK_TRANSPORT_ARTIFACT_HASH_MISMATCH' : 'SNK_TRANSPORT_ARTIFACT_INVALID';
};

/** Decode an artifact object into key → Float32Array (views over one decoded buffer; read-only by contract, as the
 * runtime bake cache's arrays are). The carrier verifies its byte count and SHA-256 before anything is returned. */
export async function decode(art) {
  if (!art || art.schema !== 2 || !Array.isArray(art.keys) || !Array.isArray(art.counts)
    || art.keys.length !== art.counts.length || art.keys.length !== art.entries || art.row?.type !== 'Float32Array') {
    throw fail('SNK_TRANSPORT_ARTIFACT_INVALID', 'shape');
  }
  let floats;
  try { floats = carrier.decode(art.row); }
  catch (e) { throw fail(named(e), `carrier: ${String(e?.message || e).slice(0, 80)}`); }
  const map = new Map();
  let off = 0;
  for (let i = 0; i < art.keys.length; i++) {
    const n = art.counts[i];
    if (!Number.isInteger(n) || n <= 0 || off + n > floats.length) throw fail('SNK_TRANSPORT_ARTIFACT_INVALID', `count ${n} at ${i}`);
    map.set(art.keys[i], floats.subarray(off, off + n));
    off += n;
  }
  if (off !== floats.length) throw fail('SNK_TRANSPORT_ARTIFACT_INVALID', 'counts do not cover the carrier');
  return map;
}

/** The shipped artifact, decoded. */
export function load() { return decode(artifact); }
