#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""fence-drift-489.py — the snooker craft lane's NON-TARGET fence at mesh level (GH-489 R3-SNK-11 LAW rows; v2 BODY-1
subject E, review round 3 FAIL E).

For every non-target catalog table, two dumps (tools/render/clay-study-489.mjs, dumpSchema 4) of the BASE tree and the
NEW tree are compared on THREE rows, every one of them per mesh:

  GEOMETRY  (a) the CLAY multiset — per-mesh hash (name + matrixWorld + positions + indices) counted per hash: a
            duplicated mesh whose hash already exists is one count too many (DIFF), a removed one is one count too few
            (DIFF); a set of hashes could not see either (review round 3 finding a);
            (b) per mesh PATH — every mesh is keyed by its scene path (ancestor names / <type>@index) plus its
            occurrence index (`pathKey`) and the hash under each key must match; the FULL inventory (every mesh, not
            only the clay selection) is compared the same way on a geometry signature (geometry class, vertex / index
            counts, instance count, matrixWorld, draw range, groups, sampled world AABB).
  MATERIAL  per mesh (keyed by pathKey): class, colour + emissive as RAW floats (r,g,b) and hex, emissiveIntensity,
            roughness, metalness, envMapIntensity, clearcoat (+roughness), sheen (+roughness, colour), transmission, ior,
            reflectivity, specularIntensity (+colour), normalScale (x,y), bumpScale, side, transparent, opacity,
            alphaTest, depthWrite, depthTest, flatShading, vertexColors, toneMapped, blending, polygonOffset, defines,
            and per texture slot (map, normalMap, roughnessMap, metalnessMap, emissiveMap, aoMap, bumpMap, alphaMap,
            clearcoatNormalMap, clearcoatRoughnessMap, sheenColorMap, specularIntensityMap, transmissionMap, lightMap,
            displacementMap, envMap) the image's 32×32 content hash, size, repeat, wrap and colour space. Texture uuids
            and program ids are per session and are never compared.
  SHADER    per mesh: the hash of the COMPILED program's vertex + fragment GLSL source (read back through the GL context
            after the frame; three: renderer.properties.get(material).currentProgram) and the hash of the TEXT of the
            material's onBeforeCompile hook (Function.prototype.toString); plus the renderer's program table
            (renderer.info.programs) as a multiset of (vs, fs) source hashes.

  --red-arm mutates ONE thing at a time on a copy of the first table's base dump and asserts the comparator fires each
            time — a comparator that cannot red is not a gate. The twelve R3-SNK-11 arms stay (colour, roughness,
            metalness, envMapIntensity, clearcoat, clearcoatRoughness, normalScale, map hash, normalMap hash, material
            class, onBeforeCompile flag, geometry vertex block); v2 adds: colour as a raw float, a DUPLICATED mesh
            (a copy of one mesh record appended → the multiset row), a REMOVED mesh (→ the multiset row), a
            one-token change of one program's fragment source hash (→ the shader row), a one-token change of one
            onBeforeCompile hook text hash (→ the shader row), a duplicated inventory mesh (→ the inventory path row),
            and a program-table change (→ the shader row).

