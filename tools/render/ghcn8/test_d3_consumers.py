# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Honor the measured fixture disposition without hiding an unintended regression."""
import copy
import json
import sys
import pytest
import audit_d2_consumers as audit
from audit_d2_consumers import with_delta, FIX1_DISPOSITION, FIX1_CORRECTION_CAUSE, consumer_ports, consumer_deltas


def test_consumer_ports_accept_original_and_exact_verifier_allocation():
    for http, cdp in [(9580, 9595), (9620, 9635)]:
        assert consumer_ports({'OB_E2E_PORT': str(http), 'OB_E2E_CDP_PORT': str(cdp)}) == (http, cdp)


def test_consumer_ports_refuse_mixed_swapped_neighboring_and_malformed_pins():
    for http, cdp in [('9580', '9635'), ('9620', '9595'), ('9635', '9620'),
                      ('9610', '9625'), ('9621', '9635'), ('9620', '9636'),
                      ('9620.0', '9635'), ('', '9635'), ('9620', '9620')]:
        with pytest.raises(ValueError):
            consumer_ports({'OB_E2E_PORT': http, 'OB_E2E_CDP_PORT': cdp})


def test_new_red_belongs_to_this_round_and_missing_cause_is_pending():
    row = with_delta({'id': 'coplanar', 'status': 'RED', 'owner': 'Craft'},
                     {'coplanar': 'GREEN'}, {'coplanar': 'GREEN'})
    assert row['delta_vs_d2'] == 'GREEN-to-RED'
    assert row['current_round_regression']
    assert row['delta_diagnosis_pending']
    assert row['owner'].startswith('Geometry round:')
    assert 'BLOCKS seal' in row['owner']


def test_legacy_red_and_a_cured_d3_regression_have_distinct_owners():
    old = with_delta({'id': 'letters', 'status': 'RED', 'owner': 'Craft'},
                     {'letters': 'RED'}, {'letters': 'RED'})
    assert not old['current_round_regression'] and old['owner'] == 'Craft'
    detail = correction()
    detail['disposition'] = {'consumer': 'fullview', 'kind': 'verified-green',
                             'authority': 'Synthetic successful measured correction'}
    fixed = with_delta({'id': 'fullview', 'status': 'GREEN', 'owner': 'Craft'}, {'fullview': 'RED'},
                       {'fullview': 'RED'}, {'fullview': detail})
    assert fixed['delta_vs_d2'] == 'RED-to-GREEN'
    assert fixed['delta_vs_previous_d3'] == 'RED-to-GREEN'
    assert not fixed['delta_diagnosis_pending']
    assert fixed['owner'].startswith('Geometry round:')


def correction():
    # Synthetic diagnosis; these test numbers are not measured source values.
    return {'cause': FIX1_CORRECTION_CAUSE,
            'disposition': {'consumer': 'coplanar', 'kind': 'measured-correction', 'authority': FIX1_DISPOSITION},
            'unintended_geometry_changes': [],
            'evidence': [{'path': 'synthetic-pair-delta.json', 'sha256': '0' * 64}],
            'measurements': [{'subject': 'cn8-plank-0 / cn8r82-ring-0',
                'metric': 'overlapping area', 'unit': 'mm2', 'tag': 'DERIVED',
                'before': 60, 'after': 0}]}


def classify(detail):
    return with_delta({'id': 'coplanar', 'status': 'RED', 'owner': 'Craft'},
                      {'coplanar': 'GREEN'}, {'coplanar': 'GREEN'}, {'coplanar': detail})


def test_measured_correction_keeps_red_and_assigns_only_the_ruled_fixture_repin():
    row = classify(correction())
    assert row['status'] == 'RED' and row['delta_vs_d2'] == 'GREEN-to-RED'
    assert row['delta_cause'] == FIX1_CORRECTION_CAUSE
    assert row['corrected_geometry_fixture_delta']
    assert not row['current_round_regression'] and not row['delta_diagnosis_pending']
    assert '#731' in row['owner'] and row['owner'].startswith('Craft lane:')
    assert row['delta_measurements'][0]['before'] == 60


def test_unintended_motion_is_ours_even_when_the_fixture_disposition_is_requested():
    detail = correction()
    detail['unintended_geometry_changes'] = ['middle net moved']
    row = classify(detail)
    assert row['current_round_regression'] and row['delta_diagnosis_pending']
    assert not row['corrected_geometry_fixture_delta']
    assert row['owner'].startswith('Geometry round:') and 'BLOCKS seal' in row['owner']


