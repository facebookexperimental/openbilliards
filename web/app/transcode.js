// Copyright (c) Meta Platforms, Inc. and affiliates.

// transcode.js — webm → MP4/H.264 transcode for the iOS-shell Photos path
// (issue #157). LEAF module: reached ONLY via guarded dynamic import — the
// production producer is the DVR save card since GH-252 (playback.js
// probes + runs it in front of the chunked delivery wire; record.js's stop
// flow, the original caller, lost its transcode trio in GH-251). The
// cache-poison contract holds either way: an absent/stale copy degrades to
// an honest localized failure with the webm still deliverable, never a
// broken tap.
//
// Why it exists: the DEVICE WKWebView MediaRecorder negotiates webm too
// (#157 owner repro on hardware — the #51 "device records no webm"
// measurement is falsified), Photos accepts H.264/HEVC MP4 only, and the
// share sheet's Save Video fails SILENTLY on webm. So a webm-typed
// record-control stop re-encodes through the export pipeline's WebCodecs
// mp4 tier (offline-render.js createSink — reused, not duplicated) before
// the obPhotos handoff.
//
// The demuxer below is written FROM THE SPEC (RFC 8794 EBML + the Matroska
// element registry + WebM Container Guidelines) — never copied from any
// GPL parser (repo law; web/vendor carries MUXERS only). It handles the
// MediaRecorder shape: unknown-size Segment/Cluster streams, Tracks with
// V_VP9 / V_VP8 / A_OPUS, SimpleBlock + BlockGroup (ReferenceBlock ⇒
// delta), Xiph/fixed/EBML lacing, cluster-relative signed timecodes under
// TimecodeScale.
//
// Failure regime: EVERY defect (unsupported codec, decoder/encoder error,
// the measured WebKit/VideoToolbox zero-output stall — see the runExport
// FLUSH_WATCHDOG_MS note in offline-render.js — oversize output) rejects;
// the caller keeps the untouched webm deliverable and paints its honest
// localized reason (playback.transcodeFailed on the DVR card). Never a
// silent fail, never a throw into the tap (playback.js catches everything).

// ShareMessage.maxBytes mirror (share-bridge.md §3): the transcoded OUTPUT
// must clear the same native cap the delivery ladder pre-flights.
const SHARE_MAX_BYTES = 384 * 1024 * 1024;
// Inactivity watchdog (the offline-render.js FLUSH_WATCHDOG_MS pattern,
// issue #51 review F2): WebKit's VideoToolbox can accept configure+encode
// for avc1 yet deliver ZERO outputs and no error callback (measured on the
// iOS simulator) — without this, the backpressure loop and the final
// flush() await would hang the stop flow forever. 15 s of no decoder AND
// no encoder output = stalled; close() rejects the pending flush.
const WATCHDOG_MS = 15_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- EBML / Matroska demux (spec-derived, tolerant, read-only) ---------------
const ID = {
  EBML: 0x1A45DFA3,
  Segment: 0x18538067,
  SeekHead: 0x114D9B74,
  Info: 0x1549A966,
  TimecodeScale: 0x2AD7B1,
  Tracks: 0x1654AE6B,
  TrackEntry: 0xAE,
  TrackNumber: 0xD7,
  TrackType: 0x83,
  CodecID: 0x86,
  CodecPrivate: 0x63A2,
  DefaultDuration: 0x23E383,
  Video: 0xE0,
  PixelWidth: 0xB0,
  PixelHeight: 0xBA,
  Audio: 0xE1,
  SamplingFrequency: 0xB5,
  Channels: 0x9F,
  Cluster: 0x1F43B675,
  Timecode: 0xE7,
  SimpleBlock: 0xA3,
  BlockGroup: 0xA0,
  Block: 0xA1,
  ReferenceBlock: 0xFB,
  Cues: 0x1C53BB6B,
  Chapters: 0x1043A770,
  Tags: 0x1254C367,
  Attachments: 0x1941A469,
};
// an unknown-size Cluster (the MediaRecorder live-stream shape) ends where
// the next sibling at Segment level begins
const CLUSTER_TERMINATORS = new Set([ID.Cluster, ID.Cues, ID.Chapters,
  ID.Tags, ID.Attachments, ID.SeekHead, ID.Info, ID.Tracks]);

