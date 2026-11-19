#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-identity-gates.mjs — the working-tree twin of the repo gates that read the COMMITTED tree.
//
// Three gates the club seams touch read every file with `git show HEAD:<path>`, never the working tree:
//   web/tools/test-equipment-mixed-cache-census.mjs   call-site spans [path, start, end, anchor] in main.js / settings.js
//   tools/check-competitor-brands.mjs                 token hits in the shipped tree, exceptions pinned to exact line text
//   tools/check-provenance-tags.mjs                   citation spans, and the brand forms inside the seven locale files
// A fourth, tools/notice-inventory.mjs --census, reads the git index (tracked files under web/vendor/), so it cannot see an
// untracked addon either.
// So before the lane's first commit they report on the base, whatever the working tree holds, and they turn red (or stay
// green) only at the commit. This arm asks the same questions of the working tree, for the files this lane changed or added:
//   CENSUS   every census call site still holds its anchor token inside its span
//   STALE    every exception line the brand gate pins still occurs, verbatim, in its file
//   BRAND    a brand token (the fixture's own rules) in a file this lane changed or added, on a line no exception pins
//   LOCALE   a locale key this lane added carries a declared brand form (the provenance gate's key x token x locale walk)
//   CITED    a file the provenance gate cites by line span was changed by this lane (its spans would need a re-pin)
//   NOTICE   a file under web/vendor/ (tracked or new) that web/vendor/LICENSES.md does not name by its full path in backticks
// It is a twin, not the gate: the brand twin applies the fixture's non-hashed rules to raw text (no Unicode folding, no
// wrapped-pair matching), which is enough for files that are new English code, shader text and images. The real gates run
// at the commit; `--repin` prepares the one data-only change they need.
//
// Usage:
//   node web/tools/club/test-club-identity-gates.mjs             exit 0 = green, 1 = red, 2 = could not run
//   node web/tools/club/test-club-identity-gates.mjs --repin     print the census call sites the lane's edits moved, with the
//                                                                span carried through the diff's line map; --write applies
//                                                                them to the fixture (line numbers only)
//   node web/tools/club/test-club-identity-gates.mjs --selftest  planted reds for every code
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CENSUS = 'web/tools/fixtures/equipment-mixed-cache-census.json';
const BRANDS = 'tools/fixtures/competitor-brands.json';
const PROVENANCE = 'tools/fixtures/provenance-tags.json';
const LOCALE_FORMS = 'tools/fixtures/brand-locale-forms.json';
const LOCALES = ['en', 'de', 'fr', 'es', 'ja', 'ko', 'zh-CN'];
const TEXT_EXT = /\.(?:js|mjs|json|css|html|md|txt|svg|webmanifest)$/i;

