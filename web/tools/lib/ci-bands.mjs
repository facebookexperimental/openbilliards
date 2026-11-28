// Copyright (c) Meta Platforms, Inc. and affiliates.

// lib/ci-bands.mjs — the CI job → port-band table has ONE owner (GH-687).
//
// The self-hosted runner (one box, one worker) shares its ports with the
// development sessions on the same Mac. Every CI browser job pins a fixed
// band (`OB_E2E_PORT` / `OB_E2E_CDP_PORT` in the job env, `--band A-B` on
// every run-gate step), and any local session that wraps a suite onto one
// of those bands holds a LIVE registry claim the CI job then refuses —
// correctly, fail-closed under GH-338 — and the job goes red with nothing
// wrong in the tree (issue #687: e2e-atelier and e2e-replays on main's own
// dabc57cf run, 1-3 browser jobs per run over 24 h).
//
// This module makes the collision impossible instead of unlucky:
//   * web/tools/ci-bands.json is the single committed table — a reserved
//     range plus one row per CI job (workflow, job, band, env pins);
//   * claimPortBand (cdp.mjs — the ONE choke point every claimer passes:
//     run-gate's assigned and widened claims, and the tools that claim a
//     default band directly) REFUSES any band that intersects the reserved
//     range unless the process provably IS a CI job (GITHUB_ACTIONS=true,
//     the runner's own env) or the operator says so explicitly
//     (OB_CI_BANDS=1, for reproducing a CI job by hand); run-gate repeats
//     the check at its argv seam for the early, named message and refuses
//     an explicit env pin inside the range too (ciBandRefusal names the
//     job whose band it is);
//   * every workflow file is LINTED against the table (lintCiBands, run by
//     the ci.yml `ci-bands-lint` job and by hygiene arm 8g on every
//     export): each job's band literals equal its row, its env pins lie
//     inside its band (and their declared derivation tails too), every
//     band lies inside the reserved range, no two rows intersect, and no
//     tool in the DERIVED scan set (deriveScanFiles: every tracked JS/shell
//     module that drives the harness) defaults a port or band into the range.
//     ci.yml stays hand-maintained; the lint is what makes the table the
//     one source (a generator would have to own 1000+ unrelated lines).
// No allowlist, no retry widening: a refused local claim is a refusal.
//
// Pure by construction (no sockets, no registry): hygiene arm 8g drives
// every rule with inline fixtures and red-proofs the refusal against a
// run-gate that lacks it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
// the harness's own inventory parser — one reading of PORT_INVENTORY for the
// lint and for run-gate (cdp.mjs imports this module lazily at claim time,
// so the static import here forms no evaluation cycle)
import { parsePortInventory, bandWidthForInventory, parsePortFlags, stripComments, blankStrings, jsScanCertificate } from '../cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The repository root (lib → web/tools → web → repo): the derived scan
 * root set is listed from here with git ls-files. */
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
/** The committed table. */
export const CI_BANDS_FILE = path.resolve(HERE, '..', 'ci-bands.json');
/** The committed LANE band table (the development Mac's declared lane
 * bands, beside the CI one): no tool default may sit inside any of them. */
export const LANE_BANDS_FILE = path.resolve(HERE, '..', 'lane-bands.json');
/** Workflow files the lint reads, resolved from the repo root. */
export const WORKFLOWS_DIR = path.resolve(HERE, '..', '..', '..', '.github', 'workflows');
/** The env pins a job may carry; each must lie inside the job's band. */
// a CI row may pin any listed non-band name (derived from PIN_NAMES below — no list of its own)
export const CI_BAND_PIN_KEYS = ['OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_CDP_PORT', 'OB_BATCH_PORT_BASE', 'OB_TITLECARD_PORT', 'OB_MOCK_HTTP_PORT', 'OB_MOCK_CDP_PORT'];

/** Drop a `//` comment from one YAML/JS line (a `//` inside a quoted string
 * or a `://` URL is kept). */
const stripLineComment = (l) => l.replace(/^\s*\/\/.*$/, '').replace(/(^|[^:'"`])\/\/(?![^'"`]*['"`][^'"`]*$).*$/, '$1');


/** 'A-B' → { start, end } (inclusive), or throws. */
export function parseBand(str) {
  const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(String(str ?? ''));
  if (!m) throw new Error(`band "${str}" is not start-end`);
  const start = Number(m[1]); const end = Number(m[2]);
  if (!(start >= 1024 && end <= 65535 && start <= end)) {
    throw new Error(`band "${str}" is not a valid range (need 1024 <= start <= end <= 65535)`);
  }
  return { start, end };
}

export const bandsIntersect = (a, b) => a.start <= b.end && b.start <= a.end;
export const bandCovers = (band, port) => port >= band.start && port <= band.end;
export const bandStr = (b) => `${b.start}-${b.end}`;

/** A process is a CI job when the runner says so, or the operator says so
 * explicitly. Nothing else (no hostname, no path heuristics). */
export function isCiContext(env = process.env) {
  return env.GITHUB_ACTIONS === 'true' || env.OB_CI_BANDS === '1';
}

/** Shape-validate a parsed table; returns it with bands parsed onto each
 * row (`row.range`). Throws on any malformation — a broken table must never
 * silently disable the refusal. Row-vs-row overlap is a LINT verdict
 * (reported with both names), not a load-time throw: the refusal still
 * works on an overlapping table, the lint is what fails the workflow. */
export function validateCiBands(table) {
  if (!table || typeof table !== 'object') throw new Error('ci-bands: table is not an object');
  if (table.v !== 1) throw new Error(`ci-bands: unsupported table version ${table.v}`);
  const reserved = table.reserved && parseBand(`${table.reserved.start}-${table.reserved.end}`);
  if (!reserved) throw new Error('ci-bands: missing reserved range');
  if (!Array.isArray(table.jobs) || table.jobs.length === 0) throw new Error('ci-bands: jobs must be a non-empty array');
  const seen = new Set();
  for (const row of table.jobs) {
    if (typeof row.workflow !== 'string' || !/^[\w.-]+\.yml$/.test(row.workflow)) {
      throw new Error(`ci-bands: row ${JSON.stringify(row)} has no workflow file name`);
    }
    if (typeof row.job !== 'string' || !/^[A-Za-z0-9_-]+$/.test(row.job)) {
      throw new Error(`ci-bands: row ${JSON.stringify(row)} has no job id`);
    }
    const key = `${row.workflow}:${row.job}`;
    if (seen.has(key)) throw new Error(`ci-bands: duplicate row ${key}`);
    seen.add(key);
    row.range = parseBand(row.band);
    if (!(row.range.start >= reserved.start && row.range.end <= reserved.end)) {
      throw new Error(`ci-bands: ${key} band ${row.band} lies outside the reserved `
        + `range ${bandStr(reserved)}`);
    }
    row.pins = row.pins ?? {};
    // the SUITE FILES the job runs (review r8 P2: hand-copied inventory counts
    // drifted from the suites; inventories are now READ from these files)
    if (row.inventory !== undefined) throw new Error(`ci-bands: ${key} carries a hand \`inventory\` — declare \`suites\` and let the lint read PORT_INVENTORY`);
    if (!Array.isArray(row.suites) || row.suites.length === 0 || !row.suites.every((f) => /^[\w.-]+\.mjs$/.test(f))) {
      throw new Error(`ci-bands: ${key} must list its suite files in \`suites\` (web/tools/*.mjs basenames)`);
    }
    for (const [k, v] of Object.entries(row.pins)) {
      if (!CI_BAND_PIN_KEYS.includes(k)) throw new Error(`ci-bands: ${key} has an unknown pin ${k}`);
      if (!Number.isInteger(v) || !bandCovers(row.range, v)) {
        throw new Error(`ci-bands: ${key} pin ${k}=${v} lies outside its band ${row.band}`);
      }
    }
  }
  table.reservedRange = reserved;
  return table;
}

export function loadCiBands(file = CI_BANDS_FILE) {
  return validateCiBands(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/** Shape-validate the lane table: named rows, parseable bands, disjoint
 * from each other and (when the CI table is given) from the CI reserved
 * range. Returns it with `row.range` set. */
export function validateLaneBands(table, ciTable = null) {
  if (!table || typeof table !== 'object') throw new Error('lane-bands: table is not an object');
  if (table.v !== 1) throw new Error(`lane-bands: unsupported table version ${table.v}`);
  if (!Array.isArray(table.bands) || table.bands.length === 0) throw new Error('lane-bands: bands must be a non-empty array');
  const seen = new Set();
  for (const row of table.bands) {
    if (typeof row.lane !== 'string' || !/^[A-Za-z0-9_-]+$/.test(row.lane)) {
      throw new Error(`lane-bands: row ${JSON.stringify(row)} has no lane id`);
    }
    row.legacy = row.legacy === true;
    // one PLAN row per lane; a lane may also keep ONE legacy row until a date
    const key = `${row.lane}${row.legacy ? ':legacy' : ''}`;
    if (seen.has(key)) throw new Error(`lane-bands: duplicate ${row.legacy ? 'legacy ' : ''}row for lane ${row.lane}`);
    seen.add(key);
    row.range = parseBand(row.band);
    if (row.legacy) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.until ?? '')) || Number.isNaN(Date.parse(`${row.until}T00:00:00Z`))) {
        throw new Error(`lane-bands: legacy row ${row.lane} ${row.band} needs an ISO date in \`until\``);
      }
      row.untilMs = Date.parse(`${row.until}T00:00:00Z`);
    } else if (row.range.end - row.range.start + 1 < 30) {
      // a plan row narrower than the layout minimum cannot be claimed at all
      // (claimPortBand refuses < 30) — refused at load, never a dead row
      throw new Error(`lane-bands: plan row ${row.lane} ${row.band} is narrower than the 30-port layout minimum`);
    }
    if (ciTable?.reservedRange && bandsIntersect(row.range, ciTable.reservedRange)) {
      throw new Error(`lane-bands: ${row.lane} ${row.band} intersects the CI reserved range ${bandStr(ciTable.reservedRange)}`);
    }
  }
  for (let i = 0; i < table.bands.length; i++) {
    for (let j = i + 1; j < table.bands.length; j++) {
      const a = table.bands[i]; const b = table.bands[j];
      if (bandsIntersect(a.range, b.range)) throw new Error(`lane-bands: ${a.lane} ${a.band}${a.legacy ? ' (legacy)' : ''} intersects ${b.lane} ${b.band}${b.legacy ? ' (legacy)' : ''}`);
    }
  }
  return table;
}

/** Every declared band on the box as one list — the CI reserved range, the
 * lane PLAN rows and the lane LEGACY rows — for run-gate's boundary law:
 * a claim never widens across any of them. */
export function declaredBands(ciTable, laneTable = null) {
  const out = [{ kind: 'ci-reserved', name: 'the CI reserved range', range: ciTable.reservedRange }];
  for (const r of laneTable?.bands ?? []) {
    out.push({ kind: r.legacy ? 'lane-legacy' : 'lane-plan', name: `the ${r.lane} lane's ${r.legacy ? 'legacy ' : ''}band ${r.band}`, range: r.range, lane: r.lane, legacy: r.legacy, row: r });
  }
  return out;
}

/** The declared band an assigned band lies INSIDE (null when it lies in
 * undeclared space). A band that straddles a boundary has no home. */
export function bandHome(declared, start, end) {
  return declared.find((d) => start >= d.range.start && end <= d.range.end) ?? null;
}

/** THE boundary predicate (review r9 P2-2 — ONE predicate, THREE call
 * sites: run-gate judges the ASSIGNED band, every WIDENING candidate and
 * every env/argv PIN with it; before r9 only the widening path asked, so a
 * valid-width `--band 9400-9459` spanning two lane rows, or 9380-9409
 * entering one from undeclared space, was claimed directly). A port range
 * is legal iff it lies entirely inside ONE declared band (its home; when
 * `home` is given, THAT band) or entirely in undeclared space. Returns
 * { ok, home, touched, reason } — `touched` names every declared band the
 * range intersects (minus the home when it leaves one), so every refusal
 * names all the bands the range spans. */
export function bandBoundary(declared, start, end, home) {
  // `home`: undefined = the range seeks its own home (an ASSIGNED band may lie
  // inside one declared band); null = the caller's home IS undeclared space (a
  // widening candidate or a pin of a band that lies there — the range must
  // then touch no declared band at all, the r6 law); a band = stay inside it
  if (!(Number.isFinite(start) && Number.isFinite(end) && start <= end)) throw new Error(`bandBoundary: not a range (${start}-${end})`);
  const q = { start, end };
  const inside = (d) => start >= d.range.start && end <= d.range.end;
  const touched = declared.filter((d) => bandsIntersect(d.range, q));
  if (home) {
    return inside(home) ? { ok: true, home, touched, reason: 'inside-home' }
      : { ok: false, home, touched: touched.filter((d) => d !== home), reason: 'leaves-home' };
  }
  if (!touched.length) return { ok: true, home: null, touched, reason: 'undeclared' };
  if (home === undefined && touched.length === 1 && inside(touched[0])) return { ok: true, home: touched[0], touched, reason: 'inside' };
  return { ok: false, home: null, touched, reason: touched.length > 1 ? 'spans' : 'enters' };
}

/** The predicate's refusal sentence (null when legal). `what` is the range
 * as the call site names it (`--band A-B`, `candidate A-B`); `law` keeps the
 * widening site's historic wording ('widens across'). */
export function boundaryRefusal(declared, start, end, opts = {}) {
  const { what = `band ${start}-${end}`, law = 'crosses' } = opts;
  const home = Object.prototype.hasOwnProperty.call(opts, 'home') ? opts.home : undefined; // null is a meaning, not an absence
  const v = bandBoundary(declared, start, end, home);
  if (v.ok) return null;
  const names = v.touched.map((n) => n.name).join(' and ');
  if (v.reason === 'leaves-home') {
    return `${what} leaves ${home.name} (${bandStr(home.range)})${names ? ` into ${names}` : ''}`
      + ` — a claim never ${law} a declared band boundary`;
  }
  return `${what} ${v.reason} ${names} — a claim never ${law} a declared band boundary`
    + (law === 'crosses' ? '; claim ONE declared band whole, or a range in undeclared space' : '');
}

/** run-gate's widening law (owner ruling 2026-09-07 after review r6 P1): a
 * candidate may never cross a declared boundary — the same predicate,
 * with the widening site's wording. */
export function crossingRefusal(declared, home, start, end) {
  return boundaryRefusal(declared, start, end, { what: `candidate ${start}-${end}`, home, law: 'widens across' });
}

export function loadLaneBands(file = LANE_BANDS_FILE, ciTable = null) {
  return validateLaneBands(JSON.parse(fs.readFileSync(file, 'utf8')), ciTable);
}

/** Every port-like PIN in an env, keyed by NAME (review r8 P2: a bandless
 * run-gate with OB_E2E_PORT=19100 walked onto a CI port because only the
 * --band branch validated). The name rule: OB_* containing PORT, CDP,
 * BAND_START, BAND_END or _BASE, with an integer value in the port range;
 * timing/count knobs (…_MS, …_TRIES, …_FAILS, …_SCALE) and the registry's
 * own OB_PORT_BANDS (a lineage list) / OB_PORT_BANDS_DIR (a path) are not
 * pins. OB_E2E_BAND_START/END pair up as one range. */
/** THE pin-name list (companion to #705, review round 12 P2: run-gate's
 * GH-410 pin hull read OB_E2E_CDP_PORT only while the env-pin validation
 * keyed on a NAME RULE — two lists that drifted, and a nested browser handed
 * OB_CDP_PORT bound an unclaimed port outside the claim). Every OB_* env
 * name the tree's tools read as a port lives HERE with its role; refusal
 * (pinEnvEntries / pinRefusal), the extents (run-gate's pin hull) and the
 * widening rule all consume this list and nothing else. `layout: true`
 * marks the two names the claim's layout exports to the child (a CLI flag of
 * the same declared role outranks them); the others are EXTRA pins (a nested
 * browser's port, a batch base) that never replace a derived half. The lint
 * (pin-name-drift) fails when any tracked tool or harness file reads a
 * pin-like OB_* name that is not listed. */
export const PIN_NAMES = Object.freeze({
  // layout pins derive the suite's whole inventory of their role; an EXTRA pin's
  // extent is `width` ports (1 = the tool honours the value EXACTLY — refuter on the
  // companion: sizing OB_CDP_PORT by the suite's cdp inventory pushed the nightly
  // battery job's hull past its CI band into e2e-settings' row)
  OB_E2E_PORT: { role: 'http', layout: true },
  OB_E2E_CDP_PORT: { role: 'cdp', layout: true },
  OB_CDP_PORT: { role: 'cdp', width: 1 },          // scenario-render / hero-extend-render / probes: honoured EXACTLY as the CDP port
  OB_E2E_BAND_START: { role: 'band' },             // capture-626-*: a pinned band, paired with OB_E2E_BAND_END (self-claimed by the tool)
  OB_E2E_BAND_END: { role: 'band' },
  // BASE pins generate a RANGE (companion review r1 P2-2): the model's `span` is DERIVED
  // from the tool's own code by basePinSpanUsed (lint row pin-model-drift holds them equal)
  OB_BATCH_PORT_BASE: { role: 'cdp', model: { kind: 'base', span: 270, via: 'reservePort(base + (slot % 12) * 20) for the CDP port and reservePort(base + (slot % 12) * 20 + 10) for the child http port: 12 strides of 20, +10, a 40-port probe (companion review r9: the child is pinned, never left to derive)' } }, // scenario-batch
  OB_TITLECARD_PORT: { role: 'cdp', model: { kind: 'base', span: 103, via: 'withCardSession(port | port + 41) → reservePort(portBase + pid % 23), 40-port probes' } }, // scenario-titlecard
  OB_MOCK_HTTP_PORT: { role: 'http', width: 1 },   // feature 030 (internal spec) mockup capture tools
  OB_MOCK_CDP_PORT: { role: 'cdp', width: 1 },
  // venue-lighting lane (GH-638, PR #727 — ORDER-LIGHT-C2-FIX1 after NOTE-725-LANDED): lighting-capture.mjs / lighting-eval.mjs claim
  // OB_LIGHTING_BAND_START..END as the lane's band (the plan band 9490-9519 arrives from the untracked chain driver's environment; the
  // tracked defaults 16940-16969 sit in undeclared space) and honour OB_LIGHTING_PORT / OB_LIGHTING_CDP EXACTLY inside it
  OB_LIGHTING_BAND_START: { role: 'band' },
  OB_LIGHTING_BAND_END: { role: 'band' },
  OB_LIGHTING_PORT: { role: 'http', width: 1 },
  OB_LIGHTING_CDP: { role: 'cdp', width: 1 },
});
/** The regex form of the list's names (the workflow parser and the table lint
 * use it — no second list of literals). */
export const PIN_NAME_RE_SRC = Object.keys(PIN_NAMES).join('|');

/** THE width of a pin, from PIN_NAMES only (companion review r1 P2-1: run-gate
 * widened every env pin by the suite inventory even when the list said width
 * 1): a LAYOUT name derives the suite's inventory of its role; a BASE name its
 * model's span; every other listed name its width (1 = honoured exactly); a
 * declared CLI flag (`--x`, argv) is a base of the tool's own — the inventory. */
export function pinWidthOf(pin, inventory) {
  if (pin.key.startsWith('--')) return inventory?.[pin.role] ?? 1;
  const spec = PIN_NAMES[pin.key];
  if (!spec) return 1;
  if (spec.layout) return inventory?.[spec.role] ?? 1;
  if (spec.model?.kind === 'base') return spec.model.span;
  return spec.width ?? 1;
}
export function pinExtentOf(pin, inventory) {
  const w = pinWidthOf(pin, inventory);
  return { start: pin.value, end: pin.value + w - 1 };
}

/** THE extents function (run-gate's GH-410 hull AND the table lint's pin-tail
 * rule call this one): the LAYOUT pin of each role — a CLI flag of that
 * declared role outranks the layout env name — derives `inventory[role]`
 * slots; every other listed pin is an EXTRA extent of its own width (a
 * declared CLI flag beyond the first of its role: the inventory, the tool
 * declared it as a base of its own). `envPins` are pinEnvEntries entries,
 * `cliPins` argvPortPins entries (both may be empty). Without an inventory
 * there are no extents (nothing can size them). */
/** A same-role CLI flag SHADOWS the layout env pin (companion review r2 P2-1):
 * the suites' own convention is `argOf('--port') ?? process.env.OB_E2E_PORT`
 * — one pin, never two. The shadowed env pin leaves the extents, the
 * collision check and the placement refusal alike (the tool never binds it). */
export function unshadowedEnvPins(envPins, cliPins) {
  const cliRoles = new Set((cliPins ?? []).map((p) => p.role));
  return (envPins ?? []).filter((p) => !(p.layout && cliRoles.has(p.role)));
}
/** The complement — each shadowed layout env pin paired with the CLI flag that
 * shadows it. Defined THROUGH unshadowedEnvPins so there is one shadow rule;
 * run-gate uses it to make the child's env FOLLOW the flag (a nested reader of
 * the env name must see the claimed value, never the shadowed one). */
export function shadowedEnvPins(envPins, cliPins) {
  const live = new Set(unshadowedEnvPins(envPins, cliPins));
  return (envPins ?? []).filter((p) => !live.has(p)).map((p) => ({ pin: p, flag: (cliPins ?? []).find((c) => c.role === p.role) }));
}
export function pinExtentsFor(envPins, cliPins, inventory) {
  if (!inventory) return [];
  const out = [];
  const live = unshadowedEnvPins(envPins, cliPins);
  for (const role of ['http', 'cdp']) {
    const width = inventory[role];
    const cli = (cliPins ?? []).find((p) => p.role === role);
    const layoutEnv = live.find((p) => p.role === role && p.layout);
    const lead = cli ?? layoutEnv;
    if (lead) out.push({ kind: role, name: lead.key, layout: true, lo: lead.value, hi: lead.value + width - 1 });
    for (const p of [...(cliPins ?? []), ...live]) {
      if (p.role !== role || p === lead) continue;
      const w = pinWidthOf(p, inventory); // ONE width source
      out.push({ kind: role, name: p.key, layout: false, lo: p.value, hi: p.value + w - 1 });
    }
  }
  return out;
}
/** A table row's pins as pinEnvEntries-shaped entries (roles from the list). */
export function rowPinEntries(pins) {
  return Object.entries(pins ?? {}).filter(([k, v]) => Number.isFinite(Number(v)) && PIN_NAMES[k] && PIN_NAMES[k].role !== 'band')
    .map(([k, v]) => ({ key: k, value: Number(v), range: { start: Number(v), end: Number(v) }, role: PIN_NAMES[k].role, layout: !!PIN_NAMES[k].layout }));
}
/** The harness files whose OB_* pin reads the drift lint holds to PIN_NAMES
 * (run-gate / claim code — the fixtures-heavy hygiene suite is judged by its
 * own arms, not by this scan). */
export const HARNESS_PIN_READERS = ['web/tools/run-gate.mjs', 'web/tools/cdp.mjs', 'web/tools/lib/ci-bands.mjs', 'web/tools/lib/pacing.mjs', 'web/tools/e2e-retry.mjs', 'web/tools/touch-cdp.mjs'];

/** Every pin-like OB_* env name a source READS (`process.env.OB_X`,
 * `process.env['OB_X']`, `env.OB_X` after a destructure is NOT followed), with
 * comments and strings blanked first so a fixture string never counts. */
