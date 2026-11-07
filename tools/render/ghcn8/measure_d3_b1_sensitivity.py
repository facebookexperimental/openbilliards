# Copyright (c) Meta Platforms, Inc. and affiliates.

"""Read a complete two-by-two ROI sensitivity table; never fit a model.

Raster inputs and outputs are private evidence. The repository contains only
this recipe and its tagged numeric readings. Upper/lower neck courses are
image-window halves, not measured physical course heights. Cloth lit/shaded
labels describe relative local luminance, not a calibrated lighting model.
"""
import argparse
import hashlib
import itertools
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def split_box(box):
    left, top, right, bottom = box
    middle = (top + bottom) // 2
    return [[left, top, right, middle], [left, middle, right, bottom]]


def stats(image, box, tag):
    left, top, right, bottom = box
    if not (0 <= left < right <= image.width and 0 <= top < bottom <= image.height):
        raise ValueError(f"ROI outside the image or empty: {box}")
    rgb = np.asarray(image.convert('RGB').crop(tuple(box))).astype(float) / 255
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    luminance = linear @ np.array([.2126, .7152, .0722])
    return {
        'box_px': {'tag': tag + ' / region coordinates; placement EST', 'value': box},
        'pixels': {'tag': 'DERIVED', 'value': int(luminance.size)},
        'median_linear_Y': {'tag': tag, 'value': float(np.median(luminance))},
        'p05_p95_linear_Y': {'tag': tag, 'value': np.percentile(luminance, [5, 95]).tolist()},
    }


def measure(image, neck, cloth, tag, interval):
    regions = {}
    for name, box in zip(['neck_upper_course', 'neck_lower_course'], split_box(neck)):
        regions[name] = stats(image, box, tag)
    cloth_halves = [stats(image, box, tag) for box in split_box(cloth)]
    # Report both fixed halves; ordering their labels never selects a ratio.
    cloth_halves.sort(key=lambda row: row['median_linear_Y']['value'])
    for name, row in zip(['cloth_relatively_shaded', 'cloth_relatively_lit'], cloth_halves):
        regions[name] = row
    rows = []
    for neck_name, cloth_name in itertools.product(
            ['neck_upper_course', 'neck_lower_course'],
            ['cloth_relatively_shaded', 'cloth_relatively_lit']):
        denominator = regions[cloth_name]['median_linear_Y']['value']
        if denominator <= 0:
            raise ValueError('Cloth median is zero; a finite ratio is undefined')
        ratio = regions[neck_name]['median_linear_Y']['value'] / denominator
        rows.append({
            'neck_roi': neck_name, 'cloth_roi': cloth_name,
            'ratio': {'tag': tag, 'value': ratio},
            'inside_original_photo_interval': interval[0] <= ratio <= interval[1],
            'role': 'Sensitivity disclosure only; never a replacement acceptance cell',
        })
    return {'regions': regions, 'sensitivity': rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', type=Path, required=True)
    parser.add_argument('--crop', type=int, nargs=4, metavar=('L', 'T', 'R', 'B'))
    parser.add_argument('--neck', type=int, nargs=4, required=True, metavar=('L', 'T', 'R', 'B'))
    parser.add_argument('--cloth', type=int, nargs=4, required=True, metavar=('L', 'T', 'R', 'B'))
    parser.add_argument('--interval', type=float, nargs=2, required=True)
    parser.add_argument('--tag', choices=['PHOTO', 'DERIVED'], required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    if args.interval[0] > args.interval[1]:
        parser.error('Interval bounds must be ordered')
    image = Image.open(args.image).convert('RGB')
    if args.crop:
        stats(image, args.crop, args.tag)  # Validate before cropping.
        image = image.crop(tuple(args.crop))
    result = measure(image, args.neck, args.cloth, args.tag, args.interval)
    args.out.mkdir(parents=True, exist_ok=False)
    digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
    result.update({
        'schema': 'ob-cn8-b1-two-roi-read/1',
        'source_sha256': digest(args.image),
        'recipe_sha256': digest(Path(__file__)),
        'crop_px': {'tag': args.tag + ' coordinates; placement EST', 'value': args.crop},
        'interval': {'tag': 'PHOTO read interval with EST ROI placement', 'value': args.interval},
        'pose_and_correspondence_tag': 'EST',
        'role': 'Complete sensitivity disclosure; no primary ratio or geometry is replaced',
    })
    annotated = image.copy()
    draw = ImageDraw.Draw(annotated)
    for (name, row), color in zip(result['regions'].items(),
                                  ['#ff33bb', '#ffd433', '#33ccff', '#66ff66']):
        box = row['box_px']['value']
        draw.rectangle([box[0], box[1], box[2] - 1, box[3] - 1], outline=color, width=2)
        mask = Image.new('L', image.size, 0)
        ImageDraw.Draw(mask).rectangle([box[0], box[1], box[2] - 1, box[3] - 1], fill=255)
        target = args.out / (name + '-mask.png')
        mask.save(target)
        row['mask_sha256'] = digest(target)
    annotated.save(args.out / 'regions.png')
    result['marked_frame_sha256'] = digest(args.out / 'regions.png')
    (args.out / 'readings.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps({'ratios': [row['ratio']['value'] for row in result['sensitivity']]}))


if __name__ == '__main__':
    main()
