# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The stroke candidates of a position, and their simulation-based selection.

Two generators, both plane geometry of the position, deterministic in their order, and neither
predicting an outcome: every candidate that can be chosen is simulated in the kernel on the
decision's shared draw block (hillclimb.select), and the best by the objective is played.

enumerate_candidates is the menu our baseline agent chooses from. For every object ball on the
table (ascending), that ball as the target: the ghost-ball pot into every pocket whose cut is
under MAX_CUT_DEG, two cheat-the-pocket offsets across the pocket mouth, natural-route position
strokes (stun, roll and draw seeds toward the nearest pockets of the next ball), and three
safeties (a minimum-speed full contact and two thin hits). The next ball of a target is the
lowest-numbered object ball above it. Speeds are closed-form seeds (rolling deceleration and the
speed handed over at a cut); the rollouts do the real scoring. With the cue ball in hand, each
pocket's geometry runs from a placement behind the target ball on its pot line, seated first as
the game seats the cue ball (straightpool.game.seat: clipped into the granted zone, the kitchen
included, then moved off the object balls), so that the stroke is aimed from where it is played;
the candidate carries that seat as its placement, which the painter and the rollouts read.

sobol_pool lays a scrambled Sobol set of strokes round the aim centres of every (object ball,
pocket) pair: the direct ghost-ball line of every cut under 90 deg, then the one-rail bank and kick
mirror lines that clear every ball (mirror_lines). It is the pool the C2 pre-filter orders at a
search decision; it needs the cue ball on the table.

score and family are the simulation side: score rolls every candidate out on the same draws with
the same kernel seed and averages an objective (select.rollouts and select.score); family picks the
seeds of a declared shot for best-of-K refinement (select.best_of_k).

