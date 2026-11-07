// Copyright (c) Meta Platforms, Inc. and affiliates.

// sw-retrigger.js: an empty dedicated-worker script (#1167).
// app/swupdate.js starts one per tick after an update-notice Reload press that has not taken over yet,
// and terminates it at once. Its request is an in-scope main-resource request, which makes the browser
// retry the waiting generation's take-over.
// It sits outside the precache walk on purpose: web/sw.js passes it through, so there is no fill kick and
// no snapshot entry. It does nothing when it runs.
