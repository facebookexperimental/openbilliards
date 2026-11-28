// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-cup-drive.js — ORDER-LAND-638 (d): stage the #638 SECOND symptom inside a lighting capture.
// Evaluated as the body of a `--poke-raw cuprest=<this file>` (tools/render/lighting-capture.mjs wraps it in an
// IIFE and waits on window.__pokePending). It reproduces web/tools/capture-626-sinkrest.mjs stagePot for the
// Predator CORNER arm byte for byte: layout the cue ball 0.60 m and the object ball 0.28 m out along the pocket's
// diagonal, shoot v0 1.9 down the diagonal, wait for exactly one BallPocket event, pause playback and seek to
// t0 + 0.6 s — the object ball is then RESTING on the foam plug (pocketed AND presented, #633 restRetained). The
// pocket centre (kx, ky) and its diagonal signs are published as window.__cupRest for the register pose
// (lighting-page.mjs cup_rest = #633's frame 02-rest-hi). Any failure lands in window.__cupRest.error and the
// capture FAILS the set — the cup rows never read the open bed by mistake.
window.__pokePending = true; window.__cupRest = null;
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    const m = await import('/scene/table.js');
    const ps = m.TABLE.pockets;
    const p = ps.filter((q) => Math.abs(q.x) > 0.1).sort((a, b) => (b.x + b.z) - (a.x + a.z))[0];
    const kx = p.z, ky = p.x;
    const ux = Math.sign(kx) / Math.SQRT2, uy = Math.sign(ky) / Math.SQRT2;
    __test.pause(false);
    __test.layout([{ id: 0, x: kx - 0.60 * ux, y: ky - 0.60 * uy }, { id: 1, x: kx - 0.28 * ux, y: ky - 0.28 * uy }]);
    await wait(300);
    const err = await __test.shoot({ v0: 1.9, phi: Math.atan2(uy, ux), theta: 0, a: 0, b: 0 });
    if (err) throw new Error('shoot rejected: ' + err);
    let ev = [];
    for (let i = 0; i < 300; i++) {
      await wait(200);
      const st = __test.state();
      ev = __test.events().filter((e) => e.kind && e.kind.BallPocket);
      if ((st === 'SETTLED' || st === 'AIM') && ev.length) break;
    }
    if (ev.length !== 1) throw new Error('staging: ' + ev.length + ' pots');
    const t0 = ev[0].t, ballId = ev[0].kind.BallPocket.ball;
    __test.pause(true); __test.seek(t0 + 0.6);
    await wait(400);
    const b = __test.balls().find((bb) => bb.id === ballId);
    if (!b || !b.pocketed || !b.visible) throw new Error('rest not presented: ' + JSON.stringify(b && { pocketed: b.pocketed, visible: b.visible, pos: b.pos }));
    if (ballId !== 1) throw new Error('potted ball id ' + ballId + ' != 1');
    window.__cupRest = { kx, ky, sx: Math.sign(kx) || 1, sy: Math.sign(ky) || 1, t0, ballId, pos: b.pos, visible: b.visible, pocketed: b.pocketed, crown: b.pos[1] + 0.028575 };
  } catch (e) { window.__cupRest = { error: String(e) }; }
  window.__pokePending = false;
})();
