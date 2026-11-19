// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-env-tail.mjs — node selftest of the GH-971 env-tail scheduler in web/app/main.js. No browser.
// The scheduler block (between the `>>> env-tail scheduler` / `<<< env-tail scheduler` markers) is lifted verbatim and run
// against stubs: bakeEnvOnce counts bakes, reportError collects reports, window carries __rebakeEnv / __cinelight. The boot
// is ready only after its tail lands on the env cube's fixed point, so every path must leave >= ENV_BOOT_TAIL bakes after
// the LAST scene change (the arm or a rebake inside the tail) before the boot reads done:
//   arm → step → rebake → drain   (review r1 P2 on 41a883e2: the rebake cut the owed count to ENV_TAIL, boot done after 4)
//   rebake before the arm; two rebakes inside the tail; a rebake after the boot (gameplay: ENV_TAIL, boot stays done);
//   a studio-lighting window holds every bake; a throwing bake fails the boot by name, once.
// PLANT: the same scenarios against the block with the pre-fix rule (`envTailLeft = ENV_TAIL;`) must FAIL — the
// 4-bake truncation reproduced.
// The boot tail's PRE-ARM rule (#1105; batch-3 perf red, run 38322910949): a request before the arm owes NO tail (the arm
// owes ENV_BOOT_TAIL from any state; perf-aim on SwiftShader ran 2-6 extra bakes before a late arm). Inside the tail EVERY
// request restarts the boot-sized count, so exactly ENV_BOOT_TAIL bakes follow the LAST one at any depth (review P2 on
// e75b7953: its 16-bake cap left 2 bakes after requests at tail bakes 7 and 14), and a restart re-sets the count, never adds.
// Every request still bakes once at once, in every state; after the boot two requests owe ENV_TAIL, and a late arm is inert.
// PLANTS: pre-arm requests owing ENV_TAIL again, the e75b7953 cap, and an additive restart must each FAIL their scenario.
// The boot tail's ARM WAIT (#1093; the `>>> env-tail arm wait` block, end of startLoop) is lifted the same way: the tail arms
// only once the baked-GI apply settled (lightingvisuals' giIdle rule) and the lamp-fade leaf landed, bounded by
// VENUE_GI_WINDOW_MS; and the frame loop must arm through it. PLANTS: the block without the GI term, and without the bound,
// must FAIL their scenarios.
// The env bake's GAMEPLAY-VISUAL HIDE (review batch-3 re-seal P2; the `>>> env-bake gameplay visuals` block, end of main.js)
// runs over a stub scene graph with three's traverse / getObjectByName order: a hidden post-strike obCueStick ahead of the
// rebuilt visible one must bake without either, every obAim* overlay (the venue probe's rule) stays out, a nameless node never
// throws, and the undo restores exactly what it hid; bakeEnvOnce must call it before its try and undo it inside the finally.
// PLANTS: the first-match lookup (scene.getObjectByName per name) must FAIL — it leaves the live rod in the bake — and so must
// a preview-only rule (the kitchen tint stays in) and an unguarded name read (a nameless node throws inside the bake).
//   node web/tools/test-env-tail.mjs   (exit 0 = every expectation held and every plant was caught)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PORT_FLAGS = {};

const MAIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'main.js');
const src = fs.readFileSync(MAIN, 'utf8');
const a = src.indexOf('// >>> env-tail scheduler'), b = src.indexOf('// <<< env-tail scheduler');
if (a < 0 || b < 0 || b < a) { console.log('ENV-TAIL SCHEDULER FAIL: the scheduler markers are missing from web/app/main.js'); process.exit(1); }
const BLOCK = src.slice(a, b);
const FIXED_RULE = "envTailLeft = envBootTail === 'running' ? ENV_BOOT_TAIL : Math.max(envTailLeft, ENV_TAIL);";
const OLD_RULE = 'envTailLeft = ENV_TAIL;';
const PREARM_GUARD = "if (!envTailError && envBootTail !== 'waiting') ";
// the e75b7953 rule (review P2 on it), with tail bakes since the arm read from the census (no pre-arm tail bakes run under PREARM_GUARD)
const CAP_RULE = "envTailLeft = envBootTail !== 'running' ? Math.max(envTailLeft, ENV_TAIL) : window.__rebakeEnv.tailBakes + ENV_BOOT_TAIL <= 16 ? ENV_BOOT_TAIL : Math.max(envTailLeft, 16 - window.__rebakeEnv.tailBakes);";
const ADD_RULE = "envTailLeft = envBootTail === 'running' ? envTailLeft + ENV_BOOT_TAIL : Math.max(envTailLeft, ENV_TAIL);";

