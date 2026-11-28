#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""D621-PLAN-3-RECORD-3 — write the committed purchased-model MANIFEST: per OBJ file its name, byte size and sha256 (numbers only;
the quarantine bytes never leave). The card-bearing gate recomputes the same digests over its model dir and refuses when the set
differs from this manifest — the model the PLAN rows were measured against is thereby a TREE fact, not a /tmp path.

  python3 tools/render/d621/law/make_model_manifest_621.py [--model-obj-dir DIR] [--out tools/render/d621/law/model_manifest_621.json]
"""
import argparse, hashlib, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "align"))
import paths  # noqa: E402


def manifest(model_dir):
    files = []
    for fn in sorted(f for f in os.listdir(model_dir) if f.lower().endswith(".obj")):
        with open(os.path.join(model_dir, fn), "rb") as fh:
            data = fh.read()
        files.append(dict(name=fn, bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
    h = hashlib.sha256()
    for f in files:
        h.update(f["name"].encode()); h.update(b":"); h.update(f["sha256"].encode()); h.update(b"\n")
    return dict(schema="d621-model-manifest/1", model="3dsky Diamond Pro-Am 8 ft (purchased; quarantined)", n_files=len(files),
                set_sha256=h.hexdigest(), files=files,
                note="Numbers only. The gate recomputes set_sha256 over its --model-obj-dir with the same rule (sorted names, name:sha256 per line).")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model-obj-dir", default=os.environ.get("D621_MODEL_OBJ_DIR") or paths.DEFAULT_MODEL_OBJ_DIR)
    ap.add_argument("--out", default=os.path.join(HERE, "model_manifest_621.json"))
    a = ap.parse_args(argv)
    m = manifest(a.model_obj_dir)
    with open(a.out, "w") as f:
        json.dump(m, f, indent=1); f.write("\n")
    print(f"[manifest] {m['n_files']} OBJ files, set_sha256 {m['set_sha256'][:16]}… -> {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
