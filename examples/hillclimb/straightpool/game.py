# Copyright (c) Meta Platforms, Inc. and affiliates.

"""14.1 straight pool in its solo high-run form: the game our targets play.

A game is one high-run attempt. It opens with a fixed break that counts nothing: the kernel's
15-ball rack seeded by the game key, the cue ball on the head string, one break stroke; every
object ball the break pocketed or drove off the table is spotted back and the cue ball is taken in
hand, anywhere. From then on every stroke calls a ball and a pocket and scores when it is
foul-free and the called ball drops in the called pocket. When one object ball is left (or none),
the others are re-racked and the run goes on. The game ends at the first stroke that does not
score, when the player declares that no pot is callable, or at a cap.

The rules are the machine-checkable subset of the World Pool-Billiard Association rules for 14.1
continuous, each read off the kernel's event record (judge): the fouls in FOULS, called-shot
scoring, the spot-back of balls pocketed besides the call (rule 1.5: the foot spot, then down the
long string toward the foot rail, then back toward the centre), and the re-rack of rules 7.2,
7.4, 7.6 and 7.8 (a)-(d). The kernel decides every physical outcome; this module adds no physics.

Conventions the rules leave to the implementer, fixed here:

- Slots. A re-rack uses the object-ball positions of a seeded kernel 15-ball rack, sorted by
  (y, x): slot 1, the apex, is nearest the table centre. A 14-ball re-rack fills slots 2..15
  with the racked balls in ascending number and leaves the apex free (rule 7.2).
- Outline. A ball is in the way of the rack (rule 7.8) when its centre is within two ball radii
  of the convex hull of the 15 slot centres (inside the hull counts as distance 0).
- Head string. The kitchen is y < -length/4 (the head of the table is at -y); in front of or on
  the string is y >= -length/4.
- Rail. A ball is driven to a rail when any cushion event happens at or after the first contact
  of the cue ball with an object ball.
- Opening. The break stroke is v0 12.0 m/s, aimed from the cue's seat at the rack's apex, level
  cue, tip b = 0.2 R, struck without execution noise; the seat is on the head string at 0.6 of
  the half-width available to a ball. Breaking fouls and the opening rule 7.3 are out of scope.

Every random number of a game derives from its key (hillclimb.crn): the rack (the key itself), the
execution noise of decision i (the hand noise law at (key, i)), the kernel seed of decision i
(kernel_seed), the opening break's seed and the re-rack slots (their own namespaces).

Other parts of the package use the names below, so a change adds fields with defaults or new
functions and leaves these names in place.
"""

import dataclasses
import math
from dataclasses import dataclass
from typing import Optional, Tuple

from hillclimb import adapter, crn
from hillclimb import noise as hand_noise
from hillclimb.adapter import State, Stroke

#: The fouls, in their order of precedence. TRUNCATED is the kernel refusing a stroke (an
#: invalid input or an exhausted event budget): it counts as a foul and is the only one then.
FOULS = ("SCRATCH", "CUE_OFF_TABLE", "NO_CONTACT", "NO_RAIL_AFTER_CONTACT", "BALL_OFF_TABLE",
         "TRUNCATED")

#: The one foul of the rollout law (judge_rollout) the game itself never calls: the cue ball's
#: first contact was not the called ball.
FIRST_CONTACT = "FIRST_CONTACT"

#: Ball-in-hand zones: none, anywhere on the bed, behind the head string.
IN_HAND = ("none", "anywhere", "kitchen")

#: How a game ends (Game.over): no pot declared callable, a foul, an object ball pocketed but
#: not the call, nothing pocketed, the cap on balls reached.
ENDINGS = ("NO_DECLARABLE_POT", "FOUL", "WRONG_BALL", "MISS", "CAP")

#: The cue ball's id.
CUE = 0

#: The object balls' ids.
OBJECT_BALLS = tuple(range(1, 16))

#: Daylight a placed ball keeps from the cushions and from every other ball, in metres.
PLACE_CLEARANCE = 1e-4

