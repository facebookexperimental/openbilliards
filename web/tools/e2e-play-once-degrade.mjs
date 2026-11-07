// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-once-degrade.mjs — arm P-ONCE-DEGRADE of the play-place gate
// (GH-668 S5 play review review r2, P2-1: the said-once rule (R7 /
// B-PL06) hid the S1 `[data-ob="play-summary"]` under the host in EVERY
// register — including the picker-less fallback registers, where the summary
// was the only visible label of the ACTIVE preset: a stale settings module
// (no `variantRows` seam), the rules catalog import failing (`variantRows`
// null forever) and the capability-degraded snooker family (the v2 chain
// fails closed → ONE offered row, the picker hides — a list of one is not a
// list). The card and the Details body cite the catalog's rulebook (WPA /
// WPBSA) while apa-8ball / core is what runs. the ownership ledger working-degradation
// law; integrator ruling: R7 stands beside a visible multi-row picker; a
// degraded register (picker not rendered, or ≤ 1 row) renders ONE compact
// current-preset line — in the summary node, the kit text register
// (--ob-fs--1 / --ob-text-1), the S1 keys (present in every dictionary).
//
// The law judged here (desktop 1440x900 fine + phone 844x390 coarse; every
// pose staged AT THE NETWORK through CDP Fetch on a second document of the
// same profile, the persisted blob pinned first):
//   (a) STALE SETTINGS — `app/settings.js` served without its
//       `api.variantRows = …` line (the pre-034a-mig T009 module), eight_ball
//       committed with `apa-8ball` persisted: the picker is hidden, the
//       ACTIVE preset's name (`settings.variant.apa-8ball`) is painted exactly
//       ONCE in the section, inside `[data-ob="play-summary"]`, whose Game
//       line stays hidden (the card says the game) and whose Rules line
//       computes the kit hint size (--ob-fs--1) in --ob-text-1; the summary's
//       textContent is still the S1 composition (FR-004);
//   (b) NO CATALOG — `dist/pool-sdk/rules/backend.js` served with a THROWING
//       `rulesCatalogJson` (settings' catalog import rejects into its `.catch`;
//       flow keeps its backend and reads the catalog in try / catch — a
//       backend refused outright stalls the boot before the shell opens):
//       `variantRows` answers null, `capabilities().variants` false — the
//       same ONE compact line;
//   (c) DEGRADED SNOOKER — `dist/pool-sdk/games/layouts.js` refused (the
//       REAL fail-closed chain: `snookerGeo` null ⇒ `snookerV2Chain()` false ⇒
//       the completion row is filtered ⇒ ONE offered row, `wpbsa-snooker`),
//       snooker committed: the picker hides and the lone row's label
//       (`settings.variant.wpbsa-snooker`, "…(core)") is the ONE saying;
//   (d) NORMAL — eight_ball fresh with apa-8ball persisted: the two-row picker
//       shows, the summary computes display:none (R7 kept — never a summary
//       beside a visible multi-row picker), the preset name is painted once
//       (the picker row);
//   (e) NOTHING TO NAME — nine_ball fresh (no rows, no pin: the family's
//       rulebook on the card IS the statement): the summary stays hidden;
//   (f) UNLABELLED LONE ROW (review-r2 fix check P3) — pose (c)'s refused
//       layouts.js PLUS `app/settings.js` served with the row's `label:`
//       emptied (a foreign / stale settings module's bare row): the lone
//       row has no label and `variantFor` reads null under the chain gate,
//       so the compact line says the row's ID (`wpbsa-snooker`) — a
//       pinned preset would say its name — never a hidden summary with the
//       active preset unsaid (the `renderSummary` lone-row fallback);
//   the current GAME's name is painted exactly once (the card) in every pose;
//   the compact line follows a locale sync (de on pose (a)).
//
// Runs INSIDE e2e-play.mjs (imported; after P-ONCE — re-uses the +0 desktop
// and +4 phone CDP slots; PORT_INVENTORY unchanged) and stands alone for a
// fast red proof (332e0f2f: poses a / b / c paint the preset name ZERO times —
// the summary hidden under the host, the picker hidden, the card citing WPA):
//   node web/tools/e2e-play-once-degrade.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';

