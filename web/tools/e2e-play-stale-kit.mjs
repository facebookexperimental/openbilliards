// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-stale-kit.mjs — arm P-STALE-KIT-STATES of the play-place gate
// (GH-668 S5 play r5; review review r4 F1 on 37a46b30, blame d9345ecd /
// ca3511cb; the round-5 census (a) of every state play.js sets and kit.css
// paints).
//
// THE LAW JUDGED. The play cards and the variant picks are kit
// `.ob-card-option` parts (GH-668 B-K12); the ownership ledger names the mixed-cache
// pairing FRESH play.js + play.css over a cached PRE-PART kit.css as
// supported ("degrades the cards to un-skinned buttons — functional"). On
// 37a46b30 that pairing lost every register ONLY the kit part paints:
// (A1) the variant pick's aria-current face — picking APA changed the
// persisted pin and the summary stayed hidden (ruling R7), so nothing visible
// moved; (A2) the committed card's aria-current face while a PLAYABLE browse
// is live (the play.css leak guard restates aria-selected only, and its rest
// rule excludes aria-current cards — the committed card painted as a raw UA
// button); (A3) the pick's aria-disabled 0.38 under the shared-replay lock.
// The cure: play.js probes the kit part (the computed
// `--ob-card-option-reserve` on a rail card — the ONLY custom property the
// B-K12 part defines) and marks the host `data-ob-part-fallback="card-option"`
// when it is absent; play.css paints the kit's CURRENT face (dim-3 fill,
// accent hairline, accent ink, hint text-0) and the disabled 0.38 under that
// marker alone (feature-detected, host-scoped; never a global restyle). R7
// stands: the picker now SHOWS the pick on both pairings, so the summary
// stays hidden (a textual line would restore the double statement r2
// removed).
//
// THE STALE KIT IS DERIVED, NEVER READ FROM HISTORY (arms never read git):
// `staleKitSource()` = the CURRENT app/ui/kit.css minus (1) the two
// `.ob-btn--row` rules (the e2e-ui H10k transform restated) and (2) the whole
// B-K12 "option card / row" block (its section header up to the slider
// header) — the two GH-668 S5 parts a pre-part client lacks; the segmented
// (B-K03, GH-667) predates the play lane and stays. The transform refuses by
// name when either landmark is missing or a part rule survives. Served to
// the judged document by Fetch.fulfillRequest with `sw=0` +
// Network.setBypassServiceWorker (the P-STALE-SHELL idiom).
//
// P-STALE-KIT-STATES (stale pairing; 844x390 coarse + 1024x768 fine; an
// eight_ball boot = the two-row picker; the scripted readiness fixture):
//   * STAGED: kit.css fulfilled ≥ 1×, the live CSSOM kit sheet carries NO
//     `.ob-card-option[aria-current="true"]` rule, the reserve property reads
//     empty on a rail card, the host carries the part-fallback marker;
//   * A1: the aria-current pick's computed face (background / border colour
//     / ink) ≠ its sibling's and its hint ink ≠ the sibling's; after
//     `pickVariant(<the other row>)` the pressed face MOVED to that row and is
//     distinct again (the summary state is logged; R7 keeps it hidden);
//   * A2: with the fixture rendered, ArrowRight from the committed card: the
//     committed card (aria-current true / aria-selected false) wears the SAME
//     face as the browsed (aria-selected) card and ≠ an unselected sibling;
//   * A3 (1024 only): the shared-replay lock staged the P-RL way (a one-stroke
//     eight_ball recording — the break, the only stroke the call-shot regime
//     exempts — its #r= link replayed to done, `active` held); at play every
//     pick is aria-disabled and its opacity 0.38 (≠ 1), the lock's exit
//     restores 1;
//   * FRESH pairing unchanged (no interceptor): the kit sheet carries the
//     part, the host carries NO marker, A1 / A2 hold through the kit alone.
// RED on 37a46b30 (A1: cur == sib on both viewports; A2: the committed card
// ≠ the selected face; the marker absent), GREEN ×3 on the fix.
//
// Runs INSIDE e2e-play.mjs (after P-STALE-SHELL on the same +0 / +4 slots;
// PORT_INVENTORY unchanged) and stands alone:
//   node web/tools/e2e-play-stale-kit.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { setPhoneMetrics } from './touch-cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 11 };
export const SHARED_DEFAULT_WINDOW = 'e2e-play';

