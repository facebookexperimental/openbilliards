# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The public smoke: one tiny climb step on the 14.1 base agent, on the kernel.

    python -B -m hillclimb_examples.demos.smoke [--set NAME=VALUE] [--workers N] [--out FILE]

Run it from the project directory (examples/hillclimb) with the kernel binding, pool_py, installed.
Two keys, a cap of one ball and a small best-of-K schedule keep it to seconds; every played stroke
is still re-simulated m = 128 times, as in our published numbers. At this size its numbers say
nothing about the agents. Without --set the lever changes nothing, so both arms play the same agent
on the same keys: on common random numbers their games and measurements are then identical and the
paired difference is zero, which checks the whole path (game, agent, target, runner, estimators,
climb step) end to end. With --set NAME=VALUE the lever sets one
parameter of the base agent instead; VALUE is read as JSON when it parses (true, 0.5, "text") and
as text otherwise. The parameters are straightpool.base_agent.DEFAULTS, described in the module and
in its agent card.
"""

import argparse
import json
from fractions import Fraction

from hillclimb import climb, protocol
from hillclimb_examples.demos import describe
from straightpool import base_agent, targets

#: The smoke's keys, target, base and rule, fixed before any game.
NAMESPACE = "hillclimb/demo/smoke"
SEED = "hillclimb/demo/smoke/bootstrap"
N = 2
REPLICATES = 1000
TARGET = targets.RunLength(name="smoke: 14.1 run length, cap 1", noise=0.4, cap=1)
BASE = base_agent.spec(iterations=1, proposals=4, draws=4)
RULE = protocol.DecisionRule(alpha=Fraction(1, 20), min_effect=0)


def lever_of(setting=None):
    """The lever of a --set NAME=VALUE argument; without one, a lever that changes nothing."""
    if setting is None:
        return protocol.SetParams("same spec", {})
    name, sep, text = setting.partition("=")
    if not sep or not name:
        raise ValueError(f"--set wants NAME=VALUE, got {setting!r}")
    try:
        value = json.loads(text)
    except ValueError:
        value = text
    return protocol.SetParams(f"set {name}={text}", {name: value})


def run(lever, workers=1):
    """The smoke's climb step for `lever` on the base agent: a hillclimb.protocol.StepResult."""
    return climb.climb_step(TARGET, BASE, lever, namespace=f"{NAMESPACE}/{lever.name}", n=N,
                            rule=RULE, seed=SEED, workers=workers, replicates=REPLICATES)


def main(argv=None):
    parser = argparse.ArgumentParser(description="One tiny climb step on the 14.1 base agent.")
    parser.add_argument("--set", dest="setting", metavar="NAME=VALUE",
                        help="the lever: set one parameter of the base agent (default: none)")
    parser.add_argument("--workers", type=int, default=1,
                        help="worker processes; the result is the same for any count")
    parser.add_argument("--out", help="write the result to this file (refused when it exists)")
    args = parser.parse_args(argv)
    result = run(lever_of(args.setting), workers=args.workers)
    print(describe(result))
    if args.out:
        climb.write_result(args.out, result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
