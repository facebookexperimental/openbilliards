// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
/** One material export for live objects and constructor replays.
 * Self-contained so the same function can execute in the browser over CDP.
 */
export function materialSlots(material) {
  const slots = Array.isArray(material) ? material : [material];
  if (!slots.length || slots.some(m => !m)) throw new Error('MATERIAL_SLOTS_REFUSED: missing material');
  return slots.map(m => ({ type: m.type, side: m.side, color: m.color?.getHexString(),
    roughness: m.roughness, metalness: m.metalness, opacity: m.opacity, transparent: m.transparent,
    visible: m.visible, envMapIntensity: m.envMapIntensity, normalMap: !!m.normalMap, map: !!m.map }));
}
