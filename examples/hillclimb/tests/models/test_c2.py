# Copyright (c) Meta Platforms, Inc. and affiliates.

"""C2, the learned pre-filter: the shipped weights and their fold-weight digests, the canonical file
form, the feature law, the numpy evaluator and its order, and the evaluator against torch."""

import hashlib
import json
import pathlib
import tempfile
import unittest

from hillclimb_examples.models import c2
from tests import platforms
from tests.models import fresh

WEIGHTS_FILE = pathlib.Path(c2.__file__).resolve().with_name(c2.WEIGHTS)

#: The fold digests of the shipped weights file, first 16 hex digits each, in fold order.
FOLD_DIGESTS = ("3988de81846b0abe", "8d334d6233e01e89", "a8f20fd382d8e9dd", "76142765b88c1b55",
                "66df053e26214888")

#: Computed once from fresh.c2_cases() with the reference implementation of the feature law:
#: SHA-256 (first 16 hex digits) of each case's n x 47 float64 rows.
FEATURES_SHA16 = ("30d12aaa8fa0706f", "fa658d02b2f10eb2", "6599993ea803efab", "7f855fc07b0b0127",
                  "5cc9653b80919be5", "8c093154e84bd4c2", "7debe66adc99ce4e", "0929068e42c535a6")

#: The fingerprints of the same rows (tests/platforms.py), recorded with the digests on the
#: recording platform.
FEATURES_FINGERPRINTS = (
    ["d10df44ff60f990a", 893, 292.72096829605226, 145.78350243085504],
    ["9d4a69d2ac9434b2", 141, 37.39467295555548, 17.48200862074846],
    ["1486362f269ec8c9", 282, 96.72899228913606, 47.08491366589906],
    ["32346609f716c5b9", 564, 217.0311529997142, 106.81472688760775],
    ["13fc3b5a87a50ce1", 1598, 616.2876162633918, 312.98523003282213],
    ["15931ca81f12ff30", 235, 100.76727884872996, 49.161737057502876],
    ["d5923dc326fe9e79", 1222, 470.84728542437455, 235.63047586244733],
    ["faa151a7f204e7c5", 2162, 971.6178514934583, 483.5540917504838],
)

#: The pool order of each case under the reference evaluator (the training library's own network
#: on the same rows). The smallest score gap between neighbours in these orders is about 7e-4, far
#: above float32 rounding and the last-bit differences of another platform's BLAS, so the orders
#: are checked exactly on every platform.
ORDERS = (
    (5, 11, 17, 4, 9, 0, 3, 14, 10, 16, 6, 2, 1, 15, 13, 8, 12, 18, 7),
    (0, 1, 2),
    (4, 0, 5, 1, 3, 2),
    (0, 9, 6, 2, 8, 11, 1, 3, 4, 5, 7, 10),
    (19, 11, 24, 0, 5, 32, 17, 1, 29, 14, 10, 2, 26, 16, 6, 30, 4, 8, 23, 20, 9, 3, 7, 22, 25,
     13, 21, 27, 15, 28, 31, 18, 12, 33),
    (4, 2, 0, 1, 3),
    (11, 1, 16, 14, 13, 18, 0, 12, 2, 5, 17, 22, 3, 8, 4, 19, 15, 25, 23, 21, 20, 9, 10, 6, 7, 24),
    (14, 28, 23, 34, 16, 8, 36, 5, 33, 35, 0, 44, 20, 19, 40, 32, 27, 39, 11, 15, 31, 45, 42, 30,
     43, 4, 6, 9, 10, 7, 21, 38, 1, 3, 12, 18, 24, 29, 41, 2, 26, 17, 25, 37, 13, 22),
)


def has(module):
    try:
        __import__(module)
    except ImportError:
        return False
    return True


def shipped():
    return json.loads(WEIGHTS_FILE.read_text(encoding="utf-8"))


def rows_of(case):
    position, members, run, break_decision, n_centres = case
    return c2.features(position, members, run=run, break_decision=break_decision,
                       n_centres=n_centres)


