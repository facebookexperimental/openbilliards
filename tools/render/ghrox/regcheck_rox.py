#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Objective registration check for the OX A1 side-by-sides.

`sidebyside_rox.py` puts the drawing and the purchased-model study render in the same window at
the same scale, and a human read says whether they look like the same table.  A look is not a
measurement, so this file measures instead: it finds the render's own silhouette in pixels,
converts it back to model millimetres through the register camera, and compares it with the
station values the canonical JSON publishes.  A station measured off the purchased model must
come back out of an independent orthographic render of that model; if it does not, either the
station is wrong or the side-by-side is misregistered, and both are findings.

What it does NOT measure, deliberately: the cushion nose line in ELEVATION.  Seen from the side
the nose is a shading gradient several pixels wide, not an edge, so any "nose" a threshold finds
there is a lighting artefact.  Seen from directly above it is a different thing: the rail cap
ends and the cushion cloth begins on a 1-2 px dark line, so `plan_sights` can and does check the
rail band (RB-03m).  The silhouette against a flat backdrop is likewise unambiguous to about one
pixel (0.78-1.67 mm depending on the shot).

Red-arm history, because a checker that cannot fail is not a check: mutating the record and
re-running must turn a row OUT.  EN-06 length +9 mm and RB-09b sight x +4 mm were caught on the
first pass; RB-09b.abs_y_centre_mm +25 mm was NOT, because that leaf only positioned the scan
band and was never itself compared.  The sight-row and rail-band rows below close that hole.
EN-06.bed_top_z was the last leaf of that class and is now compared too (see the elev_side block).

Three more ways this file used to be able to print full marks while measuring nothing, all closed
below and all of them the same mistake -- letting the value under test decide what it is compared
against, or letting a mismatch leave no mark:

  * the rail-band boundaries were bound to detected lines by NEAREST NEIGHBOUR.  The crop shows
    two full-width lines 47 mm apart, so an RB-03m.long_mm that was 45-49 mm wrong just re-snapped
    the published nose onto the cap line and every row stayed green.  Binding is now by ORDER
    (outward -> inward from the silhouette edge), which cannot re-match, and the ordering itself
    is a check.
  * published sights whose x fell outside the crop were filtered out silently -- no row, no red,
    no note -- and the summary still counted full marks over what was left.  The row count is now
    asserted against the record.
  * notes ending "<-- UNEXPLAINED" were printed and then ignored.  An unexplained detected feature
    is the signal that the model or the document has moved, so it now fails the run.

Structural results of that kind are printed as CHECKS under the measurement rows; they carry the
same "<-- OUT" marker so the red-arm harness sees them, and they count towards the exit code.

Reads only the quarantined study renders (measurement reference, never into the repo) and the
canonical JSON.  It carries no geometry of its own: every expected value is read from the record.

  python3 tools/render/ghrox/regcheck_rox.py
