# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The brush fields and the grid.

The surface lives in the scene frame: origin at the corner where the kernel frame has (-width/2,
-length/2), x along the table's length and y across it, so pockets keep the kernel's order. A
field scores a cue position p in [0, 1]: makeability of potting a ball into a pocket from p, or the
cover p gives against a ball (safety). A brush program composes fields over the post-shot table
(rail policy, angle band, peaks and zeros), and render() samples it at the cell centres cell/2,
cell/2 + cell, ... reached by repeated addition (the scan the published surfaces were rendered
with, so grids match bit for bit), row-major by y then x.

The fields are the reviewed closed forms of the hand-drawn leave-surface drafts (brush v0.1):

- makeability: zero when the cue ball is within 2.2 R of the ghost ball, when it approaches from
  the wrong side (cos < 0.05) or when the cut angle exceeds 72 degrees; otherwise cos(cut)**1.4,
  times the distance decay clamp(1.12 - 0.14 d, 0.55, 1), times the rail penalty
  clamp(0.45 + 0.55 (rail distance - 0.03) / 0.17, 0.45, 1) under the 'penalize' rail mode, times
  0.4 when the cue ball is within 0.12 m of the object ball (an awkward bridge), and zero when a
  ball body (2 R clearance) blocks the cue ball's path to the ghost ball. An angle band multiplies
  by 0.22 + 0.78 exp(-((cut - centre) / width)**2), and by its wrong-side factor when the cue ball
  sits on the other side of the pot line from the preferred one.
- brush v0.2 (both_legs=True) is v0.1 times a hard zero when a ball body blocks the object ball's
  path to the pocket, under the same clearance law. It has no constant of its own.
- safety: zero when the cue ball overlaps a ball or rests within 0.15 m of the target; otherwise
  the three sight lines (centre and the two tangents) to the target decide: fewer than two blocked
  is zero, two is the half-cover tier 0.35, three is 1; times clamp(1.28 - 0.5 dmin, 0.55, 1.12)
  for hugging a blocker, times clamp(0.55 + 0.35 d, 0.7, 1.05) for distance from the target, and
  a rail reward of up to 15 percent at the default severity 0.7 (the next shooter inherits a
  frozen cue ball).

