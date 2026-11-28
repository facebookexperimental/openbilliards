// Copyright (c) Meta Platforms, Inc. and affiliates.

// pixel-moments.mjs — PIXEL-CHANGE moment derivation for screencast clips
// (GH-525 S4 integrator; the replays lane's round-4 visual audit found
// dispatch-time `moments` 7–9 frames early — a moment's frame must be read
// off the FRAMES, never off the clock the driver dispatched an input on).
//
// pixelMoments({ frames, vw|scale, rois, probes }) → [{ id, from, srcFrame,
// threshold, noiseFloor, lagFrames, series }] where frames = the screencast
// JPEG paths in order, rois = { name: {x,y,w,h} in CSS px | null = whole
// frame }, scale = frame px per CSS px (derived from frames[0] / vw when
// absent), and each probe = { id, roi, kind, from, window?, floorFrames? }
// (floorFrames: the pre-`from` rest the change/state floor is read over,
// default 12; 0 = the fixed 0.3 % law — see the python):
//   change  first frame >= from whose ROI differs from its predecessor by
//           more than max(0.3 %, 4 × noise floor); floor = median diff over
//           the 12 frames BEFORE from (the pre-input rest).
//   settle  `from` = a DOM hint at/after the end of motion (moving() false,
//           landed): the floor is read >= 24 frames after it (the drivers
//           hold >= 1 s), the moment is the first frame of the quiet run
//           (6 frames under threshold) the hint sits in — walk back — or,
//           the screencast lagging the DOM so the hint still shows motion,
//           the first quiet run after it.
//   state   `from` = the GESTURE's dispatch frame, `ref` = the same-tick DOM
//           probe's frame: the first change after `from` (the response
//           painting), then the LAST maximal quiet run (>= 6 frames) inside
//           [first + 1, ref] = the settled state ON CAMERA (the run reaching
//           ref, or the last before it when the next gesture's paint already
//           arrives at ref); none = the screencast lags the DOM past ref ->
//           the first quiet run after max(ref, first + 1).
//   settled `from` = the GESTURE's dispatch frame, `ref` = the frame at the
//           driver's post-hold SETTLED probe: every frame in [from, ref] is
//           compared to the ref frame ITSELF; the moment = the first frame
//           of the run matching ref all the way up to ref (= the frame after
//           the region's LAST change). Card-arrival (card ROI) and move-end
//           (mover ROI) of the journeys ride this law (combined audit r2
//           finding 3: a DOM-probe-seeded 'change' named frames the pixels
//           did not show). The DOM instants ride beside as disclosure.
// python3 + PIL + numpy on this host (the play tool's synthetic-tag
// precedent). diff = CHANGED-PIXEL RATIO (share of ROI pixels whose grey
// level moved > 6 between consecutive JPEG q90 frames) — robust on the
// dark hall where a mean-abs metric hides a camera move under JPEG noise.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const MOMENTS_PY = `
import sys, json
import numpy as np
from PIL import Image
spec = json.load(open(sys.argv[1]))
frames = spec['frames']
s = spec.get('scale') or (Image.open(frames[0]).size[0] / float(spec['vw']))
cache = {}
def load(i):
    if i not in cache:
        cache[i] = np.asarray(Image.open(frames[i]).convert('L'), dtype=np.int16)
        if len(cache) > 8:
            del cache[max(cache, key=lambda k: abs(k - i))]
    return cache[i]
def crop(a, roi):
    if not roi: return a
    x0 = max(0, int(roi['x'] * s)); y0 = max(0, int(roi['y'] * s))
    x1 = min(a.shape[1], int((roi['x'] + roi['w']) * s)); y1 = min(a.shape[0], int((roi['y'] + roi['h']) * s))
    return a[y0:y1, x0:x1]
DELTA = int(spec.get('delta', 6))
MIN_THR = float(spec.get('minThr', 0.003))  # 0.3 % of the ROI's pixels
def diff(i, roi):
    # CHANGED-PIXEL RATIO: the share of ROI pixels whose grey level moved by
    # more than DELTA between frame i-1 and i (0..1). A mean-abs metric
    # dilutes a camera move on this dark hall below JPEG noise; a ratio does
    # not — motion shifts edges (many pixels, small share of the range),
    # noise flips few pixels past 6 levels.
    if i <= 0 or i >= len(frames): return 0.0
    a = crop(load(i - 1), roi); b = crop(load(i), roi)
    if a.size == 0 or a.shape != b.shape: return 0.0
    return float((np.abs(a - b) > DELTA).mean())
def floor_of(rng, roi):
    ds = [diff(i, roi) for i in rng]
    return float(np.median(ds)) if ds else 0.0
def quiet_from(i, roi, thr, limit):
    while i < min(len(frames) - 6, limit):
        if max(diff(j, roi) for j in range(i, i + 6)) <= thr: return i
        i += 1
    return None
