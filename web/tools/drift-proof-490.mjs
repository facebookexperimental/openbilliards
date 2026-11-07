// Copyright (c) Meta Platforms, Inc. and affiliates.

// drift-proof-490.mjs — GH-490 zero-drift live proof harness (round 24).
//
// The r23 pack's carom "live proof" was a byte-copy of the snooker frame
// (gate r21 P1-3, the r19 evidence-integrity class: byte-carried panes).
// This tool makes that class STRUCTURALLY impossible to re-ship: the
// prove step hashes every input and REFUSES (exit 2, no proof written)
// whenever two files declared as DIFFERENT table classes are
// byte-identical — a duplicate across classes is never evidence.
//
//   shoot: node web/tools/drift-proof-490.mjs --shoot <tableId> --out <png>
//     Boots the real app (?table=<id>&cinema=1&seed=7), waits for
//     __test.ready + GI settle, screenshots the deterministic same-boot
//     frame.  Run once per tree (baseline tree + candidate tree) with
//     OB_E2E_PORT/OB_E2E_CDP_PORT pinned to the lane band.
//
//   prove: node web/tools/drift-proof-490.mjs --prove <pairs.json>
//              --out <proof.json>
//     pairs.json: [{"cls": "<tableId>", "a": "<png>", "b": "<png>"}, ...]
//     Per pair: SHA-256 both sides, decode (minimal PNG reader: 8-bit
//     RGB/RGBA, non-interlaced — the Chrome screenshot family), pixel
//     MAE.  Emits the proof JSON only after the cross-class duplicate
//     scan passes; a uniform (blank) frame is refused as non-evidence.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const args = process.argv.slice(2);
const arg = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};

/** Minimal PNG decode: 8-bit, color type 2 (RGB) / 6 (RGBA), deflate,
 * filters 0-4, non-interlaced. Returns { w, h, ch, data }. */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8;
  let w = 0;
  let h = 0;
  let ch = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      const depth = body[8];
      const color = body[9];
      const interlace = body[12];
      if (depth !== 8 || (color !== 2 && color !== 6) || interlace !== 0) {
        throw new Error(`unsupported PNG (depth ${depth} color ${color} `
          + `interlace ${interlace})`);
      }
      ch = color === 6 ? 4 : 3;
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const data = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = data.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? data.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[x - ch] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= ch ? prev[x - ch] : 0;
      let v = row[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = v & 0xff;
    }
  }
  return { w, h, ch, data };
}

function mae(pa, pb) {
  if (pa.w !== pb.w || pa.h !== pb.h || pa.ch !== pb.ch) {
    throw new Error(`geometry mismatch ${pa.w}x${pa.h}/${pa.ch} vs `
      + `${pb.w}x${pb.h}/${pb.ch}`);
  }
  let sum = 0;
  const n = pa.data.length;
  for (let i = 0; i < n; i++) sum += Math.abs(pa.data[i] - pb.data[i]);
  return sum / n;
}

/** Uniform-frame guard: a blank capture proves nothing.  review r24-r1
 * P3: the first-byte stride scan passed any solid non-gray frame —
 * the guard now samples whole PIXELS and requires a real population
 * of distinct RGB triples plus per-channel dynamic range. */
function assertNotBlank(p, name) {
  const seen = new Set();
  const mn = [255, 255, 255];
  const mx = [0, 0, 0];
  const px = p.w * p.h;
  for (let i = 0; i < px; i += 31) {
    const o = i * p.ch;
    const r = p.data[o];
    const g = p.data[o + 1];
    const b = p.data[o + 2];
    seen.add(r * 65536 + g * 256 + b);
    mn[0] = Math.min(mn[0], r); mx[0] = Math.max(mx[0], r);
    mn[1] = Math.min(mn[1], g); mx[1] = Math.max(mx[1], g);
    mn[2] = Math.min(mn[2], b); mx[2] = Math.max(mx[2], b);
  }
  const range = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  if (seen.size < 64 || range < 16) {
    throw new Error(`${name}: frame is near-uniform (${seen.size} distinct `
      + `RGB triples, range ${range}) — not render evidence`);
  }
}

