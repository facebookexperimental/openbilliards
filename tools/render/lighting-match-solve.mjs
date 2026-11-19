// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-match-solve.mjs — solve the centre-match gains (GH-975, scene/lightingvisuals.js MATCH_GAINS) from
// rendered pixels. For each user table and each fixture, a fresh real-user boot at brightness 1.0, the default look
// and the table's FACTORY cloth (a cloth's sheen answers each lamp's geometry differently — measured: neutral-cloth
// class gains left the snooker canopy 0.79x and the pendant over the blue cloths 0.86x on the real cloth) measures
// the player-camera playfield-centre luminance (web/tools/lib/lighting-matrix.mjs) against the table's reference
// measured in the same pass: the canopy at gain 1, and on the 12-ft snooker table its luminaire at the 489 photo-fit
// gain. Candidate gains reach the page by fulfilling the lightingvisuals.js request with the MATCH_GAINS block
// rewritten (CDP Fetch; no product seam, no file edit until --write). Per-cell secant on log(gain) until every cell
// is within --tol. Every luminance must pass web/tools/lib/lighting-guard.mjs (enough bed and centre patches, finite,
// positive) before it enters a ratio, and every stepped gain must be finite and positive; a failed read stops the
// solve with a named InvalidRead and exit 1 (review r3 P2: an empty centre set wrote Infinity / NaN into MATCH_GAINS
// and exited 0). --write writes only a CONVERGED solve, through the guard's prepareGainsWrite (finite positive gains
// that parse back exactly); otherwise the file is untouched and the exit is non-zero.
//   node tools/render/lighting-match-solve.mjs [--keys pool_pro_9ft,umb_carom_284] [--fixtures pendant_bar]
//     [--passes 5] [--tol 0.01] [--out <dir>] [--write]
// Ports: OB_E2E_PORT / OB_E2E_CDP_PORT when pinned, otherwise an own band (OB_E2E_BAND_START/END, default 17270-17299).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, spawnStaticServer, stopStaticServer, claimPortBand } from '../../web/tools/cdp.mjs';
import { bootCell, measureCell, ENV_TAIL_SRC } from '../../web/tools/lib/lighting-matrix.mjs';
import { must, InvalidRead, whyBadCentre, envTailState, parseGainsBlock, prepareGainsWrite } from '../../web/tools/lib/lighting-guard.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = {};

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(process.env.OB_LIGHTING_WEB ?? path.join(here, '../../web'));
const SRC = path.join(webDir, 'scene', 'lightingvisuals.js');
const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const PASSES = must('--passes', Number(argOf('--passes', 5)), { int: true, min: 1 });
const TOL = must('--tol', Number(argOf('--tol', 0.01)), { positive: true });
const OUT = path.resolve(argOf('--out', `/tmp/ob-lighting-match-solve-${process.pid}`));
const WRITE = argv.includes('--write');

/** user table -> reference fixture, solved fixture settings (the venue-only rigs through auto). */
const POOL4 = ['perimeter_ring', 'pendant_bar', 'snooker_luminaire', 'carom_luminaire'];
const TABLES = {
  pool_pro_9ft: { ref: 'canopy_panel', solve: POOL4 },
  pool_pro_9ft_older_gen: { ref: 'canopy_panel', solve: POOL4 },
  pool_pro_9ft_k55: { ref: 'canopy_panel', solve: POOL4 },
  wpa_spec_9ft: { ref: 'canopy_panel', solve: POOL4 },
  pool_pro_9ft_metal_rim: { ref: 'canopy_panel', solve: ['auto', ...POOL4] },
  pool_pro_8ft: { ref: 'canopy_panel', solve: POOL4 },
  pool_pro_7ft: { ref: 'canopy_panel', solve: POOL4 },
  chinese8_pro_9ft: { ref: 'canopy_panel', solve: ['auto', ...POOL4] },
  umb_carom_284: { ref: 'canopy_panel', solve: POOL4 },
  wpbsa_snooker_12ft: { ref: 'snooker_luminaire', solve: ['canopy_panel', 'perimeter_ring', 'pendant_bar', 'carom_luminaire'] },
};
const VENUE_RIG = { pool_pro_9ft_metal_rim: 'pdt_studio', chinese8_pro_9ft: 'joy_lowrect' };
// --fixtures a,b: solve only these fixtures (the reference is always measured)
const ONLY = (argOf('--fixtures', '') || '').split(',').filter(Boolean);
if (ONLY.length) for (const C of Object.values(TABLES)) C.solve = C.solve.filter((f) => ONLY.includes(f));
const KEYS = (argOf('--keys', '') || Object.keys(TABLES).join(',')).split(',').filter(Boolean);
for (const k of KEYS) if (!TABLES[k]) throw new Error(`unknown table ${k}`);
// an empty solve "converges" on its first pass with nothing measured: refuse it
if (!KEYS.reduce((n, k) => n + TABLES[k].solve.length, 0)) throw new Error(`nothing to solve for --keys ${KEYS.join(',')} --fixtures ${ONLY.join(',')}`);

const source = fs.readFileSync(SRC, 'utf8');
// the committed table, parsed strictly (a line that is not a row throws) and checked like every candidate
const gains = parseGainsBlock(source);
{ const p = prepareGainsWrite(source, gains); if (p.why) throw new InvalidRead(`committed ${p.why}`); }
for (const k of KEYS) gains[k] ||= { [TABLES[k].ref]: TABLES[k].ref === 'snooker_luminaire' ? 2.647 : 1 };