const git = (args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const shipped = (p) => (p.startsWith('web/') && !p.startsWith('web/tools/')) || p.startsWith('site/');

// ---- CENSUS ------------------------------------------------------------------------------------------------------------
/** sites: [[path, start, end, token]], read(path) -> string | null. */
export function judgeCensus(sites, read) {
  const failures = [];
  for (const [p, start, end, token] of sites) {
    const text = read(p);
    const where = `${p}:${start}-${end}`;
    if (text === null) { failures.push({ code: 'CENSUS', where, msg: 'the file does not exist' }); continue; }
    const lines = text.split('\n');
    if (lines.slice(start - 1, end).join('\n').includes(token)) continue;
    const at = [];
    lines.forEach((l, i) => { if (l.includes(token.split('\n')[0])) at.push(i + 1); });
    failures.push({ code: 'CENSUS', where, msg: `anchor ${JSON.stringify(token.slice(0, 60))} is not in the span${at.length ? ` (found at line ${at.slice(0, 4).join(', ')})` : ' (absent from the file)'}` });
  }
  return failures;
}
const censusSites = (fx) => (fx.rows ?? []).flatMap((r) => (Array.isArray(r.call_sites) ? r.call_sites : []));

/** old line -> new line through `git diff -U0` hunks; null when the old line itself was removed or rewritten. */
export function lineMap(diffText) {
  const hunks = [];
  for (const m of diffText.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    hunks.push({ a: Number(m[1]), an: m[2] === undefined ? 1 : Number(m[2]), b: Number(m[3]), bn: m[4] === undefined ? 1 : Number(m[4]) });
  }
  return (line) => {
    let shift = 0;
    for (const h of hunks) {
      if (h.an === 0) { if (line > h.a) shift += h.bn; continue; } // pure insertion after old line h.a
      if (line < h.a) break;
      if (line < h.a + h.an) return null; // inside a rewritten range
      shift += h.bn - h.an;
    }
    return line + shift;
  };
}

// ---- BRAND / STALE -------------------------------------------------------------------------------------------------------
function compileTokens(fx) {
  const out = [];
  for (const t of fx.tokens ?? []) {
    let re = null;
    if (t.rule === 'ascii-boundary-cs') re = new RegExp(`(?<![0-9A-Za-z])${esc(t.form)}(?![0-9A-Za-z])`, 'g');
    else if (t.rule === 'regex-ci') re = new RegExp(t.pattern, 'gi');
    else if (t.rule === 'regex-cs') re = new RegExp(t.pattern, 'g');
    else if (t.rule === 'literal-cs' || t.rule === 'cjk-substring') re = new RegExp(esc(t.form), 'g');
    else continue; // hashed rules exist only in the exported fixture
    out.push({ id: t.id, re, short: t.rule === 'ascii-boundary-cs' && t.form.length <= 3, stringsOnly: t.scope === 'binary-strings', textOnly: t.scope === 'text' });
  }
  return out;
}
/** files: [{ path, text, binary }]; returns BRAND failures for hits on lines no exception of that file pins. */
export function judgeBrands(fx, files) {
  const failures = [];
  const toks = compileTokens(fx);
  const ctx = (fx.non_brand_contexts ?? []).filter((c) => c.kind === 'following' || c.kind === 'preceding')
    .map((c) => ({ kind: c.kind, re: new RegExp(c.kind === 'following' ? `^(?:${c.pattern})` : `(?:${c.pattern})$`) }));
  for (const f of files) {
    const pinned = new Set((fx.exceptions ?? []).filter((x) => x.file === f.path && Array.isArray(x.lines)).flatMap((x) => x.lines));
    const lines = f.binary ? null : f.text.split('\n');
    const seen = new Set(); // one failure per token and line (a line may carry the token twice)
    for (const t of toks) {
      if (f.binary ? (t.short || t.textOnly) : t.stringsOnly) continue;
      t.re.lastIndex = 0;
      for (const m of f.text.matchAll(t.re)) {
        const before = f.text.slice(Math.max(0, m.index - 24), m.index), after = f.text.slice(m.index + m[0].length, m.index + m[0].length + 24);
        if (ctx.some((c) => (c.kind === 'following' ? c.re.test(after) : c.re.test(before)))) continue;
        if (f.binary) { failures.push({ code: 'BRAND', where: f.path, msg: `token ${t.id} in the file's bytes` }); break; }
        const n = f.text.slice(0, m.index).split('\n').length;
        if (pinned.has(lines[n - 1].trim()) || seen.has(`${t.id}:${n}`)) continue;
        seen.add(`${t.id}:${n}`);
        failures.push({ code: 'BRAND', where: `${f.path}:${n}`, msg: `token ${t.id} on a line no exception pins: ${lines[n - 1].trim().slice(0, 140)}` });
      }
    }
  }
  return failures;
}
/** Every pinned exception line must still occur as a whole trimmed line, as often as it is listed. read(path) -> string | null. */
export function judgeStale(fx, read, only = null) {
  const failures = [];
  for (const x of fx.exceptions ?? []) {
    if (!Array.isArray(x.lines) || (only && !only.has(x.file))) continue;
    const text = read(x.file);
    if (text === null) { failures.push({ code: 'STALE', where: x.file, msg: 'an exception pins a file that does not exist' }); continue; }
    const have = new Map();
    for (const l of text.split('\n')) { const k = l.trim(); have.set(k, (have.get(k) ?? 0) + 1); }
    const want = new Map();
    for (const l of x.lines) want.set(l, (want.get(l) ?? 0) + 1);
    for (const [l, n] of want) if ((have.get(l) ?? 0) < n) failures.push({ code: 'STALE', where: x.file, msg: `exception line no longer occurs: ${JSON.stringify(l.slice(0, 150))}` });
  }
  return failures;
}

// ---- LOCALE ------------------------------------------------------------------------------------------------------------
/** added: [{ locale, key, value }] (keys the lane added); tokens: brand-locale-forms.json `tokens`. */
export function judgeLocaleForms(tokens, added) {
  const failures = [];
  for (const { locale, key, value } of added) {
    for (const [tok, def] of Object.entries(tokens ?? {})) {
      for (const form of [tok, ...(def?.variants ?? [])]) {
        const ascii = /^[\x00-\x7f]+$/.test(form);
        const hit = ascii ? new RegExp(`(?<![0-9A-Za-z])${esc(form)}(?![0-9A-Za-z])`).test(value) : value.includes(form);
        if (hit) failures.push({ code: 'LOCALE', where: `${locale}:${key}`, msg: `carries the declared brand form ${JSON.stringify(form)} (token ${tok})` });
      }
    }
  }
  return failures;
}

// ---- NOTICE ------------------------------------------------------------------------------------------------------------
/** files: paths relative to web/vendor/; licenses: the text of web/vendor/LICENSES.md (the rule of tools/notice-inventory.mjs). */
export function judgeNotices(licenses, files) {
  const canonical = (r) => path.posix.normalize(r.trim()).replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
  const named = new Set([...licenses.matchAll(/`([^`\n]+)`/g)].map((m) => canonical(m[1])));
  return files.filter((f) => f !== 'LICENSES.md' && !named.has(f))
    .map((f) => ({ code: 'NOTICE', where: `web/vendor/${f}`, msg: `not named in web/vendor/LICENSES.md by its full path (\`${f}\`)` }));
}

