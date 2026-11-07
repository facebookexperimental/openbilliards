// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { normalizeRoxArgs } from './lib/ports_rox.mjs';

const cases = JSON.parse(fs.readFileSync(new URL('fixtures/port-args-rox.json', import.meta.url), 'utf8'));
for (const row of cases.valid) {
  test(row.name, () => assert.deepEqual(normalizeRoxArgs(row.args), row.expected));
}
for (const row of cases.invalid) {
  test(row.name, () => assert.throws(() => normalizeRoxArgs(row.args),
    error => error.message.startsWith('ROX_PORT_ARGS_REFUSED:') && error.message.includes(row.message)));
}
