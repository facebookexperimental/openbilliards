// Copyright (c) Meta Platforms, Inc. and affiliates.

// entry-489.mjs — FAIL-CLOSED --entry / --table resolution for the node builders that import a tree's
// web/scene/table.js DIRECTLY (GH-489 SNK-R35-FIX, review round 9 on #637 P2 class B).
//
// web/scene/table.js `specFor(id) = TABLE_SPECS[id] ?? TABLE_SPECS[SCRIPTED_PIN_TABLE_ID]` turns an unknown id into
// the scripted pin (wpa_generic_9ft) inside makeGeom() without a word — so `--entry wpbsa_snooker_12f` (misspelled)
// built the pool table, judged its six rails and PASSED under the snooker label (measured on ead3f1ee:
// check-loft-bands-489 6/6 PASS, exit 0). The rule: the entry is validated against the SELECTED tree's TABLE_SPECS
// BEFORE makeGeom; unknown → REFUSED by name (the id AND the tree it was looked up in, plus the known ids), exit 2;
// the label every report carries is the RESOLVED id, read back from the module's own record, never the argv string.
//
// Not tools/render/lib/table-ids.mjs: that helper reads the catalog of the tree the TOOL lives in (ensure-three /
// repoUrl), which is the wrong tree whenever --web names an archive; these builders import `T` from the selected
// tree themselves, so the check has to run on THAT module. Dependency-free on purpose (the tools run from bare
// `git archive` trees with nothing installed).

/** Resolve `requested` against the imported module's TABLE_SPECS. Prints `[<tool>] entry <id> (resolved in
 *  <webDir>)` to stderr and returns the resolved id (the catalog's own key); an absent catalog or an unknown id is
 *  REFUSED by name on stderr and exits 2 — nothing is built. */
export function resolveEntry(T, requested, { tool, webDir }) {
  const where = `${webDir}/scene/table.js`;
  const specs = T && T.TABLE_SPECS;
  if (!specs || typeof specs !== 'object' || !Object.prototype.hasOwnProperty.call(specs, requested)) {
    const known = specs && typeof specs === 'object' ? Object.keys(specs) : [];
    console.error(`[${tool}] REFUSED — unknown entry '${requested}' in ${where} (known: ${known.length ? known.join(', ') : 'no TABLE_SPECS export'})`);
    process.exit(2);
  }
  // the resolved id is the catalog's key, not the argv string (equal after the check above — but derived from the record)
  const id = Object.keys(specs).find((k) => k === requested);
  console.error(`[${tool}] entry ${id} (resolved in ${webDir})`);
  return id;
}
