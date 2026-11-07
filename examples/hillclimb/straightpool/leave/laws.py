# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The closed-form choices behind a declaration: cut, makeability, the leave target and the band.

Every law here is plane geometry of the position: no learned constant, no random draw, no
simulation. Positions are {ball id: (x, y)} in the kernel frame (ball 0 is the cue ball and may be
absent while it is in hand); `table` is an adapter.Table; candidates are
straightpool.candidates.Candidate in enumeration order.

    cut_deg            |cut| in degrees of a candidate's own ball-to-pocket line (ghost-ball aim)
    make               the makeability of a direct pot from an aim point (brush v0.1 or v0.2)
    direct_pots        the direct pots of a candidate list, each with its cut and makeability
    surface_pocket     the pocket whose leave surface for a ball sums highest after a pot
    surface_argmax     the next ball: the post-shot ball whose best pocket sums highest
    prefer_side        the side of the next pot line that leaves an angle on the ball after next
    leave_program      the leave target and the brush program that follow a called ball

The aim point of a candidate is the cue ball, or the candidate's own placement while the cue ball
is in hand (the origin when it has none).
"""

import math
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any

from straightpool.leave import brush

#: The shot classes of a direct pot.
POT_FAMILIES = ("pot", "position-pot")

#: The rail term of every painted declaration: the reviewed rail penalty at full severity.
RAIL_POLICY = MappingProxyType({"mode": "penalize", "severity": 1.0})

#: The angle band of every painted declaration that has a ball after next: centre 30 degrees,
#: width 16 degrees, wrong-side factor 0.18 (enabled and prefer_side are set per declaration).
BAND = MappingProxyType({"center_deg": 30.0, "width_deg": 16.0, "wrong_side_factor": 0.18})


@dataclass(frozen=True)
class DirectPot:
    """A direct-pot candidate with its |cut| in degrees and its makeability from its aim point."""

    candidate: Any
    cut_deg: float
    make: float


def aim_point(positions, candidate):
    """The cue ball, or the candidate's placement while the cue ball is in hand."""
    cue = positions.get(0)
    if cue is not None:
        return cue
    place = candidate.place or (0.0, 0.0)
    return (float(place[0]), float(place[1]))


def _unit(v):
    n = math.hypot(v[0], v[1])
    if n == 0.0:
        raise ValueError("zero-length direction")
    return (v[0] / n, v[1] / n)


def cut_deg(cue, positions, candidate, table):
    """|cut| in degrees on the candidate's own ball-to-pocket line from the aim point (the cue
    ball, or the candidate's placement when `cue` is None); None when the candidate has no pot
    line or the geometry is degenerate."""
    intent = candidate.intent
    pocket, target = intent.pocket, intent.ball
    if pocket is None or target is None or target not in positions:
        return None
    aim = cue if cue is not None else tuple(candidate.place or (0.0, 0.0))
    ball = positions[target]
    centre = table.pockets[int(pocket)]
    radius = table.ball_radius
    try:
        axis = _unit((centre[0] - ball[0], centre[1] - ball[1]))
        ghost = (ball[0] - 2.0 * radius * axis[0], ball[1] - 2.0 * radius * axis[1])
        aim_dir = _unit((ghost[0] - aim[0], ghost[1] - aim[1]))
        pot_dir = _unit((centre[0] - ball[0], centre[1] - ball[1]))
    except ValueError:
        return None
    cut = math.atan2(aim_dir[0] * pot_dir[1] - aim_dir[1] * pot_dir[0],
                     aim_dir[0] * pot_dir[0] + aim_dir[1] * pot_dir[1])
    return abs(math.degrees(cut))


def scene_blockers(positions, table):
    """[(ball id, scene point)] of every object ball, by ascending id."""
    return sorted((int(n), brush.scene_from_kernel(p, table)) for n, p in positions.items()
                  if int(n) != 0)


def make(aim, ball, pocket, positions, table, *, both_legs=True):
    """The makeability of potting `ball` into `pocket` from the kernel-frame aim point, every
    object ball a blocker: no angle band, the rail penalty at full severity. both_legs=False is
    brush v0.1 (only the cue ball's path is checked), True is brush v0.2 (the object ball's path
    to the pocket too)."""
    bed = brush.cloth(table)
    return brush.makeability(brush.scene_from_kernel(aim, table),
                             brush.scene_from_kernel(positions[int(ball)], table),
                             bed.pockets[int(pocket)], scene_blockers(positions, table),
                             int(ball), bed, angle_band=None, rail_mode="penalize",
                             rail_severity=1.0, both_legs=both_legs)


