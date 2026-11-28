#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// site-physics-data.mjs — the scenario-gallery data pipeline (site wave).
//
// Single source of truth: the committed per-entry gate records at
// site/assets/physics/<id>-gates.json (byte-copies of the published
// scenario-video pack; provenance in site/assets/physics/SOURCES.md).
// This script derives EVERYTHING the site says about the videos from
// those records — the pages never hand-code a physics digit:
//
//   1. site/assets/physics/physics-data.json     (the derived catalog)
//   2. site/docs/physics.html                    (generated tile markup,
//      between the scenario-tiles BEGIN/END markers)
//   3. site/index.html                           (generated teaser tiles,
//      between the scenario-teaser BEGIN/END markers)
//
// Claim lines quote the in-video corner badge verbatim (`badge.line1`,
// composed at render time from re-measured marks — see
// web/tools/scenario-catalog.mjs badge()); the one v1-shaped record
// (thirty-rule, which predates the badge field) re-derives the same
// digits from its anchor + marks exactly as the catalog badge() does.
// Durations come from the delivered plan clocks, kernel stamps from the
// records. Output is deterministic byte-for-byte, so CI can diff.
//
// Preview renditions (bb-clip dual-source, the design charter): an entry MAY carry
// a textless in-tile preview at site/assets/physics/preview/
// <id>-preview.mp4 (produced by the render job, not yet committed). This
// script existence-checks that convention path per entry: present →
// `previewSrc` in the catalog + `data-clip-preview` on the tile; absent →
// previewSrc null and NO attribute, so the tile falls back to the full
// source (bb-clip's single-source behavior — the pages ship complete
// before the preview files land). The check is a pure function of the
// tree, so the --check drift lane stays deterministic: adding preview
// files WITHOUT regenerating is drift, by design.
//
// Usage:
//   node scripts/site-physics-data.mjs           regenerate in place
//   node scripts/site-physics-data.mjs --check   drift gate: fails when a
//                                                committed output differs
//                                                from regeneration
//
// Swapping in a re-rendered pack = copy the new mp4/poster/gates files
// (and any preview/ renditions) over site/assets/physics/, update
// SOURCES.md, re-run this script.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync, statSync }
  from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'site', 'assets', 'physics');
const OUT_JSON = join(DIR, 'physics-data.json');
const OUT_DOCS = join(ROOT, 'site', 'docs', 'physics.html');
const OUT_INDEX = join(ROOT, 'site', 'index.html');

// ---------------------------------------------------------------------------
// Curation (page layer, not physics): the grouping by physics family and the
// three index-teaser flagships. Every id must have a committed gates record;
// a future pack swap that renames or adds entries fails loudly here until
// this map is consciously updated.
// ---------------------------------------------------------------------------
const GROUPS = [
  { id: 'aiming', label: 'Aiming systems',
    entries: ['thirty-rule', 'ninety-rule', 'gearing-zero-throw'] },
  { id: 'throw', label: 'Throw & friction',
    entries: ['squirt-endmass', 'cit-throw-curve', 'ten-times-fuller',
      'cling-chalk-skid'] },
  { id: 'spin', label: 'Spin & cloth',
    entries: ['sidespin-kicks', 'draw-arc-ladder', 'wpa-lag'] },
  { id: 'cushions', label: 'Cushions & banks',
    entries: ['bank-ladder-b28', 'corner-5-three-rail'] },
  { id: 'airborne', label: 'Airborne & break',
    entries: ['jump-min-elevation', 'masse-bar-aiming', 'break-squat'] },
];
const TEASER = ['squirt-endmass', 'thirty-rule', 'bank-ladder-b28'];

const die = (msg) => { console.error(`site-physics-data: ${msg}`); process.exit(1); };

// ---------------------------------------------------------------------------
// derive one entry from its gates record
// ---------------------------------------------------------------------------
const readGates = (id) => {
  let raw;
  try { raw = readFileSync(join(DIR, `${id}-gates.json`), 'utf8'); }
  catch { die(`missing gates record for '${id}' (${id}-gates.json)`); }
  return JSON.parse(raw);
};