#: The head string and the foot spot as fractions of the table length (kernel frame).
HEAD_STRING_FRACTION = -0.25
FOOT_SPOT_FRACTION = 0.25

#: The opening break: cue speed (m/s), tip offset b (ball radii), and the cue seat on the head
#: string as a fraction of the half-width available to a ball.
BREAK_V0 = 12.0
BREAK_TIP_B = 0.2
BREAK_SEAT_FRACTION = 0.6

#: How far (m) a racked ball may move and still leave the rack untouched (rule 7.6).
UNTOUCHED_TOL = 1e-9

#: The namespaces of the opening break's kernel seed and of the re-rack slots.
BREAK_NAMESPACE = "straightpool/opening-break"
RERACK_NAMESPACE = "straightpool/rerack"

_CUSHIONS = ("ball_linear_cushion", "ball_circular_cushion")


@dataclass(frozen=True)
class Call:
    """A called ball and pocket (kernel pocket index)."""

    ball: int
    pocket: int


@dataclass(frozen=True)
class Action:
    """What an agent plays at a decision: the commanded stroke, its call (None declares that no
    pot is callable, which ends the game), and the cue-ball placement (x, y) while the cue ball is
    in hand (kernel frame; clipped into the granted zone and moved off any ball by the game)."""

    stroke: Stroke
    call: Optional[Call]
    place: Optional[Tuple[float, float]] = None


@dataclass(frozen=True)
class Game:
    """A game at a decision: its key, the position (the cue ball may be absent while in hand), the
    ball parameters for re-racks and cue re-entry, the decision index, the run so far, the
    ball-in-hand zone, whether this is the first decision after a re-rack, and why the game ended
    (None while it goes on). Also: the re-racks so far, the free apex slot of the last 14-ball
    re-rack (None after a 15-ball one), and the racked balls (id, x, y) whose stillness keeps the
    rack untouched."""

    key: int
    state: State
    templates: State
    decision: int = 0
    run: int = 0
    in_hand: str = "anywhere"
    rack_untouched: bool = False
    over: Optional[str] = None
    reracks: int = 0
    apex: Optional[Tuple[float, float]] = None
    racked: Tuple[Tuple[int, float, float], ...] = ()


@dataclass(frozen=True)
class Judgment:
    """The rules' reading of one stroke: its fouls (in FOULS order), whether it was legal, whether
    it scored, the first ball the cue ball touched, whether a ball reached a cushion after that
    contact, every object-ball pot (ball, pocket) in time order, and the balls pocketed besides the
    call."""

    fouls: Tuple[str, ...]
    legal: bool
    scored: bool
    first_contact: Optional[int]
    rail_after_contact: bool
    object_pots: Tuple[Tuple[int, int], ...]
    incidental: Tuple[int, ...]


#: The Judgment step() returns for a declared give-up: no stroke was played.
NO_STROKE = Judgment(fouls=(), legal=False, scored=False, first_contact=None,
                     rail_after_contact=False, object_pots=(), incidental=())


@dataclass(frozen=True)
class Rerack:
    """A re-rack: the position after it, the ball-in-hand zone it grants, the free apex slot (None
    when fifteen balls were racked), and the rule 7.8 branch taken ('a', 'b', 'c', 'd', or 'none'
    when neither the break ball nor the cue ball was in the way)."""

    positions: dict
    in_hand: str
    apex: Optional[Tuple[float, float]]
    branch: str


# ---- the rules on events -------------------------------------------------------------------------