function vintLen(b) {
  for (let i = 0; i < 8; i++) if (b & (0x80 >> i)) return i + 1;
  return 0; // invalid VINT lead byte
}

/** Element ID: VINT with the marker bit KEPT (RFC 8794 §5). */
function readId(u8, p) {
  if (p >= u8.length) return null;
  const len = vintLen(u8[p]);
  if (!len || len > 4 || p + len > u8.length) return null;
  let id = 0;
  for (let i = 0; i < len; i++) id = id * 256 + u8[p + i];
  return { id, len };
}

/** Element size: VINT with the marker removed; all-ones ⇒ unknown (null). */
function readSize(u8, p) {
  if (p >= u8.length) return null;
  const len = vintLen(u8[p]);
  if (!len || len > 8 || p + len > u8.length) return null;
  let v = u8[p] & (0xFF >> len);
  let ones = v === (0xFF >> len);
  for (let i = 1; i < len; i++) {
    v = v * 256 + u8[p + i];
    ones = ones && u8[p + i] === 0xFF;
  }
  return { size: ones ? null : v, len };
}

const readUintBody = (u8, s, e) => {
  let v = 0;
  for (let i = s; i < e; i++) v = v * 256 + u8[i];
  return v;
};

function readFloatBody(u8, s, e) {
  const dv = new DataView(u8.buffer, u8.byteOffset + s, e - s);
  if (e - s === 4) return dv.getFloat32(0);
  if (e - s === 8) return dv.getFloat64(0);
  return 0;
}

const readStringBody = (u8, s, e) => {
  let out = '';
  for (let i = s; i < e && u8[i] !== 0; i++) out += String.fromCharCode(u8[i]);
  return out;
};

/** Block / SimpleBlock payload → { trackNumber, rel, key, frames[] }
 * (Matroska §block structure; all three lacing modes). */
function parseBlock(u8, start, end, isSimple) {
  let p = start;
  const tLen = vintLen(u8[p]);
  if (!tLen || p + tLen + 3 > end) return null;
  let trackNumber = u8[p] & (0xFF >> tLen);
  for (let i = 1; i < tLen; i++) trackNumber = trackNumber * 256 + u8[p + i];
  p += tLen;
  const raw = (u8[p] << 8) | u8[p + 1];
  const rel = raw & 0x8000 ? raw - 0x10000 : raw; // signed 16-bit
  p += 2;
  const flags = u8[p];
  p += 1;
  const key = isSimple ? (flags & 0x80) !== 0 : null;
  const lacing = (flags >> 1) & 0x3; // 0 none, 1 Xiph, 2 fixed, 3 EBML
  const frames = [];
  if (lacing === 0) {
    if (p > end) return null;
    frames.push(u8.subarray(p, end));
    return { trackNumber, rel, key, frames };
  }
  if (p >= end) return null;
  const count = u8[p] + 1;
  p += 1;
  if (count === 1) { // degenerate lace: the single frame is the remainder
    frames.push(u8.subarray(p, end));
    return { trackNumber, rel, key, frames };
  }
  const sizes = [];
  if (lacing === 2) { // fixed: equal split of the remainder
    const each = Math.floor((end - p) / count);
    for (let i = 0; i < count; i++) sizes.push(each);
  } else if (lacing === 1) { // Xiph: 255-run coded, last implicit
    for (let i = 0; i < count - 1; i++) {
      let s = 0;
      while (p < end && u8[p] === 255) { s += 255; p += 1; }
      if (p >= end) return null;
      s += u8[p];
      p += 1;
      sizes.push(s);
    }
    sizes.push(null);
  } else { // EBML: first absolute VINT, then signed VINT deltas, last implicit
    const first = readSize(u8, p);
    if (!first || first.size === null) return null;
    p += first.len;
    sizes.push(first.size);
    let prev = first.size;
    for (let i = 1; i < count - 1; i++) {
      const len = vintLen(u8[p]);
      if (!len || p + len > end) return null;
      let v = u8[p] & (0xFF >> len);
      for (let j = 1; j < len; j++) v = v * 256 + u8[p + j];
      prev += v - (2 ** (7 * len - 1) - 1); // signed-VINT bias (RFC 8794)
      p += len;
      sizes.push(prev);
    }
    if (count > 1) sizes.push(null);
  }
  let used = 0;
  for (const s of sizes) if (s !== null) used += s;
  const rem = end - p - used;
  if (rem < 0) return null;
  for (const s of sizes) {
    const len = s === null ? rem : s;
    if (p + len > end) return null;
    frames.push(u8.subarray(p, p + len));
    p += len;
  }
  return { trackNumber, rel, key, frames };
}

