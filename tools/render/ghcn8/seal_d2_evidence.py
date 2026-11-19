# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Verify and assemble the D2 seal from actual capture/CPU receipts.

This consumes local evidence only. It does not launch a browser, alter model
inputs, run a gate, or publish anything. Source/reference assets stay private.
"""
from pathlib import Path
import argparse
import collections
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[3]
ART = Path.home()/'ob-artifacts/astra-cn8'
PACK = ART/'phase2-d2/seal-1'
TABLES = ['chinese8_pro_9ft','joy_q8_9ft','diamond_proam_9ft',
          'predator_apex_9ft','wpbsa_snooker_12ft','umb_carom_284']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.write_text(json.dumps(value, indent=2)+'\n')


def digest(value):
    return sha(json.dumps(value, sort_keys=True, separators=(',',':')).encode())


def git(*args):
    return subprocess.check_output(['git',*args], cwd=ROOT)


def register_frames():
    rows = []
    before = read(PACK/'before/current/scout-summary.json')
    after = read(PACK/'after/current/scout-summary.json')
    whole = read(PACK/'after-whole/current/scout-summary.json')
    assert after['tableHash'] == whole['tableHash'] == sha((ROOT/'web/scene/table.js').read_bytes())
    assert before['tableHash'] == read(PACK/'START.json')['before_table_sha256']
    whole_by_id = {table['id']:table['shots'][0] for table in whole['tables']}
    for capture, summary in [('before',before),('after',after)]:
        for table in summary['tables']:
            for original in table['shots']:
                shot, folder = original, capture
                if capture == 'after' and shot['name'] == 'whole':
                    shot, folder = whole_by_id[table['id']], 'after-whole'
                file = f"{folder}/{shot['file']}"
                assert sha((PACK/file).read_bytes()) == shot['sha256'], file
                rows.append({'capture':capture,'table':table['id'],'pose':shot['name'],
                             'file':file,'sha256':shot['sha256'],'camera':shot['pose'],
                             'camera_alignment':'MATCHED',
                             'table_sha256':summary['tableHash']})
    poses = [shot['name'] for shot in before['tables'][0]['shots']]
    cameras = {(r['capture'],r['table'],r['pose']):r['camera'] for r in rows}
    max_delta = 0
    for table in TABLES[:2]:
        for pose in poses:
            b, a = [cameras[(capture,table,pose)] for capture in ['before','after']]
            for key in ['pos','target','viewport']:
                max_delta = max(max_delta, max(abs(x-y) for x,y in zip(b[key],a[key])))
            assert b['fov'] == a['fov'] and b['aspect'] == a['aspect']
            assert b['builtId'] == a['builtId'] == table
    # TESSELLATION/numeric camera-pose comparison, not a physical tolerance.
    assert max_delta < 1e-12, max_delta
    result = {'schema':'ob-cn8-d2-frames/1','render_frames':rows,'poses':poses,
              'camera_position_max_delta':max_delta,
              'rig':'Same neutral viewer and pinned Chrome shell; full native frames retained.',
              'matched_pairs_per_alias':len(poses),
              'whole_view_correction':'After whole-table frames reuse the recorded baseline camera. Original auto-framed after overviews are diagnostic only.'}
    write(PACK/'FRAME-REGISTER.json',result)
    return result


def mesh_rows(census):
    counts = collections.Counter()
    rows = {}
    for m in census['meshes']:
        key = f"{m['name']}#{counts[m['name']]}"
        counts[m['name']] += 1
        geometry = {k:m.get(k) for k in ['type','vertices','triangles','bounds_m','groups','matrix','indexSha256','positionWorldSha256']}
        geometry['attributes'] = {k:{field:v[field] for field in ['count','itemSize','sha256']}
                                  for k,v in m['attributes'].items()}
        rows[key] = {'name':m['name'],'geometry_sha256':digest(geometry),
                     'material_descriptor_sha256':digest(m['materials']),
                     'visible':m['visible'],'geometry':geometry,'materials':m['materials']}
    return rows


def seal():
    frames = register_frames()
    checks = read(PACK/'measurements/section-verification.json')
    assert checks['status'] == 'PASS'
    assert checks['table_sha256'] == sha((ROOT/'web/scene/table.js').read_bytes())
    full, summary = {}, {}
    changed_expected = {'cn8-bed#0','cn8cap-stitches#0',*[f'cn8r82-ring-{i}#0' for i in [0,2,3,5]]}
    removed_expected = {f'cn8r82-{kind}-{i}#0' for kind in ['block','fallface'] for i in [0,2,3,5]}
    removed_expected |= {f'cn8r82-endclose-{i}-{end}#0' for i in [0,2,3,5] for end in ['a','b']}
    for table in TABLES:
        b, a = [read(PACK/f'{capture}/current/{table}--census.json') for capture in ['before','after']]
        assert b['requested'] == b['builtId'] == a['requested'] == a['builtId'] == table
        assert b['pockets'] == a['pockets'] and b['slots'] == a['slots']
        bb, aa = mesh_rows(b), mesh_rows(a)
        changed = {key for key in bb.keys() & aa.keys() if bb[key] != aa[key]}
        removed, added = bb.keys()-aa.keys(), aa.keys()-bb.keys()
        assert not added
        assert changed == (changed_expected if table in TABLES[:2] else set()), (table,changed)
        assert removed == (removed_expected if table in TABLES[:2] else set()), (table,removed)
        full[table] = {'before':bb,'after':aa}
        summary[table] = {'before_meshes':len(bb),'after_meshes':len(aa),
                          'unchanged_meshes':len(aa)-len(changed),'changed':sorted(changed),
                          'removed':sorted(removed),'added':[],
                          'before_assembly_sha256':digest(bb),'after_assembly_sha256':digest(aa),
                          'pockets_and_slots_equal':True}
    for capture in ['before','after']:
        assert full[TABLES[0]][capture] == full[TABLES[1]][capture], 'Alias geometry diverged'
    positive = full[TABLES[0]]['after']['cn8r82-ring-5#0']['geometry']
    assert positive['attributes']['position']['sha256'] == checks['position_sha256']
    assert positive['indexSha256'] == checks['index_sha256']
    write(PACK/'measurements/MESH-DIGEST-LIST.json',full)
    write(PACK/'measurements/MESH-DELTA.json',summary)

    start = read(PACK/'START.json')
    frozen = {}
    for path, expected in start['protected'].items():
        actual = git('rev-parse',f'HEAD:{path}').decode().strip()
        assert actual == expected
        assert not git('diff',start['head'],'--',path).strip()
        assert not git('status','--porcelain','--',path).strip()
        frozen[path] = {'git_object':actual,'working_changes':False}
    phase1 = {}
    for path, expected in {
        'PLAN-CN8-POCKET.md':'7ac7094c390c0e1cb1f50bc416b080fd28bdd3a8e71553edd8591252f53d2ebf',
        'measurements/number-ledger.json':'22e4bf6d27877bb8b898d24cd4528af80e18c600f192fb1a24ac2ca6f5d70210',
        'measurements/number-ledger.md':'f8ead8cdc032faa96452f4640ba802e01f5f82fbd7ce45dda8cc4b214969fbd4',
    }.items():
        actual = sha((ART/path).read_bytes()); assert actual == expected
        phase1[path] = actual
    before_source = git('show',f"{start['head']}:web/scene/table.js").decode()
    after_source = (ROOT/'web/scene/table.js').read_text()
    retained = {}
    for label, begin, end in [
        ('CN8_R82 analytic datums','const CN8_R82 =','// GH-490 MOUTH-CURE'),
        ('corner bed holes / jaw-foot chain','    const cn8FootR =','      bedShape.holes.push(hole);'),
    ]:
        blocks = []
        for source in [before_source,after_source]:
            i = source.index(begin); j = source.index(end,i)+len(end)
            blocks.append(source[i:j])
        assert blocks[0] == blocks[1], label
        retained[label] = sha(blocks[0].encode())
    write(PACK/'measurements/FROZEN-FENCE.json',{'paths':frozen,'phase1':phase1,'retained_source_blocks':retained})

    gate_checks = {}
    for name, marker in [('e2e-tables','E2E-TABLES PASS'),('sinkdress','ALL PASS')]:
        log = PACK/f'logs/{name}-gate.log'
        text = log.read_text()
        assert marker in text and ' green (' in text, log
        gate_checks[name] = {'log':str(log.relative_to(PACK)), 'sha256':sha(log.read_bytes()),
                             'status':'PASS','band':'9580-9609 via run-gate'}
        if name == 'sinkdress':
            gate_checks[name]['passed_assertions'] = sum(line.startswith('PASS  ') for line in text.splitlines())
    for capture in ['before','after','after-whole']:
        cleanup = read(PACK/f'{capture}/logs/scout-cleanup.json')
        assert all(cleanup[key] for key in ['browserGone','serverGone','profileGone'])
    ledger = read(ROOT/'docs/geometry/cn8-pocket-d2-ledger.json')
    compact_checks = {key:value for key,value in checks.items() if key not in ['sections','boundary_examples','winding_examples']}
    compact_checks.update({'section_count':len(checks['sections']),
                          'section_crossings':sum(s['crossings'] for s in checks['sections']),
                          'gauge_range_mm':[min(s['gauge_min_mm'] for s in checks['sections']),max(s['gauge_max_mm'] for s in checks['sections'])],
                          'max_inner_chord_error_mm':max(s['inner_chord_error_mm'] for s in checks['sections'])})
    changed_digests = {key:{capture:{k:full[TABLES[0]][capture][key][k] for k in
                                   ['geometry_sha256','material_descriptor_sha256']}
                           for capture in ['before','after']} for key in sorted(changed_expected)}
    result = {'schema':'ob-cn8-d2-seal/1','status':'FIRST GEOMETRY SEALED; stop for maintainer review',
              'base_geometry_commit':start['head'],'branch':'astra-cn8-pocket-2026-09','draft_pr':748,
              'source_hierarchy':'MODEL(Star), cross-model / MFR printed corrections / PHOTO alignment / explicit EST',
              'private_packet':'<private evidence>/astra-cn8/phase2-d2/seal-1',
              'before_table_sha256':start['before_table_sha256'],'table_sha256':checks['table_sha256'],
              'definition_sha256':sha((ROOT/'docs/geometry/cn8-pocket-d2-section.json').read_bytes()),
              'ledger_sha256':sha((ROOT/'docs/geometry/cn8-pocket-d2-ledger.json').read_bytes()),
              'frame_register_sha256':sha((PACK/'FRAME-REGISTER.json').read_bytes()),
              'mesh_digest_list_sha256':sha((PACK/'measurements/MESH-DIGEST-LIST.json').read_bytes()),
              'section_verification_sha256':sha((PACK/'measurements/section-verification.json').read_bytes()),
              'frozen_fence_sha256':sha((PACK/'measurements/FROZEN-FENCE.json').read_bytes()),
              'drawing_sha256':{str(p.relative_to(PACK)):sha(p.read_bytes()) for p in sorted((PACK/'drawings').glob('D2-*')) if p.is_file()},
              'mesh_census_hash_scope':'All geometry attributes/index, world positions/matrices, declared material properties and map descriptors. Texture pixels are not hashed; retained procedural material code is unchanged.',
              'mesh_delta':summary,'changed_mesh_digests':changed_digests,
              'topology_and_sections':compact_checks,'tag_census':ledger['census'],
              'render_frame_count':len(frames['render_frames']),'fixed_camera_max_delta':frames['camera_position_max_delta'],
              'matched_pose_pairs_per_alias':frames['matched_pairs_per_alias'],
              'whole_view_status':frames['whole_view_correction'],
              'gates':gate_checks,'frozen_paths':frozen,'retained_source_blocks':retained,
              'open_est_rows_are_blockers':False,'deferred':'D3 middle pockets; D4 net/hardware/fall assembly; D5 legs'}
    write(ROOT/'docs/geometry/cn8-pocket-d2-seal.json',result)
    write(PACK/'D2-GEOMETRY-SEAL.json',result)
    (PACK/'D2-GEOMETRY-SEAL.md').write_bytes((ROOT/'docs/geometry/cn8-pocket-d2-seal.md').read_bytes())
    # The manifest excludes itself. It binds measurements, final frames,
    # comparison drawings and logs, while preserving rejected studies nearby.
    files = [r['file'] for r in frames['render_frames']]
    files += [str(p.relative_to(PACK)) for folder in ['measurements','frames','drawings','logs']
              for p in sorted((PACK/folder).glob('*')) if p.is_file()]
    files += ['FRAME-REGISTER.json','D2-GEOMETRY-SEAL.json','D2-GEOMETRY-SEAL.md']
    write(PACK/'SEAL-MANIFEST.json',{'schema':'ob-cn8-d2-manifest/1',
          'files':{file:{'sha256':sha((PACK/file).read_bytes()),'bytes':(PACK/file).stat().st_size}
                   for file in sorted(set(files))}})
    print(json.dumps({'status':result['status'],'table_sha256':result['table_sha256'],
                      'frames':result['render_frame_count'],'tags':ledger['census']},indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--frames-only',action='store_true')
    args = parser.parse_args()
    register_frames() if args.frames_only else seal()
