# Copyright (c) Meta Platforms, Inc. and affiliates.

"""hillclimb_examples.training.datagen: the fold law, the stage-2 laws, the row writer and the
committed fixture.

Kernel-free except the last class, which plays tiny fresh games and searches a fresh position
(skipped without the kernel).
"""

import json
import pathlib
import tempfile
import unittest

from hillclimb import adapter, crn
from hillclimb_examples.training import datagen
from straightpool import game as rules
from tests.training import fresh

FIXTURES = pathlib.Path(__file__).resolve().parents[2] / "hillclimb_examples/training/fixtures"


def struck(i, kind="direct", cut=10.0, v0=2.0, success=True, stroke=None):
    """A struck member entry as datagen writes it."""
    return {"i": i, "ball": 1, "pocket": 0, "kind": kind, "cut_deg": cut,
            "stroke": stroke or [v0, 0.1 * i, 0.0, 0.0, 0.0], "stage": "prefix",
            "success": success, "make": None}


class FoldTest(unittest.TestCase):
    def test_a_game_has_one_fold_in_range(self):
        keys = [3, 2 ** 64 - 1, 10 ** 19 + 3, 0]
        for key in keys:
            self.assertEqual(datagen.fold_of(key), datagen.fold_of(str(key)))
            self.assertIn(datagen.fold_of(key), range(datagen.N_FOLDS))
            self.assertIn(datagen.fold_of(key, n=3), range(3))

    def test_the_folds_spread_over_keys(self):
        counts = [0] * datagen.N_FOLDS
        for key in range(500):
            counts[datagen.fold_of(key)] += 1
        self.assertTrue(all(60 <= c <= 140 for c in counts), counts)


