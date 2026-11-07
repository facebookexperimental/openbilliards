# Copyright (c) Meta Platforms, Inc. and affiliates.

"""C2, a learned pre-filter whose chosen stroke is always simulated.

At a search decision the agent lays a pool of candidate strokes round the aim centres of the
position (straightpool.candidates.sobol_pool) and can afford to simulate only part of it. C2
orders the pool so that the kernel simulates the most promising strokes first. It never chooses a
stroke: every stroke that can be chosen is simulated under noise and judged by the rules, and the
search keeps the best by its objective. The model card beside this module says how C2 was trained
and what it measured.

Five MLPs, one per training fold, each 47 inputs -> 128 ReLU -> 128 ReLU -> 1 logit, with its own
input standardisation. The score of a pool member is the mean of the five logits in float64; a
pool is ordered by score, descending, an exact tie toward the lower pool index. The 47 inputs are
20 features of the position, 24 of the candidate stroke and a 3-way kind indicator (features).

The evaluator follows the training library's arithmetic in numpy: each fold standardises the rows
in float64, casts them to float32 and applies its three layers in float32; the five logits are
averaged in float64. Its logits agree with the training library's to float32 rounding, not bit for
bit (the model card gives the figures). Neither torch nor scikit-learn is needed to evaluate.

The weights file is JSON: {"combined_digest", "folds": [{"digest", "mu", "sd", "state_dict"}]},
five folds, each state_dict holding the LAYERS tensors as nested lists (float32 values written as
decimal floats), mu and sd the 47 input means and scales (float64). Nothing else is stored. It is
checked at load against its fold-weight digest: per fold, SHA-256 over the layer tensors as
little-endian float32 in layer order, then the input means and scales as little-endian float64;
the combined digest is SHA-256 over the five fold digests (hex) joined by newlines. Digests are
written as their first 16 hex digits.

Other parts of the package use the names below, so a change adds fields with defaults or new
functions and leaves these names in place.
"""

import hashlib
import json
import math
import pathlib
import struct
from dataclasses import dataclass
from typing import Any, Tuple

#: The weights file, beside this module.
WEIGHTS = "c2-ordering-scorer.json"

#: Inputs per pool member, folds, and the kinds of the 3-way indicator in input order.
N_FEATURES = 47
N_FOLDS = 5
KINDS = ("direct", "bank", "kick")

#: The layer tensors of one fold in digest order, with their shapes: 47 -> 128 -> 128 -> 1.
LAYERS = (("0.weight", (128, 47)), ("0.bias", (128,)), ("2.weight", (128, 128)),
          ("2.bias", (128,)), ("4.weight", (1, 128)), ("4.bias", (1,)))

#: The combined digest of the shipped weights file.
COMBINED_DIGEST = "bb5b225cbfcbc454"

#: The position block is computed from this many leading pool members: the strokes the search
#: would simulate first without C2, known before any stroke is played.
MENU_PREFIX = 32

#: The 20 position features, in input order. Distances are divided by the table length, positions
#: by the half width (x) and half length (y), counts by 15. run: the run so far / 29; menu: the
#: leading MENU_PREFIX pool members; s0_*, in_hand and snookered are 0 at every decision C2 scores.
POSITION_NAMES = ("run", "balls", "cue_x", "cue_y", "centroid_x", "centroid_y", "spread",
                  "d_cue_mean", "d_cue_min", "log_menu", "log_centres", "s0_max", "s0_mean",
                  "cut_min", "in_hand", "snookered", "break_decision", "no_cue", "near_pocket",
                  "d_ball_min")

#: The 24 candidate-stroke features, in input order: present (1), sigma0 (0), the ball / 15, the
#: pocket one-hot, the cut / 90, the cue-to-ball and ball-to-pocket distances, the cosine between
#: the ball-to-pocket and pocket-to-centre directions, s0_rank and s0_gap (0), the stroke
#: (v0, phi, theta, a, b) and the cue-ball position (x, y) rounded to 5 decimals, and the least
#: distance from another object ball to the cue-to-ball and the ball-to-pocket segments.
STROKE_NAMES = (("present", "sigma0", "ball") + tuple(f"pocket_{p}" for p in range(6))
                + ("cut", "d_cue_ball", "d_ball_pocket", "cos_approach", "s0_rank", "s0_gap",
                   "v0", "phi", "theta", "a", "b", "cue_x_at_stroke", "cue_y_at_stroke",
                   "clear_cue_ball", "clear_ball_pocket"))

