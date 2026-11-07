# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The render demo paints its position and draws it as text and as a PNG."""

import io
import os
import tempfile
import unittest

from straightpool.leave import demo


class DemoTest(unittest.TestCase):
    def test_the_demo_paints_and_draws(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "surface.png")
            out = io.StringIO()
            self.assertEqual(demo.main(["--png", path], out=out), 0)
            with open(path, "rb") as handle:
                data = handle.read()
        self.assertTrue(data.startswith(b"\x89PNG\r\n\x1a\n"))
        lines = out.getvalue().splitlines()
        self.assertTrue(lines[0].startswith("painter v0.2: call ball "))
        grid = [ln for ln in lines if ln.startswith(("|", "+"))]
        self.assertEqual(len(grid), 63 + 2)
        self.assertEqual({len(ln) for ln in grid}, {127 + 2})
        body = "".join(grid)
        self.assertIn("o", body)
        for ball in range(1, 7):
            self.assertIn(format(ball, "x"), body)

    def test_both_painters_run(self):
        out = io.StringIO()
        self.assertEqual(demo.main(["--painter", "v0.1"], out=out), 0)
        self.assertTrue(out.getvalue().startswith("painter v0.1: "))


if __name__ == "__main__":
    unittest.main()