def run_start(i, roi, thr, lo):
    # first frame of the quiet run that contains i (walk back, never below lo)
    while i - 1 >= lo and diff(i - 1, roi) <= thr: i -= 1
    return i
def is_quiet(i, roi, thr):
    return i + 6 <= len(frames) and max(diff(j, roi) for j in range(i, i + 6)) <= thr
out = []
for p in spec['probes']:
    roi = spec['rois'].get(p['roi']); kind = p.get('kind', 'change')
    f0 = max(1, int(p['from'])); limit = min(len(frames), f0 + int(p.get('window', 300)))
    ref = max(f0, int(p.get('ref', f0)))
    hit = None; series = []; tail = None
    if kind == 'settle':
        # the hint is a DOM instant at/after the end of motion, but the
        # screencast can LAG the DOM by several frames: the floor is read
        # >= 24 frames after the hint (the driver holds >= 1 s), then the
        # moment is the first frame of the quiet run the hint sits in (walk
        # back), or — hint still inside motion — the first quiet run after it
        floor = floor_of(range(min(len(frames) - 1, f0 + 24), min(len(frames), f0 + 36)), roi)
        thr = max(MIN_THR, 4.0 * floor)
        hit = run_start(f0, roi, thr, max(1, f0 - 300)) if is_quiet(f0, roi, thr) else quiet_from(f0, roi, thr, limit)
        series = [diff(j, roi) for j in range(max(1, (hit or f0) - 6), min(len(frames), (hit or f0) + 6))]
    elif kind == 'settled':
        # SETTLED-MATCH law (combined visual audit r2 finding 3): ref = the
        # frame at the driver's post-hold settled probe (the pose the auditor
        # judges the leg against), from = the gesture's dispatch frame. Every
        # frame in [from, ref] is compared to the REF frame itself (not to its
        # predecessor): the moment is the first frame of the run that matches
        # ref all the way up to ref — i.e. the frame right after the region's
        # LAST change. floor = the settled run's own noise against ref (median
        # over the 12 frames before ref); a region that never matches (ref
        # itself always does) cannot return None — a moment == ref means the
        # region was still changing one frame before the probe (disclosed by
        # lagFrames == ref - from and the series).
        ref = min(ref, len(frames) - 1)
        R = crop(load(ref), roi)
        def dref(i):
            a = crop(load(i), roi)
            if a.size == 0 or a.shape != R.shape: return 1.0
            return float((np.abs(a - R) > DELTA).mean())
        pre = [dref(j) for j in range(max(f0, ref - 12), ref)]
        floor = float(np.median(pre)) if pre else 0.0
        thr = max(MIN_THR, 4.0 * floor)
        hit = ref
        while hit - 1 >= f0 and dref(hit - 1) <= thr: hit -= 1
        # disclosure: the SUB-VISIBLE tail — the C2 mover decelerates, so the
        # frames just before the moment differ from the settled pose by well
        # under 1 % of the region's pixels (an eye calls them "in pose"); the
        # first frame of the run under 1 % is reported beside the moment
        vis = hit
        while vis - 1 >= f0 and dref(vis - 1) <= max(thr, 0.01): vis -= 1
        tail = {'under1pctFrom': vis, 'frames': hit - vis}
        series = [dref(j) for j in range(max(f0, hit - 12), min(ref + 1, hit + 12))]
    else:
        # floorFrames (default 12) = the pre-input rest the noise floor is read over; 0 = the FIXED 0.3 % law (a probe
        # whose ROI is at rest on a void and whose previous transition ended < 12 frames earlier — the boot's 200 ms
        # stage flips 300 ms apart — would otherwise read that transition as its floor and miss its own)
        ff = int(p.get('floorFrames', 12))
        floor = floor_of(range(max(1, f0 - ff), f0), roi) if ff > 0 else 0.0; thr = max(MIN_THR, 4.0 * floor)
        first = None
        for i in range(f0, limit):
            d = diff(i, roi); series.append(d)
            if d > thr: first = i; break
        if kind == 'state' and first is not None:
            # the response has painted by 'first'; the drivers probe the DOM
            # (ref) >= 1 s after the gesture, so the settled state is the LAST
            # maximal quiet run inside [first + 1, ref] — the run that reaches
            # ref, or the last one before it when the NEXT gesture's paint
            # already arrives at ref. A run shorter than 6 frames is not a
            # settle; none at all = the screencast lags the DOM past ref -> the
            # first quiet run after max(ref, first + 1).
            runs = []; i = first + 1
            while i <= ref:
                if diff(i, roi) <= thr:
                    j = i
                    while j + 1 <= ref and diff(j + 1, roi) <= thr: j += 1
                    runs.append((i, j)); i = j + 1
                else:
                    i += 1
            good = [r for r in runs if r[1] - r[0] + 1 >= 6]
            hit = good[-1][0] if good else quiet_from(max(ref, first + 1), roi, thr, limit)
        elif kind == 'change':
            hit = first
    out.append({'id': p['id'], 'kind': kind, 'from': f0, 'ref': ref, 'srcFrame': hit, 'threshold': round(thr, 4),
                'noiseFloor': round(floor, 4), 'lagFrames': (hit - f0) if hit is not None else None,
                'tail': tail, 'series': [round(x, 4) for x in series[:24]]})
