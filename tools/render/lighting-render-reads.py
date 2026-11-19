#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-render-reads.py — the venue-lighting lane's DERIVED reads on our own renders (scene-linear HDR).

Same quantity codes as the photo reads (R-A ball terminator, R-B cushion-shadow floor, R-C vertical/horizontal,
R-D context, R-E ball crown / bed), but every ROI is DERIVED: a patch in the table's kernel frame (from the live spec
recorded by lighting-capture.mjs + the catalog numbers parsed from web/scene/table.js TABLE_SPECS) projected through
the camera matrices recorded at the shot — never a hand-picked pixel box. Reads the <pose>.hdr.f32 files (linear,
exposure-free) and reports median linear luminance per patch + ratios; writes an annotated PNG per pose (patch
outlines on the displayed frame) and a JSON per table.

  lighting-render-reads.py --capture DIR --out DIR [--looks default,sp] [--tables a,b] [--table-js web/scene/table.js]
"""
import argparse, json, os, re, sys
import numpy as np
OB_MARKER = 1000.0  # ORDER-LIGHT-C2-FIX6/7: the debug B-channel marker shading.js writes on in-shaft fragments (+1000); the reader selects B >= OB_MARKER - 1 and subtracts OB_MARKER

from PIL import Image, ImageDraw

Y_W = np.array([0.2126, 0.7152, 0.0722])
ALIAS = {'joy_q8_9ft': 'chinese8_pro_9ft', 'wpa_generic_9ft': None}


def parse_table_specs(path):
    """Regex read of TABLE_SPECS entries (numbers only — expressions are evaluated when they are simple arithmetic)."""
    src = open(path).read()
    out = {}
    for m in re.finditer(r'^  ([a-z0-9_]+): \{\n(.*?)^  \},', src, re.S | re.M):
        tid, body = m.group(1), m.group(2)
        rec = {}
        for key in ['length', 'width', 'cushionWidth', 'cornerMouth', 'sideMouth', 'cornerFacingDeviationDeg', 'sideFacingDeviationDeg',
                    'frameWidth', 'frameTop', 'profileBallD', 'bedAboveFloor', 'noseHeightFrac']:
            mm = re.search(r'\b' + key + r': ([^,\n]+)', body)
            if mm:
                expr = mm.group(1).strip()
                expr = re.sub(r'//.*', '', expr).strip()
                try:
                    rec[key] = float(eval(expr, {'__builtins__': {}}, {'Math': __import__('math'), 'sqrt': __import__('math').sqrt}))
                except Exception:
                    rec[key] = None
        out[tid] = rec
    # the scripted pin table ([SCRIPTED_PIN_TABLE_ID]) — kernel 2.54 x 1.27, cushion 0.0508, frame 0.145, bed 0.79
    out['wpa_generic_9ft'] = {'length': 2.54, 'width': 1.27, 'cushionWidth': 0.0508, 'cornerMouth': None, 'sideMouth': 0.137 + 2.0 * 0.0, 'sideFacingDeviationDeg': 7.14,
                              'cornerFacingDeviationDeg': 5.3, 'frameWidth': 0.145, 'frameTop': 0.047, 'profileBallD': 0.05715, 'bedAboveFloor': 0.79, 'noseHeightFrac': 0.635}
    return out


def parse_table_aliases(path):
    """The TABLE_SPECS alias block: every line-start `TABLE_SPECS.<id> = TABLE_SPECS.<target>;` as {id: target}."""
    return dict(re.findall(r'(?m)^TABLE_SPECS\.([a-z0-9_]+) = TABLE_SPECS\.([a-z0-9_]+);$', open(path).read()))


def load_idmap():
    """tools/render/d621/plan/idmap_621.py, loaded by path: the table id map read from web/scene/equipmentalias.js."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('idmap_621', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'd621', 'plan', 'idmap_621.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def resolve_table(table, specs, aliases, cur, path='the --table-js file'):
    """The TABLE_SPECS literal a capture table reads. An ALIAS key maps by ALIAS (None -> wpa_generic_9ft); any other id goes
    through the id map `cur` (the leaf's table renames, then its digest rows), then at most one alias-block hop. An id with no
    literal after that is refused (SystemExit): the reads never fall back to default numbers."""
    base = (ALIAS[table] or 'wpa_generic_9ft') if table in ALIAS else cur(table)
    if base not in specs and base in aliases:
        base = aliases[base]
    if base not in specs:
        raise SystemExit(f"lighting-render-reads: table {table} -> {base} has no TABLE_SPECS literal in {path} (id map, then alias block one hop); refusing default numbers")
    return base


class Cam:
    def __init__(self, rec, W, H):
        self.V = np.array(rec['V']).reshape(4, 4).T  # three stores column-major
        self.P = np.array(rec['P']).reshape(4, 4).T
        self.W, self.H = W, H
        self.pos = np.array(rec['pos'])

    def project(self, pts):  # pts Nx3 world (three frame) -> Nx2 px (top-down), plus depth flag
        p = np.c_[pts, np.ones(len(pts))]
        e = p @ self.V.T
        c = e @ self.P.T
        w = c[:, 3:4]
        ndc = c[:, :3] / np.where(np.abs(w) < 1e-9, 1e-9, w)
        px = np.c_[(ndc[:, 0] + 1) / 2 * self.W, (1 - (ndc[:, 1] + 1) / 2) * self.H]
        return px, (w[:, 0] > 0) & (np.abs(ndc[:, 0]) < 1) & (np.abs(ndc[:, 1]) < 1)


def k2w(kx, ky, h):
    return np.array([ky, h, kx], dtype=float)


def patch_pts(c0, du, dv, nu=16, nv=16):
    """grid of points over a parallelogram patch centre c0 with half-vectors du, dv (world)."""
    us = np.linspace(-1, 1, nu); vs = np.linspace(-1, 1, nv)
    return np.array([c0 + u * du + v * dv for u in us for v in vs])


