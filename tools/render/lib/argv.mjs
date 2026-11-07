// Copyright (c) Meta Platforms, Inc. and affiliates.

// argv.mjs — OPTION PRESENCE IS NOT OPTION VALUE (ORDER-CN8-731-FIX2, review round 2 on #731 P2 (b)).
// The render tools parsed `--flag value` with `const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : d`,
// so a trailing `--expect-baseline`, a blank `--expect-baseline=` or a `--flag` followed by another `--flag`
// silently read as "not given" and fell to the default — a gate could exit 0 having checked nothing. Every
// path-valued option goes through here: ABSENT → the default (or a required-option refusal); PRESENT BUT
// BLANK / without a value → exit 2 naming the flag; a GIVEN path that must exist and does not → exit 2 naming
// the flag and the path (a tool's own default is left to the tool). A value is returned AS GIVEN — whitespace is
// stripped only to DETECT a blank value (FIX4, review round 4 on #731 P2 (b): one resolver for the destination that
// is invalidated and the destination that is written — a trailing space names a different directory in both);
// the returned value IS the working value.
import fs from 'node:fs';

const argv = () => process.argv.slice(2);

/** true iff `--flag` or `--flag=...` is on the command line */
export function optPresent(flag, args = argv()) {
  return args.some((a) => a === flag || a.startsWith(flag + '='));
}

/** the raw value of `--flag=value` / `--flag value`; undefined when the flag has no value (trailing, or the
 *  next token is another `--option`) — callers use pathOpt / listOpt, which turn undefined into a refusal */
export function optValue(flag, args = argv()) {
  // the LAST occurrence wins — argparse and the tools' strict argv loops keep the last value, so the destination
  // invalidated and the destination written stay one path under a repeated flag (FIX4, refuter pass 1)
  for (let i = args.length - 1; i >= 0; i--) {
    const a = args[i];
    if (a.startsWith(flag + '=')) return a.slice(flag.length + 1);
    if (a === flag) { const v = args[i + 1]; return v === undefined || v.startsWith('--') ? undefined : v; }
  }
  return undefined;
}

function refuse(tag, msg) { console.error(`[${tag}] REFUSED — ${msg}`); process.exit(2); }

/** A path-valued option. opts: { default, tag, mustExist: 'file' | 'dir' | false, required } */
export function pathOpt(flag, { default: dflt, tag = 'argv', mustExist = false, required = false } = {}, args = (__lastParsed ?? argv())) {
  const present = optPresent(flag, args);
  let value;
  if (!present) {
    if (required) refuse(tag, `${flag} is required (a path)`);
    value = dflt;
  } else {
    const raw = optValue(flag, args);
    value = raw === undefined || !raw.trim() ? undefined : raw; // as given; blank detected on the stripped form
    if (!value) refuse(tag, `${flag} given without a value (blank or trailing); name the path or omit the flag`);
  }
  // existence is enforced for a value the USER gave; a tool's own default (often a scratch path a
  // later mode creates or never reads) keeps the tool's original lazy behaviour — a refuter pass on
  // FIX2 caught orbitsweep-488p's --verify mode refusing at load over an absent default dump
  if (present && value !== undefined && value !== null && mustExist) {
    let st = null; try { st = fs.statSync(value); } catch {}
    if (!st) refuse(tag, `${flag} ${value}: path not found`);
    if (mustExist === 'file' && !st.isFile()) refuse(tag, `${flag} ${value}: not a file`);
    if (mustExist === 'dir' && !st.isDirectory()) refuse(tag, `${flag} ${value}: not a directory`);
    if (mustExist === 'file') { try { fs.accessSync(value, fs.constants.R_OK); } catch { refuse(tag, `${flag} ${value}: not readable`); } }
  }
  return value;
}

/** A string-valued option with the same presence rule (blank / trailing → refusal). */
export function stringOpt(flag, { default: dflt, tag = 'argv', required = false } = {}, args = (__lastParsed ?? argv())) {
  const present = optPresent(flag, args);
  if (!present) { if (required) refuse(tag, `${flag} is required`); return dflt; }
  const raw = optValue(flag, args);
  const value = raw === undefined || !raw.trim() ? undefined : raw; // as given; blank detected on the stripped form
  if (!value) refuse(tag, `${flag} given without a value (blank or trailing)`);
  return value;
}

/** A comma-separated list option: absent → default string; present → its raw value ('' allowed so that the
 *  list validator, e.g. requireTableIds, refuses it by name). Returns a string. */
export function listOpt(flag, { default: dflt, tag = 'argv' } = {}, args = (__lastParsed ?? argv())) {
  if (!optPresent(flag, args)) return dflt;
  const raw = optValue(flag, args);
  if (raw === undefined) refuse(tag, `${flag} given without a value (trailing); name the list or omit the flag`);
  return raw;
}

/** FIX9 (review round 9 on #731 P2 A, Fable pass 1): the strict argv loops keyed on exact tokens must read the SAME forms as
 *  pathOpt / stringOpt (`--flag value` and `--flag=value`), or a pre-scan that accepted `--out=DIR` removes DIR's prior verdict
 *  and the loop then refuses the line as an unknown flag — evidence deleted by a run that refuses its own argv. A loop tool
 *  feeds its argv through this first: `--flag=value` becomes the two tokens `--flag`, `value` (a bare `--flag=` becomes
 *  `--flag`, '' — the blank the value readers refuse); everything else passes as given. */
