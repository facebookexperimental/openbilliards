# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Our learned files with their training code, and the demos.

    models    C2 and V, the two learned files of our 14.1 agents, with their evaluators and model
              cards
    training  the data generators and the trainers of C2 and V
    demos     the README's five steps on the toy target, a small kernel target on the 9-ball
              break, and the public smoke on the 14.1 base agent

The framework is hillclimb and our 14.1 configuration is straightpool. These three parts sit under
one package name so that an install adds no generic top-level package, such as models or training,
that could shadow one of the user's own.
"""
