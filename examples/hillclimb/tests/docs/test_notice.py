# Copyright (c) Meta Platforms, Inc. and affiliates.

"""NOTICE: plain ASCII, every pinned dependency with its exact version, every repository path it
names, and the Sobol direction numbers (a table vendored in this directory needs its own notice).
The prose itself is not pinned, so rewording it needs no test edit."""

import os
import pathlib
import re
import unittest

from tests.docs import support

TEXT = support.read("NOTICE")
FLAT = support.flat(TEXT)
DATA_SUFFIXES = (".txt", ".csv", ".json", ".gz", ".npz", ".npy", ".dat")


def vendored_direction_tables():
    """Project files that look like a vendored Sobol direction table: a data file named for one,
    or a text file carrying the published table's file name."""
    found = []
    marker = re.compile(r"new-joe-kuo", re.I)
    for root, dirs, files in os.walk(support.HC):
        dirs[:] = sorted(d for d in dirs if d != "__pycache__" and not d.startswith(".")
                         and pathlib.Path(root, d) != support.HC / "tests" / "docs")
        for name in sorted(files):
            path = pathlib.Path(root, name)
            if path.parent == support.HC and name in ("README.md", "NOTICE"):
                continue
            if name.endswith(DATA_SUFFIXES) and re.search(r"joe|kuo|direction", name, re.I):
                found.append(path)
            elif name.endswith((".py", ".txt", ".csv", ".json", ".md")):
                if marker.search(path.read_text(encoding="utf-8", errors="replace")):
                    found.append(path)
    return found


class NoticeTest(unittest.TestCase):
    def test_the_notice_is_plain_ascii(self):
        TEXT.encode("ascii")

    def test_every_pin_is_listed_with_its_exact_version(self):
        pins = support.pins()
        self.assertEqual(set(pins), {"numpy", "scipy", "torch", "scikit-learn"})
        for name, version in pins.items():
            with self.subTest(pin=name):
                self.assertIn(f"{name} {version}:", FLAT)

    def test_named_repository_paths_exist(self):
        for token in sorted(set(re.findall(r"\b[\w.-]+(?:/[\w.-]+)+", TEXT))):
            if token.startswith(("http", "github.com")):
                continue
            with self.subTest(path=token):
                self.assertTrue((support.HC / token).exists() or (support.REPO / token).exists())

    def test_a_vendored_direction_table_carries_its_own_notice(self):
        tables = vendored_direction_tables()
        if tables:
            self.assertNotIn("vendors no direction table", FLAT,
                             f"NOTICE says none is vendored, yet {tables} look like one")
            self.assertIn("Joe", FLAT)
            self.assertIn("Kuo", FLAT)


if __name__ == "__main__":
    unittest.main()
