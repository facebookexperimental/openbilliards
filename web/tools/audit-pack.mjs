// Copyright (c) Meta Platforms, Inc. and affiliates.

// audit-pack.mjs — assemble a capture directory into a VISUAL AUDIT pack.
//
// The house gate (owner directive, the review visual-audit law) is that a review
// reviewer looks at every capture pack before it reaches the owner. That
// reviewer is looking for differences, and a capture tool emits singles: a
// directory of `bed-<substrate>-<condition>-<framing>.png` that a human has to
// hold in their head two at a time. Twice now the montages that make a pack
// reviewable have been rebuilt as throwaway scripts, so this is the committed
// version.
//
// It derives everything from the FILENAME GRAMMAR the capture tools already
// use and never from a hardcoded list, so a capture round that adds a
// substrate, a framing or a ladder rung gets its montages for free:
//
//   ab-<label>-<framing>.png       fresh | worn, registered, side by side.
//                                  FRESH IS ALWAYS LEFT. There is no text in
//                                  the image — nothing here can render a font —
//                                  so the order is the label, and INDEX.md has
//                                  to say so.
//   ab-field-<framing>.png         the same for the TERM 3 pair, off | on, and
//   ab-fieldrep/floor/split-*.png  its replicate, its visible repeatability
//                                  floor, and the half-mask probe.
//   ladder-<leg>-<framing>.png     every rung of a sensitivity strip in rung
//                                  order, left to right, zero first.
//   chipstrip-<name>.png           the picker crops stacked, so chip-scale
//                                  legibility is judged at chip scale.
//   chipstrip-venue-*.png          one card across the venues, at 1:1: a cloth
//   chipvenue-<venue>.png          CONDITION composes over the venue's felt
//                                  family, so its chip is a cross-venue claim.
//
// Montage members are box-downsampled 2x. That is not a quality decision: a
// 1920-wide pair is 3848 px and no reviewer opens that at 1:1 anyway. The pack
// also carries every original still, and the audit prompt tells the reviewer to
// go there for anything they want to look at closely.
//
//   node web/tools/audit-pack.mjs --in DIR [--out DIR]
import path from 'node:path';
import fs from 'node:fs';
import { decodePng, encodePng } from './png.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const IN = path.resolve(arg('in', '.'));
const OUT = path.resolve(arg('out', path.join(IN, 'audit-pack')));
if (!fs.existsSync(IN)) throw new Error(`no such capture dir: ${IN}`);
fs.mkdirSync(OUT, { recursive: true });

const GAP = 8;                       // divider between montage members
const GAP_RGB = [24, 24, 24];

/** Box-downsample by an integer factor. Returns { w, h, ch: 3, data }. */
function shrink(img, n) {
  const w = Math.floor(img.w / n), h = Math.floor(img.h / n);
  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 3; k++) {
        let s = 0;
        for (let dy = 0; dy < n; dy++) {
          for (let dx = 0; dx < n; dx++) {
            s += img.data[((y * n + dy) * img.w + (x * n + dx)) * img.ch + k];
          }
        }
        out[(y * w + x) * 3 + k] = Math.round(s / (n * n));
      }
    }
  }
  return { w, h, ch: 3, data: out };
}

/**
 * Lay images out on one axis, centred on the other and padded with GAP_RGB.
 * Members may differ in size — the picker crops do — so the cross axis is the
 * largest member and everything else is centred in it rather than stretched.
 */
function montage(imgs, axis) {
  const across = axis === 'x';
  const long = imgs.reduce((a, im) => a + (across ? im.w : im.h), 0)
    + GAP * (imgs.length - 1);
  const cross = Math.max(...imgs.map((im) => (across ? im.h : im.w)));
  const W = across ? long : cross, H = across ? cross : long;
  const px = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    px[i * 4] = GAP_RGB[0]; px[i * 4 + 1] = GAP_RGB[1];
    px[i * 4 + 2] = GAP_RGB[2]; px[i * 4 + 3] = 255;
  }
  let at = 0;
  for (const im of imgs) {
    const ox = across ? at : Math.floor((W - im.w) / 2);
    const oy = across ? Math.floor((H - im.h) / 2) : at;
    for (let y = 0; y < im.h; y++) {
      for (let x = 0; x < im.w; x++) {
        const s = (y * im.w + x) * im.ch, d = ((oy + y) * W + (ox + x)) * 4;
        px[d] = im.data[s]; px[d + 1] = im.data[s + 1]; px[d + 2] = im.data[s + 2];
      }
    }
    at += (across ? im.w : im.h) + GAP;
  }
  return { W, H, px };
}

