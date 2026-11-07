// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-readyink.mjs — arm P-READY-INK of the play-place gate (GH-668 S5
// play visual audit r1, finding V4: the readiness card's whole-card 0.38
// dimmed its sole status badge and the informational meta below legibility).
//
// The law judged here (desktop 1440x900 fine + phone 844x390 coarse; the
// scripted readiness fixture through `__play.previewCatalog`; glass on and
// body.ob-glass-off; en + de; the REST register and the BROWSED register):
//   * THE MUTED VOICE IS THE NAME: the readiness card's `.ob-card-option__name`
//     renders at the kit aria-disabled figure (effective opacity 0.38 ± 0.005
//     through its ancestor chain); the card box itself is opacity 1;
//   * THE INFORMATION READS: the badge, the hint (issuer) and the meta
//     (edition) render at effective opacity 1, and by the kit-laws A2 ground
//     method (the rendered still's modal ground under each run) the hint /
//     meta ink is ≥ 4.5:1 and the badge ink ≥ 3:1;
//   * the kit's cursor / focus composition are untouched (cursor: default);
//   * `previewCatalog(null)` retires the fixture.
// The kit .ob-card-option part has no "muted name" register (its
// aria-disabled rung is whole-card 0.38) — the play sheet carries the INTERIM
// at the atelier-leak-guard specificity (play.css) and the kit follow-up is
// filed; P-ONCE's 0.38 pin is RESTATED onto the name (never weakened).
//
// Runs INSIDE e2e-play.mjs (imported; after P-FADE-CLEAR — reuses the +0
// desktop and +4 phone CDP slots; PORT_INVENTORY unchanged) and stands alone
// for a fast red proof (pre-fix bytes: card opacity 0.38, badge / hint /
// meta effective 0.38 → the A2 ground method reads the badge ≈ 1.6:1):
//   node web/tools/e2e-play-readyink.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';
import { decodePng, judgeTextGround } from './kit-laws.mjs';

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
        && typeof window.__play === 'object' && !!document.getElementById('ob-play-css')?.sheet)()`)) return true;
    } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    else if (method === 'Runtime.exceptionThrown') sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  });
}
const VK = { End: 35 };
async function pressKey(c, key) {
  for (const type of ['keyDown', 'keyUp']) await c.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: VK[key] ?? 0, nativeVirtualKeyCode: VK[key] ?? 0 });
}
async function boot(c) {
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) return false;
  await sleep(700);
  return true;
}
const FIX = (loc) => JSON.stringify([{ id: 'fixture_game', display_name: loc === 'de' ? 'Fixture-Spiel' : 'Fixture Game', readiness: 'config_ready',
  prerequisites: [{ id: 'fixture-rules', kind: 'ruleset', description: 'Fixture rulebook (synthetic)' }],
  provenance: { body: 'FIX', rulebook: 'Fixture Rules', edition: '2026' } }]);

// page-side: the fixture card's leaf runs in the a2TextRunsJs shape (x / y / w / h css px, ink rgba) + the effective opacity chain
const RUNS = `(() => { const k = document.querySelector('section[data-place="play"] [data-ob="play-game"][data-game="fixture_game"]'); if (!k) return null;
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const ink = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data]; };
  const eff = (el) => { let o = 1; for (let a = el; a && a.nodeType === 1; a = a.parentElement) o *= parseFloat(getComputedStyle(a).opacity); return o; };
  const out = [];
  for (const [name, s] of [['name', '.ob-card-option__name'], ['badge', '.ob-card-option__badge'], ['hint', '.ob-card-option__hint'], ['meta', '.ob-card-option__meta']]) {
    const el = k.querySelector(s); if (!el || el.hidden || !el.getClientRects().length) continue;
    const rg = document.createRange(); rg.selectNodeContents(el); const b = [...rg.getClientRects()].find((q) => q.width > 3 && q.height > 3); if (!b) continue;
    const st = getComputedStyle(el); const i = ink(st.color); const a = eff(el);
    out.push({ name, text: el.textContent.trim().slice(0, 28), fs: parseFloat(st.fontSize), ink: [i[0], i[1], i[2], Math.round(Math.min(1, a) * 255)], eff: +a.toFixed(3), x: b.left, y: b.top, w: b.width, h: b.height, cssInk: st.color });
  }
  const cs = getComputedStyle(k);
  return { opacity: cs.opacity, cursor: cs.cursor, browsed: k.getAttribute('data-ob-browsed'), dis: k.getAttribute('aria-disabled'), runs: out }; })()`;

async function judgeInk(c, fail, tag) {
  const [w, h, dpr] = await c.eval('[innerWidth, innerHeight, devicePixelRatio]');
  const r = await c.eval(RUNS);
  if (!r) { fail(`${tag}: the fixture card is not on the rail`); return; }
  const bad = [];
  if (r.dis !== 'true') bad.push(`aria-disabled ${r.dis}`);
  if (Math.abs(parseFloat(r.opacity) - 1) > 0.005) bad.push(`card opacity ${r.opacity} (the card box is not dimmed; the NAME carries the muted voice)`);
  if (r.cursor !== 'default') bad.push(`cursor ${r.cursor} (the kit aria-disabled cursor)`);
  const by = Object.fromEntries(r.runs.map((x) => [x.name, x]));
  if (!by.name) bad.push('no rendered name run');
  else if (Math.abs(by.name.eff - 0.38) > 0.005) bad.push(`name effective opacity ${by.name.eff}, the kit aria-disabled figure is 0.38`);
  if (!by.badge) bad.push('no rendered badge run (the badge IS the status)');
  for (const n of ['badge', 'hint', 'meta']) if (by[n] && Math.abs(by[n].eff - 1) > 0.005) bad.push(`${n} effective opacity ${by[n].eff} (information reads at 1)`);
  // the A2 ground method on the rendered still: hint / meta ≥ 4.5, badge ≥ 3
  const shot = await c.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 / (dpr || 1) } });
  const img = decodePng(Buffer.from(shot.data, 'base64'));
  const text = r.runs.filter((x) => x.name === 'hint' || x.name === 'meta');
  const badge = r.runs.filter((x) => x.name === 'badge');
  bad.push(...judgeTextGround(text, img, { cssW: w, min: 4.5 }).map((v) => `A2 ${v}`));
  bad.push(...judgeTextGround(badge, img, { cssW: w, min: 3 }).map((v) => `A2 badge ${v}`));
  if (bad.length) fail(`${tag}: ${bad.join('; ')} — ${JSON.stringify(r)}`);
  else console.log(`${tag}: card ${r.opacity} name ${by.name.eff} badge ${by.badge.eff} hint ${by.hint?.eff ?? '-'} meta ${by.meta?.eff ?? '-'} (A2 ground ok; browsed ${r.browsed})`);
}
async function register(c, fail, tag) {
  for (const loc of ['en', 'de']) {
    await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`); await sleep(500);
    if (!(await c.eval(`window.__play.previewCatalog(${FIX(loc)})`))) { fail(`${tag}: previewCatalog must render the fixture card`); return; }
    await sleep(300);
    // REST register (the fixture parked at the rail's end, scrolled into the clip so the still holds it)
    await c.eval(`(() => { const g = document.querySelector('[data-ob="play-games"]'); g.scrollLeft = g.scrollWidth; return true; })()`); await sleep(500);
    for (const solid of [false, true]) {
      await c.eval(`(document.body.classList.toggle('ob-glass-off', ${solid}), true)`); await sleep(250);
      await judgeInk(c, fail, `${tag} ${loc} rest ${solid ? 'solid' : 'glass'}`);
    }
    // BROWSED register (End from the current card → data-ob-browsed on the fixture)
    await c.eval(`(document.querySelector('section[data-place="play"] [data-ob="play-game"][aria-current="true"]').focus({ preventScroll: true }), true)`);
    await pressKey(c, 'End'); await sleep(800);
    const browsed = await c.eval(`document.querySelector('[data-ob="play-game"][data-game="fixture_game"]')?.getAttribute('data-ob-browsed')`);
    if (browsed !== 'true') fail(`${tag} ${loc}: End must browse the fixture (data-ob-browsed ${browsed})`);
    for (const solid of [true, false]) {
      await c.eval(`(document.body.classList.toggle('ob-glass-off', ${solid}), true)`); await sleep(250);
      await judgeInk(c, fail, `${tag} ${loc} browsed ${solid ? 'solid' : 'glass'}`);
    }
    await c.eval(`(document.activeElement?.blur?.(), window.__play.previewCatalog(null), true)`); await sleep(300);
  }
  await c.eval(`window.__i18n.setLocale('en')`); await sleep(300);
}
async function gate(c, errs, tag, fail) {
  await sleep(200);
  if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
  if (errs.length) fail(`${tag}: console errors: ${errs.slice(0, 4).join(' | ')}`);
  errs.length = 0;
}
export async function armPReadyInk({ PORT, CDP_PORT, fail }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&${q}`;
  { // ---- desktop 1440x900 (fine)
    const errs = [];
    const c = await launchChrome(url('u=readyink'), { port: CDP_PORT, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-READY-INK desktop: the obshell boot never mounted play');
    else { await register(c, fail, 'P-READY-INK desktop'); await gate(c, errs, 'P-READY-INK desktop', fail); }
    c.close();
  }
  { // ---- phone 844x390 (coarse)
    const errs = [];
    const c = await launchPhone(url('u=readyinkphone'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-READY-INK phone: the phone boot never mounted play');
    else { await register(c, fail, 'P-READY-INK phone'); await gate(c, errs, 'P-READY-INK phone', fail); }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPReadyInk above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPReadyInk({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-READYINK FAIL (${n})` : 'E2E-PLAY-READYINK PASS');
}
