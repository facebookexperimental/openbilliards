// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-table-specs-coverage.mjs: every table id the app can be asked to build has a scene spec.
//
// Law (GH-789): every GameEntry table_class id (kind 'catalog') and every selectable SDK table
// id (a catalog table entry without ui_hidden) is a key of the scene's TABLE_SPECS. A missing key
// fails late: a boot (resolveBootTableId, a boot prepareEquipment) builds the scripted pin
// table with only a console note, and a live switch is refused, so the requested table never
// renders.
// ui_hidden table entries (resolve-only legacy ids) are outside the law.
//
// TABLE_SPECS is read in plain node through the vendored three (catalogTableIds of the render
// tools' table-ids module, the ensureRealThree loader check-cue-looks also uses); the games and
// the tables come from the committed dist SDK (web/dist/pool-sdk), the build the app serves.
//
//   node tools/check-table-specs-coverage.mjs             the law on this tree (exit 1 on a gap)
//   node tools/check-table-specs-coverage.mjs --selftest  plants on copies; each must be caught
import { catalogTableIds } from './render/lib/table-ids.mjs';
import { repoUrl } from './render/lib/ensure-three.mjs';

const { GAME_CATALOG } = await import(repoUrl('web/dist/pool-sdk/games/catalog.js'));
const { catalogEntries } = await import(repoUrl('web/dist/pool-sdk/catalog.js'));

const EMPTY_READS = [
  'no TABLE_SPECS keys were read',
  'no games were read',
  'no table_class table ids were read',
  'no selectable SDK table ids were read',
];

// Pure: the problems of one (keys, games, tables) triple. An unknown table_class kind is a
// problem, never skipped; an empty read is a problem, so the law cannot pass on nothing.
function coverage(keys, games, tables) {
  const have = new Set(keys);
  const problems = [];
  const refs = [];
  for (const g of games) {
    const tc = g.table_class;
    if (tc && tc.kind === 'missing') continue; // a readiness prerequisite, no table to build
    if (!tc || tc.kind !== 'catalog' || !Array.isArray(tc.table_ids)) {
      problems.push(`game ${g.id}: table_class kind ${tc && tc.kind} is not a known kind`);
      continue;
    }
    for (const id of tc.table_ids) refs.push({ game: g.id, id });
  }
  const selectable = tables.filter((t) => t.ui_hidden !== true).map((t) => t.id);
  const counts = [keys.length, games.length, refs.length, selectable.length];
  counts.forEach((n, i) => { if (!n) problems.push(EMPTY_READS[i]); });
  for (const r of refs) {
    if (!have.has(r.id)) problems.push(`game ${r.game}: table_class id ${r.id} has no TABLE_SPECS key`);
  }
  for (const id of selectable) {
    if (!have.has(id)) problems.push(`selectable SDK table ${id} has no TABLE_SPECS key`);
  }
  return { problems, keys: keys.length, games: games.length, refs: refs.length, selectable: selectable.length };
}

const keys = await catalogTableIds();
const tables = catalogEntries('table_id');
const games = GAME_CATALOG;

if (process.argv.includes('--selftest')) {
  // Each plant edits a COPY, proves the copy differs from the live input in the planted way, and
  // passes only on its stated outcome. Targets are taken from the live data, so a plant always
  // lands on the current key set.
  const live = coverage(keys, games, tables);
  const selId = tables.find((t) => t.ui_hidden !== true && keys.includes(t.id))?.id;
  const game = games.find((g) => g.table_class && g.table_class.kind === 'catalog'
    && Array.isArray(g.table_class.table_ids));
  const has = (want) => (out) => out.problems.includes(want);
  const plants = [
    ['drop-selectable-key', () => {
      const k = keys.filter((id) => id !== selId);
      const want = `selectable SDK table ${selId} has no TABLE_SPECS key`;
      return { fired: !!selId && k.length === keys.length - 1, out: coverage(k, games, tables), want, pass: has(want) };
    }],
    ['unknown-class-id', () => {
      const g = games.map((x) => (x === game
        ? { ...x, table_class: { ...x.table_class, table_ids: [...x.table_class.table_ids, 'zz_unknown_table'] } } : x));
      const want = `game ${game && game.id}: table_class id zz_unknown_table has no TABLE_SPECS key`;
      return { fired: !!game && !keys.includes('zz_unknown_table'), out: coverage(keys, g, tables), want, pass: has(want) };
    }],
    ['unknown-class-kind', () => {
      const g = games.map((x) => (x === game ? { ...x, table_class: { kind: 'zz_kind' } } : x));
      const want = `game ${game && game.id}: table_class kind zz_kind is not a known kind`;
      return { fired: !!game, out: coverage(keys, g, tables), want, pass: has(want) };
    }],
    ['empty-read', () => ({
      fired: true, out: coverage([], [], []), want: EMPTY_READS.join('; '),
      pass: (out) => EMPTY_READS.every((w) => out.problems.includes(w)),
    })],
    ['unkeyed-selectable-entry', () => {
      const t = [...tables, { id: 'zz_visible_table' }];
      const want = 'selectable SDK table zz_visible_table has no TABLE_SPECS key';
      return { fired: t.length === tables.length + 1 && !keys.includes('zz_visible_table'),
        out: coverage(keys, games, t), want, pass: has(want) };
    }],
    ['hidden-entry-not-named', () => {
      const t = [...tables, { id: 'zz_hidden_table', ui_hidden: true }];
      return { fired: t.length === tables.length + 1, out: coverage(keys, games, t),
        want: 'the live problem list, no line naming zz_hidden_table',
        pass: (out) => out.problems.length === live.problems.length
          && out.problems.every((p, i) => p === live.problems[i])
          && !out.problems.some((p) => p.includes('zz_hidden_table')) };
    }],
  ];
  let bad = 0;
  for (const [name, run] of plants) {
    const { fired, out, want, pass } = run();
    const caught = fired && pass(out);
    if (!caught) bad++;
    console.log(`[table-specs-coverage] selftest ${name}: ${!fired ? 'PLANT DID NOT FIRE' : caught ? 'CAUGHT' : 'MISSED'} (${want})`);
  }
  console.log(`[table-specs-coverage] selftest ${bad ? 'FAIL' : 'OK'}: ${plants.length - bad} of ${plants.length} plants caught`);
  process.exit(bad ? 1 : 0);
}

const r = coverage(keys, games, tables);
for (const p of r.problems) console.error(`[table-specs-coverage] FAIL: ${p}`);
console.log(`[table-specs-coverage] ${r.problems.length ? 'FAIL' : 'OK'}: ${r.keys} TABLE_SPECS keys; ${r.games} games, `
  + `${r.refs} table_class table ids; ${r.selectable} selectable SDK tables; ${r.problems.length} problem(s)`);
process.exit(r.problems.length ? 1 : 0);
