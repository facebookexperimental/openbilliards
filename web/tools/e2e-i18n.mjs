// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-i18n.mjs — i18n gate for the app UI:
//   lint    no orphan UI literals: the swept modules must not carry the
//           inventory's user-facing English/Chinese strings outside
//           web/app/locales/ (string-token scan, comments stripped;
//           technical strings — css, mime types, ids — are untouched);
//   frpunct (GH-668 B-SH10) no fr value carries an ASCII space before
//           ? : ; ! outside the shrink-only FR_PUNCT_OK legacy ledger;
//   audit   every locale dictionary carries EXACTLY the en key set
//           (missing = [], extra = []) via __i18n.audit();
//   default fresh profile resolves to en (headless Chrome is en-US);
//   switch  each locale live-switches (no reload): AIM HUD state line,
//           Shoot button, settings panel, export dialog heading assert the
//           expected translated strings; screenshot per locale;
//   help    (024) the generic audit covers the 89 help.* keys + the
//           hud.help rewrite automatically; one added scenario live-switches
//           every locale with the overlay OPEN (applyDom in-place re-render,
//           zero raw-key leaks); help.js joins the orphan-literal sweep;
//   foul    scripted wrong-first-ball foul under zh-CN shows a 犯规 banner;
//   persist language choice survives a reload;
//   gates   __i18n.missing() stays empty, zero console errors; a live fresh ->
//           stale dictionary switch logs zero missing-key warnings (GH-718 r5).
//
//   node web/tools/e2e-i18n.mjs      (needs Chrome + node ≥22)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 20420);
// CDP port env override (e2e-ui.mjs convention): parallel suites/worktrees
// on one host must not share cdp.mjs's default 9223 — a squatting Chrome
// silently cross-wires page targets between runs.
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 22320);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const fail = (msg) => { console.error('E2E-I18N FAIL:', msg); process.exitCode = 1; };

// ---- static lint: no orphan UI literals in the swept modules ---------------
// Former user-facing literals (the i18n sweep's inventory) that must now live
// ONLY in web/app/locales/*.json. Distinctive multi-word phrases, matched
// against string tokens with comments stripped — everything not listed
// (units, mime types, css, selectors, hook names) is implicitly allowlisted.
const SWEPT = ['app/hud.js', 'app/flow.js', 'app/settings.js', 'app/share.js',
  'app/record.js', 'app/export.js', 'app/aimwidgets.js', 'app/aim.js',
  'app/main.js', 'app.html',
  'app/ui/motion.js', 'app/ui/select.js', 'app/ui/controls.js',
  'app/ui/dialog.js',
  'app/help.js', // 024: every overlay string rides data-i18n/t() keys
  'app/drills.js', // #66: every drill string rides data-i18n/t() keys
  'app/play.js', // 034: the play card relocates settings.js's swept game/variant text — rides t() keys
  'app/practice.js', // 036
  'app/replays.js', // 035
  'app/ui/switchprogress.js']; // build 20: the switch overlay — callers pass t() strings
