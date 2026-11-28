#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Decode the frozen pair corpus without changing any binary64 input bits.

Usage: python3 solver_c_prepare.py SOURCE_DIRECTORY OUTPUT_DIRECTORY
Only OUTPUT_DIRECTORY is written. CBOR layout: u32 little-endian payload length,
then [PosPoly, PosPoly, ra, rb, t_min]; maps retain c0/c1/c2 and x/y/z names.
Each output row is 21 little-endian binary64 values, no header.
"""
import gzip
import hashlib
import json
from pathlib import Path
import struct
import sys


def cbor(data, offset=0):
    tag = data[offset]
    offset += 1
    major, arg = tag >> 5, tag & 31
    if major == 7:
        fmt = {25: ">e", 26: ">f", 27: ">d"}[arg]
        size = struct.calcsize(fmt)
        return struct.unpack_from(fmt, data, offset)[0], offset + size
    if arg < 24:
        n = arg
    else:
        fmt = {24: ">B", 25: ">H", 26: ">I", 27: ">Q"}[arg]
        size = struct.calcsize(fmt)
        n = struct.unpack_from(fmt, data, offset)[0]
        offset += size
    if major == 0:
        return n, offset
    if major == 1:
        return -1 - n, offset
    if major == 3:
        return data[offset:offset+n].decode(), offset+n
    if major == 4:
        values = []
        for _ in range(n):
            value, offset = cbor(data, offset)
            values.append(value)
        return values, offset
    if major == 5:
        values = {}
        for _ in range(n):
            key, offset = cbor(data, offset)
            value, offset = cbor(data, offset)
            values[key] = value
        return values, offset
    raise ValueError((major, arg, offset))


def packed(args):
    a, b, ra, rb, t_min = args
    values = [p[c][v] for p in (a, b) for c in ("c0", "c1", "c2") for v in "xyz"]
    return struct.pack("<21d", *values, ra, rb, t_min)


def main():
    source, out = map(Path, sys.argv[1:])
    out.mkdir(parents=True, exist_ok=True)
    names = sorted(p.name for p in (source / "inputs").iterdir() if p.name.endswith((".rec", ".rec.gz")))
    files = [source / "inputs" / name for name in names]
    files += [source / name for name in ("exact-contact-v1.jsonl", "near-miss-dr.jsonl", "near-miss-ro.jsonl")]
    manifest = []
    for path in files:
        count = 0
        digest = hashlib.sha256()
        output = out / (path.name + ".bin")
        with output.open("wb") as dst:
            if path.name.endswith(".jsonl"):
                with path.open("rb") as src:
                    for line in src:
                        digest.update(line)
                        dst.write(packed(json.loads(line)["args"]))
                        count += 1
            else:
                opener = gzip.open if path.name.endswith(".gz") else open
                with opener(path, "rb") as src:
                    while True:
                        header = src.read(4)
                        if not header:
                            break
                        if len(header) != 4:
                            raise ValueError("truncated length")
                        n = struct.unpack("<I", header)[0]
                        payload = src.read(n)
                        if len(payload) != n:
                            raise ValueError("truncated CBOR")
                        digest.update(header + payload)
                        args, end = cbor(payload)
                        if end != n:
                            raise ValueError("trailing CBOR")
                        dst.write(packed(args))
                        count += 1
        row = {"source": str(path), "output": str(output), "count": count,
               "decoded_source_sha256": digest.hexdigest(),
               "output_sha256": hashlib.sha256(output.read_bytes()).hexdigest()}
        print(json.dumps(row), flush=True)
        manifest.append(row)
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
