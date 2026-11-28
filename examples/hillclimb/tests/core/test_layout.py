# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Layout checks for the whole package: the sibling loader, what importing each part pulls in, and
the top-level packages an install adds.

Importing any module of the framework (hillclimb) needs only the standard library. No module of
the package imports the kernel binding, torch or scikit-learn when it is imported: the binding is
imported by hillclimb.adapter on first use and the training extras inside the functions that use
them, so kernel-free and extra-free runs can import, and skip, everything.
"""

import fnmatch
import json
import os
import pathlib
import pkgutil
import subprocess
import sys
import tomllib
import unittest

HC = pathlib.Path(__file__).resolve().parents[2]
PACKAGES = ("hillclimb", "straightpool", "hillclimb_examples")
NEVER_AT_IMPORT = {"pool_py", "torch", "sklearn"}
NOT_IN_FRAMEWORK = NEVER_AT_IMPORT | {"numpy", "scipy"}


def modules_of(package):
    """Every module of a package directory, the package itself first, subpackages included."""
    names = []

    def visit(name, directory):
        names.append(name)
        for info in pkgutil.iter_modules([str(directory)]):
            child = f"{name}.{info.name}"
            if info.ispkg:
                visit(child, directory / info.name)
            else:
                names.append(child)

    visit(package, HC / package)
    return names


def run_python(code, *args):
    """Run `code` in a fresh interpreter from the project directory; returns its stdout."""
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    done = subprocess.run([sys.executable, "-B", "-c", code, *args], cwd=str(HC), env=env,
                          capture_output=True, text=True, timeout=300)
    if done.returncode != 0:
        raise AssertionError(f"the child interpreter failed:\n{done.stderr}")
    return done.stdout


def imported_by(names):
    """The top-level module names present after importing `names` in a fresh interpreter."""
    code = ("import importlib, json, sys\n"
            "for name in json.loads(sys.argv[1]):\n"
            "    importlib.import_module(name)\n"
            "print(json.dumps(sorted({m.split('.')[0] for m in sys.modules})))\n")
    return set(json.loads(run_python(code, json.dumps(names))))


def setuptools_table():
    """The [tool.setuptools] table of pyproject.toml."""
    return tomllib.loads((HC / "pyproject.toml").read_text(encoding="utf-8"))["tool"]["setuptools"]


def top_level_packages():
    """The top-level packages an install adds: the directories here whose names match an include
    pattern of the package list, as setuptools' namespace-package finder matches them."""
    patterns = setuptools_table()["packages"]["find"]["include"]
    return {path.name for path in HC.iterdir() if path.is_dir() and "." not in path.name
            and any(fnmatch.fnmatchcase(path.name, pattern) for pattern in patterns)}


class SiblingTest(unittest.TestCase):
    def test_loads_the_three_sibling_modules_once(self):
        from hillclimb import _siblings
        stream = _siblings.load("noise_stream")
        law = _siblings.load("hand_noise_law")
        rl = _siblings.load("run_length")
        self.assertTrue(callable(stream.standard_normals))
        self.assertTrue(callable(law.make_executor))
        self.assertTrue(callable(rl.run_length_estimate))
        self.assertIs(_siblings.load("run_length"), rl)
        self.assertIs(law.noise_stream, stream)

    def test_unknown_name_is_refused(self):
        from hillclimb import _siblings
        with self.assertRaises(KeyError):
            _siblings.load("no_such_module")

    def test_a_different_module_of_the_same_name_is_refused(self):
        code = ("import sys, types\n"
                "sys.modules['run_length'] = types.ModuleType('run_length')\n"
                "from hillclimb import _siblings\n"
                "try:\n"
                "    _siblings.load('run_length')\n"
                "except ImportError:\n"
                "    print('refused')\n")
        self.assertEqual(run_python(code).strip(), "refused")


class ImportTest(unittest.TestCase):
    def test_the_framework_imports_with_the_standard_library_only(self):
        found = imported_by(modules_of("hillclimb")) & NOT_IN_FRAMEWORK
        self.assertEqual(found, set(), f"importing hillclimb pulled in {sorted(found)}")

    def test_no_module_imports_the_binding_or_the_training_extras(self):
        for package in PACKAGES:
            with self.subTest(package=package):
                found = imported_by(modules_of(package)) & NEVER_AT_IMPORT
                self.assertEqual(found, set(), f"importing {package} pulled in {sorted(found)}")


class PackageListTest(unittest.TestCase):
    """An install, editable or not, adds three named top-level packages and no generic one: a
    package named models or training would shadow, or be shadowed by, one of the user's own."""

    def test_an_install_adds_the_three_named_packages_only(self):
        self.assertEqual(top_level_packages(), {"hillclimb", "straightpool", "hillclimb_examples"})

    def test_every_package_directory_but_the_tests_is_installed(self):
        found = {path.name for path in HC.iterdir() if (path / "__init__.py").is_file()}
        self.assertEqual(found - {"tests"}, top_level_packages())

    def test_the_learned_files_ship_beside_their_evaluators(self):
        from hillclimb_examples.models import c2, v
        patterns = setuptools_table()["package-data"]["hillclimb_examples.models"]
        for name in (c2.WEIGHTS, v.MODEL):
            with self.subTest(file=name):
                self.assertTrue(any(fnmatch.fnmatchcase(name, pattern) for pattern in patterns))


if __name__ == "__main__":
    unittest.main()
