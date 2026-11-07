// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-gpugate.mjs — the node arm for main.js's software-GL GPU gate (GH-248 / KF-008). Plain node, no browser:
//   (1) isSoftwareGL: SwiftShader (both ANGLE back ends), llvmpipe, softpipe and WARP are software; Metal, D3D11, Vulkan and mobile
//       GPUs are not; a masked string, an unreadable context and a throwing getParameter are not; it reads the unmasked strings (the
//       fake context masks RENDERER / VENDOR as Chrome does); its class is a superset of perf-aim.mjs's (both perf-aim regexes are
//       read from perf-aim.mjs);
//   (2) createGpuGate: null on a hardware GPU, on WebGL1 (no fences) and with ?obgpugate=0; on with ?obgpugate=1 on any GPU;
//   (3) the pacing: a fence per unit of GL work (flushed); hold() is false with fewer than two unfinished units and true with two;
//       signalled fences retire oldest first, all of them in one call; an invalid status retires every pending fence in one call; a
//       lost context or a null fence adds nothing; the status is read with SYNC_STATUS (the fake answers each pname as WebGL2 does);
//   (4) main.js's own frame() decision, lifted verbatim: a held tick while two units are unfinished; otherwise the frame renders;
//       hardware GL (no gate) and manual frames are never held;
//   (5) a source census of the main.js wiring: the gate made with the renderer, a fence after the boot bake, after every
//       bakeEnvOnce and after each delivered frame's render, the env tail stepped after the render on every GPU as on main (no
//       held-tick bakes: they changed the env cube at __test.ready), the hold after the switch-label hold and before the update, the
//       GH-910 warm tick as the one unfenced live-loop render (recorded in the gate comment), the census on __test.
//   node web/tools/test-gpugate.mjs      (exit 1 on any failed check)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mj = fs.readFileSync(path.join(here, '../app/main.js'), 'utf8');
let checks = 0, fails = 0;
const check = (name, ok, got) => { checks += 1; if (!ok) { fails += 1; console.log(`FAIL ${name}${got === undefined ? '' : ' — got ' + JSON.stringify(got)}`); } };

// lift the gate block (from its comment to the end of the file), exports stripped
const at = mj.indexOf('// GH-248 / KF-008 root cause (VM-C, hosted run 38831847456).');
check('main.js: the gate block is liftable', at > 0);
const block = mj.slice(at).replace(/^export /gm, '');
const { SOFT_GL_RE, isSoftwareGL, createGpuGate } = new Function(`${block}\nreturn { SOFT_GL_RE, isSoftwareGL, createGpuGate };`)();

// a fake WebGL2 context: renderer / vendor strings, fences whose status the test drives
function fakeGL({ renderer = '', vendor = '', masked = false, webgl1 = false, throws = false } = {}) {
  const ctl = { lost: false, nullFence: false, status: new Map(), flushed: 0, deleted: [] };
  const gl = {
    RENDERER: 0x1F01, VENDOR: 0x1F00, SYNC_CONDITION: 0x9113, SYNC_STATUS: 0x9114, SYNC_FLAGS: 0x9115, SIGNALED: 0x9119, UNSIGNALED: 0x9118,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    getExtension: (n) => (n === 'WEBGL_debug_renderer_info' && !masked ? { UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246 } : null),
    // as Chrome: RENDERER / VENDOR are always masked; the real strings come only through the debug extension's enums
    getParameter: (p) => {
      if (throws) throw new Error('lost');
      if (p === 0x9246) return masked ? null : renderer; if (p === 0x9245) return masked ? null : vendor;
      if (p === 0x1F01) return 'WebKit WebGL'; if (p === 0x1F00) return 'WebKit';
      return null;
    },
    isContextLost: () => ctl.lost,
    // as WebGL2: SYNC_STATUS answers the status (null once the sync is invalid), SYNC_CONDITION the condition, SYNC_FLAGS 0
    getSyncParameter: (s, pname) => (pname === 0x9114 ? (ctl.status.has(s) ? ctl.status.get(s) : 0x9118) : pname === 0x9113 ? 0x9117 : pname === 0x9115 ? 0 : null),
    deleteSync: (s) => { ctl.deleted.push(s); },
    flush: () => { ctl.flushed += 1; },
  };
  if (!webgl1) gl.fenceSync = () => (ctl.nullFence ? null : { id: Symbol('sync') });
  return { gl, ctl, renderer: { getContext: () => gl } };
}

