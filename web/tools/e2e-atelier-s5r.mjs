// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-s5r.mjs — GH-668 S5 review r3 (P2-2): the re-homed
// cushion rows keep the option-row register on the coarse rail. A LEG MODULE
// of e2e-atelier.mjs (the e2e-atelier-s5z3 precedent): the suite calls runS5R
// with its band; standalone (`node web/tools/e2e-atelier-s5r.mjs` under
// run-gate) runs the same cells in isolation for red/green proofs.
//
// S5-R  pre-fix (4c4cdcd0) atelier.js homeSecondary moved the Table →
//       Advanced disclosure (its cushion rows inside) into the showroom rail's
//       control row on the coarse register, but every option-row rule stayed
//       scoped under #ob-atelier — the rail twin covered the description ink
//       only (vfix1). The rows painted as bare boxes: no hairline, no ground,
//       and the ONE selected register (.ob-eq-prov-row[aria-current="true"]:
//       accent line + accent-dim ground) was gone — a user could not see the
//       current cushion model nor the staged choice.
//       Cells 844x390 + 667x375 coarse (launchPhone, the e2e-ui insets), Table
//       station, Advanced open, plus a 1280x800 FINE control (the host column):
//       1  REGISTER     the aria-current row's computed background AND border
//                       colour differ from every sibling's, the siblings share
//                       one register among themselves, and the current row's
//                       background / border / radius EQUAL the fine host
//                       column's current row (the same register, not a second
//                       skin);
//       2  DESC-INK     every row description's computed colour is the
//                       document's --ob-text-1 (the vfix1 law still holds);
//       3  FLIPS        a REAL tap on a non-current pick stages it (the bar
//                       presents): aria-current moves to that row and the
//                       highlight follows (the new row wears the register, the
//                       old one the sibling ground); Put back restores both.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone, setSafeAreaInsets, touchStart, touchEnd } from './touch-cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports runS5R; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
const SA = { top: 0, left: 47, right: 47, bottom: 21 }; // the e2e-ui coarse insets
async function waitPortFree(port, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    const busy = await new Promise((res) => { const s = net.connect({ port, host: '127.0.0.1' }); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
    if (!busy) return true;
    if (Date.now() - t0 > ms) return false;
    await sleep(250);
  }
}
async function waitExpr(c, expr, tries = 60, ms = 150) {
  for (let i = 0; i < tries; i++) { try { if (await c.eval(expr)) return true; } catch { /* navigating */ } await sleep(ms); }
  return false;
}
const ADV = `document.querySelector('[data-ob="atelier-advanced"]')`;
const BAR = `document.querySelector('[data-ob="atelier-txbar"]')`;
// the rows' painted register: computed colours (rgb strings from the same tokens on every register)
const ROWS = `(() => {
  const rows = [...document.querySelectorAll('[data-ob="atelier-cushion"] .ob-eq-prov-row')].filter((r) => r.getBoundingClientRect().width > 0);
  const t1 = getComputedStyle(document.documentElement).getPropertyValue('--ob-text-1').trim();
  const probe = document.createElement('span'); probe.style.color = t1; document.body.appendChild(probe);
  const text1 = getComputedStyle(probe).color; probe.remove();
  const inRail = !!document.querySelector('[data-ob="atelier-cushion"]')?.closest('#ob-atelier-rail');
  return { inRail, text1, rows: rows.map((r) => { const cs = getComputedStyle(r); const d = r.querySelector('.ob-eq-prov-row__desc'); const b = r.getBoundingClientRect();
    return { id: r.dataset.id, current: r.getAttribute('aria-current') === 'true', bg: cs.backgroundColor, border: cs.borderTopColor, bw: cs.borderTopWidth, radius: cs.borderTopLeftRadius,
      desc: d ? getComputedStyle(d).color : null, box: { t: +b.top.toFixed(1), b: +b.bottom.toFixed(1), h: +b.height.toFixed(1) } }; }) };
})()`;
const reg = (r) => `${r.bg} / ${r.border} ${r.bw} r${r.radius}`;
function judgeRegister(tag, g, ctl, fail, log) {
  let n = 0;
  const cur = g.rows.filter((r) => r.current), sib = g.rows.filter((r) => !r.current);
  log(`S5-R ${tag}: ${g.rows.length} cushion rows (in rail ${g.inRail}) — current ${cur.map((r) => `${r.id} [${reg(r)}]`).join(', ') || 'NONE'}; siblings ${sib.map((r) => `${r.id} [${reg(r)}]`).join(', ')}; desc ink ${[...new Set(g.rows.map((r) => r.desc))].join(' | ')} (text-1 ${g.text1})`);
  n += 1;
  if (cur.length !== 1) { fail(`${tag}: REGISTER exactly one aria-current row expected, got ${cur.length} of ${g.rows.length}`); return n; }
  if (sib.length < 1) { fail(`${tag}: REGISTER no sibling row to compare against`); return n; }
  const c0 = cur[0];
  const sibRegs = [...new Set(sib.map(reg))];
  if (sibRegs.length !== 1) fail(`${tag}: REGISTER the siblings do not share one register: ${sibRegs.join(' ; ')}`);
  if (c0.bg === sib[0].bg || c0.border === sib[0].border) fail(`${tag}: REGISTER the current row ${c0.id} paints like its siblings (bg ${c0.bg} vs ${sib[0].bg}; border ${c0.border} vs ${sib[0].border}) — the selected register is not visible here`);
  if (ctl) {
    n += 1;
    if (c0.bg !== ctl.bg || c0.border !== ctl.border || c0.radius !== ctl.radius || c0.bw !== ctl.bw) fail(`${tag}: REGISTER the current row's register [${reg(c0)}] is not the fine host column's [${reg(ctl)}] — a second skin`);
    const s0 = sib[0], cs = ctl.sib;
    if (cs && (s0.bg !== cs.bg || s0.border !== cs.border)) fail(`${tag}: REGISTER the sibling ground [${reg(s0)}] is not the fine host column's [${reg(cs)}]`);
  }
  // 2 DESC-INK (vfix1)
  n += 1;
  const badInk = g.rows.filter((r) => r.desc && r.desc !== g.text1);
  if (badInk.length) fail(`${tag}: DESC-INK ${badInk.length} description(s) not text-1 (${badInk.map((r) => `${r.id} ${r.desc}`).join(', ')} vs ${g.text1})`);
  return n;
}

export async function runS5R({ PORT, CDP_PORT, fail: failIn, log = console.log }) {
  const fail = (m) => failIn(`S5-R ${m}`);
  let cells = 0;
  let ctl = null; // the fine host column's register (the desktop cell runs first)
  // the literal tuple list bounds the cells (cdp 1: every kind on +0, sequential)
  for (const [kind, w, h, loc] of [['desktop', 1280, 800, 'en'], ['phone', 844, 390, 'en'], ['phone', 667, 375, 'ja']]) {
    const tag = `${kind} ${w}x${h}/${loc}`;
    if (!(await waitPortFree(CDP_PORT))) { fail(`${tag}: cdp port ${CDP_PORT} still busy`); continue; }
    const url = `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=s5r_${kind}_${w}`;
    const c = kind === 'phone'
      ? await launchPhone(url, { cdpPort: CDP_PORT, width: w, height: h, tool: false })
      : await launchChrome(url, { port: CDP_PORT, width: w, height: h, tool: false });
    const errs = [];
    c.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') errs.push(params.args.map((a) => a.value ?? a.description).join(' '));
      else if (method === 'Runtime.exceptionThrown') errs.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    });
    try {
      if (kind === 'phone') await setSafeAreaInsets(c, SA);
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: boot never ready`); continue; }
      if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail(`${tag}: no shell`); continue; }
      if (loc !== 'en') { await c.eval(`window.__i18n.setLocale(${J(loc)}), true`); await waitExpr(c, `window.__i18n.locale() === ${J(loc)}`, 60); }
      await waitExpr(c, 'window.__shell.isOpen() === true', 100);
      for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
      if (!(await waitExpr(c, 'window.__atelier.rail().live === true', 60))) { fail(`${tag}: rail never live`); continue; }
      await c.eval(`__atelier.go('table', { force: true }), true`);
      if (!(await waitExpr(c, `window.__atelier.station() === 'table' && !window.__shell.moving()`, 80))) { fail(`${tag}: table station never presented`); continue; }
      const wantRail = kind === 'phone';
      if (!(await waitExpr(c, `!!${ADV} && (!!${ADV}.closest('#ob-atelier-rail')) === ${wantRail} && ${ADV}.querySelector(':scope > summary').getBoundingClientRect().width > 0`, 60))) { fail(`${tag}: precondition — the Advanced disclosure is ${wantRail ? 'not re-homed into the rail' : 'not in the host column'} (in rail ${await c.eval(`!!${ADV}?.closest('#ob-atelier-rail')`)})`); continue; }
      await c.eval(`${ADV}.open = true, true`);
      if (!(await waitExpr(c, `document.querySelectorAll('[data-ob="atelier-cushion"] .ob-eq-prov-row').length >= 2 && [...document.querySelectorAll('[data-ob="atelier-cushion"] .ob-eq-prov-row')].every((r) => r.getBoundingClientRect().height > 0)`, 60))) { fail(`${tag}: the cushion rows never laid out inside the open disclosure`); continue; }
      await sleep(400);
      const g = await c.eval(ROWS);
      if (kind === 'desktop') {
        const cur = g.rows.find((r) => r.current), sib = g.rows.find((r) => !r.current);
        ctl = cur ? { ...cur, sib } : null;
        cells += judgeRegister(tag, g, null, fail, log);
        continue; // the fine column is the control; the flip law is judged on the rail
      }
      cells += judgeRegister(tag, g, ctl, fail, log);
      // 3 FLIPS: a REAL tap on a non-current pick
      const before = g.rows.find((r) => r.current)?.id ?? null;
      const target = g.rows.find((r) => !r.current)?.id ?? null;
      if (!before || !target) { fail(`${tag}: FLIPS no current / non-current pair to flip (${before} / ${target})`); continue; }
      const pt = await c.eval(`(() => { const row = document.querySelector('[data-ob="atelier-cushion"] .ob-eq-prov-row[data-id="' + ${J(target)} + '"]'); const b = row?.querySelector('button'); if (!b || b.disabled) return null;
        b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, hit: !!at && (at === b || b.contains(at)) }; })()`);
      cells += 1;
      if (!pt) { fail(`${tag}: FLIPS the pick ${target} has no enabled button`); continue; }
      if (!pt.hit) log(`S5-R ${tag}: note — the pick ${target} centre is not self-hit before the tap (the rail scroll settles below)`);
      await sleep(200);
      await touchStart(c, [{ x: pt.x, y: pt.y, id: 1 }]); await sleep(40); await touchEnd(c);
      const staged = await waitExpr(c, `${BAR}?.hidden === false && document.querySelector('[data-ob="atelier-cushion"] .ob-eq-prov-row[data-id="' + ${J(target)} + '"]')?.getAttribute('aria-current') === 'true'`, 40);
      const g2 = await c.eval(ROWS);
      const now = g2.rows.find((r) => r.current)?.id ?? null;
      if (!staged || now !== target) fail(`${tag}: FLIPS a real tap on ${target} at (${Math.round(pt.x)}, ${Math.round(pt.y)}) did not stage it (bar hidden ${await c.eval(`${BAR}?.hidden`)}, aria-current now ${now})`);
      else {
        const nr = g2.rows.find((r) => r.id === target), or = g2.rows.find((r) => r.id === before);
        log(`S5-R ${tag}: tap ${before} → ${target} staged; new current [${reg(nr)}], old [${reg(or)}]`);
        if (ctl && (nr.bg !== ctl.bg || nr.border !== ctl.border)) fail(`${tag}: FLIPS the staged row ${target} does not wear the selected register [${reg(nr)}] vs [${reg(ctl)}]`);
        if (or.bg === nr.bg || or.border === nr.border) fail(`${tag}: FLIPS the previously current row ${before} still paints like the selected row ([${reg(or)}] vs [${reg(nr)}])`);
      }
      // Put back
      await c.eval(`document.querySelector('[data-ob="atelier-revert"]')?.click(), true`);
      const back = await waitExpr(c, `${BAR}?.hidden === true && document.querySelector('[data-ob="atelier-cushion"] .ob-eq-prov-row[data-id="' + ${J(before)} + '"]')?.getAttribute('aria-current') === 'true'`, 40);
      cells += 1;
      if (!back) fail(`${tag}: FLIPS Put back did not restore ${before} as the current row (now ${await c.eval(`document.querySelector('[data-ob="atelier-cushion"] .ob-eq-prov-row[aria-current="true"]')?.dataset.id ?? null`)})`);
      else {
        const g3 = await c.eval(ROWS);
        const r0 = g3.rows.find((r) => r.id === before), r1 = g3.rows.find((r) => r.id === target);
        if (r0 && r1 && (r0.bg === r1.bg || r0.border === r1.border)) fail(`${tag}: FLIPS after Put back the current row ${before} paints like ${target} ([${reg(r0)}] vs [${reg(r1)}])`);
      }
      const bad = errs.filter((e) => !/favicon/i.test(String(e)));
      if (bad.length) fail(`${tag}: app errors: ${bad.slice(0, 3).map((e) => String(e).split('\n')[0]).join(' | ')}`);
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  log(`S5-R cells judged: ${cells}`);
  if (cells === 0) fail('no cell judged');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const fail = (msg) => { console.error('E2E-ATELIER-S5R FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runS5R({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-S5R FAIL' : 'E2E-ATELIER-S5R PASS');
}