// standalone band shape = e2e-play's (the arm sits on its +0 / +4 slots)
export const PORT_INVENTORY = { http: 1, cdp: 11 };
export const SHARED_DEFAULT_WINDOW = 'e2e-play';

const SCALE = Number(process.env.OB_E2E_POLL_SCALE) || 1;
async function waitReady(c, tries = (Number(process.env.OB_E2E_READY_TRIES) || 200) * SCALE) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitShell(c, tries = 60 * SCALE) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval('typeof window.__shell === "object" && window.__shell.isOpen()')) return true; } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
}
async function waitPlay(c, tries = 100 * SCALE) {
  for (let i = 0; i < tries; i++) {
    try {
      if (await c.eval(`(() => document.querySelector('section[data-place="play"]')?.classList.contains('ob-play-host') === true
        && typeof window.__play === 'object' && !!document.getElementById('ob-play-css')?.sheet
        && !!document.querySelector('section[data-place="play"] [data-ob="play-game"]'))()`)) return true;
    } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
}
/** the catalog's async resolve (settings' backend import → ob:capability): wait for it where the pose expects rows */
async function waitCatalog(c, tries = 30 * SCALE) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval('window.__settings?.capabilities?.().variants === true')) return true; } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    }
  });
}

// ---- the network stage: ONE Fetch handler per Chrome, consulted per pose ----
// (the e2e-play blockUrl idiom: Network.enable BEFORE setCacheDisabled, the
// service-worker bypass, then Fetch.enable; a paused request the page
// abandoned answers "Invalid InterceptionId" — never let it escape)
const POSES = {
  'stale-settings': { game: 'eight_ball', variants: { eight_ball: 'apa-8ball' }, preset: 'settings.variant.apa-8ball', degraded: true, catalog: true },
  'no-catalog': { game: 'eight_ball', variants: { eight_ball: 'apa-8ball' }, preset: 'settings.variant.apa-8ball', degraded: true, catalog: false },
  'snooker-degraded': { game: 'snooker', variants: {}, preset: 'settings.variant.wpbsa-snooker', degraded: true, catalog: true },
  normal: { game: 'eight_ball', variants: { eight_ball: 'apa-8ball' }, preset: 'settings.variant.apa-8ball', degraded: false, catalog: true },
  'nothing-to-name': { game: 'nine_ball', variants: {}, preset: null, degraded: false, catalog: true },
  // (f): the said text is the row's ID, not a dictionary key (presetText)
  'snooker-unlabelled': { game: 'snooker', variants: {}, preset: null, presetText: 'wpbsa-snooker', degraded: true, catalog: true },
};
function stageNet(c, webDir) {
  const net = { pose: null, served: [], error: null };
  const staleSettings = () => {
    const src = fs.readFileSync(path.join(webDir, 'app/settings.js'), 'utf8');
    const out = src.replace(/^[ \t]*api\.variantRows = .*$/m, '  /* STALE (e2e stage): no variantRows seam — the pre-034a-mig T009 module */');
    if (out === src) throw new Error('staging: the `api.variantRows = …` line was not found in app/settings.js');
    return out;
  };
  // the catalog import FAILS at the settings seam (its `.catch` — variantPresets
  // stays null, capabilities().variants false) while the rules backend itself
  // stays live for flow (a refused backend.js stalls the boot before the shell
  // opens — that is a different, louder degrade): the served glue's
  // `rulesCatalogJson` throws; flow's own reads of it sit in try / catch
  const noCatalog = () => {
    const src = fs.readFileSync(path.join(webDir, 'dist/pool-sdk/rules/backend.js'), 'utf8');
    const out = src.replace(/export function rulesCatalogJson\(\) \{/, "export function rulesCatalogJson() { throw new Error('e2e stage: rules catalog unavailable');");
    if (out === src) throw new Error('staging: `export function rulesCatalogJson() {` was not found in dist/pool-sdk/rules/backend.js');
    return out;
  };
  // (f): the shipped settings module with the offered row's label emptied
  const unlabelledSettings = () => {
    const src = fs.readFileSync(path.join(webDir, 'app/settings.js'), 'utf8');
    const out = src.replace(/label: variantName\(r\),/, "label: '', /* UNLABELLED (e2e stage): a foreign settings module's bare row */");
    if (out === src) throw new Error('staging: `label: variantName(r),` was not found in app/settings.js');
    return out;
  };
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    const { requestId, request } = params;
    const fulfil = (body) => c.send('Fetch.fulfillRequest', { requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Cache-Control', value: 'no-store' }],
      body: Buffer.from(body).toString('base64') }).catch(() => {});
    const refuse = () => c.send('Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' }).catch(() => {});
    const go = () => c.send('Fetch.continueRequest', { requestId }).catch(() => {});
    try {
      if (net.pose === 'stale-settings' && /\/app\/settings\.js(\?|$)/.test(request.url)) { net.served.push('settings.js stale'); return fulfil(staleSettings()); }
      if (net.pose === 'no-catalog' && /\/rules\/backend\.js(\?|$)/.test(request.url)) { net.served.push('backend.js catalog throws'); return fulfil(noCatalog()); }
      if (net.pose === 'snooker-degraded' && /\/games\/layouts\.js(\?|$)/.test(request.url)) { net.served.push('layouts.js refused'); return refuse(); }
      if (net.pose === 'snooker-unlabelled' && /\/games\/layouts\.js(\?|$)/.test(request.url)) { net.served.push('layouts.js refused'); return refuse(); }
      if (net.pose === 'snooker-unlabelled' && /\/app\/settings\.js(\?|$)/.test(request.url)) { net.served.push('settings.js unlabelled'); return fulfil(unlabelledSettings()); }
    } catch (e) { net.error = String(e?.message ?? e); }
    return go();
  });
  return net;
}
async function enableNet(c) {
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*app/settings.js*' }, { urlPattern: '*rules/backend.js*' }, { urlPattern: '*games/layouts.js*' }] });
}
const pinBlob = (c, { game, variants }) => c.eval(`(() => { const s = JSON.parse(localStorage.getItem('ob-settings-v1') || '{}');
  s.game = ${JSON.stringify(game)}; s.variants = ${JSON.stringify(variants)}; s.language = 'en';
  localStorage.setItem('ob-settings-v1', JSON.stringify(s)); return true; })()`);

