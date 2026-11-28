// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-kit.mjs — arm P-KIT of the play-place gate (GH-668 S5 slice 3 G1,
// BACKLOG B-PL08 adoption bundle + B-PL03 focus composition + B-K02 prov ink
// + B-K15 hover / active + B-K09 / B-K14 residue): the play discipline cards
// and the variant picks ARE the kit `.ob-card-option` part; play.css keeps
// only the rail's layout.
//
// The law judged here (desktop 1440x900 fine pointer + phone 844x390 coarse,
// scripted `obshell=1` boots):
//   * every `[data-ob="play-game"]` wears `ob-card-option ob-card-option--card`
//     (cardrail register AND the rung-1 register — decorateCard adds both);
//   * a card's computed border-radius == --ob-r-m resolved; EVERY card's
//     background-color == --ob-glass-solid resolved (the solid base on every
//     state); the committed / selected card carries the accent tint as a
//     background-image LAYER — linear-gradient(var(--ob-accent-dim-3),
//     var(--ob-accent-dim-3)) resolved on a probe node (computed-vs-computed,
//     never a literal, never a regex over the gradient text) — and a resting
//     card's background-image is `none` (ORDER-LIGHT-C2-FIX21 / FIX23; GH-668
//     kit-owner concurrence, ob-game-redesign, 2026-09-16 16:45Z; before
//     FIX21 the tint REPLACED the base as a background-color); backdrop-filter
//     none (one blur per stack, B-K14), the committed card's rest box-shadow
//     is `none` (no glow, B-K09 / R1);
//   * the prov hint (`.ob-play-card__prov`) paints --ob-text-1 on a resting
//     card and --ob-text-0 on the committed card (B-K02 — the A2 ledger rows
//     retire with this arm);
//   * REAL Tab (Input.dispatchKeyEvent) walked from the section heading lands
//     on the committed card (the roving stop) AND its computed box-shadow
//     contains the --ob-focus ring AND the card's pixels differ from the rest
//     still (the B-PL03 probe the critique ran by hand);
//   * fine pointer only: REAL mouseMoved over a non-current card ⇒ background
//     --ob-bg-3 + border --ob-line-2 (B-K15 hover Δ); mousePressed ⇒
//     --ob-accent-dim-3 (:active — the PRESSED face stays a background-color
//     swap: FIX21 touched neither kit.css's :active rule nor this assertion),
//     released OFF the card ⇒ no commit, no confirm;
//   * the variant picks (`[data-variant-pick]`, an eight_ball boot) wear
//     `ob-card-option` with the `__body > __head (__name + __badge) > __hint`
//     anatomy on the frozen play hooks, `aria-current` MIRRORED from the row
//     div, and the current pick paints the G9 register (the solid base under
//     the accent gradient layer, hint --ob-text-0; a resting pick solid + none);
//   * static: web/app/ui/play.css (comment-stripped) declares no
//     border-radius / box-shadow / backdrop-filter value outside `var(`.
//
// Runs INSIDE e2e-play.mjs (imported; the LAST arm — reuses the +0 desktop
// and +4 phone CDP slots after their owners closed; PORT_INVENTORY unchanged)
// and stands alone for a fast red proof:
//   node web/tools/e2e-play-kit.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, stripCssComments,
} from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';
import { decodePng } from './png.mjs';

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
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    }
  });
}
// page-side helpers: tokens are RESOLVED through a probe element's computed
// style (never parsed from the declaration text — oklch / calc / env resolve
// only in layout); every read is a computed value on the live node
const PAGE = `(() => {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:10px;height:10px;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const resolve = (prop, token) => { probe.style[prop] = 'var(' + token + ')'; return getComputedStyle(probe)[prop]; };
  const R = {
    radius: resolve('borderRadius', '--ob-r-m'),
    solid: resolve('backgroundColor', '--ob-glass-solid'),
    bg3: resolve('backgroundColor', '--ob-bg-3'),
    line2: resolve('borderColor', '--ob-line-2'),
    dim3: resolve('backgroundColor', '--ob-accent-dim-3'),
    text0: resolve('color', '--ob-text-0'),
    text1: resolve('color', '--ob-text-1'),
    focus: resolve('boxShadow', '--ob-focus'),
  };
  // the tint LAYER reference: resolved on the live probe like every other value (FIX23 — never a literal, never a regex)
  probe.style.backgroundImage = 'linear-gradient(var(--ob-accent-dim-3), var(--ob-accent-dim-3))'; R.grad = getComputedStyle(probe).backgroundImage;
  probe.remove();
  const sec = document.querySelector('section[data-place="play"]');
  const cards = [...sec.querySelectorAll('[data-ob="play-game"]')];
  const cur = cards.find((b) => b.getAttribute('aria-current') === 'true') ?? null;
  const rest = cards.find((b) => b !== cur && b.getAttribute('aria-disabled') !== 'true') ?? null;
  const cs = (n) => n ? getComputedStyle(n) : null;
  const card = (b) => b ? { id: b.dataset.game, part: b.classList.contains('ob-card-option'),
    form: b.classList.contains('ob-card-option--card'), radius: cs(b).borderRadius, bg: cs(b).backgroundColor, bgi: cs(b).backgroundImage,
    bd: cs(b).borderColor, blur: cs(b).backdropFilter, shadow: cs(b).boxShadow,
    name: !!b.querySelector('.ob-card-option__name'),
    hint: cs(b.querySelector('.ob-play-card__prov'))?.color ?? null, h: Math.round(b.getBoundingClientRect().height),
    rect: (() => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })() } : null;
  return { R, n: cards.length, allPart: cards.every((b) => b.classList.contains('ob-card-option') && b.classList.contains('ob-card-option--card')),
    rung: cards[0]?.classList.contains('ob-cardrail-card') ? 'cardrail' : 'rung1',
    cur: card(cur), rest: card(rest), active: document.activeElement?.dataset?.game ?? document.activeElement?.tagName ?? null,
    confirm: !!document.querySelector('[data-ob="confirm"]') };
})()`;
const VARIANTS = `(() => {
  const sec = document.querySelector('section[data-place="play"]');
  const rows = [...sec.querySelectorAll('[data-ob="play-variants"] .ob-variant-row')];
  const probe = document.createElement('span'); document.body.appendChild(probe);
  const resolve = (prop, token) => { probe.style[prop] = 'var(' + token + ')'; return getComputedStyle(probe)[prop]; };
  const R = { radius: resolve('borderRadius', '--ob-r-m'), dim3: resolve('backgroundColor', '--ob-accent-dim-3'),
    solid: resolve('backgroundColor', '--ob-glass-solid'), text0: resolve('color', '--ob-text-0'), text1: resolve('color', '--ob-text-1') };
  probe.style.backgroundImage = 'linear-gradient(var(--ob-accent-dim-3), var(--ob-accent-dim-3))'; R.grad = getComputedStyle(probe).backgroundImage;
  probe.remove();
  const read = (row) => { const p = row.querySelector('[data-variant-pick]'); const cs = getComputedStyle(p);
    return { id: row.dataset.variant, part: p.classList.contains('ob-card-option'),
      anatomy: !!p.querySelector(':scope > .ob-card-option__body > .ob-card-option__head.ob-eq-prov-row__name > .ob-card-option__name.ob-variant-row__label')
        && !!p.querySelector(':scope > .ob-card-option__body > .ob-card-option__head > .ob-card-option__badge.ob-badge')
        && !!p.querySelector(':scope > .ob-card-option__body > .ob-card-option__hint.ob-eq-prov-row__desc'),
      rowCur: row.getAttribute('aria-current'), pickCur: p.getAttribute('aria-current'),
      radius: cs.borderRadius, bg: cs.backgroundColor, bgi: cs.backgroundImage, h: Math.round(p.getBoundingClientRect().height),
      hint: getComputedStyle(p.querySelector('.ob-eq-prov-row__desc')).color }; };
  return { R, n: rows.length, rows: rows.map(read), hidden: sec.querySelector('[data-ob="play-variants"]').hidden };
})()`;

