#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-derive.py — solve the venue fill pair (up, down) per venue from photo targets + the rig's own response.

The renderer is LINEAR in the probe pair: every derived-ROI radiance Y_i = a_i + b_i·up + c_i·down (the env cubemap's
second-order feedback aside — checked by the final capture). The coefficients come from three captures of the same
table/poses under ?venueUp=&venueDown= overrides: (0,0) [for a table whose legacy probe must stand down], (u,0), (0,d).
Targets are photo ratios (READS, with ±). The solve minimises Σ w_k · (log(pred_k / target_k))² over the chosen
constraint set, with non-negativity on (up, down); every other ROI ratio is then PREDICTED and printed beside its
read, so the report can show what the pair closes and what it does not.

  lighting-derive.py --reads DIR --look default --table T --base KEY --u KEY --d KEY --u-val 0.2 --d-val 0.2
                     --target 'name=ratio±pm' ... [--weights name=w ...] [--json OUT]
  ratio names (from lighting-render-reads.py): shadow_floor, noseface_over_bed, jawS_over_bed, jawN_over_bed,
     apron_over_bed, floor_over_bed, ball0_under_over_crown, ball0_eq_over_crown, ball1_under_over_crown, crown_over_bed
  KEY = the `<table>` or `<table>@<poke>` directory under <reads>/<look>/ (each from a separate --capture run, so pass
  --reads-base/--reads-u/--reads-d when the captures live in different trees).
