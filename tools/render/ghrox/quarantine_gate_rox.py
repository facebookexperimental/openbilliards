#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Purchased-model quarantine law on explicit before/after source directories.

No repository metadata is needed. Binary changes, dense numeric/base64 text,
and runtime quarantine-path references fail; an empty scan also fails.
"""
import argparse
import os
from pathlib import Path
import re

SKIP_DIRS = {'.git', 'node_modules', '__pycache__', '.pytest_cache'}
OWNER_PREFIXES = ('ORDER-', 'VERIFY-', 'LAW-', 'HANDOFF-')
BINARY_SUFFIXES = {'.png', '.jpg', '.jpeg', '.wasm', '.ttf', '.woff', '.woff2',
                   '.mp4', '.webm', '.npy', '.gz', '.zip'}


def files(root):
    result = {}
    for parent, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for name in sorted(names):
            if name.startswith(OWNER_PREFIXES):
                continue
            path = Path(parent) / name
            result[path.relative_to(root).as_posix()] = path
    return result


def content(path):
    if path is None:
        return b''
    return os.readlink(path).encode() if path.is_symlink() else path.read_bytes()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True, type=Path, help='pre-change source directory')
    parser.add_argument('--tree', type=Path, default=Path(__file__).resolve().parents[3])
    args = parser.parse_args()
    if not args.base.is_dir() or not args.tree.is_dir():
        parser.error('--base and --tree must be source directories')
    base, tree = files(args.base.resolve()), files(args.tree.resolve())
    print(f'QUARANTINE BASE {args.base.resolve()} TREE {args.tree.resolve()}')
    findings, scanned, changed = [], 0, 0
    for rel in sorted(set(base) | set(tree)):
        before, after = content(base.get(rel)), content(tree.get(rel))
        if before == after:
            continue
        changed += 1
        if Path(rel).suffix.lower() in BINARY_SUFFIXES or b'\0' in before + after:
            findings.append(f'binary change: {rel}')
            continue
        if rel not in tree:
            continue
        try:
            text = after.decode('utf-8')
        except UnicodeDecodeError:
            findings.append(f'non-text change: {rel}')
            continue
        scanned += 1
        for number, line in enumerate(text.splitlines(), 1):
            numbers = len(re.findall(r'-?[0-9]+(?:\.[0-9]+)?(?:[eE][-+]?[0-9]+)?', line))
            words = len(re.findall(r'[A-Za-z]{3,}', line))
            if numbers > 200 and numbers > 4 * words:
                findings.append(f'long numeric array: {rel}:{number} ({numbers} numbers / {words} words)')
            if re.search(r'[A-Za-z0-9+/=]{120,}', line) and 'sha256' not in line and 'http' not in line:
                findings.append(f'base64-like run: {rel}:{number}')
    for rel, path in tree.items():
        if rel.startswith(('tools/', 'docs/')) or rel.endswith('.md'):
            continue
        if b'ob-3dm-quarantine' in content(path):
            findings.append(f'quarantine path outside tools/docs: {rel}')
    if not scanned:
        findings.append(f'scanned 0 text files ({changed} changed paths); an empty scan cannot pass')
    for finding in findings:
        print('QUARANTINE FAIL:', finding)
    print(f'QUARANTINE {"RED" if findings else "OK"}: {scanned} changed text files, {changed} changed paths')
    return int(bool(findings))


if __name__ == '__main__':
    raise SystemExit(main())
