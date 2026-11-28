# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Fresh inputs for the straightpool tests and the digests they are checked against.

straightpool_fixtures.json (beside this module) holds a kernel 15-ball rack made for these tests
(its ball parameters and table record), two more racks' slot lists, a few recorded strokes, and
the digests of the outputs of the research implementation this package was ported from, computed
on the inputs below (the menu's with its in-hand placements seated; see test_candidates). Layouts
and cases are drawn here from random.Random seeded by a fixed text, using only random() and
randrange(), so every Python 3 build draws the same ones.
"""

import hashlib
import json
import pathlib
import random

from hillclimb.adapter import State
from straightpool import game as rules

PATH = pathlib.Path(__file__).with_name("straightpool_fixtures.json")
DATA = json.loads(PATH.read_text(encoding="utf-8"))

#: The kernel rack the layouts are built on (ball parameters and the table record).
TEMPLATE = State(DATA["rack"])
TABLE = TEMPLATE.table()


def sha16(obj):
    """The first 16 hex digits of SHA-256 over canonical JSON (sorted keys, compact)."""
    text = json.dumps(obj, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def slots(i):
    """Slot list i of the fixture racks (15 (x, y) pairs, apex first)."""
    return [tuple(p) for p in DATA["slots"][i]]


def _point(rng, margin=0.03):
    return (-TABLE.width / 2 + margin + (TABLE.width - 2 * margin) * rng.random(),
            -TABLE.length / 2 + margin + (TABLE.length - 2 * margin) * rng.random())


def layout(rng, cue_share=0.8):
    """One random position {id: (x, y)}: 1 to 15 object balls (each ball kept with an even
    chance, at least one), placed one by one where they fit, and the cue ball with probability
    cue_share."""
    balls = [b for b in rules.OBJECT_BALLS if rng.random() < 0.5] or [1 + rng.randrange(15)]
    placed = {}
    for ball in balls:
        for _ in range(1000):
            p = _point(rng)
            if rules.placement_fits(TABLE, p, list(placed.values())):
                placed[ball] = p
                break
    if rng.random() < cue_share:
        for _ in range(1000):
            p = _point(rng)
            if rules.placement_fits(TABLE, p, list(placed.values())):
                placed[rules.CUE] = p
                break
    return dict(sorted(placed.items()))


def layouts(seed_text, count, cue_share=0.8):
    rng = random.Random(seed_text)
    return [layout(rng, cue_share) for _ in range(count)]


def game_of(positions, key=0):
    """A Game at `positions` on the fixture rack (the cue ball in hand anywhere when absent)."""
    in_hand = "none" if rules.CUE in positions else "anywhere"
    return rules.Game(key=key, state=TEMPLATE.with_positions(positions), templates=TEMPLATE,
                      in_hand=in_hand)


def placement_cases(seed_text, count):
    """[(obstacles, (x, y), zone)]: object balls of a random layout, a requested point (on top of
    a ball one time in three), and the zone."""
    rng = random.Random(seed_text)
    out = []
    for _ in range(count):
        obstacles = [p for b, p in layout(rng, cue_share=0.0).items()]
        x, y = -0.9 + 1.8 * rng.random(), -1.5 + 3.0 * rng.random()
        if obstacles and rng.random() < 1 / 3:
            ox, oy = obstacles[rng.randrange(len(obstacles))]
            x, y = ox - 0.05 + 0.1 * rng.random(), oy - 0.05 + 0.1 * rng.random()
        out.append((obstacles, (x, y), "kitchen" if rng.random() < 0.5 else "anywhere"))
    return out


def spot_cases(seed_text, count):
    """[(position, balls to spot, apex or None)]: a random layout, one to four of its object
    balls taken off to be spotted, and half the time the apex of a fixture rack, with a ball
    moved close to it one time in three."""
    rng = random.Random(seed_text)
    out = []
    for _ in range(count):
        positions = layout(rng)
        objects = [b for b in positions if b != rules.CUE]
        down = sorted({objects[rng.randrange(len(objects))] for _ in range(1 + rng.randrange(4))})
        rest = {b: p for b, p in positions.items() if b not in down}
        apex = None
        if rng.random() < 0.5:
            apex = slots(rng.randrange(2))[0]
            others = [b for b in rest if b != rules.CUE]
            if others and rng.random() < 1 / 3:
                b = others[rng.randrange(len(others))]
                x = apex[0] - 0.06 + 0.12 * rng.random()
                rest[b] = (x, apex[1] - 0.06 + 0.12 * rng.random())
        out.append((dict(sorted(rest.items())), down, apex))
    return out


def rerack_cases(seed_text, count):
    """[(position, racked balls, table emptied, slot index)] at the moment of a re-rack: one
    break ball (or none when the table emptied, one time in five), near the rack half the time,
    and the cue ball (near the rack half the time) where it fits."""
    rng = random.Random(seed_text)
    out = []
    for _ in range(count):
        which = rng.randrange(2)
        rack = slots(which)
        emptied = rng.random() < 0.2
        positions = {}
        if emptied:
            racked = list(rules.OBJECT_BALLS)
        else:
            ball = 1 + rng.randrange(15)
            if rng.random() < 0.5:
                sx, sy = rack[rng.randrange(15)]
                positions[ball] = (sx - 0.08 + 0.16 * rng.random(), sy - 0.08 + 0.16 * rng.random())
            else:
                positions[ball] = (-0.6 + 1.2 * rng.random(), -1.2 + 2.4 * rng.random())
            racked = [b for b in rules.OBJECT_BALLS if b != ball]
        if rng.random() < 0.85:
            for _ in range(100):
                if rng.random() < 0.5:
                    sx, sy = rack[rng.randrange(15)]
                    cue = (sx - 0.1 + 0.2 * rng.random(), sy - 0.1 + 0.2 * rng.random())
                else:
                    cue = (-0.6 + 1.2 * rng.random(), -1.2 + 2.4 * rng.random())
                if rules.placement_fits(TABLE, cue, list(positions.values())):
                    positions[rules.CUE] = cue
                    break
        out.append((dict(sorted(positions.items())), racked, emptied, which))
    return out