if (arg('--shoot')) {
  const tableId = arg('--shoot');
  const out = arg('--out');
  if (!out) throw new Error('--out <png> required');
  mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  const { launchChrome, sleep, spawnStaticServer, stopStaticServer } =
    await import('./cdp.mjs');
  const webDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 26420);
  const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 26421);
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try {
    const url = `http://127.0.0.1:${PORT}/app.html?table=${tableId}`
      + '&cinema=1&seed=7';
    const chrome = await launchChrome(url, { port: CDP });
    try {
      let ready = false;
      for (let i = 0; i < 200 && !ready; i++) {
        await sleep(200);
        ready = await chrome.eval('window.__test?.ready === true')
          .catch(() => false);
      }
      if (!ready) throw new Error('app never became ready');
      // class-generic GI settle (same-boot determinism: the r23 pairs
      // proved byte-identical frames under this wait).  review r24-r1
      // P2: the timeout FAILS LOUDLY — a frame shot mid-GI-load would
      // compare two asynchronous lighting states and fake a drift (or
      // hide one).
      let giOk = false;
      for (let i = 0; i < 150 && !giOk; i++) {
        giOk = await chrome.eval(`(() => {
          const s = window.__gi && window.__gi.state;
          return !s || (s.ready && s.baked !== false);
        })()`).catch(() => false);
        if (!giOk) await sleep(200);
      }
      if (!giOk) {
        throw new Error(`${tableId}: GI never settled — a mid-load frame `
          + 'is not drift evidence');
      }
      await sleep(2500);
      await chrome.screenshot(path.resolve(out));
      console.log(`shot ${tableId} -> ${out}`);
    } finally {
      const gone = await chrome.closeAndWait();
      if (gone === false) {
        throw new Error('chrome teardown unconfirmed — port/profile unsafe');
      }
    }
  } finally {
    await stopStaticServer(server);
  }
} else if (arg('--prove')) {
  const pairs = JSON.parse(readFileSync(arg('--prove'), 'utf8'));
  const out = arg('--out');
  if (!out) throw new Error('--out <proof.json> required');
  const files = [];
  for (const p of pairs) {
    for (const side of ['a', 'b']) {
      const buf = readFileSync(p[side]);
      files.push({
        cls: p.cls, side, path: p[side],
        sha: createHash('sha256').update(buf).digest('hex'), buf,
      });
    }
  }
  // THE r24 EVIDENCE-INTEGRITY GATE: duplicate frames across classes =
  // a copied frame, never evidence. Refuse before any MAE is computed.
  // review r24-r1 P2: encoded-sha equality alone misses a re-encode
  // (same pixels, different PNG compression/metadata) — every input is
  // ALSO decoded and compared by its raw pixel hash across classes.
  for (const f of files) {
    f.px = decodePng(f.buf);
    // review r24-r2 P2: hash CANONICAL RGB pixels (alpha stripped) — an
    // RGB vs opaque-RGBA re-encode of the same frame must still refuse
    let rgb = f.px.data;
    if (f.px.ch === 4) {
      rgb = Buffer.alloc(f.px.w * f.px.h * 3);
      for (let i = 0, o = 0; i < f.px.data.length; i += 4, o += 3) {
        rgb[o] = f.px.data[i];
        rgb[o + 1] = f.px.data[i + 1];
        rgb[o + 2] = f.px.data[i + 2];
      }
    }
    f.pixSha = createHash('sha256')
      .update(Buffer.from([f.px.w & 0xff, f.px.w >> 8,
        f.px.h & 0xff, f.px.h >> 8]))
      .update(rgb).digest('hex');
  }
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      if (files[i].cls === files[j].cls) continue;
      const byteDup = files[i].sha === files[j].sha;
      const pixDup = files[i].pixSha === files[j].pixSha;
      if (byteDup || pixDup) {
        console.error('REFUSED: duplicate '
          + (byteDup ? 'file bytes' : 'decoded pixels (re-encoded copy)')
          + ' across classes —\n'
          + `  ${files[i].path} (${files[i].cls})\n`
          + `  ${files[j].path} (${files[j].cls})\n`
          + `  sha256 ${files[i].sha}\n  pixel-sha256 ${files[i].pixSha}\n`
          + 'a copied frame is not drift evidence (gate r21 P1-3).');
        process.exit(2);
      }
    }
  }
  const results = [];
  let allZero = true;
  for (const p of pairs) {
    const fa = files.find((f) => f.path === p.a && f.side === 'a');
    const fb = files.find((f) => f.path === p.b && f.side === 'b');
    const identical = fa.sha === fb.sha;
    let m = 0;
    const da = fa.px;
    assertNotBlank(da, p.a);
    const dims = { w: da.w, h: da.h };
    if (!identical) {
      const db = fb.px;
      assertNotBlank(db, p.b);
      m = mae(da, db);
    }
    allZero = allZero && m === 0;
    results.push({
      cls: p.cls, a: p.a, b: p.b, sha_a: fa.sha, sha_b: fb.sha,
      byte_identical: identical, mae: Number(m.toFixed(6)), ...dims,
    });
    console.log(`${p.cls}: ${identical ? 'byte-identical' : `MAE ${m.toFixed(6)}`}`);
  }
  writeFileSync(out, JSON.stringify({
    tool: 'drift-proof-490 r24',
    duplicate_sha_scan: 'pass (cross-class duplicates refused before MAE)',
    pairs: results,
  }, null, 1));
  console.log(`-> ${out}${allZero ? ' (ALL MAE 0.0)' : ''}`);
  if (!allZero) process.exit(1);
} else {
  console.error('usage: --shoot <tableId> --out <png> | '
    + '--prove <pairs.json> --out <proof.json>');
  process.exit(64);
}
