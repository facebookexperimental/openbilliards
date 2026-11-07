#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-check-runs.py — ORDER-LAND-638-FIX2 (review r6): a capture set is ONE run. For every capture dir given, the manifest
must carry a single run id (no `priorRunIds` from a resumed dir: stale artefacts of other runs would be read by the gates),
no exhausted cells (`exhausted` > 0) and no failed run. ORDER-LIGHT-C1: pose files CARRIED from an earlier run (--no-clean) are refused
unless the set declares the carry, and every carried id must ride in priorRunIds with the cell named. Exit 5 on the first refusal, 0 when
every set is clean.
  python3 tools/render/lighting-check-runs.py <capture dir> [<capture dir> ...]"""
import json, os, sys
# --carry-only: apply ONLY the carry rules (a set that is two processes by design — the main baseline: base run + the conv poke run added
# with --no-clean — is exempt from the one-run rules but never from 'every carried file carries a declared origin')
CARRY_ONLY = '--carry-only' in sys.argv
bad = []
for d in [a for a in sys.argv[1:] if not a.startswith('--')]:
    mp = os.path.join(d, 'manifest.json')
    if not os.path.exists(mp): bad.append(f'{d}: no manifest'); continue
    try: m = json.load(open(mp))
    except Exception as e: bad.append(f'{d}: unreadable manifest ({e})'); continue
    # (C1: ids that ride in priorRunIds ONLY because a DECLARED carry put them there are not a resumed-dir mix — they are judged by the carry rules below)
    declared_ids = set(str(i) for c in (m.get('carriedCells') or []) for i in (c.get('fromRunIds') or [])) if m.get('carryDeclared') else set()
    prior = [x for x in (m.get('priorRunIds') or []) if str(x) not in declared_ids]  # (None entries stay: an id-less origin is a mix too)
    if not CARRY_ONLY and m.get('resumed') and prior: bad.append(f"{d}: RESUMED dir mixes run ids (priorRunIds {prior[:4]}{'…' if len(prior) > 4 else ''} + {m.get('runId')})")
    if int(m.get('exhausted') or 0) > 0: bad.append(f"{d}: {m.get('exhausted')} exhausted cell(s)")
    failed = [f"{r.get('look')}/{r.get('table')}{('@' + r['poke']) if r.get('poke') else ''}" for r in m.get('runs', []) if r.get('failed')]
    if failed: bad.append(f'{d}: failed run(s) {failed[:4]}')
    ids = {r.get('runId') for r in m.get('runs', [])}
    if not CARRY_ONLY and len(ids) > 1: bad.append(f'{d}: runs carry {len(ids)} different run ids {sorted(str(i) for i in ids)[:4]}')
    # ORDER-LIGHT-COMPANION (review r12 P2, lighting-check-runs.py:18-19): a manifest with no runs, a null manifest id, or run ids that are null or
    # differ from the manifest's used to read clean — the set must carry a non-null id and EVERY run exactly that id
    mid = m.get('runId')
    if not mid: bad.append(f'{d}: manifest carries no run id')
    if not m.get('runs'): bad.append(f'{d}: manifest carries no runs')
    off = [r for r in m.get('runs', []) if r.get('runId') != mid]
    if not CARRY_ONLY and mid and off: bad.append(f"{d}: {len(off)} run(s) do not carry the manifest id {mid} (found {sorted(str(r.get('runId')) for r in off)[:3]})")
    # ORDER-LIGHT-C1 (review r1 P2, lighting-capture.mjs:324-326): CARRIED ARTEFACTS CARRY THEIR ORIGIN — a pose file merged from an earlier run
    # (--no-clean) is refused unless the set declares the carry (manifest.carryDeclared), and even then every carried id must be listed in
    # priorRunIds and the cell named in manifest.carriedCells; a run whose poses mix ids with no record at all is the finding itself
    prior_ids = set(str(x) for x in (m.get('priorRunIds') or []) if x)
    declared = m.get('carryDeclared')
    cells = m.get('carriedCells') or []
    for r in m.get('runs', []):
        carried = [p for p in (r.get('poses') or []) if 'carriedFromRunId' in p and str(p.get('carriedFromRunId')) != str(r.get('runId'))]
        if not carried: continue
        key = f"{r.get('look')}/{r.get('table')}{('@' + r['poke']) if r.get('poke') else ''}"
        idless = [p.get('name') for p in carried if not p.get('carriedFromRunId')]
        if idless: bad.append(f"{d}: {key} carries pose file(s) {idless[:3]} from a run WITHOUT an id — an origin that cannot be declared")
        ids = sorted({str(p['carriedFromRunId']) for p in carried if p.get('carriedFromRunId')})
        if not declared: bad.append(f"{d}: {key} carries {len(carried)} pose file(s) from run(s) {ids[:3]} into {r.get('runId')} with NO declared carry (pass --declare-carry <why> to lighting-capture.mjs)")
        missing = [i for i in ids if i not in prior_ids]
        if missing: bad.append(f"{d}: {key} carried run id(s) {missing[:3]} not listed in priorRunIds")
        named = any(c.get('look') == r.get('look') and c.get('table') == r.get('table') and (c.get('poke') or None) == (r.get('poke') or None) for c in cells)
        if not named: bad.append(f"{d}: {key} carried pose(s) not listed in manifest.carriedCells")
    seed = os.path.join(d, 'default', 'predator_apex_9ft', 'stale-seed.png')
    if os.path.exists(seed): bad.append(f'{d}: a seeded stale file survived the re-capture ({seed})')
for b in bad: print('[check-runs] REFUSE', b)
print(f"[check-runs] {len([a for a in sys.argv[1:] if not a.startswith('--')])} set(s), {len(bad)} refusal(s){' (carry rules only)' if CARRY_ONLY else ''}")
sys.exit(5 if bad else 0)