usage: fence-drift-489.py --base DIR --new DIR --tables a,b,c [--red-arm] [--out report.md]
  DIR holds <table>.json dumps.  exit 0 = every table identical (geometry AND material AND shader) and every arm fires;
  3 otherwise. Old (schema 1) dumps lacking pathKey / shader rows fall back to (order, name) keys and report the shader
  row as `n/a (schema 1 dump)` — which is NOT identical, so a fence run on old dumps cannot pass by omission.
  SNK-R33 (review round 7 on #637, class D — `--tables ""` produced an empty list, no comparison, exit 0): the fence
  never trusts a filename. BEFORE the loop it REFUSES by name, exit 2 (on stderr AND in the --out report when one is
  named): an empty / blank table selection (`--tables ""`, or a blank entry) and a --base / --new that is not a
  directory. Per table it keeps the "missing dump" row (bad) and ALSO reads the BUILT id from each dump: dumpSchema 4
  carries `table_built` (the obTable.userData.tableId beacon the dumper read after boot and asserted against its
  requested id); when the key exists it must equal the file's table id — `dump built 'X' (labelled t)` is a bad row;
  when it is absent (an older dumper, whose label was the REQUESTED id — exactly what a resolveBootTableId fallback
  leaves wrong) the row "no table_built in the dump (dumper < schema 4)" is bad as well. exit 2 = refused arguments,
  3 = bad rows.
  ARMS (battery): `--tables ""` → exit 2 named; `--new /nonexistent` → exit 2 named; a dump whose table_built differs
  from its filename → bad row, exit 3.
"""
import argparse, copy, hashlib, json, os, sys
from collections import Counter

ARM_NAMES_V1 = ['colour', 'roughness', 'metalness', 'envMapIntensity', 'clearcoat', 'clearcoatRoughness', 'normalScale', 'map hash',
                'normalMap hash', 'material class', 'onBeforeCompile flag', 'geometry vertex block']
ARM_NAMES_V2 = ['colour raw float', 'duplicated clay mesh (multiset)', 'removed clay mesh (multiset)', 'fragment GLSL source hash (shader row)',
                'onBeforeCompile hook text hash (shader row)', 'duplicated inventory mesh (path row)', 'program table (shader row: a bound compiled source pair changes)',
                'material array slot roughness (when the dump has a multi-material mesh)']


def load(d, t):
    p = os.path.join(d, f'{t}.json')
    if not os.path.exists(p):
        return None
    return json.load(open(p))


def built_label_row(t, b, n):
    """SNK-R33 class D: the fence never trusts the filename. A dumpSchema-4 dump carries `table_built` (the
    obTable.userData.tableId beacon the dumper read after boot and asserted against its requested id); each side must
    carry it and it must equal the file's table id. Returns None when both sides do, else the row's second cell."""
    parts = []
    for side, d in (('base', b), ('new', n)):
        if 'table_built' not in d:
            parts.append(f'{side}: no table_built in the dump (dumper < schema 4)')
        elif d['table_built'] != t:
            parts.append(f"{side}: dump built '{d['table_built']}' (labelled {t})")
    return '; '.join(parts) or None


def h16(s):
    return hashlib.sha256(s.encode()).hexdigest()[:16]


def mesh_key(m):
    """the per-mesh row key: scene path + occurrence index (schema 2); (order, name) on schema 1 dumps."""
    pk = m.get('pathKey')
    return pk if pk is not None else f'order{m.get("order")}:{m.get("name", "")}'


# GH-489 SNK-R32 (review r6 P2 d — the fence hash covers EVERY rendering input; a FENCE-LAW ADDENDUM for all lanes):
# geometry identity = positions + indices + normals + every other attribute the renderer reads (uv, uv1, color,
# tangent, aOccl, any custom one: name, itemSize, normalized, typed-array class, bytes) + groups (start / count /
# materialIndex) + drawRange + the index type. A dump differing only in normals_b64 passed the old hash although the
# clay renderer installs those normals as split normals. Dumps older than schema 3 carry no `attributes` block: the
# hash then covers what they carry, and the RED ARM row says which attribute arms could run (absent: …).
GEOMETRY_FIELDS = ['positions_b64', 'indices_b64', 'normals_b64']


def geom_attrs(m):
    """the extra attribute block as a stable list [(name, itemSize, normalized, type, count, b64)] — sorted by name."""
    a = m.get('attributes') or {}
    return [(k, (v or {}).get('itemSize'), (v or {}).get('normalized'), (v or {}).get('type'), (v or {}).get('count'), (v or {}).get('b64', ''))
            for k, v in sorted(a.items())]


def geom_hash(m):
    parts = [str(m.get('name', '')), json.dumps(m.get('matrixWorld'))]
    parts += [str(m.get(f, '')) for f in GEOMETRY_FIELDS]
    parts.append(json.dumps(geom_attrs(m)))
    parts.append(json.dumps([m.get('groups'), m.get('drawRange'), m.get('indexType')]))
    return h16('|'.join(parts))


def attribute_names(dump):
    """every extra attribute name present in a dump's clay meshes (for the per-attribute arms and the row text)."""
    names = set()
    for m in dump.get('meshes') or []:
        names.update((m.get('attributes') or {}).keys())
    return sorted(names)


def clay_geometry(dump):
    """clay meshes → (Counter of geometry hashes, {pathKey: hash}, tris)."""
    ms = dump.get('meshes') or []
    hashes = [geom_hash(m) for m in ms]
    tris = sum(int(m.get('tris') or 0) for m in ms)
    by_key = {}
    for m, hh in zip(ms, hashes):
        by_key.setdefault(mesh_key(m), []).append(hh)
    return Counter(hashes), by_key, tris


def inv_signature(m):
    # matrixWorld rounded to 1e-9 m: the cue stick's pose carried 1e-17 float noise between two sessions of the R3-SNK-12
    # drift dumps (order 85-90, obCueStick) — a nanometre floor keeps every real edit (>= 1e-6 m) and drops that noise;
    # the CLAY row stays byte-exact on the world positions themselves
    a = m.get('aabbApprox') or {}
    return h16(json.dumps([m.get('name', ''), m.get('geomType'), m.get('verts'), m.get('indexed'), m.get('idxCount'), m.get('instanced'), m.get('instances'),
                           [round(v, 9) for v in (m.get('matrixWorld') or [])], m.get('drawRange'), m.get('groups'), m.get('visible'), m.get('matCount'),
                           [round(v, 5) for v in (a.get('min') or [])], [round(v, 5) for v in (a.get('max') or [])],
                           sorted(((k, (v or {}).get('itemSize')) for k, v in (m.get('attributes') or {}).items())) if m.get('attributes') is not None else None]))


def inventory_rows(dump):
    """pathKey → (geometry signature, material row, shader row) over the FULL inventory."""
    out = {}
    for m in dump.get('inventory') or []:
        mat = m.get('material') or {}
        shader = mat.get('shader')
        shader_row = None
        if shader is not None or 'hookHash' in mat:
            sh = shader or {}
            shader_row = {'glsl': sh.get('glsl'), 'vs': sh.get('vs'), 'fs': sh.get('fs'), 'vsLen': sh.get('vsLen'), 'fsLen': sh.get('fsLen'),
                          'cacheKey': sh.get('cacheKey'), 'note': sh.get('note'), 'hookHash': mat.get('hookHash'), 'hookLen': mat.get('hookLen')}
        mat_row = {k: v for k, v in mat.items() if k not in ('shader', 'hookHash', 'hookLen')}
        # material ARRAYS (multi-material meshes): every further slot is rowed too, material and shader alike
        slots = m.get('materialSlots') or []
        if slots:
            mat_row['slots'] = [{k: v for k, v in (sm or {}).items() if k not in ('shader', 'hookHash', 'hookLen')} for sm in slots]
            if shader_row is not None:
                shader_row['slots'] = [{'glsl': ((sm or {}).get('shader') or {}).get('glsl'), 'fs': ((sm or {}).get('shader') or {}).get('fs'),
                                        'vs': ((sm or {}).get('shader') or {}).get('vs'), 'hookHash': (sm or {}).get('hookHash')} for sm in slots]
        out[mesh_key(m)] = (inv_signature(m), mat_row, shader_row)
    return out


def bound_program_ids(dump):
    """program ids referenced by an inventory row (each mesh row's compiled program, material array slots included)."""
    ids = set()
    for m in dump.get('inventory') or []:
        for mat in [m.get('material') or {}] + list(m.get('materialSlots') or []):
            sh = (mat or {}).get('shader') or {}
            if sh.get('programId') is not None:
                ids.add(sh['programId'])
    return ids


def program_multiset(dump):
    """the program TABLE row: the SET of distinct compiled (vertex, fragment) source pairs among the programs BOUND to a
    mesh row. SNK-R32 reseal (refuters 5): renderer.info.programs also holds UNBOUND entries — depth / shadow variants,
    stale programs, an extra object with identical GLSL and another cache key — whose presence and multiplicity change
    run to run on ONE tree (predator: ids 50 + 79 = usedTimes 1 + 2 in our sealed dump, id 50 = 3 in our re-dump; a
    main-only pair 11a77cae|4633f558 in one main dump, gone in the next; none bound to any mesh row). What renders is
    the compiled source each mesh row binds; the bound set is the identity, the unbound residue rides the row as info.
    The v2 arm alters the FRAGMENT hash of one BOUND program in the table copy: a bound source pair changes → fires."""
    ps = dump.get('programs')
    if ps is None:
        return None
    bound = bound_program_ids(dump)
    return Counter(set(f'{p["vs"]}|{p["fs"]}' if p and p.get('vs') is not None else 'unreadable' for p in ps if p and p.get('id') in bound))


def program_objects(dump):
    """(total program objects, unbound objects) — information beside the row, never judged."""
    ps = dump.get('programs')
    if ps is None:
        return None
    bound = bound_program_ids(dump)
    return (len(ps), sum(1 for p in ps if not (p and p.get('id') in bound)))


def diff_paths(a, b, path=''):
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b), key=str):
            yield from diff_paths(a.get(k), b.get(k), f'{path}.{k}' if path else str(k))
    elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        for i, (x, y) in enumerate(zip(a, b)):
            yield from diff_paths(x, y, f'{path}[{i}]')
    elif a != b:
        yield (path, a, b)


