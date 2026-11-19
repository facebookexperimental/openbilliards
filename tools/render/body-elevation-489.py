# Copyright (c) Meta Platforms, Inc. and affiliates.

"""body-elevation-489 — GH-489 R3-SNK-BODY-1: the body-depth ELEVATION instrument.

Renders OUR table from a clay-study-489 dump as a true ORTHOGRAPHIC side elevation at
1 px = 1 mm (Cycles, the clay rig's grey), then reads the horizontal edges of the body
at named stations between the legs and reports every edge as "mm below the rail top",
the same datum the XW101 frames are read on (rail top = capping top, MODEL 40.18 above
the bed). With --photo <side elevation> --photo-anchors <json> it also registers the
render onto the photograph (plank-cap ends + rail-top row) and writes the overlay the
order calls the frame-overlay row.

usage (bpy venv python):
  body-elevation-489.py <dump.json> <out-dir> [--px-per-mm 1] [--stations=-715,744]   (a negative-first list needs the = form under argparse)
                        [--photo <png> --photo-anchors <json>] [--bands <json>]
Outputs: <out>/ours-side.png (+ .law.json), <out>/edges.json, <out>/overlay.png,
         <out>/REPORT.md; exit 1 when --bands is given and any judged depth is out of band.
The band file is a list of {name, value_mm, band:[lo,hi], edge_pick:'nearest'|'below'|'above', tag, source}
— the PHOTO reads of the round, never a number typed here.
"""
import sys, os, json, math, base64
try:
    import bpy  # noqa
    HAVE_BPY = True
except Exception:
    HAVE_BPY = False
import numpy as np
import argparse
def parse_args(argv):
    # FIX10 law (main's parse-first fence, applied at the #637 main merge): ONE parse of the whole argv to completion BEFORE any effect —
    # help exits 0, a missing / unknown argument exits 2; the first effect (the out-dir) follows from the PARSED values
    ap = argparse.ArgumentParser(prog='body-elevation-489.py', description='the body-depth ELEVATION instrument (GH-489 R3-SNK-BODY-1)')
    ap.allow_abbrev = False
    ap.add_argument('dump', help='clay-study-489 dump JSON'); ap.add_argument('out', help='output directory')
    ap.add_argument('--px-per-mm', default='1'); ap.add_argument('--stations', default='-715,-300,300,744')
    ap.add_argument('--photo', default=None); ap.add_argument('--photo-anchors', default=None); ap.add_argument('--bands', default=None)
    # under blender the tool's argv follows `--` (blender -b --python tool.py -- <dump> <out> …): the parse takes what follows it
    tail = argv
    for i, a in enumerate(argv):
        if a == '--': tail = argv[i + 1:]; break
    return ap.parse_args(tail)
opt_ns = parse_args(sys.argv[1:])
# FIX10 parse-complete — parse_args returned; every value below is the parsed one, the first effect follows
IN_BPY = 'bpy' in sys.modules or any(a.endswith('blender') for a in sys.argv[:1])
DUMP, OUT = opt_ns.dump, opt_ns.out
PPM = float(opt_ns.px_per_mm); STATIONS = [float(s) for s in opt_ns.stations.split(',')]
PHOTO = opt_ns.photo; ANCH = opt_ns.photo_anchors; BANDS = opt_ns.bands
os.makedirs(OUT, exist_ok=True)
RAIL_TOP_MM = 40.18  # MODEL (SNK_RAIL_TOP): capping top above the bed cloth
MARGIN = 0.05

