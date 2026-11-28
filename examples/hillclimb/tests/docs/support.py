# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Helpers of the docs suite: paths, the climb table, the README's tables and blocks, and the pins
of pyproject.toml."""

import csv
import pathlib
import re
import tomllib
from decimal import ROUND_HALF_UP, Decimal

#: The project directory (examples/hillclimb) and the repository root.
HC = pathlib.Path(__file__).resolve().parents[2]
REPO = HC.parents[1]

#: The fields climb_table.csv carries, in order, and nothing else.
WHITELIST = ("key", "date", "point", "ci_low", "ci_high", "ci_level", "n", "estimator", "envelope",
             "icga_v1_r")


def read(name):
    """A project file's text."""
    return (HC / name).read_text(encoding="utf-8")


def flat(text):
    """`text` with every run of whitespace as one space, so phrases match across line breaks."""
    return " ".join(text.split())


def climb_table():
    """(header, rows) of climb_table.csv; each row a dict by header field."""
    with open(HC / "climb_table.csv", newline="", encoding="ascii") as handle:
        reader = csv.reader(handle)
        header = tuple(next(reader))
        return header, [dict(zip(header, row)) for row in reader]


def rounded(text, places=2):
    """A decimal string rounded half up to `places` decimals, as a string."""
    return str(Decimal(text).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP))


def section(text, heading):
    """The lines of a Markdown section, from its heading to the next heading of any level."""
    lines = text.splitlines()
    start = lines.index(heading) + 1
    end = next((i for i in range(start, len(lines)) if lines[i].startswith("#")), len(lines))
    return lines[start:end]


def table(lines):
    """The first Markdown table in `lines` as a list of dicts by header cell."""
    rows = [line for line in lines if line.startswith("|")]
    cells = [[cell.strip() for cell in row.strip().strip("|").split("|")] for row in rows]
    header, body = cells[0], cells[2:]
    return [dict(zip(header, row)) for row in body]


def code_blocks(text, language):
    """The fenced code blocks of `text` opened with ```<language>, in order."""
    return re.findall(r"^```" + re.escape(language) + r"\n(.*?)^```$", text, re.M | re.S)


def pins():
    """{distribution: version} of every exact pin in pyproject.toml, extras included."""
    project = tomllib.loads(read("pyproject.toml"))["project"]
    requirements = list(project["dependencies"])
    for extra in project.get("optional-dependencies", {}).values():
        requirements += extra
    found = {}
    for requirement in requirements:
        name, sep, version = requirement.partition("==")
        if sep:
            found[name.strip()] = version.strip()
    return found
