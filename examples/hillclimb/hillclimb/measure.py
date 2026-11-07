# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Run-length estimators, through the run-length estimator.

A run is the strokes a policy keeps scoring before its first miss, up to a cap. The sibling example
run-length-estimator holds the method: the capped maximum-likelihood estimate sum L / sum D, its
conditional Monte Carlo form m * sum L / sum misses (every played stroke re-simulated m times under
independent noise), the survival estimate P(L >= H), exact Fractions throughout, and a whole-game
bootstrap from an explicit seed. This module re-exports that method, wraps its results as
Measurement records (drawing the bootstrap as the estimator draws it, so that an estimate undefined
on some resamples is measured too), and adds the per-stroke re-simulation count the conditional
form needs.

INF (math.inf) is the estimate of games without a single miss; INF and None decide no bar.
"""

import random
from fractions import Fraction

from . import _siblings, adapter, noise
from .protocol import Measurement

_rl = _siblings.load("run_length")

#: m, the re-simulations of each played stroke in the conditional Monte Carlo form.
DRAWS = _rl.DRAWS

#: B, the bootstrap replicates.
REPLICATES = _rl.REPLICATES

#: alpha: intervals are at level 1 - alpha.
ALPHA = _rl.ALPHA

#: The estimate of games without a miss.
INF = _rl.INF

#: meets_bar(value, bar) and below_bar(value, bar): exact comparisons; INF and None decide no bar.
meets_bar = _rl.meets_bar
below_bar = _rl.below_bar


def run_length(games, m=DRAWS):
    """E[L] over (run length, misses) games: m * sum L / sum misses, an exact Fraction, or INF
    without a miss. With m = 1 and each game's own 0/1 death as its misses, the capped estimate."""
    return _rl.run_length_estimate(games, m)


def survival(miss_lists, horizon, m=DRAWS):
    """P(a run survives its first `horizon` strokes) over games, each given as its per-stroke miss
    counts (the run-length estimator's survival rules, extinction included); None with no game."""
    return _rl.survival_estimate([_rl.survival_numerator(misses, horizon, m)
                                  for misses in miss_lists], horizon, m)


def _at(order, position):
    """The replicate at a 0-based position of an order; INF outside the replicates (as the
    run-length estimator reads one)."""
    return order[position] if 0 <= position < len(order) else INF


def summary(records, value, *, target, estimator, seed, alpha=ALPHA, replicates=REPLICATES):
    """A Measurement of value(records) with its whole-game bootstrap: each replicate resamples the
    records with replacement (random.Random(seed), as the run-length estimator draws); the interval,
    the one-sided upper bound and the sd are at level 1 - alpha.

    value() may be None (no estimate) on a resample. Such a replicate is counted in n_undefined and
    counts against both bounds, as in the paired compare (crn.paired_compare): the interval's lower
    end is read with the undefined replicates at the bottom of the order, its upper end and the
    one-sided upper bound with them at the top, and a bound that falls on one is None, which
    decides no bar. The sd is that of the finite replicates. Without an undefined replicate every
    number equals the run-length estimator's summary."""
    records = list(records)
    if seed is None:
        raise ValueError("the bootstrap needs an explicit seed")
    rng, n, count = random.Random(seed), len(records), int(replicates)
    defined, undefined = [], 0
    for _ in range(count if n else 0):
        found = value([records[rng.randrange(n)] for _ in range(n)])
        if found is None:
            undefined += 1
        else:
            defined.append(found)
    defined.sort()
    low, high = _rl.interval_positions(alpha, count)
    top = defined + [None] * undefined
    return Measurement(target=target, estimator=estimator, point=value(records),
                       interval=(_at([None] * undefined + defined, low), _at(top, high)),
                       upper=_at(top, _rl.upper_position(alpha, count)),
                       sd=_rl.bootstrap_sd({"sorted": defined}), n=n, alpha=Fraction(alpha),
                       replicates=count, seed=seed, n_inf=defined.count(INF),
                       n_undefined=undefined)


def stroke_misses(state, stroke, missed, *, r, stream_seed, decision_index, seed, m=DRAWS,
                  options=None, threads=1, shape="off", keep_record=False):
    """How many of m re-simulations of a played stroke miss: draw j (crn.draw(stream_seed,
    decision_index, j)) perturbs `stroke` at level r (noise.perturb, in the law's `shape`), the
    kernel simulates it from `state` with kernel seed `seed`, and missed(outcome) says whether that
    draw failed under the game's rules. stream_seed must belong to a stream used for nothing else
    (its own crn namespace). Pass the commanded stroke, the state it was played from (cue ball
    placed) and the decision's kernel seed, so that only the execution noise differs from the
    played stroke; keep_record=True keeps each record for a rules judge."""
    from . import crn

    jobs = [(state, noise.perturb(stroke, eps, r, shape), seed)
            for eps in crn.block(stream_seed, decision_index, m)]
    outcomes = adapter.simulate_many(jobs, options=options, threads=threads,
                                     keep_record=keep_record)
    return sum(1 for outcome in outcomes if missed(outcome))