// ('app/record-quality.js' left this list with the file — GH-251 deleted
//  the record-save quality sheet along with its record.quality.* keys)
const BANNED = [
  'WINS — 9-BALL', 'FOUL —', 'drag the cue ball anywhere', '— drag to aim',
  're-racking…', 'replay finished', 'BALL IN HAND',
  'Changing equipment re-racks', 'Aim assist', 'Default camera',
  '台子 (table)', '标定', 'ghost ball', 'all ball paths',
  'Share replay', 'Replay link copied', 'address bar', 'Bad replay link',
  'View anyway', 'Continue from here', 'Exit replay', 'keep playing from',
  'previous shot', 'next shot', 'REPLAY finished', 'REPLAY shot',
  'no shots to share', 'Kernel mismatch',
  'Export video', 'Re-render the last shot', 'Play a shot first',
  'recording live replay', 'no file written', 'download started',
  'export failed', 'sound unavailable', 'exporting webm',
  // ('Record the canvas' left this list with record.title — GH-225 Phase D
  //  deleted the key and the pill it labelled)
  'cue tip offset', 'left-drag: aim',
  'tip offset — drag', 'expect a curving', 'cue elevation', 'aim view',
  // 024 help overlay masters (data-model §4) — distinctive multi-word
  // fragments that must live ONLY in locales/, never inline in help.js
  'How to play', 'the cue swings to your pointer', 'Fine aim at 0.1',
  'ghost ring floats above', 'the shot only ever fires',
  // issue #68 mode/playground prose — locales-only, never inline in
  // settings.js/flow.js (both swept)
  'drag any ball', 'Undo placement', 'Free sandbox',
  'the spot is occupied',
  // issue #140 snap-to-grid chip label — locales-only, never inline in
  // flow.js (swept)
  'Snap to grid',
  'Games at a glance', 'trackpad share the same controls',
  'power when aiming',
  // #66 practice drills — distinctive multi-word fragments that must live
  // ONLY in locales/, never inline in drills.js
  'may never leave the circle', 'Ladder scoring over 10 shots',
  'you beat the ghost', 'New personal best', 'Practice drills',
  'cue ball touched a cushion',
  // #80 snooker colour-clearance drills (renamed off 'snake' in #119) —
  // same law
  'from their spots in order', 'lined across the table',
  'Drill unavailable right now',
  // #119 challenge tier — distinctive fragments of the new drill
  // descriptions; all live ONLY in locales/, never inline in drills.js
  'calling every pocket', 'the lower your total',
  'must replace the object ball', 'keep the run alive',
  // #120 drill dock + confirm modals — the STOP/Reset confirm copy and the
  // Reset tooltip live ONLY in locales/, never inline in drills.js
  'Stop this drill', 'Restart this drill', 'Restart drill',
  'best score is kept',
  // GH-131 lineup (蛇彩) family — distinctive fragments of the new drill
  // descriptions; locales-only, never inline in drills.js
  'in order from the foot end', 'converging on the middle ball',
  'wherever each ball landed', 'row across the table below the side pockets',
  'hugging one corner pocket', 'the one designated pocket',
  // GH-131 review finding 1 — the lateral order variants' prose; same law
  'cleared from both ends alternately', 'middle ball of the lateral row',
  // GH-177 L ends-to-middle — the new variant's prose; same law
  'converging on the corner ball',
  // GH-134 clean-contact law — the new 'crash' reason + the lineup-called
  // desc clause; locales-only, never inline in drills.js
  'cue ball hit another ball', 'crashing into another ball',
  // #135 settings practice pane (recent-drill cards + browse button; the
  // GH-182 heading swap retired 'Last practiced' for 'Recent drills') —
  // locales-only, never inline in settings.js (swept)
  'Browse all drills', 'Recent drills', 'Continue practicing',
  // GH-139 save-to-Photos — the surviving toasts live ONLY in locales/,
  // never inline in record.js (already swept). The dock's pause/resume/
  // elapsed tooltips ('Pause recording', 'Resume recording', 'Recording
  // time') left this list with the dock in GH-225 Phase D, and 'Saved to
  // Photos' + 'prepare the video for Photos' left with the obPhotos leg +
  // record.js transcode trio in GH-251 (keys record.savedPhotos /
  // record.prepareFailed deleted from all 7 locales — nothing left to
  // protect). 'Preparing video' STAYS: record.preparing regained a
  // producer (the DVR card's transcode progress, GH-252).
  'check your downloads', 'allow Photos access',
  'Preparing video',
  // GH-200 assist-keyed bests — the assist tag on best lines + the
  // completion banner; locales-only, never inline in drills.js/settings.js
  'No assist', 'Standard assist', 'Practice assist',
  // (#197 record-save quality sheet fragments — 're-renders only the last
  //  shot', 'saved as recorded instead', 'ready right away', 're-rendered
  //  offline' — left this list with record-quality.js + the record.quality.*
  //  and record.hdFailed keys in GH-251: nothing left to protect)
  // issue #209 run-ended banner — the failed-run-end label (distinct from
  // the full-clear completion banner); locales-only, never inline in drills.js
  'RUN ENDED',
  'Place balls anywhere, no judgement', 'Loading practice tools', 'This game cannot be resumed', // 036
];
function stringTokens(src) {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  return [...noComments.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/gs)]
    .map((m) => m[1] ?? m[2] ?? m[3]);
}
for (const rel of SWEPT) {
  const p = path.join(webDir, rel);
  if (!fs.existsSync(p)) { // 024: help.js lands with lane A — red, not a crash
    fail(`swept module missing: ${rel} (024 lane A not merged yet?)`);
    continue;
  }
  const src = fs.readFileSync(p, 'utf8');
  // app.html: scan the whole markup minus HTML comments (labels/buttons/help
  // text live as element text, not string tokens)
  const haystacks = rel.endsWith('.html')
    ? [src.replace(/<!--[\s\S]*?-->/g, '')] : stringTokens(src);
  for (const phrase of BANNED) {
    if (haystacks.some((h) => h.includes(phrase))) {
      fail(`orphan UI literal in ${rel}: "${phrase}" (move it to locales/)`);
    }
  }
}
// ---- static lint: fr typographic spacing (GH-668 B-SH10, S5 slice-2 vfix) --
// French sets a NON-BREAKING space (U+00A0, or the narrow U+202F) before
// ? : ; ! — an ASCII space lets the glyph wrap onto a line of its own (the
// 667 × 375 fr confirm orphan in the S5 critique). SHRINK-ONLY ledger:
// FR_PUNCT_OK names the LEGACY fr keys that still carried the ASCII space on
// 2026-09-08 (109 rows — the 111 the scan found minus the two cured that
// day, settings.rerackConfirm + settings.gameRerackConfirm). A row is deleted
// in the commit that cures its key and never added to: a new or cured key
// carrying an ASCII space before ? : ; ! is red, and a ledgered row that no
// longer matches (its key cured or gone) is red too (liveness — a row that
// matches nothing hides the next regression).
const FR_PUNCT_RE = / [?:;!]/;
const FR_PUNCT_OK = new Set([
  'hud.help', 'flow.ballInHandHint', 'flow.shotRejected', 'flow.ballInHandKitchen',
  'flow.decision.dry_break', 'flow.decision.eight_legal_break',
  'flow.decision.eight_foul_break', 'flow.decision.break_foul', 'aim.masseHint',
  'aim.keysHelp', 'settings.lightingLuxNote', 'settings.lookReloadConfirm', 'share.failed',
  'share.v2AdapterStale', 'share.heyballAdapterStale', 'share.seatAdapterStale',
  'share.decisionApplied', 'share.kernelMismatch', 'share.badLink', 'share.shotRejected',
  'export.resume.notice', 'export.resume.failed', 'export.resume.truncated', 'export.failed',
  'call.required.mouse', 'call.required.touch', 'decision.opt.heyball_stalemate.1',
  'flow.decision.break_pocket', 'flow.decision.stalemate_lag', 'snooker.nominateHint',
  'snooker.nominateHint.mouse', 'snooker.nominateHint.touch', 'snooker.nominated',
  'snooker.ballInHandD', 'snooker.ballOn', 'snooker.respot', 'flow.decision.play_again',
  'flow.decision.respotted_black_toss', 'flow.decision.foul_and_a_miss', 'snooker.touching',
  'snooker.missWarning', 'snooker.touchingShort', 'carom.breakPlace', 'carom.point',
  'flow.decision.break_spot', 'decision.title.break_spot', 'touch.fire',
  'help.controls.mouse.aimView.v', 'help.controls.trackpad.aimView.v',
  'help.controls.touch.call.v', 'help.controls.touch.fire.k', 'help.flow.spin.d',
  'help.flow.shoot.d', 'help.flow.share.d', 'help.games.nine_ball', 'help.games.eight_ball',
  'help.games.snooker', 'help.games.carom_3cushion', 'help.games.one_pocket',
  'drills.confirmStop.title', 'drills.confirmReset.title', 'drills.newBest',
  'drills.chip.target', // (GH-668 S5 slice 4 G5: drills.completeBanner / drills.runEndedBanner rows cured — the values are sentence verdicts without the ' : ' score clause)
  'drills.name.lineup-e2m', 'drills.name.lineup-m2e', 'drills.name.lineup-random',
  'drills.name.lineup-lat-e2m', 'drills.name.lineup-lat-m2e', 'drills.name.lineup-l-e2m',
  'drills.desc.ghost9', 'drills.desc.progressive-lineup', 'drills.desc.ghost10',
  'drills.desc.century', 'help.games.straight_pool', 'flow.decision.break_violation',
  'settings.variant.wpbsa-snooker-full', 'help.games.ten_ball',
  'flow.decision.pushout_response', 'flow.decision.wrongful_pot', 'tenball.target',
  'playback.mark.pot', 'playback.mark.gone', 'playback.confirmClear.title',
  'playback.confirmDelete.title', 'playback.stageFailed', 'playback.realtimeFades',
  'carom.breakPlace2', 'carom.levelingHint', 'help.games.heyball',
  'flow.decision.illegal_break', 'flow.decision.heyball_break_foul',
  'flow.decision.eight_break_pot', 'flow.decision.eight_break_foul',
  'flow.decision.break_miscue', 'heyball.kitchenBihShort', 'heyball.frozen',
  'heyball.frozenShort', 'heyball.aimHintOpen', 'heyball.aimHint', 'heyball.aimHintEight',
  'shell.remember', 'shell.place.practice.confirmTitle', 'atelier.tryIt.confirmTitle',
  'atelier.tryIt.confirmBody', 'equipment.desc.standard', 'equipment.desc.snooker_ash',
  'equipment.desc.carom_conical',
]);
{
  const frDict = JSON.parse(fs.readFileSync(path.join(webDir, 'app/locales/fr.json'), 'utf8'));
  let live = 0;
  for (const [k, v] of Object.entries(frDict)) {
    if (typeof v !== 'string' || !FR_PUNCT_RE.test(v)) continue;
    if (FR_PUNCT_OK.has(k)) { live += 1; continue; }
    fail(`fr ${k}: ASCII space before ? : ; ! — use U+00A0 (or U+202F): ${JSON.stringify(v)}`);
  }
  for (const k of FR_PUNCT_OK) {
    if (typeof frDict[k] === 'string' && FR_PUNCT_RE.test(frDict[k])) continue;
    fail(`FR_PUNCT_OK row '${k}' matches nothing (cured or gone) — delete the row (shrink-only ledger)`);
  }
  if (!process.exitCode) console.log(`[e2e-i18n] fr punctuation lint clean: ${live} ledgered legacy keys live, 0 new`);
}

