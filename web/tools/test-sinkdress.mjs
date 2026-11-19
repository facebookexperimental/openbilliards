// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-sinkdress.mjs — GH-490 r24 focused oracle for the ROUND-23 sink
// DRESSING (game.js poseSink dressed branch + scene/table.js sinkDressFor).
// The gate r21 coverage note: the passing test-sinkpivot battery exercises
// the byte-untouched pivot module, not the dressing — this oracle drives
// the REAL app deterministically and checks the dressed drop's contract:
//
//   spec     sinkDressFor letters on the built cn8 table (corner spec
//            with the r23 record letters; side pockets + non-corner
//            queries null — the undressed bit-identical degrade).
//   seat     once the squeeze completes, the ball centre sits ON the
//            ring plane (yRing = -0.0238) over the visual hole centre.
//   squeeze  scale runs 1 -> 0.985*rHole/r monotonically, never below.
//   release  past the seat plateau the centre falls on the 0.5*g*t^2
//            parabola (constant second difference -g*dt^2) down to the
//            net catch station.
//   net      GH-490 BLOCKER-CURE B1 (the despawn-at-the-throat defect):
//            with the table's net-receive capability (dress.net) the
//            ball is CAUGHT by the sock (damped settle inside the sag
//            budget), RESTS VISIBLY in the net for any dt (no shield
//            cull on the netted lane), and the sock geometry DEFORMS
//            around it — restoring to its pristine base buffer when
//            the ball scrubs back out (pure function of posed state).
//            (The pre-B1 cull rows re-lettered to this law — the old
//            contract WAS the finale blocker.)
//   purity   poseSink is a pure function of (entry, dt): seek() is
//            random-access — re-seeking any t reproduces the pose
//            bit-identically, forward or backward.
//   side     a side-pocket pot keeps the legacy undressed drop (scale
//            stays exactly 1 — sinkDressFor null gates the branch).
//
//   node web/tools/test-sinkdress.mjs   (OB_E2E_PORT/OB_E2E_CDP_PORT pin
//   the ports; run under the lane band.)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 16528);
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 16529);

// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
};

const R = 0.028575;
const G = 9.8;

const server = spawnStaticServer(webDir, PORT);
await sleep(700);
const chrome = await launchChrome(
  `http://127.0.0.1:${PORT}/app.html?table=chinese8_pro_9ft&cinema=1&seed=7`,
  { port: CDP });
