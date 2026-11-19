#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""fourway_rox.py — Rasson OX A2 four-way sheets: ours | purchased-OX at the SAME eye | photo | previous generic.

One sheet per register pose (A2-PLAN §5, ruling A2-5). Panels:
  A  OURS — the live app through the register camera (capture_rox_registers.mjs), eye = register (or EN-07-carried, stated)
  B  PURCHASED OX — the quarantine study render of the same register (Blender Workbench clay, A1) or the clay-rig
     render of the OBJ through the identical camera (clay_render.mjs); a STUDY ARTEFACT, permitted on Drive, never in the repo
  C  PHOTO — an endorsed dossier frame (broadcast / official / showroom), gestalt-only unless a cammatch is named
  D  PREVIOUS — the main-tree generic 9-ft table rendered under the rox style before A2 (the red-arm baseline)
Every panel prints its file name and sha256; the READ is pinned to those hashes (a READ written against other inputs
refuses to print — the sidebyside_rox law). Output: SVG + PNG-composited sheet per pose; the SVG embeds nothing binary
(it references the PNG the tool writes beside it).

Usage: python3 tools/render/ghrox/fourway_rox.py --ours DIR --model DIR --prev DIR --photos photos.json --reads reads.json \
       --registers register-cameras.json --out DIR [--poses a,b] [--tag A2-rN]
photos.json: {pose: {"file": "<abs path>", "credit": "...", "match": "gestalt" | "cammatch:<id>"}}
reads.json:  {pose: {"read": "...", "pins": {"ours": sha, "model": sha, "photo": sha, "prev": sha}}}