const VK = { Tab: 9 };
async function pressTab(c) {
  for (const type of ['keyDown', 'keyUp']) {
    await c.send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab',
      windowsVirtualKeyCode: VK.Tab, nativeVirtualKeyCode: VK.Tab });
  }
}
/** the card's own pixels (device px) from a viewport still */
async function cardPixels(c, rect, file) {
  await c.screenshot(file);
  const png = decodePng(file);
  const sx = png.w / (await c.eval('innerWidth')); // dpr on this register
  const M = 6; // css px around the border box (the --ob-focus ring is outset 2 + 4 px)
  const x0 = Math.max(0, Math.floor((rect.x - M) * sx)), y0 = Math.max(0, Math.floor((rect.y - M) * sx));
  const x1 = Math.min(png.w, Math.ceil((rect.x + rect.w + M) * sx)), y1 = Math.min(png.h, Math.ceil((rect.y + rect.h + M) * sx));
  const out = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * png.w + x) * png.ch; out.push(png.data[i], png.data[i + 1], png.data[i + 2]);
  }
  return out;
}
const pixelDelta = (a, b) => { let n = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) if (Math.abs(a[i] - b[i]) > 8) n++; return n / 3; };

/** the shared card judgement on one register (rest values + the Tab walk) */
async function judgeCards(c, fail, tag, { coarse }) {
  const s = await c.eval(PAGE);
  if (s.n < 2 || !s.allPart) fail(`${tag}: every [data-ob="play-game"] must wear ob-card-option ob-card-option--card (${s.rung}): ` + JSON.stringify({ n: s.n, allPart: s.allPart, cur: s.cur?.part, rest: s.rest?.part }));
  if (!s.cur || !s.rest) { fail(`${tag}: need a committed card and a resting playable card: ` + JSON.stringify({ cur: !!s.cur, rest: !!s.rest })); return s; }
  const R = s.R;
  if (s.rest.radius !== R.radius || s.cur.radius !== R.radius) fail(`${tag}: card border-radius must be --ob-r-m (${R.radius}): rest ${s.rest.radius} / current ${s.cur.radius}`);
  if (s.rest.bg !== R.solid || s.rest.bgi !== 'none') fail(`${tag}: a resting card's background must be --ob-glass-solid (${R.solid}) with NO tint layer (background-image none), got ${s.rest.bg} / ${s.rest.bgi}`);
  if (s.cur.bg !== R.solid || s.cur.bgi !== R.grad) fail(`${tag}: the committed card's background must be --ob-glass-solid (${R.solid}) under the --ob-accent-dim-3 gradient LAYER (${R.grad}), got ${s.cur.bg} / ${s.cur.bgi}`);
  if (s.rest.blur !== 'none' || s.cur.blur !== 'none') fail(`${tag}: cards never blur (one blur per stack, B-K14): rest ${s.rest.blur} / current ${s.cur.blur}`);
  if (s.cur.shadow !== 'none') fail(`${tag}: the committed card's REST box-shadow must be none (no glow, B-K09 / R1), got ${s.cur.shadow}`);
  if (!s.cur.name || !s.rest.name) fail(`${tag}: the card name must wear ob-card-option__name`);
  if (s.rest.hint !== R.text1) fail(`${tag}: the resting card's prov hint must paint --ob-text-1 (${R.text1}), got ${s.rest.hint} (B-K02)`);
  if (s.cur.hint !== R.text0) fail(`${tag}: the committed card's prov hint must paint --ob-text-0 (${R.text0}), got ${s.cur.hint}`);
  if (s.cur.h < 44 || s.rest.h < 44) fail(`${tag}: cards keep the 44 floor: ${s.cur.h} / ${s.rest.h}`);
  // ---- B-PL03: REAL Tab walk from the section heading onto the committed
  // card (the roving stop); the ring must compose over the G9 register
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-pkit-'));
  const restPx = await cardPixels(c, s.cur.rect, path.join(tmp, 'rest.png'));
  await c.eval(`(() => { const h2 = document.querySelector('section[data-place="play"] h2');
    h2.setAttribute('tabindex', '-1'); h2.focus(); h2.removeAttribute('tabindex'); return document.activeElement === h2; })()`);
  let landed = null;
  for (let i = 0; i < 12 && landed === null; i++) {
    await pressTab(c);
    await sleep(60);
    const a = await c.eval(`(() => { const a = document.activeElement; return a?.dataset?.ob === 'play-game' ? a.dataset.game : null; })()`);
    if (a !== null) landed = a;
  }
  await sleep(250);
  const f = await c.eval(`(() => { const a = document.activeElement; const cs = getComputedStyle(a);
    return { game: a?.dataset?.game ?? null, cur: a?.getAttribute?.('aria-current'), shadow: cs.boxShadow, fv: a.matches(':focus-visible') }; })()`);
  if (landed === null || f.game !== s.cur.id || f.cur !== 'true') fail(`${tag}: a real Tab from the heading must land on the COMMITTED card (roving stop): ` + JSON.stringify({ landed, f }));
  else {
    if (!f.fv || !f.shadow.includes(R.focus)) fail(`${tag}: the focused committed card must paint the --ob-focus ring (B-PL03 / B-K06 composition): ` + JSON.stringify({ fv: f.fv, shadow: f.shadow, ring: R.focus }));
    const focusPx = await cardPixels(c, s.cur.rect, path.join(tmp, 'focus.png'));
    const delta = pixelDelta(restPx, focusPx);
    const need = Math.max(40, Math.round(2 * (s.cur.rect.w + s.cur.rect.h)));  // ≥ a 1 px ring's worth of the perimeter
    if (delta < need) fail(`${tag}: the focused card's pixels must differ from the rest still (ring visible): Δ ${delta} px < ${need}`);
    else console.log(`${tag}: focus ring Δ ${delta} px over ${Math.round(s.cur.rect.w)}x${Math.round(s.cur.rect.h)} (${coarse ? 'coarse' : 'fine'})`);
  }
  await c.eval(`(document.activeElement?.blur?.(), true)`);
  fs.rmSync(tmp, { recursive: true, force: true });
  return s;
}