def render():
    scene = bpy.context.scene
    bpy.ops.wm.read_factory_settings(use_empty=True); scene = bpy.context.scene
    d = json.load(open(DUMP))
    grey = bpy.data.materials.new('clay'); grey.use_nodes = True
    for n in grey.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED': n.inputs['Base Color'].default_value = (0.5, 0.5, 0.5, 1); n.inputs['Roughness'].default_value = 0.6
    allP = []
    for m in d['meshes']:
        enc = m.get('encoding', ''); dt = np.float32 if 'positions Float32' in enc else np.float64
        P = np.frombuffer(base64.b64decode(m['positions_b64']), dtype=dt).reshape(-1, 3).astype(np.float64)
        I = np.frombuffer(base64.b64decode(m['indices_b64']), dtype=np.uint32).reshape(-1, 3) if m['indices_b64'] else np.arange(len(P), dtype=np.uint32).reshape(-1, 3)
        if len(I) == 0: continue
        keep = (I[:, 0] != I[:, 1]) & (I[:, 1] != I[:, 2]) & (I[:, 0] != I[:, 2]); I = I[keep]
        if len(I) == 0: continue
        B = np.c_[P[:, 0], -P[:, 2], P[:, 1]]
        me = bpy.data.meshes.new(m['name'] or f"mesh{m['order']}"); me.from_pydata(B.tolist(), [], I.tolist()); me.update(); me.materials.append(grey)
        ob = bpy.data.objects.new(me.name, me); scene.collection.objects.link(ob); allP.append(B)
    allP = np.vstack(allP); mn, mx = allP.min(0), allP.max(0)
    w = bpy.data.worlds.new('W'); scene.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.9, 0.88, 0.85, 1); bg.inputs[1].default_value = 1.2
    ld = bpy.data.lights.new('L', 'AREA'); ld.shape = 'RECTANGLE'; ld.size = 4.0; ld.size_y = 2.0; ld.energy = 400
    lamp = bpy.data.objects.new('L', ld); scene.collection.objects.link(lamp); lamp.location = (0, 0, mx[2] + 1.2)
    cd = bpy.data.cameras.new('C'); cd.type = 'ORTHO'; cam = bpy.data.objects.new('C', cd); scene.collection.objects.link(cam); scene.camera = cam
    W_m = (mx[0] - mn[0]) + 2 * MARGIN; H_m = (mx[2] - mn[2]) + 2 * MARGIN
    cam.location = ((mx[0] + mn[0]) / 2, mn[1] - 5.0, (mx[2] + mn[2]) / 2); cam.rotation_euler = (math.pi / 2, 0, 0)
    cd.ortho_scale = W_m; cd.clip_end = 50
    RX, RY = int(round(W_m * 1000 * PPM)), int(round(H_m * 1000 * PPM))
    scene.render.resolution_x, scene.render.resolution_y = RX, RY; scene.render.resolution_percentage = 100
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 48; scene.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
        for dev in prefs.devices: dev.use = True
        scene.cycles.device = 'GPU'
    except Exception as e: print('GPU setup failed', e)
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGB'; scene.view_settings.view_transform = 'Standard'
    out = os.path.join(OUT, 'ours-side.png'); scene.render.filepath = out; bpy.ops.render.render(write_still=True)
    law = {'view': 'side', 'px_per_mm': PPM, 'res': [RX, RY], 'x0_mm': mn[0] * 1000 - MARGIN * 1000, 'top_mm': mx[2] * 1000 + MARGIN * 1000,
           'rail_top_mm': RAIL_TOP_MM, 'note': 'image x -> table length mm from x0_mm; image y (down) -> height above the bed from top_mm; 1 px = 1/px_per_mm mm; camera orthographic from the +z side'}
    json.dump(law, open(out + '.law.json', 'w'), indent=1); return out, law

def edges(png, law):
    from PIL import Image
    A = np.asarray(Image.open(png).convert('L')).astype(float)
    res = {}
    for xs in STATIONS:
        px = int(round((xs - law['x0_mm']) * law['px_per_mm'])); prof = A[:, px - 2:px + 3].mean(1); g = np.abs(np.diff(prof)); idx = np.where(g > 6)[0]
        runs = []
        for i in idx:
            if runs and i - runs[-1][1] <= 2: runs[-1][1] = i
            else: runs.append([i, i])
        res[str(xs)] = [{'below_rail_top_mm': round(law['rail_top_mm'] - (law['top_mm'] - ((r[0] + r[1]) / 2) / law['px_per_mm']), 1), 'strength': round(float(g[r[0]:r[1] + 1].max()), 1)} for r in runs]
    return res