// (1) the predicate
const SW_D3D = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
const SW_LLVM = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)';
const soft = [[SW_D3D, 'Google Inc. (Google)'], [SW_LLVM, 'Google Inc. (Google)'], ['llvmpipe (LLVM 15.0.7, 256 bits)', 'Mesa'],
  ['softpipe', 'Mesa'], ['ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Google Inc. (Microsoft)']];
const hard = [['ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Ultra, Unspecified Version)', 'Google Inc. (Apple)'],
  ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'Google Inc. (NVIDIA)'],
  ['ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)', 'Google Inc. (Intel)'],
  ['Mali-G78', 'ARM'], ['Adreno (TM) 740', 'Qualcomm'], ['Apple GPU', 'Apple Inc.']];
check('isSoftwareGL: SwiftShader (Subzero, LLVM), llvmpipe, softpipe and WARP are software', soft.every(([r, v]) => isSoftwareGL(fakeGL({ renderer: r, vendor: v }).gl)));
check('isSoftwareGL: Metal, D3D11, desktop GL and mobile GPUs are not', hard.every(([r, v]) => !isSoftwareGL(fakeGL({ renderer: r, vendor: v }).gl)));
check('isSoftwareGL: a masked string (no debug extension) is not', !isSoftwareGL(fakeGL({ renderer: SW_D3D, masked: true }).gl));
check('isSoftwareGL: a throwing getParameter (a lost context) is not', !isSoftwareGL(fakeGL({ renderer: SW_D3D, throws: true }).gl));
check('isSoftwareGL: reads the unmasked strings (the fake masks RENDERER / VENDOR as Chrome does)', isSoftwareGL(fakeGL({ renderer: SW_D3D, vendor: 'Google Inc. (Google)' }).gl)
  && fakeGL({ renderer: SW_D3D }).gl.getParameter(0x1F01) === 'WebKit WebGL');
check('isSoftwareGL: the predicate is swiftshader|llvmpipe|softpipe|software|basic render, case-insensitive', SOFT_GL_RE.source === 'swiftshader|llvmpipe|softpipe|software|basic render' && SOFT_GL_RE.flags === 'i');
{
  // perf-aim.mjs calls a GPU software with its own regex (twice, on the unmasked renderer string): every alternative must be ours,
  // so a GPU perf-aim treats as software always gets the gate
  const pa = fs.readFileSync(path.join(here, 'perf-aim.mjs'), 'utf8');
  const theirs = [...pa.matchAll(/\/([a-z |]+)\/i\.test\(gpuName(?:Early)?\)/g)].map((m) => m[1]);
  const ours = new Set(SOFT_GL_RE.source.split('|'));
  check("isSoftwareGL: a superset of perf-aim.mjs's software-GPU class (both perf-aim regexes, every alternative in SOFT_GL_RE)",
    theirs.length === 2 && theirs.every((src) => src.split('|').every((alt) => ours.has(alt))), theirs);
}

// (2) the factory
const make = (opts, query = '') => { const f = fakeGL(opts); return { ...f, gate: createGpuGate(f.renderer, { query }) }; };
check('createGpuGate: null on a hardware GPU', make({ renderer: hard[0][0], vendor: hard[0][1] }).gate === null);
check('createGpuGate: null on WebGL1 (no fences), even forced', make({ renderer: SW_D3D, webgl1: true }, '?obgpugate=1').gate === null);
check('createGpuGate: null on software GL with ?obgpugate=0', make({ renderer: SW_D3D }, '?obgpugate=0').gate === null);
const forced = make({ renderer: hard[0][0] }, '?obgpugate=1').gate;
check('createGpuGate: ?obgpugate=1 forces it on a hardware GPU (census forced)', !!forced && forced.census().forced === true);
check('createGpuGate: on for software GL', !!make({ renderer: SW_LLVM }).gate && make({ renderer: SW_LLVM }).gate.census().forced === false);

