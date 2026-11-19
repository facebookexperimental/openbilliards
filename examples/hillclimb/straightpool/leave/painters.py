# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The declaration of a decision: the call, the leave target, the brush program and the grid.

A painter is a pure function of (position, candidate list): no learned constant and no random draw,
so the same inputs give the same declaration, bit for bit. It calls the live direct pot with the
highest makeability (ties by candidate order), or declares that no pot is live; it names the ball
and pocket the leave is painted for (the post-shot ball whose best pocket gives the largest summed
field); it sets the brush program (the rail penalty, and the angle band toward the side of the
ball after next); and it renders the grid.

Two painters differ only in how they price the call:

    v0.1  brush v0.1 makeability: only the cue ball's path to the ghost ball is checked
    v0.2  brush v0.2 makeability: the object ball's path to the pocket is checked as well

The v0.2 painter is the default, and the one used by the agents behind the published numbers: in
dense 15-ball layouts the v0.1 painter keeps calling straight pots whose object ball cannot reach
the pocket. Both paint the leave itself with the v0.1 fields (laws.leave_program).

Other parts of the package use the names below, so a change adds fields with defaults or new
functions and leaves these names in place.
"""

import hashlib
import json
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any, Mapping, Optional, Tuple

from straightpool.candidates import Intent
from straightpool.game import Call
from straightpool.leave import brush, laws
from straightpool.leave.brush import Grid

#: The painters, by the brush version that prices the call.
PAINTERS = ("v0.1", "v0.2")

#: The painter of the published agents.
DEFAULT_PAINTER = "v0.2"


@dataclass(frozen=True)
class Declaration:
    """A painted declaration: the call (None when no pot is live), the (ball, pocket) the leave is
    painted for (None when nothing follows the call), the JSON-ready brush program, and the grid
    (None without a call).

    family     the intent whose candidates seed the refinement of the call: the called
               candidate's own intent for a painted call; for an open declaration (wrapper) the
               canonical 'pot' intent of a direct pot, or a bank or kick pot's own intent; None
               without a call
    candidate  the index of the candidate the call comes from (None without a call)
    table      the adapter.Table the grid was painted on, for the frame conversion of a cue-ball
               rest (None without a call); not part of the JSON form"""

    call: Optional[Call]
    surface: Optional[Tuple[int, int]]
    brush: Mapping[str, Any]
    grid: Optional[Grid]
    family: Optional[Intent] = None
    candidate: Optional[int] = None
    table: Any = field(default=None, compare=False, repr=False)

    def as_json(self):
        """The declaration as a JSON-ready dict, the form its digests are taken over."""
        return {
            "call": (None if self.call is None else
                     {"ball": int(self.call.ball), "pocket": int(self.call.pocket)}),
            "candidate": None if self.candidate is None else int(self.candidate),
            "family": (None if self.family is None else
                       {"ball": int(self.family.ball), "pocket": int(self.family.pocket),
                        "shot_class": str(self.family.shot_class)}),
            "surface": (None if self.surface is None else
                        {"ball": int(self.surface[0]), "pocket": int(self.surface[1])}),
            "brush": json.loads(json.dumps(dict(self.brush))),
            "grid": None if self.grid is None else self.grid.as_json(),
        }

    def digest(self):
        """The first 16 hex digits of SHA-256 over the canonical JSON form (sorted keys)."""
        text = json.dumps(self.as_json(), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


#: The declaration that no pot is live.
NO_CALL = Declaration(call=None, surface=None, brush=MappingProxyType({}), grid=None)


def render_surface(positions, table, declared, surface, program):
    """(Grid, plateau) of the pot surface for a call on `declared`: the object balls of the
    kernel-frame `positions` in the scene frame, the leave painted for `surface` (or the neutral
    base when it is None) under the brush `program`, rendered and validated; plateau is
    brush.plateau(grid)."""
    bed = brush.cloth(table)
    balls = {int(n): brush.scene_from_kernel(p, table) for n, p in sorted(positions.items())
             if int(n) != 0}
    score = brush.compose(balls, bed, "pot", int(declared), surface, dict(program))
    grid = brush.validate(brush.render(score, bed))
    return grid, brush.plateau(grid)


def declare(positions, table, candidates, *, painter=DEFAULT_PAINTER):
    """(Declaration, meta) of a position: kernel-frame `positions` {ball id: (x, y)} (no ball 0
    while the cue ball is in hand), an adapter.Table and the candidate list in enumeration order.

    meta records the counts (n_candidates, n_direct_pot, n_live), no_call, and for a call its
    ball, pocket, candidate, cut_deg and make, the surface ball, pocket and sum, the ball after
    next, the band's side, and the grid's max and plateau_cells."""
    if painter not in PAINTERS:
        raise ValueError(f"unknown painter {painter!r}; one of {PAINTERS}")
    rows = laws.direct_pots(positions, candidates, table, both_legs=painter == "v0.2")
    live = [r for r in rows if r.make > 0.0]
    meta = {"n_candidates": len(candidates), "n_direct_pot": len(rows), "n_live": len(live)}
    if not live:
        return NO_CALL, dict(meta, no_call=True)
    best = live[0]
    for row in live[1:]:
        if row.make > best.make:
            best = row
    intent = best.candidate.intent
    ball, pocket = int(intent.ball), int(intent.pocket)
    meta.update(no_call=False, ball=ball, pocket=pocket, candidate=int(best.candidate.index),
                cut_deg=best.cut_deg, make=best.make)
    surface, program, info = laws.leave_program(positions, ball, table)
    if surface is not None:
        meta.update(surface_ball=surface[0], surface_pocket=surface[1],
                    surface_sum=info["surface_sum"], ball_after_next=info["ball_after_next"],
                    prefer_side=info["prefer_side"])
    grid, (top, _centroid, cells) = render_surface(positions, table, ball, surface, program)
    meta.update(grid_max=top, plateau_cells=cells)
    declaration = Declaration(call=Call(ball, pocket), surface=surface, brush=program, grid=grid,
                              family=intent, candidate=int(best.candidate.index), table=table)
    return declaration, meta


def paint_with_meta(game, candidates, *, painter=DEFAULT_PAINTER):
    """(Declaration, meta) of a straightpool.game.Game (see declare)."""
    return declare(game.state.positions(), game.state.table(), candidates, painter=painter)


def paint(game, candidates, *, painter=DEFAULT_PAINTER):
    """The Declaration of a straightpool.game.Game from its candidate list
    (straightpool.candidates.Candidate, in enumeration order)."""
    return paint_with_meta(game, candidates, painter=painter)[0]

