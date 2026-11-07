// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-share-link-base.mjs — node unit gate for GH-1023: where a share link
// points. web/app/share.js minted every link on location.href, so inside the
// macOS/iOS shells (origin app://local) the copied link was
// app://local/app.html#r=…, which nothing outside the app can open. The fix
// keeps browser pages on their own address and moves shell links to the
// app-owned openbilliards://replay scheme (or to PUBLIC_SHARE_PAGE once a web
// build is published).
//
// share.js imports the wasm kernel and the DOM-bound settings module, so this
// gate lifts the marked block (`// GH-1023 share-base begin` … `end`)
// verbatim and evaluates it in a node:vm context, then checks:
//   B1  http(s) pages share their own address (fragment stripped);
//   B2  app://local (and any other non-http page) mints on openbilliards://replay;
//   B3  PUBLIC_SHARE_PAGE set → shell links use it, browser pages unchanged;
//   B4  the success toast says "opens in the app" for app links only;
//   B5  a link minted on app://local carries the #r= payload intact: the
//       share.js BOOT reader's own regex (the one that feeds decodeShare at
//       boot, read from share.js) extracts it from the link's fragment, and
//       the committed SDK decoder turns it into the corpus entry's recorded
//       game (legacy-links corpus, every entry);
//   B6  the minted app link matches the exact shape the shells accept
//       (ShellCore ReplayLink: openbilliards://replay#r=<b64url>[&cp=<b64url>]);
//   B7  the real call sites use the lifted helpers: buildShareUrl mints on
//       shareBase(location.href) (never on location.href directly) and the
//       Share button's success toast comes from copiedToastKey — a revert
//       at a call site goes red even with the helper block intact;
//   B8  the export card's link note (web/app/playback.js, its own marked
//       `// GH-1023 link-note` block) follows the minted link: an app link
//       says it opens with the OpenBilliards app (playback.linkNoteApp, all
//       7 locales), an http(s) link keeps "anyone can re-open"
//       (playback.linkNote), and the card's note takes its key from
//       linkNoteKey — never a hard-coded playback.linkNote;
//   B9  the export card SHOWS the link compact (owner, card 39 v2): the same
//       block's compactLink keeps where the link points (the app scheme, or a
//       web page's host and file) plus the payload's head…tail, and the card
//       shows only that while the shown text's tooltip, the visually-hidden
//       twin, Copy and a selection copy inside the link carry the FULL link —
//       copying the shown text goes red.
// Dependency-free ESM; exit 1 on any FAIL.
//
//   node web/tools/test-share-link-base.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '..');
const shareSrc = fs.readFileSync(path.join(webDir, 'app', 'share.js'), 'utf8');

let fails = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) fails += 1;
};

const BEGIN = '// GH-1023 share-base begin';
const END = '// GH-1023 share-base end';
const b = shareSrc.indexOf(BEGIN);
const e = shareSrc.indexOf(END);
if (b < 0 || e < b) {
  console.log('FAIL share.js carries no GH-1023 share-base block (markers missing)');
  process.exit(1);
}
const block = shareSrc.slice(b, e);

/** Evaluate the lifted block, optionally with PUBLIC_SHARE_PAGE replaced. */
function lift(publicPage) {
  let src = block;
  if (publicPage !== undefined) {
    const decl = 'const PUBLIC_SHARE_PAGE = null;';
    if (!src.includes(decl)) throw new Error(`block lacks "${decl}"`);
    src = src.replace(decl, `const PUBLIC_SHARE_PAGE = ${JSON.stringify(publicPage)};`);
  }
  const sandbox = {};
  vm.runInNewContext(`${src}\nthis.api = { shareBase, copiedToastKey, APP_SHARE_BASE };`, sandbox);
  return sandbox.api;
}

const api = lift();

// B1 — browser pages keep their own address
for (const [href, want] of [
  ['https://example.org/openbilliards/web/app.html', 'https://example.org/openbilliards/web/app.html'],
  ['https://example.org/web/app.html#r=OLD&cp=X', 'https://example.org/web/app.html'],
  ['http://127.0.0.1:8080/web/app.html?obtool=1#r=OLD', 'http://127.0.0.1:8080/web/app.html?obtool=1'],
  ['HTTPS://Example.org/app.html', 'HTTPS://Example.org/app.html'],
]) {
  ok(api.shareBase(href) === want, `B1 ${href} -> ${api.shareBase(href)}`);
}

