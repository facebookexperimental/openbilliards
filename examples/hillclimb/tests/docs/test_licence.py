# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The licence a build of this directory carries: LICENSE, beside pyproject.toml, holds the MIT
License text, and pyproject.toml names LICENSE and NOTICE as the licence files that a wheel or a
source archive built from here must include."""

import fnmatch
import unittest

from tests.docs import support

TEXT = support.read("LICENSE")
FLAT = support.flat(TEXT)
PROJECT = support.tomllib.loads(support.read("pyproject.toml"))["project"]


class LicenceTest(unittest.TestCase):
    def test_the_licence_is_the_mit_license_text(self):
        TEXT.encode("ascii")
        lines = TEXT.splitlines()
        self.assertEqual(lines[0], "MIT License")
        self.assertTrue(any(line.startswith("Copyright (c) ") for line in lines[1:4]))
        for phrase in ("Permission is hereby granted, free of charge, to any person obtaining a copy",
                       "The above copyright notice and this permission notice shall be included in "
                       "all copies or substantial portions of the Software.",
                       'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND'):
            with self.subTest(phrase=phrase[:40]):
                self.assertIn(phrase, FLAT)

    def test_a_build_carries_the_licence_and_the_notice(self):
        self.assertEqual(PROJECT["license"], "MIT")
        patterns = PROJECT["license-files"]
        for name in ("LICENSE", "NOTICE"):
            with self.subTest(file=name):
                self.assertTrue((support.HC / name).is_file())
                self.assertTrue(any(fnmatch.fnmatchcase(name, pattern) for pattern in patterns))


if __name__ == "__main__":
    unittest.main()