// (3) the pacing, on gates forced on by the seam (the predicate is judged in (1) and (2); a broken predicate must not hide the pacing)
const pacingGate = (g, name) => { check(`pacing: the forced gate exists (${name})`, !!g); return g; };
if (pacingGate(make({ renderer: SW_D3D }, '?obgpugate=1').gate, 'first')) {
  const { gate, ctl, gl } = make({ renderer: SW_D3D }, '?obgpugate=1');
  check('pacing: nothing queued, nothing held', gate.hold() === false && gate.census().pending === 0);
  gate.afterGpuWork(); const f1 = gate.census();
  check('pacing: one unit queued (flushed) is not held: a frame may run while the last one finishes', gate.hold() === false && f1.units === 1 && ctl.flushed === 1);
  gate.afterGpuWork();
  check('pacing: two unfinished units hold the tick', gate.hold() === true && gate.census().held === 1 && gate.census().pending === 2);
  check('pacing: still held while both are unsignalled', gate.hold() === true && gate.census().held === 2);
  // the oldest signals: it retires (deleted), one stays pending, the tick runs
  const fences = []; const orig = gl.fenceSync; gl.fenceSync = () => { const s = orig(); fences.push(s); return s; };
  const g2 = createGpuGate({ getContext: () => gl }, { query: '?obgpugate=1' });
  g2.afterGpuWork(); g2.afterGpuWork();
  ctl.status.set(fences[0], gl.SIGNALED);
  check('pacing: a signalled oldest fence retires (deleted) and frees the tick', g2.hold() === false && g2.census().pending === 1 && ctl.deleted.includes(fences[0]));
  ctl.status.set(fences[1], null);
  check('pacing: an invalid status (lost / restored context) retires every fence and is counted', g2.hold() === false && g2.census().pending === 0 && g2.census().invalid === 1);
  ctl.lost = true; g2.afterGpuWork();
  check('pacing: a lost context adds no fence', g2.census().pending === 0 && g2.census().units === 2);
  ctl.lost = false; ctl.nullFence = true; g2.afterGpuWork();
  check('pacing: a null fence adds nothing', g2.census().pending === 0);
}
{
  // several fences in ONE hold() call: the boot tail queues a frame fence and a bake fence per delivered frame
  const { gl, ctl } = fakeGL({ renderer: SW_D3D });
  const made = []; const orig = gl.fenceSync; gl.fenceSync = (...a) => { const f = orig(...a); made.push(f); return f; };
  const g3 = pacingGate(createGpuGate({ getContext: () => gl }, { query: '?obgpugate=1' }), 'several fences');
  if (g3) {
  g3.afterGpuWork(); g3.afterGpuWork(); g3.afterGpuWork();
  made.forEach((f) => ctl.status.set(f, gl.SIGNALED));
  check('pacing: every signalled fence retires in one hold() call (three pending, all signalled: free, none left)',
    g3.hold() === false && g3.census().pending === 0 && made.every((f) => ctl.deleted.includes(f)), g3.census());
  g3.afterGpuWork(); g3.afterGpuWork(); g3.afterGpuWork();
  made.slice(3).forEach((f) => ctl.status.set(f, null));
  check('pacing: an invalid status retires every pending fence in one hold() call and is counted once',
    g3.hold() === false && g3.census().pending === 0 && g3.census().invalid === 1, g3.census());
  }
}

