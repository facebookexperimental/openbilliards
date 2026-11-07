// Copyright (c) Meta Platforms, Inc. and affiliates.

// The annex's own statement of why it exists, stored ONCE.
//
// It is written into annex/annex-manifest.json by a4annex-488p.mjs, copied
// verbatim into provenance.json by orbitsweep-488p.mjs, and read by anyone
// asking what the annex crops are for.  That makes it a DISCLOSURE line, and
// Iron Law 11 requires every disclosure surface to agree with the ledger it
// is transcribed from.
//
// Why it lives in a file of its own.  The annex is delivered body bytes, so
// --cards-only re-BINDS the manifest instead of rebuilding it; the prose
// therefore could not be corrected by any card re-cut, and it went stale for
// two waves.  Wave A5-R4 narrowed ledger row NEW-A5a from a BRIGHTNESS reason
// to a RESOLUTION one and updated the card, the INDEX paragraph and the row --
// but not this string, which is authored by a different tool and had no way to
// follow.  Wave A5-R5 found it by diffing the delivered provenance.json.  Same
// defect class as the wave stamp A5-R4 caught: one fact with several
// hand-maintained copies.  Deriving them from one export makes the agreement
// structural instead of remembered, and orbitsweep's card path now re-derives
// a stale manifest purpose rather than re-binding it (red arm
// red-annex-purpose-drift).
export const ANNEX_PURPOSE = 'the acceptance surface for the wave M/N '
  + 'pocket-interior rebuild. Ledger row NEW-A5a accepts that rebuild on these '
  + 'crops and NOT on the delivered WIDE orbit, which images the pocket 5-11x '
  + 'coarser than these crops; these are the bytes that row points at. The '
  + 'reason is spatial RESOLUTION, re-founded in wave A5-R4 on the measured '
  + 'image scale (annex 2.843 px/mm against 0.268-0.561 px/mm across the wide '
  + 'orbit). Through A5-R3 this line instead read "which does not carry the '
  + 'information at 8 bits" - a BRIGHTNESS argument that the A5-R3 venue '
  + 'ambient retired, and which went on shipping in this manifest for two '
  + 'waves after the ledger row had been narrowed. The two CLOSE-UP orbits '
  + 'resolve the pocket at 1.03x and 0.89x of these crops and need no redirect '
  + 'at all; what these crops still uniquely supply is a static, magnified, '
  + 'annotated crop at a pose registered to the photograph, supporting a '
  + 'side-by-side an orbiting camera cannot.';

export const ANNEX_PURPOSE_SOURCE = 'tools/render/annex-purpose.mjs';
