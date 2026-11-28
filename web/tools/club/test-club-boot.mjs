// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-boot.mjs — node arm for the flip OUTSIDE the leaf: what a boot shows (main.js's boot rules, run as TEXT),
// the literal copy of the leaf's tier rule against tiers.js, the per-device verdict (the pace arithmetic, the failure
// policy over boots, a new app version, corrupt records), the boot wiring (reads and writes of storage, the hand-over),
// the reason of the stage's bound (a fetch while the network still owes the hall something, a timeout only after that),
// the settings seams (the sanitizer, the reload offer, the picker, the seven locales), the bug report's two facts, and
// the test launcher's old-room pin (the seed text of web/tools/cdp.mjs run against main.js's own lines).
// Every rule has a PLANT: the same assertions over a mutated copy of the text must fail (a test that cannot fail is
// not a test). No packages, no git, no browser. Run: node web/tools/club/test-club-boot.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as leafTiers from '../../scene/club/tiers.js';

const app = new URL('../../app/', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, app), 'utf8');
const main = read('main.js'), settings = read('settings.js'), bug = read('bugreport.js');
const tiersText = fs.readFileSync(new URL('../../scene/club/tiers.js', import.meta.url), 'utf8');
const LOCALES = ['en', 'de', 'fr', 'es', 'ja', 'ko', 'zh-CN'];

let n = 0, plants = 0;
// A red run says why in its LAST lines (the lane's arm runner shows a red arm's last three): the arm that threw and its
// message, flattened, after node's own stack.
let thrown = null;
const sayWhy = (e) => {
  console.log(String(e?.stack ?? e));
  const at = String(e?.stack ?? '').split('\n').find((l) => /test-club-[a-z-]+\.mjs:\d+/.test(l))?.trim() ?? '';
  const line = `${thrown?.e === e ? thrown.what : 'outside an arm'}: ${String(e?.message ?? e).replace(/\s+/g, ' ')} ${at}`;
  for (let i = 0; i < 3; i++) console.log(`FAIL ${i + 1}/3 ${line.slice(i * 270, (i + 1) * 270) || '.'}`);
  process.exit(1);
};
process.on('uncaughtException', sayWhy); process.on('unhandledRejection', sayWhy);
const ok = async (name, fn) => { try { await fn(); } catch (e) { thrown = { what: `arm "${name}"`, e }; throw e; } n += 1; console.log(`OK ${name}`); };
/** A plant: `check` must throw an assertion over the mutated text (and the mutation must have changed the text). */
const plant = async (name, text, mutate, check) => {
  try {
    const bad = mutate(text);
    assert.notEqual(bad, text, `plant "${name}": the mutation did not apply (the text it replaces is gone)`);
    let caught = null;
    try { await check(bad); } catch (e) { caught = e; }
    assert.ok(caught, `plant "${name}": the mutated text still passes: the rule is not tested`);
    assert.ok(caught instanceof assert.AssertionError, `plant "${name}": died of ${caught && caught.stack}, not of an assertion`);
    plants += 1;
  } catch (e) { thrown = { what: `plant "${name}"`, e }; throw e; }
};
const swap = (a, b) => (text) => { assert.ok(text.includes(a), `plant text missing: ${a}`); return text.replace(a, b); };
/** The text of a braced block that opens at the first `{` at or after `at`. */
const braced = (text, at) => {
  let depth = 0;
  for (let i = text.indexOf('{', at); i >= 0 && i < text.length; i++) {
    if (text[i] === '{') depth += 1; else if (text[i] === '}') { depth -= 1; if (depth === 0) return text.slice(at, i + 1); }
  }
  throw new Error('unbalanced block');
};
/** The text of `function name(...) { ... }` (the parameter list may hold braces: its end is found by its parentheses). */
const fnText = (text, name) => {
  const at = text.search(new RegExp(`(?:export )?function ${name}\\(`));
  assert.ok(at >= 0, `no function ${name}`);
  let depth = 0, close = -1;
  for (let i = text.indexOf('(', at); i < text.length; i++) {
    if (text[i] === '(') depth += 1; else if (text[i] === ')') { depth -= 1; if (depth === 0) { close = i; break; } }
  }
  assert.ok(close > at, `the parameter list of ${name}`);
  return text.slice(at, close) + braced(text, close);
};
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

// ---- main.js's boot rules, as text ------------------------------------------------------------------------------------
const MARK_A = '// >>> LOOK-BOOT-RULES', MARK_B = '// <<< LOOK-BOOT-RULES', MARK_END = '// Boot LIGHTING';
const rFrom = main.indexOf(MARK_A), rTo = main.indexOf(MARK_B), wTo = main.indexOf(MARK_END);
assert.ok(rFrom > 0 && rTo > rFrom && wTo > rTo, 'main.js: the rules sit between their two marks, above the boot lighting block');
assert.equal(main.split(MARK_A).length, 2, 'one opening mark'); assert.equal(main.split(MARK_B).length, 2, 'one closing mark');
const RULES = main.slice(rFrom, rTo), WIRING = main.slice(rTo, wTo);
const NAMES = ['SOFTWARE_GL', 'TOUCH_OS', 'deviceFacts', 'autoTier', 'LOOK_PACE', 'LOOK_SLOW_AFTER_PASS', 'LOOK_TRIES', 'LOOK_FETCH_WAIT_MS',
  'lookRecord', 'lookFresh', 'lookRung', 'lookFreshRung', 'lookRungOf', 'LOOK_PACE_WHYS', 'LOOK_CARRY_MS', 'lookDecide', 'lookJudgePace', 'lookPaceNumbers', 'lookAfterPace', 'lookFailClass', 'lookAfterFailed', 'LOOK_ANEW_WHYS', 'lookAnew'];
const load = (text) => new Function(`'use strict';\n${text}\n; return { ${NAMES.join(', ')} };`)();
const R = load(RULES);