def multiset_diff(cb, cn):
    """[(hash, base count, new count)] where the counts differ."""
    return [(hh, cb.get(hh, 0), cn.get(hh, 0)) for hh in sorted(set(cb) | set(cn)) if cb.get(hh, 0) != cn.get(hh, 0)]


def compare(base, new):
    cb, kb, tb = clay_geometry(base); cn, kn, tn = clay_geometry(new)
    ms_diff = multiset_diff(cb, cn)
    key_diff = [k for k in sorted(set(kb) | set(kn)) if kb.get(k) != kn.get(k)]
    ib, inn = inventory_rows(base), inventory_rows(new)
    keys = sorted(set(ib) | set(inn))
    unmatched = [k for k in keys if (k in ib) != (k in inn)]
    inv_geom_diff = [k for k in keys if k in ib and k in inn and ib[k][0] != inn[k][0]]
    mat_diffs, shader_diffs = [], []
    shader_na = 0
    for k in keys:
        if k not in ib or k not in inn:
            continue
        for path, a, b in diff_paths(ib[k][1], inn[k][1]):
            mat_diffs.append((k, path, a, b))
        sb, sn = ib[k][2], inn[k][2]
        if sb is None or sn is None:
            shader_na += 1
            continue
        for path, a, b in diff_paths(sb, sn):
            shader_diffs.append((k, path, a, b))
    pb, pn = program_multiset(base), program_multiset(new)
    prog_diff = multiset_diff(pb, pn) if (pb is not None and pn is not None) else None
    prog_na = pb is None or pn is None
    # a row that the dump could not fill (schema 1, renderer not exposed, unreadable source) is NOT identical
    unreadable = sum(1 for k in keys if k in inn and inn[k][2] is not None
                     and (not inn[k][2].get('glsl') or any(not s.get('glsl') for s in inn[k][2].get('slots') or [])))
    geom_identical = not ms_diff and not key_diff and not inv_geom_diff and not unmatched
    mat_identical = not mat_diffs and not unmatched
    shader_identical = not shader_diffs and not unmatched and shader_na == 0 and not prog_na and not prog_diff and unreadable == 0
    return {
        'meshes': (len(base.get('meshes') or []), len(new.get('meshes') or [])),
        'inventory': (len(ib), len(inn)), 'tris': (tb, tn),
        'geom_identical': geom_identical, 'ms_diff': ms_diff, 'key_diff': key_diff, 'inv_geom_diff': inv_geom_diff, 'unmatched': unmatched,
        'mat_identical': mat_identical, 'mat_diffs': mat_diffs,
        'shader_identical': shader_identical, 'shader_diffs': shader_diffs, 'shader_na': shader_na, 'unreadable': unreadable,
        'programs': ((sum(pb.values()) if pb is not None else None), (sum(pn.values()) if pn is not None else None)), 'prog_objects': (program_objects(base), program_objects(new)), 'prog_diff': prog_diff, 'prog_na': prog_na,
        'distinct_glsl': (len({v[2].get('glsl') for v in ib.values() if v[2]}), len({v[2].get('glsl') for v in inn.values() if v[2]})),
    }


