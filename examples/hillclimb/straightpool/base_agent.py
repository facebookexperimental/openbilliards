# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The labelled baseline agent: the composition the README climb and the demo start from.

At each decision it enumerates the candidates of the position (straightpool.candidates), lets the
painter declare the call and paint the leave surface (straightpool.leave.painters: the live direct
pot of highest makeability; no live pot ends the game), and refines the declared shot by
simulation: every candidate of the call's family is scored on the decision's shared draw block,
and the best few are refined by best-of-K (hillclimb.select.best_of_k: 3 survivors, 3 iterations,
16 proposals per iteration on 10 shared draws, at most 2,000 simulations per decision), each value
being E[pot x W(rest)] - lambda_foul x P(foul) with W the leave surface at the cue ball's rest
(straightpool.leave.wrapper.mean_objective, frame-true, called-pocket aware). Every proposal is
clamped into the actuation envelope and the played stroke must be inside it.

Its parameters switch the parts of the composition, so a lever is a change of one parameter:

    leave        True: W is the painted leave surface; False: W = 1 everywhere, so the value is the
                 pot rate less the foul penalty (the flat-surface control)
    painter      the painter that prices the call: 'v0.2' (both legs of the pot) or 'v0.1'
    rollouts     how a rollout draw is judged: 'first-contact' (default; straightpool.game
                 .judge_rollout: the cue ball must touch the called ball first) or 'rules' (the
                 14.1 law the played stroke is judged by, straightpool.game.judge)
    lambda_foul  the foul penalty, in balls
    envelope     'v1' (default), 'v2', or None (the kernel's stroke domain only)
    floor        True: every seed and proposal is held to the cue-clearance floor (a stroke below
                 it is re-seeded at the floor plus 0.5 deg; straightpool.envelope.reseed); a stroke
                 the re-seed leaves outside the envelope is never played, and a decision with no
                 other stroke gives up
    survivors, iterations, proposals, draws, budget   the best-of-K schedule (hillclimb.select)
    namespace    the namespace of the agent's rollout draws (hillclimb.crn)

Every parameter changes what the agent plays; none sets speed only. Its rollouts run on one kernel
thread, and a run is made faster by playing games on workers (the runner's worker count), which no
spec or record holds.

Its composition and its label (what was measured, at which noise level, on which kernel build,
with which status) are stated in AGENT-CARD-base.md beside this module.

Other parts of the package use the names below, so a change adds parameters with defaults or
new functions and leaves these names in place.
"""

import dataclasses
import math

from hillclimb import adapter, crn, select
from hillclimb import noise as hand_noise
from hillclimb.adapter import Stroke
from hillclimb.protocol import AgentSpec

from straightpool import candidates as menu
from straightpool import envelope
from straightpool import game as rules
from straightpool.leave import painters, wrapper

#: The runner builder of this agent.
BUILDER = "straightpool.base_agent:build"

#: The parameters and their defaults: the recorded composition.
DEFAULTS = {
    "leave": True,
    "painter": painters.DEFAULT_PAINTER,
    "rollouts": "first-contact",
    "lambda_foul": wrapper.LAMBDA_FOUL,
    "envelope": "v1",
    "floor": False,
    "survivors": 3,
    "iterations": 3,
    "proposals": 16,
    "draws": 10,
    "budget": 2000,
    "namespace": "straightpool/base-agent/rollouts",
}

#: The recorded baseline of the default composition, as AGENT-CARD-base.md states it: the record,
#: its date, the point, its interval (none recorded), the games, the estimator, the envelope status,
#: the noise level and the kernel build it was measured on.
LABEL = {
    "key": "internal research log, row 89",
    "date": "2026-08-04",
    "point": 7.08,
    "interval": None,
    "n": 100,
    "estimator": "mean run length (the plain mean of L; cap 200 balls, no game capped)",
    "envelope": ("not in-envelope: measured before the envelope was enforced in the 14.1 games "
                 "(the v1 box held on every played stroke; the cue-clearance floor was not "
                 "checked)"),
    "noise": 0.1,
    "kernel": "0.1.0+64e9e7a3",
}

#: The rollout judges by name.
ROLLOUT_JUDGES = {"first-contact": rules.judge_rollout, "rules": rules.judge}

#: The stroke an Action carries when it declares that no pot is callable (it is never played).
GIVE_UP_STROKE = Stroke(1.0, 0.0)


class BaseAgent:
    """The baseline agent (hillclimb.protocol.Agent) for straightpool.game."""

    def __init__(self, spec):
        unknown = sorted(set(spec.params) - set(DEFAULTS))
        if unknown:
            raise ValueError(f"unknown base-agent parameters {unknown}; known: {sorted(DEFAULTS)}")
        self.params = {**DEFAULTS, **dict(spec.params)}
        p = self.params
        self.envelope = None if p["envelope"] is None else envelope.of(p["envelope"])
        if p["rollouts"] not in ROLLOUT_JUDGES:
            raise ValueError(f"unknown rollout judge {p['rollouts']!r}; one of "
                             f"{sorted(ROLLOUT_JUDGES)}")
        self.judge = ROLLOUT_JUDGES[p["rollouts"]]
        self.schedule = select.Schedule(survivors=int(p["survivors"]),
                                        iterations=int(p["iterations"]),
                                        proposals=int(p["proposals"]), draws=int(p["draws"]),
                                        budget=int(p["budget"]))
        self.last = None

    def reset(self, key):
        """Forget everything of the previous game."""
        self.last = None

    def act(self, game, decision):
        """The game.Action to play in a game.Game at a hillclimb.protocol.Decision."""
        p = self.params
        cands = menu.enumerate_candidates(game)
        declared = painters.paint(game, cands, painter=p["painter"])
        if declared.call is None:
            self.last = {"decision": decision.index, "call": None}
            return rules.Action(GIVE_UP_STROKE, None)
        if not p["leave"]:
            flat = dataclasses.replace(declared.grid, vals=(1.0,) * len(declared.grid.vals))
            declared = dataclasses.replace(declared, grid=flat)
        family = declared.family
        seeds = menu.family(cands, family.ball, family.pocket, family.shot_class)
        place = seeds[0].place
        start = rules.seat(game, place)
        kind = envelope.decision_kind(game)
        stream = crn.stream(p["namespace"], decision.key)
        draws = crn.block(stream, decision.index, self.schedule.draws)
        seed = rules.kernel_seed(game)

        def evaluate(stroke):
            if p["floor"] and self.envelope is not None and not envelope.inside(
                    self.envelope, stroke, kind, adapter.min_elevation_deg(start, stroke)):
                return -math.inf  # no stroke of this aim and tip clears the floor in the box
            outcomes = select.rollouts([(start, stroke)], draws, r=decision.noise, seed=seed)[0]
            return wrapper.mean_objective(declared, outcomes, p["lambda_foul"],
                                          judge=self.judge)["objective"]

        def draw(j):
            return crn.draw(stream, decision.index, j)

        def project(stroke):
            if self.envelope is not None:
                stroke = envelope.clamp(self.envelope, stroke, kind)
            else:
                stroke = Stroke.of(hand_noise.project_stroke(stroke.as_tuple()))
            if p["floor"]:
                stroke = envelope.reseed(stroke, adapter.min_elevation_deg(start, stroke))
            return stroke

        strokes = [c.stroke for c in seeds]
        if p["floor"]:
            strokes = [project(s) for s in strokes]
        result = select.best_of_k(strokes, evaluate, draw, schedule=self.schedule,
                                  project=project)
        picked = result.picked.stroke
        if result.picked.value == -math.inf:
            self.last = {"decision": decision.index, "call": None}
            return rules.Action(GIVE_UP_STROKE, None)
        if self.envelope is not None:
            floor = adapter.min_elevation_deg(start, picked) if p["floor"] else None
            if not envelope.inside(self.envelope, picked, kind, floor):
                raise RuntimeError(f"the picked stroke {picked} is outside envelope "
                                   f"{self.envelope.name} at a {kind} decision")
        self.last = {"decision": decision.index, "call": [declared.call.ball, declared.call.pocket],
                     "candidate": declared.candidate, "seeds": len(seeds),
                     "scheduled": result.scheduled, "value": result.picked.value,
                     "source": result.picked.source}
        return rules.Action(picked, declared.call, place)


def build(spec):
    """The runner's builder: a BaseAgent from its AgentSpec."""
    return BaseAgent(spec)


def spec(**params):
    """The AgentSpec of the baseline agent; a parameter not given takes the agent's default."""
    return AgentSpec(BUILDER, dict(params))