let bad = 0, total = 0;
const report = (name, ok, detail = '') => { total++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };

/** A fresh scheduler from `block`: { tail, rebake, st(), bakes(), reports, win, throwNext } */
function load(block) {
  let bakes = 0, throwNext = false;
  const reports = [];
  const win = { __rebakeEnv: { tailBakes: 0 }, __cinelight: false };
  const bakeEnvOnce = () => { if (throwNext) { throwNext = false; throw new Error('planted bake failure'); } bakes += 1; };
  const reportError = (m) => reports.push(m);
  // eslint-disable-next-line no-new-func
  const make = new Function('bakeEnvOnce', 'reportError', 'window', `${block}
    return { tail: envTail, rebake: rebakeEnv, st: () => ({ left: envTailLeft, boot: envBootTail, error: envTailError, ENV_TAIL, ENV_BOOT_TAIL }) };`);
  const s = make(bakeEnvOnce, reportError, win);
  return { ...s, bakes: () => bakes, reports, win, throwNext: () => { throwNext = true; } };
}

/** Run the scenarios against one block; returns { name: { ok, detail } }. */
function scenarios(block) {
  const out = {};
  const put = (name, ok, detail) => { out[name] = { ok, detail }; };
  { // review's path: arm → step → rebake → drain
    const s = load(block); const N = s.st().ENV_BOOT_TAIL;
    s.tail.armBoot(); s.tail.step(); s.rebake(); const atRebake = s.bakes(); s.tail.drain();
    const after = s.bakes() - atRebake;
    put('arm → step → rebake → drain: the boot reads done only after ENV_BOOT_TAIL bakes following the rebake',
      s.tail.bootDone() && after >= N, `bakes ${s.bakes()} (after the rebake ${after}, need >= ${N}), boot ${s.st().boot}`);
  }
  { // a rebake before the tail arms
    const s = load(block); const N = s.st().ENV_BOOT_TAIL;
    s.rebake(); const atArm = s.bakes(); s.tail.armBoot(); s.tail.drain();
    put('rebake before the arm: the arm still owes the boot-sized count', s.tail.bootDone() && s.bakes() - atArm >= N, `bakes after the arm ${s.bakes() - atArm}`);
  }
  { // two rebakes inside the tail, frame by frame
    const s = load(block); const N = s.st().ENV_BOOT_TAIL;
    s.tail.armBoot(); s.tail.step(); s.rebake(); s.tail.step(); s.tail.step(); s.rebake(); const atLast = s.bakes();
    let frames = 0; while (!s.tail.bootDone() && frames < 50) { s.tail.step(); frames++; }
    put('two rebakes inside the tail: done only after ENV_BOOT_TAIL bakes following the LAST one', s.tail.bootDone() && s.bakes() - atLast >= N,
      `bakes after the last rebake ${s.bakes() - atLast}, frames ${frames}`);
  }
  { // gameplay: rebakes after the boot (two in one frame), and the frame loop's armBoot call after done
    const s = load(block); const T = s.st().ENV_TAIL;
    s.tail.armBoot(); s.tail.drain(); const done0 = s.tail.bootDone(); s.tail.armBoot(); const rearmed = s.st().left;
    const b0 = s.bakes(); s.rebake(); s.rebake(); const imm = s.bakes() - b0, owed = s.st().left; s.tail.drain();
    put('rebakes after the boot: each bakes at once, two in one frame owe ENV_TAIL, a late arm owes nothing, the boot stays done',
      done0 && rearmed === 0 && imm === 2 && owed === T && s.tail.bootDone(), `armBoot after done owes ${rearmed}; two requests: ${imm} immediate bakes, owed ${owed}`);
  }
  { // a studio-lighting window holds every bake
    const s = load(block);
    s.tail.armBoot(); s.win.__cinelight = true; for (let i = 0; i < 20; i++) s.tail.step();
    const held = s.bakes() === 0 && !s.tail.bootDone();
    s.win.__cinelight = false; s.tail.drain();
    put('studio window: no bake while open, the boot tail completes after it', held && s.tail.bootDone(), `bakes while open 0? ${held}`);
  }
  { // a throwing bake fails the boot by name, once
    const s = load(block);
    s.tail.armBoot(); s.tail.step(); s.throwNext(); s.tail.step(); s.tail.step(); s.tail.drain(); s.rebake();
    const st = s.st();
    put('a throwing bake: boot failed, nothing owed, reported once, later steps inert',
      st.boot === 'failed' && st.left === 0 && /env tail: planted bake failure/.test(st.error ?? '') && s.reports.length === 1, JSON.stringify({ boot: st.boot, left: st.left, reports: s.reports.length }));
  }
  { // (1) pre-arm requests owe NO tail: three requests with frames between them, then the arm — exactly the boot's own tail runs
    const s = load(block); const N = s.st().ENV_BOOT_TAIL;
    for (let i = 0; i < 3; i++) { s.rebake(); s.tail.step(); s.tail.step(); }
    const owedAtArm = s.st().left, tailBefore = s.win.__rebakeEnv.tailBakes; s.tail.armBoot(); s.tail.drain();
    put('pre-arm requests owe no tail: the boot runs exactly ENV_BOOT_TAIL tail bakes, all after the arm',
      s.tail.bootDone() && tailBefore === 0 && owedAtArm === 0 && s.win.__rebakeEnv.tailBakes === N && s.bakes() === 3 + N,
      `tail bakes before the arm ${tailBefore}, owed at the arm ${owedAtArm}, tail bakes ${s.win.__rebakeEnv.tailBakes}, all bakes ${s.bakes()} (3 immediate + ${N})`);
  }
  { // review P2 on e75b7953: requests after tail bakes 7 and 14 — the boot reads done exactly ENV_BOOT_TAIL bakes after the second
    const s = load(block); const N = s.st().ENV_BOOT_TAIL;
    s.tail.armBoot(); for (let i = 0; i < 7; i++) s.tail.step(); s.rebake();
    for (let i = 0; i < 7; i++) s.tail.step(); const at = s.win.__rebakeEnv.tailBakes; s.rebake(); const atLast = s.bakes();
    let frames = 0; while (!s.tail.bootDone() && frames < 100) { s.tail.step(); frames++; }
    put('requests after tail bakes 7 and 14: done exactly ENV_BOOT_TAIL bakes after the second, never sooner',
      at === 14 && s.tail.bootDone() && s.bakes() - atLast === N && s.win.__rebakeEnv.tailBakes === 14 + N && s.st().left === 0,
      `second request at tail bake ${at}; bakes after it ${s.bakes() - atLast} (need exactly ${N}); done at ${s.win.__rebakeEnv.tailBakes} tail bakes, owed ${s.st().left}`);
  }
  { // no depth cap: a request after every 7th tail bake, forty times — each one restarts the count (a cap anywhere below 288 fails)
    const s = load(block); const N = s.st().ENV_BOOT_TAIL;
    s.tail.armBoot(); for (let k = 0; k < 40; k++) { for (let i = 0; i < 7; i++) s.tail.step(); s.rebake(); }
    const at = s.win.__rebakeEnv.tailBakes, atLast = s.bakes();
    let frames = 0; while (!s.tail.bootDone() && frames < 100) { s.tail.step(); frames++; }
    put('a request at any depth of the tail restarts it: done exactly ENV_BOOT_TAIL bakes after the last',
      at === 280 && s.tail.bootDone() && s.bakes() - atLast === N && s.st().left === 0, `last request at tail bake ${at}; bakes after it ${s.bakes() - atLast}, frames ${frames}`);
  }
  { // a restart re-sets the count, never adds to it: a request at the arm, then two in one frame
    const s = load(block); const N = s.st().ENV_BOOT_TAIL;
    s.tail.armBoot(); const b0 = s.bakes(); s.rebake(); const owed0 = s.st().left, imm0 = s.bakes() - b0; s.tail.step(); s.tail.step();
    const b1 = s.bakes(); s.rebake(); s.rebake(); const owed1 = s.st().left, imm1 = s.bakes() - b1, atLast = s.bakes();
    s.tail.drain();
    put('a restart re-sets the boot count, never adds to it: two requests in one frame still owe exactly ENV_BOOT_TAIL',
      owed0 === N && owed1 === N && imm0 === 1 && imm1 === 2 && s.tail.bootDone() && s.bakes() - atLast === N,
      `owed after a request at the arm ${owed0}, after two in one frame ${owed1}; immediate bakes ${imm0} + ${imm1}; bakes after the last ${s.bakes() - atLast}`);
  }
  return out;
}

