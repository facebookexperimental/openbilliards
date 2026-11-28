# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Load the two sibling examples this package builds on.

The noise law (examples/hand-noise-law) and the run-length estimator
(examples/run-length-estimator) sit next to this package in the repository's examples directory.
They are standard-library modules without a package of their own, so they are loaded here by file
path, once each, under their own module names (hand_noise_law imports noise_stream by that name).
Run from a checkout of the repository, or install this package in editable mode, so that the two
directories stay beside it.
"""

import importlib.util
import pathlib
import sys

#: The repository's examples directory: the parent of this package's project directory.
EXAMPLES = pathlib.Path(__file__).resolve().parents[2]

#: Module name -> (sibling directory, file name).
SOURCES = {
    "noise_stream": ("hand-noise-law", "noise_stream.py"),
    "hand_noise_law": ("hand-noise-law", "hand_noise_law.py"),
    "run_length": ("run-length-estimator", "run_length.py"),
}

#: What a module needs loaded before it (hand_noise_law imports noise_stream by name).
_NEEDS = {"hand_noise_law": ("noise_stream",)}


def path_of(name):
    """The file a sibling module is loaded from."""
    if name not in SOURCES:
        raise KeyError(f"unknown sibling module {name!r}; known: {sorted(SOURCES)}")
    directory, filename = SOURCES[name]
    return EXAMPLES / directory / filename


def load(name):
    """The sibling module `name`, loaded once by file path and registered under its own name.

    A module of that name that is already imported is returned when it was loaded from the same
    file; one loaded from elsewhere raises ImportError rather than being shadowed."""
    path = path_of(name)
    loaded = sys.modules.get(name)
    if loaded is not None:
        origin = getattr(loaded, "__file__", None)
        if origin is not None and pathlib.Path(origin).resolve() == path:
            return loaded
        raise ImportError(f"a different module named {name!r} is already imported ({origin!r}); "
                          f"this package needs the one at {path}")
    if not path.is_file():
        raise ImportError(f"{path.name} not found at {path}: this package expects the "
                          f"{SOURCES[name][0]} example beside it in the repository")
    for need in _NEEDS.get(name, ()):
        load(need)
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    except BaseException:
        del sys.modules[name]
        raise
    return module
