// Copyright (c) Meta Platforms, Inc. and affiliates.

// gi.js — runtime consumer of the offline lightmap bake (tools/render/
// bake-lightmap.mjs → web/assets/gi/). Loads the plan/flank lightmaps into
// the shared spike-shader uniforms (cloth/rail/wood/shield materials sample
// them by world-plan position: baked lamp-visibility shadow bands multiply
// the direct light, baked 1-bounce irradiance adds to the indirect), swaps
// the floor onto its baked lightMap channel + baked table-shadow overlay,
// and interpolates the SH-L2 probe grid per ball (ball ambient follows the
// local cloth bounce; cubemap specular stays untouched). The analytic
// per-ball contact shadows (shading.js) remain on top — they are dynamic.
//
// Feature flag: main.js skips load() under ?nogi (uGiOn stays 0 and every
// shader path is inert). Missing/failed assets log a warning and leave the
// app on the pre-GI lighting — never a console error.
//
// Geometry-aware gate (issue #52, per-class since GH-337): a bake mirrors
// ONE table geometry, so a mismatched footprint would paint the wrong
// pocket/nose lamp-shadow bands mid-cloth and the floor maps would carry
// the wrong table's silhouette. The bake is now a set of TABLE CLASSES
// (tools/render/lib/scene.mjs TABLES): the pool 9-ft field ships as the
// pre-337 top-level manifest entries (byte-identical resolution path), and
// snooker_12ft / carom_284 ride manifest.tables[<class>] — applyLookAssets
// resolves the ACTIVE table's class by kernel footprint and keys every
// baked layer (maps, bounds, probes) off that class. A footprint matching
// NO committed class keeps the honest pre-GI lighting (uniform hemi
// ambient + the analytic ball shadows) — the #52 gate, preserved for
// future tables. Footprint-LEVEL on purpose: pocket-cut differences inside
// the same 9-ft footprint (diamond/predator vs the baked wpa_generic) keep
// the bake — the app-default diamond_proam_9ft must keep its GI. Class
// bakes carry their own fixture dimension since GH-386
// (manifest.tables[cls].fixtures — the committed sets are each class's
// venue-default luminaire; anything else on a non-pool class honesty-gates
// per the #89 law until its bake set is designed + committed).
import * as THREE from 'three';
// namespace import ON PURPOSE (cache-poison contract, the ownership ledger — the
// look.js precedent): a stale table.js without the newer exports must
// degrade (optional-chained below), never fail the module graph.
import * as tableMod from './table.js';
// ORDER-LIGHT-FIX6 (review r10 P2 — gi.js:317-320): the venue switch arrives by INJECTION from main.js (createGI({ venueflag })) after
// the ONE protocol handshake across every participating leaf — never a static edge to the new leaf venueflag.js (the FIX5 P1
// class). Absent (a stale main.js, a mixed tree, the leaf missing) → false: main's grid gain (2.0 × brightness), no resting-ball SH
// block — the legacy path together with shading.js, which reads the same injected switch. A fresh gi.js can no longer meet a stale
// shader at gain 1.0, nor a stale gi.js run 2.0 under a fresh shader: both read the owner's one decision.
export const VENUE_PROTOCOL = 2; // ORDER-LIGHT-COMPANION: 1 → 2 (the owner↔leaf contract gained budgetMs; a protocol-1 main.js + this leaf = legacy for ALL)
let venueFlag = null;
const venueShading = () => (venueFlag ? venueFlag.venueShading() === true : false);

const BASE = './assets/gi/';

// the POOL class playing field (tools/render/lib/scene.mjs const L/W — the
// wpa_generic 9-ft mirror the pre-337 top-level gi-* asset set was traced
// from); other classes carry their footprint in manifest.tables[<class>]
const BAKED_FOOTPRINT = { length: 2.54, width: 1.27 };

// GH-327 (journey-QA wave 1 console hygiene): the footprint-gate fallback
// is EXPECTED, documented behavior on every snooker/carom load (the #52
// honest-neutral ruling), yet it console.warn'ed on EVERY applyLookAssets
// pass — table switches, look regrades and fixture re-keys each re-warned
// (2 QA lanes). It is now ONE session-scoped console.debug line (first
// mismatch only; repeats silent — state.fits === false stays the e2e/debug
// truth surface, e2e-equipment's round-trip arms unchanged). Whether
// snooker/carom should get their OWN baked footprints is a visual-parity
// question decided YES and tracked as its own issue (filed with #327's
// closure): the pre-GI fallback stays the shipped behavior only until a
// per-table-class bake exists.
let footprintMismatchLogged = false;

/** Resolve the ACTIVE table's bake class (GH-337): 'pool' (the pre-337
 * top-level manifest entries), a manifest.tables class id (snooker_12ft /
 * carom_284), or null when NO committed class shares the kernel footprint
 * (the #52 honest-neutral gate, preserved for future tables). Matching is
 * footprint-level at 1e-6 — the #52 pocket-cut doctrine. Feature-detected
 * read of the scene table module: a stale table.js simply reports 'pool'
 * (the pre-#52 behavior — GI stays on, exactly what that graph shipped
 * with); a stale MANIFEST without the tables dimension keeps resolving the
 * pool entries and gates everything else (the pre-337 behavior). */
function bakeClassFor(manifest) {
  const k = tableMod.specFor?.(tableMod.activeTableId?.())?.kernel;
  if (!k) return 'pool';
  const fits = (fp) => !!fp && Math.abs(k.length - fp.length) < 1e-6
    && Math.abs(k.width - fp.width) < 1e-6;
  if (fits(BAKED_FOOTPRINT)) return 'pool';
  for (const [id, t] of Object.entries(manifest?.tables ?? {})) {
    if (fits(t?.footprint)) return id;
  }
  return null;
}

/** Module-level handle so per-frame consumers (app/ballset.js probe updates)
 * reach the active GI runtime without threading it through the game core.
 * Stays null when GI is off (?nogi / spike.html / load failure). */
export const giActive = { instance: null };

// ORDER-LIGHT-9 Q1 (defect): the per-ball SH block was filled ONLY by ballset.js syncSphereUniforms (rack, layout,
// playback), and a fresh boot's one sync ran before the async GI load resolved — so every RESTING ball carried an
// all-zero block (no baked cloth bounce, no env irradiance) until it moved. The live ball list registers here and is
// refreshed whenever an apply completes (and immediately if GI is already ready). Gated on the venue switch so
// `?venue=off` keeps main's behaviour byte for byte.
let liveBalls = null;
// ORDER-LIGHT-C2-FIX2 class A: true once main's OWN path (ballset.js syncSphereUniforms: rack / layout / seek / playback) has sampled the
// blocks with GI ready — the table has been PLAYED; the venue's rest-time sampling (registerBallSet, an apply) does not set it
let ballBlocksFromMain = false;
export function registerBallSet(balls) {
  liveBalls = balls;
  if (venueShading()) updateBallProbes(balls);
}

function loadTex(url, { flipY }) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (t) => {
      t.flipY = flipY;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false; // linear-encoded data, not color
      resolve(t);
    }, undefined, reject);
  });
}

