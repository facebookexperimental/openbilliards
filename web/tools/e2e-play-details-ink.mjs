// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-details-ink.mjs — arm P-DETAILS-INK of the play-place gate (GH-668
// S5 play review review r2, P2-2: the EXPANDED Details body — a
// kit `.ob-hint` block — painted --ob-text-2 straight on the place card's 52 %
// smoke; the kit hint ink is legal only on an opaque --ob-bg step or the
// solid rung (the design charter G7 ground law — on smoke the hint role is
// --ob-text-1), and the e2e-ui A2 walker judges play frames with Details
// COLLAPSED, so no gate had measured the body at all).
//
// FOLLOW-THROUGH (review-r2 fix check, d9345ecd): the fix round's --ob-text-1
// body still read 2.83:1 on glass over a TRUE top-down frame (the checker's
// probe C3 — `__test.setCamera('top')` + camel + 1.4 under the card column:
// the bright cloth IS the ground there, not the hall wall's smoke); the
// fixer's "overhead" staging had never left the orbit frame. Integrator
// ruling: on glass the Details body rides the kit SOLID BACKING register —
// the `.ob-mat-solid` strip the carom fork hint sits on (kit.css material
// ladder / the design charter B-K14; --ob-glass-solid 94 %, no blur, no play-private
// surface; the strip idiom's pad + bleed in play.css) — ink text-1 kept on
// every rung. This arm gained the TOP-DOWN LIGHT leg below.
//
// The law judged here (desktop 1440x900 fine + phone 844x390 coarse; en / de;
// glass + `body.ob-glass-off` solid; TWO frames — the boot orbit frame and
// the top-down frame): (1) the REGISTER — the body computes --ob-text-1 (the
// smoke hint ink; RED on 332e0f2f: text-2 in every cell) AND carries the kit
// `.ob-mat-solid` strip whose computed background is the resolved
// --ob-glass-solid (RED on d9345ecd: no strip in every cell); (2) the GROUND
// — with the scene posed at its lightest shipped register through the real
// settings seams (`clothColor` camel + `brightness` 1.4 + `fixture`
// pendant_bar — the checker's C3 recipe verbatim) and the Details row
// expanded (the committed nine_ball card's citation + sections lines; then
// the scripted readiness fixture browsed (End) — its citation + prerequisites
// line), EVERY painted `.ob-play-details__line` run keeps ≥ 4.5:1 against
// its RENDERED ground by the kit-laws A2 method (a2TextRunsJs + a CSS-px
// still + judgeTextGround — the same probe the e2e-ui audit runs). The
// top-down frame is the one-shot `__test.setCamera('top')` hook (the
// camerapresets.js preset, applied THROUGH the orbit rig; prerequisites
// asserted: the hook is a function and did not refuse — a staging failure
// is a RED line, never a skip). Measured: orbit frame text-2 5.09–5.42
// (332e0f2f), text-1 8.65–8.83 (d9345ecd); top-down frame text-1 on smoke
// 2.83 glass / 8.03 solid (d9345ecd) — the ratios are logged per cell.
//
// Runs INSIDE e2e-play.mjs (imported; after P-CARD — re-uses the +0 desktop
// and +4 phone CDP slots; PORT_INVENTORY unchanged) and stands alone for a
// fast red proof (d9345ecd: the top-down glass cells read < 4.5:1 and no
// cell carries the strip):
//   node web/tools/e2e-play-details-ink.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';
import { a2Sample, judgeTextGround } from './kit-laws.mjs';

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
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    }
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
// the LIGHT scene pose through the real settings seams (persisted in the e2e
// profile only): the camel cloth (the brightest curated colour, GH-229) under
// the 1.4 rig ceiling and the pendant bar fixture (the checker's C3 recipe) —
// the cloth re-tint rides a guarded table.js import, so the pose is confirmed
// from the blob and given time to land; the prior fixture is remembered on
// the window for the restore
const LIGHT = `(() => { const s = window.__settings; if (typeof s?.set !== 'function') return 'no-set';
  window.__dinkPriorFixture = s.get().fixture ?? null;
  s.set('clothColor', 'camel'); s.set('brightness', 1.4); s.set('fixture', 'pendant_bar');
  const g = s.get(); return [g.clothColor, g.brightness, g.fixture].join('/'); })()`;
const UNLIGHT = `(() => { const s = window.__settings; s.set('clothColor', ''); s.set('brightness', 1);
  if (window.__dinkPriorFixture) s.set('fixture', window.__dinkPriorFixture); return true; })()`;
// the TOP-DOWN frame: the one-shot camera preset hook (camerapresets.js
// `top`, wired as __test.setCamera in main.js; applied through the orbit rig)
const CAMERA = (preset) => `(() => { const f = window.__test?.setCamera; if (typeof f !== 'function') return 'no-setCamera';
  let r; try { r = f(${JSON.stringify(preset)}); } catch (e) { return 'threw:' + String(e?.message ?? e); } return r === false ? 'refused' : ${JSON.stringify(preset)}; })()`;