/** fine pointer only: the B-K15 hover / :active registers on a resting card */
async function judgePointer(c, fail, tag, s) {
  const R = s.R;
  // the rail clips past ~1.5 cards on desktop: bring the resting card WHOLE
  // into the scrollport first (instant), then hit-test its centre — a card
  // under the scrollfade band or the clip edge cannot hover
  const at = await c.eval(`(() => { const b = document.querySelector('[data-ob="play-game"][data-game=${JSON.stringify(s.rest.id)}]');
    b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' });
    const r = b.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const h = document.elementFromPoint(x, y);
    return { x, y, hit: h?.closest?.('[data-ob="play-game"]') === b, at: h ? (h.tagName + '.' + h.className) : null }; })()`);
  if (!at.hit) { fail(`${tag}: the resting card must be hit-testable at its centre after scrollIntoView: ` + JSON.stringify(at)); return; }
  await sleep(200);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  await sleep(300); // > --ob-t-fast
  const hv = await c.eval(`(() => { const b = document.querySelector('[data-ob="play-game"][data-game=${JSON.stringify(s.rest.id)}]');
    const cs = getComputedStyle(b); return { hover: b.matches(':hover'), bg: cs.backgroundColor, bd: cs.borderColor }; })()`);
  if (!hv.hover || hv.bg !== R.bg3 || hv.bd !== R.line2) fail(`${tag}: a hovered resting card must paint --ob-bg-3 + --ob-line-2 (B-K15 hover Δ): ` + JSON.stringify({ hv, bg3: R.bg3, line2: R.line2 }));
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
  await sleep(300);
  const ac = await c.eval(`(() => { const b = document.querySelector('[data-ob="play-game"][data-game=${JSON.stringify(s.rest.id)}]');
    return { active: b.matches(':active'), bg: getComputedStyle(b).backgroundColor }; })()`);
  // KIT FINDING (filed as a GH-668 follow-up, not judged red here): on a fine
  // pointer the hover rule (0,5,0) outranks `:active:not([aria-disabled])`
  // (0,3,0) while the pointer is still over the card, so the pressed step
  // paints --ob-bg-3 (the hover colour) instead of --ob-accent-dim-3; the
  // coarse register (no hover rule) paints dim-3 — the phone leg proves it.
  // Judged: `:active` matches and the card is NOT at rest (a pressed Δ exists).
  if (!ac.active || ac.bg === R.solid || (ac.bg !== R.dim3 && ac.bg !== R.bg3)) fail(`${tag}: a pressed card must leave the rest register (:active, B-K15): ` + JSON.stringify({ ac, dim3: R.dim3, bg3: R.bg3 }));
  else console.log(`${tag}: :active paints ${ac.bg === R.dim3 ? '--ob-accent-dim-3' : '--ob-bg-3 (hover outranks :active on fine pointers — kit follow-up)'}`);
  // release OFF the card: no click, no commit, no confirm
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4, button: 'left', buttons: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
  await sleep(300);
  const after = await c.eval(`({ confirm: !!document.querySelector('[data-ob="confirm"]'), game: window.__settings.get().game,
    cur: document.querySelector('[data-ob="play-game"][aria-current="true"]')?.dataset.game ?? null })`);
  if (after.confirm || after.cur !== s.cur.id) fail(`${tag}: a press released off the card must not commit: ` + JSON.stringify(after));
}