"""
import argparse, json, os, sys
import numpy as np
from scipy.optimize import minimize

ROI_RATIOS = {
    'shadow_floor': ('cushion_shadow', 'bed_shadow_strip', 'bed_open'),
    'near40_over_bed': ('cushion_shadow', 'bed_near_nose_40mm', 'bed_open'),
    'noseface_over_bed': ('cushion_shadow', 'nose_face', 'bed_open'),
    'railtop_over_bed': ('cushion_shadow', 'rail_top', 'bed_open'),
    'jawS_over_bed': ('mid_close_diag', 'jaw_face_S', 'bed_open'),
    'jawN_over_bed': ('mid_close_diag', 'jaw_face_N', 'bed_open'),
    'apron_over_bed': ('full34', 'apron_face', 'bed_centre'),
    'floor_over_bed': ('full34', 'floor_beside', 'bed_centre'),
    'apronleg_apron_over_bed': ('apron_leg', 'apron_face', 'bed_centre'),
}
BALL_RATIOS = {
    'ball0_under_over_crown': ('cueball_level', '0', 'under_Y', 'crown_Y'),
    'ball0_eq_over_crown': ('cueball_level', '0', 'equator_Y', 'crown_Y'),
    'ball1_under_over_crown': ('rack_level', '1', 'under_Y', 'crown_Y'),
    'ball1_eq_over_crown': ('rack_level', '1', 'equator_Y', 'crown_Y'),
}
LEVELS = {  # absolute radiances worth predicting (ACES white ≈ 1.0 linear)
    'ball0_crown': ('cueball_level', '0', 'crown_Y'), 'ball1_crown': ('rack_level', '1', 'crown_Y'),
    'bed_open': ('cushion_shadow', 'bed_open'), 'bed_centre': ('full34', 'bed_centre'),
}


def load(reads_dir, look, key):
    p = os.path.join(reads_dir, look, key, 'reads.json')
    return json.load(open(p))


def val(d, pose, roi):
    try:
        return d['poses'][pose]['reads'][roi]['Y']
    except KeyError:
        return None


def bval(d, pose, bid, k):
    try:
        return d['poses'][pose]['balls'][bid][k]
    except KeyError:
        return None


def coefs(d0, du, dd, u, dv):
    """per quantity: (a, b, c) with Y = a + b*up + c*down."""
    out = {}
    for pose in d0['poses']:
        for roi in d0['poses'][pose]['reads']:
            y0, yu, yd = val(d0, pose, roi), val(du, pose, roi), val(dd, pose, roi)
            if None in (y0, yu, yd):
                continue
            out[(pose, roi)] = (y0, (yu - y0) / u, (yd - y0) / dv)
        for bid, br in d0['poses'][pose].get('balls', {}).items():
            for k in ('crown_Y', 'equator_Y', 'under_Y', 'disc_Y'):
                y0, yu, yd = bval(d0, pose, bid, k), bval(du, pose, bid, k), bval(dd, pose, bid, k)
                if None in (y0, yu, yd):
                    continue
                out[(pose, bid, k)] = (y0, (yu - y0) / u, (yd - y0) / dv)
    return out


def predict(C, key, up, down):
    c = C.get(key)
    return None if c is None else c[0] + c[1] * up + c[2] * down


def ratio_pred(C, name, up, down):
    if name in ROI_RATIOS:
        pose, a, b = ROI_RATIOS[name]
        A, B = predict(C, (pose, a), up, down), predict(C, (pose, b), up, down)
    elif name in BALL_RATIOS:
        pose, bid, a, b = BALL_RATIOS[name]
        A, B = predict(C, (pose, bid, a), up, down), predict(C, (pose, bid, b), up, down)
    elif name == 'crown_over_bed':
        A, B = predict(C, ('cueball_level', '0', 'crown_Y'), up, down), predict(C, ('cueball_level', 'bed_open'), up, down)
    else:
        return None
    if A is None or not B:
        return None
    return A / B


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--reads-base', required=True); ap.add_argument('--reads-u', required=True); ap.add_argument('--reads-d', required=True)
    ap.add_argument('--look', default='default'); ap.add_argument('--key-base', required=True); ap.add_argument('--key-u', required=True); ap.add_argument('--key-d', required=True)
    ap.add_argument('--u-val', type=float, default=0.2); ap.add_argument('--d-val', type=float, default=0.2)
    ap.add_argument('--target', action='append', default=[]); ap.add_argument('--weight', action='append', default=[])
    ap.add_argument('--json'); ap.add_argument('--fix-up', type=float); ap.add_argument('--fix-down', type=float)
    a = ap.parse_args()
    d0, du, dd = load(a.reads_base, a.look, a.key_base), load(a.reads_u, a.look, a.key_u), load(a.reads_d, a.look, a.key_d)
    C = coefs(d0, du, dd, a.u_val, a.d_val)
    targets = {}
    for t in a.target:
        name, rest = t.split('=')
        if '±' in rest or '+-' in rest:
            r, pm = rest.replace('+-', '±').split('±'); targets[name] = (float(r), float(pm))
        else:
            targets[name] = (float(rest), 0.0)
    weights = {k: float(v) for k, v in (w.split('=') for w in a.weight)}

    def pred_any(name, up, down):
        # 'level:<name>' = an absolute radiance (LEVELS); '<=' semantics when the target string carried 'max'
        if name.startswith('level:'):
            key = LEVELS.get(name[6:])
            return predict(C, key, up, down) if key else None
        return ratio_pred(C, name, up, down)

    def loss(x):
        up, down = max(0, x[0]), max(0, x[1])
        L = 0.0
        for name, (r, pm) in targets.items():
            p = pred_any(name.replace('max:', ''), up, down)
            if p is None or p <= 0:
                continue
            sig = max(0.05, pm / max(r, 1e-6))  # relative uncertainty floor 5 %
            if name.startswith('max:'):  # one-sided ceiling: penalise only above r
                if p > r:
                    L += weights.get(name, 1.0) * (np.log(p / r) / sig) ** 2
                continue
            L += weights.get(name, 1.0) * (np.log(p / r) / sig) ** 2
        return L

    best = None
    for u0 in (0.0, 0.02, 0.05, 0.1, 0.2, 0.4):
        for d0_ in (0.0, 0.02, 0.05, 0.1, 0.2, 0.4):
            x0 = [a.fix_up if a.fix_up is not None else u0, a.fix_down if a.fix_down is not None else d0_]
            res = minimize(lambda x: loss([a.fix_up if a.fix_up is not None else x[0], a.fix_down if a.fix_down is not None else x[1]]),
                           x0, method='Nelder-Mead', options={'xatol': 1e-5, 'fatol': 1e-8})
            if best is None or res.fun < best.fun:
                best = res
    up = a.fix_up if a.fix_up is not None else max(0, best.x[0]); down = a.fix_down if a.fix_down is not None else max(0, best.x[1])
    out = {'look': a.look, 'table': a.key_base, 'up': float(up), 'down': float(down), 'loss': float(best.fun), 'targets': targets, 'pred': {}, 'levels': {}, 'before': {}}
    print(f"SOLVED up = {up:.4f}  down = {down:.4f}   (loss {best.fun:.3f})")
    print(f"{'quantity':26s} {'before':>8s} {'pred':>8s} {'target':>16s} {'in band':>8s}")
    for name in list(ROI_RATIOS) + list(BALL_RATIOS) + ['crown_over_bed']:
        p = ratio_pred(C, name, up, down)
        if p is None:
            continue
        b0 = ratio_pred(C, name, 0.0, 0.0)
        out['pred'][name] = p; out['before'][name] = b0
        tgt = targets.get(name) or targets.get('max:' + name)
        band = ''
        if tgt:
            lo, hi = tgt[0] - tgt[1], tgt[0] + tgt[1]
            band = 'YES' if lo <= p <= hi else 'no'
        print(f"{name:26s} {b0 or 0:8.3f} {p:8.3f} {('%.3f ± %.3f' % tgt) if tgt else '':>16s} {band:>8s}")
    for name, key in LEVELS.items():
        k = key if len(key) == 2 else key
        p = predict(C, key, up, down); b0 = predict(C, key, 0, 0)
        if p is not None:
            out['levels'][name] = p
            tgt = targets.get('level:' + name) or targets.get('max:level:' + name)
            print(f"LEVEL {name:20s} before {b0:8.3f} -> pred {p:8.3f}   (linear; ACES white ≈ 1.0; 250/255 at ≈ 4.0 @1.05 / 5.0 @0.85)" + (f"   target {tgt}" if tgt else ''))
    if a.json:
        json.dump(out, open(a.json, 'w'), indent=1)


if __name__ == '__main__':
    main()