Other parts of the package use the names below, so a change adds fields with defaults or new
functions and leaves these names in place.
"""

import math
from dataclasses import dataclass
from typing import Optional, Tuple

from hillclimb import noise as hand_noise
from hillclimb import select
from hillclimb.adapter import Stroke

from straightpool import game as rules

#: What a candidate is for. The menu makes pot, position-pot and safety; the bank, kick and jump
#: classes name the families of our later agents.
SHOT_CLASSES = ("pot", "position-pot", "safety", "bank-pot", "kick-pot", "kick-safety",
                "jump-pot")

#: Which generator family produced a candidate. The menu's are ghost-ball, cheat-offset,
#: natural-route and safety; the others name the side-spin, mirror and jump families of our later
#: agents.
ORIGINS = ("ghost-ball", "cheat-offset", "natural-route", "safety", "english-route",
           "bank-mirror", "kick-mirror", "jump")

#: The kinds of a Sobol pool member (C2 reads them as a 3-way indicator).
POOL_KINDS = ("direct", "bank", "kick")

#: Pots beyond this cut (deg) are not enumerated.
MAX_CUT_DEG = 80.0

#: Speed seeds: cloth rolling deceleration (m/s^2), the object ball's speed at the pocket (m/s),
#: the margin over the closed form, and the range of a seed (m/s).
ROLL_DECEL = 0.15
POCKET_ARRIVAL_V = 1.2
SPEED_MARGIN = 1.15
V0_SEED = (1.0, 6.0)

#: The cheat-the-pocket offset across the pocket mouth (m), the standoff of a position target up
#: the next ball's straight-in line (m), and of the in-hand placement behind the target (m).
CHEAT_OFFSET = 0.02
ZONE_STANDOFF = 0.25
PLACEMENT_STANDOFF = 0.35

#: Natural-route seeds: (family, cue elevation, tip offset b, speed factor over the pot seed).
ROUTE_FAMILIES = (("stun", 0.0, -0.05, 1.20), ("roll", 0.0, 0.25, 1.00),
                  ("draw", 0.0, -0.30, 1.30))

#: Position seeds aim at the zones of at most this many pockets of the next ball (nearest first).
MAX_NEXT_ZONES = 5

#: The Sobol pool's box: v0 (m/s), the aim half-spread round a direct and a mirror centre (rad),
#: and the tip half-range (ball radii) of a and b before the projection's radial clip.
POOL_V0 = (0.5, 15.0)
POOL_DELTA_DIRECT = math.radians(1.0)
POOL_DELTA_MIRROR = math.radians(4.0)
POOL_SPIN = 0.5

#: The ball-centre rail lines of the mirror system, in enumeration order.
RAILS = ("xmin", "xmax", "ymin", "ymax")


@dataclass(frozen=True)
class Intent:
    """The ball a candidate plays at, the pocket it aims the ball into (kernel pocket index; None
    for a safety), and its shot class (one of SHOT_CLASSES)."""

    ball: int
    pocket: Optional[int]
    shot_class: str


@dataclass(frozen=True)
class Candidate:
    """One enumerated stroke: its index in enumeration order (ties break toward the lower index),
    its intent, the commanded stroke, the family that produced it (one of ORIGINS), the cue-ball
    placement (x, y) while in hand, and the next shot it sets up, when it is a position stroke."""

    index: int
    intent: Intent
    stroke: Stroke
    origin: str
    place: Optional[Tuple[float, float]] = None
    next_intent: Optional[Intent] = None


@dataclass(frozen=True)
class PoolMember:
    """One stroke of the Sobol pool: its pool index, the ball and pocket of the aim centre it was
    laid round, its kind (one of POOL_KINDS), the stroke, the cue-ball placement while in hand, and
    the cut angle in degrees of the pot it aims (None where no cut is defined). The pool is laid
    only with the cue ball on the table, so place is None; the cut is rounded to 2 decimals."""

    index: int
    ball: int
    pocket: int
    kind: str
    stroke: Stroke
    place: Optional[Tuple[float, float]] = None
    cut_deg: Optional[float] = None


@dataclass(frozen=True)
class AimCentre:
    """One aim centre of the Sobol pool: its kind, ball and pocket, the rail of a mirror line
    (None for a direct line), the aim direction phi (rad, in [0, 2 pi)), the cut in degrees
    (rounded to 2 decimals), whether the cue ball's path to the contact point is clear of the
    other balls (direct lines; mirror lines are clear by construction), and the aim half-spread
    of its pool strokes (rad)."""

    kind: str
    ball: int
    pocket: int
    rail: Optional[str]
    phi: float
    cut_deg: float
    clear: bool
    delta: float


@dataclass(frozen=True)
class MirrorLine:
    """A one-rail mirror line: 'bank' (the object ball off the rail into the pocket) or 'kick' (the
    cue ball off the rail onto the ghost-ball point), its ball, pocket and rail, the cut (deg), the
    speed seed (m/s), the aim phi (rad), the rail crossing point, and the cue-ball (d) and
    object-ball (dp) path lengths (m)."""

    kind: str
    ball: int
    pocket: int
    rail: str
    cut_deg: float
    v0: float
    phi: float
    crossing: Tuple[float, float]
    d: float
    dp: float


# ---- plane geometry ------------------------------------------------------------------------------


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def _norm(v):
    return math.hypot(v[0], v[1])


def _unit(v):
    n = _norm(v)
    if n == 0.0:
        raise ValueError("zero-length direction")
    return (v[0] / n, v[1] / n)


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1]


def _cross(a, b):
    return a[0] * b[1] - a[1] * b[0]


def ghost_point(ball, pocket, radius):
    """The cue ball's centre at contact for the straight pot of `ball` into `pocket`: two radii
    behind the ball on the pocket line."""
    axis = _unit(_sub(pocket, ball))
    return (ball[0] - 2.0 * radius * axis[0], ball[1] - 2.0 * radius * axis[1])


def ghost_aim(cue, ball, pocket, radius):
    """The ghost-ball solution: (ghost point, aim phi (atan2), signed cut (rad; + when the ball
    goes to the aim line's left), cue-to-ghost distance d, ball-to-pocket distance dp)."""
    ghost = ghost_point(ball, pocket, radius)
    aim = _sub(ghost, cue)
    aim_dir = _unit(aim)
    pot_dir = _unit(_sub(pocket, ball))
    cut = math.atan2(_cross(aim_dir, pot_dir), _dot(aim_dir, pot_dir))
    return ghost, math.atan2(aim[1], aim[0]), cut, _norm(aim), _norm(_sub(pocket, ball))


def pocket_lines(table):
    """Per pocket (kernel order): its centre, 'corner' or 'side', and the unit line from the
    pocket into the table (side pockets sit on the long rails at y = 0)."""
    out = []
    for x, y in table.pockets:
        if abs(y) < 1e-9:
            out.append(((x, y), "side", (-math.copysign(1.0, x), 0.0)))
        else:
            n = math.hypot(x, y)
            out.append(((x, y), "corner", (-x / n, -y / n)))
    return tuple(out)


def pot_speed(d, dp, cut):
    """The closed-form speed seed of a pot: the object ball reaches the pocket at
    POCKET_ARRIVAL_V against rolling deceleration, the cue ball hands over about cos(cut) of its
    speed at contact after travelling d, times SPEED_MARGIN, within V0_SEED."""
    v_obj = math.sqrt(POCKET_ARRIVAL_V ** 2 + 2.0 * ROLL_DECEL * dp)
    transfer = max(math.cos(cut), 0.3)
    v_impact = v_obj / (0.85 * transfer)
    v0 = math.sqrt(v_impact ** 2 + 2.0 * ROLL_DECEL * d) * SPEED_MARGIN
    return min(max(v0, V0_SEED[0]), V0_SEED[1])


def _placement(ball, pocket, table):
    """The suggested in-hand placement for a pot of `ball` into `pocket`: PLACEMENT_STANDOFF behind
    the ball on the pot line, kept two radii inside the cushion lines. The menu aims from its seat
    (_seat), never from the suggestion itself."""
    ux, uy = _unit(_sub(pocket, ball))
    x = ball[0] - PLACEMENT_STANDOFF * ux
    y = ball[1] - PLACEMENT_STANDOFF * uy
    r = table.ball_radius
    half_w = table.width / 2.0 - 2.0 * r
    half_l = table.length / 2.0 - 2.0 * r
    return (min(max(x, -half_w), half_w), min(max(y, -half_l), half_l))


def _seat(place, zone, positions, table):
    """Where the game seats the cue ball for the in-hand placement `place` in `zone` ('anywhere' or
    'kitchen'), as straightpool.game.seat does: clipped into the zone, then moved off the object
    balls of `positions` (straightpool.game.place_in_zone)."""
    objects = [xy for ball, xy in positions.items() if ball != rules.CUE]
    return rules.place_in_zone(zone, place[0], place[1], table, objects)


def _cheat_point(centre, line, offset):
    """The pocket centre moved across the mouth (perpendicular to the pocket's line) by offset."""
    lx, ly = -line[1], line[0]
    return (centre[0] + offset * lx, centre[1] + offset * ly)


# ---- the menu ------------------------------------------------------------------------------------


def _target_rows(positions, target, table, in_hand):
    """The rows of one target ball: (intent, stroke entries, origin, place, next intent), place
    None with the cue ball on the table and, while it is in hand, its seat in the zone `in_hand`.
    ValueError when the geometry is degenerate or no row exists (the target is then skipped)."""
    radius = table.ball_radius
    lines = pocket_lines(table)
    cue = positions.get(rules.CUE)
    ball = positions[target]
    later = [b for b in sorted(positions) if b != rules.CUE and b > target]
    next_ball = later[0] if later else None

    def aimed_from(centre):
        """(aim origin, placement) of a stroke toward `centre`: the cue ball and None, or with the
        cue ball in hand the seat of the suggested placement, as both."""
        if cue is not None:
            return cue, None
        seat = _seat(_placement(ball, centre, table), in_hand, positions, table)
        return seat, seat

    rows = []
    for pocket, (centre, _kind, line) in enumerate(lines):
        origin, place = aimed_from(centre)
        try:
            _ghost, phi, cut, d, dp = ghost_aim(origin, ball, centre, radius)
        except ValueError:
            continue
        if abs(math.degrees(cut)) >= MAX_CUT_DEG:
            continue
        v0 = pot_speed(d, dp, cut)
        rows.append((Intent(target, pocket, "pot"), (v0, phi % (2 * math.pi), 0.0, 0.0, 0.0),
                     "ghost-ball", place, None))
        for offset in (-CHEAT_OFFSET, CHEAT_OFFSET):
            try:
                _g, cphi, ccut, _d, _dp = ghost_aim(origin, ball,
                                                    _cheat_point(centre, line, offset), radius)
            except ValueError:
                continue
            if abs(math.degrees(ccut)) >= MAX_CUT_DEG:
                continue
            rows.append((Intent(target, pocket, "pot"),
                         (v0, cphi % (2 * math.pi), 0.0, 0.0, 0.0), "cheat-offset", place, None))
        if next_ball is None:
            continue
        nball = positions[next_ball]
        zones = []
        for npocket, (ncentre, _nkind, _nline) in enumerate(lines):
            ux, uy = _unit(_sub(nball, ncentre))
            zone = (nball[0] + ZONE_STANDOFF * ux, nball[1] + ZONE_STANDOFF * uy)
            zones.append((math.hypot(nball[0] - ncentre[0], nball[1] - ncentre[1]), npocket, zone))
        zones.sort()
        ghost = ghost_point(ball, centre, radius)
        for _dist, npocket, zone in zones[:MAX_NEXT_ZONES]:
            travel = math.hypot(zone[0] - ghost[0], zone[1] - ghost[1])
            reach = min(max(0.75 + 0.5 * travel / 1.2, 0.75), 1.6)
            for _family, theta, b, factor in ROUTE_FAMILIES:
                v = min(max(v0 * factor * reach, V0_SEED[0]), V0_SEED[1])
                rows.append((Intent(target, pocket, "position-pot"),
                             (v, phi % (2 * math.pi), theta, 0.0, b), "natural-route", place,
                             Intent(next_ball, npocket, "pot")))
    origin, place = aimed_from(lines[0][0])
    to_ball = _sub(ball, origin)
    d_centre = _norm(to_ball)
    if d_centre > 1e-9:
        phi_centre = math.atan2(to_ball[1], to_ball[0])
        safety = Intent(target, None, "safety")
        v_min = min(max(math.sqrt(2.0 * ROLL_DECEL * d_centre) * 1.5 + 0.8, V0_SEED[0]),
                    V0_SEED[1])
        rows.append((safety, (v_min, phi_centre % (2 * math.pi), 0.0, 0.0, 0.0), "safety",
                     place, None))
        contact_half = math.asin(min(1.0, 2.0 * radius / d_centre))
        for sign in (-1.0, 1.0):
            phi_thin = phi_centre + sign * 0.9 * contact_half
            rows.append((safety, (1.4, phi_thin % (2 * math.pi), 0.0, 0.0, 0.0), "safety",
                         place, None))
    if not rows:
        raise ValueError(f"no candidate on ball {target}")
    return rows


def enumerate_candidates(game):
    """The candidates of a straightpool.game.Game, every object ball callable, in a deterministic
    order with index = position in the list. A ball whose geometry yields no row adds none. While
    the cue ball is in hand, every candidate's placement is its seat in the game's zone, the
    point its stroke is aimed from; ValueError for a game whose cue ball is off the table but not
    in hand."""
    positions = game.state.positions()
    table = game.state.table()
    in_hand = None
    if rules.CUE not in positions:
        in_hand = game.in_hand
        if in_hand not in ("anywhere", "kitchen"):
            raise ValueError(f"the cue ball of game {game.key} is off the table but not in hand "
                             f"(in_hand {in_hand!r})")
    out = []
    for target in sorted(b for b in positions if b != rules.CUE):
        try:
            rows = _target_rows(positions, target, table, in_hand)
        except ValueError:
            continue
        for intent, entries, origin, place, next_intent in rows:
            out.append(Candidate(index=len(out), intent=intent, stroke=Stroke.of(entries),
                                 origin=origin, place=place, next_intent=next_intent))
    return out


def family(candidates, ball, pocket, shot_class="pot"):
    """The candidates of one declared shot (its ball, pocket and shot class), in enumeration
    order: the seeds of its refinement. ValueError when the menu holds none."""
    want = Intent(int(ball), None if pocket is None else int(pocket), shot_class)
    seeds = [c for c in candidates if c.intent == want]
    if not seeds:
        raise ValueError(f"no candidate for {want}")
    return seeds


# ---- mirror lines and the Sobol pool -------------------------------------------------------------


def rail_lines(table):
    """The four ball-centre rail lines: {name: (axis, coordinate, half-span on the other axis)},
    each cushion line pulled in by one ball radius."""
    r = table.ball_radius
    hw = table.width / 2.0 - r
    hl = table.length / 2.0 - r
    return {"xmin": ("x", -hw, hl), "xmax": ("x", hw, hl),
            "ymin": ("y", -hl, hw), "ymax": ("y", hl, hw)}


def _mirror(point, line):
    axis, coord, _span = line
    if axis == "x":
        return (2.0 * coord - point[0], point[1])
    return (point[0], 2.0 * coord - point[1])


def _crossing(origin, aim, line):
    """Where the segment origin -> aim crosses a rail line inside its span, else None."""
    axis, coord, span = line
    o = origin[0] if axis == "x" else origin[1]
    a = aim[0] if axis == "x" else aim[1]
    denom = a - o
    if abs(denom) < 1e-12:
        return None
    t = (coord - o) / denom
    if not 0.0 < t < 1.0:
        return None
    point = (origin[0] + t * (aim[0] - origin[0]), origin[1] + t * (aim[1] - origin[1]))
    other = point[1] if axis == "x" else point[0]
    return point if abs(other) <= span + 1e-9 else None


def _soft_unit(v):
    n = math.hypot(v[0], v[1])
    return (v[0] / n, v[1] / n) if n > 1e-12 else (0.0, 0.0)


def _segment_distance(a, b, p):
    ab = _sub(b, a)
    t = min(1.0, max(0.0, _dot(_sub(p, a), ab) / (_dot(ab, ab) or 1e-9)))
    return math.hypot(p[0] - (a[0] + ab[0] * t), p[1] - (a[1] + ab[1] * t))


def corridor_clear(a, b, blockers, radius, skip=()):
    """True when no blocker centre (id, (x, y)) other than the ids in `skip` comes within two
    radii of the segment a -> b."""
    return not any(_segment_distance(a, b, p) < 2.0 * radius
                   for ball, p in blockers if ball not in skip)


def _pocket_rails(pocket, lines):
    """The rail lines a pocket sits on (two for a corner, one for a side pocket)."""
    out = set()
    for name, (axis, coord, _span) in lines.items():
        c = pocket[0] if axis == "x" else pocket[1]
        if c * coord > 0 and abs(c) >= abs(coord) - 1e-9:
            out.add(name)
    return out


def _mirror_line(kind, positions, ball, pocket, rail, table, lines):
    cue, bpos = positions[rules.CUE], positions[ball]
    centre, radius = table.pockets[pocket], table.ball_radius
    line = lines[rail]
    blockers = [(b, p) for b, p in positions.items() if b != rules.CUE]
    if kind == "bank":
        mirrored = _mirror(centre, line)
        crossing = _crossing(bpos, mirrored, line)
        if crossing is None:
            return None
        ghost = ghost_point(bpos, mirrored, radius)
        depart = _sub(mirrored, bpos)
        aim = _sub(ghost, cue)
        d, dp = _norm(aim), _norm(depart)
        legs = ((cue, ghost, (ball,)), (bpos, crossing, (ball,)), (crossing, centre, (ball,)))
        phi = math.atan2(aim[1], aim[0])
    else:
        ghost = ghost_point(bpos, centre, radius)
        mirrored = _mirror(ghost, line)
        crossing = _crossing(cue, mirrored, line)
        if crossing is None:
            return None
        depart = _sub(centre, bpos)
        aim = _sub(crossing, ghost)
        aim = (-aim[0], -aim[1])
        d, dp = _norm(_sub(mirrored, cue)), _norm(depart)
        legs = ((cue, crossing, ()), (crossing, ghost, (ball,)), (bpos, centre, (ball,)))
        phi = math.atan2(mirrored[1] - cue[1], mirrored[0] - cue[0])
    if d < 2.2 * radius or _dot(_soft_unit(aim), _soft_unit(depart)) <= 0.0:
        return None
    cut = math.degrees(math.acos(max(-1.0, min(1.0, _dot(_soft_unit(aim), _soft_unit(depart))))))
    if cut >= MAX_CUT_DEG:
        return None
    for a, b, skip in legs:
        if not corridor_clear(a, b, blockers, radius, skip):
            return None
    v0 = pot_speed(d, dp, math.radians(cut)) * SPEED_MARGIN
    return MirrorLine(kind=kind, ball=ball, pocket=pocket, rail=rail, cut_deg=cut, v0=v0,
                      phi=phi % (2 * math.pi), crossing=crossing, d=d, dp=dp)


def mirror_lines(positions, table):
    """Every feasible one-rail bank and kick line of a position {id: (x, y)} with the cue ball on
    the table, in the order (kind: bank then kick, ball, pocket, rail), skipping the rails a pocket
    sits on. A line is feasible when its reflected leg crosses the rail inside the cushion, it
    approaches the object ball from the right side at a cut under MAX_CUT_DEG, the cue ball
    travels at least 2.2 radii, and every leg clears the other balls by two radii."""
    if rules.CUE not in positions:
        return []
    positions = dict(sorted((int(b), (float(p[0]), float(p[1]))) for b, p in positions.items()))
    lines = rail_lines(table)
    out = []
    for kind in ("bank", "kick"):
        for ball in (b for b in positions if b != rules.CUE):
            for pocket, centre in enumerate(table.pockets):
                sits_on = _pocket_rails(centre, lines)
                for rail in RAILS:
                    if rail in sits_on:
                        continue
                    found = _mirror_line(kind, positions, ball, pocket, rail, table, lines)
                    if found is not None:
                        out.append(found)
    return out


def _clear_path(a, b, blockers, radius):
    """The direct centre's receipt: no blocker within two radii of the segment a -> b."""
    ax, ay = a
    bx, by = b
    length2 = (bx - ax) ** 2 + (by - ay) ** 2
    for q in blockers:
        t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((q[0] - ax) * (bx - ax)
                                                         + (q[1] - ay) * (by - ay)) / length2))
        if math.hypot(q[0] - (ax + t * (bx - ax)), q[1] - (ay + t * (by - ay))) < 2 * radius:
            return False
    return True


