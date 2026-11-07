# Copyright (c) Meta Platforms, Inc. and affiliates.

"""V, the learned leaf value: the shipped file and its digest, the feature law, the pure-Python
evaluator, the break-ball reading, and the evaluator against scikit-learn on a fresh fit."""

import gzip
import hashlib
import json
import math
import pathlib
import random
import tempfile
import unittest

from hillclimb_examples.models import v
from tests import platforms
from tests.models import fresh

MODEL_FILE = pathlib.Path(v.__file__).resolve().with_name(v.MODEL)

#: Computed once from fresh.v_cases() with the reference implementation of the feature law and the
#: evaluator on the shipped trees: SHA-256 (first 16 hex digits) of the repr of every feature, and
#: of every prediction, joined by newlines. They pin the arithmetic of Python 3.12, the package's
#: floor: older Pythons round math.hypot differently in the last bit.
FEATURES_SHA16 = "e57f7afe67ae39fa"
PREDICTIONS_SHA16 = "dee9427be5edf77f"

#: The fingerprints of the same features and predictions (tests/platforms.py), recorded with the
#: digests on the recording platform.
FEATURES_FINGERPRINT = ["3ed53439a262117c", 6030, 139165.9194032948, 70397.8607897637]
PREDICTIONS_FINGERPRINT = ["c17f1f4ada92358f", 201, 12.592416995632615, 6.4249754532990835]


def sha16_of_reprs(values):
    return hashlib.sha256("\n".join(repr(x) for x in values).encode("utf-8")).hexdigest()[:16]


def has(module):
    try:
        __import__(module)
    except ImportError:
        return False
    return True


class ModelFileTest(unittest.TestCase):
    def test_the_shipped_file_matches_its_digest(self):
        data = MODEL_FILE.read_bytes()
        self.assertEqual(hashlib.sha256(data).hexdigest()[:16], v.DIGEST)
        self.assertEqual(v.DIGEST, "8563d9166b7df342")

    def test_the_shipped_model_is_canonical_and_complete(self):
        model = v.load()
        self.assertEqual(model["n_features"], v.N_FEATURES)
        self.assertEqual(model["n_trees"], 300)
        self.assertEqual(len(model["trees"]), 300)
        self.assertEqual(model["form"], v.FORM)
        self.assertEqual(sorted(model), ["baseline", "form", "n_features", "n_trees", "trees"])
        text = gzip.decompress(MODEL_FILE.read_bytes()).decode("utf-8")
        self.assertEqual(v.canonical_json(model), text)

    def test_a_changed_file_is_refused(self):
        data = bytearray(MODEL_FILE.read_bytes())
        data[-9] ^= 0x01
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "changed.json.gz"
            path.write_bytes(bytes(data))
            with self.assertRaises(ValueError):
                v.load(path, digest=v.DIGEST)

    def test_save_writes_a_file_load_accepts_and_never_overwrites(self):
        model = v.load()
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "again.json.gz"
            digest = v.save(path, model)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest()[:16], digest)
            self.assertEqual(v.load(path, digest=digest), model)
            self.assertEqual(gzip.decompress(path.read_bytes()),
                             gzip.decompress(MODEL_FILE.read_bytes()))
            with self.assertRaises(FileExistsError):
                v.save(path, model)

    def test_a_malformed_model_is_refused(self):
        model = v.load()
        broken = dict(model, n_trees=299)
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                v.save(pathlib.Path(tmp) / "broken.json.gz", broken)


