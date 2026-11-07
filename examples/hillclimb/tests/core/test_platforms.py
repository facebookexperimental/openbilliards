# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The checks of values that pass through libm or BLAS (tests/platforms.py), on both branches: exact
where the expected values were recorded and HILLCLIMB_EXACT_PINS=1 is set, within the tolerance
otherwise. Every platform runs both, so the branch other platforms take is tested here too, and so
is the rule that picks the branch."""

import math
import unittest
from unittest import mock

from tests import platforms

VALUE = {"a": [0.1, 2, "x", None, True], "b": (1.5, [-0.25, 3.0])}


def nudged(value):
    """`value` with every float moved to its neighbouring double, as another libm might round it."""
    if isinstance(value, float):
        return math.nextafter(value, math.inf)
    if isinstance(value, dict):
        return {k: nudged(v) for k, v in value.items()}
    if isinstance(value, list):
        return [nudged(v) for v in value]
    if isinstance(value, tuple):
        return tuple(nudged(v) for v in value)
    return value


def recorded(flag):
    return mock.patch.object(platforms, "RECORDED_HERE", flag)


class ExactPinsTest(unittest.TestCase):
    def test_exact_only_where_recorded_and_asked_for(self):
        asked = {platforms.EXACT_PINS: "1"}
        self.assertTrue(platforms.exact_pins_on(asked, "darwin", "arm64"))
        for environ, system, machine in (({}, "darwin", "arm64"),
                                         ({platforms.EXACT_PINS: "0"}, "darwin", "arm64"),
                                         ({platforms.EXACT_PINS: ""}, "darwin", "arm64"),
                                         (asked, "darwin", "x86_64"),
                                         (asked, "linux", "x86_64"),
                                         (asked, "linux", "aarch64")):
            with self.subTest(environ=environ, system=system, machine=machine):
                self.assertFalse(platforms.exact_pins_on(environ, system, machine))


class CloseTest(unittest.TestCase):
    def test_exact_where_recorded(self):
        with recorded(True):
            platforms.assert_close(self, VALUE, VALUE)
            with self.assertRaises(AssertionError):
                platforms.assert_close(self, nudged(VALUE), VALUE)

    def test_within_the_tolerance_elsewhere(self):
        with recorded(False):
            platforms.assert_close(self, nudged(VALUE), VALUE)
            platforms.assert_close(self, 1e-12, 0.0)
            for wrong in (dict(VALUE, a=[0.1 * (1 + 1e-6), 2, "x", None, True]),
                          dict(VALUE, a=[0.1, 3, "x", None, True]),
                          dict(VALUE, a=[0.1, 2, "y", None, True]),
                          dict(VALUE, a=[0.1, 2, "x", None, False]),
                          dict(VALUE, a=[0.1, 2, "x", None]),
                          dict(VALUE, a=(0.1, 2, "x", None, True)),
                          dict(VALUE, c=1.0)):
                with self.subTest(wrong=wrong), self.assertRaises(AssertionError):
                    platforms.assert_close(self, wrong, VALUE)

    def test_a_digest_is_checked_only_where_recorded(self):
        with recorded(True), self.assertRaises(AssertionError):
            platforms.assert_digest(self, "0123456789abcdef", "fedcba9876543210")
        with recorded(False):
            platforms.assert_digest(self, "0123456789abcdef", "fedcba9876543210")


class FingerprintTest(unittest.TestCase):
    def test_the_fingerprint_law(self):
        shape, count, total, moment = platforms.fingerprint([0.5, [2, 1.5], None])
        self.assertEqual((count, total, moment), (2, 2.0, 0.5 * 1 / 2 + 1.5 * 2 / 2))
        self.assertEqual(platforms.fingerprint([0.25, [2, -7.0], None])[0], shape)
        self.assertNotEqual(platforms.fingerprint([0.5, [2.0, 1.5], None])[0], shape)
        self.assertNotEqual(platforms.fingerprint([0.5, [3, 1.5], None])[0], shape)
        self.assertNotEqual(platforms.fingerprint([1.5, 0.5, [2], None])[3], moment)
        self.assertEqual(platforms.fingerprint([])[1:], [0, 0.0, 0.0])

    def test_exact_where_recorded(self):
        want = platforms.fingerprint(VALUE)
        with recorded(True):
            platforms.assert_fingerprint(self, VALUE, want)
            with self.assertRaises(AssertionError):
                platforms.assert_fingerprint(self, nudged(VALUE), want)

    def test_within_the_tolerance_elsewhere(self):
        want = platforms.fingerprint(VALUE)
        with recorded(False):
            platforms.assert_fingerprint(self, nudged(VALUE), want)
            for wrong in (dict(VALUE, b=(1.5 + 1e-6, [-0.25, 3.0])),
                          dict(VALUE, b=(1.5, [3.0, -0.25])),
                          dict(VALUE, a=[0.1, 3, "x", None, True]),
                          dict(VALUE, b=(1.5, [-0.25, 3.0, 0.0]))):
                with self.subTest(wrong=wrong), self.assertRaises(AssertionError):
                    platforms.assert_fingerprint(self, wrong, want)


if __name__ == "__main__":
    unittest.main()
