#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-check-armgate.mjs — ORDER-LIGHT-C2-FIX4 (maintainer condition): the venue lane's URL ARM SWITCHES (`?venueGridShadow=`, `?venueGridDebug=`)
// take effect only on a SCRIPTED boot — behind the app's existing test/tool boot gate (shading.js CINEMA: `?cinema` or `?obtool`, the flag cdp.mjs
// stamps on every scripted boot; `?obtool=0` opts out) — never on a DEFAULT boot. Two DEFAULT boots of the same table (no cinema / obtool), one plain
// and one carrying the arm strings, must compile byte-identical ball programs: the same set of fragment sources (sha-256 over the sorted unique
// sources), the same program cache keys, and the census must read gridDirectFix3 = 0 and gridNegDebug = 0 on the flagged boot. Exit 12 on any
// difference. Arm (OB_ARMGATE_ARM=scripted): the flagged boot is made SCRIPTED (`cinema=1`) — the switches then take effect and this check must
// FAIL (exit 12): a check that cannot red is not a gate.
// ORDER-LIGHT-C2-FIX6 (land21 seal red, 2026-09-13T01:17Z): the program set of a DEFAULT boot MOVES at readiness — web/app/shell.js visualsOn() adds
// the shell's two key SpotLights (layer 1, bake-immune) at about the moment `__test.ready` flips, three's light-state version moves and every lit
// material recompiles on the next frame with numSpotLights 10 instead of 8 (the custom cache key never carried the light count; three's own does).
// A single read at readiness caught the frame before the recompile once in ~30 boots (sources-sha b3bd4e58 vs 397cca2d, identical custom keys
// and state). The read is therefore SETTLED: after readiness the set (sources, three's per-program cacheKey, the light census) must be unchanged
// over SETTLE_N consecutive samples SETTLE_MS apart, bounded by SETTLE_MAX_MS — an unsettled boot is a red (exit 12), never a pass; the per-ball
// identity and the light census are printed for both boots and on ANY difference both source sets are written under output/lighting/ so the
// next red is diffable (the land21 red was not — only the hashes survived). `venueAccept=legacy` (FIX6 class H) joins the flag census.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand } from '../../web/tools/cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../..');
const webDir = process.env.OB_LIGHTING_WEB ?? path.join(REPO, 'web');
// NOTE-705-LANDED: tracked defaults in undeclared space (16940-16969), the plan band 9490-9519 from the seal's environment (see lighting-capture.mjs).
// ci-bands-lint tool-default-overlap: this class-D step boots the SAME lane window as lighting-capture.mjs / lighting-eval.mjs ON PURPOSE (the seal
// runs it on the lane band, one Chrome at a time, never beside a capture) — declared, so the lint judges the sharing as intended, never as a collision
export const SHARED_DEFAULT_WINDOW = 'lighting';
// ci-bands-lint override-undeclared: the exact-width pins REPLACE the role endpoints inside the claimed band — declared so run-gate knows the derived endpoints
export const PORT_OVERRIDES = { http: 'OB_LIGHTING_PORT', cdp: 'OB_LIGHTING_CDP' };
const band = await claimPortBand(Number(process.env.OB_LIGHTING_BAND_START ?? 16940), Number(process.env.OB_LIGHTING_BAND_END ?? 16969), { layout: false });
const PORT = Number(process.env.OB_LIGHTING_PORT ?? 16940);
const CDPP = Number(process.env.OB_LIGHTING_CDP ?? 16941);
const ARM = process.env.OB_ARMGATE_ARM === 'scripted';
// ORDER-LIGHT-C2-FIX8 class J2: the judge compares LIKE WITH LIKE. Each boot's venue OUTCOME is read beside its programs (derived / degraded-by-name
// with the reason / not derived); when the two outcomes differ the check reports a DEGRADED DEFAULT BOOT as its own red row (exit 15 — the H3 class:
// a shipped boot whose venue lighting flipped on the budget; the maintainer's 15:09Z field witness), never a flag-leak verdict; the flag-inertness
// verdict is judged only between two boots with the same outcome. The late-join judge (M4) is made REACHABLE: after the settled read one more
// sample is taken SETTLE_MS later and its light census must equal the settled read's, else exit 16 ("a light joined past the settle window").
// Plants: OB_ARMGATE_PLANT=degrade — the second boot is a scripted default-form boot under `venueDebounce=hold` (an unbounded held rebake: it degrades
// by name at the budget) with NO arm flag → the DEGRADED row must fire (15); OB_ARMGATE_PLANT=latejoin — a SpotLight is added to the plain boot's
// scene after its settled read → the late-join judge must fire (16). A check that cannot red is not a gate.
const PLANT = process.env.OB_ARMGATE_PLANT || '';
const TABLE = 'predator_apex_9ft';
// ORDER-LIGHT-C2-FIX7 M4 — the settle budgets, DERIVED from the measurement behind #780 (2026-09-13, armgate-lights-land21.log: the shell's two key
// SpotLights joined a default boot 0.13 / 0.20 / 0.49 s after readiness, before readiness once; three's recompile landed on the same 100 ms tick):
// SETTLE_MS = 1000 ≥ 2 × the longest join measured (0.49 s) so one sample spans it; SETTLE_N = 3 identical samples = 3 s ≥ 6 × that join;
// SETTLE_MAX_MS = 60000 = 4 × the venue settle budget VENUE_GI_WINDOW_MS (15000, the lane's one declared budget) — a boot still moving after
// four venue budgets is a red, not a longer wait. A join AFTER the settle window is caught by the JUDGE below (compiled numSpotLights must equal
// the live SpotLight census at the settled read), never merely logged.
const SETTLE_N = 3; const SETTLE_MS = 1000; const SETTLE_MAX_MS = 60000;
// ORDER-LIGHT-C2-FIX4 class D: EVERY query-read arm flag of the lane's modules, each set to a value that would change behaviour on a scripted boot
// (main.js: leafStall / leafBound / venueRebakeDefer / venueRebakeCancel / venueDegradeCancel; gi.js: venueDegradeBlocks / giDelay / giFail / giStall;
// lightingvisuals.js: venueArm … venueThrow; shading.js: ledgerArm / rectDiffuse / injectedPrune / venueGridShadow / venueGridDebug)
// ORDER-LIGHT-C2-FIX5: the round's four new arm flags join the census (class D law: every arm switch inert on a default boot)
export const ARM_FLAGS = 'leafStall=lightingvisuals&leafBound=off&venueRebakeDefer=legacy&venueRebakeCancel=legacy&venueDegradeCancel=off&venueDegradeBlocks=legacy&giDelay=3000&giFail=manifest&giStall=assets&venueWellVis=legacy&venueGridDebug=lamp&venueGiKey=legacy&venueProbeFade=legacy&venueAccept=legacy&gridWellAnchor=broken&gridWellWitness=legacy&venueRebakeBound=unbounded&venueStudioGate=legacy&venueSampler=legacy&venueOwedClock=wall&venueStallStraddle=900'  // + ORDER-LIGHT-C2-FIX9 arm-only seams (inert on a default boot: no studio window, no budget crossing, no owed schedule); ?venueCancelAt is NOT listed — it cancels the apply (venue off) and cannot be inert by design
  + '&venueArm=wallfill&venueProbe=hidden&venueSettle=legacy&venueConverge=off&venueThrow=render&venueDebounce=hold&venueReadiness=legacy&venueReadNoop=1&venueReadCheck=off&venueGiWait=timeout&venueGiHold=forever&venueRegrade=touched&venueHook=leak&venueFloat=legacy&venueParkBudget=legacy&venueResumeBake=legacy'
  + '&ledgerArm=cloth&rectDiffuse=legacy&injectedPrune=off&venueGridShadow=fix3&venueGridDebug=neg'
  + '&ballKnee=off&ballKneeDebug=diffuse'; // GH-996 (card 45): the ball diffuse knee's arm / C2-read seams (shading.js)