def mask_from_pts(px, ok, shape, dil=1):
    m = np.zeros(shape, dtype=bool)
    p = px[ok]
    if len(p) == 0:
        return m
    xs = np.clip(np.round(p[:, 0]).astype(int), 0, shape[1] - 1); ys = np.clip(np.round(p[:, 1]).astype(int), 0, shape[0] - 1)
    m[ys, xs] = True
    if dil:
        from scipy.ndimage import binary_dilation
        m = binary_dilation(m, iterations=dil)
    return m


def load_hdr(path):
    meta = json.load(open(path + '.json'))
    return np.fromfile(path, dtype='<f4').reshape(meta['h'], meta['w'], 3).astype(np.float64), meta


def med(lin, m):
    if m.sum() < 4:
        return None
    return float(np.median(lin[m] @ Y_W))


def sat_frac(png, m):
    a = np.asarray(png.convert('RGB'))
    if m.sum() == 0:
        return None
    return float((a[m].max(axis=1) >= 250).mean())


def srgb_to_linear(u8):
    c = u8.astype(np.float64) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def disp_Y(png_lin, m_full):
    """display-domain luminance: the DISPLAYED PNG decoded by the sRGB EOTF (the same read the photo instrument
    makes), so photo ratios and render ratios share one tone-curve convention."""
    if m_full.sum() < 4:
        return None
    return float(np.median(png_lin[m_full] @ Y_W))


