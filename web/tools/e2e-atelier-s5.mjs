// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-s5.mjs — GH-668 S5 slice 5 (EQUIPMENT polish): the posed,
// per-station twins of the family-wide audit predicates. A LEG MODULE of
// e2e-atelier.mjs (the e2e-atelier-q712.mjs precedent): the suite calls
// runS5 with its band; standalone (`node web/tools/e2e-atelier-s5.mjs`
// under run-gate) runs the same census in isolation for red/green proofs.
//
// Legs landed with G1 (B-EQ01, ruling R12 — the txbar docks to the
// showroom rail; Keep is the frame's one primary; leaving is never silent):
//   S5-K  Keep reachable while staged: table / cloth / balls / lighting +
//         the cloth colour sub-axis staged through REAL card / chip taps at
//         1440x900 (fine), 844x390 and 667x375 (coarse) in en / de / ja —
//         the txbar is up, Keep and Put back sit inside the viewport and
//         hit-test to themselves at their centres (>= 44px tall on coarse),
//         Keep is the ONLY visible .ob-btn--primary on the frame and never
//         wears --row, and Keep sits <= one card-height above the card that
//         staged it; at cues a pick floats WITHOUT a txbar (fast path).
//         RED on the pre-G1 bytes: desktop Keep ~500px from the card in
//         the host column; phone Keep at y 317 inside the 64px host window
//         (centre hit = the host scroller / off-screen).
//   S5-K2 the leave gate: stage at cloth, __atelier.go('table') raises the
//         KIT confirm ([role=alertdialog].ob-confirm) — Esc keeps the stage
//         and the station; Put back reverts exactly and moves; Keep on a
//         scalar (cloth colour) commits then moves; a SHELL-driven exit
//         (__shell.go('play')) reverts and speaks #ob-shell-note =
//         t('atelier.preview.putBack'). RED pre-G1: no confirm, silent.
// Legs landed with G2 (B-EQ02 / B-EQ04 / B-EQ06 — the coarse geometry reads
// the shell seam; atelier.md §7 entry S5-2), one walk = S5-B + S5-G:
//   S5-B  nothing interactive under the shell rail band: every JUDGED
//         button / [role=radio] / range / summary on #ob-atelier,
//         #ob-atelier-rail, #ob-atelier-cue (centre inside its scroll clips;
//         the pinned strip / docked txbar bands count as clips) has
//         rect.bottom <= vh − --ob-shell-reserve-b + 0.5 and hit-tests to
//         itself at its centre — 7 poses (table / cloth / cloth STAGED /
//         balls / lighting / cues / cues + SHEET) × 844x390, 667x375,
//         926x428 × en / de / fr / ja.
//   S5-G  the island gaps are laws of the variables: rail top − host bottom
//         >= sp-2; with a sheet: the rail is WHOLE above it (sheet top −
//         rail bottom >= sp-1) or yielded whole (hidden; never a sliver),
//         the sheet clears the host by sp-2 and is never under the band;
//         without: rail bottom = band top − sp-1
//         ± 1; the publisher (__atelier.bands, --ob-eq-* on :root) exists and
//         writes <= 2 vars over 3 s of idle (no layout feedback loop);
//         it is judged after its first write (a bounded wait: atelier.js
//         writes in a requestAnimationFrame after the mount, #1138).
//         RED on the pre-G2 bytes: no publisher; rail at 38vh + 8 with no
//         sheet (rail bottom 12–17 px off the band law); the sheet's actions
//         under the band.
// Leg landed with G3 (B-EQ03 — legibility over lit felt):
//   S5-C  every painted text run < 18 px on the host + rail (cloth / lighting /
//         balls / cues × 1440x900 + 844x390 × en / de / zh-CN) reads >= 4.5:1
//         against the RENDERED ground of a still (the kit judgeTextGround);
//         dimmed runs are NOT exempt (the ancestor opacity rides the ink
//         alpha — a card name is a decision label); + the stamp census: every
//         rail card wears .ob-card-option + .ob-mat-solid, no whole-card dim,
//         the unselected THUMB at 0.72, chips / tick = kit badges, the coarse
//         sub-row drops the "Colour" caps label. RED pre-G3: the unselected
//         name through the 0.72 card (3.0:1), chips text-2 on the thin tint.
// Legs landed with G4 (B-EQ04 — the strip fits, the rail peeks and counts,
// the colour row shows >= 3 swatches), one coarse walk = S5-L + S5-P:
//   S5-L  the station strip at rest (scroll 0) in 7 locales: at 844x390 /
//         926x428 it rest-fits (scrollWidth <= clientWidth + 1 — the G2
//         host width law); at 667x375, where 500 px cannot fit, it PANS
//         truthfully (kit fade, data-ob-fade-end = 1 and no -start at rest,
//         segment pad >= the kit fit floor 12) — never a bare clip.
//   S5-P  the cards strip under THE PEEK LAW at table / cloth / balls /
//         lighting / cues x 844x390, 667x375, 926x428 x en / de: the kit
//         inline mask + fitPeek's --sf-slot = clip − 2 × peek (peek 40 =
//         32 px of card face + the sp-2 gap), uniform card width = min(447,
//         slot), >= 2 cards in the clip, every partial card >= 32 px inside
//         the mask, a truthful end fade; the "k / n" count = a kit .ob-badge
//         (aria-hidden) in the secondary row, text = t('atelier.rail.count')
//         from data-ob-rail-k / -n, the listbox aria-label carries the same
//         text; at cues: scroll 0 → "1 / n", the 3rd card centred → "3 / n";
//         at cloth: >= 3 whole swatches in a >= 148 px colour row with the
//         kit fade, no "Colour" label. RED pre-G4: no --sf-slot (one card
//         per view), no badge, the bare aria label.
// Legs landed with G5 (B-EQ05 / ruling R13 — host = heading + strip + one
// line, Equip is the primary, the footer is opaque), one walk = S5-H + S5-A:
//   S5-H  the live-rail host under the strip at 1440x900 + 844x390: no
//         station h3 painted in #ob-atelier-cards (the strip pill says it);
//         at cues exactly ONE kit .ob-body line (the cues hint), at table /
//         cloth / balls / lighting none (the prov block is the degrade
//         register's, the lux note gone; the brightness row is a control
//         row); at ARRIVAL (station null, re-arrived through the shell, de /
//         ja) the p.ob-body[data-ob="atelier-arrival"] paints under the strip
//         with text = t('atelier.arrival.hint') and no blank cards pane.
//         RED pre-G5: h3 painted x5 stations, prov lines at table / cloth /
//         balls, the lux note, no arrival line (a 56 px blank pane).
//   S5-A  the cue sheet in 7 locales: exactly ONE .ob-btn--primary = Equip
//         (Equipped = the same primary, disabled, label t(...equipped));
//         Try it + the phone expand = ghost pills; no --row voice, the kit
//         auto-row belt never fires (no label wraps at the 340 px card),
//         pills on the 40 / 44 rung; both disclosure summaries wear the kit
//         .ob-control role. Fine register: the actions row is the pinned
//         footer wearing the kit .ob-mat-opaque (computed ground == opaque
//         --ob-bg-1) + a 1 px --ob-line-0 hairline; with both disclosures
//         open the card scrolls and at every 40 px step a dt / dd whose
//         centre is above the footer hit-tests to the dl (never through
//         the footer), the dossier clears the hairline by sp-2 at full
//         scroll (the Q683 law extended). RED pre-G5: three identical --row
//         pills, caps summaries, the 94 % glass footer (rows read through).
// Leg landed with G6 (B-EQ06 — the hero clears its chrome):
//   S5-M  the float at cues: its SWEPT projected AABB (__atelier.floatRect —
//         rotation-invariant, so every turntable phase is judged) clears
//         every chrome band under it by sp-2 — the shell rail, the quick-play
//         stack (bands() seam) and the showroom rail — and the tip stays in
//         the viewport, at 1440x900, 1280x800 (fine) and 844x390, 667x375
//         (coarse, the sheet presented by a real tap); the fit record
//         (__atelier.floatFrame) shows <= 1 settle correction. The rack
//         (__atelier.subjectRect — the visible balls' AABB + the foot spot;
//         a named SKIP when the getter is absent): at balls on the coarse
//         register its bottom <= 0.40·vh (above the phone rail band); at
//         cloth on the fine register it never meets the quick-play stack.
//         RED pre-G6: no floatRect (the desktop float spanned ~93 % of the
//         viewport height, its butt behind the showroom rail; the coarse
//         balls rack mid-screen under the rail band).
// Leg landed with G7 (B-EQ07 — faces fill >= 60 % of the card):
//   S5-F  every shipped card face under web/assets (13 cue rest stills + 13
//         cue strips + 6 ball-set / 8 table / 5 fixture strips + 6 cloth
//         swatches), decoded from the SERVED bytes by the pinned Chrome: the
//         rest face (frame 0) alpha bbox >= 0.60 of the face area (cues,
//         cloths) / >= 0.60 of the face height (ball sets, tables) / >= 0.45
//         (fixtures); strip geometry = frames x 336x168 (card 32 v3 S1;
//         the cloth stills keep 448x224); the spin minimum is
//         INFO. FROZEN FACE_OK ledger with liveness (a ledgered face that
//         passes is RED). RED pre-G7: the 26 cue faces at 0.06-0.09 (the
//         640x128 full-length register = a 2 px line in the 2:1 well).
// Later groups append their legs here (S5-T — slice-5 PLAN §1 G0 table)
// on the same endpoints. OB_S5_LEGS=K,K2,BG,C,PL,HA,M,F,T,T7B,S filters (red proofs).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone, touchStart, touchEnd } from './touch-cdp.mjs';
import { a2Sample, judgeTextGround } from './kit-laws.mjs';

// one static server + TWO CDP endpoints reused SEQUENTIALLY (every leg closes its Chrome and waits for
// the port to free before the next launch): CDP_PORT = desktop (K desktop, K2), +1 = phones (K 844 / 667, B-G)
export const PORT_INVENTORY = { http: 1, cdp: 2 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports runS5; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dict = (loc) => JSON.parse(fs.readFileSync(path.join(webDir, 'app', 'locales', `${loc}.json`), 'utf8'));
/** A previous leg's Chrome can outlive its c.close() under load (G1 trap): wait until the CDP port refuses. */
async function waitPortFree(port, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    const busy = await new Promise((res) => { const s = net.connect({ port, host: '127.0.0.1' }); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
    if (!busy) return true;
    if (Date.now() - t0 > ms) return false;
    await sleep(250);
  }
}
async function waitReady(c, tries = Number(process.env.OB_E2E_READY_TRIES) || 200) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitExpr(c, expr, tries = 60, ms = 150) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval(expr)) return true; } catch { /* navigating */ }
    await sleep(ms);
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
/** Centre of the first laid-out match of `sel` after a user-like pan into view. */
const centre = (c, sel) => c.eval(`(() => {
  const el = [...document.querySelectorAll(${J(sel)})].find((x) => !x.hidden && x.getBoundingClientRect().width > 0);
  if (!el) return null;
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
/** REAL activation at a point: touch on the coarse register, mouse on fine. */
async function press(c, pt, coarse) {
  if (coarse) { await touchStart(c, [{ x: pt.x, y: pt.y, id: 1 }]); await sleep(40); await touchEnd(c); return; }
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
}
async function toEquipment(c) {
  // the phone boot + the atelier's guarded import take > 9 s on a loaded box (load 60–85 on the
  // shared Mac): a 45 s ceiling, polled — a slow mount is not a red, a missing one is
  if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) return false;
  await waitExpr(c, 'window.__shell.isOpen() === true', 100); // the obshell posed boot opens on its own
  for (let i = 0; i < 6; i++) { // go is idempotent; a closed-at-call shell only POSES the place
    await c.eval(`__shell.go('equipment'), true`);
    if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) return true;
  }
  return false;
}
async function goStation(c, id) {
  await c.eval(`__atelier.go(${J(id)}), true`);
  return waitExpr(c, `window.__atelier.station() === ${J(id)} && !window.__shell.moving()
    && (${J(id)} === 'cues' || [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].some((b) => b.getBoundingClientRect().width > 0))`, 60);
}
/** The txbar / Keep / Put back census the S5-K law reads (one evaluation). */
const CENSUS = `(() => {
  const rr = (el) => { if (!el || el.hidden || !el.getClientRects().length) return null; const r = el.getBoundingClientRect();
    return { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const name = (e) => e ? (e.id ? '#' + e.id : ((e.dataset && e.dataset.ob) || String(e.className).split(' ')[0] || e.tagName)) : null;
  const self = (b) => { if (!b) return { ok: false, top: null }; const r = b.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { ok: e === b || b.contains(e), top: name(e) }; };
  const inView = (q) => !!q && q.l >= -0.5 && q.t >= -0.5 && q.r <= innerWidth + 0.5 && q.b <= innerHeight + 0.5;
  const bar = document.querySelector('[data-ob="atelier-txbar"]');
  const keep = document.querySelector('[data-ob="atelier-keep"]');
  const back = document.querySelector('[data-ob="atelier-revert"]');
  const rail = document.getElementById('ob-atelier-rail');
  const staged = document.querySelector('#ob-atelier-rail .ob-cardrail-card--staged')
    || document.querySelector('#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]');
  const prim = [...document.querySelectorAll('.ob-btn--primary')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !b.closest('[hidden]'); });
  // the atelier's OWN surfaces (host / rail / cue sheet): the "one primary" law is posed there; the
  // shell frame's primaries (quick-play, the place card) are the shell's and are reported, not judged
  const own = prim.filter((b) => b.closest('#ob-atelier, #ob-atelier-rail, #ob-atelier-cue'));
  const sub = document.querySelector('[data-ob="atelier-rail-sub"]');
  const k = rr(keep), s = rr(staged);
  return { host: rr(document.getElementById('ob-atelier')), rail: rr(rail), sub: rr(sub), up: !!bar && !bar.hidden && !!rr(bar), inRail: !!rail && !!bar && rail.contains(bar),
    bar: rr(bar), keep: k, back: rr(back), keepIn: inView(k), backIn: inView(rr(back)),
    keepSelf: self(keep), backSelf: self(back), keepRow: !!keep && keep.classList.contains('ob-btn--row'),
    primaries: own.length, primIsKeep: own.length === 1 && own[0] === keep,
    frameprim: prim.map((b) => name(b) + ':' + (b.textContent || '').trim().slice(0, 16)),
    // LAYOUT distance Keep → staged card: the docked bar pins sticky at the top of a rail that
    // scrolls on the small coarse band (G1 interim; G2 re-derives the band), so the card's
    // position is read back at scroll 0 — the law is proximity in the rail, not the scroll offset
    card: s, gap: (k && s) ? +((s.t + (bar && rail && rail.contains(bar) ? rail.scrollTop : 0)) - k.b).toFixed(1) : null,
    railScroll: rail ? { top: rail.scrollTop, sh: rail.scrollHeight, ch: rail.clientHeight } : null,
    badge: (bar && bar.querySelector('[data-ob="atelier-txstate"]')?.textContent) || null, // GH-1001: the kit .ob-status state marker
    rows: bar ? [...bar.children].map((el) => ({ n: name(el), cls: el.className, r: rr(el) })) : null,
    preview: window.__settings?.preview?.active?.() ?? null, station: window.__atelier.station(),
    confirm: !!document.querySelector('[data-ob="confirm"]') };
})()`;
/** Stage at a station through a REAL user pick: a non-selected rail card
 * (cloth-colour: a non-selected cloth chip). Resolves the picked id. */
async function stageAt(c, pose, coarse) {
  const sel = pose === 'cloth-colour'
    ? '[data-ob="atelier-cloth-colors"] .ob-cloth-chip:not([aria-checked="true"]):not([aria-selected="true"]):not(.ob-cloth-chip--on)'
    : '#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])';
  const pt = await centre(c, sel);
  if (!pt) return null;
  await press(c, pt, coarse);
  const up = await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false`, 40);
  return up ? sel : null;
}
async function putBack(c, coarse) {
  const pt = await centre(c, '[data-ob="atelier-revert"]');
  if (!pt) return false;
  await press(c, pt, coarse);
  return waitExpr(c, `(window.__settings.preview.active() ?? null) === null && document.querySelector('[data-ob="atelier-txbar"]')?.hidden === true`, 40);
}

