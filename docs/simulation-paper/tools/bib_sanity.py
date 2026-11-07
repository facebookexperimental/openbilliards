#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Bibliography sanity gate for the manuscript.

Checks:
  1. Every BibTeX entry in references.bib carries author, title, and year.
  2. Every entry key is cited at least once from main.tex / sections/*.tex
     (via \\cite, \\citep, \\citet, \\citealp, \\citealt, \\citeauthor,
     \\citeyear, or \\nocite).
  3. No \\cite key is missing from references.bib (bibtex would also catch
     this, but we fail fast with the offending key named).

Zero third-party dependencies; naive-but-sufficient parsing for this repo's
hand-maintained .bib (no @string, no nested braces in field NAMES).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BIB = ROOT / "references.bib"
# supplement-main.tex is scanned too: the corpus spans two documents
# (main.pdf + supplement.pdf) sharing one .bib, and "every entry cited"
# means cited from the union of both.
TEX_FILES = [
    ROOT / "main.tex",
    ROOT / "supplement-main.tex",
    *sorted((ROOT / "sections").glob("*.tex")),
]

ENTRY_RE = re.compile(r"@(\w+)\s*\{\s*([^,\s]+)\s*,", re.MULTILINE)
CITE_RE = re.compile(
    r"\\(?:no)?cite(?:p|t|alp|alt|author|year)?\*?"
    r"(?:\[[^\]]*\]){0,2}\{([^}]*)\}"
)
REQUIRED_FIELDS = ("author", "title", "year")


def parse_entries(text: str) -> dict[str, str]:
    """Return {key: entry_body} keyed by cite key."""
    entries: dict[str, str] = {}
    matches = list(ENTRY_RE.finditer(text))
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        entries[m.group(2)] = text[m.start():end]
    return entries


def field_present(body: str, field: str) -> bool:
    return re.search(rf"^\s*{field}\s*=", body, re.MULTILINE | re.IGNORECASE) is not None


def main() -> int:
    bib_text = BIB.read_text(encoding="utf-8")
    entries = parse_entries(bib_text)
    if not entries:
        print(f"FAIL: no entries parsed from {BIB}")
        return 1

    failures: list[str] = []

    for key, body in entries.items():
        missing = [f for f in REQUIRED_FIELDS if not field_present(body, f)]
        if missing:
            failures.append(f"entry '{key}': missing field(s) {', '.join(missing)}")

    cited: set[str] = set()
    for tex in TEX_FILES:
        text = tex.read_text(encoding="utf-8")
        # strip comments (unescaped % to end of line) before scanning
        text = re.sub(r"(?<!\\)%.*", "", text)
        for m in CITE_RE.finditer(text):
            for k in m.group(1).split(","):
                if k.strip():
                    cited.add(k.strip())

    uncited = sorted(set(entries) - cited)
    unknown = sorted(cited - set(entries))
    for key in uncited:
        failures.append(f"entry '{key}': never cited from main.tex/sections/")
    for key in unknown:
        failures.append(f"cite key '{key}': not present in references.bib")

    if failures:
        print(f"FAIL: {len(failures)} bibliography sanity problem(s):")
        for f in failures:
            print(f"  - {f}")
        return 1

    print(
        f"OK: {len(entries)} bib entries; all carry author/title/year; "
        f"all cited ({len(cited)} distinct keys used); no dangling cite keys."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