def direct_pots(positions, candidates, table, *, both_legs=True):
    """The direct pots among `candidates` (a direct-pot shot class, a ball on the table, a pocket
    and a defined cut), in enumeration order, each priced by make() from its aim point."""
    cue = positions.get(0)
    rows = []
    for cand in candidates:
        intent = cand.intent
        if intent.shot_class not in POT_FAMILIES:
            continue
        target, pocket = intent.ball, intent.pocket
        if target is None or pocket is None or int(target) not in positions:
            continue
        cut = cut_deg(cue, positions, cand, table)
        if cut is None:
            continue
        rows.append(DirectPot(cand, cut, make(aim_point(positions, cand), int(target),
                                              int(pocket), positions, table,
                                              both_legs=both_legs)))
    return rows


def surface_pocket(positions, declared, ball, table):
    """(pocket index, sum): the pocket whose pot surface for `ball` on the table left after
    `declared` is potted (rail penalty at full severity, no band) has the largest sum over the
    grid; ties go to the lower pocket index."""
    bed = brush.cloth(table)
    balls = {int(n): brush.scene_from_kernel(p, table) for n, p in sorted(positions.items())
             if int(n) != 0}
    best_idx, best_sum = 0, None
    for j in range(len(bed.pockets)):
        score = brush.compose(balls, bed, "pot", int(declared), (int(ball), j),
                              {"rail_policy": dict(RAIL_POLICY)})
        total = sum(brush.render(score, bed).vals)
        if best_sum is None or total > best_sum:
            best_idx, best_sum = j, total
    return best_idx, best_sum


def surface_argmax(positions, declared, table):
    """(ball, pocket, sum) of the next ball after `declared` is potted: over the object balls
    left, by ascending id, the one whose surface_pocket sum is largest (ties to the lower id);
    None when no object ball is left."""
    best = None
    for ball in sorted(int(n) for n in positions if int(n) not in (0, int(declared))):
        idx, total = surface_pocket(positions, declared, ball, table)
        if best is None or total > best[2]:
            best = (ball, idx, total)
    return best


def prefer_side(ball, pocket, after):
    """+1 when the ball after next (scene point `after`) is to the left of the pot line from
    `ball` to `pocket` (scene points) or on it, -1 otherwise."""
    ux = pocket[0] - ball[0]
    uy = pocket[1] - ball[1]
    length = math.hypot(ux, uy) or 1e-9
    u2 = (ux / length, uy / length)
    w = (after[0] - ball[0], after[1] - ball[1])
    return 1 if (u2[0] * w[1] - u2[1] * w[0]) >= 0 else -1


def leave_program(positions, declared, table):
    """(surface, brush program, info) for a call on `declared`.

    surface is (ball, pocket) of the next ball (surface_argmax), or None when the table empties.
    The program always carries the rail penalty; when a ball after next exists (surface_argmax
    again, with both balls potted) it adds the angle band toward its side of the next pot line.
    info holds the surface sum, the ball after next and the side (None where undefined)."""
    program = {"rail_policy": dict(RAIL_POLICY)}
    info = {"surface_sum": None, "ball_after_next": None, "prefer_side": None}
    found = surface_argmax(positions, declared, table)
    if found is None:
        return None, program, info
    sball, spocket, ssum = found
    left = {int(n): p for n, p in positions.items() if int(n) not in (0, int(declared))}
    after = surface_argmax(left, sball, table)
    info["surface_sum"] = ssum
    if after is not None:
        bed = brush.cloth(table)
        side = prefer_side(brush.scene_from_kernel(positions[sball], table), bed.pockets[spocket],
                           brush.scene_from_kernel(positions[after[0]], table))
        program["angle_band"] = dict(BAND, enabled=True, prefer_side=side)
        info["ball_after_next"] = int(after[0])
        info["prefer_side"] = side
    return (int(sball), int(spocket)), program, info