// ---- page-side probe: the summary, the picker, every paint of the game / preset name, the register ----
const MEASURE = (presetKey, presetText = null) => `(() => {
  const sec = document.querySelector('section[data-place="play"]');
  const body = sec?.querySelector('[data-ob="play-body"]');
  if (!sec || !body || !sec.classList.contains('ob-play-host')) return { absent: true };
  const t = (k) => window.__i18n?.t?.(k) ?? null;
  const cs = (n) => getComputedStyle(n);
  const vis = (n) => { if (!n || n.hidden || !n.getClientRects().length) return false;
    for (let e = n; e && e !== document.body; e = e.parentElement) { const c = cs(e); if (c.display === 'none' || c.visibility === 'hidden') return false; } return true; };
  const own = (n) => [...n.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim();
  const s = window.__settings; const game = s?.get?.().game ?? null;
  const gameName = game ? t('game.' + game) : null;
  const key = ${JSON.stringify(presetKey)};
  const preset = ${JSON.stringify(presetText)} ?? (key ? t(key) : null);
  const paintsOf = (txt) => (txt ? [...sec.querySelectorAll('*')].filter((n) => vis(n) && own(n) === txt)
    .map((n) => ({ tag: n.tagName.toLowerCase(), cls: n.className || null, px: +parseFloat(cs(n).fontSize).toFixed(2),
      inSummary: !!n.closest('[data-ob="play-summary"]'), inPicker: !!n.closest('[data-ob="play-variants"]'), inCard: !!n.closest('[data-ob="play-game"]') })) : []);
  const sum = sec.querySelector('[data-ob="play-summary"]');
  const lines = sum ? [...sum.querySelectorAll('p')] : [];
  const probe = document.createElement('span'); probe.style.color = 'var(--ob-text-1)'; probe.style.fontSize = 'var(--ob-fs--1)'; sec.appendChild(probe);
  const want = { color: cs(probe).color, fs: cs(probe).fontSize }; probe.remove();
  const rules = lines[1] ?? null; const val = rules?.querySelector('span') ?? null;
  const variants = sec.querySelector('[data-ob="play-variants"]');
  let rows; try { rows = typeof s?.variantRows === 'function' ? s.variantRows(game) : undefined; } catch { rows = 'threw'; }
  let vf; try { vf = s?.variantFor?.(game) ?? null; } catch { vf = 'threw'; }
  let caps = null; try { caps = s?.capabilities?.() ?? null; } catch { caps = null; }
  return { game, gameName, preset, locale: window.__i18n?.locale?.() ?? null, coarse: matchMedia('(pointer: coarse)').matches, vw: innerWidth,
    stage: { variantRows: typeof s?.variantRows, rows: Array.isArray(rows) ? rows.map((r) => r.id + (r.current ? '*' : '')) : String(rows), labels: Array.isArray(rows) ? rows.map((r) => r.label) : null, variantFor: vf, caps },
    summary: sum ? { display: cs(sum).display, shown: vis(sum), text: sum.textContent, lines: lines.map((p) => p.textContent),
      gameLineShown: vis(lines[0] ?? null), rulesLineShown: vis(rules), fs: rules ? cs(rules).fontSize : null, color: val ? cs(val).color : null } : null,
    want,
    picker: { hidden: variants?.hidden ?? null, shown: variants ? vis(variants) : null, picks: variants ? variants.querySelectorAll('[data-variant-pick]').length : null },
    compose: game ? [t('shell.card.game') + ': ' + gameName, t('shell.card.rules') + ': '] : null,
    gamePaints: paintsOf(gameName), presetPaints: paintsOf(preset), cards: sec.querySelectorAll('[data-ob="play-game"]').length };
})()`;
const brief = (m) => JSON.stringify({ game: m.game, loc: m.locale, stage: m.stage, sum: m.summary && [m.summary.display, m.summary.shown, m.summary.gameLineShown, m.summary.rulesLineShown, m.summary.fs, m.summary.color],
  want: m.want, picker: m.picker, gamePaints: m.gamePaints, presetPaints: m.presetPaints });

