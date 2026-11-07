# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Play games on worker processes; the worker count never changes a result.

The law every caller, target and agent keeps:

1. One task per game key. Tasks run in this process or on a pool of spawned processes, and their
   results come back in input order, never in completion order.
2. Every random number a game uses derives from its key (see crn), never from a worker, a process
   id, the clock or a global random state.
3. An agent is built inside the worker from its picklable AgentSpec, once per worker and spec, and
   reset(key) before every game; it keeps nothing from one game to the next.
4. A record holds no wall-clock time, machine name, process id or worker number.
5. workers <= 1 runs the same task function in this process.

So play(target, spec, keys, workers=1) and play(target, spec, keys, workers=8) return equal
records, byte for byte as canonical JSON. The kernel's batch threads keep this too: in
adapter.simulate_many, result i is job i whatever the thread count.

Workers are started with the spawn method on every platform, so each one imports the calling
script as a module: a script that runs games with workers > 1 keeps its top-level code under
`if __name__ == "__main__":`.
"""

import importlib
import multiprocessing
from concurrent.futures import ProcessPoolExecutor

#: Agents built in this process, by canonical spec, oldest first (law 3); a few are kept.
_AGENTS = {}
_AGENTS_KEPT = 8


def run(fn, tasks, *, workers=1):
    """[fn(task) for task in tasks], computed in this process when workers <= 1 (or with fewer
    than two tasks) and otherwise on min(workers, len(tasks)) spawned processes, returned in task
    order. fn must be a module-level function and every task picklable; an exception in a task is
    raised here."""
    tasks = list(tasks)
    if workers is None or int(workers) <= 1 or len(tasks) < 2:
        return [fn(task) for task in tasks]
    context = multiprocessing.get_context("spawn")
    with ProcessPoolExecutor(max_workers=min(int(workers), len(tasks)),
                             mp_context=context) as pool:
        return list(pool.map(fn, tasks))


def build(spec):
    """The agent an AgentSpec describes: import the module of spec.builder ('package.module:
    function') and call the function with the spec."""
    module_name, colon, function_name = spec.builder.partition(":")
    if not colon or not module_name or not function_name:
        raise ValueError(f"a builder is 'package.module:function', got {spec.builder!r}")
    return getattr(importlib.import_module(module_name), function_name)(spec)


def _agent(spec):
    """This process's agent for `spec`, built on first use and kept for later games."""
    key = spec.canonical()
    agent = _AGENTS.get(key)
    if agent is None:
        agent = build(spec)
        if len(_AGENTS) >= _AGENTS_KEPT:
            del _AGENTS[next(iter(_AGENTS))]
        _AGENTS[key] = agent
    return agent


def _play_one(task):
    """One game: (target, spec, key) -> the target's record."""
    target, spec, key = task
    agent = _agent(spec)
    agent.reset(key)
    return target.play(agent, key)


def play(target, spec, keys, *, workers=1):
    """One game per key: agent.reset(key), then target.play(agent, key), with the agent built from
    `spec` in the worker (cached per worker and spec.canonical()). Returns the records in key
    order."""
    return run(_play_one, [(target, spec, key) for key in keys], workers=workers)
