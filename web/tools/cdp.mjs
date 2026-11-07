// Copyright (c) Meta Platforms, Inc. and affiliates.

// cdp.mjs — minimal Chrome DevTools Protocol client over node's built-in
// WebSocket (no npm deps). Used by e2e.mjs to drive the app headlessly.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- process birth tokens (GH-1143) -------------------------------------------
// ps prints lstart in the caller's locale ('Thu Oct 15 01:36:41 2026' under C and
// en_US, 'jeu. 15 oct. 01:36:41 2026' under fr_FR, '四 10月/15 01:36:41 2026' under
// zh_CN). The band registry stores that string as a process's birth token
// (owner.json, lease and reaper tokens, server markers) and compares it across
// processes, so a writer and a reader in different locales read one live process
// as pid reuse; the fixed-width (24-char asctime) row parsers misread every non-C
// row. Every lstart read runs ps in the C locale (psEnv). A command column is NOT
// read in C: macOS ps then vis-encodes non-ASCII bytes ('é' as 'M-CM-)') and a
// UTF-8 docroot would never match, so a command and an lstart that must both be
// judged are read in two calls (serverGroupProbe, e2e-retry). A recorded token that
// is not in C form (written before GH-1143, or by an older checkout, in another
// locale) is no verdict for NON_C_TOKEN_GRACE_MS after it was written (its 'at'):
// it never reads as pid reuse; past that it is read as a mismatch, so a pre-fix
// token can never hold a band for good. (lstart is printed in local time: a writer
// and a reader in different time zones still disagree; every lane and the runner
// share this host's zone.)
export const psEnv = () => ({ ...process.env, LC_ALL: 'C', LANG: 'C' });
const C_LSTART = /^[A-Z][a-z]{2} [A-Z][a-z]{2} [ \d]\d \d\d:\d\d:\d\d \d{4}$/;
export const comparableLstart = (t) => typeof t === 'string' && C_LSTART.test(t);
export const NON_C_TOKEN_GRACE_MS = 24 * 3600 * 1000;
/** A recorded token that is not in C form is still inside its grace (its 'at'). */
const nonCTokenYoung = (token) => Number.isFinite(token?.at) && Date.now() - token.at < NON_C_TOKEN_GRACE_MS;
/** A recorded token ({ lstart, at }) and a fresh reading disagree: the pid was reused.
 * A transient ps failure ('') is no verdict (false); so is a token that is not in C
 * form while it is younger than NON_C_TOKEN_GRACE_MS. */
const lstartMismatch = (now, token) => {
  if (!now || !token?.lstart) return false;
  if (comparableLstart(token.lstart)) return now !== token.lstart;
  return !nonCTokenYoung(token);
};

// ---- pinned chrome-headless-shell resolution (GH-294) -----------------------
// The headless battery runs on chrome-headless-shell (Chrome for Testing),
// NEVER the installed /Applications/Google Chrome.app: every headless boot of
// the installed app REGISTERS with LaunchServices under
// bundleID com.google.Chrome (verified 2026-07-31: `lsappinfo` shows a
// type="BackgroundOnly" com.google.Chrome ASN per headless instance), so with
// the real Chrome closed, clicking the Dock icon "activates" a windowless
// headless instance and the browser looks bricked. The shell binary carries
// bundleID [NULL] / type="UIElement" — LaunchServices can never route the
// Dock icon to it — and its version is PINNED in-repo instead of drifting
// with the desktop Chrome. Resolution order:
//   1. CHROME_BIN (explicit override — ubuntu CI's /usr/bin/google-chrome,
//      ios.yml's hosted-mac stock Chrome, the coarse-pointer wrapper-script
//      fallback documented in touch-cdp.mjs);
//   2. the version pinned in web/tools/chrome-shell.pin, looked up in the
//      puppeteer cache (PUPPETEER_CACHE_DIR ?? ~/.cache/puppeteer — the
//      binary lives OUTSIDE the repo and is never committed);
//   3. NO fallback: a missing shell throws the one-line install command.
//      Falling back to the installed app IS the LaunchServices bug, and a
//      silent mid-gate `npx` fetch would inject surprise network into gates.
const SHELL_PIN_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), 'chrome-shell.pin');

export function chromeShellPin() {
  return fs.readFileSync(SHELL_PIN_FILE, 'utf8').trim();
}

/** The cache root the resolver searches — PUPPETEER_CACHE_DIR wins. */
export function chromeShellCacheDir() {
  return process.env.PUPPETEER_CACHE_DIR
    ?? path.join(os.homedir(), '.cache', 'puppeteer');
}

export function chromeShellInstallCommand(version = chromeShellPin()) {
  // the emitted --path must be the SAME cache the resolver searches (review
  // r1 P2): with PUPPETEER_CACHE_DIR set, an install into the $HOME default
  // would leave resolution failing in the same environment.
  const cache = process.env.PUPPETEER_CACHE_DIR ?? '$HOME/.cache/puppeteer';
  return 'npx @puppeteer/browsers install '
    + `chrome-headless-shell@${version} --path "${cache}"`;
}

/** Locate the pinned chrome-headless-shell (CHROME_BIN wins; see the header
 * above). Exported for the scenario tools, the CI preflight step and
 * tools/demo/make-assets.sh's sh reimplementation. Throws — loudly, with the
 * verbatim one-time install command — when the pinned shell is absent. */
export function resolveChromeShell() {
  if (process.env.CHROME_BIN) {
    return { bin: process.env.CHROME_BIN, source: 'CHROME_BIN' };
  }
  const version = chromeShellPin();
  const cacheRoot = chromeShellCacheDir();
  // @puppeteer/browsers cache layout: <cache>/chrome-headless-shell/
  //   <platform>-<version>/chrome-headless-shell-<platform-dir>/<exe>
  const platform = process.platform === 'darwin'
    ? (process.arch === 'arm64' ? 'mac_arm' : 'mac')
    : process.platform === 'win32'
      ? (process.arch === 'x64' ? 'win64' : 'win32')
      : 'linux';
  const dirFor = { mac_arm: 'mac-arm64', mac: 'mac-x64', linux: 'linux64',
    win64: 'win64', win32: 'win32' }[platform];
  const bin = path.join(cacheRoot, 'chrome-headless-shell',
    `${platform}-${version}`, `chrome-headless-shell-${dirFor}`,
    process.platform === 'win32'
      ? 'chrome-headless-shell.exe' : 'chrome-headless-shell');
  if (!fs.existsSync(bin)) {
    throw new Error(`chrome-headless-shell ${version} (web/tools/`
      + 'chrome-shell.pin) is not installed on this machine. Install it once '
      + `with:\n  ${chromeShellInstallCommand(version)}\nThere is NO fallback `
      + 'to the installed Chrome app — headless boots of the app register '
      + 'with LaunchServices and hijack the Dock icon (GH-294).');
  }
  return { bin, source: 'pin', version };
}

/** The launch binary for one session. headless:false is a REAL vsynced
 * window (perf-aim.mjs --headed jank forensics) that the shell build cannot
 * present, so — and only there — the installed app remains the default.
 *
 * WRAPPER CONTRACT (review r3 P2 ×2): a CHROME_BIN wrapper script (the
 * touch-cdp.mjs coarse-pointer fallback) MUST `exec` its browser — the
 * tracked pid is the kill/cleanup identity, and a non-exec wrapper would
 * leave the real browser alive past every tracked-pid teardown. A wrapper
 * around the SHELL is classified non-shell by the basename check (so it
 * would lose the darwin Metal/WebShare parity flags) unless it either keeps
 * 'chrome-headless-shell' in its filename or sets OB_CHROME_SHELL=1
 * (OB_CHROME_SHELL=0 forces the reverse for a full-Chrome binary with a
 * confusing name). */
function resolveChromeBinary({ headless }) {
  if (!headless) {
    const bin = process.env.CHROME_BIN
      ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    return { bin, isShell: false };
  }
  const { bin } = resolveChromeShell();
  const isShell = process.env.OB_CHROME_SHELL === '1' ? true
    : process.env.OB_CHROME_SHELL === '0' ? false
      : path.basename(bin).startsWith('chrome-headless-shell');
  return { bin, isShell };
}

// ---- served-tree preflight (GH-248) -----------------------------------------
// Every browser gate self-serves THIS checkout's web/ over a throwaway
// `python3 -m http.server -d <web> <port>` spawned with stdio:'ignore' — which
// swallows python's "OSError: [Errno 48] Address already in use" — sleeps, and
// then trusts whatever answers the port. Two silent failure modes came out of
// the 2026-07-28 investigation:
//
//   • an INCOMPLETE tree. `git archive <ref> web | tar -x` extracts the web/
//     subtree ONLY, so `web/tools/render` (a symlink to the repo-root
//     tools/render) dangles: /tools/render/grade.json 404s, the app's
//     loadGrade() throws (web/app/offline-render.js:138) and e2e-playback arm
//     3c reported THREE arm FAILs that read exactly like a physics/UI
//     regression on main. ~2.5 agent-hours went into proving main was clean.
//   • a PORT COLLISION. Many lanes run concurrently on this box; a spawn that
//     lost the race dies unheard and the gate reports PASS/FAIL about ANOTHER
//     lane's tree — code it never loaded. Worse than a crash.
//
// So before Chrome is spawned, probe the origin the page is about to load.
// EXISTENCE probes encode "this must be a complete web/ checkout" (zero false
// positives: both files ship on every ref). IDENTITY probes byte-compare the
// served copy against this checkout's own file — best effort by construction
// (two lanes whose probe files are identical are indistinguishable, and that
// is fine: their answers would be identical too). The gate script itself is
// the third probe precisely because it is the file a lane touching that gate
// modifies, so a cross-lane collision usually shows up there.
const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** the running gate's own path inside web/, as a served-tree-relative URL
 * path — 'tools/e2e-playback.mjs' — or null when the entry script lives
 * outside this checkout's web/ (a wrapper, `node -e`, a foreign tool). */
function gateProbe() {
  const entry = process.argv[1];
  if (!entry) return null;
  const abs = path.resolve(process.cwd(), entry);
  if (!abs.startsWith(WEB_DIR + path.sep)) return null;
  return path.relative(WEB_DIR, abs).split(path.sep).join('/');
}

/** Best-effort reap of the static server THIS process spawned on `port`, used
 * only on a preflight throw (review r1 P2): the gates spawn
 * `python3 -m http.server` and reach their own `server.kill()` only AFTER
 * launchChrome returns, so a new pre-launch failure path would leave the port
 * bound and poison the next run — the exact confusion this preflight exists to
 * end. Scope is deliberately narrow and marker-verified: DIRECT children of
 * this node process (pgrep -P) whose command line contains BOTH 'http.server'
 * and this port. No Chrome, no other lane's process, nothing of the owner's can
 * match. */
function reapOwnServer(port) {
  if (!port) return; // no port in the URL: no pattern narrow enough to be safe
  const kidsOf = (pid) => {
    try {
      return execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
        .split('\n').filter(Boolean);
    } catch { return []; } // no children / no pgrep
  };
  // Collect the whole descendant set BEFORE killing anything: `python3` is a
  // wrapper on this box and the LISTENING socket is held by its own child, so
  // killing the direct child first would reparent (and hide) the process that
  // actually owns the port — measured: the first cut of this reaper killed the
  // wrapper and left :8701 bound by the grandchild.
  const seen = [];
  for (let frontier = kidsOf(process.pid), depth = 0;
    frontier.length && depth < 4; depth++) {
    seen.push(...frontier);
    frontier = frontier.flatMap(kidsOf);
  }
  for (const pid of seen) {
    let cmd = '';
    try {
      cmd = execFileSync('ps', ['-o', 'command=', '-p', pid], { encoding: 'utf8' });
    } catch { continue; }
    if (!cmd.includes('http.server') || !new RegExp(`\\b${port}\\b`).test(cmd)) continue;
    try {
      process.kill(Number(pid), 'SIGKILL'); // a static file server has no state
      console.error(`[preflight] reaped this run's http.server (pid ${pid}) so `
        + `:${port} is not left bound`);
    } catch { /* already gone */ }
  }
}

/** The freshest CDP-RTT canary verdict available to this process (GH-410):
 * run-gate keeps OB_GATE_RTT_FILE fresh from its mid-run belt (the GH-347
 * 30 s sampling cadence), so a suite's mid-battery relaunches see the storm
 * as it evolves; the spawn-time OB_GATE_RTT_P50_MS snapshot is the
 * fallback; null = no verdict (bare suite runs — the escalation ladder in
 * preflightServedTree still covers them). */
function stormRttP50() {
  const f = process.env.OB_GATE_RTT_FILE;
  if (f) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8'));
      if (Number.isFinite(j?.p50) && Number.isFinite(j?.at)
        && Date.now() - j.at < 300000) return j.p50;
    } catch { /* torn/absent: the env snapshot decides */ }
  }
  const p = Number(process.env.OB_GATE_RTT_P50_MS);
  return Number.isFinite(p) && p >= 0 ? p : null;
}

// One clock owns readiness, mount discovery and complete identity responses.
// A stage gets its own retry ladder; changing stages never restarts the clock.
function preflightClock(fetchImpl = fetch) {
  const envBudget = Number(process.env.OB_CDP_PREFLIGHT_MS);
  const explicitBudget = Number.isFinite(envBudget) && envBudget > 0;
  const budgetMs = explicitBudget ? envBudget : 15000;
  const rtt = stormRttP50();
  const stormScale = rtt !== null && rtt > 100 ? Math.min(8, rtt / 100) : 1;
  const baseWindowMs = Math.round(2000 * stormScale);
  const starveCapMs = explicitBudget ? budgetMs
    : Math.max(budgetMs, Math.round(60000 * Math.min(2, stormScale)));
  const t0 = Date.now();
  const cap = t0 + starveCapMs;
  const starvedTarget = new Map();
  const anyUnresolvedStarvation = () => [...starvedTarget.values()].some(Boolean);
  const isTimeout = (e) => e?.name === 'TimeoutError' || e?.name === 'AbortError'
    || e?.cause?.name === 'TimeoutError' || e?.cause?.name === 'AbortError';
  let lastStarveResolveAt = null;
  const deadline = () => {
    const base = t0 + (anyUnresolvedStarvation() ? starveCapMs : budgetMs);
    // Only a response resolving starvation earns fresh judging room. Prompt
    // 404s and ordinary progress cannot extend the clock (GH-410 r20/r21/r23).
    if (explicitBudget || lastStarveResolveAt === null) return Math.min(base, cap);
    return Math.min(Math.max(base, lastStarveResolveAt + 2 * baseWindowMs + 2000), cap);
  };
  const retry = () => sleep(Math.max(0, Math.min(250, deadline() - Date.now())));
  const stage = (origin, readiness = false) => {
    let starveTimeouts = 0;
    let lastWindowMs = 0;
    const attemptMs = () => {
      // Main's ladder and default full-window floor remain. Every attempt is
      // also bounded by the shared absolute cap; explicit budgets have no
      // full-window or fixed-four exemption (FIX13/14, GH-410 r24-r27).
      const esc = Math.min(20000,
        baseWindowMs * 2 ** Math.min(3, Math.floor(starveTimeouts / 2)));
      const floor = explicitBudget || readiness ? 1 : baseWindowMs;
      return Math.max(1, Math.min(cap - Date.now(),
        Math.max(floor, Math.min(esc, deadline() - Date.now()))));
    };
    const get = async (p, readBody = false) => {
      const w = lastWindowMs = attemptMs();
      const gt0 = Date.now();
      let response = null, served = null, error = null;
      try {
        response = await fetchImpl(new URL(p, origin), {
          signal: AbortSignal.timeout(w),
          ...(readiness ? { cache: 'no-store', redirect: 'manual' } : {}),
        });
        if (readBody && response.ok) {
          // Main's body-starvation retry uses the SAME signal as the headers.
          // Resolve the target only when the complete response has landed.
          served = Buffer.from(await response.arrayBuffer());
        } else response.body?.cancel().catch(() => {});
        if (starvedTarget.get(p) === true) lastStarveResolveAt = Date.now();
        starvedTarget.set(p, false);
      } catch (e) {
        error = e;
        if (isTimeout(e)) {
          // A short final timeout cannot replace prior refusal evidence.
          // An unseen target or a stalled 200 body IS starvation evidence
          // (GH-410 r14/r17); header and body failures use this one path.
          if ((response?.ok && readBody) || w >= baseWindowMs || !starvedTarget.has(p)) {
            starveTimeouts++;
            starvedTarget.set(p, true);
          }
        } else starvedTarget.set(p, false);
      }
      if (process.env.OB_PREFLIGHT_TRACE === '1') {
        console.error(`[${readiness ? 'http-readiness' : 'pf-trace'}] ${p} -> `
          + (error ? `ERR ${error?.name}/${error?.cause?.name ?? error?.cause?.code ?? ''}`
            : response.status)
          + ` in ${Date.now() - gt0}ms (w=${w}${readBody ? ', body' : ''})`);
      }
      return { response, served, error };
    };
    // #1229: worded from what the preflight saw (timeouts, no answer), never "accepted connections": on macOS a connect
    // to a socket that is bound but not listening times out instead of being refused, so a server stuck between bind()
    // and listen() (python's host-name lookup, #1228) starves the preflight exactly as a starved host does. The phrases
    // 'no HTTP answer arrived', 'I/O-STARVED host' and 'NOT a tree verdict' are matched by e2e-retry's infra classes and
    // by tools/render callers: keep them.
    const starvedDiagnosis = (what, port) => `served-tree preflight: ${what} — no HTTP `
      + `answer arrived from :${port} in ${Date.now() - t0} ms (${starveTimeouts} `
      + 'timed-out attempt(s), windows escalated to '
      + `${lastWindowMs} ms). Timeouts, not refusals: a server that has bound `
      + 'but not yet reached listen() (python\'s http.server resolves the host\'s '
      + 'own name between bind() and listen(), #1228), an I/O-STARVED host '
      + '(syspolicyd storm) or a wedged listener — NOT a tree verdict: a timeout '
      + 'alone never diagnoses the served tree. OB_CDP_PREFLIGHT_MS raises the '
      + 'budget (GH-248, GH-410).';
    return { get, starvedDiagnosis };
  };
  const unboundDiagnosis = (at, port) => `served-tree preflight: nothing answers ${at}`
    + ` within ${budgetMs} ms — the static server never bound :${port}. A `
    + "`python3 -m http.server` spawned with stdio:'ignore' hides "
    + '"Address already in use", so a lost port looks like silence (GH-248).';
  return { explicitBudget, budgetMs, t0, starveCapMs, starvedTarget,
    anyUnresolvedStarvation, isTimeout, deadline, retry, stage, unboundDiagnosis };
}

/** Confirm HTTP headers before any identity opt-out. Any status proves
 * readiness; only preflightServedTree judges required files and their bytes. */
export async function waitForHttpReadiness(url, fetchImpl = fetch, clock = preflightClock(fetchImpl)) {
  let u;
  try { u = new URL(url); } catch { return; }
  if (!/^https?:$/.test(u.protocol)) return;
  const root = new URL('.', u);
  const { get, starvedDiagnosis } = clock.stage(root.origin, true);
  let lastError;
  while (Date.now() < clock.deadline()) {
    const { response, error } = await get(root.href);
    if (response && !error) return { root_url: root.href, status: response.status };
    lastError = error;
    await clock.retry();
  }
  if (LOOPBACK.has(root.hostname)) reapOwnServer(root.port);
  throw new Error(clock.starvedTarget.get(root.href) === true
    ? starvedDiagnosis(`nothing answered ${root.href}`, root.port)
    : clock.unboundDiagnosis(new URL('app.html', root).href, root.port), { cause: lastError });
}


/** Verify the loopback origin `url` points at is served by a COMPLETE copy of
 * this checkout's web/. Resolves (silently) on success or on a URL this cannot
 * judge; throws a diagnosis naming the cause otherwise. Called by
 * launchChrome, so every browser gate inherits it — pass `preflight: false`
 * (or set OB_SKIP_TREE_PREFLIGHT=1) for a deliberately foreign tree.
 * GH-489 SNK-R35 (review r9 P2 A — one reader of served-tree identity): `webDir`
 * names the tree the caller MEANS to serve (a gate run against a git archive
 * passes its --web); the served files are byte-compared with that tree instead
 * of this checkout's web/, so a port already answered by ANOTHER revision is
 * refused by name whatever the caller's own spawn did. Default = this checkout.
 * HTTP readiness (waitForHttpReadiness, one shared preflight clock) remains mandatory whatever the identity setting. */
export async function preflightServedTree(url, { webDir } = {}) {
  const clock = preflightClock();
  await waitForHttpReadiness(url, fetch, clock);
  if (process.env.OB_SKIP_TREE_PREFLIGHT === '1') return;
  const REF = webDir ? path.resolve(String(webDir)) : WEB_DIR;
  let u;
  try { u = new URL(url); } catch { return; }
  if (!/^https?:$/.test(u.protocol) || !LOOPBACK.has(u.hostname)) return;
  // WALL-CLOCK budget, not an attempt count (review r2 P2): a stale listener
  // that accepts TCP and never answers burns the whole per-attempt timeout, so
  // an attempt count silently becomes minutes. A loopback static server answers
  // in milliseconds — 2 s per attempt is already generous — and the total is
  // bounded by OB_CDP_PREFLIGHT_MS (default 15 s) whatever happens per attempt.
  //
  // GH-410 (the lane-T build-17 mid-suite kills): a FIXED 2 s attempt window
  // read a healthy-but-I/O-starved server as dead under syspolicyd storms —
  // every attempt aborted before the (correct) answer could arrive, and at
  // budget exhaustion the preflight killed the run with a served-tree
  // diagnosis it had no response evidence for. Three laws now:
  //   • the attempt window is STORM-AWARE: its floor scales with the same
  //     CDP-RTT canary the GH-347 ledger machinery measures (stormRttP50
  //     above), and it ESCALATES monotonically as timeouts are observed —
  //     a late 2xx must be OBSERVABLE, or 'slow' and 'dead' are
  //     indistinguishable by construction;
  //   • a TIMEOUT alone never produces a tree verdict: once starvation
  //     evidence exists (an attempt that held the connection past its
  //     window), the deadline extends to a bounded starvation cap and the
  //     terminal diagnosis names the STARVED HOST, never the tree;
  //   • tree verdicts stay EVIDENCE-BASED and prompt: a genuinely wrong
  //     tree ANSWERS (timely 2xx/404 with the wrong bytes) and is refused
  //     on that response, exactly as before.
  // OB_CDP_PREFLIGHT_MS stays the override and, when set, is BOTH budget
  // and starvation cap — an explicit budget is a deliberate ceiling.
  const {explicitBudget, budgetMs, t0, starveCapMs, starvedTarget,
    anyUnresolvedStarvation, isTimeout, deadline, retry} = clock;
  const identity = clock.stage(u.origin);
  const get = identity.get;
  const die = (msg) => { reapOwnServer(u.port); throw new Error(msg); };
  const starvedDiagnosis = (what) => identity.starvedDiagnosis(what, u.port);
  // ---- where is web/ mounted on this origin? Two SUPPORTED layouts (review r1
  // P2): web/-rooted (`-d web`, the gates → /app.html) and repo-rooted (`-d .`,
  // record.mjs's server REUSE path + the help-overlay lanes → /web/app.html).
  // Probe the booted document's own directory first, then the origin root; the
  // first that answers app.html defines the base every probe is resolved
  // against. The retry loop doubles as the "is the server up" wait every gate
  // fakes with a fixed `await sleep(700)` — a loaded box (parallel lanes) can
  // miss that window outright — and stops the moment SOMETHING answers, so a
  // wrong-tree diagnosis stays fast instead of waiting out the whole budget.
  // '/web' is listed explicitly, not just inferred from the URL, because
  // launchPhone (touch-cdp.mjs) boots the neutral ORIGIN ROOT and only then
  // navigates to the real app URL — so on a repo-rooted serve the booted
  // document says nothing about the mount (review r2 P2:
  // the internal help-overlay lane-B evidence driver, arm r1, is exactly this).
  const dir = u.pathname.replace(/\/[^/]*$/, '');
  const bases = [...new Set([dir, '', '/web'])];
  let base = null;
  let answered = null;
  for (let n = 0; base === null; n++) {
    if (n) await retry();
    if (Date.now() > deadline()) break;
    // a non-OK answer does NOT end the wait (GH-245 battery, measured on the
    // loaded ci-host host at load ~40): the tool's OWN python server can
    // bind BETWEEN two probes of the same iteration — '' refused, then
    // '/web' answers 404 from the just-bound web/-rooted serve — so dying on
    // the first status turned a healthy boot into a 1-in-2 preflight red.
    // Only the BUDGET decides; the trade is that a genuinely wrong tree now
    // takes the full budget to diagnose instead of one round-trip.
    for (const b of bases) {
      // an EXPLICIT budget is a hard wall-clock ceiling (review r24 P2),
      // and the ABSOLUTE starvation cap walls the default path too (review
      // r27 P2: a multi-base URL must not append full-window attempts on
      // the remaining bases once the cap has expired)
      if ((explicitBudget && Date.now() > deadline())
        || Date.now() > t0 + starveCapMs) break;
      const { response: r, error } = await get(`${b}/app.html`);
      if (!r || error) continue; // not bound yet
      if (r.ok) {
        // a 2xx may only COMMIT while no HIGHER-priority mount candidate
        // is an unresolved starvation question (review GH-410 r2 P2 — the
        // split-listener shadow: the boot URL's own mount can be starved
        // while a foreign listener answers 200 on another mount; judging
        // the wrong one passes or refuses the wrong tree). The escalating
        // windows keep retrying the starved candidate; it either answers
        // (and the priority order decides) or the starvation cap names
        // the starved host.
        const blocked = bases.slice(0, bases.indexOf(b)).some((prev) =>
          starvedTarget.get(`${prev}/app.html`) === true);
        if (!blocked) {
          base = b;
          // the DISCARDED candidates' starvation questions are moot once
          // a base commits (review r22 P2): their stale flags must not
          // stretch the probe phase's deadlines to the starvation cap
          // when the selected mount then fails promptly
          for (const other of bases) {
            if (other !== b) starvedTarget.delete(`${other}/app.html`);
          }
          break;
        }
        answered = `${u.origin}${b}/app.html -> 200 (uncommitted: a `
          + 'higher-priority mount candidate is starved)';
        continue;
      }
      answered = `${u.origin}${b}/app.html -> ${r.status}`;
    }
  }
  if (base === null && answered === null) {
    // discriminate SILENT (connection refused for the whole budget — the
    // server truly never bound, the honest GH-248 verdict, still prompt)
    // from STARVED (something held our connections past every escalated
    // window — no tree verdict exists in that evidence) (GH-410).
    if (anyUnresolvedStarvation()) die(starvedDiagnosis(
      `nothing answered ${u.origin}${bases[0]}/app.html`));
    die(`served-tree preflight: nothing answers ${u.origin}${bases[0]}/app.html`
      + ` within ${budgetMs} ms — the static server never bound :${u.port}. A `
      + "`python3 -m http.server` spawned with stdio:'ignore' hides "
      + '"Address already in use", so a lost port looks like silence (GH-248).');
  }
  if (base === null) {
    // a fast 404 from ONE mount must not launder an UNRESOLVED starvation
    // question on another (review GH-410 r1 P1): while any candidate's
    // latest attempt was a timeout, the correct-but-starved mount may
    // simply not have answered yet — no tree verdict exists in that
    // evidence, so the starved host is named instead.
    if (anyUnresolvedStarvation()) {
      die(starvedDiagnosis(`only ${answered} ever answered while another `
        + 'mount candidate stayed starved'));
    }
    die(`served-tree preflight: ${answered} — :${u.port} is listening but is`
      + ` NOT serving an app tree (expected ${REF} at ${bases.join(' or ')}).`
      + ' Another lane or a stale server owns the port, or the boot URL points'
      + ' outside the served tree. Deliberately serving a non-app tree? pass'
      + ' `preflight: false` or set OB_SKIP_TREE_PREFLIGHT=1 (GH-248).');
  }
  // app.html + tools/render/grade.json are MANDATORY on every ref, so they are
  // probed unconditionally — never skipped because the local copy is missing
  // (a missing local grade.json IS the dangling-symlink defect, and the gate
  // that serves such a tree is the one this preflight must stop).
  // GH-489 SNK-R35 (refuter 1): in requested-tree mode (`webDir` given) the served
  // sw.js is compared too — its VERSION line hashes every precached byte, so it
  // is the tree's own NAME, while app.html and grade.json are byte-identical
  // across sibling revisions (measured: the lane's last five seals share both).
  // The default (this checkout) path keeps its probe list, byte-identical.
  const probes = ['app.html', 'tools/render/grade.json', ...(webDir ? ['sw.js'] : []), gateProbe()]
    .filter(Boolean);
  for (const rel of probes) {
    const at = `${u.origin}${base}/${rel}`;
    const localPath = path.join(REF, rel);
    let res = null;
    let served = null;
    let bodyErr = null;
    // headers AND body inside ONE bounded retry (GH-248 family, measured
    // 2026-08-02 on the load-40 host): python's single-threaded http.server
    // can answer 200 and then stall the BODY past the fetch timeout while a
    // sibling Chrome streams modules through the same accept queue — the
    // old shape read the body OUTSIDE the retry loop, so one transient
    // wedge killed a whole mid-battery gate. Only a body that fails every
    // retry is a dead server.
    // GH-313 (GH-318 residual C5.3): the retry loop extends to the SAME
    // OB_CDP_PREFLIGHT_MS wall-clock budget that bounds the base discovery
    // above (was a fixed 4 attempts — on the load>=50 runner the body fetch
    // starved past all four while the server was merely slow, not dead).
    // The fixed 4 stay as the floor so a budget already spent on discovery
    // never shrinks a probe below its pre-313 window.
    // the fixed-4 floor protects DEFAULT-budget probes from a discovery-
    // consumed clock (the pre-313 window); an EXPLICIT budget is a hard
    // ceiling that outranks it (review r24 P2), and the ABSOLUTE starvation
    // cap walls everyone — the floor must not append full-window retries
    // past the advertised bound (review r26 P2)
    for (let n = 0; !served && Date.now() <= t0 + starveCapMs
      && ((!explicitBudget && n < 4) || Date.now() <= deadline()); n++) {
      if (n) await retry();
      if ((explicitBudget && Date.now() >= deadline()) || Date.now() >= t0 + starveCapMs) break;
      const result = await get(`${base}/${rel}`, true);
      if (result.response) res = result.response;
      if (result.error) { bodyErr = result.error; continue; }
      if (res && !res.ok) break;
      served = result.served;
    }
    if (!res) {
      // starved attempts are not death evidence (GH-410): the old "died
      // under us" verdict now requires THIS TARGET's silence to be
      // timeout-free (review r13 P2 — a resolved earlier timeout on another
      // path must not relabel a dead server as starved)
      if (starvedTarget.get(`${base}/${rel}`) === true) {
        die(starvedDiagnosis(`${at} never answered`));
      }
      die(`served-tree preflight: ${at} stopped answering mid-preflight —`
        + ` the static server on :${u.port} died under us (GH-248).`);
    }
    if (!res.ok) {
      // two DIFFERENT diagnoses share this status, told apart by whether the
      // file exists here: our tree is incomplete, or the port is not ours.
      die(`served-tree preflight: ${at} -> ${res.status}`
        + ` (expected from ${REF}). ` + (fs.existsSync(localPath)
          ? `The requested tree HAS ${rel}, so :${u.port} is served by some OTHER`
          + ' tree — a stale http.server from an earlier run, or a concurrent'
          + ' lane. Reap it or pick a free --port/OB_E2E_PORT.'
          : 'web/tools/render is a SYMLINK to the repo-root tools/render, so'
          + ' serve a FULL checkout, not a `git archive web` extract — in a'
          + " web/-only subtree that symlink dangles, the app's loadGrade()"
          + ' throws, and the gate reports arm FAILs that look exactly like a'
          + ' real regression.') + ' (GH-248, GH-247)');
    }
    if (!served) {
      // 200 headers then a stalled/reset body on EVERY retry: routed through
      // die() so the run's own server is still reaped (review r3 P2). A body
      // that STALLED (vs reset) is starvation evidence, named as such
      // (GH-410) — judged by the target's CURRENT state, not the stale
      // bodyErr alone (review r16 P2: a body timeout followed by refusals
      // is a dead server, and the refusals already resolved the target).
      if (isTimeout(bodyErr)
        && starvedTarget.get(`${base}/${rel}`) === true) {
        die(starvedDiagnosis(`${at} answered 200 but its body stalled`));
      }
      die(`served-tree preflight: ${at} answered 200 but its body failed`
        + ` (${bodyErr?.message}) — the server on :${u.port} is not healthy (GH-248).`);
    }
    // served 200 for a file this checkout does NOT have: the answering tree is
    // not ours (or ours is the incomplete one) — either way the gate would
    // judge bytes it never shipped.
    const local = fs.existsSync(localPath) ? fs.readFileSync(localPath) : null;
    if (!local || !served.equals(local)) {
      die(`served-tree preflight: ${at} differs from the requested tree's copy`
        + ` (served ${served.length} B, local`
        + ` ${local ? local.length + ' B' : 'ABSENT'}) — :${u.port} is`
        + ` answering from ANOTHER tree. Expected ${REF}. A concurrent lane`
        + " owns the port (the http.server spawn died unheard under"
        + " stdio:'ignore'), so this gate would judge code it never loaded:"
        + ' pick a free --port/OB_E2E_PORT. Serving a foreign tree on purpose?'
        + ' `preflight: false` or OB_SKIP_TREE_PREFLIGHT=1 (GH-248).');
    }
  }
}

/** Stamp `obtool=1` onto a tool-boot URL (before any #fragment). The app
 * pins scripted boots to the pre-perf-wave visual defaults — classic green
 * look + full 'cinema' shader tier — so every committed capture, fixture,
 * and offline render stays bit-comparable while INTERACTIVE boots default
 * to the SP look + fast live shader tier. Explicit ?look=/?cinema= in the
 * caller's URL still win (main.js reads them first). */
function withToolParam(url) {
  const [base, hash] = url.split('#');
  if (/[?&]obtool=/.test(base)) return url; // pre-fragment only: a '?obtool='
  // inside the #fragment must not suppress the real query stamp
  return base + (base.includes('?') ? '&' : '?') + 'obtool=1'
    + (hash !== undefined ? '#' + hash : '');
}