const claimFor = (g) => {
  if (g.badge?.line1) return g.badge.line1;
  // v1-shaped record (no badge field — thirty-rule): compose the corner
  // badge exactly as the catalog badge() renders it into the frame — BOTH
  // values at two decimals ("predicted 33.70° · measured 33.71°", verified
  // against the shipped video's burned badge; review r2 P2).
  const pred = g.anchor?.predictedDeg;
  const meas = g.video?.marks?.thetaCDeg;
  if (typeof pred !== 'number' || typeof meas !== 'number') {
    die(`${g.scenario}: no badge.line1 and no anchor/marks fallback`);
  }
  return `predicted ${pred.toFixed(2)}° · measured ${meas.toFixed(2)}°`;
};

const durationFor = (g) => {
  const plans = Array.isArray(g.segments)
    ? g.segments.map((s) => s.plan)   // v2 shape: one plan per segment
    : [g.plan];                       // v1 shape: single top-level plan
  return plans.reduce((t, p) => {
    const sec = p?.replay?.deliveredSec ?? p?.outputSec;
    if (typeof sec !== 'number') die(`${g.scenario}: segment without a delivered clock`);
    return t + sec;
  }, 0);
};

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

// The gates records label entries with verification-battery cell ids in a
// trailing parenthetical ("(battery A2)", "(… + battery F2)", "(battery D2
// family)"). That numbering is internal, so the published pages and catalog
// drop the parenthetical; other parentheticals (e.g. "(issue #53)") stay.
const stripBatteryIds = (s) => String(s)
  .replace(/\s*\([^)]*battery [A-F]\d[^)]*\)/g, '')
  .trim();
// badge.line2 segments carry the same internal ids in uppercase segment
// form ("· BATTERY A1 (EXP_A1_NINETY) ·") — drop the whole segment, keep
// the literature/measurement segments around it. Segments citing the
// third-party slow-motion reference catalog by its catalog id (the id
// family the regex below matches) go too: a competitor's name never
// reaches a published page (tools/check-competitor-brands.mjs).
const stripBatterySegments = (s) => (s == null ? null : String(s)
  .split(' · ')
  .filter((seg) => !/\bBATTERY [A-F]\d\b|\bEXP_[A-Z0-9_]+\b|(?<![0-9A-Za-z])SP[-_]SLOWMO/.test(seg))
  .join(' · '));

const buildEntry = (id) => {
  const g = readGates(id);
  if (g.scenario !== id) die(`${id}-gates.json names scenario '${g.scenario}'`);
  const mp4 = `${id}.mp4`;
  const poster = `${id}-poster.webp`;
  const mp4Sha = sha256(join(DIR, mp4));
  // the pin is REQUIRED, not best-effort (review r1 P2): a record without
  // titleCard.mp4Sha256 would otherwise skip verification silently while
  // the CI lane promises every mp4 is pin-checked
  if (!g.titleCard?.mp4Sha256) die(`${id}: gates record carries no titleCard.mp4Sha256 pin`);
  if (g.titleCard.mp4Sha256 !== mp4Sha) {
    die(`${id}: committed ${mp4} sha ${mp4Sha} != gates pin ${g.titleCard.mp4Sha256}`);
  }
  // preview rendition: convention path, existence-checked (header note) —
  // a rendition of the gated mp4, so it carries no gates pin of its own
  const preview = `preview/${id}-preview.mp4`;
  return {
    id,
    title: stripBatteryIds(g.title),
    name: stripBatteryIds(g.titleCard?.value ?? g.title),
    tagline: stripBatteryIds(g.titleCard?.claim ?? ''),
    claim: claimFor(g),
    context: stripBatterySegments(g.badge?.line2 ?? null),
    durationSec: durationFor(g),
    kernel: g.kernel,
    mp4,
    poster,
    gates: `${id}-gates.json`,
    previewSrc: existsSync(join(DIR, preview)) ? preview : null,
    mp4Bytes: statSync(join(DIR, mp4)).size,
    mp4Sha256: mp4Sha,
    posterSha256: sha256(join(DIR, poster)),
  };
};

