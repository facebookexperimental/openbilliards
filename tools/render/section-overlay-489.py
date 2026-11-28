#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""GH-489 snooker rail SECTION overlay — ours BEFORE | ours AFTER | Magnum II.

The R3-SNK-11 B2 deliverable, re-issued as OURS in R3-SNK-12 (order item (a)):
one panel per station, our cushion section at two shas drawn over the purchased
Rasson Magnum II section, at an exact 2 px/mm floor scale with mm axes.

WHAT IS DRAWN. Both bodies live in the section frame of the jaw gate
(tools/render/check-jaw-sections-489.mjs):
    h = mm above the bed cloth (absolute)
    d = mm behind THAT station's own foremost cushion point (its d-minimum over
        h > 20 mm), positive outboard — i.e. NOSE-RELATIVE, per station.
Our side comes from the gate's --sections dump (the exact triangle-plane cut of
the shipped loft, as segments); the Magnum side is the pinned measurement
fixture fixtures/magnum-jaw-sections-489.json. Nothing is re-derived here: the
deviation numbers printed in each panel are the GATE's own judged reads, taken
from its --out JSON, so the card and the gate cannot drift apart.

The cut plane is PERPENDICULAR to the local plan tangent on both sides; the
panel prints both phis, because an x-plane cut of a curving jaw stretches the
section by 1/cos(phi) and is not comparable. The panel also prints the station's
nose recess (ours behind the Magnum's) and the plan-obliquity deviation, so the
FROZEN-kernel-plan residual is visible on the card rather than only in the log.

No purchased bytes are read or written: the Magnum side is the lane's derived
polyline JSON (measurements, not geometry).

USAGE
  python3 tools/render/section-overlay-489.py \
      --before <sha>:<gate --sections dump>[:<gate --out json>] \
      --after  <sha>:<gate --sections dump>[:<gate --out json>] \
      --magnum tools/render/fixtures/magnum-jaw-sections-489.json \
      --stations middle_x600,middle_x120,middle_x80,middle_x50 \
      --out /path/overlay.png [--px-per-mm 2] [--title '...']
exit 0 = written; 2 = bad input / scale drift.
"""
import argparse, hashlib, json, os, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
from matplotlib.lines import Line2D

DPI = 100.0
PX_PER_MM = 2.0                  # the ordered scale; the order's 2 is a FLOOR
D_LO, D_HI = -6.0, 62.0          # mm behind the nose line
H_LO, H_HI = -2.0, 44.0          # mm above the bed
PAD_L, PAD_R, PAD_T, PAD_B = 74, 22, 52, 148
CAP_H = 58
KERNEL_NOSE_H = 36.75            # FROZEN kernel nose height (63.5% of the ball)


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def parse_side(spec):
    """'<sha>:<sections.json>[:<gate.json>]' -> (sha, sections_path, gate_path|None)"""
    bits = spec.split(':')
    if len(bits) < 2:
        sys.exit(f'bad --before/--after spec {spec!r}: want <sha>:<sections.json>[:<gate.json>]')
    sha, sec = bits[0], bits[1]
    gate = bits[2] if len(bits) > 2 else None
    return sha, sec, gate


def load_sections(path):
    return json.load(open(path))


def load_gate_rows(path):
    if not path:
        return {}
    return {r['id']: r for r in json.load(open(path))['rows']}


def magnum_station(fixture, sid):
    for st in fixture['stations']:
        if st['id'] == sid:
            return st
    sys.exit(f'station {sid} not in the Magnum fixture')


def main():
    global PX_PER_MM
    ap = argparse.ArgumentParser()
    ap.add_argument('--before', default=None,
                    help='omit to draw AFTER | Magnum only (the sheet then says so)')
    ap.add_argument('--after', required=True)
    ap.add_argument('--magnum', required=True)
    ap.add_argument('--stations', required=True)
    ap.add_argument('--title', default='OpenBilliards snooker rail SECTION — ours BEFORE | ours AFTER | Magnum II '
                                       '(perpendicular cut, nose-relative)')
    ap.add_argument('--px-per-mm', type=float, default=PX_PER_MM)
    ap.add_argument('--out', required=True)
    a = ap.parse_args()

    PX_PER_MM = a.px_per_mm
    if PX_PER_MM < 2.0:
        sys.exit('SCALE FLOOR: the order fixes 2 px/mm as the minimum')

    sids = [s.strip() for s in a.stations.split(',') if s.strip()]
    fixture = json.load(open(a.magnum))
    magsha = sha256(a.magnum)

    sides = []
    for which, spec, col in (('BEFORE', a.before, '#d62728'), ('AFTER', a.after, '#2ca02c')):
        if not spec:
            continue
        sha, sec, gate = parse_side(spec)
        sides.append(dict(which=which, sha=sha, col=col, sec_path=sec, gate_path=gate,
                          sec=load_sections(sec), rows=load_gate_rows(gate),
                          sec_sha=sha256(sec), gate_sha=(sha256(gate) if gate else None)))

    n = len(sids)
    axw = int(round((D_HI - D_LO) * PX_PER_MM))
    axh = int(round((H_HI - H_LO) * PX_PER_MM))
    pw, ph = axw + PAD_L + PAD_R, axh + PAD_T + PAD_B
    W, H = pw * n, ph + CAP_H
    fig = plt.figure(figsize=(W / DPI, H / DPI), dpi=DPI)
    fig.patch.set_facecolor('white')

    if not a.before:
        caption0 = 'NO BEFORE SIDE ON THIS SHEET — AFTER vs Magnum only.  '
    else:
        caption0 = ''
    caption = [caption0 + f'Magnum: {os.path.basename(a.magnum)} sha256 {magsha[:12]}… '
               f'(MODEL(Magnum), quarantine measurement, RDP eps {fixture.get("rdp_eps_mm")} mm)']
    for s in sides:
        caption.append(f'{s["which"]} {s["sha"][:8]} cuts {os.path.basename(s["sec_path"])} '
                       f'sha256 {s["sec_sha"][:8]}…'
                       + (f' reads {os.path.basename(s["gate_path"])} sha256 {s["gate_sha"][:8]}…'
                          if s['gate_path'] else ' (no gate JSON — deviations omitted)'))

    legend_done = False
    for i, sid in enumerate(sids):
        mst = magnum_station(fixture, sid)
        mag = np.asarray(mst['points'], float)

        x0 = (i * pw + PAD_L) / W
        y0 = (CAP_H + PAD_B) / H
        ax = fig.add_axes([x0, y0, axw / W, axh / H])
        ax.set_xlim(D_LO, D_HI); ax.set_ylim(H_LO, H_HI)
        ax.set_aspect('equal', adjustable='box')
        ax.grid(True, which='both', lw=.4, alpha=.35)
        ax.set_xticks(np.arange(-5, 61, 5)); ax.set_yticks(np.arange(0, 41, 5))
        ax.tick_params(labelsize=7)
        ax.set_xlabel('d — mm behind this station\'s own nose (outboard +)', fontsize=8)
        ax.set_ylabel('h — mm above the bed cloth', fontsize=8)
        ax.axhline(KERNEL_NOSE_H, color='#1f77b4', ls=':', lw=.9, zorder=2)
        ax.axvline(0.0, color='#1f77b4', ls=':', lw=.9, zorder=2)
        ax.plot(mag[:, 0], mag[:, 1], '-', color='#111111', lw=1.6, zorder=4)
        win = (sides[-1]['sec'].get(sid) or {}).get('window')
        if win:
            ax.axhspan(win['h'][0], win['h'][1], color='#1f77b4', alpha=.05, zorder=1)
            for hv in win['h']:
                ax.axhline(hv, color='#1f77b4', ls='--', lw=.6, alpha=.55, zorder=2)

        lines = [f'station {sid}   x {mst["x_mm"]:.0f} mm   cut: PERPENDICULAR both sides',
                 f'Magnum            phi {mst["phi_deg"]:6.2f}    foot@h0.25 {mst["foot_d_at_h0.25_mm"]:6.3f}'
                 f'   tangent rms {mst["tangent_fit_rms_mm"]:.4f} (n {mst["tangent_fit_n"]})']
        for s in sides:
            entry = s['sec'].get(sid)
            if not entry:
                lines.append(f'{s["which"]:<6} {s["sha"][:8]:<9} station MISSING in the dump')
                continue
            # raw cut FAINT (all our material, hidden included) ...
            segs = np.asarray(entry['ours'], float)
            ax.add_collection(LineCollection(segs, colors=s['col'], linewidths=.8,
                                             alpha=.30, zorder=5))
            # ... the JUDGED front-silhouette ladder SOLID on top: the card must
            # compare exactly what the gate scores, not our hidden back faces.
            lad = np.asarray(entry.get('ours_ladder') or [], float)
            if lad.size:
                ax.plot(lad[:, 0], lad[:, 1], '-', color=s['col'], lw=1.5, zorder=6)
            r = s['rows'].get(sid)
            if not r:
                lines.append(f'{s["which"]:<6} {s["sha"][:8]:<9} n_seg {len(segs)} (no gate JSON — no judged read)')
                continue
            w = r['twoway']['worse']
            lines.append(f'{s["which"]:<6} {s["sha"][:8]:<9} phi {r["phi_ours"]:6.2f} '
                         f'(dev {r["phi_deviation_deg"]:+6.2f})  recess {r["nose_recess_mm"]:+7.3f}'
                         f'   p90 {w["p90"]:.3f} / max {w["max"]:.3f} ({w["dir"]}) '
                         f'{"PASS" if r["ok"] else "FAIL"}')
            if not r.get('on_chain', True):
                lines.append(f'{"":<16} OFF-CHAIN: snap {r["station_snap_mm"]:.2f} mm — that tree\'s front '
                             f'chain has no station here')
        wtxt = (f'   judged window h [{win["h"][0]}, {win["h"][1]}] d [{win["d"][0]}, {win["d"][1]}]'
                if win else '')
        lines.append(f'band p90 <= 1.0 / max <= 2.0{wtxt}   scale {PX_PER_MM:g} px/mm')
        lines.append('each side is nose-relative to ITS OWN nose — the recess above is '
                     'what that datum removes')
        # The read block goes UNDER the panel, never over the section: an overlay
        # whose own caption hides the geometry it is judging is not evidence.
        ax.set_title(f'{sid}  (x {mst["x_mm"]:.0f} mm from the pocket axis)', fontsize=9, pad=6)
        fig.text((i * pw + 6) / W, (CAP_H + PAD_B - 44) / H, '\n'.join(lines),
                 ha='left', va='top', fontsize=6.1, family='monospace', linespacing=1.45,
                 bbox=dict(fc='#fbfbfb', ec='#bbbbbb', lw=.5, pad=2.6))
        if not legend_done:
            hs = [Line2D([], [], color=s['col'], lw=1.6) for s in sides] \
                 + [Line2D([], [], color='#111111', lw=1.8),
                    Line2D([], [], color='#1f77b4', lw=1.0, ls=':')]
            ls = [f'ours {s["which"]} {s["sha"][:8]} — solid = judged ladder, faint = raw cut'
                  for s in sides] \
                 + ['Magnum II (MODEL, its own perpendicular cut)',
                    f'kernel nose {KERNEL_NOSE_H} (FROZEN) / nose line d = 0']
            ax.legend(hs, ls, fontsize=7.2, loc='upper right', framealpha=.92)
            legend_done = True

    fig.text(0.005, (CAP_H - 12) / H, a.title, fontsize=10, va='top', ha='left', weight='bold')
    fig.text(0.005, (CAP_H - 28) / H, '  |  '.join(caption), fontsize=6.4,
             va='top', ha='left', family='monospace')
    fig.savefig(a.out, dpi=DPI, facecolor='white')

    bb = fig.axes[0].get_window_extent()
    got = bb.width / (D_HI - D_LO)
    print(json.dumps({'out': a.out, 'px_per_mm_measured': round(float(got), 4),
                      'px_per_mm_target': PX_PER_MM, 'size_px': [W, H], 'stations': sids}))
    if abs(got - PX_PER_MM) > 1e-6:
        sys.exit('SCALE DRIFT: the panel is not at the requested px/mm')


if __name__ == '__main__':
    main()