class FeatureTest(unittest.TestCase):
    def test_features_equal_the_reference_law(self):
        values = []
        for cue, bb in fresh.v_cases():
            row = v.features(cue, bb)
            self.assertEqual(len(row), v.N_FEATURES)
            values += row
        # the cut angles pass through libm (acos), which rounds by platform: the digest holds
        # where it was recorded, the fingerprint everywhere
        platforms.assert_digest(self, sha16_of_reprs(values), FEATURES_SHA16)
        platforms.assert_fingerprint(self, values, FEATURES_FINGERPRINT)

    def test_names_match_the_inputs(self):
        self.assertEqual(len(v.FEATURE_NAMES), v.N_FEATURES)
        self.assertEqual(len(set(v.FEATURE_NAMES)), v.N_FEATURES)

    def test_a_position_and_its_mirror_read_the_same(self):
        for cue, bb in fresh.v_cases()[:50]:
            mirrored = v.features((-cue[0], cue[1]), (-bb[0], bb[1]))
            if bb[0] != 0.0:
                self.assertEqual(v.features(cue, bb), mirrored)

    def test_the_break_ball_is_mirrored_to_the_near_side(self):
        row = v.features((0.2, -0.5), (-0.3, 0.1))
        self.assertEqual(row[:4], [-0.2, -0.5, 0.3, 0.1])

    def test_paths_through_the_rack_are_blocked(self):
        behind = dict(zip(v.FEATURE_NAMES, v.features((0.3, -0.5), (0.0, 1.0))))
        self.assertEqual([behind[f"blk_{n}"] for n in v.POCKET_NAMES],
                         [1.0, 1.0, 0.0, 1.0, 1.0, 0.0])
        self.assertEqual(behind["blk_cb"], 1.0)
        front = dict(zip(v.FEATURE_NAMES, v.features((0.0, -0.8), (0.0, 0.45))))
        self.assertEqual([front[f"blk_{n}"] for n in v.POCKET_NAMES] + [front["blk_cb"]],
                         [0.0] * 7)
        self.assertEqual(front["d_cb"], 1.25)

    def test_degenerate_cuts_read_180(self):
        row = dict(zip(v.FEATURE_NAMES, v.features((0.1, -0.3), (0.1, -0.3))))
        self.assertEqual(row["d_cb"], 0.0)
        self.assertTrue(all(row[f"cut_{n}"] == 180.0 for n in v.POCKET_NAMES))

    def test_the_geometry_is_the_table_of_the_fit(self):
        self.assertEqual(v.FOOT_SPOT, (0.0, v.HALF_LENGTH / 2.0))
        for (x, y), name in zip(v.POCKETS, v.POCKET_NAMES):
            self.assertEqual(x > 0.0, name[0] == "n")
            self.assertEqual({"h": -1, "s": 0, "f": 1}[name[1]], (y > 0) - (y < 0))
        for x, y in v.RACK14:
            self.assertLess(abs(x), 0.12)
            self.assertGreater(y, v.FOOT_SPOT[1])


class EvaluatorTest(unittest.TestCase):
    def test_predictions_equal_the_reference_evaluator(self):
        model = v.load()
        preds = [v.predict(model, v.features(cue, bb)) for cue, bb in fresh.v_cases()]
        # the features pass through libm (acos), as above
        platforms.assert_digest(self, sha16_of_reprs(preds), PREDICTIONS_SHA16)
        platforms.assert_fingerprint(self, preds, PREDICTIONS_FINGERPRINT)

    def test_leaf_value_is_the_clipped_prediction(self):
        model = v.load()
        for cue, bb in fresh.v_cases()[:40]:
            value = v.leaf_value(model, cue, bb)
            self.assertGreaterEqual(value, 0.0)
            self.assertLessEqual(value, 1.0)
            self.assertEqual(value, v.clip01(v.predict(model, v.features(cue, bb))))
        self.assertEqual(v.clip01(-0.25), 0.0)
        self.assertEqual(v.clip01(1.5), 1.0)

    def test_a_missing_value_follows_the_node(self):
        tree = {"f": [0, 0, 0], "t": [0.5, 0.0, 0.0], "l": [1, 0, 0], "r": [2, 0, 0],
                "leaf": [0, 1, 1], "mgl": [1, 0, 0], "v": [0.0, -1.0, 1.0]}
        model = {"baseline": 0.25, "trees": [tree]}
        self.assertEqual(v.predict(model, [0.5]), -0.75)
        self.assertEqual(v.predict(model, [0.75]), 1.25)
        self.assertEqual(v.predict(model, [float("nan")]), -0.75)
        model["trees"][0]["mgl"] = [0, 0, 0]
        self.assertEqual(v.predict(model, [float("nan")]), 1.25)