class DigestTest(unittest.TestCase):
    """The fold-weight digest law on the shipped file (standard library only)."""

    def test_the_fold_weight_digests_of_the_shipped_file(self):
        doc = shipped()
        full = [c2.fold_digest(fold) for fold in doc["folds"]]
        self.assertEqual(tuple(d[:16] for d in full), FOLD_DIGESTS)
        self.assertEqual(tuple(fold["digest"] for fold in doc["folds"]), FOLD_DIGESTS)
        self.assertEqual(c2.combined_digest(full)[:16], c2.COMBINED_DIGEST)
        self.assertEqual(doc["combined_digest"], c2.COMBINED_DIGEST)
        self.assertEqual(c2.COMBINED_DIGEST, "bb5b225cbfcbc454")

    def test_the_file_holds_the_weights_and_nothing_else(self):
        doc = shipped()
        self.assertEqual(sorted(doc), ["combined_digest", "folds"])
        self.assertEqual(len(doc["folds"]), c2.N_FOLDS)
        for fold in doc["folds"]:
            self.assertEqual(sorted(fold), ["digest", "mu", "sd", "state_dict"])
            self.assertEqual(list(fold["state_dict"]), [name for name, _shape in c2.LAYERS])
            for name, shape in c2.LAYERS:
                value = fold["state_dict"][name]
                self.assertEqual(len(value), shape[0])
                if len(shape) == 2:
                    self.assertEqual({len(row) for row in value}, {shape[1]})
            self.assertEqual((len(fold["mu"]), len(fold["sd"])), (c2.N_FEATURES, c2.N_FEATURES))

    def test_the_shipped_file_is_in_canonical_form(self):
        doc = shipped()
        self.assertEqual(c2.dumps(doc["folds"]), WEIGHTS_FILE.read_text(encoding="utf-8"))

    def test_a_changed_weight_or_scale_is_refused(self):
        for change in ("weight", "scale"):
            doc = shipped()
            if change == "weight":
                doc["folds"][2]["state_dict"]["2.weight"][5][0] += 1e-3
            else:
                doc["folds"][4]["sd"][7] *= 1.0001
            with tempfile.TemporaryDirectory() as tmp:
                path = pathlib.Path(tmp) / "changed.json"
                path.write_text(json.dumps(doc), encoding="utf-8")
                with self.subTest(change=change), self.assertRaises(ValueError):
                    c2.load(path)

    def test_a_file_of_other_weights_needs_its_own_digest(self):
        doc = shipped()
        doc["folds"][0]["state_dict"]["0.bias"][0] += 0.5
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "other.json"
            digest = c2.save(path, doc["folds"])
            self.assertNotEqual(digest, c2.COMBINED_DIGEST)
            with self.assertRaises(ValueError):
                c2.load(path, combined=c2.COMBINED_DIGEST)
            with self.assertRaises(FileExistsError):
                c2.save(path, doc["folds"])
            if has("numpy"):
                self.assertEqual(c2.load(path).combined, digest)

    def test_malformed_folds_are_refused(self):
        doc = shipped()
        with self.assertRaises(ValueError):
            c2.dumps(doc["folds"][:4])
        del doc["folds"][1]["state_dict"]["2.bias"]
        with self.assertRaises(ValueError):
            c2.dumps(doc["folds"])
        doc = shipped()
        doc["folds"][3]["mu"] = doc["folds"][3]["mu"][:46]
        with self.assertRaises(ValueError):
            c2.dumps(doc["folds"])


