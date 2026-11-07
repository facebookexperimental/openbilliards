// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PORT_INVENTORY = { http: 0, cdp: 0 };

// Node resolves module URLs through symlinks; argv may retain the spelling
// supplied by the caller, including macOS /tmp versus /private/tmp.
export function isRoxMain(url, entry = process.argv[1]) {
  if (!entry) return false;
  try { return fs.realpathSync(entry) === fs.realpathSync(fileURLToPath(url)); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