/** Demux a MediaRecorder webm buffer → tracks + timestamped encoded chunks.
 * Tolerant: a truncated tail stops the walk and keeps every chunk read so
 * far (the decode leg fails honestly if the result is unusable). */
export function demuxWebm(u8) {
  const out = { timecodeScale: 1_000_000, video: null, audio: null };
  const tracks = new Map(); // trackNumber → track record

  const parseTrackEntry = (s, e) => {
    const tr = { number: 0, type: 0, codecId: '', codecPrivate: null,
      width: 0, height: 0, sampleRate: 0, channels: 0, defaultDurationNs: 0 };
    let p = s;
    while (p < e) {
      const id = readId(u8, p);
      if (!id) break;
      const sz = readSize(u8, p + id.len);
      if (!sz || sz.size === null) break;
      const ds = p + id.len + sz.len;
      const de = ds + sz.size;
      if (de > e) break;
      switch (id.id) {
        case ID.TrackNumber: tr.number = readUintBody(u8, ds, de); break;
        case ID.TrackType: tr.type = readUintBody(u8, ds, de); break;
        case ID.CodecID: tr.codecId = readStringBody(u8, ds, de); break;
        case ID.CodecPrivate: tr.codecPrivate = u8.slice(ds, de); break;
        case ID.DefaultDuration: tr.defaultDurationNs = readUintBody(u8, ds, de); break;
        case ID.Video: {
          let q = ds;
          while (q < de) {
            const vid = readId(u8, q);
            if (!vid) break;
            const vsz = readSize(u8, q + vid.len);
            if (!vsz || vsz.size === null) break;
            const vs = q + vid.len + vsz.len;
            if (vid.id === ID.PixelWidth) tr.width = readUintBody(u8, vs, vs + vsz.size);
            if (vid.id === ID.PixelHeight) tr.height = readUintBody(u8, vs, vs + vsz.size);
            q = vs + vsz.size;
          }
          break;
        }
        case ID.Audio: {
          let q = ds;
          while (q < de) {
            const aid = readId(u8, q);
            if (!aid) break;
            const asz = readSize(u8, q + aid.len);
            if (!asz || asz.size === null) break;
            const as = q + aid.len + asz.len;
            if (aid.id === ID.SamplingFrequency) {
              tr.sampleRate = readFloatBody(u8, as, as + asz.size);
            }
            if (aid.id === ID.Channels) tr.channels = readUintBody(u8, as, as + asz.size);
            q = as + asz.size;
          }
          break;
        }
        default: break;
      }
      p = de;
    }
    if (tr.number) tracks.set(tr.number, tr);
  };

  const blocks = []; // { trackNumber, tsTicks, key, frames[] }
  const parseCluster = (s, e, unknownSize) => {
    let clusterTc = 0;
    let p = s;
    while (p < e) {
      const id = readId(u8, p);
      if (!id) return u8.length; // truncated/garbled tail: stop the walk
      if (unknownSize && CLUSTER_TERMINATORS.has(id.id)) return p;
      const sz = readSize(u8, p + id.len);
      if (!sz || sz.size === null) return u8.length; // only Cluster streams unsized
      const ds = p + id.len + sz.len;
      const de = ds + sz.size;
      if (de > e) return u8.length;
      if (id.id === ID.Timecode) {
        clusterTc = readUintBody(u8, ds, de);
      } else if (id.id === ID.SimpleBlock) {
        const b = parseBlock(u8, ds, de, true);
        if (b) blocks.push({ trackNumber: b.trackNumber,
          tsTicks: clusterTc + b.rel, key: b.key, frames: b.frames });
      } else if (id.id === ID.BlockGroup) {
        let q = ds;
        let block = null;
        let hasRef = false;
        while (q < de) {
          const gid = readId(u8, q);
          if (!gid) break;
          const gsz = readSize(u8, q + gid.len);
          if (!gsz || gsz.size === null) break;
          const gs = q + gid.len + gsz.len;
          if (gid.id === ID.Block) block = parseBlock(u8, gs, gs + gsz.size, false);
          if (gid.id === ID.ReferenceBlock) hasRef = true;
          q = gs + gsz.size;
        }
        if (block) blocks.push({ trackNumber: block.trackNumber,
          tsTicks: clusterTc + block.rel, key: !hasRef, frames: block.frames });
      }
      p = de;
    }
    return p;
  };

  // top level: EBML header then (usually unknown-size) Segment
  let p = 0;
  while (p < u8.length) {
    const id = readId(u8, p);
    if (!id) break;
    const sz = readSize(u8, p + id.len);
    if (!sz) break;
    const ds = p + id.len + sz.len;
    if (id.id === ID.Segment) {
      const end = sz.size === null ? u8.length : Math.min(ds + sz.size, u8.length);
      let q = ds;
      while (q < end) {
        const cid = readId(u8, q);
        if (!cid) break;
        const csz = readSize(u8, q + cid.len);
        if (!csz) break;
        const cs = q + cid.len + csz.len;
        if (cid.id === ID.Cluster) {
          const cEnd = csz.size === null ? end : Math.min(cs + csz.size, end);
          q = csz.size === null ? parseCluster(cs, cEnd, true) : (parseCluster(cs, cEnd, false), cEnd);
        } else if (csz.size === null) {
          break; // only Segment/Cluster stream unsized — bail on anything else
        } else {
          if (cid.id === ID.Info) {
            let ip = cs;
            const ie = cs + csz.size;
            while (ip < ie) {
              const iid = readId(u8, ip);
              if (!iid) break;
              const isz = readSize(u8, ip + iid.len);
              if (!isz || isz.size === null) break;
              const is = ip + iid.len + isz.len;
              if (iid.id === ID.TimecodeScale) {
                out.timecodeScale = readUintBody(u8, is, is + isz.size) || 1_000_000;
              }
              ip = is + isz.size;
            }
          } else if (cid.id === ID.Tracks) {
            let tp = cs;
            const te = cs + csz.size;
            while (tp < te) {
              const tid = readId(u8, tp);
              if (!tid) break;
              const tsz = readSize(u8, tp + tid.len);
              if (!tsz || tsz.size === null) break;
              const ts = tp + tid.len + tsz.len;
              if (tid.id === ID.TrackEntry) parseTrackEntry(ts, ts + tsz.size);
              tp = ts + tsz.size;
            }
          }
          q = cs + csz.size;
        }
      }
      p = end;
    } else {
      if (sz.size === null) break;
      p = ds + sz.size;
    }
  }

  // ticks → microseconds under TimecodeScale (ns per tick; default 1 ms)
  const toUs = (ticks) => Math.round(ticks * out.timecodeScale / 1000);
  for (const tr of tracks.values()) {
    if (tr.type === 1 && !out.video) {
      out.video = { codecId: tr.codecId, width: tr.width, height: tr.height,
        trackNumber: tr.number, chunks: [] };
    } else if (tr.type === 2 && !out.audio) {
      out.audio = { codecId: tr.codecId, sampleRate: tr.sampleRate || 48000,
        channels: tr.channels || 2, codecPrivate: tr.codecPrivate,
        trackNumber: tr.number,
        frameDurUs: tr.defaultDurationNs ? Math.round(tr.defaultDurationNs / 1000) : 20_000,
        chunks: [] };
    }
  }
  for (const b of blocks) {
    const ts = toUs(b.tsTicks);
    if (out.video && b.trackNumber === out.video.trackNumber) {
      // laced video is spec-legal but frame-timing-lossy — MediaRecorder
      // never laces video; refuse instead of guessing timestamps
      if (b.frames.length === 1) {
        out.video.chunks.push({ ts, key: b.key === null ? false : b.key,
          data: b.frames[0] });
      } else {
        out.video.laced = true;
      }
    } else if (out.audio && b.trackNumber === out.audio.trackNumber) {
      for (let i = 0; i < b.frames.length; i++) {
        out.audio.chunks.push({ ts: ts + i * out.audio.frameDurUs,
          data: b.frames[i] });
      }
    }
  }
  return out;
}

