#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""R3-SNK-BODY-1/2 — export the XW101 (wpbsa_snooker_12ft) ball-return SLIDES in schema
openbilliards/ball-return-track/1 at its 1.1 form (topology `terminal-chutes`, sealed by the
ballreturn lane at e6428cf3; docs/geometry/ball-return-track.schema.json is that file, copied
read-only per ORDER-CRAFT-R3-SNK-BODY1 ADDENDUM 3 and the BODY-2 seal note).

Every dimensioned number is the SAME read web/scene/table.js SNK_SLIDE carries (PHOTO /
MFR / MODEL / DERIVED, bands in the report §R3c.23.3); nothing here is authored. Frame
TCS-TBL-01: X head->foot, Y up from the playing surface, Z left->right from the head
rail, mm.

Schema 1.1 (ruling R1 of ORDER-CRAFT-R3-BODY2): the Star has six TERMINAL four-wire chutes
and no trunk or tray. Each served pocket's route is ONE runway of role `chute` (next null)
whose FIRST vertex is the landing station and whose `stop` (kind clamp: the strap-hung
brass clamp with the up-turned wire stop) sits at the arclength of the runway polyline's
LOWEST vertex — the drain's end (SNK-R34, review r8 P2: the clamp corner's continuous foot
lies past that vertex, on the up-turn, and a face there left a rising partial edge before the
stop while checks.drain_monotonic claimed true); the up-turn beyond it is the stop's own body
(≤ one ball diameter, V6). Capacity = floor(wall_s / 52.5) by the schema identity. The 1.0
form (six terminal runways under a one-tray rule, refused V2) is superseded by this emission;
the geometry did not move.

