# Copyright (c) Meta Platforms, Inc. and affiliates.

"""clay-study-489-render.py — render OUR snooker table dump as a neutral-grey CLAY
study in the SAME rig the purchased-model (Rasson Magnum II) study renders were
made with, so a blind "same construction?" question is answered by form, not by
material (GH-489 craft R3-SNK-5B S1; R3-SNK-6 S6-1: one frame law, smooth
normals, mirror-test marker). Reads ONLY our dump (tools/render/
clay-study-489.mjs output); no purchased bytes are touched. The rig below is the
study tool's own description, copied constant for constant:

  material  Principled BSDF, base colour 0.5 grey, roughness 0.6, specular 0.5
  world     background (0.9, 0.88, 0.85) strength 1.2
  lamp      one rectangular area light 3.0 x 1.2 m, 400 W, over the table
            centre, 2000 mm above the purchased model's floor datum = 1189.7 mm
            above the bed-cloth top (its bed top sits at z 810.3); our bed top
            is y = 0, so the lamp sits at Z = 1.1897 m
  engine    Cycles, 64 samples, denoise, GPU Metal when available
  view      Standard (sRGB), exposure 0, 1600 x 1000, PNG RGB
  camera    sensor 24 mm vertical, lens = 12 / tan(fov/2) (30 deg poses,
            26 deg edge-on, 42 deg overview), clip 5 mm .. 100 m
  poses     the nine frozen craft-look poses (tools/render/fixtures/
            craft-look-poses.json, kernel frame [kx, ky, h] metres) + the two
            x2 zoom frames the study bank carries

FRAME LAW: tools/render/clay-study-489-frame.py (shared with the quarantine
study tool) — kernel [kx, ky, h] -> three (ky, h, kx) -> Blender (ky, -kx, h).
The R3-SNK-5B `--mirror-study` flag is RETIRED: it existed only to match the
study tool's mirrored frame; the study tool now uses this law.

NORMALS: the dump carries the app's per-vertex world-space normals; they are
applied as custom split normals so our surfaces shade as the app shades them
(the R3-SNK-5B clay frames were flat-shaded triangles — a stimulus defect).
Meshes without a normal attribute stay flat.

Run (the Blender python lives in the quarantine tooling venv — technique, not mesh):
  /tmp/ob-3dm-tools/bpy-venv/bin/python tools/render/clay-study-489-render.py <dump.json> <out-dir>
      [--lamp W] [--world-diffuse S] [--poses a,b,c] [--marker kx,ky,h | --marker default]
Outputs: <out>/<pose>.png + manifest.json (rig, frame law, camera per pose, sha256 per frame).
"""
import bpy, math, os, json, time, hashlib, sys, base64, importlib.util
import numpy as np
from mathutils import Vector

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('clay_frame', os.path.join(_HERE, 'clay-study-489-frame.py'))
F = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(F)

argv = sys.argv[1:]
pos_args = [a for i, a in enumerate(argv) if not a.startswith('-') and (i == 0 or not argv[i - 1].startswith('--'))]
if len(pos_args) < 2:
    print('usage: clay-study-489-render.py <dump.json> <out-dir> [--lamp W] [--world-diffuse S] [--poses a,b] [--marker kx,ky,h|default]'); sys.exit(2)
DUMP, OUT = pos_args[0], pos_args[1]
def _opt(flag, dflt):
    return argv[argv.index(flag) + 1] if flag in argv else dflt
# RIG v2 INTENSITIES (R3-SNK-6, report §R3c.15.1). R3-SNK-5B found the rig
# as written (world 1.2 + 400 W area lamp) renders our clay mesh ~7x over
# white while the reference tiles read bed 0.45, and matched the register
# with two scalars. R3-SNK-6 found WHY: the v1 study tool kept the OBJ's
# imported materials, whose Principled BSDF imports with Transmission
# Weight 1.0 (grey GLASS) — the lamp produced no diffuse response on the
# reference. Both tools now put the SAME fresh clay material on their mesh
# and share these defaults: lamp 50 W and a diffuse-only world 0.5, the
# camera-ray world staying at 1.2 so the background clips to white; a true
# clay surface under the v1 intensities is white on both bodies.
LAMP_W = float(_opt('--lamp', 50.0))             # rig v2 (v1: 400)
WORLD_DIFFUSE = float(_opt('--world-diffuse', 0.5))  # rig v2 (v1: 1.2; camera rays always 1.2)
POSE_FILTER = _opt('--poses', None)
MARKER = _opt('--marker', None)
if MARKER == 'default': MARKER_K = F.DEFAULT_MARKER
elif MARKER: MARKER_K = tuple(float(v) for v in MARKER.split(','))
else: MARKER_K = None
if '--mirror-study' in argv:
    print('--mirror-study is RETIRED (R3-SNK-6): the study tool now shares the frame law; refusing'); sys.exit(2)
