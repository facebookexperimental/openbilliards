# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Render the leave surface of one position as text, and optionally as a PNG.

    python -m straightpool.leave.demo [--painter v0.1|v0.2] [--png PATH]

(run from the package directory, the one holding hillclimb/ and straightpool/).

The position is a fixed layout of six object balls and the cue ball on the kernel's standard
table, whose dimensions and pocket centres are written out below so the demo needs neither the
kernel nor a candidate generator: every (object ball, pocket) pair gets one pot candidate (the
painter reads only the candidates' intents, so their strokes are placeholders; the package's own
enumerator in straightpool.candidates makes the real ones). The painter declares the call and the
leave, and the grid is drawn as a top view, one character per 2 cm cell, the table's length
across: blank where the surface is 0, then . : - = + * # % @ up to 1. The cue ball is 'o', object
balls are their numbers in hex, and the pockets are at the corners and the middle of the long
cushions.
"""

import argparse
import struct
import sys
import zlib

from hillclimb.adapter import Stroke, Table
from straightpool.candidates import Candidate, Intent
from straightpool.leave import brush, painters

#: The kernel's standard table: width (x), length (y), ball radius, pocket centres in its order.
TABLE = Table(1.27, 2.54, 0.028575,
              ((-0.6644863527754791, -1.299486352775479), (-0.7035, 0.0),
               (-0.6644863527754791, 1.299486352775479), (0.664486352775479, -1.299486352775479),
               (0.7035, 0.0), (0.664486352775479, 1.299486352775479)))

#: The demo position, kernel frame (metres from the table centre; y along the length).
POSITIONS = {0: (0.21, -0.42), 1: (-0.18, 0.31), 2: (0.36, 0.77), 3: (-0.47, -0.66),
             4: (0.05, 1.02), 5: (0.52, -0.95), 6: (-0.33, 0.88)}

RAMP = " .:-=+*#%@"


def candidates(positions):
    """One pot candidate per (object ball, pocket), by ball then pocket, placeholder strokes."""
    out = []
    for ball in sorted(b for b in positions if b != 0):
        for pocket in range(len(TABLE.pockets)):
            out.append(Candidate(len(out), Intent(ball, pocket, "pot"), Stroke(1.0, 0.0),
                                 "ghost-ball"))
    return out


def _cell(grid, point):
    i = min(grid.nx - 1, max(0, int(point[0] / grid.cell)))
    j = min(grid.ny - 1, max(0, int(point[1] / grid.cell)))
    return i, j


def text(grid, positions, table):
    """The grid as lines of text, the far long cushion (largest scene y) first."""
    rows = [[RAMP[0 if v <= 0.0 else 1 + min(8, int(v * 9))]
             for v in grid.vals[j * grid.nx:(j + 1) * grid.nx]] for j in range(grid.ny)]
    for ball, point in positions.items():
        i, j = _cell(grid, brush.scene_from_kernel(point, table))
        rows[j][i] = "o" if ball == 0 else format(ball, "x")
    edge = "+" + "-" * grid.nx + "+"
    return [edge] + ["|" + "".join(r) + "|" for r in reversed(rows)] + [edge]


def png(grid, positions, table, scale=4):
    """A grayscale PNG of the grid (bytes), `scale` pixels per cell, balls drawn as discs."""
    width, height = grid.nx * scale, grid.ny * scale
    pixels = [[int(round(255 * grid.vals[(y // scale) * grid.nx + x // scale]))
               for x in range(width)] for y in range(height)]
    radius = table.ball_radius / grid.cell * scale
    for ball, point in positions.items():
        sx, sy = brush.scene_from_kernel(point, table)
        cx, cy = sx / grid.cell * scale, sy / grid.cell * scale
        for y in range(max(0, int(cy - radius) - 1), min(height, int(cy + radius) + 2)):
            for x in range(max(0, int(cx - radius) - 1), min(width, int(cx + radius) + 2)):
                if (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius ** 2:
                    pixels[y][x] = 255 if ball == 0 else 64
    raw = b"".join(b"\x00" + bytes(row) for row in reversed(pixels))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def main(argv=None, out=None):
    """Paint the demo position and print it; returns 0."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--painter", choices=painters.PAINTERS, default=painters.DEFAULT_PAINTER)
    parser.add_argument("--png", metavar="PATH", help="also write the surface as a PNG")
    args = parser.parse_args(argv)
    out = out or sys.stdout
    declaration, meta = painters.declare(POSITIONS, TABLE, candidates(POSITIONS),
                                         painter=args.painter)
    if declaration.call is None:
        print("no pot is live: nothing to paint", file=out)
        return 0
    print(f"painter {args.painter}: call ball {declaration.call.ball} in pocket "
          f"{declaration.call.pocket} (makeability {meta['make']:.3f}, cut "
          f"{meta['cut_deg']:.1f} deg)", file=out)
    if declaration.surface is not None:
        print(f"leave painted for ball {declaration.surface[0]} in pocket "
              f"{declaration.surface[1]}", file=out)
    band = declaration.brush.get("angle_band")
    if band:
        print(f"angle band {band['center_deg']:.0f} +- {band['width_deg']:.0f} deg toward side "
              f"{band['prefer_side']:+d} (ball after next: {meta['ball_after_next']})", file=out)
    top, centre, cells = brush.plateau(declaration.grid)
    print(f"surface max {top:.3f} at scene ({centre[0]:.2f}, {centre[1]:.2f}) m over {cells} "
          f"cell(s); grid {declaration.grid.nx} x {declaration.grid.ny}, digest "
          f"{declaration.grid.digest()}", file=out)
    for line in text(declaration.grid, POSITIONS, TABLE):
        print(line, file=out)
    if args.png:
        with open(args.png, "wb") as handle:
            handle.write(png(declaration.grid, POSITIONS, TABLE))
        print(f"wrote {args.png}", file=out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