def overlay(png, law, photo, anch):
    from PIL import Image, ImageDraw
    ph = Image.open(photo).convert('RGB'); ours = Image.open(png).convert('RGB')
    mmpx = anch['plank_mm'] / (anch['cap_right_px'] - anch['cap_left_px']); S = 1.0 / mmpx / law['px_per_mm']
    o = ours.resize((int(ours.width * S), int(ours.height * S)), Image.LANCZOS)
    ourLeft = (anch['our_cap_left_mm'] - law['x0_mm']) * law['px_per_mm'] * S; ourRail = (law['top_mm'] - law['rail_top_mm']) * law['px_per_mm'] * S
    dx, dy = int(round(anch['cap_left_px'] - ourLeft)), int(round(anch['rail_top_px'] - ourRail))
    a = np.asarray(o.convert('RGBA')).copy(); mask = a[..., :3].mean(2) < 235
    a[..., 0] = 255; a[..., 1] = 0; a[..., 2] = 200; a[..., 3] = (mask * 150).astype(np.uint8)
    ov = Image.new('RGBA', ph.size, (0, 0, 0, 0)); t = Image.fromarray(a); ov.paste(t, (dx, dy), t)
    out = Image.alpha_composite(ph.convert('RGBA'), ov); d = ImageDraw.Draw(out)
    for x in (anch['cap_left_px'], anch['cap_right_px']): d.line([(x, anch['rail_top_px'] - 30), (x, anch['rail_top_px'] + 300)], fill=(255, 255, 0, 255))
    d.line([(anch['cap_left_px'] - 30, anch['rail_top_px']), (anch['cap_right_px'] + 30, anch['rail_top_px'])], fill=(0, 255, 255, 255))
    d.text((anch['cap_left_px'], anch['rail_top_px'] - 45), f"frame-overlay row: OURS (magenta) at {mmpx:.3f} mm/px on {os.path.basename(photo)}; register = plank-cap ends + rail-top row", fill=(0, 0, 0, 255))
    p = os.path.join(OUT, 'overlay.png'); out.convert('RGB').save(p); return p, mmpx

if __name__ == '__main__':
    if not HAVE_BPY: print('run under the bpy venv python'); sys.exit(2)
    png, law = render(); E = edges(png, law); json.dump(E, open(os.path.join(OUT, 'edges.json'), 'w'), indent=1)
    lines = ['# body-elevation-489', f'dump {DUMP}', f'render {png} ({law["res"][0]}x{law["res"][1]} px, {PPM} px/mm)', '']
    for st, ed in E.items(): lines.append(f'station x {st} mm: ' + ', '.join(f"{e['below_rail_top_mm']:.0f} ({e['strength']:.0f})" for e in ed))
    fails = 0
    if BANDS:
        bands = json.load(open(BANDS)); lines.append(''); lines.append('| depth | PHOTO value | band | ours (nearest edge, median over stations) | verdict |'); lines.append('|---|---|---|---|---|')
        for b in bands:
            picks = []
            for st, ed in E.items():
                cands = [e['below_rail_top_mm'] for e in ed]
                if not cands: continue
                picks.append(min(cands, key=lambda v: abs(v - b['value_mm'])))
            ours_v = float(np.median(picks)) if picks else float('nan')
            ok = b['band'][0] <= ours_v <= b['band'][1]; fails += 0 if ok else 1
            lines.append(f"| {b['name']} | {b['value_mm']} ({b.get('tag','?')}) | [{b['band'][0]}, {b['band'][1]}] | {ours_v:.1f} | {'PASS' if ok else 'FAIL'} |")
    if PHOTO and ANCH:
        p, mmpx = overlay(png, law, PHOTO, json.load(open(ANCH))); lines.append(''); lines.append(f'overlay {p} at {mmpx:.3f} mm/px')
    open(os.path.join(OUT, 'REPORT.md'), 'w').write('\n'.join(lines) + '\n'); print('\n'.join(lines)); sys.exit(1 if fails else 0)
