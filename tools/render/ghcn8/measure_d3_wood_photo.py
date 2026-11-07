# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Measure native JOY wood-image components without inventing a metric camera.

Only scalar measurements are exported. The official raster and transect
samples remain private reference evidence; they never become renderer assets.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

SOURCE_SHA = 'e9adcee19a7848dd6397654641029bf829112e3490c032b0dd1c31a3a9d33ca3'
SOURCE_URL = 'https://nwzimg.wezhan.cn/contents/sitefiles2025/10125453/images/61863225.jpg'
PRIVATE_IMAGE = Path.home() / 'ob-artifacts/astra-cn8/phase2-d3/order7-official-census/images/e5bd35bb7105da73543d.bin'
# PHOTO: native crop and three transects placed within the visible wood face.
CROP = [100, 6150, 600, 6700]
STARTS = [[150, 266], [185, 241], [220, 216]]
DIRECTION = [49, 69]


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def measure(image_path):
    from PIL import Image  # Optional source replay; dependency is declared.

    image_path = Path(image_path)
    if digest(image_path) != SOURCE_SHA:
        raise ValueError('Official Q8Pro native wood-image digest differs')
    image = Image.open(image_path).convert('RGB')
    rgb = np.asarray(image.crop(CROP), dtype=float) / 255
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    luminance = linear @ np.array([.2126, .7152, .0722])
    length = float(np.linalg.norm(DIRECTION))
    unit = np.array(DIRECTION) / length
    rows = []
    for ordinal, start in enumerate(STARTS, 1):
        positions = np.array(start) + np.arange(int(length) + 1)[:, None] * unit
        x, y = positions[:, 0], positions[:, 1]
        x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
        dx, dy = x - x0, y - y0
        values = (luminance[y0, x0] * (1 - dx) * (1 - dy)
                  + luminance[y0, x0 + 1] * dx * (1 - dy)
                  + luminance[y0 + 1, x0] * (1 - dx) * dy
                  + luminance[y0 + 1, x0 + 1] * dx * dy)
        index = np.arange(len(values))
        residual = values - np.polyval(np.polyfit(index, values, 1), index)
        power = np.abs(np.fft.rfft(residual * np.hanning(len(values)))) ** 2
        # TESSELLATION: at least two sampled cycles, up to native Nyquist.
        # This is a spectral summary, not a hand-counted wood-line repeat.
        frequency = int(np.argmax(power[2:]) + 2)
        rows.append({'tag': 'PHOTO', 'ordinal': ordinal,
                     'start_full_image_px': (np.array(start) + CROP[:2]).tolist(),
                     'end_full_image_px': (positions[-1] + CROP[:2]).tolist(),
                     'sampled_span_px': float(len(values) - 1), 'sample_count': len(values),
                     'dominant_bin': frequency,
                     'dominant_component_period_px': len(values) / frequency,
                     'half_bin_period_interval_px': [len(values) / (frequency + .5), len(values) / (frequency - .5)],
                     'spectral_peak_fraction': float(power[frequency] / power[2:].sum())})
    return {'schema': 'ob-cn8-wood-photo-measurement/1',
            'source': {'id': 'Q8PRO-STRIP-MASTER-01', 'tag': 'PHOTO', 'url': SOURCE_URL,
                       'sha256': SOURCE_SHA, 'native_pixels': list(image.size)},
            'derivation': {'recipe': 'tools/render/ghcn8/measure_d3_wood_photo.py', 'recipe_sha256': digest(__file__),
                           'method': 'Native bilinear transects; IEC sRGB inverse and Rec.709 linear luminance; least-squares linear trend removed; Hann-window spatial DFT, strongest bin of at least two sampled cycles. Half-bin interval describes frequency resolution only.',
                           'boundary': 'Only scalar coordinates, counts and spectral summaries are exported. No raster, per-pixel signal or source material is shipped.'},
            'sampling': {'tag': 'TESSELLATION', 'spacing_native_px': 1, 'minimum_cycles': 2,
                         'interval_half_bin': .5, 'basis': 'Native sampling and finite-window spectral resolution; no physical calibration.'},
            'crop': {'tag': 'PHOTO', 'native_box_px': CROP, 'direction_px': DIRECTION},
            'transects': rows,
            'camera': {'tag': 'EST', 'metric_camera_of_record': None,
                       'basis': 'ORDER-7 held-out camera attempts all failed; no local ruler is visible in this inset.'},
            'physical_pitch': {'tag': 'EST', 'value_mm': None, 'status': 'GAP',
                               'basis': 'Pixel components cannot supply a millimetre grain pitch under the unbound camera. The figured wood is not established as a periodic pattern.'},
            'renderer_role': 'Consistency only. The shared physical atlas density comes independently from MODEL(Star); assigning that density to the existing procedural bitmap remains EST.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    record = measure(args.image)
    args.out.mkdir(parents=True, exist_ok=False)
    output = args.out / 'cn8-pocket-d3-wood-grain-photo.json'
    output.write_text(json.dumps(record, indent=2) + '\n')
    print(output)


if __name__ == '__main__':
    main()
