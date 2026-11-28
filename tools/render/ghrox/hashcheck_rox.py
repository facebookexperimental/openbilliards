#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""hashcheck_rox.py — the A2 'other entries byte-identical' proof (ruling A2-3, runtime form).

Compares a fresh dump_rox_scene.mjs export of a table entry against the pre-A2 baseline hashes
(/tmp/ox-a2/baseline/hashes.json, taken on the skeleton tree before any OX builder existed): mesh count,
per-mesh name + world-space positions + indices sha256. Any difference on a NON-rox entry is a fence
breach; differences on rasson_ox_9ft are expected and listed.
Usage: python3 tools/render/ghrox/hashcheck_rox.py --dump /tmp/ox-a2/check/<id>.json [--baseline /tmp/ox-a2/baseline/hashes.json] [--judge]
"""
import argparse, hashlib, json, sys

def mesh_sha(m):
    return hashlib.sha256((m['name'] + '|' + json.dumps(m['positions']) + '|' + json.dumps(m['indices'])).encode()).hexdigest()

ap = argparse.ArgumentParser(); ap.add_argument('--dump', required=True); ap.add_argument('--baseline', default='/tmp/ox-a2/baseline/hashes.json'); ap.add_argument('--judge', action='store_true')
a = ap.parse_args()
d = json.load(open(a.dump)); base = json.load(open(a.baseline))
tid = d['table']; b = base.get(tid)
if not b:
    sys.exit(f"no baseline for {tid}")
now = [{'name': m['name'], 'tris': m['tris'], 'sha': mesh_sha(m)[:16]} for m in d['meshes']]
allsha = hashlib.sha256(''.join(mesh_sha(m) for m in d['meshes']).encode()).hexdigest()
same = allsha == b['sha256_all']
print(f"{tid}: meshes {len(now)} (baseline {b['meshCount']}), tris {d['totalTris']} (baseline {b['totalTris']}), sha_all {allsha[:16]} vs {b['sha256_all'][:16]} -> {'IDENTICAL' if same else 'DIFFERENT'}")
if not same:
    bnames = {(m['name'], m['sha']) for m in b['meshes']}; nnames = {(m['name'], m['sha']) for m in now}
    gone = sorted(bnames - nnames)[:15]; new = sorted(nnames - bnames)[:15]
    print('  baseline meshes not reproduced:', gone); print('  new/changed meshes:', new)
if a.judge and tid != 'rasson_ox_9ft' and not same:
    sys.exit(1)