"""

from __future__ import annotations

import argparse
import math
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_drawing_rox as G   # noqa: E402

try:
    from PIL import Image
except ImportError:                                    # pragma: no cover
    print("regcheck needs Pillow (python3 -m pip install pillow)")
    raise


class Cam:
    """One register camera as an ortho projection between model mm and pixels."""

    def __init__(self, shot: dict):
        self.name = shot["name"]
        self.w, self.h = shot["res"]
        self.ppm = shot["px_per_m"] / 1000.0            # px per mm
        cam, up = shot["cam"], shot["up"]
        # plan shots look down +Z with up = +Y; elevation shots look along +Y with up = +Z.
        self.plan = abs(up[2]) < 0.5
        self.ca = cam[0] * 1000.0
        self.cb = (cam[1] if self.plan else cam[2]) * 1000.0

    # a_of / b_of take CONTINUOUS image coordinates, where integer c is the boundary between
    # pixel c-1 and pixel c and a pixel's centre is at index + 0.5.  Mixing the two conventions
    # is a half-pixel bias, which is 0.39 mm on the sight camera and would look like a real
    # station error.
    def a_of(self, c: float) -> float:
        return self.ca + (c - self.w / 2.0) / self.ppm

    def b_of(self, c: float) -> float:
        return self.cb + (self.h / 2.0 - c) / self.ppm

    def py_of(self, b: float) -> int:
        return int(round(self.h / 2.0 - (b - self.cb) * self.ppm))


class Frame:
    """A render plus its flat backdrop level, so 'is this pixel the table' is one comparison."""

    def __init__(self, path: Path, tol: int = 10):
        im = Image.open(path).convert("L")
        self.w, self.h = im.size
        self.px = im.load()
        corners = [self.px[2, 2], self.px[self.w - 3, 2],
                   self.px[2, self.h - 3], self.px[self.w - 3, self.h - 3]]
        self.bg = sorted(corners)[len(corners) // 2]
        # only the silhouette tests need a flat backdrop; a tight crop like plan_sights sits on
        # the table in two corners and is only ever used for the dark-mark test, so the refusal
        # is raised where the assumption is actually used rather than at load.
        self.flat = (max(corners) - min(corners)) <= 3
        self.corners = corners
        self.name = path.name
        self.tol = tol

    def _require_flat(self) -> None:
        if not self.flat:
            raise SystemExit(f"{self.name}: backdrop is not flat (corners {self.corners}) — "
                             f"the silhouette test needs a flat backdrop")

    def solid(self, x: int, y: int) -> bool:
        return abs(self.px[x, y] - self.bg) > self.tol

    def span_x(self, y: int) -> tuple[float, float]:
        """The outer boundaries of the table on one scanline, in continuous image coordinates."""
        self._require_flat()
        lo = next((x for x in range(self.w) if self.solid(x, y)), None)
        hi = next((x for x in range(self.w - 1, -1, -1) if self.solid(x, y)), None)
        if lo is None or hi is None:
            raise SystemExit(f"scanline y={y} has no table pixels")
        return float(lo), float(hi + 1)

    def span_y(self, x: int) -> tuple[float, float]:
        self._require_flat()
        lo = next((y for y in range(self.h) if self.solid(x, y)), None)
        hi = next((y for y in range(self.h - 1, -1, -1) if self.solid(x, y)), None)
        if lo is None or hi is None:
            raise SystemExit(f"scan column x={x} has no table pixels")
        return float(lo), float(hi + 1)

    def widest_x(self, y0: int, y1: int) -> tuple[float, float]:
        """The widest the silhouette gets over a band of scanlines — the envelope, rather than
        whatever one arbitrary row happens to cut through."""
        lo, hi = None, None
        for y in range(y0, y1):
            try:
                a, b = self.span_x(y)
            except SystemExit:
                continue
            lo = a if lo is None else min(lo, a)
            hi = b if hi is None else max(hi, b)
        if lo is None:
            raise SystemExit(f"band y={y0}..{y1} has no table pixels")
        return lo, hi

    def extreme_y(self) -> tuple[float, float]:
        """Topmost and bottommost table pixel anywhere in the frame."""
        self._require_flat()
        top = next((y for y in range(self.h)
                    if any(self.solid(x, y) for x in range(self.w))), None)
        bot = next((y for y in range(self.h - 1, -1, -1)
                    if any(self.solid(x, y) for x in range(self.w))), None)
        if top is None:
            raise SystemExit("frame has no table pixels")
        return float(top), float(bot + 1)

    def top_edge(self, x0: int, x1: int) -> float:
        """First non-backdrop row scanning down, median over a range of columns.

        Unlike span_y this only assumes the TOP of the frame is backdrop, so it works on a tight
        crop like plan_sights whose lower corners sit on the table."""
        bg = min(self.px[2, 2], self.px[self.w - 3, 2])
        rows = []
        for x in range(x0, x1, 7):
            y = next((y for y in range(self.h) if abs(self.px[x, y] - bg) > self.tol), None)
            if y is not None:
                rows.append(float(y))
        if not rows:
            raise SystemExit(f"{self.name}: no top edge in columns {x0}..{x1}")
        return sorted(rows)[len(rows) // 2]

    def dark_runs(self, x0: int, x1: int, y0: int, y1: int) -> list[tuple[float, float, int]]:
        """Contiguous bands of dark rows in a column window, as (top, bottom, ink) in continuous
        image coordinates, heaviest first.

        A sight is a diamond OUTLINE, so its centre is the midpoint of its extent, not the
        centroid of its ink: the ink is all on the edges and any full-width rail line that shares
        the window drags a centroid off by ~10 mm.  Grouping into runs and taking the heaviest
        separates the mark from the rail lines instead of averaging them together."""
        band = sorted(self.px[x, y] for x in range(0, self.w, 3) for y in range(y0, y1, 3))
        cut = band[len(band) // 2] - 5
        ink = {y: sum(1 for x in range(x0, x1) if self.px[x, y] < cut) for y in range(y0, y1)}
        runs: list[list[int]] = []
        for y in sorted(k for k, v in ink.items() if v):
            if runs and y - runs[-1][-1] <= 2:
                runs[-1].append(y)
            else:
                runs.append([y])
        out = [(float(r[0]), float(r[-1] + 1), sum(ink[y] for y in r)) for r in runs]
        return sorted(out, key=lambda t: -t[2])

    def dark_lines_y(self, y0: int, y1: int, depth: float = 6.0) -> list[float]:
        """Midpoints of every dark line that runs the full width of a band, top to bottom.

        In plan the rail cap shows more than one such line — the cap's inner face and the
        rail/cushion boundary both read as 1-2 px darker than the surfaces either side — so this
        returns all of them and the caller matches them to published boundaries.  Each line is
        located at the half-depth width of its own local minimum, which is stable to a fraction
        of a pixel and does not care that the rail and the cloth are only ~17 levels apart."""
        mean = {y: sum(self.px[x, y] for x in range(0, self.w, 7)) / len(range(0, self.w, 7))
                for y in range(y0, y1)}
        out: list[float] = []
        y = y0 + 1
        while y < y1 - 1:
            if not (mean[y] <= mean[y - 1] and mean[y] < mean[y + 1]):
                y += 1
                continue
            # plateau = the brighter shoulder on each side, so a line on a slope still resolves.
            left = max(mean[k] for k in range(max(y0, y - 12), y))
            right = max(mean[k] for k in range(y + 1, min(y1, y + 13)))
            if min(left, right) - mean[y] < depth:
                y += 1
                continue
            cut = (mean[y] + min(left, right)) / 2.0
            top = bot = y
            while top - 1 >= y0 and mean[top - 1] < cut:
                top -= 1
            while bot + 1 < y1 and mean[bot + 1] < cut:
                bot += 1
            if bot - top <= 6:
                out.append((top + bot + 1) / 2.0)
            y = bot + 1
        return out

    def dark_clusters(self, y0: int, y1: int, min_w: int = 8) -> list[float]:
        """Centroids of the dark marks in a horizontal band — the rendered sight diamonds.

        The diamonds are line-art on a flat rail only a few levels darker than it, so the
        threshold is taken from the band's own median rather than fixed, and the centroid is
        weighted by how dark each column is so a thin outline still resolves to its centre."""
        band = [self.px[x, y] for x in range(0, self.w, 3) for y in range(y0, y1, 3)]
        rail = sorted(band)[len(band) // 2]
        cut = rail - 5
        weight = [sum(max(0, rail - self.px[x, y]) for y in range(y0, y1) if self.px[x, y] < cut)
                  for x in range(self.w)]
        runs, run = [], None
        for x, wgt in enumerate(weight):
            if wgt > 0:
                run = [x, x] if run is None else [run[0], x]
            elif run is not None:
                runs.append(run)
                run = None
        if run is not None:
            runs.append(run)
        out = []
        for a, b in runs:
            if b - a + 1 < min_w:
                continue
            tot = sum(weight[x] for x in range(a, b + 1))
            out.append(sum((x + 0.5) * weight[x] for x in range(a, b + 1)) / tot)
        return out


def bind_rail_lines(cam, y_out: float, lines: list[float],
                    published: list[tuple[str, float, str]]
                    ) -> tuple[dict[str, float], list[tuple[str, bool, str]], list[str]]:
    """Bind each published rail boundary to a SPECIFIC detected line, by order.

    Crossing the rail from its outer edge inward, the record publishes the boundaries in one fixed
    sequence, and `dark_lines_y` scans the band in that same direction, so the i-th detected line
    IS the i-th published boundary.  Nothing about the values under test takes part in the
    binding, which is the whole point: the previous version bound by nearest neighbour, and with
    the two lines 47 mm apart a published nose that was 45-49 mm wrong simply re-snapped onto the
    cap line and the harness still printed full marks — a check whose answer depends on the value
    it is checking is not a check.

    The tolerance is applied AFTER the binding, by the rows this returns: a line bound by order
    and further than --tol from the boundary it is bound to is an OUT row, never a licence to go
    looking for a closer line.  Returns (bound, checks, notes)."""
    checks = [("plan_sights  full-width rail lines found = boundaries published",
               len(lines) == len(published),
               f"{len(lines)} detected, {len(published)} published")]
    seq = [y_out] + list(lines)
    checks.append(("plan_sights  rail lines in order, outward -> inward",
                   all(seq[i] < seq[i + 1] for i in range(len(seq) - 1)),
                   " > ".join(f"{cam.b_of(v):.1f}" for v in seq) + " mm"))
    bound = {label: lines[i] for i, (label, _, _) in enumerate(published) if i < len(lines)}
    for label, _, _ in published:
        if label not in bound:
            checks.append((f"plan_sights  a line to bind to for the {label}", False,
                           "no detected line in that position in the sequence"))
    notes = [f"plan_sights: full-width rail line at y = {cam.b_of(ln):.1f} mm sits inboard of "
             "every published boundary, so nothing binds to it  <-- UNEXPLAINED"
             for ln in lines[len(published):]]
    return bound, checks, notes


def finite_positive_mm(text: str) -> float:
    """argparse type for --tol: a finite, strictly positive number of millimetres."""
    try:
        v = float(text)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"--tol must be a number of mm, got {text!r}") from exc
    if not math.isfinite(v) or v <= 0.0:
        raise argparse.ArgumentTypeError(f"--tol must be finite and > 0 mm, got {text!r} (nan never fails a row, "
                                         f"inf never fails a row)")
    return v


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", default="docs/geometry/rasson-ox-9ft-table-definition.json")
    ap.add_argument("--renders", default="/tmp/ob-3dm-quarantine/rasson-9ft/ortho")
    ap.add_argument("--tol", type=finite_positive_mm, default=3.0,
                    help="mm; one render pixel is 0.78-1.67 mm (must be finite and > 0: `nan` compares false "
                         "against every delta and `inf` accepts every delta, either of which would print a "
                         "full-marks summary over a corrupted definition — review review round 3)")
    args = ap.parse_args()

    root = G.repo_root()
    src = Path(args.input)
    if not src.is_absolute():
        src = root / src
    doc, src_sha, _ = G.load_source(src)
    f = G.feature_map(doc)
    renders = Path(args.renders)
    shots = {s["name"]: s
             for s in json.loads((renders / "register-cameras.json").read_text())["shots"]}

    en6 = G.val(f, "EN-06")
    rb9b = G.val(f, "RB-09b")
    env = en6["table_envelope"]
    rows: list[tuple[str, float, float, str]] = []
    # structural results that are not a millimetre reading: "did this shot produce the boundaries
    # and the rows the record says it must".  Kept apart from the measurement rows so a count is
    # never smuggled through a +/-3 mm tolerance, but counted the same way into the exit code.
    checks: list[tuple[str, bool, str]] = []
    notes: list[str] = []

    # ---- plan_full: the body footprint, silhouette against the backdrop.
    cam, fr = Cam(shots["plan_full"]), Frame(renders / "plan_full.png")
    xl, xr = fr.span_x(cam.py_of(0.0))
    yt, yb = fr.span_y(int(round(cam.w / 2.0)))
    rows += [("plan_full  body envelope -X", cam.a_of(xl), env["x"][0], "EN-06.table_envelope"),
             ("plan_full  body envelope +X", cam.a_of(xr), env["x"][1], "EN-06.table_envelope"),
             ("plan_full  body envelope +Y", cam.b_of(yt), env["y"][1], "EN-06.table_envelope"),
             ("plan_full  body envelope -Y", cam.b_of(yb), env["y"][0], "EN-06.table_envelope"),
             ("plan_full  body length", cam.a_of(xr) - cam.a_of(xl), en6["length"], "EN-06"),
             ("plan_full  body width", cam.b_of(yt) - cam.b_of(yb), en6["width"], "EN-06")]

    # ---- elev_side: length at a row through the rail body, height and floor over the centre.
    cam, fr = Cam(shots["elev_side"]), Frame(renders / "elev_side.png")
    # the widest point of the body is the rail cap, not any one row through the apron, so take
    # the envelope over the whole rail band; height and floor come from the global extremes
    # because at x=0 the pedestal is an open arch and the lowest pixel there is its soffit.
    xl, xr = fr.widest_x(cam.py_of(en6["height"]), cam.py_of(en6["bed_top_z"] - 60.0))
    yt, yb = fr.extreme_y()
    rows += [("elev_side  body envelope -X", cam.a_of(xl), env["x"][0], "EN-06.table_envelope"),
             ("elev_side  body envelope +X", cam.a_of(xr), env["x"][1], "EN-06.table_envelope"),
             ("elev_side  body length", cam.a_of(xr) - cam.a_of(xl), en6["length"], "EN-06"),
             ("elev_side  rail cap top z", cam.b_of(yt), en6["height"], "EN-06.height"),
             # bound to the numeric leaf, and named after it.  This row used to be labelled
             # "EN-06.floor_contact" against the code literal 0.0, but EN-06.floor_contact is a
             # PROSE sentence ("min vertex z 3.98e-05: the 4 pads sit exactly on z=0, nothing
             # below"), so the label promised a comparison the row was not making.  The envelope's
             # z floor is the leaf that actually carries the number.
             ("elev_side  floor contact z", cam.b_of(yb), env["z"][0], "EN-06.table_envelope.z")]
    # EN-06.bed_top_z was read only to place the scan band above, so it could have been any number
    # at all and nothing would have noticed — exactly the RB-09b.abs_y_centre_mm hole this harness
    # was built to close.  The bed itself is in none of these shots (the rail occludes it in every
    # elevation, and a plan view carries no z), so it is checked the one honest way the renders
    # allow: the top of the elev_side silhouette is the model's global maximum z, and CU-11
    # publishes that maximum as a stand-off above the bed — 46.807 mm, the middle-pocket cup rim
    # rather than the rail cap, which is the correction EN-02's note records.  Global max in
    # pixels minus that published stand-off is the bed, and it has to land on EN-06.bed_top_z.
    cu11 = G.val(f, "CU-11")
    rows.append(("elev_side  bed top z (global max - CU-11)",
                 cam.b_of(yt) - cu11["global_max_above_bed_mm"], en6["bed_top_z"],
                 "EN-06.bed_top_z vs CU-11.global_max_above_bed_mm"))
    notes.append("elev_side: the floor row compares EN-06.table_envelope.z[0]; the prose leaf "
                 "EN-06.floor_contact says the same thing in a sentence and cannot be "
                 "gate-checked as a number — it is quoted here, not measured: "
                 f"“{en6['floor_contact']}”.")

    # ---- plan_sights: the rail band, then the rendered diamonds inside it.
    cam, fr = Cam(shots["plan_sights"]), Frame(renders / "plan_sights.png")
    rb3m = G.val(f, "RB-03m")
    outer = rb3m["outer_edge_u"]["long"]
    # the two rail boundaries come out of the pixels without consulting the record: the outer
    # edge is the silhouette against the backdrop, the inner one is the rail/cloth line.  Both
    # are then compared with RB-03m, so a wrong rail width fails instead of merely re-scaling
    # the window everything else is measured in.
    y_out = fr.top_edge(50, fr.w - 50)
    rows.append(("plan_sights  rail outer edge +Y", cam.b_of(y_out), outer,
                 "RB-03m.outer_edge_u"))
    lines = fr.dark_lines_y(int(y_out) + 40, fr.h - 5)
    # ORDER binds these, not proximity — see bind_rail_lines.  The record publishes the boundaries
    # of this band in one fixed outward-to-inward sequence and dark_lines_y scans in that same
    # direction, so the binding is positional and the ordering is itself a check.
    published = [("rail cap inner face",
                  outer - rb3m["cap_width_inner_face_to_outer_edge_mm"]["long"],
                  "RB-03m.cap_width_inner_face_to_outer_edge_mm"),
                 ("rail band inner (nose)", outer - rb3m["long_mm"], "RB-03m.long_mm")]
    bound, line_checks, line_notes = bind_rail_lines(cam, y_out, lines, published)
    checks += line_checks
    notes += line_notes
    for label, expect, feat in published:
        if label in bound:
            rows.append((f"plan_sights  {label}", cam.b_of(bound[label]), expect, feat))
    y_nose = bound.get("rail band inner (nose)")
    if y_nose is not None:
        rows.append(("plan_sights  rail band width", cam.b_of(y_out) - cam.b_of(y_nose),
                     rb3m["long_mm"], "RB-03m.long_mm"))
    band = cam.py_of(rb9b["long_rails"]["abs_y_centre_mm"])
    got = sorted(cam.a_of(c) for c in fr.dark_clusters(band - 25, band + 26))
    # Which published sights this crop can measure is a property of the CAMERA, and it is settled
    # before any of them is read.  plan_sights frames the +X half of the +Y long rail, and the
    # record publishes that rail as mirror-symmetric (long_rails.mirror_residual_mm = 0.0,
    # L_plus_vs_L_minus "identical"), so the sights with x > 0 are exactly the ones that must show
    # up here — each of them clear of the crop edge by the half-width of the column window the
    # mark is read in, because a mark hanging over the edge is not a mark that can be measured.
    # The previous version simply dropped anything that did not project inside the frame: a sight
    # that had walked out of the crop produced no row, no red and no note, and the summary went on
    # counting full marks over whatever was left.
    lr = rb9b["long_rails"]
    col_half = 40                                      # px; the window dark_runs reads per mark
    x_lo, x_hi = cam.a_of(float(col_half)), cam.a_of(float(cam.w - col_half))
    want = sorted(x for x in lr["x_mm"] if x_lo <= x <= x_hi)
    must = sorted(x for x in lr["x_mm"] if x > 0)
    checks.append(("plan_sights  sights inside the crop = the +X half of the record",
                   want == must,
                   f"crop can measure {x_lo:.1f}..{x_hi:.1f} mm and holds ["
                   + ", ".join(f"{v:.1f}" for v in want) + "]; RB-09b publishes ["
                   + ", ".join(f"{v:.1f}" for v in must) + "] on this half rail"))
    if len(want) != len(lr["x_mm"]):
        notes.append("plan_sights: "
                     + ", ".join(f"{v:.1f}" for v in lr["x_mm"] if v not in want)
                     + f" mm of RB-09b.long_rails.x_mm lie outside the measurable window "
                       f"{x_lo:.1f}..{x_hi:.1f} mm of this shot and are not read here; they are "
                       f"the mirror image of the sights that are "
                       f"(long_rails.mirror_residual_mm = {lr['mirror_residual_mm']}).")
    # match each PUBLISHED sight to the nearest dark mark rather than pairing two sorted lists:
    # the band also crosses the side and corner pocket mouths, and those are dark marks too.
    claimed, matched = set(), []
    for e in want:
        near = min(range(len(got)), key=lambda i: abs(got[i] - e))
        claimed.add(near)
        matched.append(got[near])
        rows.append((f"plan_sights  sight at {e:.1f}", got[near], e, "RB-09b.long_rails.x_mm"))
    checks.append(("plan_sights  a row for every sight the record puts in the crop",
                   len(matched) == len(must),
                   f"{len(matched)} row(s) produced, {len(must)} published"))
    for i, g in enumerate(matched[1:], 1):
        rows.append((f"plan_sights  pitch {i}", g - matched[i - 1],
                     rb9b["long_rails"]["pitch_mean_mm"], "RB-09b.pitch_mean_mm"))
    # ACROSS the rail: where the sight row actually sits, and how big the mark is.  Measured
    # strictly inside the two boundaries just found, so neither reading is anchored on the leaf
    # it is testing.  Red-arm: without this, abs_y_centre_mm could be 25 mm wrong and pass.
    inner_band = (int(y_out) + 8, int(y_nose) - 8) if y_nose is not None else (int(y_out) + 8,
                                                                              fr.h - 5)
    sizes = []
    for e, g in zip(want, matched):
        c = cam.w / 2.0 + (g - cam.ca) * cam.ppm
        runs = fr.dark_runs(int(c - 40), int(c + 41), *inner_band)
        top, bot, _ = runs[0]
        rows.append((f"plan_sights  sight row centre @{e:.0f}", cam.b_of((top + bot) / 2.0),
                     rb9b["long_rails"]["abs_y_centre_mm"], "RB-09b.abs_y_centre_mm"))
        sizes.append((bot - top) / cam.ppm)
        for t, b, _ in runs[1:]:
            mid = cam.b_of((t + b) / 2.0)
            who, d = min(((label, abs(mid - expect)) for label, expect, _ in published),
                         key=lambda z: z[1])
            notes.append(f"plan_sights: a second dark run at y = {cam.b_of(b):.1f}..."
                         f"{cam.b_of(t):.1f} mm crosses the column window of the sight at "
                         f"{e:.0f} mm; it is the {who} ({d:.1f} mm off), not part of the mark"
                         + ("" if d < 10 else "  <-- UNEXPLAINED"))
    notes.append("plan_sights: the sight mark measures "
                 + "/".join(f"{v:.1f}" for v in sizes)
                 + " mm across the rail (outline included, so ~1 px high). RB-09 gives the plan"
                   " projection as 31.010 mm long-rail, but only inside the prose of"
                   " RB-09.instances, so it is NOT a structured leaf and this row cannot be"
                   " gate-checked — same defect class as SP-14's prose-only points.")
    # anything else dark in the band gets named against the published pocket centres rather than
    # waved away: a mark that is NOT near a pocket would be an unexplained feature and a finding.
    pockets = {"side pocket (SP, x=0)": 0.0,
               "corner slate cut (CP-14m)": G.val(f, "CP-14m")["centre_xy_model_mm"][0]}
    for i, g in enumerate(got):
        if i in claimed:
            continue
        who, d = min(((k, abs(g - v)) for k, v in pockets.items()), key=lambda t: t[1])
        notes.append(f"plan_sights: dark mark at x = {g:.1f} mm is not a published sight; "
                     f"nearest published feature is the {who}, {d:.1f} mm away"
                     + ("" if d < 120 else "  <-- UNEXPLAINED"))

    # An UNEXPLAINED note is the harness saying it found something in the pixels that the record
    # does not account for — i.e. the model or the document has moved.  It used to be printed and
    # then ignored, because `bad` was only ever incremented in the rows loop, so the run could
    # report a feature it could not name and still exit 0.  It is a check now.
    unexplained = [n for n in notes if "UNEXPLAINED" in n]
    checks.append(("notes  every detected feature is accounted for", not unexplained,
                   f"{len(unexplained)} note(s) marked UNEXPLAINED"))

    print(f"regcheck_rox — source {doc['doc']['number']} {doc['doc']['revision']} "
          f"sha256 {src_sha[:16]}…")
    print(f"renders {renders} (quarantine, measurement reference only)\n")
    print(f"{'station':<44} {'render':>10} {'record':>10} {'delta':>8}  feature")
    row_bad = 0
    for name, got_v, want_v, feat in rows:
        d = got_v - want_v
        out = abs(d) > args.tol
        row_bad += out
        print(f"{name:<44} {got_v:>10.2f} {want_v:>10.2f} {d:>+8.2f}  {feat}"
              f"{'   <-- OUT' if out else ''}")
    print(f"\n{'structural check':<62} verdict")
    check_bad = 0
    for name, ok, detail in checks:
        check_bad += not ok
        print(f"{name:<62} {'ok    ' if ok else 'FAILED'}  {detail}"
              f"{'   <-- OUT' if not ok else ''}")
    for n in notes:
        print(f"\nNOTE  {n}")
    print(f"\n{len(rows) - row_bad}/{len(rows)} rows within +/-{args.tol:.1f} mm; "
          f"{len(checks) - check_bad}/{len(checks)} structural checks passed")
    return 1 if (row_bad or check_bad) else 0


if __name__ == "__main__":
    raise SystemExit(main())
