#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-check-settled.py — ORDER-LIGHT-C2-FIX1 A(ii) (the maintainer's generic invariant): NO boot path may leave the venue capture pending at a
dump. The land16 full capture found one that did (capture-studiofail: a failed live look apply inside the studio window left the resumed capture waiting
for a bake nobody fired — venue pending, queued false; the capture tool exhausted every attempt). That failure was caught by the capture's settle
predicate + check-runs (an exhausted set); THIS step judges every dump that exists, so a boot that settles late or leaves the capture pending on a
later dump (a poke's) is refused too. The bound is the app's OWN budget (census venueBudgetMs = main.js VENUE_GI_WINDOW_MS via state().venue.budgetMs),
never a constant of this file. Exit 3 on the first violation, 0 when every dump is settled; dumps from a tree that predates the fields (null) are LISTED.
  python3 tools/render/lighting-check-settled.py <capture dir> [<capture dir> ...]"""
import glob, json, os, sys
bad, listed, judged = [], [], 0
for d in [a for a in sys.argv[1:] if not a.startswith('--')]:
    mp = os.path.join(d, 'manifest.json')
    if not os.path.exists(mp): bad.append(f'{d}: no manifest'); continue
    try: m = json.load(open(mp))
    except Exception as e: bad.append(f'{d}: unreadable manifest ({e})'); continue
    if int(m.get('exhausted') or 0) > 0: bad.append(f"{d}: {m.get('exhausted')} exhausted cell(s) — a boot that never settled")
    cs = sorted(glob.glob(os.path.join(d, '**', 'census.json'), recursive=True))  # base dumps (look/table/) AND poke dumps (look/table/poke/)
    if not cs: bad.append(f'{d}: no census dump at all — nothing to judge is a refusal, not a pass (the smoke of this tool passed an empty copy silently)'); continue
    for c in cs:
        try: ct = (json.load(open(c)).get('contract') or {})
        except Exception as e: bad.append(f'{c}: unreadable census ({e})'); continue
        pend, budget = ct.get('venueCapturePending'), ct.get('venueBudgetMs')
        if pend is None: listed.append(c); continue  # a tree before the field (prefix controls, main) — listed, never judged
        # (land16 attempt 6, the first run of this step) budgetMs 0 is NOT a violation: it is the venue protocol handshake FAILING BY DESIGN — a
        # protocol-1 main.js (the mixoldmain / mixold662main matrix trees) hands the leaf no budget, the leaf refuses and goes legacy for ALL
        # (lightingvisuals.js VENUE_GI_WINDOW_MS = 0, main.js degradeVenue). The venue path is inert there, so the invariant has no bound to
        # read — the dump is LISTED (its pending flag is still judged: an inert path must not be pending either).
        if pend != 0: bad.append(f"{c}: venue capture PENDING at the dump (captures {ct.get('venueCaptures')}, rebakeQueued {ct.get('venueRebakeQueued')}, budgetMs {budget})")
        if budget is None or not (budget > 0): listed.append(f"{c} (venue path protocol-inert: budgetMs {budget}; pending {pend})"); continue
        judged += 1
print(f"[check-settled] {judged} dump(s) judged settled with a positive budget, {len(listed)} listed (no field = a pre-fix tree, or a protocol-inert venue path: budgetMs 0), {len(bad)} violation(s)")
for l in listed[:6]: print('  listed:', l)
for b in bad: print('  VIOLATION:', b)
sys.exit(3 if bad else 0)