const POSES = ['table', 'cloth', 'cloth-colour', 'balls', 'lighting', 'cues'];
const LOCALES = ['en', 'de', 'ja'];
export async function runS5K({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  let n = 0; const fail = (m) => { n += 1; failIn(m); }; // GH-558: the done line is withheld on a red leg
  // the literal tuple list bounds `slot` for the GH-687 ci-bands lint (cdp 2: desktop on +0, phones on +1)
  for (const [w, h, kind, slot] of [[1440, 900, 'desktop', 0], [844, 390, 'phone', 1], [667, 375, 'phone', 1]]) {
    const coarse = kind === 'phone';
    const id = `S5-K ${w}x${h}`;
    const errs = [];
    const url = `http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=s5k_${w}`;
    if (!(await waitPortFree(CDP_PORT + slot))) { fail(`${id}: CDP port ${CDP_PORT + slot} still busy from the previous leg`); continue; }
    const c = coarse
      ? await launchPhone(url, { cdpPort: CDP_PORT + slot, width: w, height: h, tool: false })
      : await launchChrome(url, { port: CDP_PORT + slot, width: w, height: h, tool: false });
    watchErrors(c, errs);
    try {
      if (!(await waitReady(c))) { fail(`${id}: boot never became ready`); continue; }
      if (!(await toEquipment(c))) { fail(`${id}: atelier never mounted`); continue; }
      if (!(await waitExpr(c, `window.__atelier.rail().live === true || typeof window.__atelier.rail !== 'function'`, 40))) {
        log(`${id}: rail leaf not live — degrade register, the dock law is not posed here`);
      }
      const posed = [];
      for (const loc of LOCALES) {
        await c.eval(`window.__i18n.setLocale(${J(loc)}), true`);
        await sleep(300);
        const badgeWant = dict(loc)['atelier.preview.badge'];
        for (const pose of POSES) {
          const st = pose === 'cloth-colour' ? 'cloth' : pose;
          const tag = `${id} ${loc}/${pose}`;
          if (!(await goStation(c, st))) { fail(`${tag}: station never presented`); continue; }
          await sleep(250);
          if (pose === 'cues') {
            const pt = await centre(c, '#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])');
            if (!pt) { fail(`${tag}: no cue card to pick`); continue; }
            await press(c, pt, coarse);
            await waitExpr(c, `!!window.__atelier.floatState().id`, 40);
            const z = await c.eval(CENSUS);
            if (z.up) fail(`${tag}: a cue pick is the fast path — no txbar may present: ${J(z)}`);
            if (z.primaries > 1) fail(`${tag}: more than one primary on the atelier surfaces at cues: ${J(z)}`);
            posed.push(pose);
            continue;
          }
          if (!(await stageAt(c, pose, coarse))) { fail(`${tag}: a REAL pick never staged a preview (txbar hidden)`); continue; }
          await sleep(350);
          const z = await c.eval(CENSUS);
          const railLive = await c.eval(`window.__atelier.rail().live === true`);
          const bad = [];
          if (!z.up) bad.push('txbar not up');
          if (railLive && !z.inRail) bad.push('txbar not docked in #ob-atelier-rail');
          if (!z.keepIn) bad.push('Keep outside the viewport');
          if (!z.backIn) bad.push('Put back outside the viewport');
          if (!z.keepSelf.ok) bad.push(`Keep centre hit-tests to ${z.keepSelf.top}`);
          if (!z.backSelf.ok) bad.push(`Put back centre hit-tests to ${z.backSelf.top}`);
          if (coarse && (!z.keep || z.keep.h < 43.5)) bad.push(`Keep under the 44 floor (${z.keep?.h})`);
          if (coarse && (!z.back || z.back.h < 43.5)) bad.push(`Put back under the 44 floor (${z.back?.h})`);
          if (z.keepRow) bad.push('Keep wears --row (the auto-row belt judged its label wrapping)');
          if (z.primaries !== 1 || !z.primIsKeep) bad.push(`primaries on the atelier surfaces = ${z.primaries} (Keep must be the one; frame: ${z.frameprim.join(',')})`);
          if (z.badge !== badgeWant) bad.push(`badge '${z.badge}' != '${badgeWant}'`);
          // one card-height (plus the cloth sub-axis row where it rides between)
          const allow = (z.card?.h ?? 0) + (z.sub ? z.sub.h + 16 : 0) + 1;
          if (coarse && pose === 'cloth-colour' && !z.card && z.sub && z.keep) {
            // GH-668 S5 vfix1 (R-EQ-P1): a CONTROL stage on the coarse rail keeps the chip row and the bar
            // takes the card row's slot — Keep sits within one row of the chips it staged (precision twin)
            const g2 = +(z.sub.t - z.keep.b).toFixed(1);
            if (g2 < -1 || g2 > z.sub.h + 16 + 1) bad.push(`Keep ${g2}px above the chip row (allowed <= ${(z.sub.h + 17).toFixed(1)})`);
          } else if (z.gap === null || z.gap < -1 || z.gap > allow) bad.push(`Keep ${z.gap}px above the staged card (allowed <= ${allow.toFixed(1)})`);
          if (bad.length) fail(`${tag}: ${bad.join('; ')}: ${J(z)}`);
          else posed.push(pose);
          if (!(await putBack(c, coarse))) fail(`${tag}: a REAL Put back never reverted the stage`);
        }
      }
      if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${id}: app errors: ` + J(await c.eval('__test.errors')));
      if (errs.length) fail(`${id}: console errors: ` + errs.slice(0, 3).join(' | '));
      if (n === 0) log(`${id} done: ${posed.length}/${LOCALES.length * POSES.length} poses green (${LOCALES.join('/')})`);
      else log(`${id}: ${n} failure(s) so far — done line withheld`);
    } finally { c.close(); await sleep(600); }
  }
}

const CONFIRM_UP = `!!document.querySelector('[role="alertdialog"].ob-confirm[data-ob="confirm"]')`;
async function trustedKey(c, key, vk) {
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
}
export async function runS5K2({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  let n = 0; const fail = (m) => { n += 1; failIn(m); };
  const id = 'S5-K2 1440x900 en';
  const en = dict('en');
  const errs = [];
  if (!(await waitPortFree(CDP_PORT))) { fail(`${id}: CDP port ${CDP_PORT} still busy from the previous leg`); return; }
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=s5k2`,
    { port: CDP_PORT, width: 1440, height: 900, tool: false });
  watchErrors(c, errs);
  const snap = () => c.eval(`({ station: window.__atelier.station(), place: window.__shell.place(), open: window.__shell.isOpen(),
    preview: window.__settings.preview.active() ?? null, txbar: document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false,
    confirm: ${CONFIRM_UP}, cloth: window.__settings.get().equipment?.cloth_id ?? null, color: window.__settings.get().clothColor,
    title: document.querySelector('[data-ob="confirm"] .ob-panel__title')?.textContent ?? null,
    note: document.getElementById('ob-shell-note')?.textContent ?? null })`);
  const leave = async (to) => { await c.eval(`__atelier.go(${J(to)}), true`); return waitExpr(c, CONFIRM_UP, 40); };
  const answer = async (which) => { const pt = await centre(c, `[data-ob="confirm-${which}"]`); if (!pt) return false; await press(c, pt, false); return true; };
  try {
    if (!(await waitReady(c))) { fail(`${id}: boot never became ready`); return; }
    if (!(await toEquipment(c))) { fail(`${id}: atelier never mounted`); return; }
    await c.eval(`window.__i18n.setLocale('en'), true`);
    if (!(await goStation(c, 'cloth'))) { fail(`${id}: cloth never presented`); return; }
    const base = await snap();
    // (1) the gate is up; Esc = stay, nothing moves
    if (!(await stageAt(c, 'cloth', false))) { fail(`${id}: a REAL cloth pick never staged`); return; }
    if (!(await leave('table'))) fail(`${id}: __atelier.go('table') with a staged preview must raise the kit confirm (RED pre-G1: silent revert + move)`);
    let s = await snap();
    if (s.station !== 'cloth' || !s.preview || !s.txbar) fail(`${id}: while the confirm is up the stage and the station must hold: ${J(s)}`);
    if (s.title !== en['atelier.leave.title']) fail(`${id}: confirm title '${s.title}' != t('atelier.leave.title')`);
    await trustedKey(c, 'Escape', 27);
    if (!(await waitExpr(c, `!(${CONFIRM_UP})`, 40))) fail(`${id}: Escape never dismissed the confirm`);
    await sleep(300);
    s = await snap();
    if (s.station !== 'cloth' || !s.preview || !s.txbar || s.confirm) fail(`${id}: Esc = stay, still staged at cloth: ${J(s)}`);
    // (2) Put back = the R3 exact revert, then the move
    if (!(await leave('table'))) fail(`${id}: second leave never raised the confirm`);
    if (!(await answer('cancel'))) fail(`${id}: no Put back button on the confirm`);
    if (!(await waitExpr(c, `window.__atelier.station() === 'table' && !window.__shell.moving()`, 60))) fail(`${id}: Put back never moved to table`);
    s = await snap();
    if (s.preview !== null || s.txbar || s.cloth !== base.cloth || s.confirm) fail(`${id}: Put back must revert exactly and move: ${J({ s, base })}`);
    // (3) Keep on a SCALAR (cloth colour) commits, then moves — no D14 exit
    if (!(await goStation(c, 'cloth'))) fail(`${id}: cloth never re-presented`);
    if (!(await stageAt(c, 'cloth-colour', false))) fail(`${id}: a REAL chip pick never staged`);
    const stagedColor = await c.eval(`window.__settings.get().clothColor`);
    if (!(await leave('table'))) fail(`${id}: third leave never raised the confirm`);
    if (!(await answer('accept'))) fail(`${id}: no Keep button on the confirm`);
    if (!(await waitExpr(c, `window.__atelier.station() === 'table' && !window.__shell.moving() && (window.__settings.preview.active() ?? null) === null`, 60))) fail(`${id}: Keep never committed + moved`);
    s = await snap();
    if (!s.open || s.place !== 'equipment' || s.color !== stagedColor || s.txbar) fail(`${id}: Keep on a scalar stays in the atelier with the colour committed: ${J({ s, stagedColor })}`);
    // (4) a SHELL-driven exit reverts and SPEAKS
    if (!(await goStation(c, 'cloth'))) fail(`${id}: cloth never re-presented (4)`);
    if (!(await stageAt(c, 'cloth', false))) fail(`${id}: a REAL cloth pick never staged (4)`);
    await c.eval(`__shell.go('play'), true`);
    const spoke = await waitExpr(c, `document.getElementById('ob-shell-note')?.textContent === ${J(en['atelier.preview.putBack'])}`, 20, 100);
    s = await snap();
    if (!spoke) fail(`${id}: the shell exit must speak t('atelier.preview.putBack') (note='${s.note}') — RED pre-G1: silent`);
    if (s.preview !== null || s.place !== 'play' || s.cloth !== base.cloth) fail(`${id}: the shell exit keeps the R3 exact revert: ${J(s)}`);
    if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${id}: app errors: ` + J(await c.eval('__test.errors')));
    if (errs.length) fail(`${id}: console errors: ` + errs.slice(0, 3).join(' | '));
    if (n === 0) log(`${id} done: confirm up / Esc stays / Put back reverts + moves / Keep (scalar) commits + moves / shell exit speaks`);
    else log(`${id}: ${n} failure(s) — done line withheld`);
  } finally { c.close(); await sleep(600); }
}

/** S5-B / S5-G geometry census (GH-668 S5 G2 — B-EQ02 / B-EQ04 / B-EQ06): the
 * shell seam + the atelier's published edges + every interactive control
 * that is visible on the atelier's own surfaces, judged against the band. */
const GEOM = `(() => {
  const vh = innerHeight, vw = innerWidth;
  const cs = getComputedStyle(document.documentElement);
  const rr = (el) => { if (!el || el.hidden || !el.getClientRects().length) return null; const r = el.getBoundingClientRect();
    return { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const name = (e) => e ? (e.id ? '#' + e.id : ((e.dataset && e.dataset.ob) || (e.getAttribute && e.getAttribute('data-station')) || String(e.className).split(' ')[0] || e.tagName)) : null;
  const host = document.querySelector('#ob-shell-cards > section.ob-atelier-host');
  const rail = document.getElementById('ob-atelier-rail');
  const cue = document.getElementById('ob-atelier-cue');
  const strip = document.getElementById('ob-atelier-carousel');
  const bar = document.querySelector('[data-ob="atelier-txbar"]');
  const num = (v) => { v = parseFloat(v); return Number.isFinite(v) ? v : null; };
  const reserveB = num(cs.getPropertyValue('--ob-shell-reserve-b')); // the K05 seam (CSS custom-property read)
  const railTop = num(cs.getPropertyValue('--ob-shell-rail-top'));
  const bandTop = reserveB === null ? null : vh - reserveB;
  // GH-668 S5 vfix1 (R-EQ-P1): the coarse rail anchors one sp-2 above the SHELL RAIL band while it clears
  // the quick-play wrap horizontally (data-ob-rail-anchor = shell) — its controls are judged against that
  // band + the quick-play rect; everything else (and the reserve fallback) keeps the reserve-b law
  const railEl0 = document.getElementById('ob-atelier-rail');
  const railAnchor = railEl0 ? (railEl0.dataset.obRailAnchor || 'reserve') : 'reserve';
  const railBandTop = (railAnchor === 'shell' && railTop !== null) ? railTop - 8 : bandTop;
  const qpB = (window.__shell && typeof window.__shell.bands === 'function') ? window.__shell.bands().quickPlay : null;
  const meetsQp = (v) => !!qpB && v.l < qpB.right && qpB.left < v.r && v.t < qpB.bottom && qpB.top < v.b;
  const H = rr(host), R = rr(rail), S = rr(cue), ST = rr(strip), B = bar && rail && rail.contains(bar) && !bar.hidden ? rr(bar) : null;
  // a control is JUDGED when its centre lies inside every scroll clip above it
  // (host / rail / sheet boxes; the pinned strip + docked txbar bands count as
  // clips for the content that scrolls beneath them) — scrolled-away content
  // is not "under the band", it is out of view
  const visible = (el) => {
    let q = el.getBoundingClientRect(); let v = { l: q.left, t: q.top, r: q.right, b: q.bottom };
    for (let a = el.parentElement; a; a = a.parentElement) {
      const o = getComputedStyle(a).overflowY;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') {
        q = a.getBoundingClientRect();
        v = { l: Math.max(v.l, q.left), t: Math.max(v.t, q.top), r: Math.min(v.r, q.right), b: Math.min(v.b, q.bottom) };
      }
    }
    if (ST && host && host.contains(el) && !strip.contains(el)) v.t = Math.max(v.t, ST.b);
    if (B && rail && rail.contains(el) && !bar.contains(el)) v.t = Math.max(v.t, B.b);
    v.l = Math.max(v.l, 0); v.t = Math.max(v.t, 0); v.r = Math.min(v.r, vw); v.b = Math.min(v.b, vh);
    return (v.r - v.l >= 1 && v.b - v.t >= 1) ? v : null;
  };
  const chain = (el) => { const out = []; for (let a = el.parentElement, i = 0; a && i < 4; a = a.parentElement, i++) out.push(name(a)); return out.join('<'); };
  const under = [], occluded = [], judged = [];
  for (const el of document.querySelectorAll('#ob-atelier button, #ob-atelier [role="radio"], #ob-atelier input[type="range"], #ob-atelier summary, #ob-atelier-rail button, #ob-atelier-rail [role="radio"], #ob-atelier-rail input[type="range"], #ob-atelier-rail summary, #ob-atelier-cue button, #ob-atelier-cue summary')) {
    if (el.closest('[hidden]')) continue;
    // a closed disclosure's content keeps layout boxes under Chrome's
    // ::details-content content-visibility: hidden — not painted, not a control
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true, opacityProperty: true })) continue;
    if ([...document.querySelectorAll('details:not([open])')].some((d) => d.contains(el) && !(d.querySelector(':scope > summary')?.contains(el)))) continue;
    const q = rr(el); if (!q || q.w < 1 || q.h < 1) continue;
    const v = visible(el); if (!v) continue; // scrolled / clipped away: not in view
    const cx = (v.l + v.r) / 2, cy = (v.t + v.b) / 2;
    judged.push(name(el));
    const inRail = !!railEl0 && railEl0.contains(el);
    const top = inRail ? railBandTop : bandTop;
    if (top !== null && v.b > top + 0.5) under.push(name(el) + '@' + v.b.toFixed(1) + '<' + chain(el));
    if (inRail && meetsQp(v)) under.push(name(el) + '@quick-play<' + chain(el));
    const hit = document.elementFromPoint(cx, cy);
    if (!(hit === el || el.contains(hit))) occluded.push(name(el) + '@' + Math.round(cx) + ',' + Math.round(cy) + '->' + name(hit) + '<' + chain(el));
  }
  const eq = (window.__atelier && typeof window.__atelier.bands === 'function') ? window.__atelier.bands() : null;
  const kids = []; if (host) for (const el of host.querySelectorAll(':scope > *, #ob-atelier > *, #ob-atelier-cards > *, #ob-atelier-cards > section > *')) { const q = rr(el); if (q && q.h > 0 && !el.closest('[hidden]')) kids.push(name(el) + ':' + q.t + '-' + q.b); }
  return { vh, vw, reserveB, railTop, bandTop, host: H, kids, rail: R, sheet: S, strip: ST, bar: B, eq,
    eqRootHostB: cs.getPropertyValue('--ob-eq-host-b').trim() || null,
    gapHostRail: (H && R) ? +(R.t - H.b).toFixed(2) : null,
    gapRailSheet: (R && S) ? +(S.t - R.b).toFixed(2) : null,
    railBottomFromBand: (R && bandTop !== null) ? +(bandTop - R.b).toFixed(2) : null,
    railAnchor, railBottomFromShell: (R && railTop !== null) ? +(railTop - R.b).toFixed(2) : null,
    sheetBottomFromBand: (S && bandTop !== null) ? +(bandTop - S.b).toFixed(2) : null,
    railScroll: rail ? { sh: rail.scrollHeight, ch: rail.clientHeight } : null,
    judged: judged.length, judgedNames: judged, under, occluded, station: window.__atelier.station(),
    decision: document.documentElement.classList.contains('ob-shell-decision-up') };
})()`;

const BG_VPS = (process.env.OB_S5_BG_VPS || '844x390,667x375,926x428').split(',').map((v) => v.split('x').map(Number));
const BG_LOCALES = (process.env.OB_S5_BG_LOCALES || 'en,de,fr,ja').split(',');
const BG_POSES = ['table', 'cloth', 'cloth-staged', 'balls', 'lighting', 'cues', 'cues-sheet'];
export async function runS5BG({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  let n = 0; const fail = (m) => { n += 1; failIn(m); };
  for (const [w, h] of BG_VPS) {
    const id = `S5-B/G ${w}x${h}`;
    const errs = [];
    if (!(await waitPortFree(CDP_PORT + 1))) { fail(`${id}: CDP port ${CDP_PORT + 1} still busy from the previous leg`); continue; }
    const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=s5bg_${w}`,
      { cdpPort: CDP_PORT + 1, width: w, height: h, tool: false });
    watchErrors(c, errs);
    try {
      if (!(await waitReady(c))) { fail(`${id}: boot never became ready`); continue; }
      if (!(await toEquipment(c))) { fail(`${id}: atelier never mounted`); continue; }
      if (!(await waitExpr(c, `window.__atelier.rail().live === true`, 40))) { log(`${id}: rail leaf not live — degrade register, the band laws are not posed here`); continue; }
      // #1138: atelier.js writes the G2 variables in a requestAnimationFrame
      // after the mount (scheduleBands → publishBands), so a cold first
      // viewport could read before that write. Wait (bounded) for the
      // publisher's first write, then judge; a publisher that never writes
      // stays red, and the line says the wait ran out
      const wrote = await waitExpr(c, `(window.__atelier.bands?.().writes ?? 0) > 0`, 40);
      if (!(await c.eval(`typeof window.__atelier.bands === 'function' && /px$/.test(getComputedStyle(document.documentElement).getPropertyValue('--ob-eq-host-b').trim())`))) {
        fail(`${id}: the G2 publisher is absent (no __atelier.bands / no --ob-eq-host-b on :root${wrote ? '' : `; no publisher write within ${40 * 150} ms of the live rail`}) — the coarse geometry is guessed, not measured`);
      }
      let posed = 0;
      for (const loc of BG_LOCALES) {
        await c.eval(`window.__i18n.setLocale(${J(loc)}), true`);
        await sleep(300);
        for (const pose of BG_POSES) {
          const st = pose.replace(/-.*$/, '');
          const tag = `${id} ${loc}/${pose}`;
          if (!(await goStation(c, st))) { fail(`${tag}: station never presented`); continue; }
          await sleep(250);
          let staged = false;
          if (pose === 'cloth-staged') { staged = !!(await stageAt(c, 'cloth', true)); if (!staged) { fail(`${tag}: a REAL pick never staged a preview`); continue; } }
          if (pose === 'cues-sheet') {
            const pt = await centre(c, '#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])');
            if (!pt) { fail(`${tag}: no cue card to pick`); continue; }
            await press(c, pt, true);
            if (!(await waitExpr(c, `document.getElementById('ob-atelier-cue')?.hidden === false`, 40))) { fail(`${tag}: the cue sheet never presented`); continue; }
          }
          await sleep(400); // two frames past the rAF-coalesced publisher + the sheet morph
          const z = await c.eval(GEOM);
          const bad = [];
          if (z.reserveB === null) bad.push('no --ob-shell-reserve-b on :root (the K05 seam is absent)');
          if (z.under.length) bad.push(`interactive under the shell band (bottom > ${z.railAnchor === 'shell' ? `${z.railTop - 8} for the rail (shell anchor) / ${z.bandTop} elsewhere` : z.bandTop}): ${z.under.join(' ')}`);
          if (z.occluded.length) bad.push(`centre hit-tests elsewhere: ${z.occluded.join(' ')}`);
          if (z.judged < 3) bad.push(`only ${z.judged} controls judged (strip pills + cards expected)`);
          if (!z.host || (!z.rail && pose !== 'cues-sheet')) bad.push('host or rail not laid out');
          if (z.gapHostRail !== null && z.gapHostRail < 7.5) bad.push(`rail top − host bottom = ${z.gapHostRail} (< sp-2 = 8)`);
          if (pose === 'cues-sheet') {
            if (!z.sheet) bad.push('cue sheet not laid out');
            // the rail either sits WHOLE above the sheet (>= one 44 px row) or yields whole (hidden) — never a sliver
            if (z.rail && z.rail.h > 0.5 && z.rail.h < 43.5) bad.push(`rail sliver ${z.rail.h}px above the sheet (yield law: whole or yielded to 0)`);
            if (z.sheet && z.host && z.sheet.t - z.host.b < 7.5) bad.push(`sheet top − host bottom = ${(z.sheet.t - z.host.b).toFixed(1)} (< sp-2 = 8)`);
            if (z.rail && z.rail.h > 0.5 && z.gapRailSheet !== null && z.gapRailSheet < 3.5) bad.push(`sheet top − rail bottom = ${z.gapRailSheet} (< sp-1 = 4)`);
            if (z.sheetBottomFromBand !== null && z.sheetBottomFromBand < -0.5) bad.push(`sheet bottom ${-z.sheetBottomFromBand}px UNDER the shell band`);
            // the F4 fold law's twin on the seam geometry: both sheet actions + the close are IN the fold
            // (visible, unclipped, self-hit) — a sheet whose actions scroll away is a sheet under the band
            for (const k of ['atelier-equip', 'atelier-tryit', 'atelier-cue-close']) if (!z.judgedNames.includes(k)) bad.push(`${k} not inside the sheet's fold (clipped / absent)`);
          } else if (z.railAnchor === 'shell' && z.railBottomFromShell !== null && Math.abs(z.railBottomFromShell - 8) > 1) {
            bad.push(`rail bottom sits ${z.railBottomFromShell}px above the shell RAIL band (law: sp-2 = 8 ± 1 on the shell anchor, vfix1)`);
          } else if (z.railAnchor !== 'shell' && z.railBottomFromBand !== null && Math.abs(z.railBottomFromBand - 4) > 1) {
            bad.push(`rail bottom sits ${z.railBottomFromBand}px above the shell band (law: sp-1 = 4 ± 1 with no sheet)`);
          }
          if (bad.length) fail(`${tag}: ${bad.join('; ')}: ${J(z)}`); else posed += 1;
          if (pose === 'cues-sheet') { await c.eval(`__atelier.go('table', { force: true }), true`); await sleep(200); }
          if (staged && !(await putBack(c, true))) fail(`${tag}: a REAL Put back never reverted the stage`);
        }
      }
      // the publisher settles: 3 s of idle writes ≤ 2 vars (PLAN §5 risk 4 — no layout feedback loop)
      const w0 = await c.eval(`window.__atelier.bands?.().writes ?? -1`);
      await sleep(3000);
      const w1 = await c.eval(`window.__atelier.bands?.().writes ?? -1`);
      if (w0 >= 0 && w1 - w0 > 2) fail(`${id}: the publisher wrote ${w1 - w0} times over 3 s of idle (feedback loop)`);
      if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${id}: app errors: ` + J(await c.eval('__test.errors')));
      if (errs.length) fail(`${id}: console errors: ` + errs.slice(0, 3).join(' | '));
      if (n === 0) log(`${id} done: ${posed}/${BG_LOCALES.length * BG_POSES.length} poses green (${BG_LOCALES.join('/')}); publisher idle writes ${w1 - w0}`);
      else log(`${id}: ${n} failure(s) so far — done line withheld`);
    } finally { c.close(); await sleep(600); }
  }
}

/** S5-C (GH-668 S5 G3 — B-EQ03): legibility over lit felt on the atelier's OWN
 * surfaces (host + rail). The POSED twin of the family A2 law: every painted
 * text run < 18 px inside #ob-atelier / #ob-atelier-rail, judged by the KIT's
 * judgeTextGround against the RENDERED ground of a Page.captureScreenshot
 * still. One deliberate difference from a2TextRunsJs: a DIMMED run is not
 * exempt — a rail card name is a decision label, so an ancestor opacity
 * (the old 0.72 card dim) is folded into the ink alpha and judged (RED on the
 * pre-G3 bytes: the unselected name 3.0:1). Plus the stamp census: every
 * card wears the kit part + the solid rung, chips / tick the badge voice,
 * no unselected card is dimmed as a whole, its THUMB is. */
const TEXT_RUNS = `(() => {
  const W = innerWidth, HH = innerHeight;
  const cs = (el) => getComputedStyle(el); const px = (v) => parseFloat(v) || 0;
  const vis = (el) => el.getClientRects().length > 0 && cs(el).visibility !== 'hidden';
  const name = (el) => el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.dataset && el.dataset.i18n ? '[' + el.dataset.i18n + ']' : el.dataset && el.dataset.ob ? '[data-ob=' + el.dataset.ob + ']' : (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''));
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const ink = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data]; };
  const eff = (el) => { let o = 1; for (let a = el; a && a.nodeType === 1; a = a.parentElement) o *= px(cs(a).opacity); return o; };
  const out = [];
  for (const rootEl of [document.getElementById('ob-atelier'), document.getElementById('ob-atelier-rail')]) {
    if (!rootEl || rootEl.hidden) continue;
    const walk = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n && out.length < 240; n = walk.nextNode()) {
      if (!n.data.trim()) continue; const p = n.parentElement; if (!p || !vis(p)) continue;
      if (p.closest('script, style, svg, [disabled], [aria-disabled="true"], option, input, textarea')) continue;
      // a CLOSED disclosure's content keeps layout boxes under Chrome's ::details-content
      // content-visibility: hidden — never painted, so a still sampled at its box reads the
      // pane beneath (the G2 census lesson; the prov dossier at balls measured a phantom 3.35:1)
      if (typeof p.checkVisibility === 'function' && !p.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) continue;
      if ([...document.querySelectorAll('details:not([open])')].some((d) => d.contains(p) && !(d.querySelector(':scope > summary')?.contains(p)))) continue;
      const s = cs(p); const fs = px(s.fontSize); if (fs >= 18 || fs < 6) continue;
      const o = eff(p); if (o < 0.05) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      const b0 = [...r.getClientRects()].find((q) => q.width > 3 && q.height > 3); if (!b0) continue;
      // the VISIBLE part of the line box: clipped by every overflow ancestor (the cards strip /
      // the rail / the host scroller) — a card half outside the strip's clip paints nothing there,
      // so the still would read the felt beside it (try 4/5: zh-CN cloth, 1.62:1 on the scene)
      let b = { left: b0.left, top: b0.top, right: b0.right, bottom: b0.bottom };
      for (let a = p.parentElement; a; a = a.parentElement) {
        const st = cs(a); const clip = (v) => v === 'auto' || v === 'scroll' || v === 'hidden' || v === 'clip';
        if (clip(st.overflowX) || clip(st.overflowY)) { const q = a.getBoundingClientRect();
          b = { left: Math.max(b.left, q.left), top: Math.max(b.top, q.top), right: Math.min(b.right, q.right), bottom: Math.min(b.bottom, q.bottom) }; }
      }
      if (b.right - b.left < 8 || b.bottom - b.top < 4) continue; // scrolled / clipped away: not in view
      // GH-668 S5 vfix1 (K-16): a run whose visible box lies inside the cards strip's kit PEEK FADE band
      // (--sf-peek + 16 from either inline edge, the G4 mask) is a scroll affordance, not a reading surface —
      // the still reads the faded card there (zh-CN balls: the selected name as the left peek, 1.90:1)
      const rcEl = p.closest('[data-ob="atelier-rail-cards"]');
      if (rcEl) { const pk = parseFloat(getComputedStyle(rcEl).getPropertyValue('--sf-peek')) || 0; if (pk > 0) { const q = rcEl.getBoundingClientRect(); const band = pk + 16;
        if (b.right <= q.left + band || b.left >= q.right - band) continue; } }
      if (b.left < 6 || b.top < 1 || b.right > W || b.bottom > HH - 1) continue;
      const hit = document.elementFromPoint(b.left + Math.min(3, (b.right - b.left) / 2), b.top + (b.bottom - b.top) / 2);
      if (!hit || !(p.contains(hit) || hit.contains(p))) continue; // covered: not this law
      const k = ink(s.color); k[3] = Math.round((k[3] ?? 255) * Math.min(1, o)); // the dim rides the ink alpha
      out.push({ name: name(p) + (o < 0.99 ? '(dim ' + o.toFixed(2) + ')' : '') + (b.right - b.left < b0.width - 1 ? '(clipped)' : ''), text: n.data.trim().slice(0, 28), fs: +fs.toFixed(2), ink: k, x: b.left, y: b.top, w: b.right - b.left, h: b.bottom - b.top, dim: o < 0.99 });
    }
  }
  return out;
})()`;
const STAMPS = `(() => {
  const cards = [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].filter((b) => b.getBoundingClientRect().width > 0);
  const bad = []; const cs = (el) => getComputedStyle(el);
  for (const b of cards) {
    const sel = b.getAttribute('aria-selected') === 'true', dis = b.getAttribute('aria-disabled') === 'true';
    const tag = (b.dataset.id || '?') + (sel ? '[sel]' : '');
    if (!b.classList.contains('ob-card-option') || !b.classList.contains('ob-mat-solid')) bad.push(tag + ': no kit part / solid rung (' + b.className + ')');
    if (!dis && parseFloat(cs(b).opacity) < 0.99) bad.push(tag + ': the CARD is dimmed (opacity ' + cs(b).opacity + ') — dim the thumb, not the label');
    const th = b.querySelector('.ob-cardrail-thumb'); if (th && !th.hidden) { const o = parseFloat(cs(th).opacity);
      if (!sel && !dis && Math.abs(o - 0.72) > 0.02) bad.push(tag + ': unselected thumb opacity ' + o + ' (law 0.72)');
      if (sel && o < 0.99) bad.push(tag + ': selected thumb dimmed ' + o); }
    const nm = b.querySelector('.ob-cardrail-name'); if (nm && !nm.classList.contains('ob-control')) bad.push(tag + ': name without the control role');
    // a squeezed name (the meta badges eating the coarse row) leaves 1-glyph line boxes the still judge cannot sample — a structural red here (arm W's truncation twin)
    if (nm && nm.clientWidth < 48) bad.push(tag + ': name squeezed to ' + nm.clientWidth + 'px (meta / thumb eat the row)');
    const chip = b.querySelector('.ob-cardrail-chip'); if (chip && !chip.classList.contains('ob-badge')) bad.push(tag + ': chip is not a kit badge');
    const tick = b.querySelector('.ob-cardrail-tick'); if (tick && !tick.hidden && !tick.classList.contains('ob-status')) bad.push(tag + ': equipped mark is not the kit state marker (.ob-status — GH-1001)');
    if (tick && !tick.hidden && tick.textContent.trim() === '✓') bad.push(tag + ': equipped mark is a glyph, not the label');
    const bg = cs(b).backgroundColor; const m = bg.match(/[\\d.]+/g); if (m && m.length === 4 && parseFloat(m[3]) < 0.9 && !sel) bad.push(tag + ': card ground alpha ' + m[3] + ' (thin tint — the solid rung is 0.94)');
  }
  const lab = document.getElementById('ob-atelier-clothcolor-label');
  const coarse = matchMedia('(pointer: coarse)').matches;
  const sub = lab && lab.closest('[data-ob="atelier-rail-sub"]');
  if (sub && !sub.hidden && sub.getClientRects().length > 0) { // the sub-row is posed at the cloth station only
    const shown = lab.getClientRects().length > 0;
    if (coarse && shown) bad.push('the "Colour" caps label is still in the coarse sub-row (B-EQ04)');
    if (!coarse && (!shown || !lab.classList.contains('ob-control'))) bad.push('the desktop "Colour" label is not the control-role line');
  }
  return { cards: cards.length, bad };
})()`;

const C_LOCALES = (process.env.OB_S5_C_LOCALES || 'en,de,zh-CN').split(',');
// vfix1 (verifier P2, B-EQ03 miss): + table with its Advanced disclosure OPEN — the cushion rows'
// `.ob-eq-prov-row__desc` (12 px) read 4.04:1 glass / 3.99:1 solid inside the closed-by-default
// disclosure that S5-C never opened (the still-based capture-525-atelier --s5-pack found it)
const C_STATIONS = ['cloth', 'lighting', 'balls', 'cues', 'table'];
export async function runS5C({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  let n = 0; const fail = (m) => { n += 1; failIn(m); };
  // the literal tuple list bounds `slot` for the GH-687 ci-bands lint (cdp 2: desktop on +0, phone on +1)
  for (const [w, h, kind, slot] of [[1440, 900, 'desktop', 0], [844, 390, 'phone', 1]]) {
    const coarse = kind === 'phone';
    const id = `S5-C ${w}x${h}`;
    const errs = [];
    const url = `http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=s5c_${w}`;
    if (!(await waitPortFree(CDP_PORT + slot))) { fail(`${id}: CDP port ${CDP_PORT + slot} still busy from the previous leg`); continue; }
    const c = coarse
      ? await launchPhone(url, { cdpPort: CDP_PORT + slot, width: w, height: h, tool: false })
      : await launchChrome(url, { port: CDP_PORT + slot, width: w, height: h, tool: false });
    watchErrors(c, errs);
    try {
      if (!(await waitReady(c))) { fail(`${id}: boot never became ready`); continue; }
      if (!(await toEquipment(c))) { fail(`${id}: atelier never mounted`); continue; }
      if (!(await waitExpr(c, `window.__atelier.rail().live === true`, 40))) { log(`${id}: rail leaf not live — degrade register, the card laws are not posed here`); continue; }
      const dpr = await c.eval('devicePixelRatio');
      let posed = 0, runsAll = 0;
      for (const loc of C_LOCALES) {
        await c.eval(`window.__i18n.setLocale(${J(loc)}), true`);
        await sleep(300);
        for (const st of C_STATIONS) {
          const tag = `${id} ${loc}/${st}`;
          if (!(await goStation(c, st))) { fail(`${tag}: station never presented`); continue; }
          if (st === 'table') { // the Advanced disclosure OPEN: its rows are judged like every other run (vfix1 P2)
            const opened = await c.eval(`(() => { const d = document.querySelector('details.ob-atelier-adv'); if (!d) return false; d.open = true; return d.open && d.querySelectorAll('.ob-eq-prov-row__desc').length > 0; })()`);
            if (!opened) { fail(`${tag}: the table Advanced disclosure did not open / has no desc rows`); continue; }
            await sleep(300);
          }
          // the cards strip is browsed one step so an UNSELECTED name sits in the clip beside the selected one
          await c.eval(`(() => { const r = document.querySelector('[data-ob="atelier-rail-cards"]'); const b = r && r.querySelector('.ob-cardrail-card:not([aria-selected="true"])'); if (b) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return true; })()`);
          await sleep(450); // thumbs decode + the publisher settles
          // the strip's scroll-snap (x proximity) animates a snap after the programmatic scroll:
          // read the rects only once scrollLeft is stable over two frames, then still + runs
          // back-to-back (try 4: a name sampled mid-snap landed on the felt beside its card)
          await waitExpr(c, `(() => { const r = document.querySelector('[data-ob="atelier-rail-cards"]'); const x = r ? r.scrollLeft : 0;
            const same = window.__s5cX === x; window.__s5cX = x; return same; })()`, 30, 120);
          const bad = [];
          const z = await c.eval(STAMPS);
          if (z.cards < 1) bad.push('no rail cards laid out');
          bad.push(...z.bad);
          // GH-877: this variant had the same two-moment pair (still BEFORE runs) — one state via a2Sample with its own TEXT_RUNS walker
          try {
            const sampled = await a2Sample(c, { w, h, coarse, dpr, runsJs: TEXT_RUNS });
            if (!sampled.settled) bad.push(`${sampled.unsettled} (instrument: attempts ${sampled.attemptsUsed}, settle polls ${sampled.settlePollsUsed})`);
            else {
              const runs = sampled.runs; runsAll += runs.length;
              if (runs.length < 3) bad.push(`only ${runs.length} text runs collected on the host + rail`);
              bad.push(...judgeTextGround(runs, sampled.img, { cssW: w }));
            }
          } catch (e) { bad.push('still unreadable: ' + (e.message ?? e)); }
          if (bad.length) fail(`${tag}: ${bad.join('; ')}`); else posed += 1;
        }
      }
      if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${id}: app errors: ` + J(await c.eval('__test.errors')));
      if (errs.length) fail(`${id}: console errors: ` + errs.slice(0, 3).join(' | '));
      if (n === 0) log(`${id} done: ${posed}/${C_LOCALES.length * C_STATIONS.length} poses green (${C_LOCALES.join('/')}; ${runsAll} text runs judged >= 4.5:1 against the still)`);
      else log(`${id}: ${n} failure(s) so far — done line withheld`);
    } finally { c.close(); await sleep(600); }
  }
}