const built = [];
const write = (name, imgs, axis = 'x') => {
  const { W, H, px } = montage(imgs, axis);
  fs.writeFileSync(path.join(OUT, name), encodePng(W, H, px));
  built.push(`${name} (${W}x${H}, ${imgs.length} up)`);
};
const load = (f, n = 2) => shrink(decodePng(path.join(IN, f)), n);

const files = fs.readdirSync(IN).filter((f) => f.endsWith('.png'));
const has = (f) => files.includes(f);

// ---- A/B pairs. Driven by which `-fresh-` stills have a `-worn-` sibling.
for (const f of files) {
  const m = /^bed-(.+)-fresh-(.+)\.png$/.exec(f);
  if (!m) continue;
  const worn = `bed-${m[1]}-worn-${m[2]}.png`;
  if (!has(worn)) continue;
  write(`ab-${m[1]}-${m[2]}.png`, [load(f), load(worn)]);
}
// The TERM 3 pairs are not fresh|worn, so they need their own rule. Each entry
// is [left, right, name] and the LEFT member is always the one the pair is
// asking the reviewer to treat as the baseline:
//   field      the headline residual — texture missing | texture reachable
//   fieldrep   the same comparison again, an independent replicate
//   fieldfloor the SAME state twice: the visible repeatability floor, and the
//              thing every other pair here has to beat by eye as well as by
//              number
//   fieldsplit the half-mask probe — foot half of the field | head half. NOT a
//              baseline pair: both members carry a real (partial) field, and
//              the point is that the difference between them is bipolar and
//              split down the middle of the bed.
//   fieldcodeA the 18-cell coded probe, and `fieldcodeB` its independent
//   fieldcodeB replicate. These are baseline pairs (field OFF | coded field
//              ON), and they supersede `fieldsplit` as the exhibit for WHERE
//              the field lands: one cut can only be right about one line,
//              where the code has to be right about eighteen cells at once.
//              The half-cuts stay in the pack because they are the comparison
//              the previous round was judged on.
const FIELD_PAIRS = [
  ['fieldoff', 'fieldon', 'field'],
  ['fieldoff2', 'fieldon2', 'fieldrep'],
  ['fieldon', 'fieldon2', 'fieldfloor'],
  ['fieldfoot', 'fieldhead', 'fieldsplit'],
  ['fieldoff', 'fieldcodeA', 'fieldcodeA'],
  ['fieldoff2', 'fieldcodeB', 'fieldcodeB'],
];
for (const f of files) {
  const m = /^bed-fieldoff-worn-(.+)\.png$/.exec(f);
  if (!m) continue;
  for (const [l, r, name] of FIELD_PAIRS) {
    const a = `bed-${l}-worn-${m[1]}.png`, b = `bed-${r}-worn-${m[1]}.png`;
    if (has(a) && has(b)) write(`ab-${name}-${m[1]}.png`, [load(a), load(b)]);
  }
}

// ---- sensitivity strips. `base` is the strip zero and always leads; the rest
// sort by the numeric part of the tag, so rungs read left to right in order.
const LEGS = { dep: 'deposit', abr: 'abrasion' };
const strips = new Map();
for (const f of files) {
  const m = /^bed-(base|dep(\d+)|abr(\d+))-worn-(.+)\.png$/.exec(f);
  if (!m) continue;
  const framing = m[4];
  const rung = m[1] === 'base' ? -1 : Number(m[2] ?? m[3]);
  for (const [pfx, leg] of Object.entries(LEGS)) {
    if (m[1] !== 'base' && !m[1].startsWith(pfx)) continue;
    const key = `${leg}-${framing}`;
    if (!strips.has(key)) strips.set(key, []);
    strips.get(key).push({ rung, f });
  }
}
for (const [key, rungs] of strips) {
  // a leg with only its zero is not a strip — the framing belongs to the other
  if (rungs.length < 3) continue;
  rungs.sort((a, b) => a.rung - b.rung);
  write(`ladder-${key}.png`, rungs.map((r) => load(r.f, 3)));
}

