// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-stale.mjs — GH-668 S5: the STALE pre-S5 dictionary (r2 / r5), the
// STALE pre-S5 MODULES (atelier.js: the host transforms of review r6 + the class
// CENSUS of review r7; ateliercue.js: the census) and the STALE pre-r6 SHEET
// (review r6) the arms and captures serve, each DERIVED from the served live
// bytes by documented transforms at exact match counts — never read from git
// history (the lane law; CI checkouts are shallow). A PURE module: no browser, no
// ports, no PORT_INVENTORY — the e2e legs (e2e-atelier-s5d.mjs re-exports it;
// e2e-atelier-s5r4.mjs's S5-X2 stale leg) and the capture family
// (capture-525-atelier-s5.mjs --s5-short / --s5-r5) import it without the
// nested-spawn edge a browser-tool import would be (ci-bands lint 8n).
//
// The transform (review r2 P2-3 record, r5 P2-2 generalised): the seven keys
// slice 5 added are removed, and the ONE reworded key `atelier.preview.note`
// is rebuilt as the legacy whole sentence from the live badge + note:
//   `<badge> — <note without its final period, first letter lowered>`
// en "Previewing — not applied yet", de "Vorschau — noch nicht übernommen"
// (the recorded c1b78943 sentences — self-checked against LEGACY_NOTE, so a
// drift of the live copy that breaks the derivation is a thrown error, never
// a silently different stale fixture), fr "Aperçu — pas encore appliqué".

/** the seven keys GH-668 S5 slice 5 added (the r2 record: git diff c1b78943 -- locales/en.json) */
export const S5_KEYS = ['atelier.rail.count', 'atelier.arrival.hint', 'atelier.preview.badge', 'atelier.preview.putBack',
  'atelier.leave.title', 'atelier.leave.body', 'atelier.stat.vsEquipped'];
/** the four keys GH-1001 added (git diff 40741402 6d08ea1e -- web/app/locales/en.json): a dictionary cached
 * before slice 5 predates them too, so the stale fixture drops them as well — the B1 full-view pill and the
 * cloth / balls host hints are hasLocal-gated against exactly this pairing */
export const GH1001_KEYS = ['atelier.preview.view', 'atelier.preview.viewBack', 'atelier.cloth.hint', 'atelier.balls.hint'];
/** the ONE reworded key: the recorded legacy sentence per locale (c1b78943) — the derivation's self-check */
export const LEGACY_NOTE = { en: 'Previewing — not applied yet', de: 'Vorschau — noch nicht übernommen' };
/** The legacy sentence derived from a LIVE dictionary. */
export function legacySentence(live, loc = '?') {
  const badge = live['atelier.preview.badge'], note = live['atelier.preview.note'];
  if (typeof badge !== 'string' || typeof note !== 'string') throw new Error(`staleDictionary(${loc}): the live dictionary lacks atelier.preview.badge / .note`);
  const legacy = `${badge} — ${note.replace(/[.。]$/, '').replace(/^./, (ch) => ch.toLowerCase())}`;
  if (LEGACY_NOTE[loc] && LEGACY_NOTE[loc] !== legacy) throw new Error(`staleDictionary(${loc}): the derived legacy sentence ${JSON.stringify(legacy)} drifted from the record ${JSON.stringify(LEGACY_NOTE[loc])}`);
  return legacy;
}
/** The stale pre-S5 dictionary DERIVED from the live one (a new object; the input is not touched). */
export function staleDictionary(live, loc = '?') {
  const legacy = legacySentence(live, loc);
  const d = { ...live };
  for (const k of [...S5_KEYS, ...GH1001_KEYS]) delete d[k];
  d['atelier.preview.note'] = legacy;
  return d;
}