/** S5-P / S5-L census (GH-668 S5 G4 — B-EQ04): the cards strip under the kit
 * PEEK LAW (fitPeek), the count badge, the coarse colour row, the station
 * strip's rest-fit — one evaluation at a settled scroll position. */
const PEEK = `(() => {
  const rr = (el) => { if (!el || el.hidden || !el.getClientRects().length) return null; const r = el.getBoundingClientRect();
    return { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const rail = document.getElementById('ob-atelier-rail');
  const rc = document.querySelector('[data-ob="atelier-rail-cards"]');
  const out = { railLive: !!rail && !rail.hidden && !!rc && rc.getClientRects().length > 0 };
  if (out.railLive) {
    const c = rc.getBoundingClientRect(); const cs = getComputedStyle(rc);
    const cards = [...rc.querySelectorAll('.ob-cardrail-card')].filter((b) => !b.hidden && b.getClientRects().length);
    out.n = cards.length; out.clip = +c.width.toFixed(1); out.client = rc.clientWidth; out.sw = rc.scrollWidth; out.sl = +rc.scrollLeft.toFixed(1);
    out.slot = rc.style.getPropertyValue('--sf-slot').trim() || null; out.peek = rc.style.getPropertyValue('--sf-peek').trim() || null;
    out.sfw = rc.style.getPropertyValue('--sf-w').trim() || null;
    out.k = rc.dataset.obRailK ?? null; out.nn = rc.dataset.obRailN ?? null;
    out.fadeStart = rc.dataset.obFadeStart ?? null; out.fadeEnd = rc.dataset.obFadeEnd ?? null;
    out.kit = rc.classList.contains('ob-scrollfade'); out.maskX = rc.classList.contains('ob-scrollfade--mask-x');
    out.maskImg = (cs.maskImage && cs.maskImage !== 'none') || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none');
    out.cards = cards.map((b) => { const r = b.getBoundingClientRect(); const w = Math.min(r.right, c.right) - Math.max(r.left, c.left);
      return { id: b.dataset.id, w: +r.width.toFixed(1), vis: +Math.max(0, w).toFixed(1), partial: w > 0.5 && w < r.width - 0.5 }; });
    out.widths = [...new Set(out.cards.map((v) => v.w))];
    out.label = rc.getAttribute('aria-label');
    const badge = document.querySelector('[data-ob="atelier-rail-count"]'); const sub = document.querySelector('[data-ob="atelier-rail-sub"]');
    out.badge = badge ? { hidden: badge.hidden || !badge.getClientRects().length, text: (badge.textContent || '').trim(), cls: badge.className,
      ariaHidden: badge.getAttribute('aria-hidden'), inSub: !!sub && sub.contains(badge),
      // GH-668 S5 vfix1 (R-EQ-P1): the badge's coarse home is the station strip's trailing slot (no count-only row)
      inStrip: (() => { const st = document.getElementById('ob-atelier-carousel'); if (!st || !st.contains(badge)) return false; const a = badge.getBoundingClientRect(), s = st.getBoundingClientRect(); return a.left >= s.left - 0.5 && a.right <= s.right + 0.5 && a.top >= s.top - 0.5 && a.bottom <= s.bottom + 0.5; })(),
      r: rr(badge) } : null;
    out.sub = rr(sub); out.subHidden = !sub || sub.hidden;
    const box = document.querySelector('#ob-atelier-rail [data-ob="atelier-cloth-colors"]');
    // judged by PAINT, not the hidden attribute (an id-weighted display beat the UA [hidden] rule — the G4 stills)
    if (box && box.getClientRects().length && getComputedStyle(box).display !== 'none') {
      const br = box.getBoundingClientRect(); const bs = getComputedStyle(box);
      const chips = [...box.querySelectorAll('.ob-cloth-chip')].filter((ch) => ch.getClientRects().length);
      out.colors = { w: +br.width.toFixed(1), client: box.clientWidth, sw: box.scrollWidth, n: chips.length,
        whole: chips.filter((ch) => { const r = ch.getBoundingClientRect(); return r.left >= br.left - 0.5 && r.right <= br.right + 0.5 && r.width >= 43.5; }).length,
        kit: box.classList.contains('ob-scrollfade'), fadeEnd: box.dataset.obFadeEnd ?? null, fadeStart: box.dataset.obFadeStart ?? null,
        overflowX: bs.overflowX, label: (() => { const l = document.getElementById('ob-atelier-clothcolor-label'); return l ? (l.getClientRects().length > 0) : null; })() };
    } else out.colors = null;
  }
  const strip = document.getElementById('ob-atelier-carousel');
  if (strip) {
    const ss = getComputedStyle(strip); const seg = strip.querySelector('.ob-strip__seg, [data-station]');
    const sg = seg ? getComputedStyle(seg) : null;
    out.strip = { client: strip.clientWidth, sw: strip.scrollWidth, sl: +strip.scrollLeft.toFixed(1), kit: strip.classList.contains('ob-scrollfade'),
      fadeStart: strip.dataset.obFadeStart ?? null, fadeEnd: strip.dataset.obFadeEnd ?? null, segs: strip.querySelectorAll('[data-station]').length,
      segPad: sg ? +Math.min(parseFloat(sg.paddingLeft), parseFloat(sg.paddingRight)).toFixed(1) : null, pad: +parseFloat(ss.paddingLeft).toFixed(1),
      host: rr(document.querySelector('#ob-shell-cards > section.ob-atelier-host')) };
  } else out.strip = null;
  return out;
})()`;
/** scrollLeft stable over two frames (the strip's x-proximity snap animates after a programmatic scroll — G3 lesson). */
const settled = async (c, sel) => {
  await c.eval(`(() => { const el = document.querySelector(${J(sel)}); if (el) { el.__s5x = NaN; el.__s5n = 0; } return true; })()`);
  return waitExpr(c, `(() => { const el = document.querySelector(${J(sel)}); if (!el) return true;
    const x = el.scrollLeft; if (el.__s5x === x) { el.__s5n = (el.__s5n || 0) + 1; } else { el.__s5x = x; el.__s5n = 0; } return el.__s5n >= 2; })()`, 40, 60);
};
const PL_VPS = (process.env.OB_S5_PL_VPS || '844x390,667x375,926x428').split(',').map((v) => v.split('x').map(Number));
const L_LOCALES = (process.env.OB_S5_L_LOCALES || 'en,de,es,fr,ja,ko,zh-CN').split(',');
const P_LOCALES = (process.env.OB_S5_P_LOCALES || 'en,de').split(',');
const P_STATIONS = ['table', 'cloth', 'balls', 'lighting', 'cues'];
const RAIL_SEL = '[data-ob="atelier-rail-cards"]';
/** S5-L: the station strip at rest in one locale (scroll 0, settled). */
function judgeStrip(st, w) {
  const bad = [];
  if (!st) return ['no station strip'];
  const fits = st.sw <= st.client + 1;
  if (w >= 844 && !fits) bad.push(`strip clips ${st.sw - st.client} px at rest (sw ${st.sw} > cw ${st.client}; the G2 host width law rest-fits ${st.segs} segments here)`);
  if (!fits) {
    if (!st.kit) bad.push('the panning strip wears no kit fade');
    if (st.fadeEnd !== '1') bad.push(`strip clips at rest but data-ob-fade-end is ${st.fadeEnd} (a lying fade)`);
    if (st.fadeStart !== null) bad.push(`strip at scroll 0 carries data-ob-fade-start ${st.fadeStart}`);
    if (st.segPad === null || st.segPad < 11.5) bad.push(`strip segment pad ${st.segPad} under the kit fit floor 12`);
  } else if (st.fadeEnd !== null || st.fadeStart !== null) bad.push(`strip fits but carries fade flags start ${st.fadeStart} / end ${st.fadeEnd}`);
  return bad;
}
/** S5-P: the cards strip + count + colour row at one coarse station pose. */
function judgePeek(z, d) {
  const bad = [];
  const fmt = (k, n) => (d['atelier.rail.count'] || '{k} / {n}').replace('{k}', k).replace('{n}', n);
  if (z.n > 1) {
    if (!z.kit || !z.maskX) bad.push(`cards strip without the kit inline mask (kit ${z.kit} maskX ${z.maskX})`);
    if (!z.slot || !z.peek) bad.push(`no --sf-slot / --sf-peek on the strip (fitPeek not mounted: slot ${z.slot} peek ${z.peek})`);
    else {
      const slot = parseFloat(z.slot), peek = parseFloat(z.peek);
      if (Math.abs(slot - (z.client - 2 * peek)) > 1) bad.push(`--sf-slot ${slot} != clip ${z.client} − 2 × peek ${peek}`);
      if (peek < 39.5) bad.push(`peek ${peek} < 40 (32 px of card face + the sp-2 gap)`);
      const want = Math.min(447, slot);
      if (z.widths.length !== 1) bad.push(`card widths not uniform: ${z.widths.join('/')}`);
      else if (Math.abs(z.widths[0] - want) > 1) bad.push(`card width ${z.widths[0]} != min(447, slot ${slot}) = ${want}`);
      if (z.sfw && parseFloat(z.sfw) < peek + 15.5) bad.push(`mask band ${z.sfw} < peek + 16`);
    }
    const shown = z.cards.filter((v) => v.vis > 0.5);
    if (shown.length < 2) bad.push(`only ${shown.length} card visible in the clip (the one-card view): ${J(z.cards.map((v) => v.vis))}`);
    for (const v of z.cards) if (v.partial && v.vis < 31.5) bad.push(`card ${v.id} peeks ${v.vis} px inside the mask (< 32)`);
    if (z.sw > z.client + 1 && z.sl < 1 && z.fadeEnd !== '1') bad.push(`strip clips at rest but data-ob-fade-end is ${z.fadeEnd}`);
    if (String(z.nn) !== String(z.n)) bad.push(`data-ob-rail-n ${z.nn} != ${z.n} cards`);
    const text = fmt(z.k, z.nn);
    if (!z.badge) bad.push('no [data-ob="atelier-rail-count"] badge');
    else {
      if (z.badge.hidden) bad.push('count badge hidden on the coarse register');
      if (z.badge.text !== text) bad.push(`count badge reads "${z.badge.text}", want "${text}"`);
      if (!/\bob-badge\b/.test(z.badge.cls)) bad.push('count is not a kit .ob-badge');
      if (z.badge.ariaHidden !== 'true') bad.push('count badge not aria-hidden');
      // vfix1 (R-EQ-P1): the count rides the STRIP pill (trailing non-seg child, inside its clip) — the
      // count-only secondary row is gone (it was the P1 band thief)
      if (!z.badge.inStrip) bad.push('count badge outside the station strip (its coarse home since vfix1)');
    }
    const label = `${d['atelier.aria.rail']}, ${text}`;
    if (z.label !== label) bad.push(`rail aria-label "${z.label}", want "${label}"`);
  } else if (z.badge && !z.badge.hidden) bad.push('count badge painted on a single-card rail');
  return bad;
}
function judgeColors(co) {
  const bad = [];
  if (!co) return ['no colour row at cloth'];
  if (co.whole < 3) bad.push(`${co.whole} whole swatches in the colour row (want >= 3; row ${co.w} px, ${co.n} chips)`);
  if (co.w < 147.5) bad.push(`colour row ${co.w} px < 148 (3 × 44 + 2 × 8)`);
  if (!co.kit) bad.push('colour row without the kit fade');
  if (co.sw > co.client + 1 && co.fadeEnd !== '1') bad.push(`colour row clips ${co.sw - co.client} px but data-ob-fade-end is ${co.fadeEnd}`);
  if (co.label) bad.push('the "Colour" label is painted on the coarse row');
  return bad;
}