def test_cause_text_or_missing_numeric_evidence_cannot_waive_a_red():
    details = [FIX1_CORRECTION_CAUSE]
    for field in ['measurements', 'evidence', 'unintended_geometry_changes']:
        item = correction(); del item[field]; details.append(item)
    item = correction(); item['measurements'][0]['after'] = float('nan'); details.append(item)
    item = correction(); item['measurements'][0]['after'] = True; details.append(item)
    item = correction(); item['disposition'] = 'unissued disposition'; details.append(item)
    for detail in details:
        row = classify(copy.deepcopy(detail))
        assert row['current_round_regression'] and not row['corrected_geometry_fixture_delta']
        assert row['delta_diagnosis_pending']


@pytest.mark.parametrize('d2,previous,current,regression,pending', [
    ('RED', 'GREEN', 'RED', True, True),
    ('GREEN', 'GREEN', 'RED', True, True),
    ('RED', 'RED', 'RED', False, False),
    ('GREEN', 'RED', 'RED', False, True),
])
def test_immediately_previous_verdict_controls_regression(d2, previous, current, regression, pending):
    row = with_delta({'id': 'fullview', 'status': current, 'owner': 'Craft'},
                     {'fullview': d2}, {'fullview': previous})
    assert row['current_round_regression'] is regression
    assert row['delta_diagnosis_pending'] is pending


@pytest.mark.parametrize('detail', [
    'An explanation is not a disposition',
    {'cause': 'An explanation is still not a disposition'},
    {'cause': 'Measured-looking explanation', 'disposition': 'unnamed prose only'},
])
def test_red_green_red_history_stays_pending_with_only_a_cause(detail):
    row = with_delta({'id': 'fullview', 'status': 'RED', 'owner': 'Craft'},
                     {'fullview': 'RED'}, {'fullview': 'GREEN'}, {'fullview': detail})
    assert row['delta_vs_d2'] == 'unchanged'
    assert row['delta_vs_previous_d3'] == 'GREEN-to-RED'
    assert row['current_round_regression'] and row['delta_diagnosis_pending']


def test_explicit_diagnosis_does_not_clear_an_unresolved_red():
    detail = correction()
    detail['disposition'] = {'consumer': 'fullview', 'kind': 'diagnosed-regression',
                             'authority': 'Synthetic measured regression diagnosis; repair still required'}
    row = with_delta({'id': 'fullview', 'status': 'RED', 'owner': 'Craft'},
                     {'fullview': 'RED'}, {'fullview': 'GREEN'}, {'fullview': detail})
    assert row['current_round_regression'] and row['delta_diagnosis_pending']
    assert not row['corrected_geometry_fixture_delta'] and 'BLOCKS seal' in row['owner']


def test_named_coplanar_exception_cannot_be_reused_for_another_consumer():
    for assigned_name in ['coplanar', 'fullview']:
        detail = correction()
        detail['disposition']['consumer'] = assigned_name
        row = with_delta({'id': 'fullview', 'status': 'RED', 'owner': 'Craft'},
                         {'fullview': 'RED'}, {'fullview': 'GREEN'}, {'fullview': detail})
        assert row['current_round_regression'] and row['delta_diagnosis_pending']
        assert not row['corrected_geometry_fixture_delta']


def test_previous_round_cannot_silently_fall_back_to_d2():
    for previous in [None, {}, {'fullview': 'UNKNOWN'}]:
        with pytest.raises(ValueError, match='previous-round'):
            with_delta({'id': 'fullview', 'status': 'RED', 'owner': 'Craft'},
                       {'fullview': 'RED'}, previous)


def regression_history(consumer='fullview'):
    baseline = {consumer: 'RED'}
    row = {'id': consumer, 'status': 'RED', 'owner': 'Craft',
           'log': 'synthetic.log', 'log_sha256': '1' * 64}
    green = with_delta({**row, 'status': 'GREEN'}, baseline, {consumer: row})
    red = with_delta(row, baseline, {consumer: green})
    return baseline, row, red


