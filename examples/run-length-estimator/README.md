# Run-length estimator

Estimates how many strokes a stroke-playing policy keeps a run going before its first miss. It
uses conditional Monte Carlo (CMC) in place of the plain miss count, exact rational arithmetic
(`fractions.Fraction`) and a whole-game bootstrap. One module, `run_length.py`, standard library
only, Python 3.8 or later. It needs no simulator: the caller supplies the per-game numbers.

## Method

A game is played stroke by stroke until its first miss, or until a cap on its length stops it.
Under a constant per-stroke miss hazard, the capped maximum-likelihood estimate of the mean run
length is `sum L / sum D` over the games, where L is a game's run length (strokes made) and D is
1 when its run ended at a miss and 0 when the cap stopped it.

Conditional Monte Carlo replaces each 0/1 death by its conditional expectation given the state
and the stroke played. The stroke is re-simulated m times (128 by default) under independent
noise, and its miss share h = misses / m stands in for the death. Every stroke a game played
counts, the last one too, so

    E[L] = sum L / sum h = m * sum L / sum misses

where a game's misses total the misses of all its re-simulated strokes. A share has the
expectation of the death it replaces and no larger variance (variance reduction by
conditioning), the cap needs no special case, and with m = 1 and each game's own death as its
misses the formula is the capped estimate. The estimate is only as good as the re-simulation:
the shares must come from the same noise model that plays the game.

The probability that a run survives its first H strokes is estimated the same way, as the mean
over games of prod (1 - h) over those H strokes (`survival_numerator`, `survival_estimate`).
Every factor must exist, so a game that misses before stroke H is continued: from the miss on,
each stroke goes on from one of its successful re-simulations, and a stroke without a successful
re-simulation makes the product 0. When nothing is left to go on from, the game dies out before
stroke H (an extinction): `survival_numerator` accepts a list shorter than H exactly when it ends
at its first count of m, and returns 0. It refuses a shorter list that goes on past a count of m
or ends without one; a full-length list may hold m anywhere. Every count (run lengths, miss
totals, miss counts, numerators and H) must be an integer >= 0: a negative or fractional one
refuses rather than being truncated.

Uncertainty comes from a bootstrap over whole games: each replicate resamples the games with
replacement, a game's L and misses together, through `random.Random(seed)` with a seed the
caller chooses. Positions are exact: the one-sided upper bound at level 1 - alpha is the sorted
replicate at `ceil((1 - alpha) B) - 1`, the percentile interval takes alpha / 2 on each side.
`run_length_estimate` returns INF (`math.inf`) when its games hold no miss at all, and a
bootstrap replicate of it is INF when its resampled games hold none; INF sorts last, and a bound
whose position falls outside the replicates, as with no games, is INF as well.
`survival_estimate` returns None with no game, and `bootstrap_sd` returns None with fewer than
two finite replicates. By design, INF and None decide no bar: `meets_bar` and `below_bar` both
return False for them at every bar. A replicate without a miss carries no usable estimate of the
hazard, so the test declines rather than guesses. A bar is a number, or a pair (base, exponent)
for `base ** exponent` with an exact exponent (not a float), compared exactly without roots.

## Example

Made-up numbers, m = 8:

```python
from fractions import Fraction
import run_length as rl

games = [(12, 9), (30, 4), (7, 15), (21, 6)]  # made-up (run length, misses) at m = 8
point = rl.run_length_estimate(games, m=8)  # 8 * 70 / 34
s = rl.summary(games, lambda draw: rl.run_length_estimate(draw, m=8), seed="readme", replicates=200)
print(point, round(float(point), 2), s["interval"][0], s["interval"][1], s["upper"])
print(rl.meets_bar(point, 15), rl.below_bar(s["upper"], 15))
ys = [rl.survival_numerator(x, horizon=3, m=8) for x in ([0, 1, 0], [2, 0, 1], [0, 0, 0], [1, 3, 0])]
p = rl.survival_estimate(ys, horizon=3, m=8)
print(p, rl.meets_bar(p, (Fraction(1, 2), Fraction(1, 3))))
```

It prints:

```
280/17 16.47 44/9 148/3 204/5
True False
197/256 False
```

## Tests

From the repository root:

    python3 -B -m unittest discover -s examples/run-length-estimator -p "test_*.py"

The tests use the standard library and made-up numbers only; one of them runs the example above.

## Provenance

First-party work, written for this repository under its license; no third-party code was
copied. No dataset ships: the numbers in the tests and on this page are made up, and no
measured result is reported. The method is textbook:

- S. M. Ross, *Simulation*, 5th ed., Academic Press, 2013: section 9.3, Variance Reduction by
  Conditioning; section 8.3, The Bootstrapping Technique for Estimating Mean Square Errors.
- S. Asmussen and P. W. Glynn, *Stochastic Simulation: Algorithms and Analysis*, Stochastic
  Modelling and Applied Probability 57, Springer, 2007: chapter V, section 4, Conditional Monte
  Carlo; chapter III, sections 3 (smooth functions of expectations, such as this ratio) and 5
  (sectioning, jackknifing and bootstrapping).
- B. Efron and R. J. Tibshirani, *An Introduction to the Bootstrap*, Chapman & Hall, 1993:
  chapter 13, Confidence Intervals Based on Bootstrap Percentiles.
