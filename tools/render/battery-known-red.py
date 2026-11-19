#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""battery-known-red.py — the craft battery's KNOWN-RED row.

battery-490-craft.sh stops at its first red step, so a step that is red on main for a filed issue used to hide every
row after it. A known-red step still runs to the end. This reader turns the step's output into a red SET and compares
it with the set pinned for that step in tools/render/fixtures/battery-490-known-red.json. The row holds only when the
two sets are equal:
  - a new red (another row of the instrument turned red) breaks it;
  - a vanished red (the issue's fix landed) breaks it, so the pin is retired on purpose, never by drift;
  - a planted red (an arm that adds a red row) breaks it.
Every later row of the battery then runs.

Red sets by kind (identities carry no measured numbers, so a pinned red that only changes value still holds):
  pass2      each "[pass2] RED: <message>" line, with numbers, [lists] and (parentheses) folded
  letters    the failing "letter" names of letters-compare.json (--json, or the fixture's json), plus each profile-leg
             failure as "leg:<label>: <reason>" with its numbers folded (a new leg failure is a new red)
  fullview   the failing row ids of fullview-490.json
  orbitsweep "<orbit>:<frame>:<cause>" for every cause of every failing frame (a new cause on an already failing frame is
             a new red), "<orbit>:aggregate:<fail>" for each per-orbit aggregate failure, and "structural:<fail>" for
             each structural failure, with measurements folded but frame identifiers kept (fold_identity)

A run counts only on its own verdict (review b21 P1): the exit code must be one of the instrument's verdict codes, the
current log must carry the instrument's verdict line, and with --since (the step's start, which the battery passes) a
JSON report older than the run is refused. A crash before the instrument rewrites its report can then never be read as
yesterday's pinned reds. Freshness alone does not prove ownership, since the reports sit at shared paths (review b21 round
2): the battery gives each invocation a run id (OB_RUN_ID, passed here as --run-id), the instrument stamps it into its
report, and a report that carries another run id, or none, is refused.

usage: battery-known-red.py --fixture F --step NAME --log LOG [--rc N] [--json PATH] [--since EPOCH] [--run-id ID]
         exit 0 held, 1 moved, 2 refused (no readable verdict: a crash is never an empty red set)
       battery-known-red.py --selftest   held / new / vanished / planted / refused cases, and one failing control per
                                         review b21 finding (leg failure, frame cause, structural, aggregate, stale report)
