# Copyright (c) Meta Platforms, Inc. and affiliates.

"""hillclimb_examples.training.train_c2: the AUROC, the design rows and a refit on the committed
fixture.

The fit tests need torch (a training extra) and are skipped without it.
"""

import importlib.util
import pathlib
import tempfile
import unittest

from hillclimb_examples.models import c2
from hillclimb_examples.training import datagen, train_c2

FIXTURES = pathlib.Path(__file__).resolve().parents[2] / "hillclimb_examples/training/fixtures"
HAVE_TORCH = importlib.util.find_spec("torch") is not None
HAVE_ROWS = (FIXTURES / "trigger-rows.jsonl").is_file()


class AurocTest(unittest.TestCase):
    def test_ties_share_their_average_rank(self):
        self.assertEqual(train_c2.auroc([1, 1, 2, 3], [0, 1, 0, 1]), 0.625)
        self.assertEqual(train_c2.auroc([0.1, 0.9], [0, 1]), 1.0)
        self.assertEqual(train_c2.auroc([0.9, 0.1], [0, 1]), 0.0)
        self.assertEqual(train_c2.auroc([5, 5, 5], [0, 1, 1]), 0.5)

    def test_one_class_has_no_auroc(self):
        self.assertIsNone(train_c2.auroc([1, 2], [1, 1]))
        self.assertIsNone(train_c2.auroc([], []))


@unittest.skipUnless(HAVE_ROWS, "no committed fixture")
class DesignTest(unittest.TestCase):
    def test_one_row_of_inputs_per_struck_member(self):
        rows = datagen.read_jsonl(FIXTURES / "trigger-rows.jsonl")
        X, y, folds, games = train_c2.design(rows)
        units = [s for r in rows if r["trigger"] for s in (r["struck"] or [])]
        self.assertEqual(X.shape, (len(units), c2.N_FEATURES))
        self.assertEqual(y.tolist(), [int(s["success"]) for s in units])
        self.assertEqual(sorted(set(folds.tolist())), list(range(c2.N_FOLDS)))
        self.assertEqual(len(games), len(units))
        empty = [dict(rows[0], struck=[]), dict(rows[0], trigger=False)]
        self.assertEqual(train_c2.design(empty)[0].shape, (0, c2.N_FEATURES))


@unittest.skipUnless(HAVE_TORCH and HAVE_ROWS, "needs torch and the committed fixture")
class FitTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = datagen.read_jsonl(FIXTURES / "trigger-rows.jsonl")
        cls.folds, cls.report = train_c2.fit(cls.rows)

    def test_the_weights_file_loads_and_its_digests_hold(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "c2-refit.json"
            combined = train_c2.save(path, self.folds)
            scorer = c2.load(path, combined=combined)
            with self.assertRaises(FileExistsError):
                train_c2.save(path, self.folds)
        digests = [c2.fold_digest(f) for f in self.folds]
        self.assertEqual(scorer.digests, tuple(d[:16] for d in digests))
        self.assertEqual(combined, c2.combined_digest(digests)[:16])
        X, _, _, _ = train_c2.design(self.rows[:3])
        self.assertEqual(scorer.score(X).shape, (len(X),))

    def test_every_fold_holds_its_games_out(self):
        X, y, folds, _ = train_c2.design(self.rows)
        self.assertEqual(self.report["units"], len(y))
        for f, fold in enumerate(self.report["folds"]):
            self.assertEqual(fold["fold"], f)
            self.assertEqual(fold["heldout"], int((folds == f).sum()))
            self.assertEqual(fold["train"] + fold["heldout"], len(y))
