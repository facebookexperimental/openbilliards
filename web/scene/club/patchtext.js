// Copyright (c) Meta Platforms, Inc. and affiliates.

// patchtext.js — the pure text step of material adoption (adopt.js): splice one club patch into a compiled material's shader
// sources. No imports, so the node arm (web/tools/club/test-club-core.mjs) runs it without a browser.
const FRAG_PARS_ANCHOR = '#include <common>';
const VERT_PARS_ANCHOR = '#include <common>';

/** Pure text step, exported for the node arm: apply one patch to (vertexShader, fragmentShader). Returns { ok, vs, fs, missed }. */
export function applyPatchText(vs, fs, spec) {
  const missed = [];
  let v = vs, f = fs;
  const splice = (src, anchor, mode, code) => {
    const i = src.indexOf(anchor);
    if (i < 0) return null;
    const rep = mode === 'replace' ? code : (mode === 'before' ? `${code}\n${anchor}` : `${anchor}\n${code}`);
    return src.slice(0, i) + rep + src.slice(i + anchor.length);
  };
  for (const a of spec.apply ?? []) {
    const vertex = a.stage === 'vertex';
    const out = splice(vertex ? v : f, a.anchor, a.mode ?? 'after', a.code ?? '');
    if (out === null) { missed.push(a.anchor); continue; }
    if (vertex) v = out; else f = out;
  }
  if (spec.pars) {
    const out = splice(f, FRAG_PARS_ANCHOR, 'after', spec.pars);
    if (out === null) missed.push(FRAG_PARS_ANCHOR); else f = out;
  }
  if (spec.vertexPars) {
    const out = splice(v, VERT_PARS_ANCHOR, 'after', spec.vertexPars);
    if (out === null) missed.push(VERT_PARS_ANCHOR); else v = out;
  }
  return missed.length ? { ok: false, vs, fs, missed } : { ok: true, vs: v, fs: f, missed };
}
