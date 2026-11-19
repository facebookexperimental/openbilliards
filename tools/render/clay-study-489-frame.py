# Copyright (c) Meta Platforms, Inc. and affiliates.

"""clay-study-489-frame.py — THE frame law shared by our clay study renders
(tools/render/clay-study-489-render.py) and the quarantine study tool that
renders the purchased Magnum II (kept under /tmp, imports this file by path).
GH-489 craft R3-SNK-6 S6-1: one declared convention, after the R3-SNK-5B
finding that the study tool mapped kernel +kx to the model's +Y (the mirror
of the app) so every asymmetric-pose reference tile was a mirror image.

    kernel [kx, ky, h]   metres; kx ACROSS the table width, ky ALONG the length,
                         h above the bed-cloth top; origin = table centre
      -> three.js (x, y, z) = (ky, h, kx)         web/app/coords.js kPosToThree (the app)
      -> Blender  (X, Y, Z) = (x, -z, y) = (ky, -kx, h)
                         a PROPER rotation of the Y-up three frame into the Z-up
                         right-handed Blender frame (never a reflection)

The purchased model's own axes are X long / Y short / Z up in mm, so it is
placed in the same Blender frame unchanged (scaled to metres) and only the
CAMERA is registered per pose group, exactly as the R3-SNK-5 study tool did
(playing-area landmarks, not cups): corner poses on the nose CORNER, middle
poses on the nose LINE + the table centre, the overview on the table centre.
Magnum playfield nose-to-nose 3559 x 1773 (dossier MEASUREMENTS.md §4) vs our
WPBSA 3569 x 1778 -> corner offset (-5.0, +2.5) mm, middle (0, +2.5), overview
(0, 0). The studied corner is therefore the model's (+X, -Y) one — the app's
kernel (+kx, +ky) corner under the law above (the R3-SNK-5 tool studied the
(+X, +Y) corner through its mirror). Offsets are applied to the camera (and to
the mirror-test marker), never to the model.

Mirror test (--marker in both tools): a RED-emitting cone standing on the bed at a
kernel point placed OFF both symmetry axes renders at the same image position
in our clay frame and in the reference frame of the same pose (to the
registration offset); tools/render/clay-study-489-marker-check.py compares the
two centroids.
"""
import json, os

POSE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures', 'craft-look-poses.json')
TABLE = 'wpbsa_snooker_12ft'
BED_ABS_MM = 810.3          # the purchased model's bed-cloth top (absolute z, mm)
LAMP_Z_ABS_MM = 2000.0      # the study rig's lamp height (absolute, mm)
MAGNUM_HALF_PLAY = (1779.5, 886.5)   # Magnum nose-to-nose half length / half width (mm)
OURS_HALF_PLAY = (3.569 / 2 * 1000, 1.778 / 2 * 1000)  # 1784.5, 889.0
ZOOM_X2 = ('corner_close_diag', 'mid_close_diag')      # the two x2 frames the study bank carries
DEFAULT_MARKER = (0.82, 1.75, 0.0)   # kernel: 75 mm inboard of the corner cup across, 82 mm back along —
                                     # inside the 30 deg frustum of corner_close_rail / corner_tt_side / corner_tt_diag
MARKER_R, MARKER_H = 0.015, 0.060    # cone radius / height (m)


def kernel_to_blender(k):
    """kernel [kx, ky, h] (m) -> Blender (X, Y, Z) (m): (ky, -kx, h)."""
    kx, ky, h = k
    return (ky, -kx, h)


def three_to_blender(p):
    """three.js (x, y, z) -> Blender (X, Y, Z): (x, -z, y)."""
    return (p[0], -p[2], p[1])


def group_of(pose_name):
    if pose_name.startswith('corner_'): return 'corner'
    if pose_name.startswith('mid_'): return 'middle'
    return 'overview'


def magnum_offset_m(pose_name):
    """Camera offset (m) that registers the purchased model's playing-area
    landmark on ours for the pose group (model minus ours, in Blender X/Y)."""
    dx = (MAGNUM_HALF_PLAY[0] - OURS_HALF_PLAY[0]) * 0.001   # -0.005
    dy = -(MAGNUM_HALF_PLAY[1] - OURS_HALF_PLAY[1]) * 0.001  # +0.0025 (the -Y side)
    g = group_of(pose_name)
    if g == 'corner': return (dx, dy, 0.0)
    if g == 'middle': return (0.0, dy, 0.0)
    return (0.0, 0.0, 0.0)


def load_poses(names=None):
    doc = json.load(open(POSE_FILE))
    poses = [dict(p) for p in doc['poses'][TABLE]]
    poses += [dict(p, name=p['name'] + '_x2', zoom=2.0) for p in poses if p['name'] in ZOOM_X2]
    # R3-SNK-11: the study-only extra poses (side / end elevation, the owner's
    # screenshot pose) ride behind the frozen nine; the craft-look pack never
    # reads them (fixture key `poses_extra`)
    poses += [dict(p) for p in doc.get('poses_extra', {}).get(TABLE, [])]
    if names:
        want = [n.strip() for n in names.split(',') if n.strip()]
        poses = [p for p in poses if p['name'] in want]
    return poses


def lens_mm(fov_deg, zoom=1.0):
    import math
    return 12.0 / math.tan(math.radians(fov_deg / 2)) * zoom


FRAME_LAW = 'clay-study-489-frame v1: kernel [kx,ky,h] -> three (ky,h,kx) -> Blender (ky,-kx,h); model unmoved, camera registered per group on the playing-area landmark'