fs.mkdirSync(OUT, { recursive: true });
const pinned = process.env.OB_E2E_PORT !== undefined
  && process.env.OB_E2E_CDP_PORT !== undefined;
const band = pinned ? null : await claimPortBand(
  Number(process.env.OB_E2E_BAND_START ?? 17270),
  Number(process.env.OB_E2E_BAND_END ?? 17299));
const PORT = pinned ? Number(process.env.OB_E2E_PORT) : band.http(0);
const CDPP = pinned ? Number(process.env.OB_E2E_CDP_PORT) : band.cdp(0);
const server = spawnStaticServer(webDir, PORT);
let c = null, code = 0;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
try {
  c = await launchChrome(`http://127.0.0.1:${PORT}/README.md`, { port: CDPP, width: 1280, height: 800, tool: false });
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await c.send('Network.enable', {});
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  let served = source;
  let converged = false;
  let fulfilled = 0;
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    fulfilled++;
    c.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Cache-Control', value: 'no-store' }],
      body: Buffer.from(served).toString('base64') }).catch(() => {});
  });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/scene/lightingvisuals.js*', requestStage: 'Request' }] });
  const base = `http://127.0.0.1:${PORT}`;
  const hist = {}; // `${key}|${fx}` -> [{ g, c, t }]
  for (let pass = 0; pass < PASSES; pass++) {
    // the page only ever sees a candidate table that passed the writer's gate
    const cand = prepareGainsWrite(source, gains);
    if (cand.why) throw new InvalidRead(`candidate ${cand.why}`);
    served = cand.text;
    let worst = 0;
    for (const key of KEYS) {
      const C = { ...TABLES[key], table: key };
      const meas = async (fx) => {
        const before = fulfilled;
        const bc = await bootCell(c, base, { table: C.table, fixture: fx, b: 1, cloth: '' });
        if (fulfilled === before) throw new Error(`the lightingvisuals.js request was never intercepted (${key} ${fx}) — candidate gains did not reach the page`);
        if (!bc.ok) throw new Error(`STATE MISMATCH ${key} ${fx}: ${bc.mismatch.join('; ')}`);
        const m = await measureCell(c, ['player']);
        const bed = m.cams.player?.bed;
        const tag = `${fx === C.ref ? 'reference' : 'cell'} ${key} ${fx}`;
        const why = whyBadCentre(`${tag} player`, bed);
        if (why) throw new InvalidRead(why);
        // GH-971 (review r4): a tail that failed while the cell was measured left a stale cube under the read
        const env = envTailState(await c.eval(ENV_TAIL_SRC).catch(() => null));
        if (!env.settled) throw new InvalidRead(`${tag} after the measurement: ${env.why}`);
        return { centre: bed.centre, light: bc.light };
      };
      const ref = await meas(C.ref);
      for (const fx of C.solve) {
        const rig = fx === 'auto' ? VENUE_RIG[key] : fx;
        const r = await meas(fx);
        if (r.light.lighting.fixture !== rig) throw new Error(`rig ${r.light.lighting.fixture} != ${rig}`);
        const g = gains[key][rig] ?? 1;
        const h = (hist[`${key}|${rig}`] ||= []);
        h.push({ g, c: r.centre, t: ref.centre });
        const err = r.centre / ref.centre - 1;
        worst = Math.max(worst, Math.abs(err));
        // secant on log(centre) vs log(gain); first step assumes a tone-mapped slope of 0.6
        let slope = 0.6;
        if (h.length >= 2) { const a = h[h.length - 2], b = h[h.length - 1]; if (a.g !== b.g && a.c !== b.c) slope = Math.log(b.c / a.c) / Math.log(b.g / a.g); }
        slope = Math.min(1.5, Math.max(0.15, must(`secant slope ${key} ${rig}`, slope)));
        const next = Math.abs(err) <= TOL ? g : g * Math.pow(ref.centre / r.centre, 1 / slope);
        gains[key][rig] = must(`next gain ${key} ${rig}`, +next.toFixed(4), { positive: true });
        log(`pass ${pass} ${key.padEnd(15)} ${rig.padEnd(18)} gain ${g} centre ${r.centre} ref ${ref.centre} err ${(100 * err).toFixed(2)}% -> ${gains[key][rig]}`);
      }
      gains[key][C.ref] = C.ref === 'snooker_luminaire' ? 2.647 : 1;
    }
    fs.writeFileSync(path.join(OUT, 'solve.json'), JSON.stringify({ pass, worst, gains, hist }, null, 1));
    log(`pass ${pass} worst |err| ${(100 * worst).toFixed(2)}%`);
    if (worst <= TOL) { converged = true; log('converged'); break; }
  }
  // converged: the gains printed are the LAST MEASURED ones (every cell within --tol); otherwise a cell outside
  // --tol carries its next, unmeasured step — printed for inspection, never written
  const out = prepareGainsWrite(source, gains);
  if (out.why) throw new InvalidRead(out.why);
  fs.writeFileSync(path.join(OUT, 'MATCH_GAINS.js'), out.block);
  console.log(out.block);
  if (WRITE && !converged) { console.error(`[solve] --write refused: not converged within ${TOL} after ${PASSES} passes (${SRC} untouched)`); code = 1; }
  else if (WRITE) { fs.writeFileSync(SRC, out.text); log(`wrote ${SRC}`); }
} catch (e) { console.error('[solve] ' + (e?.stack ?? e)); code = 1; }
finally { try { await c?.closeAndWait(); } catch { /* ok */ } await stopStaticServer(server); await band?.release?.(); }
process.exit(code);