// ---------------------------------------------------------------------------
// assemble the catalog
// ---------------------------------------------------------------------------
const ids = GROUPS.flatMap((grp) => grp.entries);
if (new Set(ids).size !== ids.length) die('duplicate id in GROUPS');
for (const t of TEASER) if (!ids.includes(t)) die(`teaser id '${t}' not in GROUPS`);
// committed records and GROUPS must agree BOTH ways (review r1 P2): a pack
// swap that adds or renames an entry without updating the curation map must
// fail loudly, never silently drop a committed scenario from the pages
const onDisk = readdirSync(DIR).filter((f) => f.endsWith('-gates.json'))
  .map((f) => f.replace(/-gates\.json$/, ''));
const strays = onDisk.filter((id) => !ids.includes(id));
if (strays.length) {
  die(`gates records not listed in GROUPS: ${strays.join(', ')} — update the curation map`);
}
// preview/ obeys the same loud-failure rule: every file there must be the
// convention rendition of a curated entry — an orphan (typo'd id, removed
// entry, stray encode artifact) would silently never be served
let previewFiles = [];
try { previewFiles = readdirSync(join(DIR, 'preview')); } catch { /* none yet */ }
const previewStrays = previewFiles.filter(
  (f) => !ids.some((id) => f === `${id}-preview.mp4`));
if (previewStrays.length) {
  die(`preview/ files matching no curated entry: ${previewStrays.join(', ')}`
    + ' — expected <id>-preview.mp4 for ids in GROUPS');
}
const entries = Object.fromEntries(ids.map((id) => [id, buildEntry(id)]));

// The pack may legitimately carry more than one kernel BUILD stamp: entries
// skipped in a re-render wave as byte-identical keep their earlier stamp
// (e.g. post-#297: 14 entries at 0.1.0+208e1dc4, thirty-rule +
// cit-throw-curve unchanged at 0.1.0+0e67b660). Present all of them.
const kernels = [...new Set(Object.values(entries).map((e) => e.kernel))].sort();

const data = {
  '//': 'GENERATED by scripts/site-physics-data.mjs — do not edit. '
    + 'Derived from the committed <id>-gates.json records in this directory; '
    + 'provenance in SOURCES.md.',
  kernels,
  entryCount: ids.length,
  totalDurationSec: Object.values(entries).reduce((t, e) => t + e.durationSec, 0),
  totalMp4Bytes: Object.values(entries).reduce((t, e) => t + e.mp4Bytes, 0),
  teaser: TEASER,
  groups: GROUPS,
  entries,
};
const jsonOut = `${JSON.stringify(data, null, 2)}\n`;

// ---------------------------------------------------------------------------
// generated markup (docs gallery tiles + index teaser tiles)
// ---------------------------------------------------------------------------
const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const dur = (sec) => `${sec.toFixed(1)} s`;

// One tile. `base` is the page-relative path to site/assets/physics/.
// The media box is a resting anchor to the raw mp4 (the complete no-JS /
// file:// experience) carrying the bb-clip contract (assets/clip.js,
// the design charter "bb-clip"): the module upgrades it into the in-place player —
// viewport autoplay under the concurrency cap, click to pause/resume,
// per-tile fullscreen affordance.
const tile = (e, base, delay) => {
  const d = delay > 0 ? ` bb-d${Math.min(delay, 5)}` : '';
  const label = `Play — ${e.title} (${dur(e.durationSec)})`;
  return [
    `<figure class="ph-tile bb-reveal${d}">`,
    `  <a class="ph-media bb-clip" href="${esc(`${base}${e.mp4}`)}" data-clip`,
    `     data-clip-title="${esc(e.title)}" data-clip-duration="${esc(dur(e.durationSec))}"`,
    // in-tile preview rendition, only when the file exists (existence check
    // in buildEntry) — no attribute = bb-clip plays the full source in-tile
    ...(e.previewSrc
      ? [`     data-clip-preview="${esc(`${base}${e.previewSrc}`)}"`] : []),
    '     data-clip-autoplay data-clip-fullscreen',
    `     aria-label="${esc(label)}">`,
    `    <img src="${esc(`${base}${e.poster}`)}" alt="" width="1920" height="1080"`,
    '         loading="lazy" decoding="async">',
    `    <span class="ph-dur bb-label" aria-hidden="true">${esc(dur(e.durationSec))}</span>`,
    '  </a>',
    `  <figcaption class="bb-label figure-plate">${esc(e.name)}</figcaption>`,
    `  <p class="ph-claim bb-body-s">${esc(e.claim)}`,
    `    <a class="bb-cite" href="${esc(`${base}${e.gates}`)}">gates</a></p>`,
    `  <p class="ph-note bb-body-s bb-muted">${esc(e.tagline)}</p>`,
    '</figure>',
  ].join('\n');
};

