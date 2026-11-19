// Copyright (c) Meta Platforms, Inc. and affiliates.

// Execute production lifecycle bodies and the production error reporter.
// Geometry/paint creation alone is substituted; browser arms use real meshes.
import fs from 'node:fs';
import vm from 'node:vm';
import * as bootCopy from '../../../web/app/locales/boot.js';
import { equipmentAlias } from './equipment_alias_leaf.mjs';

export const tableSource = fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8');
// prepareEquipment (inside the lifecycle slice below) reads the equipmentAlias
// namespace; the context binds the REAL leaf (import-free refusal and sha256
// print live in equipment_alias_leaf.mjs).
// rebuild() (the lifecycle slice below) reads two module-level symbols declared far
// above it in table.js: the per-build collar-envelope memo and its idle pre-warm
// (ORDER-SNK-COMPANION-ENVELOPE-CACHE, #892 E1). They are located by declaration
// NAME (never by line number) and carried verbatim into the vm slice, so the
// fixture runs the production text and never a hand-written stand-in. Every
// anchor must match exactly once; a moved or renamed declaration fails loudly here.
export function productionFunction(sourceText, name) {
  const head = `\nfunction ${name}(`;
  const start = sourceText.indexOf(head);
  if (start < 0) throw new Error(`Production function ${name} is absent`);
  if (sourceText.indexOf(head, start + 1) >= 0) throw new Error(`Production function ${name} is declared more than once`);
  const end = sourceText.indexOf('\n}\n', start);
  if (end < 0) throw new Error(`Production function ${name} is unclosed`);
  return sourceText.slice(start + 1, end + 3);
}
export function productionDeclaration(sourceText, name) {
  const matches = sourceText.match(new RegExp(`^(?:export )?(?:let|const) ${name} = .*;$`, 'mg')) ?? [];
  if (matches.length !== 1) throw new Error(`Production declaration ${name} matched ${matches.length} times, expected 1`);
  return matches[0].replace(/^export /, '') + '\n';
}
// GH-976: rebuild() keys the per-spec table cache by the module-level clothKeyNow(), takes / detaches builds through the
// cache section that sits right above it inside buildTable, and resets the two module-level snooker gain-holder lists.
// All of them are carried verbatim when the tree has them (older trees do not). The fixture's group has no children, so
// detachForCache() declines and a rebuild still takes the dispose path; the slice runs the production rebuild with the
// cache in place.
export function tableCacheSection(sourceText = tableSource) {
  const head = '\n  // ---- GH-976 per-spec table cache';
  const start = sourceText.indexOf(head);
  if (start < 0) return '';
  if (sourceText.indexOf(head, start + 1) >= 0) throw new Error('Production table-cache section is declared more than once');
  const end = sourceText.indexOf('\n  function rebuild(id) {', start);
  if (end < 0) throw new Error('Production table-cache section does not end at rebuild()');
  return sourceText.slice(start + 1, end + 1);
}
export function rebuildDependencies(sourceText = tableSource) {
  const memo = productionDeclaration(sourceText, '_collarEnvMemo');
  const warned = productionDeclaration(sourceText, '_collarEnvPrewarmWarned');
  const prewarm = productionFunction(sourceText, 'collarEnvelopePrewarm');
  const clothKey = sourceText.includes('\nconst clothKeyNow = ') ? productionDeclaration(sourceText, 'clothKeyNow') : '';
  const cache = tableCacheSection(sourceText);
  const holders = cache ? productionDeclaration(sourceText, '_snkEnvGainHolders')
    + productionDeclaration(sourceText, '_snkDirectGainHolders') : '';
  return { memo, warned, prewarm, clothKey, cache, holders, text: memo + warned + prewarm, cacheText: clothKey + holders + cache };
}
class Element extends EventTarget {
  constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.children = []; this.style = {}; this.attributes = {}; this.hidden = false; this.text = ''; }
  set textContent(value) { this.text = String(value); for (const child of this.children) child.parent = null; this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
  setAttribute(key, value) { this.attributes[key] = value; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  get isConnected() { return this.isRoot || !!this.parent?.isConnected; }
  click() { this.dispatchEvent(new Event('click')); }
}
function dom() {
  const body = new Element('body'); body.isRoot = true;
  const surface = new Element('div'); surface.id = 'err'; body.append(surface);
  const all = () => { const result = []; const visit = node => { result.push(node); node.children.forEach(visit); }; visit(body); return result; };
  return { body, surface, all, createElement: tag => new Element(tag),
    getElementById: id => all().find(node => node.id === id) ?? null,
    querySelector: () => null, querySelectorAll: () => [],
  };
}
export function equipmentFixture({ prepare = () => null, populate = () => {}, plantHiddenRetry = false,
  plantOldOrdering = false, bootGuard = false, plantFatalRefusal = false, boot = false,
  initialId = 'chinese8_pro_9ft', retainedId = 'predator_apex_9ft',
  preparationError = null, reporter = true, legacyRefusal = false, sourceText = tableSource } = {}) {
  const start = sourceText.indexOf('  function rebuild(id) {');
  const end = sourceText.indexOf('\n  const api = {\n    group, clothMat', start);
  // the boot slice ends at buildTable's own `return api;` (the snooker flank-grid functions now sit
  // between buildTable's close and the '// Additive capability' comment this slice used to end at)
  const close = sourceText.indexOf('\n  return api;\n}\n', end);
  const tail = close < 0 ? -1 : close + '\n  return api;'.length;
  if (start < 0 || end < start || tail < end) throw new Error('Production lifecycle boundaries changed');
  let source = sourceText.slice(start, boot ? tail : end);
  const dependencies = rebuildDependencies(sourceText);
  source = dependencies.text + dependencies.cacheText + source;
  // #789: the builder tail's api names the top-level resolvesTable probe;
  // the boot slice carries that production function (older trees lack it).
  if (boot && sourceText.includes('\nfunction resolvableTableId(')) {
    source = productionFunction(sourceText, 'resolvableTableId') + source;
  }
  // The builder tail closes the boot prewarm cache (pwClose) and exposes its stats (_pw); the boot slice
  // carries both production texts (older trees lack them). No prewarm ran here, so pwClose returns at once.
  if (boot && sourceText.includes('\nfunction pwClose(')) {
    source = productionDeclaration(sourceText, '_pw') + productionFunction(sourceText, 'pwClose') + source;
  }
  // #789 (E9): prepareEquipment reads the top-level kernel-axis probe; the
  // slice carries its production text (older trees lack it). The context
  // binds no glue, so the probe gives no verdict (null) and never refuses.
  if (sourceText.includes('\nfunction kernelTableKnown(')) {
    source = productionDeclaration(sourceText, 'kernelTableIds') + productionFunction(sourceText, 'kernelTableKnown') + source;
  }
  if (legacyRefusal) {
    const old = JSON.parse(fs.readFileSync(new URL('./fixtures/fix9-load-path.json', import.meta.url), 'utf8'));
    const a = source.indexOf('  function refuseBuild('), b = source.indexOf('\n  function cancelPreparation()', a);
    source = source.slice(0, a) + old.refuse + source.slice(b);
  }
  // the hidden-retry plant drops the census-visibility restore ahead of styleMaterials() on the build path. Since GH-976
  // that path is the cache-miss branch of rebuildAfterDetach (restoreFromCache, carried above the slice, holds the same
  // two lines and must stay untouched); older trees keep the plain rebuild form. A plant that matches nothing would test
  // nothing, so it fails.
  if (plantHiddenRetry) {
    const miss = /(tableCacheStats\.misses\+\+;\n( +))group\.visible = true;\n\2styleMaterials\(G\);/;
    const planted = miss.test(source) ? source.replace(miss, '$1styleMaterials(G);')
      : source.replace('    group.visible = true;\n    styleMaterials(G);', '    styleMaterials(G);');
    if (planted === source) throw new Error('plantHiddenRetry: the production anchor (group.visible = true; styleMaterials(G);) is absent');
    source = planted;
  }
  if (plantOldOrdering) source = source.replace('      e.stopImmediatePropagation();', '')
    .replace(/        if \(ok\) window\.dispatchEvent\(new CustomEvent\('ob:settings', \{\s*detail: \{ \.\.\.e\.detail, tablePrepared: true \},\s*\}\)\);/, '');
  if (plantFatalRefusal) source = source.replace(/new CustomEvent\('ob:table-refused', \{\s*cancelable: true, detail: \{ error, message, recovery: 'reload' \},\s*\}\)/,
    "new ErrorEvent('error', { error, message })");
  const built = { id: boot ? null : retainedId }, group = { children: [], clear() {}, userData: {}, visible: true };
  const window = new EventTarget(), document = dom(), errors = [], consumers = [], fatalErrors = [], reloads = [];
  class ErrorEvent extends Event { constructor(type, value) { super(type); Object.assign(this, value); } }
  window.addEventListener('ob:table-refused', event => errors.push(event.detail.error));
  window.addEventListener('error', event => { fatalErrors.push(event.error); errors.push(event.error); });
  const storage = new Map();
  const context = vm.createContext({ built, group, window, document, bootCopy, equipmentAlias,
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    performance: { getEntriesByType: () => [{ name: 'http://fixture/scene/table.js' }] },
    location: { href: 'http://fixture/app.html', reload: () => reloads.push('reload') },
    fetch: async () => ({}), Promise, ErrorEvent, CustomEvent,
    // the scripted pin is a TABLE_SPECS key in production (the kernel
    // default table); the sink refuses ids without a spec (#789 E9)
    TABLE_SPECS: { chinese8_pro_9ft: {}, joy_q8_9ft: {}, predator_apex_9ft: {}, wpa_spec_9ft: {}, wpa_generic_9ft: {} }, SCRIPTED_PIN_TABLE_ID: 'wpa_generic_9ft',
    prepareTableTransport: prepare, sanitizeClothConditionId: id => id ?? '', _clothCondition: '', _clothLegApply: null,
    // the carried table-cache section (GH-976): no scripted-boot arm is on; clothKeyNow() reads the cloth colour
    obArmOn: () => false, _clothColor: '',
    _activeTableId: built.id, previousActiveId: built.id, initialId, preparationError,
    clothMat: {}, woodMat: {}, apronMat: {}, _tableHalfApply() {},
    sharedMats: new Set(), _lookCloth: null, _fallTexApply: null, _pdtWellClothApply: null,
    _rebakeTimer: null, scheduleRebake() {}, makeGeom: id => ({ id }), styleMaterials() {},
    populate: G => populate({ G, group, built }),
  });
  if (reporter) {
    const main = fs.readFileSync(new URL('../../../web/app/main.js', import.meta.url), 'utf8');
    vm.runInContext(main.slice(main.indexOf("const errBox = document.getElementById('err');"), main.indexOf('// Drift gate for the render mirrors:')), context);
  }
  if (bootGuard) {
    const html = fs.readFileSync(new URL('../../../web/app.html', import.meta.url), 'utf8');
    const a = html.indexOf('/* Boot guard (user-boot black-page fix'), b = html.indexOf('</script>', a);
    if (a < 0 || b < a) throw new Error('Actual app boot guard is absent');
    vm.runInContext(html.slice(a, b), context);
  }
  const status = sourceText.slice(end, tail).match(/^\s+status: (.+), prepareEquipment, cancelPreparation,/m)?.[1];
  if (!status) throw new Error('Production status accessor boundary changed');
  const exposed = boot ? '' : `\nreturn { refuseBuild, prepareEquipment, cancelPreparation, status: ${status},\n  collarEnvelopePrewarm, collarEnvMemo: () => _collarEnvMemo };`;
  const module = new vm.SourceTextModule('function initialize() {\n' + source + exposed + '\n}\nexport const api = initialize();', {
    context, importModuleDynamically: async () => {
      const leaf = new vm.SourceTextModule('export {};', { context });
      await leaf.link(() => {}); await leaf.evaluate(); return leaf;
    },
  });
  const ready = module.link(() => {}).then(() => module.evaluate()).then(() => {
    window.addEventListener('ob:settings', event => consumers.push({ table: built.id,
      prepared: event.detail.tablePrepared === true, visible: group.visible }));
  });
  return { ready, built, group, context, errors, fatalErrors, reloads, consumers, surface: document.surface, document, dependencies,
    api: () => module.namespace.api,
    dispatch(id, extra = {}) { window.dispatchEvent(new CustomEvent('ob:settings', {
      detail: { key: 'equipment', value: { table_id: id }, ...extra },
    })); },
    async settle() { await new Promise(resolve => setImmediate(resolve)); },
    refuse(cause, next) { module.namespace.api.refuseBuild(cause, next); },
  };
}