json.dump(out, sys.stdout)
`;

export function pixelMoments(spec) {
  const specPath = path.join(path.dirname(spec.frames[0]), 'moments-spec.json');
  fs.writeFileSync(specPath, JSON.stringify(spec));
  const out = execFileSync('python3', ['-c', MOMENTS_PY, specPath],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out);
}

/** mp4 timeline for the source frames — the SAME durations the concat
 * assembly gives ffmpeg, so `t` / `f60` agree with the shipped clip. */
export function frameStarts(meta) {
  const starts = [];
  let t = 0;
  for (let i = 0; i < meta.length; i++) {
    const d = i + 1 < meta.length
      ? Math.min(0.5, Math.max(1 / 240, meta[i + 1].ts - meta[i].ts))
      : 1 / 30;
    starts.push(t);
    t += d;
  }
  return { starts, duration: t };
}

// ---- leading black run (GH-525 combined visual audit r1 finding 3) ---------
// Every journey clip opened on 0–0.32 s of black: the screencast starts on
// the driver's inter-scene BLANK card (#050505) and the new document's first
// paint is the boot overlay's uniform base (grey 8) — both under ffmpeg
// blackdetect's 10 % law (pixel luminance <= 0.1 × 255 ≈ 25). The clip
// pipeline TRIMS that lead: the clip starts at the first frame carrying any
// pixel above MAX_GREY (the first visible paint), and every moment index is
// re-derived against the trimmed frame list (trimLead) so frame numbers stay
// honest. The trimmed count is disclosed per clip (`trim` in the manifest).
export const LEAD_MAX_GREY = 24;
const LEAD_PY = `
import sys, json
import numpy as np
from PIL import Image
spec = json.load(open(sys.argv[1]))
n = 0
for f in spec['frames'][:int(spec.get('limit', 600))]:
    a = np.asarray(Image.open(f).convert('L'))
    if int(a.max()) > int(spec['maxGrey']): break
    n += 1
json.dump({'lead': n}, sys.stdout)
`;
/** number of LEADING frames whose every pixel is <= maxGrey (the black run);
 * frames = JPEG/PNG paths in order. A clip that is black throughout returns
 * its length (the caller must refuse such a clip). */
export function leadingBlackRun(frames, { maxGrey = LEAD_MAX_GREY, limit = 600 } = {}) {
  if (!frames.length) return 0;
  const specPath = path.join(path.dirname(frames[0]), 'lead-spec.json');
  fs.writeFileSync(specPath, JSON.stringify({ frames, maxGrey, limit }));
  const out = execFileSync('python3', ['-c', LEAD_PY, specPath],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return JSON.parse(out).lead;
}
/** Drop the leading `lead` frames from a screencast meta list IN PLACE and
 * shift every mark's frame index (srcFrame / ref) by the same amount (never
 * below 0 — a mark set during the black lead, e.g. the navigate dispatch,
 * lands on the clip's first frame and says so in its hint). Returns the
 * disclosure record for the manifest. */
export function trimLead(meta, marks, lead, { maxGrey = LEAD_MAX_GREY } = {}) {
  if (lead >= meta.length - 8) throw new Error(`trimLead: ${lead} black lead frames of ${meta.length} — the clip never painted`);
  const cutSeconds = lead > 0 ? Number((meta[lead].ts - meta[0].ts).toFixed(3)) : 0;
  meta.splice(0, lead);
  for (const m of marks) {
    const before = m.srcFrame;
    m.srcFrame = Math.max(0, m.srcFrame - lead);
    if (m.ref != null) m.ref = Math.max(0, m.ref - lead);
    // the disclosure frames (DOM probe / dispatch / settled probe) shift too
    for (const k of ['probeFrame', 'actionFrame', 'settledFrame']) if (m[k] != null) m[k] = Math.max(0, m[k] - lead);
    if (before < lead) m.hint += ` [dispatched during the trimmed black lead: src frame ${before} before the trim → the clip's first frame]`;
  }
  return { leadFrames: lead, leadSeconds: cutSeconds, maxGrey,
    law: `leading frames whose every pixel is <= grey ${maxGrey} (ffmpeg blackdetect's 10 % law) are cut; the clip starts at the first visible paint; every moment index below is on the TRIMMED frame list` };
}