def judge(outcome, call):
    """The Judgment of an adapter.Outcome under a Call. A truncated outcome is a foul."""
    if outcome.truncated is not None:
        return Judgment(fouls=("TRUNCATED",), legal=False, scored=False, first_contact=None,
                        rail_after_contact=False, object_pots=(), incidental=())
    first_contact, t_contact = None, None
    pockets, off_table = [], []
    rail_after = False
    for event in outcome.events:
        kind, t = event.kind, float(event.t)
        if kind == "ball_ball" and first_contact is None:
            b1, b2 = int(event.balls[0]), int(event.balls[1])
            if CUE in (b1, b2):
                first_contact = b2 if b1 == CUE else b1
                t_contact = t
        elif kind == "ball_pocket":
            pockets.append((t, int(event.balls[0]), int(event.pocket)))
        elif kind == "ball_off_table":
            off_table.append((t, int(event.balls[0])))
        elif kind in _CUSHIONS and t_contact is not None and t >= t_contact:
            rail_after = True
    pocketed_after = t_contact is not None and any(t >= t_contact for t, _b, _p in pockets)
    fouls = []
    if any(b == CUE for _t, b, _p in pockets):
        fouls.append("SCRATCH")
    if any(b == CUE for _t, b in off_table):
        fouls.append("CUE_OFF_TABLE")
    if first_contact is None:
        fouls.append("NO_CONTACT")
    elif not pocketed_after and not rail_after:
        fouls.append("NO_RAIL_AFTER_CONTACT")
    if any(b != CUE for _t, b in off_table):
        fouls.append("BALL_OFF_TABLE")
    object_pots = [(b, p) for _t, b, p in sorted(pockets) if b != CUE]
    ball, pocket = int(call.ball), int(call.pocket)
    called_potted = any(b == ball and p == pocket for b, p in object_pots)
    legal = not fouls
    incidental, seen_call = [], False
    for b, p in object_pots:
        if not seen_call and b == ball and p == pocket:
            seen_call = True
            continue
        incidental.append(b)
    return Judgment(fouls=tuple(fouls), legal=legal, scored=bool(legal and called_potted),
                    first_contact=first_contact, rail_after_contact=bool(rail_after),
                    object_pots=tuple(object_pots), incidental=tuple(sorted(set(incidental))))


def judge_rollout(outcome, call):
    """The law our agents price their rollouts by: judge(), with one more foul, FIRST_CONTACT,
    when the cue ball touched another ball before the called one; such a stroke neither is legal
    nor scores. The research agents read their rollouts this way (a rules judge that made the
    called ball the ball on), so a combination is never planned. The played stroke is always
    judged by judge()."""
    j = judge(outcome, call)
    if j.first_contact is None or j.first_contact == int(call.ball):
        return j
    return dataclasses.replace(j, fouls=j.fouls + (FIRST_CONTACT,), legal=False, scored=False)


# ---- placement and spotting (plane geometry of the table marks) ----------------------------------


def head_string_y(table):
    """The head string's y in the kernel frame: a quarter of the table length from the centre,
    toward the head (-y)."""
    return table.length * HEAD_STRING_FRACTION


def placement_fits(table, spot, obstacles):
    """True when a ball centred at `spot` is wholly on the bed, PLACE_CLEARANCE inside the
    cushion lines, and at least two radii plus PLACE_CLEARANCE from every obstacle centre."""
    x, y = spot
    r = table.ball_radius
    max_x = table.width / 2 - r - PLACE_CLEARANCE
    max_y = table.length / 2 - r - PLACE_CLEARANCE
    if abs(x) > max_x or abs(y) > max_y:
        return False
    min_d = 2 * r + PLACE_CLEARANCE
    return all(math.hypot(ox - x, oy - y) >= min_d for ox, oy in obstacles)


def clip_to_zone(zone, x, y, table):
    """A requested cue-ball placement clipped onto the bed and into the granted zone ('anywhere'
    or 'kitchen': y no further toward the foot than the head string)."""
    if zone not in ("anywhere", "kitchen"):
        raise ValueError(f"no placement in zone {zone!r}")
    r = table.ball_radius
    max_x = table.width / 2 - r - PLACE_CLEARANCE
    max_y = table.length / 2 - r - PLACE_CLEARANCE
    x = min(max_x, max(-max_x, x))
    y = min(max_y, max(-max_y, y))
    if zone == "kitchen":
        y = min(y, head_string_y(table))
    return x, y


