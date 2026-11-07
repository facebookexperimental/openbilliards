// Copyright (c) Meta Platforms, Inc. and affiliates.

// orbit-manifest.mjs — capture-manifest.json is the orbit sweep's COMPLETION record (review r11 P2 on orbitsweep-490: a
// later default --judge-only must never mix a partial re-capture with another run's leftover orbit dir). ONE module for
// both drivers (FIX7 on #731, Fable passes 2 + 3): the manifest is removed at the capture session's first write — never at
// load, so a refused --sweep leaves the last complete capture judgeable — and written only after every orbit is captured;
// judge() is FAIL-CLOSED: no manifest beside captured orbit dirs, an unreadable manifest, a manifest without an orbit
// list, an unknown / non-token orbit name, or a manifest orbit without meta.json is a refusal by name, never an
// existence-discovered mixed verdict. The same token + known-orbit filter governs the load-time invalidation list and the
// judged list (a hand-edited `../x` entry can neither remove nor judge anything outside --out).
import fs from 'node:fs';
import path from 'node:path';

export const MANIFEST = 'capture-manifest.json';
const TOKEN = /^[A-Za-z0-9_-]+$/;

export function readManifest(OUT) {
  const mf = path.join(OUT, MANIFEST);
  if (!fs.existsSync(mf)) return { present: false, mf, doc: null };
  try { return { present: true, mf, doc: JSON.parse(fs.readFileSync(mf, 'utf8')) }; } catch (e) { return { present: true, mf, doc: null, error: e.message }; }
}

/** LOAD-TIME (before any guard): the orbit names a default --judge-only will re-judge — the manifest's list when it is
 *  readable, non-empty and made of known token names; else null (the caller falls back to its default names for the
 *  invalidation, and resolveJudgeOrbits() refuses by name at run time). Any other mode / an explicit --orbits → null. */
export function manifestOrbitNames(OUT, { mode, args, known = null, explicit = null }) {
  // `explicit` = the caller's ONE reading of "--orbits was given" (space or `=` form, the validated selection); the raw
  // args.includes fallback is kept for callers that pass none (FIX8 Fable pass 3: an exact-token test here diverged from the
  // load-time reader on `--orbits=<name>`)
  const hasExplicit = explicit === null ? args.includes('--orbits') : !!explicit;
  if (mode !== 'judge-only' || hasExplicit) return null;
  const o = readManifest(OUT).doc?.orbits;
  if (!Array.isArray(o) || !o.length || !o.every((x) => typeof x === 'string' && TOKEN.test(x) && (!known || known.includes(x)))) return null;
  return o;
}

/** RUN-TIME: the orbit list judge() works on. Refuses by name (exit 2) on every incomplete / inconsistent capture. */
export function resolveJudgeOrbits({ OUT, ORBITS, mode, args, tag, known = null, explicit = null }) {
  const refuse = (msg) => { console.error(`[${tag}] REFUSED — ${msg}`); process.exit(2); };
  const checkName = (x, src) => { if (typeof x !== 'string' || !TOKEN.test(x) || (known && !known.includes(x))) refuse(`${src} names an unknown / invalid orbit ${JSON.stringify(x)} (known: ${(known || []).join(', ') || 'any token'}); re-run --sweep`); };
  const hasExplicit = explicit === null ? args.includes('--orbits') : !!explicit; // one reader with the load-time selection (FIX8 Fable pass 3)
  let orbitList = ORBITS; let fromManifest = false;
  if (mode === 'judge-only' && !hasExplicit) {
    const r = readManifest(OUT);
    if (r.present && r.error) refuse(`${r.mf} is not readable JSON (${r.error}); re-run --sweep, or name the orbits with --orbits to judge them deliberately`);
    if (r.present) {
      const o = r.doc && r.doc.orbits;
      if (!Array.isArray(o) || !o.length) refuse(`${MANIFEST} under ${OUT} carries no orbit list (orbits = ${JSON.stringify(o)}); re-run --sweep, or name the orbits with --orbits to judge them deliberately`);
      for (const x of o) checkName(x, `${MANIFEST} under ${OUT}`);
      orbitList = o; fromManifest = true;
    } else {
      const present = ORBITS.filter((x) => typeof x === 'string' && TOKEN.test(x) && fs.existsSync(path.join(OUT, x, 'meta.json')));
      if (present.length) refuse(`no ${MANIFEST} under ${OUT} while captured orbit dir(s) exist (${present.join(', ')}): the last --sweep did not complete, or the capture predates the manifest (review r11); re-run --sweep, or name the orbits with --orbits to judge them deliberately`);
      orbitList = [];
    }
  } else {
    for (const x of orbitList) checkName(x, '--orbits');
  }
  if (!orbitList.length) refuse(`no captured orbits under ${OUT}`);
  for (const o of orbitList) { // a half-captured orbit is refused by name (was an ENOENT crash on meta.json)
    const mp = path.join(OUT, o, 'meta.json');
    if (!fs.existsSync(mp)) refuse(`${fromManifest ? `${MANIFEST} lists ${o} but ` : ''}${mp} is missing: ${fromManifest ? 'the last --sweep did not complete; re-run --sweep' : `no capture of orbit ${o} under ${OUT}`}`);
  }
  return orbitList;
}

/** The capture session's FIRST write: from here on the run overwrites orbit dirs; a crash before writeManifest() leaves
 *  no manifest and a default --judge-only refuses by name. */
export function removeManifest(OUT, tag) {
  const mf = path.join(OUT, MANIFEST);
  if (fs.existsSync(mf)) { fs.rmSync(mf); console.error(`[${tag}] ${MANIFEST} removed — this capture is committed to overwriting its orbit dirs`); }
}

export function writeManifest(OUT, doc) {
  fs.writeFileSync(path.join(OUT, MANIFEST), JSON.stringify(doc, null, 2));
}

/** The per-orbit meta.json the driver rewrites before the judge: unreadable JSON is a refusal by name, not a stack. */
export function readOrbitMeta(metaPath, tag) {
  try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (e) { console.error(`[${tag}] REFUSED — ${metaPath} is not readable JSON (${e.message}); the capture is not judgeable, re-run --sweep`); process.exit(2); }
}

/** After the per-orbit judge ran: its report must exist, else the capture is not judgeable — refuse by name instead of
 *  an ENOENT crash (a stub / foreign meta.json makes the python judge exit without a report). */
export function requireOrbitReport(rep, orbitName, tag) {
  if (!fs.existsSync(rep)) { console.error(`[${tag}] REFUSED — the per-orbit judge wrote no report for ${orbitName} (${rep} missing): the capture under ${path.dirname(rep)} is not judgeable; re-run --sweep`); process.exit(2); }
}
