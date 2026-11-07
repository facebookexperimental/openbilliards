# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The climb protocol: a target measures an agent, a lever changes an agent, and a climb step
compares the two arms on common random numbers.

    agent    a policy built from a picklable AgentSpec. runner.play calls reset(key) before every
             game, and the target's game calls act(state, decision) at every decision; the state
             and the action are the game's own types.
    target   a game plus an estimator: play(agent, key) plays one game and returns a JSON-ready
             record, and value(records) is the point estimate over a list of records. A target may
             also carry `estimator`, a short name of its estimator for the measurement records
             (default: the target's class name), and `uses_kernel`, False for a target whose games
             never call the kernel (default True), so that its results record no kernel build.
    lever    a named change to an AgentSpec (AgentSpec -> AgentSpec). Levers act on specs, never
             on live agents, so every arm can be rebuilt in any worker process. SetParams is the
             common lever: it sets agent parameters.
    step     both arms (the base spec and lever.apply(base)) play the same keys; their paired
             difference and a DecisionRule fixed before the run decide adopt, kill or inconclusive.

A registered climb (climb.register) writes down the target and every lever by their class and
their fields, so a target or lever to register is a dataclass whose fields hold every setting that
changes what it does (the toy target, our targets and SetParams are).

Records hold numbers as the estimators produce them: exact Fractions where the estimator is exact,
floats otherwise, math.inf for an estimate without a single miss, and None for no estimate.
as_json() writes a Fraction as its 'p/q' string, the infinities as 'inf' and '-inf', and every
other value as it is.

This module is data and protocols only; the behaviour lives in crn, runner, measure and climb.
"""

import json
import math
from dataclasses import dataclass, field, fields
from fractions import Fraction
from typing import Any, Mapping, Optional, Protocol, Tuple, runtime_checkable

#: The three decisions of a climb step.
ADOPT = "adopt"
KILL = "kill"
INCONCLUSIVE = "inconclusive"


def as_json_value(value):
    """A value in its JSON-ready form: a Fraction as 'p/q', math.inf and -math.inf as 'inf' and
    '-inf', tuples and lists as lists, mappings as dicts with string keys, a record by its own
    as_json(); everything else as it is."""
    if isinstance(value, Fraction):
        return f"{value.numerator}/{value.denominator}"
    if isinstance(value, float) and math.isinf(value):
        return "inf" if value > 0 else "-inf"
    if isinstance(value, (list, tuple)):
        return [as_json_value(v) for v in value]
    if isinstance(value, Mapping):
        return {str(k): as_json_value(v) for k, v in value.items()}
    if hasattr(value, "as_json"):
        return value.as_json()
    return value


def _fields_json(record):
    return {f.name: as_json_value(getattr(record, f.name)) for f in fields(record)}


@dataclass(frozen=True)
class AgentSpec:
    """How to build an agent in any process. `builder` names a function as
    'package.module:function' that takes the spec and returns an agent; `params` holds the agent's
    JSON-ready settings. Treat params as immutable: change a spec with with_params, which returns a
    new spec."""

    builder: str
    params: Mapping[str, Any] = field(default_factory=dict)

    def with_params(self, **changes):
        """A new spec with `changes` merged over this spec's params."""
        return AgentSpec(self.builder, {**self.params, **changes})

    def canonical(self):
        """The spec as canonical JSON (sorted keys, compact separators): its identity in records
        and caches."""
        return json.dumps({"builder": self.builder, "params": self.params},
                          sort_keys=True, separators=(",", ":"))

    def as_json(self):
        """The spec as a JSON-ready dict (the parsed canonical form)."""
        return json.loads(self.canonical())


@dataclass(frozen=True)
class Decision:
    """Where an agent is asked to act: the game key (every random stream of the game derives from
    it), the 0-based decision index within the game, and the noise level r the game is played at."""

    key: int
    index: int
    noise: float


@runtime_checkable
class Agent(Protocol):
    """A policy. Agents are built by runner.build from an AgentSpec."""

    def reset(self, key):
        """Called by runner.play before every game, with its key; nothing may survive it from one
        game to the next."""

    def act(self, state, decision):
        """The game's decision state and a Decision -> the game's action."""


@runtime_checkable
class Target(Protocol):
    """A game plus an estimator. A target must be picklable (a module-level dataclass is), since
    runner.play sends it to worker processes; to be registered it must be a dataclass whose fields
    hold its settings (module docstring)."""

    name: str

    def play(self, agent, key):
        """Play one game with `agent` from game key `key` and return a JSON-ready record. The
        record holds no wall-clock time, machine name, process id or worker number."""

    def value(self, records):
        """The point estimate over a list of records: a Fraction, a float, math.inf or None."""


@runtime_checkable
class Lever(Protocol):
    """A named change to an agent; to be registered, a dataclass whose fields are the parameters of
    its change (as SetParams)."""

    name: str

    def apply(self, spec):
        """A new AgentSpec carrying this lever's change; the input spec is never changed."""


@dataclass(frozen=True)
class SetParams:
    """The common lever: set agent parameters. apply(spec) is spec.with_params(**params)."""

    name: str
    params: Mapping[str, Any]

    def apply(self, spec):
        """A new AgentSpec with this lever's params merged over the spec's."""
        return spec.with_params(**self.params)


@dataclass(frozen=True)
class Measurement:
    """A target's estimate over n games: the point, the percentile interval and the one-sided upper
    bound at level 1 - alpha from a whole-game bootstrap (`replicates` draws from `seed`), the
    bootstrap sd, the number of infinite replicates (estimate without a miss), and the number of
    undefined replicates (value() None on that resample; see measure.summary)."""

    target: str
    estimator: str
    point: Any
    interval: Tuple[Any, Any]
    upper: Any
    sd: Any
    n: int
    alpha: Fraction
    replicates: int
    seed: Any
    n_inf: int = 0
    n_undefined: int = 0

    def as_json(self):
        """A JSON-ready dict of every field (number forms as in the module docstring)."""
        return _fields_json(self)


@dataclass(frozen=True)
class PairedDelta:
    """value(arm records) - value(base records) over the same n keys, with its percentile interval
    at level 1 - alpha from a bootstrap that resamples keys, both arms of a key together
    (`replicates` draws from `seed`). A replicate in which both arms are infinite carries no
    difference and is counted in n_undecided; a one-sided infinity sorts to its end, so an interval
    bound beyond the finite replicates is infinite and decides nothing."""

    point: Any
    interval: Tuple[Any, Any]
    n: int
    alpha: Fraction
    replicates: int
    seed: Any
    n_undecided: int = 0

    def as_json(self):
        """A JSON-ready dict of every field (number forms as in the module docstring)."""
        return _fields_json(self)


def _decides(bound):
    """True for a bound that can decide: a number, neither infinite nor NaN."""
    if bound is None:
        return False
    if isinstance(bound, float):
        return math.isfinite(bound)
    return True


def _exact(number):
    """A number for exact comparison: str forms ('1/2', '0.05') as Fractions, numbers as they are."""
    return Fraction(number) if isinstance(number, str) else number


@dataclass(frozen=True)
class DecisionRule:
    """The rule that turns a paired difference into a decision, fixed before the run. With the
    interval at level 1 - alpha: adopt when its lower bound is above min_effect, kill when its upper
    bound is below min_effect, inconclusive otherwise; an infinite bound never decides."""

    alpha: Fraction = Fraction(1, 20)
    min_effect: Any = 0
    name: str = "paired-interval"

    def decide(self, delta):
        """ADOPT, KILL or INCONCLUSIVE for a PairedDelta; ValueError when the delta's alpha is not
        this rule's. Comparisons are exact (a float bound is compared by its exact value)."""
        if Fraction(delta.alpha) != Fraction(self.alpha):
            raise ValueError(f"the delta's interval is at alpha {delta.alpha}, "
                             f"this rule's is {self.alpha}")
        lower, upper = delta.interval
        threshold = _exact(self.min_effect)
        if _decides(lower) and lower > threshold:
            return ADOPT
        if _decides(upper) and upper < threshold:
            return KILL
        return INCONCLUSIVE

    def as_json(self):
        """A JSON-ready dict of every field (number forms as in the module docstring)."""
        return _fields_json(self)


@dataclass(frozen=True)
class StepResult:
    """One climb step: the target, the lever, both specs, the key namespace and count, both
    measurements, the paired difference, the rule and its decision, and the kernel build stamp the
    games ran on (None for a kernel-free target, one whose uses_kernel is False, or where the
    kernel binding is not installed)."""

    target: str
    lever: str
    base: AgentSpec
    arm: AgentSpec
    namespace: str
    n: int
    base_measurement: Measurement
    arm_measurement: Measurement
    delta: PairedDelta
    rule: DecisionRule
    decision: str
    kernel: Optional[str]

    def as_json(self):
        """A JSON-ready dict of every field (number forms as in the module docstring)."""
        return _fields_json(self)
