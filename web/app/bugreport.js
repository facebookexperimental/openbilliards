// Copyright (c) Meta Platforms, Inc. and affiliates.

// bugreport.js — in-app bug report (feature 025, feature 025 (internal spec)):
// assembles the schema-v2 DIAGNOSTIC BUNDLE from the app's EXISTING debug
// seams (window.__test, window.__share, window.__rules, the glue kernel
// stamp, storage, navigator) and downloads it as one JSON file via the
// record.js blob-anchor path. No backend, no network upload, EVER — the
// file goes to the user's Downloads folder (or the shell save panel / iOS
// share sheet) and they attach it to a GitHub issue themselves.
//
// LEAF module (the ownership ledger cache-poison contract): reached ONLY via a
// guarded dynamic import() from settings.js at row activation — never on the
// boot path. The one static import below (kernel_version) is legal inside a
// dynamically-imported leaf and its call still sits in try/catch (the
// settings.js About stale-glue recipe).
//
// BEST-EFFORT LAW (FR-003): every section is assembled in its own
// sec()/secAsync() wrapper — a failed provider becomes { error: String(e) }
// and never aborts the bundle. Seam reads deliberately DON'T optional-chain
// inside the wrappers: an absent seam (a boot that died early) must surface
// as an {error} entry, not as a silently dropped key (US2 contract).
//
// SCHEMA v3 is a CLOSED field list (spec FR-002 + Amendments v2/v3): any
// new section is a bundle_version bump + spec amendment. v2 added EXACTLY
// two fields over v1 — `rules_version` and `judgments`, both via flow.js's
// window.__rules seam (rules-logic debugging, the gap the #44 aftermath
// left). v3 adds EXACTLY one — `storage` (the GH-534 G5 quota-degrade
// ledger, {persistFailed, firstKey} off window.__obStorage): the field
// itself landed in 75ddba58 WITHOUT the bump this header mandates, and the
// e2e closed-list gate caught it the first time the suite was run again
// (GH-562 battery) — the bump and spec amendment land here. No DOM chrome, no machine hooks, no storage writes, no
// fetch/XHR/beacon (the blob-URL read in e2e happens in the DRIVER, not
// here).
import { kernel_version } from '../dist/pool-wasm/pool_wasm.js';

/** localStorage settings key — literal duplicated ON PURPOSE (the main.js
 * boot-look precedent): importing the constant would add a named import
 * edge for a string (the ownership ledger rule-5 corollary). */
const SETTINGS_KEY = 'ob-settings-v1';

/** Best-effort section wrappers (plan D2): ANY failure — absent seam,
 * throwing provider, dead storage — becomes the section's {error} entry. */
function sec(fn) {
  try { return fn(); } catch (e) { return { error: String(e) }; }
}
async function secAsync(fn) {
  try { return await fn(); } catch (e) { return { error: String(e) }; }
}

/** Shell share-sheet handoff — MODULE-PRIVATE third copy of the record.js/
 * export.js helper ON PURPOSE (the ownership ledger rule-5 corollary: a shared
 * export would add a named import edge between boot-graph modules). The iOS
 * shell has no download delegate, so anchor blob clicks silently dead-end
 * there; the obShare bridge (bridge-CAPABILITY detection, never UA sniffing)
 * takes the file instead. Browsers + the macOS shell (WKDownload → save
 * panel, 023 blob-anchor law) keep the anchor path. Returns true when the
 * bridge took the file. Bundles are KB-scale — the ShareMessage.maxBytes
 * pre-flight is kept for copy fidelity, never expected to trip. */
