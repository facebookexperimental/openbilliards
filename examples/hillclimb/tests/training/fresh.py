# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Fresh inputs for the training tests: a fast agent and positions made here, never recorded ones.

ClearPot plays the first ghost-ball pot of the menu (straightpool.candidates.enumerate_candidates)
whose object ball has a clear path to its pocket and whose cue ball has a clear path to the object
ball, with no simulation of its own, so a test game costs the generator's simulations only. The
baseline agent refines every stroke by simulation and is far slower; it is the agent of the
fixtures, not of these tests.
"""

import dataclasses
import math

from hillclimb import adapter
from hillclimb.protocol import AgentSpec
from straightpool import candidates
from straightpool import game as rules

#: The runner builder of ClearPot.
BUILDER = "tests.training.fresh:build"

#: The namespace of every stream the training tests draw.
NAMESPACE = "hillclimb/tests/training"


def _clear(a, b, others, radius):
    """True when no centre of `others` comes within two radii of the segment a -> b."""
    vx, vy = b[0] - a[0], b[1] - a[1]
    length2 = vx * vx + vy * vy
    for ox, oy in others:
        t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((ox - a[0]) * vx + (oy - a[1]) * vy)
                                                   / length2))
        if math.hypot(ox - (a[0] + t * vx), oy - (a[1] + t * vy)) < 2.0 * radius:
            return False
    return True


class ClearPot:
    """A fast agent for tests (hillclimb.protocol.Agent)."""

    def reset(self, key):
        """Nothing survives a game."""

    def act(self, game, decision):
        """The first clear ghost-ball pot of the menu, or a declared give-up."""
        positions = game.state.positions()
        table = game.state.table()
        for c in candidates.enumerate_candidates(game):
            if c.intent.shot_class != "pot" or c.origin != "ghost-ball":
                continue
            ball, pocket = c.intent.ball, c.intent.pocket
            cue = c.place if c.place is not None else positions[rules.CUE]
            others = [xy for b, xy in positions.items() if b not in (rules.CUE, ball)]
            if (_clear(positions[ball], table.pockets[pocket], others, table.ball_radius)
                    and _clear(cue, positions[ball], others, table.ball_radius)):
                return rules.Action(c.stroke, rules.Call(ball, pocket), c.place)
        return rules.Action(adapter.Stroke(1.0, 0.0), None)


def build(spec):
    """The runner's builder of ClearPot."""
    return ClearPot()


def spec():
    """The AgentSpec of ClearPot."""
    return AgentSpec(BUILDER, {})


def table_game(key):
    """A fresh game of `key` at its first decision with the cue ball on the table, seated by the
    game's own ball-in-hand rule near the head string."""
    game = rules.new_game(key)
    seated = rules.seat(game, (0.0, -0.6))
    return dataclasses.replace(game, state=seated, in_hand="none")


def fourteenth_game(key):
    """A fresh 14th-ball decision of `key`: the cue ball and two object balls of the opening
    position, placed here so that the lower ball has a straight pot into the foot pocket at +x.
    Returns (game, the Action of that pot)."""
    game = rules.new_game(key)
    table = game.state.table()
    first, second = sorted(b for b in game.state.positions() if b != rules.CUE)[:2]
    pocket = max(range(len(table.pockets)), key=lambda p: (table.pockets[p][1],
                                                           table.pockets[p][0]))
    px, py = table.pockets[pocket]
    ball = (0.4, 1.05)
    dx, dy = px - ball[0], py - ball[1]
    length = math.hypot(dx, dy)
    cue = (ball[0] - 0.35 * dx / length, ball[1] - 0.35 * dy / length)
    state = game.state.with_positions({rules.CUE: cue, first: ball, second: (-0.3, -0.4)},
                                      game.templates)
    position = dataclasses.replace(game, state=state, in_hand="none", run=13, decision=13)
    stroke = adapter.Stroke(1.6, math.atan2(dy, dx), 0.0, 0.0, 0.0)
    return position, rules.Action(stroke, rules.Call(first, pocket))
