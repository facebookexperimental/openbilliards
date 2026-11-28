# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Check a legacy fullview inventory against actual current scene emission.

This is an applicability check, not a re-pin or a claim that a historical
negative fixture should pass as a current-geometry reference.
"""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--fixture', type=Path, required=True)
parser.add_argument('--emitted', type=Path, required=True)
args = parser.parse_args()
fixture = json.loads(args.fixture.read_text())
emitted = json.loads(args.emitted.read_text())
names = {mesh['name'] for table in emitted['tables'] for mesh in table['meshes']}
retired = sorted({row['name'] for row in fixture['inventory']
                  if row['name'].startswith(('cn8r82-block-', 'cn8r82-fallface-', 'cn8r82-endclose-'))
                  and row['name'] not in names})
print(json.dumps({'fixture': str(args.fixture), 'table_sha256': emitted['table_sha256'],
                  'status': 'RED' if retired else 'GREEN', 'retired_missing_ids': retired,
                  'scope': 'Current-layout applicability of historical inventory; archived negative evidence remains historical.'}, indent=2))
raise SystemExit(1 if retired else 0)
