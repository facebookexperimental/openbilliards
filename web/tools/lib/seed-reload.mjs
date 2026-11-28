// Copyright (c) Meta Platforms, Inc. and affiliates.

// seed-reload.mjs — seed a live page's localStorage profile, reload, and wait
// for the NEW document to land in the seeded state (GH-909 item 2, GH-966
// family B: e2e-shell Q5 "the carom seed never reached the table").
//
// The old Q5 seed() wrote the profile, sent Page.reload, slept 500 ms and then
// polled `__test.ready` — which the OLD document still answers true until the
// reload commits, so under load the 6 s settle budget ran out against a
// document that was never going to settle at the table. Two clauses close it:
//   (1) the GH-1090 clause (uiaudit 6f8b1c5b, e2e-shell-qa3 711/713): a fresh
//       first boot's shell writes ob-shell-v1 ONCE (startAtTable false) about
//       30 ms after __test.ready, so a seed written before that write is
//       overwritten — seed only once the key exists;
//   (2) the document-identity clause: the old document carries a stamp
//       (window[stampKey]); the wait accepts only a document WITHOUT it, and
//       only once that document is ready AND shows the seed's own landed state
//       (`landed`, e.g. at the table under the seeded game).
// Budgets are wall-clock deadlines scaled by OB_E2E_POLL_SCALE, never sleeps.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const SEED_SCALE = Math.max(1, Number(process.env.OB_E2E_POLL_SCALE) || 1);

/** Poll `expr` on client `c` until true or `ms` of wall time pass. An eval that
 * throws (the page is navigating) counts as false. */
export async function pollUntil(c, expr, ms, every = 100) {
  const end = Date.now() + ms;
  for (;;) {
    if (await c.eval(expr).catch(() => false)) return true;
    if (Date.now() >= end) return false;
    await sleep(every);
  }
}

let seq = 0;
/**
 * @param c        CDP client (cdp.mjs / touch-cdp.mjs)
 * @param entries  { localStorageKey: object } — the profile to seed
 * @param landed   page expression true once the NEW document reached the
 *                 seed's own state (evaluated only on the new document)
 * @returns {Promise<{ ok: boolean, stage: string }>} stage names the clause
 *          that failed: 'first-write' | 'seed' | 'new-document' | 'landed'
 */
export async function seedReload(c, entries, landed, { scale = SEED_SCALE, stampKey = '__obSeedDoc' } = {}) {
  // (1) GH-1090: never race the fresh shell's own first ob-shell-v1 write
  if ('ob-shell-v1' in entries
    && !(await pollUntil(c, `localStorage.getItem('ob-shell-v1') !== null`, 5000 * scale))) {
    return { ok: false, stage: 'first-write' };
  }
  const stamp = `seed-${process.pid}-${++seq}`;
  const writes = Object.entries(entries).map(([k, v]) =>
    `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`).join(' ');
  const checks = Object.entries(entries).map(([k, v]) =>
    `localStorage.getItem(${JSON.stringify(k)}) === ${JSON.stringify(JSON.stringify(v))}`).join(' && ');
  const seeded = await c.eval(`(() => { ${writes} window[${JSON.stringify(stampKey)}] = ${JSON.stringify(stamp)};
    return ${checks}; })()`).catch(() => false);
  if (!seeded) return { ok: false, stage: 'seed' };
  await c.send('Page.reload', {});
  // (2) the NEW document: the stamp is gone and that document is ready
  if (!(await pollUntil(c, `window[${JSON.stringify(stampKey)}] === undefined && window.__test?.ready === true`,
    40000 * scale))) {
    return { ok: false, stage: 'new-document' };
  }
  // ... and it shows the seed's own landed state
  if (!(await pollUntil(c, `window[${JSON.stringify(stampKey)}] === undefined && (${landed})`, 15000 * scale))) {
    return { ok: false, stage: 'landed' };
  }
  return { ok: true, stage: 'landed' };
}
