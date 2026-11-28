# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The climb step and a small climb driver.

A climb step asks one question of one target: does this lever make the agent better? Both arms,
the base spec and lever.apply(base), play the same n keys of a fresh namespace (runner.play), each
is measured (measure.summary), their paired difference is taken (crn.paired_compare), and a
DecisionRule fixed before the run says adopt, kill or inconclusive. Write the rule, the namespace,
n and the seed down before you run (the README's pre-registration template is one page), and read
each step once: write_result refuses to overwrite a result.

climb() chains steps: lever i plays the keys of namespace '<namespace>/step-<i>', so no two steps
share keys, and an adopted lever becomes part of the base for the steps after it. Each step's
difference is its own; differences of separate steps are never added up.

register() writes a climb down before it runs: the target by its class and its settings (the
fields of the dataclass it is), the base, every lever by its class (the operation) and its fields
(the parameters), the namespace, n, the rule, the bootstrap seed and the replicate count, with an
empty result. climb(..., registration=path) then refuses to run unless its arguments equal that
registration, the target's settings and every lever's operation and parameters included, and the
result is still empty, and writes its result into the same file: one registration, one run, one
read. A single registered step is a climb of one lever.
"""

import dataclasses
import json
import os
import pathlib
import stat
import tempfile

from . import adapter, crn, measure, runner
from .protocol import ADOPT, StepResult, as_json_value


def _kernel_stamp(target):
    """The kernel build a target's games ran on: None for a target that declares it plays without
    the kernel (uses_kernel False), or where the kernel binding is not installed."""
    if not getattr(target, "uses_kernel", True) or not adapter.available():
        return None
    return adapter.kernel_version()


def climb_step(target, base, lever, *, namespace, n, rule, seed, workers=1,
               replicates=measure.REPLICATES):
    """One climb step on keys crn.game_keys(namespace, n). Returns a StepResult whose decision is
    rule.decide(delta), with the bootstrap of both measurements and of the difference drawn from
    `seed` (`replicates` draws each, at the rule's alpha) and the kernel build stamp the games ran
    on (None for a target whose uses_kernel is False). The measurements name the target's
    `estimator` attribute, or its class name."""
    keys = crn.game_keys(namespace, n)
    arm = lever.apply(base)
    records_base = runner.play(target, base, keys, workers=workers)
    records_arm = runner.play(target, arm, keys, workers=workers)
    estimator = str(getattr(target, "estimator", type(target).__name__))

    def measured(records):
        return measure.summary(records, target.value, target=target.name, estimator=estimator,
                               seed=seed, alpha=rule.alpha, replicates=replicates)

    delta = crn.paired_compare(records_base, records_arm, target.value, seed=seed,
                               alpha=rule.alpha, replicates=replicates)
    return StepResult(target=target.name, lever=lever.name, base=base, arm=arm,
                      namespace=namespace, n=int(n), base_measurement=measured(records_base),
                      arm_measurement=measured(records_arm), delta=delta, rule=rule,
                      decision=rule.decide(delta), kernel=_kernel_stamp(target))


def _written_down(obj, role):
    """How a registration holds a target or a lever: its name, its class as 'module:qualname' and
    its settings, the fields of the dataclass instance it must be (dataclasses.asdict), in the
    protocol's JSON-ready number forms. TypeError for anything else."""
    if not dataclasses.is_dataclass(obj) or isinstance(obj, type):
        raise TypeError(f"a registered {role} is a dataclass instance whose fields hold its "
                        f"settings; {type(obj).__qualname__} is not")
    kind = type(obj)
    return {"name": obj.name, "class": f"{kind.__module__}:{kind.__qualname__}",
            "settings": as_json_value(dataclasses.asdict(obj))}


def _registration(target, base, levers, *, namespace, n, rule, seed, replicates):
    """A climb's registration, JSON-ready (the form a registration file holds). TypeError when a
    setting or parameter has no JSON form."""
    entry = {
        "target": _written_down(target, "target"),
        "estimator": str(getattr(target, "estimator", type(target).__name__)),
        "base": base.as_json(),
        "levers": [_written_down(lever, "lever") for lever in levers],
        "namespace": namespace,
        "n": int(n),
        "rule": rule.as_json(),
        "seed": seed,
        "replicates": int(replicates),
    }
    return json.loads(json.dumps(entry))


def _dumps(payload):
    return json.dumps(payload, indent=1, sort_keys=True, allow_nan=False) + "\n"


def register(path, target, base, levers, *, namespace, n, rule, seed,
             replicates=measure.REPLICATES):
    """Write the registration of a climb (see the module docstring) to `path`, with "result": null,
    before anything runs; FileExistsError when the path exists. Returns the registration. What
    cannot be written down is refused before the file is created (TypeError for a value with no
    JSON form, ValueError for one that strict JSON cannot hold, such as NaN)."""
    entry = _registration(target, base, list(levers), namespace=namespace, n=n, rule=rule,
                          seed=seed, replicates=replicates)
    text = _dumps({"registration": entry, "result": None})
    with open(path, "x", encoding="utf-8") as handle:
        handle.write(text)
    return entry


def _check_registration(path, expected):
    """The registration file's payload, refused unless it registers `expected` and holds no
    result."""
    payload = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    found = payload.get("registration")
    if found != expected:
        differing = sorted(k for k in set(expected) | set(found or {})
                           if (found or {}).get(k) != expected.get(k))
        raise ValueError(f"the climb differs from its registration at {path} in {differing}")
    if payload.get("result") is not None:
        raise FileExistsError(f"the registration at {path} already holds its result: "
                              "a registered climb runs once")
    return payload


def _write_into(path, payload):
    """Replace the file at `path` by `payload` in one step (a temporary file beside it)."""
    path = pathlib.Path(path)
    handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent,
                                         prefix=path.name + ".", suffix=".tmp", delete=False)
    try:
        with handle:
            handle.write(_dumps(payload))
        os.chmod(handle.name, stat.S_IMODE(os.stat(path).st_mode))
        os.replace(handle.name, path)
    except BaseException:
        if os.path.exists(handle.name):
            os.unlink(handle.name)
        raise


def climb(target, base, levers, *, namespace, n, rule, seed, workers=1,
          replicates=measure.REPLICATES, registration=None):
    """Steps over `levers` in order, each on its own namespace '<namespace>/step-<i>'. Returns
    (the final base spec, the list of StepResults). With `registration` (a path written by
    register()), the climb first checks that its arguments are the registered ones and that no
    result is recorded yet (ValueError, FileExistsError), and afterwards writes its result into
    that file: the final spec and every step."""
    levers = list(levers)
    payload = None
    if registration is not None:
        payload = _check_registration(registration, _registration(
            target, base, levers, namespace=namespace, n=n, rule=rule, seed=seed,
            replicates=replicates))
    current, results = base, []
    for i, lever in enumerate(levers):
        result = climb_step(target, current, lever, namespace=f"{namespace}/step-{i}", n=n,
                            rule=rule, seed=seed, workers=workers, replicates=replicates)
        results.append(result)
        if result.decision == ADOPT:
            current = result.arm
    if payload is not None:
        payload["result"] = {"final": current.as_json(),
                             "steps": [result.as_json() for result in results]}
        _write_into(registration, payload)
    return current, results


def write_result(path, result):
    """Write result.as_json() to `path` as indented JSON with sorted keys; FileExistsError when the
    path exists (a step is read once)."""
    text = _dumps(result.as_json())
    with open(path, "x", encoding="utf-8") as handle:
        handle.write(text)
