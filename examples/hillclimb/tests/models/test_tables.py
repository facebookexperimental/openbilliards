# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The table constants of C2 and V against the kernel's standard table. Both models were fitted on
that table's geometry; this fails if the kernel's 15-ball rack ever stands on another table."""

import unittest

from hillclimb import adapter
from hillclimb_examples.models import c2, v


@unittest.skipUnless(adapter.available(), "needs pool_py")
class KernelTableTest(unittest.TestCase):
    def test_the_models_read_the_kernel_table(self):
        table = adapter.State.rack("fifteen", 1).table()
        self.assertEqual((table.width, table.length), (c2.TABLE_WIDTH, c2.TABLE_LENGTH))
        self.assertEqual(tuple(tuple(p) for p in table.pockets), c2.POCKETS)
        self.assertEqual(table.ball_radius, v.BALL_RADIUS)
        self.assertEqual((v.HALF_WIDTH, v.HALF_LENGTH), (table.width / 2.0, table.length / 2.0))
        # V's pockets are the kernel's mirrored about x = 0 (the kernel's two corner x values
        # differ in their last digit, so x is compared to 12 places).
        kernel = sorted((round(abs(x), 12), y) for x, y in table.pockets)
        ours = sorted((round(abs(x), 12), y) for x, y in v.POCKETS)
        self.assertEqual(kernel, ours)

    def test_the_re_rack_sites_are_the_kernel_rack_without_its_apex(self):
        for seed in (3, 17, 2024):
            positions = adapter.State.rack("fifteen", seed).positions()
            found = v.break_ball(positions)
            self.assertIsNotNone(found)
            x, y = found[1]
            self.assertLess(((x - v.FOOT_SPOT[0]) ** 2 + (y - v.FOOT_SPOT[1]) ** 2) ** 0.5,
                            v.TEMPLATE_TOL)


if __name__ == "__main__":
    unittest.main()