#: All 47 input names.
FEATURE_NAMES = POSITION_NAMES + STROKE_NAMES + tuple(f"kind_{k}" for k in KINDS)

#: The table C2 was trained on (the kernel's standard table, as State.table() reads it): width and
#: length in metres and the pocket centres (x, y) in the kernel's pocket order.
TABLE_WIDTH = 1.27
TABLE_LENGTH = 2.54
POCKETS = ((-0.6644863527754791, -1.299486352775479), (-0.7035, 0.0),
           (-0.6644863527754791, 1.299486352775479), (0.664486352775479, -1.299486352775479),
           (0.7035, 0.0), (0.664486352775479, 1.299486352775479))


@dataclass(frozen=True, eq=False)
class Fold:
    """One fold model: its three layers (float32 weights and biases) and its input means and
    scales (float64), as numpy arrays."""

    w0: Any
    b0: Any
    w1: Any
    b1: Any
    w2: Any
    b2: Any
    mu: Any
    sd: Any


@dataclass(frozen=True, eq=False)
class Scorer:
    """The five fold models of a weights file, with their fold digests and the combined digest
    (first 16 hex digits each)."""

    folds: Tuple[Fold, ...]
    digests: Tuple[str, ...]
    combined: str

    def fold_logits(self, rows):
        """The (N_FOLDS, n) float64 logits of n input rows (n x N_FEATURES)."""
        import numpy as np
        x = np.asarray(rows, dtype=np.float64)
        if x.ndim != 2 or x.shape[1] != N_FEATURES:
            raise ValueError(f"expected rows of {N_FEATURES} inputs, got shape {x.shape}")
        out = []
        for fold in self.folds:
            h = ((x - fold.mu) / fold.sd).astype(np.float32)
            h = np.maximum(h @ fold.w0.T + fold.b0, 0.0)
            h = np.maximum(h @ fold.w1.T + fold.b1, 0.0)
            out.append((h @ fold.w2.T + fold.b2)[:, 0].astype(np.float64))
        return np.stack(out)

    def score(self, rows):
        """The C2 score of each row: the mean of its five fold logits, float64."""
        return self.fold_logits(rows).mean(axis=0)


def order(scores):
    """Pool indices by score, descending, an exact tie toward the lower index. A NaN score is
    refused with ValueError."""
    values = [float(s) for s in scores]
    if any(v != v for v in values):
        raise ValueError("a score is NaN")
    return sorted(range(len(values)), key=lambda i: (-values[i], i))


def _flat(values):
    """The numbers of a nested list (or of an object with tolist) in row-major order."""
    if hasattr(values, "tolist"):
        values = values.tolist()
    out = []

    def walk(v):
        if isinstance(v, (list, tuple)):
            for item in v:
                walk(item)
        else:
            out.append(float(v))

    walk(values)
    return out


def _shape_ok(values, shape):
    if hasattr(values, "tolist"):
        values = values.tolist()
    if not isinstance(values, (list, tuple)) or len(values) != shape[0]:
        return False
    if len(shape) == 1:
        return not any(isinstance(v, (list, tuple)) for v in values)
    return all(_shape_ok(row, shape[1:]) for row in values)


def _check_fold(fold, k):
    """ValueError unless fold k holds every layer at its shape and 47 finite means and scales."""
    state = fold.get("state_dict") if hasattr(fold, "get") else None
    if not hasattr(state, "get"):
        raise ValueError(f"fold {k}: no state_dict")
    for name, shape in LAYERS:
        if name not in state or not _shape_ok(state[name], shape):
            raise ValueError(f"fold {k}: layer {name} is missing or not of shape {shape}")
        if not all(math.isfinite(v) for v in _flat(state[name])):
            raise ValueError(f"fold {k}: layer {name} holds a non-finite value")
    for key in ("mu", "sd"):
        if key not in fold or not _shape_ok(fold[key], (N_FEATURES,)):
            raise ValueError(f"fold {k}: {key} is missing or not {N_FEATURES} numbers")
        if not all(math.isfinite(v) for v in _flat(fold[key])):
            raise ValueError(f"fold {k}: {key} holds a non-finite value")


