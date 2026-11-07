# Copyright (c) Meta Platforms, Inc. and affiliates.

"""One 2-row montage (port of Task C summary_sheet.py): row 1 TOP / LONG SIDE / END silhouette overlays; row 2 corner-pocket
plan, side-pocket plan, leg+cabinet elevation, whole-table heatmap. Output: <out>/summary-sheet.png."""
import os

from PIL import Image, ImageDraw, ImageFont

import paths
from overlays import FONT_PATH

BG = (14, 18, 24); FG = (235, 235, 235)


def _font(size):
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except OSError:
        return ImageFont.load_default()


def run(cfg, title_note="", log=print):
    OV = cfg.overlays; HM = cfg.heatmaps
    F = _font(34); FS = _font(26); FB = _font(44)
    row1 = [("TOP (x / y)", f"{OV}/top_overlay_1px_per_mm.png"), ("LONG SIDE  (x / z)", f"{OV}/side_overlay_1px_per_mm.png"), ("END  (y / z)", f"{OV}/end_overlay_1px_per_mm.png")]
    row2 = [("CORNER POCKET (+x+y) plan, 4 px/mm", f"{OV}/zoom_corner_pocket_plan_abovebed_4px_per_mm.png"),
            ("SIDE POCKET (+y) plan, 4 px/mm", f"{OV}/zoom_side_pocket_plan_abovebed_4px_per_mm.png"),
            ("LEG + CABINET elev, 2 px/mm", f"{OV}/zoom_leg_cabinet_side_elev_2px_per_mm.png")]
    if os.path.exists(f"{HM}/heat_whole_table.png"):
        row2.append(("WHOLE-TABLE heatmap 0-60 mm", f"{HM}/heat_whole_table.png"))
    def fit(path, h):
        im = Image.open(path).convert("RGB"); s = h / im.height; return im.resize((int(round(im.width * s)), h), Image.LANCZOS)
    H1, H2, PAD, TITLE = 640, 760, 40, 60
    r1 = [(t, fit(p, H1)) for t, p in row1]; r2 = [(t, fit(p, H2)) for t, p in row2]
    W = max(sum(im.width for _, im in r1) + PAD * (len(r1) + 1), sum(im.width for _, im in r2) + PAD * (len(r2) + 1))
    # D621-PLAN-2-RECORD: the title and the footer WRAP to the canvas width (a 40-char commit label used to clip
    # both at the right edge), and the header / footer bands grow with the line count
    def wrap_to(text, font, width):
        words, lines, cur = text.split(), [], ""
        for w in words:
            cand = (cur + " " + w).strip()
            if cur and font.getlength(cand) > width:
                lines.append(cur); cur = w
            else:
                cur = cand
        return lines + ([cur] if cur else [])
    title_lines = wrap_to(f"D621 alignment summary - OUR Diamond Pro-Am 8 ft export ({title_note}) vs the purchased 3dsky model, registered on bed plane z=770 + plan centre + long axis X", FB, W - 2 * PAD)
    footer_lines = wrap_to(f"Sources: {OV}/*.png, {HM}/heat_whole_table.png  |  numbers: {cfg.out}/ALIGNMENT.md  |  no purchased-model vertex data is embedded; these are rasterised silhouettes and distance fields only", FS, W - 2 * PAD)
    TL, FL = 50, 30                      # line pitches for the 44 px title font and the 26 px footer font
    ly = 24 + TL * len(title_lines) + 12  # legend row under the title
    HEAD = ly + 44
    FOOT = 30 + FL * len(footer_lines)
    canvas = Image.new("RGB", (W, HEAD + TITLE + H1 + PAD + TITLE + H2 + PAD + FOOT), BG); dr = ImageDraw.Draw(canvas)
    ty = 24
    for line in title_lines:
        dr.text((PAD, ty), line, fill=FG, font=FB); ty += TL
    lx = PAD
    for col, name in (((0, 190, 255), "model (purchased) fill"), ((255, 40, 200), "ours fill"), ((245, 245, 245), "overlap")):
        dr.rectangle([lx, ly, lx + 30, ly + 30], fill=col); dr.text((lx + 40, ly - 2), name, fill=FG, font=FS); lx += 40 + int(FS.getlength(name)) + 60
    dr.text((lx + 20, ly - 2), "grids: 100 mm (main views) / 50 mm (pocket zooms); heatmap: distance to the other surface, Oranges 0-60 mm, >60 dark", fill=(180, 180, 190), font=FS)
    y = HEAD; x = PAD
    for t, im in r1:
        dr.text((x, y), t, fill=FG, font=F); canvas.paste(im, (x, y + TITLE)); x += im.width + PAD
    y = HEAD + TITLE + H1 + PAD; x = PAD
    for t, im in r2:
        dr.text((x, y), t, fill=FG, font=F); canvas.paste(im, (x, y + TITLE)); x += im.width + PAD
    fy = canvas.height - FOOT + 10
    for line in footer_lines:
        dr.text((PAD, fy), line, fill=(180, 180, 190), font=FS); fy += FL
    canvas.save(os.path.join(cfg.out, "summary-sheet.png"), optimize=True)
    log(f"[summary_sheet] {canvas.size} -> {os.path.join(cfg.out, 'summary-sheet.png')}")
    return canvas.size


if __name__ == "__main__":
    cfg, a = paths.from_args(description=__doc__)
    run(cfg, title_note=cfg.label)
