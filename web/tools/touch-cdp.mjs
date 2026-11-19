// Copyright (c) Meta Platforms, Inc. and affiliates.

// touch-cdp.mjs — shared CDP touch-synthesis helper for the feature-014
// touch e2e drivers (contracts/touch-e2e.md §1). Built on the existing
// in-house CDP client (web/tools/cdp.mjs) — no new dependencies.
//
// Frozen synthesis recipe (contracts/touch-e2e.md §1):
//   - Emulation.setDeviceMetricsOverride { width, height,
//     deviceScaleFactor: 3, mobile: true }   (phone viewports,
//     contracts/phone-hud.md §6)
//   - Emulation.setTouchEmulationEnabled { enabled: true, maxTouchPoints: 5 }
//   - Emulation.setEmitTouchEventsForMouse is NEVER used — gestures are
//     synthesized via Input.dispatchTouchEvent (touchStart/touchMove/
//     touchEnd/touchCancel with explicit touchPoints), which produces real
//     pointerType:'touch' PointerEvents and exercises the real classifier.
//
// Coarse-pointer mechanism (RECORDED, used uniformly by every scenario):
// the 2026-07 research spike (research.md R4) verified on this Chrome build
// that setDeviceMetricsOverride{mobile:true} + setTouchEmulationEnabled,
// applied BEFORE Page.navigate, flip matchMedia('(pointer: coarse)') to
// true for the app boot (main.js evaluates the media query in startLoop).
// launchPhone() re-verifies this at every boot (verifyCoarse) and FAILS
// LOUDLY if a Chrome build does not propagate coarse via the emulation
// overrides; the recorded fallback for such a build is to boot Chrome with
// --blink-settings=primaryPointerType=coarse (cdp.mjs takes the binary from
// CHROME_BIN, so the fallback is a wrapper script exporting that flag) —
// whichever mechanism boots a driver must be used by ALL of its scenarios.
// GH-294 wrapper contract: such a wrapper MUST `exec` its browser (the
// tracked pid is cdp.mjs's kill/cleanup identity), and a wrapper around the
// pinned SHELL must keep 'chrome-headless-shell' in its filename or set
// OB_CHROME_SHELL=1 so the darwin Metal/WebShare parity flags still apply.
//
// Spiked mechanics this helper embodies (research.md R4/R11):
//   - concurrent synthesized touches arrive as INDEPENDENT pointer streams
//     (own pointerId; second finger isPrimary: false);
//   - without `touch-action: none` on the gesture surface the browser takes
//     over a touch drag after a few moves and fires pointercancel — the
//     touch-action requirement that ui/touch.css's defense matrix exists
//     for. The --self-check arm measures exactly this.
//
// Self-check arm (T003; also the Phase-2 foundations checkpoint gate):
//   node web/tools/touch-cdp.mjs --self-check [--url http://…/app.html]
//                                [--viewport 844x390]
// Boots phone emulation, asserts coarse-pointer activation, then proves the
// synthesis mechanics: tap + two-finger gesture arrive as pointerType
// 'touch' PointerEvents with independent pointerIds (second finger
// isPrimary:false), and a one-finger 30-step drag completes with ZERO
// pointercancel. Pre-feature (no `.ob-touch` on <html>) the check injects a
// test-only inline `touch-action: none` on the canvas to prove the DISPATCH
// mechanics in isolation; once touch mode is installed (`.ob-touch` set) no
// style is injected — the app's own gating law must deliver the zero-cancel
// drag, and __touch.installed / __touch.state() are asserted too.
// PASS/FAIL exit codes per the battery convention. NOTE: the self-check does
// not gate console errors — battery gating lives in the e2e-touch drivers.
//
// Ports: self-serving self-check uses OB_E2E_PORT ?? 8243 and
// OB_E2E_CDP_PORT ?? 16443 (verified-free convention; never 8000/8080).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer }
  from './cdp.mjs';

export { sleep };