if (!BLOCK.includes(FIXED_RULE)) report('the lifted block carries the fixed rebake rule', false, 'rule text not found — update FIXED_RULE with the code');
const real = scenarios(BLOCK);
for (const [name, r] of Object.entries(real)) report(name, r.ok, r.detail);
// plant: the pre-fix rule must be caught by the review-path scenario (the 4-bake truncation)
const planted = scenarios(BLOCK.replace(FIXED_RULE, OLD_RULE));
const p = planted['arm → step → rebake → drain: the boot reads done only after ENV_BOOT_TAIL bakes following the rebake'];
report('PLANT pre-fix rule (envTailLeft = ENV_TAIL): the review path must FAIL', BLOCK.includes(FIXED_RULE) && p && !p.ok, p ? p.detail : 'scenario missing');
// plant (1): pre-arm requests owing the gameplay tail again (the guard dropped) must be caught
const prearm = BLOCK.includes(PREARM_GUARD) ? scenarios(BLOCK.replace(PREARM_GUARD, 'if (!envTailError) '))['pre-arm requests owe no tail: the boot runs exactly ENV_BOOT_TAIL tail bakes, all after the arm'] : null;
report('PLANT pre-arm requests owe ENV_TAIL: the pre-arm scenario must FAIL', !!prearm && !prearm.ok, prearm ? prearm.detail : 'guard text not found — update PREARM_GUARD with the code');
// plant (2): the e75b7953 16-bake cap must be caught by review's 7/14 case (it left 2 bakes after the second request)
const capped = scenarios(BLOCK.replace(FIXED_RULE, CAP_RULE))['requests after tail bakes 7 and 14: done exactly ENV_BOOT_TAIL bakes after the second, never sooner'];
report('PLANT the e75b7953 16-bake cap: the 7/14 case must FAIL', BLOCK.includes(FIXED_RULE) && !!capped && !capped.ok, capped ? capped.detail : 'scenario missing');
// plant (3): an additive restart (the owed count grows with every request) must be caught by the re-set case
const additive = scenarios(BLOCK.replace(FIXED_RULE, ADD_RULE))['a restart re-sets the boot count, never adds to it: two requests in one frame still owe exactly ENV_BOOT_TAIL'];
report('PLANT additive restart: the re-set case must FAIL', BLOCK.includes(FIXED_RULE) && !!additive && !additive.ok, additive ? additive.detail : 'scenario missing');