def aim_centres(game):
    """The aim centres of the Sobol pool of a straightpool.game.Game: for every object ball
    (ascending) and pocket, the direct ghost-ball line when its cut is under 90 deg, then every
    mirror line. Empty while the cue ball is in hand."""
    positions = game.state.positions()
    table = game.state.table()
    cue = positions.get(rules.CUE)
    if cue is None:
        return []
    radius = table.ball_radius
    out = []
    for ball in (b for b in positions if b != rules.CUE):
        bpos = positions[ball]
        others = [p for b, p in positions.items() if b not in (rules.CUE, ball)]
        for pocket, centre in enumerate(table.pockets):
            ghost = ghost_point(bpos, centre, radius)
            aim = (ghost[0] - cue[0], ghost[1] - cue[1])
            depart = (centre[0] - bpos[0], centre[1] - bpos[1])
            na, nd = math.hypot(*aim), math.hypot(*depart)
            if na < 1e-9 or nd < 1e-9:
                continue
            cut = math.degrees(math.acos(max(-1.0, min(1.0, (aim[0] * depart[0]
                                                             + aim[1] * depart[1])
                                                       / (na * nd)))))
            if cut < 90.0:
                out.append(AimCentre(kind="direct", ball=ball, pocket=pocket, rail=None,
                                     phi=math.atan2(aim[1], aim[0]) % (2 * math.pi),
                                     cut_deg=round(cut, 2),
                                     clear=_clear_path(cue, ghost, others, radius),
                                     delta=POOL_DELTA_DIRECT))
    for line in mirror_lines(positions, table):
        out.append(AimCentre(kind=line.kind, ball=line.ball, pocket=line.pocket, rail=line.rail,
                             phi=float(line.phi), cut_deg=round(float(line.cut_deg), 2),
                             clear=True, delta=POOL_DELTA_MIRROR))
    return out


