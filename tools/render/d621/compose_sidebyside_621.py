#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""compose_sidebyside_621.py — D621 three-panel side-by-side sheets (labelled or BLIND).

One sheet per pose: LEFT = our render, MIDDLE = the purchased-model study
render, RIGHT = a photograph (factory / dealer / broadcast frame). The sheets
are review material for the D621 Diamond Pro-Am look pass; they stay OUT of
the repo (reference-pixels law) — only this compositor is committed.

Two modes, same panel order, same source pixels:

  labelled  title row, three panel labels ("OURS", "PURCHASED MODEL",
            "FACTORY / DOSSIER" + file names) and one caption sentence.
            This is the owner-facing sheet.

  --blind   PANELS ONLY. No title, no panel labels, no caption, no file
            names, no text of any kind: three images on a plain background,
            fixed 560 px height each, 15 px gaps. This is what the review
            judge sees. The earlier ad-hoc "blind" sheets kept the title and
            the panel labels, so the judge was told which panel was ours;
            this mode exists to cure that. Which panel is which is stated in
            manifest.json, not on the sheet.

Poses JSON (list): {id, ours, photo, photo_note, [photo_label], [az_deg], [photo_override:
{path, note}]}. `photo_label` replaces the RIGHT panel's 'PHOTO / DOSSIER' prefix (D621-PLAN-3-RECORD:
a marketing hero that may be a render is labelled MARKETING, not PHOTO). `photo_override` replaces the RIGHT panel (and its note) for
that pose — e.g. r7_overhead, whose dossier "photo" was an isometric
dimension drawing and not a photograph. The model render for pose <id> is
<renders>/<id>-tint.png. Captions JSON: {id: sentence} (labelled mode only).
Committed pose paths use placeholders: <drive>/... is the project Drive folder (--drive-root, default
OB_DRIVE_DIR) and <worktree>/... the checkout whose output/ holds the frames (--worktree-root, default
this checkout).

manifest.json records the mode, the panel order, and per sheet the sha256 of
the sheet and of each source image plus the source paths.

Usage:
  compose_sidebyside_621.py --poses P.json --captions C.json --renders DIR --out DIR [--blind]
                            [--drive-root DIR] [--worktree-root DIR]