// ---- GH-721: ONE seat abbreviation per locale ------------------------------
// Every seat placeholder glued to a Latin letter ("P{player}", "J{player}",
// "S{player}") must use the SAME letter inside a locale — de mixed P{player}
// (24 pool strings) with S{player} (21 snooker/carom/14.1/one-pocket/10-ball
// strings), so one session read "BALL IN HAND — P2" then "BALL IN HAND — S1".
// Locales localise the letter: en/ja/ko/zh-CN P (Player), fr/es J (Joueur /
// Jugador), de S (Spieler). Non-Latin prefixes (ja プレイヤー{player}) and the
// spelled-out banners ("PLAYER {player} WINS") are outside the rule.
const SEAT_LETTER = { en: 'P', ja: 'P', ko: 'P', 'zh-CN': 'P', fr: 'J', es: 'J', de: 'S' };
const localesDir = path.join(webDir, 'app/locales');
let seatLocales = 0, seatMixed = 0;
for (const file of fs.readdirSync(localesDir).filter((f) => f.endsWith('.json')).sort()) {
  const loc = file.replace(/\.json$/, '');
  const dict = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf8'));
  const letters = new Map(); // letter → keys using it
  for (const [k, v] of Object.entries(dict)) {
    if (typeof v !== 'string') continue;
    for (const m of v.matchAll(/([A-Za-z])\{player\}/g)) {
      if (!letters.has(m[1])) letters.set(m[1], []);
      letters.get(m[1]).push(k);
    }
  }
  const used = [...letters.keys()].sort();
  if (used.length !== 1) {
    seatMixed++;
    fail(`GH-721 ${loc}: seat abbreviation must be ONE letter, got {${used.join(', ')}} — `
      + used.map((l) => `${l} ×${letters.get(l).length} (${letters.get(l).slice(0, 3).join(', ')}, …)`).join('; '));
  } else if (SEAT_LETTER[loc] && used[0] !== SEAT_LETTER[loc]) {
    seatMixed++;
    fail(`GH-721 ${loc}: seat abbreviation ${used[0]}, want ${SEAT_LETTER[loc]}`);
  }
  seatLocales++;
}
if (seatLocales !== 7) fail(`GH-721: expected 7 locale files, found ${seatLocales}`);
if (!seatMixed) console.log('[e2e-i18n] GH-721 seat-abbreviation lint clean across', seatLocales, 'locales');
if (process.exitCode) { console.error('lint failed — not booting the app'); process.exit(1); }
console.log('[e2e-i18n] literal lint clean across', SWEPT.length, 'files');