// ---- guaranteed profile/child cleanup (GH-294) -------------------------------
// The owner's 2026-07-31 debt audit: 573 stale /tmp/obw-e2e-profile-* dirs
// (~50 GB), orphaned headless Chromes (PPID 1, one GPU helper at 43 min CPU)
// and orphaned `python3 -m http.server` processes. Three layers, all scoped
// to resources THIS harness provably owns:
//   1. per-client: the profile dir is removed on the child's CONFIRMED exit
//      (proc.once('exit') in launchChrome — covers every close/failure path);
//   2. process-exit backstop: a synchronous best-effort rm for children whose
//      exit was already OBSERVED (a survivor — exitCode/signalCode both null —
//      is never touched: its profile belongs to the quarantine);
//   3. startup self-sweep (below) for debt left by crashed harnesses.
const LIVE_PROFILES = new Map(); // proc → { dir, quarantined }
// dir → the LATEST proc launched on it: gates relaunch on the same port, and
// a slow old child's deferred 'exit' handler must never delete the
// replacement session's LIVE profile (review r1 P1) — only the current
// claimant of a path may remove it.
const PROFILE_OWNER = new Map();

/** Synchronous exit confirmation by tracked pid. kill(pid, 0) throwing
 * ESRCH is the authoritative "gone"; a delivered 0 needs `ps stat` to tell
 * a zombie (exited, holds no files) from a live process. A FAILING probe is
 * never a verdict (review r8 P2: a missing/failing `ps` must not read as
 * "exited" and license an rm under a live Chrome). Bounded: tries × 100 ms.
 * Used where no event loop is left to wait on. */
function confirmExitSync(pid, tries = 8) {
  for (let i = 0; i < tries; i++) {
    // only ESRCH confirms (review r9 P2): EPERM is a LIVE process owned by
    // another account on a shared runner, never license to touch its dir.
    try { process.kill(pid, 0); } catch (e) {
      if (e.code === 'ESRCH') return true; // fully gone
    }
    let stat = null; // null = no verdict
    try {
      stat = execFileSync('ps', ['-o', 'stat=', '-p', String(pid)],
        { encoding: 'utf8' }).trim();
    } catch { /* ANY ps failure is verdictless (review r10 P2): a reaped pid
      is confirmed by kill(0) ESRCH on the next iteration, a zombie by a
      SUCCESSFUL ps 'Z' — a transient/absent ps must confirm nothing. */ }
    if (stat !== null && stat.startsWith('Z')) return true;
    try { execFileSync('sleep', ['0.1']); } catch { return false; }
  }
  return false;
}

/** GH-665 fallback for a previous same-port owner whose launch died before
 * it registered a killAndWait: the same SIGTERM → 3 s → SIGKILL → 5 s
 * discipline, confirmed only by exit/close or a liveness re-check — never by
 * an 'error' event (a failed kill is not an exit). */
function killAndWaitBare(proc, { resignal = true } = {}) {
  const alive = () => proc.exitCode === null && proc.signalCode === null;
  const waitExit = (ms) => new Promise((res) => {
    if (!alive()) return res(true);
    const t = setTimeout(() => res(!alive()), ms);
    const done = () => { clearTimeout(t); res(true); };
    proc.once('exit', done);
    proc.once('close', done);
    proc.once('error', () => { clearTimeout(t); res(!alive()); });
  });
  return (async () => {
    try { if (alive() && resignal) proc.kill(); } catch { /* never started */ }
    if (await waitExit(3000)) return true;
    try { proc.kill('SIGKILL'); } catch { /* raced exit */ }
    return waitExit(5000);
  })();
}

/** Release a profile path whose owning session RETAINED it (a helper not
 * confirmed gone, a transient rm failure) when that session's own closure
 * is unreachable — the LIVE_PROFILES entry is gone but PROFILE_OWNER still
 * names the process. Mirrors rmProfile's retained branch without its
 * ancestry snapshot: marker-matched helpers only, dir removed on a
 * CONFIRMED reap, ownership released only on a successful rm. */
/** Per-profile LAUNCH LOCK (review r4 P2). The same-port guard below reads
 * PROFILE_OWNER and then AWAITS (the previous owner's confirmed exit, its
 * retained-cleanup retries) — two concurrent launchChrome calls on one port
 * would both capture the same `prev`, and the loser would resume against a
 * replacement owner it never saw, skip the guard and wipe a LIVE profile out
 * from under the winner. Serializing per profile path makes the second
 * caller's read fresh, so it meets the winner as the LIVE unclosed session it
 * is and gets the honest refusal. Held only across the guard's awaits: from
 * the wipe to PROFILE_OWNER.set the body is await-free, so no other launch
 * can interleave there (hygiene arm 4e pins both halves — the live race and
 * that await-free tail). */
const PROFILE_LAUNCH_LOCKS = new Map(); // profileDir → tail promise
function acquireProfileLaunchLock(dir) {
  let release = () => {};
  const held = new Promise((res) => { release = res; });
  const prev = PROFILE_LAUNCH_LOCKS.get(dir) ?? Promise.resolve();
  const tail = prev.then(() => held); // the next caller waits on US
  PROFILE_LAUNCH_LOCKS.set(dir, tail);
  return prev.then(() => () => {
    release();
    if (PROFILE_LAUNCH_LOCKS.get(dir) === tail) PROFILE_LAUNCH_LOCKS.delete(dir);
  });
}

function releaseRetainedProfileBare(proc, profileDir) {
  if (!reapSessionHelpersSync(proc.pid, profileDir, null)) return false;
  try {
    fs.rmSync(profileDir,
      { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    PROFILE_OWNER.delete(profileDir);
    LIVE_PROFILES.delete(proc);
    return true;
  } catch { return false; }
}

// spawnStaticServer children still alive at process exit (a gate watchdog's
// process.exit bypasses the finally that would stopStaticServer — review r2
// P2): detached process groups outlive node, so the backstop group-SIGKILLs
// them by tracked pid. Map value = the spawn's own identity (port + docroot),
// which every group signal is matched against.
const LIVE_SERVERS = new Map(); // proc → { port, webDir }
const STOPPING_SERVERS = new Set(); // stopStaticServer recursion brake
// (the GH-248 heal's same-port replacement stopping — review 363 r7 P1)
// GH-557: handles whose death is DELIBERATE (stopStaticServer marks them
// before the first signal) — the fail-closed spontaneous-exit watchdog in
// spawnStaticServer must never fire for a teardown, even if a wrapper
// python translates the signal into a nonzero exit code.
const EXPECTED_STOPS = new WeakSet();

/** Does process group `proc.pid` still contain THE static server this
 * handle spawned? Three-state (review r9 P2 — a probe failure must not read
 * as an empty group):
 *   'ours'    — a member matches http.server + this spawn's port + docroot
 *   'clear'   — ps answered and no member matches (exited, or the pgid was
 *               recycled by something that is not our server — review r8 P1 /
 *               r9 P2: identity is the port+docroot pair, not process type)
 *   'unknown' — no ps verdict; treat as unsafe for group signals AND
 *               unproven for teardown verdicts. */
export function serverGroupProbe(proc) { // exported for the GH-1143 locale probe (test-lstart-locale.mjs LC5)
  const ident = LIVE_SERVERS.get(proc);
  if (!ident) return 'clear'; // already confirmed emptied earlier
  let rows;
  try {
    // GH-1143: the command column in the caller's locale (a UTF-8 docroot prints as
    // itself); the leader's birth token is read apart, in C (lstartOf)
    rows = execFileSync('ps', ['-axo', 'pgid=,pid=,command='],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n');
  } catch { return 'unknown'; }
  let hit = false;
  for (const l of rows) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l);
    if (!m || Number(m[1]) !== proc.pid) continue;
    const [, , pid, cmd] = m;
    // spawn-unique identity (review r10 P1): if the group LEADER's pid row
    // exists, its recorded birth time must match the one captured at
    // spawn — a recycled leader pid fronting a same-port/same-docroot
    // replacement group is 'clear', never 'ours'.
    if (Number(pid) === proc.pid && ident.lstart) {
      // GH-1143: read apart, in C — this process recorded ident.lstart the same way.
      // A group signal follows 'ours': an empty reading (ps failed, or the leader
      // exited between the two reads) is no proof — 'unknown', the caller re-polls
      const now = lstartOf(proc.pid);
      if (!now) return 'unknown';
      if (now !== ident.lstart) return 'clear';
    }
    if (cmd.includes('http.server') && cmd.includes(ident.webDir)
      // token boundary on the port ('8467' must not match '84671')
      && (cmd.endsWith(` ${ident.port}`) || cmd.includes(` ${ident.port} `))) {
      hit = true;
    }
  }
  return hit ? 'ours' : 'clear';
}

process.on('exit', () => {
  for (const [proc, ent] of LIVE_PROFILES) {
    const exited = proc.exitCode !== null || proc.signalCode !== null;
    if (!exited) {
      // a QUARANTINED survivor (killAndWait exhausted SIGKILL and the error
      // carried chromeSurvived) is not ours to touch — the reservation
      // protocol owns its port + profile.
      if (ent.quarantined) continue;
      // otherwise node is exiting under a still-live tracked child — gates
      // call close() then process.exit() synchronously, which cancels the
      // SIGKILL escalation timer and the child's 'exit' handler (review r1
      // P1). Deliver the SIGKILL NOW, by tracked pid, and reap only once
      // the exit is confirmed.
      try { proc.kill('SIGKILL'); } catch { continue; /* raced its exit */ }
      if (!confirmExitSync(proc.pid)) continue; // never rm under a live child
    }
    if (PROFILE_OWNER.get(ent.dir) !== proc) {
      // path reused (P1): the dir belongs to the newer claimant, but this
      // OLD generation's helpers are still reaped, ancestry-only (finisher
      // review r20 P2 — the marker names the replacement's processes).
      reapSessionHelpersSync(proc.pid, ent.dir, ent.descendants,
        { includeMarker: false });
      continue;
    }
    // the backstop reaps helpers too (review r14 P1): when close() ran
    // moments before process.exit(), this handler — not rmProfile — is the
    // one that observes the root's death, and the shell's markerless
    // helpers would otherwise reparent and evade every sweep.
    if (!reapSessionHelpersSync(proc.pid, ent.dir, ent.descendants)) continue;
    try { fs.rmSync(ent.dir, { recursive: true, force: true }); } catch { /* sweep */ }
  }
  for (const [p] of LIVE_SERVERS) {
    if (serverGroupProbe(p) === 'ours') {
      try { process.kill(-p.pid, 'SIGKILL'); } catch { /* raced exit */ }
    } else {
      // 'clear' (exited, or the pgid was recycled by something that is not
      // our server — review r8 P1) or 'unknown' (no ps verdict): a blind
      // group signal is never safe; only the still-tracked direct child
      // may be signaled.
      try { p.kill('SIGKILL'); } catch { /* already gone */ }
    }
  }
});

/** One pid's CURRENT ppid+command row; null = CONFIRMED absent (ps ran and
 * reported no such pid); 'unknown' = no ps verdict (review r16 P2 — the two
 * must not be conflated: only confirmed absence may license cleanup). */
function currentRow(pid) {
  try {
    const l = execFileSync('ps', ['-o', 'ppid=,command=', '-p', String(pid)],
      { encoding: 'utf8' }).replace(/\n$/, '');
    // `s`: the command is the rest of the row, U+2028/U+2029 included (JS `.` stops at them — GH-861)
    const m = /^\s*(\d+)\s+(.*)$/s.exec(l);
    return m ? { ppid: Number(m[1]), command: m[2] } : null;
  } catch (e) {
    // ps RAN and exited nonzero = no such pid; anything else = no verdict
    if (e.code !== 'ENOENT' && typeof e.status === 'number') return null;
    return 'unknown';
  }
}

/** Re-read one pid's row immediately before signaling it (review r10 P1):
 * the sweep's process-table snapshot ages while dirs are processed, and a
 * recycled pid must never be signaled. True only when the pid still has the
 * SAME parent and command line as the snapshot row. Any failure = false. */
function pidRowUnchanged(r) {
  const row = currentRow(r.pid);
  return typeof row === 'object' && row !== null
    && row.ppid === r.ppid && row.command === r.command;
}

/** Snapshot the live descendant tree of `pid` (pgrep -P walk, then one row
 * read per pid). The SHELL build's GPU/renderer helpers do NOT carry
 * --user-data-dir on their command lines (measured 2026-08-01 — unlike the
 * installed app's), so the only reliable helper identity is ancestry
 * captured BEFORE the root dies (review r13 P2). */
function snapshotDescendants(pid) {
  const kidsOf = (p) => {
    try {
      return execFileSync('pgrep', ['-P', String(p)], { encoding: 'utf8' })
        .split('\n').filter(Boolean).map(Number);
    } catch { return []; } // no children / no pgrep
  };
  const pids = [];
  for (let frontier = kidsOf(pid), depth = 0;
    frontier.length && depth < 5; depth++) {
    pids.push(...frontier);
    frontier = frontier.flatMap(kidsOf);
  }
  const out = [];
  for (const p of pids) {
    const row = currentRow(p);
    if (row) out.push({ pid: p, ...row });
  }
  return out;
}

/** Kill the surviving helpers of a DEAD session root, synchronously.
 * Two helper identities, merged: marker-matched command lines (the
 * installed app's helpers carry --user-data-dir) and the ancestry snapshot
 * taken before the root was signaled (the SHELL's helpers do NOT carry it —
 * review r13 P2, measured 2026-08-01). Each pid is revalidated immediately
 * before its SIGKILL (review r12 P1): same command line, and the parent
 * either unchanged or REPARENTED to 1 (the orphan transition). Returns
 * true when every matched helper is confirmed gone — the caller may only
 * remove the profile dir on true (review r12 P2). Shared by rmProfile and
 * the process-exit backstop (review r14 P1). `includeMarker: false` scopes
 * the reap to the ancestry snapshot alone (finisher review r20 P2): when a
 * NEWER session owns the profile path, the --user-data-dir marker names
 * THAT session's processes and must not be matched. */
export function reapSessionHelpersSync(rootPid, profileDir, descendants,
  { includeMarker = true } = {}) {
  try {
    const candidates = new Map(); // pid → { pid, ppid, command }
    if (includeMarker) {
      // the ONE census (LAND-16 Z1): rows on THIS session's canonical profile path
      const psRows = execFileSync('ps', ['-axo', 'pid=,ppid=,command='],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
        .split('\n').map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/s.exec(l)) // `s`: see currentRow
        .filter((m) => m && Number(m[1]) !== rootPid)
        .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3], m }));
      const allRows = markerRowsOnPath(profileDir, psRows, { log: (line) => console.error(line) });
      // GH-489 SNK-R36 (refuter 2, the exit-backstop path): a marker match
      // is a pattern, not a PID record. The census itself stays part of every
      // reap — a ps that gives no verdict must still leave the reap
      // UNCONFIRMED (hygiene arm 4d) — but what it may SIGNAL is narrowed:
      // Chrome HELPERS carry `--type=…`; a
      // marker row WITHOUT it is another browser's ROOT on this path — the
      // path is shared, nothing here is ours to signal: RETAIN. Helper rows
      // are this root's only when their parent is this root or launchd (1:
      // orphaned when a SIGKILLed root could not shut them down — GH-294's
      // case); a helper whose parent is some other live process belongs to
      // that process.
      const kinds = classifyMarkerRows(allRows, rootPid,
        new Set((descendants ?? []).map((d) => d.pid)));
      if (kinds.foreign.length) {
        const f = kinds.foreign[0];
        console.error(`[cdp] profile ${profileDir} RETAINED — a process that is `
          + `not this session's holds it (pid ${f.pid}, ppid ${f.ppid}: `
          + `${f.command.slice(0, 80)}${f.command.length > 80 ? '…' : ''})`
          + `${ambiguousNote(kinds.foreign.find((x) => x.ambiguous))}; nothing on this path is ours to `
          + 'signal (kill-by-own-PID law; GH-489 SNK-R36)');
        return false;
      }
      for (const { m } of kinds.own) {
        candidates.set(Number(m[1]),
          { pid: Number(m[1]), ppid: Number(m[2]), command: m[3] });
      }
    }
    for (const d of descendants ?? []) {
      if (d.pid !== rootPid && !candidates.has(d.pid)) candidates.set(d.pid, d);
    }
    let allGone = true;
    for (const h of candidates.values()) {
      const row = currentRow(h.pid);
      if (row === 'unknown') { allGone = false; continue; } // no verdict (r16)
      if (!row || row.command !== h.command) continue; // gone or recycled
      if (row.ppid !== h.ppid && row.ppid !== 1) continue;
      try { process.kill(h.pid, 'SIGKILL'); } catch (e) {
        // ESRCH raced its exit; anything else (EPERM…) is a LIVE helper we
        // cannot signal — never certify it gone (review r16 P2).
        if (e.code !== 'ESRCH') {
          allGone = false;
          console.error(`[cdp] chrome helper pid ${h.pid} unsignalable `
            + `(${e.code}) — profile ${profileDir} retained (GH-294)`);
        }
        continue;
      }
      if (confirmExitSync(h.pid, 3)) {
        console.error(`[cdp] reaped surviving chrome helper pid ${h.pid} `
          + `(dead root ${rootPid}, profile ${profileDir}) (GH-294)`);
      } else {
        allGone = false;
        console.error(`[cdp] chrome helper pid ${h.pid} not confirmed `
          + `exited — profile ${profileDir} retained (GH-294)`);
      }
    }
    return allGone;
  } catch { return false; } // no ps verdict certifies nothing (review r15
  // P2): ownership is retained and the belt/backstop/next-run rm retry
}

/** GH-489 SNK-R36 (review r10 P1): the FIRST-claim ownership judgement of a
 * CDP port + profile path — refuse BY NAME when a live holder that is not
 * this process already has either. Two independent reads, both before any
 * resource is spent and neither mutating anything:
 *   (1) the profile MARKER census: any live process whose command line
 *       carries `--user-data-dir=<profileDir>` (the same `ps -axo` row form
 *       reapSessionHelpersSync reads) — with no session of ours on the
 *       path, every such row is somebody else's browser (or its helpers);
 *   (2) the ENDPOINT: `/json/version` already answering on :<port> — a live
 *       debugger that cannot be ours before our spawn (a bare Chrome without
 *       the marker path still holds the port; pre-fix the poll below would
 *       have ATTACHED to it after wiping the path).
 * Only called when PROFILE_OWNER has no entry for the path (see the caller);
 * the GH-665 own-session branch keeps its own law. Sync census + one bounded
 * probe (1.5 s); a census that cannot run (no ps) refuses nothing — the
 * endpoint probe still stands, and the unconfirmed state is reported. */
/** The SYNC half of the judgement: live processes (not this one) whose command
 * line carries `--user-data-dir=<profileDir>` — [] when none, null when ps
 * gave no verdict. Await-free on purpose: it is re-read immediately before
 * the pre-launch wipe (refuter 1 of SNK-R36: the first read sits before the
 * served-tree preflight and the GH-665 waits — a foreign shell that binds the
 * port + path INSIDE that window must still be refused, never wiped under). */
/** The ONE profile-path resolver (GH-489 #637 landing, LAND-16 Z1 — review
 * round 3 P1; refuter 3 of SNK-R36 kept: the refusals and the reaper read
 * the SAME census). The base 7b838c06 matched the FULL literal
 * `--user-data-dir=${profileDir}` (cdp.mjs:864 there); SNK-R36/R37 replaced
 * it with a BASENAME regex so `/private/tmp/…` and `…/` would name the same
 * directory — and thereby owned any helper whose profile lived elsewhere
 * under the same basename (`/some-other-directory/obw-e2e-profile-19999`),
 * which reapSessionHelpersSync then SIGKILLed: a never-broad-kill violation.
 * canon(p) = realpath(dirname(p)) + '/' + basename(p), trailing slashes
 * stripped, resolved on BOTH the row's value and the session's literal: the
 * /tmp → /private/tmp alias and a trailing slash collapse; the LEAF need not
 * exist (a not-yet-created own dir on the first launch and an already
 * deleted foreign dir both resolve); an unresolvable DIRNAME → null → the row
 * is NOT on this path. Verdict: the FIRST --user-data-dir= token is the path
 * only when it is followed by the exact end of the row, by ONE space + `--`,
 * or by ONE space + a URL scheme; any other follow — trailing whitespace and
 * a run of spaces included — is UNPARSEABLE, and so is an EMPTY token before
 * anything and a switch that does not start an argument (anything but one
 * space before it; at the row's start it may be the program name: GH-861
 * r4). `ps` joins argv with single
 * spaces, so a space that is not that one separator belongs to SOME argument
 * (`'<path> '` is ONE argv, or the token plus an empty one), and an
 * UNPARSEABLE token (or a repeated switch, bare `--user-data-dir` included,
 * or the switch with one dash, `-user-data-dir`) leaves the row's argument
 * boundaries unresolved: when ANY reading (the token cut at each whitespace
 * boundary, every occurrence) names this path, the row is an AMBIGUOUS holder
 * and FAILS CLOSED — on the census (every refusal refuses, every release
 * retains, the reason printed) and never signalled on the orphan guess
 * (GH-861 P2: `chrome --user-data-dir=<path> /tmp/page.html` is a live
 * holder with a separate positional argument). When no reading names this
 * path the row is another directory under every boundary — no signal, no
 * retention decision, no holder, one census line per distinct token that
 * says unparseable and left alone when the token's basename is ours (silent
 * under other basenames).
 * A parseable token then judges by canon: equal → this session's path (then
 * the own/foreign classification below by root pid / ppid); unequal or null →
 * AMBIGUOUS as above when a longer reading (the token with the words after
 * it) names this path, else not this session's — no signal, no retention
 * decision, one census line per foreign dir that shares our basename
 * ('foreign profile dir <canon> — left alone'); rows under other basenames
 * were never in play.
 * A token that is relative, or that has a '.' or '..' segment, is never
 * judged by this canon (it would resolve against THIS process's working
 * directory, and a dot leaf is not a basename): markerRowsOnPath holds it as
 * AMBIGUOUS when its lexical leaf is ours or is '.'/'..' (GH-861). An EMPTY
 * value names no directory; a value led by whitespace ('--user-data-dir= /x')
 * is an UNPARSEABLE token whose readings, relative by the same rule, are held
 * when their lexical leaf is ours; the root token '/' is settled and its
 * basename is empty. A token ending in the whitespace Chrome trims off each
 * argv, as ps prints it ('\011', '^M' — PS_WS_TAIL_RE), is held AMBIGUOUS
 * when the value without it names this path (GH-861 r4). The leaf is
 * otherwise literal: a symlinked leaf, or a
 * '..' walked through a symlink, is not resolved. */
export function canonProfilePath(p) {
  if (typeof p !== 'string' || !p) return null;
  const stripped = p.replace(/\/+$/, '');
  const base = path.basename(stripped);
  if (!base) return null;
  try { return fs.realpathSync(path.dirname(stripped)) + '/' + base; } catch { return null; }
}
// `\S*`, not `\S+`: an empty value still matches, so a value led by
// whitespace (a space, U+2028) is an UNPARSEABLE token, never skipped past
const USER_DATA_DIR_RE = /--user-data-dir=(\S*)/;
// the whitespace Chrome trims off each argv (ASCII: space, tab, LF, VT, FF,
// CR) at the end of a value, raw or as macOS ps prints it — `\011` tab, `\012`
// LF, `^K` VT, `^L` FF, `^M` CR (octal escapes to `\015` accepted): a value
// ending in it may name the path without it (GH-861 r4). A backslash or a
// caret may also be literal, so such a reading is held, never plainly ours.
const PS_WS_TAIL_RE = /(?:[ \t\n\v\f\r]|\\01[1-5]|\^[KLM])+$/;
// a later BARE occurrence of the switch: Chrome reads `--user-data-dir`
// without `=` as the switch with an empty value, and the last occurrence wins
// (GH-861 r4; the occurrence with `=` is the census's own repeat test). Only
// where Chrome could read it as the switch: after whitespace (the argv
// separator, or whitespace it trims, raw or as ps prints it) and before the
// end of the row or such whitespace; `--user-data-dir.bak` is another switch
const BARE_REPEAT_RE = /(?:^|[ \t\n\v\f\r]|\\01[1-5]|\^[KLM])--user-data-dir(?=$|[ \t\n\v\f\r]|\\01[1-5]|\^[KLM])/;
// the switch with ONE dash: on POSIX Chrome reads `-name` as `--name`, so
// `-user-data-dir`, with a value or bare, is the same switch (GH-861 r4); the
// census parses only the two-dash form, so a row carrying it is held
const ONE_DASH_RE = /(?:^|[ \t\n\v\f\r]|\\01[1-5]|\^[KLM])-user-data-dir(?:=(\S*)|(?=$|[ \t\n\v\f\r]|\\01[1-5]|\^[KLM]))/;
// the follow that lets a token be read as the whole value: the exact end of
// the row, ONE space + `--`, ONE space + a URL scheme (ps separates argv with
// one space; any other whitespace is inside some argument — GH-861 P2)
function markerFollowParses(follow) {
  return follow === '' || /^ --/.test(follow) || /^ [a-z][a-z0-9+.-]*:/.test(follow);
}
/** Every value a row's -user-data-dir= / --user-data-dir= tokens could name
 * (GH-861 P2; the one-dash form, GH-861 r4): each
 * token read cut at each whitespace boundary through the end of the row (the
 * token alone first). `ps` joins argv with spaces, so the words after a token
 * may belong to it ('<dir> <word>' — ONE argv naming another directory, or
 * the token plus a separate argument), whether or not its follow parses.
 * Every occurrence counts: of a repeated switch, which one the process uses
 * is not the census's to guess. Each reading is read again without a trailing
 * run of the whitespace Chrome trims (PS_WS_TAIL_RE, GH-861 r4). */
function markerReadings(command) {
  const key = '-user-data-dir='; // found inside `--user-data-dir=` too
  const out = [];
  const add = (v) => {
    out.push(v);
    const t = v.replace(PS_WS_TAIL_RE, '');
    if (t !== v) out.push(t);
  };
  for (let at = command.indexOf(key); at !== -1; at = command.indexOf(key, at + key.length)) {
    const rest = command.slice(at + key.length);
    for (const b of rest.matchAll(/\S(?=\s)/g)) add(rest.slice(0, b.index + 1));
    add(rest.replace(/\s+$/, ''));
  }
  return out;
}
/** The reason an AMBIGUOUS census row is kept, for the refusal and retention
 * lines that name a holder ('' when the row is not ambiguous). */
function ambiguousNote(r) {
  return r && r.ambiguous
    ? ` [pid ${r.pid}: its --user-data-dir token is AMBIGUOUS — ${r.ambiguousWhy} `
      + 'and a reading names this path: held, fail closed; GH-861]'
    : '';
}
/** The marker CENSUS over `ps -axo pid=,ppid=,command=` rows: those whose
 * --user-data-dir names THIS session's profile path by canon, plus the
 * AMBIGUOUS rows (copies flagged `ambiguous: true`, with the reason in
 * `ambiguousWhy`): an UNPARSEABLE first token (not followed by the exact end
 * of the row, one space + a `--` flag or one space + a URL scheme; an empty
 * token before anything; a switch that does not start an argument), a
 * repeated switch (bare included), the switch with one dash
 * (`-user-data-dir`), a parseable token naming another directory,
 * with any reading that names this path; a relative / dot-segment token whose
 * lexical
 * leaf is ours or is '.'/'..'; or a token ending in the whitespace Chrome
 * trims, as ps prints it, whose trimmed value names this path
 * (canonProfilePath). An ambiguous row is a holder to every
 * refusal and release check and is classified foreign unless it is this
 * session's by record (classifyMarkerRows). `log` (when
 * given) receives one line per foreign dir that shares our basename, one line
 * per distinct UNPARSEABLE token whose basename is ours and that no reading
 * makes ours, and one line per distinct AMBIGUOUS token. */
export function markerRowsOnPath(profileDir, rows, { log = null } = {}) {
  const want = canonProfilePath(profileDir);
  const ourBase = path.basename(profileDir.replace(/\/+$/, ''));
  const ourLiteral = profileDir.replace(/\/+$/, '');
  // relative, or a '.' / '..' segment: what the token names depends on the
  // holder's working directory or on the walk through its segments, neither
  // of which ps shows — never judged by canon (GH-861)
  const unsettled = (s) => !s.startsWith('/') || s.split('/').some((seg) => seg === '.' || seg === '..');
  // a reading names this path: the session's literal, or its canon (the
  // basename is literal in the canon, so only same-basename readings resolve);
  // an unsettled reading when its lexical leaf is ours or is itself '.'/'..';
  // an empty value names no directory, and '/' is settled (unsettled() reads
  // the raw token: stripped of its trailing slashes '/' would read as '')
  const namesOurs = (v) => {
    if (v === '') return false;
    const s = v.replace(/\/+$/, '');
    if (unsettled(v)) {
      const leaf = path.basename(path.normalize(s));
      return leaf === ourBase || leaf === '.' || leaf === '..';
    }
    if (path.basename(s) !== ourBase) return false;
    if (s === ourLiteral) return true;
    const c = canonProfilePath(s);
    return want !== null && c !== null && c === want;
  };
  const onPath = [];
  const foreignSeen = new Map();
  const unparseableSeen = new Map();
  const ambiguousSeen = new Map();
  const hold = (r, tok, ambiguousWhy) => {
    onPath.push({ ...r, ambiguous: true, ambiguousWhy });
    if (!ambiguousSeen.has(tok)) ambiguousSeen.set(tok, { ...r, ambiguousWhy });
  };
  for (const r of rows) {
    const m = USER_DATA_DIR_RE.exec(r.command);
    // GH-861 r4: the switch with one dash, anywhere Chrome could read it
    // (ONE_DASH_RE), leaves the value it uses to a guess
    const one = ONE_DASH_RE.exec(r.command);
    if (one && markerReadings(r.command).some(namesOurs)) {
      hold(r, m ? m[1] : one[1] ?? '', 'the switch also appears with one dash (`-user-data-dir`), which Chrome reads as the same switch, so which occurrence the process uses cannot be told from ps');
      continue;
    }
    if (!m) continue;
    const follow = r.command.slice(m.index + m[0].length);
    // the switch starts an argument only after ONE space: the row's start is
    // the program name (or, when that is empty, ps shows the first argument
    // there), and after any other character (`=`, `-`, `\011`, U+2028) it may
    // sit inside another argument (`--js-flags=--user-data-dir=…`) or be an
    // argv Chrome reads only once trimmed (GH-861 r4)
    const argStart = m.index > 0 && r.command[m.index - 1] === ' ';
    // the token is the value only when the switch starts an argument, its
    // follow parses, and it is not an EMPTY token before something else (a
    // value led by whitespace: an empty word, or ONE argv whose value starts
    // with it — GH-861 r4)
    const parseable = argStart && markerFollowParses(follow)
      && (m[1] !== '' || follow === '');
    // GH-861 P2 (review b19tb1): boundaries the census cannot resolve FAIL
    // CLOSED — a live holder is never skipped past on a guess about its argv
    if ((!parseable || follow.includes('--user-data-dir=')) && markerReadings(r.command).some(namesOurs)) {
      hold(r, m[1], !argStart
        ? "the switch does not follow one space (at the row's start it may be the program name, after any other character it may sit inside another argument), so ps does not show whether Chrome reads it"
        : parseable
          ? 'the switch is repeated and which occurrence the process uses cannot be told from ps'
          : "ps joins argv with spaces and the row's argument boundaries cannot be resolved");
      continue;
    }
    // GH-861 r4: a later bare switch is a repeat too (BARE_REPEAT_RE)
    if (BARE_REPEAT_RE.test(follow) && markerReadings(r.command).some(namesOurs)) {
      hold(r, m[1], 'the switch is repeated and which occurrence the process uses cannot be told from ps');
      continue;
    }
    if (!parseable && path.basename(m[1].replace(/\/+$/, '')) === ourBase && !unparseableSeen.has(m[1])) unparseableSeen.set(m[1], r);
    if (!parseable) continue; // no reading names this path: another directory under every boundary
    if (unsettled(m[1]) && namesOurs(m[1])) {
      hold(r, m[1], "the token is relative or has a '.' or '..' segment, so what it names depends on the holder's working directory or on the directories it passes through, which ps does not show");
      continue;
    }
    // GH-861 r4: a token ending in the whitespace Chrome trims, as ps prints it
    const trimmed = m[1].replace(PS_WS_TAIL_RE, '');
    if (trimmed !== m[1] && namesOurs(trimmed)) {
      hold(r, m[1], 'the token ends in ASCII whitespace as ps prints it (\\011, \\012, ^K, ^L, ^M) or as an octal escape (\\013 to \\015), which Chrome trims off each argument, so the value it uses may be the token without it');
      continue;
    }
    const got = canonProfilePath(m[1]);
    if (want !== null && got !== null && got === want) { onPath.push(r); continue; }
    // the token alone is another directory, but '<dir> --x/…' may be ONE argv that resolves to this path
    if (markerReadings(r.command).some(namesOurs)) {
      hold(r, m[1], 'the token alone names another directory, but ps joins argv with spaces, so the words after it may belong to it');
      continue;
    }
    if (path.basename(m[1].replace(/\/+$/, '')) === ourBase) {
      const key = got ?? `${m[1]} (dirname unresolvable)`;
      if (!foreignSeen.has(key)) foreignSeen.set(key, r);
    }
  }
  if (log) {
    for (const [k, r] of foreignSeen) {
      log(`[cdp] foreign profile dir ${k} ≠ ${want ?? '(unresolvable)'} — left alone (pid ${r.pid}, ppid ${r.ppid}: same basename as ${profileDir}, not this session's canon path; kill-by-own-PID law; GH-489 LAND-16 Z1)`);
    }
    for (const [tok, r] of unparseableSeen) {
      log(`[cdp] foreign profile dir ${tok} unparseable — left alone (pid ${r.pid}, ppid ${r.ppid}: same basename as ${profileDir}, not this session's canon path; kill-by-own-PID law)`);
    }
    for (const [tok, r] of ambiguousSeen) {
      log(`[cdp] profile dir token ${tok === '' ? "'' (empty)" : tok} AMBIGUOUS — held, fail closed unless this session's by record (pid ${r.pid}, ppid ${r.ppid}: ${r.ambiguousWhy} and a reading names ${want ?? profileDir}; never signalled on the orphan guess, never wiped or released under while held; GH-861)`);
    }
  }
  return onPath;
}
/** A marker row's KIND: Chrome helpers carry `--type=…` after ONE space (ps
 * separates argv with one space; `--type=` after any other whitespace is
 * inside some argument — GH-861); a marker row without it is a browser ROOT. Rows that can be this root's: the root's own
 * helpers (ppid = root) and its orphans (ppid = 1, launchd — GH-294). An
 * AMBIGUOUS row (markerRowsOnPath) is this root's only by record — parent =
 * this root, or the row or its parent snapshotted — never by the orphan guess
 * (GH-861 P2). Used by the reaper and by rmProfile's pre-check alike
 * (refuter 3 nit 1). */