def place_in_zone(zone, x, y, table, obstacles):
    """The cue ball's seat for a requested placement: the clipped request when it fits, else the
    first fitting point of an expanding sweep round it (rings half a radius apart, 16 fixed
    directions each, every point clipped into the zone); the clipped request when nothing fits."""
    x, y = clip_to_zone(zone, x, y, table)
    if placement_fits(table, (x, y), obstacles):
        return x, y
    r = table.ball_radius
    max_rings = int(max(table.width, table.length) / (r / 2)) + 1
    for ring in range(1, max_rings):
        radius = ring * (r / 2)
        for k in range(16):
            angle = 2 * math.pi * k / 16
            cx, cy = clip_to_zone(zone, x + radius * math.cos(angle),
                                  y + radius * math.sin(angle), table)
            if placement_fits(table, (cx, cy), obstacles):
                return cx, cy
    return x, y


def respot_spot(table, obstacles):
    """Rule 1.5's spot: the foot spot, or the nearest fitting point on the long string, first
    toward the foot rail and then back toward the centre in steps of a quarter radius; None when
    the whole string is blocked."""
    r = table.ball_radius
    spot_y = table.length * FOOT_SPOT_FRACTION
    step = r / 4
    max_y = table.length / 2 - r - PLACE_CLEARANCE
    y = spot_y
    while y <= max_y:
        if placement_fits(table, (0.0, y), obstacles):
            return (0.0, y)
        y += step
    min_y = -(table.length / 2) + r + PLACE_CLEARANCE
    y = spot_y - step
    while y >= min_y:
        if placement_fits(table, (0.0, y), obstacles):
            return (0.0, y)
        y -= step
    return None


def spot_back(positions, balls, table, apex=None):
    """Spot `balls` back, in ascending number, onto a position {id: (x, y)}: each to the free apex
    slot `apex` of an untouched 14-ball re-rack when no ball overlaps it there (rule 7.6), else by
    rule 1.5; each placed ball is an obstacle for the next. Returns (new positions, [(ball, (x,
    y))]); a ball with no free spot on the long string is left off."""
    positions = dict(positions)
    r = table.ball_radius
    placed = []
    for ball in sorted(int(b) for b in balls):
        obstacles = list(positions.values())
        spot = None
        if apex is not None and all(math.hypot(apex[0] - ox, apex[1] - oy) >= 2.0 * r - 1e-9
                                    for ox, oy in obstacles):
            spot = (apex[0], apex[1])
        if spot is None:
            spot = respot_spot(table, obstacles)
        if spot is None:
            continue
        positions[ball] = (float(spot[0]), float(spot[1]))
        placed.append((ball, positions[ball]))
    return dict(sorted(positions.items())), placed


# ---- the re-rack ---------------------------------------------------------------------------------


def rack_slots(rack_positions):
    """The 15 slots of a rack: its object-ball positions sorted by (y, x), the apex first."""
    slots = [(float(x), float(y)) for ball, (x, y) in rack_positions.items() if ball != CUE]
    slots.sort(key=lambda p: (p[1], p[0]))
    return slots


def _turn(a, b, c):
    """Twice the signed area of the triangle (a, b, c): positive when the path a, b, c turns
    counter-clockwise at b, negative when it turns clockwise, zero when it runs straight."""
    abx, aby = b[0] - a[0], b[1] - a[1]
    acx, acy = c[0] - a[0], c[1] - a[1]
    return abx * acy - aby * acx


def _boundary_chain(walk):
    """One chain of the hull boundary from points met in walking order: each point is appended
    after the corners it reveals as no left turn (a clockwise or a straight one) are dropped. The
    chain keeps the first point and ends at the last."""
    chain = []
    for point in walk:
        while len(chain) > 1 and _turn(chain[-2], chain[-1], point) <= 0:
            del chain[-1]
        chain.append(point)
    return chain