export function pinNamesRead(text) {
  const noComments = stripComments(text);
  // quoted strings are blanked (a fixture string never counts) but TEMPLATE literals are kept:
  // `${process.env.OB_X}` is a real read; the bracket form `process.env['OB_X']` is matched
  // before the blanking because its key IS a quoted string
  const dotted = noComments.replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, (m) => ' '.repeat(m.length));
  const out = new Map();
  const at = (src, i) => src.slice(0, i).split('\n').length;
  for (const m of noComments.matchAll(/process\.env\??\[\s*(["'`])([A-Z][A-Z0-9_]*)\1\s*\]/g)) { if (isPinName(m[2]) && !out.has(m[2])) out.set(m[2], at(noComments, m.index)); }
  for (const m of dotted.matchAll(/process\.env\??\.([A-Z][A-Z0-9_]*)/g)) { if (isPinName(m[1]) && !out.has(m[1])) out.set(m[1], at(dotted, m.index)); }
  return out;
}
/** The extent a tool GENERATES from an env base (companion review r1 P2-2):
 * `basePinSpanUsed(text, 'OB_TITLECARD_PORT')` → { span, how, unknown }.
 * Read statically from the tool's own code: every binding of the env name
 * (`const port = (Number(process.env.X) || 12920) + 41` — the binding's own
 * offset counts), then every use of that local — `port: L (+ term)` (one
 * port), a call `P(L + term)` where `function P(base, tries = N)` scans
 * `base + tries` (a PROBE window of N), or a call `F(…, L + term, …)` into a
 * user function (ONE hop: the derivation continues on F's parameter inside
 * F's body). Terms are read like the CDP offsets: a literal, `(X % M)` →
 * M − 1, `(X % M) * k` → (M − 1)·k, a loop variable by its enclosing loop.
 * span = 1 + the highest reachable offset; an unreadable term is UNKNOWN
 * (fail-closed). */
export function basePinSpanUsed(text, envName) {
  // the env read becomes a pseudo-local `__ENV__` (no newlines added) so DIRECT uses
  // (`port: Number(process.env.X)`) and bindings share one rule set
  const ENV = '__ENV__';
  const esc = envName.replace(/[$]/g, '\\$');
  const src0 = stripComments(text)
    .replace(new RegExp(`Number\\(\\s*process\\.env\\??(?:\\.${esc}\\b|\\[\\s*["'\`]${esc}["'\`]\\s*\\])\\s*\\)`, 'g'), ENV)
    .replace(new RegExp(`\\+?process\\.env\\??(?:\\.${esc}\\b|\\[\\s*["'\`]${esc}["'\`]\\s*\\])`, 'g'), ENV);
  const templLines = src0.split('\n'); // strings intact: `${L}` template uses are read here
  const src = blankStrings(src0);
  const lines = src.split('\n');
  const unknown = []; const how = []; let max = null;
  uncertifiedRow(text, unknown); // same law for the pin-span reader: an uncertified source yields no span, with the reason named
  const bodyRange = (openIdx) => {
    let depth = 0; let i = openIdx;
    for (; i < src.length; i++) { const c = src[i]; if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) break; } }
    return [src.slice(0, openIdx).split('\n').length - 1, src.slice(0, i).split('\n').length];
  };
  // probe functions: function P(base, tries = N) whose body scans `for (…; … < base + tries; …)`
  const probes = new Map(); const fns = new Map();
  const declRe = /(?:function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>\s*\{|^\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{)/gm; // function / arrow-const / method
  for (const m of src.matchAll(declRe)) {
    const name = m[1] ?? m[3] ?? m[5]; const plist = m[2] ?? m[4] ?? m[6];
    if (!name || ['if', 'for', 'while', 'switch', 'catch', 'function'].includes(name)) continue;
    const params = plist.split(',').map((x) => x.trim().split('=')[0].trim()).filter(Boolean);
    const range = bodyRange(m.index + m[0].length - 1);
    fns.set(name, { params, range });
    const tries = /^\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*=\s*(\d+)\s*(?:,.*)?$/.exec(plist); // a trailing param (the derived-endpoint spec) does not hide the probe
    const loop = tries && new RegExp(`for\\s*\\([^;]*;[^;]*(<=?)\\s*${tries[1]}\\s*\\+\\s*${tries[2]}\\b`).exec(lines.slice(range[0], range[1]).join('\n'));
    if (loop) probes.set(name, { tries: Number(tries[3]), idx: 1, plusOne: loop[1] === '<=' ? 1 : 0 });
  }
  // the shared allocator (lib/endpoint-pair.mjs, companion review r10): reserveEndpoint(base, tries = 40, spec, opts) and
  // reserveEndpointPair(cdpBase, httpBase, tries = 40, specs, opts) probe `tries` candidates from each base argument
  if (/from\s+['"](?:\.\.?\/)+(?:lib\/)?endpoint-pair\.mjs['"]/.test(src0)) {
    probes.set('reserveEndpoint', { tries: 40, idx: 1, plusOne: 0 });
    probes.set('reserveEndpointPair', { tries: 40, idx: 2, plusOne: 0 });
  }
  const constLit = (name) => { const m = new RegExp(`^\\s*(?:export\\s+)?const\\s+${name}\\s*=\\s*(\\d+)\\s*;`, 'm').exec(src); return m ? +m[1] : null; };
  const modulus = (x) => (/^\d+$/.test(x) ? +x : constLit(x));
  const termOne = (t, i) => {
    t = t.trim(); if (t === '') return 0;
    let m; let M;
    if (/^\d+$/.test(t)) return +t;
    if ((m = /^\(?\s*[A-Za-z_$][\w$.]*(?:\+\+)?\s*%\s*([A-Za-z_$][\w$]*|\d+)\s*\)?$/.exec(t)) && (M = modulus(m[1])) !== null) return M - 1;
    if ((m = /^\(\s*[A-Za-z_$][\w$.]*(?:\+\+)?\s*%\s*([A-Za-z_$][\w$]*|\d+)\s*\)\s*\*\s*(\d+)$/.exec(t)) && (M = modulus(m[1])) !== null) return (M - 1) * +m[2];
    if ((m = /^([A-Za-z_$][\w$]*)$/.exec(t))) {
      for (let j = i; j >= 0; j--) { const l = /for\s*\(let\s+(\w+)\s*=\s*(\d+)\s*;\s*\1\s*(<=?)\s*(\d+)/.exec(lines[j]); if (l && l[1] === m[1]) return l[3] === '<' ? +l[4] - 1 : +l[4]; }
      return null;
    }
    return null;
  };
  const term = (t, i) => { // `+`-joined terms sum (companion review r9: `(slot % SLOT_CAP) * 20 + 10` — the child http reservation beside the cdp one)
    t = t.trim(); if (t === '') return 0;
    const parts = []; let d = 0; let cur = '';
    for (const c of t) { if (c === '(') d++; else if (c === ')') d--; if (c === '+' && d === 0) { parts.push(cur); cur = ''; } else cur += c; }
    parts.push(cur);
    if (parts.length === 1) return termOne(t, i);
    let sum = 0; for (const p of parts) { const v = termOne(p, i); if (v === null) return null; sum += v; } return sum;
  };
  const args = (str) => { const out = []; let depth = 0; let cur = ''; for (const c of str) { if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--; if (c === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += c; } if (cur.trim()) out.push(cur); return out.map((x) => x.trim()); };
  const scopeOf = (line) => { let best = [0, lines.length]; for (const { range } of fns.values()) if (range[0] <= line && line < range[1] && range[1] - range[0] < best[1] - best[0]) best = range; return best; };
  const noteMax = (v, why) => { if (max === null || v > max) max = v; how.push(why); };
  if (!src.includes(ENV)) return { span: null, how: [], unknown: [...unknown, { line: 0, expr: envName, why: 'no binding of the env name found' }] };
  const work = [];
  const stripDefault = (r) => { // drop a `?? <default>` / `|| <default>` whatever the default's shape (a literal, a parenthesised expression)
    const m = new RegExp(`^(\\(*\\s*\\+?${ENV}\\s*)(?:\\?\\?|\\|\\|)\\s*`).exec(r); if (!m) return r;
    let k = m[0].length; if (r[k] === '(') { let d = 0; for (; k < r.length; k++) { if (r[k] === '(') d++; else if (r[k] === ')') { d--; if (d === 0) { k++; break; } } } } else { const lit = /^['"]?\d+['"]?/.exec(r.slice(k)); if (!lit) return r; k += lit[0].length; }
    return m[1] + r.slice(k);
  };
  lines.forEach((l, i) => { // bindings: const L = <rhs that STARTS with the env value (a call merely containing it is a direct use, read below)>
    const b = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.*)$/.exec(l);
    if (!b) return;
    let rhsRaw = b[2];
    for (let k = i + 1; k < Math.min(lines.length, i + 6) && !/;\s*$/.test(rhsRaw) && !/^\s*(?:const|let|var|for|if|return)\b/.test(lines[k]); k++) rhsRaw += ' ' + lines[k].trim(); // a statement continued on the next lines
    if (!rhsRaw.includes(ENV)) return;
    if (new RegExp(`^\\s*${ENV}\\s*(?:!==|===|!=|==)\\s*undefined\\s*;?\\s*$`).test(rhsRaw)) return; // a boolean "is it pinned", not a port
    const rhs = stripDefault(rhsRaw.replace(/;\s*$/, '').trim().replace(/\bNumber\(/g, '(').replace(/\bawait\s+/g, '')); // Number(x) is a plain paren here
    // a ternary on the pin: `__ENV__ !== undefined ? <pinned> : <derived>` — the PINNED branch decides
    const tern = new RegExp(`${ENV}\\s*!==\\s*undefined\\s*\\?\\s*([^:?]+?)\\s*:`).exec(rhs);
    if (tern) {
      if (new RegExp(`^\\(?\\s*${ENV}\\s*\\)?$`).test(tern[1].trim())) { noteMax(0, `${b[1]}: the pinned branch is the exact value (line ${i + 1})`); return; }
      unknown.push({ line: i + 1, expr: tern[1].trim().slice(0, 60), why: 'the pinned branch derives from the value' }); return;
    }
    if (!new RegExp(`^\\(*\\s*\\+?${ENV}\\b`).test(rhs)) return; // not a binding OF the value
    const noNullish = rhs.replace(/\?\?/g, '');
    if (/=>/.test(rhs) || /\?/.test(noNullish)) { unknown.push({ line: i + 1, expr: rhs.slice(0, 60), why: 'the env value is computed inside a function or a ternary the reader cannot follow' }); return; }
    // binding offset: every trailing `+ <int>` term sums; any other arithmetic is unknown
    const core = rhs.replace(new RegExp(`^\\(*\\s*\\+?${ENV}\\s*(?:\\?\\?|\\|\\|)\\s*['"]?\\d+['"]?\\s*\\)*`), '').replace(new RegExp(`^\\(*\\s*\\+?${ENV}\\s*\\)*`), '').trim();
    let offset = 0;
    if (core !== '') {
      const terms = [...core.matchAll(/\+\s*(\d+)\b/g)].map((m) => +m[1]);
      const rest = core.replace(/\+\s*\d+\b/g, '').replace(/[()\s]/g, '');
      if (rest !== '') { unknown.push({ line: i + 1, expr: rhs.slice(0, 60), why: `the binding adds an unreadable term (${rest.slice(0, 30)})` }); return; }
      offset = terms.reduce((a, x) => a + x, 0);
    }
    work.push({ name: b[1], offset, range: scopeOf(i), hop: 0, via: `${b[1]} = env${offset ? ` + ${offset}` : ''} (line ${i + 1})` });
  });
  work.push({ name: ENV, offset: 0, range: [0, lines.length], hop: 0, via: 'env (direct)' }); // direct uses anywhere
  const seen = new Set();
  while (work.length) {
    const w = work.shift(); const key = `${w.name}:${w.offset}:${w.range[0]}`; if (seen.has(key)) continue; seen.add(key);
    const nameRe = new RegExp(`\\b${w.name}\\b`);
    let uses = 0;
    for (let i = w.range[0]; i < w.range[1]; i++) {
      const l = lines[i];
      if (new RegExp(`\\b${w.name}\\s*(?:[-+*/%]?=(?!=)|\\+\\+|--)|(?:\\+\\+|--)\\s*${w.name}\\b`).test(l) && !new RegExp(`\\b(?:const|let|var)\\s+${w.name}\\s*=`).test(l)) { unknown.push({ line: i + 1, expr: l.trim().slice(0, 60), why: `${w.name} is reassigned (a running value)` }); uses++; continue; }
      if (nameRe.test(templLines[i] ?? '')) { // template literals were blanked in `l`: the unblanked line gates the `${L}` rule
        for (const tm of (templLines[i] ?? '').matchAll(new RegExp(`\\$\\{\\s*${w.name}\\b\\s*([^}]*)\\}`, 'g'))) {
          uses++; const rest = tm[1].trim(); const plus = /^\+\s*(.+)$/.exec(rest);
          if (rest !== '' && !plus) { unknown.push({ line: i + 1, expr: tm[0], why: `${w.name} is used inside an expression the reader cannot follow` }); continue; }
          const t = term(plus ? plus[1] : '', i); if (t === null) unknown.push({ line: i + 1, expr: tm[0], why: 'unreadable term' }); else noteMax(w.offset + t, `${w.via} → \`\${${w.name}}\` (line ${i + 1})`);
        }
      }
      if (nameRe.test(l)) {
        for (const pm of l.matchAll(new RegExp(`\\bport\\s*:\\s*${w.name}\\b\\s*([^,}\\n]*)`, 'g'))) {
          uses++; const rest = pm[1].trim(); const plus = /^\+\s*(.+)$/.exec(rest);
          if (rest !== '' && !plus) { unknown.push({ line: i + 1, expr: pm[0].trim(), why: `${w.name} is used inside an expression the reader cannot follow` }); continue; }
          const t = term(plus ? plus[1] : '', i); if (t === null) unknown.push({ line: i + 1, expr: pm[0].trim(), why: 'unreadable term' }); else noteMax(w.offset + t, `${w.via} → port: ${w.name}${plus ? ' + ' + plus[1].trim() : ''} (line ${i + 1})`);
        }
        if (new RegExp(`\\b(?:const|let|var)\\s+[A-Za-z_$][\\w$]*\\s*=\\s*${w.name}\\s*\\+`).test(l)) { const am = new RegExp(`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${w.name}\\s*\\+\\s*([^;]+)`).exec(l); const t = term(am[2], i); uses++; if (t === null) unknown.push({ line: i + 1, expr: l.trim().slice(0, 60), why: 'unreadable term' }); else if (w.hop < 1) work.push({ name: am[1], offset: w.offset + t, range: scopeOf(i), hop: w.hop + 1, via: `${w.via} → ${am[1]} = ${w.name} + ${am[2].trim()} (line ${i + 1})` }); else unknown.push({ line: i + 1, expr: am[1], why: 'a second alias hop (only one is read)' }); }
      }
      for (const cm of l.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) { // calls — may span lines; a declaration is not a call
        const F = cm[1]; if (F === 'Number' || F === 'String' || F === 'if' || F === 'for' || F === 'while' || F === 'switch') continue;
        if (/function\s+$/.test(l.slice(0, cm.index))) continue;
        let depth = 0; let textArgs = ''; let done = false;
        for (let j = i; j < Math.min(lines.length, i + 40) && !done; j++) {
          const seg = j === i ? lines[j].slice(cm.index + cm[0].length - 1) : lines[j];
          for (const c of seg) { if (c === '(') depth++; else if (c === ')') { depth--; if (depth === 0) { done = true; break; } } textArgs += c; }
          if (!done) textArgs += ' ';
        }
        if (!done || !nameRe.test(textArgs)) continue;
        args(textArgs.slice(1)).forEach((a, idx) => {
          a = a.replace(/\s+/g, ' ').replace(new RegExp(`String\\(\\s*${w.name}\\s*\\)`, 'g'), w.name); // String(L) is L
          if (/^\[/.test(a) && nameRe.test(a)) { // an array argument (a child's argv): each element is read as an exact value or L + term
            for (const el of args(a.slice(1, -1))) { const em = new RegExp(`^${w.name}\\b\\s*(?:\\+\\s*(.+))?$`).exec(el.replace(new RegExp(`String\\(\\s*${w.name}\\s*\\)`, 'g'), w.name)); if (!em) { if (nameRe.test(el)) { unknown.push({ line: i + 1, expr: el.slice(0, 60), why: `${w.name} is used inside an expression the reader cannot follow` }); uses++; } continue; } uses++; const t = term(em[1] ?? '', i); if (t === null) unknown.push({ line: i + 1, expr: el, why: 'unreadable term' }); else noteMax(w.offset + t, `${w.via} → ${F}([…, ${el}]) (line ${i + 1})`); }
            return;
          }
          const am = new RegExp(`^${w.name}\\b\\s*(?:\\+\\s*(.+))?$`).exec(a);
          if (!am) {
            if (/^\{/.test(a)) { // an options object: `port:` was read by the line rule; every OTHER property using L is read here, anything else is unknown
              if (!nameRe.test(a)) return; // an object that never mentions L carries nothing of it (companion review r9: reservePort's derived-endpoint spec)
              let restObj = a.replace(new RegExp(`\\bport\\s*:\\s*${w.name}\\b\\s*(?:\\+\\s*[^,}]+)?`, 'g'), '');
              if (w.name === 'port') restObj = restObj.replace(/[{,]\s*port\s*(?=[,}])/g, (x) => { uses++; noteMax(w.offset, `${w.via} → { port } shorthand (line ${i + 1})`); return x[0]; });
              for (const om of restObj.matchAll(new RegExp(`\\b([A-Za-z_$][\\w$]*)\\s*:\\s*${w.name}\\b\\s*([^,}]*)`, 'g'))) {
                uses++; const rest = om[2].trim(); const plus = /^\+\s*(.+)$/.exec(rest);
                if (rest !== '' && !plus) { unknown.push({ line: i + 1, expr: om[0].slice(0, 60), why: `${w.name} is used inside an expression the reader cannot follow` }); continue; }
                const t = term(plus ? plus[1] : '', i); if (t === null) unknown.push({ line: i + 1, expr: om[0].slice(0, 60), why: 'unreadable term' }); else noteMax(w.offset + t, `${w.via} → ${om[1]}: ${w.name}${plus ? ' + ' + plus[1].trim() : ''} (line ${i + 1})`);
                restObj = restObj.replace(om[0], '');
              }
              if (nameRe.test(restObj)) { unknown.push({ line: i + 1, expr: a.slice(0, 60), why: `${w.name} is used inside an expression the reader cannot follow` }); uses++; }
              if (fns.has(F)) unknown.push({ line: i + 1, expr: `${F}(${a.slice(0, 40)})`, why: `the options object flows into ${F}, whose use of it is not read (objects are not hopped)` }); // fail-closed: a declared callee may derive from opts.port
              return;
            }
            if (nameRe.test(a)) { unknown.push({ line: i + 1, expr: a.slice(0, 60), why: `${w.name} is used inside an expression the reader cannot follow` }); uses++; }
            return;
          }
          uses++;
          const t = term(am[1] ?? '', i);
          if (t === null) { unknown.push({ line: i + 1, expr: a, why: 'unreadable term' }); return; }
          if (probes.has(F)) {
            const pr = probes.get(F); const given = args(textArgs.slice(1))[pr.idx];
            let window = pr.tries;
            if (given !== undefined) { if (/^\d+$/.test(given.trim())) window = +given.trim(); else { unknown.push({ line: i + 1, expr: `${F}(${a}, ${given.trim().slice(0, 20)})`, why: 'the probe window is not a literal' }); return; } }
            noteMax(w.offset + t + window + pr.plusOne - 1, `${w.via} → ${F}(${a}) probes ${window + pr.plusOne} (line ${i + 1})`); return;
          }
          const fn = fns.get(F);
          if (fn && fn.params[idx] && w.hop < 1) { work.push({ name: fn.params[idx], offset: w.offset + t, range: fn.range, hop: w.hop + 1, via: `${w.via} → ${F}(${a}) as ${fn.params[idx]}` }); return; }
          if (fn) { unknown.push({ line: i + 1, expr: a, why: `a second hop into ${F} (only one is read)` }); return; }
          // a callee the file does not declare: only the harness's one-port sinks are exact; anything else is unknown (fail-closed)
          if (['spawnStaticServer', 'stopStaticServer', 'listen', 'connect', 'probe', 'probeHttp', 'probeUrl', 'probeFetch', 'assertPortOutsideForeignBands', 'log', 'error', 'push', 'set', 'add', 'join', 'from', 'isFinite', 'assign', 'writeFileSync'].includes(F.split('.').pop())) { noteMax(w.offset + t, `${w.via} → ${F}(${a}) (line ${i + 1})`); return; }
          unknown.push({ line: i + 1, expr: `${F}(${a})`, why: `${F} is not declared in this file — the reader cannot see what it does with ${w.name}` });
        });
      }
    }
    if (uses === 0 && w.name !== ENV && !how.some((h) => h.startsWith(`${w.name}:`))) unknown.push({ line: w.range[0] + 1, expr: w.name, why: `no readable use of ${w.name}` });
  }
  if (max === null && !unknown.length) unknown.push({ line: 0, expr: envName, why: 'the value is bound but never used in a readable way' });
  return { span: unknown.length ? null : max + 1, how, unknown };
}
/** Lint row pin-model-drift: for every listed name a JS tool reads, the extent
 * the tool generates must equal the list's model span / width (layout names
 * are judged per suite by the inventory law; band names claim themselves). */
export function pinModelDrift(text, file) {
  const out = [];
  for (const [n] of pinNamesRead(text)) {
    const spec = PIN_NAMES[n]; if (!spec || spec.layout || spec.role === 'band') continue;
    const declared = spec.model?.kind === 'base' ? spec.model.span : (spec.width ?? 1);
    const used = basePinSpanUsed(text, n);
    if (used.span === null) {
      out.push({ file, line: used.unknown[0]?.line ?? 1, name: n, syntax: 'pin-model-drift', key: n, value: null, range: null,
        text: `derives from ${n} but the extent cannot be read (${used.unknown.map((u) => `${u.expr}: ${u.why}`).join('; ')}) — PIN_NAMES declares ${declared} port(s); bound the derivation statically (fail-closed)` });
    } else if (used.span !== declared) {
      const at = Number((/\(line (\d+)\)\s*$/.exec(used.how.slice(-1)[0] ?? '') ?? [])[1] ?? 1);
      out.push({ file, line: at, name: n, syntax: 'pin-model-drift', key: n, value: null, range: null,
        text: `generates ${used.span} port(s) from ${n} (${used.how.slice(-1)[0] ?? 'exact'}) but PIN_NAMES declares ${declared} — the list's model must equal the code (fail-closed)` });
    }
  }
  return out;
}

/** `export const SHARED_DEFAULT_WINDOW = '<name>';` — a tool's declaration that
 * it shares its default port window with the other tools naming the same
 * window ON PURPOSE (a render family claiming its lane's band); the ONLY
 * exemption of the tool-default-overlap rule, by name. One line, nothing
 * before `export`. */
export function sharedWindowOf(text) {
  const m = /^\s*export\s+const\s+SHARED_DEFAULT_WINDOW\s*=\s*(['"])([\w.-]+)\1\s*;?\s*$/m.exec(stripComments(String(text), { keepLineComments: true }));
  return m ? m[2] : null;
}

/** Lint row pin-name-drift: names read but not in PIN_NAMES (fail-closed). */
export function pinNameDrift(text, file) {
  const out = [];
  for (const [n, line] of pinNamesRead(text)) {
    if (!(n in PIN_NAMES)) out.push({ file, line, name: n, syntax: 'pin-name-drift', key: n, value: null, range: null,
      text: `reads process.env.${n} as a port pin but PIN_NAMES (web/tools/lib/ci-bands.mjs) does not list it — refusal, extents and widening would disagree about it; add it with its role (http | cdp | band)` });
  }
  return out;
}

/** ONE pin-name rule for env pins and the shell reader: an OB_ name that
 * contains PORT | CDP | BAND_START | BAND_END | PORT_BASE, minus timing/count
 * knobs (…_MS, …_TRIES, …_FAILS, …_SCALE, …_DIR) and the registry's own
 * OB_PORT_BANDS (a lineage list) / OB_PORT_BANDS_DIR (a path) /
 * OB_BAND_MUTEX_PORT (its writers' private mutex under a private registry,
 * GH-1119 — the registry's arbitration socket, never a suite's port). */
export function isPinName(k) {
  if (!/^OB_\w*(PORT|CDP|BAND_START|BAND_END|PORT_BASE)\w*$/.test(k)) return false; // PORT_BASE, never BASELINE (the pacing baseline JSON)
  if (/_(MS|TRIES|FAILS|SCALE|DIR)$/.test(k)) return false;
  if (k === 'OB_PORT_BANDS' || k === 'OB_PORT_BANDS_DIR' || k === 'OB_BAND_MUTEX_PORT') return false;
  return true;
}

export function pinEnvEntries(env = process.env) {
  const out = [];
  const isPort = (v) => /^\d+$/.test(String(v ?? '')) && Number(v) >= 1024 && Number(v) <= 65535;
  // every LISTED band pair OB_<X>_BAND_START / OB_<X>_BAND_END (role 'band') is ONE entry keyed OB_<X>_BAND_START/END with range [min, max]
  // (venue-lighting lane, PR #727 refuter: the lane's OB_LIGHTING_BAND_START/END declared as 'band' used to yield two one-port band entries,
  // which run-gate's one-claim-per-run check refused whenever the lane's env was sourced); OB_E2E_BAND_START/END is one instance of the rule,
  // still paired even when only one side is a port (a blank or garbage side falls back to the other — never 0 / NaN)
  const bandKeys = new Set(Object.keys(PIN_NAMES).filter((k) => PIN_NAMES[k].role === 'band' && /_BAND_(START|END)$/.test(k)));
  for (const [k, v] of Object.entries(env)) {
    if (!isPinName(k)) continue;
    if (bandKeys.has(k)) continue; // paired below
    if (!isPort(v)) continue;
    const spec = PIN_NAMES[k];
    // an unlisted pin-like name is an entry with role null: run-gate refuses it by name
    // (the ONE-list law), the hygiene scrub still drops it
    out.push({ key: k, value: Number(v), range: { start: Number(v), end: Number(v) }, role: spec ? spec.role : null, layout: !!spec?.layout });
  }
  const prefixes = new Set([...bandKeys].map((k) => k.replace(/_BAND_(START|END)$/, '')));
  for (const pre of [...prefixes].sort()) {
    const ks = `${pre}_BAND_START`, ke = `${pre}_BAND_END`;
    if (!(bandKeys.has(ks) && bandKeys.has(ke))) continue; // a half-listed pair is not a band (the list's model must name both edges)
    if (isPort(env[ks]) || isPort(env[ke])) {
      const a = isPort(env[ks]) ? Number(env[ks]) : Number(env[ke]);
      const b = isPort(env[ke]) ? Number(env[ke]) : a;
      out.push({ key: `${ks}/END`, value: Math.min(a, b), range: { start: Math.min(a, b), end: Math.max(a, b) }, role: 'band', layout: false });
    }
  }
  return out;
}


/** The refusal for one pin outside CI context: inside the CI reserved range
 * → the job whose band it is; inside a declared LANE band with no --band
 * given → the lane and the remedy (claim it). null when allowed. */
export function pinRefusal(ciTable, laneTable, pin, { hasBand, assignedHome = null, env = process.env } = {}) {
  // GITHUB_ACTIONS=true exempts everything (the runner has no lane tables);
  // OB_CI_BANDS=1 means "reproducing a CI job by hand" and exempts ONLY the
  // CI-reserved-range rule — a lane-band squat stays a squat (refuter)
  if (env.GITHUB_ACTIONS === 'true') return null;
  if (pin.role === null) {
    return `env pin ${pin.key}=${pin.value} looks like a port pin but is not in PIN_NAMES (web/tools/lib/ci-bands.mjs) — `
      + 'refusal, extents and widening would disagree about it; add it to the list with its role (http | cdp | band) (GH-687 companion)';
  }
  const q = pin.range;
  const shown = `${pin.key}=${q.start === q.end ? q.start : bandStr(q)}`;
  const what = pin.shown ?? (pin.key.startsWith('--') ? `argv pin ${shown}` : `env pin ${shown}`);
  if (bandsIntersect(q, ciTable.reservedRange) && env.OB_CI_BANDS !== '1') {
    const rows = ciBandOverlaps(ciTable, q.start, q.end);
    return `${what} lies inside the CI reserved range `
      + `${bandStr(ciTable.reservedRange)}${rows.length ? ` (${rows.map((r) => `${r.workflow} job ${r.job}`).join(', ')})` : ''}`
      + ' — a local lane never pins a CI port (GH-687); unset it or set OB_CI_BANDS=1 only when reproducing a CI job by hand';
  }
  // the lane part is THE boundary predicate (review r9 P2-2): the pin range
  // (one port, or BAND_START/END as a range) is judged against every lane
  // row; with --band the assigned band's home is the only legal home
  const lanesOnly = declaredBands(ciTable, laneTable).filter((d) => d.kind !== 'ci-reserved');
  const v = bandBoundary(lanesOnly, q.start, q.end, hasBand && assignedHome ? assignedHome : null);
  if (!v.touched.length) return null; // undeclared space (or inside the assigned home)
  if (v.ok && v.reason === 'inside-home') return null;
  const names = v.touched.map((n) => n.name).join(' and ');
  const lane = v.touched[0].row;
  const planRow = (laneTable?.bands ?? []).find((r) => r.lane === lane.lane && !r.legacy);
  const remedy = lane.legacy && planRow
    ? `run with --band ${planRow.band} (the ${lane.lane} lane's plan band; its legacy band ${lane.band} expires ${lane.until})`
    : `run with --band ${lane.band}`;
  // the verb states the FACT (refuter): one row containing the pin → 'lies inside'; a range
  // straddling one row's edge → 'enters'; two or more rows → 'spans' — and only a contained
  // pin gets the `run with --band <row>` remedy (no single row can hold the other two)
  const contained = v.touched.length === 1 && q.start >= lane.range.start && q.end <= lane.range.end;
  const verb = v.touched.length > 1 ? 'spans' : (contained ? 'lies inside' : 'enters');
  const cure = contained ? remedy : 'move the pin into ONE declared band (then claim it with --band) or into undeclared space';
  if (!hasBand) {
    return `${what} ${verb} ${names}${lane.legacy ? ` (until ${lane.until})` : ''} `
      + `with NO --band claim — an unclaimed squat on a declared band; ${cure}${contained ? ' so the GH-338 registry arbitrates it' : ''} (GH-687)`;
  }
  // with --band: a pin may sit only inside the assigned band's own home (or in undeclared space)
  return `${what} ${verb} ${names}, outside the assigned band`
    + `${assignedHome ? ` (${assignedHome.name})` : ''} — a claim never binds in a foreign declared band; ${cure}${contained ? ' or move the pin' : ''} (GH-687)`;
}

/** Rows whose band intersects [start, end]. */
export function ciBandOverlaps(table, start, end) {
  const q = { start, end };
  return table.jobs.filter((row) => bandsIntersect(row.range, q));
}

/** The GH-687 refusal, pure: null when the band may be claimed from this
 * env, else the message run-gate prints. A band that touches the reserved
 * range at all is refused — a local lane straddling the edge would still
 * squat a CI port. */
export function ciBandRefusal(table, start, end, env = process.env) {
  const band = { start, end };
  if (!bandsIntersect(band, table.reservedRange) || isCiContext(env)) return null;
  const rows = ciBandOverlaps(table, start, end);
  const whose = rows.length
    ? rows.map((r) => `${r.workflow} job ${r.job}'s band ${r.band}`).join(' and ')
    : 'unassigned CI headroom (no job yet)';
  return `port band ${bandStr(band)} lies inside the CI reserved range `
    + `${bandStr(table.reservedRange)} — it is ${whose}; local sessions never `
    + 'claim CI bands (GH-687: a live local claim there reds the CI job at its '
    + 'band claim). Pick a lane band below the reserved range (the GH-338 '
    + 'registry arbitrates it), or set OB_CI_BANDS=1 only when reproducing a '
    + 'CI job by hand.';
}

export function assertBandOutsideCiRange(table, start, end, env = process.env) {
  const msg = ciBandRefusal(table, start, end, env);
  if (msg) throw new Error(msg);
}

/** Parse a GitHub workflow file for the band facts the lint needs. Regex
 * over the text, not a YAML parser (the repo has none): jobs are the
 * 2-space keys under `jobs:`; a job's facts are every `OB_E2E_PORT` /
 * `OB_E2E_CDP_PORT` / `OB_CDP_PORT` scalar and every `--band A-B` (either
 * `--band A-B` or `--band=A-B`) that appears under it, with YAML comments
 * stripped first (`#` at line start or after whitespace) so a band cited in
 * a comment never counts. Folded (`>`) run blocks and the
 * `|| node web/tools/run-gate.mjs …` retry idiom are plain text to this
 * parser, which is exactly why it sees every literal. */
export function parseWorkflowBands(text) {
  const jobs = {};
  let job = null;
  let inJobs = false;
  const lines = String(text).split('\n'); // physical lines (the loop's `raw` is ONE line)
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (/^jobs:\s*(#.*)?$/.test(raw)) { inJobs = true; continue; }
    if (!inJobs) continue;
    if (/^[A-Za-z]/.test(raw)) { inJobs = false; continue; } // another top-level key
    const header = /^ {2}([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(raw);
    if (header) {
      job = header[1];
      jobs[job] = { line: i + 1, pins: {}, pinOccurrences: {}, bands: [], eqBands: [], suites: [], gateWithoutSuite: [], runsOn: null };
      continue;
    }
    if (!job) continue;
    const s = raw.replace(/^\s*#.*$/, '').replace(/\s#.*$/, '');
    const pin = new RegExp(`\\b(${PIN_NAME_RE_SRC})\\s*:\\s*["']?(\\d+)["']?\\s*$`).exec(s); // every listed name, from PIN_NAMES
    if (pin) {
      // EVERY occurrence (job env, step env, duplicates) with its line —
      // a later step-level pin used to overwrite an earlier one (review r4
      // P2); `pins` keeps the LAST value for readers, `pinOccurrences`
      // keeps them all for the lint
      jobs[job].pins[pin[1]] = Number(pin[2]);
      (jobs[job].pinOccurrences[pin[1]] ??= []).push({ line: i + 1, value: Number(pin[2]) });
    }
    // a `run:` block is folded into ONE command string (folded `>` and
    // literal `|` blocks alike: the continuation lines are those indented
    // deeper than the `run:` key), then split on the retry idiom `||`; each
    // segment holding run-gate.mjs is one INVOCATION whose suite is run-gate's
    // own rule — the LAST .mjs token after the last ` -- `, WRAPPER files
    // excluded (e2e-retry wraps the suite; run-gate itself when nested). The
    // hygiene suite is a suite here (the battery runs it) even though the
    // tool-default rule exempts it as harness. An invocation with no suite
    // is fail-closed (recorded, the lint names it).
    const runKey = /^(\s*)-?\s*run:\s*([>|]-?\s*)?(.*)$/.exec(s);
    if (runKey) {
      const indent = runKey[1].length; let cmd = runKey[3] ?? ''; let j = i + 1;
      while (j < lines.length) {
        const nxt = stripLineComment(lines[j]); const ind = nxt.match(/^\s*/)[0].length;
        if (nxt.trim() === '' || ind > indent) { cmd += ' ' + nxt.trim(); j++; } else break;
      }
      for (const seg of cmd.split(/\|\|/)) {
        if (!/run-gate\.mjs/.test(seg)) continue;
        const tail = seg.includes(' -- ') ? seg.slice(seg.lastIndexOf(' -- ') + 4) : '';
        const mjs = [...tail.matchAll(/(?:^|[\s'"=])(?:[\w./-]*\/)?([\w.-]+\.mjs)(?=[\s'"]|$)/g)].map((x) => x[1]).filter((x) => !WRAPPER_FILES.has(x));
        if (mjs.length) jobs[job].suites.push(mjs[mjs.length - 1]);
        else jobs[job].gateWithoutSuite.push({ line: i + 1, text: seg.trim().slice(0, 100) });
      }
    }
    for (const m of s.matchAll(/--band([= ]+)["']?(\d+)-(\d+)["']?/g)) {
      // run-gate parses `--band A-B` as two argv tokens ONLY; `--band=A-B`
      // would reach it as the child executable (review r2 P2) — recorded
      // separately so the lint can name it instead of approving it
      (m[1].includes('=') ? jobs[job].eqBands : jobs[job].bands)
        .push({ line: i + 1, start: Number(m[2]), end: Number(m[3]) });
    }
    const ro = /^\s*runs-on:\s*(.+?)\s*$/.exec(s);
    if (ro && !jobs[job].runsOn) jobs[job].runsOn = ro[1];
  }
  return { jobs };
}

/**
 * Lint the workflows against the table. `workflows` maps a workflow file
 * name to its text (the CLI reads the files; hygiene passes fixtures).
 * Returns { ok, problems: [{ kind, detail }] }. Rules:
 *   r1 workflow→table: every job passing --band has a row with that band
 *   r2 table→workflow: every row's job passes exactly that band
 *   r3 one band per job: all of a job's --band literals agree
 *   r4 env pins inside the band (and equal to the row's pins, r7)
 *   r5 every band inside the reserved range
 *   r6 no two rows intersect, across workflows
 *   r7 the table's pins equal the workflow's env pins
 *   r8 a row with a declared inventory keeps its pins' derivation tails
 *      inside the band: cdpPin + cdp − 1 <= band.end and
 *      httpPin + http − 1 < cdpPin (legacy rows with inventory null are
 *      unenforced — as before this table)
 *   r11 a job's suites are DERIVED from its workflow run lines (the LAST
 *      web/tools/*.mjs after `run-gate.mjs … --`, run-gate's own rule) and
 *      must equal the row's `suites`
 *   r12 each suite's PORT_INVENTORY is READ from its file (fail-closed when
 *      it declares none); the band must be >= bandWidthForInventory and the
 *      job's env pins' derivation tails must stay inside the band
 *   r9 (`toolDefaults`, optional): no tool in the derived scan set defaults a port
 *      or band literal into the reserved range (scanToolDefaults)
 *   r10 (`toolDefaults` + `laneBands`, optional): nor into ANY declared
 *      lane band (lane-bands.json) — a bare run would squat a lane's turf
 *   plus: a workflow job that sets a pin but passes no --band is a problem
 *   (a bare bind inside the range would be invisible to the registry), and
 *   `--band=A-B` (a form run-gate does not parse) is a band-syntax problem
 */
export function lintCiBands({ table, workflows, toolDefaults = null, laneBands = null, now = Date.now(), suiteText = null }) {
  const problems = [];
  const warnings = [];
  const push = (kind, detail) => problems.push({ kind, detail });
  const warn = (kind, detail) => warnings.push({ kind, detail });
  const t = table.reservedRange ? table : validateCiBands(table);
  const parsed = {};
  for (const [name, text] of Object.entries(workflows)) parsed[name] = parseWorkflowBands(text);
  // r6 — rows vs rows
  for (let i = 0; i < t.jobs.length; i++) {
    for (let j = i + 1; j < t.jobs.length; j++) {
      const a = t.jobs[i]; const b = t.jobs[j];
      if (bandsIntersect(a.range, b.range)) {
        push('overlap', `${a.workflow}:${a.job} ${a.band} intersects ${b.workflow}:${b.job} ${b.band}`);
      }
    }
    const r = t.jobs[i];
    // r5 — validateCiBands already throws on this for the committed table;
    // repeated here so a fixture table with a stray row reports, not throws
    if (!(r.range.start >= t.reservedRange.start && r.range.end <= t.reservedRange.end)) {
      push('band-outside-reserved', `${r.workflow}:${r.job} ${r.band} lies outside ${bandStr(t.reservedRange)}`);
    }
  }
  // r2 / r3 / r4 / r7 — table rows vs their workflow job
  for (const r of t.jobs) {
    const wf = parsed[r.workflow];
    if (!wf) { push('workflow-missing', `${r.workflow} (row ${r.job}) was not provided to the lint`); continue; }
    const job = wf.jobs[r.job];
    if (!job) { push('table-row-missing-from-workflow', `${r.workflow} has no job ${r.job} (table row ${r.band})`); continue; }
    const distinct = [...new Set(job.bands.map((b) => `${b.start}-${b.end}`))];
    if (distinct.length === 0) {
      push('table-row-missing-from-workflow', `${r.workflow}:${r.job} passes no --band (table row ${r.band})`);
    } else if (distinct.length > 1) {
      push('multi-band-job', `${r.workflow}:${r.job} passes ${distinct.length} different bands: ${distinct.join(', ')}`);
    } else if (distinct[0] !== r.band) {
      push('band-mismatch', `${r.workflow}:${r.job} passes --band ${distinct[0]} but the table says ${r.band}`);
    }
    // every OCCURRENCE of every pin key is judged, with its line (review r4
    // P2: a job-level pin followed by a differing step-level one — or the
    // reverse — used to be judged only by the last one seen)
    const occ = job.pinOccurrences ?? Object.fromEntries(Object.entries(job.pins).map(([k, v]) => [k, [{ line: job.line, value: v }]]));
    for (const [k, list] of Object.entries(occ)) {
      for (const { line, value: v } of list) {
        if (!bandCovers(r.range, v)) push('pin-outside-band', `${r.workflow}:${r.job} line ${line} ${k}=${v} lies outside its band ${r.band}`);
        if (r.pins[k] === undefined) {
          // one source means EVERY pin (review r1 P2): a pin the row omits
          // would otherwise drift unchecked
          push('pin-mismatch', `${r.workflow}:${r.job} line ${line} sets ${k}=${v} but its table row has no ${k}`);
        } else if (r.pins[k] !== v) {
          push('pin-mismatch', `${r.workflow}:${r.job} line ${line} ${k}=${v} in the workflow but ${r.pins[k]} in the table`);
        }
      }
    }
    for (const [k, v] of Object.entries(r.pins)) {
      if (job.pins[k] === undefined) push('pin-mismatch', `${r.workflow}:${r.job} table pin ${k}=${v} is not set in the workflow`);
    }
    // r11 — the suites a job runs, read from its run lines
    for (const g of job.gateWithoutSuite ?? []) push('run-gate-without-suite', `${r.workflow}:${r.job} line ${g.line}: a run-gate invocation names no suite file (${g.text}) — the lint cannot size it (fail-closed)`);
    const derivedSuites = [...new Set(job.suites ?? [])].sort();
    const rowSuites = [...new Set(r.suites)].sort();
    if (JSON.stringify(derivedSuites) !== JSON.stringify(rowSuites)) {
      push('job-suites-mismatch', `${r.workflow}:${r.job} runs [${derivedSuites.join(', ')}] per its run lines but the table row lists [${rowSuites.join(', ')}]`);
    }
    // r12 — inventories READ from the suite files; width and pin tails. Runs
    // whenever a suite reader is supplied (the committed lint always supplies
    // one; pure table/workflow fixtures may omit it and are judged on r1-r11).
    for (const f of suiteText ? rowSuites : []) {
      const text = suiteText(f);
      if (text === null || text === undefined) { push('job-suite-undeclared', `${r.workflow}:${r.job} suite ${f} could not be read — its inventory cannot be derived (fail-closed)`); continue; }
      const inv = inventoryOfText(text);
      if (!inv) { push('job-suite-undeclared', `${r.workflow}:${r.job} suite ${f} declares no PORT_INVENTORY — its band width cannot be derived (fail-closed)`); continue; }
      const need = bandWidthForInventory(inv); const width = r.range.end - r.range.start + 1;
      if (width < need) push('job-band-too-narrow', `${r.workflow}:${r.job} band ${r.band} is ${width} wide but ${f} declares { http ${inv.http}, cdp ${inv.cdp} } → needs ${need} (shortfall ${need - width})`);
      // THE extents function (shared with run-gate): every pin on the row, sized by its
      // role — the layout pins by this suite's inventory, an extra pin by its listed width
      const ext = pinExtentsFor(rowPinEntries(r.pins), [], inv);
      for (const e of ext) {
        if (e.lo < r.range.start || e.hi > r.range.end) {
          push('job-pin-tail-escapes', `${r.workflow}:${r.job} ${e.name} ${e.lo}${e.hi > e.lo ? `-${e.hi}` : ''} (${e.layout ? 'layout' : 'extra'} ${e.kind}${e.layout ? `, ${f}'s ${e.kind} ${inv[e.kind]}` : ''}) escapes band ${r.band}`);
        }
      }
      const lh = ext.find((e) => e.layout && e.kind === 'http'), lc = ext.find((e) => e.layout && e.kind === 'cdp');
      if (lh && lc && lh.hi >= lc.lo) push('job-pin-tail-escapes', `${r.workflow}:${r.job} ${lh.name} ${lh.lo} + ${f}'s http ${inv.http} - 1 = ${lh.hi} reaches the CDP pin ${lc.lo}`);
      // an EXTRA pin must stay clear of the layout pins' derived ranges (the battery-shaped blind spot)
      for (const e of ext.filter((x) => !x.layout)) {
        const hit = [lh, lc].find((l) => l && e.lo <= l.hi && l.lo <= e.hi);
        if (hit) push('job-pin-collides', `${r.workflow}:${r.job} pin ${e.name}=${e.lo} falls inside ${f}'s derived ${hit.kind === 'cdp' ? 'CDP' : 'http'} range ${hit.lo}-${hit.hi}`);
      }
    }
  }
  // tool-default-overlap (companion review r2 P2-2): two TOOLS whose derived default
  // ranges (base + inventory / model) intersect would bind the same ports when run
  // side by side; the only exemption is a SHARED_DEFAULT_WINDOW both declare by the
  // same name. Pins and expectations are not defaults (shell env pins / quoted
  // lists are excluded); harness files and lib carry no tool defaults — EXCEPT
  // a harness file that is itself a SUITE (it declares a PORT_INVENTORY and
  // defaults the layout env names: e2e-harness-hygiene.mjs), whose OWN defaults
  // — the first nullish/or default per layout env name — are judged like any
  // tool's (NOTE-CIRED-RELEASED-CLAIM round: the hygiene suite's 16367-16379
  // sat on four suites' CDP defaults and its 8467-8480 on two tools' http
  // defaults, invisible to this rule by the blanket exemption). Its fixture
  // literals deeper in the file stay out (they are the lane rows' business).
  const DEFAULT_SYNTAX = /^(nullish-default|or-default|flag-default|ternary-default|assignment|arithmetic|band-string|claim-literal|url-port|launch-arg-local|shell-env-default|shell-band|derived-offset|dynamic-window)$/;
  const ownSuiteDefaults = (hits) => {
    const seen = new Set();
    return hits.filter((h) => {
      const env = h.envKey && PIN_NAMES[h.envKey] ? h.envKey : h.key;
      if (!h.inventory || !PIN_NAMES[env]?.layout || !/^(nullish|or)-default$/.test(h.syntax) || seen.has(env)) return false;
      seen.add(env); return true;
    });
  };
  const candidates = (toolDefaults ?? []).filter((d) => DEFAULT_SYNTAX.test(d.syntax) && (d.range || Number.isFinite(d.value)));
  const harnessSuiteFiles = [...new Set(candidates.filter((d) => isHarnessPath(d.file) && !isLibPath(d.file)).map((d) => d.file))];
  const defs = [...candidates.filter((d) => !isHarnessPath(d.file) && !isLibPath(d.file)), // THE same path predicates the scanner uses
    ...harnessSuiteFiles.flatMap((f) => ownSuiteDefaults(candidates.filter((d) => d.file === f)))];
  const seenPair = new Set();
  for (let i = 0; i < defs.length; i++) {
    for (let j = i + 1; j < defs.length; j++) {
      const a = defs[i], b = defs[j];
      if (a.file === b.file) continue;
      const ra = a.range ?? { start: a.value, end: a.value }, rb = b.range ?? { start: b.value, end: b.value };
      if (!(ra.start <= rb.end && rb.start <= ra.end)) continue;
      if (a.sharedWindow && a.sharedWindow === b.sharedWindow) continue; // shared on purpose, by name
      const key = `${a.file}:${a.line}|${b.file}:${b.line}`; if (seenPair.has(key)) continue; seenPair.add(key);
      const show = (d, r) => `${d.file}:${d.line} ${d.key ?? d.name} ${bandStr(r)} [${d.syntax}]${d.syntax === 'derived-offset' && d.via ? ` (${d.via})` : ''}${d.sharedWindow ? ` (window '${d.sharedWindow}')` : ''}`;
      if (a.syntax === 'dynamic-window' || b.syntax === 'dynamic-window') {
        // a dynamic window family is a BAND (r5 P2-2): it can claim over a fixed default and refuse the suite that owns it
        const [fam, other] = a.syntax === 'dynamic-window' ? [a, b] : [b, a];
        push('dynamic-window-overlaps-default', `${show(fam, fam.range)} can claim over ${show(other, other.range ?? { start: other.value, end: other.value })} — a rotation / pid-offset family is a band: give the family a disjoint range (or move the default out of it)`);
        continue;
      }
      push('tool-default-overlap', `${show(a, ra)} overlaps ${show(b, rb)} — two tools' derived default ranges share ports; move one, or declare the same \`export const SHARED_DEFAULT_WINDOW = '<name>';\` on both when they share the window on purpose`);
    }
  }
  // r1 — workflow jobs vs table rows (every workflow provided, not only
  // the ones the table names — a --band in a third workflow must show)
  for (const [name, wf] of Object.entries(parsed)) {
    for (const [jobId, job] of Object.entries(wf.jobs)) {
      for (const b of job.eqBands ?? []) {
        push('band-syntax', `${name}:${jobId} line ${b.line} passes --band=${b.start}-${b.end}; run-gate parses `
          + 'only the two-token form `--band A-B` (the equals form would reach it as the child executable)');
      }
      if (job.bands.length === 0) {
        if (Object.keys(job.pins).length) {
          push('pins-without-band', `${name}:${jobId} sets ${Object.keys(job.pins).join('/')} but passes no --band`
            + ' (a bare bind inside the reserved range is invisible to the registry)');
        }
        continue;
      }
      if (!t.jobs.some((r) => r.workflow === name && r.job === jobId)) {
        const distinct = [...new Set(job.bands.map((b) => `${b.start}-${b.end}`))];
        push('workflow-job-missing-from-table', `${name}:${jobId} passes --band ${distinct.join(', ')} but has no table row`);
      }
    }
  }
  // r9 / r10 — tool defaults inside the reserved range or ANY declared lane band
  const lanes = laneBands ? (laneBands.bands?.every((r) => r.range) ? laneBands : validateLaneBands(laneBands, t)) : null;
  // legacy rows past their date are themselves a failure: remove the row
  for (const r of lanes?.bands ?? []) {
    if (r.legacy && now >= r.untilMs) push('legacy-row-expired', `${r.lane} legacy band ${r.band} expired on ${r.until} — remove the row; the lane runs on its plan band`);
  }
  for (const d of toolDefaults ?? []) {
    if (d.syntax === 'undeclared-inventory') {
      push('undeclared-inventory', `${d.file} ${d.text} — its real port range cannot be derived; declare the inventory (fail-closed)`);
      continue;
    }
    if (d.syntax === 'js-scan-unreadable') { push('js-scan-unreadable', `${d.text} (fail-closed)`); continue; }
    // R4-A: an uncertified scan is a problem in its own right — without this line the row falls through to the
    // default branch below, where a row carrying no numeric value is dropped: visible in --json, silent in the gate
    if (d.syntax === 'scan-uncertified') { push('scan-uncertified', `${d.file} ${d.text} (fail-closed)`); continue; }
    if (d.syntax === 'inventory-undercount') { push('inventory-undercount', `${d.file}:${d.line} ${d.text} (fail-closed)`); continue; }
    if (d.syntax === 'derived-offset-undeclared') { push('derived-offset-undeclared', `${d.file}:${d.line} ${d.text} (fail-closed)`); continue; }
    if (d.syntax === 'derived-default-unparsed' || d.syntax === 'inventory-without-pin-reader') { push(d.syntax, `${d.file}:${d.line} ${d.text} (fail-closed)`); continue; }
    if (d.syntax === 'override-declaration-drift' || d.syntax === 'override-undeclared') { push(d.syntax, `${d.file}${d.line ? ':' + d.line : ''} ${d.text} (fail-closed)`); continue; }
    if (d.syntax === 'dynamic-window-undeclared' || d.syntax === 'dynamic-window-unreadable') { push(d.syntax, `${d.file}:${d.line} ${d.text} (fail-closed)`); continue; }
    if (d.syntax === 'derived-endpoint-out-of-range' || d.syntax === 'derived-endpoint-unchecked' || /^nested-spawn-/.test(d.syntax)) { push(d.syntax, `${d.file}${d.line ? ':' + d.line : ''} ${d.text} (fail-closed)`); continue; } // companion review r9
    if (/^port-flag/.test(d.syntax) || d.syntax === 'pin-name-drift' || d.syntax === 'pin-model-drift') { push(d.syntax, `${d.file}:${d.line} ${d.text}`); continue; }
    if (d.syntax === 'cdp-base-name-unreadable') { push('cdp-base-name-unreadable', `${d.file} ${d.text} (fail-closed)`); continue; }
    if (d.syntax === 'offset-bound-unknown') { push('offset-bound-unknown', `${d.file}:${d.line} ${d.text} — bound the loop with a literal range, or declare the slots explicitly (fail-closed)`); continue; }
    const derivedNote = (d.syntax === 'dynamic-window' ? ' (a dynamic window family: a band)' : d.derived ? (d.baseSpan ? ` (derived: base model span ${d.baseSpan})` : d.inventory ? ` (derived: base + inventory ${d.inventory.http}/${d.inventory.cdp})` : ' (derived)') : '') + (d.via && d.via !== 'name' ? ` (via ${d.via})` : '');
    const what = d.range ? `${d.key ?? d.name} ${bandStr(d.range)}${derivedNote}` : `${d.key ?? d.name} = ${d.value}${derivedNote}`;
    const q = d.range ?? { start: d.value, end: d.value };
    if (!Number.isFinite(q.start)) continue;
    if (bandsIntersect(q, t.reservedRange)) {
      push('tool-default-in-reserved', `${d.file}:${d.line} ${what} [${d.syntax}] lies inside the CI reserved range ${bandStr(t.reservedRange)}`);
    }
    const hitLanes = lanes ? lanes.bands.filter((r) => bandsIntersect(q, r.range)) : [];
    const plan = hitLanes.filter((l) => !l.legacy);
    const legacy = hitLanes.filter((l) => l.legacy);
    if (plan.length) {
      push('tool-default-in-lane-band', `${d.file}:${d.line} ${what} [${d.syntax}] lies inside the declared `
        + plan.map((l) => `${l.lane} lane band ${l.band}`).join(' and ')
        + (d.syntax === 'shell-quoted-port' ? ' — a token that is not a port needs a NAMED exemption on its line: `# ci-bands: not-a-port <n> — <why>`' : ''));
    }
    for (const l of legacy) {
      const detail = `${d.file}:${d.line} ${what} [${d.syntax}] lies inside the ${l.lane} lane's LEGACY band ${l.band} (until ${l.until})`;
      if (now >= l.untilMs) push('tool-default-in-legacy-lane-band', `${detail} — the legacy row has expired`);
      else warn('tool-default-in-legacy-lane-band', detail);
    }
  }
  return { ok: problems.length === 0, problems, warnings };
}

/** r9/r10 input: every literal PORT DEFAULT a tool under `dir` carries, with
 * the SYNTAX it matched (review r5 P2: the first scan saw only the
 * `OB_E2E_* ?? N` form and called a tree clean that defaulted 9770/9780/9772
 * through `argOf`). The syntaxes are the ones the tree actually uses — the
 * 2026-09-07 census over web/tools (154 `?? N`, 28 `arg('x', N)`, 18 `= N`,
 * 14 `argOf(..., N)`, 4 `|| N`, 4 arithmetic, ternary and claim literals):
 *   nullish-default   NAME = … ?? N            (env/flag fallbacks)
 *   or-default        NAME = … || N
 *   flag-default      ident('--flag' | 'port' | 'serve' | 'cdp', N) — argOf / arg
 *   ternary-default   NAME = cond ? … : N
 *   assignment        NAME = N;                (a bare literal)
 *   arithmetic        NAME = … N op … / … op N (a literal inside a computed
 *                     default — reported and judged; PORT − 8281 + 9581 keeps
 *                     its 9581 visible)
 *   band-string       '…A-B…' in a default position (argOf('--band', 'A-B'))
 *   claim-literal     claimPortBand(A, B)
 *   url-port          'http://127.0.0.1:N/…' / 'localhost:N' literals
 * NAME must match /port|cdp|band|serve/i (declared with const/let/var or
 * assigned at statement start) for the value-syntaxes; claim-literal and
 * url-port are name-free. Comments are stripped first. Each hit carries
 * {file, line, name, syntax, key, value | range, text}; the lint judges
 * `value` (or every port of `range`) against the reserved range and every
 * declared lane band. Pure text scan; no code is executed. */
export const DEFAULT_SYNTAXES = ['nullish-default', 'or-default', 'flag-default', 'ternary-default',
  'assignment', 'arithmetic', 'band-string', 'claim-literal', 'url-port', 'launch-arg-local',
  'derived-offset', 'dynamic-window']; // r5/r6: a BASE ± k derivation (at its derived value) and a rotation / pid-offset / scan family (a range)
const PORT_LIT = /(?<![\w.$])(\d{4,5})(?![\w.$])/g;
const inPortRange = (n) => n >= 1024 && n <= 65535;
export function scanToolDefaultsInText(text, file = '<text>') {
  const hits = [];
  const locals = new Map(); // NAME → { line, rhs, code } for names the gate did not admit (one-hop trace)
  const push = (line, name, syntax, key, value, range, code) => hits.push({ file, line, name, syntax, key, value, range, via: 'name', text: code.trim().slice(0, 140) });
  const raw = String(text).split('\n');
  const strip = (l) => l.replace(/^\s*\/\/.*$/, '').replace(/(^|[^:'"`])\/\/(?![^'"`]*['"`][^'"`]*$).*$/, '$1');
  // a declaration whose right-hand side continues on the next lines (a
  // ternary branch, a wrapped call — scenario-render's `: 9493 + (PORT %
  // 499) + …` sits on the line AFTER `const CDP_PORT = …`) is judged as
  // ONE statement: continuation lines are joined until the statement ends
  const lines = [];
  for (let i = 0; i < raw.length; i++) {
    let code = strip(raw[i]);
    if (/^\s*(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=(?!=)/.test(code) && !/;\s*$/.test(code)) {
      let j = i;
      while (j + 1 < raw.length && j - i < 6 && !/;\s*$/.test(code) && strip(raw[j + 1]).trim() !== '') {
        j += 1; code += ' ' + strip(raw[j]).trim();
      }
    }
    lines.push(code);
  }
  // two statements on one line are two statements (refuter r11: `const SERVE = arg('serve', …); const PORT = Number(arg('port', …));`
  // attributed BOTH flag defaults to SERVE, so the second was widened by the wrong role); split at a top-level `;`
  const splitStatements = (code) => {
    const out = []; let depth = 0; let q = null; let cur = '';
    for (let k = 0; k < code.length; k++) {
      const c = code[k];
      if (q) { cur += c; if (c === '\\') { cur += code[k + 1] ?? ''; k++; } else if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') { q = c; cur += c; continue; }
      if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
      if (c === ';' && depth === 0) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim()) out.push(cur);
    return out.length ? out : [code];
  };
  // `BASE ± k` (parenthesised / Number()-wrapped; a second literal term folds):
  // a port DERIVED from another port local by a constant (companion review r5
  // P2-1: e2e-renderpurity's `CDP_PORT = PORT + 1100` read as the literal 1100
  // — the derived 21800 sat inside another tool's band unseen)
  const derivedOffsetOf = (rhs) => {
    const m = /^\s*\(?\s*(?:Number\(\s*)?([A-Za-z_$][\w$]*)\s*\)?\s*([-+])\s*(\d+)\s*(?:([-+])\s*(\d+))?\s*\)?\s*;?\s*$/.exec(rhs);
    if (!m || m[1] === 'process') return null;
    let k = (m[2] === '-' ? -1 : 1) * Number(m[3]);
    if (m[4]) k += (m[4] === '-' ? -1 : 1) * Number(m[5]);
    return { base: m[1], k };
  };
  const literalOfRhs = (rhs) => {
    const m = /^\s*(?:Number\()?\s*(?:process\.env\.[A-Z0-9_]+\s*(?:\?\?|\|\|)\s*)?['"]?(\d{4,5})['"]?\s*\)?\s*;?\s*$/.exec(rhs);
    return m && inPortRange(+m[1]) ? +m[1] : null;
  };
  // the UNPINNED fallback of a conditional / coalescing RHS (companion review r6
  // P2-3): `cond ? a : b` binds b when no pin is set, `a ?? b` / `a || b` bind b;
  // the LAST top-level fallback operand is the value the tool binds unpinned
  // (rollslip: `process.env.OB_E2E_CDP_PORT ? Number(…) : PORT + 20000` → PORT +
  // 20000 = 40630, not the literal 20000). Returns null when the RHS has no such
  // operator; otherwise the fallback text, Number()/parens unwrapped.
  const unwrapCall = (t) => { // balanced outer Number( … ) / ( … ) come off first: `Number(env ?? PORT + 5)` is judged inside the call
    let cur = t.trim().replace(/;\s*$/, '');
    for (let g = 0; g < 4; g++) {
      const m = /^(?:Number|parseInt)\(([\s\S]*)\)$/.exec(cur) ?? /^\(([\s\S]*)\)$/.exec(cur);
      if (!m) break;
      let d = 0, ok = true; for (let k = 0; k < m[1].length; k++) { if (m[1][k] === '(') d++; else if (m[1][k] === ')') { d--; if (d < 0) { ok = false; break; } } }
      if (!ok || d !== 0) break;
      cur = m[1].trim();
    }
    return cur;
  };
  const unpinnedFallbackOf = (rhsRaw) => {
    const rhs = unwrapCall(rhsRaw);
    let depth = 0, q = null, last = -1, tern = false;
    for (let k = 0; k < rhs.length; k++) {
      const c = rhs[k];
      if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') { q = c; continue; }
      if ('([{'.includes(c)) depth++; else if (')]}'.includes(c)) depth--;
      if (depth !== 0) continue;
      if (rhs.startsWith('??', k) || rhs.startsWith('||', k)) { last = k + 2; k++; continue; }
      if (c === '?' ) { tern = true; continue; }
      if (c === ':' && tern) { last = k + 1; continue; }
    }
    if (last < 0) return null;
    let fb = rhs.slice(last).trim().replace(/;\s*$/, '');
    for (let guard = 0; guard < 4; guard++) { // unwrap balanced Number( … ) and ( … )
      let m = /^Number\(([\s\S]*)\)$/.exec(fb) ?? /^\(([\s\S]*)\)$/.exec(fb);
      if (!m) { m = /^([\s\S]*)\)$/.exec(fb); if (m && (fb.match(/\(/g) ?? []).length < (fb.match(/\)/g) ?? []).length) { fb = m[1].trim(); continue; } break; }
      let d = 0, ok = true; for (let k = 0; k < m[1].length; k++) { if (m[1][k] === '(') d++; else if (m[1][k] === ')') { d--; if (d < 0) { ok = false; break; } } }
      if (!ok || d !== 0) break;
      fb = m[1].trim();
    }
    return fb;
  };
  const baseValueOf = (ident) => {
    const h = [...hits].reverse().find((x) => x.name === ident && Number.isFinite(x.value) && x.syntax !== 'derived-offset-undeclared');
    if (h) return h.value;
    const loc = locals.get(ident);
    return loc ? literalOfRhs(loc.rhs) : null;
  };
  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    for (const code of splitStatements(lines[i])) {
    if (!/\d{4,5}/.test(code) && !/[-+]\s*\d+/.test(code) && !/\?\?|\|\||\?/.test(code)) continue; // a conditional with no literal can still bind a port (an alias / an unreadable fallback)
    const hitsBefore = hits.length; // the unparsed judgement counts name-free hits (a claim literal in the fallback) too
    // name-free syntaxes first
    for (const m of code.matchAll(/claimPortBand\(\s*(\d{4,5})\s*,\s*(\d{4,5})\s*[,)]/g)) {
      push(ln, null, 'claim-literal', 'claimPortBand', null, { start: Number(m[1]), end: Number(m[2]) }, code);
    }
    for (const m of code.matchAll(/(?:127\.0\.0\.1|localhost|0\.0\.0\.0):(\d{4,5})(?![\w.$])/g)) {
      if (inPortRange(Number(m[1]))) push(ln, null, 'url-port', 'url', Number(m[1]), null, code);
    }
    // the assigned NAME (declared, or statement-start assignment)
    const decl = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=(?!=)([\s\S]*)$/.exec(code)
      || /^\s*([A-Za-z_$][\w$]*)\s*=(?!=)([\s\S]*)$/.exec(code);
    if (!decl) continue;
    const name = decl[1]; const rhs = decl[2];
    // the gate: the assigned NAME, or the ENV NAME the default feeds, or the
    // FLAG NAME (review r7 P2: scenario-batch reads OB_BATCH_PORT_BASE ?? 9500
    // into a variable named `base` — a name-only gate never saw it)
    const envKey = (/process\.env\.([A-Z][A-Z0-9_]*)/.exec(rhs) ?? [])[1] ?? null;
    const flagKey = (/\(\s*['"](--?[\w-]*(?:port|cdp|band|serve|base)[\w-]*)['"]/i.exec(rhs) ?? [])[1] ?? null;
    const viaName = /port|cdp|band|serve/i.test(name);
    const viaEnv = envKey !== null && /PORT|CDP|BASE|BAND|SERVE/.test(envKey);
    const viaFlag = flagKey !== null;
    if (!viaName && !viaEnv && !viaFlag) { locals.set(name, { line: ln, rhs, code }); continue; }
    const via = viaName ? 'name' : (viaEnv ? `env-name ${envKey}` : `flag-name ${flagKey}`);
    const seen = new Set();
    const add = (syntax, key, value, range, extra = {}) => {
      const k = `${syntax}:${value ?? ''}:${range ? bandStr(range) : ''}`;
      if (seen.has(k)) return; seen.add(k);
      hits.push({ file, line: ln, name, syntax, key: viaName ? key : (envKey ?? flagKey ?? key), envKey, value, range, via, text: code.trim().slice(0, 140), ...extra });
    };
    let fb = unpinnedFallbackOf(rhs);
    let unparsedFb = null;
    if (fb !== null) {
      for (let g = 0; g < 4; g++) { const inner = unpinnedFallbackOf(fb); if (inner === null) break; fb = inner; } // `a ? b : Number(env ?? LIT)` → LIT
      const PORTLIT = /(?<![\d.])\d{4,5}(?![\d.])/;
      const portLocals = hits.filter((h) => Number.isFinite(h.value) || h.range).map((h) => h.name).filter(Boolean);
      const knownLocal = (t) => portLocals.some((n) => new RegExp(`\\b${n}\\b`).test(t)); // a local this file already reads as a PORT (never an arbitrary local)
      const portStatement = PORTLIT.test(rhs) || /process\.env\.[A-Z0-9_]*(PORT|CDP|BASE|BAND)/.test(rhs) || knownLocal(rhs);
      if (/^(null|undefined|''|"")$/.test(fb)) continue; // no unpinned default: the tool refuses to run without its pin / flag
      if (/^[\[{]/.test(fb)) continue; // an array / object fallback is not a port (a geometry band, a config)
      const fdv = derivedOffsetOf(fb);
      const alias = /^[A-Za-z_$][\w$]*$/.test(fb) ? fb : null;
      if (fdv) {
        const baseLit = baseValueOf(fdv.base);
        if (baseLit !== null && inPortRange(baseLit + fdv.k)) add('derived-offset', name, baseLit + fdv.k, null, { derivedFrom: fdv.base, offset: fdv.k, via: `unpinned fallback: ${fdv.base} (${baseLit}) ${fdv.k < 0 ? '-' : '+'} ${Math.abs(fdv.k)}` });
        else if (baseLit !== null) hits.push({ file, line: ln, name, syntax: 'derived-endpoint-out-of-range', key: name, value: baseLit + fdv.k, range: null, via: 'name', derivedFrom: fdv.base, offset: fdv.k, text: `${name} ← unpinned fallback ${fb} = ${fdv.base} (${baseLit}) ${fdv.k < 0 ? '-' : '+'} ${Math.abs(fdv.k)} = ${baseLit + fdv.k} — outside the valid port range 1024-65535; the tool must refuse this derivation by name (assertDerivedEndpoint, cdp.mjs), never launch on it` }); // companion review r9 P2-1
        else hits.push({ file, line: ln, name, syntax: 'derived-offset-undeclared', key: name, value: null, range: null, via: 'name', text: `${name} ← unpinned fallback ${fb} — derived from a base whose value this file does not state` });
        continue;
      }
      if (alias && baseValueOf(alias) !== null) { add('derived-offset', name, baseValueOf(alias), null, { derivedFrom: alias, offset: 0, via: `unpinned fallback: alias of ${alias}` }); continue; }
      const litFb = /^['"]?(\d{4,5})['"]?$/.exec(fb);
      const scanCall = /^([A-Za-z_$][\w$]*)\(\s*(\d{4,5})\s*\)$/.exec(fb); // a free-port scan from a base: a dynamic window family (read by dynamicWindowsOfText)
      if (scanCall) continue; // the family is judged as a band
      // a fallback that references a port local this file already reads (`claimPortBand(BAND_START, BAND_START + 29)`) is covered by that local's own reading
      if (!litFb && portStatement && (viaName || viaEnv || viaFlag) && !knownLocal(fb)) unparsedFb = fb; // judged below, after the literal matchers had their say
    }
    const dv = derivedOffsetOf(rhs);
    if (dv) {
      const baseLit = baseValueOf(dv.base);
      if (baseLit !== null && inPortRange(baseLit + dv.k)) {
        add('derived-offset', name, baseLit + dv.k, null, { derivedFrom: dv.base, offset: dv.k, via: `derived: ${dv.base} (${baseLit}) ${dv.k < 0 ? '-' : '+'} ${Math.abs(dv.k)}` });
      } else if (baseLit !== null) { // companion review r9 P2-1: a readable base whose derivation leaves the port range
        hits.push({ file, line: ln, name, syntax: 'derived-endpoint-out-of-range', key: name, value: baseLit + dv.k, range: null, via: 'name', derivedFrom: dv.base, offset: dv.k,
          text: `${name} = ${dv.base} (${baseLit}) ${dv.k < 0 ? '-' : '+'} ${Math.abs(dv.k)} = ${baseLit + dv.k} — outside the valid port range 1024-65535; the tool must refuse this derivation by name (assertDerivedEndpoint, cdp.mjs), never launch on it` });
      } else if (/port|cdp|base|serve|dbg|debug/i.test(dv.base) || viaName) {
        hits.push({ file, line: ln, name, syntax: 'derived-offset-undeclared', key: name, value: null, range: null, via: 'name',
          text: `${name} = ${dv.base} ${dv.k < 0 ? '-' : '+'} ${Math.abs(dv.k)} — derived from a base whose value this file does not state (no default read for ${dv.base}); give ${dv.base} a readable default, or ${name} its own env default` });
      }
      continue; // never the literal-only reading of a derivation
    }
    if (!/\d{4,5}/.test(code)) { // no literal at all: only an unreadable fallback can still be a row
      if (unparsedFb !== null && hits.length === hitsBefore) {
        hits.push({ file, line: ln, name, syntax: 'derived-default-unparsed', key: name, value: null, range: null, via: 'name', text: `${name} = ${rhs.trim().slice(0, 120)} — the unpinned fallback \`${unparsedFb.slice(0, 60)}\` is not a literal, a BASE ± k derivation, an alias of a port local, or a free-port scan this file defines` });
      }
      continue;
    }
    for (const m of rhs.matchAll(/\?\?\s*['"]?(\d{4,5})['"]?(?![\w.$])/g)) if (inPortRange(+m[1])) add('nullish-default', name, +m[1], null);
    for (const m of rhs.matchAll(/\|\|\s*['"]?(\d{4,5})['"]?(?![\w.$])/g)) if (inPortRange(+m[1])) add('or-default', name, +m[1], null);
    for (const m of rhs.matchAll(/\b[A-Za-z_$][\w$]*\(\s*['"](--?[\w-]+|port|serve|cdp|band)['"]\s*,\s*['"]?(\d{4,5})['"]?\s*[,)]/g)) {
      if (inPortRange(+m[2])) add('flag-default', m[1], +m[2], null);
    }
    for (const m of rhs.matchAll(/\b[A-Za-z_$][\w$]*\(\s*['"](--?[\w-]+|band)['"]\s*,\s*['"](\d{4,5})-(\d{4,5})['"]\s*[,)]/g)) {
      add('band-string', m[1], null, { start: +m[2], end: +m[3] });
    }
    for (const m of rhs.matchAll(/\?[^?:]*:\s*['"]?(\d{4,5})['"]?\s*[;)]?\s*$/g)) if (inPortRange(+m[1])) add('ternary-default', name, +m[1], null);
    const bare = /^\s*['"]?(\d{4,5})['"]?\s*;?\s*$/.exec(rhs);
    if (bare && inPortRange(+bare[1])) add('assignment', name, +bare[1], null);
    // arithmetic is judged with quoted strings removed: a '9940-9969' band
    // string is a band-string hit above, not a subtraction
    const unquoted = rhs.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
    if (!bare && /[-+*/]\s*\d{4,5}|\d{4,5}\s*[-+*/]/.test(unquoted)) {
      for (const m of unquoted.matchAll(PORT_LIT)) if (inPortRange(+m[1]) && !seen.has(`nullish-default:${m[1]}:`) && !seen.has(`or-default:${m[1]}:`)) add('arithmetic', name, +m[1], null);
    }
    // the unparsed verdict comes LAST: only a statement no matcher could read at all (literal arithmetic in a fallback is read above)
    if (unparsedFb !== null && hits.length === hitsBefore) {
      hits.push({ file, line: ln, name, syntax: 'derived-default-unparsed', key: name, value: null, range: null, via: 'name', text: `${name} = ${rhs.trim().slice(0, 120)} — the unpinned fallback \`${unparsedFb.slice(0, 60)}\` is not a literal, a BASE ± k derivation, an alias of a port local, or a free-port scan this file defines` });
    }
    }
  }
  // one-hop trace (review r7 P2): a literal that reaches a launch / claim /
  // listen / --band call through a LOCAL whose name says nothing — the hop
  // is reported. Only top-level `const NAME = <literal | … ?? literal |
  // … || literal>` locals are traced (one assignment hop, no deeper).
  const literalOf = (rhs) => {
    const m = /^\s*(?:Number\()?\s*(?:process\.env\.[A-Z0-9_]+\s*(?:\?\?|\|\|)\s*)?['"]?(\d{4,5})['"]?\s*\)?\s*;?\s*$/.exec(rhs);
    return m && inPortRange(+m[1]) ? +m[1] : null;
  };
  const CALLS = [
    [/launchChrome\([^)]*?\{[^}]*?\bport:\s*([A-Za-z_$][\w$]*)\b/g, 'launchChrome({ port })'],
    [/launchPhone\([^)]*?\{[^}]*?\bcdpPort:\s*([A-Za-z_$][\w$]*)\b/g, 'launchPhone({ cdpPort })'],
    [/claimPortBand\(\s*([A-Za-z_$][\w$]*)\b/g, 'claimPortBand(start)'],
    [/spawnStaticServer\([^,)]*,\s*([A-Za-z_$][\w$]*)\s*\)/g, 'spawnStaticServer(dir, port)'],
    [/\.listen\(\s*([A-Za-z_$][\w$]*)\b/g, '.listen(port)'],
    [/--band['"]?\s*,\s*(?:String\()?\s*([A-Za-z_$][\w$]*)\b/g, "'--band', <local>"],
  ];
  for (let i = 0; i < lines.length; i++) {
    const code = lines[i];
    for (const [re, where] of CALLS) {
      for (const m of code.matchAll(re)) {
        const loc = locals.get(m[1]);
        if (!loc) continue;
        let v = literalOf(loc.rhs);
        let syntax = 'launch-arg-local';
        if (v === null) { // a derived local reaching a launch: `const dbg = PORT + 5` → launchChrome({ port: dbg })
          const dv = derivedOffsetOf(loc.rhs); const b = dv ? baseValueOf(dv.base) : null;
          if (dv && b !== null && inPortRange(b + dv.k)) { v = b + dv.k; syntax = 'derived-offset'; }
        }
        if (v === null) continue;
        if (hits.some((h) => h.line === loc.line && h.value === v)) continue;
        hits.push({ file, line: loc.line, name: m[1], syntax, key: m[1], value: v, range: null,
          via: `one hop: ${m[1]} = ${loc.rhs.trim().slice(0, 40)} (line ${loc.line}) → ${where} (line ${i + 1})`,
          text: loc.code.trim().slice(0, 140) });
      }
    }
  }
  return hits;
}

// ---- (2) declared vs USED CDP offsets (review r7 P2) ----------------------------------
/** The highest `CDP + k` offset a tool actually uses, read statically: every
 * `CDP|CDP_PORT|… + <expr>`; literals add, `(x % M)` adds M − 1, and a loop
 * variable is bounded by its ENCLOSING loop (the nearest `for` above the use
 * that declares it): `for (let v = a; v < b; …)` → b − 1 (`<=` → b);
 * `for (const [v, …] of [ …literal array… ](.map(…))?)` → length − 1;
 * `for (const [.., v, ..] of [[…],[…]])` → the highest literal at v's tuple
 * index; `for (const v of IDENT)` → one hop: `const IDENT = [ … ]` →
 * length − 1, or `Object.keys(OBJ)` over an object literal with numeric keys
 * → the highest key. Anything else is UNKNOWN and reported — the lint fails
 * closed on it, exactly as on an undeclared inventory. Offsets above 64 are
 * not slot offsets (a CDP derived from an http PORT by +1300 is a base, not
 * a slot) and are skipped. */
export const CDP_BASE_NAMES = ['CDP', 'CDP_PORT', 'CDPP', 'CDP0', 'CDP_BASE', 'cdpPort', 'cdp0'];
export const HTTP_BASE_NAMES = ['PORT', 'HTTP_PORT', 'SERVE', 'http0', 'httpPort'];
export function cdpOffsetsUsed(text) { return offsetsUsed(text, CDP_BASE_NAMES); }
export function httpOffsetsUsed(text) { return offsetsUsed(text, HTTP_BASE_NAMES); }
/** Blank string, template and regex literals (line count preserved) so a
 * fixture string or a log message never reads as a launch (refuter: the
 * hygiene suite's staged-suite strings inflated its reading to +39). GH-750:
 * the reader is cdp.mjs's stack scanner, shared with stripComments — a NESTED
 * template is blanked whole (interpolations included: the law is "a template
 * literal is not code", nested or not), a backtick inside a quoted string
 * opens nothing, and a regex body is a literal too. The regex form this
 * replaces matched templates before quotes and, once the comment stripper
 * stopped hiding them, read seven of the hygiene suite's own fixture lines as
 * port arithmetic (the #750 rows). Re-exported here because every reader in
 * this file, and the hygiene suite's arms, import it from this module. */
export { blankStrings };
/** The CERTIFICATE as an `unknown` row (GH-750 FIX4, review round 3 class S4). Every reader below
 * reads BLANKED text, and a blanking is only as good as the parse behind it: where the grammar
 * refuses a source, the tokenizer's regex-versus-division guess can swallow a launch call whole,
 * and the reader then returns `maxOffset: null, unknown: []` — indistinguishable from "there is
 * nothing here". That silence is what made S4 a P1. An uncertified source now costs an `unknown`
 * entry, so the lint prints an `offset-bound-unknown` row NAMING the position the grammar refused,
 * and the port law fails closed exactly as it does on an unreadable loop bound. Measured on this
 * tree: 462 of 462 tracked JS sources are certified, so the row is a fail-closed path, not a
 * standing cost. A source that is not even lexically readable still throws JsScanError and is
 * reported as `js-scan-unreadable`; the two non-passes stay different facts. */
function uncertifiedRow(text, unknown) {
  const cert = jsScanCertificate(text); // a LEXICALLY unreadable source throws through, and is reported as js-scan-unreadable
  if (!cert.certified) unknown.push({ line: 0, expr: '(whole source)', why: `${cert.uncertified} — the spans below come from the TOKENIZER's guess, which is not a reading the grammar accepts` });
  return unknown;
}
export function offsetsUsed(text, names = CDP_BASE_NAMES) {
  // comments go first with the string-aware stripper (a `/*` inside a `//`
  // comment or a string never opens a block), then strings are blanked
  const src = blankStrings(stripComments(text)); // keep line numbers
  const lines = src.split('\n');
  const uses = []; const unknown = [];
  uncertifiedRow(text, unknown); // an uncertified reading is a ROW, never a silent null (S4)
  const topLevelItems = (arrText) => { // count the top-level elements of an array literal starting at '['
    let depth = 0; let items = 0; let sawItem = false;
    for (let i = 0; i < arrText.length; i++) {
      const c = arrText[i];
      if (c === '[' || c === '(' || c === '{') { depth++; if (depth > 1) sawItem = true; continue; }
      if (c === ']' || c === ')' || c === '}') { depth--; if (depth === 0) { if (sawItem) items++; return items; } continue; }
      if (depth === 1) { if (c === ',') { if (sawItem) items++; sawItem = false; } else if (!/\s/.test(c)) sawItem = true; }
    }
    return null;
  };
  const tuplesAt = (arrText, idx) => { // the highest integer literal at tuple index idx in [[…],[…]]
    const tuples = [...arrText.matchAll(/\[([^\[\]]*)\]/g)].map((m) => m[1].split(',').map((x) => x.trim()));
    let best = null;
    for (const t of tuples) { const v = t[idx]; if (v !== undefined && /^\d+$/.test(v)) best = Math.max(best ?? -1, +v); }
    return best;
  };
  const resolveIdent = (ident, fromLine) => { // one hop: const ident = [ … ] | … Object.keys(OBJ) …
    for (let j = fromLine; j >= 0; j--) {
      const m = new RegExp(`^\\s*(?:const|let)\\s+${ident}\\s*=\\s*(.*)$`).exec(lines[j]);
      if (!m) continue;
      const rhs = m[1];
      const arr = /^\s*(\[[\s\S]*)$/.exec(rhs);
      if (arr) { const n = topLevelItems(arr[1]); return n === null ? null : n - 1; }
      // `'2,3,4'.split(',')` / `(x ?? '2,3,4').split(',')`: the literal list's highest number
      const split = /['"]([\d,\s]+)['"]\s*\)?\s*\.split\(/.exec(rhs);
      if (split) { const nums = split[1].split(',').map((x) => Number(x.trim())).filter(Number.isFinite); return nums.length ? Math.max(...nums) : null; }
      const ok = /Object\.keys\(\s*([A-Za-z_$][\w$]*)\s*\)/.exec(rhs);
      if (ok) {
        for (let k = j; k >= 0; k--) {
          const om = new RegExp(`^\\s*(?:const|let)\\s+${ok[1]}\\s*=\\s*\\{(.*)$`).exec(lines[k]);
          if (!om) continue;
          const keys = [...om[1].matchAll(/(?:^|[\s,{])(\d+)\s*:/g)].map((x) => +x[1]);
          return keys.length ? Math.max(...keys) : null;
        }
      }
      return null;
    }
    return null;
  };
  const boundOf = (v, fromLine) => { // the ENCLOSING loop above the use that declares v — the NEAREST declaration wins
    for (let j = fromLine; j >= 0; j--) {
      const l = lines[j];
      let m;
      if ((m = new RegExp(`for\\s*\\(let ${v}\\s*=\\s*(\\d+)\\s*;\\s*${v}\\s*(<=?)\\s*(\\d+)`).exec(l))) return { max: m[2] === '<' ? +m[3] - 1 : +m[3], how: `for (let ${v} … ${m[2]} ${m[3]}) line ${j + 1}` };
      if ((m = new RegExp(`for\\s*\\(let ${v}\\s*=\\s*(\\d+)\\s*;\\s*${v}\\s*(<=?)\\s*([A-Za-z_$][\\w$]*)\\.length`).exec(l))) {
        const r = resolveIdent(m[3], j); // `i < IDENT.length` → the literal array's length, one hop
        return r === null ? null : { max: m[2] === '<' ? r : r + 1, how: `for (let ${v} … ${m[2]} ${m[3]}.length) → ${m[3]} has ${r + 1} item(s), line ${j + 1}` };
      }
      if (new RegExp(`for\\s*\\((?:let|const)\\s+(?:\\[[^\\]]*\\b${v}\\b[^\\]]*\\]|${v}\\b)`).test(l) && !new RegExp(`for\\s*\\(const \\[[^\\]]*\\]\\s+of\\s+\\[`).test(l) && !new RegExp(`for\\s*\\(const ${v}\\s+of\\s+[A-Za-z_$]`).test(l)) {
        return null; // the nearest declaration of v has a bound this reader cannot read: UNKNOWN, never an outer loop's bound
      }
      if ((m = new RegExp(`for\\s*\\(const \\[\\s*${v}\\b[^\\]]*\\]\\s+of\\s+(\\[.*)$`).exec(l))) { const n = topLevelItems(m[1]); return n === null ? null : { max: n - 1, how: `for (const [${v}, …] of [${n} items]) line ${j + 1}` }; }
      if ((m = new RegExp(`for\\s*\\(const \\[([^\\]]*)\\]\\s+of\\s+(\\[.*)$`).exec(l)) && m[1].split(',').map((x) => x.trim()).includes(v)) {
        const idx = m[1].split(',').map((x) => x.trim()).indexOf(v);
        let arr = m[2]; let k = j + 1; while (k < lines.length && k - j < 8 && !/\)\s*\{\s*$/.test(arr)) { arr += ' ' + lines[k].trim(); k++; }
        const best = tuplesAt(arr, idx); return best === null ? null : { max: best, how: `tuple index ${idx} of the for-of array at line ${j + 1}` };
      }
      if ((m = new RegExp(`for\\s*\\(const ${v}\\s+of\\s+([A-Za-z_$][\\w$]*)\\s*\\)`).exec(l))) {
        const r = resolveIdent(m[1], j);
        if (r !== null) return { max: r, how: `for (const ${v} of ${m[1]}) → ${m[1]} resolves to a top index of ${r}, line ${j + 1}` };
        // an unresolvable list (a function parameter): the loop body's own use of v
        // as a KEY into a top-level object literal with numeric keys bounds it —
        // `SIMS[n](ctx)` means n ∈ keys(SIMS) (the render tools' shot lists)
        for (let k = j + 1; k <= fromLine; k++) {
          const ix = new RegExp(`\\b([A-Za-z_$][\\w$]*)\\[${v}\\]`).exec(lines[k]);
          if (!ix) continue;
          for (let q = lines.length - 1; q >= 0; q--) {
            const om = new RegExp(`^\\s*(?:const|let)\\s+${ix[1]}\\s*=\\s*\\{(.*)$`).exec(lines[q]);
            if (!om) continue;
            const keys = [...om[1].matchAll(/(?:^|[\s,{])(\d+)\s*:/g)].map((x) => +x[1]);
            return keys.length ? { max: Math.max(...keys), how: `${v} indexes ${ix[1]} (line ${k + 1}), whose numeric keys top out at ${Math.max(...keys)} (line ${q + 1})` } : null;
          }
        }
        return null;
      }
    }
    return null;
  };
  const NAMES = new RegExp(`\\b(${names.join('|')})\\s*\\+\\s*`, 'g');
  for (let i = 0; i < lines.length; i++) {
    const code = lines[i];
    for (const m of code.matchAll(NAMES)) {
      let depth = 0; let j = m.index + m[0].length; let expr = '';
      for (; j < code.length; j++) {
        const c = code[j];
        if (c === '(' || c === '[') depth++; else if (c === ')' || c === ']') { if (depth === 0) break; depth--; }
        else if (depth === 0 && /[,;}:?]/.test(c)) break;
        expr += c;
      }
      expr = expr.trim();
      const terms = []; { let d = 0; let cur = ''; for (const c of expr) { if (c === '(') d++; if (c === ')') d--; if (c === '+' && d === 0) { terms.push(cur.trim()); cur = ''; } else cur += c; } if (cur.trim()) terms.push(cur.trim()); }
      let total = 0; const how = []; let bad = null;
      for (const t of terms) {
        if (/^\d+$/.test(t)) { total += +t; continue; }
        const mod = /^\(\s*[A-Za-z_$][\w$.]*(?:\+\+)?\s*%\s*([2-9]|\d{2,})\s*\)$/.exec(t); // (X % M): a plain identifier / member chain, optionally post-incremented (`bootSeq++ % 14`, `process.pid % 23`), M >= 2 → at most M-1; an operator inside the parens stays fail-closed
        if (mod) { total += +mod[1] - 1; how.push(`% ${mod[1]} → ${+mod[1] - 1}`); continue; }
        const tern = /^\(\s*[^?]+\?\s*(\d+)\s*:\s*(\d+)\s*\)$/.exec(t); // (cond ? a : b) of literals → max
        if (tern) { const mx = Math.max(+tern[1], +tern[2]); total += mx; how.push(`(? ${tern[1]} : ${tern[2]}) → ${mx}`); continue; }
        if (/^[A-Za-z_$][\w$]*$/.test(t)) { const b = boundOf(t, i); if (b) { total += b.max; how.push(`${t} ≤ ${b.max} (${b.how})`); continue; } bad = `no literal bound for ${t}`; break; }
        bad = `unreadable term ${t}`; break;
      }
      if (bad) { unknown.push({ line: i + 1, expr: `${m[1]} + ${expr}`, why: bad }); continue; }
      if (total > 64) continue;
      uses.push({ line: i + 1, expr: `${m[1]} + ${expr}`, offset: total, how: how.join('; ') || 'literal' });
    }
  }
  const maxOffset = uses.length ? Math.max(...uses.map((u) => u.offset)) : null;
  const top = uses.find((u) => u.offset === maxOffset) ?? null;
  return { maxOffset, top, uses, unknown };
}

/** The harness itself (not tools with defaults): exempt from the
 * undeclared-inventory rule — run-gate derives extents from OTHER suites'
 * declarations, cdp.mjs owns the layout, the hygiene suite stages fixtures. */
export const HARNESS_FILES = new Set(['run-gate.mjs', 'cdp.mjs', 'e2e-retry.mjs', 'touch-cdp.mjs',
  'e2e-harness-hygiene.mjs', 'ci-bands-lint.mjs', 'storm-baseline.mjs']);

/** The two path exemptions of the tool-default rules, keyed on the
 * REPO-RELATIVE path (refuter r9: by basename alone a future
 * tools/render/cdp.mjs would have been exempt); fixture trees hand bare
 * basenames, so a bare name still reads as the harness file it names. ONE
 * pair of predicates — the scanner tags hits with them and the lint's
 * tool-default-overlap rule filters with them. */
export const isHarnessPath = (rel) => HARNESS_FILES.has(path.basename(rel)) && (!String(rel).includes('/') || String(rel).startsWith('web/tools/'));
export const isLibPath = (rel) => String(rel).startsWith('lib/') || String(rel).startsWith('web/tools/lib/');
/** Files that WRAP a suite on a run line (never the suite themselves) —
 * the suite-derivation rule skips exactly these. */
export const WRAPPER_FILES = new Set(['run-gate.mjs', 'e2e-retry.mjs', 'cdp.mjs']);

/** A tool's declared PORT_INVENTORY — read by the HARNESS's own parser
 * (cdp.mjs parsePortInventory, the GH-410 law: one line, bare integers, block
 * comments stripped first) so the lint and run-gate can never disagree about
 * what a tool declared. A declaration that starts but does not parse throws
 * there; here it is reported as undeclared (the lint fails closed on it). */
export function inventoryOfText(text) {
  try { return parsePortInventory(String(text)); } catch { return null; }
}

/** Does the tool compute ports from a base (`CDP + i`, `PORT + 2`,
 * `cdpPort + n` …)? Such a tool's real range is wider than its default and
 * MUST be declared (owner ruling 2026-09-07 after review r6 P1-b).
 * GH-750: read over the SAME text the offsets reader bounds — comments
 * stripped AND literals blanked — so the two halves of the law (does it
 * derive; how far) never disagree about what is code. Before, strings stayed
 * visible here alone, and a fixture string quoting `CDP_PORT + 25` (the
 * readers' own test) made its file a deriver with no inventory. Measured on
 * 868bbd57 over every tracked source: one file changes verdict (that test),
 * the 56 real derivers keep theirs. Ruled residual, shared with offsetsUsed:
 * a derivation written ONLY inside a template interpolation is blanked with
 * its template. Measured (js-scan-measure.mjs, base 868bbd57): interpolation
 * expressions carrying `PORT + N` / `CDP + 1` exist in a few files — URLs,
 * mostly — and in every one the same derivation also stands in plain code,
 * so no file loses its verdict; the alternative of keeping interpolation code
 * visible reads `\`${PORT}\` + x` as `PORT + x` (8 false derivers), which is
 * worse. */
export function derivesFromBase(text) {
  // any expression that combines a port base with a literal, a variable, a
  // parenthesised or an incremented term derives (review r11 P2: `PORT +
  // (bootSeq++)` escaped the old literal-or-identifier rule and its tenth
  // launch walked into a lane); the offsets reader then bounds the term or
  // fails closed on it (`offset-bound-unknown`)
  const code = blankStrings(stripComments(text));
  const B = '(?:CDP|CDP_PORT|CDPP|CDP0|CDP_BASE|cdp0|cdpPort|PORT|HTTP_PORT|http0|SERVE)';
  return new RegExp(`\\b${B}\\s*\\+\\s*(?:\\(|\\d{1,3}\\b|[A-Za-z_$][\\w$]*)`).test(code)
    || new RegExp(`\\b${B}\\s*(?:\\+\\+|\\+=|-=)`).test(code)   // a base that is itself incremented / compound-assigned (`cdpPort += 1`)
    || new RegExp(`(?:\\+\\+|--)\\s*${B}\\b`).test(code);         // prefix increment
  // NOT seen (filed in #724): other base NAMES (`cdpBase + i`, `DBG + 1`), the base on the RIGHT of `+` (`i + CDP`), `CDP - n`
}

/** ---- dynamic window families (companion review r5 P2-2) ----------------------
 * A tool that picks its ports from a base by a ROTATION (scenario-render /
 * hero-extend-render: `LIT + (PORT % A) + (process.pid % B) + s * W`, the
 * 64-port window claimed per slide) or by a PID OFFSET (scenario-titlecard:
 * `reservePort(LIT + (process.pid % B) * M)`, a probe of `tries` ports) can
 * reach a whole RANGE of ports — a band, not a default. The reader derives the
 * family's full reachable range from the source; the tool must declare it on
 * one bare line, `export const PORT_WINDOW_FAMILY = { start: N, end: M };`
 * (several: `PORT_WINDOW_FAMILIES = [{ start, end }, …]`), and the lint holds
 * the declaration equal to the reading (fail-closed: an unreadable shape is a
 * row) and judges the range against every fixed default and declared band. */
export function portWindowFamiliesOf(text) {
  const out = [];
  for (const line of stripComments(String(text), { keepLineComments: true }).split('\n')) {
    const m = /^export const PORT_WINDOW_FAMIL(?:Y|IES) = (\{.*\}|\[.*\]);\s*$/.exec(line);
    if (!m) continue;
    for (const r of m[1].matchAll(/\{\s*start:\s*(\d{4,5})\s*,\s*end:\s*(\d{4,5})\s*\}/g)) out.push({ start: Number(r[1]), end: Number(r[2]) });
  }
  return out;
}
export function dynamicWindowsOfText(text) {
  const lines = stripComments(String(text)).split('\n');
  const families = []; const unreadable = [];
  const seenBase = new Set();
  const probeTries = (() => { const m = /function\s+reservePort\s*\(\s*\w+\s*,\s*\w+\s*=\s*(\d+)\s*[,)]/.exec(lines.join('\n')); if (m) return Number(m[1]); return /from\s+['"](?:\.\.?\/)+(?:lib\/)?endpoint-pair\.mjs['"]/.test(lines.join('\n')) ? 40 : null; })(); // the lib allocator's default window (companion review r10)
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // S1: the rotation loop — `const base = LIT + (X % A) + (process.pid % B) + s * W` inside `for (let s = 0; s < S; …)`, claimed as [base, base + Wm]
    const r = /(?:const|let)\s+(\w+)\s*=\s*(\d{4,5})\s*\+\s*\(\s*\w+\s*%\s*(\d+)\s*\)\s*\+\s*\(\s*process\.pid\s*%\s*(\d+)\s*\)(?:\s*\+\s*(\w+)\s*\*\s*(\d+))?/.exec(l);
    if (r) {
      const [, local, lit, A, B, mul, W] = r; const base = Number(lit);
      let S = 1;
      if (mul) {
        const up = lines.slice(Math.max(0, i - 4), i).join('\n');
        const lm = new RegExp(`for\\s*\\(\\s*let\\s+${mul}\\s*=\\s*0\\s*;\\s*${mul}\\s*<\\s*(\\d+)`).exec(up);
        if (!lm) { unreadable.push({ line: i + 1, text: `${local} = ${lit} + (… % ${A}) + (process.pid % ${B}) + ${mul} * ${W}: the bound of ${mul} is not an enclosing literal loop` }); continue; }
        S = Number(lm[1]);
      }
      const down = lines.slice(i, Math.min(lines.length, i + 6)).join('\n');
      const wm = new RegExp(`claimPortBand\\(\\s*${local}\\s*,\\s*${local}\\s*\\+\\s*(\\d+)`).exec(down);
      if (!wm) { unreadable.push({ line: i + 1, text: `${local} = ${lit} + (… % ${A}) + (process.pid % ${B}): no claimPortBand(${local}, ${local} + <width-1>) window within the next lines` }); continue; }
      if (seenBase.has(base)) continue; seenBase.add(base);
      const end = base + (Number(A) - 1) + (Number(B) - 1) + (S - 1) * (mul ? Number(W) : 0) + Number(wm[1]);
      families.push({ line: i + 1, base, range: { start: base, end }, how: `${lit} + (… % ${A}) + (process.pid % ${B})${mul ? ` + ${mul} * ${W} for ${mul} < ${S}` : ''}, window +${wm[1]}` });
      continue;
    }
    // S4 (companion review r9): a pid-seeded PROBE from a base — the render tools' OWNED http server:
    // `const cand = LIT + ((process.pid * a + k * b) % M)` inside `for (let k = 0; k < N; k++)` reaches [LIT, LIT + M - 1]
    // (scenario-render / hero-extend-render ran this over 8300-12395, across dozens of tools' defaults and the plan lane rows, unmodelled)
    const s4 = /(?:const|let)\s+(\w+)\s*=\s*(\d{4,5})\s*\+\s*\(\(\s*process\.pid\s*\*\s*\d+\s*\+\s*(\w+)\s*\*\s*\d+\s*\)\s*%\s*(\d+)\s*\)/.exec(l);
    if (s4) {
      const [, local, lit, kv, M] = s4; const base = Number(lit);
      const up = lines.slice(Math.max(0, i - 4), i).join('\n');
      if (!new RegExp(`for\\s*\\(\\s*let\\s+${kv}\\s*=\\s*0\\s*;\\s*${kv}\\s*<\\s*\\d+`).test(up)) { unreadable.push({ line: i + 1, text: `${local} = ${lit} + ((process.pid * … + ${kv} * …) % ${M}): ${kv} is not the variable of an enclosing literal loop` }); continue; }
      if (seenBase.has(base)) continue; seenBase.add(base);
      families.push({ line: i + 1, base, range: { start: base, end: base + Number(M) - 1 }, how: `${lit} + ((process.pid * a + ${kv} * b) % ${M}), an owned-server probe` });
      continue;
    }
    // S3: a free-port SCAN from a base — `NAME(LIT)` where this file defines `function NAME(p) { for (let v = p; v < LIT2; v++) … }` → [LIT, LIT2 - 1]
    for (const m of l.matchAll(/\b([A-Za-z_$][\w$]*)\(\s*(\d{4,5})\s*\)/g)) {
      const fn = new RegExp(`function\\s+${m[1]}\\s*\\(\\s*(\\w+)\\s*\\)\\s*\\{[^}]*?for\\s*\\(\\s*let\\s+\\w+\\s*=\\s*\\1\\s*;\\s*\\w+\\s*<\\s*(\\d{4,5})`).exec(lines.join('\n'));
      if (!fn) continue;
      const base = Number(m[2]); if (seenBase.has(base)) continue; seenBase.add(base);
      families.push({ line: i + 1, base, range: { start: base, end: Number(fn[2]) - 1 }, how: `${m[1]}(${m[2]}) scans up to ${fn[2]} exclusive` });
    }
    // S2: the pid family handed to a probing reserve — `reservePort(LIT + (process.pid % B) * M)`
    const q = /(?:reservePort|reserveEndpoint)\(\s*(\d{4,5})\s*\+\s*\(\s*process\.pid\s*%\s*(\d+)\s*\)(?:\s*\*\s*(\d+))?\s*(?:,\s*(\d+))?\s*[,)]/.exec(l); // trailing args (tries, the derived-endpoint spec) allowed; an explicit literal tries is read
    if (q) {
      const base = Number(q[1]); const B = Number(q[2]); const M = q[3] ? Number(q[3]) : 1;
      const tries = q[4] ? Number(q[4]) : probeTries;
      if (tries === null) { unreadable.push({ line: i + 1, text: `reservePort(${q[1]} + (process.pid % ${B})${q[3] ? ` * ${M}` : ''}): reservePort's probe window (tries = N) is not declared in this file` }); continue; }
      if (seenBase.has(base)) continue; seenBase.add(base);
      families.push({ line: i + 1, base, range: { start: base, end: base + (B - 1) * M + tries - 1 }, how: `${q[1]} + (process.pid % ${B})${q[3] ? ` * ${M}` : ''}, ${tries} probe candidates` });
      continue;
    }
    // a rotation EXPRESSION with no claim loop anywhere for its base is a family the reader cannot size
    const e = /(\d{4,5})\s*\+\s*\(\s*\w+\s*%\s*(\d+)\s*\)\s*\+\s*\(\s*process\.pid\s*%\s*(\d+)\s*\)/.exec(l);
    if (e && !seenBase.has(Number(e[1])) && !new RegExp(`(?:const|let)\\s+\\w+\\s*=\\s*${e[1]}\\s*\\+\\s*\\(`).test(lines.join('\n'))) {
      unreadable.push({ line: i + 1, text: `${e[1]} + (… % ${e[2]}) + (process.pid % ${e[3]}): a rotation with no claimed window in this file` });
    }
  }
  return { families, unreadable };
}

/** ---- the wrapper's ONE reserved-extents set (companion review r7 P2-2) ---------
 * Every allocator inside run-gate (the readiness canary / belt probe pair today,
 * any future one) draws from ONE set of extents nothing the wrapper itself may
 * bind: the main band, the layout pins with the suite's inventory behind them
 * (plus the documented +40 internal-derivation window), and EVERY extra claim
 * this process holds. Before r7 the canary checked the band and the two layout
 * pins only — a far pin's second claim was invisible to it, and layout:false
 * let the registry accept the wrapper's own overlapping probe claim. */
export function reservedExtentsFor({ band = null, layoutPins = {}, inventory = null, extraClaims = [], derivationWindow = 40 } = {}) {
  const out = [];
  if (band) out.push({ start: band.start, end: band.end, why: 'the assigned band' });
  for (const [role, value] of Object.entries(layoutPins)) {
    const v = Number(value);
    if (!Number.isFinite(v)) continue;
    const width = inventory ? (inventory[role] ?? 1) : 1;
    out.push({ start: v, end: v + Math.max(width, 1) - 1 + derivationWindow, why: `the ${role} layout pin ${v} (+${Math.max(width, 1) - 1} inventory, +${derivationWindow} derivation window)` });
  }
  for (const x of extraClaims) if (Number.isFinite(x?.start) && Number.isFinite(x?.end)) out.push({ start: x.start, end: x.end, why: `the extra claim ${x.start}-${x.end}` });
  return out;
}
/** A candidate range an allocator wants to bind: allowed only when disjoint from every reserved extent. */
export function allocatorCandidateAllowed(lo, hi, extents) {
  return !(extents ?? []).some((e) => lo <= e.end && e.start <= hi);
}

/** ---- PORT_OVERRIDES (companion review r8 P2-1) -----------------------------------
 * Per tool and per role the EFFECTIVE endpoint is ONE of { explicit override,
 * layout pin, derived default }, in that precedence — only the effective one is
 * reserved, hull-widened or collision-checked. A tool declares which env name
 * REPLACES a role's endpoint on one bare line:
 *   export const PORT_OVERRIDES = { cdp: 'OB_CDP_PORT' };
 * (record.mjs: under run-gate its OB_CDP_PORT replaced the cdp endpoint, yet the
 * wrapper still reserved the derived cdp(0) and refused the "clash" — a valid
 * one-browser configuration exited 75). The declaration is held to the source:
 * the declared env must be the FIRST read of that role's binding, and a role
 * binding that reads an exact-width pin name first must declare it. */
export const OVERRIDE_ENV_NAMES = Object.entries(PIN_NAMES).filter(([, v]) => !v.layout && v.role !== 'band' && !v.model && (v.width ?? 1) === 1).map(([k]) => k);
export function portOverridesOf(text) {
  const out = {}; let error = null;
  for (const line of stripComments(String(text), { keepLineComments: true }).split('\n')) {
    const m = /^export const PORT_OVERRIDES = (\{[^\n]*\});\s*$/.exec(line);
    if (!m) { if (/^\s*export const PORT_OVERRIDES\b/.test(line)) error = `PORT_OVERRIDES must be ONE bare line: export const PORT_OVERRIDES = { cdp: 'OB_CDP_PORT' }; (got: ${line.trim().slice(0, 80)})`; continue; }
    for (const r of m[1].matchAll(/(http|cdp)\s*:\s*['"]([A-Z][A-Z0-9_]*)['"]/g)) {
      const spec = PIN_NAMES[r[2]];
      if (!spec) error = `PORT_OVERRIDES names ${r[2]}, not a PIN_NAMES entry`;
      else if (spec.role !== r[1]) error = `PORT_OVERRIDES binds ${r[2]} (a ${spec.role} name) to the ${r[1]} role`;
      else if (spec.layout) error = `PORT_OVERRIDES names the layout pin ${r[2]} — a layout pin is not an override`;
      else out[r[1]] = r[2];
    }
  }
  return { overrides: out, error };
}
/** The role bindings whose FIRST env read is an exact-width override name
 * (`X !== undefined ? Number(X) : …`, `Number(X ?? …)`, `+(X || …)`, an arrow
 * whose body starts with it): { line, local, env, role }. */
export function overrideReadsOf(text) {
  const out = [];
  const lines = stripComments(String(text)).split('\n');
  const names = OVERRIDE_ENV_NAMES.join('|');
  const re = new RegExp(`^\\s*(?:export\\s+)?(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:\\([^)]*\\)\\s*=>\\s*)?\\(?\\s*(?:Number\\(|\\+\\()?\\s*\\(?\\s*process\\.env\\.(${names})\\b`);
  for (let i = 0; i < lines.length; i++) {
    let code = lines[i];
    if (!/^\s*(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=/.test(code)) continue;
    let j = i; while (!/[;{]\s*$/.test(code) && j + 1 < lines.length && j - i < 4) { j++; code += ' ' + lines[j].trim(); }
    const m = re.exec(code); if (!m) continue;
    if (!/port|cdp|dbg|debug|serve|http/i.test(m[1])) continue; // a boolean like `const pinned = process.env.OB_CDP_PORT !== undefined` is not a role binding
    out.push({ line: i + 1, local: m[1], env: m[2], role: PIN_NAMES[m[2]].role });
  }
  return out;
}

/** Widen a scalar hit to the tool's FULL range from its inventory: a CDP
 * name spans `cdp` ports, an http/port/serve name spans `http` ports. */
export function derivedRange(hit, inventory) {
  if (hit.range || !Number.isFinite(hit.value) || !inventory) return hit.range ?? null;
  const key = `${hit.name ?? ''} ${hit.key ?? ''}`;
  const n = /cdp/i.test(key) ? inventory.cdp : (/port|serve|http/i.test(key) ? inventory.http : 1);
  return n > 1 ? { start: hit.value, end: hit.value + n - 1 } : null;
}

/** ---- PORT_FLAGS (review r10 P2 ×2: run-gate GUESSED what a wrapped tool's
 * port flags mean) ------------------------------------------------------- */

/** A tool's PORT_FLAGS declaration read with the harness parser: { flags }
 * (null when none) or { error } when a declaration starts but does not parse
 * — the lint names that, run-gate refuses on it. */
export function portFlagsOfText(text) {
  try { return { flags: parsePortFlags(String(text)), error: null }; } catch (e) { return { flags: null, error: e.message }; }
}

export const PORT_LIKE = /port|cdp|serve|band/i;

/** The port-like flags a tool's argv parser READS, by static reading:
 *   • any quoted `--x` (x matching PORT_LIKE) in argv-reading position — a
 *     reader call (`argOf('--x')`), a membership test (`args.includes('--x')`,
 *     `.indexOf`), a comparison (`k === '--x'`), a flag-name list
 *     (`VALUE_FLAGS = ['--outdir', '--port', …]`), a usage string;
 *   • the bare-name readers `arg('x', …)` / `flag('x', …)` / `argOf('x')`;
 *   • `--x=` forms read from argv (`startsWith('--x=')`, a `/^--x=/` regex).
 * NOT reads (structural, never a per-tool list): a flag WRITTEN to a child
 * (`['--port', String(PORT)]`, `'--x=' + v`, `--x=${v}` in a template — the
 * value follows the name), and CSS custom-property API calls
 * (`getPropertyValue('--ob-…-band-h')`). Returns Map flag → { line, how, local }
 * where `local` is the const the same statement binds (for role inference). */
export function portFlagsRead(text) {
  const out = new Map();
  const lines = stripComments(text).split('\n');
  // every occurrence's local is kept; the local a READER call binds outranks the
  // one a flag-name list binds (refuter r10: VALUE_FLAGS came first and the role
  // check ran on it, i.e. on nothing)
  const isReaderHow = (how) => how !== 'literal' && how !== 'compare';
  const add = (flag, how, i, local) => {
    if (!PORT_LIKE.test(flag)) return;
    const cur = out.get(flag);
    if (!cur) { out.set(flag, { line: i + 1, how, local, locals: local ? [local] : [], readerLocal: isReaderHow(how) ? local : null }); return; }
    if (local) { cur.locals.push(local); if (isReaderHow(how) && !cur.readerLocal) { cur.readerLocal = local; cur.local = local; } else if (!cur.local) cur.local = local; }
  };
  // the const the SAME statement binds: the nearest declaration BEFORE the match (two statements on one line bind two locals)
  const localOf = (l, at = l.length) => { const ms = [...l.slice(0, at).matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)]; return ms.length ? ms[ms.length - 1][1] : null; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/getPropertyValue\s*\(|setProperty\s*\(|\.style\b/.test(l)) continue;
    if (/^\s*export\s+const\s+PORT_FLAGS\b/.test(l)) continue; // the declaration itself names the flags — never a read
    for (const m of l.matchAll(/(["'])(--[\w-]+)(=?)\1/g)) {
      const flag = m[2]; if (!PORT_LIKE.test(flag)) continue;
      const after = l.slice(m.index + m[0].length);
      const before = l.slice(0, m.index);
      if (m[3] === '=') { // `--x=` : a read only as a prefix test; `'--x=' + v` is a write
        if (/startsWith\s*\(\s*$/.test(before) || /^\s*\)/.test(after) === false && /^\s*\+/.test(after)) { if (/startsWith\s*\(\s*$/.test(before)) add(flag, 'startsWith', i, localOf(l, m.index)); continue; }
        add(flag, 'eq-form', i, localOf(l, m.index)); continue;
      }
      // a WRITE: the flag name is an ELEMENT (after `[` or `,`) followed by its value —
      // `['--port', String(PORT + 1)]`; the FIRST argument of a call is always a read
      // (`argOf('--cdp', DEFAULT_CDP)` — a default after the comma is not a value written)
      const pushCall = /\.(push|unshift|concat)\s*\(\s*$/.test(before); // `args.push('--port', String(PORT))` writes too
      const firstArg = !pushCall && /\(\s*$/.test(before);
      const element = pushCall || /[\[,]\s*$/.test(before) || /^\s*$/.test(before); // an array element, or the first token of a continuation line
      const valueAfter = /^\s*,\s*(String\s*\(|`|[A-Za-z_$][\w$.]*\s*(?:[,\]\)]|\+))/;
      const nextCode = (() => { for (let k = i + 1; k < lines.length && k <= i + 2; k++) if (lines[k].trim()) return lines[k]; return ''; })();
      if (!firstArg && element && (valueAfter.test(after) || (/^\s*,\s*$/.test(after) && /^\s*(String\s*\(|`|[A-Za-z_$][\w$.]*\s*(?:[,\]\)]|\+))/.test(nextCode)))) continue;
      const callee = /([A-Za-z_$][\w$.]*)\s*\(\s*$/.exec(before)?.[1];
      const how = callee ? callee : (/[=!]==?\s*$/.test(before) || /^\s*[=!]==?/.test(after) ? 'compare' : 'literal');
      add(flag, how, i, localOf(l, m.index));
    }
    for (const m of l.matchAll(/\b(arg|flag|argOf|opt|getArg|num|argNum|intArg|argInt|argNumber)\s*\(\s*(["'])([\w-]+)\2/g)) {
      if (m[3].startsWith('-')) continue;
      add(`--${m[3]}`, `${m[1]}(bare)`, i, localOf(l, m.index));
    }
    for (const m of l.matchAll(/\/\^(--[\w-]+)=/g)) add(m[1], 'regex', i, localOf(l, m.index)); // /^--port=(\d+)/
  }
  return out;
}

/** What a flag's bound value is USED as (static, positional — the r7 reader's
 * discipline): `port: X` / `cdpPort: X` in a launch call → cdp;
 * `127.0.0.1:${X}` / `spawnStaticServer(dir, X)` / `.listen(X` → http;
 * `claimPortBand(` / `bandLayout(` with X → band. Returns { role, evidence }
 * with role null when the evidence is absent or mixed. */
export function inferFlagRole(text, local) {
  if (!local) return { role: null, evidence: [] };
  const lines = stripComments(text).split('\n');
  // one hop: `const PORT = Number(PORT_ARG ?? …)` — the derived const carries the flag's role
  const names = [local];
  const uses = new RegExp(`\\b${local.replace(/[$]/g, '\\$')}\\b`);
  for (const l of lines) {
    // per STATEMENT (two declarations on one line are two statements): the RHS must use the local
    for (const m of l.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=([^;]*)/g)) {
      if (m[1] !== local && uses.test(m[2]) && !names.includes(m[1])) names.push(m[1]);
    }
  }
  const L = names.map((x) => x.replace(/[$]/g, '\\$')).join('|');
  const ev = [];
  lines.forEach((l, i) => {
    if (new RegExp(`\\bport\\s*:\\s*(?:${L})\\b`).test(l) || new RegExp(`\\bcdpPort\\s*:\\s*(?:${L})\\b`).test(l) || new RegExp(`remote-debugging-port=\\$\\{(?:${L})\\b`).test(l)) ev.push(`cdp:L${i + 1}`);
    if (new RegExp(`127\\.0\\.0\\.1:\\$\\{(?:${L})\\b`).test(l) || new RegExp(`localhost:\\$\\{(?:${L})\\b`).test(l) || new RegExp(`spawnStaticServer\\([^,)]+,\\s*(?:${L})\\b`).test(l) || new RegExp(`\\.listen\\(\\s*(?:${L})\\b`).test(l)) ev.push(`http:L${i + 1}`);
    if (new RegExp(`(claimPortBand|bandLayout)\\([^)]*\\b(?:${L})\\b`).test(l)) ev.push(`band:L${i + 1}`);
  });
  const kinds = new Set(ev.map((e) => e.split(':')[0]));
  return { role: kinds.size === 1 ? [...kinds][0] : null, evidence: ev.slice(0, 6) };
}

/** Lint r13 (per tool in the derived set): the declared PORT_FLAGS must equal
 * the flags the parser reads, role by role where the use is readable. Returns
 * hits in the tool-default shape (syntax = the problem kind). */
export function portFlagProblems(text, file) {
  const reads = portFlagsRead(text);
  const { flags, error } = portFlagsOfText(text);
  const hit = (syntax, line, msg) => ({ file, line, name: null, syntax, key: null, value: null, range: null, text: msg });
  const out = [];
  if (error) { out.push(hit('port-flags-malformed', 1, error)); return out; }
  if (!reads.size && !flags) return out;
  if (reads.size && !flags) {
    out.push(hit('port-flags-missing', [...reads.values()][0].line,
      `reads the port-like flag(s) ${[...reads.keys()].join(', ')} but declares no PORT_FLAGS — declare \`export const PORT_FLAGS = { ${[...reads.keys()].map((f) => `'${f}': 'http|cdp|band|none'`).join(', ')} };\` next to PORT_INVENTORY (GH-687)`));
    return out;
  }
  for (const [flag, r] of reads) {
    if (!(flag in flags)) { out.push(hit('port-flag-undeclared', r.line, `reads ${flag} (${r.how}) but PORT_FLAGS does not declare it — an undeclared read; run-gate refuses a numeric ${flag} by name (GH-687)`)); continue; }
    const inf = inferFlagRole(text, r.local);
    if (flags[flag] === 'none' && inf.role) {
      out.push(hit('port-flag-role-mismatch', r.line, `declares ${flag} as 'none' (not a port) but its value ${r.local ? `(${r.local}) ` : ''}is used as ${inf.role} (${inf.evidence.join(', ')}) (GH-687)`));
    } else if (inf.role && flags[flag] !== inf.role && flags[flag] !== 'band') {
      out.push(hit('port-flag-role-mismatch', r.line, `declares ${flag} as '${flags[flag]}' but its value ${r.local ? `(${r.local}) ` : ''}is used as ${inf.role} (${inf.evidence.join(', ')}) — the declaration would make run-gate widen and pin it wrongly (GH-687)`));
    }
  }
  for (const flag of Object.keys(flags)) {
    if (!reads.has(flag)) out.push(hit('port-flag-unread', 1, `declares ${flag} in PORT_FLAGS but no argv read of it was found — a stale declaration; remove it or read the flag (GH-687)`));
  }
  return out;
}

/** run-gate's argv pins, BY DECLARATION (review r10 P2): every numeric
 * port-like flag (`--x N`, `--x=N`, `--x A-B`) in the wrapped command must be
 * declared in the tool's PORT_FLAGS; the declared role widens it by the
 * inventory. Returns { pins, refusal } — a refusal is fail-closed: no
 * declaration at all, an undeclared flag, a malformed declaration, or a value
 * whose shape does not fit the role. */
export function argvPortPins(rest, { flags, error } = { flags: null, error: null }, inventory = null, { tool = 'the wrapped tool' } = {}) {
  const found = [];
  for (let i = 0; i < rest.length; i++) {
    const m = /^(--[\w-]+)(?:=(.*))?$/.exec(rest[i]);
    if (!m || !PORT_LIKE.test(m[1])) continue;
    const v = m[2] !== undefined ? m[2] : rest[i + 1];
    if (v === undefined) continue;
    if (/^\d{4,5}$/.test(v) && Number(v) >= 1024 && Number(v) <= 65535) found.push({ flag: m[1], kind: 'int', value: Number(v), text: `${m[1]}=${v}` });
    else if (/^\d{4,5}-\d{4,5}$/.test(v)) {
      const [a, b] = v.split('-').map(Number);
      if (a >= 1024 && b <= 65535 && a <= b) found.push({ flag: m[1], kind: 'range', range: { start: a, end: b }, text: `${m[1]}=${v}` });
      else found.push({ flag: m[1], kind: 'bad', text: `${m[1]}=${v}` }); // reversed or out of bounds
    } else if (/^\d+$/.test(v)) found.push({ flag: m[1], kind: 'bad', text: `${m[1]}=${v}` }); // an integer no port can be (1023, 65536, 7)
  }
  if (!found.length) return { pins: [], refusal: null };
  const real = found.filter((f) => f.kind !== 'bad');
  const list = found.map((f) => f.text).join(', ');
  if (error) return { pins: [], refusal: `${tool}'s PORT_FLAGS declaration does not parse (${error}) — refusing to wrap ${list} (GH-687)` };
  if (!flags) {
    if (!real.length) return { pins: [], refusal: null }; // values no port can be, on a tool that declares nothing: not pins, the tool rejects them
    return { pins: [], refusal: `${tool} is passed the numeric port-like flag(s) ${real.map((f) => f.text).join(', ')} but declares no PORT_FLAGS — run-gate never guesses what a flag means; declare `
      + `\`export const PORT_FLAGS = { ${[...new Set(real.map((f) => f.flag))].map((f) => `'${f}': 'http|cdp|band|none'`).join(', ')} };\` next to PORT_INVENTORY (GH-687)` };
  }
  const pins = [];
  for (const f of found) {
    const role = flags[f.flag];
    if (!role) {
      if (f.kind === 'bad') continue; // not a port anyway; the tool rejects it
      return { pins: [], refusal: `${tool} is passed ${f.text} but its PORT_FLAGS declares no role for ${f.flag} (declared: ${Object.keys(flags).join(', ') || 'none'}) — an undeclared flag is refused by name (GH-687)` };
    }
    if (role === 'none') continue;
    if (f.kind === 'bad') return { pins: [], refusal: `${tool} declares ${f.flag} as its ${role} ${role === 'band' ? 'range' : 'port'} but is passed ${f.text}, which no claim can hold (ports are 1024..65535, ranges A-B with A <= B) (GH-687)` };
    if (role === 'band') {
      if (f.kind !== 'range') return { pins: [], refusal: `${tool} declares ${f.flag} as a band (A-B) but is passed ${f.text} (GH-687)` };
      pins.push({ key: f.flag, role, value: f.range.start, range: f.range, shown: `argv pin ${f.text} (band)` });
      continue;
    }
    if (f.kind !== 'int') return { pins: [], refusal: `${tool} declares ${f.flag} as its ${role} port but is passed a range ${f.text} (GH-687)` };
    const n = inventory && inventory[role] > 1 ? inventory[role] : 1;
    const range = { start: f.value, end: f.value + n - 1 };
    pins.push({ key: f.flag, role, value: f.value, range,
      shown: `argv pin ${f.text} (declared ${role}${n > 1 ? `, ${n} slots → tail ${range.end}` : ''})` });
  }
  return { pins, refusal: null };
}

/** The scan ROOT SET is DERIVED, never a directory list (review r9 P2-1: the
 * scan covered web/tools only while tools/render drove cdp.mjs into the
 * diamond/snooker/verifiers rows). Every tracked JS module (`git ls-files
 * '*.mjs' '*.js' '*.cjs'`; web/dist and vendored trees excluded) whose text
 * imports or spawns the harness (cdp.mjs, touch-cdp.mjs, lib/ci-bands.mjs,
 * run-gate.mjs), calls its claim/launch entry points, or reads a port-like
 * OB_ env name is in the set. Returns [{ path, via }] (repo-relative,
 * sorted); throws when git cannot list the tree or a listed file cannot be
 * read — the lint fails closed rather than scanning a guess. Untracked
 * files are invisible by construction (CI lints the committed tree). */
export const SCAN_ROOT_RE = /cdp\.mjs|touch-cdp\.mjs|lib\/ci-bands\.mjs|run-gate\.mjs|e2e[-\w]*\.mjs|claimPortBand|launchChrome|launchPhone|spawnStaticServer|OB_\w*(?:PORT|CDP|BAND_START|BAND_END|PORT_BASE)\b/;
/** Tracked file kinds in the root set: JS modules AND shell drivers (refuter
 * r9: the internal help-overlay t001-run-battery.sh pins
 * OB_E2E_CDP_PORT=9660… into a lane row while running web/tools suites). */
export const SCAN_PATHSPECS = ['*.mjs', '*.js', '*.cjs', '*.sh', '*.zsh', '*.bash'];
export const isShellFile = (rel) => /\.(sh|zsh|bash)$/.test(rel);
export function deriveScanFiles(repoRoot = REPO_ROOT) {
  let list;
  try {
    list = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z', '--', ...SCAN_PATHSPECS], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    throw new Error(`ci-bands: cannot derive the tool-default scan roots — git ls-files failed in ${repoRoot} `
      + `(${String(e.stderr || e.message).split('\n')[0]}); the root set is derived from the tracked tree, never a directory list`);
  }
  const out = []; const rest = [];
  for (const rel of list.split('\0')) {
    if (!rel || /(^|\/)(node_modules|vendor)\//.test(rel) || rel.startsWith('web/dist/')) continue;
    let text;
    try { text = fs.readFileSync(path.join(repoRoot, rel), 'utf8'); } catch (e) {
      throw new Error(`ci-bands: tracked file ${rel} cannot be read (${e.code ?? e.message}) — the scan root set is incomplete, refusing to lint a guess`);
    }
    const m = SCAN_ROOT_RE.exec(text);
    if (m) out.push({ path: rel, via: m[0] });
    else if (/\.(mjs|js|cjs)$/.test(rel)) rest.push({ rel, text });
  }
  // second pass (companion review r9 P2-2): a file that names a browser tool of the root set in a string is a
  // SPAWNER candidate and joins the set, so the nested-spawn reader sees every parent → child edge
  const toolNames = new Set(out.filter((f) => /\.(mjs|js|cjs)$/.test(f.path)).map((f) => { const t = fs.readFileSync(path.join(repoRoot, f.path), 'utf8'); return (/^export const PORT_INVENTORY\b/m.test(t) || /\blaunchChrome\(/.test(t) || /\blaunchPhone\(/.test(t)) ? path.basename(f.path) : null; }).filter(Boolean));
  if (toolNames.size) {
    const nameRe = new RegExp(`['"\`][^'"\`\\n]*\\b(${[...toolNames].map((n) => n.replace(/[.]/g, '\\.')).join('|')})['"\`]`);
    for (const { rel, text } of rest) { const m = nameRe.exec(text); if (m) out.push({ path: rel, via: `names ${m[1]}` }); }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** The SHELL reader (refuter r9): the three forms the tree's 29 tracked
 * shell files use — `OB_<NAME>=NNNN` / `OB_<NAME>="NNNN"` (an env pin on a
 * run line, quoted or not), `${OB_<NAME>:-NNNN}` (a default) and `--band A-B`
 * / `--band=A-B` (a band literal). `#` comments are dropped first (line start
 * or after whitespace); quoted strings are NOT blanked — shell pins live
 * inside them. Names are gated by the pin rule (PORT | CDP | BAND_START |
 * BAND_END | PORT_BASE), values by the port range. */
export function scanShellDefaultsInText(text, file = '<shell>') {
  const hits = [];
  const lines = String(text).split('\n');
  const NAME = 'OB_\\w*(?:PORT|CDP|BAND_START|BAND_END|PORT_BASE)\\w*';
  const ok = (v) => Number(v) >= 1024 && Number(v) <= 65535;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const code = raw.replace(/^\s*#.*$/, '').replace(/\s#.*$/, '');
    if (!code.trim()) continue;
    // a NAMED exemption for the positional scan below: `# ci-bands: not-a-port 9463 9464 — <why>`
    // on the same line (never a silent skip: the tokens are listed, the reason is on the line)
    const ex = /#\s*ci-bands:\s*not-a-port\s+([\d\s,]+?)\s+[—-]+\s*\S/.exec(raw); // tokens, then a dash and a REASON (an exemption without its why does not count)
    const exempt = new Set(ex ? ex[1].split(/[\s,]+/).filter(Boolean).map(Number) : []);
    const before = hits.length;
    for (const m of code.matchAll(new RegExp(`\\$\\{(${NAME}):-["']?(\\d{4,5})["']?\\}`, 'g'))) {
      if (ok(m[2]) && isPinName(m[1])) hits.push({ file, line: i + 1, name: m[1], syntax: 'shell-env-default', key: m[1], value: Number(m[2]), range: null, via: 'env-name', text: code.trim().slice(0, 140) });
    }
    for (const m of code.matchAll(new RegExp(`(?:^|[\\s"'])(${NAME})=["']?(\\d{4,5})["']?(?=[\\s"']|$)`, 'g'))) {
      if (ok(m[2]) && isPinName(m[1])) hits.push({ file, line: i + 1, name: m[1], syntax: 'shell-env-pin', key: m[1], value: Number(m[2]), range: null, via: 'env-name', text: code.trim().slice(0, 140) });
    }
    for (const m of code.matchAll(/--band[= ]["']?(\d{4,5})-(\d{4,5})["']?/g)) {
      const a = Number(m[1]), b = Number(m[2]);
      if (ok(a) && ok(b) && a <= b) hits.push({ file, line: i + 1, name: '--band', syntax: 'shell-band', key: '--band', value: a, range: { start: a, end: b }, via: 'flag-name', text: code.trim().slice(0, 140) });
    }
    // positional port lists (review r11 P2: `run_one e2e-8ball "8163 9463" ""` put 9463 in the
    // ballreturn lane): every 4-5 digit token in 8000..20000 inside a quoted string is a port
    // unless the line names it in a `# ci-bands: not-a-port` exemption; tokens the readers
    // above already reported on this line (env pins inside the same quotes) are not repeated
    const seen = new Set(hits.slice(before).flatMap((h) => h.range ? [h.range.start, h.range.end] : [h.value]));
    for (const q of code.matchAll(/(["'])([^"']*)\1/g)) {
      for (const t of q[2].matchAll(/(?<![\d.])(\d{4,5})(?![\d.])/g)) {
        const v = Number(t[1]);
        if (v < 8000 || v > 20000 || seen.has(v) || exempt.has(v)) continue;
        seen.add(v);
        hits.push({ file, line: i + 1, name: `"${q[2].trim().slice(0, 40)}"`, syntax: 'shell-quoted-port', key: null, value: v, range: null, via: 'quoted-token', text: code.trim().slice(0, 140) });
      }
    }
  }
  return hits;
}

/** Directory form (fixtures and scratch trees): every .mjs / shell file under `dir`. */
export function scanToolDefaults(dir = path.resolve(HERE, '..')) {
  const files = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) { if (ent.name !== 'node_modules') walk(full); continue; }
      if (ent.name.endsWith('.mjs') || isShellFile(ent.name)) files.push(path.relative(dir, full));
    }
  };
  walk(dir);
  return scanToolDefaultFiles(files, dir);
}

/** The committed lint's form: an explicit FILE LIST (paths relative to
 * `root`, normally deriveScanFiles(REPO_ROOT)); hits carry `file` as given. */
export function scanToolDefaultFiles(files, root, { spawnEdges = NESTED_SPAWN_EDGES } = {}) {
  const out = [];
  const toolIdx = browserToolIndex(files, root); // the browser tools of this scan set (nested-spawn edges resolve against it)
  for (const rel of files) {
    const full = path.join(root, rel);
    try {
      const text = fs.readFileSync(full, 'utf8');
      if (isShellFile(rel)) { out.push(...scanShellDefaultsInText(text, rel)); continue; } // shell drivers: pins, defaults, band literals — no inventories
      const inventory = inventoryOfText(text);
      // GH-750 R4-A (review round 4, P2-1): THE FILE BOUNDARY IS THE ONLY PLACE A REFUSAL CAN STILL BE REPORTED.
      // Every reader below runs on a BLANKED representation of this text. When the grammar refuses the source,
      // cdp.mjs falls back to the standalone tokenizer, and a `/` the tokenizer takes for a regex opener blanks
      // the rest of its line — a `CDP + 25` with it. `derivesFromBase` then answers FALSE and the
      // `undeclared-inventory` row below is simply not emitted: the file leaves the lint clean on a reading the
      // grammar had already rejected. A BOOLEAN reader cannot report that — true, false, and no third value for
      // "I could not read this" — so the refusal is reported HERE, before any blanked text is consulted.
      //   FIX4's `uncertifiedRow` covers the pin-span reader and `offsetsUsed`; both of those run inside the
      //   `if (inventory …)` branch further down, so the one case the dropped row is about — a file with no
      //   inventory at all — reaches neither of them.
      //   A law that reads false on a tokenizer's guess is UNVERIFIED, not satisfied. The other readings still
      //   run and still emit their rows: this row does not replace them, it says what they are worth.
      const cert = jsScanCertificate(text);
      if (!cert.certified) {
        out.push({ file: rel, line: 0, name: null, syntax: 'scan-uncertified', key: null, value: null, range: null, via: 'name', inventory,
          text: `${cert.uncertified} — the grammar REFUSED this source, so every reading of it below comes from the `
            + 'tokenizer\'s guess at a token stream the grammar rejected; a boolean reader cannot report that, and a '
            + 'law that reads false here is unverified rather than satisfied' });
      }
      const codeAll = stripComments(text);
      const hits = scanToolDefaultsInText(text, rel);
      const derives = derivesFromBase(text) || hits.some((h) => h.syntax === 'derived-offset'); // a `BASE ± k` derivation is a base derivation too (r5)
      const sharedWindow = sharedWindowOf(text);
      for (const h of hits) h.sharedWindow = sharedWindow;
      const isHarness = isHarnessPath(rel);
      const isLib = isLibPath(rel);
      // band EDGES are a band (r5, the same class): a tool that defaults
      // OB_E2E_BAND_START ?? a and OB_E2E_BAND_END ?? b claims [a, b] — two scalar
      // hits would let a port strictly between them (renderpurity's old 21800 inside
      // capture-626-sinkrest's 21790-21819) escape every range rule
      {
        // the two edges on separate statements (envKey per statement), or on ONE
        // statement (`claimPortBand(Number(process.env.OB_E2E_BAND_START ?? a), Number(process.env.OB_E2E_BAND_END ?? b))`,
        // one envKey for both hits — sinkrest's shape once its continuation lines join)
        // (venue-lighting lane, PR #727 refuter) EVERY listed band pair, by its prefix — OB_E2E and OB_LIGHTING alike
        const bandPrefixes = [...new Set(Object.keys(PIN_NAMES).filter((k) => PIN_NAMES[k].role === 'band' && /_BAND_(START|END)$/.test(k)).map((k) => k.replace(/_BAND_(START|END)$/, '')))];
        for (const pre of bandPrefixes) {
        const edgeRe = new RegExp(`${pre}_BAND_(START|END)`), stRe = new RegExp(`${pre}_BAND_START`), enRe = new RegExp(`${pre}_BAND_END`);
        const edge = (h) => Number.isFinite(h.value) && /^(nullish|or)-default$/.test(h.syntax) && edgeRe.test(h.text ?? '');
        const both = hits.filter((h) => edge(h) && stRe.test(h.text) && enRe.test(h.text));
        let st = null, en = null;
        if (both.length === 2) [st, en] = both[0].value <= both[1].value ? both : [both[1], both[0]];
        else { st = hits.find((h) => h.envKey === `${pre}_BAND_START` && edge(h)) ?? null; en = hits.find((h) => h.envKey === `${pre}_BAND_END` && edge(h)) ?? null; }
        if (st && en && en.value >= st.value) {
          for (const h of [st, en]) hits.splice(hits.indexOf(h), 1);
          hits.push({ ...st, syntax: 'band-string', key: `${pre}_BAND_START/END`, name: `${pre}_BAND_START/END`, value: null, range: { start: st.value, end: en.value }, via: `env-name ${pre}_BAND_START ?? a / ${pre}_BAND_END ?? b (a band, not two ports)` });
        }
        }
      }
      // derived offsets (r5 P2-1), judged with the inventory in hand: a SAME-role
      // derivation whose offset lies inside the declared inventory (`PORT2 = PORT + 1`
      // under http 2) is a slot of the base's own range, already covered — not a new
      // extent and not undeclared; a cross-role derivation (`CDP_PORT = PORT + 1100`)
      // or an offset past the inventory is an extent of its own. Harness and lib
      // files are the layout (and carry fixture text): never the undeclared row.
      const roleOf = (n) => (/cdp|dbg|debug/i.test(n ?? '') ? 'cdp' : (/port|serve|http/i.test(n ?? '') ? 'http' : null));
      for (let k = hits.length - 1; k >= 0; k--) {
        const h = hits[k];
        if (h.syntax !== 'derived-offset' && h.syntax !== 'derived-offset-undeclared' && h.syntax !== 'derived-default-unparsed') continue;
        if ((isHarness || isLib) && (h.syntax === 'derived-offset-undeclared' || h.syntax === 'derived-default-unparsed')) { hits.splice(k, 1); continue; }
        const from = h.derivedFrom ?? (/= ([A-Za-z_$][\w$]*) [-+] /.exec(h.text ?? '') ?? [])[1];
        const off = Number.isFinite(h.offset) ? h.offset : Number((/[-+] (\d+)/.exec(h.text ?? '') ?? [])[1]);
        const sameRole = roleOf(h.name) === roleOf(from);
        const width = inventory ? inventory[roleOf(h.name) ?? 'http'] ?? 0 : 0;
        if (sameRole && off >= 0 && off < width) hits.splice(k, 1); // a slot inside the base's declared range
      }
      if (!isHarness && !isLib) {
        // a DERIVED endpoint is validated or refused (companion review r9 P2-1). The runtime side is ONE helper,
        // cdp.mjs assertDerivedEndpoint; the static side: every derivation the reader models must pass through it
        // (rollslip `--port 50000` derived CDP 70000 and launched; venom-render `--port 3000` a negative port), a
        // cross-role alias (cdp = http) binds one port twice, and a derived value / range must sit inside 1024-65535.
        const roleOf9 = (n) => (/cdp|dbg|debug/i.test(n ?? '') ? 'cdp' : (/port|serve|http/i.test(n ?? '') ? 'http' : null));
        for (const h of hits) {
          if (h.syntax !== 'derived-offset') continue;
          if (!(new RegExp(`\\bassertDerivedEndpoint\\(\\s*${h.name}\\b`).test(codeAll) || (/\bassertEndpoints\(/.test(codeAll) && new RegExp(`\\bvalue:\\s*${h.name}\\b`).test(codeAll)))) { // assertEndpoints({ role: { value: NAME } }) validates the set (r11)
            out.push({ file: rel, line: h.line, name: h.name, syntax: 'derived-endpoint-unchecked', key: h.name, value: h.value, range: null, via: 'name', inventory,
              text: `${h.name} is derived (${h.via}) but never passes through assertDerivedEndpoint(${h.name}, { tool, role, base, expr }) (cdp.mjs) — an operator's --port makes the derivation leave 1024-65535 (e2e-rollslip --port 50000 → 70000) or equal its base, and the tool launched on it` });
          }
          if (h.offset === 0 && h.derivedFrom && roleOf9(h.name) && roleOf9(h.derivedFrom) && roleOf9(h.name) !== roleOf9(h.derivedFrom)) {
            out.push({ file: rel, line: h.line, name: h.name, syntax: 'derived-endpoint-out-of-range', key: h.name, value: h.value, range: null, via: 'name', inventory,
              text: `${h.name} = ${h.derivedFrom} — a ${roleOf9(h.name)} endpoint equal to its ${roleOf9(h.derivedFrom)} base binds one port twice` });
          }
        }
        for (const [env, spec] of Object.entries(PIN_NAMES)) { // a BASE pin's generated candidates (base + slot * stride + try) are derived endpoints too
          if (spec.model?.kind !== 'base' || !new RegExp(`process\\.env\\.${env}\\b`).test(codeAll)) continue;
          if (!(/\bassertDerivedEndpoint\(|\bassertEndpoints\(|\breserveEndpoint(?:Pair)?\(/.test(codeAll) && new RegExp(`\\bpin:\\s*['"]${env}['"]`).test(codeAll)) && path.basename(rel) !== 'e2e-harness-hygiene.mjs') { // the lib allocator validates every candidate it scans (r10)
            out.push({ file: rel, line: 1, name: env, syntax: 'derived-endpoint-unchecked', key: env, value: null, range: null, via: 'name', inventory,
              text: `generates ports from the base pin ${env} (${spec.model.via}) but no assertDerivedEndpoint(…, { pin: '${env}' }) (cdp.mjs) judges the candidates before they bind` });
          }
        }
      }
      if (!isHarness && !isLib && inventory) {
        // inventory implies PIN READERS (companion review r6 P2-1): a tool that declares
        // PORT_INVENTORY (so run-gate enforces its claim) must read the assigned pins as
        // the fallback for the endpoints it opens — the layout env name of each role
        // it defaults (OB_E2E_PORT / OB_E2E_CDP_PORT), an OB_CDP_PORT read for cdp, or
        // the band names it claims from (OB_E2E_BAND_START/END). renderpurity read
        // neither and escaped every band. A role with no unpinned default (the tool
        // refuses to run without --port, or claims its own band) has nothing to read.
        const code = stripComments(text);
        // PER ROLE (companion review r7 P2-1): the LAYOUT pin of each role — OB_E2E_PORT for
        // http, OB_E2E_CDP_PORT for cdp (or the band names a band-claiming tool derives its
        // layout from). An explicit override such as OB_CDP_PORT keeps precedence but does
        // not stand in for the layout pin: record.mjs read OB_CDP_PORT and derived its CDP
        // from the http port, so under run-gate it derived 51243 and escaped the band.
        const reads = { http: /process\.env\.(OB_E2E_PORT|OB_E2E_BAND_START|OB_E2E_BAND_END)\b/.test(code), cdp: /process\.env\.(OB_E2E_CDP_PORT|OB_E2E_BAND_START|OB_E2E_BAND_END)\b/.test(code) };
        const roleOfName = (n) => (/cdp|dbg|debug/i.test(n ?? '') ? 'cdp' : (/port|serve|http/i.test(n ?? '') ? 'http' : null));
        for (const role of ['http', 'cdp']) {
          if (!(inventory[role] >= 1) || reads[role]) continue;
          const d = hits.find((h) => /^(nullish|or|flag|ternary)-default$|^assignment$|^derived-offset$|^launch-arg-local$/.test(h.syntax) && roleOfName(h.name ?? h.key) === role && Number.isFinite(h.value));
          if (!d) continue;
          hits.push({ file: rel, line: d.line, name: d.name, syntax: 'inventory-without-pin-reader', key: d.name ?? d.key, value: null, range: null, via: 'name', inventory,
            text: `declares PORT_INVENTORY { http: ${inventory.http}, cdp: ${inventory.cdp} } and defaults its ${role} endpoint (${d.name ?? d.key} = ${d.value}, line ${d.line}) but never reads the LAYOUT pin ${role === 'http' ? 'OB_E2E_PORT' : 'OB_E2E_CDP_PORT'}${role === 'cdp' && /process\.env\.OB_CDP_PORT\b/.test(code) ? ' (an OB_CDP_PORT override keeps precedence but does not stand in for it)' : ''} — under run-gate it would bind outside its claim; read the layout pin before any derived fallback` });
        }
      }
      if (!isHarness && !isLib) { // PORT_OVERRIDES (r8 P2-1): declared ⇔ read first, per role
        const { overrides, error } = portOverridesOf(text);
        if (error) out.push({ file: rel, line: 0, name: 'PORT_OVERRIDES', syntax: 'override-declaration-drift', key: 'PORT_OVERRIDES', value: null, range: null, via: 'name', text: error, inventory });
        const reads = overrideReadsOf(text);
        for (const [role, env] of Object.entries(overrides)) {
          if (!reads.some((r) => r.role === role && r.env === env)) out.push({ file: rel, line: 0, name: 'PORT_OVERRIDES', syntax: 'override-declaration-drift', key: 'PORT_OVERRIDES', value: null, range: null, via: 'name', text: `declares ${role}: '${env}' but no ${role} binding in the file reads process.env.${env} FIRST (the override must precede the layout pin and the derived default in the reader order)`, inventory });
        }
        for (const r of reads) {
          if (overrides[r.role] !== r.env) out.push({ file: rel, line: r.line, name: r.local, syntax: 'override-undeclared', key: r.local, value: null, range: null, via: 'name', text: `${r.local} reads process.env.${r.env} FIRST (an exact-width ${r.role} override that REPLACES the role's endpoint) but the file declares no \`export const PORT_OVERRIDES = { ${r.role}: '${r.env}' };\` — run-gate cannot know the derived ${r.role} endpoint is replaced`, inventory });
        }
      }
      if (!isHarness && !isLib) { // dynamic window families (r5 P2-2): declared and equal to the reading, or a row
        const { families, unreadable } = dynamicWindowsOfText(text);
        const declared = portWindowFamiliesOf(text);
        for (const u of unreadable) out.push({ file: rel, line: u.line, name: 'PORT_WINDOW_FAMILY', syntax: 'dynamic-window-unreadable', key: 'PORT_WINDOW_FAMILY', value: null, range: null, via: 'name', text: u.text, inventory });
        for (const f of families) {
          const d = declared.find((x) => x.start === f.range.start && x.end === f.range.end);
          if (d) out.push({ file: rel, line: f.line, name: 'PORT_WINDOW_FAMILY', syntax: 'dynamic-window', key: 'PORT_WINDOW_FAMILY', value: null, range: f.range, via: f.how, text: `dynamic window family ${bandStr(f.range)} (${f.how})`, inventory, sharedWindow, derived: true });
          else out.push({ file: rel, line: f.line, name: 'PORT_WINDOW_FAMILY', syntax: 'dynamic-window-undeclared', key: 'PORT_WINDOW_FAMILY', value: null, range: null, via: f.how, text: `reaches ${bandStr(f.range)} (${f.how}) but declares ${declared.length ? declared.map((x) => bandStr(x)).join(', ') : 'no PORT_WINDOW_FAMILY'} — declare \`export const PORT_WINDOW_FAMILY = { start: ${f.range.start}, end: ${f.range.end} };\` on one bare line`, inventory });
        }
        if (families.length && declared.length && !(/\bassertDerivedEndpoint\(|\bassertEndpoints\(|\breserveEndpoint(?:Pair)?\(/.test(codeAll) && /\bwindow:\s*PORT_WINDOW_FAMIL(?:Y|IES)\b/.test(codeAll))) { // companion review r9 P2-1: a family's candidates are derived endpoints (the lib allocator validates them, r10)
          out.push({ file: rel, line: families[0].line, name: 'PORT_WINDOW_FAMILY', syntax: 'derived-endpoint-unchecked', key: 'PORT_WINDOW_FAMILY', value: null, range: families[0].range, via: families[0].how, inventory,
            text: `picks ports from the dynamic window ${bandStr(families[0].range)} (${families[0].how}) but no assertDerivedEndpoint(…, { window: PORT_WINDOW_FAMILY }) (cdp.mjs) judges the candidate before it binds` });
        }
        for (const d of declared) if (!families.some((f) => f.range.start === d.start && f.range.end === d.end)) out.push({ file: rel, line: 0, name: 'PORT_WINDOW_FAMILY', syntax: 'dynamic-window-undeclared', key: 'PORT_WINDOW_FAMILY', value: null, range: null, via: 'name', text: `declares PORT_WINDOW_FAMILY ${bandStr(d)} but the reader finds no such family in the file (${families.length ? `it reads ${families.map((f) => bandStr(f.range)).join(', ')}` : 'no rotation / pid-offset shape'})`, inventory });
      }
      for (const h of hits) {
        h.inventory = inventory;
        if (!h.range) {
          const envName = h.envKey && PIN_NAMES[h.envKey] ? h.envKey : (PIN_NAMES[h.key] ? h.key : null); // the env name the default FEEDS, whatever the local is called
          const spec = envName ? PIN_NAMES[envName] : null;
          let r = null;
          if (spec && !spec.layout && spec.role !== 'band') { const w = pinWidthOf({ key: envName, role: spec.role }, inventory); r = w > 1 ? { start: h.value, end: h.value + w - 1 } : null; if (r) h.baseSpan = w; } // a listed name: the list's width — exact names are never inventory-widened
          else r = derivedRange(h, inventory);
          if (r) { h.range = r; h.derived = true; }
        }
        out.push(h);
      }
      if (derives && !inventory && !isHarness && !isLib) {
        out.push({ file: rel, line: 1, name: null, syntax: 'undeclared-inventory', key: null, value: null, range: null,
          text: 'computes ports from a base with no `export const PORT_INVENTORY = { http, cdp }`' });
      }
      if (!isHarness && !isLib) out.push(...portFlagProblems(text, rel)); // r13: PORT_FLAGS vs the flags the parser reads
      if (path.basename(rel) !== 'e2e-harness-hygiene.mjs') { out.push(...pinNameDrift(text, rel)); out.push(...pinModelDrift(text, rel)); } // companion: every pin-like OB_* read is listed, and its generated extent equals the list
      if (inventory && !isLib) {
        // declared vs USED runs on every declaring file, harness files included
        // (only the DEFAULT scan exempts them); a nested tool's own inventory is
        // not visible here — such spawns are sized by hand with a stated reason
        for (const [kind, names, declared] of [['cdp', CDP_BASE_NAMES, inventory.cdp], ['http', HTTP_BASE_NAMES, inventory.http]]) { // the declaration's own keys
          const used = offsetsUsed(text, names);
          for (const u of used.unknown) {
            out.push({ file: rel, line: u.line, name: null, syntax: 'offset-bound-unknown', key: null, value: null, range: null,
              text: `${u.expr}: ${u.why} — declared ${kind} ${declared} cannot be checked against it` });
          }
          if (used.maxOffset !== null && used.maxOffset + 1 > declared) {
            out.push({ file: rel, line: used.top.line, name: null, syntax: 'inventory-undercount', key: null, value: null, range: null,
              text: `declared ${kind} ${declared} but the highest ${kind} offset used is +${used.maxOffset} (${used.top.expr}, ${used.top.how}) → needs ${kind} ${used.maxOffset + 1}` });
          }
        }
        // B5: a CDP base bound to a name the reader does not know reads as +0 silently — refuse that
        const bound = [...blankStrings(text).matchAll(/^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:Number\(|\+)?\s*process\.env\.OB_E2E_CDP_PORT\b/gm)].map((m) => m[1]);
        for (const n of bound) if (!CDP_BASE_NAMES.includes(n)) {
          out.push({ file: rel, line: 1, name: n, syntax: 'cdp-base-name-unreadable', key: null, value: null, range: null,
            text: `binds OB_E2E_CDP_PORT to \`${n}\`, a name the declared-vs-used reader does not follow (${CDP_BASE_NAMES.join('/')}) — rename it or the declaration cannot be checked` });
        }
      }
      if (!isShellFile(rel)) out.push(...nestedSpawnProblems(text, rel, { tools: toolIdx, root, edges: spawnEdges, inventory }));
      for (const h of hits) { // the static range rule over every value / range the reader produced
        const lo = h.range ? h.range.start : h.value; const hi = h.range ? h.range.end : h.value;
        if (!Number.isFinite(lo) || !Number.isFinite(hi) || (lo >= 1024 && hi <= 65535) || isHarness || isLib || h.syntax === 'derived-endpoint-out-of-range') continue; // the reader's own row already names it
        out.push({ file: rel, line: h.line, name: h.name, syntax: 'derived-endpoint-out-of-range', key: h.key ?? h.name, value: null, range: null, via: 'name', inventory,
          text: `${h.name ?? h.key} reaches ${lo}-${hi} [${h.syntax}] — outside the valid port range 1024-65535` });
      }
    } catch (e) {
      // GH-750 FIX2 (class S3): a source the tokenizer-based readers cannot read is a PROBLEM ROW, never a skip and
      // never a fallback — the readers throw a named JsScanError and the lint prints the file, line and column
      if (!e?.jsScanUnreadable) throw e;
      out.push({ file: rel, line: e.line ?? 0, name: null, syntax: 'js-scan-unreadable', key: null, value: null, range: null, via: 'name', inventory: null,
        text: `js-scan-unreadable ${rel}:${e.line ?? '?'}:${e.column ?? '?'} ${e.message.replace(/^js-scan-unreadable \S+ /, '')} — the readers refuse to guess at a file the parser cannot read; every law over it is unverified until it parses` });
    }
  }
  return out;
}

/** ---- nested spawns (companion review r9 P2-2) ----------------------------------
 * A tool that spawns ANOTHER browser tool passes the resolved http AND cdp pins
 * explicitly — the child's flags, or OB_E2E_PORT / OB_E2E_CDP_PORT / OB_CDP_PORT
 * keys in the spawn's env object — never leaving the child to derive: cuepost-
 * live-sheet spawned record.mjs with --port only and the child derived 28543,
 * inside scenario-render's rotation family. The lint models every parent → child
 * edge in ONE static table and holds it to the code:
 *   nested-spawn-undeclared  the reader finds a spawn edge the table lacks
 *   nested-spawn-drift       a table edge the parent's code no longer has
 *   nested-spawn-unpinned    the parent's spawn statements carry no explicit pin for a role
 *                            (or a `child-claims` child that in fact reads the layout pins)
 *   nested-spawn-inventory   the parent's PORT_INVENTORY does not cover the child's at the offset passed
 *   nested-spawn-unreadable  a basename several browser tools share, spelled without its path
 * An edge is READ from the parent: a browser tool's basename inside a string of a
 * spawn statement, of a local a spawn statement uses (`const cli = path.join(…,
 * 'scenario-render.mjs')`, `const render = ['tools/scenario-render.mjs', …]`), or of
 * a binding (a step table) in a file that spawns node children. Pin evidence is
 * judged over those statements together (a helper such as runChild carries the
 * env, its callers the flags). `pins: 'child-claims'` names a child that claims
 * every endpoint from the GH-338 registry itself and reads no layout pin — nothing
 * to pass; the reader verifies that on the child. Harness and lib files are the
 * layout and stage fixtures: never edges. */
export const NESTED_SPAWN_EDGES = Object.freeze([
  { parent: 'web/tools/cuepost-live-sheet.mjs', child: 'web/tools/record.mjs', http: '--port', cdp: 'OB_CDP_PORT' },
  { parent: 'web/tools/e2e-record.mjs', child: 'web/tools/record.mjs', http: '--port', cdp: 'OB_CDP_PORT' },
  { parent: 'web/tools/e2e-cuepost.mjs', child: 'web/tools/scenario-render.mjs', http: '--port', cdp: 'OB_CDP_PORT' },
  { parent: 'web/tools/scenario-batch.mjs', child: 'web/tools/scenario-render.mjs', http: '--port', cdp: 'OB_CDP_PORT' },
  { parent: 'web/tools/scenario-batch.mjs', child: 'web/tools/scenario-titlecard.mjs', pins: 'child-claims' },
  { parent: 'web/tools/capture-525-combined.mjs', child: 'web/tools/capture-034-play.mjs', http: 'OB_E2E_PORT', cdp: 'OB_E2E_CDP_PORT' },
  { parent: 'web/tools/capture-525-combined.mjs', child: 'web/tools/capture-036-practice.mjs', http: 'OB_E2E_PORT', cdp: 'OB_E2E_CDP_PORT' },
  { parent: 'web/tools/capture-525-combined.mjs', child: 'web/tools/capture-525-shell.mjs', http: 'OB_E2E_PORT', cdp: 'OB_E2E_CDP_PORT' },
  { parent: 'web/tools/capture-525-combined.mjs', child: 'web/tools/capture-525-replays.mjs', http: 'OB_E2E_PORT', cdp: 'OB_E2E_CDP_PORT' },
  { parent: 'web/tools/test-cdp-reply-detail.mjs', child: 'web/tools/e2e-lighting-matrix.mjs', http: 'OB_E2E_PORT', cdp: 'OB_E2E_CDP_PORT' }, // #1221: the gate against the scripted endpoint
  { parent: 'tools/render/a4annex-488p.mjs', child: 'tools/render/capture-488p-pose.mjs', pins: 'child-claims' },
  { parent: 'tools/render/overlay-490-gate.mjs', child: 'web/tools/capture-490-chinese8.mjs', http: 'OB_E2E_PORT', cdp: 'OB_E2E_CDP_PORT' },
  { parent: 'ios/tools/acceptance.mjs', child: 'ios/tools/e2e-ios.mjs', http: 'OB_E2E_PORT', cdp: 'OB_E2E_CDP_PORT' },
]);
export const SPAWN_CALLEE_RE = /\b(?:spawn|spawnSync|execFile|execFileSync|fork|execSync)\s*\(|(?<![.\w$])(?:exec|run|runChild|runCli|runNode|runTool)\s*\(/;
const NODE_CMD_RE = /(?:['"]node['"]|process\.execPath)\s*,/;
const PIN_FORMS = {
  http: { env: ['OB_E2E_PORT'], flags: ['--port'] },
  cdp: { env: ['OB_CDP_PORT', 'OB_E2E_CDP_PORT'], flags: ['--cdp-port', '--cdp'] },
};
/** basename → [repo-relative paths] of the browser tools in a scan set (a PORT_INVENTORY declaration or a launch call). */
export function browserToolIndex(files, root) {
  const idx = new Map();
  for (const rel of files) {
    if (isShellFile(rel) || isHarnessPath(rel) || isLibPath(rel)) continue; // the harness DEFINES the launchers; it is never a spawned child
    let text; try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { continue; }
    if (/^export const PORT_INVENTORY\b/m.test(text) || /\blaunchChrome\(/.test(text) || /\blaunchPhone\(/.test(text)) idx.set(path.basename(rel), [...(idx.get(path.basename(rel)) ?? []), rel]);
  }
  return idx;
}
const splitSpawnStatements = (code) => { // statements at `;` / `{` / `}` with () and [] balanced — a spawn inside a loop body is its own statement, an options object stays inside its call
  // The reader is a tokenizer, and it has to know the three JS forms whose insides are NOT code, or one line poisons the rest of
  // the file: (1) a template literal's INTERPOLATIONS are code and its text is not — `${a ? `x` : 'y'} it's here` nests, and
  // reading the inner backtick as the outer one's close leaves the tail outside any string, where an ordinary apostrophe opens
  // one — so the string state is a STACK; (2) a REGEX literal's insides are neither code nor a string: `/…wpa_generic_9ft \(6
  // kernel cups/` left `depth` at 1 for good and made the remaining 4700 lines ONE statement, which is how three false spawn
  // edges landed on web/tools/test-ballreturn.mjs (#737 r12) — a whole-file statement holds every literal in the file; (3) a
  // ' or " never spans a line. Each of these can as easily HIDE a real spawn edge as invent one, so this reader is fail-loud.
  const out = []; const stack = []; let depth = 0; let cur = ''; let line = 1; let startLine = 1; let prev = null;
  const top = () => (stack.length ? stack[stack.length - 1] : null);
  const REGEX_PREV = /[({[,;:=!&|?+\-*%^~<>]/;                // after these a `/` opens a regex; after a value it is division
  const REGEX_KW = /(?:^|[^\w$])(?:return|typeof|case|in|of|new|delete|void|do|else|yield|await)\s*$/;
  for (let k = 0; k < code.length; k++) {
    const c = code[k];
    if (c === '\n') line++;
    const q = top() === "'" || top() === '"' || top() === '`' ? top() : null;
    if (q) {
      cur += c;
      if (c === '\\') { const n = code[k + 1] ?? ''; cur += n; if (n === '\n') line++; k++; continue; }
      if (q === '`' && c === '$' && code[k + 1] === '{') { cur += '{'; k++; stack.push('$'); continue; }   // into the interpolation: code again
      if (c === q) { stack.pop(); continue; }
      if (c === '\n' && q !== '`') stack.pop();               // (3) an unterminated ' or " ends at the line, as stripComments reads it
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { if (cur.trim() === '') startLine = line; stack.push(c); prev = c; cur += c; continue; }
    if (c === '/' && (prev === null || REGEX_PREV.test(prev) || REGEX_KW.test(cur))) {   // (2) a regex literal: parens, quotes and slashes inside it are text
      let m = k + 1, cls = false, closed = false;
      for (; m < code.length; m++) {
        const e = code[m];
        if (e === '\\') { m++; continue; }
        if (e === '\n') break;                                 // an unterminated regex ends at the line: it was division after all
        if (cls) { if (e === ']') cls = false; continue; }
        if (e === '[') { cls = true; continue; }
        if (e === '/') { closed = true; break; }
      }
      if (closed) { if (cur.trim() === '') startLine = line; cur += code.slice(k, m + 1); prev = 'x'; k = m; continue; }
    }
    if (c === '(' || c === '[') depth++; else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    if (stack.length) {                                        // inside a template's interpolation: never a statement boundary
      if (c === '{') stack.push('{'); else if (c === '}') stack.pop();
      if (!/\s/.test(c)) prev = c;
      cur += c; continue;
    }
    if ((c === ';' || c === '{' || c === '}') && depth === 0) { if (cur.trim()) out.push({ text: cur, line: startLine }); cur = ''; continue; }
    if (cur.trim() === '' && !/\s/.test(c)) startLine = line;
    if (!/\s/.test(c)) prev = c;
    cur += c;
  }
  if (cur.trim()) out.push({ text: cur, line: startLine });
  return out;
};
export function nestedSpawnProblems(text, rel, { tools, root = REPO_ROOT, edges = NESTED_SPAWN_EDGES, inventory = null } = {}) {
  const out = [];
  const row = (line, syntax, detail) => ({ file: rel, line, name: null, syntax, key: null, value: null, range: null, via: 'name', text: detail, inventory });
  if (isHarnessPath(rel) || isLibPath(rel) || isShellFile(rel) || !tools || !tools.size) return out;
  const code = stripComments(String(text));
  const self = path.basename(rel);
  const names = [...tools.keys()].filter((b) => b !== self);
  if (!names.length) return out;
  const litRe = new RegExp(`(['"\`])([^'"\`\\n]*?\\b(${names.map((n) => n.replace(/[.]/g, '\\.')).join('|')}))\\1`, 'g');
  const resolveChild = (lit, base) => {
    const cands = tools.get(base) ?? [];
    if (cands.length === 1) return cands[0];
    const tail = lit.replace(/^\.\//, '');
    const hit = cands.filter((c) => c.endsWith(tail) || tail.endsWith(c));
    return hit.length === 1 ? hit[0] : null;
  };
  const stmts = splitSpawnStatements(code);
  const spawnStmts = stmts.filter((st) => SPAWN_CALLEE_RE.test(st.text));
  const nodeLocals = new Set(); const childLocals = new Map(); // local → child
  const relevant = new Map(); // child → [statements]
  const noteRel = (child, st) => { if (!relevant.has(child)) relevant.set(child, []); if (!relevant.get(child).includes(st)) relevant.get(child).push(st); };
  const bindings = [];
  for (const st of stmts) {
    const t = st.text;
    if (/^\s*(?:import|export)\b/.test(t)) continue;
    const bind = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(t);
    const found = [...t.matchAll(litRe)];
    if (bind && !found.length && NODE_CMD_RE.test(t) && /=\s*\[/.test(t)) nodeLocals.add(bind[1]);
    for (const m of found) {
      const child = resolveChild(m[2], m[3]);
      if (child === null) { out.push(row(st.line, 'nested-spawn-unreadable', `names ${m[2]} — several browser tools share that basename (${(tools.get(m[3]) ?? []).join(', ')}) and the literal does not say which; spell the path out`)); continue; }
      if (child === rel) continue;
      if (SPAWN_CALLEE_RE.test(t)) noteRel(child, st);
      else if (bind) { childLocals.set(bind[1], child); bindings.push({ child, st }); }
    }
  }
  const nodeSpawns = spawnStmts.filter((st) => NODE_CMD_RE.test(st.text) || [...nodeLocals].some((n) => new RegExp(`\\b${n}\\b`).test(st.text)) || [...childLocals.keys()].some((n) => new RegExp(`\\b${n}\\b`).test(st.text)));
  for (const st of spawnStmts) for (const [local, child] of childLocals) if (new RegExp(`\\b${local}\\b`).test(st.text)) { noteRel(child, st); const b = bindings.find((x) => x.child === child); if (b) noteRel(child, b.st); }
  if (nodeSpawns.length) for (const { child, st } of bindings) { noteRel(child, st); for (const ns of nodeSpawns) noteRel(child, ns); } // a step table in a file that spawns node children
  const found = [...relevant.keys()];
  const mine = edges.filter((e) => e.parent === rel);
  for (const child of found) if (!mine.some((e) => e.child === child)) {
    out.push(row(relevant.get(child)[0].line, 'nested-spawn-undeclared', `spawns the browser tool ${child} (${relevant.get(child)[0].text.trim().replace(/\s+/g, ' ').slice(0, 90)}…) but the edge ${rel} → ${child} is not in NESTED_SPAWN_EDGES (web/tools/lib/ci-bands.mjs) — declare it with the pin forms it passes (or pins: 'child-claims'), so the child's endpoints are part of this tool's extent`));
  }
  const readChild = (child) => { try { return fs.readFileSync(path.join(root, child), 'utf8'); } catch { return null; } };
  for (const e of mine) {
    if (!found.includes(e.child)) { out.push(row(0, 'nested-spawn-drift', `NESTED_SPAWN_EDGES lists ${rel} → ${e.child} but no spawn statement of this file names that child (or ${e.child} is no longer a browser tool) — remove the edge or restore the spawn`)); continue; }
    const childText = readChild(e.child);
    if (childText === null) { out.push(row(0, 'nested-spawn-drift', `NESTED_SPAWN_EDGES lists ${rel} → ${e.child} but the child file cannot be read`)); continue; }
    const childCode = stripComments(childText);
    const stmtsFor = relevant.get(e.child); const joined = stmtsFor.map((st) => st.text).join('\n');
    if (e.pins === 'child-claims') {
      const claims = /\bclaimPortBand\(/.test(childCode) || /\breservePort\(/.test(childCode) || /\breserveEndpoint(?:Pair)?\(/.test(childCode); // the lib allocator claims from the registry (r10)
      const readsLayout = /process\.env\.(OB_E2E_PORT|OB_E2E_CDP_PORT)\b/.test(childCode);
      const why = [readsLayout ? 'reads the layout pins OB_E2E_PORT / OB_E2E_CDP_PORT' : null, claims ? null : 'claims nothing from the registry'].filter(Boolean);
      if (why.length) out.push(row(stmtsFor[0].line, 'nested-spawn-unpinned', `edge ${rel} → ${e.child} is declared child-claims, but the child ${why.join(' and ')} — pass both pins explicitly and declare the forms`));
      continue;
    }
    const { flags: childFlags } = portFlagsOfText(childText);
    const childInv = inventoryOfText(childText);
    for (const role of ['http', 'cdp']) {
      const form = e[role];
      if (!form) { out.push(row(stmtsFor[0].line, 'nested-spawn-unpinned', `edge ${rel} → ${e.child} declares no ${role} pin form — every nested browser tool gets BOTH pins explicitly`)); continue; }
      const isEnv = /^OB_/.test(form);
      const okForm = isEnv ? PIN_FORMS[role].env.includes(form) : ((childFlags && childFlags[form] === role) || PIN_FORMS[role].flags.includes(form));
      if (!okForm) { out.push(row(stmtsFor[0].line, 'nested-spawn-unpinned', `edge ${rel} → ${e.child}: '${form}' is not a ${role} pin form the child honours (${isEnv ? `the ${role} env names are ${PIN_FORMS[role].env.join(' / ')}` : `the child's PORT_FLAGS say ${childFlags ? JSON.stringify(childFlags) : 'nothing'}`})`)); continue; }
      const present = isEnv ? new RegExp(`\\b${form}\\s*:`).test(joined) : new RegExp(`['"]${form}['"]`).test(joined);
      if (!present) {
        out.push(row(stmtsFor[0].line, 'nested-spawn-unpinned', `spawns ${e.child} without an explicit ${role} pin (no ${isEnv ? `${form}: … in a spawn env object` : `'${form}' in the child's argv`} across its spawn statements; ${stmtsFor[0].text.trim().replace(/\s+/g, ' ').slice(0, 100)}…) — the child would derive its ${role} endpoint itself (cuepost-live-sheet → record.mjs derived 28543 inside scenario-render's family); pass the resolved pin`));
        continue;
      }
      if (inventory && childInv && childInv[role] >= 1) { // the parent's extent covers the child's at the offset passed
        const offs = [...joined.matchAll(isEnv ? new RegExp(`\\b${form}\\s*:\\s*String\\(\\s*[A-Za-z_$][\\w$]*\\s*(?:\\+\\s*(\\d+))?\\s*\\)`, 'g') : new RegExp(`['"]${form}['"]\\s*,\\s*String\\(\\s*[A-Za-z_$][\\w$]*\\s*(?:\\+\\s*(\\d+))?\\s*\\)`, 'g'))].map((m) => Number(m[1] ?? 0));
        const k = offs.length ? Math.max(...offs) : 0;
        if ((inventory[role] ?? 0) < k + childInv[role]) out.push(row(stmtsFor[0].line, 'nested-spawn-inventory', `spawns ${e.child} (PORT_INVENTORY ${role} ${childInv[role]}) at ${role} offset +${k} but declares ${role} ${inventory[role] ?? 0} — the child's endpoints are part of this tool's extent: declare ${role} ${k + childInv[role]} or more`));
      }
    }
  }
  return out;
}

/** CLI helper: lint the committed table against the workflow files it
 * names. Returns the lint result plus the file list read. */
/** pinned-digest-corrupt (companion review r3 P2-1): a pinned digest must stay
 * EXACTLY a digest. The #705/#725 port-literal sweep rewrote `9714` INSIDE a
 * pinned SHA-256 (orbitsweep-488p.mjs) to `23874`, leaving a 65-char "digest"
 * that could never match its file. A digit run swapped for one of another
 * length moves a 64-hex token to 61-67 chars (a 128-hex one to 125-131), so the
 * tree lints every tracked text file for hex runs in those windows that are not
 * exactly 64 / 128. Deliberately TRUNCATED prefixes (the tree shows 56-60 hex
 * prefixes in examples and reports) sit outside the windows and are not rows;
 * a same-length swap is invisible to a length rule and stays the audit tool's
 * business (web/tools/audit-port-relocation.mjs). `files` are repo-relative
 * paths under `root`. */
export const DIGEST_FILE_RE = /\.(mjs|js|cjs|ts|json|md|sh|zsh|bash|ya?ml|py|rs|toml|txt|html|css)$/;
export function pinnedDigestProblems(files, root) {
  const out = [];
  const HEX = /(?<![0-9A-Za-z_])[0-9a-fA-F]{61,131}(?![0-9A-Za-z_])/g;
  const corrupt = (n) => (n >= 61 && n <= 67 && n !== 64) || (n >= 125 && n <= 131 && n !== 128);
  for (const rel of files) {
    let text;
    try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch { continue; }
    if (!/[0-9a-fA-F]{61}/.test(text)) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const m of lines[i].matchAll(HEX)) {
        if (!corrupt(m[0].length)) continue;
        out.push({ kind: 'pinned-digest-corrupt', detail: `${rel}:${i + 1} hex token of ${m[0].length} chars is a digest of the wrong length (64 / 128 expected): `
          + `${m[0].slice(0, 24)}… — a pinned SHA was edited by a token sweep; restore the exact digest` });
      }
    }
  }
  return out;
}
export function digestScanFiles(repoRoot) {
  let listed;
  try {
    listed = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);
  } catch (e) { throw new Error(`cannot derive the digest scan set: git ls-files failed under ${repoRoot} (${e.message})`); }
  return listed.filter((f) => DIGEST_FILE_RE.test(f) && !/^web\/(dist|vendor)\//.test(f) && !/(^|\/)node_modules\//.test(f) && !/\.lock$/.test(f));
}

export function lintCommittedCiBands({ tableFile = CI_BANDS_FILE, workflowsDir = WORKFLOWS_DIR,
  toolsDir = path.resolve(HERE, '..'), laneFile = LANE_BANDS_FILE, repoRoot = REPO_ROOT, scanFiles = null } = {}) {
  const table = loadCiBands(tableFile);
  const laneBands = laneFile && fs.existsSync(laneFile) ? loadLaneBands(laneFile, table) : null;
  // EVERY workflow file, not only the ones the table names: a --band added
  // to a third workflow inside the reserved range must be seen (r1)
  const names = fs.readdirSync(workflowsDir).filter((n) => /\.ya?ml$/.test(n)).sort();
  const workflows = {};
  for (const n of names) workflows[n] = fs.readFileSync(path.join(workflowsDir, n), 'utf8');
  // the tool-default scan runs over the DERIVED root set (review r9 P2-1), not web/tools
  const scanned = scanFiles ?? deriveScanFiles(repoRoot);
  const toolDefaults = scanToolDefaultFiles(scanned.map((f) => f.path), repoRoot);
  const suiteText = (f) => { try { return fs.readFileSync(path.join(toolsDir, f), 'utf8'); } catch { return null; } };
  const r = lintCiBands({ table, workflows, toolDefaults, laneBands, suiteText });
  // tree-wide, independent of the band tables: a pinned digest stays a digest
  const digests = pinnedDigestProblems(digestScanFiles(repoRoot), repoRoot);
  return { ...r, ok: r.ok && digests.length === 0, problems: [...r.problems, ...digests], files: names, table, laneBands, scanned };
}
