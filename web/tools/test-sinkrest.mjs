// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-sinkrest.mjs — GH-626 oracle for the SOLID POCKET CLOSURE rest
// (scene/table.js sinkRestFor + game.js restEntryFor/poseSink rest clamp).
//
// The defect: the render-layer sink pose law predates any closed pocket.
// It falls from the lip and stops only at the SINK_SHIELD_Y cull, which is
// right for every family whose cup is open below the shield (snooker sock,
// Diamond boot, the chinese8 net lane) and wrong for the Predator Apex,
// whose wells are closed by a foam plug one ball diameter below the cloth
// (FT-PLUG-THICKNESS, docs/geometry/gh488p-predator-apex-canonical.json):
// the ball sank ~54 mm THROUGH the plug before it was culled.
//
// Rows (the Predator run drives the real app deterministically):
//   spec       sinkRestFor publishes exactly 6 closures on the built
//              Predator (4 corners + 2 sides), each at the canonical
//              plug crest, with a relieved seat and a positive taper.
//   crown      the derived rest centre is plugTop + r, i.e. the resting
//              ball's CROWN lands exactly on the bed plane — the datum
//              the dossier chose the plug depth for. No new constant.
//   vent       (review r5) the plug face is an ANNULUS (FT-PLUG-VENT): the
//              spec publishes rVent, and a ball whose bottom point lands
//              inside it seats on the vent RIM, h = sqrt(r² − (rVent − d)²)
//              below-or-equal the flat datum — never above. The side pot
//              lands inside the vent and is the discriminating row.
//   rest       through the whole drop the centre never goes below that
//              station (pre-fix it went 54 mm past it) and the tail is
//              motionless in position AND orientation.
//   contain    the landing plan offset stays inside the well cone's own
//              clearance limit rSeat + taper*h − r*sqrt(1+taper²) (h = the
//              lowest seat, sqrt(r² − rVent²) — conservative), so the
//              resting ball is inside the well, not clipping its wall.
//   hold       a ball resting on a declared closure is never culled and
//              reports pocketed (out of the action set, like a netted
//              ball) once it has landed.
//   purity     poseSink stays a pure function of (entry, dt) — seek() is
//              random-access identical forwards and backwards.
//   preview    an equipment PREVIEW that rebuilds the visual table without
//              reracking re-binds the rest AND repairs the mesh: no ball is
//              left hanging where the removed plug used to be, and the
//              revert restores the exact station.
//   capacity   two balls into ONE closure in one shot (a follow scratch):
//              the cup's DERIVED capacity is one at the flush depth, so the
//              first arrival rests and the overflow keeps the legacy drop
//              lane — never two meshes in one transform.
//   live       a preview at a clock BETWEEN two pots must not touch the ball
//              that has not been potted yet (its sink entry already exists).
//   floor      (skeptic item 4) the per-cup capacity is closureCapacity —
//              floor(−ySurface/2r) floored at ZERO: the published Predator
//              closures hold one, a closure shallower than a diameter holds
//              none (the old max(1) floor would have seated a crown proud
//              of the cloth), a deeper one grows, and the KISS flush band
//              only protects an exact-multiple closure from a last-ulp loss.
//   persist    (skeptic item 1) a ball resting on a modelled closure has its
//              crown ON the bed plane — above the shield line — so it stays
//              visible across PLAYBACK->AIM, survives a DVR scrub back across
//              the pot and forward again (the record is torn down with the
//              ball showing on the plug, not settled — retainRests), stays
//              through the next shot's whole playback (pose + orientation
//              untouched), and disappears only when the cup is cleared:
//              here, on re-rack.
//   occupied   a second ball into a HELD cup (derived capacity one) takes
//              the legacy drop lane: never the station, never a shared
//              transform, culled below the shield — the honest overflow.
//   borrow     (review r4 P2) the GH-257 Playback borrow/restore round trip
//              re-applies the bed BY BALL ID from a pose/flag snapshot, and
//              the pre-open record does not contain the ball at all: the
//              closure occupancy rides that snapshot through the game.js
//              seam pair snapshotRests/restoreRests — after close the ball
//              is back on the plug AND owned again (a preview hides it and
//              the revert restores the exact pose), and a further pot into
//              the cup still overflows. The Predator page boots with the
//              archive ARMED (?archive=1, the e2e-archive convention —
//              scripted boots keep it inert otherwise) so the session can
//              be opened in the player.
//   stale      (review r6) the REVERSE mixed-cache pairing — a fresh game.js
//              under a cached pre-GH-626 playback.js (this tree's own with
//              the `rests:` capture stripped, served over CDP interception):
//              the old close path restores pose/flags only, and the game
//              side reconstructs the occupancy from the restored mesh
//              (refreshNets adoption) — the same borrow rows hold.
//   light      (r8, the owner-visible BLOWN-OUT rest) the ball in the cup
//              takes the cup's own through-mouth transport — the plug's law
//              (table.js pdtPlugField / pdtWellTransport) evaluated per
//              fragment in the ball shader (shading.js SPIKE_WELL_PARS; the
//              derivation gate is tools/derive-well-ball-transport.mjs).
//              Rows: the spec publishes the shaft it is baked against; the
//              resting ball's material carries the cup (axis / rBore /
//              yAper) while a bed ball carries none; a ball still descending
//              already carries it; a retained ball keeps it across
//              PLAYBACK->AIM, loses it on a scrub back across the pot and
//              regains it forward, loses it when a preview removes the
//              closure and regains it on the revert, comes back with it
//              after the borrow round trip, and the racked ball after a
//              re-rack carries none; and a RENDERED A/B at a non-clipping
//              exposure: the ring of the resting ball reads darker with the
//              transport than with it forced off (the Predator rig lights
//              every ball ~2.5x over white on the OPEN bed — a pre-existing,
//              table-wide fact this PR discloses and does not touch — so the
//              A/B is read where nothing clips, which is where a transport
//              law can be measured at all).
//   others     every other table family publishes NO closure anywhere on
//              the bed, keeps the historical fall-and-cull, and settle()
//              still hides the potted ball exactly as before GH-626 — and
//              the transport slot stays open (no closure, no shade).
//
//   node web/tools/test-sinkrest.mjs
//   Ports: OB_E2E_PORT / OB_E2E_CDP_PORT when pinned (run-gate --band
//   leases them); otherwise the gate claims its own lane band
//   (OB_E2E_BAND_START/END, default 8700-8729 — below the CI
//   reserved range, GH-687).
import fs from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  claimPortBand, launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { decodePng } from './png.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// GH-338 lane band: under run-gate --band (CI) the ports arrive pinned in
// the environment and the claim is the wrapper's; hand-run, this gate
// claims its own range (multi-lane Mac).
const pinned = process.env.OB_E2E_PORT !== undefined
  && process.env.OB_E2E_CDP_PORT !== undefined;
const band = pinned ? null : await claimPortBand(
  Number(process.env.OB_E2E_BAND_START ?? 8700),
  Number(process.env.OB_E2E_BAND_END ?? 8729));
const PORT = pinned ? Number(process.env.OB_E2E_PORT) : band.http(0);
const CDP = pinned ? Number(process.env.OB_E2E_CDP_PORT) : band.cdp(0);

// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law: a tool that
// derives ports from a base declares how many so its FULL range is known): the
// `+N` derivations below stay inside http 1 / CDP 2 slots from the base.
export const PORT_INVENTORY = { http: 1, cdp: 2 };
let failures = 0;
const check0 = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
};
const check = check0;

const R = 0.028575;         // FT-BALL 57.15 mm / 2 (render mirror)
const PLUG_TOP = -0.05715;  // FT-PLUG-THICKNESS: crest one ball Ø below cloth

// Grid probe: sinkRestFor over the whole bed, deduplicated by the spec's
// own published centre. Returns [] when the export is absent (a family
// that declares no closure, or a stale cached table.js).
const SCAN = `(async () => {
  const m = await import('/scene/table.js');
  if (typeof m.sinkRestFor !== 'function') return JSON.stringify(null);
  const seen = new Map();
  for (let ix = -70; ix <= 70; ix++) {
    for (let iz = -36; iz <= 36; iz++) {
      const s = m.sinkRestFor(ix * 0.02, iz * 0.02);
      if (s) seen.set(s.x.toFixed(6) + ',' + s.z.toFixed(6), s);
    }
  }
  return JSON.stringify([...seen.values()]);
})()`;

const ready = async (chrome) => {
  for (let i = 0; i < 200; i++) {
    await sleep(200);
    if (await chrome.eval('window.__test?.ready === true').catch(() => false)) return;
  }
  throw new Error('app never became ready');
};

const settle = async (chrome, what) => {
  for (let i = 0; i < 300; i++) {
    await sleep(200);
    const st = await chrome.eval('__test.state()');
    // BALL_IN_HAND/WIN are terminal too — the capacity arm shoots a FOLLOW
    // SCRATCH on purpose (that is how two balls reach one cup in one shot),
    // and flow routes a scratch to ball-in-hand, never to AIM.
    if (st === 'SETTLED' || st === 'AIM' || st === 'BALL_IN_HAND'
      || st === 'WIN') return;
  }
  throw new Error(`${what} never settled`);
};

// the REAL preview broadcast: the live equipment tuple with only the table
// axis moved — exactly what the settings picker emits, and what table.js
// rebuild() and game.js refreshNets both listen to.
const previewTable = (chrome, id) => chrome.eval(`(() => {
  const eq = { ...__settings.get().equipment, table_id: '${id}' };
  window.dispatchEvent(new CustomEvent('ob:settings',
    { detail: { key: 'equipment', value: eq } }));
  return true;
})()`);

const D = Math.SQRT1_2;
// review r5: the plug face is an ANNULUS. The vent radius the EXPECTATIONS
// use is the geometry's own (FT-PLUG-VENT 0.168 × the published plug
// radius), not whatever the tree publishes — so a tree that models the plug
// as a solid disc fails the side arm on its POSE, not merely on a missing
// field (the spec row pins the published value to this mirror).
const VENT_FRAC = 0.168; // FT-PLUG-VENT mirror
const rVentOf = (s) => VENT_FRAC * s.rSupport;
// seat height above the face for a sphere whose bottom point lands a plan
// distance d from the closure axis: r on the face (d >= rVent), on the vent
// rim inside it sqrt(r² − (rVent − d)²). The expected rest centre is read
// from the OBSERVED plan of the rest pose.
const seatY = (s, x, z) => {
  const g = Math.max(0, rVentOf(s) - Math.hypot(x - s.x, z - s.z));
  return s.ySurface + Math.sqrt(R * R - g * g);
};
const ventSink = (s) => R - Math.sqrt(R * R - rVentOf(s) ** 2);
// sphere-in-cone clearance for the RESTING centre: the cone wall radius at y
// is rSeat + taper*(y − ySurface); the centre-to-wall distance is
// (Rwall − d)/sqrt(1 + taper²), which must stay ≥ r. Evaluated at the LOWEST
// seat (a centred drop on the vent rim) — conservative.
const limOf = (s) => s.rSeat + s.taper * (R - ventSink(s))
  - R * Math.hypot(1, s.taper);

