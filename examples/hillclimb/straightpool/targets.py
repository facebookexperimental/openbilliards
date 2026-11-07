# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Our targets: the run length of solo 14.1 at a noise level.

RunLength plays one game per key with an agent and records its run length L and, for the
conditional Monte Carlo estimator, the misses among m re-simulations of every stroke it played
(hillclimb.measure.stroke_misses on a stream of its own); value() is E[L] = m * sum L / sum misses,
exact. A stroke misses when it does not score under the rules (straightpool.game.judge); a declared
give-up counts as a stroke whose m re-simulations all miss.

The specifications of our published targets are defined here, each with its noise level, cap and
bars:

    UNIT          run length at r = 0.1 (the 0.1x unit, where our published numbers were measured),
                  capped at 1,000 balls, m = 128
    LEVELS        the noise levels at which results are named and printed: 0.1x, 0.25x and 0.40x;
                  r itself is a free setting (level(r) makes a target at any r)
    HARD_TARGET   E[L] about 200 with P(L >= 45) >= 0.80 at 0.1x, judged with a 10 % margin: the
                  lower bound on E[L] at least 200 / 0.9 = 2,000 / 9, the lower bound on
                  P(L >= 45) at least 0.8 ** 0.9
    ENVELOPES     the actuation envelope v1 (the default preset) and v2 (straightpool.envelope)

Status (internal research log, rows 543, 546, 556, 559, 571 and 585): the hard target is not met
in-envelope. Every number was measured on kernel 0.1.0+64e9e7a3; kernel changes are not
bit-exact, so runs on a newer kernel do not reproduce them bit for bit.

Other parts of the package use the names below, so a change adds fields with defaults or new
functions and leaves these names in place.
"""

from dataclasses import dataclass
from fractions import Fraction

from hillclimb import crn, measure
from hillclimb.protocol import Decision

from straightpool import envelope, game as rules

#: The namespace of the re-simulation draws of the conditional Monte Carlo estimator.
CMC_NAMESPACE = "straightpool/targets/cmc"


@dataclass(frozen=True)
class RunLength:
    """A run-length target: its name, the noise level r of the games (0.1 is the 0.1x unit), the
    cap on balls per game, m, the re-simulations per played stroke, and the name of its estimator
    in measurement records (hillclimb.climb.climb_step reads it)."""

    name: str
    noise: float
    cap: int
    m: int = measure.DRAWS
    estimator: str = "conditional-monte-carlo"

    def play(self, agent, key):
        """One game from key `key`: a JSON-ready record with the run length, the per-stroke miss
        counts and the way the game ended."""
        key = int(key)
        game = rules.new_game(key)
        cmc = crn.stream(CMC_NAMESPACE, key)
        misses = []
        while game.over is None:
            action = agent.act(game, Decision(key, game.decision, self.noise))
            if action.call is None:
                misses.append(self.m)
            else:
                place = None
                if game.in_hand != "none":
                    place = (0.0, 0.0) if action.place is None else action.place
                misses.append(measure.stroke_misses(
                    rules.seat(game, place), action.stroke, _missed(action.call), r=self.noise,
                    stream_seed=cmc, decision_index=game.decision, seed=rules.kernel_seed(game),
                    m=self.m))
            game, _judgment, _outcome = rules.step(game, action, noise=self.noise, cap=self.cap)
        return {"key": key, "run": game.run, "misses": misses, "over": game.over,
                "decisions": len(misses)}

    def value(self, records):
        """E[L] over the records (hillclimb.measure.run_length)."""
        return measure.run_length([(r["run"], sum(r["misses"])) for r in records], self.m)


def _missed(call):
    def missed(outcome):
        return not rules.judge(outcome, call).scored
    return missed


def reached(records, horizon):
    """P(L >= horizon) in its indicator form: the share of the records whose run reached
    `horizon`, exact; None without a record. (The conditional Monte Carlo form needs every game's
    miss counts over its first `horizon` strokes, past its end as well:
    hillclimb.measure.survival.)"""
    records = list(records)
    if not records:
        return None
    return Fraction(sum(1 for r in records if r["run"] >= horizon), len(records))


def level(r, cap=1000, m=measure.DRAWS):
    """The run-length target at noise level r."""
    return RunLength(name=f"straightpool-run-length@{r}x", noise=float(r), cap=int(cap), m=int(m))


#: The 0.1x unit: run length at r = 0.1, capped at 1,000 balls, m = 128.
UNIT = level(0.1)

#: The noise levels at which results are named and printed; r is otherwise free.
LEVELS = (0.1, 0.25, 0.40)


@dataclass(frozen=True)
class HardTarget:
    """The hard target: at noise level `noise`, E[L] about `mean` and P(L >= horizon) at least
    `survival`, judged on lower bounds with a `margin`: E[L]'s bar is mean / (1 - margin) and
    P's bar is survival ** (1 - margin)."""

    noise: float
    mean: int
    horizon: int
    survival: Fraction
    margin: Fraction

    @property
    def mean_bar(self):
        """The bar on E[L]'s lower bound, exact: 2,000 / 9 for the published target."""
        return Fraction(self.mean) / (1 - self.margin)

    @property
    def survival_bar(self):
        """The bar on P(L >= horizon)'s lower bound as an exact power (base, exponent), the form
        hillclimb.measure.meets_bar compares without roots: 0.8 ** 0.9 for the published one."""
        return (self.survival, 1 - self.margin)

    def met(self, mean_lower, survival_lower):
        """True when both lower bounds meet their bars (exact comparisons; INF and None decide
        no bar)."""
        return (measure.meets_bar(mean_lower, self.mean_bar)
                and measure.meets_bar(survival_lower, self.survival_bar))


#: E[L] about 200 with P(L >= 45) >= 0.80 at 0.1x, with a 10 % margin.
HARD_TARGET = HardTarget(noise=0.1, mean=200, horizon=45, survival=Fraction(4, 5),
                         margin=Fraction(1, 10))

#: The actuation envelopes by name; v1 is the default preset.
ENVELOPES = dict(envelope.ENVELOPES)
