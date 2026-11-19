// Copyright (c) Meta Platforms, Inc. and affiliates.

// pixelverdict.mjs — ONE definition of the pixel-determinism verdicts, shared
// by scenario-render.mjs and hero-extend-render.mjs (and any future capture
// harness). A threshold copied per tool is a threshold that drifts (#254), so
// the classifier, both envelopes and the tier comparators live HERE.
//
// THE TWO-TIER VERIFY LAW (issues #345 / #346) — `VERIFY_LAW` below. It
// replaces the bare cross-boot byte-identity law for the ×2 determinism
// probes, which tested an ENVIRONMENT property, not a code property:
//
//   Tier A — SAME-BOOT ×2. Within ONE browser boot the sequence is staged
//   and captured twice (a fresh navigation + the full staging sequence
//   between the passes, so staging races re-roll — the classes this tier
//   exists to catch, e.g. the rod-less cuepost arm race of 2026-08-02). A
//   CONTENT-class difference here is a race, a seed, or an arm-order bug:
//   fail hard, never retried. Byte-identity is reported when achieved, but
//   it is NOT the green condition: the tier's original premise ("the #345
//   pixel state is per-BOOT, so it is held constant inside one boot") was
//   red-proved by measurement on 2026-08-03 — two navigations in one Chrome
//   process landed in two adjacent #345 states (ninety-rule probe: 516/516
//   frames at ±1 LSB on 22–78 isolated px ≈ 0.005 %, largest connected
//   component 2 px, the mask moving with the scene — the exact #243/#345
//   speckle signature, orders below any content footprint). The state pool
//   re-rolls per GL CONTEXT (per navigation), not per process, so the
//   same-boot pair consults the SAME content-vs-speckle envelope as Tier B.
//   What survives of the tier's strictness is exactly the code-shaped half:
//   content anywhere in a same-boot pair is a hard, unretryable red.
//
//   Tier B — CROSS-BOOT, statistical envelope. A second fresh boot's capture
//   is compared against boot 0 under the formalized #345 envelope below.
//   Issue #345 measured a pool of ≥6 stable per-boot pixel states on this
//   box (±1 LSB on 0.03–0.26 % of pixels, tree-independent, hour-scale
//   coherence windows), so cross-boot byte-identity is a per-pair lottery
//   (#346) that catches nothing content-shaped Tier A does not catch better.
//   A difference OUTSIDE the envelope is content-class and fails hard.
//
// THE #345 ENVELOPE (both tiers) — all three must hold on EVERY frame:
//   (a) magnitude  max per-channel |Δ| ≤ 1 LSB. The GPU-rounding mechanism
//       (#243/#345: two ANGLE pipeline variants rounding a tone-mapped value
//       on opposite sides of a boundary) can never move a value by 2.
//   (b) fraction   differing pixels ≤ 0.5 % of the frame. #345 measured
//       0.03–0.26 % at the regime's worst; 0.5 % covers that with ~2× margin
//       while staying far below any content-class observation (a rod is
//       whole percents of the frame).
//   (c) structure  no 8-connected component of differing pixels larger than
//       64 px. The #345 drift is ISOLATED texel speckle (dark rail wood /
//       cushion tops under the vignette; #243's original footprint was ~8
//       scattered px) — content is CONNECTED (the rod-less arm race changed
//       thousands of contiguous pixels). 64 px sits orders of magnitude
//       above the observed speckle granule and orders below any content
//       footprint, so the rule discriminates, never splits hairs.
//
// The STRICT #243 envelope (≤1 LSB on ≤1e-4 of the frame, no structure rule)
// is kept verbatim for the paths that still demand it (textanim-verify /
// legibility sheets) — the old stricter law is a subset of the new one, so
// prior packs' verdicts stay valid under both.
//
// THE CHUNKED WALK (/v1-chunked, issue #353). Renders are wedge-survivable
// (GH-248 checkpoint/resume, PR #351); the verify walks were not — each was
// a ~30–40 min CONTINUOUS pass (server boot + two staged same-boot captures
// + a cross-boot capture, plus the delivered-text-layer leg), and one
// infrastructure death anywhere (the #351 CDP wedge class, or the static
// server dying under load — both observed 2026-08-04) burned the whole
// pass. On a box that rarely yields a 30-minute clean window that is a
// non-converging loop, not a gate. So the verify frame-walk is split into
// chunks of VERIFY_CHUNK_FRAMES:
//
//   * Within each chunk the #348 two-tier semantics hold EXACTLY: the
//     chunk's frames are captured twice inside ONE boot with a full
//     restage between the passes (Tier A, the content wall), and a second
//     fresh boot's capture of the same frames is compared against pass 1
//     under the #345 envelope (Tier B). A completed chunk is CHECKPOINTED
//     (chunk verdict + per-frame hashes persisted); an infrastructure
//     death mid-chunk discards only the partial chunk and the walk resumes
//     at the chunk boundary after a bounded infrastructure relaunch.
//   * The verify verdict is the AND of all chunk verdicts under this ONE
//     law id; gates/verify records carry the chunk count and the relaunch
//     count. A content-class red in ANY chunk fails the whole verify
//     immediately (exit CONTENT_CLASS_EXIT), exactly as before.
//   * SAME-BOOT SEMANTICS UNDER CHUNKING: a Tier A pair is now
//     per-chunk-within-one-boot rather than whole-sequence-within-one-boot.
//     This WEAKENS NOTHING content-wise — every frame still belongs to
//     exactly one same-boot staged ×2 pair, so a content diff (a race, a
//     seed, an arm-order bug) shows within its chunk's pair — and it
//     matches the #348 measurement that the #345 environment pixel state
//     re-rolls per GL CONTEXT, i.e. per NAVIGATION: each staged capture
//     already re-navigates, so "one boot" never pinned the environment
//     state even before chunking. The tier's strictness was always the
//     content wall, and the wall now stands per chunk.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** The verify-law identifier recorded in gates/verify records (schema-
 * additive): which law certified a segment. Bump the /vN suffix on any
 * threshold or comparator change. `/v1-chunked` = the /v1 tiers and
 * thresholds verbatim, evaluated per chunk and ANDed (see the header). */