"""
import argparse
import datetime as dt
import hashlib
import json, math
import os
import sys
import textwrap

from PIL import Image, ImageDraw, ImageFont

PANEL_H = 560          # both modes
BLIND_GAP = 15         # blind: gap between panels and outer margin
LABELLED_PAD = 16      # labelled: today's sheet geometry
LABELLED_MAXW = 900    # labelled: width cap per panel (today's sheet)
BG_LABELLED = (12, 12, 14)
BG_BLIND = (24, 24, 26)
PANEL_ORDER = [
    "left: ours (our renderer, the pose's `ours` frame)",
    "middle: purchased model study render (<renders>/<id>-tint.png)",
    "right: photograph (`photo`, or `photo_override.path` when present)",
]
FONT_CANDIDATES = [
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_font(size):
    for cand in FONT_CANDIDATES:
        if os.path.exists(cand):
            return ImageFont.truetype(cand, size)
    return ImageFont.load_default()


def fit(img, h, maxw=None):
    """Resize to height h (optionally capped at maxw wide, today's labelled rule)."""
    w = int(round(img.width * h / img.height))
    if maxw is not None and w > maxw:
        h = int(round(h * maxw / w))
        w = maxw
    return img.convert("RGB").resize((w, h), Image.LANCZOS)


def right_panel(pose):
    """Photo path + note; `photo_override` wins over `photo`."""
    ov = pose.get("photo_override")
    if ov:
        if not ov.get("path"):
            raise SystemExit(f"{pose['id']}: photo_override without a path")
        return ov["path"], ov.get("note", ""), True
    return pose["photo"], pose.get("photo_note", ""), False


TITLE = "D621-LOOK-2"
CHECKOUT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


def resolve(path, pid, label, drive_root, worktree_root):
    """A committed pose path with its placeholder resolved: <drive>/ under the Drive root, <worktree>/ under the checkout
    (a relative root resolves against the caller's cwd)."""
    for token, root, flag in (("<drive>/", drive_root, "--drive-root DIR or OB_DRIVE_DIR"), ("<worktree>/", worktree_root, "--worktree-root DIR")):
        if path.startswith(token):
            if not root:
                raise SystemExit(f"{pid}: {label} {path} needs {flag}")
            return os.path.join(os.path.abspath(root), path[len(token):])
    if path.startswith("<"):
        raise SystemExit(f"{pid}: {label} {path}: unknown path placeholder")
    return path


def prev_path(ours_path, prev_root):
    """Map an OURS frame path to its snapshot under prev_root: .../output/d621/<size>/registers/<f>
    -> <prev_root>/registers-<size>/<f>; .../8ft/orbit/pack-v5/<rel> -> <prev_root>/pack-v5/<rel>."""
    if not prev_root:
        return None
    parts = ours_path.split(os.sep)
    if "registers" in parts:
        i = parts.index("registers")
        return os.path.join(prev_root, f"registers-{parts[i - 1]}", *parts[i + 1:])
    if "pack-v5" in parts:
        i = parts.index("pack-v5")
        return os.path.join(prev_root, "pack-v5", *parts[i + 1:])
    return None


def compose_blind(ours, model, photo):
    panels = [fit(im, PANEL_H) for im in (ours, model, photo)]
    W = sum(p.width for p in panels) + BLIND_GAP * (len(panels) + 1)
    H = PANEL_H + BLIND_GAP * 2
    sheet = Image.new("RGB", (W, H), BG_BLIND)
    x = BLIND_GAP
    for p in panels:
        sheet.paste(p, (x, BLIND_GAP))
        x += p.width + BLIND_GAP
    return sheet


def apply_gain(im, gain):
    """Linear brightness gain (clamped) on the OURS panel — for a register whose
    seal exposure hides what the caption names (D621-LOOK-3: r8 legs). Stated on
    the labelled sheet and in the manifest; the blind sheet carries it silently
    (the judge is told to ignore lighting)."""
    if not gain or abs(gain - 1.0) < 1e-6:
        return im
    return im.point(lambda v: min(255, int(round(v * gain))))


def compose_labelled(pose, ours, model, photo, photo_path, photo_note, caption, fonts, prev=None, prev_label=""):
    font, small, bold = fonts
    pad = LABELLED_PAD
    panels = [
        (fit(ours, PANEL_H, LABELLED_MAXW),
         f"OURS — diamond_proam_8ft  ({os.path.basename(pose['ours'])})"
         + (f"  · shown at ×{float(pose['gain']):g} gain (+{math.log2(float(pose['gain'])):.1f} EV) for legibility"
            if pose.get("gain") and abs(float(pose["gain"]) - 1.0) > 1e-6 else "")),
        (fit(model, PANEL_H, LABELLED_MAXW),
         'PURCHASED MODEL — 3dsky "Diamond Pro-Am 8ft", study render '
         "(quarantine; family-tinted, neutral light; NOT our GI)"),
        (fit(photo, PANEL_H, LABELLED_MAXW),
         f"{pose.get('photo_label', 'PHOTO / DOSSIER')} — {photo_note}  [{os.path.basename(photo_path)}]"),
    ]
    if prev is not None:
        panels.append((fit(prev, PANEL_H, LABELLED_MAXW), prev_label))
    lines = textwrap.wrap(caption, 150) if caption else []
    W = sum(im.width for im, _ in panels) + pad * (len(panels) + 1)
    H = PANEL_H + 70 + 30 * (len(lines) + 1) + 40
    sheet = Image.new("RGB", (W, H), BG_LABELLED)
    d = ImageDraw.Draw(sheet)
    title = f"{TITLE} · pose {pose['id']}"
    if "az_deg" in pose:
        title += f"  · az {pose['az_deg']}°"
    d.text((pad, 10), title, font=bold, fill=(235, 230, 220))
    x = pad
    for im, label in panels:
        sheet.paste(im, (x, 50))
        for i, l in enumerate(textwrap.wrap(label, max(30, im.width // 9))):
            d.text((x, 50 + PANEL_H + 6 + 20 * i), l, font=small, fill=(170, 170, 175))
        x += im.width + pad
    y = 50 + PANEL_H + 6 + 20 * 3 + 12
    for l in lines:
        d.text((pad, y), l, font=font, fill=(240, 240, 240))
        y += 30
    return sheet


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--poses", required=True)
    ap.add_argument("--captions", required=True)
    ap.add_argument("--renders", required=True, help="dir holding <id>-tint.png model renders")
    ap.add_argument("--out", required=True)
    ap.add_argument("--blind", action="store_true", help="panels only: no title, labels, caption or file names")
    ap.add_argument("--title", default="D621-LOOK-2", help="sheet title prefix (labelled mode)")
    ap.add_argument("--prev-root", default=None,
                    help="D621-ALIGN four-way sheets: a snapshot root holding the PREVIOUS seal's frames "
                         "(registers-<size>/... and pack-v5/...); adds a 4th panel 'PREVIOUS (D621-LOOK-3)'")
    ap.add_argument("--prev-label", default="PREVIOUS — D621-LOOK-3 seal (a39f14cd)")
    ap.add_argument("--drive-root", default=os.environ.get("OB_DRIVE_DIR"),
                    help="the project Drive folder for <drive>/ paths (default: OB_DRIVE_DIR)")
    ap.add_argument("--worktree-root", default=CHECKOUT, help="the checkout for <worktree>/ paths (default: this checkout)")
    args = ap.parse_args()
    global TITLE
    TITLE = args.title

    poses = json.load(open(args.poses))
    captions = json.load(open(args.captions))
    os.makedirs(args.out, exist_ok=True)
    fonts = None if args.blind else (load_font(22), load_font(17), load_font(26))

    sheets = []
    for pose in poses:
        pid = pose["id"]
        model_path = os.path.join(args.renders, f"{pid}-tint.png")
        photo_path, photo_note, overridden = right_panel(pose)
        ours_path = resolve(pose["ours"], pid, "ours", args.drive_root, args.worktree_root)
        photo_path = resolve(photo_path, pid, "photo", args.drive_root, args.worktree_root)
        for label, path in (("ours", ours_path), ("model render", model_path), ("photo", photo_path)):
            if not os.path.isfile(path):
                raise SystemExit(f"{pid}: missing {label}: {path}")
        ours = Image.open(ours_path)
        gain = float(pose.get("gain") or 1.0)
        ours = apply_gain(ours, gain)
        model = Image.open(model_path)
        photo = Image.open(photo_path)
        pv_path = prev_path(ours_path, args.prev_root)
        prev = None
        if pv_path:
            if not os.path.exists(pv_path):
                raise SystemExit(f"{pid}: previous frame missing: {pv_path}")
            prev = Image.open(pv_path)
            if pose.get("gain") and abs(float(pose["gain"]) - 1.0) > 1e-6:
                prev = apply_gain(prev, float(pose["gain"]))
        if args.blind:
            sheet = compose_blind(ours, model, photo)
        else:
            sheet = compose_labelled(pose, ours, model, photo, photo_path, photo_note,
                                     captions.get(pid, "(caption pending)"), fonts,
                                     prev=prev, prev_label=args.prev_label)
        fn = os.path.join(args.out, f"{pid}.png")
        sheet.save(fn)
        sheets.append({
            "pose": pid,
            "sheet": os.path.basename(fn),
            "sha256": sha256_file(fn),
            "size_px": list(sheet.size),
            "sources": {
                "left_ours": {"path": ours_path, "sha256": sha256_file(ours_path)},
                "middle_model_render": {"path": model_path, "sha256": sha256_file(model_path)},
                "previous": ({"path": pv_path, "sha256": sha256_file(pv_path)} if pv_path else None),
                "right_photo": {"path": photo_path, "sha256": sha256_file(photo_path),
                                "note": photo_note, "photo_override": overridden},
                              "gain": float(pose.get("gain") or 1.0),
            },
        })
        print(f"{pid}: {sheet.size[0]}x{sheet.size[1]} -> {fn}")

    manifest = {
        "tool": "tools/render/d621/compose_sidebyside_621.py",
        "mode": "blind" if args.blind else "labelled",
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "panel_order": PANEL_ORDER,
        "panel_height_px": PANEL_H,
        "gap_px": BLIND_GAP if args.blind else LABELLED_PAD,
        "text_on_sheet": False if args.blind else True,
        "poses_file": os.path.abspath(args.poses),
        "captions_file": os.path.abspath(args.captions),
        "renders_dir": os.path.abspath(args.renders),
        "sheets": sheets,
    }
    with open(os.path.join(args.out, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
    print(f"{len(sheets)} sheets ({manifest['mode']}) -> {args.out}")


if __name__ == "__main__":
    sys.exit(main())