const FIX = (loc) => JSON.stringify([{ id: 'fixture_game', display_name: loc === 'de' ? 'Fixture-Spiel' : 'Fixture Game', readiness: 'config_ready',
  prerequisites: [{ id: 'fixture-rules', kind: 'ruleset', description: 'Fixture rulebook (synthetic)' }],
  provenance: { body: 'FIX', rulebook: 'Fixture Rules', edition: '2026' } }]);
const OPEN = `(() => { const b = document.querySelector('section[data-place="play"] [data-ob="play-details"]'); if (!b) return null;
  if (b.getAttribute('aria-expanded') !== 'true') b.click(); return b.getAttribute('aria-expanded'); })()`;
const CLOSE = `(() => { const b = document.querySelector('section[data-place="play"] [data-ob="play-details"]'); if (b && b.getAttribute('aria-expanded') === 'true') b.click(); return true; })()`;
// the body WHOLE inside the scroller (the capture driver's V7 idiom: a nearest reveal, else the scroller's end)
const REVEAL = `(() => { const body = document.querySelector('[data-ob="play-body"]'); const db = document.querySelector('[data-ob="play-details-body"]'); if (!body || !db) return null;
  db.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const whole = () => { const br = body.getBoundingClientRect(), r = db.getBoundingClientRect(); return r.height > 0 && r.top >= br.top - 1 && r.bottom <= br.bottom + 1; };
  if (!whole()) body.scrollTop = body.scrollHeight;
  return { whole: whole(), top: Math.round(body.scrollTop) }; })()`;
// the body's rect + computed ink + the register probes (--ob-text-1 and
// --ob-glass-solid resolved on the page)
const BODY = `(() => { const db = document.querySelector('[data-ob="play-details-body"]'); if (!db || db.hidden) return null;
  const r = db.getBoundingClientRect(); const cs = getComputedStyle(db);
  const probe = document.createElement('span'); probe.style.color = 'var(--ob-text-1)'; probe.style.backgroundColor = 'var(--ob-glass-solid)'; db.appendChild(probe);
  const pcs = getComputedStyle(probe); const want = pcs.color, wantBg = pcs.backgroundColor; probe.remove();
  return { l: r.left, r: r.right, t: r.top, b: r.bottom, color: cs.color, want, bg: cs.backgroundColor, wantBg, mat: db.classList.contains('ob-mat-solid'),
    hint: db.classList.contains('ob-hint'), game: db.dataset.game ?? null,
    lines: [...db.querySelectorAll('.ob-play-details__line')].map((d) => d.textContent), solid: document.body.classList.contains('ob-glass-off') }; })()`;

