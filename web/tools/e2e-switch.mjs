// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-switch.mjs — GH-967 / GH-970: a game entered through a transition
// (a hall game switch, a hall round trip, a shared replay's Continue) is
// STATE-IDENTICAL to a fresh entry into that game. REAL-user boots only
// (launchChrome tool:false): the hall, its key lights, the glare dim and the
// shell's gameplay-visual hides exist only there. Every transition is driven
// through the shipped controls with trusted CDP input (the toolbar Hall
// pill, the Play place discipline cards, the kit confirm, Play now, Shoot,
// the atelier station pills / rail cards / Equip / Keep, the replay banner's
// Continue); page reads are census only.
//
// The census (CENSUS below) compared against FRESH(G) — a new document on
// the SAME persisted settings blob, hall boot, Play now. Both twins first
// bake the env cube to its FIXED POINT (CONVERGE): the cube is history-
// dependent by design today (#971 — a fresh boot is not converged either),
// so the census reads the scene state the cube is a function of:
//   rods    exactly ONE visible 'obCueStick' rod the camera can see, and it
//           is aim.js's live gameplay rod (GH-967: cuepost.js's post-strike
//           whip rod shares the name and stays in the scene after a stroke);
//   lights  every light visible in the scene tree on a camera layer —
//           type / colour / intensity (1e-4 relative) / layers / parent;
//           lights hidden in the tree are listed in the record, not judged
//           (a hidden emitter cannot reach a pixel);
//   rig     __lighting.state() fixture / brightness / look / key trim /
//           one-table gain / auto, plus the live rect emitter intensities
//           (GH-970: a hall lighting Keep left them at 0.85^n);
//   frame   tone mapping + exposure, environment intensity, background,
//           fog, camera layer mask, no 'obShellLight' in the scene, the
//           shell's visual state closed (no keys, no glare pairs);
//   env     the converged environment cube's six face means (half-float
//           readback, 1/8 subsample);
//   cam     the orbit rig's target / radius / theta / phi and the fov
//           (GH-1025: a switch restored the previous table's pose);
//   stroke  the power and elevation inputs and the HUD #tip pad's drawing
//           (GH-993: a switch kept the previous game's power and tip);
//           elevation only where the layouts match (its floor follows the
//           cue ball);
//   pixels  the settled screenshot against FRESH(G)'s at the same pose,
//           the aim preview hidden (previewink.js holds its ink polarity
//           with hysteresis), focus and hover parked off the HUD. Rows
//           whose ball layout differs by construction (a post-stroke table
//           in the cue leg, a continued replay) skip the pixel judgment.
//
// Legs (default = all but the full matrix; --legs a,b to pick):
//   reported  the reported path, desktop 1280x800: 8-Ball, Shoot, Hall pill,
//             Snooker card + Continue  ==  FRESH(snooker).
//   phone     the same on the coarse phone register (844x390 DPR3, taps).
//   pairs     one boot walks the offered disciplines: before EVERY switch a
//             stroke (Shoot), then Hall pill -> next card -> Continue, census
//             == FRESH(next). Default walk = a cycle (each discipline once as
//             source and once as target); --matrix = an Eulerian circuit
//             over EVERY ordered pair the switcher offers. Every hall visit
//             of the walk also asserts no gameplay rod over the hall.
//   qachain   the chain the macOS-app journey reported, verbatim: snooker ->
//             8-ball -> snooker -> 10-ball -> heyball -> 9-ball, the pairs
//             leg's stroke + hall + fresh-twin judgments on every link.
//   hall      hall -> game: a fresh profile picks each discipline from the
//             hall (no stroke)  ==  FRESH(that discipline).
//   roundtrip game -> hall -> game: stroke, Hall pill, Play now — the table
//             comes back exactly as it was left (census + pixels vs the
//             pre-hall frame).
//   cue       GH-967 without a switch: after a stroke, (a) Equipment ->
//             Cues -> pick + Equip in the hall (no gameplay rod visible
//             over the hall) -> Play now; (b) the HUD cue picker at the
//             table -> Hall pill (gameplay rod hidden) -> Play now. Both ==
//             FRESH(same settings).
//   light     GH-970: Equipment -> Lighting in the hall, stage + Keep —
//             fixture / brightness / both in one Keep / three Keeps in one
//             visit / a slider nudge inside the 1.0 detent then Keep —
//             then Play now == FRESH(same settings), then a switch to
//             Snooker == FRESH(snooker, same settings).
//   returning GH-970's boot path: a RETURNING boot opens the hall before
//             the lighting leaf lands (the leaf's module response is held
//             until the hall is open — a counted interception, refused as
//             UNJUDGEABLE when it never fired); the leaf's landing fires
//             ob:relight with an identity no-op apply; Play now == FRESH.
//             Twice: default brightness, and b085 — a persisted brightness
//             whose lamp value equals the hall dim exactly (only the rig
//             signature tells the leaf's rewrite from the shell's own).
//   replay    replay Continue -> game: a Snooker stroke's share link opened
//             over a persisted 8-Ball table; Continue on the finished replay
//             == FRESH(snooker) (no pixel judgment: the replay's layout).
//   fallback  the reported path with the __aim.cueGroup seam removed (a stale
//             cached aim.js): shell.js's fallback walk must still resolve
//             the gameplay rod (cuepost/cuestrike rods claim obCueRole).
//   stroke    GH-993: power to the top of its track and the tip low-left
//             (trusted input), Shoot, Hall pill, Snooker + Continue ==
//             FRESH(snooker) — power, elevation and the tip pad included.
//   camera    GH-1025: orbit low and close on 8-Ball (trusted right-drag,
//             Shift + wheel), Hall pill, Snooker + Continue == FRESH(snooker)
//             including the camera pose, with the D and the cue ball inside
//             the frustum. After the same orbit (each row checks it landed):
//             Hall pill + Play now keeps the user's own pose (FR-007(5)); a
//             same-game table Keep onto a shorter bed exits on the fresh-entry
//             pose (the bed half of the key); a same-game ball-set Keep, which
//             re-racks on the same bed (checked), keeps the user's pose (the
//             value key, never template identity).
//   returnpose GH-984: a RETURNING boot with Snooker persisted, every rAF of
//             the document queued (counted) so no frame is delivered. A
//             fresh-rack AIM{seed} emission must land in the open hall before
//             the first frame: the boot's own async re-rack when it comes
//             after the open (the WKWebView order), else — Chrome racks
//             before the shell exists — the same ctx.game.rerack(seed) call
//             the boot staging makes, issued once the hall is open (refused
//             as UNJUDGEABLE when a frame was delivered first). The hall pose
//             is then the Play anchor (the pose a table round trip lands
//             on), never the orbit-clamped close-up of the blue spot.
//   escape    QA r3: 1-Pocket stroke, Hall pill, 3-Cushion card, Continue,
//             and a real Escape sent into the switch's stall — on the page's
//             report that the overlay painted, or 170 ms after it,
//             alternating over up to eight attempts — that the page's own
//             record places inside the long task running at the instant it
//             aimed at, where the switch shield swallows it == FRESH; no such
//             attempt is UNJUDGEABLE (not exercised); then a stroke and the
//             next switch (Straight Pool) == FRESH.
//   rmkb      QA r3: prefers-reduced-motion + a keyboard-only switch from
//             the sandbox (Snooker stroke, Practice -> Playground, then the
//             Hall pill, the 8-Ball card and Continue by Enter / Tab) ==
//             FRESH.
//   winkeep   QA R3J2-F2: a staged 9-Ball win, the Hall pill inside the WIN
//             hold (checked), Equipment; the 2.6 s continuation re-racks
//             under the open hall (checked — the order the QA journey
//             recorded); Cues -> Equip (the rebuilt gameplay rod now follows
//             the win stroke's whip rod, the order the QA journey reached
//             mid-session; checked) -> Table -> another table -> Keep ==
//             FRESH (same settings).
//
// Ports: OB_E2E_PORT / OB_E2E_CDP_PORT (run-gate --band assigns them).
// Artifacts: --out <dir> (or OB_E2E_SWITCH_OUT) keeps every census JSON and
// screenshot; without it the run writes to a temp dir it removes on exit.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { setPhoneMetrics, tap } from './touch-cdp.mjs';
import { decodePng } from './png.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };

const ALL_LEGS = ['reported', 'phone', 'pairs', 'qachain', 'hall', 'roundtrip', 'cue', 'light', 'returning', 'replay', 'fallback',
  'stroke', 'camera', 'returnpose', 'escape', 'rmkb', 'winkeep'];
const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false };
const PHONE = { width: 844, height: 390, deviceScaleFactor: 3 };
// pixel law (calibrated on the fixed tree; see the seal report): a settled
// frame differs from its fresh twin only by GPU noise — the per-pixel max
// channel delta stays under PX_DELTA everywhere but a few isolated pixels.
// The stray cue rod alone moved ~1000 pixels past it.
const PX_DELTA = 40;
const PX_BUDGET = 120;
const ENV_ABS = 0.01, ENV_REL = 0.03;

// ---- page probes --------------------------------------------------------------
// the orbit rig's pose (main.js publishes the rig as __dbg.orbit)
const CAM_FN = `() => { const d = window.__dbg, o = d?.orbit?.state; if (!o) return null;
  return { t: [o.target.x, o.target.y, o.target.z], r: o.radius, th: o.theta, ph: o.phi, fov: d.camera.fov }; }`;
// the stroke the next Shoot fires: hud.getShot() reads #power / #elev and the
// tip offsets the #tip pad draws (FNV-1a of its pixels: the dot's place)
const STROKE_FN = `() => { const p = document.getElementById('power'), e = document.getElementById('elev'), t = document.getElementById('tip');
  let tip = null;
  try { const u = t ? t.toDataURL() : ''; let h = 2166136261; for (let i = 0; i < u.length; i++) { h ^= u.charCodeAt(i); h = Math.imul(h, 16777619); } tip = (h >>> 0).toString(16); } catch { tip = null; }
  return { power: p ? p.value : null, elev: e ? e.value : null, tip }; }`;
