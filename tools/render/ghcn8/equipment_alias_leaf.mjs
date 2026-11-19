// Copyright (c) Meta Platforms, Inc. and affiliates.

// The REAL web/scene/equipmentalias.js leaf, shared by the node fixtures whose
// production slices read the equipmentAlias namespace (table.js
// prepareEquipment; settings.js migratedEquipmentId). They bind this module
// namespace, never a stand-in. The leaf must stay import-free: an import edge
// would load app modules into a fixture unseen, so it is refused here. Its
// sha256 is printed once per run, so an alias-table change that could move a
// fixture's table ids shows up in the record.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as equipmentAlias from '../../../web/scene/equipmentalias.js';

const LEAF = 'web/scene/equipmentalias.js';
const leafText = fs.readFileSync(new URL('../../../' + LEAF, import.meta.url), 'utf8');
export const IMPORT_EDGE = /^\s*import\b|\bimport\s*\(|\brequire\s*\(|^\s*export\b[^;]*\bfrom\s*['"]/m;
if (IMPORT_EDGE.test(leafText)) {
  throw new Error(LEAF + ' is no longer import-free; the ghcn8 fixtures bind it as a leaf');
}
console.log('SUPPLY equipmentAlias: ' + LEAF + ' sha256=' + createHash('sha256').update(leafText).digest('hex'));

export { equipmentAlias };