export async function runS5PL({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  let n = 0; const fail = (m) => { n += 1; failIn(m); };
  for (const [w, h] of PL_VPS) {
    const id = `S5-P/L ${w}x${h}`;
    const errs = [];
    if (!(await waitPortFree(CDP_PORT + 1))) { fail(`${id}: CDP port ${CDP_PORT + 1} still busy from the previous leg`); continue; }
    const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=s5pl_${w}`,
      { cdpPort: CDP_PORT + 1, width: w, height: h, tool: false });
    watchErrors(c, errs);
    try {
      if (!(await waitReady(c))) { fail(`${id}: boot never became ready`); continue; }
      if (!(await toEquipment(c))) { fail(`${id}: atelier never mounted`); continue; }
      if (!(await waitExpr(c, `window.__atelier.rail().live === true`, 40))) { log(`${id}: rail leaf not live — degrade register, the peek law is not posed here`); continue; }
      let posedL = 0, posedP = 0;
      // S5-L — the strip rest-fits at 844 / 926 in every locale; at 667 (500 cannot fit) it PANS truthfully
      for (const loc of L_LOCALES) {
        await c.eval(`window.__i18n.setLocale(${J(loc)}), true`);
        await sleep(250);
        if (!(await goStation(c, 'table'))) { fail(`${id} ${loc}/strip: table never presented`); continue; }
        await c.eval(`document.getElementById('ob-atelier-carousel')?.scrollTo({ left: 0, behavior: 'auto' }), true`);
        await settled(c, '#ob-atelier-carousel'); await sleep(120);
        const z = await c.eval(PEEK);
        const bad = judgeStrip(z.strip, w);
        if (bad.length) fail(`${id} ${loc}/strip S5-L: ${bad.join('; ')}: ${J(z.strip)}`); else posedL += 1;
      }
      // S5-P — the peek law + the count + the colour row at every station
      for (const loc of P_LOCALES) {
        await c.eval(`window.__i18n.setLocale(${J(loc)}), true`);
        await sleep(250);
        const d = dict(loc);
        const fmt = (k, nn) => (d['atelier.rail.count'] || '{k} / {n}').replace('{k}', k).replace('{n}', nn);
        for (const st of P_STATIONS) {
          const tag = `${id} ${loc}/${st} S5-P`;
          if (!(await goStation(c, st))) { fail(`${tag}: station never presented`); continue; }
          await settled(c, RAIL_SEL); await sleep(150);
          const z = await c.eval(PEEK);
          if (!z.railLive) { fail(`${tag}: rail not live`); continue; }
          const bad = judgePeek(z, d);
          if (st === 'cloth') bad.push(...judgeColors(z.colors));
          else if (z.colors) bad.push(`the cloth colour swatches paint in the ${st} row (${z.colors.n} chips, ${z.colors.w} px) — the chip block is hidden off-cloth`);
          if (st === 'cues' && z.n > 2 && !bad.length) {
            // the count follows the snap: rest at the first card → "1 / n"; centre the third → "3 / n"
            await c.eval(`document.querySelector(${J(RAIL_SEL)}).scrollTo({ left: 0, behavior: 'auto' }), true`);
            await settled(c, RAIL_SEL); await sleep(150);
            let y = await c.eval(PEEK);
            if (y.k !== '1' || y.badge?.text !== fmt(1, z.n)) bad.push(`at scroll 0 the count reads k=${y.k} badge "${y.badge?.text}" (want "${fmt(1, z.n)}")`);
            await c.eval(`document.querySelectorAll('${RAIL_SEL} .ob-cardrail-card')[2].scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' }), true`);
            await settled(c, RAIL_SEL); await sleep(150);
            y = await c.eval(PEEK);
            if (y.k !== '3' || y.badge?.text !== fmt(3, z.n)) bad.push(`with the 3rd card centred the count reads k=${y.k} badge "${y.badge?.text}" (want "${fmt(3, z.n)}")`);
            for (const v of y.cards) if (v.partial && v.vis < 31.5) bad.push(`centred on the 3rd: card ${v.id} peeks ${v.vis} px inside the mask (< 32)`);
            if (y.cards.filter((v) => v.vis > 0.5).length < 3) bad.push(`centred on the 3rd: ${J(y.cards.map((v) => v.vis))} — both neighbours must peek`);
            // the receipt (numbers for the record): clip / slot / card / the visible run / the count
            log(`${tag} receipt: clip ${z.client} slot ${z.slot} peek ${z.peek} band ${z.sfw} card ${z.widths[0]} centred-3rd vis ${J(y.cards.map((v) => v.vis).filter((v) => v > 0))} badge "${y.badge?.text}" label "${y.label}"`);
          }
          if (st === 'cloth' && z.colors) log(`${tag} receipt: colour row ${z.colors.w} px, ${z.colors.whole}/${z.colors.n} whole swatches, fade end ${z.colors.fadeEnd}; sub row ${J(z.sub)}`);
          if (bad.length) fail(`${tag}: ${bad.join('; ')}: ${J({ ...z, cards: z.cards?.map((v) => v.vis) })}`); else posedP += 1;
        }
      }
      if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${id}: app errors: ` + J(await c.eval('__test.errors')));
      if (errs.length) fail(`${id}: console errors: ` + errs.slice(0, 3).join(' | '));
      if (n === 0) log(`${id} done: S5-L ${posedL}/${L_LOCALES.length} locales; S5-P ${posedP}/${P_LOCALES.length * P_STATIONS.length} poses green (${P_LOCALES.join('/')})`);
      else log(`${id}: ${n} failure(s) so far — done line withheld`);
    } finally { c.close(); await sleep(600); }
  }
}

/** S5-H census (GH-668 S5 G5 — B-EQ05 / R13): the live-rail host under the strip —
 * no station h3 painted, the painted kit .ob-body lines inside the cards box (closed-details
 * content skipped — the G2 census idiom), the prov / lux / arrival lines by PAINT. */
const HOST = `(() => {
  const painted = (el) => !!el && !el.hidden && el.getClientRects().length > 0 && !el.closest('[hidden]');
  const cards = document.getElementById('ob-atelier-cards');
  const sec = cards && cards.querySelector(':scope > section:not([hidden])');
  const strip = document.getElementById('ob-atelier-carousel');
  const rr = (el) => { if (!painted(el)) return null; const r = el.getBoundingClientRect(); return { t: +r.top.toFixed(1), b: +r.bottom.toFixed(1), h: +r.height.toFixed(1) }; };
  const lines = cards ? [...cards.querySelectorAll('.ob-body')].filter((el) => painted(el)
    && !(el.closest('details:not([open])') && !el.closest('summary'))) : [];
  const arr = document.querySelector('[data-ob="atelier-arrival"]');
  return { station: window.__atelier.station(), live: window.__atelier.rail?.().live === true,
    h3: cards ? [...cards.querySelectorAll('h3')].filter(painted).length : -1,
    lines: lines.map((el) => ({ cls: el.className, ob: el.dataset.ob || null, i18n: el.dataset.i18n || null, text: (el.textContent || '').trim().slice(0, 48) })),
    prov: sec ? painted(sec.querySelector('[data-ob="atelier-prov"]')) : null,
    lux: painted(document.querySelector('.ob-atelier-luxnote')),
    hintInRail: painted(document.querySelector('[data-ob="atelier-rail-sub"] .ob-atelier-hint')),
    // card 32 v4 (layout (2)): the live 'below' rail and the hint lines its side column paints
    below: !!document.querySelector('#ob-atelier-rail:not([hidden]).ob-atelier-rail--tall.ob-atelier-rail--below'),
    // PAINTED here also means computed visibility visible (a visibility:hidden line keeps its client rects), and each line's kit role
    // and a non-zero effective opacity (its own times every ancestor's: opacity composites through the parent) and text
    // (the v5final review review: an opacity-0 line passed)
    sideHints: [...document.querySelectorAll('[data-ob="atelier-rail-sub"] .ob-atelier-hint')].filter((e) => {
      if (!painted(e) || getComputedStyle(e).visibility !== 'visible' || !(e.textContent || '').trim()) return false;
      let o = 1; for (let n = e; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
      return o > 0; }).map((e) => ({ body: e.classList.contains('ob-body') })),
    coarse: matchMedia('(pointer: coarse)').matches,
    cardsBox: rr(cards), strip: rr(strip), section: rr(sec),
    arrival: arr ? { painted: painted(arr), body: arr.classList.contains('ob-body'), tag: arr.tagName, text: (arr.textContent || '').trim(),
      want: window.__i18n.t('atelier.arrival.hint'), i18n: arr.dataset.i18n, r: rr(arr) } : null };
})()`;
/** S5-A census: the cue sheet's actions — the one primary, the ghost pills, the control-role
 * summaries, the footer's material (computed against the tokens through a probe element). */
const SHEET = `(() => {
  const card = document.getElementById('ob-atelier-cue');
  if (!card || card.hidden) return { up: false };
  const cs = (el) => getComputedStyle(el);
  const probe = (tok) => { const p = document.createElement('i'); p.style.cssText = 'position:fixed;left:-9px;top:-9px;width:1px;height:1px;background-color:var(' + tok + ');border-top:1px solid var(' + tok + ')';
    document.body.appendChild(p); const c = cs(p); const out = { bg: c.backgroundColor, line: c.borderTopColor }; p.remove(); return out; };
  const bg1 = probe('--ob-bg-1'), line0 = probe('--ob-line-0');
  const foot = card.querySelector('.ob-atelier-actions'); const fc = foot ? cs(foot) : null;
  const pills = foot ? [...foot.querySelectorAll('.ob-btn')].filter((b) => b.getClientRects().length) : [];
  const lineBoxes = (b) => { const lab = b.querySelector('.ob-btn__label') || b.firstElementChild || b; const rg = document.createRange(); rg.selectNodeContents(lab);
    const ys = new Set([...rg.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))); return ys.size; };
  const prim = [...card.querySelectorAll('.ob-btn--primary')].filter((b) => b.getClientRects().length);
  const eq = card.querySelector('[data-ob="atelier-equip"]'), tr = card.querySelector('[data-ob="atelier-tryit"]'), ex = card.querySelector('[data-ob="atelier-cue-expand"]');
  const sums = ['atelier-details', 'atelier-dossier'].map((k) => { const su = card.querySelector('details[data-ob="' + k + '"] > summary'); return su ? { k, cls: su.className, control: su.classList.contains('ob-control'), caps: su.classList.contains('ob-caps') } : { k, missing: true }; });
  const equippedId = window.__settings?.get?.().equipment?.cue_id ?? null;
  return { up: true, id: window.__atelier.cardState()?.id ?? null, equippedId,
    primaries: prim.length, primIsEquip: prim.length === 1 && prim[0] === eq,
    equip: eq ? { disabled: eq.disabled, cls: eq.className, text: (eq.textContent || '').trim(), h: +eq.getBoundingClientRect().height.toFixed(1), lines: lineBoxes(eq), autorow: eq.hasAttribute('data-ob-autorow') } : null,
    tryit: tr ? { ghost: tr.classList.contains('ob-btn--ghost'), row: tr.classList.contains('ob-btn--row'), text: (tr.textContent || '').trim(), h: +tr.getBoundingClientRect().height.toFixed(1), lines: lineBoxes(tr), autorow: tr.hasAttribute('data-ob-autorow') } : null,
    expand: ex && ex.getClientRects().length ? { ghost: ex.classList.contains('ob-btn--ghost'), row: ex.classList.contains('ob-btn--row'), h: +ex.getBoundingClientRect().height.toFixed(1), expanded: ex.getAttribute('aria-expanded') } : null,
    rows: card.querySelectorAll('.ob-btn--row').length, autorows: card.querySelectorAll('[data-ob-autorow]').length, nPills: pills.length,
    wantEquip: window.__i18n.t('atelier.card.equip'), wantEquipped: window.__i18n.t('atelier.card.equipped'),
    sums, foot: foot ? { opaqueCls: foot.classList.contains('ob-mat-opaque'), pos: fc.position, bg: fc.backgroundColor, bg1: bg1.bg,
      bt: fc.borderTopWidth + ' ' + fc.borderTopStyle, btColor: fc.borderTopColor, line0: line0.line, w: +foot.getBoundingClientRect().width.toFixed(1), h: +foot.getBoundingClientRect().height.toFixed(1),
      sp: parseFloat(cs(card).scrollPaddingBottom) || 0, footVar: card.style.getPropertyValue('--ob-eq-foot-h').trim() || null } : null,
    cardW: +card.getBoundingClientRect().width.toFixed(1), coarse: matchMedia('(pointer: coarse)').matches };
})()`;
/** S5-A scroll arm (the Q683 law extended to the spec dl): with both disclosures open the card
 * scrolls; at every 40 px step a dt / dd whose CENTRE is above the footer's top hit-tests to the
 * dl (never to the footer — the pre-G5 footer let the row read THROUGH it); at full scroll the
 * dossier clears the hairline by sp-2. Returns the failures + a receipt. */
const SCROLL = `(async () => {
  const card = document.getElementById('ob-atelier-cue'); const bad = []; if (!card || card.hidden) return { bad: ['no card'] };
  for (const d of card.querySelectorAll('details')) d.open = true;
  await new Promise((r) => setTimeout(r, 120));
  const foot = card.querySelector('.ob-atelier-actions'); const max = card.scrollHeight - card.clientHeight;
  if (max < 40) return { bad: [], scrolls: false, max };
  let judged = 0, under = 0;
  for (let st = 0; st <= max + 39; st += 40) {
    card.scrollTop = Math.min(st, max); await new Promise((r) => setTimeout(r, 40));
    const fr = foot.getBoundingClientRect();
    // mid-scroll the footer is FLUSH with the scrollport's edge (padding edge − border): nothing peeks under it
    // (in the LAST padding-bottom px of scroll the footer rides up to its flow seat — only the card's empty padding is under it there)
    if (card.scrollTop < max - parseFloat(getComputedStyle(card).paddingBottom) - 0.5) { const kr = card.getBoundingClientRect(); const edge = kr.bottom - parseFloat(getComputedStyle(card).borderBottomWidth);
      if (Math.abs(fr.bottom - edge) > 0.75) bad.push('scroll ' + card.scrollTop + ': footer seat ' + fr.bottom.toFixed(1) + ' vs scrollport edge ' + edge.toFixed(1) + ' — copy peeks under the footer'); }
    for (const row of card.querySelectorAll('dl.ob-atelier-spec > dt, dl.ob-atelier-spec > dd')) {
      const r = row.getBoundingClientRect(); if (!r.height) continue;
      const cx = r.left + Math.min(12, r.width / 2), cy = r.top + r.height / 2;
      if (cy >= fr.top - 0.5 || cy <= card.getBoundingClientRect().top + 0.5) { if (cy >= fr.top - 0.5 && cy < fr.bottom) under += 1; continue; }
      judged += 1; const e = document.elementFromPoint(cx, cy);
      if (!e || !e.closest('dl.ob-atelier-spec')) bad.push('scroll ' + card.scrollTop + ': dl row "' + (row.textContent || '').trim().slice(0, 24) + '" centre (' + cx.toFixed(0) + ',' + cy.toFixed(0) + ') hits ' + (e ? (e.className || e.tagName) : 'null') + ' (footer top ' + fr.top.toFixed(1) + ')');
    }
  }
  card.scrollTop = max; await new Promise((r) => setTimeout(r, 60));
  const fr = foot.getBoundingClientRect(); const dos = card.querySelector('details[data-ob="atelier-dossier"]').getBoundingClientRect();
  const gap = +(fr.top - dos.bottom).toFixed(1); if (gap < 7.5) bad.push('run-out: dossier bottom ' + dos.bottom.toFixed(1) + ' vs footer top ' + fr.top.toFixed(1) + ' (gap ' + gap + ' < sp-2)');
  const cr = card.getBoundingClientRect(); const ccs = getComputedStyle(card);
  const padEdge = cr.bottom - parseFloat(ccs.borderBottomWidth), contentEdge = padEdge - parseFloat(ccs.paddingBottom);
  if (fr.bottom > padEdge + 0.5 || fr.bottom < contentEdge - 1.5) bad.push('footer off its seat at full scroll: bottom ' + fr.bottom.toFixed(1) + ' vs card content edge ' + contentEdge.toFixed(1) + ' / padding edge ' + padEdge.toFixed(1));
  for (const d of card.querySelectorAll('details')) d.open = false;
  card.scrollTop = 0;
  return { bad, scrolls: true, max, judged, under, gap };
})()`;
const HA_STATIONS = ['cues', 'table', 'cloth', 'balls', 'lighting'];
const HA_LOCALES = ['en', 'de', 'fr', 'es', 'ja', 'ko', 'zh-CN'];
/** one host census judged against the R13 law at a station (or arrival = null) */
function judgeHost(z, st, tag, bad) {
  if (!z.live) { bad.push(tag + ': rail not live'); return; }
  if (z.station !== st) bad.push(tag + ': station ' + z.station);
  if (z.h3 !== 0) bad.push(tag + ': ' + z.h3 + ' station h3 painted in #ob-atelier-cards (R13: the strip pill says it)');
  // the ONE line: the cues hint — in the host column on BOTH registers since GH-668 S5 vfix1 (ruling
  // R-EQ-P1: the arrival line is the host's, said once — hidden after the first card activation of the
  // visit; this census reads the station's first arrival, before any pick); G2's coarse re-home into the
  // rail's secondary row is retired (the sub row at rest was the P1 band thief)
  // GH-1001 F35: on the FINE register cloth / balls carry their station hint too (the host's ONE
  // reserved row on every station — the host card at one height); coarse folds those sections
  // GH-1001 card 32 v4 (signed layout (2); atelier.md §7 entry 61 amendment (8)): on the 'below' rail the cues line
  // rides the SIDE column beside the cards (homeSecondary) — still said once, the host keeps no line, so the host's
  // one-height band is never cut at cues; the sub-row retirement above stands for every other rail
  const want = z.below ? 0 : (st === 'cues' || (!z.coarse && (st === 'cloth' || st === 'balls'))) ? 1 : 0;
  if (z.lines.length !== want) bad.push(tag + ': ' + z.lines.length + ' .ob-body line(s) under the strip, want ' + want + ': ' + J(z.lines));
  if (want && z.lines[0] && !/ob-atelier-hint/.test(z.lines[0].cls)) bad.push(tag + ': the one line is not the station hint: ' + J(z.lines[0]));
  if (z.below) {
    const wantSide = st === 'cues' ? 1 : 0;
    if (z.sideHints.length !== wantSide) bad.push(tag + ': ' + z.sideHints.length + ' cues hint line(s) painted in the side column, want ' + wantSide + ' (card 32 v4: the side column says it once, at cues)');
    if (z.sideHints.some((h) => !h.body)) bad.push(tag + ': the side column\'s cues line is not a kit .ob-body line (the host line\'s role, B-EQ03)');
  } else if (z.hintInRail) bad.push(tag + ': the cues hint paints in the rail secondary row (retired by vfix1: the host says it once)');
  if (st !== null && z.prov) bad.push(tag + ': the provenance block paints on the rail register (degrade register only)');
  if (z.lux) bad.push(tag + ': the lux note paints (a second line under the brightness row)');
  if (st === null) {
    const a = z.arrival;
    if (z.cardsBox && z.cardsBox.h > 0.5) bad.push(tag + ': a blank cards pane under the strip at arrival: ' + z.cardsBox.h + ' px (the box folds when every section is hidden)');
    if (!a || !a.painted || !a.body || a.tag !== 'P') bad.push(tag + ': arrival line missing / not a kit .ob-body p: ' + J(a));
    else { if (a.text !== a.want || !a.want) bad.push(tag + ': arrival text "' + a.text + '" != t(atelier.arrival.hint) "' + a.want + '"');
      if (z.strip && a.r && a.r.t < z.strip.b - 0.5) bad.push(tag + ': arrival line not under the strip: ' + J({ line: a.r, strip: z.strip })); }
  } else if (z.arrival && z.arrival.painted) bad.push(tag + ': the arrival line paints at a station');
}
function judgeSheet(z, coarse, tag, bad) {
  if (!z.up) { bad.push(tag + ': sheet not up'); return; }
  if (z.primaries !== 1 || !z.primIsEquip) bad.push(tag + ': ' + z.primaries + ' .ob-btn--primary in the sheet (want exactly Equip)');
  if (!z.equip) bad.push(tag + ': no Equip control');
  else {
    const equipped = z.id === z.equippedId;
    if (equipped !== z.equip.disabled) bad.push(tag + ': Equip disabled=' + z.equip.disabled + ' while equipped=' + equipped + ' (' + z.id + ')');
    if (z.equip.text !== (equipped ? z.wantEquipped : z.wantEquip)) bad.push(tag + ': Equip label "' + z.equip.text + '" (equipped ' + equipped + ')');
  }
  if (!z.tryit || !z.tryit.ghost) bad.push(tag + ': Try it is not a ghost pill: ' + J(z.tryit));
  if (coarse && !z.expand) bad.push(tag + ': no expand pill in the coarse actions row');
  if (z.expand && !z.expand.ghost) bad.push(tag + ': the expand pill is not a ghost: ' + J(z.expand));
  if (z.rows) bad.push(tag + ': ' + z.rows + ' --row pill(s) in the sheet (intrinsic kit pills wanted)');
  if (z.autorows) bad.push(tag + ': the kit auto-row belt fired on ' + z.autorows + ' pill(s) — a label wrapped at card width ' + z.cardW);
  for (const [k, p] of [['Equip', z.equip], ['Try it', z.tryit], ['expand', z.expand]]) {
    if (!p) continue;
    if (p.lines > 1) bad.push(tag + ': ' + k + ' label paints ' + p.lines + ' line boxes ("' + (p.text || '') + '")');
    if (coarse ? p.h < 43.5 : p.h < 39.5) bad.push(tag + ': ' + k + ' ' + p.h + ' px under the ' + (coarse ? 44 : 40) + ' px rung');
  }
  for (const su of z.sums) if (su.missing || !su.control || su.caps) bad.push(tag + ': ' + su.k + ' summary must wear the kit .ob-control role (not .ob-caps): ' + J(su));
  const f = z.foot;
  if (!f) { bad.push(tag + ': no actions row'); return; }
  if (!coarse) {
    if (!f.opaqueCls) bad.push(tag + ': the footer does not wear the kit .ob-mat-opaque');
    if (f.pos !== 'sticky') bad.push(tag + ': footer position ' + f.pos + ' (want sticky)');
    if (f.bg !== f.bg1 || /^rgba\(|\//.test(f.bg1) || f.bg1 === 'transparent') bad.push(tag + ': footer ground ' + f.bg + ' != opaque --ob-bg-1 ' + f.bg1);
    if (f.bt !== '1px solid' || f.btColor !== f.line0) bad.push(tag + ': footer hairline "' + f.bt + ' ' + f.btColor + '" (want 1px solid ' + f.line0 + ')');
    // the Q683 inset follows the MEASURED footer (57 one row / 105 wrapped): scroll-padding-bottom >= footer + sp-1
    if (!(f.sp >= f.h + 3.5)) bad.push(tag + ': scroll-padding-bottom ' + f.sp + ' < footer ' + f.h + ' + sp-1 (published --ob-eq-foot-h ' + f.footVar + ')');
  } else if (f.opaqueCls || f.pos === 'sticky') bad.push(tag + ': the coarse sheet row wears the fine footer (' + f.pos + ', opaque ' + f.opaqueCls + ')');
}
export async function runS5HA({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  let n = 0; const fail = (m) => { n += 1; failIn(m); };
  // the literal tuple list bounds `slot` for the GH-687 ci-bands lint (cdp 2: desktop on +0, phone on +1)
  for (const [w, h, kind, slot] of [[1440, 900, 'desktop', 0], [844, 390, 'phone', 1]]) {
    const coarse = kind === 'phone';
    const id = `S5-H/A ${w}x${h}`;
    const errs = [];
    const url = `http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=s5ha_${w}`;
    if (!(await waitPortFree(CDP_PORT + slot))) { fail(`${id}: CDP port ${CDP_PORT + slot} still busy from the previous leg`); continue; }
    const c = coarse
      ? await launchPhone(url, { cdpPort: CDP_PORT + slot, width: w, height: h, tool: false })
      : await launchChrome(url, { port: CDP_PORT + slot, width: w, height: h, tool: false });
    watchErrors(c, errs);
    try {
      if (!(await waitReady(c))) { fail(`${id}: boot never became ready`); continue; }
      if (!(await toEquipment(c))) { fail(`${id}: atelier never mounted`); continue; }
      if (!(await waitExpr(c, `window.__atelier.rail().live === true`, 40))) { log(`${id}: rail leaf not live — degrade register, the R13 host law is not posed here`); continue; }
      const bad = [];
      // ---- S5-H: arrival (station null) in de / ja — re-arrive through the shell (setPlace → station null) ----
      for (const loc of ['de', 'ja']) {
        await c.eval(`window.__i18n.setLocale(${J(loc)}), true`); await sleep(250);
        await c.eval(`__shell.go('play'), true`); await waitExpr(c, `window.__shell.place() !== 'equipment'`, 30);
        await c.eval(`__shell.go('equipment'), true`);
        if (!(await waitExpr(c, `window.__shell.place() === 'equipment' && window.__atelier.station() === null && !window.__shell.moving()`, 60))) { bad.push(`S5-H ${w} ${loc}/arrival: re-arrival never posed station null`); continue; }
        await sleep(300);
        judgeHost(await c.eval(HOST), null, `S5-H ${w} ${loc}/arrival`, bad);
      }
      await c.eval(`window.__i18n.setLocale('en'), true`); await sleep(200);
      for (const st of HA_STATIONS) {
        if (!(await goStation(c, st))) { bad.push(`S5-H ${w} en/${st}: station never presented`); continue; }
        if (st === 'cues' && !coarse) await waitExpr(c, `!document.getElementById('ob-atelier-cue').hidden`, 40); // the fine register's arrival auto-inspect
        await sleep(coarse ? 400 : 250);
        judgeHost(await c.eval(HOST), st, `S5-H ${w} en/${st}`, bad);
      }
      // ---- S5-A: the cue sheet (desktop: the auto-inspected EQUIPPED cue; phone: a real tap) ----
      await goStation(c, 'cues'); await sleep(300);
      if (coarse) { const pt = await centre(c, '#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]'); if (pt) await press(c, pt, true); }
      if (!(await waitExpr(c, `!document.getElementById('ob-atelier-cue').hidden && !!window.__atelier.cardState()?.id`, 60))) bad.push(`S5-A ${w}: the cue sheet never presented`);
      else {
        await sleep(350);
        for (const loc of HA_LOCALES) {
          await c.eval(`window.__i18n.setLocale(${J(loc)}), true`); await sleep(300);
          const z = await c.eval(SHEET); judgeSheet(z, coarse, `S5-A ${w} ${loc}`, bad);
          if (z.foot) log(`S5-A ${w} ${loc} receipt: footer ${z.foot.h} px (${z.nPills} pills${z.foot.h > 70 ? ', WRAPPED to two rows' : ''}), scroll-padding-bottom ${z.foot.sp}, card ${z.cardW}`);
        }
        await c.eval(`window.__i18n.setLocale('en'), true`); await sleep(200);
        if (!coarse) {
          const pt = await centre(c, '#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])'); // a NON-equipped cue: the primary enabled
          if (pt) { await press(c, pt, false); await sleep(600); const z = await c.eval(SHEET); judgeSheet(z, false, `S5-A ${w} en/other-cue`, bad);
            if (z.equip && z.equip.disabled) bad.push(`S5-A ${w}: Equip disabled on the non-equipped cue ${z.id}`); }
          const sc = await c.eval(SCROLL);
          bad.push(...(sc.bad || []).map((m) => `S5-A ${w} scroll: ${m}`));
          if (!sc.scrolls) bad.push(`S5-A ${w}: the card does not scroll with both disclosures open (max ${sc.max}) — the footer arm has no subject`);
          else log(`S5-A ${w} scroll receipt: max ${sc.max}, ${sc.judged} dl rows judged above the footer, ${sc.under} under it, run-out gap ${sc.gap}`);
        }
      }
      for (const m of bad) fail(`${id}: ${m}`);
      if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${id}: app errors: ` + J(await c.eval('__test.errors')));
      if (errs.length) fail(`${id}: console errors: ` + errs.slice(0, 3).join(' | '));
      if (!bad.length) log(`${id} done: S5-H arrival de/ja + ${HA_STATIONS.length} stations, S5-A ${HA_LOCALES.length} locales${coarse ? '' : ' + the scroll arm'} green`);
    } finally { c.close(); await sleep(600); }
  }
}

