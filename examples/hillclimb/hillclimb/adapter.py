# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The kernel adapter: states, a stroke and a simulated outcome.

This is the only module of the package that imports pool_py, the Python binding of the
openbilliards kernel. Every trajectory, collision and pocket event comes from the kernel; nothing in
this package computes ball motion. pool_py is imported on first use, so the rest of the package,
and every kernel-free test, imports without it.

Frames and units are the kernel's. The table centre is the origin, x runs across the table (its
width) and y along it (its length); metres, seconds and radians. A stroke is (v0 m/s, phi rad,
theta rad, a, b) as in pool_py.Shot: the cue speed at impact, aim direction, cue elevation, and the
cue-tip offset in ball radii (a sideways, b up).

Determinism: a simulation is a pure function of (state, stroke, seed, options). The seed is always
explicit (the per-decision law is noise.shot_seed(game key, decision index)), and the default
options (default_options) are written out below so that no result rides a kernel default.
"""

import functools
import hashlib
import json
from dataclasses import dataclass, field
from typing import NamedTuple, Optional, Tuple

#: Kernel motion codes of a ball still on the cloth in a sampled record (stationary, spinning,
#: sliding, rolling): a ball whose final sample carries one of them is on the table.
SETTLED_MOTION = (0, 1, 2, 3)

#: The cluster model of every simulation run with default_options(): the kernel's compliant
#: multibody chain at its frozen defaults.
CLUSTER_MODEL = {"CompliantChain": {"dt": 1e-6, "max_steps": 3000, "k_hertz": 3.524e8}}

#: The rail contact seat of every simulation run with default_options(): the planar seat, under
#: which the published 14.1 numbers were measured.
RAIL_SEAT = "Planar"

#: The rack constructors State.rack accepts: the 15-ball triangle and the 9-ball diamond.
RACKS = ("fifteen", "nine")

_RACK_CONSTRUCTORS = {"fifteen": "fifteen_ball_rack", "nine": "nine_ball_rack"}
_MASK64 = (1 << 64) - 1


def available():
    """True when the kernel binding (pool_py) can be imported."""
    try:
        import pool_py  # noqa: F401
    except ImportError:
        return False
    return True


def _kernel():
    import pool_py
    return pool_py


def _canonical(data):
    """Compact JSON in the key order of `data` (for a parsed kernel state: the kernel's own)."""
    return json.dumps(data, separators=(",", ":"))


@dataclass(frozen=True)
class Stroke:
    """One cue strike in the kernel's units: v0 m/s, phi rad, theta rad, a and b in ball radii.

    The kernel accepts 0 < v0 <= 15, 0 <= theta < pi/2 and a tip offset within its miscue limit,
    a**2 + b**2 <= (cap * (1 + tip_radius / R))**2 for the cue's contact cap and tip radius and
    the ball radius R: about 0.685 ball radii with the kernel's default cue. noise.project_stroke
    maps any finite stroke into that domain, its tip offset inside half a ball radius."""

    v0: float
    phi: float
    theta: float = 0.0
    a: float = 0.0
    b: float = 0.0

    def as_tuple(self):
        """(v0, phi, theta, a, b) as floats."""
        return (float(self.v0), float(self.phi), float(self.theta), float(self.a), float(self.b))

    @classmethod
    def of(cls, values):
        """A stroke from five numbers in the order (v0, phi, theta, a, b)."""
        v0, phi, theta, a, b = (float(x) for x in values)
        return cls(v0, phi, theta, a, b)


@dataclass(frozen=True)
class Table:
    """The playing surface of a state: its width (x extent) and length (y extent) in metres, the
    ball radius, and the pocket centres (x, y) in the kernel's pocket order."""

    width: float
    length: float
    ball_radius: float
    pockets: Tuple[Tuple[float, float], ...]


class Event(NamedTuple):
    """One event of a kernel shot record: its kind as the kernel names it ('ball_ball',
    'ball_pocket', 'ball_off_table', 'ball_linear_cushion', 'ball_circular_cushion', ...), its time
    in seconds, the ball ids it involves (one or two, in the kernel's order), and the pocket index
    of a pocket event (None otherwise)."""

    kind: str
    t: float
    balls: Tuple[int, ...]
    pocket: Optional[int] = None


def _stationary(template, x, y):
    """A copy of a kernel ball entry, at rest at (x, y) on the cloth: its parameters kept, its
    position set (z = its radius), velocities zeroed, motion stationary, contact memory dropped."""
    entry = json.loads(json.dumps(template))
    entry["state"]["pos"] = {"x": float(x), "y": float(y), "z": float(entry["params"]["r"])}
    entry["state"]["vel"] = {"x": 0.0, "y": 0.0, "z": 0.0}
    entry["state"]["avel"] = {"x": 0.0, "y": 0.0, "z": 0.0}
    entry["state"]["motion"] = "Stationary"
    entry["state"].pop("pinch", None)
    return entry


@dataclass(frozen=True)
class State:
    """A table position: the kernel's system state as compact JSON (separators (',', ':')) in the
    kernel's own key order, so equal positions have equal text and equal digests."""

    json: str

    @classmethod
    def rack(cls, kind, seed):
        """The kernel's seeded rack of `kind` (one of RACKS), cue ball included, its balls in the
        kernel's order (with_positions writes them in ascending id order); the seed is reduced
        mod 2**64."""
        if kind not in _RACK_CONSTRUCTORS:
            raise ValueError(f"unknown rack {kind!r}; the racks are {RACKS}")
        constructor = getattr(_kernel().SystemState, _RACK_CONSTRUCTORS[kind])
        return cls(_canonical(json.loads(constructor(int(seed) & _MASK64).to_json())))

    def _data(self):
        return json.loads(self.json)

    def positions(self):
        """{ball id: (x, y)} of every ball in the state, in ascending id order."""
        found = {int(b["id"]): (float(b["state"]["pos"]["x"]), float(b["state"]["pos"]["y"]))
                 for b in self._data()["balls"]}
        return dict(sorted(found.items()))

    def table(self):
        """The state's Table, read from its own table record (never hard-coded); the ball radius
        is the one radius of its balls (ValueError for a state without balls or with two radii)."""
        data = self._data()
        radii = {float(b["params"]["r"]) for b in data["balls"]}
        if len(radii) != 1:
            raise ValueError(f"a Table needs one ball radius; this state has {sorted(radii)}")
        table = data["table"]
        pockets = tuple((float(p["center"]["x"]), float(p["center"]["y"]))
                        for p in table["pockets"])
        return Table(float(table["width"]), float(table["length"]), radii.pop(), pockets)

    def with_positions(self, positions, templates=None):
        """A new state whose balls are exactly the ids of `positions`, each stationary at its
        (x, y). A ball keeps its parameters from this state, or from `templates` (another State,
        such as the opening rack) when this state lacks it, as when the cue ball comes back after a
        scratch. The table is unchanged. An id found in neither state raises KeyError."""
        data = self._data()
        own = {int(b["id"]): b for b in data["balls"]}
        spare = {} if templates is None else {int(b["id"]): b for b in templates._data()["balls"]}
        wanted = {int(ball): xy for ball, xy in positions.items()}
        balls = []
        for ball in sorted(wanted):
            template = own.get(ball, spare.get(ball))
            if template is None:
                raise KeyError(f"ball {ball} is in neither this state nor the templates")
            x, y = wanted[ball]
            balls.append(_stationary(template, x, y))
        data["balls"] = balls
        return State(_canonical(data))

    def digest(self):
        """The first 16 hex digits of SHA-256 over the state's JSON text."""
        return hashlib.sha256(self.json.encode("utf-8")).hexdigest()[:16]


@dataclass(frozen=True)
class Outcome:
    """What the kernel says happened to one stroke.

    events        the record's events, in time order
    rest          (ball id, x, y) of every ball still on the table when the record ends, ascending id
    pocketed      (ball id, pocket index) of every pocket event, in time order
    off_table     ids of the balls that left the table, in time order
    first_contact the first ball the cue ball (the struck ball) touched, or None
    truncated     None for a simulated stroke; the kernel's message when it refused the stroke
                  (invalid input or an exhausted event budget), in which case every other field is
                  empty and the stroke counts as failed under the caller's rules
    record_json   the kernel's shot record as JSON when the simulation was asked to keep it
                  (keep_record=True), for rules_judge; None otherwise. Not part of equality."""

    events: Tuple[Event, ...]
    rest: Tuple[Tuple[int, float, float], ...]
    pocketed: Tuple[Tuple[int, int], ...]
    off_table: Tuple[int, ...]
    first_contact: Optional[int]
    truncated: Optional[str] = None
    record_json: Optional[str] = field(default=None, compare=False, repr=False)

    def positions(self):
        """{ball id: (x, y)} of the balls at rest on the table."""
        return {ball: (x, y) for ball, x, y in self.rest}


def _refused(message):
    return Outcome(events=(), rest=(), pocketed=(), off_table=(), first_contact=None,
                   truncated=str(message))


def _outcome(record, keep_record):
    """The Outcome of a kernel shot record."""
    events, pocketed, off_table = [], [], []
    cue, first_contact = 0, None
    for e in record.events():
        kind = e["kind"]
        if kind == "ball_ball":
            balls = (int(e["b1"]), int(e["b2"]))
        elif "ball" in e:
            balls = (int(e["ball"]),)
        else:
            balls = ()
        pocket = int(e["pocket"]) if kind == "ball_pocket" else None
        if kind == "strike":
            cue = balls[0]
        elif kind == "ball_ball":
            if first_contact is None and cue in balls:
                first_contact = balls[1] if balls[0] == cue else balls[0]
        elif kind == "ball_pocket":
            pocketed.append((balls[0], pocket))
        elif kind == "ball_off_table":
            off_table.append(balls[0])
        events.append(Event(kind, float(e["t"]), balls, pocket))
    final = record.sample(record.duration)
    rest = sorted((int(ball), float(final[row][0]), float(final[row][1]))
                  for row, ball in enumerate(record.ball_ids())
                  if int(final[row][7]) in SETTLED_MOTION)
    return Outcome(events=tuple(events), rest=tuple(rest), pocketed=tuple(pocketed),
                   off_table=tuple(off_table), first_contact=first_contact,
                   record_json=record.to_json() if keep_record else None)


@functools.lru_cache(maxsize=None)
def _default_options():
    pool_py = _kernel()
    payload = json.loads(pool_py.SimOptions().to_json())
    payload["cluster_model"] = CLUSTER_MODEL
    payload["rail_seat"] = RAIL_SEAT
    return pool_py.SimOptions.from_json(json.dumps(payload))


def default_options():
    """The default simulation options: pool_py.SimOptions with CLUSTER_MODEL and RAIL_SEAT written
    in explicitly; every other setting is the kernel's."""
    return _default_options()


def _shot(pool_py, stroke, seed):
    v0, phi, theta, a, b = stroke.as_tuple() if isinstance(stroke, Stroke) else Stroke.of(
        stroke).as_tuple()
    return pool_py.Shot(v0, phi, theta=theta, a=a, b=b, seed=int(seed) & _MASK64)


def simulate(state, stroke, *, seed, options=None, keep_record=False):
    """Simulate one stroke from `state` with kernel seed `seed` (an integer reduced mod 2**64) under
    `options` (default: default_options()). Returns an Outcome; a kernel refusal (ValueError for
    invalid input, RuntimeError for an exhausted event budget) returns a truncated Outcome instead
    of raising. keep_record=True keeps the kernel's record in Outcome.record_json. A state the
    kernel cannot parse raises: it is the caller's error, not the stroke's."""
    pool_py = _kernel()
    system = pool_py.SystemState.from_json(state.json)
    options = default_options() if options is None else options
    try:
        record = pool_py.simulate(system, _shot(pool_py, stroke, seed), options)
    except (ValueError, RuntimeError) as refusal:
        return _refused(refusal)
    return _outcome(record, keep_record)


def simulate_many(jobs, *, options=None, threads=1, keep_record=False):
    """Simulate a list of (state, stroke, seed) jobs; result i is job i whatever the thread count.

    Runs through the kernel's batch call, which releases the interpreter lock; one refused job
    yields a truncated Outcome in its own slot and never shifts the others (the batch call stops at
    a refusal, so the jobs are then simulated one by one). `threads` (at least 1) changes only
    speed, never a result."""
    pool_py = _kernel()
    options = default_options() if options is None else options
    parsed, scenarios = {}, []
    for state, stroke, seed in jobs:
        if state.json not in parsed:
            parsed[state.json] = pool_py.SystemState.from_json(state.json)
        scenarios.append((parsed[state.json], _shot(pool_py, stroke, seed)))
    try:
        records = pool_py.batch_simulate(scenarios, options=options, threads=max(1, int(threads)))
    except (ValueError, RuntimeError):
        records = None
    if records is not None:
        return [_outcome(record, keep_record) for record in records]
    outcomes = []
    for system, shot in scenarios:
        try:
            record = pool_py.simulate(system, shot, options)
        except (ValueError, RuntimeError) as refusal:
            outcomes.append(_refused(refusal))
            continue
        outcomes.append(_outcome(record, keep_record))
    return outcomes


def rules_judge(ruleset, rules_state, outcome, call=None):
    """The kernel rules crate's judgment (pool_py.rules_judge_json, parsed) of an Outcome simulated
    with keep_record=True, under `ruleset`, the rules state JSON text `rules_state`, and the
    ruleset's call payload `call` (None sends 'null'; JSON text is sent as it is, anything else as
    compact JSON). ValueError for an outcome without a record (a truncated one included)."""
    if outcome.record_json is None:
        raise ValueError("rules_judge needs the kernel's record: simulate with keep_record=True")
    if call is None:
        call_json = "null"
    elif isinstance(call, str):
        call_json = call
    else:
        call_json = _canonical(call)
    return json.loads(_kernel().rules_judge_json(ruleset, rules_state, outcome.record_json,
                                                 call_json))


def min_elevation_deg(state, stroke):
    """The kernel's cue-clearance floor in degrees: the smallest cue elevation at which the cue clears
    the rails and every other ball for this cue-ball position, aim and tip offset."""
    pool_py = _kernel()
    return float(pool_py.min_elevation_deg(pool_py.SystemState.from_json(state.json),
                                           _shot(pool_py, stroke, 0)))


def kernel_version():
    """The kernel build stamp pool_py reports, for run records."""
    return str(_kernel().kernel_version())