const galleryHtml = () => {
  const blocks = GROUPS.map((grp) => [
    `<div class="ph-group" id="scenarios-${grp.id}">`,
    `  <p class="bb-label bb-marker bb-reveal">${esc(grp.label)}</p>`,
    '  <div class="ph-grid">',
    grp.entries.map((id, i) => tile(entries[id], '../assets/physics/', i + 1)).join('\n'),
    '  </div>',
    '</div>',
  ].join('\n'));
  const mb = (data.totalMp4Bytes / 1e6).toFixed(1);
  const kern = kernels.map((k) => `<span class="ph-kernel">${esc(k)}</span>`).join(' / ');
  blocks.push([
    '<p class="ph-prov bb-body-s bb-muted bb-reveal">',
    `  ${data.entryCount} clips · ${data.totalDurationSec.toFixed(1)} s of`,
    `  graded video · ${mb} MB · kernel ${kern}`,
    '  (per-entry stamps in the gates records).',
    '  Every clip is a deterministic re-simulation: the battery record it',
    '  claims is re-simulated on the canonical WASM kernel and must match',
    '  its pinned record byte-for-byte before a frame is captured, and the',
    '  numbers on screen are re-measured from that record at render time,',
    '  never typed in',
    '  <span class="bb-cite">the scenario catalog (internal)</span>',
    '  <a class="bb-cite" href="../assets/physics/physics-data.json">physics-data.json</a>.',
    '</p>',
  ].join('\n'));
  return blocks.join('\n');
};

const teaserHtml = () => TEASER
  .map((id, i) => tile(entries[id], 'assets/physics/', i + 1))
  .join('\n');

// the teaser CTA carries the entry count, so it is generated too (review r1
// P2: a count outside the generated regions would go stale on a pack swap)
const moreHtml = () => `<a class="bb-link" href="docs/physics.html#scenarios">All ${
  data.entryCount} scenarios, gated and grouped</a>`;

// splice a generated region between its markers (kept, so re-runs are stable)
const spliceText = (src, path, name, body) => {
  const begin = `<!-- BEGIN generated:${name} (scripts/site-physics-data.mjs) -->`;
  const end = `<!-- END generated:${name} -->`;
  const [b, e] = [src.indexOf(begin), src.indexOf(end)];
  if (b < 0 || e < 0 || e < b) die(`${path}: missing ${name} markers`);
  if (src.indexOf(begin, b + 1) >= 0) die(`${path}: duplicate ${name} markers`);
  return src.slice(0, b + begin.length) + '\n' + body + '\n' + src.slice(e);
};
const splice = (path, name, body) => spliceText(readFileSync(path, 'utf8'), path, name, body);

// ---------------------------------------------------------------------------
// write | check
// ---------------------------------------------------------------------------
// index carries two generated regions (teaser tiles + the counted CTA);
// splice the second into the FIRST splice's result, not the on-disk file
const indexOnce = splice(OUT_INDEX, 'scenario-teaser', teaserHtml());
const outputs = [
  [OUT_JSON, jsonOut],
  [OUT_DOCS, splice(OUT_DOCS, 'scenario-tiles', galleryHtml())],
  [OUT_INDEX, spliceText(indexOnce, OUT_INDEX, 'scenario-more', moreHtml())],
];

if (process.argv.includes('--check')) {
  let drift = 0;
  for (const [path, want] of outputs) {
    let have = null;
    try { have = readFileSync(path, 'utf8'); } catch {}
    if (have !== want) { drift++; console.error(`DRIFT: ${path} differs from regeneration`); }
  }
  if (drift) die(`${drift} file(s) drifted — run \`node scripts/site-physics-data.mjs\` and commit`);
  console.log(`site-physics-data: ${ids.length} entries, kernel ${kernels.join(' / ')} — no drift`);
} else {
  for (const [path, want] of outputs) writeFileSync(path, want);
  console.log(`site-physics-data: wrote ${outputs.length} files `
    + `(${ids.length} entries, kernel ${kernels.join(' / ')})`);
}