// (4) main.js's own frame() decision, lifted verbatim
// (any one-line `if (gpuGate … .hold()) { … }` in frame(), so a changed condition is judged by the checks below, not by the lift)
const dec = /\n    if \(gpuGate\b[^\n]*\.hold\(\)\) \{[^\n]*\}\n/.exec(mj)?.[0];
check('main.js: the frame() gate line is liftable', !!dec);
if (dec) {
  const run = ({ gate, manual = false, rendered = 1 }) => {
    const env = { calls: [], last: 'old', holds: 0 };
    // envTail: a spy in scope, so an env bake stepped from the held branch shows up as 'bake' (main steps it only after a render)
    const fn = new Function('env', 'gpuGate', 'manual', 'renderedFrames', `let last = env.last; const now = 'now'; const frame = () => {};
      const requestAnimationFrame = () => env.calls.push('raf');
      const envTail = { step: () => env.calls.push('bake'), drain: () => env.calls.push('bake'), owes: () => true };
      const body = () => {${dec}
        env.calls.push('render'); };
      body(); env.last = last; return env;`);
    const counted = gate && { hold: () => { env.holds += 1; return gate.hold(); } };
    return fn(env, counted, manual, rendered);
  };
  const gateHolding = { hold: () => true }, gateFree = { hold: () => false };
  let r = run({ gate: gateHolding });
  check('frame(): two unfinished units → a held tick (no render, no env bake)', r.calls.join() === 'raf' && r.holds === 1);
  r = run({ gate: gateFree });
  check('frame(): the GPU caught up → the frame renders', r.calls.join() === 'render' && r.holds === 1);
  r = run({ gate: null });
  check('frame(): no gate (hardware GL) → never held, renders', r.calls.join() === 'render');
  r = run({ gate: gateHolding, manual: true });
  check('frame(): manual frames are never held (the gate is not even asked)', r.calls.join() === 'render' && r.holds === 0);
  r = run({ gate: gateHolding, rendered: 0 });
  check('frame(): before the first delivered frame a held tick keeps the clock fresh', r.last === 'now');
  r = run({ gate: gateHolding, rendered: 3 });
  check('frame(): after it a held tick leaves the clock at the last delivered frame', r.last === 'old');
}

// (5) source census
const has = (s) => mj.includes(s);
check('main.js: the gate is made with the renderer, before the boot bake', has('  document.body.appendChild(renderer.domElement);\n  // GH-248 / KF-008 (createGpuGate, end of this file): on software GL a frame waits while two units of GL work are unfinished\n  const gpuGate = createGpuGate(renderer);')
  && mj.indexOf('const gpuGate = createGpuGate(renderer);') < mj.indexOf('  cubeCam.update(renderer, scene);\n  gpuGate?.afterGpuWork();'));
check('main.js: a fence after the boot bake', has('  cubeCam.update(renderer, scene);\n  gpuGate?.afterGpuWork(); // GH-248 / KF-008: the boot bake is a unit of GL work the first frame must not pay for'));
// GH-1174 (#1174 B1): the compile census lines sit inside the two spans below. They read renderer.info.programs and the clock
// and do no GL work, so the fence and the tail order are unchanged. B2 adds the light-set gate's first-frame baseline (a walk
// over the scene's lights) and its ready stamp (state reads) to the render span: no GL work either.
// #1202 build 21: the quiet term's quietAfterFrame (warm draws and a fence while the overlay is up: GL work) runs after the frame
// timing and BEFORE the fence, so the frame's unit covers it; the ready stamp moves after the fence (it reads the quiet term's
// state, no GL work). The env tail still arms and steps after the fence.
const CENSUS_BAKE_END = "    censusSite?.end(censusMark, 'bakeEnvOnce'); // (a throwing bake's programs land in `between` at the next step instead)\n";
const CENSUS_RENDER = "        if (compileCensus.firstDrawAt === null) {\n"
  + "          compileCensus.firstDrawAt = Math.round(r0); compileCensus.maxId = maxProgramId();\n"
  + "          if (gateKhr && !scripted) { lightKeySeen = lightSetKey(); relightOwed = false; } // B2: the gate's baseline is the first delivered frame\n"
  + "        }\n"
  + "        else { const fresh = newPrograms(); if (fresh.length) compileCensus.inRender.push({ t: Math.round(r0), frame: renderedFrames, ms: Math.round(performance.now() - r0), programs: fresh }); }\n";
