#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-ballknee-pin.py — GH-996 (card 45 C2 (b)): assemble tools/render/fixtures/lighting-ballknee-pin.json, the ratchet
the KNEE-pre rows of tools/render/lighting-gate-spec.py judge against.

Each --run is one fresh capture of the seal's knee sets (lighting-seal.sh capture-knee*: ?ballKneeDebug=diffuse at b = 1, the
cue ball at cueball_level) read by lighting-render-reads.py: RUN is a reads prefix, so set S's reads live at RUN + S
(e.g. output/lighting/reads-render/after-k1- holds after-k1-kneering/<look>/<table>/reads.json). For every pinned
(table, fixture, look) cell the pin records each run's ball:0:crown_maxch (the PRE-knee crown: max over the crown band of the
per-pixel max channel, scene-linear HDR), value = their max, spread = max - min and pm = max(3 x spread, 1 % of the value),
rounded up to 1e-4. The four canopy cells of the card (WPA-spec, metal-rim, chinese8, carom) are not pinned: their rule is
the absolute knee threshold (KNEE-canopy rows). A run whose knee set did not compile the debug read on every lit ball program
(programs:ball:ballKneeDebugMissing != 0, or no debug program at all), or that lacks a read, is REFUSED by name (exit 3): a
silently ignored debug flag would pin after-knee pixels. So are repeated run prefixes and a cell whose pm would leave the gain11
arm (every lamp x1.1) unable to fire (pm >= 9 % of the value).

usage: lighting-ballknee-pin.py --run PREFIX [--run PREFIX ...] --sha <tree sha> [--out tools/render/fixtures/lighting-ballknee-pin.json]
"""
import argparse, datetime, json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
# set -> (fixture, pinned tables); mirrors the capture-knee* steps of lighting-seal.sh (the spec's plan-key check binds the set names)
SETS = {
    'kneecanopy': ('canopy_panel', ['wpbsa_snooker_12ft']),
    'kneering': ('perimeter_ring', ['wpa_spec_9ft', 'umb_carom_284', 'wpbsa_snooker_12ft']),
    'kneependant': ('pendant_bar', ['wpa_spec_9ft', 'umb_carom_284', 'wpbsa_snooker_12ft']),
    'kneesnookerlum': ('snooker_luminaire', ['wpbsa_snooker_12ft']),
    'kneecaromlum': ('carom_luminaire', ['umb_carom_284']),
    'kneeauto': ('auto', ['predator_apex_9ft', 'chinese8_pro_9ft']),
}
LOOKS = ('default', 'sp')
FLOOR_REL = 0.01
ARM_GAIN_REL = 0.09  # the gain11 arm moves the crown by ~10 %: a pm at or above 9 % of the value would leave it unable to fire


def up4(v):
    return math.ceil(v * 1e4 - 1e-9) / 1e4


def read_cell(prefix, setn, look, table):
    p = f'{prefix}{setn}/{look}/{table}/reads.json'
    if not os.path.exists(p):
        return None, f'{p}: no reads'
    d = json.load(open(p))
    ball = ((d.get('programs') or {}).get('classes') or {}).get('ball') or {}
    if ball.get('ballKneeDebugMissing') != 0 or not (ball.get('ballKneeDebug') or 0) >= 1:
        return None, (f"{p}: the debug read is not compiled on every lit ball program (ballKneeDebug={ball.get('ballKneeDebug')}, "
                      f"missing={ball.get('ballKneeDebugMissing')})")
    v = ((((d.get('poses') or {}).get('cueball_level') or {}).get('balls') or {}).get('0') or {}).get('crown_maxch')
    if not isinstance(v, (int, float)) or not math.isfinite(v) or v <= 0:
        return None, f'{p}: crown_maxch={v!r}'
    return float(v), None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', action='append', required=True)
    ap.add_argument('--sha', required=True)
    ap.add_argument('--out', default=os.path.join(HERE, 'fixtures', 'lighting-ballknee-pin.json'))
    a = ap.parse_args()
    if len(set(a.run)) < 3 or len(set(a.run)) != len(a.run):
        print(f'[ballknee-pin] REFUSED: {len(a.run)} run(s), {len(set(a.run))} distinct; the pin procedure is three distinct fresh boots'); sys.exit(3)
    cells, bad = {}, []
    for setn, (fx, tables) in SETS.items():
        for tb in tables:
            cell = {'set': setn}
            for lk in LOOKS:
                reads = []
                for prefix in a.run:
                    v, why = read_cell(prefix, setn, lk, tb)
                    if why: bad.append(why)
                    else: reads.append(round(v, 6))
                if len(reads) != len(a.run): continue
                value, spread = max(reads), max(reads) - min(reads)
                cell[lk] = {'value': up4(value), 'spread': round(spread, 6), 'pm': up4(max(3 * spread, FLOOR_REL * value)), 'reads': reads}
                if cell[lk]['pm'] >= ARM_GAIN_REL * value:
                    bad.append(f'{tb}@{fx} {lk}: pm {cell[lk]["pm"]} >= {ARM_GAIN_REL:g} x value {value}: the gain11 arm (every lamp x1.1) could not fire')
            cells[f'{tb}@{fx}'] = cell
    if bad:
        print(f'[ballknee-pin] REFUSED ({len(bad)}):'); [print('  ' + b) for b in bad]; sys.exit(3)
    pin = {
        'schema': 'lighting-ballknee-pin/1',
        'sha': a.sha,
        'pinned_at': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'boots': len(a.run),
        'rule': ('GH-996 card 45 C2 (b): the cue ball\'s PRE-knee crown (?ballKneeDebug=diffuse, b = 1, cueball_level; max over the '
                 'crown band of the per-pixel max channel on the scene-linear HDR) per (table, fixture, look); value = the max of the '
                 f'boots, pm = max(3 x spread, {FLOOR_REL:g} x value), both rounded up to 1e-4. Written by tools/render/lighting-ballknee-pin.py.'),
        'runs': [os.path.basename(r) for r in a.run],  # run labels only: a committed fixture never carries a machine path
        'cells': cells,
    }
    json.dump(pin, open(a.out, 'w'), indent=1)
    print(f'[ballknee-pin] {len(cells)} cells x {len(LOOKS)} looks from {len(a.run)} runs -> {a.out}')
    for k, c in cells.items():
        print(f"  {k:42s} " + '  '.join(f"{lk} {c[lk]['value']} ± {c[lk]['pm']} (spread {c[lk]['spread']})" for lk in LOOKS if lk in c))


if __name__ == '__main__':
    main()
