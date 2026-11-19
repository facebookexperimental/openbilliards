# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Mean run length by conditional Monte Carlo, in exact rational arithmetic.

A run is a sequence of strokes that ends at its first miss or at a cap on its length. With run
lengths L and deaths D (1 when a run ended at a miss, 0 when the cap stopped it), the capped
maximum-likelihood estimate of the mean run length under a constant per-stroke hazard is
sum L / sum D. Conditional Monte Carlo replaces each 0/1 death by its probability given the state
and the stroke: the stroke is re-simulated m times under independent noise and h = misses / m.
Summed over every stroke of every game, E[L] = sum L / sum h = m * sum L / sum misses.

Every finite estimate is an exact Fraction. The caller supplies the per-game numbers, counts that
are integers >= 0 (no simulator runs here); standard library only.
"""
import math
import random
from fractions import Fraction

INF = math.inf  # the value of a draw without a miss: it sorts last and decides no bar
DRAWS = 128  # m, re-simulations of each stroke under independent noise
REPLICATES = 10 ** 4  # B, bootstrap replicates
ALPHA = Fraction(1, 20)  # bounds at level 1 - alpha; give alpha as a Fraction or a str such as "0.05"
SD_SCALE = 10 ** 12  # the fixed point of a replicate in the bootstrap sd


def _m(m):
    if int(m) != m or m < 1:
        raise ValueError("m must be a positive integer")
    return int(m)


def _count(x, what):
    """A count, checked as _m checks m before int() keeps it: a fractional or negative one refuses."""
    if int(x) != x or x < 0:
        raise ValueError(f"{what} must be an integer >= 0")
    return int(x)


def run_length_estimate(games, m=DRAWS):
    """E[L] = m * sum L / sum misses over (L, misses) games, exactly; INF with no miss. A game's
    misses total the misses of the m re-simulations of every stroke it played; with m = 1 and each
    game's own 0/1 death as its misses, this is the capped estimate sum L / sum D."""
    pairs, m = [(_count(g[0], "a run length"), _count(g[1], "a miss total")) for g in games], _m(m)
    misses = sum(x for _n, x in pairs)
    return INF if misses == 0 else Fraction(m * sum(n for n, _x in pairs), misses)


def survival_numerator(misses, horizon, m=DRAWS):
    """prod (m - misses) over a game's first `horizon` strokes: prod (1 - h) times m ** horizon.
    A stroke whose m re-simulations all miss leaves no continuation, so a game can die out before
    the horizon: a shorter list is accepted exactly when it ends at its first count of m (an
    extinction), and gives 0. A full-length list may hold m anywhere."""
    xs = [_count(x, "a miss count") for x in misses]
    m, horizon = _m(m), _count(horizon, "the horizon")
    extinct = 0 < len(xs) < horizon and xs[-1] == m and m not in xs[:-1]
    if not (len(xs) == horizon or extinct) or any(x > m for x in xs):
        raise ValueError("need one miss count in [0, m] for each of the first `horizon` strokes, "
                         "or a shorter list that ends at its first count of m (an extinction)")
    return math.prod(m - x for x in xs)


def survival_estimate(numerators, horizon, m=DRAWS):
    """P(a run survives its first `horizon` strokes): the mean over games of prod (1 - h),
    sum Y / (n * m ** horizon), exactly; None with no game."""
    ys = [_count(y, "a survival numerator") for y in numerators]
    m, horizon = _m(m), _count(horizon, "the horizon")
    return Fraction(sum(ys), len(ys) * m ** horizon) if ys else None


def bootstrap(units, value, seed, replicates=REPLICATES):
    """`replicates` draws of len(units) units with replacement, one random.Random(seed).randrange a
    pick, in list order, and value(draw) a draw (a Fraction or INF). Returns {"sorted": the values,
    INF last, "n_inf": how many are INF, "replicates", "units"}."""
    if seed is None:
        raise ValueError("the bootstrap needs an explicit seed")
    units, rng, b = list(units), random.Random(seed), int(replicates)
    g = len(units)
    vals = sorted(value([units[rng.randrange(g)] for _i in range(g)]) for _r in range(b)) if g else []
    return {"sorted": vals, "n_inf": vals.count(INF), "replicates": b, "units": g}