// ---- the working tree ----------------------------------------------------------------------------------------------------
function workingTree() {
  const changed = git(['diff', '--name-only', 'HEAD', '--']).split('\n').filter(Boolean);
  const untracked = git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
  const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return null; } };
  const headJson = (p) => { try { return JSON.parse(git(['show', `HEAD:${p}`])); } catch { return null; } };
  return { changed, untracked, read, headJson };
}

function main() {
  const { changed, untracked, read, headJson } = workingTree();
  const lane = [...new Set([...changed, ...untracked])].sort();
  const failures = [];
  const census = JSON.parse(read(CENSUS));
  const sites = censusSites(census);
  failures.push(...judgeCensus(sites, read));
  const brands = JSON.parse(read(BRANDS));
  failures.push(...judgeStale(brands, read));
  const scan = [];
  for (const p of lane.filter(shipped)) {
    const abs = path.join(ROOT, p);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    scan.push(TEXT_EXT.test(p) ? { path: p, text: fs.readFileSync(abs, 'utf8'), binary: false } : { path: p, text: fs.readFileSync(abs).toString('latin1'), binary: true });
  }
  failures.push(...judgeBrands(brands, scan));
  const added = [];
  for (const loc of LOCALES) {
    const p = `web/app/locales/${loc}.json`;
    const tip = JSON.parse(read(p)), base = headJson(p) ?? {};
    for (const [key, value] of Object.entries(tip)) if (!(key in base) && typeof value === 'string') added.push({ locale: loc, key, value });
  }
  failures.push(...judgeLocaleForms(JSON.parse(read(LOCALE_FORMS)).tokens, added));
  const cited = new Set(JSON.parse(read(PROVENANCE)).rows.flatMap((r) => (r.locs ?? []).map((l) => l[0])));
  for (const p of lane) if (cited.has(p)) failures.push({ code: 'CITED', where: p, msg: 'cited by line span in tools/fixtures/provenance-tags.json and changed by this lane: re-pin its spans' });
  const vendor = [...new Set([...git(['ls-files', '--', 'web/vendor']).split('\n'), ...untracked.filter((p) => p.startsWith('web/vendor/'))])]
    .filter((p) => p && fs.existsSync(path.join(ROOT, p))).map((p) => p.slice('web/vendor/'.length));
  failures.push(...judgeNotices(read('web/vendor/LICENSES.md'), vendor));

  for (const f of failures) process.stdout.write(`  FAIL ${f.code} ${f.where}: ${f.msg}\n`);
  process.stdout.write(`test-club-identity-gates: ${failures.length ? `${failures.length} FAILURE(S)` : 'OK'} — working tree, ${lane.length} lane paths (${changed.length} changed, ${untracked.length} new);`
    + ` census ${sites.length} call sites; brand rules over ${scan.length} shipped lane files (${scan.filter((f) => f.binary).length} binary);`
    + ` ${vendor.length} files under web/vendor/ against LICENSES.md;`
    + ` ${added.length} added locale values (${[...new Set(added.map((a) => a.key))].join(', ') || 'none'}); provenance spans cite ${cited.size} files, none of them a lane path${failures.some((f) => f.code === 'CITED') ? ' — NOT TRUE, see above' : ''}\n`);
  return failures.length ? 1 : 0;
}

