# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Expected values that pass through libm or BLAS: exact where they were recorded, when asked for,
and within a tolerance otherwise.

The expected values of these tests were recorded on macOS on Apple silicon (arm64). A value
computed with the C math library (acos, asin, atan2, cos, exp, log1p, pow, sin) or with BLAS
(numpy's dot and matrix products) can differ in its last bits on another platform: glibc's libm
and OpenBLAS round some results differently from Apple's libm and Accelerate, and another macOS
build can too. Such values are pinned bit for bit only on the recording platform with
HILLCLIMB_EXACT_PINS=1 in the environment (EXACT_PINS); otherwise, CI included, they are checked
within TOLERANCE: the values themselves where a test keeps them (assert_close), or a fingerprint
where a test keeps only a digest (assert_fingerprint). Digests of file bytes, and of values made
only with the basic arithmetic, math.sqrt and Python's own math.hypot (which round alike
everywhere), stay exact on every platform.
"""

import hashlib
import json
import math
import os
import platform
import sys

#: The environment variable that turns the exact pins on (set it to 1 where they were recorded).
EXACT_PINS = "HILLCLIMB_EXACT_PINS"


def exact_pins_on(environ, system, machine):
    """Whether the exact pins are checked: EXACT_PINS is "1" in `environ` and the platform is the
    recording one, macOS (`system` "darwin", as sys.platform names it) on Apple silicon (`machine`
    "arm64", as platform.machine() names it)."""
    return environ.get(EXACT_PINS) == "1" and system == "darwin" and machine == "arm64"


#: True where the exact pins are checked: the recording platform with EXACT_PINS=1 set. The CI
#: workflow leaves it unset, so its runners, the macOS one included, take the tolerance branch.
RECORDED_HERE = exact_pins_on(os.environ, sys.platform, platform.machine())

#: The tolerance, relative (and absolute near zero). Last-bit differences are about 1e-16 of a
#: value; a change to any law moves the values by far more than 1e-9.
TOLERANCE = 1e-9


def _close(case, got, want, where):
    if isinstance(want, float) and isinstance(got, (int, float)) and not isinstance(got, bool):
        case.assertTrue(math.isclose(got, want, rel_tol=TOLERANCE, abs_tol=TOLERANCE),
                        f"{where}: {got!r} is not within {TOLERANCE} of {want!r}")
    elif isinstance(want, dict):
        case.assertIsInstance(got, dict, where)
        case.assertEqual(set(got), set(want), where)
        for key in want:
            _close(case, got[key], want[key], f"{where}[{key!r}]")
    elif isinstance(want, (list, tuple)):
        case.assertIsInstance(got, (list, tuple), where)
        case.assertEqual(isinstance(got, list), isinstance(want, list), where)
        case.assertEqual(len(got), len(want), where)
        for i, (g, w) in enumerate(zip(got, want)):
            _close(case, g, w, f"{where}[{i}]")
    else:
        case.assertEqual(got, want, where)


def assert_close(case, got, want):
    """got equals want where the exact pins are on (RECORDED_HERE); elsewhere their floats agree
    within TOLERANCE and everything else is equal (containers with their keys and lengths, ints,
    strings, booleans and None)."""
    if RECORDED_HERE:
        case.assertEqual(got, want)
    else:
        _close(case, got, want, "value")


def assert_digest(case, got, want):
    """A digest of values that pass through libm or BLAS equals the recorded one where the exact
    pins are on (RECORDED_HERE); elsewhere the test's tolerance checks stand in for it."""
    if RECORDED_HERE:
        case.assertEqual(got, want)


def _split(value):
    """(shape, floats): the canonical JSON of a JSON-ready value with every float written as 0.0,
    and its floats in the order of that JSON."""
    floats = []

    def strip(v):
        if isinstance(v, float):
            floats.append(float(v))
            return 0.0
        if isinstance(v, dict):
            items = sorted(((str(k), x) for k, x in v.items()), key=lambda item: item[0])
            return {k: strip(x) for k, x in items}
        if isinstance(v, (list, tuple)):
            return [strip(x) for x in v]
        return v

    return json.dumps(strip(value), sort_keys=True, separators=(",", ":")), floats


def fingerprint(value):
    """[shape, count, total, moment] of a JSON-ready value: the first 16 hex digits of SHA-256 over
    its canonical JSON with every float written as 0.0, the number of its floats, their sum, and
    their sum weighted by position (the k-th of n floats by k / n), both sums by math.fsum."""
    shape, floats = _split(value)
    n = len(floats)
    return [hashlib.sha256(shape.encode("utf-8")).hexdigest()[:16], n, math.fsum(floats),
            math.fsum(x * (k + 1) / n for k, x in enumerate(floats))]


def assert_fingerprint(case, value, want):
    """The fingerprint of `value` equals `want` where the exact pins are on (RECORDED_HERE);
    elsewhere the shape and the count are equal and both sums agree within TOLERANCE times the sum
    of the magnitudes."""
    got = fingerprint(value)
    message = f"fingerprint {got!r} is not the recorded {want!r}"
    if RECORDED_HERE:
        case.assertEqual(got, want, message)
        return
    case.assertEqual(got[:2], want[:2], message)
    bound = TOLERANCE * (math.fsum(abs(x) for x in _split(value)[1]) + 1.0)
    case.assertLessEqual(abs(got[2] - want[2]), bound, message)
    case.assertLessEqual(abs(got[3] - want[3]), bound, message)