// ---- review r6 P2: the coarse host FOLD keyed on the module's own
// marker. The arms (e2e-atelier-s5hf.mjs S5-HF) and the capture family
// (capture-525-atelier-s5.mjs --s5-r6) serve a STALE MODULE that behaves as the
// pre-S5 atelier.js does on the coarse register — the host's cards box still
// homes the brightness slider + the table Advanced disclosure and the host
// never wears the S5 classes — DERIVED from the served atelier.js:
//   T1  `section.classList.toggle('ob-atelier-host--line', line);`
//       → `section.classList.toggle('ob-atelier-host--line', false);`
//       (the legacy host never wears the arrival-line class)
//   T2  `const toRail = !!cardRail && eqCoarse();` → `const toRail = false;`
//       (the legacy module never re-homes the secondary controls; on the tip
//       the `ob-atelier-host--rehomed` marker rides toRail, so the derived
//       module never sets it either)
// and, for the reverse pairing, a STALE SHEET from before the r6 rule:
//   C1  the ONE marker-gated fold selector line removed (the h2 rule kept).
// Every pattern must occur EXACTLY once — a drift of the live source that
// breaks a derivation is a thrown error, never a silently different fixture.
/** ONE documented replacement: the pattern must occur exactly once. */
export function replaceOnce(src, what, from, to) {
  return replaceExactly(src, what, from, to, 1);
}
/** ONE documented replacement at EXACTLY `count` sites (the pick rows are stamped twice: option rows + fixture rows). */
export function replaceExactly(src, what, from, to, count) {
  const n = src.split(from).length - 1;
  if (n !== count) throw new Error(`stale derivation: ${what} — the live source carries the pattern ${n} time(s), not ${count}: ${JSON.stringify(from)}`);
  return src.split(from).join(to);
}
// ---- review r7 P2 + the integrator's CENSUS (2026-09-12): the
// derived stale module must EMIT what the cached pre-S5 module emits. The T1 /
// T2 module still stamped every kit class slice 5 added, so the sites where
// the sheet moved a face onto a kit class (the pick rows → .ob-btn--row, the
// cue close → .ob-btn--icon, the rail cards → .ob-card-option / .ob-control /
// .ob-badge, the notes → .ob-body, the sub-labels → .ob-control) read as fresh
// under the arm while a real returning client saw the UA button face. The
// census (a per-site className diff of every PRE-EXISTING element that gained
// a kit class on the branch) is the transform table below — T3–T11 on
// atelier.js, U1–U5 on ateliercue.js — each pattern at EXACTLY its count;
// review r9 extended the population to CONTAINERS (T12–T14: the kit SURFACE
// classes on the strip, the rail's secondary row, the provenance block).
/** [what, from, to, count] — the census transforms over the served atelier.js */
export const CENSUS_T = [
  ['T3 (the pick rows: the bare local class, no kit row-pill part)',
    "pick.className = 'ob-btn ob-btn--row ob-btn--ghost ob-eq-prov-row__pick';", "pick.className = 'ob-eq-prov-row__pick';", 2],
  ['T4 (the hint: no body role)', "hint.className = 'ob-atelier-hint ob-body';", "hint.className = 'ob-atelier-hint';", 1],
  ['T5 (the provenance summary: no body role)', "sum.className = 'ob-atelier-prov__sum ob-body';", "sum.className = 'ob-atelier-prov__sum';", 1],
  ['T6 (the cloth name line: no body role)', "nameLine.className = 'ob-atelier-clothname ob-body';", "nameLine.className = 'ob-atelier-clothname';", 1],
  ['T7 (the lux note: no body role)', "note.className = 'ob-atelier-luxnote ob-body';", "note.className = 'ob-atelier-luxnote';", 1],
  ['T8 (the transaction note: no body role)', "note.className = 'ob-atelier-txnote ob-body';", "note.className = 'ob-atelier-txnote';", 1],
  ['T9 (the Advanced disclosure: no solid rung)', "adv.className = 'ob-atelier-adv ob-mat-solid';", "adv.className = 'ob-atelier-adv';", 1],
  ['T10 (the rail cards: the pre-S5 module never stamps the kit parts)',
    'const stampRailCards = () => {', 'const stampRailCards = () => { return; // stale: never stamped', 1],
  ['T11 (the sub-labels: the caps voice, not the control role)', "className = 'ob-control ob-atelier-sublabel';", "className = 'ob-caps';", 2],
  // review r9 P2-2 + the integrator's CONTAINER census (2026-09-12): the r7 census walked
  // CONTROLS; the three CONTAINER surfaces G2 / G3 moved onto the kit solid rung (the station strip, the
  // rail's secondary row, the provenance block; the Advanced disclosure is T9) were still stamped by the
  // derived module, so the arm read them as fresh while a returning pre-G2 client saw them transparent
  ['T12 (the station strip: the pre-G2 module never stamps the solid rung)', "carouselMount.classList.add('ob-mat-solid');", '', 1],
  ['T13 (the rail secondary row: no solid rung)', "railSub.classList.add('ob-mat-solid');", '', 1],
  ['T14 (the provenance block: no solid rung)', "box.classList.add('ob-mat-solid');", '', 1],
  // review r11 P2: the pre-S5 module PUBLISHES NOTHING — no --ob-eq-host-b / --ob-eq-rail-b /
  // --ob-eq-sheet-top / --ob-eq-rail-dx / --ob-eq-rail-h on html.style — so every sheet geometry derived from a
  // module-published variable must fall back to its legacy value (THE PUBLISHER-FALLBACK LAW). The T1-T14 module
  // still ran publishBands and wrote all five; the r11 fixture strips the ONE write site (eqVars is still kept,
  // so the module's own reads are unchanged — the cached pre-S5 module never had either).
  ['T15 (the publisher: the pre-S5 module publishes no --ob-eq-* variable)', 'st.setProperty(k, `${v}px`);', 'void v; /* T15: the pre-S5 module publishes nothing */', 1],
  // GH-1001 (atelier.md §7 B20-1): the pre-S5 module never writes the WIDE coarse rail class nor the ONE-ROW host
  // marker — a derived module that kept them would wear the wide geometry with no published span (T15), a pairing
  // no cached client can produce (the real pre-S5 module has neither line)
  ['T16 (the wide coarse rail: the pre-S5 module never writes it)', "if (rail.classList.contains('ob-atelier-rail--wide') !== !!wide) rail.classList.toggle('ob-atelier-rail--wide', !!wide);", 'void wide; /* T16: the pre-S5 module never writes the wide rail */', 1],
  ['T17 (the one-row host: the pre-S5 module never stamps the marker)', "root.classList.add('ob-atelier--onerow');", '/* T17: the pre-S5 module never stamps the one-row marker */', 1],
  // GH-1001 card 32 v2 (atelier.md §7 B20-2): nor the TALL phone card, nor the phone table-preview framing
  ['T18 (the tall phone card: the pre-S5 module never writes it)', "if (rail.classList.contains('ob-atelier-rail--tall') !== !!tall) rail.classList.toggle('ob-atelier-rail--tall', !!tall);", 'void tall; /* T18: the pre-S5 module never writes the tall card */', 1],
  ['T19 (the phone table-preview framing: the pre-S5 module never frames)', 'tfSync = syncTableFrame;', '/* T19: the pre-S5 module never frames the table */', 1],
];
/** [what, from, to, count] — the census transforms over the served ateliercue.js */
export const CENSUS_U = [
  ['U1 (the dismiss: the bare local class, no kit icon-pill part)',
    "close.className = 'ob-btn ob-btn--icon ob-btn--ghost ob-atelier-cue-close';", "close.className = 'ob-atelier-cue-close';", 1],
  ['U2 (the Details summary: the caps voice)', "sum.className = 'ob-control';", "sum.className = 'ob-caps';", 1],
  ['U3 (the dossier summary: the caps voice)', "dosSum.className = 'ob-control';", "dosSum.className = 'ob-caps';", 1],
  ['U4 (Equip: the row pill, no primary voice)', "equipBtn.className = 'ob-btn ob-btn--primary';", "equipBtn.className = 'ob-btn ob-btn--row';", 1],
  ['U5 (Try it: the row pill, no ghost voice)', "tryBtn.className = 'ob-btn ob-btn--ghost';", "tryBtn.className = 'ob-btn ob-btn--row';", 1],
];
/** The STALE pre-S5-host module DERIVED from the live atelier.js source (a new string; the input is not touched):
 *  T1 + T2 (review r6), the census T3–T11 (review r7), the container census T12–T14 (review r9), the publisher strip T15 (review r11)
 *  the GH-1001 wide-rail / one-row markers T16–T17 and the card 32 v2 tall card / table framing T18–T19. */