// ---- S5-M (G6 — B-EQ06: the hero clears its chrome) ------------------------
/** One evaluation: the float / subject rects against the LIVE bands. */
const HERO = (st) => `(() => {
  const rr = (r) => r ? { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1) } : null;
  const el = (id) => { const e = document.getElementById(id); if (!e || e.hidden || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return r.height > 0 ? rr(r) : null; };
  let b = null; try { b = window.__shell.bands(); } catch { b = null; }
  const a = window.__atelier;
  return { vh: innerHeight, vw: innerWidth, station: a.station(),
    hasFloatRect: typeof a.floatRect === 'function', hasSubject: typeof a.subjectRect === 'function',
    float: typeof a.floatRect === 'function' ? rr(a.floatRect()) : null,
    frame: typeof a.floatFrame === 'function' ? a.floatFrame() : null,
    subject: typeof a.subjectRect === 'function' ? (() => { const s = a.subjectRect(${J(st)}); return s ? { ...rr(s), n: s.n, foot: s.foot } : null; })() : null,
    staged: a.floatState().staged, moving: window.__shell.moving(),
    rail: rr(b && b.rail), qp: rr(b && b.quickPlay), reserveB: b ? b.reserve.bottom : null,
    atelierRail: el('ob-atelier-rail'), sheet: el('ob-atelier-cue'),
    anchor: a.registry().find((s) => s.id === ${J(st)})?.anchor ?? null };
})()`;
const meet = (a, b) => !!a && !!b && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
const fmtR = (r) => (r ? `[${r.l},${r.t},${r.r},${r.b}]` : 'null');
/** The float law: the swept AABB clears every chrome band under it (shell rail, quick-play stack, showroom
 * rail) by sp-2 and the tip stays inside the viewport under band T. */