// The spans carried through the line map are the COMMITTED fixture's (they describe HEAD's files); the working fixture may
// already hold an earlier re-pin, so a second run after a further edit of main.js or settings.js starts from HEAD again.
function repin(write) {
  const { read, headJson } = workingTree();
  let text = read(CENSUS);
  const census = JSON.parse(text);
  const headSites = censusSites(headJson(CENSUS) ?? {});
  const maps = new Map();
  const mapFor = (p) => { if (!maps.has(p)) maps.set(p, lineMap(git(['diff', '-U0', 'HEAD', '--', p]))); return maps.get(p); };
  let moved = 0, manual = 0;
  const seen = new Set();
  const sites = censusSites(census);
  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    const [p, start, end, token] = site;
    const key = JSON.stringify(site);
    if (seen.has(key)) continue;
    seen.add(key);
    // every span in a file the lane edited is carried through the map, also one that still happens to hold its anchor
    // (a long span one line off is green and wrong)
    const map = mapFor(p);
    const old = headSites[i] && headSites[i][0] === p && headSites[i][3] === token ? headSites[i] : site;
    const ns = map(old[1]), ne = map(old[2]);
    const holds = judgeCensus([site], read).length === 0;
    if (ns === start && ne === end && holds) continue;
    const good = ns !== null && ne !== null && judgeCensus([[p, ns, ne, token]], read).length === 0;
    if (!good) {
      if (holds) continue; // the span's own edge was rewritten but the anchor is still inside: leave it
      manual += 1; process.stdout.write(`  MANUAL ${p}:${start}-${end} ${JSON.stringify(token.slice(0, 70))} (the old span was rewritten, or the anchor left it)\n`); continue;
    }
    moved += 1;
    process.stdout.write(`  ${p}: ${start}-${end} -> ${ns}-${ne}  ${JSON.stringify(token.slice(0, 70))}\n`);
    const from = `[${JSON.stringify(p)}, ${start}, ${end}, ${JSON.stringify(token)}]`, to = `[${JSON.stringify(p)}, ${ns}, ${ne}, ${JSON.stringify(token)}]`;
    if (!text.includes(from)) { manual += 1; process.stdout.write('    (the fixture spells this row differently: edit it by hand)\n'); continue; }
    text = text.split(from).join(to);
  }
  if (write && moved) fs.writeFileSync(path.join(ROOT, CENSUS), text);
  process.stdout.write(`repin: ${moved} call site(s) moved, ${manual} need a hand${write ? (moved ? `; ${CENSUS} rewritten (line numbers only)` : '; nothing written') : '; dry run (add --write)'}\n`);
  return manual ? 1 : 0;
}

