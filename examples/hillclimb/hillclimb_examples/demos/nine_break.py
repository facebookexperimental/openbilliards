# Copyright (c) Meta Platforms, Inc. and affiliates.

"""A kernel target in one short file: the 9-ball break, with one lever.

    python -B -m hillclimb_examples.demos.nine_break

The README's steps 1 to 3 on the kernel, then one climb step on 200 keys; it needs pool_py. The
game key seeds the kernel's 9-ball rack; the agent breaks from the head string at the apex ball,
its cue at the cue-clearance floor; the kernel's nineball-v1 rules judge the executed stroke.
value() is the share of breaks that keep the table; the lever moves the cue ball toward the rail.
"""

import math
from dataclasses import dataclass
from fractions import Fraction

from hillclimb import adapter, climb, noise, protocol
from hillclimb_examples.demos import describe

#: The nineball-v1 rules state at the break: player 1 shoots, balls 1 to 9 on the table.
OPENING = '{"shooter":1,"onTable":[1,2,3,4,5,6,7,8,9],"result":null}'


class Breaker:
    """Breaks from (x, the head string) at the apex ball at `speed` m/s (params x and speed)."""

    def __init__(self, spec):
        self.x, self.speed = float(spec.params.get("x", 0.0)), float(spec.params.get("speed", 9.0))

    def reset(self, key):
        """Nothing to forget: the agent holds no game state."""

    def act(self, rack, decision):
        """(the cue ball's place, the Stroke), the cue raised to the cue-clearance floor."""
        place, apex = (self.x, rack.positions()[0][1]), rack.positions()[1]
        aim = adapter.Stroke(self.speed, math.atan2(apex[1] - place[1], apex[0] - place[0]))
        floor = adapter.min_elevation_deg(rack.with_positions({**rack.positions(), 0: place}), aim)
        return place, adapter.Stroke(aim.v0, aim.phi, math.radians(floor))


@dataclass(frozen=True)
class NineBreak:
    """The 9-ball break at noise level `noise`: the share of breaks that keep the table."""

    name: str = "9-ball break: share that keeps the table"
    noise: float = 1.0
    estimator: str = "share"

    def play(self, agent, key):
        """One break: {"key", "kept" (1: legal, and a ball pocketed), "pocketed"}."""
        rack = adapter.State.rack("nine", key)
        place, stroke = agent.act(rack, protocol.Decision(key, 0, self.noise))
        executed, _ = noise.execute(stroke, key, 0, self.noise)
        outcome = adapter.simulate(rack.with_positions({**rack.positions(), 0: place}), executed,
                                   seed=noise.shot_seed(key, 0), keep_record=True)
        kept = outcome.truncated is None and adapter.rules_judge(
            "nineball-v1", OPENING, outcome)["turn"] == "continue"
        return {"key": key, "kept": int(kept), "pocketed": [ball for ball, _ in outcome.pocketed]}

    def value(self, records):
        """The share of kept breaks over the records, exact; None without a record."""
        return Fraction(sum(r["kept"] for r in records), len(records)) if records else None


BASE = protocol.AgentSpec("hillclimb_examples.demos.nine_break:Breaker", {"x": 0.0, "speed": 9.0})
LEVER = protocol.SetParams("break from the side rail", {"x": 0.5})


def run(n=200, workers=1):
    """The climb step of LEVER on BASE over n keys, decided by the default DecisionRule."""
    return climb.climb_step(NineBreak(), BASE, LEVER, namespace="hillclimb/demo/nine-break", n=n,
                            rule=protocol.DecisionRule(), workers=workers, replicates=1000,
                            seed="hillclimb/demo/nine-break/bootstrap")


def main():
    print(describe(run()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