os.makedirs(OUT, exist_ok=True)
LAMP_Z = (F.LAMP_Z_ABS_MM - F.BED_ABS_MM) * 0.001   # 1.1897 m above OUR bed top (y = 0)
POSES = F.load_poses(POSE_FILTER)
if not POSES: print('no poses selected'); sys.exit(2)

def kernel_to_blender(k):
    return Vector(F.kernel_to_blender(k))

# ---------------- scene ----------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
t0 = time.time()
d = json.load(open(DUMP))
print('dump', DUMP, 'meshes', d['meshCount'], 'tris', d['totalTris'], 'sha', d.get('kernel_console'))
grey = bpy.data.materials.new('clay_grey'); grey.use_nodes = True
for n in grey.node_tree.nodes:
    if n.type == 'BSDF_PRINCIPLED':
        n.inputs['Base Color'].default_value = (0.5, 0.5, 0.5, 1.0)
        n.inputs['Roughness'].default_value = 0.6
        if 'Specular IOR Level' in n.inputs: n.inputs['Specular IOR Level'].default_value = 0.5
nv = 0; nt = 0; built = []; n_smooth = 0; n_flat = 0
for m in d['meshes']:
    enc = m.get('encoding', '')
    dt = np.float32 if 'positions Float32' in enc else np.float64
    P = np.frombuffer(base64.b64decode(m['positions_b64']), dtype=dt).reshape(-1, 3).astype(np.float64)
    I = np.frombuffer(base64.b64decode(m['indices_b64']), dtype=np.uint32).reshape(-1, 3) if m['indices_b64'] else np.arange(len(P), dtype=np.uint32).reshape(-1, 3)
    if len(I) == 0: continue
    # drop degenerate triangles (Blender rejects them and the loop/vertex
    # bookkeeping for custom normals must stay 1:1)
    keep = (I[:, 0] != I[:, 1]) & (I[:, 1] != I[:, 2]) & (I[:, 0] != I[:, 2])
    I = I[keep]
    if len(I) == 0: continue
    B = np.c_[P[:, 0], -P[:, 2], P[:, 1]]             # three (x, y, z) -> Blender (x, -z, y)
    me = bpy.data.meshes.new(m['name'] or f"mesh{m['order']}")
    me.from_pydata(B.tolist(), [], I.tolist()); me.update()
    nb64 = m.get('normals_b64', '')
    if nb64 and len(me.vertices) == len(P):
        N = np.frombuffer(base64.b64decode(nb64), dtype=np.float32).reshape(-1, 3).astype(np.float64)
        NB = np.c_[N[:, 0], -N[:, 2], N[:, 1]]
        L = np.linalg.norm(NB, axis=1); L[L == 0] = 1; NB = NB / L[:, None]
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        me.normals_split_custom_set_from_vertices(NB.tolist())
        n_smooth += 1
    else:
        n_flat += 1
    me.materials.append(grey)
    ob = bpy.data.objects.new(me.name, me); scene.collection.objects.link(ob)
    nv += len(B); nt += len(I); built.append((me.name, len(I)))
print(f'built {len(built)} objects, {nv} verts, {nt} tris ({n_smooth} smooth-normalled, {n_flat} flat) in {time.time()-t0:.1f}s')

# mirror-test marker: a RED cone standing on the bed at the kernel point
marker_ob = None
if MARKER_K:
    bpy.ops.mesh.primitive_cone_add(vertices=48, radius1=F.MARKER_R, radius2=0.0, depth=F.MARKER_H)
    marker_ob = bpy.context.active_object; marker_ob.name = 'MirrorTestMarker'
    # pure RED emitter: nothing else in a grey clay scene is red, so the
    # check script segments it by colour (black would collide with seam voids)
    blk = bpy.data.materials.new('marker_red'); blk.use_nodes = True
    ntm = blk.node_tree; [ntm.nodes.remove(n) for n in list(ntm.nodes) if n.type == 'BSDF_PRINCIPLED']
    em = ntm.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (1.0, 0.0, 0.0, 1.0); em.inputs['Strength'].default_value = 1.0
    outn = [n for n in ntm.nodes if n.type == 'OUTPUT_MATERIAL'][0]; ntm.links.new(em.outputs['Emission'], outn.inputs['Surface'])
    marker_ob.data.materials.append(blk)
    mk = kernel_to_blender(MARKER_K); marker_ob.location = (mk.x, mk.y, mk.z + F.MARKER_H / 2)
    print('marker at kernel', MARKER_K, '-> blender', tuple(round(v, 4) for v in marker_ob.location))

