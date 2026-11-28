// Copyright (c) Meta Platforms, Inc. and affiliates.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { renameAliasEvent, renameAliasRow } from './alias-replay.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/cushion-profile-midjaw-arm-666.json', import.meta.url)));
const [recorded] = fixture.rows, [source] = recorded.split(' ');
const { id: alias } = fixture.crossings.find(({ id }) => id !== source);
const body = `${recorded.slice(source.length)}; body contains prefix_${source}_suffix`;

test('only the leading alias token changes, including dense rows with the source in their body', () => {
  for (const lead of ['', '[dense] ']) {
    assert.equal(renameAliasRow(`${lead}${source}${body}`, source, alias), `${lead}${alias}${body}`);
  }
});

test('foreign tokens and source-id substrings cannot be mistaken for a leading table token', () => {
  for (const row of [`foreign ${source}${body}`, `${source}_extra${body}`, `[dense] foreign ${source}${body}`]) {
    assert.throws(() => renameAliasRow(row, source, alias), /unexpected leading token/);
  }
});

test('colon-form status messages are handled explicitly, without relaxing rail-row grammar', () => {
  for (const lead of ['', '[dense] ']) {
    const msg = `${lead}${source}: status body contains ${source}`;
    assert.equal(renameAliasEvent({ kind: 'log', msg }, source, alias),
      `${lead}${alias}: status body contains ${source}`);
    assert.throws(() => renameAliasRow(msg, source, alias), /unexpected leading token/);
  }
});