const SCALE = Number(process.env.OB_E2E_POLL_SCALE) || 1;
const BLOCK_START = '/* ---------- option card / row (GH-668 B-K12)';
const BLOCK_END = '/* ---------- slider';

/** the DERIVED pre-part kit.css (documented transform; refuses by name) */
export function staleKitSource(webDir) {
  const src = fs.readFileSync(path.join(webDir, 'app/ui/kit.css'), 'utf8');
  let out = src.replace(/\.ob-btn--row \.ob-btn__label\s*\{[^}]*\}/g, '').replace(/\.ob-btn--row\s*\{[^}]*\}/g, '');
  if (out === src) throw new Error('staging: the --row rules were not found in app/ui/kit.css — re-derive the pre-part transform');
  const a = out.indexOf(BLOCK_START);
  const z = a >= 0 ? out.indexOf(BLOCK_END, a) : -1;
  if (a < 0 || z < 0) throw new Error('staging: the B-K12 "option card / row" block (or the slider header after it) was not found in app/ui/kit.css — re-derive the pre-part transform');
  out = out.slice(0, a) + out.slice(z);
  if (/\.ob-card-option\[aria-current="true"\]/.test(out) || /\.ob-btn--row\s*\{/.test(out)) throw new Error('staging: a part rule survived the pre-part transform');
  return out;
}

async function waitExpr(c, expr, tries, stepMs) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval(expr)) return true; } catch { /* navigating */ }
    await sleep(stepMs);
  }
  return false;
}
async function waitReady(c) { return waitExpr(c, 'window.__test?.ready === true', (Number(process.env.OB_E2E_READY_TRIES) || 200) * SCALE, 200); }
async function waitPlay(c) {
  return waitExpr(c, `typeof window.__play === 'object' && !!document.querySelector('section[data-place="play"].ob-play-host') && !!document.getElementById('ob-play-css')?.sheet`, 100 * SCALE, 150);
}
async function boot(c) {
  if (!(await waitReady(c))) return false;
  if (!(await waitExpr(c, 'typeof window.__shell === "object" && window.__shell.isOpen()', 60 * SCALE, 150))) return false;
  if (!(await waitPlay(c))) return false;
  await sleep(700);
  return true;
}
/** re-boot the scripted play frame on a persisted discipline */
async function bootGame(c, gid) {
  await c.eval(`(() => { const s = JSON.parse(localStorage.getItem('ob-settings-v1') || '{}'); s.game = ${JSON.stringify(gid)}; localStorage.setItem('ob-settings-v1', JSON.stringify(s)); location.reload(); return true; })()`).catch(() => {});
  await sleep(600);
  return boot(c);
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    else if (method === 'Runtime.exceptionThrown') sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  });
}
const VK = { ArrowRight: 39, End: 35 };
async function pressKey(c, key) {
  for (const type of ['keyDown', 'keyUp']) await c.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: VK[key] ?? 0, nativeVirtualKeyCode: VK[key] ?? 0 });
}
/** the interceptor that answers app/ui/kit.css with the derived sheet */
async function serveStaleKit(c, body) {
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
  const st = { served: 0 };
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    const { requestId, request } = params;
    if (/\/app\/ui\/kit\.css(\?|$)/.test(request.url)) {
      st.served += 1;
      c.send('Fetch.fulfillRequest', { requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/css' }, { name: 'Cache-Control', value: 'no-store' }],
        body: Buffer.from(body).toString('base64') }).catch(() => {});
      return;
    }
    c.send('Fetch.continueRequest', { requestId }).catch(() => {});
  });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*app/ui/kit.css*' }] });
  return st;
}
const FIX = JSON.stringify([{ id: 'fixture_game', display_name: 'Fixture Game', readiness: 'config_ready',
  prerequisites: [{ id: 'fixture-rules', kind: 'ruleset', description: 'Fixture rulebook (synthetic)' }],
  provenance: { body: 'FIX', rulebook: 'Fixture Rules', edition: '2026' } }]);
