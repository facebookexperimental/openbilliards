// Copyright (c) Meta Platforms, Inc. and affiliates.

// sampler.test.ts — Sampler wrapper: buffer reuse, per-ball views, and
// agreement with the record's own post-event snapshots at event times
// (sampling at an event's t returns the post-event state, M8 semantics).

import assert from 'node:assert/strict';
import test from 'node:test';
import type { BallState } from '../src/index.js';
import { FLOATS_PER_BALL, recordDuration } from '../src/index.js';
import { engine, fixtureText } from './helpers.js';

test('sampler agrees with record post-states at every event time', async () => {
  const eng = await engine();
  const json = fixtureText('golden_record.json');
  const rec = eng.loadRecord(json);
  const sampler = eng.sampler(json);
  try {
    const index = new Map(rec.initial.balls.map((b, i) => [b.id, i]));
    for (const ev of rec.events) {
      const buf = sampler.sampleAt(ev.t);
      for (const [id, post] of ev.post) {
        const i = index.get(id);
        assert.ok(i !== undefined, `unknown ball ${id}`);
        const o = FLOATS_PER_BALL * i;
        // Post-event positions are the sampled positions at t (bit-exact:
        // the sampler evaluates the post-event segment at dt = 0).
        assert.equal(buf[o], (post as BallState).pos.x, `ball ${id} x at t=${ev.t}`);
        assert.equal(buf[o + 1], (post as BallState).pos.y, `ball ${id} y at t=${ev.t}`);
        assert.equal(buf[o + 2], (post as BallState).pos.z, `ball ${id} z at t=${ev.t}`);
      }
    }
  } finally {
    sampler.free();
  }
});

test('sampler buffer is reused and per-ball views decode the layout', async () => {
  const eng = await engine();
  const rec = eng.loadRecord(fixtureText('golden_record.json'));
  const sampler = eng.sampler(rec);
  try {
    assert.equal(sampler.ballCount, rec.initial.balls.length);
    assert.deepEqual([...sampler.ballIds], rec.initial.balls.map((b) => b.id));
    const a = sampler.sampleAt(0);
    const b = sampler.sampleAt(recordDuration(rec) / 2);
    assert.equal(a, b, 'sampleAt must return the same reusable buffer');
    assert.equal(a, sampler.data);

    // t ≤ 0 clamps to t = 0: initial POSITIONS, but the t = 0 Strike has
    // already applied — the cue ball (id 0) samples as Sliding.
    sampler.sampleAt(-1);
    rec.initial.balls.forEach((ball, i) => {
      const v = sampler.ball(i);
      assert.equal(v.id, ball.id);
      assert.equal(v.x, ball.state.pos.x);
      assert.equal(v.y, ball.state.pos.y);
      assert.equal(v.z, ball.state.pos.z);
      assert.equal(v.motion, ball.id === 0 ? 'Sliding' : 'Stationary');
      assert.equal(v.motionCode, ball.id === 0 ? 2 : 0);
      const norm = v.qw ** 2 + v.qx ** 2 + v.qy ** 2 + v.qz ** 2;
      assert.ok(Math.abs(norm - 1) < 1e-9, 'unit quaternion');
    });

    // Past the end: final states, everything settled.
    sampler.sampleAt(recordDuration(rec) + 100);
    for (const v of sampler.balls()) {
      assert.ok(v.motion === 'Stationary' || v.motion === 'Pocketed', v.motion);
    }
    assert.throws(() => sampler.ball(sampler.ballCount), RangeError);
  } finally {
    sampler.free();
  }
});

test('sampler rejects malformed and tampered records', async () => {
  const eng = await engine();
  assert.throws(() => eng.sampler('not json'));
  const tampered = JSON.parse(fixtureText('golden_record.json')) as { format_version: number };
  tampered.format_version = 9999;
  assert.throws(() => eng.sampler(JSON.stringify(tampered)));
});
