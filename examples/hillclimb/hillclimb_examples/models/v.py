# Copyright (c) Meta Platforms, Inc. and affiliates.

"""V, a learned leaf value used in the 2-ply search.

V predicts how likely the break shot of a 14.1 rack is to fail, from where the cue ball and the
break ball stand once the other fourteen balls are re-racked. The agent's 2-ply search at the
stroke before a re-rack scores each leaf (the position after a candidate stroke and the re-rack)
with V instead of searching the break shot itself; the kernel still simulates every stroke that
is played. The model card beside this module says how V was trained and what it measured.

Regression trees fitted by gradient boosting on 30 features of a break position: the cue ball and
the break ball after the re-rack, mirrored so that the break ball is at x >= 0, and 26 fixed
functions of those four numbers. Evaluated here in pure Python in the fitting library's own order:
the baseline, then each tree's leaf value added in turn, in float64; at a numeric node, x <=
threshold goes left, and a missing value (NaN) goes the way the node records. The value is
clipped to [0, 1]. The features are those V was fitted on to the last bit under Python 3.12 (the
package's floor); older Pythons round math.hypot differently. On another platform math.acos can
differ in its last bit, which moves a prediction only where a feature sits within that bit of a
tree threshold.

The model file is gzip-compressed JSON: {"baseline", "form", "n_features", "n_trees", "trees"},
each tree as parallel node lists (f feature index, t threshold, l and r child indices, leaf flag,
mgl missing-goes-left flag, v value), canonical JSON (sorted keys, no spaces) compressed with
mtime 0 and no file name.

Other parts of the package use the names below, so a change adds fields with defaults or new
functions and leaves these names in place.
"""

import gzip
import hashlib
import io
import json
import math
import pathlib

#: The model file, beside this module (gzip-compressed JSON trees).
MODEL = "v-leaf-value.json.gz"

#: Inputs per position.
N_FEATURES = 30

#: The first 16 hex digits of SHA-256 over the bytes of the shipped model file.
DIGEST = "8563d9166b7df342"

#: The form string of the model file.
FORM = ("sklearn HistGradientBoostingRegressor trees (squared_error): predict = 0.0 + baseline, "
        "then += each tree's leaf value in order; x <= threshold goes left")

#: The table V was fitted on, in the kernel frame (metres): the ball radius, the half width and
#: half length of the cloth inside the cushion lines, and the foot spot (the empty apex of the
#: re-rack).
BALL_RADIUS = 0.028575
HALF_WIDTH = 0.635
HALF_LENGTH = 1.27
FOOT_SPOT = (0.0, 0.635)

_CX, _CY, _SX = 0.664486352775479, 1.299486352775479, 0.7035

#: The pocket centres in the mirrored frame, named by side (n near: the break ball's side, x > 0;
#: f far) and end (h head, y < 0; s side pocket; f foot, y > 0).
POCKET_NAMES = ("nh", "ns", "nf", "fh", "fs", "ff")
POCKETS = ((_CX, -_CY), (_SX, 0.0), (_CX, _CY), (-_CX, -_CY), (-_SX, 0.0), (-_CX, _CY))

#: The fourteen sites of the re-rack (the triangle with its apex on the foot spot left empty).
RACK14 = ((-0.028575, 0.684494), (0.028575, 0.684494),
          (-0.05715, 0.733988), (0.0, 0.733988), (0.05715, 0.733988),
          (-0.085726, 0.783481), (-0.028575, 0.783481), (0.028575, 0.783481), (0.085726, 0.783481),
          (-0.114301, 0.832975), (-0.05715, 0.832975), (0.0, 0.832975), (0.05715, 0.832975),
          (0.114301, 0.832975))

#: An object ball within this distance (metres) of a free re-rack site counts as racked.
TEMPLATE_TOL = 0.005

#: The feature names, in input order: the mirrored cue ball and break ball, their distance, the
#: cut angle at the break ball (degrees), the break-ball-to-pocket distance and whether the racked
#: balls block the break ball's path, for each pocket; then whether the rack blocks the cue ball's
#: path to the break ball, the smallest cut to an open pocket with its distance, the distances of
#: the break ball and the cue ball to the foot spot, and each ball's distance to the nearest
#: cushion line.
FEATURE_NAMES = (("cue_x", "cue_y", "bb_x", "bb_y", "d_cb")
                 + tuple(f"cut_{n}" for n in POCKET_NAMES)
                 + tuple(f"dbp_{n}" for n in POCKET_NAMES)
                 + tuple(f"blk_{n}" for n in POCKET_NAMES)
                 + ("blk_cb", "cut_best", "dbp_best", "d_bb_apex", "d_cue_apex", "rail_cue",
                    "rail_bb"))

