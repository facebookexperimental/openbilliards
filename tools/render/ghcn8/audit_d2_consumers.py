# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Run the named D2 consumers and generate their RED/GREEN disclosure table.

Run through the authorized run-gate band against a clean integration preview:
9580-9609, or the D3-FIX1 verifier slice 9610-9639 with pins 9620/9635.
Use --only CASE for short claims, then --render-only without a browser to
assemble the complete table from matching hashed execution receipts.
This does not rewrite consumer code, thresholds or fixtures. Geometry-reading
battery entry points are exercised; the craft lane still owns its full battery
and its argument/ownership negative arms at landing.
"""
import argparse
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import time


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


FIX1_DISPOSITION = 'ORDER-8 orchestrator disposition 2026-09-12 00:05Z'
FIX1_CORRECTION_CAUSE = 'geometry corrected by D3-FIX1 (crown/rail-top overlap removed)'
FIX1_CORRECTION_CASES = frozenset({'coplanar'})


def consumer_ports(env):
    """Admit the original allocation or the exact authorized verifier pins."""
    values = [env.get(key, '') for key in ('OB_E2E_PORT', 'OB_E2E_CDP_PORT')]
    if any(not isinstance(value, str) or not re.fullmatch(r'[0-9]+', value) for value in values):
        raise ValueError('OB_E2E_PORT and OB_E2E_CDP_PORT must be integer ports')
    http, cdp = map(int, values)
    if http == cdp or not (all(9580 <= port <= 9609 for port in (http, cdp))
                          or (http, cdp) == (9620, 9635)):
        raise ValueError('Use run-gate --band 9580-9609, or authorized --band 9610-9639 with HTTP 9620 / CDP 9635')
    return http, cdp


def measured_disposition_evidence(detail):
    """A disposition is a named record with measurements and hashed evidence."""
    if not isinstance(detail, dict):
        return False
    measurements = detail.get('measurements', [])
    evidence = detail.get('evidence', [])
    return (isinstance(detail.get('unintended_geometry_changes'), list)
            and isinstance(evidence, list) and bool(evidence)
            and all(isinstance(e, dict) and isinstance(e.get('path'), str) and e['path']
                    and isinstance(e.get('sha256'), str) and re.fullmatch(r'[0-9a-f]{64}', e['sha256'])
                    for e in evidence)
            and isinstance(measurements, list) and bool(measurements)
            and all(isinstance(m, dict) and m.get('subject') and m.get('metric')
                    and m.get('unit') and m.get('tag') == 'DERIVED'
                    and all(type(m.get(k)) in (int, float) and math.isfinite(m[k])
                            for k in ('before', 'after')) for m in measurements))


def measured_fixture_correction(consumer, detail):
    """Only the specifically ruled consumer can inherit the measured exception."""
    if not measured_disposition_evidence(detail):
        return False
    disposition = detail.get('disposition')
    return (isinstance(disposition, dict) and consumer in FIX1_CORRECTION_CASES
            and disposition.get('consumer') == consumer
            and disposition.get('kind') == 'measured-correction'
            and disposition.get('authority') == FIX1_DISPOSITION
            and detail.get('cause') == FIX1_CORRECTION_CAUSE
            and detail.get('unintended_geometry_changes') == []
            and any(m['before'] != m['after'] for m in detail['measurements']))


def explicit_disposition(consumer, current, detail):
    """Validate a recorded diagnosis; only GREEN or the named exception closes it."""
    if not measured_disposition_evidence(detail):
        return False
    disposition = detail.get('disposition')
    if not isinstance(disposition, dict) or disposition.get('consumer') != consumer \
            or not isinstance(disposition.get('authority'), str) or not disposition['authority'].strip():
        return False
    kind = disposition.get('kind')
    if kind == 'measured-correction':
        return current == 'RED' and measured_fixture_correction(consumer, detail)
    return (kind == 'verified-green' and current == 'GREEN'
            and detail['unintended_geometry_changes'] == []
            or kind == 'diagnosed-regression' and current == 'RED')


def with_delta(row, baseline, previous=None, causes=None):
    """Carry unresolved blockers; a later RED never becomes a legacy failure."""
    old = baseline.get(row['id'])
    if old not in ('GREEN', 'RED'):
        raise ValueError('Missing D2 consumer baseline: ' + row['id'])
    previous_row = (previous or {}).get(row['id'])
    prior = previous_row.get('status') if isinstance(previous_row, dict) else previous_row
    if prior not in ('GREEN', 'RED'):
        raise ValueError('Missing previous-round consumer verdict: ' + row['id'])
    current = row['status']
    if current not in ('GREEN', 'RED'):
        raise ValueError('Invalid current consumer verdict: ' + row['id'])
    delta = 'unchanged' if current == old else old + '-to-' + current
    prior_delta = 'unchanged' if current == prior else prior + '-to-' + current
    previous_row = previous_row if isinstance(previous_row, dict) else {}
    carried_regression = bool(previous_row.get('current_round_regression'))
    carried_pending = bool(previous_row.get('delta_diagnosis_pending'))
    changed = current != old or current != prior
    detail = (causes or {}).get(row['id'])
    cause = detail.get('cause') if isinstance(detail, dict) else detail
    if changed and not cause:
        cause = ('Current hashed execution is GREEN; prior blockers are closed'
                 if current == 'GREEN' else 'PENDING diagnosis: inspect this row\'s hashed log before sealing')
    if not cause and (carried_regression or carried_pending):
        cause = previous_row.get('delta_cause') or 'Unresolved blocker carried from the previous round'
    if not changed and not cause:
        cause = 'Legacy D2 fixture/schema RED remains' if old == 'RED' else 'No status change from D2 or D3'
    owner = row['owner']
    correction = measured_fixture_correction(row['id'], detail)
    unintended = detail.get('unintended_geometry_changes', []) if isinstance(detail, dict) else []
    regression = current == 'RED' and (bool(unintended) or prior == 'GREEN'
                                      or carried_regression) and not correction
    disposed = explicit_disposition(row['id'], current, detail)
    # ORDER-11 R2: neither an explanation nor advancing the comparison ledger
    # closes a pending RED. Only GREEN or the named measured exception can.
    pending = current == 'RED' and not correction and (changed or bool(unintended)
        or carried_pending or isinstance(detail, dict) and bool(detail.get('disposition')))
    carried_blockers = []
    if current == 'RED' and not correction and (carried_regression or carried_pending):
        # Preserve the original blocking receipt verbatim, not a status-only
        # reconstruction. Repeated RED rounds retain the same origin record.
        carried_blockers = copy.deepcopy(previous_row.get('carried_blockers') or [previous_row])
    if current == 'RED' and correction:
        owner = 'Craft lane: measurement re-pin of the old overlapping geometry after #731 lands; #748 follows'
    elif regression:
        owner = 'Geometry round: current-round geometry regression; BLOCKS seal'
    elif pending:
        owner = 'Geometry round: pending measured disposition; BLOCKS seal'
    elif current == 'GREEN' and old == 'RED' and disposed:
        owner = 'Geometry round: measured geometry correction passes; no fixture re-pin'
    elif current == 'GREEN' and (carried_regression or carried_pending):
        owner = 'Geometry round: consumer GREEN; previous regression and diagnosis blockers closed'
    return {**row, 'd2_status': old, 'previous_d3_status': prior,
            'delta_vs_d2': delta, 'delta_vs_previous_d3': prior_delta,
            'delta_cause': cause, 'owner': owner, 'current_round_regression': regression,
            'corrected_geometry_fixture_delta': current == 'RED' and correction,
            'delta_measurements': detail.get('measurements', []) if isinstance(detail, dict) else [],
            'delta_evidence': detail.get('evidence', []) if isinstance(detail, dict) else [],
            'delta_disposition': detail.get('disposition') if isinstance(detail, dict) else None,
            'unintended_geometry_changes': unintended,
            'carried_blockers': carried_blockers,
            'delta_diagnosis_pending': bool(pending)}


def consumer_deltas(baseline, previous, causes):
    """Bind the complete prior ledger, including its row and summary blockers."""
    if not baseline.get('complete') or not previous.get('complete'):
        raise ValueError('Only complete prior consumer ledgers may define the delta')
    prior = {row['id']: copy.deepcopy(row) for row in previous['rows']}
    if len(prior) != len(previous['rows']):
        raise ValueError('Duplicate previous-round consumer identity')
    for field, summary_key in [('current_round_regression', 'current_round_regressions'),
                               ('delta_diagnosis_pending', 'pending_delta_diagnoses')]:
        for name in previous.get(summary_key, []):
            if name not in prior:
                raise ValueError('Previous ledger blocker has no consumer receipt: ' + name)
            # A summary blocker cannot disappear because an older row schema
            # omitted its flag. Retain that complete original receipt as well.
            if not prior[name].get(field):
                if not prior[name].get('carried_blockers'):
                    prior[name]['carried_blockers'] = [copy.deepcopy(prior[name])]
                prior[name][field] = True
    old = {row['id']: row['status'] for row in baseline['rows']}
    return lambda row: with_delta(row, old, prior, causes)


def consumer_markdown(summary, out):
    """Render the measured ledger without rerunning or relabelling its executions."""
    receipts = summary['rows']
    binding = summary['binding']
    lines = ['<!-- Generated by tools/render/ghcn8/audit_d2_consumers.py; do not type verdicts. -->',
             f"Integration preview `{binding['commit']}`, tree `{binding['tree']}`; renderer SHA-256 `{binding['table_sha256']}`.", '',
             f"**{len(receipts)} cases: {summary['red']} RED / {summary['green']} GREEN.** Receipts and relative log paths are rooted at `{out}`. Driver exit zero means the disclosure completed; it does not mean every consumer passed.", '',
             '| Tool / fixture (mode) | What pins it | Result | Delta vs D2 / previous D3; cause | Before / after numbers | Who resolves / re-pins |', '|---|---|---|---|---|---|']
    for row in receipts:
        subject = '; '.join(f'`{item}`' for item in [row['tool'], *row['fixtures']])
        measurements = f"[{len(row['delta_measurements'])} measured rows](#delta-{row['id']})" if row['delta_measurements'] else 'No measured status delta'
        lines.append(f"| {subject} (`{row['id']}`) | {row['pins']} | **{row['status']}**, exit `{row['exit_code']}`; `{row['log']}` | {row['delta_vs_d2']} / {row['delta_vs_previous_d3']}; {row['delta_cause']} | {measurements} | {row['owner']} |")
    for row in receipts:
        if not row['delta_measurements']: continue
        disposition = row['delta_disposition']
        label = json.dumps(disposition, sort_keys=True) if isinstance(disposition, dict) else disposition or 'Measured diagnosis'
        lines += ['', f"### Delta {row['id']}", '',
                  row['delta_cause'] + '. ' + label + '.', '',
                  '| Table / subject | Metric | Before | After | Unit / tag |', '|---|---|---|---|---|']
        for m in row['delta_measurements']:
            lines.append(f"| {m['subject']} | {m['metric']} | {m['before']} | {m['after']} | {m['unit']} / {m['tag']} |")
        lines += ['', 'Evidence: ' + '; '.join(f"`{e['path']}` SHA256 `{e['sha256']}`" for e in row['delta_evidence']) + '.']
    lines += ['', 'GREEN on a producer means the capture/drawing completed, not photographic or geometry acceptance. RED includes named refusals; inspect the hashed log before attributing it to a geometric defect. The owner column identifies consumer/fixture ownership, not permission to waive a geometry defect.', '', summary['coverage'], '']
    lines += [summary['landing_order'], '',
              f"Unintended/undiagnosed geometry regressions: {', '.join(summary['current_round_regressions']) or 'none'}. Pending delta diagnoses: {', '.join(summary['pending_delta_diagnoses']) or 'none'}.", '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tree', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--refs', type=Path, required=True)
    parser.add_argument('--baseline-d2', type=Path, required=True)
    parser.add_argument('--previous-d3', type=Path, required=True,
                        help='Complete immediately previous round ledger; D2 cannot substitute for it')
    parser.add_argument('--delta-causes', type=Path)
    parser.add_argument('--resume', action='store_true')
    parser.add_argument('--only', action='append', default=[], metavar='CASE',
                        help='Run one named case per short band claim; reuse other matching receipts')
    parser.add_argument('--render-only', action='store_true',
                        help='Regenerate disclosure from matching hashed receipts; never launch a consumer')
    args = parser.parse_args()
    if args.only and args.render_only:
        parser.error('--only and --render-only are mutually exclusive')
    tree, out, refs = args.tree.resolve(), args.out.resolve(), args.refs.resolve()
    baseline = json.loads(args.baseline_d2.read_text())
    previous = json.loads(args.previous_d3.read_text()) if args.previous_d3 else None
    causes = json.loads(args.delta_causes.read_text()) if args.delta_causes else {}
    for case, detail in causes.items():
        if not isinstance(detail, dict):
            continue
        for evidence in detail.get('evidence', []):
            if not isinstance(evidence, dict) or not evidence.get('path') or not evidence.get('sha256'):
                raise SystemExit('Missing delta evidence hash for ' + case)
            path = Path(evidence['path'])
            if not path.is_absolute(): path = args.delta_causes.parent / path
            if not path.is_file() or sha(path) != evidence['sha256']:
                raise SystemExit('Changed or missing delta evidence for ' + case + ': ' + str(path))
    try:
        delta = consumer_deltas(baseline, previous, causes)
    except ValueError as error:
        raise SystemExit(str(error)) from error
    if not args.render_only:
        try:
            consumer_ports(os.environ)
        except ValueError as error:
            raise SystemExit(str(error)) from error
    out.mkdir(parents=True, exist_ok=True)
    (out / 'logs').mkdir(exist_ok=True)
    git = lambda *argv: subprocess.check_output(['git', *argv], cwd=tree, text=True).strip()
    if git('status', '--porcelain'):
        raise SystemExit('Consumer preview must be clean before the audit')
    binding = {'commit': git('rev-parse', 'HEAD'), 'tree': git('rev-parse', 'HEAD^{tree}'),
               'table_sha256': sha(tree / 'web/scene/table.js'),
               'battery_sha256': sha(tree / 'tools/render/battery-490-craft.sh'),
               'reference_sha256': {p.name: sha(p) for p in sorted(refs.iterdir()) if p.is_file()}}
    env = os.environ.copy()
    env['OB_490_REFS'] = str(refs)
    jobs = []

    def add(name, tool, argv, pins, pattern=None, negative=False, role='judge', fixtures=()):
        jobs.append(dict(id=name, tool=tool, argv=argv, pins=pins, pattern=pattern,
                         negative=negative, role=role, fixtures=list(fixtures)))

    add('emitted', 'tools/render/ghcn8/capture_d2_emitted.mjs',
        ['--web', str(tree / 'web'), '--out', str(out / 'emitted')],
        'Actual scene names, metadata and attributes; input for fixture applicability', role='producer')
    for name, argv, pattern in [
        ('pass2-gate', ['--gate'], r'^\[pass2\] PASS'),
        ('pass2-red-arm', ['--red-arm'], r'^\[red-arm\] OK'),
        *[(f'pass2-{arm}', ['--gate', f'--perturb={arm}'], rf'^\[perturb {arm}\] ARMED')
          for arm in ('knit-rise', 'cover-lift', 'body-hide', 'sight-add')],
    ]:
        add(name, 'web/tools/check-490-pass2.mjs', argv,
            'Retired cn8Fillet column layout; middle/corner definition letters', pattern,
            fixtures=['tools/render/fixtures/pass2-490-red-basis.json'])
    add('pass2-drop-measure', 'web/tools/check-490-pass2.mjs', ['--gate', '--drop-measure=gate3_butt_mm'],
        'Battery missing-measurement negative arm; legacy schema still applies', r'^\[pass2\] RED: schema', True)
    add('letters', 'tools/render/asmodeled-drawings-490.mjs',
        ['--letters', '--judge', '--no-png', '--out', str(out / 'letters')],
        'Signed legacy crown/section letters and ring/block/fallface classification', r'LETTERS-490 JUDGE: PASS')
    add('fullview', 'tools/render/fullview-overlay-490.mjs',
        ['--judge', '--no-png', '--out', str(out / 'fullview'), '--save-dump', str(out / 'fullview-dump.json')],
        'Legacy silhouette, section closure and envelope letters')
    for name in ('fullview-red-basis-490.json', 'fullview-red-basis-490m.json'):
        add(name, 'tools/render/ghcn8/check_d2_consumer_fixture.py',
            ['--fixture', 'tools/render/' + name, '--emitted', str(out / 'emitted/emitted.json')],
            'Historical fullview inventory names; current-layout applicability, not rejudging archived negatives',
            fixtures=['tools/render/' + name])
    add('horn', 'web/tools/probe-490-horn.mjs', ['--out', str(out / 'horn.json')],
        'Retired cn8Roll subjects / cn8Fillet; refusal is disclosed separately from a geometry failure')
    add('cammatch-capture', 'tools/render/cammatch-490.mjs',
        ['--web', str(tree / 'web'), '--refs', str(refs), '--out', str(out / 'cammatch')],
        'solves-490.json camera/material classification and hashed legacy references', role='producer')
    add('cammatch-compare', 'tools/render/cammatch/compare-490.py',
        ['--refs', str(refs), '--renders', str(out / 'cammatch'), '--out', str(out / 'cammatch-compare'), '--gate'],
        'Legacy photo regions and material/shape windows; not a Q8Pro D1 identity ruling')
    add('corner-overlay', 'tools/render/overlay-490-gate.mjs',
        ['--gate', '--web', str(tree / 'web'), '--out', str(out / 'corner-overlay')],
        'tools/audit/overlay-490-corner.py via its standing capture wrapper and era-pinned reference bars',
        fixtures=['tools/render/fixtures/overlay-490-red-basis.json'])
    add('r35-sections', 'tools/audit/probe490_r35.py',
        [str(out / 'emitted/chinese8_pro_9ft-triangles.json'), '--json', str(out / 'r35.json')],
        'Retired crown, curtain, end-tuck and section-height letters')
    add('plan-frames', 'tools/render/gh490m/plan_frames_r12.py',
        ['--dump', str(out / 'emitted/chinese8_pro_9ft-positions.json'), '--output-dir', str(out / 'plan-frames')],
        'Current triangles versus middle/corner letter drawings; producer completion alone is not fidelity acceptance', role='producer')
    fence_tables = ('wpa_generic_9ft', 'wpa_spec_9ft', 'diamond_redlabel_9ft', 'diamond_proam_9ft',
                    'predator_apex_9ft', 'wpbsa_snooker_12ft', 'umb_carom_284',
                    'pool_pro_9ft_measured', 'joy_q8_9ft', 'chinese8_pro_9ft')
    for table in fence_tables:
        add('census-' + table, 'tools/render/census-490-tables.mjs',
            ['--table', table, '--web', str(tree / 'web'), '--out', str(out / 'census' / (table + '.json'))],
            'Actual mesh, material and attribute census', role='producer')
    add('fence-battery', 'tools/render/fence-judge-490.py',
        ['--base', 'tools/render/fixtures/fence-base-490', '--live', str(out / 'census'),
         '--target', 'chinese8_pro_9ft'],
        'Full ten-table battery: the pinned craft judge reports/exempts both CN8 aliases; the strict fixture rows below have no exemption')
    for table in fence_tables:
        fixture = f'tools/render/fixtures/fence-base-490/{table}.json'
        add('fixture-' + table, 'tools/render/fence-judge-490.py',
            ['--base', fixture, '--live', str(out / 'census' / (table + '.json')),
             '--target', 'none', '--tables', table],
            'Supplementary strict comparison of this committed fixture; no target exemption', fixtures=[fixture])
    add('coplanar', 'tools/render/check-coplanar-pairs.mjs',
        ['--web', str(tree / 'web'), '--expect-baseline', 'tools/render/fixtures/coplanar-baseline-490.json', '--out', str(out / 'coplanar')],
        'Craft-owned pair identities and areas', r'^\[coplanar\] BASELINE HELD',
        fixtures=['tools/render/fixtures/coplanar-baseline-490.json'])
    add('construction', 'tools/render/check-pocket-construction.mjs', [], 'Construction bars consumed by the battery', r'check-pocket-construction: all bars OK')
    add('cushion-profile', 'tools/render/check-cushion-profile.mjs', ['--expect-baseline'],
        'Unchanged cushion section baseline; BASELINE HELD is not zero failures', r'^\[cushion-profile\] BASELINE HELD',
        fixtures=['tools/render/fixtures/cushion-profile-baseline-490.json'])
    add('loft-manifold', 'tools/render/check-loft-manifold.mjs', [], 'Cushion loft topology (distinct from the D2 cover)', r'^\[loft-manifold\] PASS')
    add('mouthgrid', 'tools/render/mouthgrid-490.mjs',
        ['--web', str(tree / 'web'), '--poses', 'mid_close_diag,mid_tt_inside,c6_midext_owner_low,c7_rail25e_midext_aperture', '--out', str(out / 'mouthgrid')],
        'Battery ray-grid producer for the retained middle assembly', r'^\[mouthgrid-490\] mid_close_diag', role='producer')
    add('jawrake', 'tools/render/jawrake-490.mjs', ['--web', str(tree / 'web'), '--out', str(out / 'jawrake')],
        'Battery low-rail capture producer', r'JAWRAKE captures DONE', role='producer')
    add('jawstep', 'tools/audit/jawstep_490.py', ['--gate', '--caps', str(out / 'jawrake')],
        'Legacy jaw-rake image bars', r'-> GREEN')
    add('crosstable', 'tools/render/crosstable-spot-488p.mjs', ['--out', str(out / 'crosstable')],
        'Battery non-target table spot checks', r'CROSSTABLE-488P: CLEAN')
    add('gi-mirror-dump', 'tools/render/gi-mirror-dump-490.mjs',
        ['--web', str(tree / 'web'), '--out', str(out / 'gi-mirror-dump.json')],
        'Actual retained middle geometry for the GI mirror census', role='producer')
    add('gi-mirror', 'tools/render/gi-mirror-census-490.mjs',
        ['--dump', str(out / 'gi-mirror-dump.json'), '--out', str(out / 'gi-mirror.json')],
        'Bake mirror versus the emitted middle assembly', r'^\[gi-mirror-490\] PASS')
    for name, extra in [('drawing-write', []), ('drawing-check', ['--check'])]:
        add(name, 'tools/render/gh490m/gen_drawing_490m_r12.py', ['--output-dir', str(out / 'drawing-r12'), *extra],
            'Middle definition/drawing byte reproducibility; does not certify the D2 corner silhouette',
            r'^\[check\] [0-9]+ outputs byte-identical' if extra else None, role='producer')
    add('orbitsweep', 'tools/render/orbitsweep-490.mjs',
        ['--sweep', '--web', str(tree / 'web'), '--out', str(out / 'orbitsweep')],
        'Full default orbit; legacy ring/block masks, material windows and structural rows', r'^\[orbitsweep-490\] GREEN')

    selected = set(args.only) if args.only else {job['id'] for job in jobs}
    unknown = selected - {job['id'] for job in jobs}
    if unknown:
        parser.error('Unknown consumer case: ' + ', '.join(sorted(unknown)))
    dependencies = {
        'cammatch-compare': ['cammatch-capture'], 'jawstep': ['jawrake'],
        'gi-mirror': ['gi-mirror-dump'], 'drawing-check': ['drawing-write'],
        'fence-battery': ['census-' + table for table in fence_tables],
        **{'fixture-' + table: ['census-' + table] for table in fence_tables},
    }
    receipts = []
    pending = []
    summary = {'schema': 'ob-cn8-d2-consumers/4', 'binding': binding, 'complete': False, 'rows': receipts,
               'delta_baselines': {'d2': {'file': str(args.baseline_d2.resolve()), 'sha256': sha(args.baseline_d2)},
                   'previous_d3': {'file': str(args.previous_d3.resolve()), 'sha256': sha(args.previous_d3)} if previous else None}}
    for job in jobs:
        executable = 'node' if job['tool'].endswith('.mjs') else 'python3'
        command = [executable, job['tool'], *job['argv']]
        identity = {'binding': binding, 'command': command, 'tool_sha256': sha(tree / job['tool']),
                    'fixtures': {p: sha(tree / p) for p in job['fixtures']}}
        fingerprint = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
        record_path = out / (job['id'] + '.receipt.json')
        if (args.resume or args.render_only or job['id'] not in selected) and record_path.exists():
            old = json.loads(record_path.read_text())
            if old['fingerprint'] == fingerprint and sha(out / old['log']) == old['log_sha256']:
                # Descriptive text may be corrected without relabelling or rerunning the evidence.
                old['pins'] = job['pins']
                receipts.append(delta(old)); print(f"[consumers] reused {job['id']}: {old['status']}", flush=True); continue
        if args.render_only:
            raise SystemExit('No matching hashed execution receipt for ' + job['id'])
        if job['id'] not in selected:
            pending.append(job['id'])
            continue
        required = ([] if job['id'] == 'emitted' else ['emitted']) + dependencies.get(job['id'], [])
        completed = {row['id'] for row in receipts if row['status'] == 'GREEN'}
        missing = set(required) - completed
        if missing:
            raise SystemExit('Run prerequisite cases first: ' + ', '.join(sorted(missing)))
        log_path = out / 'logs' / (job['id'] + '.log')
        print(f"[consumers] running {job['id']}", flush=True)
        started = time.time()
        with log_path.open('w') as log:
            log.write('INPUT-BINDING ' + json.dumps(binding, sort_keys=True) + '\n'); log.flush()
            result = subprocess.run(command, cwd=tree, env=env, stdout=log, stderr=subprocess.STDOUT)
        text = log_path.read_text()
        ok = result.returncode != 0 if job['negative'] else result.returncode == 0
        if job['pattern']: ok = ok and bool(re.search(job['pattern'], text, re.MULTILINE))
        receipt = {**job, **identity, 'fingerprint': fingerprint, 'status': 'GREEN' if ok else 'RED',
                   'exit_code': result.returncode, 'elapsed_seconds': round(time.time() - started, 3),
                   'log': str(log_path.relative_to(out)), 'log_sha256': sha(log_path),
                   'owner': 'Geometry evidence bridge' if '/ghcn8/' in job['tool'] and not job['fixtures'] else 'Craft lane: disclosed measurement-corrected re-pin/retirement round',
                   'tail': text.splitlines()[-6:]}
        receipt = delta(receipt)
        record_path.write_text(json.dumps(receipt, indent=2) + '\n')
        receipts.append(receipt)
        print(f"[consumers] {receipt['status']} {job['id']} (exit {result.returncode})", flush=True)
        if sha(tree / 'web/scene/table.js') != binding['table_sha256']:
            raise SystemExit('The renderer changed during the consumer run')
        (out / 'CONSUMERS.json').write_text(json.dumps(summary, indent=2) + '\n')
        if job['id'] == 'emitted' and not ok:
            raise SystemExit('Emission capture failed; do not classify dependent consumers from missing input')
    summary.update(complete=not pending, pending=pending, disclosure_generator_sha256=sha(Path(__file__).resolve()),
                   coverage='Named D2 consumers and their geometry-reading battery modes. Full craft battery and its harness-only arms remain the craft lane landing gate.')
    summary['red'] = sum(row['status'] == 'RED' for row in receipts)
    summary['green'] = len(receipts) - summary['red']
    summary['current_round_regressions'] = [r['id'] for r in receipts if r['current_round_regression']]
    summary['corrected_geometry_fixture_deltas'] = [r['id'] for r in receipts if r['corrected_geometry_fixture_delta']]
    summary['pending_delta_diagnoses'] = [r['id'] for r in receipts if r['delta_diagnosis_pending']]
    summary['delta_causes_sha256'] = sha(args.delta_causes) if args.delta_causes else None
    summary['fixture_disposition'] = FIX1_DISPOSITION
    summary['landing_order'] = '#731 first; #748 after with the craft lane\'s own measured re-pins. No fixture is re-pinned by this audit.'
    if git('diff', '--name-only', '--', 'tools/render/fixtures'):
        raise SystemExit('A consumer modified a fixture; refusing the disclosure seal')
    (out / 'CONSUMERS.json').write_text(json.dumps(summary, indent=2) + '\n')
    if pending:
        (out / 'CONSUMERS.md').unlink(missing_ok=True)
        print(f"CONSUMERS PARTIAL: {len(receipts)}/{len(jobs)} recorded; {len(pending)} pending", flush=True)
        return
    (out / 'CONSUMERS.md').write_text(consumer_markdown(summary, out))
    print(f"CONSUMERS COMPLETE: {summary['red']} RED / {summary['green']} GREEN; no fixtures changed", flush=True)


if __name__ == '__main__':
    main()