const PASS = Object.freeze({ coarse: false, touchPoints: 0, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36', platform: 'Linux x86_64', memoryGB: 8, maxTextureSize: 16384, webgl2: true, floatBuffers: true, gpu: 'ANGLE (NVIDIA, a hardware GPU)' });
const LITE = Object.freeze({ ...PASS, gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' });
const APP = '0.1.0+kernel|htmlid|1';
const ONLINE = Object.freeze({ online: true, scheme: 'http:' }), NO_NET = Symbol('the caller hands no network input');
/**
 * One decision, with a count of what it read: { d, reads: { stored, facts, record }, netReads }.
 * `net`: what the page reads of its network state ({ online, scheme }); NO_NET = the caller hands no such input.
 */
const decide = (rules, query, { stored, scripted = false, facts = PASS, record = null, app: version = APP, now = 1e12, net = ONLINE } = {}) => {
  const reads = { stored: 0, facts: 0, record: 0 };
  let netReads = 0;
  const d = rules.lookDecide({ bootQ: new URLSearchParams(query), scripted,
    stored: () => { reads.stored += 1; return stored; }, facts: () => { reads.facts += 1; return facts; },
    ...(net === NO_NET ? null : { net: () => { netReads += 1; return net; } }),
    record: () => { reads.record += 1; return typeof record === 'string' || record === null ? record : JSON.stringify(record); }, app: version, now });
  return { d, reads, netReads };
};
const want = (rules, query, opts, expect, reads, label) => {
  const got = decide(rules, query, opts);
  assert.deepEqual(got.d, expect, `${label ?? `?${query}`}: the decision`);
  if (reads) assert.deepEqual(got.reads, reads, `${label ?? `?${query}`}: what the decision read (stored look, device facts, verdict record)`);
};
const out = (asked, shown, flow, tier, why) => ({ asked, shown, flow, tier, why });
const NONE = { stored: 0, facts: 0, record: 0 };
const OLD = (version = APP) => ({ v: 1, app: version, verdict: 'old', why: 'pace-median', at: 5, passed: false, slow: 1, fails: { fetch: 0, build: 0, timeout: 0 }, failAt: null, reason: null, pace: null });
// Step 2, the light rung. `light`: a decision that shows THE LIGHT HALL (the stage flow, `rung: 'lite'`; `tier` stays the
// device's own). OLD() above is a step-1 record of a device the STANDARD hall is too slow for: the light hall is its
// row now. OLD2: condemned on both rungs, the old room.
const light = (asked, why = 'light-new', tier = 'base') => ({ ...out(asked, 'hall', 'stage', tier, why), rung: 'lite' });
const OLD2 = (version = APP) => ({ ...OLD(version), lite: { verdict: 'old', why: 'pace-median', at: 6, passed: false, slow: 1, fails: { fetch: 0, build: 0, timeout: 0 }, failAt: null, reason: null, pace: null } });

// ---- 1. the id table ---------------------------------------------------------------------------------------------------
const table = (rules) => {
  for (const scripted of [false, true]) for (const facts of [PASS, LITE]) for (const stored of [undefined, 'green', 'club', 'arena', 'tournament']) {
    const o = { stored, scripted, facts, record: OLD() }, tag = ` (${scripted ? 'scripted' : 'real-user'}, ${facts === PASS ? 'passing' : 'lite'}, stored ${stored})`;
    // URL rows that read nothing: they win over the boot kind, the stored value, the tier and the verdict
    want(rules, 'look=green', o, out('url:green', 'green', 'none', null, 'url-green'), NONE, `?look=green${tag}`);
    want(rules, 'look=sp', o, out('url:sp', 'old', 'none', null, 'url-legacy'), NONE, `?look=sp${tag}`);
    want(rules, 'look=tournament-legacy', o, out('url:tournament-legacy', 'old', 'none', null, 'url-legacy'), NONE, `?look=tournament-legacy${tag}`);
    want(rules, 'look=arena', o, out('url:arena', 'hall', 'curtain', null, 'url-arena'), NONE, `?look=arena${tag}`);
    want(rules, 'look=arena&clubtier=lite', o, out('url:arena', 'hall', 'curtain', null, 'url-arena'), NONE, `?look=arena&clubtier=lite${tag}: the forced tier only picks the hall's tier`);
    want(rules, 'look=club', o, out('url:club', 'club', 'curtain', null, 'url-club'), NONE, `?look=club${tag}`);
    // a SCRIPTED boot that names the tournament grade keeps it: the old room on every device, nothing read
    if (scripted) for (const q of ['look=tournament', 'look=tournament&clubtier=base', 'look=tournament&clubtier=high']) want(rules, q, o, out('url:tournament', 'old', 'none', null, 'url-scripted'), NONE, `?${q}${tag}`);
  }
  // URL tournament on a REAL-USER boot: Tournament, by the stage flow; the stored look is not read
  want(rules, 'look=tournament', { stored: 'green' }, out('url:tournament', 'hall', 'stage', 'base', 'pass-new'), { stored: 0, facts: 1, record: 1 });
  want(rules, 'look=tournament', { facts: LITE, record: OLD() }, out('url:tournament', 'old', 'none', 'lite', 'tier-lite'), { stored: 0, facts: 1, record: 0 }, '?look=tournament on a lite device: the record is not even read');
  // the hall is never shown by the curtain flow except for the URL value arena; the stage flow is never a scripted boot's
  for (const scripted of [false, true]) for (const facts of [PASS, LITE]) for (const stored of [undefined, 'green', 'club', 'arena', 'tournament']) for (const q of ['', 'look=tournament', 'look=arena', 'look=club', 'look=green', 'clubtier=base', 'look=tournament&clubtier=high']) {
    const d = decide(rules, q, { stored, scripted, facts }).d;
    if (d.shown === 'hall' && d.flow === 'curtain') assert.equal(d.asked, 'url:arena', `the curtain hall of ?${q}`);
    if (d.flow === 'stage') assert.ok(!scripted && d.shown === 'hall', `the stage flow of ?${q}`);
    if (scripted && d.shown === 'hall') assert.equal(q, 'look=arena', 'a scripted boot reaches the hall by the URL value arena only');
  }
  // no URL value, scripted: green, and the profile is not read
  for (const stored of [undefined, 'arena', 'club', 'tournament', 'green']) want(rules, '', { stored, scripted: true }, out('scripted', 'green', 'none', null, 'scripted'), NONE, `scripted, stored ${stored}`);
  want(rules, 'look=ARENA', { stored: 'club', scripted: true }, out('scripted', 'green', 'none', null, 'scripted'), NONE, 'an unknown URL value is no value (scripted)');
  // stored green / club: as before, on every tier
  for (const facts of [PASS, LITE]) {
    want(rules, '', { stored: 'green', facts }, out('stored:green', 'green', 'none', null, 'stored-green'), { stored: 1, facts: 0, record: 0 });
    want(rules, '', { stored: 'club', facts }, out('stored:club', 'club', 'curtain', null, 'stored-club'), { stored: 1, facts: 0, record: 0 });
  }
  // stored tournament, arena, nothing, unreadable, anything else: Tournament
  for (const [stored, asked] of [['tournament', 'stored:tournament'], ['arena', 'stored:arena'], [undefined, 'default'], [null, 'default'], ['sp', 'default'], ['tournament-legacy', 'default'], ['ARENA', 'default'], [42, 'default']]) {
    want(rules, '', { stored }, out(asked, 'hall', 'stage', 'base', 'pass-new'), { stored: 1, facts: 1, record: 1 }, `stored ${stored}, passing`);
    want(rules, '', { stored, facts: LITE }, out(asked, 'old', 'none', 'lite', 'tier-lite'), { stored: 1, facts: 1, record: 0 }, `stored ${stored}, lite`);
    want(rules, 'look=arena2', { stored }, out(asked, 'hall', 'stage', 'base', 'pass-new'), null, `an unknown URL value falls through to stored ${stored}`);
    want(rules, 'look=', { stored, facts: LITE }, out(asked, 'old', 'none', 'lite', 'tier-lite'), null, `an empty URL value falls through to stored ${stored}`);
  }
  // the leaf's tier switch counts: base and high pass, lite fails, anything else is the facts' rule; a forced tier reads no fact
  want(rules, 'clubtier=base', { facts: LITE }, out('default', 'hall', 'stage', 'base', 'pass-new'), { stored: 1, facts: 0, record: 1 });
  want(rules, 'look=tournament&clubtier=high', { facts: LITE }, out('url:tournament', 'hall', 'stage', 'high', 'pass-new'), { stored: 0, facts: 0, record: 1 });
  want(rules, 'clubtier=lite', { facts: PASS, stored: 'tournament' }, out('stored:tournament', 'old', 'none', 'lite', 'tier-lite'), { stored: 1, facts: 0, record: 0 });
  want(rules, 'clubtier=ultra', { facts: PASS }, out('default', 'hall', 'stage', 'base', 'pass-new'), { stored: 1, facts: 1, record: 1 });
  want(rules, 'clubtier=ultra', { facts: LITE }, out('default', 'old', 'none', 'lite', 'tier-lite'), { stored: 1, facts: 1, record: 0 });
  want(rules, 'clubtier=base', { facts: LITE, stored: 'green' }, out('stored:green', 'green', 'none', null, 'stored-green'), null, 'a forced tier does not make green Tournament');
};
await ok('the id table: every row of the table through lookDecide (main.js as text), with what each row reads', () => table(R));
await plant('the legacy URL value shows the hall', RULES, swap("if (asked === 'tournament-legacy') return out('url:tournament-legacy', 'old', 'none', null, 'url-legacy');", ''), (t) => table(load(t)));
await plant('a scripted boot that names the tournament grade shows the hall', RULES, swap("scripted ? out('url:tournament', 'old', 'none', null, 'url-scripted') : tournament('url:tournament')", "tournament('url:tournament')"), (t) => table(load(t)));
await plant('a lite device gets the hall', RULES, swap("if (tier === 'lite') return out(asked, 'old', 'none', tier, 'tier-lite');", ''), (t) => table(load(t)));
await plant('a scripted default boot reads the profile', RULES, swap("if (scripted) return out('scripted', 'green', 'none', null, 'scripted');", ''), (t) => table(load(t)));
await plant('a stored club is Tournament', RULES, swap("if (look === 'club') return out('stored:club', 'club', 'curtain', null, 'stored-club');", ''), (t) => table(load(t)));
await plant('the arena URL value is judged by tier', RULES, swap("if (asked === 'arena') return out('url:arena', 'hall', 'curtain', null, 'url-arena');", "if (asked === 'arena') return tournament('url:arena');"), (t) => table(load(t)));
await plant('the tier switch is ignored', RULES, swap("const forced = bootQ.get('clubtier');", 'const forced = null;'), (t) => table(load(t)));

// ---- 1b. the offline row: a passing device that is offline at boot keeps the old room ----
// The hall's files are not in the service worker's precache, so a page served over http(s) would fetch them. Only such a
// page: the native shells serve the app from their bundle under their own scheme (`app:`) and show the hall offline.
const OFF = Object.freeze({ online: false, scheme: 'http:' }), SHELL_OFF = Object.freeze({ online: false, scheme: 'app:' });
const HALL_REC = { ...OLD(), verdict: 'hall', why: 'pace-ok', passed: true };
const offlineRows = (rules) => {
  const off = (asked, tier = 'base') => out(asked, 'old', 'none', tier, 'offline');
  // Tournament on a passing device, offline, over http(s): the old room at once; the stored look and the facts are read
  // as on any Tournament row, the network state once, the record NOT (nothing is read, cleared or announced)
  for (const scheme of ['http:', 'https:', 'HTTPS:']) {
    const net = { online: false, scheme };
    const o = (extra) => ({ net, ...extra });
    let got = decide(rules, '', o());
    assert.deepEqual([got.d, got.reads, got.netReads], [off('default'), { stored: 1, facts: 1, record: 0 }, 1], `offline over ${scheme}, nothing stored: the old room, the record not read`);
    for (const [stored, asked] of [['tournament', 'stored:tournament'], ['arena', 'stored:arena'], [undefined, 'default'], ['sp', 'default']]) {
      for (const record of [null, OLD(), OLD2(), HALL_REC, { ...OLD(), why: 'pin' }, { ...OLD(), why: 'build' }, '{corrupt']) {
        got = decide(rules, '', o({ stored, record }));
        assert.deepEqual([got.d, got.reads.record], [off(asked), 0], `offline, stored ${stored}, record ${JSON.stringify(record).slice(0, 40)}: the old room whatever is stored, and the record is not read`);
      }
    }
    got = decide(rules, 'look=tournament', o({ stored: 'green' }));
    assert.deepEqual([got.d, got.reads, got.netReads], [off('url:tournament'), { stored: 0, facts: 1, record: 0 }, 1], 'offline, the URL value tournament on a real-user boot');
    // a forced passing tier is a passing tier; the fact names it
    assert.deepEqual(decide(rules, 'clubtier=base', o({ facts: LITE })).d, off('default', 'base'));
    assert.deepEqual(decide(rules, 'look=tournament&clubtier=high', o({ facts: LITE })).d, off('url:tournament', 'high'));
    // a lite device keeps the old room by its tier, as before: its fact does not move and the network state is not read
    for (const [query, facts] of [['', LITE], ['clubtier=lite', PASS], ['look=tournament', LITE]]) {
      got = decide(rules, query, o({ facts, record: OLD() }));
      assert.deepEqual([got.d.shown, got.d.why, got.netReads, got.reads.record], ['old', 'tier-lite', 0, 0], `offline on a lite device (?${query}): tier-lite, as online`);
    }
    // every row that never reaches Tournament is what it is online, and reads no network state
    for (const scripted of [false, true]) for (const stored of [undefined, 'green', 'club', 'arena', 'tournament']) for (const facts of [PASS, LITE]) {
      for (const query of ['look=green', 'look=sp', 'look=tournament-legacy', 'look=arena', 'look=arena&clubtier=base', 'look=club', ...(scripted ? ['', 'look=tournament', 'look=tournament&clubtier=base', 'clubtier=high'] : [])]) {
        const here = decide(rules, query, o({ stored, scripted, facts, record: OLD() })), online = decide(rules, query, { stored, scripted, facts, record: OLD() });
        assert.deepEqual([here.d, here.reads, here.netReads], [online.d, online.reads, 0], `offline, ?${query} (${scripted ? 'scripted' : 'real-user'}, stored ${stored}): as online, the network state not read`);
        assert.notEqual(here.d.why, 'offline');
      }
      if (!scripted && (stored === 'green' || stored === 'club')) {
        const here = decide(rules, '', o({ stored, facts })), online = decide(rules, '', { stored, facts });
        assert.deepEqual([here.d, here.netReads], [online.d, 0], `offline, a stored ${stored}: as online`);
      }
    }
    assert.deepEqual(decide(rules, 'look=arena', o()).d, out('url:arena', 'hall', 'curtain', null, 'url-arena'), 'offline, ?look=arena: the tool value asks for the hall as it does online (its import then fails and the old room stays: the curtain flow\'s own rule)');
  }
  // ONLY a page served over http(s): a shell's scheme with navigator.onLine false still gives the hall on a passing tier
  for (const scheme of ['app:', 'APP:', 'file:', 'capacitor:', 'chrome-extension:', '', null, undefined, 7, 'httpx:', 'xhttp:', 'http', 'https://']) {
    const got = decide(rules, '', { net: { online: false, scheme }, stored: 'tournament' });
    assert.deepEqual([got.d, got.reads, got.netReads], [out('stored:tournament', 'hall', 'stage', 'base', 'pass-new'), { stored: 1, facts: 1, record: 1 }, 1], `offline under the scheme ${String(scheme)}: the hall (the app does not come over the network there)`);
  }
  assert.deepEqual(decide(rules, '', { net: SHELL_OFF, record: OLD2() }).d, out('default', 'old', 'none', 'base', 'verdict-old'), 'in a shell the record decides, offline as online');
  assert.deepEqual(decide(rules, '', { net: SHELL_OFF, record: OLD() }).d, light('default'), '... on every rung: the light hall of a device the standard hall is too slow for');
  assert.deepEqual(decide(rules, '', { net: SHELL_OFF, record: HALL_REC }).d, out('default', 'hall', 'stage', 'base', 'pass-verdict'));
  // ONLY `false` is offline: true, an unreadable value, no input at all = the page is taken as online (a browser that
  // reads true with no working network fails the fetch instead: lookAfterFailed, never a verdict)
  for (const online of [true, undefined, null, 0, '', 'false', NaN]) {
    assert.equal(decide(rules, '', { net: { online, scheme: 'https:' } }).d.why, 'pass-new', `navigator.onLine ${String(online)}: not offline`);
  }
  for (const net of [null, {}, NO_NET]) assert.equal(decide(rules, '', { net }).d.why, 'pass-new', `the network input ${net === NO_NET ? 'absent' : JSON.stringify(net)}: not offline`);
  assert.equal(decide(rules, '', { net: OFF }).netReads, 1, 'the network state is read once per decision');
};
await ok('the offline row: Tournament on a passing device that is offline at boot keeps the old room at once (why offline), reads no record; only over http(s) (a shell\'s scheme still gives the hall); every other row is what it is online', () => offlineRows(R));
await plant('an offline page asks for the hall (the row is gone)', RULES, swap("if (lookOffline(net?.())) return out(asked, 'old', 'none', tier, 'offline');", ''), (t) => offlineRows(load(t)));
await plant('a shell that is offline loses the hall (the row ignores the scheme)', RULES, swap("net?.online === false && /^https?:$/i.test(String(net.scheme ?? ''))", 'net?.online === false'), (t) => offlineRows(load(t)));
await plant('the offline row reads the record first', RULES, swap("if (lookOffline(net?.())) return out(asked, 'old', 'none', tier, 'offline'); // before the record: an offline boot reads, clears and stores nothing\n      const rec = lookRecord(record(), app, now);", "const early = record();\n      if (lookOffline(net?.())) return out(asked, 'old', 'none', tier, 'offline');\n      const rec = lookRecord(early, app, now);"), (t) => offlineRows(load(t)));
await plant('the offline row sits on every row (a tool\'s ?look=arena, a scripted boot, green)', RULES, swap("    const asked = bootQ.get('look');\n", "    const asked = bootQ.get('look');\n    if (lookOffline(net?.())) return out('offline', 'old', 'none', null, 'offline');\n"), (t) => offlineRows(load(t)));
await plant('an unreadable network state is offline', RULES, swap('net?.online === false &&', 'net?.online !== true &&'), (t) => offlineRows(load(t)));
await plant('a lite device that is offline changes its fact', RULES, swap("if (tier === 'lite') return out(asked, 'old', 'none', tier, 'tier-lite');\n      if (lookOffline(net?.())) return out(asked, 'old', 'none', tier, 'offline');", "if (lookOffline(net?.())) return out(asked, 'old', 'none', tier, 'offline');\n      if (tier === 'lite') return out(asked, 'old', 'none', tier, 'tier-lite');"), (t) => offlineRows(load(t)));
await plant('the offline row takes any scheme that begins with http', RULES, swap('/^https?:$/i', '/^https?/i'), (t) => offlineRows(load(t)));

await ok('the rules are pure: between the marks no page global is named (they run here with none defined)', () => {
  const code = stripComments(RULES);
  for (const g of ['window', 'document', 'localStorage', 'sessionStorage', 'location', 'navigator', 'performance', 'Date', 'engine', 'settingsCtx', 'requestAnimationFrame', 'setTimeout', 'console']) {
    assert.ok(!new RegExp(`(?<![.\\w$])${g}\\b`).test(code), `the rules name \`${g}\``);
  }
  assert.ok(!/\bimport\s*\(/.test(code) && !/(?<![.\w$])fetch\s*\(/.test(code), 'no import and no fetch between the marks');
  assert.ok(/env = globalThis/.test(code) && code.split('globalThis').length === 2, 'globalThis appears once: the default `env` of deviceFacts, as in the leaf');
});

// ---- 2. the literal copy of the leaf's tier rule -------------------------------------------------------------------------
const norm = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
const ruleParts = (text) => {
  const line = (name) => { const m = new RegExp(`^\\s*(?:export )?const ${name} = (.+);\\s*$`, 'm').exec(text); assert.ok(m, `no ${name}`); return m[1]; };
  const fn = (name) => norm(fnText(text, name).replace(/^export /, ''));
  return { SOFTWARE_GL: line('SOFTWARE_GL'), TOUCH_OS: line('TOUCH_OS'), deviceFacts: fn('deviceFacts'), autoTier: fn('autoTier') };
};
const FACT_AXES = {
  coarse: [true, false, null], touchPoints: [null, 0, 1, 5], platform: [null, 'MacIntel', 'Win32'],
  userAgent: [null, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'Mozilla/5.0 (Linux; Android 14)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'],
  gpu: [null, 'Google SwiftShader', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'Microsoft Basic Render Driver', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2)'],
  webgl2: [true, false, null], maxTextureSize: [null, 4096, 8191, 8192, 16384], floatBuffers: [true, false, null], memoryGB: [null, 2, 4, 4.01, 8],
};
const tierCopy = (rulesText) => {
  const mine = ruleParts(rulesText), leaf = ruleParts(tiersText);
  for (const k of Object.keys(leaf)) assert.equal(mine[k], leaf[k], `main.js's copy of ${k} is not the leaf's text (tiers.js): change both or neither`);
  // and as behaviour: the same tier for every combination of facts, the same facts from the same page
  const rules = load(rulesText), keys = Object.keys(FACT_AXES), idx = keys.map(() => 0);
  let combos = 0, lite = 0;
  for (;;) {
    const f = {}; keys.forEach((k, i) => { f[k] = FACT_AXES[k][idx[i]]; });
    const a = rules.autoTier(f), b = leafTiers.autoTier(f);
    assert.deepEqual(a, b, `autoTier differs from the leaf's for ${JSON.stringify(f)}`);
    combos += 1; if (a.tier === 'lite') lite += 1;
    let i = 0; while (i < keys.length && ++idx[i] === FACT_AXES[keys[i]].length) { idx[i] = 0; i += 1; }
    if (i === keys.length) break;
  }
  assert.ok(combos > 100000 && lite > 0 && lite < combos, 'the matrix has both tiers');
  assert.equal(rules.autoTier(PASS).tier, 'base'); assert.equal(rules.autoTier(LITE).tier, 'lite'); assert.equal(rules.autoTier({}).tier, 'base');
  const gl = (name, masked) => ({ RENDERER: 1, getParameter: (p) => (p === 1 ? name : (p === 2 ? masked : null)), getExtension: (e) => (e === 'WEBGL_debug_renderer_info' && masked ? { UNMASKED_RENDERER_WEBGL: 2 } : null) });
  const renderer = (name, masked, tex = 16384) => ({ capabilities: { maxTextureSize: tex, isWebGL2: true }, extensions: { has: (e) => e === 'EXT_color_buffer_float' }, getContext: () => gl(name, masked) });
  const envs = [
    { matchMedia: (q) => ({ matches: q === '(pointer: coarse)' }), navigator: { maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (iPad)', platform: 'MacIntel', deviceMemory: 4 } },
    { matchMedia: () => ({ matches: false }), navigator: { maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32', deviceMemory: 8 } },
    { navigator: {} }, {},
  ];
  for (const env of envs) for (const r of [renderer('WebKit WebGL', 'ANGLE (Intel, UHD 630)'), renderer('ANGLE (SwiftShader)', null), renderer('Mozilla', null, 4096), null]) {
    assert.deepEqual(rules.deviceFacts({ renderer: r, env }), leafTiers.deviceFacts({ renderer: r, env }), 'deviceFacts differs from the leaf\'s');
    // the tier main.js judges is the tier the leaf then picks, forced or not
    for (const forced of [null, 'lite', 'base', 'high', 'ultra']) {
      const query = new URLSearchParams(forced ? `look=tournament&clubtier=${forced}` : 'look=tournament');
      const mineTier = rules.lookDecide({ bootQ: query, scripted: false, stored: () => undefined, facts: () => rules.deviceFacts({ renderer: r, env }), record: () => null, app: APP, now: 0 }).tier;
      assert.equal(mineTier, leafTiers.pickTierInfo({ renderer: r, query, env }).tier, `main.js judges the tier the leaf picks (forced ${forced})`);
    }
  }
};
await ok('the tier rule: main.js\'s copy is the leaf\'s text (tiers.js read as text) and the leaf\'s behaviour (162 000 fact sets, the forced tier)', () => tierCopy(RULES));
await plant('a threshold of the copy drifts (texture size)', RULES, swap('facts.maxTextureSize < 8192', 'facts.maxTextureSize < 4096'), tierCopy);
await plant('a threshold of the copy drifts (memory)', RULES, swap('facts.memoryGB <= 4', 'facts.memoryGB < 4'), tierCopy);
await plant('a fact is dropped from the copy (the coarse pointer)', RULES, swap("if (facts.coarse === true) return { tier: 'lite', why: 'coarse primary pointer' };", ''), tierCopy);
await plant('a pattern of the copy drifts (software renderers)', RULES, swap('swiftshader|llvmpipe|', 'swiftshader|'), tierCopy);
await plant('a fact is read differently (the GPU name)', RULES, swap('facts.gpu = name.slice(0, 160)', 'facts.gpu = name.slice(0, 16)'), tierCopy);

// ---- 3. the pace verdict ----------------------------------------------------------------------------------------------------
const PERIOD = 1000 / 60;
const pace = ({ period = PERIOD, hall = {}, stage = {}, hidden = 0, witnessed = true, thin = false, tier = 'base' } = {}) => ({ // (`thin`: the period rests on five intervals, under the tenth of all)
  period: { ms: period, frames: thin ? 5 : 40, share: thin ? 0.03 : 0.6, thin, clock: 'frame', stage: witnessed ? (thin ? 5 : 40) : 0, witnessed, how: 'shortest stable interval' },
  hall: hall === null ? null : { frames: 120, median: period * 1.01, p95: period * 1.2, over: 0.01, complete: true, minFrames: 60, delayMs: 1000, closedBy: 'frames', ...hall },
  stage: { frames: 200, median: period * 1.02, p95: period * 1.3, over: 0.02, loading: true, before: { frames: 12, median: period, p95: period * 1.1, over: 0 }, ...stage },
  hidden, tier }); // (`tier`: the tier the leaf says it built: the page books a report on that rung and stores nothing for one that names none)
const BUSY = { median: 180, p95: 900, over: 0.95, before: { frames: 0, median: null, p95: null, over: null } };
const paceRules = (rules) => {
  const j = (p, visible = true) => rules.lookJudgePace(p, visible);
  const P = rules.LOOK_PACE;
  // a fast hall behind a busy stage: the stage decides nothing
  assert.deepEqual(j(pace({ stage: BUSY })), { verdict: 'hall', why: 'pace-ok' }, 'a fast hall behind a busy stage passes');
  for (const stage of [BUSY, {}, { median: NaN, p95: Infinity, over: 5 }, { median: 1, p95: 1, over: 0 }]) {
    assert.deepEqual(j(pace({ stage })), j(pace()), 'the stage\'s numbers never change the verdict of a fast hall');
    assert.deepEqual(j(pace({ stage, hall: { median: PERIOD * 2, p95: PERIOD * 3, over: 0.9 } })), j(pace({ hall: { median: PERIOD * 2, p95: PERIOD * 3, over: 0.9 } })), '... nor of a slow one');
  }
  const noStage = pace(); delete noStage.stage;
  assert.deepEqual(j(noStage), { verdict: 'hall', why: 'pace-ok' }, 'a report without stage numbers is judged all the same');
  // a slow hall, each way of being slow
  assert.deepEqual(j(pace({ hall: { median: PERIOD * 2, p95: PERIOD * 2.2, over: 0.93 } })), { verdict: 'old', why: 'pace-median' }, 'every other frame missed: the median');
  assert.deepEqual(j(pace({ hall: { median: 50, p95: 70, over: 1 } })), { verdict: 'old', why: 'pace-floor' }, 'under 30 frames a second: the floor');
  assert.deepEqual(j(pace({ hall: { over: P.OVER_SHARE + 0.1, p95: PERIOD * 2 } })), { verdict: 'old', why: 'pace-over' }, 'in step by the median but one frame in five dropped');
  assert.deepEqual(j(pace({ hall: { over: 0.06, p95: PERIOD * 4 } })), { verdict: 'old', why: 'pace-p95' }, 'rare stalls of four periods');
  // absolute, against the display's own period
  assert.deepEqual(j(pace({ period: 1000 / 120, hall: { median: PERIOD, p95: PERIOD * 1.1, over: 0.9 } })), { verdict: 'old', why: 'pace-median' }, '60 frames a second on a 120 Hz display is half its pace');
  assert.deepEqual(j(pace({ period: 1000 / 120 })), { verdict: 'hall', why: 'pace-ok' }, 'a 120 Hz display held');
  assert.deepEqual(j(pace({ period: 33.3 })), { verdict: 'hall', why: 'pace-ok' }, 'a display (or a browser) that runs at 30 Hz and is held: under the floor, in step');
  assert.deepEqual(j(pace({ period: 40 })), { verdict: 'old', why: 'pace-floor' }, 'a "period" slower than the floor is not a display\'s: the floor decides');
  // the edges: the thresholds are "at most"
  assert.equal(j(pace({ hall: { median: PERIOD * P.MEDIAN_PERIODS } })).verdict, 'hall'); assert.equal(j(pace({ hall: { median: PERIOD * P.MEDIAN_PERIODS + 0.01 } })).verdict, 'old');
  assert.equal(j(pace({ hall: { over: P.OVER_SHARE } })).verdict, 'hall'); assert.equal(j(pace({ hall: { over: P.OVER_SHARE + 0.001 } })).verdict, 'old');
  assert.equal(j(pace({ hall: { p95: PERIOD * P.P95_PERIODS } })).verdict, 'hall'); assert.equal(j(pace({ hall: { p95: PERIOD * P.P95_PERIODS + 0.01 } })).verdict, 'old');
  assert.equal(j(pace({ period: 30, hall: { median: P.FLOOR_MS, p95: 40, over: 0 } })).verdict, 'hall'); assert.equal(j(pace({ period: 30, hall: { median: P.FLOOR_MS + 0.01, p95: 40, over: 0 } })).verdict, 'old');
  // no verdict: a hidden page, too few frames, no hall, an unreadable period. A slow hall is NOT condemned on such a report
  const slow = { median: PERIOD * 2, p95: PERIOD * 3, over: 0.9 };
  for (const hall of [{}, slow]) {
    assert.deepEqual(j(pace({ hall, hidden: 3 })), { verdict: null, why: 'pace-hidden' }, 'intervals were dropped for a hidden page');
    assert.deepEqual(j(pace({ hall }), false), { verdict: null, why: 'pace-hidden' }, 'the page is hidden as the report arrives');
    assert.deepEqual(j(pace({ hall: { ...hall, closedBy: 'clock' } })), { verdict: null, why: 'pace-hidden' }, 'the window was closed by the clock: the page went away');
    assert.deepEqual(j(pace({ hall: { ...hall, complete: false, frames: 31 } })), { verdict: null, why: 'pace-few' }, 'too few frames (the leaf says incomplete)');
    assert.deepEqual(j(pace({ hall: { ...hall, frames: P.MIN_FRAMES - 1 } })), { verdict: null, why: 'pace-few' }, 'too few frames (by this file\'s own minimum)');
    assert.equal(j(pace({ hall: { ...hall, frames: P.MIN_FRAMES } })).verdict !== null, true, 'the minimum itself is enough');
    for (const period of [0, NaN, 2, -5, undefined]) { const p = pace({ hall }); p.period.ms = period; assert.deepEqual(j(p), { verdict: null, why: 'pace-unread' }, `period ${period}`); }
    assert.deepEqual(j(pace({ hall: { ...hall, p95: NaN } })), { verdict: null, why: 'pace-unread' });
  }
  for (const p of [pace({ hall: null }), {}, null, undefined]) assert.deepEqual(j(p), { verdict: null, why: 'pace-none' }, 'no hall in the report');
  // A WINDOW THE LEAF CLOSED AS `slow`: ten seconds of counted frames that never made its minimum (under six frames a
  // second). Too few frames for every other line, and still the old room, by the floor: "too few, no verdict" would show
  // such a hall on every boot for good.
  const crawl = { frames: 40, median: 250, p95: 260, over: 1, complete: false, closedBy: 'slow' };
  assert.deepEqual(j(pace({ hall: crawl })), { verdict: 'old', why: 'pace-floor' }, 'a hall at four frames a second: the old room');
  assert.deepEqual(j(pace({ hall: { ...crawl, frames: 2, median: 6000, p95: 6000 } })), { verdict: 'old', why: 'pace-floor' }, 'two intervals of six seconds: the old room');
  { const p = pace({ hall: crawl }); p.period.ms = null; assert.deepEqual(j(p), { verdict: 'old', why: 'pace-floor' }, 'the floor needs no period: a crawl is the old room also where none could be read'); }
  assert.deepEqual(j(pace({ hall: { ...crawl, frames: 1, median: 12000, p95: 12000 } })), { verdict: null, why: 'pace-few' }, 'ONE interval of twelve seconds may be a machine that slept through the window: no verdict');
  assert.deepEqual(j(pace({ hall: { ...crawl, frames: 55, median: PERIOD, p95: 2100, over: 0.07 } })), { verdict: null, why: 'pace-few' }, 'a few long stalls among frames in step are not the hall\'s pace: no verdict');
  assert.deepEqual(j(pace({ hall: { ...crawl, median: P.FLOOR_MS } })), { verdict: null, why: 'pace-few' }, 'the floor is "at most" here too');
  assert.deepEqual(j(pace({ hall: crawl, hidden: 2 })), { verdict: null, why: 'pace-hidden' }, 'a crawl on a page that was away is not judged');
  assert.deepEqual(j(pace({ hall: crawl }), false), { verdict: null, why: 'pace-hidden' });
  assert.deepEqual(j(pace({ hall: { ...crawl, closedBy: 'time' } })), { verdict: null, why: 'pace-few' }, 'only the leaf\'s own word `slow` makes it: the same numbers under another close are too few frames');
};
await ok('the pace verdict: planted paces (a slow hall four ways, a fast hall behind a busy stage, a hidden page, too few frames), absolute against the display period', () => paceRules(R));
// The leaf's estimator and this file's judge TOGETHER (the leaf's pace text run here as text, so that a plant can change it):
// what a boot's intervals end in, by main.js's own rule. `stage` and `hall` are lists of intervals in ms.
const leafIndexText = fs.readFileSync(new URL('../../scene/club/index.js', import.meta.url), 'utf8');
const paceText = (() => {
  const from = leafIndexText.indexOf('// ---- the pace facts of the stage flow'), to = leafIndexText.indexOf('/**\n * Install the club look.');
  assert.ok(from >= 0 && to > from, 'the leaf\'s pace block was not found between its two marks');
  return leafIndexText.slice(from, to);
})();
const leafPace = (text) => new Function(`${text.replace(/^export /gm, '')}\nreturn { framePeriod, paceStats, createPace };`)();
const bootOf = ({ createPace }, stage, hall, { stamped = false, lateness = () => 0 } = {}) => {
  let frame = 0, late = 0, out = null, i = 0;
  const pace = createPace({ now: () => frame + late, visible: () => true, stamp: stamped ? () => frame : undefined });
  const step = (dt) => { frame += dt; late = lateness(i++); const f = pace.tick(); if (f) out = f; };
  pace.tick(); pace.phase('loading');
  for (const dt of stage) step(dt);
  pace.phase('reveal'); for (let n = 0; n < 40; n++) step(hall[0]);
  pace.phase('wait'); for (let n = Math.ceil(1000 / hall[0]); n > 0; n--) step(hall[0]);
  for (const dt of hall) { if (out) break; step(dt); }
  return out;
};
const estimatorAndJudge = (rules, text = paceText) => {
  const leaf = leafPace(text), j = (facts) => rules.lookJudgePace(facts, true);
  const rep = (n, v) => Array.from({ length: n }, () => v), r1 = (x) => Math.round(x * 10) / 10;
  const pairs = (n, short, period = 16.7) => Array.from({ length: n }, () => [r1(2 * period - short), short]).flat();
  const LOAD = [180, 240, 90]; // the stage's own long frames while the leaf loads
  // (a) the seven boots of 2026-11-25 on a GPU shell by their counts: a hall in step with a 16.7 ms display, with late-and-early
  //     pairs whose short halves were read as the period (11.6 to 14.1 ms, 20 to 26 of them) on the commit before this one
  for (const [n, short] of [[20, 11.6], [21, 12.1], [26, 12.4], [24, 13.0], [21, 12.9], [20, 14.1]]) {
    const hall = [...rep(120 - 2 * n, 16.7), ...pairs(n, short)];
    const facts = bootOf(leaf, [...rep(75, 16.7), ...LOAD], hall);
    assert.equal(facts.period.ms, 16.7, `${n} short halves of ${short} ms: the period is the commonest interval (${JSON.stringify(facts.period)})`);
    assert.deepEqual(j(facts), { verdict: 'hall', why: 'pace-ok' }, `a hall in step with its display passes: ${JSON.stringify(facts.hall)}`);
    // what the judge says to the same hall when the short halves are taken for the period (the reading this arm guards against)
    const misread = { ...facts, period: { ...facts.period, ms: short }, hall: { ...facts.hall, ...leaf.paceStats(hall, short) } };
    if (short < 16.7 / rules.LOOK_PACE.MEDIAN_PERIODS) assert.deepEqual(j(misread), { verdict: 'old', why: 'pace-median' }, `against ${short} ms the same hall is condemned`);
  }
  // (b) a real half period under a hall at two periods is still taken, and the hall is still condemned
  for (const [stage, hallMs] of [[[...rep(75, 8.3), ...LOAD], 16.7], [[...rep(30, 8.3), ...rep(45, 25), ...LOAD], 16.7], [[...rep(75, 8.4), ...LOAD], 16.6]]) {
    const facts = bootOf(leaf, stage, rep(130, hallMs));
    assert.ok(Math.abs(facts.period.ms - 8.35) < 0.1, `the fast display's period is read: ${JSON.stringify(facts.period)}`);
    assert.deepEqual(j(facts), { verdict: 'old', why: 'pace-median' }, 'a hall at every second frame of a 120 Hz display is condemned, as before');
  }
  // (c) a 120 Hz display with a hall that holds it: one period, a pass (also with a missed frame in twenty-five)
  for (const hall of [rep(130, 8.3), Array.from({ length: 130 }, (_, i) => (i % 25 === 7 ? 16.6 : 8.3))]) {
    const facts = bootOf(leaf, [...rep(75, 8.3), ...LOAD], hall);
    assert.equal(facts.period.ms, 8.3);
    assert.deepEqual(j(facts), { verdict: 'hall', why: 'pace-ok' }, `a 120 Hz display that is held passes: ${JSON.stringify(facts.hall)}`);
  }
  // (d) the frame's own time stamp: the hook runs 5 ms late in one frame of four, the stamp moves in whole periods
  {
    const lateness = (i) => (i % 4 === 0 ? 5 : 0);
    const withStamp = bootOf(leaf, rep(75, 16.7), rep(130, 16.7), { stamped: true, lateness });
    assert.deepEqual([withStamp.period.ms, withStamp.period.clock, withStamp.hall.over], [16.7, 'frame', 0]);
    assert.deepEqual(j(withStamp), { verdict: 'hall', why: 'pace-ok' });
    const byClock = bootOf(leaf, rep(75, 16.7), rep(130, 16.7), { lateness });
    assert.deepEqual([byClock.period.ms, byClock.period.clock], [16.7, 'now'], `the hook's own clock sees 21.7 and 11.7 ms pairs and still reads the display: ${JSON.stringify(byClock.period)}`);
    assert.deepEqual(j(byClock), { verdict: 'hall', why: 'pace-ok' });
  }
};
await ok('the estimator and the judge together (the leaf\'s pace text, main.js\'s lookJudgePace): late-and-early pairs under a hall in step pass; a real half period under a hall at two periods is still taken and condemned; a 120 Hz display that is held passes; the frame\'s own time stamp', () => estimatorAndJudge(R));
await plant('the whole-multiple test is gone from the leaf (the shortest cluster is the period again)', paceText, swap('if (!((common >= v[i] && common <= v[j - 1])', 'if (false && !((common >= v[i] && common <= v[j - 1])'), (text) => estimatorAndJudge(R, text));
await plant('the leaf no longer takes a half period (a hall at two periods would be read as in step)', paceText, swap('(k >= 2 && Math.abs(common / ms - k) <= PACE_WHOLE * k)', '(k >= 3 && Math.abs(common / ms - k) <= PACE_WHOLE * k)'), (text) => estimatorAndJudge(R, text));
await ok('the pace constants as proposed (one place: LOOK_PACE in main.js; move them there and here together)', () => {
  assert.deepEqual({ ...R.LOOK_PACE }, { MIN_FRAMES: 60, PERIOD_MIN_MS: 3, FLOOR_MS: 34, MEDIAN_PERIODS: 1.25, OVER_SHARE: 0.10, P95_PERIODS: 2.5 });
  assert.ok(Object.isFrozen(R.LOOK_PACE) && Object.isFrozen(R.LOOK_TRIES));
  assert.deepEqual({ ...R.LOOK_TRIES }, { build: 1, timeout: 2, fetch: 2 }); assert.equal(R.LOOK_SLOW_AFTER_PASS, 2); assert.equal(R.LOOK_FETCH_WAIT_MS, 3600000);
});
await plant('the median threshold lets a half-rate hall pass', RULES, swap('MEDIAN_PERIODS: 1.25,', 'MEDIAN_PERIODS: 2.5,'), (t) => paceRules(load(t)));
await plant('the stage\'s numbers enter the verdict', RULES, swap('if (hall.over > P.OVER_SHARE)', 'if (pace.stage?.over > P.OVER_SHARE)'), (t) => paceRules(load(t)));
await plant('a hidden page is judged', RULES, swap("if (visible === false || pace.hidden > 0 || hall.closedBy === 'clock') return { verdict: null, why: 'pace-hidden' };", ''), (t) => paceRules(load(t)));
await plant('too few frames are judged', RULES, swap('if (hall.complete !== true || !(hall.frames >= P.MIN_FRAMES)) return hall.closedBy', 'if (false) return hall.closedBy'), (t) => paceRules(load(t)));
await plant('the floor is gone', RULES, swap("if (hall.median > P.FLOOR_MS) return { verdict: 'old', why: 'pace-floor' };", ''), (t) => paceRules(load(t)));
await plant('the verdict is relative to nothing (the period is ignored)', RULES, swap('if (hall.median > P.MEDIAN_PERIODS * period)', 'if (hall.median > P.MEDIAN_PERIODS * 16.7)'), (t) => paceRules(load(t)));
// (the rule is ONE line of main.js: "too few frames" answers `old` by the floor for a window closed as slow, else no verdict)
const SLOW_RULE = "return hall.closedBy === 'slow' && hall.frames >= 2 && hall.median > P.FLOOR_MS ? { verdict: 'old', why: 'pace-floor' } : { verdict: null, why: 'pace-few' };";
await plant('a hall whose window closed slow is not judged (too few frames: no verdict, the crawl on every boot)', RULES, swap(SLOW_RULE, "return { verdict: null, why: 'pace-few' };"), (t) => paceRules(load(t)));
await plant('one interval alone condemns (a machine that slept through the window)', RULES, swap("hall.closedBy === 'slow' && hall.frames >= 2 && ", "hall.closedBy === 'slow' && "), (t) => paceRules(load(t)));
await plant('a slow close condemns whatever the median (stalls among frames in step)', RULES, swap('hall.frames >= 2 && hall.median > P.FLOOR_MS ?', 'hall.frames >= 2 ?'), (t) => paceRules(load(t)));
await plant('any close with few frames is read as a crawl', RULES, swap("hall.closedBy === 'slow' && hall.frames >= 2", 'hall.frames >= 2'), (t) => paceRules(load(t)));

// ---- 4. the record over boots: the pace, the failure policy, a new app version, corrupt records --------------------------
/** A device: its storage, and boots that decide, report and fail through the rules. */
const device = (rules, { facts = PASS, version = APP, query = '' } = {}) => {
  const dev = { raw: null, version, writes: 0, rung: 'base', // (`rung`: the rung the last boot asked for; the writers book on it, as the page's own do)
    boot(now) { const d = decide(rules, query, { facts, record: dev.raw, app: dev.version, now }).d; dev.rung = d.rung === 'lite' ? 'lite' : 'base'; return d; },
    store(next) { if (next) { dev.raw = JSON.stringify(next); dev.writes += 1; } return next; },
    pace(p, now, visible = true, rung = dev.rung) { return dev.store(rules.lookAfterPace(rules.lookRecord(dev.raw, dev.version, now), p, dev.version, now, visible, rung)); },
    failed(reason, now, hidden = false, rung = dev.rung) { return dev.store(rules.lookAfterFailed(rules.lookRecord(dev.raw, dev.version, now), reason, dev.version, now, hidden, rung)); }, // (`hidden`: the page was hidden at some moment of the boot)
    anew(now) { return dev.store(rules.lookAnew(rules.lookRecord(dev.raw, dev.version, now), now)); },
    rec() { return dev.raw === null ? null : JSON.parse(dev.raw); } };
  return dev;
};
const SLOW = { hall: { median: PERIOD * 2, p95: PERIOD * 2.4, over: 0.93 }, stage: BUSY }, FAST = { stage: BUSY };
const T0 = 1763452800000, MIN = 60000;
const overBoots = (rules) => {
  // a slow hall on a device that never passed: the standard hall is not asked for again; from its next boot on THE LIGHT HALL is (section 4c)
  let d = device(rules);
  assert.deepEqual(d.boot(T0), out('default', 'hall', 'stage', 'base', 'pass-new'), 'boot 1: the first try');
  d.pace(pace(SLOW), T0 + 9000);
  let r = d.rec();
  assert.deepEqual([r.v, r.app, r.verdict, r.why, r.at, r.passed, r.slow], [1, APP, 'old', 'pace-median', T0 + 9000, false, 1], 'the record names the app version, the verdict, why and when');
  assert.deepEqual(r.pace, { period: 16.67, clock: 'frame', frames: 40, share: 0.6, stageOn: 40, thin: false, witnessed: true, how: 'shortest stable interval', hall: { frames: 120, median: 33.33, p95: 40, over: 0.93, closedBy: 'frames' },
    stage: { dirty: true, frames: 200, median: 180, p95: 900, over: 0.95, before: { frames: 0, median: null, p95: null, over: null } }, hidden: 0 }, 'the numbers it was made from, with what the period rested on (its clock, its intervals and their share, the stage\'s count on it, the thin fact); the stage\'s are kept, marked dirty');
  for (const now of [T0 + MIN, T0 + 30 * 24 * 60 * MIN]) assert.deepEqual(d.boot(now), light('default'), 'boot 2 and every later one under this app version: the standard hall is not asked for again, the light hall is');
  // a raised generation (the app version's last field; any other change of the version carries a pace `old`: section 4d): one new try; the new record is made under the new version
  d.version = '0.1.0+kernel|htmlid|2';
  assert.deepEqual(d.boot(T0 + 2 * MIN), out('default', 'hall', 'stage', 'base', 'pass-new'), 'a raised generation: one new try');
  d.pace(pace(FAST), T0 + 3 * MIN);
  assert.deepEqual([d.rec().app, d.rec().verdict, d.rec().why, d.rec().passed], ['0.1.0+kernel|htmlid|2', 'hall', 'pace-ok', true]);
  assert.deepEqual(d.boot(T0 + 4 * MIN), out('default', 'hall', 'stage', 'base', 'pass-verdict'));
  d.version = APP;
  assert.deepEqual(d.boot(T0 + 5 * MIN), out('default', 'hall', 'stage', 'base', 'pass-new'), 'and back under the first version the other version\'s record does not count either');
  // a device that passed is not condemned by ONE slow boot (a wrong old verdict costs the hall until the next version)
  d = device(rules);
  d.pace(pace(FAST), T0);
  d.pace(pace(SLOW), T0 + MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow, d.rec().passed], ['hall', 'pace-doubt', 1, true], 'one slow boot after a pass: doubt, still the hall');
  assert.equal(d.boot(T0 + 2 * MIN).shown, 'hall');
  d.pace(pace(FAST), T0 + 2 * MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow], ['hall', 'pace-ok', 0], 'a fast boot ends the doubt');
  d.pace(pace(SLOW), T0 + 3 * MIN); d.pace(pace(SLOW), T0 + 4 * MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow], ['old', 'pace-median', 2], 'two slow boots in a row: the way out of a wrong hall verdict');
  assert.deepEqual(d.boot(T0 + 5 * MIN), light('default'));
  // A THIN PERIOD (the leaf's `period.thin`: its cluster stands under the tenth of all intervals) does not condemn on ONE
  // boot. A slow verdict that read it counts as a slow boot of a device WITH standing, whatever the device's own is
  const THIN = { ...SLOW, thin: true };
  d = device(rules);
  d.pace(pace(THIN), T0);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow, d.rec().passed], ['hall', 'pace-doubt', 1, false], 'a first slow boot on a thin period, on a device that never passed: doubt, still the hall, and no standing given');
  assert.deepEqual([d.rec().pace.thin, d.rec().pace.frames, d.rec().pace.share, d.rec().pace.clock, d.rec().pace.stageOn], [true, 5, 0.03, 'frame', 5], 'the record says what the period rested on');
  assert.deepEqual(d.boot(T0 + MIN), out('default', 'hall', 'stage', 'base', 'pass-verdict'), 'the next boot shows the hall and measures again');
  d.pace(pace(THIN), T0 + MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow, d.rec().passed], ['old', 'pace-median', 2, false], 'the second such boot in a row: the old room');
  assert.deepEqual(d.boot(T0 + 2 * MIN), light('default'));
  // A PASS ENDS THE RUN ONLY ON A WITNESSED PERIOD. A pass on a period nothing but the hall has shown is the hall measured
  // against itself: the hall stays and the run of slow boots stands (a device whose boots alternate between a thin slow
  // period and fewer than five stage intervals on the true one would otherwise never be condemned)
  d = device(rules);
  d.pace(pace(THIN), T0); d.pace(pace({ ...FAST, witnessed: false }), T0 + MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow, d.rec().passed], ['hall', 'pace-ok', 1, false], 'thin, then a pass without a witness: the hall, no standing, and the slow run stands');
  assert.deepEqual(d.boot(T0 + 2 * MIN), out('default', 'hall', 'stage', 'base', 'pass-verdict'), 'the next boot shows the hall and measures again');
  d.pace(pace(THIN), T0 + 2 * MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow], ['old', 'pace-median', 2], 'thin, a pass without a witness, thin: the second slow boot of the run, the old room');
  assert.deepEqual(d.boot(T0 + 3 * MIN), light('default'), 'boots that alternate so are condemned on the standard hall at the second thin one');
  // ... and a pass on a WITNESSED period does end it
  d = device(rules);
  d.pace(pace(THIN), T0); d.pace(pace(FAST), T0 + MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow, d.rec().passed], ['hall', 'pace-ok', 0, true], 'thin, then a pass on a witnessed period: the run is over, the standing given');
  d.pace(pace(THIN), T0 + 2 * MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow], ['hall', 'pace-doubt', 1], 'thin, a witnessed pass, thin: one slow boot again, not two');
  d.pace(pace(THIN), T0 + 3 * MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow], ['old', 'pace-median', 2]);
  // a device WITH standing is under the same line: a slow boot, a pass without a witness, a slow boot are two in a row
  d = device(rules);
  d.pace(pace(FAST), T0); d.pace(pace(SLOW), T0 + MIN); d.pace(pace({ ...FAST, witnessed: false }), T0 + 2 * MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow, d.rec().passed], ['hall', 'pace-ok', 1, true], 'with standing: a slow boot, then a pass without a witness: the standing is kept and so is the slow run');
  d.pace(pace(SLOW), T0 + 3 * MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow, d.rec().passed], ['old', 'pace-median', 2, true], 'with standing: the second slow boot of that run stores the old room');
  assert.deepEqual(d.anew(T0 + 4 * MIN)?.why, 'anew', 'and the player may clear it (Tournament chosen anew measures again)');
  // every line of the rule that reads the period; on a period that holds its tenth each condemns at once, as before
  for (const [hall, why] of [[SLOW.hall, 'pace-median'], [{ over: 0.3, p95: PERIOD * 2 }, 'pace-over'], [{ over: 0.06, p95: PERIOD * 4 }, 'pace-p95']]) {
    d = device(rules); d.pace(pace({ hall, thin: true }), T0);
    assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow], ['hall', 'pace-doubt', 1], `thin and ${why}: doubt`);
    d.pace(pace({ hall, thin: true }), T0 + MIN);
    assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow], ['old', why, 2], `thin and ${why} twice in a row: the old room, by that line`);
    d = device(rules); d.pace(pace({ hall }), T0);
    assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow], ['old', why, 1], `${why} on a period that holds its tenth: the old room at once`);
  }
  // the floor reads no period: a thin one shields nothing
  d = device(rules); d.pace(pace({ hall: { median: 50, p95: 70, over: 1 }, thin: true }), T0);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow], ['old', 'pace-floor', 1], 'under the floor on a thin period: the old room at once');
  // a thin slow boot, then a slow boot on a period that holds its tenth: two in a row
  d = device(rules); d.pace(pace(THIN), T0); d.pace(pace(SLOW), T0 + MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow], ['old', 'pace-median', 2]);
  // a device WITH standing gains nothing by it: one slow boot is doubt, the second in a row the old room
  d = device(rules); d.pace(pace(FAST), T0); d.pace(pace(THIN), T0 + MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow, d.rec().passed], ['hall', 'pace-doubt', 1, true]);
  d.pace(pace(THIN), T0 + 2 * MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow], ['old', 'pace-median', 2]);
  // only the leaf's own `true` is thin: a report that does not say (a leaf of another build) condemns as before
  for (const said of [undefined, null, 'yes', 1, false]) {
    d = device(rules); const p = pace(SLOW); p.period.thin = said; d.pace(p, T0);
    assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().pace.thin], ['old', 'pace-median', false], `thin ${String(said)}`);
  }
  // the record's own reading of what the period rested on: a number or null, a short word or null
  { const p = pace(FAST); Object.assign(p.period, { clock: 'x'.repeat(40), frames: 'many', share: NaN, stage: undefined }); d = device(rules); d.pace(p, T0);
    assert.deepEqual([d.rec().pace.clock, d.rec().pace.frames, d.rec().pace.share, d.rec().pace.stageOn], ['xxxxxxxx', null, null, null]); }
  { const p = pace(FAST); p.period.clock = 7; d = device(rules); d.pace(p, T0); assert.equal(d.rec().pace.clock, null); }
  // no verdict: nothing is stored, the next boot tries again
  d = device(rules);
  for (const [p, visible] of [[pace({ ...SLOW, hidden: 2 }), true], [pace(SLOW), false], [pace({ hall: { ...SLOW.hall, complete: false, frames: 20 } }), true], [pace({ hall: null }), true]]) {
    assert.equal(d.pace(p, T0, visible), null, 'no verdict: the rule returns nothing to store');
  }
  assert.equal(d.raw, null); assert.equal(d.writes, 0);
  assert.deepEqual(d.boot(T0 + MIN), out('default', 'hall', 'stage', 'base', 'pass-new'), 'the next boot tries again');
  // a planted failed fetch over three boots (and after): never a verdict; a wait after two in a row
  d = device(rules);
  assert.equal(d.boot(T0).why, 'pass-new');
  d.failed('import', T0 + 1000);
  assert.deepEqual([d.rec().verdict, d.rec().fails, d.rec().failAt, d.rec().reason], [null, { fetch: 1, build: 0, timeout: 0 }, T0 + 1000, 'import']);
  assert.deepEqual(d.boot(T0 + MIN), out('default', 'hall', 'stage', 'base', 'pass-retry'), 'boot 2 after one failed fetch: the hall is asked for again');
  d.failed('assets: arena-floor.jpg did not load', T0 + MIN + 1000);
  assert.equal(d.rec().verdict, null, 'a failed fetch is never a verdict');
  assert.deepEqual(d.boot(T0 + 2 * MIN), out('default', 'old', 'none', 'base', 'fetch-wait'), 'boot 3 after two in a row: the old room at once, no leaf asked');
  assert.equal(d.boot(T0 + MIN + 1000 + rules.LOOK_FETCH_WAIT_MS - 1).why, 'fetch-wait', 'until the wait is over');
  assert.deepEqual(d.boot(T0 + MIN + 1000 + rules.LOOK_FETCH_WAIT_MS), out('default', 'hall', 'stage', 'base', 'pass-retry'), 'then one try more');
  d.failed('import', T0 + 2 * rules.LOOK_FETCH_WAIT_MS);
  assert.equal(d.boot(T0 + 2 * rules.LOOK_FETCH_WAIT_MS + MIN).why, 'fetch-wait', 'a third failure starts the wait again');
  assert.equal(d.rec().verdict, null, 'however many fetches fail, the device is never condemned');
  assert.equal(d.boot(T0 - MIN).shown, 'hall', 'a clock that went backwards does not hold the hall off');
  d.pace(pace(FAST), T0 + 9 * rules.LOOK_FETCH_WAIT_MS);
  assert.deepEqual([d.rec().verdict, d.rec().fails], ['hall', { fetch: 0, build: 0, timeout: 0 }], 'a revealed hall ends the run of failures');
  // a failed fetch between two good boots does not touch a hall verdict
  d.failed('import', T0 + 10 * rules.LOOK_FETCH_WAIT_MS);
  assert.deepEqual([d.rec().verdict, d.boot(T0 + 10 * rules.LOOK_FETCH_WAIT_MS + MIN).why], ['hall', 'pass-verdict']);
  // a planted build failure over three boots: one try, then the old room under this app version
  d = device(rules);
  assert.equal(d.boot(T0).shown, 'hall');
  d.failed('room: createRoom threw: x is not a function', T0 + 1000);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().at, d.rec().fails.build], ['old', 'build', T0 + 1000, 1]);
  for (const now of [T0 + MIN, T0 + 2 * MIN, T0 + 400 * 24 * 60 * MIN]) assert.deepEqual(d.boot(now), out('default', 'old', 'none', 'base', 'verdict-old'), 'boots 2, 3, ...: not tried again on every boot');
  d.version = `${APP}-next`;
  assert.equal(d.boot(T0 + 3 * MIN).shown, 'hall', 'until a new app version');
  // a planted timeout over three boots: two tries, then no more of the standard hall under this app version
  d = device(rules);
  d.failed('timeout', T0 + 25000);
  assert.deepEqual([d.rec().verdict, d.rec().fails.timeout], [null, 1], 'one timeout: no verdict (one slow build, under load perhaps, is not yet the device; a slow download is never a timeout: section 5d)');
  assert.deepEqual(d.boot(T0 + MIN), out('default', 'hall', 'stage', 'base', 'pass-retry'), 'boot 2: tried again');
  d.failed('timeout: the services did not settle in 25 s', T0 + MIN + 25000);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().fails.timeout], ['old', 'timeout', 2]);
  assert.deepEqual(d.boot(T0 + 2 * MIN), light('default'), 'boot 3: the standard hall is not asked for again; the light hall is (it builds less)');
  // a timeout, then a revealed hall without a verdict (a hidden page): the count is cleared, nothing else is stored
  d = device(rules);
  d.failed('timeout', T0);
  d.pace(pace({ ...FAST, hidden: 4 }), T0 + MIN);
  assert.deepEqual([d.rec().verdict, d.rec().fails, d.rec().pace], [null, { fetch: 0, build: 0, timeout: 0 }, null]);
  d.failed('timeout', T0 + 2 * MIN);
  assert.equal(d.rec().verdict, null, 'so the next timeout is the first of a new run');
  // A TIMEOUT ON A PAGE THAT WAS HIDDEN during the boot is not counted and not stored (a hidden page delivers no animation
  // frame and the bakes step in animation frames: a game opened in a background tab runs into a bound on any device).
  // Two such boots in a row leave no `old` and no record at all
  d = device(rules);
  assert.equal(d.failed('timeout', T0 + 25000, true), null, 'a hidden boot\'s timeout: the rule returns nothing to store');
  assert.equal(d.failed('timeout: the hall\'s files or bakes were not in after 12000 ms', T0 + MIN + 25000, true), null);
  assert.deepEqual([d.raw, d.writes], [null, 0], 'two hidden timeouts in a row: nothing was stored');
  assert.deepEqual(d.boot(T0 + 2 * MIN), out('default', 'hall', 'stage', 'base', 'pass-new'), 'and the third boot asks for the hall as a first boot does');
  // ... it neither adds to a run of seen timeouts nor ends one: seen, hidden, seen is two
  d.failed('timeout', T0 + 3 * MIN);
  assert.equal(d.failed('timeout', T0 + 4 * MIN, true), null);
  assert.deepEqual([d.rec().verdict, d.rec().fails.timeout, d.rec().failAt], [null, 1, T0 + 3 * MIN], 'the hidden one left the record as it was');
  d.failed('timeout', T0 + 5 * MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().fails.timeout], ['old', 'timeout', 2], 'the second SEEN timeout condemns, as before');
  // ... and only a timeout is forgiven: a failed fetch and a build failure are what they are, seen or not
  d = device(rules); d.failed('import', T0, true);
  assert.ok(d.rec(), 'a failed fetch on a hidden page is stored');
  assert.deepEqual([d.rec().verdict, d.rec().fails], [null, { fetch: 1, build: 0, timeout: 0 }], 'a failed fetch on a hidden page is counted as on a seen one');
  d = device(rules); d.failed('room: createRoom threw', T0, true);
  assert.ok(d.rec(), 'a build failure on a hidden page is stored');
  assert.deepEqual([d.rec().verdict, d.rec().why], ['old', 'build'], 'a build failure on a hidden page is the build\'s');
  for (const hidden of [undefined, null, false, 0, 'yes', 1]) { d = device(rules); d.failed('timeout', T0, hidden); assert.equal(d.rec().fails.timeout, 1, `only the boot's own true forgives (hidden ${String(hidden)})`); }
  // the classes, by the head of the reason
  for (const [reason, cls] of [['import', 'fetch'], ['Import', 'fetch'], ['assets: x', 'fetch'], ['timeout', 'timeout'], ['timeout: x', 'timeout'], [' Timeout', 'timeout'], ['room: x', 'build'], ['mat: x', 'build'],
    ['tier: lite', 'build'], ['mismatch', 'mismatch'], ['mismatch: the leaf speaks stage protocol 3, the app 2', 'mismatch'], [' Mismatch: x', 'mismatch'], ['mismatched', 'build'], ['a mismatch', 'build'], ['venue: x', 'build'], ['important', 'build'], ['', 'build'], [undefined, 'build'], [null, 'build'], [{ toString: () => 'timeout' }, 'timeout']]) assert.equal(rules.lookFailClass(reason), cls, `the class of ${String(reason)}`);
  assert.equal(rules.lookAfterFailed(null, 'x'.repeat(500), APP, T0).reason.length, 120, 'the stored reason is cut');
  // unreadable and corrupt records: no record (the hall is tried; the next write starts fresh)
  for (const raw of [null, undefined, '', '{', 'null', '[]', '42', '"old"', '{"v":2,"app":"' + APP + '","verdict":"old"}', '{"v":1,"verdict":"old"}', JSON.stringify(OLD('another version')), JSON.stringify([OLD()])]) {
    assert.equal(rules.lookRecord(raw, APP), null, `no record from ${raw}`);
    assert.equal(decide(rules, '', { record: raw === undefined ? null : raw }).d.shown, 'hall', `the hall is tried with ${raw} stored`);
  }
  assert.equal(rules.lookRecord(JSON.stringify(OLD()), undefined), null, 'an unknown app version matches no record');
  // a record seeded by a test launcher says so: the same rule, its own why
  assert.deepEqual(decide(rules, '', { record: { ...OLD(), why: 'pin' } }).d, out('default', 'old', 'none', 'base', 'verdict-pin'));
  assert.deepEqual(decide(rules, '', { record: { ...OLD('another version'), why: 'pin' } }).d, out('default', 'hall', 'stage', 'base', 'pass-new'), 'a pin record of another app version does not count either');
  for (const why of ['build', 'pinned', '', null]) assert.equal(decide(rules, '', { record: { ...OLD(), why } }).d.why, 'verdict-old');
  for (const why of rules.LOOK_ANEW_WHYS) assert.deepEqual(decide(rules, '', { record: { ...OLD(), why } }).d, light('default'), `an old by ${why}: the light hall`);
  const odd = rules.lookRecord(JSON.stringify({ v: 1, app: APP, verdict: 'maybe', why: 7, at: 'x', passed: 'yes', slow: -3, fails: { fetch: '2', build: 1.9, timeout: null }, failAt: {}, reason: 9, pace: 'p' }), APP);
  assert.deepEqual(odd, { ...rules.lookFresh(APP), fails: { fetch: 0, build: 1, timeout: 0 } }, 'a record with fields of the wrong type is read field by field');
  assert.equal(rules.lookRecord(JSON.stringify({ v: 1, app: APP, fails: 5 }), APP).fails.fetch, 0);
  assert.deepEqual(rules.lookAfterFailed(null, 'import', APP, 7), { ...rules.lookFresh(APP), fails: { fetch: 1, build: 0, timeout: 0 }, failAt: 7, reason: 'import' }, 'a first failure starts from a fresh record');
};
await ok('the record over boots: a slow hall, a pass and its doubt, no verdict, a failed fetch / a build failure / a timeout over three boots, a new app version, corrupt records', () => overBoots(R));
await plant('a build failure is tried again on every boot', RULES, swap('build: 1, timeout: 2, fetch: 2', 'build: 3, timeout: 2, fetch: 2'), (t) => overBoots(load(t)));
await plant('one timeout condemns', RULES, swap('build: 1, timeout: 2, fetch: 2', 'build: 1, timeout: 1, fetch: 2'), (t) => overBoots(load(t)));
await plant('a failed fetch is retried on every boot', RULES, swap('build: 1, timeout: 2, fetch: 2', 'build: 1, timeout: 2, fetch: 99'), (t) => overBoots(load(t)));
await plant('a failed fetch condemns the device', RULES, swap("cls !== 'fetch' && fails[cls] >= LOOK_TRIES[cls]", 'fails[cls] >= LOOK_TRIES[cls]'), (t) => overBoots(load(t)));
await plant('the fetch wait never ends', RULES, swap('now - rec.failAt < LOOK_FETCH_WAIT_MS', 'now - rec.failAt < Infinity'), (t) => overBoots(load(t)));
await plant('a record of another app version counts', RULES, swap('if (r.app === app) return { v: 1, app, ...top, ...(lite ? { lite } : null) };', 'if (true) return { v: 1, app, ...top, ...(lite ? { lite } : null) };'), (t) => overBoots(load(t)));
await plant('one slow boot condemns a device that passed', RULES, swap('const LOOK_SLOW_AFTER_PASS = 2;', 'const LOOK_SLOW_AFTER_PASS = 1;'), (t) => overBoots(load(t)));
await plant('a slow hall is never condemned', RULES, swap('condemned = !(rec.passed || thin) || slow >= LOOK_SLOW_AFTER_PASS;', 'condemned = false;'), (t) => overBoots(load(t)));
await plant('any pass ends a run of slow boots (a hall measured against itself clears a doubt)', RULES, swap('slow: numbers.witnessed ? 0 : rec.slow', 'slow: 0'), (t) => overBoots(load(t)));
await plant('no pass ends a run of slow boots', RULES, swap('slow: numbers.witnessed ? 0 : rec.slow', 'slow: rec.slow'), (t) => overBoots(load(t)));
await plant('a thin period condemns on the first boot (five intervals: a display whose rate changed, stamps that are not the display\'s ticks)', RULES, swap('condemned = !(rec.passed || thin) ||', 'condemned = !rec.passed ||'), (t) => overBoots(load(t)));
await plant('a thin period is never condemned', RULES, swap('condemned = !(rec.passed || thin) || slow >= LOOK_SLOW_AFTER_PASS;', 'condemned = !thin && (!rec.passed || slow >= LOOK_SLOW_AFTER_PASS);'), (t) => overBoots(load(t)));
await plant('a thin period shields a hall under the floor', RULES, swap("thin = numbers.thin && j.why !== 'pace-floor',", 'thin = numbers.thin,'), (t) => overBoots(load(t)));
await plant('a report that does not say is taken as thin', RULES, swap('thin: pace?.period?.thin === true', 'thin: pace?.period?.thin !== false'), (t) => overBoots(load(t)));
await plant('the record forgets what the period rested on', RULES, swap('frames: num(pace?.period?.frames), share: num(pace?.period?.share), stageOn: num(pace?.period?.stage), ', ''), (t) => overBoots(load(t)));
await plant('the record keeps the clock\'s word uncut and unread', RULES, swap("clock: typeof pace?.period?.clock === 'string' ? pace.period.clock.slice(0, 8) : null", 'clock: pace?.period?.clock ?? null'), (t) => overBoots(load(t)));
await plant('a report without a verdict is stored', RULES, swap("if (j.verdict === null) return pace?.hall && rec.fails.fetch + rec.fails.build + rec.fails.timeout > 0 ? { ...rec, fails } : null;", "if (j.verdict === null) return { ...rec, verdict: 'old', why: j.why };"), (t) => overBoots(load(t)));
await plant('the stage\'s numbers are not marked', RULES, swap('{ dirty: true, ...part(pace.stage)', '{ ...part(pace.stage)'), (t) => overBoots(load(t)));
await plant('a corrupt record throws', RULES, swap("try { r = typeof raw === 'string' ? JSON.parse(raw) : null; } catch { r = null; }", "r = typeof raw === 'string' ? JSON.parse(raw) : null;"), async (t) => { try { overBoots(load(t)); } catch (e) { throw e instanceof assert.AssertionError ? e : new assert.AssertionError({ message: `threw: ${e.message}` }); } });

