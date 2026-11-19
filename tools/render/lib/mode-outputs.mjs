// Copyright (c) Meta Platforms, Inc. and affiliates.

// mode-outputs.mjs — ONE mode resolver + mode-scoped invalidation + selection validation for every render tool that
// removes a prior artefact as its first effect (ORDER-CN8-731-FIX8, review round 8 on #731: the FIX7 scoping had reached
// orbitsweep-489/490 only — cammatch-489 `--red-arm` deleted the `--compare` report and `--compare` the red-arm basis).
//
// Law: the invalidation list of a run is the artefact set the RESOLVED mode (re)produces — never another mode's — and a
// SELECTION (orbit names, table ids, revs, presets …) is validated against the known set BEFORE any deletion path is
// built from it: an invalid selection refuses with nothing removed; the invalidate-first rule (FIX3) applies to the
// tool's OWN validated destinations only. Every artefact a mode writes carries `tool` + `mode`.
import path from 'node:path';
import { invalidatePrior } from './serve-check.mjs';

const TOKEN = /^[A-Za-z0-9_-]+$/;

/** The one resolver. `chain` = [[flag, mode], …] in the priority order the tool's run executes: the FIRST present flag
 *  wins (that is what every priority-chain tool already does at run time — the invalidation now uses the same value).
 *  `exactlyOne: true` = the tool's exactly-one rule: the mode of the single present flag, null when none or several. */
/** A chain entry is [flag, mode] for a boolean mode flag — matched EXACTLY, the way every converted tool's own run detects it
 *  (`args.includes(flag)`; `--letters=1` is not letters mode) — or [flag, mode, 'value'] for a mode selected by a value flag
 *  (`--red-basis FILE`, `--fit-light <preset>`), matched in both forms the tool's stringOpt reader accepts (`--f v`, `--f=v`).
 *  Fable pass 1 on FIX8: a resolver that saw more forms than the run diverged from it. */
const hasFlag = (args, flag, kind) => (kind === 'value' ? args.some((a) => a === flag || a.startsWith(flag + '=')) : args.includes(flag));
export function resolveMode(args, chain, { exactlyOne = false, defaultMode = null } = {}) {
  const present = chain.filter(([flag, , kind]) => hasFlag(args, flag, kind));
  if (exactlyOne) return present.length === 1 ? present[0][1] : (present.length ? null : defaultMode);
  return present.length ? present[0][1] : defaultMode;
}

export function presentModeFlags(args, chain) { return chain.filter(([flag, , kind]) => hasFlag(args, flag, kind)).map(([flag]) => flag); }

/** The resolver for tools whose mode is the VALUE of one flag (e.g. `--perturb <name>`): `classes` = { mode: [values…] };
 *  the flag absent → defaultMode; a value in no class → null (an unknown selection owns nothing, so nothing is removed and
 *  the tool's own allow-list refusal follows). The LAST occurrence wins, `--f v` or `--f=v` — the reading of argv.mjs
 *  optValue / stringOpt that the run uses (FIX4 one-resolver law; Fable pass 1 on FIX8 caught a first-occurrence scan). */
export function resolveModeByValue(args, flag, classes, { defaultMode = null } = {}) {
  let present = false; let val = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === flag) { present = true; val = args[i + 1]; } else if (a.startsWith(flag + '=')) { present = true; val = a.slice(flag.length + 1); }
  }
  if (!present) return defaultMode;
  const v = String(val ?? ''); // compared AS GIVEN — the run compares its stringOpt value untrimmed, so a padded value is unknown to both (Fable pass 2)
  for (const [mode, values] of Object.entries(classes)) if (values.includes(v)) return mode;
  return null;
}

/** Remove, as the run's first effect, exactly the artefacts `outputs[mode]` (paths relative to OUT). A null mode or a
 *  mode without an entry removes nothing (the mode refusal follows). Returns the absolute list removed. */
const FILENAME = /^[A-Za-z0-9_.+-]+$/;
export function invalidateForMode({ OUT, mode, outputs, tag = 'mode-outputs' }) {
  if (!mode || !outputs || !outputs[mode] || !outputs[mode].length) return [];
  const root = OUT ? path.resolve(OUT) : null;
  const list = outputs[mode].map((f) => {
    if (path.isAbsolute(f)) return f; // a destination the tool resolved itself, as given (FIX4)
    // containment (Fable pass 1 on FIX8): a relative entry is a plain FILENAME directly under OUT — never a path that could leave it
    if (!root || !FILENAME.test(f) || path.resolve(root, f) !== path.join(root, f) || path.dirname(path.join(root, f)) !== root) { console.error(`[${tag}] REFUSED — artefact ${JSON.stringify(f)} is not a plain filename under ${root ?? '(no destination)'}; nothing was removed`); process.exit(2); }
    return path.join(root, f);
  });
  return invalidatePrior(list, tag); // the artefacts actually removed (serve-check reports them)
}

/** Validate a selection BEFORE it reaches a deletion path: every value a plain token, every value in `known` when a
 *  known set is given (a `validate(v)` predicate serves numeric selections). Refuses by name, exit 2, nothing removed. */
export function validateSelection({ values, known = null, validate = null, what = 'selection', tag = 'mode-outputs', allowEmpty = false, removed = [] }) {
  // a comma list is split and its items trimmed (the listOpt convention every list-taking run uses); a single value is taken AS GIVEN
  // (the run compares it untrimmed). `removed` = what this run already removed as its tier-1 first effect, so the refusal sentence
  // stays true: "nothing further was removed" after a tier-1 removal, "nothing was removed" otherwise (Fable pass 2 on FIX8).
  const vals = Array.isArray(values) ? values.map((v) => String(v ?? '')) : String(values ?? '').split(',').map((s) => s.trim());
  const tail = removed && removed.length ? `nothing further was removed (this run's own first effect went first: ${removed.join(', ')})` : 'nothing was removed';
  const refuse = (msg) => { console.error(`[${tag}] REFUSED — ${msg}; ${tail}`); process.exit(2); };
  if (!vals.length || vals.some((v) => !v)) { if (allowEmpty && vals.every((v) => !v)) return []; refuse(`empty ${what} selection (${JSON.stringify(values)})`); }
  const dup = vals.filter((v, i) => vals.indexOf(v) !== i);
  if (dup.length) refuse(`duplicate ${what} ${[...new Set(dup)].join(', ')}`);
  const bad = vals.filter((v) => !TOKEN.test(v));
  if (bad.length) refuse(`${what} ${bad.map((b) => JSON.stringify(b)).join(', ')} is not a plain token`);
  if (known) { const unk = vals.filter((v) => !known.includes(v)); if (unk.length) refuse(`unknown ${what} ${unk.join(', ')} (known: ${known.join(', ')})`); }
  if (validate) { const rej = vals.filter((v) => !validate(v)); if (rej.length) refuse(`${what} ${rej.join(', ')} rejected by the tool's own rule`); }
  return vals;
}

/** `tool` + `mode` first on every artefact a mode writes. */
export function stamp(obj, tool, mode) { return Object.assign({ tool, mode }, obj); }