// ---- expected translations (independent copies, NOT read from locales) -----
const EXPECT = {
  // stateBih/bihHint (GH-370): the boot table now parks in the OPENING
  // ball-in-hand (WPA 5.3(a) kitchen grant), so the state line under test
  // is the BALL IN HAND + behind-the-head-string guidance pair
  en: { shoot: 'Shoot', bihHint: 'behind the head string', assist: 'Aim assist',
    exportHead: 'Export video', stateBih: 'BALL IN HAND' },
  'zh-CN': { shoot: '击球', bihHint: '开球线后', assist: '瞄准辅助',
    exportHead: '导出视频', stateBih: '自由球' },
  es: { shoot: 'Tirar', bihHint: 'detrás de la línea de saque', assist: 'Ayuda de puntería',
    exportHead: 'Exportar vídeo', stateBih: 'BOLA EN MANO' },
  ja: { shoot: 'ショット', bihHint: 'ヘッドライン後方', assist: 'エイムアシスト',
    exportHead: '動画の書き出し', stateBih: 'ボールインハンド' },
  de: { shoot: 'Stoßen', bihHint: 'hinter die Kopflinie', assist: 'Zielhilfe',
    exportHead: 'Video exportieren', stateBih: 'BALL IN HAND' },
  fr: { shoot: 'Tirer', bihHint: 'derrière la ligne de casse', assist: 'Aide à la visée',
    exportHead: 'Exporter la vidéo', stateBih: 'BILLE EN MAIN' },
  ko: { shoot: '샷', bihHint: '헤드 라인 뒤', assist: '조준 보조',
    exportHead: '동영상 내보내기', stateBih: '볼 인 핸드' },
};

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [];
const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1`,
  { port: CDP_PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  }
});

async function waitReady() {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) {
    await sleep(200);
    ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
  }
  if (!ready) throw new Error('app never became ready');
}

try {
  await waitReady();

  // ---- fresh profile defaults to en (headless Chrome reports en-US) --------
  const bootLocale = await chrome.eval('window.__i18n.locale()');
  if (bootLocale !== 'en') fail('fresh profile locale is ' + bootLocale + ', want en');

  // ---- dictionary audit: zero missing/extra keys per locale -----------------
  const audit = await chrome.eval('window.__i18n.audit()');
  for (const [loc, r] of Object.entries(audit)) {
    if (r.missing.length) fail(`locale ${loc} missing keys: ${r.missing.join(', ')}`);
    if (r.extra.length) fail(`locale ${loc} extra keys: ${r.extra.join(', ')}`);
    console.log(`[e2e-i18n] audit ${loc}: ${r.keys} keys, 0 missing, 0 extra`);
  }

  // ---- live-switch each locale: HUD, settings panel, export dialog ---------
  await chrome.eval(`document.getElementById('ob-gear').click()`); // open panel
  await chrome.eval('window.__export.open()');
  await sleep(300);
  for (const [loc, exp] of Object.entries(EXPECT)) {
    await chrome.eval(`__settings.set('language', ${JSON.stringify(loc)})`);
    // POLL the async dictionary fetch + re-render instead of a fixed sleep
    // (build-8 wall: a 250 ms budget loses the race on a loaded box — the
    // fetch itself is async; the LAW is convergence, not a latency SLA)
    let switched = false;
    for (let i = 0; i < 40 && !switched; i++) {
      await sleep(150);
      switched = await chrome.eval(
        `window.__i18n.locale() === ${JSON.stringify(loc)}
        && document.getElementById('shoot').textContent === ${JSON.stringify(exp.shoot)}`);
    }
    const got = {
      locale: await chrome.eval('window.__i18n.locale()'),
      shoot: await chrome.eval(`document.getElementById('shoot').textContent`),
      state: await chrome.eval(`document.getElementById('state').textContent`),
      panel: await chrome.eval(`document.getElementById('ob-settings').textContent`),
      exportHead: await chrome.eval(
        `document.querySelector('#ob-export-card h3')?.textContent ?? ''`),
    };
    if (got.locale !== loc) fail(`set('language') did not switch to ${loc} (got ${got.locale})`);
    if (got.shoot !== exp.shoot) fail(`${loc}: Shoot button "${got.shoot}", want "${exp.shoot}"`);
    if (!got.state.includes(exp.stateBih) || !got.state.includes(exp.bihHint)) {
      fail(`${loc}: opening state line "${got.state}" missing "${exp.stateBih}"/"${exp.bihHint}"`);
    }
    if (!got.panel.includes(exp.assist)) fail(`${loc}: settings panel missing "${exp.assist}"`);
    if (!got.exportHead.includes(exp.exportHead)) {
      fail(`${loc}: export heading "${got.exportHead}", want "${exp.exportHead}"`);
    }
    await chrome.screenshot(path.join(webDir, `e2e-i18n-${loc}.png`));
    console.log(`[e2e-i18n] ${loc}: HUD/settings/export OK`);
  }
  await chrome.eval('window.__export.close()');

  // ---- 024 help overlay: live locale switch with the overlay OPEN ----------
  // The generic dictionary audit above already gates the 89 new keys + the
  // hud.help rewrite (zero missing/extra x7 — no second dictionary exists).
  // This scenario proves the OPEN overlay re-renders in place through the
  // shipped applyDom path on every switch: the title lands in each locale
  // (independent copies, NOT read from locales/), the panel stays open, and
  // no raw `help.` key ever leaks as visible text. Runs red until lane A
  // merges (T024).
  const HELP_TITLE = {
    en: 'How to play', 'zh-CN': '玩法说明', es: 'Cómo jugar', ja: '遊び方',
    de: 'So wird gespielt', fr: 'Comment jouer', ko: '게임 방법',
  };
  const helpUp = await chrome.eval(
    `typeof window.__help?.open === 'function'`);
  if (!helpUp) {
    fail('help overlay surface (window.__help) absent — 024 live-switch '
      + 'scenario cannot run (lane A not merged yet?)');
  } else {
    await chrome.eval(`window.__help.open('api')`);
    await sleep(400);
    for (const [loc, title] of Object.entries(HELP_TITLE)) {
      await chrome.eval(`__settings.set('language', ${JSON.stringify(loc)})`);
      // POLL the applyDom re-render (the HUD-loop law above): the fixed
      // 300 ms budget lost the async dictionary fetch race under load
      let landed = false;
      for (let i = 0; i < 40 && !landed; i++) {
        await sleep(150);
        landed = await chrome.eval(`document.getElementById('ob-help-panel')
          ?.querySelector('h2')?.textContent === ${JSON.stringify(title)}`);
      }
      const got = await chrome.eval(`(() => {
        const panel = document.getElementById('ob-help-panel');
        if (!panel || !panel.getClientRects().length) return { open: false };
        return { open: window.__help.isOpen(),
          title: panel.querySelector('h2')?.textContent ?? '',
          rawLeak: /help\\.[a-zA-Z]/.test(panel.textContent),
          // GH-718 review r4 P2: the gated DVR seek rows render under a FRESH
          // dictionary — r5 P2: the cells are t()-composed (never data-i18n-
          // bound), so count them by ROW structure and compare against the
          // active dictionary's own strings
          seekCells: [...panel.querySelectorAll('tr[data-gated^="help.controls.keyboard.seek"]')]
            .filter((r) => !r.hidden).flatMap((r) => [...r.children])
            .filter((e) => e.textContent.trim() && !/^help\\./.test(e.textContent)).length,
          seekTranslated: [...panel.querySelectorAll('tr[data-gated^="help.controls.keyboard.seek"]')]
            .every((r) => !r.hidden && r.firstChild?.textContent === window.__i18n.t(r.dataset.gated + '.k')
              && r.lastChild?.textContent === window.__i18n.t(r.dataset.gated + '.v')) };
      })()`);
      if (!got.open) fail(`help overlay closed itself during the ${loc} switch`);
      else {
        if (got.title !== title) {
          fail(`${loc}: open overlay title "${got.title}", want "${title}" `
            + '(applyDom re-render law)');
        }
        if (got.rawLeak) fail(`${loc}: raw help.* key visible in the open overlay`);
        if (got.seekCells !== 6 || got.seekTranslated !== true) fail(`${loc}: the three GH-718 keyboard seek rows must render under the fresh dictionary in ${loc}'s own strings (${got.seekCells}/6 cells, translated=${got.seekTranslated})`);
      }
      console.log(`[e2e-i18n] help overlay live-switch ${loc}: `
        + (got.open && got.title === title && !got.rawLeak ? 'OK' : 'FAIL'));
    }
    await chrome.screenshot(path.join(webDir, 'e2e-i18n-help-open.png'));
    await chrome.eval('window.__help.close()');
    await sleep(300);
  }

  // ---- scripted foul under zh-CN: banner must be the translated FOUL -------
  await chrome.eval(`__settings.set('language', 'zh-CN')`);
  await sleep(250);
  await chrome.eval(`__test.layout([
    { id: 0, x: 0, y: -0.4 }, { id: 2, x: 0, y: 0.2 },
    { id: 1, x: -0.5, y: -1.0 }, { id: 9, x: 0.4, y: 0.9 }])`);
  const err = await chrome.eval(
    '__test.shoot({ v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
  if (err) fail('foul shot rejected: ' + err);
  let state = 'PLAYBACK';
  for (let i = 0; i < 150 && state === 'PLAYBACK'; i++) {
    await sleep(400); state = await chrome.eval('__test.state()');
  }
  if (state !== 'BALL_IN_HAND') fail('scripted foul did not reach BALL_IN_HAND: ' + state);
  const banner = await chrome.eval(`document.getElementById('banner').textContent`);
  if (!banner.startsWith('犯规')) fail('zh-CN foul banner wrong: ' + banner);
  if (!banner.includes('首先击打了错误的球')) fail('zh-CN foul reason wrong: ' + banner);
  const bihState = await chrome.eval(`document.getElementById('state').textContent`);
  if (!bihState.includes('自由球')) fail('zh-CN BALL IN HAND label wrong: ' + bihState);
  await chrome.screenshot(path.join(webDir, 'e2e-i18n-foul-zh-CN.png'));
  console.log('[e2e-i18n] zh-CN foul banner OK:', banner);

  // ---- GH-718 review r4 P2: STALE-DICTIONARY leg ------------------------------
  // A fresh help.js over a pre-PR cached dictionary — the deterministic
  // stand-in: every locale JSON served MINUS the keys this PR added (the
  // pairing the ownership ledger's mixed-cache law makes reachable; locale JSON is
  // cached independently of the module). The three GH-718 keyboard seek
  // rows are data-i18n-bound with no t() fallback: ungated they paint the
  // literal `help.controls.keyboard.seek.k` into the table (RED pre-fix).
  // Law: the rows are OMITTED (no data-i18n, hidden), zero raw help.* text,
  // the shipped keyboard + pointer rows untouched. The other keys the PR
  // added (share.*Label, playback.seek, shell.decision.replayLocked) are
  // t()-with-fallback sites and stay out of this leg by the ruling.
  // GH-1051: the cue-ball pad's keyboard row is the same added-row register
  // (help.js GATED_ROWS), so a pre-#1051 dictionary lacks it too
  const STALE_DROP = /^(help\.controls\.keyboard\.(seek|spin)|share\.(bar|gate)Label$|playback\.seek$|shell\.decision\.replayLocked$)/;
  // GH-668 S5 slice 2 review r2 P2-2: the shell's has()-guarded keys (the
  // slice-2 additions) — dropped ONLY during the shell stale-switch leg below
  const STALE_DROP_S5 = new RegExp(STALE_DROP.source
    + '|^(shell\\.card\\.replaysOpenVerb|shell\\.notice\\.replayExit|shell\\.toTable|shell\\.backToTable|shell\\.rememberNext|shell\\.hall)$|^decision\\.(q|cite)\\.'
    // review r3 P2: the settings toggle state words + the coarse Remember notice pair
    + '|^(settings\\.on|settings\\.off|shell\\.rememberOn|shell\\.rememberOff)$');
  let staleDrop = STALE_DROP;
  const staleBody = (loc) => {
    const d = JSON.parse(fs.readFileSync(path.join(webDir, 'app/locales', `${loc}.json`), 'utf8'));
    for (const k of Object.keys(d)) if (staleDrop.test(k)) delete d[k];
    return Buffer.from(JSON.stringify(d)).toString('base64');
  };
  let staleServed = 0;
  chrome.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    const m = /\/app\/locales\/([\w-]+)\.json/.exec(params.request.url);
    if (!m) { chrome.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {}); return; }
    staleServed += 1;
    chrome.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }],
      body: staleBody(m[1]) }).catch(() => {});
  });
  await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/locales/*.json*' }] });
  // GH-718 review r5 P2: the LIVE fresh -> stale SWITCH. The current
  // document runs zh-CN on a fresh dictionary with the help overlay's gated
  // rows shown; switching to a locale whose JSON is served stale fires
  // main.js's global applyDom(document) FIRST (the first locale-change
  // subscriber). Law: zero missing-key warnings on the i18n channel (the
  // console.warn hook AND __i18n.missing()), zero raw help.* text, the
  // gated rows withdrawn (RED on a57f242a: the cells were data-i18n-bound
  // while the fresh dictionary knew them, and the global pass t()'d the
  // three missing keys before help.js's relabel could unbind them).
  {
    const up = await chrome.eval(`typeof window.__help?.open === 'function'`).catch(() => false);
    if (!up) fail('stale-switch leg: help overlay surface (window.__help) absent in the fresh document');
    else {
      await chrome.eval(`window.__help.open('api')`);
      await sleep(500);
      const fresh = await chrome.eval(`(() => {
        const panel = document.getElementById('ob-help-panel');
        const kb = panel?.querySelector('[data-section="keyboard"] tbody');
        window.__i18nWarns = []; const w = console.warn.bind(console);
        console.warn = (...a) => { if (/\\[i18n\\] missing key/.test(String(a[0]))) window.__i18nWarns.push(String(a[0])); w(...a); };
        return { open: !!panel && window.__help.isOpen(), locale: window.__i18n.locale(),
          kbRows: kb ? [...kb.querySelectorAll('tr')].filter((r) => !r.hidden && r.firstChild).length : -1,
          missing: window.__i18n.missing().length };
      })()`);
      await chrome.eval(`__settings.set('language', 'de')`);
      let switched = false;
      for (let i = 0; i < 40 && !switched; i++) {
        switched = await chrome.eval(`window.__i18n.locale() === 'de'`).catch(() => false);
        if (!switched) await sleep(150);
      }
      await sleep(400);
      const sw = await chrome.eval(`(() => {
        const panel = document.getElementById('ob-help-panel');
        const kb = panel?.querySelector('[data-section="keyboard"] tbody');
        return { locale: window.__i18n.locale(), warns: window.__i18nWarns,
          missingSeek: window.__i18n.missing().filter((k) => /^help\\.controls\\.keyboard\\.seek/.test(k)),
          rawLeak: !!panel && /help\\.[a-zA-Z]/.test(panel.textContent),
          raw: panel ? (panel.textContent.match(/help\\.[a-zA-Z.]+/g) || []).slice(0, 4) : [],
          seekBound: panel ? panel.querySelectorAll('[data-i18n^="help.controls.keyboard.seek"]').length : -1,
          gatedShown: panel ? [...panel.querySelectorAll('tr[data-gated]')]
            .filter((r) => getComputedStyle(r).display !== 'none' || r.textContent.trim()).length : -1,
          kbRows: kb ? [...kb.querySelectorAll('tr')].filter((r) => !r.hidden && r.firstChild).length : -1 };
      })()`);
      if (!fresh.open || fresh.kbRows !== 9) fail(`stale-switch leg: staging — the fresh ${fresh.locale} overlay must show the 9 keyboard rows (5 shipped + 3 seek + 1 spin-pad gated), got ${JSON.stringify(fresh)}`);
      if (!switched) fail(`stale-switch leg: the locale never switched to de (got ${sw.locale})`);
      else {
        if (sw.warns.length || sw.missingSeek.length) fail(`stale-switch leg: a fresh -> stale switch logged missing-key warnings: ${JSON.stringify({ warns: sw.warns.slice(0, 4), missingSeek: sw.missingSeek })} (RED pre-fix: main.js's global applyDom t()'d the still-bound gated cells)`);
        if (sw.rawLeak) fail(`stale-switch leg: raw help.* key rendered after the switch: ${sw.raw.join(', ')}`);
        if (sw.seekBound !== 0) fail(`stale-switch leg: ${sw.seekBound} seek cells data-i18n-bound after the switch (law: never bound)`);
        if (sw.gatedShown !== 0) fail(`stale-switch leg: ${sw.gatedShown} gated row(s) still rendered after the switch`);
        if (sw.kbRows !== 5) fail(`stale-switch leg: the keyboard table shows ${sw.kbRows} rows after the switch (want the 5 shipped rows)`);
      }
      console.log(`[e2e-i18n] stale-switch leg (${fresh.locale} -> ${sw.locale}): warns=${sw.warns.length} missingSeek=${sw.missingSeek.length} rawLeak=${sw.rawLeak} seekBound=${sw.seekBound} gatedShown=${sw.gatedShown} kbRows=${fresh.kbRows}->${sw.kbRows}`);
      await chrome.eval('window.__help.close()');
      await sleep(200);
    }
  }
  // ---- GH-668 S5 slice 2 review r2 P2-2: SHELL stale-switch leg -------------
  // The shell's has()-guarded keys are re-selected at relabel(), not once at
  // build. Slice 2 added `shell.card.replaysOpenVerb` (a verb, like every
  // card action); a current shell paired with a cached non-English
  // dictionary that lacks it must paint the LOCALIZED legacy label
  // (`shell.card.replaysOpen`) — never the en fallback of the new key and
  // never a raw key — and re-select the NEW key the moment a fresh
  // dictionary lands. Staging: a scripted boot WITH the shell (obshell=1 —
  // the plain ?seed=1 document never builds it) under no intercept; fresh
  // en (the verb, new key) -> de served MINUS every slice-2 shell key (the
  // S5 drop set on the same intercept) -> intercept off, en -> de re-fetched
  // fresh; the help intercept is re-armed for the next leg. RED on
  // 84484e07: the key was chosen once at build, so the stale switch painted
  // the ENGLISH verb through has()'s en fallback.
  {
    const dictOf = (loc) => JSON.parse(fs.readFileSync(path.join(webDir, 'app/locales', `${loc}.json`), 'utf8'));
    const en = dictOf('en'), de = dictOf('de');
    const verbExpr = `(() => {
      const lab = document.querySelector('#ob-shell-cards section[data-place="replays"] .ob-shell-actions .ob-btn .ob-btn__label[data-i18n^="shell.card.replaysOpen"]');
      const root = document.getElementById('ob-shell');
      return { locale: window.__i18n.locale(), key: lab?.dataset.i18n ?? null, text: lab?.textContent ?? null,
        raw: root ? (root.textContent.match(/shell\\.[a-zA-Z.]+/g) || []).slice(0, 4) : ['no-shell'] }; })()`;
    // review r3 P2-1: the settings toggles' kit STATE WORDS (B-K19 / B-SH07:
    // `settings.on` / `settings.off`) are optional kit copy — supplied only
    // when the ACTIVE dictionary carries both keys; under the stale de they
    // must be EMPTY + hidden (the kit's pre-B-K19 track-only rendering),
    // never t()'s English fallback or a raw key; fresh de restores them.
    // The words are re-labelled on every locale broadcast regardless of the
    // panel's visibility, so they are read in place. RED on 4bc70438: the
    // unconditional t() painted `On` / `Off` into the de panel.
    const wordsExpr = `(() => {
      const ids = ['ob-set-sound', 'ob-set-assist-cuepath', 'ob-set-assist-warnball', 'ob-set-fullscreen'];
      const rows = [];
      for (const id of ids) {
        const input = document.getElementById(id);
        const word = input?.closest('label.ob-toggle')?.querySelector(':scope > .ob-toggle__state');
        if (!input || !word) continue;
        rows.push({ id, checked: input.checked, text: word.textContent, hidden: word.hidden });
      }
      return rows; })()`;
    const switchTo = async (loc) => {
      await chrome.eval(`__settings.set('language', ${JSON.stringify(loc)})`);
      let ok = false;
      for (let i = 0; i < 40 && !ok; i++) {
        ok = await chrome.eval(`window.__i18n.locale() === ${JSON.stringify(loc)}`).catch(() => false);
        if (!ok) await sleep(150);
      }
      await sleep(300);
      return ok;
    };
    await chrome.send('Fetch.disable'); // a FRESH boot with the shell
    await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?seed=1&obshell=1` });
    await waitReady();
    let shellUp = false;
    for (let i = 0; i < 60 && !shellUp; i++) {
      shellUp = await chrome.eval(`!!document.querySelector('#ob-shell-cards section[data-place="replays"] .ob-shell-actions .ob-btn__label')`).catch(() => false);
      if (!shellUp) await sleep(250);
    }
    if (!shellUp) fail('shell stale-switch leg: staging — the shell (obshell=1) never built its replays card');
    const okEn = await switchTo('en');
    const fresh = await chrome.eval(verbExpr);
    let wordsFresh = [];
    for (let i = 0; i < 40 && !wordsFresh.length; i++) { // the kit upgrade lands asynchronously
      wordsFresh = await chrome.eval(wordsExpr).catch(() => []);
      if (!wordsFresh.length) await sleep(250);
    }
    staleDrop = STALE_DROP_S5;
    await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/locales/*.json*' }] });
    const okDe = await switchTo('de'); // re-fetched under the intercept: stale de
    const stale = await chrome.eval(verbExpr);
    const wordsStale = await chrome.eval(wordsExpr);
    await chrome.send('Fetch.disable'); // back to fresh: the next de fetch is the real dictionary
    const okEn2 = await switchTo('en');
    const okDe2 = await switchTo('de');
    const back = await chrome.eval(verbExpr);
    const wordsBack = await chrome.eval(wordsExpr);
    staleDrop = STALE_DROP; // the help stale-dictionary leg's intercept, re-armed
    await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/locales/*.json*' }] });
    if (!okEn || !okDe || !okEn2 || !okDe2) fail(`shell stale-switch leg: a locale switch never landed ${JSON.stringify({ okEn, okDe, okEn2, okDe2 })}`);
    if (!(fresh.key === 'shell.card.replaysOpenVerb' && fresh.text === en['shell.card.replaysOpenVerb'])) fail(`shell stale-switch leg: staging — the fresh en replays verb must be the new key: ${JSON.stringify(fresh)}`);
    if (!(stale.key === 'shell.card.replaysOpen' && stale.text === de['shell.card.replaysOpen'])) fail(`shell stale-switch leg: a fresh en -> stale de switch must re-select the LOCALIZED legacy label (want ${JSON.stringify(de['shell.card.replaysOpen'])} under shell.card.replaysOpen), got ${JSON.stringify(stale)} (RED on 84484e07: the English verb through has()'s en fallback)`);
    if (stale.text === en['shell.card.replaysOpenVerb']) fail(`shell stale-switch leg: the English verb leaked into de: ${JSON.stringify(stale)}`);
    if (stale.raw.length) fail(`shell stale-switch leg: raw shell.* key text in the shell after the stale switch: ${stale.raw.join(', ')}`);
    if (!(back.key === 'shell.card.replaysOpenVerb' && back.text === de['shell.card.replaysOpenVerb'])) fail(`shell stale-switch leg: back on a fresh de the verb must re-select the NEW key: ${JSON.stringify(back)}`);
    console.log(`[e2e-i18n] shell stale-switch leg: en fresh '${fresh.text}' (${fresh.key}) -> stale de '${stale.text}' (${stale.key}) -> fresh de '${back.text}' (${back.key})`);
    // settings toggle state words (review r3 P2-1)
    const wordOf = (dict, r) => dict[r.checked ? 'settings.on' : 'settings.off'];
    if (wordsFresh.length < 3) fail(`settings stale-switch leg: staging — want the kit state words on the settings toggles under fresh en, got ${JSON.stringify(wordsFresh)}`);
    else {
      const badFresh = wordsFresh.filter((r) => r.hidden || r.text !== wordOf(en, r));
      if (badFresh.length) fail(`settings stale-switch leg: staging — fresh en words must be the en On / Off copy: ${JSON.stringify(badFresh)}`);
      const badStale = wordsStale.filter((r) => r.text !== '' || !r.hidden);
      if (badStale.length) fail(`settings stale-switch leg: a fresh en -> stale de switch must EMPTY + hide the toggle state words (no English / raw text in a de panel), got ${JSON.stringify(badStale)} (RED on 4bc70438: the unconditional t() painted en's On / Off)`);
      const leak = wordsStale.filter((r) => r.text === en['settings.on'] || r.text === en['settings.off'] || /^settings\./.test(r.text));
      if (leak.length) fail(`settings stale-switch leg: English / raw state words leaked into de: ${JSON.stringify(leak)}`);
      const badBack = wordsBack.filter((r) => r.hidden || r.text !== wordOf(de, r));
      if (badBack.length) fail(`settings stale-switch leg: back on a fresh de the words must be de's On / Off copy: ${JSON.stringify(badBack)}`);
      console.log(`[e2e-i18n] settings stale-switch leg: ${wordsFresh.length} toggles — fresh en ${JSON.stringify(wordsFresh.map((r) => r.text))} -> stale de ${JSON.stringify(wordsStale.map((r) => r.text))} (hidden ${wordsStale.every((r) => r.hidden)}) -> fresh de ${JSON.stringify(wordsBack.map((r) => r.text))}`);
    }
  }
  await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?seed=1` });
  await waitReady();
  // help.js rides the guarded dynamic main.js seam — it lands after ready
  let staleUp = false;
  for (let i = 0; i < 40 && !staleUp; i++) {
    staleUp = await chrome.eval(`typeof window.__help?.open === 'function'`).catch(() => false);
    if (!staleUp) await sleep(250);
  }
  if (!staleUp) fail('stale-dictionary leg: help overlay surface (window.__help) absent');
  else {
    await chrome.eval(`window.__help.open('api')`);
    await sleep(600);
    const st = await chrome.eval(`(() => {
      const panel = document.getElementById('ob-help-panel');
      if (!panel) return { open: false };
      const kb = panel.querySelector('[data-section="keyboard"] tbody');
      return { open: window.__help.isOpen(), locale: window.__i18n.locale(),
        rawLeak: /help\\.[a-zA-Z]/.test(panel.textContent),
        raw: (panel.textContent.match(/help\\.[a-zA-Z.]+/g) || []).slice(0, 4),
        seekBound: panel.querySelectorAll('[data-i18n^="help.controls.keyboard.seek"]').length,
        gatedShown: [...panel.querySelectorAll('tr[data-gated]')]
          .filter((r) => getComputedStyle(r).display !== 'none' || r.textContent.trim()).length,
        kbRows: kb ? [...kb.querySelectorAll('tr')].filter((r) => !r.hidden && r.firstChild).length : -1,
        pointerRows: panel.querySelectorAll('[data-section="mouse"] tbody tr').length };
    })()`);
    if (staleServed === 0) fail('stale-dictionary leg: staging — no locale JSON was served stale (interception missed)');
    if (!st.open) fail('stale-dictionary leg: the overlay did not open under the stale dictionary');
    else {
      if (st.rawLeak) fail(`stale-dictionary leg (${st.locale}): raw help.* key rendered under a pre-PR dictionary: ${st.raw.join(', ')} (RED pre-fix: the GH-718 rows painted their key names)`);
      if (st.seekBound !== 0) fail(`stale-dictionary leg: ${st.seekBound} seek cells still data-i18n-bound under a dictionary lacking the keys (law: omitted)`);
      if (st.gatedShown !== 0) fail(`stale-dictionary leg: ${st.gatedShown} gated row(s) still rendered (computed display / text) under the stale dictionary`);
      if (st.kbRows !== 5) fail(`stale-dictionary leg: the keyboard table shows ${st.kbRows} rows (want the 5 shipped rows: aim, power, view, esc, help)`);
      if (st.pointerRows !== 9) fail(`stale-dictionary leg: the mouse table shows ${st.pointerRows} rows (want 9 — pointer rows are not gated)`);
    }
    console.log(`[e2e-i18n] stale-dictionary leg (${st.locale}, ${staleServed} stale JSON served): `
      + `rawLeak=${st.rawLeak} seekBound=${st.seekBound} gatedShown=${st.gatedShown} kbRows=${st.kbRows} pointerRows=${st.pointerRows}`);
    await chrome.eval('window.__help.close()');
    await sleep(200);
  }
  await chrome.send('Fetch.disable');

  // ---- persistence: choice survives a reload --------------------------------
  await chrome.eval(`__settings.set('language', 'fr')`);
  await sleep(250);
  await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?seed=1` });
  await waitReady();
  const reLocale = await chrome.eval('window.__i18n.locale()');
  if (reLocale !== 'fr') fail('language choice did not persist across reload: ' + reLocale);
  const reShoot = await chrome.eval(`document.getElementById('shoot').textContent`);
  if (reShoot !== 'Tirer') fail('post-reload fr Shoot button wrong: ' + reShoot);
  console.log('[e2e-i18n] persistence across reload OK (fr)');

  // ---- gates -----------------------------------------------------------------
  const missing = await chrome.eval('window.__i18n.missing()');
  if (missing.length) fail('runtime missing keys: ' + missing.join(', '));
  const appErrors = await chrome.eval('window.__test.errors');
  if (appErrors.length) fail('app errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
} catch (e) {
  fail(e.stack ?? String(e));
} finally {
  chrome.close();
  await stopStaticServer(server);
}
console.log(process.exitCode ? 'E2E-I18N: FAILED' : 'E2E-I18N: PASS');