class SearchTest(unittest.TestCase):
    def test_defaults_and_floor(self):
        search = datagen.Search()
        self.assertEqual((search.draws, search.pool, search.prefix, search.extension, search.top),
                         (32, 512, 32, 96, 4))
        self.assertEqual(search.floor, 16)
        self.assertEqual(datagen.SMALL.floor, datagen.SMALL.draws // 2)

    def test_bad_settings_are_refused(self):
        for bad in ({"draws": 1}, {"prefix": 0}, {"extension": -1}, {"top": 0}, {"pool": 48},
                    {"pool": 64, "prefix": 32, "extension": 40}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                datagen.Search(**bad)


class RankTest(unittest.TestCase):
    def test_direct_first_then_cut_then_speed_then_index(self):
        entries = [struck(0, kind="bank", cut=1.0), struck(1, cut=30.0),
                   struck(2, cut=5.0, v0=3.0), struck(3, cut=5.0, v0=1.5), struck(4, cut=None),
                   struck(5, success=False, cut=0.0), struck(6, cut=5.0, v0=1.5)]
        self.assertEqual([s["i"] for s in datagen.rank_successes(entries)], [3, 6, 2, 1, 4, 0])

    def test_a_repeated_stroke_counts_once(self):
        same = [1.0, 0.5, 0.0, 0.1, -0.1]
        near = [1.0, 0.5 + 4e-6, 0.0, 0.1, -0.1]
        entries = [struck(0, stroke=same), struck(1, stroke=near), struck(2, stroke=[1.0, 0.6, 0.0,
                                                                                   0.1, -0.1])]
        self.assertEqual([s["i"] for s in datagen.rank_successes(entries)], [0, 2])

    def test_decide_takes_the_most_makes_at_the_floor(self):
        self.assertIsNone(datagen.decide([], 4))
        self.assertIsNone(datagen.decide([3, 1, 0], 4))
        self.assertEqual(datagen.decide([4, 7, 7, 2], 4), 1)
        self.assertEqual(datagen.decide([5, 4], 4), 0)


class RecordTest(unittest.TestCase):
    def test_position_round_trip(self):
        positions = {0: (0.1, -0.2), 3: (0.3, 0.4), 12: (-0.5, 1.0)}
        doc = datagen.position_json(positions)
        self.assertEqual(doc["cue"], [0.1, -0.2])
        self.assertEqual(sorted(doc["balls"]), ["12", "3"])
        self.assertEqual(datagen.positions_of(doc), positions)
        in_hand = datagen.position_json({5: (0.0, 0.0)})
        self.assertIsNone(in_hand["cue"])
        self.assertEqual(datagen.positions_of(in_hand), {5: (0.0, 0.0)})

    def test_action_round_trip(self):
        entry = {"stroke": [2.5, 1.25, 0.1, 0.05, -0.05], "call": [7, 4], "place": [0.2, -0.6]}
        action = datagen.action_of(entry)
        self.assertEqual(action.stroke, adapter.Stroke(2.5, 1.25, 0.1, 0.05, -0.05))
        self.assertEqual(action.call, rules.Call(7, 4))
        self.assertEqual(action.place, (0.2, -0.6))
        self.assertEqual(datagen.stroke_json(action.stroke), entry["stroke"])
        self.assertEqual(datagen.call_json(action.call), entry["call"])
        self.assertEqual(datagen.place_json(action.place), entry["place"])
        bare = datagen.action_of({"stroke": [1, 0, 0, 0, 0], "call": None, "place": None})
        self.assertIsNone(bare.call)
        self.assertIsNone(bare.place)

    def test_rows_carry_the_end_of_game_labels(self):
        entries = [{"decision": 0, "run": 0, "trigger": False},
                   {"decision": 1, "run": 1, "trigger": True},
                   {"decision": 2, "run": 2, "trigger": False}]
        rows = datagen.rows_of(41, entries, 2, censored=False)
        self.assertEqual([r["balls_after"] for r in rows], [2, 1, 0])
        self.assertTrue(all(r["game"] == 41 and r["game_L"] == 2 and r["died"]
                            and not r["censored"] and r["fold"] == datagen.fold_of(41)
                            for r in rows))
        self.assertEqual(datagen.trigger_rows(rows), [rows[1]])
        capped = datagen.rows_of(41, entries, 3, censored=True)
        self.assertTrue(all(r["censored"] and not r["died"] for r in capped))

    def test_writer_is_canonical_and_never_overwrites(self):
        items = [{"b": 1.5, "a": [1, None]}, {"z": "x"}]
        with tempfile.TemporaryDirectory() as tmp:
            path = pathlib.Path(tmp) / "rows.jsonl"
            datagen.write_jsonl(path, items)
            self.assertEqual(path.read_text(), '{"a":[1,null],"b":1.5}\n{"z":"x"}\n')
            self.assertEqual(datagen.read_jsonl(path), items)
            with self.assertRaises(FileExistsError):
                datagen.write_jsonl(path, items)
            with self.assertRaises(ValueError):
                datagen.dumps({"x": float("nan")})

    def test_split_and_write(self):
        records = [{"key": 1, "L": 0, "rows": [{"trigger": True, "game": 1}]},
                   {"key": 2, "L": 3, "rows": [{"trigger": False, "game": 2}]}]
        games, rows, triggers = datagen.split(records)
        self.assertEqual(games, [{"key": 1, "L": 0}, {"key": 2, "L": 3}])
        self.assertEqual(len(rows), 2)
        self.assertEqual(triggers, [{"trigger": True, "game": 1}])
        with tempfile.TemporaryDirectory() as tmp:
            paths = datagen.write(tmp, records)
            self.assertEqual([p.name for p in paths], list(datagen.FILES))
            with self.assertRaises(FileExistsError):
                datagen.write(tmp, records)


@unittest.skipUnless((FIXTURES / "trigger-rows.jsonl").is_file(), "no committed fixture")
class FixtureTest(unittest.TestCase):
    """The committed fixture holds rows of the schema this module writes."""

    @classmethod
    def setUpClass(cls):
        cls.games = datagen.read_jsonl(FIXTURES / "games.jsonl")
        cls.rows = datagen.read_jsonl(FIXTURES / "trigger-rows.jsonl")

    def test_trigger_rows_have_the_row_schema(self):
        self.assertTrue(self.rows)
        for row in self.rows:
            self.assertEqual(set(row), set(datagen.ROW_KEYS))
            self.assertTrue(row["trigger"])
            self.assertIn(row["why"], ("forced", "giveup"))
            self.assertEqual(row["fold"], datagen.fold_of(row["game"]))
            self.assertEqual(row["balls_after"], row["game_L"] - row["run"])
            self.assertIsNotNone(row["position"]["cue"])
            self.assertIsInstance(row["n_centres"], int)
            for s in row["struck"]:
                self.assertEqual(set(s), set(datagen.STRUCK_KEYS))
                self.assertIsInstance(s["success"], bool)
                self.assertEqual(len(s["stroke"]), 5)
                self.assertIn(s["stage"], ("prefix", "extension"))
            n = row["search"]["n_struck"]
            self.assertEqual(n, len(row["struck"]))
            self.assertEqual(row["search"]["n_success"], sum(s["success"] for s in row["struck"]))
            made = [s for s in row["struck"] if s["make"] is not None]
            self.assertEqual([s["i"] for s in made], sorted(row["search"]["folded"]))

    def test_the_rows_cover_every_fold_with_both_labels(self):
        folds = {row["fold"] for row in self.rows if row["struck"]}
        self.assertEqual(folds, set(range(datagen.N_FOLDS)))
        labels = {s["success"] for row in self.rows for s in row["struck"]}
        self.assertEqual(labels, {False, True})

    def test_games_hold_the_strokes_the_rows_played(self):
        by_key = {g["key"]: g for g in self.games}
        for row in self.rows:
            stroke = by_key[row["game"]]["strokes"][row["decision"]]
            self.assertEqual(stroke["decision"], row["decision"])
            self.assertEqual([stroke["stroke"], stroke["call"], stroke["scored"], stroke["run"]],
                             [row["stroke"], row["call"], row["scored"], row["run_after"]])
        for game in self.games:
            self.assertEqual(len(game["kernel"]), 16)
            self.assertEqual(game["L"], game["strokes"][-1]["run"] if game["strokes"] else 0)

    def test_the_fixture_lines_are_canonical(self):
        for name in ("games.jsonl", "trigger-rows.jsonl"):
            for line in (FIXTURES / name).read_text().splitlines():
                self.assertEqual(datagen.dumps(json.loads(line)), line)


@unittest.skipUnless(adapter.available(), "needs pool_py")
class FreshRunTest(unittest.TestCase):
    """Tiny fresh games of the fast agent and the search at a fresh position: the rows, replay from
    the key, worker invariance and the search's own laws. No kernel output is asserted exactly."""

    @classmethod
    def setUpClass(cls):
        cls.target = datagen.SelfPlay(noise=0.1, cap=4, search=datagen.SMALL,
                                      namespace=fresh.NAMESPACE + "/datagen")
        cls.records = datagen.generate(fresh.spec(), 3, target=cls.target)

    def test_rows_and_strokes_agree(self):
        for record in self.records:
            rows, strokes = record["rows"], record["strokes"]
            self.assertEqual(len(rows), len(strokes))
            self.assertEqual(len(record["kernel"]), 16)
            self.assertEqual(record["L"], strokes[-1]["run"])
            self.assertEqual(record["censored"], record["over"] == "CAP")
            for row, stroke in zip(rows, strokes):
                self.assertEqual(set(row), set(datagen.ROW_KEYS))
                self.assertIn(row["why"], datagen.WHY)
                self.assertEqual(row["trigger"], row["why"] in ("forced", "giveup"))
                self.assertEqual([row["decision"], row["stroke"], row["call"], row["place"],
                                  row["scored"], row["run_after"]],
                                 [stroke["decision"], stroke["stroke"], stroke["call"],
                                  stroke["place"], stroke["scored"], stroke["run"]])

    def test_a_game_replays_from_its_key(self):
        again = datagen.generate(fresh.spec(), 3, target=self.target)
        self.assertEqual([datagen.dumps(r) for r in again],
                         [datagen.dumps(r) for r in self.records])

    def test_the_worker_count_changes_nothing(self):
        two = datagen.generate(fresh.spec(), 3, target=self.target, workers=2)
        self.assertEqual([datagen.dumps(r) for r in two], [datagen.dumps(r) for r in self.records])

    def test_the_search_at_a_forced_decision(self):
        search = datagen.SMALL
        game = fresh.table_game(crn.game_keys(fresh.NAMESPACE + "/positions", 1)[0])
        streams = {name: crn.stream(f"{fresh.NAMESPACE}/{name}", game.key)
                   for name in ("check", "strike", "pool")}
        record, struck, action = datagen.search_at(game, True, None, search=search, noise=0.1,
                                                   streams=streams)
        self.assertEqual((record, struck), datagen.search_at(game, True, None, search=search,
                                                             noise=0.1, streams=streams)[:2])
        prefix = [s for s in struck if s["stage"] == "prefix"]
        extension = [s for s in struck if s["stage"] == "extension"]
        self.assertEqual([s["i"] for s in prefix], list(range(search.prefix)))
        self.assertEqual(len(extension), 0 if any(s["success"] for s in prefix)
                         else search.extension)
        self.assertEqual(record["n_struck"], len(struck))
        made = [s for s in struck if s["make"] is not None]
        self.assertEqual(sorted(s["i"] for s in made), sorted(record["folded"]))
        self.assertLessEqual(len(made), search.top)
        self.assertTrue(all(s["success"] and 0 <= s["make"] <= search.draws for s in made))
        self.assertEqual(action is not None, record["plays"])
        if record["chosen"] is not None:
            chosen = next(s for s in made if s["i"] == record["chosen"])
            self.assertGreaterEqual(chosen["make"], search.floor)
        if action is not None:
            self.assertEqual(datagen.call_json(action.call), [chosen["ball"], chosen["pocket"]])
