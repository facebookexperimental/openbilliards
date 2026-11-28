# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The leave surface: how good each cue-ball stop is after the declared shot.

A grid of 2 cm cells over the cloth whose value in [0, 1] scores a cue-ball rest: the makeability
of the next pot from there, or the cover a safety gives. It is painted per decision from the
position and the declared call, read by bilinear interpolation between cell centres, and used as
the weight W in the refinement objective E[pot x W(rest)] - lambda x P(foul). Pure plane geometry:
nothing here simulates. The surface only weights outcomes; every stroke it helps choose is
simulated in the kernel before it is played.

    brush     the makeability and safety fields, their composition, the grid and the frames
    laws      the closed-form choices behind a declaration (cut, makeability, pocket and side)
    painters  the declaration of a decision: call, leave target, brush program and grid
    wrapper   the open declaration of any window candidate, and the frame-true objective
    demo      draws the surface of one position as text or a PNG:
              python -m straightpool.leave.demo [--png PATH]
"""