def _hull(points):
    """The corners of the convex hull of `points`, each once, counter-clockwise from the least
    point in (x, y) order; a point inside the hull or on one of its edges is not a corner, and
    fewer than three distinct points come back sorted. A. M. Andrew's algorithm (Information
    Processing Letters 9, 1979): the points in (x, y) order walk the lower chain of the boundary,
    and in reverse order the upper chain; each chain ends where the other one starts."""
    walk = sorted(set(points))
    if len(walk) < 3:
        return walk
    lower = _boundary_chain(walk)
    upper = _boundary_chain(reversed(walk))
    return lower + upper[1:-1]


def _distance_to_hull(point, hull):
    """0.0 inside the hull, else the distance from point to its boundary."""
    n = len(hull)
    inside = n >= 3
    best = float("inf")
    for i in range(n):
        a, b = hull[i], hull[(i + 1) % n]
        abx, aby = b[0] - a[0], b[1] - a[1]
        apx, apy = point[0] - a[0], point[1] - a[1]
        if abx * apy - aby * apx < 0:
            inside = False
        denom = abx * abx + aby * aby or 1e-18
        t = max(0.0, min(1.0, (apx * abx + apy * aby) / denom))
        best = min(best, math.hypot(apx - t * abx, apy - t * aby))
    return 0.0 if inside else best


def interferes(point, slots, radius):
    """True when a ball centred at `point` is in the way of the rack: within two radii of the
    convex hull of the slot centres."""
    return _distance_to_hull(point, _hull(slots)) < 2.0 * float(radius)


def spot_single(table, obstacles):
    """Rule 7.8 (c)/(d) spotting: the head spot, else the centre spot, else rule 1.5's walk."""
    for spot in ((0.0, head_string_y(table)), (0.0, 0.0)):
        if placement_fits(table, spot, obstacles):
            return spot
    spot = respot_spot(table, obstacles)
    if spot is None:
        raise RuntimeError("no free spot on the table")
    return spot


def rerack(positions, racked_balls, table_emptied, slots, table):
    """Re-rack `racked_balls` onto `slots` (rack_slots order) from a position {id: (x, y)}.

    table_emptied: the stroke that scored the 14th ball also pocketed the 15th, so all fifteen are
    racked (7.8 a); the cue ball stays unless it overlaps a slot, in which case it is in hand in
    the kitchen. Otherwise one object ball, the break ball, is on the table and the fourteen
    others are racked with the apex free (7.2), unless both the break ball and the cue ball are in
    the way of the rack, when all fifteen are racked and the cue ball is in hand in the kitchen
    (7.8 b). The break ball alone in the way goes to the head spot, else the centre spot (7.8 c);
    the cue ball alone in the way is in hand in the kitchen when the break ball is in front of or
    on the head string, and otherwise goes to the head spot, else the centre spot (7.8 d)."""
    radius = table.ball_radius
    cue = positions.get(CUE)
    in_hand, apex = "none", None
    if table_emptied:
        branch = "a"
        new = dict(zip(sorted(int(b) for b in racked_balls), slots))
        if cue is not None and any(math.hypot(cue[0] - x, cue[1] - y) < 2.0 * radius
                                   for x, y in slots):
            in_hand = "kitchen"
        elif cue is not None:
            new[CUE] = cue
    else:
        breaks = [ball for ball in positions if ball != CUE]
        if len(breaks) != 1:
            raise ValueError(f"a 14-ball re-rack needs one object ball on the table, not "
                             f"{len(breaks)}")
        break_ball = breaks[0]
        bpos = positions[break_ball]
        break_in_way = interferes(bpos, slots, radius)
        cue_in_way = cue is not None and interferes(cue, slots, radius)
        if break_in_way and cue_in_way:
            branch = "b"
            new = dict(zip(sorted([int(b) for b in racked_balls] + [break_ball]), slots))
            in_hand = "kitchen"
        else:
            new = dict(zip(sorted(int(b) for b in racked_balls), slots[1:]))
            apex = slots[0]
            racked = [new[ball] for ball in sorted(new)]
            if break_in_way:
                branch = "c"
                new[break_ball] = spot_single(table, racked + ([cue] if cue is not None else []))
                if cue is not None:
                    new[CUE] = cue
            elif cue_in_way:
                branch = "d"
                new[break_ball] = bpos
                if bpos[1] >= head_string_y(table):
                    in_hand = "kitchen"
                else:
                    new[CUE] = spot_single(table, racked + [bpos])
            else:
                branch = "none"
                new[break_ball] = bpos
                if cue is not None:
                    new[CUE] = cue
    return Rerack(positions=dict(sorted(new.items())), in_hand=in_hand, apex=apex, branch=branch)