function judgeFloat(z, id, bad, log) {
  if (!z.hasFloatRect) { bad.push(`${id}: __atelier.floatRect is absent (the G6 getter)`); return; }
  if (!z.staged || !z.float) { bad.push(`${id}: no float staged to judge (staged ${z.staged}, rect ${fmtR(z.float)})`); return; }
  const f = z.float;
  const tops = [z.rail?.t, z.qp?.t, z.atelierRail?.t].filter((v) => Number.isFinite(v));
  const clear = (tops.length ? Math.min(...tops) : z.vh) - 8;
  if (f.b > clear + 0.5) bad.push(`${id}: float bottom ${f.b} passes behind the chrome (clear line ${clear}: rail ${z.rail?.t ?? '-'}, quick-play ${z.qp?.t ?? '-'}, showroom rail ${z.atelierRail?.t ?? '-'})`);
  if (f.t < 8 - 0.5) bad.push(`${id}: float top ${f.t} leaves the viewport (tip above band T + sp-2)`);
  if (meet(f, z.rail)) bad.push(`${id}: float ${fmtR(f)} ∩ shell rail ${fmtR(z.rail)}`);
  if (meet(f, z.qp)) bad.push(`${id}: float ${fmtR(f)} ∩ quick-play ${fmtR(z.qp)}`);
  if (meet(f, z.atelierRail)) bad.push(`${id}: float ${fmtR(f)} ∩ showroom rail ${fmtR(z.atelierRail)}`);
  const fr = z.frame || {};
  if ((fr.corrections ?? 0) > 1) bad.push(`${id}: ${fr.corrections} settle corrections (the law is ONE)`);
  log(`${id} receipt: float ${fmtR(f)} h ${(f.b - f.t).toFixed(0)} clear ${clear} (rail ${z.rail?.t ?? '-'} qp ${z.qp?.t ?? '-'} showroom ${z.atelierRail?.t ?? '-'}) win [${fr.window ? fr.window.top.toFixed(0) + ',' + fr.window.bottom.toFixed(0) : '-'}] fitted ${!!fr.fitted} corrections ${fr.corrections ?? '-'} pose r ${fr.pose ? fr.pose.radius.toFixed(3) : '-'} ty ${fr.pose ? fr.pose.ty.toFixed(3) : '-'}`);
}
/** The subject laws: balls (coarse) — the rack's AABB bottom <= 0.40·vh and inside the viewport; cloth
 * (desktop) — the rack never meets the quick-play stack. A missing getter is a named SKIP (the arm is
 * feature-detected — slice-5 PLAN G6 proof row), never a silent green. */