@unittest.skipUnless(has("numpy"), "needs numpy")
class FeatureTest(unittest.TestCase):
    def test_features_equal_the_reference_law(self):
        for k, case in enumerate(fresh.c2_cases()):
            rows = rows_of(case)
            with self.subTest(case=k):
                self.assertEqual(rows.shape, (len(case[1]), c2.N_FEATURES))
                # norms and dot products pass through BLAS and log1p through libm, which round
                # by platform: the digest holds where the exact pins are on, the fingerprint
                # everywhere
                platforms.assert_digest(self, hashlib.sha256(rows.tobytes()).hexdigest()[:16],
                                        FEATURES_SHA16[k])
                platforms.assert_fingerprint(self, rows.tolist(), FEATURES_FINGERPRINTS[k])

    def test_names_match_the_inputs(self):
        self.assertEqual(len(c2.POSITION_NAMES), 20)
        self.assertEqual(len(c2.STROKE_NAMES), 24)
        self.assertEqual(len(c2.FEATURE_NAMES), c2.N_FEATURES)

    def test_one_position_block_and_one_hot_codes(self):
        position, members, run, break_decision, n_centres = fresh.c2_cases()[4]
        rows = rows_of(fresh.c2_cases()[4])
        name = {n: i for i, n in enumerate(c2.FEATURE_NAMES)}
        self.assertTrue((rows[:, :20] == rows[0, :20]).all())
        self.assertEqual(rows[0, name["run"]], run / 29.0)
        self.assertEqual(rows[0, name["break_decision"]], 1.0 if break_decision else 0.0)
        for row, m in zip(rows, members):
            self.assertEqual([row[name[f"kind_{k}"]] for k in c2.KINDS],
                             [1.0 if m.kind == k else 0.0 for k in c2.KINDS])
            self.assertEqual(row[name[f"pocket_{m.pocket}"]], 1.0)
            self.assertEqual(sum(row[name[f"pocket_{p}"]] for p in range(6)), 1.0)
            self.assertEqual(row[name["ball"]], m.ball / 15.0)
            self.assertEqual(row[name["v0"]], round(m.stroke.v0, 5))

    def test_the_position_block_reads_only_the_menu_prefix(self):
        position, members, run, break_decision, n_centres = fresh.c2_cases()[7]
        self.assertGreater(len(members), c2.MENU_PREFIX)
        whole = rows_of(fresh.c2_cases()[7])
        prefix = c2.features(position, members[:c2.MENU_PREFIX], run=run,
                             break_decision=break_decision, n_centres=n_centres)
        self.assertEqual(whole[:c2.MENU_PREFIX].tobytes(), prefix.tobytes())

    def test_the_cue_ball_in_hand(self):
        position, members, _run, _bd, _nc = fresh.c2_cases()[6]
        self.assertNotIn(0, position)
        rows = rows_of(fresh.c2_cases()[6])
        name = {n: i for i, n in enumerate(c2.FEATURE_NAMES)}
        self.assertEqual(rows[0, name["no_cue"]], 1.0)
        self.assertEqual((rows[0, name["cue_x"]], rows[0, name["cue_y"]]), (0.0, 0.0))
        for row, m in zip(rows, members):
            self.assertEqual(row[name["cue_x_at_stroke"]], round(m.place[0], 5))
            self.assertEqual(row[name["d_cue_ball"]], 0.0)

    def test_positions_are_read_at_six_decimals(self):
        position, members, run, break_decision, n_centres = fresh.c2_cases()[3]
        moved = {b: (round(x, 6) + 1e-9, round(y, 6) - 1e-9) for b, (x, y) in position.items()}
        moved[0] = position[0]
        a = rows_of(fresh.c2_cases()[3])
        b = c2.features(moved, members, run=run, break_decision=break_decision,
                        n_centres=n_centres)
        self.assertEqual(a.tobytes(), b.tobytes())

    def test_bad_members_are_refused(self):
        position, members, run, break_decision, n_centres = fresh.c2_cases()[0]
        bad = [members[0]._replace(kind="jump"), members[0]._replace(pocket=6)]
        for member in bad:
            with self.subTest(member=member), self.assertRaises(ValueError):
                c2.features(position, [member], run=run, break_decision=break_decision,
                            n_centres=n_centres)
        in_hand = {b: p for b, p in position.items() if b != 0}
        with self.assertRaises(ValueError):
            c2.features(in_hand, [members[0]], run=run, break_decision=break_decision,
                        n_centres=n_centres)

    def test_an_explicit_table_reads_the_same_as_the_default(self):
        from hillclimb.adapter import Table
        position, members, run, break_decision, n_centres = fresh.c2_cases()[1]
        table = Table(c2.TABLE_WIDTH, c2.TABLE_LENGTH, 0.028575, c2.POCKETS)
        given = c2.features(position, members, run=run, break_decision=break_decision,
                            n_centres=n_centres, table=table)
        self.assertEqual(given.tobytes(), rows_of(fresh.c2_cases()[1]).tobytes())
        wider = Table(c2.TABLE_WIDTH * 2.0, c2.TABLE_LENGTH, 0.028575, c2.POCKETS)
        other = c2.features(position, members, run=run, break_decision=break_decision,
                            n_centres=n_centres, table=wider)
        self.assertNotEqual(other.tobytes(), given.tobytes())

    def test_an_empty_pool(self):
        position = fresh.c2_cases()[0][0]
        rows = c2.features(position, [], run=0, break_decision=False, n_centres=0)
        self.assertEqual(rows.shape, (0, c2.N_FEATURES))

    def test_a_pool_member_of_the_package_reads_the_same(self):
        from straightpool.candidates import PoolMember
        case = fresh.c2_cases()[2]
        position, members, run, break_decision, n_centres = case
        package = [PoolMember(index=m.index, ball=m.ball, pocket=m.pocket, kind=m.kind,
                              stroke=m.stroke, place=m.place, cut_deg=m.cut_deg) for m in members]
        again = c2.features(position, package, run=run, break_decision=break_decision,
                            n_centres=n_centres)
        self.assertEqual(again.tobytes(), rows_of(case).tobytes())


