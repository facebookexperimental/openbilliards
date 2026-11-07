// Copyright (c) Meta Platforms, Inc. and affiliates.

// crosstable-spot-488p.mjs — fence gate for the Predator-scoped light rig.
//
// Wave A5-R2 added eight obPdtLedPanel emitters + obPdtLedLight spots; wave
// A5-R3 added the obPdtVenueAmbient light probe. Both are built inside the
// `style === 'predator'` branch of web/scene/table.js, so no other table may
// ever see them. This gate proves that on the running app rather than by
// reading the source: for each table it boots the real page, censuses every
// scene object whose name matches the Predator light prefix, and FAILS if a
// non-Predator table carries any of them (or if the Predator table has lost
// them). It also drops a spot frame per table so the census can be eyeballed.
//
// The census pattern deliberately matches the PREFIX `obPdt(Led|Venue)` and
// not the exact node names: a future Predator light added under a new name is
// caught by this gate instead of leaking silently into the other styles.
//
// Layer: render-only. READ-ONLY against web/; writes only under its --out dir.
//
//   node tools/render/crosstable-spot-488p.mjs [--out DIR]
//
// exit 0 = scoped as claimed; exit 5 = leak or loss; exit 1 = harness failure.
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand,
} from '../../web/tools/cdp.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const webDir = path.join(REPO, 'web');
const argv = (await import('./lib/argv.mjs')).expandEqArgs(process.argv.slice(2)); // FIX10 (Fable pass 1): the run's view of the argv is the =-expanded view the parse consumed
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — help exits 0, errors exit 2 — BEFORE any effect; destinations, selections and the mode come from the PARSED result, never from a re-read of argv
const __P = __parseArgv({ tag: 'crosstable-spot-488p', value: ['--out'] });
const OUT = __P.value('--out') ?? '/tmp/ob488p/crosstable';
{ const { invalidatePrior } = await import('./lib/serve-check.mjs'); invalidatePrior([path.join(OUT, 'crosstable-census.json')], 'crosstable-spot-488p'); } // FIX3 (P2 (a), refuter pass 4): the prior {results, fails} verdict is removed as the first effect
mkdirSync(OUT, { recursive: true });

// predator_apex_9ft must be LAST so a harness that dies early cannot be
// mistaken for "the other tables were clean".
const OTHERS = ['joy_q8_9ft', 'wpbsa_snooker_12ft', 'diamond_proam_9ft'];
const PREDATOR = 'predator_apex_9ft';

// R1-FIX12: OB_E2E_PORT / OB_E2E_CDP_PORT pin the pair (a lane assigned a band
// narrower than the 30-port layout law); the pair is still claimed in the
// registry (layout: false).  Unpinned, the tool's own band 23580-23609 stands.
const PIN_HTTP = Number(process.env.OB_E2E_PORT);
const PIN_CDP = Number(process.env.OB_E2E_CDP_PORT);
const PINNED = Number.isInteger(PIN_HTTP) && Number.isInteger(PIN_CDP)
  && PIN_HTTP !== PIN_CDP;
const band = PINNED
  ? await claimPortBand(Math.min(PIN_HTTP, PIN_CDP), Math.max(PIN_HTTP, PIN_CDP),
    { layout: false })
  : await claimPortBand(23580, 23609);
const PORT = PINNED ? PIN_HTTP : band.http(0);
const CDPP = PINNED ? PIN_CDP : band.cdp(0);
const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const results = {};
// One bounded retry per table. Sequential Chrome launches in a single process
// occasionally miss the readiness window on the later legs; a boot flake must
// not be able to masquerade as a fence verdict in EITHER direction, so the
// retry is logged and a second failure still throws.
async function censusTable(t, attempt) {
  try {
    return await censusOnce(t);
  } catch (err) {
    if (attempt >= 2) throw err;
    console.log(`${t}: attempt ${attempt} failed (${err.message}) — retrying once`);
    await sleep(2000);
    return censusTable(t, attempt + 1);
  }
}
try {
  for (const t of [...OTHERS, PREDATOR]) {
    results[t] = await censusTable(t, 1);
    console.log(`${t}: obPdt(Led|Venue)* census = ${JSON.stringify(results[t])}`);
  }
} finally {
  await stopStaticServer(server);
  band.release();
}

async function censusOnce(t) {
  {
    const chrome = await launchChrome(
      `http://127.0.0.1:${PORT}/app.html?table=${t}&cinema=1&seed=7`,
      { port: CDPP, width: 1600, height: 1000 });
    try {
      await chrome.send('Emulation.setDeviceMetricsOverride',
        { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
      let ready = false;
      for (let i = 0; i < 220 && !ready; i++) {
        await sleep(200);
        ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
      }
      if (!ready) throw new Error(`${t}: app never ready`);
      await sleep(3000); // let GI settle enough for a spot frame
      const census = JSON.parse(await chrome.eval(`(() => {
        let hits = 0, lamps = 0, probes = 0; const names = [];
        window.__dbg.scene.traverse((o) => {
          if (/^obPdt(Led|Venue)/.test(o.name || '')) {
            hits++; names.push(o.name + ':' + o.type);
            if (o.isLight) lamps++;
            if (o.isLightProbe) probes++;
          }
        });
        return JSON.stringify({ hits, lamps, probes, names: names.slice(0, 12) });
      })()`));
      await chrome.screenshot(path.join(OUT, `${t}.png`));
      return census;
    } finally {
      const gone = await chrome.closeAndWait();
      if (gone === false) throw new Error('chrome teardown unconfirmed');
    }
  }
}

const fails = [];
for (const t of OTHERS) {
  const c = results[t];
  if (!c) fails.push(`${t}: no census (harness never reached it)`);
  else if (c.hits !== 0) {
    fails.push(`${t}: LEAK — ${c.hits} Predator light node(s): ${c.names.join(', ')}`);
  }
}
const p = results[PREDATOR];
if (!p) fails.push(`${PREDATOR}: no census`);
else {
  // 8 emissive panels + 8 spots + 8 spot targets = 24 named LED nodes, and
  // exactly one venue probe. A drop here means the fixture regressed, which
  // would make a clean "no leak" verdict meaningless.
  if (p.probes !== 1) fails.push(`${PREDATOR}: expected 1 light probe, saw ${p.probes}`);
  if (p.lamps < 8) fails.push(`${PREDATOR}: expected >=8 lamps, saw ${p.lamps}`);
  if (p.hits < 24) fails.push(`${PREDATOR}: expected >=24 named nodes, saw ${p.hits}`);
}
writeFileSync(path.join(OUT, 'crosstable-census.json'),
  JSON.stringify({ results, fails }, null, 1));
if (fails.length) {
  console.error('\nCROSSTABLE-488P: FAIL');
  for (const f of fails) console.error('  ' + f);
  process.exit(5);
}
console.log('\nCROSSTABLE-488P: CLEAN — Predator light rig scoped to '
  + `${PREDATOR} (${p.hits} nodes, ${p.lamps} lamps, ${p.probes} probe); `
  + `${OTHERS.length} other tables carry 0.`);