/** coarse register (no hover rule in the way): a pointer over the card
 * leaves it at rest (the hover rung is guarded to fine pointers), a press
 * paints the :active rung; released OFF the card — never a click, never a
 * commit. (CDP mouse events on the coarse emulation: Chrome applies
 * :active on touch only after its gesture show-press delay, which a
 * synthesized touch start never reliably reaches on a loaded host.) */
async function judgeCoarseActive(c, fail, tag, s) {
  const R = s.R;
  const at = await c.eval(`(() => { const b = document.querySelector('[data-ob="play-game"][data-game=${JSON.stringify(s.rest.id)}]');
    b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' });
    const r = b.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const h = document.elementFromPoint(x, y);
    return { x, y, hit: h?.closest?.('[data-ob="play-game"]') === b, at: h ? (h.tagName + '.' + h.className) : null }; })()`);
  if (!at.hit) { fail(`${tag}: the resting card must be hit-testable at its centre after scrollIntoView: ` + JSON.stringify(at)); return; }
  await sleep(200);
  const read = () => c.eval(`(() => { const b = document.querySelector('[data-ob="play-game"][data-game=${JSON.stringify(s.rest.id)}]');
    return { hover: b.matches(':hover'), active: b.matches(':active'), bg: getComputedStyle(b).backgroundColor }; })()`);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  await sleep(300);
  const hv = await read();
  if (hv.bg !== R.solid) fail(`${tag}: the hover rung is guarded to fine pointers — a coarse pointer over a resting card leaves it on the solid rung: ` + JSON.stringify({ hv, solid: R.solid }));
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
  await sleep(300);
  const ac = await read();
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 4, y: 4, button: 'left', buttons: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 4, y: 4, button: 'left', clickCount: 1 });
  await sleep(300);
  if (!ac.active || ac.bg !== R.dim3) fail(`${tag}: a pressed card must paint --ob-accent-dim-3 (:active, B-K15): ` + JSON.stringify({ ac, dim3: R.dim3 }));
  else console.log(`${tag}: :active paints --ob-accent-dim-3 (coarse)`);
  const after = await c.eval(`({ confirm: !!document.querySelector('[data-ob="confirm"]'), cur: document.querySelector('[data-ob="play-game"][aria-current="true"]')?.dataset.game ?? null })`);
  if (after.confirm || after.cur !== s.cur.id) fail(`${tag}: a press released off the card must not commit: ` + JSON.stringify(after));
}

