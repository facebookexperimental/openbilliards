# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Our configuration: 14.1 straight pool, the worked example of the framework.

    game        the solo high-run game: the opening break, calls, fouls, spot-back and re-rack,
                read off the kernel's events
    candidates  the stroke candidates of a position and their simulation-based selection
    envelope    the actuation envelope: the box of strokes an agent may command (v1, v2)
    targets     our targets: run length at a noise level, with its estimator, and the hard target
    base_agent  the labelled baseline agent that the README climb and the demo start from
                (its card: AGENT-CARD-base.md)
    leave       the leave surface: how good each cue-ball stop is after the declared shot

Everything physical comes from the kernel through hillclimb.adapter.
"""