// ---- WebCodecs config helpers -------------------------------------------------
const VIDEO_DECODE_CODECS = { V_VP9: 'vp09.00.10.08', V_VP8: 'vp8' };
// VP9 level follows the SOURCE dimensions (review round-8 P2): the offline
// renderer emits above-1080p VP9 as level 5.1 (vp09.00.51.08), and an
// implementation validating levels would reject a 4K stream decoded under
// the level-1.0 string — probe and runtime both pick through this helper.
const vp9CodecFor = (w, h) => (w > 1920 || h > 1080
  ? 'vp09.00.51.08' : VIDEO_DECODE_CODECS.V_VP9);
// createSink's avc level split (offline-render.js): ≤1080p 640028, above 640033
const avcCodecFor = (w, h) => (w > 1920 || h > 1080 ? 'avc1.640033' : 'avc1.640028');

/** Feature probe for the transcode leg (issue #157 capabilities evidence):
 * DECODE probes (VideoDecoder vp9/vp8, AudioDecoder opus) that
 * detectExportSupport (encode-only) never asks, plus the avc encode leg.
 * Never throws; absent interfaces read as false. */
export async function probeTranscodeSupport() {
  const p = async (fn) => { try { return (await fn())?.supported === true; } catch { return false; } };
  const hasVD = typeof VideoDecoder !== 'undefined';
  const hasAD = typeof AudioDecoder !== 'undefined';
  const hasVE = typeof VideoEncoder !== 'undefined';
  const [vp9, vp8, vp9Uhd, vp8Uhd, opus, avcHd, avcUhd] = await Promise.all([
    hasVD ? p(() => VideoDecoder.isConfigSupported(
      { codec: VIDEO_DECODE_CODECS.V_VP9, codedWidth: 1920, codedHeight: 1080 })) : false,
    hasVD ? p(() => VideoDecoder.isConfigSupported(
      { codec: VIDEO_DECODE_CODECS.V_VP8, codedWidth: 1920, codedHeight: 1080 })) : false,
    // GH-251 review round-3 P2 (ADDITIVE): the DECODER runs at the SOURCE
    // dimensions — a >1080p source needs its own decode probes, or the
    // offer gate would pass on HD-only VP decoding and the job then
    // deterministically fails
    hasVD ? p(() => VideoDecoder.isConfigSupported(
      { codec: vp9CodecFor(3840, 2160), codedWidth: 3840, codedHeight: 2160 })) : false,
    hasVD ? p(() => VideoDecoder.isConfigSupported(
      { codec: VIDEO_DECODE_CODECS.V_VP8, codedWidth: 3840, codedHeight: 2160 })) : false,
    hasAD ? p(() => AudioDecoder.isConfigSupported(
      { codec: 'opus', sampleRate: 48000, numberOfChannels: 2 })) : false,
    hasVE ? p(() => VideoEncoder.isConfigSupported({ codec: 'avc1.640028',
      width: 1920, height: 1080, bitrate: 8e6, framerate: 60 })) : false,
    // 8e6, not the export tier's 40e6 (review round-6 P2): this probe
    // predicts THE TRANSCODE, whose sink runs 8 Mbps at every size
    // (createSink bitrate below) — probe and runtime must ask the same
    // question of a level/bitrate-enforcing implementation
    hasVE ? p(() => VideoEncoder.isConfigSupported({ codec: 'avc1.640033',
      width: 3840, height: 2160, bitrate: 8e6, framerate: 60 })) : false,
  ]);
  const aacEnc = typeof AudioEncoder !== 'undefined'
    ? await p(() => AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2',
      sampleRate: 48000, numberOfChannels: 2, bitrate: 128_000 })) : false;
  return { videoDecoder: hasVD, audioDecoder: hasAD, videoEncoder: hasVE,
    vp9, vp8, vp9Uhd, vp8Uhd, opus, avcHd, avcUhd, aacEnc,
    // the headline verdict: can a video-only ≤1080p webm reach mp4 at all
    // (per-clip needs — audio legs, UHD decode+encode — are the caller's
    // gate over the fields above; playback.js transcodeOkFor())
    ok: (vp9 || vp8) && avcHd };
}