def first_diffs(r, n=4):
    parts = []
    for hh, a, b in r['ms_diff'][:n]:
        parts.append(f'clay multiset {hh}: {a}→{b}')
    for k in r['key_diff'][:n]:
        parts.append(f'clay path {k}: hash changed')
    for k in r['inv_geom_diff'][:n]:
        parts.append(f'inventory geometry {k}: signature changed')
    for k in r['unmatched'][:n]:
        parts.append(f'unmatched mesh {k}')
    for k, p, a, b in r['mat_diffs'][:n]:
        parts.append(f'{k} {p}: {a} → {b}')
    for k, p, a, b in r['shader_diffs'][:n]:
        parts.append(f'{k} shader.{p}: {a} → {b}')
    if r['prog_diff']:
        for hh, a, b in r['prog_diff'][:n]:
            parts.append(f'program table {hh}: {a}→{b}')
    if r['shader_na']:
        parts.append(f'{r["shader_na"]} meshes without a shader row (schema 1 dump?)')
    if r['unreadable']:
        parts.append(f'{r["unreadable"]} meshes with an unreadable program source')
    return '; '.join(parts).replace('|', '/')


armed_v3, absent_v3 = [], []  # SNK-R32: the v3 arms that ran / could not run on the base dump (for the row text)


def red_arm(dump):
    """Mutate one thing at a time on a copy and require the comparator to fire on the RIGHT row. Returns [] or failures."""
    fails = []
    armed_v3.clear(); absent_v3.clear()
    notes = []  # SNK-R32: attributes absent from a dump (not armable there) — reported, never counted as detected
    inv = dump.get('inventory') or []
    pick = next((m for m in inv if m.get('material') and m['material'].get('roughness') is not None), None)
    if pick is None:
        return ['no mesh with a material record to arm']
    pk = mesh_key(pick)

    def find(d2):
        return next(m for m in d2['inventory'] if mesh_key(m) == pk)
    # ---- the twelve R3-SNK-11 arms (material row + geometry) ----
    mat_cases = {
        'colour': lambda m: m['material'].__setitem__('color', 'deadbe'),
        'roughness': lambda m: m['material'].__setitem__('roughness', (m['material']['roughness'] or 0) + 0.05),
        'metalness': lambda m: m['material'].__setitem__('metalness', (m['material']['metalness'] or 0) + 0.05),
        'envMapIntensity': lambda m: m['material'].__setitem__('envMapIntensity', (m['material'].get('envMapIntensity') or 0) + 0.1),
        'clearcoat': lambda m: m['material'].__setitem__('clearcoat', (m['material'].get('clearcoat') or 0) + 0.2),
        'clearcoatRoughness': lambda m: m['material'].__setitem__('clearcoatRoughness', (m['material'].get('clearcoatRoughness') or 0) + 0.2),
        'normalScale': lambda m: m['material'].__setitem__('normalScale', [9.0, 9.0]),
        'map hash': lambda m: m['material']['maps'].__setitem__('map', {'w': 1, 'h': 1, 'hash': 'arm', 'kind': 'Texture', 'name': ''}),
        'normalMap hash': lambda m: m['material']['maps'].__setitem__('normalMap', {'w': 1, 'h': 1, 'hash': 'arm', 'kind': 'Texture', 'name': ''}),
        'material class': lambda m: m['material'].__setitem__('cls', 'MeshArmMaterial'),
        'onBeforeCompile flag': lambda m: m['material'].__setitem__('onBeforeCompile', 'custom' if m['material'].get('onBeforeCompile') != 'custom' else 'none'),
        # v2: the raw float colour (the hex string stays as it was — an edit below 1/255 must still fire)
        'colour raw float': lambda m: m['material'].__setitem__('colorRGB', [((m['material'].get('colorRGB') or [0, 0, 0])[0] or 0) + 0.001, 0.5, 0.5]),
    }
    multi = next((m for m in inv if m.get('materialSlots')), None)
    if multi is not None:
        mk = mesh_key(multi)
        mat_cases['material array slot roughness'] = None  # placeholder, handled below (a different mesh)
    for name, mut in mat_cases.items():
        if mut is None:
            d2 = copy.deepcopy(dump); m2 = next(m for m in d2['inventory'] if mesh_key(m) == mk)
            m2['materialSlots'][0]['roughness'] = (m2['materialSlots'][0].get('roughness') or 0) + 0.05
            if compare(dump, d2)['mat_identical']:
                fails.append(f'{name}: NOT detected on the material row')
            continue
        d2 = copy.deepcopy(dump); mut(find(d2))
        if compare(dump, d2)['mat_identical']:
            fails.append(f'{name}: NOT detected on the material row')
    # geometry arm: nudge one vertex block of one clay mesh
    d3 = copy.deepcopy(dump)
    if d3.get('meshes'):
        d3['meshes'][0]['positions_b64'] = 'ARM' + str(d3['meshes'][0].get('positions_b64', ''))[3:]
        if compare(dump, d3)['geom_identical']:
            fails.append('geometry vertex block: NOT detected on the geometry row')
    else:
        fails.append('geometry vertex block: no clay mesh to arm')
    # ---- v3 arms (SNK-R32, review r6 P2 d): one NEGATIVE test per rendering attribute, normals first ----
    # each arm perturbs ONE field of ONE clay mesh in a copy of the base and requires the geometry row to DIFFER;
    # an attribute no mesh of this dump carries is reported as absent (not armable here), never as detected
    if dump.get('meshes'):
        ms = dump['meshes']
        def arm_field(label, pick, mutate):
            idx = next((i for i, m in enumerate(ms) if pick(m)), None)
            if idx is None:
                notes.append(f'{label}: absent from every clay mesh of this dump (not armable here)'); absent_v3.append(label)
                return
            armed_v3.append(label)
            dx = copy.deepcopy(dump); mutate(dx['meshes'][idx])
            r = compare(dump, dx)
            if r['geom_identical'] or not (r['ms_diff'] or r['key_diff']):
                fails.append(f'{label}: NOT detected on the geometry row')
        arm_field('geometry attribute normal (normals_b64)', lambda m: bool(m.get('normals_b64')),
                  lambda m: m.__setitem__('normals_b64', 'ARM' + str(m.get('normals_b64', ''))[3:]))
        for an in attribute_names(dump):
            arm_field(f'geometry attribute {an}', lambda m, an=an: bool(((m.get('attributes') or {}).get(an) or {}).get('b64')),
                      lambda m, an=an: m['attributes'][an].__setitem__('b64', 'ARM' + str(m['attributes'][an].get('b64', ''))[3:]))
        arm_field('geometry groups', lambda m: m.get('groups') is not None,
                  lambda m: m.__setitem__('groups', (m.get('groups') or []) + [{'start': 0, 'count': 3, 'materialIndex': 7}]))
        arm_field('geometry drawRange', lambda m: 'drawRange' in m,
                  lambda m: m.__setitem__('drawRange', [1, 3]))
        arm_field('geometry indexType', lambda m: 'indexType' in m,
                  lambda m: m.__setitem__('indexType', 'ARM'))
    # ---- v2 arms ----
    # (i) a DUPLICATED clay mesh: a copy of one mesh record appended — its hash already exists, only the COUNT changes
    if dump.get('meshes'):
        d4 = copy.deepcopy(dump); d4['meshes'].append(copy.deepcopy(d4['meshes'][0]))
        r = compare(dump, d4)
        if r['geom_identical'] or not r['ms_diff']:
            fails.append('duplicated clay mesh (multiset): NOT detected on the multiset row')
        # a REMOVED clay mesh
        d5 = copy.deepcopy(dump); d5['meshes'].pop()
        r = compare(dump, d5)
        if r['geom_identical'] or not r['ms_diff']:
            fails.append('removed clay mesh (multiset): NOT detected on the multiset row')
    # (ii) a one-token change of one program's fragment source hash, on the mesh's shader row
    sh = (pick.get('material') or {}).get('shader')
    if not sh or not sh.get('fs'):
        fails.append('fragment GLSL source hash (shader row): the base dump carries no compiled program hash to arm (schema 1 dump or renderer not exposed)')
    else:
        d6 = copy.deepcopy(dump); s6 = find(d6)['material']['shader']
        s6['fs'] = ('0' if s6['fs'][0] != '0' else '1') + s6['fs'][1:]; s6['glsl'] = ('0' if s6['glsl'][0] != '0' else '1') + s6['glsl'][1:]
        r = compare(dump, d6)
        if r['shader_identical'] or not r['shader_diffs']:
            fails.append('fragment GLSL source hash (shader row): NOT detected on the shader row')
    if (pick.get('material') or {}).get('hookHash') is None:
        fails.append('onBeforeCompile hook text hash (shader row): the base dump carries no hook text hash to arm')
    else:
        d7 = copy.deepcopy(dump); m7 = find(d7)['material']
        m7['hookHash'] = ('0' if m7['hookHash'][0] != '0' else '1') + m7['hookHash'][1:]
        r = compare(dump, d7)
        if r['shader_identical'] or not r['shader_diffs']:
            fails.append('onBeforeCompile hook text hash (shader row): NOT detected on the shader row')
    # a duplicated INVENTORY mesh (same path → a new occurrence index → an unmatched row)
    d8 = copy.deepcopy(dump); dup = copy.deepcopy(pick)
    if dup.get('pathKey') is not None:
        base_path = dup.get('path') or dup['pathKey'].rsplit('#', 1)[0]
        occ = sum(1 for m in d8['inventory'] if (m.get('path') or str(m.get('pathKey', '')).rsplit('#', 1)[0]) == base_path)
        dup['pathKey'] = f'{base_path}#{occ}'
    else:
        dup['order'] = max(int(m.get('order') or 0) for m in d8['inventory']) + 1
    d8['inventory'].append(dup)
    r = compare(dump, d8)
    if r['geom_identical'] or not r['unmatched']:
        fails.append('duplicated inventory mesh (path row): NOT detected')
    # the program table itself
    if dump.get('programs'):
        # SNK-R32 reseal: the table is a SET of compiled source pairs (see program_multiset) — the arm appends a program
        # whose FRAGMENT source hash differs (a bound compiled source pair changes), not a duplicate or unbound object (renderer cache residue,
        # which the bound set does not count by design)
        d9 = copy.deepcopy(dump); bound = bound_program_ids(d9)
        pk = next((p for p in d9['programs'] if p and p.get('id') in bound and p.get('fs') is not None), None)
        if pk is None:
            fails.append('program table (shader row): no program bound to a mesh row to arm')
        else:
            pk['fs'] = 'ARM' + str(pk.get('fs', ''))[3:]
        r = compare(dump, d9)
        if r['shader_identical'] or not r['prog_diff']:
            fails.append('program table (shader row): NOT detected')
    else:
        fails.append('program table (shader row): the base dump carries no renderer.info.programs to arm')
    for n in notes:
        print(f'[fence-drift] arm note: {n}', file=sys.stderr)
    return fails


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--base', required=True); ap.add_argument('--new', required=True)
    ap.add_argument('--tables', required=True); ap.add_argument('--red-arm', action='store_true'); ap.add_argument('--out')
    a = ap.parse_args()

    def refuse(msg):
        # SNK-R33 class D: refused by name BEFORE the loop — on stderr and in the --out report (a report that says so,
        # not one that says nothing); exit 2 (arguments), distinct from 3 (rows)
        line = f'[fence-drift] REFUSED — {msg}'
        print(line, file=sys.stderr)
        if a.out:
            open(a.out, 'w').write(line + '\n')
        sys.exit(2)
    tables = [t.strip() for t in a.tables.split(',')]
    if not tables or any(not t for t in tables):
        refuse(f'empty table selection (--tables {json.dumps(a.tables)}); name every table id explicitly')
    for flag, d in (('--base', a.base), ('--new', a.new)):
        if not os.path.isdir(d):
            refuse(f'{flag} {json.dumps(d)} is not a directory; nothing to compare')
    rows = ['| table | meshes base/new (inventory) | tris base/new | GEOMETRY multiset + per-path (clay) / inventory signature | MATERIAL rows per mesh | SHADER identity (compiled GLSL + hook text per mesh; program table) | first diffs |',
            '|---|---|---|---|---|---|---|']
    bad = 0; armed = None
    for t in tables:
        b, n = load(a.base, t), load(a.new, t)
        if b is None or n is None:
            rows.append(f'| {t} | missing dump ({"base" if b is None else "new"}) | | — | — | — | |'); bad += 1; continue
        # SNK-R33 class D: the label is the BUILT table, read from each dump (never the filename); the comparison row
        # still follows so the report stays diagnosable, but the exit is already 3
        lab = built_label_row(t, b, n)
        if lab:
            rows.append(f'| {t} | {lab} | | — | — | — | |'); bad += 1
        r = compare(b, n)
        g = ('IDENTICAL' if r['geom_identical'] else
             f'DIFFER (multiset {len(r["ms_diff"])} hashes, {len(r["key_diff"])} clay paths, {len(r["inv_geom_diff"])} inventory signatures, {len(r["unmatched"])} unmatched)')
        m = 'IDENTICAL' if r['mat_identical'] else f'DIFFER ({len(r["mat_diffs"])} fields, {len(r["unmatched"])} unmatched)'
        if r['shader_identical']:
            s = f'IDENTICAL ({r["distinct_glsl"][0]} distinct programs over the meshes; program table {r["programs"][0]}/{r["programs"][1]} distinct bound source pairs (program objects {r["prog_objects"][0][0]}/{r["prog_objects"][1][0]}, unbound {r["prog_objects"][0][1]}/{r["prog_objects"][1][1]} — residue not judged))'
        elif r['prog_na'] or r['shader_na']:
            s = f'n/a (schema 1 dump: {r["shader_na"]} meshes without a shader row{"; no program table" if r["prog_na"] else ""})'
        else:
            s = f'DIFFER ({len(r["shader_diffs"])} fields, program table {len(r["prog_diff"] or [])} hashes, {r["unreadable"]} unreadable)'
        if not (r['geom_identical'] and r['mat_identical'] and r['shader_identical']):
            bad += 1
        rows.append(f'| {t} | {r["meshes"][0]}/{r["meshes"][1]} ({r["inventory"][0]}/{r["inventory"][1]}) | {r["tris"][0]}/{r["tris"][1]} | {g} | {m} | {s} | {first_diffs(r)} |')
        if a.red_arm and armed is None:
            armed = red_arm(b)
    if a.red_arm:
        rows.append('')
        if armed is None:
            rows.append('RED ARM: FAIL — no base dump loaded, nothing armed'); bad += 1
        else:
            rows.append('RED ARM (one thing mutated at a time on a copy of the first table\'s base dump, the comparator must fire on the named row each time): '
                        + (f'OK — {len(ARM_NAMES_V1) + len(ARM_NAMES_V2)} v1/v2 arms + the v3 per-attribute arms detected ({", ".join(armed_v3) or "none armable on this dump"}; absent: {", ".join(absent_v3) or "none"}): ' + ', '.join(ARM_NAMES_V1 + ARM_NAMES_V2)
                           if armed == [] else f'FAIL — {armed}'))
            if armed:
                bad += 1
    text = '\n'.join(rows) + '\n'
    print(text)
    if a.out:
        open(a.out, 'w').write(text)
    sys.exit(0 if bad == 0 else 3)


if __name__ == '__main__':
    main()
