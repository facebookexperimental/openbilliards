# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Model-side plane sections, regenerated from the quarantine OBJ at run time (port of Task B sections.py; unchanged
cut stations and windows). Output: <out>/model/sections/<name>.npy (float64 (N,2,2) in-plane segments, mm), <name>.json
(tags group:node per segment), <name>.png, index.json."""
import json
import os

import numpy as np

import objlib
import paths

EXCL = {"cue", "label", "ignore"}
COL = {"rails": "#c87828", "rail_side": "#785028", "kant_support": "#a0a03c", "apron_cabinet": "#5a3c1e", "legs_out": "#404040", "legs_in": "#909090",
       "cushions": "#28a050", "boots": "#101010", "traps": "#8c288c", "sights": "#e0a000", "screws": "#d02020"}
AXN = "xyz"
CUTS = [
    # name, axis, c, (h0,h1,v0,v1) window in the in-plane coords (ascending remaining axes), note
    ("S1_x0_sidepocket",      0,    0.0, (550, 800, 600, 900), "plane x=0 (task S1). NOTE: x=0 is the SIDE-POCKET centre - the long rail caps end at |x|=2.5 and the cushions at |x|=66.1, so this cut shows the side boot/apron/support, not a rail profile; see S1b"),
    ("S1b_x600_railprofile",  0,  600.0, (550, 800, 600, 900), "plane x=600 through the +y long rail (true rail cross-section, mid of the 2.5..1248.2 half)"),
    ("S1c_y0_endrailprofile", 1,    0.0, (1100, 1350, 600, 900), "plane y=0 through the +x short rail"),
    ("S2_z790_corner",        2,  790.0, (1000, 1350, 425, 775), "plan cut at bed+20 around the +x+y corner pocket"),
    ("S3_z815_corner",        2,  815.0, (1000, 1350, 425, 775), "plan cut at bed+45 (task S3). NOTE: 815.0 is ABOVE the cap top (814.68) - only the boot crest is cut; see S3b"),
    ("S3b_z810_corner",       2,  810.0, (1000, 1350, 425, 775), "plan cut at bed+40 (cap + cushion + boot all present)"),
    ("S4_z790_side",          2,  790.0, (-175, 175, 450, 800), "plan cut at bed+20 around the +y side pocket"),
    ("S4b_z810_side",         2,  810.0, (-175, 175, 450, 800), "plan cut at bed+40 around the +y side pocket"),
    ("S5_y490_legcab",        1,  490.0, (-1400, 1400, 0, 880), "elevation through the +y leg centres (y=490), full length"),
    ("S6_z300_legs",          2,  300.0, (-1400, 1400, -800, 800), "plan cut at z=300: leg sections"),
    ("S6b_z300_leg01",        2,  300.0, (940, 1190, 365, 615), "plan cut at z=300, leg01 zoom"),
    ("S6c_z55_leg01",         2,   55.0, (940, 1190, 365, 615), "plan cut at floor(5)+50, leg01 zoom"),
    ("S6d_z555_leg01",        2,  555.0, (940, 1190, 365, 615), "plan cut at floor(5)+550, leg01 zoom"),
    ("S7_x1066_end",          0, 1066.0, (-800, 800, 0, 880), "end elevation through the +x leg centres (x=1066)"),
    ("S8_y0_longelev",        1,    0.0, (-1400, 1400, 0, 880), "long elevation at y=0 (centre line) for reference"),
]


def run(cfg, nodes, G, log=print, plots=True):
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    from matplotlib.collections import LineCollection
    OUT = cfg.model_sec; os.makedirs(OUT, exist_ok=True)
    index = []
    for name, axis, c, win, note in CUTS:
        segs = []; tags = []
        for g, names in G.items():
            if g in EXCL or g in ("rail_caps", "rail_corners", "cabinet", "bedslab"): continue   # pseudo-groups would double count
            for n in names:
                s3 = objlib.section(nodes[n]["V"], nodes[n]["F"], axis, c)
                if len(s3) == 0: continue
                s2 = objlib.project(s3, axis)
                inwin = ((s2[:, :, 0] >= win[0]) & (s2[:, :, 0] <= win[1]) & (s2[:, :, 1] >= win[2]) & (s2[:, :, 1] <= win[3])).any(axis=1)
                s2 = s2[inwin]
                if len(s2) == 0: continue
                segs.append(s2); tags += [(g, n)] * len(s2)
        S = np.concatenate(segs) if segs else np.zeros((0, 2, 2))
        np.save(f"{OUT}/{name}.npy", S)
        hax = [i for i in range(3) if i != axis]
        meta = dict(name=name, plane=f"{AXN[axis]}={c}", inplane_axes=[AXN[hax[0]], AXN[hax[1]]], units="mm", window=dict(h=[win[0], win[1]], v=[win[2], win[3]]), n_segments=int(len(S)), note=note,
                    segments_by_group={g: int(sum(1 for t in tags if t[0] == g)) for g in sorted(set(t[0] for t in tags))},
                    tags=[f"{g}:{n}" for g, n in tags])
        json.dump(meta, open(f"{OUT}/{name}.json", "w"))
        if plots:
            W = win[1] - win[0]; H = win[3] - win[2]; sc = 6.0 / max(W, H) * 1.0
            fig, ax = plt.subplots(figsize=(max(6, W * sc * 1.6), max(4, H * sc * 1.6)))
            for g in sorted(set(t[0] for t in tags)):
                m = np.array([t[0] == g for t in tags])
                ax.add_collection(LineCollection(S[m], colors=COL.get(g, "k"), linewidths=0.9, label=f"{g} ({m.sum()})"))
            step = 10 if max(W, H) <= 400 else (50 if max(W, H) <= 1700 else 100)
            ax.set_xticks(np.arange(win[0], win[1] + 1, step)); ax.set_yticks(np.arange(win[2], win[3] + 1, step))
            ax.grid(True, lw=0.3, alpha=0.6); ax.set_aspect("equal"); ax.set_xlim(win[0], win[1]); ax.set_ylim(win[2], win[3])
            ax.set_xlabel(f"{AXN[hax[0]]} [mm]"); ax.set_ylabel(f"{AXN[hax[1]]} [mm]")
            ax.set_title(f"{name}: plane {AXN[axis]}={c:g} mm  (grid {step} mm; bed top z=770)", fontsize=9)
            if hax[1] == 2 and win[2] <= 770 <= win[3]: ax.axhline(770, color="#3060c0", lw=0.6, ls="--")
            if tags: ax.legend(fontsize=6, loc="upper right")
            plt.setp(ax.get_xticklabels(), rotation=90, fontsize=6); plt.setp(ax.get_yticklabels(), fontsize=6)
            fig.tight_layout(); fig.savefig(f"{OUT}/{name}.png", dpi=130); plt.close(fig)
        index.append(dict(name=name, plane=meta["plane"], n_segments=meta["n_segments"], groups=meta["segments_by_group"], note=note))
        log(f"[sections_model] {name} {meta['plane']} segments: {len(S)} {meta['segments_by_group']}")
    json.dump(index, open(f"{OUT}/index.json", "w"), indent=1)
    return index


if __name__ == "__main__":
    cfg, _ = paths.from_args(description=__doc__)
    import common
    nodes, G = common.load_model(cfg.model_obj_dir)
    run(cfg, nodes, G)
