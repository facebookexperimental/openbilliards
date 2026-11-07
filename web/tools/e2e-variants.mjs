// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-variants.mjs — headless rules-variant battery (feature 022 US2,
// L-APP T020; feature 022 (internal spec){spec.md,contracts/share-codec.md}):
//
//   V1  picker present with citation badges (kit select + per-preset cards
//       in Settings → Game, below the game selector — FR-006/SC-005);
//       a real card click selects APA and the fresh rack adopts it
//   V2  next-rack semantics (US2 scenario 2/SC-005): a mid-rack variant
//       change does NOT re-adjudicate the running rack — the HUD notice
//       shows, the fold stays v1, and the change lands on the NEXT rack
//   V3  live divergence (US1-AS1 at the app surface): under WPA an
//       uncalled non-break stroke is REFUSED (flow.callRequired); under
//       APA the same scripted slop pot fires, is legal, and CONTINUES
//   V4  share round-trip under APA (SC-006): play + share; decode in a
//       fresh session (cleared storage) ⇒ the variant id pins, records
//       byte-match, the final judgment fold is byte-identical, and the
//       re-encoded link equals the original byte-for-byte
//   V5  hand-built unknown-variant payload ⇒ the structured ShareError
//       surfaces in the UI (never silent — US2 scenario 5); a
//       family-mismatched id errors too (decode rule 4)
//
//   node web/tools/e2e-variants.mjs      (needs Chrome + node ≥22)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 8465);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8900);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const fail = (msg) => { console.error('E2E-VARIANTS FAIL:', msg); process.exitCode = 1; };
const pass = (msg) => console.log('[e2e-variants] PASS', msg);

// GH-371 schema-evolution repin (variant-config.md par.6): the appended
// kitchen_rule axis moved every preset hash.
const APA_TASK_HASH =
  'b312498e35602e4d23435144255514586457b90979c731f98cf60ce0f1ef38fe';

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [];
const chrome = await launchChrome(
  // `obshell=1`: the reserved scripted opt-in that lets the shell exist on
  // this scripted boot (shell.md §4) — V1 reads the variant list on the
  // play place since feature 034; the boot pose opens the shell at play
  `http://127.0.0.1:${PORT}/app.html?seed=1&obshell=1`, { port: CDP_PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  }
});

const ev = (js) => chrome.eval(js);
async function settle(tag) {
  let state = 'PLAYBACK';
  for (let i = 0; i < 220 && state === 'PLAYBACK'; i++) {
    await sleep(350); state = await ev('__test.state()');
  }
  if (state === 'PLAYBACK') fail(tag + ': shot never settled');
  return state;
}
async function shot(tag, params) {
  const err = await ev(`__test.shoot(${JSON.stringify(params)})`);
  if (err) { fail(`${tag}: shoot rejected: ${err}`); return 'REJECTED'; }
  return settle(tag);
}
// the proven straight-pot geometry (e2e-rules stage 3 / e2e-8ball)
const POT = { x: 0.38903252247502133, y: 0.7780650449500427 };
const PHI = 1.1071487177940904;
const FAR = [{ id: 9, x: -0.5, y: -1.0 }, { id: 12, x: 0.5, y: -1.0 }];
async function scene(specs, ms) {
  await ev(`__test.layout(${JSON.stringify(specs)})`);
  if (ms && !(await ev(`window.__rules.setMatchState(${JSON.stringify(ms)})`))) {
    fail('setMatchState rejected: ' + JSON.stringify(ms));
  }
}

/** Hand-build a share string from a raw wire tuple, the codec's way
 * (deflate-raw + base64url) — the V5 malformed-payload forge. */
async function forgeWire(wire) {
  const cs = new CompressionStream('deflate-raw');
  const deflated = new Uint8Array(await new Response(
    new Blob([new TextEncoder().encode(JSON.stringify(wire))]).stream()
      .pipeThrough(cs)).arrayBuffer());
  return Buffer.from(deflated).toString('base64url');
}

/** Inverse of forgeWire: a real share hash back to its raw wire tuple
 * (the V6c legacy-placement patch rides a genuine recorded wire). */
async function inflateWire(hash) {
  const ds = new DecompressionStream('deflate-raw');
  const bytes = new Uint8Array(await new Response(
    new Blob([Buffer.from(hash, 'base64url')]).stream()
      .pipeThrough(ds)).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(bytes));
}

