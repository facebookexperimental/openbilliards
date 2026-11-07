#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-fence.py — the venue-lighting lane's mesh + MATERIAL identity fence over lighting-capture.mjs dumps.

For every table in --tables, <base>/<look>/<table>/identity.json vs <new>/<look>/<table>/identity.json:
  TABLE-OWNED roots (every scene root that is not the room — the room root is the one carrying
  'obFarPropTable') must be IDENTICAL: same mesh list (by root, order, name), same matrixWorld,
  same geometry hashes (position/normal/uv/index/color) and the same material identity record
  (class, colour, emissive, roughness, metalness, envMapIntensity, clearcoat, sheen, transmission,
  ior, normalScale, bumpScale, side/transparent/opacity/alphaTest/depthWrite, flatShading,
  vertexColors, onBeforeCompile presence, program cache key, per-slot texture content hash/size/
  repeat/wrap/colourSpace). The lane may move LIGHTS only, so a table byte must not move.
  ORDER-LAND-638-FIX4 verifier item 4: every TABLE-OWNED material slot is also judged on 'progHash' — the per-mesh
  hash of the COMPILED GL vertex+fragment sources the material rendered with (IDENTITY_SRC progWitness), so a
  program-level leak into a table mesh is caught per mesh, not only by the per-class --program-report predicate.
  A missing / null progHash on EITHER side is a DIFFERENCE naming the mesh (fail closed: a census that predates the
  witness cannot pass this fence). UNBAKED (balls/cue) and ROOM programs legitimately differ under the venue term,
  so their progHash/progKey rows are listed, not judged.
  ROOM-OWNED root diffs are LISTED (the rig's own fixture faces may legitimately change) and the
  diff count is reported; --room-strict makes them fail too (the identity-default tables).
  --red-arm mutates one field per class in memory (a colour, a roughness, an envMapIntensity, a
  clearcoat, a map hash, a geometry hash, a matrixWorld cell, a material class, a mesh removal, a progHash
  value, a progHash nulled) and asserts the comparator fires on each — a comparator that cannot red is not a gate.
  The two progHash arms additionally require the base to carry a COMPLETE witness (no null slot) before the
  mutation, otherwise a comparator already failing on the missing field would make the arm fire for free.

PER-TREE TABLE IDS (#789): --tables names the comparison key, a NEW-tree table id. Each tree's dump dir is resolved on
its own: the key itself when <tree>/<look>/<key>/ holds a dump, else the ONE entry of <tree>/<look>/ that the table id map
(tools/render/d621/plan/idmap_621.py over this checkout's web/scene/equipmentalias.js: the renames, then the digest rows)
maps to the key. No hit or two hits is refused by name (a MISSING row naming the reason), never a fallback. A base captured
before the rename therefore compares under the one key; the row label then names both ids (key (base X / new Y)).

usage: lighting-fence.py --base DIR --new DIR --tables a,b [--looks default,sp] [--room-strict] [--red-arm] [--out report.md] [--json summary.json]
exit 0 = every table identical (and the arm fired 11/11 when asked); 3 otherwise.
"""
import argparse, copy, json, os, sys


_IDMAP = []


def _idmap():
    """tools/render/d621/plan/idmap_621.py, loaded by path on first use (importers of this module take no import-time dependency)."""
    if not _IDMAP:
        import importlib.util
        spec = importlib.util.spec_from_file_location('idmap_621', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'd621', 'plan', 'idmap_621.py'))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _IDMAP.append(mod)
    return _IDMAP[0]


def tree_table_id(d, look, key):
    """(id, reason): the dump dir of comparison key `key` on tree `d` (see PER-TREE TABLE IDS). The exact key first, else the
    unique entry the id map maps to the key; otherwise (None, reason)."""
    root = os.path.join(d, look)
    if os.path.exists(os.path.join(root, key, 'identity.json')):
        return key, None
    try: entries = sorted(os.listdir(root))
    except OSError: entries = []
    found = [e for e in entries if e != key and os.path.exists(os.path.join(root, e, 'identity.json')) and _idmap().current_table_id(e) == key]
    if len(found) == 1:
        return found[0], None
    return None, (f"ambiguous: {','.join(found)}" if found else f'no id on this tree for {key}')


def dump_path(d, look, t, name):
    tid, _ = tree_table_id(d, look, t)
    return os.path.join(d, look, tid or t, name)


def load(d, look, t):
    p = dump_path(d, look, t, 'identity.json')
    return json.load(open(p)) if os.path.exists(p) else None


def room_roots(dump):
    return {r['i'] for r in dump['roots'] if r.get('isRoom')}


# ORDER-LIGHT-6 Q1: the UNBAKED class — balls (MeshPhysical/Standard spheres of the unnamed ball-set root) and the
# cue (obCueStick* / obAtelierCue roots). Their materials take the derived venue fill as a program hook, so their
# PROGRAM fields (obc, cacheKey) are the venue term's and are listed, not judged; every other field is judged.
# ORDER-LAND-638-FIX4 verifier item 4: the compiled-program witness (progHash, progKey) joins that list for the UNBAKED
# and ROOM classes only — for TABLE-owned meshes progHash is JUDGED per mesh (see witness_rows).
PROGRAM_FIELDS = ('obc', 'cacheKey', 'progHash', 'progKey')
PROGRAM_WITNESS = 'progHash'


def mesh_cls(dump, m, rr):
    if m['root'] in rr:
        return 'room'
    root = next((r for r in dump['roots'] if r['i'] == m['root']), None)
    rname = (root or {}).get('name') or ''
    if rname.startswith('obCueStick') or rname.startswith('obAtelierCue'):
        return 'unbaked'
    mat = m.get('material'); mcls = mat.get('cls') if isinstance(mat, dict) else None
    if not rname and m.get('geoType') == 'SphereGeometry' and mcls in ('MeshPhysicalMaterial', 'MeshStandardMaterial'):
        return 'unbaked'
    return 'table'


def records(dump, room, which=None):
    which = which or ('room' if room else 'table')
    out = {}
    rr = room_roots(dump)
    for m in dump['meshes']:
        if mesh_cls(dump, m, rr) != which:
            continue
        key = (m['root'], m['order'], m['name'])
        out[key] = m
    return out


# ORDER-LIGHT-C2-FIX9 N6d — the DECLARED rows (maintainer ruling after land30's stop, four amendments): a field the frozen control web PREDATES is a
# schema difference by design and is DECLARED, never silently excluded. (1) the trigger is ABSENCE: the key is missing from the A-side material's record
# (the census encoder omits a key the web cannot report); a key PRESENT on A with a null value stays judged and fails; (2) B must be COMPLETE: the field is
# declarable only if EVERY B-side hooked material reports it non-null — one missing / null makes the fence FAIL; (3) the direction is STRUCTURAL: the
# declared path exists only for the cross-web control fence (the two dumps' manifests name different web roots); a same-web pair cannot take it;
# (4) the rule carries its own red arms (a B material that drops the field, one that nulls it, one that drops the whole parent) and the declared-row
# count must equal the derived number (hooked B materials × declared fields) — a rule that can only pass is not a rule.
CROSS_WEB = False; WEB_A = None; WEB_B = None   # set by main() from <base>/manifest.json and <new>/manifest.json (webDir)
DECLARED = []      # (path, '<absent on A>', b_value) rows of the CURRENT record pair (drained by compare_set into DECLARED_ROWS with the record key)
DECLARED_ROWS = [] # (key, path, x, y) rows of the CURRENT compare()
# ORDER-LIGHT-C2-FIX10 class Z (review r10 P2 on lighting-page.mjs:779; the maintainer's erratum on N6d amendment 1): the lawful-absence rule gets a KEY CENSUS.
# Every injected key the identity dump is DEFINED to write is listed here with the material class that must carry it ('hooked' = every material whose cache
# key carries the venue hook; 'ball' = the hooked materials whose userDataKeys carry giBallOn). On the NEW web every expected key must be PRODUCED by every
# material of its class (count printed as the census); an expected key ABSENT or null on the new web is a FAIL naming the key — a broken reader, never a
# lawful absence. Absence on the OLD (control) web is lawful only for a key the new web produces (the declared rows) — uGiBallOn was absent on BOTH sides
# for a whole round because gv() read a shared uniform for a per-material key, and the amendment's absence rule certified it; this census is what stops
# the next broken reader from getting the same free pass.
INJECTED_EXPECTED = {'venueSh': 'hooked', 'venueGain': 'hooked', 'venueGated': 'hooked', 'venueUniformL1': 'hooked', 'uGiOn': 'hooked', 'uGiBallOn': 'ball'}
CENSUS_LEGACY = False  # --census-legacy (the absentkeylegacy arm): the pre-FIX10 rule — no expected-key census, absence certified
def diff_paths(a, b, path='', under_added=False):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b), key=str):
            child = f'{path}.{k}' if path else str(k)
            if k in SCHEMA_ADDED and k not in a:
                continue                                   # the BASE dump predates this schema key entirely (land20-era dumps) — never a diff
            if k in SCHEMA_ADDED and k not in b:
                yield (child, a.get(k), 'MISSING'); continue  # the NEW dump dropped a schema key the base carries — a regression, judged
            ua = under_added or (k in SCHEMA_ADDED)
            if ua and k not in a and k in b and CROSS_WEB:
                if isinstance(b.get(k), (dict, list)): yield (child, 'MISSING', b.get(k)); continue
                DECLARED.append((child, '<absent on A>', b.get(k))); continue   # amendment 1: absence on the frozen control web → declared (verified complete on B in compare())
            if k not in a: yield (child, 'MISSING', b.get(k)); continue
            if k not in b: yield (child, a.get(k), 'MISSING'); continue
            yield from diff_paths(a.get(k), b.get(k), child, ua)
        return
    if isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        for i, (x, y) in enumerate(zip(a, b)):
            yield from diff_paths(x, y, f'{path}[{i}]', under_added)
        return
    if a != b:
        yield (path, a, b)


IGNORE = {'visible', 'matStats'}  # visibility is a runtime toggle (lampfade / canopy hide), not identity; matStats = the albedo ledger (a derived stat, not a material byte)
# keys ADDED to the census schema after the BEFORE dumps were taken: compared when present on both sides, never
# reported as a diff when absent on one side (ORDER-LIGHT-5 R4: raw linear colour floats beside the clamped hex)
SCHEMA_ADDED = {'colorLin', 'emissiveLin', 'attrHashes', 'grpHash', 'morphHash', 'drawRange',
                'hashBytes', 'elem', 'bytes',
                'injected'}  # + ORDER-LIGHT-C2-FIX9 N6d (refuter law F7): the onBeforeCompile-injected uniform VALUES on hooked unbaked records (venue SH 6 dp, gain, gate, uGiOn / uGiBallOn) — judged where BOTH dumps carry them, never a diff against a dump that predates them  # + NOTE-FENCE-NORMALS (2026-09-09): the widened geometry identity, judged where both sides carry it;
# + ORDER-LIGHT-C2-FIX6 class J (review r8 P2): the byte-true texture hash `hashBytes` (FNV-1a over every byte of a data texture's element buffer) with
# its element type `elem` and length `bytes`, judged where BOTH dumps carry them (a NEW dump vs main's re-dumped baseline, vs a flushed twin) and
# never a diff against a dump that predates them (land20 and earlier carry the sampled-element `hash` only, which stays judged as before)
GEOM_WIDE = ('attrHashes', 'grpHash', 'morphHash', 'drawRange')
ARMS_NA = []  # ORDER-LIGHT-C2-FIX6 J: red arms not applicable to the current base (e.g. hashBytes when the base predates it) — stated in the report, never counted as fired or silent
# ORDER-LIGHT-C2-FIX1 §L31 (land15 attempt 2: the aOccl race). table.js attaches the snooker pocket-furniture transport attribute `aOccl`
# ASYNCHRONOUSLY ("while a part's job is pending the aOccl attribute is simply ABSENT" — the _snkOcclPending drain, budgeted idle slices);
# the capture now flushes those traces through the app's render-determinism seam window.__snkOccl.flush() before every dump and records it
# (settle.flush). The law: a NEW dump without a 'flushed' record is refused (fail closed, exit 3, named); the async attribute is JUDGED
# where BOTH sides carry the flushed record and LISTED (never judged, named) where the BASE predates the flush law — the same shape as
# SCHEMA_ADDED / NOTE-FENCE-NORMALS. Every other attribute is judged exactly as before on both kinds of base.
ASYNC_ATTRS = {'aOccl'}


def flush_state(dump):
    """'flushed' | 'off' | 'seam-absent' | 'absent' (+ the record) — from the dump's settle.flush block (lighting-capture.mjs flushSummary)."""
    f = (dump.get('settle') or {}).get('flush') if isinstance(dump, dict) else None
    if not isinstance(f, dict):
        return 'absent', None
    if f.get('mode') == 'flushed' and f.get('seam') is True:
        return 'flushed', f
    return str(f.get('mode') or 'absent'), f


def _async_row(x):
    p = x[1] if isinstance(x, tuple) and len(x) > 1 else ''
    return isinstance(p, str) and p.startswith('attrHashes.') and p.split('.', 1)[1] in ASYNC_ATTRS


def apply_flush_law(r, base, new):
    """Mutates a compare() result: r['flush'] (both sides' state), r['settle_flush_missing'] (NEW not flushed → blocking), r['async_attr_rows']
    (rows moved out of the judged lists because the BASE predates the flush law; empty when both sides are flushed — then they stay judged)."""
    ns, nf = flush_state(new); bs, bf = flush_state(base)
    r['flush'] = {'new': ns, 'base': bs, 'new_rec': nf, 'base_rec': bf}
    r['settle_flush_missing'] = ns != 'flushed'
    r['async_attr_rows'] = []
    if ns == 'flushed' and bs != 'flushed':
        for cls in ('table_diffs', 'room_diffs', 'unbaked_diffs'):
            moved = [x for x in r[cls] if _async_row(x)]
            if moved:
                r[cls] = [x for x in r[cls] if not _async_row(x)]
                r['async_attr_rows'] += [(cls,) + tuple(x) for x in moved]
        r['table_identical'] = not r['table_diffs'] and not r['table_missing']
        r['room_identical'] = not r['room_diffs'] and not r['room_missing']
        r['unbaked_identical'] = not r['unbaked_diffs'] and not r['unbaked_missing']
    return r


def flush_arms(new, base, term):
    """§L31 red arms on deep copies: (1) NEW without the flush record → refused; (2) NEW with mode 'off' (the settleflushoff capture) → refused;
    (3) an aOccl perturbation on the NEW copy vs a FLUSHED base (the NEW itself) → JUDGED (the table reads not identical, the row is in table_diffs);
    (4) the same perturbation vs a base WITHOUT the flush record → LISTED (async_attr_rows carries it, the table reads identical).
    Returns [(label, fired | None, note)]; None = not fireable here (no table mesh carries an async attribute in this dump)."""
    out = []
    nn = copy.deepcopy(new); (nn.setdefault('settle', {}) or {}).pop('flush', None)
    rr = apply_flush_law(compare(base, nn, term=term), base, nn); out.append(('flush-missing@new', bool(rr['settle_flush_missing']), 'the record removed'))
    nn = copy.deepcopy(new); nn.setdefault('settle', {})['flush'] = {**((new.get('settle') or {}).get('flush') or {}), 'mode': 'off', 'seam': None}
    rr = apply_flush_law(compare(base, nn, term=term), base, nn); out.append(('flush-off@new', bool(rr['settle_flush_missing']), 'mode off'))
    recs = records(new, False); cand = [k for k in sorted(recs) if isinstance(recs[k].get('attrHashes'), dict) and any(a in recs[k]['attrHashes'] for a in ASYNC_ATTRS)]
    if flush_state(new)[0] != 'flushed' or not cand:
        out.append(('aOccl-judged@flushed-base', None, 'no table mesh carries an async attribute in this (flushed) NEW dump' if flush_state(new)[0] == 'flushed' else 'the NEW dump is not flushed'))
        out.append(('aOccl-listed@preflush-base', None, 'same'))
        return out
    k = cand[0]; a = next(a for a in ASYNC_ATTRS if a in recs[k]['attrHashes'])
    nn = copy.deepcopy(new); records(nn, False)[k]['attrHashes'][a] = 'ff:ff:' + str(recs[k]['attrHashes'][a]).split(':', 2)[-1]
    bb = copy.deepcopy(new)  # a flushed base = the NEW itself
    rr = apply_flush_law(compare(bb, nn, term=term), bb, nn)
    out.append(('aOccl-judged@flushed-base', (not rr['table_identical']) and any(x[0] == k and x[1] == f'attrHashes.{a}' for x in rr['table_diffs']) and not rr['async_attr_rows'], f'{k[2]}.{a}'))
    b2 = copy.deepcopy(new); (b2.setdefault('settle', {}) or {}).pop('flush', None)
    rr = apply_flush_law(compare(b2, nn, term=term), b2, nn)
    out.append(('aOccl-listed@preflush-base', rr['table_identical'] and len(rr['async_attr_rows']) == 1 and rr['async_attr_rows'][0][1] == k and not rr['settle_flush_missing'], f'{k[2]}.{a} listed, not judged'))
    return out


def compare_set(A, B):
    diffs = []
    missing = sorted(set(A) ^ set(B))
    for k in sorted(set(A) & set(B)):
        a = {kk: v for kk, v in A[k].items() if kk not in IGNORE}
        b = {kk: v for kk, v in B[k].items() if kk not in IGNORE}
        DECLARED.clear()
        for path, x, y in diff_paths(a, b):
            diffs.append((k, path, x, y))
        for path, x, y in DECLARED: DECLARED_ROWS.append((k, path, x, y))
        DECLARED.clear()
    return diffs, missing


def _mat_slots(m):
    """A mesh record's material slots as [(path, record-or-None)] — one per slot for multi-material meshes."""
    mat = m.get('material')
    if isinstance(mat, list):
        return [(f'material[{i}].{PROGRAM_WITNESS}', x if isinstance(x, dict) else None) for i, x in enumerate(mat)]
    return [(f'material.{PROGRAM_WITNESS}', mat if isinstance(mat, dict) else None)]


def witness_rows(A, B):
    """ORDER-LAND-638-FIX4 verifier item 4: per-mesh compiled-program witness over the meshes present on both sides.
    Returns (rows, covered, total): rows = (key, path, x, y) for every slot whose progHash is null / missing on either
    side (x/y carry 'MISSING' for the absent side — fail closed, the mesh is named); covered = slots carrying a
    non-null witness on BOTH sides; total = slots compared. Value mismatches (both non-null, different) are already
    yielded by diff_paths and are not duplicated here."""
    rows = []; covered = 0; total = 0; unrendered = 0
    for k in sorted(set(A) & set(B)):
        sa, sb = _mat_slots(A[k]), _mat_slots(B[k])
        for i in range(max(len(sa), len(sb))):
            pa, ma = sa[i] if i < len(sa) else (sb[i][0], None)
            _, mb = sb[i] if i < len(sb) else (None, None)
            total += 1
            xa = ma.get(PROGRAM_WITNESS) if ma else None
            xb = mb.get(PROGRAM_WITNESS) if mb else None
            if xa is None and xb is None and not A[k].get('visible', True) and not B[k].get('visible', True):
                # a mesh hidden on BOTH sides never compiled a program — there is no compiled GLSL to compare by definition
                # (its geometry / material / matrix fields are still judged); one side visible with a program is a difference
                unrendered += 1
            elif xa is None or xb is None:
                # one side (or both, on a mesh visible on at least one side) without a compiled-program witness: named, blocking
                rows.append((k, pa, xa if xa is not None else 'MISSING', xb if xb is not None else 'MISSING'))
            else:
                covered += 1
    return rows, covered, total, unrendered


def _is_witness_null_row(row):
    return row[1].split('.')[-1] == PROGRAM_WITNESS and (row[2] is None or row[3] is None)


def _is_witness_named_missing(row):
    return row[1].split('.')[-1] == PROGRAM_WITNESS and (row[2] == 'MISSING' or row[3] == 'MISSING')


# ORDER-LIGHT-C2 (c) (review r2 P2, lighting-fence.py:182-185): every program-field EXEMPTION applies only to a difference between two
# PRESENT hashes. A null / MISSING witness on either side is a missing witness — blocking regardless of the census (venue term or
# not), the class (table / room / unbaked) or a named --expect-moved mesh.
def _present_pair(row):
    return row[1].split('.')[-1] in ('progHash', 'progKey') and row[2] not in (None, 'MISSING') and row[3] not in (None, 'MISSING')


def _missing_witness(row):
    return row[1].split('.')[-1] in ('progHash', 'progKey') and (row[2] in (None, 'MISSING') or row[3] in (None, 'MISSING'))


# NOTE-672 / C2 (c): the fields a --expect-moved mesh may legitimately move in (main's own MESH change) — never a witness field
EXPECT_MOVED_FIELDS = ('tris', 'verts', 'posHash', 'nrmHash', 'uvHash', 'colHash', 'idxHash', 'bbox', 'matrixWorld', 'grpHash', 'morphHash', 'drawRange')


def split_expected(table_diffs, prefixes):
    """(expected_rows, judged_rows): geometry rows of the named meshes are expected; everything else on them — a material field, a
    missing witness — stays judged."""
    exp = [x for x in table_diffs if prefixes and isinstance(x[0], tuple) and len(x[0]) > 2 and x[0][2] and any(str(x[0][2]).startswith(pf) for pf in prefixes)
           and (x[1].split('.')[-1] in EXPECT_MOVED_FIELDS or x[1].startswith('attrHashes.') or x[1].startswith('drawRange[')) and not _missing_witness(x)]
    return exp, [x for x in table_diffs if x not in exp]


def _srgb8(m):
    """A material record's colour as sRGB 8-bit ints: raw linear floats (colorLin) encoded with the sRGB OETF (what
    three's getHexString does), else the census hex. None when neither is present."""
    cl = m.get('colorLin')
    if isinstance(cl, list) and len(cl) == 3:
        def enc(x):
            x = max(0.0, min(1.0, float(x)))
            return int(round(255 * (12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055)))
        return tuple(enc(x) for x in cl)
    h = m.get('color')
    if isinstance(h, str) and h.startswith('0x') and len(h) == 8:
        return tuple(int(h[i:i + 2], 16) for i in (2, 4, 6))
    return None


def colour_same(ma, mb):
    """True when the two records' colours agree to within 1/255 per channel in sRGB (hex precision)."""
    a, b = _srgb8(ma), _srgb8(mb)
    return a is not None and b is not None and all(abs(x - y) <= 1 for x, y in zip(a, b))


def compare(base, new, term=False):
    """term=True: the NEW side's table carries a venue term (census venue.sh) — the term hides the table-owned light probe, which moves
    the compiled define set of EVERY lit program on that table, so per-mesh table program identity vs main is undefined there by design;
    those rows are LISTED (table_program_diffs) and judged by the per-class predicate (--program-report), not per mesh. Tables without
    a term (no probe hidden, no rig change) are judged per mesh. (ORDER-LAND-638-FIX4 verifier item 4, measured: wpa 57/57 table slots
    identical vs main, Predator 85/85 table slots differ by the define set.)"""
    DECLARED_ROWS.clear(); DECLARED.clear()  # C2-FIX9 N6d: the declared rows of THIS comparison
    tb, tn = records(base, False), records(new, False)
    rb, rn = records(base, True), records(new, True)
    ub, un = records(base, False, 'unbaked'), records(new, False, 'unbaked')
    td, tm = compare_set(tb, tn)
    rd, rm = compare_set(rb, rn)
    ud, um = compare_set(ub, un)
    # ORDER-LAND-638-FIX4 verifier item 4: TABLE progHash judged per mesh — null/missing slots become named rows
    # (diff_paths' own None-vs-value rows for the same slot are replaced by the explicit MISSING rows)
    wrows, wcov, wtot, wunr = witness_rows(tb, tn)
    td = [x for x in td if not _is_witness_null_row(x)] + wrows
    # C2 (c): the venue-term exemption covers PRESENT-vs-PRESENT program differences only; a null / MISSING witness stays in td (blocking)
    tprog = [x for x in td if _present_pair(x)] if term else []
    if term: td = [x for x in td if not _present_pair(x)]
    # UNBAKED (balls / cue): the venue fill hook moves obc / cacheKey / progHash / progKey between two PRESENT values — listed; a missing
    # witness (progHash / progKey null on one side) is judged
    # ROOM programs legitimately differ under the venue term: PRESENT-vs-PRESENT witness rows are listed, never judged (even
    # --room-strict); a missing witness on a room mesh is judged like any other room field — the per-mesh witness sweep (null on EITHER
    # side, both-sides-null on a visible mesh included) runs for the room and unbaked classes too (refuter P3)
    rw, rwc, rwt, rwu = witness_rows(rb, rn); uw, uwc, uwt, uwu = witness_rows(ub, un)
    rd = [x for x in rd if not _is_witness_null_row(x)] + rw
    ud = [x for x in ud if not _is_witness_null_row(x)] + uw
    uprog = [x for x in ud if x[1].split('.')[-1] in PROGRAM_FIELDS and not _missing_witness(x)]
    uother = [x for x in ud if not (x[1].split('.')[-1] in PROGRAM_FIELDS and not _missing_witness(x))]
    rprog = [x for x in rd if _present_pair(x)]
    rother = [x for x in rd if not _present_pair(x)]
    # NOTE-FENCE-NORMALS: where the widened geometry identity is JUDGED (both sides carry attrHashes) vs pre-schema on the base / the new side
    def wide(A, B):
        both = sum(1 for k in set(A) & set(B) if isinstance(A[k].get('attrHashes'), dict) and isinstance(B[k].get('attrHashes'), dict))
        base_pre = sum(1 for k in set(A) & set(B) if not isinstance(A[k].get('attrHashes'), dict))
        new_pre = sum(1 for k in set(A) & set(B) if not isinstance(B[k].get('attrHashes'), dict))
        attrs = sorted({a for k in B for a in (B[k].get('attrHashes') or {})})
        return {'judged': both, 'base_pre': base_pre, 'new_pre': new_pre, 'attrs': attrs}
    # C2-FIX9 N6d amendments 2 + 4: B completeness and the derived count. A declared field must be reported NON-NULL by EVERY B-side hooked material
    # (a material record with `injected`); the number of declared rows must equal hooked B materials × declared fields. Either failure is a judged
    # unbaked difference (the fence FAILS), never a declaration.
    declared = list(DECLARED_ROWS); fields = sorted({p_.split('.')[-1] for _k, p_, _x, _y in declared if '.injected.' in p_ or p_.startswith('injected.')})
    hooked = [(k_, (un[k_]['material'][0] if isinstance(un[k_].get('material'), list) else un[k_].get('material'))) for k_ in sorted(un)]
    hooked = [(k_, m_) for k_, m_ in hooked if isinstance(m_, dict) and isinstance(m_.get('injected'), dict)]
    if fields:
        for k_, m_ in hooked:
            for f_ in fields:
                v_ = m_['injected'].get(f_, 'MISSING')
                if v_ == 'MISSING' or v_ is None:
                    uother.append((k_, f'material.injected.{f_}', '<declared field on every B material>', v_ if v_ == 'MISSING' else None))
        expect_n = len(hooked) * len(fields)
        if len(declared) != expect_n:
            uother.append(((0, 0, 'declared-count'), 'material.injected.*', f'{len(declared)} declared row(s)', f'expected {expect_n} = {len(hooked)} hooked B material(s) x {len(fields)} field(s)'))
    # C2-FIX10 class Z: the expected-key census on the NEW web — every key in INJECTED_EXPECTED must be produced by every hooked (or ball) B material
    census = {}
    for f_, cls_ in INJECTED_EXPECTED.items():
        want = [(k_, m_) for k_, m_ in hooked if cls_ == 'hooked' or ('giBallOn' in (m_.get('userDataKeys') or []))]
        have = [(k_, m_) for k_, m_ in want if m_['injected'].get(f_) is not None]
        census[f_] = {'class': cls_, 'expected': len(want), 'produced': len(have)}
        if not CENSUS_LEGACY:
            for k_, m_ in want:
                if m_['injected'].get(f_) is None:
                    uother.append((k_, f'material.injected.{f_}', f'<expected key of class {cls_}: produced on the new web>', 'ABSENT (reader broken or key not produced — not a lawful absence; C2-FIX10 class Z)'))
    return {'declared_rows': declared, 'declared_fields': fields, 'declared_expect': (len(hooked) * len(fields)) if fields else 0, 'declared_hooked': len(hooked), 'injected_census': census,
            'table_meshes': (len(tb), len(tn)), 'room_meshes': (len(rb), len(rn)), 'unbaked_meshes': (len(ub), len(un)),
            'room_witness': (rwc, rwt, len(rw), rwu), 'unbaked_witness': (uwc, uwt, len(uw), uwu),
            'wide': {'table': wide(tb, tn), 'room': wide(rb, rn), 'unbaked': wide(ub, un)},
            'table_identical': not td and not tm, 'table_diffs': td, 'table_missing': tm,
            'table_witness': (wcov, wtot, len(wrows), wunr),
            'table_program_diffs': tprog, 'term': term,
            'room_identical': not rother and not rm, 'room_diffs': rother, 'room_missing': rm, 'room_program_diffs': rprog,
            'unbaked_identical': not uother and not um, 'unbaked_diffs': uother, 'unbaked_missing': um, 'unbaked_program_diffs': uprog}


def unbaked_arm(base):
    """Mutate a non-program field (roughness) on the first UNBAKED material: the comparator must fire."""
    recs = records(base, False, 'unbaked')
    if not recs:
        return ('unbaked-roughness', False, 'no unbaked meshes')
    new = copy.deepcopy(base)
    nrecs = records(new, False, 'unbaked')
    k = sorted(nrecs)[0]
    mat = nrecs[k]['material']
    mat = mat[0] if isinstance(mat, list) else mat
    mat['roughness'] = (mat.get('roughness') or 0) + 0.05
    r = compare(base, new)
    return ('unbaked-roughness', not r['unbaked_identical'], k[2] or f'(anon #{k[0]}:{k[1]})')


def red_arm(base):
    """Mutate one field per class on a deep copy of a TABLE-owned mesh and assert the comparator fires."""
    arms = []
    ARMS_NA.clear()  # C2-FIX6 J: arms not applicable to this base (stated in the report; module-level so main() can print it beside the verdict)
    keys = [k for k in records(base, False)]
    if not keys:
        return [('no-table-meshes', False)]

    def mutate(label, fn):
        new = copy.deepcopy(base)
        recs = records(new, False)
        fn(new, recs)
        r = compare(base, new)
        arms.append((label, not r['table_identical']))

    def first_with(recs, pred):
        for k in sorted(recs):
            m = recs[k]
            mats = m['material'] if isinstance(m['material'], list) else [m['material']]
            for mat in mats:
                if mat and pred(mat):
                    return m, mat
        return None, None

    def mut_mat(label, field, val):
        def fn(new, recs):
            m, mat = first_with(recs, lambda mt: mt.get(field) is not None)
            if mat is None:
                m = recs[sorted(recs)[0]]; mat = m['material'] if not isinstance(m['material'], list) else m['material'][0]
            mat[field] = val
        mutate(label, fn)

    mut_mat('material.color', 'color', '0x123456')
    mut_mat('material.roughness', 'roughness', 0.123456)
    mut_mat('material.envMapIntensity', 'envMapIntensity', 9.87)
    mut_mat('material.clearcoat', 'clearcoat', 0.4321)
    mut_mat('material.cls', 'cls', 'MeshRedArmMaterial')

    def fn_map(new, recs):
        m, mat = first_with(recs, lambda mt: mt.get('maps'))
        if mat is None:
            m = recs[sorted(recs)[0]]; mat = m['material'] if not isinstance(m['material'], list) else m['material'][0]
            mat['maps'] = {}
        mat['maps']['map'] = {'hash': 'deadbeef', 'w': 1, 'h': 1}
    mutate('material.map-hash', fn_map)

    # ORDER-LIGHT-C2-FIX6 class J (J4): the byte-true texture hash is a judged field where both dumps carry it — the arm flips a NEW hashBytes on a
    # material whose BASE carries one (a base that predates the field cannot arm it: SCHEMA_ADDED would rightly skip the diff) and the fence must
    # flag it. Applicability is stated, never silently passed: without a base hashBytes the arm is reported n/a and does not count as fired.
    def _has_hb(mat):
        maps = mat.get('maps') or {}
        return any(isinstance(v, dict) and v.get('hashBytes') for v in maps.values())
    _bm, _bmat = first_with(records(copy.deepcopy(base), False), _has_hb)
    if _bmat is not None:
        def fn_hb(new, recs):
            m, mat = first_with(recs, _has_hb)
            for slot, v in (mat.get('maps') or {}).items():
                if isinstance(v, dict) and v.get('hashBytes'): v['hashBytes'] = 'deadbeef:' + str(v.get('bytes') or 0); break
        mutate('material.map-hashBytes', fn_hb)
    else:
        ARMS_NA.append('material.map-hashBytes (n/a: the BASE dump predates the byte-true hash — judged only where both sides carry it)')

    def fn_geo(new, recs):
        m = recs[sorted(recs)[0]]; m['posHash'] = 'ff:ff:1'
    mutate('geometry.posHash', fn_geo)

    def fn_mw(new, recs):
        m = recs[sorted(recs)[0]]; m['matrixWorld'][12] += 0.001
    mutate('matrixWorld', fn_mw)

    def fn_rm(new, recs):
        k = sorted(recs)[0]
        new['meshes'] = [mm for mm in new['meshes'] if not (mm['root'] == k[0] and mm['order'] == k[1] and mm['name'] == k[2])]
    mutate('mesh-removed', fn_rm)
    arms += prog_arms(base)
    return arms


def c2_arms(base, term_table):
    """ORDER-LIGHT-C2 (c) arms — each nulls the progHash of a VISIBLE mesh on a deep copy (one side; and both sides for the room / unbaked
    classes) and asserts the comparator still fires through the exemption branch that used to swallow it: (1) a TABLE mesh under the venue
    term (term=True), (2) a ROOM mesh, (3) an UNBAKED mesh, (4) a TABLE mesh named by --expect-moved (the row must stay judged, and the OLD
    all-fields predicate must have expected it — so the arm proves the difference the fix makes). Each arm requires the base's own witness
    to be COMPLETE for its class (compare(base, base) yields no missing-witness row there) — an arm on a comparator already failing closed
    on the missing field is not evidence (refuter NOTE)."""
    out = []
    selfc = compare(base, base, term=term_table)
    complete = {'table': not any(_missing_witness(x) for x in selfc['table_diffs']),
                'room': not any(_missing_witness(x) for x in selfc['room_diffs']),
                'unbaked': not any(_missing_witness(x) for x in selfc['unbaked_diffs'])}
    def null_first(recs_fn, cls, label, judge, both=False):
        recs = recs_fn(base)
        vis = [k for k in sorted(recs) if recs[k].get('visible', True)]
        if not vis or not complete[cls]:
            out.append((label, False)); return
        new = copy.deepcopy(base); nrecs = recs_fn(new); k = vis[0]
        m = nrecs[k]; mat = m['material'][0] if isinstance(m['material'], list) else m['material']
        if not isinstance(mat, dict) or mat.get(PROGRAM_WITNESS) is None:
            out.append((label, False)); return
        mat[PROGRAM_WITNESS] = None
        b2 = base
        if both:
            b2 = copy.deepcopy(base); brecs = recs_fn(b2); bm = brecs[k]; bmat = bm['material'][0] if isinstance(bm['material'], list) else bm['material']; bmat[PROGRAM_WITNESS] = None
        out.append((label, judge(b2, new, k)))
    null_first(lambda d: records(d, False), 'table', 'progHash-null@term-table',
               lambda b2, new, k: (not compare(b2, new, term=True)['table_identical']) and any(x[0] == k and _missing_witness(x) for x in compare(b2, new, term=True)['table_diffs']))
    null_first(lambda d: records(d, True), 'room', 'progHash-null@room', lambda b2, new, k: not compare(b2, new, term=term_table)['room_identical'])
    null_first(lambda d: records(d, True), 'room', 'progHash-null-both@room', lambda b2, new, k: not compare(b2, new, term=term_table)['room_identical'], both=True)
    null_first(lambda d: records(d, False, 'unbaked'), 'unbaked', 'progHash-null@unbaked', lambda b2, new, k: not compare(b2, new, term=term_table)['unbaked_identical'])
    null_first(lambda d: records(d, False, 'unbaked'), 'unbaked', 'progHash-null-both@unbaked', lambda b2, new, k: not compare(b2, new, term=term_table)['unbaked_identical'], both=True)
    def expect_judge(b2, new, k):
        r = compare(b2, new, term=term_table)
        pf = str(k[2] or '')[:6]  # an anonymous mesh has the empty prefix, which every name starts with — the branch is still exercised
        exp, judged = split_expected(r['table_diffs'], [pf])
        old_exp = [x for x in r['table_diffs'] if isinstance(x[0], tuple) and len(x[0]) > 2 and str(x[0][2] or '').startswith(pf)]  # the pre-C2 predicate: every field on the named mesh
        row_old = any(x[0] == k and _missing_witness(x) for x in old_exp)
        return row_old and any(x[0] == k and _missing_witness(x) for x in judged) and not any(x[0] == k for x in exp)
    null_first(lambda d: records(d, False), 'table', 'progHash-null@expect-moved', expect_judge)
    return out


def attr_arms(new):
    """NOTE-FENCE-NORMALS: one red arm per geometry attribute the renderer reads, on the NEW dump (the side that carries the widened
    identity): the named hashes (normals FIRST, then uv, index, color), the groups hash, the morph hash, the draw range, and every key of
    attrHashes found on the first table mesh (normal, uv, uv1 / uv2, tangent, color, …). Each perturbs that ONE field on a deep copy and
    asserts table_identical goes False. Returns [(label, fired, note)]; a field absent on the mesh is listed as absent (not a silent arm),
    and a NEW dump without attrHashes at all is a pre-schema dump (fail closed)."""
    recs = records(new, False)
    if not recs:
        return [('attr:no-table-meshes', False, 'no table meshes')], False
    k0 = sorted(recs)[0]; m0 = recs[k0]
    if not isinstance(m0.get('attrHashes'), dict):
        return [('attr:pre-schema-new', False, 'the NEW dump carries no attrHashes — captured by a pre-addendum tool')], False
    out = []
    def mut(label, fn, present):
        if not present:
            out.append((label, None, 'absent on this table\'s first mesh (no such attribute)')); return
        d = copy.deepcopy(new); r = records(d, False)[k0]; fn(r)
        out.append((label, not compare(new, d)['table_identical'], ''))
    mut('geometry.nrmHash', lambda r: r.__setitem__('nrmHash', 'ff:ff:2'), m0.get('nrmHash') is not None)
    for a in sorted(m0['attrHashes'], key=lambda x: (x != 'normal', x)):
        mut(f'geometry.attrHashes.{a}', lambda r, a=a: r['attrHashes'].__setitem__(a, 'ff:ff:3:' + str(r['attrHashes'][a]).split(':', 1)[-1]), True)
    for a in ('tangent', 'uv1', 'uv2'):
        if a not in m0['attrHashes']: out.append((f'geometry.attrHashes.{a}', None, 'absent on this table\'s first mesh (no such attribute)'))
    mut('geometry.uvHash', lambda r: r.__setitem__('uvHash', 'ff:ff:4'), m0.get('uvHash') is not None)
    mut('geometry.idxHash', lambda r: r.__setitem__('idxHash', 'ff:ff:5'), m0.get('idxHash') is not None)
    mut('geometry.colHash', lambda r: r.__setitem__('colHash', 'ff:ff:6'), m0.get('colHash') is not None)
    mut('geometry.grpHash', lambda r: r.__setitem__('grpHash', 'ff:ff:7'), m0.get('grpHash') is not None)
    mut('geometry.morphHash', lambda r: r.__setitem__('morphHash', 'x:ff:ff:8'), m0.get('morphHash') is not None)
    mut('geometry.drawRange', lambda r: r.__setitem__('drawRange', [1, 2]), isinstance(m0.get('drawRange'), list))
    return out, True


def prog_arms(base):
    """ORDER-LAND-638-FIX4 verifier item 4: two progHash arms on a TABLE-owned material slot — (a) the value changed,
    (b) the value nulled. Each fires only when the base's own witness is COMPLETE (compare(base, base) yields no
    progHash row) AND the mutated compare yields a progHash row naming the mutated mesh; on a census without the
    witness both arms report silent with the reason (the comparator fails closed there anyway, but an arm firing on
    an already-failing comparator is not evidence)."""
    recs = records(base, False)
    if not recs:
        return [('material.progHash', False), ('material.progHash-null', False)]
    self_rows = [x for x in compare(base, base)['table_diffs'] if x[1].split('.')[-1] == PROGRAM_WITNESS]
    out = []
    for label, val in (('material.progHash', 'deadbeef:deadbeef:1'), ('material.progHash-null', None)):
        new = copy.deepcopy(base)
        nrecs = records(new, False)
        k = sorted(nrecs)[0]
        m = nrecs[k]; mat = m['material'][0] if isinstance(m['material'], list) else m['material']
        mat[PROGRAM_WITNESS] = val
        rows = [x for x in compare(base, new)['table_diffs'] if x[0] == k and x[1].split('.')[-1] == PROGRAM_WITNESS]
        out.append((label, not self_rows and bool(rows)))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', required=True); ap.add_argument('--new', required=True)
    ap.add_argument('--tables', required=True); ap.add_argument('--looks', default='default,sp')
    ap.add_argument('--census-legacy', action='store_true', help='C2-FIX10 class Z arm (absentkeylegacy): the pre-FIX10 rule without the expected-key census — an absent expected key on the new web is not judged (the fence must then PASS a dump whose reader was broken; the arm proves the census is what catches it)')
    ap.add_argument('--room-strict', action='store_true'); ap.add_argument('--red-arm', action='store_true')
    ap.add_argument('--room-report', action='store_true', help='append per-table ROOM-material identity rows (before → after)')
    ap.add_argument('--program-report', action='store_true', help='ORDER-LIGHT-6 Q1a: compiled-GLSL programs census rows per material class from the NEW census.json')
    ap.add_argument('--program-arm', help='capture dir booted with ?venueArm=wallfill — its room class must carry the fill term (RED)')
    # NOTE-672-LANDED: a geometry change that arrived from MAIN (not the lane) is EXPECTED by name — `--expect-moved TABLE:MESHPREFIX` (repeatable)
    # lists those table diffs under 'EXPECTED (named)' with the reason and excludes them from the verdict; every other geometry row is judged as before
    ap.add_argument('--expect-moved', action='append', default=[], help='TABLE:MESHPREFIX — geometry rows of meshes with that name prefix on that table are expected (named), not judged')
    ap.add_argument('--expect-moved-reason', default='', help='why the named geometry moved (the record names it)')
    ap.add_argument('--out')
    ap.add_argument('--json', help='ORDER-LAND-638-FIX4 verifier item 4: machine-readable per-row summary (table witness coverage, arms, verdict)')
    a = ap.parse_args()
    # C2-FIX9 N6d amendment 3: the declared path exists only for the CROSS-WEB control fence — the two dumps' manifests name different web roots
    global CROSS_WEB, WEB_A, WEB_B, CENSUS_LEGACY
    CENSUS_LEGACY = bool(getattr(a, 'census_legacy', False))
    def _web(d):
        try: return str(json.load(open(os.path.join(d, 'manifest.json'))).get('webDir') or '') or None
        except Exception: return None
    WEB_A, WEB_B = _web(a.base), _web(a.new); CROSS_WEB = bool(WEB_A and WEB_B and WEB_A != WEB_B)
    lines = ['# lighting fence — mesh + material identity (table-owned roots; UNBAKED balls/cue judged on every non-program field)', '',
             f"declared-row rule (C2-FIX9 N6d): {'CROSS-WEB pair (base web ' + str(WEB_A) + ' vs new web ' + str(WEB_B) + ') — a field ABSENT from the base web and present, non-null, on EVERY new-side hooked material is DECLARED (listed, not judged); the count must equal hooked materials x fields; three red arms per table' if CROSS_WEB else 'SAME-WEB pair (web ' + str(WEB_A or WEB_B) + ') — the declared path cannot be taken; every field is judged'}", '',
             f'base `{a.base}` vs new `{a.new}`', '',
             'table progHash witness = TABLE-owned material slots whose COMPILED vertex+fragment GLSL hash (IDENTITY_SRC progWitness) is present on both sides / slots compared; '
             'a null or missing slot is a named DIFFERENCE (fail closed) — ORDER-LAND-638-FIX4 verifier item 4', '',
             'settle flush (ORDER-LIGHT-C2-FIX1 §L31): every NEW dump must carry the occlusion-trace flush record (window.__snkOccl.flush() before the dump; '
             'settle.flush.mode = flushed) — a dump without it is refused by name; the async transport attribute (aOccl) is judged where both sides carry the record and '
             'listed, never judged, where the base predates the law', '',
             '| look | table | table meshes b/n | table identical | table progHash witness (missing) | unbaked b/n | unbaked identical (program-field rows) | room meshes b/n | room identical (diffs; program rows listed) | verdict |', '|---|---|---|---|---|---|---|---|---|---|']
    ok = True; details = []; rows_json = []
    for look in a.looks.split(','):
        for t in a.tables.split(','):
            (bid, bwhy), (nid, nwhy) = tree_table_id(a.base, look, t), tree_table_id(a.new, look, t)
            b, n = load(a.base, look, t), load(a.new, look, t)
            if b is None or n is None:
                lines.append(f'| {look} | {t} | — | MISSING dump ({"base: " + str(bwhy) if b is None else "new: " + str(nwhy)}) | — | — | — | — | **FAIL** |'); ok = False; continue
            tl = t if bid == nid else f'{t} (base {bid} / new {nid})'
            # the NEW census tells whether this table carries a venue term (see compare()'s docstring)
            try: cen_t = json.load(open(dump_path(a.new, look, t, 'census.json'))); term_t = bool(((cen_t.get('lighting') or {}).get('venue') or {}).get('sh'))
            except Exception: term_t = False
            r = compare(b, n, term=term_t)
            # NOTE-672: split the named EXPECTED geometry rows (main's own mesh change) from the judged ones
            prefixes = [e.split(':', 1)[1] for e in a.expect_moved if e.split(':', 1)[0] == t and ':' in e]
            r['table_expected'], judged = split_expected(r['table_diffs'], prefixes)  # C2 (c): geometry fields only, never a missing witness
            if r['table_expected']:
                r['table_diffs'] = judged
                r['table_identical'] = not r['table_diffs'] and not r['table_missing']
            # ORDER-LIGHT-C2-FIX1 class B (review r3 P2, lighting-fence.py:450): a MISSING shader witness on a visible ROOM mesh is BLOCKING
            # regardless of the room-material exemption — the exemption (room rows listed, not judged, without --room-strict) covers
            # present-vs-present rows only; the verdict implements what the NOTE-FENCE addendum states. Named per mesh below and in the JSON.
            room_witness_missing = [x for x in r['room_diffs'] if _missing_witness(x)]
            r['room_witness_missing'] = room_witness_missing
            apply_flush_law(r, b, n)  # ORDER-LIGHT-C2-FIX1 §L31: the flush record + the async-attribute split
            verdict = r['table_identical'] and r['unbaked_identical'] and (r['room_identical'] or not a.room_strict) and not room_witness_missing and not r['settle_flush_missing']
            # C2-FIX9 N6d amendment 4: the rule's own red arms — on a cross-web pair with declared rows, a copy of the NEW dump that (i) drops one declared
            # field on one hooked material, (ii) nulls it, (iii) drops the whole `injected` parent on one material must each make the fence FAIL; an arm that
            # does not fire fails the table (a rule that can only pass is not a rule)
            r['declared_arms'] = []
            if CROSS_WEB and r.get('declared_rows'):
                f0 = r['declared_fields'][0]
                def _arm(label, mut):
                    nn = copy.deepcopy(n); recs = records(nn, False, 'unbaked')
                    for k_ in sorted(recs):
                        m_ = recs[k_]['material'][0] if isinstance(recs[k_].get('material'), list) else recs[k_].get('material')
                        if isinstance(m_, dict) and isinstance(m_.get('injected'), dict): mut(m_); break
                    rr = compare(b, nn, term=term_t); return (label, not rr['unbaked_identical'])
                r['declared_arms'] = [_arm('drop-field@new', lambda m_: m_['injected'].pop(f0, None)), _arm('null-field@new', lambda m_: m_['injected'].__setitem__(f0, None)), _arm('drop-parent@new', lambda m_: m_.pop('injected', None))]
                r = compare(b, n, term=term_t) if False else r  # (the arms used deep copies; r is untouched)
                if not all(f for _l, f in r['declared_arms']): verdict = False
            ok = ok and verdict
            wcov, wtot, wmiss, wunr = r['table_witness']
            lines.append(f"| {look} | {tl} | {r['table_meshes'][0]}/{r['table_meshes'][1]} | {'YES' if r['table_identical'] else 'NO'}{(' (term table: ' + str(len(r['table_program_diffs'])) + ' table-owned program rows LISTED, judged by the class predicate)') if r['term'] else ''} | {wcov}/{wtot} ({wmiss} missing, {wunr} unrendered on both sides) "
                         f"| {r['unbaked_meshes'][0]}/{r['unbaked_meshes'][1]} | {'YES' if r['unbaked_identical'] else 'NO'} ({len(r['unbaked_program_diffs'])} program-field rows) "
                         f"| {r['room_meshes'][0]}/{r['room_meshes'][1]} | {'YES' if r['room_identical'] else 'NO'} ({len(r['room_diffs'])}+{len(r['room_missing'])}; {len(r['room_program_diffs'])} program rows{'; WITNESS MISSING ' + str(len(room_witness_missing)) + ' — blocking' if room_witness_missing else ''}) | {'PASS' if verdict else '**FAIL**'} |")
            rows_json.append({'look': look, 'table': t, 'base_id': bid, 'new_id': nid, 'cross_web': CROSS_WEB, 'declared_rows': len(r.get('declared_rows') or []), 'declared_fields': r.get('declared_fields') or [], 'declared_expect': r.get('declared_expect', 0), 'declared_arms': r.get('declared_arms') or [], 'table_identical': r['table_identical'], 'table_meshes': r['table_meshes'],
                              'table_witness': {'covered': wcov, 'total': wtot, 'missing': wmiss, 'unrendered_both': wunr}, 'table_diff_rows': len(r['table_diffs']),
                              'term_table': r['term'], 'table_program_rows_listed': len(r['table_program_diffs']),
                              'unbaked_identical': r['unbaked_identical'], 'unbaked_program_rows': len(r['unbaked_program_diffs']),
                              'room_identical': r['room_identical'], 'room_program_rows': len(r['room_program_diffs']), 'room_witness_missing': len(room_witness_missing), 'room_witness_missing_meshes': [str(k[2] or '(anon #%d:%d)' % (k[0], k[1])) for k, _, _, _ in room_witness_missing[:12]], 'table_expected_rows': len(r.get('table_expected') or []), 'table_expected_meshes': sorted({str(k[2]) for k, _, _, _ in (r.get('table_expected') or [])}), 'verdict': 'PASS' if verdict else 'FAIL'})
            rows_json[-1].update({'settle_flush_new': r['flush']['new'], 'settle_flush_base': r['flush']['base'], 'settle_flush_missing': bool(r['settle_flush_missing']),
                                 'async_attr_rows': len(r['async_attr_rows']), 'async_attr_meshes': sorted({str(x[1][2]) for x in r['async_attr_rows']}),
                                 'flush_attrs_delta': ((r['flush']['new_rec'] or {}).get('attrsDelta')), 'flush_ms': ((r['flush']['new_rec'] or {}).get('ms')), 'flush_rebake': ((r['flush']['new_rec'] or {}).get('rebakeFired'))})
            if r['settle_flush_missing']:
                details.append(f"- TABLE {look}/{t} settle flush {r['flush']['new'].upper()} on the NEW dump (fail closed, §L31): the occlusion traces were not flushed before this dump — its transport attributes may still be landing; record {json.dumps(r['flush']['new_rec'])[:200]}")
            if r['async_attr_rows']:
                meshes = sorted({str(x[1][2]) for x in r['async_attr_rows']})
                details.append(f"- TABLE {look}/{t} ASYNC transport attribute LISTED, not judged (the BASE dump predates the flush law — its aOccl presence is the race, not identity; §L31): {len(r['async_attr_rows'])} row(s) on {', '.join(meshes)}")
                for cls, k, path, x, y in r['async_attr_rows'][:12]: details.append(f'    - listed {cls[:-6]} {k}: `{path}` {x!r} → {y!r}')
            if wmiss:
                details.append(f'- TABLE {look}/{t} progHash witness MISSING on {wmiss}/{wtot} table-owned material slots (fail closed; a census taken before ORDER-LAND-638-FIX4 carries no compiled-program witness) — first: '
                               + ', '.join(f"{row[0][2] or '(anon #%d:%d)' % (row[0][0], row[0][1])}" for row in r['table_diffs'] if _is_witness_named_missing(row))[:400])
            for k, path, x, y in r['table_diffs'][:20]:
                details.append(f'- TABLE {look}/{t} {k}: `{path}` {x!r} → {y!r}')
            if r.get('table_expected'):
                meshes = sorted({str(k[2]) for k, _, _, _ in r['table_expected']})
                details.append(f"- TABLE {look}/{t} EXPECTED (named, not judged): {len(r['table_expected'])} geometry row(s) on {', '.join(meshes)} — {a.expect_moved_reason or 'named by --expect-moved'}")
                for k, path, x, y in r['table_expected'][:12]: details.append(f'    - expected {k}: `{path}` {x!r} → {y!r}')
            for k, path, x, y in r['table_program_diffs'][:4]:
                details.append(f'- TABLE {look}/{t} {k}: `{path}` {str(x)[:24]!r} → {str(y)[:24]!r} (term table: the hidden table-owned probe moves every lit program\'s define set; listed, judged per class)')
            for k in r['table_missing'][:10]:
                details.append(f'- TABLE {look}/{t} mesh set differs at {k}')
            for k, path, x, y in r['unbaked_diffs'][:12]:
                details.append(f'- UNBAKED {look}/{t} {k}: `{path}` {x!r} → {y!r}')
            if r.get('declared_rows'):
                dn = r['declared_rows']; arms = ', '.join(f"{l} {'RED' if f else 'SILENT'}" for l, f in r.get('declared_arms', []))
                details.append(f"- UNBAKED {look}/{t} DECLARED, listed not judged (C2-FIX9 N6d): {len(dn)} row(s) = {r['declared_hooked']} hooked B material(s) x {len(r['declared_fields'])} field(s) [{', '.join(r['declared_fields'])}] ABSENT from the base web ({WEB_A}) and present non-null on every B material ({WEB_B}); count expected {r['declared_expect']}; red arms: {arms or 'n/a'}; first rows: " + '; '.join(f'`{pth}` {x} → {y!r}' for _k, pth, x, y in dn[:3]))
            for k in r['unbaked_missing'][:6]:
                details.append(f'- UNBAKED {look}/{t} mesh set differs at {k}')
            for k, path, x, y in r['unbaked_program_diffs'][:4]:
                details.append(f'- unbaked program field {look}/{t} {k}: `{path}` {str(x)[:40]!r} → {str(y)[:48]!r} (venue fill hook; listed, not judged)')
            for k, path, x, y in room_witness_missing[:12]:
                details.append(f"- ROOM {look}/{t} {k[2] or '(anon #%d:%d)' % (k[0], k[1])}: `{path}` {x!r} → {y!r} — shader witness MISSING on a visible room mesh: BLOCKING regardless of --room-strict (C2-FIX1 class B)")
            for k, path, x, y in r['room_diffs'][:12]:
                details.append(f'- room {look}/{t} {k}: `{path}` {x!r} → {y!r}')
            for k, path, x, y in r['room_program_diffs'][:4]:
                details.append(f'- room program field {look}/{t} {k}: `{path}` {str(x)[:40]!r} → {str(y)[:48]!r} (room programs carry the venue term; listed, not judged)')
            for k in r['room_missing'][:6]:
                details.append(f'- room {look}/{t} mesh set differs at {k}')
    if a.red_arm:
        look = a.looks.split(',')[0]; t = a.tables.split(',')[0]
        b = load(a.base, look, t)
        arms = red_arm(b) if b else [('no-dump', False)]
        fired = sum(1 for _, f in arms if f)
        lines += ['', f'red arm ({look}/{t}): **{fired}/{len(arms)} fired** — ' + ', '.join(f"{l}:{'RED' if f else 'silent'}" for l, f in arms)]
        if ARMS_NA: lines += [f'red arm n/a ({look}/{t}): ' + '; '.join(ARMS_NA) + ' — not counted as fired or silent (C2-FIX6 J: judged only where both dumps carry the field)']
        if b and any(l.startswith('material.progHash') and not f for l, f in arms):
            wc, wt, wm, wu = compare(b, b)['table_witness']
            lines += [f'red arm progHash silent: the base census carries a compiled-program witness on {wc}/{wt} table-owned material slots ({wu} unrendered on both sides, {wm} missing; missing must be 0) — '
                      'an arm on a comparator that already fails closed on the missing field is not evidence (re-capture the base with IDENTITY_SRC progWitness)']
        ok = ok and fired == len(arms)
        ul, uf, uname = unbaked_arm(b) if b else ('unbaked-roughness', False, 'no dump')
        lines += [f"red arm UNBAKED ({look}/{t}): **{'RED' if uf else 'silent'}** — {ul} on {uname} (a non-program field on a ball/cue material must still fire)"]
        ok = ok and uf
        # ORDER-LIGHT-C2 (c): a missing witness must fire through EVERY exemption branch (term table, room, unbaked, expect-moved)
        try: cen_b = json.load(open(dump_path(a.new, look, t, 'census.json'))); term_b = bool(((cen_b.get('lighting') or {}).get('venue') or {}).get('sh'))
        except Exception: term_b = False
        c2 = c2_arms(b, term_b) if b else [('progHash-null@term-table', False)]
        c2f = sum(1 for _, f in c2 if f)
        lines += [f"red arm C2 missing-witness ({look}/{t}, term {term_b}): **{c2f}/{len(c2)} fired** — " + ', '.join(f"{l}:{'RED' if f else 'silent'}" for l, f in c2)]
        ok = ok and c2f == len(c2)
        # NOTE-FENCE-NORMALS: the widened geometry identity — per-attribute arms on the NEW dump, the judged / pre-schema census per class
        n0 = load(a.new, look, t)
        aa, schema_ok = attr_arms(n0) if n0 else ([('attr:no-dump', False, 'no dump')], False)
        fireable = [x for x in aa if x[1] is not None]; fired_a = sum(1 for x in fireable if x[1]); absent = [x for x in aa if x[1] is None]
        rw_ = compare(b, n0)['wide'] if (b and n0) else {}
        lines += [f"red arm GEOMETRY ATTRIBUTES ({look}/{t}, NOTE-FENCE-NORMALS): **{fired_a}/{len(fireable)} fired** — " + ', '.join(f"{l}:{'RED' if f else 'silent'}" for l, f, _ in fireable)
                  + (f"; absent: {', '.join(l for l, _, _ in absent)}" if absent else '') + (f"; {aa[0][2]}" if not schema_ok else ''),
                  'widened geometry identity = attrHashes over every geometry attribute (hash:itemSize:count[:n]) + grpHash (groups start/count/materialIndex) + morphHash + drawRange, beside the named pos / nrm / uv / idx / col hashes; '
                  + 'judged wherever BOTH sides carry it (SCHEMA_ADDED), never reported where the base predates it: '
                  + '; '.join(f"{cls} {w['judged']} judged, base pre-schema {w['base_pre']}, new pre-schema {w['new_pre']} (attrs {', '.join(w['attrs']) or '—'})" for cls, w in rw_.items())]
        ok = ok and schema_ok and fired_a == len(fireable) and all(w['new_pre'] == 0 for w in rw_.values())
        # NOTE-CENSUS-SETTLE: the NEW dumps must carry the attribute-stability record (read after >= 3 held reads); listed per table, fail closed without it
        srec = []
        for look2 in a.looks.split(','):
            for t2 in a.tables.split(','):
                nd = load(a.new, look2, t2); st = (nd or {}).get('settle')
                srec.append((look2, t2, st))
        missing_s = [f'{l}/{t2}' for l, t2, st in srec if not isinstance(st, dict)]
        if srec:
            worst = max((st.get('waitedMs', 0) for _, _, st in srec if isinstance(st, dict)), default=0)
            moved = sum(1 for _, _, st in srec if isinstance(st, dict) and st.get('changes', 0) > 0)
            churny = sum(1 for _, _, st in srec if isinstance(st, dict) and st.get('matChanges', 0) > 0)
            top = [f"{l}/{t2}: {', '.join(st.get('matChurn', [])[:3])}" for l, t2, st in srec if isinstance(st, dict) and st.get('matChurnCount', 0)][:3]
            lines += [f"identity / census settle (NOTE-CENSUS-SETTLE): NEW dumps read after the scene's GEOMETRY attribute-version signature (every attribute version + count, index, groups) held still for >= 3 reads 250 ms apart (cap 30 s, refused by name on the cap) — {len(srec) - len(missing_s)}/{len(srec)} dumps carry the record, longest wait {worst} ms, {moved} dump(s) saw the geometry signature move before it held; material / map versions are observed, not required: {churny} dump(s) saw them churn during the wait" + (f" (named: {'; '.join(top)})" if top else '')
                      + (f"; MISSING the record (pre-addendum dumps, fail closed): {', '.join(missing_s[:6])}" if missing_s else '')]
            ok = ok and not missing_s
        # ORDER-LIGHT-C2-FIX1 §L31: the flush census over every NEW / BASE dump + the four red arms (deep copies)
        fst = [(l2, t2, flush_state(load(a.new, l2, t2) or {}), flush_state(load(a.base, l2, t2) or {})) for l2 in a.looks.split(',') for t2 in a.tables.split(',')]
        nfl = [x for x in fst if x[2][0] == 'flushed']; bfl = [x for x in fst if x[3][0] == 'flushed']; notf = [f'{l2}/{t2}:{ns[0]}' for l2, t2, ns, _ in fst if ns[0] != 'flushed']
        d_att = sum(int((ns[1] or {}).get('attrsDelta') or 0) for _, _, ns, _ in nfl); w_ms = max([int((ns[1] or {}).get('ms') or 0) for _, _, ns, _ in nfl], default=0)
        n_rb = sum(1 for _, _, ns, _ in nfl if (ns[1] or {}).get('rebakeFired')); n_async = sum(rj.get('async_attr_rows', 0) for rj in rows_json)
        lines += [f"settle flush (ORDER-LIGHT-C2-FIX1 §L31, the aOccl race): NEW dumps flushed through window.__snkOccl.flush() before the dump {len(nfl)}/{len(fst)} (attributes the flush attached {d_att}, longest flush {w_ms} ms, corrective re-bake fired on {n_rb}); "
                  + f"BASE dumps flushed {len(bfl)}/{len(fst)}" + (f" — async attribute rows LISTED, not judged, against a pre-flush-law base: {n_async}" if n_async else '')
                  + (f"; NEW dumps NOT flushed (refused by name): {', '.join(notf[:8])}" if notf else '')]
        fa_t = next((t2 for t2 in a.tables.split(',') for l2 in [look] if (n2 := load(a.new, l2, t2)) and any(isinstance(m.get('attrHashes'), dict) and any(x in m['attrHashes'] for x in ASYNC_ATTRS) for m in n2.get('meshes', []))), t)
        fa_n, fa_b = load(a.new, look, fa_t), load(a.base, look, fa_t)
        try: cen_f = json.load(open(dump_path(a.new, look, fa_t, 'census.json'))); term_f = bool(((cen_f.get('lighting') or {}).get('venue') or {}).get('sh'))
        except Exception: term_f = False
        fl = flush_arms(fa_n, fa_b, term_f) if (fa_n and fa_b) else [('flush-missing@new', False, 'no dump')]
        fl_fire = [x for x in fl if x[1] is not None]; fl_fired = sum(1 for x in fl_fire if x[1]); fl_abs = [x for x in fl if x[1] is None]
        lines += [f"red arm SETTLE FLUSH ({look}/{fa_t}, §L31): **{fl_fired}/{len(fl_fire)} fired** — " + ', '.join(f"{l}:{'RED' if f else 'silent'} ({nt})" for l, f, nt in fl_fire)
                  + (f"; not fireable: {', '.join(f'{l} ({nt})' for l, _, nt in fl_abs)}" if fl_abs else '')]
        ok = ok and fl_fired == len(fl_fire)
        arms = arms + [(l, bool(f)) for l, f, _ in fl_fire]
    lines += ['', '## diffs (first rows)'] + (details or ['- none'])
    if a.room_report:
        lines += ['', '## ROOM-MATERIAL identity rows per table (ORDER-LIGHT-5 R1b) — class · colourLin · map hashes · rough/metal · envMapIntensity, before → after']
        for look in a.looks.split(','):
            for t in a.tables.split(','):
                b, n = load(a.base, look, t), load(a.new, look, t)
                if b is None or n is None:
                    continue
                rb, rn = records(b, True), records(n, True)
                lines += ['', f'### {look} / {t}', '| mesh | field | before | after |', '|---|---|---|---|']
                shown = 0
                for k in sorted(set(rb) & set(rn)):
                    mb, mn = rb[k].get('material'), rn[k].get('material')
                    if not isinstance(mb, dict) or not isinstance(mn, dict):
                        continue
                    def summ(m):
                        maps = m.get('maps') or {}
                        # ORDER-LIGHT-6 H6: raw linear floats on any side that carries them (the AFTER dumps always do; a
                        # BEFORE dump from the pre-R4 schema prints its hex) — rounded to 4 dp for the row
                        cl = m.get('colorLin')
                        colour = [round(float(x), 4) for x in cl] if isinstance(cl, list) else m.get('color')
                        return {'cls': m.get('cls'), 'colour': colour, 'map': (maps.get('map') or {}).get('hash'), 'lightMap': (maps.get('lightMap') or {}).get('hash'),
                                'rough/metal': f"{m.get('roughness')}/{m.get('metalness')}", 'envMapIntensity': m.get('envMapIntensity'), 'envMap': 'bound' if maps.get('envMap') else '-', 'obc': m.get('obc')}
                    sb, sn = summ(mb), summ(mn)
                    for f in sb:
                        if f == 'colour' and colour_same(mb, mn):
                            continue  # SEAL-6 nit: a hex (pre-schema BEFORE) vs raw-float (AFTER) pair of the SAME colour is not a diff
                        if sb[f] != sn[f]:
                            lines.append(f"| {k[1] or '(anon #%d)' % k[0]} | {f} | {sb[f]} | {sn[f]} |"); shown += 1
                if not shown:
                    lines.append('| — | — | identical | identical |')
    if a.program_report:
        # ORDER-LIGHT-6 Q1a: per material class, from the NEW census' compiled GL shader sources — a program "carries the
        # probe" when three's USE_LIGHT_PROBES define AND the getLightProbeIrradiance call are both present; "carries the
        # fill" when shGetIrradianceAt(inverseTransformDirection(geometryNormal, viewMatrix), obVenueSH) is present. Rule: room / table / fixture / aim / other
        # programs carry neither; ball / cue programs carry the fill on every lit program when the table has a term
        # (census venue.sh) and nothing otherwise.
        lines += ['', '## COMPILED-GLSL programs census per material class (ORDER-LIGHT-6 Q1a) — from the rendered programs\' GL sources',
                  '', '| look | table | class | meshes | lit programs | probe define | probe COMPILED | fill term | rule | verdict |', '|---|---|---|---|---|---|---|---|---|---|']
        for look in a.looks.split(','):
            for t in a.tables.split(','):
                cp = dump_path(a.new, look, t, 'census.json')
                if not os.path.exists(cp):
                    lines.append(f'| {look} | {t} | — | — | — | — | — | — | — | **FAIL** (no census) |'); ok = False; continue
                cen = json.load(open(cp))
                term = bool(((cen.get('lighting') or {}).get('venue') or {}).get('sh'))
                P = (cen.get('programs') or {}).get('classes') or {}
                if not P:
                    lines.append(f'| {look} | {t} | — | — | — | — | — | — | — | **FAIL** (no programs census: {str((cen.get("programs") or {}).get("error"))[:60]}) |'); ok = False; continue
                for cls in sorted(P):
                    C = P[cls]
                    if cls in ('ball', 'cue'):
                        want = C['lit'] if term else 0
                        good = C['probeCompiled'] == 0 and C['venueSH'] == want
                        rule = f"fill on every lit program ({want})" if term else 'no term on this table → no fill'
                    else:
                        good = C['probeCompiled'] == 0 and C['venueSH'] == 0
                        rule = 'no probe, no fill'
                    ok = ok and good
                    lines.append(f"| {look} | {t} | {cls} | {C['meshes']} | {C['lit']} | {C['probeDefine']}{' (unlit boot-time define, no call)' if C['probeDefine'] and not C['probeCompiled'] else ''} | {C['probeCompiled']} | {C['venueSH']} | {rule} | {'PASS' if good else '**FAIL**'}{(' offenders: ' + ', '.join(C['offenders'][:4])) if C.get('offenders') and not good else ''} |")
        if a.program_arm:
            for look in a.looks.split(','):
                cp = os.path.join(a.program_arm, look, 'predator_apex_9ft', 'census.json')
                if not os.path.exists(cp):
                    lines.append(f'| {look} | ARM | room | — | — | — | — | — | ?venueArm=wallfill | **FAIL** (no arm census) |'); ok = False; continue
                cen = json.load(open(cp)); C = ((cen.get('programs') or {}).get('classes') or {}).get('room') or {}
                fired = (C.get('venueSH') or 0) >= 1
                ok = ok and fired
                lines.append(f"| {look} | ARM predator_apex_9ft | room | {C.get('meshes')} | {C.get('lit')} | {C.get('probeDefine')} | {C.get('probeCompiled')} | {C.get('venueSH')} | ?venueArm=wallfill re-admits the fill on the wall material | {'RED (arm fired)' if fired else '**SILENT — FAIL**'} |")
    lines += ['', f"**VERDICT: {'PASS' if ok else 'FAIL'}**"]
    rep = '\n'.join(lines)
    print(rep)
    if a.out:
        open(a.out, 'w').write(rep + '\n')
    if a.json:
        arm_rows = [{'arm': l, 'fired': f} for l, f in arms] if a.red_arm else None
        json.dump({'base': a.base, 'new': a.new, 'rows': rows_json, 'red_arm': arm_rows, 'verdict': 'PASS' if ok else 'FAIL'}, open(a.json, 'w'), indent=1)
    sys.exit(0 if ok else 3)


if __name__ == '__main__':
    main()