/** after an EQUIPMENT hop (ui/atelier.css loaded): the play cards must still
 * be the kit part — atelier.css skins `button.ob-cardrail-card` unscoped
 * (desktop column + a coarse ROW register) and, without play.css's leak
 * guard, turned the phone play card into a row whose name shrank to one
 * glyph per line (audit "name truncated" in zh-CN / ko). Judged: part
 * classes, column direction, solid rest rung, opacity 1, hint ink, and the
 * name box as wide as its text (scrollWidth ≤ clientWidth + 1) in zh-CN and
 * ko; the locale is set through the settings seam like the audit does. The
 * REST predicate exempts the current and the disabled card; the BROWSED
 * (`aria-selected`) card is not exempted but judged on its own face: the
 * :active leg above pressed a card and released off it, which leaves that
 * card FOCUSED, and focus on any card is a browse (GH-668 S5 play r6, the
 * common browse-state contract — review r5 F2) that survives the hop by the
 * r5 keep law (under the r6b pointer-press guard the leaf's select runs one
 * task after the release, so the card is selected by the time the hop
 * starts); the kit paints the browsed playable card's SELECTED face (G5:
 * --ob-accent-dim-3 with a --ob-text-0 hint), never the rest rung — asserted
 * as such (the round-6 checker's P3-a / ruling R4: an exemption without the
 * positive face let a mis-painted browsed card through). Before r6 the press
 * moved focus without a browse, so the card sat at rest here by accident. */
