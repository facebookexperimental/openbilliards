# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Simulation-based selection: rollouts on one shared draw block, argmax, best-of-K.

A candidate is scored by simulating it m times in the kernel, once under each draw of the
decision's block (crn.draw): draw j perturbs every candidate with the same five normals, and every
simulation of the decision carries the same kernel seed, so candidates are compared on common
random numbers and the whole selection replays from the keys alone. The score is the mean of an
objective over the draws (the pot rate, say, or the pot rate weighted by where the cue ball stops,
less a foul penalty). argmax breaks an exact tie toward the lower index.

best_of_k refines the best few candidates by iterated Gaussian proposals: each of the top
`survivors` seeds is moved, `iterations` times, to the best of `proposals` perturbations of its
current centre, the proposal spread shrinking by `shrink` per iteration. Proposal perturbations
are draws of the same decision block at indices after the scoring draws, so they never disturb the
scoring draws, and every proposal passes through `project` (your actuation box) before the kernel
sees it. The pick is the best of the seeds and all proposals; an exact tie prefers a seed, then an
earlier proposal. The whole schedule is counted before the first simulation, and a schedule over
budget is refused before any kernel work.
"""

import math
from dataclasses import dataclass
from typing import Optional, Tuple

from . import adapter, noise
from .adapter import Stroke


class BudgetExceeded(RuntimeError):
    """A schedule needs more simulations than its budget allows; raised before any kernel work."""


@dataclass(frozen=True)
class Schedule:
    """The best-of-K schedule: survivors refined, iterations per survivor, proposals per iteration,
    scoring draws per evaluation, the first proposal spread per stroke entry (v0 m/s, phi rad,
    theta rad, a, b), its shrink factor per iteration, and the simulation budget per call."""

    survivors: int = 3
    iterations: int = 3
    proposals: int = 16
    draws: int = 10
    sigma0: Tuple[float, float, float, float, float] = (
        0.15, math.radians(0.4), math.radians(1.0), 0.03, 0.03)
    shrink: float = 0.6
    budget: int = 2000

    def scheduled(self, n_seeds):
        """Simulations a call with n_seeds seeds schedules: every seed scored, then every proposal
        of the refined survivors scored, each over `draws` draws."""
        refined = min(n_seeds, self.survivors)
        return (n_seeds + refined * self.iterations * self.proposals) * self.draws

    def proposal_index(self, rank, iteration, proposal):
        """The block draw index of one proposal's perturbation, after the scoring draws:
        draws + (rank * iterations + iteration) * proposals + proposal."""
        if not (0 <= rank < self.survivors and 0 <= iteration < self.iterations
                and 0 <= proposal < self.proposals):
            raise ValueError(f"proposal ({rank}, {iteration}, {proposal}) is outside the schedule")
        return self.draws + (rank * self.iterations + iteration) * self.proposals + proposal


@dataclass(frozen=True)
class Entry:
    """One scored stroke of a best_of_k call: a seed (source 'seed', its index among the seeds) or
    a proposal (source 'refined', the seed it descends from, its survivor rank, iteration and
    proposal number)."""

    stroke: Stroke
    value: float
    source: str
    seed_index: int
    rank: Optional[int] = None
    iteration: Optional[int] = None
    proposal: Optional[int] = None


@dataclass(frozen=True)
class BestOfK:
    """The pick of a best_of_k call, every entry it scored in scoring order, and the simulations
    its schedule counted."""

    picked: Entry
    entries: Tuple[Entry, ...]
    scheduled: int


def rollouts(jobs, draws, *, r, seed, options=None, threads=1, shape="off", keep_record=False):
    """Outcomes of every (state, stroke) job under every draw: result[c][j] is job c simulated after
    noise.perturb(stroke, draws[j], r, shape), with kernel seed `seed` for all. The jobs carry their
    own states, so a ball-in-hand candidate brings the state with its cue ball placed. All jobs go
    to the kernel in one batch (adapter.simulate_many); keep_record=True keeps each record for a
    rules judge."""
    jobs, draws = list(jobs), list(draws)
    flat = [(state, noise.perturb(stroke, eps, r, shape), seed)
            for state, stroke in jobs for eps in draws]
    outcomes = adapter.simulate_many(flat, options=options, threads=threads,
                                     keep_record=keep_record)
    m = len(draws)
    return [outcomes[c * m:(c + 1) * m] for c in range(len(jobs))]


def score(outcomes, objective):
    """The mean of objective(outcome) over one candidate's outcomes, in draw order (a float);
    ValueError with no outcome. The values are added with the built-in sum()."""
    values = [float(objective(outcome)) for outcome in outcomes]
    if not values:
        raise ValueError("a score needs at least one outcome")
    return sum(values) / len(values)


def _is_nan(value):
    return value != value


def argmax(values):
    """The index of the first largest value; ValueError for an empty list or a NaN."""
    values = list(values)
    if not values:
        raise ValueError("argmax of an empty list")
    best = None
    for index, value in enumerate(values):
        if _is_nan(value):
            raise ValueError(f"value {index} is NaN")
        if best is None or value > values[best]:
            best = index
    return best


def _order(entry):
    """The pick order: value descending; an exact tie prefers a seed (lower seed index first), then
    an earlier proposal (survivor rank, iteration, proposal number)."""
    if entry.source == "seed":
        return (-entry.value, 0, entry.seed_index, 0, 0)
    return (-entry.value, 1, entry.rank, entry.iteration, entry.proposal)


def _default_project(stroke):
    return Stroke.of(noise.project_stroke(stroke.as_tuple()))


def best_of_k(seeds, evaluate, draw, *, schedule=Schedule(), project=None):
    """Refine `seeds` (Strokes, in candidate order) by the schedule and return a BestOfK.

    evaluate(stroke) -> float scores one stroke over the decision's first schedule.draws draws;
    draw(j) -> five normals is draw j of the same decision block; project(stroke) -> Stroke (or five
    numbers) maps a proposal into the caller's actuation box (default: noise.project_stroke, the
    kernel's domain).
    Raises BudgetExceeded, before evaluating anything, when schedule.scheduled(len(seeds)) exceeds
    schedule.budget, and ValueError without seeds or when evaluate returns a NaN.

    The loop: every seed is scored; the top min(len(seeds), survivors) by the pick order are refined
    in that order. Survivor `rank` starts with its centre at its own stroke and its best at its own
    entry; at iteration t the spread is sigma0[d] * shrink ** t, proposal p is
    project(centre[d] + spread[d] * draw(proposal_index(rank, t, p))[d]), and after the iteration's
    proposals the centre moves to the best entry so far (a proposal replaces it only when strictly
    better)."""
    seeds = [s if isinstance(s, Stroke) else Stroke.of(s) for s in seeds]
    if not seeds:
        raise ValueError("best_of_k needs at least one seed")
    scheduled = schedule.scheduled(len(seeds))
    if scheduled > schedule.budget:
        raise BudgetExceeded(f"{len(seeds)} seeds schedule {scheduled} simulations, over the "
                             f"budget of {schedule.budget}")
    project = _default_project if project is None else project

    def scored(stroke, **where):
        value = float(evaluate(stroke))
        if _is_nan(value):
            raise ValueError(f"evaluate returned NaN for {stroke}")
        return Entry(stroke=stroke, value=value, **where)

    entries = [scored(stroke, source="seed", seed_index=i) for i, stroke in enumerate(seeds)]
    survivors = sorted(entries, key=_order)[:min(len(seeds), schedule.survivors)]
    for rank, survivor in enumerate(survivors):
        centre, best = survivor.stroke.as_tuple(), survivor
        for t in range(schedule.iterations):
            spread = [s0 * (schedule.shrink ** t) for s0 in schedule.sigma0]
            for p in range(schedule.proposals):
                eps = draw(schedule.proposal_index(rank, t, p))
                raw = Stroke.of([float(centre[d]) + float(spread[d]) * float(eps[d])
                                 for d in range(5)])
                projected = project(raw)
                if not isinstance(projected, Stroke):
                    projected = Stroke.of(projected)
                entry = scored(projected, source="refined", seed_index=survivor.seed_index,
                               rank=rank, iteration=t, proposal=p)
                entries.append(entry)
                if entry.value > best.value:
                    best = entry
            centre = best.stroke.as_tuple()
    return BestOfK(picked=min(entries, key=_order), entries=tuple(entries), scheduled=scheduled)
