# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Fresh inputs for the model tests, generated from public namespace strings.

Every case is plane geometry made up for the tests (no game was played to make it): object balls
and the cue ball at random points of the cloth, pool members with random strokes. The expected
digests in the tests were computed once from the same cases with the reference implementation of
each feature law and evaluator.
"""

import math
import random
from typing import NamedTuple, Optional, Tuple

from hillclimb.adapter import Stroke

KINDS = ("direct", "bank", "kick")


class Member(NamedTuple):
    """A pool member with the straightpool.candidates.PoolMember attributes."""

    index: int
    ball: int
    pocket: int
    kind: str
    stroke: Stroke
    place: Optional[Tuple[float, float]] = None
    cut_deg: Optional[float] = None


def _point(rng):
    return (rng.uniform(-0.6, 0.6), rng.uniform(-1.24, 1.24))


def _stroke(rng):
    a, b = rng.uniform(-0.45, 0.45), rng.uniform(-0.45, 0.45)
    tip = math.hypot(a, b)
    if tip > 0.5:
        a, b = a * 0.5 / tip, b * 0.5 / tip
    return Stroke(rng.uniform(0.5, 7.0), rng.uniform(0.0, 2.0 * math.pi), 0.0, a, b)


def c2_cases():
    """Eight C2 inputs (position, members, run, break_decision, n_centres). Case 6 has the cue
    ball in hand with placed members; case 7 has a single object ball; some members name a ball
    that is not on the table."""
    rng = random.Random("hillclimb/tests/models/c2-cases")
    cases = []
    for k in range(8):
        n_balls = 1 if k == 7 else rng.randint(2, 15)
        ids = rng.sample(range(1, 16), n_balls)
        position = {}
        if k != 6:
            position[0] = _point(rng)
        for ball in ids:
            position[ball] = _point(rng)
        members = []
        for i in range(rng.randint(3, 48)):
            ball = rng.choice(ids) if rng.random() < 0.9 else rng.choice(range(1, 16))
            kind = rng.choice(KINDS)
            cut = rng.uniform(0.0, 89.0) if kind == "direct" and rng.random() < 0.8 else None
            place = _point(rng) if k == 6 else None
            members.append(Member(i, ball, rng.randrange(6), kind, _stroke(rng), place, cut))
        cases.append((position, members, rng.randint(0, 120), rng.random() < 0.3,
                      rng.randint(1, 60)))
    return cases


def v_cases():
    """Two hundred (cue, break ball) pairs in the kernel frame (random points of the cloth, every
    tenth break ball beside the re-rack, every seventh pair with the break ball at x < 0), then
    one pair with the cue ball on the break ball."""
    rng = random.Random("hillclimb/tests/models/v-cases")
    cases = []
    for k in range(200):
        cue = _point(rng)
        if k % 10 == 0:
            bb = (rng.uniform(-0.2, 0.2), rng.uniform(0.55, 0.95))
        else:
            bb = _point(rng)
        if k % 7 == 0 and bb[0] > 0.0:
            bb = (-bb[0], bb[1])
        cases.append((cue, bb))
    cases.append(((0.1, -0.3), (0.1, -0.3)))
    return cases