/** one pose on one measured frame */
function judgePose(m, fail, tag, pose) {
  if (m.absent) { fail(`${tag}: no mounted play host to judge`); return; }
  const p = POSES[pose];
  if (m.game !== p.game) { fail(`${tag}: staging — the committed game must be ${p.game}, got ${m.game}: ${brief(m)}`); return; }
  // staging proof per pose (the degrade must be REAL, never assumed)
  if (pose === 'stale-settings' && m.stage.variantRows !== 'undefined') fail(`${tag}: staging — the stale settings module must carry NO variantRows seam: ${JSON.stringify(m.stage)}`);
  if (pose === 'no-catalog' && !(m.stage.rows === 'null' && m.stage.caps?.variants === false)) fail(`${tag}: staging — with the catalog import failing variantRows answers null and capabilities().variants is false: ${JSON.stringify(m.stage)}`);
  if (pose === 'snooker-degraded' && !(Array.isArray(m.stage.rows) && m.stage.rows.length === 1 && /^wpbsa-snooker\*?$/.test(m.stage.rows[0])))
    fail(`${tag}: staging — the fail-closed v2 chain must leave ONE offered row (wpbsa-snooker): ${JSON.stringify(m.stage)}`);
  if (pose === 'snooker-unlabelled' && !(Array.isArray(m.stage.rows) && m.stage.rows.length === 1 && /^wpbsa-snooker\*?$/.test(m.stage.rows[0]) && m.stage.labels?.[0] === '' && m.stage.variantFor === null))
    fail(`${tag}: staging — the unlabelled lone row: ONE offered row (wpbsa-snooker) with an EMPTY label and variantFor null: ${JSON.stringify(m.stage)}`);
  if (pose === 'normal' && !(Array.isArray(m.stage.rows) && m.stage.rows.length === 2)) fail(`${tag}: staging — the fresh eight_ball family offers two rows: ${JSON.stringify(m.stage)}`);
  if ((pose === 'stale-settings' || pose === 'no-catalog' || pose === 'normal') && m.stage.variantFor !== 'apa-8ball') fail(`${tag}: staging — variantFor(eight_ball) must read the persisted apa-8ball: ${JSON.stringify(m.stage)}`);
  if (!m.summary) { fail(`${tag}: [data-ob="play-summary"] must exist (contract §3)`); return; }
  // the GAME is said once in every register — the card (R7)
  if (!m.gameName) fail(`${tag}: t('game.${m.game}') must resolve`);
  else if (m.gamePaints.length !== 1 || !m.gamePaints[0].inCard) fail(`${tag}: the current game's name "${m.gameName}" is painted exactly ONCE — the card (R7): ${JSON.stringify(m.gamePaints)}`);
  if (m.summary.gameLineShown) fail(`${tag}: the summary's Game line never paints under the host (the card says the game): ${brief(m)}`);
  // FR-004: the summary's text is still the S1 composition (Game line first)
  if (!m.compose || m.summary.lines.length !== 2 || m.summary.lines[0] !== m.compose[0] || !m.summary.lines[1].startsWith(m.compose[1]) || m.summary.text !== m.summary.lines.join(''))
    fail(`${tag}: FR-004 — the summary reads the S1 composition (${JSON.stringify(m.compose)}): ${JSON.stringify(m.summary.lines)}`);
  if (p.degraded) {
    if (m.picker.shown) fail(`${tag}: staging — the picker must be hidden on a degraded register: ${JSON.stringify(m.picker)}`);
    if (!m.preset) fail(`${tag}: ${p.presetText ? `the said text ${JSON.stringify(p.presetText)}` : `t('${p.preset}')`} must resolve`);
    else if (m.presetPaints.length !== 1) fail(`${tag}: the ACTIVE preset "${m.preset}" must be painted exactly ONCE in the section when the picker cannot show it (review r2 P2-1): ${m.presetPaints.length} paint(s) ${JSON.stringify(m.presetPaints)} — ${brief(m)}`);
    else if (!m.presetPaints[0].inSummary) fail(`${tag}: the ONE preset saying is the compact line in [data-ob="play-summary"]: ${JSON.stringify(m.presetPaints[0])}`);
    if (!m.summary.shown || !m.summary.rulesLineShown) fail(`${tag}: the summary's Rules line is the compact current-preset line on a degraded register (visible): ${brief(m)}`);
    if (m.summary.lines[1] !== `${m.compose[1]}${m.preset}`) fail(`${tag}: the compact line reads "${m.compose[1]}${m.preset}": ${JSON.stringify(m.summary.lines[1])}`);
    if (m.summary.fs !== m.want.fs) fail(`${tag}: the compact line computes the kit hint size --ob-fs--1 (${m.want.fs}): ${m.summary.fs}`);
    if (m.summary.color !== m.want.color) fail(`${tag}: the compact line's value paints --ob-text-1 (${m.want.color}): ${m.summary.color}`);
  } else {
    if (m.summary.display !== 'none' || m.summary.shown) fail(`${tag}: R7 — the summary computes display:none when the rail (and a multi-row picker) say everything: ${brief(m)}`);
    if (pose === 'normal') {
      if (!m.picker.shown || m.picker.picks !== 2) fail(`${tag}: the two-row picker shows on the normal register: ${JSON.stringify(m.picker)}`);
      if (m.presetPaints.length !== 1 || !m.presetPaints[0].inPicker) fail(`${tag}: the preset is said ONCE — the picker row, never a summary beside a visible picker (R7): ${JSON.stringify(m.presetPaints)}`);
    } else if (m.picker.shown) fail(`${tag}: nine_ball offers no rows — no picker: ${JSON.stringify(m.picker)}`);
  }
}