const SHARE_MAX_BYTES = 384 * 1024 * 1024;
function shellShareFile(blob, name) {
  const bridge = window.webkit?.messageHandlers?.obShare;
  if (!bridge) return false;
  if (blob.size > SHARE_MAX_BYTES) {
    throw new Error(`bug report too large for the share bridge `
      + `(${(blob.size / 1e6).toFixed(0)} MB > `
      + `${(SHARE_MAX_BYTES / 1e6).toFixed(0)} MB cap)`);
  }
  const r = new FileReader();
  r.onload = () => {
    try {
      const b64 = String(r.result).split(',')[1] ?? '';
      bridge.postMessage({ v: 1, name, mime: blob.type, b64 });
    } catch { /* a throwing bridge drops the handoff; nothing to fall back to */ }
  };
  r.onerror = () => {
    // blob read failed inside the shell: fall back to the anchor path so
    // the handoff never silently drops (record.js review 2026-07)
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  r.readAsDataURL(blob);
  return true;
}

/** Assemble the schema-v2 bundle object (FR-002 + Amendment v2 — exactly
 * these fields). `deps.getSettings` is settings.js-local injection (the
 * live api.get); every other provider defaults to the window seams so the
 * module also works invoked bare from the console of a wounded build
 * (`(await import('./bugreport.js')).collectAndDownload()`). */
export async function collect(deps = {}) {
  return {
    bundle_version: 3,
    generated_at: sec(() => new Date().toISOString()),
    // kernel stamp via the glue export (settings.js About recipe) — a stale
    // glue without it degrades to the {error} entry, never a dead bundle
    kernel_version: sec(() => String(kernel_version())),
    // rules artifact stamp via flow.js's __rules seam (v2 — flow.js owns
    // the pool-rules glue init; the seam returns null when the rules boot
    // degraded, and an absent/stale seam surfaces as the {error} entry)
    rules_version: sec(() => window.__rules.rulesVersion()),
    app: sec(() => {
      // look/game from the live settings api, with the parsed-blob fallback
      // for console invocations on a wounded build (plan D1); seed/shotIndex
      // from the sanctioned __share.log() seam — shotIndex is the current
      // rack's recorded shot count (documented approximation, plan D7)
      let s = null;
      try { s = deps.getSettings?.() ?? null; } catch { s = null; }
      if (!s) {
        try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {}; }
        catch { s = {}; }
      }
      const log = sec(() => window.__share.log());
      return {
        // window.__i18n is i18n.js's shipped debug surface — the getLocale()
        // value one seam over (the leaf keeps kernel_version as its ONLY
        // static import; <html lang> is the syncHtmlLang mirror fallback)
        locale: window.__i18n?.locale?.()
          ?? document.documentElement.lang ?? null,
        look: (s.look === 'sp' ? 'tournament' : s.look) ?? null, // 'sp': the legacy look id (GH-973)
        game: s.game ?? null,
        seed: log?.seed ?? null,
        shotIndex: log?.shots ?? null,
        // read-only mirror of main.js's scripted-boot resolution (the
        // app.html boot-overlay precedent; main.js owns the write)
        scripted: sessionStorage.getItem('ob-scripted') === '1',
      };
    }),
    // the RAW persisted blob string, not re-parsed — byte truth (null on a
    // virgin profile: nothing was ever persisted, that IS the state)
    settings: sec(() => localStorage.getItem(SETTINGS_KEY)),
    // GH-534 G5 (round-2 QA): the storage-degrade ledger marker — a QUOTA
    // session (setItem throws, getItem still serves the stale blob) is
    // otherwise indistinguishable from "never saved". settings.js/shell.js
    // increment the shared window slot on every failed persist.
    storage: sec(() => ({
      persistFailed: window.__obStorage?.persistFailed ?? 0,
      firstKey: window.__obStorage?.firstKey ?? null,
    })),
    // the determinism log that would have solved #44 on sight: the exact
    // scenario JSON strings submitted to simulate (last ≤128, shot order —
    // cap raised 32 → 128 with bundle v2)
    scenarios: sec(() => window.__test.scenarios()),
    // v2: the per-shot judgment ledger (flow.js ring buffer, cap 128,
    // survives re-racks — rows are identified by their {rack, seed, shot}
    // triple; the rack ordinal disambiguates same-seed re-racks): every
    // adjudicated shot's verdict AT ADJUDICATION TIME, incl. the
    // {rack, seed, shot, judgeError} rows a judge-broken session leaves
    // (the #44 swallow point). The seam already hands back defensive
    // copies.
    judgments: sec(() => window.__rules.judgments()),
    // async best-effort: on a fresh boot this is the sanctioned
    // share.noShots throw → an {error} entry, never a rejected promise
    replay_url: await secAsync(() => window.__share.encode()),
    errors: sec(() => window.__test.errors.slice()),
    match_state: sec(() => window.__test.state()),
    balls: sec(() => window.__test.balls()),
    platform: sec(() => ({
      userAgent: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
      viewport: [window.innerWidth, window.innerHeight],
    })),
  };
}

let lastJson = null;   // most recently assembled bundle JSON (test seam)
let downloads = 0;     // completed download handoffs (test seam)

/** The ONE entry point (plan D1): assemble, serialize, download. The
 * download fires unconditionally after assembly — a half-broken app still
 * produces a file (US2). Returns the filename. */
export async function collectAndDownload(deps = {}) {
  const bundle = await collect(deps);
  const json = JSON.stringify(bundle, null, 2);
  lastJson = json;
  // record.js timestamp format (FR-004)
  const name = `openbilliards-bugreport-${new Date().toISOString()
    .slice(0, 19).replace(/[T:]/g, '-')}.json`;
  const blob = new Blob([json], { type: 'application/json' });
  if (!shellShareFile(blob, name)) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
  downloads += 1;
  return name;
}

// ---- e2e / debug surface (the __record precedent) --------------------------
// Doubles as the wounded-build console entry: `window.__bugreport.collect()`
// after a manual `import('./bugreport.js')` works with zero settings wiring.
window.__bugreport = {
  collect,
  collectAndDownload,
  last: () => lastJson,
  downloads: () => downloads,
};