// ---- r8: the cup's through-mouth transport on the resting BALL ----
// The per-ball slot shading.js creates (material.userData.wellOccl = the
// shader's uBallWell: axis.x, axis.z, rBore, yAper), read off the LIVE mesh
// of ball `id` (matched by position; a hidden parked ball shares (0,-10,0)
// with every other parked ball, so callers only read visible balls). null
// slot = a tree without the cure; all-zero = open bed.
const WELL_U = (id) => `(() => {
  const b = __test.balls().find((x) => x.id === ${id});
  if (!b) return JSON.stringify({ mesh: false });
  let m = null;
  __dbg.scene.traverse((o) => {
    if (!m && o.isMesh && o.material && o.material.userData && o.material.userData.giSH
      && Math.abs(o.position.x - b.pos[0]) < 1e-9 && Math.abs(o.position.y - b.pos[1]) < 1e-9
      && Math.abs(o.position.z - b.pos[2]) < 1e-9) m = o;
  });
  if (!m) return JSON.stringify({ mesh: false });
  const u = m.material.userData.wellOccl;
  const fl = m.material.userData.wellFloor; // the support height (review r8)
  return JSON.stringify({ mesh: true, uuid: m.uuid, slot: !!u, v: u ? Array.from(u.value.toArray()) : null,
    f: fl ? fl.value : null });
})()`;
// the same read by mesh IDENTITY (uuid captured while the ball was visible)
// — a parked ball shares (0,-10,0) with every other parked ball, so the
// position match above cannot pick it out (review r8)
const WELL_BY_UUID = (uuid) => `(() => {
  let m = null;
  __dbg.scene.traverse((o) => { if (!m && o.uuid === ${JSON.stringify(uuid)}) m = o; });
  if (!m) return JSON.stringify({ mesh: false });
  const u = m.material.userData.wellOccl;
  const fl = m.material.userData.wellFloor;
  return JSON.stringify({ mesh: true, uuid: m.uuid, visible: m.visible, pos: m.position.toArray(),
    slot: !!u, v: u ? Array.from(u.value.toArray()) : null, f: fl ? fl.value : null });
})()`;
const wellArmed = (w, sp) => !!w?.slot && Array.isArray(w.v) && !!sp?.shaft
  && Math.abs(w.v[0] - sp.x) < 1e-9 && Math.abs(w.v[1] - sp.z) < 1e-9
  && Math.abs(w.v[2] - sp.shaft.rBore) < 1e-9 && Math.abs(w.v[3] - sp.shaft.yAper) < 1e-9
  && w.f !== null && Math.abs(w.f - sp.ySurface) < 1e-9;
const wellOpen = (w) => !!w?.slot && Array.isArray(w.v) && w.v.every((x) => x === 0)
  && (w.f === null || w.f === 0);
const wellStr = (w) => (w?.slot ? `${JSON.stringify(w.v?.map((x) => +x.toFixed(5)))} floor ${w.f}` : 'no slot');
// rendered A/B scratch frames (this run's own temp dir; nothing is kept)
const GATE_DIR = mkdtempSync(path.join(os.tmpdir(), 'ob626-gate-'));
const srgb2lin = (c) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
/** mean linear luminance over the 0.55–0.85 r annulus of a projected ball
 * disc — off the crown's white number decal, where the transport gradient
 * of a top-down read is strongest */