await plant('a hidden page\'s timeout is counted (two background-tab boots keep the old room for the app version)', RULES, swap("return cls === 'timeout' && hidden === true ? null : {", 'return {'), (t) => overBoots(load(t)));
await plant('a hidden page forgives every failure', RULES, swap("return cls === 'timeout' && hidden === true ? null : {", 'return hidden === true ? null : {'), (t) => overBoots(load(t)));

// ---- 4a. the hall's own intervals do not outvote the stage's; a period nobody but the hall has shown is no proof -----------
// The leaf's estimator, this file's judge and the record TOGETHER, on the frame's own time stamps (bootOf `stamped`).
// The hole: a cluster counted only with a tenth of ALL intervals, the hall's own 60 to 120 among them, so a hall at two
// periods was read against its own pace whenever the stage had kept the true period for fewer frames than that, and it
// passed with `passed: true`. Now a cluster under the commonest interval counts with five intervals where every interval
// lies between two frame time stamps. What remains is the limit: with fewer than five the page cannot know, the hall is
// shown, and the pass gives no standing.
const dilution = (rules, text = paceText) => {
  const leaf = leafPace(text), j = (facts) => rules.lookJudgePace(facts, true);
  const rep = (n, v) => Array.from({ length: n }, () => v);
  const above = (n, period) => Array.from({ length: n }, (_, i) => (3 + (i % 4)) * period); // the stage's long frames while the leaf loads: three to six whole periods
  const mix = (a, b) => { const all = []; for (let i = 0; i < Math.max(a.length, b.length); i++) { if (i < a.length) all.push(a[i]); if (i < b.length) all.push(b[i]); } return all; }; // the kept frames among the long ones, not in one run
  const P60 = 16.67, P120 = 8.33, T = 1763452800000, M = 60000;
  // (a) a 60 Hz display: a stage of 60 intervals with 12 on the period, then a hall at two periods (91 intervals in its three seconds): 12 of 151
  const a = bootOf(leaf, mix(rep(12, P60), above(48, P60)), rep(130, 33.33), { stamped: true });
  assert.deepEqual([a.period.ms, a.period.clock, a.period.frames, a.period.stage, a.period.witnessed, a.period.thin], [16.67, 'frame', 12, 12, true, true], `(a) the period is the display's, from the stage's twelve, and thin (the tenth of 151 is 16): ${JSON.stringify(a.period)}`);
  assert.deepEqual([a.hall.frames, a.hall.closedBy, a.hall.median], [91, 'time', 33.33], JSON.stringify(a.hall));
  assert.deepEqual(j(a), { verdict: 'old', why: 'pace-median' }, '(a) a hall at every second frame of a 60 Hz display is the old room, however many of its own intervals it brings');
  // (b) a 120 Hz display: a stage of 80 intervals with k on the period, then a hall of 120 at two periods. No handful of loading frames flips the verdict
  for (const k of [5, 15, 20, 40]) {
    const b = bootOf(leaf, mix(rep(k, P120), above(80 - k, P120)), rep(130, 16.67), { stamped: true });
    assert.deepEqual([b.period.ms, b.period.frames, b.period.witnessed, b.period.thin, b.hall.frames, b.hall.closedBy], [8.33, k, true, k < 20, 120, 'frames'], `(b) k = ${k}: ${JSON.stringify(b.period)}`);
    assert.deepEqual(j(b), { verdict: 'old', why: 'pace-median' }, `(b) k = ${k}: the judge reads the hall against the display's period`);
    // the record: under the tenth of the 200 (20) the first boot is doubt and the second in a row the old room; at or over it, the old room at once
    const dv = device(rules);
    dv.pace(b, T);
    assert.deepEqual([dv.rec().verdict, dv.rec().why, dv.rec().slow], k < 20 ? ['hall', 'pace-doubt', 1] : ['old', 'pace-median', 1], `(b) k = ${k}: ${k < 20 ? 'thin: doubt on the first boot' : 'the tenth is held: the old room at once'}`);
    dv.pace(b, T + M);
    assert.deepEqual([dv.rec().verdict, dv.rec().why, dv.rec().slow], ['old', 'pace-median', 2], `(b) k = ${k}: the second such boot in a row is the old room`);
  }
  // ... and FOUR is not a period: fewer than five intervals are not evidence (row d below says what follows)
  assert.equal(bootOf(leaf, mix(rep(4, P120), above(76, P120)), rep(130, 16.67), { stamped: true }).period.ms, 16.67, 'four intervals are not a cluster');
  // the hook's own clock keeps the tenth (a short interval there may be the early half of a late-and-early pair): the same
  // boot without the stamp is read against the hall's own pace, as before; but that period is NOT witnessed
  const byClock = bootOf(leaf, mix(rep(5, P120), above(75, P120)), rep(130, 16.67));
  assert.deepEqual([byClock.period.ms, byClock.period.clock, byClock.period.stage, byClock.period.witnessed], [16.67, 'now', 0, false], JSON.stringify(byClock.period));
  assert.deepEqual(j(byClock), { verdict: 'hall', why: 'pace-ok' });
  // (d) NO EVIDENCE of a shorter period: four stage intervals on the true period, none on the hall's pace. The page cannot
  // know. The rule answers `hall` (no evidence is no verdict against a device: a hall in step behind a busy stage reads
  // just like this), and the pass gives NO standing: `passed` stays false
  const d = bootOf(leaf, mix(rep(4, P60), above(56, P60)), rep(130, 33.33), { stamped: true });
  assert.deepEqual([d.period.ms, d.period.frames, d.period.stage, d.period.witnessed], [33.33, 91, 0, false], `(d) the period is the hall's own pace and nothing else has shown it: ${JSON.stringify(d.period)}`);
  assert.deepEqual(j(d), { verdict: 'hall', why: 'pace-ok' }, '(d) the hall is shown');
  let dev = device(rules);
  dev.pace(d, T);
  assert.deepEqual([dev.rec().verdict, dev.rec().why, dev.rec().passed, dev.rec().pace.witnessed, dev.rec().pace.period], ['hall', 'pace-ok', false, false, 33.33], '(d) the record: the hall, and no standing from a period only the hall has shown');
  assert.deepEqual(dev.boot(T + M), out('default', 'hall', 'stage', 'base', 'pass-verdict'), '(d) the next boot shows the hall and measures again');
  const a20 = bootOf(leaf, mix(rep(20, P60), above(40, P60)), rep(130, 33.33), { stamped: true }); // as (a), with 20 of the 151 on the period: the tenth (16) is held
  assert.deepEqual([a20.period.ms, a20.period.frames, a20.period.thin], [16.67, 20, false], JSON.stringify(a20.period));
  dev.pace(a20, T + M);
  assert.deepEqual([dev.rec().verdict, dev.rec().why, dev.rec().slow, dev.rec().passed], ['old', 'pace-median', 1, false], '(d) the first boot that FINDS the display\'s period on a tenth of its intervals decides at once: no doubt is owed to a pass without standing');
  // ... and where it is found on fewer (a: twelve of 151) the first such boot is doubt, the second in a row decides
  dev = device(rules); dev.pace(d, T); dev.pace(a, T + M);
  assert.deepEqual([dev.rec().verdict, dev.rec().why, dev.rec().slow, dev.rec().passed], ['hall', 'pace-doubt', 1, false], '(a) after a pass without standing: a thin period is doubt');
  dev.pace(a, T + 2 * M);
  assert.deepEqual([dev.rec().verdict, dev.rec().why, dev.rec().slow, dev.rec().passed], ['old', 'pace-median', 2, false], '(a) the second such boot in a row: the old room');
  // (e) TWO THINGS THAT ARE NOT A SHORTER PERIOD and give the same five intervals as a real one kept for a handful of
  // frames: a display whose rate changed during the boot (five intervals at 8.33 ms, then everything in step at
  // 16.67 ms), and an engine whose frame time stamps are not the display's ticks (five early halves of late-and-early
  // pairs between stamps, inside 15 % of each other, under a hall in step with a 16.7 ms display). The judge reads the
  // hall against the handful, as it must for a real one; the record does not condemn on ONE such boot
  const drift = bootOf(leaf, [...rep(5, P120), ...rep(55, P60)], rep(130, P60), { stamped: true });
  const early = [8.0, 8.3, 8.5, 8.7, 9.0], halves = early.flatMap((s) => [Math.round((2 * 16.7 - s) * 10) / 10, s]);
  const jitter = bootOf(leaf, rep(60, 16.7), [...rep(10, 16.7), ...halves, ...rep(110, 16.7)], { stamped: true });
  for (const [name, boot, ms] of [['a display whose rate changed during the boot', drift, 8.33], ['five early halves between stamps on a 16.7 ms display', jitter, 8.5]]) {
    assert.deepEqual([boot.period.ms, boot.period.frames, boot.period.thin, boot.period.clock, boot.hall.frames], [ms, 5, true, 'frame', 120], `${name}: ${JSON.stringify(boot.period)}`);
    assert.deepEqual(j(boot), { verdict: 'old', why: 'pace-median' }, `${name}: the judge`);
    const dv = device(rules);
    dv.pace(boot, T);
    assert.deepEqual([dv.rec().verdict, dv.rec().why, dv.rec().slow, dv.rec().passed, dv.rec().pace.thin, dv.rec().pace.frames, dv.rec().pace.clock], ['hall', 'pace-doubt', 1, false, true, 5, 'frame'], `${name}: the first boot is doubt, the hall stays, and the record says the period rested on five intervals`);
    assert.deepEqual(dv.boot(T + M), out('default', 'hall', 'stage', 'base', 'pass-verdict'), `${name}: the next boot shows the hall`);
    dv.pace(d, T + M); // a pass between, on a period only the hall has shown (row d): no witness
    assert.deepEqual([dv.rec().verdict, dv.rec().why, dv.rec().slow, dv.rec().passed], ['hall', 'pace-ok', 1, false], `${name}: a pass without a witness does not end the run`);
    dv.pace(boot, T + 2 * M);
    assert.deepEqual([dv.rec().verdict, dv.rec().why, dv.rec().slow], ['old', 'pace-median', 2], `${name}: the next such boot is the second of the run and stores the old room`);
    assert.deepEqual(dv.boot(T + 3 * M), light('default'));
    // ... and with a WITNESSED pass between them (row w below: a stage that stood on its period) each is the first again
    const dw = device(rules);
    dw.pace(boot, T); dw.pace(bootOf(leaf, rep(60, 33.33), rep(130, 33.33), { stamped: true }), T + M);
    assert.deepEqual([dw.rec().verdict, dw.rec().why, dw.rec().slow, dw.rec().passed], ['hall', 'pace-ok', 0, true], `${name}: a witnessed pass ends the run`);
    dw.pace(boot, T + 2 * M);
    assert.deepEqual([dw.rec().verdict, dw.rec().why, dw.rec().slow], ['hall', 'pace-doubt', 1], `${name}: after a witnessed pass it is the first again`);
  }
  // a WITNESSED pass gives the standing: the stage itself stood on the hall's pace (a display, or a browser, at 30 Hz)
  const w = bootOf(leaf, rep(60, 33.33), rep(130, 33.33), { stamped: true });
  assert.deepEqual([w.period.ms, w.period.stage, w.period.witnessed], [33.33, 60, true]);
  dev = device(rules);
  dev.pace(w, T);
  assert.deepEqual([dev.rec().verdict, dev.rec().passed, dev.rec().pace.witnessed], ['hall', true, true], 'a pass on a witnessed period: the standing');
  dev.pace(a, T + M);
  assert.deepEqual([dev.rec().verdict, dev.rec().why, dev.rec().slow, dev.rec().passed], ['hall', 'pace-doubt', 1, true], 'so ONE slow boot after it is doubt, as before');
  dev.pace(d, T + 2 * M);
  assert.deepEqual([dev.rec().verdict, dev.rec().why, dev.rec().slow, dev.rec().passed], ['hall', 'pace-ok', 1, true], 'a standing once given is kept through a pass without a witness, and so is the slow run before it');
  // a report that does not say (a leaf of another build): no standing either. Only the leaf's own `true` gives it
  for (const said of [undefined, null, 'yes', 1, false]) {
    dev = device(rules);
    dev.pace({ ...w, period: { ...w.period, witnessed: said } }, T);
    assert.deepEqual([dev.rec().verdict, dev.rec().passed, dev.rec().pace.witnessed], ['hall', false, false], `witnessed ${String(said)}`);
  }
};
await ok('the hall\'s own intervals do not outvote the stage\'s (the frame\'s own time stamps): a stage with 12 of 151 intervals on a 60 Hz period, or 5 / 15 / 20 / 40 of 200 on a 120 Hz period, under a hall at two periods is condemned: at once where the period holds a tenth of all intervals (20, 40), on the second boot in a row where it is thin (12, 5, 15), as are a display whose rate changed during the boot and five early halves between stamps; four are no evidence, the hall is shown and the pass gives no standing; a witnessed pass does; the hook\'s own clock keeps the tenth', () => dilution(R));
await plant('the leaf never says that a period is thin', paceText, swap('thin: j - i < need', 'thin: false'), (text) => dilution(R, text));
await plant('the leaf calls every period thin (a period on a tenth of all intervals no longer decides at once)', paceText, swap('thin: j - i < need', 'thin: true'), (text) => dilution(R, text));
await plant('a thin period condemns on the first boot (the leaf\'s own five intervals through the record)', RULES, swap('condemned = !(rec.passed || thin) ||', 'condemned = !rec.passed ||'), (t) => dilution(load(t)));
await plant('the tenth of all is asked of every cluster again (the hall outvotes the stage)', paceText, swap('(exact === true && v[j - 1] < common ? PACE_CLUSTER_MIN : need)', '(need)'), (text) => dilution(R, text));
await plant('five intervals make a period on the hook\'s own clock too', paceText, swap('const exact = stamped > 0 && clocked === 0;', 'const exact = true;'), (text) => dilution(R, text));
await plant('every period is called witnessed', paceText, swap('witnessed: seen >= PACE_CLUSTER_MIN', 'witnessed: true'), (text) => dilution(R, text));
await plant('the witness counts the hall\'s own intervals', paceText, swap('stageAll.filter((x) => x >= period.ms / PACE_CLUSTER_WIDTH', 'stageAll.concat(sets.hall).filter((x) => x >= period.ms / PACE_CLUSTER_WIDTH'), (text) => dilution(R, text));
await plant('every pass gives the standing (a hall measured against itself has "passed")', RULES, swap('passed: rec.passed || numbers.witnessed', 'passed: true'), (t) => dilution(load(t)));
await plant('a standing is lost at the next pass without a witness', RULES, swap('passed: rec.passed || numbers.witnessed', 'passed: numbers.witnessed'), (t) => dilution(load(t)));
await plant('any pass ends a run of slow boots (the leaf\'s own reports through the record)', RULES, swap('slow: numbers.witnessed ? 0 : rec.slow', 'slow: 0'), (t) => dilution(load(t)));
await plant('a report that does not say is taken as witnessed', RULES, swap('witnessed: pace?.period?.witnessed === true', 'witnessed: pace?.period?.witnessed !== false'), (t) => dilution(load(t)));

// ---- 4b. a player's way out of a wrong `old` verdict: choosing Tournament anew ---------------------------------------------
const anewRules = (rules) => {
  assert.deepEqual([...rules.LOOK_ANEW_WHYS], ['pace-floor', 'pace-median', 'pace-over', 'pace-p95', 'timeout'], 'what a player may clear: a pace verdict, a timeout verdict, nothing else');
  // a slow boot under load condemned the device; the player chooses Tournament anew; the next boot measures again
  let d = device(rules);
  d.pace(pace(SLOW), T0);
  assert.equal(d.boot(T0 + MIN).why, 'light-new');
  const before = d.rec();
  const cleared = d.anew(T0 + 2 * MIN);
  assert.deepEqual(cleared, { ...before, verdict: null, why: 'anew', at: T0 + 2 * MIN, slow: 0, fails: { fetch: 0, build: 0, timeout: 0 } }, 'the cleared record: no verdict, why anew, no slow run, no failure counts; its history (passed, the numbers, the reason) kept');
  assert.deepEqual([cleared.passed, cleared.pace.hall.median, cleared.app], [false, 33.33, APP]);
  assert.deepEqual(d.boot(T0 + 3 * MIN), out('default', 'hall', 'stage', 'base', 'pass-anew'), 'the next boot shows the hall and measures again');
  assert.equal(d.anew(T0 + 3 * MIN), null, 'nothing left to clear: a second choice writes nothing');
  d.pace(pace(FAST), T0 + 4 * MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().passed], ['hall', 'pace-ok', true], 'a fast boot then stores the hall');
  // ... and a device that is slow again is condemned again at once (it never passed): the way out is not a way around
  d = device(rules); d.pace(pace(SLOW), T0); d.anew(T0 + MIN); d.pace(pace(SLOW), T0 + 2 * MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().slow], ['old', 'pace-median', 1]);
  // a device that had passed keeps that: after the way out it again takes two slow boots in a row
  d = device(rules); d.pace(pace(FAST), T0); d.pace(pace(SLOW), T0 + MIN); d.pace(pace(SLOW), T0 + 2 * MIN);
  assert.equal(d.rec().verdict, 'old'); d.anew(T0 + 3 * MIN);
  assert.deepEqual([d.rec().passed, d.rec().slow], [true, 0]); d.pace(pace(SLOW), T0 + 4 * MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why], ['hall', 'pace-doubt']);
  // every pace code and the timeout are cleared; a timeout's count goes to zero (two tries again)
  for (const hall of [{ median: 50, p95: 70, over: 1 }, { median: PERIOD * 2, p95: PERIOD * 2.2, over: 0.9 }, { over: 0.3, p95: PERIOD * 2 }, { over: 0.06, p95: PERIOD * 4 }]) {
    d = device(rules); d.pace(pace({ hall }), T0);
    assert.ok(/^pace-(floor|median|over|p95)$/.test(d.rec().why) && d.rec().verdict === 'old');
    assert.equal(d.anew(T0 + MIN).verdict, null, `a ${d.rec().why} verdict is cleared`); assert.equal(d.boot(T0 + 2 * MIN).why, 'pass-anew');
  }
  d = device(rules); d.failed('timeout', T0); d.failed('timeout: x', T0 + MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why], ['old', 'timeout']); d.anew(T0 + 2 * MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().fails, d.rec().reason], [null, 'anew', { fetch: 0, build: 0, timeout: 0 }, 'timeout: x']);
  d.failed('timeout', T0 + 3 * MIN);
  assert.equal(d.rec().verdict, null, 'after the way out a timeout is again the first of two');
  // NEVER a build failure's (it would fail again), NEVER a test launcher's pin, and nothing that is not an old verdict
  d = device(rules); d.failed('room: x', T0);
  assert.deepEqual([d.rec().verdict, d.rec().why], ['old', 'build']);
  assert.equal(d.anew(T0 + MIN), null, 'a build verdict stays'); assert.equal(d.boot(T0 + 2 * MIN).why, 'verdict-old');
  for (const prev of [{ ...OLD(), why: 'pin' }, { ...OLD(), why: 'build' }, { ...OLD(), why: 'pinned' }, { ...OLD(), why: null }, { ...OLD(), why: 'anew' }, { ...OLD(), verdict: 'hall', why: 'pace-ok' }, { ...OLD(), verdict: 'hall', why: 'pace-doubt' },
    { ...OLD(), verdict: null, why: 'pace-median' }, rules.lookFresh(APP), null, undefined]) {
    assert.equal(rules.lookAnew(prev, T0), null, `not cleared: ${JSON.stringify(prev)}`);
  }
  assert.equal(rules.lookAnew(rules.lookRecord(JSON.stringify(OLD('another version')), APP), T0), null, 'a record of another app version is no record: nothing to clear');
};
await ok('a player\'s way out of a wrong old verdict (the rule): a pace or timeout verdict is cleared, the next boot measures again; a build verdict and a pin stay', () => anewRules(R));
await plant('the way out clears a test launcher\'s pin', RULES, swap("['pace-floor', 'pace-median', 'pace-over', 'pace-p95', 'timeout']", "['pace-floor', 'pace-median', 'pace-over', 'pace-p95', 'timeout', 'pin']"), (t) => anewRules(load(t)));
await plant('the way out clears a build failure', RULES, swap("['pace-floor', 'pace-median', 'pace-over', 'pace-p95', 'timeout']", "['pace-floor', 'pace-median', 'pace-over', 'pace-p95', 'timeout', 'build']"), (t) => anewRules(load(t)));
await plant('the way out forgets the timeout', RULES, swap("'pace-p95', 'timeout']", "'pace-p95']"), (t) => anewRules(load(t)));
await plant('the way out clears any old verdict', RULES, swap("if (prev?.verdict !== 'old' || !LOOK_ANEW_WHYS.includes(prev.why)) return null;", "if (prev?.verdict !== 'old') return null;"), (t) => anewRules(load(t)));
await plant('the way out keeps the failure counts and the slow run', RULES, swap("{ ...prev, verdict: null, why: 'anew', at: now, slow: 0, fails: { fetch: 0, build: 0, timeout: 0 } }", "{ ...prev, verdict: null, why: 'anew', at: now }"), (t) => anewRules(load(t)));
await plant('the way out erases that the device had passed', RULES, swap("{ ...prev, verdict: null, why: 'anew', at: now, slow: 0,", "{ ...prev, passed: false, verdict: null, why: 'anew', at: now, slow: 0,"), (t) => anewRules(load(t)));
await plant('the boot after the way out does not say so', RULES, swap("(rec?.why === 'anew' ? 'pass-anew' : 'pass-new')", "'pass-new'"), (t) => anewRules(load(t)));
// ---- 4c. THE CHAIN (step 2): the standard hall, the light hall, the old room ---------------------------------------------
// The record's own fields are the verdict on the standard hall, to the letter of step 1; its member `lite` holds the same
// fields for the light hall. An `old` on the standard hall by a pace or a timeout leads to the light hall (the stage
// flow, `rung: 'lite'`), judged by the same rule on its own fields; `lite.verdict` `old` is the old room.
// STEP1_OLD: what step 1 stores after ONE slow boot of a device that never passed, byte for byte (the rows below hold
// the rules to it). STEP1_LOOK_RECORD: step 1's reader, frozen as text (main c44ca683, lines 739 to 749).
const STEP1_OLD = '{"v":1,"app":"0.1.0+kernel|htmlid|1","verdict":"old","why":"pace-median","at":1763452809000,"passed":false,"slow":1,"fails":{"fetch":0,"build":0,"timeout":0},"failAt":null,"reason":null,"pace":{"period":16.67,"clock":"frame","frames":40,"share":0.6,"stageOn":40,"thin":false,"witnessed":true,"how":"shortest stable interval","hall":{"frames":120,"median":33.33,"p95":40,"over":0.93,"closedBy":"frames"},"stage":{"dirty":true,"frames":200,"median":180,"p95":900,"over":0.95,"before":{"frames":0,"median":null,"p95":null,"over":null}},"hidden":0}}';
const STEP1_LOOK_RECORD = `function lookRecord(raw, app) {
    let r = null;
    try { r = typeof raw === 'string' ? JSON.parse(raw) : null; } catch { r = null; }
    if (!r || typeof r !== 'object' || Array.isArray(r) || r.v !== 1 || typeof app !== 'string' || r.app !== app) return null;
    const count = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0), fails = r.fails && typeof r.fails === 'object' ? r.fails : {};
    return { v: 1, app, verdict: r.verdict === 'hall' || r.verdict === 'old' ? r.verdict : null, why: typeof r.why === 'string' ? r.why : null,
      at: Number.isFinite(r.at) ? r.at : null, passed: r.passed === true, slow: count(r.slow),
      fails: { fetch: count(fails.fetch), build: count(fails.build), timeout: count(fails.timeout) },
      failAt: Number.isFinite(r.failAt) ? r.failAt : null, reason: typeof r.reason === 'string' ? r.reason : null,
      pace: r.pace && typeof r.pace === 'object' ? r.pace : null };
  }`;
