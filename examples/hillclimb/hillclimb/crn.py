# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Common random numbers: game keys, per-decision draw blocks and the paired compare.

Every random number a climb uses derives from a namespace string and integer counters through the
SplitMix64 mix of the noise stream (noise.shot_seed), so two arms that play the same keys meet the
same racks, the same execution noise and the same rollout draws, and no result depends on where or
in what order a game ran:

    base(namespace)               the first 8 bytes of SHA-256(namespace), big-endian, as an integer
    game_keys(namespace, n)       [shot_seed(base(namespace), j) for j in range(n)]
    stream(namespace, key)        shot_seed(base(namespace), key): one game's seed for one use
    draw(stream_seed, i, j)       standard_normals(shot_seed(stream_seed, i), j): draw j of decision i
    block(stream_seed, i, m)      [draw(stream_seed, i, j) for j in range(m)]

Choose your own namespace strings: one per use (game keys, rollout draws, re-simulation draws) and
a fresh one for every comparison you report, so that no two results share their luck. Distinct
namespaces give distinct bases, and the mix is a bijection, so their streams do not coincide.

The streams of one game, all derived from its key:

    executed stroke noise        noise.standard_normals(key, i), through noise.execute
    kernel seed of decision i    noise.shot_seed(key, i), for the played stroke and for every
                                 rollout and re-simulation of it
    an agent's rollout draws     draw(stream(<the agent's namespace>, key), i, j)
    re-simulation draws          draw(stream(<a namespace of their own>, key), i, j)
    the game keys                game_keys(<the step's namespace>, n); climb() uses
                                 '<namespace>/step-<i>'

The paired compare resamples keys, both arms of a key together, so the difference keeps the pairing
that common random numbers bought.
"""

import hashlib
import math
import random
from fractions import Fraction

from . import _siblings, measure, noise
from .protocol import PairedDelta

_rl = _siblings.load("run_length")


def base(namespace):
    """The integer base of a namespace: the first 8 bytes of SHA-256 over its UTF-8 text,
    big-endian."""
    return int.from_bytes(hashlib.sha256(namespace.encode("utf-8")).digest()[:8], "big")


def game_keys(namespace, n, start=0):
    """Keys start .. start + n - 1 of a namespace: shot_seed(base(namespace), j)."""
    root = base(namespace)
    return [noise.shot_seed(root, j) for j in range(int(start), int(start) + int(n))]


def stream(namespace, key):
    """One game's seed for the use a namespace names: shot_seed(base(namespace), key)."""
    return noise.shot_seed(base(namespace), int(key))


def draw(stream_seed, decision_index, j):
    """Draw j of a decision: the five standard normals at (shot_seed(stream_seed, decision_index),
    j). Counter-based: any draw can be taken without the ones before it."""
    return noise.standard_normals(noise.shot_seed(stream_seed, int(decision_index)), int(j))


def block(stream_seed, decision_index, m):
    """The first m draws of a decision, in draw order."""
    seed = noise.shot_seed(stream_seed, int(decision_index))
    return [noise.standard_normals(seed, j) for j in range(int(m))]


def _difference(arm, base_value):
    """arm - base, exactly when both are exact; None when it is undefined (either estimate missing,
    or both infinite); +inf or -inf when one side alone is infinite."""
    if arm is None or base_value is None:
        return None
    arm_inf, base_inf = arm == math.inf, base_value == math.inf
    if arm_inf and base_inf:
        return None
    if arm_inf:
        return math.inf
    if base_inf:
        return -math.inf
    return arm - base_value


def _at(values, position):
    return values[position] if 0 <= position < len(values) else math.inf


def paired_compare(records_base, records_arm, value, *, seed, alpha=measure.ALPHA,
                   replicates=measure.REPLICATES):
    """The PairedDelta of value(records_arm) - value(records_base), the two lists aligned by key
    (record i of each comes from key i; unequal lengths raise ValueError). Each replicate resamples
    key indices with replacement from random.Random(seed) and takes both arms' records at those
    indices; arithmetic stays exact where value() is exact.

    A replicate is drawn as the run-length estimator draws one: n picks rng.randrange(n), in order.
    A replicate whose difference is undefined (both arms infinite, or an estimate missing) is
    counted in n_undecided and counts against both bounds: the lower bound is read with the
    undecided replicates at the bottom of the order, the upper bound with them at the top. The
    bounds sit at the run-length estimator's percentile positions over all replicates. Without
    records the point is None and the interval (-inf, inf)."""
    records_base, records_arm = list(records_base), list(records_arm)
    if len(records_base) != len(records_arm):
        raise ValueError(f"the arms hold {len(records_base)} and {len(records_arm)} records; "
                         "a paired compare needs one record of each arm per key")
    if seed is None:
        raise ValueError("the paired compare needs an explicit seed")
    n, count = len(records_base), int(replicates)
    if n == 0:
        return PairedDelta(point=None, interval=(-math.inf, math.inf), n=0, alpha=Fraction(alpha),
                           replicates=count, seed=seed)
    rng = random.Random(seed)
    decided, undecided = [], 0
    for _ in range(count):
        picks = [rng.randrange(n) for _ in range(n)]
        difference = _difference(value([records_arm[i] for i in picks]),
                                 value([records_base[i] for i in picks]))
        if difference is None:
            undecided += 1
        else:
            decided.append(difference)
    decided.sort()
    low, high = _rl.interval_positions(alpha, count)
    return PairedDelta(point=_difference(value(records_arm), value(records_base)),
                       interval=(_at([-math.inf] * undecided + decided, low),
                                 _at(decided + [math.inf] * undecided, high)),
                       n=n, alpha=Fraction(alpha), replicates=count, seed=seed,
                       n_undecided=undecided)