export function staleModule(live) {
  let s = replaceOnce(live, 'T1 (the legacy host never wears --line)',
    "section.classList.toggle('ob-atelier-host--line', line);",
    "section.classList.toggle('ob-atelier-host--line', false);");
  s = replaceOnce(s, 'T2 (the legacy module never re-homes the secondary controls)',
    'const toRail = !!cardRail && eqCoarse();',
    'const toRail = false;');
  for (const [what, from, to, count] of CENSUS_T) s = replaceExactly(s, what, from, to, count);
  return s;
}
/** The STALE pre-S5 cue module DERIVED from the live ateliercue.js source (U1–U5; a new string). */
export function staleCueModule(live) {
  let s = live;
  for (const [what, from, to, count] of CENSUS_U) s = replaceExactly(s, what, from, to, count);
  return s;
}
/** The fold selector the r6 fix keys on the marker — the ONE line the stale sheet lacks. */
export const R6_FOLD_LINE = '.ob-atelier-host--rail.ob-atelier-host--rehomed:not(.ob-atelier-host--line) #ob-atelier-cards,';
/** The STALE pre-r6 stylesheet DERIVED from the live atelier.css (a new string). */
export function staleSheet(live) {
  return replaceOnce(live, 'C1 (the marker-gated fold line removed)', R6_FOLD_LINE + '\n', '');
}
