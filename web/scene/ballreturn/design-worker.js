// Copyright (c) Meta Platforms, Inc. and affiliates.

// design-worker.js — the V19 DESIGN gate off the UI thread (#707 prep FIX1 A1, review 707m1 P2-1). The controller posts the raw
// track JSON it fetched plus the built table's cups / visual falls / ball radius; this worker rebuilds the Track with the SAME
// validateTrack the controller used (pure, deterministic — the same bytes in, the same Track out) and runs the same designGate,
// then posts the plain verdict back. The import graph is three-free (schema.js → track.js / jsonschema.js / track-schema.js;
// kinematics.js → track.js), so the module worker needs no import map. A stale reply is dropped by the controller's job id +
// activation generation; a load or runtime failure here makes the controller fall back to the chunked path on the UI thread.
import { validateTrack } from './schema.js';
import { designGate } from './kinematics.js';

self.onmessage = (e) => {
  const { id, def, pockets, falls, r, opts } = e.data || {};
  try {
    const built = validateTrack(def, { pockets, falls });
    const dg = designGate(built, { pockets, r, ...(opts || {}) });
    self.postMessage({ id, ok: true, dg });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err?.message ?? err) });
  }
};