def fold_digest(fold):
    """The full hex digest of one fold (its layer tensors, means and scales) by the law above.
    `fold` is a mapping with "state_dict" (layer name -> nested lists or arrays), "mu" and "sd"."""
    h = hashlib.sha256()
    for name, _shape in LAYERS:
        values = _flat(fold["state_dict"][name])
        h.update(struct.pack(f"<{len(values)}f", *values))
    for key in ("mu", "sd"):
        values = _flat(fold[key])
        h.update(struct.pack(f"<{len(values)}d", *values))
    return h.hexdigest()


def combined_digest(fold_digests):
    """SHA-256 over the full hex fold digests joined by newlines, as full hex."""
    return hashlib.sha256("\n".join(fold_digests).encode("utf-8")).hexdigest()


def load(path=None, combined=None):
    """The C2 scorer from the weights file (default WEIGHTS beside this module), refused with
    ValueError when a fold digest or the combined digest does not match. Every file must match the
    digests it carries; the shipped file must also match COMBINED_DIGEST, and a file of your own
    matches `combined` (16 hex digits) when one is given."""
    if path is None:
        path, combined = pathlib.Path(__file__).resolve().with_name(WEIGHTS), COMBINED_DIGEST
    doc = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    folds = doc.get("folds") if isinstance(doc, dict) else None
    if not isinstance(folds, list) or len(folds) != N_FOLDS:
        raise ValueError(f"expected {N_FOLDS} folds")
    digests = []
    for k, fold in enumerate(folds):
        _check_fold(fold, k)
        digest = fold_digest(fold)
        if digest[:16] != fold.get("digest"):
            raise ValueError(f"fold {k}: digest {digest[:16]} is not {fold.get('digest')}")
        digests.append(digest)
    whole = combined_digest(digests)[:16]
    if whole != doc.get("combined_digest"):
        raise ValueError(f"combined digest {whole} is not {doc.get('combined_digest')}")
    if combined is not None and whole != combined:
        raise ValueError(f"combined digest {whole} is not {combined}")
    import numpy as np
    models = []
    for fold in folds:
        state = fold["state_dict"]
        weights = [np.array(state[name], dtype=np.float32) for name, _shape in LAYERS]
        models.append(Fold(*weights, mu=np.array(fold["mu"], dtype=np.float64),
                           sd=np.array(fold["sd"], dtype=np.float64)))
    return Scorer(tuple(models), tuple(d[:16] for d in digests), whole)


def _float32_rows(values, shape):
    """A tensor as rows of float32-rounded floats: one row for a vector, shape[0] for a matrix."""
    if hasattr(values, "tolist"):
        values = values.tolist()
    rows = [_flat(values)] if len(shape) == 1 else [_flat(row) for row in values]
    return [list(struct.unpack(f"<{len(r)}f", struct.pack(f"<{len(r)}f", *r))) for r in rows]


def _dump(folds):
    """(weights file text, combined digest as 16 hex digits) of N_FOLDS folds."""
    if len(folds) != N_FOLDS:
        raise ValueError(f"expected {N_FOLDS} folds")
    clean = []
    for k, fold in enumerate(folds):
        _check_fold(fold, k)
        clean.append({"state_dict": {name: _float32_rows(fold["state_dict"][name], shape)
                                     for name, shape in LAYERS},
                      "mu": _flat(fold["mu"]), "sd": _flat(fold["sd"])})
    digests = [fold_digest(fold) for fold in clean]
    whole = combined_digest(digests)[:16]
    numbers = lambda values: json.dumps(values, allow_nan=False)  # noqa: E731
    lines = ["{", f' "combined_digest": "{whole}",', ' "folds": [']
    for k, (fold, digest) in enumerate(zip(clean, digests)):
        lines += ["  {", f'   "digest": "{digest[:16]}",', f'   "mu": {numbers(fold["mu"])},',
                  f'   "sd": {numbers(fold["sd"])},', '   "state_dict": {']
        for j, (name, shape) in enumerate(LAYERS):
            tail = "," if j < len(LAYERS) - 1 else ""
            rows = fold["state_dict"][name]
            if len(shape) == 1:
                lines.append(f'    "{name}": {numbers(rows[0])}{tail}')
                continue
            lines.append(f'    "{name}": [')
            lines += ["     " + numbers(row) + ("," if i < len(rows) - 1 else "")
                      for i, row in enumerate(rows)]
            lines.append("    ]" + tail)
        lines += ["   }", "  }" + ("," if k < len(clean) - 1 else "")]
    lines += [" ]", "}"]
    return "\n".join(lines) + "\n", whole


