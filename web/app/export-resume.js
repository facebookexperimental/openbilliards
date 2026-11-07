// Copyright (c) Meta Platforms, Inc. and affiliates.

// export-resume.js — GH-362 layer 3: crash-grade resume for the FULL-GAME
// streaming export (rides the GH-305 v3 disk chunks; design note on the
// issue). The already-flushed chunks on the shell's disk ARE the
// checkpoints: if WebContent (or the whole app) dies mid-export, a
// relaunch finds the shell's `window.__obResume` hint (built from the
// sidecar manifest its writer maintained), matches it against the plan
// THIS module persisted at `begin`, and offers "continue export". The
// renderer is deterministic (renders are pure functions of the staged
// state), so the resume RE-RENDERS from frame 0 and this module's
// fast-forward wire DROPS every byte the disk already holds — while
// hashing the regenerated prefix and comparing it against the shell's
// hash of the on-disk bytes at the boundary. Byte-identity is the law
// that makes the drop safe at all; the hash check ENFORCES it at runtime
// (corrupt chunks, or a genuinely non-deterministic platform encoder,
// fail the resume honestly into a restart offer — never a spliced-corrupt
// file).
//
// LEAF module (the ownership ledger cache-poison contract): reached ONLY via a
// guarded dynamic import from playback.js (the v3 wire's one owner).
// ZERO static imports — the fnv1a here is a deliberate inline twin of
// offline-render's fnv1aBytes (and of ShellCore SaveVideoResume.fnv1aFold,
// unit-pinned there) rather than a new import edge.
//
// HERMETIC-BOOT LAW (issue #14, the archive.js pattern verbatim): scripted
// boots never touch IndexedDB; e2e opts back in with ?exportresume=1
// (carried across same-tab navigations via sessionStorage — a resume test
// IS a navigation). Storage failures degrade to a silent no-op: an
// unpersistable plan just means no resume offer after a crash.

export const RESUME_CAPABLE = true;

// GH-472 (ADDITIVE capability marker, the RESUME_CAPABLE shape): this leaf
// persists the kept-draft marker (persistPlan's third argument + loadPlan's
// `draft` field). A cached pre-472 copy ignores the argument silently — a
// fresh playback.js feature-detects this before promising that a truncation
// draft survives a reload (review GH-472 r2 P2; the in-session offer needs
// no new leaf API and stands either way).
export const DRAFT_CAPABLE = true;

// ---- FNV-1a 32 (the fnv1aBytes / SaveVideoResume twin) -----------------------
export const FNV_SEED = 0x811c9dc5;

/** Fold `bytes` into a running FNV-1a 32 state (chunked calls compose). */
export function fnv1aFold(state, bytes) {
  let h = state;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h;
}

/** 8-lowercase-hex rendering (the shared law across page and shell). */
export const fnv1aHex = (state) => (state >>> 0).toString(16).padStart(8, '0');

/** Plan hash: FNV-1a over the UTF-8 bytes of the EXACT persisted JSON
 * string — load re-hashes the loaded string, so storage corruption or a
 * foreign plan can never match the shell manifest's planHash. */
export function planHashOf(json) {
  return fnv1aHex(fnv1aFold(FNV_SEED, new TextEncoder().encode(json)));
}

// ---- the fast-forward wire (the byte-drop + boundary-hash law) ---------------
/**
 * Wrap a resumed stream around the flushed prefix: the re-render's APPEND
 * pieces below `extent` are hashed and DROPPED (the disk already holds
 * those bytes); a piece straddling the boundary posts only its tail; a
 * piece at/past the boundary posts whole. BACKPATCH pieces (position below
 * the append frontier — the muxers' finalize rewrites: mp4 mdat size/moov,
 * webm SeekHead/Duration) ALWAYS post, wherever they land: the original
 * run never finalized, so the disk holds placeholders there.
 *
 * When the hashed prefix reaches exactly `extent`, the accumulated hash
 * must equal the shell's `hash` of the on-disk prefix — a mismatch throws
 * 'resume-mismatch' (an Error whose short machine token fails the render
 * through the engine's own drainWire throw path; the caller offers the
 * honest restart). `verified()` reports whether the boundary check passed;
 * `progress()` (GH-1046, ADDITIVE) how much of the prefix the re-render
 * has hashed so far (0..1) — the resume banner's re-check step when the
 * manifest carries no usable frame anchor.
 *
 * RULED (review r5): the model hashes APPEND ORDER — a kill inside the
 * finalize drain (some backpatches already flushed into the prefix, `end`
 * never posted) leaves a disk prefix this sequential model cannot verify
 * in O(1) memory, and the attempt degrades to the honest restart offer at
 * the boundary. That window is the last few wire round-trips of an export
 * (finalize's own drain); trading it for a byte-buffer of the whole
 * prefix would reintroduce the exact accumulation class the streaming
 * mode exists to kill. Safe by construction either way: mismatch never
 * delivers.
 *
 * take(data, at) → array of {data, at} pieces to post (0 or 1 today).
 */