/** Stamp obtool=1 onto a tool-boot URL (cdp.mjs withToolParam is private —
 * same semantics, duplicated here because launchPhone navigates AFTER the
 * emulation overrides are installed, so the launch URL is not the app). */
function withToolParam(url) {
  const [base, hash] = url.split('#');
  if (/[?&]obtool=/.test(base)) return url; // pre-fragment only: a '?obtool='
  // inside the #fragment must not suppress the real query stamp
  return base + (base.includes('?') ? '&' : '?') + 'obtool=1'
    + (hash !== undefined ? '#' + hash : '');
}

/**
 * Launch Chrome with PHONE emulation active BEFORE the app boots, then
 * navigate to `appUrl`. The emulation overrides must precede navigation:
 * main.js evaluates matchMedia('(pointer: coarse)') once in startLoop.
 *
 * opts: { cdpPort (required), width = 844, height = 390,
 *         deviceScaleFactor = 3, maxTouchPoints = 5,
 *         tool = true (obtool stamp on appUrl), headless = true }
 * Returns the cdp.mjs client.
 */
export async function launchPhone(appUrl, {
  cdpPort, width = 844, height = 390, deviceScaleFactor = 3,
  maxTouchPoints = 5, tool = true, headless = true,
} = {}) {
  if (!cdpPort) throw new Error('launchPhone: cdpPort is required (verified-free convention)');
  // boot on the app origin's root (any http page target satisfies cdp.mjs's
  // page discovery) so the overrides land before app.html loads
  const origin = new URL(appUrl).origin + '/';
  const client = await launchChrome(origin, { port: cdpPort, tool: false, headless });
  await setPhoneMetrics(client, { width, height, deviceScaleFactor, maxTouchPoints });
  await client.send('Page.navigate', { url: tool ? withToolParam(appUrl) : appUrl });
  return client;
}

/** Apply the frozen phone-emulation recipe on an existing client. */
export async function setPhoneMetrics(client, {
  width = 844, height = 390, deviceScaleFactor = 3, maxTouchPoints = 5,
} = {}) {
  await client.send('Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor, mobile: true });
  await client.send('Emulation.setTouchEmulationEnabled',
    { enabled: true, maxTouchPoints });
}

/** Notch/home-indicator emulation (contracts/touch-e2e.md §4.1). Chrome's
 * Emulation.setSafeAreaInsetsOverride param shape varied across protocol
 * revisions — both are tried. Returns 'insets' | 'flat' | null (unavailable
 * on this Chrome build — callers fail loudly per the e2e-touch S1 law). */
export async function setSafeAreaInsets(client, insets) {
  const full = Object.fromEntries(Object.entries(insets)
    .flatMap(([k, v]) => [[k, v], [k + 'Max', v]]));
  try {
    await client.send('Emulation.setSafeAreaInsetsOverride', { insets: full });
    return 'insets';
  } catch {
    try {
      await client.send('Emulation.setSafeAreaInsetsOverride', full);
      return 'flat';
    } catch { return null; }
  }
}

/** Coarse-pointer boot verification (contracts/touch-e2e.md §1): every
 * driver calls this once after boot, before any scenario runs. */
export async function verifyCoarse(client) {
  const coarse = await client.eval(`matchMedia('(pointer: coarse)').matches`);
  if (coarse !== true) {
    throw new Error('coarse-pointer emulation did not propagate: this Chrome '
      + 'build needs the recorded fallback --blink-settings=primaryPointerType=coarse '
      + '(point CHROME_BIN at a wrapper adding the flag; see file header)');
  }
  return true;
}

/** Poll the app ready stamp (battery convention). */
export async function waitReady(client, tries = 200) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await client.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}