// B2 — shell (and any non-http) pages mint on the app scheme
ok(api.APP_SHARE_BASE === 'openbilliards://replay', `B2 app base is openbilliards://replay (${api.APP_SHARE_BASE})`);
for (const href of ['app://local/app.html', 'app://local/app.html#r=OLD',
  'app://local/app.html?obtool', 'file:///Users/example/web/app.html', 'about:blank']) {
  ok(api.shareBase(href) === 'openbilliards://replay', `B2 ${href} -> ${api.shareBase(href)}`);
}
ok(!api.shareBase('app://local/app.html').startsWith('app:'), 'B2 a shell link never keeps the app:// origin');

// B3 — the one-constant switch to a published web build
const PUB = 'https://example.org/openbilliards/web/app.html';
const pub = lift(PUB);
ok(pub.shareBase('app://local/app.html') === PUB, `B3 shell page -> ${pub.shareBase('app://local/app.html')}`);
ok(pub.shareBase('https://mirror.example/app.html#r=1') === 'https://mirror.example/app.html',
  'B3 browser pages still share their own address');

// B4 — toast copy: app links say they open in the app; https links unchanged
ok(api.copiedToastKey('openbilliards://replay#r=AAA', false) === 'share.copiedApp', 'B4 app link -> share.copiedApp');
ok(api.copiedToastKey('openbilliards://replay#r=AAA&cp=BB', true) === 'share.copiedAppNoPlan', 'B4 app link, plan dropped -> share.copiedAppNoPlan');
ok(api.copiedToastKey('https://example.org/app.html#r=AAA', false) === 'share.copied', 'B4 https link -> share.copied');
ok(api.copiedToastKey('https://example.org/app.html#r=AAA', true) === 'share.copiedNoPlan', 'B4 https link, plan dropped -> share.copiedNoPlan');
ok(pub.copiedToastKey(`${PUB}#r=AAA`, false) === 'share.copied', 'B4 with a public page the shell toast is the plain one');
const locales = fs.readdirSync(path.join(webDir, 'app', 'locales')).filter((f) => f.endsWith('.json'));
ok(locales.length === 7, `B4 7 locale files (${locales.length})`);
for (const f of locales) {
  const d = JSON.parse(fs.readFileSync(path.join(webDir, 'app', 'locales', f), 'utf8'));
  ok(typeof d['share.copiedApp'] === 'string' && d['share.copiedApp'].includes('OpenBilliards')
    && typeof d['share.copiedAppNoPlan'] === 'string' && d['share.copiedAppNoPlan'].includes('OpenBilliards'),
  `B4 ${f} carries share.copiedApp/share.copiedAppNoPlan naming the app`);
}

// B5 — the payload survives the app link (share.js boot reader + SDK decoder)
const bootSrc = /let pendingHash = null;\s*const m = (\/[^\n]*?\/)\.exec\(location\.hash\);/.exec(shareSrc);
ok(!!bootSrc, 'B5 share.js boot reader regex found (pendingHash)');
const hashRe = bootSrc ? new RegExp(bootSrc[1].slice(1, -1)) : /$^/;
const { decodeShare } = await import(pathToFileURL(path.join(webDir, 'dist', 'pool-sdk', 'share.js')).href);
const corpus = JSON.parse(fs.readFileSync(path.join(webDir, 'tools', 'fixtures', 'legacy-links.json'), 'utf8'));
// B6 — the exact shape ShellCore ReplayLink accepts
const SHELL_SHAPE = /^openbilliards:\/\/replay#r=[A-Za-z0-9_-]+(&cp=[A-Za-z0-9_-]+)?$/;
for (const entry of corpus.entries) {
  const link = `${api.shareBase('app://local/app.html')}#r=${entry.share}`;
  const u = new URL(link);
  const r = hashRe.exec(u.hash)?.[1] ?? null;
  ok(r === entry.share, `B5 ${entry.name}: #r= extracted intact from ${u.protocol}//${u.host}`);
  let decoded = null;
  try { decoded = await decodeShare(r ?? ''); } catch (err) { decoded = { error: String(err?.message ?? err) }; }
  const want = entry.decoded;
  const same = decoded && !decoded.error && Object.keys(want).every((k) => JSON.stringify(decoded[k]) === JSON.stringify(want[k]));
  ok(same, `B5 ${entry.name}: the link's payload decodes to the corpus entry's recorded game`);
  ok(SHELL_SHAPE.test(link) && SHELL_SHAPE.test(`${link}&cp=AbC-_9`), `B6 ${entry.name}: link matches the shell-accepted shape`);
}