// page-side probe: the staging facts + the computed faces of the judged nodes
export const FACES = `(() => {
  const face = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { bg: cs.backgroundColor, bc: cs.borderTopColor, color: cs.color, op: cs.opacity }; };
  const sameFace = (a, b) => !!a && !!b && a.bg === b.bg && a.bc === b.bc && a.color === b.color;
  const sec = document.querySelector('section[data-place="play"]'); if (!sec) return { absent: true };
  const g = sec.querySelector('[data-ob="play-games"]');
  const cards = [...(g?.querySelectorAll('[data-ob="play-game"]') ?? [])];
  const picks = [...sec.querySelectorAll('[data-variant-pick]')];
  const hint = (el) => el?.querySelector('.ob-card-option__hint') ?? null;
  let kitPart = null;
  for (const sh of document.styleSheets) { if (!/ui\\/kit\\.css/.test(sh.href || '')) continue; kitPart = false;
    try { for (const r of sh.cssRules) if ((r.selectorText || '').includes('.ob-card-option[aria-current="true"]')) { kitPart = true; break; } } catch { /* opaque */ } }
  const reserveVar = cards[0] ? getComputedStyle(cards[0]).getPropertyValue('--ob-card-option-reserve').trim() : null;
  const cur = cards.find((k) => k.getAttribute('aria-current') === 'true') ?? null;
  const sel = cards.find((k) => k.getAttribute('aria-selected') === 'true') ?? null;
  const sib = cards.find((k) => k.getAttribute('aria-current') !== 'true' && k.getAttribute('aria-selected') !== 'true' && k.getAttribute('data-ob-browsed') !== 'true' && k.getAttribute('aria-disabled') !== 'true') ?? null;
  const pcur = picks.find((p) => p.getAttribute('aria-current') === 'true') ?? null;
  const psib = picks.find((p) => p.getAttribute('aria-current') !== 'true') ?? null;
  const summary = sec.querySelector('[data-ob="play-summary"]');
  return { kitPart, reserveVar, marker: sec.getAttribute('data-ob-part-fallback'), leaf: cards.some((k) => k.classList.contains('ob-cardrail-card')),
    card: { cur: cur && { id: cur.dataset.game, sel: cur.getAttribute('aria-selected'), f: face(cur) }, sel: sel && { id: sel.dataset.game, f: face(sel) }, sib: sib && { id: sib.dataset.game, f: face(sib) },
      curVsSib: cur && sib ? !sameFace(face(cur), face(sib)) : null, curIsSelFace: cur && sel ? sameFace(face(cur), face(sel)) : null },
    pick: { n: picks.length, ids: picks.map((p) => p.dataset.variantPick), cur: pcur?.dataset.variantPick ?? null, f: face(pcur), sib: face(psib), hint: face(hint(pcur))?.color ?? null, sibHint: face(hint(psib))?.color ?? null,
      distinct: pcur && psib ? !sameFace(face(pcur), face(psib)) : null, hintDistinct: pcur && psib ? face(hint(pcur))?.color !== face(hint(psib))?.color : null,
      disabled: picks.map((p) => p.getAttribute('aria-disabled')), opacities: picks.map((p) => face(p).op) },
    summaryHidden: !summary || summary.hidden || summary.getClientRects().length === 0,
    reg: window.__play?.registry?.() ?? null }; })()`;