const ringLum = (file, d) => {
  const img = decodePng(file);
  const sx = img.w / 1280; const sy = img.h / 800;
  const cx = d.cx * sx; const cy = d.cy * sy; const r1 = d.r * sx * 0.85; const r0 = d.r * sx * 0.55;
  let n = 0; let lum = 0; let mx = 0;
  for (let y = Math.floor(cy - r1); y <= Math.ceil(cy + r1); y++) {
    for (let x = Math.floor(cx - r1); x <= Math.ceil(cx + r1); x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2;
      if (d2 > r1 * r1 || d2 < r0 * r0 || x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      const i = (y * img.w + x) * img.ch;
      const Y = 0.2126 * srgb2lin(img.data[i]) + 0.7152 * srgb2lin(img.data[i + 1])
        + 0.0722 * srgb2lin(img.data[i + 2]);
      lum += Y; if (Y > mx) mx = Y;
      n++;
    }
  }
  return n ? { mean: lum / n, max: mx } : null;
};
const DISC = (id) => `(async () => {
  const THREE = await import('three');
  const cam = __dbg.camera; cam.updateMatrixWorld();
  const b = __test.balls().find((x) => x.id === ${id});
  const c = new THREE.Vector3(b.pos[0], b.pos[1], b.pos[2]);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion).multiplyScalar(${R});
  const p = c.clone().project(cam); const q = c.clone().add(right).project(cam);
  const cx = (p.x + 1) / 2 * innerWidth; const cy = (1 - p.y) / 2 * innerHeight;
  return JSON.stringify({ cx, cy, r: Math.hypot((q.x + 1) / 2 * innerWidth - cx, (1 - q.y) / 2 * innerHeight - cy) });
})()`;
/** Rendered A/B of the transport on the ball at rest: the same top-down
 * frame (0.45 m over the crown, fov 18) with the slot as the pose law armed
 * it and with the slot forced open, rendered through LINEAR tone mapping
 * (three LinearToneMapping = clamp(exposure * radiance)) at an exposure
 * that keeps the open ring's brightest pixel under 1.0, so the measured
 * ratio IS the radiance ratio (review r8: the first cut read through the
 * ACES shoulder at exposure 0.2, where an 18 % radiance drop is a ~5 %
 * output drop and the stated bound did not connect to the measurement).
 * Restores tone mapping + exposure + the DOM; the caller re-seeks so
 * poseSink re-arms the slot. Returns { armed, open, exposure, maxOpen }
 * ring reads or null. */
async function wellRenderedAB(chrome, ballId, tag, rearm) {
  const b = JSON.parse(await chrome.eval(
    `JSON.stringify(__test.balls().find((x) => x.id === ${ballId}))`));
  if (!b?.visible) return null;
  const cam = { cam: [b.pos[2] + 1e-4, b.pos[0], b.pos[1] + R + 0.45],
    look: [b.pos[2], b.pos[0], b.pos[1] + R], fov: 18 };
  let posed = false;
  for (let i = 0; i < 25 && !posed; i++) {
    posed = await chrome.eval(`__test.cameraPose(${JSON.stringify(cam)})`);
    if (!posed) await sleep(200);
  }
  if (!posed) return null;
  const saved = JSON.parse(await chrome.eval(`(() => {
    const st = document.createElement('style'); st.id = 'ob626-gate-hide';
    st.textContent = 'body > :not(canvas) { display: none !important; }';
    document.head.appendChild(st);
    __dbg.scene.traverse((o) => { if (/cue|^obAim/i.test(o.name || '')) o.visible = false; });
    const r = __dbg.renderer;
    const s = { tm: r.toneMapping, exp: r.toneMappingExposure };
    r.toneMapping = 1; // THREE.LinearToneMapping: clamp(exposure * radiance)
    return JSON.stringify(s);
  })()`));
  const setExp = (e) => chrome.eval(`(() => { __dbg.renderer.toneMappingExposure = ${e}; return true; })()`);
  // the DIRECT legs off (every RectAreaLight at intensity 0 — the analytic
  // rig's shadows are a multiplier on them, so this removes the direct term
  // and leaves the ambient legs: env, SH probe, venue hemisphere, hemi fill)
  const lamps = (on) => chrome.eval(`(() => {
    if (!window.__ob626Lamps) window.__ob626Lamps = [];
    if (${on ? 'true' : 'false'}) {
      for (const [l, i] of window.__ob626Lamps) l.intensity = i;
      window.__ob626Lamps = [];
    } else {
      __dbg.scene.traverse((o) => { if (o.isRectAreaLight) { window.__ob626Lamps.push([o, o.intensity]); o.intensity = 0; } });
    }
    return window.__ob626Lamps.length;
  })()`);
  const forceOpen = (on) => chrome.eval(`(() => {
    const b = __test.balls().find((x) => x.id === ${ballId});
    let m = null;
    __dbg.scene.traverse((o) => {
      if (!m && o.isMesh && o.material?.userData?.wellOccl
        && Math.abs(o.position.x - b.pos[0]) < 1e-9 && Math.abs(o.position.y - b.pos[1]) < 1e-9
        && Math.abs(o.position.z - b.pos[2]) < 1e-9) m = o;
    });
    if (!m) return false;
    if (${on ? 'true' : 'false'}) {
      const u = m.material.userData.wellOccl; u.value.set(0, 0, 0, 0);
      if (m.material.userData.wellFloor) m.material.userData.wellFloor.value = 0;
    }
    return true;
  })()`);
  let result = null;
  try {
    // exposure from the read itself: start low, halve while the OPEN ring
    // (the brighter of the two) has a pixel at the clamp
    let exposure = 0.1;
    for (let attempt = 0; attempt < 4; attempt++) {
      // the previous attempt left the slot forced OPEN — re-arm through the
      // pose law (the caller's seek) before this attempt's ARMED frame
      if (attempt > 0 && rearm) await rearm();
      await setExp(exposure);
      await sleep(700); // the tone-mapping switch recompiles the programs
      const d = JSON.parse(await chrome.eval(DISC(ballId)));
      const fA = path.join(GATE_DIR, `${tag}-armed-${attempt}.png`);
      await chrome.screenshot(fA);
      const armed = ringLum(fA, d);
      if (!(await forceOpen(true))) break;
      await sleep(400);
      const fB = path.join(GATE_DIR, `${tag}-open-${attempt}.png`);
      await chrome.screenshot(fB);
      const open = ringLum(fB, d);
      result = { armed: armed?.mean ?? null, open: open?.mean ?? null,
        maxOpen: open?.max ?? null, exposure, disc: d };
      if (open && open.max < 0.98) {
        // the clamp never bit: a linear read. Third frame — slot still
        // open, direct legs off — gives the AMBIENT SHARE of the ring's
        // radiance, so the bound below needs no premise about the mix.
        await lamps(false);
        await sleep(400);
        const fC = path.join(GATE_DIR, `${tag}-open-ambient-${attempt}.png`);
        await chrome.screenshot(fC);
        const amb = ringLum(fC, d);
        await lamps(true);
        result.openAmbient = amb?.mean ?? null;
        result.ambientShare = (amb && open && open.mean > 0)
          ? Math.min(1, Math.max(0, amb.mean / open.mean)) : null;
        break;
      }
      exposure /= 2;
    }
  } finally {
    await lamps(true).catch(() => null);
    await chrome.eval(`(() => {
      const r = __dbg.renderer; r.toneMapping = ${saved.tm}; r.toneMappingExposure = ${saved.exp};
      document.getElementById('ob626-gate-hide')?.remove(); return true;
    })()`).catch(() => null);
  }
  return result;
}

/** review r4 P2 (fresh pairing) / review r6 P2 (stale pairing): the GH-257
 * Playback borrow/restore round trip over a bed that holds a Predator cup.
 * Opening the archived player re-stages the bed quietly (restRetained clears
 * with the table state it replaces); closing it restores the pre-open bed BY
 * BALL ID (playback.js restorePoses: pose/flags, then syncShadows). The
 * pre-open record does not contain the resting ball — nothing in it can
 * re-derive the sink entry — so the occupancy must either ride the snapshot
 * (fresh playback.js: game.snapshotRests -> snap.rests -> game.restoreRests)
 * or be RECONSTRUCTED game-side from the restored mesh (a cached pre-GH-626
 * playback.js knows no `rests`: refreshNets adoption, the bidirectional
 * fallback the ownership ledger's cache-poison contract demands). Observable three
 * ways either way: the ball is back on the plug; a preview HIDES it (an
 * unowned mesh would be left hanging on the removed plug — the r1 defect)
 * and the revert restores it; and the cup is still HELD for the next pot.
 * `ctx`: { label, sp (closure spec), ballId (the resting ball), rest0 (its
 * rest read), kx, ky (the closure axis, kernel frame) }. */
async function borrowRoundTrip(chrome, { label, sp, ballId, rest0, kx, ky }) {
  const check = (name, ok, detail = '') => check0(`${name} [${label}]`, ok, detail);
  const read = async (id = ballId) => JSON.parse(await chrome.eval(
    `JSON.stringify(__test.balls().find((bb) => bb.id === ${id}) ?? null)`));
  const atSeat = (pp) => Math.abs(pp[1] - seatY(sp, pp[0], pp[2])) < 1e-6;
  const cuePre = await read(0); // the pre-open cue state (live or down)
  const sid = await chrome.eval(`(async () => {
    await window.__archive?.flush?.();
    return window.__archive?.current?.() ?? null;
  })()`);
  check('borrow: the live session is archived (staging)', sid != null,
    String(sid));
  if (sid != null) {
    const opened = await chrome.eval(
      `window.__playback.openSession(${JSON.stringify(sid)})`);
    check('borrow: the player opens over the session', opened === true,
      String(opened));
    await sleep(1000);
    const stIn = await chrome.eval('__test.state()');
    check('borrow: the player holds the machine in PLAYBACK while open',
      stIn === 'PLAYBACK', stIn);
    const mid = await read();
    check('borrow: while the archived bed is staged the live rest is NOT on the plug (quiet staging replaces the table state)',
      !(mid.visible === true && atSeat(mid.pos)),
      `visible ${mid.visible} y ${mid.pos[1].toFixed(6)}`);
    await chrome.eval('window.__playback.close()');
    // the close re-stages the pre-open record ('playback' stage — the
    // machine passes through PLAYBACK again), seeks to its end and lets
    // the RAF settle route; afterSettle() then re-applies the snapshot.
    // Wait for the settle to ROUTE (leave PLAYBACK), then for the poll.
    await settle(chrome, 'borrow close');
    await sleep(1500); // afterSettle re-applies the snapshot on a RAF
    const restored = await read();
    check('borrow: after close the ball is back on the plug (exact-bed restore)',
      restored.visible === true && restored.pocketed === true
      && JSON.stringify(restored.pos) === JSON.stringify(rest0.pos),
      `visible ${restored.visible} pocketed ${restored.pocketed} `
      + `y ${restored.pos[1].toFixed(6)}`);
    const wRestored = JSON.parse(await chrome.eval(WELL_U(ballId)));
    check('borrow: light — the restored ball is back in the cup\'s shade (carrier or reconstruction, either way the transport re-arms)',
      wellArmed(wRestored, sp), wellStr(wRestored));
    await previewTable(chrome, 'diamond_proam_9ft');
    await sleep(1500);
    const hid = await read();
    check('borrow: a preview hides the restored ball (owned again, not orphaned)',
      hid.visible === false && Math.abs(hid.pos[1] + 10) < 1e-9,
      `visible ${hid.visible} ${hid.pos.join(',')}`);
    await previewTable(chrome, 'predator_apex_9ft');
    await sleep(1500);
    const back2 = await read();
    check('borrow: the revert restores the exact pose',
      back2.visible === true && back2.pocketed === true
      && JSON.stringify(back2.pos) === JSON.stringify(rest0.pos)
      && JSON.stringify(back2.quat) === JSON.stringify(rest0.quat),
      `visible ${back2.visible} y ${back2.pos[1].toFixed(6)}`);
    // the cup is still HELD: roll a third ball into it.
    const bed = JSON.parse(await chrome.eval('JSON.stringify(__test.bed())'));
    const stBack = await chrome.eval('__test.state()');
    const cueBack = await read(0);
    check('borrow: after the round trip the machine is back in an aiming state',
      stBack === 'AIM' || stBack === 'BALL_IN_HAND', stBack);
    // The exact-bed restore must hand the cue back exactly as the pre-open
    // bed had it. In the fresh persist arm the scripted-layout sandbox had
    // routed the occupied-arm scratch to AIM with the cue DOWN (measured:
    // state AIM, cue pocketed, parked); on the pre-r4 tree it came back
    // VISIBLE at the station instead — the close-side settle re-seated the
    // overflow cue on the cup nothing held any more, two balls in one
    // transform. A cue that was LIVE before the open comes back live, and
    // never at the seat.
    check('borrow: the exact-bed restore hands the cue back as the pre-open bed had it (never re-seated on the held station)',
      cueBack.pocketed === cuePre.pocketed && cueBack.visible === cuePre.visible
      && !(cueBack.visible && atSeat(cueBack.pos)),
      `pre pocketed ${cuePre.pocketed} visible ${cuePre.visible} -> state ${stBack} `
      + `cue pocketed ${cueBack.pocketed} visible ${cueBack.visible} y ${cueBack.pos[1].toFixed(4)}`);
    // A third pot needs a live cue. A pocketed one is revived through the
    // seam flow.js itself calls before entering BALL_IN_HAND (game.respotCue,
    // the "revive the cue BEFORE the state" contract), reached over the
    // ADDITIVE __test.respotCue scripted seam; then it is placed in the
    // kitchen (placeCue's clamp) on a ~14° off-diagonal line to the same
    // corner.
    const revived = cueBack.pocketed ? await chrome.eval(`(() => {
      if (typeof __test.respotCue !== 'function') return 'no seam';
      __test.respotCue(); return true;
    })()`) : true;
    const cueUp = await read(0);
    check('borrow: the cue is live for the third pot (revived through the real respot seam when the pre-open bed had it down)',
      revived === true && cueUp.pocketed === false && cueUp.visible === true
      && cueUp.pos[1] > 0,
      `${String(revived)} pocketed ${cueUp.pocketed} visible ${cueUp.visible}`);
    const px = -Math.sign(kx) * (bed.tableWidth / 2 - 0.10);
    const py = -Math.sign(ky) * (bed.tableLength / 4 + 0.05);
    const placed = await chrome.eval(`__test.placeCue(${px}, ${py})`);
    check('borrow: cue placed in the kitchen for the third pot (staging)',
      placed === true, String(placed));
    const cue3 = await read(0);
    const phi3 = Math.atan2(ky - cue3.pos[0], kx - cue3.pos[2]);
    const err3 = await chrome.eval(
      `__test.shoot({ v0: 1.9, phi: ${phi3}, theta: 0, a: 0, b: 0 })`);
    check('borrow: a further shot into the held cup is accepted', !err3,
      String(err3));
    await settle(chrome, 'third pot');
    const ev3 = JSON.parse(await chrome.eval(`JSON.stringify(
      __test.events().filter((e) => e.kind && e.kind.BallPocket)
        .map((e) => ({ t: e.t, ...e.kind.BallPocket })))`));
    const cueIn3 = ev3.find((e) => e.ball === 0);
    check('borrow: the cue reaches the held cup again (staging)',
      !!cueIn3 && ev3.length === 1, JSON.stringify(ev3));
    if (cueIn3) {
      await chrome.eval('__test.pause(true)');
      const rows = [];
      for (let k = 0; k <= 30; k++) {
        await chrome.eval(`__test.seek(${cueIn3.t + k * 0.04})`);
        rows.push(JSON.parse(await chrome.eval(`JSON.stringify(
          __test.balls().filter((b) => b.id === 0 || b.id === ${ballId})
            .map((b) => ({ id: b.id, v: b.visible, p: b.pos, q: b.quat })))`)));
      }
      const at = (r, id) => r.find((x) => x.id === id);
      check('borrow: after the round trip the cup is still HELD — the next ball never takes the station',
        rows.every((r) => { const c = at(r, 0);
          return !c?.v || !atSeat(c.p); }));
      check('borrow: the next ball is culled below the shield (legacy lane)',
        rows.slice(-8).every((r) => at(r, 0)?.v === false),
        JSON.stringify(rows.at(-1)));
      check('borrow: the restored ball is untouched by the next record',
        rows.every((r) => { const b = at(r, ballId);
          return b?.v === true
            && JSON.stringify(b.p) === JSON.stringify(rest0.pos)
            && JSON.stringify(b.q) === JSON.stringify(rest0.quat); }));
      await chrome.eval('__test.pause(false)');
    }
  }
}

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

// ============================ PREDATOR ============================
// archive=1: the borrow row opens THIS session in the Playback player, and
// the archive is inert on a scripted boot unless opted in (archive.js
// arming law). Nothing else in the run reads it.
// ballKnee=off (GH-996, card 45; a scripted-boot seam): the RENDERED A/B
// rows derive their bound from LINEAR light terms (the measured ratio IS
// the radiance ratio). The ball diffuse knee compresses lamp-blown diffuse
// by design — a non-linear look step after the transport — and is judged
// by its own rows (the lighting matrix census, the venue seal's KNEE rows).
let chrome = await launchChrome(
  `http://127.0.0.1:${PORT}/app.html?table=predator_apex_9ft&cinema=1&seed=7`
  + '&archive=1&ballKnee=off',
  { port: CDP });
try {
  await ready(chrome);
  await sleep(1500);

  const specs = JSON.parse(await chrome.eval(SCAN));
  check('spec: predator publishes the sinkRestFor closure export',
    Array.isArray(specs), String(specs));
  if (!Array.isArray(specs)) throw new Error('no closure export on predator');
  check('spec: 6 closures (4 corners + 2 sides)', specs.length === 6,
    `${specs.length}`);
  check('spec: every closure sits at the canonical plug crest -57.15 mm',
    specs.every((s) => Math.abs(s.ySurface - PLUG_TOP) < 1e-9),
    specs.map((s) => s.ySurface).join(','));
  check('crown: on the face, rest centre plugTop+r puts the CROWN on the bed plane',
    specs.every((s) => Math.abs(s.ySurface + 2 * R) < 1e-9),
    (PLUG_TOP + 2 * R).toExponential(2));
  check('spec: seat is relieved outward of the plug face (rSeat > rSupport)',
    specs.every((s) => s.rSeat > s.rSupport));
  // review r5: the face is an annulus — the vent is a READ of the built
  // geometry (FT-PLUG-VENT 0.168 of the plug radius), narrower than the
  // ball's section so the rim always catches it.
  check('vent: the spec publishes the plug vent (FT-PLUG-VENT × plug radius, inside the face, narrower than the ball)',
    specs.every((s) => s.rVent > 0 && Math.abs(s.rVent - VENT_FRAC * s.rSupport) < 1e-9
      && s.rVent < s.rSupport && s.rVent < R),
    specs.map((s) => ((s.rVent ?? 0) * 1000).toFixed(3)).join(','));
  // (the rows below derive their expectations from the geometry — see
  // rVentOf at module scope — so they discriminate the seat law on the
  // pose itself)
  check('vent: a centred drop would seat below the flat datum by r − sqrt(r² − rVent²) — under 1 mm, never above it',
    specs.every((s) => ventSink(s) > 0 && ventSink(s) < 0.001),
    specs.map((s) => (ventSink(s) * 1000).toFixed(3) + ' mm').join(','));
  check('spec: the well cone opens upward (taper > 0)',
    specs.every((s) => s.taper > 0),
    specs.map((s) => s.taper.toFixed(6)).join(','));
  check('spec: the derived cone clearance is positive at the rest height',
    specs.every((s) => limOf(s) > 0),
    specs.map((s) => (limOf(s) * 1000).toFixed(3)).join(','));
  // r8: the shaft the transport is baked against — rBore is the bore the
  // cone opens into (rSeat + taper * (yTop - ySurface) by the builder's own
  // taper definition) and the aperture lies above the bed plane
  check('light: every closure publishes the shaft it is baked against (rBore = rSeat + taper·(yTop − ySurface), aperture above the bed)',
    specs.every((s) => s.shaft && s.shaft.rBore > s.rSeat && s.shaft.yAper > 0
      && Math.abs(s.shaft.rBore - (s.rSeat + s.taper * (s.shaft.yTop - s.ySurface))) < 1e-9),
    specs.map((s) => (s.shaft
      ? `${(s.shaft.rBore * 1000).toFixed(3)}/${(s.shaft.yAper * 1000).toFixed(3)} mm` : 'none')).join(','));
  const far = await chrome.eval(`(async () => {
    const m = await import('/scene/table.js');
    return JSON.stringify(m.sinkRestFor(0, 0));
  })()`);
  check('spec: bed-centre query is null (no phantom closure)', far === 'null',
    far);

  // ---- skeptic item 4: the capacity FLOOR is derived, not asserted ----
  // closureCapacity is game.js's pure, exported derivation: occupant k is
  // in the well while its crown ySurface + (2k+2)r is at or below the bed
  // plane, so cap = floor((tol − ySurface)/2r) floored at ZERO. The old
  // form floored it at ONE, which would have seated a ball whose crown
  // stands proud of the cloth in any closure shallower than a diameter.
  const capRows = JSON.parse(await chrome.eval(`(async () => {
    const gm = await import('/app/game.js');
    if (typeof gm.closureCapacity !== 'function') return JSON.stringify(null);
    const R = ${R}; const KISS = 1e-6; // game.js KISS_TOL (kernel Eps::KISS)
    const ulp = 2 * R * Number.EPSILON;
    return JSON.stringify({
      predator: ${JSON.stringify(specs.map((s) => s.ySurface))}
        .map((y) => gm.closureCapacity(y, R, KISS)),
      exact2rNoBand: gm.closureCapacity(-2 * R, R, 0),
      shallow15r: gm.closureCapacity(-1.5 * R, R, KISS),
      shallowCrownMm: (-1.5 * R + 2 * R) * 1000,
      deep4r: gm.closureCapacity(-4 * R, R, KISS),
      deep5r: gm.closureCapacity(-5 * R, R, KISS),
      ulpNoBand: gm.closureCapacity(-(2 * R - ulp), R, 0),
      ulpBand: gm.closureCapacity(-(2 * R - ulp), R, KISS),
      degenerate: [gm.closureCapacity(NaN, R, KISS),
        gm.closureCapacity(-2 * R, 0, KISS)],
    });
  })()`));
  check('floor: game.js exports the closureCapacity derivation',
    capRows !== null);
  if (capRows) {
    check('floor: every published Predator closure holds exactly ONE ball',
      capRows.predator.every((c) => c === 1), capRows.predator.join(','));
    check('floor: the Predator depth is exact in float (band not needed)',
      capRows.exact2rNoBand === 1, String(capRows.exact2rNoBand));
    // THE RED ARM: the old max(1) floor returned 1 here
    check('floor: a closure shallower than a diameter holds NONE '
      + '(its occupant\'s crown would stand proud of the cloth)',
      capRows.shallow15r === 0,
      `cap ${capRows.shallow15r}, crown +${capRows.shallowCrownMm.toFixed(1)} mm`);
    check('floor: a two-diameter closure holds two, 2.5 still two',
      capRows.deep4r === 2 && capRows.deep5r === 2,
      `${capRows.deep4r}/${capRows.deep5r}`);
    check('floor: the KISS band only saves an exact-multiple closure from '
      + 'a last-ulp loss', capRows.ulpNoBand === 0 && capRows.ulpBand === 1,
      `${capRows.ulpNoBand}/${capRows.ulpBand}`);
    check('floor: degenerate inputs hold nothing',
      capRows.degenerate.every((c) => c === 0), capRows.degenerate.join(','));
  }

  // scene frame: three.x = kernel.y (the LONG axis), three.z = kernel.x —
  // the side pockets are the pair on the long-axis midline.
  const corners = specs.filter((s) => Math.abs(s.x) > 0.1);
  const sides = specs.filter((s) => Math.abs(s.x) <= 0.1);
  check('spec: 4 corner + 2 side closures',
    corners.length === 4 && sides.length === 2,
    `${corners.length}/${sides.length}`);

  // -------- one pot per family, seeked frame by frame --------
  for (const arm of [
    { name: 'corner', spec: corners.find((s) => s.x > 0 && s.z > 0) },
    { name: 'side', spec: sides.find((s) => s.z > 0) },
  ]) {
    const sp = arm.spec;
    if (!sp) { check(`${arm.name}: target closure found`, false); continue; }
    const kx = sp.z; const ky = sp.x; // kernel frame
    const isCorner = arm.name === 'corner';
    const ux = isCorner ? Math.sign(kx) * D : Math.sign(kx);
    const uy = isCorner ? Math.sign(ky) * D : 0;
    const phi = Math.atan2(uy, ux);
    await chrome.eval('__test.pause(false)');
    await chrome.eval(`__test.layout([
      { id: 0, x: ${kx - 0.45 * ux}, y: ${ky - 0.45 * uy} },
      { id: 1, x: ${kx - 0.18 * ux}, y: ${ky - 0.18 * uy} },
    ])`);
    await sleep(300);
    const err = await chrome.eval(
      `__test.shoot({ v0: ${isCorner ? 1.8 : 2.2}, phi: ${phi}, theta: 0, a: 0, b: 0 })`);
    check(`${arm.name}: shoot accepted`, !err, String(err));
    await settle(chrome, `${arm.name} shot`);
    const ev = JSON.parse(await chrome.eval(`JSON.stringify(
      __test.events().filter((e) => e.kind && e.kind.BallPocket))`));
    check(`${arm.name}: exactly one BallPocket event`, ev.length === 1,
      `got ${ev.length}`);
    if (ev.length !== 1) continue;
    const t0 = ev[0].t;
    const ballId = ev[0].kind.BallPocket.ball;

    await chrome.eval('__test.pause(true)');
    const grid = [];
    for (let k = 0; k <= 60; k++) grid.push(t0 + k * 0.015);
    const poses = [];
    for (const t of grid) {
      await chrome.eval(`__test.seek(${t})`);
      const b = JSON.parse(await chrome.eval(`JSON.stringify(
        __test.balls().find((bb) => bb.id === ${ballId}))`));
      poses.push({ t, dt: t - t0, ...b });
    }
    const tail = poses.slice(-5);
    // the expected seat is read from the rest pose's PLAN (face or vent rim)
    const dRest = Math.hypot(tail[4].pos[0] - sp.x, tail[4].pos[2] - sp.z);
    const yRest = seatY(sp, tail[4].pos[0], tail[4].pos[2]);
    const onFace = dRest >= rVentOf(sp);
    // THE #626 ROW: the drop never passes through the plug.
    const deepest = Math.min(...poses.map((p) => p.pos[1]));
    check(`${arm.name}: the drop never sinks below the plug rest station`,
      deepest > yRest - 1e-6,
      `deepest ${deepest.toFixed(6)} vs rest ${yRest.toFixed(6)} `
      + `(${((yRest - deepest) * 1000).toFixed(2)} mm through)`);
    check(`${arm.name}: the ball is never culled on a closed pocket`,
      poses.every((p) => p.visible),
      `${poses.filter((p) => !p.visible).length} hidden samples`);
    check(`${arm.name}: comes to rest at the derived seat (${onFace ? 'plug face: crest + r' : 'vent rim: crest + sqrt(r² − (rVent − d)²)'})`,
      tail.every((p) => Math.abs(p.pos[1] - yRest) < 1e-6),
      `${tail.map((p) => p.pos[1].toFixed(6)).join(',')} vs ${yRest.toFixed(6)} `
      + `(d ${(dRest * 1000).toFixed(3)} mm, rVent ${(rVentOf(sp) * 1000).toFixed(3)} mm)`);
    check(`${arm.name}: the resting crown never stands above the bed plane`,
      tail[4].pos[1] + R <= 1e-9, (tail[4].pos[1] + R).toExponential(2));
    if (onFace) {
      check(`${arm.name}: bottom point on the plug face (d ≥ rVent) — the crown sits ON the bed plane`,
        Math.abs(tail[4].pos[1] + R) < 1e-6,
        `crown ${(tail[4].pos[1] + R).toExponential(2)} d ${(dRest * 1000).toFixed(3)} mm`);
    } else {
      // review r5: inside the vent the seat is the rim, below the flat datum
      // by r − sqrt(r² − (rVent − d)²) — this is the row the solid-disc law
      // fails (it floated the ball at the flat datum over the hole).
      const sink = R - Math.sqrt(R * R - (rVentOf(sp) - dRest) ** 2);
      check(`${arm.name}: bottom point inside the vent (d < rVent) — seated on the vent rim, ${(sink * 1000).toFixed(3)} mm below the flat datum`,
        sink > 0 && Math.abs((sp.ySurface + R) - tail[4].pos[1] - sink) < 1e-6,
        `y ${tail[4].pos[1].toFixed(6)} flat ${(sp.ySurface + R).toFixed(6)} `
        + `d ${(dRest * 1000).toFixed(3)} mm`);
    }
    check(`${arm.name}: the rest is motionless in position AND orientation`,
      tail.every((p) => JSON.stringify(p.pos) === JSON.stringify(tail[0].pos)
        && JSON.stringify(p.quat) === JSON.stringify(tail[0].quat)));
    check(`${arm.name}: the drop DESCENDS to the rest (no hover)`,
      poses[0].pos[1] > yRest + 0.02,
      `first sample ${poses[0].pos[1].toFixed(5)}`);
    const off = Math.hypot(tail[4].pos[0] - sp.x, tail[4].pos[2] - sp.z);
    check(`${arm.name}: rest is inside the well cone clearance`,
      off < limOf(sp),
      `offset ${(off * 1000).toFixed(3)} mm vs limit `
      + `${(limOf(sp) * 1000).toFixed(3)} mm`);
    check(`${arm.name}: the contact point lands ON the plug (${off < rVentOf(sp) ? 'vent rim' : 'face'}, inside the plug radius)`,
      off < sp.rSupport,
      `offset ${(off * 1000).toFixed(3)} mm vs plug r `
      + `${(sp.rSupport * 1000).toFixed(3)} mm`);
    check(`${arm.name}: no squeeze on an undressed closure (scale 1)`,
      poses.every((p) => Math.abs(p.scale - 1) < 1e-9));
    check(`${arm.name}: a landed ball reports pocketed (out of the action)`,
      tail.every((p) => p.pocketed === true));
    check(`${arm.name}: a ball still in the air is NOT pocketed yet`,
      poses[0].pocketed === false, String(poses[0].pocketed));

    // purity: random-access seek reproduces the pose bit-identically
    let pure = true;
    for (const i of [Math.floor(poses.length / 2), poses.length - 1]) {
      const want = poses[i];
      await chrome.eval(`__test.seek(${t0 + 0.9})`);
      await chrome.eval(`__test.seek(${want.t})`);
      const again = JSON.parse(await chrome.eval(`JSON.stringify(
        __test.balls().find((bb) => bb.id === ${ballId}))`));
      if (JSON.stringify(again.pos) !== JSON.stringify(want.pos)
        || JSON.stringify(again.quat) !== JSON.stringify(want.quat)
        || again.scale !== want.scale || again.visible !== want.visible) {
        pure = false;
      }
    }
    check(`${arm.name}: purity — seek() random-access is bit-identical`, pure);

    // ---- r8: the cup's through-mouth transport reaches the ball ----
    await chrome.eval(`__test.seek(${t0 + 0.9})`);
    const wRest = JSON.parse(await chrome.eval(WELL_U(ballId)));
    check(`${arm.name}: light — at rest the ball's material carries the cup's shaft (axis, rBore, yAper)`,
      wellArmed(wRest, sp), wellStr(wRest));
    const wCue = JSON.parse(await chrome.eval(WELL_U(0)));
    check(`${arm.name}: light — the cue ball on the open bed carries none`,
      wellOpen(wCue), wellStr(wCue));
    await chrome.eval(`__test.seek(${t0 + 0.02})`);
    const wDrop = JSON.parse(await chrome.eval(WELL_U(ballId)));
    check(`${arm.name}: light — a ball still descending into the cup already carries it (its lower half is in the shaft's shade)`,
      wellArmed(wDrop, sp), wellStr(wDrop));
    await chrome.eval(`__test.seek(${t0 + 0.9})`);
    // RENDERED: the ring of the resting ball with the transport vs with the
    // slot forced open, same frame, LINEAR tone mapping at a non-clamping
    // exposure — so the measured ratio IS the radiance ratio. The bound is
    // DERIVED from the spec and from a third read, with no premise about
    // the light mix: every ambient leg (env, SH probe, venue hemisphere,
    // hemi fill) is scaled by hemiVis, which over the ball's upper cap never
    // exceeds the on-axis crown value F0 = rBore² / (rBore² + yAper²)
    // (0.574 corner / 0.627 side — the disc form factor; off axis and
    // tilted it only falls); every other leg is scaled by a factor <= 1.
    // With a = the ambient share of the ring's radiance (measured: the same
    // frame with the direct legs off), the radiance ratio is therefore
    //   <= a * F0 + (1 - a) * 1 = 1 - a * (1 - F0).
    // A transport that merely delivers the derivation passes; a tree without
    // the slot cannot (ratio 1). The pre-r8 form of this row measured the
    // ratio through the ACES shoulder and asserted "ambient >= half" — both
    // replaced (review r8).
    const ab = await wellRenderedAB(chrome, ballId, `${arm.name}`,
      () => chrome.eval(`__test.seek(${t0 + 0.9})`));
    const F0 = sp.shaft ? (sp.shaft.rBore ** 2) / (sp.shaft.rBore ** 2 + sp.shaft.yAper ** 2) : null;
    const bound = (ab && ab.ambientShare != null && F0 != null) ? 1 - ab.ambientShare * (1 - F0) : null;
    if (ab) {
      console.log(`      ${arm.name} A/B ring (0.55-0.85 r, linear, exposure ${ab.exposure}, open max ${ab.maxOpen?.toFixed(3)}): armed ${ab.armed?.toFixed(4)} `
        + `open ${ab.open?.toFixed(4)} ratio ${(ab.armed / ab.open).toFixed(3)}; ambient share ${ab.ambientShare?.toFixed(3)} `
        + `F0 ${F0?.toFixed(4)} -> derived bound ${bound?.toFixed(4)}`);
    }
    check(`${arm.name}: light — RENDERED: the ring's radiance ratio with/without the transport is under the spec-derived bound 1 − a·(1 − F0) (linear tone mapping, unclamped read, a = measured ambient share)`,
      !!ab && ab.armed != null && ab.open != null && ab.maxOpen != null && ab.maxOpen < 0.98
      && bound != null && ab.ambientShare > 0 && ab.armed / ab.open <= bound,
      ab ? `ratio ${(ab.armed / ab.open).toFixed(3)} bound ${bound?.toFixed(4)} (a ${ab.ambientShare?.toFixed(3)}, F0 ${F0?.toFixed(4)}) open max ${ab.maxOpen?.toFixed(3)} exposure ${ab.exposure}`
        : 'no read (no slot / no pose)');
    await chrome.eval(`__test.seek(${t0 + 0.9})`);
    const wBack = JSON.parse(await chrome.eval(WELL_U(ballId)));
    check(`${arm.name}: light — the next seek re-derives the transport from the pose law (the A/B left nothing behind)`,
      wellArmed(wBack, sp), wellStr(wBack));
    // review r8 P2: the rest's baked-GI probe (uGiSH) must be a pure function
    // of where the ball is presented, not of the seek history. Park the ball
    // on the bed (its probe samples the bed there), then jump straight past
    // touchdown: the probe must equal the grid sampled AT the rest position.
    // The pre-r8 updateBallProbes skipped every pocketed ball, so the rest
    // kept the bed sample — this row FAILS there.
    const shRow = JSON.parse(await chrome.eval(`(async () => {
      const gi = (await import('/scene/gi.js')).giActive.instance;
      if (!gi || !gi.state?.ready) return JSON.stringify({ ready: false });
      const find = () => {
        const b = __test.balls().find((x) => x.id === ${ballId});
        let m = null;
        __dbg.scene.traverse((o) => {
          if (!m && o.isMesh && o.material?.userData?.giSH
            && Math.abs(o.position.x - b.pos[0]) < 1e-9 && Math.abs(o.position.y - b.pos[1]) < 1e-9
            && Math.abs(o.position.z - b.pos[2]) < 1e-9) m = o;
        });
        return m;
      };
      __test.seek(${t0 - 0.2});
      const bed = find();
      const shBed = bed ? Array.from(bed.material.userData.giSH.value) : null;
      __test.seek(${t0 + 0.9});
      const rest = find();
      if (!rest) return JSON.stringify({ ready: true, mesh: false });
      const got = Array.from(rest.material.userData.giSH.value);
      const want = new Float32Array(27);
      gi.sampleSH(rest.position.x, rest.position.z, want);
      const maxDiff = Math.max(...got.map((v, k) => Math.abs(v - want[k])));
      const movedFromBed = shBed ? Math.max(...got.map((v, k) => Math.abs(v - shBed[k]))) : null;
      return JSON.stringify({ ready: true, mesh: true, maxDiff, movedFromBed, giBallOn: rest.material.userData.giBallOn?.value });
    })()`));
    check(`${arm.name}: light — after a seek that jumps straight past touchdown the rest's GI probe is the grid sampled AT the rest (seek purity; the bed sample is not carried over)`,
      shRow.ready === false || (shRow.mesh === true && shRow.maxDiff < 1e-6
        && (shRow.movedFromBed === null || shRow.movedFromBed > 1e-6)),
      JSON.stringify(shRow));
  }

  // ---- GH-626 review r1 P2: the equipment-PREVIEW rebind ----
  // A preview rebuilds the visual table WITHOUT reracking (table.js listens
  // to the 'ob:settings' equipment broadcast; game.js refreshNets rides the
  // same event). A ball already resting on the Predator plug is then resting
  // on a plug that no longer exists: rebinding the entry is not enough, the
  // MESH has to be repaired too, and because a landed ball already reports
  // pocketed=true, update()'s `else if (!b.pocketed)` hide branch can never
  // do it. Drive the real broadcast and read the real mesh.
  {
    const sp = corners.find((s) => s.x > 0 && s.z > 0);
    const kx = sp.z; const ky = sp.x;
    const ux = Math.sign(kx) * D; const uy = Math.sign(ky) * D;
    await chrome.eval('__test.pause(false)');
    await chrome.eval(`__test.layout([
      { id: 0, x: ${kx - 0.45 * ux}, y: ${ky - 0.45 * uy} },
      { id: 1, x: ${kx - 0.18 * ux}, y: ${ky - 0.18 * uy} },
    ])`);
    await sleep(300);
    const err = await chrome.eval(
      `__test.shoot({ v0: 1.8, phi: ${Math.atan2(uy, ux)}, theta: 0, a: 0, b: 0 })`);
    check('preview: shoot accepted', !err, String(err));
    await settle(chrome, 'preview shot');
    const ev = JSON.parse(await chrome.eval(`JSON.stringify(
      __test.events().filter((e) => e.kind && e.kind.BallPocket))`));
    check('preview: exactly one BallPocket event', ev.length === 1,
      `got ${ev.length}`);
    if (ev.length === 1) {
      const t0 = ev[0].t; const ballId = ev[0].kind.BallPocket.ball;
      const read = async () => JSON.parse(await chrome.eval(`JSON.stringify(
        __test.balls().find((bb) => bb.id === ${ballId}))`));
      // the real preview broadcast: the LIVE equipment tuple with only the
      // table axis moved, exactly what the settings picker emits.
      const swap = (id) => previewTable(chrome, id);
      await chrome.eval('__test.pause(true)');
      await chrome.eval(`__test.seek(${t0 + 0.6})`);
      const atRest = await read();
      check('preview: the ball is resting visibly before the swap',
        atRest.visible === true
        && Math.abs(atRest.pos[1] - seatY(sp, atRest.pos[0], atRest.pos[2])) < 1e-6,
        `visible ${atRest.visible} y ${atRest.pos[1].toFixed(6)}`);
      const wAtRest = JSON.parse(await chrome.eval(WELL_U(ballId))); // identity for the parked read
      await swap('diamond_proam_9ft');
      await sleep(1500);
      const gone = JSON.parse(await chrome.eval(`(async () => {
        const m = await import('/scene/table.js');
        const b = __test.balls().find((bb) => bb.id === ${ballId});
        return JSON.stringify({ ...b,
          closures: typeof m.sinkRestFor === 'function'
            && !!m.sinkRestFor(${sp.x}, ${sp.z}) });
      })()`));
      check('preview: the swapped-in table publishes no closure there',
        gone.closures === false, String(gone.closures));
      // THE ROW: no ball left hanging where the removed plug used to be.
      check('preview: the ball does not hang on the removed plug',
        gone.visible === false, `visible ${gone.visible}`);
      check('preview: it is parked in the GH-276 form',
        Math.abs(gone.pos[1] + 10) < 1e-9, gone.pos.join(','));
      // r8: parked on a build with no closure here = no cup to be shaded by
      // (read by mesh identity — every parked ball shares the park transform)
      const wGone = wAtRest?.uuid
        ? JSON.parse(await chrome.eval(WELL_BY_UUID(wAtRest.uuid))) : { mesh: false };
      check('preview: light — the parked ball has left the cup\'s shade',
        wGone.mesh === true && wGone.visible === false && wellOpen(wGone), wellStr(wGone));
      // and the revert restores the EXACT station it left (the entry was
      // rebound, not destroyed) — the next scrub re-poses it, which is the
      // documented convention for a hidden ball outside playback.
      await swap('predator_apex_9ft');
      await sleep(1500);
      await chrome.eval(`__test.seek(${t0 + 0.6})`);
      const back = await read();
      check('preview: the revert restores the exact rest pose',
        back.visible === true
        && JSON.stringify(back.pos) === JSON.stringify(atRest.pos)
        && JSON.stringify(back.quat) === JSON.stringify(atRest.quat),
        `visible ${back.visible} y ${back.pos[1].toFixed(6)}`);
      const wRevert = JSON.parse(await chrome.eval(WELL_U(ballId)));
      check('preview: light — the revert puts it back in the cup\'s shade',
        wellArmed(wRevert, sp), wellStr(wRevert));
    }
  }
  // ---- GH-626 review r2 P2: TWO balls into ONE closure ----
  // A follow scratch (straight full-ball pot with top spin) sends the cue in
  // behind the object ball: one shot, one corner, two pocket events. The
  // modelled well holds ONE ball at the flush depth — bindRests derives that
  // capacity from the crown-at-the-bed-plane rule — so the first arrival
  // rests and the overflow keeps the legacy drop lane, exactly the posture
  // the cn8 net slot pass already takes for ITS overflow. What must never
  // happen is the pre-fix behaviour: both meshes parked in one transform.
  {
    const sp = corners.find((s) => s.x > 0 && s.z > 0);
    const kx = sp.z; const ky = sp.x;
    const ux = Math.sign(kx) * D; const uy = Math.sign(ky) * D;
    await chrome.eval('__test.pause(false)');
    await chrome.eval(`__test.layout([
      { id: 0, x: ${kx - 0.50 * ux}, y: ${ky - 0.50 * uy} },
      { id: 1, x: ${kx - 0.20 * ux}, y: ${ky - 0.20 * uy} },
    ])`);
    await sleep(300);
    const err = await chrome.eval(`__test.shoot({ v0: 2.2, `
      + `phi: ${Math.atan2(uy, ux)}, theta: 0, a: 0, b: 0.35 })`);
    check('capacity: follow-scratch shoot accepted', !err, String(err));
    await settle(chrome, 'follow scratch');
    const ev = JSON.parse(await chrome.eval(`JSON.stringify(
      __test.events().filter((e) => e.kind && e.kind.BallPocket)
        .map((e) => ({ t: e.t, ...e.kind.BallPocket })))`));
    check('capacity: two balls into the SAME pocket in one shot',
      ev.length === 2 && ev[0].pocket === ev[1].pocket,
      JSON.stringify(ev));
    if (ev.length === 2 && ev[0].pocket === ev[1].pocket) {
      const first = ev[0].ball; const second = ev[1].ball;
      await chrome.eval('__test.pause(true)');
      // "at the station" is read against the seat under the pose's own plan
      const atSeat = (pp) => Math.abs(pp[1] - seatY(sp, pp[0], pp[2])) < 1e-6;
      const grid = [];
      for (let k = 0; k <= 30; k++) grid.push(ev[1].t + k * 0.04);
      const rows = [];
      for (const t of grid) {
        await chrome.eval(`__test.seek(${t})`);
        rows.push(JSON.parse(await chrome.eval(`JSON.stringify(
          __test.balls().filter((b) => b.id === ${first} || b.id === ${second})
            .map((b) => ({ id: b.id, v: b.visible, p: b.pos })))`)));
      }
      const at = (r, id) => r.find((x) => x.id === id);
      const late = rows.slice(-8);
      check('capacity: the FIRST arrival holds the plug rest',
        late.every((r) => at(r, first)?.v === true && atSeat(at(r, first).p)),
        JSON.stringify(late.at(-1)));
      // The cup's capacity is ONE at the flush depth, so the overflow ball
      // must never come to REST anywhere — not on the crest (checked below)
      // and not on a stacked station either. "At rest" is read as it looks:
      // two consecutive visible samples with an identical transform. (A
      // height test alone cannot do this job here: the stacked centre
      // ySurface + 3r is numerically the BED height, because ySurface is
      // exactly -2r — that is the whole point of the plug depth.)
      let frozen = false;
      for (let k = 1; k < rows.length; k++) {
        const a = at(rows[k - 1], second); const b = at(rows[k], second);
        if (a?.v && b?.v && JSON.stringify(a.p) === JSON.stringify(b.p)) {
          frozen = true;
        }
      }
      check('capacity: the overflow ball never comes to rest', !frozen);
      check('capacity: the two balls never share a transform',
        rows.every((r) => {
          const a = at(r, first); const b = at(r, second);
          if (!a?.v || !b?.v) return true;
          return Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1],
            a.p[2] - b.p[2]) > 1e-6;
        }));
      check('capacity: the overflow ball keeps the legacy drop-and-cull',
        late.every((r) => at(r, second)?.v === false),
        JSON.stringify(late.at(-1)));
      check('capacity: the overflow ball never rests on the plug crest',
        rows.every((r) => {
          const b = at(r, second);
          return !b?.v || !atSeat(b.p);
        }));

      // ---- review r3 P2: the station goes to the FIRST TOUCHDOWN ----
      // Capture order does not order arrivals. The drop duration at ONE
      // closure varies with entry — measured 112.2 / 113.3 / 117.1 / 117.5 /
      // 133.4 ms over v0 2.2-5.0 m/s at this corner — so whenever two pots
      // land inside that ~21 ms window the later capture can reach the crest
      // first, and the ball that physically gets there first is the one the
      // closure supports. Same law the B1 net slot pass already states for
      // its cradle. Read purely off the pose stream: the absolute clock at
      // which each drop first reaches the crest plane.
      const touchdown = async (id) => {
        const potT = ev.find((e) => e.ball === id).t;
        const probe = async (T) => {
          await chrome.eval(`__test.seek(${T})`);
          const b = JSON.parse(await chrome.eval(`JSON.stringify(
            __test.balls().find((x) => x.id === ${id}) ?? null)`));
          return !b || !b.visible
            || b.pos[1] <= seatY(sp, b.pos[0], b.pos[2]) + 1e-9;
        };
        let lo = potT; let hi = potT + 1.2;
        if (!(await probe(hi))) return null;
        for (let it = 0; it < 20; it++) {
          const mid = (lo + hi) / 2;
          if (await probe(mid)) hi = mid; else lo = mid;
        }
        return hi;
      };
      const holds = (id) => late.every((r) => at(r, id)?.v === true
        && atSeat(at(r, id).p));
      const resting = holds(first) ? first : (holds(second) ? second : null);
      const spilled = resting === first ? second : first;
      const tdRest = resting == null ? null : await touchdown(resting);
      const tdSpill = resting == null ? null : await touchdown(spilled);
      const say = (id, td) => `ball ${id} pot `
        + `${ev.find((e) => e.ball === id).t.toFixed(4)} touchdown `
        + `${td == null ? 'none' : td.toFixed(4)}`;
      check('capacity: both drops reach the crest plane',
        tdRest != null && tdSpill != null,
        `${say(resting, tdRest)} | ${say(spilled, tdSpill)}`);
      check('capacity: the station goes to the EARLIEST TOUCHDOWN',
        tdRest != null && tdSpill != null && tdRest < tdSpill,
        `${say(resting, tdRest)} | ${say(spilled, tdSpill)}`);

      // ---- review r2 P1: the rebind must not touch a LIVE ball ----
      // g.sinkInfo indexes the WHOLE record, so at a clock BETWEEN the two
      // pots the second ball's entry already exists while the ball itself is
      // still rolling on the bed. A preview that changes rest capability
      // must leave that mesh entirely alone — posing it from its (future)
      // sink entry would teleport a live ball into a pocket.
      const tMid = (ev[0].t + ev[1].t) / 2;
      await chrome.eval(`__test.seek(${tMid})`);
      const liveBefore = JSON.parse(await chrome.eval(`JSON.stringify(
        __test.balls().find((b) => b.id === ${second}))`));
      check('live: the second ball is still ON THE BED at the mid clock',
        liveBefore.visible === true && liveBefore.pos[1] > 0,
        `y ${liveBefore.pos[1].toFixed(6)}`);
      await previewTable(chrome, 'diamond_proam_9ft');
      await sleep(1500);
      const liveAfter = JSON.parse(await chrome.eval(`JSON.stringify(
        __test.balls().find((b) => b.id === ${second}))`));
      check('live: a preview does not teleport a not-yet-potted ball',
        liveAfter.visible === true
        && JSON.stringify(liveAfter.pos) === JSON.stringify(liveBefore.pos),
        `${JSON.stringify(liveBefore.pos)} -> ${JSON.stringify(liveAfter.pos)}`);
      await previewTable(chrome, 'predator_apex_9ft');
      await sleep(1500);
    }
  }
  // ---- skeptic item 1: the rest PERSISTS past the shot ----
  // The old settle() hid every non-netted pocketed ball. That presentation
  // was written for a ball that had fallen below the shield cull; a ball
  // resting on a modelled closure has its crown ON the bed plane and is
  // plainly on screen when it blinks out. Derived rule: it stays until the
  // cup is cleared (re-rack / layout / respot). Kernel state stays
  // Pocketed throughout. Read the REAL state machine, not a seek.
  {
    const sp = corners.find((s) => s.x > 0 && s.z > 0);
    const kx = sp.z; const ky = sp.x;
    const ux = Math.sign(kx) * D; const uy = Math.sign(ky) * D;
    // seat under a pose's own plan (face or vent rim — review r5)
    const atSeat = (pp) => Math.abs(pp[1] - seatY(sp, pp[0], pp[2])) < 1e-6;
    await chrome.eval('__test.pause(false)');
    await chrome.eval(`__test.layout([
      { id: 0, x: ${kx - 0.45 * ux}, y: ${ky - 0.45 * uy} },
      { id: 1, x: ${kx - 0.18 * ux}, y: ${ky - 0.18 * uy} },
    ])`);
    await sleep(300);
    const err = await chrome.eval(
      `__test.shoot({ v0: 1.8, phi: ${Math.atan2(uy, ux)}, theta: 0, a: 0, b: 0 })`);
    check('persist: shoot accepted', !err, String(err));
    await settle(chrome, 'persist shot');
    const ev = JSON.parse(await chrome.eval(`JSON.stringify(
      __test.events().filter((e) => e.kind && e.kind.BallPocket))`));
    check('persist: exactly one BallPocket event', ev.length === 1,
      `got ${ev.length}`);
    if (ev.length === 1) {
      const ballId = ev[0].kind.BallPocket.ball;
      const read = async (id = ballId) => JSON.parse(await chrome.eval(
        `JSON.stringify(__test.balls().find((bb) => bb.id === ${id}) ?? null)`));
      const st = await chrome.eval('__test.state()');
      check('persist: the shot has left PLAYBACK (real state machine)',
        st !== 'PLAYBACK' && st !== 'SETTLED', st);
      const rest0 = await read();
      // THE ROW the skeptic watched fail on d6b4dd2b: visible flipped to
      // false at the PLAYBACK->AIM transition with the ball at y=-0.028575.
      check(`persist: across PLAYBACK->${st} the ball is still VISIBLE on the plug`,
        rest0.visible === true && atSeat(rest0.pos),
        `visible ${rest0.visible} y ${rest0.pos[1].toFixed(6)}`);
      check('persist: it still reports pocketed (kernel truth; out of the action)',
        rest0.pocketed === true);
      const wKept = JSON.parse(await chrome.eval(WELL_U(ballId)));
      check('persist: light — the retained ball keeps the cup\'s shade past PLAYBACK->AIM',
        wellArmed(wKept, sp), wellStr(wKept));
      // a DVR scrub: back across the pot (the ball is live on the bed again,
      // pocketed=false) and forward past it (re-posed on the plug WITHOUT a
      // settle). The next shot must still find the cup HELD — retainRests
      // reads the meshes at the teardown, so the occupancy does not hinge
      // on settle() having been the last writer.
      const t0 = ev[0].t;
      await chrome.eval('__test.pause(true)');
      await chrome.eval(`__test.seek(${t0 - 0.1})`);
      const back = await read();
      check('scrub: seeking back across the pot puts the ball on the bed (pocketed=false)',
        back.visible === true && back.pocketed === false && back.pos[1] > 0,
        `visible ${back.visible} pocketed ${back.pocketed} y ${back.pos[1].toFixed(4)}`);
      const wBack = JSON.parse(await chrome.eval(WELL_U(ballId)));
      check('scrub: light — back on the bed the ball is out of the cup\'s shade',
        wellOpen(wBack), wellStr(wBack));
      await chrome.eval(`__test.seek(${t0 + 0.9})`);
      const fwd = await read();
      check('scrub: seeking forward re-poses it on the plug (same pose, no settle)',
        fwd.visible === true && fwd.pocketed === true
        && JSON.stringify(fwd.pos) === JSON.stringify(rest0.pos)
        && JSON.stringify(fwd.quat) === JSON.stringify(rest0.quat),
        `visible ${fwd.visible} y ${fwd.pos[1].toFixed(6)}`);
      const wFwd = JSON.parse(await chrome.eval(WELL_U(ballId)));
      check('scrub: light — forward on the plug it is back in the cup\'s shade',
        wellArmed(wFwd, sp), wellStr(wFwd));
      await chrome.eval('__test.pause(false)');
      // a SUBSEQUENT shot, from wherever the pot left the cue ball, rolled
      // straight at the HELD cup — one shot proves both laws: the rest is
      // untouched by the next record, and the second ball overflows.
      const cue = await read(0);
      check('persist: the cue ball is live on the bed for the next shot',
        cue.visible === true && cue.pocketed === false && cue.pos[1] > 0,
        JSON.stringify(cue));
      const cx = cue.pos[2]; const cy = cue.pos[0]; // kernel frame
      const phi2 = Math.atan2(ky - cy, kx - cx);
      const err2 = await chrome.eval(
        `__test.shoot({ v0: 1.6, phi: ${phi2}, theta: 0, a: 0, b: 0 })`);
      check('persist: a subsequent shot is accepted while the ball rests',
        !err2, String(err2));
      let untouched = true; let n = 0; let inPlayback = 0;
      for (let i = 0; i < 12; i++) {
        await sleep(120);
        const b = await read();
        if (await chrome.eval('__test.state()') === 'PLAYBACK') inPlayback += 1;
        n += 1;
        if (!(b.visible === true && b.pocketed === true
          && JSON.stringify(b.pos) === JSON.stringify(rest0.pos)
          && JSON.stringify(b.quat) === JSON.stringify(rest0.quat))) {
          untouched = false;
        }
      }
      check('persist: live samples were taken DURING the next playback',
        inPlayback > 0, `${inPlayback}/${n}`);
      check('persist: through the next shot the rest is untouched '
        + '(visible, pocketed, pose AND orientation)', untouched, `${n} samples`);
      await settle(chrome, 'subsequent shot');
      const ev2 = JSON.parse(await chrome.eval(`JSON.stringify(
        __test.events().filter((e) => e.kind && e.kind.BallPocket)
          .map((e) => ({ t: e.t, ...e.kind.BallPocket })))`));
      const cueIn = ev2.find((e) => e.ball === 0);
      check('occupied: the subsequent shot sends the cue ball into the HELD cup (staging)',
        !!cueIn && ev2.length === 1, JSON.stringify(ev2));
      const rest1 = await read();
      check('persist: after the SECOND settle the ball still rests on the plug',
        rest1.visible === true && rest1.pocketed === true
        && JSON.stringify(rest1.pos) === JSON.stringify(rest0.pos),
        `visible ${rest1.visible} y ${rest1.pos[1].toFixed(6)}`);
      if (cueIn) {
        // the cup is held and its derived capacity is one: the second ball
        // must take the legacy lane — never the station, never a shared
        // transform, culled below the shield — and its seek() must not
        // move the retained ball (which is not in this record at all).
        await chrome.eval('__test.pause(true)');
        const rows = [];
        for (let k = 0; k <= 30; k++) {
          await chrome.eval(`__test.seek(${cueIn.t + k * 0.04})`);
          rows.push(JSON.parse(await chrome.eval(`JSON.stringify(
            __test.balls().filter((b) => b.id === 0 || b.id === ${ballId})
              .map((b) => ({ id: b.id, v: b.visible, p: b.pos, q: b.quat })))`)));
        }
        const at = (r, id) => r.find((x) => x.id === id);
        check('occupied: the second ball never rests on the held station',
          rows.every((r) => { const c = at(r, 0);
            return !c?.v || !atSeat(c.p); }));
        let frozen = false;
        for (let k = 1; k < rows.length; k++) {
          const a = at(rows[k - 1], 0); const b = at(rows[k], 0);
          if (a?.v && b?.v && JSON.stringify(a.p) === JSON.stringify(b.p)) frozen = true;
        }
        check('occupied: the second ball never comes to rest (legacy lane)', !frozen);
        check('occupied: the two balls never share a transform',
          rows.every((r) => { const a = at(r, 0); const b = at(r, ballId);
            if (!a?.v || !b?.v) return true;
            return Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]) > 1e-6; }));
        check('occupied: the second ball is culled below the shield (legacy lane)',
          rows.slice(-8).every((r) => at(r, 0)?.v === false),
          JSON.stringify(rows.at(-1)));
        check('persist: seeking the next record never moves the retained ball',
          rows.every((r) => { const b = at(r, ballId);
            return b?.v === true && JSON.stringify(b.p) === JSON.stringify(rest0.pos)
              && JSON.stringify(b.q) === JSON.stringify(rest0.quat); }));
        await chrome.eval('__test.pause(false)');
      }
      // ---- review r4/r6 P2: the GH-257 Playback borrow/restore round trip
      // (fresh pairing — the exact carrier; the stale pairing runs the same
      // rows below over an intercepted pre-GH-626 playback.js) ----
      await borrowRoundTrip(chrome, { label: 'fresh playback.js', sp, ballId,
        rest0, kx, ky });
      // the cup clears WITH the rack: the retained mesh is disposed and the
      // new ball 1 is back in the rack, on the bed.
      await chrome.eval('__test.rerack(7)');
      await sleep(600);
      const racked = await read();
      check('rerack: the ball is back on the bed (pocketed=false, y=+r)',
        racked !== null && racked.pocketed === false && racked.visible === true
        && Math.abs(racked.pos[1] - R) < 1e-6,
        JSON.stringify(racked));
      const wRacked = JSON.parse(await chrome.eval(WELL_U(ballId)));
      check('rerack: light — the racked ball carries no cup',
        wellOpen(wRacked), wellStr(wRacked));
      // anything between the plug crest and the flat datum is resting in a well
      const anyAtStation = JSON.parse(await chrome.eval(`JSON.stringify(
        __test.balls().filter((b) => b.pos[1] >= ${sp.ySurface}
          && b.pos[1] <= ${sp.ySurface + R} + 1e-6))`));
      check('rerack: nothing is left resting on the plug', anyAtStation.length === 0,
        JSON.stringify(anyAtStation));
    }
  }
} finally {
  const gone = await chrome.closeAndWait();
  if (gone === false) console.error('WARN: chrome teardown unconfirmed');
}