export function classifyMarkerRows(rows, rootPid, ownPids) { // exported as the arm's seam (SNK-R37 C1)
  const foreign = [];
  const own = [];
  for (const r of rows) {
    const helper = / --type=/.test(r.command);
    if (!helper) { if (r.pid !== rootPid) foreign.push(r); continue; }
    // ours: parent = this root; parent = launchd/init (1 — an orphan of a dead root, GH-294; a subreaper host never
    // reparents to 1, hence the next clause); the row itself or its parent snapshotted as ours (zygote-parented renderers)
    if (r.ppid === rootPid || (r.ppid === 1 && !r.ambiguous) || (ownPids && (ownPids.has(r.pid) || ownPids.has(r.ppid)))) own.push(r); else foreign.push(r);
  }
  return { foreign, own };
}
export function foreignMarkerHoldersSync(profileDir) {
  // LAND-16 Z1: the SAME resolver as the reaper (refuter 3 of SNK-R36) — a holder is a live process on this session's CANONICAL path
  try {
    const rows = execFileSync('ps', ['-axo', 'pid=,ppid=,command='],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\n').map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/s.exec(l)) // `s`: see currentRow
      .filter((m) => m && Number(m[1]) !== process.pid)
      .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] }));
    return markerRowsOnPath(profileDir, rows, { log: (line) => console.error(line) }); // FULL command (SNK-R37 C: a
      // macOS full-Chrome helper's `--type=` sits past offset 200 — a truncated row read as a foreign ROOT); printed lines truncate
  } catch { return null; }
}
function foreignHolderError(port, profileDir, holders, when = '') {
  const h = holders[0];
  return new Error(`launchChrome: refusing to launch on :${port}${when} — `
    + `${profileDir} is held by a LIVE process that is not ours (pid `
    + `${h.pid}, ppid ${h.ppid}: ${h.command.slice(0, 96)}${h.command.length > 96 ? '…[truncated for print]' : ''}`
    + `${holders.length > 1 ? `; +${holders.length - 1} more` : ''})${ambiguousNote(holders.find((x) => x.ambiguous))}; `
    + 'its profile is not ours to wipe and its processes are not ours to '
    + 'signal — a process not in this run\'s own PID record is not this '
    + 'run\'s (kill-by-own-PID law; GH-489 SNK-R36 review r10 P1) '
    + '[foreign-profile-holder]');
}
async function refuseForeignProfileHolder(port, profileDir) {
  const holders = foreignMarkerHoldersSync(profileDir);
  if (holders && holders.length) throw foreignHolderError(port, profileDir, holders);
  let answer = null;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`,
      { signal: AbortSignal.timeout(1500) });
    // ANY answer is a live holder (refuter 2 of SNK-R36: a non-debugger HTTP
    // service on a mis-set CDP port used to pass here and cost the 15 s poll)
    let j = null;
    try { j = r.ok ? await r.json() : null; } catch { j = null; }
    answer = (j && (j.Browser || j['User-Agent'])) || `HTTP ${r.status}`;
  } catch { answer = null; } // ECONNREFUSED / timeout: the port is free
  if (answer !== null) {
    throw new Error(`launchChrome: refusing to launch on :${port} — a LIVE `
      + `debugger endpoint already answers /json/version there (${String(answer)
        .slice(0, 80)}) before this process spawned anything; that browser `
      + 'is not ours to attach to, wipe under or signal'
      + (holders === null ? ' (no ps verdict on the profile marker; the '
        + 'endpoint alone decides)' : '')
      + ' (kill-by-own-PID law; GH-489 SNK-R36 review r10 P1) '
      + '[foreign-cdp-endpoint]');
  }
}

/** ms represented by a `ps -o etime` field ([[dd-]hh:]mm:ss). */
function etimeMs(s) {
  const m = /^(?:(?:(\d+)-)?(\d+):)?(\d+):(\d+)$/.exec(s.trim());
  if (!m) return 0;
  return (((Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0)) * 60
    + Number(m[3])) * 60 + Number(m[4])) * 1000;
}

/** Startup self-sweep (GH-294): reap ONLY aged, ownerless (or aged-orphan-
 * owned) /tmp/obw-e2e-profile-* debt so crashes cannot accumulate it. Runs
 * once per process, before the first launch. Scope discipline (the 7/25
 * broad-pkill scar; memory: never broad-kill Chrome):
 *   - only dir names matching ^obw-e2e-profile- under /tmp are candidates;
 *   - a dir with ANY live process whose command line names it verbatim via
 *     --user-data-dir= is left alone — UNLESS every such process is an
 *     ORPHAN (PPID 1: its launching harness is gone) older than the age
 *     threshold, in which case each is killed BY ITS DISCOVERED PID (the
 *     exact GH-294 debt class: an idle headless chrome burning CPU);
 *   - an ownerless dir is removed only when its mtime is older than
 *     OB_PROFILE_SWEEP_AGE_MS (default 2 h) — a fresh dir may be another
 *     lane's mid-launch profile. OB_PROFILE_SWEEP=0 disables entirely.
 * The http.server-orphan arm (GH-294 finisher) extends the same discipline
 * to static-server debt — see the pass at the bottom of this function.
 * Returns { removed, killed, serverKilled } (paths / pids / pids) — the
 * hygiene arms' probe. */
let sweepRan = false;
/** The sweep's process-table snapshot (pid, ppid, etime, command); throws
 * when ps gives no verdict — callers touch nothing then. */
function psRowsForSweep() {
  return execFileSync('ps', ['-axo', 'pid=,ppid=,etime=,command='],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').map((l) => {
      const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(l);
      return m && { pid: Number(m[1]), ppid: Number(m[2]),
        etime: m[3], command: m[4] };
    }).filter(Boolean);
}
/** EPERM = alive-but-not-ours; only ESRCH is a confirmed death (r9 P2). */
function aliveHarness(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) {
    return e.code !== 'ESRCH';
  }
}
const rowMatches = (row, ident) => row.command.includes('http.server')
  && row.command.includes(ident.webDir)
  && (row.command.endsWith(` ${ident.port}`)
    || row.command.includes(` ${ident.port} `));
/** Kill one orphan server TREE (root + pre-captured kin) by explicit pid,
 * with pre-signal revalidation; true = every member confirmed gone. */
function reapServerTree(root, why, out) {
  const kin = snapshotDescendants(root.pid)
    .filter((d) => d.pid !== root.pid);
  for (const r of [root, ...kin]) {
    const row = currentRow(r.pid);
    if (typeof row !== 'object' || row === null) continue; // gone/no verdict
    if (row.command !== r.command) continue; // recycled since snapshot
    // kin reparent to 1 once the wrapper dies mid-loop (profile-kin rule)
    if (row.ppid !== r.ppid && row.ppid !== 1) continue;
    try {
      process.kill(r.pid, 'SIGKILL');
      out.serverKilled.push(r.pid);
      console.error(`[sweep] killed orphan http.server pid ${r.pid} `
        + `(${why}) (GH-294)`);
    } catch { /* raced its own exit */ }
  }
  return [root, ...kin].every((r) => confirmExitSync(r.pid, 5));
}
/** The MARKED http.server-orphan pass (GH-294 finisher; see the arm notes in
 * sweepStaleProfiles): a server whose spawnStaticServer marker records a DEAD
 * harness and whose tree root is an orphan (PPID 1) belongs to no live run —
 * reaped by pid, confirmed, no age gate. `inRange(port)` scopes the pass to
 * one claim's ports (the registry's reaping scan); `why` is appended to the
 * kill lines. Returns the reaped root pids and the identities a LIVE harness
 * still owns (the shaped pass must not reclassify those — review r20 P2). */
function markedOrphanServerPass(rows, { srvAgeMs, out, inRange = null, why = '' }) {
  const reapedPids = new Set();
  const liveMarked = [];
  let markers = [];
  const markerDir = serverMarkerDir();
  try {
    markers = fs.readdirSync(markerDir).filter((n) => SERVER_MARKER_RE.test(n));
  } catch { markers = []; }
  for (const name of markers) {
    const file = path.join(markerDir, name);
    let ident = null;
    try { ident = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* unreadable */ }
    if (!ident || typeof ident.pid !== 'number' || !ident.port || !ident.webDir) {
      if (inRange) continue; // a scoped pass never judges what it cannot place
      try { fs.rmSync(file, { force: true }); } catch { /* next sweep */ }
      continue;
    }
    if (inRange && !inRange(Number(ident.port))) continue; // not this claim's port
    let row = rows.find((r) => r.pid === ident.pid) ?? null;
    if (row && !rowMatches(row, ident)) row = null; // pid recycled
    // GH-1143: a marker whose birth token is not in C form cannot be revalidated. While
    // it is young (NON_C_TOKEN_GRACE_MS from its 'at') it is no verdict: never signalled,
    // never pruned while its row lives, and shielded when its harness is alive; past
    // that age it reads as a mismatch (the PPID-1 fallback below decides)
    if (row && ident.lstart && !comparableLstart(ident.lstart)) {
      if (nonCTokenYoung({ at: Number(ident.at) })) {
        if (aliveHarness(ident.harnessPid)) liveMarked.push(ident);
        continue;
      }
      row = null;
    }
    if (row && ident.lstart) {
      // birth-time revalidation (finisher review P2): a recycled pid fronting
      // a SAME-identity replacement server (fixed gate ports + docroots make
      // that likely) must read as "marker's server is gone", never 'ours'.
      let lstart = null;
      try {
        lstart = execFileSync('ps', ['-o', 'lstart=', '-p', String(row.pid)],
          { encoding: 'utf8', env: psEnv() }).trim();
      } catch { row = null; /* raced its exit: fall through to the fallback */ }
      if (lstart !== null && (!lstart || lstart !== ident.lstart)) row = null; // a signal path: an empty reading is no proof
    }
    if (!row) {
      // the marked LEADER (python wrapper) can die before its socket-holding
      // grandchild: fall back to the recorded identity on PPID-1 rows ONLY —
      // a live run's same-identity server is parented to its live harness
      // (detached changes the group, not the parent), never PPID 1 — and,
      // because the marker's leader birth time cannot vouch for a non-leader
      // row, only when the row is AGED past the shaped threshold (finisher
      // review P2: a stale marker must never fast-track a fresh same-identity
      // orphan that the age discipline would have spared).
      const kin = rows.filter((r) => r.ppid === 1 && rowMatches(r, ident));
      row = kin.find((r) => etimeMs(r.etime) > srvAgeMs) ?? null;
      if (!row && kin.length) continue; // fresh same-identity orphan: retain
      // the marker — once aged, the next sweep's fallback reaps it
    }
    if (!row) {
      // exited (or the pid was recycled by something else): stale marker
      try { fs.rmSync(file, { force: true }); } catch { /* next sweep */ }
      continue;
    }
    if (aliveHarness(ident.harnessPid)) {
      liveMarked.push(ident); // a live run still owns it — shield it from
      continue; // the shaped pass too (review r20 P2)
    }
    if (row.ppid !== 1) continue; // parented: not a confirmed orphan
    if (reapServerTree(row, `marked, harness ${ident.harnessPid} dead, `
      + `port ${ident.port}${why ? `, ${why}` : ''}`, out)) {
      reapedPids.add(row.pid);
      try { fs.rmSync(file, { force: true }); } catch { /* next sweep */ }
    } else {
      console.error(`[sweep] marked orphan server tree ${row.pid} not `
        + 'confirmed gone — marker retained for the next sweep (GH-294)');
    }
  }
  return { reapedPids, liveMarked };
}

export function sweepStaleProfiles({ force = false } = {}) {
  const out = { removed: [], killed: [], serverKilled: [] };
  if (sweepRan && !force) return out;
  sweepRan = true;
  if (process.env.OB_PROFILE_SWEEP === '0') return out;
  const ageMs = Number(process.env.OB_PROFILE_SWEEP_AGE_MS) || 2 * 3600 * 1000;
  let names = [];
  try {
    names = fs.readdirSync('/tmp').filter((n) => n.startsWith('obw-e2e-profile-'));
  } catch { return out; }
  // no early return on an empty dir list (review r5 P2): the DIRLESS pass
  // below exists precisely for orphans whose profile dir is already gone.
  let rows = [];
  try { rows = psRowsForSweep(); } catch { return out; } // no ps verdict → touch nothing
  for (const name of names) {
    const dir = `/tmp/${name}`;
    let st;
    try { st = fs.lstatSync(dir); } catch { continue; }
    if (!st.isDirectory()) continue;
    // exact-argument match (review r7 P2): a bare includes() would let a
    // live ...-92230 read as an owner of ...-9223 and retain its debt.
    const marker = `--user-data-dir=${dir}`;
    const owners = rows.filter((r) => r.command.includes(marker + ' ')
      || r.command.endsWith(marker));
    if (owners.length) {
      // judge the tree by its ROOTS (review r1 P2): an orphaned browser root
      // reparents to PPID 1, but its GPU/renderer helpers keep the SAME
      // marker and stay children of that root — requiring every owner to be
      // PPID 1 would skip the whole aged tree forever. A root is an owner
      // whose parent is NOT itself an owner; the tree is reapable only when
      // EVERY root is parentless (PPID 1) and older than the threshold.
      const ownerPids = new Set(owners.map((r) => r.pid));
      const roots = owners.filter((r) => !ownerPids.has(r.ppid));
      const orphaned = roots.length > 0
        && roots.every((r) => r.ppid === 1 && etimeMs(r.etime) > ageMs);
      if (!orphaned) continue; // a harness (or anything parented) owns it: not ours
      // capture each root's DESCENDANTS before killing it (review r14 P2):
      // a shell root is the only marker-bearing owner — its helpers carry
      // no --user-data-dir and would reparent invisibly once it dies.
      const kin = roots.flatMap((r) => snapshotDescendants(r.pid))
        .filter((d) => !owners.some((o) => o.pid === d.pid));
      for (const r of [...roots, ...owners.filter((o) => !roots.includes(o)),
        ...kin]) {
        // revalidate immediately before the signal; kin may have reparented
        const row = currentRow(r.pid);
        if (!row || row.command !== r.command) continue;
        if (row.ppid !== r.ppid && row.ppid !== 1) continue;
        try {
          process.kill(r.pid, 'SIGKILL'); // marker/ancestry-scoped orphan tree
          out.killed.push(r.pid);
          console.error(`[sweep] killed aged orphan chrome pid ${r.pid} `
            + `(orphan tree of ${dir}) (GH-294)`);
        } catch { /* raced its own exit */ }
      }
      // SIGKILL delivery is not exit confirmation (review r2 P2): removal
      // proceeds only once EVERY tree member — owners AND the markerless
      // kin (review r15 P2) — is confirmed gone, else the dir waits for the
      // next sweep so the survivors stay discoverable.
      if (![...owners, ...kin].every((r) => confirmExitSync(r.pid, 5))) {
        console.error(`[sweep] member(s) of ${dir}'s tree not confirmed `
          + 'exited — profile retained for the next sweep (GH-294)');
        continue;
      }
    } else if (Date.now() - st.mtimeMs <= ageMs) {
      continue; // fresh ownerless dir: possibly another lane mid-launch
    }
    // TOCTOU revalidation (review r13 P2): another lane can recreate and
    // claim this path after the snapshots above — re-judge freshness and
    // ownership immediately before the rm; no verdict = no removal.
    let st2;
    try { st2 = fs.lstatSync(dir); } catch { continue; } // already gone
    // freshness applies only to a RECREATED directory (finisher review P2):
    // an aged orphan's dying Chrome can touch its own profile's top level
    // (mtime refreshes) after its owners were killed and CONFIRMED gone —
    // same dev/ino means same directory, so the mtime says nothing about a
    // new claimant and the confirmed-dead-owner verdict stands. A different
    // identity means another lane recreated the path: leave it.
    if ((st2.dev !== st.dev || st2.ino !== st.ino)
      && Date.now() - st2.mtimeMs <= ageMs) continue; // freshly recreated
    try {
      const liveNow = execFileSync('ps', ['-axo', 'command='],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
        .split('\n').some((c) => c.includes(`${marker} `) || c.endsWith(marker));
      if (liveNow) continue; // a new owner appeared: not ours to remove
    } catch { continue; }
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
      out.removed.push(dir);
      console.error(`[sweep] removed stale e2e profile ${dir} (GH-294)`);
    } catch { /* still held: next sweep */ }
  }
  // DIRLESS orphans (review r4 P2): a SIGKILLed browser root can leave a
  // reparented helper alive after the harness removed the profile dir —
  // keyed only on dirs, such a survivor would be invisible to every future
  // sweep (exactly the 43-min-GPU-helper debt class). Same discipline:
  // marker-matched command line, PPID 1, aged — killed by discovered pid.
  for (const r of rows) {
    const m = /--user-data-dir=(\/tmp\/obw-e2e-profile-[^ ]+)/.exec(r.command);
    if (!m || fs.existsSync(m[1])) continue; // dir-owning trees handled above
    if (r.ppid !== 1 || etimeMs(r.etime) <= ageMs) continue;
    if (!pidRowUnchanged(r)) continue; // exited/recycled since the snapshot
    try {
      process.kill(r.pid, 'SIGKILL');
    } catch { continue; /* raced its own exit */ }
    // report reaped only on CONFIRMED exit (review r6 P2): sweepRan
    // suppresses re-sweeps in this process, so an unconfirmed survivor
    // must be named, not counted.
    if (confirmExitSync(r.pid, 5)) {
      out.killed.push(r.pid);
      console.error(`[sweep] killed dirless aged orphan chrome pid ${r.pid} `
        + `(ppid 1, etime ${r.etime}, marker ${m[1]}) (GH-294)`);
    } else {
      console.error(`[sweep] dirless orphan pid ${r.pid} ignored SIGKILL — `
        + 'still alive, left for the next sweep (GH-294)');
    }
  }
  // ---- http.server-orphan arm (GH-294 finisher) ------------------------------
  // The same debt class as the profiles: a crashed/hard-exited harness leaves
  // its detached `python3 -m http.server` GROUP (wrapper + socket-holding
  // grandchild) reparented to PPID 1, holding a port forever. Two identities,
  // mirroring the marker+age+PPID discipline above — never by name:
  //   MARKED — /tmp/obw-e2e-server-<pid>.json written by spawnStaticServer.
  //     Reapable ONLY when the recorded identity (port + docroot [+ leader
  //     birth time]) still matches the live row AND the recorded spawning
  //     harness is DEAD and the tree root is an orphan (PPID 1). No age gate:
  //     a marked tree whose harness is gone can belong to no live run.
  //   SHAPED — pre-marker legacy debt: a PPID-1 `-m http.server -d <docroot>
  //     <port>` row whose docroot carries THIS harness family's served-tree
  //     fingerprint — BOTH app.html AND tools/render/grade.json (the exact
  //     GH-248 preflight probe pair: both ship on every ref, and no
  //     unrelated project serves that pair), at the docroot (a web/ serve)
  //     or under docroot/web (a repo-root serve) — older than
  //     OB_SERVER_SWEEP_AGE_MS (default = the profile age threshold). A
  //     foreign hand-started server is saved by its parent (not PPID 1), by
  //     freshness (age gate), or by its shape (finisher review P1: a lone
  //     app.html was too loose — an unrelated project's aged orphan could
  //     classify as ours).
  const srvAgeMs = Number(process.env.OB_SERVER_SWEEP_AGE_MS) || ageMs;
  // the MARKED pass is ONE function (NOTE-CIRED-RELEASED-CLAIM): the claim
  // registry's mutex-held reaping scan runs the same pass, range-scoped, before
  // it lets an orphaned server hold a dead claimant's band
  const { reapedPids, liveMarked } = markedOrphanServerPass(rows, { srvAgeMs, out });
  for (const r of rows) {
    const m = / -m http\.server -d (\S+)(?: --bind \S+)? (\d+)$/.exec(r.command);
    if (!m || r.ppid !== 1 || reapedPids.has(r.pid)) continue;
    if (etimeMs(r.etime) <= srvAgeMs) continue; // fresh: possibly deliberate
    if (liveMarked.some((ident) => rowMatches(r, ident))) continue; // a live
    // harness's marked server (wrapper dead, grandchild serving — r20 P2)
    const fingerprint = (root) => fs.existsSync(path.join(root, 'app.html'))
      && fs.existsSync(path.join(root, 'tools', 'render', 'grade.json'));
    let appTree = false;
    try {
      appTree = fingerprint(m[1]) || fingerprint(path.join(m[1], 'web'));
    } catch { /* unreadable docroot: not provably ours */ }
    if (!appTree) continue;
    if (!pidRowUnchanged(r)) continue; // exited/recycled since the snapshot
    reapServerTree(r, `shaped, ppid 1, etime ${r.etime}, port ${m[2]}`, out);
  }
  return out;
}

// ---- tracked static-server lifecycle (GH-294) --------------------------------
/** Spawn the gate's throwaway `python3 -m http.server` with a lifecycle that
 * can actually be torn down: `python3` on this box is a WRAPPER whose child
 * holds the listening socket (measured — see reapOwnServer above), so the
 * bare `server.kill()` every gate uses reaps the wrapper and ORPHANS the
 * real server (the GH-294 debt class). detached:true makes the child a
 * process-GROUP leader, so stopStaticServer can signal wrapper + grandchild
 * together by tracked pid — never by name. */

// ---- port-band arbitration (GH-338) -----------------------------------------
// Parallel lanes carry assigned port bands (the multi-session convention:
// 30-wide blocks — 9300-9329, 9440-9469, …) and the render tools derive CDP
// rotation windows (scenario-render's 9493 family, hero-extend's 11093
// family). Build-16 fix-qa1-p2 proved those bands were CONVENTION-ONLY: a
// lane band 9500-9519 overlapped the scenario-render rotation at 9493+
// (cross-attach: a suite talked to a renderer's Chrome), and the same
// too-narrow band self-inflicted a CDP=HTTP+15 landing on the lane's own
// http.server. The existing /tmp/ob-cdp-port-<port>.lock (scenario-batch /
// titlecard reservePort) is per-PORT only — nothing arbitrates RANGES.
//
// The registry: a claim is a directory
//   /tmp/ob-port-bands/<start>-<end>.<pid>
// created ATOMICALLY WITH ITS OWNER TOKEN (a prep dir carrying owner.json
// {pid, lstart, at} is renamed into place — readers never see a tokenless
// claim). A claim is LIVE while ANY of its HOLDERS is: the claimant
// (owner.json) or a leased holder (lease-<pid>.json sidecars — GH-389).
// Every holder is judged pid-alive AND recorded-birth-time-matching (pid
// reuse can never keep a stale claim alive or inherit one); stale claims —
// and dead claimants' abandoned prep dirs — are reaped on sight, dead
// holders' leases are pruned on sight, so a crashed lane never wedges a
// band. Ownership travels to child processes via OB_PORT_BANDS (env
// lineage — a batch driver claims once, its render children launch inside
// the claim), and the lineage is REGISTERED, not just asserted (GH-389:
// claimant-only liveness reaped a dead driver's claim out from under its
// still-running children): a claiming wrapper leases each spawned child
// (leasePortClaim) and inheriting processes self-lease on their first
// registry scan, so the claim's lifetime is the holder set's, not the
// claimant pid's.
// launchChrome refuses to bind a CDP port inside a LIVE FOREIGN claim, and
// spawnStaticServer refuses the same for http ports — a collision becomes
// one honest throw at claim time instead of a cross-attached suite
// mid-battery.
//
// WRITERS ARE SERIALIZED BY A KERNEL-OWNED MUTEX: an exclusive loopback
// bind of BAND_MUTEX_PORT (review GH-338 r2+r3: every /tmp-file mutex we
// tried had a takeover race, a tokenless window or a cross-user wedge; and
// lock-free timestamp ordering lets an unpublished older claim outrank a
// committed one). A socket bind is the one single-host mutex the kernel
// arbitrates and RELEASES ON PROCESS DEATH — there is no stale-lock state
// to recover, no permission seam between users, and exactly one winner per
// acquisition. Under it, the overlap scan is authoritative; readers stay
// lockless (stale reads are refusal-side conservative and self-heal on the
// next scan).
//
// The intra-band HTTP/CDP layout is defined ONCE, here (the fix-qa1-p2
// lesson): a lane band's first half hosts http servers (start+0, +1, …),
// its second half hosts CDP endpoints (start+BAND_CDP_OFFSET, +1, …). With
// BAND_MIN_WIDTH 30 and BAND_CDP_OFFSET 15 the halves cannot collide, and
// neither derived port can escape the claimed range. Rotation-window claims
// (pure CDP ranges) simply skip the layout helper.
// OB_PORT_BANDS_DIR is a TEST SEAM (GH-389): the hygiene gate stages
// dead-claimant lineages in a PRIVATE registry because a shared box can be
// running lanes on OLDER harness versions whose reap-on-sight predates
// leases — they reap any dead-claimant claim regardless of live holders
// (empirically confirmed mid-arm on 2026-08-06), which would make the arm
// verdict depend on foreign lanes' timing. Real lanes NEVER set it: a
// split registry cannot arbitrate anything.
export const PORT_BANDS_DIR = process.env.OB_PORT_BANDS_DIR
  ?? '/tmp/ob-port-bands';
export const BAND_MIN_WIDTH = 30;
export const BAND_CDP_OFFSET = 15;
// the registry writers' mutex — an obscure fixed loopback port, never used
// for Chrome/http traffic. A foreign service squatting it surfaces as the
// honest 10 s acquisition error below, never as silent misarbitration.
// OB_BAND_MUTEX_PORT is a TEST SEAM (GH-1119): a test that stages a PRIVATE
// registry (OB_PORT_BANDS_DIR) also arbitrates its writers on a private
// loopback port, so its claims and reaping scans never hold the host-wide
// :47997 that live lanes and CI jobs queue on (node batteries starved real
// claims past the 10 s bound). It is refused without a private registry (a
// split mutex over the SHARED registry would arbitrate nothing) and in a CI
// or release context (GITHUB_ACTIONS / CI / OB_CI_BANDS set).
export const BAND_MUTEX_PORT = (() => {
  const v = process.env.OB_BAND_MUTEX_PORT;
  if (v === undefined || v === '') return 47997;
  const port = Number(v);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`OB_BAND_MUTEX_PORT=${v} is not a port in 1024-65535 (GH-1119 test seam)`);
  }
  const ciKey = ['GITHUB_ACTIONS', 'CI', 'OB_CI_BANDS'].find((k) => process.env[k]);
  // a set OB_PORT_BANDS_DIR is no proof of isolation (review GH-1119 P2): the
  // registry is compared CANONICALLY with the shared default, so /tmp vs
  // /private/tmp, a trailing slash or a relative spelling never pass as private
  const canon = (d) => {
    const abs = path.resolve(d);
    try { return fs.realpathSync(abs); } catch { /* not created yet */ }
    try { return path.join(fs.realpathSync(path.dirname(abs)), path.basename(abs)); } catch { return abs; }
  };
  const shared = !!process.env.OB_PORT_BANDS_DIR
    && canon(process.env.OB_PORT_BANDS_DIR) === canon('/tmp/ob-port-bands');
  if (!process.env.OB_PORT_BANDS_DIR || shared || ciKey) {
    const why = ciKey ? `with ${ciKey} set`
      : shared ? `over the shared registry (OB_PORT_BANDS_DIR=${process.env.OB_PORT_BANDS_DIR} is /tmp/ob-port-bands)`
        : 'without a private OB_PORT_BANDS_DIR registry';
    throw new Error(`OB_BAND_MUTEX_PORT is a test seam: refused ${why} `
      + '— a split mutex over the shared registry arbitrates nothing (GH-1119)');
  }
  return port;
})();
// GH-1119: where a mutex hold's time goes — the reaping scan, and the orphan
// reaps inside it (ms, reset at each acquisition, reported with the hold)
const MUTEX_HOLD = { scan: 0, reap: 0, evidence: 0 };

// ---- declared suite port inventories (GH-410) --------------------------------
// The #305 merge grew e2e-playback's session set to CDP+0..CDP+23 — under
// the layout law (cdp(i) = start+BAND_CDP_OFFSET+i) that is start+38, which
// SILENTLY ESCAPES a default 30-wide band: the suite's own derivations are
// raw `CDP + i` arithmetic that no bandLayout guard ever sees, so the escape
// surfaced as a foreign-band launch refusal MID-SUITE (lane T, build 17) —
// the exact cross-attach class GH-338 exists to prevent, one lane over.
// The cure is declarative: a suite that derives ports beyond the default
// band publishes its PORT INVENTORY as a static, text-parseable export
//   export const PORT_INVENTORY = { http: 1, cdp: 24 };
// which run-gate.mjs reads as TEXT (a suite is never imported to ask it —
// importing one RUNS it) and sizes the band claim with. bandLayout validates
// a declared inventory against the claimed band and THROWS on overflow
// (the fix-qa1-p2 precedent: an escape is a refusal, never a silent claim).

/** Parse a suite file's declared PORT_INVENTORY. Returns { http, cdp } or
 * null when the file declares nothing. Throws on a malformed or ambiguous
 * declaration — tolerating one would silently re-open the escape this
 * exists to close. Recognition rules (review GH-410 r1 P2 + r4 P2, fail
 * closed):
 *   • block comments are stripped first — a commented-out declaration can
 *     neither declare nor hide one;
 *   • a declaration line may be INDENTED (legal JS; the column-zero anchor
 *     silently missed those) but nothing except whitespace may precede
 *     `export` on its line — a quoted fixture string (e2e-harness-hygiene
 *     stages one) or a `//` comment is prefixed and never counts;
 *   • the whole declaration must sit on ONE line with bare integer
 *     literals; a line that STARTS the declaration but does not parse
 *     (multi-line object, expression values) THROWS rather than silently
 *     reading as undeclared;
 *   • more than one recognized declaration THROWS (ambiguous).
 * Ruled residual: a clean declaration-shaped line inside a TEMPLATE
 * LITERAL still matches — the repo's staged-fixture idiom builds sources
 * from quoted line arrays (excluded by the prefix rule), never template
 * blocks, and a false positive only widens a claim, never narrows one. */
/** ---- JS SOURCE READER (GH-750; FIX2 = class S3: a tokenizer, not a heuristic) -----------
 * One reader behind every text law in this harness that must tell CODE from
 * PROSE in a JavaScript source: stripComments (below), blankStrings (the
 * port-offset law in lib/ci-bands.mjs) and whatever reader comes next. Two
 * hand-written scanners preceded it — a flat single-mode one (issue #750: a
 * nested template closed the outer one, a regex with a quote opened a string)
 * and a stack scanner with a last-character regex-vs-division rule (review
 * rounds 1 and 2 on PR #795 each found holes in that rule: an object
 * expression's `}` read as a block end, an interpolation frame's empty
 * history, a trailing-dot number, a Unicode identifier, the contextual
 * keyword `of`). Two rounds of patching a heuristic was the signal to stop
 * hand-writing one: the spans come from a real JavaScript tokenizer — the
 * vendored acorn (tools/render/lib/vendor/acorn, MIT; ecmaVersion latest,
 * sourceType module, allowHashBang, onComment) — so template nesting, the
 * hashbang line, Unicode identifiers, contextual keywords and numeric forms
 * are decided by acorn's own machinery, never by us.
 *
 * AMENDMENT (FIX4 = review round 3 on #795, class S4; S6/C3 asked for it by
 * name). `30488be0`'s commit message said "the regex-versus-division class is
 * closed by CONSTRUCTION here". THAT CLAIM IS FALSE AND IS WITHDRAWN. Regex
 * versus division is not decidable by any fixed lookbehind, and this pair is
 * the proof — both accepted by V8, both with `:` as the preceding token and
 * b_stat as the context, opposite correct answers:
 *     l: function f() {}
 *     /re/.test(x);                        // a REGEX: the label's function is a statement
 *     n = a ? b : function () {} / 2 + z;  // a DIVISION: the alternative is an operand
 * A tokenizer that answers such a source answers it by GUESSING. What the
 * claim cost was measured: `obj?.return / 2`, `obj?.in / 2`, `obj?.typeof / 2`
 * and `x = async function () {} / 2` each read as a regex that swallowed the
 * rest of the line, and the port law's reader returned `maxOffset: null,
 * unknown: []` — SILENT, and worse than the hand scanner it replaced, which
 * read all four correctly. Three things replace the claim.
 *
 *   1. THREE MEASURED RULES (R1 `?.`, R2 function/class, R3 a module's
 *      `await`) in tools/render/lib/acorn-obparser.mjs, applied through
 *      acorn's own `Parser.extend` so the vendored bytes stay untouched and
 *      BOTH entry points into acorn in this repo — that lib's
 *      parse-first-fence and these readers — are the same reader.
 *      web/tools/js-scan-surface.mjs enumerates the context tracker's
 *      decision surface with V8 (`new vm.Script`) as the independent oracle
 *      and measures what the rules are worth; the readers' test asserts the
 *      counts against a live run rather than against this comment.
 *   2. A CERTIFICATE, because rules are not a proof. Every scan is attempted
 *      as a PARSE first (onToken/onComment). A parse that succeeds certifies
 *      the token stream is grammatically consistent: no other reading of
 *      those characters is a program. The result carries `certified: true`.
 *   3. A NAMED NON-PASS when it does not. A FRAGMENT (the hygiene suite
 *      stages half declarations, and a fragment is not a defect) and a source
 *      whose reading the grammar refuses both fall back to the TOKENIZER,
 *      with `certified: false` and a named `uncertified` reason; the
 *      port-offset law in lib/ci-bands.mjs turns that into an `unknown` entry
 *      carrying the reason, so an unjudgeable source prints a row instead of
 *      reading as "there is nothing here".
 *
 * The certificate is NECESSARY AND NOT SUFFICIENT and its hole is PUBLISHED,
 * not assumed to be zero: js-scan-surface.mjs counts the wrong readings a
 * successful parse still accepts, and that number is an asserted measurement.
 * Every reading the three rules leave wrong belongs to the undecidable class
 * above.
 *
 * PRESERVATION TABLE (the geometry law: output length == input length and
 * every newline stays in place; blanking is by span, newlines are never
 * touched; tested on every tracked source):
 *   span              stripComments                blankStrings
 *   line comment      spaces (markers too) — or    untouched
 *                     kept verbatim under
 *                     keepLineComments
 *   block comment     spaces (markers too)         untouched
 *   hashbang line     a line comment (above)       untouched
 *   string literal    untouched                    spaces, quotes included (as the base did)
 *   regex literal     untouched                    the two `/` kept, body and flags spaces
 *                                                  (FIX1 S2: the element survives, the
 *                                                  arithmetic cannot)
 *   template literal  untouched                    spaces from the opening backtick to its
 *                                                  matching close — text, `${`, `}` AND the
 *                                                  expression code between them (the
 *                                                  whole-template law: a template literal is
 *                                                  not code to the port law, nested or not;
 *                                                  keeping interpolation code visible was
 *                                                  measured on #795 to read `${PORT}` + x as
 *                                                  `PORT + x` in 8 files). The parser still
 *                                                  SCANS every interpolation, so a nested
 *                                                  template, string or regex inside one can
 *                                                  never derail the spans that follow it.
 *   everything else   untouched                    untouched
 *
 * FAIL CLOSED. A source the tokenizer cannot read — an unterminated string,
 * template or regex, an invalid character — throws a JsScanError named
 * `js-scan-unreadable <line>:<col> <message>` (jsScanUnreadable = true, with
 * line/column). There is no fallback to a hand scanner and no skip: the lint
 * reports the file as a problem row (lib/ci-bands.mjs js-scan-unreadable),
 * run-gate refuses a suite whose declaration it cannot read, and the readers'
 * test holds every tracked source readable. Likewise when acorn itself cannot
 * be loaded (a copied web/ tree whose tools/render link dangles): the
 * launcher and the servers in this module keep working, the readers throw the
 * same named error.
 *
 * `scanJsSource(text)` exposes the spans as per-character KINDS for the tests
 * and the measurement script: LINE / BLOCK for comments, STRING, REGEX, and
 * TEMPLATE on every character from a template's opening backtick to its
 * matching close (expression code inside an interpolation carries TEMPLATE
 * only; a string or regex inside it carries its own bit as well). Results are
 * memoised per source text (the lint runs a dozen laws over each file). */