/** Transcode a MediaRecorder webm blob to MP4/H.264 (+AAC when an audio
 * track exists). Reuses offline-render.js's createSink (VideoEncoder avc1 +
 * AudioEncoder AAC + vendored mp4-muxer with the measured encoderDelay
 * edts) via dynamic feature-detected access. Video-only input supported
 * (the canvas-only recording). Rejects on ANY failure — including the
 * watchdogged zero-output stall — with the input untouched.
 * `onProgress(done, total)` reports demuxed-chunk feed progress.
 * Returns a Blob { type: 'video/mp4' }. */
export async function transcodeWebmToMp4(blob, { onProgress, signal } = {}) {
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('transcode: empty input');
  }
  if (typeof VideoDecoder === 'undefined' || typeof VideoEncoder === 'undefined'
    || typeof EncodedVideoChunk === 'undefined') {
    throw new Error('transcode: WebCodecs video interfaces unavailable');
  }
  // offline-render.js via dynamic import + feature detection (rule-5
  // corollary: no new named static import edges; a stale pairing degrades
  // to a clean reject, never a SyntaxError in the stop path)
  const or = await import('./offline-render.js');
  if (typeof or.createSink !== 'function') {
    throw new Error('transcode: export sink unavailable (stale offline-render)');
  }

  const mux = demuxWebm(new Uint8Array(await blob.arrayBuffer()));
  const v = mux.video;
  if (!v || !v.chunks.length || v.laced) {
    throw new Error('transcode: no usable video track demuxed');
  }
  if (!(v.width > 0 && v.height > 0)) throw new Error('transcode: no video dimensions');
  const vCodec = v.codecId === 'V_VP9' ? vp9CodecFor(v.width, v.height)
    : VIDEO_DECODE_CODECS[v.codecId];
  if (!vCodec) throw new Error(`transcode: unsupported video codec ${v.codecId}`);
  // audio: transcode it when present — NEVER silently strip the user's
  // sound (a mute Photos save would be a quiet lie); missing WebCodecs
  // audio support fails the whole leg → share fallback keeps the webm
  let a = null;
  if (mux.audio && mux.audio.chunks.length) {
    if (mux.audio.codecId !== 'A_OPUS') {
      throw new Error(`transcode: unsupported audio codec ${mux.audio.codecId}`);
    }
    if (typeof AudioDecoder === 'undefined' || typeof AudioEncoder === 'undefined'
      || typeof EncodedAudioChunk === 'undefined') {
      throw new Error('transcode: audio track present but WebCodecs audio unavailable');
    }
    a = mux.audio;
  }

  // H.264 4:2:0 requires EVEN dimensions; canvases are frequently odd
  // (measured: 1280×713 headless). Crop a single edge row/column off via
  // VideoFrame visibleRect (zero-copy) instead of failing the whole leg.
  const outW = v.width & ~1;
  const outH = v.height & ~1;
  if (!(outW > 0 && outH > 0)) throw new Error('transcode: degenerate video dimensions');

  // decode + encode probes BEFORE any pump (feature-detect, never assume)
  const vd = await VideoDecoder.isConfigSupported({ codec: vCodec,
    codedWidth: v.width, codedHeight: v.height }).catch(() => null);
  if (vd?.supported !== true) {
    throw new Error(`transcode: no ${vCodec} decoder in this WebKit/Chrome`);
  }
  const ve = await VideoEncoder.isConfigSupported({
    codec: avcCodecFor(outW, outH), width: outW, height: outH,
    bitrate: 8e6, framerate: 60 }).catch(() => null);
  if (ve?.supported !== true) throw new Error('transcode: no H.264 encoder');
  if (a) {
    const ad = await AudioDecoder.isConfigSupported({ codec: 'opus',
      sampleRate: 48000, numberOfChannels: a.channels }).catch(() => null);
    if (ad?.supported !== true) throw new Error('transcode: no opus decoder');
    // AAC encode probe AT THE SOURCE CHANNEL COUNT (issue #157 two-track
    // review, minor): the sink's AAC encoder is configured to a.channels
    // below — a mono tap recording must fail HERE (honest reject → share
    // fallback) if this WebKit/Chrome cannot encode mono AAC, never as a
    // mid-pump WebCodecs error
    const ae = await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2',
      sampleRate: 48000, numberOfChannels: a.channels,
      bitrate: 128_000 }).catch(() => null);
    if (ae?.supported !== true) {
      throw new Error(`transcode: no ${a.channels}-channel AAC encoder`);
    }
  }

  // rebase both tracks onto a COMMON zero so the source A/V skew survives
  // (a MediaRecorder webm pins one track's first block at ~0 and the other
  // carries its real start offset — measured 36 ms audio-late headless).
  // The mp4 sink runs firstTimestampBehavior:'cross-track-offset' (issue
  // #157 two-track review, blocker): the muxer's default 'strict' mode
  // validates PER TRACK and throws on the later track's every chunk —
  // inside the encoder output callbacks, where it used to be a SILENT
  // track drop. Under 'cross-track-offset' the base is the earliest first
  // DTS across tracks (our common zero), so timestamps pass unchanged.
  let t0 = v.chunks[0].ts;
  if (a) t0 = Math.min(t0, a.chunks[0].ts);

  const encoderDelay = a && typeof or.measureAacEncoderDelay === 'function'
    ? await or.measureAacEncoderDelay() : 0;
  const sink = or.createSink({ format: 'mp4', width: outW, height: outH,
    bitrate: 8e6, // the record.js videoBitsPerSecond — quality-parity re-encode
    withAudio: !!a, encoderDelay,
    audioChannels: a?.channels ?? 2,
    firstTimestampBehavior: 'cross-track-offset',
    // issue #197 (decoded judder root cause): the sink's default
    // frameRate-derived 60-tick timescale re-gridded every VFR realtime-
    // capture timestamp to 1/60 s (measured: 52 duplicate-PTS frames +
    // 141/192 re-gridded deltas on a 193-frame headless capture). µs
    // timescale preserves the source cadence losslessly. A stale
    // offline-render pairing ignores the option (observable via the
    // sink.videoTimescale marker) and degrades to the pre-#197 re-grid —
    // playable, never corrupt, so the job proceeds.
    videoTimescale: 1_000_000 });
  // cache-poison guard (rule-5 corollary): a STALE offline-render.js
  // pairing ignores the two options above and keeps the muxer 'strict' —
  // the silent track drop would come straight back. The per-track muxed
  // counters double as the feature marker: absent counters = stale sink =
  // honest reject for any audio-carrying input (video-only inputs rebase
  // to exactly 0 and stay safe on either sink).
  if (a && typeof sink.audioChunks !== 'number') {
    sink.close();
    throw new Error('transcode: stale export sink (no two-track support)');
  }

  let stalled = false;
  let aborted = false;
  let pumpError = null;
  let lastBeat = performance.now();
  const beat = () => { lastBeat = performance.now(); };
  let dec = null;
  let adec = null;
  const shutdown = () => { // rejects any pending decode/flush per WebCodecs
    try { dec?.close(); } catch { /* already closed */ }
    try { adec?.close(); } catch { /* already closed */ }
    sink.close();
  };
  const onAbort = () => { aborted = true; shutdown(); };
  signal?.addEventListener('abort', onAbort);
  const watchdog = setInterval(() => {
    if (performance.now() - Math.max(lastBeat, sink.lastOutput || 0) > WATCHDOG_MS) {
      stalled = true;
      shutdown();
    }
  }, 1000);

  const bail = () => {
    if (aborted) return new DOMException('transcode cancelled', 'AbortError');
    if (stalled) {
      return new Error(`transcode: encoder/decoder stalled — no output for `
        + `${WATCHDOG_MS / 1000} s (the measured WebKit VideoToolbox soft spot)`);
    }
    return pumpError ?? sink.error ?? null;
  };

  try {
    const total = v.chunks.length + (a?.chunks.length ?? 0);
    let done = 0;

    // ---- video pump: demuxed chunks → VideoDecoder → avc1 sink -------------
    let encodedFrames = 0;
    const pumpVideo = async () => {
      let lastKeyUs = 0;
      const needsCrop = outW !== v.width || outH !== v.height;
      dec = new VideoDecoder({
        output: (frame) => {
          beat();
          let cropped = null;
          try {
            const key = encodedFrames === 0
              || frame.timestamp - lastKeyUs >= 2_000_000; // ~2 s GOP
            if (key) lastKeyUs = frame.timestamp;
            if (needsCrop) { // even-dimension crop (zero-copy clone)
              cropped = new VideoFrame(frame,
                { visibleRect: { x: 0, y: 0, width: outW, height: outH } });
            }
            sink.video.encode(cropped ?? frame, { keyFrame: key });
            encodedFrames++;
          } catch (e) {
            pumpError = pumpError ?? e;
          } finally {
            cropped?.close();
            frame.close();
          }
        },
        error: (e) => { pumpError = pumpError ?? e; },
      });
      dec.configure({ codec: vCodec, codedWidth: v.width, codedHeight: v.height });
      for (const c of v.chunks) {
        const err = bail();
        if (err) throw err;
        dec.decode(new EncodedVideoChunk({ type: c.key ? 'key' : 'delta',
          timestamp: c.ts - t0, data: c.data }));
        beat();
        done++;
        onProgress?.(done, total);
        // backpressure — bounded by the watchdog/abort (the runExport law)
        while (dec.decodeQueueSize > 8 || sink.video.encodeQueueSize > 4) {
          const e2 = bail();
          if (e2) throw e2;
          await sleep(4);
        }
      }
      await dec.flush(); // stall/abort close() rejects this — never hangs
      {
        const err = bail();
        if (err) throw err;
      }
      if (encodedFrames === 0) throw new Error('transcode: decoder produced no frames');
    };

    // ---- audio pump: opus → AudioDecoder → AAC sink -------------------------
    const pumpAudio = async () => {
      adec = new AudioDecoder({
        output: (ad) => {
          beat();
          try { sink.audio.encode(ad); } catch (e) { pumpError = pumpError ?? e; }
          finally { ad.close(); }
        },
        error: (e) => { pumpError = pumpError ?? e; },
      });
      adec.configure({ codec: 'opus', sampleRate: 48000,
        numberOfChannels: a.channels,
        ...(a.codecPrivate ? { description: a.codecPrivate } : {}) });
      for (const c of a.chunks) {
        const err = bail();
        if (err) throw err;
        adec.decode(new EncodedAudioChunk({ type: 'key',
          timestamp: Math.max(0, c.ts - t0), data: c.data }));
        beat();
        done++;
        onProgress?.(done, total);
        while (adec.decodeQueueSize > 16 || sink.audio.encodeQueueSize > 8) {
          const e2 = bail();
          if (e2) throw e2;
          await sleep(4);
        }
      }
      await adec.flush();
      const err = bail();
      if (err) throw err;
    };

    // Pump ORDER carries correctness under 'cross-track-offset' (issue
    // #157 two-track review): the muxer resolves its base offset from the
    // tracks it has SEEN — if the later-starting track reached it first,
    // that track's skew would be swallowed and A/V sync silently shifted.
    // So the earlier-starting track pumps first, and its ENCODER is
    // flushed before the other pump starts (encoder output callbacks are
    // async — the flush guarantees its first chunk is muxed, pinning the
    // base at our common zero). The flush is safe mid-job: that track is
    // fully fed, and finalize()'s re-flush of a drained encoder is a
    // no-op. The watchdog stays armed across both pumps (close() rejects
    // a hanging flush — the measured WebKit zero-output stall).
    if (a && a.chunks[0].ts < v.chunks[0].ts) {
      await pumpAudio();
      try { await sink.audio.flush(); } catch (e) { throw bail() ?? e; }
      await pumpVideo();
    } else {
      await pumpVideo();
      if (a) {
        try { await sink.video.flush(); } catch (e) { throw bail() ?? e; }
        await pumpAudio();
      }
    }

    // ---- finalize (watchdog stays armed — the flush-stall defense) ----------
    let bytes;
    try {
      bytes = await sink.finalize();
    } catch (e) {
      const err = bail();
      throw err ?? e;
    }
    const err = bail();
    if (err) throw err;
    // per-track muxed-chunk floor (the #157 honesty law): a track that
    // muxed ZERO samples means a corrupt output — mute video or a
    // track-stripped file delivered as success. Fail the job; the caller
    // keeps the original webm.
    if (!(sink.videoChunks > 0)) {
      throw new Error('transcode: no video chunks reached the muxer');
    }
    if (a && !(sink.audioChunks > 0)) {
      throw new Error('transcode: audio track muxed zero chunks — refusing '
        + 'a track-stripped mp4 (never silently strip the user\'s sound)');
    }
    if (bytes.length > SHARE_MAX_BYTES) {
      throw new Error('transcode: mp4 output exceeds the 384 MiB bridge cap');
    }
    return new Blob([bytes], { type: 'video/mp4' });
  } catch (e) {
    shutdown(); // no partial state survives; the caller keeps the webm
    throw e;
  } finally {
    clearInterval(watchdog);
    signal?.removeEventListener('abort', onAbort);
    try { dec?.close(); } catch { /* closed */ }
    try { adec?.close(); } catch { /* closed */ }
  }
}
