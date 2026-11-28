#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-ledger.py — ORDER-LIGHT-11 R-A: the per-receiver ENERGY LEDGER, measured. For each receiver class the two
source cells (DIRECT, INDIRECT ∈ {bake, runtime LTC, runtime probe, none}) with the file:line that makes it so, and the
measurement that proves it from this seal's own pokes: runtime rect lights OFF vs on (`barsoff`) and the baked
component OFF vs on (`bakeoff` = uGiIrr 0) — the relative change of the class's scene-linear HDR median read.
Under `?venue=off` (main's sourcing) the same pokes give main's shares; under `?ledgerArm=cloth` every 'cloth'-mode
table program (clothMat AND the ~45 non-wood table materials injectAnalytic maps to that mode — aprons, legs, collars,
bowls, liners, slate, frame, brass, …; the cushion tops included) loses its rect-light diffuse — the ledger's red arm for
the cloth AND cushion rows. `bakeoff` (uGiIrr 0) removes the baked IRRADIANCE terms (lightmap RGB → indirect diffuse +
sheen; the ball SH) but leaves the baked VISIBILITY (gi.a via uGiShadow) and the floor's stock lightMap untouched.
Merges `ledger.<class>` into the barsoff reads of the default scope set (and of the offscope / ledgerarm sets) so the
gate's LEDGER-* rows read them; writes the table (markdown), the JSON and a PNG figure for the pack.
  python3 tools/render/lighting-ledger.py --after reads-render/after-s11 --scope reads-render/after-s11-scope
      --offscope reads-render/after-s11-offscope --ledgerarm reads-render/after-s11-ledgerarm --out ledger.md --json ledger.json --png ledger.png
"""
import argparse, json, os
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument('--after', required=True); ap.add_argument('--scope', required=True); ap.add_argument('--offscope', required=True); ap.add_argument('--ledgerarm', required=True)
ap.add_argument('--legacyrect', required=True, help='reads of the ?rectDiffuse=legacy set (the same venue scene with only the ball splice off): the same-scene reference for the cloth / cushion / floor rows')
ap.add_argument('--table', default='predator_apex_9ft'); ap.add_argument('--looks', default='default,sp')
ap.add_argument('--out', required=True); ap.add_argument('--json', required=True); ap.add_argument('--png', required=True)
a = ap.parse_args()

# receiver classes: which read (pose, name, field) stands for the class's diffuse response, and the source cells
CLASSES = {
    'ball_crown': {'pose': 'cueball_level', 'ball': 'crown_Y', 'label': 'BALL (cue ball crown, n_y > 0.55)',
                   'direct': ('bake (per-ball SH grid: probeSH counts emitter hits)', 'tools/render/lib/trace.mjs:96-118 → bake-lightmap.mjs:299-304; web/scene/shading.js getIBLIrradiance → spikeSHIrradiance·uGiIrr'),
                   'indirect': ('bake (the same grid: cloth / rail / room bounce) + runtime probe (room-only venue term, obVenueSH)', 'web/scene/gi.js sampleSH → material.userData.giSH; lightingvisuals.js hookVenueFill'),
                   'runtime_rect': 'SPECULAR only (this seal: the LTC diffuse line removed from ball programs — shading.js rectSpecularOnlyChunk); main / ?venue=off: diffuse + specular (the double count)'},
    'ball_equator': {'pose': 'cueball_level', 'ball': 'equator_Y', 'label': 'BALL (cue ball equator, |n_y| < 0.18)', 'direct': ('bake (grid)', 'as above'), 'indirect': ('bake + runtime probe', 'as above'), 'runtime_rect': 'specular only'},
    'ball_under': {'pose': 'cueball_level', 'ball': 'under_Y', 'label': 'BALL (cue ball underside, n_y < −0.55)', 'direct': ('none (no emitter below the horizon; the grid\'s −y carries only SH-L2 ringing of the bars)', 'as above'), 'indirect': ('bake (cloth bounce) × derived occlusion', 'web/scene/occlusionlut.js'), 'runtime_rect': 'specular only'},
    'cloth': {'pose': 'cueball_level', 'read': 'bed_open', 'label': 'CLOTH (open bed)',
              'direct': ('runtime LTC × baked visibility (lightmap A)', 'web/scene/shading.js SPIKE_GI: spikeShadow *= mix(1, gi.a, uGiShadow); three RE_Direct_RectArea_Physical diffuse leg'),
              'indirect': ('bake (plan lightmap RGB = 1-bounce indirect, sqrt-encoded)', 'tools/render/bake-lightmap.mjs encodeMap (RGB = ind, A = direct visibility × AO); shading.js giE = gi.rgb² · uGiScale · uGiIrr'),
              'runtime_rect': 'diffuse + specular (unchanged — single-sourced already)'},
    'rails': {'pose': 'cushion_shadow', 'read': 'rail_top', 'label': 'CUSHION TOP (rail_top read = the cushion cloth, a clothMat program with the flank / plan blend; the wood rails are mode \'wood\', outside every splice)',
              'direct': ('runtime LTC × baked visibility', 'as cloth (flank / plan maps, gi.a)'), 'indirect': ('bake (flank / plan lightmap RGB, 1-bounce)', 'bake-lightmap.mjs indF / indH'), 'runtime_rect': 'diffuse + specular (unchanged)'},
    'room_floor': {'pose': 'full34', 'read': 'floor_beside', 'label': 'ROOM DRESSING (floor beside the table)',
                   'direct': ('runtime LTC (+ the hemi / point stand-ins, main literals) — NOT multiplied by the baked visibility: the floor is a stock MeshStandardMaterial, its A channel is unread; the table shadow is the separate floorshadow blob overlay (alpha 1 − A)', 'web/scene/room.js floor material; gi.js floorshadow overlay; lightingvisuals.js rig'),
                   'indirect': ('bake through three\'s stock lightMap (gi.js binds the floor map as material.lightMap, lightMapIntensity = gain): the √-encoded RGB is read LINEARLY — neither squared nor × scaleFloor — a MAIN decode mismatch that over-reads the baked 1-bounce level (verifier round 11); uGiIrr does not reach it, so the bake-OFF cell here is NOT a measurement of the floor\'s baked share', 'bake-lightmap.mjs indFl / encodeMap; gi.js floor lightMap binding'), 'runtime_rect': 'diffuse + specular (unchanged)'},
    'room_wall': {'pose': 'full34', 'read': 'wall_side', 'label': 'ROOM DRESSING (side wall)',
                  'direct': ('runtime LTC (+ stand-ins)', 'room.js walls'), 'indirect': ('none baked (the walls carry no lightmap; env cube map irradiance only)', 'room.js — walls are not in the bake\'s lightmap set (eWall is a bounce SOURCE for other receivers)'), 'runtime_rect': 'diffuse + specular (unchanged)'},
    'fixture': {'pose': None, 'label': 'FIXTURE (hoods, bar plates)', 'direct': ('runtime LTC', 'lightingvisuals.js fixture meshes'), 'indirect': ('none baked (env cube map)', '—'), 'runtime_rect': 'diffuse + specular (unchanged)', 'note': 'no photometric read in the lane\'s ROI set — source cells from code only'},
}


def read_val(root, look, table, poke, pose, cls):
    p = os.path.join(root, look, f'{table}@{poke}' if poke else table, 'reads.json')
    if not os.path.exists(p): return None, p
    d = json.load(open(p)); P = (d.get('poses') or {}).get(pose) or {}
    if 'ball' in cls:
        b = P.get('balls') or {}; b0 = b.get('0') or b.get(0) or {}; return b0.get(cls['ball']), p
    r = (P.get('reads') or {}).get(cls['read']) or {}; return r.get('Y'), p


def rel(base, off):
    if base in (None, 0) or off is None: return None
    return (base - off) / base


ledger = {}; rows_md = []
for look in a.looks.split(','):
    L = {}
    for key, cls in CLASSES.items():
        if not cls.get('pose'): L[key] = {'label': cls['label'], 'direct': cls['direct'], 'indirect': cls['indirect'], 'runtime_rect': cls['runtime_rect'], 'note': cls.get('note')}; continue
        base, _ = read_val(a.after, look, a.table, None, cls['pose'], cls)
        bars, _ = read_val(a.scope, look, a.table, 'barsoff', cls['pose'], cls)
        bake, _ = read_val(a.scope, look, a.table, 'bakeoff', cls['pose'], cls)
        # main's sourcing: the same pokes under ?venue=off — the base of that set is the offscope's no-poke run
        obase, _ = read_val(a.offscope, look, a.table, None, cls['pose'], cls)
        obars, _ = read_val(a.offscope, look, a.table, 'barsoff', cls['pose'], cls)
        obake, _ = read_val(a.offscope, look, a.table, 'bakeoff', cls['pose'], cls)
        # the cloth arm: ?ledgerArm=cloth base and barsoff
        abase, _ = read_val(a.ledgerarm, look, a.table, None, cls['pose'], cls)
        abars, _ = read_val(a.ledgerarm, look, a.table, 'barsoff', cls['pose'], cls)
        # the same-scene reference: ?rectDiffuse=legacy (only the ball programs' rect-light diffuse restored)
        lbase, _ = read_val(a.legacyrect, look, a.table, None, cls['pose'], cls)
        lbars, _ = read_val(a.legacyrect, look, a.table, 'barsoff', cls['pose'], cls)
        lbake, _ = read_val(a.legacyrect, look, a.table, 'bakeoff', cls['pose'], cls)
        e = {'label': cls['label'], 'direct': cls['direct'], 'indirect': cls['indirect'], 'runtime_rect': cls['runtime_rect'],
             'base_Y': base, 'barsoff_Y': bars, 'bakeoff_Y': bake, 'barsoff_rel': rel(base, bars), 'bakeoff_rel': rel(base, bake),
             'off_base_Y': obase, 'off_barsoff_rel': rel(obase, obars), 'off_bakeoff_rel': rel(obase, obake),
             'arm_base_Y': abase, 'arm_barsoff_rel': rel(abase, abars),
             'legacy_base_Y': lbase, 'legacy_barsoff_rel': rel(lbase, lbars), 'legacy_bakeoff_rel': rel(lbase, lbake)}
        e['delta_vs_off'] = None if (e['barsoff_rel'] is None or e['off_barsoff_rel'] is None) else abs(e['barsoff_rel'] - e['off_barsoff_rel'])
        e['arm_delta_vs_off'] = None if (e['arm_barsoff_rel'] is None or e['off_barsoff_rel'] is None) else abs(e['arm_barsoff_rel'] - e['off_barsoff_rel'])
        e['delta_vs_legacy'] = None if (e['barsoff_rel'] is None or e['legacy_barsoff_rel'] is None) else abs(e['barsoff_rel'] - e['legacy_barsoff_rel'])
        e['arm_delta_vs_legacy'] = None if (e['arm_barsoff_rel'] is None or e['legacy_barsoff_rel'] is None) else abs(e['arm_barsoff_rel'] - e['legacy_barsoff_rel'])
        L[key] = e
    ledger[look] = L
    f = lambda v: '—' if v is None else (f'{v:+.3f}' if abs(v) < 10 else f'{v:.2f}')
    for key, e in L.items():
        if 'base_Y' not in e: rows_md.append(f"| {look} | {e['label']} | {e['direct'][0]} | {e['indirect'][0]} | {e['runtime_rect']} | — | — | — | — | {e.get('note') or ''} |"); continue
        rows_md.append(f"| {look} | {e['label']} | {e['direct'][0]} | {e['indirect'][0]} | {e['runtime_rect']} | {f(e['base_Y'])} | {f(e['barsoff_rel'])} (same scene, ball splice off: {f(e['legacy_barsoff_rel'])}; main: {f(e['off_barsoff_rel'])}) | {f(e['bakeoff_rel'])} (main: {f(e['off_bakeoff_rel'])}) | {f(e['delta_vs_legacy'])} (vs main: {f(e['delta_vs_off'])}) | arm(cloth): {f(e['arm_barsoff_rel'])} |")
    # merge into the reads the gate reads (default scope @barsoff; offscope @barsoff; ledgerarm @barsoff)
    for root, mode in ((a.scope, 'default'), (a.offscope, 'off'), (a.ledgerarm, 'arm')):
        p = os.path.join(root, look, f'{a.table}@barsoff', 'reads.json')
        if not os.path.exists(p): continue
        d = json.load(open(p)); d['ledger'] = {}
        for key, e in L.items():
            if 'base_Y' not in e: continue
            if mode == 'default': d['ledger'][key] = {'barsoff_rel': e['barsoff_rel'], 'bakeoff_rel': e['bakeoff_rel'], 'delta_vs_off': e['delta_vs_off'], 'delta_vs_legacy': e['delta_vs_legacy'], 'legacy_barsoff_rel': e['legacy_barsoff_rel'], 'base_Y': e['base_Y']}
            elif mode == 'off': d['ledger'][key] = {'barsoff_rel': e['off_barsoff_rel'], 'bakeoff_rel': e['off_bakeoff_rel'], 'delta_vs_off': 0.0 if e['off_barsoff_rel'] is not None else None, 'base_Y': e['off_base_Y']}
            else: d['ledger'][key] = {'barsoff_rel': e['arm_barsoff_rel'], 'bakeoff_rel': None, 'delta_vs_off': e['arm_delta_vs_off'], 'delta_vs_legacy': e['arm_delta_vs_legacy'], 'base_Y': e['arm_base_Y']}
        d['ledger_meta'] = 'lighting-ledger.py: barsoff_rel = (Y − Y[rect lights 0]) / Y; bakeoff_rel = (Y − Y[uGiIrr 0]) / Y; delta_vs_legacy = |barsoff_rel − barsoff_rel under ?rectDiffuse=legacy| (the same venue scene with only the ball splice off — the invariant for the classes R-A must not touch); delta_vs_off = the same against ?venue=off (main\'s scene: the 9.91 legacy probe + legacy dressing — a different light budget, RECORD only); scene-linear HDR medians'
        json.dump(d, open(p, 'w'), indent=1)
hdr = '| look | receiver | DIRECT source | INDIRECT source | runtime rect lights | base Y (linear) | rect lights OFF: rel. change | bake OFF: rel. change | \\|Δ vs same-scene reference\\| (vs main) | notes / arm |'
md = ['# Energy ledger — per-receiver light sources, measured (ORDER-LIGHT-11 R-A)', '',
      'Cells name ONE source each. Measurements: `barsoff` = all RectAreaLights at 0 (runtime rect lights off), `bakeoff` = uGiIrr 0 (the baked IRRADIANCE terms off: lightmap RGB → indirect diffuse + sheen, the ball SH — the baked visibility gi.a and the floor\'s stock lightMap stay; the ball SH path yields 0, the mix weight stays 1), relative change of the scene-linear HDR median of the class read; "main" = the same pokes under `?venue=off`; "arm(cloth)" = `?ledgerArm=cloth` (the rect-light diffuse removed from every cloth-mode table program: the cloth and the cushion tops among ~45 non-wood materials).', '',
      hdr, '|' + '---|' * 10] + rows_md
md += ['', 'Reading the ball rows: on default the rect lights are SPECULAR-only in ball programs, so switching them off must leave the diffuse bands nearly unchanged (the crown\'s median moves only by the highlight tail) while main (`?venue=off`) loses its LTC diffuse leg; bake OFF removes the whole diffuse on default (the grid is the single diffuse source) and, on main, nothing at rest (main\'s resting blocks are zero). What still lights a ball\'s crown at runtime after the splice: the point stand-in 2.2 (0.4–0.9 % of the grid\'s E(+y)), the hemi 0.11 (0.06 %), the venue fill (0.3 %); the table\'s LED spots sit below the ball horizon (0 at the crown) — verifier round 11. Cloth / cushion top / floor: the rect-lights-off delta equals main\'s (unchanged sourcing); the cloth arm collapses the cloth and the cushion rows together.']
open(a.out, 'w').write('\n'.join(md) + '\n'); json.dump(ledger, open(a.json, 'w'), indent=1)
# figure
try: font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 12)
except Exception: font = ImageFont.load_default()
lines = ['ENERGY LEDGER (ORDER-LIGHT-11 R-A) — one source per cell; measured shares from this seal\'s runtime toggles (barsoff = rect lights 0, bakeoff = uGiIrr 0)', '']
cols = ['look', 'receiver', 'DIRECT', 'INDIRECT', 'rect lights', 'base Y', 'rect OFF Δ (ref | main)', 'bake OFF Δ (main)', '|Δ vs ref| (vs main)']
tab = []
for look, L in ledger.items():
    for key, e in L.items():
        if 'base_Y' not in e: tab.append([look, e['label'][:34], e['direct'][0][:34], e['indirect'][0][:34], e['runtime_rect'][:18], '—', '—', '—', '—']); continue
        g = lambda v: '—' if v is None else f'{v:+.3f}'
        tab.append([look, e['label'][:34], e['direct'][0][:34], e['indirect'][0][:34], e['runtime_rect'][:18], '—' if e['base_Y'] is None else f"{e['base_Y']:.3f}", f"{g(e['barsoff_rel'])} ({g(e['legacy_barsoff_rel'])} | {g(e['off_barsoff_rel'])})", f"{g(e['bakeoff_rel'])} ({g(e['off_bakeoff_rel'])})", f"{g(e['delta_vs_legacy'])} ({g(e['delta_vs_off'])})"])
w = [max(len(str(r[i])) for r in [cols] + tab) for i in range(len(cols))]
fmt = lambda r: '  '.join(str(r[i]).ljust(w[i]) for i in range(len(cols)))
lines += [fmt(cols), '-' * (sum(w) + 2 * len(cols))] + [fmt(r) for r in tab]
lines += ['', 'ball rows: rect lights are SPECULAR-only in ball programs on default (diffuse single-sourced from the baked grid); main (in parentheses) counts the bars twice', 'cloth / rails / room: the lightmaps store indirect only (+ direct visibility in A); the rect lights own their direct on both paths']
W = max(len(l) for l in lines) * 7 + 40; H = len(lines) * 17 + 30
im = Image.new('RGB', (W, H), (255, 255, 255)); dr = ImageDraw.Draw(im)
for i, l in enumerate(lines): dr.text((20, 15 + i * 17), l, fill=(0, 0, 0), font=font)
im.save(a.png)
print(f'[ledger] {len(rows_md)} rows → {a.out} {a.json} {a.png}')
for look, L in ledger.items():
    for key in ('ball_crown', 'ball_equator', 'ball_under', 'cloth', 'rails', 'room_floor'):
        e = L.get(key, {})
        if 'base_Y' in e: print(f"[ledger] {look} {key:12s} base {e['base_Y']} barsoff_rel {e['barsoff_rel']} (ref {e['legacy_barsoff_rel']} | main {e['off_barsoff_rel']}) bakeoff_rel {e['bakeoff_rel']} (main {e['off_bakeoff_rel']}) Δ vs ref {e['delta_vs_legacy']} (vs main {e['delta_vs_off']}) arm {e['arm_barsoff_rel']}")
