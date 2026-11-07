# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Stroke noise through the hand noise law.

The law lives in the sibling example hand-noise-law: zero-mean Gaussian errors on (v0, phi,
theta, a, b) at a level r of the ICGA computational-pool convention, drawn from a counter-based
SplitMix64 stream keyed by (game key, decision index), then a total projection into the kernel's
stroke domain. r = 1 is the convention's own scale; the published 14.1 numbers are at r = 0.1.
This module re-exports what the package uses and adds the Stroke-typed forms. The shape argument
is the law's ('off' is the convention alone; see the law's README for the hand channels). The
law's 'physics' channel acts on the kernel state and options, not on the stroke: to play under it,
build the drawn state and options with the law's physics_state and physics_options and pass them to
the adapter.
"""

from . import _siblings
from .adapter import Stroke

_law = _siblings.load("hand_noise_law")
_stream = _siblings.load("noise_stream")

#: The convention at level 1 as applied, in the stroke's units (m/s, rad, rad, R, R).
SIGMA_1X = _law.SIGMA_1X

#: The law's identifier, for run records.
LAW_ID = _law.LAW_ID

#: standard_normals(key, decision_index): the five standard normals of a decision.
standard_normals = _stream.standard_normals

#: shot_seed(key, decision_index): the kernel seed of a decision's simulated stroke.
shot_seed = _stream.shot_seed

#: project_stroke(stroke): the total projection of a 5- or 7-entry stroke into the kernel's domain.
project_stroke = _law.project_stroke


def _entries(stroke):
    return stroke.as_tuple() if isinstance(stroke, Stroke) else tuple(float(x) for x in stroke)


def perturb(stroke, eps, r, shape="off"):
    """The Stroke a commanded `stroke` becomes under the five normals `eps` at level `r`: the law's
    noisy_stroke in `shape`, then project_stroke. At r == 0 the stroke is only projected. Used for
    rollouts, where eps is a draw of the decision's shared block (crn.draw)."""
    return Stroke.of(project_stroke(_law.noisy_stroke(_entries(stroke), eps, r, shape)))


def execute(stroke, key, decision_index, r, shape="off", place=None):
    """The executed form of a decision's commanded stroke: the stream's normals at (key,
    decision_index), the law at level r in `shape`, then the projection; a ball-in-hand placement
    `place` (x, y) is copied unchanged. Returns (Stroke, place), place as two floats or None.

    This is the law's own executor (hand_noise_law.make_executor) on the 7-entry action: unlike
    perturb, it evaluates the noise term at r == 0 too, so a -0.0 entry executes as 0.0."""
    placement = (0.0, 0.0) if place is None else tuple(float(x) for x in place)
    action = list(_entries(stroke)) + list(placement)
    executed = project_stroke(_law.noisy_action(action, standard_normals(key, int(decision_index)),
                                                r, shape))
    return Stroke.of(executed[:5]), (None if place is None else (executed[5], executed[6]))
