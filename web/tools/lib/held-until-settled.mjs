// Copyright (c) Meta Platforms, Inc. and affiliates.

// held-until-settled.mjs — the held form of an awaited page evaluation, for the e2e-play arm modules
// (web/tools/e2e-play-*.mjs). Library only: it imports nothing, so an arm that imports it loads no page source (an
// import of lib/lighting-matrix.mjs, which exports the same function, would load the lighting matrix's page sources).
//
// #1238 (KF-025): Chrome answers an awaited Runtime.evaluate whose promise nothing references with 'Promise was
// collected'. #1221 holds the lighting matrix's page bodies with this function, and web/tools/e2e-play.mjs holds every
// awaited setLocale evaluation of its own with a copy of it; the arm modules hold theirs with this one.

/** An async page body whose promise the PAGE holds until it settles. The promise sits in window.__obHeld (a Set: two
 * held evaluates never overwrite each other) and leaves it once settled; a rejection reaches the evaluate as before. The
 * same text as lib/lighting-matrix.mjs's heldUntilSettled and e2e-play.mjs's copy. */
export const heldUntilSettled = (body) => `(() => {
  const p = (async () => {${body}})();
  (window.__obHeld ??= new Set()).add(p);
  const release = () => { window.__obHeld.delete(p); };
  p.then(release, release);
  return p;
})()`;