// ---- picker crops. Already chip-sized, so NEVER downsampled: the whole
// question they answer is whether the entry reads at the size it ships.
//
// The pair is the one that answers it — `chip-<reg>-1fresh|2worn` are single
// cards cropped whole, so this is fresh BESIDE worn at 1:1. The rail and
// station strips stay as context, but they are a scroller and a full screen
// and neither can settle the question on its own (the R1b audit's P1-4).
//
// `<reg>` is free-form on purpose: capture-542-cloth appends the SELECTION
// STATE of the card to it, because the rail filters unselected thumbs and a
// pair with one member filtered cannot separate the condition from the filter.
// Two pairs come out — both-selected and both-unselected — each comparing like
// with like, and the difference between them is the UI's own contribution.
const chipPairs = new Map();
for (const f of files) {
  const m = /^chip-(.+)-\d(?:fresh|worn)\.png$/.exec(f);
  if (!m) continue;
  if (!chipPairs.has(m[1])) chipPairs.set(m[1], []);
  chipPairs.get(m[1]).push(f);
}
for (const [reg, members] of chipPairs) {
  // the leading digit in the filename orders them fresh-then-worn, the same
  // convention the ab-* montages use
  write(`chippair-${reg}.png`, members.sort().map((f) => load(f, 1)));
}
const chips = files.filter((f) => /^(station|cloth-rail)-/.test(f)).sort();
if (chips.length) {
  write('chipstrip-cloth-rail.png', chips.map((f) => load(f, 1)), 'y');
}

// ---- the VENUE chips. A condition cloth has no felt family of its own and
// composes over the venue's, so the claim is cross-venue and no single card can
// carry it. Two strips, both at 1:1, both in the same venue order:
//
//   chipstrip-venue-fallback-worn  the live composition — SHOULD differ across
//                                  the four venues, which is the fix
//   chipstrip-venue-shipped-worn   the committed still — the SAME on all four,
//                                  which is the recorded register seam
//   chipstrip-venue-*-family       the control: a card that names a FAMILY has
//                                  a felt of its own and must not move
//
// plus a per-venue row of all four cards, so a reviewer can hold one venue's
// shipped and live chips against each other without scanning between strips.
const VENUE_ORDER = ['snooker', 'chinese8', 'carom', 'burgundy'];
const venueChip = (v, mode, kind) => `chipvenue-${v}-${mode}-${kind}.png`;
for (const mode of ['fallback', 'shipped']) {
  for (const [kind, tag] of [['1worn', 'worn'], ['2family', 'family']]) {
    const strip = VENUE_ORDER.map((v) => venueChip(v, mode, kind)).filter(has);
    if (strip.length >= 2) {
      write(`chipstrip-venue-${mode}-${tag}.png`, strip.map((f) => load(f, 1)));
    }
  }
}
for (const v of VENUE_ORDER) {
  const row = ['shipped', 'fallback']
    .flatMap((mode) => ['1worn', '2family'].map((k) => venueChip(v, mode, k)))
    .filter(has);
  if (row.length >= 2) {
    write(`chipvenue-${v}.png`, row.map((f) => load(f, 1)));
  }
}

// ---- originals + sheet, so the reviewer can always go back to the source
for (const f of [...files, 'sheet.md']) {
  if (fs.existsSync(path.join(IN, f))) {
    fs.copyFileSync(path.join(IN, f), path.join(OUT, f));
  }
}
for (const b of built) console.log(`[pack]  ${b}`);
console.log(`[audit-pack] ${built.length} montages + ${files.length} stills`
  + ` → ${OUT}`);
