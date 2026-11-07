# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Climb the framework's toy target: register, run once, read once.

    python -B -m hillclimb_examples.demos.climb_toy [--workers N] [--registration FILE]

Run it from the project directory (examples/hillclimb); it needs no kernel. It is the README's five
steps on hillclimb.toy: the target is the toy run-length game, the base agent aims at 0.8, one
lever moves the aim to 0.2, and the rule below adopts the lever only when the lower bound of the
95 % paired interval is above 2 strokes. climb.register writes the climb down before any game, and
climb.climb runs it once and writes its result into the same file. Without --registration the file
lives in a temporary directory that is removed afterwards. The answer is known (E[L] about 7.5
against about 19), so the step adopts, and the worker count changes nothing in the result.
"""

import argparse
import pathlib
import tempfile
from fractions import Fraction

from hillclimb import climb, protocol, toy
from hillclimb_examples.demos import describe

#: The registered climb: the README's template, filled in before the first game.
TARGET = toy.ToyRun()
BASE = toy.spec(aim=0.8)
LEVERS = (protocol.SetParams("aim 0.2", {"aim": 0.2}),)
SETTINGS = {"namespace": "hillclimb/demo/toy-climb", "n": 100,
            "rule": protocol.DecisionRule(alpha=Fraction(1, 20), min_effect=2),
            "seed": "hillclimb/demo/toy-climb/bootstrap", "replicates": 2000}


def run(registration, workers=1):
    """Register the demo's climb at `registration` (a path that must not exist yet), run it once,
    and return (the final spec, the list of StepResults)."""
    climb.register(registration, TARGET, BASE, LEVERS, **SETTINGS)
    return climb.climb(TARGET, BASE, LEVERS, workers=workers, registration=registration,
                       **SETTINGS)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Climb the toy target: register, run, read.")
    parser.add_argument("--workers", type=int, default=1,
                        help="worker processes; the result is the same for any count")
    parser.add_argument("--registration", metavar="FILE",
                        help="keep the registration and its result in FILE (refused when it exists)")
    args = parser.parse_args(argv)
    with tempfile.TemporaryDirectory() as scratch:
        path = args.registration or str(pathlib.Path(scratch, "toy-climb.json"))
        final, steps = run(path, workers=args.workers)
    for step in steps:
        print(describe(step))
    print(f"final     {final.canonical()}")
    if args.registration:
        print(f"the registration and its result: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
