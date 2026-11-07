#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""fence-judge-490.py — the seal's FENCE: per-table mesh identity AND material identity
(maintainer fence law 2026-09-04, after the Diamond review round 4 P1 leak: a global
material edit crossed into another table with every mesh hash unchanged).

usage: fence-judge-490.py --base <dir-or-json> --live <dir-or-json> --target <table_id> [--tables a,b,c]
  base / live: directories of census-490-tables.mjs outputs (<table>.json) or single files.
  For every table except --target: every mesh (matched by name + ordinal) must carry the
  SAME geometry hash ('geo'), the SAME attribute hash ('attr'), the SAME object flags
  ('flags'), the SAME material groups and the SAME material record (class, colour,
  emissive, roughness, metalness, envMapIntensity, clearcoat(+roughness), sheen,
  normalScale, bumpScale, side, transparency, every map's identity incl. its pixel hash,
  shader hook) — any difference is RED (exit 3).
  The target table is reported, never judged.  Absent census files REFUSE (exit 2).
  Red arms (--expect-red): a live census taken with --perturb material (roughness +0.01
  on every standard/physical material), --perturb normal (one vertex normal flipped on
  one census mesh) or --perturb flag (castShadow toggled on one census mesh) must read
  RED on every non-target table — any of geo / attr / mats / flags / groups counts.