// the behaviour identity: the venue protocol dump, the lighting leaf's mode fields, the GI state and the seams main.js publishes — deterministic
// fields only (no timings, no counters that a frame later would move)
const STATE_SRC = `(() => {
  const pick = (o, ks) => { const r = {}; for (const k of ks) r[k] = (o && o[k] !== undefined) ? o[k] : null; return r; };
  let L = null; try { L = window.__lighting && window.__lighting.state && window.__lighting.state(); } catch (e) { L = { error: String(e) }; }
  const V = (L && L.venue) || null; const G = window.__gi && window.__gi.state; let PS = null; try { PS = window.__gi && window.__gi.probeState && window.__gi.probeState(); } catch (e) { PS = null; }
  const P = window.__venueProtocol;
  return {
    protocol: (P && typeof P === 'object') ? pick(P, ['ok', 'version', 'stalled', 'why']) : P ?? null,
    venue: V ? pick(V, ['on', 'all', 'arm', 'probeMode', 'settleMode', 'convergeMode', 'throwMode', 'debounceMode', 'debounceMs', 'readinessMode', 'readNoop', 'readCheck', 'giWait', 'giHold', 'regradeMode', 'hookMode', 'derived', 'floatMode', 'parkBudget', 'resumeBake', 'budgetMs']) : null,
    gi: G ? pick(G, ['ready', 'baked', 'bakeClass', 'fixture', 'look', 'loadError', 'uGiOn']) : null,
    probe: PS ? pick(PS, ['degradeBlocksMode', 'giDelayFlagMs', 'giFailKind', 'giStall']) : null,
    rebake: (typeof window.__rebakeEnv === 'function') ? { mode: window.__rebakeEnv.mode ?? null, cancel: window.__rebakeEnv.cancel ?? null } : null,
    leaf: { stalled: (P && Array.isArray(P.stalled)) ? P.stalled : null } };
})()`;
const OUTCOME_SRC = `(() => { try { const L = window.__lighting && window.__lighting.state && window.__lighting.state(); const V = L && L.venue; if (!V) return { outcome: 'no-venue-state' };
  if (V.derived === true) return { outcome: 'derived', waitedMs: V.waitedMs ?? null };
  if (V.budgetDegrade === 1 || V.degraded === true) return { outcome: 'degraded-by-name', name: V.degradeName || null, error: V.error || null, waitedMs: V.waitedMs ?? null };
  return { outcome: 'not-derived', error: V.error || null, on: V.on }; } catch (e) { return { outcome: 'error', error: String(e) }; } })()`;
