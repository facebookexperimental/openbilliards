# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting_ids.py — the table-id pairing shared by the lighting tools that join a BEFORE capture tree with an AFTER one
(lighting-delta.py, lighting-pack.py).

A table rename leaves a BEFORE tree under the retired id and an AFTER tree under its twin, so a join by exact directory
name drops that table without a word. Both sides are therefore mapped to one canonical id through the aliases the app
applies (web/scene/equipmentalias.js: TABLE_RENAMES and the 'table' rows of ALIAS_DIGESTS, read from that file), and a
table present on one side only is the caller's to list and fail on.
"""
import os, re

ALIAS_JS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'web', 'scene', 'equipmentalias.js')


def fnv1a64_hex(s):
    # FNV-1a 64 over the UTF-8 bytes, as 16 lowercase hex digits (equipmentalias.js fnv1a64Hex)
    h = 0xcbf29ce484222325
    for b in s.encode('utf-8'):
        h = ((h ^ b) * 0x100000001b3) & 0xffffffffffffffff
    return f'{h:016x}'


def load_table_aliases(path=ALIAS_JS):
    # (renames, digests): TABLE_RENAMES old id -> neutral id, and the 'table' ALIAS_DIGESTS rows digest -> neutral id
    src = open(path).read()
    m = re.search(r'TABLE_RENAMES = Object\.freeze\(\{(.*?)\}\);', src, re.S)
    m2 = re.search(r'ALIAS_DIGESTS = Object\.freeze\(\[(.*?)\]\);', src, re.S)
    renames = dict(re.findall(r"(\w+): '(\w+)'", m.group(1))) if m else {}
    rows = re.findall(r"axis: '(\w+)', digest: '([0-9a-f]{16})', neutral_id: '(\w+)'", m2.group(1)) if m2 else []
    digests = {d: n for ax, d, n in rows if ax == 'table'}
    if not renames or not digests:
        raise SystemExit(f'lighting_ids: cannot read TABLE_RENAMES / the table ALIAS_DIGESTS rows from {path}')
    return renames, digests


def canonical_table(t, aliases):
    renames, digests = aliases
    return digests.get(fnv1a64_hex(t)) or renames.get(t, t)


def side_tables(root, look, aliases, has=None):
    # {canonical id: directory name} for one side of one look (only directories holding the file `has`, when given);
    # two directories naming one table is an error
    d = os.path.join(root, look)
    names = sorted(n for n in os.listdir(d) if os.path.isdir(os.path.join(d, n))) if os.path.isdir(d) else []
    out = {}
    for n in names:
        if has and not os.path.exists(os.path.join(d, n, has)):
            continue
        c = canonical_table(n, aliases)
        if c in out:
            raise SystemExit(f'lighting_ids: {root}/{look}: {out[c]} and {n} both resolve to {c}')
        out[c] = n
    return out