census schema v2 (review round 12 P2-c): the census now carries, per mesh, 'attr' (FNV
  over every non-position geometry attribute, the morph attributes, morphTargetsRelative,
  drawRange and the world matrix) and 'flags' ({visible, renderOrder, castShadow,
  receiveShadow, frustumCulled, layers, matrixAutoUpdate}); URL-backed texture maps
  carry 'pix' ({w, h, hash} of the downscaled RGBA content).  A base OR live census in
  which any mesh lacks 'attr' or 'flags' (a schema-v1 export) is REFUSED for that table
  — "base export predates the attribute census — regenerate the base" — rather than
  silently judged on the v1 subset (exit 2)."""
import argparse, json, os, sys

FLAG_KEYS = ('visible', 'renderOrder', 'castShadow', 'receiveShadow', 'frustumCulled', 'layers', 'matrixAutoUpdate')

def load(p, table):
    f = p if p.endswith('.json') else os.path.join(p, table + '.json')
    if not os.path.exists(f): return None, f
    return json.load(open(f)), f

def key(m, i): return f"{m.get('name','')}#{i}"

def schema_v2(doc):
    """True iff every mesh record carries the v2 fields ('attr' and 'flags')."""
    meshes = doc.get('meshes', [])
    if not meshes: return doc.get('schema', 1) >= 2
    return all(('attr' in m and 'flags' in m) for m in meshes)

def diff_mat(a, b):
    out = []
    if (a is None) != (b is None): return ['material present/absent']
    if a is None: return out
    for k in sorted(set(a) | set(b)):
        if k == 'maps': continue
        # BUILD-3: shaderHook is the JS TEXT of a shared onBeforeCompile hook — informational
        # (it moves when any class gains a gated branch); the compiled program source 'glsl'
        # is the judged identity.  glslLen / note ride along with glsl.
        if k in ('shaderHook', 'glslLen', 'note'): continue
        if a.get(k) != b.get(k): out.append(f"{k}: {a.get(k)} -> {b.get(k)}")
    ma, mb = a.get('maps', {}), b.get('maps', {})
    for k in sorted(set(ma) | set(mb)):
        if ma.get(k) != mb.get(k):
            pa, pb = (ma.get(k) or {}).get('pix'), (mb.get(k) or {}).get('pix')
            if pa != pb and {kk: v for kk, v in (ma.get(k) or {}).items() if kk != 'pix'} == {kk: v for kk, v in (mb.get(k) or {}).items() if kk != 'pix'}:
                out.append(f"map {k} pix: {json.dumps(pa)[:60]} -> {json.dumps(pb)[:60]}")
            else:
                out.append(f"map {k}: {json.dumps(ma.get(k))[:80]} -> {json.dumps(mb.get(k))[:80]}")
    return out

def diff_flags(a, b):
    a, b = a or {}, b or {}
    return [f"flag {k}: {a.get(k)} -> {b.get(k)}" for k in sorted(set(a) | set(b) | set(FLAG_KEYS)) if a.get(k) != b.get(k)]

def hook_info(base, live):
    """informational: materials whose onBeforeCompile JS text differs (not judged; the compiled GLSL is)"""
    bm = {key(m, i): m for i, m in enumerate(base['meshes'])}; lm = {key(m, i): m for i, m in enumerate(live['meshes'])}
    n = 0; glsl_missing = 0
    for k, m in bm.items():
        if k not in lm: continue
        for a, b in zip(m.get('mats', []), lm[k].get('mats', [])):
            if a and b and a.get('shaderHook') != b.get('shaderHook'): n += 1
            if a and b and (a.get('glsl') is None or b.get('glsl') is None): glsl_missing += 1
    return n, glsl_missing

def judge(base, live):
    """Per-mesh comparison of two schema-v2 censuses.  Returns the per-class diff lists;
    the caller decides RED/IDENTICAL.  Callers must check schema_v2() first."""
    bm = {key(m, i): m for i, m in enumerate(base['meshes'])}
    lm = {key(m, i): m for i, m in enumerate(live['meshes'])}
    geo_bad, attr_bad, mat_bad, flag_bad, missing, extra = [], [], [], [], [], []
    for k, m in bm.items():
        if k not in lm: missing.append(k); continue
        n = lm[k]
        if m.get('geo') != n.get('geo'): geo_bad.append(k)
        if m.get('attr') != n.get('attr'): attr_bad.append((k, [f"attr: {m.get('attr')} -> {n.get('attr')}"]))
        fd = diff_flags(m.get('flags'), n.get('flags'))
        if fd: flag_bad.append((k, fd))
        mats_a, mats_b = m.get('mats', []), n.get('mats', [])
        if len(mats_a) != len(mats_b): mat_bad.append((k, ['material count %d -> %d' % (len(mats_a), len(mats_b))])); continue
        d = []
        for a, b in zip(mats_a, mats_b): d += diff_mat(a, b)
        if m.get('groups') != n.get('groups'): d.append('groups changed')
        if d: mat_bad.append((k, d))
    for k in lm:
        if k not in bm: extra.append(k)
    return dict(n_base=len(bm), n_live=len(lm), geo_bad=geo_bad, attr_bad=attr_bad, mat_bad=mat_bad, flag_bad=flag_bad, missing=missing, extra=extra)

def n_bad(r):
    return len(r['geo_bad']) + len(r['attr_bad']) + len(r['mat_bad']) + len(r['flag_bad']) + len(r['missing']) + len(r['extra'])

def main():
    ap = argparse.ArgumentParser(allow_abbrev=False)  # FIX2: no prefix matching (`--ou=` must not reach argparse as --out='')
    ap.add_argument('--base', required=True); ap.add_argument('--live', required=True); ap.add_argument('--target', required=True)
    ap.add_argument('--tables', default='wpa_generic_9ft,wpa_spec_9ft,diamond_redlabel_9ft,diamond_proam_9ft,predator_apex_9ft,wpbsa_snooker_12ft,umb_carom_284,pool_pro_9ft_measured,joy_q8_9ft,chinese8_pro_9ft')
    ap.add_argument('--expect-red', action='store_true', help='the red arm: every non-target table must read RED')
    a = ap.parse_args()
    # FAIL CLOSED (ORDER-CN8-731-FIX1, review round 1 on #731 P2 (b)): the table list must be
    # non-empty with no blank ids, and the target must be one of the listed tables — a typo'd
    # --target would otherwise be judged as a non-target (RED) or, worse, be a table nobody
    # exported; the ids themselves are validated against the census files (absent → REFUSE below)
    # FIX2 (review round 2 on #731 P2 (b)): a blank value is not an absent option — refused by name
    for flag, val in (('--base', a.base), ('--live', a.live), ('--target', a.target), ('--tables', a.tables)):
        if val is None or not str(val).strip():
            print(f"[fence-490] REFUSED — {flag} given without a value"); sys.exit(2)
    for flag, val in (('--base', a.base), ('--live', a.live)):
        if not os.path.exists(val):
            print(f"[fence-490] REFUSED — {flag} {val}: path not found"); sys.exit(2)
    tables = [t.strip() for t in a.tables.split(',')]
    if not tables or any(not t for t in tables):
        print(f"[fence-490] REFUSED — empty table selection ({a.tables!r}); name every table id explicitly"); sys.exit(2)
    # the target may legitimately be ABSENT from --tables (the red arms census the non-targets only), so
    # a target is accepted when it is listed OR its base census file exists; a typo matches neither
    if a.target not in tables and not (a.base.endswith('.json') or os.path.exists(os.path.join(a.base, a.target + '.json'))):
        print(f"[fence-490] REFUSED — --target {a.target!r} is neither in --tables ({', '.join(tables)}) nor a table of the base export ({a.base}); nothing judged"); sys.exit(2)
    red = 0; reds = []; refused = []
    for t in tables:  # FIX2: the stripped, validated list is the judged list (never a re-split of the raw option)
        base, fb = load(a.base, t); live, fl = load(a.live, t)
        if base is None or live is None:
            refused.append(f"{t}: census missing ({fb if base is None else fl})"); continue
        if not schema_v2(base):
            refused.append(f"{t}: base export predates the attribute census — regenerate the base ({fb} lacks per-mesh 'attr'/'flags'; census schema v2 required)"); continue
        # FIX5 (review round 5 on #731): a census taken after an in-page table SWITCH (census-490 --switch-to; doc.switched_from set) is
        # arm evidence under the boot table's environment, never a fence census — refused by name, base or live
        for _side, _doc in (('base', base), ('live', live)):
            if _doc is not None and _doc.get('switched_from'):
                print(f"[fence-490] REFUSED — {t} {_side} census carries switched_from {_doc.get('switched_from')!r}: a switch-arm census is not a fence census"); sys.exit(2)
        if not schema_v2(live):
            refused.append(f"{t}: live census predates the attribute census — re-run census-490-tables.mjs ({fl} lacks per-mesh 'attr'/'flags'; census schema v2 required)"); continue
        r = judge(base, live)
        is_target = (t == a.target) or (t == 'joy_q8_9ft' and a.target == 'chinese8_pro_9ft')
        bad = n_bad(r)
        tag = 'TARGET (reported, not judged)' if is_target else ('RED' if bad else 'IDENTICAL')
        hi = hook_info(base, live); print(f"[fence-490] {t:26} meshes {r['n_base']:4} -> {r['n_live']:4} | geo diff {len(r['geo_bad']):3} | attr diff {len(r['attr_bad']):3} | material diff {len(r['mat_bad']):3} | flag diff {len(r['flag_bad']):3} | missing {len(r['missing']):3} extra {len(r['extra']):3} | {tag} | hook-text diff {hi[0]:3} (info) | glsl n/a {hi[1]:3}")
        for k, d in (r['attr_bad'][:3] + r['flag_bad'][:3] + r['mat_bad'][:3]):
            print(f"      {k}: {'; '.join(d)[:200]}")
        if not is_target and bad: red += 1; reds.append(t)
    for m in refused: print('[fence-490] REFUSE', m)
    if refused: print('[fence-490] REFUSED — a table without a schema-v2 census cannot be declared identical'); sys.exit(2)
    if a.expect_red:
        n = len([t for t in tables if t != a.target and t != 'joy_q8_9ft'])
        if n == 0: print('[fence-490] NOT ARMED — --expect-red over zero non-target tables (the target and joy are excluded from the arm; list at least one other table)'); sys.exit(6)  # refuter pass 4: never vacuous
        if red == n: print(f'[fence-490] ARMED — the perturbation reads RED on all {n} non-target tables'); sys.exit(0)
        print(f'[fence-490] NOT ARMED — only {red}/{n} non-target tables read RED under the perturbation'); sys.exit(6)
    if red: print(f"[fence-490] RED — {red} non-target table(s) changed: {', '.join(reds)}"); sys.exit(3)
    print('[fence-490] GREEN — every non-target table per-mesh identical in geometry, attributes, flags AND material')

if __name__ == '__main__':
    main()