export function createFastForward({ extent, hash }) {
  let appendPos = 0; // the re-render's monotonic append frontier
  let hashed = 0;    // regenerated-prefix bytes hashed so far
  let h = FNV_SEED;
  let ok = extent === 0; // an empty prefix has nothing to verify
  const feed = (bytes) => {
    h = fnv1aFold(h, bytes);
    hashed += bytes.length;
    if (hashed === extent && !ok) {
      if (fnv1aHex(h) !== hash) {
        // the regenerated prefix is NOT the flushed prefix — resuming
        // would splice two different streams into one corrupt file
        throw new Error('resume-mismatch');
      }
      ok = true;
    }
  };
  return {
    verified: () => ok,
    progress: () => (extent > 0 ? Math.min(1, hashed / extent) : 1),
    take(data, at) {
      if (at < appendPos) return [{ data, at }]; // backpatch — always posts
      appendPos = at + data.length;
      if (appendPos <= extent) { // entirely inside the flushed prefix
        feed(data);
        return [];
      }
      if (at >= extent) return [{ data, at }]; // entirely past it
      const cut = extent - at; // straddles: hash the head, post the tail
      feed(data.subarray(0, cut));
      return [{ data: data.subarray(cut), at: extent }];
    },
  };
}

// ---- persisted resume plan (IndexedDB, hermetic-gated) -----------------------
const DB_NAME = 'ob-export-resume-v1';
const DB_VERSION = 1;
const STORE = 'plans';
const KEY = 'current';
// SINGLE-CLOCK LAW (review r14/r15/r18/r21, adjudicated): expiry belongs
// to the SHELL's 24 h manifest window ALONE. The page plan is a singleton
// row of pure data — it never self-expires, so the two clocks can never
// diverge (every earlier round's divergence class was the second clock's
// existence). No hint → no offer; the row is overwritten by every export
// and cleared on every terminal path, so the residue is one bounded row —
// the multi-GB debt (the partial) lives shell-side under the ONE window.

function armed() {
  try {
    const scripted = sessionStorage.getItem('ob-scripted') === '1';
    if (!scripted) return true;
    const q = new URLSearchParams(location.search);
    if (q.has('exportresume') && q.get('exportresume') !== '0') {
      sessionStorage.setItem('ob-exportresume-optin', '1');
      return true;
    }
    if (q.get('exportresume') === '0') {
      sessionStorage.removeItem('ob-exportresume-optin');
      return false;
    }
    return sessionStorage.getItem('ob-exportresume-optin') === '1';
  } catch { return false; }
}

function openDb() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch { resolve(null); return; }
    req.onupgradeneeded = () => {
      try { req.result.createObjectStore(STORE); } catch { /* races resolve below */ }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

async function tx(mode, run) {
  if (!armed()) return null;
  const db = await openDb();
  if (!db) return null;
  try {
    return await new Promise((resolve) => {
      let out = null;
      let t;
      try { t = db.transaction(STORE, mode); } catch { resolve(null); return; }
      t.oncomplete = () => resolve(out);
      t.onerror = () => resolve(null);
      t.onabort = () => resolve(null);
      const req = run(t.objectStore(STORE));
      if (req) req.onsuccess = () => { out = req.result ?? null; };
    });
  } finally {
    try { db.close(); } catch { /* already closed */ }
  }
}

/** Persist the in-flight export's resume plan: `json` is the canonical
 * plan string (records + serializable opts + name/mime/dest + kernel pin),
 * `hash` its planHashOf — the SAME hash riding every chunk op, so the
 * shell manifest and this store can be matched at relaunch.
 * `extra.draft` (GH-472, ADDITIVE): the kept-draft marker a truncation-
 * class delivery failure re-persists ({ got, want } — the honest deficit
 * the boot offer paints). The marker rides BESIDE the hashed json (hash
 * integrity unchanged); a plan without it is exactly the pre-472 row, and
 * a stale caller passing two arguments writes exactly that. */
export async function persistPlan(json, hash, extra) {
  const draft = extra?.draft;
  return tx('readwrite', (store) => store.put(
    { v: 1, json, hash, savedAt: Date.now(),
      ...(draft && Number.isFinite(draft.got) && Number.isFinite(draft.want)
        ? { draft: { got: draft.got, want: draft.want } } : {}) }, KEY));
}

/** The persisted plan, integrity-checked: the stored string must re-hash
 * to the stored hash — anything else reads as ABSENT. Freshness is NOT
 * judged here (the single-clock law above): the shell's manifest window
 * is the one expiry, and the offer path requires its hint — EXCEPT the
 * GH-472 kept-draft row, whose `draft` marker is itself the offer's
 * warrant (a truncation abort deleted the shell partial, so no hint can
 * exist; the restart-only draft is plan data alone). Returns
 * { json, hash, savedAt, draft } or null. */
export async function loadPlan() {
  const row = await tx('readonly', (store) => store.get(KEY));
  if (!row || row.v !== 1 || typeof row.json !== 'string'
    || typeof row.hash !== 'string') return null;
  if (planHashOf(row.json) !== row.hash) return null; // corrupt store
  const draft = row.draft && Number.isFinite(row.draft.got)
    && Number.isFinite(row.draft.want)
    ? { got: row.draft.got, want: row.draft.want } : null;
  return { json: row.json, hash: row.hash, savedAt: row.savedAt, draft };
}

/** Drop the persisted plan (export delivered / aborted / discarded). */
export async function clearPlan() {
  return tx('readwrite', (store) => store.delete(KEY));
}

/** Compare-and-delete in ONE readwrite transaction (review r13 P2): a
 * Discard racing a fresh export's persistPlan must never delete the NEW
 * plan — the delete commits only if the stored hash still matches. */
export async function clearPlanIf(hash) {
  return tx('readwrite', (store) => {
    const get = store.get(KEY);
    // chained INSIDE this transaction (returning the request would let
    // tx() overwrite this handler with its result plumbing)
    get.onsuccess = () => {
      if (get.result && get.result.hash === hash) store.delete(KEY);
    };
    return null; // the transaction's completion is the signal
  });
}