const CAM = `(${CAM_FN})()`;
const STROKE = `(${STROKE_FN})()`;
const CENSUS = `(() => {
  const d = window.__dbg; if (!d) return { err: 'no __dbg' };
  const { scene, renderer, camera, cubeRT } = d;
  scene.updateMatrixWorld(true);
  const inTree = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
  const aimRod = (() => { try { return (window.__obSwitchAimRod ?? window.__aim?.cueGroup)?.() ?? null; } catch { return null; } })();
  const rods = [], lights = [], hiddenLights = [];
  let shellLight = false;
  scene.traverse((o) => {
    if (o.name === 'obShellLight') shellLight = true;
    if (o.name === 'obCueStick') {
      let layers = 0; o.traverse((k) => { layers |= k.layers.mask; });
      const e = o.matrixWorld.elements;
      rods.push({ id: o.uuid.slice(0, 8), role: o.userData?.obCueRole ?? null, gameplay: o === aimRod,
        visible: inTree(o) && (layers & camera.layers.mask) !== 0, pos: [e[12], e[13], e[14]].map((v) => +v.toFixed(3)) });
    }
    if (o.isLight) {
      const row = { type: o.type, name: o.name || '', parent: o.parent?.name || o.parent?.type || '',
        i: +o.intensity, c: o.color?.getHexString?.() ?? null, g: o.groundColor?.getHexString?.() ?? null, layers: o.layers.mask };
      if (inTree(o) && (o.layers.mask & camera.layers.mask) !== 0) lights.push(row); else hiddenLights.push(row);
    }
  });
  let rect = null;
  try { rect = (window.__obSwitchRoom?.activeRoom?.instance?.lightRefs?.rectLights ?? []).map((l) => +l.intensity); } catch { rect = null; }
  let rig = null;
  try { const s = window.__lighting?.state?.(); rig = s ? { fixture: s.fixture, brightness: s.brightness, look: s.look, keyTrim: s.keyTrim, oneTableGain: s.oneTableGain, auto: s.auto } : null; } catch { rig = null; }
  const h2f = (h) => { const g = h & 32768 ? -1 : 1, x = h >> 10 & 31, m = h & 1023; return x ? (x === 31 ? NaN : g * 2 ** (x - 15) * (1 + m / 1024)) : g * 2 ** -14 * m / 1024; };
  const env = [];
  try {
    const N = cubeRT.width, b = new Uint16Array(N * N * 4);
    for (let f = 0; f < 6; f++) {
      renderer.readRenderTargetPixels(cubeRT, 0, 0, N, N, b, f);
      let R = 0, G = 0, B = 0, n = 0;
      for (let y = 0; y < N; y += 8) for (let x = 0; x < N; x += 8) {
        const i = 4 * (y * N + x), r = h2f(b[i]), gg = h2f(b[i + 1]), bb = h2f(b[i + 2]);
        if (Number.isFinite(r + gg + bb)) { R += r; G += gg; B += bb; n++; }
      }
      env.push([R / n, G / n, B / n]);
    }
  } catch (e) { env.push(String(e)); }
  const vs = window.__shell?.visualState?.() ?? null;
  return {
    state: window.__test?.state?.() ?? null, game: window.__settings?.get?.()?.game ?? null,
    rods, lights, hiddenLights, rect, rig, env, shellLight,
    frame: { toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure,
      envIntensity: scene.environmentIntensity, bg: scene.background?.isColor ? scene.background.getHexString() : (scene.background ? 'texture' : null),
      fog: scene.fog ? [scene.fog.type ?? scene.fog.constructor.name, scene.fog.color?.getHexString?.(), scene.fog.near, scene.fog.far, scene.fog.density] : null,
      camMask: camera.layers.mask },
    shell: { open: window.__shell?.isOpen?.() ?? null, keys: vs?.keys ?? null, glare: vs ? vs.glare.length : null, camLayer1: vs?.camLayer1 ?? null },
    cam: (${CAM_FN})(), stroke: (${STROKE_FN})(),
    blob: (() => { try { return localStorage.getItem('ob-settings-v1'); } catch { return null; } })(),
  };
})()`;
// GH-1025's measure: the cue ball and 13 points of the snooker D arc
// projected through the live camera (the D: game.js SNOOKER_BAULK_FROM_BOTTOM
// 0.737 m / SNOOKER_D_RADIUS 0.292 m on the 3.569 m bed; the kernel's length
// axis is three's x, camerapresets.js precedent)
const D_ARC_IN_VIEW = `(() => {
  const d = window.__dbg, cam = d.camera; cam.updateMatrixWorld(true);
  const V = cam.position.constructor;
  const ndc = (x, y, z) => { const v = new V(x, y, z).project(cam); return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; };
  const inside = (p) => Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1 && p[2] > -1 && p[2] < 1;
  const m = window.__test.ballMeshes()[0]; m.updateMatrixWorld(true); const e = m.matrixWorld.elements;
  const cue = ndc(e[12], e[13], e[14]);
  const bx = -3.569 / 2 + 0.737, R = 0.292, dN = 13; let dIn = 0;
  for (let i = 0; i < dN; i++) { const a = Math.PI / 2 + Math.PI * i / (dN - 1); if (inside(ndc(bx + R * Math.cos(a), 0.0286, R * Math.sin(a)))) dIn++; }
  return { cue, cueIn: inside(cue), dIn, dN };
})()`;
// GH-984's window, made deterministic: every requestAnimationFrame of the
// document is QUEUED (none delivered) until __obRafRelease(), so the async
// boot re-rack of a persisted non-default game lands before the first frame
// — the WKWebView boot's order (in Chrome the first frame usually wins)
const RAF_HOLD = `(() => {
  const raf = window.requestAnimationFrame.bind(window), q = []; let held = true;
  window.__obRafQ = q;
  window.requestAnimationFrame = (cb) => { if (held) { q.push(cb); return q.length; } return raf(cb); };
  window.__obRafRelease = () => { held = false; window.requestAnimationFrame = raf; const cbs = q.splice(0); for (const cb of cbs) raf(cb); return cbs.length; };
})()`;
// the escape leg's own record, installed before the document's scripts so
// its window capture listener runs ahead of main.js's switch shield: the
// Continue click's and the Escape's event timeStamps (stamped when the
// browser dispatched them, not when a busy renderer got to them), when the
// page handled the Escape, and the document's long tasks, so the leg proves
// its Escape was queued INSIDE the switch's stall instead of trusting the
// dispatch time. The switch is released when the overlay title's Element
// Timing entry lands after the overlay's two frames and a task
// (ui/switchprogress.js showSwitchProgress; an entry that came earlier
// releases it when those pass, none at all at a 500 ms cap); this observer,
// registered before the app's, reports the entry through the __obEscGo
// binding, the clock the leg times its Escape from
const ESC_PROBE = `(() => {
  const p = window.__obEscProbe = { continueAt: null, go: null, keys: [], tasks: [] };
  addEventListener('click', (e) => { if (e.isTrusted && e.target?.closest?.('[data-ob="confirm-accept"]')) { p.continueAt = e.timeStamp; p.go = null; } }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') p.keys.push({ ts: e.timeStamp, at: performance.now(), shield: document.documentElement.hasAttribute('data-ob-switching') }); }, true);
  try { new PerformanceObserver((l) => { for (const t of l.getEntries()) p.tasks.push({ s: t.startTime, d: t.duration }); }).observe({ type: 'longtask' }); } catch { p.tasks = null; }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        // one report per switch: every Continue click re-arms it (a leg switches more than once per document)
        if (p.go === null && p.continueAt !== null && String(e.identifier).startsWith('ob-switchprogress-')) {
          p.go = performance.now();
          try { window.__obEscGo?.(String(Math.round(p.go))); } catch { /* no binding: the leg's fallback */ }
        }
      }
    }).observe({ type: 'element' });
  } catch { /* no Element Timing: the leg's fallback */ }
})()`;
// each attempt aims its Escape ESCAPE_AIMS_MS after the page's report,
// alternating. 0: the report's own task, in which settings.changeGame goes
// on into the synchronous table build (set('game')) whenever the entry lands
// after the overlay's frames, as in every recorded run; it lasted about
// 80-95 ms, so an Escape sent on the report lands in it whenever the
// report-to-key round trip is shorter. 170: inside the next long task,
// usually the first post-build frame, which compiles the new materials (by
// switchprogress.js's account, settle); on a warm document (every retry, and
// the whole e2e-switch-paths job) it began 83-198 ms after the report in the
// recorded runs and ran 54-734 ms, and a long task that had begun in time
// held the 170 ms instant in all but a few. Both aims miss a round trip
// longer than what is left of their task, and a busy box held round trips of
// 80 ms and more for most of a minute once, hence eight attempts. No report
// within ESCAPE_GO_FALLBACK_MS: the Escape goes out then and cannot count
const ESCAPE_AIMS_MS = [0, 170, 0, 170, 0, 170, 0, 170], ESCAPE_GO_FALLBACK_MS = 1500, ESCAPE_AIM_MARGIN_MS = 5;
// the page's record for an attempt aimed aimMs after the report (times
// relative to the Continue click). Its target is the long task holding that
// instant that had begun before the leg could send anything: for aim 0 a
// task holding the report itself (the report is sent from inside it); for a
// later aim, a task that began at least ESCAPE_AIM_MARGIN_MS before the
// instant, before the leg's timer (a millisecond or so of slack) fired. So a
// page read issued before the Escape is answered only after the target ends,
// and the read-first order cannot count. The Escape is in the target when it
// was stamped at least 3 ms before the task's end and the page handled it
// only after the task ended (it waited behind it)
const escRecord = (aimMs) => `(() => {
  const p = window.__obEscProbe; if (!p) return { probe: false };
  const k = p.keys[p.keys.length - 1] ?? null, c0 = p.continueAt, go = p.go;
  const tasks = p.tasks ? p.tasks.slice().sort((a, b) => a.s - b.s) : null;
  const at = go == null ? null : go + ${aimMs}, began = at == null ? null : ${aimMs ? `at - ${ESCAPE_AIM_MARGIN_MS}` : 'at + 0.25'};
  const target = tasks && at != null ? tasks.find((x) => x.s <= began && at <= x.s + x.d) ?? null : null;
  const rel = (v) => (v == null || c0 == null ? null : Math.round(v - c0));
  const span = (t) => (t ? [rel(t.s), Math.round(t.d)] : null);
  return { probe: true, tasksObserved: !!tasks, continueSeen: c0 != null, escapes: p.keys.length, go: rel(go), aimMs: ${aimMs},
    queued: k ? rel(k.ts) : null, handled: k ? rel(k.at) : null, shield: k ? k.shield : null, target: span(target),
    inTarget: !!(k && target && target.s <= k.ts && k.ts <= target.s + target.d - 3 && k.at >= target.s + target.d - 2),
    longtasksAfter: tasks && c0 != null ? tasks.filter((x) => x.s >= c0 - 1).slice(0, 8).map(span) : null };
})()`;
// room.js handle for the rect census (namespace import through the page's
// own module graph; once per document)
const ROOM_HANDLE = `import(new URL('scene/room.js', location.href).href).then((m) => { window.__obSwitchRoom = m; return true; })`;
// the env cube is HISTORY-dependent (#971: every bake lights the env-bound
// walls under the previous cube; a fresh boot is not at the fixed point
// either — measured: ~3 bakes to converge). Before a census both twins bake
// the cube to its fixed point through the public seam, so the comparison
// reads the scene STATE the cube is a function of, never its history.
// The cube camera sits 11.5 cm over the bed centre and every bake hides only
// the balls, so it photographs the cue rod at its aim pose and the aim-assist
// overlays (ghost ball, lines, ball-in-hand zone) wherever the last pointer
// left them — layout and input consequences, not scene state: these bakes
// run with every rod and every obAim* group hidden, restored right after.
// The census env is read HERE, from the converged rod-free cube: since the
// GH-971 env tail (main.js ENV_TAIL) every bake request owes more bakes, one
// per delivered frame, which hide only the balls and run after aim.js has
// shown the rod and the overlays again — the cube CENSUS would read later
// holds the rod at its aim pose.
const CONVERGE = `(() => {
  const { renderer: r, cubeRT: rt, scene } = window.__dbg;
  const rods = []; scene.traverse((o) => { if ((o.name === 'obCueStick' || /^obAim/.test(o.name || '')) && o.visible) rods.push(o); });
  for (const o of rods) o.visible = false;
  const h2f = (h) => { const g = h & 32768 ? -1 : 1, x = h >> 10 & 31, m = h & 1023; return x ? (x === 31 ? NaN : g * 2 ** (x - 15) * (1 + m / 1024)) : g * 2 ** -14 * m / 1024; };
  const N = rt.width, b = new Uint16Array(N * N * 4);
  const means = () => { const out = []; for (let f = 0; f < 6; f++) { r.readRenderTargetPixels(rt, 0, 0, N, N, b, f); let s = 0, n = 0;
    for (let y = 0; y < N; y += 8) for (let x = 0; x < N; x += 8) { const i = 4 * (y * N + x); const l = h2f(b[i]) + h2f(b[i + 1]) + h2f(b[i + 2]); if (Number.isFinite(l)) { s += l; n++; } }
    out.push(n ? s / n : 0); } return out; };
  let prev = means(), bakes = 0, rel = null;
  for (let i = 0; i < 12; i++) {
    window.__rebakeEnv(); bakes++;
    const m = means();
    rel = Math.max(...m.map((v, k) => Math.abs(v - prev[k]) / Math.max(Math.abs(prev[k]), 1e-6)));
    prev = m;
    if (rel <= 1e-4) break;
  }
  const env = [];
  for (let f = 0; f < 6; f++) {
    r.readRenderTargetPixels(rt, 0, 0, N, N, b, f);
    let R = 0, G = 0, B = 0, n = 0;
    for (let y = 0; y < N; y += 8) for (let x = 0; x < N; x += 8) {
      const i = 4 * (y * N + x), rr = h2f(b[i]), gg = h2f(b[i + 1]), bb = h2f(b[i + 2]);
      if (Number.isFinite(rr + gg + bb)) { R += rr; G += gg; B += bb; n++; }
    }
    env.push([R / n, G / n, B / n]);
  }
  for (const o of rods) o.visible = true;
  return { bakes, rel, env, tail: window.__rebakeEnv.tail?.() ?? null };
})()`;
const TEX_PENDING = `(() => {
  const { scene } = window.__dbg; const seen = new Set(); let count = 0; const names = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      for (const k of Object.keys(m)) {
        const t = m[k];
        if (!t || !t.isTexture || seen.has(t) || t.isRenderTargetTexture || t.isCubeTexture) continue;
        seen.add(t);
        const img = t.image;
        const ok = t.isDataTexture || t.isCanvasTexture || (img && (img.complete === undefined || img.complete) && ((img.naturalWidth ?? img.width ?? 1) > 0) && t.version > 0);
        if (!ok) { count++; if (names.length < 4) names.push((o.name || o.parent?.name || '?') + ':' + k); }
      }
    }
  });
  const tr = scene.getObjectByName('obTable')?.userData?.tableReadiness;
  let occl = 0; try { occl = window.__snkOccl?.pending?.() ?? 0; } catch { occl = -1; }
  return { count, names, table: tr ? tr.status : 'READY', occl };
})()`;
const PREVIEW_HIDE = (on) => `(() => {
  const g = window.__dbg.scene.getObjectByName('obAimPreview');
  if (!g) return false;
  if (${on}) { window.__obSwitchPv = g.visible; g.visible = false; } else if (window.__obSwitchPv !== undefined) { g.visible = window.__obSwitchPv; window.__obSwitchPv = undefined; }
  return true;
})()`;
const VISUAL_KEYS = ['game', 'equipment', 'fixture', 'fixtureAuto', 'brightness', 'look', 'clothColor', 'mode'];

