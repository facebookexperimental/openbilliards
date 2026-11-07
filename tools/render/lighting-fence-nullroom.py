#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""ORDER-LIGHT-C2-FIX1 class B arm helper: copy an identity dump with the FIRST VISIBLE ROOM mesh's shader witness (material.progHash) nulled.
usage: lighting-fence-nullroom.py <identity.json in> <identity.json out> — prints the mesh it nulled (the fence must name it and FAIL)."""
import json, sys, os, importlib.util
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('fence', os.path.join(here, 'lighting-fence.py')); F = importlib.util.module_from_spec(spec)
argv = sys.argv; sys.argv = ['x']; spec.loader.exec_module(F); sys.argv = argv
d = json.load(open(sys.argv[1])); recs = F.records(d, True); vis = [k for k in sorted(recs) if recs[k].get('visible', True)]
if not vis: raise SystemExit('no visible room mesh in the dump')
k = vis[0]; m = recs[k]; mat = m['material'][0] if isinstance(m['material'], list) else m['material']
if not isinstance(mat, dict) or mat.get('progHash') is None: raise SystemExit(f'room mesh {k} carries no witness to null')
mat['progHash'] = None
json.dump(d, open(sys.argv[2], 'w')); print('[seal] arm fencenullroom: nulled the shader witness of the visible room mesh', k)