/** every painted Details line ≥ 4.5:1 against its rendered ground (A2), the body in --ob-text-1 */
async function judgeBody(c, fail, tag, { expectGame, expectText }) {
  const [w, h, dpr, coarse] = await c.eval(`[innerWidth, innerHeight, devicePixelRatio, matchMedia('(pointer: coarse)').matches]`);
  const rv = await c.eval(REVEAL);
  await sleep(500); // the fold-snap settle
  const b = await c.eval(BODY);
  if (!b) { fail(`${tag}: the Details body is not shown`); return; }
  if (b.game !== expectGame) fail(`${tag}: the Details body must name ${expectGame} (got ${b.game})`);
  if (expectText && !b.lines.some((l) => l.includes(expectText))) fail(`${tag}: the Details body must carry ${JSON.stringify(expectText)}: ${JSON.stringify(b.lines)}`);
  if (!b.hint) fail(`${tag}: the Details body stays the kit .ob-hint role (size / weight / leading): ${JSON.stringify(b)}`);
  if (b.color !== b.want) fail(`${tag}: the Details body computes --ob-text-1 (${b.want}) — the hint role's ink on glass (DESIGN G7 ground law; review r2 P2-2): ${b.color}`);
  if (!b.mat || b.bg !== b.wantBg) fail(`${tag}: the Details body rides the kit SOLID BACKING register — \`.ob-mat-solid\` painting the resolved --ob-glass-solid (${b.wantBg}) under the hint, the carom fork strip's register (review-r2 fix check; kit.css material ladder / DESIGN B-K14): class ${b.mat} bg ${b.bg}`);
  const sampled = await a2Sample(c, { w, h, coarse, dpr, max: 600 }); // GH-877: one state for ink + ground
  if (!sampled.settled) { fail(`${tag}: ${sampled.unsettled} (instrument: attempts ${sampled.attemptsUsed}, settle polls ${sampled.settlePollsUsed})`); return; }
  const runs = sampled.runs
    .filter((t) => /ob-play-details__line/.test(t.name) && t.x >= b.l - 1 && t.x <= b.r && t.y >= b.t - 1 && t.y <= b.b);
  if (runs.length < b.lines.length) { fail(`${tag}: expected ≥ ${b.lines.length} painted Details runs inside the body (whole ${rv?.whole}, scrollTop ${rv?.top}), the A2 walker found ${runs.length}`); return; }
  const img = sampled.img;
  const rows = judgeTextGround(runs, img, { cssW: w, min: 99 }); // min 99 ⇒ every run answers with its measured ratio
  const read = rows.map((s) => ({ ratio: parseFloat(/(\d+\.\d+):1/.exec(s)?.[1] ?? 'NaN'), s }));
  const bad = read.filter((r) => !(r.ratio >= 4.5));
  if (!read.length) fail(`${tag}: no readable ground sample under the Details runs (A2)`);
  for (const r of bad) fail(`${tag}: the expanded Details body must keep ≥ 4.5:1 against its RENDERED ground (kit-laws A2, light scene): ${r.s}`);
  console.log(`${tag}: ${b.solid ? 'solid' : 'glass'} body ${b.color} strip ${b.mat} ${b.bg} runs ${runs.length} ratios ${JSON.stringify(read.map((r) => r.ratio))} (min ${Math.min(...read.map((r) => r.ratio)).toFixed(2)}; whole ${rv?.whole}, scrollTop ${rv?.top})`);
}
async function register(c, fail, tag) {
  const lit = await c.eval(LIGHT);
  if (lit !== 'camel/1.4/pendant_bar') { fail(`${tag}: staging — the light pose did not land (clothColor/brightness/fixture = ${lit})`); return; }
  await sleep(2500); // the cloth re-tint + the lighting apply
  const committed = await c.eval(`window.__settings.get().game`);
  // two frames: the boot ORBIT frame (the hall wall's smoke under the card
  // column) and the TOP-DOWN frame (the bright cloth under the column — the
  // checker's C3 recipe; the leg that read 2.83:1 on d9345ecd)
  for (const frame of ['orbit', 'top']) {
    if (frame === 'top') {
      const cam = await c.eval(CAMERA('top'));
      if (cam !== 'top') { fail(`${tag}: staging — the top-down frame did not land (__test.setCamera('top') → ${cam})`); break; }
      await sleep(2500); // the preset's fov + pose through the orbit rig, the frame re-rendered
    }
    for (const loc of ['en', 'de']) {
      await c.eval(`window.__i18n.setLocale(${JSON.stringify(loc)})`);
      await sleep(600);
      for (const solid of [false, true]) {
        await c.eval(`(document.body.classList.toggle('ob-glass-off', ${solid}), true)`);
        await sleep(300);
        const rung = `${tag} ${frame} [${loc}] ${solid ? 'solid' : 'glass'}`;
        // the committed card's citation + sections
        if ((await c.eval(OPEN)) !== 'true') { fail(`${rung}: the Details row must expand`); continue; }
        await sleep(300);
        await judgeBody(c, fail, `${rung} citation`, { expectGame: committed, expectText: null });
        // the readiness fixture browsed (End) — its citation + prerequisites
        if (!(await c.eval(`window.__play.previewCatalog(${FIX(loc)})`))) fail(`${rung}: previewCatalog must render the fixture card`);
        else {
          await sleep(300);
          await c.eval(`(() => { const k = document.querySelector('section[data-place="play"] [data-ob="play-game"][aria-current="true"]'); k?.focus({ preventScroll: true }); return true; })()`);
          await pressKey(c, 'End');
          await sleep(600);
          await judgeBody(c, fail, `${rung} prerequisites`, { expectGame: 'fixture_game', expectText: 'Fixture rulebook (synthetic)' });
          await c.eval(`(document.activeElement?.blur?.(), window.__play.previewCatalog(null), true)`);
          await sleep(300);
        }
        await c.eval(CLOSE);
        await sleep(200);
      }
      await c.eval(`(document.body.classList.remove('ob-glass-off'), true)`);
    }
  }
  await c.eval(CAMERA('default'));
  await c.eval(`window.__i18n.setLocale('en')`);
  await c.eval(UNLIGHT);
  await sleep(300);
}
async function gate(c, errs, tag, fail) {
  await sleep(200);
  if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
  if (errs.length) fail(`${tag}: console errors: ${errs.slice(0, 4).join(' | ')}`);
  errs.length = 0;
}
export async function armPDetailsInk({ PORT, CDP_PORT, fail }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&${q}`;
  { // ---- desktop 1440x900 (fine)
    const errs = [];
    const c = await launchChrome(url('u=dink'), { port: CDP_PORT, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-DETAILS-INK desktop: the obshell boot never mounted play');
    else { await register(c, fail, 'P-DETAILS-INK desktop'); await gate(c, errs, 'P-DETAILS-INK desktop', fail); }
    c.close();
  }
  { // ---- phone 844x390 (coarse)
    const errs = [];
    const c = await launchPhone(url('u=dinkphone'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-DETAILS-INK phone: the phone boot never mounted play');
    else {
      if (!(await c.eval('matchMedia("(pointer: coarse)").matches'))) fail('P-DETAILS-INK phone: expected the coarse register');
      await register(c, fail, 'P-DETAILS-INK phone');
      await gate(c, errs, 'P-DETAILS-INK phone', fail);
    }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPDetailsInk above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPDetailsInk({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-DETAILS-INK FAIL (${n})` : 'E2E-PLAY-DETAILS-INK PASS');
}
