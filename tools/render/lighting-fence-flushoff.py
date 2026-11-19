#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""ORDER-LIGHT-C2-FIX1 §L31 arm helper: copy an identity dump with the occlusion-trace FLUSH RECORD turned off (settle.flush.mode = 'off',
seam withheld) — the shape a capture run under OB_SETTLE_FLUSH=off writes. Every other byte of the dump is the sealed dump's.
usage: lighting-fence-flushoff.py <identity.json in> <identity.json out> — prints what it changed (the fence must refuse the dump by name)."""
import json, sys
d = json.load(open(sys.argv[1]))
st = d.get('settle')
if not isinstance(st, dict):
    raise SystemExit('the dump carries no settle record (NOTE-CENSUS-SETTLE) — nothing to turn off')
f = st.get('flush')
if not isinstance(f, dict) or f.get('mode') != 'flushed':
    raise SystemExit(f'the dump is not flushed to begin with (settle.flush = {json.dumps(f)[:120]}) — the arm would prove nothing')
st['flush'] = {**f, 'mode': 'off', 'seam': None, 'flushes': 0, 'attrsDelta': None, 'ms': 0, 'rebakeFired': False}
json.dump(d, open(sys.argv[2], 'w'))
print("[seal] arm fenceflushoff: turned the dump's flush record off (mode flushed -> off; the sealed dump's other bytes unchanged)")