try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) {
    await sleep(200);
    ready = await ev('window.__test?.ready === true'
      + ' && typeof window.__settings?.changeVariant === "function"'
      + ' && window.__rules?.ready() === true');
  }
  if (!ready) throw new Error('app (or the variant surfaces) never became ready');

  // ---- V1: variant list on the PLAY PLACE + citation badges + real card-click
  // select (re-cut by feature 034 / 525 S4a-mig: the picker left the settings
  // modal for the shell's play card; `__settings.show('game')` routes there,
  // the rows come from the settings-owned `variantRows` data seam) ----------
  if (await ev('window.__settings.changeGame("eight_ball", {skipConfirm:true})')
    !== true) throw new Error('changeGame(eight_ball) failed');
  await sleep(400);
  await ev('window.__settings.show("game")'); // shell open ⇒ re-poses at play (closed ⇒ opens there)
  let mounted = false;
  for (let i = 0; i < 100 && !mounted; i++) {
    mounted = await ev(`window.__shell?.isOpen?.() === true && window.__shell.place() === 'play'
      && typeof window.__play === 'object'
      && !!document.querySelector('section[data-place="play"].ob-play-host')
      && document.querySelectorAll('[data-ob="play-variants"] .ob-variant-row').length > 0`);
    if (!mounted) await sleep(150);
  }
  if (!mounted) fail('V1: the play card (and its variant list) never mounted after show("game")');
  const picker = await ev(`(() => {
    const list = document.querySelector('[data-ob="play-variants"]');
    const cards = [...document.querySelectorAll('[data-ob="play-variants"] .ob-variant-row')];
    const api = window.__settings.variantRows('eight_ball') ?? [];
    return {
      present: !!list, hidden: list?.hidden ?? true,
      nativeSelects: document.querySelectorAll('section[data-place="play"] select').length,
      api: api.map((r) => ({ id: r.id, value: r.value, current: r.current })),
      cards: cards.map((c) => ({
        v: c.dataset.variant,
        current: c.getAttribute('aria-current'),
        pick: c.querySelector('[data-variant-pick]')?.dataset.variantPick ?? null,
        badge: (c.querySelector('.ob-badge')?.textContent ?? '').trim(),
        desc: (c.querySelector('.ob-eq-prov-row__desc')?.textContent ?? '').trim(),
      })),
    };
  })()`);
  if (!picker.present || picker.hidden || picker.nativeSelects !== 0) {
    fail('V1: variant list missing/hidden or a native select leaked onto the play card: ' + JSON.stringify(picker));
  }
  // the data seam: the WPA row is the alias default (commit value '' clears
  // the pin — settings.js:2612 law), apa-8ball is the explicit preset
  if (JSON.stringify(picker.api) !== JSON.stringify([
    { id: 'wpa-8ball', value: '', current: true },
    { id: 'apa-8ball', value: 'apa-8ball', current: false }])) {
    fail('V1: variantRows(eight_ball) shape/default wrong: ' + JSON.stringify(picker.api));
  }
  const wpaCard = picker.cards.find((c) => c.v === 'wpa-8ball');
  const apaCard = picker.cards.find((c) => c.v === 'apa-8ball');
  if (picker.cards.length !== 2 || !wpaCard || !apaCard
    || wpaCard.current !== 'true' || apaCard.current !== 'false'
    || wpaCard.pick !== 'wpa-8ball' || apaCard.pick !== 'apa-8ball') {
    fail('V1: citation cards wrong: ' + JSON.stringify(picker.cards));
  }
  if (!wpaCard.badge || !/WPA Rules of Play/.test(wpaCard.desc)
    || !apaCard.badge || !/APA 8-Ball Game Rules/.test(apaCard.desc)) {
    fail('V1: citation badges/lines wrong: ' + JSON.stringify(picker.cards));
  }
  pass('V1: variant list on the play card (no native select), default row '
    + 'current, both presets carry citation badges (FR-006 / 034 FR-008)');

  // real card click on a FRESH rack (shotIndex 0): applies immediately
  // via the same-seed re-rack (nothing to lose — deterministic); the
  // shell STAYS open (a variant pick is not a D14 exit)
  await ev('document.querySelector(\'[data-variant-pick="apa-8ball"]\').click()');
  await sleep(400);
  let v = await ev('window.__rules.variant()');
  if (v?.preset !== 'apa-8ball' || v?.taskHash !== APA_TASK_HASH) {
    fail('V1: card click did not activate APA: ' + JSON.stringify(v));
  }
  const sync = await ev(`({
    current: document.querySelector('[data-ob="play-variants"] [aria-current="true"]')?.dataset.variant,
    apiCurrent: (window.__settings.variantRows('eight_ball') ?? []).find((r) => r.current)?.id,
    shellOpen: window.__shell.isOpen(), place: window.__shell.place() })`);
  if (sync.current !== 'apa-8ball' || sync.apiCurrent !== 'apa-8ball'
    || sync.shellOpen !== true || sync.place !== 'play') {
    fail('V1: card list did not reflect the selection with the shell open at play: ' + JSON.stringify(sync));
  }
  await ev('window.__shell.quickPlay(); true'); // leave the shell for the arms below
  await sleep(600);
  pass('V1: card click selects APA; fresh rack adopts it '
    + `(taskHash ${v.taskHash.slice(0, 8)}…)`);

  // ---- V2: next-rack semantics on a LIVE rack (US2 scenario 2) -------------
  if (await ev('window.__settings.changeVariant("eight_ball", null)') !== true) {
    fail('V2: reset to the default preset refused');
  }
  await sleep(300);
  await ev('__test.rerack(1)');
  await sleep(300);
  await ev('window.__rules.setMatchState({shooter:1,breaker:1})');
  if (await shot('V2-break', { v0: 8.5, phi: Math.PI / 2, theta: 0, a: 0, b: -0.1 })
    === 'REJECTED') throw new Error('V2: WPA break rejected');
  const jsonBefore = await ev('window.__rules.judgmentJson()');
  if (!jsonBefore) fail('V2: no judgment after the WPA break');
  const change = await ev(`(() => {
    const ok = window.__settings.changeVariant('eight_ball', 'apa-8ball');
    const h = document.getElementById('hud-hint');
    return { ok, hint: h?.textContent ?? '', shown: h?.style.display };
  })()`);
  if (change.ok !== true) fail('V2: mid-rack changeVariant refused');
  if (!/next rack/i.test(change.hint) || change.shown !== 'block') {
    fail('V2: next-rack notice not shown: ' + JSON.stringify(change));
  }
  // NOT re-adjudicated: fold still v1 (no variant), judgment bytes untouched
  if (await ev('window.__rules.variant()') !== null) {
    fail('V2: mid-rack change re-folded the running rack');
  }
  if (await ev('window.__rules.judgmentJson()') !== jsonBefore) {
    fail('V2: mid-rack change re-adjudicated the settled shot');
  }
  // still the WPA regime mid-rack: an uncalled non-break stroke refuses
  const rej = await ev('__test.shoot({v0:1.5,phi:1.0,theta:0,a:0,b:0})');
  if (!rej) fail('V2: uncalled stroke fired under WPA mid-rack (call gate lost)');
  // the change lands on the NEXT fresh rack
  await ev('__test.rerack(2)');
  await sleep(300);
  v = await ev('window.__rules.variant()');
  if (v?.preset !== 'apa-8ball' || v?.taskHash !== APA_TASK_HASH) {
    fail('V2: fresh rack did not adopt the pending APA selection: '
      + JSON.stringify(v));
  }
  pass('V2: mid-rack change → notice + fold untouched + WPA gate active; '
    + 'fresh rack adopts APA');

  // ---- V3: judged divergence — WPA refuses the uncalled stroke, APA slop
  // counts and the shooter CONTINUES (US1-AS1 at the app surface) ------------
  await scene([{ id: 0, x: 0, y: 0 }, { id: 3, x: POT.x, y: POT.y },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  if (await ev('window.__rules.variant()') === null) {
    fail('V3: scripted layout dropped the APA fold');
  }
  if (await shot('V3-slop', { v0: 2.5, phi: PHI, theta: 0, a: 0, b: 0 }) !== 'AIM') {
    fail('V3: uncalled APA pot did not return to AIM');
  }
  const j3 = await ev('window.__rules.judgment()');
  if (!j3?.legal || j3?.turn !== 'continue' || !j3?.pocketed?.includes(3)) {
    fail('V3: APA slop pot must be legal + continue: ' + JSON.stringify(j3));
  }
  if (await ev('window.__rules.player()') !== 1) {
    fail('V3: APA slop pot passed the turn');
  }
  if (!(await ev('window.__rules.judgmentJson()')).includes(APA_TASK_HASH)) {
    fail('V3: judgment next does not carry the variant identity block');
  }
  pass('V3: APA slop pot continues (vs the WPA call-gate refusal in V2) '
    + 'and every judgment re-emits the variant identity (FR-008)');

  // ---- V4: share round-trip under APA — byte-identical replay (SC-006) -----
  // organic play only (layout() scenes are not reconstructible from the
  // rack seed): find a seed whose APA break leaves a live non-terminal
  // rack, fire two more strokes, share.
  let seed = 0;
  for (const s of [1, 2, 3, 4, 5, 6]) {
    await ev(`__test.rerack(${s})`);
    await sleep(250);
    await ev('window.__rules.setMatchState({shooter:1,breaker:1})');
    const st = await shot(`V4-break-${s}`,
      { v0: 8.5, phi: Math.PI / 2, theta: 0, a: 0, b: -0.1 });
    const pending = await ev('window.__rules.matchState()?.pendingDecision ?? null');
    if (st === 'AIM' && pending === null) { seed = s; break; }
  }
  if (!seed) throw new Error('V4: no seed produced a live APA rack in 6 tries');
  const judgments = [await ev('window.__rules.judgmentJson()')];
  // two more strokes — uncalled is fine under APA; outcomes (foul or not)
  // are deterministic per seed and simply become part of the recording
  for (const p of [{ v0: 2.0, phi: 1.0, theta: 0, a: 0, b: 0 },
    { v0: 1.4, phi: 2.2, theta: 0, a: 0, b: 0 }]) {
    const st = await shot('V4-shot', p);
    if (st === 'REJECTED') throw new Error('V4: recording stroke rejected');
    if (st === 'WIN') break; // terminal is fine — the WIN re-rack is 2.6s out
    judgments.push(await ev('window.__rules.judgmentJson()'));
    if (await ev('__test.state()') === 'BALL_IN_HAND') {
      await ev('__test.placeCue(0, -0.6)');
    }
  }
  const recorded = {
    url: await ev('__share.encode()'),
    records: await ev('__share.records()'),
    variant: (await ev('__share.log()')).variant,
    finalJudgment: judgments[judgments.length - 1],
    hash: await ev('window.__rules.variant()?.taskHash'),
  };
  if (recorded.variant !== 'apa-8ball' || recorded.hash !== APA_TASK_HASH) {
    fail('V4: recording session did not pin APA: '
      + JSON.stringify({ variant: recorded.variant, hash: recorded.hash }));
  }
  const shareHash = recorded.url.slice(recorded.url.indexOf('#r=') + 3);

  // fresh session: cleared storage — the pin must come from the LINK
  await ev('localStorage.clear()');
  await chrome.send('Page.navigate', {
    url: `http://127.0.0.1:${PORT}/app.html?obtool=1&arm=v4#r=${shareHash}` });
  await sleep(800);
  ready = false;
  for (let i = 0; i < 200 && !ready; i++) {
    await sleep(200);
    ready = await ev('window.__test?.ready === true');
  }
  if (!ready) throw new Error('V4: replay session never became ready');
  let done = false;
  for (let i = 0; i < 600 && !done; i++) {
    await sleep(300);
    done = await ev('__share.replay().done === true');
  }
  if (!done) throw new Error('V4: shared replay never finished');
  const replayed = {
    replay: await ev('__share.replay()'),
    records: await ev('__share.records()'),
    finalJudgment: await ev('window.__rules.judgmentJson()'),
    variant: await ev('window.__rules.variant()'),
    reEncoded: await ev('__share.encode()'),
  };
  if (replayed.replay.variant !== 'apa-8ball') {
    fail('V4: decoded session did not pin the variant id: '
      + JSON.stringify(replayed.replay));
  }
  if (replayed.variant?.taskHash !== APA_TASK_HASH) {
    fail('V4: replay fold not under APA: ' + JSON.stringify(replayed.variant));
  }
  if (JSON.stringify(replayed.records) !== JSON.stringify(recorded.records)) {
    fail(`V4: record bytes diverged (${recorded.records.length} recorded vs `
      + `${replayed.records.length} replayed)`);
  }
  if (replayed.finalJudgment !== recorded.finalJudgment) {
    fail('V4: final judgment fold not byte-identical\n  rec: '
      + recorded.finalJudgment + '\n  rep: ' + replayed.finalJudgment);
  }
  const reHash = replayed.reEncoded.slice(replayed.reEncoded.indexOf('#r=') + 3);
  if (reHash !== shareHash) {
    fail('V4: re-encoded replay link differs from the original share');
  }
  pass(`V4: APA share (seed ${seed}, ${recorded.records.length} records) `
    + 'replays byte-identically — records, judgment fold, and the '
    + 're-encoded link all byte-match (SC-006)');

  // ---- V5: unknown / family-mismatched variant payloads → UI error ---------
  // kernelVersion 'kv' suffices: decode fails at the variant gate BEFORE
  // the kernel gate can run (validateGame order), which is the point
  const kernelV = 'kv';
  const IDS = ['diamond_proam_9ft', 'simonis_860_tournament', 'aramith_pool',
    'standard', 'stronge_realistic'];
  const arms = [
    ['unknown', 'klingon-8ball', /not known to this build/],
    ['family-mismatch', 'wpa-9ball', /does not belong to game/],
  ];
  for (const [name, badId, wantRe] of arms) {
    const forged = await forgeWire([5, kernelV, 'fifteen', 1, IDS,
      [[3, 1.1, 0, 0, 0]], [], 'eight_ball', [], badId]);
    await chrome.send('Page.navigate', {
      url: `http://127.0.0.1:${PORT}/app.html?obtool=1&arm=${name}#r=${forged}` });
    await sleep(800);
    ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      await sleep(200);
      ready = await ev('window.__test?.ready === true');
    }
    if (!ready) throw new Error(`V5(${name}): session never became ready`);
    let toast = { text: '', shown: '' };
    for (let i = 0; i < 40; i++) {
      toast = await ev(`(() => { const t = document.getElementById('ob-share-toast');
        return { text: t?.textContent ?? '', shown: t?.style.display ?? '' }; })()`);
      if (toast.text) break;
      await sleep(200);
    }
    if (!wantRe.test(toast.text) || !toast.text.includes(badId)
      || toast.shown !== 'block') {
      fail(`V5(${name}): structured decode error not surfaced in the UI: `
        + JSON.stringify(toast));
    }
    if (await ev('__share.replay().active') !== false) {
      fail(`V5(${name}): a replay started despite the decode error`);
    }
    pass(`V5(${name}): '${badId}' → structured ShareError visible in the UI, `
      + 'no silent fallback (US2 scenario 5)');
  }

  // ---- V6: GH-382 decision 1 — the snooker replay-aware live default --------
  // (owner sign-off recorded on issue #382, 2026-08-07). Two halves of the
  // replay-identity law: a LEGACY-equivalent snooker share (default/keyless
  // variant wire — decode rule 1 resolves the FR-005 alias either way)
  // byte-replays under the FROZEN v1 engine in a fresh receiver, even
  // though that receiver's own fresh frames default to the completion
  // preset (wpbsa-snooker-full). RED under a naive default flip: the
  // replay would fold snooker-v2 (variant() non-null) and the judgment
  // bytes/Continue-from-here pin would diverge from the sender's.
  await ev('localStorage.clear()');
  await chrome.send('Page.navigate', {
    url: `http://127.0.0.1:${PORT}/app.html?obtool=1&arm=v6` });
  await sleep(800);
  ready = false;
  for (let i = 0; i < 200 && !ready; i++) {
    await sleep(200);
    ready = await ev('window.__test?.ready === true'
      + ' && typeof window.__rules?.activateSnooker === "function"');
  }
  if (!ready) throw new Error('V6: sender session never became ready');
  // the sender: a legacy-equivalent session — the PRODUCT game switch
  // (the share recorder pins the settings-side game; the activateSnooker
  // test seam bypasses it and would record nine_ball) + the EXPLICIT v1
  // alias pin, which encodes the same variant wire a pre-flip default
  // session produced (b-slot index 0 — decode rule 1 resolves both to
  // the FR-005 alias)
  if (await ev(
    "window.__settings.changeGame('snooker', { skipConfirm: true })")
    !== true) {
    throw new Error('V6: changeGame(snooker) refused');
  }
  await sleep(600); // table rebuild broadcast
  if (await ev(
    "window.__settings.changeVariant('snooker', 'wpbsa-snooker')")
    !== true) {
    throw new Error('V6: changeVariant(wpbsa-snooker) refused');
  }
  await sleep(400); // fresh-rack in-place re-fold
  // organic play only (the V4 law): find a seed whose opening stroke
  // settles legal with no pending decision
  let sSeed = 0;
  for (const [s, v0] of [[1, 5.0], [2, 5.0], [3, 5.0],
    [1, 6.5], [2, 6.5], [3, 4.0], [4, 5.0], [5, 5.0]]) {
    await ev(`__test.rerack(${s})`);
    await sleep(250);
    const st = await shot(`V6-open-${s}@${v0}`,
      { v0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 });
    const pending = await ev(
      'window.__rules.matchState()?.pendingDecision ?? null');
    const legal = await ev('window.__rules.judgment()?.legal === true');
    if (st === 'AIM' && pending === null && legal) { sSeed = s; break; }
  }
  if (!sSeed) throw new Error('V6: no seed gave a clean v1 opening in 8 tries');
  if (await ev('window.__rules.variant()') !== null) {
    fail('V6: the explicit v1 alias must fold the frozen engine');
  }
  const sRec = {
    url: await ev('__share.encode()'),
    records: await ev('__share.records()'),
    variant: (await ev('__share.log()')).variant,
    judgment: await ev('window.__rules.judgmentJson()'),
  };
  if (sRec.variant !== 'wpbsa-snooker') {
    fail('V6: sender did not pin the v1 alias: ' + JSON.stringify(sRec.variant));
  }
  const sHash = sRec.url.slice(sRec.url.indexOf('#r=') + 3);

  // the receiver: cleared storage, POST-FLIP build — its live default is
  // the completion preset, but the LINK's recorded default must win
  await ev('localStorage.clear()');
  await chrome.send('Page.navigate', {
    url: `http://127.0.0.1:${PORT}/app.html?obtool=1&arm=v6r#r=${sHash}` });
  await sleep(800);
  ready = false;
  for (let i = 0; i < 200 && !ready; i++) {
    await sleep(200);
    ready = await ev('window.__test?.ready === true');
  }
  if (!ready) throw new Error('V6: replay session never became ready');
  let sDone = false;
  for (let i = 0; i < 600 && !sDone; i++) {
    await sleep(300);
    sDone = await ev('__share.replay().done === true');
  }
  if (!sDone) throw new Error('V6: snooker replay never finished');
  // the replay-aware default: an unpinned read DURING the replay resolves
  // the RECORDED default (null), and the fold is the frozen v1 engine
  if (await ev("window.__settings.variantFor('snooker')") !== null) {
    fail('V6: variantFor must resolve the RECORDED default (null) during '
      + 'a legacy replay');
  }
  if (await ev('window.__rules.variant()') !== null) {
    fail('V6: legacy snooker replay folded a variant engine: '
      + JSON.stringify(await ev('window.__rules.variant()')));
  }
  const sRep = {
    records: await ev('__share.records()'),
    judgment: await ev('window.__rules.judgmentJson()'),
    reEncoded: await ev('__share.encode()'),
  };
  if (JSON.stringify(sRep.records) !== JSON.stringify(sRec.records)) {
    fail('V6: snooker record bytes diverged across the replay');
  }
  if (sRep.judgment !== sRec.judgment) {
    fail('V6: snooker judgment fold not byte-identical\n  rec: '
      + sRec.judgment + '\n  rep: ' + sRep.judgment);
  }
  if (sRep.reEncoded.slice(sRep.reEncoded.indexOf('#r=') + 3) !== sHash) {
    fail('V6: Continue-from-here re-share does not keep the sender\'s '
      + 'rulebook wire byte-for-byte');
  }
  pass(`V6a: legacy-equivalent snooker share (seed ${sSeed}) byte-replays `
    + 'under frozen v1 — records, judgment fold, re-encoded wire');

  // the same receiver's OWN fresh frames: the decision-1 live default
  // (POLLED: the default is chain-gated — review r33 — so the read flips
  // from null to the completion preset when the adapter chain settles)
  await chrome.send('Page.navigate', {
    url: `http://127.0.0.1:${PORT}/app.html?obtool=1&arm=v6f` });
  await sleep(800);
  ready = false;
  for (let i = 0; i < 200 && !ready; i++) {
    await sleep(200);
    ready = await ev('window.__test?.ready === true'
      + ' && typeof window.__settings?.variantFor === "function"');
  }
  if (!ready) throw new Error('V6: fresh live session never became ready');
  let liveDflt = null;
  for (let i = 0; i < 50 && liveDflt !== 'wpbsa-snooker-full'; i++) {
    liveDflt = await ev("window.__settings.variantFor('snooker')");
    if (liveDflt !== 'wpbsa-snooker-full') await sleep(200);
  }
  if (liveDflt !== 'wpbsa-snooker-full') {
    fail('V6: a fresh live frame must default to the completion preset '
      + '(decision 1), got ' + JSON.stringify(liveDflt));
  }
  pass('V6b: the same build\'s fresh frames default to wpbsa-snooker-full '
    + '(the decision-1 flip) while legacy links keep pinning v1');

  // ---- V6c: legacy D placements re-apply VERBATIM through a replay ----------
  // (GH-382 review r33 P1 — the kitchen lineExclusive mirror): a pre-r27
  // link could park the in-hand opening seat at the OLD 2r + 1e-9
  // touching separation (the very defect r27 fixed for LIVE drags); the
  // live clearance must never re-legislate a RECORDED seat — a moved
  // seat re-derives a different ShotRecord. Patch the V6 wire's
  // placements[0] onto the brown's touching band and replay: the first
  // replayed record's initial cue seat must carry the forged coordinate
  // BIT-EXACTLY. RED pre-fix: the seat re-projects to 2r + 1e-4.
  const PARK = { x: 0, y: -1.0475 - (2 * 0.02625 + 1e-9) }; // brown − (2r+1e-9)
  const wire6 = await inflateWire(sHash);
  // Wire layout (share.ts): [..., shots(5), placements(6), game(7), ...]
  if (!Array.isArray(wire6[6])) {
    fail('V6c: recorded wire carries no placements axis: '
      + JSON.stringify(wire6[6]));
  }
  wire6[6] = [[0, PARK.x, PARK.y]];
  const forged6 = await forgeWire(wire6);
  await ev('localStorage.clear()');
  await chrome.send('Page.navigate', {
    url: `http://127.0.0.1:${PORT}/app.html?obtool=1&arm=v6c#r=${forged6}` });
  await sleep(800);
  ready = false;
  for (let i = 0; i < 200 && !ready; i++) {
    await sleep(200);
    ready = await ev('window.__test?.ready === true');
  }
  if (!ready) throw new Error('V6c: forged-replay session never became ready');
  let cDone = false;
  for (let i = 0; i < 600 && !cDone; i++) {
    await sleep(300);
    cDone = await ev('__share.replay().done === true');
  }
  if (!cDone) throw new Error('V6c: forged snooker replay never finished');
  const seat = await ev(`(() => {
    const r = JSON.parse(__share.records()[0]);
    const cue = r.initial.balls.find((b) => b.id === 0);
    return JSON.stringify([cue.state.pos.x, cue.state.pos.y]);
  })()`);
  if (seat !== JSON.stringify([PARK.x, PARK.y])) {
    fail('V6c: recorded in-hand D seat was re-legislated on replay '
      + `(want ${JSON.stringify([PARK.x, PARK.y])}, got ${seat})`);
  }
  pass('V6c: a legacy touching-band D seat re-applies VERBATIM through '
    + 'the replay wrap (bit-exact record.initial; Sec3 R5 replay law)');

  // ---- zero console errors across every arm ---------------------------------
  const realErrors = consoleErrors.filter((e) => !/favicon/.test(e));
  if (realErrors.length) {
    fail(`console errors (${realErrors.length}):\n  ` + realErrors.join('\n  '));
  } else {
    pass('zero console errors across all arms');
  }
} catch (e) {
  fail('exception: ' + (e?.stack ?? e));
} finally {
  chrome.close();
  await stopStaticServer(server);
}
console.log(process.exitCode ? 'E2E-VARIANTS: FAILED' : 'E2E-VARIANTS: PASS');
