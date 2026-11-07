# Copyright (c) Meta Platforms, Inc. and affiliates.

"""A simulation-based hillclimb for billiards agents on the openbilliards kernel.

Point it at your own target. A target plays games with an agent and turns the games into a number
with an interval; a lever changes the agent; a climb step plays both arms on the same game keys
(common random numbers) and decides, by a rule fixed before the run, whether the lever is adopted.

Modules:
    adapter   the kernel adapter: states, a stroke, a simulated outcome (the only pool_py user)
    noise     stroke noise through the hand noise law
    crn       game keys, per-decision draw blocks and the paired compare
    runner    plays games on worker processes; the worker count never changes a result
    select    rollout scoring on one shared draw block, argmax and best-of-K refinement
    measure   run-length estimators through the run-length estimator
    protocol  the target, lever and agent protocols and the result records
    climb     the climb step, a small climb driver and the registration of a climb
    toy       a kernel-free toy target and agent, for trying the climb loop in seconds

Importing any of these needs only the Python standard library: the kernel binding and numerical
libraries are imported inside the functions that use them.
"""
