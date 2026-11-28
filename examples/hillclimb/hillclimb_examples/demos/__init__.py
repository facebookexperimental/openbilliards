# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Demos, run from the project directory with python -B -m hillclimb_examples.demos.<name>.

    climb_toy   the README's five steps on the framework's toy target (hillclimb.toy); no kernel
    nine_break  a small kernel target: one climb step on the 9-ball break; needs pool_py
    smoke       the public smoke: one tiny climb step on the 14.1 base agent; needs pool_py

describe() prints what a climb step found; every demo uses it.
"""

import math


def _number(value):
    """A point or a bound as text: two decimals, 'inf' and '-inf', or 'none'."""
    if value is None:
        return "none"
    if isinstance(value, float) and math.isinf(value):
        return "inf" if value > 0 else "-inf"
    return f"{float(value):.2f}"


def _estimate(point, interval):
    return f"{_number(point)}  (interval {_number(interval[0])} to {_number(interval[1])})"


def describe(result):
    """A few lines that say what a climb step (a hillclimb.protocol.StepResult) found."""
    base, arm, delta = result.base_measurement, result.arm_measurement, result.delta
    kernel = "none" if result.kernel is None else result.kernel
    return "\n".join([
        f"target    {result.target}",
        f"lever     {result.lever}",
        f"keys      {result.n} from namespace {result.namespace!r}",
        f"base      {_estimate(base.point, base.interval)}",
        f"arm       {_estimate(arm.point, arm.interval)}",
        f"paired    {_estimate(delta.point, delta.interval)} at level 1 - {delta.alpha}",
        f"decision  {result.decision} (rule {result.rule.name}, min_effect {result.rule.min_effect})",
        f"kernel    {kernel}",
    ])
