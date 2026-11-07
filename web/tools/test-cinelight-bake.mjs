// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-cinelight-bake.mjs — node selftest of the cinelight studio bake's gameplay-visual hide (GH-1103) in
// web/app/cinelight.js. No browser. The `>>> cinelight bake visuals` / `<<< cinelight bake visuals` block is lifted verbatim
// and run over a stub scene graph with three's traverse order (depth-first, children in insertion order):
//   a hidden post-strike obCueStick (cuepost) ahead of the live rod and a visible preview — the bake sees neither rod nor the
//   preview; every obAim* overlay stays out; a nameless node never throws; the undo restores exactly what it hid.
// The install's bracket is checked as text: the hide runs after the lamp-fade bracket opens and right before the capture's
// try, and its undo is the first statement of that try's finally (the brackets nest; a throwing bake restores everything).
// PLANTS: the block without the hide (the pre-fix bake), a preview-only rule, an unguarded name read and the undo moved out of
// the finally must each FAIL.
//   node web/tools/test-cinelight-bake.mjs   (exit 0 = every expectation held and every plant was caught)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PORT_FLAGS = {};

const CINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'cinelight.js');
const src = fs.readFileSync(CINE, 'utf8');
let bad = 0, total = 0;
const report = (name, ok, detail = '') => { total++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };

const a = src.indexOf('// >>> cinelight bake visuals'), b = src.indexOf('// <<< cinelight bake visuals');
const BLOCK = a >= 0 && b > a ? src.slice(a, b) : null;
report('the bake-visuals markers exist in web/app/cinelight.js', BLOCK !== null, BLOCK !== null ? '' : 'markers missing');
if (!BLOCK) { console.log(`CINELIGHT BAKE FAIL (${total - bad}/${total})`); process.exit(1); }

/** A stub node; `sceneOf` gives the root three's traverse (depth-first, children in order). */
const node = (name, visible = true, children = []) => { const n = { name, visible, children, parent: null }; children.forEach((c) => { c.parent = n; }); return n; };
function sceneOf(children) {
  const s = node('', true, children);
  s.traverse = (cb) => { const walk = (o) => { cb(o); o.children.forEach(walk); }; walk(s); };
  return s;
}
const shown = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
// eslint-disable-next-line no-new-func
const loadHide = (block) => new Function(`${block}\n  return hideGameplayVisuals;`)();

/** Run the hide scenarios against one block; returns { name: { ok, detail } }. */
function scenarios(block) {
  const out = {};
  const put = (name, ok, detail) => { out[name] = { ok, detail }; };
  { // an export from AIM after a shot and a cue change: cuepost's hidden whip rod first, the preview, then the live rod
    const post = node('obCueStick', false), tip = node('obCueTip'), live = node('obCueStick', true, [tip]);
    const ghost = node('obGhost'), prev = node('obAimPreview', true, [ghost]), table = node('obTable');
    const scene = sceneOf([table, post, prev, live]);
    let leaked = null, tableOn = null;
    try { const undo = loadHide(block)(scene); leaked = [live, tip, prev, ghost].filter(shown).map((o) => o.name); tableOn = shown(table); undo(); } catch (e) { leaked = [`threw: ${e.message}`]; }
    put('the studio bake sees neither rod nor the preview (an export from AIM)',
      leaked.length === 0 && tableOn && live.visible && prev.visible && !post.visible,
      `in the bake: ${leaked.join(', ') || 'none'}; after the undo: live ${live.visible}, preview ${prev.visible}, post ${post.visible}`);
  }
  { // every aim overlay stays out (obAim*: the preview and the call / snap / zone / rest assists)
    const zone = node('obAimZone'), snap = node('obAimSnap', false), call = node('obAimCall'), rest = node('obAimRest'), cloth = node('obCloth');
    const scene = sceneOf([cloth, zone, snap, call, rest]);
    let leaked = null;
    try { const undo = loadHide(block)(scene); leaked = [zone, call, rest].filter(shown).map((o) => o.name); undo(); } catch (e) { leaked = [`threw: ${e.message}`]; }
    put('every obAim* overlay stays out of the studio bake', leaked.length === 0 && shown(cloth) && zone.visible && call.visible && rest.visible && !snap.visible,
      `in the bake: ${leaked.join(', ') || 'none'}; after: zone ${zone.visible}, call ${call.visible}, rest ${rest.visible}, snap ${snap.visible}`);
  }
  { // a nameless node anywhere in the graph never throws, and the named rod is still hidden
    const nameless = node(undefined), live = node('obCueStick');
    let threw = null, during = null;
    try { const undo = loadHide(block)(sceneOf([nameless, live])); during = live.visible; undo(); } catch (e) { threw = e.message; }
    put('a nameless node never throws inside the studio bake', threw === null && during === false && live.visible, threw ? `threw: ${threw}` : `rod during the bake ${during}`);
  }
  { // the undo restores exactly what it hid: an already-hidden node stays hidden, unrelated nodes are never touched
    const live = node('obCueStick'), prevOff = node('obAimPreview', false), other = node('obCueRack');
    const scene = sceneOf([other, live, prevOff]);
    const undo = loadHide(block)(scene); const during = [live.visible, prevOff.visible, other.visible]; undo();
    put('the undo restores exactly the nodes it hid', during.join() === 'false,false,true' && live.visible && !prevOff.visible && other.visible,
      `during ${during.join('/')}; after ${[live.visible, prevOff.visible, other.visible].join('/')}`);
  }
  return out;
}
for (const [name, r] of Object.entries(scenarios(BLOCK))) report(name, r.ok, r.detail);