export const VERIFY_LAW = 'sameboot-x2+crossboot-envelope/v1-chunked';
export const ENVELOPE_MAX_DELTA = 1; // LSB per channel — rule (a)
export const ENVELOPE_MAX_FRAC = 0.005; // fraction of the frame — rule (b)
export const ENVELOPE_MAX_COMPONENT_PX = 64; // 8-connected px — rule (c)

/** CHUNK SIZE for the chunked verify walk (issue #353). ~150 frames is
 * ~5 min of ×2 same-boot probe capture at the plate probe's measured
 * ~1 s/frame — small enough that an infrastructure death forfeits minutes
 * (not the pass), large enough that the per-chunk boot + staging overhead
 * (~1 min for the chunk's two boots) stays a minor fraction of the chunk's
 * capture time. NOT tunable per run on purpose: two chunkings of one
 * sequence are two different checkpoint layouts, and a resumed verify must
 * consume the layout its checkpoint was written under. */
export const VERIFY_CHUNK_FRAMES = 150;

/** RELAUNCH BUDGET per verify attempt (one `verify` process run): beyond it
 * the attempt fails through the existing env-class path with its completed
 * chunks checkpointed, and a verify-only retry (#346) resumes them. Chunks
 * are cheap — the bound exists to stop a runaway (a box that killed the
 * infrastructure seven times inside one verify attempt is not converging,
 * and the retry loop above owns the longer clock). */
export const VERIFY_RELAUNCHES = 6;

/** The chunk partition of `total` frames: contiguous, non-overlapping
 * [from, to) windows covering 0..total-1 exactly, every chunk
 * VERIFY_CHUNK_FRAMES long except a shorter tail. Pure, so the selftest
 * red-proves the partition properties without a browser. */
export function verifyChunks(total, size = VERIFY_CHUNK_FRAMES) {
  if (!Number.isInteger(total) || total < 0) {
    throw new Error(`verifyChunks: total must be a non-negative integer, `
      + `got ${total}`);
  }
  if (!Number.isInteger(size) || size < 1) {
    throw new Error(`verifyChunks: chunk size must be a positive integer, `
      + `got ${size}`);
  }
  const chunks = [];
  for (let a = 0; a < total; a += size) {
    chunks.push([a, Math.min(a + size, total)]);
  }
  return chunks;
}

/** Content-class determinism reds exit the verify PROCESS with this code, so
 * a batch driver (scenario-batch) can tell "a real bug — stop, no retry"
 * from "the environment rolled — re-verify without re-rendering" (#346)
 * without parsing prose. */
export const CONTENT_CLASS_EXIT = 3;

/** Tag an error as content-class (Tier A red, or a structured/oversize Tier B
 * red): the dispatcher maps it to CONTENT_CLASS_EXIT. */
export function contentRed(message) {
  const e = new Error(message);
  e.contentClass = true;
  return e;
}

/** The tag SURVIVES AGGREGATION (review r2 P2): a content red that coincides
 * with a teardown failure arrives wrapped in an AggregateError ("the run
 * failed AND its http server did not shut down" — withServer), and the
 * exit-code mapping must still see it, or the batch driver would read a real
 * bug as retryable environment noise. */
