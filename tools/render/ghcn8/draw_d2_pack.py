# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Draw the measured D2 construction and assemble private comparison frames.

Run the CPU section verifier and the gated captures first. No browser is
launched here; purchased geometry and reference pixels stay out of the repo.
"""
from pathlib import Path
import argparse
import hashlib
import json

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from measure_xingpai import sections

ROOT = Path(__file__).resolve().parents[3]
PACK = Path.home() / 'ob-artifacts/astra-cn8/phase2-d2/seal-1'


def drawings():
    d = json.loads((PACK/'measurements/built-drawing-inputs.json').read_text())
    definition = json.loads((ROOT/'docs/geometry/cn8-pocket-d2-section.json').read_text())
    assert d['table_sha256'] == hashlib.sha256((ROOT/'web/scene/table.js').read_bytes()).hexdigest()
    out = PACK/'drawings'
    out.mkdir(exist_ok=True)
    plt.rcParams.update({'font.size': 10, 'svg.fonttype': 'none'})
    fig, ax = plt.subplots(figsize=(10, 8), layout='constrained')
    inner = np.array([p['inner'] for p in d['plan']])*1000
    outer = np.array([p['outer'] for p in d['plan']])*1000
    bed = np.array(d['bed_edge'])*1000
    ax.fill(*np.vstack([inner, outer[::-1]]).T, color='#eee4d9')
    ax.plot(*outer.T, color='#814b2e', lw=2, label='Outer circle + tangent lines [DERIVED: MFR / owner plan]')
    ax.plot(*inner.T, color='#333333', lw=2, label='Retained mouth / back arcs [DERIVED: frozen contract]')
    ax.plot(*bed.T, color='#21824a', lw=1.5, label='Hidden bed edge at cover inner wall, y = 0 [DERIVED]')
    for i in range(0, len(inner), 8):
        ax.plot(*np.vstack([inner[i], outer[i]]).T, color='#b9b0a8', lw=.7)
    k = d['K']
    c, r = k['C']*1000, k['R']*1000
    angle = np.linspace(0, 2*np.pi, 361)
    ax.plot(c+r*np.cos(angle), c+r*np.sin(angle), '--', color='#6c6c6c', lw=1)
    ax.plot([-55, 150], [-55, 150], ':', color='#999999', lw=.8)
    ax.scatter([c], [c], s=18, color='black')
    ax.annotate('C = (3.5, 3.5) mm\nR = 52.5 mm\n[retained contract]', (c,c), (-51,-45),
                arrowprops={'arrowstyle':'-', 'color':'#777777'}, fontsize=9)
    ax.annotate('Outer R = 136.5 mm [DERIVED]\nRail edge = 140 mm [MFR-derived]', (100,100), (41,126),
                arrowprops={'arrowstyle':'-', 'color':'#777777'}, fontsize=9)
    ax.annotate('Cut = -40 mm\n[retained contract]', (140,-40), (81,-62),
                arrowprops={'arrowstyle':'-', 'color':'#777777'}, fontsize=9)
    ax.set(xlabel='Corner-local u (mm)', ylabel='Corner-local v (mm)', xlim=(-65,165), ylim=(-67,170),
           title='D2 analytic plan and actual cloth termination')
    ax.set_aspect('equal'); ax.grid(alpha=.15); ax.legend(loc='upper left', fontsize=8)
    fig.suptitle('From the renderer builder; no source photo contour is used as a plan boundary', fontsize=11)
    for suffix in ['png','svg']:
        fig.savefig(out/f'D2-analytic-plan.{suffix}', dpi=180)
    plt.close(fig)

    fig, axes = plt.subplots(1, 2, figsize=(14, 9), sharey=True)
    fig.subplots_adjust(left=.06, right=.99, top=.91, bottom=.25, wspace=.15)
    raw_before = json.loads((PACK/'before/measurements/chinese8_pro_9ft--current-meshes.json').read_text())
    before_segments = []
    for mesh in raw_before:
        vertices = np.asarray(mesh['positions']).reshape(-1,3)
        if not mesh['name'].startswith(('cn8r82-ring-', 'cn8r82-fallface-')):
            continue
        if vertices[:,0].min() < 0 or vertices[:,2].min() < 0:
            continue
        indices = np.asarray(mesh['indices'] if mesh['indices'] is not None else np.arange(len(vertices))).reshape(-1,3)
        u, v = (vertices[:,0]-1.27)*1000, (vertices[:,2]-.63)*1000
        local = np.column_stack([(u-v)/np.sqrt(2), (u+v)/np.sqrt(2)-c*np.sqrt(2)-r, vertices[:,1]*1000])
        before_segments.extend(sections(local, indices, 0, .00013)[:,:,1:])
    for ax, name in zip(axes, ['central','terminal']):
        profile = np.asarray(d[name])*1000
        source = np.asarray(definition['sections'][name]['source_profile_mm'])
        source[:,0] -= source[:,0].min()
        source[:,1] += definition['parameters']['rail_top_mm']['value']-definition['parameters']['source_rail_top_mm']['value']
        ax.fill(*profile.T, color='#bd875f', alpha=.55, label='D2 closed shell [DERIVED; EST gauge]')
        ax.plot(*np.vstack([profile,profile[:1]]).T, color='#814b2e', lw=1.5)
        ax.plot(*source.T, color='#167784', lw=1.5, label='Star measured section; crown datum translated [MODEL / EST]')
        if name == 'terminal':
            ax.plot(*source[:2].T, color='#bc6123', lw=3, label='Borrowed central fold [EST]')
        elif before_segments:
            ax.add_collection(LineCollection(before_segments, colors='#888888', linewidths=1,
                                               linestyles='dashed', label='Before: actual ring + fallface cut [DERIVED]'))
        ax.axhline(0, color='#388b50', lw=.8, label='Bed datum [retained]')
        ax.axhline(42, color='#aaaaaa', ls=':', lw=.8)
        ax.set(xlabel='Radial distance from inner plan boundary (mm)', xlim=(-8,106), ylim=(-84,67),
               title=f'{name.capitalize()} section')
        ax.set_aspect('equal'); ax.grid(alpha=.15)
    axes[0].set_ylabel('Height from bed (mm); retained rail = +42 mm [EST]')
    fig.suptitle('Measured Star sections → official-plan span and PHOTO-aligned height', fontsize=15)
    legend = {}
    for ax in axes:
        handles, labels = ax.get_legend_handles_labels()
        legend.update(zip(labels, handles))
    fig.legend(legend.values(), legend.keys(), loc='lower center', bbox_to_anchor=(.5,.075), ncol=2, fontsize=9)
    fig.text(.5, .02, 'PHOTO drop: 96.476 ± 6.030 mm read bound; camera / correspondence uncertainty remains EST.\n'
             'Radial lip and fold dimensions stay MODEL; only the near-flat crown span absorbs the plan-width correction.',
             ha='center', fontsize=10)
    for suffix in ['png','svg']:
        fig.savefig(out/f'D2-measured-sections.{suffix}', dpi=180, bbox_inches='tight')
    plt.close(fig)
    print(out)

    # The plan's explicit survey heights are TESSELLATION probes, not
    # added physical dimensions. Intersect the actual browser-exported mesh.
    raw_after = json.loads((PACK/'after/measurements/chinese8_pro_9ft--current-meshes.json').read_text())
    fig, axes = plt.subplots(1, 3, figsize=(16, 6), layout='constrained')
    for ax, height in zip(axes, [.5, 20, 38]):
        for meshes, color, label in [(raw_before,'#999999','Before mesh section'),
                                     (raw_after,'#814b2e','D2 mesh section')]:
            segments = []
            for mesh in meshes:
                if not mesh['name'].startswith(('cn8r82-ring-','cn8r82-fallface-','cn8r82-endclose-')):
                    continue
                vertices = np.asarray(mesh['positions']).reshape(-1,3)
                if vertices[:,0].min() < 0 or vertices[:,2].min() < 0:
                    continue
                indices = np.asarray(mesh['indices'] if mesh['indices'] is not None else np.arange(len(vertices))).reshape(-1,3)
                local = np.column_stack([(vertices[:,0]-1.27)*1000,
                                         vertices[:,1]*1000,(vertices[:,2]-.63)*1000])
                segments.extend(sections(local,indices,1,height)[:,:,[0,2]])
            ax.add_collection(LineCollection(segments, colors=color, linewidths=1.4, label=label+' [DERIVED]'))
        ax.plot(*outer.T, ':', color='#111111', lw=.8, label='Protected outer envelope')
        ax.plot(c+r*np.cos(angle),c+r*np.sin(angle),'--',color='#217eb6',lw=1,label='Frozen mouth circle')
        ax.set(title=f'Bed +{height:g} mm [TESSELLATION probe]',xlabel='Corner-local u (mm)',
               xlim=(-57,153),ylim=(-57,153))
        ax.set_aspect('equal'); ax.grid(alpha=.15)
    axes[0].set_ylabel('Corner-local v (mm)')
    axes[1].legend(loc='lower left',fontsize=8)
    fig.suptitle('Actual horizontal sections and the full protected footprint',fontsize=14)
    for suffix in ['png','svg']:
        fig.savefig(out/f'D2-height-sections.{suffix}',dpi=180)
    plt.close(fig)


def pairs():
    register = json.loads((PACK/'FRAME-REGISTER.json').read_text())
    frames = {(f['capture'],f['table'],f['pose']):f for f in register['render_frames']}
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 22)
    small = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 17)
    for table in ['chinese8_pro_9ft','joy_q8_9ft']:
        for pose in register['poses']:
            before, after = [frames[(capture,table,pose)] for capture in ['before','after']]
            canvas = Image.new('RGB',(2400,850),'#f3f1ec')
            draw = ImageDraw.Draw(canvas)
            for x, frame, label in [(0,before,'BEFORE'),(1200,after,'D2 FIRST GEOMETRY')]:
                im = Image.open(PACK/frame['file']).convert('RGB').resize((1200,750),Image.Resampling.LANCZOS)
                canvas.paste(im,(x,68))
                draw.text((x+20,12),f'{label} / {table} / {pose}',font=font,fill='#252525')
                draw.text((x+20,40),f"Frame SHA-256: {frame['sha256'][:24]}…",font=small,fill='#555555')
            caption = ('AUTO-FRAMED OVERVIEWS: cameras differ; use the nine matched detail/top poses for comparisons.'
                       if after['camera_alignment'] != 'MATCHED' else
                       'Fixed camera, viewport, neutral rig and geometry source digest verified. Source measurements remain cross-model.')
            draw.text((20,824),caption,font=small,fill='#555555')
            canvas.save(PACK/'frames'/f'PAIR--{table}--{pose}.png')
    print('Comparison pairs written to',PACK/'frames')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pairs',action='store_true')
    args = parser.parse_args()
    pairs() if args.pairs else drawings()