// ---- comparison -----------------------------------------------------------------
const relEq = (a, b, rel = 1e-4) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
const lightKey = (l) => `${l.type}|${l.name}|${l.parent}|${l.c}|${l.g}|${l.layers}`;

function judgeRods(tag, S, fail) {
  const vis = S.rods.filter((r) => r.visible);
  if (vis.length !== 1 || !vis[0].gameplay) {
    fail(`${tag}: rods — want exactly ONE visible cue rod and it must be the gameplay rod; got ${JSON.stringify(S.rods)}`);
    return false;
  }
  return true;
}

function judgeFrame(tag, S, fail) {
  let ok = true;
  if (S.shellLight) { fail(`${tag}: obShellLight still in the scene after the hall exit`); ok = false; }
  if (S.shell.open !== false || S.shell.keys !== 0 || S.shell.glare !== 0 || S.shell.camLayer1 !== false) {
    fail(`${tag}: shell visual state not closed: ${JSON.stringify(S.shell)}`); ok = false;
  }
  return ok;
}

const camDelta = (a, b) => (a && b
  ? Math.max(...a.t.map((v, i) => Math.abs(v - b.t[i])), Math.abs(a.r - b.r), Math.abs(a.th - b.th), Math.abs(a.ph - b.ph), Math.abs(a.fov - b.fov))
  : Infinity);

/** S (transitioned) vs F (fresh twin): every difference as { kind, msg }.
 * `layout:false` for rows whose ball layout differs by construction (the
 * elevation floor follows the cue ball). */
function diffAgainst(S, F, { layout = true } = {}) {
  const out = [];
  const f = (msg, kind = 'state') => out.push({ kind, msg });
  if (S.game !== F.game) f(`game ${S.game} vs fresh ${F.game}`);
  if (!(camDelta(S.cam, F.cam) <= 1e-6)) f(`camera pose ${JSON.stringify(S.cam)} vs fresh ${JSON.stringify(F.cam)}`);
  if (S.stroke?.power !== F.stroke?.power) f(`power ${S.stroke?.power} vs fresh ${F.stroke?.power}`);
  if (S.stroke?.tip !== F.stroke?.tip) f(`the #tip pad draws a different tip offset than the fresh entry (${S.stroke?.tip} vs ${F.stroke?.tip})`);
  if (layout && S.stroke?.elev !== F.stroke?.elev) f(`elevation ${S.stroke?.elev} vs fresh ${F.stroke?.elev}`);
  for (const k of Object.keys(F.frame)) {
    if (JSON.stringify(S.frame[k]) !== JSON.stringify(F.frame[k])) f(`frame.${k} ${JSON.stringify(S.frame[k])} vs fresh ${JSON.stringify(F.frame[k])}`);
  }
  if (JSON.stringify(S.rig) !== JSON.stringify(F.rig)) f(`lighting rig ${JSON.stringify(S.rig)} vs fresh ${JSON.stringify(F.rig)}`);
  if (!S.rect || !F.rect || S.rect.length !== F.rect.length || S.rect.some((v, i) => !relEq(v, F.rect[i]))) {
    f(`rect emitters ${JSON.stringify(S.rect)} vs fresh ${JSON.stringify(F.rect)}`);
  }
  const sl = [...S.lights].sort((a, b) => lightKey(a).localeCompare(lightKey(b)) || a.i - b.i);
  const fl = [...F.lights].sort((a, b) => lightKey(a).localeCompare(lightKey(b)) || a.i - b.i);
  if (sl.length !== fl.length || sl.some((l, i) => lightKey(l) !== lightKey(fl[i]) || !relEq(l.i, fl[i].i))) {
    f(`visible lights differ:\n    switched ${JSON.stringify(sl)}\n    fresh    ${JSON.stringify(fl)}`);
  }
  if (S.env.length !== 6 || F.env.length !== 6 || typeof S.env[0] === 'string' || typeof F.env[0] === 'string') {
    f(`env cube unreadable: ${JSON.stringify(S.env).slice(0, 120)} / ${JSON.stringify(F.env).slice(0, 120)}`);
  } else {
    let worst = null;
    for (let i = 0; i < 6; i++) for (let ch = 0; ch < 3; ch++) {
      const a = S.env[i][ch], b = F.env[i][ch];
      const over = Math.abs(a - b) - Math.max(ENV_ABS, ENV_REL * Math.abs(b));
      if (over > 0 && (!worst || over > worst.over)) worst = { over, i, ch, a, b };
    }
    if (worst) f(`env face ${worst.i} ch ${worst.ch} ${worst.a.toFixed(4)} vs fresh ${worst.b.toFixed(4)}`, 'env');
  }
  return out;
}

function pixelStats(fileA, fileB) {
  const a = decodePng(fileA), b = decodePng(fileB);
  if (a.w !== b.w || a.h !== b.h) return { err: `size ${a.w}x${a.h} vs ${b.w}x${b.h}` };
  let over = 0, sum = 0;
  const n = a.w * a.h;
  for (let p = 0; p < n; p++) {
    let m = 0;
    for (let ch = 0; ch < 3; ch++) {
      const dlt = Math.abs(a.data[p * a.ch + ch] - b.data[p * b.ch + ch]);
      sum += dlt;
      if (dlt > m) m = dlt;
    }
    if (m > PX_DELTA) over++;
  }
  return { over, mean: sum / (3 * n) };
}