// ============ review r6: the REVERSE mixed-cache pairing ============
// A fresh game.js under a CACHED pre-GH-626 playback.js: the old close path
// restores pose/flags by id and calls syncShadows — no carrier — so the game
// side must reconstruct the occupancy from the restored mesh (refreshNets
// adoption; the ownership ledger: both pairings degrade WORKING). Staged exactly like
// e2e-playback arm 6: the served playback.js is THIS tree's own with the
// `rests:` capture removed (asserted present first, so a refactor cannot make
// the arm vacuous), fulfilled over CDP Fetch interception on a second Chrome;
// nothing else differs. The rows are the fresh arm's, over this pairing.
{
  const src = await fs.readFile(path.join(webDir, 'app', 'playback.js'), 'utf8');
  const cap = /\n[ \t]*rests: typeof game\.snapshotRests === 'function'\n[ \t]*\? game\.snapshotRests\(\) : null,/.exec(src);
  check('stale: the tree carries the snapLive rests capture to strip (the arm is not vacuous)',
    !!cap);
  if (cap) {
    const staleBody = src.replace(cap[0], '\n');
    const staleUrl = `http://127.0.0.1:${PORT}/app.html?table=predator_apex_9ft`
      + '&cinema=1&seed=7&archive=1';
    const chrome2 = await launchChrome(`${staleUrl}&arm=stale-pre`,
      { port: pinned ? CDP + 1 : band.cdp(1) });
    try {
      let served = 0;
      chrome2.onEvent((method, params) => {
        if (method !== 'Fetch.requestPaused') return;
        if (params.request.url.includes('app/playback.js')) {
          served += 1;
          chrome2.send('Fetch.fulfillRequest', {
            requestId: params.requestId, responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
            body: Buffer.from(staleBody).toString('base64'),
          }).catch(() => {});
        } else {
          chrome2.send('Fetch.continueRequest', { requestId: params.requestId })
            .catch(() => {});
        }
      });
      await chrome2.send('Fetch.enable', { patterns: [{ urlPattern: '*playback.js*' }] });
      await chrome2.send('Network.enable');
      await chrome2.send('Network.setCacheDisabled', { cacheDisabled: true });
      await chrome2.send('Page.navigate', { url: `${staleUrl}&arm=stale` });
      await sleep(800); // the old document is gone before ready() polls
      await ready(chrome2);
      await sleep(1500);
      check('stale: the intercepted (pre-GH-626) playback.js was the one served',
        served > 0, `served ${served}`);
      let seam = false;
      for (let i = 0; i < 50 && !seam; i++) {
        seam = await chrome2.eval(
          'typeof window.__playback?.openSession === "function"').catch(() => false);
        if (!seam) await sleep(200);
      }
      check('stale: the player seam is up on the stale module', seam);
      const specs2 = JSON.parse(await chrome2.eval(SCAN));
      const sp = (specs2 ?? []).find((q) => q.x > 0.1 && q.z > 0);
      check('stale: predator publishes the corner closure (staging)', !!sp);
      if (seam && sp) {
        const kx = sp.z; const ky = sp.x;
        const ux = Math.sign(kx) * D; const uy = Math.sign(ky) * D;
        await chrome2.eval(`__test.layout([
          { id: 0, x: ${kx - 0.45 * ux}, y: ${ky - 0.45 * uy} },
          { id: 1, x: ${kx - 0.18 * ux}, y: ${ky - 0.18 * uy} },
        ])`);
        await sleep(300);
        const err = await chrome2.eval(
          `__test.shoot({ v0: 1.8, phi: ${Math.atan2(uy, ux)}, theta: 0, a: 0, b: 0 })`);
        check('stale: shoot accepted', !err, String(err));
        await settle(chrome2, 'stale pot');
        const ev = JSON.parse(await chrome2.eval(`JSON.stringify(
          __test.events().filter((e) => e.kind && e.kind.BallPocket))`));
        check('stale: exactly one BallPocket event', ev.length === 1, `got ${ev.length}`);
        if (ev.length === 1) {
          const ballId = ev[0].kind.BallPocket.ball;
          const rest0 = JSON.parse(await chrome2.eval(`JSON.stringify(
            __test.balls().find((bb) => bb.id === ${ballId}) ?? null)`));
          check('stale: the ball rests visibly on the plug before the open',
            rest0.visible === true && rest0.pocketed === true
            && Math.abs(rest0.pos[1] - seatY(sp, rest0.pos[0], rest0.pos[2])) < 1e-6,
            `visible ${rest0.visible} y ${rest0.pos[1].toFixed(6)}`);
          // A SECOND shot, so the pre-open record no longer contains the
          // resting ball — the finding's "pocketed in an EARLIER shot". With
          // a single-shot session the pre-open record IS the potting record
          // and the close-side retainRests() re-derives the occupancy from
          // it natively (measured: the pre-r6 game.js passed the arm that
          // way). The cue rolls gently AWAY from the corner; nothing is
          // potted (0.4 m/s rolls under a metre — a 1.0 m/s stroke reached
          // the far corner, measured), the rest is untouched.
          const cue1 = JSON.parse(await chrome2.eval(
            'JSON.stringify(__test.balls().find((bb) => bb.id === 0) ?? null)'));
          check('stale: the cue is live on the bed for the second shot (staging)',
            cue1?.visible === true && cue1.pocketed === false, JSON.stringify(cue1));
          const err2 = await chrome2.eval(
            `__test.shoot({ v0: 0.4, phi: ${Math.atan2(-uy, -ux)}, theta: 0, a: 0, b: 0 })`);
          check('stale: the second shot is accepted', !err2, String(err2));
          await settle(chrome2, 'stale second shot');
          const ev2 = JSON.parse(await chrome2.eval(`JSON.stringify(
            __test.events().filter((e) => e.kind && e.kind.BallPocket))`));
          check('stale: the second shot pots nothing (the pre-open record excludes the resting ball)',
            ev2.length === 0, `got ${ev2.length}`);
          const rest1 = JSON.parse(await chrome2.eval(`JSON.stringify(
            __test.balls().find((bb) => bb.id === ${ballId}) ?? null)`));
          check('stale: the rest survives the second shot (persistence, pre-open)',
            rest1.visible === true && rest1.pocketed === true
            && JSON.stringify(rest1.pos) === JSON.stringify(rest0.pos),
            `visible ${rest1.visible} y ${rest1.pos[1].toFixed(6)}`);
          await borrowRoundTrip(chrome2, { label: 'stale playback.js', sp, ballId,
            rest0, kx, ky });
        }
      }
    } finally {
      await chrome2.send('Fetch.disable').catch(() => {});
      const gone2 = await chrome2.closeAndWait();
      if (gone2 === false) console.error('WARN: stale-arm chrome teardown unconfirmed');
    }
  }
}

