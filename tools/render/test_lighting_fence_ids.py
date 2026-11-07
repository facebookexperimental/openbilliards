#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-fence.py per-tree table ids (#789): a base captured before the rename keeps the measured table under its
retired id, the current tree under the neutral id; the fence compares them under one key.

The retired id is not written here: it is read from the seal's baseline tree (git show BASE:web/scene/table.js) as the one
TABLE_SPECS key whose FNV-1a 64 digest is the id map's table digest row, as ballreturn-fence.mjs --selftest-ids does.

run: PYTHONDONTWRITEBYTECODE=1 python3 tools/render/test_lighting_fence_ids.py
"""
import sys
sys.dont_write_bytecode = True
import importlib.util
import json
import os
import re
import subprocess
import tempfile
import unittest
from unittest.mock import patch

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
FENCE = os.path.join(HERE, 'lighting-fence.py')
# the tree the seal's output/lighting/before baseline was captured from (lighting-seal.sh)
BASE = '163d7f25'
KEY = 'pool_pro_9ft_measured'


def load_fence():
    spec = importlib.util.spec_from_file_location('fence', FENCE)
    mod = importlib.util.module_from_spec(spec)
    argv = sys.argv
    sys.argv = ['x']
    try:
        spec.loader.exec_module(mod)
    finally:
        sys.argv = argv
    return mod


F = load_fence()


def retired_id():
    try:
        src = subprocess.run(['git', '-C', REPO, 'show', f'{BASE}:web/scene/table.js'], capture_output=True, text=True, check=True).stdout
    except (OSError, subprocess.CalledProcessError) as e:
        raise RuntimeError(f'retired id source unavailable: git show {BASE}:web/scene/table.js failed ({e})')
    keys = set(re.findall(r'(?m)^  ([a-z0-9_]+): \{', src)) | set(re.findall(r'(?m)^TABLE_SPECS\.([a-z0-9_]+) = ', src))
    idm = F._idmap()
    rows = [d for axis, d, neutral in idm.ALIAS_DIGESTS if axis == 'table' and neutral == KEY]
    hits = sorted(k for k in keys if idm.fnv1a64_hex(k) in rows)
    if len(hits) != 1 or hits[0] in (KEY, 'wpa_generic_9ft'):
        raise RuntimeError(f'retired id source: expected one digest hit for {KEY} in {BASE}, got {len(hits)}')
    return hits[0]


RETIRED = retired_id()
DUMP = {'roots': [], 'meshes': []}


def put(root, look, tid, payload=None):
    d = os.path.join(root, look, tid)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, 'identity.json'), 'w') as f:
        json.dump(payload if payload is not None else DUMP, f)


def run_fence(base, new, key):
    out = os.path.join(os.path.dirname(base), 'report.md')
    subprocess.run([sys.executable, FENCE, '--base', base, '--new', new, '--tables', key, '--looks', 'default', '--out', out],
                   capture_output=True, text=True, cwd=REPO, env=dict(os.environ, PYTHONDONTWRITEBYTECODE='1'))
    with open(out) as f:
        return f.read()


class PerTreeTableIds(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = os.path.join(self.tmp.name, 'base')
        self.new = os.path.join(self.tmp.name, 'new')

    def tearDown(self):
        self.tmp.cleanup()

    def test_t1_baseline_under_retired_id(self):
        put(self.base, 'default', RETIRED, {'roots': [], 'meshes': [], 'mark': 'base'})
        put(self.new, 'default', KEY)
        self.assertEqual(F.tree_table_id(self.base, 'default', KEY), (RETIRED, None))
        self.assertEqual(F.tree_table_id(self.new, 'default', KEY), (KEY, None))
        self.assertEqual(F.load(self.base, 'default', KEY).get('mark'), 'base')

    def test_t2_report_row_names_both_ids(self):
        put(self.base, 'default', RETIRED)
        put(self.new, 'default', KEY)
        rep = run_fence(self.base, self.new, KEY)
        self.assertNotIn('MISSING dump (base', rep)
        self.assertIn(f'| default | {KEY} (base {RETIRED} / new {KEY}) |', rep)

    def test_t3_exact_key_wins(self):
        put(self.base, 'default', 'diamond_proam_9ft')
        put(self.base, 'default', 'pool_pro_9ft')
        self.assertEqual(F.tree_table_id(self.base, 'default', 'diamond_proam_9ft'), ('diamond_proam_9ft', None))
        self.assertEqual(F.tree_table_id(self.base, 'default', 'pool_pro_9ft'), ('pool_pro_9ft', None))

    def test_t4_no_id_refused_by_name(self):
        put(self.base, 'default', 'wpa_generic_9ft')
        put(self.new, 'default', KEY)
        self.assertEqual(F.tree_table_id(self.base, 'default', KEY), (None, f'no id on this tree for {KEY}'))
        rep = run_fence(self.base, self.new, KEY)
        self.assertIn(f'MISSING dump (base: no id on this tree for {KEY})', rep)

    def test_t5_ambiguity_refused(self):
        put(self.base, 'default', 'diamond_proam_9ft')
        put(self.base, 'default', 'synthetic_old_9ft')
        with patch.dict(F._idmap().TABLE_RENAMES, {'synthetic_old_9ft': 'pool_pro_9ft'}):
            self.assertEqual(F.tree_table_id(self.base, 'default', 'pool_pro_9ft'), (None, 'ambiguous: diamond_proam_9ft,synthetic_old_9ft'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