export const JS_SCAN = Object.freeze({ LINE: 1, BLOCK: 2, STRING: 4, TEMPLATE: 8, REGEX: 16 });
export class JsScanError extends Error {
  constructor(message, { line = null, column = null, pos = null, cause = null } = {}) {
    super(`js-scan-unreadable ${line ?? '?'}:${column ?? '?'} ${message}`);
    this.name = 'JsScanError'; this.jsScanUnreadable = true; this.line = line; this.column = column; this.pos = pos;
    if (cause) this.cause = cause;
  }
}
// The patched reader is loaded ONCE, from the repository's real path first and the web/tools/render link second (a
// web/ tree copied on its own keeps the link); when neither resolves the readers fail closed by name and nothing
// else in this module is affected — the launcher must not die because a copied tree lost its parser.
// BOTH specifiers are LITERALS, and that is load-bearing twice over: tools/render/lib/parse-first-fence.mjs refuses
// a computed dynamic import (`import(new URL(rel, import.meta.url).href)`, the shape 30488be0 shipped, put that gate
// 10 findings into the red on a tree where the merge base is clean), and js-scan-measure.mjs's mirror walker follows
// literal specifiers to build the base-reader closure. The second literal resolves THROUGH the web/tools/render
// symlink, which is why that walker has to resolve repository symlinks — see mirrorClosure.
let obParserModule = null; let acornLoadError = null;
try { obParserModule = await import('../../tools/render/lib/acorn-obparser.mjs'); } catch (e) { acornLoadError = e; }
if (obParserModule === null) { try { obParserModule = await import('./render/lib/acorn-obparser.mjs'); } catch (e) { acornLoadError = e; } }
const SCAN_CACHE = new Map(); const SCAN_CACHE_MAX = 1024; // memo: the lint's laws read the same text a dozen times, and the readers' test reads the whole tree more than once — one parse per source (the cache holds kinds and spans, never the token objects)
/** Read one source's spans, PARSE FIRST. Three outcomes, and the point of the middle one is that it is not silent:
 *   certified   the patched PARSER accepted the whole source, so the token stream is grammatically consistent — no
 *               other reading of those characters is a program. This is the outcome for every tracked JS source.
 *   uncertified the parser refused, the TOKENIZER read it anyway, and the result says so by name. Two kinds of
 *               source land here and the reader cannot tell them apart, which is why it reports rather than
 *               decides: a FRAGMENT (the hygiene suite stages half declarations and quoted lines to prove what a
 *               law refuses — a lint reads spans, node runs programs) and a source whose only tokenization the
 *               grammar rejects, which is what a mis-read `/` looks like from the inside.
 *   throws      the source is not even LEXICALLY readable — an unterminated string, template or regex, an invalid
 *               character. A named JsScanError, as before; there is no fallback to a hand scanner and no skip.
 * The certificate is a NECESSARY condition, not a sufficient one: js-scan-surface.mjs measures how many wrong
 * readings a successful parse still accepts, and publishes the number instead of assuming it is zero. */
const ACORN_OPTS = Object.freeze({ ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, locations: true });
function acornSpans(src) {
  if (!obParserModule) throw new JsScanError(`the vendored acorn parser could not be loaded (${acornLoadError?.message ?? 'no candidate path resolved'})`, { cause: acornLoadError });
  const Parser = obParserModule.obParser();
  const tokens = []; const comments = [];
  const onComment = (block, text, start, end) => comments.push({ block, start, end });
  try {
    Parser.parse(src, { ...ACORN_OPTS, onComment, onToken: (t) => tokens.push(t) });
    return { tokens, comments, certified: true, uncertified: null };
  } catch (parseError) {
    tokens.length = 0; comments.length = 0; // the parser emits tokens up to the point it refused; none of them are evidence
    try {
      for (const t of Parser.tokenizer(src, { ...ACORN_OPTS, onComment })) tokens.push(t);
    } catch (e) {
      const loc = e?.loc ?? null;
      throw new JsScanError(e?.message?.replace(/\s*\(\d+:\d+\)\s*$/, '') ?? 'unreadable', { line: loc?.line ?? null, column: loc?.column ?? null, pos: e?.pos ?? null, cause: e });
    }
    const loc = parseError?.loc ?? null;
    const why = String(parseError?.message ?? 'the grammar refused this source').replace(/\s*\(\d+:\d+\)\s*$/, '');
    return { tokens, comments, certified: false, uncertified: `js-scan-uncertified ${loc?.line ?? '?'}:${loc?.column ?? '?'} ${why}` };
  }
}
export function scanJsSource(text) {
  const src = String(text);
  const hit = SCAN_CACHE.get(src); if (hit) return hit;
  const { tokens, comments, certified, uncertified } = acornSpans(src);
  const kinds = new Uint8Array(src.length);
  for (const c of comments) for (let i = c.start; i < c.end; i++) kinds[i] = c.block ? JS_SCAN.BLOCK : JS_SCAN.LINE;
  // template extents: from an opening backtick to its matching close, counting `${` … `}` pairs on a stack so a nested
  // template or an object literal inside an interpolation cannot close the outer one early (the parser already made
  // that decision; the stack only walks its token stream)
  const templates = []; const stack = []; // stack entries: { open, braces } — braces = open `{` inside the current interpolation
  const regexes = []; const strings = [];
  for (const t of tokens) {
    const label = t.type.label;
    if (label === '`') { if (stack.length && stack[stack.length - 1].inExpr === false) { const fr = stack.pop(); templates.push([fr.open, t.end]); } else stack.push({ open: t.start, inExpr: false, braces: 0 }); continue; }
    if (!stack.length) { if (label === 'string') strings.push([t.start, t.end]); else if (label === 'regexp') regexes.push([t.start, t.end, t.value?.flags?.length ?? 0]); continue; }
    const top = stack[stack.length - 1];
    if (label === '${') { top.inExpr = true; top.braces = 0; continue; }
    if (top.inExpr) {
      if (label === '{') top.braces += 1;
      else if (label === '}') { if (top.braces === 0) top.inExpr = false; else top.braces -= 1; }
      else if (label === 'string') strings.push([t.start, t.end]);
      else if (label === 'regexp') regexes.push([t.start, t.end, t.value?.flags?.length ?? 0]);
    }
  }
  if (stack.length) { // a template (or an interpolation inside one) still open at end of input: the tokenizer reports no lexical error for it, the span walker does — fail closed
    const at = stack[0].open; const before = src.slice(0, at); const line = before.split('\n').length; const column = at - (before.lastIndexOf('\n') + 1);
    throw new JsScanError(stack[stack.length - 1].inExpr ? 'Unterminated template expression' : 'Unterminated template', { line, column, pos: at });
  }
  for (const [s, e] of templates) for (let i = s; i < e; i++) kinds[i] |= JS_SCAN.TEMPLATE;
  for (const [s, e] of strings) for (let i = s; i < e; i++) kinds[i] |= JS_SCAN.STRING;
  const regexSpans = regexes.map(([s, e, flags]) => ({ start: s, end: e, close: e - flags - 1 }));
  for (const r of regexSpans) for (let i = r.start; i < r.end; i++) kinds[i] |= JS_SCAN.REGEX;
  const result = { kinds, comments, strings, regexes: regexSpans, templates, open: null, certified, uncertified };
  if (SCAN_CACHE.size >= SCAN_CACHE_MAX) SCAN_CACHE.delete(SCAN_CACHE.keys().next().value);
  SCAN_CACHE.set(src, result);
  return result;
}
/** The certificate of one source, for a reader that must report rather than guess: `{ certified, uncertified }`,
 * where `uncertified` is a NAMED reason and never null when `certified` is false. A source that is not even
 * lexically readable still throws JsScanError — the two non-passes are different facts and stay different. */
export function jsScanCertificate(text) {
  const { certified, uncertified } = scanJsSource(String(text));
  return { certified, uncertified };
}
/** Blank every comment (line and block, the hashbang line included) of a JS source with spaces, keeping newlines and
 * column positions; keepLineComments leaves `//…` text in place (the one-line declaration laws below must still see a
 * trailing comment and refuse it). Comments inside template interpolations are comments and go. JS ONLY: the source is
 * read by the JS scanner, so a stylesheet throws JsScanError (a CSS number unit such as `1px` is not JS) — a CSS
 * reader uses stripCssComments below. */
export function stripComments(text, { keepLineComments = false } = {}) {
  const src = String(text); const { comments } = scanJsSource(src);
  const out = src.split('');
  for (const c of comments) {
    if (!c.block && keepLineComments) continue;
    for (let i = c.start; i < c.end; i++) if (out[i] !== '\n') out[i] = ' ';
  }
  return out.join('');
}
/** Blank every comment of a CSS source with spaces, keeping newlines and column positions. CSS has only block comments,
 * slash-star to star-slash (a `//` is text, e.g. inside `url(https://…)`); they do not nest, and an unterminated one runs
 * to the end of the input. Strings ('…', "…") are kept verbatim with their backslash escapes, so a `/*` inside one opens nothing; an
 * unterminated string ends at the line, as CSS tokenizes it. */
export function stripCssComments(text) {
  const src = String(text); let out = ''; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      if (i < n) { out += '  '; i += 2; }
      continue;
    }
    if (c === "'" || c === '"') {
      out += c; i++;
      while (i < n && src[i] !== c && src[i] !== '\n') {
        if (src[i] === '\\' && i + 1 < n) { out += src[i] + src[i + 1]; i += 2; continue; }
        out += src[i]; i++;
      }
      if (i < n && src[i] === c) { out += c; i++; }
      continue;
    }
    out += c; i++;
  }
  return out;
}
/** Blank every string, regex and template LITERAL of a JS source with spaces per the preservation table above, keeping
 * newlines and column positions, so a fixture string, a log message or a pattern never reads as code. Comments are left
 * as they are — strip them first when a reader needs both gone. */
export function blankStrings(text) {
  const src = String(text); const { strings, regexes, templates } = scanJsSource(src);
  const out = src.split('');
  const blank = (s, e) => { for (let i = s; i < e; i++) if (out[i] !== '\n') out[i] = ' '; };
  for (const [s, e] of templates) blank(s, e);
  for (const [s, e] of strings) blank(s, e);
  for (const r of regexes) { blank(r.start + 1, r.close); blank(r.close + 1, r.end); }
  return out.join('');
}

export function parsePortInventory(text) {
  // comments are blanked by the string-aware stripper (GH-687 review r10 refuter: a
  // `/*` inside a `//` comment used to swallow a declaration 80 lines below it)
  const src = stripComments(text, { keepLineComments: true }); // block comments blanked; `//` kept so a trailing comment still fails the one-line law
  const decls = [];
  let started = 0; // lines that BEGIN a declaration, parseable or not
  for (const line of src.split('\n')) {
    if (!/^\s*export\s+const\s+PORT_INVENTORY\b/.test(line)) continue;
    started += 1;
    // the initializer is validated THROUGH its terminator (review r13 P2:
    // `= { http: 1, cdp: 1 } && { http: 1, cdp: 25 };` must fail closed,
    // never parse as the first object) — nothing but `;` may follow.
    const m = /^\s*export\s+const\s+PORT_INVENTORY\s*=\s*\{([^}]*)\}\s*;?\s*$/
      .exec(line);
    if (m) decls.push(m);
  }
  if (started === 0) return null;
  if (started > 1) {
    throw new Error('multiple PORT_INVENTORY declarations found — '
      + 'ambiguous, refusing (GH-410)');
  }
  if (decls.length === 0) {
    throw new Error('a PORT_INVENTORY declaration starts but does not parse '
      + '— declare it on ONE line with bare integer literals, e.g. '
      + '`export const PORT_INVENTORY = { http: 1, cdp: 24 };` (failing '
      + 'closed: an unreadable declaration must never silently read as '
      + 'undeclared) (GH-410)');
  }
  const m = decls[0];
  // the WHOLE object body is validated, member by member (review GH-410 r3
  // + r5 + r10 P2s): each member must be exactly `http: <int>` or
  // `cdp: <int>` — expressions (`24 + 1`), floats (`1.5`), duplicates
  // (valid JS whose LAST value wins while a naive read takes the first)
  // and foreign syntax (`...MORE`, unknown keys) all fail CLOSED, because
  // any of them could make the parsed inventory under-count the suite's
  // real derivations — the exact escape this declaration exists to end.
  const inv = {};
  for (const part of m[1].split(',').map((s) => s.trim())
    .filter((s) => s !== '')) {
    const f = /^(http|cdp)\s*:\s*(\d+)$/.exec(part);
    if (!f) {
      throw new Error(`PORT_INVENTORY declaration is malformed at `
        + `'${part}' — each member must be exactly \`http: <integer>\` or `
        + '`cdp: <integer>` (expressions, spreads, unknown keys and floats '
        + 'are refused, never truncated) (GH-410)');
    }
    if (f[1] in inv) {
      throw new Error(`PORT_INVENTORY declares '${f[1]}' more than once — `
        + 'ambiguous, refusing (GH-410)');
    }
    inv[f[1]] = Number(f[2]);
  }
  if (!('http' in inv) || !('cdp' in inv)) {
    throw new Error('PORT_INVENTORY declaration is malformed — BOTH fields '
      + 'are required, e.g. `export const PORT_INVENTORY = '
      + '{ http: 1, cdp: 24 };` (GH-410)');
  }
  // feasibility bounds (review r16 P2: an oversized cdp made run-gate build
  // and deduplicate tens of thousands of shift candidates — a hang, not a
  // refusal). http is bounded by its half; cdp by a generous practical cap
  // (the largest real suite declares 25) that still keeps every candidate
  // set tiny.
  if (inv.http < 1 || inv.cdp < 1 || inv.http > BAND_CDP_OFFSET
    || inv.cdp > 512) {
    throw new Error(`PORT_INVENTORY declares http ${inv.http} + cdp `
      + `${inv.cdp} — bounds are 1 <= http <= ${BAND_CDP_OFFSET} (the http `
      + 'half) and 1 <= cdp <= 512 (GH-410)');
  }
  return inv;
}

/** PORT_FLAGS — the wrapped tool's own declaration of what its numeric
 * port-like command-line flags MEAN (GH-687, review r10 P2: run-gate used to
 * GUESS — `--port` was taken as the http pin although capture-034-play
 * reads it as its CDP port, and `--http-port` was no pin at all). One line,
 * next to PORT_INVENTORY:
 *   export const PORT_FLAGS = { '--port': 'cdp', '--serve': 'http' };
 * Keys are the flags as typed (`--x`), values one of:
 *   'http' — the tool's http base (widened by PORT_INVENTORY.http),
 *   'cdp'  — its CDP base (widened by PORT_INVENTORY.cdp),
 *   'band' — a `--x A-B` range the tool claims itself,
 *   'none' — numeric but not a port (`--viewport 1280`).
 * Same laws as parsePortInventory: nothing but whitespace before `export`,
 * one line, plain quoted keys and values, a started-but-unparseable line or
 * a second declaration THROWS. Returns null when the tool declares none. */
export const PORT_FLAG_ROLES = new Set(['http', 'cdp', 'band', 'none']);
export function parsePortFlags(text) {
  const src = stripComments(text, { keepLineComments: true });
  const decls = [];
  let started = 0;
  for (const line of src.split('\n')) {
    if (!/^\s*export\s+const\s+PORT_FLAGS\b/.test(line)) continue;
    started += 1;
    const m = /^\s*export\s+const\s+PORT_FLAGS\s*=\s*\{([^}]*)\}\s*;?\s*$/.exec(line);
    if (m) decls.push(m[1]);
  }
  if (started === 0) return null;
  if (started > 1) throw new Error('multiple PORT_FLAGS declarations found — ambiguous, refusing (GH-687)');
  if (decls.length === 0) {
    throw new Error('a PORT_FLAGS declaration starts but does not parse — declare it on ONE line with '
      + "quoted flags and roles, e.g. `export const PORT_FLAGS = { '--port': 'cdp', '--serve': 'http' };` (GH-687)");
  }
  const out = {};
  const body = decls[0].trim();
  if (body === '') return out; // `{}` = the tool declares it accepts NO port-like flag
  for (const item of body.split(',')) {
    if (item.trim() === '') continue; // a trailing comma
    const kv = /^\s*(["'])(--[\w-]+)\1\s*:\s*(["'])(\w+)\3\s*$/.exec(item);
    if (!kv) throw new Error(`PORT_FLAGS entry \`${item.trim()}\` does not parse — entries are 'flag': 'role' with a quoted --flag (GH-687)`);
    if (!PORT_FLAG_ROLES.has(kv[4])) throw new Error(`PORT_FLAGS role '${kv[4]}' for ${kv[2]} is not one of ${[...PORT_FLAG_ROLES].join(' | ')} (GH-687)`);
    if (kv[2] in out) throw new Error(`PORT_FLAGS declares ${kv[2]} twice (GH-687)`);
    out[kv[2]] = kv[4];
  }
  return out;
}

/** The band width a declared inventory needs under the ONE layout law:
 * the CDP half starts at start+BAND_CDP_OFFSET, so cdp(n-1) must fit. */
export function bandWidthForInventory({ http = 1, cdp = 1 } = {}) {
  return Math.max(BAND_MIN_WIDTH, BAND_CDP_OFFSET + cdp);
}

/** Lane-parameterized suite ARTIFACT scratch (GH-410 third leg, the #408
 * landing incident): fixed shared /tmp paths (/tmp/obexport-e2e,
 * /tmp/obrec-e2e) let a foreign lane's suite-start rmSync nuke another
 * lane's artifacts MID-RUN while every port was properly lane-split — the
 * scratch dir now rides the SAME lane axis the ports do (OB_E2E_CDP_PORT
 * is per-lane by the band convention, so the derived dir is too). */
export function laneArtifactDir(tag, lanePort) {
  const p = Number(lanePort);
  if (!/^[a-z0-9-]+$/.test(String(tag)) || !Number.isInteger(p)) {
    throw new Error(`laneArtifactDir: bad tag/port ${tag}/${lanePort}`);
  }
  return `/tmp/${tag}-${p}`;
}

/** GH-294 static-server MARKER sidecars — a DELIBERATELY SHARED, cross-
 * process family, unlike laneArtifactDir's per-lane scratch: a marker names
 * one spawn (leader pid + port + docroot + birth time + the SPAWNING harness
 * pid) so a LATER process — the startup self-sweep, e2e-retry's
 * post-SIGKILL reap of a dead suite's servers — can attribute an orphaned
 * http.server group with certainty. Per-pid file names make the family
 * collision-free across lanes; nothing is ever wiped by prefix, and every
 * consumer revalidates the live row (pid + port + docroot + lstart) before
 * it signals. The hygiene arm-8e scan exempts the family BY NAME, and every
 * consumer must reach it through these helpers, never by spelling the path
 * (issue #664 c: a `/tmp/${n}` in e2e-retry.mjs was this family in a string
 * form the scan cannot vouch for — red on main every night). Hygiene arm 8f
 * pins the helpers. */
/** The family's directory. OB_SERVER_MARKER_DIR is a TEST seam only (the
 * OB_PORT_BANDS_DIR precedent): hygiene arm 8f plants and reads a sidecar
 * in a private dir so a concurrent lane's startup sweep — which prunes any
 * marker whose identity matches no live http.server row — cannot delete it
 * between the write and the read (review r2 P2). Production lineages inherit
 * the default and MUST agree on it: a consumer under a different dir stops
 * seeing a writer's markers. */
export function serverMarkerDir() {
  return process.env.OB_SERVER_MARKER_DIR || '/tmp';
}
const SERVER_MARKER_RE = /^obw-e2e-server-(\d+)\.json$/;
export function serverMarkerPath(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`serverMarkerPath: bad pid ${pid}`);
  }
  return path.join(serverMarkerDir(), `obw-e2e-server-${pid}.json`);
}
/** Every parseable marker on the box: [{ ...recorded identity, file, name }].
 * Unparseable files are skipped here (the sweep's own pass prunes them); a
 * missing dir reads as no markers. The computed `file`/`name` are assigned
 * LAST: a marker JSON carrying its own `file` key must never redirect a
 * consumer's rm off the validated sidecar path. */
export function readServerMarkers() {
  const dir = serverMarkerDir();
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => SERVER_MARKER_RE.test(n));
  } catch { return []; }
  const out = [];
  for (const name of names) {
    const file = path.join(dir, name);
    let m = null;
    try { m = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
    out.push({ ...m, file, name });
  }
  return out;
}

/** The ONE intra-band port-math definition (see the section header).
 * `inventory` (GH-410, optional): the suite's declared port needs — the
 * layout REFUSES a band that cannot host them, at claim time, instead of
 * letting the suite's own raw `CDP + i` arithmetic escape mid-run. */
export function bandLayout(start, end, inventory = null) {
  const width = end - start + 1;
  if (width < BAND_MIN_WIDTH) {
    throw new Error(`port band ${start}-${end} is ${width} wide — the lane `
      + `layout needs >= ${BAND_MIN_WIDTH} (http half + CDP half; GH-338)`);
  }
  if (inventory) {
    const { http = 1, cdp = 1 } = inventory;
    if (http > BAND_CDP_OFFSET) {
      throw new Error(`band ${start}-${end}: declared http inventory ${http} `
        + `exceeds the http half (${BAND_CDP_OFFSET} slots) — the layout law `
        + `fixes cdp(0) at start+${BAND_CDP_OFFSET} (GH-338/GH-410)`);
    }
    if (BAND_CDP_OFFSET + cdp > width) {
      throw new Error(`port band ${start}-${end} (${width} wide) cannot host `
        + `the declared inventory http ${http} + cdp ${cdp}: `
        + `cdp(${cdp - 1}) = ${start + BAND_CDP_OFFSET + cdp - 1} escapes the `
        + `band end ${end}. LAYOUT OVERFLOW is a refusal, never a silent `
        + `escape (the fix-qa1-p2 self-collision class) — claim a band >= `
        + `${bandWidthForInventory(inventory)} wide (GH-410)`);
    }
  }
  return {
    start,
    end,
    /** i-th http server port: start+i, confined to the first half. */
    http(i = 0) {
      if (i < 0 || i >= BAND_CDP_OFFSET) {
        throw new Error(`band ${start}-${end}: http index ${i} escapes the `
          + `http half [${start}, ${start + BAND_CDP_OFFSET - 1}]`);
      }
      return start + i;
    },
    /** i-th CDP port: start+BAND_CDP_OFFSET+i, confined to the band. */
    cdp(i = 0) {
      const p = start + BAND_CDP_OFFSET + i;
      if (i < 0 || p > end) {
        throw new Error(`band ${start}-${end}: cdp index ${i} escapes the `
          + `CDP half [${start + BAND_CDP_OFFSET}, ${end}]`);
      }
      return p;
    },
  };
}

/** kill(pid, 0) liveness: EPERM means alive-but-foreign-user (still LIVE
 * for arbitration purposes); ESRCH means gone. */
function bandPidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) {
    return e.code === 'EPERM';
  }
}

/** ps birth-time of one pid ('' when unreadable) — the generation token
 * that survives pid reuse (review GH-338 r1: on a long-lived busy host a
 * stale claim's pid can be recycled; kill(pid,0) alone would then treat an
 * unrelated process as the live owner forever). Same probe the server
 * markers use. */
function lstartOf(pid) {
  try {
    return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)],
      { encoding: 'utf8', env: psEnv() }).trim(); // GH-1143: one token form for every writer and reader
  } catch { return ''; }
}
let OWN_LSTART = null;
function ownLstart() {
  // cache only a SUCCESSFUL probe (review GH-389 r3 P2): caching a
  // transient ps failure ('') would permanently disable this process's
  // self-leasing — writeLeaseFile refuses token-less leases — and reopen
  // the dead-claimant reap race for its inherited claims.
  if (!OWN_LSTART) OWN_LSTART = lstartOf(process.pid);
  return OWN_LSTART;
}

/** Ensure the registry dir exists and is writable by EVERY user (review
 * GH-338 r1: 0755 under the first caller's account would EACCES a renderer
 * running as another user out of even disjoint claims). chmod is
 * best-effort — only the dir's owner can change it, and a pre-existing
 * correct mode needs no change. */
function ensureBandsDir() {
  fs.mkdirSync(PORT_BANDS_DIR, { recursive: true });
  try { fs.chmodSync(PORT_BANDS_DIR, 0o777); } catch { /* not ours */ }
}

/** The LIVE leased-holder pids of one claim dir (GH-389): each
 * `lease-<pid>.json` sidecar is judged by the owner.json discipline — pid
 * alive AND recorded birth time still matching. Leases are PUBLISHED
 * atomically with a mandatory birth token (writeLeaseFile), so a lease
 * whose body is unreadable or token-less is never a holder (review GH-389
 * r1 P2: pid liveness alone would let a recycled pid wedge the band —
 * contrast owner.json, whose token-less fallback predates GH-389 and is
 * scoped by the claim dir's own name). A dead holder's lease is pruned on
 * sight (racing reapers are idempotent; the claim dir is 0777 so ANY
 * user's scan can prune). Pruning (any rm/rename of a lease file) is
 * `prune: true` ONLY under the writers' mutex (review r11 P1: the
 * isolation rename momentarily hides a possibly-fresh lease, and a
 * concurrent mutex-held claim scan must never observe that window —
 * lockless scans JUDGE dead leases as non-holders and leave the files
 * for the next mutex-held scan to prune). */
function liveLeasePids(dir, { prune = false } = {}) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => /^lease-\d+\.json$/.test(n));
  } catch { return []; } // dir raced away: nothing to judge
  const out = [];
  for (const ln of names) {
    const lpid = Number(/^lease-(\d+)\.json$/.exec(ln)[1]);
    let holderLive = bandPidAlive(lpid);
    if (holderLive) {
      let token = null;
      try {
        token = JSON.parse(fs.readFileSync(path.join(dir, ln), 'utf8'));
      } catch { token = null; }
      if (!token?.lstart) holderLive = false; // no token, no hold (r1 P2)
      else {
        const now = lstartOf(lpid);
        // a TRANSIENT ps failure ('') is no verdict and keeps the holder
        // (kill(0) already proved the pid); a REAL mismatch is pid reuse
        if (lstartMismatch(now, token)) holderLive = false; // GH-1143: a young non-C token is no verdict
      }
    }
    if (holderLive) { out.push(lpid); continue; }
    if (!prune) continue; // lockless scan: judge-only (review r11 P1)
    // atomic ISOLATION before the prune (review r10 P2): a writer can
    // REPLACE this lease between our read and the rm (a recycled pid
    // publishing its fresh token at the same pathname) — a pathname rm
    // would delete the fresh lease while its holder believes itself
    // registered. rename wins or loses atomically against that publish:
    // the isolated file is re-judged, and a fresh live token is renamed
    // back into place and counted.
    const iso = path.join(dir,
      `.prune-${lpid}.${Math.random().toString(36).slice(2, 6)}.tmp`);
    try { fs.renameSync(path.join(dir, ln), iso); } catch { continue; } // raced
    let fresh = false;
    try {
      const token = JSON.parse(fs.readFileSync(iso, 'utf8'));
      if (token?.lstart && bandPidAlive(lpid)) {
        const now = lstartOf(lpid);
        fresh = !lstartMismatch(now, token);
      }
    } catch { /* torn/unreadable: never a holder */ }
    if (fresh) {
      try {
        fs.renameSync(iso, path.join(dir, ln));
        out.push(lpid);
      } catch { /* dir raced away */ }
    } else {
      try { fs.rmSync(iso, { force: true }); } catch { /* raced */ }
    }
  }
  return out;
}

/** Parse, stale-reap and return the LIVE claims in the registry. A claim's
 * HOLDER SET is its claimant (owner.json: pid + birth time) plus any leased
 * holders (`lease-<pid>.json` sidecars — GH-389: ownership travels to
 * children via the OB_PORT_BANDS lineage, so a run-gate wrapper or batch
 * driver can die while its spawned suite/render children still own the
 * band's endpoints; claimant-only liveness reaped the claim out from under
 * them and let a foreign lane cross-attach). Every holder obeys the same
 * discipline: live while its pid is alive AND its recorded birth time still
 * matches (pid reuse can never keep a stale claim alive or inherit one);
 * the CLAIM is live while ANY holder is. Stale claims — and dead
 * claimants' abandoned prep dirs (review GH-338 r3) — are reaped on sight,
 * dead holders' lease files are pruned on sight, so a crashed lane never
 * wedges a band. Tokens with an unreadable body fall back to pid liveness
 * alone (the lease pid rides its FILENAME, so a torn write can never wedge
 * a band either). */
/** `reap: true` is passed ONLY by callers already holding the writers'
 * mutex (claimPortBand's overlap scan — review r10 P1): the two-phase
 * tombstone makes a claim momentarily unparseable, and a lockless reaper
 * racing a mutex-held claim scan could hide the claim exactly while an
 * overlapping claim commits, then roll it back — two live overlapping
 * claims. Lockless scans therefore judge-and-SKIP a fully dead claim
 * (it refuses nobody) and leave its removal to the next mutex-held claim
 * scan — reap-at-claim-time is the moment that matters, and a crashed
 * lane still can never wedge a band. */
/** GH-1119: how many TCP listeners have a local port in [start, end] — ONE read of the kernel's socket
 * table (netstat on darwin, ss on linux), no walk over every process's fds. It gates endpointEvidence's
 * lsof (which walks them all: 0.4-0.7 s at normal priority, 8-15 s under nice 15 measured on this host,
 * inside the registry mutex): with nothing listening in a dead claim's range there is no endpoint to find.
 * null = no verdict (unknown platform, a failed read, or a table with no listener at all, which no real
 * host has): the caller runs the lsof as before. */
function listenersInRange(start, end) {
  const read = (cmd, args, portOf) => {
    let out = '';
    try { out = execFileSync(cmd, args, { encoding: 'utf8', timeout: 10000, maxBuffer: 16 << 20 }); } catch { return null; }
    const ports = [];
    for (const line of out.split('\n')) { const p = portOf(line); if (Number.isInteger(p)) ports.push(p); }
    return ports.length ? ports.filter((p) => p >= start && p <= end).length : null;
  };
  if (process.platform === 'darwin') {
    // tcp4  0  0  127.0.0.1.27100  *.*  LISTEN — the port follows the local address's last dot
    return read('netstat', ['-an', '-p', 'tcp'], (l) => {
      const m = /^tcp\S*\s+\d+\s+\d+\s+(\S+)\s+\S+\s+LISTEN\b/.exec(l);
      return m ? Number(m[1].slice(m[1].lastIndexOf('.') + 1)) : NaN;
    });
  }
  if (process.platform === 'linux') {
    // LISTEN 0 4096 127.0.0.1:27100 0.0.0.0:* — the port follows the local address's last colon
    return read('ss', ['-Hltn'], (l) => {
      const m = /^LISTEN\s+\d+\s+\d+\s+(\S+)\s/.exec(l);
      return m ? Number(m[1].slice(m[1].lastIndexOf(':') + 1)) : NaN;
    });
  }
  return null;
}