const LIGHTS_SRC = `(() => { const d = window.__dbg; if (!d) return null; const o = {}; d.scene.traverse((x) => { if (x.isLight) { const t = x.type || '?'; o[t] = (o[t] || 0) + 1; } }); return o; })()`;
const LATEJOIN_SRC = `(async () => { const THREE = await import('./vendor/three.module.min.js'); const d = window.__dbg; const L = new THREE.SpotLight(0xffffff, 1); L.name = 'obArmgateLateJoinPlant'; L.position.set(0, 1.5, 0); d.scene.add(L); return 'added'; })()`;
const PROGS_SRC = `(async () => {
  for (let i = 0; i < 600; i++) { if (window.__test && window.__test.ready) break; await new Promise((r) => setTimeout(r, 100)); }
  const d = window.__dbg; if (!d) return { error: 'no __dbg' };
  const r = d.renderer, gl = r.getContext(), props = r.properties; const srcs = new Map(); const keys = new Set(); let balls = 0;
  d.scene.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.userData || !o.material.userData.giSH) return; balls++;
    const m = o.material; const mp = props.get(m); const prog = mp && mp.currentProgram; if (!prog) return;
    try { srcs.set(prog.id, gl.getShaderSource(prog.fragmentShader) || ''); } catch (e) { srcs.set(prog.id, 'ERR ' + e); }
    try { keys.add(typeof m.customProgramCacheKey === 'function' ? m.customProgramCacheKey() : ''); } catch (e) { keys.add('ERR'); }
  });
  const list = [...srcs.values()].sort();
  const progKeys = []; const perBall = [];
  d.scene.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.userData || !o.material.userData.giSH) return;
    const mp = props.get(o.material); const prog = mp && mp.currentProgram; const pk = prog ? String(prog.cacheKey || '') : '';
    progKeys.push(pk); let k = ''; try { k = typeof o.material.customProgramCacheKey === 'function' ? o.material.customProgramCacheKey() : ''; } catch (e) { k = 'ERR'; }
    perBall.push({ name: o.name || '', key: k, progId: prog ? prog.id : null, version: o.material.version });
  });
  const lights = {}; d.scene.traverse((o) => { if (o.isLight) { const t = o.type || '?'; lights[t] = (lights[t] || 0) + 1; } });
  const spotN = list.map((s) => { const m = /uniform SpotLight spotLights\\[ (\\d+) \\]/.exec(s); return m ? Number(m[1]) : -1; });
  return { ready: !!(window.__test && window.__test.ready), balls, programs: list.length, keys: [...keys].sort(), sources: list,
    progKeys: [...new Set(progKeys)].sort(), perBall, lights, compiledSpots: [...new Set(spotN)].sort(),
    scripted: (() => { try { return sessionStorage.getItem('ob-scripted') === '1'; } catch (e) { return null; } })(),
    fix3: list.filter((s) => /OB-C2F3 grid-direct \\(b\\)/.test(s)).length, negdebug: list.filter((s) => /OB-C2F4 grid-neg DEBUG/.test(s)).length,
    fix4: list.filter((s) => /OB-C2F4 grid-vis \\(v\\)/.test(s)).length,
    linkFailed: [...srcs.keys()].length ? (() => { let n = 0; d.scene.traverse((o) => { if (!o.isMesh || !o.material || !o.material.userData || !o.material.userData.giSH) return; const mp = props.get(o.material); const prog = mp && mp.currentProgram; try { if (prog && prog.program && !gl.getProgramParameter(prog.program, gl.LINK_STATUS)) n++; } catch (e) {} }); return n; })() : null };
})()`;
const server = spawnStaticServer(webDir, PORT); await sleep(700);
let rc = 0;
try {
  const boot = async (qs, label, scripted = false) => {
    // tool:false = a REAL default boot: cdp.mjs must NOT stamp `?obtool` on the URL (its default does, for every scripted tool boot); each launch
    // gets its own temporary profile, so the scripted sessionStorage pin cannot carry from one boot to the next
    const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?table=${TABLE}${qs}`, { port: CDPP, width: 960, height: 540, tool: scripted });
    try {
      // a DEFAULT boot registers the service worker and reloads itself once the precache lands (app.html `load` → register → reload): a CDP eval
      // in flight across that navigation rejects with "Inspected target navigated" — poll readiness with retries and only then read the programs
      let ready = false;
      for (let i = 0; i < 180 && !ready; i++) { try { ready = await chrome.eval('!!(window.__test && window.__test.ready && window.__dbg)'); } catch (e) { ready = false; } if (!ready) await sleep(500); }
      // the SETTLED read (see the header): the set must be unchanged over SETTLE_N consecutive samples SETTLE_MS apart; a boot that never
      // settles inside SETTLE_MAX_MS is read once more and REPORTED unsettled (the caller reds it). A boot that never became ready reads once.
      let r = await chrome.eval(PROGS_SRC); let settledN = 1; let samples = 1; const tSettle = Date.now(); let unsettled = false;
      const sig = (x) => createHash('sha256').update(JSON.stringify([x.sources || [], x.progKeys || [], x.lights || {}, x.keys || []])).digest('hex').slice(0, 16);
      let lastSig = sig(r); const moves = [];
      if (r.ready) {
        while (settledN < SETTLE_N) {
          if (Date.now() - tSettle > SETTLE_MAX_MS) { unsettled = true; break; }
          await sleep(SETTLE_MS);
          const n = await chrome.eval(PROGS_SRC); samples++; const ns = sig(n);
          if (ns === lastSig) settledN++; else { moves.push(`${((Date.now() - tSettle) / 1000).toFixed(1)}s ${lastSig}→${ns} spots ${JSON.stringify(r.compiledSpots)}→${JSON.stringify(n.compiledSpots)} lights ${JSON.stringify(r.lights)}→${JSON.stringify(n.lights)}`); settledN = 1; lastSig = ns; }
          r = n;
        }
      }
      const outcome = await chrome.eval(OUTCOME_SRC).catch((e) => ({ outcome: 'error', error: String(e) }));
      // J2 / M4: the late-join judge — one more light census SETTLE_MS after the settled read; the plant adds a SpotLight in between on the plain boot
      let lateJoin = null;
      if (r.ready) {
        if (PLANT === 'latejoin' && label.startsWith('default boot, no arm strings')) { await chrome.eval(LATEJOIN_SRC).catch(() => null); }
        await sleep(SETTLE_MS);
        const lights2 = await chrome.eval(LIGHTS_SRC).catch(() => null);
        lateJoin = { settled: r.lights || {}, later: lights2 || {}, joined: !!(lights2 && r.lights && (lights2.SpotLight || 0) !== (r.lights.SpotLight || 0)) };
      }
      const st = await chrome.eval(STATE_SRC).catch((e) => ({ error: String(e) }));
      const hash = createHash('sha256').update((r.sources || []).join('\n---\n')).digest('hex').slice(0, 16);
      console.log(`[check-armgate] ${label}: settled ${unsettled ? 'NO (bounded at ' + SETTLE_MAX_MS + ' ms)' : 'yes'} after ${samples} samples${moves.length ? ' — the set MOVED ' + moves.length + '×: ' + moves.join(' ; ') : ''}; lights ${JSON.stringify(r.lights)} compiledSpots ${JSON.stringify(r.compiledSpots)} progKeys ${(r.progKeys || []).length} perBall ${JSON.stringify((r.perBall || []).map((b) => b.key + '#' + b.progId + 'v' + b.version))}`);
      const stateJson = JSON.stringify(st); const stateHash = createHash('sha256').update(stateJson).digest('hex').slice(0, 16);
      console.log(`[check-armgate] ${label}: ready ${r.ready} scripted-pin ${r.scripted} balls ${r.balls} programs ${r.programs} keys ${JSON.stringify(r.keys)} sources-sha ${hash} fix4 ${r.fix4} fix3 ${r.fix3} negdebug ${r.negdebug} linkFailed ${r.linkFailed} | state-sha ${stateHash} ${stateJson.slice(0, 360)}${r.error ? ' ERROR ' + r.error : ''}`);
      console.log(`[check-armgate] ${label}: venue outcome ${JSON.stringify(outcome)}; light census settled ${JSON.stringify((lateJoin || {}).settled || {})} → +${SETTLE_MS} ms ${JSON.stringify((lateJoin || {}).later || {})}${lateJoin && lateJoin.joined ? ' — a light JOINED after the settled read' : ''}`);
      return { ...r, hash, stateHash, stateJson, unsettled, moves, outcome, lateJoin };
    } finally { await chrome.closeAndWait(); }
  };
  const plain = await boot('', 'default boot, no arm strings');
  const flagged = PLANT === 'degrade'
    ? await boot('&cinema=1&venueDebounce=hold', 'J2 DEGRADE PLANT: a scripted default-form boot under an UNBOUNDED held rebake (no arm flag)', true)
    : await boot(`&${ARM_FLAGS}${ARM ? '&cinema=1' : ''}`, ARM ? 'SCRIPTED boot (cinema=1 + the obtool stamp) WITH every arm flag — the arm' : 'default boot WITH every arm flag', ARM);
  const same = plain.hash === flagged.hash && JSON.stringify(plain.keys) === JSON.stringify(flagged.keys) && plain.programs === flagged.programs;
  const settled = !plain.unsettled && !flagged.unsettled;
  const dumpDiff = () => {  // both source sets on disk so a red is diffable (land21's was not)
    try {
      const dir = path.join(REPO, 'output', 'lighting', 'armgate-diff-' + new Date().toISOString().replace(/[:.]/g, '-'));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'plain.sources.txt'), (plain.sources || []).join('\n===== next program =====\n'));
      fs.writeFileSync(path.join(dir, 'flagged.sources.txt'), (flagged.sources || []).join('\n===== next program =====\n'));
      fs.writeFileSync(path.join(dir, 'identity.json'), JSON.stringify({ plain: { hash: plain.hash, keys: plain.keys, progKeys: plain.progKeys, perBall: plain.perBall, lights: plain.lights, compiledSpots: plain.compiledSpots, unsettled: plain.unsettled, moves: plain.moves, state: plain.stateJson }, flagged: { hash: flagged.hash, keys: flagged.keys, progKeys: flagged.progKeys, perBall: flagged.perBall, lights: flagged.lights, compiledSpots: flagged.compiledSpots, unsettled: flagged.unsettled, moves: flagged.moves, state: flagged.stateJson } }, null, 1));
      const a = (plain.sources || []).join('\n').split('\n'), b = (flagged.sources || []).join('\n').split('\n');
      const first = []; for (let i = 0; i < Math.max(a.length, b.length) && first.length < 12; i++) if (a[i] !== b[i]) first.push(`L${i + 1}: ${JSON.stringify((a[i] || '').slice(0, 100))} vs ${JSON.stringify((b[i] || '').slice(0, 100))}`);
      console.log(`[check-armgate] source sets written to ${dir} (plain ${a.length} lines, flagged ${b.length} lines); first differing lines: ${first.join(' | ') || 'none (the difference is in keys / count / state)'}`);
    } catch (e) { console.log('[check-armgate] could not write the source sets: ' + (e && e.message || e)); }
  };
  const sameState = plain.stateHash === flagged.stateHash;
  const inert = flagged.fix3 === 0 && flagged.negdebug === 0;
  const linkFailed = (r) => (r.sources || []).length && r.linkFailed;
  if (ARM) {
    // the arm: the SAME flags on a SCRIPTED boot must change something — the programs, the state, or readiness itself (leafStall / giStall make a
    // scripted boot degrade by design). Identity here would mean the gate is not gating (the arm dead → exit 0, read as DID-NOT-FIRE by the seal).
    const differs = !plain.ready || !flagged.ready || !same || !sameState || !inert;
    console.log(differs ? `[check-armgate] ARM FIRED: the scripted boot WITH the arm flags differs from the plain default boot (ready ${plain.ready}/${flagged.ready}; programs ${same ? 'identical' : 'DIFFER'}; state ${sameState ? 'identical' : 'DIFFERS'}; fix3 ${flagged.fix3} negdebug ${flagged.negdebug}) — exit 12` : '[check-armgate] ARM DEAD: the scripted flagged boot is identical to the plain default boot — the gate is not gating (exit 0)');
    rc = differs ? 12 : 0;
  } else if (plain.error || flagged.error || !plain.ready || !flagged.ready) { console.log('[check-armgate] VIOLATION: a DEFAULT boot did not publish a ready program set'); rc = 12; }
  else if ((plain.outcome || {}).outcome !== (flagged.outcome || {}).outcome) {
    // J2 (a): unlike outcomes are their own red row — the H3 class — never a flag-leak verdict
    console.log(`[check-armgate] DEGRADED DEFAULT BOOT: the two boots' venue outcomes differ — plain ${JSON.stringify(plain.outcome)} vs second ${JSON.stringify(flagged.outcome)}; a shipped boot's venue lighting flipped on the budget (H3 class) — no flag-inertness verdict is possible between unlike boots — exit 15`); dumpDiff(); rc = 15; }
  else if ([plain, flagged].some((r) => r.lateJoin && r.lateJoin.joined)) {
    console.log(`[check-armgate] VIOLATION: a light JOINED after the settled read (plain ${JSON.stringify((plain.lateJoin || {}).settled)} → ${JSON.stringify((plain.lateJoin || {}).later)}; second ${JSON.stringify((flagged.lateJoin || {}).settled)} → ${JSON.stringify((flagged.lateJoin || {}).later)}) — the settle window did not cover the light set — exit 16`); rc = 16; }
  else if ([plain, flagged].some((r) => (r.compiledSpots || []).length !== 1 || (r.lights || {}).SpotLight !== r.compiledSpots[0])) {
    // C2-FIX7 M4 judge: a light that joined AFTER the settle window leaves the compiled programs behind the live census — a red, not a log line
    console.log(`[check-armgate] VIOLATION: the compiled numSpotLights differs from the live SpotLight census at the settled read (plain ${JSON.stringify(plain.compiledSpots)} vs ${(plain.lights || {}).SpotLight}; flagged ${JSON.stringify(flagged.compiledSpots)} vs ${(flagged.lights || {}).SpotLight}) — a light joined past the settle window`); dumpDiff(); rc = 12; }
  else if (!settled) { console.log(`[check-armgate] VIOLATION: a DEFAULT boot's program set did not SETTLE inside ${SETTLE_MAX_MS} ms (plain ${plain.unsettled ? 'unsettled' : 'settled'}, flagged ${flagged.unsettled ? 'unsettled' : 'settled'}) — no verdict on the flags is possible from a moving set`); dumpDiff(); rc = 12; }
  else if (!same || !inert || !sameState) { console.log(`[check-armgate] VIOLATION: the arm flags changed a DEFAULT boot (programs ${same ? 'identical' : 'DIFFER'}; state ${sameState ? 'identical' : 'DIFFERS'}; flagged fix3 ${flagged.fix3} negdebug ${flagged.negdebug})`); dumpDiff(); rc = 12; }
  else console.log('[check-armgate] PASS — every arm flag is inert on a default boot (both boots ' + ((plain.outcome || {}).outcome) + ', both sets SETTLED: ' + SETTLE_N + ' consecutive identical samples, no light joined in the extra sample): byte-identical ball programs (sources + cache keys), identical venue-protocol / lighting / GI / seam state, no fix3 / debug text compiled');
} catch (e) { console.log('[check-armgate] ERROR ' + (e && e.stack || e)); rc = 12; }
finally { await stopStaticServer(server); band.release(); }
process.exit(rc);
