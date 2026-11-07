// Copyright (c) Meta Platforms, Inc. and affiliates.

// inputclock.js — the one input-clock stamp helper (#1130). A press's own
// stamp on the page's clock (Event.timeStamp: when the press was made, so a
// press queued behind a long task keeps its time) when it is a positive
// finite number less than 60 s old and at most 50 ms ahead of now; otherwise
// the handler's clock: no stamp, 0, or a foreign timebase (epoch ms).
// Pure: `now` is a parameter that defaults to the page clock, so the node gate
// (web/tools/test-input-clock.mjs) drives it without a browser.
// Consumers: shell.js (the continuation guard, the card-hold trailing click,
// the F6 activation window) reaches it through a namespace import (OWNERSHIP
// rule 5); practice.js's hold echo receives it as the shellCtx member
// `shell.inputClock` and falls back to the handler's clock (its pre-#1130
// bound) under a stale shell.js that lacks the member. play.js's commit latch
// keeps its own copy (play's packaging law 2 forbids the import); the node
// gate holds that copy to this helper's verdicts.
export function inputClock(ts, now = performance.now()) {
  return Number.isFinite(ts) && ts > 0 && ts > now - 60000 && ts <= now + 50 ? ts : now;
}