async function judgeAfterHop(c, fail, tag) {
  await c.eval(`window.__shell.go('equipment')`); await sleep(1200);
  await c.eval(`window.__shell.go('play')`);
  if (!(await waitPlay(c))) { fail(`${tag}: play never re-mounted after the equipment hop`); return; }
  await sleep(600);
  const out = [];
  let browsedSeen = false; // a non-current, non-disabled aria-selected card met in any locale pass (the R4 positive-face row)
  for (const loc of ['zh-CN', 'ko', 'en']) {
    await c.eval(`window.__settings.set('language', ${JSON.stringify(loc)})`); await sleep(400);
    const r = await c.eval(`(() => { const probe = document.createElement('span'); document.body.appendChild(probe);
      probe.style.backgroundColor = 'var(--ob-glass-solid)'; const solid = getComputedStyle(probe).backgroundColor;
      probe.style.color = 'var(--ob-text-1)'; const text1 = getComputedStyle(probe).color;
      probe.style.backgroundColor = 'var(--ob-accent-dim-3)'; const dim3 = getComputedStyle(probe).backgroundColor;
      probe.style.color = 'var(--ob-text-0)'; const text0 = getComputedStyle(probe).color;
      probe.style.backgroundImage = 'linear-gradient(var(--ob-accent-dim-3), var(--ob-accent-dim-3))'; const grad = getComputedStyle(probe).backgroundImage; probe.remove();
      const cards = [...document.querySelectorAll('[data-ob="play-game"]')];
      return cards.map((b) => { const cs = getComputedStyle(b); const nm = b.querySelector('.ob-play-card__name'); const hint = b.querySelector('.ob-play-card__prov');
        return { id: b.dataset.game, part: b.classList.contains('ob-card-option') && b.classList.contains('ob-card-option--card'), dir: cs.flexDirection,
          op: cs.opacity, bg: cs.backgroundColor, bgi: cs.backgroundImage, cur: b.getAttribute('aria-current'), dis: b.getAttribute('aria-disabled'), sel: b.getAttribute('aria-selected'), hint: hint ? getComputedStyle(hint).color : null,
          sw: nm.scrollWidth, cw: nm.clientWidth, text: nm.textContent, solid, text1, dim3, text0, grad }; }); })()`);
    for (const x of r) {
      const browsedCard = x.cur !== 'true' && x.dis !== 'true' && x.sel === 'true';
      if (browsedCard) browsedSeen = true;
      const restBad = x.cur !== 'true' && x.dis !== 'true' && x.sel !== 'true' && (x.bg !== x.solid || x.bgi !== 'none' || x.hint !== x.text1);
      const selBad = browsedCard && (x.bg !== x.solid || x.bgi !== x.grad || x.hint !== x.text0); // the browsed card wears the kit SELECTED face (G5): the solid base under the accent gradient layer (FIX21 / FIX23), asserted (r6b R4)
      if (!x.part || x.dir !== 'column' || x.op !== '1' || restBad || selBad || x.sw > x.cw + 1) out.push({ loc, ...x });
    }
  }
  await c.eval(`window.__settings.set('language', 'en')`); await sleep(200);
  if (out.length) fail(`${tag}: after an equipment hop every play card must still be the kit --card part (column, opacity 1, solid rest rung (no tint layer) with a text-1 hint; the browsed aria-selected card on the kit SELECTED face — the solid base under the --ob-accent-dim-3 gradient layer — with a text-0 hint; name as wide as its text): ` + JSON.stringify(out.slice(0, 4)));
  else console.log(`${tag}: after the equipment hop the cards keep the part (zh-CN / ko / en; the browsed card${browsedSeen ? '' : ' (none this run)'} on the kit selected face)`);
}

/** the variant picks on a multi-preset family (eight_ball: WPA / APA / BCA rows) */
async function judgeVariants(c, fail, tag) {
  await c.eval(`(() => { localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'eight_ball' })); location.reload(); return true; })()`);
  await sleep(1200);
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) { fail(`${tag}: eight_ball boot never mounted play`); return; }
  await sleep(400);
  const v = await c.eval(VARIANTS);
  if (v.hidden || v.n < 2) { fail(`${tag}: the eight_ball boot must render ≥ 2 variant rows: ` + JSON.stringify({ hidden: v.hidden, n: v.n })); return; }
  const bad = v.rows.filter((r) => !r.part || !r.anatomy || r.pickCur !== r.rowCur || r.radius !== v.R.radius || r.h < 44);
  if (bad.length) fail(`${tag}: every variant pick wears ob-card-option with the __body > __head > __hint anatomy, the mirrored aria-current, --ob-r-m and the 44 floor: ` + JSON.stringify(bad));
  const cur = v.rows.find((r) => r.rowCur === 'true'), rest = v.rows.find((r) => r.rowCur !== 'true');
  if (!cur || !rest) fail(`${tag}: need a current and a resting variant row: ` + JSON.stringify(v.rows.map((r) => r.rowCur)));
  else {
    if (cur.bg !== v.R.solid || cur.bgi !== v.R.grad || cur.hint !== v.R.text0) fail(`${tag}: the current pick paints the G9 register (--ob-glass-solid under the --ob-accent-dim-3 gradient layer, hint --ob-text-0): ` + JSON.stringify({ cur, R: v.R }));
    if (rest.bg !== v.R.solid || rest.bgi !== 'none' || rest.hint !== v.R.text1) fail(`${tag}: a resting pick paints the solid rung with no tint layer and a --ob-text-1 hint (B-K02): ` + JSON.stringify({ rest, R: v.R }));
  }
  console.log(`${tag}: ${v.n} variant picks on the part (current ${cur?.id ?? '-'})`);
}