class BreakBallTest(unittest.TestCase):
    def racked(self, rng, free):
        sites = list(v.RACK14)
        rng.shuffle(sites)
        ids = [b for b in range(1, 16) if b != free]
        rng.shuffle(ids)
        balls = {b: (x + rng.uniform(-0.002, 0.002), y + rng.uniform(-0.002, 0.002))
                 for b, (x, y) in zip(ids, sites)}
        balls[free] = (rng.uniform(-0.5, 0.5), rng.uniform(-1.2, 0.2))
        balls[0] = (rng.uniform(-0.5, 0.5), rng.uniform(-1.2, 0.0))
        return balls

    def test_the_one_ball_off_the_rack_is_the_break_ball(self):
        rng = random.Random("hillclimb/tests/models/break-ball")
        for free in (1, 7, 15):
            balls = self.racked(rng, free)
            self.assertEqual(v.break_ball(balls), (free, balls[free]))

    def test_two_balls_off_the_rack_give_none(self):
        rng = random.Random("hillclimb/tests/models/break-ball-two")
        balls = self.racked(rng, 4)
        moved = next(b for b in balls if b not in (0, 4))
        balls[moved] = (0.3, -0.9)
        self.assertIsNone(v.break_ball(balls))
        self.assertIsNone(v.break_ball({0: (0.0, -0.5)}))


@unittest.skipUnless(has("sklearn") and has("numpy"), "needs scikit-learn and numpy")
class ScikitLearnTest(unittest.TestCase):
    """The evaluator equals scikit-learn's own predict, exactly, on a fresh fit and fixed inputs."""

    def test_exported_trees_predict_exactly_as_scikit_learn(self):
        import numpy as np
        from sklearn.ensemble import HistGradientBoostingRegressor
        rng = np.random.default_rng(np.frombuffer(b"hillclimb-v-fit", dtype=np.uint8))
        x = rng.uniform(-1.0, 1.0, (600, v.N_FEATURES))
        x[rng.uniform(size=x.shape) < 0.03] = np.nan
        y = np.clip(0.3 + 0.2 * np.nan_to_num(x[:, 0]) - 0.1 * np.nan_to_num(x[:, 4]) ** 2
                    + 0.05 * rng.standard_normal(600), 0.0, 1.0)
        from threadpoolctl import threadpool_limits
        with threadpool_limits(limits=1):
            fitted = HistGradientBoostingRegressor(
                loss="squared_error", learning_rate=0.05, max_iter=40, max_leaf_nodes=15,
                min_samples_leaf=20, l2_regularization=1.0, max_bins=255, early_stopping=False,
                random_state=0).fit(x, y)
        model = v.export(fitted)
        self.assertEqual(model["n_trees"], 40)
        fixed = rng.uniform(-1.2, 1.2, (300, v.N_FEATURES))
        fixed[::7, 0] = np.nan
        fixed[::11, 4] = np.nan
        expected = [float(p) for p in fitted.predict(fixed)]
        got = [v.predict(model, [float(c) for c in row]) for row in fixed]
        self.assertEqual(got, expected)
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "fit.json.gz"
            digest = v.save(path, model)
            again = v.load(path, digest=digest)
        self.assertEqual([v.predict(again, [float(c) for c in row]) for row in fixed], expected)
        self.assertTrue(all(math.isfinite(p) for p in got))
        json.dumps(model)


if __name__ == "__main__":
    unittest.main()
