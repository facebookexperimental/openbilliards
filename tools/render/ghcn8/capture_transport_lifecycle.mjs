// Copyright (c) Meta Platforms, Inc. and affiliates.

// ORDER-17 V/W/X/Y: real app boots, HTTP-held preparation and ESM-cache recovery.
// Invoke through run-gate on the CN8 lane, one case per claim.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = {};

export function initialLifecycleSettings(config, startTable) {
  const cn8 = config.kind === 'boot' || config.kind === 'archive'
    || config.kind === 'readiness' && config.arm === 'A5';
  return { game: cn8 ? 'heyball' : 'nine_ball', equipment: { table_id: cn8 ? config.table : startTable },
    equipmentByGame: { heyball: { table_id: config.table }, nine_ball: { table_id: startTable } } };
}

// This exact helper is called by the served driver and imported by its
// CPU tests. The VM tests substitute the app/CDP endpoints; they are not
// browser evidence. The first served cue is phase 1 alone.
export async function seedArchiveSession({ evaluate, wait, table }) {
  const initial = await evaluate('window.__settings.get()');
  assert.equal(initial.game, 'heyball', 'Archive phase 1 must boot the heyball game');
  assert.equal(initial.equipment.table_id, table === 'joy_q8_9ft' ? 'chinese8_pro_9ft' : table,
    'Archive phase 1 settings pairing before the legacy-alias override');
  if (table === 'joy_q8_9ft') {
    // sanitizeSpec migrates a persisted JOY id to Pro. Only the existing
    // replay/transient seam keeps the resolve-only alias; do not pretend
    // a URL or persisted JOY selection overrides that production law.
    const accepted = await evaluate(`(async()=>{const {ctx}=await import('./app/settings.js');
      window.__settings.setTransientEquipment({...window.__settings.get().equipment,
        table_id:'joy_q8_9ft',cloth_id:'snooker_napped'});
      const ok=await window.__settings.setTransientGame('heyball');
      if(ok===false)return false;ctx.game.rerack(ctx.game.seed);return true;})()`);
    assert.equal(accepted, true, 'Legacy JOY transient preparation must be accepted');
  }
  await wait(`(async()=>{const {ctx}=await import('./app/settings.js');
    return ctx.game.gameId==='heyball' && ctx.game.template?.system?.equipment?.table_id===${JSON.stringify(table)}
      && window.__tableBuild?.status?.().status==='READY';})()`, 120000);
  const prepared = await evaluate(`(async()=>{const {ctx}=await import('./app/settings.js');
    const {activeTableId}=await import('./scene/table.js');
    return {settings:window.__settings.get(),active:activeTableId(),
      rack_table:ctx.game.template?.system?.equipment?.table_id,game:ctx.game.gameId};})()`);
  // get() is the shipped values accessor; there is no __settings.values().
  assert.equal(prepared.settings.equipment.table_id, table, 'Settings must name the seed table BEFORE seeding');
  assert.equal(prepared.active, table, 'The visible table must match the seed table');
  assert.equal(prepared.rack_table, table, 'The kernel rack must match the seed table');
  const shots = [];
  for (let k = 0; k < 2; k++) {
    await wait("['AIM','BALL_IN_HAND'].includes(window.__test.state())", 120000);
    const seeded = await evaluate(`(async()=>{const {ctx}=await import('./app/settings.js');
      const result=ctx.game.shoot({v0:1,phi:Math.PI/2,theta:0,a:0,b:0});
      return {shot:typeof result==='string'?result:'shot'};})()`);
    assert.equal(seeded.shot, 'shot', 'Archive seeding shot refused: ' + seeded.shot);
    // scenarios() grows inside shoot(); only the settled aiming state
    // permits the next shot and the recorder's shotComplete to have run.
    await wait("['AIM','BALL_IN_HAND'].includes(window.__test.state())", 120000);
    shots.push(seeded);
  }
  await wait(`(async()=>{await window.__archive.flush();
    const sessions=await window.__archive.sessions();return sessions.length>0;})()`, 120000);
  const session = await evaluate(`(async()=>{const sessions=await window.__archive.sessions();
    const detail=await window.__archive.session(sessions[0].id);
    const records=await window.__archive.records(sessions[0].id);
    const parsed=records.map(record=>JSON.parse(record));
    return {id:sessions[0].id,shots:records.length,equipment:parsed[0]?.initial?.equipment??null,
      record_tables:parsed.map(record=>record.initial?.equipment?.table_id??null),
      game:sessions[0].gameId??detail?.gameId??null};})()`);
  assert.ok(session.shots >= 2, 'Archive seeding did not persist two shots');
  assert.equal(session.equipment?.table_id, table, 'Seeded session is not CN8-tagged');
  assert.ok(session.record_tables.every(id => id === table), 'Every seeded record must carry the target table');
  return { initial, prepared, shots, session };
}