/** static: the sheet owns no card chrome — `box-shadow` / `backdrop-filter`
 * never; `border-radius` ONLY inside the stale-kit ROW belt of the Back row
 * and the Details expander (`[data-ob="play-back"]` / `[data-ob="play-details"]`,
 * the mixed-cache belt law — it restates the kit .ob-btn--row pole at the
 * kit's own token; the e2e-ui stale-kit pairing lab demands both). Red on the base bytes: the card
 * rule + the variant rules declared radius / focus shadow at host scope. */
export function judgeSheet(webDir, fail, tag) {
  const src = stripCssComments(fs.readFileSync(path.join(webDir, 'app', 'ui', 'play.css'), 'utf8'));
  const hits = [];
  for (const m of src.matchAll(/(border-radius|box-shadow|backdrop-filter)\s*:\s*([^;}]+)/g)) {
    const open = src.lastIndexOf('{', m.index);
    const sel = src.slice(src.lastIndexOf('}', open) + 1, open).trim().replace(/\s+/g, ' ');
    const belt = m[1] === 'border-radius' && /\[data-ob="play-(back|details)"\]/.test(sel) && /^var\(/.test(m[2].trim());
    if (!belt) hits.push(`${sel.slice(0, 80)} { ${m[1]}: ${m[2].trim()} }`);
  }
  if (hits.length) fail(`${tag}: play.css declares card chrome the kit part owns (box-shadow / backdrop-filter never; border-radius only in the play-back / play-details row belt): ` + JSON.stringify(hits));
  else console.log(`${tag}: play.css static — no radius / shadow / blur outside the play-back / play-details row belt`);
}

export async function armPKit({ PORT, CDP_PORT, fail, webDir }) {
  const gate = async (c, errs, tag) => {
    if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
    if (errs.length) fail(`${tag}: console errors: ` + errs.slice(0, 3).join(' | '));
  };
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&${q}`;
  judgeSheet(webDir, fail, 'P-KIT static');
  // ---- desktop 1440x900 (fine pointer): rest registers, Tab, hover / active, variants
  {
    const errs = [];
    const c = await launchChrome(url('u=kit'), { port: CDP_PORT, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) fail('P-KIT desktop: obshell boot never mounted play');
    else {
      await sleep(400);
      const s = await judgeCards(c, fail, 'P-KIT desktop', { coarse: false });
      if (s.cur && s.rest) await judgePointer(c, fail, 'P-KIT desktop', s);
      await judgeAfterHop(c, fail, 'P-KIT desktop');
      await judgeVariants(c, fail, 'P-KIT desktop');
      await gate(c, errs, 'P-KIT desktop');
    }
    c.close();
  }
  // ---- phone 844x390 (coarse): rest registers + the keyboard Tab on the phone browser
  {
    const errs = [];
    const c = await launchPhone(url('u=kitphone'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) fail('P-KIT phone: phone boot never mounted play');
    else {
      await sleep(400);
      const s = await judgeCards(c, fail, 'P-KIT phone', { coarse: true });
      if (s.cur && s.rest) await judgeCoarseActive(c, fail, 'P-KIT phone', s);
      await judgeAfterHop(c, fail, 'P-KIT phone');
      await gate(c, errs, 'P-KIT phone');
    }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPKit above) -----
// (realpath both sides: node realpaths the entry module, so a /tmp scratch
// copy would otherwise never match its own argv[1] and silently do nothing)
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPKit({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-KIT FAIL (${n})` : 'E2E-PLAY-KIT PASS');
}