// ---- the boot tail's arm wait (#1093) ----
const c = src.indexOf('// >>> env-tail arm wait'), d = src.indexOf('// <<< env-tail arm wait');
const ARM = c >= 0 && d > c ? src.slice(c, d) : null;
report('the arm-wait markers exist in web/app/main.js', ARM !== null, ARM !== null ? '' : 'markers missing');
const ARM_LINE = src.includes('&& envArmReady(now)) envTail.armBoot();');
report('the frame loop arms the boot tail through envArmReady', ARM_LINE, ARM_LINE ? '' : 'arm line not found');
const GI_TERM = '&& giSettled()) return true;';
const BOUND = 'return now - envArmWaitT0 >= VENUE_GI_WINDOW_MS;';

/** A fresh arm wait from `block` over the stub `gi`: { giSettled, envArmReady, land(), broken() } */
function loadArm(block, gi, W = 15000) {
  // eslint-disable-next-line no-new-func
  const make = new Function('gi', 'W', `let lampFade = null, lampFadeBroken = false; const VENUE_GI_WINDOW_MS = W;
    ${block}
    return { giSettled, envArmReady, land: () => { lampFade = {}; }, broken: () => { lampFadeBroken = true; } };`);
  return make(gi, W);
}
const giState = (o) => ({ state: { loadRequested: true, ready: false, applySeq: 1, appliedSeq: 0, ...o } });
/** Run the arm-wait scenarios against one block; returns { name: { ok, detail } }. */
function armScenarios(block) {
  const out = {};
  const put = (name, ok, detail) => { out[name] = { ok, detail }; };
  { // the boot's GI apply in flight: no arm until its bind lands (the 68-px card: the tail ran on the unbound room)
    const gi = giState({}); const a = loadArm(block, gi); a.land();
    const before = a.envArmReady(1000); gi.state.ready = true; gi.state.appliedSeq = 1; const after = a.envArmReady(1016);
    put('GI apply in flight: the arm waits for its bind', before === false && after === true, `before ${before}, after ${after}`);
  }
  { // a later apply started (a fixture change): the arm waits for the LAST started apply
    const gi = giState({ ready: true, applySeq: 2, appliedSeq: 1 }); const a = loadArm(block, gi); a.land();
    const before = a.envArmReady(0); gi.state.appliedSeq = 2;
    put('a later GI apply in flight: the arm waits for the last started apply', before === false && a.envArmReady(16) === true, `before ${before}`);
  }
  { // the lamp-fade leaf: not landed → wait; landed or broken → arm
    const gi = giState({ ready: true, appliedSeq: 1 });
    const a = loadArm(block, gi); const w1 = a.envArmReady(0); a.land();
    put('lamp-fade leaf not landed: the arm waits for it', w1 === false && a.envArmReady(16) === true, `before ${w1}`);
    const b = loadArm(block, gi); const w2 = b.envArmReady(0); b.broken();
    put('a broken lamp-fade leaf counts as landed', w2 === false && b.envArmReady(16) === true, `before ${w2}`);
  }
  { // settled states arm at once
    const cases = [['?nogi (no load requested)', { state: { loadRequested: false } }], ['a load error', giState({ loadError: 'manifest fetch failed' })],
      ['no gi runtime', null], ['a stale gi.js without the applySeq mirror', { state: { loadRequested: true, ready: true, appliedSeq: 1 } }]];
    for (const [name, gi] of cases) { const a = loadArm(block, gi); a.land(); const r = a.envArmReady(0); put(`settled at once: ${name}`, r === true, `armed ${r}`); }
  }
  { // the bound: a stalled apply arms VENUE_GI_WINDOW_MS after the first frame that waited, never before
    const gi = giState({}); const a = loadArm(block, gi, 15000); a.land();
    const t0 = a.envArmReady(5000), t1 = a.envArmReady(5000 + 14999), t2 = a.envArmReady(5000 + 15000);
    put('a stalled GI apply: the tail arms after VENUE_GI_WINDOW_MS, never before', t0 === false && t1 === false && t2 === true, `${t0}/${t1}/${t2}`);
  }
  return out;
}
if (ARM) {
  if (!ARM.includes(GI_TERM) || !ARM.includes(BOUND)) report('the lifted arm wait carries the GI term and the bound', false, 'text not found — update GI_TERM / BOUND with the code');
  for (const [name, r] of Object.entries(armScenarios(ARM))) report(name, r.ok, r.detail);
  // plants: the arm without the GI term (the pre-#1093 rule) and without the bound must each be caught
  const noGi = armScenarios(ARM.replace(GI_TERM, ') return true;'))['GI apply in flight: the arm waits for its bind'];
  report('PLANT arm without the GI term (pre-#1093): the in-flight scenario must FAIL', ARM.includes(GI_TERM) && noGi && !noGi.ok, noGi ? noGi.detail : 'scenario missing');
  const noBound = armScenarios(ARM.replace(BOUND, 'return false;'))['a stalled GI apply: the tail arms after VENUE_GI_WINDOW_MS, never before'];
  report('PLANT arm without the bound: the stalled scenario must FAIL', ARM.includes(BOUND) && noBound && !noBound.ok, noBound ? noBound.detail : 'scenario missing');
}