function selftest() {
  let ok = true;
  const arm = (name, want, failures) => {
    const codes = [...new Set(failures.map((f) => f.code))];
    const good = want === null ? failures.length === 0 : codes.length === 1 && codes[0] === want;
    ok &&= good;
    process.stdout.write(`${good ? 'ok  ' : 'FAIL'} ${name}: want ${want ?? 'no failure'}, got [${codes.join(', ')}]\n`);
  };
  const file = 'a\nb\nfunction anchor(x) {\nd\ne\n';
  const read = (p) => (p === 'f.js' ? file : null);
  arm('census control: the anchor is inside its span', null, judgeCensus([['f.js', 3, 4, 'function anchor(x)']], read));
  arm('census plant: a line inserted above moves the anchor out of its span', 'CENSUS', judgeCensus([['f.js', 3, 3, 'function anchor(x)']], (p) => (p === 'f.js' ? `new\n${file}` : null)));
  arm('census plant: the cited file is gone', 'CENSUS', judgeCensus([['gone.js', 1, 1, 'x']], read));
  // the line map: one line inserted after old line 2, old lines 5-6 rewritten as three lines
  const map = lineMap('@@ -2,0 +3 @@\n+x\n@@ -5,2 +6,3 @@\n-a\n-b\n+c\n+d\n+e\n');
  const mapped = [1, 2, 3, 4, 5, 6, 7].map(map);
  const mapOk = JSON.stringify(mapped) === JSON.stringify([1, 2, 4, 5, null, null, 9]);
  ok &&= mapOk;
  process.stdout.write(`${mapOk ? 'ok  ' : 'FAIL'} line map: insertions shift, rewritten lines do not map (${JSON.stringify(mapped)})\n`);
  const q = String.fromCharCode(39);
  const retired = `${q}s${'p'}${q}`; // the retired look id, quoted: spelled in pieces so this file never carries it
  const fx = { tokens: [{ id: 'look-id', rule: 'regex-cs', scope: 'text', pattern: `${q}sp${q}` }, { id: 'XX', rule: 'ascii-boundary-cs', form: 'XQ' }, { id: 'name', rule: 'regex-ci', pattern: 'acme[ ._-]*cue' }],
    non_brand_contexts: [{ id: 'spec', kind: 'following', pattern: '-(?:\\d|\\*)' }],
    exceptions: [{ file: 'a.js', tokens: ['look-id'], lines: [`if (v === ${retired}) v = 1;`] }] };
  arm('brand control: a pinned line, a declined context and clean text', null,
    judgeBrands(fx, [{ path: 'a.js', text: `  if (v === ${retired}) v = 1;\nconst id = "XQ-01";\nconst AXQ = 2;\n`, binary: false }]));
  arm('brand plant: the pinned line edited (an else in front of it)', 'BRAND',
    judgeBrands(fx, [{ path: 'a.js', text: `  } else if (v === ${retired}) v = 1;\n`, binary: false }]));
  arm('brand plant: a token in a new file', 'BRAND', judgeBrands(fx, [{ path: 'web/scene/club/x.js', text: '// like the Acme-Cue room\n', binary: false }]));
  arm('brand plant: a short initialism in text', 'BRAND', judgeBrands(fx, [{ path: 'b.js', text: 'the XQ look\n', binary: false }]));
  arm('brand control: a short initialism is not read in image bytes', null, judgeBrands(fx, [{ path: 'b.jpg', text: 'ÿ XQ þ', binary: true }]));
  arm('brand plant: a name in image bytes', 'BRAND', judgeBrands(fx, [{ path: 'b.jpg', text: 'ÿacme cueþ', binary: true }]));
  arm('stale control: the pinned line occurs', null, judgeStale(fx, (p) => (p === 'a.js' ? `x\n   if (v === ${retired}) v = 1;\n` : null)));
  arm('stale plant: the pinned line was edited', 'STALE', judgeStale(fx, (p) => (p === 'a.js' ? `x\n  } else if (v === ${retired}) v = 1;\n` : null)));
  const tokens = { Star: { variants: ['スター'] }, Acme: { variants: [] } };
  arm('locale control: Start is not Star', null, judgeLocaleForms(tokens, [{ locale: 'en', key: 'k', value: 'Start the Acmes room' }]));
  arm('locale plant: a declared Latin form', 'LOCALE', judgeLocaleForms(tokens, [{ locale: 'en', key: 'k', value: 'The Star room' }]));
  arm('locale plant: a declared kana form', 'LOCALE', judgeLocaleForms(tokens, [{ locale: 'ja', key: 'k', value: 'スタールーム' }]));
  const md = '- `three.module.min.js`\n- `jsm/postprocessing/Pass.js`, `./jsm/shaders/CopyShader.js`\nFull text: `LICENSE-three.txt`.\n';
  arm('notice control: every vendored file is named by its full path', null, judgeNotices(md, ['LICENSES.md', 'three.module.min.js', 'jsm/postprocessing/Pass.js', 'jsm/shaders/CopyShader.js', 'LICENSE-three.txt']));
  arm('notice plant: a new addon that LICENSES.md does not name', 'NOTICE', judgeNotices(md, ['three.module.min.js', 'jsm/postprocessing/GTAOPass.js']));
  arm('notice plant: a bare file name does not name a file in a subdirectory', 'NOTICE', judgeNotices(`${md}- \`GTAOPass.js\`\n`, ['jsm/postprocessing/GTAOPass.js']));
  process.stdout.write(`selftest: ${ok ? 'every plant caught, every control green' : 'a plant was missed or a control went red'}\n`);
  return ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  let rc = 2;
  try {
    if (argv.includes('--selftest')) rc = selftest();
    else if (argv.includes('--repin')) rc = repin(argv.includes('--write'));
    else rc = main();
  } catch (e) { process.stdout.write(`test-club-identity-gates: could not run — ${e.message}\n`); rc = 2; }
  process.exit(rc);
}