// ---- gesture primitives over Input.dispatchTouchEvent ----------------------
// All coordinates are CSS px in the emulated viewport. touchPoints carry
// explicit ids so multi-finger scenarios control each stream.
// VERIFIED Chrome semantics (probe 2026-07, this build): touchStart/
// touchMove list the ACTIVE points (new ids press, listed ids move), but a
// touchEnd RELEASES exactly the points it lists (matched by id) and keeps
// unlisted points down; an EMPTY touchEnd list releases everything. The
// helper API keeps the caller-friendly `remaining = still down` convention
// and translates through a per-client active-point ledger below.

const pt = (p) => ({ x: Math.round(p.x), y: Math.round(p.y), id: p.id ?? 1 });

const activePts = new WeakMap(); // client → Map(id → last dispatched point)
function ledger(client) {
  let m = activePts.get(client);
  if (!m) { m = new Map(); activePts.set(client, m); }
  return m;
}

export const touchStart = (client, points) => {
  const pts = points.map(pt);
  const m = ledger(client);
  for (const p of pts) m.set(p.id, p);
  return client.send('Input.dispatchTouchEvent',
    { type: 'touchStart', touchPoints: pts });
};
export const touchMove = (client, points) => {
  const pts = points.map(pt);
  const m = ledger(client);
  for (const p of pts) m.set(p.id, p);
  return client.send('Input.dispatchTouchEvent',
    { type: 'touchMove', touchPoints: pts });
};
/** `remaining` = the points STILL down after the release ([] lifts all). */
export const touchEnd = (client, remaining = []) => {
  const keep = remaining.map(pt);
  const keepIds = new Set(keep.map((p) => p.id));
  const released = [...ledger(client).values()]
    .filter((p) => !keepIds.has(p.id));
  activePts.set(client, new Map(keep.map((p) => [p.id, p])));
  return client.send('Input.dispatchTouchEvent',
    { type: 'touchEnd', touchPoints: released });
};
/** Cancel the whole touch sequence (browser-interruption emulation). */
export const touchCancel = (client) => {
  activePts.set(client, new Map());
  return client.send('Input.dispatchTouchEvent',
    { type: 'touchCancel', touchPoints: [] });
};

/** Single-finger tap at (x, y). */
export async function tap(client, x, y, { id = 1, pressMs = 40 } = {}) {
  await touchStart(client, [{ x, y, id }]);
  await sleep(pressMs);
  await touchEnd(client, []);
}

/**
 * Interpolated one-finger drag. `stepMs` paces the moves so page-side
 * velocity estimation (fine-curve m(v)) sees a controlled speed.
 * opts.lift=false keeps the finger down (compose with touchEnd/touchCancel).
 */
export async function drag(client, from, to, {
  id = 1, steps = 24, stepMs = 16, lift = true,
} = {}) {
  await touchStart(client, [{ ...from, id }]);
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    await touchMove(client, [{
      x: from.x + (to.x - from.x) * k,
      y: from.y + (to.y - from.y) * k, id,
    }]);
    if (stepMs) await sleep(stepMs);
  }
  if (lift) await touchEnd(client, []);
}

/**
 * Two-finger gesture (orbit/pinch): finger A lands, finger B joins, both
 * interpolate to their targets, then both lift (a.from→a.to, b.from→b.to).
 * opts.lift=false leaves both fingers down.
 */
export async function twoFingerGesture(client, a, b, {
  steps = 24, stepMs = 16, lift = true, aId = 1, bId = 2,
} = {}) {
  await touchStart(client, [{ ...a.from, id: aId }]);
  await touchStart(client, [{ ...a.from, id: aId }, { ...b.from, id: bId }]);
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    await touchMove(client, [
      { x: a.from.x + (a.to.x - a.from.x) * k,
        y: a.from.y + (a.to.y - a.from.y) * k, id: aId },
      { x: b.from.x + (b.to.x - b.from.x) * k,
        y: b.from.y + (b.to.y - b.from.y) * k, id: bId },
    ]);
    if (stepMs) await sleep(stepMs);
  }
  if (lift) await touchEnd(client, []);
}

