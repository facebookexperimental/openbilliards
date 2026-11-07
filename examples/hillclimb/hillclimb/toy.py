# Copyright (c) Meta Platforms, Inc. and affiliates.

"""A toy target and agent: the climb loop in seconds, without the kernel.

The toy game is a run of strokes at one number. The agent commands an aim a; the stroke is
executed as a + noise * eps, with eps the first of the decision's five normals from the hand noise
law's stream (game key, decision index), and it scores when the executed aim lands within WINDOW of
zero. The run is the strokes scored before the first miss, up to the cap. Every played stroke is
also re-simulated m times under draws of the toy's own stream (crn.draw on CMC_NAMESPACE), and the
misses among them give the run-length estimator's conditional Monte Carlo E[L] (value()).

Nothing here is billiards: it is the smallest game with a run length, for trying climb_step, climb,
a registration and the estimators before pointing them at a kernel target. The aim that serves best
is 0; at noise 1 an aim of 0.8 runs about 7.5 strokes on average and an aim of 0.2 about 19:

    from hillclimb import climb, protocol, toy

    levers = [protocol.SetParams("aim 0.2", {"aim": 0.2}),
              protocol.SetParams("aim 1.4", {"aim": 1.4})]
    final, steps = climb.climb(toy.ToyRun(), toy.spec(aim=0.8), levers,
                               namespace="my-first-climb", n=200, rule=protocol.DecisionRule(),
                               seed="my-first-climb/bootstrap", replicates=2000)
    print(final.params, [(s.lever, s.decision) for s in steps])
"""

from dataclasses import dataclass
from typing import ClassVar

from . import crn, measure
from .noise import standard_normals
from .protocol import AgentSpec, Decision

#: The runner builder of the toy agent.
BUILDER = "hillclimb.toy:build"

#: A stroke scores when its executed aim is within this of zero.
WINDOW = 2.0

#: The namespace of the toy's re-simulation draws (one stream per game key).
CMC_NAMESPACE = "hillclimb/toy/cmc"


class ToyAgent:
    """Commands the aim of its spec (params: aim, default 0.0) at every decision."""

    def __init__(self, spec):
        self.aim = float(spec.params.get("aim", 0.0))

    def reset(self, key):
        """Nothing to forget: the agent holds no game state."""

    def act(self, state, decision):
        """The commanded aim (state, the run so far, and the Decision are not needed)."""
        return self.aim


def build(spec):
    """The runner's builder: a ToyAgent from its AgentSpec."""
    return ToyAgent(spec)


def spec(**params):
    """The AgentSpec of the toy agent."""
    return AgentSpec(BUILDER, dict(params))


@dataclass(frozen=True)
class ToyRun:
    """The toy run-length target: its name, the noise scale, the cap on strokes per game, and m,
    the re-simulations per played stroke. Its games never call the kernel."""

    name: str = "toy-run"
    noise: float = 1.0
    cap: int = 60
    m: int = 32
    estimator: str = "conditional-monte-carlo"
    uses_kernel: ClassVar[bool] = False

    def play(self, agent, key):
        """One game: {"key", "run", "misses"}, with the miss count among the m re-simulations of
        every stroke played, the last one included."""
        stream = crn.stream(CMC_NAMESPACE, key)
        run, misses = 0, []
        for i in range(self.cap):
            aim = float(agent.act(run, Decision(key, i, self.noise)))
            executed = aim + self.noise * standard_normals(key, i)[0]
            misses.append(sum(1 for eps in crn.block(stream, i, self.m)
                              if abs(aim + self.noise * eps[0]) > WINDOW))
            if abs(executed) > WINDOW:
                break
            run += 1
        return {"key": key, "run": run, "misses": misses}

    def value(self, records):
        """E[L] = m * sum run / sum misses over the records (measure.run_length), exact."""
        return measure.run_length([(r["run"], sum(r["misses"])) for r in records], self.m)
