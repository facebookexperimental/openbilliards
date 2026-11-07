// Copyright (c) Meta Platforms, Inc. and affiliates.

// Lossless word-run storage. This is byte compression, never quantisation.
import * as identity from './cn8transport-core.js';

const TYPES = { Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array };
function littleEndian() {
  if (new Uint8Array(new Uint32Array([1]).buffer)[0] !== 1) throw new Error('CN8_TRANSPORT_ENDIAN_UNSUPPORTED');
}
function base64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
export function encode(array) {
  littleEndian();
  if (!TYPES[array.constructor.name]) throw new Error('CN8_TRANSPORT_TYPE_UNSUPPORTED');
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  let packed = bytes, codec = 'raw';
  if (bytes.length % 4 === 0 && array.byteOffset % 4 === 0) {
    const source = new Uint32Array(array.buffer, array.byteOffset, bytes.length / 4), words = [];
    let start = 0, i = 0;
    const literal = end => {
      if (end > start) { words.push(end - start); for (let k = start; k < end; k++) words.push(source[k]); }
    };
    while (i < source.length) {
      let end = i + 1;
      while (end < source.length && source[end] === source[i]) end++;
      // Two words are the run header/value cost; shorter runs save no bytes.
      if (end - i > 2) { literal(i); words.push((0x80000000 | (end - i)) >>> 0, source[i]); start = end; }
      i = end;
    }
    literal(source.length);
    const candidate = new Uint8Array(new Uint32Array(words).buffer);
    if (candidate.length < bytes.length) { packed = candidate; codec = 'word-runs'; }
  }
  return { type: array.constructor.name, length: array.length, bytes: bytes.length,
    sha256: identity.sha256(bytes), codec, data: base64(packed) };
}
export function decode(row) {
  littleEndian();
  const Type = TYPES[row.type];
  if (!Type || !Number.isSafeInteger(row.length) || row.length < 0
    || row.bytes !== row.length * Type.BYTES_PER_ELEMENT) throw new Error('CN8_TRANSPORT_INVALID_CARRIER');
  const text = atob(row.data), packed = Uint8Array.from(text, ch => ch.charCodeAt(0));
  let bytes = packed;
  if (row.codec === 'word-runs') {
    if (packed.length % 4 || row.bytes % 4) throw new Error('CN8_TRANSPORT_INVALID_RUN_ALIGNMENT');
    const words = new Uint32Array(packed.buffer), output = new Uint32Array(row.bytes / 4);
    let i = 0, cursor = 0;
    while (i < words.length) {
      const header = words[i++], count = header & 0x7fffffff, repeated = header >>> 31;
      if (!count || cursor + count > output.length || i + (repeated ? 1 : count) > words.length) {
        throw new Error('CN8_TRANSPORT_INVALID_RUN_LENGTH');
      }
      if (repeated) output.fill(words[i++], cursor, cursor + count);
      else { output.set(words.subarray(i, i + count), cursor); i += count; }
      cursor += count;
    }
    if (cursor !== output.length) throw new Error('CN8_TRANSPORT_INCOMPLETE_RUNS');
    bytes = new Uint8Array(output.buffer);
  } else if (row.codec !== 'raw') throw new Error('CN8_TRANSPORT_UNKNOWN_CODEC');
  if (bytes.length !== row.bytes || identity.sha256(bytes) !== row.sha256) throw new Error('CN8_TRANSPORT_CARRIER_HASH_MISMATCH');
  return new Type(bytes.buffer, bytes.byteOffset, row.length);
}