/**
 * Three-finger gesture (issue #56 pan): fingers land one by one (S1 → S4 →
 * S4-pan), then interpolate to their targets together, then all lift.
 * Each of a/b/c is { from: {x, y}, to: {x, y} }; opts.lift=false keeps all
 * three down.
 */
export async function threeFingerGesture(client, a, b, c, {
  steps = 24, stepMs = 16, lift = true, aId = 1, bId = 2, cId = 3,
} = {}) {
  await touchStart(client, [{ ...a.from, id: aId }]);
  await touchStart(client, [{ ...a.from, id: aId }, { ...b.from, id: bId }]);
  await touchStart(client, [{ ...a.from, id: aId }, { ...b.from, id: bId },
    { ...c.from, id: cId }]);
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const at = (p) => ({
      x: p.from.x + (p.to.x - p.from.x) * k,
      y: p.from.y + (p.to.y - p.from.y) * k,
    });
    await touchMove(client, [
      { ...at(a), id: aId }, { ...at(b), id: bId }, { ...at(c), id: cId },
    ]);
    if (stepMs) await sleep(stepMs);
  }
  if (lift) await touchEnd(client, []);
}

// ---- shared page-side helpers (T010/T013) -----------------------------------
// Installed via client.eval() by e2e-touch.mjs and the e2e-ui.mjs --audit
// phone extension. Everything here is READ-ONLY probing:
//   __tp.project / projectK — world/kernel → CSS-px screen point (coords.js
//     basis: three = (k.y, k.z, k.x); camera from window.__dbg)
//   __tp.el(sel)            — rect + visibility of a selector
//   __tp.orbit()            — orbit spherical pose derived from the camera
//     (orbit.js apply(): pos = target + r·(sinφ sinθ, cosφ, sinφ cosθ),
//     target (0, 0.05, 0)) — no new app seam needed
//   __tp.find*()            — BEHAVIOR-BASED discovery of the phone control
//     surfaces. The frozen contracts pin LAYOUT (regions + minimum sizes,
//     phone-hud.md §3), not element ids, so the drivers locate widgets by
//     attribute hints first and the contracted geometry second. A missing
//     surface reports { found: false } and the calling assertion FAILS —
//     which is exactly the tests-first red state.
//   __tp.readTip()          — decodes the (a, b) tip offset from the #tip
//     canvas accent dot (hud.js drawTip: dot at (c + a·r, c − b·r),
//     r = 0.42·size). The spin popup writes through the #tip value chain
//     (phone-hud.md §3.6), so this is the only read-back channel that
//     needs no new app surface.
export const PAGE_HELPERS_JS = `(() => {
  const vis = (el) => !!el && el.getClientRects().length > 0
    && getComputedStyle(el).visibility !== 'hidden';
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height,
      cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  };
  const hint = (el, words) => {
    const s = ((el.id || '') + ' ' + String(el.className || '') + ' '
      + Object.keys(el.dataset || {}).join(' ') + ' '
      + Object.values(el.dataset || {}).join(' ')).toLowerCase();
    return words.some((w) => s.includes(w));
  };
  const all = () => [...document.querySelectorAll('body *')];
  const isRendererCanvas = (el) => el.tagName === 'CANVAS'
    && el.parentElement === document.body;
  window.__tp = {
    project(wx, wy, wz) {
      const cam = window.__dbg && window.__dbg.camera;
      if (!cam) return null;
      const V = cam.matrixWorldInverse.elements;
      const P = cam.projectionMatrix.elements;
      const mul = (m, v) => [
        m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
        m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
        m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
        m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3]];
      const c = mul(P, mul(V, [wx, wy, wz, 1]));
      if (!(c[3] > 0)) return null;
      return { x: (c[0] / c[3] + 1) / 2 * innerWidth,
        y: (1 - c[1] / c[3]) / 2 * innerHeight };
    },
    projectK(kx, ky, kz = 0.03) { return this.project(ky, kz, kx); },
    /** Screen point of a pocket-mouth marker (aim.js call affordance discs,
     * userData.pocket = kernel Table.pockets index) — the tap-zone
     * nomination target of touch-e2e.md §3.1 rows 9/12. */
    pocketScreen(i) {
      const scene = window.__dbg && window.__dbg.scene;
      if (!scene || typeof scene.traverse !== 'function') return { found: false };
      let mesh = null;
      scene.traverse((o) => {
        if (!mesh && o.userData && o.userData.pocket === i) mesh = o;
      });
      if (!mesh) return { found: false };
      mesh.updateWorldMatrix(true, false);
      const e = mesh.matrixWorld.elements;
      const p = this.project(e[12], e[13], e[14]);
      return p ? { found: true, visible: mesh.visible, ...p } : { found: false };
    },
    /** Screen point of a live ball center (balls() pos is three-frame). */
    ballScreen(id) {
      const b = (window.__test?.balls?.() ?? []).find((x) => x.id === id);
      if (!b || b.pocketed) return { found: false };
      const p = this.project(b.pos[0], b.pos[1], b.pos[2]);
      return p ? { found: true, ...p } : { found: false };
    },
    el(sel) {
      const e = document.querySelector(sel);
      if (!e) return { found: false, visible: false };
      return { found: true, visible: vis(e),
        display: getComputedStyle(e).display, ...rectOf(e) };
    },
    orbit() {
      // rig-truth first (issue #56: main.js exposes the orbit rig on __dbg —
      // pan and the single-pose aim chase move the target, so deriving the
      // pose from the camera with a hardcoded (0, 0.05, 0) target is wrong)
      const rig = window.__dbg && window.__dbg.orbit;
      if (rig && rig.state) {
        const s = rig.state;
        return { radius: s.radius, phi: s.phi, theta: s.theta,
          target: [s.target.x, s.target.y, s.target.z],
          bounds: s.bounds ? { x: s.bounds.x, z: s.bounds.z } : null };
      }
      const cam = window.__dbg && window.__dbg.camera;
      if (!cam) return null;
      const dx = cam.position.x, dy = cam.position.y - 0.05,
        dz = cam.position.z;
      const radius = Math.hypot(dx, dy, dz);
      return { radius, phi: Math.acos(dy / radius),
        theta: Math.atan2(dx, dz) };
    },
    camPose() {
      const c = window.__dbg && window.__dbg.camera;
      return c ? [c.position.x, c.position.y, c.position.z,
        c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w]
        : null;
    },
    findGauge() {
      const cands = all().filter((el) => vis(el) && !isRendererCanvas(el));
      const hinted = cands.filter((el) => hint(el, ['gauge'])
        || (hint(el, ['power']) && el.id !== 'power'
            && el.id !== 'power-val' && !el.closest('#hud')));
      const geo = cands.filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.left <= 96 && r.width >= 36 && r.width <= 160
          && r.height >= 160
          && (cs.position === 'fixed' || cs.position === 'absolute');
      });
      const el = hinted.find((e) => e.getBoundingClientRect().height >= 100)
        ?? geo[0];
      return el ? { found: true, ...rectOf(el) } : { found: false };
    },
    findSpinButton() {
      const shoot = document.getElementById('shoot');
      const sr = shoot ? shoot.getBoundingClientRect() : null;
      const cands = all().filter((el) => vis(el) && el !== shoot
        && !(shoot && (shoot.contains(el) || el.contains(shoot)))
        && !isRendererCanvas(el));
      const sized = cands.filter((el) => {
        const r = el.getBoundingClientRect();
        return Math.min(r.width, r.height) >= 48
          && Math.max(r.width, r.height) <= 180
          && r.left + r.width / 2 > innerWidth * 0.55
          && r.top + r.height / 2 > innerHeight * 0.4
          && (!sr || r.bottom <= sr.top + 8)
          && (el.tagName === 'BUTTON'
              || el.getAttribute('role') === 'button'
              || hint(el, ['spin', 'tip']));
      });
      const el = sized.find((e) => hint(e, ['spin', 'tip'])) ?? sized[0];
      this._spinEl = el ?? null; // clickSpin() consumes (audit walker, T013)
      return el ? { found: true, ...rectOf(el) } : { found: false };
    },
    /** Discover + programmatically activate the spin popup button (the
     * e2e-ui.mjs --audit phone walker measures geometry, not touch
     * operability — e2e-touch.mjs owns operability via real taps). */
    clickSpin() {
      const r = this.findSpinButton();
      if (r.found) this._spinEl.click();
      return r.found;
    },
    findChevrons() {
      const cands = all().filter((el) => vis(el)
        && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button'));
      const bl = cands.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2 < innerWidth * 0.45
          && r.top + r.height / 2 > innerHeight * 0.55
          && Math.min(r.width, r.height) >= 36;
      });
      const glyph = (el) => /[<>\\u2039\\u203a\\u25c0\\u25b6\\u2190\\u2192]/
        .test(el.textContent || '');
      const hits = bl.filter((el) => hint(el, ['nudge', 'fine', 'chev'])
        || glyph(el));
      if (hits.length < 2) return { found: false };
      hits.sort((a, b) => a.getBoundingClientRect().left
        - b.getBoundingClientRect().left);
      return { found: true, left: rectOf(hits[0]),
        right: rectOf(hits[hits.length - 1]) };
    },
    findPad() {
      const cands = all().filter((el) => {
        if (!vis(el) || isRendererCanvas(el) || el.id === 'tip') return false;
        const r = el.getBoundingClientRect();
        if (r.width < 140 || r.height < 140) return false;
        if (r.width / r.height > 1.6 || r.height / r.width > 1.6) return false;
        if (r.width > innerWidth * 0.85) return false;
        let anc = el, fixed = false;
        while (anc && anc !== document.body) {
          if (getComputedStyle(anc).position === 'fixed') { fixed = true; break; }
          anc = anc.parentElement;
        }
        return fixed && (el.tagName === 'CANVAS'
          || hint(el, ['pad', 'spin']) || !el.children.length);
      });
      cands.sort((a, b) => {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return ra.width * ra.height - rb.width * rb.height;
      });
      return cands[0] ? { found: true, ...rectOf(cands[0]) } : { found: false };
    },
    findPopupRange() {
      const el = [...document.querySelectorAll('input[type=range]')]
        .find((e) => vis(e) && !e.closest('#hud')
          && e.id !== 'ob-set-volume');
      return el ? { found: true, id: el.id, value: el.value, ...rectOf(el) }
        : { found: false };
    },
    findScrim() {
      const el = [...document.querySelectorAll('.ob-backdrop')].find(vis);
      return el ? { found: true, ...rectOf(el) } : { found: false };
    },
    drawerRows() {
      // ORDER CONTRACT (GH-225 Phase D): ['ob-share', 'rerack'] — rows[0] is
      // Share, rows[1] the re-rack row dispatching the CSS-hidden #rerack HUD
      // button. The Export + Record rows were retired with the rest of the
      // manual-recording chrome (030 the design charter DVR amendment clause 4); this
      // helper returns found ONLY when EVERY listed key resolves, so leaving
      // the dead ids here would fail e2e-touch S13 and the e2e-ui phone
      // sweep for a reason that looks unrelated to the deletion.
      const keys = ['ob-share', 'rerack'].map((id) => {
        const el = document.getElementById(id);
        return el ? el.dataset.i18n : null;
      });
      const drawer = document.getElementById('ob-settings');
      if (!drawer) return { found: false, keys };
      const rows = keys.map((k) => {
        if (!k) return { key: k, found: false };
        const el = [...drawer.querySelectorAll('[data-i18n="' + k + '"]')]
          .map((n) => n.closest('button,[role=button],li,label') ?? n)
          .find((n) => vis(n));
        // disabled: the re-rack row's shared-replay lock (issue #51 F3)
        return el ? { key: k, found: true, disabled: el.disabled === true,
          ...rectOf(el) }
          : { key: k, found: false };
      });
      return { found: rows.every((r) => r.found), rows };
    },
    readTip() {
      const tip = document.getElementById('tip');
      if (!tip) return null;
      const s = tip.width, c = s / 2, r = s * 0.42;
      // resolve --ob-accent through a 1px canvas so the reference RGB goes
      // through the SAME fill pipeline drawTip used (computed-style color
      // serialization differences cannot skew the match)
      const probe = document.createElement('div');
      probe.style.background = 'var(--ob-accent)';
      document.body.appendChild(probe);
      const col = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const oc = document.createElement('canvas');
      oc.width = oc.height = 1;
      const octx = oc.getContext('2d');
      octx.fillStyle = col;
      octx.fillRect(0, 0, 1, 1);
      const ref = octx.getImageData(0, 0, 1, 1).data;
      const img = tip.getContext('2d').getImageData(0, 0, s, s).data;
      let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < s; y++) {
        for (let x = 0; x < s; x++) {
          const i = (y * s + x) * 4;
          if (img[i + 3] > 200 && Math.abs(img[i] - ref[0]) < 28
            && Math.abs(img[i + 1] - ref[1]) < 28
            && Math.abs(img[i + 2] - ref[2]) < 28) { sx += x; sy += y; n++; }
        }
      }
      if (!n) return { n: 0 };
      return { n, a: (sx / n - c) / r, b: (c - sy / n) / r };
    },
  };
  return true;
})()`;

