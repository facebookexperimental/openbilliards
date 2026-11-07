# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Tests for noise_stream: standard library only, no kernel, no files written.
Run here: python3 -B -m unittest -v (or python3 -B test_noise_stream.py)."""

import math
import os
import sys
import unittest
from fractions import Fraction

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import noise_stream as ns  # noqa: E402

M64 = (1 << 64) - 1

#: (episode_seed, index) -> (noise_seed, shot_seed), exact on every platform.
U64_VECTORS = (
    ((0, 0), 0x48218226FF3CD4BF, 0xE220A8397B1DCDAF),
    ((1, 0), 0x9E0160293A33AAF7, 0xE4D971771B652C20),
    ((1, 1), 0x1FCE27C426AB7CEE, 0xBEEB8DA1658EEC67),
    ((3, 199), 0x0896D6E43DD894D5, 0x510FF8703CB5EA06),
    ((M64, 0), 0xF2C27EF86A95B080, 0xDE0A564CBCD060C4),
)

#: (episode_seed, decision_index) -> standard_normals, recorded on one platform; libm may move
#: the last bits elsewhere, hence the tolerance.
FLOAT_VECTORS = (
    ((1, 0), (-0.2584391763406901, 1.1096228633127754, 0.14404299895438177, 0.28809309398555333,
              0.019948729870978732)),
    ((5, 3), (0.9965779626810245, 0.35649097598741236, -0.2716844517150053, 0.5142683978127301,
              -0.04707549528896734)),
)


def box_muller(block):
    """Box-Muller written out again from the module docstring (for an independent recomputation)."""
    u = [((d >> 11) + 1) * 2.0**-53 for d in block]
    out = []
    for k in range(3):
        rad = math.sqrt(-2.0 * math.log(u[2 * k]))
        ang = 2.0 * math.pi * u[2 * k + 1]
        out += [rad * math.cos(ang), rad * math.sin(ang)]
    return tuple(out[:5])


class StreamTest(unittest.TestCase):
    def test_constants_are_the_derived_values(self):
        self.assertEqual(ns.GOLDEN_GAMMA, 0x9E3779B97F4A7C15)
        self.assertEqual(ns.GOLDEN_GAMMA_2, 0xE220A8397B1DCDAF)
        self.assertEqual(ns.COLLISION_FACTOR, 0x9E7C7F2481189FB3)
        self.assertEqual((ns.GOLDEN_GAMMA * ns.COLLISION_FACTOR) & M64, ns.GOLDEN_GAMMA_2)
        self.assertEqual(ns.GOLDEN_GAMMA % 2, 1)
        self.assertEqual(ns.GOLDEN_GAMMA_2 % 2, 1)

    def test_splitmix64_reference_outputs(self):
        # the SplitMix64 generator (Steele, Lea and Flood 2014) seeded with 0: its first four outputs
        state, out = 0, []
        for _ in range(4):
            state = (state + ns.GOLDEN_GAMMA) & M64
            out.append(ns.splitmix64(state))
        self.assertEqual(out, [0xE220A8397B1DCDAF, 0x6E789E6AA1B965F4, 0x06C45D188009454F, 0xF88BB8A8724C81EC])

    def test_u64_vectors(self):
        for (seed, idx), noise, shot in U64_VECTORS:
            self.assertEqual(ns.noise_seed(seed, idx), noise)
            self.assertEqual(ns.shot_seed(seed, idx), shot)

    def test_seed_reduction_and_index_check(self):
        for seed in (0, 5, M64):
            self.assertEqual(ns.noise_seed(seed + (1 << 64), 3), ns.noise_seed(seed, 3))
            self.assertEqual(ns.noise_seed(seed - (1 << 64), 3), ns.noise_seed(seed, 3))
        for fn in (ns.noise_seed, ns.shot_seed):
            with self.assertRaises(ValueError):
                fn(7, -1)

    def test_uniform_block_is_the_generator_from_the_key(self):
        for seed, idx in ((0, 0), (11, 4), (M64, 199)):
            state, want = ns.noise_seed(seed, idx), []
            for _ in range(6):
                state = (state + ns.GOLDEN_GAMMA) & M64
                want.append(ns.splitmix64(state))
            self.assertEqual(ns.uniform_block(seed, idx), tuple(want))

    def test_unit_map_is_exact_and_in_the_half_open_interval(self):
        for u in [0, 1, (1 << 11) - 1, 1 << 11, M64 >> 1, M64] + list(ns.uniform_block(2, 2)):
            x = ns.u64_to_unit(u)
            self.assertEqual(Fraction(x), Fraction((u >> 11) + 1, 1 << 53))
            self.assertTrue(0.0 < x <= 1.0)
        self.assertEqual(ns.u64_to_unit(0), 2.0**-53)
        self.assertEqual(ns.u64_to_unit(M64), 1.0)

    def test_normals_recomputed_bit_for_bit(self):
        for seed, idx in ((1, 0), (5, 3), (M64, 7), (12, 199)):
            got = ns.standard_normals(seed, idx)
            self.assertEqual([x.hex() for x in got], [x.hex() for x in box_muller(ns.uniform_block(seed, idx))])
            self.assertEqual(got, ns.standard_normals(seed, idx))  # pure: no stored state
        for (seed, idx), want in FLOAT_VECTORS:
            for g, w in zip(ns.standard_normals(seed, idx), want):
                self.assertLessEqual(abs(g - w), 1e-12)
        self.assertEqual(len({ns.standard_normals(s, i) for s in range(8) for i in range(32)}), 8 * 32)

    def test_moments(self):
        n = 4000
        cols = list(zip(*(ns.standard_normals(9, i) for i in range(n))))
        for col in cols:
            mean = math.fsum(col) / n
            var = math.fsum((x - mean) ** 2 for x in col) / (n - 1)
            self.assertLess(abs(mean), 5.0 / math.sqrt(n))
            self.assertLess(abs(var - 1.0), 5.0 * math.sqrt(2.0 / n))

    def test_noise_and_shot_streams_never_collide(self):
        self.assertEqual(ns.collision_pairs(), [])
        for seed in (0, 3, M64):
            shots = {ns.shot_seed(seed, j) for j in range(256)}
            self.assertFalse(shots & {ns.noise_seed(seed, i) for i in range(256)})
        for i in range(4):  # the audit's algebra: each i has one partner j, far beyond any episode
            j = ((ns.COLLISION_FACTOR * (i + 1)) & M64) - 1
            self.assertGreater(j, 1 << 20)
            for seed in (0, 3, M64):
                self.assertEqual(ns.noise_seed(seed, i), ns.shot_seed(seed, j))


if __name__ == "__main__":
    unittest.main()