const QUIET_UNIT = "        quietAfterFrame(); // #1202 build 21: the quiet term's change note, warm draws and fence (overlay up only; after renderTimes, inside the unit)\n";
const READY_STAMP = "        // B2: the boot is ready at the first frame that satisfies __test.ready's terms (#1202 build 21: the quiet term included); the\n"
  + "        // gate's boot tail counts from the later of it and the fade's start (gateArmed)\n"
  + "        if (gateReadyAt === null && (venueSettled ? venueSettled() : true) && (envTail ? envTail.bootDone() : true) && quietOk()) gateReadyAt = r0;\n";
const CENSUS_BAKE_MARK = "        const b0 = performance.now();\n";
check('main.js: a fence after every bakeEnvOnce (all paths), after its finally', has("      hidden.forEach((b) => { b.mesh.visible = true; });\n    }\n    gpuGate?.afterGpuWork(); // GH-248 / KF-008: a bake from any path (a timer, an evaluate, the tail) is fenced like a frame\n" + CENSUS_BAKE_END + "  };"));
check('main.js: a fence after each delivered frame\'s render, then the env tail arms and steps after the render as on main',
  has("        composer.render();\n        renderedFrames += 1;\n" + CENSUS_RENDER + "        if (renderTimes.length < 4000) renderTimes.push(performance.now() - r0);\n        if (deliveredWaiters.length) for (const resolve of deliveredWaiters.splice(0)) resolve();\n" + QUIET_UNIT + "        gpuGate?.afterGpuWork(); // GH-248 / KF-008: this frame's GL work is one unit\n" + READY_STAMP + "        // GH-971: the boot tail arms once the rig and venue settled; then one owed env bake per delivered frame\n        if (envTail && (venueSettled ? venueSettled() : true) && envArmReady(now)) envTail.armBoot(); // #1093: envArmReady, end of startLoop\n" + CENSUS_BAKE_MARK + "        envTail?.step();\n"));
check('main.js: no env bake in a held tick (the tail steps only after a delivered render; the scheduler has no gate path)',
  (mj.match(/envTail\?\.step\(\)|envTail\.step\(\)/g) || []).length === 1 && !mj.includes('owes()') && !mj.includes('owes:'));
const hold = mj.indexOf('    if (switchHolds > 0 && switchHeld < SWITCH_HOLD_CAP_TICKS) {'), gb = mj.indexOf('    if (gpuGate && !manual && gpuGate.hold()) {'), dt = mj.indexOf('    const dt = Math.min(0.1, (now - last) / 1000);');
check('main.js: the gate hold sits after the switch-label hold and before the frame\'s update', hold > 0 && gb > hold && dt > gb);
// GH-1174 (#1174 B1 x KF-008 merge): a resize held across a compile-ahead hold lands only after the gate hold, so it can never land
// on a gate-held tick (setSize clears the drawing buffer and a held tick renders nothing to repaint it)
const rl = mj.indexOf('    if (resizeHeld) { resizeHeld = false; if (manual && !liveManual) pendingResize = true; else resizeLive(); }');
check('main.js: the held-resize landing sits after the gate hold and before the frame\'s update', rl > gb && dt > rl);
{
  const wk = mj.slice(mj.indexOf('  function warmKeys() {'), mj.indexOf('  function frame(now) {'));
  check('main.js: the GH-910 warm tick is the one unfenced live-loop render, and the gate comment says so', wk.length > 100 && !wk.includes('gpuGate')
    && has("      if (keyWarm.state === 'pending' && keyHandle && renderGate()) warmKeys();\n      heldFrames += 1;")
    && has("The one unfenced render in the live loop is the GH-910 warm tick's"));
}
check('main.js: startLoop takes the gate; boot passes it', has('gi = null, gpuGate = null }) {') && has('envTail, gi, gpuGate });'));
check('main.js: the census on __test', has('    gpuGate: () => (gpuGate ? gpuGate.census() : null), // GH-248 / KF-008: null on hardware GL'));

console.log(fails ? `GPUGATE TEST FAIL (${fails} of ${checks})` : `GPUGATE TEST PASS (${checks} checks)`);
process.exit(fails ? 1 : 0);
