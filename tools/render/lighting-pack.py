#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""lighting-pack.py — assemble the venue-lighting sign-off pack for one seal tag.

  lighting-pack.py --tag s1 [--out output/lighting/pack/<tag>] [--drive "<Drive>/openbilliards/lighting-pack/<tag>"]

Contents (the brief's deliverable per seal):
  INDEX.md                      what changed, per-venue verdicts, the ratio table, how to read the sheets
  gate.md / fence.md            the photometric gate (targets ± read uncertainty, red arm) and the identity fence
  ratios/                       reads-render ratios (before / after) + the photo-read READMEs and reads.json per venue
  sheets/<look>/<table>/        per register pose: BEFORE | AFTER | PHOTO (where a counterpart exists) | |Δ| heat (from lighting-delta.py)
  reads/<venue>/                the photo-read evidence PNGs (annotated ROI crops) incl. verify/
  census/                       light census before/after per table (JSON) + a one-line diff table
  SHA256SUMS
Reference photos are never copied whole: only the annotated ROI evidence the readers produced and the photo TILE inside a sheet.

The census diff, the census copies and the movers table join BEFORE with AFTER by canonical table id (lighting_ids.py,
shared with lighting-delta.py: the app's table aliases), so a table renamed between the two captures still pairs; the
movers table maps the BALL-<table>-* row ids of the previous gate the same way. A table present on one side only is
listed (UNMATCHED ..., in census/census-diff.md, INDEX.md and stdout) and the run exits 3 after writing the local pack,
without the --drive copy.
  lighting-pack.py --selftest     the pairing plants, run through this script by subprocess; exit 0 iff all hold, 3 otherwise
"""
import argparse, hashlib, json, os, shutil, subprocess, sys, tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lighting_ids import ALIAS_JS, canonical_table, fnv1a64_hex, load_table_aliases, side_tables  # noqa: E402

ROOT = 'output/lighting'


def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def copytree(src, dst, exts=None):
    n = 0
    for dp, _, fs in os.walk(src):
        for f in fs:
            if exts and not f.lower().endswith(exts):
                continue
            s = os.path.join(dp, f); rel = os.path.relpath(s, src); d = os.path.join(dst, rel)
            os.makedirs(os.path.dirname(d), exist_ok=True); shutil.copy2(s, d); n += 1
    return n


def pair_tables(before, after, look, aliases, order=()):
    # ([(canonical, before dir, after dir)], [UNMATCHED text]) over the census-bearing table directories of one look,
    # in `order` (by canonical id) first, then the rest by id
    bt, at = side_tables(before, look, aliases, 'census.json'), side_tables(after, look, aliases, 'census.json')
    rank = {canonical_table(t, aliases): i for i, t in enumerate(order)}
    cs = sorted(set(bt) | set(at), key=lambda c: (rank.get(c, len(rank)), c))
    pairs = [(c, bt[c], at[c]) for c in cs if c in bt and c in at]
    unmatched = [f'census {look}/{bt.get(c) or at.get(c)}: no {"before" if c not in bt else "after"} census' for c in cs if not (c in bt and c in at)]
    return pairs, unmatched


def ball_key(rid, aliases):
    # BALL-<table>-<look>-<suffix> with the table part canonical; any other row id unchanged
    parts = rid[5:].rsplit('-', 2) if rid.startswith('BALL-') else []
    return f'BALL-{canonical_table(parts[0], aliases)}-{parts[1]}-{parts[2]}' if len(parts) == 3 else rid


def census_diff(before, after, tables, looks, aliases=None, order=()):
    # tables: ids to report (any side's name; None = every paired table, in `order`); a table on one side only is pair_tables'
    aliases = aliases or load_table_aliases()
    rows = ['| look | table | lights before → after (type:name:intensity) | venue term |', '|---|---|---|---|']
    want = None if tables is None else [canonical_table(t, aliases) for t in tables]
    for look in looks:
        pairs, _ = pair_tables(before, after, look, aliases, want or order)
        for c, bn, t in pairs:
            if want is not None and c not in want:
                continue
            pb, pa = os.path.join(before, look, bn, 'census.json'), os.path.join(after, look, t, 'census.json')
            cb, ca = json.load(open(pb)), json.load(open(pa))
            def sig(c):
                return sorted(f"{l['type'][:4]}:{l['name'] or '-'}:{l['intensity']:.4g}" for l in c['lights'])
            sb, sa = sig(cb), sig(ca)
            diff = [x for x in sa if x not in sb] + [f'−{x}' for x in sb if x not in sa]
            v = ((ca.get('lighting') or {}).get('venue')) or {}  # refuter round: `lighting` is present-but-null when the rig leaf never landed (leafstall2)
            # ORDER-LIGHT-COMPANION (review r12 P3, lighting-pack.py:52-53): the venue state exposes `sh` (27 coefficients) and `E` (per-axis
            # irradiance px/nx/py/ny/pz/nz), not the retired up/down fields — every derived term read 'none' here
            E = v.get('E') if isinstance(v.get('E'), dict) and all(isinstance(v['E'].get(k), (int, float)) for k in ('py', 'ny')) else None
            term = (f"derived: E(+y) {E['py']:.4g} E(-y) {E['ny']:.4g} (sh[0] {v['sh'][0]:.4g}, {len(v['sh'])} coeffs)" if (v.get('derived') and E and isinstance(v.get('sh'), list) and v['sh'])
                    else ('not derived: ' + str(v.get('error') or v.get('derivableReason') or 'no term')[:60] if v else 'none'))
            rows.append(f"| {look} | {t} | {'identical' if not diff else ', '.join(diff)} | {term} |")
    return '\n'.join(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tag', required=True); ap.add_argument('--out'); ap.add_argument('--drive')
    ap.add_argument('--held-after', help='extra AFTER tree captured with ?venue=all (held Diamond term)')
    ap.add_argument('--prev-gate', help='previous seal gate JSON for the record-row movers table')
    ap.add_argument('--section', default='§L12', help='the report section this seal writes (INDEX line 3)')
    ap.add_argument('--scope', help='lighting-probe-scope.py output dir (on/off room-mask strips; copied FIRST into 00-room-first/)')
    ap.add_argument('--alias-js', default=ALIAS_JS, help=argparse.SUPPRESS)
    ap.add_argument('--selftest', action='store_true', help='run the pairing plants through this script by subprocess; exit 0 iff all hold, 3 otherwise')
    if '--selftest' in sys.argv[1:]:
        sys.exit(selftest())
    a = ap.parse_args()
    aliases = load_table_aliases(a.alias_js)
    unmatched = []
    out = a.out or os.path.join(ROOT, 'pack', a.tag)
    os.makedirs(out, exist_ok=True)
    after = os.path.join(ROOT, f'after-{a.tag}'); before = os.path.join(ROOT, 'before'); delta = os.path.join(ROOT, f'delta-{a.tag}')
    tables = ['wpa_generic_9ft', 'wpa_spec_9ft', 'diamond_redlabel_9ft', 'diamond_proam_9ft', 'predator_apex_9ft', 'wpbsa_snooker_12ft', 'umb_carom_284', 'chinese8_pro_9ft', 'joy_q8_9ft', 'pool_pro_9ft_measured']
    looks = ['default', 'sp']
    # gate / fence / ratios
    for name, src in [('gate.md', os.path.join(ROOT, f'gate-{a.tag}.md')), ('fence.md', os.path.join(ROOT, f'fence-{a.tag}.md')),
                      ('delta-stats.md', os.path.join(delta, 'delta-stats.md'))]:
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(out, name))
    os.makedirs(os.path.join(out, 'ratios'), exist_ok=True)
    for lbl, d in [('before', os.path.join(ROOT, 'reads-render', 'before')), ('after', os.path.join(ROOT, 'reads-render', f'after-{a.tag}'))]:
        for f in ('ratios.md', 'ratios.json'):
            p = os.path.join(d, f)
            if os.path.exists(p):
                shutil.copy2(p, os.path.join(out, 'ratios', f'{lbl}-{f}'))
    # photo reads (evidence PNG/JSON/README + verify)
    n_reads = copytree(os.path.join(ROOT, 'reads'), os.path.join(out, 'reads'))
    # ROOM FIRST (ORDER-LIGHT-5 R1c): every table's ROOM strip BEFORE | AFTER (| PHOTO) | Δ at full34, both looks,
    # plus the Predator overview — the class dressing is global, so the owner sees all ten rooms first
    n_sheets = 0
    os.makedirs(os.path.join(out, '00-room-first'), exist_ok=True)
    if a.scope and os.path.isdir(a.scope):
        for f in sorted(os.listdir(a.scope)):
            if f.endswith('.png'):
                shutil.copy2(os.path.join(a.scope, f), os.path.join(out, '00-room-first', '00-probe-onoff-' + f)); n_sheets += 1
    for look in looks:
        for i, t in enumerate(tables):
            src = os.path.join(delta, look, t, 'full34-delta.png')
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(out, '00-room-first', f'{look}-{i:02d}-{t}-full34.png')); n_sheets += 1
        src = os.path.join(delta, look, 'predator_apex_9ft', 'overview-delta.png')
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(out, '00-room-first', f'{look}-predator-overview.png')); n_sheets += 1
        # ORDER-LIGHT-11 R-A: the energy ledger figure (once)
        lp = os.path.join(ROOT, f'ledger-{a.tag}.png')
        if look == looks[0] and os.path.exists(lp):
            shutil.copy2(lp, os.path.join(out, '00-room-first', 'zz-16.1-energy-ledger.png')); n_sheets += 1
            if os.path.exists(os.path.join(ROOT, f'ledger-{a.tag}.md')): shutil.copy2(os.path.join(ROOT, f'ledger-{a.tag}.md'), os.path.join(out, 'ledger.md'))
        # ORDER-LIGHT-9 Q4: one cue-ball strip per table (BEFORE | AFTER | PHOTO where one exists | Δ) at the register pose
        for i, t in enumerate(tables):
            src = os.path.join(delta, look, t, 'cueball_level-delta.png')  # the delta dir (the pack's sheets/ is copied later)
            if os.path.exists(src):
                shutil.copy2(src, os.path.join(out, '00-room-first', f'{look}-{20 + i:02d}-{t}-cueball_level.png')); n_sheets += 1
    # ORDER-LIGHT-10 item 2: the comparison strips are generated HERE from this seal's captures (they used to live in a
    # /tmp pack script and shipped a stale seal-8 byte set once): switch-control at both poses, off-vs-main.
    try:
        import numpy as np
        from PIL import Image, ImageDraw
        def rd(pth): return np.asarray(Image.open(pth).convert('RGB')).astype(int)
        def strip(rows_spec, dest):
            rows_ = []
            for label, a_, b_, gain in rows_spec:
                if not (os.path.exists(a_) and os.path.exists(b_)): continue
                A, B = rd(a_), rd(b_); d = np.abs(A - B).max(axis=2)
                heat = np.stack([np.clip(d * gain, 0, 255).astype(np.uint8)] * 3, axis=2)
                im = Image.fromarray(np.concatenate([A.astype(np.uint8), B.astype(np.uint8), heat], axis=1)); dr = ImageDraw.Draw(im)
                dr.rectangle([0, 0, im.width, 18], fill=(0, 0, 0)); dr.text((6, 3), f"{label}   max|Δ| {int(d.max())}/255  mean {d.mean():.2f}  p99 {np.percentile(d, 99):.0f}  px>0 {int((d > 0).sum())}", fill=(255, 255, 255))
                rows_.append(np.asarray(im))
            if rows_: Image.fromarray(np.concatenate(rows_, axis=0)).save(dest); return 1
            return 0
        for look in looks:
            for pose in ('full34', 'cueball_level'):
                n_sheets += strip([(f'seal {a.tag} venue ON: live Predator→JOY switch | fresh JOY boot (same seal) | |Δ|×4', os.path.join(ROOT, f'after-{a.tag}-switch', look, 'predator_apex_9ft', 'switchjoy', pose + '.png'), os.path.join(after, look, 'joy_q8_9ft', pose + '.png'), 4),
                                  (f'seal {a.tag} ?venue=off CONTROL: the same switch | fresh ?venue=off JOY boot | |Δ|×4', os.path.join(ROOT, f'after-{a.tag}-offswitch', look, 'predator_apex_9ft', 'switchjoy', pose + '.png'), os.path.join(ROOT, f'after-{a.tag}-offjoy', look, 'joy_q8_9ft', pose + '.png'), 4)],
                                 os.path.join(out, '00-room-first', f'{look}-99-switch-control-{pose}.png'))
            n_sheets += strip([(f'{t} ?venue=off (seal {a.tag}, after-{a.tag}-off) | main c01bb535 baseline CAPTURE (before/, the lane\'s first boot of main) | |Δ|×32', os.path.join(ROOT, f'after-{a.tag}-off', look, t, 'full34.png'), os.path.join(ROOT, 'before', look, t, 'full34.png'), 32) for t in ('predator_apex_9ft', 'wpa_spec_9ft')],
                             os.path.join(out, '00-room-first', f'{look}-01-off-vs-main-full34.png'))
    except Exception as e:
        print('[pack] strips skipped:', e)
    # sheets
    n_sheets += copytree(delta, os.path.join(out, 'sheets'), exts=('.png',))
    if a.held_after and os.path.isdir(a.held_after):
        n_sheets += copytree(a.held_after, os.path.join(out, 'sheets-held-diamond'), exts=('.png',))
    # census
    os.makedirs(os.path.join(out, 'census'), exist_ok=True)
    for look in looks:
        pairs, um = pair_tables(before, after, look, aliases, tables)
        unmatched += um
        for _, bn, t in pairs:
            for lbl, d, n in [('before', before, bn), ('after', after, t)]:
                shutil.copy2(os.path.join(d, look, n, 'census.json'), os.path.join(out, 'census', f'{lbl}-{look}-{t}.json'))
    cd = census_diff(before, after, None, looks, aliases, tables)
    um_md = '\n'.join(['UNMATCHED ' + u for u in unmatched])
    open(os.path.join(out, 'census', 'census-diff.md'), 'w').write(cd + '\n' + (um_md + '\n' if um_md else ''))
    # report copy
    if os.path.exists('SPIKE-REPORT-LIGHTING.md'):
        shutil.copy2('SPIKE-REPORT-LIGHTING.md', os.path.join(out, 'SPIKE-REPORT-LIGHTING.md'))
    # INDEX — generated from the CURRENT seal's files (ORDER-LIGHT-5 R5: no stale text)
    gate_md = open(os.path.join(out, 'gate.md')).read() if os.path.exists(os.path.join(out, 'gate.md')) else '(no gate)'
    verdict = [l for l in gate_md.splitlines() if l.startswith('**GATE')]
    verdict = verdict[0] if verdict else '(no verdict line)'
    ledger_md = ''
    try:
        cen = json.load(open(os.path.join(after, 'default', 'predator_apex_9ft', 'census.json')))
        ledger = (cen.get('dressing') or {}).get('ledger') or []
        ledger_md = '\n'.join(['| room material | class | before | after | target | method |', '|---|---|---|---|---|---|'] +
                              [f"| {r['material']} | {r['cls']} | {r['before']:.4f} | {r['after']:.4f} | {r['target']:.3f} | {r.get('method', r.get('tag', ''))} |" for r in ledger])
        venue = (cen.get('lighting') or {}).get('venue') or {}
        probe_md = (f"derived probe: sh present = {bool(venue.get('sh'))}; E(+y) {venue.get('E', {}).get('py')} / E(−y) {venue.get('E', {}).get('ny')} / E(±x) {venue.get('E', {}).get('px')}, {venue.get('E', {}).get('nx')} / E(±z) {venue.get('E', {}).get('pz')}, {venue.get('E', {}).get('nz')}; capture (0, {venue.get('pos', ['?', '?'])[1]}, 0), {venue.get('res')}² faces, giSettled {venue.get('giSettled')}"
                    if venue else 'no venue block in the census')
    except Exception as e:
        probe_md = f'(census unreadable: {e})'
    # open rows: RECORD rows whose measured value sits outside their target (ORDER-LIGHT-5 R5: a demoted row is named
    # in the seal, never hidden) — generated from this seal's gate JSON
    open_md = '(no gate JSON)'; open_def_md = '(no gate JSON)'
    gj = os.path.join(ROOT, f'gate-{a.tag}.json')
    if os.path.exists(gj):
        # ORDER-LIGHT-10 item 3: "open rows" has ONE definition — JUDGED targets this lane demoted to RECORD under
        # ORDER-LIGHT-5 R5 (a red judged row is cured or demoted with the finding stated); everything else outside a
        # reference is a RECORD row by design (outputs, diagnostics, controls). Counted from the gate JSON.
        G = json.load(open(gj)); jf = [r['id'] for r in G if not r.get('record') and not r.get('pass')]
        ro = [r for r in G if r.get('record') and not r.get('pass') and r.get('measured') is not None]
        demoted = [r['id'] for r in ro if r['id'] in ('HOOK-default-pixels', 'HOOK-sp-pixels')]
        hook_ctrl = [r['id'] for r in ro if r['id'].startswith('HOOK-') and r['id'] not in demoted]
        ball_under = [r['id'] for r in ro if r['id'].startswith('BALL-') and r['id'].endswith('-under')]
        ball_clip = [r['id'] for r in ro if r['id'].startswith('BALL-') and r['id'].endswith('-crownsat')]
        others = [r['id'] for r in ro if not r['id'].startswith(('HOOK-', 'BALL-'))]
        fam = {}
        for i in others: fam[i.split('-')[0]] = fam.get(i.split('-')[0], 0) + 1
        open_def_md = '\n'.join([
            f"- **JUDGED rows failing: {len(jf)}**" + (f" ({', '.join(jf)})" if jf else " — the gate is green."),
            f"- **OPEN rows (ORDER-LIGHT-5 R5 demotions — judged targets this lane could not close and demoted to RECORD with the finding stated): {len(demoted)}** — {', '.join(demoted)}: main's live-switch env residue (`table.js` keeps the boot env cube map across a table switch), controlled at both poses; their {len(hook_ctrl)} sibling HOOK rows are the controls and the recorded cure attempt, not further open rows.",
            f"- **RECORD rows outside their reference by design: {len(others)}** — outputs and diagnostics ({', '.join(f'{k} {v}' for k, v in sorted(fam.items()))}): the Predator terminator / equator outputs against the arena bands, the room rows against club-class envelopes, the Star strip / nose rows, the stand-in and bake-off ablations.",
            f"- **BALL output rows (ORDER-LIGHT-9 Q3, all ten tables, physical gain) outside the arena under/crown band: {len(ball_under)}; crown clipping (> 0.15): {len(ball_clip)}** ({', '.join(i.replace('BALL-', '').replace('-crownsat', '') for i in ball_clip) or 'none'}) — reported, no multiplier re-introduced.",
            f"- Total record rows outside a reference: {len(ro)}. The three gap owners for the underside / equator / crown: the cloth reflectance provenance (the bake's cloth is the stale eyeballed classic green, the Predator preset a MODEL luminance), the renderer's LTC diffuse leg (the equator's direct light), and the emitter double count in the ball probe grid (the crown ×1.8 at physical scale, the clipping tables).",
        ])
        rows_o = []
        for r in json.load(open(gj)):
            if r.get('record') and not r.get('pass') and r.get('measured') is not None:
                m = r['measured']; ms = f'{m:.4f}' if isinstance(m, float) else str(m)
                rows_o.append(f"| {r['id']} | {ms} | {r.get('op', 'band')} {r.get('target')} ± {r.get('pm', 0)} | {(r.get('arm_note') or r.get('source') or '')[:160]} |")
        open_md = '\n'.join(['| row | measured | target | why it is a record row |', '|---|---|---|---|'] + rows_o) if rows_o else '(none)'
        open_md += ('\n\nThe live-switch rows (`HOOK-*-pixels*`) carry a strip: `00-room-first/<look>-99-switch-control-full34.png` = venue ON switch vs fresh boot, '
                    'the `?venue=off` CONTROL pair, and the recorded re-bake attempt — the residue is main\'s (`web/scene/table.js` keeps the boot env cube map across a table switch, documented there).')
    # record-row movers vs the previous seal's gate JSON (if given)
    movers_md = '(no previous gate JSON given)'
    if a.prev_gate and os.path.exists(a.prev_gate) and os.path.exists(os.path.join(ROOT, f'gate-{a.tag}.json')):
        prev = {ball_key(r['id'], aliases): r for r in json.load(open(a.prev_gate))}
        cur = json.load(open(os.path.join(ROOT, f'gate-{a.tag}.json')))
        ball_tables = lambda ks: {k[5:].rsplit('-', 2)[0] for k in ks if k.startswith('BALL-') and len(k[5:].rsplit('-', 2)) == 3}
        tp, tc = ball_tables(prev), ball_tables(ball_key(r['id'], aliases) for r in cur)
        unmatched += [f'movers {c}: BALL rows only in the {"previous" if c in tp else "current"} gate' for c in sorted(tp ^ tc)]
        rows_ = []
        for r in cur:
            p_ = prev.get(ball_key(r['id'], aliases))
            if p_ and isinstance(p_.get('measured'), (int, float)) and isinstance(r.get('measured'), (int, float)) and abs(p_['measured'] - r['measured']) > 5e-4:
                rows_.append(f"| {r['id']} | {'record' if r.get('record') else 'judged'} | {p_['measured']:.4f} | {r['measured']:.4f} | {r['measured'] - p_['measured']:+.4f} |")
        movers_md = '\n'.join(['| row | kind | previous seal | this seal | Δ |', '|---|---|---|---|---|'] + rows_) if rows_ else '(no row moved by more than 5e-4)'
    um_md = '\n'.join(['UNMATCHED ' + u for u in unmatched])  # the census lines above plus the movers lines
    idx = f"""# lighting-pack/{os.path.basename(out)} — venue lighting batch (#638 + JOY slot walls + Star cushion shadow), seal {a.tag}

The venue-lighting branch `venue-lighting-2026-09` (base main c01bb535). Report: `SPIKE-REPORT-LIGHTING.md` (copy in this pack; {a.section} = this seal).

## What ships (ONE switch: `?venue=off` = the legacy rig AND the legacy room dressing, main-identical; default ON)
- **Room dressing (GLOBAL, every table)**: material-class albedos with sources replace the authored near-black dressing (floor and walls were ≈ 0.012 linear — a material-class error on every table). Textures kept as detail, scaled in linear space; the props' MAPS are scaled (no colour above 1). Every table's room changes; the ten room strips are the first figures (`00-room-first/`).
{ledger_md}
- **Predator (#638) fill = DERIVED**, not authored: a cube capture of the bar-lit class-albedo room at the table centre (ball height), projected to SH-L2 — {probe_md}. **Scope (seal 6): the fill is a uniform on the UNBAKED objects' programs only (balls, cue)** — no THREE.LightProbe exists in the scene (a LightProbe is scene-global; seal 5's room-side exclusion hook was a NO-OP and the probe lit the walls +64 % Y — see report §10), and the table-owned probe `obPdtVenueAmbient` (9.91 = 4.4× the key) is hidden and driven to 0 while the term is on, so no program compiles a probe term (programs census in `fence.md`; on/off room-mask rows in `gate.md`; strips `00-room-first/00-probe-onoff-*.png` = fill ON | fill OFF | room mask | |Δ|×8). No `up`/`down` constants exist any more. Room materials do not receive the probe.
- **sp look**: the SP room multipliers (floor × 0x383838, wall 0xd2c8b8 / env 0.15) apply only to the legacy dressing; the class room reads its albedo under the SP exposure (one look.js hunk).
- JOY / Star: no venue term (measured verdicts, report §L2). Diamond: derived-probe term HELD (`enabled: false`).

## Energy accounting and the LANDING CONDITION (ORDER-LIGHT-7 R-A)
The Predator balls already receive the bake's per-ball SH-L2 probe grid (gi.js: bar → cloth / room → ball, `uGiIrr` 2.0 — a main literal with no measured provenance, see report §L12). The runtime venue term therefore carries ONLY the room: the capture renders the table as a black occluder and the fixture hidden, so the pinned coefficients are the room's contribution alone; the residual overlap with the bake's own room share (the bake's room albedo vs the class dressing) is printed beside the pin in `gate.md`. **Landing condition:** at the ceremony rebake the Predator probe grid and lightmaps are rebaked with the class dressing; the runtime venue probe is then re-derived against the rebaked grid and, if the rebaked grid alone reproduces the terminator band, REMOVED ("superseded by bake"). No rebake in this lane. Ball rows are OUTPUTS: equator/crown below the admissible envelope is a finding about the baked cloth-bounce amplitude, not a number this lane moves.

## Ball shading (ORDER-LIGHT-9 — GLOBAL, behind the one switch; `?venue=off` compiles main's ball shader byte for byte)
- **At rest no ball received the bake (main defect, cured):** the per-ball SH block was filled only by the ball-set sync (rack / layout / playback), and a fresh boot's one sync ran before the async GI load — every resting ball's block was all-zero on every table (report §13.4, §14.1). Now the live ball set registers with gi.js and every completed apply refreshes the blocks (gate `SHFILL-*`: max |block − grid| ≤ 1e-6, arm `?venue=off` reads the grid value itself).
- **The authored underside occlusion is replaced by a DERIVED sphere–plane visibility** (`web/scene/occlusionlut.js`, generated from the exact integral; closed-form anchors M(−1,0) = 0, M(0,0) = 1 − 2^{{−5/2}}, M(+1,0) = 1; report §14.2) — gate `OCC-anchors-*`, `PROG-occ-*` (every lit ball program carries it; none on `?venue=off`).
- **The grid runs at physical scale (uGiIrr 1)**; the 2.0 literal (no provenance) stays on `?venue=off` only. Ball rows on all ten tables are OUTPUT rows (`BALL-<table>-<look>-under / -crownsat`, both looks) and each table has a cue-ball strip `00-room-first/<look>-2N-<table>-cueball_level.png`.
- The rebake prediction (§13.5) and its figure: `00-room-first/zz-13.5-rebake-prediction-table.png`, `prediction/`; the off-vs-main witness: `offcheck.md`; the owner list now names the occlusion term (ablation 0.077 → 0.145 default / 0.065 → 0.122 sp at uGiIrr 1 — §14.2 replaces it by derivation, not by ablation).

## Ceremony items (report §14.4 — written, not executed; no rebake in this lane)
1. **Rebake with the class dressing AND each table's own cloth colour** (Predator: `arcadia_tournament` 0x0a5498, not the bake's stale classic green) at a reflectance WITH provenance — a manufacturer data sheet for the cloth model (Simonis 860 / Arcadia: none in the repo today), else the MODEL Y with the tag; the bake tool needs a per-table cloth for the pool class (`TABLES.pool.mats` is null).
2. **The ball probe grid must not carry the emitters' direct light** (`probeSH` counts `lamp` hits and the ball shader adds the grid on top of the LTC direct): bake the ball grid with emitter hits excluded, or the shader must not add them — at physical scale this is the crown's ×1.8 and every clipping table (snooker, carom).
3. **Renderer limit, recorded with the number:** three.js's RectAreaLight LTC diffuse leg returns 0 for the cue ball's camera-facing equator up to ~10° of elevation where the exact form factor gives 0.19–0.35 (53 % at 20°, 98 % at 45° — verifier round 8); the equator band's median direct irradiance is 0.0016 vs the exact 0.612. A shader-side change (split bars / exact polygon form factor) is the shading lane's; the maintainer files the renderer issue.
4. **The §12.5 landing condition stands:** re-derive the runtime venue probe against the rebaked grid and remove it if the grid alone reproduces the band.
5. **Energy ledger (report §16.1, figure `00-room-first/zz-16.1-energy-ledger.png`, `ledger.md`):** every receiver's DIRECT / INDIRECT source is one cell; balls take diffuse from the baked grid only (the runtime rect lights are specular-only in ball programs — the emitter double count is cured behind the switch); cloth / rails / room keep runtime-LTC direct + baked indirect (their lightmaps store indirect only, plus the direct visibility in A).
6. **The 0.55 mix of the occlusion into the balls' indirect specular and sheen** (`shading.js`, MAIN-authored, inherited structure): recorded as a ceremony item, not touched — the derived occlusion is for the diffuse irradiance.
7. **Occlusion table domain:** the table's h/r axis ends at 2 (√-spaced rows); an airborne ball more than 2r (57 mm) off the cloth reads the η = 2 row (0.94 at n_y −1, ≥ 0.99 elsewhere) instead of rising to 1 — a ≤ 6 % under-light on the underside of a jumped ball, disclosed; resting balls are unaffected.
8. **The LTC ratio table (verifier round 8, owner: the renderer issue) beside the equator rows:** three r170 LTC diffuse / exact at the cue ball's camera-facing equator by elevation — 0° 0 · 2.5° 0 · 5° 0 · 7.5° 0 · 10° 0 · 12.5° 0.053 · 15° 0.243 · 20° 0.528 · 30° 0.829 · 45° 0.983 · 60° 1.007 (crown control 1.001); the shipped equator/crown rows are bounded by it.
9. **e2e-lighting in the pack logs exits 1 on two PRE-EXISTING main failures** (`brightness 1.4 rect intensity 9.282, want 10.92 (sp base)` and `GH-488 T1b-legs side jaw leg run 0.063`), present on main c01bb535 and in every seal since seal 1; the run is line-identical to the previous seal's — not an all-green test run, and not this lane's rows.
10. **Ledger arm scope (report §16.1):** `?ledgerArm=cloth` removes the rect-light diffuse from every `cloth`-mode table program (the cloth AND ~45 non-wood table materials, the cushion tops included) — the arm for the cloth and cushion rows; the `rail_top` read is cushion cloth, not the wood rail.
11. **Room floor lightmap decode (MAIN, verifier round 11):** the bake writes the floor map √-encoded and gi.js binds it as three's stock `lightMap`, read linearly (neither squared nor scaled) — the floor's baked bounce is over-read and its runtime direct is not visibility-multiplied (the floorshadow overlay stands in). Not a double count of the bars' direct; a ceremony item for the GI lane, not touched here.
12. **The bound occlusion texture, measured (report §17.2, `prediction/lighting-occlusion-bound-check.json`):** on default the renderer uploads `uOccLut` and 10 of 10 ball programs sample it, its nine interior nodes equal the independent-quadrature fixture to 2.7e-8; on `?venue=off` the texture object exists in JS but is never uploaded and no program samples it. Gate rows OCC-bound-nodes / -programs / -off.
13. **Gate resolvers fail closed (report §17.1):** a missing fixture / ledger / census field is a missing read and fails every operator (it used to read +inf and pass `>=` rows); the one deliberate +inf is `venue:sh` on a probe-less boot (a distance to the pin). Arms: `OB_SEAL_ARM=missing` (three synthetic rows) exit non-zero.
14. **offcheck flip floor (report §17.3):** the HDR floor is derived — the smallest non-zero flip observed across main's boot pairs (2.62e-3) — by `tools/render/lighting-main-flip.py`; an observed `?venue=off` per-boot flip of 1.4e-4 sits under it.
15. **Occlusion table residual (report §14.2 / §15.4):** the shader's bilinear read over-estimates the innermost contact ring (n_y −0.99 / −0.97 / −0.95 / −0.90: +0.011 / +0.0018 / +0.0094 / +0.0038 on 0.038 / 0.117 / 0.193 / 0.355); a finer n_y axis near −1 would remove it; the `uOccLut` DataTexture is created on `?venue=off` too but bound to no program (pixel-inert; PROG-occ 0/10 on off).

## Gate (this seal)
{verdict}

Ball rows are OUTPUTS of the derived fill (reported against the photo bands; not tuned). Saturation rows (#638 ask) and the club-room rows are judged. See `gate.md`.

## Open rows and record rows — the definition, with the full count
{open_def_md}

### Record rows outside their reference (measured verdicts this lane does not close by a rig term)
{open_md}

## Record-row movers vs the previous seal
{movers_md}

## Unmatched tables (BEFORE / AFTER and previous / current gate, paired by canonical id; any line here fails the pack)
{um_md or '(none)'}

## Fence
`fence.md`: table-owned meshes + materials identical on all tables (red arm); the UNBAKED class (balls, cue) is judged on every non-program field with its own red arm, its program fields (onBeforeCompile / cache key) are the venue fill's hook and are listed; room-owned rows listed PER TABLE (the dressing, raw linear colour floats); the COMPILED-GLSL programs census per material class (probe term / fill term) with the `?venueArm=wallfill` red arm.

## How to read the sheets
`00-room-first/<look>-NN-<table>-full34.png` = BEFORE | AFTER (| PHOTO where a counterpart exists) | |ΔY8| heat (0..64 → black..white). `sheets/<look>/<table>/<pose>-delta.png` for every pose. `default` = the cinema/card look (exposure 1.05); `sp` = the real-user boot (0.85). Note main's own per-boot LSB flips (Predator sp ≤ 3/255; Diamond cue-ball two-state) ride under any pair of boots.

## Photo reads
`reads/<venue>/README.md` + annotated ROI evidence; `reads/<venue>/verify/` = the adversarial re-reads; `reads/room/` = the club-class room reads.
"""
    open(os.path.join(out, 'INDEX.md'), 'w').write(idx)
    # sums
    sums = []
    for dp, _, fs in os.walk(out):
        for f in sorted(fs):
            if f == 'SHA256SUMS':
                continue
            p = os.path.join(dp, f); sums.append(f'{sha256(p)}  {os.path.relpath(p, out)}')
    open(os.path.join(out, 'SHA256SUMS'), 'w').write('\n'.join(sums) + '\n')
    print(f'pack {out}: {len(sums)} files ({n_sheets} sheets, {n_reads} read files)')
    if unmatched:
        print(um_md)
        print(f'lighting-pack: {len(unmatched)} unmatched tables (fatal; no --drive copy)')
        sys.exit(3)
    if a.drive:
        os.makedirs(a.drive, exist_ok=True)
        n = copytree(out, a.drive)
        print(f'copied {n} files to {a.drive}')


def selftest():
    # each plant runs the real main path by subprocess (cwd = a temp dir holding output/lighting) against a synthetic
    # alias file, synthetic censuses and, for the movers plants, synthetic gate JSONs
    ok = True
    ren, dig = load_table_aliases(ALIAS_JS)
    real = 'pool_pro_9ft_measured' in dig.values() and len(ren) > 0
    print(f'equipmentalias.js parse: {len(ren)} renames, {len(dig)} table digest rows (pool_pro_9ft_measured among them) -> {"PASS" if real else "FAIL"}'); ok = ok and real
    with tempfile.TemporaryDirectory() as td:
        js = os.path.join(td, 'alias.js')
        open(js, 'w').write("export const TABLE_RENAMES = Object.freeze({\n  selftest_old_tbl: 'selftest_new_tbl',\n});\n"
                            "export const ALIAS_DIGESTS = Object.freeze([\n  Object.freeze({ axis: 'table', digest: '" + fnv1a64_hex('selftest_retired_tbl')
                            + "', neutral_id: 'selftest_neutral_tbl' }),\n]);\n")
        ball = lambda t, m: [{'id': f'BALL-{t}-default-under', 'record': True, 'measured': m, 'op': 'band', 'target': 0.3, 'pm': 0.1}]
        # (name, before table, after table, previous gate rows, current gate rows, exit, census rows, unmatched listed, movers row)
        cases = [('census digest rename', 'selftest_retired_tbl', 'selftest_neutral_tbl', None, None, 0, 1, 0, None),
                 ('census TABLE_RENAMES rename', 'selftest_old_tbl', 'selftest_new_tbl', None, None, 0, 1, 0, None),
                 ('census unmatched table', 'selftest_lonely_tbl', 'selftest_other_tbl', None, None, 3, 0, 2, None),
                 ('movers renamed pair', 'selftest_same_tbl', 'selftest_same_tbl', ball('selftest_retired_tbl', 0.1), ball('selftest_neutral_tbl', 0.2), 0, 1, 0,
                  '| BALL-selftest_neutral_tbl-default-under | record | 0.1000 | 0.2000 |'),
                 ('movers unmatched table', 'selftest_same_tbl', 'selftest_same_tbl', ball('selftest_lonely_tbl', 0.1), ball('selftest_other_tbl', 0.2), 3, 1, 2, None)]
        for i, (name, tb, ta, gp, gc, want_rc, want_rows, want_listed, want_mover) in enumerate(cases):
            cwd = os.path.join(td, f'c{i}'); root = os.path.join(cwd, ROOT)
            for side, tbl, inten in (('before', tb, 1.0), (f'after-st{i}', ta, 2.0)):
                os.makedirs(os.path.join(root, side, 'default', tbl))
                json.dump({'lights': [{'type': 'rect', 'name': 'k', 'intensity': inten}], 'lighting': None}, open(os.path.join(root, side, 'default', tbl, 'census.json'), 'w'))
            cmd = [sys.executable, os.path.abspath(__file__), '--tag', f'st{i}', '--alias-js', js]
            if gp is not None:
                json.dump(gp, open(os.path.join(cwd, 'prev-gate.json'), 'w')); json.dump(gc, open(os.path.join(root, f'gate-st{i}.json'), 'w'))
                cmd += ['--prev-gate', os.path.join(cwd, 'prev-gate.json')]
            r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
            pk = os.path.join(root, 'pack', f'st{i}')
            cdm = open(os.path.join(pk, 'census', 'census-diff.md')).read() if os.path.exists(os.path.join(pk, 'census', 'census-diff.md')) else ''
            idx = open(os.path.join(pk, 'INDEX.md')).read() if os.path.exists(os.path.join(pk, 'INDEX.md')) else ''
            rows = sum(1 for l in cdm.splitlines() if l.startswith('| default | '))
            listed = r.stdout.count('UNMATCHED ')
            paired = want_rows == 0 or os.path.exists(os.path.join(pk, 'census', f'before-default-{ta}.json'))
            good = (r.returncode == want_rc and rows == want_rows and listed == want_listed and paired
                    and cdm.count('UNMATCHED ') == (want_listed if name.startswith('census') else 0) and idx.count('UNMATCHED ') == want_listed
                    and (want_mover is None or want_mover in idx))
            print(f'{name}: {tb} vs {ta} -> exit {r.returncode}, census rows {rows}, unmatched listed {listed}'
                  + (f', mover row {"present" if want_mover in idx else "ABSENT"}' if want_mover else '') + f' -> {"PASS" if good else "FAIL"}')
            if not good:
                print('  stderr tail:', r.stderr.strip().splitlines()[-1:] if r.stderr.strip() else '(none)')
            ok = ok and good
    return 0 if ok else 3


if __name__ == '__main__':
    main()