/** Create the GI runtime. `shared` = the createShared uniform set. */
export function createGI({ shared, venueflag = null, compileAhead = null, stage = null }) {
  venueFlag = (venueflag && typeof venueflag.venueShading === 'function') ? venueflag : null; // ORDER-LIGHT-FIX6: the injected switch (null = legacy)
  const state = {
    ready: false, look: null, manifest: null, probes: null,
    loadRequested: false, // ORDER-LAND-638-FIX P2-c: main.js never calls load() under ?nogi — the venue capture must not wait for it
    loadError: null, // ORDER-LAND-638-FIX2 C2: a rejected manifest / asset fetch (message) — an error state is a settled state
    requestedLook: null, // last REQUESTED look (state.look = last COMPLETED)
    room: null, // { floor, blob, hemi } supplied by load()
    fits: null, // footprint-gate verdict of the last applyLookAssets
    appliedSeq: 0, // last COMPLETED apply (vs applySeq = last STARTED)
    // issue #89 lighting axis: the bake is keyed by (look, FIXTURE). The
    // canopy default resolves the pre-#89 manifest.looks entries (stale
    // manifests keep working); other fixtures resolve manifest.fixtures.
    // A fixture without a committed bake set is HONESTY-GATED (uGiOn = 0,
    // the #52 recorded-downgrade precedent) — see `baked` below.
    fixture: 'canopy_panel',
    baked: null, // fixture-bake verdict of the last applyLookAssets
    // ORDER-LIGHT-C2 (a) (review r2 P2, shading.js:2203): the GI weight follows the ACTIVE rig. Every committed bake belongs to a
    // GAMEPLAY rig (a lightingvisuals fixture); the studio export rig (web/app/cinelight.js — rect lights re-normalized, rims, a
    // private env cube) has no matching probes, so while it is active the documented pre-GI fallback stands: uGiOn 0 (main's LTC
    // direct term on balls / cloth / furniture, no baked plan-flank fill, no resting-ball SH fill) and the room's baked floor
    // light map + table-shadow overlay SUSPENDED (their build values), the hemi untouched (the studio rig owns and restores it).
    // The rig is read from the cinelight announce (window seam `__cinelight` + `ob:cinelight` event; no import edge, a stale
    // cinelight.js never announces = the gameplay rig). giBound = a bind completed and was not neutralized since.
    rig: 'gameplay', rigMatch: true, rigRule: false, giBound: false, roomSuspended: false, roomAssets: null,
    // ORDER-LIGHT-C2-FIX5 class G (review r7 P2, gi.js:211): the bake KEY (class|fixture) of the assets that are BOUND or KEPT (bakeKey) and of the
    // latest REQUEST (requestKey). A kept / suspended asset whose key is not the requested key is dropped before any re-enable; uGiOn never
    // re-enables a bound set whose key moved. giKeyStaleDropped counts the drops the pre-FIX5 rule skipped (census).
    bakeKey: null, requestKey: null, giKeyStaleDropped: 0,
    hemiRestorePending: false, // C2 refuter P2: the bake's hemi dim was still applied when the bake left inside a studio window — restore after the revert
    hemiBuild: undefined, // the room's hemi at load(), before any bind (census giHemiVsBuild)
    // GH-337: bake-class verdict of the last applyLookAssets ('pool', a
    // manifest.tables id, or null when no committed class fits the table)
    bakeClass: null,
    // GH-386 (review r6): the FIXTURE whose maps last landed (or were
    // neutralized) — the class/fixture pair drives the pre-await
    // neutralize below, so a same-class fixture change never renders the
    // previous fixture's bake under the new rig
    bakeFixture: null,
    gain: 1, // issue #89 brightness: linear gain over the baked layers
  };
  let applySeq = 0; // last-writer guard: table switches can race look loads
  let giDelayMs = 0;
  // ORDER-LIGHT-C2-FIX2 class A (review r4 P2): `?venueDegradeBlocks=legacy` = the pre-fix rule (a runtime degrade zeroes every SH block even on a
  // played table) — the arm of the lifecycle rows. Default: sampled blocks are preserved when venue shading is disabled on a played table.
  // ORDER-LIGHT-C2-FIX4 class D (maintainer): every query-read ARM flag of this module takes effect only on a SCRIPTED boot — the app's test/tool
  // boot gate (`?cinema` / `?obtool`, the flag cdp.mjs stamps on every scripted boot; `?obtool=0` opts out; the sessionStorage pin app.html sets
  // before any module runs). A default boot ignores venueDegradeBlocks / giDelay / giFail / giStall. Read here, at createGI, from the URL — no race
  // with the stamp (the URL is fixed at navigation and app.html's inline pin precedes module evaluation).
  const scriptedBoot = (() => { try { const q = new URLSearchParams(window.location.search); const on = (k) => q.has(k) && q.get(k) !== '0'; return on('cinema') || on('obtool') || sessionStorage.getItem('ob-scripted') === '1'; } catch { return false; } })();
  let degradeBlocksLegacy = false;
  try { degradeBlocksLegacy = scriptedBoot && new URLSearchParams(window.location.search).get('venueDegradeBlocks') === 'legacy'; } catch { degradeBlocksLegacy = false; }
  try { giDelayMs = scriptedBoot ? Math.max(0, Number(new URLSearchParams(window.location.search).get('giDelay')) || 0) : 0; } catch { giDelayMs = 0; }
  // ORDER-LAND-638-FIX2 C2 arm: `?giFail=manifest|assets` makes the corresponding fetch REJECT — the failed-load path
  // (a real network failure takes the same branch); diagnostic only, never set by the app
  let giFail = '';
  try { giFail = scriptedBoot ? (new URLSearchParams(window.location.search).get('giFail') || '') : ''; } catch { giFail = ''; }
  // ORDER-LAND-638-FIX3 (review r7 P2 #2 arm): `giFail=assets:1` fails only the FIRST asset load — a later apply retries and
  // succeeds; the row proves the stale error is cleared and the runtime reads ready (default: every load fails, as before)
  // ORDER-LIGHT-C1 (review r1 P2 (a) arms): `giFail=assets:live[:n]` fails only asset loads that START once state.ready is true (the LIVE
  // regrade / re-pin, never the boot apply — the boot-anchored counter cannot single out a live apply); `giFail=look` throws at the look check
  // (an ending outside the old asset try); both through the real entry points (__test.setLook / setFixture). `assets:1` / `assets:2` keep their meaning.
  // ORDER-LIGHT-C2-FIX5 class G arm: `?venueGiKey=legacy` = the 793c8d67 rule (the invalidation check reads only the LIVE maps; a suspended set
  // with a stale key is re-enabled at the window's close). Behind the scripted-boot gate (class D law).
  let giKeyLegacy = false;
  try { giKeyLegacy = scriptedBoot && new URLSearchParams(window.location.search).get('venueGiKey') === 'legacy'; } catch { giKeyLegacy = false; }
  const bakeKeyOf = (cls, fixture) => `${cls == null ? '' : cls}|${fixture == null ? '' : fixture}`;
  const giFailM = /^(manifest|assets|look)(?::(live))?(?::(\d+))?$/.exec(giFail); const giFailKind = giFailM ? giFailM[1] : '';
  const giFailLive = !!(giFailM && giFailM[2]);
  let giFailLeft = giFailM && giFailM[3] ? Number(giFailM[3]) : Infinity;
  const giFailNow = (kind) => { if (giFailKind !== kind || giFailLeft <= 0) return false; if (giFailLive && state.ready !== true) return false; giFailLeft--; return true; };
  // ORDER-LIGHT-FIX7 (review r11 P2 arm): `?giStall=manifest` makes the manifest request NEVER settle — a request that stalls without
  // rejecting, the class the bounded venue hold exists for (a network that hangs takes the same branch); diagnostic only, never set by the app
  let giStall = '';
  try { giStall = scriptedBoot ? (new URLSearchParams(window.location.search).get('giStall') || '') : ''; } catch { giStall = ''; }
  // ORDER-LIGHT-C1 (a) E8 RECORD seam: `?giStall=assets` makes a LIVE apply's asset await never settle (a request that hangs after boot) —
  // no settle-on-error ending exists for it on gi's side (the census names the open sequence; an open row, see §L29)

  // GH-968: GI lightmaps are cached per URL for the session and released only when they leave the cache. Before, every apply
  // that reached the asset step loaded four new textures and dropped the bound four without dispose() (+4 live GPU textures
  // per bake-class switch), and a switch back re-fetched, re-decoded and re-uploaded the same PNGs. The cache keeps the
  // GI_TEX_SETS most recently requested sets (one set = one manifest entry's four maps, ~0.7 MB of GPU memory); a texture that
  // leaves it is disposed, and a set that is still loading or still bound (the kept roomAssets of a studio window) waits.
  // The trim runs whenever a texture load settles (loaded or failed), whenever an apply finishes with its set, and after
  // every bind, so applies that are superseded, rejected or settle out of order are trimmed too (review r1: trimming only on
  // the newest bind left older in-flight sets over the cap once they landed). A set is PINNED while any apply that requested
  // it is unfinished (review r2: with older sets still loading or bound, the trim could reach the newest set between its
  // last load and its bind, dispose it, and the bind then re-uploaded textures the cache no longer owned).
  const GI_TEX_SETS = 3;
  const texCache = new Map(); // url -> { p: Promise<THREE.Texture>, t: THREE.Texture | null (until loaded) }
  const texSets = new Map(); // set key -> urls, least recently requested first
  const texPins = new Map(); // set key -> number of unfinished applies that requested it
  function cachedTex(url, opts) {
    const hit = texCache.get(url);
    if (hit) return hit.p;
    const e = { p: null, t: null };
    e.p = loadTex(url, opts).then((t) => { e.t = t; queueMicrotask(trimTexCache); return t; },
      (err) => { if (texCache.get(url) === e) texCache.delete(url); queueMicrotask(trimTexCache); throw err; });
    texCache.set(url, e);
    return e.p;
  }
  function touchTexSet(urls) {
    const key = urls.join('|');
    texSets.delete(key);
    texSets.set(key, urls);
    texPins.set(key, (texPins.get(key) ?? 0) + 1);
    return key;
  }
  function unpinTexSet(key) {
    const n = (texPins.get(key) ?? 1) - 1;
    if (n > 0) texPins.set(key, n); else texPins.delete(key);
    queueMicrotask(trimTexCache);
  }
  function trimTexCache() {
    const bound = new Set([shared.uGiPlan.value, shared.uGiFlank.value, state.roomAssets?.floor, state.roomAssets?.shadow,
      state.room?.floor?.material?.lightMap, state.room?.blob?.material?.map]);
    for (const [key, urls] of texSets) {
      if (texSets.size <= GI_TEX_SETS) break;
      if (texPins.has(key)) continue;
      if (urls.some((u) => { const e = texCache.get(u); return e && (!e.t || bound.has(e.t)); })) continue;
      texSets.delete(key);
      const kept = new Set([...texSets.values()].flat());
      for (const u of urls) {
        const e = texCache.get(u);
        if (!e || kept.has(u)) continue;
        texCache.delete(u);
        e.t.dispose();
      }
    }
  }

  async function fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: http ${r.status}`);
    return r.json();
  }

  /** ORDER-LIGHT-C2 (a): the rig rule belongs to the VENUE path — under `?venue=off` and after the degrade the export is main's byte for
   * byte (main renders its studio export with uGiOn 1: the gameplay fill + the unweighted direct term), so the rule is inert there (refuter P2). */
  function rigRuleActive() { return venueShading(); }
  /** The ACTIVE rig — 'studio' while web/app/cinelight.js announces its window (`window.__cinelight === true`, set before its private env
   * bake and cleared as revert()'s first act), 'gameplay' otherwise. */
  function activeRig() {
    try { return (typeof window !== 'undefined' && window.__cinelight === true) ? 'studio' : 'gameplay'; } catch { return 'gameplay'; }
  }
  /** The room's baked layers off (floor light map + table-shadow overlay back to their build values) while another rig is active; the hemi
   * is NOT touched — inside the studio window cinelight owns it (snapshotted and restored exactly). The assets stay kept (roomAssets).
   * GH-1202 batch 2 (ruling cb904a26, the gi-restore row): restoreRoom clears roomBaked when it STAGES its write, and until that write lands
   * the room still shows the bake. That interval is suspended too, so neither the studio rig nor cinelight's private cube sees the leaving
   * bake: the build values now (its kept assets went when the restore was submitted: restoreRoom drops them, so the resume after the
   * revert re-binds nothing).
   * The restore still owes the undim: landing inside the window it writes nothing, landing after it the undim goes with it (ownDim) */
  function suspendRoom() {
    if (!state.room || !state.roomBase || state.roomSuspended) return;
    const leaving = !state.roomBaked && roomShowsBake();
    if (!state.roomBaked && !leaving) return;
    const { floor: floorMesh, blob } = state.room; const b = state.roomBase;
    floorMesh.material.lightMap = b.floorLightMap; floorMesh.material.lightMapIntensity = b.floorLightMapIntensity; floorMesh.material.needsUpdate = true;
    blob.material.map = b.blobMap; blob.material.color.setHex(b.blobColor); blob.material.opacity = b.blobOpacity; blob.material.needsUpdate = true;
    blob.scale.set(b.blobScale[0], b.blobScale[1], b.blobScale[2]);
    state.roomBaked = false; state.roomSuspended = true;
  }
  /** GH-1202 batch 2: the room refs show a bake's layers (a floor light map or table-shadow overlay other than their build values) */
  function roomShowsBake() {
    const b = state.roomBase;
    return state.room.floor.material.lightMap !== b.floorLightMap || state.room.blob.material.map !== b.blobMap;
  }
  /** Back on the gameplay rig (cinelight's revert COMPLETED): re-bind the kept bake through bindRoom (hemiBase is either the pre-window
   * value or, for a bind deferred inside the window, the value cinelight restored — the build value), or, when the bake left during the
   * window, restore the hemi it had dimmed (and, GH-1202 batch 2, the build values a rule-off window kept the bake over). */
  function resumeRoomNow() {
    if (state.room && state.roomAssets && !giKeyLegacy && state.roomAssets.key !== state.requestKey) {
      // C2-FIX5 G: the kept room maps belong to a fixture that is no longer requested — drop them (the new request binds its own)
      state.roomAssets = null; state.roomBaked = false; state.giKeyStaleDropped++;
      if (state.hemiDimmed) { state.hemiRestorePending = true; state.hemiDimmed = false; }
    }
    if (state.room && state.roomAssets) { const a = state.roomAssets; bindRoom(a.floor, a.shadow, a.look); }
    // GH-1202 batch 2: with the rig rule off the window does not suspend the room, so a restore that met the window left the bake on it —
    // the restore lands now, the undim with it
    else if (state.room && state.roomBase && roomShowsBake()) restoreWrite(state.hemiRestorePending, null);
    else if (state.room && state.hemiRestorePending && ownDim(state.room.hemi)) { state.room.hemi.intensity = state.hemiBase; }
    state.hemiRestorePending = false; state.roomSuspended = false;
  }
  /** GH-1202: the hemi still holds the dim gi wrote (hemiBase * 0.5, the same expression, so the comparison is exact). A restore undoes
   * OUR dim only: once look.js re-asserted the tournament level (when its setLook resolves outside a studio window; a staged restore can follow)
   * or cinelight restored a snapshot that is not the dim, the hemi is theirs. The venue probe zeroes it only inside its synchronous capture */
  function ownDim(hemi) { return state.hemiBase !== undefined && hemi.intensity === state.hemiBase * 0.5; }
  /** Derive every GI gate from (bound, active rig, rule): uGiOn = giBound && (rigMatch || rule off) — the ONE uniform every shader-side GI
   * term keys on (ball rect weight obRectW, the cloth / furniture rect weight, the plan-flank fill, the resting-ball SH fill) — and the
   * room's baked layers suspended / resumed with it. Runs on every bind, every cinelight announce and every venue-switch change. cinelight's
   * revert dispatches ob:cinelight BEFORE it restores lights / materials / env, so the resume runs in a microtask, after that synchronous
   * restore completed (refuter P2: a write inside the handler would be overwritten). */
  function applyRig(reason) {
    const rig = activeRig(); state.rig = rig; state.rigMatch = (rig === 'gameplay'); state.rigReason = reason;
    const rule = rigRuleActive(); state.rigRule = rule;
    // C2-FIX5 G: a bound set is re-enabled only while its key is the requested key (a fixture change during a window leaves giBound true
    // with the OLD key until the new request lands — the pre-FIX5 rule re-enabled it at the window's close)
    const keyOk = giKeyLegacy || state.bakeKey === null || state.bakeKey === state.requestKey;
    shared.uGiOn.value = (state.giBound && keyOk && (state.rigMatch || !rule)) ? 1 : 0;
    if (rule && !state.rigMatch) { suspendRoom(); return; }
    if (!state.roomSuspended && !state.hemiRestorePending) return;
    // GH-1202 batch 2 (ruling cb904a26 (a)): whatever the rule, what the window held lands after it — a degrade inside the window no
    // longer resumes the room there (uGiOn above still follows the switch at once); the window's close runs this again
    if (activeRig() !== 'gameplay') return;
    if (reason === 'cinelight') queueMicrotask(() => { if (activeRig() === 'gameplay') resumeRoomNow(); });
    else resumeRoomNow();
  }
  try { if (typeof window !== 'undefined') window.addEventListener('ob:cinelight', () => applyRig('cinelight')); } catch { /* headless */ }

  /** The room's baked layers ON (the pre-C2 inline block of applyLookAssets, unchanged on the gameplay path): floor light map + table-shadow
   * overlay, the default look's hemi dim, roomBase / hemiBase captured on the FIRST bind. Runs at bind time on the gameplay rig, or from
   * resumeRoomNow() after a studio window (the kept assets). */
  // GH-1202: the room refs' writes (the floor light map and the blob's map key new programs; their intensity, colour, opacity, scale
  // and the default look's hemi dim go with them, so the room changes as one) through main.js's staging seam: after the boot overlay
  // the write lands once its programs have linked (no held step, no link inside a frame); before it, or with a main.js without the
  // seam, it lands at once. Returns true when the write landed synchronously (the GH-1174 compile-ahead then covers it).
  // GH-1202 (maintainer ruling 973d6da0 on review's two P2s on 0f146178): a staged write is judged when it LANDS, not when it was asked
  // for — `write(at)` reads at.stale (an apply STARTED since: applySeq, the last-writer guard) and at.studio (the studio window is open;
  // GH-1202 batch 2, ruling cb904a26 (a): whatever the rig rule — a staged write that would land in the window defers until after it)
  // and returns whether it wrote. The snapshot is an apply's that writes, and only then (the seam applies twice: its
  // compile pass, then for real). roomTail is the newest write still in the seam (its promise; the seam is serialized, so it settles
  // after every earlier one): an apply publishes its completion once it settled (roomSettled). A write that landed at once (every
  // write before the overlay fades) leaves it null, so the boot path waits for nothing
  let roomTail = null;
  function roomWrite(floorMesh, blob, hemi, write, why) {
    const seq = applySeq;
    let snap = null;
    // GH-1202 batch 3 (review P2 on debcecb4): a submission that met the studio window at any pass, its compile pass included, stays
    // inert at a later landing outside it — that pass compiled nothing for this write, and the resume after the revert submits a fresh
    // one that compiles. Inside the window it still records what it owes (write(at) with at.studio)
    let met = false;
    const apply = () => {
      const studio = activeRig() !== 'gameplay';
      if (met && !studio) { snap = null; return; }
      met = met || studio;
      const s = { lm: floorMesh.material.lightMap, lmi: floorMesh.material.lightMapIntensity, map: blob.material.map,
        color: blob.material.color.getHex(), opacity: blob.material.opacity, scale: blob.scale.clone(), hemi: hemi.intensity };
      snap = write({ stale: seq !== applySeq, studio }) ? s : null;
    };
    const revert = () => {
      if (!snap) return;
      floorMesh.material.lightMap = snap.lm; floorMesh.material.lightMapIntensity = snap.lmi; floorMesh.material.needsUpdate = true;
      blob.material.map = snap.map; blob.material.color.setHex(snap.color); blob.material.opacity = snap.opacity; blob.material.needsUpdate = true;
      blob.scale.copy(snap.scale); hemi.intensity = snap.hemi;
      snap = null;
    };
    if (typeof stage !== 'function') { write(); return true; }
    let landed = false;
    const p = stage({ apply: () => { apply(); landed = true; }, revert: () => { revert(); landed = false; }, why });
    if (!landed && typeof p?.then === 'function') {
      const t = p.then(() => { if (roomTail === t) roomTail = null; }, () => { if (roomTail === t) roomTail = null; });
      roomTail = t;
    }
    return landed;
  }
  /** GH-1202: true once every staged room write settled with `seq` still the newest apply; false when one started meanwhile (it publishes
   * its own completion) */
  async function roomSettled(seq) {
    while (roomTail) await roomTail;
    return seq === applySeq;
  }

  function bindRoom(floor, shadow, look) {
    if (!state.room) return;
    const { floor: floorMesh, blob, hemi } = state.room;
    // build-time room values, kept so a live table switch OFF the baked
    // footprint (table.js rebuild → tableChanged) can restore them
    if (!state.roomBase) {
      state.roomBase = {
        floorLightMap: floorMesh.material.lightMap ?? null,
        // captured BEFORE the 1.0 write below: today's build value is the
        // three.js default 1.0 (masking), but any future non-default room
        // grade must survive a bake→restore round trip (review minor, #52)
        floorLightMapIntensity: floorMesh.material.lightMapIntensity,
        blobMap: blob.material.map,
        blobColor: blob.material.color.getHex(),
        blobOpacity: blob.material.opacity,
        blobScale: [blob.scale.x, blob.scale.y, blob.scale.z],
      };
    }
    // baked bounce replaces most of the hemispheric bounce stand-in — for
    // the DEFAULT look only: regraded looks (scene/look.js 'tournament') own their
    // hemi level, and dimming it here used to undo them whenever the async
    // tournament asset load resolved after look.js's traverse (tournament-at-boot flow).
    if (state.hemiBase === undefined) state.hemiBase = hemi.intensity;
    const landed = roomWrite(floorMesh, blob, hemi, (at) => {
      // GH-1202: a bind superseded by an apply started since writes nothing — that apply owns the room, and the default look's hemi dim
      // must never land over a tournament pick look.js has re-asserted. One landing inside a studio window writes nothing either and
      // stays kept, as a bind that completes in the window does (applyLookAssets): the room suspended, re-bound by resumeRoomNow()
      // once the rig reverts. GH-1202 batch 2: with the rig rule off as well (?venue=off, or after the degrade), where the window keeps
      // the room it opened with — roomSuspended then reads "owed to the resume"
      if (at?.stale) return false;
      if (at?.studio) { state.roomBaked = false; state.roomSuspended = true; return false; }
      floorMesh.material.lightMap = floor;
      floorMesh.material.lightMapIntensity = 1.0 * state.gain;
      floorMesh.material.needsUpdate = true;
      // the fake radial blob becomes the exact baked table shadow, resized
      // from its 4.6×3.2 plane to the 9×6 floor-map bounds
      blob.material.map = shadow;
      blob.material.color.setHex(0x000000);
      // the baked A is pure lamp visibility (0 under the slab) but the room
      // fill/hemi still reach the under-table floor — cap the overlay
      blob.material.opacity = 0.85;
      blob.material.needsUpdate = true;
      blob.scale.set(9 / 4.6, 6 / 3.2, 1);
      if (look === 'default') hemi.intensity = state.hemiBase * 0.5;
      return true;
    }, 'gi-bind');
    // GH-1174: the floor's light-map variant and the blob's map variant are new programs; main.js compiles them ahead
    // (KHR_parallel_shader_compile) while its loop holds, instead of three linking them synchronously inside the next render
    // (a staged write, GH-1202, compiled them already)
    if (landed && typeof compileAhead === 'function') compileAhead([floorMesh, blob], 'gi-bind');
    // unconditional: a tournament apply must CLEAR a stale default-era flag,
    // or a later footprint-mismatch restoreRoom() clobbers the tournament look's
    // own hemi level for the rest of the session (review major, #52)
    state.hemiDimmed = (look === 'default');
    state.roomBaked = true;
    state.roomAssets = { floor, shadow, look, key: state.requestKey }; // C2 (a): kept so a rig round trip (studio → gameplay) can re-bind without a fetch; C2-FIX5 G: keyed
    state.roomSuspended = false; state.hemiRestorePending = false;
  }

  /** Put the room refs back on their pre-GI build values (only after a baked
   * apply actually retargeted them — a mismatched boot never touches them). */
  function restoreRoom() {
    if (state.roomSuspended) {
      // C2 (a) + refuter P2: the room already shows its build values (or the bind was deferred) and the bake will NOT come back — drop the
      // kept assets; if the bake's hemi dim is still applied (cinelight snapshotted that value and will restore it on revert), its restore
      // to hemiBase is scheduled for after the revert (resumeRoomNow). roomSuspended stays set until the rig reverts. GH-1202 batch 2: with
      // the rig rule off the room may still show the bake there; the resume restores it after the revert.
      state.roomAssets = null; state.roomBaked = false;
      if (state.hemiDimmed) { state.hemiRestorePending = true; state.hemiDimmed = false; }
      return;
    }
    if (!state.room || !state.roomBase || !state.roomBaked) return;
    restoreWrite(state.hemiDimmed && state.hemiBase !== undefined, state.roomAssets);
    state.hemiDimmed = false;
    state.roomBaked = false;
    // GH-1202 (P3 1): the kept assets go when the restore is submitted, as on the suspended path above (the bake it removes will not
    // come back): a restore still staged when a window opens left them for the resume after the revert — under the rule the open
    // dropped them, but with the rule off a restore that declines inside the window sets roomSuspended, and the resume re-bound them
    state.roomAssets = null;
  }
  /** The room refs' build values through the seam — `undim`: the hemi back to hemiBase too; `kept`: the assets this restore removes.
   * GH-1202: a restore always lands — it only returns the room to its build values, and an apply that superseded it found the room
   * restored. Inside a studio window the hemi is cinelight's (its revert restores its snapshot): the undim waits for the resume after the
   * revert, as restoreRoom's suspended path schedules it, and the bind this restore removed is no longer kept for that resume. GH-1202
   * batch 2 (ruling cb904a26): there it writes nothing else either, whatever the rig rule — under the rule the window suspended the room
   * at its open (suspendRoom), and with the rule off the export keeps the room it opened with, which the resume restores after the revert
   * (resumeRoomNow). The undim itself waits for nothing else: it lands only while the hemi still holds our dim (ownDim) */
  function restoreWrite(undim, kept) {
    const { floor: floorMesh, blob, hemi } = state.room;
    const b = state.roomBase;
    roomWrite(floorMesh, blob, hemi, (at) => {
      if (at?.studio) {
        if (undim) state.hemiRestorePending = true;
        if (state.roomAssets === kept) state.roomAssets = null;
        state.roomSuspended = true;
        return false;
      }
      floorMesh.material.lightMap = b.floorLightMap;
      floorMesh.material.lightMapIntensity = b.floorLightMapIntensity;
      floorMesh.material.needsUpdate = true;
      blob.material.map = b.blobMap;
      blob.material.color.setHex(b.blobColor);
      blob.material.opacity = b.blobOpacity;
      blob.material.needsUpdate = true;
      blob.scale.set(b.blobScale[0], b.blobScale[1], b.blobScale[2]);
      // undo OUR hemi dim only — the tournament look owns its own hemi level (look.js)
      if (undim && ownDim(hemi)) hemi.intensity = state.hemiBase;
      return true;
    }, 'gi-restore');
  }

  /** ORDER-LIGHT-C1 (review r1 P2 (a), gi.js:300): the documented pre-GI fallback in ONE place (gi.js header; the #52 / #89 gates) —
   * every non-bind landing runs it: uGiOn 0 (every shader path inert), no plan / flank maps bound, no probe grid, the room refs at their
   * build values, the resting balls' SH blocks zeroed. */
  function neutralize() {
    restoreRoom();
    state.giBound = false; state.bakeKey = null; // (the suspended-room state is restoreRoom()'s, just above); C2-FIX5 G: no key bound
    shared.uGiOn.value = 0;
    shared.uGiPlan.value = null; shared.uGiFlank.value = null;
    state.probes = null;
    if (liveBalls) for (const b of liveBalls) { const sh = b.mesh && b.mesh.material && b.mesh.material.userData && b.mesh.material.userData.giSH; if (sh && sh.value && typeof sh.value.fill === 'function') sh.value.fill(0); }
  }
  /** An apply that FAILS never leaves a prior sequence's GI bound: it lands on the fallback BEFORE `settled` (appliedSeq = seq). A superseded
   * apply (seq !== applySeq) owns nothing — the newest sequence settles, and may already be bound. bakeClass / bakeFixture read null =
   * 'nothing bound' (the createGI values), so a later same-key apply re-neutralizes and tableChanged's idle shortcut re-dispatches. state.look is
   * RESTORED to the last COMPLETED look (a throw after the bind had written the failed one) and baked is cleared, so a retry of the failed look
   * still dispatches through setLook's idempotence guard; state.ready is never written here, so a boot failure stays not-ready.
   * GH-1202: with a room write still staged (the fallback's restore, or a keyMoved neutralize's), the settled state waits for it: the
   * catch publishes it once the room's staged writes landed (publishError), and only while this apply is still the newest. */
  function settleOnError(seq, e, prevLook) {
    if (seq !== applySeq) return false;
    neutralize();
    state.bakeClass = null; state.bakeFixture = null; state.baked = false;
    if (prevLook !== undefined) state.look = prevLook; // (refuter) a throw after the bind wrote state.look must not leave the FAILED look as the completed one — setLook's idempotence guard would skip the retry
    if (!roomTail) publishError(seq, e);
    return true;
  }
  /** a failure's settled state: loadError is a settled state to every reader (lightingvisuals' giIdle), so it goes with appliedSeq */
  function publishError(seq, e) {
    state.loadError = String(e && e.message || e);
    state.appliedSeq = seq;
  }

  /** Resolve the bake entry for (class, look, fixture) — issues #89 +
   * GH-337 + GH-386. The pool class keeps the pre-#89 resolution
   * byte-identical: canopy resolves the top-level looks (back-compat with
   * a stale manifest), other fixtures the manifest fixture dimension.
   * Non-pool classes resolve manifest.tables[cls]: canopy → the class
   * looks; other fixtures → the class's OWN fixture dimension
   * (manifest.tables[cls].fixtures — GH-386 class × luminaire bakes, the
   * #89 shape on the class entry; a stale manifest without the dimension
   * honesty-gates exactly like pre-386). A null class (footprint mismatch)
   * resolves the POOL entries so the fixture-honesty verdict keeps
   * preceding the #52 footprint gate — the pre-337 gate order. Returns
   * null for any uncommitted (honesty-gated) bake. */
  // GH-973: the look id sp is now 'tournament'. The legacy id still names it at the entry
  // points (load / setLook). A manifest written before the rename (a cached one) has its sp
  // keys read as 'tournament' and its gi-sp-* file names read as the renamed gi-tournament-*.
  const lookId = (look) => (look === 'sp' ? 'tournament' : look);
  function legacyLooks(mf) {
    const tables = Object.values(mf?.tables ?? {});
    for (const node of [mf, ...tables, ...Object.values(mf?.fixtures ?? {}),
      ...tables.flatMap((t) => Object.values(t?.fixtures ?? {}))]) {
      if (node?.looks?.sp && !node.looks.tournament) {
        const e = node.looks.sp;
        if (e.files) e.files = Object.fromEntries(Object.entries(e.files).map(([k, f]) => [k, String(f).replace(/^gi-sp-/, 'gi-tournament-')]));
        node.looks.tournament = e;
        delete node.looks.sp;
      }
    }
    return mf;
  }
  function entryFor(mf, look, fixture, cls) {
    if (cls && cls !== 'pool') {
      if (fixture && fixture !== 'canopy_panel') {
        const e = mf.tables?.[cls]?.fixtures?.[fixture]?.looks?.[look];
        return e && !e.unbaked ? e : null;
      }
      const e = mf.tables?.[cls]?.looks?.[look];
      return e && !e.unbaked ? e : null;
    }
    if (!fixture || fixture === 'canopy_panel') return mf.looks[look] ?? null;
    const e = mf.fixtures?.[fixture]?.looks?.[look];
    return e && !e.unbaked ? e : null;
  }

  async function applyLookAssets(look) {
    const seq = ++applySeq;
    const prevLook = state.look; // C1: the last COMPLETED look, restored by settleOnError
    // ORDER-LAND-638-FIX3 (review r7 P2 #2): a NEW apply starts clean — a stale loadError from an earlier rejected load
    // would otherwise make lightingvisuals' giIdle() read "settled" at once and let the venue capture race this apply
    state.loadError = null;
    // venue-lighting lane (ORDER-LIGHT-7 R-B): the last STARTED apply, mirrored so the venue-fill capture can wait
    // for THIS apply's completion (state.appliedSeq === state.applySeq) instead of a fixed delay
    state.applySeq = seq;
    state.requestedLook = look; // request-time intent (tableChanged reads it)
    const fixture = state.fixture;
    const mf = state.manifest;
    let pinnedSet = null; // GH-968 (review r2): the lightmap set this apply holds until it binds or gives up
    // ORDER-LIGHT-C1 (a), verifier round: ONE try owns every ending of the sequence from here to the bind — the look check (E6), the class
    // and entry resolution, the two gates' returns, the asset awaits, the class re-run and the bind. Any throw is a settle-on-error ending
    // (the catch below), never a never-settled one and never an inline special case.
    try {
    if (!mf.looks[look] || giFailNow('look')) throw new Error(!mf.looks[look] ? `gi manifest has no look '${look}'` : 'giFail=look (test seam): the look check threw'); // C1 (a) E6: an ending outside the old try settles on error too
    const cls = bakeClassFor(mf);
    state.requestKey = bakeKeyOf(cls, fixture); // C2-FIX5 G: the key this request will bind
    const entry = entryFor(mf, look, fixture, cls);
    if (!entry) {
      // issue #89 honesty gate: this fixture ships no committed bake set
      // (repo-growth arbitration — the recorded downgrade). Same neutral
      // path as the #52 footprint gate: uGiOn = 0 keeps every shader path
      // inert (documented pre-GI lighting), the room keeps its build look.
      neutralize(); // C1: the ONE fallback
      state.baked = false;
      state.bakeClass = cls;
      state.bakeFixture = fixture;
      state.look = look;
      if (roomTail && !(await roomSettled(seq))) return; // GH-1202: complete once the room's staged writes landed
      state.ready = true;
      state.appliedSeq = seq;
      console.warn(`[gi] no committed bake for fixture '${fixture}'`
        + `${cls && cls !== 'pool' ? ` on table class '${cls}'` : ''} — baked `
        + 'GI off (pre-GI lighting, issue #89 honesty gate)');
      return;
    }
    if (cls === null) {
      // footprint mismatch (issue #52): no committed bake class shares the
      // active table's footprint — an honest neutral beats someone else's
      // shadows: uGiOn=0 keeps every shader path inert (documented pre-GI
      // lighting) and the room keeps/regains its build-time look.
      // state.look still reports the REQUESTED look (e2e surface contract).
      neutralize(); // C1: the ONE fallback
      state.fits = false;
      state.bakeClass = null;
      state.bakeFixture = fixture;
      state.look = look;
      if (roomTail && !(await roomSettled(seq))) return; // GH-1202: complete once the room's staged writes landed
      state.ready = true;
      state.appliedSeq = seq;
      if (!footprintMismatchLogged) {
        footprintMismatchLogged = true; // one-time notice (GH-327 above)
        console.debug('[gi] bake footprint: no committed bake class fits '
          + `table '${tableMod.activeTableId?.() ?? 'unknown'}' — baked GI `
          + 'off (pre-GI lighting; one-time notice, later mismatches silent)');
      }
      return;
    }
    // ORDER-LIGHT-C2-FIX5 class G (review r7 P2): the check also covers a SUSPENDED / KEPT set — during a studio window roomBaked and uGiOn are
    // both false while giBound / roomAssets still hold the previous fixture's maps; the pre-FIX5 check skipped the invalidation and the
    // window's close re-enabled the stale bake until this request completed (main kept GI off through the interval).
    const keyMoved = state.bakeClass !== cls || state.bakeFixture !== fixture;
    const liveMaps = !!(state.roomBaked || shared.uGiOn.value);
    const heldMaps = !giKeyLegacy && !!(state.giBound || state.roomAssets);
    if (keyMoved && heldMaps && !liveMaps) state.giKeyStaleDropped++;
    if (keyMoved && (liveMaps || heldMaps)) {
      // class OR fixture switch with the PREVIOUS bake's maps still live
      // (GH-337 review r1; fixture axis GH-386 review r6): on a cold cache
      // the scene would render under the old bake's shadows for the whole
      // fetch window, and a FAILED fetch would leave them up forever
      // (tableChanged/setLook/setFixture callers swallow the rejection).
      // Neutralize to the honest pre-GI baseline BEFORE the awaits — the
      // #52 neutral shape. Same-(class, fixture) applies (look regrades)
      // keep their maps through the await: the pre-337 behavior — and, since ORDER-LIGHT-C1 (a), a FAILED same-key apply lands on the
      // fallback too (settleOnError below), never on the previous look's maps.
      neutralize(); // C1: the ONE fallback
    }
    let plan, flank, floor, shadow, probes;
    // ORDER-LAND-638-FIX2 C2 (review r6 P1) → ORDER-LIGHT-C1 (a): a REJECTED load is an error state, and an error state is a SETTLED
    // state — settleOnError lands the fallback and concludes THIS apply (appliedSeq = applySeq) so the venue capture and every reader
    // of the apply witness stop waiting. Callers still see the rejection (they swallow it, as before). The try opened at the look
    // check above spans the whole remainder of the sequence (bind included), so any throw is a settle-on-error ending.
    if (giFailNow('assets')) throw new Error('giFail=assets (test seam): asset fetch rejected');
    if (giStall === 'assets' && state.ready === true) await new Promise(() => {}); // C1 E8 RECORD seam: a live asset await that never settles
    const urls = [BASE + entry.files.plan, BASE + entry.files.flank, BASE + entry.files.floor, BASE + entry.files.floorshadow];
    pinnedSet = touchTexSet(urls); // GH-968: the most recently requested set, pinned until this apply finishes
    [plan, flank, floor, shadow, probes] = await Promise.all([
      cachedTex(urls[0], { flipY: false }),
      cachedTex(urls[1], { flipY: false }),
      cachedTex(urls[2], { flipY: true }),
      cachedTex(urls[3], { flipY: true }),
      fetchJson(BASE + entry.files.probes),
    ]);
    if (seq !== applySeq) return; // superseded by a newer table/look apply
    // diagnostic only (venue-lighting R-B arm): `?giDelay=<ms>` holds the apply open after its assets arrived, so
    // a capture that does not wait for completion provably lands on a half-applied GI
    if (giDelayMs > 0) { await new Promise((res) => setTimeout(res, giDelayMs)); if (seq !== applySeq) return; }
    if (bakeClassFor(mf) !== cls) {
      // the table switched UNDER the texture awaits and resolves to a
      // DIFFERENT bake class — the verdict from the top of this apply is
      // stale; re-run the gate against the current table (review major,
      // #52; class-keyed since GH-337)
      return applyLookAssets(look);
    }
    const b = cls === 'pool' ? mf.bounds.plan : mf.tables[cls].bounds.plan;
    shared.uGiPlan.value = plan;
    shared.uGiFlank.value = flank;
    shared.uGiBounds.value.set(b.x0, b.z0, b.x1, b.z1);
    shared.uGiScale.value = entry.scale;
    // 1.0 = physical 1-bounce level; the bounce reads over-gained because
    // the bake has no 2nd+ bounces. Was 2.2 — trimmed to 2.0 in the
    // cloth-sheen wave (feature 010): the baked irradiance now ALSO feeds
    // the cloth sheen lobe (shading.js SPIKE_GI sheen term, returning part
    // of the retro-reflection this gain used to stand in for). × state.gain:
    // issue #89 brightness scales the baked bounce linearly with the dynamic
    // lights so the bake stays truthful (never a rebake for brightness).
    // ORDER-LIGHT-9 Q3: physical scale (1.0 = the bake's own 1-bounce level) under the venue switch; the 2.0
    // literal above has no provenance ("eyeballed", see the note) and stays on ?venue=off only
    shared.uGiIrr.value = (venueShading() ? 1.0 : 2.0) * state.gain;
    state.giBound = true;
    state.bakeKey = bakeKeyOf(cls, fixture); // C2-FIX5 G: the key of the set now bound
    shared.uGiOn.value = state.rigMatch ? 1 : 0; // C2 (a): bound AND the active rig is the bake's — never the bake's flag alone
    state.probes = probes;
    state.look = look;
    state.fits = true;
    state.baked = true;
    state.bakeClass = cls;
    state.bakeFixture = fixture;
    if (state.room) {
      if (activeRig() !== 'gameplay') {
        // C2 refuter P2: a bind landing INSIDE the studio window neither touches the room (cinelight owns the hemi, the material colours and
        // the env — it snapshots the CURRENT values and restores exactly them) nor captures roomBase / hemiBase from the studio world; the
        // bind is kept and lands through resumeRoomNow() once the rig reverts (the post-revert microtask in applyRig). GH-1202 batch 2:
        // whatever the rig rule — with the rule off bindRoom ran here, took the build values from the studio world, and on a synchronous
        // seam its own tail cleared the deferral its write had just set, so the bind never landed after the window
        state.roomAssets = { floor, shadow, look, key: bakeKeyOf(cls, fixture) }; state.roomSuspended = true; state.roomBaked = false;
      } else {
        bindRoom(floor, shadow, look);
      }
    }
    applyRig('bind'); // C2 (a): a bind that lands while the studio rig is active lands on the fallback at once
    // GH-1202 (ruling 973d6da0): complete once the room shows this apply — its staged bind landed, or dropped itself as stale; look.js
    // re-asserts the tournament hemi on this completion outside a studio window, so no older room write may land after it. Meanwhile
    // the resting balls take this apply's probes at once, as when the bind lands at once (uGiOn is 1, and a neutralize zeroed them)
    if (roomTail) {
      if (venueShading() && liveBalls) sampleBallBlocks(api, liveBalls);
      if (!(await roomSettled(seq))) return;
    }
    state.ready = true;
    state.appliedSeq = seq;
    // ORDER-LIGHT-9 Q1: the apply is complete — fill every resting ball's SH block from the grid now
    if (venueShading() && liveBalls) updateBallProbes(liveBalls);
    trimTexCache(); // GH-968: the previous sets are unbound now
    } catch (e) {
      // C1 (a): the fallback lands before `settled`; a superseded apply's failure settles nothing. GH-1202: settled once the room's staged
      // writes landed, when one is staged (settleOnError)
      if (settleOnError(seq, e, prevLook) && roomTail && await roomSettled(seq)) publishError(seq, e);
      console.warn('[gi] load failed — pre-GI fallback stands:', e && e.message ? e.message : e);
      throw e;
    } finally {
      if (pinnedSet !== null) unpinTexSet(pinnedSet);
    }
  }

  const api = {
    state,
    uniforms: shared, // debug/e2e surface (uGiOn, uGiIrr, …)
    /** GH-968 census (read-only): the cached lightmap URLs, the requested sets (least recent first), the pinned-set count
     * and the uuids of the loaded textures the cache owns. */
    texCacheState() {
      return { urls: texCache.size, loaded: [...texCache.values()].filter((e) => e.t).length, sets: [...texSets.keys()],
        pinned: [...texPins.keys()].length, uuids: [...texCache.values()].filter((e) => e.t).map((e) => e.t.uuid) };
    },
    /** ORDER-LIGHT-C1 (a) census: what is BOUND right now (the fallback = all zero / null / false) and whether a sequence is still open. */
    probeState() {
      let nonZero = 0;
      if (liveBalls) for (const b of liveBalls) { const sh = b.mesh && b.mesh.material && b.mesh.material.userData && b.mesh.material.userData.giSH; if (sh && sh.value && Array.from(sh.value).some((v) => v !== 0)) nonZero++; }
      const fl = state.room && state.room.floor && state.room.floor.material;
      return { giOn: shared.uGiOn.value, rig: state.rig, rigMatch: !!state.rigMatch, rigRule: !!state.rigRule, giBound: !!state.giBound, roomSuspended: !!state.roomSuspended, hemiDimmed: !!state.hemiDimmed, hemiRestorePending: !!state.hemiRestorePending, hemiVsBuild: (state.room && state.room.hemi && state.hemiBuild) ? state.room.hemi.intensity / state.hemiBuild : null, planBound: !!shared.uGiPlan.value, flankBound: !!shared.uGiFlank.value, probes: !!state.probes, roomBaked: !!state.roomBaked,
        floorLightMapBound: !!(fl && fl.lightMap) && !(state.roomBase && fl.lightMap === state.roomBase.floorLightMap), bakeClass: state.bakeClass ?? null, bakeFixture: state.bakeFixture ?? null, fixture: state.fixture ?? null, bakeKey: state.bakeKey ?? null, requestKey: state.requestKey ?? null, giKeyStaleDropped: state.giKeyStaleDropped | 0, giKeyMode: giKeyLegacy ? 'legacy' : 'keyed',
        look: state.look ?? null, requestedLook: state.requestedLook ?? null, seqOpen: state.applySeq !== undefined && state.applySeq !== state.appliedSeq, applySeq: state.applySeq ?? null, appliedSeq: state.appliedSeq ?? null,
        ballBlocksNonZero: nonZero, ballBlocksFromMain: ballBlocksFromMain, degradeBlocksMode: degradeBlocksLegacy ? 'legacy' : 'preserve-played', loadError: state.loadError ?? null, ready: !!state.ready };
    },
    /** Boot-time load; `room` = { floor, blob, hemi } from buildRoom.
     * `fixture` (issue #89): the persisted lighting fixture main.js raw-read
     * next to bootLook — optional, canopy default (pre-#89 callers). */
    async load(look, { room, fixture } = {}) { look = lookId(look);
      state.loadRequested = true;
      state.loadError = null; // ORDER-LAND-638-FIX3: a (re)load starts clean
      state.room = room ?? null;
      if (state.room && state.room.hemi && state.hemiBuild === undefined) state.hemiBuild = state.room.hemi.intensity; // C2: the build value, before any bind
      if (typeof fixture === 'string' && fixture) state.fixture = fixture;
      try {
        if (giFailNow('manifest')) throw new Error('giFail=manifest (test seam): manifest fetch rejected');
        if (giStall === 'manifest') await new Promise(() => {}); // FIX7 arm: the request never settles (loadRequested true, never ready, never an error)
        state.manifest = legacyLooks(await fetchJson(BASE + 'gi-manifest.json'));
      } catch (e) {
        // ORDER-LAND-638-FIX2 C2: the manifest itself failed — settled as an error state (no apply ever starts)
        state.loadError = String(e && e.message || e);
        console.warn('[gi] manifest fetch failed — pre-GI fallback stands:', e && e.message ? e.message : e);
        throw e;
      }
      await applyLookAssets(look);
      if (state.fits !== false && state.baked !== false) {
        // per-class boots log the CLASS hash (GH-337); the pool line stays
        // byte-identical to the pre-337 log (capture/e2e greps)
        const cls = state.bakeClass ?? 'pool';
        const hash = cls === 'pool' ? state.manifest.sceneHash
          : state.manifest.tables?.[cls]?.sceneHash;
        console.log(`[gi] lightmaps '${look}' on (scene ${hash}`
          + `${cls === 'pool' ? '' : `, table class ${cls}`})`);
      }
    },
    /** Look regrade (scene/look.js 'tournament'): swap maps + probes. Idempotent —
     * a tournament boot loads 'tournament' directly and applyLook's call is then a no-op. */
    /** ORDER-LIGHT-C2 refuter arm (test seam): re-dispatch the COMPLETED look — a bind that lands inside a studio window (studiolate). */
    reapply() {
      if (!state.manifest || !state.look) return Promise.resolve(false);
      return applyLookAssets(state.look).then(() => true);
    },
    setLook(look) { look = lookId(look);
      if (!state.manifest) return Promise.resolve(false);
      // idempotence needs the COMPLETED and the REQUESTED look to agree:
      // comparing state.look alone let a setLook racing an opposite
      // in-flight load report done without dispatching (review major, #52).
      // GH-1202: and no room write of an apply in flight still staged — state.look is written before a staged bind lands, and done means
      // landed. A write that landed at once leaves roomTail null, so that path keeps the rule above
      if (state.ready && state.look === look && state.requestedLook === look && (state.appliedSeq === applySeq || !roomTail)) {
        return Promise.resolve(true);
      }
      return applyLookAssets(look).then(() => true);
    },
    /** Lighting-fixture change hook (issue #89, lightingvisuals.js): re-keys
     * the baked layers by (look, fixture) under the SAME race discipline as
     * setLook/tableChanged — an uncommitted fixture bake honesty-gates
     * inside applyLookAssets. No-op until load() resolved the manifest. */
    setFixture(fixture) {
      if (typeof fixture !== 'string' || !fixture) return Promise.resolve(false);
      if (state.fixture === fixture) return Promise.resolve(true);
      state.fixture = fixture;
      if (!state.manifest) return Promise.resolve(false); // load() reads it
      const look = state.requestedLook ?? state.look;
      if (look === null) return Promise.resolve(false);
      return applyLookAssets(look).then(() => true);
    },
    /** Brightness gain over the baked layers (issue #89): linear, applied
     * live — the bake itself never re-runs for brightness (truthfulness
     * law). Inert while uGiOn is 0 (uniform still written — harmless). */
    setGain(gain) {
      const g = Number(gain);
      if (!Number.isFinite(g) || g <= 0) return false;
      state.gain = g;
      shared.uGiIrr.value = (venueShading() ? 1.0 : 2.0) * g; // ORDER-LIGHT-9 Q3 (see applyLookAssets)
      if (state.roomBaked && state.room) {
        state.room.floor.material.lightMapIntensity = 1.0 * g;
      }
      return true;
    },
    /** ORDER-LAND-638-FIX3 (review r7 P2 #1): the degrade path turns the venue feature OFF at runtime — main's grid gain
     * (2.0 × brightness), no resting-ball SH block, and every ball material recompiled (its program cache key reads the
     * live switch → main's program text, no derived occlusion / weighted rect leg). Idempotent; `on` re-enables. */
    setVenueShading(on) {
      if (venueFlag && typeof venueFlag.setVenueShading === 'function') venueFlag.setVenueShading(on); // FIX6: the injected switch, if any
      const v = venueShading();
      shared.uGiIrr.value = (v ? 1.0 : 2.0) * state.gain;
      if (liveBalls) {
        for (const b of liveBalls) {
          const m = b.mesh && b.mesh.material; const sh = m && m.userData && m.userData.giSH;
          // ORDER-LIGHT-C2-FIX2 class A: disabling venue shading on an ALREADY-PLAYED table preserves the blocks main's own path sampled
          // (ballset.js syncSphereUniforms during a shot / layout / seek — the pre-fix zero left the stationary balls without their SH term until
          // the next move, because game.update() samples only in PLAYBACK). Only a cold boot — no main-path sampling yet — starts from zero:
          // a boot-time degrade still matches the ?venue=off frame (blocks 0). The uniform's gate (uGiOn × uGiBallOn) is untouched.
          if (sh && sh.value && typeof sh.value.fill === 'function' && !v && (!ballBlocksFromMain || degradeBlocksLegacy)) sh.value.fill(0);
          if (m) m.needsUpdate = true;
        }
        if (v && state.ready) updateBallProbes(liveBalls);
      }
      applyRig('venue'); // C2: the rig rule follows the switch (a degrade inside a studio window resumes main's behaviour at once; GH-1202 batch 2: the room's after the window)
      return v;
    },
    /** Active-table change hook (issue #52, class-keyed since GH-337):
     * scene/table.js rebuild() calls this (feature-detected +
     * optional-chained, cache-poison contract) so a live equipment switch
     * re-runs the class gate — 9-ft → snooker re-keys onto the snooker_12ft
     * bake, snooker → 9-ft restores the pool one, and a footprint with no
     * committed class drops to the honest pre-GI neutral. No-op until
     * load() resolved the manifest or while the class verdict is
     * unchanged. */
    tableChanged() {
      // re-dispatch with the REQUESTED look: state.look is written on
      // COMPLETION, so a table switch racing an in-flight look load would
      // otherwise start a HIGHER-seq apply carrying the previous look and
      // cancel the newest request — new scene, wrong GI (review major, #52)
      const look = state.requestedLook ?? state.look;
      if (!state.manifest || look === null) return Promise.resolve(false);
      // only trust the cached verdict when no apply is in flight — a switch
      // DURING an apply must re-dispatch or the in-flight apply lands its
      // stale verdict (review major, #52); when idle, state.look === the
      // requested look (the last-started apply completed carrying it)
      const idle = state.appliedSeq === applySeq;
      if (idle && state.ready && bakeClassFor(state.manifest) === state.bakeClass) {
        return Promise.resolve(true);
      }
      return applyLookAssets(look).then(() => true);
    },
    /** Bilinear SH-L2 irradiance at a table position → out Float32Array(27).
     * Returns false (leaves out untouched) until probes are loaded. */
    sampleSH(x, z, out) {
      if (!state.probes) return false;
      const g = state.probes.grid, c = state.probes.coeffs;
      const fx = Math.min(Math.max((x - g.x0) / g.dx, 0), g.nx - 1.001);
      const fz = Math.min(Math.max((z - g.z0) / g.dz, 0), g.nz - 1.001);
      const ix = Math.floor(fx), iz = Math.floor(fz);
      const tx = fx - ix, tz = fz - iz;
      const c00 = c[iz * g.nx + ix], c10 = c[iz * g.nx + ix + 1];
      const c01 = c[(iz + 1) * g.nx + ix], c11 = c[(iz + 1) * g.nx + ix + 1];
      for (let k = 0; k < 27; k++) {
        out[k] = (c00[k] * (1 - tx) + c10[k] * tx) * (1 - tz)
          + (c01[k] * (1 - tx) + c11[k] * tx) * tz;
      }
      return true;
    },
  };
  giActive.instance = api;
  return api;
}

/** Per-frame ball-probe update (called from app/ballset.js's uniform sync):
 * interpolates the SH grid at each PRESENTED ball's position into its
 * material's uGiSH coefficients. No-op until probes are loaded.
 * GH-626 (PR #633 review r8 P2): a ball resting on a modelled pocket closure
 * is `pocketed` AND on screen (game.js restRetained — the closure twin of the
 * netted ball). Skipping every pocketed ball left its probe at whatever the
 * material last sampled — the last pre-landing frame in continuous playback,
 * a bed position after a DVR scrub that jumped straight past touchdown, or
 * ZEROS on a ball set rebuilt by the Playback borrow/restore — so the rest's
 * ambient was history-dependent, which seek()'s random-access contract
 * forbids. A ball that is presented is sampled at where it is presented; a
 * hidden pocketed ball is still skipped. Netted balls are visible+pocketed
 * too, but their probe is gated off by the pose law (uGiBallOn = 0), so the
 * sample they now receive is multiplied by zero — byte-identical. */
export function updateBallProbes(balls, source) {
  const gi = giActive.instance;
  if (!gi || !gi.state.ready) return;
  if (source === 'main') ballBlocksFromMain = true; // C2-FIX2 A: sampled by main's own path with GI ready = a played table
  sampleBallBlocks(gi, balls);
}
/** Every presented ball's SH block sampled from `gi`'s grid (updateBallProbes' loop; GH-1202: also an apply whose bind is still staged) */
function sampleBallBlocks(gi, balls) {
  for (const b of balls) {
    const sh = b.mesh?.material?.userData?.giSH;
    if (!sh || (b.pocketed && !b.mesh.visible)) continue;
    gi.sampleSH(b.mesh.position.x, b.mesh.position.z, sh.value);
  }
}