const step1Record = new Function(`${STEP1_LOOK_RECORD}\nreturn lookRecord;`)();
const chain = (rules) => {
  const lite = (over = {}) => ({ ...rules.lookFreshRung(), ...over });
  const top = (why, extra = {}) => ({ ...OLD(), why, ...extra });
  const WAIT = rules.LOOK_FETCH_WAIT_MS, twice = { fetch: 2, build: 0, timeout: 0 };
  // (a) what a boot shows, by the record
  for (const why of rules.LOOK_ANEW_WHYS) {
    want(rules, '', { record: top(why) }, light('default'), { stored: 1, facts: 1, record: 1 }, `old by ${why}, the light hall not tried`);
    want(rules, '', { record: top(why, { lite: lite({ verdict: 'hall', why: 'pace-ok', passed: true }) }) }, light('default', 'light-verdict'), null, `old by ${why}, the light hall passed`);
    want(rules, '', { record: top(why, { lite: lite({ verdict: 'hall', why: 'pace-doubt', slow: 1 }) }) }, light('default', 'light-verdict'), null, `old by ${why}, the light hall in doubt`);
    for (const fails of [{ fetch: 1, build: 0, timeout: 0 }, { fetch: 0, build: 0, timeout: 1 }]) want(rules, '', { record: top(why, { lite: lite({ fails, failAt: 5 }) }) }, light('default', 'light-retry'), null, `old by ${why}, the light hall failed once`);
    for (const lw of [...rules.LOOK_ANEW_WHYS, 'build']) want(rules, '', { record: top(why, { lite: lite({ verdict: 'old', why: lw }) }) }, out('default', 'old', 'none', 'base', 'verdict-old'), { stored: 1, facts: 1, record: 1 }, `old by ${why}, the light hall old by ${lw}: the old room`);
  }
  // a pin and a build failure have no lighter rung, whatever `lite` holds
  for (const why of ['pin', 'build', 'pinned', '', null]) for (const l of [undefined, lite({ verdict: 'hall', why: 'pace-ok' }), lite({ verdict: 'old', why: 'pace-median' })]) {
    assert.deepEqual(decide(rules, '', { record: top(why, l ? { lite: l } : {}) }).d, out('default', 'old', 'none', 'base', why === 'pin' ? 'verdict-pin' : 'verdict-old'), `old by ${String(why)}: the old room on every rung`);
  }
  // a hall verdict, or none, on the standard hall: the standard hall, whatever `lite` holds
  for (const l of [lite({ verdict: 'old', why: 'pace-median' }), lite({ verdict: 'hall', why: 'pace-ok' })]) {
    assert.deepEqual(decide(rules, '', { record: { ...HALL_REC, lite: l } }).d, out('default', 'hall', 'stage', 'base', 'pass-verdict'));
    assert.deepEqual(decide(rules, '', { record: { ...rules.lookFresh(APP), lite: l } }).d, out('default', 'hall', 'stage', 'base', 'pass-new'));
  }
  // the decision's tier stays the device's own; a lite DEVICE keeps the old room and reads no record, as before
  assert.deepEqual(decide(rules, 'clubtier=high', { record: top('pace-median') }).d, light('default', 'light-new', 'high'));
  want(rules, '', { facts: LITE, record: top('pace-median') }, out('default', 'old', 'none', 'lite', 'tier-lite'), { stored: 1, facts: 1, record: 0 });
  // every row that reaches Tournament on a real-user boot takes the chain; no other row does
  assert.deepEqual(decide(rules, 'look=tournament', { record: top('pace-median') }).d, light('url:tournament'));
  for (const stored of ['tournament', 'arena']) assert.deepEqual(decide(rules, '', { stored, record: top('timeout') }).d, light(`stored:${stored}`));
  for (const [query, o] of [['look=arena', {}], ['look=club', {}], ['look=green', {}], ['look=sp', {}], ['look=tournament', { scripted: true }], ['', { scripted: true }], ['', { stored: 'green' }], ['', { stored: 'club' }]]) {
    assert.equal('rung' in decide(rules, query, { ...o, record: top('pace-median') }).d, false, `?${query}: no light rung`);
  }
  assert.equal('rung' in decide(rules, '', {}).d, false, 'the standard hall\'s decision has no `rung` member');
  assert.deepEqual(decide(rules, '', { net: OFF, record: top('pace-median') }).d, out('default', 'old', 'none', 'base', 'offline'), 'offline over http(s): the old room before the record, as on the standard rung');
  // (b) the fetch wait is read on the rung that is asked for
  assert.deepEqual(decide(rules, '', { now: T0 + MIN, record: top('pace-median', { lite: lite({ fails: twice, failAt: T0 }) }) }).d, out('default', 'old', 'none', 'base', 'fetch-wait'), 'two failed fetches of the light hall: the old room for the hour');
  assert.deepEqual(decide(rules, '', { now: T0 + WAIT, record: top('pace-median', { lite: lite({ fails: twice, failAt: T0 }) }) }).d, light('default', 'light-retry'), 'then one try more of the light hall');
  assert.deepEqual(decide(rules, '', { now: T0 + MIN, record: top('pace-median', { fails: twice, failAt: T0 }) }).d, light('default'), 'the standard hall\'s own failed fetches do not hold the light hall off');
  assert.deepEqual(decide(rules, '', { now: T0 + MIN, record: { ...HALL_REC, lite: lite({ fails: twice, failAt: T0 }) } }).d, out('default', 'hall', 'stage', 'base', 'pass-verdict'), 'and the light hall\'s do not hold the standard hall off');
  // (c) over boots: one slow boot does the same thing at each rung
  let d = device(rules);
  assert.equal(d.boot(T0).why, 'pass-new'); d.pace(pace(SLOW), T0 + 9000);
  assert.equal(d.raw, STEP1_OLD, 'the standard rung\'s record is written to the letter of step 1: no new member');
  assert.deepEqual(d.boot(T0 + MIN), light('default'), 'boot 2: the light hall, by the stage flow');
  const topWas = d.rec();
  d.pace(pace({ ...FAST, tier: 'lite' }), T0 + MIN + 9000);
  let r = d.rec();
  assert.deepEqual([{ ...r, lite: null }, r.lite?.verdict, r.lite?.why, r.lite?.at, r.lite?.passed, r.lite?.slow, r.lite?.pace?.hall?.median], [{ ...topWas, lite: null }, 'hall', 'pace-ok', T0 + MIN + 9000, true, 0, 16.83], 'the light hall\'s pass is booked under `lite`; the standard hall\'s fields stand as they were');
  for (const now of [T0 + 2 * MIN, T0 + 400 * 24 * 60 * MIN]) assert.deepEqual(d.boot(now), light('default', 'light-verdict'), 'boot 3 and every later one: the light hall; the standard hall is not tried again by itself');
  d.pace(pace({ ...SLOW, tier: 'lite' }), T0 + 3 * MIN);
  assert.deepEqual([d.rec().lite?.verdict, d.rec().lite?.why, d.rec().lite?.slow, d.boot(T0 + 4 * MIN).why], ['hall', 'pace-doubt', 1, 'light-verdict'], 'the light hall with standing: one slow boot is doubt');
  d.pace(pace({ ...SLOW, tier: 'lite' }), T0 + 4 * MIN);
  assert.deepEqual([d.rec().lite?.verdict, d.rec().lite?.why, d.rec().lite?.slow], ['old', 'pace-median', 2], 'the second in a row: the light hall is condemned');
  assert.deepEqual({ ...d.rec(), lite: null }, { ...topWas, lite: null }, 'the standard hall\'s fields did not move through any of it');
  for (const now of [T0 + 5 * MIN, T0 + 400 * 24 * 60 * MIN]) assert.deepEqual(d.boot(now), out('default', 'old', 'none', 'base', 'verdict-old'), 'condemned on both rungs: the old room, no leaf asked');
  // THE LIGHT HALL STARTS WITHOUT STANDING: a pass on the standard hall says nothing of a device that was then condemned there
  d = device(rules); d.pace(pace(FAST), T0); d.pace(pace(SLOW), T0 + MIN); d.pace(pace(SLOW), T0 + 2 * MIN);
  assert.deepEqual([d.rec().verdict, d.rec().passed, d.boot(T0 + 3 * MIN).why], ['old', true, 'light-new']);
  d.pace(pace(SLOW), T0 + 3 * MIN);
  assert.deepEqual([d.rec().lite?.verdict, d.rec().lite?.why, d.rec().lite?.passed, d.rec().lite?.slow], ['old', 'pace-median', false, 1], 'one slow boot of the light hall on a device that never passed THERE: the old room at once');
  // a thin period at the light rung: doubt, then the old room; the floor condemns at once; no verdict stores nothing
  d = device(rules); d.pace(pace(SLOW), T0); d.boot(T0 + MIN); d.pace(pace({ ...SLOW, thin: true }), T0 + MIN);
  assert.deepEqual([d.rec().lite?.verdict, d.rec().lite?.why], ['hall', 'pace-doubt']); d.boot(T0 + 2 * MIN); d.pace(pace({ ...SLOW, thin: true }), T0 + 2 * MIN);
  assert.deepEqual([d.rec().lite?.verdict, d.rec().lite?.why, d.rec().lite?.slow], ['old', 'pace-median', 2]);
  d = device(rules); d.pace(pace(SLOW), T0); d.boot(T0 + MIN); d.pace(pace({ hall: { median: 50, p95: 70, over: 1 }, thin: true }), T0 + MIN);
  assert.deepEqual([d.rec().lite?.verdict, d.rec().lite?.why], ['old', 'pace-floor']);
  d = device(rules); d.pace(pace(SLOW), T0); d.boot(T0 + MIN); const w0 = d.writes;
  assert.equal(d.pace(pace({ ...FAST, hidden: 3 }), T0 + MIN), null); assert.deepEqual([d.writes, 'lite' in d.rec()], [w0, false], 'no verdict at the light rung: nothing stored');
  // two timeouts on the standard rung lead to the light hall as well (it builds less); two more there are the old room
  d = device(rules); d.failed('timeout', T0); d.boot(T0 + MIN); d.failed('timeout: x', T0 + MIN);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.boot(T0 + 2 * MIN)], ['old', 'timeout', light('default')]);
  d.failed('timeout', T0 + 2 * MIN);
  assert.deepEqual([d.rec().lite?.verdict, d.rec().lite?.fails, d.rec().fails.timeout, d.boot(T0 + 3 * MIN)], [null, { fetch: 0, build: 0, timeout: 1 }, 2, light('default', 'light-retry')], 'a timeout of the light hall is counted on its own fields');
  d.failed('timeout: y', T0 + 3 * MIN);
  assert.deepEqual([d.rec().lite?.verdict, d.rec().lite?.why, d.boot(T0 + 4 * MIN).why], ['old', 'timeout', 'verdict-old']);
  d = device(rules); d.pace(pace(SLOW), T0); d.boot(T0 + MIN);
  assert.equal(d.failed('timeout', T0 + MIN, true), null, 'a hidden page\'s timeout is not counted at the light rung either');
  // a failed fetch of the light hall: never a verdict; the hour's hold after two in a row, on that rung
  d = device(rules); d.pace(pace(SLOW), T0); d.boot(T0 + MIN); d.failed('import', T0 + MIN); assert.equal(d.boot(T0 + 2 * MIN).why, 'light-retry'); d.failed('assets: x', T0 + 2 * MIN);
  assert.deepEqual([d.rec().lite?.verdict, d.rec().lite?.fails?.fetch, d.boot(T0 + 3 * MIN), d.boot(T0 + 2 * MIN + WAIT)], [null, 2, out('default', 'old', 'none', 'base', 'fetch-wait'), light('default', 'light-retry')]);
  // a build failure of the light hall: `lite` old by build, the old room; of the STANDARD hall: no lighter rung (the same code builds both)
  d = device(rules); d.pace(pace(SLOW), T0); d.boot(T0 + MIN); d.failed('room: x', T0 + MIN);
  assert.deepEqual([d.rec().lite?.verdict, d.rec().lite?.why, d.rec().verdict, d.rec().why, d.boot(T0 + 2 * MIN).why], ['old', 'build', 'old', 'pace-median', 'verdict-old']);
  d = device(rules); d.failed('room: x', T0);
  assert.deepEqual(d.boot(T0 + MIN), out('default', 'old', 'none', 'base', 'verdict-old'));
  // a mismatch (the app and the leaf are of two versions) stores nothing, on either rung, whatever is stored
  for (const rung of [undefined, 'base', 'lite']) for (const prev of [null, rules.lookFresh(APP), OLD(), OLD2()]) {
    assert.equal(rules.lookAfterFailed(prev, 'mismatch: the leaf speaks stage protocol 3, the app 2', APP, T0, false, rung), null, `a mismatch stores nothing (rung ${rung})`);
  }
  // (d) the way out: Tournament chosen anew drops the light hall's record with the standard hall's verdict
  d = device(rules); d.pace(pace(SLOW), T0); d.boot(T0 + MIN); d.pace(pace(SLOW), T0 + MIN);
  assert.equal(d.boot(T0 + 2 * MIN).why, 'verdict-old');
  const cleared = d.anew(T0 + 3 * MIN);
  assert.deepEqual(['lite' in cleared, cleared.verdict, cleared.why, 'lite' in d.rec()], [false, null, 'anew', false], 'the cleared record holds no `lite`');
  assert.deepEqual(d.boot(T0 + 4 * MIN), out('default', 'hall', 'stage', 'base', 'pass-anew'), 'the next boot is the STANDARD hall, measured again');
  d.pace(pace(SLOW), T0 + 4 * MIN);
  assert.deepEqual(d.boot(T0 + 5 * MIN), light('default'), 'slow again: the light hall follows, tried anew (not the old room by a record of before)');
  d = device(rules); d.pace(pace(SLOW), T0); d.boot(T0 + MIN); d.pace(pace(FAST), T0 + MIN);
  assert.equal(d.anew(T0 + 2 * MIN).why, 'anew'); assert.deepEqual(['lite' in d.rec(), d.boot(T0 + 3 * MIN).why], [false, 'pass-anew'], 'from the light hall too: the standard hall again');
  assert.equal(rules.lookAnew({ ...HALL_REC, lite: lite({ verdict: 'old', why: 'pace-median' }) }, T0), null, 'a `lite` member alone is nothing to clear');
  for (const why of ['build', 'pin']) assert.equal(rules.lookAnew(top(why, { lite: lite({ verdict: 'old', why: 'pace-median' }) }), T0), null, `an old by ${why} stays, with its member`);
  // (d2) AFTER THE WAY OUT the page may still show the light hall: its late report, or its late failure, stores nothing.
  // The light hall's row is written only under a standard-hall verdict that leads to it.
  const anewed = rules.lookAnew(top('pace-median', { lite: lite({ verdict: 'hall', why: 'pace-ok', passed: true }) }), T0);
  assert.deepEqual([anewed.verdict, anewed.why, 'lite' in anewed], [null, 'anew', false]);
  assert.equal(rules.lookAfterPace(anewed, pace({ ...SLOW, tier: 'lite' }), APP, T0 + 9000, true, 'lite'), null, 'a late report of the light hall after the way out stores nothing');
  assert.equal(rules.lookAfterFailed(anewed, 'timeout', APP, T0 + 9000, false, 'lite'), null, 'a late failure of the light hall after the way out stores nothing');
  for (const prev of [null, rules.lookFresh(APP), HALL_REC, top('build'), top('pin')]) {
    assert.equal(rules.lookAfterPace(prev, pace({ ...FAST, tier: 'lite' }), APP, T0, true, 'lite'), null, `no light-hall row under a standard hall that does not lead to it (${prev?.verdict} ${prev?.why})`);
    assert.equal(rules.lookAfterFailed(prev, 'room: x', APP, T0, false, 'lite'), null, `no light-hall failure either (${prev?.verdict} ${prev?.why})`);
  }
  assert.equal(rules.lookAfterPace(anewed, pace(SLOW), APP, T0 + 9000, true)?.verdict, 'old', 'the standard hall\'s own writer is not held by it');
  for (const why of rules.LOOK_ANEW_WHYS) assert.equal(rules.lookAfterPace(top(why), pace({ ...FAST, tier: 'lite' }), APP, T0, true, 'lite')?.lite?.verdict, 'hall', `under an old by ${why} the light hall's report is booked`);
  // (e) THE RETURNING VISITOR: a step-1 record of a pace-condemned device, byte for byte, is the light hall's row as it stands; and back
  assert.deepEqual(decide(rules, '', { record: STEP1_OLD }).d, light('default'), 'a step-1 record: the light hall, nothing migrated, nothing cleared');
  assert.deepEqual(rules.lookRecord(STEP1_OLD, APP), step1Record(STEP1_OLD, APP), 'step 2 reads a step-1 record to the same fields');
  const back = step1Record(JSON.stringify(top('pace-median', { lite: lite({ verdict: 'hall', why: 'pace-ok', passed: true, at: 9 }) })), APP);
  assert.deepEqual([back.verdict, back.why, 'lite' in back], ['old', 'pace-median', false], 'a step-1 app that meets a step-2 record reads the standard hall\'s fields alone: the old room, as it did');
  assert.deepEqual(decide(rules, '', { record: JSON.stringify(back) }).d, light('default'), 'and if it rewrites the record, `lite` is gone: not tried');
  // the member is read field by field like the record; junk is no member
  const odd = rules.lookRecord(JSON.stringify({ ...OLD(), lite: { verdict: 'maybe', why: 7, at: 'x', passed: 'yes', slow: -3, fails: { fetch: '2', build: 1.9, timeout: null }, failAt: {}, reason: 9, pace: 'p' } }), APP);
  assert.deepEqual(odd.lite, { ...rules.lookFreshRung(), fails: { fetch: 0, build: 1, timeout: 0 } });
  for (const junk of [null, 5, 'x', [], true]) assert.equal('lite' in rules.lookRecord(JSON.stringify({ ...OLD(), lite: junk }), APP), false, `lite ${JSON.stringify(junk)}: no member`);
  assert.deepEqual(['lite', 'base', 'high', undefined, 'ultra', null, ''].map(rules.lookRungOf), ['lite', 'base', 'base', null, null, null, null], 'the rung of a built tier');
};
await ok('the chain (step 2): an old by pace or timeout on the standard hall leads to the light hall, judged by the same rule on its own fields; condemned there, the old room; a pin and a build failure have no lighter rung; a mismatch stores nothing; the way out drops both; a step-1 record is the light hall\'s row as it stands, and back', () => chain(R));
await plant('an old by pace keeps the old room (no light rung)', RULES, swap("lite = rec?.verdict === 'old' && LOOK_ANEW_WHYS.includes(rec.why) ? (rec.lite ?? lookFreshRung()) : null;", 'lite = null;'), (t) => chain(load(t)));
await plant('a build failure leads to the light hall', RULES, swap("rec?.verdict === 'old' && LOOK_ANEW_WHYS.includes(rec.why) ? (rec.lite", "rec?.verdict === 'old' && rec.why !== 'pin' ? (rec.lite"), (t) => chain(load(t)));
await plant('a pin leads to the light hall', RULES, swap("rec?.verdict === 'old' && LOOK_ANEW_WHYS.includes(rec.why) ? (rec.lite", "rec?.verdict === 'old' ? (rec.lite"), (t) => chain(load(t)));
await plant('the light hall is asked for after it was condemned', RULES, swap("(!lite || lite.verdict === 'old')) return out", '!lite) return out'), (t) => chain(load(t)));
await plant('a late report of the light hall is booked after the way out', RULES, swap("    if (!(top.verdict === 'old' && LOOK_ANEW_WHYS.includes(top.why))) return null;\n    const next = lookPaceOnRung(", '    const next = lookPaceOnRung('), (t) => chain(load(t)));
await plant('a late failure of the light hall is booked after the way out', RULES, swap("    if (!(top.verdict === 'old' && LOOK_ANEW_WHYS.includes(top.why))) return null;\n    const next = lookFailedOnRung(", '    const next = lookFailedOnRung('), (t) => chain(load(t)));
await plant('the light hall\'s fetch wait is read on the standard hall\'s counts', RULES, swap('waiting(lite ?? rec)', 'waiting(rec)'), (t) => chain(load(t)));
await plant('the light hall\'s decision names no rung', RULES, swap("'light-new'), 'lite');", "'light-new'));"), (t) => chain(load(t)));
await plant('a light-rung report is booked on the standard hall\'s fields', RULES, swap("if (rung !== 'lite') return lookPaceOnRung(top, pace, now, visible);", 'if (true) return lookPaceOnRung(top, pace, now, visible);'), (t) => chain(load(t)));
await plant('the light hall inherits the standard hall\'s standing', RULES, swap('lookPaceOnRung(top.lite ?? lookFreshRung(), pace, now, visible)', 'lookPaceOnRung(top.lite ?? top, pace, now, visible)'), (t) => chain(load(t)));
await plant('a light-rung failure is counted against the standard hall', RULES, swap("if (rung !== 'lite') return lookFailedOnRung(top, reason, now, hidden);", 'if (true) return lookFailedOnRung(top, reason, now, hidden);'), (t) => chain(load(t)));
await plant('a mismatch is read as a build failure', RULES, swap("(/^mismatch\\b/.test(r) ? 'mismatch' : 'build')", "'build'"), (t) => chain(load(t)));
await plant('a mismatch is stored', RULES, swap("    if (lookFailClass(reason) === 'mismatch') return null;\n", ''), (t) => chain(load(t)));
await plant('the way out keeps the light hall\'s record', RULES, swap(' delete next.lite;', ''), (t) => chain(load(t)));
await plant('the member `lite` is not read', RULES, swap('return { v: 1, app, ...top, ...(lite ? { lite } : null) };', 'return { v: 1, app, ...top };'), (t) => chain(load(t)));

// ---- 4d. THE TIMED CARRY: a pace `old` outlives an app version for 90 days (the same generation), then one more try -----------
const DAY = 24 * 60 * MIN;
const carry = (rules) => {
  assert.equal(rules.LOOK_CARRY_MS, 90 * DAY, 'ninety days'); assert.deepEqual([...rules.LOOK_PACE_WHYS], ['pace-floor', 'pace-median', 'pace-over', 'pace-p95']);
  const V1 = '0.1.0+kernel|htmlid|1', V2 = '0.1.1+kernel2|htmlid2|1', G2 = '0.1.1+kernel2|htmlid2|2';
  const made = (why, at, extra = {}) => JSON.stringify({ ...OLD(V1), why, at, passed: true, slow: 2, fails: { fetch: 1, build: 0, timeout: 1 }, failAt: at, reason: 'import', pace: { period: 16.67 }, ...extra });
  const rung = (why, at) => ({ ...rules.lookFreshRung(), verdict: 'old', why, at, pace: { period: 16.67 } });
  for (const why of rules.LOOK_PACE_WHYS) {
    assert.equal(rules.lookRecord(made(why, T0), V1, T0 + 400 * DAY).slow, 2, 'under the version it was made in: the record as it is, whatever its age');
    // under another version of the same generation: carried while it is under 90 days old, as that verdict alone
    for (const age of [0, 1, DAY, 89 * DAY, 90 * DAY - 1]) {
      assert.deepEqual(rules.lookRecord(made(why, T0), V2, T0 + age), { v: 1, app: V2, ...rung(why, T0) }, `${why}, ${age} ms old, another app version: carried as the verdict alone (its why, its at, its numbers; no standing, no slow run, no failure count)`);
      assert.deepEqual(decide(rules, '', { record: made(why, T0), app: V2, now: T0 + age }).d, light('default'), `${why}, ${age} ms old: the standard hall is not sat through again; the light hall`);
    }
    for (const age of [90 * DAY, 91 * DAY, 400 * DAY]) {
      assert.equal(rules.lookRecord(made(why, T0), V2, T0 + age), null, `${why}, ${age} ms old: lapsed`);
      assert.deepEqual(decide(rules, '', { record: made(why, T0), app: V2, now: T0 + age }).d, out('default', 'hall', 'stage', 'base', 'pass-new'), `${why} after 90 days: one more try of the standard hall`);
    }
    // a clock that reads before the verdict, no clock, an unreadable time: nothing is carried
    for (const now of [T0 - 1, undefined, null, NaN, 'now']) assert.equal(rules.lookRecord(made(why, T0), V2, now), null, `now ${String(now)}: not carried`);
    assert.equal(rules.lookRecord(made(why, null), V2, T0), null, 'a verdict without a time is not carried');
    // a raised generation ends it
    assert.equal(rules.lookRecord(made(why, T0), G2, T0 + DAY), null, 'a raised generation: not carried');
    assert.equal(decide(rules, '', { record: made(why, T0), app: G2, now: T0 + DAY }).d.why, 'pass-new');
  }
  // everything else lapses with its version, as ever: a pass, an old by timeout or build, a pin, a record with no verdict
  for (const [verdict, why] of [['hall', 'pace-ok'], ['hall', 'pace-doubt'], ['hall', 'pace-median'], ['old', 'timeout'], ['old', 'build'], ['old', 'pin'], ['old', 'anew'], ['old', null], [null, 'anew'], [null, 'pace-median']]) {
    assert.equal(rules.lookRecord(made(why, T0, { verdict }), V2, T0 + DAY), null, `${verdict} by ${why}: not carried`);
  }
  // a version without the generation's field is a generation of its own; a version that is no string is no record
  assert.equal(rules.lookRecord(made('pace-median', T0, { app: 'another version' }), V2, T0), null);
  assert.equal(rules.lookRecord(made('pace-median', T0, { app: 'x' }), 'y', T0), null);
  assert.equal(rules.lookRecord(made('pace-median', T0, { app: 7 }), V2, T0), null);
  // EACH RUNG BY ITS OWN TIME: the light hall's pace `old` is carried or dropped by its own `at`
  const both = (topWhy, topAt, liteWhy, liteAt, liteVerdict = 'old') => made(topWhy, topAt, { lite: { ...rules.lookFreshRung(), verdict: liteVerdict, why: liteWhy, at: liteAt, passed: true, slow: 2, pace: { period: 16.67 } } });
  assert.deepEqual(rules.lookRecord(both('pace-median', T0, 'pace-over', T0 + DAY), V2, T0 + 30 * DAY), { v: 1, app: V2, ...rung('pace-median', T0), lite: rung('pace-over', T0 + DAY) }, 'both carried');
  assert.deepEqual(decide(rules, '', { record: both('pace-median', T0, 'pace-over', T0 + DAY), app: V2, now: T0 + 30 * DAY }).d, out('default', 'old', 'none', 'base', 'verdict-old'), 'condemned on both rungs, under 90 days: the old room across the version');
  assert.deepEqual(rules.lookRecord(both('pace-median', T0, 'pace-over', T0 + 60 * DAY), V2, T0 + 100 * DAY), { v: 1, app: V2, ...rules.lookFreshRung(), lite: rung('pace-over', T0 + 60 * DAY) }, 'the standard hall\'s lapsed (one more try); the light hall\'s younger verdict stands');
  assert.equal(decide(rules, '', { record: both('pace-median', T0, 'pace-over', T0 + 60 * DAY), app: V2, now: T0 + 100 * DAY }).d.why, 'pass-new');
  for (const [lw, lv] of [['timeout', 'old'], ['build', 'old'], ['pace-ok', 'hall']]) {
    assert.deepEqual(rules.lookRecord(both('pace-median', T0, lw, T0 + DAY, lv), V2, T0 + 2 * DAY), { v: 1, app: V2, ...rung('pace-median', T0) }, `the light hall's ${lv} by ${lw} lapses: it is tried again`);
  }
  assert.deepEqual(rules.lookRecord(both('timeout', T0, 'pace-over', T0 + DAY), V2, T0 + 2 * DAY), { v: 1, app: V2, ...rules.lookFreshRung(), lite: rung('pace-over', T0 + DAY) }, 'an old by timeout lapses; the light hall\'s pace old under it is kept for the day the standard hall fails again');
  // over boots: a carried verdict is not renewed by being carried; what the new version stores keeps the FIRST time
  const d = device(rules, { version: V1 });
  d.pace(pace(SLOW), T0);
  d.version = V2;
  assert.deepEqual(d.boot(T0 + 30 * DAY), light('default'));
  d.pace(pace({ ...FAST, tier: 'lite' }), T0 + 30 * DAY);
  assert.deepEqual([d.rec().app, d.rec().verdict, d.rec().why, d.rec().at, d.rec().slow, d.rec().lite?.verdict, d.rec().lite?.at], [V2, 'old', 'pace-median', T0, 0, 'hall', T0 + 30 * DAY], 'the light hall\'s pass is stored under the new version, beside the carried verdict and ITS time');
  d.version = '0.1.2+kernel3|htmlid3|1';
  assert.deepEqual(d.boot(T0 + 60 * DAY), light('default'), 'a third version at 60 days: still carried; the light hall\'s pass lapsed with its version, so it is measured again');
  assert.deepEqual(d.boot(T0 + 90 * DAY), out('default', 'hall', 'stage', 'base', 'pass-new'), 'at 90 days from the FIRST verdict: one more try of the standard hall');
  // Settings anew ends it: the carried verdict is cleared like any other, and the clearing is stored under the new version
  const e = device(rules, { version: V1 }); e.pace(pace(SLOW), T0); e.version = V2;
  assert.equal(e.anew(T0 + DAY).why, 'anew');
  assert.deepEqual([e.rec().app, e.boot(T0 + 2 * DAY)], [V2, out('default', 'hall', 'stage', 'base', 'pass-anew')]);
  // within one version nothing ages: a pace old stands however old it is, as ever
  const f = device(rules, { version: V1 }); f.pace(pace(SLOW), T0); f.boot(T0 + MIN); f.pace(pace(SLOW), T0 + MIN);
  assert.equal(f.boot(T0 + 400 * DAY).why, 'verdict-old');
};
await ok('the timed carry: a pace old (each rung by its own time) is carried across app versions of the same generation while it is under 90 days old, as the verdict alone; 89 days carried, 90 and 91 lapsed; a pass, a timeout, a build failure and a pin lapse with their version; a raised generation and the way out end it', () => carry(R));
await plant('a pace old is carried for ever', RULES, swap('now - x.at < LOOK_CARRY_MS', 'now - x.at < Infinity'), (t) => carry(load(t)));
await plant('the carry ends a day early', RULES, swap('now - x.at < LOOK_CARRY_MS', 'now - x.at < LOOK_CARRY_MS - 24 * 3600000'), (t) => carry(load(t)));
await plant('the carry is 91 days', RULES, swap('LOOK_CARRY_MS = 90 * 24 * 3600000', 'LOOK_CARRY_MS = 91 * 24 * 3600000'), (t) => carry(load(t)));
await plant('any old verdict is carried (a timeout, a build failure, a pin)', RULES, swap("x.verdict === 'old' && LOOK_PACE_WHYS.includes(x.why) && Number.isFinite(x.at)", "x.verdict === 'old' && Number.isFinite(x.at)"), (t) => carry(load(t)));
await plant('a hall verdict is carried as an old one', RULES, swap("!!x && x.verdict === 'old' && LOOK_PACE_WHYS.includes(x.why)", '!!x && LOOK_PACE_WHYS.includes(x.why)'), (t) => carry(load(t)));
await plant('the carried record keeps its standing and its counts', RULES, swap("keep = (x) => ({ ...lookFreshRung(), verdict: 'old', why: x.why, at: x.at, pace: x.pace })", 'keep = (x) => ({ ...x })'), (t) => carry(load(t)));
await plant('a raised generation carries', RULES, swap('return gen(r.app) === gen(app) && (carried(top)', 'return (carried(top)'), (t) => carry(load(t)));
await plant('a clock that reads before the verdict carries', RULES, swap(' && now >= x.at && now - x.at', ' && now - x.at'), (t) => carry(load(t)));
await plant('the light hall\'s verdict is carried only with the standard hall\'s', RULES, swap('(carried(top) || carried(lite)) ?', 'carried(top) ?'), (t) => carry(load(t)));
await plant('the light hall\'s verdict is carried by the standard hall\'s time', RULES, swap('...(carried(lite) ? { lite: keep(lite) } : null) } : null;', '...(lite && carried(top) ? { lite: keep(lite) } : null) } : null;'), (t) => carry(load(t)));
await plant('a boot hands the reader no clock (nothing is carried)', RULES, swap('const rec = lookRecord(record(), app, now);', 'const rec = lookRecord(record(), app);'), (t) => carry(load(t)));

// ---- 5. the boot wiring, as text: storage reads and writes, the hand-over, what settings and __test are told -------------
class FakeStorage { // the methods live on the prototype, as a page's do (the pin's seed keeps Storage.prototype.setItem)
  constructor(init = {}) { this.map = new Map(Object.entries(init)); this.gets = []; this.sets = []; this.dead = false; }
  getItem(k) { if (this.dead) throw new Error('storage is dead'); this.gets.push(k); return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { if (this.dead) throw new Error('storage is dead'); this.sets.push(k); this.map.set(k, String(v)); }
}
const storage = (init = {}) => new FakeStorage(init);
class FakeEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
const fakeWindow = () => { const on = {}; return { on, addEventListener: (type, fn) => { (on[type] ??= []).push(fn); }, dispatchEvent: (ev) => { for (const fn of on[ev.type] ?? []) fn(ev); return true; } }; };
const gpu = (name) => ({ capabilities: { maxTextureSize: 16384, isWebGL2: true }, extensions: { has: () => true }, getContext: () => ({ RENDERER: 1, getParameter: () => name, getExtension: () => null }) });
const HARD = 'ANGLE (NVIDIA, a hardware GPU)', SOFT = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)';
const KEY = /const LOOK_VERDICT_KEY = '([^']+)';/.exec(WIRING)?.[1];
const wire = (text) => new Function('bootQ', 'scripted', 'localStorage', 'renderer', 'engine', 'document', 'settingsCtx', 'SETTINGS_KEY', 'Date', 'globalThis', 'window', 'CustomEvent', 'navigator', 'location',
  `'use strict';\n${text}\n; return { bootLook, bootClub, bootVenue, bootFlow, bootTier, bootRung, bootOnPace, bootOnFailed, bootOnArmed, lookShown, lookApp };`);
/**
 * One page boot through main.js's own lines (the rules and the wiring). `online`: the page's navigator.onLine (`nav.onLine`
 * of the returned page can be changed afterwards: the page goes offline or comes back); `protocol`: its location.protocol.
 */
