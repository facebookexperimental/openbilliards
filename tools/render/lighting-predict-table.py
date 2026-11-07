#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-predict-table.py — render the ORDER-LIGHT-8 §13.5 prediction table (markdown + a PNG figure for the pack)
from lighting-rebake-predict.mjs's JSON. Bands: under/crown 0.1275–0.2571 (strict 0.154–0.209), equator/crown
0.4025–0.9176 (strict 0.489–0.835) — the gate spec's arena-class envelopes.
  python3 tools/render/lighting-predict-table.py --json output/lighting/predict-s8/predict-exact.json --md OUT.md --png OUT.png
"""
import argparse, json
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser(); ap.add_argument('--json', required=True); ap.add_argument('--md', required=True); ap.add_argument('--png', required=True)
ap.add_argument('--measured', default='0.0071,0.0350,0.0072,0.0324', help='measured under/crown, eq/crown for default then sp (gate rows)')
a = ap.parse_args()
J = json.load(open(a.json)); meas = [float(x) for x in a.measured.split(',')]
BAND = {'under': (0.1275, 0.2571, 0.154, 0.209), 'eq': (0.4025, 0.9176, 0.489, 0.835)}
def verdict(v, key):
    lo, hi, slo, shi = BAND[key]
    if v is None: return '—'
    if v < lo: return f'BELOW ×{lo / v:.1f}' if v > 0 else 'BELOW'
    if v > hi: return 'ABOVE'
    return 'inside' + (' (strict)' if slo <= v <= shi else '')
rows = []
hdr = ['look', 'scenario (probe inputs)', 'direct leg', 'gain', 'under/crown', 'vs band', 'equator/crown', 'vs band', 'E_ind under (×gain×occ)', 'E_ind eq (×gain×occ)', 'E_dir eq mean / median']
for look in ('default', 'sp'):
    o = J[look]; mu, me = (meas[0], meas[1]) if look == 'default' else (meas[2], meas[3])
    rows.append([look, 'MEASURED as shipped (SH block zero at rest)', 'render', '—', f'{mu:.4f}', verdict(mu, 'under'), f'{me:.4f}', verdict(me, 'eq'), '0', '0', '(floor)'])
    for tag, label in (('shipped', 'shipped grid (bake cloth Y %.3f, room %.3f/%.3f)' % (o['cloth_albedo_bake']['Y'], o['room_albedo_bake']['floorY'], o['room_albedo_bake']['wallY'])),
                       ('rebake_room', 'rebake: class room 0.10/0.25, bake cloth'),
                       ('rebake_cloth', 'rebake: class room + Predator cloth Y %.3f' % o['cloth_albedo_predator']['Y'])):
        s = o['scenarios'][tag]
        for key, b in s['ball'].items():
            dm, rest = key.split(':', 1); floor = rest.endswith('+floor'); gname = rest.replace('+floor', '')
            if not floor and 'indirect_0' not in gname: continue  # the +floor columns are the realistic ones; keep the bare indirect-0 row as the model check
            if 'indirect_0' in gname and floor: continue
            gain = {'indirect_0_as_shipped_at_rest': 'SH 0 (model check)', 'uGiIrr_1_physical': '1 (physical)', 'uGiIrr_2_main_literal': '2 (main literal)'}[gname]
            rows.append([look, label if (dm == 'three' and gname == 'uGiIrr_1_physical') or 'indirect_0' in gname else '', 'three LTC' if dm == 'three' else 'exact', gain,
                         f"{b['under_over_crown']:.4f}", verdict(b['under_over_crown'], 'under'), f"{b['equator_over_crown']:.4f}", verdict(b['equator_over_crown'], 'eq'),
                         f"{b['meanE']['under']['E_indirect_mean_incl_gain_occ']:.3f}", f"{b['meanE']['equator']['E_indirect_mean_incl_gain_occ']:.3f}", f"{b['meanE']['equator']['E_direct_mean']:.3f} / {b['meanE']['equator']['E_direct_median']:.4f}"])
md = ['| ' + ' | '.join(hdr) + ' |', '|' + '---|' * len(hdr)] + ['| ' + ' | '.join(r) + ' |' for r in rows]
inputs = []
for look in ('default', 'sp'):
    o = J[look]; E = o['scenarios']
    inputs.append(f"| {look} | bars L {', '.join(f'{v:.2f}' for v in o['lamp'])} (4 × 2.536×0.05 m, y 1.15, z ±0.159/±0.476) | cloth(bake) {o['cloth_albedo_bake']['rgb']} Y {o['cloth_albedo_bake']['Y']} | cloth(Predator) {o['cloth_albedo_predator']['rgb']} Y {o['cloth_albedo_predator']['Y']} | room bake {o['room_albedo_bake']['floor']}/{o['room_albedo_bake']['wall']} → class 0.10/0.25 | bed E at cue {o['bed_direct_E_at_cue']['Y']} | validation max|Δ| {E['shipped']['max_abs_delta_vs_shipped_file']} |")
    for tag in ('shipped', 'rebake_room', 'rebake_cloth'):
        e = E[tag]['E_atCue']
        inputs.append(f"| {look} {tag} | E at cue: total +y {e['total']['py']} −y {e['total']['ny']} ±x {e['total']['px']}/{e['total']['nx']} | bars +y {e['bars']['py']} −y {e['bars']['ny']} | cloth −y {e['cloth']['ny']} ±x {e['cloth']['px']} | room −y {e['room']['ny']} ±x {e['room']['px']} +y {e['room']['py']} | wood −y {e['wood']['ny']} | |")
inp_md = ['| look / scenario | bars | cloth (bake) | cloth (Predator) | room | bed / validation | |', '|---|---|---|---|---|---|---|'] + inputs
open(a.md, 'w').write('\n'.join(['**Tracer inputs** (all sourced; nothing authored here)', ''] + inp_md + ['', '**Predicted display ratios** (median display Y per band, the reads\' law; +floor = the measured as-shipped band floor added; bands: under 0.1275–0.2571, equator ≥ 0.4025)', ''] + md) + '\n')
# PNG figure (monospace table)
lines = ['ORDER-LIGHT-8 §13.5 — where the Predator cue ball\'s underside / equator light must come from (tracer-derived; bit-exact vs the shipped grid)', '']
widths = [max(len(str(r[i])) for r in [hdr] + rows) for i in range(len(hdr))]
fmt = lambda r: '  '.join(str(r[i]).ljust(widths[i]) for i in range(len(hdr)))
lines += [fmt(hdr), '-' * (sum(widths) + 2 * len(hdr))] + [fmt(r) for r in rows]
lines += ['', 'bands (arena-class photo envelopes): under/crown 0.1275–0.2571 (strict 0.154–0.209)   equator/crown 0.4025–0.9176 (strict 0.489–0.835)',
          'direct leg: "three LTC" = what the renderer computes (RectAreaLight LTC diffuse, clipped-sphere horizon term); "exact" = the Lambert form factor of the bars',
          'gain: uGiIrr 1 = physical scale; 2 = the shipped main literal (gi.js); "SH 0" = the shipped state at rest (per-ball SH block never filled)',
          'model: radiance = rho_ivory*(E_dir + E_SH*gain*occ)/pi * (1 - clearcoat Fresnel), ACES at the look exposure; +floor = the measured as-shipped equator/under floors (never the crown)']
try: font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 13)
except Exception: font = ImageFont.load_default()
W = max(len(l) for l in lines) * 8 + 40; H = len(lines) * 18 + 30
im = Image.new('RGB', (W, H), (255, 255, 255)); dr = ImageDraw.Draw(im)
for i, l in enumerate(lines):
    col = (0, 0, 0)
    if 'BELOW' in l and 'MEASURED' not in l: col = (150, 40, 40)
    if 'inside' in l and 'BELOW' not in l: col = (30, 110, 40)
    dr.text((20, 15 + i * 18), l, fill=col, font=font)
im.save(a.png); print('rows', len(rows), '→', a.md, a.png, im.size)