def at(boot, position):
    """The sorted replicate at a 0-based position; INF outside the replicates."""
    vals = boot["sorted"]
    return vals[position] if 0 <= position < len(vals) else INF


def upper_position(alpha=ALPHA, replicates=REPLICATES):
    """0-based position of the one-sided upper bound at level 1 - alpha: ceil((1 - alpha) B) - 1."""
    return math.ceil((1 - Fraction(alpha)) * int(replicates)) - 1


def interval_positions(alpha=ALPHA, replicates=REPLICATES):
    """0-based positions of the percentile interval at level 1 - alpha:
    floor(alpha B / 2) and ceil((1 - alpha / 2) B) - 1."""
    half = Fraction(alpha) / 2
    return math.floor(half * int(replicates)), math.ceil((1 - half) * int(replicates)) - 1


def sqrt_ceil(q, places=12):
    """sqrt(q) rounded up at `places` decimals, exactly (integer square root)."""
    q, s = Fraction(q), 10 ** places
    if q <= 0:
        return Fraction(0)
    v = math.isqrt((q.numerator * s * s) // q.denominator)
    while Fraction(v * v, s * s) < q:
        v += 1
    return Fraction(v, s)


def bootstrap_sd(boot):
    """The sd (n - 1 form) of the finite replicates: each floored to 1e-12, the variance of those
    integers exact, its square root rounded up at 12 places; None with fewer than two."""
    xs = [Fraction(v) for v in boot["sorted"] if v != INF]
    k = len(xs)
    if k < 2:
        return None
    fp = [(x.numerator * SD_SCALE) // x.denominator for x in xs]
    s1, s2 = sum(fp), sum(x * x for x in fp)
    return sqrt_ceil(Fraction(k * s2 - s1 * s1, k * (k - 1)) / (SD_SCALE * SD_SCALE))


def _sign(value, bar):
    """sign(value - bar), exactly; None for INF and None. bar is a number, or a pair (base, e) for
    base ** e with e exact, not a float; compared without roots (value, base, e >= 0)."""
    if value is None or value == INF:
        return None
    v = Fraction(value)
    if isinstance(bar, tuple):
        if isinstance(bar[1], float):  # a float such as 0.7 has denominator 2 ** 52
            raise TypeError("give a power bar's exponent exactly: an int, a Fraction or a str")
        base, e = Fraction(bar[0]), Fraction(bar[1])
        if min(v, base, e) < 0:
            raise ValueError("a power bar needs value, base and exponent >= 0")
        v, bar = v ** e.denominator, base ** e.numerator
    bar = Fraction(bar)
    return (v > bar) - (v < bar)


def meets_bar(value, bar):
    """value >= bar, exactly. INF and None decide no bar: they neither meet one nor fall below."""
    s = _sign(value, bar)
    return s is not None and s >= 0


def below_bar(value, bar):
    """value < bar, exactly; False for INF and None."""
    s = _sign(value, bar)
    return s is not None and s < 0


def summary(units, value, seed, alpha=ALPHA, replicates=REPLICATES):
    """value(units) and its whole-unit bootstrap: the percentile interval and the one-sided upper
    bound, both at level 1 - alpha, the bootstrap sd and the count of INF replicates."""
    units = list(units)
    boot = bootstrap(units, value, seed, replicates)
    lo, hi = interval_positions(alpha, replicates)
    return {"units": len(units), "point": value(units), "interval": (at(boot, lo), at(boot, hi)),
            "upper": at(boot, upper_position(alpha, replicates)), "sd": bootstrap_sd(boot),
            "n_inf": boot["n_inf"]}
