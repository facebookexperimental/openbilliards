# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The open declaration of a window candidate, and the frame-true called-pocket objective.

A decision can refine several candidates, not only the painter's call. open_declaration gives any
callable candidate its own declaration by the painter's construction (its call, the leave target
that follows it, the angle band when a ball after next exists, the grid). objective() turns a
declaration into the per-draw value the refinement averages: W(cue rest) when the called ball is
legally pocketed in the called pocket, 0 otherwise, less lambda_foul on a foul. The cue rest is
converted from the kernel frame to the scene frame before W is read.

Which draws are pots and which are fouls is the rules' call: by default straightpool.game.judge,
the 14.1 law the played stroke is judged by (a draw scores when it is foul-free and the called
ball drops in the called pocket; any foul of that law is a foul). The research agents priced their
rollouts with the kernel rules crate's 9-ball law, the called ball standing in as the ball on, so
there a first contact with any other ball was a foul as well; pass `judge` to price draws another
way. A refused (truncated) simulation is a foul with no pot and no rest.

The decision's refinement is hillclimb.select.best_of_k on a declaration: the seeds are the strokes
of declared_seeds(candidates, declaration.family), evaluate(stroke) scores a stroke over the
decision's shared draws by mean_objective (or select.score with objective()), and project is the
actuation envelope; the default select.Schedule is the published one.

Other parts of the package use the names below, so a change adds fields with defaults or new
functions and leaves these names in place.
"""

from straightpool import game as rules
from straightpool.candidates import Intent
from straightpool.leave import brush, laws, painters

#: The foul penalty of the published agents (one ball, the environment's own foul penalty).
LAMBDA_FOUL = 1.0


def open_at(positions, table, candidate):
    """The painters.Declaration of one callable candidate on kernel-frame `positions` and an
    adapter.Table: its call, the leave target and brush program that follow it
    (laws.leave_program), the rendered grid, and the family that seeds its refinement: the
    canonical 'pot' intent for a direct pot, the candidate's own intent otherwise (a bank or kick
    pot keeps its class)."""
    intent = candidate.intent
    if intent.pocket is None:
        raise ValueError(f"candidate {candidate.index} has no pocket and cannot be called")
    ball, pocket = int(intent.ball), int(intent.pocket)
    surface, program, _info = laws.leave_program(positions, ball, table)
    shot_class = "pot" if intent.shot_class in laws.POT_FAMILIES else intent.shot_class
    grid, _plateau = painters.render_surface(positions, table, ball, surface, program)
    return painters.Declaration(call=rules.Call(ball, pocket), surface=surface, brush=program,
                                grid=grid, family=Intent(ball, pocket, shot_class),
                                candidate=int(candidate.index), table=table)


def open_declaration(game, candidate):
    """The painters.Declaration of one callable candidate of a straightpool.game.Game."""
    return open_at(game.state.positions(), game.state.table(), candidate)


def declared_seeds(candidates, family):
    """The refinement's warm starts: the candidates whose intent equals the declaration's family
    (ball, pocket and shot class), in enumeration order. ValueError when none matches."""
    def key(intent):
        return (int(intent.ball), -1 if intent.pocket is None else int(intent.pocket),
                str(intent.shot_class))

    want = key(family)
    seeds = [c for c in candidates if key(c.intent) == want]
    if not seeds:
        raise ValueError(f"no candidate has the declared intent {family!r}")
    return seeds


def indicators(outcome, call, judge=None):
    """(pot, foul, rest) of one simulated draw (an adapter.Outcome) under `call`: pot when the
    judgment scores the call, foul when it is not legal, rest the cue ball's (x, y) in the kernel
    frame when it ended on the table (None otherwise). A truncated outcome is (False, True,
    None)."""
    if outcome.truncated is not None:
        return False, True, None
    judgment = (judge or rules.judge)(outcome, call)
    legal = bool(judgment.legal)
    return legal and bool(judgment.scored), not legal, outcome.positions().get(0)


def _parts(declaration):
    if declaration.call is None or declaration.grid is None or declaration.table is None:
        raise ValueError("a declaration without a call, grid and table has no objective")
    return declaration.call, brush.validate(declaration.grid), declaration.table


def objective(declaration, lambda_foul, *, judge=None):
    """A function outcome -> float: W(scene(cue rest)) if the call scored, else 0, minus lambda_foul
    if the stroke fouled. Its mean over a candidate's draws is E[pot x W(rest)] -
    lambda_foul x P(foul)."""
    call, grid, table = _parts(declaration)
    lam = float(lambda_foul)

    def value(outcome):
        pot, foul, rest = indicators(outcome, call, judge)
        w = (brush.weight(grid, *brush.scene_from_kernel(rest, table))
             if pot and rest is not None else 0.0)
        return w - lam if foul else w

    return value


def mean_objective(declaration, outcomes, lambda_foul, *, judge=None):
    """The objective over one candidate's draws in the research's own arithmetic: the pot-weighted
    sum and the counts accumulated in draw order, then divided by the number of draws.

    Returns {'objective': pot_weight - lambda_foul * foul_rate, 'pot_weight': E[pot x W(rest)],
    'foul_rate': P(foul), 'pot_rate': P(pot)}. Equal to the mean of objective() up to float
    rounding; use it where a decision must match the research agents' arithmetic."""
    call, grid, table = _parts(declaration)
    n = len(outcomes)
    if n == 0:
        raise ValueError("no outcomes: the objective is undefined")
    pot_w = pots = fouls = 0.0
    for outcome in outcomes:
        pot, foul, rest = indicators(outcome, call, judge)
        if foul:
            fouls += 1.0
        if pot:
            pots += 1.0
            if rest is not None:
                pot_w += brush.weight(grid, *brush.scene_from_kernel(rest, table))
    pot_weight = pot_w / n
    foul_rate = fouls / n
    return {"objective": pot_weight - float(lambda_foul) * foul_rate, "pot_weight": pot_weight,
            "foul_rate": foul_rate, "pot_rate": pots / n}
