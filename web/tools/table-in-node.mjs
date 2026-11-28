// Copyright (c) Meta Platforms, Inc. and affiliates.

// table-in-node.mjs — load web/scene/table.js (the ONE table geometry truth: kernel
// cups via makeGeom, visual falls via pocketVisualFalls) inside plain node, for the
// ball-return exporter (`test-ballreturn.mjs --track`) and the node gate. table.js
// imports the bare specifier 'three' and touches a few window/document globals at
// module scope; this helper maps 'three' to the vendored build (the app's import
// map does the same) and installs inert browser stubs — nothing is rendered.
// Node ≥ 22.15 / 23.5 (module.registerHooks). Never imported by the app.
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let loaded = null;
export async function loadTableModule() {
  if (loaded) return loaded;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const three = path.resolve(here, '../vendor/three.module.min.js');
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'three') return { url: 'file://' + three, shortCircuit: true };
      return next(specifier, context);
    },
  });
  const noop = () => {};
  const g = globalThis;
  g.window ??= g;
  g.addEventListener ??= noop; g.removeEventListener ??= noop; g.dispatchEvent ??= () => true;
  g.matchMedia ??= () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop });
  g.sessionStorage ??= { getItem: () => null, setItem: noop, removeItem: noop };
  g.location ??= { search: '', href: 'http://localhost/', origin: 'http://localhost', pathname: '/' };
  g.navigator ??= { userAgent: 'node', language: 'en' };
  g.document ??= {
    createElement: () => ({ getContext: () => null, style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop }),
    body: { appendChild: noop, classList: { add: noop, remove: noop } },
    documentElement: { style: { setProperty: noop }, classList: { add: noop, remove: noop } },
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, head: { appendChild: noop },
  };
  g.requestAnimationFrame ??= () => 0; g.cancelAnimationFrame ??= noop;
  g.devicePixelRatio ??= 1; g.innerWidth ??= 1280; g.innerHeight ??= 720;
  g.CustomEvent ??= class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  g.Image ??= class Image {};
  loaded = await import('../scene/table.js');
  return loaded;
}

/** Kernel cups (three frame, kernel order) + visual falls for a catalog table id.
 * Throws for an unknown id — an exporter must name a real table. */
export async function tableContext(tableId) {
  const m = await loadTableModule();
  if (!tableId || !m.TABLE_SPECS?.[tableId]) {
    throw new Error(`unknown table id ${JSON.stringify(tableId)} — doc.table_id must name a catalog table (${Object.keys(m.TABLE_SPECS ?? {}).join(', ')})`);
  }
  const G = m.makeGeom(tableId);
  const pockets = (G?.pockets ?? []).map((p) => ({ x: p.x, z: p.z, r: p.r }));
  if (!pockets.length) throw new Error(`table ${tableId} has no kernel pockets (a pocketless table cannot carry a return track)`);
  // the SAME request the app's controller makes (and the fresh game.js at its one read site): the falls module's named export,
  // never a literal of this file's own — un-opted, snooker's corners come back as the plate cups, 27.87 mm from the fall the host
  // draws, and the gate would validate a fall path the app never shows (#707 prep FIX6 A, review 707m6 P2-1; the ownership ledger's
  // "Recorded deviation … the kernel-disc contract")
  const falls = m.pocketVisualFalls?.(tableId, m.POCKET_FALLS_CONTRACT_KERNEL) ?? null;
  return { tableId, pockets, falls };
}
