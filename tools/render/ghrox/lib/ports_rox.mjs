// Copyright (c) Meta Platforms, Inc. and affiliates.

// ghrox CLI compatibility and analysis-only inventories. Shared code owns
// inventory syntax, endpoint bounds, declared bands and live claim ownership.
import path from 'node:path';
import { parsePortInventory, pendIntoOwnClaims, stripComments } from '../../../../web/tools/cdp.mjs';
import { argvPortPins, bandHome, parseBand } from '../../../../web/tools/lib/ci-bands.mjs';

export const PORT_INVENTORY = { http: 0, cdp: 0 };
export const PORT_FLAGS = { '--port': 'http', '--cdp': 'cdp' };

export function normalizeRoxArgs(args, flags = PORT_FLAGS, inventory = { http: 1, cdp: 1 }) {
  const out = [], seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const match = /^(--[^=]+)(?:=(.*))?$/.exec(args[i]);
    const key = match?.[1];
    if (!['--http', '--port', '--cdp'].includes(key)) { out.push(args[i]); continue; }
    const canonical = key === '--http' ? '--port' : key;
    if (seen.has(canonical)) throw new Error('ROX_PORT_ARGS_REFUSED: duplicate ' + canonical + ' (including aliases)');
    seen.add(canonical);
    const value = match[2] === undefined ? args[++i] : match[2];
    if (value === undefined || !/^\d+$/.test(value)) throw new Error('ROX_PORT_ARGS_REFUSED: ' + key + ' requires an integer port');
    out.push(canonical, value);
  }
  const { refusal } = argvPortPins(out, { flags }, inventory, { tool: 'ghrox' });
  if (refusal) throw new Error('ROX_PORT_ARGS_REFUSED: ' + refusal);
  return out;
}

export function parseRoxPortInventory(text) {
  // The shared harness reserves at least one HTTP/CDP pair. Analysis modules
  // open neither endpoint: adapt only that pair to the shared syntax parser,
  // which still rejects duplicates, expressions, mixed zeros and bad bounds.
  let zero = false;
  const normalized = stripComments(text, { keepLineComments: true }).replace(
    /^(\s*export\s+const\s+PORT_INVENTORY\b[^\n]*)$/gm, line => {
      const keys = [];
      const positive = line.replace(/\b(http|cdp)\s*:\s*0\b/g, (_, role) => { keys.push(role); return role + ': 1'; });
      if (keys.length !== 2 || new Set(keys).size !== 2) return line;
      zero = true; return positive;
    });
  const inventory = parsePortInventory(normalized);
  return zero && inventory ? { http: 0, cdp: 0 } : inventory;
}

export function holdRoxPortHome(port, declared) {
  // This supported shared API returns holds only for LIVE OWN claims. Keep
  // them through endpoint reservation; never read or reinterpret owner.json.
  const holds = pendIntoOwnClaims(port);
  const release = () => { for (const hold of holds) hold.release(); };
  try {
    const homes = holds.map(hold => {
      const match = /^(\d+-\d+)\.\d+$/.exec(path.basename(hold.dir));
      if (!match) throw new Error('ROX_PORT_REFUSED: unrecognized shared claim path ' + hold.dir);
      const range = parseBand(match[1]);
      return bandHome(declared, range.start, range.end);
    });
    return { hasBand: holds.length > 0, assignedHome: homes.find(Boolean) ?? null, release };
  } catch (error) { release(); throw error; }
}