function liveBandClaims({ reap = false } = {}) {
  let names = [];
  try { names = fs.readdirSync(PORT_BANDS_DIR); } catch { return []; }
  const live = [];
  // Endpoint evidence for the would-reap path only (review GH-389 r6 P1,
  // the issue's own process-table cure): a claimant killed between an
  // endpoint spawn and its lease publish strands a live Chrome/
  // http.server that can never register itself — a fixed grace would only
  // DELAY that reap. Evidence is SOCKET-verified (review r7 P2: argv alone
  // let any unrelated process carrying a lookalike flag keep a dead
  // lane's claim alive): lsof names the pids actually LISTENING inside
  // the claimed range, and each must additionally match a harness
  // endpoint shape before its row becomes a lease (written from the
  // row's own pid + birth time — the mandatory token comes with the
  // evidence, tied to the endpoint's lifetime, no TTL). No lsof/ps
  // verdict = no evidence: the reap proceeds, the pre-GH-389 posture.
  const endpointEvidence = (start, end) => {
    let pids = [];
    try {
      pids = [...new Set(execFileSync('lsof',
        ['-nP', `-iTCP:${start}-${end}`, '-sTCP:LISTEN', '-Fp'],
        { encoding: 'utf8' }).split('\n')
        .filter((l) => /^p\d+$/.test(l)).map((l) => Number(l.slice(1))))];
    } catch { return []; } // no listener in range (lsof exits 1) / no lsof
    const out = [];
    for (const pid of pids) {
      let row = '';
      try {
        row = execFileSync('ps', ['-o', 'lstart=,command=', '-p', String(pid)],
          { encoding: 'utf8', env: psEnv() }).replace(/\n$/, ''); // GH-1143
      } catch { continue; } // raced its exit
      // lstart is asctime, a fixed 24-char column (serverGroupProbe)
      const m = /^(.{24})\s+(.*)$/.exec(row);
      if (!m) continue;
      if (!/--remote-debugging-port=\d+|-m http\.server\b|--user-data-dir=\/tmp\/obw-e2e-profile-/
        .test(m[2])) continue; // a listener, but not a harness endpoint
      out.push({ pid, lstart: m[1].trim() });
    }
    return out;
  };
  // claim-shaped push for a tombstone/grave/restored dir, with the REAL
  // owner token (review r15 P2: synthesized ''/[] identity let a reused
  // original pid read as owner and a transferred claim's descendants
  // read as foreign)
  const makeClaim = (claimName, dir, holders) => {
    const pm = /^(\d+)-(\d+)\.(\d+)$/.exec(claimName);
    if (!pm) return null;
    const token = ownerTokenOf(dir);
    return { start: Number(pm[1]), end: Number(pm[2]),
      pid: Number(pm[3]), dir, lstart: token.lstart, aka: token.aka,
      layout: token.layout, enforced: token.enforced, holders,
      claimantState: claimantStateOf(Number(pm[3]), token) }; // every shape names its claimant truthfully
  };
  // the sweep's process-table snapshot, taken at most ONCE per scan and only
  // when a dead/released foreign claim has a marked server inside its range
  let sweepRows = null;
  const sweepRowsOnce = () => { if (sweepRows === null) sweepRows = psRowsForSweep(); return sweepRows; };
  const pushAs = (claimName, dir, holders) => {
    const rc = makeClaim(claimName, dir, holders);
    if (rc) live.push(rc);
    return rc;
  };
  // a dir that VANISHED since the readdir snapshot was moved by its live
  // owner mid-scan (review r17/r18/r20 P1s): the claim may be at ANY of
  // its three shapes right now — the original name, a reap tombstone or
  // a grave (during a tombstone->grave transition the first two are BOTH
  // momentarily absent). Push the first shape that exists so no scan —
  // above all the mutex-held claim scan — can commit an overlap over a
  // claim that is merely mid-transition.
  const restoredRecheck = (claimName) => {
    const back = path.join(PORT_BANDS_DIR, claimName);
    const pushBack = () => {
      const rc = pushAs(claimName, back, liveLeasePids(back));
      if (rc) selfLeaseInherited(rc);
    };
    if (fs.existsSync(back)) { pushBack(); return; }
    let others = [];
    try {
      others = fs.readdirSync(PORT_BANDS_DIR).filter((n) =>
        n.startsWith('prep-')
        && (n.endsWith(`-reap-${claimName}`) || n.endsWith(`-rm-${claimName}`)));
    } catch { return; }
    for (const on of others) {
      const od = path.join(PORT_BANDS_DIR, on);
      const rc = makeClaim(claimName, od, liveLeasePids(od));
      if (!rc) return;
      if (!bandIsOwn(rc)) {
        // FOREIGN reader: conservative visibility — even an empty
        // counterpart is pushed; it either dies (next scan sees nothing)
        // or restores (already covered)
        live.push(rc);
        return;
      }
      if (/-reap-/.test(on)) {
        // an OWN claim mid-tombstone registers durably right here —
        // tombstones accept publishes and every retire re-check honors
        // them (review r17 P1)
        live.push(rc);
        selfLeaseInherited(rc);
        return;
      }
      // an OWN claim mid-GRAVE cannot be durably leased (graves take no
      // publishes — their re-check is already past), and pushing it as
      // owned-but-unregistered would let the retirer delete the grave
      // right after this assert passed (review r21 P1). The transition is
      // µs: wait it out — the retire either RESTORES the claim (leased
      // below) or removes it (honestly gone; an unprotected own scan is
      // the claim-legitimately-dead posture).
      for (let i = 0; i < 40; i++) {
        if (fs.existsSync(back)) { pushBack(); return; }
        if (!fs.existsSync(od)) break; // transition completed
        try { execFileSync('sleep', ['0.005']); } catch { break; }
      }
      if (fs.existsSync(back)) { pushBack(); return; }
      if (fs.existsSync(od)) live.push(rc); // wedged retirer: stay visible
      // to foreign readers; our own registration retries next scan
      return;
    }
    // the transition may have completed to a restore while we scanned
    if (fs.existsSync(back)) pushBack();
  };
  for (const name of names) {
    const prep = /^prep-(\d+)-/.exec(name);
    if (prep) {
      const full = path.join(PORT_BANDS_DIR, name);
      const tomb = /^prep-\d+-reap-(\d+-\d+\.\d+)$/.exec(name);
      if (tomb) {
        if (!fs.existsSync(full)) { restoredRecheck(tomb[1]); continue; }
        const reaperAlive = retirerAlive(full, Number(prep[1]));
        if (!reap || reaperAlive) {
          // a reap tombstone stays VISIBLE as its recorded claim (review
          // r14 P1): mid-flight (reaper alive) it may be rolled back any
          // instant, and abandoned (reaper dead) it may hold live
          // evidence pending recovery — treating the range as free in
          // either state would let an overlapping endpoint or claim
          // commit. Recovery/removal belongs to the mutex scan ALONE
          // (a lockless restore could race the mutex-held scan's
          // snapshot and hide the restored claim from it — r14 P1).
          // An inheritor's scan STILL registers here (review r17 P1): its
          // lease lands in the tombstone and every retire/recovery
          // re-check honors it — skipping the self-lease left the child
          // unregistered exactly while its claim was mid-reap.
          const trc = pushAs(tomb[1], full, liveLeasePids(full));
          if (trc) selfLeaseInherited(trc);
          continue;
        }
        // mutex-held scan, dead reaper (review r12 P1): an abandoned
        // tombstone with live holders — finalized leases, pending holds
        // or a publisher's fresh in-flight tmp (review r13 P2, its only
        // evidence when the phase-1 rename beat it) — RESTORES the claim
        // under its recorded original name; only an EMPTY one is swept.
        const holders = liveLeasePids(full, { prune: true });
        if (holders.length > 0 || livePendingHolds(full) > 0
          || hasFreshLeaseTmp(full)) {
          const restoredName = tomb[1];
          try {
            fs.renameSync(full, path.join(PORT_BANDS_DIR, restoredName));
          } catch { // target occupied / raced: STAY visible as the
            // tombstone this scan (review r14 P1) — the next scan retries
            pushAs(tomb[1], full, holders);
            continue;
          }
          // the restored claim is LIVE in THIS scan (review r13 P1): a
          // one-scan invisibility window would let an overlap commit.
          const rc = pushAs(restoredName,
            path.join(PORT_BANDS_DIR, restoredName), holders);
          if (rc) selfLeaseInherited(rc);
          continue;
        }
        // empty: retire via the invisible grave (review r15 P1 — the
        // re-check inside retireClaimDir is atomic with the removal, so
        // a holder that renamed in ahead of us restores instead of dying)
        if (!retireClaimDir(full, path.join(PORT_BANDS_DIR, tomb[1]))) {
          pushAs(tomb[1], path.join(PORT_BANDS_DIR, tomb[1]),
            liveLeasePids(path.join(PORT_BANDS_DIR, tomb[1])));
        } else {
          console.error(`[bands] swept abandoned reap tombstone of claim ${tomb[1]} `
            + `(reaper pid ${prep[1]} dead, no live holder) (GH-338)`);
        }
        continue;
      }
      const grave = /^prep-\d+-rm-(\d+-\d+\.\d+)$/.exec(name);
      if (grave) {
        if (!fs.existsSync(full)) { restoredRecheck(grave[1]); continue; }
        // a grave takes no NEW publishes (never exposed as a claim dir to
        // write into) and normally lives only for the µs of
        // retireClaimDir — but evidence that renamed in ahead of the
        // retire can be stranded by a preempted/crashed retirer, and a
        // grave carrying such evidence must stay VISIBLE to every reader
        // (review r16 P1: hiding it let a lockless port assertion accept
        // the range while the original holder lived). Recovery is
        // mutex-only, like the tombstones: live evidence restores the
        // claim, an empty abandoned grave is swept.
        if (!reap || retirerAlive(full, Number(prep[1]))) {
          if (liveLeasePids(full).length > 0 || livePendingHolds(full) > 0
            || hasFreshLeaseTmp(full)) {
            pushAs(grave[1], full, liveLeasePids(full));
          } else if (!fs.existsSync(full)) {
            // moved mid-inspection — restored by its live retirer (review
            // r18 P1): the original path carries the claim now
            restoredRecheck(grave[1]);
          }
          continue;
        }
        if (liveLeasePids(full, { prune: true }).length > 0
          || livePendingHolds(full) > 0 || hasFreshLeaseTmp(full)) {
          try {
            fs.renameSync(full, path.join(PORT_BANDS_DIR, grave[1]));
            const rc = pushAs(grave[1],
              path.join(PORT_BANDS_DIR, grave[1]), liveLeasePids(
                path.join(PORT_BANDS_DIR, grave[1])));
            if (rc) selfLeaseInherited(rc);
          } catch { /* occupied / raced: the next scan retries */ }
          continue;
        }
        if (!fs.existsSync(full)) { restoredRecheck(grave[1]); continue; }
        try {
          fs.rmSync(full, { recursive: true, force: true });
          console.error(`[bands] swept abandoned grave of claim ${grave[1]} `
            + `(retirer pid ${prep[1]} dead, no live holder) (GH-338)`);
        } catch { /* raced */ }
        continue;
      }
      // ordinary prep dir: reaped once its creator is gone (GH-338 r3 —
      // a claimant killed between mkdir(prep) and the rename)
      if (!bandPidAlive(Number(prep[1]))) {
        try {
          fs.rmSync(full, { recursive: true, force: true });
        } catch { /* raced */ }
      }
      continue;
    }
    const m = /^(\d+)-(\d+)\.(\d+)$/.exec(name);
    if (!m) continue; // foreign litter: never touch what we cannot parse
    const claim = { start: Number(m[1]), end: Number(m[2]),
      pid: Number(m[3]), dir: path.join(PORT_BANDS_DIR, name), lstart: '',
      aka: [], layout: false, enforced: false };
    let owner = null;
    try {
      owner = JSON.parse(
        fs.readFileSync(path.join(claim.dir, 'owner.json'), 'utf8'));
      claim.lstart = owner.lstart ?? '';
      // aka: prior claimant pids of a TRANSFERRED claim (review r7 P2) —
      // children hold OB_PORT_BANDS entries naming the ORIGINAL claimant,
      // and lineage continuity across transfers is what lets a holder
      // whose lease raced the migration re-register on its next scan.
      claim.aka = Array.isArray(owner.aka) ? owner.aka : [];
      claim.layout = owner.layout === true;
      claim.enforced = owner.enforced === true; // GH-410 escape-law arming
    } catch { /* no token: pid liveness alone decides below */ }
    // ONE claimant-state rule (claimantStateOf): alive + birth time still
    // matching + not released = live; a recorded token that no longer matches
    // is pid reuse; GH-389: an exiting claimant with live leased holders marks
    // its own hold released instead of removing the dir — the claim rides the
    // leases alone from that point. The state is kept on the claim so a
    // refusal can name it (NOTE-CIRED-RELEASED-CLAIM).
    claim.claimantState = claimantStateOf(claim.pid,
      { lstart: claim.lstart, at: Number(owner?.at), released: owner?.released === true }); // GH-1143: the token's age
    let claimantLive = claim.claimantState === 'live';
    // GH-389 (review r1 P1): an INHERITING process's scan is a registration
    // point — adopt the claim (self-lease) BEFORE judging the holder set,
    // so a batch driver SIGKILLed between spawning a render child and that
    // child's first scan does not get the band reaped out from under the
    // child by the child's own scan. A FOREIGN scan racing into that same
    // window can still reap (nothing on disk names the child until it
    // scans) — drivers that must close even that sliver lease their
    // children at spawn, the run-gate posture.
    selfLeaseInherited(claim);
    // NOTE-CIRED-RELEASED-CLAIM (companion to #705): a claim whose claimant is
    // DEAD or RELEASED is held by its leases alone. A lease pid that is an
    // ORPHANED harness http.server — its spawnStaticServer marker names a DEAD
    // harness and its tree root reparented to launchd (GH-294's own marked
    // rule, no age gate) — belongs to no live run; before this scan the
    // orphan held the band until some later launch's startup sweep aged it out,
    // and every claimant in between was refused with the DEAD pid named as the
    // LIVE owner. The mutex-held reaping scan runs that same pass, scoped to
    // this claim's ports, BEFORE the holder verdict (by pid, revalidated,
    // confirmed gone; a live harness's server is shielded exactly as in the
    // sweep). Lockless scans judge only (review r10/r11 P1). A live LINEAGE
    // holder (a node process of the run) is never touched: the claim stays
    // live and the refusal names that holder, not the dead claimant.
    const reap0 = Date.now();
    if (reap && !claimantLive && !bandIsOwn(claim)) reapOrphanServersForClaim(claim, name, sweepRowsOnce);
    // GH-926: an ORPHANED harness browser (its root reparented to launchd on
    // this claim's canonical profile path) is the same debt class — reaped in
    // the same window, before the lease and endpoint verdicts re-lease it.
    if (reap && !claimantLive && !bandIsOwn(claim)) reapOrphanBrowsersForClaim(claim, name);
    if (reap) MUTEX_HOLD.reap += Date.now() - reap0;
    // leased holders (GH-389): pid from the filename, birth time from the
    // body. A dead holder's lease is pruned on sight (racing reapers are
    // idempotent; the claim dir is 0777 so ANY user's scan can prune).
    let holders = [...(claimantLive ? [claim.pid] : []),
      ...liveLeasePids(claim.dir, { prune: reap })];
    // a FRESH in-flight lease tmp keeps the claim visible too (review r16
    // P1: an inheriting child between its tmp write and the rename has no
    // finalized holder yet — a lockless scan judging the claim dead would
    // let a foreign endpoint pass the band check in exactly that window)
    if (holders.length === 0 && livePendingHolds(claim.dir) === 0
      && !hasFreshLeaseTmp(claim.dir)) {
      // FINAL lease re-read (review r17 P1): a publisher that finalized its
      // tmp->rename between the snapshots above leaves no tmp and no
      // pending — only the durable lease, which this last look, ordered
      // AFTER the tmp check, cannot miss.
      holders = liveLeasePids(claim.dir);
    }
    if (holders.length === 0 && livePendingHolds(claim.dir) === 0
      && !hasFreshLeaseTmp(claim.dir)) {
      // OUR OWN inherited claim whose self-lease could not publish THIS
      // scan (transient ps failure starves the mandatory birth token —
      // review r8 P1) is never reaped BY US: the retry is our next scan,
      // and keeping it listed is refusal-side conservative for everyone
      // else. A foreign scan is unaffected (no lease is on disk for it).
      if (bandIsOwn(claim)) {
        claim.holders = [];
        live.push(claim);
        continue;
      }
      // LAST RESORT before the reap (review r6 P1): a live endpoint bound
      // inside the claimed range keeps the claim — registered as a real
      // holder so later scans are cheap again. Refusal-side conservative
      // by design: evidence can only extend a claim, never shed one.
      // GH-1119: nothing listening in the range (one socket-table read) means no endpoint to find, so
      // the lsof walk is skipped; any listener, or no verdict, runs it exactly as before
      const ev0 = Date.now();
      const ev = listenersInRange(claim.start, claim.end) === 0 ? [] : endpointEvidence(claim.start, claim.end);
      if (reap) MUTEX_HOLD.evidence += Date.now() - ev0;
      if (ev.length) {
        for (const r of ev) {
          try { writeLeaseFile(claim.dir, r.pid, r.lstart, 'discovery'); } catch { /* raced */ }
        }
        const revived = liveLeasePids(claim.dir, { prune: reap });
        if (revived.length) {
          claim.holders = revived;
          live.push(claim);
          continue;
        }
      }
      // fully dead, but this scan is LOCKLESS: judge-and-skip (review r10
      // P1 — see the function header). The claim refuses nobody; the
      // next mutex-held claim scan removes it. An ABSENT dir is a
      // transition, not a verdict (review r22 P1): a mutex-held reaper
      // may have renamed it after this scan's snapshot and restored it
      // with live evidence — re-check every shape before dropping it.
      //
      // RULED residual (review r23): a revival that begins ENTIRELY after
      // this scan's reads (reap -> new holder -> restore) can be missed
      // by this one scan. That is congruent with the pre-GH-389 design
      // floor — an assert concurrent with a fresh claimPortBand commit
      // always had the same one-scan blindness, and even a mutex-held
      // assert would release before its caller binds the port, so the
      // check-to-bind gap cannot be closed on the scan side at all. The
      // CLAIM-vs-CLAIM plane stays mutex-authoritative (overlaps are
      // impossible there); the assert plane stays what GH-338 declared
      // it: lockless, refusal-side conservative, self-healing next scan.
      if (!reap) {
        if (!fs.existsSync(claim.dir)) restoredRecheck(name);
        continue;
      }
      // TWO-PHASE reap (review r8 P1: the judgment above and a concurrent
      // lease publish were unserialized — a lease renamed into place
      // between the two could be deleted under its live holder). Phase 1
      // RENAMES the dir aside: rename is atomic, so it strictly orders
      // against any lease publish — a publish that lost the race throws
      // ENOENT to its publisher (who retries against the re-checked
      // registry on its next scan); a publish that WON is found by the
      // phase-2 re-check and rolls the claim back into place. The
      // tombstone carries the prep- prefix AND the original claim name
      // (review r12 P1): a reaper crashing between phases leaves debt the
      // prep sweep can JUDGE — live holders inside an abandoned tombstone
      // restore the claim under its recorded name instead of being swept
      // on the dead reaper pid alone.
      const tomb = path.join(PORT_BANDS_DIR,
        `prep-${process.pid}-reap-${name}`);
      stampRetirerToken(claim.dir); // generation token (r19 P2)
      try { fs.renameSync(claim.dir, tomb); } catch {
        // the dir moved under us — another retirer's tombstone/grave or a
        // rollback. This scan is AUTHORITATIVE (mutex-held), so the claim
        // must not silently drop from it (review r18/r20 P1): re-check all
        // three shapes and push whichever exists.
        restoredRecheck(name);
        continue;
      }
      // a FRESH in-flight `.lease-*.tmp` rides into the tombstone when a
      // publisher wrote it just before phase 1 (review r9 P1: its final
      // rename against the old path then ENOENTs, and reaping here would
      // leave that publisher no claim to retry against) — treat it as a
      // hold and roll back (hasFreshLeaseTmp; aged tmps are crash litter).
      if (liveLeasePids(tomb, { prune: true }).length > 0 || livePendingHolds(tomb) > 0
        || hasFreshLeaseTmp(tomb)) {
        try { fs.renameSync(tomb, claim.dir); } catch { continue; /* raced */ }
        claim.holders = liveLeasePids(claim.dir, { prune: true });
        live.push(claim);
        continue;
      }
      // reap so a crashed lane never wedges its band (racing reapers are
      // idempotent; rm needs write on the registry dir — 0777). Unexpired
      // PENDING holds were already honored above (review r4 P1). The
      // removal itself goes through the invisible grave (review r15 P1):
      // a holder that renamed into the tombstone ahead of us restores
      // the claim instead of dying with it.
      if (!retireClaimDir(tomb, claim.dir)) {
        claim.holders = liveLeasePids(claim.dir);
        live.push(claim); // restored (or state unknown): conservative-live
      } else {
        // by name in the log (NOTE-CIRED-RELEASED-CLAIM): a swept claim is
        // never a silent disappearance
        console.error(`[bands] swept stale claim ${name}: claimant pid ${claim.pid} `
          + `${claim.claimantState}, no live holder (GH-338)`);
      }
      continue;
    }
    claim.holders = holders;
    live.push(claim);
  }
  return live;
}

/** The profile path launchChrome gives CDP port `port` (GH-926: the
 * claim-time browser reap and its probe resolve the same path). */
export function profileDirForPort(port) {
  return `/tmp/obw-e2e-profile-${port}`;
}

/** The registry's range-scoped orphan-BROWSER reap (GH-926; see the call
 * site in liveBandClaims). A harness Chrome whose run was cancelled outlives
 * it reparented to launchd, keeps its lease and its listener, and every later
 * claim of the band was refused naming it until the 2 h startup sweep aged it
 * out. A tree qualifies only by the ONE census (foreignMarkerHoldersSync →
 * markerRowsOnPath, LAND-16 Z1) on the canonical profile path of a port
 * inside this claim: no AMBIGUOUS row, every ancestry root PPID 1, exactly one
 * browser root and no row classifyMarkerRows calls foreign, and the claim
 * holding a LAUNCH lease for the root whose birth time still matches
 * (launchChrome always leases its browser into the covering claim with
 * origin 'launch'; an unleased holder, or one leased only by discovery, is
 * not attributable to this claim and is never signalled). Killed by
 * discovered pid (root, marker rows, then the markerless kin snapshotted
 * first, kept only while the root outlived the snapshot), each revalidated,
 * confirmed gone; the profile is removed only after a fresh census finds no
 * holder and the directory is still the one the kill saw. A parented browser,
 * an unleased or discovery-leased one, or a listener without the marker is
 * untouched and the refusal stands. */
function reapOrphanBrowsersForClaim(claim, name) {
  for (let port = claim.start; port <= claim.end; port++) {
    const dir = profileDirForPort(port);
    // a port whose profile dir is absent costs no ps (dirless debt stays the
    // sweep's domain)
    try { if (!fs.lstatSync(dir).isDirectory()) continue; } catch { continue; }
    const on = foreignMarkerHoldersSync(dir);
    if (!on || !on.length || on.some((r) => r.ambiguous)) continue; // no verdict / nobody / held
    const pids = new Set(on.map((r) => r.pid));
    const roots = on.filter((r) => !pids.has(r.ppid));
    if (roots.some((r) => r.ppid !== 1)) continue; // parented: a live run's browser
    // the browser root: an ancestry root the classifier does not own as a
    // ppid-1 helper (a lone row is foreign exactly when it has no --type=)
    const browsers = roots.filter((r) => classifyMarkerRows([r], 0, null).foreign.length);
    if (browsers.length !== 1) continue;
    const root = browsers[0];
    if (classifyMarkerRows(on, root.pid, null).foreign.length) continue; // another holder on the path
    let lease = null;
    try {
      lease = JSON.parse(fs.readFileSync(path.join(claim.dir, `lease-${root.pid}.json`), 'utf8'));
    } catch { continue; } // no lease (not this claim's) / unreadable: no verdict
    // ownership is launchChrome's own publication only: a discovery lease
    // (endpointEvidence re-leasing a listener it merely found) or a body
    // without provenance never authorizes a signal
    if (!lease || lease.origin !== 'launch') continue;
    if (!lease.lstart || lstartOf(root.pid) !== lease.lstart) continue; // pid reused
    const kin = snapshotDescendants(root.pid).filter((d) => !pids.has(d.pid));
    // the kin walk is the root's ancestry only if the root outlived it
    if (!pidRowUnchanged(root) || lstartOf(root.pid) !== lease.lstart) continue;
    const tree = [root, ...on.filter((r) => r !== root), ...kin];
    const killed = [];
    for (const r of tree) {
      // revalidate immediately before the signal; kin may have reparented
      const row = currentRow(r.pid);
      if (typeof row !== 'object' || row === null || row.command !== r.command) continue;
      if (row.ppid !== r.ppid && row.ppid !== 1) continue;
      try { process.kill(r.pid, 'SIGKILL'); killed.push(r.pid); } catch { /* raced its own exit */ }
    }
    if (!killed.length) continue;
    const alive = tree.filter((r) => !confirmExitSync(r.pid, 5)).map((r) => r.pid);
    if (alive.length) {
      console.error(`[bands] orphan harness browser tree of ${dir} not confirmed `
        + `exited inside stale claim ${name} (signalled ${killed.join(', ')}; still `
        + `present ${alive.join(', ')}) — profile retained (GH-926)`);
      continue;
    }
    // the tree is gone, so nothing of it writes the profile any more: pin the
    // directory now and delete it only if the census finds no holder and the
    // pin still holds (a relaunch re-creates or writes it — then it stays)
    let dirId = null;
    try { const st = fs.lstatSync(dir); dirId = `${st.ino}:${st.mtimeMs}`; } catch { /* gone */ }
    const after = foreignMarkerHoldersSync(dir);
    let same = false;
    try { const st = fs.lstatSync(dir); same = dirId !== null && `${st.ino}:${st.mtimeMs}` === dirId; } catch { /* gone */ }
    if (after && !after.length && same) {
      try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); } catch { /* next sweep */ }
    }
    console.error(`[bands] reaped orphan harness browser pid(s) ${killed.join(', ')} `
      + `(port ${port}) inside stale claim ${name} (claimant pid ${claim.pid} `
      + `${claim.claimantState}; GH-926)`);
  }
}

/** The registry's range-scoped orphan-server reap (see the call site in
 * liveBandClaims): the sweep's MARKED pass over this claim's ports. */
function reapOrphanServersForClaim(claim, name, rowsOnce) {
  // markers first: only a MARKED server whose recorded port lies inside this
  // claim can be reaped here, so a registry with no such marker costs no ps
  let anyMarked = false;
  try {
    for (const n of fs.readdirSync(serverMarkerDir()).filter((x) => SERVER_MARKER_RE.test(x))) {
      let port = NaN;
      try { port = Number(JSON.parse(fs.readFileSync(path.join(serverMarkerDir(), n), 'utf8')).port); } catch { continue; }
      if (port >= claim.start && port <= claim.end) { anyMarked = true; break; }
    }
  } catch { return; } // no marker dir verdict: nothing to place
  if (!anyMarked) return;
  let rows = [];
  try { rows = rowsOnce(); } catch { return; } // no ps verdict → touch nothing
  const out = { serverKilled: [] };
  const srvAgeMs = Number(process.env.OB_SERVER_SWEEP_AGE_MS)
    || Number(process.env.OB_PROFILE_SWEEP_AGE_MS) || 2 * 3600 * 1000;
  markedOrphanServerPass(rows, { srvAgeMs, out,
    inRange: (port) => port >= claim.start && port <= claim.end,
    why: `held stale claim ${name} whose claimant pid ${claim.pid} is ${claim.claimantState}` });
  if (out.serverKilled.length) {
    console.error(`[bands] reaped orphan http.server pid(s) ${out.serverKilled.join(', ')} `
      + `inside stale claim ${name} (claimant pid ${claim.pid} ${claim.claimantState}; `
      + 'GH-294 marked rule at claim time)');
  }
}

/** The claimant's state from its pid and recorded token — ONE rule for every
 * claim shape (the ordinary dir, a restored tombstone, a grave): 'live' |
 * 'dead' | 'dead (pid reused)' | 'released' | 'dead, released'. */
function claimantStateOf(pid, token) {
  const alive = bandPidAlive(pid);
  if (!alive) return token?.released ? 'dead, released' : 'dead';
  if (token?.lstart) {
    const now = lstartOf(pid);
    if (lstartMismatch(now, token)) return 'dead (pid reused)'; // GH-1143: a young non-C token is no verdict
  }
  return token?.released ? 'released' : 'live';
}

/** One line naming WHO holds a claim (the refusal must never present a dead
 * or released claimant as the live owner): the claimant's state, then each
 * live holder pid with its command head and the ports it listens on inside
 * the claim (bounded; no ps/lsof verdict = the pid alone). */