// ---- the driver -----------------------------------------------------------------
export async function runSwitchArms({ PORT, CDP_PORT, fail, legs = ALL_LEGS, matrix = false, out }) {
  const origin = `http://127.0.0.1:${PORT}`;
  let arms = 0;
  const pass = (m) => { arms++; console.log(`  - ${m}: green`); };
  const log = (m) => console.log(`    ${m}`);
  const errs = [];
  let c = await launchChrome(`${origin}/`, { port: CDP_PORT, tool: false, width: DESKTOP.width, height: DESKTOP.height });
  c.onEvent((method, params) => {
    if (method === 'Runtime.exceptionThrown') errs.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  });
  let phone = false;
  const evalP = (expr) => c.eval(expr);
  const waitFor = async (expr, { timeout = 60000, label = expr } = {}) => {
    const t0 = Date.now(); let last;
    while (Date.now() - t0 < timeout) {
      try { last = await evalP(expr); if (last) return last; } catch (e) { last = String(e.message || e); }
      await sleep(150);
    }
    throw new Error(`timeout waiting for ${label} (last ${JSON.stringify(last)})`);
  };
  /** trusted input at the element's centre: a mouse click (desktop) or a tap
   * (phone register). Refuses a covered target (elementFromPoint). */
  const press = async (sel, { scroll = true } = {}) => {
    await waitFor(SWITCH_IDLE, { timeout: 35000, label: `switch overlay gone before pressing ${sel}` });
    const r = await evalP(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
      if (!el) return null; ${scroll ? "el.scrollIntoView({ block: 'center', inline: 'center' });" : ''}
      const b = el.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
      const h = document.elementFromPoint(x, y), hit = !!h && (h === el || el.contains(h));
      // a refusal names what took the hit
      const top = h && !hit ? h.tagName.toLowerCase() + (h.id ? '#' + h.id : '')
        + (h.dataset?.ob ? '[data-ob="' + h.dataset.ob + '"]' : '')
        + (typeof h.className === 'string' && h.className.trim() ? '.' + h.className.trim().split(/\\s+/).join('.') : '') : null;
      return { x, y, hit, w: b.width, top };
    })()`);
    if (!r) throw new Error(`press: no element ${sel}`);
    if (!r.hit || !(r.w > 0)) throw new Error(`press: ${sel} is covered or zero-size at its centre ${JSON.stringify(r)}`);
    if (phone) { await tap(c, r.x, r.y); return; }
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await c.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    }
  };
  /** trusted mouse drag from the element's centre by dx px (desktop) */
  const drag = async (sel, dx) => {
    await waitFor(SWITCH_IDLE, { timeout: 35000, label: `switch overlay gone before dragging ${sel}` });
    const r = await evalP(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
      const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!r) throw new Error(`drag: no element ${sel}`);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, buttons: 0 });
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 });
    const steps = Math.max(2, Math.ceil(Math.abs(dx) / 5));
    for (let i = 1; i <= steps; i++) {
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x + (dx * i) / steps, y: r.y, button: 'left', buttons: 1 });
      await sleep(16);
    }
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x + dx, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
  };
  /** trusted desktop click at a fraction (fx, fy) of the element's box;
   * refuses a covered point like press() */
  const pressAt = async (sel, fx, fy) => {
    await waitFor(SWITCH_IDLE, { timeout: 35000, label: `switch overlay gone before pressing ${sel} at (${fx}, ${fy})` });
    const r = await evalP(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
      const b = el.getBoundingClientRect(); const x = b.left + b.width * ${fx}, y = b.top + b.height * ${fy};
      const h = document.elementFromPoint(x, y); return { x, y, hit: !!h && (h === el || el.contains(h)) }; })()`);
    if (!r?.hit) throw new Error(`pressAt: ${sel} is missing or covered at (${fx}, ${fy}) ${JSON.stringify(r)}`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await c.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    }
  };
  /** one trusted key press (Enter carries its text, as a real keyboard's);
   * raw: no overlay wait (the escape leg's Escape inside the switch) */
  const key = async (k, code, kc, { raw = false } = {}) => {
    if (!raw) await waitFor(SWITCH_IDLE, { timeout: 35000, label: `switch overlay gone before the key ${k}` });
    const text = k === 'Enter' ? '\r' : undefined;
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: kc, ...(text ? { text, unmodifiedText: text } : {}) });
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: kc });
  };
  /** GH-1025's orbit, its steps scaled to the desktop register: a trusted
   * right-drag on the table, then four Shift + wheel notches in. Refuses a
   * start point the canvas does not own. */
  const orbitClose = async () => {
    await waitFor(SWITCH_IDLE, { timeout: 35000, label: 'switch overlay gone before the orbit' });
    const W = DESKTOP.width, H = DESKTOP.height;
    const x0 = Math.round(W * 0.486), y0 = Math.round(H * 0.444), x1 = Math.round(W * 0.625), y1 = Math.round(H * 0.278);
    // a transient surface (a toast, the exit's fade) may still cover the
    // table right after an exit — wait for the canvas to own both points
    const OWN = `(() => { const cv = window.__dbg.renderer.domElement; const at = (x, y) => document.elementFromPoint(x, y);
      const a = at(${x0}, ${y0}), b = at(${x1}, ${y1}); const name = (e) => e ? (e.id ? '#' + e.id : e.tagName + '.' + [...e.classList].join('.')) : 'none';
      return a === cv && b === cv ? true : name(a === cv ? b : a); })()`;
    let own = null;
    for (let i = 0; i < 50 && own !== true; i++) { own = await evalP(OWN); if (own !== true) await sleep(200); }
    if (own !== true) throw new Error(`orbitClose: the canvas does not own (${x0}, ${y0}) / (${x1}, ${y1}) after 10 s — covered by ${own}`);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0, buttons: 0 });
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'right', buttons: 2, clickCount: 1 });
    for (let i = 1; i <= 20; i++) {
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + ((x1 - x0) * i) / 20, y: y0 + ((y1 - y0) * i) / 20, button: 'right', buttons: 2 });
      await sleep(16);
    }
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'right', buttons: 0, clickCount: 1 });
    for (let i = 0; i < 4; i++) {
      await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: x1, y: y1, deltaX: 0, deltaY: -200, modifiers: 8 });
      await sleep(120);
    }
    await sleep(600);
  };
  const settled = `['AIM','BALL_IN_HAND'].includes(window.__test?.state?.())`;
  // the game-switch progress overlay (ui/switchprogress.js) covers the
  // viewport and takes every hit, and main.js's switch shield swallows trusted
  // input, until the overlay's own remove(): after the settled frame, two more
  // frames, the rest of its 500 ms minimum display and a leave of up to 400 ms
  // that still takes hits — the table reads settled inside that tail
  const SWITCH_IDLE = `!document.documentElement.hasAttribute('data-ob-switching') && !document.querySelector('[data-ob="switch-progress"]')`;
  const boot = async (url = `${origin}/app.html`) => {
    await c.send('Page.navigate', { url });
    await sleep(600);
    await waitFor('window.__test?.ready === true', { timeout: 120000, label: 'ready' });
    await evalP(ROOM_HANDLE);
  };
  const bootHall = async () => {
    await boot();
    await waitFor('window.__shell?.isOpen?.() === true', { label: 'hall open at boot' });
    await waitFor(`(window.__shell.contentState?.().painted ?? ['play']).includes('play')`, { label: 'play place painted' });
    await sleep(800);
  };
  const freshProfile = async () => {
    await evalP(`(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} return true; })()`).catch(() => {});
  };
  const cardSel = (id) => `.ob-cardrail-card[data-id="${id}"], [data-ob="play-game"][data-game="${id}"]`;
  /** hall Play place: pick a discipline card, accept the kit confirm, wait for
   * the shell to exit onto the new game's settled table */
  const pickGame = async (id) => {
    await waitFor(`!!document.querySelector(${JSON.stringify(cardSel(id))})`, { label: `card ${id}` });
    const cur = await evalP('window.__settings.get().game');
    if (cur === id) { await playNow(); return; } // the current card commits nothing and stays in the hall
    await press(cardSel(id));
    await waitFor(`!!document.querySelector('[data-ob="confirm-accept"]')`, { timeout: 15000, label: 'switch confirm' });
    await sleep(350); // the kit panel's enter motion
    await press('[data-ob="confirm-accept"]', { scroll: false });
    await waitFor(`window.__shell.isOpen() === false && window.__settings.get().game === ${JSON.stringify(id)}`, { timeout: 90000, label: `entered ${id}` });
    await waitFor(settled, { label: `${id} settled` });
    // the overlay's settle cap is 30 s, its leave 0.4 s
    await waitFor(SWITCH_IDLE, { timeout: 35000, label: `${id} switch overlay gone` });
  };
  /** shell place navigation (the deep-link surface), then the arrival law:
   * place active, mover idle, the place's content painted */
  const goPlace = async (id) => {
    await evalP(`window.__shell.go(${JSON.stringify(id)})`);
    await waitFor(`window.__shell.place() === ${JSON.stringify(id)} && window.__shell.moving() === false && (window.__shell.contentState?.().painted ?? [${JSON.stringify(id)}]).includes(${JSON.stringify(id)})`, { label: `place ${id} arrived` });
    await sleep(500);
  };
  const station = async (id) => {
    await waitFor(`!!document.querySelector('[data-station="${id}"]')`, { label: 'atelier stations' });
    await press(`[data-station="${id}"]`);
    await waitFor(`window.__atelier?.station?.() === ${JSON.stringify(id)} && window.__shell.moving() === false`, { label: `${id} station` });
    await sleep(600);
  };
  /** hall Equipment: open the station, pick the first enabled card of
   * `axis` other than the current one that matches `re` (a RegExp source),
   * Keep. A pristine rack commits without the re-rack confirm; a confirm
   * here is a failure of the row's construction. A re-racking Keep exits
   * the hall by itself (atelier.js: committed + reracked → exitToTable);
   * the caller waits for that exit. Returns { cur, alt }. */
  const keepEquipment = async (stationId, axis, re) => {
    await goPlace('equipment');
    await station(stationId);
    const pick = await evalP(`(() => { const cur = window.__settings.get().equipment[${JSON.stringify(axis)}];
      const ids = [...document.querySelectorAll('.ob-cardrail-card')].filter((b) => b.getAttribute('aria-disabled') !== 'true').map((b) => b.dataset.id);
      return { cur, alt: ids.find((id) => id && id !== cur && new RegExp(${JSON.stringify(re)}).test(id)) ?? null }; })()`);
    if (!pick.alt) throw new Error(`keepEquipment: no other ${axis} matching /${re}/ (current ${pick.cur})`);
    await press(`.ob-cardrail-card[data-id="${pick.alt}"]`);
    await waitFor(`!!document.querySelector('[data-ob="atelier-keep"]') && document.querySelector('[data-ob="atelier-keep"]').getClientRects().length > 0`, { timeout: 60000, label: `${axis} Keep shown` });
    await sleep(500);
    await press('[data-ob="atelier-keep"]', { scroll: false });
    await waitFor(`window.__settings.get().equipment[${JSON.stringify(axis)}] === ${JSON.stringify(pick.alt)} || !!document.querySelector('[data-ob="confirm-accept"]')`, { timeout: 30000, label: `${axis} kept` });
    if (await evalP(`!!document.querySelector('[data-ob="confirm-accept"]')`)) throw new Error(`keepEquipment: the ${axis} Keep on a pristine rack raised a re-rack confirm`);
    return pick;
  };
  /** the re-racking Keep's own exit to the table (no Play now press) */
  const keptToTable = async () => {
    await waitFor('window.__shell.isOpen() === false', { timeout: 30000, label: 'the re-racking Keep exits to the table' });
    await waitFor(settled, { timeout: 120000, label: 'table settled after the Keep' });
  };
  const openHall = async () => {
    await press('#ob-shell-open', { scroll: false });
    await waitFor('window.__shell.isOpen() === true', { label: 'hall reopened' });
    await waitFor('window.__shell.moving() === false', { label: 'hall pose settled' });
    await sleep(400);
  };
  const playNow = async () => {
    await press('#ob-shell-quickplay', { scroll: false });
    await waitFor('window.__shell.isOpen() === false', { label: 'Play now exit' });
    await waitFor(settled, { label: 'table settled after Play now' });
  };
  const shoot = async () => {
    await waitFor(settled, { label: 'shootable' });
    // a PRE-shot rulebook choice (carom start spot, one-pocket pocket) holds
    // Shoot disabled — answer option 1 (the rules are not the subject here)
    for (let i = 0; i < 4; i++) {
      if (await evalP(`document.getElementById('shoot')?.disabled === false`)) break;
      await evalP('window.__rules?.decide?.(1) ?? false').catch(() => false);
      await sleep(500);
    }
    await press('#shoot', { scroll: false });
    await waitFor(`['SIMULATING','PLAYBACK','SETTLED'].includes(window.__test.state())`, { timeout: 20000, label: 'stroke started' });
    await waitFor(`['AIM','BALL_IN_HAND','WIN'].includes(window.__test.state())`, { timeout: 120000, label: 'stroke settled' });
    // a pending rulebook decision (a foul / illegal break option) would hold
    // the discipline switch (settings.js decisionConflict) — answer option 1
    await evalP('window.__rules?.decide?.(1) ?? false').catch(() => false);
    await waitFor(settled, { timeout: 30000, label: 'settled after decision' });
    await sleep(600);
  };
  /** settle the frame (venue/env re-bakes, lamp fade), then census + still */
  const capture = async (tag) => {
    await waitFor(`!(window.__rebakeEnv?.pending) && !(window.__lighting?.state?.()?.venue?.pending)`, { timeout: 20000, label: 'lighting settled' }).catch(() => {});
    // the GI re-key after a table build loads its lightmaps asynchronously
    // (the floor under the table reads them; a cube converged before the
    // apply lands photographs the previous / unlit floor)
    await waitFor(`(() => { const g = window.__gi?.probeState?.(); return !g || g.loadError != null
      || (g.ready === true && g.seqOpen === false && g.applySeq === g.appliedSeq && g.hemiRestorePending === false); })()`,
    { timeout: 30000, label: 'GI applied' });
    // the snooker-family lamp-occlusion drain lands on its own settle seam:
    // GH-969 paces it at one 8 ms slice per frame, so after a snooker build
    // the pocket nets' aOccl arrives last, 20-40 s later on a loaded host
    // (measured; the nets render un-occluded until then — 181 px on a fresh
    // twin that waited longer). A drain that never settles fails the row's
    // capture instead of photographing a half-baked table.
    const occl = await evalP(`(async () => { const s = window.__snkOccl; if (typeof s?.settled !== 'function') return 'absent';
      const t0 = performance.now();
      const ok = await Promise.race([s.settled().then(() => true), new Promise((r) => setTimeout(() => r(false), 150000))]);
      return ok ? Math.round(performance.now() - t0) : 'timeout'; })()`);
    if (occl === 'timeout') throw new Error(`${tag}: the snooker occlusion drain never settled in 150 s (pending ${await evalP('window.__snkOccl?.pending?.() ?? null')})`);
    // the table build finished, every texture the scene samples holds its
    // image, and the snooker-family lamp-occlusion drain (table.js
    // __snkOccl — progressive after a table build) is empty: a cube
    // converged before it lands photographs a half-occluded cloth — two
    // quiet polls in a row
    let quiet = 0, pend = null;
    for (let i = 0; i < 150 && quiet < 2; i++) {
      pend = await evalP(TEX_PENDING);
      quiet = pend.count === 0 && pend.table === 'READY' && pend.occl === 0 ? quiet + 1 : 0;
      await sleep(200);
    }
    if (quiet < 2) log(`${tag}: textures/table still pending after 30 s (${JSON.stringify(pend)})`);
    await sleep(1200);
    const conv = await evalP(CONVERGE);
    if (!(conv.rel <= 1e-4)) throw new Error(`env cube did not converge in ${conv.bakes} bakes (last step ${conv.rel})`);
    await sleep(600); // the converged cube's PMREM regenerates on the next frames
    const S = await evalP(CENSUS);
    const { env, ...converge } = conv;
    // judged: the rod-free converged cube (CONVERGE above); kept for the
    // record: the cube after the env tail's later bakes
    S.envAfterTail = S.env;
    S.env = env;
    S.converge = converge;
    if (S.err) throw new Error(`census: ${S.err}`);
    S.png = path.join(out, `${tag}.png`);
    // the aim preview (line, ghost, adaptive-ink ribbons) leaves the frame:
    // previewink.js holds its ink POLARITY with hysteresis, so two equal
    // tables can carry opposite polarities depending on what was sampled
    // before (measured on fresh-vs-fresh entries too) — not transition state
    await evalP(PREVIEW_HIDE(true));
    // the HUD's transient hint (#hud-hint, hud.js HINT_MS 3.5 s — e.g. the
    // escape leg's Escape landing on carom's start-spot decision prompts
    // "this decision can't be dismissed") is a reaction to that input, not
    // scene state: wait out its life before the still (a hint that never
    // clears stays in the frame and the pixel judgment sees it)
    await waitFor(`(() => { const h = document.getElementById('hud-hint'); return !h || getComputedStyle(h).display === 'none'; })()`,
      { timeout: 10000, label: 'transient HUD hint cleared' }).catch(() => log(`${tag}: #hud-hint still shown after 10 s`));
    // the focus successor law (GH-682) rings #shoot after a trusted exit —
    // a DOM affordance, not scene state; both twins capture unfocused
    await evalP('document.activeElement?.blur?.(), true');
    // and the mouse parks off every control (a hovered Shoot / Hall pill is
    // a DOM affordance too; aim.js ignores a buttonless move)
    if (!phone) await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1, buttons: 0 });
    await sleep(250);
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    await evalP(PREVIEW_HIDE(false));
    fs.writeFileSync(S.png, Buffer.from(data, 'base64'));
    fs.writeFileSync(path.join(out, `${tag}.json`), JSON.stringify(S, null, 1));
    return S;
  };
  const freshCache = new Map();
  /** FRESH twin: a new document on the given settings blob (hall boot),
   * Play now, settle, census. Cached per (register, blob). */
  const fresh = async (blob, tag) => {
    const k = `${phone ? 'phone' : 'desk'}|${blob}`;
    if (freshCache.has(k)) return freshCache.get(k);
    // a profile that never persisted (null) boots on the defaults
    await evalP(`(() => { localStorage.clear(); sessionStorage.clear(); const b = ${JSON.stringify(blob)}; if (b !== null) localStorage.setItem('ob-settings-v1', b); return true; })()`);
    await bootHall();
    await playNow();
    const F = await capture(`fresh-${tag}`);
    freshCache.set(k, F);
    return F;
  };
  const visualBlob = (blob) => {
    try { const v = JSON.parse(blob); return JSON.stringify(VISUAL_KEYS.map((k) => v[k])); } catch { return blob; }
  };
  /** the full judgment of a transitioned state against its fresh twin;
   * pixels:false for rows whose ball layout differs from FRESH by
   * construction (a post-stroke table, a continued replay) */
  /** `known: { issue, kinds }` — an OPEN defect this row reproduces by
   * construction (another register's bug on the same path): differences of
   * those kinds ('env', 'pixels') print as named KNOWN-RED lines instead of
   * failing, every other clause stays strict, and the row FAILS when the
   * known difference stops reproducing (the exemption must then go). */
  const judgePair = async (tag, S, { pixels = true, known = null } = {}) => {
    const F = await fresh(S.blob, tag);
    const found = [];
    const knownSeen = [];
    const note = (m) => found.push(m.slice(tag.length + 2));
    const add = (kind, msg) => { if (known?.kinds.includes(kind)) knownSeen.push(msg); else found.push(msg); };
    if (S.blob !== null && visualBlob(S.blob) !== visualBlob(F.blob)) found.push('settings blob drifted across the fresh boot');
    judgeRods(tag, S, note);
    judgeFrame(tag, S, note);
    for (const x of diffAgainst(S, F, { layout: pixels })) add(x.kind, x.msg);
    if (pixels) {
      const st = pixelStats(S.png, F.png);
      log(`${tag}: pixels ${st.err ?? `over ${st.over} (budget ${PX_BUDGET}) mean ${st.mean.toFixed(3)}`}`);
      if (st.err || st.over > PX_BUDGET) add('pixels', `screenshot differs from the fresh entry (${st.err ?? `${st.over} px past delta ${PX_DELTA}`}) — ${S.png}`);
    }
    if (known) {
      for (const m of knownSeen) console.log(`  ! KNOWN-RED #${known.issue} ${tag}: ${m}`);
      if (!knownSeen.length) found.push(`KNOWN-RED #${known.issue} (${known.kinds.join(' + ')}) no longer reproduces on this row — drop the exemption`);
    }
    if (!found.length) { pass(known ? `${tag} (strict clauses; ${known.kinds.join(' + ')} = KNOWN-RED #${known.issue})` : tag); return; }
    for (const m of found) fail(`${tag}: ${m}`);
  };
  const offered = async () => evalP(`[...document.querySelectorAll('.ob-cardrail-card, [data-ob="play-game"]')]
    .filter((b) => b.getAttribute('aria-disabled') !== 'true' && b.dataset.playable !== 'false').map((b) => b.dataset.id || b.dataset.game)`);
  const setRegister = async (onPhone) => {
    phone = onPhone;
    if (onPhone) await setPhoneMetrics(c, PHONE);
    else {
      await c.send('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {});
      await c.send('Emulation.setDeviceMetricsOverride', DESKTOP);
    }
  };

  /** one boot walks `walk`: a stroke before EVERY switch, then Hall pill ->
   * next card -> Continue; every hall visit asserts no gameplay rod over
   * the hall; every switched state is judged against its fresh twin */
  const walkLeg = async (prefix, walk) => {
    await freshProfile();
    await bootHall();
    await pickGame(walk[0]);
    const states = [];
    let hallBad = 0;
    for (let i = 1; i < walk.length; i++) {
      await shoot();
      await openHall();
      // GH-967's hall face: no gameplay-name rod over the hall
      const H = await evalP(CENSUS);
      const over = H.rods.filter((r) => r.visible);
      if (over.length) { hallBad++; fail(`${prefix} hall before ${walk[i - 1]} -> ${walk[i]}: ${over.length} rod(s) visible over the hall: ${JSON.stringify(H.rods)}`); }
      await pickGame(walk[i]);
      states.push([`${prefix}-${walk[i - 1]}-${walk[i]}`, await capture(`${prefix}-${String(i).padStart(2, '0')}-${walk[i - 1]}-${walk[i]}`)]);
    }
    if (!hallBad) pass(`${prefix}-hall-hides-the-gameplay-rod (${walk.length - 1} hall visits)`);
    for (const [tag, S] of states) await judgePair(tag, S);
  };
  const reportedPath = async (tag, { stale = false } = {}) => {
    await freshProfile();
    await bootHall();
    await pickGame('eight_ball');
    await shoot();
    if (stale) {
      // a stale cached aim.js has no cueGroup seam: keep a census-only handle
      // to the live rod, then remove the seam the shell feature-detects
      const had = await evalP(`(() => { const a = window.__aim; if (typeof a?.cueGroup !== 'function') return false;
        window.__obSwitchAimRod = a.cueGroup; delete a.cueGroup; return true; })()`);
      if (!had) { fail(`${tag}: no __aim.cueGroup seam to remove — the fallback leg cannot run (UNJUDGEABLE)`); return; }
    }
    await openHall();
    await pickGame('snooker');
    const S = await capture(tag);
    if (stale) {
      // the fallback leg judges the GH-967 rod law only (the page was mutated)
      if (judgeRods(tag, S, fail) && judgeFrame(tag, S, fail)) pass(tag);
      return;
    }
    await judgePair(tag, S);
  };

  try {
    fs.mkdirSync(out, { recursive: true });
    await setRegister(false);
    if (legs.includes('reported')) {
      console.log('leg reported');
      await reportedPath('reported-eight_ball-snooker');
    }
    if (legs.includes('fallback')) {
      console.log('leg fallback');
      await reportedPath('fallback-stale-aim', { stale: true });
    }
    if (legs.includes('hall') || legs.includes('pairs')) {
      await freshProfile();
      await bootHall();
      const games = await offered();
      log(`switcher offers ${games.join(', ')}`);
      if (games.length < 2) throw new Error(`the switcher offers ${games.length} discipline(s) — nothing to switch between`);
      if (legs.includes('hall')) {
        console.log('leg hall');
        for (const g of games) {
          await freshProfile();
          await bootHall();
          await pickGame(g);
          await judgePair(`hall-${g}`, await capture(`hall-${g}`));
        }
      }
      if (legs.includes('pairs')) {
        console.log(`leg pairs (${matrix ? 'every ordered pair' : 'cycle'})`);
        const walk = matrix ? eulerCircuit(games) : [...games, games[0]];
        await walkLeg('pair', walk);
      }
    }
    if (legs.includes('qachain')) {
      // the chain the macOS-app journey reported (a stale second cue after
      // every one of its switches), verbatim — snooker first
      console.log('leg qachain');
      await walkLeg('qachain', ['snooker', 'eight_ball', 'snooker', 'ten_ball', 'heyball', 'nine_ball']);
    }
    if (legs.includes('roundtrip')) {
      console.log('leg roundtrip');
      await freshProfile();
      await bootHall();
      await pickGame('nine_ball');
      await shoot();
      const R0 = await capture('roundtrip-before');
      await openHall();
      await playNow();
      const R1 = await capture('roundtrip-after');
      let bad = 0;
      if (!judgeRods('roundtrip', R1, fail)) bad++;
      if (!judgeFrame('roundtrip', R1, fail)) bad++;
      for (const x of diffAgainst(R1, R0)) { bad++; fail(`roundtrip: ${x.msg}`); }
      const st = pixelStats(R1.png, R0.png);
      log(`roundtrip: pixels over ${st.over} (budget ${PX_BUDGET}) mean ${st.mean?.toFixed(3)}`);
      if (st.err || st.over > PX_BUDGET) { bad++; fail(`roundtrip: frame after Play now differs from the frame before the hall (${st.err ?? st.over + ' px'})`); }
      if (!bad) pass('roundtrip-nine_ball');
    }
    if (legs.includes('cue')) {
      console.log('leg cue');
      // (a) hall Equipment -> Cues -> pick + Equip
      await freshProfile();
      await bootHall();
      await pickGame('eight_ball');
      await shoot();
      await openHall();
      await goPlace('equipment');
      await station('cues');
      await press('.ob-cardrail-card[data-id="carbon_ld"]');
      await waitFor(`!!document.querySelector('[data-ob="atelier-equip"]') && document.querySelector('[data-ob="atelier-equip"]').getClientRects().length > 0`, { label: 'equip button' });
      await press('[data-ob="atelier-equip"]');
      await waitFor(`window.__settings.get().equipment.cue_id === 'carbon_ld'`, { label: 'cue equipped' });
      await sleep(600);
      const H = await evalP(CENSUS);
      const overHall = H.rods.filter((r) => r.visible);
      if (overHall.length) fail(`cue-hall-equip: ${overHall.length} gameplay-name rod(s) visible over the hall after the equip: ${JSON.stringify(H.rods)}`);
      else pass('cue-hall-equip-hidden-in-hall');
      await playNow();
      // a post-stroke table against a fresh rack: the balls (and the aim
      // pose that follows the cue ball) differ by construction — no pixel
      // judgment; rods, lights, rig, rect emitters, frame and env are strict
      await judgePair('cue-hall-equip', await capture('cue-hall-equip'), { pixels: false });
      // (b) the HUD cue picker at the table, then a hall visit
      await freshProfile();
      await bootHall();
      await pickGame('eight_ball');
      await shoot();
      await evalP(`(() => { const s = document.getElementById('cue-select'); s.value = 'low_deflection'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await waitFor(`window.__settings.get().equipment.cue_id === 'low_deflection'`, { label: 'HUD cue swap' });
      await sleep(600);
      await openHall();
      const H2 = await evalP(CENSUS);
      const over2 = H2.rods.filter((r) => r.visible);
      if (over2.length) fail(`cue-hud-select: ${over2.length} gameplay-name rod(s) visible over the hall: ${JSON.stringify(H2.rods)}`);
      else pass('cue-hud-select-hidden-in-hall');
      await playNow();
      await judgePair('cue-hud-select', await capture('cue-hud-select'), { pixels: false });
    }
    if (legs.includes('light')) {
      console.log('leg light');
      const VARIANTS = [
        ['fixture', [['fixture', 'pendant_bar'], ['keep']]],
        ['brightness', [['brightness', 55], ['keep']]],
        ['both', [['fixture', 'pendant_bar'], ['brightness', 55], ['keep']]],
        ['keep3', [['fixture', 'pendant_bar'], ['keep'], ['brightness', 55], ['keep'], ['fixture', 'perimeter_ring'], ['keep']]],
        ['detent', [['fixture', 'canopy_panel'], ['brightness', 3], ['keep']]],
      ];
      for (const [name, steps] of VARIANTS) {
        await freshProfile();
        await bootHall();
        await pickGame('eight_ball');
        await openHall();
        await goPlace('equipment');
        await station('lighting');
        for (const [what, arg] of steps) {
          if (what === 'fixture') {
            await press(`.ob-cardrail-card[data-id="${arg}"]`);
            await waitFor(`window.__lighting.state().fixture === ${JSON.stringify(arg)}`, { label: `staged ${arg}` });
          } else if (what === 'brightness') {
            // a trusted mouse drag on the range input from its centre (1.0 on
            // the 0.6-1.4 track) by `arg` px: a few px stay inside the 1.0
            // detent (every input stages the SAME value — the no-op stage)
            await drag('[data-ob="atelier-brightness"]', arg);
          } else if (what === 'keep') {
            await waitFor(`!!document.querySelector('[data-ob="atelier-keep"]') && document.querySelector('[data-ob="atelier-keep"]').getClientRects().length > 0`, { label: 'Keep shown' });
            await press('[data-ob="atelier-keep"]', { scroll: false });
            await waitFor(`!document.querySelector('[data-ob="atelier-keep"]') || document.querySelector('[data-ob="atelier-keep"]').getClientRects().length === 0`, { label: 'Keep committed' });
          }
          await sleep(500);
        }
        await playNow();
        const E = await capture(`light-${name}-exit`);
        await openHall();
        await goPlace('play');
        await pickGame('snooker');
        const S = await capture(`light-${name}-switch`);
        // judged after the flow: a fresh twin navigates this page away
        await judgePair(`light-${name}-exit`, E);
        await judgePair(`light-${name}-switch`, S);
      }
    }
    if (legs.includes('returning')) {
      console.log('leg returning');
      // b085: a persisted brightness whose authored lamp value lands EXACTLY
      // on the hall dim (0.85 x the identity rig) — the leaf's boot apply
      // then rewrites the emitter to the dimmed number itself, so only the
      // rig signature (the not-landed identity rig vs 0.85) can tell a real
      // rewrite from the shell's own write
      for (const v of [{ tag: 'returning-eight_ball', brightness: null }, { tag: 'returning-b085-eight_ball', brightness: 0.85 }]) {
        await freshProfile();
        await bootHall();
        await pickGame('eight_ball'); // the exit stores the shell state: the next boot RETURNS to the hall
        if (v.brightness !== null) {
          await evalP(`window.__settings.set('brightness', ${v.brightness})`);
          await waitFor(`window.__lighting?.state?.().brightness === ${v.brightness}`, { label: 'brightness persisted' });
        }
        // hold the lighting leaf's module response until the returning boot
        // has opened the hall (cache off, so the request reaches the seam)
        await c.send('Network.enable');
        await c.send('Network.setCacheDisabled', { cacheDisabled: true });
        await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/scene/lightingvisuals.js*' }] });
        let held = 0, openAtRelease = null, active = true;
        c.onEvent(async (method, params) => {
          if (!active || method !== 'Fetch.requestPaused') return;
          held++;
          const t0 = Date.now();
          while (Date.now() - t0 < 30000) {
            const o = await evalP('window.__shell?.isOpen?.() === true').catch(() => false);
            if (o) { openAtRelease = true; break; }
            await sleep(100);
          }
          if (openAtRelease !== true) openAtRelease = false;
          await sleep(400); // the dim is applied on the open frame
          c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
        });
        try {
          await c.send('Page.navigate', { url: `${origin}/app.html` });
          await sleep(600);
          await waitFor('window.__test?.ready === true && window.__lighting !== undefined', { timeout: 120000, label: 'returning boot + leaf landed' });
          await evalP(ROOM_HANDLE);
        } finally {
          active = false;
          await c.send('Fetch.disable').catch(() => {});
          await c.send('Network.setCacheDisabled', { cacheDisabled: false }).catch(() => {});
        }
        const st = await evalP('window.__shell.state()');
        log(`${v.tag}: boot ${st.boot}, lighting leaf held ${held}x, hall open at release ${openAtRelease}`);
        if (held < 1 || openAtRelease !== true || st.boot !== 'returning') {
          fail(`${v.tag}: UNJUDGEABLE (instrument) — held ${held}, hall open at release ${openAtRelease}, boot ${st.boot}`);
          continue;
        }
        await waitFor('window.__shell.moving() === false', { label: 'hall pose settled' });
        await sleep(600);
        await playNow();
        await judgePair(v.tag, await capture(v.tag));
      }
    }
    if (legs.includes('replay')) {
      console.log('leg replay');
      await freshProfile();
      await bootHall();
      await pickGame('snooker');
      const snookerBlob = await evalP(`localStorage.getItem('ob-settings-v1')`);
      await shoot();
      const url = await evalP('window.__share.encode()');
      if (!/[#&]r=/.test(url ?? '')) throw new Error(`share encode gave no #r= link: ${url}`);
      await openHall();
      await pickGame('eight_ball');
      await shoot();
      // a NEW document (the link opened by a user), never a same-document
      // hash change on the current app.html
      await boot(`${origin}/app.html?via=share${url.slice(url.indexOf('#'))}`);
      await waitFor(`window.__share?.replay?.().done === true`, { timeout: 120000, label: 'replay finished' });
      await waitFor(`(() => { const b = document.getElementById('ob-rp-continue'); return !!b && b.getClientRects().length > 0; })()`, { label: 'Continue shown' });
      await press('#ob-rp-continue', { scroll: false });
      await waitFor(`window.__share.replay().active === false`, { label: 'replay continued' });
      await waitFor(settled, { label: 'continued table settled' });
      const S = await capture('replay-continue-snooker');
      // the continued table keeps the replay's TRANSIENT game + equipment;
      // its fresh twin is the snooker blob the sender played on (the
      // viewer's persisted 8-Ball blob is not it)
      S.blob = snookerBlob;
      await judgePair('replay-continue-snooker', S, { pixels: false }); // the replay's final layout
    }
    if (legs.includes('stroke')) {
      console.log('leg stroke');
      await freshProfile();
      await bootHall();
      await pickGame('eight_ball');
      const T0 = await evalP(STROKE);
      // power to the top of its track (a trusted click near the right end,
      // then End on the focused range), the tip low-left on the HUD pad
      await pressAt('#power', 0.97, 0.5);
      await key('End', 'End', 35);
      await pressAt('#tip', 0.3, 0.72);
      await sleep(300);
      const T1 = await evalP(STROKE);
      log(`stroke: before ${JSON.stringify(T0)} -> set ${JSON.stringify(T1)}`);
      if (T1.power !== '12' || T1.tip === T0.tip) {
        fail(`stroke: UNJUDGEABLE (instrument) — the trusted input did not set power 12 / a tip offset: ${JSON.stringify(T0)} -> ${JSON.stringify(T1)}`);
      } else {
        await shoot();
        await openHall();
        await pickGame('snooker');
        await judgePair('stroke-eight_ball-snooker', await capture('stroke-eight_ball-snooker'));
      }
    }
    if (legs.includes('camera')) {
      console.log('leg camera');
      // (a) the switch: orbit close on 8-Ball, Hall pill, Snooker + Continue
      await freshProfile();
      await bootHall();
      await pickGame('eight_ball');
      const P0 = await evalP(CAM);
      await orbitClose();
      const P1 = await evalP(CAM);
      log(`camera: 8-Ball pose ${JSON.stringify(P0)} -> orbited ${JSON.stringify(P1)}`);
      if (!(P1.r < 2 && Math.abs(P1.th - P0.th) > 0.3)) {
        fail(`camera: UNJUDGEABLE (instrument) — the trusted orbit did not move the camera low and close: ${JSON.stringify(P0)} -> ${JSON.stringify(P1)}`);
      } else {
        await openHall();
        await pickGame('snooker');
        const S = await capture('camera-orbited-eight_ball-snooker');
        const v = await evalP(D_ARC_IN_VIEW);
        log(`camera: snooker after the orbited switch — cue ball NDC ${JSON.stringify(v.cue)}, D arc ${v.dIn}/${v.dN} in view`);
        if (!v.cueIn || v.dIn !== v.dN) fail(`camera-orbited-eight_ball-snooker: the cue ball (NDC ${JSON.stringify(v.cue)}) or the D (${v.dIn}/${v.dN} points) is outside the frustum`);
        await judgePair('camera-orbited-eight_ball-snooker', S);
      }
      // (b) FR-007(5): a round trip that keeps the game keeps the user's pose
      // (c) the same game on a SHORTER bed (a table Keep in the visit): the
      //     bed half of the key — the exit lands on the fresh-entry pose
      // (d) the same game and bed, re-racked inside the visit (a ball-set
      //     Keep re-parses the template): the value-key law — the user's
      //     pose stays
      // each row orbits first and refuses itself when the orbit did not land
      const orbited = async (tag) => {
        const before = await evalP(CAM);
        await orbitClose();
        const Q = await evalP(CAM);
        if (Q.r < 2 && Math.abs(Q.th - before.th) > 0.3) return Q;
        fail(`${tag}: UNJUDGEABLE (instrument) — the trusted orbit did not move the camera low and close: ${JSON.stringify(before)} -> ${JSON.stringify(Q)}`);
        return null;
      };
      await freshProfile();
      await bootHall();
      await pickGame('eight_ball');
      const Qb = await orbited('camera-roundtrip-keeps-the-user-pose');
      if (Qb) {
        await openHall();
        await playNow();
        const Q1 = await evalP(CAM);
        if (camDelta(Qb, Q1) <= 1e-6) pass('camera-roundtrip-keeps-the-user-pose');
        else fail(`camera-roundtrip-keeps-the-user-pose: Hall pill + Play now moved the orbited pose ${JSON.stringify(Qb)} -> ${JSON.stringify(Q1)}`);
      }
      await freshProfile();
      await bootHall();
      await pickGame('nine_ball');
      const Qc = await orbited('camera-same-game-shorter-bed');
      if (Qc) {
        await openHall();
        const t = await keepEquipment('table', 'table_id', '^pool_pro_(7|8)ft$');
        await keptToTable();
        const S = await capture('camera-same-game-shorter-bed');
        const F = await fresh(S.blob, 'camera-same-game-shorter-bed');
        log(`camera-same-game-shorter-bed: ${t.cur} -> ${t.alt}; exit pose ${JSON.stringify(S.cam)} vs fresh ${JSON.stringify(F.cam)}`);
        if (camDelta(S.cam, F.cam) <= 1e-6) pass('camera-same-game-shorter-bed');
        else fail(`camera-same-game-shorter-bed: the exit after a bed change kept a pose framed for the previous bed ${JSON.stringify(S.cam)} (fresh entry ${JSON.stringify(F.cam)}, orbited ${JSON.stringify(Qc)})`);
      }
      await freshProfile();
      await bootHall();
      await pickGame('nine_ball');
      const Qd = await orbited('camera-same-bed-rerack-keeps-the-user-pose');
      if (Qd) {
        await openHall();
        // the re-rack is the row's precondition: applyRack rebuilds the ball
        // meshes (and parses a fresh template) — a new cue-ball mesh proves it
        const mesh0 = await evalP('window.__test.ballMeshes()[0].uuid');
        const b = await keepEquipment('balls', 'ballset_id', 'pool'); // another pool set
        await keptToTable();
        const mesh1 = await evalP('window.__test.ballMeshes()[0].uuid');
        const Q1 = await evalP(CAM);
        log(`camera-same-bed-rerack: ${b.cur} -> ${b.alt}; re-racked ${mesh0 !== mesh1}; exit pose ${JSON.stringify(Q1)}`);
        if (mesh0 === mesh1) fail('camera-same-bed-rerack-keeps-the-user-pose: UNJUDGEABLE (precondition) — the ball-set Keep did not re-rack (same cue-ball mesh)');
        else if (camDelta(Qd, Q1) <= 1e-6) pass('camera-same-bed-rerack-keeps-the-user-pose');
        else fail(`camera-same-bed-rerack-keeps-the-user-pose: a re-rack on the same game and bed reset the orbited pose ${JSON.stringify(Qd)} -> ${JSON.stringify(Q1)}`);
      }
    }
    if (legs.includes('returnpose')) {
      console.log('leg returnpose');
      await freshProfile();
      await bootHall();
      await pickGame('snooker'); // the exit stores the shell state: the next boot RETURNS to the hall
      const { identifier } = await c.send('Page.addScriptToEvaluateOnNewDocument', { source: RAF_HOLD });
      let seen = null;
      try {
        await c.send('Page.navigate', { url: `${origin}/app.html` });
        // which came first while no frame is delivered: the hall open or the
        // snooker rack (22 balls) — 25 ms polls
        const t0 = Date.now(); let tOpen = null, tRack = null;
        while (Date.now() - t0 < 120000 && (tOpen === null || tRack === null)) { // boot()'s budget
          const s = await evalP(`(() => ({ open: window.__shell?.isOpen?.() === true, n: window.__test?.balls?.().length ?? 0 }))()`).catch(() => null);
          if (s?.open && tOpen === null) tOpen = Date.now() - t0;
          if (s?.n === 22 && tRack === null) tRack = Date.now() - t0;
          await sleep(25);
        }
        // the WKWebView order (hall open, THEN the async boot re-rack) is
        // judged as it came; Chrome usually racks first, before the shell
        // exists — then the same fresh-rack emission the boot staging makes
        // (settings.js: ctx.game.rerack(seed) → AIM{seed}) is issued while
        // the hall is open and still no frame has been delivered
        let trigger = 'boot re-rack';
        const pre = await evalP(`({ frames: window.__test?.renderedFrames?.() ?? -1, open: window.__shell?.isOpen?.() === true, moving: window.__shell?.moving?.() === true })`).catch(() => null);
        if (tOpen !== null && tRack !== null && !(tOpen < tRack) && pre?.open && !pre.moving && pre.frames === 0) {
          trigger = 'fresh-rack emission';
          await evalP('window.__test.rerack(1), true');
        }
        const frames = await evalP('window.__test?.renderedFrames?.() ?? -1').catch(() => -1);
        const held = await evalP(CAM).catch(() => null);
        const released = await evalP('window.__obRafRelease ? window.__obRafRelease() : -1');
        seen = { tOpen, tRack, trigger, framesBefore: frames, released, held };
      } finally {
        await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).catch(() => {});
      }
      log(`returnpose: hall open at ${seen.tOpen} ms, snooker rack at ${seen.tRack} ms, judged on the ${seen.trigger}; ${seen.framesBefore} frames delivered before it, ${seen.released} rAF callbacks queued and released; held pose ${JSON.stringify(seen.held)}`);
      const order = seen.trigger === 'fresh-rack emission' || (seen.tOpen !== null && seen.tRack !== null && seen.tOpen < seen.tRack);
      if (!order || seen.framesBefore !== 0 || !(seen.released > 0)) {
        fail(`returnpose: UNJUDGEABLE (instrument) — no fresh-rack emission landed in the open hall before the first frame: ${JSON.stringify(seen)}`);
      } else {
        await waitFor('window.__test?.ready === true', { timeout: 120000, label: 'returning boot ready' });
        await evalP(ROOM_HANDLE);
        await waitFor('window.__shell.isOpen() === true && window.__shell.moving() === false', { label: 'returning hall settled' });
        await sleep(800);
        const live = await evalP(CAM);
        // the reference: the Play anchor a table round trip lands on
        await playNow();
        await openHall();
        await waitFor(`window.__shell.place() === 'play'`, { label: 'hall back at Play' });
        const anchor = await evalP(CAM);
        log(`returnpose: live ${JSON.stringify(live)} vs the round trip's Play anchor ${JSON.stringify(anchor)}`);
        if (!(anchor.r > 3)) fail(`returnpose: UNJUDGEABLE (reference) — the round trip's Play anchor radius ${anchor.r} is not a snooker hall pose`);
        else if (camDelta(seen.held, anchor) <= 1e-4 && camDelta(live, anchor) <= 1e-4) pass('returnpose-snooker-hall-at-the-play-anchor');
        else fail(`returnpose: the returning hall is not at the Play anchor — held ${JSON.stringify(seen.held)}, live ${JSON.stringify(live)}, anchor ${JSON.stringify(anchor)}`);
      }
    }
    if (legs.includes('escape')) {
      console.log('leg escape');
      let escProbe = null, onGo = null, rec = null, landed = null;
      const missed = { fallback: 0, noTarget: 0, outside: 0 };
      c.onEvent((method, params) => {
        if (method === 'Runtime.bindingCalled' && params?.name === '__obEscGo' && onGo) { const f = onGo; onGo = null; f(); }
      });
      try {
        await c.send('Runtime.addBinding', { name: '__obEscGo' });
        ({ identifier: escProbe } = await c.send('Page.addScriptToEvaluateOnNewDocument', { source: ESC_PROBE }));
        for (const [i, aim] of ESCAPE_AIMS_MS.entries()) {
          await freshProfile();
          await bootHall();
          await pickGame('one_pocket');
          await shoot();
          await openHall();
          await waitFor(`!!document.querySelector(${JSON.stringify(cardSel('carom_3cushion'))})`, { label: 'card carom_3cushion' });
          await press(cardSel('carom_3cushion'));
          await waitFor(`!!document.querySelector('[data-ob="confirm-accept"]')`, { timeout: 15000, label: 'switch confirm' });
          await sleep(350);
          // Continue by a trusted click, then a real Escape inside the
          // switch's stall — on the page's report that the overlay painted,
          // or aim ms after it — where the switch shield stands and swallows
          // trusted keys by design; the row proves such an Escape leaves the
          // FRESH state. No page read precedes the Escape: a read waits out a
          // busy renderer and would move the Escape behind the task (raw: no
          // overlay wait either)
          const r = await evalP(`(() => { const b = document.querySelector('[data-ob="confirm-accept"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
          await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y, buttons: 0 });
          await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', buttons: 1, clickCount: 1 });
          const go = new Promise((resolve) => { onGo = () => resolve('go'); });
          const t0 = Date.now();
          const rel = c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', buttons: 0, clickCount: 1 });
          const why = await Promise.race([go, sleep(ESCAPE_GO_FALLBACK_MS).then(() => 'fallback')]);
          onGo = null;
          if (why === 'go' && aim) await sleep(aim);
          const esc = key('Escape', 'Escape', 27, { raw: true });
          const sent = Date.now() - t0;
          await rel; await esc;
          await waitFor(`window.__settings.get().game === 'carom_3cushion' && ${settled}`, { timeout: 90000, label: 'entered carom_3cushion' });
          await waitFor(SWITCH_IDLE, { timeout: 35000, label: 'carom_3cushion switch overlay gone' });
          // the page's own record: when its Escape was queued and handled,
          // against the long task it aimed at (ms after the Continue click)
          rec = await evalP(escRecord(aim));
          log(`escape (attempt ${i + 1}, aim +${aim} ms, ${why}): Escape sent ${sent} ms after the Continue release; page record ${JSON.stringify(rec)}`);
          if (why === 'go' && rec.inTarget === true) { landed = aim; break; }
          missed[why !== 'go' ? 'fallback' : rec.target ? 'outside' : 'noTarget']++;
        }
      } finally {
        if (escProbe) await c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: escProbe }).catch(() => {});
      }
      if (landed === null) {
        const reason = !rec?.probe || !rec.tasksObserved || !rec.continueSeen ? 'the page record is incomplete'
          : `no Escape landed inside the long task running at the instant it aimed at — of ${ESCAPE_AIMS_MS.length} attempt(s), ${missed.fallback} got no report within ${ESCAPE_GO_FALLBACK_MS} ms, ${missed.noTarget} found no long task that had begun in time and held the aimed instant, ${missed.outside} stamped the Escape outside the target or within its last 3 ms`;
        fail(`escape: UNJUDGEABLE (instrument) — ${reason}; the row is not exercised: ${JSON.stringify(rec)}`);
      } else {
        if (rec.shield !== true) fail(`escape: the Escape queued inside the switch's stall met no switch shield when the page handled it: ${JSON.stringify(rec)}`);
        else pass(`escape-in-stall (the Escape waited out the switch's long task at +${landed} ms under the switch shield)`);
        if (await evalP('window.__shell.isOpen()')) { log('escape: the hall is still open after the switch — Play now'); await playNow(); }
        const S1 = await capture('escape-one_pocket-carom_3cushion');
        await shoot();
        await openHall();
        const H = await evalP(CENSUS);
        const over = H.rods.filter((x) => x.visible);
        if (over.length) fail(`escape hall after the Escape switch: ${over.length} rod(s) visible over the hall: ${JSON.stringify(H.rods)}`);
        await pickGame('straight_pool');
        const S2 = await capture('escape-next-carom_3cushion-straight_pool');
        await judgePair('escape-one_pocket-carom_3cushion', S1);
        await judgePair('escape-next-carom_3cushion-straight_pool', S2);
      }
    }
    if (legs.includes('rmkb')) {
      console.log('leg rmkb');
      await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      try {
        await freshProfile();
        await bootHall();
        if (await evalP(`matchMedia('(prefers-reduced-motion: reduce)').matches`) !== true) throw new Error('reduced motion emulation not live');
        await pickGame('snooker');
        await shoot();
        // the sandbox through the hall's Practice place (the stroke left the
        // rack non-pristine: the consent confirm)
        await openHall();
        await goPlace('practice');
        await press('[data-ob="practice-playground"] .ob-card-option, [data-ob="practice-playground"] button');
        const asked = await waitFor(`!!document.querySelector('.ob-confirm[data-ob-context="practice-playground"] [data-ob="confirm-accept"]') || (window.__settings.get().mode === 'playground' && window.__shell.isOpen() === false)`, { timeout: 15000, label: 'sandbox consent or entry' }).then(() => evalP(`!!document.querySelector('.ob-confirm[data-ob-context="practice-playground"] [data-ob="confirm-accept"]')`));
        if (asked) { await sleep(300); await press('.ob-confirm[data-ob-context="practice-playground"] [data-ob="confirm-accept"]', { scroll: false }); }
        await waitFor(`window.__settings.get().mode === 'playground' && window.__shell.isOpen() === false && ${settled}`, { timeout: 60000, label: 'sandbox entered' });
        await sleep(600);
        // keyboard only from here (focus starts on the Hall pill). A keyboard
        // user reaches the next control with a key: the shell's continuation
        // guard (shell.js KEY-WINDOW) swallows a fresh Enter on another
        // control within CONT_MS of the Enter that acted unless a key came
        // between, and a focus() call is no key — so a trusted Tab, then the
        // control, then Enter
        const enterOn = async (sel) => {
          await key('Tab', 'Tab', 9);
          await evalP(`document.querySelector(${JSON.stringify(sel)}).focus(), true`);
          await key('Enter', 'Enter', 13);
        };
        await evalP(`document.getElementById('ob-shell-open').focus(), true`);
        await key('Enter', 'Enter', 13);
        await waitFor('window.__shell.isOpen() === true && window.__shell.moving() === false', { label: 'hall by keyboard' });
        await sleep(400);
        // the hall reopened at Practice: the rail's Play pill by Enter
        await enterOn('#ob-shell-rail [data-place="play"]');
        await waitFor(`window.__shell.place() === 'play' && window.__shell.moving() === false && (window.__shell.contentState?.().painted ?? ['play']).includes('play')`, { label: 'Play place by keyboard' });
        await sleep(500);
        await enterOn(cardSel('eight_ball'));
        await waitFor(`!!document.querySelector('[data-ob="confirm-accept"]')`, { timeout: 15000, label: 'switch confirm (keyboard)' });
        await sleep(300);
        let focus = await evalP(`document.activeElement?.dataset?.ob ?? ''`);
        for (let i = 0; i < 4 && focus !== 'confirm-accept'; i++) { await key('Tab', 'Tab', 9); await sleep(150); focus = await evalP(`document.activeElement?.dataset?.ob ?? ''`); }
        if (focus !== 'confirm-accept') throw new Error(`Tab never reached Continue (focus ${focus})`);
        await key('Enter', 'Enter', 13);
        await waitFor(`window.__settings.get().game === 'eight_ball' && ${settled}`, { timeout: 90000, label: 'entered eight_ball (keyboard)' });
        await waitFor(SWITCH_IDLE, { timeout: 35000, label: 'eight_ball switch overlay gone (keyboard)' });
        if (await evalP('window.__shell.isOpen()')) {
          await evalP(`document.getElementById('ob-shell-quickplay').focus(), true`);
          await key('Enter', 'Enter', 13);
          await waitFor('window.__shell.isOpen() === false', { label: 'Play now by keyboard' });
          await waitFor(settled, { label: 'table settled' });
        }
        log(`rmkb: mode ${await evalP('window.__settings.get().mode')}`);
        await judgePair('rmkb-snooker-eight_ball', await capture('rmkb-snooker-eight_ball'));
      } finally {
        await c.send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
      }
    }
    if (legs.includes('winkeep')) {
      console.log('leg winkeep');
      await freshProfile();
      await bootHall();
      await pickGame('nine_ball');
      // stage a one-stroke win: the 9 in the jaws of a corner pocket, the cue
      // ball behind it on the pocket axis (layout + aim seams stage the
      // table; every transition below is trusted input)
      const staged = await evalP(`(() => { const P = window.__rules.pockets(); const pk = P[0]; const ux = pk.x > 0 ? -1 : 1, uy = pk.y > 0 ? -1 : 1, L = Math.SQRT2;
        const nine = { id: 9, x: pk.x + ux * 0.18 / L, y: pk.y + uy * 0.18 / L }, cue = { id: 0, x: nine.x + ux * 0.30 / L, y: nine.y + uy * 0.30 / L };
        window.__test.layout([cue, nine]); window.__test.aim(Math.atan2(nine.y - cue.y, nine.x - cue.x)); return { pk, nine, cue }; })()`);
      await sleep(800);
      await waitFor(settled, { label: 'staged table' });
      await press('#shoot', { scroll: false });
      await waitFor(`window.__test.state() === 'WIN'`, { timeout: 120000, label: 'WIN hold' });
      log(`winkeep: staged ${JSON.stringify(staged)} -> WIN`);
      // the Hall pill inside the WIN hold (QUIET_STAGES admits WIN)
      await press('#ob-shell-open', { scroll: false });
      const atPill = await evalP('window.__test.state()');
      await waitFor('window.__shell.isOpen() === true && window.__shell.moving() === false', { label: 'hall from the WIN hold' });
      if (atPill !== 'WIN') fail(`winkeep: UNJUDGEABLE (path) — the Hall pill landed in ${atPill}, not in the WIN hold`);
      await goPlace('equipment');
      // flow.js's 2.6 s WIN continuation re-racks UNDER the open hall (the
      // shell never routes the machine) before any commit below can land —
      // the order the QA journey recorded ("the hold re-racked while the hall
      // was open, before Keep"): the Equip and the Keep run on that fresh,
      // pristine rack
      await waitFor(`window.__shell.isOpen() === true && ['AIM','BALL_IN_HAND'].includes(window.__test.state())`, { timeout: 30000, label: 'the WIN continuation re-racked under the hall' });
      // a cue Equip in the same hold visit: aim.js rebuildCue appends the new
      // gameplay rod AFTER the win stroke's whip rod (cuepost.js re-adds its
      // rod only at a stroke), the scene order the QA journey reached
      // mid-session — the GH-967 precondition (the whip rod first by name)
      await station('cues');
      await press('.ob-cardrail-card[data-id="carbon_ld"]');
      await waitFor(`!!document.querySelector('[data-ob="atelier-equip"]') && document.querySelector('[data-ob="atelier-equip"]').getClientRects().length > 0`, { label: 'equip button' });
      await press('[data-ob="atelier-equip"]');
      await waitFor(`window.__settings.get().equipment.cue_id === 'carbon_ld'`, { label: 'cue equipped' });
      await sleep(600);
      const order = await evalP(`(() => { const names = []; window.__dbg.scene.traverse((o) => { if (o.name === 'obCueStick') names.push(o.userData?.obCueRole ?? 'aim'); }); return names; })()`);
      log(`winkeep: cue rods in scene order after the Equip: ${order.join(', ')}`);
      if (order[0] !== 'post') fail(`winkeep: UNJUDGEABLE (precondition) — the whip rod does not precede the gameplay rod (${order.join(', ')}): the pre-fix name walk would not reach it`);
      // the table Keep on the continuation's pristine rack (no confirm)
      const pickT = await keepEquipment('table', 'table_id', '9ft|pool');
      await keptToTable();
      log(`winkeep: table ${pickT.cur} -> ${pickT.alt}`);
      // GH-1058 (open, not this suite's register): a hall table Keep dresses
      // the new table with another felt / rail finish than a fresh entry on
      // the same settings until a reload — the env cube and the pixels
      // carry it; rods, lights, rig, frame, camera and stroke stay strict
      await judgePair('winkeep-nine_ball-table-keep', await capture('winkeep-nine_ball-table-keep'),
        { known: { issue: 1058, kinds: ['env', 'pixels'] } });
    }
    if (legs.includes('phone')) {
      console.log('leg phone');
      await setRegister(true);
      await reportedPath('phone-eight_ball-snooker');
      await setRegister(false);
    }
    if (errs.length) fail(`page exceptions during the legs: ${errs.slice(0, 3).join(' | ')}`);
  } finally {
    c.close();
  }
  return arms;
}

/** Hierholzer over the complete digraph on `nodes`: a closed walk that takes
 * every ordered pair exactly once. */
export function eulerCircuit(nodes) {
  const left = new Map(nodes.map((n) => [n, nodes.filter((m) => m !== n)]));
  const stack = [nodes[0]], walk = [];
  while (stack.length) {
    const v = stack[stack.length - 1];
    const nx = left.get(v);
    if (nx.length) stack.push(nx.shift());
    else walk.push(stack.pop());
  }
  return walk.reverse();
}

const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const argv = process.argv.slice(2);
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes('--selftest')) {
    const nodes = ['a', 'b', 'c', 'd'];
    const w = eulerCircuit(nodes);
    const pairs = new Set();
    for (let i = 1; i < w.length; i++) pairs.add(`${w[i - 1]}>${w[i]}`);
    const ok = w.length === nodes.length * (nodes.length - 1) + 1 && pairs.size === nodes.length * (nodes.length - 1)
      && w[0] === w[w.length - 1] && w.every((x, i) => i === 0 || x !== w[i - 1]);
    console.log(ok ? 'E2E-SWITCH selftest PASS (1 arms)' : `E2E-SWITCH selftest FAIL ${JSON.stringify(w)}`);
    process.exit(ok ? 0 : 1);
  }
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 41730);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 41745);
  const legs = (opt('--legs') ?? ALL_LEGS.join(',')).split(',').filter(Boolean);
  const unknown = legs.filter((l) => !ALL_LEGS.includes(l));
  if (unknown.length) { console.error(`E2E-SWITCH: unknown leg(s) ${unknown.join(', ')} (known: ${ALL_LEGS.join(', ')})`); process.exit(2); }
  const keepOut = opt('--out') ?? process.env.OB_E2E_SWITCH_OUT ?? null;
  const out = keepOut ?? fs.mkdtempSync(path.join(os.tmpdir(), 'ob-e2e-switch-'));
  let failed = 0;
  const fail = (msg) => { failed++; console.error('E2E-SWITCH FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  let arms = 0;
  try {
    arms = await runSwitchArms({ PORT, CDP_PORT, fail, legs, matrix: argv.includes('--matrix'), out });
  } catch (e) {
    fail(`driver: ${e.stack || e}`);
  } finally {
    await stopStaticServer(server);
    if (!keepOut) fs.rmSync(out, { recursive: true, force: true });
  }
  console.log(failed ? `E2E-SWITCH FAIL (${failed} failure(s))` : `E2E-SWITCH PASS (${arms} arms)`);
}
