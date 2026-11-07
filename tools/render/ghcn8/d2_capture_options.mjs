// Copyright (c) Meta Platforms, Inc. and affiliates.

// Read-only, complete capture preflight. No directory creation or deletion.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const inside = (parent, child) => child === parent || child.startsWith(parent + path.sep);
const sealMarker = /^(?:D2-GEOMETRY-SEAL|D3-SEAL|COMPONENT-SEAL|SEAL|SEAL-MANIFEST|EVIDENCE-DIGESTS|DELIVERY)\.json$/;

// The verifier slice is an explicit D3-FIX1 orchestration allocation. Its
// exact pins do not authorize arbitrary ports in that or another lane.
export function capturePorts(env) {
  const ports = ['OB_E2E_PORT', 'OB_E2E_CDP_PORT'].map((key) => {
    if (!/^\d+$/.test(env[key] ?? '')) throw new Error(`Invalid ${key}: an integer port is required`);
    return Number(env[key]);
  });
  const [http, cdp] = ports;
  const original = ports.every((port) => Number.isInteger(port) && port >= 9580 && port <= 9609);
  const verifier = http === 9620 && cdp === 9635;
  if ((!original && !verifier) || http === cdp) {
    throw new Error('Invalid capture port allocation: run-gate --band 9580-9609, or authorized --band 9610-9639 with HTTP 9620 / CDP 9635; HTTP and CDP must differ');
  }
  return { http, cdp };
}

// Resolve the existing part as well: a symlink cannot bypass a sealed ancestor.
function canonicalDestination(file) {
  let parent = path.resolve(file);
  const suffix = [];
  while (!fs.existsSync(parent)) {
    const next = path.dirname(parent);
    if (next === parent) break;
    suffix.unshift(path.basename(parent)); parent = next;
  }
  return path.join(fs.realpathSync(parent), ...suffix);
}

export function sealedAncestor(destination, reservedPack) {
  const canonical = canonicalDestination(destination);
  const reserved = canonicalDestination(reservedPack);
  if (inside(reserved, canonical)) return reserved;
  for (let current = canonical; ; current = path.dirname(current)) {
    if (fs.existsSync(current) && fs.statSync(current).isDirectory()) {
      const names = fs.readdirSync(current);
      if (names.some((name) => sealMarker.test(name))
        || fs.existsSync(path.join(current, 'current/scout-summary.json'))) return current;
    }
    if (path.dirname(current) === current) break;
  }
  return null;
}

export function parseCaptureOptions(argv, env, { root, pack, resolveShell }) {
  const errors = [], values = {}, positional = [];
  const valueFlags = new Set(['--out', '--stage', '--baseline']);
  let wholeOnly = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--whole-only') {
      if (wholeOnly) errors.push('Repeated --whole-only');
      wholeOnly = true;
    } else if (valueFlags.has(arg)) {
      if (values[arg] !== undefined) errors.push(`Repeated ${arg}`);
      const value = argv[i + 1];
      if (!value?.trim() || value.startsWith('--') || value.includes('\0')) errors.push(`${arg} requires a path`);
      else { values[arg] = value; i++; }
    } else if (arg.startsWith('--')) errors.push(`Unknown option ${arg}`);
    else positional.push(arg);
  }
  const [tree, suppliedLabel] = positional;
  const label = suppliedLabel ?? tree;
  if (!['before', 'after'].includes(tree)) errors.push('Use before or after');
  if (positional.length > 2) errors.push('Too many positional arguments');
  if (!/^[a-z0-9-]+$/.test(label ?? '')) errors.push('Invalid capture label');
  const out = path.resolve(values['--out'] ?? path.join(pack, /^[a-z0-9-]+$/.test(label ?? '') ? label : 'invalid'));
  const stage = path.resolve(values['--stage'] ?? path.join(pack, 'stage'));
  const baseline = path.resolve(values['--baseline'] ?? path.join(pack, 'before/current'));
  try {
    const sealed = sealedAncestor(out, pack);
    if (sealed) errors.push(`Sealed destination refused: ${out} (sealed pack: ${sealed}); use --out with a fresh directory outside the pack`);
    else if (fs.existsSync(out)) errors.push(`Existing destination refused: ${out}; --out must be a new directory`);
    if (inside(canonicalDestination(stage), canonicalDestination(out))) errors.push(`Output cannot be inside the read-only stage: ${stage}`);
  } catch (error) { errors.push(`Destination preflight: ${error.message}`); }
  let ports;
  try { ports = capturePorts(env); } catch (error) {
    errors.push(error.message);
    // Name both missing inputs while completing the rest of preflight.
    if (!/^\d+$/.test(env.OB_E2E_CDP_PORT ?? '') && !error.message.includes('OB_E2E_CDP_PORT')) {
      errors.push('Invalid OB_E2E_CDP_PORT: an integer port is required');
    }
  }
  if (env.OB_CHROME_SHELL === '0') errors.push('OB_CHROME_SHELL=0 contradicts the pinned-shell requirement');
  let pin, shell;
  try {
    pin = fs.readFileSync(path.join(root, 'web/tools/chrome-shell.pin'), 'utf8').trim();
    shell = resolveShell();
    if (!shell.bin.includes(pin) || path.basename(shell.bin) !== 'chrome-headless-shell') throw new Error('Pinned chrome-headless-shell required');
    fs.accessSync(shell.bin, fs.constants.X_OK);
  } catch (error) { errors.push(`Browser preflight: ${error.message}`); }
  const mount = `/model-viewer/trees/${tree}/web`;
  let tableHash;
  if (['before', 'after'].includes(tree)) {
    try {
      const web = path.join(stage, mount.slice(1));
      tableHash = sha(fs.readFileSync(path.join(web, 'scene/table.js')));
      const expected = tree === 'before'
        ? JSON.parse(fs.readFileSync(path.join(pack, 'START.json'), 'utf8')).before_table_sha256
        : sha(fs.readFileSync(path.join(root, 'web/scene/table.js')));
      if (tableHash !== expected) throw new Error('Stage differs from declared source bytes');
      fs.accessSync(path.join(web, 'viewer.html'), fs.constants.R_OK);
      if (tree === 'after') for (const id of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
        const file = path.join(baseline, `${id}--whole.json`);
        if (!fs.existsSync(file)) continue;
        const pose = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (![pose.pos, pose.target].every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))
          || !(Number.isFinite(pose.fov) && pose.fov > 0 && pose.fov < 180)) throw new Error(`Invalid baseline pose: ${file}`);
      }
    } catch (error) { errors.push(`Stage preflight: ${error.message}`); }
  }
  if (errors.length) throw new Error(`Capture preflight refused:\n${errors.map((error) => `- ${error}`).join('\n')}`);
  return Object.freeze({ tree, label, wholeOnly, out, stage, baseline, mount, tableHash, pin, shell,
    http: ports.http, cdp: ports.cdp });
}
