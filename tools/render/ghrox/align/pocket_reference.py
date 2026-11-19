# Copyright (c) Meta Platforms, Inc. and affiliates.

"""FIX2's immutable purchased-MODEL reference, separate from OURS observations.

No parser, fitting, cache rebuilding or fallback is allowed here. Changes to the
reference require a new versioned ruling; provenance-only JSON edits do not.
"""
from dataclasses import dataclass, asdict
import hashlib
import json
from pathlib import Path
import tempfile

import objsoup

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
DEFAULT = HERE / 'pocket-reference-rox.json'
REFERENCE_SHA256 = '79c6cc4e2820e3d35cb33bed27f051f83372d9e741dae0ea9f1bb4c68aa3ec36'
DEFINITION = REPO / 'docs/geometry/rasson-ox-9ft-table-definition.json'
POCKET_ANCHORS = ('cup_corner', 'cup_side')


class ReferenceRefused(ValueError):
    def __init__(self, name, detail):
        self.name = name
        super().__init__(f'{name}: {detail}')


def refuse(name, detail):
    raise ReferenceRefused(name, detail)


def file_hash(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def require_file(path, expected, label):
    if not Path(path).is_file():
        refuse('REFERENCE_INPUT_MISSING', f'{label}: {path}; no fallback')
    actual = file_hash(path)
    if actual != expected:
        refuse('REFERENCE_INPUT_HASH_MISMATCH', f'{label}: {actual} != {expected}')


def decode_record(raw):
    try:
        record = json.loads(raw)
    except (ValueError, UnicodeError) as exc:
        refuse('REFERENCE_INVALID', str(exc))
    if not isinstance(record, dict):
        refuse('REFERENCE_INVALID', 'expected a reference object')
    origin = record.get('origin')
    if origin != 'purchased-MODEL-fixed':
        name = 'REFERENCE_OURS_FITTED_REFUSED' if 'ours' in str(origin).lower() else 'REFERENCE_ORIGIN_REFUSED'
        refuse(name, f'origin={origin!r}; comparison axes must be purchased-MODEL-fixed')
    if hashlib.sha256(raw).hexdigest() != REFERENCE_SHA256:
        refuse('REFERENCE_HASH_MISMATCH', 'not the approved ROX-A4-FIX2-MODEL-1 record')
    return record


def validate_bindings(record, definition):
    rows = {r['id']: r for r in definition['features']}
    for rid, ref in record['letters'].items():
        try:
            row = rows[rid]
            value = row
            for key in ref['value_path']:
                value = value[key]
            expected = ref.get('model_axis_xy_mm', ref.get('playfield_mm', ref.get('bed_z_mm')))
            if value != expected or ('a1_record' in ref and row.get('a1_record') != ref['a1_record']):
                refuse('REFERENCE_LETTER_MISMATCH', f'{rid}: {value!r} != fixed {expected!r}, or A1 citation differs')
        except (KeyError, TypeError) as exc:
            refuse('REFERENCE_LETTER_MISSING', f'{rid}: {exc}')
    a1 = record['a1']
    checks = (
        ('A1 nose', tuple(a1['nose_xy_mm']), (objsoup.NX, objsoup.NY)),
        ('A1 K', tuple(a1['nose_xy_mm']), tuple(objsoup.K)),
        ('PF-05 bed', a1['bed_z_mm'], objsoup.BEDTOP),
        ('CP-12', tuple(record['letters']['CP-12']['model_axis_xy_mm']), tuple(objsoup.MODEL_CUP_CORNER)),
        ('SP-12', tuple(record['letters']['SP-12']['model_axis_xy_mm']), tuple(objsoup.MODEL_CUP_SIDE)),
        ('source path', record['source']['path'], objsoup.OBJ),
    )
    for label, fixed, configured in checks:
        if fixed != configured:
            refuse('REFERENCE_MODEL_DATUM_MISMATCH', f'{label}: configured {configured!r} != fixed {fixed!r}')


@dataclass(frozen=True)
class PocketReference:
    id: str
    path: str
    sha256: str
    source_sha256: str
    a1_sha256: str
    model_nose: tuple
    model_corner: tuple
    model_side: tuple
    playfield: tuple
    bed: float
    ours_bed_y_m: float

    @property
    def K(self):
        return tuple(v / 2 for v in self.playfield)

    def axis(self, kind):
        if kind == 'corner':
            return tuple(k + c - n for k, c, n in zip(self.K, self.model_corner, self.model_nose))
        if kind == 'side':
            return (self.model_side[0], self.K[1] + self.model_side[1] - self.model_nose[1])
        raise ValueError(f'Unknown pocket kind: {kind}')

    def datums(self, observed):
        return dict(observed, bed=self.bed, K=self.K, x_nose=self.K[0], y_nose=self.K[1],
                    cup_corner=self.axis('corner'), cup_side=self.axis('side'))

    def metadata(self):
        return dict(asdict(self), ours_K=self.K, ours_corner=self.axis('corner'), ours_side=self.axis('side'),
                    rule='MODEL CP-12/SP-12 + A1 nose/bed + PF-01; no OURS fit, no local scaling, no fallback')


def load(path=DEFAULT):
    path = Path(path)
    if not path.is_file():
        refuse('REFERENCE_MISSING', f'{path}; no OURS-fitted fallback')
    record = decode_record(path.read_bytes())
    digest_path = HERE / 'pocket-reference-rox.sha256'
    if not digest_path.is_file() or digest_path.read_text().split() != [REFERENCE_SHA256, DEFAULT.name]:
        refuse('REFERENCE_HASH_RECORD_MISMATCH', str(digest_path))
    require_file(record['source']['path'], record['source']['sha256'], 'purchased MODEL')
    require_file(REPO / record['a1']['path'], record['a1']['sha256'], 'A1 station record')
    for filename, digest in record['cache_sha256'].items():
        require_file(Path(objsoup.CACHE) / filename, digest, f'lane cache {filename}')
    if not DEFINITION.is_file():
        refuse('REFERENCE_LETTER_MISSING', str(DEFINITION))
    try:
        definition = json.loads(DEFINITION.read_bytes())
        validate_bindings(record, definition)
    except (ValueError, KeyError, TypeError) as exc:
        if isinstance(exc, ReferenceRefused):
            raise
        refuse('REFERENCE_LETTER_INVALID', str(exc))
    return PocketReference(record['id'], str(path), REFERENCE_SHA256,
                           record['source']['sha256'], record['a1']['sha256'],
                           tuple(record['a1']['nose_xy_mm']),
                           tuple(record['letters']['CP-12']['model_axis_xy_mm']),
                           tuple(record['letters']['SP-12']['model_axis_xy_mm']),
                           tuple(record['letters']['PF-01']['playfield_mm']),
                           record['a1']['bed_z_mm'], record['transport']['ours_bed_y_m'])


def redarms(path=DEFAULT):
    """Exercise the actual reference admission path, without writing any mutant."""
    load(path)
    results = []
    def run(name, action):
        try:
            action()
            results.append(dict(arm=name, row='CP-12/SP-12 reference', result='ACCEPTED', armed=False))
        except ReferenceRefused as exc:
            results.append(dict(arm=name, row='CP-12/SP-12 reference', result=str(exc), armed=exc.name == name))
    mutant = json.loads(Path(path).read_bytes())
    mutant['origin'] = 'OURS-fitted'
    run('REFERENCE_OURS_FITTED_REFUSED', lambda: decode_record(json.dumps(mutant).encode()))
    with tempfile.TemporaryDirectory(prefix='rox-reference-arm-') as tmp:
        run('REFERENCE_MISSING', lambda: load(Path(tmp) / 'missing-reference.json'))
    return results