function describeClaimHolders(c) {
  const parts = [`claimant pid ${c.pid} ${(c.claimantState ?? 'live').toUpperCase()}`];
  const holders = (c.holders ?? []).filter((p) => p !== c.pid).slice(0, 6);
  for (const pid of holders) {
    let cmd = '';
    try {
      cmd = execFileSync('ps', ['-o', 'command=', '-p', String(pid)],
        { encoding: 'utf8' }).trim().replace(/\s+/g, ' ').replace(/^\S*\//, '').slice(0, 90); // argv0 basename
    } catch { /* raced its exit */ }
    let ports = '';
    try {
      ports = [...new Set(execFileSync('lsof', ['-nP', '-a', '-p', String(pid),
        `-iTCP:${c.start}-${c.end}`, '-sTCP:LISTEN', '-Fn'],
      { encoding: 'utf8' }).split('\n').filter((l) => /^n/.test(l))
        .map((l) => l.replace(/^n.*:/, '')))].join(',');
    } catch { /* no listener inside the claim / no lsof */ }
    parts.push(`held by pid ${pid}${cmd ? ` (${cmd})` : ''}${ports ? ` listening :${ports}` : ''}`);
  }
  if (holders.length === 0 && c.claimantState && c.claimantState !== 'live') {
    parts.push('held by an in-flight lease or pending hold');
  }
  return parts.join('; ');
}

// same-process claims are REFERENCE-COUNTED (review GH-338 r1: two
// idempotent claims of one range returned two independent release handles —
// releasing either deleted the shared dir under the other consumer), and
// each handle's release is itself idempotent (review r2: double-releasing
// ONE handle must not double-decrement).
const OWN_CLAIMS = new Map(); // `${start}-${end}` → { dir, entry, refs, drop }
const BAND_INFLIGHT = new Map(); // `${start}-${end}` → in-flight claim (r4 P2)
let exitReaperInstalled = false; // ONE exit hook for every claim (review r2 P3)

/** Claims owned by THIS lane lineage: made by this process (pid + birth
 * time — a recycled pid never inherits), or inherited via OB_PORT_BANDS
 * (comma-separated `<start>-<end>.<pid>` entries a claiming driver exports
 * for its children; a dead ancestor's claim goes stale and is reaped before
 * this question matters). */
function bandIsOwn(claim) {
  if (claim.pid === process.pid
    && (!claim.lstart || claim.lstart === ownLstart())) return true;
  const inherited = (process.env.OB_PORT_BANDS ?? '').split(',');
  if (inherited.includes(`${claim.start}-${claim.end}.${claim.pid}`)) return true;
  // lineage continuity across transfers (review r7 P2): a transferred
  // claim's dir is re-tokened to the survivor pid, but children still
  // carry entries naming the ORIGINAL claimant — the aka chain keeps
  // their ownership (and their ability to re-lease) intact.
  return (claim.aka ?? [])
    .some((p) => inherited.includes(`${claim.start}-${claim.end}.${p}`));
}

/** One lease sidecar: `<claimDir>/lease-<pid>.json` carrying the SAME
 * token shape as owner.json ({pid, lstart, at}), PUBLISHED ATOMICALLY
 * (tmp + rename — readers must never see a torn body) and only ever WITH
 * a birth token (review GH-389 r1 P2: a token-less lease would fall back
 * to pid liveness alone, and a recycled pid could then keep a dead
 * lineage's claim alive indefinitely — the exact stale-lock state the
 * registry forbids; no ps verdict = no lease, the caller retries).
 * World-writable so any user's scan can prune a dead holder's lease (the
 * GH-338 cross-user stale-reap posture). The body also records the lease's
 * PROVENANCE (GH-926): `origin` is 'launch' only where launchChrome
 * publishes the browser it spawned itself, 'spawn' for the other spawn-time
 * registrars, 'self' for an inheritor's own lease and 'discovery' for a
 * listener endpointEvidence found; a body without `origin` (a pre-provenance
 * file) reads as discovery. Holder verdicts ignore it; only the orphan-browser
 * reap reads it. */
const LEASE_ORIGINS = new Set(['launch', 'spawn', 'self', 'discovery']);
function writeLeaseFile(dir, pid, lstart, origin) {
  if (!lstart) throw new Error(`lease for pid ${pid}: no ps birth-time verdict`);
  if (!LEASE_ORIGINS.has(origin)) throw new Error(`lease for pid ${pid}: bad origin ${origin}`);
  const file = path.join(dir, `lease-${pid}.json`);
  // dot-prefixed tmp: no scanner parses it as a lease; a crash between
  // write and rename leaves litter that dies with the claim dir
  const tmp = path.join(dir,
    `.lease-${pid}.${Math.random().toString(36).slice(2, 8)}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify({ pid, lstart, at: Date.now(), origin }));
  try { fs.chmodSync(tmp, 0o666); } catch { /* best effort */ }
  try { fs.renameSync(tmp, file); } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* dir raced away */ }
    throw e;
  }
  return file;
}

/** Register `pid` as an ADDITIONAL holder of `claim` (GH-389): the claim
 * then stays live while ANY holder lives, so a driver crash no longer
 * gets the band reaped out from under its still-running children. The
 * registration is race-free ONLY while some current holder is live —
 * run-gate leases its suite child immediately after the spawn, while the
 * wrapper itself is a live holder, so no reaper can judge the claim dead
 * mid-registration. Deliberate release is UNCHANGED: the claimant's
 * release/exit removes the whole claim dir, leases included — the wrapper
 * outlives its child on every non-crash path, and the crash path is
 * exactly what leases exist for. Releasing a lease is idempotent; a dead
 * holder's lease is pruned on sight by any later scan. */
export function leasePortClaim(claim, pid) {
  if (!claim?.dir) throw new Error('leasePortClaim: no claim dir');
  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error(`leasePortClaim: bad holder pid ${pid}`);
  }
  // bounded birth-time retry (review r5 P1): ps can transiently miss a
  // just-spawned pid, and a token-less lease is refused by design
  let ls = '';
  for (let i = 0; !ls && i < 5; i++) {
    ls = lstartOf(pid);
    if (!ls) { try { execFileSync('sleep', ['0.1']); } catch { break; } }
  }
  const file = writeLeaseFile(claim.dir, pid, ls, 'spawn');
  let released = false; // idempotent per handle (the GH-338 release law)
  return { file, release: () => {
    if (released) return;
    released = true;
    try { fs.rmSync(file, { force: true }); } catch { /* pruned on sight */ }
  } };
}

// GH-389 (review r4 P1): the spawn-time registration gap. spawn() returns
// before the child's lease is durably published — a claimant killed in
// that instant would leave the claim holder-less while the child lives,
// and a foreign scan could reap it before the child's own first scan
// adopts. A PENDING HOLD bridges exactly that gap: `pending-<pid>-*.json`
// keeps the claim alive for a BOUNDED grace window (time-based by
// construction — expired pendings are pruned on sight, so no permanent
// stale state can exist), long enough for the spawner's post-spawn lease
// or the child's first-scan self-lease to land. Registered holders (lease
// files) take over from there.
export const PENDING_GRACE_MS = 45000;

/** COUNT of unexpired pending holds in one claim dir; expired ones are
 * pruned on sight (a torn body falls back to the file's mtime — still
 * time-bounded, never a wedge). */
function livePendingHolds(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir)
      .filter((n) => /^pending-\d+-[a-z0-9]+\.json$/.test(n));
  } catch { return 0; } // dir raced away
  let live = 0;
  for (const n of names) {
    const file = path.join(dir, n);
    let at = null;
    try { at = JSON.parse(fs.readFileSync(file, 'utf8')).at; } catch { /* torn */ }
    if (!Number.isFinite(at)) {
      try { at = fs.lstatSync(file).mtimeMs; } catch { continue; /* gone */ }
    }
    if (Date.now() < at + PENDING_GRACE_MS) live += 1;
    else {
      try { fs.rmSync(file, { force: true }); } catch { /* raced */ }
    }
  }
  return live;
}

/** The owner token of one claim/tombstone dir, with the shape every
 * consumer needs (review r15 P2: a visible tombstone synthesizing
 * lstart ''/aka [] let a reused original pid read as owner and a
 * transferred claim's descendants read as foreign). */
function ownerTokenOf(dir) {
  try {
    const o = JSON.parse(
      fs.readFileSync(path.join(dir, 'owner.json'), 'utf8'));
    return { lstart: o.lstart ?? '', at: Number(o.at), // GH-1143: a non-C token's age bounds its grace
      aka: Array.isArray(o.aka) ? o.aka : [], released: o.released === true,
      // GH-410 (review r7 P1): only claims that DECLARE themselves lane
      // LAYOUTS arm the own-band escape law — a pure single-port/rotation
      // reservation (layout:false, and every pre-410 claim without the
      // field) must never make a sibling endpoint read as an escape.
      layout: o.layout === true, enforced: o.enforced === true };
  } catch {
    return { lstart: '', aka: [], released: false, layout: false,
      enforced: false };
  }
}

/** Stamp the RETIRER's identity into a dir about to become a tombstone/
 * grave (review r19 P2): the retirement names carry only a pid, and a
 * recycled pid would otherwise read as the active retirer forever —
 * wedging an empty abandoned tombstone as a live claim until the
 * unrelated process exits. Same pid+birth-time discipline as owner and
 * lease tokens; tokenless (older writer / failed stamp) falls back to
 * pid liveness alone. */
function stampRetirerToken(dir) {
  try {
    fs.writeFileSync(path.join(dir, 'reaper.json'), JSON.stringify(
      { pid: process.pid, lstart: ownLstart(), at: Date.now() }));
    try { fs.chmodSync(path.join(dir, 'reaper.json'), 0o666); } catch { /* best effort */ }
  } catch { /* tokenless: pid liveness decides */ }
}

/** Is the retirement dir's named pid still THIS generation's retirer? */
function retirerAlive(dir, pid) {
  if (!bandPidAlive(pid)) return false;
  try {
    const rt = JSON.parse(
      fs.readFileSync(path.join(dir, 'reaper.json'), 'utf8'));
    if (rt.lstart) {
      const now = lstartOf(pid);
      if (lstartMismatch(now, rt)) return false; // pid reused (r19 P2); a young non-C token is no verdict (GH-1143)
    }
  } catch { /* tokenless: pid liveness already said LIVE */ }
  return true;
}

/** Atomically retire a claim/tombstone dir (review r15 P1): rename it to
 * an INVISIBLE grave — ordinary-prep shape plus the recorded claim name,
 * never exposed as a claim, so no publisher can target it — re-check for
 * holder evidence that renamed in ahead of us, and only then remove.
 * Evidence found in the grave restores the claim to `restoreTo`. The
 * rename is the serialization point: a publish into the OLD path after
 * it throws ENOENT to its publisher, who retries against the re-checked
 * registry. Returns true when the dir was removed. */
function retireClaimDir(from, restoreTo) {
  const grave = path.join(PORT_BANDS_DIR,
    `prep-${process.pid}-rm-${path.basename(restoreTo)}`);
  stampRetirerToken(from); // the grave name carries OUR pid (r19 P2)
  try { fs.renameSync(from, grave); } catch { return false; } // raced
  if (liveLeasePids(grave).length > 0 || livePendingHolds(grave) > 0
    || hasFreshLeaseTmp(grave)) {
    try { fs.renameSync(grave, restoreTo); } catch { /* occupied/raced:
      the grave sweep recovers it on the next mutex scan */ }
    return false;
  }
  try { fs.rmSync(grave, { recursive: true, force: true }); } catch { /* raced */ }
  return true;
}

/** A FRESH in-flight `.lease-*.tmp` in `dir` — a publisher wrote it just
 * before a reap's phase-1 rename (its final rename against the old path
 * then ENOENTs), so it is that holder's only evidence and counts as a
 * hold (review r9 P1 + r13 P2). An AGED tmp is crash litter and is pruned
 * on sight. Shared by the phase-2 re-check and the abandoned-tombstone
 * recovery. */
function hasFreshLeaseTmp(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return false; }
  for (const n of names) {
    if (!/^\.lease-\d+\..*\.tmp$/.test(n)) continue;
    try {
      const f = path.join(dir, n);
      if (Date.now() - fs.lstatSync(f).mtimeMs < PENDING_GRACE_MS) return true;
      fs.rmSync(f, { force: true }); // aged crash litter
    } catch { /* raced */ }
  }
  return false;
}

/** Arm one pending hold on `claim` BEFORE a spawn whose lease follows the
 * spawn (run-gate's suite child, the endpoint spawns). release() is
 * idempotent; an unreleased hold (crash mid-spawn) self-expires. */
export function pendPortClaim(claim) {
  if (!claim?.dir) throw new Error('pendPortClaim: no claim dir');
  const file = path.join(claim.dir,
    `pending-${process.pid}-${Math.random().toString(36).slice(2, 8)}.json`);
  fs.writeFileSync(file, JSON.stringify({ pid: process.pid, at: Date.now() }));
  try { fs.chmodSync(file, 0o666); } catch { /* best effort */ }
  let released = false;
  return { file, dir: claim.dir, release: () => {
    if (released) return;
    released = true;
    try { fs.rmSync(file, { force: true }); } catch { /* pruned on expiry */ }
  } };
}

/** Pending holds on every OWN claim covering `port` (the endpoint-spawn
 * variant of pendPortClaim). Best-effort: [] when the registry has no
 * verdict. */
export function pendIntoOwnClaims(port) {
  const holds = [];
  try {
    for (const c of liveBandClaims()) {
      if (port >= c.start && port <= c.end && bandIsOwn(c)) {
        try { holds.push(pendPortClaim(c)); } catch { /* dir raced away */ }
      }
    }
  } catch { /* no registry verdict */ }
  return holds;
}

/** Lease an ENDPOINT process (Chrome, the static-server wrapper) into
 * every OWN claim covering `port` (review GH-389 r2 P1): endpoint
 * processes never scan the registry themselves, so a crash that takes
 * every node process in a lineage must not reap the claim while a spawned
 * browser/server still owns a socket inside the band — that reap is the
 * cross-attach class this registry exists to prevent. Called at spawn by
 * the process that just spawned the endpoint: the spawner is alive at that
 * instant, so the registration cannot race the stale-reaper. Best-effort;
 * a dead endpoint's lease is pruned on sight by any later scan. Returns
 * the SET of claim dirs where the lease provably published — the caller
 * releases only the matching pending holds (review r5 P1: an unpublished
 * lease must keep its hold armed; endpoints never self-scan, so this
 * writer is their only registrar). (The static server's socket-holding
 * GRANDCHILD is not knowable at spawn — the wrapper pid is leased; a
 * wrapper that dies solo under a live grandchild remains the server
 * sweep's marked-tree domain.) `origin` is the lease provenance
 * (writeLeaseFile): 'launch' is launchChrome's own browser publication, the
 * only lease the orphan-browser reap accepts as ownership (GH-926). */
export function leaseEndpointIntoOwnClaims(port, pid, lstart, origin = 'spawn') {
  const leased = new Set();
  // bounded birth-time retry (review r5 P1): ps can transiently miss a
  // just-spawned pid, and a token-less lease is refused by design
  let ls = lstart || '';
  for (let i = 0; !ls && i < 5; i++) {
    ls = lstartOf(pid);
    if (!ls) { try { execFileSync('sleep', ['0.1']); } catch { break; } }
  }
  try {
    for (const c of liveBandClaims()) {
      if (port >= c.start && port <= c.end && bandIsOwn(c)) {
        try {
          writeLeaseFile(c.dir, pid, ls, origin);
          if (fs.existsSync(path.join(c.dir, `lease-${pid}.json`))) {
            leased.add(c.dir);
          }
        } catch { /* no birth verdict / dir raced away: hold stays armed */ }
      }
    }
  } catch { /* no registry verdict: the lineage leases still cover */ }
  return leased;
}

// GH-389, the generic lineage half: a process that INHERITED a claim via
// OB_PORT_BANDS re-asserts it with its own lease on its first registry
// scan (launchChrome, spawnStaticServer and claimPortBand all scan), so a
// batch driver's render children hold their band without every driver
// growing an explicit leasePortClaim call. The scan calls this BEFORE its
// stale verdict (review r1 P1), so an inheritor's own scan ADOPTS a claim
// whose holders all died rather than reaping it. Once per claim dir per
// process; best-effort by construction: the write can only land while the
// claim dir still exists, so a lease can never resurrect an already-reaped
// band, and a write that raced a foreign reaper is detected by the
// post-write existence probe and simply retried on the next scan. The
// residual sliver — a FOREIGN scan reaping between the last holder's death
// and this inheritor's first scan — is closed on the primary path by
// run-gate's spawn-time lease (drivers that must close it lease their
// children at spawn).
const SELF_LEASED = new Set(); // claim dirs this process already holds
function selfLeaseInherited(claim) {
  if (claim.pid === process.pid || SELF_LEASED.has(claim.dir)) return;
  if (!bandIsOwn(claim)) return;
  try {
    const file = writeLeaseFile(claim.dir, process.pid, ownLstart(), 'self');
    if (fs.existsSync(file)) SELF_LEASED.add(claim.dir);
  } catch { /* dir raced away / unwritable: retry on the next scan */ }
}

/** Transfer one of THIS process's claims to another live pid (run-gate's
 * survivor quarantine: a Chrome that ignored SIGKILL still owns its CDP
 * port + profile, so the range must stay claimed under the SURVIVOR'S
 * lifetime — the claim then goes stale exactly when the survivor dies).
 * The dir is renamed to carry the new pid and drops out of this process's
 * refcount/exit-reaper bookkeeping. */
export function transferPortClaim(claim, pid) {
  const m = /^(\d+)-(\d+)\.(\d+)$/.exec(path.basename(claim.dir));
  if (!m) throw new Error(`transferPortClaim: unparseable claim ${claim.dir}`);
  const key = `${m[1]}-${m[2]}`;
  // the SURVIVOR's claim is published atomically WITH its token (prep +
  // rename — the standard create path), and only then is OUR dir removed:
  // no scanner can ever observe the old dir name paired with the new
  // token (review GH-347 r10: that mismatched state read as pid-reuse and
  // got the live survivor's claim reaped). The brief overlap of two live
  // same-range claims (ours + the survivor's) only strengthens refusals.
  const newDir = path.join(PORT_BANDS_DIR, `${key}.${pid}`);
  const prep = path.join(PORT_BANDS_DIR,
    `prep-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(prep);
  try {
    try { fs.chmodSync(prep, 0o777); } catch { /* best effort */ }
    // aka chain (review r7 P2): the transferred token records the prior
    // claimant pids so bandIsOwn keeps matching children's OB_PORT_BANDS
    // entries (which name the ORIGINAL claimant) — a holder whose lease
    // raced the migration below re-registers on its next scan instead of
    // silently losing its band. Bounded chain: repeated transfers cap at
    // the four newest identities.
    let aka = [Number(m[3])];
    let layout = false;
    let enforced = false;
    try {
      const prevOwner = JSON.parse(
        fs.readFileSync(path.join(claim.dir, 'owner.json'), 'utf8'));
      if (Array.isArray(prevOwner.aka)) {
        aka = [...new Set([...aka, ...prevOwner.aka])].slice(0, 4);
      }
      layout = prevOwner.layout === true; // survives the transfer (GH-410)
      enforced = prevOwner.enforced === true;
    } catch { /* tokenless original: the dir-name pid alone chains */ }
    fs.writeFileSync(path.join(prep, 'owner.json'), JSON.stringify(
      { pid, lstart: lstartOf(pid), at: Date.now(), aka, layout, enforced }));
    try { fs.chmodSync(path.join(prep, 'owner.json'), 0o666); } catch { /* best effort */ }
    // GH-389 (review r4 P1): holder sidecars MIGRATE with the claim — the
    // survivor path must not shed the child/endpoint leases that keep the
    // band held should the transfer target die while they still own
    // sockets. Dead sidecars ride along harmlessly (pruned on sight).
    // Per-file error isolation (review r5 P2): a lease pruned mid-copy must
    // not abort the remaining live ones; the post-rename stabilization
    // pass below re-judges whatever this snapshot missed.
    try {
      for (const n of fs.readdirSync(claim.dir)) {
        if (!/^lease-\d+\.json$/.test(n)) continue;
        try {
          fs.copyFileSync(path.join(claim.dir, n), path.join(prep, n));
          try { fs.chmodSync(path.join(prep, n), 0o666); } catch { /* best effort */ }
        } catch { /* pruned mid-copy: the stabilization pass re-judges */ }
      }
    } catch { /* dir raced away: the new owner token still holds */ }
    fs.renameSync(prep, newDir);
  } catch (e) {
    try { fs.rmSync(prep, { recursive: true, force: true }); } catch { /* sweep */ }
    throw e;
  }
  // migrate-until-STABLE (review r5 P2): lockless scans and holders can
  // publish leases into the OLD dir concurrently with the transfer; the
  // old dir is only removed below once a full pass finds nothing left to
  // copy, so a lease published mid-transfer cannot be silently shed.
  // The residual window (a lease landing after the final pass's readdir,
  // before the rm) SELF-HEALS rather than silently unprotecting (review
  // r7 P2): a displaced CHILD re-registers on its next scan — the aka
  // chain keeps its OB_PORT_BANDS entry owning the transferred dir — and
  // a displaced ENDPOINT is re-adopted by the would-reap listener
  // evidence before any reap can land.
  for (let pass = 0; pass < 5; pass++) {
    let copied = 0;
    let names = [];
    try { names = fs.readdirSync(claim.dir); } catch { break; } // gone
    for (const n of names) {
      if (!/^lease-\d+\.json$/.test(n)) continue;
      const dst = path.join(newDir, n);
      if (fs.existsSync(dst)) continue;
      try {
        // atomic publish into the VISIBLE dir (review r9 P2): a direct
        // copy to the final name lets a concurrent scanner read a
        // partial body and prune the lease as tokenless — tmp + rename,
        // exactly the writeLeaseFile discipline.
        const tmp = path.join(newDir,
          `.${n}.${Math.random().toString(36).slice(2, 6)}.tmp`);
        fs.copyFileSync(path.join(claim.dir, n), tmp);
        try { fs.chmodSync(tmp, 0o666); } catch { /* best effort */ }
        fs.renameSync(tmp, dst);
        copied += 1;
      } catch { /* pruned mid-copy: the next pass re-judges */ }
    }
    if (copied === 0) break;
  }
  const held = OWN_CLAIMS.get(key);
  if (held) { held.refs = 0; OWN_CLAIMS.delete(key); }
  try { fs.rmSync(claim.dir, { recursive: true, force: true }); } catch { /* stale-reap */ }
  const entry = `${key}.${process.pid}`;
  process.env.OB_PORT_BANDS = (process.env.OB_PORT_BANDS ?? '')
    .split(',').filter((e) => e && e !== entry).join(',');
  return newDir;
}

/** Refuse `port` when it lies inside a LIVE claim of a FOREIGN lane —
 * and, for a lane that HOLDS claims, when it ESCAPES all of its own
 * (GH-410). Exported for tools that bind sockets outside this module's
 * helpers.
 *
 * The escape law (GH-410; lane V's PR #418 recorded the second failure
 * mode): pre-410, a banded suite whose derivation left its claim either
 * bound an UNCLAIMED neighbor port silently (judged by nobody) or died
 * mid-battery on the foreign-claim throw with a diagnosis blaming the
 * NEIGHBOR ("claim your own band" — the lane HAD one; its suite outgrew
 * it). Both now surface as ONE honest launch-time refusal naming the
 * lane's own claims and the real cure: the suite's PORT_INVENTORY.
 * Lanes without claims (bare tools, un-banded runs) keep the pre-410
 * foreign-only behavior. */
export function assertPortOutsideForeignBands(port, what = 'port') {
  const ownAll = [];
  const ownEnforced = [];
  let foreign = null;
  for (const c of liveBandClaims()) {
    if (bandIsOwn(c)) {
      // only INVENTORY-ENFORCED lane claims ARM the escape law (review r7
      // P1 + r9 P1): a pure reservation (layout:false — scenario-batch's
      // single-port CDP holds, rotation windows, run-gate's canary probe
      // pair) says nothing about where the lane's OTHER endpoints belong,
      // and an un-enforced layout claim (an UNDECLARED suite wrapped onto
      // a band — hard-coded-port legacy gates included) made no promise
      // about its derivation shape, so both stay exactly pre-410. But
      // EVERY own claim AUTHORIZES the ports it covers (review r8 P1:
      // dropping pure reservations from the authorization set made
      // run-gate's own canary probe — an explicitly reserved pair beside
      // the lane band — read as an escape and abort every banded run).
      ownAll.push(c);
      if (c.layout === true && c.enforced === true) ownEnforced.push(c);
      continue;
    }
    if (port >= c.start && port <= c.end && !foreign) foreign = c;
  }
  if (ownEnforced.length
    && !ownAll.some((c) => port >= c.start && port <= c.end)) {
    throw new Error(`${what} ${port} ESCAPES this lane's claimed band(s) `
      + ownAll.map((c) => `${c.start}-${c.end}`).join(', ')
      + (foreign ? ' and lies inside the LIVE foreign port band '
        + `${foreign.start}-${foreign.end} (pid ${foreign.pid})` : '')
      + ' — the suite derives more ports than its claim hosts: declare or '
      + 'fix PORT_INVENTORY so run-gate sizes the claim to the real '
      + 'inventory (GH-410, GH-338)');
  }
  if (foreign) {
    throw new Error(`${what} ${port} lies inside the LIVE foreign port `
      + `band ${foreign.start}-${foreign.end} (pid ${foreign.pid}, `
      + `${foreign.dir}) — claim your own band via claimPortBand() and `
      + 'derive ports from its layout, or move outside the claimed range '
      + '(GH-338)');
  }
}

/** The registry writers' critical section: an exclusive loopback bind of
 * BAND_MUTEX_PORT. Kernel-arbitrated (one winner), kernel-released (a dead
 * or SIGKILLed holder frees it instantly) — no stale-lock recovery exists
 * because no stale state can. Bounded: a live wedged holder (or a foreign
 * squatter on the port) throws honestly after ~10 s. */
async function withBandsMutex(fn) {
  const net = await import('node:net');
  const deadline = Date.now() + 10000;
  let srv = null;
  for (;;) {
    // a FRESH server per attempt (review r4 P2): reusing one across failed
    // listens accumulates 'listening' callbacks and trips
    // MaxListenersExceededWarning during the supported contention path
    const cand = net.createServer();
    cand.unref();
    try {
      await new Promise((res, rej) => {
        cand.once('error', rej);
        cand.listen({ port: BAND_MUTEX_PORT, host: '127.0.0.1',
          exclusive: true }, res);
      });
      srv = cand;
      break;
    } catch (e) {
      cand.close();
      if (e.code !== 'EADDRINUSE') {
        throw new Error(`port-band registry mutex bind failed: ${e.message}`);
      }
      if (Date.now() > deadline) {
        throw new Error('port-band registry mutex (loopback :'
          + `${BAND_MUTEX_PORT}) stayed held for >10 s — a live claimant is `
          + 'wedged inside the (tiny) critical section, or a foreign '
          + 'service squats the port (GH-338)');
      }
      await sleep(25 + Math.floor(Math.random() * 50));
    }
  }
  // GH-1119: the hold is MEASURED — a long critical section starves every
  // other claimant on the host. OB_BAND_MUTEX_TRACE=1 reports every hold on
  // stderr (any other value: a file path, one JSON line per hold); a hold
  // over 5 s is reported on stderr always.
  const held0 = Date.now();
  MUTEX_HOLD.scan = 0; MUTEX_HOLD.reap = 0; MUTEX_HOLD.evidence = 0;
  try {
    return await fn();
  } finally {
    await new Promise((res) => srv.close(() => res()));
    const held = Date.now() - held0, waited = held0 - (deadline - 10000);
    const { scan, reap, evidence } = MUTEX_HOLD;
    const trace = process.env.OB_BAND_MUTEX_TRACE;
    const line = `[bands] registry mutex :${BAND_MUTEX_PORT} held ${held} ms by pid ${process.pid} `
      + `(reaping scan ${scan} ms, orphan reaps ${reap} ms and endpoint evidence ${evidence} ms of it; waited ${waited} ms to acquire)`;
    if (trace === '1' || held > 5000) console.error(line);
    if (trace && trace !== '1') {
      try { fs.appendFileSync(trace, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, port: BAND_MUTEX_PORT, held, waited, scan, reap, evidence }) + '\n'); } catch { /* trace only */ }
    }
  }
}

/** Claim [start, end] for this lane. The overlap scan and the claim-dir
 * creation run under the kernel-owned registry mutex, so the scan verdict
 * is authoritative — a committed claim can never be outranked afterwards
 * (review GH-338 r3). The claim dir appears atomically WITH its owner token
 * (prep + rename; the prep dir is reaped on every exception and, if a kill
 * lands mid-window, by the next reader's dead-pid sweep). Claims are
 * reference-counted per process, exported to children via OB_PORT_BANDS,
 * and released on process exit (a crash leaves a dead-owner dir the next
 * reader reaps). `layout: false` claims a pure range (render rotation
 * windows / single ports) without the lane HTTP/CDP split. `inventory`
 * (GH-410): the suite's declared port needs — the claim REFUSES a band the
 * layout cannot host (see bandLayout).
 * `lineageOverlap: 'refuse'` (GH-483): the overlap scan normally exempts
 * claims the OB_PORT_BANDS lineage carries (bandIsOwn) — correct for USING
 * an inherited claim, but an inherited entry is an unverifiable pid-only
 * token (env carries `start-end.pid`, no birth time), and run-gate's
 * GH-410 hull widening rode that exemption straight over a LIVE neighbor's
 * claim (build-18 incident: 9330-9359 widened to 9330-9369 over the live
 * 9360-9389 claim — the entry hand-me-down made the neighbor read as own).
 * Under 'refuse', an overlapping live claim that is not PROVABLY this
 * process's own (pid + birth time) refuses a DIFFERENT-range claim; the
 * exact same range stays claimable (the idempotent nested-wrapper pattern
 * — re-claiming inherited turf creates no new overlap). */