def test_red_green_red_red_retains_both_flags_and_the_original_blocker_verbatim():
    baseline, row, first_red = regression_history()
    snapshot = copy.deepcopy(first_red)
    prior = first_red
    for _ in range(3):
        current = with_delta(row, baseline, {'fullview': prior})
        assert current['delta_vs_previous_d3'] == 'unchanged'
        assert current['current_round_regression'] and current['delta_diagnosis_pending']
        assert current['carried_blockers'] == [snapshot]
        assert current['owner'].startswith('Geometry round:') and 'BLOCKS seal' in current['owner']
        prior = current
    assert first_red == snapshot


@pytest.mark.parametrize('detail', [None, 'A repeated cause is not a closure',
                                  {'cause': 'Still investigating'}])
def test_a_carried_pending_red_cannot_be_cleared_by_prose(detail):
    baseline, row, prior = regression_history()
    current = with_delta(row, baseline, {'fullview': prior}, {'fullview': detail})
    assert current['current_round_regression'] and current['delta_diagnosis_pending']
    assert current['carried_blockers'] == [prior]


def test_green_closes_carried_regression_and_pending_without_a_waiver():
    baseline, row, prior = regression_history()
    current = with_delta({**prior, 'status': 'GREEN'}, baseline, {'fullview': prior})
    assert not current['current_round_regression'] and not current['delta_diagnosis_pending']
    assert current['carried_blockers'] == []
    assert 'BLOCKS seal' not in current['owner'] and not current['delta_cause'].startswith('PENDING')


def test_only_the_named_measured_correction_closes_both_carried_flags():
    baseline, row, prior = regression_history('coplanar')
    current = with_delta(row, baseline, {'coplanar': prior}, {'coplanar': correction()})
    assert current['corrected_geometry_fixture_delta']
    assert not current['current_round_regression'] and not current['delta_diagnosis_pending']
    assert current['carried_blockers'] == [] and current['owner'].startswith('Craft lane:')
    detail = correction()
    detail['unintended_geometry_changes'] = ['An unrelated consumer input moved']
    refused = with_delta(row, baseline, {'coplanar': prior}, {'coplanar': detail})
    assert refused['current_round_regression'] and refused['delta_diagnosis_pending']
    assert refused['carried_blockers'] == [prior]


def test_ledger_summary_blockers_survive_a_stale_row_schema():
    baseline, row, prior = regression_history()
    prior['current_round_regression'] = False
    prior['delta_diagnosis_pending'] = False
    previous = {'complete': True, 'rows': [prior],
                'current_round_regressions': ['fullview'], 'pending_delta_diagnoses': ['fullview']}
    snapshot = copy.deepcopy(previous)
    classify = consumer_deltas({'complete': True, 'rows': [row]}, previous, {})
    current = classify(row)
    assert current['current_round_regression'] and current['delta_diagnosis_pending']
    assert current['carried_blockers'] == [prior]
    assert previous == snapshot
    previous['current_round_regressions'].append('missing-receipt')
    with pytest.raises(ValueError, match='blocker has no consumer receipt'):
        consumer_deltas({'complete': True, 'rows': [row]}, previous, {})


def test_main_supplies_the_complete_previous_ledger_to_the_classifier(tmp_path, monkeypatch):
    _, row, prior = regression_history()
    baseline = {'complete': True, 'rows': [row]}
    previous = {'complete': True, 'rows': [prior],
                'current_round_regressions': ['fullview'], 'pending_delta_diagnoses': ['fullview']}
    for name, value in [('baseline', baseline), ('previous', previous)]:
        (tmp_path / (name + '.json')).write_text(json.dumps(value))
    called = []
    def inspect_complete_ledger(old, before, causes):
        assert before == previous and before['rows'][0] == prior
        current = consumer_deltas(old, before, causes)(row)
        assert current['current_round_regression'] and current['delta_diagnosis_pending']
        assert current['carried_blockers'] == [prior]
        called.append(True)
        raise RuntimeError('main full-ledger carry checked; no consumer execution')
    monkeypatch.setattr(audit, 'consumer_deltas', inspect_complete_ledger)
    monkeypatch.setattr(sys, 'argv', ['audit_d2_consumers.py', '--tree', str(tmp_path),
        '--out', str(tmp_path / 'out'), '--refs', str(tmp_path),
        '--baseline-d2', str(tmp_path / 'baseline.json'),
        '--previous-d3', str(tmp_path / 'previous.json'), '--render-only'])
    with pytest.raises(RuntimeError, match='main full-ledger carry checked'):
        audit.main()
    assert called == [True] and not (tmp_path / 'out').exists()
