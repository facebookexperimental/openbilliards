// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-lookboot.mjs — the tournament hall's own REAL-USER boot. A player's default look, Tournament, is the tournament
// hall on every device that passes the boot rules, and the old tournament room everywhere else: these legs boot the
// hall for real, the way a player's browser does, and judge what that boot shows, stores and costs.
// A real-user boot on a passing device shows the tournament hall: the dark stage at first paint, then the
// hall by ONE dissolve, with a per-device verdict record deciding the next boot (web/app/main.js, LOOK-BOOT-RULES and THE
// STAGE; the leaf is web/scene/club). Every other suite is pinned to the old room by the launcher (cdp.mjs launchChrome,
// `lookPin`, default on), so this suite is the only browser test of the hall's path: every launch here but leg 8's is
// `launchChrome(url, { tool: false, lookPin: false })`.
//
//   legs (each prints `[leg N] PASS|FAIL|INFO ...`; `--legs 2,5a` runs a subset, each leg launches its own browser):
//    1  the device: the renderer string and the tier the boot rules gave (`__test.lookBoot`)
//    2  a fresh profile boots the stage, then the hall, with no old-room picture: lookBoot { default, hall, stage, <tier>,
//       pass-new }, no leaf URL before first paint, every presented picture is the stage, a blend or the hall, one dissolve,
//       no program first linked inside the swap's task (the leaf's own count, `linkedInSwap`), and the hall still there
//       at rest some seconds after the reveal (its picture not dark, no non-finite texel in the scene's own buffer or in
//       the app's reflection cube)
//    3  the verdict is written after the leaf's report, and the second boot follows it (pass-verdict)
//    4  the pace against the display's frame period, judged by main.js's OWN rule and constants (read as text)
//    5a a blocked leaf entry (fetch)        5b a blocked arena/room.js (fetch)
//    5c main's bound with bytes pending: the leaf's entry held in the network (fetch: never a verdict)
//       (a boot that must not ask is judged by ITS OWN document's requests: a request the page before makes on its way
//       out is set aside by name and not counted; legs 5a and 5c end on a planted ask that the tally must count)
//    5d a room that is off (build)          5e the true timeout: every file in, a room whose build never ends (timeout)
//    5f a budget with a file pending: every module in, the baked light map held in the network (fetch: no verdict)
//       each: the old room by one dissolve, the record holds the class, the next boots follow it
//    5g a mismatch (step 2): the leaf's entry answered with another stage protocol number, as when a cached app meets a
//       newer leaf: the old room by one dissolve, NOTHING stored, the next boot asks for the hall as a first boot does
//    6  a stored `old` keeps the old room with no leaf byte; the player's way out (Green, then Tournament); a `build`
//       old is not cleared; the reload offer Green to Tournament where a reload would show the hall
//       (step 2: `old` on BOTH rungs; a device the standard hall alone is too slow for is leg 6b's)
//    6b THE LIGHT HALL (step 2): a record as step 1 wrote it for a pace-condemned device boots the hall on the leaf's
//       `lite` tier by the same stage flow (lookBoot { default, hall, stage, <tier>, light-new, rung lite }; one dissolve,
//       no old-room picture; the hall still there at rest)
//    6c the light hall's own record: its report is booked under the record's member `lite` and the standard hall's
//       verdict stands as stored; the next boot follows that member
//    6d the way out from the light hall's page: Tournament chosen anew clears both rungs and offers the reload, which
//       is the standard hall again
//    7  one pot in the hall, judged by the game's own state
//    8  the launcher's pin and the held launch (the ONE leg launched with the launcher's default)
//    9  offline for real (the network emulated offline, the page served by the service worker, ?sw=1); first, in node,
//       web/sw.js's boot manifest against the served tree (a worker cannot install over one file that differs)
//   10  the second visit's cost: leaf requests that reach the server and their bytes (numbers only)
//   11  measures (numbers only): time to first paint with the pin on and off, the stage facts and the pace of N boots;
//       with --sw N, N more boots with the service worker on (a player's first visit): the worker's install and fill
//       on the page's clock, and whether each shared time with the leaf's load and with the hall's pace window;
//       with --slow N, N pairs of first visits over ONE SLOW LINK (the suite's own paced server: the worker's fetches
//       are slowed with the page's), worker on and worker off: the hall inside main's bound or the fall-back, the
//       record, the next boot; with --slow-follow a second and a third boot, each to its outcome; with --slow-rates
//       the first visit again at faster rates (where the hall first arrives inside the bound). ONE LAW in the measure
//       (lines headed `LAW`): no 'old' verdict from a boot in which a leaf request had been asked and had neither
//       arrived nor failed when its bound or budget fired
//   12  measures (numbers only): WHERE THE REVEAL'S TIME GOES. Sets of four hall boots, a fresh profile each, every one
//       with the page's long tasks and the gaps between its animation frames on record: `plain` (nothing more),
//       `pictures` (leg 2's picture probe on, its read-back after every presented picture), `profile` (a CPU profile of
//       the page thread from first paint: the swap's task, the time from its end to the dissolve's begin and the hall
//       AT REST in the leaf's pace window, by function) and `gl` (every call of the WebGL context timed in passing:
//       the slow ones by name, the calls and their time per second at rest, and the programs linked before, in and
//       after the swap by the renderer's own name, with what tells each from its nearest twin). Each boot runs on to
//       the leaf's pace report and prints it. Its checks are of the measure alone (the boot reached the hall, the
//       profile holds the swap, the tap saw calls and counts the programs linked inside the swap as the leaf does),
//       but for ONE LAW on every boot that reached the hall: leg 2's read of the hall at rest (the `plain` boot is the
//       product's own order of frames and tasks; leg 2's probe slows the stage's frames and can hide an order)
//   13  measures (numbers only): THE KNOB SWEEP, what the hall's frame costs with one thing off. (a) one hall boot per
//       variant, a fresh profile each, through the leaf's own tool switch `?clubknobs=` (the lens, the bloom, the grade,
//       the floor's coat, the box reflections, the far table, the room's detail, the motion, all of them, and the hall
//       as built first and last), each to the leaf's pace report: the hall's frame per variant; a variant whose hall
//       the stage refuses is a row that says so. (b) on the first boot as built, with the hall at rest, the BENCH:
//       `composer.render()` in a row, as built and with one pass off, the room hidden, no multisampling, half the pixel
//       ratio: per row the page thread's time to issue a render and the time until the renderer has finished it.
//       Its checks are of the measure alone (the leaf changed exactly the knobs asked; the bench has its rows)
//       (c) `--sweep-only s2`, THE SECOND BENCH, two boots: the hall as built, and the old room under the launcher's
//       pin (the same composer without the leaf: the reference). In each, with the room at rest, rows of
//       `composer.render()` in a row and, for some, PACED (one render an animation frame): as built; the two depth
//       textures off the composer's targets; the scene alone multisampled with the passes on single-sample targets;
//       both; the bloom at strength 0; the scene pass alone; the passes alone; two samples; none; half the pixel
//       ratio. In the hall also the frames of the leaf's pace window, each interval beside the draw calls issued in
//       it (does a long frame carry more work). Its checks: the boots are what they should be, the bench has its
//       rows and left the page as it found it
//   14  measures (numbers only): THE DISPLAY'S NUMBER. ONE browser for the whole leg, and with `--headed` ONE VISIBLE
//       WINDOW of the installed browser on the machine's own display (the launcher's own headed mode: a temporary
//       profile folder of the launch, never a person's profile): `--display N` hall boots in it (default 5), each a
//       first visit again (the origin's storage and the browser's cache emptied between them), each to the leaf's
//       pace report; and before the first, the animation frames of an idle page (the display's period as this
//       window gets it). Its checks are of the measure alone (each boot a first visit that reached the hall and its
//       report; the window visible at each report). THEN, in that same browser and window, THE ROOMS' ROWS: the second
//       bench's rows `asbuilt, floor, none, again` (in a row and paced) in the hall as the last boot left it, then ONE
//       old-room boot (a record a slow device holds, leg 6's way) and the same rows there: the old room's number on the
//       same display. The boots' rows are printed and written to --out BEFORE these begin; whatever these do is a NOTE
//       line, never a red of the boots; they are not begun if the boots took over 85 s and are given up 50 s after
//       they began, so a window stays inside about two minutes (`--display-rooms none` leaves them out; `hall` | `old`
//       one half alone and `--display-rooms-ms N` another bound, for development)
//
//   node web/tools/e2e-lookboot.mjs [--legs 1,2,...] [--out <file.json>] [--pace-numbers] [--tier high] [--boots N] [--sw N] [--slow N] [--reveal N] [--sweep <list>] [--selftest]
//   --out      one JSON file with every number and the fact it came from (the hold, the pace constants, the costs)
//   --tier high  leg 11's hall boots also on the high tier (?clubtier=high)
//   --boots N  leg 11's hall boots per tier (default 5); --paints N its first-paint boots per pin state (default 3)
//   --sw N     leg 11's hall boots with the SERVICE WORKER on (?sw=1, a fresh profile each; default 0 = none): a real
//              player's first visit registers the worker, whose install and fill run beside the stage and the pace window
//   --slow N   leg 11's pairs of first visits over a slow link (default 0 = none). The link is the 3G arm's own
//              (web/tools/e2e-userboot-3g.mjs NETS, read as text): --slow-net fast3g (default) | slow3g. The page is
//              served by a second, PACED static server of the suite (loopback, the http port + 1): one byte rate shared
//              by every response in flight and a latency before each response, so the worker's fetches and the page's
//              pay for the same link (a page session's network emulation does not reach a worker). It answers as the
//              site's host does: text, JSON and wasm gzipped (the rate counts the bytes on the link), Cache-Control:
//              max-age=600, a weak ETag and Last-Modified, 304 to both validators; --slow-max-age <s> says another
//              max-age (0: every stored file is stale, so the follow-up boots revalidate each one).
//              --slow-rate <bytes/s> and --slow-latency <ms> say other numbers (a development run's shape proof);
//              --slow-only on|off runs one half of a pair; --slow-bound product (development switch only) leaves the
//              longer service budget out, so main's own bound stands; --slow-follow takes a SECOND and a THIRD boot
//              (reloads of the same profile) each to its own outcome; --slow-rates a,b,c runs the first visit once
//              more at each of those rates, worker on and off (bytes/s, or xN = N times the link's rate; --slow 0
//              runs them alone), and prints the lowest rate at which the hall arrived inside main's bound;
//              --leaf-out <file> writes every leaf request of those boots (path, bytes, asked, first byte, last byte)
//              as the paced server saw it
//   --rest-still <file.jpg>  beside every read of the hall at rest (leg 2, each boot of leg 12) the page's own screenshot
//              is written as <file>-leg2.jpg, <file>-set1-plain.jpg, ...: a picture for whoever reads the run, not a law
//   --reveal N  leg 12's sets of boots (default 1); --reveal-only plain|pictures|profile|gl runs one boot of each set
//              alone (a development run under software GL fits one boot in a job); --profile-out <file> writes the
//              `profile` boot's whole CPU profile (the browser's own JSON, readable in its developer tools; a second
//              set's file takes -2 before the extension)
//   --sweep <list>  leg 13's variants: specs of `?clubknobs=` (name:value pairs with ',' between them), ';' between
//              the specs, `asbuilt` for the hall with no switch (default: the list in SWEEP_DEFAULT); --sweep-boots N
//              boots per variant (default 1); --sweep-only boots|bench runs one half alone (the bench on one boot as built);
//              --sweep-only s2 runs the second bench instead (s2hall | s2old: one of its two boots alone); --s2-rows
//              <keys> its rows by key with ',' between them (default all: the keys of S2_KEYS); --gpu: the second bench
//              with THE GPU'S OWN STATISTICS beside its rows (macOS: the suite itself runs `/usr/sbin/ioreg -r -d 1 -w 0
//              -c IOAccelerator` every 250 ms while a room's bench runs, a read of the driver's registry entry: the
//              device, renderer and tiler utilisation and the split-scene counter of each sample, cut by each row's own
//              span of time), with rows long enough for it (150 renders in a row, 170 paced intervals); the rooms'
//              rows of leg 14 carry the same samples at their own lengths. Where the tool is not there, the line says so
//   --display N  leg 14's hall boots (default 5); --headed makes leg 14's one browser a visible window (the installed
//              browser, a real display). `--headed` is refused unless the run is leg 14 alone: no other leg opens a window
//   --oldref <file>  keep the old room's reference picture (legs 2, 5) in a file across runs (development)
//   --size WxH  the picture's size (default 1280x720; 640x360 under the development switch)
//   --pace-numbers  legs 3, 4 and 6c print and record this boot's pace numbers and JUDGE NOTHING OF THEM: every line of
//              theirs that needs real frame times reports, as under the development switch, and one line of leg 4
//              (`pace numbers: ...`) carries the period, the hall's median and shares, the rule's word and what the
//              product stored. The nightly battery's form: its host carries whatever else the night has. A placed,
//              quiet run passes no flag and asserts as ever; every other leg, and every other line of leg 6c (its two
//              lines on the light hall's pace are the notes), asserts under the flag too
//   --selftest no browser: the planted reds of the suite's own judges (the picture judge, the pace judge, the swap's links, the record,
//              the worker's boot manifest, the overlap of two spans, the slow link's numbers and shares, a boot's cost,
//              the paced server's answers, the pending test and the slow link's law, leg 5e's stand-in module, leg 12's
//              cuts of a profile and of the timed calls, a program's nearest twin, leg 13's variants, its second
//              bench's rows and its cut of a window's frames, the tally of a boot's requests by document, which
//              lines --pace-numbers leaves unjudged, the program count against its baseline)
//
// PROGRAMS. Every boot that reaches the hall prints the renderer's live program count at the leaf's ready
// (`[leg N] INFO programs ...`, with a digest of the sorted keys) and writes it to --out; the whole list (id, type, name,
// times used, cache key) goes to --out when the count is not PROGRAMS_BASELINE's, or while none is set; with a baseline
// set, a boot whose count is not its number also prints one line per program in the log (id, type, name, times used, a
// digest of its key), so a run without --out still says which programs that boot held. NUMBERS ONLY, never a verdict:
// the count is not one number per tree on a GPU (a state the app compiles ahead is linked in some boots and not in others).
//
// THE DEVICE. The suite forces nothing on a passing device. On a device the boot rules call `lite` (a software renderer:
// the GitHub-hosted runners, a development host) there is no hall to test, and the suite FAILS at leg 1 with a plain line:
// the repo's GPU suites are kept off the hosted runners by their job's `runs-on`, never by a suite that exits 0 having
// tested nothing. ONE switch for developing the legs under software GL: OB_LOOKBOOT_DEV=1 adds `clubtier=base` to every
// boot (and the tool's service budget `clubtimeout` to boots that wait for the hall: a software frame takes seconds);
// under it the legs that need real frame times (3's pace-ok, 4, 11) REPORT and do not assert, and the first line says so.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { assertPortOutsideForeignBands, launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';

// standalone band sizing (run-gate reads this literal): the static server + the paced static server of leg 11's --slow
// group (the http port + 1) + ONE CDP endpoint (launches are sequential)
export const PORT_INVENTORY = { http: 2, cdp: 1 };
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 14480); // defaults in UNDECLARED space (ci-bands: a default may lie in no lane band, in no other tool's default range)
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 17560);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SLOW_PORT = PORT + 1; // the paced server (leg 11, --slow): bound only while that group runs
const SLOW_ORIGIN = `http://127.0.0.1:${SLOW_PORT}`;
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const DEV = process.env.OB_LOOKBOOT_DEV === '1';
const PACE_NUMBERS = argv.includes('--pace-numbers'); // legs 3, 4 and 6c record their pace numbers and judge nothing of them (the nightly battery)
// The hall's live program count at the leaf's ready on the runner's GPU, by the stage flow, with the run it was read in.
// null = not read yet: the first placed run of this suite text reads it, and until then every boot's list goes to --out.
const PROGRAMS_BASELINE = null;
const OUT = opt('--out') ?? '';
const HIGH = opt('--tier') === 'high';
const BOOTS = Math.max(0, Number(opt('--boots') ?? 5) || 0);
const SWBOOTS = Math.max(0, Number(opt('--sw') ?? 0) || 0); // leg 11's third group: hall boots with the service worker on (0 = off)
// leg 11's fourth group: pairs of first visits over a slow link (0 = off); the link's name in the 3G arm's table, or numbers
const SLOWBOOTS = Math.max(0, Number(opt('--slow') ?? 0) || 0);
const SLOWNET = opt('--slow-net') ?? 'fast3g';
const SLOWRATE = Number(opt('--slow-rate')) > 0 ? Number(opt('--slow-rate')) : null;
const SLOWLAT = opt('--slow-latency') !== undefined && Number(opt('--slow-latency')) >= 0 ? Number(opt('--slow-latency')) : null;
const SLOWONLY = ['on', 'off'].includes(opt('--slow-only')) ? opt('--slow-only') : null;
const SLOWBOUND = opt('--slow-bound') === 'product';
// the paced server's Cache-Control max-age in seconds: 600 = the site's host; 0 makes every stored file stale at once, so
// the follow-up boots revalidate each of them (what a visitor gets who comes back after the ten minutes)
const SLOWMAXAGE = opt('--slow-max-age') !== undefined && Number(opt('--slow-max-age')) >= 0 ? Math.floor(Number(opt('--slow-max-age'))) : 600;
const SLOWFOLLOW = argv.includes('--slow-follow'); // a second and a third boot of the same profile, each taken to ITS outcome
// the first visit once more at each of these rates: bytes per second, or xN = N times the link's own rate
const SLOWRATES = String(opt('--slow-rates') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
const LEAFOUT = opt('--leaf-out') ?? ''; // the slow visits' leaf requests, row by row, in a file of their own
const PAINTS = Math.max(0, Number(opt('--paints') ?? 3) || 0);
const OLDREF = opt('--oldref') ?? ''; // development: keep the old room's reference picture in a file across runs (a software boot costs a minute)
// leg 12: its sets of boots, one boot of the set alone, the `profile` boot's whole CPU profile as a file
const REVEAL_MODES = ['plain', 'pictures', 'profile', 'gl'];
const REVEALS = Math.max(0, Number(opt('--reveal') ?? 1) || 0);
const REVEALONLY = REVEAL_MODES.includes(opt('--reveal-only')) ? opt('--reveal-only') : null;
const PROFOUT = opt('--profile-out') ?? '';
const RESTSTILL = opt('--rest-still') ?? ''; // the hall at rest after the stage: the page's own screenshot beside each read of the law (leg 2, leg 12's boots)
const PROFILE_US = 1000; // the profile's sampling interval (microseconds)
const GL_SLOW_MS = 2; // the `gl` boot lists every WebGL call of this many ms or more
const REST_MS = 2500; // "the hall at rest": this long, inside the leaf's pace window (it opens 1 s after the hall stands and lasts about 3 s)
// leg 13: the sweep's variants (the lens; the bloom; both; the grade; the floor's coat; the box reflections; the far table;
// the room at its plainest; the motion; everything the knobs give; the hall as built first and last), boots per variant,
// one half alone; the bench's renders per row and its unmeasured ones (one and none under the development switch)
const SWEEP_DEFAULT = 'asbuilt;dof:off;bloom:0;dof:off,bloom:0;grade:0;floorCoat:0;envBox:0;farTable:0;roomDetail:0,roomMaps:0,farTable:0;motion:off;dof:off,bloom:0,floorCoat:0,envBox:0,farTable:0,roomDetail:0,roomMaps:0,motion:off;asbuilt';
const SWEEP = sweepVariants(opt('--sweep') ?? SWEEP_DEFAULT);
const SWEEPBOOTS = Math.max(1, Number(opt('--sweep-boots') ?? 1) || 1);
const SWEEPONLY = ['boots', 'bench', 's2', 's2hall', 's2old'].includes(opt('--sweep-only')) ? opt('--sweep-only') : null;
const BENCH_N = DEV ? 1 : 30, BENCH_WARM = DEV ? 0 : 3, BENCH_PARTS = DEV ? 3 : 12; // (the room's parts hidden one at a time: so many of them)
// leg 13's second bench: its rows by key, in the suite's order; the paced rows' measured intervals and unmeasured ones
const S2_KEYS = ['asbuilt', 'floor', 'A', 'B', 'AB', 'bloom0', 'scene', 'passes', 'two', 'none', 'half', 'again'];
const S2ROWS = s2Rows(opt('--s2-rows'));
const HEADED = argv.includes('--headed'); // leg 14 alone: its one browser is a visible window
const DISPLAYBOOTS = Math.max(1, Number(opt('--display') ?? 5) || 5);
const DISPLAY_ROOMS = ['all', 'hall', 'old', 'none'].includes(opt('--display-rooms')) ? opt('--display-rooms') : 'all'; // leg 14's rooms' rows after its boots
const DISPLAY_ROWS = ['asbuilt', 'floor', 'none', 'again'];
const DISPLAY_ROOMS_LATEST_MS = 85000; // the rooms' rows begin only while the leg is younger than this ...
const DISPLAY_ROOMS_MS = Math.max(1000, Number(opt('--display-rooms-ms')) || (DEV ? 400000 : 50000)); // ... and are given up when they have taken this long: a window stays inside about two minutes (the option: development)
// the GPU's own statistics (macOS): a read of the driver's registry entry, no display and no privilege
const GPU = argv.includes('--gpu'); // the second bench with them beside its rows
const GPU_TOOL = ['/usr/sbin/ioreg', ['-r', '-d', '1', '-w', '0', '-c', 'IOAccelerator']];
const GPU_EVERY_MS = 250;
const GPU_N = DEV ? 1 : 150, GPU_PACED = DEV ? 1 : 170; // (rows long enough for the sampler: about 4.5 s as built)
const DISPLAY_MARK = 'ob-e2e-lookboot-display-mark'; // leg 14 leaves it in the origin's storage after a boot: the next boot's clear must have removed it
const S2_PACED = DEV ? 1 : 90, S2_SKIP = DEV ? 0 : 10; // (the first paced frames come before the renderer's queue is full: unmeasured)
const ALL_LEGS = ['1', '2', '3', '4', '5a', '5b', '5c', '5d', '5e', '5f', '5g', '6', '6b', '6c', '6d', '7', '8', '9', '10', '11', '12', '13', '14'];
const ASKED = opt('--legs') ? String(opt('--legs')).split(',').map((s) => s.trim()).filter(Boolean) : ALL_LEGS;
const LEGS = [...ALL_LEGS.filter((l) => ASKED.includes(l)), ...ASKED.filter((l) => !ALL_LEGS.includes(l))]; // always in the suite's order
// the picture's size: 1280 x 720 on a GPU (the numbers of legs 4 and 11 are read as measurements: a real size); under the
// development switch 640 x 360, the smallest picture a software renderer draws no slower. `--size WxH` says otherwise.
const SIZE = /^(\d{3,4})x(\d{3,4})$/.exec(opt('--size') ?? '') ?? (DEV ? [null, 640, 360] : [null, 1280, 720]);
const W = Number(SIZE[1]), H = Number(SIZE[2]);
// the suite's own end, before a job's watchdog, so the JSON is always written
const DEADLINE = Date.now() + (Number(process.env.OB_E2E_WATCHDOG_MS) || (DEV ? 430000 : 1500000));
// waits (ms): a GPU boot, and a software boot under the development switch (a presented frame takes 6 to 13 s there).
// OB_E2E_POLL_SCALE (the CI jobs' knob for a loaded runner) stretches the GPU waits; `report` is the leaf's own window
// (at most 12 s by its clock) and is not stretched.
const SCALE = Math.max(1, Number(process.env.OB_E2E_POLL_SCALE) || 1);
const T = DEV ? { paint: 150000, hall: 420000, report: 70000, fail: 260000, rest: 20000, restN: 2, step: 500 }
  : { paint: 60000 * SCALE, hall: 90000 * SCALE, report: 16000, fail: 70000 * SCALE, rest: 700, restN: 20, step: 100 };

const out = { suite: 'e2e-lookboot', at: new Date().toISOString(), dev: DEV, paceNumbers: PACE_NUMBERS, viewport: [W, H], legs: {}, measures: {}, constants: {}, device: null, programs: [] };
let failures = 0;
let legNow = '-';
// (the line forms are run-gate's verdict grammar, lib/verdict-grammar.mjs: '[tag] PASS name', '[tag] FAIL name — why';
// INFO and NOTE lines are never verdicts)
const say = (kind, text) => console.log(`[leg ${legNow}] ${kind} ${text}`);
const info = (text) => say('INFO', text);
/** Whether a line that needs real frame times only REPORTS: under the development switch (a software renderer), and under
 * --pace-numbers (the nightly battery: numbers, no verdict on the night's pace). A line that needs none always asserts. Pure. */
const reportsOnly = (gpu, dev = DEV, numbers = PACE_NUMBERS) => gpu === true && (dev === true || numbers === true);
/** One assertion. `gpu: true` = it needs real frame times: under the development switch and under --pace-numbers it reports and does not assert. */
function check(name, ok, detail = '', { gpu = false } = {}) {
  if (reportsOnly(gpu)) { say('NOTE', `not asserted under ${DEV ? 'OB_LOOKBOOT_DEV' : '--pace-numbers'} (${ok ? 'it holds here' : 'it does NOT hold here'}): ${name}${detail ? ` — ${detail}` : ''}`); return ok; }
  say(ok ? 'PASS' : 'FAIL', `${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) { failures += 1; process.exitCode = 1; }
  return ok;
}
const J = (x) => { try { return JSON.stringify(x); } catch { return String(x); } };
const eq = (a, b) => J(a) === J(b);

// ---- the product's own rules, read from main.js as text (no number is copied into this file) --------------------------------
const mainText = fs.readFileSync(path.join(webDir, 'app', 'main.js'), 'utf8');
function productRules(text = mainText) {
  const a = text.indexOf('// >>> LOOK-BOOT-RULES'), b = text.indexOf('// <<< LOOK-BOOT-RULES');
  if (a < 0 || b < a) throw new Error('main.js: the LOOK-BOOT-RULES marks are missing');
  const body = text.slice(text.indexOf('\n', a) + 1, b);
  // eslint-disable-next-line no-new-func
  const rules = new Function(`${body}\nreturn { LOOK_PACE, LOOK_SLOW_AFTER_PASS, LOOK_TRIES, LOOK_FETCH_WAIT_MS, LOOK_ANEW_WHYS, lookJudgePace, lookFailClass, lookRecord };`)();
  const key = /const LOOK_VERDICT_KEY = '([^']+)';/.exec(text)?.[1];
  const bound = /const STAGE_MAX_MS = clubBudget > (\d+) \? (\d+) \* clubBudget : (\d+);/.exec(text);
  if (!key || !bound) throw new Error('main.js: the verdict key or the stage bound is not where this suite reads it');
  // (stageBound: main's bound for a boot that asks for a service budget of `budget` ms, by that same line; dissolve: the
  // reveal's own arithmetic, read by pattern for the slow visits' timeline: null when the line is not where it was)
  const dz = /p \+= Math\.min\(\(phase === 1 \? (\d+) \/ (\d+) : t - at\) \/ (\d+), ([\d.]+)\);/.exec(text);
  return { ...rules, key, STAGE_MAX_MS: Number(bound[3]), stageBound: (budget = 0) => (budget > Number(bound[1]) ? Number(bound[2]) * budget : Number(bound[3])),
    dissolve: dz ? { first: Number(dz[1]) / Number(dz[2]), ms: Number(dz[3]), step: Number(dz[4]) } : null };
}
const RULES = productRules();
const KEY = RULES.key;
out.constants = { from: 'web/app/main.js as text (LOOK-BOOT-RULES, LOOK_VERDICT_KEY, STAGE_MAX_MS)', LOOK_PACE: { ...RULES.LOOK_PACE }, LOOK_SLOW_AFTER_PASS: RULES.LOOK_SLOW_AFTER_PASS,
  LOOK_TRIES: { ...RULES.LOOK_TRIES }, LOOK_FETCH_WAIT_MS: RULES.LOOK_FETCH_WAIT_MS, LOOK_ANEW_WHYS: [...RULES.LOOK_ANEW_WHYS], STAGE_MAX_MS: RULES.STAGE_MAX_MS, key: KEY };
const EN = JSON.parse(fs.readFileSync(path.join(webDir, 'app', 'locales', 'en.json'), 'utf8'));

/** The GPU's statistics in one answer of `ioreg -r -d 1 -w 0 -c IOAccelerator`: the first PerformanceStatistics dictionary
 * (the utilisations in per cent; `splits` = the driver's count of scenes it had to split; null when the answer has none). */
export function gpuStats(text) {
  const m = /"PerformanceStatistics" = \{([^}]*)\}/.exec(String(text ?? ''));
  if (!m) return null;
  const num = (k) => { const x = new RegExp(`"${k}"=(\\d+)`).exec(m[1]); return x ? Number(x[1]) : null; };
  const g = { device: num('Device Utilization %'), renderer: num('Renderer Utilization %'), tiler: num('Tiler Utilization %'), splits: num('SplitSceneCount'), tiledBytes: num('TiledSceneBytes') };
  return g.device === null ? null : g;
}
/** The samples ([epoch ms, stats]) inside a span of time: how many, [median, least, most] of each utilisation, and the
 * split-scene counter at the first and the last of them. */
export function gpuOver(samples, a, b) {
  const xs = (samples ?? []).filter((x) => x[0] >= a && x[0] <= b).map((x) => x[1]);
  if (!xs.length) return { n: 0 };
  const three = (k) => { const v = xs.map((x) => x[k]).filter((x) => Number.isFinite(x)).sort((p, q) => p - q); return v.length ? [v[Math.floor(v.length / 2)], v[0], v[v.length - 1]] : null; };
  return { n: xs.length, device: three('device'), renderer: three('renderer'), tiler: three('tiler'), splits: [xs[0].splits, xs[xs.length - 1].splits], tiledBytes: three('tiledBytes') };
}
/** `during()` with the GPU's statistics sampled beside it: the tool every GPU_EVERY_MS until `during` has ended. A tool
 * that is not there or answers nothing readable stops the sampler (said in `stopped`); `during` is never touched by it. */
export async function gpuBeside(during, tool = GPU_TOOL, everyMs = GPU_EVERY_MS) {
  const samples = [];
  let on = true, stopped = null;
  const one = () => new Promise((done) => { try { execFile(tool[0], tool[1], { timeout: 2000, maxBuffer: 8 << 20 }, (e, stdout) => done(e ? { e: String(e.message ?? e).slice(0, 160) } : { text: stdout })); } catch (e) { done({ e: String(e?.message ?? e).slice(0, 160) }); } });
  const loop = (async () => {
    while (on) {
      const at = Date.now(), x = await one();
      if (x.e) { stopped = x.e; return; }
      const g = gpuStats(x.text);
      if (!g) { stopped = 'the answer holds no PerformanceStatistics'; return; }
      samples.push([at, g]);
      await sleep(Math.max(0, everyMs - (Date.now() - at)));
    }
  })();
  let value = null, threw = null;
  try { value = await during(); } catch (e) { threw = e; }
  on = false;
  await loop;
  if (threw) throw threw;
  return { value, gpu: { tool: `${tool[0]} ${tool[1].join(' ')}`, everyMs, samples, stopped } };
}
/** The samples beside a bench, cut by each row's own span (`at`): written into the bench, told on one line; how many rows got a sample. */
function gpuTell(what, bench, G) {
  const rows = [];
  for (const x of bench.rows ?? []) if (x.at) rows.push({ key: x.key, how: 'in a row', ms: x.totalMs, ...gpuOver(G.samples, x.at[0], x.at[1]) });
  for (const x of bench.paced ?? []) if (x.at) rows.push({ key: x.key, how: 'paced', ms: x.median, ...gpuOver(G.samples, x.at[0], x.at[1]) });
  bench.gpu = { tool: G.tool, everyMs: G.everyMs, stopped: G.stopped, rows, samples: G.samples.map(([at, g]) => [at, g.device, g.renderer, g.tiler, g.splits, g.tiledBytes]) };
  info(`${what}: THE GPU'S OWN STATISTICS BESIDE THE ROWS (${G.tool} every ${G.everyMs} ms: ${G.samples.length} sample(s)${G.stopped ? `; THE SAMPLER STOPPED: ${G.stopped}` : ''}; [row, how, its ms, samples in its span, device % as [median, least, most], renderer %, tiler %, the split-scene counter at the first and the last sample]): ${J(rows.map((r) => [r.key, r.how, r.ms, r.n, r.device ?? null, r.renderer ?? null, r.tiler ?? null, r.splits ?? null]))}`);
  return rows.filter((r) => r.n > 0).length;
}
/** The output file as it stands now: a leg whose later part must not cost its earlier rows writes them first (the suite
 * writes the file again at its end, without `partial`). */
function saveOut(partial) {
  if (!OUT) return;
  try { fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify({ ...out, partial, failures }, null, 1)); info(`written so far to ${OUT} (${partial})`); } catch (e) { say('NOTE', `the file could not be written so far (${OUT}): ${e.message}`); }
}

/** The swap's links: the leaf's own count of the programs that were first linked inside the swap's task
 * (`life.stage.linkedInSwap`: the renderer's programs at the swap's end that were not there at its begin). The law is
 * none: the game cannot answer while the swap's task runs, and a link is the longest thing a swap can hold. */
function judgeSwapLinks(stage) {
  const n = stage?.linkedInSwap;
  if (!Number.isInteger(n) || n < 0) return { ok: false, n: null, why: 'the leaf gave no count (life.stage.linkedInSwap is not a count: a leaf that does not count, or a renderer it could not ask)' };
  return n === 0 ? { ok: true, n, why: null } : { ok: false, n, why: `${n} program(s) were first linked inside the swap's task` };
}

/** The hall at rest after the stage. The picture judge ends at the reveal; a hall can be lost AFTER it (found: a rehearsed
 * program drawn without its patch's uniforms wrote 12 non-finite texels into the app's reflection cube inside the swap, the
 * cube fed itself, and the hall was black two seconds after a reveal that every law before this one passed). Read in one
 * task of the page (pageRest) some seconds after the reveal: the presented picture's wall band is not dark, and neither
 * the scene's own buffer nor the app's reflection cube holds a texel that is not finite. A buffer that could not be read
 * is red, never green. */
const REST = DEV ? { ms: 4000, frames: 1, maxMs: 30000 } : { ms: 4000, frames: 30, maxMs: 20000 }; // (a software renderer's frame takes 6 to 13 s)
function judgeRest(rest) {
  const res = { ok: false, why: null, wall: null };
  const bad = (why) => { res.why = why; return res; };
  if (!rest || rest.err || !Array.isArray(rest.s)) return bad(`the hall at rest could not be read (${rest?.err ?? 'no picture'})`);
  res.wall = wallMax(rest.s);
  if (!(res.wall > PIC.dark)) return bad(`the hall at rest is dark (the wall band's brightest bin ${res.wall}; a dark bin is <= ${PIC.dark})`);
  for (const [name, b] of [["the scene's own buffer", rest.scene], ["the app's reflection cube", rest.cube]]) {
    if (!b || b.read !== true || !Number.isInteger(b.bad) || !(b.texels > 0)) return bad(`${name} could not be read (${b?.why ?? 'no answer'})`);
    if (b.bad !== 0) return bad(`${name} holds ${b.bad} non-finite texel(s) of ${b.texels}`);
  }
  res.ok = true;
  return res;
}

/** Leg 4's judge: the product's rule over a pace, with every number beside its constant. */
function judgePace(pace) {
  const P = RULES.LOOK_PACE, hall = pace?.hall ?? null, period = pace?.period?.ms ?? null;
  const verdict = RULES.lookJudgePace(pace, true);
  const rows = hall ? [
    `hall.frames ${hall.frames} (MIN_FRAMES ${P.MIN_FRAMES}; complete ${hall.complete}; closed by ${hall.closedBy})`,
    `period ${period} ms (PERIOD_MIN_MS ${P.PERIOD_MIN_MS}; ${pace.period?.frames} intervals, share ${pace.period?.share})`,
    `hall.median ${hall.median} ms (FLOOR_MS ${P.FLOOR_MS}; MEDIAN_PERIODS ${P.MEDIAN_PERIODS} x period = ${period === null ? null : +(P.MEDIAN_PERIODS * period).toFixed(2)})`,
    `hall.over ${hall.over} (OVER_SHARE ${P.OVER_SHARE})`,
    `hall.p95 ${hall.p95} ms (P95_PERIODS ${P.P95_PERIODS} x period = ${period === null ? null : +(P.P95_PERIODS * period).toFixed(2)})`,
    `hidden ${pace.hidden}`,
  ] : ['no hall in the report'];
  return { verdict: verdict.verdict, why: verdict.why, rows };
}

// ---- the picture judge (pure; `--selftest` plants its reds) ------------------------------------------------------------------
// A presented picture is known by its SIGNATURE: the mean colour of BINS bins along each of six one-pixel rows of the
// drawing buffer (STRIPS, from the top). The first WALL rows lie in the band over the table where the old room's lit wall
// is and where the stage draws nothing: on the stage every bin there is dark. The law of a stage boot, in signatures:
//   stage+ (the wall band dark; the last of them is the kept frame's picture K), then blends w*K + (1-w)*E with w falling,
//   then the end picture E (the hall, or the old room after a failure), and nothing else, with ONE run of blends.
// An OLD-ROOM picture cannot pass as any of the three: it is not a stage picture (its wall band is lit: the judge is told
// the measured old room and requires that), it is not E when the hall is wanted (E must differ from the old room), and it
// is not a blend of K and the hall (its two-picture residual is large). Each of those is a planted red below and in leg 2.
const STRIPS = [0.03, 0.08, 0.13, 0.45, 0.70, 0.90], WALL = 3, BINS = 16;
// 8-bit levels: a dark bin; a blend's residual, also "the same picture" (rms); two different pictures (rms). Measured under a
// software renderer at 640 x 360: the stage's wall band reads 0 in every bin; the old room's brightest wall bin is never
// under 38 (its first presented frame) and 198 at rest; a GPU run prints its own numbers beside these.
const PIC = { dark: 12, blend: 4, far: 12 };
const wallMax = (s) => { let m = 0; for (let i = 0; i < WALL * BINS * 3; i++) if (s[i] > m) m = s[i]; return m; };
const rms = (a, b) => { let x = 0; for (let i = 0; i < a.length; i++) x += (a[i] - b[i]) ** 2; return Math.sqrt(x / a.length); };
function judgePictures(runs, { want, oldRef = null } = {}) {
  const frames = [];
  for (const r of runs ?? []) for (let i = 0; i < (r.n || 1); i++) frames.push(r.s);
  const res = { ok: false, why: null, frames: frames.length, stage: 0, stageWall: null, blends: 0, end: 0, weights: [], residual: 0, endWall: null, oldWall: oldRef ? wallMax(oldRef) : null, endVsOld: null };
  const bad = (why) => { res.why = why; return res; };
  if (frames.length < 3) return bad(`only ${frames.length} presented picture(s) were seen`);
  if (oldRef && !(wallMax(oldRef) > 2 * PIC.dark)) return bad(`the old room's wall band is not lit in its own picture (brightest bin ${wallMax(oldRef)}): this probe cannot tell it from the stage`);
  const E = frames[frames.length - 1];
  res.endWall = wallMax(E);
  if (!(res.endWall > PIC.dark)) return bad(`the last picture's wall band is dark (brightest bin ${res.endWall}): the stage never ended`);
  if (oldRef) res.endVsOld = +rms(E, oldRef).toFixed(2);
  if (want === 'hall' && oldRef && !(res.endVsOld > PIC.far)) return bad(`the last picture is the old room (rms ${res.endVsOld} from the old room's own picture)`);
  if (want === 'old' && oldRef && !(res.endVsOld <= PIC.blend)) return bad(`the last picture is not the old room (rms ${res.endVsOld} from the old room's own picture)`);
  let i = 0;
  res.stageWall = 0;
  while (i < frames.length && wallMax(frames[i]) <= PIC.dark) { res.stageWall = Math.max(res.stageWall, wallMax(frames[i])); i += 1; }
  res.stage = i;
  if (i === 0) return bad(`the first presented picture is not the stage (its wall band is lit: brightest bin ${wallMax(frames[0])})`);
  if (i === frames.length) return bad('every picture is the stage');
  const K = frames[i - 1];
  let den = 0;
  for (let k = 0; k < K.length; k++) den += (K[k] - E[k]) ** 2;
  let last = 1, phase = 'blend';
  for (; i < frames.length; i++) {
    const g = frames[i];
    let num = 0;
    for (let k = 0; k < g.length; k++) num += (g[k] - E[k]) * (K[k] - E[k]);
    const w = Math.min(1, Math.max(0, den > 0 ? num / den : 0));
    let r = 0;
    for (let k = 0; k < g.length; k++) r += (g[k] - (w * K[k] + (1 - w) * E[k])) ** 2;
    r = Math.sqrt(r / g.length);
    if (r > res.residual) res.residual = +r.toFixed(2);
    if (r > PIC.blend) return bad(`picture ${i + 1} of ${frames.length} is neither the stage, a blend of the kept frame and the end picture, nor the end picture (residual ${r.toFixed(2)} levels at weight ${w.toFixed(3)}): a third picture`);
    if (w > last + 0.03) return bad(`picture ${i + 1}: the kept frame's weight rose (${last.toFixed(3)} -> ${w.toFixed(3)}): a second dissolve`);
    if (w <= 0.02) { phase = 'end'; res.end += 1; } else {
      if (phase === 'end') return bad(`picture ${i + 1}: a blend (weight ${w.toFixed(3)}) after the end picture: a second dissolve`);
      res.blends += 1; res.weights.push(+w.toFixed(3));
    }
    last = Math.min(last, w);
  }
  if (res.blends < 2) return bad(`${res.blends} blend picture(s) between the stage and the end picture: a cut, not a dissolve`);
  if (res.end < 1) return bad('the dissolve never ended');
  res.ok = true;
  return res;
}

/** The stored record against what a boot must have written (the shape, the app version, the fields in `want`). */
function recordProblems(raw, app, want) {
  let r = null;
  try { r = JSON.parse(raw); } catch { return ['the record is not JSON']; }
  const p = [];
  if (!r || r.v !== 1) p.push(`v ${r?.v}`);
  if (app && r?.app !== app) p.push(`app ${r?.app} (the page announced ${app})`);
  for (const [k, v] of Object.entries(want)) if (!eq(r?.[k], v)) p.push(`${k} ${J(r?.[k])} (want ${J(v)})`);
  return p;
}

/** Did two spans of one clock share time? [a0, a1] and [b0, b1], read at `now`: an end that is null had not come by the
 * read (that span is open to `now`); a start that is null never began, and then nothing can be said (null). */
function overlaps(a0, a1, b0, b1, now) {
  if (!Number.isFinite(a0) || !Number.isFinite(b0) || !Number.isFinite(now)) return null;
  return a0 < (b1 ?? now) && b0 < (a1 ?? now);
}

// ---- the slow link (leg 11's --slow group; pure parts first) --------------------------------------------------------------------
/** The slow links' numbers are the 3G arm's own table (web/tools/e2e-userboot-3g.mjs, NETS: a latency in ms and a download
 * rate in bytes per second), read as text: no number of it is copied into this file. { name: { latency, rate } } */
function linkRates(text = fs.readFileSync(path.join(webDir, 'tools', 'e2e-userboot-3g.mjs'), 'utf8')) {
  const out = {};
  for (const m of text.matchAll(/^\s*(\w+): \{ latency: ([\d.]+), downloadThroughput: (\d+), uploadThroughput: \d+ \},?\s*$/gm)) out[m[1]] = { latency: Number(m[2]), rate: Number(m[3]) };
  return out;
}
/** One tick of the link: `budget` whole bytes shared out among the responses in flight (`left[i]` = the bytes response i
 * still has to send): equal shares, and what a nearly finished response does not need goes to the others. */
function linkShares(budget, left) {
  const out = left.map(() => 0);
  let b = Math.floor(budget), live = left.map((_, i) => i).filter((i) => left[i] > 0);
  while (b >= 1 && live.length) {
    const share = Math.max(1, Math.floor(b / live.length)), next = [];
    for (const i of live) {
      if (b < 1) break;
      const n = Math.min(share, left[i] - out[i], b);
      out[i] += n; b -= n;
      if (out[i] < left[i]) next.push(i);
    }
    live = next;
  }
  return out;
}
/** What a first visit cost the device, read off the NEXT boot's decision and the stored record, with main.js's own
 * constants beside each count (a sentence for the log and the JSON; it judges nothing). */
function costOfBoot(next, record, R = RULES) {
  const f = record?.fails ?? {};
  const tries = `failures on record: fetch ${f.fetch ?? 0} of ${R.LOOK_TRIES.fetch}, timeout ${f.timeout ?? 0} of ${R.LOOK_TRIES.timeout}, build ${f.build ?? 0} of ${R.LOOK_TRIES.build}`;
  if (!next) return 'not known: the next boot was not read';
  if (next.shown === 'hall' && next.rung === 'lite') return `the standard hall for this app version: the next boot asks for the LIGHT hall (${next.why}; ${tries})`;
  if (next.shown === 'hall') return `nothing yet: the next boot asks for the hall again (${next.why}; ${tries})`;
  if (next.why === 'fetch-wait') return `the hall for LOOK_FETCH_WAIT_MS = ${R.LOOK_FETCH_WAIT_MS} ms from the failure: the old room until then (${tries})`;
  if (next.why === 'verdict-old') return `the hall for this app version: 'old' is stored (why '${record?.why}')${R.LOOK_ANEW_WHYS.includes(record?.why) ? ', until the player chooses Tournament anew' : ''} (${tries})`;
  return `the old room on the next boot (${next.why}; ${tries})`;
}
/** The kind of one leaf file, by its path (the slow visits' table of what had arrived when main's bound fired). */
function leafGroup(p) {
  if (/\/scene\/club\/.*\.m?js$/.test(p)) return 'modules';
  if (/\/assets\/club\/[^/]*(-light|-env|hdri-)[^/]*\.png$/.test(p)) return 'baked light and environment maps';
  if (/\.(jpe?g|png|webp|ktx2)$/.test(p)) return 'other textures';
  if (/\.(wav|mp3|ogg|m4a)$/.test(p)) return 'audio';
  return 'anything else';
}
/** Was one request PENDING at `at`: asked for by then, and neither answered nor failed by then? A row of the paced server:
 * askedMs = the request reached it; endMs = its answer was wholly sent (the last body byte; an answer without a body, a 304
 * or a 404, ends when it is sent: a revalidation ARRIVES when it is answered); cutMs = the client gave the request up
 * before that (it FAILED). A file that had not been asked for yet is not pending: nobody was waiting for it. */
const pendingAt = (e, at) => e.askedMs <= at && !(e.endMs !== null && e.endMs !== undefined && e.endMs <= at) && !(e.cutMs !== null && e.cutMs !== undefined && e.cutMs <= at);
/** The requests of `list` that were pending at `at` (the slow link's one law reads this). */
function leafPending(list, at) {
  return list.filter((e) => pendingAt(e, at));
}
/** The leaf's requests at one moment: `list` = the paced server's rows { path, bytes, linkBytes, askedMs, endMs, cutMs }
 * (bytes = the file's body, linkBytes = what went over the link for it, compressed when it was; a 304 has neither), `at` =
 * the moment, on the same clock. Per group and in all: files, body bytes, link bytes, how many were asked for by then,
 * how many had wholly arrived (been answered), the body and link bytes of those, and how many were pending (pendingAt). */
function leafAtBound(list, at) {
  const zero = () => ({ files: 0, bytes: 0, linkBytes: 0, asked: 0, arrived: 0, bytesArrived: 0, linkBytesArrived: 0, pending: 0 }), all = zero(), groups = {};
  for (const e of list) {
    const g = (groups[leafGroup(e.path)] ??= zero()), asked = e.askedMs <= at, arrived = e.endMs !== null && e.endMs !== undefined && e.endMs <= at, link = e.linkBytes ?? e.bytes ?? 0, pending = pendingAt(e, at);
    for (const x of [g, all]) { x.files += 1; x.bytes += e.bytes ?? 0; x.linkBytes += link; if (asked) x.asked += 1; if (arrived) { x.arrived += 1; x.bytesArrived += e.bytes ?? 0; x.linkBytesArrived += link; } if (pending) x.pending += 1; }
  }
  return { ...all, groups };
}
/** The slow link's ONE LAW, for one boot: no 'old' verdict from a boot in which a leaf request had been asked and had
 * neither arrived nor failed when its bound or budget fired (the leaf's entry not arrived counts as pending).
 * `before` / `after` = the stored record before and after the boot; `cls` = the class of the reason main was told
 * (main.js lookFailClass; null = no failure); `firedMs` = the moment main was told (null = it was not); `rows` = the
 * page's leaf requests at the server (pendingAt's rows); `entryAtMs` = the moment the leaf's install began on the page
 * (its entry module had arrived and run; null = never). A bound or a budget fired = a failure whose class is not `build`
 * (a build's own error is no budget). Returns the facts and `ok`. */
function slowLaw({ before, after, cls, firedMs, rows, entryAtMs }) {
  const storedOld = after?.verdict === 'old' && before?.verdict !== 'old';
  const fired = Number.isFinite(firedMs), list = fired ? leafPending(rows, firedMs) : [];
  const entryIn = fired ? Number.isFinite(entryAtMs) && entryAtMs <= firedMs : null;
  const budget = fired && cls !== null && cls !== 'build';
  const pending = list.length + (entryIn === false && !list.some((e) => /\/scene\/club\/index\.js$/.test(e.path)) ? 1 : 0);
  return { storedOld, verdictBefore: before?.verdict ?? null, verdictAfter: after?.verdict ?? null, whyAfter: after?.why ?? null, class: cls, firedMs: fired ? firedMs : null, budgetFired: budget,
    asked: fired ? rows.filter((e) => e.askedMs <= firedMs).length : null, pending: fired ? pending : null, pendingPaths: list.slice(0, 12).map((e) => e.path), entryIn, ok: !(storedOld && budget && pending > 0) };
}
/** The site's host compresses text, JSON and wasm, and leaves pictures and sound as they are: is a file of this
 * extension sent gzipped to a request with this Accept-Encoding? (One list: a type the host is found to treat otherwise
 * is one entry here.) */
const GZIP_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.md', '.map', '.xml', '.webmanifest', '.wasm']);
function gzipFor(ext, acceptEncoding) {
  return GZIP_EXT.has(String(ext).toLowerCase()) && /(^|[,\s])gzip\s*(;|,|$)/.test(String(acceptEncoding ?? ''));
}
/** A conditional request against a stored file: true = answer 304. If-None-Match decides when it is there (a weak
 * comparison: `W/` does not count; `*` matches), else If-Modified-Since at or after the file's time. */
function notModified(headers, etag, stampMs) {
  const inm = headers['if-none-match'];
  if (inm !== undefined) { const bare = (t) => t.trim().replace(/^W\//, ''); return String(inm).split(',').some((t) => t.trim() === '*' || bare(t) === bare(etag)); }
  const since = Date.parse(headers['if-modified-since'] ?? '');
  return Number.isFinite(since) && stampMs <= since;
}
/** The reveal's dissolve over the delivered frames after a fall-back, by main.js's own arithmetic (`law` = productRules().dissolve):
 * times[0] is the kept frame (the stage as drawn), times[1] the dissolve's first step; the progress grows by
 * min(dt / law.ms, law.step) per frame (the first step by law.first ms), and the frame that reaches 1 is the end picture
 * alone. Returns that frame's time, or null when the frames seen do not reach it. */
function dissolveEnd(times, law) {
  if (!law) return null;
  let p = 0;
  for (let i = 1; i < times.length; i++) {
    p += Math.min((i === 1 ? law.first : times[i] - times[i - 1]) / law.ms, law.step);
    if (p >= 1 - 1e-6) return times[i];
  }
  return null;
}
/** The suite's own PACED static server: one slow LINK on the loopback interface, answering AS THE SITE'S HOST DOES.
 * The link: every response body is sent out of one byte budget (`rate` bytes per second ON THE LINK, that is of the
 * compressed bytes where a body is compressed, shared by all responses in flight: linkShares, every 20 ms), and each
 * response waits `latency` ms before its first byte, so a worker's fetches and its page's pay for the same link.
 * The answers: text, JSON and wasm are sent gzipped to a request that accepts it (`Content-Encoding: gzip`, `Vary:
 * Accept-Encoding`; GZIP_EXT; each file is compressed ONCE, at its first request, at zlib's default level, and kept:
 * no request after the first compresses anything); every answer carries `Cache-Control:
 * max-age=<maxAge>` (600, the host's), a weak `ETag` and `Last-Modified`; a request whose `If-None-Match` or
 * `If-Modified-Since` holds is answered 304 with no body. So the browser's HTTP cache does here what it does on the
 * site: reuse without asking inside max-age, one conditional request per stored file after it.
 * It counts what it sent to the PAGE and to the WORKER (a worker's fetches carry the worker script as their referrer),
 * in link bytes and in body bytes. Nothing outside `root` is served. */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wav': 'audio/x-wav', '.woff2': 'font/woff2', '.txt': 'text/plain',
  '.md': 'text/markdown', '.map': 'application/json', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json' };
async function pacedServer(root, port, { rate, latency, maxAge = 600 }) {
  const base = fs.realpathSync(root);
  const side = () => ({ requests: 0, bytes: 0, bodyBytes: 0, gzipped: 0, notModified: 0, firstAt: null, lastAt: null });
  // (leaf: one row per request under the leaf's two folders: { path, who, status, bytes, linkBytes, gzip, askedAt,
  // firstAt, endAt, cutAt }; series: the leaf's link bytes sent so far, one point per quarter second)
  const S = { rate, latency, maxAge, at: Date.now(), page: side(), worker: side(), peak: 0, errors: [], leaf: [], leafBytes: 0, series: [] };
  // every file served, read and (text) compressed once: { mtimeMs, size, raw, gz, etag, stamp }
  const kept = new Map();
  const fileOf = (file, st) => {
    let f = kept.get(file);
    if (!f || f.mtimeMs !== st.mtimeMs || f.size !== st.size) {
      const raw = fs.readFileSync(file), stamp = new Date(Math.floor(st.mtimeMs / 1000) * 1000);
      f = { mtimeMs: st.mtimeMs, size: st.size, raw, gz: GZIP_EXT.has(path.extname(file).toLowerCase()) ? zlib.gzipSync(raw) : null, stamp, etag: `W/"${Math.floor(st.mtimeMs / 1000).toString(16)}-${st.size.toString(16)}"` };
      kept.set(file, f);
    }
    return f;
  };
  const flight = new Set(), sockets = new Set();
  let last = Date.now(), carry = 0;
  const tick = setInterval(() => {
    const now = Date.now(), budget = carry + (S.rate * (now - last)) / 1000, live = [...flight];
    last = now;
    if (!live.length) { carry = 0; return; }
    const give = linkShares(budget, live.map((a) => a.body.length - a.off));
    let used = 0, leafNow = 0;
    live.forEach((a, i) => {
      const n = give[i];
      if (n > 0) {
        try { a.res.write(a.body.subarray(a.off, a.off + n)); } catch { /* the client left */ }
        a.off += n; used += n; a.who.bytes += n; a.who.lastAt = now;
        if (a.row) { leafNow += n; if (a.row.firstAt === null) a.row.firstAt = now; }
      }
      if (a.off >= a.body.length) { flight.delete(a); a.who.bodyBytes += a.size; if (a.row) a.row.endAt = now; try { a.res.end(); } catch { /* the client left */ } }
    });
    if (leafNow) { S.leafBytes += leafNow; const k = Math.floor((now - S.at) / 250), tail = S.series[S.series.length - 1]; if (tail && tail[0] === k) tail[1] = S.leafBytes; else S.series.push([k, S.leafBytes]); }
    carry = budget - used; // (less than one byte while anything is in flight)
  }, 20);
  const server = http.createServer((req, res) => {
    const who = /\/sw\.js$/.test(String(req.headers.referer ?? '').split('?')[0]) ? S.worker : S.page;
    who.requests += 1;
    if (who.firstAt === null) who.firstAt = Date.now();
    res.on('error', () => {});
    let file = null, st = null, rel = null;
    try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); file = path.join(base, rel); } catch { file = null; }
    if (file && file.startsWith(base + path.sep) && (req.method === 'GET' || req.method === 'HEAD')) { try { st = fs.statSync(file); } catch { st = null; } }
    const row = rel !== null && LEAF.test(rel) && S.leaf.length < 4000 ? { path: rel, who: who === S.worker ? 'worker' : 'page', status: null, bytes: null, linkBytes: null, gzip: false, askedAt: Date.now(), firstAt: null, endAt: null, cutAt: null } : null;
    if (row) S.leaf.push(row);
    const plain = (code) => { if (row) { row.status = code; row.bytes = 0; row.linkBytes = 0; row.endAt = Date.now(); } };
    setTimeout(() => {
      try {
        if (res.destroyed) { if (row) row.cutAt = Date.now(); return; } // (the client gave the request up while it waited)
        if (!st || !st.isFile()) { plain(404); res.writeHead(404, { 'Content-Type': 'text/plain', 'Content-Length': 0 }); res.end(); return; }
        const ext = path.extname(file).toLowerCase(), f = fileOf(file, st), gz = f.gz !== null && gzipFor(ext, req.headers['accept-encoding']);
        const head = { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': `max-age=${maxAge}`, ETag: f.etag, 'Last-Modified': f.stamp.toUTCString(), ...(f.gz !== null ? { Vary: 'Accept-Encoding' } : null) };
        if (notModified(req.headers, f.etag, f.stamp.getTime())) { plain(304); who.notModified += 1; res.writeHead(304, head); res.end(); return; }
        const whole = gz ? f.gz : f.raw, body = req.method === 'HEAD' ? Buffer.alloc(0) : whole;
        res.writeHead(200, { ...head, 'Content-Length': whole.length, ...(gz ? { 'Content-Encoding': 'gzip' } : null) });
        if (gz) who.gzipped += 1;
        if (row) { row.status = 200; row.bytes = f.size; row.linkBytes = body.length; row.gzip = gz; }
        if (!body.length) { if (row) row.endAt = Date.now(); res.end(); return; }
        const a = { res, body, off: 0, who, row, size: f.size };
        flight.add(a);
        if (flight.size > S.peak) S.peak = flight.size;
        res.on('close', () => { if (flight.delete(a) && row && row.endAt === null) row.cutAt = Date.now(); }); // (closed before its last byte: the request failed)
      } catch (e) { if (S.errors.length < 8) S.errors.push(String(e?.message ?? e)); try { res.destroy(); } catch { /* gone */ } }
    }, latency);
  });
  server.on('connection', (sock) => { sockets.add(sock); sock.on('close', () => sockets.delete(sock)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return {
    S,
    /** a new boot: the counts begin again; times are then ms since this moment (this process's clock) */
    reset() { S.at = Date.now(); S.page = side(); S.worker = side(); S.peak = flight.size; S.leaf = []; S.leafBytes = 0; S.series = []; },
    /** per side: requests, linkBytes (what went over the link), bodyBytes (the files' own bytes, of the answers that were wholly sent), how many answers were gzipped, how many were 304 */
    counts() { const rel = (x) => (x === null ? null : x - S.at), of = (w) => ({ requests: w.requests, linkBytes: w.bytes, bodyBytes: w.bodyBytes, gzipped: w.gzipped, notModified: w.notModified, firstMs: rel(w.firstAt), lastMs: rel(w.lastAt) }); return { at: S.at, page: of(S.page), worker: of(S.worker), peakInFlight: S.peak, inFlight: flight.size, errors: S.errors.slice() }; },
    /** another link rate from now on (bytes per second on the link; the visits at other rates) */
    setRate(bytesPerSecond) { S.rate = bytesPerSecond; },
    /** the leaf's requests of this boot, times in ms since reset() (endMs = the answer wholly sent; cutMs = the client gave it up before that) */
    leaf() { const rel = (x) => (x === null ? null : x - S.at); return S.leaf.map((e) => ({ path: e.path, who: e.who, status: e.status, bytes: e.bytes, linkBytes: e.linkBytes, gzip: e.gzip, askedMs: rel(e.askedAt), firstMs: rel(e.firstAt), endMs: rel(e.endAt), cutMs: rel(e.cutAt) })); },
    /** the leaf's LINK bytes sent by `ms` after reset() (to the quarter second) */
    leafBytesBy(ms) { let v = 0; for (const [k, total] of S.series) { if (k * 250 <= ms) v = total; else break; } return v; },
    async close() { clearInterval(tick); for (const sock of sockets) { try { sock.destroy(); } catch { /* gone */ } } await new Promise((resolve) => server.close(() => resolve())); },
  };
}

// ---- leg 12's arithmetic (pure; `--selftest` plants its reds) ---------------------------------------------------------------------
const ms1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
/** A CPU profile of the page thread (CDP Profiler.stop: nodes, samples, timeDeltas in microseconds) cut at the leaf's
 * swap. `swap` = from the first to the last sample with a function named `fn` on its stack, to that sample's end (the
 * swap is one synchronous call: every sample between them belongs to its task); `after` = the next `afterMs` ms;
 * `rest` = the last `restMs` ms before the profile's end, whether or not the swap was found. Per window: its length,
 * its samples, `self` = the time by the function on top of the stack (a call the browser itself serves, a WebGL call
 * above all, is a function without a file; `(idle)` is the thread with nothing to run), `within` = for each function
 * of a file under `part`, the time with it anywhere on the stack; the longest `top` of each. A label is
 * `name path:line`, or the bare name. */
function profileCut(profile, { fn = 'stageSwap', afterMs = 0, restMs = 0, top = 16, part = '/scene/club/' } = {}) {
  const nodes = profile?.nodes ?? [], samples = profile?.samples ?? [], deltas = profile?.timeDeltas ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n])), parent = new Map();
  for (const n of nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const file = (u) => { try { return new URL(u).pathname; } catch { return String(u); } };
  const labels = new Map(), stacks = new Map(), under = new Map();
  const label = (n) => {
    let l = labels.get(n.id);
    if (l === undefined) { const f = n.callFrame ?? {}; l = f.url ? `${f.functionName || '(anonymous)'} ${file(f.url)}:${(f.lineNumber ?? -1) + 1}` : (f.functionName || '(anonymous)'); labels.set(n.id, l); }
    return l;
  };
  const stack = (id) => { // the sample's node first, then its callers
    let s = stacks.get(id);
    if (!s) { s = []; for (let k = id; k !== undefined && s.length < 4000; k = parent.get(k)) { const n = byId.get(k); if (n) s.push(n); } stacks.set(id, s); }
    return s;
  };
  const inFn = (id) => { let v = under.get(id); if (v === undefined) { v = stack(id).some((n) => n.callFrame?.functionName === fn); under.set(id, v); } return v; };
  const at = [];
  let t = profile?.startTime ?? 0;
  for (let i = 0; i < samples.length; i++) { t += deltas[i] ?? 0; at.push(t); }
  const end = (i) => (i + 1 < at.length ? at[i + 1] : Math.max(profile?.endTime ?? at[i], at[i]));
  let first = -1, last = -1;
  for (let i = 0; i < samples.length; i++) if (inFn(samples[i])) { if (first < 0) first = i; last = i; }
  const cut = (from, to) => {
    const self = new Map(), within = new Map();
    let total = 0, n = 0;
    for (let i = 0; i < samples.length; i++) {
      const d = Math.min(end(i), to) - Math.max(at[i], from);
      if (!(d > 0)) continue;
      total += d; n += 1;
      const s = stack(samples[i]);
      if (!s.length) continue;
      self.set(label(s[0]), (self.get(label(s[0])) ?? 0) + d);
      const seen = new Set();
      for (const node of s) {
        if (!String(node.callFrame?.url ?? '').includes(part)) continue;
        const l = label(node);
        if (!seen.has(l)) { seen.add(l); within.set(l, (within.get(l) ?? 0) + d); }
      }
    }
    const rows = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => [k, ms1(v / 1000)]);
    return { ms: ms1(total / 1000), samples: n, self: rows(self), within: rows(within) };
  };
  const stop = at.length ? end(at.length - 1) : 0;
  const rest = restMs > 0 && at.length ? cut(stop - restMs * 1000, stop) : null;
  if (first < 0) return { found: false, samples: samples.length, swap: null, after: null, rest };
  const from = at[first], to = end(last);
  return { found: true, samples: samples.length, swap: cut(from, to), after: afterMs > 0 ? cut(to, to + afterMs * 1000) : null, rest };
}
/** The timed WebGL calls ([start ms, ms, name, ...]) that share time with [from, to): how many, their time inside it, that
 * time by the call's name, and the longest `top` of them whole. */
function glCut(calls, from, to, top = 10) {
  const by = new Map(), rows = [];
  let total = 0;
  for (const c of calls ?? []) {
    const d = Math.min(c[0] + c[1], to) - Math.max(c[0], from);
    if (!(d > 0)) continue;
    total += d; rows.push(c); by.set(c[2], (by.get(c[2]) ?? 0) + d);
  }
  return { calls: rows.length, ms: ms1(total), by: [...by].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, ms1(v)]), longest: rows.slice().sort((a, b) => b[1] - a[1]).slice(0, top) };
}
/** What tells a program from its nearest twin among `before` ({ name, key }: the renderer's name and cache key of each):
 * the twin is a program of the same name whose key has as many comma fields, with the fewest fields that differ.
 * { fields: how many differ, diff: [[field, the twin's value, its own], ...] (the first `most`) }, or null without a twin. */
function keyTwin(key, name, before, most = 6) {
  const mine = String(key).split(',');
  let best = null;
  for (const b of before ?? []) {
    if (b.name !== name) continue;
    const theirs = String(b.key).split(',');
    if (theirs.length !== mine.length) continue;
    const diff = [];
    for (let i = 0; i < mine.length; i++) if (mine[i] !== theirs[i]) diff.push([i, theirs[i].slice(0, 32), mine[i].slice(0, 32)]);
    if (best === null || diff.length < best.length) best = diff;
  }
  return best === null ? null : { fields: best.length, diff: best.slice(0, most) };
}
/** Leg 13's variants from a list: specs of `?clubknobs=` with ';' between them, `asbuilt` for no switch; a spec is
 * name:value pairs with ',' between them. -> [{ name, query, knobs: [the names] }]; a part of another form is dropped. */
function sweepVariants(text) {
  const out = [];
  for (const raw of String(text ?? '').split(';').map((x) => x.trim()).filter(Boolean)) {
    if (raw === 'asbuilt') { out.push({ name: 'as built', query: '', knobs: [] }); continue; }
    if (!/^[A-Za-z]+:[A-Za-z0-9.]+(,[A-Za-z]+:[A-Za-z0-9.]+)*$/.test(raw)) continue;
    out.push({ name: raw, query: `clubknobs=${raw}`, knobs: raw.split(',').map((p) => p.split(':')[0]) });
  }
  return out;
}
/** The second bench's rows from `--s2-rows`: the keys named, in the suite's order; nothing named = all; an unknown key is dropped. */
function s2Rows(text) {
  const asked = String(text ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return asked.length ? S2_KEYS.filter((k) => asked.includes(k)) : S2_KEYS.slice();
}
/** The frames of a window, each interval beside the draw calls issued in it. `frames` = [[the tick's ms, the draws since the
 * tick before], ...] (pageDraws); the window is [from, to] ms. A FRAME here is a tick with draws: where the app holds its
 * own frames while the page's animation frames go on (its gate under a software renderer), the ticks between are no
 * frames. -> the intervals' count, median and p95, the median draws of a frame, the long intervals (over `long` medians)
 * as [ms into the window, interval, its draws, the draws of the frame before], how many of those carry more than `more`
 * medians of draws (in themselves or in the frame before), and the window's ticks, drawn or not. */
function framesCut(frames, from, to, { long = 1.4, more = 1.2 } = {}) {
  const all = (Array.isArray(frames) ? frames : []).filter((x) => Array.isArray(x) && x[0] >= from && x[0] <= to), f = all.filter((x) => x[1] > 0);
  const iv = [];
  for (let k = 1; k < f.length; k++) iv.push([f[k][0], f[k][0] - f[k - 1][0], f[k][1], f[k - 1][1]]);
  if (!iv.length) return { n: 0, median: null, p95: null, draws: null, long: [], longMoreDraws: 0, ticks: all.length };
  const sorted = (a) => a.slice().sort((x, y) => x - y), q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  const ms = sorted(iv.map((x) => x[1])), med = q(ms, 0.5), dmed = q(sorted(iv.map((x) => x[2])), 0.5);
  const lg = iv.filter((x) => x[1] > long * med);
  return { n: iv.length, median: ms1(med), p95: ms1(q(ms, 0.95)), draws: dmed, long: lg.map((x) => [ms1(x[0] - from), ms1(x[1]), x[2], x[3]]),
    longMoreDraws: lg.filter((x) => Math.max(x[2], x[3]) > more * dmed).length, ticks: all.length };
}

// ---- page scripts (registered for a new document before the app's first script) -------------------------------------------------
/** Every boot: the first-paint clock, the page's own announcement of its app version, the time the leaf's install began. */
function pageFacts(nonce) {
  const B = (window.__obLB = { nonce, onLine0: navigator.onLine, fp: { lower: null, at: null, how: null }, announces: [], clubAt: null, frames: null });
  try { performance.setResourceTimingBufferSize(4000); } catch { /* the default buffer */ }
  try { addEventListener('ob:look-verdict', (e) => { B.announces.push({ t: performance.now(), app: e.detail && e.detail.app, key: e.detail && e.detail.key }); }); } catch { /* no event */ }
  try { // the leaf publishes window.__club as its install begins: the time of that write (its stage times count from there)
    Object.defineProperty(window, '__club', { configurable: true, enumerable: true, get() { return undefined; },
      set(v) { B.clubAt = performance.now(); Object.defineProperty(window, '__club', { value: v, writable: true, configurable: true, enumerable: true }); } });
  } catch { /* untapped: clubAt stays null */ }
  // first paint, as a page can know it: the first moment after the frame in which the app says a frame was delivered
  // (`__test.renderedFrames() > 0`). This tick is registered before any app script and re-registers itself first, so in
  // every animation frame it runs BEFORE the app's own callbacks. Each tick posts one message, whose task runs after that
  // frame's callbacks (the app's frame among them). fp.at = the earlier of: that task, or the next tick (when the next
  // frame came before the task could run); fp.lower = the tick of the frame that delivered. The delivery lies between
  // the two, and whatever the app starts one frame after first paint (the leaf's request) starts after fp.at.
  const delivered = () => { try { return window.__test && typeof window.__test.renderedFrames === 'function' ? window.__test.renderedFrames() > 0 : false; } catch { return false; } };
  const ch = new MessageChannel();
  let lastTick = null;
  ch.port1.onmessage = (e) => { if (B.fp.at === null && delivered()) { B.fp.at = performance.now(); B.fp.lower = e.data; B.fp.how = 'task'; } };
  function tick() {
    if (B.fp.at !== null) return;
    const t = performance.now();
    if (delivered()) { B.fp.at = t; B.fp.lower = lastTick; B.fp.how = 'tick'; return; }
    lastTick = t; ch.port2.postMessage(t); requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
/** The hall at rest, in ONE task of the page: the scene's own buffer (the chain's first pass alone, off screen) and the
 * six faces of the app's reflection cube, each read as it is stored and counted for texels that are not finite; then one
 * frame of the app's own chain to the canvas and the picture probe's signature of it (six rows). A buffer that cannot be
 * read says so (`read: false`). Every switch is put back before the task ends. */
function pageRest(STRIPS, BINS) {
  const out = { s: null, scene: null, cube: null, seated: null, err: null };
  try {
    const D = window.__dbg, r = D.renderer, c = D.composer, g = r.getContext(), was = r.getRenderTarget();
    // three's type codes: 1016 = a half float per channel (an exponent of all ones is an infinity or a NaN), 1015 = a float
    const counted = (rt, face) => {
      const w = rt.width, h = rt.height, type = rt.texture.type;
      if (type !== 1016 && type !== 1015) return { read: true, bad: 0, texels: w * h, type, why: 'not a float buffer: it cannot hold such a texel' };
      const half = type === 1016, mark = half ? 0xFFFF : -12345.5; // (a buffer the read left as it was made is "not read")
      const b = (half ? new Uint16Array(w * h * 4) : new Float32Array(w * h * 4)).fill(mark);
      r.readRenderTargetPixels(rt, 0, 0, w, h, b, face);
      let read = false;
      for (let i = 0; i < b.length && i < 4096; i++) if (b[i] !== mark) { read = true; break; }
      if (!read) return { read: false, bad: null, texels: w * h, type, why: 'the read-back left the buffer as it was made' };
      const no = half ? (v) => ((v >> 10) & 31) === 31 : (v) => !Number.isFinite(v);
      let bad = 0;
      for (let i = 0; i < b.length; i += 4) if (no(b[i]) || no(b[i + 1]) || no(b[i + 2])) bad += 1;
      return { read: true, bad, texels: w * h, type };
    };
    const keep = c.passes.map((p) => p.enabled), toScreen = c.renderToScreen;
    try {
      c.passes.forEach((p, i) => { if (i > 0) p.enabled = false; });
      c.renderToScreen = false;
      c.render();
      out.scene = counted(c.readBuffer);
    } finally { c.passes.forEach((p, i) => { p.enabled = keep[i]; }); c.renderToScreen = toScreen; }
    const q = D.cubeRT, faces = [];
    for (let f = 0; f < 6; f++) faces.push(counted(q, f));
    out.cube = { read: faces.every((x) => x.read === true), bad: faces.every((x) => x.read === true) ? faces.reduce((a, x) => a + x.bad, 0) : null, texels: faces.reduce((a, x) => a + x.texels, 0),
      type: faces[0].type, faces: faces.map((x) => x.bad), why: (faces.find((x) => x.read !== true) || {}).why };
    c.render();
    r.setRenderTarget(null);
    const w = g.drawingBufferWidth, h = g.drawingBufferHeight, row = new Uint8Array(w * 4), s = [];
    for (const fy of STRIPS) {
      g.readPixels(0, Math.min(h - 1, Math.max(0, Math.round((1 - fy) * h))), w, 1, 0x1908, 0x1401, row);
      for (let b = 0; b < BINS; b++) {
        const x0 = Math.floor((b * w) / BINS), x1 = Math.max(x0 + 1, Math.floor(((b + 1) * w) / BINS));
        let rr = 0, gg = 0, bb = 0;
        for (let x = x0; x < x1; x++) { rr += row[4 * x]; gg += row[4 * x + 1]; bb += row[4 * x + 2]; }
        s.push(Math.round(rr / (x1 - x0)), Math.round(gg / (x1 - x0)), Math.round(bb / (x1 - x0)));
      }
    }
    out.s = s;
    r.setRenderTarget(was);
    try { out.seated = window.__club.state().adopt.seated || 0; } catch (e) { out.seated = null; } // (a fact for the reader: the uniforms maps the leaf's adopter seated again in this boot)
  } catch (e) { out.err = String((e && e.message) || e); }
  return out;
}
/** Picture legs only: the signature of every PRESENTED picture (a task that drew to the canvas ends with one read of six
 * rows of the drawing buffer; equal pictures in a row are counted, not stored). It reads back each frame, so it is never
 * on while a pace is measured: it stops itself at the second picture after the leaf says ready, or when the suite says so. */
function pageFrames(STRIPS, BINS, auto) {
  // (`auto`: a hall boot; a failed stage's leaf says ready BEFORE the old room's dissolve, so those boots are stopped by the suite)
  const F = (window.__obLB.frames = { on: true, runs: [], seen: 0, err: [], readyRuns: 0, lastAt: 0 });
  const proto = HTMLCanvasElement.prototype, getCtx = proto.getContext;
  const grab = (g, canvas, bind) => {
    if (!F.on || !canvas.isConnected) return;
    const w = g.drawingBufferWidth, h = g.drawingBufferHeight;
    const gl2 = typeof WebGL2RenderingContext !== 'undefined' && g instanceof WebGL2RenderingContext;
    const prevRead = gl2 ? g.getParameter(0x8CAA) : null, prevPack = gl2 ? g.getParameter(0x88ED) : null;
    if (prevPack) g.bindBuffer(0x88EB, null);
    if (prevRead) bind.call(g, 0x8CA8, null);
    const row = new Uint8Array(w * 4), s = [];
    for (const fy of STRIPS) {
      g.readPixels(0, Math.min(h - 1, Math.max(0, Math.round((1 - fy) * h))), w, 1, 0x1908, 0x1401, row);
      for (let b = 0; b < BINS; b++) {
        const x0 = Math.floor((b * w) / BINS), x1 = Math.max(x0 + 1, Math.floor(((b + 1) * w) / BINS));
        let r = 0, gg = 0, bb = 0;
        for (let x = x0; x < x1; x++) { r += row[4 * x]; gg += row[4 * x + 1]; bb += row[4 * x + 2]; }
        s.push(Math.round(r / (x1 - x0)), Math.round(gg / (x1 - x0)), Math.round(bb / (x1 - x0)));
      }
    }
    if (prevRead) bind.call(g, 0x8CA8, prevRead);
    if (prevPack) g.bindBuffer(0x88EB, prevPack);
    const t = performance.now();
    F.seen += 1; F.lastAt = t;
    const prev = F.runs[F.runs.length - 1];
    let same = !!prev;
    if (prev) for (let k = 0; k < s.length; k++) if (prev.s[k] !== s[k]) { same = false; break; }
    if (same) { prev.n += 1; prev.t2 = t; } else if (F.runs.length < 1500) F.runs.push({ t, t2: t, n: 1, s });
    let ready = false;
    try { ready = !!(window.__club && window.__club.ready === true && window.__club.shown === true); } catch { ready = false; }
    if (ready && auto) { F.readyRuns += 1; if (F.readyRuns >= 2) F.on = false; }
  };
  proto.getContext = function (type, ...rest) {
    const g = getCtx.call(this, type, ...rest);
    try {
      if (g && (type === 'webgl2' || type === 'webgl') && !g.__obLB) {
        g.__obLB = true;
        const canvas = this, bind = g.bindFramebuffer;
        let fb = null, dirty = false;
        g.bindFramebuffer = function (target, f) { if (target === 0x8D40 || target === 0x8CA9) fb = f; return bind.call(g, target, f); };
        for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'blitFramebuffer', 'clear']) {
          const f = g[name];
          if (typeof f !== 'function') continue;
          g[name] = function (...a) {
            if (F.on && fb === null && !dirty) { dirty = true; Promise.resolve().then(() => { dirty = false; try { grab(g, canvas, bind); } catch (e) { if (F.err.length < 8) F.err.push(String(e)); } }); }
            return f.apply(g, a);
          };
        }
      }
    } catch (e) { F.err.push(String(e)); }
    return g;
  };
}
/** Leg 11's boots with the service worker only: the worker as its page sees it, on the page's own clock (the clock of
 * first paint). A real player's first visit registers the worker at `load`; a suite boot does only with ?sw=1.
 * registeredAtMs = register() resolved (the worker's script is in and its install has begun); installedAtMs and
 * activatedAtMs = its statechange to `installed` (the boot set is in the snapshot) and to `activated`; swept = every
 * { ob: 'swept' } the worker posts to its pages, by its `why`: 'activate' (the background fill's first turn runs inside
 * that same activation), 'client' (the answer to the page's own fill ask) and 'fill end' (the fill has ended or paused):
 * fillSeenAtMs = the first of them, fillEndAtMs = the first 'fill end'; recordAt = every write of the verdict record.
 * Listeners and two pass-through wrappers: nothing is asked of the worker, nothing it or the page does is changed. */
function pageWorker(key, fall) {
  const B = window.__obLB;
  const S = (B.sw = { registeredAtMs: null, installedAtMs: null, activatedAtMs: null, fillSeenAtMs: null, fillEndAtMs: null, states: [], swept: [], recordAt: [], err: [], fallAt: null, fallFrames: [] });
  // (`fall`, the slow visits only) the moment main says the hall could not be had (its one console line), and from then
  // on the time of every delivered frame (`__test.renderedFrames()` moved), 90 of them at most: the kept frame, the
  // dissolve, the old room. Nothing runs per frame before that moment.
  if (fall) {
    try {
      const warn = console.warn;
      console.warn = function (...a) {
        try {
          if (S.fallAt === null && typeof a[0] === 'string' && a[0].indexOf('the hall could not be had') >= 0) {
            S.fallAt = performance.now();
            const count = () => { try { return window.__test.renderedFrames(); } catch (e) { return -1; } };
            let seen = count();
            const tick = () => { const n = count(); if (n !== seen) { seen = n; S.fallFrames.push([Math.round(performance.now() * 10) / 10, n]); } if (S.fallFrames.length < 90) requestAnimationFrame(tick); };
            requestAnimationFrame(tick);
          }
        } catch (e) { /* the tap never throws into the page */ }
        return warn.apply(this, a);
      };
    } catch (e) { S.err.push(String(e)); }
  }
  try {
    const C = navigator.serviceWorker, proto = Object.getPrototypeOf(C), register = proto.register, seen = new WeakSet();
    const note = (w) => {
      const t = performance.now(), st = w.state;
      if (S.states.length < 12) S.states.push([st, Math.round(t)]);
      if (st === 'installed' && S.installedAtMs === null) S.installedAtMs = t;
      if (st === 'activated' && S.activatedAtMs === null) S.activatedAtMs = t;
    };
    const watch = (w) => { if (!w || seen.has(w)) return; seen.add(w); note(w); w.addEventListener('statechange', () => note(w)); };
    proto.register = function (...a) {
      const p = register.apply(this, a);
      p.then((reg) => {
        if (S.registeredAtMs === null) S.registeredAtMs = performance.now();
        watch(reg.installing || reg.waiting || reg.active);
        reg.addEventListener('updatefound', () => watch(reg.installing));
      }, (e) => { if (S.err.length < 4) S.err.push(`register: ${String(e)}`); });
      return p;
    };
    C.addEventListener('message', (e) => {
      const d = e.data;
      if (!d || d.ob !== 'swept') return;
      const t = performance.now();
      if (S.swept.length < 12) S.swept.push([String(d.why), Math.round(t)]);
      if (S.fillSeenAtMs === null) S.fillSeenAtMs = t;
      if (d.why === 'fill end' && S.fillEndAtMs === null) S.fillEndAtMs = t;
    });
  } catch (e) { S.err.push(String(e)); }
  try {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === key && S.recordAt.length < 8) S.recordAt.push(performance.now()); return set.call(this, k, v); };
  } catch (e) { S.err.push(String(e)); }
}
/** Leg 12's boots only: what the page thread did around the reveal, on the page's clock. Every boot: each task of 50 ms
 * or more as the browser reports it (a PerformanceObserver of `longtask`: [start, duration]) and each gap of 50 ms or
 * more between two animation frames (a tick registered before the app's own: [the earlier tick, the gap]). With `tap`
 * (the `gl` boot): every call of the WebGL context is timed in passing (two clock reads around the call, which runs
 * unchanged with its own arguments and result): the calls and their time by name; each call of `slowMs` or more as
 * [start, ms, name, the program its first argument names, the program in use, the framebuffer bound (0 = the canvas)],
 * programs by their row in `links`; every linkProgram as [start, the sources' SHADER_NAME, the two sources' lengths];
 * `of(program)` = a WebGLProgram's row in `links`. Nothing the page draws is changed; the tap's own cost is in that
 * boot's numbers, which is why the other boots of a set run without it. */
function pageReveal(tap, slowMs) {
  const B = window.__obLB;
  const R = (B.reveal = { tasks: [], gaps: [], frames: 0, err: [], gl: null });
  const t1 = (x) => Math.round(x * 10) / 10;
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (R.tasks.length < 600) R.tasks.push([t1(e.startTime), t1(e.duration)]); }).observe({ type: 'longtask', buffered: true });
  } catch (e) { R.err.push(`longtask: ${String(e)}`); }
  let lastTick = null;
  const tick = () => {
    const t = performance.now();
    R.frames += 1;
    if (lastTick !== null && t - lastTick >= 50 && R.gaps.length < 600) R.gaps.push([t1(lastTick), t1(t - lastTick)]);
    lastTick = t; requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  if (!tap) return;
  const G = (R.gl = { calls: 0, ms: 0, by: {}, slow: [], dropped: 0, links: [], series: [], err: [], of: null }); // series[k] = [calls, ms] begun in the k-th quarter second
  const KIND = { useProgram: 1, bindFramebuffer: 2, shaderSource: 3, attachShader: 4, linkProgram: 5, getProgramParameter: 6, getProgramInfoLog: 6, getUniformLocation: 6,
    getActiveUniform: 6, getActiveAttrib: 6, getAttribLocation: 6, getUniformBlockIndex: 6, getActiveUniforms: 6, getActiveUniformBlockParameter: 6, uniformBlockBinding: 6, validateProgram: 6 };
  const proto = HTMLCanvasElement.prototype, getCtx = proto.getContext;
  proto.getContext = function (type, ...rest) {
    const g = getCtx.call(this, type, ...rest);
    try {
      if (g && (type === 'webgl2' || type === 'webgl') && !g.__obTap) {
        g.__obTap = true;
        const progs = new WeakMap(), shaders = new WeakMap(), fbs = new WeakMap();
        let cur = -1, fb = 0, fbN = 0;
        const row = (p) => { const x = p ? progs.get(p) : undefined; return x && x.i !== undefined ? x.i : -1; };
        const entry = (p) => { let x = progs.get(p); if (!x) { x = { sh: [], i: undefined }; progs.set(p, x); } return x; };
        G.of = row;
        const names = [];
        for (const k in g) { try { if (typeof g[k] === 'function') names.push(k); } catch (e) { /* a getter that throws: not a call */ } }
        for (const name of names) {
          const f = g[name], kind = KIND[name] || 0, slot = (G.by[name] = [0, 0, 0]);
          g[name] = function (...a) {
            const t = performance.now();
            let out;
            try { out = f.apply(g, a); } finally {
              const d = performance.now() - t;
              G.calls += 1; G.ms += d; slot[0] += 1; slot[1] += d; if (d > slot[2]) slot[2] = d;
              const q = Math.floor(t / 250), cell = G.series[q] || (G.series[q] = [0, 0]);
              cell[0] += 1; cell[1] += d;
              let named = -1;
              if (kind) {
                try {
                  if (kind === 1) cur = row(a[0]);
                  else if (kind === 2) { if (a[0] === 0x8D40 || a[0] === 0x8CA9) { if (!a[1]) fb = 0; else { let n = fbs.get(a[1]); if (n === undefined) { fbN += 1; n = fbN; fbs.set(a[1], n); } fb = n; } } }
                  else if (kind === 3) { const src = String(a[1]), m = /#define SHADER_NAME (\S+)/.exec(src); shaders.set(a[0], { name: m ? m[1] : null, len: src.length }); }
                  else if (kind === 4) entry(a[0]).sh.push(shaders.get(a[1]) || null);
                  else if (kind === 5) { const x = entry(a[0]), s0 = x.sh[0] || {}, s1 = x.sh[1] || {}; x.i = G.links.length; named = x.i; G.links.push([t1(t), s0.name || s1.name || null, s0.len || 0, s1.len || 0]); }
                  else named = row(a[0]);
                } catch (e) { if (G.err.length < 8) G.err.push(`${name}: ${String(e)}`); }
              }
              if (d >= slowMs) { if (G.slow.length < 4000) G.slow.push([t1(t), t1(d), name, named, cur, fb]); else G.dropped += 1; }
            }
            return out;
          };
        }
      }
    } catch (e) { G.err.push(String(e)); }
    return g;
  };
}
/** Leg 12: the reveal facts of a page in one evaluation; with the tap, the renderer's own program list (name, cache key,
 * times used) joined to the tap's linkProgram rows; with the picture probe, how many pictures it read. */
function pageRevealRead() {
  const B = window.__obLB || null, R = B && B.reveal;
  if (!R) return null;
  const G = R.gl, r10 = (x) => Math.round(x * 10) / 10;
  let programs = [];
  if (G) {
    try { programs = (window.__dbg.renderer.info.programs || []).map((p) => ({ id: p.id, name: p.name ? String(p.name) : `(${String(p.type)})`, used: p.usedTimes, key: String(p.cacheKey), link: G.of ? G.of(p.program) : -1 })); } catch (e) { G.err.push(`programs: ${String(e)}`); }
  }
  return { now: performance.now(), tasks: R.tasks, gaps: R.gaps, frames: R.frames, err: R.err,
    pictures: B.frames ? { seen: B.frames.seen, runs: B.frames.runs.length, err: B.frames.err } : null,
    gl: G ? { calls: G.calls, ms: G.ms, by: Object.keys(G.by).filter((k) => G.by[k][0] > 0).map((k) => [k, G.by[k][0], r10(G.by[k][1]), r10(G.by[k][2])]), slow: G.slow, dropped: G.dropped, links: G.links, err: G.err, programs,
      series: G.series.map((c, k) => (c ? [k, c[0], r10(c[1])] : null)).filter(Boolean) } : null };
}
/** Leg 13's bench, in the page, once the hall stands at rest: what `composer.render()` costs as built and with one thing
 * off, each row `n` renders in a row after `warm` unmeasured ones. cpuMs = the page thread's time to issue one render;
 * totalMs = per render, until the renderer has finished them all (a read-back of one pixel of the canvas waits for it).
 * The switches: a pass of the composer disabled (the lens `club.dof`, the app's bloom, `club.grade`), the room's group
 * hidden whole and then its first `parts` children one at a time, the app's own `__test.renderQuality` (multisampling
 * 0; half the pixel ratio). Every switch is put back in the
 * row that made it; `as built again` says whether the measure drifted. The app's own frames do not run meanwhile (one
 * task), so the lens stands as the last frame left it. -> { rows: [{ name, cpuMs, totalMs }], passes, quality, post, err }. */
function pageBench(n, warm, parts) {
  const out = { rows: [], passes: [], quality: null, post: null, err: [] };
  const r2 = (x) => Math.round(x * 100) / 100;
  try {
    const D = window.__dbg, r = D.renderer, composer = D.composer, gl = r.getContext(), club = window.__club, T = window.__test;
    const px = new Uint8Array(4);
    const sync = () => { r.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    const run = (name) => {
      try {
        for (let i = 0; i < warm; i++) composer.render();
        sync();
        const t0 = performance.now();
        for (let i = 0; i < n; i++) composer.render();
        const t1 = performance.now();
        sync();
        const t2 = performance.now();
        out.rows.push({ name, cpuMs: r2((t1 - t0) / n), totalMs: r2((t2 - t0) / n) });
      } catch (e) { out.err.push(`${name}: ${String(e)}`); }
    };
    const label = (p) => String(p.name || (p.constructor && p.constructor.name) || '?');
    out.passes = composer.passes.map((p) => [label(p), p.enabled !== false]);
    try { out.post = club && club.post && typeof club.post.counts === 'function' ? JSON.parse(JSON.stringify(club.post.counts())) : null; } catch (e) { out.err.push(`post.counts: ${String(e)}`); }
    const pass = (name) => composer.passes.find((p) => label(p) === name) || null;
    const bloom = (composer.__obCine && composer.__obCine.bloom) || pass('UnrealBloomPass');
    const without = (name, list, also = null) => { // one row with these passes off (and `also` done), then all of it put back
      const live = list.filter((p) => p && p.enabled !== false);
      if (!live.length && !also) { out.err.push(`${name}: nothing to switch off`); return; }
      let undo = null;
      try { for (const p of live) p.enabled = false; if (also) undo = also(); run(name); } finally { for (const p of live) p.enabled = true; if (typeof undo === 'function') undo(); }
    };
    const room = club && club.room && club.room.group ? club.room.group : null;
    const hidden = (o) => () => { const was = o.visible; o.visible = false; return () => { o.visible = was; }; };
    const post3 = () => [pass('club.dof'), bloom, pass('club.grade')];
    run('as built');
    without('without the lens (club.dof)', [pass('club.dof')]);
    without('without the bloom', [bloom]);
    without('without the grade (club.grade)', [pass('club.grade')]);
    without('without lens, bloom and grade', post3());
    if (room) {
      without('the room hidden', [], hidden(room));
      without('the room hidden, without lens, bloom and grade', post3(), hidden(room));
      // the room's own parts, one at a time (the first `parts` children of its group that are shown)
      const kids = (room.children || []).filter((o) => o && o.visible !== false).slice(0, parts);
      kids.forEach((o, k) => without(`the room's part ${k + 1} hidden (${o.name || o.type || 'unnamed'})`, [], hidden(o)));
    } else out.err.push('no room group to hide');
    if (T && typeof T.renderQuality === 'function') {
      const q0 = T.renderQuality({});
      out.quality = q0;
      try { T.renderQuality({ msaa: 0 }); run('no multisampling'); } finally { T.renderQuality({ msaa: q0.msaa }); }
      try { T.renderQuality({ scale: q0.scale / 2 }); run('half the pixel ratio (a quarter of the pixels)'); } finally { T.renderQuality({ scale: q0.scale }); }
    } else out.err.push('no __test.renderQuality');
    run('as built again');
  } catch (e) { out.err.push(String(e)); }
  return out;
}
/** Leg 13's second bench, registered before the app: every draw call of a WebGL2 context is counted in passing (the call
 * runs unchanged), and every animation frame is put on record as [the ms its callback ran, the draws since the one before], until `maxMs`
 * or until the suite stops it. */
function pageDraws(maxMs) {
  const B = window.__obLB || (window.__obLB = {});
  const D = (B.draws = { on: true, n: 0, frames: [], err: null });
  try {
    const P = window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype;
    if (P) {
      for (const k of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) {
        const f = P[k];
        if (typeof f !== 'function') continue;
        P[k] = function (...a) { D.n += 1; return f.apply(this, a); };
      }
    } else D.err = 'no WebGL2RenderingContext';
    let last = 0;
    const tick = () => {
      const t = performance.now(); // (the callback's own time: a frame's time stamp can be older than the moment it is delivered)
      D.frames.push([Math.round(t * 10) / 10, D.n - last]); last = D.n;
      if (D.on && t < maxMs && D.frames.length < 120000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  } catch (e) { D.err = String(e); }
}
/** Leg 13's second bench, in the page, the room at rest. Rows by key (`keys`): `composer.render()` n times in a row after `warm`
 * unmeasured ones (cpuMs / totalMs as in pageBench, and the draw calls one render issued) and, for the rows marked so,
 * PACED: one render per animation frame, `pacedN` intervals after `skip` unmeasured ones (their median, p95, least and
 * most, the share over 1.5 medians, and the draw calls a frame held). While a row is paced the app's own loop draws
 * nothing (its `composer.render` is a no-op for the row: a render of the bench wakes that loop, and two renders a frame
 * would be no frame of the app's); its frame hooks run as in any frame.
 * Every switch is put back inside its own row; `before` and `after` are the page's state around the whole bench. */
async function pageBench2(n, warm, pacedN, skip, keys) {
  const out = { rows: [], paced: [], before: null, after: null, err: [] };
  const r2 = (x) => Math.round(x * 100) / 100;
  try {
    const D = window.__dbg, r = D.renderer, composer = D.composer, gl = r.getContext(), T = window.__test;
    const px = new Uint8Array(4);
    const sync = () => { r.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    const label = (p) => String(p.name || (p.constructor && p.constructor.name) || '?');
    const pass = (name) => composer.passes.find((p) => label(p) === name) || null;
    const rts = [composer.renderTarget1, composer.renderTarget2];
    const bloom = (composer.__obCine && composer.__obCine.bloom) || null;
    const state = () => ({ passes: composer.passes.map((p) => [label(p), p.enabled !== false]), samples: rts.map((rt) => rt.samples), depthTextures: rts.map((rt) => !!rt.depthTexture),
      bloom: bloom ? bloom.strength : null, pixelRatio: r.getPixelRatio(), toScreen: composer.renderToScreen, ownRender: Object.prototype.hasOwnProperty.call(pass('RenderPass') || {}, 'render'),
      ownComposerRender: Object.prototype.hasOwnProperty.call(composer, 'render') });
    out.before = state();
    const draws = () => { const d = window.__obLB && window.__obLB.draws; return d ? d.n : 0; };
    const run = (key, name) => {
      for (let i = 0; i < warm; i++) composer.render();
      sync();
      const t0 = performance.now(), d0 = draws(), e0 = Date.now();
      for (let i = 0; i < n; i++) composer.render();
      const t1 = performance.now(), d1 = draws();
      sync();
      const t2 = performance.now();
      out.rows.push({ key, name, cpuMs: r2((t1 - t0) / n), totalMs: r2((t2 - t0) / n), draws: Math.round((d1 - d0) / n), at: [e0, Date.now()] }); // (at: the row's span on the wall clock, for samples taken beside it)
    };
    const paced = (key, name, render) => new Promise((done) => {
      const own = Object.prototype.hasOwnProperty.call(composer, 'render'), real = composer.render;
      composer.render = function () {}; // (the app's own loop draws nothing while the row is paced)
      const back = () => { if (own) composer.render = real; else delete composer.render; };
      const ts = [], d0 = draws(), e0 = Date.now();
      const step = () => {
        ts.push(performance.now()); // (the callback's own time, not the frame's time stamp)
        if (ts.length > skip + pacedN) { back(); done([ts, draws() - d0, e0, Date.now()]); return; }
        try { if (render) real.call(composer); } catch (e) { out.err.push(`${name}: ${String(e)}`); back(); done([ts, draws() - d0, e0, Date.now()]); return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }).then(([ts, dn, e0, e1]) => {
      const all = ts.slice(1).map((t, k) => t - ts[k]), iv = all.slice(skip).sort((a, b) => a - b);
      if (!iv.length) { out.err.push(`${name}: no paced interval`); return; }
      const q = (f) => iv[Math.min(iv.length - 1, Math.floor(f * iv.length))], med = q(0.5);
      out.paced.push({ key, name, frames: iv.length, median: r2(med), p95: r2(q(0.95)), least: r2(iv[0]), most: r2(iv[iv.length - 1]),
        over: r2(iv.filter((v) => v > 1.5 * med).length / iv.length), drawsPerFrame: Math.round(dn / all.length), at: [e0, e1] });
    });
    // the switches: each returns the function that puts it back, or null when there is nothing to change here
    const nothing = () => () => {};
    const A = () => {
      if (!rts.some((rt) => rt.depthTexture)) return null;
      const was = rts.map((rt) => [rt.depthTexture, rt.resolveDepthBuffer]);
      for (const rt of rts) { rt.depthTexture = null; rt.resolveDepthBuffer = false; rt.dispose(); } // (re-made without the attachment at their next use)
      return () => { rts.forEach((rt, k) => { rt.depthTexture = was[k][0]; rt.resolveDepthBuffer = was[k][1]; rt.dispose(); }); };
    };
    const B = () => {
      const rp = pass('RenderPass'), was = rts.map((rt) => rt.samples);
      if (!rp || !composer.copyPass || !(was[0] > 0)) return null;
      const own = Object.prototype.hasOwnProperty.call(rp, 'render'), orig = rp.render, ms = rts[0].clone(); // the scene's own multisampled target
      if (ms.depthTexture) { const dt = ms.depthTexture; ms.depthTexture = null; if (typeof dt.dispose === 'function') dt.dispose(); }
      ms.resolveDepthBuffer = false;
      for (const rt of rts) { rt.samples = 0; rt.dispose(); }
      rp.render = function (renderer, wb, rb, dt, mask) { orig.call(this, renderer, wb, ms, dt, mask); composer.copyPass.render(renderer, rb, ms, dt, mask); };
      return () => { if (own) rp.render = orig; else delete rp.render; rts.forEach((rt, k) => { rt.samples = was[k]; rt.dispose(); }); ms.dispose(); };
    };
    const both = (f, g) => () => { const u = f(); if (u === null) return null; const v = g(); if (v === null) { u(); return null; } return () => { v(); u(); }; };
    const bloom0 = () => { if (!bloom || !(bloom.strength > 0)) return null; const was = bloom.strength; bloom.strength = 0; return () => { bloom.strength = was; }; };
    const sceneOnly = () => {
      const ps = composer.passes.filter((p) => label(p) !== 'RenderPass' && p.enabled !== false), ts = composer.renderToScreen;
      for (const p of ps) p.enabled = false;
      composer.renderToScreen = false;
      return () => { for (const p of ps) p.enabled = true; composer.renderToScreen = ts; };
    };
    const passesOnly = () => { const rp = pass('RenderPass'); if (!rp || rp.enabled === false) return null; rp.enabled = false; return () => { rp.enabled = true; }; };
    const quality = (q) => () => {
      if (!T || typeof T.renderQuality !== 'function') return null;
      const q0 = T.renderQuality({});
      T.renderQuality(q(q0));
      return () => { T.renderQuality({ scale: q0.scale, msaa: q0.msaa }); };
    };
    // [the row's name, its switch (null = the bench draws nothing: the frames alone), also paced]
    const R = {
      asbuilt: ['as built', nothing, true],
      floor: ["no render by the bench (the frames the page gets while the bench draws nothing: the app's own loop, or none)", null, true],
      A: ["candidate A: the two depth textures off the composer's targets", A, true],
      B: ['candidate B: the scene alone multisampled (its own target, one copy), the passes on single-sample targets', B, true],
      AB: ['candidates A and B', both(A, B), true],
      bloom0: ["the bloom at strength 0 (the app's own skip: its blend is not drawn)", bloom0, false],
      scene: ['the scene pass alone (into its multisampled target, resolved; no pass after it, nothing to the screen)', sceneOnly, false],
      passes: ['the passes alone (no scene pass: the passes over the last scene)', passesOnly, false],
      two: ['two samples', quality(() => ({ msaa: 2 })), false],
      none: ['no multisampling', quality(() => ({ msaa: 0 })), true],
      half: ['half the pixel ratio (a quarter of the pixels)', quality((q0) => ({ scale: q0.scale / 2 })), false],
      again: ['as built again', nothing, true],
    };
    for (const key of keys) {
      const row = R[key];
      if (!row) continue;
      const [name, apply, alsoPaced] = row;
      if (apply === null) { if (pacedN > 0) await paced(key, name, false); continue; }
      let undo = null;
      try {
        undo = apply();
        if (undo === null) { out.err.push(`${name}: nothing to change here`); continue; }
        run(key, name);
        if (alsoPaced && pacedN > 0) await paced(key, name, true);
      } catch (e) { out.err.push(`${name}: ${String(e)}`); } finally {
        try { if (typeof undo === 'function') undo(); } catch (e) { out.err.push(`${name}: putting it back: ${String(e)}`); }
      }
    }
    out.after = state();
  } catch (e) { out.err.push(String(e)); }
  return out;
}
/** What a leg reads of a page, in one evaluation. `deep`: also the leaf's state() (a copy of everything: never while a pace is measured). */
function pageRead(key, deep) {
  const B = window.__obLB || null, t = window.__test || null;
  const rd = (f) => { try { return f(); } catch (e) { return { error: String(e) }; } };
  const leaf = rd(() => performance.getEntriesByType('resource').filter((e) => /\/scene\/club\/|\/assets\/club\//.test(e.name)));
  const nav = rd(() => performance.getEntriesByType('navigation')[0]);
  let club = null;
  if (deep) club = rd(() => { const k = window.__club; if (!k || typeof k.state !== 'function') return null; const st = k.state(); return { ready: st.ready, shown: st.shown, enabled: st.enabled, tier: st.tier, venue: st.venue, errors: st.errors, stage: (st.life && st.life.stage) || null, tierPick: st.life && st.life.tierPick }; });
  return {
    nonce: B ? B.nonce : null, onLine0: B ? B.onLine0 : null, fp: B ? B.fp : null, clubAt: B ? B.clubAt : null, announces: B ? B.announces : [],
    now: performance.now(), origin: performance.timeOrigin, swFacts: B ? B.sw || null : null,
    lookBoot: t ? t.lookBoot : null, bootLook: t ? t.bootLook : null, ready: !!t && t.ready === true, state: t ? rd(() => t.state()) : null, errors: t ? rd(() => t.errors.slice(0, 5)) : null,
    record: rd(() => localStorage.getItem(key)), settings: rd(() => localStorage.getItem('ob-settings-v1')),
    online: navigator.onLine, clubDefined: rd(() => window.__club !== undefined), clubReady: rd(() => !!(window.__club && window.__club.ready === true)), clubShown: rd(() => !!(window.__club && window.__club.ready === true && window.__club.shown === true)),
    club, leafCount: Array.isArray(leaf) ? leaf.length : null, leafFirstAt: Array.isArray(leaf) && leaf.length ? Math.min(...leaf.map((e) => e.startTime)) : null,
    history: history.length, referrer: document.referrer, navType: nav && nav.type, href: location.href,
    sw: rd(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller)),
    gi: rd(() => (window.__gi && window.__gi.state ? window.__gi.state.look : null)),
    renderer: rd(() => { const g = window.__dbg.renderer.getContext(); const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); }),
    ua: navigator.userAgent, dpr: window.devicePixelRatio, size: [innerWidth, innerHeight],
  };
}
const call = (fn, ...args) => `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(', ')})`;

// ---- sessions and boots ------------------------------------------------------------------------------------------------------------
const LEAF = /\/scene\/club\/|\/assets\/club\//;
const Q = (extra = '') => { const parts = [DEV ? 'clubtier=base' : '', extra].filter(Boolean); return parts.length ? `?${parts.join('&')}` : ''; };
const HALLQ = DEV ? 'clubtimeout=120000' : ''; // (development switch) the tool's service budget, for boots that wait for the hall
// (development switch) legs 5e and 5f plant a budget of the LEAF, which needs the leaf to run: under software GL the page
// thread needs most of main's 25 s to run the leaf's entry alone (seen: the bound fired first), so those two legs take a
// service budget of 30 s there. On a GPU nothing is added: the budgets are the product's.
const LEAFMS = DEV ? 30000 : 0, LEAFQ = DEV ? `clubtimeout=${LEAFMS}` : '';
const appUrl = (extra = '') => `${ORIGIN}/app.html${Q(extra)}`;
const left = () => DEADLINE - Date.now();
async function until(what, ms, test, step = T.step) {
  const end = Math.min(Date.now() + ms, DEADLINE);
  for (;;) {
    let v = null;
    try { v = await test(); } catch { v = null; /* navigating */ }
    if (v) return v;
    if (Date.now() >= end) throw new Error(`${what}: not within ${Math.round(ms / 1000)} s${left() <= 0 ? ' (the suite\'s own deadline)' : ''}`);
    await sleep(step);
  }
}
let nonce = 0;
let pinLine = null;
const open = [];
/** The tally of a session's requests (pure; `--selftest` plants its reds). A request belongs to the document that made it
 * (the event's `loaderId`). The Document request names the current document and empties the lists: its requests are
 * counted from there. A request under the leaf's paths made by ANOTHER document (the page on its way out: a held request
 * let go, a module read late) is SET ASIDE in `s.late` with its URL, its document and its clock; it is not this page's
 * ask and is not counted for it. A request that names no document is counted (fail closed). */
function tallyRequest(s, p) {
  if (p.type === 'Document' && !p.redirectResponse) { s.leaf = []; s.late = []; s.reqs = new Map(); s.doc = p.loaderId || null; s.docAt = Number.isFinite(p.timestamp) ? p.timestamp : null; }
  const r = { url: p.request.url, leaf: LEAF.test(p.request.url), cached: false, status: null, bytes: 0, done: false, failed: null, doc: p.loaderId || null, at: Number.isFinite(p.timestamp) ? p.timestamp : null };
  s.reqs.set(p.requestId, r);
  if (!r.leaf) return r;
  if (r.doc !== null && s.doc !== null && r.doc !== s.doc) s.late.push(r); else s.leaf.push(r);
  return r;
}
/** One browser, a fresh profile. `pin`: the launcher's old-room pin (default OFF here). `headed`: a visible window of
 * the installed browser instead of the pinned headless shell (the launcher's own headed mode). It starts on the origin's root,
 * so the suite's page scripts are registered before app.html ever parses (the first-frame arm's recipe). */
async function session({ pin = false, direct = null, headed = false } = {}) {
  const said = [], err = console.error;
  console.error = (...a) => { said.push(a.join(' ')); err(...a); };
  let c;
  try { c = await launchChrome(direct ?? `${ORIGIN}/`, { port: CDP_PORT, tool: false, lookPin: pin, width: W, height: H, ...(headed ? { headless: false } : {}) }); } finally { console.error = err; } // (`headed`: leg 14 with --headed alone)
  for (const l of said) if (l.startsWith('[launch] look pin')) pinLine = l; // (the launcher says the pin's state once per process and again when a launch changes it)
  const s = { c, said, pin, pinLine, console: [], leaf: [], late: [], doc: null, docAt: null, reqs: new Map(), scripts: [], held: [], onPaused: null };
  c.onEvent((m, p) => {
    if (m === 'Runtime.consoleAPICalled' && (p.type === 'warning' || p.type === 'error')) s.console.push(`${p.type}: ${(p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400)}`);
    else if (m === 'Runtime.exceptionThrown') s.console.push(`uncaught: ${(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? '').slice(0, 400)}`);
    else if (m === 'Network.requestWillBeSent') tallyRequest(s, p);
    else if (m === 'Network.requestServedFromCache') { const r = s.reqs.get(p.requestId); if (r) r.cached = true; } else if (m === 'Network.responseReceived') {
      const r = s.reqs.get(p.requestId);
      if (r) { r.status = p.response.status; if (p.response.fromDiskCache || p.response.fromPrefetchCache) r.cached = true; r.sw = p.response.fromServiceWorker === true; }
    } else if (m === 'Network.loadingFinished') { const r = s.reqs.get(p.requestId); if (r) { r.bytes = p.encodedDataLength; r.done = true; } } else if (m === 'Network.loadingFailed') {
      const r = s.reqs.get(p.requestId); if (r) { r.failed = p.errorText || 'failed'; r.done = true; }
    } else if (m === 'Fetch.requestPaused' && s.onPaused) s.onPaused(p);
    else if (m === 'Page.frameNavigated' && !p.frame?.parentId && s.offline) c.send('Network.emulateNetworkConditions', s.offline).catch(() => {}); // (leg 9: a new document keeps the offline flag)
  });
  await c.send('Network.enable');
  await c.send('Page.enable');
  s.close = async () => { const k = open.indexOf(s); if (k >= 0) open.splice(k, 1); try { await c.closeAndWait(); } catch { /* gone */ } };
  open.push(s);
  return s;
}
/** Register the page scripts for the NEXT document (a new nonce) and forget the last ones. */
async function arm(s, { frames = false, seed = null, worker = false, reveal = false, draws = false } = {}) {
  for (const id of s.scripts.splice(0)) await s.c.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: id }).catch(() => {});
  nonce += 1;
  const add = async (source) => { s.scripts.push((await s.c.send('Page.addScriptToEvaluateOnNewDocument', { source })).identifier); };
  await add(call(pageFacts, nonce));
  if (frames) await add(call(pageFrames, STRIPS, BINS, frames === 'hall')); // frames: 'hall' (stops itself at the hall) | 'lit' (the suite stops it on the lit old room)
  if (seed) await add(seed);
  if (worker) await add(call(pageWorker, KEY, worker === 'fall')); // (leg 11's boots with the service worker and its slow visits only)
  if (reveal) await add(call(pageReveal, reveal === 'gl', GL_SLOW_MS)); // (leg 12's boots only; 'gl' = with the WebGL tap)
  if (draws) await add(call(pageDraws, DEV ? 900000 : 60000)); // (leg 13's second bench only: the draw calls counted, each frame on record)
  return nonce;
}
const read = (s, deep = false) => s.c.eval(call(pageRead, KEY, deep));
/** The new document has painted its first frame. */
async function painted(s, n, what = 'first paint') {
  await until(what, T.paint, () => s.c.eval(`!!(window.__obLB && window.__obLB.nonce === ${n} && window.__obLB.fp.at !== null)`));
  return read(s);
}
/** A boot: `go` = a URL to navigate to, 'reload', or a function that makes the page reload itself. */
async function boot(s, go, opts = {}) {
  const n = await arm(s, opts);
  if (typeof go === 'function') await go(); else if (go === 'reload') await s.c.send('Page.reload'); else await s.c.send('Page.navigate', { url: go });
  return painted(s, n);
}
/** The hall is on screen: the leaf says ready (its install has ended: on a stage boot, the dissolve) AND shown. A failed
 * stage's leaf says ready too, with `shown` false, before the old room's dissolve begins: that is thrown here by name. */
async function hall(s, what = 'the hall') {
  await until(what, T.hall, () => s.c.eval('!!(window.__club && window.__club.ready === true)'), DEV ? 1000 : 150);
  const r = await read(s, true);
  if (r.club?.shown !== true) throw new Error(`${what}: the leaf ended without showing the hall (stage ${J({ phase: r.club?.stage?.phase, failed: r.club?.stage?.failed })}; leaf errors ${J(r.club?.errors?.slice?.(0, 2))})`);
  await notePrograms(s, what);
  return r;
}
/** The renderer's live programs, in the page: [{ id, type, name, used, key }], or null where the page has no renderer to ask. */
function pagePrograms() {
  try { return (window.__dbg.renderer.info.programs || []).map((p) => ({ id: p.id, type: String(p.type), name: p.name ? String(p.name) : '', used: p.usedTimes, key: String(p.cacheKey) })); } catch (e) { return null; }
}
/** A boot's program list against the baseline: { count, digest, same, list }. `digest`: of the sorted type, name and key of
 * every program (two boots with one digest hold the same programs, whatever their order and ids). `same`: a baseline is set
 * and the count is its number. `list` is kept, for --out, only when not `same`. A page that gave no list: count null. Pure. */
function judgePrograms(list, baseline = PROGRAMS_BASELINE) {
  if (!Array.isArray(list)) return { count: null, digest: null, same: false, list: null };
  const digest = createHash('sha256').update(list.map((p) => `${p.type}|${p.name}|${p.key}`).sort().join('\n')).digest('hex').slice(0, 8);
  const same = Number.isFinite(baseline) && list.length === baseline;
  return { count: list.length, digest, same, list: same ? null : list };
}
/** The hall's program count of this boot: one INFO line and one row of --out (PROGRAMS, in the header). Never a verdict, never a throw. */
async function notePrograms(s, what) {
  try {
    const j = judgePrograms(await s.c.eval(call(pagePrograms)));
    out.programs.push({ leg: legNow, at: what, baseline: PROGRAMS_BASELINE, ...j });
    info(j.count === null ? `programs at "${what}": the page gave no list` : `programs at "${what}": ${j.count} (keys ${j.digest})${PROGRAMS_BASELINE === null ? '; no baseline is set: the list goes to --out' : (j.same ? '; the baseline\'s count' : `; NOT the baseline's ${PROGRAMS_BASELINE}: the list follows, and goes to --out`)}`);
    if (PROGRAMS_BASELINE !== null && !j.same && j.list) for (const p of j.list) info(`  program ${p.id} ${p.type}${p.name ? ` "${p.name}"` : ''} used ${p.used} key ${createHash('sha256').update(p.key).digest('hex').slice(0, 8)}`);
  } catch (e) { info(`programs at "${what}": not read (${String(e?.message ?? e).slice(0, 120)})`); }
}
/** Leg 6d's read after a DECLINED reload offer on the light hall's page. Declining writes nothing. But that page has a
 * live record writer of its own: the light hall may hand its pace report while the offer is up, and main books it under
 * the member `lite` by its own rule (leg 6c's line). So the record is either the one read before, to the byte; or its own
 * fields (the standard hall's verdict) stand to the letter and the ONE new thing is a member `lite` that was not there,
 * while the leaf holds a pace report that names the tier `lite`. Anything else is the decline's doing. `before`, `after`:
 * the stored strings; `pace`: the leaf's handed pace facts (state().life.stage.pace) read WITH `after`, or null. Pure. */
function judgeDeclined(before, after, pace) {
  if (after === before) return { ok: true, booked: false, why: null };
  const obj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  let b = null, a = null;
  try { b = JSON.parse(before); a = JSON.parse(after); } catch { /* unreadable: no record, below */ }
  if (!obj(b) || !obj(a)) return { ok: false, booked: false, why: 'the record changed, and one of the two reads is no record' };
  const { lite: lite0, ...own0 } = b, { lite: lite1, ...own1 } = a;
  if (!eq(own0, own1)) return { ok: false, booked: false, why: "the record's own fields (the standard hall's verdict) changed" };
  if (lite0 !== undefined) return { ok: false, booked: false, why: 'a member `lite` that was there before the offer changed' };
  if (!obj(lite1)) return { ok: false, booked: false, why: 'the member `lite` is no rung' };
  if (!(obj(pace) && pace.tier === 'lite')) return { ok: false, booked: false, why: 'a member `lite` appeared, and the leaf holds no pace report of the light hall' };
  return { ok: true, booked: true, why: null };
}
/** The leaf's pace report (the hall's window of frames at rest has closed). The record is polled, not the leaf's state:
 * a state() copy every poll would itself slow the frames being measured. */
async function reported(s, before) {
  const t0 = Date.now();
  // (a GPU run: only the record is polled until the hall's window has had its time; the development run reads the state)
  if (!DEV) { try { await until('the report', T.report, async () => (await s.c.eval(`localStorage.getItem(${J(KEY)})`)) !== before, 250); } catch { /* no write: a report without a verdict, or none */ } }
  let r = await read(s, true);
  for (let i = 0; i < (DEV ? 30 : 12) && !r.club?.stage?.pace && left() > 20000; i++) { await sleep(DEV ? 2000 : 1000); r = await read(s, true); }
  r.reportWaitMs = Date.now() - t0;
  return r;
}
/** "The presented picture stands still": the last picture stayed the same (within 1 level rms: a GPU's frames of one
 * still scene may differ by a rounding) over T.restN presented pictures in a row, or no new one came for T.rest ms. */
function standing() {
  let ref = null, seen0 = 0;
  return (f) => {
    if (!f.s) return false;
    if (!ref || rms(ref, f.s) > 1) { ref = f.s; seen0 = f.seen; return false; }
    return f.seen - seen0 >= T.restN - 1 || f.quiet > T.rest;
  };
}
/** The presented pictures have reached their end and are at rest: the probe stopped itself (the hall), or, with `lit`
 * (the old room), the wall band is lit, the shell's camera has landed, and the picture stands still. Stops the probe
 * and returns its runs. */
async function pictures(s, ms, { lit = false } = {}) {
  const stands = standing();
  const st = await until('the pictures at rest', ms, async () => {
    const f = await s.c.eval(`(() => { const F = window.__obLB && window.__obLB.frames; if (!F) return null; const l = F.runs[F.runs.length - 1], h = window.__shell;
      return { on: F.on, runs: F.runs.length, seen: F.seen, s: l ? l.s : null, quiet: l ? performance.now() - F.lastAt : 0,
        still: (() => { try { return !h || !h.isOpen() || !h.moving(); } catch (e) { return true; } })() }; })()`);
    if (!f || !f.runs) return null;
    if (!f.on) return { on: false, runs: f.runs, seen: f.seen };
    const rest = stands(f);
    return lit && rest && f.still && wallMax(f.s) > PIC.dark ? { on: true, runs: f.runs, seen: f.seen } : null;
  });
  await s.c.eval('window.__obLB.frames.on = false');
  const F = await s.c.eval('(() => { const F = window.__obLB.frames; return { runs: F.runs, seen: F.seen, err: F.err }; })()');
  return { ...F, at: st };
}
const lookIs = (r, want) => eq(r.lookBoot, want);
const tierOf = (r) => r.lookBoot?.tier ?? null;
const rec = (r) => { try { return JSON.parse(r.record); } catch { return null; } };
const appOf = (r) => r.announces?.[r.announces.length - 1]?.app ?? null;
const warned = (s, re) => s.console.filter((l) => re.test(l));
const noLeaf = (s, r) => s.leaf.length === 0 && r.leafCount === 0 && r.clubDefined === false;
/** The requests the tally set aside for this document: each with its URL, the document that made it, the current
 * document, and its clock in ms after the current document's own request. */
const lateSaid = (s) => s.late.map((q) => ({ url: q.url.replace(ORIGIN, ''), doc: q.doc, ms: q.at !== null && s.docAt !== null ? Math.round((q.at - s.docAt) * 1000) : null, thisDoc: s.doc }));
/** What a "no leaf request" check counted and what it set aside (the URLs), for its line. */
const leafSaid = (s) => ({ counted: s.leaf.map((q) => q.url.replace(ORIGIN, '')), setAside: lateSaid(s) });
/** After a "no leaf request" check: the requests of the document before that were set aside, by name (`always`: the line
 * is printed with none too). */
const saidLate = (s, what, always = false) => {
  if (s.late.length || always) info(`${what}: ${s.late.length} request(s) under the leaf's paths made by the document before were set aside, not counted${s.late.length ? `: ${J(lateSaid(s))}` : ''}`);
};
/** The planted red of a boot that must not ask: the page itself asks for one file under the leaf's paths, and the tally
 * must count exactly that one, as this document's. (A tally that set a real ask aside, or lost it, would pass a boot
 * that asks for the hall.) The file is the leaf's tier table: fetched as text, nothing of the leaf runs. */
async function plantedAsk(s, what) {
  const before = s.leaf.length, url = `${ORIGIN}/scene/club/tiers.js?planted=1`;
  const got = await s.c.eval(`fetch(${J(url)}, { cache: 'no-store' }).then((r) => r.status, (e) => 'failed: ' + e)`);
  try { await until(`${what}: the planted ask in the tally`, T.paint, async () => s.leaf.some((q) => q.url === url) || s.late.some((q) => q.url === url)); } catch { /* the check below says it */ }
  const mine = s.leaf.filter((q) => q.url === url);
  check(`${what}: planted red: an ask by this document is counted (exactly one more request under the leaf's paths, of the current document)`,
    s.leaf.length === before + 1 && mine.length === 1 && (mine[0].doc === null || mine[0].doc === s.doc) && !s.late.some((q) => q.url === url), J({ answered: got, before, ...leafSaid(s) }));
  info(`${what}: the planted ask was answered ${J(got)}; the request names the document ${J(mine[0]?.doc ?? null)}, the current document is ${J(s.doc)}`);
}

/** The hall some seconds after the reveal: REST.ms and REST.frames delivered frames later (or REST.maxMs), read by pageRest.
 * `wait: false` reads at once (a boot that has already run on to its pace report). */
async function hallAtRest(s, { wait = true, name = 'leg2' } = {}) {
  const frames = () => s.c.eval("window.__test && typeof window.__test.renderedFrames === 'function' ? window.__test.renderedFrames() : null");
  const t0 = Date.now(), f0 = await frames();
  let f = f0;
  while (wait && Date.now() - t0 < REST.maxMs && left() > 15000) {
    await sleep(DEV ? 1000 : 250);
    f = await frames();
    if (Date.now() - t0 >= REST.ms && (f0 === null || f - f0 >= REST.frames)) break;
  }
  const r = await s.c.eval(call(pageRest, STRIPS, BINS));
  let still = null;
  if (RESTSTILL) { // the page as a player sees it at that moment (the browser's own screenshot), for whoever reads the run
    const file = RESTSTILL.replace(/(\.[^./\\]+)?$/, `-${name}$1`);
    try { const shot = await s.c.send('Page.captureScreenshot', { format: 'jpeg', quality: 85 }); fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(file, Buffer.from(shot.data, 'base64')); still = file; }
    catch (e) { still = `not written (${String(e?.message ?? e).slice(0, 160)})`; }
  }
  return { ...(r ?? { err: 'the page gave no answer' }), waitedMs: Date.now() - t0, framesSince: f0 === null || f === null ? null : f - f0, still };
}

// the old room's own picture at rest, taken once per run from a boot under the launcher's pin (a real product state)
let oldRefMemo = null;
async function oldRef() {
  if (oldRefMemo) return oldRefMemo;
  if (OLDREF && fs.existsSync(OLDREF)) {
    const kept = JSON.parse(fs.readFileSync(OLDREF, 'utf8'));
    if (eq(kept.viewport, [W, H]) && eq(kept.strips, STRIPS) && kept.bins === BINS) { oldRefMemo = { ...kept, fromFile: OLDREF }; return oldRefMemo; }
  }
  const s = await session({ pin: true });
  try {
    const r = await boot(s, appUrl(), { frames: 'lit' });
    await until('the old room ready', T.paint, () => s.c.eval('window.__test?.ready === true'));
    const p = await pictures(s, T.paint, { lit: true });
    const walls = p.runs.map((x) => wallMax(x.s));
    oldRefMemo = { s: p.runs[p.runs.length - 1].s, lookBoot: r.lookBoot, frames: p.seen, minWall: Math.min(...walls), walls, viewport: [W, H], strips: STRIPS, bins: BINS };
    if (OLDREF) { fs.mkdirSync(path.dirname(path.resolve(OLDREF)), { recursive: true }); fs.writeFileSync(OLDREF, JSON.stringify(oldRefMemo)); }
    return oldRefMemo;
  } finally { await s.close(); }
}

// ---- the legs ----------------------------------------------------------------------------------------------------------------------
const legs = {};

legs['1'] = async () => {
  const s = await session();
  try {
    const r = await boot(s, appUrl());
    out.device = { from: 'the first boot of leg 1: WEBGL_debug_renderer_info through __dbg.renderer, __test.lookBoot, navigator', renderer: r.renderer, tier: tierOf(r), lookBoot: r.lookBoot, ua: r.ua, dpr: r.dpr, size: r.size };
    info(`renderer "${r.renderer}"; __test.lookBoot ${J(r.lookBoot)}; dpr ${r.dpr}, ${r.size?.join('x')}`);
    const passing = r.lookBoot?.tier === 'base' || r.lookBoot?.tier === 'high';
    if (!passing && !DEV) {
      check(`this device is a passing device (the boot rules gave tier '${r.lookBoot?.tier}', why '${r.lookBoot?.why}')`, false,
        'the hall is never shown here, so its legs cannot run: this suite belongs on a GPU host (the self-hosted runner). To DEVELOP it under software GL set OB_LOOKBOOT_DEV=1');
      return 'stop';
    }
    check(`the boot rules gave a passing tier${DEV ? ' (forced by OB_LOOKBOOT_DEV: clubtier=base)' : ''}`, passing, J(r.lookBoot));
    out.legs['1'] = { lookBoot: r.lookBoot, renderer: r.renderer };
  } finally { await s.close(); }
  return null;
};

legs['2'] = async () => {
  const ref = await oldRef();
  info(`the old room's own pictures (a boot under the launcher's pin, ${J(ref.lookBoot?.why)}): ${ref.frames} presented, the wall band's brightest bin never under ${ref.minWall} (a dark bin is <= ${PIC.dark})`);
  // (exactly the judge's own line between "stage" and "not the stage", over every picture of the old room's boot, its camera's fly-in included)
  check(`no old-room picture could pass as a stage picture: in every one the wall band's brightest bin is over ${PIC.dark}`, ref.minWall > PIC.dark, `the darkest old-room picture reads ${ref.minWall}`);
  const s = await session();
  try {
    const r0 = await boot(s, appUrl(HALLQ), { frames: 'hall' });
    const tier = tierOf(r0);
    check(`lookBoot is { default, hall, stage, ${tier}, pass-new } on a fresh profile`, lookIs(r0, { asked: 'default', shown: 'hall', flow: 'stage', tier, why: 'pass-new' }), J(r0.lookBoot));
    check("bootLook stays 'tournament'", r0.bootLook === 'tournament', String(r0.bootLook));
    const r = await hall(s);
    const st = r.club?.stage ?? {};
    check('no leaf URL was asked for before first paint', r.leafFirstAt !== null && r.fp.at !== null && r.leafFirstAt >= r.fp.at, `first leaf request at ${r.leafFirstAt?.toFixed?.(1)} ms, first paint at ${r.fp.at?.toFixed?.(1)} ms (its frame began at ${r.fp.lower?.toFixed?.(1)})`);
    info(`first paint ${r.fp.at?.toFixed?.(0)} ms; first leaf request ${r.leafFirstAt?.toFixed?.(0)} ms; ${r.leafCount} leaf files; the leaf's install began at ${r.clubAt?.toFixed?.(0)} ms`);
    check("the leaf's stage ended on the hall", st.phase === 'hall' && st.failed === null && r.club.tier === tier, J({ phase: st.phase, failed: st.failed, tier: r.club?.tier }));
    check('the hall was quiet at the reveal (settled before the one dissolve)', st.quietAtReveal === true, J({ quietAtReveal: st.quietAtReveal, unquiet: st.unquiet, rest: st.rest }));
    const links = judgeSwapLinks(st);
    check("no program was first linked inside the swap's task (the leaf's own count: the warm compiled the hall as the swap's capture draws it)", links.ok, links.why ?? '');
    info(`stage facts: keptFrames ${st.keptFrames}, swapMs ${st.swapMs}, rest ${J(st.rest)}, dissolveAtMs ${st.dissolveAtMs}, endAtMs ${st.endAtMs}, warm ${J(st.warm)}, linkedInSwap ${st.linkedInSwap}, linkedAfterSwap ${st.linkedAfterSwap}, installed ${st.installed}`);
    const p = await pictures(s, T.hall);
    if (p.err.length) check('the picture probe read every frame', false, p.err.join(' | '));
    const j = judgePictures(p.runs, { want: 'hall', oldRef: ref.s });
    check(`every presented picture from first paint to the hall is the stage, a blend or the hall, with one dissolve (${p.seen} presented: ${j.stage} stage with the wall band's brightest bin at most ${j.stageWall}, ${j.blends} blends at weights ${J(j.weights.slice(0, 8))}${j.weights.length > 8 ? '...' : ''}, ${j.end} hall; worst two-picture residual ${j.residual} levels; the hall is ${j.endVsOld} levels rms from the old room)`, j.ok, j.why ?? '');
    // the planted red: the old room's own picture, put into this boot's pictures right after the kept frame, must be refused
    const cut = p.runs.findIndex((x) => wallMax(x.s) > PIC.dark);
    const planted = [...p.runs.slice(0, Math.max(1, cut)), { n: 1, s: ref.s }, ...p.runs.slice(Math.max(1, cut))];
    const red = judgePictures(planted, { want: 'hall', oldRef: ref.s });
    check('planted red: one old-room picture among this boot\'s pictures is refused', red.ok === false, 'the judge passed an old-room frame');
    info(`planted red said: ${red.why}`);
    const red2 = judgePictures([...p.runs.slice(0, Math.max(1, cut)), { n: 3, s: ref.s }], { want: 'hall', oldRef: ref.s });
    check('planted red: a boot that ends on the old room is refused as a hall boot', red2.ok === false, 'the judge passed the old room as the hall');
    // the hall at rest after the stage (the picture judge above ends at the reveal)
    const rest = await hallAtRest(s);
    const jr = judgeRest(rest);
    const endPic = p.runs.length ? p.runs[p.runs.length - 1].s : null;
    info(`the hall at rest, ${rest.waitedMs} ms and ${rest.framesSince} delivered frame(s) after the reveal: the wall band's brightest bin ${jr.wall}${endPic && Array.isArray(rest.s) ? `, ${rms(rest.s, endPic).toFixed(2)} levels rms from the last picture of the reveal` : ''}; the scene's own buffer ${J(rest.scene)}; the app's reflection cube ${J(rest.cube)}; uniforms maps the adopter seated again in this boot: ${rest.seated}${rest.still ? `; the page's own screenshot at that moment: ${rest.still}` : ''}`);
    check("the hall is still there at rest after the stage: its picture is not dark, and neither the scene's own buffer nor the app's reflection cube holds a non-finite texel", jr.ok, jr.why ?? '');
    out.legs['2'] = { lookBoot: r0.lookBoot, firstPaintMs: r.fp.at, firstLeafRequestMs: r.leafFirstAt, leafFiles: r.leafCount, stage: st, pictures: { presented: p.seen, ...j }, oldRoom: { frames: ref.frames, minWall: ref.minWall }, plantedRed: red.why,
      rest: { waitedMs: rest.waitedMs, framesSince: rest.framesSince, wall: jr.wall, scene: rest.scene, cube: rest.cube, seated: rest.seated, still: rest.still, ok: jr.ok, why: jr.why } };
  } finally { await s.close(); }
};

// legs 3 and 4 share one fresh profile's first boot (to the report)
let firstBoot = null;
async function firstHallBoot() {
  if (firstBoot) return firstBoot;
  const s = await session();
  const r0 = await boot(s, appUrl(HALLQ));
  const before = r0.record;
  const r1 = await hall(s);
  const r = await reported(s, before);
  firstBoot = { s, r0, r1, r, before, app: appOf(r0) };
  return firstBoot;
}

legs['3'] = async () => {
  const b = await firstHallBoot();
  const { s, r0, r } = b;
  const tier = tierOf(r0), pace = r.club?.stage?.pace ?? null, j = judgePace(pace);
  check('a fresh profile holds no record before the first report', b.before === null, String(b.before));
  check('the page announced its app version once at the decision', r0.announces.length === 1 && r0.announces[0].key === KEY, J(r0.announces));
  info(`app version ${b.app}; the leaf's report after ${r.reportWaitMs} ms: main.js's own rule says ${J({ verdict: j.verdict, why: j.why })}`);
  check("the leaf handed its pace report (life.stage.pace)", !!pace, 'no pace facts after the wait');
  const settingsUntouched = r.settings === r0.settings;
  if (j.verdict === 'hall') {
    const probs = recordProblems(r.record, b.app, { verdict: 'hall', why: 'pace-ok', passed: true, slow: 0, fails: { fetch: 0, build: 0, timeout: 0 } });
    const rr = rec(r);
    if (!(rr?.pace?.period > 0)) probs.push(`pace.period ${rr?.pace?.period}`);
    if (!(rr?.pace?.hall?.frames >= RULES.LOOK_PACE.MIN_FRAMES)) probs.push(`pace.hall.frames ${rr?.pace?.hall?.frames}`);
    if (rr?.pace?.stage?.dirty !== true) probs.push('pace.stage.dirty is not true');
    check("the record after the report is { v 1, app, verdict 'hall', why 'pace-ok', passed, slow 0, fails 0, the pace numbers }", probs.length === 0, probs.join('; '), { gpu: true });
  } else if (j.verdict === null) {
    check(`no verdict (${j.why}): nothing is stored, the next boot measures again`, r.record === b.before, `the record changed: ${r.record}`);
    check("a first boot's report gives the verdict 'hall' (pace-ok)", false, `main.js's rule over this device's pace says ${j.why}: ${j.rows.join('; ')}`, { gpu: true });
  } else {
    check("a first boot's report gives the verdict 'hall' (pace-ok)", false, `this device's hall is CONDEMNED (${j.why}): ${j.rows.join('; ')}; record ${r.record}`, { gpu: true });
  }
  check('the settings blob was not written by the verdict', settingsUntouched, `${r0.settings} -> ${r.settings}`);
  // the second boot follows the record
  const stored = rec(r);
  const want = stored?.verdict === 'hall' ? 'pass-verdict' : stored?.verdict === 'old' ? (RULES.LOOK_ANEW_WHYS.includes(stored.why) ? 'light-new' : 'verdict-old') : 'pass-new'; // (step 2: an old by pace leads to the light hall)
  const r2 = await boot(s, 'reload', {});
  check(`the second boot follows the record (${stored ? `verdict ${stored.verdict}` : 'nothing stored'}): why '${want}'`, r2.lookBoot?.why === want, J(r2.lookBoot));
  check("on a passing device the second boot is 'pass-verdict'", r2.lookBoot?.why === 'pass-verdict' && r2.lookBoot?.shown === 'hall', J(r2.lookBoot), { gpu: true });
  if (!DEV && r2.lookBoot?.shown === 'hall') { const h = await hall(s, 'the hall on the second boot'); check('the second boot shows the hall', h.club?.stage?.phase === 'hall', J(h.club?.stage?.phase)); }
  out.legs['3'] = { app: b.app, recordBefore: b.before, recordAfter: stored, judged: { verdict: j.verdict, why: j.why }, secondBoot: r2.lookBoot, reportWaitMs: r.reportWaitMs };
};

legs['4'] = async () => {
  const b = await firstHallBoot();
  const pace = b.r.club?.stage?.pace ?? null, j = judgePace(pace);
  info(`life.stage.pace = ${J(pace)}`);
  for (const row of j.rows) info(row);
  info(`main.js's lookJudgePace says ${J({ verdict: j.verdict, why: j.why })}`);
  // the boot's numbers in ONE line (what a row of nights is read from), with what the product stored for them
  const stored4 = rec(b.r), pp = pace?.period ?? {}, ph = pace?.hall ?? {};
  const numbers = { period: pp.ms ?? null, clock: pp.clock ?? null, on: pp.frames ?? null, share: pp.share ?? null, thin: pp.thin ?? null, witnessed: pp.witnessed ?? null, stageOn: pp.stage ?? null,
    hall: { median: ph.median ?? null, p95: ph.p95 ?? null, over: ph.over ?? null, frames: ph.frames ?? null, closedBy: ph.closedBy ?? null }, hidden: pace?.hidden ?? null,
    rule: { verdict: j.verdict, why: j.why }, stored: stored4 ? { verdict: stored4.verdict ?? null, why: stored4.why ?? null, passed: stored4.passed ?? null, slow: stored4.slow ?? null } : null };
  info(`pace numbers${PACE_NUMBERS ? ' (--pace-numbers: recorded, nothing of them is judged)' : ''}: ${J(numbers)}`);
  check("this device's hall holds the pace (main.js's own rule and constants over the leaf's report)", j.verdict === 'hall', j.verdict === 'old' ? `CONDEMNED: ${j.why}` : `no verdict: ${j.why}`, { gpu: true });
  // the planted red: the same report with a hall twice as slow must be condemned by the same rule
  if (pace?.hall && Number.isFinite(pace.hall.median)) {
    // (a report without a readable period, as a software renderer gives: the hall's own median stands in for it)
    const per = Number.isFinite(pace?.period?.ms) ? pace.period.ms : pace.hall.median;
    const slow = { ...pace, period: { ...pace.period, ms: per }, hall: { ...pace.hall, complete: true, frames: Math.max(pace.hall.frames, RULES.LOOK_PACE.MIN_FRAMES), closedBy: 'frames', median: 2 * Math.max(pace.hall.median, per), p95: 3 * Math.max(pace.hall.p95 ?? 0, per), over: 0.9 }, hidden: 0 };
    const red = RULES.lookJudgePace(slow, true);
    check("planted red: this report with its hall at half the pace is condemned ('old')", red.verdict === 'old', J(red));
  } else check('planted red: a slow hall is condemned', false, 'no hall in the report to plant on');
  out.legs['4'] = { from: "window.__club.state().life.stage.pace of a fresh profile's first boot, judged by main.js lookJudgePace", pace, judged: { verdict: j.verdict, why: j.why }, rows: j.rows, numbers, asserted: !reportsOnly(true) };
};

/** The stage's pictures stand still: the shell's camera has landed and the same stage picture came N times (or none for a while). */
const stageStill = (s, ms) => {
  const stands = standing();
  return until('the stage at rest', ms, async () => {
    const f = await s.c.eval(`(() => { const F = window.__obLB && window.__obLB.frames; if (!F || !F.runs.length) return null; const l = F.runs[F.runs.length - 1], h = window.__shell;
      return { s: l.s, seen: F.seen, quiet: performance.now() - F.lastAt, still: (() => { try { return !h || !h.isOpen() || !h.moving(); } catch (e) { return true; } })() }; })()`);
    if (!f) return null;
    const rest = stands(f);
    return rest && f.still && wallMax(f.s) <= PIC.dark ? { seen: f.seen } : null;
  });
};
/** What main is told when a bound or a budget runs out (the product's own words, web/app/main.js and web/scene/club/index.js;
 * legs 5c, 5e and 5f expect them): `entry` = main's bound before the leaf's entry had arrived; `slowBuild` = nothing was
 * awaited from the network (the room's own budget line, or main's bare word when its bound fires first); `filesOut` =
 * files the hall had asked for were still on their way (a budget of the leaf, or main's bound). */
const TOLD = {
  entry: /^import: the bound, the entry had not arrived$/,
  slowBuild: /^timeout(: room: not ready after \d+ ms \(adopted late if it arrives\))?$/,
  filesOut: /^assets: (the bound, )?files not in: \d+(;|$)/,
};
/** A planted failure: the first boot of a fresh profile under `plant`, to the old room. `after(s)` runs once the boot has
 * painted (a plant that is let go later). Returns the session and the facts. */
async function failedBoot(name, { url, plant, after = null, cls, reason }) {
  const ref = await oldRef();
  const s = await session();
  await plant(s);
  const r0 = await boot(s, url, { frames: 'lit' });
  const tier = tierOf(r0);
  check(`${name}: the boot begins as the stage { default, hall, stage, ${tier}, pass-new }`, lookIs(r0, { asked: 'default', shown: 'hall', flow: 'stage', tier, why: 'pass-new' }), J(r0.lookBoot));
  if (after) await after(s);
  await until(`${name}: the failure on record`, T.fail, async () => { const x = rec({ record: await s.c.eval(`localStorage.getItem(${J(KEY)})`) }); return x && (x.fails.fetch + x.fails.build + x.fails.timeout) > 0; });
  const p = await pictures(s, T.fail, { lit: true }); // (the dissolve runs after the record is written: the end is a LIT picture at rest)
  const r = await read(s, true);
  const x = rec(r);
  const told = warned(s, /the hall could not be had/);
  info(`${name}: main was told "${told[0] ?? '(no line)'}"; record ${r.record}`);
  check(`${name}: the reason on record ${reason.toString()} and its class is '${cls}' by main.js's own rule`, reason.test(String(x?.reason)) && RULES.lookFailClass(x?.reason) === cls, `reason ${J(x?.reason)} -> class ${RULES.lookFailClass(x?.reason)}`);
  const j = judgePictures(p.runs, { want: 'old', oldRef: ref.s });
  check(`${name}: the boot ends on the lit old room by one dissolve (${p.seen} presented: ${j.stage} stage, ${j.blends} blends, ${j.end} old room; the end is ${j.endVsOld} levels rms from the old room's own picture, its wall band's brightest bin ${j.endWall})`, j.ok, j.why ?? '');
  const red = judgePictures(p.runs, { want: 'hall', oldRef: ref.s });
  check(`${name}: planted red: the same pictures are refused as a hall boot`, red.ok === false, 'the judge passed the old room as the hall');
  check(`${name}: the page is live on the old room (ready, no app error)`, r.ready === true && Array.isArray(r.errors) && r.errors.length === 0, J({ ready: r.ready, errors: r.errors }));
  return { s, r0, r, x, pictures: { presented: p.seen, ...j }, told: told[0] ?? null };
}

legs['5a'] = async () => {
  // The leaf's entry is asked for one frame after first paint, while the shell's camera still flies in, and main's own
  // failure reveals at once (its rest rule is "no shot in flight"): a request that fails outright dissolves to an old
  // room whose camera is still moving, which no two-picture law can judge. So the request is HELD until the stage
  // stands still and FAILED then (a later request of this profile fails at once): the same `import` failure, at rest.
  const failNow = (s) => (p) => { s.c.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'Failed' }).catch(() => {}); };
  const f = await failedBoot('a failed leaf entry', { url: appUrl(HALLQ), cls: 'fetch', reason: /^import$/,
    plant: async (s) => { s.onPaused = (p) => { s.held.push(p.requestId); }; await s.c.send('Fetch.enable', { patterns: [{ urlPattern: '*scene/club/index.js*' }] }); },
    after: async (s) => {
      await until("the leaf's entry asked for", T.fail, async () => s.held.length > 0);
      await stageStill(s, T.fail);
      s.onPaused = failNow(s);
      for (const id of s.held.splice(0)) await s.c.send('Fetch.failRequest', { requestId: id, errorReason: 'Failed' });
    } });
  const { s } = f;
  try {
    check('the record counts one failed fetch and holds no verdict', eq(f.x?.fails, { fetch: 1, build: 0, timeout: 0 }) && f.x?.verdict === null, J(f.x));
    const r2 = await boot(s, 'reload');
    check("the next boot tries again: why 'pass-retry', the stage", r2.lookBoot?.why === 'pass-retry' && r2.lookBoot?.flow === 'stage', J(r2.lookBoot));
    await until('the second failure on record', T.fail, async () => rec({ record: await s.c.eval(`localStorage.getItem(${J(KEY)})`) })?.fails?.fetch === RULES.LOOK_TRIES.fetch);
    const x2 = rec(await read(s));
    check(`a second failed fetch in a row is counted (${RULES.LOOK_TRIES.fetch}), still no verdict`, x2?.fails?.fetch === RULES.LOOK_TRIES.fetch && x2?.verdict === null, J(x2));
    const r3 = await boot(s, 'reload');
    await until('the old room ready', T.paint, () => s.c.eval('window.__test?.ready === true'));
    const r3b = await read(s);
    const third = leafSaid(s);
    check("the third boot does not ask: why 'fetch-wait', the old room at once, no leaf request", r3.lookBoot?.why === 'fetch-wait' && r3.lookBoot?.shown === 'old' && r3.lookBoot?.flow === 'none' && noLeaf(s, r3b), J({ lookBoot: r3.lookBoot, leaf: s.leaf.length, ...third, rt: r3b.leafCount, club: r3b.clubDefined }));
    saidLate(s, 'the third boot', true);
    await plantedAsk(s, 'the third boot');
    out.legs['5a'] = { told: f.told, record1: f.x, record2: x2, boots: [f.r0.lookBoot, r2.lookBoot, r3.lookBoot], pictures: f.pictures, thirdBoot: third };
  } finally { await s.c.send('Fetch.disable').catch(() => {}); await s.close(); }
};

legs['5b'] = async () => {
  const f = await failedBoot('a blocked arena/room.js', { url: appUrl(HALLQ), cls: 'fetch', reason: /^import: room: /, plant: (s) => s.c.send('Network.setBlockedURLs', { urls: ['*scene/club/arena/room.js*'] }) });
  const { s } = f;
  try {
    check('the record counts one failed fetch and holds no verdict (a module that did not arrive is not the device)', eq(f.x?.fails, { fetch: 1, build: 0, timeout: 0 }) && f.x?.verdict === null, J(f.x));
    info(`leaf requests of the failed boot: ${s.leaf.length} (${s.leaf.filter((q) => q.failed).length} failed)`);
    const r2 = await boot(s, 'reload');
    check("the next boot tries again: why 'pass-retry', the stage", r2.lookBoot?.why === 'pass-retry' && r2.lookBoot?.flow === 'stage', J(r2.lookBoot));
    out.legs['5b'] = { told: f.told, record1: f.x, boots: [f.r0.lookBoot, r2.lookBoot], pictures: f.pictures };
  } finally { await s.close(); }
};

legs['5c'] = async () => {
  // MAIN'S BOUND WITH BYTES PENDING: the leaf's entry is held back in the network (asked for, never answered), so
  // nothing of the leaf runs and main's own STAGE_MAX_MS passes while a request of the hall is still open. That is the
  // network's doing, not the device's: the reason is headed `import:` (class fetch), it is counted as a failed fetch and
  // NEVER becomes a verdict; a second such boot is counted too; the third boot waits (fetch-wait) and asks for nothing.
  // The bound is a real budget (no switch shortens it): this leg waits it out, twice.
  info(`main's bound is STAGE_MAX_MS = ${RULES.STAGE_MAX_MS} ms after first paint (read from main.js); the leaf's entry is held in the network`);
  const hold = async (s) => { s.onPaused = (p) => { s.held.push(p.requestId); }; await s.c.send('Fetch.enable', { patterns: [{ urlPattern: '*scene/club/index.js*' }] }); };
  const f = await failedBoot("main's bound with the entry pending", { url: appUrl(), cls: 'fetch', reason: TOLD.entry, plant: hold });
  const { s } = f;
  try {
    const entry = s.leaf.filter((q) => /\/scene\/club\/index\.js/.test(q.url));
    check("the leaf's entry was asked for and was still unanswered when the bound's failure was read (the pending request)", s.held.length > 0 && entry.length > 0 && entry.every((q) => !q.done), J({ held: s.held.length, entry: entry.map((q) => ({ done: q.done, failed: q.failed, status: q.status })) }));
    check('the record counts one failed fetch and holds no verdict (a bound that fires over pending bytes is not the device)', eq(f.x?.fails, { fetch: 1, build: 0, timeout: 0 }) && f.x?.verdict === null, J(f.x));
    const r2 = await boot(s, 'reload');
    check("the next boot tries again: why 'pass-retry', the stage", r2.lookBoot?.why === 'pass-retry' && r2.lookBoot?.flow === 'stage', J(r2.lookBoot));
    await until('the second failed fetch on record', T.fail, async () => rec({ record: await s.c.eval(`localStorage.getItem(${J(KEY)})`) })?.fails?.fetch === RULES.LOOK_TRIES.fetch);
    const x2 = rec(await read(s));
    check(`a second bound over pending bytes is counted (fails.fetch ${RULES.LOOK_TRIES.fetch}), still no verdict and no timeout on record`, x2?.fails?.fetch === RULES.LOOK_TRIES.fetch && x2?.fails?.timeout === 0 && x2?.verdict === null, J(x2));
    await s.c.send('Fetch.disable').catch(() => {});
    s.onPaused = null;
    const r3 = await boot(s, 'reload');
    await until('the old room ready', T.paint, () => s.c.eval('window.__test?.ready === true'));
    const r3b = await read(s);
    const third = leafSaid(s);
    check("the third boot does not ask: why 'fetch-wait', the old room at once, no leaf request", r3.lookBoot?.why === 'fetch-wait' && r3.lookBoot?.shown === 'old' && r3.lookBoot?.flow === 'none' && noLeaf(s, r3b), J({ lookBoot: r3.lookBoot, leaf: s.leaf.length, ...third, rt: r3b.leafCount, club: r3b.clubDefined }));
    // (the hold was switched off a moment before the reload: the second boot's held entry goes on to the server and its
    // page, on its way out, may still read it and ask for its one static import after the new document's request. That
    // is the page BEFORE asking, and the tally sets it aside by its document; the line below names it when it happens.)
    saidLate(s, 'the third boot', true);
    await plantedAsk(s, 'the third boot');
    out.legs['5c'] = { told: f.told, record1: f.x, record2: x2, boots: [f.r0.lookBoot, r2.lookBoot, r3.lookBoot], pictures: f.pictures, STAGE_MAX_MS: RULES.STAGE_MAX_MS, thirdBoot: third };
  } finally { await s.close(); }
};

legs['5d'] = async () => {
  const off = 'cluboff=room,env,occ,post,mat,motion,audio'; // the leaf's own tool switch: the room is not built
  const f = await failedBoot('a room that is off', { url: appUrl([HALLQ, off].filter(Boolean).join('&')), cls: 'build', reason: /^room: /, plant: async () => {} });
  const { s } = f;
  try {
    check("a build failure stores the verdict 'old', why 'build', at once", f.x?.verdict === 'old' && f.x?.why === 'build' && f.x?.fails?.build === RULES.LOOK_TRIES.build, J(f.x));
    const r2 = await boot(s, 'reload');
    await until('the old room ready', T.paint, () => s.c.eval('window.__test?.ready === true'));
    const r2b = await read(s);
    check("the next boot keeps the old room: why 'verdict-old', no leaf request", r2.lookBoot?.why === 'verdict-old' && r2.lookBoot?.shown === 'old' && noLeaf(s, r2b), J({ lookBoot: r2.lookBoot, leaf: s.leaf.length, ...leafSaid(s), rt: r2b.leafCount, club: r2b.clubDefined }));
    saidLate(s, 'the next boot');
    check('the record is byte-equal after that boot', r2b.record === f.r.record, `${f.r.record} -> ${r2b.record}`);
    out.legs['5d'] = { told: f.told, record1: f.x, boots: [f.r0.lookBoot, r2.lookBoot], pictures: f.pictures };
  } finally { await s.close(); }
};

/** Leg 5e's stand-in for the arena's room module: every export of the real module (asked for under another query, so its
 * bytes arrive too) and, over it, the room's factory as a function whose promise never settles. `leafText` = the leaf's
 * entry module as text: the factory's name is read from its service table, not copied. null = no such row. */
function endlessRoom(leafText) {
  const factory = /\['room', '\.\/room\.js', '(\w+)'\]/.exec(leafText)?.[1] ?? null;
  return factory ? { factory, body: `export * from './room.js?real=1';\nexport const ${factory} = () => new Promise(() => {});\n` } : null;
}
legs['5e'] = async () => {
  // THE TRUE TIMEOUT, with no switch of the product: every file the hall asks for arrives, and one build never ends. The
  // request for the arena's room module is answered by this suite (CDP Fetch) with endlessRoom's module, so the room's
  // own budget (or main's bound, whichever comes first) runs out with nothing pending in the network. That is the
  // device's side: class timeout, counted once without a verdict; the second time the verdict 'old', why 'timeout'; the
  // third boot asks for THE LIGHT HALL (step 2: a timeout condemns the standard hall alone; the light one builds less). Both budgets are the product's (no switch shortens them; the
  // development switch lengthens them, LEAFQ, and says so).
  const stand = endlessRoom(fs.readFileSync(path.join(webDir, 'scene', 'club', 'index.js'), 'utf8'));
  if (!stand) { check("the room's factory is named in the leaf's service table (scene/club/index.js)", false, "no row ['room', './room.js', '<factory>'] was found"); return; }
  info(`the arena's room module is answered by the suite: every export of the real one, and ${stand.factory}() never settles; main's bound is ${RULES.stageBound(LEAFMS)} ms after first paint${LEAFQ ? ` (FORCED by OB_LOOKBOOT_DEV: ${LEAFQ}, the leaf's service budget, because a software renderer's page thread needs most of the product's ${RULES.STAGE_MAX_MS} ms to run the leaf's entry alone; the budgets of this run are NOT the product's)` : ''}`);
  const answered = [];
  const plant = async (s) => {
    s.onPaused = (p) => {
      answered.push(p.request.url);
      s.c.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Cache-Control', value: 'no-store' }], body: Buffer.from(stand.body).toString('base64') }).catch(() => {});
    };
    await s.c.send('Fetch.enable', { patterns: [{ urlPattern: '*scene/club/arena/room.js' }] }); // (the bare URL only: the real text is asked for with a query)
  };
  // (the room's own line, or main's bare word when its bound fires first: both mean "nothing was awaited")
  const f = await failedBoot('the true timeout', { url: appUrl(LEAFQ), cls: 'timeout', reason: TOLD.slowBuild, plant });
  const { s } = f;
  try {
    info(`the true timeout was told by ${f.x?.reason === 'timeout' ? "MAIN'S BOUND (the bare word: its timer ran out before the room's own budget did)" : /^timeout: room: /.test(String(f.x?.reason)) ? "THE ROOM'S OWN BUDGET (the leaf's line: it ran out before main's bound did)" : 'NEITHER (no timeout was told: the leg is red above)'}: "${f.x?.reason}"`);
    const real = s.leaf.filter((q) => /\/scene\/club\/arena\/room\.js\?real=1$/.test(q.url)), open1 = s.leaf.filter((q) => !q.done), asked1 = s.leaf.length;
    check("the room's module was answered by the suite and the real module's text arrived beside it", answered.length > 0 && real.length > 0 && real.every((q) => q.done && !q.failed), J({ answered: answered.length, real: real.map((q) => ({ done: q.done, failed: q.failed, status: q.status })) }));
    check(`nothing of the hall was pending in the network when the failure was read (${asked1} leaf requests, every one answered)`, asked1 > 0 && open1.length === 0, J(open1.slice(0, 5).map((q) => q.url)));
    check('the record counts one timeout and holds no verdict (one slow build is not yet the device)', eq(f.x?.fails, { fetch: 0, build: 0, timeout: 1 }) && f.x?.verdict === null, J(f.x));
    const r2 = await boot(s, 'reload');
    check("the next boot tries again: why 'pass-retry', the stage", r2.lookBoot?.why === 'pass-retry' && r2.lookBoot?.flow === 'stage', J(r2.lookBoot));
    await until('the second timeout on record', T.fail, async () => rec({ record: await s.c.eval(`localStorage.getItem(${J(KEY)})`) })?.fails?.timeout === RULES.LOOK_TRIES.timeout);
    const x2 = rec(await read(s)), open2 = s.leaf.filter((q) => !q.done);
    info(`the second boot: main was told "${warned(s, /the hall could not be had/).slice(-1)[0] ?? '(no line)'}"; ${s.leaf.length} leaf requests, ${open2.length} unanswered at the read`);
    check(`the second true timeout stores the verdict 'old', why 'timeout' (LOOK_TRIES.timeout ${RULES.LOOK_TRIES.timeout}), and no failed fetch is on record`, x2?.verdict === 'old' && x2?.why === 'timeout' && x2?.fails?.timeout === RULES.LOOK_TRIES.timeout && x2?.fails?.fetch === 0, J(x2));
    await s.c.send('Fetch.disable').catch(() => {});
    s.onPaused = null;
    const r3 = await boot(s, 'reload');
    check("the third boot asks for THE LIGHT HALL: { default, hall, stage, <tier>, light-new, rung lite }", eq(r3.lookBoot, { asked: 'default', shown: 'hall', flow: 'stage', tier: tierOf(f.r0), why: 'light-new', rung: 'lite' }), J(r3.lookBoot));
    out.legs['5e'] = { told: f.told, factory: stand.factory, record1: f.x, record2: x2, boots: [f.r0.lookBoot, r2.lookBoot, r3.lookBoot], pictures: f.pictures, leafRequests: asked1, STAGE_MAX_MS: RULES.STAGE_MAX_MS };
  } finally { await s.close(); }
};

legs['5f'] = async () => {
  // A BUDGET WITH A FILE PENDING: every module of the hall arrives, and the hall's baked light map is held back in the
  // network (asked for, never answered). Whichever budget runs out first (the leaf's wait for its files, the room's, or
  // main's bound) finds a file it asked for still on its way: the reason is headed `assets:` and names the files not in
  // (class fetch), it is counted as a failed fetch and is no verdict. The budgets are the product's.
  const hold = async (s) => { s.onPaused = (p) => { s.held.push(p.requestId); }; await s.c.send('Fetch.enable', { patterns: [{ urlPattern: '*assets/club/arena-light*' }] }); };
  if (LEAFQ) info(`FORCED by OB_LOOKBOOT_DEV: ${LEAFQ} (as in leg 5e): the budgets of this run are NOT the product's (main's bound ${RULES.stageBound(LEAFMS)} ms)`);
  const f = await failedBoot('a budget with a map pending', { url: appUrl(LEAFQ), cls: 'fetch', reason: TOLD.filesOut, plant: hold });
  const { s } = f;
  try {
    const map = s.leaf.filter((q) => /\/assets\/club\/arena-light/.test(q.url)), modules = s.leaf.filter((q) => /\.m?js(\?|$)/.test(q.url));
    check('the map was asked for and was still unanswered when the failure was read, and every module of the hall had arrived', s.held.length > 0 && map.length > 0 && map.every((q) => !q.done) && modules.length > 0 && modules.every((q) => q.done && !q.failed),
      J({ held: s.held.length, map: map.map((q) => ({ url: q.url.replace(/^.*\/assets\//, ''), done: q.done })), modules: modules.length, modulesOpen: modules.filter((q) => !q.done || q.failed).length }));
    check('the record counts one failed fetch and holds no verdict (a budget that runs out over a file on its way is not the device)', eq(f.x?.fails, { fetch: 1, build: 0, timeout: 0 }) && f.x?.verdict === null, J(f.x));
    const r2 = await boot(s, 'reload');
    check("the next boot tries again: why 'pass-retry', the stage", r2.lookBoot?.why === 'pass-retry' && r2.lookBoot?.flow === 'stage', J(r2.lookBoot));
    out.legs['5f'] = { told: f.told, record1: f.x, boots: [f.r0.lookBoot, r2.lookBoot], pictures: f.pictures, modules: modules.length };
  } finally { await s.c.send('Fetch.disable').catch(() => {}); await s.close(); }
};

// the kit confirm (web/app/ui/dialog.js): its body text once it is open, or null after `ms`
const confirmBody = (s, ms = DEV ? 60000 : 6000) => s.c.eval(`(async () => { const t0 = performance.now(); let el = null; while (!el && performance.now() - t0 < ${ms}) { el = document.querySelector('[data-ob="confirm"]'); if (!el) await new Promise((r) => setTimeout(r, 50)); } return el ? el.querySelector('.ob-confirm__body').textContent : null; })()`);
const confirms = (s) => s.c.eval('document.querySelectorAll(\'[data-ob="confirm"]\').length');
const answer = (s, accept) => s.c.eval(`(() => { const b = document.querySelector('[data-ob="${accept ? 'confirm-accept' : 'confirm-cancel'}"]'); if (!b) return false; b.click(); return true; })()`);
const gone = (s) => until('the confirm closed', DEV ? 60000 : 6000, async () => (await confirms(s)) === 0);
/** A record a slow device holds, stored under the page's own key and app version the way the launcher's pin does it
 * (answering the page's announcement), but ONLY while the profile holds no record: later boots keep what the page wrote. */
const seedOld = (why, lite = null) => `(() => { const set = Storage.prototype.setItem; addEventListener('ob:look-verdict', (e) => { try { if (localStorage.getItem(e.detail.key) !== null) return;
  set.call(localStorage, e.detail.key, JSON.stringify({ v: 1, app: e.detail.app, verdict: 'old', why: ${J(why)}, at: Date.now(), passed: false, slow: 1, fails: { fetch: 0, build: 0, timeout: 0 }, failAt: null, reason: null,
    pace: { period: 16.67, how: 'planted by e2e-lookboot', hall: { frames: 120, median: 33.4, p95: 50, over: 0.9, closedBy: 'frames' }, stage: null, hidden: 0 }${lite ? `, lite: ${J(lite)}` : ''} })); } catch (err) { /* nothing seeded */ } }); })();`;
/** (step 2) The light hall's own fields, condemned by its pace: with it under a pace `old` the device keeps the old room. */
const LITE_OLD = { verdict: 'old', why: 'pace-median', at: 1, passed: false, slow: 1, fails: { fetch: 0, build: 0, timeout: 0 }, failAt: null, reason: null, pace: null };

legs['6'] = async () => {
  // The picker is driven through window.__settings.set('look', v): the function the picker's own change handler calls
  // (settings.js `set`, whose look branch runs ctx.applyLook then ctx.clubLookReload). The picker's DOM (a kit select) is
  // e2e-ui's subject; what this leg tests is the hook behind it and the two confirms it opens.
  const GREEN = EN['settings.lookReloadConfirm'], CHANGE = EN['settings.lookChangeReloadConfirm'];
  const s = await session();
  try {
    // (step 2) a test launcher's pin holds on every rung: a pin record that also holds a passing light hall keeps the old room
    const r9 = await boot(s, appUrl(), { seed: seedOld('pin', { ...LITE_OLD, verdict: 'hall', why: 'pace-ok', passed: true, slow: 0 }) });
    await until('the old room ready', T.paint, () => s.c.eval('window.__test?.ready === true'));
    const r9b = await read(s);
    check(`a pin with a passing light hall on record boots { default, old, none, ${tierOf(r9)}, verdict-pin }, no leaf byte`, lookIs(r9, { asked: 'default', shown: 'old', flow: 'none', tier: tierOf(r9), why: 'verdict-pin' }) && noLeaf(s, r9b), J({ lookBoot: r9.lookBoot, leaf: s.leaf.length, ...leafSaid(s), rt: r9b.leafCount, club: r9b.clubDefined }));
    await s.c.eval(`localStorage.removeItem(${J(KEY)})`);
    // (a) a pace `old` on BOTH rungs (the standard hall and the light one) keeps the old room, with no leaf byte
    const r1 = await boot(s, appUrl(), { seed: seedOld('pace-median', LITE_OLD) });
    await until('the old room ready', T.paint, () => s.c.eval('window.__test?.ready === true'));
    const r1b = await read(s);
    const tier = tierOf(r1), app = appOf(r1);
    check(`a pace 'old' on both rungs boots { default, old, none, ${tier}, verdict-old }`, lookIs(r1, { asked: 'default', shown: 'old', flow: 'none', tier, why: 'verdict-old' }), J(r1.lookBoot));
    check('no leaf byte: no request under scene/club or assets/club, window.__club undefined', noLeaf(s, r1b), J({ leaf: s.leaf.length, ...leafSaid(s), rt: r1b.leafCount, club: r1b.clubDefined }));
    saidLate(s, "the stored 'old' boot");
    const before = r1b.record;
    // (b) the way out: Green (main's own offer, declined), then Tournament
    await s.c.eval("window.__lbSentinel = 1; window.__settings.set('look', 'green')");
    const b1 = await confirmBody(s);
    check('Green on the old room opens main\'s reload offer (settings.lookReloadConfirm)', b1 === GREEN, J(b1));
    await answer(s, false); await gone(s);
    const afterGreen = await read(s);
    check('declined: the page stays, the record is untouched', afterGreen.record === before && (await s.c.eval('window.__lbSentinel')) === 1, afterGreen.record);
    await s.c.eval("window.__settings.set('look', 'tournament')");
    const b2 = await confirmBody(s);
    const mid = await read(s);
    const cleared = rec(mid);
    check('Tournament again opens the reload offer (settings.lookChangeReloadConfirm)', b2 === CHANGE, J(b2));
    check("the record is cleared BEFORE the offer is answered: verdict null, why 'anew', slow 0, fails 0, the same app, no member `lite`", cleared?.verdict === null && cleared?.why === 'anew' && cleared?.slow === 0 && eq(cleared?.fails, { fetch: 0, build: 0, timeout: 0 }) && cleared?.app === app && !('lite' in (cleared ?? {})), mid.record);
    check('no live regrade happened under the offer (the GI look has not moved)', mid.gi === afterGreen.gi, `${afterGreen.gi} -> ${mid.gi}`);
    const r2 = await boot(s, () => answer(s, true).catch(() => true), {}); // (the click reloads the page: an answer lost to that navigation is not an error)
    check("accepted: the page reloads into the stage, why 'pass-anew'", r2.lookBoot?.why === 'pass-anew' && r2.lookBoot?.flow === 'stage' && r2.lookBoot?.shown === 'hall', J(r2.lookBoot));
    // (c) a `build` old is not cleared
    await s.c.eval(`localStorage.setItem(${J(KEY)}, JSON.stringify({ ...JSON.parse(${J(before)}), verdict: 'old', why: 'build', fails: { fetch: 0, build: 1, timeout: 0 } })); localStorage.removeItem('ob-settings-v1')`);
    const r3 = await boot(s, 'reload');
    await until('the old room ready', T.paint, () => s.c.eval('window.__test?.ready === true'));
    const buildRec = (await read(s)).record;
    check("a stored build 'old' boots the old room (verdict-old)", r3.lookBoot?.why === 'verdict-old', J(r3.lookBoot));
    await s.c.eval("window.__settings.set('look', 'green')");
    await confirmBody(s); await answer(s, false); await gone(s);
    await s.c.eval("window.__settings.set('look', 'tournament')");
    await sleep(DEV ? 15000 : 1200);
    const r3b = await read(s);
    check('a build old is NOT cleared: no reload offer, the record byte-equal', (await confirms(s)) === 0 && r3b.record === buildRec, J({ confirms: await confirms(s), record: r3b.record }));
    // (d) the reload offer, Green to Tournament, on a page whose reload would show the hall
    await s.c.eval(`localStorage.removeItem(${J(KEY)}); window.__settings.set('look', 'green')`);
    if (await confirmBody(s, DEV ? 20000 : 2500)) { await answer(s, false); await gone(s); } // (the old-room page offers its reload for Green: declined; the choice is stored)
    const r4 = await boot(s, 'reload');
    await until('the green page ready', T.paint, () => s.c.eval('window.__test?.ready === true'));
    const r4b = await read(s);
    check("a stored green profile boots green (stored-green), no leaf", r4.lookBoot?.shown === 'green' && r4.lookBoot?.why === 'stored-green' && noLeaf(s, r4b), J({ lookBoot: r4.lookBoot, leaf: s.leaf.length, ...leafSaid(s), rt: r4b.leafCount, club: r4b.clubDefined }));
    saidLate(s, 'the stored green boot');
    await s.c.eval("window.__lbSentinel = 2; window.__settings.set('look', 'tournament')");
    const b4 = await confirmBody(s);
    const r4c = await read(s);
    check('Green to Tournament where a reload would show the hall: the reload offer opens (settings.lookChangeReloadConfirm)', b4 === CHANGE, J(b4));
    check("no live regrade to the old room under the offer (the GI look stays as it was)", r4c.gi === r4b.gi, `${r4b.gi} -> ${r4c.gi}`);
    await answer(s, false); await gone(s);
    const look = await s.c.eval('window.__settings.get().look');
    check('declined: the page stays green, Tournament is stored', look === 'tournament' && (await s.c.eval('window.__lbSentinel')) === 2, String(look));
    await s.c.eval("window.__settings.set('look', 'tournament')");
    const b5 = await confirmBody(s);
    check('asked again, the offer opens again', b5 === CHANGE, J(b5));
    const r5 = await boot(s, () => answer(s, true).catch(() => true), {});
    check('accepted: the reload shows the hall by the stage (pass-new)', r5.lookBoot?.shown === 'hall' && r5.lookBoot?.flow === 'stage' && r5.lookBoot?.why === 'pass-new', J(r5.lookBoot));
    out.legs['6'] = { boots: [r1.lookBoot, r2.lookBoot, r3.lookBoot, r4.lookBoot, r5.lookBoot], cleared, bodies: [b1, b2, b4, b5] };
  } finally { await s.close(); }
};

/** Leg 5g's stand-in for the leaf's entry: every export of the real module (asked for under another query, so its bytes
 * arrive too) and, over it, ANOTHER stage protocol number: a leaf of another version than the app's. `leafText` = the
 * leaf's entry as text: its own number is read from it, not copied. null = the entry names no number. */
function otherLeaf(leafText) {
  const own = /^export const STAGE_PROTOCOL = (\d+);$/m.exec(leafText)?.[1] ?? null;
  return own === null ? null : { own: Number(own), other: Number(own) + 1, body: `export * from './index.js?real=1';\nexport const STAGE_PROTOCOL = ${Number(own) + 1};\n` };
}
legs['5g'] = async () => {
  // A MISMATCH (step 2): the leaf is not in the service worker's precache and the app is, so a cached app can meet a newer
  // leaf, and the other way round. The request for the leaf's entry is answered by this suite (CDP Fetch) with otherLeaf's
  // module: the real leaf under another stage protocol number. Main does not install it: ONE line headed `mismatch`, the
  // old room by one dissolve, and NOTHING stored (two versions that met say nothing of the device). The request is held
  // until the stage stands still, as leg 5a holds its own: main's failure reveals at once, and a dissolve under the
  // shell's moving camera is nothing a two-picture law can judge.
  const stand = otherLeaf(fs.readFileSync(path.join(webDir, 'scene', 'club', 'index.js'), 'utf8'));
  if (!stand) { check("the leaf's entry names its stage protocol (scene/club/index.js: export const STAGE_PROTOCOL)", false, 'no such line was found'); return; }
  info(`the leaf's entry is answered by the suite: every export of the real one, and STAGE_PROTOCOL ${stand.other} where the leaf's own is ${stand.own}`);
  const ref = await oldRef();
  const s = await session();
  try {
    const answered = [];
    const fulfil = (id) => s.c.send('Fetch.fulfillRequest', { requestId: id, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Cache-Control', value: 'no-store' }], body: Buffer.from(stand.body).toString('base64') });
    s.onPaused = (p) => { answered.push(p.request.url); s.held.push(p.requestId); };
    await s.c.send('Fetch.enable', { patterns: [{ urlPattern: '*scene/club/index.js' }] }); // (the bare URL only: the real text is asked for with a query)
    const r0 = await boot(s, appUrl(HALLQ), { frames: 'lit' });
    const tier = tierOf(r0);
    check(`a mismatch: the boot begins as the stage { default, hall, stage, ${tier}, pass-new }`, lookIs(r0, { asked: 'default', shown: 'hall', flow: 'stage', tier, why: 'pass-new' }), J(r0.lookBoot));
    await until("the leaf's entry asked for", T.fail, async () => s.held.length > 0);
    await stageStill(s, T.fail);
    s.onPaused = (p) => { answered.push(p.request.url); fulfil(p.requestId).catch(() => {}); };
    for (const id of s.held.splice(0)) await fulfil(id);
    await until('main told of the mismatch', T.fail, async () => warned(s, /the hall could not be had/).length > 0);
    const p = await pictures(s, T.fail, { lit: true });
    const r = await read(s, true);
    const told = warned(s, /the hall could not be had/);
    const line = /the hall could not be had \((.*)\): the old room is shown/.exec(told[0] ?? '')?.[1] ?? null;
    info(`a mismatch: main was told "${told[0] ?? '(no line)'}"; record ${r.record}`);
    check(`main said ONE line, headed mismatch, with both numbers (the leaf's ${stand.other}, the app's ${stand.own})`, told.length === 1 && line === `mismatch: the leaf speaks stage protocol ${stand.other}, the app ${stand.own}`, J(told));
    check("the class of that line is 'mismatch' by main.js's own rule", RULES.lookFailClass(line) === 'mismatch', `class ${RULES.lookFailClass(line)}`);
    check('NOTHING is stored: the profile holds no record after the failure', r.record === null, String(r.record));
    check("the leaf was answered by the suite, the real module's text arrived beside it, and it was not installed (window.__club is not defined)", answered.length > 0 && s.leaf.some((q) => /\/scene\/club\/index\.js\?real=1$/.test(q.url) && q.done && !q.failed) && r.clubDefined === false, J({ answered: answered.length, club: r.clubDefined }));
    const j = judgePictures(p.runs, { want: 'old', oldRef: ref.s });
    check(`a mismatch: the boot ends on the lit old room by one dissolve (${p.seen} presented: ${j.stage} stage, ${j.blends} blends, ${j.end} old room; the end is ${j.endVsOld} levels rms from the old room's own picture, its wall band's brightest bin ${j.endWall})`, j.ok, j.why ?? '');
    check('a mismatch: the page is live on the old room (ready, no app error)', r.ready === true && Array.isArray(r.errors) && r.errors.length === 0, J({ ready: r.ready, errors: r.errors }));
    await s.c.send('Fetch.disable').catch(() => {});
    s.onPaused = null;
    const r2 = await boot(s, 'reload');
    check("the next boot, the two of one version again, asks for the hall as a first boot does: why 'pass-new'", lookIs(r2, { asked: 'default', shown: 'hall', flow: 'stage', tier, why: 'pass-new' }), J(r2.lookBoot));
    out.legs['5g'] = { told: told[0] ?? null, protocols: { leaf: stand.other, app: stand.own }, record: r.record, boots: [r0.lookBoot, r2.lookBoot], pictures: { presented: p.seen, ...j } };
  } finally { await s.close(); }
};

legs['6b'] = async () => {
  // THE LIGHT HALL (step 2). A device the standard hall is too slow for is not sent to the old room: the boot rules ask
  // for the hall on the leaf's `lite` tier, by the same stage flow, and judge it by the same rule on the record's member
  // `lite`. Only a device the light hall is too slow for as well keeps the old room (leg 6). This leg reads the boot's
  // pictures (leg 2's proof, for the light hall); the record that boot writes is leg 6c's, the way out leg 6d's.
  const ref = await oldRef();
  const s = await session();
  try {
    // THE RETURNING VISITOR: a record as step 1 wrote it for a pace-condemned device (no member `lite`) boots the light
    // hall, by the stage flow, with one dissolve and no old-room picture
    const r0 = await boot(s, appUrl(HALLQ), { seed: seedOld('pace-median'), frames: 'hall' });
    const tier = tierOf(r0), app = appOf(r0), seeded = r0.record;
    check(`a stored pace 'old' with no light-hall record boots { default, hall, stage, ${tier}, light-new, rung lite }`, eq(r0.lookBoot, { asked: 'default', shown: 'hall', flow: 'stage', tier, why: 'light-new', rung: 'lite' }), J(r0.lookBoot));
    check('the record that boot read is step 1\'s shape: an old by pace under this app version, no member `lite`', rec(r0)?.verdict === 'old' && rec(r0)?.why === 'pace-median' && rec(r0)?.app === app && !('lite' in (rec(r0) ?? {})), String(seeded));
    const r = await hall(s, 'the light hall');
    const st = r.club?.stage ?? {};
    check("the leaf built THE LIGHT HALL: its tier is 'lite', handed by the boot rules, and its stage ended on the hall", st.phase === 'hall' && st.failed === null && r.club?.tier === 'lite' && r.club?.tierPick?.handed === true, J({ phase: st.phase, failed: st.failed, tier: r.club?.tier, pick: r.club?.tierPick }));
    check('the light hall was quiet at the reveal (settled before the one dissolve)', st.quietAtReveal === true, J({ quietAtReveal: st.quietAtReveal, unquiet: st.unquiet, rest: st.rest }));
    const links = judgeSwapLinks(st);
    check("no program was first linked inside the swap's task on the light hall either", links.ok, links.why ?? '');
    info(`the light hall's stage facts: keptFrames ${st.keptFrames}, swapMs ${st.swapMs}, rest ${J(st.rest)}, dissolveAtMs ${st.dissolveAtMs}, endAtMs ${st.endAtMs}, warm ${J(st.warm)}, linkedInSwap ${st.linkedInSwap}, linkedAfterSwap ${st.linkedAfterSwap}, installed ${st.installed}; ${r.leafCount} leaf files`);
    check('no dust module was asked for (the light hall builds none)', !s.leaf.some((q) => /\/scene\/club\/motion\/dust\.js(\?|$)/.test(q.url)), J(s.leaf.filter((q) => /motion\//.test(q.url)).map((q) => q.url.replace(ORIGIN, ''))));
    const p = await pictures(s, T.hall);
    if (p.err.length) check('the picture probe read every frame', false, p.err.join(' | '));
    const j = judgePictures(p.runs, { want: 'hall', oldRef: ref.s });
    check(`every presented picture from first paint to the light hall is the stage, a blend or the hall, with one dissolve (${p.seen} presented: ${j.stage} stage, ${j.blends} blends, ${j.end} hall; the hall is ${j.endVsOld} levels rms from the old room)`, j.ok, j.why ?? '');
    const rest = await hallAtRest(s, { name: 'leg6b' });
    const jr = judgeRest(rest);
    check("the light hall is still there at rest after the stage: its picture is not dark, and neither the scene's own buffer nor the app's reflection cube holds a non-finite texel", jr.ok, jr.why ?? '');
    out.legs['6b'] = { boot: r0.lookBoot, seeded: rec(r0), stage: st, pictures: { presented: p.seen, ...j } };
  } finally { await s.close(); }
};

legs['6c'] = async () => {
  // THE LIGHT HALL'S OWN RECORD (step 2). The light hall is judged by the same rule as the standard one, on the record's
  // member `lite`; the record's own fields (the standard hall's verdict) stand as they were stored. No picture is read
  // here (leg 6b's): the frames this boot presents are the ones its pace is measured on.
  const top = (o) => { const { lite, ...own } = o ?? {}; return own; };
  const s = await session();
  try {
    const r0 = await boot(s, appUrl(HALLQ), { seed: seedOld('pace-median') });
    const tier = tierOf(r0), seeded = r0.record;
    check(`a stored pace 'old' with no light-hall record boots { default, hall, stage, ${tier}, light-new, rung lite }`, eq(r0.lookBoot, { asked: 'default', shown: 'hall', flow: 'stage', tier, why: 'light-new', rung: 'lite' }), J(r0.lookBoot));
    const r = await hall(s, 'the light hall');
    check("the leaf built THE LIGHT HALL: its tier is 'lite', handed by the boot rules, and its stage ended on the hall", r.club?.stage?.phase === 'hall' && r.club?.stage?.failed === null && r.club?.tier === 'lite' && r.club?.tierPick?.handed === true, J({ phase: r.club?.stage?.phase, failed: r.club?.stage?.failed, tier: r.club?.tier, pick: r.club?.tierPick }));
    // (a) the report is booked on the light rung; the standard hall's verdict stands as it was stored
    const rp = await reported(s, seeded);
    const pace = rp.club?.stage?.pace ?? null, jp = judgePace(pace), x = rec(rp);
    info(`the light hall's report after ${rp.reportWaitMs} ms: main.js's own rule says ${J({ verdict: jp.verdict, why: jp.why })}; record ${rp.record}`);
    check("the leaf handed its pace report, and the facts name the tier that was built: 'lite'", !!pace && pace.tier === 'lite', J(pace?.tier ?? null));
    check('the standard hall\'s verdict stands exactly as it was stored: nothing migrated, nothing cleared', eq(top(x), top(JSON.parse(seeded))), `${seeded} -> ${rp.record}`);
    if (jp.verdict === null) check(`no verdict (${jp.why}): nothing is stored for the light hall`, rp.record === seeded, String(rp.record));
    else check(`the report is booked under the member \`lite\` (main.js's rule over this boot: ${jp.verdict}, ${jp.why})`, !!x?.lite && (jp.verdict === 'hall' ? x.lite.verdict === 'hall' && x.lite.why === 'pace-ok' : (x.lite.verdict === 'old' && x.lite.why === jp.why) || (x.lite.verdict === 'hall' && x.lite.why === 'pace-doubt')) && (jp.verdict === 'hall' ? x.lite.pace?.period > 0 : !!x.lite.pace?.hall), J(x?.lite ?? null)); // (a hall closed as slow has no period: its facts are booked all the same)
    check("the light hall keeps the pace on a passing device: the member reads verdict 'hall', why 'pace-ok'", x?.lite?.verdict === 'hall' && x?.lite?.why === 'pace-ok', `main.js's rule over this device's light hall says ${jp.why}: ${jp.rows.join('; ')}`, { gpu: true });
    // (b) the next boot follows the light hall's own record
    const want = x?.lite?.verdict === 'old' ? 'verdict-old' : x?.lite?.verdict === 'hall' ? 'light-verdict' : 'light-new';
    const r2 = await boot(s, 'reload', {});
    check(`the next boot follows the light hall's record (${x?.lite ? `verdict ${x.lite.verdict}` : 'nothing stored'}): why '${want}'`, r2.lookBoot?.why === want, J(r2.lookBoot));
    check("on a passing device the next boot is the light hall again: 'light-verdict', rung lite", r2.lookBoot?.why === 'light-verdict' && r2.lookBoot?.rung === 'lite', J(r2.lookBoot), { gpu: true });
    if (!DEV && r2.lookBoot?.shown === 'hall') { const h = await hall(s, 'the light hall on the next boot'); check("the next boot shows the light hall: tier 'lite'", h.club?.stage?.phase === 'hall' && h.club?.tier === 'lite', J({ phase: h.club?.stage?.phase, tier: h.club?.tier })); }
    out.legs['6c'] = { boots: [r0.lookBoot, r2.lookBoot], seeded: JSON.parse(seeded), judged: { verdict: jp.verdict, why: jp.why }, recordAfter: x, reportWaitMs: rp.reportWaitMs };
  } finally { await s.close(); }
};

legs['6d'] = async () => {
  // THE WAY OUT FROM THE LIGHT HALL'S PAGE (step 2). The page shows a hall and a reload would show a hall: the reload is
  // offered all the same when Tournament is chosen anew, because the reload would show the OTHER hall (the standard one,
  // measured again). Green declined, then Tournament: both rungs are cleared before the offer is answered. The page is
  // driven as soon as it is live on the stage: what the offer reads is the boot's decision, not the hall's arrival.
  // THE PAGE HAS A LIVE RECORD WRITER (unlike leg 6's old-room page): the light hall arrives under the offers and hands
  // its pace report, which main books under `lite`. The read after the DECLINED offer allows exactly that booking and
  // nothing else (judgeDeclined: the record's own fields to the letter). The read after Tournament needs no such care:
  // the way out clears both rungs at once, and a report that comes after it stores nothing (main's rule: the light
  // hall's row is written only under a standard-hall verdict that leads to it; the boot arm holds the row and its plant).
  const GREEN = EN['settings.lookReloadConfirm'], CHANGE = EN['settings.lookChangeReloadConfirm'];
  const s = await session();
  try {
    const r2 = await boot(s, appUrl(HALLQ), { seed: seedOld('pace-median') });
    const tier = tierOf(r2), app = appOf(r2);
    check(`a stored pace 'old' boots the light hall's stage { default, hall, stage, ${tier}, light-new, rung lite }`, eq(r2.lookBoot, { asked: 'default', shown: 'hall', flow: 'stage', tier, why: 'light-new', rung: 'lite' }), J(r2.lookBoot));
    await until('the page live on the stage', T.paint, () => s.c.eval('window.__test?.ready === true'));
    const before = (await read(s)).record;
    await s.c.eval("window.__lbSentinel = 3; window.__settings.set('look', 'green')");
    const b1 = await confirmBody(s);
    check("Green on this page opens main's reload offer (settings.lookReloadConfirm)", b1 === GREEN, J(b1));
    await answer(s, false); await gone(s);
    const afterGreen = await read(s, true), jd = judgeDeclined(before, afterGreen.record, afterGreen.club?.stage?.pace ?? null);
    check(`declined: the page stays, the record is untouched${jd.booked ? " but for the light hall's own pace report, which main booked under `lite` meanwhile" : ''}`, jd.ok && (await s.c.eval('window.__lbSentinel')) === 3, jd.why ? `${jd.why}: ${before} -> ${afterGreen.record}` : String(before));
    await s.c.eval("window.__settings.set('look', 'tournament')");
    const b2 = await confirmBody(s);
    const mid = await read(s), cleared = rec(mid);
    check('Tournament again opens the reload offer on a page that shows the light hall (settings.lookChangeReloadConfirm): a reload would show the other hall', b2 === CHANGE, J(b2));
    check("both rungs are cleared BEFORE the offer is answered: verdict null, why 'anew', no member `lite`, the same app", cleared?.verdict === null && cleared?.why === 'anew' && !('lite' in (cleared ?? {})) && cleared?.app === app, mid.record);
    const r3 = await boot(s, () => answer(s, true).catch(() => true), {}); // (the click reloads the page: an answer lost to that navigation is not an error)
    check("accepted: the page reloads into the STANDARD hall's stage, why 'pass-anew', no rung", r3.lookBoot?.why === 'pass-anew' && r3.lookBoot?.flow === 'stage' && r3.lookBoot?.shown === 'hall' && !('rung' in (r3.lookBoot ?? {})), J(r3.lookBoot));
    out.legs['6d'] = { boots: [r2.lookBoot, r3.lookBoot], cleared, bodies: [b1, b2] };
  } finally { await s.close(); }
};

legs['7'] = async () => {
  // e2e-ballreturn's recipe: a layout in the kernel's frame, +x toward the right middle pocket; cue -> 1 straight along +x,
  // a stun shot. Nothing here computes a path: the kernel plays the shot and the game says what fell.
  const LAYOUT = [{ id: 0, x: 0.05, y: 0.0 }, { id: 1, x: 0.38, y: 0.0 }, { id: 9, x: 0.3, y: -0.9 }];
  const SHOT = { v0: 2.6, phi: 0, theta: 0, a: 0, b: 0 };
  const s = await session();
  try {
    await boot(s, appUrl(HALLQ));
    const r = await hall(s);
    check("the page shows the hall (the leaf's stage ended on it)", r.lookBoot?.shown === 'hall' && r.club?.stage?.phase === 'hall', J({ lookBoot: r.lookBoot, phase: r.club?.stage?.phase }));
    const shell = await s.c.eval('(() => { const h = window.__shell; if (!h || !h.isOpen()) return "closed"; return h.quickPlay() === true ? "quick-play" : "refused"; })()');
    info(`the shell: ${shell}`);
    // (the shell's way out runs its own camera move and start of play: the layout is laid after it, not under it)
    if (shell !== 'closed') await until('the shell left', DEV ? 120000 : 15000, () => s.c.eval('(() => { const h = window.__shell; try { return !h.isOpen() && !h.moving(); } catch (e) { return true; } })()'), DEV ? 1000 : 150).catch((e) => info(String(e.message)));
    await s.c.eval(`__test.layout(${J(LAYOUT)})`);
    await sleep(DEV ? 0 : 300);
    const refused = await s.c.eval(`__test.shoot(${J(SHOT)})`);
    check('the shot is accepted', !refused, String(refused));
    // (settled = the game holds the shot's record and has left SIMULATING / PLAYBACK)
    await until('the shot settled', DEV ? 240000 : 30000, async () => { const x = await s.c.eval('({ st: __test.state(), n: __test.events().length })'); return x.n > 0 && x.st !== 'SIMULATING' && x.st !== 'PLAYBACK'; }, DEV ? 1000 : 200);
    const got = await s.c.eval('({ state: __test.state(), pots: __test.events().filter((e) => e.kind && e.kind.BallPocket).map((e) => e.kind.BallPocket), one: __test.balls().find((b) => b.id === 1), outcome: (() => { try { return JSON.parse(JSON.stringify(__test.outcome() ?? null)); } catch (e) { return String(e); } })(), errors: __test.errors.slice(0, 5).map(String), hall: !!(window.__club && window.__club.ready === true && window.__club.shown === true && window.__club.enabled !== false) })');
    check("ball 1 is pocketed, by the game's own record and ball state", got.pots.some((p) => p.ball === 1) && got.one?.pocketed === true, J({ pots: got.pots, one: got.one && { pocketed: got.one.pocketed } }));
    check('the hall is still up and the app reports no error', got.hall === true && got.errors.length === 0, J({ hall: got.hall, errors: got.errors }));
    info(`state ${got.state}; outcome ${J(got.outcome)?.slice(0, 200)}`);
    out.legs['7'] = { shell, pots: got.pots, state: got.state };
  } finally { await s.close(); }
};

legs['8'] = async () => {
  const url = appUrl();
  const facts = (r) => ({ history: r.history, referrer: r.referrer, navType: r.navType, href: r.href });
  // the launcher's default: the pin on, the launch held (about:blank, the seed, then a replacing navigation)
  const s = await session({ pin: true, direct: url });
  let held = null;
  try {
    held = await read(s);
    check('the launcher\'s last word on stderr is that the pin is ON', String(s.pinLine).startsWith('[launch] look pin ON'), J(s.pinLine));
    check("after the held launch: history.length 1, an empty referrer, navigation type 'navigate', the launch URL", eq(facts(held), { history: 1, referrer: '', navType: 'navigate', href: url }), J(facts(held)));
    await until('the pinned boot ready', T.paint, () => s.c.eval('window.__test?.ready === true'));
    const r = await read(s);
    const x = rec(r);
    check("the pinned boot shows the old room: lookBoot.why 'verdict-pin'", r.lookBoot?.shown === 'old' && r.lookBoot?.flow === 'none' && r.lookBoot?.why === 'verdict-pin', J(r.lookBoot));
    check("the record is the launcher's seed (why 'pin')", x?.verdict === 'old' && x?.why === 'pin', r.record);
    check('no leaf: window.__club was never defined on the untouched page', await s.c.eval("!('__club' in window)"), 'window.__club exists');
    // the pin is not cleared by the player's way out, and a pinned page offers no reload for Tournament
    await s.c.eval("window.__settings.set('look', 'green')");
    if (await confirmBody(s)) { await answer(s, false); await gone(s); }
    await s.c.eval("window.__settings.set('look', 'tournament')");
    await sleep(DEV ? 15000 : 1200);
    const after = await read(s);
    check("Green then Tournament under the pin: no reload offer, the record keeps why 'pin'", (await confirms(s)) === 0 && rec(after)?.why === 'pin', J({ confirms: await confirms(s), record: after.record }));
    // a reload stays pinned, and (the network now watched) asks for no leaf URL
    const r2 = await boot(s, 'reload');
    await until('the pinned reload ready', T.paint, () => s.c.eval('window.__test?.ready === true'));
    const r2b = await read(s);
    check("a reload is pinned too: 'verdict-pin', no request under the leaf", r2.lookBoot?.why === 'verdict-pin' && noLeaf(s, r2b), J({ lookBoot: r2.lookBoot, leaf: s.leaf.length, ...leafSaid(s), rt: r2b.leafCount }));
    saidLate(s, 'the pinned reload');
    out.legs['8'] = { held: facts(held), lookBoot: r.lookBoot, said: s.pinLine };
  } finally { await s.close(); }
  // the direct launch (lookPin: false): the same three facts
  const d = await session({ pin: false, direct: url });
  try {
    const r = await read(d);
    check('the launcher\'s last word on stderr is that the pin is OFF', String(d.pinLine).startsWith('[launch] look pin OFF'), J(d.pinLine));
    check('a direct launch reads the same history length, referrer and navigation type as the held one', held !== null && eq(facts(r), facts(held)), `${J(facts(r))} against ${J(held && facts(held))}`);
    await until('the boot rules decided', T.paint, () => d.c.eval('!!(window.__test && window.__test.lookBoot)'));
    const r2 = await read(d);
    check("with the pin off the same URL is the stage flow (shown 'hall')", r2.lookBoot?.shown === 'hall' && r2.lookBoot?.flow === 'stage', J(r2.lookBoot));
    (out.legs['8'] ??= {}).direct = { ...facts(r), lookBoot: r2.lookBoot };
  } finally { await d.close(); }
};

/** web/sw.js's BOOT manifest against the served tree: the entries whose file is not the bytes the manifest digests. The
 * worker refuses to install over ONE such entry (sw.js, install: "ANY boot entry still missing ... fails the install"),
 * so a tree whose sw.js was not regenerated has no offline page at all. (The deploy's gate is gen-sw-precache --check.) */
function staleBootEntries(sw = fs.readFileSync(path.join(webDir, 'sw.js'), 'utf8'), bytes = (rel) => fs.readFileSync(path.resolve(webDir, rel))) {
  const a = sw.indexOf('const PRECACHE = ['), b = sw.indexOf('\n];', a);
  if (a < 0 || b < 0) return ['sw.js (no PRECACHE block)'];
  const stale = [];
  for (const m of sw.slice(a, b).matchAll(/\['([^']+)', '([0-9a-f]{16})', \d+\]/g)) {
    const rel = m[1].split('?')[0];
    let sha = null;
    try { sha = createHash('sha256').update(bytes(rel)).digest('hex').slice(0, 16); } catch { sha = null; /* no such file */ }
    if (sha !== m[2]) stale.push(rel.replace(/^\.\//, ''));
  }
  return stale;
}

legs['9'] = async () => {
  const OFF = { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }, ON = { ...OFF, offline: false };
  const stale = staleBootEntries();
  if (!check("web/sw.js's boot manifest is the served tree's (the worker installs only then)", stale.length === 0,
    `${stale.length} boot entr(ies) are not the bytes their digest names: ${stale.slice(0, 5).join(', ')}${stale.length > 5 ? ', ...' : ''}. The worker cannot install, so there is no offline page to test: run node web/tools/gen-sw-precache.mjs and commit web/sw.js`)) return;
  const s = await session();
  try {
    // The leaf's entry is HELD in the network for the two online boots (the worker passes it through: the leaf is not in
    // its snapshot). So nothing of the leaf runs in them: no hall whose pace would be measured while the worker installs
    // 15 MB beside it (a verdict of that boot would decide the next ones), and no fetch in flight that the cut could
    // fail and put on record between this leg's two reads of the record. (The most a held boot can store is ONE
    // timeout of main's bound, which is not a verdict; the boots after it are `pass-retry`, the stage all the same.)
    s.onPaused = (p) => { s.held.push(p.requestId); };
    await s.c.send('Fetch.enable', { patterns: [{ urlPattern: '*scene/club/index.js*' }] });
    // online first, with the service worker on (?sw=1, as the 3g arm turns it on). The worker never claims a page
    // (app.html), so the first visit installs it and a reload is the first page it controls.
    const U = appUrl(['sw=1', HALLQ].filter(Boolean).join('&'));
    const r0 = await boot(s, U);
    check('online, the boot is the stage flow', r0.lookBoot?.flow === 'stage', J(r0.lookBoot));
    await until('the service worker is installed and active', DEV ? 200000 : 60000, () => s.c.eval('Promise.race([navigator.serviceWorker.ready.then((r) => !!r.active && r.active.state === "activated"), new Promise((res) => setTimeout(() => res(false), 2000))])'), 500);
    const rc = await boot(s, 'reload');
    check('online, a reload is controlled by the worker and is the stage flow again', (await read(s)).sw === true && rc.lookBoot?.flow === 'stage', J({ lookBoot: rc.lookBoot }));
    const before = await read(s);
    // Offline: the page's requests fail (CDP) and navigator.onLine reads false. Chrome keeps that flag with a document's
    // inspector agent: a document reached by a NAVIGATION can start with it true again (seen: a boot navigated to
    // while offline decided `pass-new`), so the boot is a RELOAD, and the session sends the emulation again at every
    // main-frame commit while offline (s.offline). What the offline document read at its own start is printed.
    s.offline = OFF;
    await s.c.send('Network.emulateNetworkConditions', OFF);
    const offNow = await s.c.eval('navigator.onLine');
    check('with the network emulated offline navigator.onLine reads false', offNow === false, String(offNow));
    const r1 = await boot(s, 'reload');
    await until('the offline page ready', T.paint, () => s.c.eval('window.__test?.ready === true'));
    const r1b = await read(s);
    info(`the offline page: navigator.onLine read ${r1b.onLine0} at the document's start, ${r1.online} at first paint, ${r1b.online} once ready`);
    await s.c.send('Fetch.disable').catch(() => {});
    s.onPaused = null;
    const tier = tierOf(r1);
    check(`offline at boot, the worker serves the page: lookBoot { default, old, none, ${tier}, offline }`, lookIs(r1, { asked: 'default', shown: 'old', flow: 'none', tier, why: 'offline' }), J(r1.lookBoot));
    check('the page was served by the service worker', r1b.sw === true, 'no controller on the offline page');
    check('no leaf request, window.__club undefined', noLeaf(s, r1b), J({ leaf: s.leaf.length, ...leafSaid(s), rt: r1b.leafCount, club: r1b.clubDefined }));
    saidLate(s, 'the offline boot');
    check('the record was not read (no announcement) and is byte-equal', r1.announces.length === 0 && r1b.record === before.record, J({ announces: r1.announces.length, before: before.record, after: r1b.record }));
    // ?look=arena offline: not Tournament's row (the decision is url-arena; what follows is the curtain flow's own law)
    const ra = await boot(s, appUrl('sw=1&look=arena')).catch((e) => ({ error: String(e) }));
    let arena = null;
    if (!ra.error) {
      await until('the offline arena page ready or its leaf failed', DEV ? 60000 : 40000, async () => (await s.c.eval('window.__test?.ready === true')) || warned(s, /the club look is unavailable/).length > 0, 500).catch(() => {});
      const rb = await read(s, true);
      arena = { lookBoot: ra.lookBoot, unavailable: warned(s, /the club look is unavailable/).length, ready: rb.ready, hall: rb.clubShown, leafAsked: s.leaf.length, leafFromCache: s.leaf.filter((q) => q.cached).length };
      check("?look=arena offline: the decision does not move (url-arena, the curtain flow)", ra.lookBoot?.why === 'url-arena' && ra.lookBoot?.flow === 'curtain', J(ra.lookBoot));
      // (the emulation covers the PAGE's requests; the worker's own fetches for it are not offline, and the HTTP cache may
      // hold the leaf from the online boot: so this line states what was seen and asserts only the decision)
      info(`?look=arena offline: ${J(arena)} (the leaf's entry ${arena.unavailable ? 'did not arrive: the one warning, the old room stays' : 'arrived, through the worker or the HTTP cache'})`);
    } else info(`?look=arena offline: the page did not paint (${ra.error})`);
    // back online: the stage again
    s.offline = null;
    await s.c.send('Network.emulateNetworkConditions', ON);
    const r2 = await boot(s, U);
    check('back online, a boot is the stage flow again', r2.lookBoot?.flow === 'stage' && r2.lookBoot?.shown === 'hall' && r2.online === true, J({ lookBoot: r2.lookBoot, online: r2.online }));
    out.legs['9'] = { online: r0.lookBoot, offline: r1.lookBoot, onLineAtStart: r1b.onLine0, arenaOffline: arena, backOnline: r2.lookBoot, recordEqual: r1b.record === before.record };
  } finally { s.offline = null; await s.c.send('Fetch.disable').catch(() => {}); await s.c.send('Network.emulateNetworkConditions', ON).catch(() => {}); await s.close(); }
};

legs['10'] = async () => {
  const cost = (s) => {
    const leaf = s.leaf.slice(), wire = leaf.filter((q) => !q.cached);
    return { asked: leaf.length, fromCache: leaf.filter((q) => q.cached).length, reachedServer: wire.length, full: wire.filter((q) => q.status === 200).length, notModified: wire.filter((q) => q.status === 304).length,
      failed: leaf.filter((q) => q.failed).length, pending: leaf.filter((q) => !q.done).length, bytesFromServer: wire.reduce((a, q) => a + (q.bytes || 0), 0),
      all: { asked: s.reqs.size, reachedServer: [...s.reqs.values()].filter((q) => !q.cached).length, bytesFromServer: [...s.reqs.values()].filter((q) => !q.cached).reduce((a, q) => a + (q.bytes || 0), 0) } };
  };
  // under the development switch a second hall does not fit a job: each boot is taken to the end of the leaf's build AND
  // its wait for files and bakes (`life.stage.builtAtMs`, `life.stage.waited`), which is where its requests end
  const built = (s) => until("the leaf's build and its files", T.hall, () => s.c.eval('(() => { const k = window.__club; if (!k || typeof k.state !== "function") return false; if (k.ready === true) return true; const st = k.state().life.stage; return !!st && st.builtAtMs !== null && (st.waited !== null || st.failed !== null); })()'), 2000);
  const s = await session();
  try {
    await boot(s, appUrl(HALLQ));
    if (DEV) await built(s); else await hall(s);
    await sleep(DEV ? 0 : 1500);
    const first = cost(s);
    info(`first visit: ${J(first)}`);
    const b2 = await boot(s, appUrl(HALLQ)); // a second visit: the same URL, navigated to anew in the same profile
    if (b2.lookBoot?.shown !== 'hall') { // (a first visit whose report or failure took the hall away: there is no second hall to cost)
      check('the second visit is a hall boot', false, `lookBoot ${J(b2.lookBoot)}; record ${b2.record}`);
      out.legs['10'] = { first, second: null, toHall: !DEV };
      return;
    }
    let shown = null;
    if (DEV) { await built(s).catch((e) => info(`second visit: ${e.message}`)); } else { shown = await hall(s, 'the hall on the second visit'); }
    await sleep(DEV ? 0 : 1500);
    const second = cost(s);
    info(`second visit: ${J(second)}`);
    info(`the second visit's hall: ${second.reachedServer} of ${second.asked} leaf requests reached the server (${second.notModified} answered 304, ${second.full} in full), ${second.bytesFromServer} bytes from the server; the first visit: ${first.reachedServer} requests, ${first.bytesFromServer} bytes`);
    if (!DEV) check('the hall still appears on the second visit', shown?.club?.stage?.phase === 'hall', J(shown?.club?.stage?.phase));
    else info('(development switch) the second visit was taken to the end of the leaf\'s build, not to the hall');
    out.legs['10'] = { from: 'CDP Network events of each document (requestWillBeSent, requestServedFromCache, responseReceived.fromDiskCache, loadingFinished.encodedDataLength), URLs under scene/club or assets/club', server: 'python3 -m http.server (Last-Modified, no Cache-Control)', first, second, toHall: !DEV };
  } finally { await s.close(); }
};

legs['11'] = async () => {
  const M = (out.measures = { from: 'each number names its fact', firstPaint: { how: "performance.now(), from the document's time origin, at the first moment after the frame that made __test.renderedFrames() > 0 (seenBy 'task': a task right after that frame's callbacks; 'tick': the next animation tick came first; frameBegan = the tick of the delivering frame); a fresh profile per boot (cold HTTP cache); pin ON = the launcher's seed (the old room), pin OFF = the stage", pinOn: [], pinOff: [] }, boots: [] });
  for (const pin of [true, false]) {
    for (let i = 0; i < PAINTS && left() > 60000; i++) {
      const s = await session({ pin });
      try {
        const r = await boot(s, appUrl());
        (pin ? M.firstPaint.pinOn : M.firstPaint.pinOff).push({ ms: +r.fp.at.toFixed(1), frameBegan: r.fp.lower === null ? null : +r.fp.lower.toFixed(1), seenBy: r.fp.how, lookBoot: r.lookBoot?.why });
      } finally { await s.close(); }
    }
  }
  const med = (v) => { const a = v.map((x) => x.ms).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : null; };
  info(`time to first paint, pin ON (the old room): ${J(M.firstPaint.pinOn.map((x) => x.ms))} ms, median ${med(M.firstPaint.pinOn)}`);
  info(`time to first paint, pin OFF (the stage): ${J(M.firstPaint.pinOff.map((x) => x.ms))} ms, median ${med(M.firstPaint.pinOff)}`);
  for (const tier of HIGH ? ['', 'high'] : ['']) {
    for (let i = 0; i < BOOTS && left() > (DEV ? 400000 : 60000); i++) {
      const s = await session();
      try {
        const q = [tier ? `clubtier=${tier}` : '', HALLQ].filter(Boolean).join('&');
        const r0 = await boot(s, tier && DEV ? `${ORIGIN}/app.html?${q}` : appUrl(q));
        await hall(s);
        const r = await reported(s, r0.record);
        const st = r.club?.stage ?? {}, j = judgePace(st.pace);
        const row = { tier: r.club?.tier, lookBoot: r0.lookBoot, firstPaintMs: +r.fp.at.toFixed(1), leafInstallAtMs: r.clubAt === null ? null : +r.clubAt.toFixed(1),
          firstPaintToDissolveMs: r.clubAt === null || st.dissolveAtMs === null ? null : +(r.clubAt + st.dissolveAtMs - r.fp.at).toFixed(1),
          firstPaintToHallMs: r.clubAt === null || st.endAtMs === null ? null : +(r.clubAt + st.endAtMs - r.fp.at).toFixed(1),
          swapMs: st.swapMs, keptFrames: st.keptFrames, warm: st.warm, linkedInSwap: st.linkedInSwap, linkedAfterSwap: st.linkedAfterSwap, quietAtReveal: st.quietAtReveal, rest: st.rest, installed: st.installed,
          pace: st.pace, judged: { verdict: j.verdict, why: j.why }, record: rec(r),
          from: 'window.__club.state().life.stage (times in ms since the leaf\'s install began; leafInstallAtMs = the page clock when the leaf published window.__club); judged = main.js lookJudgePace' };
        M.boots.push(row);
        info(`boot ${M.boots.length} (${row.tier}): first paint ${row.firstPaintMs} ms, first paint to the dissolve ${row.firstPaintToDissolveMs} ms, to the hall ${row.firstPaintToHallMs} ms, swapMs ${row.swapMs}, keptFrames ${row.keptFrames}, warm ${J(row.warm)}, linkedInSwap ${row.linkedInSwap}, linkedAfterSwap ${row.linkedAfterSwap}; pace: period ${st.pace?.period?.ms}, hall ${J(st.pace?.hall)}; main.js says ${J(row.judged)}`);
      } finally { await s.close(); }
    }
  }
  // The third group (--sw N; none by default): a real player's FIRST VISIT. app.html registers the service worker at
  // `load` on every boot but an automated one, so on a player's device the worker's install (it fetches and digests the
  // whole boot set) and then its background fill run beside the stage, the leaf's load and the hall's pace window. Every
  // other boot of this suite but leg 9's runs without the worker. Here: N hall boots, a fresh profile each, on the
  // real-user URL with ?sw=1 and nothing else (a development run adds its own switch), to the hall and its pace report.
  // Numbers only: the same row as the boots above, the worker's times on the page's clock, and whether its install and
  // its fill shared time with the leaf's load and with the pace window.
  if (SWBOOTS > 0) {
    const r1 = (x) => (Number.isFinite(x) ? +x.toFixed(1) : null);
    const G = (M.sw = { asked: SWBOOTS, url: appUrl(['sw=1', HALLQ].filter(Boolean).join('&')), skipped: null, notBegun: 0, boots: [],
      from: "the same row as measures.boots[], plus sw = the worker as its page saw it (performance.now() of the page, the clock of first paint: registeredAtMs = register() resolved, installedAtMs / activatedAtMs = the worker's statechange events, fillSeenAtMs = its first { ob: 'swept' } message, fillEndAtMs = its 'fill end' one, controlled = navigator.serviceWorker.controller at the read) and spans, each [from, to] on that clock with to = null when it had not ended by the read (readAtMs): install = registeredAtMs to installedAtMs; fill = installedAtMs to fillEndAtMs; leafLoad = the first leaf request (resource timing) to the leaf's builtAtMs; paceWindow = the dissolve's begin (the hall's reveal) to the report (paceWindowEnd says how its end is known). The four booleans are overlaps() of those spans (null: a span never began)" });
    const stale = staleBootEntries();
    if (stale.length) {
      G.skipped = `web/sw.js's boot manifest is stale: ${stale.slice(0, 5).join(', ')}${stale.length > 5 ? ', ...' : ''}`;
      check("web/sw.js's boot manifest is the served tree's (the worker installs only then)", false,
        `${stale.length} boot entr(ies) are not the bytes their digest names: ${stale.slice(0, 5).join(', ')}${stale.length > 5 ? ', ...' : ''}. The worker cannot install, so the ${SWBOOTS} boot(s) with the worker are skipped: run node web/tools/gen-sw-precache.mjs and commit web/sw.js`);
    } else {
      for (let i = 0; i < SWBOOTS; i++) {
        if (left() <= (DEV ? 300000 : 60000)) { G.notBegun = SWBOOTS - i; info(`boot with the worker ${i + 1} of ${SWBOOTS} was not begun: ${Math.round(left() / 1000)} s were left before the suite's own deadline`); break; }
        const s = await session();
        try {
          let r0 = null, r = null, ended = null;
          try {
            r0 = await boot(s, G.url, { worker: true });
            await hall(s);
            r = await reported(s, r0.record);
          } catch (e) { ended = String(e?.message ?? e).slice(0, 400); }
          if (ended) { try { r = await read(s, true); } catch { r = r ?? r0; } } // the row as far as the boot got
          const st = r?.club?.stage ?? {}, j = st.pace ? judgePace(st.pace) : { verdict: null, why: 'no report' }, w = r?.swFacts ?? {}, now = r?.now ?? null, at = r?.clubAt ?? null;
          const onPage = (ms) => (Number.isFinite(at) && Number.isFinite(ms) ? at + ms : null); // the leaf's clock to the page's
          const wrote = (w.recordAt ?? []).filter((t) => t > (onPage(st.dissolveAtMs) ?? Infinity)).pop() ?? null;
          const span = { install: [w.registeredAtMs ?? null, w.installedAtMs ?? null], fill: [w.installedAtMs ?? null, w.fillEndAtMs ?? null],
            leafLoad: [r?.leafFirstAt ?? null, onPage(st.builtAtMs)], paceWindow: [onPage(st.dissolveAtMs), wrote ?? (st.pace ? now : null)] };
          const over = (a, b) => overlaps(a[0], a[1], b[0], b[1], now);
          const row = { tier: r?.club?.tier ?? tierOf(r0 ?? {}), lookBoot: r0?.lookBoot ?? null, url: G.url, incomplete: ended, firstPaintMs: r1(r?.fp?.at), leafInstallAtMs: r1(at),
            firstPaintToDissolveMs: r1(onPage(st.dissolveAtMs) === null ? null : onPage(st.dissolveAtMs) - r.fp.at),
            firstPaintToHallMs: r1(onPage(st.endAtMs) === null ? null : onPage(st.endAtMs) - r.fp.at),
            swapMs: st.swapMs, keptFrames: st.keptFrames, warm: st.warm, linkedInSwap: st.linkedInSwap, linkedAfterSwap: st.linkedAfterSwap, quietAtReveal: st.quietAtReveal, rest: st.rest, installed: st.installed,
            pace: st.pace ?? null, judged: { verdict: j.verdict, why: j.why }, record: r ? rec(r) : null,
            sw: { registeredAtMs: r1(w.registeredAtMs), installedAtMs: r1(w.installedAtMs), activatedAtMs: r1(w.activatedAtMs), controlled: r?.sw ?? null, fillSeenAtMs: r1(w.fillSeenAtMs), fillEndAtMs: r1(w.fillEndAtMs),
              states: w.states ?? null, swept: w.swept ?? null, errors: w.err ?? null },
            spans: { install: span.install.map(r1), fill: span.fill.map(r1), leafLoad: span.leafLoad.map(r1), paceWindow: span.paceWindow.map(r1), readAtMs: r1(now),
              paceWindowEnd: wrote !== null ? "the verdict record's write" : st.pace ? 'the read that first saw the report (an upper bound: no verdict record was written to time it)' : 'no report by the read' },
            installOverlapsLeafLoad: over(span.install, span.leafLoad), installOverlapsPaceWindow: over(span.install, span.paceWindow),
            fillOverlapsLeafLoad: over(span.fill, span.leafLoad), fillOverlapsPaceWindow: over(span.fill, span.paceWindow),
            from: 'as measures.boots[] (window.__club.state().life.stage; judged = main.js lookJudgePace); sw and spans: see measures.sw.from' };
          G.boots.push(row);
          info(`boot ${G.boots.length} with the worker (${row.tier}; ${G.url.slice(ORIGIN.length)}${HIGH ? '; --tier high adds no boot here: this group is the real-user URL only, on the tier the boot rules give' : ''})${ended ? ` AS FAR AS IT GOT (${ended})` : ''}: `
            + `first paint ${row.firstPaintMs} ms, first paint to the dissolve ${row.firstPaintToDissolveMs} ms, to the hall ${row.firstPaintToHallMs} ms, swapMs ${row.swapMs}, keptFrames ${row.keptFrames}; `
            + `the worker: registered at ${row.sw.registeredAtMs} ms, installed at ${row.sw.installedAtMs}, activated at ${row.sw.activatedAtMs}, controlled ${row.sw.controlled}, fill seen at ${row.sw.fillSeenAtMs}, fill end at ${row.sw.fillEndAtMs} (read at ${row.spans.readAtMs}; states ${J(row.sw.states)}; swept ${J(row.sw.swept)}${row.sw.errors?.length ? `; errors ${J(row.sw.errors)}` : ''}); `
            + `the leaf's load ${J(row.spans.leafLoad)} ms, the pace window ${J(row.spans.paceWindow)} ms (its end: ${row.spans.paceWindowEnd}); `
            + `the install overlapped the leaf's load: ${row.installOverlapsLeafLoad}, the pace window: ${row.installOverlapsPaceWindow}; the fill overlapped the leaf's load: ${row.fillOverlapsLeafLoad}, the pace window: ${row.fillOverlapsPaceWindow}; `
            + `pace: period ${st.pace?.period?.ms}, hall ${J(st.pace?.hall)}; main.js says ${J(row.judged)}`);
          if (ended) throw new Error(`boot ${G.boots.length} with the worker did not reach its report: ${ended}`);
        } finally { await s.close(); }
      }
    }
  }
  // The fourth group (--slow N; none by default): a FIRST VISIT OVER A SLOW LINK, with the worker and without it. The
  // group above cannot show the case that matters: against a local server the worker has installed before the stage
  // paints. Here the page comes from the suite's own paced server (one link for the page and the worker; the rate and
  // the latency are the 3G arm's), a fresh profile each, the real-user URL with ?sw=1, and beside it the same visit
  // with ?sw=0. Per visit: did the hall arrive, or did main's bound or a failure bring the old room (the reason and its
  // class by main.js's own rule); the stored record; what the next boot decides (with --slow-follow a SECOND and a THIRD
  // boot of the same profile, each taken to its own outcome); first paint, the leaf's load, the worker's spans and the
  // overlaps; the pace when a hall was shown. With --slow-rates the first visit runs once more at each faster rate, and
  // one line says at which rate the hall first arrived inside main's bound. Numbers only, with two kinds of assertion:
  // each boot reaches ready, and THE ONE LAW (lines headed `LAW`): no 'old' verdict from a boot in which a leaf request
  // had been asked and had neither arrived nor failed when its bound or budget fired.
  if (SLOWBOOTS > 0 || SLOWRATES.length) {
    const r1 = (x) => (Number.isFinite(x) ? +x.toFixed(1) : null);
    const nets = linkRates(), named = nets[SLOWNET] ?? null;
    if (!named && (SLOWRATE === null || SLOWLAT === null)) throw new Error(`--slow-net ${SLOWNET}: the 3G arm's table (web/tools/e2e-userboot-3g.mjs, NETS) holds ${J(Object.keys(nets))}; name one of them, or give both --slow-rate and --slow-latency`);
    const link = { name: SLOWRATE === null && SLOWLAT === null ? SLOWNET : `${named ? SLOWNET : 'none'} with other numbers`, rate: SLOWRATE ?? named.rate, latency: SLOWLAT ?? named.latency, maxAge: SLOWMAXAGE };
    const rates = SLOWRATES.map((x) => (/^x\d+(\.\d+)?$/.test(x) ? Math.round(link.rate * Number(x.slice(1))) : Math.round(Number(x))));
    if (rates.some((n) => !(n > 0))) throw new Error(`--slow-rates ${SLOWRATES.join(',')}: each is a rate in bytes per second, or xN (N times the link's ${link.rate})`);
    const budgetQ = SLOWBOUND && DEV ? '' : HALLQ; // (the development switch's longer service budget, unless main's own bound is asked for)
    const boundMs = RULES.stageBound(Number(/clubtimeout=(\d+)/.exec(budgetQ)?.[1] ?? 0));
    const forced = !DEV ? "nothing is forced: the tier is the device's and the bound is the product's"
      : budgetQ ? `FORCED by OB_LOOKBOOT_DEV: clubtier=base and ${budgetQ}, so main's bound is ${boundMs} ms and NOT the product's ${RULES.STAGE_MAX_MS} ms`
        : `FORCED by OB_LOOKBOOT_DEV: clubtier=base; the longer service budget is left out (--slow-bound product), so main's bound is the product's ${boundMs} ms, which a software renderer does not meet`;
    const manifestBytes = [...fs.readFileSync(path.join(webDir, 'sw.js'), 'utf8').matchAll(/\['[^']+', '[0-9a-f]{16}', (\d+)\]/g)].reduce((a, m) => a + Number(m[1]), 0) || 40e6;
    const paintWait = Math.max(T.paint, 60000 + Math.round((2 * manifestBytes) / link.rate) * 1000); // (twice the worker's whole manifest over the link, and a minute)
    const LAW = "no 'old' verdict from a boot in which a leaf request had been asked and had neither arrived nor failed when its bound or budget fired";
    const G = (M.slow = { asked: SLOWBOOTS, only: SLOWONLY, follow: SLOWFOLLOW, ratesAsked: rates, link: { ...link, gzip: [...GZIP_EXT], from: "web/tools/e2e-userboot-3g.mjs NETS as text (rate = its downloadThroughput in bytes/s, latency in ms), unless the name says 'with other numbers'; served by this suite's paced server: the rate is shared by every response in flight and counts the bytes on the link (compressed where the answer is), the latency precedes each response; gzip = the extensions it compresses" },
      origin: SLOW_ORIGIN, boundMs, productBoundMs: RULES.STAGE_MAX_MS, forced, notBegun: 0, visits: [], rates: null,
      law: { text: LAW, boots: 0, broken: 0, from: "one judgement per boot taken to its outcome (each row's `law`, and `next.law`, `third.law`): storedOld = the record's verdict became 'old' in this boot; firedMs = main's own line 'the hall could not be had' on the page's clock; budgetFired = it fired with a reason whose class (main.js lookFailClass) is not 'build'; asked / pending = the PAGE's leaf requests at this suite's paced server by then, pending = asked and neither wholly answered (a 304 arrives when it is answered) nor given up by the client; entryIn = the leaf's install had begun by then (its entry module had arrived and run); an entry that was not in counts as one pending request; ok = not (storedOld and budgetFired and pending > 0)" },
      from: "one row per first visit (worker 'on' = ?sw=1, 'off' = ?sw=0; rate = the link's bytes/s of that visit, byRate = one of --slow-rates): outcome 'hall' (the leaf ready and shown) or 'fallback' (main's own line 'the hall could not be had (<reason>)'; class = main.js lookFailClass(reason); firstPaintToFallbackMs from the record's failAt); record = the stored verdict record at the visit's end; stage, pace, judged, sw, spans and the four overlap booleans as in measures.sw (an install that ended 'redundant' ends its span there); served = what the paced server sent to the page and to the worker (requests whose referrer is the worker script): linkBytes over the link, bodyBytes of the files, ms since the navigation on the suite's clock; next = the second boot (a reload of the same profile on the same link): with --slow-follow taken to its outcome, else read at its first paint; third = the third boot, taken to its outcome (--slow-follow); cost = costOfBoot(next.lookBoot, the record it began with), costAfterSecond the same for the third boot" });
    info(`the slow link: ${link.name} (${link.rate} bytes/s ON THE LINK shared by every response in flight, ${link.latency} ms before each response; the 3G arm's table: ${J(nets)}), served at ${SLOW_ORIGIN} by this suite as the site's host answers: gzip for ${[...GZIP_EXT].join(' ')} (pictures and sound as they are), Cache-Control: max-age=${link.maxAge}${link.maxAge === 600 ? '' : " (NOT the host's 600: every stored file is stale after it)"}, a weak ETag and Last-Modified, 304 to both validators; main's bound ${boundMs} ms after first paint; ${forced}${rates.length ? `; the first visit also at ${rates.join(', ')} bytes/s (the same latency)` : ''}`);
    assertPortOutsideForeignBands(SLOW_PORT, 'the paced http port');
    const srv = await pacedServer(webDir, SLOW_PORT, link);
    // what the paced server answers, asked by this process before any browser: a text file, the kernel's wasm and a
    // picture, plain and with each validator (the headers that decide what a browser's cache may do)
    const ask = (p, headers) => new Promise((resolve) => {
      const q = http.request(`${SLOW_ORIGIN}${p}`, { method: 'GET', headers }, (res) => {
        let n = 0;
        res.on('data', (c) => { n += c.length; });
        res.on('end', () => resolve({ path: p, sent: headers, status: res.statusCode, bodyBytesOnTheLink: n, headers: Object.fromEntries(['content-type', 'content-encoding', 'content-length', 'vary', 'cache-control', 'etag', 'last-modified'].map((k) => [k, res.headers[k] ?? null])) }));
      });
      q.on('error', (e) => resolve({ path: p, sent: headers, error: String(e.message) }));
      q.end();
    });
    const text = '/app/main.js', picture = '/assets/club/arena-light.png';
    const wasm = (() => { try { const d = path.join(webDir, 'dist', 'pool-wasm'); const f = fs.readdirSync(d).filter((x) => x.endsWith('.wasm')).sort()[0]; return f ? `/dist/pool-wasm/${f}` : null; } catch { return null; } })();
    srv.setRate(1e9); // (the probe is not a visit: it is not paced)
    const first = await ask(text, { 'accept-encoding': 'gzip, deflate' });
    G.server = { from: 'this process asked the paced server before any browser did (node http, no cache): the status, the body bytes that came over the link and the headers of each answer', answers: [first, await ask(text, {}),
      await ask(text, { 'accept-encoding': 'gzip, deflate', 'if-none-match': first.headers?.etag ?? '' }), await ask(text, { 'accept-encoding': 'gzip, deflate', 'if-modified-since': first.headers?.['last-modified'] ?? '' }),
      ...(wasm ? [await ask(wasm, { 'accept-encoding': 'gzip, deflate' }), await ask(wasm, {})] : []),
      await ask(picture, { 'accept-encoding': 'gzip, deflate' }), await ask('/no-such-file.js', {})] };
    srv.setRate(link.rate);
    info(`the paced server's answers: ${G.server.answers.map((a) => (a.error ? `${a.path}: ${a.error}` : `GET ${a.path} ${J(a.sent)} -> ${a.status}, ${a.bodyBytesOnTheLink} body bytes on the link, ${J(Object.fromEntries(Object.entries(a.headers).filter(([, v]) => v !== null)))}`)).join(' | ')}`);
    const fellOf = (lines) => { const l = lines.filter((x) => /the hall could not be had \(/.test(x))[0]; return l ? (/the hall could not be had \((.*)\): the old room is shown/.exec(l)?.[1] ?? l) : null; };
    const leafFile = { from: "every request under scene/club and assets/club that reached this suite's paced server, per boot: path, who asked (the page or the worker), status, bytes (the body), linkBytes (over the link), askedMs / firstMs / endMs = the request's arrival, the first body byte sent and the answer wholly sent (a 304 or a 404: when it was answered), cutMs = the client gave the request up before that, in ms since the navigation on the page's clock (the server's times moved onto it); boundFiredMs = main's own line 'the hall could not be had' on that clock (null: it did not fire)", link, boundMs, forced, boots: [] };
    /** What one boot's read and the paced server's rows say of main's bound: the leaf's requests when it fired, by group,
     * and the times of what the page showed. Everything on the page's clock (ms since the navigation). */
    const boundFacts = (r, served, list, sentBy) => {
      const record = r ? rec(r) : null, w = r?.swFacts ?? {}, st = r?.club?.stage ?? {}, at = r?.clubAt ?? null;
      const shift = Number.isFinite(r?.origin) ? served.at - r.origin : null; // the server's clock to the page's
      const fired = Number.isFinite(w.fallAt) ? w.fallAt : r?.club?.shown !== true && Number.isFinite(record?.failAt) && Number.isFinite(r?.origin) && record.failAt >= r.origin ? record.failAt - r.origin : null;
      const mv = (x) => (x === null || x === undefined || shift === null ? null : +(x + shift).toFixed(1));
      const rows = list.map((e) => ({ ...e, askedMs: mv(e.askedMs), firstMs: mv(e.firstMs), endMs: mv(e.endMs), cutMs: mv(e.cutMs) }));
      const full = rows.filter((e) => e.status === 200), last = (of) => of.reduce((m, e) => (e.endMs !== null && e.endMs > m ? e.endMs : m), 0) || null;
      const leafServer = { asked: rows.length, full: full.length, gzipped: full.filter((e) => e.gzip).length, notModified: rows.filter((e) => e.status === 304).length, other: rows.filter((e) => e.status !== 200 && e.status !== 304).length,
        bytes: full.reduce((a, e) => a + (e.bytes ?? 0), 0), linkBytes: full.reduce((a, e) => a + (e.linkBytes ?? 0), 0) };
      let table = null;
      // (every request counts, whatever its answer: a revalidation that was asked and not yet answered is as pending as a file)
      if (fired !== null && shift !== null) { table = { firedMs: r1(fired), ...leafAtBound(rows, fired), sentLinkBytes: sentBy(fired - shift) }; table.missingLinkBytes = table.linkBytes - table.sentLinkBytes; }
      const frames = (w.fallFrames ?? []).map((x) => x[0]);
      const timeline = { firstPaintMs: r1(r?.fp?.at), leafFirstRequestMs: r1(r?.leafFirstAt), leafInstallBeganMs: r1(at), boundFiredMs: r1(fired), keptFrameMs: r1(frames[0]), dissolveBeganMs: r1(frames[1]), oldRoomAloneMs: r1(dissolveEnd(frames, RULES.dissolve)),
        leafBuiltMs: r1(Number.isFinite(at) && Number.isFinite(st.builtAtMs) ? at + st.builtAtMs : null), leafLastByteMs: r1(last(full)), leafLastAnswerMs: r1(last(rows)), readAtMs: r1(r?.now), framesAfterBound: frames.length,
        leafAfter: { phase: st.phase ?? null, failed: st.failed ?? null, ready: r?.club?.ready ?? null, shown: r?.club?.shown ?? null, enabled: r?.club?.enabled ?? null },
        from: "the page's clock, ms since the navigation: first paint (the dark stage); the leaf's first request (Resource Timing) and the write of window.__club; boundFiredMs = main's line 'the hall could not be had' (its console call); the delivered frames after it (__test.renderedFrames() moved): keptFrameMs = the first (the stage as drawn, kept), dissolveBeganMs = the second, oldRoomAloneMs = the frame at which main.js's own dissolve arithmetic reaches 1 over those frames' times (null: not reached by the read, or the line was not read); leafBuiltMs = the leaf's builtAtMs; leafLastByteMs = the last leaf body byte the paced server sent, leafLastAnswerMs = its last leaf answer of any kind; leafAfter = the leaf's own state at the read" };
      return { rows, leafServer, table, timeline };
    };
    const tableLine = (t) => (t ? `the leaf's requests AT THE SERVER when main's line was printed (${t.firedMs} ms after the navigation; asked = the request had reached the server, which is later than the page's own call for the file): ${Object.entries(t.groups).map(([g, x]) => `${g}: ${x.files} requests / ${x.bytes} body bytes / ${x.linkBytes} on the link, ${x.asked} asked, ${x.arrived} arrived (${x.linkBytesArrived} on the link), ${x.pending} pending`).join('; ')}; ALL: ${t.files} requests / ${t.bytes} body bytes / ${t.linkBytes} on the link, ${t.asked} asked, ${t.arrived} arrived (${t.linkBytesArrived} on the link), ${t.pending} PENDING; the server had sent ${t.sentLinkBytes} leaf bytes over the link by then: ${t.missingLinkBytes} of the bytes this boot asked for in all were still to come` : "main's line was not printed: no table");
    const timeLine = (x) => `what the page showed, ms since the navigation: first paint ${x.firstPaintMs}; the leaf's first request ${x.leafFirstRequestMs}; the leaf's install began ${x.leafInstallBeganMs}; main's bound fired ${x.boundFiredMs}; the kept frame ${x.keptFrameMs}; the dissolve began ${x.dissolveBeganMs}; the old room alone ${x.oldRoomAloneMs} (${x.framesAfterBound} delivered frames seen after the bound); the leaf's build ended ${x.leafBuiltMs}; the leaf's last byte ${x.leafLastByteMs}, its last answer ${x.leafLastAnswerMs}; read at ${x.readAtMs}; the leaf then: ${J(x.leafAfter)}`;
    const sent = (x) => `${x.requests} requests / ${x.linkBytes} bytes on the link (${x.bodyBytes} of bodies; ${x.gzipped} gzipped, ${x.notModified} answered 304)${x.firstMs === null ? '' : x.lastMs === null ? ` (from ${x.firstMs} ms; no body byte was sent)` : ` (${x.firstMs} to ${x.lastMs} ms)`}`;
    const brief = (x) => J(x && { verdict: x.verdict, why: x.why, passed: x.passed, slow: x.slow, fails: x.fails, reason: x.reason });
    /** The one law for one boot (slowLaw) with its facts in words; lawSay prints them as an INFO line and the verdict as
     * a line headed LAW (the measure's other lines are INFO, and its two `reaches ready` checks are not headed so). */
    const lawOf = (no, before, after, reason, bf, r) => {
      const L = { boot: no, ...slowLaw({ before, after, cls: reason === null ? null : RULES.lookFailClass(reason), firedMs: bf.timeline.boundFiredMs, rows: bf.rows.filter((e) => e.who === 'page'), entryAtMs: r?.clubAt ?? null }) };
      L.facts = `the record's verdict ${J(L.verdictBefore)} -> ${J(L.verdictAfter)}${L.storedOld ? ` ('old' WAS STORED by this boot, why '${L.whyAfter}')` : " (no 'old' was stored by this boot)"}; `
        + (L.firedMs === null ? "main's line was not printed (no bound or budget fired)" : `main's line at ${L.firedMs} ms (class ${L.class}${L.budgetFired ? '' : ': not a bound or a budget'}): ${L.asked} leaf request(s) of the page had reached the server by then, ${L.pending} PENDING there${L.pendingPaths.length ? ` (${L.pendingPaths.slice(0, 5).join(', ')}${L.pending > 5 ? ', ...' : ''})` : ''}; the leaf's entry ${L.entryIn ? 'had arrived' : 'had NOT arrived'}`);
      return L;
    };
    const lawSay = (what, L) => {
      G.law.boots += 1;
      if (!L.ok) G.law.broken += 1;
      info(`${what}, boot ${L.boot}, the law's facts: ${L.facts}`);
      check(`LAW ${what}, boot ${L.boot}: ${LAW}`, L.ok, L.facts);
    };
    // A worker installs only from a boot manifest that is the served tree's (leg 9's check, in node): on a stale one a
    // worker-ON visit would be the visit of a worker that never installs, so those visits are refused by name.
    const asked = SLOWONLY ? [SLOWONLY === 'on'] : [true, false], staleSw = asked.includes(true) ? staleBootEntries() : [], runs = [];
    if (staleSw.length) {
      G.skipped = `web/sw.js's boot manifest is stale: ${staleSw.slice(0, 5).join(', ')}${staleSw.length > 5 ? ', ...' : ''}`;
      check("web/sw.js's boot manifest is the served tree's (the worker installs only then)", false,
        `${staleSw.length} boot entr(ies) are not the bytes their digest names: ${staleSw.slice(0, 5).join(', ')}${staleSw.length > 5 ? ', ...' : ''}. The worker cannot install, so the slow visits with the worker ON are skipped: run node web/tools/gen-sw-precache.mjs and commit web/sw.js`);
    }
    const states = staleSw.length ? asked.filter((on) => !on) : asked;
    for (let i = 0; i < SLOWBOOTS; i++) for (const on of states) runs.push({ visit: i + 1, on, rate: link.rate, follow: SLOWFOLLOW, byRate: false });
    rates.forEach((rate, k) => { for (const on of states) runs.push({ visit: SLOWBOOTS + k + 1, on, rate, follow: false, byRate: true }); });
    try {
      for (const run of runs) {
        const { on } = run, what = `slow first visit ${run.visit}${run.byRate ? ` at ${run.rate} bytes/s` : ''}, worker ${on ? 'ON' : 'OFF'}`;
        const need = DEV ? (run.follow ? 280000 : 150000) : (run.follow ? 240000 : 120000);
        if (left() <= need) { G.notBegun += 1; info(`${what} was not begun: ${Math.round(left() / 1000)} s were left before the suite's own deadline`); continue; }
        srv.setRate(run.rate);
        const s = await session(); // (launched on the other server's root: the launcher's served-tree check is met there; the paced origin is navigated to)
        try {
          const url = `${SLOW_ORIGIN}/app.html${Q([on ? 'sw=1' : 'sw=0', budgetQ].filter(Boolean).join('&'))}`;
          const fellBack = () => { const l = warned(s, /the hall could not be had \(/)[0]; return l ? (/the hall could not be had \((.*)\): the old room is shown/.exec(l)?.[1] ?? l) : null; };
          const paintedDoc = (n, name) => until(name, paintWait, () => s.c.eval(`!!(window.__obLB && window.__obLB.nonce === ${n} && window.__obLB.fp.at !== null)`), 500);
          let r0 = null, r = null, ended = null;
          srv.reset();
          try {
            const n = await arm(s, { worker: 'fall' });
            await s.c.send('Page.navigate', { url });
            await paintedDoc(n, `${what}: first paint`);
            r0 = await read(s);
            if (r0.lookBoot?.flow === 'stage') await until(`${what}: the hall or the fall-back`, Math.min(boundMs, 30000) + T.hall, async () => (await s.c.eval('!!(window.__club && window.__club.ready === true)')) || fellBack() !== null, DEV ? 1000 : 250);
            await until(`${what}: the page ready`, T.fail, () => s.c.eval('!!(window.__test && window.__test.ready === true)'), 500);
            r = await read(s, true);
            if (r.club?.shown === true) r = await reported(s, r0.record);
          } catch (e) { ended = String(e?.message ?? e).slice(0, 400); try { r = await read(s, true); } catch { r = r ?? r0; } }
          const served = srv.counts(), bf = boundFacts(r, served, srv.leaf(), (ms) => srv.leafBytesBy(ms));
          leafFile.boots.push({ visit: run.visit, worker: on ? 'on' : 'off', rate: run.rate, boot: 1, boundFiredMs: bf.timeline.boundFiredMs, firstPaintMs: bf.timeline.firstPaintMs, requests: bf.rows });
          const st = r?.club?.stage ?? {}, w = r?.swFacts ?? {}, now = r?.now ?? null, at = r?.clubAt ?? null, record = r ? rec(r) : null, fp = r?.fp?.at ?? null;
          const onPage = (ms) => (Number.isFinite(at) && Number.isFinite(ms) ? at + ms : null); // the leaf's clock to the page's
          const since = (t) => (Number.isFinite(t) && Number.isFinite(fp) ? t - fp : null);
          const j = st.pace ? judgePace(st.pace) : { verdict: null, why: 'no report' };
          const reason = fellBack() ?? (r?.club?.shown === true ? null : record?.reason ?? null);
          const outcome = r?.club?.shown === true ? 'hall' : reason !== null ? 'fallback' : r0 && r0.lookBoot?.flow !== 'stage' ? `no stage boot (${r0.lookBoot?.why})` : 'not known';
          const wrote = (w.recordAt ?? []).filter((t) => t > (onPage(st.dissolveAtMs) ?? Infinity)).pop() ?? null;
          const redundant = (w.states ?? []).find((x) => x[0] === 'redundant')?.[1] ?? null;
          const revealed = onPage(st.dissolveAtMs); // (null: no hall was revealed, so there is no pace window)
          const span = { install: [w.registeredAtMs ?? null, w.installedAtMs ?? redundant], fill: [w.installedAtMs ?? null, w.fillEndAtMs ?? null],
            leafLoad: [r?.leafFirstAt ?? null, onPage(st.builtAtMs)], paceWindow: [revealed, revealed === null ? null : wrote ?? (st.pace ? now : null)] };
          const over = (a, b) => overlaps(a[0], a[1], b[0], b[1], now);
          /** A follow-up boot (the second or the third): a reload of the same profile over the same link, taken to ITS
           * outcome as the first visit was (the hall, a fall-back, or a boot that does not ask for the hall), to ready. */
          const followBoot = async (no) => {
            const nth = no === 2 ? 'second' : 'third';
            srv.reset();
            const mark = s.console.length, n2 = await arm(s, { worker: 'fall' });
            await s.c.send('Page.reload');
            await paintedDoc(n2, `${what}: the ${nth} boot's first paint`);
            const q0 = await read(s), fell2 = () => fellOf(s.console.slice(mark)), before = rec(q0);
            let q = null, end2 = null;
            try {
              if (q0.lookBoot?.flow === 'stage') await until(`${what}: the ${nth} boot's hall or fall-back`, Math.min(boundMs, 30000) + T.hall, async () => (await s.c.eval('!!(window.__club && window.__club.ready === true)')) || fell2() !== null, DEV ? 1000 : 250);
              await until(`${what}: the ${nth} boot ready`, T.fail, () => s.c.eval('!!(window.__test && window.__test.ready === true)'), 500);
              q = await read(s, true);
              if (q.club?.shown === true) q = await reported(s, q0.record);
            } catch (e) { end2 = String(e?.message ?? e).slice(0, 300); try { q = await read(s, true); } catch { q = q ?? q0; } }
            const served2 = srv.counts(), bf2 = boundFacts(q, served2, srv.leaf(), (ms) => srv.leafBytesBy(ms));
            const st2 = q?.club?.stage ?? {}, why2 = fell2(), j2 = st2.pace ? judgePace(st2.pace) : { verdict: null, why: 'no report' }, fp2 = q?.fp?.at ?? null, after = q ? rec(q) : null;
            const after2 = (t) => (Number.isFinite(t) && Number.isFinite(fp2) ? r1(t - fp2) : null), leaf2 = (ms) => (Number.isFinite(q?.clubAt) && Number.isFinite(ms) ? q.clubAt + ms : null);
            leafFile.boots.push({ visit: run.visit, worker: on ? 'on' : 'off', rate: run.rate, boot: no, boundFiredMs: bf2.timeline.boundFiredMs, firstPaintMs: bf2.timeline.firstPaintMs, requests: bf2.rows });
            return { boot: no, how: 'a reload of the same profile over the same link, taken to its outcome', lookBoot: q0.lookBoot, recordBefore: before, incomplete: end2, ready: q?.ready === true, controlled: q?.sw ?? null, firstPaintMs: r1(fp2),
              outcome: q?.club?.shown === true ? 'hall' : why2 !== null ? 'fallback' : q0.lookBoot?.flow !== 'stage' ? `no stage boot (${q0.lookBoot?.why})` : 'not known',
              reason: why2, class: why2 === null ? null : RULES.lookFailClass(why2), firstPaintToFallbackMs: after2(bf2.timeline.boundFiredMs), firstPaintToBuiltMs: after2(leaf2(st2.builtAtMs)), firstPaintToDissolveMs: after2(leaf2(st2.dissolveAtMs)), firstPaintToHallMs: after2(leaf2(st2.endAtMs)),
              stage: { phase: st2.phase ?? null, failed: st2.failed ?? null, builtAtMs: st2.builtAtMs ?? null }, pace: st2.pace ?? null, judged: { verdict: j2.verdict, why: j2.why }, record: after,
              served: served2, leafServer: bf2.leafServer, leafAtBound: bf2.table, timeline: bf2.timeline, law: lawOf(no, before, after, why2, bf2, q) };
          };
          const followLine = (b) => `lookBoot ${J(b.lookBoot)}, first paint ${b.firstPaintMs} ms, controlled ${b.controlled}; `
            + (b.outcome === 'hall' ? `THE HALL ARRIVED: its dissolve began ${b.firstPaintToDissolveMs} ms after first paint, the hall stood at ${b.firstPaintToHallMs} ms; `
              : b.outcome === 'fallback' ? `IT FELL BACK to the old room: "${b.reason}" (class ${b.class}) ${b.firstPaintToFallbackMs} ms after first paint (main's bound: ${boundMs} ms); the leaf's stage ${J(b.stage)}, its build ended ${b.firstPaintToBuiltMs} ms after first paint; `
                : `outcome: ${b.outcome}; `)
            + `the leaf's requests that reached the server: ${b.leafServer.asked} (${b.leafServer.full} answered in full, ${b.leafServer.linkBytes} bytes on the link / ${b.leafServer.bytes} of bodies; ${b.leafServer.notModified} answered 304; ${b.leafServer.other} other); the server sent the page ${sent(b.served.page)} and the worker ${sent(b.served.worker)}; `
            + `pace: hall ${J(b.pace?.hall)}; main.js says ${J(b.judged)}; the record after it ${brief(b.record)}`;
          // the law for the first boot (a fresh profile: no record before it)
          const law1 = lawOf(1, null, record, reason, bf, r);
          // the next boots: with --slow-follow a second and a third, each taken to ITS outcome; else one reload of the same
          // profile read at its first paint (not for a visit at another rate: that row is the first visit alone)
          let next = null, third = null;
          if (r && run.follow && left() > 60000) {
            try { next = await followBoot(2); } catch (e) { next = { boot: 2, error: String(e?.message ?? e).slice(0, 300) }; }
            if (!next.error && left() > 45000) {
              try { third = await followBoot(3); } catch (e) { third = { boot: 3, error: String(e?.message ?? e).slice(0, 300) }; }
            }
          } else if (r && !run.byRate && left() > 30000) {
            try {
              srv.reset();
              const n2 = await arm(s, { worker: true });
              await s.c.send('Page.reload');
              await paintedDoc(n2, `${what}: the next boot's first paint`);
              const q = await read(s);
              next = { lookBoot: q.lookBoot, record: rec(q), controlled: q.sw, firstPaintMs: r1(q.fp?.at), served: srv.counts() };
            } catch (e) { next = { error: String(e?.message ?? e).slice(0, 300) }; }
          }
          const row = { visit: run.visit, worker: on ? 'on' : 'off', rate: run.rate, byRate: run.byRate, url, tier: r?.club?.tier ?? (r0 ? tierOf(r0) : null), lookBoot: r0?.lookBoot ?? null, incomplete: ended, ready: r?.ready === true,
            firstPaintMs: r1(fp), outcome, boundMs, reason, class: reason === null ? null : RULES.lookFailClass(reason),
            firstPaintToFallbackMs: reason !== null && Number.isFinite(record?.failAt) && Number.isFinite(r?.origin) ? r1(since(record.failAt - r.origin)) : null,
            leafInstallAtMs: r1(at), firstPaintToBuiltMs: r1(since(onPage(st.builtAtMs))), firstPaintToDissolveMs: r1(since(revealed)), firstPaintToHallMs: r1(since(onPage(st.endAtMs))),
            stage: { phase: st.phase ?? null, failed: st.failed ?? null, builtAtMs: st.builtAtMs ?? null, waited: st.waited ?? null, swapMs: st.swapMs ?? null, keptFrames: st.keptFrames ?? null, rest: st.rest ?? null, warm: st.warm ?? null, installed: st.installed ?? null },
            pace: st.pace ?? null, judged: { verdict: j.verdict, why: j.why }, record,
            sw: { registeredAtMs: r1(w.registeredAtMs), installedAtMs: r1(w.installedAtMs), activatedAtMs: r1(w.activatedAtMs), controlled: r?.sw ?? null, fillSeenAtMs: r1(w.fillSeenAtMs), fillEndAtMs: r1(w.fillEndAtMs),
              states: w.states ?? null, swept: w.swept ?? null, errors: w.err ?? null },
            spans: { install: span.install.map(r1), fill: span.fill.map(r1), leafLoad: span.leafLoad.map(r1), paceWindow: span.paceWindow.map(r1), readAtMs: r1(now),
              paceWindowEnd: revealed === null ? 'no hall was revealed: no pace window' : wrote !== null ? "the verdict record's write" : st.pace ? 'the read that first saw the report (an upper bound: no verdict record was written to time it)' : 'no report by the read' },
            installOverlapsLeafLoad: over(span.install, span.leafLoad), installOverlapsPaceWindow: over(span.install, span.paceWindow),
            fillOverlapsLeafLoad: over(span.fill, span.leafLoad), fillOverlapsPaceWindow: over(span.fill, span.paceWindow),
            served, leafServer: bf.leafServer, leafAtBound: bf.table, timeline: bf.timeline, law: law1, next, third,
            cost: next ? costOfBoot(next.lookBoot ?? null, run.follow ? record : next.record ?? record) : null, costAfterSecond: third && !third.error ? costOfBoot(third.lookBoot, next?.record ?? null) : null };
          G.visits.push(row);
          info(`${what} (${row.tier}; ${url.slice(SLOW_ORIGIN.length)}; ${run.rate} bytes/s, ${link.latency} ms)${ended ? ` AS FAR AS IT GOT (${ended})` : ''}: first paint ${row.firstPaintMs} ms; `
            + (outcome === 'hall' ? `THE HALL ARRIVED: its dissolve began ${row.firstPaintToDissolveMs} ms after first paint, the hall stood at ${row.firstPaintToHallMs} ms (main's bound: ${boundMs} ms); `
              : outcome === 'fallback' ? `THE BOOT FELL BACK to the old room: "${reason}" (class ${row.class}) ${row.firstPaintToFallbackMs} ms after first paint (main's bound: ${boundMs} ms); the leaf's stage ${J({ phase: row.stage.phase, failed: row.stage.failed })}, its build ended ${row.firstPaintToBuiltMs} ms after first paint; `
                : `outcome: ${outcome}; `)
            + `the record ${brief(record)}; `
            + `the worker: registered at ${row.sw.registeredAtMs} ms, installed at ${row.sw.installedAtMs}, activated at ${row.sw.activatedAtMs}, controlled ${row.sw.controlled}, fill seen at ${row.sw.fillSeenAtMs}, fill end at ${row.sw.fillEndAtMs} (read at ${row.spans.readAtMs}; states ${J(row.sw.states)}; swept ${J(row.sw.swept)}${row.sw.errors?.length ? `; errors ${J(row.sw.errors)}` : ''}); `
            + `the leaf's load ${J(row.spans.leafLoad)} ms, the pace window ${J(row.spans.paceWindow)} ms; the install overlapped the leaf's load: ${row.installOverlapsLeafLoad}, the pace window: ${row.installOverlapsPaceWindow}; the fill overlapped the leaf's load: ${row.fillOverlapsLeafLoad}, the pace window: ${row.fillOverlapsPaceWindow}; `
            + `the server sent the page ${sent(served.page)} and the worker ${sent(served.worker)}, at most ${served.peakInFlight} responses in flight${served.errors.length ? `; server errors ${J(served.errors)}` : ''}; `
            + `pace: period ${st.pace?.period?.ms}, hall ${J(st.pace?.hall)}; main.js says ${J(row.judged)}`
            + (run.byRate ? '' : `; THE NEXT BOOT (a reload): ${!next ? 'not read' : next.error ? `not read (${next.error})` : `lookBoot ${J(next.lookBoot)}, first paint ${next.firstPaintMs} ms, controlled ${next.controlled}${run.follow ? '' : `, the record ${J(next.record && { verdict: next.record.verdict, why: next.record.why, fails: next.record.fails })}`}`}; what the visit cost: ${row.cost}`));
          info(`${what}: ${tableLine(bf.table)}`);
          info(`${what}: ${timeLine(bf.timeline)}`);
          lawSay(what, law1);
          for (const [b, nth] of [[next, 'SECOND'], [third, 'THIRD']]) {
            if (!run.follow || !b) continue;
            if (b.error) { info(`${what}: THE ${nth} BOOT was not run to its outcome (${b.error})`); check(`${what}: the ${nth.toLowerCase()} boot reaches ready`, false, b.error); continue; }
            info(`${what}: THE ${nth} BOOT, to its outcome${b.incomplete ? ` AS FAR AS IT GOT (${b.incomplete})` : ''}: ${followLine(b)}${b.boot === 2 ? '' : `; what the two boots before it cost: ${row.costAfterSecond}`}`);
            info(`${what}, the ${nth.toLowerCase()} boot: ${tableLine(b.leafAtBound)}`);
            info(`${what}, the ${nth.toLowerCase()} boot: ${timeLine(b.timeline)}`);
            lawSay(what, b.law);
            check(`${what}: the ${nth.toLowerCase()} boot reaches ready`, b.ready, b.incomplete ?? 'window.__test.ready was not true at the read');
          }
          if (run.follow && next && !next.error && !third) info(`${what}: THE THIRD BOOT was not begun (${Math.round(left() / 1000)} s were left before the suite's own deadline)`);
          check(`${what}: the page reaches ready`, row.ready, ended ?? 'window.__test.ready was not true at the read');
        } finally { await s.close(); }
      }
    } finally { await srv.close(); }
    // by rate: did the hall arrive inside main's bound, and when after first paint (the threshold is read off this)
    {
      const cell = (v) => ({ outcome: v.outcome, insideBound: v.outcome === 'hall', insideProductBound: v.outcome === 'hall' && (boundMs === RULES.STAGE_MAX_MS || (Number.isFinite(v.firstPaintToDissolveMs) && v.firstPaintToDissolveMs <= RULES.STAGE_MAX_MS)),
        firstPaintMs: v.firstPaintMs, firstPaintToDissolveMs: v.firstPaintToDissolveMs, firstPaintToHallMs: v.firstPaintToHallMs, reason: v.reason, class: v.class, firstPaintToFallbackMs: v.firstPaintToFallbackMs, pendingAtBound: v.law?.pending ?? null, incomplete: v.incomplete });
      const by = new Map();
      for (const v of G.visits) { if (!by.has(v.rate)) by.set(v.rate, { rate: v.rate, on: null, off: null }); const slot = by.get(v.rate); if (slot[v.worker] === null) slot[v.worker] = cell(v); }
      const rows = [...by.values()].sort((a, b) => a.rate - b.rate), firstAt = (k) => rows.find((x) => x[k]?.insideProductBound)?.rate ?? null;
      G.rates = { latencyMs: link.latency, boundMs, productBoundMs: RULES.STAGE_MAX_MS, rows, hallFirstInsideBound: { on: firstAt('on'), off: firstAt('off') },
        from: "the first visit of each rate that ran (the link's own and each of --slow-rates; the same latency before each response), worker on and off: insideBound = the hall was shown (main's bound in force did not fire); insideProductBound = and, where the bound in force is not the product's, its dissolve began inside the product's bound after first paint; firstPaintToDissolveMs / firstPaintToHallMs = when the hall's dissolve began and when the hall stood; else the reason main was told, its class, when, and how many of the page's leaf requests were pending at the server then (pendingAtBound: the server's count, not the product's own); hallFirstInsideBound = the lowest rate run at which insideProductBound holds (null: at none of them)" };
      const say1 = (c) => (!c ? 'not run' : c.insideBound ? `THE HALL ARRIVED${c.insideProductBound ? '' : " (not inside the product's bound)"}: its dissolve began ${c.firstPaintToDissolveMs} ms after first paint, it stood at ${c.firstPaintToHallMs} ms (first paint ${c.firstPaintMs} ms)` : c.outcome === 'fallback' ? `no hall: "${c.reason}" (class ${c.class}) ${c.firstPaintToFallbackMs} ms after first paint, ${c.pendingAtBound} leaf request(s) pending at the server then (first paint ${c.firstPaintMs} ms)` : `${c.outcome}${c.incomplete ? ` (${c.incomplete})` : ''}`);
      if (rows.length) info(`the slow link BY RATE (${link.latency} ms before each response; main's bound ${boundMs} ms after first paint${boundMs === RULES.STAGE_MAX_MS ? '' : `, the product's ${RULES.STAGE_MAX_MS} ms`}): ${rows.map((x) => `${x.rate} bytes/s: worker ON: ${say1(x.on)}; worker OFF: ${say1(x.off)}`).join(' | ')} | the lowest rate run at which the hall arrived inside the product's bound: worker ON ${G.rates.hallFirstInsideBound.on ?? 'none of them'}, worker OFF ${G.rates.hallFirstInsideBound.off ?? 'none of them'}`);
      info(`the slow link's law: ${G.law.boots} boot(s) judged, ${G.law.broken} broke it`);
    }
    if (LEAFOUT) {
      try { fs.mkdirSync(path.dirname(path.resolve(LEAFOUT)), { recursive: true }); fs.writeFileSync(LEAFOUT, JSON.stringify(leafFile, null, 1)); info(`the leaf's requests of ${leafFile.boots.length} boot(s): written to ${LEAFOUT}`); } catch (e) { info(`the leaf's requests could NOT be written to ${LEAFOUT}: ${e.message}`); }
    }
  }
  info(`measures: ${M.firstPaint.pinOn.length} + ${M.firstPaint.pinOff.length} first paints, ${M.boots.length} hall boot(s)${M.sw ? `, ${M.sw.boots.length} of ${SWBOOTS} with the worker` : ''}${M.slow ? `, ${M.slow.visits.length} slow first visit(s)` : ''}${OUT ? `; written to ${OUT}` : ''}`);
};

// leg 12: where the reveal's time goes. Numbers only: its checks are of the measure itself, never of the product.
legs['12'] = async () => {
  const num = Number.isFinite;
  const settleMaxMs = Number(/\bsettleMaxMs:\s*(\d+)/.exec(fs.readFileSync(path.join(webDir, 'scene', 'club', 'index.js'), 'utf8'))?.[1] ?? NaN);
  const modes = REVEALONLY ? [REVEALONLY] : REVEAL_MODES;
  const M = (out.reveal = { settleMaxMs: num(settleMaxMs) ? settleMaxMs : null, glSlowMs: GL_SLOW_MS, profileIntervalUs: PROFILE_US, sets: REVEALS, modes, notBegun: 0, boots: [],
    from: "each boot: window.__club.state().life.stage (times in ms since the leaf's install began; leafInstallAtMs = the page clock when the leaf published window.__club); swapEndToDissolveMs = dissolveAtMs - swapAtMs - swapMs (the first hall frame under the kept frame, every kept frame, and whatever stood between the tasks); tasks = the browser's own long tasks (PerformanceObserver longtask) and gaps = gaps of 50 ms or more between two requestAnimationFrame ticks, each [ms after the swap began, ms], from 200 ms before the swap to 1500 ms after the dissolve's begin; profile (the profile boot) = profileCut over a CDP Profiler profile begun after first paint: the swap = the samples from the first to the last under stageSwap, after = the next swapEndToDissolveMs (no clock is matched: the windows come from the samples themselves); gl (the gl boot) = the tap's timed calls on the page clock cut at the leaf's swap times, links = every linkProgram by when it was called, programs = the renderer's info.programs at the read joined to those rows, late = the ones not linked before the swap with keyTwin against the ones that were; pace and judged = the leaf's pace report of that boot and main.js lookJudgePace over it (a boot with a profiler or a tap pays for it in these frames); profile.rest = the profile's last restMs ms (they end with the suite's read of the report: the pace window's frames); gl.rest = the tap's calls and their time per second over the whole quarter seconds inside the restMs ms that begin 1 s after the hall stood; settleMaxMs = the leaf's constant, read as text", restMs: REST_MS });
  info(`sets ${REVEALS}, boots of a set ${J(modes)}; the leaf's settleMaxMs (web/scene/club/index.js, read as text): ${M.settleMaxMs} ms; the profile samples every ${PROFILE_US} microseconds; the tap lists calls of ${GL_SLOW_MS} ms or more`);
  const list = (rows) => (rows ?? []).map(([k, v]) => `${k} ${v}`).join(' | ');
  for (let n = 0; n < REVEALS; n++) {
    for (const mode of modes) {
      const what = `set ${n + 1}, the ${mode} boot`;
      if (left() <= (DEV ? 400000 : 60000)) { M.notBegun += 1; info(`${what} was not begun: ${Math.round(left() / 1000)} s were left before the suite's own deadline`); continue; }
      const s = await session();
      try {
        let r0 = null, r = null, ended = null, profile = null, profiling = false, F = null;
        try {
          r0 = await boot(s, appUrl(HALLQ), { frames: mode === 'pictures' ? 'hall' : false, reveal: mode === 'gl' ? 'gl' : true });
          if (mode === 'profile') { // from first paint on: the leaf's install begins after it
            await s.c.send('Profiler.enable');
            await s.c.send('Profiler.setSamplingInterval', { interval: PROFILE_US });
            await s.c.send('Profiler.start');
            profiling = true;
          }
          r = await hall(s);
          r = await reported(s, r0.record); // on to the leaf's pace report: the boot's last seconds are the hall at rest
        } catch (e) { ended = String(e?.message ?? e).slice(0, 400); }
        if (profiling) { try { profile = (await s.c.send('Profiler.stop')).profile ?? null; } catch (e) { ended = ended ?? `the profile was not handed over: ${String(e?.message ?? e).slice(0, 200)}`; } }
        if (ended) { try { r = await read(s, true); } catch { r = r ?? r0; } } // the row as far as the boot got
        try { F = await s.c.eval(call(pageRevealRead)); } catch (e) { ended = ended ?? `the reveal facts could not be read: ${String(e?.message ?? e).slice(0, 200)}`; }
        const st = r?.club?.stage ?? {}, at = r?.clubAt ?? null;
        const swapFrom = num(at) && num(st.swapAtMs) ? at + st.swapAtMs : null, swapTo = swapFrom !== null && num(st.swapMs) ? swapFrom + st.swapMs : null;
        const heldAt = num(at) && num(st.dissolveAtMs) ? at + st.dissolveAtMs : null; // the dissolve's begin: the leaf's first answer that the kept frame may go
        const afterMs = swapTo !== null && heldAt !== null ? Math.max(0, heldAt - swapTo) : null;
        const near = (rows) => (swapFrom === null || !Array.isArray(rows) ? null : rows.filter(([t0, d]) => t0 + d >= swapFrom - 200 && t0 <= (heldAt ?? swapTo ?? swapFrom) + 1500).map(([t0, d]) => [ms1(t0 - swapFrom), d]));
        const row = { set: n + 1, mode, tier: r?.club?.tier ?? tierOf(r0 ?? {}), lookBoot: r0?.lookBoot ?? null, incomplete: ended, firstPaintMs: ms1(r?.fp?.at), leafInstallAtMs: ms1(at),
          firstPaintToDissolveMs: heldAt !== null && num(r?.fp?.at) ? ms1(heldAt - r.fp.at) : null, phase: st.phase ?? null, failed: st.failed ?? null,
          builtAtMs: st.builtAtMs ?? null, readyAtMs: st.readyAtMs ?? null, warm: st.warm ?? null, rest: st.rest ?? null, swapAtMs: st.swapAtMs ?? null, swapMs: st.swapMs ?? null, installed: st.installed ?? null,
          keptFrames: st.keptFrames ?? null, unquiet: st.unquiet ?? null, quietAtReveal: st.quietAtReveal ?? null, linkedInSwap: st.linkedInSwap ?? null, linkedAfterSwap: st.linkedAfterSwap ?? null, dissolveAtMs: st.dissolveAtMs ?? null, endAtMs: st.endAtMs ?? null,
          swapEndToDissolveMs: ms1(afterMs), tasks: near(F?.tasks), gaps: near(F?.gaps), frames: F?.frames ?? null, pictures: F?.pictures ?? null, pageErr: F?.err ?? null,
          pace: st.pace ? { period: st.pace.period?.ms ?? null, share: st.pace.period?.share ?? null, hall: st.pace.hall ? { frames: st.pace.hall.frames, median: st.pace.hall.median, p95: st.pace.hall.p95, over: st.pace.hall.over, closedBy: st.pace.hall.closedBy } : null } : null,
          judged: st.pace ? (({ verdict, why }) => ({ verdict, why }))(judgePace(st.pace)) : null };
        M.boots.push(row);
        info(`${what} (${row.tier}): first paint ${row.firstPaintMs} ms, the leaf's install began at ${row.leafInstallAtMs} ms; built ${row.builtAtMs}, ready ${row.readyAtMs}, warm ${J(row.warm)}, rest ${J(row.rest)}; THE SWAP at ${row.swapAtMs} took ${row.swapMs} ms (installed ${row.installed}, linkedInSwap ${row.linkedInSwap}); FROM ITS END TO THE DISSOLVE'S BEGIN ${row.swapEndToDissolveMs} ms (keptFrames ${row.keptFrames}, unquiet ${J(row.unquiet)}, quietAtReveal ${row.quietAtReveal}, linkedAfterSwap ${row.linkedAfterSwap}); the dissolve began at ${row.dissolveAtMs}, the hall stood at ${row.endAtMs}; first paint to the dissolve's begin ${row.firstPaintToDissolveMs} ms${row.pictures ? `; the picture probe read ${row.pictures.seen} picture(s)` : ''}; the pace report of THIS boot (${mode === 'plain' ? 'nothing added' : mode === 'pictures' ? 'its probe stops at the hall' : mode === 'profile' ? 'its profiler on' : 'its tap on'}): ${row.pace ? `period ${row.pace.period} ms (share ${row.pace.share}), hall ${J(row.pace.hall)}; main.js says ${J(row.judged)}` : 'none'}`);
        info(`${what}: tasks of 50 ms or more around the reveal, [ms after the swap began, ms]: ${J(row.tasks)}; gaps of 50 ms or more between animation frames, the same way: ${J(row.gaps)}${row.pageErr?.length ? `; the page's taps said ${J(row.pageErr)}` : ''}`);
        check(`${what} reached the hall`, !ended && st.phase === 'hall' && st.failed === null, ended ?? J({ phase: st.phase, failed: st.failed }));
        if (!ended && st.phase === 'hall' && st.failed === null) { // (after the pace report and every read of the measure: seconds after the reveal)
          const rest = await hallAtRest(s, { wait: false, name: `set${n + 1}-${mode}` }), jr = judgeRest(rest);
          row.atRest = { wall: jr.wall, scene: rest.scene, cube: rest.cube, seated: rest.seated, still: rest.still, ok: jr.ok, why: jr.why };
          info(`${what}: the hall at rest, read after the pace report: the wall band's brightest bin ${jr.wall}; the scene's own buffer ${J(rest.scene)}; the app's reflection cube ${J(rest.cube)}; uniforms maps the adopter seated again in this boot: ${rest.seated}${rest.still ? `; the page's own screenshot at that moment: ${rest.still}` : ''}`);
          check(`${what}: the hall is still there at rest after the stage (its picture not dark, no non-finite texel in the scene's own buffer or in the app's reflection cube)`, jr.ok, jr.why ?? '');
        }
        if (mode === 'profile') {
          const cut = profileCut(profile, { afterMs: afterMs ?? 0, restMs: row.pace ? REST_MS : 0 });
          row.profile = { startedAt: 'after first paint', intervalUs: PROFILE_US, file: null, ...cut };
          if (profile && PROFOUT) {
            const file = n === 0 ? PROFOUT : PROFOUT.replace(/(\.[^./\\]+)?$/, `-${n + 1}$1`);
            try { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(file, JSON.stringify(profile)); row.profile.file = file; info(`${what}: the whole profile: written to ${file}`); } catch (e) { info(`${what}: the whole profile could NOT be written to ${file}: ${e.message}`); }
          }
          if (cut.found) {
            info(`${what}: THE SWAP'S TASK in the profile: ${cut.swap.ms} ms over ${cut.swap.samples} samples (the leaf says ${row.swapMs} ms). Self time by function, ms: ${list(cut.swap.self)}`);
            info(`${what}: the swap's task, the time with a function of the leaf on the stack, ms: ${list(cut.swap.within)}`);
            if (cut.after) {
              info(`${what}: FROM THE SWAP'S END TO THE DISSOLVE'S BEGIN in the profile: ${cut.after.ms} ms over ${cut.after.samples} samples (the leaf's clock says ${row.swapEndToDissolveMs} ms). Self time by function, ms: ${list(cut.after.self)}`);
              info(`${what}: that time with a function of the leaf on the stack, ms: ${list(cut.after.within)}`);
            }
          }
          if (cut.rest) {
            info(`${what}: THE HALL AT REST in the profile (its last ${REST_MS} ms, which end with the suite's read of the report: the pace window's frames): ${cut.rest.ms} ms over ${cut.rest.samples} samples. Self time by function, ms ((idle) = the page thread had nothing to run): ${list(cut.rest.self)}`);
            info(`${what}: the hall at rest, the time with a function of the leaf on the stack, ms: ${list(cut.rest.within)}`);
          }
          check(`${what}: the profile holds the swap's task (samples with stageSwap on the stack)`, cut.found, `${cut.samples} samples, none of them under stageSwap${profile ? '' : ' (no profile was handed over)'}`);
        }
        if (mode === 'gl') {
          const G = F?.gl ?? null;
          if (G) {
            const linkAt = (i) => (i >= 0 && G.links[i] ? G.links[i][0] : null), nameOf = (i) => (i >= 0 && G.links[i] ? G.links[i][1] : null);
            const when = (t0) => (t0 === null || swapFrom === null || swapTo === null ? 'unknown' : t0 < swapFrom ? 'before' : t0 < swapTo ? 'swap' : heldAt !== null && t0 < heldAt ? 'after' : 'later');
            const tell = (c) => ({ atMs: swapFrom === null ? c[0] : ms1(c[0] - swapFrom), ms: c[1], call: c[2], program: nameOf(c[3]), inUse: nameOf(c[4]), framebuffer: c[5] });
            const cutOf = (a, b) => { if (a === null || b === null) return null; const c = glCut(G.slow, a, b); return { ...c, longest: c.longest.map(tell) }; };
            const tally = (rows) => Object.fromEntries(['before', 'swap', 'after', 'later', 'unknown'].map((k) => [k, rows.filter((x) => x === k).length]));
            const progs = G.programs.map((p) => ({ ...p, when: when(linkAt(p.link)) })), prior = progs.filter((p) => p.when === 'before');
            const late = progs.filter((p) => p.when !== 'before').map((p) => ({ id: p.id, name: p.name, used: p.used, when: p.when, linkedAtMs: linkAt(p.link) === null || swapFrom === null ? null : ms1(linkAt(p.link) - swapFrom), twin: keyTwin(p.key, p.name, prior) }));
            row.gl = { calls: G.calls, ms: ms1(G.ms), slowMs: GL_SLOW_MS, slowCalls: G.slow.length, dropped: G.dropped, err: G.err, byName: G.by.slice().sort((a, b) => b[2] - a[2]).slice(0, 16),
              swap: cutOf(swapFrom, swapTo), after: cutOf(swapTo, heldAt), links: { total: G.links.length, ...tally(G.links.map((l) => when(l[0]))) }, programs: { total: progs.length, ...tally(progs.map((p) => p.when)), late } };
            const by = (c) => (!c ? 'no window (the leaf gave no swap times)' : !c.calls ? 'none' : `${c.calls} call(s), ${c.ms} ms: ${list(c.by)}; the longest: ${c.longest.map((x) => `${x.call} ${x.ms} ms at ${x.atMs}${x.program !== null ? ` (program ${x.program})` : ` (in use ${x.inUse}, framebuffer ${x.framebuffer})`}`).join(' | ')}`);
            info(`${what}: ${G.calls} WebGL calls, ${row.gl.ms} ms inside them over the whole boot; the first by time, [name, calls, ms, longest ms]: ${J(row.gl.byName)}; ${G.slow.length} call(s) of ${GL_SLOW_MS} ms or more${G.dropped ? ` (${G.dropped} more were not listed)` : ''}${G.err.length ? `; the tap said ${J(G.err)}` : ''}`);
            info(`${what}: WebGL calls of ${GL_SLOW_MS} ms or more IN THE SWAP'S TASK (${row.swapMs} ms): ${by(row.gl.swap)}`);
            info(`${what}: WebGL calls of ${GL_SLOW_MS} ms or more FROM THE SWAP'S END TO THE DISSOLVE'S BEGIN (${row.swapEndToDissolveMs} ms): ${by(row.gl.after)}`);
            const restFrom = num(at) && num(st.endAtMs) && row.pace ? at + st.endAtMs + 1000 : null; // the leaf's pace window opens 1 s after the hall stands
            if (restFrom !== null) {
              const cells = G.series.filter(([k]) => k * 250 >= restFrom && (k + 1) * 250 <= restFrom + REST_MS), span = cells.length * 250;
              row.gl.rest = { ms: span, callsPerSecond: span ? Math.round((cells.reduce((a, c) => a + c[1], 0) * 1000) / span) : null, glMsPerSecond: span ? ms1((cells.reduce((a, c) => a + c[2], 0) * 1000) / span) : null, slow: cutOf(restFrom, restFrom + REST_MS) };
              info(`${what}: THE HALL AT REST (the ${span} ms of whole quarter seconds inside the ${REST_MS} ms that begin 1 s after the hall stood): ${row.gl.rest.callsPerSecond} WebGL calls and ${row.gl.rest.glMsPerSecond} ms inside them per second; calls of ${GL_SLOW_MS} ms or more there: ${by(row.gl.rest.slow)}`);
            }
            info(`${what}: every linkProgram of the page by when it was called ${J(row.gl.links)}; the renderer's programs at the read ${J({ total: progs.length, ...tally(progs.map((p) => p.when)) })}; those NOT linked before the swap, [name, when, ms after the swap began, times used, the fields that tell it from its nearest twin linked before the swap as [field, the twin's, its own]]: ${J(late.map((p) => [p.name, p.when, p.linkedAtMs, p.used, p.twin ? p.twin.diff : 'no twin of that name']))}`);
          }
          check(`${what}: the tap timed the context's calls`, (G?.calls ?? 0) > 0, J(G?.err ?? F?.err ?? 'no facts from the page'));
          // (two counts of one thing by two ways: the tap's linkProgram times against the leaf's swap times, and the leaf's own list of the renderer's programs)
          check(`${what}: the programs linked inside the swap's task, by the tap (${row.gl?.programs?.swap ?? 'no count'}) as by the leaf (${row.linkedInSwap})`, Number.isInteger(row.linkedInSwap) && row.gl?.programs?.swap === row.linkedInSwap, J({ tap: row.gl?.programs ? { ...row.gl.programs, late: undefined } : null, leaf: row.linkedInSwap }));
        }
      } finally { await s.close(); }
    }
    const side = M.boots.filter((b) => b.set === n + 1);
    if (side.length > 1) info(`set ${n + 1} side by side, [boot, swapMs, the swap's end to the dissolve's begin, keptFrames, linkedInSwap, linkedAfterSwap, quietAtReveal, first paint to the dissolve's begin]: ${J(side.map((b) => [b.mode, b.swapMs, b.swapEndToDissolveMs, b.keptFrames, b.linkedInSwap, b.linkedAfterSwap, b.quietAtReveal, b.firstPaintToDissolveMs]))}`);
  }
  info(`reveal measures: ${M.boots.length} boot(s)${M.notBegun ? `, ${M.notBegun} not begun` : ''}${OUT ? `; written to ${OUT}` : ''}`);
};

// leg 13: the knob sweep. Numbers only: its checks are of the measure itself, never of the product.
/** One boot of leg 13's second bench: `which` = 'hall' (the hall as built, to its pace report) | 'old' (the old room, a
 * boot under the launcher's pin, at rest). The frames of the hall's pace window, then the bench. */
async function s2Boot(M, which) {
  const what = which === 'hall' ? 'the second bench, the hall' : 'the second bench, the old room';
  if (left() <= (DEV ? 400000 : 60000)) { M.notBegun += 1; info(`${what} was not begun: ${Math.round(left() / 1000)} s were left before the suite's own deadline`); return; }
  const s = await session({ pin: which === 'old' });
  try {
    let r0 = null, r = null, ended = null;
    try {
      r0 = await boot(s, appUrl(which === 'hall' ? HALLQ : ''), { draws: true });
      if (which === 'hall') { await hall(s); r = await reported(s, r0.record); } else {
        await until('the old room ready', T.paint, () => s.c.eval('window.__test?.ready === true'));
        await sleep(DEV ? 4000 : 2500); // (its camera lands and its loop comes to rest)
        r = await read(s, true);
      }
    } catch (e) { ended = String(e?.message ?? e).slice(0, 400); }
    if (ended) { try { r = await read(s, true); } catch { r = r ?? r0; } } // the row as far as the boot got
    const st = r?.club?.stage ?? {}, pace = st.pace ?? null, j = pace ? judgePace(pace) : { verdict: null, why: 'no report' };
    const row = { which, lookBoot: r0?.lookBoot ?? null, tier: r?.club?.tier ?? tierOf(r0 ?? {}), incomplete: ended, phase: st.phase ?? null, endAtMs: st.endAtMs ?? null,
      pace: pace ? { period: pace.period?.ms ?? null, share: pace.period?.share ?? null, hall: pace.hall ? { frames: pace.hall.frames, median: pace.hall.median, p95: pace.hall.p95, over: pace.hall.over, closedBy: pace.hall.closedBy } : null } : null,
      judged: which === 'hall' ? { verdict: j.verdict, why: j.why } : null, window: null, bench: null };
    M.s2[which] = row;
    info(`${what}: lookBoot ${J(row.lookBoot)}${ended ? `; ENDED EARLY: ${ended}` : ''}${which === 'hall' ? `; pace ${J(row.pace)}; main.js says ${J(row.judged)}` : ''}`);
    if (which === 'hall') check(`${what} as built reached the hall and its pace report`, !ended && st.phase === 'hall' && !!pace, ended ?? J({ phase: st.phase, failed: st.failed, pace: !!pace }));
    else check(`${what}: the boot under the launcher's pin shows the old room and asks for no leaf`, !ended && r0?.lookBoot?.shown === 'old' && r?.clubDefined === false, ended ?? J({ lookBoot: r0?.lookBoot, clubDefined: r?.clubDefined }));
    if (ended) return;
    // the frames on record, the counter stopped (the hall: the pace window's frames; the old room's loop is at rest, it has none to cut)
    const at = r?.clubAt ?? null; // (the stage's times are ms since the leaf's install began: this is that moment on the page's clock)
    const from = Number.isFinite(st.endAtMs) && Number.isFinite(at) ? at + st.endAtMs + 1000 : null, to = from === null ? null : from + (DEV ? 120000 : 3000);
    const F = await s.c.eval(`(() => { const d = window.__obLB && window.__obLB.draws; if (!d) return null; d.on = false; const a = ${J(from)}, b = ${J(to)}; return { all: d.frames.length, frames: a === null ? [] : d.frames.filter((f) => f[0] >= a && f[0] <= b), err: d.err }; })()`);
    if (which === 'hall' && F && from !== null) {
      const cut = framesCut(F.frames, from, to);
      row.window = { fromMs: from, ...cut };
      info(`${what}: THE PACE WINDOW'S FRAMES (from 1 s after the hall stood; each interval between two frames beside the draw calls issued in it; a frame is an animation frame with draws: ${cut.ticks} animation frame(s) in the window): ${cut.n} interval(s), median ${cut.median} ms, p95 ${cut.p95} ms, ${cut.draws} draw call(s) a frame (median); the long ones (over 1.4 medians), [ms into the window, interval ms, its draws, the draws of the frame before]: ${J(cut.long.slice(0, 24))}; ${cut.longMoreDraws} of ${cut.long.length} carry more than 1.2 medians of draws (${F.all} frame(s) on record since the page began)${F.err ? `; the counter said ${F.err}` : ''}`);
    } else if (which === 'hall') info(`${what}: no cut of the pace window (${F ? 'the stage gave no end time' : "the counter's script did not run"})`);
    let B = null, G = null;
    const N = GPU ? GPU_N : BENCH_N, PN = GPU ? GPU_PACED : S2_PACED, bench = () => s.c.eval(call(pageBench2, N, BENCH_WARM, PN, S2_SKIP, S2ROWS));
    try { if (GPU) { const g = await gpuBeside(bench); B = g.value; G = g.gpu; } else B = await bench(); } catch (e) { B = { rows: [], paced: [], before: null, after: null, err: [String(e?.message ?? e).slice(0, 300)] }; }
    row.bench = { renders: N, warm: BENCH_WARM, pacedIntervals: PN, pacedSkip: S2_SKIP, ...B };
    const base = B.rows.find((x) => x.key === 'asbuilt') ?? null, pbase = B.paced.find((x) => x.key === 'asbuilt') ?? null;
    info(`${what}: THE BENCH IN A ROW (composer.render() ${N} time(s) a row; cpu = the page thread's ms to issue one render, total = ms per render until the renderer finished): ${B.rows.map((x) => `${x.name}: cpu ${x.cpuMs}, total ${x.totalMs}, ${x.draws} draw(s)${base && x !== base ? ` (${ms1(x.totalMs - base.totalMs)} against as built)` : ''}`).join(' | ')}${B.err.length ? `; the bench said ${J(B.err)}` : ''}`);
    info(`${what}: THE BENCH PACED (one render an animation frame, the app's own loop drawing nothing, ${PN} interval(s) after ${S2_SKIP} unmeasured; [median, p95, least, most] ms, the share over 1.5 medians, the draw calls a frame held): ${B.paced.map((x) => `${x.name}: [${x.median}, ${x.p95}, ${x.least}, ${x.most}], over ${x.over}, ${x.drawsPerFrame} draw(s)${pbase && x !== pbase ? ` (${ms1(x.median - pbase.median)} against as built)` : ''}`).join(' | ')}`);
    info(`${what}: the page before the bench ${J(B.before)}`);
    check(`${what}: the bench measured the room as built and at least one row beside it`, !!base && B.rows.length >= 2, J(B.err));
    check(`${what}: the bench left the page as it found it (passes, samples, depth textures, bloom, pixel ratio)`, !!B.before && eq(B.before, B.after), J({ before: B.before, after: B.after }));
    if (G) {
      const got = gpuTell(what, row.bench, G), of = row.bench.gpu.rows.length;
      check(`${what}: the GPU's statistics were read beside the rows (a sample in the span of ${got} of ${of} rows; at least half are wanted)`, of > 0 && got * 2 >= of, J({ stopped: G.stopped, samples: G.samples.length }), { gpu: true });
    }
  } finally { await s.close(); }
}

legs['13'] = async () => {
  const M = (out.sweep = { variants: SWEEP.map((v) => v.name), bootsPerVariant: SWEEPBOOTS, only: SWEEPONLY, notBegun: 0, boots: [], bench: null,
    from: "boots[]: one hall boot per variant, a fresh profile each, on the real-user URL with the leaf's own tool switch ?clubknobs=<variant> (nothing for 'as built'): knobsChanged = window.__club.state().life.tierPick.knobsChanged (the leaf's own word of which knobs it changed), hall / period / share = the leaf's pace report, judged = main.js lookJudgePace over it; incomplete = why a boot has no hall (a variant the stage refuses is a number here, not a red). bench: on the first boot as built, after its pace report (the hall at rest): pageBench's rows, each composer.render() BENCH_N times in a row after BENCH_WARM unmeasured ones, cpuMs = the page thread's time to issue one render, totalMs = per render until a one-pixel read-back of the canvas returned (the renderer has finished); passes = the composer's passes and whether each was enabled; quality = __test.renderQuality({}) before the bench; post = window.__club.post.counts()" });
  if (SWEEPONLY && SWEEPONLY.startsWith('s2')) { // the second bench instead: its own two boots
    M.s2 = { rows: S2ROWS, hall: null, old: null,
      from: "s2.hall: the hall as built, a fresh profile, the real-user URL, to its pace report; s2.old: the old room, a boot under the launcher's pin, at rest. Each: bench.rows = pageBench2's rows in a row (composer.render() BENCH_N times after BENCH_WARM unmeasured: cpuMs the page thread's time to issue one, totalMs per render until a one-pixel read-back returned), bench.paced = its paced rows (one render an animation frame while the app's own composer.render is a no-op: the intervals), bench.before / after = the page's state around the bench. s2.hall.window = framesCut over pageDraws' frames from 1 s after the hall stood (the leaf's install time + stage.endAtMs, on the page's clock), 3 s: each interval beside the draw calls issued in it" };
    info(`THE SECOND BENCH: rows ${J(S2ROWS)}; ${GPU ? GPU_N : BENCH_N} render(s) a row after ${BENCH_WARM} unmeasured; paced rows of ${GPU ? GPU_PACED : S2_PACED} interval(s) after ${S2_SKIP} unmeasured${SWEEPONLY === 's2' ? '' : `; only ${SWEEPONLY === 's2hall' ? 'the hall' : 'the old room'}`}${GPU ? `; --gpu: ${GPU_TOOL[0]} ${GPU_TOOL[1].join(' ')} every ${GPU_EVERY_MS} ms beside each room's bench` : ''}`);
    if (SWEEPONLY !== 's2old') await s2Boot(M, 'hall');
    if (SWEEPONLY !== 's2hall') await s2Boot(M, 'old');
    const h = M.s2.hall?.bench, o = M.s2.old?.bench;
    if (h && o) {
      const of = (b, key, paced) => { const x = (paced ? b.paced : b.rows).find((y) => y.key === key); return x ? (paced ? x.median : x.totalMs) : null; };
      info(`THE SECOND BENCH side by side, [row, the hall ms a render in a row, the old room, the hall's paced median, the old room's]: ${J(S2ROWS.map((k) => [k, of(h, k, false), of(o, k, false), of(h, k, true), of(o, k, true)]))}`);
    }
    info(`second bench measures: ${[M.s2.hall, M.s2.old].filter(Boolean).length} boot(s)${M.notBegun ? `, ${M.notBegun} not begun` : ''}${OUT ? `; written to ${OUT}` : ''}`);
    return;
  }
  info(`variants ${J(M.variants)}, ${SWEEPBOOTS} boot(s) each${SWEEPONLY ? `; only the ${SWEEPONLY}` : ''}; the bench: ${BENCH_N} render(s) a row after ${BENCH_WARM} unmeasured`);
  let benched = SWEEPONLY === 'boots';
  for (const v of SWEEP) {
    for (let i = 0; i < SWEEPBOOTS; i++) {
      if (SWEEPONLY === 'bench' && (benched || v.query)) continue; // the bench alone: one boot as built
      const what = `"${v.name}"${SWEEPBOOTS > 1 ? `, boot ${i + 1}` : ''}`;
      if (left() <= (DEV ? 400000 : 60000)) { M.notBegun += 1; info(`${what} was not begun: ${Math.round(left() / 1000)} s were left before the suite's own deadline`); continue; }
      const s = await session();
      try {
        let r0 = null, r = null, ended = null;
        try {
          r0 = await boot(s, appUrl([v.query, HALLQ].filter(Boolean).join('&')));
          await hall(s);
          r = await reported(s, r0.record);
        } catch (e) { ended = String(e?.message ?? e).slice(0, 400); }
        if (ended) { try { r = await read(s, true); } catch { r = r ?? r0; } } // the row as far as the boot got
        const st = r?.club?.stage ?? {}, pace = st.pace ?? null, j = pace ? judgePace(pace) : { verdict: null, why: 'no report' };
        const changed = r?.club?.tierPick?.knobsChanged ?? null;
        const row = { variant: v.name, boot: i + 1, tier: r?.club?.tier ?? tierOf(r0 ?? {}), lookBoot: r0?.lookBoot ?? null, incomplete: ended, knobsChanged: changed, phase: st.phase ?? null, failed: st.failed ?? null,
          swapMs: st.swapMs ?? null, keptFrames: st.keptFrames ?? null, quietAtReveal: st.quietAtReveal ?? null, period: pace?.period?.ms ?? null, share: pace?.period?.share ?? null,
          hall: pace?.hall ? { frames: pace.hall.frames, median: pace.hall.median, p95: pace.hall.p95, over: pace.hall.over, closedBy: pace.hall.closedBy } : null, judged: { verdict: j.verdict, why: j.why } };
        M.boots.push(row);
        info(`${what} (${row.tier}; the leaf changed ${J(changed)}): ${ended ? `NO HALL: ${ended} (stage ${J({ phase: row.phase, failed: row.failed })})` : `swapMs ${row.swapMs}, keptFrames ${row.keptFrames}; pace: period ${row.period} ms (share ${row.share}), hall ${J(row.hall)}; main.js says ${J(row.judged)}`}`);
        check(`${what}: the leaf changed exactly the knobs asked`, Array.isArray(changed) && eq(changed.slice().sort(), v.knobs.slice().sort()), `asked ${J(v.knobs)}, the leaf says ${J(changed)}`);
        if (!v.query) check(`${what} reached the hall and its pace report`, !ended && st.phase === 'hall' && !!pace, ended ?? J({ phase: st.phase, failed: st.failed, pace: !!pace }));
        if (!benched && !v.query && !ended && st.phase === 'hall') {
          benched = true;
          let B = null;
          try { B = await s.c.eval(call(pageBench, BENCH_N, BENCH_WARM, BENCH_PARTS)); } catch (e) { B = { rows: [], passes: [], quality: null, post: null, err: [String(e?.message ?? e).slice(0, 300)] }; }
          M.bench = { renders: BENCH_N, warm: BENCH_WARM, ...B };
          const base = B.rows.find((x) => x.name === 'as built') ?? null;
          info(`THE BENCH (composer.render() ${BENCH_N} time(s) a row with the hall at rest; cpu = the page thread's ms to issue one render, total = ms per render until the renderer finished): ${B.rows.map((x) => `${x.name}: cpu ${x.cpuMs}, total ${x.totalMs}${base && x !== base ? ` (${ms1(x.totalMs - base.totalMs)} against as built)` : ''}`).join(' | ')}${B.err.length ? `; the bench said ${J(B.err)}` : ''}`);
          info(`the bench's frame: passes [name, enabled] ${J(B.passes)}; __test.renderQuality ${J(B.quality)}; the post chain's counts ${J(B.post)}`);
          check('the bench measured the hall as built and at least one row beside it', !!base && B.rows.length >= 2, J(B.err));
        }
      } finally { await s.close(); }
    }
  }
  const first = M.boots.find((b) => b.variant === 'as built' && b.hall) ?? null;
  if (first) info(`THE SWEEP by variant, [variant, hall median ms, against the first as built, period ms, verdict]: ${J(M.boots.map((b) => [b.variant, b.hall ? b.hall.median : 'no hall', b.hall ? ms1(b.hall.median - first.hall.median) : null, b.period, b.judged.verdict]))}`);
  info(`sweep measures: ${M.boots.length} boot(s)${M.notBegun ? `, ${M.notBegun} not begun` : ''}${M.bench ? `, the bench's ${M.bench.rows.length} row(s)` : ''}${OUT ? `; written to ${OUT}` : ''}`);
};

// ---- leg 14: the display's number ---------------------------------------------------------------------------------------------
/** The animation frames of an idle page: `n` intervals after `skip`, by the callback's own clock. */
function pageIdleFrames(n, skip) {
  return new Promise((done) => {
    const ts = [];
    const step = () => { ts.push(performance.now()); if (ts.length > skip + n) { done(ts); return; } requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }).then((ts) => {
    const iv = ts.slice(1).map((t, k) => t - ts[k]).slice(skip).sort((a, b) => a - b), r2 = (x) => Math.round(x * 100) / 100;
    const q = (f) => iv[Math.min(iv.length - 1, Math.floor(f * iv.length))];
    return iv.length ? { frames: iv.length, median: r2(q(0.5)), p95: r2(q(0.95)), least: r2(iv[0]), most: r2(iv[iv.length - 1]), visibility: document.visibilityState } : null;
  });
}
/** Leg 14's rooms' rows: in the leg's one browser, after its boots. The second bench's rows in the hall as the last boot
 * left it, then one old-room boot and the same rows. Nothing here is a check: what goes wrong is a NOTE line. */
async function displayRooms(s, M, t0) {
  const R = (M.rooms = { asked: DISPLAY_ROOMS, rows: DISPLAY_ROWS, hall: null, old: null, oldBoot: null, notRun: [],
    from: "after the boots, in the same browser (and window): hall = pageBench2's rows DISPLAY_ROWS on the page of the last boot (the hall at rest, after its pace report); then ONE boot with a record a slow device holds (seedOld, leg 6's way; the origin's storage and the cache emptied first): old = the same rows in the old room at rest. bench.rows: composer.render() BENCH_N times in a row, totalMs per render until a one-pixel read of the canvas returned; bench.paced: one render an animation frame while the app's own composer.render is a no-op, the intervals; bench.gpu: the GPU's own statistics sampled beside the bench (gpuBeside), cut by each row's span; window = the page's visibility, focus, inner size and pixel ratio when the rows began" });
  const skip = (why) => { R.notRun.push(why); say('NOTE', `the rooms' rows: ${why}`); };
  const age = Date.now() - t0;
  if (!DEV && age > DISPLAY_ROOMS_LATEST_MS) { skip(`not begun: the boots took ${Math.round(age / 1000)} s, over the ${DISPLAY_ROOMS_LATEST_MS / 1000} s after which the leg would outstay about two minutes`); return; }
  // ONE bound for all of it: whatever has not come back by then is given up (a page whose frames stopped would never answer)
  const end = Date.now() + DISPLAY_ROOMS_MS;
  const within = (p, what) => { let timer = null; const ms = Math.max(0, end - Date.now()); return Promise.race([p, new Promise((_, no) => { timer = setTimeout(() => no(new Error(`${what}: not back within the ${DISPLAY_ROOMS_MS / 1000} s the rooms' rows are given`)), ms); })]).finally(() => clearTimeout(timer)); };
  const bench = async (which) => {
    const what = `the rooms' rows, ${which === 'hall' ? 'the hall' : 'the old room'}`;
    let win = null;
    try { win = await s.c.eval('({ visibility: document.visibilityState, focus: document.hasFocus(), inner: [innerWidth, innerHeight], dpr: devicePixelRatio })'); } catch { win = null; }
    const g = await gpuBeside(() => within(s.c.eval(call(pageBench2, BENCH_N, BENCH_WARM, S2_PACED, S2_SKIP, DISPLAY_ROWS)), what)); // (given up at the bound: the sampler ends with it)
    const B = g.value, base = B.rows.find((x) => x.key === 'asbuilt') ?? null, pbase = B.paced.find((x) => x.key === 'asbuilt') ?? null;
    R[which] = { window: win, bench: { renders: BENCH_N, warm: BENCH_WARM, pacedIntervals: S2_PACED, pacedSkip: S2_SKIP, ...B } };
    info(`${what} (the window ${J(win)}): IN A ROW (composer.render() ${BENCH_N} time(s); total = ms per render until the renderer finished): ${B.rows.map((x) => `${x.name}: cpu ${x.cpuMs}, total ${x.totalMs}${base && x !== base ? ` (${ms1(x.totalMs - base.totalMs)} against as built)` : ''}`).join(' | ')}${B.err.length ? `; the bench said ${J(B.err)}` : ''}`);
    info(`${what}: PACED (one render an animation frame, the app's own loop drawing nothing, ${S2_PACED} interval(s) after ${S2_SKIP} unmeasured; [median, p95, least, most] ms, the share over 1.5 medians): ${B.paced.map((x) => `${x.name}: [${x.median}, ${x.p95}, ${x.least}, ${x.most}], over ${x.over}${pbase && x !== pbase ? ` (${ms1(x.median - pbase.median)} against as built)` : ''}`).join(' | ')}; the page before the rows ${J(B.before)}`);
    gpuTell(what, R[which].bench, g.gpu);
    if (!B.before || !eq(B.before, B.after)) say('NOTE', `${what}: the rows did NOT leave the page as they found it: ${J({ before: B.before, after: B.after })}`);
  };
  if (DISPLAY_ROOMS === 'all' || DISPLAY_ROOMS === 'hall') {
    const last = M.boots[M.boots.length - 1] ?? null;
    if (!(last && !last.incomplete && !last.toFirstPaintOnly && last.phase === 'hall')) skip('the hall: the last boot does not stand in the hall');
    else { try { await bench('hall'); } catch (e) { skip(`the hall: ${String(e?.message ?? e).slice(0, 300)}`); } } // (the old room's half is still tried)
  }
  if (DISPLAY_ROOMS === 'all' || DISPLAY_ROOMS === 'old') {
    const [r0, r] = await within((async () => {
      await s.c.send('Page.navigate', { url: 'about:blank' });
      for (const [m, a] of [['Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'all' }], ['Network.clearBrowserCache', {}]]) await s.c.send(m, a);
      const first = await boot(s, appUrl(), { seed: seedOld('pace-median', LITE_OLD) }); // (step 2: `old` on both rungs is the old room)
      await until('the old room ready', T.paint, () => s.c.eval('window.__test?.ready === true'));
      await sleep(DEV ? 4000 : 2500); // (its camera lands and its loop comes to rest)
      return [first, await read(s, true)];
    })(), "the old room's boot");
    R.oldBoot = { lookBoot: r0?.lookBoot ?? null, clubDefined: r?.clubDefined ?? null, renderer: r?.renderer ?? null, dpr: r?.dpr ?? null, size: r?.size ?? null };
    info(`the rooms' rows, the old room's boot (a record a slow device holds; the same browser): ${J(R.oldBoot)}`);
    if (r0?.lookBoot?.shown === 'old' && r?.clubDefined === false) await bench('old');
    else skip(`the old room: its boot did not show the old room without the leaf (${J(R.oldBoot)})`);
  }
  const h = R.hall?.bench, o = R.old?.bench;
  if (h && o) {
    const of = (b, key, paced) => { const x = (paced ? b.paced : b.rows).find((y) => y.key === key); return x ? (paced ? x.median : x.totalMs) : null; };
    info(`THE ROOMS' ROWS side by side, [row, the hall ms a render in a row, the old room, the hall's paced median, the old room's]: ${J(DISPLAY_ROWS.map((k) => [k, of(h, k, false), of(o, k, false), of(h, k, true), of(o, k, true)]))}`);
  }
}
legs['14'] = async () => {
  const t0 = Date.now();
  const M = (out.display = { headed: HEADED, boots: [], idle: null, notBegun: 0,
    from: "ONE browser for the leg (with --headed: one visible window of the installed browser, the launcher's own headed mode and its temporary profile folder). idle = the animation frames of the origin's root page before the first boot (the frame period this window gets with nothing drawn). boots[]: each a first visit again (about:blank, then Storage.clearDataForOrigin 'all' for the origin and Network.clearBrowserCache, then the real-user URL; markAtFirstPaint = the mark the boot before left in the origin's storage, read at first paint: null when the clear worked): lookBoot at first paint, the device as the page reads it (renderer, pixel ratio, inner and outer size), the stage's facts, the leaf's pace report, judged = main.js lookJudgePace over it, and the window's visibility and focus at the report" });
  info(`${DISPLAYBOOTS} hall boot(s) in ONE browser${HEADED ? ', HEADED: one visible window of the installed browser on this display' : ' (not headed: the pinned headless shell; --headed makes it a visible window)'}`);
  const s = await session({ headed: HEADED });
  try {
    try { M.idle = await s.c.eval(call(pageIdleFrames, DEV ? 20 : 90, 5)); } catch (e) { M.idle = { error: String(e?.message ?? e).slice(0, 200) }; }
    info(`the animation frames of an idle page in this browser (the origin's root, nothing drawn): ${J(M.idle)}`);
    for (let i = 0; i < DISPLAYBOOTS; i++) {
      const what = `boot ${i + 1}`;
      const short = DEV && (i > 0 || DISPLAY_ROOMS === 'old'); // (a development run: a software hall boot takes minutes, so the boots after the first go to first paint only; all of them when the old room's half is run alone)
      if (left() <= (DEV ? (short ? 90000 : 400000) : 60000)) { M.notBegun += 1; info(`${what} was not begun: ${Math.round(left() / 1000)} s were left before the suite's own deadline`); continue; }
      let r0 = null, r = null, ended = null, cleared = null, marker = null;
      try {
        // a first visit again: the last document gone, the origin's storage and the browser's cache emptied
        await s.c.send('Page.navigate', { url: 'about:blank' });
        cleared = [];
        for (const [m, a] of [['Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'all' }], ['Network.clearBrowserCache', {}]]) { try { await s.c.send(m, a); cleared.push(m); } catch (e) { cleared.push(`${m} FAILED: ${String(e?.message ?? e).slice(0, 120)}`); } }
        r0 = await boot(s, appUrl(HALLQ));
        marker = await s.c.eval(`localStorage.getItem(${J(DISPLAY_MARK)})`); // (what the boot before left in the origin's storage: must be gone)
        if (!short) { await hall(s); r = await reported(s, r0.record); }
      } catch (e) { ended = String(e?.message ?? e).slice(0, 400); }
      if (ended || short) { try { r = await read(s, true); } catch { r = r ?? r0; } }
      let win = null, left1 = false;
      try { win = await s.c.eval('({ visibility: document.visibilityState, focus: document.hasFocus(), outer: [outerWidth, outerHeight] })'); } catch { win = null; }
      try { left1 = (await s.c.eval(`(() => { localStorage.setItem(${J(DISPLAY_MARK)}, ${J(String(i + 1))}); return localStorage.getItem(${J(DISPLAY_MARK)}); })()`)) === String(i + 1); } catch { left1 = false; } // (a mark for the next boot's clear to remove)
      const st = r?.club?.stage ?? {}, pace = st.pace ?? null, j = pace ? judgePace(pace) : { verdict: null, why: 'no report' };
      const row = { boot: i + 1, lookBoot: r0?.lookBoot ?? null, tier: r?.club?.tier ?? tierOf(r0 ?? {}), incomplete: ended, toFirstPaintOnly: short, cleared, markAtFirstPaint: marker, markLeft: left1, renderer: r?.renderer ?? null, dpr: r?.dpr ?? null, size: r?.size ?? null, window: win,
        phase: st.phase ?? null, swapMs: st.swapMs ?? null, linkedInSwap: st.linkedInSwap ?? null, keptFrames: st.keptFrames ?? null, quietAtReveal: st.quietAtReveal ?? null, period: pace?.period?.ms ?? null, share: pace?.period?.share ?? null,
        hall: pace?.hall ? { frames: pace.hall.frames, median: pace.hall.median, p95: pace.hall.p95, over: pace.hall.over, closedBy: pace.hall.closedBy } : null, judged: { verdict: j.verdict, why: j.why } };
      M.boots.push(row);
      info(`${what} (${row.tier}; lookBoot ${J(row.lookBoot)}; renderer ${J(row.renderer)}, pixel ratio ${row.dpr}, inner ${J(row.size)}, the window ${J(win)}): ${ended ? `NO HALL: ${ended}` : short ? 'to first paint only (a development run)' : `swapMs ${row.swapMs} (linkedInSwap ${row.linkedInSwap}), keptFrames ${row.keptFrames}; pace: period ${row.period} ms (share ${row.share}), hall ${J(row.hall)}; main.js says ${J(row.judged)}`}`);
      check(`${what} is a first visit again (the storage and the cache emptied${i > 0 ? ', the mark the boot before left is gone' : ''}; lookBoot by 'pass-new')`, !!cleared && cleared.every((x) => !/FAILED/.test(x)) && marker === null && (i === 0 || M.boots[i - 1]?.markLeft === true) && r0?.lookBoot?.why === 'pass-new', J({ cleared, markAtFirstPaint: marker, markLeftBefore: i > 0 ? M.boots[i - 1]?.markLeft : null, lookBoot: r0?.lookBoot }));
      if (!short) check(`${what} reached the hall and its pace report`, !ended && st.phase === 'hall' && !!pace, ended ?? J({ phase: st.phase, failed: st.failed, pace: !!pace }));
      if (!short) check(`${what}: the window was visible at the report`, win?.visibility === 'visible', J(win));
    }
    info(`THE DISPLAY'S NUMBER by boot, [boot, hall median ms, p95, share over, period ms, verdict]: ${J(M.boots.map((b) => [b.boot, b.hall ? b.hall.median : null, b.hall ? b.hall.p95 : null, b.hall ? b.hall.over : null, b.period, b.judged.verdict]))}`);
    // THE ROOMS' ROWS, in this same browser. The boots' rows stand on the lines above and, from here, in the file: nothing below takes them back.
    if (DISPLAY_ROOMS !== 'none') {
      saveOut("leg 14: the boots' rows; the rooms' rows follow");
      try { await displayRooms(s, M, t0); } catch (e) { const why = String(e?.message ?? e).slice(0, 400); M.rooms = { ...(M.rooms ?? {}), ended: why }; say('NOTE', `the rooms' rows did not run to their end (the boots' rows above stand): ${why}`); }
    }
  } finally { await s.close(); }
  info(`display measures: ${M.boots.length} boot(s)${M.rooms ? `, the rooms' rows ${[M.rooms.hall ? 'in the hall' : null, M.rooms.old ? 'in the old room' : null].filter(Boolean).join(' and ') || 'not run'}` : ''}${M.notBegun ? `, ${M.notBegun} not begun` : ''}${OUT ? `; written to ${OUT}` : ''}`);
};

// ---- the suite's own planted reds (no browser) ---------------------------------------------------------------------------------
function selftest() {
  legNow = 'selftest';
  const n = STRIPS.length * BINS * 3;
  const pic = (wall, rest) => Array.from({ length: n }, (_, i) => (i < WALL * BINS * 3 ? wall + (i % 7) : rest + (i % 11)));
  const K = pic(4, 90), HALLP = pic(120, 70), OLD = pic(150, 95).map((v, i) => (i % 3 === 2 ? Math.round(v * 0.5) : v));
  const mix = (w, a, b) => a.map((v, i) => Math.round(w * v + (1 - w) * b[i]));
  const good = [{ n: 5, s: pic(3, 60) }, { n: 30, s: K }, { n: 1, s: mix(0.81, K, HALLP) }, { n: 1, s: mix(0.46, K, HALLP) }, { n: 1, s: mix(0.13, K, HALLP) }, { n: 6, s: HALLP }];
  const toOld = [{ n: 9, s: K }, { n: 1, s: mix(0.81, K, OLD) }, { n: 1, s: mix(0.46, K, OLD) }, { n: 1, s: mix(0.13, K, OLD) }, { n: 4, s: OLD }];
  const ins = (list, at, x) => [...list.slice(0, at), x, ...list.slice(at)];
  const rows = [
    ['a stage boot to the hall passes', judgePictures(good, { want: 'hall', oldRef: OLD }).ok === true],
    ['a failed boot to the old room passes as such', judgePictures(toOld, { want: 'old', oldRef: OLD }).ok === true],
    ['RED: an old-room picture after the kept frame', judgePictures(ins(good, 2, { n: 1, s: OLD }), { want: 'hall', oldRef: OLD }).ok === false],
    ['RED: an old-room picture as the first picture', judgePictures(ins(good, 0, { n: 1, s: OLD }), { want: 'hall', oldRef: OLD }).ok === false],
    ['RED: an old-room picture in the middle of the dissolve', judgePictures(ins(good, 3, { n: 1, s: OLD }), { want: 'hall', oldRef: OLD }).ok === false],
    ['RED: the hall wanted, the old room shown', judgePictures(toOld, { want: 'hall', oldRef: OLD }).ok === false],
    ['RED: the old room wanted, the hall shown', judgePictures(good, { want: 'old', oldRef: OLD }).ok === false],
    ['RED: a cut (no blend)', judgePictures([good[0], good[1], good[5]], { want: 'hall', oldRef: OLD }).ok === false],
    ['RED: two dissolves', judgePictures([...good.slice(0, 5), good[3], good[4], good[5]], { want: 'hall', oldRef: OLD }).ok === false],
    ['RED: the stage comes back after the hall', judgePictures([...good, { n: 2, s: K }, { n: 2, s: HALLP }], { want: 'hall', oldRef: OLD }).ok === false],
    ['RED: the stage never ends', judgePictures([good[0], good[1]], { want: 'hall', oldRef: OLD }).ok === false],
    ['RED: an old room whose wall band is dark cannot be the reference', judgePictures(good, { want: 'hall', oldRef: K }).ok === false],
  ];
  const atRest = { s: HALLP, scene: { read: true, bad: 0, texels: 230400, type: 1016 }, cube: { read: true, bad: 0, texels: 1572864, type: 1016 }, err: null };
  rows.push(
    ['the hall at rest: a lit picture, a finite scene buffer and a finite cube pass', judgeRest(atRest).ok === true && judgeRest(atRest).why === null],
    ['RED: a hall that went black after the reveal', judgeRest({ ...atRest, s: HALLP.map(() => 0) }).ok === false && /is dark/.test(judgeRest({ ...atRest, s: HALLP.map(() => 0) }).why)],
    ["RED: non-finite texels in the scene's own buffer (136,118 of 230,400: the hall as it was found)", judgeRest({ ...atRest, scene: { ...atRest.scene, bad: 136118 } }).ok === false && /^the scene's own buffer holds 136118 non-finite/.test(judgeRest({ ...atRest, scene: { ...atRest.scene, bad: 136118 } }).why)],
    ['RED: ONE non-finite texel in the reflection cube (it stays for good)', judgeRest({ ...atRest, cube: { ...atRest.cube, bad: 1 } }).ok === false && /reflection cube holds 1 non-finite/.test(judgeRest({ ...atRest, cube: { ...atRest.cube, bad: 1 } }).why)],
    ['RED: a buffer that could not be read, a count that is none, and no reading at all', [{ ...atRest, scene: { read: false, bad: null, texels: 230400, why: 'x' } }, { ...atRest, cube: null }, { ...atRest, cube: { read: true, bad: null, texels: 6 } }, { ...atRest, err: 'thrown' }, { ...atRest, s: null }, null].every((x) => judgeRest(x).ok === false && /could not be read/.test(judgeRest(x).why))],
  );
  const P = RULES.LOOK_PACE, per = 16.67;
  const pace = (median, over = 0, p95 = median) => ({ period: { ms: per, frames: 100, share: 0.9 }, hall: { frames: 120, median, p95, over, complete: true, closedBy: 'frames' }, stage: { frames: 30 }, hidden: 0 });
  rows.push(
    ["the product's rule: a hall in step with the display passes", judgePace(pace(per)).verdict === 'hall'],
    ["RED: a hall at half the display's rate is condemned", judgePace(pace(2 * per)).verdict === 'old'],
    ['RED: a hall just over MEDIAN_PERIODS is condemned', judgePace(pace(P.MEDIAN_PERIODS * per + 0.5)).verdict === 'old'],
    ['RED: a hall over OVER_SHARE is condemned', judgePace(pace(per, P.OVER_SHARE + 0.05)).verdict === 'old'],
    ['RED: a hall over P95_PERIODS is condemned', judgePace(pace(per, 0, P.P95_PERIODS * per + 1)).verdict === 'old'],
    ["the GPU's statistics are read from the tool's answer (the driver's own line, as this Mac prints it)", eq(gpuStats('      "MetalPluginName" = "AGXMetalG14X"\n      "PerformanceStatistics" = {"In use system memory (driver)"=0,"Alloc system memory"=2067169280,"Tiler Utilization %"=7,"recoveryCount"=0,"lastRecoveryTime"=0,"Renderer Utilization %"=42,"TiledSceneBytes"=589824,"Device Utilization %"=93,"SplitSceneCount"=3,"Allocated PB Size"=56098816,"In use system memory"=359104512}\n'), { device: 93, renderer: 42, tiler: 7, splits: 3, tiledBytes: 589824 })],
    ['RED: an answer without the statistics, or without the device line, gives none', gpuStats('+-o AGXAcceleratorG14X  <class AGXAcceleratorG14X>\n') === null && gpuStats('"PerformanceStatistics" = {"Tiler Utilization %"=7}') === null && gpuStats(null) === null],
    ["the samples of a row's span: how many, each utilisation as [median, least, most], the split counter first and last; a span with none says 0", eq(gpuOver([[10, { device: 5, renderer: 5, tiler: 1, splits: 2, tiledBytes: 1 }], [20, { device: 90, renderer: 80, tiler: 9, splits: 2, tiledBytes: 3 }], [30, { device: 96, renderer: 88, tiler: 8, splits: 5, tiledBytes: 2 }], [40, { device: 94, renderer: 84, tiler: 7, splits: 9, tiledBytes: 2 }], [50, { device: 3, renderer: 3, tiler: 1, splits: 9, tiledBytes: 1 }]], 20, 40), { n: 3, device: [94, 90, 96], renderer: [84, 80, 88], tiler: [8, 7, 9], splits: [2, 9], tiledBytes: [2, 2, 3] }) && eq(gpuOver([[10, { device: 5 }]], 20, 40), { n: 0 })],
    ["the swap's links: a leaf that counts none passes", judgeSwapLinks({ linkedInSwap: 0 }).ok === true && judgeSwapLinks({ linkedInSwap: 0 }).why === null],
    ["RED: programs first linked inside the swap (24: the hall before the warm's second pass), and RED: a leaf that gives no count", judgeSwapLinks({ linkedInSwap: 24 }).ok === false && /^24 program/.test(judgeSwapLinks({ linkedInSwap: 24 }).why) && [{}, { linkedInSwap: null }, { linkedInSwap: '0' }, { linkedInSwap: -1 }, null].every((x) => judgeSwapLinks(x).ok === false && judgeSwapLinks(x).n === null)],
    ['too few frames: no verdict', judgePace({ ...pace(per), hall: { ...pace(per).hall, frames: P.MIN_FRAMES - 1, complete: false } }).verdict === null],
    ["the classes: 'import' and 'import: room: ...' are fetches, 'timeout' a timeout, 'room: off' the build", RULES.lookFailClass('import') === 'fetch' && RULES.lookFailClass('import: room: Failed to fetch') === 'fetch' && RULES.lookFailClass('timeout') === 'timeout' && RULES.lookFailClass('room: off by ?cluboff') === 'build'],
    ['a pass record has no problem', recordProblems(J({ v: 1, app: 'a|b|1', verdict: 'hall', why: 'pace-ok', passed: true, slow: 0, fails: { fetch: 0, build: 0, timeout: 0 } }), 'a|b|1', { verdict: 'hall', why: 'pace-ok', passed: true, slow: 0, fails: { fetch: 0, build: 0, timeout: 0 } }).length === 0],
    ['RED: a record under another app version', recordProblems(J({ v: 1, app: 'x|y|1', verdict: 'hall', why: 'pace-ok' }), 'a|b|1', { verdict: 'hall' }).length > 0],
    ['RED: an old verdict where hall is wanted', recordProblems(J({ v: 1, app: 'a|b|1', verdict: 'old', why: 'pace-median' }), 'a|b|1', { verdict: 'hall', why: 'pace-ok' }).length === 2],
  );
  const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
  const swOf = (b) => `const PRECACHE = [\n  ['./a.js', '${sha('A')}', 1],\n  ['./b.css?v=3', '${sha(b)}', 1],\n];\n`;
  const tree = (rel) => ({ './a.js': 'A', './b.css': 'B' })[rel];
  rows.push(
    ["a worker's boot manifest that is the tree passes", staleBootEntries(swOf('B'), tree).length === 0],
    ['RED: one boot file that is not the bytes its digest names', eq(staleBootEntries(swOf('b of another build'), tree), ['b.css'])],
  );
  rows.push(
    ['two spans that share time overlap, whichever began first', overlaps(10, 50, 40, 90, 100) === true && overlaps(40, 90, 10, 50, 100) === true],
    ['RED: a span that ended before the other began does not overlap it', overlaps(10, 30, 40, 90, 100) === false && overlaps(40, 90, 10, 30, 100) === false],
    ['a span that had not ended by the read is open to the read', overlaps(10, null, 40, 90, 100) === true && overlaps(95, null, 40, 90, 100) === false && overlaps(10, 30, 40, null, 100) === false],
    ['a span that never began says nothing', overlaps(null, null, 40, 90, 100) === null && overlaps(10, 50, null, null, 100) === null],
  );
  const sum = (v) => v.reduce((a, x) => a + x, 0);
  const nets = linkRates(), oldRec = { verdict: 'old', why: 'timeout', fails: { fetch: 0, timeout: 2, build: 0 } };
  rows.push(
    ['a link is read from a table of the 3G arm\'s form', eq(linkRates('export const NETS = {\n  a1: { latency: 7.5, downloadThroughput: 1000, uploadThroughput: 9 },\n  b2: { latency: 40, downloadThroughput: 250, uploadThroughput: 250 },\n};\n'), { a1: { latency: 7.5, rate: 1000 }, b2: { latency: 40, rate: 250 } })],
    ["the 3G arm's own file still has that form (its two links, each with a rate and a latency)", ['fast3g', 'slow3g'].every((k) => nets[k] && nets[k].rate > 0 && nets[k].latency >= 0)],
    ['RED: a table in another form gives no link', eq(linkRates('  a1: { downloadThroughput: 1000 },\n'), {})],
    ['the link shares a tick equally among the responses in flight', eq(linkShares(90, [100, 100, 100]), [30, 30, 30])],
    ['what a nearly finished response does not need goes to the others', eq(linkShares(90, [10, 100, 100]), [10, 40, 40])],
    ['RED: a tick never sends more than its budget, nor more than a response has left', sum(linkShares(7, [100, 100, 100])) === 7 && eq(linkShares(1000, [3, 4]), [3, 4]) && eq(linkShares(0.9, [5]), [0])],
    ['a next boot that asks for the hall again: the visit cost nothing yet', /^nothing yet: /.test(costOfBoot({ shown: 'hall', why: 'pass-retry' }, { fails: { fetch: 0, timeout: 1, build: 0 } }))],
    ['a leaf file is known by its path: a module, a baked map, another texture, anything else', eq(['/scene/club/arena/room.js', '/assets/club/arena-light.png', '/assets/club/hdri-room.png', '/assets/club/arena-env-lite.png', '/assets/club/floor-color.jpg', '/assets/club/manifest.json'].map(leafGroup), ['modules', 'baked light and environment maps', 'baked light and environment maps', 'baked light and environment maps', 'other textures', 'anything else'])],
    ['the leaf at a moment: asked, wholly arrived and their bytes, by group and in all', (() => { const t = leafAtBound([{ path: '/scene/club/a.js', bytes: 10, linkBytes: 4, askedMs: 5, endMs: 20 }, { path: '/scene/club/b.js', bytes: 30, linkBytes: 9, askedMs: 6, endMs: 90 }, { path: '/assets/club/x.jpg', bytes: 100, linkBytes: 100, askedMs: 70, endMs: null }], 50); return eq(t.groups.modules, { files: 2, bytes: 40, linkBytes: 13, asked: 2, arrived: 1, bytesArrived: 10, linkBytesArrived: 4, pending: 1 }) && eq(t.groups['other textures'], { files: 1, bytes: 100, linkBytes: 100, asked: 0, arrived: 0, bytesArrived: 0, linkBytesArrived: 0, pending: 0 }) && t.files === 3 && t.bytes === 140 && t.linkBytes === 113 && t.asked === 2 && t.arrived === 1 && t.pending === 1; })()],
    ['the host compresses text, JSON and wasm for a request that accepts gzip, and no picture or sound', gzipFor('.js', 'gzip, deflate') && gzipFor('.JSON', 'deflate, gzip;q=0.8') && gzipFor('.wasm', 'gzip') && gzipFor('.webmanifest', 'gzip, br') && !gzipFor('.js', 'deflate') && !gzipFor('.js', undefined) && !gzipFor('.png', 'gzip') && !gzipFor('.jpg', 'gzip') && !gzipFor('.wav', 'gzip')],
    ...(() => {
      // the slow link's one law (slowLaw) and its pending test (pendingAt): rows of a paced server, times in ms
      const fileIn = { path: '/scene/club/a.js', askedMs: 5, endMs: 40, cutMs: null }, open = { path: '/assets/club/x.jpg', askedMs: 60, endMs: 300, cutMs: null }, never = { path: '/assets/club/y.jpg', askedMs: 70, endMs: null, cutMs: null };
      const later = { path: '/assets/club/z.jpg', askedMs: 150, endMs: 400, cutMs: null }, cut = { path: '/assets/club/w.jpg', askedMs: 20, endMs: null, cutMs: 80 }, back304 = { path: '/scene/club/b.js', status: 304, askedMs: 10, endMs: 30, cutMs: null }, open304 = { ...back304, endMs: 130 };
      const oldNow = { before: { verdict: null }, after: { verdict: 'old', why: 'timeout' }, cls: 'timeout', firedMs: 100, entryAtMs: 50 };
      return [
        ['a request is pending when it was asked and is neither answered nor given up: not before it is asked, not after its last byte', eq(leafPending([fileIn, open, never, later, cut, back304, open304], 100).map((e) => e.path), ['/assets/club/x.jpg', '/assets/club/y.jpg', '/scene/club/b.js']) && leafPending([open, never], 350).length === 1 && leafPending([later], 100).length === 0],
        ["the law holds: 'old' from a boot whose every asked request was in (a file not asked for yet is not pending; a 304 arrives when answered; a request given up has failed)", slowLaw({ ...oldNow, rows: [fileIn, later, back304, cut] }).ok === true && slowLaw({ ...oldNow, rows: [fileIn, later, back304, cut] }).pending === 0],
        ["RED: 'old' from a boot with a file asked and not arrived when its bound fired", slowLaw({ ...oldNow, rows: [fileIn, open] }).ok === false && slowLaw({ ...oldNow, rows: [fileIn, open] }).pending === 1],
        ["RED: 'old' from a boot with a revalidation asked and not answered", slowLaw({ ...oldNow, rows: [fileIn, open304] }).ok === false],
        ["RED: 'old' from a boot whose entry had not arrived (no install by then, or none at all): one pending request", slowLaw({ ...oldNow, rows: [], entryAtMs: null }).ok === false && slowLaw({ ...oldNow, rows: [], entryAtMs: 120 }).pending === 1 && slowLaw({ ...oldNow, rows: [{ path: '/scene/club/index.js', askedMs: 2, endMs: null, cutMs: null }], entryAtMs: null }).pending === 1],
        ["the law is about a stored 'old' from a bound or a budget: pending bytes with a failed fetch on record, a build's own error, a boot that began with 'old', a boot without a failure all pass", slowLaw({ ...oldNow, after: { verdict: null }, cls: 'fetch', rows: [open] }).ok && slowLaw({ ...oldNow, after: { verdict: 'old', why: 'build' }, cls: 'build', rows: [open] }).ok && slowLaw({ ...oldNow, before: { verdict: 'old' }, rows: [open] }).ok && slowLaw({ before: null, after: null, cls: null, firedMs: null, rows: [open], entryAtMs: 50 }).ok],
      ];
    })(),
    ...(() => {
      // the product's lines for a bound or a budget (main.js boundWhy, the leaf's stageCause), by main.js's own classes
      const fetches = ['import: the bound, the entry had not arrived', 'assets: the bound, module requests not in: 2', 'assets: the bound, files not in: 5', 'assets: the bound, no answer from the leaf', 'assets: files not in: 4; room: not ready after 24000 ms (adopted late if it arrives)',
        'assets: module requests not in: 1; env: not ready after 12000 ms (adopted late if it arrives)', "assets: files not in: 2; the hall's files or bakes were not in after 12000 ms"];
      const timeouts = ['timeout', 'timeout: room: not ready after 24000 ms (adopted late if it arrives)', "timeout: the hall's files or bakes were not in after 12000 ms"];
      const which = (line) => Object.keys(TOLD).filter((k) => TOLD[k].test(line)).join('+');
      return [
        ["the rule's lines by main.js's own classes: a bound or a budget over something awaited is a fetch, with nothing awaited a timeout", fetches.every((l) => RULES.lookFailClass(l) === 'fetch') && timeouts.every((l) => RULES.lookFailClass(l) === 'timeout')],
        ["the legs' patterns take their own lines: 5c the bound before the entry, 5e the room's own line or main's bare word, 5f files on their way (a budget's line or the bound's)", eq([fetches[0], timeouts[0], timeouts[1], fetches[2], fetches[4], fetches[6]].map(which), ['entry', 'slowBuild', 'slowBuild', 'filesOut', 'filesOut', 'filesOut'])],
        ["RED: each pattern refuses the other cases (a fetch is not a slow build; modules or no answer are not files; another service's line or the files' wait is not the room's)", eq([fetches[1], fetches[3], fetches[5], timeouts[2], 'import', 'timeout: env: not ready after 12000 ms (adopted late if it arrives)', 'assets: files not in: 4 of 9'].map(which), ['', '', '', '', '', '', ''])],
      ];
    })(),
    ["leg 5e's stand-in: every export of the real room and, over it, the factory the leaf's own table names, never settling", (() => { const m = endlessRoom("const SERVICES = [\n  ['room', './room.js', 'makeIt'],\n];"); return m?.factory === 'makeIt' && /^export \* from '\.\/room\.js\?real=1';\nexport const makeIt = \(\) => new Promise\(\(\) => \{\}\);\n$/.test(m.body) && endlessRoom(fs.readFileSync(path.join(webDir, 'scene', 'club', 'index.js'), 'utf8')) !== null; })()],
    ['RED: a leaf whose table names no room factory gives no stand-in', endlessRoom("const SERVICES = [['env', './env.js', 'createEnv']];") === null],
    ['a conditional request is answered 304 by its ETag (weakly compared) or, without one, by its date', notModified({ 'if-none-match': 'W/"a-1"' }, 'W/"a-1"', 5000) && notModified({ 'if-none-match': '"x", "a-1"' }, 'W/"a-1"', 5000) && notModified({ 'if-modified-since': new Date(5000).toUTCString() }, 'W/"a-1"', 5000)],
    ['RED: another ETag is not a 304 even when the date would be, and no validator is no 304', !notModified({ 'if-none-match': 'W/"b-2"', 'if-modified-since': new Date(9000).toUTCString() }, 'W/"a-1"', 5000) && !notModified({}, 'W/"a-1"', 5000) && !notModified({ 'if-modified-since': new Date(1000).toUTCString() }, 'W/"a-1"', 5000)],
    ["the dissolve's end over frame times, by the product's own arithmetic read from main.js (present, and a slow renderer needs five frames after the kept one)", RULES.dissolve !== null && dissolveEnd([0, 8000, 16000, 24000, 32000, 40000, 48000], RULES.dissolve) === 40000],
    ['RED: frames that stop before the dissolve ends give no end, and a fast renderer needs the whole dissolve time', dissolveEnd([0, 8000, 16000], RULES.dissolve) === null && dissolveEnd(Array.from({ length: 30 }, (_, i) => i * 10), RULES.dissolve) === null && dissolveEnd(Array.from({ length: 80 }, (_, i) => i * 10), RULES.dissolve) !== null],
    ['the light hall on the next boot is told as the cost of the STANDARD hall, not as "the hall again"', /^the standard hall for this app version: the next boot asks for the LIGHT hall \(light-new; /.test(costOfBoot({ shown: 'hall', why: 'light-new', rung: 'lite' }, oldRec))],
    ['RED: a retry of the standard hall is not read as the light hall', /^nothing yet: /.test(costOfBoot({ shown: 'hall', why: 'pass-retry' }, oldRec)) && !/LIGHT/.test(costOfBoot({ shown: 'hall', why: 'pass-retry' }, oldRec))],
    ["RED: a stored 'old' and a fetch wait each cost the hall, and are told apart", /^the hall for this app version: /.test(costOfBoot({ shown: 'old', why: 'verdict-old' }, oldRec)) && /until the player chooses Tournament anew/.test(costOfBoot({ shown: 'old', why: 'verdict-old' }, oldRec)) && /^the hall for LOOK_FETCH_WAIT_MS = /.test(costOfBoot({ shown: 'old', why: 'fetch-wait' }, { fails: { fetch: 2, timeout: 0, build: 0 } }))],
    ...(() => {
      // leg 6d's read after a declined offer (judgeDeclined): the stored strings before and after, and the leaf's pace facts
      const top = { v: 1, app: 'a|b|1', verdict: 'old', why: 'pace-median', at: 5, passed: false, slow: 1, fails: { fetch: 0, build: 0, timeout: 0 }, failAt: null, reason: null, pace: null };
      const rung = { verdict: 'hall', why: 'pace-ok', at: 9, passed: true, slow: 0, fails: { fetch: 0, build: 0, timeout: 0 }, failAt: null, reason: null, pace: { period: 16.7 } };
      const facts = { tier: 'lite', hall: { frames: 120 } }, b = J(top), jd = (after, pace = facts, before = b) => judgeDeclined(before, after, pace);
      return [
        ["a declined offer that wrote nothing passes, and so does one beside which the light hall's own report was booked under `lite`", eq(jd(b, null), { ok: true, booked: false, why: null }) && eq(jd(J({ ...top, lite: rung })), { ok: true, booked: true, why: null })],
        ['RED: a decline that cleared the record, or that changed one of its own fields beside a booked `lite`', jd(J({ ...top, verdict: null, why: 'anew' })).ok === false && jd(J({ ...top, slow: 0, lite: rung })).ok === false && /own fields/.test(jd(J({ ...top, slow: 0, lite: rung })).why)],
        ['RED: a member `lite` with no pace report of the light hall behind it (none, or one that names another tier), and a member that is no rung', jd(J({ ...top, lite: rung }), null).ok === false && jd(J({ ...top, lite: rung }), { tier: 'base' }).ok === false && jd(J({ ...top, lite: null })).ok === false && jd(J({ ...top, lite: 'x' })).ok === false],
        ['RED: a member `lite` that was there before and changed, a record that vanished, and a read that is no record', jd(J({ ...top, lite: rung }), facts, J({ ...top, lite: { ...rung, slow: 1 } })).ok === false && jd(null).ok === false && jd('{not json').ok === false],
      ];
    })(),
  );
  {
    // leg 12's cuts. A planted profile (microseconds): idle, then the swap's task (5 ms in a WebGL call under showPass, 1 ms
    // in the adopter's flush, 1 ms of its own), then a frame (4 ms in the renderer, 2 ms in a link), then idle.
    const U = 'http://127.0.0.1:1', fr = (functionName, file, lineNumber) => ({ functionName, url: file ? U + file : '', lineNumber, columnNumber: 0, scriptId: '1' });
    const prof = { startTime: 1000, endTime: 17000, samples: [8, 5, 5, 6, 3, 7, 9, 8], timeDeltas: [1000, 1000, 3000, 2000, 1000, 1000, 4000, 2000], nodes: [
      { id: 1, callFrame: fr('(root)', '', -1), children: [2, 8] }, { id: 2, callFrame: fr('stageRender', '/app/main.js', 1739), children: [3, 7] },
      { id: 3, callFrame: fr('stageSwap', '/scene/club/index.js', 654), children: [4, 6] }, { id: 4, callFrame: fr('showPass', '/scene/club/index.js', 1013), children: [5] },
      { id: 5, callFrame: fr('getProgramParameter', '', -1) }, { id: 6, callFrame: fr('flush', '/scene/club/adopt.js', 10) },
      { id: 7, callFrame: fr('render', '/vendor/three.module.min.js', 5), children: [9] }, { id: 8, callFrame: fr('(idle)', '', -1) }, { id: 9, callFrame: fr('linkProgram', '', -1) }] };
    const c = profileCut(prof, { afterMs: 5 }), calls = [[10, 5, 'a'], [14, 4, 'b'], [30, 2, 'a'], [100, 50, 'c']], g = glCut(calls, 12, 31);
    const twins = [{ name: 'M', key: 'a,b,c' }, { name: 'M', key: 'a,x,y' }, { name: 'N', key: 'a,b,d' }, { name: 'M', key: 'a,b' }];
    const wf = [[0, 10], [10, 10], [20, 10], [50, 20], [60, 10], [70, 10]]; // (leg 13's second bench: frames as [ms, the draws since the frame before])
    rows.push(
      ["a profile cut at the swap: the task from its first to its last sample, the self time by function (a WebGL call has no file), the time under each function of the leaf", c.found === true && eq(c.swap, { ms: 7, samples: 4, self: [['getProgramParameter', 5], ['flush /scene/club/adopt.js:11', 1], ['stageSwap /scene/club/index.js:655', 1]], within: [['stageSwap /scene/club/index.js:655', 7], ['showPass /scene/club/index.js:1014', 5], ['flush /scene/club/adopt.js:11', 1]] })],
      ['the time after the swap is cut by its length, a sample that outlasts it counted in part; the rest is the profile\'s last milliseconds', eq(c.after, { ms: 5, samples: 2, self: [['render /vendor/three.module.min.js:6', 4], ['linkProgram', 1]], within: [] }) && profileCut(prof).after === null && c.rest === null && eq(profileCut(prof, { restMs: 3 }).rest, { ms: 3, samples: 2, self: [['linkProgram', 2], ['(idle)', 1]], within: [] })],
      ['RED: a profile with no sample under the swap gives no cut of it', eq(profileCut({ ...prof, samples: [8, 7, 9, 8], timeDeltas: [1000, 1000, 1000, 1000] }), { found: false, samples: 4, swap: null, after: null, rest: null }) && profileCut(null).found === false && profileCut(null, { restMs: 3 }).rest === null],
      ['the timed calls of a window: each by the time it shares with it, by name, the longest whole', eq(g, { calls: 3, ms: 8, by: [['a', 4], ['b', 4]], longest: [[10, 5, 'a'], [14, 4, 'b'], [30, 2, 'a']] }) && glCut(calls, 200, 300).calls === 0],
      ["a program's nearest twin: the same name, as many key fields, the fewest that differ; RED: another name or another length is no twin", eq(keyTwin('a,b,d', 'M', twins), { fields: 1, diff: [[2, 'c', 'd']] }) && eq(keyTwin('a,b,c', 'M', twins), { fields: 0, diff: [] }) && keyTwin('a,b,d', 'Q', twins) === null && keyTwin('a,b,c,d', 'M', twins) === null],
      ["leg 13's variants from a list: the hall as built, one knob, several, each with the names the leaf must say it changed", eq(sweepVariants('asbuilt; dof:off ;dof:off,bloom:0'), [{ name: 'as built', query: '', knobs: [] }, { name: 'dof:off', query: 'clubknobs=dof:off', knobs: ['dof'] }, { name: 'dof:off,bloom:0', query: 'clubknobs=dof:off,bloom:0', knobs: ['dof', 'bloom'] }])],
      ['RED: a part that is not name:value pairs is dropped; the default list is whole and begins and ends as built', eq(sweepVariants('dof=off;;clubtier=lite;a:b;x:1,y'), [{ name: 'a:b', query: 'clubknobs=a:b', knobs: ['a'] }]) && sweepVariants(SWEEP_DEFAULT).length === 12 && sweepVariants(SWEEP_DEFAULT)[0].name === 'as built' && sweepVariants(SWEEP_DEFAULT)[11].name === 'as built'],
      ["the second bench's rows from a list: the keys named, in the suite's order; nothing named is all of them; RED: an unknown key is dropped", eq(s2Rows('B, asbuilt,again'), ['asbuilt', 'B', 'again']) && eq(s2Rows(undefined), S2_KEYS) && eq(s2Rows(''), S2_KEYS) && eq(s2Rows('asbuilt,lens,A'), ['asbuilt', 'A']) && S2_KEYS[0] === 'asbuilt' && S2_KEYS[S2_KEYS.length - 1] === 'again'],
      ["a window's frames: each interval beside its draws, the median, the long ones, and those that carry more draws", eq(framesCut(wf, 0, 100), { n: 5, median: 10, p95: 30, draws: 10, long: [[50, 30, 20, 10]], longMoreDraws: 1, ticks: 6 }) && eq(framesCut(wf, 5, 100).long, [[45, 30, 20, 10]])],
      ['RED: a long frame with the same draws as the others carries no more work; a tick without draws is no frame; frames outside the window are not counted', eq(framesCut(wf.map((x) => [x[0], 10]), 0, 100), { n: 5, median: 10, p95: 30, draws: 10, long: [[50, 30, 10, 10]], longMoreDraws: 0, ticks: 6 }) && eq(framesCut([[0, 10], [5, 0], [10, 10], [15, 0], [20, 10]], 0, 100), { n: 2, median: 10, p95: 10, draws: 10, long: [], longMoreDraws: 0, ticks: 5 }) && framesCut(wf, 200, 300).n === 0 && framesCut(null, 0, 1).n === 0 && framesCut(wf, 0, 10).n === 1],
    );
  }
  {
    // the tally by document (tallyRequest): the browser's request rows across a reload. L1 is the page before, L2 the new
    // one; times are the events' own clock, in seconds.
    const ev = (type, file, loaderId, timestamp) => ({ type, requestId: `${file}@${timestamp}`, loaderId, timestamp, request: { url: ORIGIN + file } });
    const run = (list) => { const s = { leaf: [], late: [], doc: null, docAt: null, reqs: new Map() }; for (const e of list) tallyRequest(s, e); return s; };
    const doc1 = ev('Document', '/app.html', 'L1', 1), doc2 = ev('Document', '/app.html', 'L2', 10), quiet = { leafCount: 0, clubDefined: false };
    const asks = run([doc1, ev('Script', '/scene/club/index.js', 'L1', 2), doc2, ev('Script', '/scene/club/index.js', 'L2', 10.5)]);
    const late = run([doc1, ev('Script', '/scene/club/index.js', 'L1', 2), doc2, ev('Script', '/scene/club/tiers.js', 'L1', 10.004), ev('Script', '/app/main.js', 'L2', 10.2)]);
    const anon = run([doc1, doc2, ev('Fetch', '/assets/club/x.jpg', '', 10.3), ev('Fetch', '/scene/club/a.js', undefined, 10.4)]);
    const first = run([ev('Script', '/scene/club/index.js', 'L0', 0.5)]);
    rows.push(
      ["RED: a request under the leaf's paths by the CURRENT document, after its own Document request, is counted: a boot that asks is refused", asks.leaf.length === 1 && asks.late.length === 0 && asks.leaf[0].doc === 'L2' && noLeaf(asks, quiet) === false],
      ['a request of the document BEFORE that is announced after the new Document request is set aside with its URL, its document and its clock, and is not counted', late.leaf.length === 0 && eq(lateSaid(late), [{ url: '/scene/club/tiers.js', doc: 'L1', ms: 4, thisDoc: 'L2' }]) && eq(leafSaid(late).counted, []) && noLeaf(late, quiet) === true],
      ['RED: a request that names no document is counted (fail closed), and so is one seen before any Document request', anon.leaf.length === 2 && anon.late.length === 0 && noLeaf(anon, quiet) === false && first.leaf.length === 1 && first.late.length === 0],
      ['a new Document request empties both lists: the page before and what was set aside for it are forgotten', (() => { const s = run([doc1, ev('Script', '/scene/club/index.js', 'L1', 2), doc2, ev('Script', '/scene/club/tiers.js', 'L1', 10.004), ev('Document', '/app.html', 'L3', 20)]); return s.leaf.length === 0 && s.late.length === 0 && s.doc === 'L3'; })()],
      ["RED: with an empty tally the page's own resource list or a hall object still refuse the boot", noLeaf(late, { leafCount: 1, clubDefined: false }) === false && noLeaf(late, { leafCount: 0, clubDefined: true }) === false],
    );
  }
  {
    // --pace-numbers: which lines only report (reportsOnly), both ways; the program count against its baseline (judgePrograms)
    const P = (type, name, key, id) => ({ id, type, name, used: 1, key });
    const listA = [P('MeshPhysicalMaterial', 'rail', 'k1', 3), P('MeshStandardMaterial', 'leg', 'k2', 4), P('ShaderMaterial', 'grade', 'k3', 9)];
    const listB = [listA[2], P('MeshPhysicalMaterial', 'rail', 'k1', 41), P('MeshStandardMaterial', 'leg', 'k2', 40)];
    const more = [...listA, P('MeshPhysicalMaterial', 'rail', 'k1|rung', 12)];
    rows.push(
      ['under --pace-numbers a line that needs real frame times reports and is not asserted; without the flag it is asserted', reportsOnly(true, false, true) === true && reportsOnly(true, false, false) === false && reportsOnly(true, true, false) === true],
      ['RED: --pace-numbers must not silence a line that needs no frame time (every other leg asserts as written)', reportsOnly(false, false, true) === false && reportsOnly(false, true, true) === false && reportsOnly(undefined, false, true) === false],
      ["a boot with the baseline's count keeps no list; two boots with the same programs in another order and under other ids have one digest", judgePrograms(listA, 3).same === true && judgePrograms(listA, 3).list === null && judgePrograms(listA, 3).digest === judgePrograms(listB, 3).digest && judgePrograms(listA, 3).count === 3],
      ["RED: a count that is not the baseline's keeps its list for --out, and its digest differs", judgePrograms(more, 3).same === false && judgePrograms(more, 3).list?.length === 4 && judgePrograms(more, 3).digest !== judgePrograms(listA, 3).digest],
      ['with no baseline set every boot keeps its list; a page that gave no list is a count of null, never a match', judgePrograms(listA, null).same === false && judgePrograms(listA, null).list?.length === 3 && judgePrograms(null, 3).count === null && judgePrograms(null, 3).same === false && judgePrograms(undefined, null).list === null],
    );
  }
  for (const [name, ok] of rows) check(name, ok);
  console.log(failures ? `E2E-LOOKBOOT SELFTEST FAIL (${failures} of ${rows.length})` : `E2E-LOOKBOOT SELFTEST PASS (${rows.length} rows: every plant caught, every control green)`);
}

// ---- run -----------------------------------------------------------------------------------------------------------------------------
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  if (argv.includes('--selftest')) selftest();
  else {
    if (HEADED && !(LEGS.length === 1 && LEGS[0] === '14')) { console.log(`e2e-lookboot: --headed is for leg 14 alone (asked: legs ${LEGS.join(',')}): nothing run, no window opened`); console.log('E2E-LOOKBOOT FAIL'); process.exit(2); }
    console.log(`e2e-lookboot: legs ${LEGS.join(',')}; ${W}x${H}; ports http ${PORT} cdp ${CDP_PORT}${HEADED ? '; HEADED: leg 14 opens ONE visible window of the installed browser' : ''}`
      + (DEV ? '; OB_LOOKBOOT_DEV=1: DEVELOPMENT RUN under software GL (clubtier=base forced; legs 3 (pace-ok), 4 and 11 REPORT and do not assert; nothing here is a result)' : '; a passing device is required (nothing is forced)')
      + (PACE_NUMBERS ? '; --pace-numbers: legs 3, 4 and 6c record their pace numbers and judge nothing of them (every other line asserts)' : ''));
    const unknown = LEGS.filter((l) => !ALL_LEGS.includes(l));
    if (unknown.length) { console.error(`E2E-LOOKBOOT FAIL: unknown leg(s) ${unknown.join(',')} (legs: ${ALL_LEGS.join(',')})`); process.exit(2); }
    const server = spawnStaticServer(webDir, PORT);
    await sleep(700);
    try {
      for (const id of LEGS) {
        legNow = id;
        if (left() <= 0) { check('the leg ran', false, "the suite's own deadline had passed before it began"); continue; }
        const t0 = Date.now();
        let stop = null;
        try { stop = await legs[id](); } catch (e) { check('the leg ran to its end', false, String(e?.message ?? e).slice(0, 600)); }
        for (const s of open.slice()) await s.close();
        if (firstBoot && !LEGS.slice(LEGS.indexOf(id) + 1).some((l) => l === '3' || l === '4')) firstBoot = null;
        info(`the leg took ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        if (stop === 'stop') break;
      }
    } finally {
      for (const s of open.slice()) await s.close();
      await stopStaticServer(server);
      out.failures = failures;
      if (OUT) { try { fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log(`e2e-lookboot: wrote ${OUT}`); } catch (e) { console.error(`E2E-LOOKBOOT FAIL: could not write ${OUT}: ${e.message}`); process.exitCode = 1; } }
    }
    console.log(process.exitCode ? `E2E-LOOKBOOT FAIL (${failures} failed assertion(s))` : 'E2E-LOOKBOOT PASS');
  }
}