export async function runLifecycle(args = process.argv.slice(2)) {
const dryCheck = args.length === 3 && args[2] === '--dry-check';
if (args[0] !== '--config' || (args.length !== 2 && !dryCheck)) throw new Error('Expected --config fresh-case.json [--dry-check]');
const configFile = path.resolve(args[1]), config = JSON.parse(fs.readFileSync(configFile));
const binding = JSON.parse(fs.readFileSync(config.binding));
const out = path.resolve(config.out), web = path.join(binding.path, 'web');
const hash = value => createHash('sha256').update(value).digest('hex');
const check = (ok, name) => { if (!ok) throw new Error(name); };
check(['boot', 'switch', 'reverse', 'recovery', 'replay', 'preview', 'preview-stack', 'preview-supersede', 'readiness', 'archive'].includes(config.kind), 'Unknown lifecycle case');
if (config.kind === 'readiness') check(['A1','A2','A3','A4','A5'].includes(config.arm), 'Named FIX13 readiness arm required');
if (config.kind === 'archive') {
  check(['phase1', 'full'].includes(config.archive_stage ?? 'full'), 'Named archive phase required');
  check(config.archive_stage !== 'phase1' || config.expect === 'PASS', 'Phase 1 smoke never claims RED-ARCHIVE');
}
check(['chinese8_pro_9ft', 'joy_q8_9ft'].includes(config.table), 'Known alias required');
check(['PASS', 'RED-BOOT', 'RED-SWITCH', 'RED-RECOVERY', 'RED-REPLAY', 'RED-PREVIEW', 'RED-ARCHIVE', 'REFUSED'].includes(config.expect), 'Expected verdict required');
const startTable = config.start_table ?? 'pool_pro_9ft_metal_rim';
check(['pool_pro_9ft_metal_rim', 'wpa_spec_9ft'].includes(startTable), 'Named non-CN8 starting table required');
if (!dryCheck) check(process.env.OB_E2E_PORT === '9580' && process.env.OB_E2E_CDP_PORT === '9595'
  && process.env.OB_CHROME_SHELL === '1' && process.env.CHROME_BIN?.endsWith('/chrome-headless-shell'), 'Assigned run-gate environment required');
const HTTP_PORT=Number(process.env.OB_E2E_PORT), CDP_PORT=Number(process.env.OB_E2E_CDP_PORT);
const originURL=`http://127.0.0.1:${HTTP_PORT}`;
check(hash(fs.readFileSync(path.join(web, 'scene/table.js'))) === binding.table_sha256, 'Committed renderer binding differs');
const overrides = Object.fromEntries(Object.entries(config.overrides ?? {}).map(([name, file]) => {
  check(!name.includes('..') && /\.(js|html)$/.test(name), 'Only named source-response overrides are allowed');
  return [name, { file: path.resolve(file), bytes: fs.readFileSync(file) }];
}));
const record = { tag: dryCheck ? 'TEST configuration validation only; no app execution'
  : 'TEST HTTP byte fixtures / DERIVED actual app, events and frames', config, binding,
  config_sha256: hash(fs.readFileSync(configFile)), recipe_sha256: hash(fs.readFileSync(new URL(import.meta.url))),
  started_at_utc: new Date().toISOString(), responses: [], events: [], frames: [], samples: [], navigations: [],
  override_sources: Object.fromEntries(Object.entries(overrides).map(([name, source]) => [name, { file: source.file, sha256: hash(source.bytes) }])) };
let chrome, server, cleaning, releaseTransport, transportHeld = false, restored = false, workerActivated = false;
let archiveHoldArmed = config.kind !== 'archive';
const transportGate = new Promise(resolve => { releaseTransport = resolve; });
const save = () => fs.writeFileSync(path.join(out, 'LIFECYCLE.json'), JSON.stringify(record, null, 2) + '\n');
const sourceNames = ['app/main.js','app/settings.js','app/shell.js','app/playback.js','scene/table.js','scene/cn8transport.js','scene/cn8transport-core.js','scene/cn8transport-codec.js','scene/cn8transport-data.js','sw.js'];
record.source_census = Object.fromEntries(sourceNames.map(name => {
  const bytes = overrides[name]?.bytes ?? fs.readFileSync(path.join(web, name));
  return [name, { sha256: hash(bytes), bytes: bytes.length, override: !!overrides[name] }];
}));
if (config.worker_bootstrap) {
  record.bootstrap_source_census = Object.fromEntries(sourceNames.map(name => {
    const bytes = fs.readFileSync(path.join(config.worker_bootstrap, 'web', name));
    return [name, { sha256: hash(bytes), bytes: bytes.length }];
  }));
  record.worker_boundary = 'Install the old digest-verified cohort first; after activation the server offers the new cohort. The old worker must keep its controlled reload coherent.';
}
if (dryCheck) {
  // Validation must not consume a future run's evidence destination.
  const dryOut = path.join(path.dirname(configFile), 'dry', path.basename(configFile, '.json'), 'LIFECYCLE.json');
  const relative = path.relative(out, dryOut);
  check(relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative),
    'Dry-check output must be outside the served evidence destination');
  check(!fs.existsSync(dryOut), 'Refusing to overwrite dry-check evidence');
  record.dry_check = { validated: ['args', 'kind', 'expect', 'table', 'start_table', 'binding', 'overrides', 'source_census'],
    env_gate: 'cue-time (run-gate ports + chrome-headless-shell asserted at run, not in dry-check)',
    hold: config.kind === 'archive' ? 'phase-gated (armed for phase 2 only)' : 'whole-run transport gate',
    initial_settings: initialLifecycleSettings(config, startTable), served_out: out, dry_out: dryOut,
    served_status: 'UNRUN — tagging fix by preamble game; passability NOT demonstrated until the cued run' };
  record.status = 'DRY-CHECK-PASS'; record.ended_at_utc = new Date().toISOString();
  fs.mkdirSync(path.dirname(dryOut), { recursive: true });
  fs.writeFileSync(dryOut, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'DRY-CHECK-PASS', case: config.kind, alias: config.table, dry_out: dryOut, served_out: out }));
  return record;
}
check(!fs.existsSync(out), 'Refusing to overwrite lifecycle evidence');
fs.mkdirSync(out, { recursive: true });
const { launchChrome, sleep } = await import(pathToFileURL(path.join(binding.path, 'web/tools/cdp.mjs')));
async function cleanup() {
  if (cleaning) return cleaning;
  cleaning = (async () => {
    releaseTransport();
    const browserGone = !chrome || await chrome.closeAndWait();
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    const receipt = { browserPid: chrome?.pid, browserGone, serverPid: process.pid,
      serverGone: !server?.listening, http: HTTP_PORT, cdp: CDP_PORT, at: new Date().toISOString() };
    fs.writeFileSync(path.join(out, 'cleanup.json'), JSON.stringify(receipt, null, 2) + '\n');
    if (!browserGone || server?.listening) process.exitCode = 2;
  })(); return cleaning;
}
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, async () => {
  record.status = 'INTERRUPTED'; record.signal = signal; save(); await cleanup(); process.exit(130);
});
async function wait(expression, timeout = 90000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await chrome.eval(expression).catch(() => false)) return;
    await sleep(100);
  }
  throw new Error('Timed out: ' + expression);
}
async function shot(name) {
  await chrome.eval('new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done(true))))');
  const file = path.join(out, name + '.png'); await chrome.screenshot(file);
  record.frames.push({ name, file, sha256: hash(fs.readFileSync(file)), at: new Date().toISOString() });
}
async function sample(name) {
  const row = await chrome.eval(`(async()=>{
    const table=await import('./scene/table.js'), {ctx}=await import('./app/settings.js');
    const root=window.__dbg?.scene?.getObjectByName('obTable'), state=window.__tableBuild?.status?.();
    const game=ctx.game, meshRows=[];
    root?.traverse(object=>{if(object.isMesh)meshRows.push({name:object.name,vertices:object.geometry?.getAttribute('position')?.count??0,visible:object.visible});});
    return {at_ms:performance.now(),time_origin:performance.timeOrigin,ready:window.__test?.ready===true,
      active:table.activeTableId(),visible:root?.visible,children:root?.children.length,meshes:meshRows,
      table_state:state??null,artifact:root?.userData.cn8TransportArtifact??null,refusal:root?.userData.cn8TransportRefusal??null,
      settings:window.__settings?.get?.()??null,settings_reachable:!!window.__settings,
      mode:window.__test?.state?.(),game_id:game?.gameId,rack_table:game?.template?.system?.equipment?.table_id??null,
      ball_count:game?.ballSet?.balls?.length??0,equipment_pending:ctx.equipmentPending===true,
      error_text:document.getElementById('err')?.textContent??'',error_hidden:document.getElementById('err')?.hidden,
      dismiss:!!document.getElementById('err-x'),reload:!!document.getElementById('table-reload'),
      badges:[...document.querySelectorAll('#err .err-n')].map(node=>({text:node.textContent,hidden:node.hidden})),
      error_rows:[...document.querySelectorAll('#err .err-msg')].map(node=>node.textContent),
      errors:window.__test?.errors??[],pending_label:document.getElementById('ob-table-pending')?.textContent??null,
      hud_inert:document.getElementById('hud')?.inert??false,
      hud_visibility:document.getElementById('hud')?.style.visibility??null,
      canvas_visibility:document.querySelector('body > canvas')?.style.visibility??null,
      shell_open:document.body.classList.contains('ob-shell-open'),
      settings_open:document.getElementById('ob-gear')?.getAttribute('aria-expanded')==='true',
      dialog_present:!!document.querySelector('[role=dialog]'),log:window.__cn8LifecycleLog??[],
      switch_result:window.__cn8SwitchResult??null,worker:navigator.serviceWorker?.controller?.scriptURL??null,
      replay:window.__share?.replay?.()??null,replay_records:window.__share?.records?.().length??0,
      preview:window.__settings?.preview?.active?.()??null};
  })()`);
  record.samples.push({ name, ...row }); return row;
}
async function instrumentGame() {
  await chrome.eval(`(async()=>{const{ctx}=await import('./app/settings.js');
    const tableModule=await import('./scene/table.js');window.__cn8LifecycleLog=[];
    for(const name of ['setEquipment','rerack','syncShadows']){const original=ctx.game[name];if(typeof original!=='function')continue;
      ctx.game[name]=function(...args){const table=window.__tableBuild,root=window.__dbg.scene.getObjectByName('obTable');
        window.__cn8LifecycleLog.push({name,at_ms:performance.now(),active:tableModule.activeTableId(),
          table_state:table?.status?.()??null,visible:root?.visible,settings:window.__settings.get(),
          rack_table:ctx.game.template?.system?.equipment?.table_id??null,args:args.map(arg=>typeof arg==='object'?structuredClone(arg):arg)});
        return original.apply(this,args);};}
    return true;})()`);
}
function switchExpression(game) {
  if(config.table==='joy_q8_9ft'&&game==='heyball') {
    // Catalog v15 keeps JOY resolve-only. A menu game change correctly
    // selects Pro; archived replays use these existing transient seams.
    // Exercise their actual order without changing the catalog or game.js.
    return `(async()=>{const{ctx}=await import('./app/settings.js');
      window.__settings.setTransientEquipment({...window.__settings.get().equipment,
        table_id:'joy_q8_9ft',cloth_id:'snooker_napped'});
      const ok=await window.__settings.setTransientGame('heyball');
      if(ok===false)return false;
      ctx.game.rerack(ctx.game.seed);return true;
    })()`;
  }
  return `window.__settings.changeGame(${JSON.stringify(game)},{skipConfirm:true})`;
}
async function switchTo(game) { return chrome.eval(switchExpression(game)); }
async function showSettings() {
  await chrome.eval("window.__settings.show();true");
  await wait("!!document.querySelector('[role=dialog]')", 15000);
  await shot('settings-reachable');
  await chrome.eval("window.__settings.close();true");
}
async function heldTransport() {
  for(let i=0;i<300&&!transportHeld;i++)await sleep(100);
  assert.equal(transportHeld,true,'FIX13 must hold the actual transport request');
  await wait("window.__tableBuild?.status?.().status==='PENDING'");
}
async function readyHud(name) {
  await wait("window.__tableBuild?.status?.().status==='READY'");
  // The shell's MutationObserver delivers at the microtask checkpoint.
  await chrome.eval('new Promise(resolve=>setTimeout(()=>resolve(true),0))');
  const row=await sample(name);await shot(name);return row;
}
async function clickHudControl() {
  const point=await chrome.eval(`(()=>{const node=document.getElementById('shoot');
    if(!node||node.disabled||node.closest('[inert]'))throw new Error('A1 HUD control unavailable');
    const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    if(!r.width||!r.height||!node.contains(document.elementFromPoint(x,y)))throw new Error('A1 HUD control is covered');
    window.__cn8HudClicks=[];node.addEventListener('click',event=>__cn8HudClicks.push({trusted:event.isTrusted,target:event.target.id}),{once:true});
    return{x,y};})()`);
  await chrome.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
  await chrome.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await chrome.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  await wait('window.__cn8HudClicks?.length===1',15000);
  record.hud_click=await chrome.eval('__cn8HudClicks');
  assert.equal(record.hud_click[0].trusted,true,'A1 requires a real trusted HUD click');
  await shot('A1-hud-click');
}
async function captureReadiness() {
  record.readiness_arm=config.arm;
  record.route='Explicit user exit during a held first download; default commitGame awaits readiness before exit.';
  if(config.arm==='A5') {
    await heldTransport();
    const held=await sample('A5-empty-held');await shot('A5-empty-held');
    assert.equal(held.canvas_visibility,'hidden','A5 empty canvas must be hidden while pending');
    assert.equal(held.hud_visibility,'','A5 must not hide the HUD with visibility');
    releaseTransport();
    const done=await readyHud('A5-ready');
    assert.equal(done.canvas_visibility,'','A5 restores the canvas at READY');
    assert.equal(done.hud_visibility,'','A5 preserves HUD visibility at READY');
    await wait('window.__test?.ready===true && !!window.__settings');
    return;
  }
  await wait('!!window.__shell');
  await chrome.eval('(async()=>{await __settings.close();__shell.quickPlay();return true;})()');
  await wait("!document.body.classList.contains('ob-shell-open') && document.getElementById('hud').inert===false");
  if(config.arm==='A1') {
    await chrome.eval("__shell.openShell({place:'play',autoFocus:false});true");
    await wait("__shell.isOpen() && document.getElementById('hud').inert===true");
  } else if(config.arm==='A4') {
    await chrome.eval('__settings.show();true');
    await wait("document.getElementById('ob-gear').getAttribute('aria-expanded')==='true' && document.getElementById('hud').inert===true");
  }
  const pick=await sample(config.arm+'-before-pick');
  assert.equal(pick.hud_inert,['A1','A4'].includes(config.arm),'FIX13 pre-pick ownership census');
  check(record.responses.every(row=>row.name!=='scene/cn8transport.js'),'FIX13 pick was already warm');
  await chrome.eval(`window.__cn8SwitchResult=null;window.__cn8Switch=${switchExpression('heyball')}.then(ok=>{window.__cn8SwitchResult=ok;return ok;});true`);
  await heldTransport();
  if(config.arm==='A1') {
    assert.equal(await chrome.eval('__shell.quickPlay()'),true,'A1 user exit during PENDING');
    const exited=await sample('A1-user-exited-held');
    assert.equal(exited.shell_open,false,'A1 shell must be closed during the hold');
    assert.equal(exited.hud_inert,false,'A1 exit must release the shell lock before READY');
  } else if(config.arm==='A2') {
    await chrome.eval('__shell.openShell({autoFocus:false});true');
    await wait("__shell.isOpen() && document.getElementById('hud').inert===true");
  } else if(config.arm==='A3') {
    await chrome.eval('__settings.show();true');
    await wait("document.getElementById('ob-gear').getAttribute('aria-expanded')==='true' && !!document.querySelector('[role=dialog]')");
  }
  const held=await sample(config.arm+'-held');await shot(config.arm+'-held');
  assert.equal(held.hud_inert,config.arm!=='A1','FIX13 HUD ownership during the hold');
  releaseTransport();
  if(config.arm==='A4') {
    await wait("window.__tableBuild.status().status==='REFUSED'");
    const refused=await sample('A4-refused');await shot('A4-refused');
    assert.equal(refused.refusal?.code,'CN8_TRANSPORT_ARTIFACT_MISSING','A4 missing-artifact fixture');
    await chrome.eval('(async()=>{await __settings.close();return true;})()');
    assert.equal((await sample('A4-settings-closed')).hud_inert,false,'A4 modal close releases its own lock');
    const warm=startTable==='pool_pro_9ft_metal_rim'?'wpa_spec_9ft':'pool_pro_9ft_metal_rim';
    assert.equal(await chrome.eval(`__settings.changeEquipment('table_id',${JSON.stringify(warm)},{skipConfirm:true})`),true,'A4 warm recovery refused');
    const done=await readyHud('A4-warm-ready');
    assert.equal(done.active,warm,'A4 built the wrong warm table');
    assert.equal(done.hud_inert,false,'A4 historical modal lock survived warm READY');
    return;
  }
  await wait('window.__cn8SwitchResult!==null');
  const done=await readyHud(config.arm+'-ready');
  assert.equal(done.switch_result,true,'FIX13 matching table must commit');
  assert.equal(done.active,config.table,'FIX13 matching table identity');
  if(config.arm==='A1') {
    assert.equal(done.shell_open,false);assert.equal(done.hud_inert,false,'A1 historical lock re-inerted the HUD');
    await clickHudControl();
  } else if(config.arm==='A2') {
    assert.equal(done.shell_open,true);assert.equal(done.hud_inert,true,'A2 shell observer did not retain its lock');
  } else {
    assert.equal(done.settings_open,true);assert.equal(done.dialog_present,true);
    assert.equal(done.hud_inert,true,'A3 settings lost its lock after READY');
  }
}
try {
  server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, originURL).pathname);
      if (pathname === '/neutral.html') { res.writeHead(200, {'Content-Type':'text/html','Cache-Control':'no-store'}); res.end('<!doctype html><title>CN8 lifecycle origin</title><link rel="icon" href="data:,">'); return; }
      check(pathname.startsWith('/web/'), 'Outside fixture root');
      const name = pathname.slice(5), file = path.resolve(web, name);
      check(file.startsWith(web + path.sep) && fs.statSync(file).isFile(), 'Outside fixture file');
      if (name === 'scene/cn8transport.js' && (config.kind !== 'archive' || archiveHoldArmed) && ['switch','reverse','replay','preview','preview-stack','preview-supersede','readiness','archive'].includes(config.kind)
        && config.hold_transport !== false) {
        transportHeld = true; await transportGate;
      }
      const planted = (config.kind === 'recovery' || config.kind === 'readiness' && config.arm === 'A4')
        && name === 'scene/cn8transport-data.js' && !restored;
      const bootstrap = config.worker_bootstrap && !workerActivated;
      const bytes = planted ? Buffer.from('export const artifact = null; export const currentArtifact = null;\n')
        : bootstrap ? fs.readFileSync(path.join(config.worker_bootstrap, 'web', name))
          : overrides[name]?.bytes ?? fs.readFileSync(file);
      if (sourceNames.includes(name)) record.responses.push({ name, sha256: hash(bytes), bytes: bytes.length,
        planted, restored, bootstrap: !!bootstrap, at: new Date().toISOString(), header: 'no-store; browser ESM module map is still real' });
      const type = name.endsWith('.js') || name.endsWith('.mjs') ? 'text/javascript' : name.endsWith('.html') ? 'text/html'
        : name.endsWith('.css') ? 'text/css' : name.endsWith('.json') ? 'application/json' : name.endsWith('.wasm') ? 'application/wasm'
          : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.png') ? 'image/png' : name.endsWith('.webp') ? 'image/webp' : 'application/octet-stream';
      res.writeHead(200, { 'Content-Type':type, 'Cache-Control':'no-store' }); res.end(bytes);
    } catch (error) { record.responses.push({url:req.url,status:404,error:String(error)});
      res.writeHead(404, { 'Cache-Control':'no-store' }); res.end('Fixture file not found'); }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(HTTP_PORT,'127.0.0.1',resolve);});
  const base = originURL+'/web';
  chrome = await launchChrome(originURL+'/neutral.html', { port:CDP_PORT,width:1600,height:1000,tool:false });
  for (const method of ['Page.enable','Runtime.enable','Network.enable']) await chrome.send(method);
  await chrome.send('Network.setBypassServiceWorker',{bypass:!config.worker});
  await chrome.send('Network.setCacheDisabled',{cacheDisabled:true});
  chrome.onEvent((method,params)=>{
    if(method==='Runtime.exceptionThrown')record.events.push({method,params});
    if(method==='Page.frameNavigated'&&!params.frame.parentId)record.navigations.push({url:params.frame.url,loader_id:params.frame.loaderId,at:new Date().toISOString()});
  });
  await wait("document.title==='CN8 lifecycle origin' && document.readyState==='complete'",15000);
  const boot = config.kind === 'boot' || config.kind === 'readiness' && config.arm === 'A5';
  const settings = initialLifecycleSettings(config, startTable);
  record.initial_settings=settings;
  record.switch_entry=config.table==='joy_q8_9ft'
    ? 'Resolve-only legacy replay: setTransientEquipment -> await setTransientGame -> rerack; current menus select chinese8_pro_9ft.'
    : 'Current menu: await changeGame(heyball).';
  await chrome.eval(`localStorage.clear();sessionStorage.clear();localStorage.setItem('ob-settings-v1',${JSON.stringify(JSON.stringify(settings))});true`);
  if(config.kind==='readiness')await chrome.eval("localStorage.setItem('ob-shell-v1',JSON.stringify({v:1,lastPlace:'play',startAtTable:true}));true");
  await chrome.send('Page.navigate',{url:base+'/app.html?table='+(boot||config.kind==='archive'?config.table:startTable)+'&obtool=0&look=green'+(config.worker?'&sw=1':'&sw=0')+(['preview','preview-stack','preview-supersede'].includes(config.kind)?'&obshell=1':'')});
  if(config.kind==='readiness'&&config.arm==='A5')await wait("window.__tableBuild?.status?.().status==='PENDING'");
  else await wait('window.__test?.ready===true && !!window.__settings');
  if(config.kind==='readiness') {
    await captureReadiness();
  } else if (boot) {
    if (['RED-BOOT','REFUSED'].includes(config.expect)) {
      await wait("!!window.__dbg?.scene?.getObjectByName('obTable')?.userData.cn8TransportRefusal");
      const row=await sample('refused-boot');
      check(!row.visible && row.refusal?.code?.startsWith('CN8_'),'Expected named empty-table refusal');
      if(config.expect==='REFUSED')check(row.reload,'The named refusal must offer reload');
      await showSettings();
    } else {
      await wait("window.__dbg?.scene?.getObjectByName('obTable')?.visible && window.__dbg.scene.getObjectByName('obTable').children.length>0 && !window.__dbg.scene.getObjectByName('obTable').userData.cn8TransportRefusal");
      const row=await sample('booted');
      check(row.active===config.table && row.meshes.length>0 && row.errors.length===0,'Boot identity/mesh/error census');
      if(config.worker){
        // sw.js intentionally does not clients.claim(): the installing page
        // remains uncontrolled until its next navigation. Wait for activation,
        // then verify that the next normal navigation is controlled by it.
        await wait("navigator.serviceWorker.getRegistration().then(reg=>reg?.active?.state==='activated')",120000);
        record.worker=await chrome.eval('navigator.serviceWorker.getRegistration().then(reg=>reg.active.scriptURL)');
        workerActivated=true;
        const origin=await chrome.eval('performance.timeOrigin');
        // A DevTools cache-disabled reload sets Request.cache=no-cache and
        // explicitly enters sw.js's digest-checked heal path. A returning
        // visit must instead exercise the ordinary coherent snapshot path.
        await chrome.send('Network.setCacheDisabled',{cacheDisabled:false});
        await chrome.send('Page.navigate',{url:base+'/app.html?table='+config.table+'&obtool=0&look=green&sw=1&cohort=controlled'});
        await wait(`performance.timeOrigin!==${origin} && window.__test?.ready===true && !!navigator.serviceWorker.controller`,120000);
        const controlled=await sample('worker-controlled-reload');
        check(controlled.active===config.table&&controlled.visible&&!controlled.refusal&&controlled.errors.length===0,'Worker-controlled second boot failed');
      }
    }
    await shot('boot');
  } else if (config.kind === 'replay') {
    await instrumentGame(); await sample('before-replay');
    record.replay_fixture = await chrome.eval(`(async()=>{
      const codec=await import('./dist/pool-sdk/share.js');
      const wasm=await import('./dist/pool-wasm/pool_wasm.js');
      const games=await import('./dist/pool-sdk/games/index.js');
      const entry=games.getGameEntry('heyball');
      const rack=games.resolveRackTemplate(entry.rack_template);
      const session={kernelVersion:wasm.kernel_version(),formatV:codec.SHARE_FORMAT_VERSION,
        rackKind:rack.kernel_kind,equipment:{...__settings.get().equipment,
          table_id:${JSON.stringify(config.table)},cloth_id:'snooker_napped'},seed:47,
        shots:[{v0:.4,phi:1.35,theta:0,a:0,b:0},{v0:.4,phi:-1.2,theta:0,a:0,b:0}],
        placements:{},game:'heyball',
        // These short opening strokes are recorded miscues. The wire must
        // also carry their real rulebook choices (22/2: original breaker
        // breaks again); omitting them leaves an unrelated pending judge.
        calls:[0,1].map(shotIndex=>({shotIndex,kind:'decision',decision:22,choice:2})),
        moves:[],mode:'play',breaker:1};
      const encoded=await codec.encodeShare(session);
      window.__cn8ReplayEncoded=encoded;
      return {tag:'TEST two-shot real-kernel replay; no physics mutation',session,encoded};
    })()`);
    // Keep the asynchronous decoder promise rooted in the page. CDP's
    // awaitPromise alone can lose a long-running unrooted result to GC.
    await chrome.eval(`window.__cn8ReplayStartState={settled:false};
      window.__cn8ReplayStart=Promise.resolve(__share.start(window.__cn8ReplayEncoded)).then(
        value=>{window.__cn8ReplayStartState={settled:true,value};},
        error=>{window.__cn8ReplayStartState={settled:true,error:String(error)};});true`);
    await wait('window.__cn8ReplayStartState?.settled===true');
    record.replay_start = await chrome.eval('window.__cn8ReplayStartState');
    check(record.replay_start.value===true, 'The real share decoder refused the replay fixture');
    if (config.hold_transport !== false) {
      for(let i=0;i<300&&!transportHeld;i++)await sleep(100);
      check(transportHeld,'Replay did not request the cold transport leaf');
      for(let i=0;i<12;i++){await sample('replay-held-'+i);await sleep(100);}
      await shot('replay-held');
      const held=record.samples.filter(row=>row.name.startsWith('replay-held-'));
      if(config.expect==='RED-REPLAY') {
        check(held.some(row=>row.replay?.done&&row.replay.i===0&&row.replay_records===0),
          'Removing readiness did not reproduce the rejected first shot');
      } else {
        check(held.every(row=>row.active===startTable&&!row.replay?.done&&row.replay_records===0
          &&row.log.every(item=>item.name!=='rerack')),'Replay ran or reracked before table readiness');
      }
      restored=true;releaseTransport();
    }
    if(config.expect==='RED-REPLAY') {
      await wait(`(async()=>{const m=await import('./scene/table.js');return m.activeTableId()===${JSON.stringify(config.table)};})()`);
      const red=await sample('replay-stuck-after-ready');
      check(red.replay?.done&&red.replay.i<red.replay.n-1&&red.replay_records===0,
        'The missing-await plant did not remain stuck before the last shot');
    } else {
      await wait('__share.replay().done && __share.replay().i===__share.replay().n-1 && __share.records().length===__share.replay().n',120000);
      const end=await sample('replay-last-shot');
      check(end.active===config.table&&end.replay.n===record.replay_fixture.session.shots.length
        &&end.replay.i===end.replay.n-1&&end.replay_records===end.replay.n&&end.errors.length===0,
        'Replay completion requires every shot record and the final shot counter');
      record.replay_record_sha256=(await chrome.eval('__share.records()')).map(value=>hash(typeof value==='string'?value:JSON.stringify(value)));
      check(end.log.filter(item=>item.name==='rerack').every(item=>item.active===config.table&&item.visible),
        'Replay rerack ran against the wrong table');
    }
    await shot('replay-complete');
  } else if (config.kind === 'preview-supersede') {
    const latest = config.second_table ?? config.table;
    check(['chinese8_pro_9ft','joy_q8_9ft'].includes(latest), 'W2 replacement alias required');
    await wait('!!window.__shell');
    await chrome.eval("__shell.openShell({});__shell.go('equipment');true");
    await wait('!!window.__atelier');
    await chrome.eval("(async()=>{await __settings.setTransientGame('heyball');__atelier.go('table');return true;})()");
    await wait("__shell.isOpen() && __atelier.station()==='table'");
    await instrumentGame();
    await sample('W2-before');
    assert.equal(await chrome.eval(`__settings.preview.stage('table_id',${JSON.stringify(config.table)})`),true);
    for(let i=0;i<300&&!transportHeld;i++) await sleep(100);
    check(transportHeld,'W2 first table must be pending');
    assert.equal(await chrome.eval("__settings.preview.stage('cloth_id','snooker_napped')"),true);
    assert.equal(await chrome.eval(`__settings.preview.stage('table_id',${JSON.stringify(latest)})`),true);
    record.w2={first:config.table,latest,cloth:'snooker_napped'};
    const held=await sample('W2-replacement-held'); await shot('W2-replacement-held');
    assert.equal(held.log.length,0,'W2 committed equipment or reracked while pending');
    restored=true;releaseTransport();
    await chrome.eval('(async()=>{await __settings.whenEquipmentReady();return true;})()');
    const end=await sample('W2-final'); await shot('W2-final');
    assert.deepEqual(end.log.filter(row=>row.name==='setEquipment').map(row=>row.args[0].table_id),[latest],
      'W2 superseded table_id was committed');
    assert.deepEqual(end.log.filter(row=>row.name==='rerack').map(row=>row.active),[latest],
      'W2 superseded table_id was reracked');
    assert.equal(end.settings.equipment.table_id,latest,'W2 lost latest table_id');
    assert.equal(end.settings.equipment.cloth_id,'snooker_napped','A2 lost cloth_id during W2 replacement');
    assert.equal(end.active,latest,'W2 built table differs');
    assert.equal(end.preview?.equipment.table_id,startTable,'W2 lost the committed preview base');
    assert.equal(end.errors.length,0,'W2 app error census');
    console.log(`ok - W2 ${config.table} -> ${latest}: one matching commit and rack`);
  } else if (config.kind === 'preview-stack') {
    check(['table-first','cloth-first'].includes(config.stage_order), 'A2 stage order required');
    check(['keep','revert-pending','revert-ready'].includes(config.action), 'A2 final action required');
    await wait('!!window.__shell');
    await chrome.eval("__shell.openShell({});__shell.go('equipment');true");
    await wait('!!window.__atelier');
    await chrome.eval("(async()=>{await __settings.setTransientGame('heyball');__atelier.go('table');return true;})()");
    await wait("__shell.isOpen() && __atelier.station()==='table'");
    await instrumentGame();
    const initial = (await sample('A2-before')).settings.equipment;
    const initialPersisted = await chrome.eval("JSON.parse(localStorage.getItem('ob-settings-v1')).equipment");
    const cloth = 'snooker_napped';
    assert.notEqual(initial.cloth_id, cloth, 'A2 cloth fixture must actually change the axis');
    check(record.responses.every(row=>row.name!=='scene/cn8transport.js'), 'A2 cold table was already warm');
    const stages = [['table_id',config.table],['cloth_id',cloth]];
    if (config.stage_order === 'cloth-first') stages.reverse();
    record.a2 = { initial, initialPersisted, stages, action:config.action, accepted:[] };
    for (const [axis,value] of stages) {
      const accepted = await chrome.eval(`__settings.preview.stage(${JSON.stringify(axis)},${JSON.stringify(value)})`);
      record.a2.accepted.push({axis,value,accepted});
      assert.equal(accepted,true,'A2 stage refused '+axis);
      if (axis === 'table_id') {
        for(let i=0;i<300&&!transportHeld;i++) await sleep(100);
        check(transportHeld,'A2 table preparation did not request the held transport');
      }
    }
    await sample('A2-both-accepted-held'); await shot('A2-both-accepted-held');
    if (config.action === 'keep') {
      await chrome.eval(`window.__a2KeepResult=null;window.__a2Keep=__settings.preview.keep({skipConfirm:true})
        .then(value=>{window.__a2KeepResult=value;return value;});true`);
    } else if (config.action === 'revert-pending') {
      assert.equal(await chrome.eval('__settings.preview.revert()'),true,'A2 Revert refused accepted stages');
    }
    restored=true;releaseTransport();
    if (config.action === 'keep') {
      await wait('window.__a2KeepResult!==null');
      record.a2.keep = await chrome.eval('window.__a2KeepResult');
      assert.equal(record.a2.keep.committed,true,'A2 Keep did not commit accepted stages');
    }
    await chrome.eval('(async()=>{await __settings.whenEquipmentReady();return true;})()');
    if (config.action === 'revert-ready') {
      const staged = await sample('A2-both-ready'); await shot('A2-both-ready');
      assert.equal(staged.settings.equipment.table_id,config.table,'A2 lost table_id before Revert');
      assert.equal(staged.settings.equipment.cloth_id,cloth,'A2 lost cloth_id before Revert');
      assert.equal(await chrome.eval('__settings.preview.revert()'),true,'A2 ready Revert refused');
      await chrome.eval('(async()=>{await __settings.whenEquipmentReady();return true;})()');
    }
    const end = await sample('A2-final'); await shot('A2-final');
    const expected = config.action === 'keep' ? {table_id:config.table,cloth_id:cloth} : initial;
    const persisted = await chrome.eval("JSON.parse(localStorage.getItem('ob-settings-v1')).equipment");
    record.a2.expected=expected;record.a2.persisted=persisted;
    for (const axis of ['table_id','cloth_id']) {
      assert.equal(end.settings.equipment[axis],expected[axis],`A2 lost ${axis}: ${config.stage_order} ${config.action}`);
      if (config.action === 'keep') assert.equal(persisted[axis],expected[axis],`A2 did not persist ${axis}`);
    }
    if (config.action !== 'keep') assert.deepEqual(persisted,initialPersisted,'A2 Revert altered committed storage');
    assert.equal(end.active,expected.table_id,'A2 built table_id differs from accepted transaction');
    assert.equal(end.preview,null,'A2 final action left a preview transaction');
    assert.equal(end.equipment_pending,false,'A2 final action left equipment pending');
    assert.equal(end.errors.length,0,'A2 app error census');
    console.log(`ok - A2 ${config.table} ${config.stage_order} ${config.action}: BOTH axes`);
  } else if (config.kind === 'preview') {
    await wait('!!window.__shell');
    await chrome.eval("__shell.openShell({});__shell.go('equipment');true");
    await wait('!!window.__atelier');
    // TEST: stage the game's legal-table cohort without preloading a CN8
    // table. This public replay seam is independent of a table preview.
    // JOY is resolve-only, so its existing preview seam is exercised even
    // though today's menu offers only Pro. No catalog is changed.
    await chrome.eval("(async()=>{await __settings.setTransientGame('heyball');__atelier.go('table');return true;})()");
    await wait("__shell.isOpen() && __atelier.station()==='table'");
    const previewUI=async name=>{
      const row=await chrome.eval(`(()=>{const visible=selector=>{const node=document.querySelector(selector);
        return !!node&&!node.hidden&&node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden';};
        return {state:__settings.preview.active(),keep:visible('[data-ob="atelier-keep"]'),
          revert:visible('[data-ob="atelier-revert"]'),bar:visible('[data-ob="atelier-txbar"]'),
          table:__settings.get().equipment.table_id};})()`);
      (record.preview_ui??=[]).push({name,...row});return row;
    };
    check(record.responses.every(row=>row.name!=='scene/cn8transport.js'),'Preview fixture warmed CN8 before its first pick');
    check(await chrome.eval(`__settings.preview.stage('table_id',${JSON.stringify(config.table)})`),'Cold preview was refused');
    for(let i=0;i<300&&!transportHeld;i++)await sleep(100);
    check(transportHeld,'Cold preview did not hold the actual transport request');
    await previewUI('held');restored=true;releaseTransport();
    await wait(`__settings.get().equipment.table_id===${JSON.stringify(config.table)} && window.__tableBuild.status().status==='READY' && document.getElementById('ob-table-pending')?.hidden!==false`);
    const cold=await previewUI('first-cold');await shot('first-cold-preview');
    if(config.expect==='RED-PREVIEW') check(!cold.keep&&!cold.revert,'Old notification order did not hide Keep/Revert');
    else check(cold.keep&&cold.revert&&cold.bar,'First cold preview did not display Keep/Revert');
    await chrome.eval('Promise.resolve(__settings.preview.revert())');
    await wait(`__settings.get().equipment.table_id===${JSON.stringify(startTable)}`);
    check(await chrome.eval(`__settings.preview.stage('table_id',${JSON.stringify(config.table)})`),'Warm preview was refused');
    await wait(`__settings.get().equipment.table_id===${JSON.stringify(config.table)}`);
    const warm=await previewUI('second-warm');await shot('second-warm-preview');
    if(config.expect==='PASS')check(warm.keep&&warm.revert&&warm.bar,'Warm preview lost Keep/Revert');
    check(record.responses.filter(row=>row.name==='scene/cn8transport.js').length===1,'Warm preview refetched the leaf');
  } else if (['switch','reverse'].includes(config.kind)) {
    await instrumentGame(); await sample('before-switch');
    await chrome.eval(`window.__cn8SwitchResult=null;window.__cn8Switch=${switchExpression('heyball')}.then(ok=>{window.__cn8SwitchResult=ok;return ok;});true`);
    for(let i=0;i<300&&!transportHeld;i++)await sleep(100);
    check(transportHeld,'The actual leaf request must be held at the HTTP server');
    for(let i=0;i<12;i++){await sample('held-'+i);await sleep(100);}
    await shot('preparation-held');
    const held=record.samples.filter(row=>row.name.startsWith('held-'));
    if(config.expect==='RED-SWITCH') {
      check(held.some(row=>row.settings.game==='heyball'&&row.settings.equipment.table_id===config.table&&row.active==='pool_pro_9ft_metal_rim'),'FIX9 must reproduce committed CN8 over the previous pool table');
      check(held.some(row=>row.log.some(item=>item.name==='rerack')),'FIX9 early rerack red arm');
    } else {
      check(held.every(row=>row.settings.game==='nine_ball'&&row.settings.equipment.table_id==='pool_pro_9ft_metal_rim'&&row.log.length===0&&row.equipment_pending&&row.hud_inert),'Pending switch changed the prior game, rack, or gameplay gate');
      record.pending_shot=await chrome.eval(`(async()=>{const{ctx}=await import('./app/settings.js');
        const before={mode:__test.state(),scenarios:__test.scenarios().length};
        const result=ctx.game.shoot({v0:1,phi:Math.PI/2,theta:0,a:0,b:0});
        return {before,result,after:{mode:__test.state(),scenarios:__test.scenarios().length}};
      })()`);
      check(typeof record.pending_shot.result==='string'&&record.pending_shot.result.length>0
        &&JSON.stringify(record.pending_shot.before)===JSON.stringify(record.pending_shot.after),
        'A pending equipment download must block a gameplay shot before simulation');
    }
    if(config.kind==='reverse'){check(await switchTo('nine_ball')===true,'Reverse supersession refused');await sample('reverse-before-release');}
    restored=true;releaseTransport();await wait('window.__cn8SwitchResult!==null');
    const final=await sample('after-release');await shot('after-release');
    if(config.kind==='reverse')check(final.active==='pool_pro_9ft_metal_rim'&&final.settings.game==='nine_ball'&&final.switch_result===false&&final.log.length===0,'Stale request overwrote the reverse switch');
    else if(config.expect==='PASS'){
      check(final.active===config.table&&final.visible&&final.switch_result===true&&final.settings.game==='heyball','Matching table did not commit');
      check(final.log.filter(row=>row.name==='rerack').length===1&&final.log.every(row=>row.active===config.table&&row.visible),'A consumer ran before its matching table');
    }
  } else if (config.kind === 'archive') {
    // UNRUN — tagging fix by preamble game; passability NOT demonstrated
    // until the cued run. First cue: phase 1 alone (no HTTP hold). Full
    // cases then reload on the retained table before arming the cold hold.
    record.route='Heyball preamble; verify actual seed pairing; archive tag check; phase 2 only on a separate full-case cue.';
    await wait('window.__test?.ready===true && !!window.__settings && !!window.__archive');
    const seeded = await seedArchiveSession({ evaluate: expression => chrome.eval(expression), wait, table: config.table });
    record.archive_preseed = { initial: seeded.initial, prepared: seeded.prepared };
    record.archive_seed = seeded.shots;
    record.archive_session = seeded.session;
    record.archive_stage = config.archive_stage ?? 'full';
    if (record.archive_stage === 'phase1') {
      check(!archiveHoldArmed && !transportHeld, 'Phase 1 smoke must not arm a hold');
      const phase1 = await sample('archive-phase1-tagged'); await shot('archive-phase1-tagged');
      check(phase1.errors.length === 0, 'Archive phase 1 app error census');
    } else {
    const seedOrigin=await chrome.eval('performance.timeOrigin');
    await chrome.eval(`localStorage.setItem('ob-settings-v1',JSON.stringify({game:'nine_ball',
      equipment:{table_id:${JSON.stringify(startTable)},cloth_id:'standard'},
      equipmentByGame:{heyball:{table_id:${JSON.stringify(config.table)}},nine_ball:{table_id:${JSON.stringify(startTable)}}}));true`);
    archiveHoldArmed = true;
    const phase2Mark = record.responses.length;
    await chrome.send('Page.navigate',{url:base+'/app.html?table='+startTable+'&obtool=0&look=green&sw=0'});
    await wait(`performance.timeOrigin!==${seedOrigin} && window.__test?.ready===true && !!window.__settings && !!window.__archive && !!window.__playback`,120000);
    check(record.responses.slice(phase2Mark).every(row=>row.name!=='scene/cn8transport.js'),'Archive phase 2 warmed CN8 before the held open');
    await instrumentGame();
    await chrome.eval(`(async()=>{const{ctx}=await import('./app/settings.js');
      const tableModule=await import('./scene/table.js');window.__cn8ArchiveLoads=[];
      const original=ctx.game.loadRecord.bind(ctx.game);
      ctx.game.loadRecord=function(...args){const table=window.__tableBuild;
        window.__cn8ArchiveLoads.push({at_ms:performance.now(),active:tableModule.activeTableId(),
          table_state:table?.status?.()??null,visible:window.__dbg.scene.getObjectByName('obTable')?.visible,
          player_open:window.__playback.playerOpen()});return original(...args);};
      return true;})()`);
    await sample('archive-before-open');
    await chrome.eval(`window.__cn8ArchiveOpenState={settled:false};
      window.__cn8ArchiveOpen=Promise.resolve(__playback.openSession(${JSON.stringify(record.archive_session.id)},{reopenList:false})).then(
        value=>{window.__cn8ArchiveOpenState={settled:true,value};},
        error=>{window.__cn8ArchiveOpenState={settled:true,error:String(error)};});true`);
    for(let i=0;i<300&&!transportHeld;i++)await sleep(100);
    check(transportHeld,'Archive open did not request the cold transport leaf');
    for(let i=0;i<12;i++){await sample('archive-held-'+i);await sleep(100);}
    await shot('archive-held');
    const heldLoads=await chrome.eval('window.__cn8ArchiveLoads');
    record.archive_held_loads=heldLoads;
    const held=record.samples.filter(row=>row.name.startsWith('archive-held-'));
    if(config.expect==='RED-ARCHIVE') {
      check(heldLoads.length>0&&heldLoads.every(row=>row.active===startTable&&row.table_state?.status==='PENDING'),
        'plantFireAndForget did not stage records on the retained table while held');
    } else {
      check(heldLoads.length===0,'Archive staged a record before table readiness');
      check(held.every(row=>row.active===startTable&&!row.log.some(item=>item.name==='rerack')),'Archive reracked before table readiness');
      check((await chrome.eval('window.__playback.playerOpen()'))===false,'Archive built a player before table readiness');
    }
    restored=true;releaseTransport();
    await wait('window.__cn8ArchiveOpenState?.settled===true',120000);
    record.archive_open=await chrome.eval('window.__cn8ArchiveOpenState');
    check(record.archive_open.value===true,'Archive openSession did not complete after release');
    const end=await sample('archive-frame0');await shot('archive-frame0');
    const frame0=await chrome.eval(`(async()=>{const tableModule=await import('./scene/table.js');
      const{ctx}=await import('./app/settings.js');
      return {active:tableModule.activeTableId(),rack_table:ctx.game.template?.system?.equipment?.table_id??null,
        loads:window.__cn8ArchiveLoads,player_open:window.__playback.playerOpen()};})()`);
    record.archive_frame0=frame0;
    check(frame0.active===config.table&&frame0.rack_table===config.table,'Frame 0 is not on the session alias');
    if(config.expect==='RED-ARCHIVE') {
      check(frame0.loads.some(row=>row.active===startTable&&row.table_state?.status==='PENDING'),
        'RED-ARCHIVE did not preserve the retained-table staging history');
    } else {
      check(frame0.loads.length>0&&frame0.loads.every(row=>row.active===config.table&&row.table_state?.status==='READY'),
        'Staged records did not all land on the ready alias');
    }
    check(frame0.player_open===true,'Archive player is not open after release');
    check(end.errors.length===0,'Archive app error census');
    }
  } else {
    await instrumentGame(); await switchTo('heyball');
    await wait("!!window.__dbg?.scene?.getObjectByName('obTable')?.userData.cn8TransportRefusal");
    await sample('missing-artifact');await shot('missing-artifact');
    restored=true;
    record.restore={at:new Date().toISOString(),method:'Server now serves the unmodified artifact; evaluated page modules are not mutated'};
    if(config.expect==='RED-RECOVERY')await switchTo('nine_ball');
    await switchTo('heyball');await sleep(200);
    const twice=await sample('restored-server-same-page');await shot('second-refusal');
    check(twice.refusal?.code==='CN8_TRANSPORT_ARTIFACT_MISSING','The evaluated missing module must remain cached');
    check(record.responses.filter(row=>row.name==='scene/cn8transport-data.js').length===1,'Same-page retry must not pretend the module graph refetched');
    if(config.expect==='RED-RECOVERY')check(!twice.dismiss,'FIX9 must reproduce a detached dismiss button');
    else {
      check(twice.dismiss&&twice.reload&&twice.badges.some(row=>row.text==='×2'&&!row.hidden),'Dismiss/reload/repetition badge failed');
      check(twice.settings.game==='nine_ball'&&twice.active==='pool_pro_9ft_metal_rim'&&twice.refusal.retained_table==='pool_pro_9ft_metal_rim','Refused id escaped into settings or active identity');
      await chrome.eval("document.getElementById('err-x').click();true");
      check((await sample('dismissed')).error_hidden===true,'Error dismissal did not work');
      await showSettings();
      // Re-surface the same managed panel, then exercise its offered reload.
      await switchTo('heyball');
      const origin=await chrome.eval('performance.timeOrigin');
      await chrome.eval("document.getElementById('table-reload').click();true").catch(()=>{});
      await wait(`performance.timeOrigin!==${origin} && window.__test?.ready===true && !!window.__settings`,120000);
      check(await switchTo('heyball')===true,'Restored artifact did not recover after the offered reload');
      const final=await sample('reloaded-and-recovered');await shot('reloaded-and-recovered');
      check(final.active===config.table&&final.visible&&final.artifact?.status==='PASS'&&!final.refusal&&final.errors.length===0,'Reload did not give a fresh, successful module graph');
      check(record.responses.filter(row=>row.name==='scene/cn8transport-data.js').length===2,'Reload should fetch exactly one new data module');
    }
  }
  check(record.events.length===0,'Unexpected transient listener or browser exception');
  record.status=config.kind==='archive'&&config.archive_stage==='phase1'?'PASS-PHASE1-SMOKE'
    :config.expect==='PASS'?'PASS':config.expect==='REFUSED'?'PASS-NAMED-REFUSAL':'PASS-EXPECTED-RED';
  record.ended_at_utc=new Date().toISOString();save();
  console.log(JSON.stringify({status:record.status,case:config.kind,alias:config.table,frames:record.frames.length,out}));
} catch(error){
  record.status='FAIL';record.error=String(error?.stack??error);
  record.error_code=error?.code??null;
  if(config.kind==='preview-stack') console.error(`not ok - A2 ${config.table}: ${error.message}`);
  if(config.kind==='preview-supersede') console.error(`not ok - W2 ${config.table}: ${error.message}`);
  if(chrome){
    await sample('failure-state').catch(()=>{});
    await shot('failure-state').catch(()=>{});
  }
  if(chrome&&config.worker)record.worker_diagnostic=await chrome.eval(`(async()=>({
    registrations:(await navigator.serviceWorker.getRegistrations()).map(reg=>({scope:reg.scope,
      installing:reg.installing?.state,waiting:reg.waiting?.state,active:reg.active?.state})),
    controller:navigator.serviceWorker.controller?.scriptURL,cache_keys:await caches.keys()
  }))()`).catch(error=>({error:String(error)}));
  save();process.exitCode=1;console.error(record.error);
}
finally {await cleanup();}
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await runLifecycle();
}