_TREE_KEYS = ("f", "l", "leaf", "mgl", "r", "t", "v")


def canon(cue, break_ball):
    """The cue ball and the break ball mirrored in x so that the break ball is at x >= 0 (the
    table, its pockets and the re-rack are symmetric about x = 0)."""
    s = -1.0 if float(break_ball[0]) < 0.0 else 1.0
    return ((s * float(cue[0]), float(cue[1])), (s * float(break_ball[0]), float(break_ball[1])))


def _seg_dist(p, a, b):
    """The distance from point p to the segment a-b."""
    ax, ay = a
    bx, by = b
    px, py = p
    vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy
    t = 0.0 if l2 <= 0.0 else max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / l2))
    return math.hypot(px - (ax + t * vx), py - (ay + t * vy))


def _blocked(a, b):
    """1.0 when the segment a-b passes within two ball radii of a re-rack site, else 0.0."""
    return 1.0 if any(_seg_dist(c, a, b) < 2.0 * BALL_RADIUS for c in RACK14) else 0.0


def _cut_deg(cue, ball, pocket):
    """The cut angle at the ball in degrees, between the cue-to-ball and the ball-to-pocket
    directions (180 when either is degenerate)."""
    ux, uy = ball[0] - cue[0], ball[1] - cue[1]
    vx, vy = pocket[0] - ball[0], pocket[1] - ball[1]
    nu, nv = math.hypot(ux, uy), math.hypot(vx, vy)
    if nu <= 0.0 or nv <= 0.0:
        return 180.0
    c = max(-1.0, min(1.0, (ux * vx + uy * vy) / (nu * nv)))
    return math.degrees(math.acos(c))


def features(cue, break_ball):
    """The N_FEATURES inputs of a break position from the cue ball's and the break ball's (x, y)
    in the kernel frame, in FEATURE_NAMES order."""
    cue, bb = canon(cue, break_ball)
    cuts = [_cut_deg(cue, bb, p) for p in POCKETS]
    dbps = [math.hypot(p[0] - bb[0], p[1] - bb[1]) for p in POCKETS]
    blks = [_blocked(bb, p) for p in POCKETS]
    open_pockets = [j for j in range(6) if blks[j] == 0.0]
    if open_pockets:
        jb = min(open_pockets, key=lambda j: (cuts[j], j))
        cut_best, dbp_best = cuts[jb], dbps[jb]
    else:
        cut_best, dbp_best = 180.0, 2.84
    f = [cue[0], cue[1], bb[0], bb[1], math.hypot(bb[0] - cue[0], bb[1] - cue[1])]
    f += cuts + dbps + blks
    f += [_blocked(cue, bb), cut_best, dbp_best,
          math.hypot(bb[0] - FOOT_SPOT[0], bb[1] - FOOT_SPOT[1]),
          math.hypot(cue[0] - FOOT_SPOT[0], cue[1] - FOOT_SPOT[1]),
          min(HALF_WIDTH - abs(cue[0]), HALF_LENGTH - abs(cue[1])),
          min(HALF_WIDTH - abs(bb[0]), HALF_LENGTH - abs(bb[1]))]
    return f


def break_ball(positions):
    """(ball id, (x, y)) of the break ball of a position after a re-rack, from {ball id: (x, y)}
    (kernel frame, the cue ball as id 0): the one object ball that does not sit within
    TEMPLATE_TOL of a free re-rack site. None when not exactly one object ball is off the sites."""
    balls = {int(b): (float(p[0]), float(p[1])) for b, p in positions.items()}
    off, used = [], set()
    for i in sorted(balls):
        if i == 0:
            continue
        x, y = balls[i]
        d = [math.hypot(x - tx, y - ty) for tx, ty in RACK14]
        j = min(range(len(RACK14)), key=lambda t: d[t])
        if d[j] < TEMPLATE_TOL and j not in used:
            used.add(j)
        else:
            off.append(i)
    if len(off) != 1:
        return None
    return off[0], balls[off[0]]