// B7 — the real call sites use the helpers (a call-site revert goes red)
const outside = shareSrc.slice(0, b) + shareSrc.slice(e);
const mint = /async function buildShareUrl\(\) \{[\s\S]*?\n  \}\n/.exec(outside)?.[0] ?? '';
ok(mint.length > 0, 'B7 buildShareUrl found');
ok(/const base = shareBase\(location\.href\);/.test(mint), 'B7 buildShareUrl mints on shareBase(location.href)');
ok(!/location\.href\.split\(/.test(mint), 'B7 buildShareUrl never derives its base from location.href directly');
ok(/showToast\(t\(copiedToastKey\(url, planDropped\)\)\)/.test(outside), 'B7 the Share button success toast comes from copiedToastKey');
const code = outside.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
ok(!/['"]share\.copied(NoPlan)?['"]/.test(code), 'B7 no hard-coded share.copied / share.copiedNoPlan key outside the helper block');

// B8 — the export card's link note follows the minted link
const pbSrc = fs.readFileSync(path.join(webDir, 'app', 'playback.js'), 'utf8');
const NB = '// GH-1023 link-note begin';
const NE = '// GH-1023 link-note end';
const nb = pbSrc.indexOf(NB);
const ne = pbSrc.indexOf(NE);
ok(nb >= 0 && ne > nb, 'B8 playback.js carries the GH-1023 link-note block');
const note = {};
if (nb >= 0 && ne > nb) {
  vm.runInNewContext(`${pbSrc.slice(nb, ne)}\nthis.linkNoteKey = linkNoteKey; this.compactLink = typeof compactLink === 'function' ? compactLink : null;`, note);
}
const noteKey = note.linkNoteKey ?? (() => null);
const shellLink = `${api.shareBase('app://local/app.html')}#r=AAA`;
const pageLink = `${api.shareBase('https://example.org/web/app.html#r=OLD')}#r=AAA`;
ok(noteKey(shellLink) === 'playback.linkNoteApp', `B8 shell link ${shellLink} -> ${noteKey(shellLink)}`);
ok(noteKey(`${shellLink}&cp=BB`) === 'playback.linkNoteApp', 'B8 shell link with a camera plan -> playback.linkNoteApp');
ok(noteKey(pageLink) === 'playback.linkNote', `B8 browser link ${pageLink} -> ${noteKey(pageLink)}`);
ok(noteKey('http://127.0.0.1:8080/web/app.html#r=AAA') === 'playback.linkNote', 'B8 http link -> playback.linkNote');
ok(noteKey(`${pub.shareBase('app://local/app.html')}#r=AAA`) === 'playback.linkNote',
  'B8 with a public page the shell note is the plain one');
for (const f of locales) {
  const d = JSON.parse(fs.readFileSync(path.join(webDir, 'app', 'locales', f), 'utf8'));
  ok(typeof d['playback.linkNoteApp'] === 'string' && d['playback.linkNoteApp'].includes('OpenBilliards')
    && typeof d['playback.linkNote'] === 'string' && !d['playback.linkNote'].includes('OpenBilliards'),
  `B8 ${f} carries playback.linkNoteApp naming the app beside the plain playback.linkNote`);
}
const pbOutside = nb >= 0 && ne > nb ? pbSrc.slice(0, nb) + pbSrc.slice(ne) : pbSrc;
ok(/noteEl\.dataset\.i18n = linkNoteKey\(fullLink\);/.test(pbOutside),
  'B8 the export card note takes its key from linkNoteKey(the minted link)');
const pbCode = pbOutside.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
ok(!/['"]playback\.linkNote['"]/.test(pbCode), 'B8 no hard-coded playback.linkNote key outside the link-note block');

// B9 — the link is SHOWN compact; everything else carries the full link
const compact = note.compactLink ?? (() => null);
ok(typeof note.compactLink === 'function', 'B9 the link-note block carries compactLink');
const appFull = 'openbilliards://replay#r=VY5BCsMgFETv8rf9ka_BIJxFREy0RRAVFXL9aqCFMpt5bzajngjEOKOHo030h5SAkELygBwVlJyjKTWb_dXHcOOVa-veme5vr2rdJmerG_xXa05vb6q3MbQeTtColGACOVsl0oyearaF2LZKlj7MfcAcNkZANfAqdtl_SMj1Bw';
ok(compact(appFull) === 'openbilliards://replay#r=VY5B…SMj1Bw', `B9 app link -> ${compact(appFull)}`);
ok(compact(`${appFull}&cp=QUJD-_xyz123`) === 'openbilliards://replay#r=VY5B…xyz123', 'B9 app link with a camera plan keeps the head and the plan\'s tail');
ok(compact('http://127.0.0.1:8080/app.html?seed=1&archive=1&obtool=1#r=VY5BCsMgEExvMttOZDSYkrPIICbal5TQskf')
  === '127.0.0.1:8080/app.html#r=VY5B…5TQskf', 'B9 a web link shows host + file, never the query');
ok(compact('https://example.org/openbilliards/web/app.html#r=VY5BCsMgEExvMttOZDSYkrPIICbal5TQskf')
  === 'example.org/…/app.html#r=VY5B…5TQskf', 'B9 a nested web path collapses to host/…/file');
ok(compact('openbilliards://replay#r=AAAA') === 'openbilliards://replay#r=AAAA', 'B9 a short link is shown whole');
ok(String(compact(appFull)).length <= 40 && String(compact(`https://example.org/a/b/app.html#r=${'A'.repeat(600)}`)).length <= 44,
  'B9 the shown link stays short (<= 40 app, <= 44 web) whatever the payload length');
ok(/urlShown\.textContent = compactLink\(fullLink\);/.test(pbOutside), 'B9 the card shows compactLink(the full link)');
ok(/urlShown\.setAttribute\('aria-hidden', 'true'\);/.test(pbOutside), 'B9 the shown (compact) text is hidden from assistive tech');
ok(/urlFull\.textContent = fullLink;/.test(pbOutside) && /urlFull\.className = 'ob-pb-lurl-full';/.test(pbOutside),
  'B9 the visually-hidden twin carries the full link');
ok(/urlShown\.title = fullLink;/.test(pbOutside) && !/\burl\.title = /.test(pbOutside),
  'B9 the tooltip carries the full link on the aria-hidden shown span (never on the twin\'s parent: read twice)');
ok(/url\.addEventListener\('copy'[\s\S]{0,400}?setData\('text\/plain', fullLink\)/.test(pbOutside),
  'B9 a selection copy inside the link writes the full link');
ok(/navigator\.clipboard\.writeText\(fullLink\)/.test(pbOutside)
  && !/navigator\.clipboard\.writeText\((url|urlShown)\.textContent\)/.test(pbOutside),
  'B9 Copy writes the FULL link, never the shown text');
const pbCss = fs.readFileSync(path.join(webDir, 'app', 'ui', 'playback.css'), 'utf8');
ok(/\.ob-pb-lurl-full\s*\{[^}]*clip-path:\s*inset\(50%\)/.test(pbCss), 'B9 playback.css hides the full twin visually (sr-only recipe), not from assistive tech');
ok(/\.ob-pb-lurl-shown\s*\{[^}]*-webkit-line-clamp:\s*2/.test(pbCss), 'B9 the shown link is capped at two lines');

console.log(fails ? `share-link-base: ${fails} FAIL` : 'share-link-base: OK');
process.exit(fails ? 1 : 0);