def sobol_points(n, seed):
    """n points of the scrambled 4-dimensional Sobol sequence of scipy.stats.qmc seeded by `seed`
    (an integer, given as qmc.Sobol's transitional `seed` argument: its `rng` argument with the
    same integer draws another scramble, so the pool keeps `seed` and the exact scipy pin of
    pyproject.toml); n must be a power of two (the balanced sequence)."""
    n = int(n)
    if n < 1 or n & (n - 1):
        raise ValueError(f"a Sobol pool takes a power of two of points, not {n}")
    from scipy.stats import qmc
    return qmc.Sobol(d=4, scramble=True, seed=int(seed)).random_base2(n.bit_length() - 1)


def sobol_pool(game, *, n, seed):
    """n pool members (a power of two) from a scrambled Sobol sequence seeded by `seed`, laid round
    the aim centres of every (object ball, pocket) pair, in pool-index order: member i takes centre
    i mod (the number of centres), v0 across POOL_V0, phi within the centre's half-spread, and the
    tip offsets a and b across +-POOL_SPIN, projected into the kernel's stroke domain. Empty while
    the cue ball is in hand or without a centre."""
    centres = aim_centres(game)
    cue = game.state.positions().get(rules.CUE)
    if not centres or cue is None:
        return []
    points = sobol_points(n, seed)
    members = []
    for i in range(int(n)):
        centre = centres[i % len(centres)]
        u = points[i]
        v0 = POOL_V0[0] + (POOL_V0[1] - POOL_V0[0]) * float(u[0])
        dphi = (2.0 * float(u[1]) - 1.0) * centre.delta
        b = (2.0 * float(u[2]) - 1.0) * POOL_SPIN
        a = (2.0 * float(u[3]) - 1.0) * POOL_SPIN
        projected = hand_noise.project_stroke([v0, centre.phi + dphi, 0.0, a, b, cue[0], cue[1]])
        members.append(PoolMember(index=i, ball=centre.ball, pocket=centre.pocket,
                                  kind=centre.kind, stroke=Stroke.of(projected[:5]),
                                  cut_deg=centre.cut_deg))
    return members