const page = (text, { query = '', scripted = false, store = storage(), renderer = gpu(HARD), kernel = '0.1.0+b4cd722c', html = '10b624f671e3', now = T0, visible = true, seed = null, afterSeed = null, noEvents = false,
  online = true, protocol = 'http:', nav = { onLine: online }, docEvents = true } = {}) => {
  // (`docEvents: false`: a document that cannot be listened to; `see(state)`: the page's visibility changes, and its listeners hear it)
  const heard = [];
  const ctx = {}, doc = { documentElement: { dataset: html === null ? {} : { obHtml: html } }, visibilityState: visible ? 'visible' : 'hidden',
    ...(docEvents ? { addEventListener: (type, fn) => { if (type === 'visibilitychange') heard.push(fn); } } : null) };
  const see = (state) => { doc.visibilityState = state; for (const fn of heard) fn(); };
  const env = { matchMedia: () => ({ matches: false }), navigator: { maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux x86_64', deviceMemory: 8 } };
  const clock = { t: now, now: () => clock.t }, win = fakeWindow();
  const announced = []; win.addEventListener('ob:look-verdict', (e) => announced.push(e.detail)); // every announcement of a record read
  // `seed`: a script the launcher registers for every new document: it runs here before the app's own lines, with the page's globals
  if (seed) new Function('Storage', 'addEventListener', 'localStorage', 'Date', 'window', seed)(FakeStorage, win.addEventListener, store, clock, win);
  if (afterSeed) afterSeed(store);
  const b = wire(text)(new URLSearchParams(query), scripted, store, renderer, { version: () => { if (kernel === null) throw new Error('no stamp'); return kernel; } }, doc, ctx, 'ob-settings-v1', clock, env,
    noEvents ? { dispatchEvent: () => { throw new Error('no events here'); } } : win, FakeEvent, nav, { protocol });
  return { ...b, ctx, store, doc, see, heard, clock, win, nav, announced, club: b.bootClub ? { venue: b.bootVenue, flow: b.bootFlow, tier: b.bootTier, onPace: b.bootOnPace, onFailed: b.bootOnFailed, onArmed: b.bootOnArmed } : null };
};
const BLOCK = RULES + WIRING;
const profile = (look) => ({ 'ob-settings-v1': JSON.stringify({ look, game: 'nine_ball' }) });
const wiring = (text) => {
  assert.equal(KEY, 'ob-look-verdict-v1', 'the record has its own key');
  // (a) what a boot reads from storage: one read more, on a passing tier only
  let p = page(text, { scripted: true });
  assert.deepEqual([p.bootLook, p.bootClub, p.club, p.store.gets], ['green', false, null, []], 'a scripted default boot: green, no hand-over, no storage read');
  p = page(text, { renderer: gpu(SOFT), store: storage(profile('tournament')) });
  assert.deepEqual([p.bootLook, p.bootClub, p.club, p.store.gets], ['tournament', false, null, ['ob-settings-v1']], 'a real-user boot on a lite device: the old room, no hand-over, the ONE read it always made');
  assert.deepEqual({ ...p.ctx.lookBoot }, out('stored:tournament', 'old', 'none', 'lite', 'tier-lite'));
  p = page(text, { store: storage(profile('tournament')) });
  assert.deepEqual([p.bootLook, p.bootClub, p.bootVenue, p.bootFlow, p.store.gets], ['tournament', true, 'arena', 'stage', ['ob-settings-v1', KEY]], 'a real-user boot on a passing device: the hall by the stage flow; one storage read more (the record)');
  assert.deepEqual([p.bootRung, p.bootTier, p.club.tier], ['base', undefined, undefined], 'the standard hall: no tier is handed, the reports are booked on the record\'s own fields');
  for (const [query, gets] of [['look=green', []], ['look=sp', []], ['look=tournament-legacy', []], ['look=arena', []], ['look=club', []], ['look=tournament', [KEY]]]) {
    assert.deepEqual(page(text, { query, store: storage(profile('green')) }).store.gets, gets, `?${query}: storage reads`);
  }
  assert.deepEqual(page(text, { query: 'look=tournament', renderer: gpu(SOFT) }).store.gets, [], '?look=tournament on a lite device reads no storage');
  // (b) the three names every other reader keeps, per row
  const names = (o) => { const b = page(text, o); return [b.bootLook, b.bootClub, b.bootClub ? b.bootVenue : null, b.bootFlow]; };
  assert.deepEqual(names({ query: 'look=arena', renderer: gpu(SOFT), scripted: true }), ['tournament', true, 'arena', 'curtain']);
  assert.deepEqual(names({ query: 'look=club' }), ['tournament', true, 'club', 'curtain']);
  assert.deepEqual(names({ store: storage(profile('club')), renderer: gpu(SOFT) }), ['tournament', true, 'club', 'curtain']);
  assert.deepEqual(names({ store: storage(profile('arena')) }), ['tournament', true, 'arena', 'stage']);
  assert.deepEqual(names({ store: storage(profile('arena')), renderer: gpu(SOFT) }), ['tournament', false, null, 'none']);
  assert.deepEqual(names({ store: storage(profile('green')) }), ['green', false, null, 'none']);
  assert.deepEqual(names({ query: 'look=sp' }), ['tournament', false, null, 'none']);
  assert.deepEqual(names({ query: 'look=tournament', scripted: true }), ['tournament', false, null, 'none'], 'a scripted boot that names the tournament grade: the old room on a passing device too');
  assert.deepEqual(names({ query: 'look=tournament&clubtier=base', scripted: true, renderer: gpu(SOFT) }), ['tournament', false, null, 'none']);
  assert.deepEqual(page(text, { query: 'look=tournament', scripted: true, store: storage(profile('green')) }).store.gets, [], '... and it reads no storage');
  assert.deepEqual(names({ query: 'look=tournament' }), ['tournament', true, 'arena', 'stage'], 'the same URL value on a real-user boot: Tournament');
  assert.deepEqual(names({ noEvents: true, store: storage(profile('tournament')) }), ['tournament', true, 'arena', 'stage'], 'a page whose event dispatch throws still boots (the plain read)');
  assert.deepEqual(names({ store: storage({ 'ob-settings-v1': '{not json' }) }), ['tournament', true, 'arena', 'stage'], 'an unreadable profile: Tournament');
  const dead = storage(); dead.dead = true;
  assert.deepEqual(names({ store: dead }), ['tournament', true, 'arena', 'stage'], 'storage that throws: Tournament, and the boot does not die');
  // (c) the app version names the kernel stamp, app.html's id and the hand-raised generation
  assert.equal(page(text).lookApp, '0.1.0+b4cd722c|10b624f671e3|1');
  assert.equal(page(text, { html: null }).lookApp, '0.1.0+b4cd722c||1');
  assert.equal(page(text, { kernel: null }).lookApp, '?|?|1', 'an unreadable stamp is a version of its own');
  // (d) the two writers: a slow hall is stored and the NEXT boot keeps the old room with no hand-over (so no leaf byte)
  const store = storage(profile('tournament'));
  p = page(text, { store });
  p.club.onPace(pace(SLOW));
  assert.deepEqual(store.sets, [KEY], 'one write, under the record\'s own key (the settings object is not touched)');
  const rec = JSON.parse(store.map.get(KEY));
  assert.deepEqual([rec.app, rec.verdict, rec.why, rec.at, rec.pace.hall.median, rec.pace.stage.dirty], ['0.1.0+b4cd722c|10b624f671e3|1', 'old', 'pace-median', T0, 33.33, true]);
  assert.deepEqual([p.bootLook, p.bootClub, { ...p.ctx.lookBoot }.shown], ['tournament', true, 'hall'], 'nothing swaps under the running page: its names and its fact stay');
  assert.deepEqual([p.ctx.lookNext(), p.ctx.lookNextRung(), p.ctx.lookBoot.rung], ['hall', 'lite', undefined], 'but a reload would now show the LIGHT hall');
  let q = page(text, { store });
  assert.deepEqual([q.bootLook, q.bootClub, q.bootFlow, q.bootRung, q.club.tier, { ...q.ctx.lookBoot }], ['tournament', true, 'stage', 'lite', 'lite', light('stored:tournament')], 'the next boot: the light hall by the stage flow, its tier handed to the leaf');
  q = page(text, { store, kernel: '0.1.1+0badc0de' });
  assert.deepEqual([q.bootClub, q.ctx.lookBoot.why, q.bootRung], [true, 'light-new', 'lite'], 'a new kernel stamp is a new app version: the pace old made under the last one is carried (the same generation, under 90 days), so the light hall and not the standard one again');
  assert.equal(page(text, { store, kernel: '0.1.1+0badc0de', now: T0 + 91 * 24 * 60 * MIN }).ctx.lookBoot.why, 'pass-new', '... and after 90 days: one new try of the standard hall');
  q = page(text, { store, html: 'ffffffffffff' });
  assert.deepEqual([q.bootClub, q.ctx.lookBoot.why], [true, 'light-new'], 'a new app.html id is a new app version: the pace old is carried the same way');
  // (d2) THE LIGHT RUNG through the page's own lines: its reports are booked under `lite`, and only when the leaf says it
  // built the light hall; a report of the other rung's tier, or of none, stores nothing; the standard hall's fields stand
  { const s3 = storage(profile('tournament')); let l = page(text, { store: s3 }); l.club.onPace(pace(SLOW));
    const top = JSON.parse(s3.map.get(KEY)), { tier: unnamed, ...bare } = pace(FAST);
    l = page(text, { store: s3, now: T0 + MIN });
    assert.deepEqual([l.bootRung, l.club.tier, l.ctx.lookBoot.why], ['lite', 'lite', 'light-new']);
    l.club.onPace(pace(FAST)); l.club.onPace(pace({ ...FAST, tier: 'high' })); l.club.onPace(bare);
    assert.deepEqual(JSON.parse(s3.map.get(KEY)), top, 'on a light-rung boot a report that names a standard tier, or none, stores nothing');
    l.club.onPace(pace({ ...FAST, tier: 'lite' }));
    const r3 = JSON.parse(s3.map.get(KEY));
    assert.deepEqual([{ ...r3, lite: null }, r3.lite?.verdict, r3.lite?.why, r3.lite?.passed, r3.lite?.at], [{ ...top, lite: null }, 'hall', 'pace-ok', true, T0 + MIN], 'the light hall\'s pass is booked under `lite`; the standard hall\'s verdict stands as it was');
    l = page(text, { store: s3, now: T0 + 2 * MIN });
    assert.deepEqual([l.ctx.lookBoot.why, l.bootRung, l.ctx.lookNextRung()], ['light-verdict', 'lite', 'lite']);
    l.club.onFailed('timeout');
    assert.deepEqual([JSON.parse(s3.map.get(KEY)).lite?.fails?.timeout, JSON.parse(s3.map.get(KEY)).fails.timeout], [1, 0], 'a failure of a light-rung boot is counted on the light rung');
    // a new app version: the carried verdict and the light hall's report are stored together under the new version
    const s6 = storage({ ...profile('tournament'), [KEY]: JSON.stringify(top) });
    l = page(text, { store: s6, kernel: '0.1.1+0badc0de', now: T0 + 30 * 24 * 60 * MIN }); l.club.onPace(pace({ ...FAST, tier: 'lite' }));
    const r6 = JSON.parse(s6.map.get(KEY));
    assert.deepEqual([r6.app, r6.verdict, r6.why, r6.at, r6.lite?.verdict], ['0.1.1+0badc0de|10b624f671e3|1', 'old', 'pace-median', T0, 'hall'], 'the writer reads the record with the clock: the carried verdict is stored under the new version with its first time');
    // the failure's writer reads the record with the clock as well: on a page whose record was made under another app
    // version a failure of the light hall is counted on the carried record's light rung, under the new version
    const s7 = storage({ ...profile('tournament'), [KEY]: JSON.stringify(top) });
    l = page(text, { store: s7, kernel: '0.1.1+0badc0de', now: T0 + 30 * 24 * 60 * MIN });
    assert.deepEqual([l.ctx.lookBoot.why, l.bootRung], ['light-new', 'lite']);
    l.club.onFailed('timeout');
    const r7 = JSON.parse(s7.map.get(KEY));
    assert.deepEqual([r7.app, r7.verdict, r7.why, r7.at, r7.fails.timeout, r7.lite?.fails?.timeout], ['0.1.1+0badc0de|10b624f671e3|1', 'old', 'pace-median', T0, 0, 1], "the failure's writer reads the record with the clock: a light hall's timeout under a carried verdict is counted on the light rung, stored under the new version");
    // ... and so does the way out: Tournament chosen anew on such a page clears the carried verdict; with both rungs carried
    // `old` (the old room, where nothing else ever writes) it is the only way back before the 90 days are over
    for (const carried of [top, { ...top, lite: { verdict: 'old', why: 'pace-median', at: T0 + MIN, passed: false, slow: 1, fails: { fetch: 0, build: 0, timeout: 0 }, failAt: null, reason: null, pace: null } }]) {
      const s8 = storage({ ...profile('tournament'), [KEY]: JSON.stringify(carried) });
      l = page(text, { store: s8, kernel: '0.1.1+0badc0de', now: T0 + 30 * 24 * 60 * MIN });
      assert.equal(l.ctx.lookBoot.shown, carried.lite ? 'old' : 'hall', 'the carried record is read at boot: the light hall, or the old room where both rungs are carried');
      assert.equal(l.ctx.lookAnew(), true, 'the way out reads the record with the clock: a carried pace old is cleared under the new app version');
      const r8 = JSON.parse(s8.map.get(KEY));
      assert.deepEqual([r8.app, r8.verdict, r8.why, 'lite' in r8], ['0.1.1+0badc0de|10b624f671e3|1', null, 'anew', false], 'cleared, both rungs, and stored under the new version');
      assert.equal(page(text, { store: s8, kernel: '0.1.1+0badc0de', now: T0 + 30 * 24 * 60 * MIN + MIN }).ctx.lookBoot.why, 'pass-anew', '... and the next boot is the standard hall, measured again');
    }
    // the standard rung: a report that names the light tier, or none, stores nothing; `high` is the standard rung
    const s4 = storage(profile('tournament')); l = page(text, { store: s4 }); l.club.onPace(pace({ ...FAST, tier: 'lite' })); l.club.onPace(bare);
    assert.deepEqual(s4.sets, [], 'on the standard rung a report that names the light tier, or none, stores nothing');
    l.club.onPace(pace({ ...FAST, tier: 'high' }));
    assert.deepEqual([s4.sets.length, JSON.parse(s4.map.get(KEY)).verdict, 'lite' in JSON.parse(s4.map.get(KEY))], [1, 'hall', false], 'the tier high is the standard rung');
    // a mismatch of the two versions stores nothing
    const s5 = storage(profile('tournament')); l = page(text, { store: s5 }); l.club.onFailed('mismatch: the leaf speaks stage protocol 3, the app 2');
    assert.deepEqual(s5.sets, [], 'a mismatch stores nothing');
    assert.equal(page(text, { store: s5, now: T0 + MIN }).ctx.lookBoot.why, 'pass-new', '... and the next boot asks for the hall as a first boot does');
  }
  // a hidden page as the report arrives: nothing is written
  let s2 = storage(); p = page(text, { store: s2, visible: false }); p.club.onPace(pace(SLOW));
  assert.deepEqual(s2.sets, [], 'a report on a hidden page writes nothing');
  s2 = storage(); p = page(text, { store: s2 }); p.club.onPace(pace({ ...SLOW, hall: null })); p.club.onPace(undefined);
  assert.deepEqual(s2.sets, [], 'a report without a hall writes nothing');
  // onFailed: stored once per boot; a fetch failure twice in a row holds the hall off on the third boot
  s2 = storage();
  p = page(text, { store: s2 }); p.club.onFailed('import'); p.club.onFailed('timeout'); p.club.onFailed('room: x');
  assert.deepEqual([s2.sets.length, JSON.parse(s2.map.get(KEY)).fails], [1, { fetch: 1, build: 0, timeout: 0 }], 'the first failure of a boot is the one stored');
  p = page(text, { store: s2, now: T0 + MIN }); assert.equal(p.ctx.lookBoot.why, 'pass-retry'); p.club.onFailed('import');
  p = page(text, { store: s2, now: T0 + 2 * MIN });
  assert.deepEqual([p.bootClub, p.club, p.ctx.lookBoot.why], [false, null, 'fetch-wait'], 'the third boot of a flaky network: the old room at once');
  // onFailed on a page that was HIDDEN at some moment SINCE THE STAGE'S CLOCK STARTED: a timeout is not stored. The watch
  // of the page's visibility starts when main's stage arms its bound (`onArmed`, at the first delivered frame). Hidden
  // for a moment and back; hidden as the failure arrives; hidden at the moment the watch starts; and a document that
  // cannot be listened to, hidden as the failure arrives
  const kept = (st) => (st.map.has(KEY) ? JSON.parse(st.map.get(KEY)) : null);
  s2 = storage();
  p = page(text, { store: s2 }); p.club.onArmed(); p.see('hidden'); p.see('visible'); p.club.onFailed('timeout');
  assert.deepEqual(s2.sets, [], 'a page that was hidden for a moment after the bound was armed: its timeout is not stored');
  p = page(text, { store: s2, now: T0 + MIN }); p.club.onArmed(); p.see('hidden'); p.club.onFailed('timeout: the hall\'s files or bakes were not in after 12000 ms');
  assert.deepEqual(s2.sets, [], 'hidden as the failure arrives: not stored');
  p = page(text, { store: s2, now: T0 + 2 * MIN, visible: false }); p.club.onArmed(); p.see('visible'); p.club.onFailed('timeout');
  assert.deepEqual(s2.sets, [], 'hidden at the moment the watch starts: hidden since, not stored');
  p = page(text, { store: s2, now: T0 + 3 * MIN, docEvents: false }); p.club.onArmed(); p.doc.visibilityState = 'hidden'; p.club.onFailed('timeout');
  assert.deepEqual(s2.sets, [], 'four boots in a row that timed out on a page that had been hidden since the bound was armed: nothing was stored, no `old`');
  // A HIDE BEFORE THE STAGE'S CLOCK STARTS FORGIVES NOTHING. A page that boots hidden (a background tab, a prerender)
  // delivers no frame until it is shown; the bound is armed at its first delivered frame, and from there the stage is
  // measured in sight. Hidden as it booted and shown before the first frame; hidden for a moment and back before it
  { const s3 = storage();
    let h = page(text, { store: s3, visible: false }); h.see('visible'); h.club.onArmed(); h.club.onFailed('timeout');
    assert.deepEqual([s3.sets.length, kept(s3)?.verdict ?? null, kept(s3)?.fails.timeout], [1, null, 1], 'hidden at boot, shown before the first frame, then a timeout in sight: counted');
    h = page(text, { store: s3, now: T0 + MIN }); h.see('hidden'); h.see('visible'); h.club.onArmed(); h.club.onFailed('timeout');
    assert.deepEqual([s3.sets.length, kept(s3)?.verdict, kept(s3)?.why, kept(s3)?.fails.timeout], [2, 'old', 'timeout', 2], 'hidden and back before the bound was armed, then a second timeout in sight: the old room, as for two seen timeouts');
    // before the watch nothing forgives: a stage that never armed its bound, the page hidden as the failure arrives
    const s4 = storage(); h = page(text, { store: s4 }); h.see('hidden'); h.club.onFailed('timeout');
    assert.deepEqual([s4.sets.length, kept(s4)?.fails.timeout], [1, 1], 'a timeout before the watch started is counted, seen or not');
    // the watch starts ONCE: a second call neither forgets what was seen nor listens again
    const s5 = storage(); h = page(text, { store: s5 }); h.club.onArmed(); h.see('hidden'); h.see('visible'); h.club.onArmed(); h.club.onFailed('timeout');
    assert.deepEqual([s5.sets, h.heard.length], [[], 1], 'a second onArmed forgets nothing and listens once');
  }
  assert.equal(page(text, { store: s2, now: T0 + 4 * MIN }).ctx.lookBoot.why, 'pass-new', 'and the next boot asks for the hall as a first boot does');
  // (the control: the same two timeouts on a page that stayed in sight condemn, as before)
  s2 = storage();
  p = page(text, { store: s2 }); p.club.onFailed('timeout'); p = page(text, { store: s2, now: T0 + MIN }); p.club.onFailed('timeout');
  assert.deepEqual([s2.sets.length, JSON.parse(s2.map.get(KEY)).verdict, page(text, { store: s2, now: T0 + 2 * MIN }).ctx.lookBoot.why], [2, 'old', 'light-new'], 'two timeouts in sight: the standard hall is condemned, as before (the light hall follows)');
  // only a timeout is forgiven; a page whose visibility cannot be read counts as seen; a curtain boot listens for nothing
  s2 = storage(); p = page(text, { store: s2 }); p.club.onArmed(); p.see('hidden'); p.club.onFailed('import');
  assert.deepEqual(JSON.parse(s2.map.get(KEY)).fails, { fetch: 1, build: 0, timeout: 0 }, 'a failed fetch on a hidden page is stored as on a seen one');
  s2 = storage(); p = page(text, { store: s2 }); Object.defineProperty(p.doc, 'visibilityState', { get() { throw new Error('unreadable'); } });
  assert.doesNotThrow(() => p.club.onArmed(), 'the start of the watch does not throw into main\'s stage'); p.club.onFailed('timeout');
  assert.equal(kept(s2)?.fails.timeout, 1, 'a page whose visibility cannot be read was seen: its timeout counts');
  const armed = (o) => { const x = page(text, o); x.club?.onArmed(); return x.heard.length; };
  assert.deepEqual([page(text).heard.length, armed({}), armed({ query: 'look=arena' }), armed({ scripted: true })], [0, 1, 0, 0], 'the watch is the stage boot\'s alone, and it starts as the bound is armed, not as the page boots');
  // a curtain boot measures nothing: its writers write nothing. And (the condition on the URL value
  // arena) a boot value is NEVER written into the stored profile: the boot's own lines write no storage at all, whatever the profile holds
  for (const o of [{ query: 'look=arena' }, { query: 'look=club' }, { query: 'look=arena', scripted: true }]) for (const look of [undefined, 'green', 'tournament', 'club']) {
    const before = look === undefined ? {} : profile(look);
    s2 = storage(before); p = page(text, { ...o, store: s2 });
    p.club.onPace(pace(SLOW)); p.club.onFailed('room: x'); p.ctx.lookNext();
    assert.deepEqual([p.bootFlow, s2.sets, Object.fromEntries(s2.map)], ['curtain', [], before], `?${o.query} over a stored ${look}: a curtain boot stores no verdict and leaves the profile as it was`);
  }
  // storage that dies after boot: the writers do not throw
  s2 = storage(); p = page(text, { store: s2 }); s2.dead = true;
  p.club.onPace(pace(SLOW)); p.club.onFailed('import');
  s2 = storage(); p = page(text, { store: s2 });
  p.club.onPace({ get hall() { throw new Error('unreadable'); } }); p.club.onFailed({ toString() { throw new Error('unreadable'); } });
  assert.deepEqual(s2.sets, [], 'an unreadable report or reason stores nothing, and the writers do not throw into the leaf\'s start');
  // (e) what settings and __test are told: the frozen fact, and what a reload of THIS page would show for a stored Tournament
  p = page(text, { store: storage(profile('green')) });
  assert.ok(Object.isFrozen(p.ctx.lookBoot)); assert.deepEqual({ ...p.ctx.lookBoot }, out('stored:green', 'green', 'none', null, 'stored-green'));
  assert.equal(p.ctx.lookNext(), 'hall', 'a green page on a passing device: Tournament would be the hall after a reload');
  assert.equal(page(text, { store: storage(profile('green')), renderer: gpu(SOFT) }).ctx.lookNext(), 'old', 'on a lite device: the old room (the live regrade stays)');
  assert.equal(page(text, { scripted: true }).ctx.lookNext(), 'green', 'a scripted page reloads to green: the live regrade stays for every scripted suite, on every device');
  assert.equal(page(text, { query: 'look=green' }).ctx.lookNext(), 'green', 'a pinned green page reloads to green');
  assert.equal(page(text, { query: 'look=sp' }).ctx.lookNext(), 'old');
  assert.equal(page(text, { query: 'look=tournament', scripted: true }).ctx.lookNext(), 'old', 'a scripted page that names the tournament grade reloads to the old room');
};
await ok('the boot wiring (main.js\'s own lines as text): storage reads per row, bootLook / bootClub / bootVenue, the app version, the two writers, the next boot, what settings and __test are told', () => wiring(BLOCK));
await plant('the record is read on a lite boot', BLOCK, swap("      if (tier === 'lite') return out(asked, 'old', 'none', tier, 'tier-lite');\n", "      record();\n      if (tier === 'lite') return out(asked, 'old', 'none', tier, 'tier-lite');\n"), wiring);
await plant('the writers act on a curtain boot', BLOCK, swap("const bootOnPace = (pace) => { if (bootFlow === 'stage' && lookRungOf(pace?.tier) === bootRung) lookStore(", 'const bootOnPace = (pace) => { if (lookRungOf(pace?.tier) === bootRung) lookStore('), wiring);
await plant('every failure of a boot is stored', BLOCK, swap("if (bootFlow !== 'stage' || lookFailedOnce) return;", "if (bootFlow !== 'stage') return;"), wiring);
await plant('the hidden page is not asked', BLOCK, swap("document.visibilityState === 'visible'", 'true'), wiring);
await plant('the failure\'s writer is not told that the page was hidden', BLOCK, swap('reason, lookApp, Date.now(), lookHidden(), bootRung))', 'reason, lookApp, Date.now(), false, bootRung))'), wiring);
await plant('a page that was hidden and came back is forgotten (no watch of the visibility)', BLOCK, swap("try { document.addEventListener('visibilitychange', lookHidden); }", 'try { }'), wiring);
await plant('the page\'s visibility as the watch starts is not read', BLOCK, swap('lookWasHidden = false; lookHidden(); try {', 'lookWasHidden = false; try {'), wiring);
await plant('the watch starts as the page boots (a hide before the stage\'s clock starts forgives a timeout in sight)', BLOCK, swap('const bootOnPace = (pace) =>', 'bootOnArmed(); const bootOnPace = (pace) =>'), wiring);
await plant('a report is booked whatever tier the leaf names', BLOCK, swap('lookRungOf(pace?.tier) === bootRung) lookStore(', 'true) lookStore('), wiring);
await plant('a light-rung report is booked on the standard hall\'s fields (the writer is not told the rung)', BLOCK, swap("document.visibilityState === 'visible', bootRung));", "document.visibilityState === 'visible'));"), wiring);
await plant('a light-rung failure is counted against the standard hall (the writer is not told the rung)', BLOCK, swap('lookHidden(), bootRung));', 'lookHidden()));'), wiring);
await plant('the tier is not handed on a light-rung boot', BLOCK, swap("bootTier = lookShown.rung === 'lite' ? 'lite' : undefined", 'bootTier = undefined'), wiring);
await plant('the light tier is handed on every boot', BLOCK, swap("bootTier = lookShown.rung === 'lite' ? 'lite' : undefined", "bootTier = 'lite'"), wiring);
await plant('the pace writer reads the record without the clock (a carried verdict is lost at the first report)', BLOCK, swap('lookAfterPace(lookRecord(lookRaw(), lookApp, Date.now()), pace', 'lookAfterPace(lookRecord(lookRaw(), lookApp), pace'), wiring);
await plant("the failure's writer reads the record without the clock (a light hall's failure under a carried verdict is lost)", BLOCK, swap('lookAfterFailed(lookRecord(lookRaw(), lookApp, Date.now()), reason', 'lookAfterFailed(lookRecord(lookRaw(), lookApp), reason'), wiring);
await plant('the way out reads the record without the clock (a carried verdict cannot be cleared)', BLOCK, swap('lookStore(() => lookAnew(lookRecord(lookRaw(), lookApp, Date.now()), Date.now()));', 'lookStore(() => lookAnew(lookRecord(lookRaw(), lookApp), Date.now()));'), wiring);
await plant('a hidden page forgives before the watch has started', BLOCK, swap('if (lookWasHidden === false && document.visibilityState', 'if (lookWasHidden !== true && document.visibilityState'), wiring);
await plant('a second start of the watch forgets what was seen', BLOCK, swap("if (bootFlow !== 'stage' || lookWasHidden !== null) return;", "if (bootFlow !== 'stage') return;"), wiring);
await plant('the watch starts on a curtain boot', BLOCK, swap("if (bootFlow !== 'stage' || lookWasHidden !== null) return;", 'if (lookWasHidden !== null) return;'), wiring);
await plant('the app version forgets the kernel stamp', BLOCK, swap('[engine.version(), document.documentElement.dataset.obHtml', "['k', document.documentElement.dataset.obHtml"), wiring);
await plant('the hall boots green', BLOCK, swap("if (lookShown.shown === 'green') bootLook = 'green';", "if (lookShown.shown !== 'old') bootLook = 'green';"), wiring);
await plant('the club look boots the arena venue', BLOCK, swap("bootVenue = lookShown.shown === 'club' ? 'club' : 'arena'", "bootVenue = 'arena'"), wiring);
await plant('a reload is asked about the stored look, not about Tournament', BLOCK, swap("settingsCtx.lookNext = () => lookAsk(() => 'tournament').shown;", "settingsCtx.lookNext = () => lookShown.shown;"), wiring);
await plant('the verdict is written into the settings object', BLOCK, swap('localStorage.setItem(LOOK_VERDICT_KEY, JSON.stringify(next))', 'localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))'), wiring);

await ok('main.js outside the block: the hand-over carries the flow and the two writers; __test has the one fact; the live regrade stands back where a reload would show the hall', async () => {
  assert.match(main, /club: bootClub \? \{ room, table, rebakeEnv, query: bootQ, venue: bootVenue, flow: bootFlow, tier: bootTier, onPace: bootOnPace, onFailed: bootOnFailed, onArmed: bootOnArmed \} : null,/);
  assert.match(main, /\bclub:\s*bootClub\s*\?\s*\{[^{}]*\}\s*:\s*null\b/, 'the identity arm\'s GUARD form still holds (no nested brace in the hand-over)');
  assert.match(main, /^    lookBoot: settingsCtx\.lookBoot \?\? null,/m);
  assert.equal(main.split('lookBoot:').length, 2, 'one fact');
  assert.equal(main.split("let bootLook = 'tournament';").length, 2);
  // the settings hook, run as text: (page's applied look, what a reload would show) -> was the live regrade made
  const at = main.indexOf('settingsCtx.applyLook = async (name) => {');
  assert.ok(at > 0);
  const hook = braced(main, at);
  const AsyncFunction = (async () => {}).constructor;
  const run = async (hookText, applied, next, name) => {
    const calls = { regrade: 0, confirm: 0, reload: 0 };
    const ctx = next === undefined ? {} : { lookNext: () => next };
    const win = { __test: { setLook: () => { calls.regrade += 1; } }, confirm: () => { calls.confirm += 1; return true; } };
    const f = new AsyncFunction('settingsCtx', 'window', 't', 'location', 'init', 'name', `let appliedLook = init; ${hookText}; await settingsCtx.applyLook(name); return appliedLook;`);
    const after = await f(ctx, win, (k) => k, { reload: () => { calls.reload += 1; } }, applied, name);
    return [calls.regrade, calls.confirm, calls.reload, after];
  };
  const hookRows = async (hookText) => {
    assert.deepEqual(await run(hookText, 'default', 'hall', 'tournament'), [0, 0, 0, 'default'], 'green page, Tournament is the hall after a reload: no live regrade to the old room (settings offers the reload)');
    assert.deepEqual(await run(hookText, 'default', 'old', 'tournament'), [1, 0, 0, 'tournament'], 'green page, Tournament is the old room: the live regrade, as before');
    assert.deepEqual(await run(hookText, 'default', 'green', 'tournament'), [1, 0, 0, 'tournament'], 'a scripted or pinned page: the live regrade, as before');
    assert.deepEqual(await run(hookText, 'default', undefined, 'tournament'), [1, 0, 0, 'tournament'], 'no decision on ctx: the live regrade, as before');
    assert.deepEqual(await run(hookText, 'default', 'hall', 'sp'), [0, 0, 0, 'default'], 'the legacy id is Tournament here too');
    assert.deepEqual(await run(hookText, 'tournament', 'hall', 'green'), [0, 1, 1, 'tournament'], 'a tournament-path page (the old room or the hall) to green: main\'s own reload offer, as before');
    assert.deepEqual(await run(hookText, 'tournament', 'hall', 'tournament'), [0, 0, 0, 'tournament']);
    assert.deepEqual(await run(hookText, 'default', 'hall', 'green'), [0, 0, 0, 'default']);
  };
  await hookRows(hook);
  await plant('the old room is shown live where the hall is due', hook, swap("if (settingsCtx.lookNext?.() === 'hall') return;", ''), hookRows);
});

// ---- 5c. THE JOIN: the stage block of startLoop hands every accepted failure and the pace facts to the record's two writers ----
// `club.stage` (main.js, between the THE STAGE marks) is run as text over the hand-over that main.js's own boot lines make
// (the real writers, the real storage rules). `reveal` is a stand-in with the block's one rule: accepted once per boot.
const STAGE_FROM = main.indexOf('// >>> THE STAGE'), STAGE_TO = main.indexOf('// <<< THE STAGE');
assert.ok(STAGE_FROM > wTo && STAGE_TO > STAGE_FROM, 'main.js: the stage block sits between its two marks');
const STAGE_BLOCK = main.slice(STAGE_FROM, STAGE_TO);
const STAGE_OBJ = braced(STAGE_BLOCK, STAGE_BLOCK.indexOf('      club.stage = {'));
const stageJoin = (objText) => {
  const boot = (o = {}) => {
    const p = page(BLOCK, { store: storage(profile('tournament')), ...o });
    const log = { reveals: [], warns: [] }, club = p.club;
    const h = new Function('club', 'machine', 'performance', 'console', 'log',
      `'use strict';\nlet over = false, told = false, ended = false, awake = true;\nconst reveal = (o) => { if (over) return false; over = true; log.reveals.push(o ?? null); return true; };\n${objText};\n`
      + 'return { end() { ended = true; }, awake: () => awake, accept: () => reveal({ hall: true }) };')(club, { is: () => false }, { now: () => 0 }, { warn: (m) => log.warns.push(String(m)) }, log);
    return { p, club, log, h, sets: () => p.store.sets.filter((k) => k === KEY).length, rec: () => (p.store.map.has(KEY) ? JSON.parse(p.store.map.get(KEY)) : null) };
  };
  // main's own two failures and the leaf's: each accepted failure is revealed once and handed to the record once, as given
  let b = boot();
  assert.deepEqual([b.club.flow, typeof b.club.stage.failed, typeof b.club.stage.report, b.club.stage.reason, b.club.stage.pace, b.club.stage.over], ['stage', 'function', 'function', null, null, false]);
  assert.equal(b.club.stage.protocol, 2, 'the stage object names the stage protocol the leaf must speak');
  b.club.stage.failed('import');
  assert.deepEqual([b.log.reveals.length, typeof b.log.reveals[0].rest, b.club.stage.reason, b.club.stage.over, b.sets()], [1, 'function', 'import', true, 1], 'a failed import: one reveal (main\'s own rest), one write');
  assert.deepEqual([b.rec()?.verdict, b.rec()?.fails, b.rec()?.reason], [null, { fetch: 1, build: 0, timeout: 0 }, 'import'], 'a failed import is a failed fetch: counted, never a verdict');
  assert.match(b.log.warns[0], /the hall could not be had \(import\)/);
  b.club.stage.failed('timeout'); b.club.stage.failed('room: late');
  assert.deepEqual([b.log.reveals.length, b.club.stage.reason, b.sets(), b.rec()?.fails], [1, 'import', 1, { fetch: 1, build: 0, timeout: 0 }], 'a second failure of the same boot is not accepted: no reveal, no write, the reason stands');
  b = boot(); b.club.stage.failed('timeout');
  assert.deepEqual([b.rec()?.verdict, b.rec()?.fails.timeout, b.rec()?.reason, b.log.reveals.length], [null, 1, 'timeout', 1], 'main\'s bound with nothing awaited (section 5d): a timeout, the first of two');
  b = boot(); const rest = () => true;
  b.club.stage.failed('room: the shell did not build', rest);
  assert.deepEqual([b.log.reveals[0].rest, b.rec()?.verdict, b.rec()?.why, b.rec()?.reason], [rest, 'old', 'build', 'room: the shell did not build'], 'the leaf\'s failure: revealed at the leaf\'s rest, stored as given (a build failure: the old room from the next boot)');
  assert.equal(page(BLOCK, { store: b.p.store }).ctx.lookBoot.why, 'verdict-old', '... and the next boot of that profile keeps the old room');
  // a failure that is NOT accepted (the hall's reveal was accepted first) is not stored
  b = boot(); b.h.accept(); b.club.stage.failed('timeout');
  assert.deepEqual([b.log.reveals.length, b.club.stage.reason, b.sets(), b.rec()], [1, null, 0, null], 'after the hall\'s reveal a late failure is nothing: no write');
  // the pace facts: handed over once, as the leaf gave them
  b = boot(); b.h.accept();
  const fast = pace(FAST);
  b.club.stage.report(fast);
  assert.deepEqual([b.club.stage.pace === fast, b.rec()?.verdict, b.rec()?.why, b.sets(), b.h.awake()], [true, 'hall', 'pace-ok', 1, true], 'the report: the facts kept, the verdict stored');
  b.club.stage.report(pace(SLOW));
  assert.deepEqual([b.club.stage.pace === fast, b.rec()?.verdict, b.sets()], [true, 'hall', 1], 'a second report is not taken');
  b = boot(); b.h.accept(); b.h.end(); b.club.stage.report(pace(SLOW));
  assert.deepEqual([b.h.awake(), b.rec()?.verdict, b.rec()?.why], [false, 'old', 'pace-median'], 'a report after the dissolve\'s end lets the loop go idle; a slow hall is stored');
  // the leaf's order on a failure: failed(reason), then at once report(facts without a hall): one write, the failure's
  b = boot(); b.club.stage.failed('assets: 1 of 4 files fell back to stand-ins (floor.color: request failed (floor-color.jpg))'); b.club.stage.report(pace({ hall: null }));
  assert.deepEqual([b.sets(), b.rec()?.fails, b.rec()?.verdict, b.club.stage.pace.hall], [1, { fetch: 1, build: 0, timeout: 0 }, null, null]);
  // neither writer can throw into the block or stop the reveal; both are feature-detected (a hand-over without them, or with junk)
  for (const junk of [() => { throw new Error('the writer threw'); }, undefined, null, 42, 'x', {}]) {
    b = boot(); b.club.onFailed = junk; b.club.onPace = junk;
    assert.doesNotThrow(() => b.club.stage.failed('import'), `failed() with onFailed = ${String(junk)}`);
    assert.deepEqual([b.log.reveals.length, b.club.stage.reason], [1, 'import'], 'the old room is revealed all the same');
    assert.doesNotThrow(() => b.club.stage.report(fast), `report() with onPace = ${String(junk)}`);
    assert.equal(b.club.stage.pace, fast);
    b = boot(); delete b.club.onFailed; delete b.club.onPace;
    assert.doesNotThrow(() => { b.club.stage.failed('timeout'); b.club.stage.report(fast); });
    assert.equal(b.log.reveals.length, 1);
  }
  // the writers are called with the reason and the facts, once each (a stand-in pair that counts)
  b = boot(); const got = { failed: [], pace: [] };
  b.club.onFailed = (r) => got.failed.push(r); b.club.onPace = (p) => got.pace.push(p);
  b.club.stage.failed('timeout: the hall\'s files or bakes were not in after 12000 ms'); b.club.stage.failed('import'); b.club.stage.report(fast); b.club.stage.report(fast);
  assert.deepEqual([got.failed, got.pace.length, got.pace[0] === fast], [['timeout: the hall\'s files or bakes were not in after 12000 ms'], 1, true]);
};
await ok('the join: the stage block hands every accepted failure (main\'s import, main\'s bound, the leaf\'s line) and the pace facts to the record\'s writers, once each, by feature detection; a writer cannot throw into the block or stop the reveal', () => stageJoin(STAGE_OBJ));
await plant('a failure\'s reason is not handed to the record', STAGE_OBJ, swap('try { club.onFailed?.(club.stage.reason); } catch { /* the record is not written: the old room is revealed all the same */ }', ''), stageJoin);
await plant('a failure after the hall\'s reveal is stored', STAGE_OBJ, (t) => swap('          if (over) return;\n          club.stage.reason = String(reason);', '          try { club.onFailed?.(String(reason)); } catch { /* */ }\n          if (over) return;\n          club.stage.reason = String(reason);')(swap('try { club.onFailed?.(club.stage.reason); } catch { /* the record is not written: the old room is revealed all the same */ }', '')(t)), stageJoin);
await plant('a writer that throws stops the reveal', STAGE_OBJ, swap('try { club.onFailed?.(club.stage.reason); } catch { /* the record is not written: the old room is revealed all the same */ }', 'club.onFailed?.(club.stage.reason);'), async (t) => { try { stageJoin(t); } catch (e) { throw e instanceof assert.AssertionError ? e : new assert.AssertionError({ message: `threw: ${e.message}` }); } });
await plant('a hand-over without the writer breaks the stage (no feature detection)', STAGE_OBJ, swap('try { club.onFailed?.(club.stage.reason); } catch {', 'try { club.onFailed(club.stage.reason); } finally {'), async (t) => { try { stageJoin(t); } catch (e) { throw e instanceof assert.AssertionError ? e : new assert.AssertionError({ message: `threw: ${e.message}` }); } });
await plant('the pace facts are not handed to the record', STAGE_OBJ, swap('try { club.onPace?.(pace); } catch { /* no verdict is stored: the next boot measures again */ }', ''), stageJoin);
await plant('a second report is taken (two verdicts from one boot)', STAGE_OBJ, swap('          if (told) return;\n', ''), stageJoin);
await plant('the failure is stored as another reason than the one revealed', STAGE_OBJ, swap('club.onFailed?.(club.stage.reason)', "club.onFailed?.('timeout')"), stageJoin);
await plant('the stage object names no protocol', STAGE_OBJ, swap('        protocol: 2,\n', ''), stageJoin);

await ok('the join, as text: the stage is made by the boot\'s verdict alone (club.flow), the tool switch is gone, and main\'s own two reasons are the classes the record expects', () => {
  assert.equal(STAGE_BLOCK.split("if (club.flow === 'stage') {").length, 2, 'the stage is made where the boot rules gave the stage flow, and nowhere else');
  assert.ok(!/club\.venue\s*===/.test(STAGE_BLOCK) && !/club\.query\.get\(/.test(STAGE_BLOCK), 'no venue test and no query read decide the stage');
  assert.ok(!/\bquery\.get\(\s*['"]club(?!timeout['"])/.test(STAGE_BLOCK) && !/PROTOTYPE/.test(main), 'no tool switch of the look and no prototype mark are left in main.js (the identity arm\'s QUERY rule, section 9, judges every parameter of the look)');
  // main's own three calls of failed(): the failed import of the leaf and the handshake's mismatch (above the block), the bound (inside it)
  assert.match(main, /\.then\(release, \(e\) => \{ release\(\); club\.stage\?\.failed\('import'\);/);
  assert.match(STAGE_BLOCK, /bound = setTimeout\(\(\) => club\.stage\.failed\(boundWhy\(\)\), STAGE_MAX_MS\);/);
  // main.js itself fails the stage at three places: the failed import (a literal reason), the handshake (a line headed `mismatch`: the entry's rows below run it) and the bound, whose reason is made
  // by `boundWhy` from what the network still owed the hall (section 5d below runs it); no place says `timeout` by itself
  assert.equal(main.split(/club\.stage\??\.failed\(/).length, 4, 'three calls of failed() in main.js');
  assert.match(main, /if \(club\.flow === 'stage' && m\.STAGE_PROTOCOL !== club\.stage\.protocol\) \{\s*clubIn = true;\s*club\.stage\.failed\(`mismatch: /, 'the handshake fails the stage with a line headed mismatch');
  const own = [...main.matchAll(/club\.stage\??\.failed\(\s*'([^']*)'\s*\)/g)].map((m) => m[1]);
  assert.deepEqual(own, ['import'], 'one literal reason: the failed import');
  assert.deepEqual(own.map((r) => R.lookFailClass(r)), ['fetch']);
  // the leaf is asked for after first paint (one animation frame after the first delivered frame), by the one import
  assert.match(STAGE_BLOCK, /deliveredWaiters\.push\(\(\) => \{ awake = true; keep\(\); try \{ club\.onArmed\?\.\(\); \} catch \{[^{}]*\} bound = setTimeout\([^;]+; requestAnimationFrame\(\(\) => \{ clubAsk\(\); \}\); \}\);/);
  assert.equal(main.split("import('../scene/club/index.js')").length, 2, 'one import site');
});

// ---- 5d. THE BOUND'S REASON: while the network still owes the hall something, the bound is a failed fetch, never a verdict ----
// A slow link must not condemn a device: two `timeout` boots keep the old room for a whole app version, a failed fetch
// never does (after two in a row: the old room at once for LOOK_FETCH_WAIT_MS, then one try more). So main's bound says
// `timeout` only when the leaf's entry had arrived AND the leaf, asked once, said that nothing it had asked the network
// for was still to arrive: the build was the slow part (also when the hall would have asked for more files later: a
// file not yet asked for is not awaited, and a device that cannot build the hall in time must be told so).
// Run as text: `boundWhy`, the timer's own call, the stage object, the entry's flag, the boot rules.
// The leaf's side is a stand-in: the ONE member it sets on the hand-over, `club.stage.pending` (what it still awaits, in
// a few words, or nothing). NO ANSWER (the member absent, not a function, throwing, unprintable) IS THE NETWORK'S SIDE:
// the old room is revealed all the same and nothing is held against the device on a guess.
const BOUND_WHY = braced(STAGE_BLOCK, STAGE_BLOCK.indexOf('      const boundWhy = () => {'));
const BOUND_CALL = /bound = setTimeout\(\(\) => (club\.stage\.failed\([^;]*\)), STAGE_MAX_MS\);/.exec(STAGE_BLOCK)?.[1];
assert.ok(BOUND_WHY.startsWith('      const boundWhy = () => {') && typeof BOUND_CALL === 'string', 'main.js: the bound\'s reason and the timer\'s call are where they were');
const LINES = Object.freeze({ entry: 'import: the bound, the entry had not arrived', silent: 'assets: the bound, no answer from the leaf', awaited: (w) => `assets: the bound, ${w}`, built: 'timeout' });
const NO_LEAF = Symbol('the leaf set nothing on the hand-over');
/** A leaf's answer that counts how often it was asked. */
const says = (answer) => { const f = () => { f.asked += 1; return answer; }; f.asked = 0; return f; };
const boundJoin = ({ why = BOUND_WHY, obj = STAGE_OBJ, call = BOUND_CALL } = {}) => {
  // one boot up to the bound: `entry` = the leaf's entry has arrived; `member` = what the leaf put on `club.stage.pending`
  const boot = ({ entry = true, member = NO_LEAF, store = storage(profile('tournament')), now = T0 } = {}) => {
    const p = page(BLOCK, { store, now });
    const log = { reveals: [], warns: [] }, club = p.club;
    const h = new Function('club', 'machine', 'performance', 'console', 'log', 'clubIn',
      `'use strict';\nlet over = false, told = false, ended = false, awake = true;\nconst reveal = (o) => { if (over) return false; over = true; log.reveals.push(o ?? null); return true; };\n${why};\n${obj};\n`
      + `return { fire() { ${call}; }, accept: () => reveal({ hall: true }) };`)(club, { is: () => false }, { now: () => 0 }, { warn: (m) => log.warns.push(String(m)) }, log, entry);
    const made = club.stage.pending;
    if (member !== NO_LEAF) club.stage.pending = member;
    return { p, club, log, h, made, cls: () => R.lookFailClass(club.stage.reason), sets: () => store.sets.filter((k) => k === KEY).length, rec: () => (store.map.has(KEY) ? JSON.parse(store.map.get(KEY)) : null) };
  };
  // (b) the entry has not arrived when the bound fires: a failed fetch; nothing is asked of a leaf that is not there
  let f = says('files not in: 3'), b = boot({ entry: false, member: f });
  assert.equal(b.made ?? null, null, 'main makes the hand-over without an answer: the leaf sets it');
  b.h.fire();
  assert.deepEqual([b.club.stage.reason, f.asked, b.log.reveals.length, typeof b.log.reveals[0].rest, b.sets()], [LINES.entry, 0, 1, 'function', 1], 'the entry not arrived at the bound: one reveal of the old room, one write, the line says what was missing');
  assert.deepEqual([b.cls(), b.rec().verdict, b.rec().fails, b.rec().reason], ['fetch', null, { fetch: 1, build: 0, timeout: 0 }, LINES.entry], '... a failed fetch: counted, never a verdict');
  assert.match(b.log.warns[0], /the hall could not be had \(import: the bound, the entry had not arrived\)/);
  // (a) the entry arrived and the leaf still awaits something of the network: a failed fetch that says what; asked ONCE
  for (const w of ['module requests not in: 5', 'files not in: 2']) {
    f = says(w); b = boot({ member: f }); b.h.fire();
    assert.deepEqual([b.club.stage.reason, f.asked, b.log.reveals.length, b.sets()], [LINES.awaited(w), 1, 1, 1], `awaited at the bound (${w}): the leaf is asked once, the line is headed as a fetch and says what was awaited`);
    assert.deepEqual([b.cls(), b.rec().verdict, b.rec().fails], ['fetch', null, { fetch: 1, build: 0, timeout: 0 }], `awaited at the bound (${w}): never a verdict`);
  }
  for (const odd of [7, true, {}, ['x']]) { // an answer that is not nothing is something awaited, whatever its type
    b = boot({ member: says(odd) }); assert.doesNotThrow(() => b.h.fire());
    assert.deepEqual([b.club.stage.reason, b.cls(), b.rec().verdict], [LINES.awaited(String(odd)), 'fetch', null], `an odd answer (${String(odd)})`);
  }
  // (c) the entry arrived and the leaf awaits nothing: everything it had asked for was in and the build was the slow part
  // (whatever it would have asked for later). `timeout`, the first of two
  for (const none of [null, undefined, '', false, 0]) {
    f = says(none); b = boot({ member: f }); b.h.fire();
    assert.deepEqual([b.club.stage.reason, f.asked, b.cls(), b.log.reveals.length], [LINES.built, 1, 'timeout', 1], `nothing awaited (${String(none)}): a timeout`);
    assert.deepEqual([b.rec().verdict, b.rec().fails], [null, { fetch: 0, build: 0, timeout: 1 }], 'one timeout: no verdict yet');
  }
  // (d) no answer: the reveal is not stopped and the failure is the network's (the safe side: a guess never blames the device)
  for (const [name, member] of [['the member as main made it', NO_LEAF], ['null', null], ['undefined', undefined], ['a number', 42], ['a string', 'x'], ['an object', {}],
    ['a function that throws', () => { throw new Error('the leaf threw'); }], ['an answer that cannot be written', () => ({ toString() { throw new Error('unprintable'); } })]]) {
    b = boot({ member });
    assert.doesNotThrow(() => b.h.fire(), `the bound with no answer (${name})`);
    assert.deepEqual([b.club.stage.reason, b.cls(), b.log.reveals.length, b.sets()], [LINES.silent, 'fetch', 1, 1], `no answer (${name}): the old room is revealed, the line says there was no answer`);
    assert.deepEqual([b.rec().verdict, b.rec().fails], [null, { fetch: 1, build: 0, timeout: 0 }], `no answer (${name}): not a timeout`);
  }
  // a bound after the hall's reveal was accepted is nothing (main clears the timer; `failed` refuses anyway)
  b = boot({ member: says('files not in: 2') }); b.h.accept(); b.h.fire();
  assert.deepEqual([b.log.reveals.length, b.club.stage.reason, b.sets()], [1, null, 0]);
  // over boots, through the page's own storage and rules. Bytes pending, then the entry missing: the third boot keeps
  // the old room at once (no leaf asked, no wait on the stage) for the hour, then ONE try more; never a verdict
  const s = storage(profile('tournament')), WAIT = R.LOOK_FETCH_WAIT_MS, stored = (st) => JSON.parse(st.map.get(KEY));
  b = boot({ store: s, now: T0, member: says('module requests not in: 9') }); b.h.fire();
  b = boot({ store: s, now: T0 + MIN, entry: false });
  assert.equal(b.p.ctx.lookBoot.why, 'pass-retry', 'boot 2 asks for the hall again'); b.h.fire();
  assert.deepEqual([stored(s).verdict, stored(s).fails, stored(s).failAt], [null, { fetch: 2, build: 0, timeout: 0 }, T0 + MIN]);
  for (const now of [T0 + 2 * MIN, T0 + MIN + WAIT - 1]) {
    const q = page(BLOCK, { store: s, now });
    assert.deepEqual([q.bootClub, q.club, q.ctx.lookBoot.shown, q.ctx.lookBoot.why], [false, null, 'old', 'fetch-wait'], 'two such boots in a row: the old room at once for the hour, no hand-over (so no leaf byte)');
  }
  b = boot({ store: s, now: T0 + MIN + WAIT });
  assert.equal(b.p.ctx.lookBoot.why, 'pass-retry', 'after the hour: one try more'); b.h.fire(); // (a leaf that gives no answer)
  assert.equal(page(BLOCK, { store: s, now: T0 + 2 * MIN + WAIT }).ctx.lookBoot.why, 'fetch-wait', 'a failure of that one try starts the hour again');
  assert.deepEqual([stored(s).verdict, stored(s).fails], [null, { fetch: 3, build: 0, timeout: 0 }], 'however many such boots: no verdict, and nothing counted against the device');
  // ... against a build that never finishes with every file in: two boots, then the old room for this app version
  const s2 = storage(profile('tournament'));
  b = boot({ store: s2, member: says(null) }); b.h.fire();
  b = boot({ store: s2, now: T0 + MIN, member: says('') }); b.h.fire();
  assert.deepEqual([stored(s2).verdict, stored(s2).why, stored(s2).fails], ['old', 'timeout', { fetch: 0, build: 0, timeout: 2 }]);
  const q2 = page(BLOCK, { store: s2, now: T0 + 2 * MIN + WAIT });
  assert.deepEqual([q2.bootClub, q2.ctx.lookBoot.why], [true, 'light-new'], 'a slow build twice: the standard hall is not asked for again and no hour ends it; the light hall is');
};
const asAssertion = (fn) => async (t) => { try { await fn(t); } catch (e) { throw e instanceof assert.AssertionError ? e : new assert.AssertionError({ message: `threw: ${e.message}` }); } };
await ok('the bound\'s reason: the entry not arrived = `import`, something still awaited = `assets` (asked of the leaf once), nothing awaited = `timeout`; no answer or a throwing answer = `assets` and the reveal goes on; over boots a slow link is held for an hour and never condemned, a slow build is condemned the second time', () => boundJoin());
const TRY_LINE = "try { const w = club.stage.pending(); why = w ? `assets: the bound, ${w}` : 'timeout'; } catch { /* no answer: the network's side */ }";
await plant('the bound says timeout whatever the leaf still awaits', BOUND_WHY, swap("why = w ? `assets: the bound, ${w}` : 'timeout';", "why = 'timeout';"), (t) => boundJoin({ why: t }));
await plant('the bound says timeout before the entry has arrived', BOUND_WHY, swap("if (!clubIn) return 'import: the bound, the entry had not arrived';", "if (!clubIn) return 'timeout';"), (t) => boundJoin({ why: t }));
await plant('a leaf that is not there is asked what it awaits', BOUND_WHY, swap("if (!clubIn) return 'import: the bound, the entry had not arrived';", ''), (t) => boundJoin({ why: t }));
await plant('a leaf that gives no answer is read as a slow device', BOUND_WHY, swap("let why = 'assets: the bound, no answer from the leaf';", "let why = 'timeout';"), (t) => boundJoin({ why: t }));
await plant('a leaf whose answer throws stops the reveal', BOUND_WHY, swap(TRY_LINE, "const w = club.stage.pending(); why = w ? `assets: the bound, ${w}` : 'timeout';"), asAssertion((t) => boundJoin({ why: t })));
await plant('a build that never finishes is never a timeout', BOUND_WHY, swap(": 'timeout'; } catch", ": 'assets: the bound, nothing'; } catch"), (t) => boundJoin({ why: t }));
await plant('the leaf is asked twice', BOUND_WHY, swap('const w = club.stage.pending();', 'club.stage.pending(); const w = club.stage.pending();'), (t) => boundJoin({ why: t }));
await plant('what was awaited is stored as a build failure (the line lost its head)', BOUND_WHY, swap('`assets: the bound, ${w}`', '`the bound, ${w}`'), (t) => boundJoin({ why: t }));
await plant('the timer says timeout by itself', BOUND_CALL, swap('boundWhy()', "'timeout'"), (t) => boundJoin({ call: t }));

// ---- 5e. THE WATCH STARTS WHERE THE STAGE'S CLOCK DOES: the first delivered frame arms the bound and starts the record's watch ----
// The line of the stage block that runs at the first delivered frame, run as text over the page's own boot lines, the
// bound's reason and the stage object. A page that boots hidden delivers no frame until it is shown, so a hide before
// this line forgives nothing; a hide after it forgives a timeout, as before.
const ARM_LINE = /deliveredWaiters\.push\(\(\) => \{ (awake = true; keep\(\); try \{ club\.onArmed\?\.\(\); \} catch \{[^{}]*\} bound = setTimeout\(\(\) => club\.stage\.failed\(boundWhy\(\)\), STAGE_MAX_MS\);) requestAnimationFrame/.exec(STAGE_BLOCK)?.[1];
assert.ok(typeof ARM_LINE === 'string', 'main.js: the first delivered frame keeps the loop awake, starts the watch and arms the bound, in one line');
const ARM_TRY = 'try { club.onArmed?.(); } catch { /* no watch: a timeout is then counted, seen or not */ } ';
const armJoin = ({ arm = ARM_LINE, block = BLOCK } = {}) => {
  // one stage boot: `first()` = the first delivered frame (the line under test); `fire()` = the timer it set; the leaf awaits nothing
  const boot = ({ store = storage(profile('tournament')), now = T0, visible = true } = {}) => {
    const p = page(block, { store, now, visible });
    const log = { reveals: [], warns: [], timers: [] }, club = p.club;
    const h = new Function('club', 'machine', 'performance', 'console', 'log', 'clubIn', 'setTimeout', 'STAGE_MAX_MS', 'keep',
      `'use strict';\nlet over = false, told = false, ended = false, awake = false, bound = null;\nconst reveal = (o) => { if (over) return false; over = true; log.reveals.push(o ?? null); return true; };\n${BOUND_WHY};\n${STAGE_OBJ};\n`
      + `return { first() { ${arm} }, bound: () => bound, awake: () => awake };`)(club, { is: () => false }, { now: () => 0 }, { warn: (m) => log.warns.push(String(m)) }, log, true, (fn, ms) => { log.timers.push({ fn, ms }); return log.timers.length; }, 25000, () => {});
    club.stage.pending = says(null);
    return { p, club, log, h, fire: () => { assert.equal(log.timers.length, 1, 'the bound was armed once'); log.timers[0].fn(); }, kept: () => (store.map.has(KEY) ? JSON.parse(store.map.get(KEY)) : null), sets: () => store.sets.filter((k) => k === KEY).length };
  };
  // the first delivered frame: the loop is kept awake, the watch starts, the bound is armed
  let b = boot();
  assert.deepEqual([b.p.heard.length, b.log.timers.length, b.h.awake()], [0, 0, false], 'before the first delivered frame: no watch, no bound');
  b.h.first();
  assert.deepEqual([b.p.heard.length, b.log.timers.length, b.log.timers[0]?.ms, b.h.bound(), b.h.awake()], [1, 1, 25000, 1, true], 'the first delivered frame starts the watch and arms the bound');
  // hidden at boot and shown before the first frame, then the bound fires in sight: counted; two such boots are the old room
  const s = storage(profile('tournament'));
  b = boot({ store: s, visible: false }); b.p.see('visible'); b.h.first(); b.fire();
  assert.deepEqual([b.club.stage.reason, b.log.reveals.length, b.sets(), b.kept()?.verdict ?? null, b.kept()?.fails.timeout], ['timeout', 1, 1, null, 1], 'a page that booted hidden and was shown before its first frame: its timeout in sight is counted');
  b = boot({ store: s, now: T0 + MIN, visible: false }); b.p.see('visible'); b.h.first(); b.fire();
  assert.deepEqual([b.sets(), b.kept()?.verdict, b.kept()?.why], [2, 'old', 'timeout'], 'two such boots: the old room, as for two timeouts in sight');
  assert.equal(page(block, { store: s, now: T0 + 2 * MIN }).ctx.lookBoot.why, 'light-new');
  // a hide after the bound was armed: forgiven as before (the bound's own timeout, and the leaf's line)
  const s2 = storage(profile('tournament'));
  b = boot({ store: s2 }); b.h.first(); b.p.see('hidden'); b.p.see('visible'); b.fire();
  assert.deepEqual([b.club.stage.reason, b.log.reveals.length, b.sets(), b.kept()], ['timeout', 1, 0, null], 'hidden for a moment after the bound was armed: the old room is revealed, nothing is stored');
  b = boot({ store: s2, now: T0 + MIN }); b.h.first(); b.p.see('hidden'); b.club.stage.failed('timeout: the hall\'s files or bakes were not in after 12000 ms');
  assert.deepEqual([b.log.reveals.length, b.sets()], [1, 0], 'the leaf\'s own timeout on a page hidden since: not stored');
  assert.equal(page(block, { store: s2, now: T0 + 2 * MIN }).ctx.lookBoot.why, 'pass-new', 'and the next boot asks for the hall as a first boot does');
  b = boot({ store: s2, now: T0 + 2 * MIN }); b.h.first(); b.p.see('hidden'); b.club.stage.failed('import');
  assert.deepEqual([b.sets(), b.kept()?.fails], [1, { fetch: 1, build: 0, timeout: 0 }], 'a failed fetch on a page hidden since is stored as ever');
  // the start of the watch is feature-detected and cannot stop the bound: junk, a throw, a hand-over without it. With no
  // watch a timeout is counted, seen or not (nothing forgives)
  for (const junk of [() => { throw new Error('the watch threw'); }, undefined, null, 42, 'x', {}]) {
    b = boot(); b.club.onArmed = junk;
    assert.doesNotThrow(() => b.h.first(), `the first delivered frame with onArmed = ${String(junk)}`);
    assert.deepEqual([b.log.timers.length, b.h.awake()], [1, true], 'the bound is armed all the same');
    b.p.see('hidden'); b.p.see('visible'); b.fire();
    assert.deepEqual([b.sets(), b.kept()?.fails.timeout], [1, 1], 'with no watch a timeout is counted');
  }
  b = boot(); delete b.club.onArmed;
  assert.doesNotThrow(() => b.h.first()); assert.equal(b.log.timers.length, 1);
};
await ok('the first delivered frame (the stage block\'s own line): the record\'s watch of the page\'s visibility starts as the bound is armed; a page hidden at boot and shown before its first frame has its timeout counted, a hide after the bound was armed is forgiven; the start of the watch is feature-detected and cannot stop the bound', () => armJoin());
await plant('the stage never starts the watch (a tab put in the background while the hall loads is condemned)', ARM_LINE, swap(ARM_TRY, ''), (t) => armJoin({ arm: t }));
await plant('a watch that throws stops the bound from being armed', ARM_LINE, swap(ARM_TRY, 'club.onArmed?.(); '), asAssertion((t) => armJoin({ arm: t })));
await plant('a hand-over without the watch breaks the first frame (no feature detection)', ARM_LINE, swap(ARM_TRY, 'try { club.onArmed(); } finally { } '), asAssertion((t) => armJoin({ arm: t })));
await plant('the watch starts as the page boots: a page hidden at boot is forgiven its timeout in sight (through the stage\'s own line)', BLOCK, swap('const bootOnPace = (pace) =>', 'bootOnArmed(); const bootOnPace = (pace) =>'), (t) => armJoin({ block: t }));

// the same lines through the rules alone, over ANY number of boots (a device model: no page), and the leaf's own lines
const boundOverBoots = (rules) => {
  const WAIT = rules.LOOK_FETCH_WAIT_MS;
  const fetched = [LINES.awaited('module requests not in: 5'), LINES.awaited('files not in: 5'), LINES.entry, LINES.silent,
    'assets: files not in: 3; room: not ready after 24000 ms (adopted late if it arrives)', "assets: files not in: 1; the hall's files or bakes were not in after 12000 ms"];
  for (const line of fetched) {
    assert.equal(rules.lookFailClass(line), 'fetch', `the class of "${line}"`);
    const d = device(rules);
    let t = T0;
    assert.equal(d.boot(t).why, 'pass-new');
    d.failed(line, t + 25000);
    assert.deepEqual(d.boot(t + MIN), out('default', 'hall', 'stage', 'base', 'pass-retry'), 'one such boot: the hall is asked for again');
    d.failed(line, t + MIN + 25000);
    for (let round = 0; round < 8; round++) { // two in a row, then one per hour, as long as the link stays slow
      const at = d.rec().failAt;
      assert.deepEqual([d.rec().verdict, d.rec().fails.build, d.rec().fails.timeout, d.rec().fails.fetch], [null, 0, 0, 2 + round], `"${line}", round ${round}: no verdict, nothing counted against the device`);
      assert.deepEqual(d.boot(at + MIN), out('default', 'old', 'none', 'base', 'fetch-wait'), 'the old room at once: no leaf asked, no wait on the stage');
      assert.equal(d.boot(at + WAIT - 1).why, 'fetch-wait', 'for the hour');
      assert.deepEqual(d.boot(at + WAIT), out('default', 'hall', 'stage', 'base', 'pass-retry'), 'then ONE try more');
      t = at + WAIT; d.failed(line, t + 25000);
    }
    assert.equal(d.rec().verdict, null, `"${line}": ten such boots, never a verdict`);
    d.pace(pace(FAST), t + WAIT + MIN);
    assert.deepEqual([d.rec().verdict, d.rec().fails], ['hall', { fetch: 0, build: 0, timeout: 0 }], 'the first boot on a good link: the hall, the run of failures ended');
  }
  // every file in and a build that never finishes: main's bare line and the leaf's two
  for (const line of [LINES.built, 'timeout: room: not ready after 24000 ms (adopted late if it arrives)', "timeout: the hall's files or bakes were not in after 12000 ms"]) {
    const d = device(rules);
    d.failed(line, T0 + 25000);
    assert.deepEqual([rules.lookFailClass(line), d.rec().verdict, d.rec().fails.timeout], ['timeout', null, 1], `"${line}": one slow build is not yet a verdict`);
    assert.equal(d.boot(T0 + MIN).why, 'pass-retry');
    d.failed(line, T0 + MIN + 25000);
    assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().fails.timeout], ['old', 'timeout', 2], `"${line}": the second makes the verdict`);
    for (const now of [T0 + 2 * MIN, T0 + 2 * MIN + 30 * WAIT]) assert.deepEqual(d.boot(now), light('default'));
  }
};
await ok('the bound over boots (the rules alone): bytes pending, the entry missing or no answer, over ten boots = no verdict, the hour\'s hold after two in a row, one try per hour after; every file in and a slow build = `old` the second time', () => boundOverBoots(R));
await plant('a line headed `assets` is not read as a fetch', RULES, swap('/^(import|assets)\\b/', '/^(import)\\b/'), (t) => boundOverBoots(load(t)));
await plant('bytes pending at the bound condemn the device', RULES, swap("cls !== 'fetch' && fails[cls] >= LOOK_TRIES[cls]", 'fails[cls] >= LOOK_TRIES[cls]'), (t) => boundOverBoots(load(t)));
await plant('no hold after two such boots (25 s on the stage at every boot)', RULES, swap('rec.fails.fetch >= LOOK_TRIES.fetch', 'rec.fails.fetch >= 99'), (t) => boundOverBoots(load(t)));
await plant('the hold after a slow link never ends', RULES, swap('now - rec.failAt < LOOK_FETCH_WAIT_MS', 'now - rec.failAt < Infinity'), (t) => boundOverBoots(load(t)));
await plant('a build that never finishes is tried on every boot', RULES, swap('build: 1, timeout: 2, fetch: 2', 'build: 1, timeout: 99, fetch: 2'), (t) => boundOverBoots(load(t)));

// THE BETWEEN-ROUNDS CASE: when the bound fires, everything the hall had asked the network for has arrived and more
// would have been asked for later (the modules are in, the maps not yet requested; or the gap of a few milliseconds
// between two rounds of requests, also over a slow link). A file not yet asked for is not awaited, so the leaf answers
// "nothing" and the bound says `timeout`. That counts ONCE and cannot alone make `old`.
const boundLine = (whyText, { entry = true, member = NO_LEAF } = {}) => new Function('clubIn', 'club', `'use strict';\n${whyText};\nreturn boundWhy();`)(entry, { stage: { pending: member === NO_LEAF ? null : member } });
const betweenRounds = (rules, whyText = BOUND_WHY) => {
  const asked = says(null), line = boundLine(whyText, { member: asked });
  assert.deepEqual([line, asked.asked, rules.lookFailClass(line)], ['timeout', 1, 'timeout'], 'everything asked for had arrived, more would have been asked for later: the bound says timeout');
  // ONE such boot: counted once, no verdict, and it never becomes one by itself
  let d = device(rules);
  assert.equal(d.boot(T0).why, 'pass-new');
  d.failed(line, T0 + 25000);
  assert.deepEqual([d.rec().verdict, d.rec().fails], [null, { fetch: 0, build: 0, timeout: 1 }], 'one such boot: counted once, no verdict');
  for (const now of [T0 + MIN, T0 + 60 * MIN, T0 + 30 * 24 * 60 * MIN]) assert.deepEqual(d.boot(now), out('default', 'hall', 'stage', 'base', 'pass-retry'), 'alone it cannot make `old`: the hall is asked for again, however much later');
  // a hall MEASURED on a later boot clears the count (the rules as they were), so a later such boot is again the first
  d.pace(pace(FAST), T0 + MIN + 9000);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().fails], ['hall', 'pace-ok', { fetch: 0, build: 0, timeout: 0 }], 'a measured hall clears the count');
  d.failed(line, T0 + 2 * MIN + 25000);
  assert.deepEqual([d.rec().verdict, d.rec().fails.timeout, d.boot(T0 + 3 * MIN).shown], ['hall', 1, 'hall'], 'the next such boot is the first of a new run: no `old`');
  // ... also a hall that was revealed without a verdict (the page was away during its window)
  d = device(rules);
  d.failed(line, T0 + 25000);
  d.pace(pace({ ...FAST, hidden: 4 }), T0 + MIN + 9000);
  assert.deepEqual([d.rec().verdict, d.rec().fails], [null, { fetch: 0, build: 0, timeout: 0 }], 'a revealed hall without a verdict clears the count too');
  d.failed(line, T0 + 2 * MIN + 25000);
  assert.deepEqual([d.rec().verdict, d.rec().fails.timeout], [null, 1]);
  // only a SECOND such boot in a row makes `old`
  d = device(rules);
  d.failed(line, T0 + 25000);
  assert.equal(d.boot(T0 + MIN).why, 'pass-retry');
  d.failed(line, T0 + MIN + 25000);
  assert.deepEqual([d.rec().verdict, d.rec().why, d.rec().fails.timeout], ['old', 'timeout', 2], 'the second such boot in a row: `old`');
  assert.deepEqual(d.boot(T0 + 2 * MIN), light('default'));
  // (the rules as they are, stated so that nobody has to guess: the count is per class and only a revealed hall clears
  // it. A boot that failed as a fetch between two such boots does not clear it)
  d = device(rules);
  d.failed(line, T0 + 25000); d.failed(LINES.awaited('files not in: 5'), T0 + MIN + 25000);
  assert.deepEqual([d.rec().verdict, d.rec().fails], [null, { fetch: 1, build: 0, timeout: 1 }]);
  d.failed(line, T0 + 2 * MIN + 25000);
  assert.deepEqual([d.rec().verdict, d.rec().fails], ['old', { fetch: 1, build: 0, timeout: 2 }], 'a failed fetch between two such boots is not a revealed hall: the second still makes `old`');
};
await ok('the between-rounds case (everything asked for had arrived, more would have been asked for later): the bound says `timeout`, which counts ONCE and cannot alone make `old`; a hall measured on a later boot clears the count; only a SECOND such boot in a row makes `old`', () => betweenRounds(R));
await plant('one between-rounds boot alone makes `old`', RULES, swap('build: 1, timeout: 2, fetch: 2', 'build: 1, timeout: 1, fetch: 2'), (t) => betweenRounds(load(t)));
await plant('a measured hall does not clear the count of such boots', RULES, swap('const fails = { fetch: 0, build: 0, timeout: 0 }, numbers = lookPaceNumbers(pace);', 'const fails = rec.fails, numbers = lookPaceNumbers(pace);'), (t) => betweenRounds(load(t)));
await plant('a second between-rounds boot in a row does not make `old`', RULES, swap('build: 1, timeout: 2, fetch: 2', 'build: 1, timeout: 3, fetch: 2'), (t) => betweenRounds(load(t)));
await plant('the between-rounds case is read as a failed fetch (a slow device is never told)', BOUND_WHY, swap(": 'timeout'; } catch", ": 'assets: the bound, nothing'; } catch"), (t) => betweenRounds(R, t));

// the entry's flag: `clubIn` is false until the leaf's entry module has arrived and true before the leaf's first line
// runs; a failed import leaves it false (and says `import` by itself). The leaf is handed main's own stage object: what
// it sets there is what the bound reads.
const ASK_FROM = main.indexOf('    let clubIn = false;'), ASK_TO = main.indexOf('\n', main.indexOf("console.warn('[club] the club look is unavailable"));
assert.ok(ASK_FROM > 0 && ASK_TO > ASK_FROM && ASK_FROM < STAGE_FROM, 'main.js: the entry\'s flag and the one import stand above the stage block');
const CLUB_ASK = main.slice(ASK_FROM, ASK_TO);
const entryFlag = async (text) => {
  assert.equal(text.split("import('../scene/club/index.js')").length, 2, 'the one import is in these lines');
  const turn = () => new Promise((resolve) => { setImmediate(resolve); });
  const run = (importLeaf, { protocol, flow = 'stage' } = {}) => {
    const log = { failed: [], released: 0 }, club = { flow, stage: { failed: (r) => log.failed.push(r), ...(protocol === undefined ? null : { protocol }) } };
    const h = new Function('importLeaf', 'release', 'club', 'console', 'renderer', 'scene', 'camera', 'composer', 'gi', 'machine', 'game',
      `'use strict';\n${text.replace("import('../scene/club/index.js')", 'importLeaf()')}\nreturn { clubAsk, entry: () => clubIn };`)(importLeaf, () => { log.released += 1; }, club, { warn() {} }, 1, 2, 3, 4, 5, 6, 7);
    return { h, log, club };
  };
  let arrive = null, at = null, handed = null;
  let b = run(() => new Promise((resolve) => { arrive = resolve; }));
  assert.equal(b.h.entry(), false, 'before the leaf is asked for: not arrived');
  b.h.clubAsk(); await turn();
  assert.equal(b.h.entry(), false, 'asked for and held in the network: not arrived');
  arrive({ installClub: (ctx) => { at = b.h.entry(); handed = ctx; return new Promise(() => {}); } }); await turn();
  assert.deepEqual([b.h.entry(), at, b.log.released, b.log.failed], [true, true, 0, []], 'arrived: the flag stands before the leaf\'s first line runs, whatever the install then takes');
  assert.equal(handed.stage, b.club.stage, 'the leaf is handed main\'s own stage object');
  b = run(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')));
  b.h.clubAsk(); await turn();
  assert.deepEqual([b.h.entry(), b.log.failed, b.log.released], [false, ['import'], 1], 'a failed import: never arrived; main says `import` at once');
  // THE HANDSHAKE (step 2): on a stage boot a leaf that speaks another stage protocol than main's stage object names is
  // NOT installed; main says `mismatch` at once (a class that stores nothing). A curtain boot installs whatever it says
  for (const [leaf, mine, flow, installed] of [[2, 2, 'stage', true], [undefined, undefined, 'stage', true], [undefined, 2, 'stage', false], [1, 2, 'stage', false], [3, 2, 'stage', false], [2, 3, 'stage', false], ['2', 2, 'stage', false], [9, 2, 'curtain', true], [undefined, 2, 'curtain', true]]) {
    let calls = 0;
    b = run(() => Promise.resolve({ STAGE_PROTOCOL: leaf, installClub: () => { calls += 1; return new Promise(() => {}); } }), { protocol: mine, flow });
    b.h.clubAsk(); await turn();
    assert.deepEqual([calls, b.log.failed.length, b.h.entry()], [installed ? 1 : 0, installed ? 0 : 1, true], `a leaf of protocol ${String(leaf)} on a ${flow} boot of protocol ${String(mine)}: ${installed ? 'installed' : 'not installed, one failure'}; the entry had arrived either way`);
    if (!installed) assert.match(b.log.failed[0], /^mismatch: the leaf speaks stage protocol /, 'the failure is headed mismatch');
  }
  assert.equal(R.lookFailClass(`mismatch: the leaf speaks stage protocol ${String(undefined)}, the app 2`), 'mismatch', 'main reads its own line as a mismatch');
};
await ok('the entry\'s flag (main.js\'s import lines as text): false while the entry is held in the network, true before the leaf runs, false after a failed import; the leaf gets main\'s own stage object', () => entryFlag(CLUB_ASK));
await plant('the entry counts as arrived before it was asked for', CLUB_ASK, swap('let clubIn = false;', 'let clubIn = true;'), entryFlag);
await plant('the entry never counts as arrived', CLUB_ASK, swap('clubIn = true;\n        return m.installClub', 'return m.installClub'), entryFlag);
await plant('a leaf of another stage protocol is installed', CLUB_ASK, swap('m.STAGE_PROTOCOL !== club.stage.protocol', 'false'), entryFlag);
await plant('the handshake is asked of a curtain boot', CLUB_ASK, swap("club.flow === 'stage' && m.STAGE_PROTOCOL", 'm.STAGE_PROTOCOL'), entryFlag);
await plant('the mismatch is said as a build failure', CLUB_ASK, swap('club.stage.failed(`mismatch: the leaf', 'club.stage.failed(`leaf: the leaf'), entryFlag);

// ---- 6. settings.js: the sanitizer, set(), the reload offer, the picker; the seven locales -------------------------------
const sanitizer = (text) => {
  const at = text.indexOf("    if (v.look === 'sp') v.look = 'tournament';");
  assert.ok(at > 0, 'the sanitizer\'s first line is the line it was');
  const two = text.slice(at, text.indexOf('\n', text.indexOf('\n', at) + 1));
  const run = (look) => { const saved = { look }, v = { ...saved }; new Function('saved', 'v', 'DEFAULTS', two)(saved, v, { look: 'tournament' }); return v.look; };
  assert.deepEqual(['arena', 'club', 'sp', 'green', 'tournament', 'tournament-legacy', 'ARENA', undefined, 7].map(run),
    ['tournament', 'club', 'tournament', 'green', 'tournament', 'tournament', 'tournament', 'tournament', 'tournament'], 'a stored arena is rewritten to tournament where the legacy id is; club stays; nothing else is an id');
  assert.match(text, /function set\(key, value, options = \{\}\) \{\n    if \(key === 'look' && value === 'arena'\) value = 'tournament';[^\n]*\n    if \(key !== 'equipment' && key !== 'game'\) return commitSetting\(key, key === 'look' && value === 'sp' \? 'tournament' : value, options\);/, 'set() rewrites arena on the line above the legacy id\'s rewrite');
  assert.match(text, /^  const values = load\(\); clubStoredAtBoot = values\.look === 'club' \? 'club' : false; ctx\.clubLookReload = clubLookReload;/m);
};
const offerRows = async (text) => {
  const at = text.indexOf('async function clubLookReload(value) {');
  assert.ok(at > 0);
  const fn = braced(text, at);
  const AsyncFunction = (async () => {}).constructor;
  const offer = async (clubAtBoot, shown, next, value, search = '') => {
    let confirms = 0, reloads = 0, asked = 0;
    const ctx = shown === undefined ? {} : { lookBoot: { shown }, lookNext: () => { asked += 1; return next; } };
    const run = new AsyncFunction('clubStoredAtBoot', 'ctx', 'location', 'window', 't', `${fn}; await clubLookReload(${JSON.stringify(value)});`);
    await run(clubAtBoot, ctx, { search, reload: () => { reloads += 1; } }, { confirm: (body) => { assert.equal(body, 'settings.lookChangeReloadConfirm'); confirms += 1; return true; } }, (k) => k);
    assert.equal(reloads, confirms, 'a confirmed offer reloads');
    return confirms;
  };
  // rows: the profile held club at boot, what the page shows (main's fact), what a reload shows for Tournament, the new value, offered here?
  const rows = [
    [false, 'green', 'old', 'tournament', 0], [false, 'green', 'old', 'green', 0], [false, 'green', 'old', 'club', 1],          // a green page, Tournament is the old room: the live regrade (main), no offer
    [false, 'green', 'hall', 'tournament', 1], [false, 'green', 'hall', 'green', 0], [false, 'green', 'hall', 'club', 1],       // a green page, Tournament is the hall: the reload is offered
    [false, 'old', 'old', 'tournament', 0], [false, 'old', 'old', 'green', 0], [false, 'old', 'old', 'club', 1],                // the old room (-> green is main.js's own offer)
    [false, 'old', 'hall', 'tournament', 1],                                                                                    // the old room by a URL-free page whose record changed: a reload would show the hall
    [false, 'hall', 'hall', 'tournament', 0], [false, 'hall', 'old', 'tournament', 0], [false, 'hall', 'hall', 'green', 0], [false, 'hall', 'hall', 'club', 1], // the hall (-> green is main.js's own offer)
    ['club', 'club', 'hall', 'club', 0], ['club', 'club', 'hall', 'tournament', 1], ['club', 'club', 'old', 'tournament', 1], ['club', 'club', 'hall', 'green', 0],
    [false, 'green', 'green', 'tournament', 0],                                                                                 // a scripted page: a reload shows green
    [false, undefined, undefined, 'tournament', 0], [false, undefined, undefined, 'club', 1], [false, undefined, undefined, 'green', 0], ['club', undefined, undefined, 'tournament', 1], // a main.js without the decision: the old rule
  ];
  for (const [clubAtBoot, shown, next, value, wantOffer] of rows) {
    assert.equal(await offer(clubAtBoot, shown, next, value), wantOffer, `club at boot ${clubAtBoot}, page shows ${shown}, a reload shows ${next} for Tournament, new value ${value}`);
    assert.equal(await offer(clubAtBoot, shown, next, value, '?look=arena'), 0, 'a URL that pins a look gets no offer');
  }
  // step 2: a page that shows one hall where a reload would show the OTHER is offered the reload when Tournament is chosen
  // (the way out on a page that shows the light hall). Rows: the page's rung, the reload's rung (null: no hall there;
  // undefined: a main.js without the answer), the new value, offered here?
  const rungOffer = async (pageRung, nextRung, value, search = '') => {
    let confirms = 0;
    const ctx = { lookBoot: { shown: 'hall', ...(pageRung ? { rung: pageRung } : null) }, lookNext: () => 'hall', ...(nextRung === undefined ? null : { lookNextRung: () => nextRung }) };
    const run = new AsyncFunction('clubStoredAtBoot', 'ctx', 'location', 'window', 't', `${fn}; await clubLookReload(${JSON.stringify(value)});`);
    await run(false, ctx, { search, reload: () => {} }, { confirm: () => { confirms += 1; return true; } }, (k) => k);
    return confirms;
  };
  for (const [pageRung, nextRung, value, wantOffer] of [['lite', 'base', 'tournament', 1], [undefined, 'lite', 'tournament', 1], ['lite', 'lite', 'tournament', 0], [undefined, 'base', 'tournament', 0], ['lite', null, 'tournament', 0], ['lite', undefined, 'tournament', 0],
    ['lite', 'base', 'green', 0], ['lite', 'base', 'club', 1]]) {
    assert.equal(await rungOffer(pageRung, nextRung, value), wantOffer, `the page shows the hall on the rung ${pageRung ?? 'base'}, a reload shows the rung ${String(nextRung)}, new value ${value}`);
    assert.equal(await rungOffer(pageRung, nextRung, value, '?look=arena'), 0, 'a URL that pins a look gets no offer');
  }
};
await ok('settings: the sanitizer and set() rewrite a stored arena; the reload offer over every (page, new value) pair', async () => { sanitizer(settings); await offerRows(settings); });
await plant('a stored arena survives the sanitizer', settings, swap("if (saved.look === 'club') v.look = 'club';", "if (saved.look === 'club' || saved.look === 'arena') v.look = saved.look;"), sanitizer);
await plant('set() keeps arena', settings, swap("    if (key === 'look' && value === 'arena') value = 'tournament';", "    if (key === 'look' && value === 'arena2') value = 'tournament';"), sanitizer);
await plant('green to Tournament is never offered a reload', settings, swap("ctx.lookNext?.() === 'hall'", 'false'), offerRows);
await plant('the hall page is offered a reload for its own look', settings, swap("(shown === 'hall' || ctx.lookNext?.() === 'hall')", "(ctx.lookNext?.() === 'hall')"), offerRows);
await plant('a pinned URL is offered a reload', settings, swap('if (pinned || (next === shown', 'if ((next === shown'), offerRows);
await plant('a page on the light hall is not offered the reload that would show the standard hall', settings, swap("!!rung && rung !== (ctx.lookBoot?.rung ?? 'base')", 'false'), offerRows);
await plant('a reload that shows no hall counts as another rung', settings, swap('!!rung && rung !==', 'rung !=='), offerRows);
await plant('the page\'s rung is not read (every page counts as the standard hall)', settings, swap("(ctx.lookBoot?.rung ?? 'base')", "'base'"), offerRows);

await ok('settings: the picker keeps two options (tournament under settings.lookSp, green); the third is built for a profile that stores club, and only for it; the handler line is the line it was', () => {
  const at = settings.indexOf('<select id="ob-set-look">'), sel = settings.slice(at, settings.indexOf('</select>', at));
  assert.deepEqual([...sel.matchAll(/<option value="([^"]+)" data-i18n="([^"]+)"><\/option>/g)].map((m) => [m[1], m[2]]), [['tournament', 'settings.lookSp'], ['green', 'settings.lookGreen']]);
  assert.equal(sel.split('<option').length, 3, 'two options in the markup');
  assert.match(settings, /if \(v\.look === 'club' && !look\.querySelector\('option\[value="club"\]'\)\) \{\n      const clubOption = document\.createElement\('option'\);\n      clubOption\.value = 'club';\n      clubOption\.dataset\.i18n = 'settings\.lookClub';/);
  assert.equal(settings.split('document.createElement(\'option\')').length >= 2, true);
  assert.ok(!settings.includes('lookArena') && !main.includes('lookArena'), 'the arena label key is gone from the code');
  assert.ok(!settings.includes('tournament-legacy'), 'tournament-legacy is never stored and never listed');
  assert.ok(!/<option\b[^>]*\bvalue\s*=\s*(['"]?)(?:club|arena)\1/i.test(settings), 'no club or arena option in the markup (the identity arm\'s OPTION rule)');
  assert.match(settings, /if \(key === 'look'\) \{ ctx\.applyLook\?\.\(value\); ctx\.clubLookReload\?\.\(value\); \}/);
  assert.equal(settings.split('clubLookReload(').length - 1, 1, 'the only `clubLookReload(` is the definition');
  // a URL look never reaches the stored profile: settings.js reads the URL once, as a yes/no (is a look
  // pinned), never as a value; main.js never sets the look setting; so `values.look`, the one thing persist() writes, comes
  // from the stored blob (sanitized) and from set() (which rewrites arena) alone
  assert.equal(settings.split('location.search').length - 1, 1, 'one read of the URL in settings.js');
  assert.match(settings, /pinned = new URLSearchParams\(location\.search\)\.has\('look'\);/);
  assert.ok(!/\.get\(\s*['"]look['"]\s*\)/.test(settings), 'settings.js never reads the URL look\'s value');
  assert.ok(!/\.set\(\s*['"]look['"]/.test(stripComments(main)), 'main.js never sets the look setting');
  // no new import: the decision reaches settings.js through ctx, by feature detection
  assert.ok(/ctx\.lookBoot\?\.shown/.test(settings) && /ctx\.lookNext\?\.\(\)/.test(settings));
  for (const text of [settings, main]) assert.ok(!/^import[^\n]*\blook(?:Boot|Next|Decide|Record)\b/m.test(text), 'no named import of the decision');
});

await ok('the seven locales: settings.lookSp reads each locale\'s word for Tournament; settings.lookArena is gone; every key the look rows use is a filled string', () => {
  const wantSp = { en: 'Tournament', de: 'Turnier', fr: 'Tournoi', es: 'Torneo', ja: 'トーナメント', ko: '토너먼트', 'zh-CN': '锦标赛' };
  const count = new Set();
  for (const l of LOCALES) {
    const loc = JSON.parse(read(`locales/${l}.json`));
    assert.equal(loc['settings.lookSp'], wantSp[l], `${l}: settings.lookSp`);
    assert.ok(!('settings.lookArena' in loc), `${l}: settings.lookArena is gone`);
    for (const k of ['settings.look', 'settings.lookGreen', 'settings.lookClub', 'settings.lookReloadConfirm', 'settings.lookChangeReloadConfirm', 'confirm.lookReloadTitle', 'confirm.continue', 'confirm.cancel']) {
      assert.ok(typeof loc[k] === 'string' && loc[k].trim().length > 0, `${l}: ${k}`);
    }
    assert.notEqual(loc['settings.lookSp'], loc['settings.lookGreen'], `${l}: two different labels`);
    count.add(Object.keys(loc).length);
  }
  assert.equal(count.size, 1, 'the seven files carry the same number of keys');
});

// ---- 7. the bug report: the same record plus the verdict record ---------------------------------------------------------
await ok('the bug report: settings.look stays; app.lookBoot is the __test fact and app.lookVerdict the raw record, read under main.js\'s key; no new top-level section', () => {
  assert.equal(/const LOOK_VERDICT_KEY = '([^']+)';/.exec(bug)?.[1], KEY, 'bugreport.js duplicates main.js\'s key literal');
  assert.match(bug, /look: \(s\.look === 'sp' \? 'tournament' : s\.look\) \?\? null, \/\/ 'sp': the legacy look id \(GH-973\)/, 'the look line is the line it was');
  assert.match(bug, /^        lookBoot: window\.__test\?\.lookBoot \?\? null,$/m);
  assert.match(bug, /^        lookVerdict: sec\(\(\) => localStorage\.getItem\(LOOK_VERDICT_KEY\)\),$/m);
  assert.match(bug, /bundle_version: 3,/, 'the bundle version is unchanged (no new section)');
  const top = braced(bug, bug.indexOf('  return {\n    bundle_version: 3,'));
  const keys = [...top.matchAll(/^    ([a-z_]+):/gm)].map((m) => m[1]);
  assert.deepEqual(keys, ['bundle_version', 'generated_at', 'kernel_version', 'rules_version', 'app', 'settings', 'storage', 'scenarios', 'judgments', 'replay_url', 'errors', 'match_state', 'balls', 'platform'], 'the closed top-level field list');
  assert.ok(!/\.(?:setItem|removeItem)\(/.test(bug), 'the report writes no storage');
});

// ---- 8. the test launcher's old-room pin (web/tools/cdp.mjs launchChrome, option lookPin): its seed against main.js's lines ----
// The launcher is not on every host this arm runs on (the loan host has web/tools/club only). So the arm HOLDS the seed's
// text (a duplicated literal, like the tier rule), runs it as a page would, and where the launcher's file is present
// asserts that the launcher carries exactly this text.
const PIN_SEED = `(() => {
  const set = Storage.prototype.setItem;
  addEventListener('ob:look-verdict', (e) => {
    try {
      set.call(localStorage, e.detail.key, JSON.stringify({ v: 1, app: e.detail.app, verdict: 'old', why: 'pin', at: Date.now(), passed: false, slow: 0,
        fails: { fetch: 0, build: 0, timeout: 0 }, failAt: null, reason: 'pinned by the test launcher (web/tools/cdp.mjs launchChrome, lookPin)', pace: null }));
    } catch (err) { /* storage unavailable: nothing is seeded on this document */ }
  });
})();`;
/** What every suite's real-user boot must be on a passing host under the pin (`text`: main.js's lines; `seed`: the launcher's script). */
const pinned = (seed, text = BLOCK) => {
  const oldRoom = (p, asked, label) => assert.deepEqual([p.bootLook, p.bootClub, p.club, { ...p.ctx.lookBoot }], ['tournament', false, null, out(asked, 'old', 'none', 'base', 'verdict-pin')], label);
  // a real-user boot on a passing device: the old room, by the record a device that failed the pace holds; no hand-over, so no leaf byte
  let store = storage(profile('tournament')), p = page(text, { store, seed });
  oldRoom(p, 'stored:tournament', 'a pinned real-user boot: the old room, why verdict-pin, the hand-over null');
  const rec = JSON.parse(store.map.get(KEY));
  assert.deepEqual([rec.v, rec.app, rec.verdict, rec.why, rec.at, rec.passed, rec.slow, rec.fails, rec.pace], [1, p.lookApp, 'old', 'pin', T0, false, 0, { fetch: 0, build: 0, timeout: 0 }, null], 'the seeded record: a full record under the page\'s own app version, its why names the pin');
  assert.match(rec.reason, /test launcher/);
  assert.deepEqual(R.lookRecord(store.map.get(KEY), p.lookApp), { ...R.lookFresh(p.lookApp), verdict: 'old', why: 'pin', at: T0, reason: rec.reason }, 'the product\'s own reader takes it as a record (no rule bent: same key, same version rule)');
  assert.deepEqual([store.gets, store.sets], [['ob-settings-v1', KEY], [KEY]], 'seeded once, as the read is announced, then read by the product');
  // whatever the profile holds: nothing, a stored arena, an unreadable blob, an older record, a hall verdict of this very version
  for (const init of [{}, profile('arena'), { 'ob-settings-v1': '{bad' }, { [KEY]: JSON.stringify(OLD('another version')) }, { [KEY]: JSON.stringify({ ...OLD('0.1.0+b4cd722c|10b624f671e3|1'), verdict: 'hall', why: 'pace-ok', passed: true }) }, { [KEY]: '{bad' }]) {
    p = page(text, { store: storage(init), seed });
    assert.deepEqual([p.bootClub, p.ctx.lookBoot.shown, p.ctx.lookBoot.why], [false, 'old', 'verdict-pin'], `pinned over ${JSON.stringify(init).slice(0, 60)}`);
  }
  oldRoom(page(text, { query: 'look=tournament', seed }), 'url:tournament', 'a real-user boot with the URL value tournament is pinned too');
  // under ANY build: the seed names the version the page itself announces
  for (const o of [{ kernel: '9.9.9+ffffffff' }, { html: 'abcdefabcdef' }, { kernel: null }, { html: null }, { kernel: '0.2.0+0badc0de', html: '000000000000' }]) {
    p = page(text, { ...o, seed });
    assert.deepEqual([p.ctx.lookBoot.shown, p.ctx.lookBoot.why], ['old', 'verdict-pin'], `pinned under the build ${p.lookApp}`);
  }
  // every new document is seeded: a reload, a reload after the suite cleared storage, a later boot of the same profile
  store = storage(profile('tournament'));
  for (let i = 0; i < 3; i++) { if (i === 1) store.map.clear(); p = page(text, { store, seed, now: T0 + i * MIN }); assert.equal(p.ctx.lookBoot.why, 'verdict-pin', `document ${i + 1}`); assert.equal(p.bootClub, false); }
  // a suite's storage stub put on the page AFTER document start does not unpin it (the seed kept the prototype's setItem)
  p = page(text, { seed, afterSeed: (st) => { st.setItem = () => { throw new Error('QuotaExceededError (a suite\'s stub)'); }; } });
  assert.deepEqual([p.ctx.lookBoot.shown, p.ctx.lookBoot.why], ['old', 'verdict-pin'], 'pinned under a suite\'s setItem stub');
  // boots that never ask for the record are what they were, and nothing is seeded there (no new key in their storage)
  for (const [o, shown, flow] of [[{ scripted: true }, 'green', 'none'], [{ query: 'look=green' }, 'green', 'none'], [{ query: 'look=sp' }, 'old', 'none'], [{ query: 'look=tournament', scripted: true }, 'old', 'none'],
    [{ query: 'look=arena' }, 'hall', 'curtain'], [{ query: 'look=arena', scripted: true }, 'hall', 'curtain'], [{ query: 'look=club' }, 'club', 'curtain'],
    [{ init: profile('green') }, 'green', 'none'], [{ init: profile('club') }, 'club', 'curtain'], [{ renderer: gpu(SOFT) }, 'old', 'none']]) {
    const st = storage(o.init ?? {}); p = page(text, { ...o, store: st, seed });
    assert.deepEqual([p.ctx.lookBoot.shown, p.ctx.lookBoot.flow, st.sets], [shown, flow, []], `under the pin, ?${o.query ?? ''} ${JSON.stringify(o.init ?? {})}: as without it, nothing seeded`);
  }
  // a green real-user page: the reload question is pinned too, so green -> Tournament stays the live regrade the suites pin
  store = storage(profile('green')); p = page(text, { store, seed });
  assert.equal(p.ctx.lookNext(), 'old'); assert.deepEqual(store.sets, [KEY]);
};
await ok('the launcher\'s old-room pin: its seed makes a passing host\'s real-user boot the old room through a real stored record, under any build, on every document; boots that never reach Tournament are untouched', () => pinned(PIN_SEED));
await ok('the pin\'s edges: without the seed (lookPin: false, the hall legs) the same boots show the hall; a page with no working storage cannot be pinned by a stored record', () => {
  const p = page(BLOCK, { store: storage(profile('tournament')) });
  assert.deepEqual([p.bootClub, p.bootFlow, p.ctx.lookBoot.why], [true, 'stage', 'pass-new'], 'no seed: the hall by the stage flow');
  const dead = storage(); dead.dead = true;
  const q = page(BLOCK, { store: dead, seed: PIN_SEED });
  assert.deepEqual([q.bootClub, q.ctx.lookBoot.shown], [true, 'hall'], 'KNOWN LIMIT: storage that throws on every call (a real private-mode or quota page) is not pinned; the fact says so (shown hall)');
});
await plant('THE PIN IS MISSING (the seed is not registered): a suite that expects the old room goes red', PIN_SEED, () => '', (seed) => pinned(seed));
await plant('the seed listens for another event', PIN_SEED, swap("'ob:look-verdict'", "'ob:look-record'"), (seed) => pinned(seed));
await plant('the seed names a version of its own (valid under one build only)', PIN_SEED, swap('app: e.detail.app', "app: '0.1.0+b4cd722c|10b624f671e3|1'"), (seed) => pinned(seed));
await plant('the seed hides its origin (the why of a measured device)', PIN_SEED, swap("why: 'pin'", "why: 'pace-median'"), (seed) => pinned(seed));
await plant('the seed writes through the page\'s own setItem (a suite\'s stub unpins it)', PIN_SEED, swap('set.call(localStorage, e.detail.key,', 'localStorage.setItem(e.detail.key,'), (seed) => pinned(seed));
await plant('the seed stores under a key of its own', PIN_SEED, swap('e.detail.key,', "'ob-look-pin',"), (seed) => pinned(seed));
await plant('main.js stops announcing the read (the pin has nothing to answer)', BLOCK, swap("window.dispatchEvent(new CustomEvent('ob:look-verdict', { detail: { app: lookApp, key: LOOK_VERDICT_KEY } }));", ''), (text) => pinned(PIN_SEED, text));
await plant('main.js announces after the read', BLOCK, swap("record: lookRawAnnounced, app: lookApp", "record: () => { const raw = lookRaw(); lookRawAnnounced(); return raw; }, app: lookApp"), (text) => pinned(PIN_SEED, text));

// ---- 8c. the offline row through main.js's own lines: what an offline boot reads, stores, hands over and tells settings ----
const WIRE_APP = '0.1.0+b4cd722c|10b624f671e3|1';
const offlineWiring = (text, seed = PIN_SEED) => {
  const paceOld = JSON.stringify(OLD(WIRE_APP)), hallRec = JSON.stringify({ ...OLD(WIRE_APP), verdict: 'hall', why: 'pace-ok', passed: true });
  // a passing device, offline at boot, a page served over http(s): the old room at once. No hand-over (so no byte of the
  // leaf is asked), the record neither read nor announced, nothing stored, nothing cleared
  for (const protocol of ['http:', 'https:']) for (const [init, asked] of [[profile('tournament'), 'stored:tournament'], [{}, 'default'], [profile('arena'), 'stored:arena'],
    [{ ...profile('tournament'), [KEY]: paceOld }, 'stored:tournament'], [{ [KEY]: hallRec }, 'default'], [{ [KEY]: '{corrupt' }, 'default']]) {
    const store = storage(init), p = page(text, { store, online: false, protocol });
    assert.deepEqual([p.bootLook, p.bootClub, p.club, p.bootFlow], ['tournament', false, null, 'none'], `offline over ${protocol}: the old room, the hand-over null`);
    assert.deepEqual({ ...p.ctx.lookBoot }, out(asked, 'old', 'none', 'base', 'offline'), 'the boot fact says why');
    assert.deepEqual([store.gets, store.sets, p.announced.length, Object.fromEntries(store.map)], [['ob-settings-v1'], [], 0, init], 'the record is not read, not announced, nothing is stored or cleared');
    // the reload question, asked of the page AS IT IS NOW: offline, a reload would show the old room (and asking reads nothing)
    assert.equal(p.ctx.lookNext(), 'old');
    assert.deepEqual([store.gets, store.sets, p.announced.length], [['ob-settings-v1'], [], 0]);
  }
  // ... and once the page is online again a reload would show what the record says (the hall with none)
  let p = page(text, { store: storage(profile('green')), online: false });
  assert.deepEqual([{ ...p.ctx.lookBoot }.shown, p.ctx.lookNext()], ['green', 'old'], 'a green page, offline: Tournament would be the old room after a reload now');
  p.nav.onLine = true;
  assert.equal(p.ctx.lookNext(), 'hall', 'the same page, online again: the hall');
  // a page that booted online and shows the hall, then goes offline: a reload now would show the old room; its fact stays
  p = page(text, { store: storage(profile('tournament')) });
  assert.deepEqual([p.bootFlow, p.ctx.lookNext()], ['stage', 'hall']);
  p.nav.onLine = false;
  assert.deepEqual([p.ctx.lookNext(), { ...p.ctx.lookBoot }.shown, p.bootClub], ['old', 'hall', true]);
  // ONLY over http(s): a native shell (its bundle's own scheme) that is offline shows the hall, by the record as ever
  for (const protocol of ['app:', 'file:']) {
    const store = storage(profile('tournament'));
    p = page(text, { store, online: false, protocol });
    assert.deepEqual([p.bootClub, p.bootVenue, p.bootFlow, p.ctx.lookBoot.why, store.gets, p.announced.length], [true, 'arena', 'stage', 'pass-new', ['ob-settings-v1', KEY], 1], `offline under ${protocol}: the hall by the stage flow`);
    assert.equal(p.ctx.lookNext(), 'hall');
    assert.equal(page(text, { store: storage({ [KEY]: paceOld }), online: false, protocol }).ctx.lookBoot.why, 'light-new');
  }
  // a network state that cannot be read is not offline; neither is `true` with no working network (that is the failed fetch's path)
  p = page(text, { nav: { get onLine() { throw new Error('unreadable'); } } });
  assert.deepEqual([p.bootFlow, p.ctx.lookBoot.why], ['stage', 'pass-new'], 'an unreadable navigator.onLine: the hall is asked for');
  for (const nav of [{}, { onLine: undefined }, { onLine: null }, { onLine: true }]) assert.equal(page(text, { nav }).bootFlow, 'stage');
  // every boot that never reaches Tournament is what it is online; a lite device keeps its own fact
  for (const o of [{ scripted: true }, { query: 'look=green' }, { query: 'look=sp' }, { query: 'look=tournament', scripted: true }, { query: 'look=arena' }, { query: 'look=arena', scripted: true }, { query: 'look=club' },
    { init: profile('green') }, { init: profile('club') }, { renderer: gpu(SOFT) }, { renderer: gpu(SOFT), init: profile('tournament') }]) {
    const a = storage(o.init ?? {}), b = storage(o.init ?? {});
    const off = page(text, { ...o, store: a, online: false }), on = page(text, { ...o, store: b });
    assert.deepEqual([{ ...off.ctx.lookBoot }, off.bootLook, off.bootClub, off.bootFlow, a.gets, a.sets], [{ ...on.ctx.lookBoot }, on.bootLook, on.bootClub, on.bootFlow, b.gets, b.sets], `offline, ?${o.query ?? ''} ${JSON.stringify(o.init ?? {})}: as online`);
    assert.notEqual(off.ctx.lookBoot.why, 'offline');
  }
  // THE LAUNCHER'S PIN is unmoved: an online pinned boot is the pinned old room as ever (the arm above); offline under the
  // pin the page is the old room all the same, by the offline row, and nothing is seeded (no read was announced)
  let store = storage(profile('tournament'));
  p = page(text, { store, seed });
  assert.deepEqual([p.bootClub, p.ctx.lookBoot.why, store.sets], [false, 'verdict-pin', [KEY]], 'online under the pin: pinned');
  store = storage(profile('tournament'));
  p = page(text, { store, seed, online: false });
  assert.deepEqual([p.bootClub, { ...p.ctx.lookBoot }, store.sets, p.announced.length], [false, out('stored:tournament', 'old', 'none', 'base', 'offline'), [], 0], 'offline under the pin: the old room, nothing seeded');
  p.nav.onLine = true;
  assert.deepEqual([p.ctx.lookNext(), JSON.parse(store.map.get(KEY)).why], ['old', 'pin'], '... and back online the reload question is pinned as ever');
  // THE PLAYER'S WAY OUT is unmoved: the offline boot left a wrong `old` verdict as it was; choosing Tournament anew still
  // clears it; a reload now would still show the old room (offline), and the next online boot measures again
  store = storage({ ...profile('tournament'), [KEY]: paceOld });
  p = page(text, { store, online: false });
  assert.equal(store.map.get(KEY), paceOld, 'the offline boot did not touch the record');
  assert.equal(p.ctx.lookAnew(), true, 'the way out clears a pace verdict offline as online');
  assert.deepEqual([JSON.parse(store.map.get(KEY)).verdict, JSON.parse(store.map.get(KEY)).why, p.ctx.lookNext()], [null, 'anew', 'old']);
  assert.deepEqual({ ...page(text, { store }).ctx.lookBoot }, out('stored:tournament', 'hall', 'stage', 'base', 'pass-anew'), 'the next boot, online: the hall, measured again');
  for (const why of ['pin', 'build']) {
    const raw = JSON.stringify({ ...OLD(WIRE_APP), why });
    store = storage({ [KEY]: raw }); p = page(text, { store, online: false });
    assert.deepEqual([p.ctx.lookAnew(), store.map.get(KEY)], [false, raw], `a ${why} verdict is not cleared offline either`);
  }
};
await ok('the offline row through main.js\'s own lines: no hand-over, no record read or announced, nothing stored; the reload question answers for the page as it is now; a shell\'s scheme keeps the hall; the launcher\'s pin and the player\'s way out are unmoved', () => offlineWiring(BLOCK));
await plant('the page\'s network state is not read (every page is online)', BLOCK, swap('return { online: navigator.onLine, scheme: location.protocol };', 'return { online: true, scheme: location.protocol };'), offlineWiring);
await plant('the page\'s scheme is not read (a shell that is offline keeps the old room)', BLOCK, swap('return { online: navigator.onLine, scheme: location.protocol };', "return { online: navigator.onLine, scheme: 'https:' };"), offlineWiring);
await plant('the reload question is answered with the network state of the boot', BLOCK, (t) => swap('net: lookNet, record', 'net: lookNetAtBoot, record')(swap('  const lookAsk = (stored)', '  const lookNetWas = lookNet(), lookNetAtBoot = () => lookNetWas;\n  const lookAsk = (stored)')(t)), offlineWiring);
await plant('an offline boot reads and announces the record (the pin is seeded, a read is added)', BLOCK, swap("if (lookOffline(net?.())) return out(asked, 'old', 'none', tier, 'offline'); // before the record: an offline boot reads, clears and stores nothing\n      const rec = lookRecord(record(), app, now);", "const early = record();\n      if (lookOffline(net?.())) return out(asked, 'old', 'none', tier, 'offline');\n      const rec = lookRecord(early, app, now);"), offlineWiring);
await plant('an offline page asks for the hall through the page\'s own lines (the row is gone)', BLOCK, swap("if (lookOffline(net?.())) return out(asked, 'old', 'none', tier, 'offline');", ''), offlineWiring);

// ---- 8a. the held launch leaves NO EXTRA HISTORY ENTRY: the launcher's step, run against a stand-in page ----
// The stand-in's history follows the two rules MEASURED on the loan host with this shell: a CDP navigation and
// location.assign APPEND an entry (history.length 1 -> 2), location.replace keeps the count. What no node arm can show is
// that Chrome under launchChrome itself ends at history.length 1: that is a Mac word's leg.
const HELD_GO = `      let commitTimer = null;
      const committed = new Promise((resolve) => {
        eventHandlers.push((method, params) => {
          if (method === 'Page.frameNavigated' && params?.frame && !params.frame.parentId && params.frame.url !== 'about:blank') resolve(params.frame);
        });
        commitTimer = setTimeout(() => resolve(null), 30000);
      });
      let frame = null;
      try {
        const sent = await send('Runtime.evaluate', { expression: 'location.replace(' + JSON.stringify(url) + ')', returnByValue: true });
        if (sent?.exceptionDetails) throw new Error('launchChrome: the first navigation to ' + url + ' could not start: ' + (sent.exceptionDetails.exception?.description ?? sent.exceptionDetails.text));
        frame = await committed;
      } finally {
        clearTimeout(commitTimer); // no timer of this step outlives it (a pending one would hold a finished suite's process open)
      }
      if (!frame || !String(frame.url).startsWith('http')) {
        throw new Error('launchChrome: the first navigation to ' + url + (frame ? ' failed (the page is ' + (frame.unreachableUrl ? 'an error page for ' + frame.unreachableUrl : frame.url) + ')' : ' did not commit within 30 s'));
      }
`;
{
  const AsyncFunction = (async () => {}).constructor;
  /** A shell started at the command line's about:blank (one entry), attached, Page events on. */
  const shell = ({ fail = false, stall = false, refuse = false, noise = false } = {}) => {
    const st = { entries: ['about:blank'], sent: [], timers: new Set(), handlers: [], waits: [] };
    const emit = (frame) => st.handlers.slice().forEach((h) => h('Page.frameNavigated', { frame }));
    const go = (to, how) => {
      if (how === 'replace') st.entries[st.entries.length - 1] = to; else st.entries.push(to);
      queueMicrotask(() => {
        if (noise) { emit({ id: 'C', parentId: 'F', url: 'http://127.0.0.1:8123/frame.html' }); emit({ id: 'F', url: 'about:blank' }); }
        if (!stall) emit(fail ? { id: 'F', url: 'chrome-error://chromewebdata/', unreachableUrl: to } : { id: 'F', url: to });
      });
    };
    st.send = async (method, params) => {
      st.sent.push(method);
      if (method === 'Page.navigate') { go(params.url, 'append'); return { frameId: 'F' }; }
      assert.equal(method, 'Runtime.evaluate', 'the step sends nothing but a navigation');
      if (refuse) return { exceptionDetails: { text: 'Uncaught', exception: { description: 'SecurityError: refused' } } };
      const m = /^location\.(replace|assign)\((".*")\)$/.exec(params.expression);
      assert.ok(m, `a page call the stand-in knows: ${params.expression}`);
      go(JSON.parse(m[2]), m[1] === 'replace' ? 'replace' : 'append');
      return { result: { type: 'undefined' } };
    };
    st.setTimeout = (fn, ms) => { const id = { fn, ms }; st.timers.add(id); st.waits.push(ms); return id; };
    st.clearTimeout = (id) => { st.timers.delete(id); };
    st.run = (text, url) => new AsyncFunction('send', 'eventHandlers', 'url', 'setTimeout', 'clearTimeout', text)(st.send, st.handlers, url, st.setTimeout, st.clearTimeout).then(() => null, (e) => e);
    return st;
  };
  const tick = () => new Promise((r) => setImmediate(r));
  const heldGo = async (text = HELD_GO) => {
    assert.ok(!text.includes('`') && !text.includes('${'), 'the step holds no template literal (this arm carries it inside one)');
    // (1) the launch URL, byte for byte, replaces the blank entry: ONE entry, as after a direct launch (whose page is [url])
    for (const url of ['http://127.0.0.1:8123/app.html?seed=1', 'http://127.0.0.1:8123/app.html', 'http://127.0.0.1:8123/app.html?u=a"b\\c#r=x\'y']) {
      const st = shell({ noise: true });
      const err = await st.run(text, url);
      assert.equal(err, null, `the held step ends well on a committed page (${err && err.message})`);
      assert.deepEqual(st.entries, [url], 'history after the held launch: the launch URL alone (history.length 1), no blank entry behind it');
      assert.deepEqual(st.sent, ['Runtime.evaluate'], 'one page call, no CDP navigation');
      assert.deepEqual([st.timers.size, st.waits], [0, [30000]], 'no timer of the step outlives it');
    }
    // (2) an error page fails the launch (the caller's catch kills the half-started shell)
    let st = shell({ fail: true }), err = await st.run(text, 'http://127.0.0.1:1/app.html');
    assert.match(String(err && err.message), /^launchChrome: the first navigation to http:\/\/127\.0\.0\.1:1\/app\.html failed \(the page is an error page for http:\/\/127\.0\.0\.1:1\/app\.html\)$/);
    assert.equal(st.timers.size, 0);
    // (3) no commit of the top frame: the step waits (a child frame's commit and a blank one do not end it), then fails
    st = shell({ stall: true, noise: true });
    const pending = st.run(text, 'http://127.0.0.1:8123/app.html'); let done = false; pending.then(() => { done = true; });
    await tick(); await tick();
    assert.equal(done, false, 'the step is still waiting: neither a child frame nor about:blank is the launch URL\'s commit');
    assert.equal(st.timers.size, 1); [...st.timers][0].fn();
    err = await pending;
    assert.match(String(err && err.message), /did not commit within 30 s$/);
    assert.equal(st.timers.size, 0);
    // (4) a page that refuses the call fails the launch at once, with the page's own words
    st = shell({ refuse: true }); err = await st.run(text, 'http://127.0.0.1:8123/app.html');
    assert.match(String(err && err.message), /could not start: SecurityError: refused$/);
    assert.deepEqual([st.entries, st.timers.size], [['about:blank'], 0]);
  };
  await ok('the held launch leaves no extra history entry: its step replaces the blank entry with the launch URL, waits for the top frame\'s commit, fails on an error page or no commit, leaves no timer', () => heldGo());
  await plant('the held launch navigates by CDP (history.length 2: the blank entry stays behind the app)', HELD_GO, swap("const sent = await send('Runtime.evaluate', { expression: 'location.replace(' + JSON.stringify(url) + ')', returnByValue: true });", "const sent = await send('Page.navigate', { url });"), heldGo);
  await plant('the held launch navigates by an appending page call', HELD_GO, swap("'location.replace('", "'location.assign('"), heldGo);
  await plant('the step does not wait for the commit', HELD_GO, swap('frame = await committed;', 'frame = { url };'), heldGo);
  await plant('an error page passes as the app', HELD_GO, swap("!String(frame.url).startsWith('http')", 'false'), heldGo);
  await plant('a child frame\'s commit ends the step', HELD_GO, swap('!params.frame.parentId && ', ''), heldGo);
  await plant('the step leaves its timer running', HELD_GO, swap('clearTimeout(commitTimer);', ''), heldGo);
}

await ok('the launcher\'s file, where this host has it: it carries the seed text, registers it for every new document, holds the first real-user document back, names the opt-out and says the pin\'s state', () => {
  const cdpUrl = new URL('../cdp.mjs', import.meta.url);
  if (!fs.existsSync(cdpUrl)) { console.log('   SKIP the launcher\'s own text: web/tools/cdp.mjs is not on this host (the loan host has web/tools/club only); the seed above ran from this arm\'s copy'); return; }
  const cdp = fs.readFileSync(cdpUrl, 'utf8');
  const a = cdp.indexOf('// >>> LOOK-PIN-SEED'), b = cdp.indexOf('// <<< LOOK-PIN-SEED');
  assert.ok(a > 0 && b > a, 'the seed sits between its two marks in cdp.mjs');
  assert.equal(/const LOOK_PIN_SEED = `([\s\S]*?)`;/.exec(cdp.slice(a, b))?.[1], PIN_SEED, 'the launcher\'s seed is not the text this arm ran: change both or neither');
  const fn = cdp.slice(cdp.indexOf('export async function launchChrome(url, {'), cdp.indexOf('/** ---- GH-725 review r9 P2-1: a DERIVED endpoint'));
  assert.match(fn, /^export async function launchChrome\(url, \{[^}]*\blookPin = true \} = \{\}\) \{/, 'the ONE opt-out is the launch option lookPin, on by default');
  assert.match(fn, /if \(lookPin\) await send\('Page\.addScriptToEvaluateOnNewDocument', \{ source: LOOK_PIN_SEED \}\);/, 'registered for every new document of the page, on every launch');
  assert.match(fn, /lookSeedFirst \? 'about:blank' : url,/); assert.match(fn, /\(lookSeedFirst \? t\.url === 'about:blank' : t\.url\.startsWith\('http'\)\)/);
  // the held first document REPLACES the blank entry (no extra history entry): the step's text is the text
  // this arm ran above against a stand-in page (HELD_GO); that history.length is 1 after a launch through this very function
  // in this very shell is a browser fact, a Mac word's (the report names the leg)
  const g0 = fn.indexOf('// >>> LOOK-HELD-GO'), g1 = fn.indexOf('      // <<< LOOK-HELD-GO');
  assert.ok(g0 > 0 && g1 > g0, 'the held launch\'s step sits between its two marks in launchChrome');
  assert.equal(fn.slice(fn.indexOf('      let commitTimer = null;', g0), g1), HELD_GO, 'the launcher\'s held step is not the text this arm ran: change both or neither');
  assert.match(fn, /if \(lookSeedFirst\) \{\n(?:\s+\/\/[^\n]*\n)+\s+let commitTimer = null;/, 'the step runs on a held launch only (a direct launch is the launch it was)');
  assert.ok(!/send\(\s*'Page\.navigate'/.test(fn), 'launchChrome never navigates by Page.navigate: from about:blank that APPENDS a history entry (history.length 2, measured on the loan host with this shell)');
  assert.ok(!/location\.(?:assign\(|href\s*=)/.test(fn), '... nor by an appending page call');
  assert.ok(fn.indexOf("await send('Page.addScriptToEvaluateOnNewDocument'") < g0, 'the seed is registered before the navigation');
  assert.ok(fn.indexOf("await send('Page.enable')") < g0, 'Page events are on before the step');
  assert.match(fn, /console\.error\(lookPin\n\s+\? '\[launch\] look pin ON: /); assert.match(fn, /: '\[launch\] look pin OFF \(lookPin: false\): /);
  assert.equal(fn.split('lookPin').length - 1 >= 6, true);
  // which launches hold their first document back: a real-user boot of the app page, under the pin (the rule's own lines, as text)
  const r0 = fn.indexOf('  const lookScripted = (() => {'), r1 = fn.indexOf('\n', fn.indexOf('  const lookSeedFirst = '));
  const first = (url, lookPin = true) => new Function('url', 'lookPin', `${fn.slice(r0, r1)}\n; return lookSeedFirst;`)(url, lookPin);
  const U = 'http://127.0.0.1:8123/';
  for (const [url, want] of [[`${U}app.html?seed=1`, true], [`${U}app.html`, true], [`${U}app.html#r=abc`, true], [`${U}app.html?seed=1&obtool=0`, true], [`${U}app.html?cinema=0`, true],
    [`${U}app.html?seed=1&obtool=1`, false], [`${U}app.html?obtool&seed=1`, false], [`${U}app.html?cinema=1`, false], [`${U}index.html`, false], [`${U}tools/club/dev-room.html?view=wide`, false], ['not a url', false]]) {
    assert.equal(first(url), want, `first document held back for ${url}`);
    assert.equal(first(url, false), false, 'never with the pin off: the launch is the launch it was');
  }
});

// ---- 8b. a player's way out, through the page's own lines: main.js's boot block, its settings hook, settings.js's offer ----
{
  const AsyncFunction = (async () => {}).constructor;
  const HOOK = braced(main, main.indexOf('settingsCtx.applyLook = async (name) => {'));
  const OFFER = braced(settings, settings.indexOf('async function clubLookReload(value) {'));
  const PAGE_APP = '0.1.0+b4cd722c|10b624f671e3|1';
  /** The player picks `value` in the look picker of page `p` (whose applied grade is `applied`): settings.js's handler line, in its order. */
  const choose = async (p, applied, value, { hook = HOOK, accept = false } = {}) => {
    const calls = { regrade: 0, confirms: [], reloads: 0 };
    const win = { __test: { setLook: () => { calls.regrade += 1; } }, confirm: (body) => { calls.confirms.push(body); return accept; } };
    const loc = { search: '', reload: () => { calls.reloads += 1; } }, t = (k) => k;
    // `ctx.applyLook?.(value); ctx.clubLookReload?.(value);`: both start synchronously, in this order, neither is awaited
    const applyP = new AsyncFunction('settingsCtx', 'window', 't', 'location', 'init', 'name', `let appliedLook = init; ${hook}; const done = settingsCtx.applyLook(name); return done.then(() => appliedLook);`)(p.ctx, win, t, loc, applied, value);
    const offerP = new AsyncFunction('clubStoredAtBoot', 'ctx', 'location', 'window', 't', `${OFFER}; await clubLookReload(${JSON.stringify(value)});`)(false, p.ctx, loc, win, t);
    const after = await applyP; await offerP;
    return { ...calls, applied: after };
  };
  const stored = (store) => (store.map.has(KEY) ? JSON.parse(store.map.get(KEY)) : null);
  const wayOut = async (text = BLOCK, hook = HOOK) => {
    // (1) a device condemned by one slow boot: the picker shows Tournament, the page shows the LIGHT hall (step 2)
    let store = storage({ ...profile('tournament'), [KEY]: JSON.stringify(OLD(PAGE_APP)) }), p = page(text, { store });
    assert.deepEqual([p.ctx.lookBoot.shown, p.ctx.lookBoot.why], ['hall', 'light-new']);
    // the player picks Green (a select fires no change for the option it shows): main's own offer; declined, the page stays the old room
    let r = await choose(p, 'tournament', 'green', { hook });
    assert.deepEqual([r.regrade, r.confirms, r.reloads, stored(store).verdict], [0, ['settings.lookReloadConfirm'], 0, 'old'], 'Green on the light hall: the existing offer, the record untouched');
    // ... and Tournament again: the record is cleared BEFORE the reload question, the existing reload confirm is offered, nothing swaps live
    r = await choose(p, 'tournament', 'tournament', { hook });
    assert.deepEqual([r.regrade, r.confirms, r.reloads, r.applied], [0, ['settings.lookChangeReloadConfirm'], 0, 'tournament'], 'Tournament anew: the reload is offered (no new string)');
    assert.deepEqual([stored(store).verdict, stored(store).why, stored(store).slow, stored(store).fails, stored(store).app], [null, 'anew', 0, { fetch: 0, build: 0, timeout: 0 }, PAGE_APP]);
    assert.deepEqual({ ...p.ctx.lookBoot }.shown, 'hall', 'the running page\'s fact stays: nothing swaps under it');
    // declined: the next boot handles the state by itself (the hall, measured again); accepted: the same boot, now
    let q = page(text, { store });
    assert.deepEqual([q.bootClub, q.bootFlow, { ...q.ctx.lookBoot }], [true, 'stage', out('stored:tournament', 'hall', 'stage', 'base', 'pass-anew')], 'the next boot after the way out');
    q.club.onPace(pace(FAST));
    assert.deepEqual([stored(store).verdict, stored(store).why], ['hall', 'pace-ok']);
    // an accepted offer reloads
    store = storage({ ...profile('tournament'), [KEY]: JSON.stringify(OLD(PAGE_APP)) }); p = page(text, { store });
    r = await choose(p, 'tournament', 'tournament', { hook, accept: true });
    assert.deepEqual([r.confirms.length, r.reloads], [1, 1]);
    // (1b) a device condemned on BOTH rungs (the page shows the old room, as a step-1 device's did): the same way out
    // and the same offer; the light hall's record goes with the verdict
    store = storage({ ...profile('tournament'), [KEY]: JSON.stringify(OLD2(PAGE_APP)) }); p = page(text, { store });
    assert.deepEqual([p.ctx.lookBoot.shown, p.ctx.lookBoot.why], ['old', 'verdict-old']);
    r = await choose(p, 'tournament', 'tournament', { hook });
    assert.deepEqual([r.regrade, r.confirms, stored(store).verdict, stored(store).why, 'lite' in stored(store)], [0, ['settings.lookChangeReloadConfirm'], null, 'anew', false], 'Tournament anew on the old room: both rungs cleared, the reload offered');
    assert.equal(page(text, { store }).ctx.lookBoot.why, 'pass-anew', 'the next boot: the standard hall, measured again');
    // (2) the player took the Green reload first: a green page; Tournament clears, offers, and shows no old room in between
    store = storage({ ...profile('green'), [KEY]: JSON.stringify({ ...OLD(PAGE_APP), why: 'timeout', fails: { fetch: 0, build: 0, timeout: 2 } }) }); p = page(text, { store });
    assert.equal(p.ctx.lookBoot.shown, 'green');
    r = await choose(p, 'default', 'tournament', { hook });
    assert.deepEqual([r.regrade, r.confirms, r.applied, stored(store).why, stored(store).fails.timeout], [0, ['settings.lookChangeReloadConfirm'], 'default', 'anew', 0], 'from a green page: a timeout verdict cleared, the reload offered, no live regrade to the old room');
    // (3) a build verdict stays: Tournament is the old room, as it was (the live regrade on a green page, no offer)
    for (const [look, applied, regrade] of [['tournament', 'tournament', 0], ['green', 'default', 1]]) {
      store = storage({ ...profile(look), [KEY]: JSON.stringify({ ...OLD(PAGE_APP), why: 'build' }) }); p = page(text, { store });
      const sets = store.sets.length;
      r = await choose(p, applied, 'tournament', { hook });
      assert.deepEqual([r.regrade, r.confirms, stored(store).verdict, stored(store).why, store.sets.length - sets], [regrade, [], 'old', 'build', 0], `a build verdict is not the player's to clear (stored ${look})`);
    }
    // (4) UNDER THE TEST LAUNCHER'S PIN a suite cannot unpin itself through the settings API: the pin's record is untouched
    for (const [look, applied, regrade] of [['tournament', 'tournament', 0], ['green', 'default', 1]]) {
      store = storage(profile(look)); p = page(text, { store, seed: PIN_SEED });
      for (let i = 0; i < 2; i++) {
        r = await choose(p, i === 0 ? applied : 'tournament', 'tournament', { hook });
        assert.deepEqual([r.regrade, r.confirms], [i === 0 ? regrade : 0, []], `pinned, stored ${look}, choice ${i + 1}: no offer, the suites' live regrade as before`);
        assert.deepEqual([stored(store).verdict, stored(store).why], ['old', 'pin'], 'the pin\'s record stands');
      }
      assert.equal(p.ctx.lookAnew(), false, 'asked directly: nothing cleared');
      assert.deepEqual([stored(store).why, p.ctx.lookNext()], ['pin', 'old']);
      q = page(text, { store, seed: PIN_SEED });
      assert.equal(q.bootClub, false, 'and the next pinned boot is the old room');
    }
    // (5) nothing to clear, nothing written: the hall's own page, a device with no record, a lite device
    for (const o of [{ init: { ...profile('tournament'), [KEY]: JSON.stringify({ ...OLD(PAGE_APP), verdict: 'hall', why: 'pace-ok', passed: true }) }, applied: 'tournament' }, { init: profile('tournament'), applied: 'tournament' }, { init: profile('green'), applied: 'default', renderer: gpu(SOFT) }]) {
      store = storage(o.init); p = page(text, { store, renderer: o.renderer ?? gpu(HARD) });
      r = await choose(p, o.applied, 'tournament', { hook });
      assert.deepEqual(store.sets, [], 'no record is written where there is nothing to clear');
    }
    // (6) Green never clears; a main.js without the way out (a stale one) changes nothing and does not throw
    store = storage({ ...profile('tournament'), [KEY]: JSON.stringify(OLD(PAGE_APP)) }); p = page(text, { store });
    delete p.ctx.lookAnew;
    r = await choose(p, 'tournament', 'tournament', { hook });
    assert.deepEqual([r.confirms, stored(store).verdict], [[], 'old']);
    // (7) OFFLINE (the offline row): a reload now would show the old room, so Green to Tournament is the live regrade to
    // the old room with no reload question, as on a device that keeps the old room; the choice is stored by settings.js
    // as ever, the way out still clears a wrong verdict, and the next ONLINE boot is the hall
    store = storage(profile('green')); p = page(text, { store, online: false });
    assert.deepEqual([p.ctx.lookBoot.shown, p.ctx.lookNext()], ['green', 'old']);
    r = await choose(p, 'default', 'tournament', { hook });
    assert.deepEqual([r.regrade, r.confirms, r.reloads, r.applied, store.sets], [1, [], 0, 'tournament', []], 'offline, Green to Tournament: the live regrade, no offer, nothing stored by main');
    store = storage({ ...profile('green'), [KEY]: JSON.stringify(OLD(PAGE_APP)) }); p = page(text, { store, online: false });
    r = await choose(p, 'default', 'tournament', { hook });
    assert.deepEqual([r.regrade, r.confirms, r.applied, stored(store).verdict, stored(store).why], [1, [], 'tournament', null, 'anew'], 'offline with a wrong verdict on record: cleared all the same, the old room live, no offer');
    q = page(text, { store: storage({ ...profile('tournament'), [KEY]: store.map.get(KEY) }) });
    assert.deepEqual([q.bootFlow, q.ctx.lookBoot.why], ['stage', 'pass-anew'], 'the next online boot: the hall, measured again');
    // ... and the same green page back online: the reload is offered, as before
    store = storage(profile('green')); p = page(text, { store, online: false }); p.nav.onLine = true;
    r = await choose(p, 'default', 'tournament', { hook });
    assert.deepEqual([r.regrade, r.confirms], [0, ['settings.lookChangeReloadConfirm']]);
  };
  await ok('a player\'s way out, through the page\'s own lines: Green and Tournament again clears a pace or timeout verdict and offers the existing reload; a build verdict stays; under the launcher\'s pin nothing can be cleared', () => wayOut());
  await plant('choosing Tournament does not clear the record', HOOK, swap("if (name === 'tournament') settingsCtx.lookAnew?.();", ''), (hook) => wayOut(BLOCK, hook));
  await plant('choosing Green clears the record', HOOK, swap("if (name === 'tournament') settingsCtx.lookAnew?.();", 'settingsCtx.lookAnew?.();'), (hook) => wayOut(BLOCK, hook));
  await plant('the record is cleared after the reload question was asked', HOOK, swap("if (name === 'tournament') settingsCtx.lookAnew?.();", "if (name === 'tournament') Promise.resolve().then(() => settingsCtx.lookAnew?.());"), (hook) => wayOut(BLOCK, hook));
  await plant('the way out erases whatever is stored (a suite unpins itself)', BLOCK, swap('settingsCtx.lookAnew = () => lookStore(() => lookAnew(lookRecord(lookRaw(), lookApp, Date.now()), Date.now()));', "settingsCtx.lookAnew = () => lookStore(() => ({ ...lookFresh(lookApp), why: 'anew' }));"), (text) => wayOut(text));
  await plant('the way out is not on ctx', BLOCK, swap('settingsCtx.lookAnew = () =>', 'const lookAnewUnused = () =>'), (text) => wayOut(text));
  await plant('a page on the light hall is not offered the reload after the way out (the reload\'s rung is not on ctx)', BLOCK, swap("  settingsCtx.lookNextRung = () => {\n    const d = lookAsk(() => 'tournament');\n    return d.shown === 'hall' ? (d.rung ?? 'base') : null;\n  };\n", ''), (text) => wayOut(text));
  await plant('the reload\'s rung is answered with the rung of this boot', BLOCK, swap("return d.shown === 'hall' ? (d.rung ?? 'base') : null;", 'return bootRung;'), (text) => wayOut(text));
}

// ---- 9. the identity arm's text rules over the seam files as they stand (its judges are pure; nothing here reads git) ----
await ok('the identity arm\'s rules over the seams as they stand: SEAM, GUARD, OPTION, IMPORT and QUERY hold (the tier switch once inside the boot rules, the budget once inside the guarded block, no other parameter of the look); its locale rule holds for the lane\'s keys', async () => {
  const id = await import('./test-club-identity.mjs');
  assert.deepEqual(id.judgeGuard(main), [], 'GUARD');
  const tips = LOCALES.map((locale) => { const tip = JSON.parse(read(`locales/${locale}.json`)); return { locale, tip, base: Object.fromEntries(Object.entries(tip).filter(([k]) => !id.LANE_LOCALE_KEYS.includes(k))) }; });
  assert.deepEqual(id.judgeSeams({ mainJs: main, settingsJs: settings }, tips), [], 'SEAM, OPTION and LOCALE (the tree form: each locale carries the lane\'s keys as filled strings)');
  for (const { locale, tip } of tips) for (const k of id.LANE_LOCALE_KEYS) assert.ok(k in tip, `${locale}: ${k}`);
  assert.deepEqual(id.LANE_LOCALE_KEYS, ['settings.lookClub', 'settings.lookChangeReloadConfirm'], 'the lane\'s keys: the arena label is gone');
  const files = [{ path: 'web/app/main.js', text: main }, { path: 'web/app/settings.js', text: settings }, { path: 'web/app/bugreport.js', text: bug },
    ...LOCALES.map((l) => ({ path: `web/app/locales/${l}.json`, text: read(`locales/${l}.json`) }))];
  const imp = id.judgeImports(files);
  assert.deepEqual(imp.failures, [], 'IMPORT'); assert.equal(imp.allowed, 1, 'the one dynamic import of the leaf');
  const qry = id.judgeQuery(files);
  assert.deepEqual(qry.failures, [], 'QUERY');
  assert.deepEqual([qry.allowed, qry.tierReads], [1, 1], 'one guarded `clubtimeout`, one `clubtier` inside the boot rules');
  assert.equal(main.split("'clubtier'").length, 2, 'main.js names the tier switch once');
  assert.ok(main.indexOf("'clubtier'") > rFrom && main.indexOf("'clubtier'") < rTo, 'and it does so inside the boot rules');
  // the same judge over a main.js that reads the tier switch a second time, or outside the rules: red
  assert.ok(id.judgeQuery([{ path: 'web/app/main.js', text: main.replace("const forced = bootQ.get('clubtier');", "const forced = bootQ.get('clubtier'), again = bootQ.get('clubtier');") }]).failures.some((f) => f.code === 'QUERY'), 'a second read inside the rules is red');
  assert.ok(id.judgeQuery([{ path: 'web/app/main.js', text: main.replace('  // <<< LOOK-BOOT-RULES', "  // <<< LOOK-BOOT-RULES\n  const late = bootQ.get('clubtier');") }]).failures.some((f) => f.code === 'QUERY'), 'a read outside the rules is red');
  assert.ok(id.judgeQuery([{ path: 'web/app/main.js', text: main.replace("if (club.flow === 'stage') {", "if (club.flow === 'stage' || club.query.get('clubdark') === '1') {") }]).failures.some((f) => f.code === 'QUERY' && /clubdark/.test(f.msg)), 'a tool switch of the look in the stage block is red');
});

console.log(`test-club-boot: ${n} arms OK, ${plants} plants caught`);