# ---- seeds ---------------------------------------------------------------------------------------


def kernel_seed(game):
    """The kernel seed of every simulation of the game's current decision: the executed stroke,
    the agent's rollouts and the re-simulations of the played stroke (noise.shot_seed(key, i))."""
    return hand_noise.shot_seed(int(game.key), int(game.decision))


def break_seed(key):
    """The kernel seed of a game's opening break."""
    return crn.stream(BREAK_NAMESPACE, int(key))


def rerack_seed(key, j):
    """The rack seed of re-rack j of a game."""
    return hand_noise.shot_seed(crn.stream(RERACK_NAMESPACE, int(key)), int(j))


def rerack_slots(key, j):
    """The slots of re-rack j of a game: rack_slots of the kernel's 15-ball rack at rerack_seed."""
    return rack_slots(State.rack("fifteen", rerack_seed(key, j)).positions())


# ---- the game ------------------------------------------------------------------------------------


def break_stroke(table, apex):
    """The opening break: (the Stroke, the cue seat (x, y)) on `table` toward the rack apex."""
    seat = (BREAK_SEAT_FRACTION * (table.width / 2.0 - table.ball_radius - PLACE_CLEARANCE),
            -table.length / 4.0)
    phi = math.atan2(apex[1] - seat[1], apex[0] - seat[0])
    return Stroke(BREAK_V0, phi, 0.0, 0.0, BREAK_TIP_B), seat


def new_game(key):
    """The opening Game of key `key`: the kernel's 15-ball rack seeded by the key, broken by the
    fixed break stroke (counting nothing), every pocketed or off-table object ball spotted back by
    rule 1.5, and the cue ball taken in hand anywhere."""
    key = int(key)
    rack = State.rack("fifteen", key)
    table = rack.table()
    positions = rack.positions()
    stroke, seat = break_stroke(table, rack_slots(positions)[0])
    start = rack.with_positions({**{b: p for b, p in positions.items() if b != CUE}, CUE: seat})
    outcome = adapter.simulate(start, stroke, seed=break_seed(key))
    if outcome.truncated is not None:
        raise RuntimeError(f"the kernel refused the opening break of game {key}: "
                           f"{outcome.truncated}")
    settled = outcome.positions()
    missing = [ball for ball in OBJECT_BALLS if ball not in settled]
    settled, _ = spot_back(settled, missing, table)
    settled.pop(CUE, None)
    return Game(key=key, state=rack.with_positions(settled), templates=rack)


def seat(game, place):
    """The state a decision's stroke is played from: the game's position, with the cue ball
    placed by the ball-in-hand rule (place_in_zone; obstacles: the object balls) when it is in
    hand. `place` None asks for the centre of the table, clipped into the zone."""
    if game.in_hand == "none":
        return game.state
    positions = game.state.positions()
    objects = {ball: xy for ball, xy in positions.items() if ball != CUE}
    request = (0.0, 0.0) if place is None else (float(place[0]), float(place[1]))
    x, y = place_in_zone(game.in_hand, request[0], request[1], game.state.table(),
                         list(objects.values()))
    return game.state.with_positions({**objects, CUE: (x, y)}, game.templates)