export function isContentClass(e) {
  if (e?.contentClass === true) return true;
  return Array.isArray(e?.errors) && e.errors.some((k) => isContentClass(k));
}

/** the f%06d frame-file convention both capture harnesses write */
export function frameName(k) {
  return `f${String(k).padStart(6, '0')}.png`;
}

/** Classify ONE (frame, re-render) pair. Returns compact statistics plus a
 * MASK SIGNATURE — sha256 of the packed differing-pixel bitmap — so "is this
 * the same handful of pixels on every frame?" is answerable for all frames
 * without ever materialising a coordinate list (review r1 P2 on #254: a
 * `np.argwhere(...).tolist()` would expand to gigabytes on a broad 4K
 * mismatch, killing the classifier exactly when it is needed). Adds the #345
 * structure measurement: the largest 8-connected component of the diff mask.
 * `out` is optional — a diff PNG is written only for the sampled frames. */
export function classifyPixelPair(a, b, out = null) {
  return JSON.parse(execFileSync('python3', ['-c', `
import hashlib, json, sys
import numpy as np
from PIL import Image
s = json.load(sys.stdin)
A = np.asarray(Image.open(s['a']).convert('RGB'), dtype=np.int16)
B = np.asarray(Image.open(s['b']).convert('RGB'), dtype=np.int16)
if A.shape != B.shape:
    raise SystemExit('frame size mismatch %s vs %s' % (A.shape, B.shape))
D = np.abs(A - B)
m = D.max(axis=2) > 0
n = int(m.sum())
ys, xs = (np.nonzero(m) if n and n <= 32 else (np.empty(0), np.empty(0)))
if s['out']:
    Image.fromarray(np.clip(D * 12, 0, 255).astype('uint8')).save(s['out'])
# bounding box of the differing pixels: for an evidence crop, "where the two
# frames actually differ" is the only rectangle that cannot be pointed at the
# wrong part of the picture
bbox = None
if n:
    ry, rx = np.nonzero(m.any(axis=1))[0], np.nonzero(m.any(axis=0))[0]
    bbox = [int(rx[0]), int(ry[0]), int(rx[-1] - rx[0] + 1), int(ry[-1] - ry[0] + 1)]
# largest 8-connected component of the diff mask (#345 structure rule),
# labeled in pure numpy/python (no scipy on the render box): union-find over
# the sparse differing set. Above CAP pixels the labeling is SKIPPED and the
# component reported as n itself — the worst case, which can only make the
# verdict stricter (a frame that large is far outside the fraction bound
# anyway; a measurement that did not run must never widen an envelope).
comp = 0
CAP = 262144
if n:
    if n > CAP:
        comp = n
    else:
        cy, cx = np.nonzero(m)
        H, W = m.shape
        lin = cy.astype(np.int64) * W + cx.astype(np.int64)
        index = {int(v): i for i, v in enumerate(lin)}
        parent = list(range(n))
        def find(i):
            while parent[i] != i:
                parent[i] = parent[parent[i]]
                i = parent[i]
            return i
        for i, v in enumerate(lin.tolist()):
            y, x = divmod(v, W)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if dy == 0 and dx == 0:
                        continue
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W:
                        j = index.get(yy * W + xx)
                        if j is not None:
                            ri, rj = find(i), find(j)
                            if ri != rj:
                                parent[ri] = rj
        from collections import Counter
        comp = max(Counter(find(i) for i in range(n)).values())
json.dump({'changed': n, 'total': int(m.size), 'maxDelta': int(D.max()),
           'meanOverChanged': (float(D[D > 0].mean()) if n else 0.0),
           'maskSha256': hashlib.sha256(np.packbits(m).tobytes()).hexdigest(),
           'bbox': bbox, 'width': int(m.shape[1]), 'height': int(m.shape[0]),
           'maxComponentPx': comp,
           'pixels': [[int(y), int(x)] for y, x in zip(ys, xs)]}, sys.stdout)
`], { input: JSON.stringify({ a, b, out }), encoding: 'utf8' }));
}

/** Classify the differing frames of two capture directories (both written
 * with `frameName`), copying a BOUNDED evidence set (originals + diff PNGs
 * for the first `keepMax` differing frames) into `evidenceDir`. A frame whose
 * pixels are missing is returned `unclassified: true` — the verdicts score
 * that as the worst case, so a classification that failed to run can never
 * pass anything. */