The schema's drain law (checks.drain_monotonic: every edge before the stop drives the reference
ball, k·g·sinθ > k·g·(7/5)(r/ρ)·u_r·cosθ) is MEASURED here, the validator's arithmetic mirrored
(web/scene/ballreturn/schema.js V7 + track.js supportDerived / resistCoeff at the ballreturn
lane's 1c6edc3b), on the rounded points the file carries; a failing edge REFUSES the export
(stderr, exit 2, nothing written).
  python3 tools/render/export-ballreturn-track-489.py [<out.json>] [--arm rise]
    --arm rise   inject a +0.5 mm rise into the edge before p1-chute's stop so the refusal fires
                 by measurement (nothing is written under any arm)
"""
import json, math, sys, hashlib, subprocess, os
# argv: [<out.json>] [--arm rise]; an unknown option, arm or a second path is refused by name (exit 2)
ARGS = sys.argv[1:]; ARM = None; POS = []
_i = 0
while _i < len(ARGS):
    _a = ARGS[_i]
    if _a == '--arm':
        if _i + 1 >= len(ARGS) or ARGS[_i + 1].startswith('--'): print('[export] REFUSED — --arm needs a name (known: rise)', file=sys.stderr); sys.exit(2)
        ARM = ARGS[_i + 1]; _i += 2; continue
    if _a.startswith('--'): print(f'[export] REFUSED — unknown option {_a} (known: --arm rise)', file=sys.stderr); sys.exit(2)
    POS.append(_a); _i += 1
if ARM not in (None, 'rise'): print(f"[export] REFUSED — unknown arm '{ARM}' (known: rise)", file=sys.stderr); sys.exit(2)
if len(POS) > 1: print(f'[export] REFUSED — one output path at most, got {POS}', file=sys.stderr); sys.exit(2)
OUT = POS[0] if POS else 'docs/geometry/tracks/wpbsa_snooker_12ft-xw101-slides.json'
RAIL_TOP = 40.18            # MODEL (SNK_RAIL_TOP): capping top above the bed
BALL = 52.5                 # MFR WPBSA Section 1 Rule 2
# --- SNK_SLIDE reads (table.js), mm under the rail top unless stated ---
RING_BELOW, RING_R, RING_TUBE = 162.0, 44.0, 4.0     # PHOTO SE ±15 / OD 88 ±12 / the top ring's tube class
CLAMP_BELOW = 340.0                                  # PHOTO SE ±15
RUN_SHORT, RUN_LONG, RUN_MID = 276.0, 453.0, 280.0   # PHOTO SE ±20 / ±25 / ±20 (MTC 243–464 class)
SHORT_AT = {-1: -1, 1: 1}                            # side law, PHOTO MEDIUM (two studio tables + MTC; C2 symmetric)
WIRE_R, GAUGE, LEVEL_GAP, STOP_RISE = 3.75, 28.0, 15.0, 15.0   # OPEN 6–9 → 7.5 / OPEN ±30 % / DERIVED / DERIVED (= level gap)
STRAP_TOP_BELOW = 129.0                              # PHOTO: the recess step (SNK.railBandBot); strap top 126 ±12 reads the same station
HEM_BELOW = 132.0                                    # PHOTO ±15: the leather hem = the LOWEST SOLID of the pocket assembly (the bag is cord)
ENTRY_ALONG = 30.0                                   # DERIVED: the landing station 30 mm down the chute from the cup — 3.6 mm INTO the 30 mm ring lead (x0 = 26.4); inside the kernel cup radius (schema 1.1 V5 admits the cup for ring/bag systems) — the geometry is the built wire, not tuned
# pocket cups (scene x, z) = TCS (X, Z); kernel order 0 lb, 1 lc, 2 lt, 3 rb, 4 rc, 5 rt
# POCKETS = the chute origins, read from the BUILDER's dump below (SNK-R33) — the render hangs ring, wires and clamp
# from snookerFallCtx's cups (the plate axis, ruling SNK-R25); the r2 export had re-typed the corner cups 19.7 mm inboard
# on both axes ((-1832.12, -936.62) vs the built (-1812.42, -916.92)) — the S-SHIELD-BIND row's standing red.
FALL_R = {True: 88.9, False: 53.19}                  # table.js pocketFallDiscs radii (corner kernel disc 88.9 / middle 53.19; informational in the notes); pocketVisualFalls reads 42.08 / 53.19 and the validator's V5 (42.1 / 49.6 about the fall centre) is its own law
yRing = RAIL_TOP - RING_BELOW                        # −121.82
yClamp = RAIL_TOP - CLAMP_BELOW                      # −299.82
yHem = RAIL_TOP - HEM_BELOW                          # −91.82
h_ball_typed = math.sqrt((BALL / 2 + WIRE_R) ** 2 - (GAUGE / 2) ** 2)   # the seat from the re-typed inputs — checked against the builder's hSeat below, never used
# ---- GH-489 SNK-R33 (review r7 P2 B): the support polyline is GENERATED FROM THE BUILDER, never re-typed ----
# web/scene/table.js snkSlideChutes (the one construction the scene renders) is dumped by
# tools/render/dump-slide-chutes-489.mjs: per pocket the four wires' breakpoints and their 49-point spaced
# centrelines (the TubeGeometry's own 48 segments), millimetres, the scene frame = TCS (X, Y, Z). The runway
# polyline below is the LOWER PAIR's midline at those 49 stations from the entry station to the stop's tip —
# every breakpoint the builder uses (P1 at the lead's end, the SNK-R31 bend) is on it. The first cut joined the
# entry straight to P2 and skipped P1 (middle chute: X −56.4, exported Y −148.88 vs the builder's −133.57 =
# 15.31 mm), so the S-BOARD census sampled a path the wires do not follow and the stop / hanger arclengths
# were understated.
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHUTES = json.loads(subprocess.check_output(['node', os.path.join(REPO, 'tools/render/dump-slide-chutes-489.mjs'), 'wpbsa_snooker_12ft'], cwd=REPO))['chutes']
CHUTE = {c['index']: c for c in CHUTES}
POCKETS = {c['index']: (c['cup'][0], c['cup'][1]) for c in CHUTES}
# the frame check (scene = TCS): the middles sit at X 0 on the long rails' Z, the corners beyond |X| 1000
assert all(abs(X) < 0.01 and abs(abs(Z) - 940.59) < 0.02 for i, (X, Z) in POCKETS.items() if i in (1, 4)), POCKETS
assert all(abs(X) > 1000 for i, (X, Z) in POCKETS.items() if i not in (1, 4)), POCKETS
# the seat (ball-centre height over the lower pair's midline, normal to the leg) is the BUILDER's number (refuter 1 of
# §R3c.39: the re-typed BALL/WIRE_R/GAUGE must not drive a published value); the re-typed formula is only checked against it
h_ball = CHUTES[0]['hSeat']
assert all(abs(ch['hSeat'] - h_ball) < 1e-6 for ch in CHUTES) and abs(h_ball - h_ball_typed) < 5e-4, (h_ball, h_ball_typed)   # the dump carries 4 decimals of a mm
def lower_midline(ch):
    lo = [w for w in ch['wires'] if w['lvl'] == 0]
    A, B = lo[0]['centreline'], lo[1]['centreline']
    return [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] for a, b in zip(A, B)]
def along(poly):
    s = [0.0]
    for i in range(1, len(poly)):
        s.append(s[-1] + math.dist(poly[i - 1], poly[i]))
    return s
def foot_s(P, poly, S, n_seg):
    """(distance, arclength) of the continuous foot of the in-plane point P (x, y) on the first n_seg segments of poly."""
    best = None
    for i in range(1, n_seg + 1):
        a, b = poly[i - 1][:2], poly[i][:2]
        ex, ey = b[0] - a[0], b[1] - a[1]; el2 = ex * ex + ey * ey or 1e-30
        t = max(0.0, min(1.0, ((P[0] - a[0]) * ex + (P[1] - a[1]) * ey) / el2))
        d = math.hypot(P[0] - a[0] - t * ex, P[1] - a[1] - t * ey)
        if best is None or d < best[0]: best = (d, S[i - 1] + t * (S[i] - S[i - 1]))
    return best
# ---- SNK-R34 (review r8 P2, class B): the schema's drain law, the validator's arithmetic mirrored ----
# web/scene/ballreturn/schema.js V7 (ballreturn lane 1c6edc3b lines 259-273) over track.js supportDerived (66-74) and
# resistCoeff (913): r = ball/2, half = gauge/2, r_w = rail/2; c = half·r/(r + r_w); ρ = sqrt(r² - c²);
# k = 1/(1 + 0.4 (r/ρ)²); per edge t = the unit chord, sinθ = -t_y (down positive), cosθ = sqrt(1 - t_y²);
# drive = k·G·sinθ, resist = k·G·(7/5)(r/ρ)·u_r·cosθ; the edge drains iff drive > resist. G = 9.8 (track.js SINK_G
# mirror; it cancels in the inequality and is kept so the margins read as the validator's). The validator judges every
# edge whose START lies before wallS - 1 mm (schema.js:265 — "within the 1 mm grain the station is quoted at") and
# exempts the rest as the stop's body; the same grain here, on the exact wall_s (the export quotes it at 0.1 mm), so a
# partial edge to the face is judged on its part up to the face. No number below is authored: u_r is the JSON's own
# rolling_resistance block, the ball / gauge / rail diameter are the values the file carries.
U_R = 0.01                  # = rolling_resistance.u_r below (DERIVED proxy: the kernel default cloth class)
G_SINK = 9.8                # track.js G (sinkpivot.js SINK_G mirror)
DRAIN_GRAIN = 1.0           # mm, schema.js:265 (1 * MM)
def drain_derived(ball, gauge, rail_d):
    r, half, rw = ball / 2, gauge / 2, rail_d / 2
    c = half * r / (r + rw); rho = math.sqrt(r * r - c * c); k_in = 1 / (1 + 0.4 * (r / rho) ** 2)
    return k_in, rho, 1.4 * (r / rho)
def drain_failures(pts, S, wall_s, u_r, ball, gauge, rail_d):
    """The edges before the stop that do not drain: [(edge k — 0-based, the validator's [k] —, rise in mm over the
    judged part, s0, s1, margin m/s²)]; the edge containing wall_s is judged on its part up to the face."""
    k_in, rho, rr = drain_derived(ball, gauge, rail_d); out = []
    for i in range(1, len(pts)):
        s0 = S[i - 1]
        if s0 >= wall_s - DRAIN_GRAIN: break
        dx, dy, dz = (pts[i][j] - pts[i - 1][j] for j in range(3)); L = math.sqrt(dx * dx + dy * dy + dz * dz)
        ty = dy / L; sin_t = -ty; cos_t = math.sqrt(max(0.0, 1 - ty * ty))
        margin = k_in * G_SINK * sin_t - k_in * G_SINK * rr * u_r * cos_t
        if not margin > 0:
            s1 = min(S[i], wall_s)
            out.append((i - 1, dy * (s1 - s0) / L, s0, s1, margin))
    return out
DRAIN_FAILS = []
GUIDE_NOTE = (f"; the UPPER guide pair (not a support) sits {LEVEL_GAP:.0f} above at a lateral half-spacing of {CHUTE[1]['upperHalf']:.2f} mm — DERIVED (SNK-R33): the least half-spacing at which a ball riding the lower pair clears both guide wires over its whole reachable domain (the entry pivot over the wire ends under the ring, the lead's offset line, the arc over the convex P1 corner, the slope's offset line, the rest against the wire tips — the up-turned stop is too short for a two-leg rest, and the bend's own offset curve is unreachable for a 26 mm ball), sqrt((R + r_w)^2 - dxyMin^2) with the limiting piece '{CHUTE[1]['census']['limit']}' (dxyMin {CHUTE[1]['dxyMin']:.2f} = hSeat - levelGap: the ball standing on the wire ends, the upper wires starting levelGap above them; R 26.25 MFR, r_w 3.75 OPEN, gauge 28 OPEN, level gap 15 DERIVED, bend 3 r_w OPEN; table.js snkSlideWires / snkChuteCensus; the rest = '{CHUTE[1]['census']['stop']}' stop on every chute)")
runways, pockets, hooks = [], [], []
for idx, (X, Z) in POCKETS.items():
    zs = 1 if Z > 0 else -1; short_at = SHORT_AT[zs]; corner = abs(X) > 1
    ch = CHUTE[idx]; dirx = ch['dirx']; run = ch['run']
    assert (run == RUN_MID and not corner) or corner, idx
    mid = lower_midline(ch)                       # the built lower pair's midline, 49 stations
    P1 = ch['wires'][0]['breakpoints']['P1']; P2 = ch['wires'][0]['breakpoints']['P2']; P3 = ch['wires'][0]['breakpoints']['P3']
    xEnd = ch['xEnd']
    # entry station: ENTRY_ALONG (30) mm down the chute from the ring centre, ON the built midline (interpolated
    # between the two stations that bracket it along x; the midline is monotonic in x)
    xe = X + dirx * ENTRY_ALONG
    ei = next(i for i in range(1, len(mid)) if (mid[i][0] - xe) * dirx >= 0)
    t = (xe - mid[ei - 1][0]) / (mid[ei][0] - mid[ei - 1][0])
    entry = [xe, mid[ei - 1][1] + t * (mid[ei][1] - mid[ei - 1][1]), Z]
    ye = entry[1]
    # the runway polyline = the entry + every built station beyond it (to the stop's tip P3)
    poly = [entry] + [[q[0], q[1], Z] for q in mid[ei:]]
    pid = f"p{idx}-chute"
    # --arm rise (SNK-R34): +0.5 mm of rise injected into the edge before p1-chute's stop, BEFORE the face is placed and
    # the drain is measured — the refusal below must fire on it by measurement; nothing is written under an arm
    if ARM == 'rise' and idx == 1:
        j0 = min(range(len(poly)), key=lambda i: (poly[i][1], i))
        poly[j0 - 1][1] = poly[j0 - 2][1] + 0.5
    # the stop face = the arclength of the polyline's LOWEST vertex (first occurrence on ties): the drain's end — every
    # edge before it is judged below, everything beyond it is the stop's body (exempt, V6 ≤ one ball diameter). Placed on
    # the ROUNDED points the file carries (the validator rebuilds its edges from those). SNK-R34 (review r8 P2): the
    # SNK-R33 face was the CONTINUOUS foot of the clamp corner P2, which on all six chutes lies past the lowest vertex on
    # the up-turn (p1: foot 292.94 vs lowest 290.82), so the last partial edge to the stop ROSE (0.414 mm on p1) while
    # checks.drain_monotonic claimed true. The foot is still measured, for the notes.
    pts = [[round(q[0], 2), round(q[1], 2), round(q[2], 2)] for q in poly]
    S = along(pts)
    jlow = min(range(len(pts)), key=lambda i: (pts[i][1], i))
    wall_s = S[jlow]; body = S[-1] - wall_s
    foot_p2 = foot_s(P2, poly, along(poly), len(poly) - 1)
    assert body <= BALL + 1.0, (idx, body)
    assert jlow >= 2 and foot_p2[1] >= wall_s, (idx, jlow, foot_p2, wall_s)
    # the drain law over every edge before the face (the JSON's own u_r, ball, gauge, rail diameter)
    for k_edge, rise, s0, s1, margin in drain_failures(pts, S, wall_s, U_R, BALL, GAUGE, 2 * WIRE_R):
        DRAIN_FAILS.append((pid, k_edge, rise, s0, s1, margin))
    # the first ball's ACTUAL rest (the builder's census: the ball centre resting against the up-turned wire tips, its
    # support contact on the slope = the centre's foot on the polyline before the face) vs the schema convention that
    # the first ball rests one radius before the face (contact at wall_s - r) — DERIVED, stated in the notes
    rest = ch['census']['rest']
    rest_foot = foot_s((rest[0], rest[1]), poly, along(poly), jlow)
    assert ARM or abs(rest_foot[0] - h_ball) < 0.01, (idx, rest_foot, h_ball)     # the centre sits at the seat height over the (unperturbed) slope
    rest_past = rest_foot[1] - (wall_s - BALL / 2)
    runways.append({'id': pid, 'role': 'chute', 'points_mm': pts, 'next': None,
        'notes': (f"one of SIX independent four-wire chutes (two levels × two; the ball rides the lower pair). Points = the BUILT lower pair's midline (web/scene/table.js snkSlideChutes via dump-slide-chutes-489.mjs) at its 49 stations from the landing station: the ring lead (P1 at {P1[0]:.1f}, {P1[1]:.2f}), the slope, the tangent-continuous bend at the clamp corner ({P2[0]:.1f}, {P2[1]:.2f}), the up-turn to {P3[0]:.1f}, {P3[1]:.2f}. Under pocket {idx}, "
                  f"running {'+X' if dirx > 0 else '−X'} along the long rail's underside for {run:.0f} mm (side law: {'SHORT' if run == RUN_SHORT else 'LONG' if run == RUN_LONG else 'MIDDLE, pointing at the short corner chute'}); "
                  f"ring centre at Y {yRing:.1f} (162 under the rail top), clamp low point Y {yClamp:.1f} (340), up-turned wire stop {STOP_RISE:.0f} up. "
                  f"First vertex = the landing station {ENTRY_ALONG:.0f} mm down the chute (DERIVED; inside the kernel cup radius {FALL_R[corner]}, schema 1.1 V5); "
                  f"the stop face is at arclength s {wall_s:.1f} = the polyline's LOWEST vertex, the drain's end (SNK-R34: the clamp corner's continuous foot lies {foot_p2[1] - wall_s:.2f} mm further along, on the up-turn — a face there left a rising partial edge before the stop); the {body:.1f} mm beyond it is the up-turn (the stop's body, exempt from the drain law). "
                  f"The first ball's actual rest against the wire tips (the builder's census, stop '{ch['census']['stop']}') puts its slope contact at s {rest_foot[1]:.1f}, {rest_past:.1f} mm past the one-radius-before-the-face convention (s {wall_s - BALL / 2:.1f}) — DERIVED from census.rest and hSeat."),
        'stop': {'kind': 'clamp', 'wall_s_mm': round(wall_s, 1), 'capacity_balls': int(wall_s // BALL),
                 'provenance': {'tag': 'PHOTO', 'source': 'official side elevation: the strap-hung brass clamp with the up-turned wire stop at the chute end (clamp low point 340 ±15 under the rail top; runs 276 ±20 / 453 ±25 / 280 ±20); capacity = floor(wall_s / 52.5) by the schema identity'}},
        'provenance': {'tag': 'PHOTO', 'source': 'official side elevation 01-official/official-xw101-side-elevation.png at 3.68 mm/px (plank-cap anchor 3850 mm): ring 162 ±15, clamp 340 ±15, runs 276 ±20 / 453 ±25 / 280 ±20; side law from xp-505073 + the MTC/Masters closeups (MEDIUM); measure-track REPORT.md + verify-track VERDICT.md'}})
    ball_top_at_entry = ye + h_ball + BALL / 2
    exit_below = math.ceil(ball_top_at_entry * 10) / 10          # DERIVED: the queued ball's top at the entry station (V5 identity)
    pockets.append({'index': idx, 'entry_runway': pid, 'exit_below_y_mm': exit_below,
        'notes': (f"exit_below_y is DERIVED as the ball's TOP at the entry station ({ball_top_at_entry:.1f}: wire line {ye:.1f} + centre offset h {h_ball:.1f} + r 26.25), "
                  f"not the hem: the XW101's lowest OPAQUE solid is the leather hem at {yHem:.1f} (PHOTO 132 ±15 under the rail top), but the bag below it is cord and "
                  f"the slide ring is open, so a ball queued at the ring station stands with its top {ball_top_at_entry - yHem:.1f} mm ABOVE the hem — visible through the "
                  f"net in reality. The schema's cup-floor premise (ball hidden until its top clears the lowest solid) does not fit an open funnel; the value used is the "
                  f"one that re-shows the ball exactly where it lands on the wires, and it satisfies the cull line (≤ −55)."),
        'provenance': {'tag': 'DERIVED', 'source': f'ball top at the entry station = y_wire(entry) + sqrt((r + r_w)² − (g/2)²) + r over PHOTO ring 162 / clamp 340 / run {run:.0f} and OPEN gauge 28 / wire 7.5; hem −91.8 PHOTO for the comparison'}})
    # the strap (the chute's suspension) at the clamp end — the schema's hanger station
    s_clamp = wall_s
    hooks.append({'id': f'p{idx}-strap', 'runway': pid, 's_mm': round(s_clamp, 1), 'kind': 'leather strap from the recess step to the brass clamp (32 × 3.5)',
        'provenance': {'tag': 'PHOTO', 'source': f'official side elevation: strap top 126 ±12 under the rail top (built at the step 129), clamp low point 340 ±15; the eight gold hooks are NOT hangers (see doc.notes)'}})

doc = {
 'schema': 'openbilliards/ball-return-track/1',
 'doc': {'table_id': 'wpbsa_snooker_12ft',
   'title': 'XW101 / S101 ball-return SLIDES (加长 4 轨钢丝滑道): six independent four-wire chutes, one per pocket',
   'status': 'PROPOSAL', 'revision': 'r4 (SNK-R34: the stop face at the runway polyline\'s lowest vertex — the drain\'s end — and the drain law measured at export; SNK-R33: the runway polyline generated from the builder; the upper guide pair at the derived half-spacing)', 'date': '2026-09-10', 'issue': '#489 (ORDER-CRAFT-R3-SNK-BODY1 ADDENDUM 2/3; ORDER-CRAFT-R3-BODY2 R1)',
   'sources': ['dossier-star-xw101/01-official/xpshop-2026061002300979.png (official spec: 回球 加长 4 轨钢丝滑道 + 金色铜钩 ×8 + 英式比赛金属抽屉 Q235 黑色)',
     'dossier-star-xw101/01-official/official-xw101-side-elevation.png (heights, runs; 3.68 mm/px on the plank-cap ends)',
     'dossier-star-xw101/01-official/xpshop-2025053000505073.jpg (corner chute: 4 wires = 2 levels × 2, up-turned stop)',
     'dossier-star-xw101/01-official/xpshop-2025053000505411.jpg (the black drawer under the END apron: plate 390 ±40 × 68 ±10)',
     'dossier-star-xw101/02-broadcast: masters-table-closeup.jpg, germanmasters-2025-10.jpg (WST tables: chutes + straps + rest hooks; no drawer)',
     'web/scene/table.js SNK_SLIDE + snkSlideChutes (the built geometry; the runway points are its lower-pair midline, dumped by tools/render/dump-slide-chutes-489.mjs)',
     'schema: ballreturn lane e6428cf3 docs/geometry/ball-return-track.schema.json (1.1, terminal-chutes) — copied read-only into docs/geometry/',
     '/tmp/craftr3/body1/measure-track/REPORT.md + verify-track/VERDICT.md (Drive body1 pack)'],
   'notes': ('Schema 1.1 terminal-chutes (ballreturn lane e6428cf3; ORDER-CRAFT-R3-BODY2 ruling R1): the XW101 has SIX terminal four-wire chutes and no trunk or tray — '
             'balls queue in each chute against its strap-hung clamp and each other. One role-chute runway per served pocket with its stop block; no tray. '
             'The eight gold hooks are CUE-REST hooks on the apron faces (PHOTO: rests, spiders and a half-butt hung on them), not runway hangers; the hanger stations '
             'exported under `hooks` are the six leather straps. The black Q235 drawer is a separate ball box under the +X end apron (studio tables; WST arena tables carry none) — '
             'a STUDIO feature, not a collector.')},
 'units': {'length': 'mm', 'angle': 'deg'},
 'datum_frame': {'id': 'TCS-TBL-01', 'axes': {'+X': 'head rail toward foot rail', '+Y': 'up from the playing surface', '+Z': 'left to right viewed from head rail'},
   'runtime_mapping': 'three.js (x, y, z) = (X, Y, Z) x 0.001; kernel (kx, ky, kz) = (Z, X, Y) x 0.001',
   'pocket_order': 'kernel order: 0 lb, 1 lc, 2 lt, 3 rb, 4 rc, 5 rt (l/r = sign of Z, b/c/t = -X / 0 / +X)'},
 'ball': {'reference_diameter_mm': BALL, 'provenance': {'tag': 'MFR', 'source': 'WPBSA Section 1 Rule 2 (52.5 mm)'}},
 'support': {'kind': 'twin-rail', 'gauge_mm': GAUGE, 'rail_diameter_mm': 2 * WIRE_R,
   'provenance': {'tag': 'PHOTO', 'source': 'lower wire pair: gauge ~28 = 0.33 × the ring OD as the E10 montage anchors it (85 mm on that frame; the SEALED ring OD is the SE-bracket read 88 ±12 = SNK_SLIDE rRing 0.044, on which the same ratio gives 29.04, inside both bands — 28.0 carried, no re-pin) (OPEN ±30 %), wire OD 6–9 from the montage ratios anchored on the ring OD (OPEN; 7.5 carried with its band) — both named OPEN in the report ledger' + GUIDE_NOTE}},

 'rolling_resistance': {'class': 'default', 'u_r': U_R, 'provenance': {'tag': 'DERIVED', 'source': 'PROXY: the kernel default cloth class u_r 0.010 stands in for steel wire on a chromed ball (research open item; the runtime scales it by (7/5)(r/ρ) on the twin rail)'}},
 'arrival': {'restitution': 0, 'provenance': {'tag': 'DESIGN', 'source': "spec 037 research R5 / the owner's 「一个接一个堆」: balls queue in the chute against the stop and each other"}},
 'topology': 'terminal-chutes',
 'runways': runways, 'hooks': hooks, 'pockets': pockets, 'unserved_pockets': [],
 'checks': {'drain_monotonic': True},   # MEASURED above (drain_failures over every runway), not claimed: a failure refuses the file
}
# the refusal BEFORE anything touches OUT: a drain failure on any runway (stderr, exit 2); an arm that did not fire is a
# defect of the arm itself (exit 3) — nothing is ever written under an arm
if DRAIN_FAILS:
    for pid, k_edge, rise, s0, s1, margin in DRAIN_FAILS:
        print(f'[export] REFUSED — drain not monotonic before the stop on {pid}: edge {k_edge} rises {rise:.3f} mm (s {s0:.2f}→{s1:.2f}; margin {margin:.4f} m/s²)', file=sys.stderr)
    sys.exit(2)
if ARM:
    print(f"[export] REFUSED — arm '{ARM}' did not fire; nothing written", file=sys.stderr); sys.exit(3)
json.dump(doc, open(OUT, 'w'), ensure_ascii=False, indent=1); open(OUT, 'a').write('\n')
print('wrote', OUT, 'sha256', hashlib.sha256(open(OUT, 'rb').read()).hexdigest()[:16])
for pk in pockets: print(' ', pk['index'], pk['entry_runway'], 'exit_below', pk['exit_below_y_mm'], '|', pk['notes'][:60])
for r in runways: print('  ', r['id'], 'wall_s', r['stop']['wall_s_mm'], 'capacity', r['stop']['capacity_balls'])
