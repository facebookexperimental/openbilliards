#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""check-track-export-489 — the ball-return track export follows the BUILT wires (GH-489 SNK-R33, review r7 P2 B).
For every runway of the export (docs/geometry/tracks/wpbsa_snooker_12ft-xw101-slides.json by default) the polyline
`points_mm` is compared with the built LOWER PAIR's midline as web/scene/table.js snkSlideChutes builds it (dumped
by tools/render/dump-slide-chutes-489.mjs, 49 stations = the tube's own 48 segments): from the runway's first
vertex (the landing station) to the stop's tip, the max distance from each built station to the exported polyline
and from each exported vertex to the built polyline must both be ≤ the tessellation step (the built path length /
48). PASS iff every runway holds; the offending pocket, station and distance are named otherwise. Pure python + one
node call; no port, no browser.
Second row DRAIN (GH-489 SNK-R34, review r8 P2 B): the schema's drain law over the export's OWN numbers — for every
runway, every edge that starts before the stop face (stop.wall_s_mm, the validator's 1 mm grain) must drive the
reference ball, k·g·sinθ > k·g·(7/5)(r/ρ)·u_r·cosθ, with the file's rolling_resistance.u_r, ball diameter, gauge and
rail diameter; the edge containing the face is judged on its part up to the face. The arithmetic is the validator's
(web/scene/ballreturn/schema.js V7 lines 259-273 + track.js supportDerived 66-74 / resistCoeff 913 at the ballreturn
lane's 1c6edc3b). The red arm hands it the pre-SNK-R34 export (`git show 4199f4f8:docs/…slides.json`): its stop face
sat at the clamp corner's foot, past the polyline's lowest vertex, and the partial edge to it RISES 0.414 mm on p1.
  python3 tools/render/check-track-export-489.py [--export <json>] [--web <dir>] [--table id]
    --export  the export to judge (the red arms hand it the pre-SNK-R33 file `git show 3b155fdf:docs/…slides.json` for
              the polyline row and the pre-SNK-R34 file `git show 4199f4f8:…` for the drain row)
    --web     dump the chutes from that tree's web/scene/table.js (a git-archive export) instead of the checkout's
    --table   the table id (default wpbsa_snooker_12ft); the dump validates it against the SELECTED tree's TABLE_SPECS
              and an unknown id is REFUSED by name here too (SNK-R35-FIX, review r9 P2 B: the dump's stderr line is
              surfaced, exit 2, never a traceback); the first output line names the table the dump RESOLVED
Exit 0 both rows PASS, 1 either row FAILs, 2 usage / unknown table / no chutes."""
import json, math, os, subprocess, sys
args = sys.argv[1:]
def opt(name, default=None):
    return args[args.index(name) + 1] if name in args else default
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EXPORT = opt('--export', os.path.join(REPO, 'docs/geometry/tracks/wpbsa_snooker_12ft-xw101-slides.json'))
WEB = opt('--web'); TABLE = opt('--table', 'wpbsa_snooker_12ft')
# SNK-R36-FIX (review r10 P2 C): a RELATIVE --web is the caller's, resolved against the caller's cwd HERE — the dump below
# runs with cwd=REPO, so `cd web; python3 ../tools/render/check-track-export-489.py --web .` used to search the repo
# root for vendor/three.module.min.js and exit 2 before any track was checked. The absolute form is unchanged.
if WEB:
    WEB = os.path.abspath(WEB)
cmd = ['node', os.path.join(REPO, 'tools/render/dump-slide-chutes-489.mjs'), TABLE] + (['--web', WEB] if WEB else [])
# SNK-R35-FIX (review r9 P2 B): the dump validates TABLE against the selected tree's TABLE_SPECS (exit 2 `unknown table
# id`); this checker refuses BY NAME on that — the dump's own stderr line is surfaced, exit 2, no traceback — and the
# table it reports is the one the dump RESOLVED (the dump's `table` key, asserted equal to the request), never argv.
def refuse(msg):
    print(f'[track-export] REFUSED — {msg}', file=sys.stderr); sys.exit(2)
dump = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
if dump.returncode != 0:
    err = next((l for l in dump.stderr.splitlines() if l.strip()), f'no stderr (exit {dump.returncode})')
    refuse(f"table '{TABLE}' — the chute dump refused it (exit {dump.returncode}): {err}")
try:
    dumped = json.loads(dump.stdout)
except ValueError:
    refuse(f"table '{TABLE}' — the chute dump wrote no JSON (exit 0; stderr: {dump.stderr.strip()[:200] or 'empty'})")
chutes = dumped.get('chutes')
if not chutes:
    refuse(f"table '{TABLE}' — the chute dump carries no chutes")
if dumped.get('table') != TABLE:
    refuse(f"the chute dump resolved table '{dumped.get('table')}' for the requested '{TABLE}'")
TABLE = dumped['table']
print(f"[track-export] table {TABLE} (resolved in {WEB if WEB else 'checkout web/scene/table.js'})")
doc = json.load(open(EXPORT))
by = {c['index']: c for c in chutes}
def seg_dist(P, a, b):
    ax, ay, az = a; bx, by_, bz = b; px, py, pz = P
    ex, ey, ez = bx - ax, by_ - ay, bz - az; l2 = ex * ex + ey * ey + ez * ez or 1e-30
    t = max(0.0, min(1.0, ((px - ax) * ex + (py - ay) * ey + (pz - az) * ez) / l2))
    return math.dist(P, (ax + t * ex, ay + t * ey, az + t * ez))
def poly_dist(P, poly):
    return min(seg_dist(P, poly[i], poly[i + 1]) for i in range(len(poly) - 1)) if len(poly) > 1 else math.dist(P, poly[0])
worst_all = 0.0; fails = []; rows = []
for rw in doc['runways']:
    idx = int(rw['id'].split('-')[0][1:]); ch = by[idx]
    lo = [w for w in ch['wires'] if w['lvl'] == 0]
    mid = [[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] for a, b in zip(lo[0]['centreline'], lo[1]['centreline'])]
    length = sum(math.dist(mid[i - 1], mid[i]) for i in range(1, len(mid))); step = length / 48.0
    pts = rw['points_mm']; dirx = ch['dirx']
    # the built stations at or beyond the landing station (along the chute)
    x_entry = pts[0][0]
    built = [q for q in mid if (q[0] - x_entry) * dirx >= -1e-9]
    d_built = [(poly_dist(q, pts), i, q) for i, q in enumerate(built)]
    d_exp = [(poly_dist(q, mid), i, q) for i, q in enumerate(pts)]
    wb = max(d_built); we = max(d_exp); worst = max(wb[0], we[0]); worst_all = max(worst_all, worst)
    ok = worst <= step + 1e-9
    rows.append(f"  {rw['id']}: built→export max {wb[0]:.2f} mm @ station {wb[1]} ({wb[2][0]:.1f}, {wb[2][1]:.2f}); export→built max {we[0]:.2f} mm @ vertex {we[1]}; step {step:.2f} mm; points {len(pts)} → {'ok' if ok else 'FAIL'}")
    if not ok: fails.append((rw['id'], round(worst, 2), wb[1]))
print(f"[track-export] {EXPORT} vs the built chutes ({'checkout' if not WEB else WEB}): worst {worst_all:.2f} mm")
print('\n'.join(rows))
rc = 0
if fails:
    print(f"[track-export] FAIL — {len(fails)} runway(s) leave the built wire by more than the tessellation step: " + ', '.join(f'{i} {d} mm (station {s})' for i, d, s in fails)); rc = 1
else:
    print('[track-export] PASS — every runway follows the built lower pair within the tessellation step')
# ---- DRAIN row (SNK-R34, review r8 P2 B): the validator's V7 arithmetic over the export's own numbers ----
# schema.js:259-273 — for each runway, edges with s0 < wallS - 1 mm (the grain the station is quoted at; the rest is the
# stop's body): drive = k·G·sinθ > resist = k·G·(7/5)(r/ρ)·u_r·cosθ, sinθ = -t_y of the unit chord (down positive),
# cosθ = sqrt(1 - t_y²); track.js supportDerived: c = (g/2)·r/(r + r_w), ρ = sqrt(r² - c²), k = 1/(1 + 0.4 (r/ρ)²);
# resistCoeff: (7/5)(r/ρ)·u_r; G = 9.8 (track.js G, the sinkpivot SINK_G mirror — it cancels in the inequality). Edge
# indices are the validator's 0-based [k]. The edge containing the face is judged on its part up to the face (its slope
# is the whole edge's), and the rise reported is over that part.
G_SINK, DRAIN_GRAIN = 9.8, 1.0
ball_d = doc['ball']['reference_diameter_mm']; u_r = doc['rolling_resistance']['u_r']
def drain_der(sup):
    r, half, rw = ball_d / 2, sup['gauge_mm'] / 2, sup['rail_diameter_mm'] / 2
    c = half * r / (r + rw); rho = math.sqrt(r * r - c * c)
    return 1 / (1 + 0.4 * (r / rho) ** 2), rho, 1.4 * (r / rho)
dfails = []; dworst = None; drows = []
for rw in doc['runways']:
    if 'stop' not in rw: continue                                  # terminal-chutes: every runway is a chute with a stop; a tray would be level by design
    sup = rw.get('support') or doc['support']
    if sup.get('kind') != 'twin-rail':
        print(f"[drain] REFUSED — {rw['id']}: support kind {sup.get('kind')} is not the twin-rail this row mirrors"); sys.exit(2)
    k_in, rho, rr = drain_der(sup)
    pts = rw['points_mm']; wall = rw['stop']['wall_s_mm']
    S = [0.0]
    for i in range(1, len(pts)): S.append(S[-1] + math.dist(pts[i - 1], pts[i]))
    ylow = min(p[1] for p in pts); jlow = next(i for i, p in enumerate(pts) if p[1] == ylow)
    n = 0; wm = None
    for i in range(1, len(pts)):
        s0 = S[i - 1]
        if s0 >= wall - DRAIN_GRAIN: break
        dx, dy, dz = (pts[i][j] - pts[i - 1][j] for j in range(3)); L = math.sqrt(dx * dx + dy * dy + dz * dz)
        ty = dy / L; margin = k_in * G_SINK * (-ty) - k_in * G_SINK * rr * u_r * math.sqrt(max(0.0, 1 - ty * ty))
        n += 1; s1 = min(S[i], wall)
        if wm is None or margin < wm[0]: wm = (margin, i - 1)
        if dworst is None or margin < dworst[0]: dworst = (margin, rw['id'], i - 1)
        if not margin > 0: dfails.append((rw['id'], i - 1, dy * (s1 - s0) / L, s0, s1, margin))
    drows.append(f"  {rw['id']}: stop face s {wall} (lowest vertex {jlow} at s {S[jlow]:.2f}), {n} edge(s) judged, least margin {wm[0]:.4f} m/s² at edge {wm[1]} → {'ok' if not any(f[0] == rw['id'] for f in dfails) else 'FAIL'}")
print(f"[drain] {EXPORT}: k {k_in:.5f}, ρ {rho:.3f} mm, (7/5)(r/ρ)·u_r {rr * u_r:.6f} (u_r {u_r}; min slope {math.degrees(math.atan(rr * u_r)):.3f}°)")
print('\n'.join(drows))
if dfails:
    print('[drain] FAIL — ' + '; '.join(f'{pid} edge {k} rises {rise:.3f} mm (s {a:.2f}→{b:.2f}; margin {m:.4f} m/s²)' for pid, k, rise, a, b, m in dfails)); rc = 1
else:
    print(f'[drain] PASS — every edge before the stop drains (worst margin {dworst[0]:.4f} m/s² on {dworst[1]} edge {dworst[2]})')
sys.exit(rc)