export function classifyFrameDirs(dirA, dirB, differing,
  { evidenceDir, tag, keepMax = 3 }) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  return differing.map((k, j) => {
    const f0 = path.join(dirA, frameName(k));
    const f1 = path.join(dirB, frameName(k));
    if (!fs.existsSync(f0) || !fs.existsSync(f1)) {
      return { frame: k, unclassified: true };
    }
    const keep = j < keepMax;
    const st = classifyPixelPair(f0, f1,
      keep ? path.join(evidenceDir, `${tag}-diff-f${k}.png`) : null);
    if (keep) {
      fs.copyFileSync(f0, path.join(evidenceDir, `${tag}-a-f${k}.png`));
      fs.copyFileSync(f1, path.join(evidenceDir, `${tag}-b-f${k}.png`));
    }
    return { frame: k, ...st };
  });
}

/** TIER A's comparator: which frames differ between the two same-boot
 * passes. Byte-identity here is reported as the best outcome; a non-empty
 * `differing` set goes to `envelopeVerdict` for the content-vs-speckle
 * decision (see the header — the #345 state re-rolls per navigation, so a
 * same-boot ±1-LSB speckle is the environment, not code). A pure function
 * over the per-frame sha256 lists, so the selftest red-proves it without a
 * browser (the documented forced-nondeterminism stub: hash lists differing
 * at one index ARE a same-boot frame difference as far as this comparator
 * is concerned — it consumes nothing else). */
export function sameBootVerdict(hashesA, hashesB) {
  if (hashesA.length !== hashesB.length) {
    return { identical: false, differing: [],
      count: Math.abs(hashesA.length - hashesB.length),
      reason: `frame counts differ: ${hashesA.length} vs ${hashesB.length}` };
  }
  const differing = [];
  for (let k = 0; k < hashesA.length; k++) {
    if (hashesA[k] !== hashesB[k]) differing.push(k);
  }
  return { identical: differing.length === 0, differing,
    count: differing.length, reason: null };
}

/** THE #345 ENVELOPE VERDICT, decided in ONE place and consulted by BOTH
 * tiers (the state pool re-rolls per GL context, so a same-boot pair and a
 * cross-boot pair face the same environment — see the header). `stats` are
 * `classifyPixelPair` results, one per differing frame; a missing field is
 * scored as the WORST case. Returns `verdict: 'lsb-speckle'` (inside the
 * envelope — passable, loudly) or `'content'` (outside — content-class red),
 * with the measurements and which rules tripped. */
export function envelopeVerdict(stats) {
  if (!stats.length) {
    return { verdict: 'byte-identical', envelope: true, worstDelta: 0,
      worstFrac: 0, worstComponentPx: 0, tripped: [],
      how: 'byte-identical (no differing frames)' };
  }
  const worstDelta = Math.max(...stats.map((k) => k.maxDelta ?? 255));
  const worstFrac = Math.max(...stats.map((k) =>
    (k.changed ?? Infinity) / (k.total ?? 1)));
  const worstComponentPx = Math.max(...stats.map((k) =>
    k.maxComponentPx ?? Infinity));
  const tripped = [
    worstDelta <= ENVELOPE_MAX_DELTA ? null : 'magnitude',
    worstFrac <= ENVELOPE_MAX_FRAC ? null : 'fraction',
    worstComponentPx <= ENVELOPE_MAX_COMPONENT_PX ? null : 'structure',
  ].filter(Boolean);
  const how = `worst |Δ| ${worstDelta}/255 on `
    + `${(worstFrac * 100).toFixed(4)} % of pixels, largest connected diff `
    + `component ${worstComponentPx} px (envelope: ≤${ENVELOPE_MAX_DELTA} `
    + `LSB on ≤${ENVELOPE_MAX_FRAC * 100} % with no component > `
    + `${ENVELOPE_MAX_COMPONENT_PX} px)`;
  return { verdict: tripped.length ? 'content' : 'lsb-speckle',
    envelope: tripped.length === 0, worstDelta, worstFrac, worstComponentPx,
    tripped, how };
}

/** THE STRICT ISSUE-#243 ENVELOPE, kept verbatim for the paths that still
 * demand it (textanim-verify, the legibility sheet): at most ONE
 * least-significant bit, on at most 1e-4 of the frame — two Chrome/ANGLE
 * processes rounding a tone-mapped value on opposite sides of a boundary.
 * `stats` are `classifyPixelPair` results, one per differing frame; a missing
 * field is scored as the WORST case. */
export function strictEnvelope243(stats) {
  const worstDelta = Math.max(...stats.map((k) => k.maxDelta ?? 255));
  const worstFrac = Math.max(...stats.map((k) =>
    (k.changed ?? Infinity) / (k.total ?? 1)));
  return { worstDelta, worstFrac,
    envelope: worstDelta <= 1 && worstFrac <= 1e-4,
    how: `worst |Δ| ${worstDelta}/255 on `
      + `${(worstFrac * 100).toFixed(5)} % of pixels` };
}
