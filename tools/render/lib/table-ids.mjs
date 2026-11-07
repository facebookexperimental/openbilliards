// Copyright (c) Meta Platforms, Inc. and affiliates.

// table-ids.mjs — FAIL-CLOSED table selection for the render tools (ORDER-CN8-731-FIX1, review
// round 1 on #731 P2 (b)). The app's resolveBootTableId turns an unknown ?table= id into the
// scripted pin (wpa_generic_9ft) without a word, and the node builders' specFor(id) falls back the
// same way — so a typo like `chinese8_pro_9f` used to boot or build ANOTHER table under the
// requested label. Every tool that takes a table id from argv / env goes through requireTableIds
// before it boots Chrome or builds geometry: an empty selection is refused, every id must be a key
// of TABLE_SPECS (the catalog, read from THIS tree's web/scene/table.js through ensure-three — the
// tree the tool runs from, which is the served tree for every gate; a differential over another
// tree's --web validates against the running tree's catalog), duplicates are refused, and the
// refusal names the offending id(s) and exits 2. Tools that boot Chrome ALSO assert after boot that the
// page built the requested id (builtTableIdExpr) — a second, independent guard against any future
// fallback path.
import { ensureRealThree, repoUrl } from './ensure-three.mjs';

let cache = null;
export async function catalogTableIds() {
  if (cache) return cache;
  // FIX8 (Fable pass 1): the catalog load now precedes a selection-scoped removal in census-490 / check-coplanar-pairs, so a
  // load failure must be a refusal by name (exit 2), never a stack — and it removes nothing (the removal comes after)
  try {
    ensureRealThree();
    const { TABLE_SPECS } = await import(repoUrl('web/scene/table.js'));
    cache = Object.keys(TABLE_SPECS);
  } catch (e) {
    console.error(`[table-ids] REFUSED — the table catalog (web/scene/table.js of this tree) could not be loaded: ${e && e.message || e}; nothing was removed`);
    process.exit(2);
  }
  return cache;
}

/** Validate a table-id list (array or comma string). Refuses empty / blank / unknown ids: prints
 *  `[tag] REFUSED ...` naming the ids and exits 2. Returns the cleaned array. */
export async function requireTableIds(list, tag = 'table-ids') {
  const raw = Array.isArray(list) ? list : String(list ?? '').split(',');
  const ids = raw.map((s) => String(s ?? '').trim());
  if (!ids.length || ids.some((s) => !s)) {
    console.error(`[${tag}] REFUSED — empty table selection (${JSON.stringify(raw)}); name every table id explicitly`);
    process.exit(2);
  }
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) {
    console.error(`[${tag}] REFUSED — duplicate table id${dup.length > 1 ? 's' : ''} ${[...new Set(dup)].join(', ')}: a table booted twice doubles its rows`);
    process.exit(2);
  }
  const cat = new Set(await catalogTableIds());
  const bad = ids.filter((id) => !cat.has(id));
  if (bad.length) {
    console.error(`[${tag}] REFUSED — unknown table id${bad.length > 1 ? 's' : ''} ${bad.join(', ')}: not in the catalog (${[...cat].join(', ')}); nothing was booted or built`);
    process.exit(2);
  }
  return ids;
}

/** Page expression (a string for Runtime.evaluate) that returns the id the app actually BUILT:
 *  the obTable group's userData.tableId (web/scene/table.js sets it from the built record). */
export const builtTableIdExpr = `(() => {
  const scene = window.__dbg && window.__dbg.scene; let table = null;
  if (scene) scene.traverse((o) => { if (!table && o.name === 'obTable') table = o; });
  if (table && table.userData && table.userData.tableId) return table.userData.tableId;
  const q = new URLSearchParams(location.search); return 'unknown (no obTable.userData.tableId; requested ' + q.get('table') + ')';
})()`;

/** After boot: the built id must equal the requested id, else the tool stops (exit 2). A tree that
 *  predates the exposure (no obTable.userData.tableId — main before FIX1) has no built id to read;
 *  the default is still to REFUSE; `allowUnexposed` (the tool's explicit
 *  --allow-unexposed-built-id, for the tree-differential arm over such a tree) lets the run go on
 *  with a WARNING and returns false so the tool can record builtIdVerified: false. */
export const BUILT_ID_UNEXPOSED = 'unexposed';
export function assertBuiltTable(requested, built, tag = 'table-ids', allowUnexposed = false) {
  if (built === requested) return true;
  if (typeof built === 'string' && built.startsWith('unknown (no obTable.userData.tableId') && allowUnexposed) {
    console.error(`[${tag}] WARNING — this tree does not expose the built table id (pre-FIX1 web/scene/table.js); the requested '${requested}' is NOT verified against the page (--allow-unexposed-built-id)`);
    return false;
  }
  // thrown, not exited: the Chrome tools own a detached browser + static server and must run their
  // cleanup (a direct process.exit here left both alive on the band and the next run's probe failed)
  const e = new Error(`[${tag}] REFUSED — the page built '${built}' for the requested '${requested}' (a silent resolveBootTableId fallback, or a tree that does not expose the built id — pass --allow-unexposed-built-id only for a tree-differential over a pre-FIX1 tree); the run is void`);
  e.refused = true; throw e;
}
