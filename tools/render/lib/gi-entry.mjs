// Copyright (c) Meta Platforms, Inc. and affiliates.

// gi-entry.mjs — resolve a shipped baked-GI entry in web/assets/gi/gi-manifest.json exactly as the runtime does
// (web/scene/gi.js entryFor(); tools/render/lib/gi-entry.test.mjs lifts that function and checks parity over every
// committed fixture × look × table class). GH-1070: a per-fixture bake lives at fixtures[<fixture>].looks[<look>], the
// canopy_panel default at the top-level looks[<look>], a table class other than pool under tables[<class>]; a missing or
// `unbaked` entry means "no shipped grid" — never a file name guessed from the naming convention.
//   import { shippedEntry } from './lib/gi-entry.mjs'; shippedEntry(manifest, look, fixture, tableClass) → entry | null
export function shippedEntry(mf, look, fixture, cls) {
  if (cls && cls !== 'pool') {
    const e = fixture && fixture !== 'canopy_panel' ? mf.tables?.[cls]?.fixtures?.[fixture]?.looks?.[look] : mf.tables?.[cls]?.looks?.[look];
    return e && !e.unbaked ? e : null;
  }
  if (!fixture || fixture === 'canopy_panel') return mf.looks?.[look] ?? null;
  const e = mf.fixtures?.[fixture]?.looks?.[look];
  return e && !e.unbaked ? e : null;
}
