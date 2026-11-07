# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The README: the order and the citation form of its results, its climb tables against
climb_table.csv, its pre-registration template against the climb driver, and every path and
command it names. The prose itself is not pinned, so rewording it needs no test edit."""

import dataclasses
import inspect
import re
import unittest

from hillclimb import climb, protocol
from tests.docs import support

TEXT = support.read("README.md")
FLAT = support.flat(TEXT)

IN_HEADING = "### In the envelope"
OUT_HEADING = "### Out of the envelope"
ESTIMATOR = {"CMC": "cmc", "mean": "mean"}
ENVELOPE = {"v2": "in-envelope-v2", "v1": "in-envelope-v1", "breaks it": "out-of-envelope",
            "not enforced": "out-of-envelope", "floor not checked": "out-of-envelope"}
POINT = re.compile(r"[+-]?[0-9]+\.[0-9]+")
INTERVAL = re.compile(r"\(([0-9.]+) %: ([+-]?[0-9]+\.[0-9]+) to ([+-]?[0-9]+\.[0-9]+)\)")
UPPER = re.compile(r"\(upper bound ([0-9]+\.[0-9]+) at ([0-9.]+) %\)")
PATH_SUFFIXES = (".py", ".md", ".csv", ".txt", ".toml", ".rs")


def percent(level):
    """A CSV ci_level as the README prints it: '0.95' -> '95', '0.995' -> '99.5'."""
    return support.rounded(str(support.Decimal(level) * 100), 1).rstrip("0").rstrip(".")


class StatementTest(unittest.TestCase):
    def test_in_envelope_results_come_first(self):
        self.assertLess(TEXT.index(IN_HEADING), TEXT.index(OUT_HEADING))
        self.assertLess(FLAT.index("178.36"), FLAT.index("263.8"))

    def test_records_are_cited_in_the_plain_form_only(self):
        cited = list(re.finditer(r"(?i)\brows? [0-9]", FLAT))
        self.assertTrue(cited)
        for match in cited:
            with self.subTest(at=FLAT[max(0, match.start() - 30):match.end()]):
                self.assertTrue(FLAT[:match.start()].endswith("internal research log, "))
        # No bracketed key of any form: a cited row, a capital tag followed by a colon, or a word
        # of three or more capitals.
        self.assertNotRegex(TEXT, r"\[(rows?\b|[A-Z]+:|[A-Z]{3,}\b)")

    def test_the_kernel_is_built_from_source(self):
        self.assertIn("cd crates/pool-py", TEXT)
        self.assertIn("maturin develop --release", TEXT)
        self.assertIn("maturin develop --release", (support.REPO / "crates/pool-py/README.md")
                      .read_text(encoding="utf-8"))

    def test_the_licence_section_names_every_pin(self):
        licence = support.flat("\n".join(support.section(TEXT, "## Licence")))
        for name, version in support.pins().items():
            with self.subTest(pin=name):
                self.assertIn(f"{name} {version}", licence)


class ClimbTablesTest(unittest.TestCase):
    """Each README row equals its lines in climb_table.csv, and every level and step gain of the
    CSV is in a README row."""

    def setUp(self):
        _, rows = support.climb_table()
        self.csv = {(row["key"], row["estimator"]): row for row in rows}
        self.readme = (support.table(support.section(TEXT, IN_HEADING))
                       + support.table(support.section(TEXT, OUT_HEADING)))

    def test_the_tables_have_rows(self):
        self.assertEqual(len(support.table(support.section(TEXT, IN_HEADING))), 3)
        self.assertGreater(len(support.table(support.section(TEXT, OUT_HEADING))), 0)

    def test_levels_match_the_csv(self):
        for row in self.readme:
            with self.subTest(record=row["Record"], agent=row["Agent"]):
                line = self.csv[(row["Record"], ESTIMATOR[row["Estimator"]])]
                cell = row["E[L]"]
                self.assertEqual(POINT.match(cell).group(0), support.rounded(line["point"]))
                self.assertEqual(row["Games"], line["n"])
                self.assertEqual(ENVELOPE[row["Envelope"]], line["envelope"])
                interval, upper = INTERVAL.search(cell), UPPER.search(cell)
                if interval:
                    level, low, high = interval.groups()
                    self.assertEqual((low, high), (support.rounded(line["ci_low"]),
                                                   support.rounded(line["ci_high"])))
                    self.assertEqual(level, percent(line["ci_level"]))
                elif upper:
                    high, level = upper.groups()
                    self.assertEqual(line["ci_low"], "")
                    self.assertEqual(high, support.rounded(line["ci_high"]))
                    self.assertEqual(level, percent(line["ci_level"]))
                else:
                    self.assertEqual((line["ci_low"], line["ci_high"]), ("", ""))

    def test_step_gains_match_the_csv(self):
        for row in self.readme:
            key = (row["Record"], "paired-" + ESTIMATOR[row["Estimator"]])
            cell = row["Step gain on the same keys"]
            with self.subTest(record=row["Record"]):
                if not cell:
                    self.assertNotIn(key, self.csv)
                    continue
                line = self.csv[key]
                self.assertEqual(POINT.match(cell).group(0), "+" + support.rounded(line["point"]))
                level, low, high = INTERVAL.search(cell).groups()
                self.assertEqual((low, high), ("+" + support.rounded(line["ci_low"]),
                                               "+" + support.rounded(line["ci_high"])))
                self.assertEqual(level, percent(line["ci_level"]))

    def test_every_level_and_gain_of_the_csv_is_in_the_readme(self):
        shown = {(row["Record"], ESTIMATOR[row["Estimator"]]) for row in self.readme}
        shown |= {(row["Record"], "paired-" + ESTIMATOR[row["Estimator"]]) for row in self.readme
                  if row["Step gain on the same keys"]}
        listed = {key for key in self.csv if not key[1].endswith("p45")}
        self.assertEqual(listed, shown)


class TemplateTest(unittest.TestCase):
    def test_the_template_asks_for_what_a_registration_holds(self):
        template = support.code_blocks(TEXT, "text")[0]
        self.assertTrue(template.startswith("PRE-REGISTRATION"))
        names = set()
        for function in (climb.climb_step, climb.register):
            names |= {name for name, parameter in inspect.signature(function).parameters.items()
                      if parameter.kind is parameter.KEYWORD_ONLY}
        names |= {field.name for field in dataclasses.fields(protocol.DecisionRule)}
        for name in sorted(names - {"workers", "name"}):
            with self.subTest(name=name):
                self.assertRegex(template.lower(), r"\b" + re.escape(name.lower()) + r"\b")

    def test_the_template_fits_on_one_page(self):
        template = support.code_blocks(TEXT, "text")[0]
        self.assertLessEqual(len(template.splitlines()), 40)


class NamedPathsTest(unittest.TestCase):
    def test_every_named_path_exists(self):
        named = set()
        for token in re.findall(r"`([^`\s]+)`", TEXT):
            if re.search(r"[<>()=\"':,]", token):
                continue
            if "/" in token or token.endswith(PATH_SUFFIXES):
                named.add(token)
        self.assertIn("crates/pool-py", named)
        missing = [token for token in sorted(named)
                   if not ((support.HC / token).exists() or (support.REPO / token).exists())]
        self.assertEqual(missing, [])

    def test_every_command_names_a_real_module(self):
        commands = re.findall(r"^ {4}(python -B -m [^\n#]+?)\s*(?:#.*)?$", TEXT, re.M)
        self.assertEqual(len(commands), 5)
        for command in commands:
            with self.subTest(command=command):
                module = command.split()[3]
                if module == "unittest":
                    self.assertIn("discover -s tests -t .", command)
                    self.assertTrue((support.HC / "tests").is_dir())
                else:
                    self.assertTrue((support.HC / (module.replace(".", "/") + ".py")).is_file())

    def test_the_install_commands_match_the_project(self):
        self.assertIn('pip install -e "examples/hillclimb[train]"', TEXT)
        self.assertTrue((support.REPO / "examples/hillclimb/pyproject.toml").is_file())
        project = support.tomllib.loads(support.read("pyproject.toml"))["project"]
        self.assertIn("train", project["optional-dependencies"])
        self.assertEqual(project["readme"], "README.md")


class ExcerptTest(unittest.TestCase):
    def test_the_target_excerpt_is_the_toy_code(self):
        excerpt = support.code_blocks(TEXT, "python")[0]
        self.assertIn(excerpt, support.read("hillclimb/toy.py"))


if __name__ == "__main__":
    unittest.main()
