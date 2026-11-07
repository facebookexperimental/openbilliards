# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Shared loading of the leave-surface fixtures (leave_fixtures.json beside this module).

The fixtures hold fresh positions made for these tests, not decision states of recorded games (the
recorded games stay private), and the outputs of the research implementation the leave surface
was ported from: digests of the grids and declarations and the exact values of fields, weights and
objectives. Candidate rows are [ball, pocket, shot class], or [ball, pocket, shot class, x, y]
while the cue ball is in hand (its placement); a run of n > 1 equal rows is stored once with n
appended.
"""

import json
import pathlib

from hillclimb.adapter import Stroke, Table
from straightpool.candidates import Candidate, Intent
from tests import platforms

PATH = pathlib.Path(__file__).with_name("leave_fixtures.json")
DATA = json.loads(PATH.read_text(encoding="utf-8"))

#: The kernel's standard table, as the fixtures were made on it.
TABLE = Table(DATA["table"]["width"], DATA["table"]["length"], DATA["table"]["ball_radius"],
              tuple(tuple(p) for p in DATA["table"]["pockets"]))

#: The painters read only a candidate's index, intent and placement; strokes are placeholders.
STROKE = Stroke(1.0, 0.0)


def positions(raw):
    """{ball id: (x, y)} from the fixture form."""
    return {int(k): (float(v[0]), float(v[1])) for k, v in raw.items()}


def candidates(rows):
    """The candidate list of a fixture decision, in enumeration order."""
    out = []
    for row in rows:
        if len(row) in (3, 4):
            ball, pocket, shot_class = row[:3]
            place, count = None, (row[3] if len(row) == 4 else 1)
        else:
            ball, pocket, shot_class, x, y = row[:5]
            place, count = (None if x is None else (x, y)), (row[5] if len(row) == 6 else 1)
        for _ in range(count):
            out.append(Candidate(len(out), Intent(ball, pocket, shot_class), STROKE, "ghost-ball",
                                 place))
    return out


def decision(name):
    """The fixture decision called `name`."""
    return next(d for d in DATA["decisions"] if d["name"] == name)


def summary(declaration):
    """The fixture form of a Declaration: its readable parts and its digests."""
    j = declaration.as_json()
    grid = declaration.grid
    return {"call": j["call"], "candidate": j["candidate"], "family": j["family"],
            "surface": j["surface"], "brush": j["brush"], "declaration": declaration.digest(),
            "grid": None if grid is None else {"nx": grid.nx, "ny": grid.ny,
                                               "vals": grid.digest()}}


def assert_summary(case, got, want):
    """A summary against its fixture form: equal where the exact pins are on; elsewhere equal but
    for the two digests, whose grid values pass through libm (tests/platforms.py)."""
    if platforms.RECORDED_HERE:
        case.assertEqual(got, want)
        return

    def parts(form):
        grid = form["grid"]
        return dict(form, declaration=None,
                    grid=None if grid is None else dict(grid, vals=None))

    case.assertEqual(parts(got), parts(want))


class FakeState:
    """A stand-in for adapter.State that knows only its positions and table."""

    def __init__(self, positions_, table):
        self._positions = positions_
        self._table = table

    def positions(self):
        return dict(self._positions)

    def table(self):
        return self._table


class FakeGame:
    """A stand-in for straightpool.game.Game with just a state."""

    def __init__(self, positions_, table=TABLE):
        self.state = FakeState(positions_, table)