def ball_masks(cam, centre, R, shape, ds):
    """per-pixel sphere normals by ray casting from the camera; returns crown/equator/under masks (in HDR px)."""
    H, W = shape
    # project centre, estimate px radius from a point offset by R perpendicular to view
    ctr_px, ok = cam.project(centre[None, :])
    if not ok[0]:
        return None
    cx, cy = ctr_px[0] / ds
    d = np.linalg.norm(centre - cam.pos)
    # focal in px: from P[1,1] = 1/tan(fov/2) -> f_px = P11 * H/2
    f = cam.P[1, 1] * cam.H / 2 / ds
    r_px = f * R / max(1e-6, np.sqrt(d * d - R * R)) * (d / np.sqrt(d * d - R * R))
    r_px = f * R / d * 1.02
    yy, xx = np.mgrid[0:H, 0:W]
    u = (xx - cx) / r_px; v = (yy - cy) / r_px
    disc = u * u + v * v <= 0.92 ** 2  # inside the silhouette (rim excluded)
    if disc.sum() < 30:
        return None
    # camera basis (world): right = row0 of V rotation, up = row1, back = row2
    Rm = cam.V[:3, :3]
    right, up, back = Rm[0], Rm[1], Rm[2]
    nz = np.sqrt(np.clip(1 - u * u - v * v, 0, 1))
    # normal in world ≈ u*right - v*up + nz*(-back)... (v grows downward in px)
    n = (u[..., None] * right - v[..., None] * up + nz[..., None] * back)
    n_up = n[..., 1]
    crown = disc & (n_up > 0.55)
    equator = disc & (np.abs(n_up) < 0.18)
    under = disc & (n_up < -0.55) & (nz > 0.25)
    return {'disc': disc, 'crown': crown, 'equator': equator, 'under': under, 'centre_px': (cx * ds, cy * ds), 'r_px': r_px * ds, 'n': n}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--capture', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--looks', default='default,sp'); ap.add_argument('--tables')
    ap.add_argument('--table-js', default=os.path.join(os.path.dirname(__file__), '../../web/scene/table.js'))
    a = ap.parse_args()
    specs = parse_table_specs(a.table_js)
    aliases = parse_table_aliases(a.table_js)
    # the id map of the tree the --table-js belongs to (its web/scene/equipmentalias.js); a missing or unparseable leaf raises
    idmap = load_idmap()
    leaf_path = os.path.join(os.path.dirname(a.table_js), 'equipmentalias.js')
    idmap.load(leaf_path)
    cur = lambda t: idmap.current_table_id(t, leaf_path)
    resolved = set()
    man = json.load(open(os.path.join(a.capture, 'manifest.json')))
    os.makedirs(a.out, exist_ok=True)
    rows = []
    for run in man['runs']:
        if run.get('failed'):
            continue
        look, table = run['look'], run['table']
        if look not in a.looks.split(','):
            continue
        if a.tables and table not in a.tables.split(','):
            continue
        poke = run.get('poke')
        sub = os.path.join(look, table, poke) if poke else os.path.join(look, table)
        tkey = f'{table}@{poke}' if poke else table
        base = resolve_table(table, specs, aliases, cur, a.table_js)
        if base != table and tkey not in resolved:
            resolved.add(tkey)
            print(f'lighting-render-reads: {tkey} reads TABLE_SPECS.{base}')
        sp = dict(specs[base])
        k = run['derived']['kernel']
        HW, HL, CW, R = k['width'] / 2, k['length'] / 2, k['cushionWidth'], k['ballR']
        FW = sp.get('frameWidth') or 0.145; BED = sp.get('bedAboveFloor') or 0.79
        SM = sp.get('sideMouth') or 0.13; SDEV = np.radians(sp.get('sideFacingDeviationDeg') or 12)
        CM = sp.get('cornerMouth') or 0.116; CDEV = np.radians(sp.get('cornerFacingDeviationDeg') or 7)
        NOSE_H = (sp.get('noseHeightFrac') or 0.635) * 2 * R
        balls = {b['id']: b for b in (run.get('balls') or []) if isinstance(b, dict) and not b.get('pocketed')}
        # ORDER-LAND-638 (d): a ball RESTING on a modelled pocket closure is pocketed AND presented (#633 restRetained,
        # mesh visible, its radius live in uSpheres) — the cup pose reads THAT ball; every other pose keeps main's
        # rule (pocketed balls are not read)
        balls_rest = {b['id']: b for b in (run.get('balls') or []) if isinstance(b, dict) and b.get('pocketed') and (b.get('visible') is True or (b.get('visible') is None and b.get('r')))}
        odir = os.path.join(a.out, look, tkey); os.makedirs(odir, exist_ok=True)
        tres = {'table': tkey, 'look': look, 'poke': poke, 'spec': {'HW': HW, 'HL': HL, 'CW': CW, 'R': R, 'FW': FW, 'BED': BED, 'SM': SM, 'CM': CM}, 'poses': {}}
        # the census' venue block (derived probe SH coefficients + per-axis E) rides along for the gate's PROBE-pin row
        cpath = os.path.join(a.capture, look, table, poke) if poke else os.path.join(a.capture, look, table)
        cpath = os.path.join(cpath, 'census.json')
        if os.path.exists(cpath):
            try:
                cen = json.load(open(cpath))
                tres['venue'] = (cen.get('lighting') or {}).get('venue')
                # ORDER-LIGHT-9: the ball-shading witnesses ride along (SH blocks vs the grid, the occlusion table's anchors,
                # the moved-ball check) for the gate's SHFILL / OCC / SHMOVE rows
                for blk in ('giBlocks', 'occLut', 'shMove', 'contract'):
                    if isinstance(cen.get(blk), dict): tres[blk] = cen[blk]
                # ORDER-LIGHT-C2-FIX6 class J (J1): the data-texture census of the identity dump beside it — every material slot's texture record by
                # element type (half-float = Uint16Array, float = Float32Array, Uint8Array / Uint8ClampedArray, other), and how many DATA textures (an
                # element buffer present) carry no byte-true hash (0 on this tree; the sampled-element `hash` stays beside it for continuity)
                try:
                    ipath = os.path.join(os.path.dirname(cpath), 'identity.json')
                    if os.path.exists(ipath):
                        idd = json.load(open(ipath)); tx = {'total': 0, 'data': 0, 'halfFloat': 0, 'float32': 0, 'uint8': 0, 'other': 0, 'hashBytesMissing': 0, 'names': {}}
                        for mm in (idd.get('meshes') or []):
                            mats = mm.get('material'); mats = mats if isinstance(mats, list) else [mats]
                            for mat in mats:
                                if not isinstance(mat, dict): continue
                                for slot, rec in (mat.get('maps') or {}).items():
                                    if not isinstance(rec, dict): continue
                                    tx['total'] += 1
                                    el = rec.get('elem')
                                    isdata = bool(rec.get('w')) and isinstance(rec.get('hash'), str) and ':' not in rec.get('hash') and rec.get('hash') not in ('rt',) and not str(rec.get('hash')).startswith('cube:') and not str(rec.get('hash')).startswith('err:') and rec.get('hashScope') != 'full'
                                    if not isdata: continue
                                    tx['data'] += 1
                                    key = 'halfFloat' if el == 'Uint16Array' else ('float32' if el == 'Float32Array' else ('uint8' if el in ('Uint8Array', 'Uint8ClampedArray') else 'other'))
                                    tx[key] += 1
                                    if not rec.get('hashBytes'): tx['hashBytesMissing'] += 1
                                    if key in ('halfFloat', 'float32', 'other') and len(tx['names']) < 12: tx['names'][f"{mat.get('cls')}.{slot}"] = f"{el}:{rec.get('bytes')}"
                        tres['textures'] = tx
                except Exception as e:
                    tres['textures'] = {'error': str(e)[:120]}
                # ORDER-LIGHT-12 item 2: the bound texture's nine interior nodes vs the committed independent-quadrature fixture
                try:
                    oc = tres.get('occLut') or {}
                    if isinstance(oc.get('interiorNodes'), list):
                        fx = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'lighting-occlusion-check.json')))
                        tab = {(n['i'], n['j']): n['table'] for n in fx.get('nodes', [])}
                        ds = [abs(n['bound'] - tab[(n['i'], n['j'])]) for n in oc['interiorNodes'] if (n['i'], n['j']) in tab]
                        oc['interiorMaxDelta'] = max(ds) if ds else None; oc['interiorNodesChecked'] = len(ds)
                except Exception:
                    pass
                tres['dressing'] = (cen.get('dressing') or {}).get('mode')
                tres['lights'] = [(l.get('type'), l.get('name'), l.get('intensity')) for l in cen.get('lights', []) if l.get('type') == 'Light']
                # ORDER-LIGHT-6 Q1a: the compiled-GLSL programs census per material class (+ fillMissing = lit − venueSH)
                tres['programs'] = cen.get('programs')
                # GH-996 (card 45): the ball knee's armed thresholds and compile gate as the lighting leaf reported them (state().ballKnee)
                tres['ballKnee'] = (cen.get('lighting') or {}).get('ballKnee')
                if isinstance(tres['programs'], dict):
                    for C in (tres['programs'].get('classes') or {}).values():
                        if isinstance(C, dict):
                            C['fillMissing'] = int(C.get('lit', 0)) - int(C.get('venueSH', 0))
                            C['occMissing'] = int(C.get('lit', 0)) - int(C.get('occDerived', 0))  # ORDER-LIGHT-9 Q2/Q4: ball programs without the derived occlusion
                            C['rectDiffuseMissing'] = int(C.get('lit', 0)) - int(C.get('rectDiffuseOff', 0))
                            C['rectWeightedMissing'] = int(C.get('lit', 0)) - int(C.get('rectWeighted', 0))  # ORDER-LAND-638-FIX P1-b: lit ball programs without the weighted leg  # ORDER-LIGHT-11 R-A: programs that still carry the rect-light diffuse leg
                            C['gridDirectMissing'] = int(C.get('lit', 0)) - int(C.get('gridDirect', 0))  # ORDER-LIGHT-C2-FIX3 class A: lit ball programs WITHOUT the compiled grid-direct split (0 on the fixed tree; = lit under ?venueGridShadow=legacy)
                            C['gridDirectFix3'] = int(C.get('gridDirectFix3', 0))  # ORDER-LIGHT-C2-FIX4: the FIX3 post-BRDF form (the arm text), 0 on the fixed tree
                            C['linkFailed'] = int(C.get('linkFailed', 0))  # ORDER-LIGHT-C2-FIX4: programs that did not LINK (0 on a healthy tree; a spliced text that fails to compile renders nothing)
                            C['gridNegDebug'] = int(C.get('gridNegDebug', 0))  # ORDER-LIGHT-C2-FIX4: ball programs writing the sign of their indirect diffuse (?venueGridDebug=neg)
                            C['gridWell'] = int(C.get('gridWell', 0))  # ORDER-LIGHT-C2-FIX5 class F: ball programs carrying the closure-shaft split of the replacement key (v' + i' + h)
                            C['gridLampDebug'] = int(C.get('gridLampDebug', 0))  # ORDER-LIGHT-C2-FIX5 F1: ball programs writing the lamp-term debug channels (?venueGridDebug=lamp)
                            C['gridWellMissing'] = int(C.get('lit', 0)) - C['gridWell']  # ORDER-LIGHT-C2-FIX5 F4: lit ball programs WITHOUT the shaft split (0 on the fixed venue boot; every lit program on the legacy twin)
                            C['gridLampDebugMissing'] = int(C.get('lit', 0)) - C['gridLampDebug']  # ORDER-LIGHT-C2-FIX5 F1: lit ball programs without the debug channels (0 on the debug sets, whatever the scene's ball count)
                            C['ballKnee'] = int(C.get('ballKnee', 0))  # GH-996 (card 45): ball programs carrying the diffuse knee (the census omits a zero count)
                            C['ballKneeDebug'] = int(C.get('ballKneeDebug', 0))  # GH-996: ball programs writing the PRE-knee diffuse (?ballKneeDebug=diffuse)
                            C['ballKneeMissing'] = int(C.get('lit', 0)) - C['ballKnee']  # GH-996: lit ball programs WITHOUT the knee (0 on a venue boot; every lit program under ?venue=off)
                            C['ballKneeDebugMissing'] = int(C.get('lit', 0)) - C['ballKneeDebug']  # GH-996: lit ball programs without the debug read (0 on the knee sets)
            except Exception:
                pass
        for p in run['poses']:
            name = p['name']
            hdr_path = os.path.join(a.capture, sub, name + '.hdr.f32')
            png_path = os.path.join(a.capture, sub, name + '.png')
            if not (os.path.exists(hdr_path) and os.path.exists(png_path) and p.get('camera')):
                continue
            lin, meta = load_hdr(hdr_path); ds = meta['ds']
            png = Image.open(png_path).convert('RGB')
            png_lin = srgb_to_linear(np.asarray(png))
            def full(m):  # HDR-res mask -> displayed-res mask
                return np.kron(m, np.ones((ds, ds), dtype=bool))[:png.height, :png.width] if ds > 1 else m
            cam = Cam(p['camera'], meta['W'], meta['H'])
            shape = lin.shape[:2]
            patches = {}   # name -> (mask_hdr, colour)
            def add(nm, pts, col=(255, 0, 255), dil=1):
                px, ok = cam.project(pts)
                m = mask_from_pts(px / ds, ok, shape, dil)
                if m.sum() >= 4:
                    patches[nm] = (m, col, px[ok])
            ex = k2w(1, 0, 0) - k2w(0, 0, 0)  # +kx unit (world z)
            ey = k2w(0, 1, 0) - k2w(0, 0, 0)  # +ky unit (world x)
            eh = np.array([0, 1, 0.])
            if name in ('cushion_shadow', 'mid_close_diag', 'cueball_level', 'corner_close_diag', 'mid_tt_inside', 'corner_tt_diag'):
                # R-B: open bed patch 0.25 m inboard of the +x long rail at the pose's ky; shadow strip 6–20 mm inboard of the nose
                # ky0 keeps every strip clear of the side-pocket cut at ky = 0 (SM/2 + jaw) and inside the frame
                # mid_close_diag: the camera sits at ky −0.15, so the strips go on the FAR side of the mouth (+ky)
                ky0 = {'cushion_shadow': -0.25, 'mid_close_diag': 0.20, 'cueball_level': None, 'corner_close_diag': HL - 0.45,
                       'mid_tt_inside': -0.22, 'corner_tt_diag': HL - 0.5}.get(name)
                if ky0 is None and 0 in balls:
                    b = balls[0]; ky0 = b['pos'][0] - 0.12
                    # cueball_level: the open-bed reference must sit INSIDE the tight frame — a
                    # 2 x 2 cm patch 75 mm beside the ball (kx − 0.075; the key is overhead, so
                    # the ball's own shadow pool stays under the ball, not here)
                    add('bed_open', patch_pts(k2w(b['pos'][2] - 0.075, b['pos'][0], 0.0005), 0.01 * ex, 0.01 * ey, 12, 12), (0, 255, 0))
                    ky0 = None
                if ky0 is not None:
                    bx = 0.25 if name in ('cushion_shadow', 'cueball_level', 'corner_close_diag', 'corner_tt_diag') else 0.11
                    bw = 0.05 if bx > 0.2 else 0.02
                    by = 0.04 if name == 'mid_close_diag' else ky0  # mid pose: the open-bed reference sits between the mouth and the camera
                    add('bed_open', patch_pts(k2w(HW - bx, by, 0.0005), bw * ex, 0.04 * ey), (0, 255, 0))
                    add('bed_shadow_strip', patch_pts(k2w(HW - 0.013, ky0, 0.0005), 0.007 * ex, 0.10 * ey, 8, 40), (255, 128, 0))
                    add('bed_near_nose_40mm', patch_pts(k2w(HW - 0.040, ky0, 0.0005), 0.006 * ex, 0.10 * ey, 8, 40), (255, 200, 0))
                    add('bed_near_nose_75mm', patch_pts(k2w(HW - 0.075, ky0, 0.0005), 0.025 * ex, 0.10 * ey, 10, 40), (255, 230, 120))
                    add('rail_top', patch_pts(k2w(HW + CW * 0.55, ky0, NOSE_H + 0.004), 0.010 * ex, 0.10 * ey, 8, 40), (0, 200, 255))
                    # R-C approx: the cushion nose face (near-vertical, facing -kx) below the nose tip
                    add('nose_face', patch_pts(k2w(HW + 0.002, ky0, NOSE_H * 0.45), 0.0 * ex + 0.35 * NOSE_H * eh, 0.10 * ey, 8, 40), (255, 0, 0))
            if name in ('mid_close_diag', 'mid_tt_inside', 'mid_edgeon'):
                # R-C: side-pocket jaw faces (vertical cloth faces perpendicular to the rail), both sides of the mouth
                for sgn, nm in ((-1, 'jaw_face_S'), (1, 'jaw_face_N')):
                    # face passes through the mouth end (HW, sgn*SM/2) and recedes outward at the facing deviation
                    t = 0.018  # 18 mm outward along the face
                    c = k2w(HW + t, sgn * (SM / 2 + t * np.tan(SDEV)), 0.016)
                    along = (np.cos(SDEV) * ex + sgn * np.sin(SDEV) * ey) * 0.010
                    add(nm, patch_pts(c, along, 0.009 * eh, 12, 12), (255, 0, 0))
            if name in ('corner_close_diag', 'corner_tt_diag', 'corner_close_rail'):
                # corner jaw faces: the two faces flanking the corner mouth (mouth width CM across the 45° corner)
                for sgn, nm in ((-1, 'cjaw_face_A'), (1, 'cjaw_face_B')):
                    t = 0.02
                    if sgn < 0:  # face on the long rail side: passes through (HW, HL - CM/√2), recedes +kx
                        c = k2w(HW + t, HL - CM / np.sqrt(2) - t * np.tan(CDEV), 0.016); along = (np.cos(CDEV) * ex - np.sin(CDEV) * ey) * 0.010
                    else:        # face on the end rail side: passes through (HW - CM/√2, HL), recedes +ky
                        c = k2w(HW - CM / np.sqrt(2) - t * np.tan(CDEV), HL + t, 0.016); along = (np.cos(CDEV) * ey - np.sin(CDEV) * ex) * 0.010
                    add(nm, patch_pts(c, along, 0.009 * eh, 12, 12), (255, 0, 0))
                add('bed_open', patch_pts(k2w(HW - 0.30, HL - 0.42, 0.0005), 0.05 * ex, 0.05 * ey), (0, 255, 0))
            if name in ('apron_leg', 'full34', 'overview'):
                # R-D: apron face (+kx side, vertical, facing +kx), floor beside the table, bed centre,
                # and the ROOM walls (room.js box x ±4.5 / z ±3.0; the −z wall behind the bench, the +x cue-rack wall).
                # NOTE the projection carries no occlusion test: a patch is only valid where the sight line is clear
                # (floor_beside sits beside the +kx rail under the full34/overview cameras; a floor patch beyond the
                # foot end projected THROUGH the table and was removed)
                add('wall_far', patch_pts(np.array([-1.0, 0.9, -2.99]), np.array([0.6, 0, 0]), np.array([0, 0.3, 0]), 20, 12), (200, 120, 255))
                add('wall_side', patch_pts(np.array([4.49, 0.5, 1.2]), np.array([0, 0, 0.4]), np.array([0, 0.3, 0]), 16, 12), (160, 80, 220))
                # the dressing furniture (room.js wall props): bench seat top (walnut) at (1.35, −0.33+0.035, −2.775) 1.76 × 0.42,
                # bench backrest front face (walnut) at z −2.925, and the black leather pad top at y −0.245
                add('bench_seat', patch_pts(np.array([1.35, -0.294, -2.575]), np.array([0.7, 0, 0]), np.array([0, 0, 0.02]), 24, 6), (255, 170, 60))
                add('bench_back', patch_pts(np.array([1.35, 0.03, -2.924]), np.array([0.7, 0, 0]), np.array([0, 0.12, 0]), 24, 8), (255, 140, 30))
                add('bench_pad', patch_pts(np.array([1.35, -0.244, -2.775]), np.array([0.7, 0, 0]), np.array([0, 0, 0.14]), 24, 8), (200, 100, 20))
                add('apron_face', patch_pts(k2w(HW + CW + FW + 0.002, 0.2, -0.09), 0.0 * ex + 0.04 * eh, 0.25 * ey, 10, 30), (0, 200, 255))
                add('floor_beside', patch_pts(k2w(HW + CW + FW + 0.9, -0.2, -BED + 0.003), 0.15 * ex, 0.4 * ey), (200, 200, 0))
                add('bed_centre', patch_pts(k2w(0.0, -0.4, 0.0005), 0.15 * ex, 0.15 * ey), (0, 255, 0))
                add('bed_edge', patch_pts(k2w(HW - 0.05, -0.4, 0.0005), 0.03 * ex, 0.15 * ey), (0, 160, 0))
            balls_read = {}
            if name.startswith('cup_sweep_') or name in ('cueball_level', 'rack_level', 'overview', 'full34', 'corner_tt_diag', 'mid_tt_inside', 'cup_rest', 'crevice', 'crevice_graze'):
                for bid, b in (balls_rest if (name == 'cup_rest' or name.startswith('cup_sweep_')) else balls).items():
                    ctr = np.array(b['pos'], dtype=float); rb = b.get('r') or R
                    bm = ball_masks(cam, ctr, rb, shape, ds)
                    if not bm or bm['r_px'] < 24:
                        continue
                    rec = {'r_px': float(bm['r_px']), 'centre_px': [float(v) for v in bm['centre_px']]}
                    for part in ('crown', 'equator', 'under', 'disc'):
                        m = bm[part]
                        rec[part + '_Y'] = med(lin, m)
                        rec[part + '_n'] = int(m.sum())
                        rec[part + '_sat'] = sat_frac(png, full(m))
                        rec[part + '_Yd'] = disp_Y(png_lin, full(m))
                    # GH-996 (card 45 C2): the crown's per-pixel MAX channel on the scene-linear HDR (exposure-free), max and p99 over the
                    # crown band; under ?ballKneeDebug=diffuse it is the PRE-knee diffuse the ball knee compares with T = 1.6·b
                    mc = lin[bm['crown']].max(axis=1) if bm['crown'].sum() else None
                    rec['crown_maxch'] = float(mc.max()) if mc is not None else None
                    rec['crown_maxch_p99'] = float(np.percentile(mc, 99)) if mc is not None else None
                    # ORDER-LAND-638: the equator ratio no longer rides the under band's existence — a ball resting in a
                    # pocket cup shows its equator but no under band from the register (0 under pixels); values for a
                    # ball with both bands are unchanged
                    if rec['crown_Y'] and rec['under_Y'] is not None:
                        rec['under_over_crown'] = rec['under_Y'] / rec['crown_Y']
                    if rec['crown_Y'] and rec['equator_Y'] is not None:
                        rec['equator_over_crown'] = rec['equator_Y'] / rec['crown_Y']
                    if rec.get('crown_Yd') and rec.get('under_Yd') is not None:
                        rec['under_over_crown_disp'] = rec['under_Yd'] / rec['crown_Yd']
                    if rec.get('crown_Yd') and rec.get('equator_Yd') is not None:
                        rec['equator_over_crown_disp'] = rec['equator_Yd'] / rec['crown_Yd']
                    # ORDER-LIGHT-C2-FIX3 class A (the A1 fixture): the equator split by the NEAREST other ball's direction in the image — eqnear = the
                    # half facing it (the lamp-shadowed side when the balls touch), eqfar = the half looking away. DERIVED from the two projected
                    # centres (a half-plane through this ball's centre), no constant; None when no other ball is on the bed or none projects.
                    pool = balls_rest if (name == 'cup_rest' or name.startswith('cup_sweep_')) else balls
                    nb = None; nd = None
                    for ob, o in pool.items():
                        if str(ob) == str(bid) or (o.get('pocketed') and not o.get('visible')) or not o.get('pos'):
                            continue
                        dd = float(np.linalg.norm(np.array(o['pos'], dtype=float) - ctr))
                        if nd is None or dd < nd:
                            nd, nb = dd, ob
                    rec['neighbour'] = (str(nb) if nb is not None else None); rec['neighbour_m'] = nd
                    rec['eqnear_Y'] = None; rec['eqfar_Y'] = None; rec['eq_near_over_far'] = None
                    if nb is not None:
                        npx, nok = cam.project(np.array(pool[nb]['pos'], dtype=float)[None, :])
                        if nok[0]:
                            cx0, cy0 = bm['centre_px'][0] / ds, bm['centre_px'][1] / ds
                            ddx, ddy = npx[0][0] / ds - cx0, npx[0][1] / ds - cy0
                            if float(np.hypot(ddx, ddy)) > 0:
                                Hh, Ww = shape
                                gy, gx = np.mgrid[0:Hh, 0:Ww]
                                near = ((gx - cx0) * ddx + (gy - cy0) * ddy) > 0
                                mnear = bm['equator'] & near; mfar = bm['equator'] & ~near
                                rec['eqnear_Y'] = med(lin, mnear); rec['eqfar_Y'] = med(lin, mfar)
                                rec['eqnear_n'] = int(mnear.sum()); rec['eqfar_n'] = int(mfar.sum())
                                if rec['eqnear_Y'] is not None and rec['eqfar_Y']:
                                    rec['eq_near_over_far'] = rec['eqnear_Y'] / rec['eqfar_Y']
                                patches[f'ball{bid}_eqnear'] = (mnear, (255, 128, 0), None)
                                patches[f'ball{bid}_eqfar'] = (mfar, (0, 128, 255), None)
                    # ORDER-LIGHT-C2-FIX3 class A (the A1 fixture, DERIVED): the lamps' visibility from every disc pixel's SURFACE POINT — the census's
                    # visible RectAreaLights sampled along their length at ball-radius spacing, each sample weighted by the Lambertian form factor
                    # (receiver cosine × emitter cosine / distance², × intensity), each ray tested against every other ball on the bed as a sphere
                    # occluder. V = the lit fraction of the lamp irradiance the point would receive; lampshadow_Y = Σ(1−V)·Y / Σ(1−V) (the
                    # shadow-weighted luminance of the disc), lamplit_Y = ΣV·Y / ΣV. No constant: the weights are the geometry's own.
                    try:
                        bars = [l for l in (cen.get('lights') or []) if l.get('type') == 'RectAreaLight' and l.get('visible') and (l.get('intensity') or 0) > 0 and l.get('pos') and l.get('w')]
                        others = [np.array(o['pos'], dtype=float) for ob, o in pool.items() if str(ob) != str(bid) and o.get('pos') and not (o.get('pocketed') and not o.get('visible'))]
                        if bars and others:
                            dm = bm['disc']; nn = bm['n'][dm]; Pw = ctr[None, :] + rb * nn; Yd = lin[dm] @ Y_W
                            num = np.zeros(len(Pw)); den = np.zeros(len(Pw))
                            for l in bars:
                                lp = np.array(l['pos'], dtype=float); w_ = float(l['w']); K = max(1, int(np.ceil(w_ / rb)))
                                for k in range(K):
                                    L = lp + np.array([-w_ / 2 + w_ * (k + 0.5) / K, 0.0, 0.0])
                                    dv = L[None, :] - Pw; d2 = (dv * dv).sum(1); dl = np.sqrt(d2); dh = dv / dl[:, None]
                                    wgt = np.clip((nn * dh).sum(1), 0, None) * np.clip(dh[:, 1], 0, None) / d2 * float(l.get('intensity') or 1)
                                    vis = np.ones(len(Pw))
                                    for C in others:
                                        cp = C[None, :] - Pw; t = np.clip((cp * dv).sum(1) / d2, 0, 1); q = Pw + t[:, None] * dv - C[None, :]
                                        vis = vis * ((q * q).sum(1) >= rb * rb)
                                    num += wgt * vis; den += wgt
                            V = np.where(den > 0, num / np.maximum(den, 1e-30), 1.0)
                            sw = (1.0 - V).sum(); lw = V.sum()
                            rec['lampshadow_Y'] = float(((1.0 - V) * Yd).sum() / sw) if sw > 0 else None
                            rec['lamplit_Y'] = float((V * Yd).sum() / lw) if lw > 0 else None
                            rec['lampshadow_w'] = float(sw); rec['lampshadow_frac'] = float(sw / max(1, len(V))); rec['lampshadow_minV'] = float(V.min())
                            rec['lampshadow_px'] = int((V < 1.0).sum()); rec['lamp_bars'] = len(bars); rec['lamp_samples'] = int(sum(max(1, int(np.ceil(float(l['w']) / rb))) for l in bars))
                            m_sh = np.zeros_like(dm); m_sh[dm] = V < 1.0
                            patches[f'ball{bid}_lampshadow'] = (m_sh, (255, 0, 0), None)
                    except Exception as e:
                        rec['lampshadow_error'] = str(e)[:120]
                    # ORDER-LIGHT-C2-FIX4 class A (the A1 witness): under ?venueGridDebug=neg the ball program writes 1.0 where its indirect diffuse has a
                    # negative channel and 0.0 elsewhere; debugneg_px counts disc pixels at or above the midpoint of that binary output (scene-linear,
                    # pre-tonemap). Computed on every frame (cheap); meaningful only for the debug sets (elsewhere it counts bright pixels).
                    rec['debugneg_px'] = int(((lin[bm['disc']] @ Y_W) >= 0.5).sum()) if bm['disc'].sum() else None
                    # ORDER-LIGHT-C2-FIX5 class F (the F1 read): under ?venueGridDebug=lamp the ball program writes R = the replacement key's lamp-accounted
                    # diffuse term as it lands (linear luminance) and G = the live direct diffuse term (the LTC leg the grid replaces, carrying spikeShadow —
                    # the sphere shadow and the shaft's lamp visibility); debuglamp_rep / debuglamp_live = their means over the disc, debuglamp_ratio their
                    # quotient (the form: min(K, D)/D × vis_rep/vis_live — 1 exactly when the key covers the lamp and the two visibilities agree). Meaningful
                    # only for the lamp-debug sets (elsewhere it reads the frame's R / G means).
                    # ORDER-LIGHT-C2-FIX6: the debug B channel carries a +1000 MARKER on the fragments the well block ran on (in-shaft ball fragments); only
                    # those pixels are read (the projected disc also covers the pocket rim / the plug / an open cap — real shading that used to bias the
                    # means: at the low sweep registers the ball is mostly hidden behind the rim). The frame is the scene-linear HDR (`lin`), never the PNG.
                    # the HDR frame is a 2x box-downsample: a pixel that averaged marked and unmarked fragments reads B in (0, 1000) — only FULLY marked
                    # pixels (every source fragment in-shaft ball: B >= 999) are read, so a silhouette / rim-edge pixel never dilutes the means
                    _sel = bm['disc'] & (lin[..., 2] >= OB_MARKER - 1.0)  # C2-FIX7: one constant with the shader (MARKER − 1)
                    rec['debug_px'] = int(_sel.sum())
                    if _sel.sum():
                        _dl = lin[_sel].astype(np.float64).copy(); _dl[:, 2] -= OB_MARKER
                        rec['debuglamp_rep'] = float(_dl[:, 0].mean()); rec['debuglamp_live'] = float(_dl[:, 1].mean()); rec['debuglamp_aux'] = float(_dl[:, 2].mean())
                        rec['debuglamp_ratio'] = float(rec['debuglamp_rep'] / rec['debuglamp_live']) if rec['debuglamp_live'] > 1e-9 else None
                        # ORDER-LIGHT-C2-FIX6 I1 (?venueGridDebug=split: R = lamp, G = remainder × hemi, B = the unsplit indirect diffuse): the energy excess of the split
                        # over the disc, mean(R + G − B) — ≤ 0 = no energy added (conserved by construction); the 5667a488 form reads > 0, most at grazing
                        rec['debugsplit_excess'] = float((_dl[:, 0] + _dl[:, 1] - _dl[:, 2]).mean()); rec['debugsplit_excess_max'] = float((_dl[:, 0] + _dl[:, 1] - _dl[:, 2]).max())
                        rec['debugsplit_excess_rel'] = float(rec['debugsplit_excess'] / rec['debuglamp_aux']) if rec['debuglamp_aux'] > 1e-9 else None
                    else:
                        rec['debuglamp_rep'] = None; rec['debuglamp_live'] = None; rec['debuglamp_aux'] = None; rec['debuglamp_ratio'] = None; rec['debugsplit_excess'] = None; rec['debugsplit_excess_max'] = None; rec['debugsplit_excess_rel'] = None
                    # peak (specular) and clipping of the whole disc in the DISPLAYED frame
                    dm = bm['disc']
                    rec['disc_max_lin'] = float((lin[dm] @ Y_W).max()) if dm.sum() else None
                    balls_read[str(bid)] = rec
                    patches[f'ball{bid}_crown'] = (bm['crown'], (255, 255, 0), None)
                    patches[f'ball{bid}_under'] = (bm['under'], (255, 0, 255), None)
                    patches[f'ball{bid}_eq'] = (bm['equator'], (0, 255, 255), None)
            reads = {}
            for nm, (m, col, _) in patches.items():
                reads[nm] = {'Y': med(lin, m), 'n': int(m.sum()), 'sat': sat_frac(png, full(m)), 'Yd': disp_Y(png_lin, full(m))}
            ratios = {}
            def ratio(a_, b_, label):
                if reads.get(a_, {}).get('Y') and reads.get(b_, {}).get('Y'):
                    ratios[label] = reads[a_]['Y'] / reads[b_]['Y']
                if reads.get(a_, {}).get('Yd') and reads.get(b_, {}).get('Yd'):
                    ratios[label + '_disp'] = reads[a_]['Yd'] / reads[b_]['Yd']
            ratio('bed_shadow_strip', 'bed_open', 'shadow_floor'); ratio('bed_near_nose_40mm', 'bed_open', 'near40_over_bed'); ratio('bed_near_nose_75mm', 'bed_open', 'near75_over_bed')
            ratio('rail_top', 'bed_open', 'railtop_over_bed'); ratio('nose_face', 'bed_open', 'noseface_over_bed')
            ratio('jaw_face_S', 'bed_open', 'jawS_over_bed'); ratio('jaw_face_N', 'bed_open', 'jawN_over_bed')
            ratio('cjaw_face_A', 'bed_open', 'cjawA_over_bed'); ratio('cjaw_face_B', 'bed_open', 'cjawB_over_bed')
            ratio('apron_face', 'bed_centre', 'apron_over_bed'); ratio('floor_beside', 'bed_centre', 'floor_over_bed'); ratio('bed_edge', 'bed_centre', 'bededge_over_centre')
            ratio('wall_far', 'bed_centre', 'wallfar_over_bed'); ratio('wall_side', 'bed_centre', 'wallside_over_bed')
            ratio('bench_seat', 'bed_centre', 'benchseat_over_bed'); ratio('bench_back', 'bed_centre', 'benchback_over_bed'); ratio('bench_pad', 'bed_centre', 'benchpad_over_bed')
            for bid, br in balls_read.items():
                if br.get('crown_Y') and reads.get('bed_open', {}).get('Y'):
                    ratios[f'ball{bid}_crown_over_bed'] = br['crown_Y'] / reads['bed_open']['Y']
                if br.get('crown_Yd') and reads.get('bed_open', {}).get('Yd'):
                    ratios[f'ball{bid}_crown_over_bed_disp'] = br['crown_Yd'] / reads['bed_open']['Yd']
                if 'under_over_crown_disp' in br:
                    ratios[f'ball{bid}_under_over_crown_disp'] = br['under_over_crown_disp']
                if 'equator_over_crown_disp' in br:
                    ratios[f'ball{bid}_eq_over_crown_disp'] = br['equator_over_crown_disp']
                if 'under_over_crown_disp' in br or 'equator_over_crown_disp' in br:
                    ratios[f'ball{bid}_disc_sat'] = br['disc_sat']
                if br.get('crown_Y') and reads.get('bed_centre', {}).get('Y'):
                    ratios[f'ball{bid}_crown_over_bedcentre'] = br['crown_Y'] / reads['bed_centre']['Y']
            tres['poses'][name] = {'reads': reads, 'balls': balls_read, 'ratios': ratios}
            # annotate
            im = png.copy(); d = ImageDraw.Draw(im)
            for nm, (m, col, _) in patches.items():
                ys, xs = np.nonzero(m)
                if len(xs) == 0:
                    continue
                x0, x1, y0, y1 = xs.min() * ds, (xs.max() + 1) * ds, ys.min() * ds, (ys.max() + 1) * ds
                d.rectangle([x0, y0, x1, y1], outline=col, width=2)
                txt = f"{nm} Y={reads[nm]['Y']:.4f}" if reads[nm]['Y'] is not None else nm
                d.rectangle([x0, max(0, y0 - 13), x0 + 6.2 * len(txt) + 4, y0], fill=(0, 0, 0)); d.text((x0 + 2, max(0, y0 - 12)), txt, fill=col)
            yy = 4
            for kk, vv in ratios.items():
                if kk.endswith('_disp') or kk.endswith('_disc_sat'):
                    continue
                t_ = f'{kk} = {vv:.3f}'; d.rectangle([4, yy, 8 + 6.2 * len(t_), yy + 13], fill=(0, 0, 0)); d.text((6, yy + 1), t_, fill=(0, 255, 255)); yy += 15
            for bid, br in balls_read.items():
                if 'under_over_crown' in br:
                    t_ = f"ball{bid} under/crown {br['under_over_crown']:.3f} eq/crown {br['equator_over_crown']:.3f} crownY {br['crown_Y']:.3f} sat {br['disc_sat']}"
                    d.rectangle([4, yy, 8 + 6.2 * len(t_), yy + 13], fill=(0, 0, 0)); d.text((6, yy + 1), t_, fill=(255, 255, 0)); yy += 15
            im.save(os.path.join(odir, name + '-reads.png'))
            for kk, vv in ratios.items():
                rows.append({'look': look, 'table': tkey, 'pose': name, 'ratio': kk, 'value': vv})
        json.dump(tres, open(os.path.join(odir, 'reads.json'), 'w'), indent=1)
    json.dump(rows, open(os.path.join(a.out, 'ratios.json'), 'w'), indent=1)
    # summary table
    md = ['| look | table | pose | ratio | value |', '|---|---|---|---|---|'] + [f"| {r['look']} | {r['table']} | {r['pose']} | {r['ratio']} | {r['value']:.4f} |" for r in rows]
    open(os.path.join(a.out, 'ratios.md'), 'w').write('\n'.join(md) + '\n')
    print(f'{len(rows)} ratio rows -> {a.out}')


if __name__ == '__main__':
    main()