None of these constants was fitted to data; they are the reviewed drawing's own numbers, so the
table geometry is the only parameter taken from outside (from the adapter's Table).

Other parts of the package use the names below, so a change adds fields with defaults or new
functions and leaves these names in place.
"""

import hashlib
import json
import math
from dataclasses import dataclass
from typing import Tuple

#: The cell size in metres.
CELL = 0.02

#: A peak alone tops out at PEAK_CAP < 1, so an authored peak never saturates a wide plateau.
PEAK_CAP = 0.85

#: The flat base of a pot surface when nothing follows the call (the table empties).
NEUTRAL_BASE = 0.5

#: The rail policies of a brush program.
RAIL_MODES = ("off", "penalize", "reward")

#: The intents a brush program paints for.
INTENTS = ("pot", "safety")

#: A pocket centre within SIDE_TOLERANCE of the kernel's y = 0 line is a side pocket.
SIDE_TOLERANCE = 1e-9


@dataclass(frozen=True)
class Grid:
    """A rendered surface: the cell size, the cell counts along scene x and y, and the values in
    [0, 1], row-major by y then x."""

    cell: float
    nx: int
    ny: int
    vals: Tuple[float, ...]

    def as_json(self):
        """The grid as a JSON-ready dict."""
        return {"cell": self.cell, "nx": self.nx, "ny": self.ny, "vals": list(self.vals)}

    def digest(self):
        """The first 16 hex digits of SHA-256 over the values as compact JSON."""
        text = json.dumps(list(self.vals), separators=(",", ":"))
        return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


@dataclass(frozen=True)
class Cloth:
    """The bed in the scene frame: its extent along scene x (the table's length) and along scene y
    (its width), the ball radius, and the pocket aim points (the four corners and the two side
    midpoints of the bed) in the kernel's pocket order."""

    length: float
    width: float
    radius: float
    pockets: Tuple[Tuple[float, float], ...]


def cloth(table):
    """The Cloth of an adapter.Table: each pocket centre is mapped to the corner or side midpoint
    of the bed on its side of the table, keeping the kernel's pocket order."""
    pockets = []
    for px, py in table.pockets:
        if abs(py) < SIDE_TOLERANCE:
            sx = table.length / 2.0
        else:
            sx = 0.0 if py < 0.0 else float(table.length)
        sy = 0.0 if px < 0.0 else float(table.width)
        pockets.append((sx, sy))
    return Cloth(float(table.length), float(table.width), float(table.ball_radius), tuple(pockets))


def scene_from_kernel(point, table):
    """A kernel-frame (x, y) in the scene frame of `table` (an adapter.Table)."""
    return (float(point[1]) + table.length / 2.0, float(point[0]) + table.width / 2.0)


def kernel_from_scene(point, table):
    """A scene-frame (x, y) in the kernel frame of `table`."""
    return (float(point[1]) - table.width / 2.0, float(point[0]) - table.length / 2.0)


def clamp(x, lo, hi):
    """x limited to [lo, hi]."""
    return min(hi, max(lo, x))


def dist(a, b):
    """The distance between two points."""
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _unit(a):
    length = math.hypot(a[0], a[1]) or 1e-9
    return (a[0] / length, a[1] / length)


def _corridor(a, b, positions, clearance):
    """True when a ball body at one of `positions` comes within `clearance` of the segment ab."""
    ab0, ab1 = b[0] - a[0], b[1] - a[1]
    den = (ab0 * ab0 + ab1 * ab1) or 1e-9
    for q in positions:
        t = min(1.0, max(0.0, ((q[0] - a[0]) * ab0 + (q[1] - a[1]) * ab1) / den))
        if math.hypot(q[0] - (a[0] + ab0 * t), q[1] - (a[1] + ab1 * t)) < clearance:
            return True
    return False


def blocked(a, b, blockers, bed, skip=()):
    """True when a ball body blocks the corridor from a to b: a blocker (name, (x, y)) whose
    centre comes within 2 R of the segment, the names in `skip` left out."""
    return _corridor(a, b, [pos for name, pos in blockers if name not in skip],
                     2.0 * bed.radius)


def rail_dist(p, bed):
    """The distance from p to the nearest cushion line of the bed."""
    return min(p[0], bed.length - p[0], p[1], bed.width - p[1])


def rail_penalty(p, bed):
    """The rail penalty of a cue ball at p: a frozen cue ball restricts the stroke."""
    return clamp(0.45 + 0.55 * (rail_dist(p, bed) - 0.03) / 0.17, 0.45, 1.0)


def object_leg_blocked(ball, pocket, blockers, target, bed):
    """True when the object ball's path to the pocket is blocked (2 R clearance), the target
    itself left out."""
    return blocked(ball, pocket, blockers, bed, skip=(target,))


def makeability_field(ball, pocket, blockers, target, bed, *, angle_band=None,
                      rail_mode="penalize", rail_severity=1.0, both_legs=False):
    """The function p -> makeability of potting `ball` (scene point) into `pocket` (scene point)
    from a cue ball at p. `blockers` lists (name, (x, y)) over every object ball; `target` is the
    name of `ball`, left out of its own corridors. both_legs=True is brush v0.2."""
    if rail_mode not in RAIL_MODES:
        raise ValueError(f"unknown rail mode {rail_mode!r}")
    if both_legs and object_leg_blocked(ball, pocket, blockers, target, bed):
        return lambda p: 0.0
    radius = bed.radius
    u2 = _unit((pocket[0] - ball[0], pocket[1] - ball[1]))
    ghost = (ball[0] - 2.0 * radius * u2[0], ball[1] - 2.0 * radius * u2[1])
    frozen = 2.2 * radius
    clearance = 2.0 * radius
    others = [pos for name, pos in blockers if name != target]
    penalize = rail_mode == "penalize"
    severity = rail_severity
    band = angle_band if angle_band and angle_band.get("enabled") else None
    if band is not None:
        centre = float(band["center_deg"])
        width = float(band["width_deg"])
        prefer = int(band.get("prefer_side", 1))
        wrong = float(band.get("wrong_side_factor", 0.18))

    def field(p):
        v0, v1 = ghost[0] - p[0], ghost[1] - p[1]
        d = math.hypot(v0, v1)
        if d < frozen:
            return 0.0                                    # frozen to the target
        n = d or 1e-9
        u1 = (v0 / n, v1 / n)
        cosine = u1[0] * u2[0] + u1[1] * u2[1]
        if cosine < 0.05:
            return 0.0                                    # wrong approach side
        theta = math.acos(min(1.0, max(-1.0, cosine)))
        deg = math.degrees(theta)
        if deg > 72.0:
            return 0.0                                    # too thin
        s = math.cos(theta) ** 1.4
        s *= min(1.0, max(0.55, 1.12 - 0.14 * d))         # distance decay
        if penalize:
            s *= 1.0 - severity * (1.0 - rail_penalty(p, bed))
        if math.hypot(p[0] - ball[0], p[1] - ball[1]) < 0.12:
            s *= 0.4                                      # awkward bridge
        if _corridor(p, ghost, others, clearance):
            return 0.0                                    # the cue ball's path is blocked
        if band is not None:
            g = math.exp(-((deg - centre) / width) ** 2)
            s *= 0.22 + 0.78 * g
            side = 1 if u2[0] * u1[1] - u2[1] * u1[0] >= 0 else -1
            if side != prefer:
                s *= wrong
        return min(1.0, max(0.0, s))

    return field


def makeability(p, ball, pocket, blockers, target, bed, *, angle_band=None,
                rail_mode="penalize", rail_severity=1.0, both_legs=False):
    """The makeability at one cue position p (see makeability_field)."""
    return makeability_field(ball, pocket, blockers, target, bed, angle_band=angle_band,
                             rail_mode=rail_mode, rail_severity=rail_severity,
                             both_legs=both_legs)(p)


def occlusion_hits(p, target, blockers, target_name, bed):
    """How many of the three sight lines from p to the target (its centre and the two points one
    radius to either side) are blocked."""
    radius = bed.radius
    u = _unit((target[0] - p[0], target[1] - p[1]))
    t = (-u[1], u[0])
    rays = (target,
            (target[0] + t[0] * radius, target[1] + t[1] * radius),
            (target[0] - t[0] * radius, target[1] - t[1] * radius))
    return sum(1 for q in rays if blocked(p, q, blockers, bed, skip=(target_name,)))


def safety(p, target, blockers, target_name, bed, *, rail_mode="reward",
           rail_severity=0.7):
    """The safety field at p: how well a cue ball resting at p hides `target` (scene point, named
    `target_name`) from the next shooter. `blockers` lists (name, (x, y)) over every object ball,
    the target included."""
    if rail_mode not in RAIL_MODES:
        raise ValueError(f"unknown rail mode {rail_mode!r}")
    radius = bed.radius
    for _name, pos in blockers:
        if dist(p, pos) < 2.2 * radius:
            return 0.0                                    # overlapping a ball
    if dist(p, target) < 0.15:
        return 0.0                                        # gives the contact away
    hit = occlusion_hits(p, target, blockers, target_name, bed)
    if hit < 2:
        return 0.0                                        # a direct line exists
    s = 1.0 if hit == 3 else 0.35                         # the half-cover tier
    dmin = min((dist(p, pos) for name, pos in blockers if name != target_name),
               default=math.inf)
    s *= clamp(1.28 - 0.5 * dmin, 0.55, 1.12)             # hug the blocker
    s *= clamp(0.55 + 0.35 * dist(p, target), 0.7, 1.05)
    if rail_mode == "reward":
        coef = 0.15 * rail_severity / 0.7                 # 0.15 at the default severity
        s *= 1.0 + coef * clamp((0.12 - rail_dist(p, bed)) / 0.12, 0.0, 1.0)
    return clamp(s, 0.0, 1.0)


def compose(balls, bed, intent, target, surface=None, brush=None):
    """The score function p -> [0, 1] of a brush program over a scene.

    balls    {ball id: (x, y)} of the object balls in the scene frame (no cue ball)
    intent   'pot': the surface scores rests after `target` is potted, by the makeability of
             `surface` = (ball, pocket index) from each point, or NEUTRAL_BASE when `surface` is
             None (nothing follows the call); 'safety': the safety field against `target`
    brush    {'rail_policy': {'mode', 'severity'}, 'angle_band': {...}, 'custom_peaks': [...],
             'custom_zeros': [...]}, every key optional; the rail mode defaults to 'off' and its
             severity to 0.7

    An authored peak {'x', 'y', 'radius', 'weight'} adds weight * exp(-(d / radius)**2) to a
    point whose base is above zero (a peak never revives a zero), the sum bounded:
    s + (1 - s) * min(sum, PEAK_CAP). An authored zero {'x', 'y', 'radius'} is a hard disc applied
    last."""
    if intent not in INTENTS:
        raise ValueError(f"unknown intent {intent!r}")
    brush = brush or {}
    rail = brush.get("rail_policy") or {}
    rail_mode = rail.get("mode", "off")
    if rail_mode not in RAIL_MODES:
        raise ValueError(f"unknown rail mode {rail_mode!r}")
    rail_severity = float(rail.get("severity", 0.7))
    peaks = brush.get("custom_peaks") or []
    zeros = brush.get("custom_zeros") or []
    radius = bed.radius

    if intent == "pot":
        post = {n: p for n, p in balls.items() if n != target}
        post_blockers = sorted(post.items())
        if surface is not None:
            sball, spocket = int(surface[0]), int(surface[1])
            base = makeability_field(post[sball], bed.pockets[spocket], post_blockers,
                                     sball, bed, angle_band=brush.get("angle_band"),
                                     rail_mode=rail_mode, rail_severity=rail_severity)
        else:
            def base(p):
                s = NEUTRAL_BASE
                for _n, pos in post_blockers:
                    if dist(p, pos) < 2.0 * radius:
                        return 0.0                        # overlapping a ball
                if rail_mode == "penalize":
                    s *= 1.0 - rail_severity * (1.0 - rail_penalty(p, bed))
                return s
    else:
        target_pos = balls[target]
        blockers = sorted(balls.items())

        def base(p):
            return safety(p, target_pos, blockers, target, bed, rail_mode=rail_mode,
                          rail_severity=rail_severity)

    def score(p):
        s = base(p)
        if s > 0.0 and peaks:
            psum = 0.0
            for pk in peaks:
                d = math.hypot(p[0] - pk["x"], p[1] - pk["y"])
                psum += float(pk["weight"]) * math.exp(-(d / float(pk["radius"])) ** 2)
            s = s + (1.0 - s) * min(psum, PEAK_CAP)
        s = clamp(s, 0.0, 1.0)
        for z in zeros:
            if math.hypot(p[0] - z["x"], p[1] - z["y"]) < float(z["radius"]):
                return 0.0
        return s

    return score


def centres(extent, cell=CELL):
    """The cell centres along one axis: cell/2, then + cell at a time while below `extent`."""
    out = []
    c = cell / 2.0
    while c < extent:
        out.append(c)
        c += cell
    return out


def render(score, table):
    """The Grid of a score function p -> [0, 1] (scene frame) over `table`."""
    xs = centres(table.length)
    ys = centres(table.width)
    vals = [clamp(score((x, y)), 0.0, 1.0) for y in ys for x in xs]
    return Grid(CELL, len(xs), len(ys), tuple(vals))


def plateau(grid):
    """(max, (x, y), cells): the grid's largest value, the centroid of the cells within 1e-6 of it
    (a single scanned maximum would be an accident of scan order on a flat top), and their
    count."""
    xs = _lattice(grid.nx, grid.cell)
    ys = _lattice(grid.ny, grid.cell)
    best = max(grid.vals)
    cx = cy = n = 0.0
    i = 0
    for y in ys:
        for x in xs:
            if grid.vals[i] >= best - 1e-6:
                cx += x
                cy += y
                n += 1
            i += 1
    return best, (cx / n, cy / n), int(n)


def _lattice(count, cell):
    out = []
    c = cell / 2.0
    for _ in range(count):
        out.append(c)
        c += cell
    return out


def validate(grid):
    """Refuse a malformed surface before any kernel work: the cell must be CELL, the value count
    nx * ny, every value in [0, 1]. Returns the grid."""
    if float(grid.cell) != CELL:
        raise ValueError(f"leave-surface cell {grid.cell!r} is not the {CELL} m grid")
    if grid.nx <= 0 or grid.ny <= 0 or len(grid.vals) != grid.nx * grid.ny:
        raise ValueError(f"leave-surface shape {grid.nx}x{grid.ny} does not match its "
                         f"{len(grid.vals)} values")
    if any(not 0.0 <= float(v) <= 1.0 for v in grid.vals):
        raise ValueError("leave-surface values outside [0, 1]")
    return grid


def weight(grid, x, y):
    """W(x, y) at a scene-frame point: bilinear interpolation between the four surrounding cell
    centres, clamped to the edge cells outside the lattice of centres."""
    nx, ny = int(grid.nx), int(grid.ny)
    vals = grid.vals
    cell = float(grid.cell)
    fx = min(max((float(x) - cell / 2.0) / cell, 0.0), nx - 1.0)
    fy = min(max((float(y) - cell / 2.0) / cell, 0.0), ny - 1.0)
    i0, j0 = int(fx), int(fy)
    i1, j1 = min(i0 + 1, nx - 1), min(j0 + 1, ny - 1)
    tx, ty = fx - i0, fy - j0
    v00, v10 = float(vals[j0 * nx + i0]), float(vals[j0 * nx + i1])
    v01, v11 = float(vals[j1 * nx + i0]), float(vals[j1 * nx + i1])
    lo = v00 + (v10 - v00) * tx
    hi = v01 + (v11 - v01) * tx
    return lo + (hi - lo) * ty