def dumps(folds):
    """The weights file text of N_FOLDS folds (mappings with "state_dict", "mu" and "sd"; nested
    lists or arrays), in canonical form: digests computed, layer values rounded to float32, one
    tensor row per line. load accepts the text once written to a file."""
    return _dump(folds)[0]


def save(path, folds):
    """Write the weights file of N_FOLDS folds (see dumps) to a new path; an existing file is
    refused. Returns the combined digest (16 hex digits)."""
    text, whole = _dump(folds)
    with open(path, "x", encoding="utf-8") as handle:
        handle.write(text)
    return whole


def _geometry(np, table):
    """(half width, half length, length, pocket array) of `table` (an adapter.Table, or None for
    the table C2 was trained on)."""
    if table is None:
        width, length, pockets = TABLE_WIDTH, TABLE_LENGTH, POCKETS
    else:
        width, length, pockets = float(table.width), float(table.length), table.pockets
    return (width / 2.0, length / 2.0, length,
            np.array([[float(p[0]), float(p[1])] for p in pockets], dtype=np.float64))


def _seg_dist(np, p, a, b):
    """Distances from points p (k x 2) to the segment a-b."""
    ab = b - a
    den = float(ab @ ab) + 1e-12
    t = np.clip(((p - a) @ ab) / den, 0.0, 1.0)
    proj = a + t[:, None] * ab
    return np.linalg.norm(p - proj, axis=1)


def _position_block(np, ids, pos, cue, run, break_decision, prefix_cuts, n_candidates, geometry):
    hw, hl, tl, pockets = geometry
    x = np.zeros(len(POSITION_NAMES))
    x[0] = run / 29.0
    x[1] = len(ids) / 15.0
    if cue is not None:
        x[2], x[3] = cue[0] / hw, cue[1] / hl
    else:
        x[17] = 1.0
    if len(ids):
        cen = pos.mean(axis=0)
        x[4], x[5] = cen[0] / hw, cen[1] / hl
        x[6] = math.sqrt(float(((pos - cen) ** 2).sum(axis=1).mean())) / hl
        if cue is not None:
            d = np.linalg.norm(pos - cue, axis=1)
            x[7], x[8] = d.mean() / tl, d.min() / tl
        dp = np.linalg.norm(pos[:, None, :] - pockets[None, :, :], axis=2).min(axis=1)
        x[18] = float((dp < 0.15).sum()) / 15.0
        if len(ids) > 1:
            dd = np.linalg.norm(pos[:, None, :] - pos[None, :, :], axis=2)
            dd[np.arange(len(ids)), np.arange(len(ids))] = 9.0
            x[19] = dd.min() / tl
        else:
            x[19] = 1.0
    x[9] = math.log1p(len(prefix_cuts)) / math.log1p(54.0)
    x[10] = math.log1p(n_candidates or 0) / math.log1p(100.0)
    if prefix_cuts:
        s0 = [0.0] * len(prefix_cuts)
        x[11], x[12] = max(s0), sum(s0) / len(s0)
        x[13] = min(prefix_cuts) / 90.0
    else:
        x[13] = 1.0
    x[16] = 1.0 if break_decision else 0.0
    return x