export async function claimPortBand(start, end,
  { layout = true, inventory = null, lineageOverlap = 'allow' } = {}) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end
    || start < 1024 || end > 65535) {
    throw new Error(`claimPortBand: bad range ${start}-${end}`);
  }
  if (start <= BAND_MUTEX_PORT && BAND_MUTEX_PORT <= end) {
    // the mutex is control plane, never data plane (review r4 P2): a band
    // covering it would derive a suite endpoint ON the registry's own
    // arbitration port and wedge every later claim behind that bind
    throw new Error(`claimPortBand: range ${start}-${end} covers the `
      + `registry mutex port ${BAND_MUTEX_PORT} — pick a band that avoids `
      + 'it (GH-338)');
  }
  // GH-687: the CI reserved range is never claimed from a non-CI process.
  // This is the ONE choke point every claimer passes — run-gate's assigned
  // and widened claims, and the tools that claim a default band directly
  // (test-sinkrest and the 626 captures used to default INTO 18760-18789 /
  // 191xx-194xx and would hold a live claim the CI job then refused under
  // GH-338 — the exact #687 red). CI context (GITHUB_ACTIONS=true, or the
  // operator's explicit OB_CI_BANDS=1) is checked FIRST so a CI job never
  // loads the table; locally the table is loaded lazily and a table that
  // fails to load refuses the claim (fail-closed, never a silent bypass).
  {
    const cib = await import('./lib/ci-bands.mjs');
    if (!cib.isCiContext(process.env)) {
      const msg = cib.ciBandRefusal(cib.loadCiBands(), start, end, process.env);
      if (msg) throw new Error(`claimPortBand: ${msg}`);
    }
  }
  const shape = layout ? bandLayout(start, end, inventory) : { start, end };
  const key = `${start}-${end}`;
  const perHandle = (state) => {
    let mine = false; // idempotent PER HANDLE (review r2 P2)
    return () => { if (mine) return; mine = true; state.drop(); };
  };
  // in-flight dedup (review r4 P2): two same-process callers racing the SAME
  // range before the first claim commits must converge on ONE dir + one
  // refcount — the second waits the first out, then takes the held path
  // (or retries afresh when the first refused).
  const inflight = BAND_INFLIGHT.get(key);
  if (inflight) {
    await inflight.catch(() => { /* the first refused: retry below */ });
    // the FULL option set rides the retry (review GH-483 r1 P2: dropping
    // lineageOverlap here silently reverted a racing 'refuse' caller to
    // the permissive default — the exact overlap the option forbids)
    return claimPortBand(start, end, { layout, inventory, lineageOverlap });
  }
  const held = OWN_CLAIMS.get(key);
  if (held && held.refs > 0) {
    // option reconciliation (review GH-410 r10 P2): the held claim's
    // owner.json recorded ITS layout/enforcement — a same-range re-claim
    // with different options would ride that metadata (the escape law
    // would silently stay disarmed for an inventory caller, or armed for
    // a bare one). Incompatible repeats are refused, never blended.
    // lineageOverlap reconciles the same way (review GH-483 r2 P2: a
    // strict caller losing the in-flight race to a permissive same-range
    // claim would otherwise ride a held claim whose overlap scan never
    // ran under its law — accepting the exact overlap it asked to refuse).
    if (held.layoutOpt !== (layout === true)
      || held.enforcedOpt !== (inventory !== null)
      || held.lineageOpt !== (lineageOverlap === 'refuse')) {
      throw new Error(`claimPortBand: range ${key} is already held by this `
        + 'process with incompatible options '
        + `(held layout=${held.layoutOpt} enforced=${held.enforcedOpt} `
        + `lineageRefuse=${held.lineageOpt}, `
        + `requested layout=${layout === true} `
        + `enforced=${inventory !== null} `
        + `lineageRefuse=${lineageOverlap === 'refuse'}) — release the held `
        + 'claim first (GH-410/GH-483)');
    }
    held.refs += 1;
    return { ...shape, dir: held.dir, release: perHandle(held) };
  }
  ensureBandsDir();
  const dir = path.join(PORT_BANDS_DIR, `${key}.${process.pid}`);
  // GH-1119: one LOCKLESS pass first. A dead claim with a live endpoint in its range gets its discovery
  // lease here, OUTSIDE the critical section, so the mutex-held scan below finds that holder and gathers
  // no evidence itself. Only an endpoint that appears between the two passes is looked for under the
  // mutex (the fallback keeps that verdict authoritative). Judge-only: nothing is reaped here.
  try { liveBandClaims(); } catch { /* the mutex-held scan decides */ }
  const work = withBandsMutex(async () => {
    const overlaps = (c) => c.start <= end && start <= c.end;
    // the ONE reaping scan: this caller holds the writers' mutex, so the
    // two-phase tombstone can never hide a claim from a concurrent claim
    // commit (review r10 P1)
    const scan0 = Date.now();
    const claims = liveBandClaims({ reap: true });
    MUTEX_HOLD.scan += Date.now() - scan0;
    for (const c of claims) {
      if (!overlaps(c)) continue;
      if (!bandIsOwn(c)) {
        // GH-1119: the refusal is DECIDED here, under the mutex; naming its
        // holders (a ps + an lsof per holder: 3-12 s measured at load ~80
        // under nice 15) waits for the release below — every claimant on
        // the host queues behind this critical section
        throw Object.assign(new Error('foreign claim'), { foreignClaim: c });
      }
      // GH-483: own-by-LINEAGE is not own-by-PROOF — an OB_PORT_BANDS
      // entry authorizes USING that exact claim, never parking a NEW,
      // different hull over it (the widening-escape class). Same-process
      // claims and exact same-range re-claims stay permitted — and
      // same-process needs the RECORDED birth token to match (review
      // GH-483 r1 P2: a tokenless claim whose dead claimant's pid was
      // recycled onto THIS process would otherwise read as proven own,
      // recreating the exact overlap the option forbids).
      if (lineageOverlap === 'refuse'
        && !(c.start === start && c.end === end)
        && !(c.pid === process.pid
          && c.lstart && c.lstart === ownLstart())) {
        throw new Error(`port band ${start}-${end} overlaps the LIVE claim `
          + `${c.start}-${c.end} (pid ${c.pid}, ${c.dir}) that this `
          + 'process reaches only through its OB_PORT_BANDS lineage — an '
          + 'inherited entry never licenses a NEW overlapping claim; pick '
          + 'a disjoint band (GH-483)');
      }
    }
    // atomic create WITH token: prep dir (reaped on exception here, by the
    // dead-pid sweep otherwise), token inside, rename into place. Modes are
    // world-writable so ANOTHER USER'S stale-reap can remove the dir and
    // its token (review r2: chmod on the registry parent alone is not
    // enough).
    const prep = path.join(PORT_BANDS_DIR,
      `prep-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
    fs.mkdirSync(prep);
    try {
      try { fs.chmodSync(prep, 0o777); } catch { /* best effort */ }
      // layout-ness is RECORDED (review GH-410 r7 P1): only lane-layout
      // claims arm the own-band escape law in assertPortOutsideForeignBands
      fs.writeFileSync(path.join(prep, 'owner.json'), JSON.stringify(
        { pid: process.pid, lstart: ownLstart(), at: Date.now(),
          layout: layout === true,
          // the escape law arms ONLY on inventory-ENFORCED lane claims
          // (review GH-410 r9 P1): an undeclared suite wrapped onto a band
          // made no promise about its derivation shape — hard-coded-port
          // legacy gates must stay wrappable exactly as pre-410
          enforced: layout === true && inventory !== null }));
      try { fs.chmodSync(path.join(prep, 'owner.json'), 0o666); } catch { /* best effort */ }
      fs.renameSync(prep, dir);
    } catch (e) {
      try { fs.rmSync(prep, { recursive: true, force: true }); } catch { /* sweep */ }
      throw e; // rename EEXIST/ENOTEMPTY: our own pid already holds this
      // exact dir — only reachable across a refs-tracking bug, never
      // silently adopted
    }
  }).catch((e) => {
    const c = e?.foreignClaim;
    if (!c) throw e;
    // the holders are NAMED (NOTE-CIRED-RELEASED-CLAIM): a dead or released
    // claimant is never presented as the live owner
    throw new Error(`port band ${start}-${end} overlaps the LIVE foreign `
      + `claim ${c.start}-${c.end} (${c.dir}): ${describeClaimHolders(c)} — pick a `
      + 'disjoint band, or wait for / free those holders (GH-338/GH-389)');
  });
  BAND_INFLIGHT.set(key, work);
  try { await work; } finally { BAND_INFLIGHT.delete(key); }
  const entry = `${key}.${process.pid}`;
  const prev = process.env.OB_PORT_BANDS ?? '';
  if (!prev.split(',').includes(entry)) {
    process.env.OB_PORT_BANDS = prev ? `${prev},${entry}` : entry;
  }
  const state = { dir, entry, refs: 1, drop: null,
    layoutOpt: layout === true, enforcedOpt: inventory !== null,
    lineageOpt: lineageOverlap === 'refuse' };
  state.drop = (atExit = false) => {
    if (state.refs <= 0) return;
    state.refs -= 1;
    if (state.refs > 0) return;
    OWN_CLAIMS.delete(key);
    // GH-389: a process dying while OTHER processes still hold this claim
    // (a crashed wrapper/driver whose exit hooks did run — every deliberate
    // path outlives its children) must not free the band under them. The
    // exit-path removal is TWO-PHASE like the reaper (review r14 P1: the
    // rename orders atomically against a child's concurrent FIRST
    // self-lease, which the flat snapshot-then-rm could delete along with
    // the claim, leaving the live child nothing to retry against). A
    // fresh lease / pending hold (review r9 P2) / in-flight tmp that rode
    // into the tombstone RETAINS the claim: the owner token is marked
    // released — kept, not removed, so the recorded birth time still
    // defeats claimant-pid reuse — and the claim then lives exactly as
    // long as its holders. An empty tombstone is removed. A crash between
    // phases leaves a recorded tombstone the next mutex scan recovers.
    // Explicit release() keeps the full-removal contract — a caller
    // releasing mid-run owns that ordering.
    if (atExit) {
      const tomb = path.join(PORT_BANDS_DIR,
        `prep-${process.pid}-reap-${path.basename(dir)}`);
      stampRetirerToken(dir); // generation token (r19 P2)
      try { fs.renameSync(dir, tomb); } catch { return; } // already reaped
      const retain = liveLeasePids(tomb).some((p) => p !== process.pid)
        || livePendingHolds(tomb) > 0 || hasFreshLeaseTmp(tomb);
      if (retain) {
        try {
          // atomic rewrite (review r2 P2): a truncate-then-die window
          // would leave an unparseable owner.json whose fallback is pid
          // liveness alone — a recycled claimant pid could then keep the
          // claim alive after every lease died. tmp + rename.
          const tmp = path.join(tomb,
            `.owner.${Math.random().toString(36).slice(2, 8)}.tmp`);
          fs.writeFileSync(tmp, JSON.stringify(
            { pid: process.pid, lstart: ownLstart(), at: Date.now(),
              released: true, layout: layout === true,
              enforced: layout === true && inventory !== null }));
          try { fs.chmodSync(tmp, 0o666); } catch { /* best effort */ }
          fs.renameSync(tmp, path.join(tomb, 'owner.json'));
        } catch { /* unwritable: pid death ends the hold anyway */ }
        try { fs.renameSync(tomb, dir); } catch { /* the tombstone stays
          visible and the next mutex scan recovers it */ }
        return;
      }
      // the removal goes through the invisible grave (review r15 P1): a
      // holder that renamed in ahead of us restores the claim instead of
      // dying with it (no released token then — this process is dying,
      // so its hold ends with its pid either way).
      retireClaimDir(tomb, dir);
      return;
    }
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* stale-reaped later */ }
    process.env.OB_PORT_BANDS = (process.env.OB_PORT_BANDS ?? '')
      .split(',').filter((e) => e && e !== entry).join(',');
  };
  OWN_CLAIMS.set(key, state);
  if (!exitReaperInstalled) { // one hook total, not one per claim (r2 P3)
    exitReaperInstalled = true;
    process.once('exit', () => {
      for (const s of OWN_CLAIMS.values()) { s.refs = Math.min(s.refs, 1); s.drop(true); }
    });
  }
  return { ...shape, dir, release: perHandle(state) };
}

let signalReaperInstalled = false;
let signalExitDeferred = false;
/** A wrapper that needs ASYNC teardown on a signal (run-gate.mjs: forward
 * the signal to its child, wait for the child's close, finalize the
 * ledger, THEN exit) calls this BEFORE any server spawns: the reaper below
 * then leaves the exit to the deferring owner — who promises to
 * process.exit() itself, so the 'exit' backstop still runs (review GH-347:
 * without this, the reaper's immediate process.exit preempted the child's
 * close handler in the same signal dispatch). */
export function deferSignalReaper() { signalExitDeferred = true; }
/** SIGINT/SIGTERM/SIGHUP route through process.exit so the exit backstop
 * runs (review r13 P2): a DETACHED server group no longer receives the
 * terminal's foreground Ctrl-C, and a raw signal death skips 'exit'
 * handlers — without this, an interrupted gate would strand its server
 * holding the port. Installed only once a detached server exists. */
let signalExitStarted = false;
export function installSignalReaper() { // exported for lib/endpoint-pair.mjs (GH-725 review r10: lock dirs die with the process)
  if (signalReaperInstalled) return;
  signalReaperInstalled = true;
  for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
    // process.on with a latch, not once (NOTE-CIRED-RELEASED-CLAIM, companion to
    // #705): a SECOND same signal during the exit sequence — a process-group
    // SIGTERM (GNU timeout, a terminal) plus run-gate's forward of the same
    // signal, or a double Ctrl-C — used to land on Node's RESTORED default
    // disposition once the one-shot listener had fired, and killed the process
    // mid-'exit' backstop: its DETACHED http.server group (never in the signalled
    // group) survived as an orphan, the wrapper saw that server's lease, wrote
    // released:true and the orphan held the band (measured 2026-09-08: group
    // SIGTERM → server + claim left behind; a single forwarded SIGTERM → clean).
    // Repeats are absorbed while the exit runs; a raw signal death skips 'exit'.
    process.on(sig, () => {
      if (signalExitDeferred || signalExitStarted) return;
      signalExitStarted = true;
      process.exit(code);
    });
  }
}

// #1228: python's HTTPServer.server_bind calls socket.getfqdn(<bind host>) between bind() and listen(). For the default
// wildcard bind ('::') that is gethostbyaddr(gethostname()): on a host whose own name does not resolve promptly the
// server stays bound and not listening for the whole lookup, and the served-tree preflight starves (the hosted macOS
// test job of ci run 40117679711). A loopback literal can take as long (#763: 35 s on the hosted macOS image). So the
// harness's own spawn puts a sitecustomize first on python's PYTHONPATH that answers getfqdn without a lookup:
// gethostname() for '', '0.0.0.0' and '::' (getfqdn's own fallback for those names) and a loopback literal itself; every
// other name goes to the original, after any other sitecustomize on the path has loaded (once each, by real path, so a
// caller's own chaining shim on PYTHONPATH cannot load this one back). The command line and the bind are unchanged. The
// file is written into a private temp dir (mkdtemp), rewritten if it has gone (a tmp sweep under a long-lived process),
// and removed at exit; where it cannot be written, the spawn runs without it, as before.
// The same shim sets the server's listen backlog to 128 (socketserver's default is 5). On macOS 27.2, two fresh
// browsers booting at once (e2e-lighting-matrix --workers 2) overflowed a backlog of 5: the overflowed connections came
// back as resets (ERR_CONNECTION_RESET, ERR_SOCKET_NOT_CONNECTED), module requests failed and the app never booted. The
// same job was green before 27.2. The shim sets the backlog after the chain, so every spawn listens with 128.
const STATIC_SERVER_PY_SHIM = [
  '# cdp.mjs spawnStaticServer (#1228): socket.getfqdn answers the wildcard names and loopback literals without a',
  '# lookup; every other name goes to the original. Any other sitecustomize on the path loads first. The listen',
  '# backlog is 128, not socketserver\'s 5: on macOS 27.2 an overflowed listen queue resets connections.',
  'import importlib.machinery, importlib.util, ipaddress, os, socket, socketserver, sys',
  '# every sitecustomize loaded in this process, by real path: a chaining shim of the same shape on the path (the',
  '# selftests\' getfqdn shims load "the first other" one too) never loads this one back, so the two cannot recurse;',
  '# the one site imported itself (this file, or a caller\'s shim that loaded this one) counts as loaded',
  '_seen = sys.__dict__.setdefault("_ob_sitecustomize_seen", set())',
  '_seen.add(os.path.realpath(__file__))',
  '_top = getattr(sys.modules.get("sitecustomize"), "__file__", None)',
  'if _top:',
  '    _seen.add(os.path.realpath(_top))',
  'for _d in sys.path:',
  '    _spec = importlib.machinery.PathFinder.find_spec("sitecustomize", [_d or os.curdir])  # any form python imports',
  '    if _spec is None or not _spec.origin or os.path.realpath(_spec.origin) in _seen:',
  '        continue',
  '    _seen.add(os.path.realpath(_spec.origin))',
  '    try:',
  '        _spec.loader.exec_module(importlib.util.module_from_spec(_spec))',
  '    except Exception as _e:  # site\'s own wording; the answer below is still installed',
  '        print("Error in sitecustomize; set PYTHONVERBOSE for traceback:", type(_e).__name__ + ":", _e, file=sys.stderr)',
  '    break',
  '_orig = socket.getfqdn',
  'def getfqdn(name=""):',
  '    n = name.strip()',
  '    if n in ("", "0.0.0.0", "::"):',
  '        return socket.gethostname()',
  '    try:',
  '        if ipaddress.ip_address(n).is_loopback:',
  '            return name',
  '    except ValueError:',
  '        pass',
  '    return _orig(name)',
  'socket.getfqdn = getfqdn',
  'socketserver.TCPServer.request_queue_size = 128',
  '',
].join('\n');
let staticServerShimDir; // undefined: not written yet; null: could not be written
const STATIC_SERVER_SHIM_PREFIX = 'obw-static-server-py-'; // + <pid>-: names the writer
/** the PYTHONPATH spawnStaticServer gives python: the #1228 shim's dir first, then the caller's own PYTHONPATH (exported
 * for test-static-server-fqdn.mjs and e2e-retry's B6 control). Only the exact dir this process made is ever removed (at
 * exit, or when its write fails): a process killed before its exit hook (e2e-retry B6's SIGKILLed suite) leaves its dir,
 * and nothing here deletes another process's dir from the shared temp dir */
export function staticServerPythonPath() {
  if (staticServerShimDir && !fs.existsSync(path.join(staticServerShimDir, 'sitecustomize.py'))) staticServerShimDir = undefined; // swept
  if (staticServerShimDir === undefined) {
    staticServerShimDir = null;
    let dir = null;
    try {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), `${STATIC_SERVER_SHIM_PREFIX}${process.pid}-`));
      const made = dir;
      process.on('exit', () => { try { fs.rmSync(made, { recursive: true, force: true }); } catch { /* raced */ } });
      fs.writeFileSync(path.join(dir, 'sitecustomize.py'), STATIC_SERVER_PY_SHIM);
      staticServerShimDir = dir;
    } catch { // an unwritable temp dir: python runs without the shim
      if (dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* raced */ } }
    }
  }
  return [staticServerShimDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
}

export function spawnStaticServer(webDir, port, { bind, onFailure = 'die' } = {}) {
  // GH-338: refuse to squat a live foreign lane's claimed band — one honest
  // throw here beats a cross-attached suite mid-battery. Fires before the
  // spawn, so a refusal leaves nothing to reap.
  { // GH-725 review r9 P2-1: the SINK refuses an invalid endpoint whatever arithmetic produced it
    const bad = derivedEndpointProblem(Number(port));
    if (bad) {
      throw new Error(`spawnStaticServer: refusing to bind — http port ${port} ${bad}; derive endpoints through assertDerivedEndpoint `
        + '(cdp.mjs) so the tool refuses BY NAME with its arithmetic before any resource is spent [derived-endpoint]');
    }
  }
  assertPortOutsideForeignBands(Number(port), 'http port');
  installSignalReaper();
  // `bind` passthrough: scenario-titlecard's blank-card server binds
  // loopback-only; every gate omits it (default = python's all-interfaces,
  // identical to the bare spawns this helper replaced — GH-294 finisher).
  // GH-389 (review r4 P1): a pending hold brackets the spawn→lease gap so
  // a spawner killed in that instant cannot leave the claim holder-less
  // under a live server.
  const spawnHolds = pendIntoOwnClaims(Number(port));
  // stderr is PIPED and drained (GH-557): stdio:'ignore' swallowed python's
  // "OSError: [Errno 48] Address already in use", which is how a lost port
  // race became a run that silently sampled ANOTHER tree. Only a bounded
  // tail is kept (request logging also rides stderr), and the pipe is
  // always drained so a chatty server can never block on a full pipe.
  const pyEnv = { ...process.env }; // #1228: the getfqdn shim first on PYTHONPATH (above)
  const pyPath = staticServerPythonPath();
  if (pyPath) pyEnv.PYTHONPATH = pyPath; else delete pyEnv.PYTHONPATH;
  const proc = spawn('python3', ['-m', 'http.server', '-d', String(webDir),
    ...(bind ? ['--bind', String(bind)] : []), String(port)],
    { stdio: ['ignore', 'ignore', 'pipe'], detached: true, env: pyEnv });
  let errTail = '';
  proc.stderr.on('data', (c) => { errTail = (errTail + c).slice(-2000); });
  // exit backstop registration (review r2 P2): a gate watchdog's
  // process.exit bypasses the finally that would stopStaticServer. The
  // entry is NOT dropped on the leader's own 'exit' (review r7 P2): the
  // wrapper can die before its socket-holding grandchild, and the group
  // must stay killable by the backstop until stopStaticServer confirms it
  // empty. The stored identity — port + docroot + the leader's birth time
  // (review r9/r10 P1s) — is what every group signal is matched against.
  let lstart = null;
  try {
    // trim: the single-pid form pads trailing spaces that the probe's
    // fixed-width column capture does not carry (measured 2026-08-01).
    lstart = execFileSync('ps', ['-o', 'lstart=', '-p', String(proc.pid)],
      { encoding: 'utf8', env: psEnv() }).trim(); // GH-1143
  } catch { /* died at birth or no ps: probe falls back to port+docroot */ }
  // harness marker (GH-294 finisher): a sidecar file names the spawn —
  // leader pid + identity + the SPAWNING harness pid — so the startup
  // self-sweep can attribute a crashed run's orphaned server tree with
  // certainty (the command line itself carries no harness identity).
  // stopStaticServer removes it once the group is confirmed empty; a
  // marker whose identity no longer matches a live row is pruned by the
  // sweep, so crash litter is bounded and self-healing.
  // the family's ONE grammar — but a spawn that FAILED (ENOENT/EACCES/
  // resource exhaustion) hands back a ChildProcess with pid undefined and
  // emits 'error' asynchronously: no marker for it, and no throw here ahead
  // of the 'error' handler registered below (review r2 P2 — the throw would
  // have bypassed onFailure:'return' and the pending-hold release).
  const marker = Number.isInteger(proc.pid) ? serverMarkerPath(proc.pid) : null;
  if (marker) try {
    fs.writeFileSync(marker, JSON.stringify({
      pid: proc.pid, harnessPid: process.pid, port: String(port),
      webDir: String(webDir), lstart: lstart || null, at: Date.now(),
    }));
  } catch { /* unmarkable: the sweep's shaped arm still ages it out */ }
  LIVE_SERVERS.set(proc,
    { port: String(port), webDir: String(webDir), lstart: lstart || null,
      marker });
  // GH-389 (review r2 P1): the server is an endpoint that never scans the
  // registry — lease its wrapper pid into the covering own claim so a
  // whole-lineage crash cannot get the band reaped while it serves. A
  // hold whose lease did NOT provably publish stays armed and self-
  // expires (review r5 P1) — the bounded grace is the band's only bridge.
  const leased = leaseEndpointIntoOwnClaims(Number(port), proc.pid, lstart);
  for (const h of spawnHolds) { if (leased.has(h.dir)) h.release(); }
  // a dead endpoint has nothing to bridge to (review r12 P2): its exit or
  // spawn error releases any still-armed holds so a failed spawn never
  // wedges the band for the grace window (idempotent when already freed).
  //
  // GH-557 FAIL-CLOSED: a spontaneous NONZERO-CODE exit is the bind/config
  // failure class (measured on this runner: a same-stack port collision
  // exits code 1 / no signal ~1.1 s after spawn with Errno 48 on stderr) —
  // the run must STOP, loudly, before it photographs or measures whatever
  // foreign tree answers the port instead (the GH-525 R2 poisoned-capture
  // incident: a control arm sampled the runner's checkout and read as "the
  // fix does nothing"). Deliberate teardown is exempt by construction:
  // stopStaticServer marks the handle EXPECTED first, and every teardown /
  // sweep / backstop path kills by SIGNAL (signal death never enters this
  // arm). The GH-248 mid-run self-heal is likewise signal-scoped (box
  // churn kills), so it keeps its respawn path untouched.
  // onFailure 'return' is STARTUP-SCOPED (GH-557 review r5-r7):
  // scenario-render/hero-extend own bind-race recovery only for the
  // startup window (poll the exit, release the marker, retry a port).
  // Once their validation passes they call proc.obArmFailClosed() and the
  // fail-closed default REARMS — python's bind failure can land after
  // their 400/700 ms checks while a same-docroot winner false-passes the
  // nonce, and a post-validation loss must stop the run, not log past it
  // (review r7 P1). Arming with the loss already recorded dies immediately.
  let failClosedArmed = onFailure !== 'return';
  const dieOnLostBind = (code) => {
    console.error('\n[static-server] FATAL (GH-557): the http.server for '
      + `${webDir} on :${port} exited code ${code} on its own — the bind `
      + 'was likely lost to another process, and every request this run '
      + 'makes to that port would be answered by a FOREIGN tree. '
      + `stderr tail:\n${errTail.trim() || '(empty)'}\n`
      + 'Failing the run closed instead of sampling wrong answers '
      + '(pick a free --port/OB_E2E_PORT, or claim a band via '
      + 'run-gate --band).');
    process.exit(78); // EX_CONFIG; the exit backstop reaps children
  };
  proc.obArmFailClosed = () => {
    failClosedArmed = true;
    if (proc.obBindLost) dieOnLostBind(proc.exitCode);
  };
  proc.once('exit', (code, signal) => {
    for (const h of spawnHolds) h.release();
    if (!failClosedArmed) {
      if (signal === null && code !== null && code !== 0
        && !EXPECTED_STOPS.has(proc)) {
        proc.obBindLost = new Error(`http.server on :${port} exited code `
          + `${code} (caller-managed recovery)`);
        console.error(`[static-server] LOST BIND (GH-557, caller-managed): `
          + `the http.server for ${webDir} on :${port} exited code ${code} — `
          + 'if this run keeps serving, SOMETHING ELSE owns the port. '
          + `stderr tail:\n${errTail.trim() || '(empty)'}`);
      }
      return;
    }
    if (signal === null && code !== null && code !== 0
      && !EXPECTED_STOPS.has(proc)) {
      dieOnLostBind(code);
    }
  });
  proc.once('error', (e) => {
    for (const h of spawnHolds) h.release();
    if (onFailure === 'return') return; // the caller's own 'error' handler acts
    console.error('[static-server] FATAL (GH-557): http.server spawn failed '
      + `for ${webDir} on :${port}: ${e?.message ?? e}`);
    process.exit(78);
  });
  return proc;
}

/** SIGTERM → wait → SIGKILL → wait on the WHOLE process group of a
 * spawnStaticServer child. Resolves true once the tracked child is confirmed
 * gone; a final group SIGKILL sweeps any socket-holding grandchild the
 * wrapper's exit did not take with it. Never throws. */
export async function stopStaticServer(proc) {
  if (!proc) return true;
  EXPECTED_STOPS.add(proc); // GH-557: deliberate teardown, watchdog stands down
  // GH-248 heal follow-through (review 363 r7 P1): a mid-suite self-heal
  // respawned a REPLACEMENT server on this handle's port — the caller only
  // holds the ORIGINAL handle, so teardown must reach the replacement too
  // or the ref'd child keeps the event loop (and the port) alive after an
  // otherwise green run. Same-port LIVE_SERVERS entries other than `proc`
  // are exactly the heal's replacements (spawnStaticServer registered
  // them); stop them through the same confirmed-gone path first.
  const ownIdent = LIVE_SERVERS.get(proc);
  if (ownIdent && !STOPPING_SERVERS.has(proc)) {
    STOPPING_SERVERS.add(proc); // recursion brake: orig↔replacement pairs
    try {
      for (const [p, ident] of [...LIVE_SERVERS.entries()]) {
        if (p !== proc && !STOPPING_SERVERS.has(p)
          && ident.port === ownIdent.port) {
          await stopStaticServer(p);
        }
      }
    } finally { STOPPING_SERVERS.delete(proc); }
  }
  const alive = () => proc.exitCode === null && proc.signalCode === null;
  // every -pgid signal is gated on group identity (review r8 P1: an early-
  // dead server's pid can be recycled during a long gate — never signal a
  // group that no longer holds THIS spawn's server; 'unknown' is unsafe too).
  const signalGroup = (sig) => {
    if (serverGroupProbe(proc) === 'ours') {
      try { process.kill(-proc.pid, sig); return; } catch { /* raced exit */ }
    }
    try { proc.kill(sig); } catch { /* already exited */ }
  };
  const waitExit = (ms) => new Promise((res) => {
    if (!alive()) return res(true);
    const t = setTimeout(() => res(!alive()), ms);
    const done = () => { clearTimeout(t); res(true); };
    proc.once('exit', done);
    proc.once('close', done);
  });
  signalGroup('SIGTERM');
  if (!(await waitExit(2000))) {
    signalGroup('SIGKILL');
    await waitExit(3000);
  }
  // the group outlives its leader while any member lives — one last sweep
  // catches a grandchild that ignored/never saw the earlier signals, and
  // the verdict polls until the group is CONFIRMED to hold no server of
  // this spawn (review r6 P2: the wrapper can exit before its socket-owning
  // child, and a caller reusing the port immediately would race a
  // merely-signalled grandchild). Identity-gated (review r8 P1) and
  // three-state (review r9 P2): 'unknown' — no ps verdict — neither licenses
  // a group signal nor counts as confirmation, so an unprobeable teardown
  // returns false instead of true.
  const emptied = (ok) => {
    if (ok) {
      const ent = LIVE_SERVERS.get(proc);
      if (ent?.marker) { try { fs.rmSync(ent.marker, { force: true }); } catch { /* sweep prunes */ } }
      LIVE_SERVERS.delete(proc);
    }
    return ok;
  };
  for (let i = 0; i < 20; i++) {
    const probe = serverGroupProbe(proc);
    if (probe === 'clear') return emptied(!alive());
    if (probe === 'ours') {
      try { process.kill(-proc.pid, 'SIGKILL'); } catch (e) {
        // ESRCH: the group vanished between probe and signal. Anything
        // else (EPERM…) — the probe JUST saw the server, so a throw is
        // not teardown: keep polling and fail honestly (review r16 P2).
        if (e.code === 'ESRCH') return emptied(!alive());
      }
    }
    await sleep(100);
  }
  return false; // unconfirmed (or a member ignored SIGKILL) — port may be held
}

export async function launchChrome(url, { port = 9223, width = 1280, height = 800,
  headless = true, tool = true, preflight = true, preflightWebDir = null } = {}) {
  // tool:false = REAL-USER boot (e2e-userboot.mjs): no obtool stamp, so the
  // app takes the interactive sp-look/live-tier path a plain URL gets.
  if (tool) url = withToolParam(url);
  // GH-294: resolve the browser binary FIRST — a missing shell must fail fast
  // with the install command, before the preflight's 15 s budget is spent.
  // The throw still reaps this run's own http.server (same rationale as a
  // preflight `die()`: the gate's server.kill() lives after launchChrome).
  let chromeBin;
  try {
    // GH-338: a CDP port inside a LIVE foreign lane's claimed band is
    // refused before ANY resource is spent (no profile wipe, no preflight,
    // no chrome child) — the build-16 cross-attach class becomes one
    // honest launch-time throw. Same own-server reap posture as a missing
    // binary: the caller's static server must not be stranded by a
    // pre-`finally` top-level throw.
    { // GH-725 review r9 P2-1: the SINK refuses an invalid endpoint whatever arithmetic produced it (range, ≠ the boot URL's http port)
      let urlPort = null;
      try { const u = new URL(url); urlPort = u.port ? Number(u.port) : null; } catch { /* non-URL boot target */ }
      const bad = derivedEndpointProblem(Number(port), { base: urlPort });
      if (bad) {
        throw new Error(`launchChrome: refusing to launch Chrome — CDP port ${port} ${bad} (boot URL ${url}); derive endpoints through `
          + 'assertDerivedEndpoint (cdp.mjs) so the tool refuses BY NAME with its arithmetic before any resource is spent [derived-endpoint]');
      }
    }
    assertPortOutsideForeignBands(port, 'CDP port');
    chromeBin = resolveChromeBinary({ headless });
  } catch (e) {
    try { reapOwnServer(new URL(url).port); } catch { /* unjudgeable URL */ }
    throw e;
  }
  // GH-294: before the first launch of this process, sweep aged ORPHANED
  // profile debt (crash paths cannot run their own finally).
  sweepStaleProfiles();
  // GH-489 SNK-R36 (review r10 P1 — the kill-by-own-PID law applied to
  // profiles): before this process's FIRST claim on the path, the CDP port
  // and the profile path must be free of LIVE holders that are not ours.
  // Measured pre-fix (foreign chrome-headless-shell holding :<port> with
  // `--user-data-dir=/tmp/obw-e2e-profile-<port>`): the wipe below deleted
  // that browser's live profile, the spawn could not bind the port, and the
  // launch-failure reap then SIGKILLed the foreign shell as a "surviving
  // helper" by its marker — a browser some other gate was driving. Refused
  // BY NAME here instead, with the endpoint's answer / the holder's pid, and
  // no byte of that profile touched. A path this process already owns (a
  // previous session alive, closing or retained) is NOT judged here — that
  // is the GH-665 branch below (wait for the confirmed exit / refuse), whose
  // own helpers legitimately carry the marker. Sync marker census + one
  // bounded endpoint probe; nothing spawned, nothing deleted.
  if (!PROFILE_OWNER.has(`/tmp/obw-e2e-profile-${port}`)) {
    try {
      await refuseForeignProfileHolder(port, `/tmp/obw-e2e-profile-${port}`);
    } catch (e) { // same own-server reap posture as the pre-launch throws above
      try { reapOwnServer(new URL(url).port); } catch { /* unjudgeable URL */ }
      throw e;
    }
  }
  // GH-248: judge the SERVED TREE before spending a Chrome on it. One honest
  // throw here replaces a suite's worth of misleading arm FAILs, and it fires
  // before any resource (profile dir, CDP port, chrome child) is claimed.
  // SELF-HEAL, once (build-17 multi-lane box, observed repeatedly on
  // 2026-08-07: a long battery's own python http.server dies mid-run —
  // killed out from under a live harness by box-level churn — and every
  // later family boot then dies at this preflight with 30+ green minutes
  // wasted): when THIS process spawned a static server on the boot URL's
  // port and its group is confirmed no longer serving ('clear' — never
  // 'ours', which means a live server answered wrong and must stay an
  // honest throw; never 'unknown', where a group signal-less respawn could
  // double-bind), respawn the SAME identity once and re-judge. A foreign
  // squatter or a never-ours port keeps the honest throw.
  if (preflight) {
    try {
      await preflightServedTree(url, { webDir: preflightWebDir });
    } catch (e) {
      let u = null;
      try { u = new URL(url); } catch { /* non-URL boot target */ }
      const dead = u && [...LIVE_SERVERS.entries()].find(([p, ident]) =>
        String(ident.port) === u.port && ident.healed !== true
        && serverGroupProbe(p) === 'clear');
      if (!dead) throw e;
      const [proc0, ident0] = dead;
      // KEEP the original's LIVE_SERVERS entry (train review r1 P2): the
      // caller tears down with the ORIGINAL handle, and stopStaticServer's
      // replacement-sweep (the 363 r7 P1 fix) finds the heal's same-port
      // replacement THROUGH this entry's port association — deleting it
      // here stranded the ref'd replacement (event loop + port held after
      // a green run). The `healed` flag replaces the delete as the
      // respawn-ONCE brake: a healed entry never qualifies as `dead` again.
      ident0.healed = true;
      console.error(`[preflight] this harness's own static server on `
        + `:${u.port} died mid-run (${e.message?.slice(0, 60)}…) — `
        + 'respawning the same identity once (GH-248 heal)');
      spawnStaticServer(ident0.webDir, Number(u.port));
      await sleep(700);
      await preflightServedTree(url, { webDir: preflightWebDir });
    }
  } else {
    await waitForHttpReadiness(url);
  }
  // hermetic profile: a reused dir keeps Chrome's heuristic disk cache, which
  // can serve STALE app modules (python http.server sends no Cache-Control) —
  // and, worse, persisted localStorage (settings/equipment) from an earlier
  // run, silently changing sim physics for "identical" scripted inputs (issue
  // #14 determinism doctrine: scripted boots must carry NO ambient state).
  // maxRetries: rmSync can hit ENOTEMPTY when a leftover Chrome from an
  // aborted run is still flushing profile files.
  const profileDir = `/tmp/obw-e2e-profile-${port}`;
  // GH-665: a SAME-PORT relaunch must not race the previous session out of
  // its own profile. Boot loops (e2e-tables: eleven ?table= boots on ONE CDP
  // port) call close() — SIGTERM, unawaited — and relaunch at once; the shell
  // keeps writing <profile>/Default until it actually exits (measured 410-490
  // ms after SIGTERM on a quiet M4, >1.2 s on the loaded nightly runner). The
  // wipe below retries with linear backoff (200+400+600+800 ms ≈ 2 s per
  // directory level) and, being SYNCHRONOUS, starves close()'s own 3 s
  // SIGKILL escalation timer for as long as it spins — so the loser threw
  // ENOTEMPTY out of launchChrome AFTER every assertion had passed (nightly
  // 34033705473). Worse, a wipe that wins against a still-live root leaves
  // the new spawn unable to bind the CDP port while the endpoint poll answers
  // from the OLD browser. So the previous owner's exit is CONFIRMED first: a
  // session its caller has close()d (the `closing` mark) is WAITED for — its
  // own SIGTERM stands, never re-sent; the escalation is killAndWait's (3 s →
  // SIGKILL → 5 s). A session the caller never closed is REFUSED with a throw:
  // launchChrome must not signal a browser some caller may still be driving
  // (pre-fix that caller bug surfaced as a cross-attach or a 15 s dead
  // endpoint). A path quarantined by a survivor is refused too — never a wipe
  // under a live owner (hero-extend-render's reservation law). Hygiene arm 4c
  // red-proves this with a frozen (SIGSTOPped) previous session. The whole
  // block runs under this path's LAUNCH LOCK so a concurrent same-port
  // caller reads ownership AFTER us, never across our awaits (review r4 P2).
  const releaseLaunchLock = await acquireProfileLaunchLock(profileDir);
  try {
    const prev = PROFILE_OWNER.get(profileDir);
    const prevTracked = prev ? LIVE_PROFILES.get(prev) : null;
    if (prev && prev.exitCode === null && prev.signalCode === null) {
      if (prevTracked?.quarantined) {
        throw new Error(`launchChrome: :${port} is quarantined — this `
          + `process's previous session (pid ${prev.pid}) ignored SIGKILL and `
          + `still owns ${profileDir}; refusing to relaunch on it (GH-665)`);
      }
      if (!prevTracked?.closing) {
        throw new Error(`launchChrome: :${port} is still owned by this `
          + `process's LIVE session (pid ${prev.pid}) that was never closed — `
          + 'close()/closeAndWait() it before relaunching on the port; '
          + 'refusing to signal a browser its caller may still be driving '
          + '(GH-665)');
      }
      console.error(`[launch] :${port} — this process's previous session `
        + `(pid ${prev.pid}) is still exiting; waiting for its CONFIRMED exit `
        + 'before the profile wipe (GH-665, the same-port relaunch race)');
      const exited = prevTracked.killAndWait
        ? await prevTracked.killAndWait({ resignal: false })
        : await killAndWaitBare(prev, { resignal: false });
      if (!exited) {
        throw new Error(`launchChrome: previous session pid ${prev.pid} on `
          + `:${port} ignored SIGKILL — refusing to wipe ${profileDir} under `
          + 'a live owner (GH-665)');
      }
    }
    // RETAINED OWNERSHIP (review r3 P2). rmProfile RETAINS the path — it
    // returns false and keeps PROFILE_OWNER — whenever the reap gave no
    // verdict (ps failed, a matched helper unsignalable or not confirmed
    // gone) or the rm threw. That state outlives the root: the previous
    // owner can be long dead (so the live-session branch above never runs)
    // while one of its GPU/renderer helpers still holds the directory. The
    // pre-fix code fell straight through to the unconditional wipe, which
    // is the very thing GH-294's `remove only on true` rule forbids. So the
    // retention is CLEARED before the wipe or the relaunch is REFUSED: each
    // pass is a real retry (a fresh ps, a fresh SIGKILL, a fresh rm), and
    // the bounded window covers the transients (a helper mid-exit, a ps
    // that failed once, an ENOTEMPTY that clears) without ever certifying a
    // live helper gone. Hygiene arm 4d red-proves both halves.
    if (prev && PROFILE_OWNER.get(profileDir) === prev) {
      const deadline = Date.now() + 5000;
      let attempts = 0;
      let released = false;
      do {
        if (attempts) await sleep(250);
        attempts += 1;
        released = prevTracked?.rmProfile
          ? prevTracked.rmProfile()
          : releaseRetainedProfileBare(prev, profileDir);
      } while (!released && Date.now() < deadline);
      if (!released) {
        if (prevTracked?.foreignHolder) {
          throw new Error(`launchChrome: refusing to launch on :${port} — `
            + `${profileDir} is RETAINED because a live process that is not `
            + `ours (pid ${prevTracked.foreignHolder}) carries its marker; not `
            + 'ours to wipe or signal (kill-by-own-PID law; GH-489 SNK-R36) '
            + '[foreign-profile-holder]');
        }
        throw new Error(`launchChrome: ${profileDir} is still RETAINED by `
          + `this process's previous session (pid ${prev.pid}) after `
          + `${attempts} release attempts — its helpers are not confirmed `
          + 'gone (or the removal keeps failing); refusing to wipe and '
          + 'relaunch on a profile another process may still be writing '
          + '(GH-665 / GH-294)');
      }
      if (attempts > 1) {
        console.error(`[launch] :${port} — previous session (pid `
          + `${prev.pid}) released ${profileDir} on attempt ${attempts} `
          + '(GH-665 retained-ownership retry)');
      }
    }
  } finally {
    // released here, not after the spawn: everything from the wipe to
    // PROFILE_OWNER.set is synchronous, so this call's claim on the path is
    // already atomic against the next waiter (which resumes on a microtask,
    // i.e. only once we reach our next await — after the ownership is set).
    releaseLaunchLock();
  }
  // GH-489 SNK-R36 (refuter 1): the marker census is RE-READ here, sync,
  // right before the wipe — the first read (above the preflight) leaves a
  // window (the preflight's fetches and heal, the GH-665 waits) in which a
  // foreign shell can take the port + path; with no session of ours on the
  // path any marker carrier is somebody else's browser: refuse, never wipe.
  if (!PROFILE_OWNER.has(profileDir)) {
    const late = foreignMarkerHoldersSync(profileDir);
    if (late && late.length) {
      try { reapOwnServer(new URL(url).port); } catch { /* unjudgeable URL */ }
      throw foreignHolderError(port, profileDir, late, ' (a holder appeared after the pre-launch check)');
    }
  }
  fs.rmSync(profileDir,
    { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  // GH-389 (review r4 P1): pending hold across the spawn→lease gap — a
  // spawner killed in that instant must not leave the claim holder-less
  // under the live browser it just spawned.
  const spawnHolds = pendIntoOwnClaims(port);
  const proc = spawn(chromeBin.bin, [
    // headless:false = a real vsynced window (perf-aim.mjs jank forensics —
    // headless BeginFrame cadence is scheduler-driven, not display-driven).
    // The shell build is headless-only, so the mode flag is meaningless there.
    ...(headless && !chromeBin.isShell ? ['--headless=new'] : []),
    // the shell defaults to SwiftShader on macOS (probe 2026-07-31:
    // UNMASKED_RENDERER_WEBGL = "SwiftShader Device"); --use-angle=metal
    // restores the exact hardware renderer string the installed app's
    // --headless=new reports ("ANGLE Metal Renderer: Apple M2 Ultra"), which
    // keeps committed captures / measured-ink floors / perf budgets on the
    // hardware GPU. WebShare: desktop Chrome ships navigator.share on macOS
    // but the shell build compiles it out unless the feature is enabled
    // (probed 2026-07-31 on a loopback secure context: undefined bare,
    // function with the flag) — without it e2e-playback arm 4's
    // capability-gated Share tile reads as a product regression. Both are
    // CAPABILITY PARITY with the macOS Chrome the gates were written for,
    // central here so all ~55 callers inherit them.
    ...(chromeBin.isShell && process.platform === 'darwin'
      ? ['--use-angle=metal', '--enable-features=WebShare'] : []),
    `--remote-debugging-port=${port}`,
    `--window-size=${width},${height}`, '--no-first-run', '--hide-scrollbars',
    '--disable-extensions', '--mute-audio',
    `--user-data-dir=${profileDir}`,
    url,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  proc.stderr.on('data', () => {});
  // GH-389 (review r2 P1): the browser is an endpoint that never scans the
  // registry — lease its pid into the covering own claim at spawn so a
  // crash that takes every node process in the lineage cannot get the band
  // reaped (and re-claimed by a foreign lane) while this Chrome still owns
  // the CDP port. Survivors that ignore SIGKILL keep the claim alive for
  // exactly their own lifetime — the transferPortClaim quarantine posture,
  // now crash-proof too.
  {
    // a hold whose lease did NOT provably publish stays armed and self-
    // expires (review r5 P1) — the bounded grace is the band's only bridge
    const leased = leaseEndpointIntoOwnClaims(port, proc.pid, null, 'launch');
    for (const h of spawnHolds) { if (leased.has(h.dir)) h.release(); }
    // a dead endpoint has nothing to bridge to (review r12 P2): its exit
    // releases any still-armed holds so a failed launch never wedges the
    // band for the grace window (idempotent when already freed).
    proc.once('exit', () => { for (const h of spawnHolds) h.release(); });
    proc.once('error', () => { for (const h of spawnHolds) h.release(); });
  }
  // GH-294 cleanup law: the profile dir dies with the child, on EVERY exit
  // path — closeAndWait, close() (SIGTERM path, escalation path, the wedge
  // synchronous SIGKILL), and the launch-failure paths — because this fires
  // on the child's CONFIRMED exit and never on a survivor: an error carrying
  // `chromeSurvived` means 'exit' never fired, and the quarantined profile
  // stays with its owning process (hero-extend-render's reservation law).
  // Crash-adjacent windows (node hard-exits before observing the child's
  // death) are covered by the process-exit backstop + the startup self-sweep.
  const rmProfile = () => {
    // generation guard (review r1 P1): gates relaunch on the same port; if a
    // NEWER session claimed this path (its pre-launch rm + spawn already
    // ran), this old child's deferred cleanup must not wipe a live profile.
    if (PROFILE_OWNER.get(profileDir) !== proc) {
      // the OLD generation's helpers are still reaped — ancestry-only
      // (finisher review r20 P2): the --user-data-dir marker now names the
      // REPLACEMENT session's processes, and the shell's markerless helpers
      // would otherwise leak undiscoverably. The dir itself is never
      // touched here. A verdictless reap keeps the tracking entry so the
      // exit backstop retries.
      if (reapSessionHelpersSync(proc.pid, profileDir, tracked.descendants,
        { includeMarker: false })) {
        LIVE_PROFILES.delete(proc);
      }
      return true; // discharged: a newer session owns the path now
    }
    // helper reap (review r11 P1 / r13 P2): a SIGKILLed browser root cannot
    // shut its GPU/renderer helpers down. Runs only while WE still own the
    // path (guard above); the profile is REMOVED only once every matched
    // helper is confirmed gone (review r12 P2) — otherwise ownership is
    // retained and the belt/backstop/sweep retry.
    // GH-489 SNK-R36 (refuter 2): a LIVE process that is neither this root
    // nor one of its snapshotted helpers and carries this path's marker
    // means the path is not exclusively ours — RETAIN it: no reap (a marker
    // census would signal that process), no rm (its live profile). The
    // pre-fix teardown was exactly this kill-by-marker + wipe.
    {
      tracked.foreignHolder = null; // re-judged on every pass (a departed holder is never named)
      const fh = foreignMarkerHoldersSync(profileDir);
      const foreign = fh ? classifyMarkerRows(fh, proc.pid, new Set((tracked.descendants || []).map((d) => d.pid))).foreign : [];
      if (foreign.length) {
        tracked.foreignHolder = foreign[0].pid; // named by the next same-port launch's refusal
        console.error(`[cdp] profile ${profileDir} RETAINED — a live process `
          + `that is not this session's carries its marker (pid ${foreign[0].pid}`
          + `${foreign.length > 1 ? ` +${foreign.length - 1}` : ''}: `
          + `${foreign[0].command.slice(0, 80)}${foreign[0].command.length > 80 ? '…' : ''})`
          + `${ambiguousNote(foreign.find((x) => x.ambiguous))}; not ours to wipe or signal `
          + '(kill-by-own-PID law; GH-489 SNK-R36)');
        return false;
      }
    }
    if (!reapSessionHelpersSync(proc.pid, profileDir, tracked.descendants)) {
      return false; // ownership retained: a later pass retries
    }
    try {
      fs.rmSync(profileDir,
        { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      // ownership is released only on SUCCESS (review r2 P2): a transient
      // rm failure keeps both tracking entries, so the closeAndWait belt
      // and the process-exit backstop remain real retries instead of
      // no-ops behind the generation guard.
      PROFILE_OWNER.delete(profileDir);
      LIVE_PROFILES.delete(proc);
      return true;
    } catch { return false; /* retained: belt/backstop, next pre-rm, sweep */ }
  };
  proc.once('exit', rmProfile);
  // rmProfile/killAndWait ride the tracking entry so a same-port relaunch
  // can drive THIS generation's confirmed teardown (GH-665, above).
  const tracked = {
    isShell: !!chromeBin.isShell, // recorded for the teardown's diagnostics (SNK-R36)
    dir: profileDir, quarantined: false, descendants: null,
    rmProfile, killAndWait: null, closing: false };
  LIVE_PROFILES.set(proc, tracked);
  PROFILE_OWNER.set(profileDir, proc);
  // EARLY ancestry baseline (finisher review P2): a root that dies BEFORE the
  // debugger endpoint answers never reaches killAndWait's live snapshot (the
  // root is already dead there) nor the post-setup baseline below — and the
  // shell's helpers carry no --user-data-dir, so whatever they spawned by
  // now would reparent unidentifiably. Refreshed after CDP setup and again
  // by close()/killAndWait(); stale entries are harmless (every reap
  // revalidates command+parent).
  tracked.descendants = snapshotDescendants(proc.pid);
  // wait for the debugger endpoint, then find the page target.
  // OB_CDP_LAUNCH_TRIES (default 100 × 150ms = 15s, unchanged) extends the
  // window ADDITIVELY for heavily loaded machines: a cold headless Chrome
  // start under a load-90 box (parallel lanes / training jobs) measures in
  // MINUTES, and every suite would otherwise die at launch, not on a real
  // regression.
  // (hoisted above the endpoint poll — GH-665: the tracking entry must carry
  // killAndWait before this launch's first await, so a same-port relaunch
  // can always drive THIS generation's confirmed teardown; `resignal:false`
  // waits out a SIGTERM that close() already sent instead of re-sending it.)
  const killAndWait = async ({ resignal = true } = {}) => {
    const alive = () => proc.exitCode === null && proc.signalCode === null;
    // ancestry snapshot BEFORE the first signal (review r13 P2): once the
    // root dies its helpers reparent to PID 1 and — on the shell build,
    // whose helpers carry no --user-data-dir — become unidentifiable.
    // Refreshes the launch-time baseline (helpers churn per navigation).
    if (alive()) tracked.descendants = snapshotDescendants(proc.pid);
    // `error` is NOT proof of exit (review P1). Node emits it when the kill
    // ITSELF fails (EPERM on a process this user may not signal, ESRCH on a
    // race), and treating that as "gone" is exactly backwards: the one event
    // that says the child may be unkillable was being read as confirmation
    // that it died. Only `exit`/`close`, or a liveness re-check, may return
    // true.
    const waitExit = (ms) => new Promise((res) => {
      if (!alive()) return res(true);
      const t = setTimeout(() => res(!alive()), ms);
      const done = () => { clearTimeout(t); res(true); };
      proc.once('exit', done);
      proc.once('close', done);
      proc.once('error', () => { clearTimeout(t); res(!alive()); });
    });
    try { if (alive() && resignal) proc.kill(); } catch { /* never started */ }
    if (await waitExit(3000)) return true;
    try { proc.kill('SIGKILL'); } catch { /* raced exit */ }
    return waitExit(5000);
  };
  tracked.killAndWait = killAndWait; // GH-665: reachable by the next launch
  const launchTries = Number(process.env.OB_CDP_LAUNCH_TRIES) || 100;
  // OB_CDP_LAUNCH_MS (default 0 = off, the try count alone, as before) bounds
  // the poll by ELAPSED time. A Chrome that accepts the connection and stalls
  // /json/list or its body costs up to 5 s per try, so a raised try count
  // alone (800 × (150 ms + 5 s) ≈ 69 min) can outlast a job's timeout; with
  // the deadline the worst case is the budget plus one in-flight try.
  const envLaunchMs = Number(process.env.OB_CDP_LAUNCH_MS);
  const launchMs = Number.isFinite(envLaunchMs) && envLaunchMs > 0 ? envLaunchMs : 0;
  const launchT0 = Date.now();
  let launchTriesDone = 0;
  let target;
  for (let i = 0; i < launchTries && !target; i++) {
    if (launchMs && Date.now() - launchT0 >= launchMs) break;
    launchTriesDone = i + 1;
    await sleep(150);
    try {
      // BOTH the connect AND the body read are bounded (review P1). Without a
      // signal, a Chrome that accepts the connection and never answers hangs
      // this loop forever — before the caller has a `finally`, so the browser,
      // the http server and (in the render harness) a pool of python workers
      // holding 4K arrays are all stranded with nothing to release them.
      const res = await fetch(`http://127.0.0.1:${port}/json/list`,
        { signal: AbortSignal.timeout(5000) });
      const list = await res.json();
      target = list.find((t) => t.type === 'page' && t.url.startsWith('http'));
    } catch { /* not up yet */ }
  }
  // GH-489 SNK-R36 (refuter 1): an endpoint that answers while OUR chrome
  // child has already exited is another process's browser (the pre-fix
  // cross-attach: our spawn lost the port to a foreign shell and the poll
  // attached to it). Never attach, never wipe under it: this launch DISOWNS
  // the path (it never owned that browser's profile) and fails by name.
  // LAUNCH FAILURE LAW: launchChrome either returns a usable client or leaves
  // NO Chrome behind — and "behind" means EXITED, not merely signalled. A
  // WebSocket that refused to open (or a failing Runtime/Page/Log.enable
  // below) used to throw with Chrome still running, still holding
  // --remote-debugging-port and /tmp/obw-e2e-profile-<port>; the
  // endpoint-timeout path killed its child but did not wait for it. Callers
  // that reserve the CDP port around the launch (hero-extend-render's marker
  // lock) hand that port back on failure, so a SIGTERM still in flight is not
  // good enough: the next run would wipe a live profile. Same discipline as
  // stopServer — SIGTERM, wait, escalate to SIGKILL, wait again; `exited`
  // says whether the guarantee actually held, so a caller that cares can
  // refuse to hand the port back (hero-extend-render re-probes the port
  // anyway before releasing).
  // a launch failure that could NOT confirm the child's death is flagged on
  // the Error itself (`chromeSurvived`), not just described in its message:
  // a caller holding a reservation for this port must be able to decide
  // programmatically whether handing the port (and its profile dir) back is
  // safe. Message text is for humans; the flag is for the release decision.
  const launchFailure = (msg, exited) => {
    const e = new Error(msg + (exited ? '' : ' (and the chrome child ignored '
      + `SIGKILL — it may still hold :${port} and `
      + `/tmp/obw-e2e-profile-${port})`));
    // the SURVIVOR's pid travels with the error: a caller holding a
    // reservation must be able to hand the quarantine to the process that
    // actually owns the resources, not to itself (it is about to exit)
    if (!exited) {
      e.chromeSurvived = true;
      e.chromePid = proc.pid;
      // the quarantine (hero-extend reservation law) owns this port +
      // profile now — the process-exit backstop must not SIGKILL or rm it.
      tracked.quarantined = true;
    }
    return e;
  };
  // GH-489 SNK-R36 (refuter 2): a Chrome that loses the DevTools bind does
  // NOT exit — it runs on without the port — so "our child is alive" proves
  // nothing about WHO answers /json/list. Before attaching, the LISTENER on
  // the port must be this launch's own (the child or one of its helpers:
  // `lsof -iTCP:<port> -sTCP:LISTEN`, the file's own listener idiom); a
  // foreign listener → our own child is ended and waited for (its teardown
  // RETAINS a path a foreign holder shares — see rmProfile), the launch
  // disowns only what its teardown discharged, and fails by name. No lsof
  // verdict falls back to the child-alive check alone, said so on stderr.
  if (target) {
    let listeners = null;
    try { // every address (refuter 4 of SNK-R36: a `@127.0.0.1` filter misses a WILDCARD-bound holder, `*:<port>`, that answers loopback all the same), bounded
      listeners = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'],
        { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'pipe'] })
        .split('\n').map((x) => Number(x.trim())).filter((x) => Number.isFinite(x) && x > 0);
    } catch (e) { // lsof exits 1 on NO MATCH with an empty stderr; anything else is no verdict
      listeners = e && e.status === 1 && !String(e.stderr || '').trim() ? [] : null;
    }
    const desc = snapshotDescendants(proc.pid) || tracked.descendants || []; // fresh: helpers spawned since the baseline
    const own = new Set([proc.pid, ...desc.map((d) => d.pid)]);
    const childGone = proc.exitCode !== null || proc.signalCode !== null;
    // the proof is POSITIVE: /json/list answered, so an own listener MUST be visible; a pid that is not ours is foreign;
    // an EMPTY set with a live child is foreign by elimination (whoever answered is not our child on this port). A
    // v6-only foreign listener beside our own reads as foreign too — a false REFUSAL of our own launch, never a false attach.
    const foreignListener = Array.isArray(listeners) && (listeners.some((p) => !own.has(p)) || !listeners.some((p) => own.has(p)));
    if (listeners === null && !childGone) {
      console.error(`[launch] :${port} — no lsof verdict on the listener; attaching on the child-alive check alone (GH-489 SNK-R36)`);
    }
    if (childGone || foreignListener) {
      const who = foreignListener
        ? (listeners.length
          ? `listener pid(s) ${listeners.filter((p) => !own.has(p)).join(',') || '(none foreign, none ours)'} on :${port} are not this launch's (child ${proc.pid}${desc.length ? ` + ${desc.length} helper(s)` : ''})`
          : `no listener on :${port} is this launch's (child ${proc.pid}${desc.length ? ` + ${desc.length} helper(s)` : ''} holds none, yet /json/list answered)`)
        : `our chrome child (pid ${proc.pid}) already exited (code ${proc.exitCode}, signal ${proc.signalCode}) before /json/list answered`;
      const exited = childGone ? true : await killAndWait();
      for (const h of spawnHolds) h.release();
      if (!LIVE_PROFILES.has(proc)) { // discharged by its own teardown; a RETAINED entry stays for the backstops
        if (PROFILE_OWNER.get(profileDir) === proc) PROFILE_OWNER.delete(profileDir);
      }
      throw launchFailure(`the debugger endpoint answering :${port} is not this `
        + `launch's — ${who}; whatever answers belongs to another process: refusing `
        + 'to attach, wipe under or signal it (kill-by-own-PID law; GH-489 '
        + 'SNK-R36 review r10 P1) [foreign-cdp-endpoint]', exited);
    }
  }
  if (!target) {
    throw launchFailure('chrome debugger endpoint never came up'
      + (launchMs ? ` (${Date.now() - launchT0} ms elapsed of the ${launchMs} ms`
        + ` OB_CDP_LAUNCH_MS budget; ${launchTriesDone} of ${launchTries} tries)` : ''),
      await killAndWait());
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  try {
    await new Promise((res, rej) => {
      // a handshake that neither opens, errors nor closes would hang forever,
      // and the caller has no `finally` yet (review P1)
      const t = setTimeout(() => rej(new Error('CDP websocket handshake did not '
        + `complete within 30 s: ${target.webSocketDebuggerUrl}`)), 30_000);
      const settle = (fn) => (v) => { clearTimeout(t); fn(v); };
      ws.onopen = settle(res);
      // onerror hands back an Event, not an Error — name the endpoint so the
      // failure is diagnosable instead of surfacing as `undefined`
      ws.onerror = settle(() => rej(new Error('CDP websocket refused to open: '
        + target.webSocketDebuggerUrl)));
      ws.onclose = settle(() => rej(new Error('CDP websocket closed during the '
        + 'handshake (Chrome exited?)')));
    });
  } catch (e) {
    try { ws.close(); } catch { /* never opened */ }
    const exited = await killAndWait();
    throw exited ? e : launchFailure(e.message, false);
  }

  let nextId = 1;
  const pending = new Map();
  const eventHandlers = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message), msg.error) : res(msg.result);
    } else if (msg.method) {
      eventHandlers.forEach((h) => h(msg.method, msg.params));
    }
  };
  // if Chrome dies / the socket drops, REJECT every in-flight command —
  // otherwise callers await forever and node exits with an unsettled
  // top-level await instead of a diagnosable error.
  // BOOT-LOSS MARKER (GH-248 wedge-resume): every TERMINAL rejection — the
  // wedge verdict, the command deadline, the socket close, and every
  // post-poison send() — carries `cdpWedged: true`, so a caller holding
  // deterministic re-render state (scenario-render's checkpoint/resume)
  // can tell "this BOOT is lost: kill, relaunch, seek, continue" from a
  // per-command failure WITHOUT parsing prose. Per-command rejections
  // (protocol errors, the readyState race) stay unflagged on purpose.
  const bootLost = (msg) => {
    const e = new Error(msg);
    e.cdpWedged = true;
    return e;
  };
  const rejectAll = (msg) => {
    for (const { rej } of [...pending.values()]) rej(bootLost(msg));
    pending.clear();
  };
  // TERMINAL, not per-command (review r2 P1): a wedge verdict must kill the
  // CLIENT, not just the one command that happened to be in flight. Gate
  // polling helpers swallow eval failures by design (e2e-playback's waitReady /
  // waitFor use `.catch(() => false)` and retry 100-200 times), so a
  // per-command rejection would be retried straight back into the wedge and the
  // gate would still burn its watchdog budget. Once poisoned, every subsequent
  // send() rejects instantly with the ORIGINAL diagnosis, so the polls drain in
  // seconds and the gate fails with the true cause.
  const wedged = (msg) => {
    if (!poison) poison = msg;
    rejectAll(msg);
    try { ws.close(); } catch { /* already closing */ }
  };
  let liveProbe = null; // the wedge watchdog below; declared for onclose
  let poison = null; // terminal client error, once set never cleared
  ws.onclose = () => {
    clearInterval(liveProbe);
    // TERMINAL too (review r3 P1): a closed socket is unrecoverable, and
    // WHATWG WebSocket.send() DISCARDS writes on one silently — a poller that
    // catches the rejection and retries would otherwise wait out the full
    // command deadline with no watchdog left running.
    if (!poison) poison = 'CDP websocket closed (Chrome exited?)';
    rejectAll(poison);
  };
  // WEDGE LAW (GH-248): a CDP command that never answers used to hang the gate
  // FOREVER — ws.onclose was the ONLY rejection path, and a Chrome whose
  // debugger endpoint stops answering while the PROCESS lives never closes the
  // socket. Measured 2026-07-28: one run sat >10 min and produced no signal at
  // all, which costs a lane AND the investigation that follows. Two bounds,
  // deliberately independent, because a legitimate in-page render
  // (__export.renderDrill, scenario/hero frame loops) can honestly take
  // minutes and must never be cut short:
  //   • EVERY CDP CALL HAS A DEADLINE (OB_CDP_TIMEOUT_MS, with the pre-merge
  //     name OB_CDP_CMD_TIMEOUT_MS honored as an alias; default 10 min) — the
  //     backstop for a page that is alive but never resolves (an infinite
  //     construct in evaluated JS keeps the browser endpoint healthy, so only
  //     a deadline catches it). Its job is to distinguish "stalled" from
  //     "slow", not to police latency — hence the generous default: before it
  //     existed, a Chrome that kept its socket open and simply stopped
  //     answering (a stalled renderer, a paged-out GPU process on a thrashing
  //     box) left every caller awaiting forever, so no `finally` ran and the
  //     browser — and in the render harness a pool of python workers holding
  //     4K arrays — stayed resident until someone noticed. A fired deadline
  //     is a WEDGE VERDICT, never a lone per-command rejection: the Chrome
  //     that swallowed one command will swallow the retries too;
  //   • an ENDPOINT LIVENESS probe — while commands are in flight, the HTTP
  //     debugger endpoint is polled every OB_CDP_LIVE_PROBE_MS (15 s) and
  //     OB_CDP_LIVE_FAILS (4) consecutive failures reject every pending
  //     command at once. That is the exact shape of the observed hang, caught
  //     in ~1 min instead of never, and it cannot false-fire on a slow eval
  //     because a busy renderer still leaves the browser process answering.
  // The deadline timer is deliberately NOT unref'd: in the hang case it is the
  // only thing left on the loop, and an unref'd timer would let node exit
  // silently on an unsettled await — the failure mode this replaces. Either
  // verdict POISONS the client (see `wedged`) — a wedge is terminal, never a
  // retryable per-command error.
  const CMD_TIMEOUT_MS = Number(process.env.OB_CDP_TIMEOUT_MS)
    || Number(process.env.OB_CDP_CMD_TIMEOUT_MS) || 600000;
  const LIVE_PROBE_MS = Number(process.env.OB_CDP_LIVE_PROBE_MS) || 15000;
  const LIVE_FAILS = Number(process.env.OB_CDP_LIVE_FAILS) || 4;
  let lastCmd = '(none)';
  let liveFails = 0;
  liveProbe = setInterval(async () => {
    if (!pending.size) { liveFails = 0; return; }
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`,
        { signal: AbortSignal.timeout(5000) });
      liveFails = r.ok ? 0 : liveFails + 1;
    } catch { liveFails++; }
    if (liveFails >= LIVE_FAILS && pending.size) {
      wedged(`chrome debugger endpoint :${port} stopped answering `
        + `(${liveFails} probes over ~${Math.round(liveFails * LIVE_PROBE_MS / 1000)} s`
        + `) with ${pending.size} CDP command(s) in flight — the renderer or `
        + `the browser is WEDGED, not slow. Last command: ${lastCmd} (GH-248)`);
    }
  }, LIVE_PROBE_MS);
  liveProbe.unref?.(); // never holds an otherwise-finished process open
  const send = (method, params = {}) => new Promise((res, rej) => {
    // the TERMINAL layer answers first: once poisoned, every send() carries
    // the ORIGINAL wedge diagnosis, whatever state the socket is in by now.
    if (poison) return rej(bootLost(`CDP client is poisoned: ${poison}`));
    // readyState guard (review P2, scenario branch): a CLOSING/CLOSED socket
    // silently DISCARDS the frame, so the request would sit out its whole
    // deadline for nothing; a CONNECTING one throws synchronously and would
    // leave the pending entry and its timer behind. Answer immediately — an
    // unpoisoned non-OPEN socket here is a caller racing its own close(),
    // so a per-command rejection (not a wedge verdict) is the honest answer.
    if (ws.readyState !== 1 /* OPEN */) {
      return rej(new Error(`CDP ${method} attempted on a socket in state `
        + `${ws.readyState} (Chrome closing or not yet connected)`));
    }
    const id = nextId++;
    const head = typeof params.expression === 'string' ? params.expression.replace(/\s+/g, ' ').slice(0, 120) : null;
    lastCmd = method + (head !== null ? ` ${head}` : '');
    const label = lastCmd;
    const t = setTimeout(() => {
      if (!pending.has(id)) return; // already settled
      // the deadline INVOKES THE WEDGE — poison + rejectAll + close — never a
      // lone rejection a polling helper would retry straight back into the
      // same dead Chrome (semantic merge of the scenario branch's per-command
      // deadline into the GH-248 wedge law).
      wedged(`CDP ${label} did not answer within ${CMD_TIMEOUT_MS} ms — `
        + 'Chrome is stalled, not slow (OB_CDP_TIMEOUT_MS tunes this) (GH-248)');
    }, CMD_TIMEOUT_MS);
    pending.set(id, {
      res: (v) => { clearTimeout(t); res(v); },
      rej: (e, reply) => { clearTimeout(t); rej(reply ? withReplyDetail(e, reply, { method, head, id, port }) : e); },
    });
    try {
      ws.send(JSON.stringify({ id, method, params }));
    } catch (e) {
      // a send() that throws must not strand its pending entry and deadline
      // timer (review P2, scenario branch).
      pending.delete(id);
      clearTimeout(t);
      rej(e);
    }
  });

  const client = {
    send,
    onEvent: (h) => eventHandlers.push(h),
    /** evaluate JS in the page, return the JSON value. */
    async eval(expr) {
      const r = await send('Runtime.evaluate',
        { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) {
        throw new Error('page eval failed: '
          + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
      }
      return r.result.value;
    },
    async screenshot(path) {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      const { writeFile } = await import('node:fs/promises');
      await writeFile(path, Buffer.from(data, 'base64'));
    },
    /** the Chrome child's pid — the real owner of :port and its profile dir,
     * and therefore the identity a retained reservation must name once this
     * launcher is gone. */
    pid: proc.pid,
    /** the terminal poison diagnosis, or null while the client is healthy
     * (GH-248 wedge-resume): staging helpers swallow per-eval failures into
     * their own timeout errors (reload barriers, awaitRunNavigation), so a
     * caller deciding "relaunch and resume vs give up" needs the CLIENT's
     * own verdict, not the error text that happened to surface. */
    poisoned: () => poison,
    close() {
      tracked.closing = true; // GH-665: a same-port relaunch may now wait on us
      clearInterval(liveProbe); // the wedge watchdog outlives nothing (GH-248)
      try { ws.close(); } catch {}
      // ancestry snapshot before the signal (review r13 P2, see killAndWait)
      if (proc.exitCode === null && proc.signalCode === null) {
        tracked.descendants = snapshotDescendants(proc.pid);
      }
      try { proc.kill(poison ? 'SIGKILL' : 'SIGTERM'); } catch { /* gone */ }
      // WEDGE LAW part 2 (review r1 P1): SIGTERM alone does not free a WEDGED
      // Chrome — a stopped process does not act on it, and its piped stderr
      // keeps node's loop alive, so an honest wedge rejection would still hang
      // the run at exit (close(), not closeAndWait(), is what nearly every
      // caller's finally uses). A client we already KNOW is dead or wedged is
      // SIGKILLed SYNCHRONOUSLY (review r3 P1): gates close() immediately before
      // process.exit(...) (e2e-touch.mjs's tail and its watchdog), which would
      // cancel any timer we set and orphan the child holding :port and its
      // profile dir. Otherwise escalate on an unref'd timer — it never holds an
      // otherwise-finished run open, and in the hang case the surviving child
      // is itself what keeps the loop alive long enough for this to fire.
      if (poison) {
        // WEDGE-KILL cleanup (GH-294): gates call close() immediately before
        // process.exit(...), which cancels timers and undispatched 'exit'
        // events — so confirm the SIGKILL SYNCHRONOUSLY and remove the
        // profile dir here, instead of leaving the wedge path's debt to the
        // startup sweep.
        if (confirmExitSync(proc.pid, 10)) rmProfile();
        return;
      }
      const esc = setTimeout(() => {
        try { proc.kill('SIGKILL'); } catch { /* raced exit */ }
      }, 3000);
      esc.unref?.();
    },
    /** close AND WAIT: resolves true once the child is CONFIRMED gone.
     * close() only signals, and a signalled Chrome still owns both
     * --remote-debugging-port and /tmp/obw-e2e-profile-<port> until it
     * actually exits — so any caller that hands those shared resources back
     * to other processes (hero-extend-render's reservation marker) must wait
     * for this, not for a sleep. Never throws: a false return is the answer,
     * and the caller decides what to do with a survivor. */
    async closeAndWait() {
      tracked.closing = true; // GH-665
      clearInterval(liveProbe);
      try { ws.close(); } catch { /* already closing */ }
      const exited = await killAndWait();
      // belt over the 'exit'-handler braces (GH-294): a true return means
      // the root is gone AND its helpers/profile are confirmed cleaned
      // (review r16 P2) — only then may a caller hand the port back.
      return exited && rmProfile();
    },
  };
  try {
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Log.enable');
  } catch (e) {
    // same law: no half-initialized Chrome survives a throw — and the throw
    // waits for the child to be GONE, not just signalled. launchFailure (not
    // a bare Error) so a survivor still carries `chromeSurvived`: this branch
    // returns no client, so that flag is the caller's ONLY way to know the
    // profile dir may still be in use (review r6 round-3 P2-b).
    clearInterval(liveProbe);
    try { ws.close(); } catch { /* already closing */ }
    const exited = await killAndWait();
    throw exited ? e : launchFailure(e.message, false);
  }
  // baseline ancestry snapshot (review r15 P2): a browser that CRASHES
  // spontaneously never passes through close()/killAndWait() while alive,
  // and the shell's markerless helpers would be unidentifiable afterwards.
  // close()/killAndWait() refresh this with a live snapshot when they can;
  // stale entries are harmless (every reap revalidates command+parent).
  tracked.descendants = snapshotDescendants(proc.pid);
  return client;
}

/** ---- GH-725 review r9 P2-1: a DERIVED endpoint is validated or refused ---------
 * Every port a tool COMPUTES (base ± k, base + slot * stride, a rotation / scan
 * family candidate) passes through this ONE check before use: an integer inside
 * [PORT_MIN, PORT_MAX], different from the port it derives from, and — when the
 * tool declares a window / family — inside it. On failure the tool REFUSES BY
 * NAME with the arithmetic printed (exit 2): it never launches Chrome or binds a
 * server on the value and never clamps it. launchChrome / spawnStaticServer apply
 * the same rule at the SINK, so a derivation no reader modelled still cannot bind.
 * Before r9 e2e-rollslip `--port 50000` derived CDP 70000 and venom-render
 * `--port 3000` a negative port, and both went on to launch. The lint holds every
 * modelled derivation to a call of assertDerivedEndpoint (derived-endpoint-unchecked)
 * and judges static values by the same range (derived-endpoint-out-of-range).
 *   value    the endpoint about to be used
 *   base     the port it derives from (a cdp endpoint's http port) — must differ; null when none
 *   window   { start, end } or a list of them: the tool's declared family; judged only for a DERIVED value
 *   derived  false when the value came from a pin / flag (the family rule does not apply; range and base do)
 *   expr     the arithmetic, printed in the refusal; pin: the env name the refusal tells the operator to set
 *   onFail   'exit' (default: message on stderr, exit 2) | 'throw' */
export const PORT_MIN = 1024;
export const PORT_MAX = 65535;
const windowsOf = (window) => (window ? (Array.isArray(window) ? window : [window]) : []).filter((w) => w && Number.isFinite(w.start) && Number.isFinite(w.end));
export function derivedEndpointProblem(value, { base = null, window = null, derived = true } = {}) {
  if (!Number.isInteger(value)) return `is not an integer (${String(value)})`;
  if (value < PORT_MIN || value > PORT_MAX) return `lies outside the valid port range ${PORT_MIN}-${PORT_MAX}`;
  if (base !== null && base !== undefined && Number.isFinite(Number(base)) && value === Number(base)) return `equals the port it derives from (${base}) — two endpoints would bind one port`;
  const wins = windowsOf(window);
  if (derived && wins.length && !wins.some((w) => value >= w.start && value <= w.end)) return `lies outside the tool's declared window ${wins.map((w) => `${w.start}-${w.end}`).join(', ')}`;
  return null;
}
export function assertDerivedEndpoint(value, { tool = null, role = 'port', base = null, expr = null, window = null, derived = true, pin = null, onFail = 'exit' } = {}) {
  const problem = derivedEndpointProblem(value, { base, window, derived });
  if (problem === null) return value;
  const name = tool ?? path.basename(String(process.argv[1] ?? 'tool'), '.mjs');
  const wins = windowsOf(window);
  const cure = pin ?? (role === 'cdp' ? 'OB_E2E_CDP_PORT' : 'OB_E2E_PORT');
  const msg = `${name}: refusing to launch — the ${derived ? 'derived' : 'pinned'} ${role} endpoint ${value}${expr && derived ? ` = ${expr}` : ''}`
    + `${base !== null && base !== undefined ? ` (base ${base})` : ''} ${problem}; pass ${cure} (or the tool's own flag) with a value`
    + ` inside ${PORT_MIN}-${PORT_MAX}${wins.length ? ` and inside ${wins.map((w) => `${w.start}-${w.end}`).join(', ')}` : ''}, different from its base`
    + ' — nothing was launched, nothing was clamped [derived-endpoint]';
  if (onFail === 'throw') throw new Error(msg);
  console.error(msg);
  process.exit(2);
}

/** GH-725 review r11 P2 (b): a dry-run / print / validate path certifies NOTHING until EVERY declared role passed the
 * same rule — `roles` = { http: { value, expr, derived, pin, window, base }, cdp: { … } }: each endpoint through
 * assertDerivedEndpoint (range, ≠ its base, inside its window when derived), then no two roles on one port. Refuses by
 * name on the first problem (exit 2, or throws with onFail: 'throw'); returns { role: value }. record.mjs
 * `--print-endpoints` validated the cdp side only, so `--port 0` printed http 0 and exited 0 — RENDER_ALL_DRY
 * certified an invalid http endpoint. */
export function assertEndpoints(tool, roles, { onFail = 'exit' } = {}) {
  const seen = new Map();
  for (const [role, r] of Object.entries(roles)) {
    if (!r) continue;
    assertDerivedEndpoint(r.value, { tool, role, base: r.base ?? null, expr: r.expr ?? null, window: r.window ?? null, derived: r.derived ?? true, pin: r.pin ?? null, onFail });
    const dup = seen.get(r.value);
    if (dup !== undefined) {
      const msg = `${tool}: refusing to launch — the ${role} endpoint ${r.value} equals the ${dup} endpoint (two roles on one port); pass distinct pins [derived-endpoint]`;
      if (onFail === 'throw') throw new Error(msg);
      console.error(msg); process.exit(2);
    }
    seen.set(r.value, role);
  }
  return Object.fromEntries(Object.entries(roles).filter(([, r]) => r).map(([k, r]) => [k, r.value]));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- paused-request answers (issue #915) -------------------------------------
// A Fetch.requestPaused handler answers with continue / fail / fulfill. When
// the page has already abandoned the request (it navigated or closed), Chrome
// replies "Invalid InterceptionId." — benign, but as a bare fire-and-forget
// send it escaped as an unhandled rejection and killed the whole suite.
// answerPausedRequest is the ONE answering path: it tolerates exactly that
// reply (counted, one printed line — never silent), routes every other
// rejection to the arm's fail callback exactly once, and returns a promise
// that never rejects, so fire-and-forget callers are safe by construction.
const PAUSED_ANSWER_METHODS = new Set([
  'Fetch.continueRequest', 'Fetch.failRequest', 'Fetch.fulfillRequest',
]);
let pausedAnswerTolerated = 0;
/** How many stale-id replies answerPausedRequest has tolerated so far. */
export function getPausedAnswerToleratedCount() { return pausedAnswerTolerated; }
/** Answer one paused request. `params` is the Fetch.requestPaused params
 * (requestId + request.url); `fields` are the extra CDP fields (errorReason,
 * responseCode, responseHeaders, body). Throws TypeError synchronously on an
 * unknown method or a missing fail callback; otherwise never rejects. */
export function answerPausedRequest(c, method, params, fields, options) {
  if (!PAUSED_ANSWER_METHODS.has(method)) {
    throw new TypeError(`answerPausedRequest: unknown method ${String(method)}`
      + ' — expected Fetch.continueRequest, Fetch.failRequest or Fetch.fulfillRequest');
  }
  const fail = options?.fail;
  if (typeof fail !== 'function') {
    throw new TypeError('answerPausedRequest: a fail callback is required');
  }
  const url = params?.request?.url ?? '';
  let sent;
  try {
    sent = c.send(method, { requestId: params?.requestId, ...(fields ?? {}) });
  } catch (e) { sent = Promise.reject(e); }
  return Promise.resolve(sent).then(
    () => undefined,
    (e) => {
      // guarded: a rejection value whose message getter throws (or that
      // String() cannot convert) must not make this promise reject either
      let msg;
      try { msg = e?.message ?? String(e); } catch { msg = '<unprintable rejection>'; }
      if (msg === 'Invalid InterceptionId.') {
        pausedAnswerTolerated += 1;
        console.log(`[cdp] stale paused-request answer tolerated: ${method} ${url}`
          + ' (Invalid InterceptionId.)');
        return;
      }
      // contained: even a throwing fail must not reject the returned promise
      try { fail(`answerPausedRequest ${method} ${url}: ${msg}`); } catch { /* never rejects */ }
    },
  );
}

/** #1221: a protocol-error reply's rejection (ws.onmessage hands send() Chrome's
 * raw error). The message stays Chrome's own text, byte for byte; the request it
 * answered rides on a NON-enumerable `cdp` property — { method, head (the
 * deadline label's: whitespace collapsed, 120 characters; null without an
 * expression), id, port, code, data } — so String(e), the stack, util.inspect
 * and JSON.stringify print exactly what they printed before. Every other
 * rejection (wedge, deadline, poison, readyState, socket close) passes no reply
 * and carries no `cdp`. */
function withReplyDetail(e, reply, { method, head, id, port }) {
  Object.defineProperty(e, 'cdp', { enumerable: false,
    value: { method, head, id, port, code: reply.code ?? null, data: reply.data ?? null } });
  return e;
}

/** #1221: the request a CDP protocol-error reply answered, as ONE line —
 * `Runtime.evaluate "<expression head>" (id 12, :9223, code -32000)` — or null
 * when `e` carries none (every other rejection, and any non-Error value).
 * Opt-in: e.message stays Chrome's own text; only a printer that calls this
 * shows the request. The head is the deadline label's (whitespace collapsed,
 * 120 characters), JSON-quoted like the data, so the line holds no newline. */
export function cdpReplyDetail(e) {
  const d = e?.cdp;
  if (!d) return null;
  return `${d.method}${d.head === null ? '' : ` ${JSON.stringify(d.head)}`} (id ${d.id}, :${d.port}`
    + `${d.code === null ? '' : `, code ${d.code}`}`
    + `${d.data === null ? '' : `, data ${JSON.stringify(d.data).slice(0, 200)}`})`;
}
