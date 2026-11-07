// Copyright (c) Meta Platforms, Inc. and affiliates.

import { MM } from './cushion-ring.mjs';

/** Round only the label to the requested step's decimal places in mm.
 * The exact endpoint retains its own precision when it is off the grid.
 * Geometry still receives the original denseOffsets values, unchanged. */
export function denseOffsetLabel(offset, stepMm, endpoint) {
  const [mantissa, exponent = ''] = String(stepMm).split('e');
  const [, fraction = ''] = mantissa.split('.');
  const power = Number(exponent);
  const decimals = Math.max(fraction.length, power) - power;
  const mm = offset * MM;
  return offset === endpoint ? String(mm) : String(Number(mm.toFixed(decimals)));
}
