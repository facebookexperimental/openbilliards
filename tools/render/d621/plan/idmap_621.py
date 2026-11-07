#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""The table id map of the python d621 consumers, read from the boot-mirror leaf web/scene/equipmentalias.js (#789).

The leaf is the single source that the node drift tests (L77 and L79 in web/tools/test-ballreturn-lifecycle.mjs) pin to the
served catalog. This module parses the leaf as text, so no python tool carries its own copy of the map; nothing under web/ is
imported.

  TABLE_RENAMES     old table id -> neutral id (the leaf's TABLE_RENAMES block)
  ALIAS_DIGESTS     [(axis, digest, neutral_id)] (the leaf's digest rows: the FNV-1a 64 digest of a retired id -> its twin)
  fnv1a64_hex(s)    FNV-1a 64 over the UTF-8 bytes of s, as 16 lowercase hex digits (the leaf's fnv1a64Hex)
  current_table_id(table_id, leaf_path=None)
                    the TABLE_RENAMES value, else the neutral id of the table digest row whose digest is fnv1a64_hex(table_id),
                    else table_id unchanged (the leaf's renamedTableId composed with canonicalEquipmentId on table_id); with a
                    leaf_path it reads that leaf file (an exported tree) instead of this repo's leaf
  load(leaf_path)   (TABLE_RENAMES, ALIAS_DIGESTS) parsed from a leaf file

A missing leaf or a failed parse raises (OSError or ValueError). No consumer catches it, so every consumer fails closed.
"""
import re
from pathlib import Path

LEAF = Path(__file__).resolve().parents[4] / "web" / "scene" / "equipmentalias.js"
RENAMES_OPEN = "export const TABLE_RENAMES = Object.freeze({"
RENAME_ROW = re.compile(r"^  ([a-z0-9_]+): '([a-z0-9_]+)',$")
DIGEST_ROW = re.compile(r"axis: '(table|cloth)', digest: '([0-9a-f]{16})', neutral_id: '([a-z0-9_]+)'")


def fnv1a64_hex(s):
    h = 0xcbf29ce484222325
    for b in s.encode("utf-8"):
        h = ((h ^ b) * 0x100000001b3) & 0xFFFFFFFFFFFFFFFF
    return format(h, "016x")


# The published FNV-1a 64 vectors: a wrong hash would silently miss every digest row.
assert [fnv1a64_hex(s) for s in ("", "a", "foobar")] == ["cbf29ce484222325", "af63dc4c8601ec8c", "85944171f73967e8"]


def parse(text, where="the leaf"):
    lines = text.split("\n")
    if RENAMES_OPEN not in lines:
        raise ValueError(f"{where}: no TABLE_RENAMES block")
    renames, closed = {}, False
    for line in lines[lines.index(RENAMES_OPEN) + 1:]:
        if line == "});":
            closed = True
            break
        m = RENAME_ROW.match(line)
        if not m:
            raise ValueError(f"{where}: a TABLE_RENAMES line does not parse: {line!r}")
        renames[m.group(1)] = m.group(2)
    if not closed:
        raise ValueError(f"{where}: the TABLE_RENAMES block is not closed")
    if not renames:
        raise ValueError(f"{where}: TABLE_RENAMES has no row")
    digests = [m.groups() for m in DIGEST_ROW.finditer(text)]
    if not any(axis == "table" for axis, _, _ in digests):
        raise ValueError(f"{where}: ALIAS_DIGESTS has no table row")
    return renames, digests


def load(leaf_path=None):
    path = Path(leaf_path) if leaf_path is not None else LEAF
    return parse(path.read_text(encoding="utf-8"), str(path))


TABLE_RENAMES, ALIAS_DIGESTS = load()


def current_table_id(table_id, leaf_path=None):
    renames, digests = (TABLE_RENAMES, ALIAS_DIGESTS) if leaf_path is None else load(leaf_path)
    if table_id in renames:
        return renames[table_id]
    digest = fnv1a64_hex(table_id)
    return next((neutral for axis, d, neutral in digests if axis == "table" and d == digest), table_id)