# ---- rollout scoring -----------------------------------------------------------------------------


def jobs(game, candidates):
    """The (state, stroke) rollout jobs of candidates at a decision: each from the game's position
    with the cue ball seated at the candidate's placement while it is in hand (straightpool.game
    .seat), the commanded stroke unchanged."""
    seated = {}
    out = []
    for c in candidates:
        if c.place not in seated:
            seated[c.place] = rules.seat(game, c.place)
        out.append((seated[c.place], c.stroke))
    return out


def score(game, candidates, objective, draws, *, noise, threads=1, options=None):
    """The value of every candidate: the mean of objective(outcome) over the candidate simulated
    once under each draw of `draws` (five normals each, the decision's shared block) at noise level
    `noise`, every simulation with the decision's kernel seed. Returns floats in candidate order;
    select.argmax picks the best, ties to the lower index."""
    outcomes = select.rollouts(jobs(game, candidates), draws, r=noise, seed=rules.kernel_seed(game),
                               options=options, threads=threads)
    return [select.score(per_draw, objective) for per_draw in outcomes]


def pot_objective(call):
    """The plain pot indicator of a call: 1.0 when the stroke scores under the 14.1 rules (the
    called ball in the called pocket, foul-free), else 0.0."""
    def value(outcome):
        return 1.0 if rules.judge(outcome, call).scored else 0.0
    return value
