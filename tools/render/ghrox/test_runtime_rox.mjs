// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waitRoxHttp } from './runtime_rox.mjs';

test('observes delayed owned-server readiness before proceeding', async () => {
  let calls = 0, delays = 0;
  await waitRoxHttp({ exitCode: null }, 0, {
    fetcher: async (url) => { assert.equal(url, 'http://127.0.0.1:0/app.html'); if (++calls < 3) throw new Error('not listening'); return { ok: true }; },
    delay: async () => { delays++; },
  });
  assert.equal(calls, 3); assert.equal(delays, 2);
});

test('refuses an exited owned server', async () => {
  await assert.rejects(waitRoxHttp({ exitCode: 1 }, 0), /owned static server exited 1/);
});

test('does not accept an HTTP error as readiness', async () => {
  await assert.rejects(waitRoxHttp({ exitCode: null }, 0, { fetcher: async () => ({ ok: false, status: 404 }) }), /static server probe failed: 404/);
});

test('connection failures eventually refuse rather than launching Chrome', async () => {
  let calls = 0;
  await assert.rejects(waitRoxHttp({ exitCode: null }, 0, {
    fetcher: async () => { calls++; throw new Error('not listening'); }, delay: async () => {},
  }), /static server probe failed: not listening/);
  assert.equal(calls, 100);
});