// the install's bracket (text): opened after the lamp-fade bracket, the hide right before the capture's try, its undo the
// first statement of that try's finally — one call, one undo
const FADE = 'const restoreFade = window.__lampfade?.suspendForBake?.();';
const CALL = 'const restoreDyn = hideGameplayVisuals(scene);';
const TRY = 'try {\n        cam6.update(renderer, scene);\n      } finally {';
const bracketOf = (text) => {
  const f = text.indexOf(FADE), c = text.indexOf(CALL), t = text.indexOf(TRY, Math.max(c, 0));
  const afterCall = c >= 0 ? text.slice(c + CALL.length).replace(/^\s*/, '') : '';
  const fin = t >= 0 ? text.slice(t + TRY.length).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'))[0] : '';
  const calls = text.split(CALL).length - 1, undos = text.split('restoreDyn();').length - 1;
  return { ok: f >= 0 && c > f && afterCall.startsWith('try {') && t > c && fin === 'restoreDyn();' && calls === 1 && undos === 1,
    detail: `fade@${f} call@${c} try@${t} finally[0]='${fin}' calls ${calls} undos ${undos}` };
};
const br = bracketOf(src);
report('install hides after the lamp-fade bracket, right before the capture, and undoes first in its finally', br.ok, br.ok ? '' : br.detail);

// plants
const HIDE = 'hidden.forEach((o) => { o.visible = false; });';
const RULE = "nm.startsWith('obAim')";
const GUARD = "const nm = o.name || '';";
const scenario = (block, name) => scenarios(block)[name];
const plant = (label, needle, replacement, name) => {
  const r = BLOCK.includes(needle) ? scenario(BLOCK.replace(needle, replacement), name) : null;
  report(`PLANT ${label}: must FAIL`, !!r && !r.ok, r ? r.detail : `text not found — update the plant with the code (${needle})`);
};
plant('no hide (the pre-fix bake)', HIDE, '', 'the studio bake sees neither rod nor the preview (an export from AIM)');
plant('preview-only rule', RULE, "nm.startsWith('obAimPreview')", 'every obAim* overlay stays out of the studio bake');
plant('unguarded name read', GUARD, 'const nm = o.name;', 'a nameless node never throws inside the studio bake');
const UNDO_LINE = '        restoreDyn();\n';
const moved = src.includes(UNDO_LINE) ? bracketOf(src.replace(UNDO_LINE, '').replace('        shown.forEach((b) => { b.visible = true; });\n      }\n', '        shown.forEach((b) => { b.visible = true; });\n      }\n      restoreDyn();\n')) : null;
report('PLANT undo outside the finally: the bracket check must FAIL', !!moved && !moved.ok, moved ? moved.detail : 'undo line not found — update UNDO_LINE with the code');

console.log(`CINELIGHT BAKE ${bad ? 'FAIL' : 'PASS'} (${total - bad}/${total})`);
process.exit(bad ? 1 : 0);