// ---- self-check arm ---------------------------------------------------------
// GH-410 port inventory (GH-687 lint law): the --self-check below binds ONE static
// server on OB_E2E_PORT and ONE Chrome on OB_E2E_CDP_PORT; declaring it lets the
// tool-default-overlap rule judge this harness file's own defaults (8243 / 16443)
// like any suite's (NOTE-CIRED-RELEASED-CLAIM round, refuter finding).
export const PORT_INVENTORY = { http: 1, cdp: 1 };

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain && process.argv.includes('--self-check')) {
  const argOf = (flag) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const vp = (argOf('--viewport') ?? '844x390').split('x').map(Number);
  const PORT = Number(process.env.OB_E2E_PORT ?? 8243);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16443);
  let url = argOf('--url');
  let server = null;
  if (!url) {
    const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    // GH-294: tracked group-killable lifecycle — a bare spawn+kill reaps only
    // the python3 wrapper and orphans the socket-holding grandchild.
    server = spawnStaticServer(webDir, PORT);
    await sleep(700);
    url = `http://127.0.0.1:${PORT}/app.html?seed=1`;
  }
  let failed = 0;
  const check = (name, ok, detail = '') => {
    if (ok) console.log('[touch-cdp] PASS', name);
    else { failed++; console.error('[touch-cdp] FAIL', name, detail); }
  };
  const client = await launchPhone(url,
    { cdpPort: CDP_PORT, width: vp[0], height: vp[1] });
  try {
    check('app ready on phone-emulated boot', await waitReady(client));
    await sleep(1200);
    check('coarse-pointer active at boot (frozen recipe, no fallback flag)',
      await verifyCoarse(client).then(() => true, (e) => { console.error(e.message); return false; }));
    check('maxTouchPoints = 5',
      await client.eval('navigator.maxTouchPoints') === 5);

    // recorder on the renderer canvas (the only direct <body> canvas child;
    // querySelector('canvas') alone would hit the HUD #tip widget)
    const installed = await client.eval(`(() => {
      const touchMode = document.documentElement.classList.contains('ob-touch');
      window.__tcRec = [];
      const cv = document.querySelector('body > canvas');
      if (!cv) return { err: 'renderer canvas not found' };
      if (!touchMode) cv.style.touchAction = 'none'; // pre-feature mechanics mode (see header)
      for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
        cv.addEventListener(t, (e) => window.__tcRec.push({
          t, pt: e.pointerType, id: e.pointerId, prim: e.isPrimary,
        }));
      }
      return { touchMode };
    })()`);
    check('renderer canvas found', !installed.err, installed.err ?? '');
    console.log('[touch-cdp] mode:', installed.touchMode
      ? 'touch mode installed (.ob-touch) — app CSS must deliver zero-cancel'
      : 'pre-feature — test-only touch-action injected to prove dispatch mechanics');
    const rec = () => client.eval('window.__tcRec');
    const clearRec = () => client.eval('window.__tcRec = []; true');

    // 1) tap → pointerType 'touch'
    await tap(client, Math.round(vp[0] * 0.45), Math.round(vp[1] * 0.5));
    await sleep(200);
    let r = await rec();
    check('tap arrives as pointerType touch (down+up)',
      r.some((e) => e.t === 'pointerdown' && e.pt === 'touch')
      && r.some((e) => e.t === 'pointerup' && e.pt === 'touch'),
      JSON.stringify(r));

    // 2) two-finger gesture → independent pointerIds, 2nd isPrimary false
    await clearRec();
    await twoFingerGesture(client,
      { from: { x: vp[0] * 0.35, y: vp[1] * 0.45 }, to: { x: vp[0] * 0.30, y: vp[1] * 0.40 } },
      { from: { x: vp[0] * 0.60, y: vp[1] * 0.60 }, to: { x: vp[0] * 0.65, y: vp[1] * 0.65 } },
      { steps: 10 });
    await sleep(200);
    r = await rec();
    const downs = r.filter((e) => e.t === 'pointerdown');
    const ids = [...new Set(downs.map((e) => e.id))];
    check('two fingers land as independent pointer streams (2 pointerIds)',
      ids.length === 2 && downs.every((e) => e.pt === 'touch'),
      JSON.stringify(downs));
    check('second finger isPrimary === false',
      downs.length === 2 && downs[0].prim === true && downs[1].prim === false,
      JSON.stringify(downs));

    // 3) one-finger 30-step drag → moves flow, ZERO pointercancel
    await clearRec();
    await drag(client, { x: vp[0] * 0.30, y: vp[1] * 0.55 },
      { x: vp[0] * 0.70, y: vp[1] * 0.55 }, { steps: 30, stepMs: 16 });
    await sleep(200);
    r = await rec();
    const cancels = r.filter((e) => e.t === 'pointercancel').length;
    const moves = r.filter((e) => e.t === 'pointermove').length;
    check(`touch drag flows without browser takeover (${moves} moves, ${cancels} pointercancel)`,
      moves >= 10 && cancels === 0);

    // 4) post-install surface (only once touch mode ships)
    if (installed.touchMode) {
      check('__touch.installed === true',
        await client.eval('window.__touch?.installed === true'));
      check("__touch.state() === 'S0' after all fingers lifted",
        await client.eval("window.__touch?.state?.() === 'S0'"));
    }
  } finally {
    // closeAndWait, not close(): this arm process.exit()s immediately below,
    // which would outrun close()'s async escalation AND the profile-dir rm
    // that rides the child's 'exit' event (GH-294 zero-leftover law). Both
    // verdicts GATE (review r7 P2): a survivor must never exit 0.
    const chromeGone = await client.closeAndWait();
    const serverGone = await stopStaticServer(server);
    if (!chromeGone || !serverGone) {
      failed++;
      console.error('[touch-cdp] FAIL teardown left a survivor '
        + `(chromeGone=${chromeGone} serverGone=${serverGone})`);
    }
  }
  console.log(failed ? '[touch-cdp] SELF-CHECK FAIL' : '[touch-cdp] SELF-CHECK PASS');
  process.exit(failed ? 1 : 0);
}