REFUSAL ARM (r9b, blocker B1): every panel image is measured before it is pasted. A panel whose luma standard
deviation over a 160-px downsample is below --min-std (default 1.0) is a FLAT canvas, not a picture; the sheet is
stamped BLANK PANEL, the READ is refused, and the tool exits non-zero. In r9 thirteen sheets shipped with an empty
purchased-model panel B and the tool said nothing. --allow-blank disarms it for a deliberate red-arm demonstration
only, and stamps that fact into the manifest and onto every sheet.
"""
import argparse, hashlib, json, os, sys, time
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

def luma_std(img):
    """Luma mean/std over a 160-px downsample — the blank-panel detector (B1 refusal arm)."""
    im = img.convert("RGB").copy()
    im.thumbnail((160, 160))
    px = list(im.getdata())
    n = len(px)
    ls = [0.2126 * r + 0.7152 * g + 0.0722 * b for r, g, b in px]
    m = sum(ls) / n
    return m, (sum((v - m) ** 2 for v in ls) / n) ** 0.5

def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def font(sz, bold=False):
    for cand in (["/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
                  "/System/Library/Fonts/Helvetica.ttc"]):
        try:
            return ImageFont.truetype(cand, sz)
        except Exception:
            continue
    return ImageFont.load_default()

def fit(img, w, h, bg=(238, 238, 238)):
    im = ImageOps.contain(img.convert("RGB"), (w, h))
    canvas = Image.new("RGB", (w, h), bg)
    canvas.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
    return canvas, im.size

def levels(img, lo=0.02, hi=0.98):
    """Presentation-only tone stretch for the dark venue-rig elevations (declared on the panel)."""
    g = img.convert("L"); hist = g.histogram(); n = sum(hist); acc = 0; a = 0; b = 255
    for i, c in enumerate(hist):
        acc += c
        if acc >= n * lo: a = i; break
    acc = 0
    for i in range(255, -1, -1):
        acc += hist[i]
        if acc >= n * (1 - hi): b = i; break
    if b <= a + 8: return img, (a, b)
    return img.point(lambda v, a=a, b=b: max(0, min(255, int((v - a) * 255 / (b - a))))), (a, b)

def wrap(draw, text, fnt, width):
    words = text.split(); lines = []; cur = ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=fnt) <= width: cur = t
        else: lines.append(cur); cur = w
    if cur: lines.append(cur)
    return lines

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ours", required=True); ap.add_argument("--model", required=True); ap.add_argument("--prev", required=True)
    ap.add_argument("--photos", required=True); ap.add_argument("--reads", required=True); ap.add_argument("--registers", required=True)
    ap.add_argument("--out", required=True); ap.add_argument("--poses", default=None); ap.add_argument("--tag", default="A2")
    ap.add_argument("--stretch", default="elev_side,elev_end,elev_pedestal,elev_rail_end,under_plan",
                    help="poses whose OURS/PREV panels get a declared presentation levels-stretch (dark venue rig)")
    ap.add_argument("--min-std", type=float, default=1.0, help="B1 refusal arm: a panel flatter than this is BLANK")
    ap.add_argument("--allow-blank", action="store_true", help="red-arm demonstration only: render blank panels anyway")
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    if Path(a.out).resolve().is_relative_to(Path(__file__).resolve().parents[3]):
        sys.exit("REFUSED: --out must be outside the repository (packs live on Drive, never in the tree)")
    reg = json.load(open(a.registers)); shots = {s["name"]: s for s in reg["shots"]}
    photos = json.load(open(a.photos)); reads = json.load(open(a.reads))
    poses = a.poses.split(",") if a.poses else list(shots)
    stretch = set(a.stretch.split(","))
    PW, PH = 640, 480; M = 24; CAP = 92; TITLE = 96; READ_H = 150
    W = M + 4 * (PW + M); H = TITLE + PH + CAP + READ_H + M
    manifest = {"tag": a.tag, "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "sheets": {}}
    f_t, f_b, f_c, f_r = font(26, True), font(17, True), font(13), font(15)
    blanks = []
    for pose in poses:
        s = shots[pose]
        panels = []
        for key, d, label in (("ours", a.ours, "A · OURS (live app, register camera)"), ("model", a.model, "B · PURCHASED OX (same eye — study artefact)"),
                              ("photo", None, "C · PHOTO (endorsed frame)"), ("prev", a.prev, "D · PREVIOUS generic 9-ft under the rox style")):
            if key == "photo":
                ph = photos.get(pose); p = ph["file"] if ph else None; note = (ph.get("credit", "") + " · " + ph.get("match", "gestalt")) if ph else "no endorsed frame for this pose"
            else:
                p = str(Path(d) / f"{pose}.png"); note = ""
                if not Path(p).exists(): p = None
            if p and Path(p).exists():
                img = Image.open(p); ext = ""
                pm, ps = luma_std(img)
                if ps < a.min_std:
                    blanks.append((pose, key, Path(p).name, round(pm, 2), round(ps, 4)))
                    ext = f" · BLANK PANEL — luma mean {pm:.1f} std {ps:.3f} < --min-std {a.min_std}"
                if key in ("ours", "prev") and pose in stretch:
                    img, (lo, hi) = levels(img); ext += f" · levels {lo}..{hi}→0..255 (presentation only)"
                tile, size = fit(img, PW, PH); h = sha(p)
                panels.append((label, tile, f"{Path(p).name} · sha256 {h[:12]} · {Image.open(p).size[0]}×{Image.open(p).size[1]} · luma std {ps:.2f}{ext}", note, h))
            else:
                tile = Image.new("RGB", (PW, PH), (225, 225, 225)); dd = ImageDraw.Draw(tile); dd.text((20, PH // 2 - 10), "— not available —", fill=(120, 0, 0), font=f_b)
                panels.append((label, tile, "(missing)", note, None))
        sheet = Image.new("RGB", (W, H), (250, 250, 250)); dr = ImageDraw.Draw(sheet)
        eye = f"register {pose} · {s['kind']} · " + (f"width {s['width_m']} m ({s['px_per_m']:.0f} px/m)" if s["kind"] == "ortho" else f"lens {s['lens_mm']} mm") + f" · res {s['res'][0]}×{s['res'][1]} · cam {s['cam']} look {s['look']} up {s['up']} (purchased-model frame, m)"
        dr.text((M, 18), f"OB-ROX-GEO-001 {a.tag} · FOUR-WAY · {pose}", fill=(20, 20, 20), font=f_t)
        dr.text((M, 56), eye, fill=(70, 70, 70), font=f_c)
        dr.text((W - 560, 18), "STUDY ARTEFACT — never into repo/pack; panel B is the purchased model", fill=(140, 0, 0), font=f_c)
        x = M
        for label, tile, cap, note, _ in panels:
            dr.text((x, TITLE - 24), label, fill=(20, 20, 20), font=f_b)
            sheet.paste(tile, (x, TITLE)); dr.rectangle([x - 1, TITLE - 1, x + PW, TITLE + PH], outline=(160, 160, 160))
            yy = TITLE + PH + 6
            for ln in wrap(dr, cap, f_c, PW): dr.text((x, yy), ln, fill=(60, 60, 60), font=f_c); yy += 16
            for ln in wrap(dr, note, f_c, PW)[:3]: dr.text((x, yy), ln, fill=(90, 60, 0), font=f_c); yy += 16
            x += PW + M
        # READ — pinned to the four input hashes
        ry = TITLE + PH + CAP + 8
        dr.text((M, ry), "READ (written after opening this sheet)", fill=(20, 20, 20), font=f_b); ry += 26
        rd = reads.get(pose); pins_now = {k: (panels[i][4] or "") for i, k in enumerate(("ours", "model", "photo", "prev"))}
        pose_blank = [b for b in blanks if b[0] == pose]
        if pose_blank:
            dr.text((M, ry), "READ REFUSED — blank panel(s): " + ", ".join(f"{b[1]} (std {b[4]})" for b in pose_blank)
                    + ". Nothing was drawn through this camera; a read written against it would be void.",
                    fill=(180, 0, 0), font=f_r)
            status = "refused-blank"
        elif rd and all(rd.get("pins", {}).get(k, "") == pins_now[k] for k in pins_now):
            for ln in wrap(dr, rd["read"], f_r, W - 2 * M)[:6]: dr.text((M, ry), ln, fill=(30, 30, 30), font=f_r); ry += 20
            status = "pinned"
        elif rd:
            dr.text((M, ry), "READ REFUSED — it was written against different inputs (pins moved); re-open the sheet and re-write it.", fill=(160, 0, 0), font=f_r); status = "refused"
        else:
            dr.text((M, ry), "NO READ YET — open the sheet, write the read into reads.json with these pins.", fill=(160, 0, 0), font=f_r); status = "missing"
        dr.text((M, H - 22), f"generator fourway_rox 1.0.0 · ours/prev = capture_rox_registers.mjs · model = clay_render.mjs or the A1 quarantine study render · photo = dossier-rasson-9ft · pins: " + " ".join(f"{k}={v[:8] or '-'}" for k, v in pins_now.items()), fill=(110, 110, 110), font=f_c)
        if a.allow_blank:
            dr.text((W - 560, 56), "RED-ARM DEMO: --allow-blank is set; blank panels were NOT refused", fill=(180, 0, 0), font=f_c)
        fn = out / f"fourway-rox-{a.tag}-{pose}.png"; sheet.save(fn)
        manifest["sheets"][pose] = {"file": str(fn), "pins": pins_now, "read": status, "eye": eye}
        print(f"{pose}: {fn.name} read={status}")
    manifest["arms"] = {"min_std": a.min_std, "allow_blank": a.allow_blank,
                        "blank_panels": [{"pose": b[0], "panel": b[1], "file": b[2], "luma_mean": b[3], "luma_std": b[4]} for b in blanks]}
    json.dump(manifest, open(out / "fourway-manifest.json", "w"), indent=1)
    if blanks and not a.allow_blank:
        for b in blanks:
            print(f"BLANK PANEL {b[0]}/{b[1]}: {b[2]} luma mean {b[3]} std {b[4]} < --min-std {a.min_std}", file=sys.stderr)
        sys.exit(f"FOURWAY REFUSED — {len(blanks)} blank panel(s); a sheet with an empty half proves nothing")
    print(f"FOURWAY OK — {len(poses)} sheet(s), 0 blank panels (arm --min-std {a.min_std})")

if __name__ == "__main__":
    main()
