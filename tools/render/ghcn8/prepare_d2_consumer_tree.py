# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Make a private, committed integration preview; never merge a working branch.

The selected craft side resolves only craft-owned tool conflicts, explicitly
recorded. Its fixtures are consumed verbatim, never regenerated. The pending
D2/D3 correction is overlaid from this checkout. The preview commit is local to
the new export repository and is not a delivery commit.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
PRIVATE_HELPERS = {'build_census.py', 'capture_reference_views.mjs', 'measure_hardware.py',
                   'measure_sections.py', 'reference_browser.mjs', 'scout.mjs',
                   'd3_camera.py', 'bound_d3_camera.py', 'd3_bound_partition.py'}
# A working-directory glob could export untracked calibration or scout files.
# Only tracked files and these explicit D3 delivery files may enter a preview.
D3_DELIVERY = {
    'docs/geometry/' + name for name in (
        'cn8-pocket-d3-section.json', 'cn8-pocket-d3-ledger.json',
        'cn8-pocket-d3-source-inputs.json', 'cn8-pocket-d3-reference-register.json',
        'cn8-pocket-d3-star-hem.json', 'cn8-pocket-d3-b1-consistency.json',
        'cn8-pocket-d3-seal.json', 'cn8-pocket-d3-seal.md',
        'cn8-pocket-d3-star-joint.json', 'cn8-pocket-d3-star-tongue.json')
} | {
    'tools/render/ghcn8/' + name for name in (
        'README.md', 'derive_d3_section.py', 'gen_d3_section.mjs',
        'measure_d3_star_hem.py', 'measure_d3_b1_sensitivity.py',
        'test_d3_measurements.py', 'cn8_emitted_checks.mjs',
        'test_cn8_emitted_checks.mjs', 'verify_d3_sections.mjs',
        'd2_capture_options.mjs', 'test_d2_capture_options.mjs', 'capture_d2_emitted.mjs',
        'measure_d3_star_joint.py', 'measure_d3_star_tongue.py',
        'cn8_rail_checks.mjs', 'cn8_tongue_checks.mjs', 'capture_d3_joint_cpu.mjs',
        'measure_d3_interpenetration.py', 'test_d3_interpenetration.py',
        'test_d3_rails.mjs', 'test_d3_tongue.mjs', 'test_d3_consumers.py',
        'verify_d3_joints.mjs')
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--craft-tip', required=True)
    parser.add_argument('--cn8-tip', required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    out = args.out.resolve()
    if out.exists(): raise SystemExit('Preview destination must not already exist')
    out.mkdir(parents=True)
    git = lambda *argv: subprocess.check_output(['git', *argv], cwd=ROOT)
    for ref in (args.craft_tip, args.cn8_tip):
        if git('rev-parse', ref).decode().strip() != ref: raise SystemExit('Use full commit SHAs')
    merged = subprocess.run(['git', 'merge-tree', '--write-tree', '--messages', args.craft_tip, args.cn8_tip], cwd=ROOT, capture_output=True, text=True)
    if merged.returncode not in (0, 1): raise SystemExit(merged.stderr)
    merged_tree = merged.stdout.splitlines()[0]
    proc = subprocess.Popen(['git', 'archive', '--format=tar', merged_tree], cwd=ROOT, stdout=subprocess.PIPE)
    extraction = subprocess.run(['tar', '-xf', '-', '-C', str(out)], stdin=proc.stdout)
    proc.stdout.close()
    if proc.wait() or extraction.returncode: raise SystemExit('Archive export failed')
    choices = []
    for line in merged.stdout.splitlines()[1:]:
        if not line.startswith('CONFLICT (content): Merge conflict in '): continue
        rel = line.split(' in ', 1)[1]
        if rel == 'web/sw.js':
            # The cache manifest is generated again after the source merge.
            (out / rel).write_bytes(git('show', args.cn8_tip + ':' + rel))
            choices.append({'path': rel, 'resolution': 'CN8 service-worker shell plus regenerated manifest'})
        elif rel.startswith('tools/render/'):
            (out / rel).write_bytes(git('show', args.craft_tip + ':' + rel))
            choices.append({'path': rel, 'resolution': 'Craft committed tool side, preview only'})
        else: raise SystemExit('Unadjudicated preview conflict: ' + rel)
    # Pin the craft lane's complete fixture directory exactly as committed.
    proc = subprocess.Popen(['git', 'archive', '--format=tar', args.craft_tip, 'tools/render/fixtures'], cwd=ROOT, stdout=subprocess.PIPE)
    extraction = subprocess.run(['tar', '-xf', '-', '-C', str(out)], stdin=proc.stdout)
    proc.stdout.close()
    if proc.wait() or extraction.returncode: raise SystemExit('Craft fixture export failed')
    patch = git('diff', args.cn8_tip, '--', 'web/scene/table.js')
    table_file = out / 'web/scene/table.js'
    merged_renderer = table_file.read_text()
    craft_trim = '''    // ORDER-CN8-SLIT-FIX: the cushion's cut cap owns the DT-09 plane inboard of the
    // back line −CW, so the half-plank's flat end face on that plane stops at the back
    // line (trimPlankCutFace — a derivation from CW / DT-09, no new dimension)
    if (G.render.style === 'cn8') trimPlankCutFace(geo, G, [(F.SC[1] - CN8_MID.DT09) - G.L / 2, (G.L - (F.SC[1] - CN8_MID.DT09)) - G.L / 2]);
'''
    bridge = 'function cn8D3RailGeometry(' in (ROOT / 'web/scene/table.js').read_text() and craft_trim in merged_renderer
    if bridge:
        if merged_renderer.count(craft_trim) != 1:
            raise SystemExit('Ambiguous craft middle-face hook')
        # Remove only this known call-site hook to apply the corner patch.
        # Restore the exact craft operation in its original coordinate frame
        # below. Its helper and fixtures are not edited or re-pinned.
        table_file.write_text(merged_renderer.replace(craft_trim, ''))
    if patch: subprocess.run(['git', 'apply', '-'], cwd=out, input=patch, check=True)
    if bridge:
        source = table_file.read_text()
        anchor = '      geo = cn8D3RailGeometry(G, pli, cn8WoodOpts, railSeatY);'
        if source.count(anchor) != 1:
            raise SystemExit('Missing unique FIX1 plank call-site for the craft bridge')
        operation = '''
      // Private integration bridge: the craft trim consumes the old XY
      // plan frame. Exact signed axis permutations carry the new world
      // buffers through its unchanged CW/DT09 face-ownership operation.
      for (const key of ['position', 'normal']) {
        const a = geo.getAttribute(key); if (!a) continue;
        for (let i = 0; i < a.count; i++) { const y = a.getY(i), z = a.getZ(i); a.setYZ(i, -z, y); }
      }
      trimPlankCutFace(geo, G, [(F.SC[1] - CN8_MID.DT09) - G.L / 2, (G.L - (F.SC[1] - CN8_MID.DT09)) - G.L / 2]);
      for (const key of ['position', 'normal']) {
        const a = geo.getAttribute(key); if (!a) continue;
        for (let i = 0; i < a.count; i++) { const y = a.getY(i), z = a.getZ(i); a.setYZ(i, z, -y); }
      }
      geo.computeBoundingBox(); geo.computeBoundingSphere();'''
        # BufferAttribute exposes setXYZ, not a generic two-axis writer.
        operation = operation.replace('a.setYZ(i, -z, y)', 'a.setXYZ(i, a.getX(i), -z, y)') \
            .replace('a.setYZ(i, z, -y)', 'a.setXYZ(i, a.getX(i), z, -y)')
        table_file.write_text(source.replace(anchor, anchor + operation))
        choices.append({'path': 'web/scene/table.js', 'resolution': 'Retain the craft trimPlankCutFace helper and middle-face ownership via exact axis permutations around its call; retain the FIX1 corner constructor. Private integration only, no fixture changes.'})
    copied = []
    tracked = set(git('ls-files', '-z', '--', 'docs/geometry/cn8-pocket-*',
                      'tools/render/ghcn8/*').decode().rstrip('\0').split('\0'))
    for relative in sorted(tracked | D3_DELIVERY):
        source = ROOT / relative
        if not source.is_file(): continue
        if source.name in PRIVATE_HELPERS or source.name in (
                'cn8-pocket-d3-photo-inputs.json', 'cn8-pocket-d3-camera-bound.json'):
            raise SystemExit('Private input cannot enter a preview: ' + relative)
        (out / relative).parent.mkdir(parents=True, exist_ok=True)
        (out / relative).write_bytes(source.read_bytes())
        copied.append(relative)
    rel = Path('docs/geometry/cn8-corner-furniture-definition-contract.json')
    (out / rel).write_bytes((ROOT / rel).read_bytes()); copied.append(str(rel))
    subprocess.run(['node', 'web/tools/gen-sw-precache.mjs'], cwd=out, check=True)
    subprocess.run(['git', 'init', '-q', str(out)], check=True)
    common = Path(git('rev-parse', '--git-common-dir').decode().strip())
    if not common.is_absolute(): common = (ROOT / common).resolve()
    alternates = out / '.git/objects/info/alternates'
    alternates.write_text(str(common / 'objects') + '\n')
    subprocess.run(['git', 'add', '-A'], cwd=out, check=True)
    tree = subprocess.check_output(['git', 'write-tree'], cwd=out, text=True).strip()
    craft_fixture_tree = git('rev-parse', args.craft_tip + ':tools/render/fixtures').decode().strip()
    actual_fixture_tree = subprocess.check_output(
        ['git', 'rev-parse', tree + ':tools/render/fixtures'], cwd=out, text=True).strip()
    if actual_fixture_tree != craft_fixture_tree:
        raise SystemExit('Preview fixture tree differs from the pinned craft commit')
    commit = subprocess.check_output(['git', '-c', 'user.name=CN8 integration preview',
        '-c', 'user.email=cn8-preview@example.invalid', 'commit-tree', tree,
        '-p', args.craft_tip, '-p', args.cn8_tip, '-m', 'test: private CN8 consumer integration preview'], cwd=out, text=True).strip()
    subprocess.run(['git', 'symbolic-ref', 'HEAD', 'refs/heads/cn8-consumer-preview'], cwd=out, check=True)
    subprocess.run(['git', 'update-ref', 'HEAD', commit], cwd=out, check=True)
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=out).strip(): raise SystemExit('Preview is not clean')
    record = {'craft_tip': args.craft_tip, 'cn8_tip': args.cn8_tip, 'merge_tree': merged_tree,
              'preview_commit': commit, 'preview_tree': tree, 'directory': str(out),
              'conflict_choices': choices, 'candidate_files': copied,
              'candidate_table_patch_sha256': hashlib.sha256(patch).hexdigest(),
              'craft_fixture_tree': craft_fixture_tree,
              'table_sha256': hashlib.sha256((out / 'web/scene/table.js').read_bytes()).hexdigest(),
              'scope': 'Private integration preview only. Craft owns final tools-only landing and measurement-corrected fixture re-pins; this script changes no working branch or source fixture.'}
    args.receipt.write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps(record, indent=2))


if __name__ == '__main__': main()
