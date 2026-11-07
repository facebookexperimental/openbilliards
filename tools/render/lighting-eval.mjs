// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-eval.mjs — boot app.html once (chrome-headless-shell, the lane's band from the environment), wait for the lane's settle
// predicate (GI + rig + derived venue fill written), evaluate ONE JS expression and print its JSON. The
// venue-lighting lane's diagnostic / pin-boot instrument (no captures, no files).
//   node tools/render/lighting-eval.mjs --table predator_apex_9ft --look default [--flags "k=v"] --js "<expr>" [--wait-ms N]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand } from '../../web/tools/cdp.mjs';
import { SETTLE_SRC, HIDE_UI_SRC } from './lib/lighting-page.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = process.env.OB_LIGHTING_WEB ?? path.resolve(here, '../../web');
const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const table = argOf('--table', 'predator_apex_9ft'), look = argOf('--look', 'default'), flags = argOf('--flags', '');
const js = argOf('--js', 'window.__lighting.state().venue'); const waitMs = Number(argOf('--wait-ms', '1500'));
// --pre-js runs right after the settle (before the --wait-ms pause): a re-apply / poke whose effect --js then reads
const preJs = argOf('--pre-js', null);
// NOTE-705-LANDED: tracked defaults in undeclared space, the plan band 9490-9519 from the driver's environment (see lighting-capture.mjs)
// NOTE-725-LANDED (ci-bands-lint tool-default-overlap): lighting-capture.mjs and lighting-eval.mjs share the lane's default window ON PURPOSE
// (lighting-eval is a hand-run diagnostic on the lane's band, never launched by the seal beside a capture; the band is one lane's) — declared,
// so the lint judges the sharing as intended, never as a collision
export const SHARED_DEFAULT_WINDOW = 'lighting';
// NOTE-725-LANDED (ci-bands-lint override-undeclared): the exact-width pins REPLACE the role endpoints inside the claimed band — declared so run-gate knows the derived endpoints
export const PORT_OVERRIDES = { http: 'OB_LIGHTING_PORT', cdp: 'OB_LIGHTING_CDP' };
const band = await claimPortBand(Number(process.env.OB_LIGHTING_BAND_START ?? 16940), Number(process.env.OB_LIGHTING_BAND_END ?? 16969), { layout: false });
const PORT = Number(process.env.OB_LIGHTING_PORT ?? 16940);
const CDPP = Number(process.env.OB_LIGHTING_CDP ?? 16941);
if (PORT < band.start || PORT > band.end || CDPP < band.start || CDPP > band.end) throw new Error(`lighting-eval: bound ports ${PORT}/${CDPP} outside the claimed band ${band.start}-${band.end}`);
const server = spawnStaticServer(webDir, PORT);
let chrome = null, code = 0;
try {
  const url = `http://127.0.0.1:${PORT}/app.html?table=${table}&cinema=1&seed=7&look=${look}${flags ? '&' + flags : ''}`;
  chrome = await launchChrome(url, { port: CDPP, width: 1280, height: 800 });
  let st = null;
  for (let i = 0; i < 300; i++) { st = await chrome.eval(SETTLE_SRC).catch(() => null); if (st?.settled) break; await sleep(100); }
  if (!st?.settled) throw new Error('never settled: ' + JSON.stringify(st));
  if (preJs) { const pr = await chrome.eval(`(() => { try { return { ok: true, value: (${preJs}) }; } catch (e) { return { ok: false, error: String(e) }; } })()`); if (!pr?.ok) throw new Error('pre-js failed: ' + (pr?.error ?? '?')); }
  await sleep(waitMs);
  await chrome.eval(HIDE_UI_SRC).catch(() => null);
  await sleep(200);
  const out = await chrome.eval(`(() => { try { return { ok: true, value: (${js}) }; } catch (e) { return { ok: false, error: String(e && e.stack || e) }; } })()`);
  console.log(JSON.stringify({ table, look, flags, settle: st.venue ?? null, ...out }));
  if (!out?.ok) code = 2;
} catch (e) { console.error('[eval] ' + (e?.message ?? e)); code = 1; }
finally { try { await chrome?.closeAndWait(); } catch { /* ok */ } await stopStaticServer(server); await band?.release?.(); }
process.exit(code);
