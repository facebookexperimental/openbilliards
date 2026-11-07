#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-probe-scope.py frame_dims: renamed table ids read their literal's frame width / bed height (the values the
pre-rename TABLE_SPECS literals carried), never the silent 0.145 / 0.79 default; a miss refuses loudly."""
import sys
sys.dont_write_bytecode = True
import importlib.util
import os
import shutil
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
TABLE_JS = os.path.join(HERE, '..', '..', 'web', 'scene', 'table.js')
_spec = importlib.util.spec_from_file_location('probe_scope', os.path.join(HERE, 'lighting-probe-scope.py'))
scope = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(scope)


class FrameDims(unittest.TestCase):
    def test_renamed_default_table_keeps_pre_rename_dims(self):
        spec_id, fw, bed = scope.frame_dims('predator_apex_9ft', TABLE_JS)
        self.assertAlmostEqual(fw, 0.1217, places=9)
        self.assertAlmostEqual(bed, 0.753, places=9)
        self.assertEqual(spec_id, 'pool_pro_9ft_metal_rim')
        self.assertNotEqual((round(fw, 6), round(bed, 6)), (0.145, 0.79))

    def test_every_renamed_id_matches_its_literal(self):
        rows = {'diamond_redlabel_9ft': ('pool_pro_9ft_older_gen', 0.13335, 0.762),
                'diamond_proam_9ft': ('pool_pro_9ft', 0.127, 0.76812),
                'rasson_ox_9ft': ('pool_pro_9ft_k55', 0.125928, 0.786862),
                'joy_q8_9ft': ('chinese8_pro_9ft', 0.0918940537277392, 0.79)}
        for table, (want_id, want_fw, want_bed) in rows.items():
            with self.subTest(table=table):
                spec_id, fw, bed = scope.frame_dims(table, TABLE_JS)
                self.assertEqual(spec_id, want_id)
                self.assertAlmostEqual(fw, want_fw, places=9)
                self.assertAlmostEqual(bed, want_bed, places=9)

    def test_unknown_id_refuses(self):
        with self.assertRaises(SystemExit):
            scope.frame_dims('no_such_table_9ft', TABLE_JS)

    def test_missing_key_refuses(self):
        src = open(TABLE_JS).read()
        line = '      frameWidth: 0.1725 - 0.0508,\n'
        self.assertEqual(src.count(line), 1)
        with tempfile.TemporaryDirectory() as d:
            open(os.path.join(d, 'table.js'), 'w').write(src.replace(line, ''))
            shutil.copy(os.path.join(os.path.dirname(TABLE_JS), 'equipmentalias.js'), d)
            with self.assertRaises(SystemExit):
                scope.frame_dims('predator_apex_9ft', os.path.join(d, 'table.js'))


if __name__ == '__main__':
    unittest.main()