// ===================== EVERY OTHER FAMILY =====================
// No closure published, and the historical fall-and-cull is untouched.
for (const id of ['diamond_proam_9ft', 'wpa_generic_9ft', 'wpbsa_snooker_12ft',
  'chinese8_pro_9ft']) {
  chrome = await launchChrome(
    `http://127.0.0.1:${PORT}/app.html?table=${id}&cinema=1&seed=7`,
    { port: CDP });
  try {
    await ready(chrome);
    await sleep(1200);
    const specs = JSON.parse(await chrome.eval(SCAN));
    check(`${id}: publishes no closure anywhere on the bed`,
      Array.isArray(specs) && specs.length === 0,
      Array.isArray(specs) ? `${specs.length} specs` : String(specs));
    // the drop still ends the historical way: a family with no closure
    // either culls at the shield (open cup) or is caught by its own net.
    // Stage off the BUILT table's own side pocket (scene TABLE.pockets,
    // three frame; kernel.x = three.z) so no family needs a hardcode.
    const sidePocket = JSON.parse(await chrome.eval(`(async () => {
      const m = await import('/scene/table.js');
      const p = m.TABLE.pockets.filter((q) => Math.abs(q.x) < 0.1)
        .sort((a, b) => b.z - a.z)[0];
      return JSON.stringify(p ?? null);
    })()`));
    check(`${id}: has a side pocket to stage against`, !!sidePocket,
      String(sidePocket));
    if (!sidePocket) continue;
    const kx = sidePocket.z; // kernel x of the +z side pocket
    await chrome.eval(`__test.layout([
      { id: 0, x: ${kx - 0.60}, y: 0 },
      { id: 1, x: ${kx - 0.28}, y: 0 },
    ])`);
    await sleep(300);
    const err = await chrome.eval(
      '__test.shoot({ v0: 2.4, phi: 0, theta: 0, a: 0, b: 0 })');
    check(`${id}: shoot accepted`, !err, String(err));
    await settle(chrome, `${id} shot`);
    const ev = JSON.parse(await chrome.eval(`JSON.stringify(
      __test.events().filter((e) => e.kind && e.kind.BallPocket))`));
    if (ev.length !== 1) {
      check(`${id}: side pot lands (staging)`, false, `got ${ev.length}`);
      continue;
    }
    check(`${id}: side pot lands (staging)`, true);
    const t0 = ev[0].t;
    const ballId = ev[0].kind.BallPocket.ball;
    await chrome.eval('__test.pause(true)');
    let hidden = 0; let minY = Infinity;
    for (let k = 0; k <= 50; k++) {
      await chrome.eval(`__test.seek(${t0 + k * 0.015})`);
      const b = JSON.parse(await chrome.eval(`JSON.stringify(
        __test.balls().find((bb) => bb.id === ${ballId}))`));
      if (!b.visible) hidden += 1; else minY = Math.min(minY, b.pos[1]);
    }
    check(`${id}: the open-cup drop still passes the plug depth (no closure)`,
      minY < PLUG_TOP + R || hidden > 0,
      `minY ${minY.toFixed(5)} hidden ${hidden}`);
    // and settle() still ends the way it always did where no closure is
    // declared: hidden — unless this family NETS the ball (the B1 cn8 law,
    // read off the built table's own dressing, never assumed).
    await chrome.eval('__test.pause(false)');
    await settle(chrome, `${id} settle`);
    const netted = await chrome.eval(`(async () => {
      const m = await import('/scene/table.js');
      return !!(m.sinkDressFor && m.sinkDressFor(${sidePocket.x}, ${sidePocket.z})?.net);
    })()`);
    const settled = JSON.parse(await chrome.eval(`JSON.stringify(
      __test.balls().find((bb) => bb.id === ${ballId}))`));
    check(`${id}: after settle the potted ball is ${netted ? 'netted (visible)' : 'hidden'} `
      + 'exactly as before GH-626', settled.pocketed === true
      && settled.visible === netted,
      `visible ${settled.visible} netted ${netted} y ${settled.pos[1].toFixed(4)}`);
    // r8: no closure published here, so no ball — netted or hidden — wears
    // a cup's transport (the slot exists on every ball and stays open)
    const wOther = JSON.parse(await chrome.eval(WELL_U(netted ? ballId : 0)));
    check(`${id}: light — the transport slot stays open where no closure is published`,
      wellOpen(wOther), wellStr(wOther));
  } finally {
    const gone = await chrome.closeAndWait();
    if (gone === false) console.error('WARN: chrome teardown unconfirmed');
  }
}

await stopStaticServer(server);
band?.release();
console.log(failures ? `${failures} FAILURES` : 'ALL PASS');
process.exit(failures ? 1 : 0);