def _stroke_block(np, ball, pocket, cut, action7, ids, pos, cue, n_menu, geometry):
    _hw, _hl, tl, pockets = geometry
    x = np.zeros(len(STROKE_NAMES))
    x[0] = 1.0
    x[2] = ball / 15.0
    x[3 + pocket] = 1.0
    x[9] = cut / 90.0
    pk = pockets[pocket]
    bi = ids.index(ball) if ball in ids else None
    if bi is not None:
        b = pos[bi]
        x[11] = np.linalg.norm(pk - b) / tl
        v_bp = pk - b
        v_pc = -pk
        x[12] = float(v_bp @ v_pc) / (np.linalg.norm(v_bp) * np.linalg.norm(v_pc) + 1e-9)
        others = np.delete(pos, bi, axis=0)
        if cue is not None:
            x[10] = np.linalg.norm(b - cue) / tl
            x[22] = (_seg_dist(np, others, cue, b).min() if len(others) else 1.0) / tl
        x[23] = (_seg_dist(np, others, b, pk).min() if len(others) else 1.0) / tl
    x[13] = 0 / max(1, n_menu - 1)
    x[15:22] = np.asarray(action7, dtype=np.float64)
    return x


def features(position, members, *, run, break_decision, n_centres, table=None):
    """The n x 47 input rows (numpy float64) of pool members at a position.

    position: {ball id: (x, y)} in the kernel frame, the cue ball as id 0 (absent while in hand).
        The position block reads it rounded to 6 decimals, the object balls in the mapping's own
        order (the recorded decisions passed them in the kernel state's ball order; another order
        can change the last bits of the summed features).
    members: objects with the straightpool.candidates.PoolMember attributes: ball, pocket, kind
        (one of KINDS), stroke (v0, phi, theta, a, b as struck, after projection into the kernel's
        domain), place ((x, y) while the cue ball is in hand, else None) and cut_deg (None where
        no direct cut is defined: read as 90).
    run: the run so far; break_decision: True at the first decision after a re-rack; n_centres:
        the number of aim centres the pool was laid round; table: an adapter.Table, None for the
        table C2 was trained on.

    The position block comes from the first MENU_PREFIX members (the menu known before any stroke,
    every prior spread 0), the candidate block from each member, then its kind indicator."""
    import numpy as np
    geometry = _geometry(np, table)
    ids, xy, cue, cue_raw = [], [], None, None
    for ball, point in position.items():
        ball = int(ball)
        x, y = float(point[0]), float(point[1])
        if ball == 0:
            cue_raw = (x, y)
            cue = np.array([round(x, 6), round(y, 6)], dtype=np.float64)
        else:
            ids.append(ball)
            xy.append([round(x, 6), round(y, 6)])
    pos = np.array(xy, dtype=np.float64) if ids else np.zeros((0, 2))
    members = list(members)
    cuts = [float(m.cut_deg) if m.cut_deg is not None else 90.0 for m in members]
    if n_centres is None:
        n_centres = len(cuts[:MENU_PREFIX])
    head = _position_block(np, ids, pos, cue, int(run), bool(break_decision),
                           cuts[:MENU_PREFIX], int(n_centres), geometry)
    rows = []
    for m, cut in zip(members, cuts):
        if m.kind not in KINDS:
            raise ValueError(f"unknown pool kind {m.kind!r}; known: {KINDS}")
        pocket = int(m.pocket)
        if not 0 <= pocket < len(geometry[3]):
            raise ValueError(f"pocket {m.pocket!r} is not a pocket index of the table")
        at = m.place if m.place is not None else cue_raw
        if at is None:
            raise ValueError("a member needs the cue ball on the table or a placement")
        stroke = m.stroke.as_tuple() if hasattr(m.stroke, "as_tuple") else tuple(m.stroke)
        action7 = [round(float(v), 5) for v in tuple(stroke) + (at[0], at[1])]
        block = _stroke_block(np, int(m.ball), pocket, cut, action7, ids, pos, cue, len(members),
                              geometry)
        rows.append(np.concatenate([head, block, [1.0 if m.kind == k else 0.0 for k in KINDS]]))
    if not rows:
        return np.zeros((0, N_FEATURES))
    return np.stack(rows)