# world (study tool constants)
w = bpy.data.worlds.new('W'); scene.world = w; w.use_nodes = True
bg = w.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.9, 0.88, 0.85, 1.0); bg.inputs[1].default_value = 1.2
if abs(WORLD_DIFFUSE - 1.2) > 1e-9:
    # camera rays see the rig's 1.2 world (white background); lighting rays see WORLD_DIFFUSE
    ntree = w.node_tree; lp = ntree.nodes.new('ShaderNodeLightPath'); mixv = ntree.nodes.new('ShaderNodeMix')
    mixv.data_type = 'FLOAT'; mixv.inputs['A'].default_value = WORLD_DIFFUSE; mixv.inputs['B'].default_value = 1.2
    ntree.links.new(lp.outputs['Is Camera Ray'], mixv.inputs['Factor']); ntree.links.new(mixv.outputs['Result'], bg.inputs['Strength'])
# lamp (study tool constants; height re-based to our bed top)
ld = bpy.data.lights.new('Lamp', 'AREA'); ld.shape = 'RECTANGLE'
ld.size = 3.0; ld.size_y = 1.2; ld.energy = LAMP_W
lamp = bpy.data.objects.new('Lamp', ld); scene.collection.objects.link(lamp)
lamp.location = (0.0, 0.0, LAMP_Z); lamp.rotation_euler = (0, 0, 0)
# render settings (study tool constants)
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64; scene.cycles.use_denoising = True
device = 'CPU'
prefs = bpy.context.preferences.addons.get('cycles')
if prefs:
    cp = prefs.preferences
    try:
        cp.compute_device_type = 'METAL'; cp.get_devices()
        for dev in cp.devices: dev.use = True
        scene.cycles.device = 'GPU'; device = 'GPU:METAL'
    except Exception as e:
        print('GPU setup failed:', e)
scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGB'
scene.view_settings.view_transform = 'Standard'
cd = bpy.data.cameras.new('Cam'); cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 24.0
cd.clip_start = 0.005; cd.clip_end = 100.0
cam = bpy.data.objects.new('Cam', cd); scene.collection.objects.link(cam); scene.camera = cam

manifest = {'source_dump': DUMP, 'dump_sha256': hashlib.sha256(open(DUMP, 'rb').read()).hexdigest(),
            'dump_served_web_dir': d.get('served_web_dir'), 'dump_kernel_console': d.get('kernel_console'),
            'material_mode': 'clay: Principled 0.5 grey / roughness 0.6 / specular 0.5 (study-tool constants)',
            'device': device, 'samples': 64, 'denoise': True, 'resolution': [1600, 1000],
            'scene_unit': 'metres (our dump is metres)',
            'frame_law': F.FRAME_LAW, 'frame_map': 'Blender (X,Y,Z) = (three.x, -three.z, three.y); kernel [kx,ky,h] -> (ky, -kx, h)',
            'normals': f'{n_smooth} meshes with the app\'s custom split normals, {n_flat} flat',
            'marker_kernel': list(MARKER_K) if MARKER_K else None,
            'world': {'rgb': [0.9, 0.88, 0.85], 'strength_camera': 1.2, 'strength_diffuse': WORLD_DIFFUSE},
            'lamp': {'type': 'AREA_RECT', 'size_m': [3.0, 1.2], 'z_above_bed_m': LAMP_Z, 'watts': LAMP_W, 'rig_watts': 400, 'xy_m': [0, 0],
                     'study_tool_equivalent': 'z 2000 mm absolute over a bed top at 810.3'},
            'view_transform': 'Standard', 'objects': built, 'poses': []}
for p in POSES:
    zoom = p.get('zoom', 1.0)
    lens = F.lens_mm(p['fov'], zoom)
    cd.lens = lens
    cam.location = kernel_to_blender(p['cam'])
    dv = kernel_to_blender(p['look']) - cam.location
    cam.rotation_euler = dv.to_track_quat('-Z', 'Y').to_euler()
    fp = os.path.join(OUT, p['name'] + '.png'); scene.render.filepath = fp
    t = time.time(); bpy.ops.render.render(write_still=True); dt = time.time() - t
    sha = hashlib.sha256(open(fp, 'rb').read()).hexdigest()
    eff = math.degrees(2 * math.atan(12.0 / lens))
    print(f"RENDERED {p['name']}: {dt:.1f}s lens={lens:.3f} vfov={eff:.2f} cam={[round(v,4) for v in cam.location]} sha={sha[:16]}")
    manifest['poses'].append({'name': p['name'], 'file': fp, 'kernel_cam': p['cam'], 'kernel_look': p['look'],
        'blender_cam_m': [round(v, 5) for v in cam.location], 'blender_look_m': [round(v, 5) for v in kernel_to_blender(p['look'])],
        'fov_deg_nominal': p['fov'], 'zoom': zoom, 'lens_mm': round(lens, 4), 'vfov_deg_effective': round(eff, 3),
        'sensor_height_mm': 24.0, 'sensor_fit': 'VERTICAL', 'aspect': 1.6, 'render_seconds': round(dt, 2), 'sha256': sha})
json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print('manifest:', os.path.join(OUT, 'manifest.json')); print('ALL DONE')