const brief = (s) => JSON.stringify({ kitPart: s.kitPart, reserve: s.reserveVar ? 'set' : 'empty', marker: s.marker, pick: { cur: s.pick.cur, f: s.pick.f, sib: s.pick.sib, hint: s.pick.hint, sibHint: s.pick.sibHint }, card: { cur: s.card.cur, sel: s.card.sel?.id, sib: s.card.sib?.id, selF: s.card.sel?.f }, summaryHidden: s.summaryHidden });

/** the stale pairing's staging facts */
function judgeStaged(s, fail, tag, served) {
  if (s.absent) { fail(`${tag}: the play section is absent`); return false; }
  const bad = [];
  if (served < 1) bad.push('kit.css was never fulfilled with the derived sheet');
  if (s.kitPart !== false) bad.push(`the live kit sheet must carry NO .ob-card-option[aria-current="true"] rule (kitPart ${s.kitPart})`);
  if (s.reserveVar !== '') bad.push(`--ob-card-option-reserve must read empty on a rail card (${JSON.stringify(s.reserveVar)})`);
  if (!s.leaf) bad.push('the cardrail leaf did not mount (rung-1 register) — the A2 leg needs the leaf');
  if (bad.length) { fail(`${tag}: staging — ${bad.join('; ')} — ${brief(s)}`); return false; }
  // the marker is a JUDGED fact, not a stage: its absence reds by name and the site legs still run (the RED proof shows A1 / A2 too)
  if (!/(^|\s)card-option(\s|$)/.test(s.marker ?? '')) fail(`${tag}: the play host must publish data-ob-part-fallback~="card-option" when the kit part is absent (marker ${JSON.stringify(s.marker)}) — ${brief(s)}`);
  return true;
}
/** A1: the aria-current pick is visibly distinct from its sibling */
function judgePick(s, fail, tag, { expectCur = null } = {}) {
  const bad = [];
  if (s.pick.n < 2) bad.push(`the eight_ball picker must render ≥ 2 picks (${s.pick.n})`);
  if (expectCur && s.pick.cur !== expectCur) bad.push(`the aria-current pick must be ${expectCur} (${s.pick.cur})`);
  if (s.pick.distinct !== true) bad.push('the aria-current pick\'s computed face (background / border colour / ink) equals its sibling\'s — the pick says nothing');
  if (s.pick.hintDistinct !== true) bad.push('the aria-current pick\'s hint ink equals its sibling\'s');
  if (bad.length) { fail(`${tag}: A1 — ${bad.join('; ')} — ${brief(s)}`); return false; }
  return true;
}
/** A2: under a live playable browse the committed card wears the current face (= the selected card's), ≠ an unselected sibling */
function judgeCard(s, fail, tag) {
  const bad = [];
  if (!s.card.cur || !s.card.sel || !s.card.sib) bad.push(`the browse pose needs a committed card, a selected card and an unselected sibling (${JSON.stringify({ cur: s.card.cur?.id, sel: s.card.sel?.id, sib: s.card.sib?.id })})`);
  else {
    if (s.card.cur.id === s.card.sel.id) bad.push('ArrowRight must have browsed a card other than the committed one');
    if (s.card.curVsSib !== true) bad.push('the committed card paints like an unselected sibling');
    if (s.card.curIsSelFace !== true) bad.push(`the committed card (aria-current) must wear the SAME current face as the browsed (aria-selected) card: ${JSON.stringify(s.card.cur.f)} vs ${JSON.stringify(s.card.sel.f)}`);
  }
  if (bad.length) { fail(`${tag}: A2 — ${bad.join('; ')} — ${brief(s)}`); return false; }
  return true;
}
async function pickLeg(c, fail, tag) {
  const s0 = await c.eval(FACES);
  judgePick(s0, fail, `${tag} boot`);
  const other = s0.reg?.variants?.find((v) => !v.current)?.id ?? null;
  if (!other) { fail(`${tag}: registry().variants offers no second row to pick`); return; }
  const ok = await c.eval(`window.__play.pickVariant(${JSON.stringify(other)})`);
  await sleep(500);
  const s1 = await c.eval(FACES);
  if (ok !== true) fail(`${tag}: pickVariant(${other}) must return true (${ok})`);
  judgePick(s1, fail, `${tag} after pickVariant(${other})`, { expectCur: other });
  console.log(`${tag}: pick ${s0.pick.cur} → ${s1.pick.cur}; pressed face ${JSON.stringify(s1.pick.f)} vs sibling ${JSON.stringify(s1.pick.sib)}; hint ${s1.pick.hint} vs ${s1.pick.sibHint}; summary hidden ${s1.summaryHidden} (R7)`);
  // restore the original pin (the blob is this document's own; a later leg reads it)
  await c.eval(`window.__play.pickVariant(${JSON.stringify(s0.pick.cur)})`).catch(() => {});
  await sleep(300);
}
async function cardLeg(c, fail, tag) {
  if (!(await c.eval(`window.__play.previewCatalog(${FIX})`))) { fail(`${tag}: previewCatalog must render the fixture card`); return; }
  await sleep(300);
  await c.eval(`(() => { const k = document.querySelector('section[data-place="play"] [data-ob="play-game"][aria-current="true"]'); k?.focus({ preventScroll: true }); return true; })()`);
  await pressKey(c, 'ArrowRight');
  await sleep(600);
  const s = await c.eval(FACES);
  judgeCard(s, fail, tag);
  console.log(`${tag}: committed ${s.card.cur?.id} ${JSON.stringify(s.card.cur?.f)} | browsed ${s.card.sel?.id} ${JSON.stringify(s.card.sel?.f)} | sibling ${s.card.sib?.id} ${JSON.stringify(s.card.sib?.f)}`);
  await c.eval('window.__play.previewCatalog(null)').catch(() => {});
  await sleep(200);
}
const gate = (errs, tag, fail) => {
  const bad = errs.filter((e) => !/favicon|Failed to load resource/.test(e));
  if (bad.length) fail(`${tag}: page errors: ${bad.slice(0, 3).join(' | ')}`);
  errs.length = 0;
};
async function settleTable(c, tries = 120 * SCALE) {
  for (let i = 0; i < tries; i++) {
    const st = await c.eval('__test.state()').catch(() => null);
    if (st === 'AIM' || st === 'BALL_IN_HAND') return st;
    await sleep(250);
  }
  return null;
}
/** A3: the shared-replay lock (the e2e-play P-RL staging: two strokes, encode, replay to done, the lock HELD) */
async function lockLeg(c, fail, tag, realUrl) {
  await c.eval(`(() => {
    localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'eight_ball' }));
    localStorage.setItem('ob-shell-v1', JSON.stringify({ v: 1, lastPlace: 'play', startAtTable: true }));
    location.reload(); return true; })()`).catch(() => {});
  await sleep(1000);
  if (!(await waitReady(c))) { fail(`${tag}: A3 staging — the table boot never became ready`); return; }
  await c.eval('__test.rerack(1)'); await sleep(300);
  // ONE stroke = the break (eight_ball's call-shot regime exempts the break
  // phase only — flow.js `flow.callRequired`; the P-RL recipe's second
  // stroke would need a call here)
  for (const p of [{ power: 6, phi: Math.PI / 2, a: 0, b: -0.1 }]) {
    const rej = await c.eval(`__test.shoot(${JSON.stringify(p)})`);
    if (rej) { fail(`${tag}: A3 staging — recording stroke refused: ${rej}`); return; }
    const st = await settleTable(c);
    if (!st) { fail(`${tag}: A3 staging — recording stroke never settled`); return; }
  }
  const share = await c.eval('__share.encode()');
  const at = typeof share === 'string' ? share.indexOf('#r=') : -1;
  if (at < 0) { fail(`${tag}: A3 staging — __share.encode() produced no #r= link`); return; }
  // the replay document is SCRIPTED by inheritance (sessionStorage carries
  // `ob-scripted` across same-tab navigations) and a scripted boot builds the
  // shell only under `obshell=1` — the P-RL recipe's plain `realUrl` boots
  // unscripted; here the flag rides the URL so `window.__shell` exists at done
  await c.send('Page.navigate', { url: realUrl('obtool=1&obshell=1&u=stalekit-lock') + '#r=' + share.slice(at + 3) });
  await sleep(800);
  if (!(await waitReady(c))) { fail(`${tag}: A3 staging — the replay session never became ready`); return; }
  if (!(await waitExpr(c, '__share.replay().active === true', 60 * SCALE, 250))) { fail(`${tag}: A3 staging — the shared replay never became active`); return; }
  if (!(await waitExpr(c, '__share.replay().done === true', 600 * SCALE, 300))) { fail(`${tag}: A3 staging — the shared replay never reached done`); return; }
  // a one-stroke replay is done before the shell module's deferred import lands: wait for the surface, then open
  if (!(await waitExpr(c, 'typeof window.__shell === "object" && typeof window.__shell.openShell === "function"', 80 * SCALE, 250))) {
    fail(`${tag}: A3 staging — window.__shell never appeared on the done replay document (${await c.eval('JSON.stringify({ shell: typeof window.__shell, replay: __share.replay(), state: __test.state() })').catch(() => 'n/a')})`); return;
  }
  const opened = await c.eval(`window.__shell.openShell({ place: 'play' })`);
  if (opened !== true) { fail(`${tag}: A3 staging — the shell must open at done (${opened}; ${await c.eval('JSON.stringify({ replay: __share.replay(), state: __test.state(), open: window.__shell.isOpen() })').catch(() => 'n/a')})`); return; }
  if (!(await waitPlay(c))) { fail(`${tag}: A3 staging — play never mounted under the done replay`); return; }
  await c.eval('__shell.go("play"), true'); await sleep(500);
  const s = await c.eval(FACES);
  const bad = [];
  if (s.reg?.locked !== true) bad.push(`registry().locked must be true (${s.reg?.locked})`);
  if (s.pick.n < 2) bad.push(`the eight_ball picker must render ≥ 2 picks (${s.pick.n})`);
  if (!s.pick.disabled.every((d) => d === 'true')) bad.push(`every pick must be aria-disabled under the lock (${JSON.stringify(s.pick.disabled)})`);
  if (!s.pick.opacities.every((o) => Math.abs(parseFloat(o) - 0.38) < 0.01)) bad.push(`every disabled pick must paint at opacity 0.38 (${JSON.stringify(s.pick.opacities)})`);
  if (bad.length) fail(`${tag}: A3 — ${bad.join('; ')} — ${brief(s)}`);
  await c.eval('__share.exit()').catch(() => {});
  await sleep(600);
  const s2 = await c.eval(FACES).catch(() => null);
  if (s2 && !s2.absent && s2.pick.n >= 2 && !s2.pick.opacities.every((o) => parseFloat(o) === 1)) fail(`${tag}: A3 — the lock's exit must restore the picks to opacity 1 (${JSON.stringify(s2.pick.opacities)})`);
  console.log(`${tag}: lock held → picks aria-disabled ${JSON.stringify(s.pick.disabled)} opacity ${JSON.stringify(s.pick.opacities)}; after exit ${JSON.stringify(s2?.pick?.opacities ?? null)}`);
}

