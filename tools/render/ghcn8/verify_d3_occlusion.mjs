// Copyright (c) Meta Platforms, Inc. and affiliates.

// O1 is now included in the complete ORDER-12 O2 census. A cover-only
// capture cannot validate the active renderer. Historical FIX4 receipts keep
// their archived verifier and source binding; this entry checks the full set.
import { fileURLToPath } from 'node:url';
import { main } from './verify_d3_solids.mjs';
export { main } from './verify_d3_solids.mjs';
if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
