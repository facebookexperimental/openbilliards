# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Cut OUR mesh by the Task B section planes (S1..S8 incl. b/c/d variants) and overlay on the model's polylines
(port of Task C sections_overlay.py; unchanged). Model polylines from <out>/model/sections (sections_model.py).
Output: <out>/sections/<name>_ours.npy/.json, <name>_overlay.png, index.json."""
import json
import os

import numpy as np

import common
import objlib
import paths
from sections_model import CUTS, AXN

EXCL = {"decal"}


def run(cfg, ours, OG, log=print):
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    from matplotlib.collections import LineCollection
    MOD = cfg.model_sec; OUT = cfg.sections; os.makedirs(OUT, exist_ok=True)
    index = []
    for name, axis, c, win, _note in CUTS:
        segs = []; tags = []
        for g, names in OG.items():
            if g in EXCL: continue
            for n in names:
                s3 = objlib.section(ours[n]["V"], ours[n]["F"], axis, c)
                if len(s3) == 0: continue
                s2 = objlib.project(s3, axis)
                inwin = ((s2[:, :, 0] >= win[0]) & (s2[:, :, 0] <= win[1]) & (s2[:, :, 1] >= win[2]) & (s2[:, :, 1] <= win[3])).any(axis=1)
                s2 = s2[inwin]
                if len(s2) == 0: continue
                segs.append(s2); tags += [f"{g}:{n}"] * len(s2)
        S = np.concatenate(segs) if segs else np.zeros((0, 2, 2))
        np.save(f"{OUT}/{name}_ours.npy", S)
        hax = [i for i in range(3) if i != axis]
        bygroup = {}
        for t in tags: bygroup[t.split(":")[0]] = bygroup.get(t.split(":")[0], 0) + 1
        json.dump(dict(name=name, plane=f"{AXN[axis]}={c}", inplane_axes=[AXN[hax[0]], AXN[hax[1]]], units="mm", window=dict(h=[win[0], win[1]], v=[win[2], win[3]]), n_segments=int(len(S)), segments_by_group=bygroup, tags=tags), open(f"{OUT}/{name}_ours.json", "w"))
        Mseg = np.load(f"{MOD}/{name}.npy"); Mmeta = json.load(open(f"{MOD}/{name}.json"))
        W = win[1] - win[0]; H = win[3] - win[2]; sc = 6.0 / max(W, H)
        fig, ax = plt.subplots(figsize=(max(7, W * sc * 1.7), max(5, H * sc * 1.7)))
        ax.set_facecolor("#0e1218"); fig.patch.set_facecolor("#0e1218")
        if len(Mseg): ax.add_collection(LineCollection(Mseg, colors="#00beff", linewidths=1.1, label=f"model ({len(Mseg)} segs: {', '.join(f'{k} {v}' for k, v in Mmeta['segments_by_group'].items())})"))
        if len(S): ax.add_collection(LineCollection(S, colors="#ff28c8", linewidths=1.1, label=f"ours ({len(S)} segs: {', '.join(f'{k} {v}' for k, v in bygroup.items())})"))
        step = 10 if max(W, H) <= 400 else (50 if max(W, H) <= 1700 else 100)
        ax.set_xticks(np.arange(win[0], win[1] + 1, step)); ax.set_yticks(np.arange(win[2], win[3] + 1, step))
        ax.grid(True, lw=0.3, alpha=0.45, color="#9aa0aa"); ax.set_aspect("equal"); ax.set_xlim(win[0], win[1]); ax.set_ylim(win[2], win[3])
        ax.tick_params(colors="#d0d4da", labelsize=6); [sp.set_color("#6a7078") for sp in ax.spines.values()]
        ax.set_xlabel(f"{AXN[hax[0]]} [mm]", color="#d0d4da"); ax.set_ylabel(f"{AXN[hax[1]]} [mm]", color="#d0d4da")
        ax.set_title(f"{name}: plane {AXN[axis]}={c:g} mm  (ticks {step} mm; bed top z=770 dashed)  cyan=model  magenta=ours", fontsize=9, color="#e8eaee")
        if hax[1] == 2 and win[2] <= 770 <= win[3]: ax.axhline(770, color="#ffd24a", lw=0.7, ls="--")
        if len(Mseg) or len(S): ax.legend(fontsize=6, loc="upper right", facecolor="#1a1f28", edgecolor="#6a7078", labelcolor="#e8eaee")
        plt.setp(ax.get_xticklabels(), rotation=90)
        fig.tight_layout(); fig.savefig(f"{OUT}/{name}_overlay.png", dpi=130, facecolor=fig.get_facecolor()); plt.close(fig)
        index.append(dict(name=name, plane=f"{AXN[axis]}={c}", window=dict(h=[win[0], win[1]], v=[win[2], win[3]]), model_segments=int(len(Mseg)), ours_segments=int(len(S)), ours_groups=bygroup, model_groups=Mmeta["segments_by_group"], png=f"{OUT}/{name}_overlay.png", ours_npy=f"{OUT}/{name}_ours.npy"))
        log(f"[sections_overlay] {name} model {len(Mseg)} ours {len(S)} {bygroup}")
    json.dump(index, open(f"{OUT}/index.json", "w"), indent=1)
    return index


if __name__ == "__main__":
    cfg, _ = paths.from_args(description=__doc__)
    d, ours = common.load_ours(cfg.ours); OG = common.ours_groups(ours)
    run(cfg, ours, OG)
