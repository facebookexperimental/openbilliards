# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Reproduce committed measurements from the hashed authorized source.

Requires the read-only Star quarantine and the private photo metrology packet.
No measured coordinates are copied into a fixture or a rendered asset.
"""
import hashlib
import json
from pathlib import Path
import unittest

from derive_d2_section import derive, FBX_SHA, ROOT, SOURCE


class DerivationTest(unittest.TestCase):
    def test_source_hash_and_committed_definition_are_reproducible(self):
        source = SOURCE / 'src/SNOOKER+TABLE+CGTRADER.fbx'
        private_root = Path.home() / 'ob-artifacts/astra-cn8/phase2-d2'
        required = [source, SOURCE / 'obj/inventory.json',
                    private_root / 'measurements/pro-camera-identifiability.json',
                    private_root / 'measurements/pro-post-calibration-eligibility.json',
                    private_root / 'seal-1/measurements/pro-photo-inputs.json']
        missing = [str(path) for path in required if not path.is_file()]
        if missing:
            self.skipTest('D2 source reproduction requires the authorized private '
                          'Star intake and photo metrology packet: ' + ', '.join(missing))
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), FBX_SHA)
        actual = (json.dumps(derive(), indent=2) + '\n').encode()
        expected = (ROOT / 'docs/geometry/cn8-pocket-d2-section.json').read_bytes()
        self.assertEqual(actual, expected, 'Derivation differs from committed section measurements')


if __name__ == '__main__':
    unittest.main()