try {
  for (let i = 0; i < 200; i++) {
    await sleep(200);
    if (await chrome.eval('window.__test?.ready === true').catch(() => false)) break;
    if (i === 199) throw new Error('app never became ready');
  }
  await sleep(1500);

  // ---- spec letters (sinkDressFor on the built table) ----
  const specs = JSON.parse(await chrome.eval(`(async () => {
    const m = await import('/scene/table.js');
    // B1: the net capability carries FUNCTIONS (restAt/deform) — JSON
    // drops them, so the probe serializes typed flags + sampled rests.
    const q = (x, z) => {
      const c = m.sinkDressFor(x, z);
      if (!c) return c;
      return { ...c,
        net: c.net ? {
          yRest: c.net.yRest, slotDy: c.net.slotDy, sagMax: c.net.sagMax,
          capacity: c.net.capacity,
          hasDeform: typeof c.net.deform === 'function',
          hasRestAt: typeof c.net.restAt === 'function',
          rest0: c.net.restAt(0), rest1: c.net.restAt(1),
        } : null };
    };
    return JSON.stringify({
      corner: q(1.318, 0.678),
      cornerNeg: q(-1.318, -0.678),
      side: q(0, 0.682),
      far: q(0, 0),
    });
  })()`));
  const sp = specs.corner;
  check('spec: corner query returns a dressing spec', !!sp);
  if (sp) {
    // GH-490 MOUTH GRAFT (rev8_6 internal amendment MOUTH-FALL-3,
    // docs/fidelity/490-internal-amendment-ledger.md): the r31 seat law
    // RETIRES — the fall aperture is BALL-PASSING (R_FALL 29 > ball r
    // 28.575, the photographs' own measured aperture), so rHole is the
    // real aperture and yRing is NULL (√(r² − a²) is imaginary for
    // a ≥ r: nothing holds the ball up; the dressed drop keeps rolling
    // height until support is lost and releases at SEAT ARRIVAL —
    // the owner-named park is the cured defect).  The visual hole
    // centre O_f law is unchanged.
    check('spec: rHole keeps the LEGACY squeeze value (stale-cache law)',
      Math.abs(sp.rHole - 0.0285) < 1e-6, String(sp.rHole));
    check('spec: rFall fall aperture 0.029 (rev8_6 capability)',
      Math.abs(sp.rFall - 0.029) < 1e-6, String(sp.rFall));
    check('spec: yRingOpen capability — a ball-passing fall has no seat',
      sp.yRingOpen === true, String(sp.yRingOpen));
    check('spec: yRing keeps the LEGACY numeric seat (stale-cache law)',
      Math.abs(sp.yRing - 0.0222) < 1e-6, String(sp.yRing));
    // B1 net-receive capability letters
    check('spec: net capability present (B1 net receive)',
      !!sp.net && sp.net.hasDeform && sp.net.hasRestAt);
    if (sp.net) {
      check('spec: net rest station −0.122 (sock cradle letter)',
        Math.abs(sp.net.yRest - -0.122) < 1e-6, String(sp.net.yRest));
      check('spec: net sag budget 12 mm', Math.abs(sp.net.sagMax - 0.012) < 1e-6);
      check('spec: slot-0 rest centres on O_f',
        Math.abs(sp.net.rest0.x - sp.hx) < 1e-9
        && Math.abs(sp.net.rest0.z - sp.hz) < 1e-9
        && Math.abs(sp.net.rest0.y - sp.net.yRest) < 1e-9);
      check('spec: slot ladder nests upward (slotDy)',
        Math.abs(sp.net.rest1.y - (sp.net.yRest + sp.net.slotDy)) < 1e-9);
      check('spec: slot ladder is ball-diameter spaced (review r1 P2)',
        sp.net.slotDy >= 2 * R - 1e-6, String(sp.net.slotDy));
      check('spec: net capacity 2 (overflow keeps the legacy lane)',
        sp.net.capacity === 2);
    }
    check('spec: rMouth letter R-1mm 0.0515',
      Math.abs(sp.rMouth - 0.0515) < 1e-6, String(sp.rMouth));
    const off = Math.hypot(sp.hx - sp.x, sp.hz - sp.z);
    // Catalog v16 (PR #588, ADR-0015 single source): the kernel capture
    // disc moved from the retired O_m (slate-edge + 3.5 mm figure) onto
    // the drawing O_f — the visible bed hole, the drop-steer target and
    // the capture disc are now the SAME circle, so the O_m->O_f offset
    // this oracle was born asserting (sqrt2*(0.0481066-0.0035), the v15
    // split-datum construction) collapses to zero BY DESIGN.
    check('spec: visual hole centre coincides with the capture centre (v16 O_f convergence)',
      off < 1e-6, off.toFixed(4));
  }
  check('spec: mirrored corner spec exists', !!specs.cornerNeg);
  check('spec: side pocket query is null (undressed degrade)',
    specs.side === null);
  check('spec: bed-centre query is null', specs.far === null);

  // ---- deterministic corner pot: cue and object ON the corner
  // diagonal (staging probe rounds 1-2: an 18-degrees-off straight
  // entry rattles OUT of the tight Chinese-8 kernel jaws — the pot
  // must ride the mouth centreline) ----
  const CORNER = { kx: 0.678, ky: 1.318 };
  const D = Math.SQRT1_2;
  await chrome.eval(`__test.layout([
    { id: 0, x: ${CORNER.kx - 0.45 * D}, y: ${CORNER.ky - 0.45 * D} },
    { id: 1, x: ${CORNER.kx - 0.18 * D}, y: ${CORNER.ky - 0.18 * D} },
  ])`);
  await sleep(300);
  const err = await chrome.eval(
    `__test.shoot({ v0: 1.8, phi: ${Math.PI / 4}, theta: 0, a: 0, b: 0 })`);
  check('pot: shoot accepted', !err, String(err));
  for (let i = 0; i < 300; i++) {
    await sleep(200);
    const st = await chrome.eval('__test.state()');
    if (st === 'SETTLED' || st === 'AIM') break;
    if (i === 299) throw new Error('shot never settled');
  }
  const ev = JSON.parse(await chrome.eval(`JSON.stringify(
    __test.events().filter((e) => e.kind && e.kind.BallPocket))`));
  check('pot: exactly one BallPocket event', ev.length === 1,
    `got ${ev.length}`);
  // B1 settle persistence (review blocker-cure r1 P1): the SETTLED state
  // keeps the netted ball visible at its rest pose — a final-event pot
  // used to be hidden ~0.01 s after its catch.
  {
    const bSet = JSON.parse(await chrome.eval(`JSON.stringify(
      __test.balls().find((bb) => bb.id === ${ev[0].kind.BallPocket.ball}))`));
    check('settle: netted ball persists visible at the rest station',
      bSet && bSet.visible && Math.abs(bSet.pos[1] - -0.122) < 0.002,
      bSet ? `visible ${bSet.visible} y ${bSet.pos[1].toFixed(4)}` : 'missing');
  }
  if (ev.length !== 1) throw new Error('staging failed — no pot');
  const t0 = ev[0].t;
  const ballId = ev[0].kind.BallPocket.ball;

  // B1: pristine sock baseline for the deform purity rows — the potted
  // corner's sock (the +/+ O_f), sampled before any seek touches it.
  const sockProbe = `(() => {
    let m = null;
    window.__dbg.scene.traverse((o) => {
      if (/^cn8-net-low-/.test(o.name || '') && o.position.x > 0
        && o.position.z > 0) m = o;
    });
    if (!m) return 'none';
    const a = m.geometry.getAttribute('position').array;
    let s = 0;
    for (let i = 0; i < a.length; i += 7) s += a[i];
    return s.toFixed(6);
  })()`;
  await chrome.eval('__test.pause(true)');
  await chrome.eval(`__test.seek(${Math.max(0, t0 - 0.05)})`);
  const sockBase = await chrome.eval(sockProbe);
  check('net: sock probe finds the corner sock', sockBase !== 'none');

  // ---- seek grid through the sink (extended into the netted rest) ----
  const grid = [];
  for (let k = 0; k <= 70; k++) grid.push(t0 + k * 0.015);
  const poses = [];
  for (const t of grid) {
    await chrome.eval(`__test.seek(${t})`);
    const b = JSON.parse(await chrome.eval(`JSON.stringify(
      __test.balls().find((bb) => bb.id === ${ballId}))`));
    poses.push({ t, dt: t - t0, ...b });
  }
  const scMin = Math.min(1, 0.985 * ((sp.rFall ?? sp.rHole) / R)); // ≈0.9997
  const vis = poses.filter((p) => p.visible);
  check('sink: ball visible through the dressed drop', vis.length >= 8,
    `${vis.length} visible samples`);

  // squeeze: monotone non-increasing to the ring scale, never below
  let mono = true;
  let below = false;
  for (let i = 1; i < vis.length; i++) {
    if (vis[i].scale > vis[i - 1].scale + 1e-9) mono = false;
    if (vis[i].scale < scMin - 1e-6) below = true;
  }
  check('squeeze: scale monotone non-increasing', mono);
  check(`squeeze: floor is the ring scale ${scMin.toFixed(4)}`, !below);
  const seated = vis.filter((p) => p.scale <= scMin + 1e-6);
  check('squeeze: reaches the full ring squeeze', seated.length >= 3,
    `${seated.length} seated samples`);

  // seat-arrival release (rev8_6 + spike §12.9, THE PARK ORACLE): a
  // ball-passing fall has no seat — from the first fully-over-the-
  // aperture sample the centre must DESCEND every subsequent visible
  // sample (the retired 0.62·ttl schedule parked an early arrival
  // motionless on the ring plane for ~8 frames).
  const arrive = vis.findIndex((p) => p.scale <= scMin + 1e-6
    && Math.hypot(p.pos[0] - sp.hx, p.pos[2] - sp.hz) < 0.004);
  check('park: seat arrival exists in the grid', arrive >= 0);
  // B1: the descent contract runs from seat arrival DOWN TO THE NET
  // CATCH (yTouch = rest + 6 mm) — past the catch the damped settle
  // legitimately rebounds, so the old every-subsequent-sample law
  // re-letters to the pre-catch window.
  const yTouch = (sp.net ? sp.net.yRest : -1) + 0.006;
  if (arrive >= 0) {
    const after = vis.slice(arrive)
      .filter((p) => p.pos[1] > yTouch + 1e-6);
    let still = 0;
    for (let i = 1; i < after.length; i++) {
      if (after[i].pos[1] > after[i - 1].pos[1] - 1e-6) still += 1;
    }
    check('park: zero motionless samples between seat and net catch',
      still === 0, `${still} non-descending steps`);
    const dTail = after.slice(-3).map((p) =>
      Math.hypot(p.pos[0] - sp.hx, p.pos[2] - sp.hz));
    check('park: the fall stays centred on the visual hole (O_f)',
      dTail.every((d) => d < 0.002),
      dTail.map((d) => d.toFixed(4)).join(','));
  }

  // release: constant-gravity parabola (second difference -g*dt^2),
  // lettered on the pre-catch window (B1: the shaft run ends at the
  // sock, not at a cull)
  const rel = seated.filter((p) => p.pos[1] < R - 1e-4
    && p.pos[1] > yTouch + 0.002);
  check('release: ball releases down the shaft', rel.length >= 3,
    `${rel.length} samples`);
  if (rel.length >= 3) {
    const dtStep = 0.015;
    let parab = true;
    for (let i = 2; i < rel.length; i++) {
      if (rel[i].dt - rel[i - 1].dt > dtStep + 1e-9
        || rel[i - 1].dt - rel[i - 2].dt > dtStep + 1e-9) continue;
      const d2 = (rel[i].pos[1] - rel[i - 1].pos[1])
        - (rel[i - 1].pos[1] - rel[i - 2].pos[1]);
      if (Math.abs(d2 - -G * dtStep * dtStep) > 0.0008) parab = false;
    }
    check('release: 0.5*g*t^2 parabola (constant second difference)', parab);
    check('release: squeeze holds through the shaft',
      rel.every((p) => Math.abs(p.scale - scMin) < 1e-6));
  }

  // ---- B1 NET RECEIVE (re-letters the retired cull rows: the old
  // shield-line despawn WAS finale blocker B1) ----
  check('net: ball never hides — the net receives and keeps it',
    poses.every((p) => p.visible),
    `${poses.filter((p) => !p.visible).length} hidden samples`);
  const tail = poses.slice(-4);
  check('net: settles to the slot-0 rest station',
    tail.every((p) => Math.abs(p.pos[1] - sp.net.yRest) < 0.002),
    tail.map((p) => p.pos[1].toFixed(4)).join(','));
  check('net: rest is motionless (settled)',
    tail.every((p) => Math.abs(p.pos[1] - tail[0].pos[1]) < 5e-4
      && Math.hypot(p.pos[0] - tail[0].pos[0], p.pos[2] - tail[0].pos[2]) < 5e-4));
  check('net: rest plan centres on the slot-0 rest',
    Math.hypot(tail[3].pos[0] - sp.net.rest0.x,
      tail[3].pos[2] - sp.net.rest0.z) < 0.002);
  check('net: never below the sag budget',
    poses.every((p) => p.pos[1] > sp.net.yRest - sp.net.sagMax - 5e-4));
  // deform: the sock moved around the resting ball, and scrubbing back
  // BEFORE the pocket event restores the pristine base buffer
  const sockAtRest = await chrome.eval(sockProbe);
  check('net: sock deforms around the resting ball',
    sockAtRest !== sockBase, `${sockAtRest} vs ${sockBase}`);
  await chrome.eval(`__test.seek(${Math.max(0, t0 - 0.05)})`);
  const sockBack = await chrome.eval(sockProbe);
  check('net: scrub-back restores the pristine sock (deform purity)',
    sockBack === sockBase, `${sockBack} vs ${sockBase}`);
  await chrome.eval(`__test.seek(${grid[grid.length - 1]})`);

  // purity: random-access seek reproduces poses bit-identically
  const lastVis = poses.length - 1;
  const probeIdx = [Math.floor(vis.length / 2), lastVis];
  let pure = true;
  for (const i of probeIdx) {
    const want = poses[i];
    await chrome.eval(`__test.seek(${t0 + 0.9})`); // jump forward
    await chrome.eval(`__test.seek(${want.t})`);   // seek BACK
    const again = JSON.parse(await chrome.eval(`JSON.stringify(
      __test.balls().find((bb) => bb.id === ${ballId}))`));
    if (JSON.stringify(again.pos) !== JSON.stringify(want.pos)
      || again.scale !== want.scale || again.visible !== want.visible
      || JSON.stringify(again.quat) !== JSON.stringify(want.quat)) {
      pure = false;
    }
  }
  check('purity: seek() random-access reproduces poses bit-identically',
    pure);

  // ---- side pocket: the undressed legacy drop (scale stays 1) ----
  await chrome.eval('__test.pause(false)');
  await chrome.eval(`__test.layout([
    { id: 0, x: 0.2, y: 0 },
    { id: 1, x: 0.45, y: 0 },
  ])`);
  await sleep(300);
  const err2 = await chrome.eval(
    '__test.shoot({ v0: 2.5, phi: 0, theta: 0, a: 0, b: 0 })');
  check('side: shoot accepted', !err2, String(err2));
  for (let i = 0; i < 300; i++) {
    await sleep(200);
    const st = await chrome.eval('__test.state()');
    if (st === 'SETTLED' || st === 'AIM') break;
    if (i === 299) throw new Error('side shot never settled');
  }
  const ev2 = JSON.parse(await chrome.eval(`JSON.stringify(
    __test.events().filter((e) => e.kind && e.kind.BallPocket))`));
  check('side: pot lands', ev2.length === 1, `got ${ev2.length}`);
  if (ev2.length === 1) {
    const ts = ev2[0].t;
    const sideBall = ev2[0].kind.BallPocket.ball;
    await chrome.eval('__test.pause(true)');
    let sideScaled = false;
    let sideSeen = 0;
    for (let k = 0; k <= 30; k++) {
      await chrome.eval(`__test.seek(${ts + k * 0.015})`);
      const b = JSON.parse(await chrome.eval(`JSON.stringify(
        __test.balls().find((bb) => bb.id === ${sideBall}))`));
      if (b.visible) {
        sideSeen += 1;
        if (Math.abs(b.scale - 1) > 1e-9) sideScaled = true;
      }
    }
    check('side: undressed drop keeps scale exactly 1 (no squeeze)',
      sideSeen >= 5 && !sideScaled, `${sideSeen} visible samples`);
  }

  // ---- GH-574 interrupt-mid-net arm: a layout() that interrupts
  // playback AFTER the ball entered the net but BEFORE settle() must
  // restore the ball's environment (the sock cubemap + gated GI ride
  // ONLY the posed sink state — the teardown sweep in resetNets owns
  // the restore; pre-fix the ball came back to the bed wearing the
  // sock env with baked GI off until the next settle healed it). ----
  {
    await chrome.eval('__test.pause(false)');
    await chrome.eval(`__test.layout([
      { id: 0, x: ${CORNER.kx - 0.45 * D}, y: ${CORNER.ky - 0.45 * D} },
      { id: 1, x: ${CORNER.kx - 0.18 * D}, y: ${CORNER.ky - 0.18 * D} },
    ])`);
    await sleep(300);
    const err3 = await chrome.eval(
      `__test.shoot({ v0: 1.8, phi: ${Math.PI / 4}, theta: 0, a: 0, b: 0 })`);
    check('interrupt: shoot accepted', !err3, String(err3));
    // pause IMMEDIATELY — settle() must never run (the netted ball must
    // stay OUT of nettedRetained; that absence is the GH-574 bug class)
    await chrome.eval('__test.pause(true)');
    const st3 = await chrome.eval('__test.state()');
    check('interrupt: playback paused pre-settle', st3 === 'PLAYBACK',
      String(st3));
    const ev3 = JSON.parse(await chrome.eval(`JSON.stringify(
      __test.events().filter((e) => e.kind && e.kind.BallPocket))`));
    check('interrupt: staged pot lands in the record', ev3.length === 1,
      `got ${ev3.length}`);
    if (ev3.length === 1) {
      const t3 = ev3[0].t;
      const id3 = ev3[0].kind.BallPocket.ball;
      // scrub INTO the net (below the bed plane inside the sock): the
      // first grid t whose posed state rides the sock env
      let envMid = null;
      for (let k = 0; k <= 80; k++) {
        await chrome.eval(`__test.seek(${t3 + k * 0.015})`);
        const e = JSON.parse(await chrome.eval(
          `JSON.stringify(__test.ballEnv(${id3}))`));
        if (e && e.netEnvOn) { envMid = e; break; }
      }
      check('interrupt: mid-net pose rides the sock env (precondition)',
        !!envMid && envMid.giBallOn === 0,
        JSON.stringify(envMid));
      // the interrupt: a scripted layout() replaces the table state —
      // resetNets tears the sink index down while the ball is mid-net
      await chrome.eval(`__test.layout([
        { id: 0, x: 0.2, y: 0 },
        { id: ${id3}, x: -0.2, y: 0 },
      ])`);
      const envAfter = JSON.parse(await chrome.eval(
        `JSON.stringify(__test.ballEnv(${id3}))`));
      check('interrupt: layout() teardown drops the sock env flag',
        !!envAfter && envAfter.netEnvOn === false, JSON.stringify(envAfter));
      check('interrupt: baked ball GI is back on',
        !!envAfter && (envAfter.giBallOn === null || envAfter.giBallOn === 1),
        JSON.stringify(envAfter));
      check('interrupt: envMap is the ACTIVE scene environment again',
        !!envAfter && envAfter.envIsScene === true, JSON.stringify(envAfter));
    }
  }
} finally {
  const gone = await chrome.closeAndWait();
  if (gone === false) console.error('WARN: chrome teardown unconfirmed');
  await stopStaticServer(server);
}
console.log(failures ? `${failures} FAILURES` : 'ALL PASS');
process.exit(failures ? 1 : 0);