def _untouched(game, settled):
    """Rule 7.6: the fresh re-rack stays untouched only while every racked ball is present and
    unmoved."""
    if not game.rack_untouched:
        return False
    for ball, x, y in game.racked:
        pos = settled.get(ball)
        if pos is None or abs(pos[0] - x) > UNTOUCHED_TOL or abs(pos[1] - y) > UNTOUCHED_TOL:
            return False
    return True


def advance(game, start, call, outcome, *, cap=None):
    """The rules' transition of one played stroke: (next Game, Judgment) from the Game, the state
    the stroke was played from (`start`, the cue ball placed), its Call and its adapter.Outcome.

    A foul ends the game (FOUL); a foul-free stroke that does not score ends it as WRONG_BALL when
    an object ball dropped, else MISS; an ended game keeps its position. A scoring stroke adds one
    ball to the run and takes the balls where the kernel left them; then the re-rack when no
    object ball is left (7.8 a), else the spot-back of the incidentals and the re-rack when one is
    left; the game ends at the cap when the run reaches it."""
    judgment = judge(outcome, call)
    if judgment.fouls or not judgment.scored:
        ending = ("FOUL" if judgment.fouls else
                  "WRONG_BALL" if judgment.object_pots else "MISS")
        return dataclasses.replace(game, in_hand="none", over=ending), judgment
    run = game.run + 1
    settled = outcome.positions()
    untouched = _untouched(game, settled)
    table = start.table()
    positions = dict(settled)
    on_table = [ball for ball in positions if ball != CUE]
    rack = None
    if not on_table:
        rack = rerack(positions, OBJECT_BALLS, True, rerack_slots(game.key, game.reracks), table)
    else:
        if judgment.incidental:
            positions, _ = spot_back(positions, judgment.incidental, table,
                                     apex=game.apex if untouched else None)
        on_table = [ball for ball in positions if ball != CUE]
        if len(on_table) == 1:
            down = [ball for ball in OBJECT_BALLS if ball not in on_table]
            rack = rerack(positions, down, False, rerack_slots(game.key, game.reracks), table)
    in_hand, reracks, apex, racked = "none", game.reracks, game.apex, game.racked
    if rack is not None:
        positions, in_hand, apex = rack.positions, rack.in_hand, rack.apex
        reracks, untouched = reracks + 1, True
        racked = tuple((ball, x, y) for ball, (x, y) in positions.items() if ball != CUE)
    over = "CAP" if cap is not None and run >= cap else None
    nxt = Game(key=game.key, state=start.with_positions(positions, game.templates),
               templates=game.templates, decision=game.decision + (over is None), run=run,
               in_hand=in_hand, rack_untouched=untouched, over=over, reracks=reracks,
               apex=apex, racked=racked)
    return nxt, judgment


def step(game, action, *, noise, cap=None):
    """Play one decision: seat the cue ball when in hand, execute the stroke under the hand noise
    law at level `noise` (game key, decision index), simulate it with the decision's kernel seed,
    judge it, spot back and re-rack as the rules say. Returns (next Game, Judgment, Outcome).

    An Action without a call ends the game (NO_DECLARABLE_POT) with no stroke: the Judgment is
    NO_STROKE and the Outcome None. cap, when given, ends the game at that many balls (CAP)."""
    if game.over is not None:
        raise ValueError(f"game {game.key} is over ({game.over})")
    if action.call is None:
        return dataclasses.replace(game, over="NO_DECLARABLE_POT"), NO_STROKE, None
    in_hand = game.in_hand != "none"
    place = None
    if in_hand:
        place = (0.0, 0.0) if action.place is None else action.place
    stroke, place = hand_noise.execute(action.stroke, game.key, game.decision, noise, place=place)
    start = seat(game, place)
    outcome = adapter.simulate(start, stroke, seed=kernel_seed(game))
    nxt, judgment = advance(game, start, action.call, outcome, cap=cap)
    return nxt, judgment, outcome