async function gate(c, errs, tag, fail) {
  await sleep(200);
  if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
  if (errs.length) fail(`${tag}: console errors: ${errs.slice(0, 4).join(' | ')}`);
  errs.length = 0;
}
/** pin the blob, arm the pose, boot a second document on the same target, settle */
async function bootPose(c, net, url, pose) {
  const p = POSES[pose];
  await pinBlob(c, p);
  net.pose = pose; net.served = []; net.error = null;
  await c.send('Page.navigate', { url });
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) return false;
  if (p.catalog && pose !== 'stale-settings') await waitCatalog(c);
  await sleep(900); // the capability dispatch + fitPeek's first sync + the fold-snap's deferred re-settle
  if (net.error) throw new Error(net.error);
  return true;
}
async function register(c, net, fail, tag, errs, url, poses) {
  for (const pose of poses) {
    const p = POSES[pose];
    if (!(await bootPose(c, net, url(`u=od-${pose}`), pose))) { fail(`${tag} ${pose}: the staged boot never mounted play (served ${JSON.stringify(net.served)})`); continue; }
    if (p.degraded && !net.served.length) fail(`${tag} ${pose}: staging — nothing was intercepted at the network (the pose did not land)`);
    const m = await c.eval(MEASURE(p.preset, p.presetText ?? null));
    judgePose(m, fail, `${tag} ${pose} [en]`, pose);
    console.log(`${tag} ${pose} [en] served ${JSON.stringify(net.served)} measured: ${brief(m)}`);
    if (pose === 'stale-settings') { // the compact line follows a locale sync
      await c.eval(`window.__i18n.setLocale('de')`);
      await sleep(700);
      const md = await c.eval(MEASURE(p.preset, p.presetText ?? null));
      if (!md.absent && md.locale !== 'de') fail(`${tag} ${pose} [de]: the locale swap did not land: ${brief(md)}`);
      judgePose(md, fail, `${tag} ${pose} [de]`, pose);
      console.log(`${tag} ${pose} [de] measured: ${brief(md)}`);
      await c.eval(`window.__i18n.setLocale('en')`);
      await sleep(400);
    }
    await gate(c, errs, `${tag} ${pose}`, fail);
  }
  net.pose = null;
}
export async function armPOnceDegrade({ PORT, CDP_PORT, fail, webDir }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&${q}`;
  { // ---- desktop 1440x900 (fine): every pose
    const errs = [];
    const c = await launchChrome(url('u=od'), { port: CDP_PORT, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    if (!(await waitReady(c))) fail('P-ONCE-DEGRADE desktop: the warm-up boot never became ready');
    else {
      const net = stageNet(c, webDir);
      await enableNet(c);
      await register(c, net, fail, 'P-ONCE-DEGRADE desktop', errs, url, ['stale-settings', 'no-catalog', 'snooker-degraded', 'normal', 'nothing-to-name', 'snooker-unlabelled']);
    }
    c.close();
  }
  { // ---- phone 844x390 (coarse): the four degraded poses + the normal register
    const errs = [];
    const c = await launchPhone(url('u=odphone'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    if (!(await waitReady(c))) fail('P-ONCE-DEGRADE phone: the warm-up boot never became ready');
    else {
      const net = stageNet(c, webDir);
      await enableNet(c);
      const m0 = await c.eval('matchMedia("(pointer: coarse)").matches');
      if (!m0) fail('P-ONCE-DEGRADE phone: expected the coarse register');
      await register(c, net, fail, 'P-ONCE-DEGRADE phone', errs, url, ['stale-settings', 'no-catalog', 'snooker-degraded', 'normal', 'snooker-unlabelled']);
    }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPOnceDegrade above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPOnceDegrade({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-ONCE-DEGRADE FAIL (${n})` : 'E2E-PLAY-ONCE-DEGRADE PASS');
}
