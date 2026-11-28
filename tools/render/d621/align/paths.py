# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Single place for every path the D621 alignment gate touches (GH-621, Diamond Pro-Am 8 ft vs the purchased model).

QUARANTINE LAW: the purchased model's OBJ cages are READ from `model_obj_dir` at run time only. Everything derived from
them (silhouette rasters, section polylines, heatmaps, overlays, measurements) is written under `out`, which must live
OUTSIDE the repository (default /tmp/d621-align/gate/<run-id>/). Only numbers with method strings may be committed.

Resolution order for every path: CLI flag > environment variable > default.
  --model-obj-dir  D621_MODEL_OBJ_DIR  /tmp/ob-3dm-quarantine/diamond-proam-8ft/obj
  --ours           D621_OURS           /tmp/d621-align/ours/ours-8ft.json   (output of dump-ours-621.mjs)
  --out            D621_OUT            /tmp/d621-align/gate/<YYYYmmdd-HHMMSS>/
"""
import argparse
import datetime
import hashlib
import os

DEFAULT_MODEL_OBJ_DIR = "/tmp/ob-3dm-quarantine/diamond-proam-8ft/obj"
DEFAULT_OURS = "/tmp/d621-align/ours/ours-8ft.json"
DEFAULT_OUT_ROOT = "/tmp/d621-align/gate"

PKG_DIR = os.path.dirname(os.path.abspath(__file__))
# tools/render/d621/align -> repo root is four levels up
REPO_ROOT = os.path.abspath(os.path.join(PKG_DIR, "..", "..", "..", ".."))

BED_Z = 770.0  # model frame: bed top plane (mm)


class Config:
    def __init__(self, model_obj_dir=None, ours=None, out=None, label=None):
        self.model_obj_dir = os.path.abspath(model_obj_dir or os.environ.get("D621_MODEL_OBJ_DIR") or DEFAULT_MODEL_OBJ_DIR)
        self.ours = os.path.abspath(ours or os.environ.get("D621_OURS") or DEFAULT_OURS)
        out = out or os.environ.get("D621_OUT")
        if not out:
            out = os.path.join(DEFAULT_OUT_ROOT, datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))
        self.out = os.path.abspath(out)
        self.run_id = os.path.basename(self.out.rstrip("/"))
        self.label = label or os.path.splitext(os.path.basename(self.ours))[0]

    # ---- derived directories (all under out) ----
    @property
    def model_dir(self): return os.path.join(self.out, "model")
    @property
    def model_sil(self): return os.path.join(self.out, "model", "silhouettes")
    @property
    def model_sec(self): return os.path.join(self.out, "model", "sections")
    @property
    def data(self): return os.path.join(self.out, "data")
    @property
    def sil_ours(self): return os.path.join(self.out, "data", "silhouettes_ours")
    @property
    def heatmaps(self): return os.path.join(self.out, "heatmaps")
    @property
    def overlays(self): return os.path.join(self.out, "overlays")
    @property
    def sections(self): return os.path.join(self.out, "sections")

    def ensure_dirs(self):
        for d in (self.model_dir, self.model_sil, self.model_sec, self.data, self.sil_ours, self.heatmaps, self.overlays, self.sections):
            os.makedirs(d, exist_ok=True)

    def assert_out_outside_repo(self):
        if os.path.commonpath([self.out, REPO_ROOT]) == REPO_ROOT:
            raise SystemExit(f"QUARANTINE: --out {self.out} is inside the repository {REPO_ROOT}; derived model data may not be written there")

    def ours_sha256(self):
        h = hashlib.sha256()
        with open(self.ours, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        return h.hexdigest()

    def to_dict(self):
        return dict(model_obj_dir=self.model_obj_dir, ours=self.ours, out=self.out, run_id=self.run_id, label=self.label)


def add_args(parser):
    parser.add_argument("--model-obj-dir", default=None, help=f"quarantine OBJ dir (default {DEFAULT_MODEL_OBJ_DIR}; env D621_MODEL_OBJ_DIR)")
    parser.add_argument("--ours", default=None, help=f"ours-*.json from dump-ours-621.mjs (default {DEFAULT_OURS}; env D621_OURS)")
    parser.add_argument("--out", default=None, help=f"run directory OUTSIDE the repo (default {DEFAULT_OUT_ROOT}/<run-id>; env D621_OUT)")
    parser.add_argument("--label", default=None, help="free label for the run (e.g. the code sha); default = ours file stem")
    return parser


def from_args(argv=None, description=None, extra=None):
    """Parse the common path flags (plus any `extra(parser)` flags) into (Config, argparse.Namespace)."""
    p = argparse.ArgumentParser(description=description)
    add_args(p)
    if extra:
        extra(p)
    a = p.parse_args(argv)
    cfg = Config(a.model_obj_dir, a.ours, a.out, a.label)
    cfg.assert_out_outside_repo()
    cfg.ensure_dirs()
    return cfg, a
