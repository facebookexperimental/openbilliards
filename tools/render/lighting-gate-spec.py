#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-gate-spec.py — GENERATE tools/render/fixtures/lighting-gate-spec.json with per-band provenance.

Every photo band is built HERE from the admissible reads (photo id, ROI px, value ± σ, source reader/verifier), by one
stated rule, and the reads ride inside the JSON row (`reads`, `band_rule`) so the gate is auditable without this
script. Thresholds that are not photo ratios (display saturation) are tagged AUTHORED with the reason.

BAND RULE (ORDER-LIGHT-2 L1, the SNK-12 N4 law: no band may be widened after a red read): a band is the ENVELOPE of the
admissible reads' own 1σ intervals, [min(v−σ), max(v+σ)] — the smallest interval that contains every admissible read at
its own uncertainty; inadmissible reads (clipped crowns, upper bounds, studio context) are LISTED beside it and never
enter it. The inverse-variance mean and the sample scatter are recorded alongside as `mean` / `scatter` so a reader can
see where inside the envelope the reads cluster.

  python3 tools/render/lighting-gate-spec.py [--reads-json tools/render/fixtures/lighting-ball-reads.json] [--out tools/render/fixtures/lighting-gate-spec.json]
The ball reads live in tools/render/fixtures/lighting-ball-reads.json (reads only: photo id, ROI px, value, σ, source,
admissibility — no photo pixels), so the spec regenerates from the repo alone; lighting-gate.py --regen-check proves
spec == generator(fixture).
"""
import argparse, json, os, re, statistics as st
# ---- constants the TREE declares (read at build time; rows whose bound is 'inside / at the GI window' or 'before the legacy wait' derive from these,
# never from a literal — ORDER-LIGHT-C2-FIX1 land16 regate 2: FIX-nogi-wait's authored 2500 ms measured the box (2531 at load1 52.6 / idle 0.5 % / 36 shells)) ----
_HERE = os.path.dirname(os.path.abspath(__file__))
_MAIN_JS = os.path.join(_HERE, '..', '..', 'web', 'app', 'main.js'); _LV_JS = os.path.join(_HERE, '..', '..', 'web', 'scene', 'lightingvisuals.js')
_m = re.search(r'VENUE_GI_WINDOW_MS\s*=\s*(\d+)', open(_MAIN_JS).read())
if not _m: raise SystemExit('lighting-gate-spec: cannot read VENUE_GI_WINDOW_MS from web/app/main.js — the derived rows have no bound')
GI_WINDOW_MS = int(_m.group(1))  # the ONE settle budget: the bounded first-settle conditions (lightingvisuals.js attempt: rigQuiet / fadeSettled / cubeCurrent while elapsed < VENUE_GI_WINDOW_MS), the GI hold, the leaf stall
_m2 = re.search(r'giOk = [^\n]*elapsed > (\d+)', open(_LV_JS).read())
if not _m2: raise SystemExit('lighting-gate-spec: cannot read the legacy settle wait (giOk … elapsed > N) from web/scene/lightingvisuals.js')
LEGACY_GI_WAIT_MS = int(_m2.group(1))  # the pre-FIX5 legacy settle rule's GI wait (?venueSettle=legacy) — the constant FIX-gifail-wait's arm waits; a literal in the leaf today, to be NAMED in the next leaf round
DERIVED_WINDOW = dict(symbol='VENUE_GI_WINDOW_MS', value=GI_WINDOW_MS, file='web/app/main.js')
DERIVED_LEGACY = dict(symbol='legacy settle giOk elapsed > N (lightingvisuals.js)', value=LEGACY_GI_WAIT_MS, file='web/scene/lightingvisuals.js')

HERE = os.path.dirname(os.path.abspath(__file__))


def envelope(reads):
    adm = [r for r in reads if r['admissible']]
    lo = min(r['value'] - r['pm'] for r in adm); hi = max(r['value'] + r['pm'] for r in adm)
    w = [1 / r['pm'] ** 2 for r in adm]; mu = sum(r['value'] * ww for r, ww in zip(adm, w)) / sum(w)
    vals = [r['value'] for r in adm]
    return {'lo': round(lo, 4), 'hi': round(hi, 4), 'target': round((lo + hi) / 2, 4), 'pm': round((hi - lo) / 2, 4),
            'mean': round(mu, 4), 'scatter': round(st.pstdev(vals), 4), 'n_admissible': len(adm),
            'n_inadmissible': len(reads) - len(adm),
            # the STRICT range = the admissible VALUES alone (no σ): reported beside every envelope verdict;
            # a single admissible read has no range — None (the gate prints "single read")
            'strict': ({'lo': round(min(vals), 4), 'hi': round(max(vals), 4)} if len(vals) > 1 else None)}


def read(source, frame, roi, value, pm, admissible, note='', upper_bound=False):
    return dict(source=source, frame=frame, roi=roi, value=value, pm=pm, admissible=admissible, upper_bound=upper_bound, note=note)


def bound(reads):
    """one-sided ceiling from reads that are USABLE AS BOUNDS only (clipped references: a clipped bed makes the true
    ratio LOWER than read, so max(v+σ) is a safe ceiling) — `admissible: false` as values, `upper_bound: true`."""
    ub = [r for r in reads if r.get('upper_bound')]
    hi = max(r['value'] + r['pm'] for r in ub)
    return {'hi': round(hi, 4), 'target': round(hi, 4), 'pm': 0.0, 'n_bounds': len(ub), 'n_admissible': 0,
            'strict': {'lo': round(min(r['value'] for r in ub), 4), 'hi': round(max(r['value'] for r in ub), 4)}}


# ---- ORDER-LIGHT-C2-FIX2 (maintainer, after the land17 slip): the PLAN-KEY law. The reads a capture produces are keyed by the POKE LABEL
# (`table@label`, the label = the text before the first '=' of the poke passed to lighting-capture.mjs), never by the seal's SET name; a row whose
# `table` / `arm_table` names a key its `reads_from` / `arm_from` set does not produce reads NO-READ after the whole capture (land17: two rows keyed
# @rebakedefer where the set's poke is `rebake2`, found by check-arms after a 5 h capture). The spec builder now derives the plan from
# tools/render/lighting-seal.sh — every capture step's set name, its tables, whether it carries a base run (--no-base), and the labels of the
# pokes it passes — and REFUSES (exit 7, the rows named) before writing the fixture, and again as the seal's own first step (--check-keys).
def seal_plan(seal_path):
    txt = open(seal_path).read()
    pokevars = {}
    for m in re.finditer(r"^\s*([A-Z0-9_]+_JS)=(['\"])([A-Za-z0-9_-]+)=", txt, re.M): pokevars[m.group(1)] = m.group(3)
    mixed = re.search(r"^MIXED=\(([^)]*)\)", txt, re.M); mixed = mixed.group(1).split() if mixed else []
    pred = re.search(r"^PRED=(\S+)", txt, re.M); pred = pred.group(1) if pred else 'predator_apex_9ft'
    plan = {}
    joined = re.sub(r"\\\n\s*", " ", txt)  # a step continued with a trailing backslash is ONE plan line (scope / arm / legacyrect carry their pokes there)
    for line in joined.split('\n'):
        m = re.search(r"step capture-(\S+) .*?--out \"(?:\$PWD/)?\$ROOT/after-\$TAG-([^\"]+)\"", line)
        if not m: continue
        rest = line[m.end():]
        tables = re.search(r"--tables (\S+)", rest); tables = tables.group(1).replace('$PRED', pred).split(',') if tables else [pred]
        labels = set()
        if '--no-base' not in rest: labels.add(None)
        for pv in re.findall(r"--poke(?:-raw)? \"\$([A-Z0-9_]+)\"", rest): labels.add(pokevars.get(pv, '?' + pv))  # --poke "$VAR" and --poke-raw "$VAR" (the label = the var's text before '=')
        for lb in re.findall(r"--poke '([A-Za-z0-9_-]+)=", rest): labels.add(lb)
        if 'CONVARG[@]' in rest: labels.add(pokevars.get('CONV_JS', 'conv'))
        names = [m.group(2)]
        if '$MX' in m.group(2): names = [m.group(2).replace('$MX', mx) for mx in mixed]
        for n in names:
            plan.setdefault(n, {'tables': set(), 'labels': set()})
            plan[n]['tables'].update(tables); plan[n]['labels'].update(labels)
    plan.setdefault('after', {'tables': set(), 'labels': {None}})
    return plan
def check_plan_keys(rows, plan):
    bad = []
    for r in rows:
        for which, key_field, set_field in (('reads', 'table', 'reads_from'), ('arm', 'arm_table', 'arm_from')):
            key = r.get(key_field); setn = r.get(set_field)
            if which == 'arm' and not r.get('arm'): continue
            if not key or not setn or setn == 'reads': continue
            if setn not in plan: continue
            label = key.split('@', 1)[1] if '@' in key else None
            if label not in plan[setn]['labels']:
                bad.append(f"{r.get('id')}: {key_field}='{key}' names {'label ' + repr(label) if label else 'the base run'} of set '{setn}', whose plan produces {sorted(str(x) for x in plan[setn]['labels'])}")
    return bad

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--reads-json', default=os.path.join(HERE, 'fixtures', 'lighting-ball-reads.json'))
    ap.add_argument('--out', default=os.path.join(HERE, 'fixtures', 'lighting-gate-spec.json'))
    ap.add_argument('--check-keys', action='store_true', help='validate the COMMITTED fixture (--spec) against the seal plan and exit 7 on a mis-keyed row (the seal runs this before its first capture)')
    ap.add_argument('--spec', default=None, help='with --check-keys: the fixture to validate (default: the --out path)')
    ap.add_argument('--seal', default=os.path.join(HERE, 'lighting-seal.sh'))
    a = ap.parse_args()
    if a.check_keys:
        spec_in = json.load(open(a.spec or a.out)); rows_in = spec_in['rows'] if isinstance(spec_in, dict) else spec_in
        bad = check_plan_keys(rows_in, seal_plan(a.seal))
        if bad:
            print('[gate-spec] --check-keys PLAN-KEY REFUSAL — ' + str(len(bad)) + ' row(s):'); [print('  ' + b) for b in bad]; raise SystemExit(7)
        print(f'[gate-spec] --check-keys OK: every armed row of {a.spec or a.out} resolves to a read key the seal plan produces ({len(rows_in)} rows)'); raise SystemExit(0)
    if not os.path.exists(a.reads_json):
        raise SystemExit(f'ball reads fixture missing: {a.reads_json}')
    ball = json.load(open(a.reads_json))
    under = [r for r in ball if r['quantity'] == 'under/crown']
    equator = [r for r in ball if r['quantity'] == 'equator/crown']
    # ---- room reads (Predator dossier; display domain; from reads/predator + verify JSON) ----
    # ROOM-wall references are CLIPPED (hero-1 bed satAny 1.00, hero-2 0.97, STL rail-top 0.69): by the README clip rule
    # they are NOT admissible as values; a clipped denominator makes the true ratio LOWER, so each is usable as a
    # one-sided UPPER BOUND only (ORDER-LIGHT-3 M3). The STL read is ceiling / rail-top cloth, not wall / bed.
    wall = [read('reader', 'predator/00-overview/apex-9ft-arena-hero-1.jpg', {'wall_red': [200, 760, 400, 820], 'bed': [900, 1255, 980, 1295]}, 0.010, 0.016, False, 'red arena wall / bed; bed B-clipped (satAny 1.00) → usable as an UPPER bound only', upper_bound=True),
            read('reader', 'predator/00-overview/apex-9ft-arena-hero-2.jpg', {'wall_red': [100, 60, 300, 110], 'bed': [820, 600, 910, 645]}, 0.008, 0.007, False, 'red arena wall / bed; bed B-clipped (satAny 0.97) → upper bound only', upper_bound=True),
            read('reader', 'predator/05-broadcast-frames/event-2026-pbs-stl-worldopen.webp', {'ceiling': [2000, 1800, 2300, 1900], 'railtop': [3700, 2659, 3800, 2661]}, 0.012, 0.001, False, 'ballroom CEILING / rail-top cloth (not a wall); rail top B-clipped (satAny 0.69) → upper bound only', upper_bound=True)]
    floor = [read('reader', 'predator/05-broadcast-frames/event-2022-csi-canho-matchphoto.webp', {'floor': 'reads/predator/event-2022-csi-canho-matchphoto-R-D.json'}, 0.222, 0.043, True, 'hall floor / bed, bed UNCLIPPED (the one admissible floor read)'),
             read('reader', 'predator/05-broadcast-frames/event-2022-csi-canho-matchphoto.webp', {'floor_fore': 'same file'}, 0.114, 0.016, True, 'near floor / bed, unclipped'),
             read('reader', 'predator/00-overview/apex-9ft-arena-hero-1.jpg', {'floor_right': '…hero-1-R-D.json'}, 0.304, 0.043, False, 'grey carpet; bed clipped → upper bound (green-only 0.24)'),
             read('reader', 'predator/00-overview/apex-9ft-arena-hero-2.jpg', {'floor_right': '…hero-2-R-D.json'}, 0.802, 0.039, False, 'bed clipped → upper bound (green-only 0.68)'),
             read('reader', 'predator/05-broadcast-frames/event-2023-world10ball-lasvegas.jpg', {'floor': '…lasvegas-R-D.json'}, 0.367, 0.047, False, 'bed clipped → upper bound (green-only 0.31)')]
    railtop = [read('reader', 'predator/02-pocket-closeups/official-pocket-cushion-closeup.jpg', {'railtop': [1000, 2090, 1300, 2130], 'bed': [1000, 1700, 1300, 1900]}, 1.036, 0.010, True, 'GREEN-CHANNEL surrogate (the studio bed is B-clipped, satAny 0.58 → the Y read 1.035 is inadmissible by the clip rule); cushion-top cloth / bed'),
               read('verifier', 'predator/02-pocket-closeups/official-pocket-cushion-closeup.jpg', {'railtop': 'verify/official-pocket-cushion-closeup-R-B.json'}, 1.053, 0.003, False, 'Y read on the clipped bed — inadmissible, listed'),
               read('reader', 'predator/05-broadcast-frames/event-2022-csi-canho-matchphoto.webp', {'nose_top_near': 'reads/predator/event-2022-csi-canho-matchphoto-R-B.json'}, 1.102, 0.022, False, 'rail top B-clipped → upper bound')]
    # record-row read sets (ORDER-LIGHT-3 M3: every band is COMPUTED by envelope(), none typed)
    shadow_reads = [read('reader', 'predator/02-pocket-closeups/official-pocket-cushion-closeup.jpg', {'shadow': [1000, 2040, 1300, 2080], 'bed': [1000, 1700, 1300, 1900]}, 0.688, 0.011, True, 'GREEN-channel surrogate left of the pocket (bed B-clipped: the Y read 0.715 is an upper bound)'),
                    read('reader', 'predator/02-pocket-closeups/official-pocket-cushion-closeup.jpg', {'shadow2': [2900, 2040, 3200, 2080], 'bed2': [2900, 1700, 3200, 1900]}, 0.706, 0.014, True, 'green-channel surrogate right of the pocket (Y 0.723 upper bound)')]
    star_strip = [read('reader', 'star/02-broadcast/germanmasters-2025-10.jpg', {'strip': 'reads/star/germanmasters-2025-10-R-B-R-D.json'}, 0.88, 0.07, True, '17 mm strip / far bed (includes 2–3 nose-transition rows — verifier)'),
                  read('verifier', 'star/02-broadcast/germanmasters-2025-10.jpg', {'strip': 'verify/germanmasters-2025-10-RB-sensitivity.json'}, 1.02, 0.05, True, 'row-profile strips 0.96–1.05'),
                  read('reader', 'star/02-broadcast/masters-table-closeup.jpg', {'strip': 'reads/star/masters-table-closeup-R-H-R-B-R-D.json'}, 0.89, 0.05, True, '50–100 mm from the nose')]
    star_nose = [read('reader', 'star/02-broadcast/germanmasters-2025-10.jpg', {'nose_face': 'reads/star/germanmasters-2025-10-R-B-R-D.json'}, 0.081, 0.019, True, '9 px face'),
                 read('verifier', 'star/02-broadcast/masters-table-closeup.jpg', {'nose_face': 'verify/masters-table-closeup-RB-RC-RH.json'}, 0.133, 0.028, True, '13 px face')]
    joy_wall = [read('reader', 'joy/midext-hunt-2026-08-30/05-joyofficial-goldlegPRO-midpocket-topdown-liner-t27m32s.jpg', {'wall_L': [288, 255, 304, 320], 'bed': [340, 15, 460, 75]}, 0.392, 0.208, True, 'whole strip, graded 0.22–0.41'),
                read('reader', 'same', {'wall_R': [568, 262, 582, 320]}, 0.441, 0.245, True, 'whole strip (box at the wall/lip edge — verifier)'),
                read('verifier', 'same', {'wall_L': [292, 225, 314, 325]}, 0.271, 0.115, True, ''),
                read('verifier', 'same', {'wall_R': [548, 225, 570, 325]}, 0.248, 0.088, True, '')]
    joy_top = [read('reader', 'joy/…05-…t27m32s.jpg', {'railtop_L': [60, 150, 180, 250]}, 0.785, 0.049, True, ''), read('reader', 'same', {'railtop_R': [660, 150, 780, 250]}, 0.831, 0.046, True, ''),
               read('verifier', 'same', {'railtop_L': 'verify/05-midpocket-topdown-RC.json'}, 0.803, 0.062, True, ''), read('verifier', 'same', {'railtop_R': 'same'}, 0.840, 0.061, True, '')]
    # ---- CLUB-ROOM class references (ORDER-LIGHT-4 N1): the dressing's own venue class — a club room / pool hall.
    # Reads by this lane's instrument (output/lighting/reads/room/*.json); admissible = the bed unclipped (satAny ≤ 0.05)
    # AND the ROI uniform enough that its ± (half the p10–p90 spread) is smaller than its value.
    room_floor = [read('lane', 'predator/05-broadcast-frames/event-2022-csi-canho-matchphoto.webp (CSI event HALL, grey carpet)', {'floor_L': [0, 470, 140, 670], 'bed': [450, 250, 750, 350]}, 0.218, 0.065, True, 'bed satAny 0.018'),
                  read('lane', 'same', {'floor_R': [1060, 470, 1200, 670]}, 0.230, 0.077, True, ''),
                  read('lane', 'same', {'floor_fore': [150, 700, 300, 790]}, 0.114, 0.021, True, 'near floor, out of the table\'s pool'),
                  read('lane', 'diamond/01-official/official-ourtables-zoom3.jpg (HOME ROOM, box light over the bed)', {'rug': [300, 930, 550, 1050], 'bed': [250, 625, 550, 685]}, 0.039, 0.030, True, 'patterned rug beside the table; bed satAny 0.003'),
                  read('lane', 'same', {'tile_floor': [0, 850, 180, 1000]}, 0.111, 0.350, False, 'NON-UNIFORM (± 0.35 > value): tile floor + rug edge in one box'),
                  read('lane', 'joy/existing-pack/src_csy_arena_joy_table.jpg (CLUB room, carpet)', {'carpet_fore': [420, 650, 570, 770], 'bed': [420, 150, 680, 200]}, 0.072, 0.076, False, 'NON-UNIFORM (± ≥ value)'),
                  read('lane', 'same', {'carpet_L': [0, 600, 150, 750]}, 0.044, 0.065, False, 'NON-UNIFORM'),
                  read('lane', 'same', {'carpet_R': [700, 650, 930, 780]}, 0.305, 0.348, False, 'NON-UNIFORM (lit patch + shadow)'),
                  read('lane', 'joy/existing-pack/src_csy_showroom_joy_table.jpg (SHOWROOM, panel lights)', {'carpet_L': [0, 1750, 300, 2000], 'bed': [500, 1100, 850, 1160]}, 0.058, 0.088, False, 'NON-UNIFORM; showroom class (brighter walls, panel lights) — context')]
    room_wall = [read('lane', 'diamond/01-official/official-ourtables-zoom3.jpg (HOME ROOM)', {'stone_wall_L': [120, 260, 370, 380], 'bed': [250, 625, 550, 685]}, 0.017, 0.003, True, 'fieldstone wall, far from the box light'),
                 read('lane', 'same', {'stone_wall_R': [700, 300, 950, 390]}, 0.146, 0.082, True, 'fieldstone wall on the lit side'),
                 read('lane', 'same', {'wood_panel': [0, 420, 80, 570]}, 0.257, 0.144, True, 'knotty-pine panel wall beside the table'),
                 read('lane', 'joy/existing-pack/src_csy_arena_joy_table.jpg (CLUB)', {'brick_wall': [880, 20, 940, 100], 'bed': [420, 150, 680, 200]}, 0.061, 0.060, True, 'painted brick at the window'),
                 read('lane', 'same', {'far_wall': [140, 20, 200, 70]}, 0.032, 0.051, False, 'NON-UNIFORM (TV glow beside it)'),
                 read('lane', 'joy/existing-pack/src_csy_showroom_joy_table.jpg (SHOWROOM)', {'wall_white': [1300, 700, 1450, 850]}, 0.727, 1.169, False, 'NON-UNIFORM; showroom white wall — context (walls 0.37–0.73 of the bed under panel lights)'),
                 read('lane', 'predator/05-broadcast-frames/event-2022-csi-canho-matchphoto.webp (HALL)', {'barrier_black': [150, 160, 230, 220]}, 0.006, 0.002, False, 'black event BARRIER cloth, not a wall — context')]
    room_wood = [read('lane', 'diamond/01-official/official-ourtables-zoom3.jpg (HOME ROOM)', {'wood_panel': [0, 420, 80, 570], 'bed': [250, 625, 550, 685]}, 0.257, 0.144, True, 'the one admissible wood-surface read in the class (a pine panel wall)'),
                 read('lane', 'same', {'mantel_wood': [300, 378, 600, 392]}, 0.020, 0.031, False, 'NON-UNIFORM (mantel edge)'),
                 read('lane', 'joy/existing-pack/src_csy_showroom_joy_table.jpg (SHOWROOM)', {'cue_rack_wood': [850, 700, 1150, 850]}, 1.003, 1.522, False, 'NON-UNIFORM; pale showroom cue-rack — context')]
    bands = {'under': envelope(under), 'equator': envelope(equator), 'wall': bound(wall), 'floor': envelope(floor), 'railtop': envelope(railtop),
             'room_floor': envelope(room_floor), 'room_wall': envelope(room_wall), 'room_wood': envelope(room_wood),
             'shadow': envelope(shadow_reads), 'star_strip': envelope(star_strip), 'star_nose': envelope(star_nose), 'joy_wall': envelope(joy_wall), 'joy_top': envelope(joy_top)}
    BR = 'envelope [min(v−σ), max(v+σ)] over ADMISSIBLE reads only (ORDER-LIGHT-2 L1)'
    rows = []
    # C2-FIX10 (the gate refuses a judged row with arm:false and no arm_note): every unarmed judged row DECLARES why it has no negative control.
    UNARMED_NOTES = {
        'C2AD-n1-gated-inwindow': 'unarmed by construction: a boolean the studio poke sets; its negative control is the legacy twin\'s frames, judged by check-studiofill (2)',
        'C2AD-n1-gated-postwindow': 'unarmed by construction: the revert clears the gate; the restore is judged by check-studiofill (3)',
        'C2AD-n1-uniform-gameplay': 'unarmed: this is the live REFERENCE side of the in-window zero (C2AD-n1-uniform-inwindow carries the legacy-twin arm)',
        'C2AD-n1-uniform-postwindow': 'unarmed: the restored coefficients are judged against the pre-window frame by check-studiofill (3); no rig term fails this read alone',
        'C2AD-n2-samplercancel-terminal': 'unarmed by construction: the terminal path is the plant\'s own outcome (venueDerived 0 after a cancel); the legacy twin has the same read',
        'C2AD-n2-samplerfail-terminal': 'unarmed by construction: the terminal path is the plant\'s own outcome; the legacy twin has the same read',
        'C2AD-n2-samplerhold-terminal': 'unarmed by construction: the terminal path is the plant\'s own outcome; the legacy twin has the same read',
        'C2AD-n2-samplercancel-fired': 'unarmed by construction: the plant\'s own witness (the cancel fired) — a missing read fails closed',
        'C2AD-n3-stallstraddle-planted': 'unarmed by construction: the plant\'s own witness (the busy loop ran) — a missing read fails closed',
        'C2AD-n4-pastbudgetwall-crossing': 'unarmed: RECORD-shaped judged row (>= 0) — the wall flag is recorded beside the effective one (C2AD-n4-pastbudgeteff-crossing carries the arm)',
    }
    for _q in ('venueBake1FrameMs', 'venueH3BakeCpuMs', 'venueH3BakeFrameMs', 'venueH3BoundMs', 'venueStallMs', 'venueStallPlantDueMs', 'venueStallPlantEndedMs', 'venueStallPlantStartedMs', 'venueWaitedEffMs', 'venueWaitedMs'):
        UNARMED_NOTES[f'C2AD-n3-stallstraddle-{_q.lower()}'] = 'unarmed by construction: RECORD-shaped judged row (>= 0) — no rig term can fail it; kept judged so a missing read fails closed'
    def row(**k):
        if k.get('arm') is False and not k.get('record') and not k.get('arm_note') and not k.get('noread_ok') and k.get('id') in UNARMED_NOTES:
            k['arm_note'] = UNARMED_NOTES[k['id']]
        rows.append(k)
    for look in ('default', 'sp'):
        T = dict(table='predator_apex_9ft', look=look)
        # ---- AUTHORED thresholds (display saturation is not a photo ratio; the ask is the issue's) ----
        row(id=f'P638-sat-{look}', symptom='#638 cue ball clips', pose='cueball_level', quantity='ball:0:disc_sat', op='<=', target=0.03, pm=0.0, arm=True,
            provenance='AUTHORED', source='issue #638 ask: "cue ball satAll ≈ 0 %" — a DISPLAY saturation threshold; no photo ratio exists for saturation (a clipped photo is inadmissible by construction). 0.03 = the canopy tables\' own specular-highlight fraction (0.002–0.01) + margin (BEFORE 0.77 / 0.58)', **T)
        row(id=f'P638-crownsat-{look}', symptom='#638 crown clips', pose='cueball_level', quantity='ball:0:crown_sat', op='<=', target=0.15, pm=0.0, arm=True,
            provenance='AUTHORED', source='crown band (n_y > 0.55) ≥ 250/255 fraction; the bars\' specular highlight sits inside this band and may clip (canopy tables read 0.009–0.035 at key-only; the Predator key-only read 0.035) (BEFORE 1.00)', **T)
        row(id=f'P638-rack-{look}', symptom='#638 every bed ball', pose='rack_level', quantity='ball:1:disc_sat', op='<=', target=0.25, pm=0.0, arm=True,
            provenance='AUTHORED', source='racked ball-1 disc satAny; the racked balls\' crowns carry the bars\' highlights (key-only 0.006; canopy tables 0.000–0.345 by ball set) (BEFORE 0.68 / 0.57)', **T)
        # ---- PHOTO bands (admissible reads only, envelope rule) ----
        b = bands['under']
        row(id=f'P638-terminator-{look}', symptom='#638 terminator (OUTPUT of the derived fill vs the photo band)', pose='cueball_level', quantity='ratio:ball0_under_over_crown_disp', op='band', target=b['target'], pm=b['pm'], arm=True, record=True,
            provenance='OUTPUT', band_rule=BR, band=b, reads=under,
            source=f"cue ball under/crown, display domain, ARENA-CLASS admissible reads only: {b['n_admissible']} reads (Diamond Accu-Stats 05/09/11, reader + verifier boxes; crown satAny ≤ 0.03) → envelope {b['lo']}–{b['hi']} (inv-var mean {b['mean']}, scatter {b['scatter']}); {b['n_inadmissible']} inadmissible reads listed, not used (JOY clipped crowns 0.149–0.296; Diamond-13 0.253/0.262 upper bounds) (BEFORE 0.80 / 0.71)", **T)
        b = bands['equator']
        row(id=f'P638-equator-{look}', symptom='#638 terminator (OUTPUT of the derived fill vs the photo band)', pose='cueball_level', quantity='ratio:ball0_eq_over_crown_disp', op='band', target=b['target'], pm=b['pm'], arm=True, record=True,
            provenance='OUTPUT', band_rule=BR, band=b, reads=equator,
            source=f"cue ball equator/crown, display domain: {b['n_admissible']} admissible reads (Diamond arena 05/09/11 + Predator official-video2-05 reader/verifier) → envelope {b['lo']}–{b['hi']} (mean {b['mean']}, scatter {b['scatter']}; the video read is definition-dependent — the ball\'s lower part is occluded, so its \"equator\" sits 25–35 % below the pole) (BEFORE 0.97 / 0.96)", **T)
        # ---- ROOM rows (ORDER-LIGHT-2 L2) ----
        b = bands['room_floor']
        row(id=f'ROOMC-floor-{look}', symptom='Predator room (CLUB class): floor / bed', pose='full34', quantity='ratio:floor_over_bed_disp', op='band', target=b['target'], pm=b['pm'], arm=False,
            arm_note='WEAK ARM (report §8.5 / §9.4): the class band is a venue-class luminance envelope (carpet 0.11–0.23, rug 0.04) and the probe-flooded BEFORE room (0.169 default) sits inside it — the band cannot discriminate a black room from a lit one; the row is kept JUDGED as a class-range check and the arm is declared, not faked',
            provenance='PHOTO', band_rule=BR, band=b, reads=room_floor,
            source=f"club-room class (the dressing\'s own class, §L8.1): CSI hall carpet 0.114–0.230, home-room rug 0.039 — envelope {b['lo']}–{b['hi']} (strict {b['strict']['lo']}–{b['strict']['hi']}); ours = the walnut plank floor beside the +kx rail at class albedo 0.10 (BEFORE = authored 0.012 under the 4.4× probe: 0.169 / 0.003)", **T)
        b = bands['room_wall']
        row(id=f'ROOMC-wall-{look}', symptom='Predator room (CLUB class): wall / bed', pose='full34', quantity='ratio:wallside_over_bed_disp', op='band', target=b['target'], pm=b['pm'], arm=False,
            arm_note='WEAK ARM (§8.5 / §9.4): the wall band 0.001–0.401 spans fieldstone far from a box light (0.017) to a lit pine panel (0.257); BEFORE (0.087 / 0.073) sits inside it — a luminance ratio cannot separate "dark because far" from "dark because the paint is black"; kept JUDGED as a class-range check, arm declared silent',
            provenance='PHOTO', band_rule=BR, band=b, reads=room_wall,
            source=f"club-room class: home-room stone 0.017 / 0.146, pine panel 0.257, club brick 0.061 — envelope {b['lo']}–{b['hi']} (strict {b['strict']['lo']}–{b['strict']['hi']}); ours = the +x room wall at class albedo 0.25 (BEFORE 0.087 / 0.073)", **T)
        b = bands['room_wood']
        row(id=f'ROOMC-bench-{look}', symptom='Predator room (CLUB class): walnut bench / bed (RECORD — one read)', pose='full34', quantity='ratio:benchback_over_bed_disp', op='band', target=b['target'], pm=b['pm'], arm=False, record=True,
            provenance='PHOTO', band_rule=BR, band=b, reads=room_wood,
            source=f"one admissible wood-surface read in the class (home-room pine panel 0.257 ± 0.144); ours = the bench backrest (walnut 0.14) — RECORD", **T)
        b = bands['wall']
        row(id=f'ROOM-wall-{look}', symptom='ARENA-class wall bound (class MISMATCH with the club dressing — RECORD)', pose='full34', quantity='ratio:wallside_over_bed_disp', op='<=', target=b['hi'], pm=0.0, arm=True, record=True,
            provenance='PHOTO-UPPER-BOUND', band_rule='one-sided ceiling = max(v+σ) over CLIPPED-reference reads (admissible:false as values, upper_bound:true): a clipped bed / rail top makes the true ratio LOWER than read, so the ceiling is loose, never tight', band=b, reads=wall,
            source=f"arena red walls (hero-1 0.010 ± 0.016, hero-2 0.008 ± 0.007; beds clipped) and the STL ballroom CEILING / rail-top 0.012 ± 0.001 (rail top clipped) — every reference ≤ {b['hi']} of the bed; JUDGED as an upper bound only; our +x room wall (0xcabfae × wallTexture, luminance albedo ≈ 0.012) at (4.49, 0.5, 1.2) in full34 (BEFORE 0.087 / 0.073)", **T)
        b = bands['floor']
        row(id=f'ROOM-floor-{look}', symptom='ARENA-class floor / bed (class MISMATCH with the club dressing — RECORD)', pose='full34', quantity='ratio:floor_over_bed_disp', op='band', target=b['target'], pm=b['pm'], arm=False, record=True,
            provenance='PHOTO', band_rule=BR, band=b, reads=floor,
            source=f"admissible floor/bed = canho hall floor 0.222 ± 0.043 and 0.114 ± 0.016 (unclipped bed); the arena carpets (hero/LV) read 0.24–0.68 but on clipped beds (upper bounds). Ours is the walnut room floor (room.js floorTexture, luminance albedo ≈ 0.02 vs a grey carpet ≈ 0.3): with the same LIGHT the walnut can only read ≈ 1/15 of the carpet; the fill\'s own asymptote on this floor is floor/bed → 0.19 linear at up → ∞ (coefficients 0.371 / 1.914). RECORDED for the owner: dark walnut room under an arena-faithful term (AFTER) vs the probe-flooded walnut (BEFORE 0.169 / 0.003)", **T)
        b = bands['railtop']
        row(id=f'ROOM-railtop-{look}', symptom='Predator cushion top / bed (same material)', pose='cushion_shadow', quantity='ratio:railtop_over_bed_disp', op='band', target=b['target'], pm=max(b['pm'], 0.05), arm=False, record=True,
            provenance='PHOTO-SURROGATE', band_rule='green-channel surrogate of the B-clipped studio top-down (the only same-material room read); ± floored at 0.05 for the surrogate', band=b, reads=railtop,
            source="studio official-pocket-cushion-closeup cushion-top cloth / bed 1.036 (green channel; Y inadmissible by the clip rule); ours = the +kx cushion top at ky −0.25 (BEFORE 0.989 / 0.989)", **T)
        # ---- ORDER-LAND-638-FIX2 B1: the club-class room rows JUDGED under canopy_panel and perimeter_ring too (the derived
        # probe replaces the 9.91 legacy probe under every Predator fixture; the class dressing stays), and the cue-ball
        # rows as OUTPUTS per fixture (RECORD, the Q3 law)
        for fx, setn in (('canopy_panel', 'pdtcanopy'), ('perimeter_ring', 'pdtring')):
            for base_id in (f'ROOMC-floor-{look}', f'ROOMC-wall-{look}', f'ROOMC-bench-{look}', f'ROOM-railtop-{look}'):
                base = next((r for r in rows if r['id'] == base_id), None)
                if not base: continue
                clone = {**base, 'id': base_id.replace(f'-{look}', f'-{fx}-{look}'), 'reads_from': setn,
                         'symptom': base['symptom'] + f' — under {fx} (B1: the derived room-only probe, no 9.91 probe)'}
                if fx == 'perimeter_ring' and base_id.startswith('ROOMC-floor'):
                    # the perimeter ring's four strips sit over the cushions (102.4 × 53 in at 45 in) and emit straight down: the floor
                    # beside the table receives DIRECT light the studio / canopy rigs never send there. Direct-emitter irradiance
                    # (Lambertian rectangles, numerically integrated) puts the ring's E_floor/E_bed at 5–6 × the studio's; the display
                    # ratio measured 3.0 × (tone mapping and the bed's baked bounce compress it). The rig is frozen; the floor DRESSING
                    # is judged in band under pdt_studio and canopy_panel — RECORD with cause
                    clone['record'] = True; clone['arm'] = False
                    clone['symptom'] = base['symptom'] + ' — under perimeter_ring (RECORD with cause; OWNER: the ring fixture\'s emitter radiance — the rig, not the dressing — landing re-verification round 3 ruling (a))'
                    clone['arm_note'] = 'RECORD — owner: the ring fixture\'s emitter radiance (rig), not the dressing (landing re-verification round 3, ruling (a): floor ×1.05 of main\'s own ring floor). The ring\'s strips over the cushions light the floor beside the table directly (direct-irradiance model: E_floor/E_bed 0.70 ring vs 0.12 studio, ×5–6; measured display ratio ×3.0); the dressing is judged in band under the other two fixtures; main\'s own ring boot is ROOMC-floor-perimeter_ring-off'
                rows.append(clone)
            row(id=f'BALL-predator_apex_9ft-{fx}-{look}-under', symptom=f'B1 output: Predator cue ball under/crown under {fx}', quantity='ratio:ball0_under_over_crown_disp', op='>=', target=0.0, pm=0.0, arm=False, record=True,
                arm_note='RECORD (output per fixture; the photo band is the default-fixture row)', pose='cueball_level', table='predator_apex_9ft', look=look, reads_from=setn, provenance='DERIVED', source='cue ball under/crown (display) at cueball_level under the fixture')
            row(id=f'BALL-predator_apex_9ft-{fx}-{look}-crownsat', symptom=f'B1 output: Predator cue ball crown clip under {fx}', quantity='ball:0:crown_sat', op='<=', target=0.15, pm=0.0, arm=False, record=True,
                arm_note='RECORD (output per fixture)', pose='cueball_level', table='predator_apex_9ft', look=look, reads_from=setn, provenance='DERIVED', source='crown clip fraction under the fixture (the P638 print convention)')
        # ORDER-LAND-638-FIX4 verifier item 5 (spec hygiene): this row is per LOOK, not per fixture — it sat inside the fixture loop
        # above and was emitted twice per look under one id; it lives after the loop so each id appears once
        row(id=f'ROOMC-floor-perimeter_ring-off-{look}', symptom='RECORD: main\'s own perimeter_ring boot (?venue=off: the 9.91 probe + the ring rig) — floor / bed, the same read', pose='full34', quantity='ratio:floor_over_bed_disp', op='band', target=bands['room_floor']['target'], pm=bands['room_floor']['pm'], arm=False, record=True,
            provenance='PHOTO', band_rule=BR, band=bands['room_floor'], reads=room_floor, table='predator_apex_9ft', look=look, reads_from='pdtringoff', source='the ring rig\'s floor spill on main\'s own path (no venue term) — the reference for the recorded ring floor row above')
        # ---- record rows: cushion band, JOY, Star (unchanged from seal-1, provenance added) ----
        b = bands['shadow']
        row(id=f'P638-shadow-{look}', symptom='Predator cushion band (key geometry, RECORD)', pose='cushion_shadow', quantity='ratio:shadow_floor_disp', op='band', target=b['target'], pm=b['pm'], arm=True, record=True,
            provenance='PHOTO-SURROGATE', band_rule=BR + ' (green-channel surrogate reads)', band=b, reads=shadow_reads,
            source=f"studio soft key, green channel {b['lo']}–{b['hi']}; the band under the nose is the bars\' umbra (key angular size) — not closable by a fill (§3.4); recorded (BEFORE 0.94)", **T)
        b = bands['star_strip']
        row(id=f'S3-strip-{look}', symptom='Star bed strip (rebake-class, RECORD)', table='wpbsa_snooker_12ft', look=look, pose='cushion_shadow', quantity='ratio:shadow_floor_disp', op='band', target=b['target'], pm=b['pm'], arm=False, record=True,
            provenance='PHOTO', band_rule=BR, band=b, reads=star_strip,
            source=f"envelope {b['lo']}–{b['hi']} of the three admissible arena strip reads; key angular size + cloth diffuse albedo 0.0092 (§5.2/5.3); a fill cannot reach it; recorded")
        b = bands['star_nose']
        row(id=f'S3-noseface-{look}', symptom='Star vertical face (RECORD)', table='wpbsa_snooker_12ft', look=look, pose='cushion_shadow', quantity='ratio:noseface_over_bed_disp', op='<=', target=b['hi'], pm=0.0, arm=False, record=True,
            provenance='PHOTO', band_rule='ceiling = max(v+σ) of the two admissible arena nose-face reads', band=b, reads=star_nose,
            source=f"arena nose faces ≤ {b['hi']} of the bed; ours 0.36 disp — a fill would widen the gap; recorded")
        b = bands['joy_wall']
        for side in ('S', 'N'):
            row(id=f'J2-slotwall-{side}-{look}', symptom='JOY slot wall (re-read, RECORD)', table='chinese8_pro_9ft', look=look, pose='mid_close_diag', quantity=f'ratio:jaw{side}_over_bed_disp', op='band', target=b['target'], pm=b['pm'], arm=False, record=True,
                provenance='PHOTO', band_rule=BR, band=b, reads=joy_wall,
                source=f"envelope {b['lo']}–{b['hi']} of the four admissible whole-strip reads (the 0.80 in the brief was the cushion TOP); ours = main\'s cushion end faces; recorded")
        b = bands['joy_top']
        row(id=f'J2-railtop-{look}', symptom='JOY cushion top (the misread 0.80, RECORD)', table='chinese8_pro_9ft', look=look, pose='cushion_shadow', quantity='ratio:railtop_over_bed_disp', op='band', target=b['target'], pm=b['pm'], arm=False, record=True,
            provenance='PHOTO', band_rule=BR, band=b, reads=joy_top,
            source=f"envelope {b['lo']}–{b['hi']} of the four admissible cushion-top reads; recorded")
    # ---- PROBE-pin (ORDER-LIGHT-5 R2): the derived fill's 27 SH coefficients per look, captured on the sealed tree and
    # pinned here; the gate compares the census' venue.sh (max |Δ| ≤ tol). Red arm (ORDER-LAND-638-FIX4 verifier item 3): a
    # REAL, DIFFERENT derived probe — the perimeter_ring boot's (L0 ≈ 0.037 vs the studio pin's 0.013: max |Δ| 0.025 ≫ tol
    # 5e-3), so a MOVED pin reads RED on a read; the former `?venue=off` arm carried NO probe and read +inf by convention —
    # RED by construction, blind to a moved pin (an absent probe is now a MISSING read in lighting-gate.py, fail-closed).
    pin_path = os.path.join(HERE, 'fixtures', 'lighting-probe-pin.json')
    pins = json.load(open(pin_path)) if os.path.exists(pin_path) else None
    for look in ('default', 'sp'):
        pin = (pins or {}).get('predator_apex_9ft', {}).get(look)
        if pin and pin.get('sh'):
            row(id=f'PROBE-pin-{look}', symptom='derived venue fill pinned (SH-L2 of the bar-lit room at the table centre)', table='predator_apex_9ft', look=look, pose=None,
                quantity='venue:sh', op='<=', target=0.0, pm=float(pins.get('tolerance', 2e-3)), arm=True, arm_from='pdtring', pin=pin['sh'],
                provenance='DERIVED', source=f"arm = the perimeter_ring boot's own derived probe (a real, different read; FIX4 item 3); 27 coefficients captured at (0, {pin.get('pos', ['?', '?', '?'])[1]}, 0), {pin.get('res')}² float faces, GI apply complete, table as a BLACK OCCLUDER + fixture hidden (ROOM term only, ORDER-LIGHT-7 R-A; mode {pin.get('mode') or pins.get('mode')}); E(+y/−y) {pin.get('E', {}).get('py')}/{pin.get('E', {}).get('ny')}; RESIDUAL OVERLAP with the bake's own room share: {pins.get('overlap', {}).get(look, 'not computed')}; pinned {pins.get('pinned_at')} from sha {pins.get('sha')}; the row measures max |Δ coefficient| against this pin")
    # ---- ORDER-LAND-638-FIX2 B1: EVERY Predator fixture derives the room-only probe — pinned per fixture (the pin file keys
    # `predator_apex_9ft@<fixture>`), read from the fixture's own set; arm = the default (pdt_studio) boot's REAL derived probe
    # (ORDER-LAND-638-FIX4 verifier item 3: measured max |Δ| vs the studio probe — canopy 6.2e-3 / 7.3e-3, ring 2.5e-2, pendant
    # 7.7e-3, all > tol 5e-3; the former ?venue=off arm had no probe and was RED by construction)
    for fx, setn in (('canopy_panel', 'pdtcanopy'), ('perimeter_ring', 'pdtring'), ('pendant_bar', 'pendant')):
        for look in (('default', 'sp') if fx != 'pendant_bar' else ('default',)):
            pin = (pins or {}).get(f'predator_apex_9ft@{fx}', {}).get(look)
            if pin and pin.get('sh'):
                row(id=f'PROBE-pin-{fx}-{look}', symptom=f'B1: derived venue fill under {fx} pinned (SH-L2 of the room lit by that fixture at the table centre); the 9.91 table-owned probe exists only on ?venue=off', table='predator_apex_9ft', look=look, pose=None,
                    quantity='venue:sh', op='<=', target=0.0, pm=float(pins.get('tolerance', 2e-3)), arm=True, arm_from='after', arm_table='predator_apex_9ft', pin=pin['sh'], reads_from=setn,
                    provenance='DERIVED', source=f"27 coefficients captured under {fx} ({pin.get('res')}² float faces, GI settled, fade settled, table as a BLACK OCCLUDER, fixture meshes hidden); three boots per look of the sealed export; arm = the pdt_studio boot's own derived probe (a real, different read; FIX4 item 3)")
    # ---- ORDER-LIGHT-6 Q1: the derived fill's SCOPE — balls and cue only. (a) compiled-GLSL programs census rows
    # (probe term compiled into no program at all; the fill term on every lit ball/cue program and on no room/table/
    # fixture program); (b) the on/off room-mask delta (fill uniform 1 → 0 in one boot: |ΔY8| ≤ 1 over the room mask
    # and its wall/floor/bench sub-masks at full34 and cushion_shadow); red arms: `off` = a ?venue=off boot (main's
    # visible probe compiles into every lit program), `arm` = a ?venueArm=wallfill boot (the one-token change that
    # re-admits the fill on the wall material: programs census room.venueSH 1, wall/room masks move).
    SCOPE_SRC = ('display Y8 mean over the mask, fill ON − fill OFF (setVenueFill 0) in the same capture set; the room mask = pixels that go dark when '
                 'the dressing is hidden (roomhide poke); ≤ 1/255 = the fill does not light the room (ORDER-LIGHT-6 Q1b)')
    for look in ('default', 'sp'):
        T = dict(table='predator_apex_9ft', look=look)
        for cls in ('room', 'table', 'fixture', 'ball', 'cue'):
            row(id=f'PROG-{look}-{cls}-probe', symptom=f'no light-probe term compiles into any {cls} program', pose=None, quantity=f'programs:{cls}:probeCompiled', op='<=', target=0, pm=0,
                arm=True, arm_from='off', provenance='DERIVED', source='compiled GL fragment sources of the programs the materials rendered with: USE_LIGHT_PROBES defined AND getLightProbeIrradiance( lightProbe, …) present; arm = the ?venue=off boot (main\'s obPdtVenueAmbient visible → every lit program compiles it)', **T)
        row(id=f'PROG-{look}-room-fill', symptom='no derived-fill term in any room program', pose=None, quantity='programs:room:venueSH', op='<=', target=0, pm=0,
            arm=True, arm_from='arm', provenance='DERIVED', source='shGetIrradianceAt( inverseTransformDirection( geometryNormal, viewMatrix ), obVenueSH ) present in the compiled source; arm = ?venueArm=wallfill (the wall material takes the fill hook)', **T)
        for cls in ('table', 'fixture'):
            row(id=f'PROG-{look}-{cls}-fill', symptom=f'no derived-fill term in any {cls} program', pose=None, quantity=f'programs:{cls}:venueSH', op='<=', target=0, pm=0,
                arm=False, arm_note='no one-token change targets these classes; the room-fill arm proves the census reads the fill term', provenance='DERIVED', source='shGetIrradianceAt( inverseTransformDirection( geometryNormal, viewMatrix ), obVenueSH ) present in the compiled source', **T)
        for cls in ('ball', 'cue'):
            row(id=f'PROG-{look}-{cls}-fill', symptom=f'every lit {cls} program carries the derived fill', pose=None, quantity=f'programs:{cls}:fillMissing', op='<=', target=0, pm=0,
                arm=True, arm_from='off', provenance='DERIVED', source='fillMissing = lit programs − programs with shGetIrradianceAt( inverseTransformDirection( geometryNormal, viewMatrix ), obVenueSH ); arm = the ?venue=off boot (no hooks → every lit program missing)', **T)
        for pose, masks in (('full34', ('room_all', 'walls', 'floor', 'bench')), ('cushion_shadow', ('room_all',))):
            for mk in masks:
                armed = mk in ('room_all', 'walls')
                # ORDER-LIGHT-7: TIGHTENED 1.0 -> 0.25 Y8. ORDER-LIGHT-6 set 1.0 when the fill still carried the
                # cloth bounce (pinned E(+y) ~0.9); the R-A room-only term is ~50x smaller (E(+y) 0.0173), so 1.0 Y8
                # no longer resolves it: at 1.0 three of the wallfill arms read SILENT (0.400 / 0.466 / 0.862 Y8).
                # 0.25 = ~3x the largest gated on/off delta measured across the 10 mask/pose/look rows (0.077 Y8).
                row(id=f'SCOPE-{look}-{pose}-{mk}', symptom=f'fill on/off leaves the {mk} mask unchanged', pose=pose, quantity=f'scope:{pose}:{mk}:absdelta', op='<=', target=0.0, pm=0.25,
                    reads_from='scope', arm=armed, **({'arm_from': 'arm'} if armed else {'arm_note': 'the arm re-admits the fill on the WALL material; this mask is not on that material (see the room_all / walls arms)'}),
                    provenance='DERIVED', source=SCOPE_SRC, **T)
        # ---- ORDER-LIGHT-6 H4: the pre-existing hemi / PointLight stand-ins (main literals: room.js HemisphereLight 0.22 →
        # gi.js 0.11 / look.js SP 1.25; PointLight 2.2 × brightness) still light room, table and balls. RECORD rows with
        # both zeroed (standins0 poke) — their share of each judged/output quantity, no target moves.
        SI = dict(table='predator_apex_9ft@standins0', look=look, reads_from='scope', record=True, arm=False, provenance='OUTPUT (hemi + PointLight stand-ins zeroed)')
        b = bands['under']
        row(id=f'STANDIN-{look}-under', symptom='H4: cue ball under/crown with the stand-ins at 0', pose='cueball_level', quantity='ratio:ball0_under_over_crown_disp', op='band', target=b['target'], pm=b['pm'], band=b, source='same band as P638-terminator; the difference to that row is the stand-ins\' share', **SI)
        b = bands['equator']
        row(id=f'STANDIN-{look}-equator', symptom='H4: cue ball equator/crown with the stand-ins at 0', pose='cueball_level', quantity='ratio:ball0_eq_over_crown_disp', op='band', target=b['target'], pm=b['pm'], band=b, source='same band as P638-equator', **SI)
        b = bands['room_floor']
        row(id=f'STANDIN-{look}-floor', symptom='H4: club floor / bed with the stand-ins at 0', pose='full34', quantity='ratio:floor_over_bed_disp', op='band', target=b['target'], pm=b['pm'], band=b, source='same band as ROOMC-floor', **SI)
        b = bands['room_wall']
        row(id=f'STANDIN-{look}-wall', symptom='H4: club wall / bed with the stand-ins at 0', pose='full34', quantity='ratio:wallside_over_bed_disp', op='band', target=b['target'], pm=b['pm'], band=b, source='same band as ROOMC-wall', **SI)
    # ---- ORDER-LIGHT-7 R-B / R-C arms. SETTLE: a boot with `?giDelay=1500` and a fixture change poked during the
    # capture (canopy → back to auto) must still pin-match (the capture waits for the CURRENT GI apply); the arm is the
    # same boot under `venueSettle=legacy` (the fixed 800 ms rule captures a half-applied GI → pin mismatch). HOOK: a
    # live Predator → JOY switch leaves no venue-fill term on the JOY ball / cue programs and the JOY frame equals a
    # fresh JOY boot; the arm is the same switch under `venueHook=leak` (the seal-6 wrapper keeps the hooks).
    for look in ('default', 'sp'):
        pin = (pins or {}).get('predator_apex_9ft', {}).get(look)
        if pin and pin.get('sh'):
            ST = dict(table='predator_apex_9ft@fxchange', look=look, pose=None, reads_from='settle', provenance='DERIVED')
            SETTLE_SRC_TXT = ('boot with ?giDelay=1500 (gi.js holds the apply open 1.5 s after its assets arrive), poke-raw: '
                              'apply(canopy_panel) then apply(auto) 300 ms later; arm = the same boot under ?venueSettle=legacy')
            # The BINDING itself: how many GI applies were still in flight when the fill was captured. The legacy
            # fixed-800 ms rule shoots mid-apply (started − completed > 0); the apply-tied rule cannot.
            row(id=f'SETTLE-{look}-inflight', symptom='R-B: the fill is captured with no GI apply in flight (giSeq started − completed)',
                quantity='venue:giseqgap', op='<=', target=0, pm=0, arm=True, arm_from='settlelegacy', source=SETTLE_SRC_TXT, **ST)
            # …and the pin still matches through a fixture change mid-capture. Unarmed BY MEASUREMENT: the room the
            # probe sees barely moves between a half-applied and a fully-applied GI, so the legacy rule's pin error
            # (~1e-4) is not separable from the boot-to-boot noise of the apply-tied rule under ?giDelay=1500 (also
            # ~1e-4) — both are two orders below this row's tolerance (5e-3). The in-flight row above is the arm.
            row(id=f'SETTLE-{look}-pin', symptom='R-B: … and the pinned coefficients survive a fixture change mid-capture',
                quantity='venue:sh', op='<=', target=0.0, pm=float(pins.get('tolerance', 2e-3)), pin=pin['sh'], arm=False,
                arm_note='the legacy 800 ms rule moves this pin by 5.1e-05 / 1.0e-04 (measured, SETTLE-*-pin under venueSettle=legacy) — 5e-3 tolerance, so it cannot arm this row; SETTLE-*-inflight carries the arm',
                source=SETTLE_SRC_TXT, **ST)
        SW = dict(table='predator_apex_9ft@switchjoy', look=look, reads_from='switch', provenance='DERIVED')
        row(id=f'HOOK-{look}-ball', symptom='R-C: after a live Predator → JOY switch no JOY ball program carries the fill', pose=None, quantity='programs:ball:venueSH', op='<=', target=0, pm=0, arm=True, arm_from='hookleak',
            source="poke-raw __settings.changeEquipment('table_id','joy_q8_9ft'); compiled census of the JOY scene; arm = ?venueHook=leak (the seal-6 wrapper: hooks whenever venue.on)", **SW)
        row(id=f'HOOK-{look}-cue', symptom='R-C: … nor any cue program', pose=None, quantity='programs:cue:venueSH', op='<=', target=0, pm=0, arm=True, arm_from='hookleak', source='as HOOK-ball', **SW)
        # ORDER-LIGHT-7 asked for pixel delta 0 here. It is NOT 0 (max |Δ| 109 / 124 of 255, p99 9, p50 1) and the row
        # is DEMOTED to RECORD with the finding stated, per the ORDER-LIGHT-5 R5 rule. Evidence that the residue is
        # main's live-switch behaviour and not the venue term: (a) identical under ?venueHook=leak, (b) the ?venue=off
        # control below — the whole venue subsystem off, legacy rig AND legacy dressing — shows the same residue,
        # (c) the compiled census (HOOK-ball / HOOK-cue) proves no JOY program carries the fill. Recorded beside them:
        # an attempted cure (re-bake the env through the public rig seam after the switch, main's table.js rebuild
        # keeps the boot env by documented design) which lowered the extreme but raised the mean — not shipped.
        row(id=f'HOOK-{look}-pixels-reenv', symptom='R-C: attempted cure, recorded — env re-baked through the rig seam after the switch',
            pose='full34', quantity='scope:full34:joy_first_frame_reenv:absdelta', op='<=', target=0, pm=0, arm=False, record=True,
            arm_note='recorded, not judged: the re-bake fires while the rig ramps are still moving, so it trades reflection error for a global offset',
            source='lighting-switch-arm.py case reenv: switch, wait for the JOY GI, then apply(fixture, brightness+5e-4) → apply(fixture, brightness); vs after-<tag>/<look>/joy_q8_9ft/full34.png',
            **SW)
        row(id=f'HOOK-{look}-pixels', symptom='R-C: raw live-switch residue vs a fresh JOY boot (full34) — DEMOTED to record, see 12.3', pose='full34', quantity='scope:full34:joy_first_frame:absdelta', op='<=', target=0, pm=0, arm=False, record=True,
            arm_note='a leaked hook with a ZERO uniform adds +0 to the program — invisible in pixels by construction; the census rows HOOK-ball/cue are the arm',
            source='lighting-switch-arm.py: max 8-bit channel delta between the live-switch frame and after-<tag>/<look>/joy_q8_9ft/full34.png', **SW)
        row(id=f'HOOK-{look}-pixels-off', symptom='R-C: … and the same residue with the whole venue subsystem off (?venue=off control)', pose='full34',
            quantity='scope:full34:joy_first_frame_off:absdelta', op='<=', target=0, pm=0, arm=False, record=True,
            arm_note='the control that carries the demotion: the residue is present with the fill, the hook and the class dressing all off, so it is not the venue term',
            source='lighting-switch-arm.py case off: ?venue=off switch vs a fresh ?venue=off JOY boot', **SW)
        # ORDER-LIGHT-8 C4: the same residue at cueball_level — the WORST pose (the ball's gloss reflects the boot env
        # cube map directly), disclosed beside the full34 rows so the ceremony note carries the worst case.
        row(id=f'HOOK-{look}-pixels-cueball', symptom='R-C (C4): raw live-switch residue vs a fresh JOY boot at cueball_level — the worst pose', pose='cueball_level',
            quantity='scope:cueball_level:joy_first_frame:absdelta', op='<=', target=0, pm=0, arm=False, record=True,
            arm_note='record: the ball gloss reflects the boot table\'s env cube map; see the ?venue=off control row', source='lighting-switch-arm.py, cueball_level', **SW)
        row(id=f'HOOK-{look}-pixels-cueball-off', symptom='R-C (C4): … and with the whole venue subsystem off (?venue=off control) at cueball_level', pose='cueball_level',
            quantity='scope:cueball_level:joy_first_frame_off:absdelta', op='<=', target=0, pm=0, arm=False, record=True,
            arm_note='control: the worst-pose residue is present with the venue subsystem off, so it is main\'s', source='lighting-switch-arm.py case off, cueball_level', **SW)
    # ---- ORDER-LIGHT-9 Q1/Q2/Q4 arms: the at-rest SH fill, the derived occlusion, the switch on the ball programs
    for look in ('default', 'sp'):
        T9 = dict(table='predator_apex_9ft', look=look, pose=None, provenance='DERIVED')
        row(id=f'SHFILL-{look}', symptom='Q1: with GI ready every resting ball\'s SH block equals the grid\'s bilinear sample at its position', quantity='census:giBlocks:maxDelta', op='<=', target=0.0, pm=1e-6,
            arm=True, arm_from='off', source='census giBlocks: max |giSH − gi.sampleSH(x, z)| over every ball material (10 balls); arm = ?venue=off (main\'s ordering: the blocks stay all-zero at rest → the grid value itself, ~8.7)', **T9)
        row(id=f'PROG-occ-{look}', symptom='Q2/Q4: every lit ball program carries the DERIVED occlusion (texelFetch(uOccLut)) — none on ?venue=off', quantity='programs:ball:occMissing', op='<=', target=0, pm=0,
            arm=True, arm_from='off', source='compiled-GLSL census: lit ball programs − programs whose fragment source declares uniform sampler2D uOccLut and samples it; arm = ?venue=off compiles main\'s ball shader (10 missing → RED)', **T9)
        row(id=f'OCC-anchors-{look}', symptom='Q2: the occlusion table\'s h = 0 row equals the closed form 1 − ½(1 − n_y)(2 − n_y²)^{−3/2} at n_y = −1, 0, +1 (a storage / binding witness: row 0 IS written from the closed form)', quantity='census:occLut:maxDelta', op='<=', target=0.0, pm=1e-4,
            arm=False, arm_note='ORDER-LIGHT-10 item 4: this row tests the float32 storage and the binding of the closed-form row, not the quadrature (verifier round 8: tautological on its own); the quadrature is armed by OCC-interior-* below',
            source='census occLut: |LUT[n_y, 0] − closed form| at the three anchors, read from the bound DataTexture\'s data (float32: expect ≤ 1.2e-8)', **T9)
        if look == 'default':
            # ORDER-LIGHT-10 item 4: the INTERIOR-node arm — a committed fixture written by the generator from a second,
            # independent quadrature (plane-domain polar about the fragment foot) at nine interior nodes; the arm is the
            # authored term at the same nodes (the table must be far from the authored shape, else the live row is vacuous)
            FX = dict(table='fixture', look='—', pose=None, provenance='DERIVED')
            row(id='OCC-interior-live', symptom='Q2 arm (INTEGRATION, not physics): nine interior table nodes equal a second plane-domain quadrature of the SAME integrand', quantity='fixture:occlusion-check:max_abs_delta_independent', op='<=', target=0.0, pm=1e-4,
                arm=False, arm_note='ORDER-LIGHT-11: this second quadrature shares the generator\'s model functions (s(d), P, the geometry) — it arms the numerical integration and the table\'s storage, NOT the physical model; the physics is anchored by the closed-form limits (OCC-anchors) and re-derived externally (verifier rounds 8 / 9, review round 2 Gauss–Legendre), its simplifications disclosed in §14.2, not armed', source='tools/render/fixtures/lighting-occlusion-check.json (generator: 2000 × 720 polar plane quadrature vs the 384² hemisphere strata, same s(d) / P / geometry)', **FX)
            # ORDER-LIGHT-12 item 2 (round-9 condition 3): the nine nodes of the BOUND uOccLut texture vs the fixture — measured
            # by this lane in one eval boot per mode and committed as lighting-occlusion-bound-check.json (method + sha inside);
            # the per-capture census version (occLut.interiorNodes → reads occLut.interiorMaxDelta) lands with the next
            # capture-bearing seal.
            # review round 3 (the only blocker on the seal-11 tip): the BROWSER census must compare the nine interior texels of
            # the BOUND uOccLut — not only the three row-0 anchors. lighting-page.mjs reads occLut.interiorNodes (+ textureUploaded)
            # and lighting-render-reads.py computes occLut.interiorMaxDelta against lighting-occlusion-check.json; captured in
            # the small `occ` set (Predator, cueball_level, both looks), armed by the same boot under ?venue=off (`occoff`).
            for lk in ('default', 'sp'):
                OC = dict(table='predator_apex_9ft', look=lk, pose=None, reads_from='occ', provenance='DERIVED')
                row(id=f'OCC-interior-bound-{lk}', symptom='Q2 (review r3): the BOUND uOccLut texture\'s nine interior texels equal the independent-quadrature fixture, read by the browser census', quantity='census:occLut:interiorMaxDelta', op='<=', target=0.0, pm=1e-6,
                    arm=False, arm_note='the texture data exists on ?venue=off too (the object is created, never uploaded or bound), so the data comparison cannot arm itself; the binding rows below carry the arm', source='census occLut.interiorNodes (D[j·nx + i] of the bound DataTexture at the nine (i, j) of lighting-occlusion-check.json) → reads occLut.interiorMaxDelta (float32: expect ~2.7e-8)', **OC)
                row(id=f'OCC-interior-programs-{lk}', symptom='Q2 (review r3): every lit ball program samples the bound uOccLut (browser census)', quantity='census:occLut:boundBallPrograms', op='>=', target=10, pm=0,
                    arm=True, arm_from='occoff', source='census occLut.boundBallPrograms = ball programs whose compiled fragment source contains texelFetch( uOccLut; arm = ?venue=off (0 → RED)', **OC)
                row(id=f'OCC-uploaded-{lk}', symptom='Q2 (review r3): the renderer holds a GPU texture for uOccLut on default', quantity='census:occLut:textureUploaded', op='>=', target=1, pm=0,
                    arm=False, arm_note='declared weak arm (ORDER-LIGHT-C1 land13): since the FIX6 handshake a ?venue=off boot binds no LUT at all — the field reads null there (NO-READ, not 0); the upload happens at first render before any settled read, so no boot reads a bound-but-unuploaded LUT; the occoff arm had been masked by set reuse since land10', source='census occLut.textureUploaded = renderer.properties.get(texture).__webglTexture present', **OC)
            # ORDER-LAND-638 (d): the #638 SECOND symptom is measurable now that main carries #633 (sink-rest): the ball
            # RESTING on the Predator foam plug at #633's own register (frame 02-rest-hi), staged by the committed drive
            # tools/render/lib/lighting-cup-drive.js. No photo band exists for a ball resting in a Predator pocket
            # (lighting-ball-reads.json / lighting-photo-map.json carry none) → RECORD rows, BEFORE = ?venue=off (`cupoff`),
            # AFTER = default (`cup`); the issue closes only when a band exists and the row is judged. The under band is
            # geometrically UNOBSERVABLE at the register (the ball sits one radius below the bed inside the bore: 0 under
            # pixels), so the terminator read is equator/crown (display-referred, as the BALL rows) — stated, not substituted silently.
            for lk in ('default', 'sp'):
                for setn, tagn, what in (('cup', '', 'AFTER = default (venue shading)'), ('cupoff', '-off', 'BEFORE = ?venue=off (main byte-identical)')):
                    CU = dict(table='predator_apex_9ft@cuprest', look=lk, pose='cup_rest', reads_from=setn, provenance='DERIVED', record=True, arm=False,
                              arm_note='RECORD (BEFORE/AFTER pair): no photo band for a ball resting in a Predator pocket exists; judged — and #638 closed — only when one does')
                    row(id=f'CUP-rest-{lk}-crownY{tagn}', symptom=f'#638 second symptom: ball resting on the foam plug, crown luminance (scene-linear), {what}', quantity='ball:1:crown_Y', op='>=', target=0.0, pm=0.0,
                        source='census/reads: ball 1 (the potted object ball, pocketed AND presented) at the 02-rest-hi register; crown = the n_y-top band of the ray-cast disc on the HDR readback', **CU)
                    row(id=f'CUP-rest-{lk}-crownsat{tagn}', symptom=f'#638 second symptom: resting ball crown clip fraction (the P638 0.15 convention, printed not judged), {what}', quantity='ball:1:crown_sat', op='<=', target=0.15, pm=0.0,
                        source='fraction of crown pixels with any sRGB channel at 255', **CU)
                    row(id=f'CUP-rest-{lk}-eqcrown{tagn}', symptom=f'#638 second symptom: resting ball terminator = equator/crown (display-referred; the under band has 0 visible pixels at this register), {what}', quantity='ratio:ball1_eq_over_crown_disp', op='>=', target=0.0, pm=0.0,
                        source='equator band / crown band of the displayed frame; the under band lies below the bore rim from the 02-rest-hi camera', **CU)
            # ---- ORDER-LAND-638-FIX (landing review review round 5): the boot-compatibility / pre-GI degradation CONTRACT
            # (the ownership ledger (internal) rule 5 + the documented pre-GI fallback), judged from the census `contract` block, the
            # cross-set `contractPairs` block (lighting-contract-pairs.py) and the programs census. Sets: fixcanopy / fixback /
            # switchback (P2-a), nogi(+off) and pendant(+off) (P1-b, P2-c), mix* trees (P1-a, P2-b, P2-d; each with its
            # ?venue=off twin, byte-identity by the seal's offcheck-mix* steps), nogiarm / pendantarm = the SAME no-grid boots
            # on the previous export (the unweighted specular-only splice: balls without a grid lose their diffuse → RED).
            ptol = float((pins or {}).get('tolerance', 2e-3)) if pins else 2e-3
            for lk in ('default', 'sp'):
                PD = dict(look=lk, pose=None, provenance='DERIVED')
                row(id=f'FIX-rectweighted-{lk}', symptom='P1-b: every lit ball program carries the WEIGHTED rect-light diffuse leg (main\'s LTC path when the grid is unbound) — none on ?venue=off', quantity='programs:ball:rectWeightedMissing', op='<=', target=0, pm=0,
                    arm=True, arm_from='off', table='predator_apex_9ft', source='programs census: lit ball programs − programs whose GLSL carries `float obRectW = ` and the weighted LTC line', **PD)
                row(id=f'FIX-canopy-suppressed-{lk}', symptom='B1 (supersedes the FIX-round P2-a restored row): leaving pdt_studio for canopy_panel keeps the table-owned probe obPdtVenueAmbient SUPPRESSED — the derived room-only probe is on under every Predator fixture; the 9.91 probe exists only on ?venue=off', quantity='census:contract:legacyProbeVisible', op='<=', target=0, pm=0,
                    arm=True, arm_from='off', arm_table='predator_apex_9ft', table='predator_apex_9ft@fixcanopy', reads_from='fixcanopy', source='census contract.legacyProbeVisible under canopy_panel (B1: every Predator fixture carries the derived term); arm = the ?venue=off boot (the probe visible → 1)', **PD)
                row(id=f'FIX-canopy-errors-{lk}', symptom='P2-a: the fixture change raises no app error', quantity='census:contract:bootErrors', op='<=', target=0, pm=0, arm=False, arm_note='a boot that never settles fails the capture step itself',
                    table='predator_apex_9ft@fixcanopy', reads_from='fixcanopy', source='main.js testErrors length', **PD)
                for setn in ('fixback', 'switchback'):
                    what = 'canopy_panel → pdt_studio' if setn == 'fixback' else 'Predator → JOY → Predator'
                    row(id=f'FIX-{setn}-suppressed-{lk}', symptom=f'P2-a: after {what} the table-owned probe is suppressed again (hidden while the derived term is on)', quantity='census:contract:legacyProbeVisible', op='<=', target=0, pm=0,
                        arm=True, arm_from='off', arm_table='predator_apex_9ft', table=f'predator_apex_9ft@{setn}', reads_from=setn, source='census contract.legacyProbeVisible; arm = the ?venue=off boot (the probe visible → 1; since B1 the canopy boot suppresses too)', **PD)
                    if pins and (pins.get('predator_apex_9ft', {}).get(lk) or {}).get('sh'):
                        row(id=f'FIX-{setn}-pin-{lk}', symptom=f'P2-a: after {what} the derived fill equals the pinned fresh-boot fill', quantity='venue:sh', op='<=', target=0.0, pm=ptol,
                            arm=True, arm_from='pdtring', arm_table='predator_apex_9ft', pin=pins['predator_apex_9ft'][lk]['sh'], table=f'predator_apex_9ft@{setn}', reads_from=setn, source='max |Δ coefficient| vs lighting-probe-pin.json; arm = the perimeter_ring boot\'s own derived probe (FIX4 item 3: a real read 0.025 from the studio pin; ?venue=off carries no probe = a missing read, not an arm)', **PD)
                # (land16 regate 2, gate 502/503) the bound was an AUTHORED 2500 ms: the boot did not wait for GI and read 2531 ms at load1 52.6 / idle 0.5 % / 36 shells
                # (1789 on land13, reused unchanged through land15; sp 2152 → 2197). The row means 'the capture landed inside the first settle window, not at its
                # end': that window is the bounded-conditions window of the attempt loop = VENUE_GI_WINDOW_MS (no shorter first-settle constant exists in the
                # leaf; the 250 ms stillness tick and VENUE_CONVERGE_MAX bound rounds, not time). The pre-fix arm polls the GI apply past the window and reads
                # window + a tick (15005 ≥ 15000) — outside by construction. The measured ms rides in the RECORD twin; load1 / idle / shells per boot in the manifest.
                row(id=f'FIX-nogi-wait-{lk}', symptom='P2-c (re-derived by ORDER-LIGHT-C2-FIX5 E2): a ?nogi boot does not wait for a GI apply that never comes — the capture lands on the FIRST poll after its last bake (venueTailPolls 1 by construction of the shipped rule: rigQuiet is the only gate left); the wall-clock bound it used to judge measured the box (#756: the bake-1 cold program compile) and is a RECORD row now', quantity='census:contract:venueTailPolls', op='<=', target=1, pm=0, derived_from=dict(symbol='the shipped attempt loop: one poll after the last bake captures (lightingvisuals.js attempt / fireRebake)', value=1, file='web/scene/lightingvisuals.js'),
                    arm=True, arm_from='nogilegacy', table='predator_apex_9ft', reads_from='nogi', source='lightingvisuals venue.applied.tailPolls (C2-FIX5 E2); arm = the same ?nogi boot on THIS tree under ?venueSettle=legacy (the seal-6 rule: giOk at once under ?nogi, then a fixed 800 ms wait polled at 100 ms → tailPolls ≥ 8 → RED). The previous export\'s ?nogi boot (nogiarm, the lit rows\' arm) predates the field — land20\'s capturing seal read it NO-READ at check-arms; the default boot is not an arm', **PD)
                row(id=f'FIX-nogi-wait-ms-{lk}', symptom='P2-c RECORD: the ?nogi boot\'s venue wait in ms (the number the derived bound above judges; trend 1789 → 2531 in §L31 with load1 / idle / shells per boot)', quantity='census:contract:venueWaitedMs', op='>=', target=0, pm=0,
                    arm=False, record=True, arm_note='RECORD: the measured number', table='predator_apex_9ft', reads_from='nogi', source='lightingvisuals venue.applied.waitedMs', **PD)
                row(id=f'FIX-nogi-gioff-{lk}', symptom='P1-b/P2-c: under ?nogi the grid is off (uGiOn 0) — the ball diffuse must come from main\'s LTC leg', quantity='census:contract:giOn', op='<=', target=0, pm=0,
                    arm=True, arm_from='after', table='predator_apex_9ft', reads_from='nogi', source='shared.uGiOn; arm = the default boot (1 → RED)', **PD)
                # GH-996 (card 45): with the grid off the wpa canopy crown is LTC-lit above the knee's T in the sp look (median 2.36), so the
                # venue-path contract is judged on the knee-off twin (nogink); the shipped pair is recorded below
                row(id=f'FIX-nogi-lit-wpa-{lk}', symptom='P1-b: ?nogi balls keep their key diffuse — cue-ball crown within ±5 % of the same boot under ?venue=off (wpa_spec: no table-owned probe, same LTC + env path; the GH-996 ball knee off on both sides)', quantity='census:contractPairs:crownRatioAB', op='band', target=1.0, pm=0.05,
                    arm=True, arm_from='nogiarm', table='wpa_spec_9ft', reads_from='nogink', source='crown_Y(nogi & ballKnee=off) / crown_Y(nogi & venue=off), cueball_level, ball 0; arm = the same boots on the previous export (unweighted splice: no diffuse → ratio far below 1)', **PD)
                row(id=f'FIX-nogi-lit-wpa-knee-{lk}', symptom='GH-996 RECORD: the shipped ?nogi crown (ball knee ON) vs its ?venue=off twin — the knee compresses the grid-off LTC crown where it passes T', quantity='census:contractPairs:crownRatioAB', op='>=', target=0.0, pm=0.0,
                    arm=False, record=True, arm_note='RECORD: the knee is the owner-picked look change; judged by the KNEE rows', table='wpa_spec_9ft', reads_from='nogi', source='crown_Y(nogi) / crown_Y(nogi & venue=off)', **PD)
                row(id=f'FIX-nogi-lit-pdt-{lk}', symptom='P1-b RECORD: the Predator ?nogi crown vs its ?venue=off twin (the twin carries the 9.91 table-owned probe: main\'s #638 over-light, so not a ±5 % row)', quantity='census:contractPairs:crownRatioAB', op='>=', target=0.0, pm=0.0,
                    arm=False, record=True, arm_note='RECORD: the off twin is main\'s blown Predator crown', table='predator_apex_9ft', reads_from='nogi', source='crown_Y(nogi) / crown_Y(nogi & venue=off)', **PD)
            PD = dict(look='default', pose=None, provenance='DERIVED')
            row(id='FIX-pendant-gioff', symptom='P1-b: a public fixture without a committed bake (pendant_bar) keeps uGiOn 0 (honesty gate)', quantity='census:contract:giOn', op='<=', target=0, pm=0,
                arm=True, arm_from='after', table='predator_apex_9ft', reads_from='pendant', source='shared.uGiOn under ?fixture=pendant_bar; arm = the default boot (1 → RED)', **PD)
            # GH-996 (card 45): the venue-path contract is judged with the ball knee OFF (pendantnk = the same boot under ?ballKnee=off) —
            # the knee compresses the lamp-blown pendant crown BY DESIGN (the shipped look, recorded below) and is judged by the KNEE rows
            row(id='FIX-pendant-lit-wpa', symptom='P1-b: pendant_bar balls keep their key diffuse — cue-ball crown within ±5 % of the same boot under ?venue=off (wpa_spec; the GH-996 ball knee off on both sides)', quantity='census:contractPairs:crownRatioAB', op='band', target=1.0, pm=0.05,
                arm=True, arm_from='pendantarm', table='wpa_spec_9ft', reads_from='pendantnk', source='crown_Y(pendant & ballKnee=off) / crown_Y(pendant & venue=off); arm = the previous export\'s pendant boot', **PD)
            row(id='FIX-pendant-lit-wpa-knee', symptom='GH-996 RECORD: the shipped pendant_bar crown (ball knee ON) vs its ?venue=off twin — the knee\'s own compression of a lamp-blown crown (card 45, option A)', quantity='census:contractPairs:crownRatioAB', op='>=', target=0.0, pm=0.0,
                arm=False, record=True, arm_note='RECORD: the knee is the owner-picked look change; judged by the KNEE rows', table='wpa_spec_9ft', reads_from='pendant', source='crown_Y(pendant) / crown_Y(pendant & venue=off)', **PD)
            row(id='FIX-pendant-lit-pdt', symptom='P1-b RECORD: the Predator pendant_bar crown vs its ?venue=off twin', quantity='census:contractPairs:crownRatioAB', op='>=', target=0.0, pm=0.0,
                arm=False, record=True, arm_note='RECORD (the off twin carries the table-owned probe)', table='predator_apex_9ft', reads_from='pendant', source='crown ratio', **PD)
            # ORDER-LIGHT-FIX6 (review r10 P2): the ONE-STALE-LEAF MATRIX — one tree per participating leaf (room.js ALONE now; the pairwise
            # room + lightingvisuals replacement is retired), plus oldmain (the reverse pairing) and the two ABSENT-on-main leaves
            for mx, peer in (('oldgi', "main's scene/gi.js"), ('oldshading', "main's scene/shading.js"), ('oldroom', "main's scene/room.js ALONE (FIX6: the pairwise room + lightingvisuals replacement is retired)"),
                             ('oldlook', "main's scene/look.js"), ('oldballset', "main's app/ballset.js"), ('oldmain', "main's app/main.js"),
                             ('nolut', "main's ABSENT scene/occlusionlut.js (the new leaf missing from the cache — FIX5 P1)"), ('noflag', "main's ABSENT scene/venueflag.js (the switch leaf missing from the cache — FIX6)")):
                MXD = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft', reads_from=f'mix{mx}')
                row(id=f'MIX-{mx}-errors', symptom=f'P1-a: the export paired with {peer} boots without an app error (namespace / feature-detected seams)', quantity='census:contract:bootErrors', op='<=', target=0, pm=0,
                    arm=False, arm_note='a boot that never settles fails the capture step itself; the tree\'s ?venue=off frames are main\'s by the offcheck-mix step', source='main.js testErrors length on the mixed tree', **MXD)
            for mx in ('oldgi', 'oldballset'):
                row(id=f'MIX-{mx}-lit-wpa', symptom=f'P1-a/P1-b: on the {mx} tree the at-rest SH block stays zero (no registration) and the weighted leg keeps main\'s diffuse — crown within ±5 % of the tree\'s ?venue=off twin (wpa_spec)', quantity='census:contractPairs:crownRatioAB', op='band', target=1.0, pm=0.05,
                    arm=True, arm_from='nogiarm', table='wpa_spec_9ft', reads_from=f'mix{mx}', provenance='DERIVED', look='default', pose=None, source='crown_Y(mixed tree) / crown_Y(mixed tree & venue=off); arm = the previous export\'s no-grid boot')
            # ---- ORDER-LIGHT-FIX5 P1 (review r9): the LUT leaf loads through a feature-detected dynamic import; with the leaf ABSENT the
            # page boots and shading reads the FALLBACK by name (the authored underside occlusion: main's ball programs, no uOccLut sample);
            # the venue probe (a different mechanism) still derives. A cached older main.js never binds the leaf: the same fallback.
            NL = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft', reads_from='mixnolut')
            row(id='MIX-nolut-fallback', symptom='FIX5 P1: with the LUT leaf absent the page boots and shading reads the FALLBACK by name (occLutMode 0: the authored underside occlusion, main\'s ball programs)', quantity='census:contract:occLutMode', op='<=', target=0, pm=0,
                arm=True, arm_from='after', source='shading.occlusionLutState().present through __lighting.state().occLut; arm = the fresh tree (1 → RED)', **NL)
            row(id='MIX-nolut-unbound', symptom='FIX5 P1: no ball program samples uOccLut on the leafless tree (compiled witness)', quantity='census:occLut:boundBallPrograms', op='<=', target=0, pm=0,
                arm=True, arm_from='after', source='census occLut.boundBallPrograms (counted with or without a texture); arm = the fresh tree (10 → RED)', **NL)
            # FIX5 P1 → FIX6: an absent leaf is a protocol miss — the legacy path for ALL, so the venue probe does NOT derive either (was >= 1)
            row(id='MIX-nolut-derived', symptom='FIX6 (was FIX5 P1 "still derives"): the LUT leaf absent = a protocol miss = the legacy path for ALL — the venue probe does not derive on the leafless tree', quantity='census:contract:venueDerived', op='<=', target=0, pm=0,
                arm=True, arm_from='after', source='census contract.venueDerived; arm = the fresh tree (1 → RED)', **NL)
            row(id='MIX-oldmain-occlut', symptom='FIX5 P1: a cached older main.js never binds the LUT leaf — shading reads the fallback by name (occLutMode 0)', quantity='census:contract:occLutMode', op='<=', target=0, pm=0,
                arm=True, arm_from='after', source='occlusionLutState().present on the old-main pairing; arm = the fresh tree (1 → RED)', look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft', reads_from='mixoldmain')
            OM = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft', reads_from='mixoldmain')
            row(id='MIX-oldmain-dressing', symptom="P2-d: a cached older main.js (no env binding declared) gets the LEGACY dressing", quantity='census:contract:dressingClass', op='<=', target=0, pm=0, arm=True, arm_from='after', source='census dressing.mode (class = 1); arm = the default boot (class → RED)', **OM)
            row(id='MIX-oldmain-nofill', symptom="P2-b: a cached older main.js passes no renderer — the venue fill is not derivable, nothing is hooked", quantity='census:contract:venueDerivable', op='<=', target=0, pm=0, arm=True, arm_from='after', source='lightingvisuals venue.derivable; arm = the default boot (1 → RED)', **OM)
            row(id='MIX-oldmain-probe', symptom="P2-b: with no derivable fill the table-owned probe is NOT suppressed (main's rig stays)", quantity='census:contract:legacyProbeVisible', op='>=', target=1, pm=0, arm=True, arm_from='after', source='census contract.legacyProbeVisible; arm = the default boot (suppressed → 0 → RED)', **OM)
            row(id='MIX-oldmain-crown', symptom='P2-b/P2-d RECORD: Predator crown on the old-main pairing vs its ?venue=off twin', quantity='census:contractPairs:crownRatioAB', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD', source='crown ratio', **OM)
            # ---- ORDER-LIGHT-C1 (review r1 P2 (a), gi.js:300): a FAILED live regrade lands on the ONE pre-GI fallback before `settled` — uGiOn 0,
            # no plan / flank maps, no probe grid, the room refs at build values, the ball SH blocks zeroed, bakeClass / bakeFixture null — never the
            # previous look's bake. Three failing sets (the asset seam, the look-check seam, a REAL network rejection injected by the poke) read the
            # fallback; the arm is the same regrade succeeding (`lookswitch`: everything bound → RED). `lookfailpre` (the 26d556d8 app under the network
            # rejection) and `livestall` (an asset await that never settles) are RECORDS: the finding, and the open row (no gi-side ending exists for E8).
            for setn, kind in (('lookfail', 'giFail=assets:live:1'), ('lookthrow', 'giFail=look:live:1'), ('lookfailnet', 'a network-level probes rejection (no seam)')):
                LF = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft@lookflip', reads_from=setn)
                AL = dict(arm=True, arm_from='lookswitch', arm_table='predator_apex_9ft@lookflip')
                row(id=f'C1-{setn}-gioff', symptom=f'C1 (a): after the failed live regrade ({kind}) uGiOn is 0 — no GI path is live', quantity='census:contract:giOn', op='<=', target=0, pm=0, source='shared.uGiOn after the poke; arm = the same regrade succeeding (1 → RED)', **AL, **LF)
                row(id=f'C1-{setn}-plan', symptom=f'C1 (a): no plan map stays bound after the failure ({kind})', quantity='census:contract:giPlanBound', op='<=', target=0, pm=0, source='gi.probeState().planBound; arm = lookswitch (1 → RED)', **AL, **LF)
                row(id=f'C1-{setn}-flank', symptom=f'C1 (a): no flank map stays bound after the failure ({kind})', quantity='census:contract:giFlankBound', op='<=', target=0, pm=0, source='gi.probeState().flankBound; arm = lookswitch (1 → RED)', **AL, **LF)
                row(id=f'C1-{setn}-probes', symptom=f'C1 (a): no probe grid stays bound after the failure ({kind})', quantity='census:contract:giProbes', op='<=', target=0, pm=0, source='gi.probeState().probes; arm = lookswitch (1 → RED)', **AL, **LF)
                row(id=f'C1-{setn}-room', symptom=f'C1 (a): the room refs are back on their build values after the failure ({kind}) — roomBaked 0', quantity='census:contract:giRoomBaked', op='<=', target=0, pm=0, source='gi.probeState().roomBaked; arm = lookswitch (1 → RED)', **AL, **LF)
                row(id=f'C1-{setn}-floor', symptom=f'C1 (a): the floor carries no baked lightmap after the failure ({kind})', quantity='census:contract:giFloorLightMapBound', op='<=', target=0, pm=0, source='gi.probeState().floorLightMapBound; arm = lookswitch (1 → RED)', **AL, **LF)
                row(id=f'C1-{setn}-blocks', symptom=f'C1 (a): every resting ball\'s SH block is zero after the failure ({kind})', quantity='census:contract:giBallBlocksNonZero', op='<=', target=0, pm=0, source='gi.probeState().ballBlocksNonZero; arm = lookswitch (10 → RED)', **AL, **LF)
                row(id=f'C1-{setn}-error', symptom=f'C1 (a): the failure is RECORDED (loadError set) — the seam / rejection fired', quantity='census:contract:giLoadError', op='>=', target=1, pm=0, source='gi.state.loadError; arm = lookswitch (0 → RED)', **AL, **LF)
                row(id=f'C1-{setn}-mismatch', symptom=f'C1 (a): the completed look stays the previous one while the requested look is the failed one (look ≠ requestedLook)', quantity='census:contract:giLookMismatch', op='>=', target=1, pm=0, source='gi.probeState() look vs requestedLook; arm = lookswitch (0 → RED)', **AL, **LF)
                row(id=f'C1-{setn}-settled', symptom=f'C1 (a): the failed sequence is SETTLED (appliedSeq == applySeq) — the fallback landed before `settled`', quantity='census:contract:giSeqOpen', op='<=', target=0, pm=0,
                    arm=True, arm_from='livestall', arm_table='predator_apex_9ft@lookflip', source='gi.probeState().seqOpen; arm = the live stall (an open sequence: 1 → RED)', **LF)
                row(id=f'C1-{setn}-regraded', symptom=f'C1 (a): the regrade reached the leaf (the poke changed the look request)', quantity='census:contract:lookFlipLookChanged', op='>=', target=1, pm=0,
                    arm=False, arm_note='declared weak arm: every look-flip set reads 1 (the poke witness, not the fix)', source='window.__fix7Look.lookAfter ≠ from', **LF)
            LP = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft@lookflip', reads_from='lookfailpre')
            row(id='C1-lookfailpre-gion', symptom='C1 (a) RECORD: the PRE-C1 app (26d556d8) under the same network rejection keeps the previous look\'s bake LIVE (uGiOn 1) after the failed regrade — the finding', quantity='census:contract:giOn', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the finding, measured on the 26d556d8 app', source='shared.uGiOn after the poke, 26d556d8 app', **LP)
            row(id='C1-lookfailpre-error', symptom='C1 (a) RECORD: the PRE-C1 app recorded the failure (loadError) while keeping the bake', quantity='census:contract:giLoadError', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD', source='gi.state.loadError, 26d556d8 app', **LP)
            LS3 = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft@lookflip', reads_from='livestall')
            row(id='C1-livestall-open', symptom='C1 (a) RECORD (open row E8): a live asset await that never settles leaves the sequence OPEN (appliedSeq < applySeq) — no settle-on-error ending exists on gi\'s side; the venue degrades on the hold bound', quantity='census:contract:giSeqOpen', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the open row, measured', source='gi.probeState().seqOpen under ?giStall=assets', **LS3)
            row(id='C1-livestall-stalebound', symptom='C1 (a) RECORD (open row E8): the previous bake stays bound while the live await hangs (uGiOn)', quantity='census:contract:giOn', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD', source='shared.uGiOn under ?giStall=assets', **LS3)
            # ---- ORDER-LIGHT-C1 (review r1 P2 (b), lightingvisuals.js:1681): readiness includes the leaf's queued env re-bake. `dbq` arms the debounce
            # (held) from a raw poke and reads the app's readiness WHILE it is queued: fixed = not ready (the arm: ?venueReadiness=legacy reads ready);
            # `degradehold` = a runtime degradation with the debounce held: the degrade drops the queue and settles (the seal arm degradeholdforever
            # is the pre-C1 degrade rule: never settles). The 0 px proof is the judged offcheck-dbq-0px step.
            DQ = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft@dbq', reads_from='dbq')
            row(id='C1-dbq-notready', symptom='C1 (b): while the env re-bake is QUEUED the app is NOT ready (__test.ready false)', quantity='census:contract:dbqReadyWhileQueued', op='<=', target=0, pm=0,
                arm=True, arm_from='dbqlegacy', arm_table='predator_apex_9ft@dbq', source='window.__dbq.readyWhileQueued (read 50 ms after setVenue(false) under a held debounce); arm = ?venueReadiness=legacy (ready while queued → 1 → RED)', **DQ)
            row(id='C1-dbq-queued', symptom='C1 (b): the poke did arm the queue (rebakeQueued 1 at the read)', quantity='census:contract:dbqQueued', op='>=', target=1, pm=0,
                arm=False, arm_note='declared weak arm: the poke witness (both dbq sets read 1)', source='window.__dbq.queued', **DQ)
            row(id='C1-dbq-released', symptom='C1 (b): the release fired the queued bake (flushRebake returned true) and readiness returned', quantity='census:contract:dbqReleased', op='>=', target=1, pm=0,
                arm=False, arm_note='declared weak arm: the poke witness', source='window.__dbq.released', **DQ)
            row(id='C1-dbq-readyafter', symptom='C1 (b): after the release the app reads ready', quantity='census:contract:dbqReadyAfter', op='>=', target=1, pm=0,
                arm=False, arm_note='declared weak arm: the poke witness', source='window.__dbq.readyAfter', **DQ)
            # the 0 px proof, in-page: two float readbacks of the live frame in ONE boot — at the first moment the app reads ready after a queued
            # re-bake (a 4000 ms debounce) and 5.5 s later; fixed: ready only after the bake fired, the two frames identical; legacy readiness (the
            # arm): ready at once, the bake fires in between → the frame at readiness was about to change
            D0 = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft@dbq0px', reads_from='dbq0px')
            row(id='C1-dbq0px-zero', symptom='C1 (b) 0 px: the frame at readiness equals the frame after the queued bake fired (max |Δ| 0 over every pixel, in-page float readback)', quantity='census:contract:dbq0MaxDelta', op='<=', target=0, pm=0,
                arm=True, arm_from='dbq0pxlegacy', arm_table='predator_apex_9ft@dbq0px', source='window.__dbq0.maxDelta (frame C at first readiness vs frame D 5.5 s later, one boot); arm = ?venueReadiness=legacy (the bake fires between C and D → Δ > 0 → RED)', **D0)
            row(id='C1-dbq0px-pct', symptom='C1 (b) 0 px: 0 % of pixels differ between the frame at readiness and the frame after the bake', quantity='census:contract:dbq0PctDiff', op='<=', target=0, pm=0,
                arm=True, arm_from='dbq0pxlegacy', arm_table='predator_apex_9ft@dbq0px', source='window.__dbq0.pctDiff; arm = the legacy readiness (> 0 → RED)', **D0)
            row(id='C1-dbq0px-readyafter', symptom='C1 (b): readiness arrived only after the 4000 ms debounce fired (readyAtMs ≥ 3500)', quantity='census:contract:dbq0ReadyAtMs', op='>=', target=3500, pm=0,
                arm=True, arm_from='dbq0pxlegacy', arm_table='predator_apex_9ft@dbq0px', source='window.__dbq0.readyAtMs; arm = the legacy readiness (ready at once, ≈ 0 → RED)', **D0)
            DH = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft', reads_from='degradehold')
            row(id='C1-degradehold-degraded', symptom='C1 (b): the runtime degradation ran (venueThrow=render → degradeVenue)', quantity='census:contract:venueDegraded', op='>=', target=1, pm=0,
                arm=True, arm_from='after', arm_table='predator_apex_9ft', source='window.__venueDegrade present; arm = the fresh boot (0 → RED)', **DH)
            row(id='C1-degradehold-cancelled', symptom='C1 (b): the degrade dropped the queued re-bake (nothing queued at settle; the seal arm degradeholdforever = the pre-C1 rule never settles)', quantity='census:contract:venueRebakeQueued', op='<=', target=0, pm=0,
                arm=False, arm_note='declared weak arm: a settled capture never reads a queued bake by construction — the seal arm degradeholdforever carries the red arm (never settled with "queued":true)', source='state().venue.rebakeQueued at settle under a held debounce', **DH)
            row(id='C1-degradehold-pending0', symptom='C1 (b): pending reads false at settle (capture pending false, nothing queued)', quantity='census:contract:venuePending', op='<=', target=0, pm=0,
                arm=False, arm_note='declared weak arm (settle law)', source='state().venue.pending', **DH)
            # ---- ORDER-LIGHT-C1 (review r1 P3, shading.js:2251): the INJECTED WeakRef set is BOUNDED by the live injected materials — a
            # registered material's 'dispose' removes its entry at once and every registration sweeps the collected ones. Measured by the churn
            # poke (200 throwaway materials through the real injectAnalytic, disposed at once): the size after == the size before (Predator:
            # 30 live materials on the Predator boot; the census reads 10 GI ball blocks, so the split is 10 ball + 20 non-ball injected materials — an earlier note here said 16 + 14, unmeasured). Arm = the same poke under the pre-C1 rule (?injectedPrune=off): the set grows by 200 → RED.
            CH = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft@churn', reads_from='churn')
            row(id='C1-churn-growth', symptom='C1 P3: 200 registered-and-disposed materials leave the INJECTED set the same size (growth 0)', quantity='census:contract:churnGrowth', op='<=', target=0, pm=0,
                arm=True, arm_from='churnoff', arm_table='predator_apex_9ft@churn', source='window.__venueChurn.after.size − before.size (shading injectedState); arm = ?injectedPrune=off (+200 → RED)', **CH)
            row(id='C1-churn-bounded', symptom='C1 P3: after the churn the set holds exactly its live materials (size == live: the bound is the live injected materials)', quantity='census:contract:shadingInjectedSize', op='<=', target=30, pm=0,
                arm=True, arm_from='churnoff', arm_table='predator_apex_9ft@churn', source='shading injectedState().size after the churn (Predator: 30 live materials); arm = ?injectedPrune=off (230 → RED)', **CH)
            row(id='C1-churn-live', symptom='C1 P3 RECORD: the live injected materials on the Predator boot (the bound)', quantity='census:contract:shadingInjectedLive', op='>=', target=0, pm=0,
                arm=False, record=True, arm_note='RECORD: the bound, measured', source='shading injectedState().live after the churn', **CH)
            row(id='C1-churn-pruneon', symptom='C1 P3: the pruning rule is on (no ?injectedPrune=off)', quantity='census:contract:shadingInjectedPrune', op='>=', target=1, pm=0,
                arm=True, arm_from='churnoff', arm_table='predator_apex_9ft@churn', source='shading injectedState().prune; arm = the seam off (0 → RED)', **CH)
            # C1 verifier round: the order's own arm — N reracks. A rerack DOES re-create the ball materials (game.js applyRack: disposeBalls +
            # buildBallSet → 10 dispose-and-register cycles through the real injectAnalytic each), so the throwrerack set's census after
            # __test.rerack(3) measures the bound on the app path itself: 30 cycles, size still == live. Arm = the churn set under ?injectedPrune=off.
            RR = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft@rerack', reads_from='throwrerack')
            row(id='C1-rerack-bounded', symptom='C1 P3 (verifier round): after three reracks on the app path (30 ball-material dispose-and-register cycles) the INJECTED set still holds exactly its live materials (30)', quantity='census:contract:shadingInjectedSize', op='<=', target=30, pm=0,
                arm=True, arm_from='churnoff', arm_table='predator_apex_9ft@churn', source='shading injectedState().size after __test.rerack(3) (throwrerack set); arm = the churn set under ?injectedPrune=off (230 → RED)', **RR)
            row(id='C1-rerack-live', symptom='C1 P3 RECORD: the live injected materials after three reracks (the bound on the app path)', quantity='census:contract:shadingInjectedLive', op='>=', target=0, pm=0,
                arm=False, record=True, arm_note='RECORD: the bound after the reracks, measured', source='shading injectedState().live after __test.rerack(3)', **RR)
            # ---- ORDER-LIGHT-C2 (a) (review r2 P2, shading.js:2203): the GI weight follows the ACTIVE rig. The studio set installs the
            # cinematic-export rig (web/app/cinelight.js installCineLight, the real leaf, over the GI-backed Predator canopy boot) ONE
            # BOOT PER CELL, with the rig's visible RectAreaLights scaled to 1 / 0.5 / 0.25 of the installed values (the rims are
            # PointLights and stay; the private env cube is baked at install, before the scale). Fixed app: uGiOn 0 under the studio rig
            # (main's LTC direct term back on balls / cloth / furniture, plan-flank fill and SH fill off, the room's baked layers
            # suspended), so the cue ball's CROWN band luminance (where the overhead rect lands) falls at each step. Arms: studionoop (the
            # same cells at factor 1: rel ≈ 1, the boot floor, judged) arms the monotone rows; studiopre (the pre-C2 app under the same
            # rig) arms the uGiOn row; the after set (no studio rig) arms the announce rows. The monotone rows are MONOTONICITY checks
            # (the rect's LTC specular falls in both apps); the DIFFERENTIATING evidence is the uGiOn census under the rig and the seal's
            # offcheck-studio-legacy-* pixel identity (fixed app == `?rectDiffuse=legacy` under the rig; arm2 = the pre-C2 app != it), and
            # the fixed-vs-pre-C2 per-band ratios are RECORDED (relx rows) so the write-up quotes both apps' numbers.
            ST = dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from='studio')
            EPS = 2.0 ** -8  # a CHOSEN conservative relative threshold on linear Y (2^-8 ≈ 0.39 %; not a quantum of the HDR read): the studio cells are separate boots, and the studionoop set MEASURES the boot floor and is JUDGED at 2^-10 below
            row(id='C2-studio-cinelight', symptom='C2 (a): the studio rig announced itself (window.__cinelight === true) in the studio cell', quantity='census:contract:cinelight', op='>=', target=1, pm=0,
                arm=True, arm_from='after', arm_table='predator_apex_9ft', table='predator_apex_9ft@studio', source='cinelight announce seam; arm = the venue-ON boot without the rig (0 → RED)', **ST)
            for setn in ('studio', 'studionoop', 'studiopre'):
                for cell, fac in (('studio', 1.0), ('studiodim50', 0.5 if setn != 'studionoop' else 1.0), ('studiodim25', 0.25 if setn != 'studionoop' else 1.0)):
                    RW = dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from=setn, table=f'predator_apex_9ft@{cell}')
                    row(id=f'C2-studio-rig-{setn}-{cell}', symptom=f'C2 (a) witness: the rig is INSTALLED in the {setn}@{cell} cell (cinelight announce 1) — a cell whose poke failed never reads as a rig cell', quantity='census:contract:cinelight', op='>=', target=1, pm=0,
                        arm=True, arm_from='after', arm_table='predator_apex_9ft', source='cinelight announce seam per cell; arm = the venue-ON boot without the rig (0 → RED)', **RW)
                    arm_cell = 'studiodim50' if fac == 1.0 else 'studio'
                    row(id=f'C2-studio-factor-{setn}-{cell}', symptom=f'C2 (a) witness: the {setn}@{cell} cell scaled the rig\'s rects by exactly {fac} (window.__studio.factor; null when the poke errored)', quantity='census:contract:studioFactor', op='band', target=fac, pm=0,
                        arm=True, arm_from='studio', arm_table=f'predator_apex_9ft@{arm_cell}', source=f'the poke\'s recorded factor; arm = the studio set\'s @{arm_cell} cell (a different factor → RED)', **RW)
            row(id='C2-studio-rects', symptom='C2 (a) RECORD: the rig\'s visible RectAreaLights the dim pokes scale', quantity='census:contract:studioRects', op='>=', target=1, pm=0,
                arm=False, record=True, arm_note='RECORD: the dimmed emitter count', table='predator_apex_9ft@studio', source='window.__studio.rects.length', **ST)
            row(id='C2-studio-gioff', symptom='C2 (a): under the studio rig the GI weight is OFF (uGiOn 0: main\'s direct term restored on every injected program)', quantity='census:contract:giOn', op='<=', target=0, pm=0,
                arm=True, arm_from='studiopre', arm_table='predator_apex_9ft@studio', table='predator_apex_9ft@studio', source='gi uniforms.uGiOn under the rig; arm = the pre-C2 app under the same rig (1 → RED)', **ST)
            row(id='C2-studio-rigmatch', symptom='C2 (a): gi.js reads the ACTIVE rig as not the bake\'s (rigMatch 0)', quantity='census:contract:giRigMatch', op='<=', target=0, pm=0,
                arm=True, arm_from='after', arm_table='predator_apex_9ft', table='predator_apex_9ft@studio', source='gi probeState().rigMatch; arm = the gameplay rig (1 → RED)', **ST)
            row(id='C2-studio-roomsuspended', symptom='C2 (a): the room\'s baked floor light map + table-shadow overlay are suspended under the studio rig', quantity='census:contract:giRoomSuspended', op='>=', target=1, pm=0,
                arm=True, arm_from='after', arm_table='predator_apex_9ft', table='predator_apex_9ft@studio', source='gi probeState().roomSuspended; arm = the gameplay rig (0 → RED)', **ST)
            row(id='C2-studio-gibound', symptom='C2 (a) RECORD: the gameplay bake stays BOUND behind the weight (giBound 1) — the revert re-lights without a fetch', quantity='census:contract:giBound', op='>=', target=0, pm=0,
                arm=False, record=True, arm_note='RECORD: the bind survives the rig', table='predator_apex_9ft@studio', source='gi probeState().giBound', **ST)
            # The band: the CROWN (n_up > 0.55) — the one overhead rect of the canopy rig lands its direct term on the top of the ball; the
            # equator sees mostly the rig's rims (PointLights, not dimmed by the poke) and the under band sees no rect at all (smoke on the
            # fixed app: crown 0.786 / 0.868 per halving, equator 0.985 / 0.991, under 1.000 / 1.000 — all three recorded below).
            for cell, prev, fac in (('studiodim50', 'studio', 0.5), ('studiodim25', 'studiodim50', 0.25)):
                row(id=f'C2-studio-mono-{cell}', symptom=f'C2 (a): halving the rig\'s rect intensities (× {fac} of the installed rig) LOWERS the cue ball crown luminance by more than one 8-bit step (separate boots; floor measured by studionoop)', quantity=f'rel:{prev}:ball:0:crown_Y', op='<=', target=1 - EPS, pm=0,
                    arm=True, arm_from='studionoop', arm_table=f'predator_apex_9ft@{cell}', table=f'predator_apex_9ft@{cell}', source=f'reads ball0 crown Y at @{cell} / @{prev} (one boot per cell); arm = the same cells at factor 1 (rel ≈ 1 → RED; the boot floor, recorded)', **ST)
                for band in ('crown', 'equator', 'under'):
                    row(id=f'C2-studio-rel-{band}-{cell}', symptom=f'C2 (a) RECORD: L(× {fac}) / L(previous step) on the {band} band — 1 − rel = the rect term\'s share of the step', quantity=f'rel:{prev}:ball:0:{band}_Y', op='>=', target=0, pm=0,
                        arm=False, record=True, arm_note='RECORD: the measured share', table=f'predator_apex_9ft@{cell}', source='the numbers the order asked for (before/after luminance on the ball, per band)', **ST)
            NP = dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from='studionoop')
            PR = dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from='studiopre')
            for cell, prev in (('studiodim50', 'studio'), ('studiodim25', 'studiodim50')):
                row(id=f'C2-studio-noopfloor-{cell}', symptom=f'C2 (a): the boot-to-boot floor of the rel comparison — the same rig installed at factor 1 in two boots ({cell} vs {prev} of the studionoop set) reads 1 within 2^-10 (a quarter of the monotone threshold)', quantity=f'rel:{prev}:ball:0:crown_Y', op='band', target=1.0, pm=2.0 ** -10,
                    arm=True, arm_from='studio', arm_table=f'predator_apex_9ft@{cell}', source='studionoop set: install + factor 1 in every cell; arm = the fixed studio set\'s dimmed cell (rel ≈ 0.79 → RED)', table=f'predator_apex_9ft@{cell}', **NP)
                for band in ('crown', 'equator', 'under'):
                    row(id=f'C2-studio-pre-rel-{band}-{cell}', symptom=f'C2 (a) RECORD: the PRE-C2 app under the same rig — L(step) / L(previous) on the {band} band (its rect term on balls is the LTC specular only)', quantity=f'rel:{prev}:ball:0:{band}_Y', op='>=', target=0, pm=0,
                        arm=False, record=True, arm_note='RECORD: the finding\'s own numbers', table=f'predator_apex_9ft@{cell}', source='studiopre set (prefix11-c9e44692 app, this tooling)', **PR)
            for cell in ('studio', 'studiodim50', 'studiodim25'):
                for band in ('crown', 'equator', 'under'):
                    row(id=f'C2-studio-vs-pre-{band}-{cell}', symptom=f'C2 (a) RECORD: fixed app / pre-C2 app, {band} band luminance in the {cell} cell (the direct term the weight had removed, per band)', quantity=f'relx:studiopre:ball:0:{band}_Y', op='>=', target=0, pm=0,
                        arm=False, record=True, arm_note='RECORD: fixed over pre-C2 under the same rig', table=f'predator_apex_9ft@{cell}', source='reads of the studio set over the studiopre set, same cell', **ST)
            # refuter P2 arms — hemi ownership across the window (one boot each; the poke installs, provokes, reverts; the census is post-revert)
            LT = dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from='studiolate', table='predator_apex_9ft@studiolate')
            SW = dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from='studiofail', table='predator_apex_9ft@studiofail')
            row(id='C2-studiolate-hemi', symptom='C2 refuter P2: a bind that landed INSIDE the window is applied after the revert with the hemi at the bake\'s dim of the BUILD value — hemi now / hemi before the install = 1 (both the bound dim); the in-window studio cell reads cinelight\'s 0.05 over the dim', quantity='census:contract:studioHemiRatio', op='band', target=1.0, pm=0,
                arm=True, arm_from='studio', arm_table='predator_apex_9ft@studio', source='room hemi now / window.__studioHemi0; arm = the studio cell inside the window (→ RED)', **LT)
            row(id='C2-studiolate-roombaked', symptom='C2 refuter P2: the deferred bind landed — the room shows the bake again after the revert', quantity='census:contract:giRoomBaked', op='>=', target=1, pm=0,
                arm=True, arm_from='studio', arm_table='predator_apex_9ft@studio', source='gi probeState().roomBaked post-revert; arm = the studio cell inside the window (suspended: 0 → RED)', **LT)
            row(id='C2-studiolate-gion', symptom='C2 refuter P2: the GI weight is back on after the revert (uGiOn 1, rig gameplay)', quantity='census:contract:giOn', op='>=', target=1, pm=0,
                arm=True, arm_from='studio', arm_table='predator_apex_9ft@studio', source='gi uniforms.uGiOn post-revert; arm = inside the window (0 → RED)', **LT)
            row(id='C2-studiolate-reverted', symptom='C2 refuter P2 witness: the poke reverted the rig (the announce is down: cinelight 0)', quantity='census:contract:cinelight', op='<=', target=0, pm=0,
                arm=True, arm_from='studio', arm_table='predator_apex_9ft@studio', source='cinelight announce seam post-revert; arm = inside the window (1 → RED)', **LT)
            row(id='C2-studiofail-hemi', symptom='C2 refuter P2: the bake LEFT inside the window (a live look apply that fails → settleOnError → neutralize) — after the revert the hemi is restored to its BASE (hemi now / the bound dim before the install = 2); pre-C2: restoreRoom wrote the base inside the window and cinelight\'s revert restored its snapshot of the dim (1)', quantity='census:contract:studioHemiRatio', op='band', target=2.0, pm=0,
                arm=True, arm_from='studiofailpre', arm_table='predator_apex_9ft@studiofail', source='room hemi now / window.__studioHemi0; arm = the pre-C2 app through the setLook poke the set used before the B21 re-arm (that tree predates the GH-973 retry and the in-window park) (1 → RED)', **SW)
            row(id='C2-studiofail-gioff', symptom='C2 refuter P2 witness: no bake after the failed apply (uGiOn 0, the fallback stands)', quantity='census:contract:giOn', op='<=', target=0, pm=0,
                arm=True, arm_from='after', arm_table='predator_apex_9ft', source='gi uniforms.uGiOn post-revert after the failed live apply; arm = the bound Predator boot (1 → RED)', **SW)
            row(id='C2-studiofail-reverted', symptom='C2 refuter P2 witness: the poke reverted the rig (cinelight 0)', quantity='census:contract:cinelight', op='<=', target=0, pm=0,
                arm=True, arm_from='studio', arm_table='predator_apex_9ft@studio', source='cinelight announce seam post-revert; arm = inside the window (1 → RED)', **SW)
            # ---- ORDER-LIGHT-C2-FIX2 (review r4 on 92812892 = 3 P2) --------------------------------------------------------------------
            # class A (gameplay): a runtime venue degrade on a PLAYED table keeps the SH blocks main's own path sampled — the lifecycle fixture plays
            # a shot, forces a capture failure (armThrow + setVenue), and reads the blocks / per-ball SH coefficients across the degrade. Arm = the
            # same fixture under ?venueDegradeBlocks=legacy (the pre-fix zero: delta −N, max |ΔSH| > 0).
            LC = dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from='lifecycle', table='predator_apex_9ft@lifecycle')
            LCA = dict(arm=True, arm_from='lifecyclelegacy', arm_table='predator_apex_9ft@lifecycle')
            row(id='C2X-lifecycle-blocksdelta', symptom='C2-FIX2 A: after a forced runtime degrade on a played table the populated SH blocks are not fewer than before (after − before ≥ 0)', quantity='census:contract:lcBlocksDelta', op='>=', target=0, pm=0,
                source='window.__lifecycle blocksAfter − blocksBefore (gi.probeState().ballBlocksNonZero); arm = ?venueDegradeBlocks=legacy (every block zeroed → −N)', **LCA, **LC)
            row(id='C2X-lifecycle-shmaxdelta', symptom='C2-FIX2 A: the per-ball SH irradiance coefficients read unchanged across the degrade (max |Δ| over every ball and coefficient = 0)', quantity='census:contract:lcShMaxDelta', op='<=', target=0, pm=0,
                source='window.__lifecycle shMaxDelta (material.userData.giSH before vs after); arm = ?venueDegradeBlocks=legacy (the zeroed blocks → |before|)', **LCA, **LC)
            for k, sym in (('lcShot', 'the shot was played and settled (state left PLAYBACK)'), ('lcBlocksBefore', 'populated SH blocks after the shot, before the degrade'), ('lcBlocksAfter', 'populated SH blocks after the degrade'), ('lcDegraded', 'the forced capture failure reached degradeVenue (window.__venueDegrade)'), ('giBallBlocksFromMain', 'the blocks were sampled by main\'s own path (a played table)')):
                row(id=f'C2X-lifecycle-{k}', symptom=f'C2-FIX2 A RECORD: {sym}', quantity=f'census:contract:{k}', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source='the lifecycle poke record / gi.probeState()', **LC)
            # class A2: a COLD boot still starts from zero blocks (the legacy path unchanged) — the ?venue=off boot vs the venue boot's 10
            row(id='C2X-coldboot-blocks', symptom='C2-FIX2 A2: a cold ?venue=off boot starts with no populated SH block (main\'s path samples on the first move)', quantity='census:contract:giBallBlocksNonZero', op='<=', target=0, pm=0,
                arm=True, arm_from='after', arm_table='predator_apex_9ft', table='predator_apex_9ft', reads_from='off', look='default', pose=None, provenance='DERIVED', source='gi.probeState().ballBlocksNonZero on the off boot; arm = the venue boot (10 → RED)')
            # class B (app): the public __rebakeEnv seam across two overlapping studio windows on a table without a derived venue capture —
            # exactly ONE bake after the last close and nothing left pending; arm = ?venueRebakeDefer=legacy (0 bakes, the request dropped and still flagged)
            # (land17 seal, check-arms NO-READ ×2) the reads are keyed by the POKE LABEL, not the set name: the rebake2 poke → @rebake2, rebake1 → @rebake1
            RB = dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from='rebakedefer', table='predator_apex_9ft@rebake2')
            RBA = dict(arm=True, arm_from='rebakedeferlegacy', arm_table='predator_apex_9ft@rebake2')
            row(id='C2X-rebake-overlap-bakes', symptom='C2-FIX2 B1: two overlapping studio exports → exactly ONE bake through window.__rebakeEnv after the second close', quantity='census:contract:rebakeSeamBakes', op='band', target=1, pm=0,
                source='window.__rebakeEnv.bakes across the rebake2 poke; arm = ?venueRebakeDefer=legacy (0: the second window opened inside the 120 ms debounce and the request was dropped)', **RBA, **RB)
            row(id='C2X-rebake-overlap-pending', symptom='C2-FIX2 B1: nothing is left pending on the seam after the bake (a request is pending until a bake executes, then cleared)', quantity='census:contract:rebakeSeamPending', op='<=', target=0, pm=0,
                source='window.__rebakeEnv.pending after the poke; arm = the legacy rule (the dropped request stays flagged → 1)', **RBA, **RB)
            row(id='C2X-rebake-overlap-delay', symptom='C2-FIX2 B1 RECORD: ms from the last close to the bake (the 120 ms debounce)', quantity='census:contract:rebakeSeamDelayMs', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source='window.__rebakeEnv.lastBakeAt − the second close', **RB)
            RS = dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from='rebakesingle', table='predator_apex_9ft@rebake1')
            row(id='C2X-rebake-single-bakes', symptom='C2-FIX2 B2 RECORD: one studio export → one bake through the seam (unchanged)', quantity='census:contract:rebakeSeamBakes', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number (1 expected)', source='window.__rebakeEnv.bakes across the rebake1 poke', **RS)
            row(id='C2X-rebake-single-delay', symptom='C2-FIX2 B2 RECORD: ms from the close to the bake (unchanged timing)', quantity='census:contract:rebakeSeamDelayMs', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source='window.__rebakeEnv.lastBakeAt − the close', **RS)
            # ---- ORDER-LIGHT-C2-FIX3 class A (review r5 P2, shading.js:2204-2208): the two-ball occlusion fixture. gridshadow = ball 1 laid touching the
            # cue ball along the table's long axis toward the bars' far end (venue ON, GI bound); gridshadowlegacy = the same poke under
            # ?venueGridShadow=legacy (the pre-fix ball text). Pose `crevice` (fixture-only, lighting-page.mjs) looks at the contact point from the
            # cueball_level standoff at 45° elevation. render-reads weights every disc pixel of the cue ball by the lamps' sampled visibility from its
            # surface point (the census's rect bars, the neighbour as the sphere occluder): lampshadow_Y = the shadow-weighted luminance,
            # lamplit_Y = the lit-weighted luminance. relset = fixed / legacy twin (same poke, same boot); the twin over itself reads exactly 1.
            GS = dict(look='default', pose='crevice', provenance='DERIVED', reads_from='gridshadow', table='predator_apex_9ft@gridshadow')
            GSA = dict(arm=True, arm_from='gridshadowlegacy', arm_table='predator_apex_9ft@gridshadow')
            row(id='C2X-gridshadow-shadow-darker', symptom="C2-FIX3 A1: the cue ball's lamp-shadowed pixels (weighted by the lamp irradiance the neighbour hides from each surface point) are darker on the fixed tree than under the legacy text — the lamp's DIFFUSE shadow is present (relset fixed / legacy < 1)", quantity='relset:gridshadowlegacy:ball:0:lampshadow_Y', op='<', target=1.0, pm=0.0,
                source='Σ(1−V)·Y / Σ(1−V) over the cue ball disc on the crevice pose, fixed set / legacy twin; V = the sampled lit fraction of the rect bars from the pixel\'s surface point; arm = the twin over itself (reads exactly 1: the strict < fails)', **GSA, **GS)
            row(id='C2X-gridshadow-compiled', symptom='C2-FIX3 A1 witness: every lit ball program of the fixture carries the COMPILED grid-direct split ((a) the accumulator in the rect loop, (b) the shadowed subtraction)', quantity='programs:ball:gridDirectMissing', op='<=', target=0, pm=0, pose=None,
                source='compiled-GLSL census: lit − gridDirect over the ball class; arm = the legacy twin (no program carries it: lit − 0 > 0)', **GSA, **{k: v for k, v in GS.items() if k != 'pose'})
            row(id='C2X-gridshadow-lit-ratio', symptom='C2-FIX3 A2 RECORD: the cue ball\'s lamp-LIT pixels (weighted by V), fixed / legacy (≈ 1: only the shadowed portion of the key moves; the sampled V = 1 pixels may still sit in the analytic penumbra)', quantity='relset:gridshadowlegacy:ball:0:lamplit_Y', op='>=', target=0.0, pm=0.0, arm=False, record=True,
                arm_note='RECORD: the measured ratio (the byte-level A2 is judged by the chain: the fixed conv vs the previous tag on cueball_level, and convlegacy vs the previous tag)', source='ΣV·Y / ΣV over the disc, fixed / legacy', **GS)
            row(id='C2X-gridshadow-shadow-Y', symptom='C2-FIX3 A1 RECORD: the shadow-weighted luminance, fixed tree (scene-linear Y)', quantity='ball:0:lampshadow_Y', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the measured number', source='render-reads lampshadow_Y', **GS)
            row(id='C2X-gridshadow-lit-Y', symptom='C2-FIX3 A1 RECORD: the lit-weighted luminance, fixed tree (scene-linear Y)', quantity='ball:0:lamplit_Y', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the measured number', source='render-reads lamplit_Y', **GS)
            row(id='C2X-gridshadow-shadow-frac', symptom="C2-FIX3 A1 RECORD: the disc's shadow weight Σ(1−V) / N (how much of the cue ball's lamp irradiance the neighbour hides, pixel-averaged)", quantity='ball:0:lampshadow_frac', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the measured number', source='render-reads lampshadow_frac', **GS)
            row(id='C2X-gridshadow-shadow-px', symptom='C2-FIX3 A1 RECORD: disc pixels with any sampled lamp ray blocked by the neighbour', quantity='ball:0:lampshadow_px', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the measured number', source='render-reads lampshadow_px (V < 1)', **GS)
            row(id='C2X-gridshadow-crown-ratio', symptom='C2-FIX3 A RECORD: the cue ball crown on the crevice pose, fixed / legacy', quantity='relset:gridshadowlegacy:ball:0:crown_Y', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the measured ratio', source='median scene-linear Y of the crown band, fixed / legacy', **GS)
            row(id='C2X-gridshadow-gap', symptom="C2-FIX3 A1 RECORD: centre distance cue ball → nearest ball (m) — the fixture's own layout (2R + 0.5 mm)", quantity='ball:0:neighbour_m', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the measured number', source='render-reads neighbour_m (positions after the poke)', **GS)
            GSC = dict(GS, pose='cueball_level')
            row(id='C2X-gridshadow-head-crown-ratio', symptom='C2-FIX3 A RECORD: the cue ball crown from the head (cueball_level: the neighbour sits behind it), fixed / legacy', quantity='relset:gridshadowlegacy:ball:0:crown_Y', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the measured ratio', source='median scene-linear Y of the crown band on cueball_level, fixed / legacy', **GSC)
            row(id='C2X-gridshadow-head-shadow-px', symptom='C2-FIX3 A RECORD: disc pixels with any sampled lamp ray blocked, from the head (cueball_level: the neighbour sits behind the cue ball — 0 by construction: the head-facing hemisphere loses no lamp light, which is why the first fixture cut read nothing)', quantity='ball:0:lampshadow_px', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the measured number', source='render-reads lampshadow_px (V < 1) on cueball_level', **GSC)
            # ---- ORDER-LIGHT-C2-FIX4 class A (review r6 P2, shading.js:2236-2237): the negative-fragment witness. gridneg = the two-ball fixture under
            # ?venueGridDebug=neg on the IRRADIANCE form (the grid key is shadowed before three's BRDF weights it: never negative by construction);
            # gridnegfix3 = the same debug boot under ?venueGridShadow=fix3 (the FIX3 post-BRDF subtraction that lacked the (1 − max(totalScattering))
            # factor). The ball program writes 1.0 where reflectedLight.indirectDiffuse has a negative channel; debugneg_px counts those disc pixels.
            GN = dict(look='default', pose='crevice', provenance='DERIVED', reads_from='gridneg', table='predator_apex_9ft@gridshadow')
            GNA = dict(arm=True, arm_from='gridnegfix3', arm_table='predator_apex_9ft@gridshadow')
            row(id='C2X-gridneg-px', symptom='C2-FIX4 A1: cue ball fragments whose indirect diffuse goes NEGATIVE in the two-ball crevice fixture — 0 on the irradiance form (never below 0 by construction)', quantity='ball:0:debugneg_px', op='<=', target=0, pm=0, arm=False,
                arm_note='unarmed by construction: the irradiance form cannot go negative, and the fix3 twin\'s own count is RECORDED (it reads 0 too at this register — the crevice cap holds no fragment grazing enough for the missing Fresnel factor to flip the sign); the ARMED A1 witness is the over-subtraction row below', source='?venueGridDebug=neg: the ball writes 1.0 where its indirect diffuse has a negative channel; the count over the cue ball disc on the crevice pose', **GN)
            GS3 = dict(look='default', pose='crevice', provenance='DERIVED', reads_from='gridshadow', table='predator_apex_9ft@gridshadow')
            GS3A = dict(arm=True, arm_from='gridshadowfix3', arm_table='predator_apex_9ft@gridshadow')
            row(id='C2X-gridshadow-fix3-oversub', symptom='C2-FIX4 A1 (armed): the shadowed region of the cue ball reads BRIGHTER under the irradiance form than under the FIX3 post-BRDF text — fix3 removed 1/(1 − max(totalScattering)) times what the grid had added (relset FIX4 / fix3 > 1)', quantity='relset:gridshadowfix3:ball:0:lampshadow_Y', op='>', target=1.0, pm=0.0,
                source='Σ(1−V)·Y / Σ(1−V) over the cue ball disc on the crevice pose, irradiance form / fix3 twin (same poke, same boot, ?venueGridShadow=fix3); arm = the fix3 twin over itself (reads exactly 1: the strict > fails)', **GS3A, **GS3)
            row(id='C2X-gridshadow-fix3-lit', symptom='C2-FIX4 A1 RECORD: the lit-weighted region, irradiance form / fix3 (≈ 1: only shadowed pixels differ)', quantity='relset:gridshadowfix3:ball:0:lamplit_Y', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the measured ratio', source='ΣV·Y / ΣV, FIX4 / fix3', **GS3)
            row(id='C2X-gridshadow-fix3-crown', symptom='C2-FIX4 A1 RECORD: the crown, irradiance form / fix3', quantity='relset:gridshadowfix3:ball:0:crown_Y', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the measured ratio', source='median crown Y, FIX4 / fix3', **GS3)
            row(id='C2X-gridshadow-linked', symptom='C2-FIX4 witness: every ball program of the fixture LINKED (a spliced text can carry every marker and still fail to compile — the first FIX4 smoke rendered no ball at all)', quantity='programs:ball:linkFailed', op='<=', target=0, pm=0, pose=None, arm=False,
                arm_note='unarmed (a broken program is not a state a twin can be asked to produce); judged on every FIX4 set through this row and the debug sets\' own reads', source='compiled-programs census: gl.getProgramParameter(LINK_STATUS) per ball program', **{k: v for k, v in GS3.items() if k != 'pose'})
            row(id='C2X-gridneg-compiled', symptom='C2-FIX4 A witness: every lit ball program of the debug fixture carries the COMPILED irradiance form ((a) accumulator, (v) visibility ahead of lights_fragment_maps, (i) the shadowed key)', quantity='programs:ball:gridDirectMissing', op='<=', target=0, pm=0, pose=None,
                source='compiled-GLSL census: lit − gridDirect over the ball class; arm = the fix3 twin (its programs carry the post-BRDF text instead: lit − 0 > 0)', **GNA, **{k: v for k, v in GN.items() if k != 'pose'})
            row(id='C2X-gridneg-ball1-px', symptom='C2-FIX4 A1 RECORD: the touching ball (ball 1) negative-fragment count, irradiance form', quantity='ball:1:debugneg_px', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source='render-reads debugneg_px on ball 1', **GN)
            row(id='C2X-gridneg-fix3-px', symptom='C2-FIX4 A1 RECORD: the FIX3 form\'s own negative-fragment count on the cue ball (the arm\'s reading, kept as the magnitude of the defect)', quantity='ball:0:debugneg_px', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source='render-reads debugneg_px under ?venueGridShadow=fix3&venueGridDebug=neg', **dict(GN, reads_from='gridnegfix3'))
            row(id='C2X-gridneg-fix3-compiled', symptom='C2-FIX4 A RECORD: ball programs carrying the FIX3 post-BRDF text on the fix3 twin (the arm text is what it says it is)', quantity='programs:ball:gridDirectFix3', op='>=', target=0, pm=0, pose=None, arm=False, record=True, arm_note='RECORD: the measured number', source='compiled-GLSL census gridDirectFix3', **{k: v for k, v in dict(GN, reads_from='gridnegfix3').items() if k != 'pose'})
            # ---- ORDER-LIGHT-C2-FIX4 class C (review r6 P2, lighting-page.mjs:133-134): settled requires the CURRENT apply to have completed. applyseq = the
            # Predator boot under ?venue=off (no derived venue probe) & ?giDelay=3000; the poke STARTS a fixture apply and returns; the tool's settle
            # wait must not certify the old GI. applyseqlegacy = the same boot captured under OB_SETTLE_APPLYSEQ=legacy (the pre-fix predicate).
            AS = dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from='applyseq', table='predator_apex_9ft@applyseq')
            ASA = dict(arm=True, arm_from='applyseqlegacy', arm_table='predator_apex_9ft@applyseq')
            row(id='C2X-applyseq-open', symptom='C2-FIX4 C1: after a poke that starts a 3 s-stalled LOOK apply on a table without a derived venue probe, the tool declares settled only once the apply has COMPLETED — no open apply AT THE MOMENT OF SETTLE (giSeqOpenAtSettle 0); the legacy predicate certified the old GI while the apply was open (1)', quantity='census:contract:giSeqOpenAtSettle', op='<=', target=0, pm=0,
                source='the capture tool snapshots gi.state.applySeq / appliedSeq the instant its settle wait returns (window.__settleSnapshot, read by the census); arm = the same boot under OB_SETTLE_APPLYSEQ=legacy (the smoke showed the dump itself lands after the hold: the at-dump field reads 0 on both — recorded below)', **ASA, **AS)
            row(id='C2X-applyseq-open-atdump', symptom='C2-FIX4 C1 RECORD: the open-apply flag at the DUMP (the poses land ~2–4 s after settle; a 3 s hold has ended by then on both rules — why the judged row reads the settle instant)', quantity='census:contract:giSeqOpen', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source='census giSeqOpen at the dump', **AS)
            row(id='C2X-applyseq-applied', symptom='C2-FIX4 C1 RECORD: the completed apply sequence at the dump', quantity='census:contract:giAppliedSeq', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source='census giAppliedSeq', **AS)
            row(id='C2X-applyseq-started', symptom='C2-FIX4 C1 RECORD: the started apply sequence at the dump', quantity='census:contract:giApplySeq', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source='census giApplySeq', **AS)
            row(id='C2X-applyseq-noprobe', symptom='C2-FIX4 C1 RECORD: the fixture is a table WITHOUT a derived venue probe (venueDerived 0 under ?venue=off)', quantity='census:contract:venueDerived', op='<=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source='census venueDerived', **AS)
            row(id='C2X-applyseq-legacy-open', symptom='C2-FIX4 C1 RECORD: the legacy predicate\'s own reading at its settle instant (the open apply it certified)', quantity='census:contract:giSeqOpenAtSettle', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source='census giSeqOpenAtSettle under OB_SETTLE_APPLYSEQ=legacy', **dict(AS, reads_from='applyseqlegacy'))
            # ---- ORDER-LIGHT-C2-FIX5 (review r7 = 2 P2 + the lane's E1–E4) ----
            # class F (shading.js: the replacement diffuse key carries the closure shaft's LAMP visibility; the hemisphere visibility multiplies the rest).
            # cupwell = the seated ball (the cup drive, Predator's solid closure) under ?venueGridDebug=lamp: the ball program writes R = the replacement
            # key's lamp-accounted diffuse term as it lands, G = the live direct diffuse (the LTC leg the grid replaces, sphere shadow × shaft lamp
            # visibility); debuglamp_ratio = R/G over the seated ball's disc. cupwelllegacy = the same under ?venueWellVis=legacy (the 793c8d67 rule).
            for lk in ('default', 'sp'):
                CW = dict(look=lk, pose='cup_rest', provenance='DERIVED', reads_from='cupwell', table='predator_apex_9ft@cuprest')
                CWA = dict(arm=True, arm_from='cupwelllegacy', arm_table='predator_apex_9ft@cuprest')
                row(id=f'C2Y-well-ratio-{lk}', symptom='C2-FIX5 F1 (armed): the seated ball\'s replacement lamp term relative to the live direct diffuse is HIGHER under the shaft split than under the 793c8d67 rule (relset fixed / legacy > 1: legacy multiplied the lamp-accounted portion by the shaft\'s hemisphere visibility instead of its lamp visibility)', quantity='relset:cupwelllegacy:ball:1:debuglamp_ratio', op='>', target=1.0, pm=0.0,
                    source='mean R / mean G over the seated ball\'s disc on cup_rest (?venueGridDebug=lamp), fixed / legacy twin (same drive, same boot flags); arm = the legacy twin over itself (exactly 1: the strict > fails)', **CWA, **CW)
                row(id=f'C2Y-well-ratio-fixed-{lk}', symptom='C2-FIX5 F1 RECORD: replacement lamp term / live direct diffuse on the fixed tree (the form: min(K, D)/D × vis_rep/vis_live — 1 when the key covers the lamp and the visibilities agree; the deficit is the key\'s own, stated)', quantity='ball:1:debuglamp_ratio', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the measured ratio', source='cupwell debuglamp_ratio', **CW)
                row(id=f'C2Y-well-ratio-legacy-{lk}', symptom='C2-FIX5 F3 RECORD (the red arm\'s number): the same ratio under the 793c8d67 rule — the missing diffuse', quantity='ball:1:debuglamp_ratio', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the measured ratio', source='cupwelllegacy debuglamp_ratio', **dict(CW, reads_from='cupwelllegacy'))
                row(id=f'C2Y-well-rep-{lk}', symptom='C2-FIX5 F1 RECORD: the replacement lamp term (mean linear luminance over the seated ball\'s disc), fixed', quantity='ball:1:debuglamp_rep', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD', source='cupwell debuglamp_rep', **CW)
                row(id=f'C2Y-well-live-{lk}', symptom='C2-FIX5 F1 RECORD: the live direct diffuse term (mean linear luminance over the seated ball\'s disc) — main\'s LTC value with the shaft visibility', quantity='ball:1:debuglamp_live', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD', source='cupwell debuglamp_live', **CW)
                row(id=f'C2Y-well-lampdebug-{lk}', symptom='C2-FIX5 F1: the lamp-debug channels are COMPILED on every lit ball program of the debug set — none missing (the cup scene lays out two balls; the count is the scene\'s, the missing form is constant-free)', quantity='programs:ball:gridLampDebugMissing', op='<=', target=0, pm=0, arm=True, arm_from='cup', arm_table='predator_apex_9ft@cuprest', source='lit − gridLampDebug on cupwell; arm = the plain cup set (no debug text: every lit program missing → RED)', **dict(CW, pose=None))
            # F4: program identity — the shaft split is compiled on every venue ball program of the fixed tree and on none of the legacy twin
            for lk in ('default', 'sp'):
                row(id=f'C2Y-well-programs-{lk}', symptom='C2-FIX5 F4: every lit ball program of the venue boot carries the shaft split (v\' + i\' + h) — none missing; the legacy twin carries none (every lit program missing)', quantity='programs:ball:gridWellMissing', op='<=', target=0, pm=0, arm=True, arm_from='welllegacy', arm_table='predator_apex_9ft', table='predator_apex_9ft', look=lk, pose=None, provenance='DERIVED', reads_from='after', source='lit − gridWell on the sealed after set; arm = welllegacy (?venueWellVis=legacy: 10 missing → RED)')
                row(id=f'C2Y-well-programs-legacy-{lk}', symptom='C2-FIX5 F4 RECORD: the legacy twin\'s count (0)', quantity='programs:ball:gridWell', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD', table='predator_apex_9ft', look=lk, pose=None, provenance='DERIVED', reads_from='welllegacy', source='programs census gridWell on welllegacy')
                row(id=f'C2Y-well-programs-wpa-{lk}', symptom='C2-FIX5 F5: a table WITHOUT a solid closure compiles the same split text (the split is the identity there: uBallWell.z = 0 on every ball) — program identity across tables, pixels judged by the chain\'s offcheck', quantity='programs:ball:gridWellMissing', op='<=', target=0, pm=0, arm=False, record=True, arm_note='RECORD (the pixel identity is the chain\'s offcheck after vs welllegacy at 0 px)', table='wpa_spec_9ft', look=lk, pose=None, provenance='DERIVED', reads_from='after', source='lit − gridWell on wpa_spec_9ft')
            # class G (gi.js: a suspended / kept bake whose key moved is dropped, never re-enabled). gikey = the race script on the fixed tree,
            # gikeylegacy = ?venueGiKey=legacy (the 793c8d67 rule), gikeymain = main\'s export under the same script (the pairwise row).
            GK = dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from='gikey', table='predator_apex_9ft@gikey')
            GKA = dict(arm=True, arm_from='gikeylegacy', arm_table='predator_apex_9ft@gikey')
            row(id='C2Y-gikey-stale', symptom='C2-FIX5 G1: across the race (window open → another baked fixture requested with the apply held → window closed while pending → the request completes) NO frame re-enables a bake whose bound fixture is not the requested one (giTraceStaleOn 0); the 793c8d67 rule re-enabled the stale bake at the close (≥ 1)', quantity='census:contract:giTraceStaleOn', op='<=', target=0, pm=0,
                source='window.__giTrace (the gikey drive: per-frame gi.state / uGiOn trace); arm = the same script under ?venueGiKey=legacy', **GKA, **GK)
            row(id='C2Y-gikey-onbefore', symptom='C2-FIX5 G1: no frame has uGiOn = 1 while the new request is still open (GI stays OFF until the new bind, as main does)', quantity='census:contract:giTraceOnBeforeComplete', op='<=', target=0, pm=0, source='window.__giTrace onBeforeComplete; arm = ?venueGiKey=legacy', **GKA, **GK)
            row(id='C2Y-gikey-dropped', symptom='C2-FIX5 G1: the invalidation fired on the held set (giKeyStaleDropped ≥ 1) — the pre-FIX5 check skipped it (0)', quantity='census:contract:giKeyStaleDropped', op='>=', target=1, pm=0, source='gi.probeState giKeyStaleDropped; arm = ?venueGiKey=legacy (0 → RED)', **GKA, **GK)
            row(id='C2Y-gikey-completed', symptom='C2-FIX5 G1: the race script ran to the new request\'s completion (the trace is a whole sequence, not a truncated one)', quantity='census:contract:giTraceCompleted', op='>=', target=1, pm=0, arm=False, arm_note='unarmed (a precondition of the two rows above; a truncated trace fails the capture: the drive writes __pokeResult.error)', source='window.__giTrace completed', **GK)
            for nm, q, sym in (('frames', 'giTraceFrames', 'frames traced'), ('closed', 'giTraceClosedAtFrame', 'the frame index at which the window closed'), ('stale-legacy', 'giTraceStaleOn', 'the legacy twin\'s stale-on count (the red arm\'s number)')):
                rf = 'gikeylegacy' if nm == 'stale-legacy' else 'gikey'
                row(id=f'C2Y-gikey-{nm}', symptom=f'C2-FIX5 G1 RECORD: {sym}', quantity=f'census:contract:{q}', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD', source=f'window.__giTrace {q}', **dict(GK, reads_from=rf))
            GM = dict(GK, reads_from='gikeymain')
            row(id='C2Y-gikey-main-stale', symptom='C2-FIX5 G2 (pairwise): main\'s export under the SAME script — no stale re-enable (main kept GI off through the interval); the fixed tree\'s sequence matches it', quantity='census:contract:giTraceStaleOn', op='<=', target=0, pm=0, arm=False, arm_note='unarmed by construction: main\'s tree carries no arm flag; the row states main\'s own behaviour, the fixed tree is judged against the legacy arm above', source='gikeymain window.__giTrace staleOn', **GM)
            row(id='C2Y-gikey-main-onbefore', symptom='C2-FIX5 G2 RECORD: main\'s on-before count — NOT the stale count: main\'s gi.state carries no appliedSeq, so the drive\'s open-request test (applySeq !== appliedSeq) reads open on every frame and its completion test never passes there (the trace runs to its 20 s cap); the frames counted are GI-on frames after main\'s bind landed (bakeFixture = the requested one, staleOn 0)', quantity='census:contract:giTraceOnBeforeComplete', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: main\'s field set differs (stated)', source='gikeymain window.__giTrace onBeforeComplete', **GM)
            row(id='C2Y-gikey-main-completed', symptom='C2-FIX5 G2 RECORD: main\'s run completed the request', quantity='census:contract:giTraceCompleted', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD', source='gikeymain window.__giTrace completed', **GM)
            # E1 (RECORD): the wait\'s decomposition on the sealed after set; E3: the post-fade bake is gone (the legacy twin fires it)
            for lk in ('default', 'sp'):
                E1 = dict(look=lk, pose=None, provenance='DERIVED', reads_from='after', table='predator_apex_9ft')
                for q, sym in (('venueBake1Ms', 'bake 1 cost (ms) — the first synchronous env bake after the apply, where the #756 step sits'), ('venueBake2Ms', 'bake 2 cost (ms)'), ('venueBakeCold1', 'bake 1 compiled programs (1 = cold)'), ('venueBakeCount', 'env bakes this apply fired'), ('venueLongestFrameMs', 'the longest RAF gap inside the wait (ms)'), ('venueIdleTailMs', 'ms from the last bake to the capture'), ('venueTailPolls', 'attempt polls from the last bake to the capture (1 by construction)')):
                    row(id=f'C2Y-e1-{q}-{lk}', symptom=f'C2-FIX5 E1 RECORD (#756 instrument): {sym}', quantity=f'census:contract:{q}', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source=f'lightingvisuals venue.applied.{q[5].lower() + q[6:]} (E1 trace)', **E1)
                row(id=f'C2Y-probefade-{lk}', symptom='C2-FIX5 E3: the shipped rule fires NO post-fade bake (the probe renders inside the lamp-fade suspension; E3 measured the SH bit-identical either way) — the legacy twin fires one', quantity='census:contract:venuePostFadeBake', op='<=', target=0, pm=0, arm=True, arm_from='probefadelegacy', arm_table='predator_apex_9ft', source='venue.applied.postFadeBake; arm = ?venueProbeFade=legacy (1 → RED)', **E1)
                row(id=f'C2Y-probefade-legacy-{lk}', symptom='C2-FIX5 E3 RECORD: the legacy twin\'s post-fade bake (1)', quantity='census:contract:venuePostFadeBake', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD', source='probefadelegacy venue.applied.postFadeBake', **dict(E1, reads_from='probefadelegacy'))
                row(id=f'C2Y-probefade-sh-{lk}', symptom='C2-FIX5 E3 RECORD: the cue ball\'s crown, fixed / legacy-fade twin (≈ 1: the probe never saw the fade)', quantity='relset:probefadelegacy:ball:0:crown_Y', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the measured ratio (boot-to-boot, not a strict identity)', source='median crown Y on cueball_level, after / probefadelegacy', **dict(E1, pose='cueball_level'))
            # ---- ORDER-LIGHT-C2-FIX6 (review r8 = 3 P2: classes H / I / J) ----
            # class H: a probe is accepted only when no bake is pending / queued (the gate reads the bake state, never the clock). slowbake = the
            # slow-bake race (?venueDebounce=hold:16000 crosses the 15 s budget with a bake queued); slowbakelegacy = ?venueAccept=legacy (5667a488).
            SB = dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from='slowbake', table='predator_apex_9ft')
            SBA = dict(arm=True, arm_from='slowbakelegacy', arm_table='predator_apex_9ft')
            row(id='C2Z-slowbake-accept', symptom='C2-FIX6 H1: across the slow-bake race NO probe was accepted while a bake was pending / queued / held (acceptWhileQueued 0 — the gate reads the bake state); the 5667a488 rule accepted the zero delta from the same cube at +50 ms with the 16 s bake queued (≥ 1)', quantity='census:contract:venueAcceptWhileQueued', op='<=', target=0, pm=0,
                source='lightingvisuals venue.applied.acceptWhileQueued (the acceptance trace); arm = the same boot under ?venueAccept=legacy', **SBA, **SB)
            # ORDER-LIGHT-C2-FIX7 class H2: at the budget a pending / queued / held bake DEGRADES BY NAME (never accepted, never waited for past the budget);
            # slowbakefix6 = ?venueAccept=fix6, the 7a522bd2 rule (a timer-armed bake waited for — 64.8 s), the red plant of the two judged rows
            SB6 = dict(arm=True, arm_from='slowbakefix6', arm_table='predator_apex_9ft')
            row(id='C2Z-slowbake-derived', symptom='C2-FIX7 H2-1: the shipped rule does NOT derive the probe on the slow-bake boot — it degrades by name at the budget (derived 0); the 7a522bd2 rule (?venueAccept=fix6) waited 64.8 s for the queued bake and derived (1)', quantity='census:contract:venueDerived', op='<=', target=0, pm=0, source='census venueDerived on slowbake; arm = the same boot under ?venueAccept=fix6', **SB6, **SB)
            row(id='C2Z-slowbake-degrade', symptom='C2-FIX7 H2-1: the slow-bake boot DEGRADED BY NAME at the settle budget (venueBudgetDegrade 1; the census venueError names settle-budget-bake-pending with the pending / queued / held state and the elapsed ms); the fix6 plant never degrades (0)', quantity='census:contract:venueBudgetDegrade', op='>=', target=1, pm=0, source='census venueBudgetDegrade on slowbake (the durable budgetDegradeRecord); arm = ?venueAccept=fix6', **SB6, **SB)
            # ---- ORDER-LIGHT-C2-FIX8 class H3 (ruling (B), the one-owed-schedule rule) ----
            # H3-2: the planted slow bake degrades by name at the first decision point the budget allows (its owed 16 s schedule + bake + one poll ≈ 16.4 s);
            # H3-3: the schedule marked unbounded degrades AT the budget (≈ 15.0 s) — the classifier reads the schedule: relset slowbake / h3unbounded of the wait > 1;
            # H3-5: every slow-bake boot carries the classification (unbounded 1, rounds ≥ 0, a bound on the owed one).
            row(id='C2AC-h3-slowbake-unbounded', symptom='C2-FIX8 H3-2: the planted slow bake is classified UNBOUNDED (the loop re-armed past the budget after its owed schedule landed) and degraded by name', quantity='census:contract:venueH3Unbounded', op='>=', target=1, pm=0, source='census venueH3Unbounded on slowbake; arm = ?venueAccept=fix6 (7a522bd2: waited 64.8 s, never classified — null read)', **SB6, **SB)
            row(id='C2AC-h3-slowbake-rounds', symptom='C2-FIX8 H3-2 RECORD: rounds the loop re-armed past the budget before the degrade (1 = the first re-arm after the owed schedule)', quantity='census:contract:venueH3Rounds', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD', source='slowbake census venueH3Rounds', **SB)
            row(id='C2AC-h3-slowbake-bound', symptom='C2-FIX8 H3-2 RECORD: the owed schedule\'s bound (ms from the apply start: due + the longest measured bake + one poll)', quantity='census:contract:venueH3BoundMs', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD', source='slowbake census venueH3BoundMs', **SB)
            row(id='C2AC-h3-plant-degrade', symptom='C2-FIX8 H3-3: the loop\'s own schedule marked UNBOUNDED (?venueRebakeBound=unbounded) degrades AT the budget — the classifier reads the schedule', quantity='census:contract:venueBudgetDegrade', op='>=', target=1, pm=0, source='h3unbounded census venueBudgetDegrade; arm = the fix6 boot (0)', **dict(SB, reads_from='h3unbounded'), **SB6)
            row(id='C2AC-h3-plant-vs-slowbake', symptom='C2-FIX8 H3-3 (armed): the owed schedule is WAITED FOR — the slow bake\'s wait over the unbounded plant\'s wait > 1 (≈ 16.4 / 15.0); the plant over itself = 1 (RED)', quantity='relset:h3unbounded:census:contract:venueWaitedMs', op='>', target=1.0, pm=0.0, arm=True, arm_from='h3unbounded', arm_table='predator_apex_9ft', source='venueWaitedMs slowbake / h3unbounded', **SB)
            row(id='C2AC-h3-plant-waited', symptom='C2-FIX8 H3-3 RECORD: the unbounded plant\'s wait (≈ the budget + one poll)', quantity='census:contract:venueWaitedMs', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD', source='h3unbounded census venueWaitedMs', **dict(SB, reads_from='h3unbounded'))
            # H3-1: the crossing cells re-captured on the new web derive (bounded or within the budget); H3-4: their fix7 twins (the fadd4ecb rule) degrade
            # (maintainer pre-ruling 16:4xZ, land24 check-arms: an arm may not depend on incidental load) the derives-under-(B) / degrades-under-fix7 discrimination
            # is ARMED only on the DETERMINISTIC crossing forms — dbq0px / dbq0pxlegacy (hold:4000 + the DBQ0 poke: the last convergence round straddles the budget by
            # construction, 16.6–16.9 s across four runs) — and RECORDED on the natural re-captures (pendant, lookswitch: whether they cross is the box's load)
            for cs, tb, lk, po, armed in (('pendant', 'predator_apex_9ft', 'default', 'cueball_level', False), ('lookswitch', 'predator_apex_9ft', 'default', 'cueball_level', False), ('dbq0px', 'predator_apex_9ft', 'default', 'cueball_level', False), ('dbq0pxlegacy', 'predator_apex_9ft', 'default', 'cueball_level', False), ('h3bounded', 'predator_apex_9ft', 'default', 'cueball_level', True)):
                CX = dict(look=lk, pose=po, provenance='DERIVED', reads_from=cs, table=tb)
                if armed: row(id=f'C2AC-h3-{cs}-derived', symptom=f'C2-FIX8 H3-1: the deterministic crossing form {cs} (a plain default boot with venueConverge=off — one owed schedule, the accept after its bake unconditional — under the DERIVED spacing hold:10121 = (2·15000 − 794 − 646 + 1803)/3: the first bake lands ≥ 4085 ms before the effective budget and the only schedule ≥ 4085 ms after it over the stall band 0–1803 ms, so the crossing finds it pending — owed, accepted on landing; the convergence premise of the dbq form failed on land26) DERIVES under the one-owed-schedule rule; its fadd4ecb twin (?venueAccept=fix7) degrades at the budget (0)', quantity='census:contract:venueDerived', op='>=', target=1, pm=0, arm=True, arm_from=f'{cs}fix7', arm_table=tb, source=f'{cs} census venueDerived; arm = {cs}fix7', **CX)
                else: row(id=f'C2AC-h3-{cs}-derived', symptom=f'C2-FIX8 H3-1 EVIDENCE: {cs} (a natural crossing cell on land22 — a shipped fixture / poke form) re-captured on the new web: derived 1 or degraded 0 as the box\'s load made it; a shipped-form degrade on a CALM box is the finding against the declared budget (reported, never tuned)', quantity='census:contract:venueDerived', op='>=', target=0, pm=0, arm=False, record=True, arm_note='EVIDENCE (record): whether this form crosses the budget is incidental load — not an arm', source=f'{cs} census venueDerived', **CX)
                row(id=f'C2AC-h3-{cs}-class', symptom=f'C2-FIX8 H3-5 RECORD: {cs} — unbounded 0 (bounded or within the budget)', quantity='census:contract:venueH3Unbounded', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD', source=f'{cs} census venueH3Unbounded', **CX)
                row(id=f'C2AC-h3-{cs}-waited', symptom=f'C2-FIX8 H3-1 RECORD: {cs} wait (ms)', quantity='census:contract:venueWaitedMs', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD', source=f'{cs} census venueWaitedMs', **CX)
                row(id=f'C2AC-h3-{cs}-fix7-waited', symptom=f'C2-FIX8 H3-4 RECORD: {cs}fix7 wait (the fadd4ecb rule degrades at the budget)', quantity='census:contract:venueWaitedMs', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD', source=f'{cs}fix7 census venueWaitedMs', **dict(CX, reads_from=f'{cs}fix7'))
            for cs, tb, lk, po in (('gidelayprefix', 'predator_apex_9ft', 'default', 'cueball_level'),):
                row(id=f'C2AC-h3-{cs}-derived', symptom=f'C2-FIX8 H3-1 RECORD: {cs} re-captured — it runs the PREFIX export (a pre-fix web by design: the H3 predicate is not on that tree), recorded not judged', quantity='census:contract:venueDerived', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD', source=f'{cs} census venueDerived', **dict(look=lk, pose=po, provenance='DERIVED', reads_from=cs, table=tb))
            # H3 (the loop-available clock): both clocks recorded on the sets that cross or stall — wall wait, main-thread stall, effective wait, longest frame
            # ---- ORDER-LIGHT-C2-FIX9 (the last code round) ----
            # N1 (review r9 P2): the venue fill is silent inside the cinelight studio window — the uniform's L1 norm reads 0 in the studio poke boot (judged, armed by
            # the ?venueStudioGate=legacy set reading > 0) and > 0 in the same set's gameplay boot (the live control); the frames themselves are judged by check-studiofill.
            N1 = dict(look='default', pose='cueball_level', provenance='DERIVED')  # the studio / studiorevert rows address the sub-run census the gate's way: table='<table>@<poke>' (C1-dbq0px precedent); land31 attempt 1 read the BASE boot because these rows carried a `sub` key the gate does not know
            row(id='C2AD-n1-uniform-inwindow', symptom='C2-FIX9 N1: inside the cinelight studio window the venue fill uniform (obVenueSH) reads ZERO — L1 norm 0 in the studio poke boot; the ?venueStudioGate=legacy boot (arm) reads the gameplay coefficients', quantity='census:contract:venueUniformL1', op='<=', target=0, pm=0, arm=True, arm_from='studiofilllegacy', arm_table='predator_apex_9ft@studio', table='predator_apex_9ft@studio', reads_from='studiofill', source='studiofill studio census venueUniformL1; arm = studiofilllegacy', **N1)
            row(id='C2AD-n1-gated-inwindow', symptom='C2-FIX9 N1: the studio poke boot reads studioGated 1 (the ob:cinelight open set the gate)', quantity='census:contract:venueStudioGated', op='>=', target=1, pm=0, arm=False, table='predator_apex_9ft@studio', reads_from='studiofill', source='studiofill studio census venueStudioGated (RECORD)', **N1)
            row(id='C2AD-n1-uniform-gameplay', symptom='C2-FIX9 N1 the live control: the same set\'s GAMEPLAY boot reads the fill uniform > 0 (derived coefficients × gain 1) — the in-window zero is the gate, not an absent term', quantity='census:contract:venueUniformL1', op='>', target=0, pm=0, arm=False, table='predator_apex_9ft', reads_from='studiofill', source='studiofill base census venueUniformL1 (RECORD)', **N1)
            row(id='C2AD-n1-uniform-postwindow', symptom='C2-FIX9 N1 (b): after the revert the fill uniform is RESTORED (> 0 in the studiorevert boot, the same coefficients — check-studiofill judges the frame)', quantity='census:contract:venueUniformL1', op='>', target=0, pm=0, arm=False, table='predator_apex_9ft@studiorevert', reads_from='studiofill', source='studiofill studiorevert census venueUniformL1 (RECORD)', **N1)
            row(id='C2AD-n1-gated-postwindow', symptom='C2-FIX9 N1 (b): after the revert studioGated reads 0', quantity='census:contract:venueStudioGated', op='<=', target=0, pm=0, arm=False, table='predator_apex_9ft@studiorevert', reads_from='studiofill', source='studiofill studiorevert census venueStudioGated (RECORD)', **N1)
            # N2 (review r9 P3): the E1 rAF sampler stops on every terminal path — three forms, each armed by its ?venueSampler=legacy twin
            for fm, why in (('samplercancel', 'a pending apply cancelled from outside at 2 s (the no-term apply)'), ('samplerfail', 'the runtime capture throw (the null-capture exit)'), ('samplerhold', 'the GI-hold timeout (degradeOnHoldTimeout)')):
                N2 = dict(look='default', pose='cueball_level', provenance='DERIVED', table='predator_apex_9ft', reads_from=fm)
                row(id=f'C2AD-n2-{fm}-ticks', symptom=f'C2-FIX9 N2: {why} — rAF sampler ticks after the stop = 0 (the census reads seconds later); the ?venueSampler=legacy twin keeps ticking (arm)', quantity='census:contract:venueSamplerTicksSinceStop', op='<=', target=0, pm=0, arm=True, arm_from=f'{fm}legacy', arm_table='predator_apex_9ft', source=f'{fm} census venueSamplerTicksSinceStop; arm = {fm}legacy', **N2)
                row(id=f'C2AD-n2-{fm}-active', symptom=f'C2-FIX9 N2: {why} — the sampler handle is 0 after the terminal path; the legacy twin still holds one (arm)', quantity='census:contract:venueSamplerActive', op='<=', target=0, pm=0, arm=True, arm_from=f'{fm}legacy', arm_table='predator_apex_9ft', source=f'{fm} census venueSamplerActive; arm = {fm}legacy', **N2)
                row(id=f'C2AD-n2-{fm}-terminal', symptom=f'C2-FIX9 N2 RECORD: {fm} ended without a derived term (the terminal path ran)', quantity='census:contract:venueDerived', op='<=', target=0, pm=0, arm=False, source=f'{fm} census venueDerived (RECORD)', **N2)
            row(id='C2AD-n2-samplercancel-fired', symptom='C2-FIX9 N2 RECORD: the cancel plant fired while the apply was pending', quantity='census:contract:venueCancelPlantFired', op='>=', target=1, pm=0, arm=False, look='default', pose='cueball_level', provenance='DERIVED', table='predator_apex_9ft', reads_from='samplercancel', source='samplercancel census venueCancelPlantFired (RECORD)')
            # N3 (refuter law F1): the owed schedule survives a stall straddling its due — derived bounded r0 with two bakes; the wall-clock twin degrades "overran"
            N3 = dict(look='default', pose='cueball_level', provenance='DERIVED', table='predator_apex_9ft', reads_from='h3stallstraddle')
            row(id='C2AD-n3-stallstraddle-derived', symptom='C2-FIX9 N3: the convergence-free H3-1 boot with a 900 ms main-thread stall planted across the owed schedule\'s due DERIVES (the armed timer is pending, judged on the loop-available clock); the ?venueOwedClock=wall twin (6a076a6d rule) degrades "overran" (arm)', quantity='census:contract:venueDerived', op='>=', target=1, pm=0, arm=True, arm_from='h3stallstraddlewall', arm_table='predator_apex_9ft', source='h3stallstraddle census venueDerived; arm = h3stallstraddlewall', **N3)
            row(id='C2AD-n3-stallstraddle-unbounded', symptom='C2-FIX9 N3: the straddled boot is classed bounded (not unbounded); the wall twin reads unbounded (arm)', quantity='census:contract:venueH3Unbounded', op='<=', target=0, pm=0, arm=True, arm_from='h3stallstraddlewall', arm_table='predator_apex_9ft', source='h3stallstraddle census venueH3Unbounded; arm = h3stallstraddlewall', **N3)
            row(id='C2AD-n3-stallstraddle-bakes', symptom='C2-FIX9 N3: the owed bake FIRED after the stall (bakeCount 2); under the wall rule bake 2 never fires (1)', quantity='census:contract:venueBakeCount', op='>=', target=2, pm=0, arm=True, arm_from='h3stallstraddlewall', arm_table='predator_apex_9ft', source='h3stallstraddle census venueBakeCount; arm = h3stallstraddlewall', **N3)
            row(id='C2AD-n3-stallstraddle-planted', symptom='C2-FIX9 N3 RECORD: the stall plant ran (a synchronous busy loop across the owed due)', quantity='census:contract:venueStallPlantRan', op='>=', target=1, pm=0, arm=False, source='h3stallstraddle census venueStallPlantRan (RECORD)', **N3)
            for q in ('venueStallPlantStartedMs', 'venueStallPlantEndedMs', 'venueStallPlantDueMs', 'venueWaitedMs', 'venueStallMs', 'venueWaitedEffMs', 'venueH3BoundMs', 'venueH3BakeFrameMs', 'venueH3BakeCpuMs', 'venueBake1FrameMs'):
                row(id=f'C2AD-n3-stallstraddle-{q.lower()}', symptom=f'C2-FIX9 N3 / N5 RECORD: {q} on the straddled boot', quantity=f'census:contract:{q}', op='>=', target=0, pm=0, arm=False, source=f'h3stallstraddle census {q} (RECORD)', **N3)
            # N4 (refuter law F6): one word, one clock — the accept trace carries pastBudgetEff (judged) and pastBudgetWall (recorded); on the H3-1 crossing cell the effective flag is 1, on a shipped cell 0
            row(id='C2AD-n4-pastbudgeteff-crossing', symptom='C2-FIX9 N4: the accept trace of the crossing cell reads pastBudgetEff 1 (the gate\'s clock)', quantity='census:contract:venueAcceptPastBudgetEff', op='>=', target=1, pm=0, arm=True, arm_from='pendant', arm_table='predator_apex_9ft', look='default', pose='cueball_level', provenance='DERIVED', table='predator_apex_9ft', reads_from='h3bounded', source='h3bounded census venueAcceptPastBudgetEff (the H3-1 pair is re-captured under FIX9)')
            row(id='C2AD-n4-pastbudgetwall-crossing', symptom='C2-FIX9 N4 RECORD: the same accept\'s wall-clock flag', quantity='census:contract:venueAcceptPastBudgetWall', op='>=', target=0, pm=0, arm=False, look='default', pose='cueball_level', provenance='DERIVED', table='predator_apex_9ft', reads_from='h3bounded', source='h3bounded census venueAcceptPastBudgetWall (RECORD)')
            row(id='C2AD-n4-pastbudgeteff-shipped', symptom='C2-FIX9 N4: a shipped default boot accepts inside the budget on the effective clock (pastBudgetEff 0)', quantity='census:contract:venueAcceptPastBudgetEff', op='<=', target=0, pm=0, arm=True, arm_from='h3bounded', arm_table='predator_apex_9ft', look='default', pose='cueball_level', provenance='DERIVED', table='predator_apex_9ft', reads_from='ctrlb1', source='ctrlb1 census venueAcceptPastBudgetEff')
            # N6c (refuter law F5): the falsification clause armed INSIDE the gate at zero authored numbers — no SHIPPED-form cell degrades under H3 on this seal
            for cs, tb, lk in (('pendant', 'predator_apex_9ft', 'default'), ('lookswitch', 'predator_apex_9ft', 'default'), ('studiofill', 'predator_apex_9ft', 'default'), ('ctrlb1', 'predator_apex_9ft', 'default'), ('ctrlb1', 'predator_apex_9ft', 'sp'), ('ctrlb1', 'wpa_spec_9ft', 'default'), ('ctrlb1', 'wpa_spec_9ft', 'sp'), ('ctrlb2', 'predator_apex_9ft', 'default'), ('ctrlb2', 'predator_apex_9ft', 'sp'), ('ctrlb2', 'wpa_spec_9ft', 'default'), ('ctrlb2', 'wpa_spec_9ft', 'sp')):
                # wpa_spec_9ft carries no venue term (venueDerived 0, venueBudgetDegrade absent): the H3 budget cannot degrade a table without a term, so the row
                # is a DECLARED NO-READ there (named, not a pass, not deleted — the maintainer's doctrine on land31 attempt 1); the day the table gains a term the
                # quantity resolves and the row is judged like the predator rows
                # C2-FIX9 (maintainer condition after the land31 regate of record): the declaration also asserts the OTHER direction — noread_pin pins the
                # cause (venueDerived 0); the gate FAILS the row if the pin reads otherwise or cannot be read (a term arrives but the H3 record does not)
                NR = dict(noread_ok='wpa_spec_9ft carries no venue term — the H3 budget cannot degrade a table without a term; a declared NO-READ until the table gains one', noread_basis='census:contract:venueDerived', noread_pin={'census:contract:venueDerived': 0}) if tb == 'wpa_spec_9ft' else {}
                # C2-FIX10 (forward-expiry plan (b), maintainer-approved): every N6c row carries the slowbake plant as its STANDING negative control — the planted slow bake reads
                # venueBudgetDegrade 1 on predator default, so the `<= 0` row FAILS on the control (a real, different read); valid today for the seven predator rows and the day the
                # wpa four expire into judged rows. arm_look: the plant is captured in the default look only — the sp rows arm from it across looks.
                SB_ARM = dict(arm=True, arm_from='slowbake', arm_table='predator_apex_9ft', arm_look='default')
                row(id=f'C2AD-n6c-noshippeddegrade-{cs}-{tb}-{lk}', symptom=f'C2-FIX9 N6c: no SHIPPED-form boot degrades under H3 on this seal — {cs} {tb} {lk} reads venueBudgetDegrade 0 (the falsification clause of VENUE_GI_WINDOW_MS, armed inside the gate; a crossing here re-opens the value; arm = the planted slow bake, degrade 1)', quantity='census:contract:venueBudgetDegrade', op='<=', target=0, pm=0, **SB_ARM, look=lk, pose='cueball_level', provenance='DERIVED', table=tb, reads_from=cs, source=f'{cs} census venueBudgetDegrade — judged (the clause), not a plant', **NR)
            for cs in ('slowbake', 'h3unbounded', 'pendant', 'lookswitch', 'dbq0px', 'ctrlb1', 'h3bounded', 'h3boundedfix7'):
                for q in ('venueStallMs', 'venueWaitedEffMs', 'venueLongestFrameMs'):
                    row(id=f'C2AC-h3-{cs}-{q[5:].lower()}', symptom=f'C2-FIX8 H3 clock RECORD: {q} on {cs} (the settle budget counts elapsed − stall; the wall-clock wait is venueWaitedMs)', quantity=f'census:contract:{q}', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: both clocks side by side', source=f'{cs} census {q}', **dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from=cs, table='predator_apex_9ft'))
            for cs in ('ctrlb1', 'ctrlb2'):
                row(id=f'C2AC-h3-{cs}-derived', symptom=f'C2-FIX8 H3-1: the converged control boot {cs} on the new web derives (a red here on a CALM box = a finding against the declared budget, reported not tuned)', quantity='census:contract:venueDerived', op='>=', target=1, pm=0, arm=False, arm_note='unarmed: the control\'s own census (its arm is the ctrlstrict step)', source=f'{cs} census venueDerived', **dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from=cs, table='predator_apex_9ft'))
            for nm, q, rf in (('fix6-waited', 'venueWaitedMs', 'slowbakefix6'), ('fix6-derived', 'venueDerived', 'slowbakefix6'), ('fix6-degrade', 'venueBudgetDegrade', 'slowbakefix6'), ('fix6-queued', 'venueAcceptWhileQueued', 'slowbakefix6')):
                row(id=f'C2AB-slowbake-{nm}', symptom=f'C2-FIX7 H2-4 RECORD (the red plant\'s number): {q} on {rf} — the 7a522bd2 rule', quantity=f'census:contract:{q}', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source=f'{rf} census {q}', **dict(SB, reads_from=rf))
            row(id='C2Z-slowbake-stale-legacy', symptom='C2-FIX6 H2 RECORD (the red plant\'s number): the relative change of the room probe the queued bake produced against the probe the 5667a488 rule had accepted while that bake was queued — the stale probe, quantified', quantity='census:contract:venueStaleProbeRel', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the measured number', source='slowbakelegacy venue.applied.staleProbeRel (captured by fireRebake after the acceptance)', **dict(SB, reads_from='slowbakelegacy'))
            for nm, q, rf in (('accepts', 'venueAcceptTraceN', 'slowbake'), ('accepts-legacy', 'venueAcceptTraceN', 'slowbakelegacy'), ('queued-legacy', 'venueAcceptWhileQueued', 'slowbakelegacy'), ('waited', 'venueWaitedMs', 'slowbake'), ('waited-legacy', 'venueWaitedMs', 'slowbakelegacy'), ('bakes', 'venueBakeCount', 'slowbake'), ('bakes-legacy', 'venueBakeCount', 'slowbakelegacy')):
                row(id=f'C2Z-slowbake-{nm}', symptom=f'C2-FIX6 H RECORD: {q} on {rf}', quantity=f'census:contract:{q}', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source=f'{rf} census {q}', **dict(SB, reads_from=rf))
            # class I: the reconstructed lamp term carries the grid\'s own BRDF weight — energy conserved by construction. cupsplit = the seated ball across
            # the angular sweep (cup_rest + cup_sweep_1..9: elevations 88° → 50°, the mouth\'s own grazing limit — below ~50° the rim hides the ball; measured
            # 2026-09-12) under ?venueGridDebug=split on the linear HDR, fully-marked in-shaft fragments only; cupsplitfix5 = the 5667a488 form (the plant).
            # I1: no fragment adds energy (the per-fragment max of lamp + remainder × hemi − unsplit ≤ 0) — an inequality the plant also satisfies in the
            # observable range (the hemisphere attenuation removes 20–30 % first), so it is unarmed by construction; I3 (armed): the plant conserves LESS —
            # its excess sits nearer zero by the share it re-adds outside the attenuation (relset plant / weighted of the excess < 1, both negative), and
            # its reconstructed lamp term exceeds the weighted one by 1/(1 − max(totalScattering)) (relset > 1).
            for k in range(0, 10):
                pose = 'cup_rest' if k == 0 else f'cup_sweep_{k}'
                CS = dict(look='default', pose=pose, provenance='DERIVED', reads_from='cupsplit', table='predator_apex_9ft@cuprest')
                CS5 = dict(CS, reads_from='cupsplitfix5')
                row(id=f'C2Z-split-excess-{pose}', symptom=f'C2-FIX6 I1 ({pose}): over the seated ball\'s in-shaft fragments the per-fragment MAX of lamp + remainder × hemi − unsplit is ≤ 0 — no fragment gains energy from the split (the weighted form)', quantity='ball:1:debugsplit_excess_max', op='<=', target=0.0, pm=0.0,
                    arm=False, arm_note='unarmed by construction: the plant satisfies the same inequality in the observable range (the hemisphere attenuation removes 20–30 % before the re-add); the plant\'s added energy is the armed relset row', source='?venueGridDebug=split on the linear HDR: R = the lamp term, G = the remainder × hemi, B = the unsplit indirect diffuse (+1000 marker); fully marked pixels only', **CS)
                row(id=f'C2Z-split-added-{pose}', symptom=f'C2-FIX6 I3 ({pose}, armed): the 5667a488 form conserves LESS — its disc-mean excess sits nearer zero than the weighted form\'s (plant / weighted < 1, both negative): the share it re-adds outside the hemisphere attenuation', quantity='relset:cupsplit:ball:1:debugsplit_excess', op='<', target=1.0, pm=0.0,
                    arm=True, arm_from='cupsplit', arm_table='predator_apex_9ft@cuprest', source='debugsplit_excess plant / weighted (same drive, same register); arm = the weighted set over itself (exactly 1: the strict < fails)', **CS5)
                row(id=f'C2Z-split-lampratio-{pose}', symptom=f'C2-FIX6 I3 RECORD ({pose}): the plant\'s reconstructed lamp term over the weighted one = 1 / (1 − max(totalScattering)) at this register (the omitted factor, measured)', quantity='relset:cupsplit:ball:1:debuglamp_rep', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the measured factor', source='debuglamp_rep plant / weighted', **CS5)
                row(id=f'C2Z-split-excess-rel-{pose}', symptom=f'C2-FIX6 I1 RECORD ({pose}): the weighted form\'s disc-mean excess relative to the unsplit sum', quantity='ball:1:debugsplit_excess_rel', op='>=', target=-1.0, pm=0.0, arm=False, record=True, arm_note='RECORD', source='cupsplit debugsplit_excess_rel', **CS)
                row(id=f'C2Z-split-excess-fix5-{pose}', symptom=f'C2-FIX6 I3 RECORD ({pose}): the plant\'s disc-mean excess relative to the unsplit sum', quantity='ball:1:debugsplit_excess_rel', op='>=', target=-1.0, pm=0.0, arm=False, record=True, arm_note='RECORD', source='cupsplitfix5 debugsplit_excess_rel', **CS5)
                row(id=f'C2Z-split-px-{pose}', symptom=f'C2-FIX6 I1 RECORD ({pose}): fully marked in-shaft fragments read at this register (the observable population; 0 below the mouth\'s grazing limit)', quantity='ball:1:debug_px', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD', source='cupsplit debug_px', **CS)
            # I2: the F1 ratio under the weighted term — rep / live (both under the grid\'s own weight) and rep / the LTC form (why the F1 number moved)
            for lk in ('default', 'sp'):
                CW = dict(look=lk, pose='cup_rest', provenance='DERIVED', reads_from='cupwell', table='predator_apex_9ft@cuprest')
                row(id=f'C2Z-well-ratio-ltc-{lk}', symptom='C2-FIX6 I2 RECORD: the weighted replacement lamp term over the live LTC form (BRDF_Lambert alone) — below the like-with-like ratio by the (1 − max(totalScattering)) factor the grid path carries and the direct rail does not; this is why F1\'s 0.9956 / 0.9942 moved', quantity='ball:1:debuglamp_aux', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the LTC-form live term (B channel)', source='cupwell debuglamp_aux (B = D · BRDF_Lambert · spikeShadow)', **CW)
            # class J: the byte-true texture hash — the data-texture census by element type (J1); the plant is the judged step check-texhash (J2)
            for lk in ('default', 'sp'):
                for tb in ('predator_apex_9ft', 'wpa_spec_9ft', 'chinese8_pro_9ft', 'wpbsa_snooker_12ft'):
                    TJ = dict(look=lk, pose=None, provenance='DERIVED', reads_from='after', table=tb)
                    row(id=f'C2Z-texhash-missing-{tb}-{lk}', symptom='C2-FIX6 J1: every DATA texture of the identity dump carries the byte-true hash (none missing)', quantity='census:textures:hashBytesMissing', op='<=', target=0, pm=0, arm=False, arm_note='unarmed by construction: an instrument census of this tree\'s own dump (the plant is the judged step check-texhash, arm texhash:13)', source='reads textures block from identity.json', **TJ)
                    for q in ('data', 'halfFloat', 'float32', 'uint8', 'other'):
                        row(id=f'C2Z-texhash-{q}-{tb}-{lk}', symptom=f'C2-FIX6 J1 RECORD: data textures of element type {q} in the identity dump', quantity=f'census:textures:{q}', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the census count', source='reads textures block', **TJ)
            # ---- ORDER-LIGHT-C2-FIX3 class B (review r5 P2, main.js:741-742): a public rebake INSIDE the 120 ms debounce after a close — one bake total.
            RC = dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from='rebakecancel', table='predator_apex_9ft@rebakecancel')
            RCA = dict(arm=True, arm_from='rebakecancellegacy', arm_table='predator_apex_9ft@rebakecancel')
            row(id='C2X-rebake-cancel-bakes', symptom='C2-FIX3 B1: a request inside the window, the close (debounce armed), a public rebake at +50 ms → exactly ONE bake through window.__rebakeEnv by 300 ms', quantity='census:contract:rebakeSeamBakes', op='band', target=1, pm=0,
                source='window.__rebakeEnv.bakes across the rebakecancel poke (read 750 ms after the close); arm = ?venueRebakeCancel=legacy (2: the direct bake cleared the handle but not the timer, the debounce baked again at 120 ms)', **RCA, **RC)
            row(id='C2X-rebake-cancel-pending', symptom='C2-FIX3 B1 RECORD: nothing is left pending after the direct bake', quantity='census:contract:rebakeSeamPending', op='<=', target=0, pm=0, arm=False, record=True,
                arm_note='RECORD: both rules clear the flag at the direct bake (the legacy defect is the extra bake, not the flag)', source='window.__rebakeEnv.pending after the poke', **RC)
            row(id='C2X-rebake-cancel-delay', symptom='C2-FIX3 B1 RECORD: ms from the close to the LAST bake (fixed ≈ 50: the direct call; legacy ≈ 120: the debounce that should have been cancelled)', quantity='census:contract:rebakeSeamDelayMs', op='>=', target=0, pm=0, arm=False, record=True,
                arm_note='RECORD: the measured number', source='window.__rebakeEnv.lastBakeAt − the close', **RC)
            # ---- ORDER-LIGHT-C2-FIX1 A(ii) (land16 attempt 5 — the FULL capture, capture-studiofail): the resume OWES the post-resume bake. Under FIX1's
            # paused park budget the studiofail boot parked the look-change capture and, with nothing queued after the failed apply, waited forever for a
            # bake fired after the resume (venue pending, queued false — the capture exhausted every attempt; pre-FIX1 and ?venueParkBudget=legacy both
            # settle: output/lighting/l31-studiofail-repro). The resumed attempt now queues that bake itself. Arm = the same boot under the legacy park
            # budget (no resumeAwaitingBake: both counters read 0). The generic invariant (capture not pending at ANY dump) is judged over every sealed set
            # by lighting-check-settled.py (arm: settledpending); the RECORD rows below carry the studiofail dump's own reading and its bound.
            SFL = dict(arm=True, arm_from='studiofaillegacypark', arm_table='predator_apex_9ft@studiofail')
            row(id='C2F-studiofail-resumebake', symptom='C2-FIX1 A(ii): the first capture after the failed-apply window followed a bake fired after the resume (resumeCaptureAfterBake ≥ 1)', quantity='census:contract:venueResumeCaptureAfterBake', op='>=', target=1, pm=0,
                source='state().venue.resumeCaptureAfterBake; arm = ?venueParkBudget=legacy (0)', **SFL, **SW)
            row(id='C2F-studiofail-resumebakeowed', symptom='C2-FIX1 A(ii): that bake was the one the RESUME queued — nothing else did (resumeBakeOwed ≥ 1)', quantity='census:contract:venueResumeBakeOwed', op='>=', target=1, pm=0,
                source='state().venue.resumeBakeOwed; arm = ?venueParkBudget=legacy (0)', **SFL, **SW)
            row(id='C2F-studiofail-settled', symptom='C2-FIX1 A(ii) RECORD: the venue capture is not pending at the studiofail dump after the revert (the user-reachable failure; judged over every set by check-settled)', quantity='census:contract:venueCapturePending', op='<=', target=0, pm=0,
                arm=False, record=True, arm_note='RECORD: the measured number (0 = settled)', source='state().venue.capturePending post-revert', **SW)
            row(id='C2F-studiofail-budgetms', symptom='C2-FIX1 A(ii) RECORD: the settle budget the invariant is bounded by (the app\'s own, main.js VENUE_GI_WINDOW_MS)', quantity='census:contract:venueBudgetMs', op='>=', target=0, pm=0,
                arm=False, record=True, arm_note='RECORD: the measured number', source='state().venue.budgetMs', **SW)
            # ---- ORDER-LIGHT-C2-FIX1 (review r3 on df17fb67 = 3 P2) -------------------------------------------------------------------
            # class A: the venue capture / re-bake queues never run inside the studio window (lightingvisuals.js). The studioqueue set's
            # poke: H0 / S0 → a reapply queued behind a held debounce → the rig installed inside the pending window → release + flush inside
            # the window → revert → the queues settle → H1 / S1. Arm = the pre-FIX1 app (prefix12-df17fb67) through the same poke.
            SQ = dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from='studioqueue', table='predator_apex_9ft@studioqueue')
            SQA = dict(arm=True, arm_from='studioqueuepre', arm_table='predator_apex_9ft@studioqueue')
            row(id='C2F-queue-bakedinwindow', symptom='C2-FIX1 A: no env re-bake fired inside the studio window (the gameplay cubemap hash mid-window == the plain reapply\'s, taken before the install)', quantity='census:contract:sqBakedInWindow', op='<=', target=0, pm=0,
                source='six-face hash of __dbg.cubeRT mid-window vs before; arm = the pre-FIX1 leaf (its flushed bake photographs the studio world → 1)', **SQA, **SQ)
            row(id='C2F-queue-capturesinwindow', symptom='C2-FIX1 A: no venue capture ran inside the window (venue.captures unchanged from the install to the revert)', quantity='census:contract:sqCapturesInWindow', op='<=', target=0, pm=0,
                source='state().venue.captures mid-window − before; arm = the pre-FIX1 leaf captures under the rig (≥ 1)', **SQA, **SQ)
            row(id='C2F-queue-cubewithintol', symptom='C2-FIX1 A: after the revert and the deferred bake the gameplay cubemap equals the plain reapply\'s within the capture\'s own convergence tolerance (max relative Δ of the six face means ≤ VENUE_CONVERGE_REL — the law the venue converges the cube by)', quantity='census:contract:sqCubeWithinTol', op='>=', target=1, pm=0,
                source='face means after the queues settled vs the plain reapply; arm = the pre-FIX1 leaf (the studio bake stays in the shared cube after revert: Δ ≈ 0.46 → 0)', **SQA, **SQ)
            for k, sym in (('sqCubeSame', 'six-face hash identical plain → windowed (1 / 0; two bakes of one world need not be bit-identical — the face means are the law)'), ('sqCubeMaxAbs', 'max |Δ texel| (linear) plain → windowed'), ('sqCubeFracOver1e4', 'fraction of texels differing by more than 1e-4'), ('sqMidMaxAbs', 'max |Δ texel| plain → mid-window (a bake inside the window would show here)')):
                row(id=f'C2F-queue-{k}', symptom=f'C2-FIX1 A RECORD: {sym}', quantity=f'census:contract:{k}', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source='the studioqueue poke', **SQ)
            row(id='C2F-queue-shwithintol', symptom='C2-FIX1 A: venue.sh after the resumed capture equals the plain reapply\'s probe within the capture\'s own convergence tolerance (relative L2 ≤ VENUE_CONVERGE_REL, read from state)', quantity='census:contract:sqShWithinTol', op='>=', target=1, pm=0,
                source='max relative |ΔSH| ≤ state().venue.convergeRel; arm = the pre-FIX1 leaf (a studio-darkened probe → 0)', **SQA, **SQ)
            row(id='C2F-queue-rigwindow-mid', symptom='C2-FIX1 A witness: the leaf saw the window (state rigWindow 1 mid-export)', quantity='census:contract:sqRigWindowMid', op='>=', target=1, pm=0,
                source='state().venue.rigWindow mid-window; arm = the pre-FIX1 leaf has no such state (0)', **SQA, **SQ)
            row(id='C2F-queue-deferred-mid', symptom='C2-FIX1 A witness: the flushed re-bake was DEFERRED, not fired (state rebakeDeferred 1 mid-export)', quantity='census:contract:sqDeferredMid', op='>=', target=1, pm=0,
                source='state().venue.rebakeDeferred mid-window; arm = the pre-FIX1 leaf (0)', **SQA, **SQ)
            for k, sym in (('sqShL2Rel', 'relative L2 |ΔSH| plain reapply → windowed reapply'), ('sqShDcRel', 'max |ΔSH coefficient| over the DC magnitude, plain → windowed'), ('sqMeanMaxRel', 'max relative |Δ face mean| of the gameplay cube, plain → windowed'), ('sqRefShL2Rel', 'relative L2 |ΔSH| BOOT → plain reapply (a re-derivation\'s own distance from the boot state)'), ('sqRefMeanMaxRel', 'max relative |Δ face mean| BOOT → plain reapply'), ('sqRefSameAsBoot', 'the plain reapply\'s cube hash == the boot cube (1 / 0)'), ('sqCubeSameVsBoot', 'the windowed reapply\'s cube hash == the boot cube (1 / 0)'), ('sqCapturesRef', 'captures the plain reapply took'), ('sqParkedMid', 'capture attempts parked during the window'), ('sqCapturesAfter', 'captures from the install to the settled end'), ('sqTol', 'the capture\'s convergence tolerance the SH row is judged at (state)')):
                row(id=f'C2F-queue-{k}', symptom=f'C2-FIX1 A RECORD: {sym}', quantity=f'census:contract:{k}', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source='the studioqueue poke', **SQ)
            row(id='C2F-queue-pre-bakedinwindow', symptom='C2-FIX1 A RECORD: the PRE-FIX1 leaf under the same poke — a bake fired inside the window', quantity='census:contract:sqBakedInWindow', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the finding', source='studioqueuepre', look='default', pose='cueball_level', provenance='DERIVED', reads_from='studioqueuepre', table='predator_apex_9ft@studioqueue')
            row(id='C2F-queue-pre-cubewithintol', symptom='C2-FIX1 A RECORD: the PRE-FIX1 leaf — the gameplay cube after revert within tolerance of the plain reapply (0 = contaminated)', quantity='census:contract:sqCubeWithinTol', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the finding', source='studioqueuepre', look='default', pose='cueball_level', provenance='DERIVED', reads_from='studioqueuepre', table='predator_apex_9ft@studioqueue')
            row(id='C2F-queue-pre-shl2rel', symptom='C2-FIX1 A RECORD: the PRE-FIX1 leaf — relative L2 |ΔSH| plain → windowed (the contaminated probe)', quantity='census:contract:sqShL2Rel', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the finding', source='studioqueuepre', look='default', pose='cueball_level', provenance='DERIVED', reads_from='studioqueuepre', table='predator_apex_9ft@studioqueue')
            # (refuter P2) the LONG window (16.5 s > VENUE_GI_WINDOW_MS): the park pauses the settle budget and the first post-resume capture follows a
            # post-resume bake. Arm = the same window under ?venueParkBudget=legacy (the budget counts through the park: the resumed capture skips its
            # wait and reads the stale cube — capturesInWindow 0 there too, so the discriminators are resumeCaptureAfterBake and the cube / SH rows).
            LQ = dict(look='default', pose='cueball_level', provenance='DERIVED', reads_from='studioqueuelong', table='predator_apex_9ft@studioqueue')
            LQA = dict(arm=True, arm_from='studioqueuelonglegacy', arm_table='predator_apex_9ft@studioqueue')
            row(id='C2F-queuelong-resumeafterbake', symptom='C2-FIX1 A (long window): the first capture after a 16.5 s window followed a bake fired after the resume (resumeCaptureAfterBake ≥ 1)', quantity='census:contract:sqResumeCaptureAfterBake', op='>=', target=1, pm=0,
                source='state().venue.resumeCaptureAfterBake; arm = ?venueParkBudget=legacy (the pre-fix budget: 0)', **LQA, **LQ)
            # (smoke) under the legacy budget the early capture still read a matching probe — the FIX1 leaf had DEFERRED every bake, so the 'stale'
            # cube was the plain reapply's own; the legacy budget discriminates on resumeCaptureAfterBake alone, and the cube / SH rows of the long
            # window arm from the PRE-FIX1 app (its shared cube and probe are contaminated by the in-window bake and captures)
            PQA = dict(arm=True, arm_from='studioqueuepre', arm_table='predator_apex_9ft@studioqueue')
            row(id='C2F-queuelong-cubewithintol', symptom='C2-FIX1 A (long window): after the revert the gameplay cubemap equals the plain reapply\'s within VENUE_CONVERGE_REL', quantity='census:contract:sqCubeWithinTol', op='>=', target=1, pm=0,
                source='face means; arm = the pre-FIX1 app (the in-window bake stays in the shared cube after revert → 0); the legacy-budget twin reads the same cube because the FIX1 leaf had deferred every bake (recorded below)', **PQA, **LQ)
            row(id='C2F-queuelong-shwithintol', symptom='C2-FIX1 A (long window): venue.sh after the resumed capture equals the plain reapply\'s within VENUE_CONVERGE_REL', quantity='census:contract:sqShWithinTol', op='>=', target=1, pm=0,
                source='relative L2 |ΔSH|; arm = the pre-FIX1 app (a studio-darkened probe → 0)', **PQA, **LQ)
            row(id='C2F-queuelong-capturesinwindow', symptom='C2-FIX1 A (long window): no capture inside the 16.5 s window', quantity='census:contract:sqCapturesInWindow', op='<=', target=0, pm=0,
                arm=False, arm_note='declared weak arm: both budgets park inside the window (the pre-FIX1 leaf is the arm of the short-window row)', source='state().venue.captures mid-window − before', **LQ)
            for k, sym in (('sqParkedMs', 'ms the capture spent parked (≈ the window)'), ('sqWindowMs', 'the window the poke held (ms)'), ('sqShL2Rel', 'relative L2 |ΔSH| plain → windowed'), ('sqMeanMaxRel', 'max relative |Δ face mean| plain → windowed')):
                row(id=f'C2F-queuelong-{k}', symptom=f'C2-FIX1 A (long window) RECORD: {sym}', quantity=f'census:contract:{k}', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD', source='the studioqueue poke, 16.5 s window', **LQ)
            for k, sym in (('sqResumeCaptureAfterBake', 'the LEGACY budget: captures after a post-resume bake (0 = it captured against the stale cube)'), ('sqShL2Rel', 'the LEGACY budget: relative L2 |ΔSH| plain → windowed'), ('sqMeanMaxRel', 'the LEGACY budget: max relative |Δ face mean|')):
                row(id=f'C2F-queuelong-legacy-{k}', symptom=f'C2-FIX1 A (long window) RECORD: {sym}', quantity=f'census:contract:{k}', op='>=', target=0, pm=0, arm=False, record=True, **({'noread_ok': 'the legacy park budget runs the settle clock through the 16.5 s window; on a calm box the boot is past the budget at the close and ruling (B) degrades it: the close re-schedules the deferred bake (the owed schedule), cinelight revert’s light restores coalesce the 120 ms debounce into a NEW schedule before it fires, and the seq-identity test degrades — a DECLARED DIVERGENCE from ruling (B)’s words (a re-arm AFTER the owed bake landed); no SH exists after a degrade, so this row is a declared NO-READ, judged whenever the boot derives. The emitted why below is WRONG on this boot: the owed bake never landed (bakeCount 1); it was re-timed by <= 120 ms per coalescing rig write', 'noread_basis': 'census:contract:venueError,census:contract:venueH3Why,census:contract:venueBakeCount', 'noread_pinned_by': ['C2F-queuelong-legacy-asserts-degrade', 'C2F-queuelong-legacy-asserts-unbounded', 'C2F-queuelong-legacy-asserts-bakes-one']} if k == 'sqShL2Rel' else {}), arm_note='RECORD: the pre-fix rule\'s numbers', source='studioqueuelonglegacy (?venueParkBudget=legacy)', look='default', pose='cueball_level', provenance='DERIVED', reads_from='studioqueuelonglegacy', table='predator_apex_9ft@studioqueue')
            # (the legacy sqShL2Rel declaration above names these three rows as its reverse pin — noread_pinned_by — rather than carrying a pin of its own:
            # the maintainer's ruling after the land31 regate of record, "covered by a different mechanism, named")
            # C2-FIX9 condition 2 (maintainer): the declaration is FALSIFIABLE in the other direction — JUDGED rows pin the legacy family's degrade (class unbounded,
            # bakeCount exactly 1); a future round that fixes the coalesced re-arm, or a box that pushes the boot back inside the effective budget, fails them and
            # forces the declared NO-READ to be revisited. Arm = the shipped paused twin (studioqueuelong: derived, within-budget, bakes 2 — every row fails there).
            AS = dict(look='default', pose='cueball_level', provenance='DERIVED', table='predator_apex_9ft@studioqueue', reads_from='studioqueuelonglegacy', arm=True, arm_from='studioqueuelong', arm_table='predator_apex_9ft@studioqueue')
            row(id='C2F-queuelong-legacy-asserts-degrade', symptom='C2-FIX9 condition 2: the LEGACY park-budget boot DEGRADES under (B) on this seal (venueBudgetDegrade 1) — the pin that keeps the declared NO-READ honest; the paused twin derives (arm 0)', quantity='census:contract:venueBudgetDegrade', op='>=', target=1, pm=0, source='studioqueuelonglegacy studioqueue census; arm = studioqueuelong (0)', **AS)
            row(id='C2F-queuelong-legacy-asserts-unbounded', symptom='C2-FIX9 condition 2: the legacy boot is classed UNBOUNDED (the coalesced re-arm read as a post-landing re-arm — the declared divergence); a shipped within-budget boot reads 0 (arm = pendant, fresh each seal — the paused twin is a FIX6-era reused capture whose census predates the H3 fields)', quantity='census:contract:venueH3Unbounded', op='>=', target=1, pm=0, source='studioqueuelonglegacy studioqueue census; arm = pendant base boot (0)', **{**AS, 'arm_from': 'pendant', 'arm_table': 'predator_apex_9ft'})
            row(id='C2F-queuelong-legacy-asserts-bakes-one', symptom='C2-FIX9 condition 2: the legacy boot fired exactly ONE bake — the owed bake never landed (bakeCount 1); the paused twin fires 2 (arm)', quantity='census:contract:venueBakeCount', op='band', target=1, pm=0, source='studioqueuelonglegacy studioqueue census; arm = studioqueuelong (2)', **AS)
            # C2-FIX9 (land31 regate of record): the legacy twin's OUTCOME is on the record — the pre-fix rule's fate under (B) on a calm box (degraded r1) beside the shipped
            # paused rule's (derived at ≈ 1.3 s); RECORD rows, read from the studioqueue sub-run census of the legacy set
            for k, sym in (('venueBudgetDegrade', 'the LEGACY budget boot degraded under (B) (1) or derived (0)'), ('venueH3Unbounded', 'the LEGACY budget boot classed unbounded (1) — the coalesced re-arm of its owed schedule'), ('venueH3Rounds', 'the LEGACY budget boot: rounds past the owed schedule'), ('venueWaitedMs', 'the LEGACY budget boot: wall wait to its verdict'), ('venueWaitedEffMs', 'the LEGACY budget boot: loop-available wait'), ('venueBakeCount', 'the LEGACY budget boot: bakes that fired (1 = the owed bake never fired)')):
                row(id=f'C2F-queuelong-legacy-outcome-{k.lower()}', symptom=f'C2-FIX9 RECORD: {sym}', quantity=f'census:contract:{k}', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the pre-fix rule\'s outcome', source='studioqueuelonglegacy studioqueue census (fresh every seal by N8)', **{**LQ, 'reads_from': 'studioqueuelonglegacy'})
            # ORDER-LIGHT-C2-FIX10 class B (review r10 P2, the product finding): the venue capture hides balls by their material marker, not by height. ballift = the
            # plain default boot with ONE ball lifted 0.4 m (above the retired 0.25 m filter) for the capture; balliftlegacy = the same under the pre-FIX10 height
            # rule (the arm). The judged statistic is the app's own convergence tolerance VENUE_CONVERGE_REL = 1e-4 (lightingvisuals.js:1088 — the same constant
            # the in-page sqShWithinTol rows judge against), not a number of this round's.
            BL = dict(look='default', pose='cueball_level', provenance='DERIVED', table='predator_apex_9ft', reads_from='ballift', arm=True, arm_from='balliftlegacy', arm_table='predator_apex_9ft')
            row(id='C2AE-b-ballift-shrel', symptom='C2-FIX10 class B: a ball lifted 0.4 m above the table does NOT enter the room-only probe — the lifted boot\'s venue SH equals the plain boot\'s within VENUE_CONVERGE_REL (relative L2); under the pre-FIX10 height rule the airborne ball is captured and the SH moves (arm)', quantity='census:contractPairs:shL2RelAB', op='<=', target=1e-4, pm=0, source='lighting-contract-pairs.py shL2RelAB (ballift vs ctrlb2, the strict plain control of the same web and cell: both boots at the convergence fixed point, where strict boots are SH-identical to 6 dp; against the shipped-law base boot the pair measured that boot\'s own drift, 2.5e-3 on land38, not the lift). REACH: this row no longer exercises the shipped convergence law at all — the shipped law\'s accepted-point spread (step-based acceptance, GH-819) is covered by that issue, not here; tolerance = VENUE_CONVERGE_REL 1e-4, the app\'s convergence constant', **BL)
            row(id='C2AE-b-ballift-hiddenabove', symptom='C2-FIX10 class B: the marker rule hid the lifted ball (hiddenBallsAbove >= 1); the height rule hides none above 0.25 m (arm 0)', quantity='census:contract:venueHiddenBallsAbove', op='>=', target=1, pm=0, source='census venueHiddenBallsAbove on the ballift boot; arm = balliftlegacy', **BL)
            row(id='C2AE-b-ballift-lifted', symptom='C2-FIX10 class B: the plant lifted one ball by 0.4 m for the capture (ballLiftApplied 0.4); the plain boot lifted none (arm 0)', quantity='census:contract:venueBallLiftApplied', op='band', target=0.4, pm=0, source='census venueBallLiftApplied; arm = the plain default set (after)', **{**BL, 'arm_from': 'after'})
            row(id='C2AE-b-ballift-hidden', symptom='C2-FIX10 class B RECORD: balls hidden by the marker rule on the lifted boot', quantity='census:contract:venueHiddenBalls', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the census count', source='census venueHiddenBalls', **{k: v for k, v in BL.items() if k not in ('arm', 'arm_from', 'arm_table')})
            row(id='C2AE-b-balliftlegacy-shrel', symptom='C2-FIX10 class B RECORD: the height rule\'s SH departure with the lifted ball in the probe (relative L2 vs the plain boot)', quantity='census:contractPairs:shL2RelAB', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured departure', source='lighting-contract-pairs.py shL2RelAB (balliftlegacy vs ctrlb2, the strict plain control; REACH: the shipped convergence law is not exercised here — GH-819 covers its accepted-point spread)', **{**{k: v for k, v in BL.items() if k not in ('arm', 'arm_from', 'arm_table')}, 'reads_from': 'balliftlegacy'})
            # class C: the occlusion LUT's far domain — the committed generator output judged against its own exact integral (fixture rows;
            # the seal's occlut-check step is the judged gate and occlutpre the arm: the pre-FIX1 LUT fails the same check at h/r 10)
            OC = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft')
            row(id='C2F-occ-shader-tail', symptom='C2-FIX1 C (refuter): the far tail is COMPILED into the ball programs (the compiled fragment GLSL carries `float spikeOccCE = 8.0 - spikeWn.y` and the (c₈/c)² factor) — the runtime witness of the tail', quantity='programs:ball:occTail', op='>=', target=1, pm=0,
                arm=True, arm_from='studioqueuepre', arm_table='predator_apex_9ft@studioqueue', source='programs census of the ball class (GL shader sources); arm = the pre-FIX1 app (prefix12-df17fb67: no tail text → 0)', look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft@studioqueue', reads_from='studioqueue')
            row(id='C2F-occ-within', symptom='C2-FIX1 C: the shader read (table to h/r 8 + the 1/c² tail) stays within the table\'s own interpolation error at h/r 2 / 4 / 8 / 10 / 16 / 32 × n_y −1 / −0.5 / 0', quantity='fixture:occlusion-far:within', op='>=', target=1, pm=0,
                arm=False, arm_note='declared weak arm: the seal arm occlutpre judges the pre-FIX1 LUT by the same check (exit 4 at h/r 10)', source='tools/render/fixtures/lighting-occlusion-far.json within (the generator)', **OC)
            for k, sym in (('maxErr', 'max |shader read − exact| over the far nodes'), ('interpMaxErr', 'the table\'s own max interpolation error along the resting manifold near the contact'), ('err_ny_m1_eta10', 'the error at n_y −1, h/r 10 (the order\'s node: the pre-FIX1 read was −0.0566)')):
                row(id=f'C2F-occ-{k}', symptom=f'C2-FIX1 C RECORD: {sym}', quantity=f'fixture:occlusion-far:{k}', op='>=', target=-1, pm=0, arm=False, record=True, arm_note='RECORD: the generator\'s number', source='lighting-occlusion-far.json', **OC)
            # ---- ORDER-LIGHT-C2-FIX1 §L31: the occlusion-trace flush (the aOccl race) ------------------------------------------
            # table.js attaches the snooker pocket-furniture transport attribute aOccl asynchronously (the _snkOcclPending drain, budgeted idle
            # slices) and debounces one corrective env re-bake: an identity dump taken before the drain finishes photographs whichever traces had
            # landed (144 vs 154 aOccl meshes across two sealed runs of ONE tree — the land15 attempt-2 finding). The capture now drains the queue
            # through the app's own render-determinism seam window.__snkOccl.flush() before the settle and every dump, and records it. Arm = the
            # SAME capture with the flush withheld (OB_SETTLE_FLUSH=off, the flushoff set): the record reads 0 there.
            FL = dict(look='default', pose='cueball_level', provenance='DERIVED', table='wpbsa_snooker_12ft')
            row(id='L31-flush-flushed', symptom='§L31: the dump was taken after the app\'s pending occlusion traces were flushed (settle.flush.mode = flushed)', quantity='census:contract:settleFlushed', op='>=', target=1, pm=0,
                arm=True, arm_from='flushoff', source='lighting-capture.mjs flushTraces() through window.__snkOccl.flush(); arm = the same capture under OB_SETTLE_FLUSH=off (0)', **FL)
            row(id='L31-flush-seam', symptom='§L31: the app publishes the render-determinism seam the flush drains through (window.__snkOccl.flush)', quantity='census:contract:settleFlushSeam', op='>=', target=1, pm=0,
                arm=True, arm_from='flushoff', arm_note='WITNESS row: 1 means THIS dump\'s flush found and drained the app\'s seam; the arm (OB_SETTLE_FLUSH=off) never probes it, so its record reads 0 — the seam itself is main\'s (table.js:8796), not the lane\'s', source='typeof window.__snkOccl.flush === "function"', **FL)
            for k, sym in (('settleFlushCount', 'flushes the capture ran for this dump (boot + one per poke)'), ('settleFlushAttrsDelta', 'geometry attributes the flush attached (the traces that were still pending)'),
                           ('settleFlushMs', 'ms the synchronous drain took'), ('settleFlushRebake', 'the corrective env re-bake the drain fired (1 / 0)')):
                row(id=f'L31-flush-{k}', symptom=f'§L31 RECORD: {sym}', quantity=f'census:contract:{k}', op='>=', target=0, pm=0, arm=False, record=True, arm_note='RECORD: the measured number', source='the flush record on the sealed dump', **FL)
            for cell in ('studio', 'studiodim50', 'studiodim25'):
                for band in ('equator', 'crown', 'under'):
                    row(id=f'C2-studio-Y-{band}-{cell}', symptom=f'C2 (a) RECORD: cue ball {band} band luminance Y (linear) in the {cell} cell', quantity=f'ball:0:{band}_Y', op='>=', target=0, pm=0,
                        arm=False, record=True, arm_note='RECORD: the luminance', table=f'predator_apex_9ft@{cell}', source='render-reads ray-cast bands on the HDR readback', **ST)
            # ---- ORDER-LIGHT-COMPANION refuter round: the #662-cached OWNER (2eab3fad's main.js: protocol 1, no budget) under THIS landing's leaves
            # (protocol 2) — the cache split the back-to-back merge can produce. Both sides refuse: the owner reads every participant stale (8 named
            # once the lighting leaf lands), the leaf reads main.js's protocol 1 ≠ 2 and no budget → legacy for ALL, never the zero-window hybrid
            M6 = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft', reads_from='mixold662main')
            row(id='MATRIX-old662main-legacy', symptom='COMPANION (refuter): the #662 owner (protocol 1) under protocol-2 leaves — the handshake reads NOT ok (protocolOk 0)', quantity='census:contract:protocolOk', op='<=', target=0, pm=0,
                arm=True, arm_from='after', source='2eab3fad main.js window.__venueProtocol.ok on the old662main tree; arm = the fresh tree (1 → RED)', **M6)
            row(id='MATRIX-old662main-allstale', symptom='COMPANION (refuter): every participant reads stale to the protocol-1 owner (protocolStaleCount 8 once the lighting leaf lands)', quantity='census:contract:protocolStaleCount', op='>=', target=8, pm=0,
                arm=True, arm_from='after', source='window.__venueProtocol.stale.length; arm = the fresh tree (0 → RED)', **M6)
            row(id='MATRIX-old662main-leafrefuses', symptom='COMPANION (refuter): the protocol-2 leaf refuses the protocol-1 owner on its own side (state().venue.protocol.ok 0: protocol 1 ≠ 2, no budget handed over)', quantity='census:contract:venueProtocolOk', op='<=', target=0, pm=0,
                arm=True, arm_from='after', source='lightingvisuals state().venue.protocol.ok; arm = the fresh tree (1 → RED)', **M6)
            row(id='MATRIX-old662main-dressing', symptom='COMPANION (refuter): the #662 owner under new leaves → the LEGACY dressing', quantity='census:contract:dressingClass', op='<=', target=0, pm=0,
                arm=True, arm_from='after', source='census dressing.mode; arm = the fresh tree (class → RED)', **M6)
            row(id='MATRIX-old662main-gain', symptom='COMPANION (refuter): the #662 owner under new leaves → main\'s grid gain (uGiIrr 2.0)', quantity='census:contract:giIrr', op='>=', target=2.0, pm=0,
                arm=True, arm_from='after', source='census contract.giIrr; arm = the fresh tree (1.0 → RED)', **M6)
            row(id='MATRIX-old662main-occ', symptom='COMPANION (refuter): the #662 owner under new leaves → no ball program samples the LUT', quantity='census:occLut:boundBallPrograms', op='<=', target=0, pm=0,
                arm=True, arm_from='after', source='census occLut.boundBallPrograms; arm = the fresh tree (10 → RED)', **M6)
            row(id='MATRIX-old662main-probe', symptom='COMPANION (refuter): the #662 owner under new leaves → the table-owned probe stays visible (main\'s rig)', quantity='census:contract:legacyProbeVisible', op='>=', target=1, pm=0,
                arm=True, arm_from='after', source='census contract.legacyProbeVisible; arm = the fresh tree (suppressed → 0 → RED)', **M6)
            row(id='MATRIX-old662main-venueoff', symptom='COMPANION (refuter): the leaf\'s venue switch reads OFF under the #662 owner (venue.on 0)', quantity='census:contract:venueOn', op='<=', target=0, pm=0,
                arm=True, arm_from='after', source='lightingvisuals state().venue.on; arm = the fresh tree (1 → RED)', **M6)
            row(id='MATRIX-old662main-noderive', symptom='COMPANION (refuter): no venue fill is derived under the #662 owner (never the zero-window hybrid)', quantity='census:contract:venueDerived', op='<=', target=0, pm=0,
                arm=True, arm_from='after', source='census contract.venueDerived; arm = the fresh tree (1 → RED)', **M6)
            # ---- ORDER-LIGHT-FIX6 (review r10 P2): the MATRIX rows — on every one-stale-leaf tree the owner's handshake reads NOT ok, the census
            # NAMES the stale leaf, and every venue mechanism is on its legacy setting at once: legacy dressing, main's grid gain (2.0), main's
            # ball programs (no LUT), the table-owned probe visible, no venue fill derived, the venue flag off. Arm = the fresh tree (`after`),
            # where every one of these reads the venue value → RED. (The frame identity is the offcheck-mix*-onoff step: ON conv == off conv.)
            for mx, leaf in (('oldgi', 'gi'), ('oldshading', 'shading'), ('oldroom', 'room'), ('oldlook', 'look'), ('oldlv', 'lightingvisuals'), ('nolut', 'occlusionlut'), ('noflag', 'venueflag'), ('oldballset', 'ballset')):
                MT = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft', reads_from=f'mix{mx}')
                row(id=f'MATRIX-{mx}-legacy', symptom=f'FIX6: with ONLY {leaf} stale the owner\'s VENUE_PROTOCOL handshake reads NOT ok (protocolOk 0)', quantity='census:contract:protocolOk', op='<=', target=0, pm=0,
                    arm=True, arm_from='after', source='main.js window.__venueProtocol.ok on the matrix tree; arm = the fresh tree (1 → RED)', **MT)
                row(id=f'MATRIX-{mx}-named', symptom=f'FIX6: the census NAMES the stale leaf ({leaf}) — protoStale_{leaf} = 1', quantity=f'census:contract:protoStale_{leaf}', op='>=', target=1, pm=0,
                    arm=True, arm_from='after', source=f'window.__venueProtocol.stale includes "{leaf}"; arm = the fresh tree (0 → RED)', **MT)
                row(id=f'MATRIX-{mx}-onlystale', symptom=f'FIX6: exactly ONE leaf is named stale on the {mx} tree (protocolStaleCount 1) — the matrix isolates one leaf per tree', quantity='census:contract:protocolStaleCount', op='band', target=1, pm=0,
                    arm=True, arm_from='after', source='window.__venueProtocol.stale.length; arm = the fresh tree (0 → RED)', **MT)
                row(id=f'MATRIX-{mx}-dressing', symptom=f'FIX6: {leaf} stale → the LEGACY dressing (never the class room under a mixed graph)', quantity='census:contract:dressingClass', op='<=', target=0, pm=0,
                    arm=True, arm_from='after', source='census dressing.mode (class = 1); arm = the fresh tree (class → RED)', **MT)
                row(id=f'MATRIX-{mx}-gain', symptom=f'FIX6: {leaf} stale → main\'s grid gain (uGiIrr 2.0) — gi.js and shading.js read the same absent switch', quantity='census:contract:giIrr', op='>=', target=2.0, pm=0,
                    arm=True, arm_from='after', source='census contract.giIrr; arm = the fresh tree (1.0 → RED)', **MT)
                row(id=f'MATRIX-{mx}-occ', symptom=f'FIX6: {leaf} stale → no ball program samples the LUT (main\'s ball programs)', quantity='census:occLut:boundBallPrograms', op='<=', target=0, pm=0,
                    arm=True, arm_from='after', source='census occLut.boundBallPrograms; arm = the fresh tree (10 → RED)', **MT)
                row(id=f'MATRIX-{mx}-probe', symptom=f'FIX6: {leaf} stale → the table-owned probe stays visible (main\'s rig, nothing suppressed)', quantity='census:contract:legacyProbeVisible', op='>=', target=1, pm=0,
                    arm=True, arm_from='after', source='census contract.legacyProbeVisible; arm = the fresh tree (suppressed → 0 → RED)', **MT)
                if mx != 'oldlv':  # main's lighting leaf publishes no venue state at all (venueDerived / venueOn read null there — no read, by design; its legacy rig is witnessed by -probe, -gain, -occ and the offcheck-mixoldlv-on / -onoff steps)
                    row(id=f'MATRIX-{mx}-fill', symptom=f'FIX6: {leaf} stale → no venue fill is derived', quantity='census:contract:venueDerived', op='<=', target=0, pm=0,
                        arm=True, arm_from='after', source='census contract.venueDerived; arm = the fresh tree (1 → RED)', **MT)
                    row(id=f'MATRIX-{mx}-venueon', symptom=f'FIX6: {leaf} stale → the lighting leaf itself reads venue OFF (protocol not passed / not carried)', quantity='census:contract:venueOn', op='<=', target=0, pm=0,
                        arm=True, arm_from='after', source='lightingvisuals state().venue.on; arm = the fresh tree (1 → RED)', **MT)
            row(id='MATRIX-fresh-ok', symptom='FIX6: the all-fresh tree passes the handshake (protocolOk 1, nothing named stale) and runs the venue path', quantity='census:contract:protocolOk', op='>=', target=1, pm=0,
                arm=True, arm_from='mixnoflag', source='window.__venueProtocol.ok on the fresh tree; arm = the noflag matrix tree (0 → RED)', look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft', reads_from='after')
            row(id='MATRIX-fresh-nostale', symptom='FIX6: the all-fresh tree names no stale leaf (protocolStaleCount 0)', quantity='census:contract:protocolStaleCount', op='<=', target=0, pm=0,
                arm=True, arm_from='mixnoflag', source='window.__venueProtocol.stale.length on the fresh tree; arm = the noflag matrix tree (1 → RED)', look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft', reads_from='after')
            # ---- ORDER-LIGHT-FIX7 (review r11 P2 #1, lightingvisuals.js:1680): an UNTOUCHED identity default (explicit canopy_panel @ 1) switched
            # green → SP re-derives the venue probe — regrade() no longer returns on !touched before applyVenue. The `lookflip` poke records the
            # probe (venue.sh) before / after __test.setLook('sp'); arm = the same boot under ?venueRegrade=touched (the pre-FIX7 rule: no capture,
            # identical probe → RED). The floor for "changed" is the settle law's own tolerance VENUE_CONVERGE_REL (1e-4 relative): a re-derived
            # probe under another look differs by far more than the law's noise floor (measured 1.21 relative on the canopy boot).
            LF = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft@lookflip', reads_from='lookswitch')
            row(id='FIX7-lookflip-rederived', symptom='FIX7 #1: the green → SP regrade on an UNTOUCHED canopy boot re-derives the venue probe (venue.captures moved)', quantity='census:contract:lookFlipCaptures', op='>=', target=1, pm=0,
                arm=True, arm_from='lookswitchprefix', arm_table='predator_apex_9ft@lookflip', source='captures after − before across the lookflip poke; arm = ?venueRegrade=touched (the pre-FIX7 rule: 0 → RED)', **LF)
            row(id='FIX7-lookflip-rel', symptom='FIX7 #1: the re-derived probe differs from the boot probe by more than the settle law\'s tolerance (max |Δ| / max |before| ≥ VENUE_CONVERGE_REL)', quantity='census:contract:lookFlipShRel', op='>=', target=1e-4, pm=0,
                arm=True, arm_from='lookswitchprefix', arm_table='predator_apex_9ft@lookflip', source='max|after−before| / max|before| over the 27 coefficients; arm = the pre-FIX7 rule (identical arrays: 0 → RED)', **LF)
            row(id='FIX7-lookflip-untouched', symptom='FIX7 #1: the boot under test WAS the untouched identity default (state.touched false before the switch) — the case review named', quantity='census:contract:lookFlipTouchedBefore', op='<=', target=0, pm=0,
                arm=False, arm_note='declared weak arm: the pre-fix set boots identically untouched (the same value); the discriminating rows are -rederived / -rel', source='lightingvisuals state().touched before __test.setLook', **LF)
            row(id='FIX7-lookflip-look', symptom='FIX7 #1: the look did change (default → sp) — the regrade reached the leaf', quantity='census:contract:lookFlipLookChanged', op='>=', target=1, pm=0,
                arm=False, arm_note='declared weak arm: the pre-fix rule also changes the look, it only skips the re-derivation', source='state().look after vs before', **LF)
            row(id='FIX7-lookflip-still-derived', symptom='FIX7 #1: the probe after the regrade is a DERIVED one (not degraded, not pending)', quantity='census:contract:venueDerived', op='>=', target=1, pm=0,
                arm=True, arm_from='gistall', arm_table='predator_apex_9ft', source='census contract.venueDerived on the lookflip run; arm = the stalled-GI boot (legacy probe: 0 → RED)', **LF)
            # ---- ORDER-LIGHT-FIX7 (review r11 P2 #2, lightingvisuals.js:1282): a GI request that STALLS without rejecting (?giStall=manifest) — the
            # venue hold is BOUNDED by FIX5's window (VENUE_GI_WINDOW_MS = 15000, the one constant): on expiry the venue path proceeds on the LEGACY
            # probe, readiness is released (venue.pending false), the census names gi-hold-timeout, and a WATCH re-derives when the apply lands.
            # Arm = the fresh boot (`after`: no timeout, probe suppressed, derived); the pre-FIX7 rule (?venueGiHold=forever) never settles at all
            # and is the seal arm `gistallforever` (a capture that must fail by never settling — no census can be read there).
            for lk in ('default', 'sp'):
                GS = dict(look=lk, pose=None, provenance='DERIVED', table='predator_apex_9ft', reads_from='gistall')
                row(id=f'FIX7-gistall-timeout-{lk}', symptom='FIX7 #2: the stalled GI request timed the hold out by name (gi-hold-timeout on the applied record)', quantity='census:contract:venueGiHoldTimeout', op='>=', target=1, pm=0,
                    arm=True, arm_from='after', source='venue.applied.giHoldTimeout under ?giStall=manifest; arm = the fresh boot (0 → RED)', **GS)
                row(id=f'FIX7-gistall-held-{lk}', symptom='FIX7 #2: the hold lasted the FIX5 budget (giHeldMs ≥ VENUE_GI_WINDOW_MS = 15000 ms) and no longer', quantity='census:contract:venueGiHoldTimeoutMs', op='>=', target=GI_WINDOW_MS, pm=0, derived_from=DERIVED_WINDOW,
                    arm=True, arm_from='after', source='venue.applied.giHeldMs at the timeout; arm = the fresh boot (0 → RED)', **GS)
                row(id=f'FIX7-gistall-bounded-{lk}', symptom='FIX7 #2 RECORD: the hold\'s measured length past the budget (poll granularity 250 ms + timer lag under load) — giHeldMs', quantity='census:contract:venueGiHoldTimeoutMs', op='>=', target=0, pm=0,
                    arm=False, record=True, arm_note='RECORD (the bound is the row above; this row keeps the measured ms on file)', source='venue.applied.giHeldMs', **GS)
                row(id=f'FIX7-gistall-ready-{lk}', symptom='FIX7 #2: readiness released — nothing pending on the venue (venueSettled() true, __test.ready true, the loading overlay gone)', quantity='census:contract:venuePending', op='<=', target=0, pm=0,
                    arm=False, arm_note='declared weak arm: the pre-FIX7 rule never settles at all (seal arm gistallforever proves it — the capture fails by name); every settled set reads 0 here', source='venue.pending', **GS)
                row(id=f'FIX7-gistall-probe-{lk}', symptom='FIX7 #2: the venue path proceeds on the LEGACY probe (table-owned probe visible, nothing suppressed)', quantity='census:contract:legacyProbeVisible', op='>=', target=1, pm=0,
                    arm=True, arm_from='after', source='census contract.legacyProbeVisible; arm = the fresh boot (suppressed → 0 → RED)', **GS)
                row(id=f'FIX7-gistall-noderive-{lk}', symptom='FIX7 #2: no venue fill was derived against the stalled GI (the legacy probe, not a half-lit one)', quantity='census:contract:venueDerived', op='<=', target=0, pm=0,
                    arm=True, arm_from='after', source='census contract.venueDerived; arm = the fresh boot (1 → RED)', **GS)
                # ORDER-LIGHT-COMPANION (review r12 P2, lightingvisuals.js:1213): the timeout DEGRADES through onDegrade — venue OFF for the table (probe,
                # dressing, shading together), never the 9.91 probe under the class room; FIX7's watch is superseded (a degraded boot stays legacy)
                row(id=f'FIX7-gistall-degraded-{lk}', symptom='COMPANION #b: the stalled-GI timeout took main.js\'s ONE degradeVenue (the same path as every other failure: legacy dressing, main\'s shading, the look re-applied, the cube converged)', quantity='census:contract:venueDegraded', op='>=', target=1, pm=0,
                    arm=True, arm_from='after', source='window.__venueDegrade present; arm = the fresh boot (0 → RED)', **GS)
                # refuter round: the hold-degrade record read from what SURVIVES the off apply (venue.giHoldTimedOut + window.__venueDegrade), not the erased applied flag
                row(id=f'FIX7-gistall-holddegraded-{lk}', symptom='COMPANION #b (refuter): the census reads the GI-hold degrade from the surviving records (giHoldTimedOut ∧ __venueDegrade) — 1 on the stalled boot', quantity='census:contract:venueGiHoldDegraded', op='>=', target=1, pm=0,
                    arm=True, arm_from='after', source='census contract.venueGiHoldDegraded; arm = the fresh boot (no hold record → 0 → RED)', **GS)
                row(id=f'FIX7-gistall-dressing-{lk}', symptom='COMPANION #b: the room is on the LEGACY dressing after the timeout (never class dressing beside the 9.91 probe)', quantity='census:contract:dressingClass', op='<=', target=0, pm=0,
                    arm=True, arm_from='after', source='census dressing.mode; arm = the fresh boot (class → RED)', **GS)
                row(id=f'FIX7-gistall-gain-{lk}', symptom='COMPANION #b: main\'s grid gain after the timeout (uGiIrr 2.0 — the venue shading off with the dressing)', quantity='census:contract:giIrr', op='>=', target=2.0, pm=0,
                    arm=True, arm_from='after', source='census contract.giIrr; arm = the fresh boot (1.0 → RED)', **GS)
                row(id=f'FIX7-gistall-venueoff-{lk}', symptom='COMPANION #b: the leaf\'s own venue switch is OFF after the degrade (venue.on false)', quantity='census:contract:venueOn', op='<=', target=0, pm=0,
                    arm=True, arm_from='after', source='lightingvisuals state().venue.on; arm = the fresh boot (1 → RED)', **GS)
                row(id=f'FIX7-gistall-bakes-{lk}', symptom='COMPANION #b RECORD: env-cube bakes the degrade needed to converge', quantity='census:contract:degradeBakes', op='>=', target=1, pm=0,
                    arm=False, record=True, arm_note='RECORD', source='window.__venueDegrade.bakes', **GS)
                row(id=f'FIX7-gistall-waited-{lk}', symptom='FIX7 #2 RECORD: time from the venue apply\'s start to the release under the stall (window + hold ≈ 2 × VENUE_GI_WINDOW_MS)', quantity='census:contract:venueGiHoldWaitedMs', op='>=', target=0, pm=0,
                    arm=False, record=True, arm_note='RECORD', source='venue.giHoldTimedOut.waitedMs (the applied record is cleared by the degrade\'s off apply)', **GS)
            # the room under the degraded stalled-GI boot reads MAIN's room (wall / floor / bench Y within ±5 % of the main baseline at full34 — the
            # MIX-oldlv-room law); the pre-companion app (gistallpre, RECORD) restored the 9.91 probe under the class room: the ~10× hybrid
            for reg in ('wall', 'floor', 'bench'):
                row(id=f'FIX7-gistall-room-{reg}', symptom=f'COMPANION #b: after the stalled-GI degrade the {reg} reads the LEGACY room — Y within ±5 % of its own ?venue=off twin under the same stall (full34; refuter round: a GI-stalled floor has no lightmap, so main\'s GI-lit baseline is not its twin — land11 read the floor at 1.18 of it)', quantity=f'census:roomPairs:{reg}Ratio', op='band', target=1.0, pm=0.05,
                    arm=True, arm_from='after', source=f'Y({reg} patch, gistall) / Y({reg} patch, gistalloff = ?nogi&venue=off — a disabled GI is the same shader state as a stalled one: giOn 0, giReady 0, uGiIrr 2; a ?venue=off&giStall=manifest boot never settles for the capture tool); arm = the fresh venue-ON set (the class room: ratio ≫ 1 → RED)', look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft', reads_from='gistall')
                row(id=f'FIX7-gistallpre-room-{reg}', symptom=f'COMPANION #b RECORD: the PRE-companion app under the same stall — the 9.91 probe restored under the class room: {reg} Y ratio vs the main baseline (the over-light review named)', quantity=f'census:roomPairs:{reg}Ratio', op='>=', target=0.0, pm=0.0,
                    arm=False, record=True, arm_note='RECORD: the finding, measured on the 2eab3fad app', source=f'Y({reg} patch, gistallpre) / Y({reg} patch, main baseline)', look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft', reads_from='gistallpre')
            # the late completion AFTER the bound (giDelay=40000 > window + hold): the watch fires and the probe is re-derived — FIX5's gidelay set
            # (giDelay=20000, inside the hold) remains the in-window late completion (FIX-gidelay-* rows), cited, not duplicated
            GL = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft@latewait', reads_from='gilate')
            # ORDER-LIGHT-COMPANION: the boot DEGRADED at the bound stays legacy when the GI apply lands later (a degraded boot is a degraded boot —
            # FIX7's watch is superseded); latewait waits for the GI runtime to be ready and reads the state
            row(id='FIX7-gilate-gilanded', symptom='COMPANION #b: the GI apply DID land after the bound (giReady 1 at the latewait read)', quantity='census:contract:giReady', op='>=', target=1, pm=0,
                arm=True, arm_from='gistall', arm_table='predator_apex_9ft', source='gi.state.ready after the latewait poke; arm = the stalled boot (never ready: 0 → RED)', **GL)
            row(id='FIX7-gilate-stayslegacy', symptom='COMPANION #b: the late GI landing does not re-enable the venue — the boot stays degraded (venue.on 0)', quantity='census:contract:venueOn', op='<=', target=0, pm=0,
                arm=True, arm_from='after', arm_table='predator_apex_9ft', source='lightingvisuals state().venue.on after the late landing; arm = the fresh boot (1 → RED)', **GL)
            row(id='FIX7-gilate-noderive', symptom='COMPANION #b: no venue fill is derived after the late landing', quantity='census:contract:venueDerived', op='<=', target=0, pm=0,
                arm=True, arm_from='after', arm_table='predator_apex_9ft', source='census contract.venueDerived; arm = the fresh boot (1 → RED)', **GL)
            row(id='FIX7-gilate-dressing', symptom='COMPANION #b: the legacy dressing stays after the late landing', quantity='census:contract:dressingClass', op='<=', target=0, pm=0,
                arm=True, arm_from='after', arm_table='predator_apex_9ft', source='census dressing.mode; arm = the fresh boot (class → RED)', **GL)
            # ---- ORDER-LIGHT-COMPANION (review r12 P1, main.js:330-331): an optional leaf import that STALLS is bounded by the ONE budget — the app is ready
            # on the legacy path with the stalled leaf named; `leafstall` = a boot leaf (venueflag), `leafstall2` = the dynamic rig leaf (lightingvisuals,
            # which never lands: the census reads it absent); the pre-companion rule (unbounded awaits) never publishes __test = seal arm leafstallforever
            # refuter round: leafstall3 = the SNOOKER table (GI keyed to snooker_luminaire at boot) with the rig leaf stalled — the bound re-pins the maps to main's canopy rig
            for setn, leaf, extra, tbl in (('leafstall', 'venueflag', True, 'predator_apex_9ft'), ('leafstall2', 'lightingvisuals', False, 'predator_apex_9ft'), ('leafstall3', 'lightingvisuals', False, 'wpbsa_snooker_12ft')):
                LS = dict(look='default', pose=None, provenance='DERIVED', table=tbl, reads_from=setn)
                row(id=f'LEAF-{setn}-errors', symptom=f'COMPANION #a: the boot with the {leaf} import stalled raises no app error', quantity='census:contract:bootErrors', op='<=', target=0, pm=0,
                    arm=False, arm_note='a boot that never settles fails the capture step itself', source='main.js testErrors length', **LS)
                row(id=f'LEAF-{setn}-named', symptom=f'COMPANION #a: the census NAMES the stalled leaf ({leaf}) — protoStalled_{leaf} = 1', quantity=f'census:contract:protoStalled_{leaf}', op='>=', target=1, pm=0,
                    arm=True, arm_from='after', source=f'window.__venueProtocol.stalled includes "{leaf}"; arm = the fresh boot (0 → RED)', **LS)
                row(id=f'LEAF-{setn}-legacy', symptom=f'COMPANION #a: {leaf} stalled → the handshake reads NOT ok (protocolOk 0): the legacy path for ALL', quantity='census:contract:protocolOk', op='<=', target=0, pm=0,
                    arm=True, arm_from='after', source='window.__venueProtocol.ok; arm = the fresh boot (1 → RED)', **LS)
                row(id=f'LEAF-{setn}-dressing', symptom=f'COMPANION #a: {leaf} stalled → the LEGACY dressing', quantity='census:contract:dressingClass', op='<=', target=0, pm=0,
                    arm=True, arm_from='after', source='census dressing.mode; arm = the fresh boot (class → RED)', **LS)
                row(id=f'LEAF-{setn}-gain', symptom=f'COMPANION #a: {leaf} stalled → main\'s grid gain (uGiIrr 2.0)', quantity='census:contract:giIrr', op='>=', target=2.0, pm=0,
                    arm=True, arm_from='after', source='census contract.giIrr; arm = the fresh boot (1.0 → RED)', **LS)
                row(id=f'LEAF-{setn}-occ', symptom=f'COMPANION #a: {leaf} stalled → no ball program samples the LUT (main\'s programs)', quantity='census:occLut:boundBallPrograms', op='<=', target=0, pm=0,
                    arm=True, arm_from='after', source='census occLut.boundBallPrograms; arm = the fresh boot (10 → RED)', **LS)
                if tbl == 'predator_apex_9ft':  # the table-owned probe is the Predator's (obPdtVenueAmbient); the snooker census reads it null by definition
                    row(id=f'LEAF-{setn}-probe', symptom=f'COMPANION #a: {leaf} stalled → the table-owned probe stays visible (main\'s rig)', quantity='census:contract:legacyProbeVisible', op='>=', target=1, pm=0,
                        arm=True, arm_from='after', source='census contract.legacyProbeVisible; arm = the fresh boot (suppressed → 0 → RED)', **LS)
                twin = 'main baseline' if extra else f'{setn}off (?venue=off under the same stall)'  # refuter round: a boot without the rig leaf has no fixture rig — its legacy room is its off twin's, not main's (land11: floor 0.89 of main)
                for reg in (('wall', 'floor', 'bench') if tbl == 'predator_apex_9ft' else ()):
                    row(id=f'LEAF-{setn}-room-{reg}', symptom=f'COMPANION #a: {leaf} stalled → the {reg} reads the LEGACY room (Y within ±5 % of the {twin}, full34)', quantity=f'census:roomPairs:{reg}Ratio', op='band', target=1.0, pm=0.05,
                        arm=True, arm_from='after', source=f'Y({reg} patch, {setn}) / Y({reg} patch, {twin}); arm = the fresh venue-ON set (class room ≫ 1 → RED)', **LS)
                # (refuter round: the moment is recorded for the rig leaf too — every stalled leaf carries it)
                row(id=f'LEAF-{setn}-budget', symptom='COMPANION #a: the stall was decided AT the budget (protocolStalledAtMs ≥ VENUE_GI_WINDOW_MS = 15000, the one constant)', quantity='census:contract:protocolStalledAtMs', op='>=', target=GI_WINDOW_MS, pm=0, derived_from=DERIVED_WINDOW,
                    arm=False, arm_note='declared weak arm: the fresh boot reads no stall moment (null); the decision time is a record of the bound', source='window.__venueProtocol.stalledAt (ms since the leaf loads started)', **LS)
                if extra:
                    row(id=f'LEAF-{setn}-venueoff', symptom='COMPANION #a: the lighting leaf (present on this boot) reads venue OFF (protocol not handed over)', quantity='census:contract:venueOn', op='<=', target=0, pm=0,
                        arm=True, arm_from='after', source='lightingvisuals state().venue.on; arm = the fresh boot (1 → RED)', **LS)
                else:
                    row(id=f'LEAF-{setn}-absent', symptom='COMPANION #a: the lighting leaf never landed (window.__lighting absent) — readiness came from the bound, not the leaf', quantity='census:contract:lightingLeafPresent', op='<=', target=0, pm=0,
                        arm=True, arm_from='after', source='window.__lighting present; arm = the fresh boot (1 → RED)', **LS)
                    row(id=f'LEAF-{setn}-degraded', symptom='COMPANION #a: the stalled rig leaf took main.js\'s ONE degradeVenue at the bound', quantity='census:contract:venueDegraded', op='>=', target=1, pm=0,
                        arm=True, arm_from='after', source='window.__venueDegrade present; arm = the fresh boot (0 → RED)', **LS)
                    # refuter round: the GI maps were keyed to bootFixture (snooker: snooker_luminaire) for a rig that never lands — the bound re-pins them
                    # to main's canopy rig (the rejection path's rule); arm = the fresh boot of the SAME table (its own fixture → 0 on snooker → RED)
                    row(id=f'LEAF-{setn}-gifixture', symptom=f'COMPANION #a (refuter): with the rig leaf stalled the GI maps are keyed to main\'s canopy rig (gi.state.fixture canopy_panel) on {tbl}', quantity='census:contract:giFixtureIsCanopy', op='>=', target=1, pm=0,
                        arm=True, arm_from='after', arm_table=tbl, source='census contract.giFixture (gi.state.fixture) after the bound; arm = the fresh boot of the same table (Predator: the venue-default class fixture pdt_studio; snooker: snooker_luminaire → 0 → RED)', **LS)
                    if tbl != 'predator_apex_9ft':
                        row(id=f'LEAF-{setn}pre-gifixture', symptom=f'COMPANION #a (refuter) RECORD: the 4ea6b55f app under the same stall on {tbl} — the GI maps left on the boot fixture (snooker_luminaire) under main\'s canopy rig (giFixtureIsCanopy 0 = the mismatch)', quantity='census:contract:giFixtureIsCanopy', op='>=', target=0, pm=0,
                            arm=False, record=True, arm_note='RECORD: the refuter finding, measured on the 4ea6b55f app with this lane\'s census', source='census contract.giFixture (gi.state.fixture) after the bound, 4ea6b55f app', look='default', pose=None, provenance='DERIVED', table=tbl, reads_from=f'{setn}pre')
            row(id='MIX-oldroom-crown', symptom='P1-a RECORD: Predator crown on the old-room (room.js ALONE, FIX6) pairing vs its ?venue=off twin', quantity='census:contractPairs:crownRatioAB', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD', look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft', reads_from='mixoldroom', source='crown ratio')
            # ---- ORDER-LAND-638-FIX2 B1(b): the STALE venue leaf under the new main.js / room.js renders MAIN's room — wall /
            # floor / bench vs the main baseline within 5 % (room pairs at full34); arm = the default after set (class room ≫ main)
            OL = dict(look='default', pose=None, provenance='DERIVED', table='predator_apex_9ft', reads_from='mixoldlv')
            row(id='MIX-oldlv-errors', symptom="B1(b): the export paired with main's scene/lightingvisuals.js boots without an app error", quantity='census:contract:bootErrors', op='<=', target=0, pm=0, arm=False, arm_note='a boot that never settles fails the capture step itself', source='main.js testErrors length on the mixed tree', **OL)
            row(id='MIX-oldlv-dressing', symptom="B1(b): a stale venue leaf (no VENUE_ROOM_CAPABLE) gets the LEGACY dressing (main.js degrades it)", quantity='census:contract:dressingClass', op='<=', target=0, pm=0, arm=True, arm_from='after', source='census dressing.mode (class = 1); arm = the default boot (class → RED)', **OL)
            for reg in ('wall', 'floor', 'bench'):
                row(id=f'MIX-oldlv-room-{reg}', symptom=f"B1(b): stale leaf + new room = main's room — {reg} Y within ±5 % of the main baseline (full34)", quantity=f'census:roomPairs:{reg}Ratio', op='band', target=1.0, pm=0.05, arm=True, arm_from='after',
                    source=f'Y({reg} patch, mixed tree) / Y({reg} patch, main 163d7f25 baseline); arm = the default after set (the class room: ratio ≫ 1 → RED)', **OL)
            # ---- ORDER-LAND-638-FIX2 C2 (review r6 P1): a FAILED GI load is a settled state — the venue capture proceeds, the balls keep main's diffuse
            for lk in ('default', 'sp'):
                GF = dict(look=lk, pose=None, provenance='DERIVED')
                # ORDER-LAND-638-FIX2 B1 (round-trip arm): the settle law's env-cube convergence record — bounded rounds, converged
                row(id=f'FIX-settle-rounds-{lk}', symptom='B1: the settle law\'s bake→probe convergence stays within its bound (rounds ≤ 8; measured ratio ≈ 0.22 per bake, typical 1–2)', quantity='census:contract:venueSettleRounds', op='<=', target=8, pm=0, arm=False, arm_note='the bound is the law\'s own cap (an unconverged run reads 8 with settled 0 — the FIX-settle-converged row below carries the red arm)', table='predator_apex_9ft', reads_from='after', source='lightingvisuals venue.stillness.confirmations (after set)', **GF)
                row(id=f'FIX-settle-rel-{lk}', symptom='B1: consecutive post-settle bakes agree on the room-only probe to 1e-4 relative (half the shift that spends the identity gate\'s 2 % flip budget)', quantity='census:contract:venueSettleRel', op='<=', target=1e-4, pm=0, arm=True, arm_from='settleoff', arm_table='predator_apex_9ft@settleoff', table='predator_apex_9ft', reads_from='after', source='lightingvisuals venue.stillness.lastDeltaRel (after set); arm = ring → pdt under ?venueConverge=off (one comparison round after a large rig change records the first fixed-point step ≈ 5e-4 → RED)', **GF)
                row(id=f'FIX-settle-converged-{lk}', symptom='B1: the settle law converged (lastDeltaRel ≤ tol within the bound)', quantity='census:contract:venueSettled', op='>=', target=1, pm=0, arm=True, arm_from='settleoff', arm_table='predator_apex_9ft@settleoff', table='predator_apex_9ft', reads_from='after', source='lightingvisuals venue.stillness.settled (after set); arm as above (settled 0 → RED)', **GF)
                # ORDER-LAND-638-FIX3 (review r7 P2 #2): a stale GI error is cleared at the start of every apply — a failed first load,
                # then a successful retry (?giFail=assets:1 + canopy → auto) reads ready, on, no error, and the venue derived
                row(id=f'FIX-gierr-cleared-{lk}', symptom='FIX3 P2#2: after a failed first asset load and a successful retry the GI error state is CLEARED (giLoadError 0)', quantity='census:contract:giLoadError', op='<=', target=0, pm=0, arm=True, arm_from='gifail', arm_table='predator_apex_9ft', table='predator_apex_9ft@gierr', reads_from='gierr', source='census contract.giLoadError under ?giFail=assets:1 after canopy → auto; arm = the always-failing gifail boot (1 → RED)', **GF)
                row(id=f'FIX-gierr-ready-{lk}', symptom='FIX3 P2#2: the retried apply reads ready', quantity='census:contract:giReady', op='>=', target=1, pm=0, arm=True, arm_from='gifail', arm_table='predator_apex_9ft', table='predator_apex_9ft@gierr', reads_from='gierr', source='census contract.giReady on the gierr set; arm = gifail (never ready → RED)', **GF)
                row(id=f'FIX-gierr-gion-{lk}', symptom='FIX3 P2#2: the retried apply has the grid on (uGiOn 1)', quantity='census:contract:giOn', op='>=', target=1, pm=0, arm=True, arm_from='gifail', arm_table='predator_apex_9ft', table='predator_apex_9ft@gierr', reads_from='gierr', source='census contract.giOn on the gierr set; arm = gifail (0 → RED)', **GF)
                row(id=f'FIX-gierr-derived-{lk}', symptom='FIX3 P2#2: the venue term derived after the retry (no capture raced the apply)', quantity='census:contract:venueDerived', op='>=', target=1, pm=0, arm=True, arm_from='off', arm_table='predator_apex_9ft', table='predator_apex_9ft@gierr', reads_from='gierr', source='census contract.venueDerived on the gierr set; arm = the ?venue=off boot (0 → RED)', **GF)
                # ORDER-LAND-638-FIX3 (review r7 P2 #4): no float render target → the venue fill is NOT derivable → the WHOLE feature is
                # inert with a law line: legacy probe visible, legacy dressing, main's shading (grid gain 2.0, no derived-occlusion
                # ball program), no app error; the frame equals main (offcheck-nofloat). Arm for every row = the normal after boot.
                # ORDER-LAND-638-FIX4 (review r8 P2 #1): a throw in the cube render (`?venueThrow=render`) or the float readback
                # (`?venueThrow=readback`) takes the SAME degrade path: pending cleared, the probe restored, the term inert with a
                # reason naming the runtime throw, legacy dressing, main's shading, no app error; frame == off (offcheck-throw*)
                for th in ('throwrender', 'throwreadback', 'readnoop'):  # readnoop: ORDER-LIGHT-FIX5 P2#2 (the no-op readback takes the same degrade path)
                    row(id=f'FIX-{th}-pending-{lk}', symptom=f'FIX4 P2#1 ({th}): venue.pending is cleared after the runtime throw (the boot settles; __test.ready)', quantity='census:contract:venuePending', op='<=', target=0, pm=0, arm=False, arm_note='a boot whose pending never clears never settles: the capture step itself fails (the negative arm is the reverted catch — report §L23)', table='predator_apex_9ft', reads_from=th, source=f'census contract.venuePending under ?venueThrow={th[5:]}', **GF)
                    row(id=f'FIX-{th}-inert-{lk}', symptom=f'FIX4 P2#1 ({th}): the venue fill is not derivable after the runtime throw', quantity='census:contract:venueDerivable', op='<=', target=0, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from=th, source='census contract.venueDerivable; arm = after (1 → RED)', **GF)
                    row(id=f'FIX-{th}-law-{lk}', symptom=f'FIX4 P2#1 ({th}): the reason names the runtime throw (law line)', quantity='census:contract:venueInertRuntime', op='>=', target=1, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from=th, source='census contract.venueInertRuntime; arm = after (0 → RED)', **GF)
                    row(id=f'FIX-{th}-legacy-{lk}', symptom=f'FIX4 P2#1 ({th}): the suppressed table-owned probe is restored (visible)', quantity='census:contract:legacyProbeVisible', op='>=', target=1, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from=th, source='census contract.legacyProbeVisible; arm = after (0 → RED)', **GF)
                    row(id=f'FIX-{th}-dressing-{lk}', symptom=f'FIX4 P2#1 ({th}): the room degrades to the legacy dressing', quantity='census:contract:dressingClass', op='<=', target=0, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from=th, source='census contract.dressingClass; arm = after (1 → RED)', **GF)
                    row(id=f'FIX-{th}-shading-{lk}', symptom=f'FIX4 P2#1 ({th}): main\'s grid gain (uGiIrr 2.0) and no derived-occlusion ball program', quantity='census:contract:giIrr', op='>=', target=2.0, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from=th, source='census contract.giIrr; arm = after (1.0 → RED)', **GF)
                    row(id=f'FIX-{th}-occ-{lk}', symptom=f'FIX4 P2#1 ({th}): no ball program samples uOccLut (compiled witness)', quantity='census:occLut:boundBallPrograms', op='<=', target=0, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from=th, source='census occLut.boundBallPrograms; arm = after (10 → RED)', **GF)
                    row(id=f'FIX-{th}-errors-{lk}', symptom=f'FIX4 P2#1 ({th}): no app error (the throw is caught; the law line is console.info)', quantity='census:contract:bootErrors', op='<=', target=0, pm=0, arm=False, arm_note='an uncaught throw would count in __test.errors and the boot would not settle', table='predator_apex_9ft', reads_from=th, source='census contract.bootErrors', **GF)
                # ---- ORDER-LIGHT-FIX5 (review r9) ----
                # P2#2 RECORD (the defect on the pre-FIX5 rule): a no-op readback under ?venueReadCheck=off is ACCEPTED as a derived probe
                row(id=f'FIX-readnoop-prefix-{lk}', symptom='FIX5 P2#2 RECORD (the defect, pre-FIX5 rule ?venueReadCheck=off): a no-op readback is ACCEPTED as a derived probe (venueDerived 1 — an all-zero fill)', quantity='census:contract:venueDerived', op='>=', target=0, pm=0,
                    arm=False, record=True, arm_note='RECORD: the pre-fix rule; the judged FIX-readnoop-inert row reads the fixed rule (0)', table='predator_apex_9ft', reads_from='readnoopprefix', source='census contract.venueDerived on ?venueReadNoop=1&venueReadCheck=off', look=lk, pose=None, provenance='DERIVED')
                # P2#1: the GI-hold law — a 20 s GI apply (?giDelay=20000, past the 15 s window) is WAITED for: the accepted probe is the
                # post-GI one (giSettled 1, held > 0, the frame == the normal boot's converged frame by offcheck-gidelay-on); arm = the
                # pre-FIX5 rule (?venueGiWait=timeout) on the same delayed apply: captured against the half-applied GI (giSettled 0, held 0)
                GD = dict(table='predator_apex_9ft', reads_from='gidelay', look=lk, pose=None, provenance='DERIVED')
                row(id=f'FIX-gidelay-gisettled-{lk}', symptom='FIX5 P2#1: the accepted venue probe was captured with the GI apply COMPLETE (giSettled), the apply having outlasted the 15 s window', quantity='census:contract:venueGiSettled', op='>=', target=1, pm=0,
                    arm=True, arm_from='gidelayprefix', arm_table='predator_apex_9ft', source='lightingvisuals venue.applied.giSettled under ?giDelay=20000; arm = the same boot under ?venueGiWait=timeout (the pre-FIX5 rule captures at 15 s: 0 → RED)', **GD)
                row(id=f'FIX-gidelay-held-{lk}', symptom='FIX5 P2#1: the term was HELD while the apply was outstanding (giHeldMs > 0: table-owned probe back in force, nothing accepted)', quantity='census:contract:venueGiHeldMs', op='>=', target=1, pm=0,
                    arm=True, arm_from='gidelayprefix', arm_table='predator_apex_9ft', source='venue.applied.giHeldMs; arm = the pre-FIX5 rule never holds (0 → RED)', **GD)
                row(id=f'FIX-gidelay-released-{lk}', symptom='FIX5 P2#1: no hold outstanding at census time (the hold released when the apply landed)', quantity='census:contract:venueHold', op='<=', target=0, pm=0,
                    arm=False, arm_note='consistency: a hold at census time = the capture tool shot a held state (the settle predicate waits on pending)', source='venue.hold at census time', **GD)
                row(id=f'FIX-gidelay-derived-{lk}', symptom='FIX5 P2#1: the term derived after the hold (not degraded, not pending)', quantity='census:contract:venueDerived', op='>=', target=1, pm=0,
                    arm=True, arm_from='throwrender', arm_table='predator_apex_9ft', source='census contract.venueDerived; arm = the runtime-throw boot (0 → RED)', **GD)
                row(id=f'FIX-gidelay-pin-{lk}', symptom='FIX5 P2#1: the post-hold probe IS the boot\'s probe — within the pin tolerance of the committed Predator pin', quantity='venue:sh', op='<=', target=0.0, pm=float(pins.get('tolerance', 2e-3)),
                    arm=True, arm_from='pdtring', arm_table='predator_apex_9ft', pin=pins['predator_apex_9ft'][lk]['sh'], source='max |Δ| vs lighting-probe-pin.json on the ?giDelay=20000 boot; arm = the studio-pin boot (its probe is another fixture\'s)', **GD)
                row(id=f'FIX-gidelay-prefix-pin-{lk}', symptom='FIX5 P2#1 RECORD (the defect): the pre-FIX5 rule\'s probe, captured against the half-applied GI — its distance from the pin', quantity='venue:sh', op='>=', target=0.0, pm=0.0,
                    arm=False, record=True, arm_note='RECORD', pin=pins['predator_apex_9ft'][lk]['sh'], table='predator_apex_9ft', reads_from='gidelayprefix', source='max |Δ| vs the pin on ?giDelay=20000&venueGiWait=timeout', look=lk, pose=None, provenance='DERIVED')
                # ---- land8 (§L25): the shared-PMREM re-arm guard (the dark switch-back probe's root cause) ----
                PM = dict(table='predator_apex_9ft@tinyenv', reads_from='pmremarm', look=lk, pose=None, provenance='DERIVED')
                row(id=f'FIX-pmrem-pin-{lk}', symptom='land8: after a FIRST-TIME 2×2 environment cube is generated (a table own-cube), a rebake + re-derive keeps the venue probe on the committed Predator pin', quantity='venue:sh', op='<=', target=0.0, pm=float(pins.get('tolerance', 2e-3)),
                    arm=True, arm_from='pmremarmoff', arm_table='predator_apex_9ft@tinyenv', pin=pins['predator_apex_9ft'][lk]['sh'], source='max |Δ coefficient| vs lighting-probe-pin.json on the tinyenv poke; arm = the same poke under ?pmremRearm=off (the pre-fix rule: the shared PMREMGenerator keeps 2-lod planes, the prefiltered environment loses its rough levels, Δ 0.0124 → RED)', **PM)
                row(id=f'FIX-pmrem-rearms-{lk}', symptom='land8: the guard re-armed the shared generator at least once on the tinyenv poke (window.__obPmremRearm)', quantity='census:contract:pmremRearms', op='>=', target=1, pm=0,
                    arm=True, arm_from='pmremarmoff', arm_table='predator_apex_9ft@tinyenv', source='census contract.pmremRearms; arm = ?pmremRearm=off (the guard is not installed: 0 → RED)', **PM)
                row(id=f'FIX-pmrem-prefix-pin-{lk}', symptom='land8 RECORD (the defect): the pre-fix probe after the tiny-cube generation — its distance from the pin', quantity='venue:sh', op='>=', target=0.0, pm=0.0,
                    arm=False, record=True, arm_note='RECORD', pin=pins['predator_apex_9ft'][lk]['sh'], table='predator_apex_9ft@tinyenv', reads_from='pmremarmoff', source='max |Δ| vs the pin under ?pmremRearm=off', look=lk, pose=None, provenance='DERIVED')
                # land8 review items: the guard is PINNED (installs only on the vendored three r170 with the private symbols at their
                # arity) and LOUD when not (census pmremGuard 0 → this row FAILS: a vendor bump cannot drop it under a green seal); it is INERT
                # on the common path (a plain boot counts zero re-arms; the tinyenv poke counts one: the arm)
                row(id=f'FIX-pmrem-guard-{lk}', symptom='land8: the PMREM re-arm guard is installed (three r170 pinned, private symbols present at their arity) — 0 = a loud no-op that must fail here', quantity='census:contract:pmremGuard', op='>=', target=1, pm=0,
                    arm=True, arm_from='pmremarmoff', arm_table='predator_apex_9ft@tinyenv', table='predator_apex_9ft', reads_from='after', source='window.__obPmremGuard.installed (census pmremGuard); arm = ?pmremRearm=off registers as not installed (0 → RED); a vendor bump or a changed private symbol reads the same 0', look=lk, pose=None, provenance='DERIVED')
                row(id=f'FIX-pmrem-inert-{lk}', symptom='land8: on a plain boot the guard never re-arms (zero re-arms counted: inert on the common path, no per-frame cost)', quantity='census:contract:pmremRearms', op='<=', target=0, pm=0,
                    arm=True, arm_from='pmremarm', arm_table='predator_apex_9ft@tinyenv', table='predator_apex_9ft', reads_from='after', source='census contract.pmremRearms on the normal boot; arm = the tinyenv poke (a first-time 2×2 cube then a re-generation: ≥ 1 → RED)', look=lk, pose=None, provenance='DERIVED')
                row(id=f'FIX-pmrem-switchback-rearms-{lk}', symptom='land8 RECORD: re-arms counted across the live Predator → JOY → Predator switch (the natural trigger: expected 1)', quantity='census:contract:pmremRearms', op='>=', target=0, pm=0,
                    arm=False, record=True, arm_note='RECORD', table='predator_apex_9ft@switchback', reads_from='switchback', source='census contract.pmremRearms on the switchback poke', look=lk, pose=None, provenance='DERIVED')
                # P3: after a runtime throw (derivable false) a RERACK (new ball materials through scene.add) hooks NOTHING — the compiled
                # witness (a ball program whose fragment carries obVenueSH) and the cache-key witness both read 0; arm = the pre-FIX5
                # wrapper rule (?venueHook=termonly: arms on venue.on + active term, derivable ignored) → the new balls carry the term
                TR = dict(table='predator_apex_9ft@rerack', reads_from='throwrerack', look=lk, pose=None, provenance='DERIVED')
                row(id=f'FIX-throwrerack-fill-{lk}', symptom='FIX5 P3: after the runtime throw a rerack\'s new ball programs carry NO fill term (compiled fragment: no obVenueSH)', quantity='census:contract:ballFillPrograms', op='<=', target=0, pm=0,
                    arm=True, arm_from='after', arm_table='predator_apex_9ft', source='gl.getShaderSource of every giSH material\'s program after __test.rerack(3); arm = the fresh venue-ON boot (its balls carry the fill: > 0 → RED). (C1 land13: the former arm ?venueHook=termonly hooks nothing after a runtime throw since FIX6\'s degrade turns the venue off — NOT-AN-ARM, masked by set reuse since land8)', **TR)
                row(id=f'FIX-throwrerack-keys-{lk}', symptom='FIX5 P3: after the runtime throw no rerack ball material cache key carries |venuefill', quantity='census:contract:ballFillKeys', op='<=', target=0, pm=0,
                    arm=True, arm_from='after', arm_table='predator_apex_9ft', source='customProgramCacheKey witness after the rerack; arm = the fresh venue-ON boot (|venuefill keys > 0 → RED); the former termonly arm reads 0 since FIX6 (see -fill)', **TR)
                row(id=f'FIX-throwrerack-inert-{lk}', symptom='FIX5 P3: the term stayed not derivable across the rerack', quantity='census:contract:venueDerivable', op='<=', target=0, pm=0,
                    arm=True, arm_from='after', arm_table='predator_apex_9ft', source='census contract.venueDerivable after the rerack; arm = the normal boot (1 → RED)', **TR)
                row(id=f'FIX-throwrerack-errors-{lk}', symptom='FIX5 P3: no app error across the rerack', quantity='census:contract:bootErrors', op='<=', target=0, pm=0,
                    arm=False, arm_note='a failing rerack fails the capture step (the poke must evaluate and settle)', source='__test.errors after the rerack', **TR)
                row(id=f'FIX-nofloat-inert-{lk}', symptom='FIX3 P2#4: without a float render target the venue fill is not derivable', quantity='census:contract:venueDerivable', op='<=', target=0, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from='nofloat', source='census contract.venueDerivable under ?venueFloat=0; arm = the after boot (1 → RED)', **GF)
                row(id=f'FIX-nofloat-law-{lk}', symptom='FIX3 P2#4: the law line names the float capability', quantity='census:contract:venueInertFloat', op='>=', target=1, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from='nofloat', source='census contract.venueInertFloat (the venue error / reason mentions the float target); arm = after (0 → RED)', **GF)
                row(id=f'FIX-nofloat-legacy-{lk}', symptom='FIX3 P2#4: the table-owned 9.91 probe stays (nothing suppressed)', quantity='census:contract:legacyProbeVisible', op='>=', target=1, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from='nofloat', source='census contract.legacyProbeVisible under ?venueFloat=0; arm = after (0 → RED)', **GF)
                row(id=f'FIX-nofloat-dressing-{lk}', symptom='FIX3 P2#4 + P2#1: the room degrades to the legacy dressing', quantity='census:contract:dressingClass', op='<=', target=0, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from='nofloat', source='census contract.dressingClass under ?venueFloat=0; arm = after (1 → RED)', **GF)
                row(id=f'FIX-nofloat-shading-{lk}', symptom='FIX3 P2#1: main\'s grid gain on the degrade path (uGiIrr 2.0 × brightness)', quantity='census:contract:giIrr', op='>=', target=2.0, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from='nofloat', source='census contract.giIrr under ?venueFloat=0; arm = after (1.0 → RED)', **GF)
                row(id=f'FIX-nofloat-occ-{lk}', symptom='FIX3 P2#1: no ball program carries the derived occlusion on the degrade path (main\'s programs)', quantity='census:occLut:boundBallPrograms', op='<=', target=0, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from='nofloat', source='census occLut.boundBallPrograms (the COMPILED fragment samples uOccLut — a program-side witness, review P3: the live cache key judges intent) under ?venueFloat=0; arm = after (10 → RED)', **GF)
                row(id=f'FIX-nofloat-occkey-{lk}', symptom='RECORD (the live program cache key, secondary witness): FIX3 P2#1: no ball program carries the derived occlusion on the degrade path (main\'s programs)', quantity='census:contract:ballOccDerived', op='<=', target=0, pm=0, arm=False, record=True, arm_from='after', table='predator_apex_9ft', reads_from='nofloat', source='census contract.ballOccDerived under ?venueFloat=0; arm = after (10 → RED)', **GF)
                row(id=f'FIX-nofloat-errors-{lk}', symptom='FIX3 P2#4: the degrade raises no app error (the law line is console.info)', quantity='census:contract:bootErrors', op='<=', target=0, pm=0, arm=False, arm_note='a boot that never settles fails the capture step itself; an error would count in __test.errors', table='predator_apex_9ft', reads_from='nofloat', source='census contract.bootErrors under ?venueFloat=0', **GF)
                # ORDER-LAND-638-FIX3 (review r7 P2 #1): the stale-leaf pairing (main's lightingvisuals.js + the new main.js / room.js) is the
                # SAME degrade — main's shading too, both looks (the frame identity is offcheck-mixoldlv-on)
                row(id=f'MIX-oldlv-shading-{lk}', symptom='FIX3 P2#1: the stale venue leaf pairing runs main\'s grid gain (uGiIrr 2.0)', quantity='census:contract:giIrr', op='>=', target=2.0, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from='mixoldlv', source='census contract.giIrr on the mixoldlv boot; arm = after (1.0 → RED)', **GF)
                row(id=f'MIX-oldlv-occ-{lk}', symptom='FIX3 P2#1: the stale venue leaf pairing compiles main\'s ball programs (no derived occlusion)', quantity='census:occLut:boundBallPrograms', op='<=', target=0, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from='mixoldlv', source='census occLut.boundBallPrograms (the COMPILED fragment samples uOccLut — a program-side witness, review P3: the live cache key judges intent) on the mixoldlv boot; arm = after (10 → RED)', **GF)
                row(id=f'MIX-oldlv-occkey-{lk}', symptom='RECORD (the live program cache key, secondary witness): FIX3 P2#1: the stale venue leaf pairing compiles main\'s ball programs (no derived occlusion)', quantity='census:contract:ballOccDerived', op='<=', target=0, pm=0, arm=False, record=True, arm_from='after', table='predator_apex_9ft', reads_from='mixoldlv', source='census contract.ballOccDerived on the mixoldlv boot; arm = after (10 → RED)', **GF)
                row(id=f'FIX-gifail-settled-{lk}', symptom='C2: a rejected GI manifest fetch is recorded as an error state (gi.state.loadError)', quantity='census:contract:giLoadError', op='>=', target=1, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from='gifail', source='census contract.giLoadError under ?giFail=manifest; arm = the default boot (0 → RED)', **GF)
                # (land16 regate 2 audit) the bound was an AUTHORED 2500 ms. The arm is the legacy settle rule (?venueSettle=legacy: giOk after `elapsed > 4000`), so
                # the constant that governs THIS symptom is that legacy wait — the fixed boot settles before even the legacy wait would have expired
                # (arm 4870 / 4882 ≥ 4000: outside by construction). Read from the leaf at build time; the measured ms rides in the RECORD twin.
                row(id=f'FIX-gifail-wait-{lk}', symptom='C2 (re-derived by ORDER-LIGHT-C2-FIX5 E2): the venue capture does not wait for an apply that failed — it lands on the FIRST poll after its last bake (venueTailPolls 1 by construction); the legacy settle rule keeps polling through its 4 s cap + 800 ms (many); the wall-clock bound (≤ LEGACY_GI_WAIT_MS) measured the box — #756, the bake-1 cold program compile — and is a RECORD row now', quantity='census:contract:venueTailPolls', op='<=', target=1, pm=0, derived_from=dict(symbol='the shipped attempt loop: one poll after the last bake captures (lightingvisuals.js attempt / fireRebake)', value=1, file='web/scene/lightingvisuals.js'), arm=True, arm_from='gifailarm', table='predator_apex_9ft', reads_from='gifail', source='lightingvisuals venue.applied.waitedMs under ?giFail=manifest; arm = the same boot under ?venueSettle=legacy (the seal-6 rule waits its 4 s cap → RED)', **GF)
                row(id=f'FIX-gifail-wait-ms-{lk}', symptom='C2 RECORD: the failed-load boot\'s venue wait in ms (the number the derived bound above judges)', quantity='census:contract:venueWaitedMs', op='>=', target=0, pm=0,
                    arm=False, record=True, arm_note='RECORD: the measured number', table='predator_apex_9ft', reads_from='gifail', source='lightingvisuals venue.applied.waitedMs', **{**PD, 'look': lk})  # (verifiers A+B) PD here is look='default'; the twin must read ITS look's ms
                row(id=f'FIX-gifail-gioff-{lk}', symptom='C2: under a failed load the grid stays off (uGiOn 0) — main\'s LTC diffuse carries the balls', quantity='census:contract:giOn', op='<=', target=0, pm=0, arm=True, arm_from='after', table='predator_apex_9ft', reads_from='gifail', source='shared.uGiOn; arm = the default boot (1 → RED)', **GF)
                row(id=f'FIX-gifail-lit-wpa-{lk}', symptom='C2 / P1-b: failed-load balls keep their key diffuse — cue-ball crown within ±5 % of the same boot under ?venue=off (wpa_spec; the GH-996 ball knee off on both sides: gifailnk)', quantity='census:contractPairs:crownRatioAB', op='band', target=1.0, pm=0.05, arm=True, arm_from='nogiarm', table='wpa_spec_9ft', reads_from='gifailnk', source='crown_Y(giFail & ballKnee=off) / crown_Y(giFail & venue=off); arm = the previous export\'s no-grid boot (unweighted splice → ratio far below 1)', **GF)
                row(id=f'FIX-gifail-lit-wpa-knee-{lk}', symptom='GH-996 RECORD: the shipped failed-load crown (ball knee ON) vs its ?venue=off twin — the knee compresses the grid-off LTC crown where it passes T', quantity='census:contractPairs:crownRatioAB', op='>=', target=0.0, pm=0.0, arm=False, record=True, arm_note='RECORD: the knee is the owner-picked look change; judged by the KNEE rows', table='wpa_spec_9ft', reads_from='gifail', source='crown_Y(giFail) / crown_Y(giFail & venue=off)', **GF)
            BC = dict(table='fixture', look='—', pose=None, provenance='DERIVED')
            # ORDER-LAND-638-FIX3 (review r7 P2 #5): the flip baseline is MAIN boots only; the ?venue=off boots' own per-boot bound is
            # measured separately and must sit INSIDE main's envelope on every cell (a systematic off regression would read 0 here)
            row(id='FLIP-off-within-main', symptom='FIX3 P2#5: the ?venue=off boots\' own per-boot flip bound sits inside main\'s main-only envelope on every cell', quantity='fixture:main-flip:off_within_main', op='>=', target=1, pm=0, arm=False,
                arm_note='TOOL ARMS (seal OB_SEAL_ARM=flipoff / flipmissing, run by the landing chain): flipoff — the generator on a root whose off population is the seal-7 off leak (predator 9–10/255 on 27 % against max 3) writes off_within_main 0 → exit 4; flipmissing (FIX4 P2#2) — the same root asked for the full key set has no off pairs on the wpa cells → the generator FAILS (exit 6, cells named, no fixture written); the off population includes THIS tip\'s own off boot (main-oc-<tag>)', source='tools/render/fixtures/lighting-main-flip.json: off_within_main (off_cells vs cells), boot_count.baseline = main boots only', **BC)
            row(id='OCC-bound-nodes', symptom='Q2 (round-9 c3): the BOUND uOccLut texture\'s nine interior nodes equal the independent-quadrature fixture (default boot)', quantity='fixture:occlusion-bound-check:max_abs_delta_default', op='<=', target=0.0, pm=1e-6,
                arm=False, arm_note='the arm is OCC-bound-off below: on ?venue=off no ball program binds the texture and the renderer never uploads it', source='tools/render/fixtures/lighting-occlusion-bound-check.json: uOccLut.image.data at the nine (i, j) of lighting-occlusion-check.json in a default boot (float32: expect ~2.7e-8)', **BC)
            row(id='OCC-bound-programs', symptom='Q2 (round-9 c3): every lit ball program binds uOccLut on default (10 of 10 on the Predator boot)', quantity='fixture:occlusion-bound-check:bound_default', op='>=', target=10, pm=0,
                arm=False, arm_note='same fixture; the off boot reads 0 (OCC-bound-off)', source='count of ball programs whose compiled source samples texelFetch(uOccLut), default boot', **BC)
            row(id='OCC-bound-off', symptom='Q2 arm: on ?venue=off no ball program binds uOccLut (0 of 10) and the renderer holds no GPU texture for it', quantity='fixture:occlusion-bound-check:bound_off', op='<=', target=0, pm=0,
                arm=False, arm_note='this row IS the arm of the two above (the same measurement on the off boot)', source='the same fixture, ?venue=off boot: bound 0/10, textureUploaded false (the DataTexture object exists in JS, never uploaded)', **BC)
            row(id='OCC-interior-arm', symptom='Q2 arm (integration): the authored term 1 − 0.9·clamp(0.5 − 0.5 n_y)·exp(−60 h) differs from the table at those nodes (the live row is not vacuous)', quantity='fixture:occlusion-check:max_abs_delta_authored', op='>=', target=0.1, pm=0.0,
                arm=False, arm_note='this row IS the arm of OCC-interior-live: the two shapes must be distinguishable at the checked nodes (near the crown both tend to 1 — the fixture lists every node\'s delta; max 0.309 at n_y −0.5, min 0.002 at n_y +0.875)', source='the same fixture: max |authored − table| over the nine nodes', **FX)
        SM = dict(table='predator_apex_9ft@shmove', look=look, pose=None, reads_from='shmove', provenance='DERIVED')
        row(id=f'SHMOVE-live-{look}', symptom='Q1: after a shot, every moving ball\'s block equals the grid at its LIVE position (updated within the frame)', quantity='census:shMove:maxDelta', op='<=', target=0.0, pm=1e-6,
            arm=False, arm_note='the arm is SHMOVE-stale in the same boot: the pre-shot blocks against the post-shot positions must be far off, else this row is vacuous',
            source="poke-raw: __test.shoot(v0 1.5) then 450 ms later per-ball |giSH − sampleSH(live pos)| (window.__shMove.maxDelta)", **SM)
        row(id=f'SHMOVE-stale-{look}', symptom='Q1 arm: the same balls\' PRE-shot blocks against their post-shot positions (the not-updated hypothesis) must differ', quantity='census:shMove:staleDelta', op='>=', target=0.05, pm=0.0,
            arm=False, arm_note='this row IS the arm of SHMOVE-live (two quantities from one boot)', source='window.__shMove.staleDelta = max |giSH(t0) − sampleSH(pos(t1))| over the balls that moved', **SM)
        row(id=f'SHMOVE-moved-{look}', symptom='Q1 arm: at least one ball moved between the two samples', quantity='census:shMove:moved', op='>=', target=1, pm=0, arm=False, arm_note='consistency of the shot poke', source='window.__shMove.moved = balls whose position changed by > 1 mm between t0 and t1', **SM)
    # ---- ORDER-LIGHT-11 R-A: the ENERGY LEDGER's arms per receiver class (single-sourcing behind the switch)
    for look in ('default', 'sp'):
        LG = dict(table='predator_apex_9ft@barsoff', look=look, pose=None, reads_from='scope', provenance='DERIVED')
        row(id=f'PROG-rectdiff-ball-{look}', symptom='R-A: every lit ball program has the rect-light DIFFUSE leg removed (specular only) — none on ?venue=off', quantity='programs:ball:rectDiffuseMissing', op='<=', target=0, pm=0,
            arm=True, arm_from='off', table='predator_apex_9ft', reads_from=None, look=look, pose=None, provenance='DERIVED',
            source="compiled-GLSL census: lit ball programs − programs whose lights_physical_pars_fragment carries the OB-L11 marker and no directDiffuse rect line; arm = ?venue=off compiles main's chunk (10 missing → RED)")
        row(id=f'PROG-rectdiff-cloth-{look}', symptom='R-A: no cloth / rail / room program lost its rect-light diffuse (their direct IS the runtime rect lights)', quantity='programs:table:rectDiffuseOff', op='<=', target=0, pm=0,
            arm=True, arm_from='ledgerarm', table='predator_apex_9ft', reads_from=None, look=look, pose=None, provenance='DERIVED',
            source='compiled census of the table class (cloth, rails, wood); arm = ?ledgerArm=cloth applies the ball splice to the cloth programs (→ RED)')
        row(id=f'LEDGER-ball-{look}', symptom='R-A: rect lights OFF leaves the cue ball CROWN diffuse (the grid is the single diffuse source; only the highlight tail moves)', quantity='ledger:ball_crown:barsoff_rel', op='<=', target=0.0, pm=0.10,
            arm=True, arm_from='offscope', source='lighting-ledger.py: (crown_Y − crown_Y[rect lights 0]) / crown_Y, scene-linear medians; arm = the same pokes under ?venue=off (main loses its LTC diffuse: ~−0.9 → RED)', **LG)
        row(id=f'LEDGER-ball-bake-{look}', symptom='R-A: bake OFF removes the cue ball crown\'s diffuse almost entirely on default (single-sourced) — on main only the bounce share', quantity='ledger:ball_crown:bakeoff_rel', op='>=', target=0.8, pm=0.0,
            arm=True, arm_from='offscope', source='(crown_Y − crown_Y[uGiIrr 0]) / crown_Y; arm = ?venue=off (main keeps its LTC diffuse: a small share → RED)', **LG)
        for cls, lab in (('cloth', 'cloth (open bed)'), ('rails', 'cushion top (rail_top read, a clothMat program)'), ('room_floor', 'room floor')):
            # judged against the SAME-SCENE reference (?rectDiffuse=legacy: only the ball programs' rect diffuse restored) — the
            # first seal-11 run compared against ?venue=off, i.e. main's Predator scene (9.91 legacy probe + legacy dressing), a
            # different light budget, and failed on all six rows; that comparison stays as a RECORD row below
            row(id=f'LEDGER-{cls}-{look}', symptom=f'R-A: {lab}: the rect-lights-off delta equals the same scene with only the ball splice off (R-A did not touch this class: direct = runtime LTC, indirect = bake)', quantity=f'ledger:{cls}:delta_vs_legacy', op='<=', target=0.0, pm=0.03,
                arm=(cls == 'cloth'), arm_from='ledgerarm' if cls == 'cloth' else None,
                arm_note=None if cls == 'cloth' else 'the cloth row carries the arm (?ledgerArm=cloth splices every cloth-mode table program — the cushion top with it); the floor shares no splice path at all (a stock material)',
                source='|barsoff_rel(default) − barsoff_rel(?rectDiffuse=legacy)|; arm (cloth) = ?ledgerArm=cloth removes the cloth programs\' rect-light diffuse → the lights-off delta collapses → RED', **LG)
            row(id=f'LEDGER-{cls}-vsmain-{look}', symptom=f'R-A record: {lab}: the same delta against ?venue=off — main\'s Predator scene (the 9.91 legacy probe + legacy dressing), a different light budget, so not an invariant', quantity=f'ledger:{cls}:delta_vs_off', op='<=', target=0.0, pm=0.03,
                arm=False, record=True, arm_note='RECORD: main\'s share is printed for the ledger, not judged (the seal-11 first run\'s failure mode)', source='|barsoff_rel(default) − barsoff_rel(?venue=off)|', **LG)
    # ---- ORDER-LIGHT-9 Q3/Q4: per-table ball rows as OUTPUTS on every table that carries a grid (record rows)
    ALL_TABLES = ['wpa_generic_9ft', 'wpa_spec_9ft', 'diamond_redlabel_9ft', 'diamond_proam_9ft', 'predator_apex_9ft', 'wpbsa_snooker_12ft', 'umb_carom_284', 'chinese8_pro_9ft', 'joy_q8_9ft', 'pool_pro_9ft_measured']
    for look in ('default', 'sp'):
        for tb in ALL_TABLES:
            TB = dict(table=tb, look=look, pose='cueball_level', record=True, arm=False, provenance='OUTPUT (uGiIrr 1, derived occlusion, resting blocks filled)')
            b = bands['under']
            row(id=f'BALL-{tb}-{look}-under', symptom=f'Q3 output: {tb} cue ball under/crown at the register pose', quantity='ratio:ball0_under_over_crown_disp', op='band', target=b['target'], pm=b['pm'], band=b,
                source='the arena-class under/crown envelope as the reference (a pool-arena band; snooker / carom read against it for scale only)', **TB)
            row(id=f'BALL-{tb}-{look}-crownsat', symptom=f'Q3 output: {tb} cue ball crown saturation (clip) at the register pose', quantity='ball:0:crown_sat', op='<=', target=0.15, pm=0.0,
                source='the #638 crown threshold as the reference; a clipping table is REPORTED (ORDER-LIGHT-9 Q3: no multiplier re-introduced)', **TB)
    # ---- ORDER-LIGHT-7 R-A energy accounting in the RENDER: the baked per-ball SH (uGiIrr 2.0) switched off in one boot
    # (bakeoff poke) — its rendered share of the ball rows is the difference to the judged/output rows. RECORD.
    for look in ('default', 'sp'):
        BK = dict(table='predator_apex_9ft@bakeoff', look=look, reads_from='scope', record=True, arm=False, provenance='OUTPUT (baked ball SH off: uGiIrr = 0)')
        b = bands['under']
        row(id=f'BAKE-{look}-under', symptom='R-A: cue ball under/crown with the baked ball SH OFF', pose='cueball_level', quantity='ratio:ball0_under_over_crown_disp', op='band', target=b['target'], pm=b['pm'], band=b, source="the bake's rendered share of the underside = P638-terminator − this row", **BK)
        b = bands['equator']
        row(id=f'BAKE-{look}-equator', symptom='R-A: cue ball equator/crown with the baked ball SH OFF', pose='cueball_level', quantity='ratio:ball0_eq_over_crown_disp', op='band', target=b['target'], pm=b['pm'], band=b, source="the bake's rendered share at the equator = P638-equator − this row", **BK)
    # ---- GH-996 (card 45 r4, owner pick 2026-10-14: option A, snooker included): the ball diffuse knee (shading.js BALL_KNEE_*,
    # T = 1.6·b, M = 2.0·b). Every read is the cue ball's PRE-knee crown under ?ballKneeDebug=diffuse at b = 1: crown_maxch = the max
    # over the crown band (n_y > 0.55) of the per-pixel max channel on the scene-linear HDR (lighting-render-reads.py), the quantity
    # the knee compares with T. (a) The canopy is never compressed: under T on the WPA-spec, metal-rim, chinese8 and carom tables
    # (card 45: 1.21–1.41); arm = the 12-ft snooker canopy in the same set (~6.5 — compressed by the owner's pick). (b) Every other
    # measured lamp is RATCHETED at its pinned pre-knee crown (fixtures/lighting-ballknee-pin.json: three boots, pm = max(3 × spread,
    # 1 % of the value)): a lamp brightened under the knee keeps the clip census green but flattens the crown — this row sees it;
    # arm = the same cell with every lamp ×1.1 (the gain11 sub-run). (c) Programs: the knee is compiled on every lit ball program of
    # the venue boot (arm: the ?venue=off set — main's ball text), and the debug read on every lit ball program of each knee set.
    # the knee's thresholds are READ from the tree (the GI window precedent above): a T0 / M0 edit moves the rows with it, and an unreadable
    # constant refuses the spec
    mk = re.search(r'const BALL_KNEE_T0 = ([0-9.]+), BALL_KNEE_M0 = ([0-9.]+);', open(os.path.join(_HERE, '..', '..', 'web', 'scene', 'shading.js')).read())
    if not mk: raise SystemExit('[gate-spec] cannot read BALL_KNEE_T0 / BALL_KNEE_M0 from web/scene/shading.js')
    KNEE_T0, KNEE_M0 = float(mk.group(1)), float(mk.group(2))
    KNEE_CANOPY = ('wpa_spec_9ft', 'predator_apex_9ft', 'chinese8_pro_9ft', 'umb_carom_284')
    KNEE_SETS = (('kneecanopy', 'wpa_spec_9ft'), ('kneering', 'wpa_spec_9ft'), ('kneependant', 'wpa_spec_9ft'),
                 ('kneesnookerlum', 'wpbsa_snooker_12ft'), ('kneecaromlum', 'umb_carom_284'), ('kneeauto', 'predator_apex_9ft'))
    knee_pin_path = os.path.join(HERE, 'fixtures', 'lighting-ballknee-pin.json')
    knee_pin = json.load(open(knee_pin_path)) if os.path.exists(knee_pin_path) else None
    # the pin's presence is itself judged (fail-closed): without it the KNEE-pre rows below would not exist and C2 (b) would read green by omission
    row(id='KNEE-pre-pin-present', symptom='GH-996 C2 (b): the ballknee pin exists with three boots (an absent pin is a missing read: FAIL)',
        table='fixture', look='default', pose=None, quantity='fixture:ballknee-pin:boots', op='>=', target=3, pm=0, arm=False,
        arm_note='a fixture read: an absent pin or field is a missing read, which fails every operator (fail-closed)', provenance='DERIVED',
        source='tools/render/fixtures/lighting-ballknee-pin.json boots')
    for lk in ('default', 'sp'):
        for tb in KNEE_CANOPY:
            row(id=f'KNEE-canopy-{tb}-{lk}', symptom=f'GH-996 C2 (a): the canopy is never compressed by the ball knee — the cue ball\'s pre-knee crown stays under T = {KNEE_T0:g} (b = 1, BALL_KNEE_T0 read from shading.js)',
                table=tb, look=lk, pose='cueball_level', quantity='ball:0:crown_maxch', op='<', target=KNEE_T0, pm=0.0, reads_from='kneecanopy',
                arm=True, arm_from='kneecanopy', arm_table='wpbsa_snooker_12ft', provenance='AUTHORED (card 45 r4, owner pick A: T = 1.6·b)',
                source='crown_maxch under ?fixture=canopy_panel&ballKneeDebug=diffuse; arm = the 12-ft snooker canopy in the same set (compressed by the owner\'s pick)')
            # the knee-on output: the shipped canopy crown equals its ?ballKnee=off twin (identity under T; a knee that compressed below T,
            # or a threshold that moved, reads < 1 here)
            row(id=f'KNEE-canopy-identity-{tb}-{lk}', symptom='GH-996 C2 (a): the shipped canopy crown (knee on) equals the same boot with the knee off — the knee leaves the canopy alone',
                table=tb, look=lk, pose='cueball_level', quantity='relset:kneecanopynk:ball:0:crown_Y', op='band', target=1.0, pm=0.002, reads_from='kneecanopyon',
                arm=True, arm_from='kneecanopyon', arm_table='wpbsa_snooker_12ft', provenance='DERIVED',
                source='crown_Y (knee on) / crown_Y (?ballKnee=off), cueball_level, ball 0; arm = the snooker canopy (the knee compresses it: < 1)')
        for key, cell in sorted(((knee_pin or {}).get('cells') or {}).items()):
            c_ = cell.get(lk)
            if not c_: continue
            tb, fx = key.split('@', 1)
            row(id=f'KNEE-pre-{fx}-{tb}-{lk}', symptom=f'GH-996 C2 (b): the pre-knee crown under {fx} stays at its pinned value (a brightened lamp would hide under the knee: the clip census stays green, the crown flattens)',
                table=tb, look=lk, pose='cueball_level', quantity='ball:0:crown_maxch', op='<=', target=c_['value'], pm=c_['pm'], reads_from=cell['set'],
                arm=True, arm_from=cell['set'], arm_table=f'{tb}@gain11', provenance='PINNED (fixtures/lighting-ballknee-pin.json)',
                source=f"crown_maxch under {fx} (?ballKneeDebug=diffuse); pin {c_['value']} = max of {len(c_.get('reads', []))} boots {c_.get('reads')}, pm = max(3 × spread, 1 %); arm = the gain11 sub-run (every lamp ×1.1)")
        # the armed thresholds the lighting leaf reported (state().ballKnee, carried by the census): T0 / M0 at b = 1; arm = the gain11 sub-run (b 1.1)
        for fld, want in (('T', KNEE_T0), ('M', KNEE_M0)):
            row(id=f'KNEE-runtime-{fld}-{lk}', symptom=f'GH-996: the lighting leaf arms the ball knee at {fld} = {want:g}·b (b = 1 on a scripted boot) — a broken slider wiring or a stale threshold reads RED',
                table='predator_apex_9ft', look=lk, pose=None, quantity=f'census:ballKnee:{fld}', op='band', target=want, pm=1e-6, reads_from='kneecanopy',
                arm=True, arm_from='kneecanopy', arm_table='predator_apex_9ft@gain11', provenance='DERIVED',
                source=f'__lighting.state().ballKnee.{fld} (shading.js ballKneeState) in the capture census; arm = the gain11 sub-run (brightness 1.1)')
        row(id=f'KNEE-programs-count-{lk}', symptom='GH-996 C2 (c): the venue boot compiles the ball knee at all (a census with no lit ball program cannot read 0 missing and pass)',
            table='predator_apex_9ft', look=lk, pose=None, quantity='programs:ball:ballKnee', op='>=', target=1, pm=0,
            arm=True, arm_from='off', provenance='DERIVED', source='ball programs carrying OB-BK; arm = the ?venue=off set (none)')
        row(id=f'KNEE-programs-{lk}', symptom='GH-996 C2 (c): the ball knee is compiled on every lit ball program of the venue boot (none missing)',
            table='predator_apex_9ft', look=lk, pose=None, quantity='programs:ball:ballKneeMissing', op='<=', target=0, pm=0,
            arm=True, arm_from='off', provenance='DERIVED', source='lit ball programs without the OB-BK knee splice (programs census); arm = the ?venue=off set: main\'s ball text, every lit program missing')
        for setn, tb in KNEE_SETS:
            row(id=f'KNEE-debug-count-{setn}-{lk}', symptom='GH-996 C2 (c): the knee set compiles the pre-knee debug read at all (none counted cannot pass as 0 missing)',
                table=tb, look=lk, pose=None, quantity='programs:ball:ballKneeDebug', op='>=', target=1, pm=0, reads_from=setn,
                arm=True, arm_from='after', provenance='DERIVED', source='ball programs carrying the OB-BK knee-debug line; arm = the shipped boot (none)')
            row(id=f'KNEE-debug-compiled-{setn}-{lk}', symptom='GH-996 C2 (c): the pre-knee debug read is compiled on every lit ball program of the knee set (a silently ignored ?ballKneeDebug would read after-knee pixels)',
                table=tb, look=lk, pose=None, quantity='programs:ball:ballKneeDebugMissing', op='<=', target=0, pm=0, reads_from=setn,
                arm=True, arm_from='after', provenance='DERIVED', source='lit ball programs without the OB-BK knee-debug line (programs census); arm = the shipped boot (no debug read)')
    # (d) the shipped GRID-OFF frames, JUDGED. uGiOn 0 is the SHIPPED path under the fixtures a table's bake class does not carry (the
    # top-level perimeter_ring / pendant_bar / snooker_luminaire are unbaked; the snooker, carom and chinese8 classes bake only their own
    # luminaire) and the degraded path under a baked one (a failed GI load, ?nogi). Per shipped cell (knee on) and its ?ballKnee=off twin:
    #   sat   the disc clip (disc_sat at cueball_level, the card-45 census measure) within the card-45 bar of its class at b = 1; arm = the
    #         twin (the knee absent: the blown disc) — declared unarmed where the twin itself sits inside the bar (the canopy grid-off cells);
    #   acts  the knee acts: the shipped crown is below the twin's (relset < 0.999); arm = the twin over itself (1); a knee gated on uGiOn
    #         reads the same RED;
    #   under the under band (far below T) equals the twin's within 0.002 (the knee leaves un-engaged pixels alone).
    GIOFF = (('pendant', 'pendantnk', 'wpa_spec_9ft', ('default',), True), ('pendant', 'pendantnk', 'predator_apex_9ft', ('default',), True),
             ('snookerpendant', 'snookerpendantnk', 'wpbsa_snooker_12ft', ('default', 'sp'), True),
             ('pdtring', 'pdtringnk', 'predator_apex_9ft', ('default', 'sp'), True),
             ('nogi', 'nogink', 'wpa_spec_9ft', ('default', 'sp'), False), ('nogi', 'nogink', 'predator_apex_9ft', ('default', 'sp'), False),
             ('gifail', 'gifailnk', 'wpa_spec_9ft', ('default', 'sp'), False), ('gifail', 'gifailnk', 'predator_apex_9ft', ('default', 'sp'), False))
    for shipped, twin, tb, lks, sat_armed in GIOFF:
        bar = 0.09 if tb == 'wpbsa_snooker_12ft' else 0.07
        for lk in lks:
            arm_sat = dict(arm=True, arm_from=twin) if sat_armed else dict(arm=False, arm_note=f'the knee-off twin ({twin}) itself sits inside the bar on this grid-off canopy cell, so no arm can fire through it; the knee\'s presence here is judged by KNEE-gioff-acts')
            row(id=f'KNEE-gioff-sat-{shipped}-{tb}-{lk}', symptom=f'GH-996: the shipped grid-off cue ball ({shipped}, knee on) keeps its disc clip within the card-45 bar {bar} (b = 1)',
                table=tb, look=lk, pose='cueball_level', quantity='ball:0:disc_sat', op='<=', target=bar, pm=0.0, reads_from=shipped, **arm_sat,
                provenance='AUTHORED (card 45 r4 bars, other 0.07 / snooker 0.09 at b <= 1)',
                source=f'disc_sat (share of disc pixels with a channel >= 250) at cueball_level; arm = the ?ballKnee=off twin ({twin})')
            row(id=f'KNEE-gioff-acts-{shipped}-{tb}-{lk}', symptom='GH-996: the knee acts on the shipped grid-off crown (below its knee-off twin) — a knee gated on uGiOn, or off, reads 1',
                table=tb, look=lk, pose='cueball_level', quantity=f'relset:{twin}:ball:0:crown_Y', op='<', target=1.0, pm=0.001, reads_from=shipped,
                arm=True, arm_from=twin, provenance='DERIVED', source=f'crown_Y (knee on) / crown_Y ({twin}: ?ballKnee=off), cueball_level, ball 0; arm = the twin over itself (exactly 1)')
            row(id=f'KNEE-gioff-under-{shipped}-{tb}-{lk}', symptom='GH-996: the shipped grid-off under band (far below T) equals its knee-off twin — the knee leaves un-engaged pixels alone',
                table=tb, look=lk, pose='cueball_level', quantity=f'relset:{twin}:ball:0:under_Y', op='band', target=1.0, pm=0.002, reads_from=shipped,
                arm=False, arm_note='identity law, no shipped plant reaches it; the same law carries a real arm on the canopy (KNEE-canopy-identity: the snooker canopy)',
                provenance='DERIVED', source=f'under_Y (knee on) / under_Y ({twin}: ?ballKnee=off), cueball_level, ball 0')
    spec = {'band_rule': BR, 'generated_by': 'tools/render/lighting-gate-spec.py', 'bands': bands, 'rows': rows,
            'probe_pin': {'present': bool(pins), 'sha': (pins or {}).get('sha')},
            'ballknee_pin': {'present': bool(knee_pin), 'sha': (knee_pin or {}).get('sha')}}
    bad = check_plan_keys(rows, seal_plan(a.seal))
    if bad:
        print('[gate-spec] PLAN-KEY REFUSAL — ' + str(len(bad)) + ' row(s) name a dataset key the seal plan does not produce (poke label ≠ set name?):'); [print('  ' + b) for b in bad]
        raise SystemExit(7)
    print(f'[gate-spec] plan keys: every armed row resolves to a read key the seal plan produces ({len(rows)} rows, {len(seal_plan(a.seal))} sets)')
    json.dump(spec, open(a.out, 'w'), indent=1)
    print(f"{len(rows)} rows → {a.out}")
    for k, b in bands.items():
        if 'lo' in b:
            st = b.get('strict')
            print(f"  band {k:10s} [{b['lo']}, {b['hi']}] target {b['target']} ± {b['pm']} (mean {b['mean']}, scatter {b['scatter']}, n {b['n_admissible']}+{b['n_inadmissible']} inadm; strict {(str(st['lo']) + '–' + str(st['hi'])) if st else 'single read'})")
        else:
            print(f"  bound {k:9s} ≤ {b['hi']} (from {b['n_bounds']} clipped-reference upper bounds; values {b['strict']['lo']}–{b['strict']['hi']})")


if __name__ == '__main__':
    main()