@unittest.skipUnless(has("numpy"), "needs numpy")
class EvaluatorTest(unittest.TestCase):
    def test_orders_equal_the_reference_evaluator(self):
        scorer = c2.load()
        self.assertEqual(scorer.combined, c2.COMBINED_DIGEST)
        self.assertEqual(scorer.digests, FOLD_DIGESTS)
        for k, case in enumerate(fresh.c2_cases()):
            with self.subTest(case=k):
                self.assertEqual(tuple(c2.order(scorer.score(rows_of(case)))), ORDERS[k])

    def test_the_score_is_the_mean_of_the_fold_logits(self):
        import numpy as np
        scorer = c2.load()
        rows = rows_of(fresh.c2_cases()[0])
        logits = scorer.fold_logits(rows)
        self.assertEqual(logits.shape, (c2.N_FOLDS, len(rows)))
        self.assertEqual(logits.dtype, np.float64)
        self.assertEqual(scorer.score(rows).tobytes(), logits.mean(axis=0).tobytes())
        self.assertEqual(scorer.score(rows).tobytes(), scorer.score(rows.copy()).tobytes())

    def test_rows_of_the_wrong_width_are_refused(self):
        scorer = c2.load()
        with self.assertRaises(ValueError):
            scorer.score([[0.0] * 46])

    def test_ties_go_to_the_lower_index_and_nan_is_refused(self):
        self.assertEqual(c2.order([0.5, 2.0, 2.0, -1.0, 2.0]), [1, 2, 4, 0, 3])
        self.assertEqual(c2.order([]), [])
        with self.assertRaises(ValueError):
            c2.order([1.0, float("nan")])


@unittest.skipUnless(has("numpy") and has("torch"), "needs numpy and torch")
class TorchTest(unittest.TestCase):
    """The numpy evaluator against the training library's network built from the same file: the
    logits agree to float32 rounding and every order is the same."""

    def test_the_numpy_evaluator_agrees_with_torch(self):
        import numpy as np
        import torch
        torch.set_num_threads(1)
        scorer = c2.load()
        nets = []
        for fold in shipped()["folds"]:
            net = torch.nn.Sequential(torch.nn.Linear(47, 128), torch.nn.ReLU(),
                                      torch.nn.Linear(128, 128), torch.nn.ReLU(),
                                      torch.nn.Linear(128, 1))
            net.load_state_dict({name: torch.tensor(np.array(fold["state_dict"][name],
                                                             dtype=np.float32))
                                 for name, _shape in c2.LAYERS})
            net.eval()
            nets.append((net, np.array(fold["mu"]), np.array(fold["sd"])))
        for k, case in enumerate(fresh.c2_cases()):
            rows = rows_of(case)
            with torch.no_grad():
                logits = np.stack([net(torch.tensor((rows - mu) / sd, dtype=torch.float32))
                                   .numpy()[:, 0].astype(np.float64) for net, mu, sd in nets])
            with self.subTest(case=k):
                # torch and numpy's BLAS sum in float32 in their own orders, which vary by
                # platform: within 1e-5 (about ten units in the last place of the largest logit)
                # where the exact pins are on, within 1e-4 elsewhere
                bound = 1e-5 if platforms.RECORDED_HERE else 1e-4
                self.assertLess(float(np.max(np.abs(logits - scorer.fold_logits(rows)))), bound)
                self.assertEqual(tuple(c2.order(logits.mean(axis=0))), ORDERS[k])


if __name__ == "__main__":
    unittest.main()
