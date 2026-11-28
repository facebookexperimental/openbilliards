// Copyright (c) Meta Platforms, Inc. and affiliates.

// web/app/ui/keygate.js — the shared "a dialog-class surface owns this key"
// predicate (review r1 P2 on GH-990). Leaf module: no imports, no side
// effects, feature-detected by its consumers per the cache-poison contract
// (the ownership ledger (internal)) — aim.js reaches it through a guarded dynamic
// import and keeps today's behaviour when it is missing.
//
// The gameplay keyboard family (aim.js window keydown: arrows = aim/power
// steps, V = aim view) must never act behind a modal surface: a focused
// plain dialog button passes aim.js's form-control bail, so ArrowLeft on
// the Re-rack confirm's Cancel stepped game.phi behind the dialog, and
// Cancel kept the change. shell.js gateKeyDown carries the same law while
// the hall is open (the GH-534 F3 / review r1 P2 sub-gate); this leaf holds
// the selector both sides read (shell.js adopts it in a later
// follow-up), so the two cannot drift.

/** Dialog-class surfaces that own their keys (shell.js gateKeyDown's
 * `inDialog` set, verbatim). */
export const DIALOG_SURFACE_SELECTOR = '#ob-settings, .ob-modal, [role="dialog"], '
  + '[role="alertdialog"], .ob-confirm, dialog, #err';

/** #hud-decision is a role="dialog" surface but NOT a key owner for
 * gameplay: the in-table rulebook prompt auto-focuses its first option, and
 * keyboard aiming while a decision pends is lawful (GH-447 placement-during-
 * decision — the carom break_spot prompt is up at every rack start). The
 * shell gate never meets it (the hud prompt is hidden while the hall is
 * open), so excluding it here changes nothing there. */
export const AIM_TRANSPARENT_SURFACE = '#hud-decision';

/** The keys aim.js acts on (window keydown). */
export const GAMEPLAY_KEYS = Object.freeze(
  ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'v', 'V']);

/** Open modal surfaces that own body-targeted keys too (focus can rest on
 * <body> after a blur): the settings modal's 015 §2 seam and any kit
 * alertdialog (confirmDialog) in the document. */
function modalOpen() {
  if (document.getElementById('ob-gear')?.getAttribute('aria-expanded') === 'true') return true;
  return document.querySelector('[role="alertdialog"]') !== null;
}

/** True when a gameplay key must be left to a dialog-class surface. */
export function dialogOwnsGameplayKey(e) {
  if (!GAMEPLAY_KEYS.includes(e?.key)) return false;
  const t = e.target;
  if (t instanceof Element) {
    const owner = t.closest(DIALOG_SURFACE_SELECTOR);
    if (owner) return !owner.matches(AIM_TRANSPARENT_SURFACE);
    if (t === document.body || t === document.documentElement) return modalOpen();
    return false;
  }
  // a non-Element target (window/document — synthetic events) is a body-
  // equivalent read: gated only while a modal surface is open
  return modalOpen();
}