function judgeSubject(z, st, coarse, id, bad, log) {
  if (!z.hasSubject) { log(`${id}: SKIP — __atelier.subjectRect absent (no scene subject getter on these bytes)`); return 'skip'; }
  const s = z.subject;
  if (!s) { bad.push(`${id}: subjectRect(${st}) returned null (no visible balls / canvas)`); return 'bad'; }
  const a = z.anchor || {};
  log(`${id} receipt: rack ${fmtR(s)} (${s.n} balls, foot ${s.foot.x},${s.foot.y}) bottom/vh ${(s.b / z.vh).toFixed(3)} qp ${fmtR(z.qp)} rail ${fmtR(z.rail)} anchor r ${a.radius?.toFixed(3)} theta ${a.theta} phi ${a.phi} ty ${a.ty}`);
  if (st === 'balls' && coarse) {
    if (s.b > 0.40 * z.vh + 0.5) bad.push(`${id}: rack AABB bottom ${s.b} > 0.40·vh ${(0.40 * z.vh).toFixed(1)} (the rack sits where the phone rail band is)`);
    if (s.t < -0.5) bad.push(`${id}: rack AABB top ${s.t} above the viewport`);
    if (meet(s, z.rail)) bad.push(`${id}: rack ${fmtR(s)} ∩ shell rail ${fmtR(z.rail)}`);
  }
  if (st === 'cloth' && !coarse) {
    if (meet(s, z.qp)) bad.push(`${id}: racked balls ${fmtR(s)} ∩ quick-play stack ${fmtR(z.qp)} (the stack parks over the rack)`);
    if (z.qp && s.foot.x > z.qp.l - 0.5 && s.foot.y > z.qp.t - 0.5) bad.push(`${id}: foot spot ${s.foot.x},${s.foot.y} inside the quick-play reserve ${fmtR(z.qp)}`);
  }
  return 'ok';
}
// OB_S5M_VP=844x390,667x375 narrows the walk (anchor tuning / red proofs) — skipped INSIDE the literal loop so the
// GH-687 ci-bands lint keeps its literal bound on `slot` (cdp 2: desktop on +0, phone on +1)
const M_VP = (process.env.OB_S5M_VP || '').split(',').filter(Boolean);
export async function runS5M({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  let n = 0; const fail = (m) => { n += 1; failIn(m); };
  for (const [w, h, kind, slot] of [[1440, 900, 'desktop', 0], [1280, 800, 'desktop', 0], [844, 390, 'phone', 1], [667, 375, 'phone', 1]]) {
    if (M_VP.length && !M_VP.includes(`${w}x${h}`)) continue;
    const coarse = kind === 'phone';
    const id = `S5-M ${w}x${h}`;
    const errs = [];
    const url = `http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=s5m_${w}`;
    if (!(await waitPortFree(CDP_PORT + slot))) { fail(`${id}: CDP port ${CDP_PORT + slot} still busy from the previous leg`); continue; }
    const c = coarse
      ? await launchPhone(url, { cdpPort: CDP_PORT + slot, width: w, height: h, tool: false })
      : await launchChrome(url, { port: CDP_PORT + slot, width: w, height: h, tool: false });
    watchErrors(c, errs);
    try {
      if (!(await waitReady(c))) { fail(`${id}: boot never became ready`); continue; }
      if (!(await toEquipment(c))) { fail(`${id}: atelier never mounted`); continue; }
      await waitExpr(c, `window.__atelier.rail().live === true`, 40);
      const bad = [];
      // ---- the float at cues (desktop: the arrival auto-inspect; phone: a REAL card tap presents the sheet + float) ----
      if (!(await goStation(c, 'cues'))) bad.push(`${id}/cues: station never presented`);
      else {
        if (coarse) { await sleep(300); const pt = await centre(c, '#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]'); if (pt) await press(c, pt, true); }
        if (!(await waitExpr(c, `window.__atelier.floatState().staged === true`, 60))) bad.push(`${id}/cues: no float staged`);
        else {
          // the fit settles: framing move landed, the settle verify ran, no correction in flight
          await waitExpr(c, `!window.__shell.moving() && (window.__atelier.floatFrame ? window.__atelier.floatFrame().pending === false : true)`, 80);
          await sleep(350);
          judgeFloat(await c.eval(HERO('cues')), `${id}/cues`, bad, log);
        }
        if (coarse) { const x = await centre(c, '[data-ob="atelier-cue-close"]'); if (x) { await press(c, x, true); await sleep(250); } }
      }
      // ---- the rack at cloth (desktop law: clear of the quick-play stack) and at balls (coarse law: upper third) ----
      for (const st of ['cloth', 'balls']) {
        if (!(await goStation(c, st))) { bad.push(`${id}/${st}: station never presented`); continue; }
        await sleep(coarse ? 450 : 350);
        judgeSubject(await c.eval(HERO(st)), st, coarse, `${id}/${st}`, bad, log);
      }
      for (const m of bad) fail(`${id}: ${m}`);
      if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${id}: app errors: ` + J(await c.eval('__test.errors')));
      if (errs.length) fail(`${id}: console errors: ` + errs.slice(0, 3).join(' | '));
      if (!bad.length) log(`${id} done: float clear of the chrome bands, rack laws at cloth / balls green`);
    } finally { c.close(); await sleep(600); }
  }
}
// ============================== S5-F — face coverage (G7, B-EQ07) ==============================
// "Faces fill >= 60 % of the card": every SHIPPED card face under web/assets is judged on the
// bytes the card fetches — decoded by the pinned Chrome itself (fetch -> createImageBitmap ->
// getImageData; the repo's node toolset decodes PNG only (kit-laws decodePng) and the station
// strips are alpha WebP, so one decoder = the card's decoder judges all 51 files). The JUDGED face
// is FRAME 0 of a strip (the rest face the card shows; the --live turntable is content motion) —
// the per-frame minimum over the spin is REPORTED (INFO), never judged. Alpha > 0.1 (> 25/255)
// bounds the ink bbox; law 'area' = bbox area / face area, law 'height' = bbox height / face
// height (wide objects: the plan's ball-set / fixture clauses). Geometry clause: a strip's pixel
// size must be frames x fw by fh — the CSS steps(29) walk + the 2:1 well assume it (GH-1001 card 32 v3
// S1, a7b969a0: the turntable strips and the cue stills ship at 336x168 per frame, the well's 3x). Every file
// present in a declared dir is judged (a new bake is judged automatically); the declared count
// makes a MISSING face RED. FACE_OK is FROZEN (shrink-only): a ledgered face that PASSES is RED
// (stale row — liveness), so a re-bake that cures a face must leave the ledger with the commit.
const FACES = [
  { dir: 'assets/cues', ext: '.png', n: 13, fw: 336, fh: 168, frames: 1, law: 'area', min: 0.60, what: 'cue rest still (cuethumbs.js cueThumbSrc)' },
  { dir: 'assets/cues/sprites', ext: '.png', n: 13, fw: 336, fh: 168, frames: 30, law: 'area', min: 0.60, what: 'cue long-axis turntable strip (the --live overlay)' },
  { dir: 'assets/stations/balls', ext: '.webp', n: 6, fw: 336, fh: 168, frames: 30, law: 'height', min: 0.60, what: 'ball-set turntable strip' },
  { dir: 'assets/stations/tables', ext: '.webp', n: 11, fw: 336, fh: 168, frames: 30, law: 'height', min: 0.60, what: 'table turntable strip' }, // D-3g: + pool_pro_8ft / _7ft (GH-621 size variants); + pool_pro_9ft_k55 (GH-641)
  { dir: 'assets/stations/lighting', ext: '.webp', n: 5, fw: 336, fh: 168, frames: 30, law: 'height', min: 0.45, what: 'fixture turntable strip (wide, not tall)' },
  { dir: 'assets/stations/cloths', ext: '.png', n: 6, fw: 448, fh: 224, frames: 1, law: 'area', min: 0.60, what: 'cloth swatch still' },
];
// FROZEN ledger (GH-668 S5 slice 5 G7, row B-EQ07): file -> { measured, reason }. Rows leave when
// the face is re-baked (the liveness clause above forces it). Re-baking the two bar luminaires is
// deferred: their fixtures are being re-worked by the venue-lighting lane (PR #727); the cure is a
// rest-theta (frame-0 phase) re-bake at the 3/4 view (frames 8-12 measure 0.59-0.63) once that
// lane lands — GH-668 follow-up recorded in the slice-5 PR body (G7).
const FACE_OK = {
  'assets/stations/lighting/carom_luminaire.webp': { h: 0.38, reason: 'bar luminaire END-ON at theta0 (rest h 0.38 < 0.45); rest-phase re-bake after PR #727 — B-EQ07 follow-up' },
  'assets/stations/lighting/snooker_luminaire.webp': { h: 0.35, reason: 'bar luminaire END-ON at theta0 (rest h 0.35 < 0.45); rest-phase re-bake after PR #727 — B-EQ07 follow-up' },
};
const ALPHA_INK = 25; // alpha > 0.1
/** Browser-side measure: decode each served face, bbox of alpha > ALPHA_INK per frame (frame width = W / frames). */
const MEASURE_FACES = (list) => `(async () => {
  const out = [];
  for (const f of ${J(list)}) {
    try {
      const res = await fetch(f.url, { cache: 'no-store' });
      if (!res.ok) { out.push({ file: f.file, err: 'http ' + res.status }); continue; }
      const bmp = await createImageBitmap(await res.blob());
      const W = bmp.width, H = bmp.height, fw = Math.floor(W / f.frames), fh = H;
      const c = new OffscreenCanvas(W, H);
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(bmp, 0, 0); bmp.close();
      const d = g.getImageData(0, 0, W, H).data;
      const frames = [];
      for (let k = 0; k < f.frames; k++) {
        let x0 = fw, x1 = -1, y0 = fh, y1 = -1;
        for (let y = 0; y < fh; y++) {
          const row = (y * W + k * fw) * 4 + 3;
          for (let x = 0; x < fw; x++) {
            if (d[row + x * 4] > ${ALPHA_INK}) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          }
        }
        frames.push(x1 < 0 ? { w: 0, h: 0, area: 0 } : { w: (x1 - x0 + 1) / fw, h: (y1 - y0 + 1) / fh, area: ((x1 - x0 + 1) * (y1 - y0 + 1)) / (fw * fh) });
      }
      out.push({ file: f.file, W, H, frames });
    } catch (e) { out.push({ file: f.file, err: String((e && e.message) || e) }); }
  }
  return out;
})()`;
/** S5-F: judge every declared face dir on the served bytes (frame 0 at the row's law; spin min INFO; FACE_OK liveness). */
export async function runS5F({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  let n = 0; const fail = (m) => { n += 1; failIn(m); };
  const id = 'S5-F';
  const list = [];
  for (const row of FACES) {
    const dir = path.join(webDir, row.dir);
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(row.ext)).sort() : [];
    if (files.length !== row.n) fail(`${id}: ${row.dir} has ${files.length} ${row.ext} faces, declared ${row.n} (${row.what})`);
    for (const f of files) list.push({ file: `${row.dir}/${f}`, url: `http://127.0.0.1:${PORT}/${row.dir}/${f}`, frames: row.frames, row });
  }
  for (const k of Object.keys(FACE_OK)) if (!list.some((f) => f.file === k)) fail(`${id}: FACE_OK row ${k} names no shipped face (dead row)`);
  if (!(await waitPortFree(CDP_PORT))) { fail(`${id}: CDP port ${CDP_PORT} still busy from the previous leg`); return; }
  // a tiny same-origin document: the faces are fetched + decoded by the page, never the app
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app/ui/tokens.css`, { port: CDP_PORT, width: 800, height: 300, tool: false });
  try {
    // the bare document's navigation must have COMMITTED before the first eval (about:blank also
    // reports 'complete' — the bake-cue-thumbs idiom): under load the commit landed mid-eval once and
    // "Execution context was destroyed" escaped as a rejection (G7 record try 4) — wait, then retry once
    if (!(await waitExpr(c, `location.pathname === '/app/ui/tokens.css' && document.readyState === 'complete'`, 60))) {
      fail(`${id}: the face-measure document never became ready`); return;
    }
    let rows = null;
    for (let attempt = 1; attempt <= 2 && !Array.isArray(rows); attempt++) {
      try { rows = await c.eval(MEASURE_FACES(list.map(({ file, url, frames }) => ({ file, url, frames })))); }
      catch (e) { log(`${id}: measure attempt ${attempt} threw: ${e?.message || e}`); await sleep(800); }
    }
    if (!Array.isArray(rows) || rows.length !== list.length) { fail(`${id}: measure returned ${J(rows).slice(0, 200)}`); return; }
    let judged = 0, ledgered = 0;
    for (const r of rows) {
      const f = list.find((x) => x.file === r.file); const row = f.row;
      if (r.err) { fail(`${id}: ${r.file}: ${r.err}`); continue; }
      const wantW = row.fw * row.frames;
      if (r.W !== wantW || r.H !== row.fh) fail(`${id}: ${r.file}: ${r.W}x${r.H} != ${wantW}x${row.fh} (${row.frames} x ${row.fw}x${row.fh} frames — the 2:1 well at the row's declared frame size)`);
      const pick = (m) => (row.law === 'area' ? m.area : m.h);
      const rest = pick(r.frames[0]);
      let minV = Infinity, minK = 0;
      r.frames.forEach((m, k) => { const v = pick(m); if (v < minV) { minV = v; minK = k; } });
      const ok = rest >= row.min - 1e-9;
      const ledger = FACE_OK[r.file];
      const line = `${r.file}: rest ${row.law} ${rest.toFixed(3)} (w ${r.frames[0].w.toFixed(2)} h ${r.frames[0].h.toFixed(2)}) min ${row.law} ${minV.toFixed(3)} @f${minK}, law >= ${row.min}`;
      judged += 1;
      if (ok && ledger) fail(`${id}: ${line} — PASSES but sits on FACE_OK (stale row: delete it with the re-bake)`);
      else if (ok) log(`${id} ok ${line}`);
      else if (ledger) { ledgered += 1; log(`${id} LEDGERED ${line} — ${ledger.reason}`); }
      else fail(`${id}: ${line} — under threshold (B-EQ07)`);
    }
    log(`${id} done: ${judged} faces judged on the served bytes, ${ledgered} on FACE_OK, ${n} FAIL`);
  } finally { c.close(); await sleep(600); }
}
// ============================== S5-T — stat flash / legend / sheet adoption (G8, B-EQ08 / B-EQ09) ==============================
// One posed walk per register (1440x900 fine in en + de, 844x390 coarse in en): at cues the equipped
// card is presented, then a DIFFERENT card through a REAL press (the R2 "changed" register) — judged:
//   T1 the stat flash + the card morph are ONE kit beat (animation-duration <= --ob-t-med = 0.2 s);
//   T2 every stat that differs from the EQUIPPED cue's carries the legend = t('atelier.stat.vsEquipped')
//      with {delta} = a signed value (+12 g / −0.5 mm), >= 1 legend on a differing card, none on the
//      equipped card itself; T3 the labels wear the kit .ob-hint role (no caps); T4 the close is the kit
//      icon pill (ob-btn ob-btn--icon, .ob-btn__icon slot with the icons.js close glyph; 34 fine / >= 44
//      coarse); T5 the sheet ENTERS through the kit (opacity < 0.99 in the presenting task — the A11
//      mount law, judged on a synthetic click so focus starts at <body>); T6 focus hand-off: that
//      present lands focus on Equip (fine) / the close (coarse), never <body>, while a REAL press that
//      focused a rail card leaves focus on the rail; T7 the dismiss returns focus to the staged rail card.
const T_CENSUS = (loc) => `(() => {
  const cue = document.getElementById('ob-atelier-cue');
  const cs = (el) => getComputedStyle(el);
  const dur = (el) => Math.max(0, ...cs(el).animationDuration.split(',').map((d) => parseFloat(d) * (/ms$/.test(d.trim()) ? 0.001 : 1)));
  const changed = [...cue.querySelectorAll('.ob-atelier-stat--changed')];
  const stats = [...cue.querySelectorAll('.ob-atelier-stat')];
  const labels = stats.map((s) => s.querySelector(':scope > span'));
  const legends = [...cue.querySelectorAll('[data-ob="atelier-stat-delta"]')].map((l) => ({ text: l.textContent, delta: l.dataset.delta, hint: l.classList.contains('ob-hint') }));
  const close = cue.querySelector('[data-ob="atelier-cue-close"]');
  const face = close && close.querySelector('.ob-btn__icon');
  const r = close ? close.getBoundingClientRect() : null;
  const ae = document.activeElement;
  return { hidden: cue.hidden, morph: cue.classList.contains('ob-atelier-cue--morph') ? dur(cue) : null,
    changed: changed.length, flash: changed.map(dur), flashName: changed.map((el) => cs(el).animationName),
    stats: stats.length, hints: labels.filter((l) => l && l.classList.contains('ob-hint') && cs(l).textTransform !== 'uppercase').length,
    legends, close: !!close, closeKit: !!close && close.classList.contains('ob-btn') && close.classList.contains('ob-btn--icon'),
    glyph: !!face && !!face.querySelector('svg[data-icon="close"]'), closeW: r ? +r.width.toFixed(1) : null, closeH: r ? +r.height.toFixed(1) : null,
    active: ae === document.body ? 'body' : (ae.dataset && ae.dataset.ob) || (ae.classList.contains('ob-cardrail-card') ? 'rail-card' : ae.tagName),
    activeInRail: !!ae.closest('#ob-atelier-rail'), equipped: window.__settings?.get?.().equipment?.cue_id ?? null, sel: window.__atelier.rail().selected };
})()`;
export async function runS5T({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  let n = 0; const fail = (m) => { n += 1; failIn(m); };
  const T_LOCS = { desktop: ['en', 'de'], phone: ['en'] }; // de = the legend's longest template on the fine register
  // the sheet's ENTER read the A11 way: a MutationObserver on `hidden` reads the computed opacity in the
  // job the flip lands in (motion.mount sets the hidden pose synchronously — B-K22); the present itself
  // lands a microtask after the click (selectCue awaits the armed cue module)
  const ENTER = `(async () => {
    const cue = document.getElementById('ob-atelier-cue');
    const b = document.querySelector('#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]') || document.querySelector('#ob-atelier-rail .ob-cardrail-card');
    if (!b) return { nocard: true };
    if (document.activeElement !== document.body) document.activeElement.blur();
    const was = cue.hidden;
    const p = new Promise((res) => { const mo = new MutationObserver(() => { if (!cue.hidden) { mo.disconnect(); res(parseFloat(getComputedStyle(cue).opacity)); } });
      mo.observe(cue, { attributes: true, attributeFilter: ['hidden'] }); setTimeout(() => { mo.disconnect(); res(null); }, 6000); });
    b.click();
    return { was, opacity: await p, rm: matchMedia('(prefers-reduced-motion: reduce)').matches };
  })()`;
  const closeSheet = async (c, coarse) => { // the close FOCUSED, then a REAL press: the repair law (T7)
    await c.eval(`(document.querySelector('[data-ob="atelier-cue-close"]')?.focus({ preventScroll: true }), true)`);
    const x = await centre(c, '[data-ob="atelier-cue-close"]');
    if (x) await press(c, x, coarse);
    const hid = await waitExpr(c, `document.getElementById('ob-atelier-cue').hidden === true`, 30);
    // GH-668 S5 r10 (THE EXIT-BRIDGE LAW, atelier.md §7 S5-31): on the coarse
    // register the yielded rail returns only after the leaving sheet has
    // cleared hit-testing (one kit exit beat at most) and the dismiss's focus
    // hand-off rides that return — the read waits for the rail (bounded: 12 x
    // 50 ms); the T7 law itself is unchanged (the staged card, never <body>)
    await waitExpr(c, `(() => { const r = document.getElementById('ob-atelier-rail'); return !r || r.hidden || !r.classList.contains('ob-atelier-rail--yield'); })()`, 12, 50);
    const after = await c.eval(`(() => { const ae = document.activeElement; return { body: ae === document.body, card: ae.classList.contains('ob-cardrail-card'), id: ae.dataset && ae.dataset.id }; })()`);
    await sleep(250); // the exit beat
    return { hid, after };
  };
  for (const [w, h, kind, slot] of [[1440, 900, 'desktop', 0], [844, 390, 'phone', 1]]) {
    const coarse = kind === 'phone';
    const locs = T_LOCS[kind];
    const id = `S5-T ${w}x${h}`;
    const errs = [];
    const url = `http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=s5t_${w}`;
    if (!(await waitPortFree(CDP_PORT + slot))) { fail(`${id}: CDP port ${CDP_PORT + slot} still busy from the previous leg`); continue; }
    const c = coarse
      ? await launchPhone(url, { cdpPort: CDP_PORT + slot, width: w, height: h, tool: false })
      : await launchChrome(url, { port: CDP_PORT + slot, width: w, height: h, tool: false });
    watchErrors(c, errs);
    try {
      if (!(await waitReady(c))) { fail(`${id}: boot never became ready`); continue; }
      if (!(await toEquipment(c))) { fail(`${id}: atelier never mounted`); continue; }
      const bad = [];
      for (const loc of locs) {
        await c.eval(`window.__settings.set('language', ${J(loc)})`); await sleep(250);
        const tpl = dict(loc)['atelier.stat.vsEquipped'] ?? null;
        if (!tpl) bad.push(`${loc}/T2: atelier.stat.vsEquipped missing from the dictionary`);
        if (!(await goStation(c, 'cues'))) { bad.push(`${loc}: cues never presented`); continue; }
        await waitExpr(c, `window.__atelier.rail().live === true && document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card').length >= 2`, 60);
        await sleep(coarse ? 300 : 900); // the desktop arrival auto-inspect settles (or not: the dismiss memory)
        if (await c.eval(`document.getElementById('ob-atelier-cue').hidden === false`)) await closeSheet(c, coarse); // start from a closed sheet
        // (a) the EQUIPPED card through a SYNTHETIC click from <body>: T5 (enter through the kit) + T6 (hand-off)
        const enter = await c.eval(ENTER);
        if (enter.nocard) { bad.push(`${loc}: no rail card`); continue; }
        if (!(await waitExpr(c, `document.getElementById('ob-atelier-cue').hidden === false`, 40))) { bad.push(`${loc}: the equipped card's click never presented the sheet`); continue; }
        if (!enter.rm && !(enter.opacity !== null && enter.opacity < 0.99)) bad.push(`${loc}/T5: the sheet revealed at the rest pose (opacity ${enter.opacity}) — no kit enter (B-K22)`);
        await sleep(350);
        const eq = await c.eval(T_CENSUS(loc));
        if (eq.legends.length) bad.push(`${loc}/T2: the EQUIPPED card carries ${eq.legends.length} legend(s): ${J(eq.legends)}`);
        const wantFocus = coarse ? ['atelier-cue-close'] : ['atelier-equip', 'atelier-tryit']; // Equip is the disabled Equipped state on this card → Try it
        if (!wantFocus.includes(eq.active)) bad.push(`${loc}/T6: focus after a <body> present must land on ${wantFocus.join(' / ')}, got ${eq.active}`);
        // (b) dismiss with the close focused → focus repairs onto the staged rail card, never <body> (T7)
        const d1 = await closeSheet(c, coarse);
        if (!d1.hid) bad.push(`${loc}/T7: the close never hid the sheet`);
        if (d1.after.body || !d1.after.card) bad.push(`${loc}/T7: focus after the dismiss must sit on the staged rail card, got ${J(d1.after)}`);
        // (c) a DIFFERENT card through a REAL press (Chrome focuses the pressed card): the R2 changed register
        const pt = await centre(c, '#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])');
        if (!pt) { bad.push(`${loc}: no non-selected rail card to press`); continue; }
        await press(c, pt, coarse);
        if (!(await waitExpr(c, `document.getElementById('ob-atelier-cue').hidden === false && document.querySelectorAll('#ob-atelier-cue .ob-atelier-stat').length === 3`, 40))) { bad.push(`${loc}: the press never presented the other cue's card`); continue; }
        await sleep(120); // inside the flash beat; the read is computed style (declared for the element's lifetime)
        const k = await c.eval(T_CENSUS(loc));
        if (k.stats !== 3 || k.hints !== 3) bad.push(`${loc}/T3: ${k.hints}/${k.stats} stat labels wear .ob-hint without caps`);
        if (!k.changed) bad.push(`${loc}/T1: no stat in the changed register after a different cue (${k.sel} after ${eq.sel})`);
        for (const d of k.flash) if (!(d <= 0.2 + 1e-6)) bad.push(`${loc}/T1: stat flash ${d}s > --ob-t-med 0.2s`);
        if (k.flashName.some((nm) => nm === 'none') && !enter.rm) bad.push(`${loc}/T1: a changed stat has no flash animation`);
        if (k.morph !== null && !(k.morph <= 0.2 + 1e-6)) bad.push(`${loc}/T1: card morph ${k.morph}s > --ob-t-med 0.2s`);
        if (!k.legends.length) bad.push(`${loc}/T2: no vs-equipped legend on a differing card (equipped ${k.equipped}, presented ${k.sel})`);
        for (const l of k.legends) {
          if (!/^[+−]\d/.test(l.delta || '')) bad.push(`${loc}/T2: legend delta not signed: ${J(l)}`);
          if (tpl && l.text !== tpl.replace('{delta}', l.delta)) bad.push(`${loc}/T2: legend text ${J(l.text)} != ${J(tpl.replace('{delta}', l.delta))}`);
          if (!l.hint) bad.push(`${loc}/T2: legend not in the .ob-hint voice`);
        }
        if (!k.close || !k.closeKit || !k.glyph) bad.push(`${loc}/T4: close is not the kit icon pill with the close glyph: ${J({ close: k.close, kit: k.closeKit, glyph: k.glyph })}`);
        if (coarse ? !(k.closeH >= 43.5 && k.closeW >= 43.5) : !(Math.abs(k.closeH - 34) <= 1 && Math.abs(k.closeW - 34) <= 1)) bad.push(`${loc}/T4: close ${k.closeW}x${k.closeH} off the kit rung (${coarse ? '>= 44' : '34'})`);
        if (k.active === 'body') bad.push(`${loc}/T6: focus at <body> after a real card press`);
        if (!coarse && !k.activeInRail) bad.push(`${loc}/T6: a REAL press on a rail card must leave focus on the rail (got ${k.active})`);
        const d2 = await closeSheet(c, coarse);
        if (!d2.hid || d2.after.body || !d2.after.card) bad.push(`${loc}/T7: second dismiss: hid ${d2.hid}, focus ${J(d2.after)}`);
        log(`${id} [${loc}]: enter-opacity ${enter.opacity} focus ${eq.active}→${d1.after.id}→${k.active}→${d2.after.id}; changed ${k.changed} flash ${J(k.flash)} morph ${k.morph} legends ${k.legends.length} (${k.legends[0]?.text ?? '—'}) hints ${k.hints}/3 close ${k.closeW}x${k.closeH} kit ${k.closeKit} glyph ${k.glyph}`);
        await c.eval(`__atelier.go('table'), true`); await sleep(300); // a fresh cues arrival per locale
      }
      for (const m of bad) fail(`${id}: ${m}`);
      if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${id}: app errors: ` + J(await c.eval('__test.errors')));
      if (errs.length) fail(`${id}: console errors: ` + errs.slice(0, 3).join(' | '));
      if (!bad.length) log(`${id} done: one-beat flash, vs-equipped legend, kit icon close, hint labels, kit enter, focus law`);
    } finally { c.close(); await sleep(600); }
  }
}

// ---- S5-S: the rail register never precedes its sheet (OWNERSHIP mount law) --------------------
// `.ob-atelier--rail` keys every rail-register rule; on a COLD equipment arrival the atelier.css
// fetch raced the cardrail leaf import — rail live 250–1040 ms BEFORE the sheet applied on a loaded
// box (probe 2026-09-09) — and the R13 audit read the station h3 painted with the rail live (the
// degrade layout wearing the rail register's DOM). Law: at the FIRST sample where rail().live is
// true the atelier sheet is applied (cssRules > 0), and the audit's cues read finds the h3 hidden.
// Boot 0 holds the sheet 1500 ms at the network (Fetch intercept; cache off) = the deterministic
// form; boot 1 = natural conditions. RED on b9c4cf64 (boot 0: first live sample rules 0).
export async function runS5S({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  let n = 0; const fail = (m) => { n += 1; failIn(m); };
  const SAMPLE = `(() => { const l = document.getElementById('ob-atelier-css'); let rules = 0; try { rules = l?.sheet ? l.sheet.cssRules.length : 0; } catch { rules = -1; }
    return { live: window.__atelier?.rail?.().live === true, rules, cls: !!document.querySelector('.ob-atelier--rail'), link: !!l }; })()`;
  for (const [boot, holdMs] of [[0, 1500], [1, 0]]) {
    const id = `S5-S boot ${boot}${holdMs ? ` (sheet held ${holdMs} ms)` : ' (natural)'}`;
    if (!(await waitPortFree(CDP_PORT))) { fail(`${id}: CDP port ${CDP_PORT} still busy from the previous leg`); continue; }
    const errs = [];
    const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=s5s_${boot}`, { port: CDP_PORT, width: 1280, height: 800, tool: false });
    watchErrors(c, errs);
    try {
      if (!(await waitReady(c))) { fail(`${id}: boot never became ready`); continue; }
      if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail(`${id}: shell never mounted`); continue; }
      await waitExpr(c, 'window.__shell.isOpen() === true', 100);
      if (holdMs) { // atelier.js (and its sheet) load on the equipment arrival (shell.js PLACE map) — arm the hold first
        c.onEvent((method, params) => {
          if (method !== 'Fetch.requestPaused') return;
          const go = () => c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
          if (/ui\/atelier\.css/.test(params.request.url)) setTimeout(go, holdMs); else go();
        });
        await c.send('Network.setCacheDisabled', { cacheDisabled: true });
        await c.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
      }
      await c.eval(`__shell.go('equipment'), true`);
      let first = null; const t0 = Date.now(); let samples = 0;
      while (Date.now() - t0 < 20000) { // a loaded box takes > 9 s to the atelier mount (toEquipment's ceiling idiom)
        const smp = await c.eval(SAMPLE).catch(() => null); samples += 1;
        if (smp && smp.live) { first = smp; break; }
        await sleep(10);
      }
      if (!first) { fail(`${id}: the rail never went live within 20 s (${samples} samples; degrade register?)`); continue; }
      if (!(first.rules > 0)) fail(`${id}: the rail register flipped BEFORE its sheet applied — first live sample ${J(first)} after ${samples} samples (mount law: a pending sheet is a degraded state until it settles)`);
      const read = await c.eval(`(async () => { window.__atelier.go('cues');
        document.querySelector('#ob-atelier-rail .ob-cardrail-card')?.click();
        await new Promise((r) => setTimeout(r, 200));
        const h3 = document.querySelector('#ob-atelier-cards > section:not([hidden]) > h3');
        return { live: window.__atelier.rail().live, h3: h3 ? (h3.getClientRects().length ? 'painted' : 'hidden') : 'none' }; })()`);
      if (read.live && read.h3 === 'painted') fail(`${id}: the station h3 painted on the live-rail register at the audit's cues read: ${J(read)}`);
      if (holdMs) await c.send('Fetch.disable').catch(() => {});
      if (errs.length) fail(`${id}: console errors: ` + errs.slice(0, 3).join(' | '));
      log(`${id} done: first live sample ${J(first)} after ${samples} samples; cues read ${J(read)}`);
    } finally { c.close(); await sleep(600); }
  }
  if (!n) log('S5-S done: the rail register waited for its sheet on both boots');
}

// ---- S5-T7B) GH-668 S5 round 10b (the r10 checker's P3-a / P3-b; integrator
// rulings R1 / R2): THE EXIT-BRIDGE LAW's two FOCUS clauses on the coarse
// register, 844x390 + 667x375, both RED on 4313a7da.
//   (b) THE SYNCHRONOUS SETTLE (R2): a rAF sampler installed BEFORE the close
//       reads document.activeElement every frame until the staged card holds
//       focus — never <body>. On 4313a7da the un-yield + the parked hand-off
//       ran one rAF AFTER the kit's settle, so focus sat on <body> for a frame
//       (checker ctl trace: BODY@294 → card@311); the cure republishes in the
//       settle's own task. Focus resting on the LEAVING sheet's close through
//       the bridge is the accepted, recorded state (the [hidden] sheet is inert
//       for input by the pointer-events belt).
//   (a) THE HAND-OFF GUARD (R1): a station pill tapped INSIDE the hold (0 / 25 /
//       50 ms after the close's touchEnd, + the pill's own 40 ms touch hold)
//       keeps focus on the TAPPED PILL — never the new station rail's selected
//       card. On 4313a7da the parked hand-off (eqPendingFocus) fired at the
//       un-yield after the later interaction and stole focus (6/6 at 0-40 ms);
//       the cure runs it only while focus is still where the dismiss left it
//       (<body> or inside the [hidden] sheet), else drops it without moving.
// OB_S5_LEGS=T7B. The T7 law itself (the staged card, never <body>) is unchanged.
const T7B_SAMPLER = `(() => {
  const S = window.__t7b = { on: true, seq: [], frames: 0, body: 0, last: null, t0: performance.now() };
  const rail = document.getElementById('ob-atelier-rail'), cue = document.getElementById('ob-atelier-cue');
  const desc = (ae) => (!ae || ae === document.body) ? 'body'
    : ae.classList.contains('ob-cardrail-card') ? 'card:' + ae.dataset.id
    : ae.closest('#ob-atelier-cue') ? 'sheet:' + (ae.dataset.ob || ae.tagName)
    : ae.dataset.station ? 'pill:' + ae.dataset.station : (ae.dataset.ob || ae.id || ae.tagName);
  const tick = () => {
    if (!S.on) return;
    const ae = document.activeElement;
    let disp = '?'; try { disp = getComputedStyle(cue).display; } catch { /* gone */ }
    const key = desc(ae) + '|' + (rail && rail.classList.contains('ob-atelier-rail--yield') ? 'y1' : 'y0') + '|' + (cue.hidden ? 'h1' : 'h0') + '|' + disp;
    if (S.last !== key) { S.seq.push(key + '@' + Math.round(performance.now() - S.t0)); S.last = key; }
    S.frames += 1; if (cue.hidden && (!ae || ae === document.body)) S.body += 1; // <body> frames after the close
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})()`;
const T7B_READ = `(() => { const S = window.__t7b || { seq: [], frames: 0, body: 0 }; S.on = false; const ae = document.activeElement;
  const act = (!ae || ae === document.body) ? 'body' : (ae.classList.contains('ob-cardrail-card') ? 'card:' + ae.dataset.id : (ae.dataset.station ? 'pill:' + ae.dataset.station : (ae.dataset.ob || ae.id || ae.tagName)));
  return { seq: S.seq, frames: S.frames, body: S.body, act, onCard: !!ae && ae.classList.contains('ob-cardrail-card'), pill: (ae && ae.dataset && ae.dataset.station) || null,
    station: window.__atelier.station(), yield: !!document.getElementById('ob-atelier-rail')?.classList.contains('ob-atelier-rail--yield') }; })()`;
export async function runS5T7B({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  const CLOSE = '[data-ob="atelier-cue-close"]';
  const RAIL_BACK = `(() => { const r = document.getElementById('ob-atelier-rail'); return !r || r.hidden || !r.classList.contains('ob-atelier-rail--yield'); })()`;
  const RAIL_LIVE = `window.__atelier.rail().live === true && document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card').length >= 2`;
  const present = async (c) => { // the selected card through a synthetic click; the kit enter + the sheet's own hand-off settle
    if (await c.eval(`document.getElementById('ob-atelier-cue').hidden === false`)) return true;
    await c.eval(`(document.querySelector('#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]') || document.querySelector('#ob-atelier-rail .ob-cardrail-card'))?.click(), true`);
    if (!(await waitExpr(c, `document.getElementById('ob-atelier-cue').hidden === false`, 40))) return false;
    await sleep(350);
    return true;
  };
  for (const [w, h, slot] of [[844, 390, 0], [667, 375, 1]]) {
    let n = 0; const fail = (m) => { n += 1; failIn(m); };
    const id = `S5-T7B ${w}x${h}`;
    const errs = [];
    const url = `http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=s5t7b_${w}`;
    if (!(await waitPortFree(CDP_PORT + slot))) { fail(`${id}: CDP port ${CDP_PORT + slot} still busy from the previous leg`); continue; }
    const c = await launchPhone(url, { cdpPort: CDP_PORT + slot, width: w, height: h, tool: false });
    watchErrors(c, errs);
    try {
      if (!(await waitReady(c))) { fail(`${id}: boot never became ready`); continue; }
      if (!(await toEquipment(c))) { fail(`${id}: atelier never mounted`); continue; }
      if (!(await goStation(c, 'cues'))) { fail(`${id}: cues never presented`); continue; }
      await waitExpr(c, RAIL_LIVE, 60);
      await sleep(300);
      // (b) R2 — close with the close focused; every frame until the staged card holds focus is read
      if (!(await present(c))) { fail(`${id}: the card click never presented the sheet`); continue; }
      await c.eval(`(document.querySelector(${J(CLOSE)})?.focus({ preventScroll: true }), true)`);
      const x = await centre(c, CLOSE);
      if (!x) { fail(`${id}: no close control`); continue; }
      await c.eval(T7B_SAMPLER);
      await press(c, x, true);
      const hid = await waitExpr(c, `document.getElementById('ob-atelier-cue').hidden === true`, 30);
      await waitExpr(c, RAIL_BACK, 12, 50);
      const onCard = await waitExpr(c, `!!document.activeElement && document.activeElement.classList.contains('ob-cardrail-card')`, 10, 50);
      const s1 = await c.eval(T7B_READ);
      if (!hid) fail(`${id}/T7b: the close never hid the sheet`);
      if (!onCard) fail(`${id}/T7b: focus after the dismiss must sit on the staged rail card, got ${s1.act} (seq ${J(s1.seq)})`);
      if (s1.body) fail(`${id}/T7b: focus rested on <body> for ${s1.body} frame(s) of ${s1.frames} between the close and the staged card (R2: the un-yield + hand-off land in the kit settle's own task): ${J(s1.seq)}`);
      log(`${id}: close → ${s1.act}; ${s1.frames} frames, body ${s1.body}; ${J(s1.seq)}`);
      await sleep(250);
      // (a) R1 — a station pill tapped INSIDE the hold keeps focus (0 / 25 / 50 ms after the close's touchEnd)
      for (const d of [0, 25, 50]) {
        if (!(await goStation(c, 'cues'))) { fail(`${id}: cues never re-presented (rung ${d} ms)`); break; }
        await waitExpr(c, RAIL_LIVE, 60);
        await sleep(300);
        if (!(await present(c))) { fail(`${id}: the card click never presented the sheet (rung ${d} ms)`); break; }
        await c.eval(`(document.querySelector(${J(CLOSE)})?.focus({ preventScroll: true }), true)`);
        const cx = await centre(c, CLOSE);
        const px = await c.eval(`(() => { const b = [...document.querySelectorAll('nav [data-station="table"]')].find((el) => el.getBoundingClientRect().width > 0);
          if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        if (!cx || !px) { fail(`${id}: no close / table pill to tap (rung ${d} ms)`); break; }
        await c.eval(T7B_SAMPLER);
        await press(c, cx, true);
        if (d) await sleep(d);
        await press(c, px, true);
        const changed = await waitExpr(c, `window.__atelier.station() === 'table'`, 40);
        await waitExpr(c, RAIL_BACK, 12, 50);
        await sleep(300); // past the hold's bound (2 x the kit bridge): a parked hand-off has had its beat
        const s = await c.eval(T7B_READ);
        if (!changed) fail(`${id}/T7b: the table pill tap ${d} ms after the close never changed the station (got ${s.station}; seq ${J(s.seq)})`);
        else if (s.pill !== 'table' || s.onCard) fail(`${id}/T7b: a station-pill tap ${d} ms after the close lost focus to ${s.act} (R1: the parked hand-off ran after a later interaction; the tapped pill keeps focus): ${J(s.seq)}`);
        else log(`${id}: pill tap +${d} ms → focus ${s.act}; ${J(s.seq)}`);
      }
      if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${id}: app errors: ` + J(await c.eval('__test.errors')));
      if (errs.length) fail(`${id}: console errors: ` + errs.slice(0, 3).join(' | '));
      if (!n) log(`${id} done: no <body> frame across the close; the tapped pill keeps focus inside the hold (0 / 25 / 50 ms)`);
    } finally { c.close(); await sleep(600); }
  }
}

const LEGS = (process.env.OB_S5_LEGS || 'K,K2,BG,C,PL,HA,M,F,T,T7B,S').split(',');
export async function runS5(ctx) {
  if (LEGS.includes('K')) await runS5K(ctx);
  if (LEGS.includes('K2')) await runS5K2(ctx);
  if (LEGS.includes('BG')) await runS5BG(ctx);
  if (LEGS.includes('C')) await runS5C(ctx);
  if (LEGS.includes('PL')) await runS5PL(ctx);
  if (LEGS.includes('HA')) await runS5HA(ctx);
  if (LEGS.includes('M')) await runS5M(ctx);
  if (LEGS.includes('F')) await runS5F(ctx);
  if (LEGS.includes('T')) await runS5T(ctx);
  if (LEGS.includes('T7B')) await runS5T7B(ctx);
  if (LEGS.includes('S')) await runS5S(ctx);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const fail = (msg) => { console.error('E2E-ATELIER-S5 FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runS5({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-S5 FAIL' : 'E2E-ATELIER-S5 PASS');
}
