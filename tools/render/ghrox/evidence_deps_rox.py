# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Fail before importing evidence wheels built for the supported interpreter."""
import sys


def require_evidence_deps():
    if sys.version_info < (3, 12):
        raise SystemExit(
            'ROX_EVIDENCE_PYTHON_REFUSED: Python 3.12 or newer is required; '
            f'got {sys.version.split()[0]} at {sys.executable}. '
            'Use /usr/local/bin/python3 with '
            'PYTHONPATH=<private evidence>/rasson/evidence-deps (see ghrox/README.md).')
    try:
        import shapely
        if int(shapely.__version__.split('.')[0]) < 2:
            raise ImportError('Shapely >= 2 required')
    except ImportError as error:
        raise SystemExit(
            'ROX_EVIDENCE_DEPS_REFUSED: Shapely >= 2 is required; '
            'set PYTHONPATH=<private evidence>/rasson/evidence-deps. '
            f'{error}') from error