// ---- the env bake's gameplay-visual hide (review batch-3 re-seal P2) ----
const e = src.indexOf('// >>> env-bake gameplay visuals'), f = src.indexOf('// <<< env-bake gameplay visuals');
const VIS = e >= 0 && f > e ? src.slice(e, f) : null;
report('the env-bake visuals markers exist in web/app/main.js', VIS !== null, VIS !== null ? '' : 'markers missing');
// the bracket: the hide runs before the capture's try, and its undo is the first statement of that try's finally — so a
// throwing cubeCam.update can never leave the rod or the overlays hidden (one call, one undo, in that order)
const BRACKET_CALL = 'const restoreDyn = hideGameplayVisualsForBake(scene);';
const BRACKET_TRY = 'try { cubeCam.update(renderer, scene); } finally {';
const bracketOf = (text) => {
  const a = text.indexOf(BRACKET_CALL), b = a >= 0 ? text.indexOf(BRACKET_TRY, a) : -1, c = b >= 0 ? text.indexOf('\n', b) : -1;
  const firstInFinally = c >= 0 ? text.slice(c + 1, text.indexOf('\n', c + 1)).trim() : '';
  const calls = text.split(BRACKET_CALL).length - 1, undos = text.split('restoreDyn();').length - 1;
  return { ok: a >= 0 && b > a && firstInFinally === 'restoreDyn();' && calls === 1 && undos === 1, detail: `call@${a} try@${b} finally[0]='${firstInFinally}' calls ${calls} undos ${undos}` };
};
const bracket = bracketOf(src);
report('bakeEnvOnce hides before its try and undoes first inside the finally', bracket.ok, bracket.ok ? '' : bracket.detail);
// plant: the undo moved out of the finally (after the try/finally block) must be caught
const UNDO_LINE = '      restoreDyn();\n';
const movedSrc = src.includes(UNDO_LINE) ? src.replace(UNDO_LINE, '').replace('      hidden.forEach((b) => { b.mesh.visible = true; });\n    }\n', '      hidden.forEach((b) => { b.mesh.visible = true; });\n    }\n    restoreDyn();\n') : null;
const moved = movedSrc ? bracketOf(movedSrc) : null;
report('PLANT undo outside the finally: the bracket check must FAIL', !!moved && !moved.ok && movedSrc.includes('    }\n    restoreDyn();\n'), moved ? moved.detail : 'undo line not found — update UNDO_LINE with the code');
/** A stub node; `sceneOf` gives the root three's traverse (depth-first, children in order) and getObjectByName (first match). */
const node = (name, visible = true, children = []) => { const n = { name, visible, children, parent: null }; children.forEach((c) => { c.parent = n; }); return n; };
function sceneOf(children) {
  const s = node('', true, children);
  s.traverse = (cb) => { const walk = (o) => { cb(o); o.children.forEach(walk); }; walk(s); };
  s.getObjectByName = (name) => { let hit; s.traverse((o) => { if (hit === undefined && o.name === name) hit = o; }); return hit; };
  return s;
}
const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
// eslint-disable-next-line no-new-func
const loadVis = (block) => new Function(`${block}\n    return hideGameplayVisualsForBake;`)();
/** Run the hide scenarios against one block; returns { name: { ok, detail } }. */
function visScenarios(block) {
  const out = {};
  const put = (name, ok, detail) => { out[name] = { ok, detail }; };
  { // review's case: cuepost's hidden whip rod first, then the preview, then the rebuilt gameplay rod appended after both
    const post = node('obCueStick', false), tip = node('obCueTip'), live = node('obCueStick', true, [tip]);
    const ghost = node('obGhost'), prev = node('obAimPreview', true, [ghost]), table = node('obTable');
    const scene = sceneOf([table, post, prev, live]);
    const undo = loadVis(block)(scene);
    const leaked = [live, tip, prev, ghost].filter(shown).map((o) => o.name);
    const tableOn = shown(table);
    undo();
    put('a hidden post-strike rod ahead of the rebuilt live rod: the bake sees neither rod nor the preview',
      leaked.length === 0 && tableOn && live.visible && prev.visible && !post.visible,
      `in the bake: ${leaked.join(', ') || 'none'}; after the undo: live ${live.visible}, preview ${prev.visible}, post ${post.visible}`);
  }
  { // every aim overlay stays out (obAim*: the venue probe's rule) — a ball-in-hand kitchen tint is the common case
    const zone = node('obAimZone'), snap = node('obAimSnap', false), call = node('obAimCall'), rest = node('obAimRest'), cloth = node('obCloth');
    const scene = sceneOf([cloth, zone, snap, call, rest]);
    const undo = loadVis(block)(scene);
    const leaked = [zone, call, rest].filter(shown).map((o) => o.name);
    undo();
    put('every obAim* overlay stays out of the bake (the kitchen tint case)', leaked.length === 0 && shown(cloth) && zone.visible && call.visible && rest.visible && !snap.visible,
      `in the bake: ${leaked.join(', ') || 'none'}; after: zone ${zone.visible}, call ${call.visible}, rest ${rest.visible}, snap ${snap.visible}`);
  }
  { // a nameless node (name undefined) anywhere in the graph never throws, and the named rod is still hidden
    const nameless = node(undefined), live = node('obCueStick');
    const scene = sceneOf([nameless, live]);
    let threw = null, during = null;
    try { const undo = loadVis(block)(scene); during = live.visible; undo(); } catch (err) { threw = err.message; }
    put('a nameless node never throws inside the bake', threw === null && during === false && live.visible, threw ? `threw: ${threw}` : `rod during the bake ${during}`);
  }
  { // the undo restores exactly what was hidden: an already-hidden node stays hidden, unrelated nodes are never touched
    const live = node('obCueStick'), prevOff = node('obAimPreview', false), other = node('obCueRack');
    const scene = sceneOf([other, live, prevOff]);
    const undo = loadVis(block)(scene);
    const during = [live.visible, prevOff.visible, other.visible];
    undo();
    put('the undo restores exactly the nodes it hid', during.join() === 'false,false,true' && live.visible && !prevOff.visible && other.visible,
      `during ${during.join('/')}; after ${[live.visible, prevOff.visible, other.visible].join('/')}`);
  }
  return out;
}
if (VIS) {
  const FN = VIS.indexOf('function hideGameplayVisualsForBake(scene) {');
  if (FN < 0) report('the lifted block defines hideGameplayVisualsForBake(scene)', false, 'definition not found');
  for (const [name, r] of Object.entries(visScenarios(VIS))) report(name, r.ok, r.detail);
  // plant: the pre-fix first-match lookup (the 41a883e2 .. 9be9cda8 bake line) must be caught by review's case
  const FIRST_MATCH = `function hideGameplayVisualsForBake(scene) {
    const dyn = ['obCueStick', 'obAimPreview'].map((n) => scene.getObjectByName(n)).filter((o) => o && o.visible);
    dyn.forEach((o) => { o.visible = false; });
    return () => { dyn.forEach((o) => { o.visible = true; }); };
  }`;
  const firstMatch = FN >= 0 ? visScenarios(VIS.slice(0, FN) + FIRST_MATCH + '\n')['a hidden post-strike rod ahead of the rebuilt live rod: the bake sees neither rod nor the preview'] : null;
  report('PLANT first-match lookup (pre-fix): the post-strike case must FAIL', !!firstMatch && !firstMatch.ok, firstMatch ? firstMatch.detail : 'scenario missing');
  // plant: the preview-only rule (the c6b56851 draft) must be caught by the overlay case
  const RULE = "nm.startsWith('obAim')";
  const previewOnly = VIS.includes(RULE) ? visScenarios(VIS.replace(RULE, "nm.startsWith('obAimPreview')"))['every obAim* overlay stays out of the bake (the kitchen tint case)'] : null;
  report('PLANT preview-only rule: the overlay case must FAIL', !!previewOnly && !previewOnly.ok, previewOnly ? previewOnly.detail : 'rule text not found — update RULE with the code');
  // plant: the unguarded name read must be caught by the nameless-node case
  const GUARD = "const nm = o.name || '';";
  const unguarded = VIS.includes(GUARD) ? visScenarios(VIS.replace(GUARD, 'const nm = o.name;'))['a nameless node never throws inside the bake'] : null;
  report('PLANT unguarded name read: the nameless-node case must FAIL', !!unguarded && !unguarded.ok, unguarded ? unguarded.detail : 'guard text not found — update GUARD with the code');
}

console.log(`ENV-TAIL SCHEDULER ${bad ? 'FAIL' : 'PASS'} (${total - bad}/${total})`);
process.exit(bad ? 1 : 0);