export function expandEqArgs(a) {
  const out = [];
  for (const t of a) { const m = /^(--[A-Za-z0-9][A-Za-z0-9-]*)=(.*)$/s.exec(t); if (m) out.push(m[1], m[2]); else out.push(t); }
  return out;
}

/** FIX10 (review round 10 on #731, ORDER-CN8-731-FIX10): ONE parse of the WHOLE argv to completion before ANY filesystem effect.
 *  A pre-scan that ran ahead of the tool's real parser was itself a second reader and disagreed with it on some invocation
 *  (help, repeated options, unknown flags, positional errors) — so every invalidating tool now calls this first and takes its
 *  destinations, selections and mode from the RESULT, never from a re-read of argv.
 *    spec.value  = flags that take one value (every occurrence must carry a non-blank value that is not another option; the
 *                  LAST occurrence wins, as argparse and the strict loops resolve it);
 *    spec.bool   = flags without a value; spec.multi = { '--flag': n } for flags taking n values;
 *    spec.unknown = 'refuse' (a strict tool: an unrecognised --option is a usage error) | 'ignore' (a tool that never refused them);
 *    spec.positionals = 'none' | 'any' | <n>.
 *  `--help` / `-h` print the usage and exit 0 before anything; every error exits 2 by name. Returns { args (the expanded argv),
 *  has(flag), value(flag, default), values(flag) (all occurrences), positionals }. */
let __lastParsed = null; // the =-expanded argv the last parseArgv consumed — pathOpt / stringOpt / listOpt default to it after a parse (one view for the invalidation and the write; Fable pass 3 on FIX10)
export function parseArgv({ tag = 'argv', usage = null, value = [], bool = [], multi = {}, unknown = 'ignore', positionals = 'any' } = {}, rawArgs = argv()) {
  const boolSet0 = new Set(bool);
  for (const a of rawArgs) { const eq = a.indexOf('='); if (a.startsWith('--') && eq > 2 && boolSet0.has(a.slice(0, eq))) refuse(tag, `${a.slice(0, eq)} is a switch and takes no value (given ${JSON.stringify(a)})`); } // Fable pass 2 on FIX10: `--judge=1` / `--letters=` used to expand into a switch + a stray positional, so the parsed view and a raw reader could disagree on the mode
  const args = expandEqArgs(rawArgs); __lastParsed = args;
  // help counts only in an OPTION position — never as the consumed value of a declared value / multi flag (`--out -h` is a value). `--` is NOT an
  // end-of-options marker here (Fable pass 4): honouring it only inside this loop had split the one view — pathOpt, the tools' argOf and the mode
  // resolver read the same array and would have seen options after it; a strict tool refuses `--` as unknown, a lazy one files it as a positional.
  const valueSet0 = new Set(value); let helpAt = -1; for (let i = 0; i < args.length; i++) { const a = args[i]; if (valueSet0.has(a)) { i++; continue; } if (Object.prototype.hasOwnProperty.call(multi, a) && Number.isInteger(multi[a])) { i += multi[a]; continue; } if (a === '--help' || a === '-h') { helpAt = i; break; } }
  if (helpAt >= 0) { console.log(usage || `usage: ${tag} — see the header comment of the tool`); process.exit(0); }
  const valueSet = new Set(value); const boolSet = new Set(bool);
  const last = new Map(); const all = new Map(); const seen = new Set(); const pos = [];
  const looksLikeOption = (v) => v === undefined || v.startsWith('--');
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (valueSet.has(a)) {
      const v = args[i + 1];
      if (looksLikeOption(v) || !v.trim()) refuse(tag, `${a} given without a value (blank or trailing)`);
      last.set(a, v); (all.get(a) || all.set(a, []).get(a)).push(v); seen.add(a); i++; continue;
    }
    if (Object.prototype.hasOwnProperty.call(multi, a) && Number.isInteger(multi[a]) && multi[a] > 0) { // an OWN entry only — Fable pass 1 on FIX10: a positional `toString` / `constructor` / `__proto__` read Object.prototype as an arity, i became NaN and the rest of the argv went unparsed
      const n = multi[a]; const vs = args.slice(i + 1, i + 1 + n);
      if (vs.length < n || vs.some((v) => looksLikeOption(v) || !v.trim())) refuse(tag, `${a} needs ${n} values`);
      last.set(a, vs); (all.get(a) || all.set(a, []).get(a)).push(vs); seen.add(a); i += n; continue;
    }
    if (boolSet.has(a)) { seen.add(a); continue; }
    if (a.startsWith('--')) {
      if (unknown === 'refuse') refuse(tag, `unknown argument ${JSON.stringify(a)}`);
      seen.add(a); continue; // a tool that never refused an unknown option still does not — its writer ignores it too
    }
    pos.push(a);
  }
  if (positionals === 'none' && pos.length) refuse(tag, `unexpected positional argument ${JSON.stringify(pos[0])}`);
  if (typeof positionals === 'number' && pos.length !== positionals) refuse(tag, `expected ${positionals} positional argument(s), got ${pos.length}`);
  return { args, has: (f) => seen.has(f), value: (f, d = null) => (last.has(f) ? last.get(f) : d), values: (f) => all.get(f) || [], positionals: pos };
}