"""
import argparse
import json
import os
import re
import sys
import tempfile
import time

KINDS = ('pass2', 'letters', 'fullview', 'orbitsweep')
# the exit codes each instrument uses for a verdict (green / red); anything else is a refusal or a crash
VERDICT_RC = {'pass2': (0, 3), 'letters': (0, 3), 'fullview': (0, 3), 'orbitsweep': (0, 3)}
# the line each instrument prints only once its current run has judged
VERDICT_LINE = {
    'pass2': r'^\[pass2\] (RED: |PASS)',
    'letters': r'LETTERS-490 JUDGE: (PASS|FAIL)',
    'fullview': r'^\[fullview-490\] report -> |^FULLVIEW-490',
    'orbitsweep': r'^\[orbitsweep-490\] (RED|GREEN) -> ',
}


def refuse(msg):
    print(f'[known-red] REFUSED — {msg}')
    sys.exit(2)


def fold(message):
    """A pass2 RED message without its measured values: the row name (before the first ': ') stays verbatim, and
    the reason after it keeps its words while numbers, [lists] and (parentheses) fold."""
    row, sep, tail = message.partition(': ')
    m = re.sub(r'\[[^\]]*\]', '[…]', tail)
    m = re.sub(r'\([^)]*\)', '(…)', m)
    m = re.sub(r'[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?', '#', m)
    return row + sep + re.sub(r'\s+', ' ', m).strip()


def fold_identity(s):
    """A structural or aggregate failure without its measurements, keeping what identifies it (review b21 round 2): the
    fields are ':'-separated; the first (the failure's name) stays verbatim, a 'v<n>' field (the video frame) and a
    '+<n>_more' field (the count of further failing frames) stay verbatim, and every other number folds.
    'legs_count:126!=6' -> 'legs_count:#!=#'; 'fall_poly_missing:v10' stays; 'enc_dline_screen:v3:total12:comp4' ->
    'enc_dline_screen:v3:total#:comp#'."""
    name, *fields = str(s).split(':')
    keep = lambda f: re.fullmatch(r'v\d+|\+\d+_more', f)
    return ':'.join([name] + [f if keep(f) else re.sub(r'[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?', '#', f) for f in fields])


def red_set(kind, log, rc, json_path, since=None, run_id=None):
    text = open(log, encoding='utf-8', errors='replace').read() if log and os.path.exists(log) else None
    if kind not in KINDS:
        refuse(f'unknown kind {kind}')
    if text is None:
        refuse(f'no log {log}')
    if rc not in VERDICT_RC[kind]:
        refuse(f'{log}: exit {rc} is not a {kind} verdict code {VERDICT_RC[kind]} (a refusal or a crash)')
    if not re.search(VERDICT_LINE[kind], text, flags=re.M):
        refuse(f'{log} carries no {kind} verdict line (exit {rc}): the instrument refused or crashed before judging')
    if kind == 'pass2':
        reds = [fold(m) for m in re.findall(r'^\[pass2\] RED: (.+)$', text, flags=re.M)]
        if reds and rc == 0:
            refuse(f'{log} prints RED rows but the gate exited 0')
        return set(reds)
    if not json_path or not os.path.exists(json_path):
        refuse(f'no {kind} report {json_path} (exit {rc}): the instrument refused or crashed')
    if since is not None and os.path.getmtime(json_path) < since - 1:
        refuse(f'{json_path} is older than this run (written before {since}): a stale report is never this run\'s verdict')
    d = json.load(open(json_path, encoding='utf-8'))
    if run_id is not None and d.get('run_id') != run_id:
        refuse(f"{json_path} was written by run {d.get('run_id')!r}, not this invocation {run_id!r}: another run's report "
               'is never this run\'s verdict')
    if kind == 'letters':
        return ({r['letter'] for r in d['rows'] if not r.get('pass')}
                | {'leg:' + fold(f) for f in d.get('leg_fails') or []})
    if kind == 'fullview':
        return {r['id'] for r in d['rows'] if not r.get('pass')}
    out = set()
    for name, o in d['orbits'].items():
        failing = set(o.get('fail_frames', []))
        for fr in o.get('frames', []):
            if fr.get('i') not in failing:
                continue
            causes = fr.get('fail') or ['(no cause recorded)']
            out |= {f'{name}:{fr["i"]}:{c}' for c in causes}
        missing = failing - {fr.get('i') for fr in o.get('frames', [])}
        out |= {f'{name}:{i}:(frame missing)' for i in missing}
        out |= {f'{name}:aggregate:{fold_identity(a)}' for a in o.get('aggregate_fails') or []}
    st = d.get('structural')
    if isinstance(st, dict):
        out |= {f'structural:{fold_identity(s)}' for s in st.get('fails') or []}
    return out


def judge(step, pin, got):
    want = set(pin['red'])
    new, gone = sorted(got - want), sorted(want - got)
    if not new and not gone:
        print(f"[known-red] {step} HELD — {len(want)} red(s) pinned for {pin['issue']}")
        return 0
    print(f"[known-red] {step} MOVED — new: {json.dumps(new, ensure_ascii=False)}; "
          f"vanished: {json.dumps(gone, ensure_ascii=False)} (pinned for {pin['issue']}; "
          'a vanished red means the fix landed: re-pin the set in the fixture)')
    return 1


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--fixture')
    ap.add_argument('--step')
    ap.add_argument('--log')
    ap.add_argument('--rc', type=int, default=None)
    ap.add_argument('--json')
    ap.add_argument('--since', type=float, default=None)
    ap.add_argument('--run-id', default=None)
    ap.add_argument('--selftest', action='store_true')
    a = ap.parse_args(argv)
    if a.selftest:
        return selftest()
    if not (a.fixture and a.step and a.log):
        refuse('--fixture, --step and --log are required')
    fx = json.load(open(a.fixture, encoding='utf-8'))
    if fx.get('schema') != 'ob-battery-known-red/1':
        refuse(f"{a.fixture}: schema {fx.get('schema')!r}")
    pin = fx['steps'].get(a.step)
    if pin is None:
        refuse(f'{a.fixture} pins no step {a.step}')
    if pin.get('kind') not in KINDS or not pin.get('issue') or not isinstance(pin.get('red'), list) or not pin['red']:
        refuse(f'{a.step}: a pin needs a kind in {KINDS}, an issue and a non-empty red list')
    rc = a.rc if a.rc is not None else 1
    return judge(a.step, pin, red_set(pin['kind'], a.log, rc, a.json or pin.get('json'), a.since, a.run_id))


def selftest():
    """The three plants the pinned-red row must catch, the held and refused cases, and one failing control per review
    b21 finding: each of the last five reads HELD on the reader before the fix and must read MOVED or REFUSED here."""
    p2pin = {'kind': 'pass2', 'issue': '#0000',
             'red': [fold('rail-end-face: 1823 olive px > 100'), fold('netball-chroma: 14806 px > 60')]}
    base = '[pass2] RED: rail-end-face: 1790 olive px > 100\n[pass2] RED: netball-chroma: 14803 px > 60\n'
    letters_rows = [{'letter': 'P1a wall A', 'pass': True}, {'letter': 'P16a W_c back line A', 'pass': False},
                    {'letter': 'P16b W_c back line B (mirror)', 'pass': False}]
    lpin = {'kind': 'letters', 'issue': '#0000', 'red': ['P16a W_c back line A', 'P16b W_c back line B (mirror)']}
    lverdict = 'LETTERS-490 JUDGE: FAIL\n'

    def orbit_report(extra_cause=False, structural=(), aggregate=()):
        frames = [{'i': 10, 'fail': ['rail_white'] + (['voids'] if extra_cause else [])}, {'i': 11, 'fail': []},
                  {'i': 13, 'fail': ['rail_white', 'leg_hue']}]
        return {'orbits': {'corner': {'frames': frames, 'fail_frames': [10, 13], 'aggregate_fails': list(aggregate)}},
                'structural': {'fails': list(structural)}}
    opin = {'kind': 'orbitsweep', 'issue': '#0000',
            'red': ['corner:10:rail_white', 'corner:13:rail_white', 'corner:13:leg_hue', 'structural:legs_count:#!=#']}
    overdict = '[orbitsweep-490] RED -> /tmp/x/orbitsweep-490-report.json\n'
    apin = {'kind': 'orbitsweep', 'issue': '#0000',
            'red': opin['red'] + ['corner:aggregate:fall_poly_missing:v10', 'corner:aggregate:enc_dline_screen:v3:total#:comp#']}
    cases = [  # (name, pin, log text, rc, report or None, report age in s or None, want)
        ('pass2 held (values move, the set does not)', p2pin, base, 3, None, None, 0),
        ('pass2 new red', p2pin, base + '[pass2] RED: gate3-butt: leather ↔ rail-end butt off by 0.90 mm (x) > 0.5\n', 3, None, None, 1),
        ('pass2 vanished red', p2pin, '[pass2] RED: netball-chroma: 14803 px > 60\n', 3, None, None, 1),
        ('pass2 planted red (the --drop-measure arm)', p2pin,
         base + '[pass2] RED: schema — row gate3-butt has no finite measurement (gate3_butt_mm = undefined)\n', 3, None, None, 1),
        ('pass2 refused (no verdict)', p2pin, 'Error: app never ready\n', 1, None, None, 2),
        ('letters held', lpin, lverdict, 3, {'rows': letters_rows, 'leg_fails': []}, 0, 0),
        ('control P1-a: a new profile-leg failure beside the pinned P16 reds', lpin, lverdict, 3,
         {'rows': letters_rows, 'leg_fails': ['L3 crown: rms 0.91px > 0.6']}, 0, 1),
        ('orbitsweep held (structural value moves, the set does not)', opin, overdict, 3,
         orbit_report(structural=['legs_count:131!=6']), 0, 0),
        ('control P1-b: a new cause on an already failing frame', opin, overdict, 3,
         orbit_report(extra_cause=True, structural=['legs_count:126!=6']), 0, 1),
        ('control P1-b: a new structural failure', opin, overdict, 3,
         orbit_report(structural=['legs_count:126!=6', 'bed_probe_missing']), 0, 1),
        ('control P1-b: a per-orbit aggregate failure', opin, overdict, 3,
         orbit_report(structural=['legs_count:126!=6'], aggregate=['churn 0.41 > 0.25']), 0, 1),
        ('control P1-c: a crash (exit 1, no verdict) beside yesterday\'s report', lpin, 'SyntaxError: Unexpected token\n', 1,
         {'rows': letters_rows, 'leg_fails': []}, 0, 2),
        ('control P1-c: a verdict line but a report older than the run', lpin, lverdict, 3,
         {'rows': letters_rows, 'leg_fails': []}, 3600, 2),
        ('orbitsweep held (an aggregate failure keeps its frame; only its measurement moves)', apin, overdict, 3,
         orbit_report(structural=['legs_count:126!=6'], aggregate=['fall_poly_missing:v10', 'enc_dline_screen:v3:total15:comp4']), 0, 0),
        ('control r2-P2: a failing frame moves (fall_poly_missing v10 -> v11)', apin, overdict, 3,
         orbit_report(structural=['legs_count:126!=6'], aggregate=['fall_poly_missing:v11', 'enc_dline_screen:v3:total12:comp4']), 0, 1),
        ('control r2-P2: a failing frame moves (enc_dline_screen v3 -> v4)', apin, overdict, 3,
         orbit_report(structural=['legs_count:126!=6'], aggregate=['fall_poly_missing:v10', 'enc_dline_screen:v4:total12:comp4']), 0, 1),
        ('control r2-P1: a fresh report written by another invocation', lpin, lverdict, 3,
         {'rows': letters_rows, 'leg_fails': [], 'run_id': 'letters.other-run'}, 0, 2),
        ('control r2-P1: a fresh report that carries no run id', lpin, lverdict, 3,
         {'rows': letters_rows, 'leg_fails': [], 'run_id': None}, 0, 2),
    ]
    ok = 0
    with tempfile.TemporaryDirectory() as tmp:
        for name, pin, text, rc, report, age, want in cases:
            log = os.path.join(tmp, 'case.log')
            open(log, 'w', encoding='utf-8').write(text)
            jpath, since = None, None
            if report is not None:
                jpath = os.path.join(tmp, 'case.json')
                report = {'run_id': 'selftest-run', **report}
                json.dump(report, open(jpath, 'w', encoding='utf-8'))
                now = time.time()
                os.utime(jpath, (now - age, now - age))
                since = now
            try:
                got = judge('selftest', pin, red_set(pin['kind'], log, rc, jpath, since, 'selftest-run' if jpath else None))
            except SystemExit as e:
                got = e.code
            ok += got == want
            print(f"[known-red]   {'ok ' if got == want else 'BAD'} {name}: exit {got} (want {want})")
    print(f'[known-red] SELFTEST {ok}/{len(cases)}')
    return 0 if ok == len(cases) else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