export async function armPStaleKitStates({ PORT, CDP_PORT, fail, webDir }) {
  const url = (u) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&sw=0&u=${u}`;
  const realUrl = (q) => `http://127.0.0.1:${PORT}/app.html?sw=0&${q}`;
  const origin = `http://127.0.0.1:${PORT}/`;
  const staleCss = staleKitSource(webDir);
  const f0 = { n: 0 };
  const wrapFail = (m) => { f0.n += 1; fail(m); };
  // ---- STALE pairing: phone 844x390 coarse (+4) and desktop 1024x768 fine (+0)
  for (const [vp, slot] of [['844', CDP_PORT + 4], ['1024', CDP_PORT]]) {
    const errs = [];
    const phone = vp === '844';
    const c = phone ? await launchChrome(origin, { port: slot, tool: false }) : await launchChrome(origin, { port: slot, width: 1024, height: 768, tool: false });
    watchErrors(c, errs);
    if (phone) await setPhoneMetrics(c, { width: 844, height: 390 });
    const st = await serveStaleKit(c, staleCss);
    await c.send('Page.navigate', { url: url('stalekit-' + vp) });
    const tag = `P-STALE-KIT-STATES ${vp}`;
    if (!(await boot(c)) || !(await bootGame(c, 'eight_ball'))) wrapFail(`${tag}: the stale-kit eight_ball boot never mounted play`);
    else {
      const s = await c.eval(FACES);
      if (judgeStaged(s, wrapFail, tag, st.served)) {
        await pickLeg(c, wrapFail, tag);
        await cardLeg(c, wrapFail, tag);
        if (!phone) await lockLeg(c, wrapFail, tag, realUrl);
      }
      gate(errs, tag, wrapFail);
    }
    c.close(); await sleep(400);
  }
  // ---- FRESH pairing unchanged (no interceptor; +4 phone, +0 desktop)
  for (const [vp, slot] of [['844', CDP_PORT + 4], ['1024', CDP_PORT]]) {
    const errs = [];
    const phone = vp === '844';
    const c = phone ? await launchChrome(origin, { port: slot, tool: false }) : await launchChrome(origin, { port: slot, width: 1024, height: 768, tool: false });
    watchErrors(c, errs);
    if (phone) await setPhoneMetrics(c, { width: 844, height: 390 });
    await c.send('Page.navigate', { url: url('freshkit-' + vp) });
    const tag = `P-STALE-KIT-STATES fresh ${vp}`;
    if (!(await boot(c)) || !(await bootGame(c, 'eight_ball'))) wrapFail(`${tag}: the eight_ball boot never mounted play`);
    else {
      const s = await c.eval(FACES);
      if (s.kitPart !== true) wrapFail(`${tag}: the fresh kit sheet must carry the .ob-card-option part (${s.kitPart})`);
      if (s.marker !== null) wrapFail(`${tag}: the fresh pairing must carry NO part-fallback marker (${JSON.stringify(s.marker)})`);
      if (s.reserveVar === '') wrapFail(`${tag}: --ob-card-option-reserve must be defined by the fresh kit`);
      await pickLeg(c, wrapFail, tag);
      await cardLeg(c, wrapFail, tag);
      gate(errs, tag, wrapFail);
    }
    c.close(); await sleep(400);
  }
  if (f0.n === 0) console.log('P-STALE-KIT-STATES OK: the derived pre-part kit.css over the fresh play.js / play.css — the host publishes data-ob-part-fallback="card-option", the aria-current pick is visibly distinct (and moves with pickVariant), the committed card wears the current face under a live playable browse, the locked picks dim to 0.38 (844x390 coarse + 1024x768 fine); the fresh pairing carries no marker and holds the same registers through the kit alone');
  else console.log(`P-STALE-KIT-STATES RED (${f0.n} failure line(s) above)`);
}

// ---- standalone (the gate imports armPStaleKitStates above) ----------------
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPStaleKitStates({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-STALE-KIT FAIL (${n})` : 'E2E-PLAY-STALE-KIT PASS');
}
