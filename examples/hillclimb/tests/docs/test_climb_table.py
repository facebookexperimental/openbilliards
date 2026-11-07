# Copyright (c) Meta Platforms, Inc. and affiliates.

"""climb_table.csv: whitelisted fields only, well-formed values, in-envelope lines first.

The table is built from a whitelist of fields: the record key, the date, the point, the interval,
n, the estimator class, the envelope status and the noise level of the ICGA convention. Nothing
else may enter it, and every number is printed only at a public noise level."""

import datetime
import re
import unittest
from decimal import Decimal

from tests.docs import support

ESTIMATORS = {"cmc", "mean", "paired-cmc", "paired-mean", "cmc-p45", "indicator-p45"}
LEVELS = {"cmc", "mean"}
ENVELOPES = ("in-envelope-v2", "in-envelope-v1", "out-of-envelope")
PUBLIC_NOISE = {Decimal("0.1"), Decimal("0.25"), Decimal("0.4")}
KEY = re.compile(r"internal research log, row [1-9][0-9]*")
NUMBER = re.compile(r"-?[0-9]+(\.[0-9]+)?")


class ClimbTableTest(unittest.TestCase):
    def setUp(self):
        self.header, self.rows = support.climb_table()

    def test_the_header_is_the_whitelist(self):
        self.assertEqual(self.header, support.WHITELIST)

    def test_the_file_is_plain_ascii_text(self):
        raw = (support.HC / "climb_table.csv").read_bytes()
        raw.decode("ascii")
        self.assertNotIn(b"\r", raw)
        self.assertTrue(raw.endswith(b"\n"))

    def test_no_long_integer_anywhere(self):
        # Keys, seeds and ranges of the research records never enter the table.
        text = (support.HC / "climb_table.csv").read_text(encoding="ascii")
        self.assertIsNone(re.search(r"(?<![0-9.])[0-9]{5,}(?![0-9.])", text))

    def test_every_value_is_well_formed(self):
        for row in self.rows:
            with self.subTest(row=row):
                self.assertEqual(len(row), len(support.WHITELIST))
                self.assertTrue(KEY.fullmatch(row["key"]))
                datetime.date.fromisoformat(row["date"])
                for field in ("point", "ci_low", "ci_high", "ci_level"):
                    if field == "point" or row[field]:
                        self.assertTrue(NUMBER.fullmatch(row[field]), field)
                self.assertTrue(re.fullmatch(r"[1-9][0-9]*", row["n"]))
                self.assertIn(row["estimator"], ESTIMATORS)
                self.assertIn(row["envelope"], ENVELOPES)
                self.assertIn(Decimal(row["icga_v1_r"]), PUBLIC_NOISE)

    def test_intervals_hold_their_point(self):
        for row in self.rows:
            with self.subTest(row=row):
                point = Decimal(row["point"])
                low, high, level = row["ci_low"], row["ci_high"], row["ci_level"]
                if not (low or high):
                    self.assertEqual(level, "")
                    continue
                self.assertTrue(high, "a lower bound needs its upper bound")
                self.assertLess(Decimal(0), Decimal(level))
                self.assertLess(Decimal(level), Decimal(1))
                self.assertLessEqual(point, Decimal(high))
                if low:
                    self.assertLessEqual(Decimal(low), point)

    def test_probabilities_are_probabilities(self):
        for row in self.rows:
            if row["estimator"].endswith("p45"):
                with self.subTest(row=row):
                    self.assertTrue(Decimal(0) <= Decimal(row["point"]) <= Decimal(1))

    def test_one_line_per_record_and_estimator(self):
        pairs = [(row["key"], row["estimator"]) for row in self.rows]
        self.assertEqual(len(pairs), len(set(pairs)))

    def test_every_record_has_its_level(self):
        keys = {row["key"] for row in self.rows}
        with_level = {row["key"] for row in self.rows if row["estimator"] in LEVELS}
        self.assertEqual(keys, with_level)

    def test_in_envelope_lines_come_first_newest_first(self):
        in_envelope = [i for i, row in enumerate(self.rows) if row["envelope"] != ENVELOPES[2]]
        self.assertTrue(in_envelope, "the table states the in-envelope results")
        self.assertEqual(in_envelope, list(range(len(in_envelope))))
        for group in (self.rows[:len(in_envelope)], self.rows[len(in_envelope):]):
            dates = [row["date"] for row in group]
            self.assertEqual(dates, sorted(dates, reverse=True))


if __name__ == "__main__":
    unittest.main()