def load(path=None, digest=None):
    """The trees from the model file (default MODEL beside this module), refused with ValueError
    when its digest does not match: the shipped file must match DIGEST; a file of your own matches
    `digest` (the first 16 hex digits of SHA-256 over its bytes) when one is given."""
    if path is None:
        path, digest = pathlib.Path(__file__).resolve().with_name(MODEL), DIGEST
    data = pathlib.Path(path).read_bytes()
    got = hashlib.sha256(data).hexdigest()[:16]
    if digest is not None and got != digest:
        raise ValueError(f"{pathlib.Path(path).name}: digest {got} is not {digest}")
    model = json.loads(gzip.decompress(data).decode("utf-8"))
    _check(model)
    return model


def _check(model):
    if model.get("n_features") != N_FEATURES:
        raise ValueError(f"the model reads {model.get('n_features')} features, not {N_FEATURES}")
    trees = model.get("trees")
    if not isinstance(trees, list) or len(trees) != model.get("n_trees"):
        raise ValueError("the model's tree count does not match its trees")
    for k, tree in enumerate(trees):
        sizes = {len(tree.get(key, ())) for key in _TREE_KEYS}
        if len(sizes) != 1 or 0 in sizes:
            raise ValueError(f"tree {k} does not have equal, non-empty node lists")
    float(model["baseline"])


def predict(model, x):
    """The unclipped prediction for one feature row (N_FEATURES floats)."""
    r = 0.0 + float(model["baseline"])
    for tree in model["trees"]:
        f, th, le, ri = tree["f"], tree["t"], tree["l"], tree["r"]
        leaf, mgl, v = tree["leaf"], tree["mgl"], tree["v"]
        i = 0
        while not leaf[i]:
            xv = x[f[i]]
            if xv != xv:
                i = le[i] if mgl[i] else ri[i]
            else:
                i = le[i] if xv <= th[i] else ri[i]
        r += v[i]
    return r


def clip01(value):
    """A value clipped to [0, 1]."""
    return min(1.0, max(0.0, float(value)))


def leaf_value(model, cue, break_ball):
    """V at a leaf: the predicted chance that the break shot fails from this cue ball and break
    ball position (kernel frame), clipped to [0, 1]."""
    return clip01(predict(model, features(cue, break_ball)))


def export(fitted):
    """The plain-tree form of a fitted scikit-learn HistGradientBoostingRegressor (squared error,
    numeric features), ready for predict and save. Reads the fitted object's attributes only;
    scikit-learn is not imported here."""
    if fitted.n_trees_per_iteration_ != 1:
        raise ValueError("one tree per iteration expected (squared error)")
    trees = []
    for predictors in fitted._predictors:
        nodes = predictors[0].nodes
        if any(int(c) for c in nodes["is_categorical"]):
            raise ValueError("a categorical node")
        trees.append({"f": [int(x) for x in nodes["feature_idx"]],
                      "t": [float(x) for x in nodes["num_threshold"]],
                      "l": [int(x) for x in nodes["left"]],
                      "r": [int(x) for x in nodes["right"]],
                      "leaf": [int(x) for x in nodes["is_leaf"]],
                      "mgl": [int(x) for x in nodes["missing_go_to_left"]],
                      "v": [float(x) for x in nodes["value"]]})
    model = {"form": FORM, "baseline": float(fitted._baseline_prediction.ravel()[0]),
             "n_features": int(fitted.n_features_in_), "n_trees": len(trees), "trees": trees}
    _check(model)
    return model


def canonical_json(model):
    """The model as canonical JSON text: sorted keys, no spaces."""
    return json.dumps(model, sort_keys=True, separators=(",", ":"), allow_nan=False)


def save(path, model):
    """Write the model file (canonical JSON, gzip with mtime 0 and no file name) to a new path;
    an existing file is refused. Returns the first 16 hex digits of SHA-256 over its bytes, the
    digest that load checks."""
    _check(model)
    buffer = io.BytesIO()
    with gzip.GzipFile(filename="", mode="wb", fileobj=buffer, mtime=0) as gz:
        gz.write(canonical_json(model).encode("utf-8"))
    data = buffer.getvalue()
    with open(path, "xb") as handle:
        handle.write(data)
    return hashlib.sha256(data).hexdigest()[:16]
