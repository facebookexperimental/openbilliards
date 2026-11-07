# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The actuation envelope: the box of strokes an agent may command.

The envelope bounds the stroke an agent commands: it keeps the cue speed v0 within the game's
own power range (v2 raises the cap at a break decision) and limits the cue elevation and the tip
offset. It binds the commanded stroke only, at enumeration time: candidate strokes and refinement
proposals are clamped into the box (clamp), and a stroke is played only when it is inside (inside).
The kernel and the noise projection stay permissive, so execution noise after the command may carry
a stroke outside the box: that is the player's own error, and legal.

Two versions, both data here:

    v1  v0 in [0.5, 12.0] m/s, the game's own cue-power range; theta from the cue-clearance floor
        up to 89 deg (players jump and masse, so only the last degree before vertical is out);
        the tip offset within 0.5 ball radii radially; phi free.
    v2  v1 with one change, at a break decision (the first decision after a re-rack): v0 up to
        13.4 m/s. Envelope v2 adopts 13.4 m/s as its break cap on v0: about 30 mph (13.41 m/s)
        rounded down, the top of the 25-30 mph range of cue-ball speeds that D. G. Alciatore's
        break-speed FAQ gives for typical top professional breaks
        (https://drdavepoolinfo.com/faq/break/speed/).

Both caps bound the cue speed v0, not the cue ball's speed: on the kernel, with its default
strike options and a centre hit, the cue ball leaves the tip at about 1.54 times v0, so a break
at v2's cap sends it off at about 46 mph and a stroke at v1's 12.0 m/s cap at about 41 mph,
above the FAQ's range.

The lower bound on theta is the cue-clearance floor of the position (hillclimb.adapter
.min_elevation_deg: the least elevation at which the cue clears the rails and the other balls).
reseed() raises a stroke that does not clear it to the floor plus RESEED_MARGIN_DEG, the way the
validate-then-reseed seat of our later agents does; clamp() alone leaves the floor to the caller.

Strokes are hillclimb.adapter.Stroke (theta in radians); clamp and inside also take five numbers.
"""

import math
from dataclasses import dataclass

from hillclimb.adapter import Stroke

#: The decision kind that takes v2's break row.
BREAK = "break"

#: The decision kinds: the first decision after a re-rack, two object balls left, anything else.
KINDS = (BREAK, "t14", "other")

#: Degrees above the cue-clearance floor a re-seeded stroke is raised to.
RESEED_MARGIN_DEG = 0.5

#: The tolerance, in degrees, of a stroke struck exactly at its floor.
FLOOR_TOL_DEG = 1e-9


@dataclass(frozen=True)
class Envelope:
    """One version of the box: its name, the commanded v0 range in m/s at an ordinary decision
    and its cap at a break decision, the largest cue elevation in degrees, and the largest tip
    offset in ball radii (radial)."""

    name: str
    v0_min: float
    v0_max: float
    v0_max_break: float
    theta_max_deg: float
    tip_max: float

    def v0_cap(self, kind):
        """The v0 cap at a decision of this kind (an unknown kind takes the ordinary cap)."""
        return self.v0_max_break if kind == BREAK else self.v0_max


V1 = Envelope("v1", 0.5, 12.0, 12.0, 89.0, 0.5)
V2 = Envelope("v2", 0.5, 12.0, 13.4, 89.0, 0.5)

#: The versions by name; v1 is the default preset.
ENVELOPES = {"v1": V1, "v2": V2}


def of(name):
    """The Envelope named `name` ('v1' or 'v2'); KeyError otherwise."""
    if name not in ENVELOPES:
        raise KeyError(f"unknown envelope {name!r}; the versions are {sorted(ENVELOPES)}")
    return ENVELOPES[name]


def _entries(stroke):
    values = stroke.as_tuple() if isinstance(stroke, Stroke) else tuple(float(x) for x in stroke)
    if len(values) != 5:
        raise ValueError(f"a stroke has 5 entries (v0, phi, theta, a, b), got {len(values)}")
    return values


def decision_kind(game):
    """The kind of a straightpool.game.Game's decision: 'break' at the first decision after a
    re-rack, 't14' with two object balls on the table, 'other' otherwise."""
    if game.rack_untouched:
        return BREAK
    objects = sum(1 for ball in game.state.positions() if ball != 0)
    return "t14" if objects == 2 else "other"


def clamp(envelope, stroke, kind="other"):
    """The Stroke inside the box nearest by entry: the tip offset scaled radially onto tip_max
    when beyond it (an ulp further in when rounding would leave it outside, so the result is
    inside() and a second clamp changes nothing), then v0 into [v0_min, the kind's cap] and theta
    into [0, theta_max_deg]; phi unchanged. Total on finite strokes; the cue-clearance floor is
    not applied here."""
    v0, phi, theta, a0, b0 = _entries(stroke)
    a, b = a0, b0
    tip = math.hypot(a0, b0)
    if tip > envelope.tip_max:
        scale = envelope.tip_max / tip
        a, b = a0 * scale, b0 * scale
        while math.hypot(a, b) > envelope.tip_max:  # rounding left the scaled tip an ulp outside
            scale = math.nextafter(scale, 0.0)
            a, b = a0 * scale, b0 * scale
    v0 = min(max(v0, envelope.v0_min), envelope.v0_cap(kind))
    theta = min(max(theta, 0.0), math.radians(envelope.theta_max_deg))
    return Stroke(v0, phi, theta, a, b)


def inside(envelope, stroke, kind="other", floor_deg=None):
    """True when the commanded stroke is inside the box at a decision of this kind: v0 in
    [v0_min, the kind's cap], theta in [0, theta_max_deg], the tip offset within tip_max; with
    floor_deg (the position's cue-clearance floor in degrees) theta must also clear the floor."""
    v0, _phi, theta, a, b = _entries(stroke)
    ok = (envelope.v0_min <= v0 <= envelope.v0_cap(kind)
          and 0.0 <= theta <= math.radians(envelope.theta_max_deg)
          and math.hypot(a, b) <= envelope.tip_max)
    if floor_deg is None:
        return bool(ok)
    floor = float(floor_deg)
    return bool(ok and math.isfinite(floor) and math.degrees(theta) >= floor - FLOOR_TOL_DEG)


def reseed(stroke, floor_deg, margin_deg=RESEED_MARGIN_DEG):
    """The stroke unchanged when its theta clears the cue-clearance floor `floor_deg` (degrees),
    else with theta raised to floor_deg + margin_deg. Every other entry is kept."""
    v0, phi, theta, a, b = _entries(stroke)
    floor = float(floor_deg)
    if math.degrees(theta) >= floor - FLOOR_TOL_DEG:
        return Stroke(v0, phi, theta, a, b)
    return Stroke(v0, phi, math.radians(floor + float(margin_deg)), a, b)
