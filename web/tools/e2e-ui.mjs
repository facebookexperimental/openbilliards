// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-ui.mjs — UI-kit gate (006-ui-modernization, T011). Two modes, plus
// one node-only selftest that boots nothing:
//
//   node web/tools/e2e-ui.mjs --selftest-colour   #880 colour-register
//        compare proof (parse hex/rgb()/oklab()/oklch()/color() into sRGB,
//        compare at 1/255 per channel; --selftest-colour-plant is the
//        planted-defect run and must exit 1)
//
//   node web/tools/e2e-ui.mjs          behavior tests of the frozen kit
//        (select keyboard parity + type-ahead + viewport flip + e2e
//        value-setter path + stopPropagation proof, dialog focus trap +
//        layered Escape, confirmDialog Promise<boolean> semantics + the
//        LIVE settings game/equipment/look confirm flows, side-nav modal
//        (navmodal.js) settings-consumption + open/navigate/close component
//        arm (015 D9),
//        toggle/slider/segmented keyboard walk, rapid
//        open/close x20 strand check, self-contained motion, GEOMETRY CONTRACTS
//        (the design charter numeric laws: rem root, border-box, toolbar family,
//        gear ink centering, toggle geometry/orientation, popover column
//        alignment, slider resting identity, no mouse focus ring),
//        reduced-motion boot)
//
//   node web/tools/e2e-ui.mjs --audit  native-control audit: walks every
//        panel/dialog (settings via #ob-gear.click(), export via
//        __export.open(), replay bar via a scripted shot + #r= boot, and —
//        since GH-225 — the Playback save card via an archive-armed boot +
//        scripted shot + __playback.save() with the Advanced disclosure
//        EXPANDED, the coverage gap that let a raw native <select> ship in
//        the Playback surface) and
//        FAILS (exit 1) on any VISIBLE native-styled control:
//          select:not([hidden]) without a [data-ob=select-button] sibling
//          input[type=checkbox] not inside .ob-toggle
//          input[type=range] without .ob-range
//          input[type=radio] not inside .ob-segmented
//        2026-07 BUTTON AUDIT (owner build-11 icon-centring defect) adds two
//        dimensions, on every walked surface incl. the phone register:
//          icon/label optical centring — in a ROW-composed control the
//            face's box centre must sit on the button's CONTENT-box centre
//            within +/-0.5px, and no ui/icons.js face may compute
//            display:inline (the CAUSE row, so a red names the mechanism).
//            Column tiles are excluded by an AXIS TEST, never an id list.
//          rolled-own button ratchet (KIT_BUTTON_WALKER) — a re-skinned
//            button carrying neither .ob-btn nor a .ob-panel host must be in
//            the FROZEN ROLLED_OWN_OK ledger; the ledger can only SHRINK, so
//            a NEW hand-rolled button fails on the commit that adds it.
//        Behavior mode gains J4b: the kit component-contract wall (a
//        synthetic .ob-btn built inside a live .ob-panel — flex centring,
//        face display:block, dy <=0.5px in the SVG / text-glyph /
//        .ob-btn--icon registers, and the same-row height law).
//        Prints a per-control report (OK + FAIL lines).
//        Feature 011 (T024): also asserts the settings GAME selector
//        (playable GameCatalog entries only, nine_ball default) + the
//        catalog browse view (provenance line + readiness badge per entry,
//        readiness entries disabled), and gates label truncation for the
//        new strings across ALL SEVEN locales.
//        Feature 012 (T052): 5-entry catalog content freeze (selector goes
//        to 5 mechanically when the US4 readiness flips land), the
//        equipment TABLE provenance browse (a provenance line for every
//        visible table entry incl. wpbsa_snooker_12ft / umb_carom_284 /
//        chinese8_pro_9ft with the 1270-vs-1260 width-repin history;
//        pool_pro_9ft_measured is UI-DEMOTED — no row/card on fresh
//        boots, kept while it is the current selection), the
//        7-locale truncation gate over the new rows, and the
//        smallest-viewport snooker-frame legibility check
//        (contracts/render-capacity.md §5).
//        Kit confirm dialog: geometry/a11y/register laws across all
//        SEVEN locales (auditConfirmDialog).
//        Issue #36 (2026-07-13): real-pointer popover-reachability gate
//        (auditSelectPopovers) — every settings-modal kit select opened by
//        MOUSE, option centers hit-tested inside the popover (the z-order
//        class of regression the value-setter contract cannot see), one
//        full commit on the TABLE select; equipment cards audited as pick
//        BUTTONS with a short browse line + closed-by-default dossier
//        disclosure (contract 015 §7 D11).
//        Issue #291 (catalog v14): the popover probe additionally gates the
//        FOLD (scrollHeight vs clientHeight — no option may sit past it,
//        half-clipped rows included), and the CUE select (the longest list
//        + longest option strings) is swept in ALL SEVEN locales with a
//        per-option nowrap text-fit check.
//        Issue #36 owner report (2026-07-13): mid-width modal card sweep
//        (auditModalMidWidths) — settings modal at 640/720/883/1024 desktop
//        viewports, gating zero modal-body h-overflow, zero card text
//        clipping (wrap-capable white-space), zero sibling-card / badge-
//        over-neighbor-title overlaps, and the stylesheet ?v= cache-bust
//        law (ui-kit.md cache-poison CSS addendum).
//        Feature 014 (T013): PHONE-VIEWPORT walker, ADDITIVE and printed
//        strictly AFTER the desktop report + summary (the desktop-viewport
//        report section stays byte-stable for the SC-002 compare — slice at
//        the '---- phone section' marker line): 844x390 / 667x375 / 926x428
//        x 7 locales over the touch surfaces (status strip, FIRE, gauge,
//        spin popup, picker*, settings sheet, decision prompts, rotate
//        prompt),
//        with the new assertion classes of contracts/touch-e2e.md §4.1 —
//        containment, occlusion, tap-target floor (>=44pt), safe-area
//        compliance under notch emulation — plus the truncation law.
//        *picker ships with T032 (US3); it is audited whenever the call
//        indicator opens a sheet and reported as a finding only when
//        nomination requires it and no picker surface exists.
//
//        Feature 024 (T015/T016/T017): the help-overlay block — a STATIC
//        mapping drift gate (both modes, pre-boot: aim.js/orbit.js/touch.js
//        grep anchors pinned by the internal verification archive
//        §6 — any vanished anchor fails the driver naming the help.* keys
//        to revisit); behavior mode gains runHelpBlock() (entry points,
//        close paths + focus restore, settings hand-off, SC-008 arrow
//        containment, `?` guard-set inertness, SC-003 desktop ordering,
//        layered Escape, reduced-motion, stale-graph degradation); audit
//        mode gains auditHelpOverlay() (open overlay + #ob-help pill x7
//        locales at 1280x800 + the 1024x640 floor, help.css ?v= law).
//
//        GH-316: the SCORE-GROWTH arm (auditScoreGrowth) — grows real
//        score/point values POST-initial-render through the __rules
//        staging seams across all five chip disciplines × en/de/zh-CN ×
//        desktop + the 852x393 coarse+notch phone profile, and asserts the
//        whole-chip law (no badge partially clipped; both players' score
//        chips painted whole; nothing under the armed call pill). The
//        pre-316 wall composed every chip register at its final copy, so
//        the crop line moving INTO a chip when a score gained a digit was
//        invisible — that is the exact defect class of the owner's
//        clipped "P2 · 45".
//
// Conventions per cdp.mjs suites: hermetic Chrome profile + obtool=1 stamp
// (launchChrome), self-served web/ on a suite-unique port, console/exception/
// Log.entryAdded error gates. Needs Chrome + node >= 22.
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { setPhoneMetrics, setSafeAreaInsets, PAGE_HELPERS_JS, tap } from './touch-cdp.mjs';
import { foldProbeJs } from './foldsnap-probe.mjs';
import { EQH_PROBE } from './e2e-ui-eqh.mjs'; // GH-1001: the equal-height card law's audit twin
import {
  KIT_LAWS, kitLawsWalkerJs, kitLawJs, a2Sample, decodePng, judgeTextGround,
  a9RestSnapshotJs, a9FocusReadJs, a10TagJs, a10ReadJs, a10UntagJs,
  a11InstallJs, a11DrainJs, judgeReveals, scanMotionDurations, MOTION_OK,
  scanFocusCompanions, FOCUS_OK, scanUnguardedHover, scanTypeHygiene,
  readLadder, KIT_LAW_OK, applyLedger, deadLedgerRows,
} from './kit-laws.mjs';

const AUDIT = process.argv.includes('--audit');
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// suite-unique defaults; env-overridable so parallel worktree lanes can run
// this suite concurrently without fighting over the ports
const PORT = Number(process.env.OB_E2E_PORT ?? 8191);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 23050);
// run-gate band sizing (GH-410 law): one static server + TWO CDP endpoints —
// the main audit page at CDP_PORT and the play-place hop browser at +1
// (034a-mig: auditGameCatalog / auditVariantClosedLabels / K run on a SECOND
// browser so the main page's in-session staging is never navigated away;
// the GH-667 fork frame — auditCaromFork — reuses the +1 hop port after the
// catalog hop has closed). CI: ci.yml job `e2e-ui-audit` on the self-hosted
// browser runner, band 19320-19429 (OB_E2E_PORT 19320 / OB_E2E_CDP_PORT
// 19410, hop 19411 — disjoint from every other per-PR band and the
// nightly's; 19420 was avoided: its +1 never answers on the runner).
export const PORT_INVENTORY = { http: 1, cdp: 2 };
const APP_URL = `http://127.0.0.1:${PORT}/app.html?seed=1`;
const fail = (msg) => { console.error('E2E-UI FAIL:', msg); process.exitCode = 1; };
const check = (name, ok, detail = '') => {
  if (ok) console.log('[e2e-ui] PASS', name);
  else fail(`${name}${detail ? ' — ' + detail : ''}`);
};

// ---- #880: colour registers compared as colours, not serialisations -------
// Chrome serialises one computed colour in whichever space it was specified
// in — rgb()/rgba(), oklab(), oklch(), color(), hex — and the two sides of a
// register check can arrive through different paths (a pseudo-element's
// computed style vs a probe node vs raw token text), so `===` on the strings
// fails on identical colours (the toggle-knob flake: bg arrived as
// oklab(0.84 -0.0247213 -0.0760845), want as oklch(0.84 0.08 252)). Both sides
// are parsed into sRGB RGBA floats in [0, 1] and compared per channel.
// TOLERANCE: 1/255 per channel — one step of 8-bit quantisation, the coarsest
// resolution either register can be represented at; a larger tolerance would
// let a visibly different colour pass, a smaller one re-breaks on the
// quantisation Chrome itself applies. An input that parses in no supported
// serialisation (or an unknown color() space) yields null and compares
// unequal — the gate fails closed, never silently green. Node-only proof:
// `node web/tools/e2e-ui.mjs --selftest-colour`; the planted-defect run is
// `--selftest-colour-plant`. Both exit before the drift gate / server /
// Chrome below (pure string math, no port, no browser).
const COLOUR_TOL = 1 / 255;
const clamp01 = (c) => Math.min(Math.max(c, 0), 1);
const srgbEncode = (c) => {
  c = clamp01(c);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};
const srgbDecode = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
// OKLab -> gamma-encoded sRGB (Ottosson matrices; same constants as
// web/tools/token-receipts.mjs oklchToSrgb).
function oklabToSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    srgbEncode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    srgbEncode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    srgbEncode(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}
const colourNum = (tok) => parseFloat(tok);
const colourAlpha = (tok) => (tok == null || tok === '' ? 1
  : tok.endsWith('%') ? colourNum(tok) / 100 : colourNum(tok));
const colourLightness = (tok) => (tok.endsWith('%')
  ? colourNum(tok) / 100 : colourNum(tok));
// oklab a/b and oklch C: unitless, or % where 100% == 0.4 (CSS Color 4).
const colourAxis = (tok) => (tok.endsWith('%')
  ? (colourNum(tok) / 100) * 0.4 : colourNum(tok));
function colourHue(tok) {
  if (tok.endsWith('turn')) return colourNum(tok) * 360;
  if (tok.endsWith('rad')) return (colourNum(tok) * 180) / Math.PI;
  if (tok.endsWith('grad')) return colourNum(tok) * 0.9;
  return colourNum(tok); // degrees (bare number or deg suffix)
}
const colourRgbChannel = (tok) => (tok.endsWith('%')
  ? colourNum(tok) / 100 : colourNum(tok) / 255);
// Split a functional body into channel tokens + alpha token, tolerating the
// comma form (legacy rgb()/rgba()) and the space/slash form alike.
function colourParts(body) {
  const slash = body.split('/');
  const alpha = slash.length > 1 ? slash[1].trim().split(/\s+/)[0] : null;
  const chans = slash[0].split(/[,\s]+/).filter(Boolean);
  return { chans, alpha };
}
// Parse one CSS colour serialisation to [r, g, b, a] sRGB floats in [0, 1],
// or null when the input is none of the supported serialisations.
function parseColour(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  if (s === 'transparent') return [0, 0, 0, 0];
  const hexM = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hexM) {
    let h = hexM[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
  }
  const fnM = /^(rgba?|oklab|oklch|color)\((.*)\)$/.exec(s);
  if (!fnM) return null;
  const [, fn, rawBody] = fnM;
  const { chans, alpha: slashAlpha } = colourParts(rawBody.trim());
  let alpha = slashAlpha;
  if (fn === 'rgb' || fn === 'rgba') {
    const c = [...chans];
    if (alpha == null && c.length === 4) alpha = c.pop();
    if (c.length !== 3) return null;
    const v = c.map(colourRgbChannel);
    const a = colourAlpha(alpha);
    if (v.some((x) => !Number.isFinite(x)) || !Number.isFinite(a)) return null;
    return [...v.map(clamp01), a];
  }
  if (fn === 'oklab' || fn === 'oklch') {
    if (chans.length !== 3) return null;
    const L = colourLightness(chans[0]);
    const a = colourAlpha(alpha);
    if (!Number.isFinite(L) || !Number.isFinite(a)) return null;
    if (fn === 'oklab') {
      const aa = colourAxis(chans[1]), bb = colourAxis(chans[2]);
      if (!Number.isFinite(aa) || !Number.isFinite(bb)) return null;
      return [...oklabToSrgb(L, aa, bb), a];
    }
    const C = colourAxis(chans[1]), H = colourHue(chans[2]);
    if (!Number.isFinite(C) || !Number.isFinite(H)) return null;
    const rad = (H * Math.PI) / 180;
    return [...oklabToSrgb(L, C * Math.cos(rad), C * Math.sin(rad)), a];
  }
  // color(<space> c1 c2 c3 [/ a])
  const space = chans.shift();
  if (chans.length !== 3) return null;
  const v = chans.map((t) => (t.endsWith('%') ? colourNum(t) / 100 : colourNum(t)));
  const a = colourAlpha(alpha);
  if (v.some((x) => !Number.isFinite(x)) || !Number.isFinite(a)) return null;
  if (space === 'srgb') return [...v.map(clamp01), a];
  if (space === 'srgb-linear') return [...v.map(srgbEncode), a];
  if (space === 'display-p3') {
    const lin = v.map(srgbDecode);
    // linear display-p3 -> XYZ (D65) -> linear sRGB (CSS Color 4 matrices)
    const x = 0.4865709486482162 * lin[0] + 0.26566769316909306 * lin[1]
      + 0.1982172852343625 * lin[2];
    const y = 0.2289745640697488 * lin[0] + 0.6917385218365064 * lin[1]
      + 0.079286914093745 * lin[2];
    const z = 0.04511338185890264 * lin[1] + 1.043944368900976 * lin[2];
    return [srgbEncode(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
      srgbEncode(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
      srgbEncode(0.0556434 * x - 0.2040259 * y + 1.0572252 * z), a];
  }
  return null; // unknown color() space: fail closed
}
// True iff both serialisations denote the same colour within 1/255 per
// channel (alpha included), judged in the sRGB gamut: conversion clamps
// out-of-gamut channels into [0, 1], so two distinct colours that both lie
// outside sRGB and clamp to the same sRGB point compare equal. The
// registers gated in this file are in-gamut sRGB tokens, where the
// comparison decides at the stated tolerance. Unparseable on either side
// is unequal.
function coloursEqual(a, b) {
  const x = parseColour(a), y = parseColour(b);
  if (!x || !y) return false;
  return x.every((v, i) => Math.abs(v - y[i]) <= COLOUR_TOL);
}
// The ON-knob predicate, shared by setTgChecks (both toggle surfaces: HUD
// slowmo, settings sound) and the --selftest-colour gate row below — ONE
// function, so the node selftest exercises the exact predicate the
// browser rows gate on (#880).
function knobIsAccentHi(t) {
  return t.on.transform === 'matrix(1, 0, 0, 1, 14, 0)'
    && coloursEqual(t.on.bg, t.accentHi);
}
// The registers lab's hover / press rungs (B-K15, and B-K09's hovered current
// pill), read once the element's own transitions have finished (hoverAt) and
// compared as colours: a fill that came through the --ob-t-fast tween
// serialises in oklab while the token probe reads oklch, and a read inside
// the tween is a hair short of the rung (the open-source ceremony's e2e-ui
// runs: alpha 0.3598 vs 0.36). 1/255 per channel stays far under one rung's
// step (accent-dim → dim-3 is 0.20 alpha; bg-0 → bg-2 is 10 % lightness).
// ONE function per row, shared by the browser checks and --selftest-colour.
const bk15WashHover = (h, tok) => h.hover === true && coloursEqual(h.bg, tok.wash) && !coloursEqual(h.bg, tok.bg2);
const bk09CurrentHover = (h, tok) => h.hover === true && coloursEqual(h.bg, tok.dim3);
const bk15PrimaryHover = (h, rest, tok) => h.hover === true && coloursEqual(h.bg, tok.dim3) && !coloursEqual(h.bg, rest);
const bk15PrimaryActive = (a, tok) => a.active === true && coloursEqual(a.bg, tok.dim3) && /inset/.test(a.bs);
const bk15SelectHover = (h, tok) => h.hover === true && coloursEqual(h.bg, tok.bg2);
// Fixtures: the tokens as the probe reads them (oklch), the rung reads in
// oklab (the tween's space; the ceremony's verbatim bg-2 string, dim-3 at
// alpha 0.3598), and one wrong-rung mutant per row (the rest fill, or the
// neighbouring rung) that must decide false.
const BK15_TOK = { dim3: 'oklch(0.74 0.11 252 / 0.36)', wash: 'oklch(0.97 0.01 91 / 0.08)', bg2: 'oklch(0.235 0.011 165)' };
const BK15_REST_PRIM = 'oklch(0.74 0.11 252 / 0.16)'; // --ob-accent-dim, the primary's rest
const BK15_CASES = [
  ['wash hover: the wash read in oklab', () => bk15WashHover({ hover: true, bg: 'oklab(0.97 -0.000174524 0.00999848 / 0.08)' }, BK15_TOK), true],
  ['wash hover mutant: the opaque bg-2 slab', () => bk15WashHover({ hover: true, bg: 'oklab(0.235 -0.0106252 0.00284701)' }, BK15_TOK), false],
  ['current-pill hover: dim-3 read in oklab at alpha 0.3598', () => bk09CurrentHover({ hover: true, bg: 'oklab(0.74 -0.0339919 -0.104616 / 0.3598)' }, BK15_TOK), true],
  ['current-pill hover mutant: the wash (hover outranked selection)', () => bk09CurrentHover({ hover: true, bg: 'oklab(0.97 -0.000174524 0.00999848 / 0.08)' }, BK15_TOK), false],
  ['primary hover: dim-3 read in oklab at alpha 0.3598', () => bk15PrimaryHover({ hover: true, bg: 'oklab(0.74 -0.0339919 -0.104616 / 0.3598)' }, BK15_REST_PRIM, BK15_TOK), true],
  ['primary hover mutant: the rest fill (accent-dim)', () => bk15PrimaryHover({ hover: true, bg: BK15_REST_PRIM }, BK15_REST_PRIM, BK15_TOK), false],
  ['primary active: dim-3 in oklab + an inset press shadow', () => bk15PrimaryActive({ active: true, bg: 'oklab(0.74 -0.0339919 -0.104616 / 0.36)', bs: 'rgba(0, 0, 0, 0.35) 0px 1px 2px 0px inset' }, BK15_TOK), true],
  ['primary active mutant: the dim-2 rung', () => bk15PrimaryActive({ active: true, bg: 'oklch(0.74 0.11 252 / 0.26)', bs: 'rgba(0, 0, 0, 0.35) 0px 1px 2px 0px inset' }, BK15_TOK), false],
  ['select hover: the ceremony\'s bg-2 read in oklab', () => bk15SelectHover({ hover: true, bg: 'oklab(0.235 -0.0106252 0.00284701)' }, BK15_TOK), true],
  ['select hover mutant: the rest fill (bg-0)', () => bk15SelectHover({ hover: true, bg: 'oklch(0.135 0.009 165)' }, BK15_TOK), false],
];
// Fixtures: the issue's verbatim Chrome strings for --ob-accent-hi
// (tokens.css oklch(84% 0.08 252), documented sRGB register #a5cffe), the
// same colour in every supported serialisation, the 1/255 tolerance edge,
// and plants that must stay unequal.
const ISSUE_BG = 'oklab(0.84 -0.0247213 -0.0760845)';
const ISSUE_WANT = 'oklch(0.84 0.08 252)';
const PLANT_WANT = 'rgb(167, 207, 254)'; // red channel 2/255 off #a5cffe
const COLOUR_CASES = [
  ['positive: issue pair, oklab bg vs oklch want', ISSUE_BG, ISSUE_WANT, true],
  ['positive: token percent form vs issue bg', 'oklch(84% 0.08 252)', ISSUE_BG, true],
  ['positive: hex register vs issue bg', '#a5cffe', ISSUE_BG, true],
  ['positive: hex register vs issue want', '#a5cffe', ISSUE_WANT, true],
  ['positive: rgb() comma form vs issue want', 'rgb(165, 207, 254)', ISSUE_WANT, true],
  ['positive: rgb() space/slash form vs issue bg', 'rgb(165 207 254 / 1)', ISSUE_BG, true],
  ['positive: color(srgb) vs issue bg', 'color(srgb 0.6470588235294118 0.8117647058823529 0.996078431372549)', ISSUE_BG, true],
  ['positive: color(srgb-linear) vs hex register', 'color(srgb-linear 0.376262122990907 0.623960391675076 0.991102097113830)', '#a5cffe', true],
  ['positive: color(display-p3) vs issue bg', 'color(display-p3 0.680149225397097 0.806987260329274 0.979509617982215)', ISSUE_BG, true],
  ['positive: alpha pair, rgba() vs oklch /a', 'rgba(165, 207, 254, 0.5)', 'oklch(0.84 0.08 252 / 0.5)', true],
  ['edge: exactly 1/255 off still equal', 'rgb(166, 207, 254)', '#a5cffe', true],
  ['plant: 2/255 off in red is unequal', PLANT_WANT, ISSUE_BG, false],
  ['plant: 2/255 off in hex is unequal', '#a7cffe', '#a5cffe', false],
  ['plant: different hue is unequal', 'oklch(0.84 0.08 20)', ISSUE_BG, false],
  ['plant: alpha mismatch is unequal', 'rgba(165, 207, 254, 0.5)', ISSUE_WANT, false],
  ['plant: unparseable side is unequal (fail closed)', 'not-a-colour', '#a5cffe', false],
  ['plant: unknown color() space is unequal (fail closed)', 'color(rec2020 0.5 0.5 0.5)', '#a5cffe', false],
];
const GATE_ROW = 'geometry: settings sound toggle ON knob = '
  + 'translateX(14px) + accent-hi';
const ISSUE_T = {
  on: { transform: 'matrix(1, 0, 0, 1, 14, 0)', bg: ISSUE_BG },
  accentHi: ISSUE_WANT,
};
const PLANT_T = {
  on: { transform: 'matrix(1, 0, 0, 1, 14, 0)', bg: ISSUE_BG },
  accentHi: PLANT_WANT,
};
// Selftest rows carry their own [selftest-colour] prefix — never the
// browser reporter's [e2e-ui] PASS / E2E-UI FAIL text — so a log ledger
// can tell selftest rows apart from browser rows.
const selfRow = (ok, label, detail = '') => {
  console.log(`[selftest-colour] ${ok ? 'PASS' : 'FAIL'} ${label}`
    + `${detail ? ' — ' + detail : ''}`);
  return ok;
};
if (process.argv.includes('--selftest-colour-plant')) {
  console.log('[selftest-colour] plant: the want register is shifted by '
    + `2/255 in the red channel (${PLANT_WANT}); the gate row must go RED`);
  const ok = selfRow(knobIsAccentHi(PLANT_T),
    `gate-row (knobIsAccentHi): ${GATE_ROW}`,
    `matrix(1, 0, 0, 1, 14, 0) bg=${ISSUE_BG} want=${PLANT_WANT}`);
  process.exit(ok ? 0 : 1);
}
if (process.argv.includes('--selftest-colour')) {
  let bad = 0;
  for (const [name, a, b, want] of COLOUR_CASES) {
    const got = coloursEqual(a, b);
    if (!selfRow(got === want,
      `${name}: coloursEqual(${a} | ${b}) = ${got} (want ${want})`)) bad += 1;
  }
  if (!selfRow(knobIsAccentHi(ISSUE_T), `gate-row (knobIsAccentHi): ${GATE_ROW}`,
    `matrix(1, 0, 0, 1, 14, 0) bg=${ISSUE_BG} want=${ISSUE_WANT}`)) bad += 1;
  for (const [name, run, want] of BK15_CASES) {
    const got = run();
    if (!selfRow(got === want, `registers rung ${name}: ${got} (want ${want})`)) bad += 1;
  }
  const total = COLOUR_CASES.length + 1 + BK15_CASES.length;
  console.log(`[selftest-colour] ${bad === 0 ? 'PASS' : 'FAIL'}: `
    + `${total - bad}/${total} rows decided as expected `
    + `(tolerance ${COLOUR_TOL} per channel)`);
  process.exit(bad === 0 ? 0 : 1);
}

// ---- 024 mapping drift gate (T016 — the SC-002 tripwire) --------------------
// STATIC pre-flight (fs reads, no browser session, runs in BOTH modes): the
// help overlay documents the audited input mappings, and this gate pins the
// mapping code truth to the grep anchors extracted by the T003 ledger,
// the internal verification archive §6. If any anchor disappears or
// changes in web/app/aim.js / web/app/orbit.js / web/app/touch.js (plus the
// §6-sanctioned touchwidgets.js supplementary anchor for the power gauge),
// the mapping a help string states has drifted from the code: the driver
// FAILS, naming the anchor, the ledger, and the help.* keys that MUST be
// revisited in the same change. Each entry: [file, exact anchor string,
// affected keys].
const DRIFT_ANCHORS = [
  ['app/aim.js', "'select,input,textarea,[role=combobox],[role=listbox]'",
    'help.controls.keyboard.* window-keydown guard set (K0) + the 024 `?` '
    + 'shortcut guard parity (help-overlay.md §3)'],
  ['app/aim.js', 'e.shiftKey ? 0.5 : 0.05',
    'help.controls.keyboard.aim.{k,v} (K1 arrow-azimuth steps)'],
  ['app/aim.js', 'e.shiftKey ? 0.5 : 0.1',
    'help.controls.keyboard.power.{k,v} (K2 arrow-power steps)'],
  ['app/aim.js', 'e.deltaY * 0.004',
    'help.controls.mouse.wheelPower.{k,v}, help.controls.trackpad.'
    + 'scrollPower.{k,v}, help.flow.power.d, hud.help (M5 wheel-power gain)'],
  ['app/aim.js', 'e.shiftKey ? 0.1 : 1',
    'help.controls.mouse.fine.{k,v}, help.controls.trackpad.fine.{k,v}, '
    + 'aimView 0.1 factor (M2/M7)'],
  ['app/aim.js', "e.key === 'v' || e.key === 'V'",
    'help.controls.keyboard.view.{k,v}, mouse/trackpad aimView.k (K3/M7)'],
  ['app/aim.js', 'AIM_DEAD_ZONE = 2.5 * R',
    'help.controls.mouse.aim.v / trackpad.aim (M1 dead zone)'],
  ['app/aim.js', 'if (!aiming() || e.shiftKey) return;',
    'help.controls.mouse.wheelZoom.{k,v}, trackpad.scrollZoom.{k,v}, '
    + 'hud.help (M5/M6 wheel duality)'],
  ['app/orbit.js', 'e.button === 2 || (e.button === 0 && e.shiftKey)',
    'help.controls.mouse.orbit.{k,v}, trackpad.orbit.{k,v}, hud.help '
    + '(M4 orbit trigger)'],
  ['app/orbit.js', 'Math.exp(e.deltaY * 0.001)',
    'help.controls.mouse.wheelZoom.{k,v}, trackpad.scrollZoom.{k,v} (M6)'],
  ['app/orbit.js', 'e.button === 1',
    'help.controls.mouse.pan.{k,v}, hud.help (M9 middle-drag pan, '
    + 'issue #56)'],
  ['app/touch.js', 'NUDGE_STEP_DEG = 0.05',
    'help.controls.touch.fine.{k,v} (T9 ratchet step)'],
  ['app/touch.js', 'holds no fire path',
    'help.controls.touch.fire.{k,v}, help.flow.shoot.d (T6 FIRE-pill-only '
    + 'law)'],
  ['app/touch.js', 'FINE_MIN = 0.1',
    'help.controls.touch.aim.{k,v} (T1 velocity-adaptive fine floor)'],
  ['app/touch.js', 'GHOST_OFFSET_PX = 56',
    'help.controls.touch.place.{k,v} (T2 ghost-ring placement)'],
  ['app/touch.js', 'ORBIT_GAIN = 0.005',
    'help.controls.touch.orbit.{k,v} (T3)'],
  ['app/touch.js', 'window.__aim?.getAimView?.() === true',
    'help.controls.touch.zoom.{k,v} (T4 aim-view gesture-breakout law, '
    + 'issue #56 — a two-finger move disengages in place, then orbit/pinch)'],
  ['app/touch.js', 'orbit.pan(',
    'help.controls.touch.pan.{k,v} (T13 three-finger pan, issue #56)'],
  ['app/touch.js', 'POCKET_TAP_MIN_PT = 22',
    'help.controls.touch.call.{k,v} (T5 tap zones)'],
  ['app/touchwidgets.js', "'ob-power-gauge'",
    'help.controls.touch.power.{k,v}, help.flow.power.d (T7 left-edge '
    + 'gauge — §6 supplementary anchor)'],
  ['app/touchwidgets.js', 'OFF_AXIS_HI = 320',
    'help.controls.touch.power.v (T7 off-axis power gearing, issue #70 — '
    + '§6 supplementary anchor)'],
];
{
  let driftFails = 0;
  const srcCache = new Map();
  for (const [rel, anchor, keys] of DRIFT_ANCHORS) {
    if (!srcCache.has(rel)) {
      try { srcCache.set(rel, fs.readFileSync(path.join(webDir, rel), 'utf8')); }
      catch { srcCache.set(rel, null); }
    }
    const src = srcCache.get(rel);
    if (src === null) {
      driftFails++;
      fail(`024 drift gate: ${rel} unreadable — the mapping ground truth is `
        + 'gone; re-audit the internal verification archive');
      continue;
    }
    if (!src.includes(anchor)) {
      driftFails++;
      fail(`024 drift gate: anchor ${JSON.stringify(anchor)} vanished from `
        + `${rel} — the audited mapping changed. Revisit `
        + 'the internal verification archive and the i18n keys: '
        + keys);
    }
  }
  if (driftFails) {
    console.error('[e2e-ui] 024 drift gate FAILED — help content is pinned '
      + 'to code truth (SC-002): fix the help.* keys in the SAME change, '
      + 'then re-pin the anchors in mappings.md §6');
    process.exit(1);
  }
  console.log(`[e2e-ui] 024 drift gate: ${DRIFT_ANCHORS.length} mapping `
    + 'anchors pinned (mappings.md §6)');
}

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [];
// GH-668 review r2 P2-3: the stale-kit lab's second pass serves kit.css 404 on
// purpose — Chrome logs that one network error; excluded ONLY while armed
let expectKit404 = false;
const chrome = await launchChrome(APP_URL, { port: CDP_PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
    // 024 exception (integration ledger §3, lane B report §6): the help
    // overlay's R5 guide-reachability probe misses by DESIGN on a
    // web/-rooted serve (one HEAD 404 per frozen candidate, once per
    // session, silent at the app level) — Chrome still logs the 404 at
    // the NETWORK layer. Exclude exactly those two candidate URLs; every
    // other network error still fails the run.
    const guideProbe = params.entry.source === 'network'
      && /\/(?:site\/)?guide\/[^/]+\/index\.html$/.test(params.entry.url ?? '');
    const kit404 = expectKit404 && params.entry.source === 'network'
      && /\/app\/ui\/kit\.css(\?|$)/.test(params.entry.url ?? '');
    if (!guideProbe && !kit404) consoleErrors.push(params.entry.text);
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

/** Real keyboard input via CDP (puppeteer-style: rawKeyDown for non-text
 * keys so native default actions — range step, radio walk, checkbox
 * toggle — actually fire on the focused element). */
async function pressKey(key, code, vk, text) {
  const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
  await chrome.send('Input.dispatchKeyEvent',
    text ? { type: 'keyDown', text, ...base } : { type: 'rawKeyDown', ...base });
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  // storm brake (024 integration ledger §4): a loaded macOS Chrome can
  // re-deliver a dispatched key as trusted keydown/keypress repeats
  // indefinitely (reproduced on a bare page, zero app code), saturating
  // the renderer until Runtime.evaluate starves. The ignore-toggle
  // flushes the re-delivery queue; on a healthy input pipeline the real
  // press above is already delivered and the toggle is a no-op.
  await sleep(50);
  await chrome.send('Input.setIgnoreInputEvents', { ignore: true });
  await chrome.send('Input.setIgnoreInputEvents', { ignore: false });
}

/** Real mouse click at viewport CSS coordinates (Input domain) — the
 * popover-reachability gate must drive ACTUAL pointer events: the value-
 * setter contract (select.js) bypasses hit-testing, which is exactly how
 * the z-order regression of issue #36 shipped green. */
async function mouseClick(x, y) {
  await chrome.send('Input.dispatchMouseEvent',
    { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await chrome.send('Input.dispatchMouseEvent',
    { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

// ---- audit mode -------------------------------------------------------------
// Page-side walker: report EVERY visible form control with its kit status.
// Visibility = has layout boxes and not visibility:hidden (kit hides upgraded
// natives via [hidden]/display:none or 1x1 opacity-0 INSIDE their wrapper, so
// wrapped natives stay auditable and pass by wrapper membership, not paint).
const AUDIT_WALKER = `(() => {
  for (const d of document.querySelectorAll('details')) d.open = true; // advanced axes
  const visible = (el) => el.getClientRects().length > 0
    && getComputedStyle(el).visibility !== 'hidden'
    // a focus-revealed control (GH-668 review r4 P2: the coarse Remember row,
    // data-ob-focus-reveal) is the sr-only box at rest — off the paint by
    // design until keyboard focus reveals it, never a 1 px control
    && !(el.hasAttribute('data-ob-focus-reveal') && getComputedStyle(el).opacity === '0');
  const describe = (el) => {
    const tag = el.tagName.toLowerCase()
      + (el.type && el.type !== 'select-one' ? '[type=' + el.type + ']' : '');
    if (el.id) return tag + '#' + el.id;
    const anc = el.closest('[id]');
    return tag + (el.value ? '[value=' + el.value + ']' : '')
      + (anc ? ' in #' + anc.id : ' (no id ancestor)');
  };
  const out = [];
  for (const el of document.querySelectorAll('select:not([hidden])')) {
    if (!visible(el)) continue;
    const upgraded = [...(el.parentElement?.children ?? [])]
      .some((c) => c !== el && c.dataset && c.dataset.ob === 'select-button');
    out.push({ what: describe(el), ok: upgraded,
      rule: 'visible native <select> without a [data-ob=select-button] combobox sibling' });
  }
  for (const el of document.querySelectorAll('input[type=checkbox]')) {
    if (!visible(el)) continue;
    out.push({ what: describe(el), ok: !!el.closest('.ob-toggle'),
      rule: 'checkbox not wrapped in an .ob-toggle' });
  }
  for (const el of document.querySelectorAll('input[type=range]')) {
    if (!visible(el)) continue;
    // #ob-spin-elev is a DOCUMENTED native register, not a miss: the phone
    // spin card keeps the UA track (accent-color + a >=44pt min-height at
    // touch.css (1,1,0)) so the coarse thumb stays the platform's own. It
    // surfaced the moment the 2026-07 button audit started walking the spin
    // popup's open cycle; converting it is a RANGE-control question (kit
    // .ob-range is a 20px track with a custom thumb) that this button wave
    // defers with the rest of the range work - recorded, not muted.
    const nativeOk = el.id === 'ob-spin-elev';
    out.push({ what: describe(el) + (nativeOk
      ? ' (documented native touch register: UA track + 44pt floor)' : ''),
    ok: el.classList.contains('ob-range') || nativeOk,
    rule: 'range input without .ob-range' });
  }
  for (const el of document.querySelectorAll('input[type=radio]')) {
    if (!visible(el)) continue;
    out.push({ what: describe(el), ok: !!el.closest('.ob-segmented'),
      rule: 'radio not inside an .ob-segmented group' });
  }
  // RANGE-VS-LABEL CENTRING (GH-245, deferred item A2). A native range is an
  // INLINE-LEVEL box: inside its .ob-set-ctl wrapper the line box adds font
  // descent + half-leading BELOW the control, the wrapper inflates downward,
  // and the row's align-items:center centres the WRAPPER, not the track -
  // the volume/brightness sliders sat 3.00 CSS px above their labels (the
  // exact holder-inflation mechanism the icon de-baseline law fixes; the
  // range flavor is settings-modal.css display: block — NO backticks in
  // this walker, it is an untagged template literal). Scoped to the
  // settings ledger rows (.ob-set-row) - the one shipped label+range grid.
  for (const el of document.querySelectorAll('.ob-set-row input[type=range]')) {
    if (!visible(el)) continue;
    const rowEl = el.closest('.ob-set-row');
    const lab = rowEl && rowEl.querySelector(':scope > label');
    if (!lab || !visible(lab)) continue;
    const rr = el.getBoundingClientRect();
    const lr = lab.getBoundingClientRect();
    const dy = (rr.top + rr.height / 2) - (lr.top + lr.height / 2);
    out.push({ what: describe(el) + ' range-vs-label (dy=' + dy.toFixed(2) + ')',
      ok: Math.abs(dy) <= 1.5,
      rule: 'range control centre off its row label centre by >1.5px - the '
        + 'inline-level range de-baseline law (settings-modal.css '
        + '.ob-set-ctl input[type=range] display: block; GH-245 item A2)' });
  }
  // ICON/LABEL OPTICAL CENTRING (owner build-11 finding, 2026-07 button
  // audit; the design charter "Button / pill" + ui-kit.md Amendment A1). In a
  // ROW-composed control EVERY visible face's box centre must sit on the
  // button's CONTENT-box centre within +/-0.5px (the J4 tolerance), and a
  // single-line label must register with the face it sits beside.
  // Stacked (icon-over-label) tiles are excluded by a GEOMETRIC AXIS TEST -
  // face entirely above the text - never by an id list, so a new tile cannot
  // join the exemption silently AND a block/grid-stacked tile is exempt for
  // the same reason a flex-column one is (flexDirection alone would red it).
  // THREE row kinds per face: the symptom (dy), the CAUSE (a face left at an
  // INLINE-LEVEL display, incl. inline-block/inline-flex - all baseline-hung
  // replaced boxes with the same holder-inflation mechanism), and the
  // face-vs-label registration (the offset the owner actually SEES).
  const textBox = (el) => {
    // union of the control's OWN text LINE boxes (Range) + the PAINTED ink
    // band of the first line (TextMetrics actualBoundingBox*, the math J4/J4b
    // use). The line box is what the layout centres; the ink is what the eye
    // reads, and for a CJK or fallback font the two differ - the registration
    // row below is judged on the ink.
    const rng = document.createRange();
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let box = null, lines = 0, first = null, holder = null;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const par = n.parentElement;
      if (par && getComputedStyle(par).visibility === 'hidden') continue;
      rng.selectNodeContents(n);
      for (const q of rng.getClientRects()) {
        if (!q.width || !q.height) continue;
        if (!box) {
          box = { top: q.top, bottom: q.bottom };
          lines = 1;
          first = { top: q.top, bottom: q.bottom, height: q.height,
            text: n.nodeValue.trim() };
          holder = par;
          continue;
        }
        if (q.top > box.bottom - 1) lines++;      // a new line box
        box.top = Math.min(box.top, q.top);
        box.bottom = Math.max(box.bottom, q.bottom);
      }
    }
    if (!box) return null;
    let inkMid = (box.top + box.bottom) / 2;
    try {
      const cs1 = getComputedStyle(holder ?? el);
      const cx = document.createElement('canvas').getContext('2d');
      cx.font = cs1.fontWeight + ' ' + cs1.fontSize + '/' + cs1.lineHeight
        + ' ' + cs1.fontFamily;
      // measure what is PAINTED: text-transform (the .ob-help__disclose rows
      // are uppercase) changes which ascenders/descenders exist, and with them
      // the ink midpoint
      const tt = cs1.textTransform;
      const lang = document.documentElement.lang || undefined;
      const shown = tt === 'uppercase' ? first.text.toLocaleUpperCase(lang)
        : tt === 'lowercase' ? first.text.toLocaleLowerCase(lang)
          : tt === 'capitalize'
            ? first.text.replace(/(^|\\s)(\\S)/g,
              (mm, sp, ch) => sp + ch.toLocaleUpperCase(lang))
            : first.text;
      const m = cx.measureText(shown);
      const baseline = first.top
        + (first.height - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2
        + m.fontBoundingBoxAscent;
      const a = baseline - m.actualBoundingBoxAscent;
      const b = baseline + m.actualBoundingBoxDescent;
      if (Number.isFinite(a) && Number.isFinite(b) && b > a) inkMid = (a + b) / 2;
    } catch { /* no canvas 2d in this context: fall back to the line box */ }
    return { ...box, lines, inkMid };
  };
  for (const el of document.querySelectorAll('button, [role="button"], summary')) {
    if (!visible(el)) continue;
    const marked = [...el.querySelectorAll('svg[data-icon]')];
    const all = marked.length ? marked : [...el.querySelectorAll('svg')];
    // a face is only a face when it PAINTS: display:none drops its boxes,
    // visibility:hidden keeps them. Both leave an icon-only control blank.
    const faces = all.filter((s) => s.getClientRects().length
      && getComputedStyle(s).visibility !== 'hidden');
    if (!faces.length) {
      // an icon-bearing control whose faces all went invisible AND that has no
      // visible text is a BLANK control - the audit used to skip it silently
      // (the filter above dropped the row along with the measurement)
      if (all.length && !(el.textContent || '').trim()) {
        out.push({ what: describe(el) + ' face-visible',
          ok: false,
          rule: 'every <svg> face in this control has no layout box '
            + '(display:none) or is visibility:hidden, and the control has no '
            + 'visible label - it renders BLANK' });
      }
      continue;
    }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const top = r.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
    const bot = r.bottom - parseFloat(cs.borderBottomWidth)
      - parseFloat(cs.paddingBottom);
    const tb = textBox(el);
    let i = 0;
    for (const svg of faces) {
      const sr = svg.getBoundingClientRect();
      i++;
      // discriminator: describe() collapses same-tag siblings (the six
      // .ob-help__disclose rows) and every consumer dedups on 'what', so
      // without the face name + index + label prefix a FAILING sibling (or a
      // FAILING second face) would be swallowed by a PASSING one
      const tag = describe(el) + ' <' + (svg.dataset.icon || 'svg')
        + (faces.length > 1 ? '#' + i : '') + '/'
        + (el.textContent || '').trim().slice(0, 12) + '>';
      // the DE-BASELINE law is UNCONDITIONAL - it holds for stacked tiles too
      // (their holder inflates downward just the same), so this row is emitted
      // BEFORE the axis test below, never skipped with the centring rows
      out.push({ what: tag + ' face-display',
        ok: !/^inline/.test(getComputedStyle(svg).display),
        rule: 'ui/icons.js face left at an INLINE-LEVEL display (inline / '
          + 'inline-block / inline-flex) - baseline-hung, so its holder '
          + 'centres the BOX not the ink (kit de-baseline law: '
          + 'svg[data-icon] { display: block })' });
      // AXIS TEST (geometric, display-agnostic): a face that sits ENTIRELY
      // above the label is a stacked tile, not a row - CENTRING does not
      // apply on the cross axis. flex-column with no text is kept in scope
      // (an icon-only column control still owes a centred face).
      if (tb && sr.bottom <= tb.top + 1) continue;
      const dy = (sr.top + sr.height / 2) - (top + bot) / 2;
      out.push({ what: tag + ' face-centre (dy=' + dy.toFixed(2) + ')',
        ok: Math.abs(dy) <= 0.5,
        rule: 'icon face centre off the content-box centre by >0.5px '
          + '(icon/label centring law, kit .ob-btn anatomy)' });
      // registration: face vs a SINGLE-LINE label beside it. Multi-line
      // labels (ledger rows: .ob-game-row, .rq-row, .ob-drills__card) have
      // no single optical centre to register against and are out of scope -
      // by the same geometric test, not an id list. 1.5px: a 14px glyph
      // against a 12-13px cap band is optically level well inside 1px, and
      // the device grid can move either box half a pixel at DPR 1.
      if (tb && tb.lines === 1) {
        const dl = (sr.top + sr.height / 2) - tb.inkMid;
        out.push({ what: tag + ' face-vs-label (dy=' + dl.toFixed(2) + ')',
          ok: Math.abs(dl) <= 1.5,
          rule: 'the face and its single-line label do not share an optical '
            + 'centre (the offset the owner sees, icon/label centring law)' });
      }
    }
  }
  return out;
})()`;

// HAND-ROLLED BUTTON RATCHET (2026-07 button audit, finding 21: NINE
// independent restatements of the icon-only pill shape, and 13 surfaces
// hand-writing the kit's own flex centring).
//
// ROLLED-OWN = the control paints an AUTHORED pill/card (a border-radius the
// UA never gives a button — measured UA reference: radius 0px, background
// rgb(239,239,239) — plus its own background, border, shadow, or an explicit
// appearance:none reset) while carrying NO class that kit.css itself defines.
// The kit-part test is read from the LIVE CSSOM (every `.ob-*` class kit.css
// declares), so it cannot drift from the kit, and an unclassed button inside
// an .ob-panel is a kit button by the kit's OWN descendant arm
// (`:where(.ob-panel) button`), not by exemption.
//
// FIRST-CUT PREDICATE MEASUREMENT (why this shape, not the narrower one this
// gate shipped with): `appearance === 'none' && own opaque background` walked
// 1 control per surface — #ob-gear/#ob-help/#ob-drills/#ob-playback compute
// `appearance: auto` while re-skinning completely, and the blanket .ob-panel
// exemption hid every settings/help/drills/card control, i.e. exactly where
// new buttons get added. Measured on this branch: 1 walked row per surface
// then vs 5..33 now, with ZERO unlisted rows against the ledger below.
//
// The ledger is FROZEN and can only SHRINK: each conversion phase deletes
// lines, a NEW rolled-own button fails on the commit that adds it, and a line
// that no longer matches anything fails the LEDGER LIVENESS row at the end of
// the audit (so the list cannot rot into documentation). Every entry carries
// its reason, so the list is a work ledger, not a mute.
const ROLLED_OWN_OK = [
  // documented doctrine - the id-styled toolbar family (kit.css ladder note
  // + the app.html single-source container law); J3/J4 gate them by id.
  // GH-668 B-K16 (S5 kit step 5): #ob-gear / #ob-help / #ob-drills /
  // #ob-playback / #ob-shell-open / #ob-share now CARRY the kit toolbar part
  // (.ob-btn.ob-btn--icon.ob-btn--glass.ob-toolbar-pill) — their ledger
  // lines are deleted (the ledger only shrinks); #ob-export-btn stays until
  // its module migrates (export.js is the documented degrade copy).
  ['#ob-export-btn', 'documented: toolbar family'],
  ['#ob-spin-btn', 'documented: touch.css (1,1,1) 60x60 canvas face, >=56px gate'],
  // ['#ob-rec-', 'documented: touch record cluster register'] — DELETED by
  // GH-225 Phase D, which retires the record dock this line documented
  // (#ob-rec-start/pause/resume/stop/time). The button wave that FROZE this
  // ledger had already predicted the deletion (see the DELETED note below),
  // and the LEDGER LIVENESS row at the end of the phone audit would fail on
  // it: a line matching no walked control is a mute, not a ratchet.
  ['#hud-call', 'documented: touch call-shot opener pill (hud.js #hud-call.on '
    + '+ the touch.css opener rule); its picker is #ob-picker-*'],
  ['.ob-help__disclose', 'documented: help.css disclosure row register'],
  // ['#ob-about-', 'documented: About row register'] — DELETED by GH-668 S5
  // slice 2 (B-SH07): the About help / bug-report rows are kit ghost pills
  // (`ob-btn ob-btn--ghost`), no longer a rolled-own register; the LEDGER
  // LIVENESS row flagged the line as DEAD on the first G5 audit.
  // ['.ob-game-row', …] and ['.ob-eq-prov-row__pick', …] — DELETED by feature
  // 034 (525 S4a-mig): the settings game pane that hosted the catalog rows
  // and the variant/provenance card picks migrated to the shell's play
  // place; the LEDGER LIVENESS row flagged both as DEAD (a line matching no
  // walked control is a mute, not a ratchet). The play card's own
  // `.ob-eq-prov-row__pick` rows live under the shell, walked by the play
  // blocks / the cardrail register line below.
  ['.ob-cloth-chip', 'documented: swatch register (GH-229)'],
  // ['.ob-cardrail-card', 'documented: atelier showroom card register …'] —
  // DELETED at the GH-525 S5 equipment re-merge over play + practice: the
  // atelier rail cards wear kit .ob-card-option since slice 5 (G3–G8) and the
  // play rail cards since the play slice (3) G1, so no rolled-own
  // .ob-cardrail-card is walked on the merged tree; the LEDGER LIVENESS row
  // flagged the line as DEAD (a line matching no walked control is a mute,
  // not a ratchet).
  ['.ob-drills__card', 'documented: drills card register'],
  ['.ob-touchw-', 'documented: touch widget family register (touch.css)'],
  // playback lane, POST wave B (GH-245): every one-off .ob-pb-* control now
  // carries the kit .ob-btn family. The old family-prefix '.ob-pb-' line is
  // GONE (review round 1 P2: a prefix entry would keep exempting ANY future
  // hand-rolled ob-pb-* button — a description rewrite shrinks nothing).
  // The two EXACT chip rows (.ob-pb-filterbtn / .ob-pb-speedbtn) retired
  // with GH-668 S5 slice 6 G4: both strips are kit .ob-segmented radios
  // now (the GH-245 interaction-model residual is the model), so no walked
  // button carries them — liveness would red them as DEAD. A new rolled-own
  // playback button FAILS on the commit that adds it.
  // reached for the FIRST time by the GH-245 list walk (openSession used to
  // bypass the list, so no arm ever judged the row) — the ratchet named it
  // on the walk-adding commit, which is the ratchet working as designed
  ['.ob-pb-row', 'documented: session ledger row register — a full-width '
    + 'grid row (role=button), the .ob-game-row/.ob-drills__card class, '
    + 'not a pill (GH-245 list walk)'],
  // GH-301 director strip: the lane's camera spans are TIMELINE GEOMETRY
  // on the strip pointer surface (the .ob-pb-handle class of control —
  // proportional-width colored bars, not pills), carried as role=button
  // for their accessible names (A1 law). The cut SEAMS are deliberately
  // NOT ledgered: a seam is a TRANSPARENT carrier (its 2px line and states
  // live on a ::before pseudo), so the walker's material predicate never
  // reads it as re-skinned — an entry would be born DEAD (the liveness
  // row proved it on this wave's first audit). Every OTHER new GH-301
  // control (transition picker options/steppers, slot pills, flyout
  // entries/actions, capture bar) is a kit .ob-btn.
  ['.ob-pb-strip-block', 'documented: director-strip camera span (GH-301) — '
    + 'lane geometry, A1 adaptive labels, accent = selected only'],
  // DELETED on the fix-forward round, each because the LIVENESS row proved it
  // matched nothing (element-level: a control merely NESTED under a
  // like-prefixed container never credits a line) — recorded here so the next wave does not re-add them
  // blind: #ob-share/#shoot/#replay/#rerack/#ob-x-/.rq-row already carry
  // .ob-btn; #ob-help-close/#ob-drills-close/.ob-set-nav carry the kit's own
  // .ob-navmodal__* classes; #ob-rp-* is a .ob-btn ladder (share.js:705-717);
  // #ob-rq-* is the sheet's native select, not a button; #err-x,
  // .ob-practice-card, .ob-practice-browse, #ob-drill-*, #ob-picker-*,
  // #ob-record (the pill carried .ob-btn; its dock's own controls were the
  // #ob-rec-* line — both are now RETIRED by GH-225 Phase D, so that line is
  // gone from the ledger above too),
  // #ob-mode-* (the playground chip strip is .ob-badge = a kit part, and the
  // strip is playground-only), #ob-nudge-*, #ob-view-btn,
  // and the rest are state-gated surfaces no audit arm reaches
  // (an error banner, a played-drill history, a live drill, an open picker,
  // the fine-aim cluster) — when an arm does reach one, the ratchet names it
  // and it gets a line WITH a reason, which is the point.
];
// NOTE ON ESCAPES: this walker is an UNTAGGED template literal, so the JS
// engine collapses an unrecognised escape (`\s` -> `s`) BEFORE the string
// reaches the page. Never write a single-backslash regex escape in here — use
// classList / explicit character classes instead (a `/\s+/` written here ran
// as `/s+/` in the page until this round).
const KIT_BUTTON_WALKER = `(() => {
  const ok = ${JSON.stringify(ROLLED_OWN_OK.map((e) => e[0]))};
  // KIT PART = a class kit.css itself declares (read from the live CSSOM, so
  // the test tracks the kit instead of a hardcoded prefix list).
  const kitClasses = new Set();
  let sheets = 0;
  for (const s of document.styleSheets) {
    if (!s.href || !/[/]kit[.]css/.test(s.href)) continue;
    sheets++;
    let rules = null;
    try { rules = s.cssRules; } catch { rules = null; }
    if (!rules) continue;
    const walk = (list) => {
      for (const r of list) {
        if (r.cssRules) walk(r.cssRules);
        for (const m of (r.selectorText || '').matchAll(/[.](ob-[a-z0-9_-]+)/g)) {
          kitClasses.add(m[1]);
        }
      }
    };
    walk(rules);
  }
  if (!kitClasses.size) {
    return [{ what: 'rolled-own ratchet: kit.css classes readable from the CSSOM'
      + ' (sheets matched: ' + sheets + ')', ok: false,
      rule: 'the kit-part test reads every .ob-* class kit.css declares - with '
        + 'the sheet missing or cross-origin the ratchet cannot judge a single '
        + 'control (cache-poison / boot-graph regression)' }];
  }
  // UA reference: a button with the AUTHOR layer reverted, so "authored
  // radius" is measured against this browser's own default (0px), not a
  // constant that a Chrome update could invalidate.
  const probe = document.createElement('button');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;all:revert';
  document.documentElement.append(probe);
  const ua = { radius: getComputedStyle(probe).borderRadius,
    bg: getComputedStyle(probe).backgroundColor };
  probe.remove();
  // EXACT unless the entry declares a FAMILY with a trailing '-'. Blanket
  // prefixes are how a ledger stops being a ratchet: '#ob-gear' must not
  // exempt a future '#ob-gear-extra', while '#ob-rec-' / '.ob-pb-' are
  // deliberate family registers (whole lanes pending conversion).
  const matches = (n, sel) => {
    const body = sel.slice(1);
    const fam = body.endsWith('-');
    if (sel[0] === '#') {
      const id = n.id || '';
      return fam ? id.startsWith(body) : id === body;
    }
    if (!n.classList) return false;
    return [...n.classList].some((c) => (fam ? c.startsWith(body) : c === body));
  };
  // returns '' (no match) | 'self' | 'ancestor'. ELEMENT-OR-ANCESTOR prefix
  // match, bounded ABOVE at <body>: ledger entries may name a CONTAINER
  // (#ob-drill-dock, .ob-pb-speed), but closest() walks to <html> — and <html>
  // carries app-state classes (html.ob-pb-live while the player is open),
  // which allowlisted EVERY button in the document and made this gate vacuous
  // on the one surface it was newly wired to. The self/ancestor distinction
  // matters for LEDGER LIVENESS: an unrelated control nested under a
  // like-prefixed container (a .ob-game-row under #ob-mode-*) must not credit
  // that register as covered.
  const hit = (el, sel) => {
    if (matches(el, sel)) return 'self';
    // ANCESTOR matching is for FAMILY entries only (trailing '-'): a lane
    // pending conversion legitimately covers its children (button.ob-nums
    // inside .ob-pb-speed). An EXACT entry must never exempt a NEW hand-rolled
    // button someone nests inside that control - .ob-game-row is a carrier,
    // not a container licence.
    if (!sel.endsWith('-')) return '';
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      if (matches(n, sel)) return 'ancestor';
    }
    return '';
  };
  const out = [];
  for (const el of document.querySelectorAll('button, [role="button"]')) {
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden') continue;
    if (el.hasAttribute('data-ob-focus-reveal') && cs.opacity === '0') continue; // collapsed focus-reveal row (review r4 P2)
    // "re-skinned": an AUTHORED pill shape plus its own paint (or an explicit
    // appearance reset, which is itself an author decision to drop the UA look).
    // backgroundIMAGE counts: a gradient-painted pill leaves backgroundColor
    // transparent and would otherwise slip past the whole ledger.
    const reskin = cs.borderRadius !== ua.radius
      && (cs.appearance === 'none'
        || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)'
          && cs.backgroundColor !== ua.bg)
        || cs.backgroundImage !== 'none'
        || parseFloat(cs.borderTopWidth) > 0
        || cs.boxShadow !== 'none');
    if (!reskin) continue;
    const own = [...el.classList];
    const kit = own.some((c) => kitClasses.has(c))
      || (!own.length && !!el.closest('.ob-panel'));
    if (kit) continue;
    const id = (el.id ? '#' + el.id
      : (own.length ? '.' + own.join('.') : el.tagName.toLowerCase()))
      + ' [' + (el.textContent || '').trim().slice(0, 14) + ']';
    // sel = allowlist hits (element OR container match); selfSel = the subset
    // that matched the control ITSELF, and the only thing that credits LEDGER
    // LIVENESS below
    const sel = ok.map((s) => [s, hit(el, s)]).filter(([, h]) => h);
    out.push({ what: 'rolled-own button ' + id,
      sel: sel.map(([s]) => s),
      selfSel: sel.filter(([, h]) => h === 'self').map(([s]) => s),
      ok: sel.length > 0,
      rule: 'a button painting its own pill (authored radius + own background/'
        + 'border/shadow or appearance:none) while carrying no class kit.css '
        + 'declares duplicates the kit - adopt .ob-btn/.ob-btn--icon, or add '
        + "it to e2e-ui.mjs's FROZEN ROLLED_OWN_OK ledger with a reason" });
  }
  return out;
})()`;

// LEDGER LIVENESS: every KIT_BUTTON_WALKER consumption records which ledger
// entries actually matched a walked control, so a line that has stopped
// matching anything (a converted control, a deleted surface, or a predicate
// the line was never reachable by) fails instead of silently becoming
// documentation. Asserted once, at the end of the phone section — the last
// audit surface in the process.
// Credit is ELEMENT-LEVEL only (r.selfSel, not r.sel): a control that merely
// SITS under a like-prefixed container (a .ob-game-row under #ob-mode-*) does
// not prove that register is covered, and crediting it would let a line go on
// muting a surface nobody walks.
const LEDGER_SEEN = new Set();
async function kitButtonRows() {
  const rows = await chrome.eval(KIT_BUTTON_WALKER);
  for (const r of rows) for (const s of r.selfSel ?? []) LEDGER_SEEN.add(s);
  return rows;
}

// control labels must NEVER truncate (taste review r2: 'Aufnah…'): checks
// every toolbar pill + HUD button for overflow in the given locale.
const TRUNC_WALKER = `(() => {
  const bad = [];
  for (const el of document.querySelectorAll(
      // GH-225 Phase D: #ob-record left the list with the pill
      '#ob-toolbar > *, #ob-gear, #ob-share, #ob-export-btn,' +
      ' #ob-help,' + // 024 pill — explicit so the fixed-offset fallback is swept
      ' #ob-playback,' + // 030 Phase C pill — same explicit-sweep law
      ' #hud button, #hud label')) {
    if (!el.offsetParent && el.getClientRects().length === 0) continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      bad.push(el.id || el.textContent.slice(0, 20));
    }
  }
  return [...new Set(bad)];
})()`;

async function assertNoTruncation(report, locale) {
  await chrome.eval(`window.__settings.set('language', '${locale}')`);
  await sleep(600);
  const bad = await chrome.eval(TRUNC_WALKER);
  report.push({ ok: !bad.length, page: 'main',
    what: `no truncated control labels [${locale}]`
      + (bad.length ? ' — truncated: ' + bad.join(', ') : '') });
  // decoupled surfaces: wide-locale pills must never breach the HUD panel
  // (taste r3 — the truncation gate alone cannot catch containment breaks)
  const geo = await chrome.eval(`(() => {
    const tb = document.getElementById('ob-toolbar');
    const hud = document.getElementById('hud');
    if (!tb || !hud || !tb.children.length) return 'skip';
    const t = tb.getBoundingClientRect(), h = hud.getBoundingClientRect();
    return t.bottom <= h.top + 1 ? 'ok'
      : 'toolbar bottom ' + t.bottom + ' overlaps hud top ' + h.top;
  })()`);
  report.push({ ok: geo === 'ok' || geo === 'skip', page: 'main',
    what: `toolbar clear of HUD panel [${locale}]`
      + (geo === 'ok' || geo === 'skip' ? '' : ' — ' + geo) });
}

// ---- feature 011 (US2/T024): game selector + catalog browse view ----------
// Structural assertions read the LIVE GameCatalog (2 playable entries on the
// SDK trunk; 5 total once the catalog-data lane lands its three readiness
// entries) so the gate tracks the SDK instead of a hardcoded count. Then the
// new labels (selector, badges, catalog rows) are truncation-gated across
// ALL SEVEN locales with the settings drawer open.
const GAME_LOCALES = ['en', 'zh-CN', 'es', 'ja', 'de', 'fr', 'ko'];
// NEW-label surfaces only: settings labels/summaries/badges + catalog rows
// + the GAME select's closed label. Pre-existing selects (assist etc.) keep
// the kit's designed closed-label ellipsis for long option text — their
// popovers carry the full text (the design charter select width law), so they are
// out of scope here. Feature 015 (contract §6 sanctioned walker extension):
// the modal's nav rail/tabs (.ob-set-nav) and the sticky section head join
// the sweep; panes toggle `hidden` per section, so the driver activates
// each section via __settings.show(...) before running this walker.
const GAME_PANEL_WALKER = `(() => {
  const bad = [];
  for (const el of document.querySelectorAll(
      '#ob-settings label, #ob-settings summary, #ob-settings .ob-badge,' +
      ' #ob-settings .ob-set-nav,' +
      ' #ob-settings-section-title, #ob-settings-section-hint')) {
    // (the game-catalog / provenance card texts and the game select's
    // closed label left the modal with the game pane — feature 034; the
    // play card's texts are walked in auditGameCatalog + the shell hops)
    if (!el.getClientRects().length) continue;
    // the kit sr-only idiom (a 1 x 1 clip-path box — the pane title on the
    // coarse sheet, GH-668 B-K19) is off the paint by design, not a clip
    { const r = el.getBoundingClientRect();
      if (r.width <= 1 && r.height <= 1 && getComputedStyle(el).clipPath !== 'none') continue; }
    if (el.scrollWidth > el.clientWidth + 1) {
      bad.push(el.id || el.className || el.textContent.slice(0, 24));
    }
  }
  return [...new Set(bad)];
})()`;

// modal section registry — FOUR sections since feature 034 (game migrated
// to the shell's play place; equipment to the atelier in 032 — both walked
// in the shell hops below). The audit walks every pane by activating it
// through the __settings.show(...) test surface (015 §6: activate sections
// before per-section probes). NEVER show('game') mid-walk: since 034 it
// routes to the shell (closes the modal).
const SECTION_IDS = ['assists', 'display', 'language', 'about'];

// ---- feature 034 (525 S4a-mig): the play-place hop -------------------------
// The shell exists on a scripted boot ONLY under the reserved `obshell=1`
// opt-in (shell.md §4: createShell no-ops otherwise), so every main-page
// arm that reads the play card hops onto an obshell page (the boot pose
// opens the shell at play) and hops back to the scripted main page after.
const PLAY_MOUNTED = `window.__shell?.isOpen?.() === true && window.__shell.place() === 'play'
  && typeof window.__play === 'object'
  && !!document.querySelector('section[data-place="play"].ob-play-host')`;
async function hopToPlay(tag) {
  // a SECOND browser for the play-place audits — the main audit page is a
  // single session with in-page staging (archived playback session, armed
  // call pill, kit upgrades) that a mid-audit navigation would destroy;
  // 1440×900 = the capture tool's desktop register (at 1280 the rail shows
  // ONE whole card and every other card straddles its overflow edge)
  const h = await launchChrome(`${APP_URL}&obtool=1&obshell=1&u=${tag}`,
    { port: CDP_PORT + 1, width: 1440, height: 900 });
  // the same error gate the primary client carries (review r2 P2): console
  // errors + uncaught exceptions on the play surface, read back by hopBack
  h.__errs = [];
  h.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      h.__errs.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      h.__errs.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
  for (let i = 0; i < 300; i++) {
    await sleep(200);
    try { if (await h.eval('window.__test?.ready === true')) break; } catch { /* booting */ }
  }
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    up = await h.eval(PLAY_MOUNTED).catch(() => false);
    if (!up) await sleep(150);
  }
  // the rail upgrades IN PLACE from the rung-1 button register to the
  // cardrail leaf (play.js RAIL_LEAF_WAIT_MS) — wait for the leaf (bounded),
  // then let the register settle
  for (let i = 0; i < 30; i++) {
    if (await h.eval(`!!document.querySelector('[data-ob="play-games"] .ob-cardrail-card')`).catch(() => false)) break;
    await sleep(150);
  }
  await sleep(700);
  return { h, up };
}
/** close the hop browser; `onErrors(list)` receives the page's app-captured
 * errors (`__test.errors`) + the client's console/exception sink so the
 * caller can push its own verdict row. Awaits the shutdown (closeAndWait)
 * before the port/profile is reused by the next hop (review r2 P2). */
async function hopBack(h, onErrors = null) {
  const errs = [...(await h.eval('window.__test?.errors ?? []').catch(() => ['<__test unreadable>'])),
    ...(h.__errs ?? [])];
  if (onErrors) onErrors(errs);
  try { await (h.closeAndWait ? h.closeAndWait() : h.close()); } catch { /* already gone */ }
  await sleep(400);
}

// GH-667 on its OWN surface (B-K03 / B-PL01 bridge): the carom second-ball
// fork — "Yellow (worldwide practice)" / "Marked white (UMB letter)" in the
// play card's column. Posed live on a hop browser with carom BOOTED (the
// capture-034-play bootGame recipe: persisted game + reload; the fork host is
// hidden for every other game) at the desktop register (1440×900) and the
// 844×390 phone register, every locale, and judged by the twelve kit laws
// plus the fork law: no segment label paints > 1 line box in the pill form
// (the kit's STACK fallback — controls.js upgradeSegmented — has changed the
// control's pole to rows: r-m, start-aligned, ≤ 2 lines); in en / de / fr
// the copy cannot fit the column on one line, so the group MUST be stacked
// (the one-line pill form waits for the B-PL01 copy split, slice 3).
// Red-proven on the pre-fix bytes: 'Markiertes Weiß (UMB-Wortlaut)' painted
// 3 line boxes inside an r-full segment → A1 red on this frame.
// PAD LAW (GH-668 fix round 3, verifier r2 P2): the stacked rows keep the ROW
// register on BOTH registers — computed padding-inline == the resolved
// --ob-sp-3 (12), padding-block == --ob-sp-2 (8) — read against the live
// tokens, never a literal. Red-proven on ea956281: the kit's coarse PILL pad
// rule carried `:not(.ob-navmodal__tabs)` = (0,4,2) and outranked the (0,3,2)
// stack-row rule, so the 844×390 rows painted 17.6 (--ob-pill-pad-coarse).
const FORK_READY = `(() => { const host = document.querySelector('[data-ob="play-carom2b"]');
  const g = host?.querySelector('.ob-segmented[role="radiogroup"]');
  return !!host && !host.hidden && !!g && g.getClientRects().length > 0; })()`;
const FORK_PROBE = `(() => {
  const g = document.querySelector('[data-ob="play-carom2b"] .ob-segmented[role="radiogroup"]');
  if (!g) return null;
  const lines = (el) => { const tops = []; const rg = document.createRange();
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.data.trim()) continue; rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) { if (r.width < 0.5 || r.height < 0.5) continue;
        if (!tops.some((t) => Math.abs(t - r.top) < r.height / 2)) tops.push(r.top); } }
    return tops.length; };
  const px = (v) => parseFloat(v) || 0;
  // a token resolved the way the sheet resolves it (rem / calc → px): a probe
  // box sized by the custom property, read back through the computed width
  const token = (name) => { const p = document.createElement('div'); p.style.cssText = 'position:absolute;visibility:hidden;width:var(' + name + ')';
    document.body.appendChild(p); const v = px(getComputedStyle(p).width); p.remove(); return v; };
  const gr = g.getBoundingClientRect(); const col = g.parentElement.getBoundingClientRect();
  // G2 (B-PL01): the qualifier hint line — a kit .ob-hint after the group, resolved by aria-describedby
  const hn = document.querySelector('[data-ob="play-carom2b-hint"]'); const desc = g.getAttribute('aria-describedby');
  const hint = !!hn && !hn.hidden && hn.classList.contains('ob-hint') && !!desc && document.getElementById(desc) === hn && hn.textContent.trim().length > 0;
  return { stack: g.classList.contains('ob-segmented--stack'), gw: gr.width, colw: col.width, hint,
    sp2: token('--ob-sp-2'), sp3: token('--ob-sp-3'), pillCoarse: token('--ob-pill-pad-coarse'),
    labels: [...g.querySelectorAll(':scope > label')].map((l) => { const r = l.getBoundingClientRect(); const cs = getComputedStyle(l);
      return { text: l.textContent.trim(), lines: lines(l), h: r.height, w: r.width, r: px(cs.borderTopLeftRadius),
        just: cs.justifyContent, pad: px(cs.paddingLeft), padR: px(cs.paddingRight), padT: px(cs.paddingTop), padB: px(cs.paddingBottom),
        checked: !!l.querySelector('input:checked'), bg: cs.backgroundColor, ink: cs.color, shadow: cs.boxShadow }; }) }; })()`;
async function auditCaromFork(report) {
  const { h, up } = await hopToPlay('fork667');
  const bootFork = async () => {
    for (let i = 0; i < 300; i++) {
      await sleep(200);
      try { if (await h.eval('window.__test?.ready === true')) break; } catch { /* booting */ }
    }
    let ok = false;
    for (let i = 0; i < 100 && !ok; i++) { ok = await h.eval(PLAY_MOUNTED).catch(() => false); if (!ok) await sleep(150); }
    let fork = false;
    for (let i = 0; i < 40 && !fork; i++) { fork = await h.eval(FORK_READY).catch(() => false); if (!fork) await sleep(150); }
    await sleep(700); // kit upgrade + the stack measure frame
    return ok && fork;
  };
  const judge = async (page, coarse) => {
    for (const locale of GAME_LOCALES) {
      await h.eval(`window.__settings.set('language', '${locale}')`);
      await sleep(400);
      // pose = the capture-034 fork recipe: the HOST (caption + group) in view
      // (block nearest — the group alone would park the caption under the
      // card's sticky heading), the marked radio focused without scrolling
      await h.eval(`(() => { const host = document.querySelector('[data-ob="play-carom2b"]');
        host?.scrollIntoView({ block: 'nearest' }); host?.querySelector('input[value="marked"]')?.focus({ preventScroll: true }); return true; })()`);
      await sleep(250);
      await auditKitLaws(report, page, { locale, coarse, client: h });
      const f = await h.eval(FORK_PROBE).catch(() => null);
      const bad = [];
      if (!f) bad.push('fork group absent');
      else {
        if (f.labels.length !== 2) bad.push(`${f.labels.length} options`);
        for (const l of f.labels) {
          if (l.lines > 2) bad.push(`"${l.text}" paints ${l.lines} lines`);
          if (l.lines > 1 && l.r >= l.h / 2 - 0.5) bad.push(`"${l.text}" ${l.lines}-line PILL (r ${l.r.toFixed(0)} on h ${l.h.toFixed(0)})`);
          if (f.stack && !/^(flex-start|start|normal|left)$/.test(l.just)) bad.push(`"${l.text}" stacked row not start-aligned (${l.just})`);
          if (f.stack && l.r > 10.5) bad.push(`"${l.text}" stacked row r ${l.r.toFixed(1)} > r-m`);
          if (f.stack && (Math.abs(l.pad - f.sp3) > 0.5 || Math.abs(l.padR - f.sp3) > 0.5)) {
            bad.push(`"${l.text}" stacked row inline pad ${l.pad.toFixed(1)}/${l.padR.toFixed(1)} ≠ sp-3 ${f.sp3}`
              + (Math.abs(l.pad - f.pillCoarse) <= 0.5 ? ' (= the coarse PILL pad reached the row)' : ''));
          }
          if (f.stack && (Math.abs(l.padT - f.sp2) > 0.5 || Math.abs(l.padB - f.sp2) > 0.5)) bad.push(`"${l.text}" stacked row block pad ${l.padT.toFixed(1)}/${l.padB.toFixed(1)} ≠ sp-2 ${f.sp2}`);
          if (coarse && l.h < 43.5) bad.push(`"${l.text}" h ${l.h.toFixed(1)} < 44 coarse`);
        }
        if (f.stack && Math.abs(f.gw - f.colw) > 1) bad.push(`stacked group ${f.gw.toFixed(0)} ≠ column ${f.colw.toFixed(0)}`);
        // GH-668 S5 slice 3 G2 (B-PL01): the split copy (two nouns + a hint line) fits the PILL form in
        // every locale at both columns — the stack was the kit's safety net for the un-split qualifiers
        if (f.stack !== false) bad.push('STACKED: the B-PL01 noun copy must paint the pill form (the stack fallback is the kit safety net, not the fork register)');
        if (!f.hint) bad.push('hint line absent (span.ob-hint[data-ob="play-carom2b-hint"] after the group, aria-describedby resolved)');
      }
      report.push({ ok: !bad.length, page,
        what: `carom fork [${locale}] ${f ? (f.stack ? 'stacked rows' : 'pill segments') : ''}` + (bad.length ? ' — ' + bad.join('; ') : ''),
        rule: 'GH-667 / B-K03 stack fallback law: a segment never paints > 1 line in the pill form; rows r-m start-aligned ≤ 2 lines, full width, sp-2 / sp-3 row pads on both registers (never the pill pad), 44 coarse' });
    }
    await h.eval(`window.__settings.set('language', 'en')`);
    await sleep(300);
  };
  if (!up) {
    report.push({ ok: false, page: 'play fork', what: 'obshell hop for the fork frame never mounted play', rule: '034 FR-002' });
  } else {
    await h.eval(`(() => { const s = JSON.parse(localStorage.getItem('ob-settings-v1') || '{}');
      s.game = 'carom_3cushion'; localStorage.setItem('ob-settings-v1', JSON.stringify(s)); location.reload(); return true; })()`);
    let ok = await bootFork();
    report.push({ ok, page: 'play fork 1440x900', what: 'carom boot poses the play card with the second-ball fork visible', rule: '034 FR-009: the fork shows for carom_3cushion' });
    if (ok) await judge('play fork 1440x900', false);
    await setPhoneMetrics(h, { width: 844, height: 390 });
    await h.send('Page.navigate', { url: `${APP_URL}&obtool=1&obshell=1&u=fork667p` });
    ok = await bootFork();
    report.push({ ok, page: 'play fork 844x390', what: 'carom boot poses the fork at the phone register', rule: '034 FR-009 / 014 coarse register' });
    if (ok) await judge('play fork 844x390', true);
  }
  await hopBack(h, (errs) => report.push({ ok: !errs.length, page: 'play fork',
    what: 'fork frame: no console errors / uncaught exceptions' + (errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''),
    rule: 'e2e error gate (review r2 P2)' }));
}
async function auditGameCatalog(report) {
  // feature 015: the settings drawer is a modal with a section registry
  // (contract §3) — walk it once: every id activates, aria-current follows
  // on the nav rail, exactly one pane is visible. FOUR sections since
  // feature 034 (the game pane migrated to the shell's play place — walked
  // on the shell below via the __settings.show('game') shim).
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await sleep(500); // motion.enter + kit upgrade settle
  const reg = await chrome.eval(`(() => {
    const out = [];
    for (const id of ${JSON.stringify(SECTION_IDS)}) {
      const active = window.__settings.show(id);
      const nav = document.querySelector(
        '#ob-settings .ob-set-nav[aria-current="true"]');
      const visible = [...document.querySelectorAll(
        '#ob-settings section[data-section]')].filter((s) => !s.hidden);
      out.push({ id, active,
        nav: nav?.dataset.section ?? null,
        visible: visible.map((s) => s.dataset.section).join(','),
        headTitle: (document.getElementById('ob-settings-section-title')
          ?.textContent ?? '').length > 0 });
    }
    window.__settings.show('assists');
    return out;
  })()`);
  for (const r of reg) {
    report.push({
      ok: r.active === r.id && r.nav === r.id && r.visible === r.id
        && r.headTitle,
      page: 'main',
      what: `settings modal section '${r.id}' activates via __settings.show `
        + `(active=${r.active}, nav=${r.nav}, visible=[${r.visible}])`,
      rule: '015 §3 / 034 FR-010: four-section registry, hidden-toggle '
        + 'switching, aria-current nav',
    });
  }
  // zero truncation for the modal labels across ALL SEVEN locales; the
  // modal shows one pane at a time, so every registry section is activated
  // in turn (015 §6: nav rail + section head join the sweep)
  // NB: section switching runs NODE-side (chrome.eval per section) — page-
  // side setTimeout chains fall under headless Chrome's intensive wake-up
  // throttling (~1 tick/min after 5 min of page lifetime) and stall the run
  for (const locale of GAME_LOCALES) {
    await chrome.eval(`window.__settings.set('language', '${locale}')`);
    await sleep(600);
    const bad = [];
    for (const id of SECTION_IDS) {
      await chrome.eval(`window.__settings.show('${id}')`);
      await sleep(60);
      for (const b of await chrome.eval(GAME_PANEL_WALKER)) {
        bad.push(`${id}:${b}`);
      }
    }
    await chrome.eval(`window.__settings.show('assists')`);
    const badu = [...new Set(bad)];
    report.push({ ok: !badu.length, page: 'main',
      what: `no truncated settings labels [${locale}]`
        + (badu.length ? ' — truncated: ' + badu.join(', ') : ''),
      rule: 'control labels never ellipsize (e2e-ui --audit law)' });
  }
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(400);
  // the FR-011 shim leg below closes the modal itself; the play-place audit
  // then runs on a second browser and the main page is left exactly as the
  // pre-034 arm left it: modal CLOSED (the later walker composition — modal
  // + export dialog open — is staged by its own steps)
  // ---- the play place (feature 034, spec §14 re-cut of the catalog audit):
  // show('game') with the modal open closes it and opens the shell at play
  // (FR-011); the discipline rail renders the PLAYABLE set actionable with
  // nine_ball current (fresh profile), every card carries its pinned
  // provenance; readiness entries + aria-disabled are asserted ONLY under
  // the `__play.previewCatalog` fixture (the shipped catalog has no
  // readiness entry — review round 1 P1-3); the variant list rides the same
  // card (settings-owned `variantRows`); 7-locale fit of the card texts.
  // the FR-011 shim: on THIS scripted page (no shell) show('game') with the
  // modal open closes the modal and answers with the honest HUD hint (the
  // shell-less register); the routed leg itself is e2e-settings A2 (obshell)
  const shim = await chrome.eval(`(async () => {
    const r = window.__settings.show('game');
    await new Promise((res) => setTimeout(res, 900));
    return { r, after: window.__settings.activeSection(),
      modalRects: document.getElementById('ob-settings')?.getClientRects().length ?? 0,
      hint: document.getElementById('hud-hint')?.textContent ?? null,
      exp: window.__i18n.t('shell.place.play.shim.stale'), shell: typeof window.__shell }; })()`);
  report.push({ ok: shim.r !== 'game' && shim.after !== 'game' && shim.modalRects === 0
      && (shim.shell === 'undefined' ? shim.hint === shim.exp : true), page: 'main',
    what: "__settings.show('game') never poses a game pane (modal closed; shell-less scripted page ⇒ honest HUD hint)",
    rule: '034 FR-011: the game section migrated — show(game) = the play place shim' });
  if (await chrome.eval(`(document.getElementById('ob-settings')?.getClientRects().length ?? 0) > 0`)) {
    await chrome.eval(`document.getElementById('ob-gear').click()`); // close (parity with the pre-034 arm)
    await sleep(400);
  }
  const { h, up } = await hopToPlay('catalog034');
  report.push({ ok: up, page: 'main',
    what: "obshell hop: the shell opens at the play card (window.__play published, host class)",
    rule: '034 FR-002/FR-011: the play place is the game surface' });
  const hopErrors = (errs) => report.push({ ok: errs.length === 0, page: 'main',
    what: 'play hop (catalog audit): zero app-captured / console errors'
      + (errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''),
    rule: 'zero-console-error law on the play surface (034 FR-002)' });
  if (!up) {
    // the row above is the verdict (the auditCaromFork idiom): a hop page that
    // never mounted play may not have navigated at all, and the import below
    // then threw "Failed to resolve module specifier" on about:blank and ended
    // the pass (#1033's B7 class; e2e-ui-audit job 114391335026)
    await hopBack(h, hopErrors);
    return;
  }
  const cat = await h.eval(`(async () => {
    const { GAME_CATALOG } = await import('/dist/pool-sdk/games/index.js');
    const caps = window.__settings.capabilities?.() ?? null;
    const heyballOk = caps ? caps.heyball === true : window.__settings.get().game === 'heyball';
    const sec = document.querySelector('section[data-place="play"]');
    const cards = [...sec.querySelectorAll('[data-ob="play-game"]')];
    const reg = window.__play.registry();
    return {
      modalClosed: (document.getElementById('ob-settings')?.getClientRects().length ?? 0) === 0,
      playableIds: GAME_CATALOG.filter((e) => e.readiness === 'playable'
        && (e.id !== 'heyball' || heyballOk)).map((e) => e.id),
      regPlayable: reg.games.filter((g) => g.playable).map((g) => g.id),
      current: cards.find((c) => c.getAttribute('aria-current') === 'true')?.dataset.game ?? null,
      persisted: window.__settings.get().game ?? null,
      cards: cards.map((c) => ({
        id: c.dataset.game, playable: c.dataset.playable,
        disabled: c.getAttribute('aria-disabled') === 'true',
        name: (c.querySelector('.ob-play-card__name')?.textContent ?? '').trim(),
        prov: (c.querySelector('.ob-play-card__prov')?.textContent ?? c.textContent ?? ''),
        // GH-668 S5 slice 3 G4 (OWNER Q2 default A): the edition is the kit
        // __meta line, Intl-formatted (month + year) from the catalog's date
        edition: (c.querySelector('.ob-play-card__edition')?.textContent ?? '').trim(),
      })),
      entries: GAME_CATALOG.map((e) => ({
        id: e.id, readiness: e.readiness,
        body: e.provenance.body, edition: e.provenance.edition,
      })),
      variants: [...sec.querySelectorAll('[data-ob="play-variants"] .ob-variant-row')].length,
      variantsHidden: sec.querySelector('[data-ob="play-variants"]')?.hidden ?? null,
      rows: window.__settings.variantRows?.() ?? null,
    };
  })()`);
  report.push({ ok: cat.modalClosed, page: 'main',
    what: "show('game') closed the settings modal (no orphan game pane)",
    rule: '034 FR-010/FR-011: complete-pane rule' });
  report.push({
    ok: JSON.stringify(cat.cards.filter((c) => c.playable === 'true').map((c) => c.id))
      === JSON.stringify(cat.playableIds) && cat.playableIds.length > 0
      && JSON.stringify(cat.regPlayable) === JSON.stringify(cat.playableIds),
    page: 'main',
    what: `play rail lists the PLAYABLE (offered) set actionable [${cat.playableIds}]`
      + ` (registry [${cat.regPlayable}])`,
    rule: 'contracts/game-catalog.md selector rule + 034 FR-005/006 (heyball via capabilities())' });
  report.push({ ok: cat.current === 'nine_ball' && cat.persisted === 'nine_ball',
    page: 'main',
    what: `play rail defaults to nine_ball (current=${cat.current}, `
      + `persisted=${cat.persisted})`,
    rule: 'FR-003: fresh profiles default to 9-ball' });
  report.push({ ok: cat.entries.length === 8, page: 'main',
    what: `GameCatalog carries the 8-discipline content freeze `
      + `(${cat.entries.length}/8; playable: [${cat.playableIds}])`,
    rule: '012 US4/FR-001 + growth repins: eight disciplines, honest catalog' });
  for (const e of cat.entries.filter((x) => cat.playableIds.includes(x.id))) {
    const card = cat.cards.find((c) => c.id === e.id);
    // the edition reads either verbatim in the hint (the S4 line / the
    // `data-ob-citation="full"` switch) or as the Intl month + year meta
    // line carrying the edition's year (Q2 default A, slice 3 G4)
    const year = (/\d{4}/.exec(e.edition) ?? [''])[0];
    const editionShown = !!card && (card.prov.includes(e.edition)
      || (card.edition.length > 0 && year !== '' && card.edition.includes(year)));
    report.push({
      ok: !!card && card.name.length > 0 && card.prov.includes(e.body)
        && editionShown && !card.disabled,
      page: 'main',
      what: `play card ${e.id}: localized name + provenance line + edition, actionable`
        + (card ? ` ("${card.prov.slice(0, 40)}…" / "${card.edition}")` : ' — card missing'),
      rule: '034 FR-005/FR-006: every playable card shows governing body + edition' });
  }
  // nine_ball is a single-preset family: variantRows() answers [] and the
  // list hides (contract §7); the summary carries the default line
  report.push({
    ok: Array.isArray(cat.rows) && cat.rows.length === 0 && cat.variants === 0
      && cat.variantsHidden === true,
    page: 'main',
    what: `variant list hidden for the single-preset default family (rows=${JSON.stringify(cat.rows)})`,
    rule: '034 FR-008 / contract §7: variantRows [] ⇒ list hidden' });
  // readiness fixture (T012/T027 seam): prerequisites + aria-disabled ONLY
  // under __play.previewCatalog; else logged and skipped (review round 1 P1-3)
  const fx = await h.eval(`(async () => {
    if (typeof window.__play.previewCatalog !== 'function') return { skip: 'no previewCatalog seam' };
    // previewCatalog takes the EXTRA readiness entries only (it rejects ids
    // already in GAME_CATALOG); the e2e-play P1b fixture shape
    const fixture = [{ id: 'fixture_game', display_name: 'Fixture Game',
      readiness: 'config_ready',
      provenance: { body: 'Fixture Body', rulebook: 'Fixture Rules', edition: '2026' },
      prerequisites: [{ id: 'fixture-rules', kind: 'ruleset', description: 'fixture prerequisite' }] }];
    let ok = false;
    try { ok = window.__play.previewCatalog(fixture) !== false; } catch (e) { return { skip: 'previewCatalog threw: ' + e.message }; }
    await new Promise((r) => setTimeout(r, 400));
    const sec = document.querySelector('section[data-place="play"]');
    const card = sec.querySelector('[data-ob="play-game"][data-game="fixture_game"]');
    const cards = [...sec.querySelectorAll('[data-ob="play-game"]')];
    const out = { ok, present: !!card, last: cards.at(-1)?.dataset.game ?? null,
      disabled: card?.getAttribute('aria-disabled') === 'true',
      playable: card?.dataset.playable ?? null,
      prereq: card ? /fixture prerequisite/.test(card.textContent) : false,
      notPlayable: card ? card.textContent.includes(window.__i18n.t('shell.place.play.notPlayable')) : false };
    try { window.__play.previewCatalog(null); } catch { /* restore */ }
    return out;
  })()`);
  if (fx.skip) {
    console.log(`[e2e-ui] readiness cards: catalog ships no readiness entry — ${fx.skip}; skipped`);
  } else {
    report.push({
      ok: fx.present && fx.last === 'fixture_game' && fx.disabled && fx.playable === 'false'
        && fx.prereq && fx.notPlayable,
      page: 'main',
      what: 'readiness fixture card renders AFTER the playable set, aria-disabled, '
        + `with its prerequisite + not-playable status (${JSON.stringify(fx)})`,
      rule: '034 FR-005/FR-006 (T031/US4): readiness entries browse-only, prerequisites listed' });
  }
  // 7-locale fit of the play card texts (the never-ellipsize law)
  for (const locale of GAME_LOCALES) {
    await h.eval(`window.__settings.set('language', '${locale}')`);
    await sleep(500);
    const bad = await h.eval(`(() => {
      const out = [];
      const sec = document.querySelector('section[data-place="play"]');
      for (const el of sec.querySelectorAll('h3, .ob-play-card__name, .ob-play-card__prov, '
        + '.ob-play-card__prereqs, [data-ob="play-summary"] span, [data-ob="play-back"], '
        + '.ob-variant-row__label, .ob-eq-prov-row__desc, .ob-badge')) {
        if (!el.getClientRects().length) continue;
        const cs = getComputedStyle(el);
        if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
          out.push(el.className || el.tagName);
        }
      }
      return [...new Set(out)]; })()`);
    report.push({ ok: !bad.length, page: 'main',
      what: `no ellipsized play-card labels [${locale}]`
        + (bad.length ? ' — truncated: ' + bad.join(', ') : ''),
      rule: 'control labels never ellipsize (e2e-ui --audit law; 034 FR-017)' });
  }
  await h.eval(`window.__settings.set('language', 'en')`);
  await sleep(400);
  await hopBack(h, hopErrors);
}

// ---- GH-443: rules-variant CLOSED-label law — re-cut by feature 034 --------
// The kit select's closed trigger ellipsized long preset citations in every
// locale (the two build-18 round-1 sightings behind GH-443). Since feature
// 034 (525 S4a-mig) the rules-variant picker is the play card's CARD LIST
// (`[data-ob="play-variants"] .ob-variant-row`, settings-owned rows via
// `variantRows`) — there is NO closed control to truncate. This arm now
// gates the successor law on the play place: (a) NO native <select> under
// `section[data-place="play"]`; (b) for EVERY playable game × all 7 locales
// every variant-row name + citation + badge FITS (no ellipsized overflow;
// the never-ellipsize law). Rows are read through the shell at play. A list
// of ONE is not a list (GH-668 S5 slice 3 G5, B-PL06 / contract D-G5-b): a
// single-preset family renders NO rows and keeps the list hidden — the
// expectation is `rows === (api >= 2 ? api : 0)`.
const VARIANT_LIST_PROBE = `(() => {
  const sec = document.querySelector('section[data-place="play"]');
  if (!sec || typeof window.__play !== 'object') return { skip: true };
  const rows = [...sec.querySelectorAll('[data-ob="play-variants"] .ob-variant-row')];
  const bad = [];
  for (const r of rows) {
    for (const el of r.querySelectorAll('.ob-variant-row__label, .ob-eq-prov-row__desc, .ob-badge')) {
      if (!el.getClientRects().length) continue;
      if (getComputedStyle(el).textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) {
        bad.push((r.dataset.variant || '?') + ' "' + el.textContent.slice(0, 32) + '"');
      }
    }
  }
  return { skip: false, rows: rows.length, selects: sec.querySelectorAll('select').length,
    hidden: sec.querySelector('[data-ob="play-variants"]')?.hidden ?? null,
    api: (window.__settings.variantRows?.() ?? []).length, bad };
})()`;
async function auditVariantClosedLabels(report) {
  const origGame = await chrome.eval(`window.__settings.get().game`);
  const { h, up } = await hopToPlay('variants034');
  report.push({ ok: up, page: 'main',
    what: 'obshell hop for the rules-variant list audit: the play card mounted',
    rule: '034 FR-008: the variant list lives on the play place' });
  const games = up ? await h.eval(
    `window.__play.registry().games.filter((g) => g.playable).map((g) => g.id)`) : [];
  for (const game of games) {
    await h.eval(
      `window.__settings.changeGame('${game}', { skipConfirm: true })`);
    await sleep(350);
    for (const locale of GAME_LOCALES) {
      await h.eval(`window.__settings.set('language', '${locale}')`);
      await sleep(400);
      const res = await h.eval(VARIANT_LIST_PROBE);
      report.push({
        ok: !res.skip && res.selects === 0 && res.rows === (res.api >= 2 ? res.api : 0)
          && (res.api >= 2 ? res.hidden === false : res.hidden === true) && !res.bad.length,
        page: 'main',
        what: `rules-variant list on the play card fits, no closed control [${game} ${locale}] `
          + `(${res.rows ?? 0} rows / ${res.api ?? 0} api rows)`
          + (res.skip ? ' — play card missing' : '')
          + (res.bad?.length ? ' — truncated: ' + res.bad.join(', ') : ''),
        rule: 'control labels never ellipsize (e2e-ui --audit law; GH-443 → 034 FR-008 card list)',
      });
    }
  }
  await h.eval(`window.__settings.set('language', 'en')`);
  await sleep(400);
  await h.eval(
    `window.__settings.changeGame('${origGame}', { skipConfirm: true })`);
  await sleep(350);
  await hopBack(h, (errs) => report.push({ ok: errs.length === 0, page: 'main',
    what: 'play hop (variant-list audit): zero app-captured / console errors'
      + (errs.length ? ' — ' + errs.slice(0, 3).join(' | ') : ''),
    rule: 'zero-console-error law on the play surface (034 FR-002)' }));
}

// ---- kit-select popover reachability (issue #36 findings 2+4): every
// select popover inside the settings modal must open ABOVE the modal.
// Real pointer events only — the value-setter contract (select.js) bypasses
// hit-testing, which is exactly how the z:60-popover-under-z:70-modal
// regression shipped green: options rendered UNDER the opaque panel and a
// real click was read by the outside-pointerdown handler as a dismiss.
// Gate: open each modal select by mouse, elementFromPoint at every option
// center must land INSIDE the popover; one full commit is exercised on the
// TABLE select (real option click → the kit confirm raises → cancel).
// Issue #291 extension: the probe ALSO gates the FOLD directly —
// scrollHeight > clientHeight IS the clipped state. Center hit-testing
// alone catches options fully past the fold but is blind to the last
// half-clipped row (center still inside the client box while the row's
// lower half is cut off), and to any future fix that merely scrolls the
// audit instead of the component. Red-proven on catalog v14 pre-fix:
// 16 cue options in the 300px-capped popover = 8 buried centers AND
// scrollHeight 600 > clientHeight 298.
const POPOVER_PROBE = `(() => {
  const list = document.querySelector('[data-ob="select-list"]');
  if (!list) return { open: false };
  const misses = [], textClips = [];
  for (const li of list.children) {
    const r = li.getBoundingClientRect();
    const hit = document.elementFromPoint(
      r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !list.contains(hit)) {
      misses.push(li.textContent.slice(0, 24) + ' -> '
        + (hit ? (hit.id || String(hit.className).slice(0, 24)) : 'null'));
    }
    // nowrap options never ellipsize by construction — overflow would CLIP;
    // gate the intrinsic fit (the never-ellipsize law at popover level)
    if (li.scrollWidth > li.clientWidth + 1) {
      textClips.push(li.textContent.slice(0, 24));
    }
  }
  return { open: true, options: list.children.length, misses, textClips,
    scrollH: list.scrollHeight, clientH: list.clientHeight };
})()`;
const popoverClipped = (p) =>
  p.open === true && p.scrollH > p.clientH + 1;
const popoverProbeOk = (p) =>
  p.open === true && p.options > 0 && !p.misses.length && !popoverClipped(p);
const popoverProbeWhy = (p) =>
  (p.open ? '' : ' — popover never opened')
  + (p.misses?.length ? ' — buried: ' + p.misses.join('; ') : '')
  + (popoverClipped(p) ? ` — CLIPPED: scrollHeight ${p.scrollH} > `
    + `clientHeight ${p.clientH} (options past the fold)` : '');
// Staging (integrator-authorized shared-tool hunk, GH-668 S5 play r2): the
// kit popover opens on a REAL click through the select leaf's own frame and
// its entrance tween, and a fixed 300 ms wait is exactly what a loaded box
// misses — one missed open reads "popover never opened", the Escape that
// follows closes the MODAL instead of a popover, and the LOOK select / the
// confirm x7 / the volume rail cascade red behind it (the [main]
// settings-modal cluster: lane tip 5/10 vs main 0/4 at load 45-60, right
// after auditCaromFork's hop tab tears down beside this frame). Poll the
// probe's OPEN state up to ~1.5 s in 150 ms steps after the first 300 ms;
// the assertions are unchanged — an open popover is judged by the same
// probe, a popover that never opens still reads "popover never opened".
const POPOVER_OPEN_WAIT_MS = 1500;
const POPOVER_OPEN_STEP_MS = 150;
async function probePopoverOpen() {
  await sleep(300);
  let probe = await chrome.eval(POPOVER_PROBE);
  for (let waited = 300; !probe.open && waited < POPOVER_OPEN_WAIT_MS;
    waited += POPOVER_OPEN_STEP_MS) {
    await sleep(POPOVER_OPEN_STEP_MS);
    probe = await chrome.eval(POPOVER_PROBE);
  }
  return probe;
}
async function auditSelectPopovers(report) {
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await sleep(500);
  for (const sec of SECTION_IDS) {
    await chrome.eval(`window.__settings.show('${sec}')`);
    await sleep(120);
    const ids = await chrome.eval(`(() => {
      for (const d of document.querySelectorAll('#ob-settings details')) {
        d.open = true; // the Advanced cushion select joins the sweep
      }
      // upgraded selects whose combobox is VISIBLE (== the active pane)
      return [...document.querySelectorAll('#ob-settings select')]
        .filter((s) => s.nextElementSibling?.dataset?.ob === 'select-button'
          && s.nextElementSibling.getClientRects().length > 0)
        .map((s) => s.id).filter(Boolean);
    })()`);
    for (const id of ids) {
      const pt = await chrome.eval(`(() => {
        const b = document.getElementById('${id}').nextElementSibling;
        if (!b || b.dataset.ob !== 'select-button') return null;
        b.scrollIntoView({ block: 'center' });
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      })()`);
      if (!pt) {
        report.push({ ok: false, page: 'main',
          what: `kit select ${id} [${sec}]: no combobox sibling to click`,
          rule: 'issue #36 finding 4: real-pointer popover reachability' });
        continue;
      }
      await mouseClick(pt.x, pt.y);
      const probe = await probePopoverOpen();
      report.push({
        ok: popoverProbeOk(probe),
        page: 'main',
        what: `kit select ${id} [${sec}]: popover opens ABOVE the modal, `
          + `${probe.options ?? 0} option centers hit-test inside it, `
          + 'no option past the fold'
          + popoverProbeWhy(probe),
        rule: 'issue #36 finding 2 + issue #291: popover layer above the '
          + 'modal shell, full option set unclipped',
      });
      await pressKey('Escape', 'Escape', 27);
      await sleep(150);
    }
  }
  // (issue #291 disposition 2 — the cue-select popover ×7 — RETIRED with
  // the equipment pane, feature 032: the atelier's cue surface is CARD
  // ROWS, not a kit-select popover; their truncation/geometry ride the
  // atelier walks in auditShellChrome + the phone hop. The #36-finding-4
  // commit path below re-cut to the resident GAME select (032), then — the
  // game select left with the game pane, feature 034 — to the resident LOOK
  // select: sp → green offers a reload through the SAME kit confirm
  // (contract 015 §4 call-site 3, the K3 flow), cancelled here.)
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(400);
  // full commit path once, on the LOOK select (kit confirm + cancel); the
  // persisted look is restored through the API afterwards
  const origLook = await chrome.eval(`window.__settings.get().look`);
  await chrome.eval(`window.__settings.set('look', 'tournament')`);
  await sleep(900); // a live sp regrade settles without a dialog
  await chrome.eval(`window.__settings.show('display')`);
  await sleep(120);
  const tpt = await chrome.eval(`(() => {
    const b = document.getElementById('ob-set-look').nextElementSibling;
    if (!b || b.dataset.ob !== 'select-button') return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (tpt) await mouseClick(tpt.x, tpt.y);
  await probePopoverOpen(); // the same staging poll on the commit-path click
  const opt = await chrome.eval(`(() => {
    const list = document.querySelector('[data-ob="select-list"]');
    const li = list && [...list.children]
      .find((l) => l.getAttribute('aria-selected') !== 'true'
        && l.getAttribute('aria-disabled') !== 'true');
    if (!li) return null;
    const r = li.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  let confirmed = false;
  if (opt) {
    await mouseClick(opt.x, opt.y);
    for (let i = 0; i < 40 && !confirmed; i++) {
      await sleep(200);
      confirmed = await chrome.eval(`!!document.querySelector('[data-ob="confirm"]')`);
    }
    if (confirmed) {
      await chrome.eval(
        `document.querySelector('[data-ob="confirm-cancel"]').click()`);
      for (let i = 0; i < 25; i++) {
        if (!await chrome.eval(`!!document.querySelector('[data-ob="confirm"]')`)) break;
        await sleep(200);
      }
    }
  }
  report.push({ ok: opt !== null && confirmed, page: 'main',
    what: 'LOOK select: real mouse option click reaches commit '
      + '(kit confirm raised, cancelled)'
      + (opt ? '' : ' — no clickable option found'),
    rule: 'issue #36 finding 4 (re-cut by 032 to the game select, by 034 to '
      + 'the resident look select): popover commit path with real pointer events' });
  await chrome.eval(`window.__settings.set('look', ${JSON.stringify(origLook)})`);
  await sleep(600);
  await chrome.eval(`window.__settings.show('assists')`);
  await chrome.eval(`document.getElementById('ob-gear').click()`); // close
  await sleep(400);
}

// ---- confirm dialog geometry (the design charter kit chrome laws) across all 7
// locales: card-pole panel (12px radius, 1px border), pill action buttons
// (999px, one shared height), 16px dialog body (--ob-fs-1 under G1), no
// label truncation in any locale, panel inside the viewport, SAFE initial
// focus, aria-modal alertdialog, and clean teardown per open/close cycle.
// build 20: the game-switch progress overlay (ui/switchprogress.js) posed in
// every phase × all 7 locales — the card sits inside the viewport, no label
// clips, the bar is a kit progressbar whose valuetext is the phase line, the
// phase line is a polite live region carrying the locale's t() string, the
// root covers the viewport (it is the input shield) on the dialog rung, the
// card paints the solid glass rung, and end() leaves zero residue. The arms
// that judge the live switch (paint-before-block, order, settle, input) are
// e2e-shell-switch.mjs.
const SWITCH_CSS_V = /const SWITCH_CSS_V = '([^']+)'/.exec(fs.readFileSync(path.join(webDir, 'app/settings.js'), 'utf8'))?.[1] ?? 'missing';
async function auditSwitchOverlay(report, page = 'main') {
  for (const locale of GAME_LOCALES) {
    await chrome.eval(`window.__settings.set('language', '${locale}')`);
    await sleep(600);
    const geo = await chrome.eval(`(async () => {
      for (let i = 0; i < 100 && window.__i18n.locale() !== '${locale}'; i++) await new Promise((r) => setTimeout(r, 50));
      if (window.__i18n.locale() !== '${locale}') return { err: 'locale ${locale} never became active' };
      const mod = await import('./app/ui/switchprogress.js');
      if (typeof mod.showSwitchProgress !== 'function') return { err: 'showSwitchProgress export missing' };
      if (!document.getElementById('ob-switchprogress-css')) { // the URL settings.js links (its ?v= law)
        const link = document.createElement('link');
        link.id = 'ob-switchprogress-css'; link.rel = 'stylesheet'; link.href = './app/ui/switchprogress.css?v=${SWITCH_CSS_V}';
        await new Promise((r) => { link.onload = r; link.onerror = r; document.head.appendChild(link); });
      }
      const t = window.__i18n.t;
      const api = await mod.showSwitchProgress({
        title: t('switch.title', { game: t('game.snooker') }),
        labels: { table: t('switch.phase.table'), fetch: t('switch.phase.fetch'),
          materials: t('switch.phase.materials'), settling: t('switch.phase.settling') },
        frames: null, settled: () => false,
      });
      const root = document.querySelector('[data-ob="switch-progress"]');
      if (!api || !root) return { err: 'overlay never appeared' };
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'var(--ob-glass-solid)';
      document.body.appendChild(probe);
      const wantBg = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const clip = (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = { phases: [] };
      for (const ph of ['table', 'fetch', 'materials', 'settling']) {
        api.pose(ph);
        await frame();
        const card = root.querySelector('.ob-switchprogress__card');
        const bar = root.querySelector('[role="progressbar"]');
        const line = root.querySelector('.ob-switchprogress__phase');
        const r = card.getBoundingClientRect();
        const covers = [[2, 2], [innerWidth - 3, innerHeight - 3]]
          .every(([x, y]) => root.contains(document.elementFromPoint(x, y)));
        out.phases.push({ ph,
          inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
          clipped: [root.querySelector('.ob-switchprogress__title'), line].filter(clip).map((el) => el.className),
          text: line.textContent === t('switch.phase.' + ph),
          live: line.getAttribute('role') === 'status' && line.getAttribute('aria-live') === 'polite',
          bar: bar?.getAttribute('aria-valuemin') === '0' && bar?.getAttribute('aria-valuemax') === '1'
            && Number(bar?.getAttribute('aria-valuenow')) > 0 && bar?.getAttribute('aria-valuetext') === line.textContent
            && !!bar.getAttribute('aria-labelledby'),
          covers, z: getComputedStyle(root).zIndex, bg: getComputedStyle(card).backgroundColor === wantBg });
      }
      api.end();
      const t1 = performance.now();
      while (document.querySelector('[data-ob="switch-progress"]') && performance.now() - t1 < 3000) {
        await new Promise((r) => setTimeout(r, 30));
      }
      out.residue = document.querySelectorAll('[data-ob="switch-progress"]').length
        + (document.documentElement.hasAttribute('data-ob-switching') ? 1 : 0);
      return out;
    })()`);
    const bad = (geo.phases ?? []).filter((p) => !p.inViewport || p.clipped.length || !p.text || !p.live
      || !p.bar || !p.covers || p.z !== '70' || !p.bg);
    report.push({
      ok: !geo.err && geo.phases?.length === 4 && !bad.length && geo.residue === 0,
      page,
      what: `switch overlay geometry + a11y + teardown [${locale}]`
        + (geo.err ? ' — ' + geo.err : '')
        + (bad.length ? ' — ' + JSON.stringify(bad) : '')
        + (geo.residue ? ' — residue ' + geo.residue : ''),
      rule: 'build 20 switch overlay: card inside the viewport, no truncation, kit progressbar + polite '
        + 'live phase line in the locale, viewport input shield on the dialog rung, solid glass card, no residue',
    });
  }
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(400);
}

async function auditConfirmDialog(report) {
  for (const locale of GAME_LOCALES) {
    await chrome.eval(`window.__settings.set('language', '${locale}')`);
    await sleep(600);
    const geo = await chrome.eval(`(async () => {
      const { confirmDialog } = await import('./app/ui/dialog.js');
      if (!confirmDialog) return { err: 'confirmDialog export missing' };
      const t = window.__i18n.t;
      const p = confirmDialog({
        title: t('confirm.switchGameTitle'),
        body: t('settings.gameRerackConfirm'),
        confirmLabel: t('confirm.continue'),
        cancelLabel: t('confirm.cancel'),
      });
      const panel = document.querySelector('[data-ob="confirm"]');
      if (!panel) return { err: 'panel never appeared' };
      // let the entrance tween settle (clearProps drops the transform)
      const t0 = performance.now();
      while (getComputedStyle(panel).transform !== 'none'
          && performance.now() - t0 < 1500) {
        await new Promise((r) => setTimeout(r, 30));
      }
      const cs = getComputedStyle(panel);
      const r = panel.getBoundingClientRect();
      const clip = (el) => el.scrollWidth > el.clientWidth + 1;
      const btns = [...panel.querySelectorAll('.ob-confirm__actions button')];
      const bodyEl = panel.querySelector('.ob-confirm__body');
      const out = {
        radius: cs.borderRadius, border: cs.borderTopWidth,
        role: panel.getAttribute('role'),
        modal: panel.getAttribute('aria-modal'),
        backdrop: !!document.querySelector('.ob-backdrop--top'),
        inViewport: r.left >= 0 && r.top >= 0
          && r.right <= innerWidth && r.bottom <= innerHeight,
        bodyFs: getComputedStyle(bodyEl).fontSize,
        btnRadii: btns.map((b) => getComputedStyle(b).borderRadius),
        btnHeights: btns.map((b) => +b.getBoundingClientRect().height.toFixed(2)),
        clipped: [panel.querySelector('.ob-panel__title'), bodyEl, ...btns]
          .filter(clip).map((el) => el.className),
        safeFocus: document.activeElement
          === panel.querySelector('[data-ob="confirm-cancel"]'),
      };
      panel.querySelector('[data-ob="confirm-cancel"]').click();
      out.resolved = await p;
      const t1 = performance.now();
      while (document.querySelector('[data-ob="confirm"]')
          && performance.now() - t1 < 2000) {
        await new Promise((r) => setTimeout(r, 30));
      }
      out.residue = document.querySelectorAll(
        '[data-ob="confirm"], .ob-backdrop--top').length;
      return out;
    })()`);
    report.push({
      ok: !geo.err && geo.radius === '12px' && geo.border === '1px'
        && geo.role === 'alertdialog' && geo.modal === 'true' && geo.backdrop
        && geo.inViewport && geo.bodyFs === '16px'
        && geo.btnRadii.length === 2
        && geo.btnRadii.every((x) => x === '999px')
        && Math.abs(geo.btnHeights[0] - geo.btnHeights[1]) <= 0.5
        && geo.clipped.length === 0 && geo.safeFocus
        && geo.resolved === false && geo.residue === 0,
      page: 'main',
      what: `confirm dialog geometry + a11y + teardown [${locale}]`
        + (geo.err ? ' — ' + geo.err : '')
        + (geo.clipped?.length ? ' — clipped: ' + geo.clipped.join(', ') : ''),
      rule: 'the design charter kit chrome: card-pole dialog, pill actions, no '
        + 'truncation, aria-modal, safe initial focus',
    });
  }
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(400);
  // danger register actually paints (not just a class): the accept button
  // computes the --ob-danger-dim wash and the panel the danger border
  const danger = await chrome.eval(`(async () => {
    const { confirmDialog } = await import('./app/ui/dialog.js');
    const probe = document.createElement('div');
    probe.style.background = 'var(--ob-danger-dim)';
    probe.style.borderTop = '1px solid var(--ob-danger-line)';
    document.body.appendChild(probe);
    const want = getComputedStyle(probe);
    const wantBg = want.backgroundColor;
    const wantLine = want.borderTopColor;
    probe.remove();
    const p = confirmDialog({ title: 'x', body: 'y', danger: true,
      confirmLabel: 'ok', cancelLabel: 'no' });
    const panel = document.querySelector('[data-ob="confirm"]');
    const got = {
      bg: getComputedStyle(
        panel.querySelector('[data-ob="confirm-accept"]')).backgroundColor,
      line: getComputedStyle(panel).borderTopColor,
      wantBg, wantLine,
    };
    panel.querySelector('[data-ob="confirm-cancel"]').click();
    await p;
    return got;
  })()`);
  report.push({
    ok: danger.bg === danger.wantBg && danger.line === danger.wantLine,
    page: 'main',
    what: `confirm danger register paints --ob-danger-dim accept + danger `
      + `border (${danger.bg} vs ${danger.wantBg})`,
    rule: 'the design charter registers: danger reserved for destructive confirms',
  });
}

// ---- issue #36 owner report (2026-07-13): mid-width modal card sweep --------
// The stale-CSS repro exposed a systemic width gap: the #36 verify shot the
// settings modal at 1280 desktop + phone viewports only — the ~700-1100 band
// the owner's 883px window sat in was never probed. This sweep opens the
// modal at 640/720/883/1024 desktop viewports and gates the card grids
// (equipment provenance cards + game catalog cards) on:
//   - zero horizontal overflow on the modal body (#ob-settings-body),
//   - zero text clipping on any card or its text nodes (scrollWidth <=
//     clientWidth: the never-ellipsize law's bare-clip variant) AND a
//     computed white-space that allows wrapping (badges exempt — the card
//     header law pins them nowrap),
//   - zero bounding-box overlap between sibling cards and zero tier-badge
//     rects intersecting a NEIGHBOR card's title rect,
//   - every loaded stylesheet URL carries a ?v= cache-bust param (the pinned
//     root cause: an unversioned settings-modal.css heuristically cached
//     across the D11 card redesign reproduced all three owner symptoms —
//     a fresh-profile sweep alone can never catch a missing ?v=).
// 640 joined 2026-07-14 (verify follow-up): the fresh-profile sweep found
// the ≤~820px desktop band degrading BESIDE the cards — the 320px control
// rail ran the picker-row label + axis badge under the opaque select and
// the two-column card grid letter-stacked titles; settings-modal.css now
// carries a width-keyed narrow-desktop register (contract §2 D12), and the
// probe gates picker-row overflow + label/control overlap alongside cards.
const MID_WIDTHS = [640, 720, 883, 1024];
const MID_CARD_SECTIONS = [
  // (equipment card rows migrated to the atelier — feature 032; the game
  // catalog + rules-variant citation cards migrated to the play place —
  // feature 034; both hosts are viewport-clamped shell surfaces walked in
  // the shell/atelier/play hops.) The modal carries NO card grid any more,
  // so the sweep keeps its D12 PICKER-ROW law alive on the resident
  // sections (selector null = row-only probe: no row h-overflow, no label
  // under its control, no body h-scroll at 640-1024 px)
  ['assists', null],
  ['display', null],
];
const midWidthProbeJs = (selector) => `(() => {
  const body = document.getElementById('ob-settings-body');
  const cards = [...document.querySelectorAll('${selector}')];
  const name = (c) => c.dataset.table ?? c.dataset.game
    ?? c.dataset.variant ?? '?';
  const clip = [], nowrap = [], overlaps = [], badgeHits = [];
  const TEXT_SEL = '.ob-eq-prov-row__pick, .ob-eq-prov-row__name,'
    + ' .ob-eq-prov-row__desc, .ob-eq-prov-row__text,'
    + ' .ob-game-row__name, .ob-game-row__prov';
  for (const card of cards) {
    for (const el of [card, ...card.querySelectorAll(TEXT_SEL)]) {
      if (!el.getClientRects().length) continue; // closed dossier details
      if (el.scrollWidth > el.clientWidth + 1) {
        clip.push(name(card) + ':' + String(el.className || el.tagName)
          .slice(0, 40) + ' +' + (el.scrollWidth - el.clientWidth) + 'px');
      }
      if (el !== card) {
        const ws = getComputedStyle(el).whiteSpace;
        if (ws === 'nowrap' || ws.startsWith('pre')) {
          nowrap.push(name(card) + ':'
            + String(el.className).slice(0, 40) + ' ws=' + ws);
        }
      }
    }
  }
  const hit = (a, b) =>
    Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5
    && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
  for (let i = 0; i < cards.length; i++) {
    const ri = cards[i].getBoundingClientRect();
    for (let j = i + 1; j < cards.length; j++) {
      if (hit(ri, cards[j].getBoundingClientRect())) {
        overlaps.push(name(cards[i]) + ' x ' + name(cards[j]));
      }
    }
  }
  for (const card of cards) {
    const badge = card.querySelector('.ob-badge');
    if (!badge || !badge.getClientRects().length) continue;
    const br = badge.getBoundingClientRect();
    for (const other of cards) {
      if (other === card) continue;
      const title = other.querySelector(
        '.ob-eq-prov-row__name, .ob-game-row__name');
      if (title && hit(br, title.getBoundingClientRect())) {
        badgeHits.push(name(card) + ' badge over ' + name(other) + ' title');
      }
    }
  }
  // picker rows (D12 narrow-desktop register): no row h-overflow, and the
  // label (incl. its axis badge) never runs under the opaque control
  const rows = [...document.querySelectorAll('#ob-settings .ob-set-row')]
    .filter((r) => r.getClientRects().length);
  const rowOver = Math.max(0,
    ...rows.map((r) => r.scrollWidth - r.clientWidth));
  const labelHits = [];
  for (const r of rows) {
    const lab = r.querySelector('label');
    const ctl = r.querySelector('.ob-set-ctl');
    if (!lab || !ctl || !lab.getClientRects().length) continue;
    if (hit(lab.getBoundingClientRect(), ctl.getBoundingClientRect())) {
      labelHits.push((lab.textContent || '?').trim().slice(0, 24));
    }
  }
  return { bodyOverflow: body ? body.scrollWidth - body.clientWidth : -1,
    cards: cards.length, clip, nowrap, overlaps, badgeHits,
    rowOver, labelHits };
})()`;

async function auditModalMidWidths(report) {
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await sleep(500); // motion.enter settle; modal skin link is live by now
  // stylesheet-version law (root-cause pin): heuristic HTTP caching can
  // only poison a URL that never changes — every sheet must carry ?v=
  const sheets = await chrome.eval(
    `[...document.styleSheets].map((s) => s.href).filter((h) => !!h)`);
  const unversioned = sheets.filter((h) => !/[?&]v=/.test(h));
  report.push({
    ok: sheets.length >= 3 && unversioned.length === 0,
    page: 'main',
    what: `every stylesheet URL carries a ?v= cache-bust `
      + `(${sheets.length} sheets incl. the injected modal skin)`
      + (unversioned.length ? ' — unversioned: '
        + unversioned.map((h) => h.split('/').pop()).join(', ') : ''),
    rule: 'ui-kit.md cache-poison CSS addendum: unversioned CSS pinned by '
      + 'the heuristic cache across a DOM redesign (2026-07-13 owner bug)',
  });
  for (const width of MID_WIDTHS) {
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width, height: 800, deviceScaleFactor: 0, mobile: false });
    await sleep(300); // modal min(880px,92vw) relayout
    for (const [sec, selector] of MID_CARD_SECTIONS) {
      await chrome.eval(`window.__settings.show('${sec}')`);
      // issue #118: the equipment axes are collapsible accordion groups —
      // expand the Table group so its provenance-card grid is probed at every
      // mid width (the #36/#81c card-grid protection must cover the tiered
      // layout). Only the Table group carries cards; the visual-only Lighting
      // group's control ROWS stay collapsed (this sweep gates card grids, not
      // the kit slider's internal metrics).
      await chrome.eval(`(() => { const g = document.querySelector(
        '#ob-settings .ob-eq-group[data-eq-group="table_id"]');
        if (g) g.open = true; })()`);
      await sleep(120);
      const p = await chrome.eval(midWidthProbeJs(selector ?? '#ob-settings .ob-set-cards > *'));
      report.push({
        ok: (selector ? p.cards > 0 : true) && p.bodyOverflow <= 0 && !p.clip.length
          && !p.nowrap.length && !p.overlaps.length && !p.badgeHits.length
          && p.rowOver <= 0 && !p.labelHits.length,
        page: 'main',
        what: `settings ${sec} ${selector ? 'cards' : 'rows'} clean @${width}px (${selector ? p.cards + ' cards' : 'row-only probe'})`
          + (p.bodyOverflow > 0 ? ` — body h-overflow ${p.bodyOverflow}px` : '')
          + (p.clip.length ? ' — clipped: ' + p.clip.join('; ') : '')
          + (p.nowrap.length ? ' — unwrappable: ' + p.nowrap.join('; ') : '')
          + (p.overlaps.length ? ' — card overlap: ' + p.overlaps.join('; ') : '')
          + (p.badgeHits.length ? ' — ' + p.badgeHits.join('; ') : '')
          + (p.rowOver > 0 ? ` — picker-row h-overflow ${p.rowOver}px` : '')
          + (p.labelHits.length
            ? ' — label under control: ' + p.labelHits.join('; ') : ''),
        rule: 'mid-width modal sweep (issue #36 owner report): no h-scroll, '
          + 'no bare clipping, text wraps, no sibling-card overlap, picker '
          + 'rows never overflow or run labels under controls (D12)',
      });
    }
  }
  await chrome.send('Emulation.clearDeviceMetricsOverride');
  await sleep(300);
  // 034: never show('game') here — it now CLOSES the modal and opens the
  // shell, so the gear click below would re-open the modal over the shell
  // and the walker composition after this arm would toggle it shut again
  await chrome.eval(`window.__settings.show('assists')`);
  await chrome.eval(`document.getElementById('ob-gear').click()`); // close
  await sleep(400);
}

// ---- feature 012 (T052): smallest-viewport snooker-frame legibility --------
// contracts/render-capacity.md §5: small-viewport snooker legibility is a
// camera-preset obligation gated HERE at the smallest supported viewport.
// No spec pins a number, so this gate pins 1024x600 (smallest common laptop
// class). The 22-ball frame is composed through the render-evidence seam
// (__test.rerackKind — gameplay selection stays behind the US4 readiness
// flips), the full-bed 'top' preset is applied at the small aspect, and
// EVERY ball must project inside the viewport (the preset computes its fov
// from the ACTIVE table dims + camera aspect, camerapresets.js) while the
// toolbar/HUD labels stay untruncated and non-overlapping.
const SMALLEST_VIEWPORT = { width: 1024, height: 600 };
const PROJECT_BALLS = `(() => {
  const cam = window.__dbg?.camera;
  if (!cam) return { err: 'no __dbg.camera' };
  const V = cam.matrixWorldInverse.elements;
  const P = cam.projectionMatrix.elements;
  const mul = (m, v) => [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
    m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3]];
  const balls = window.__test.balls().filter((b) => !b.pocketed);
  const offscreen = [];
  for (const b of balls) {
    const clip = mul(P, mul(V, [b.pos[0], b.pos[1], b.pos[2], 1]));
    const w = clip[3];
    if (!(w > 0) || Math.abs(clip[0] / w) > 1 || Math.abs(clip[1] / w) > 1) {
      offscreen.push(b.id);
    }
  }
  return { n: balls.length, offscreen };
})()`;
// #1216: the projection must read a camera that has caught up with BOTH the
// resize and the preset. Fixed sleeps lose to a GH-1174 compile hold: the
// resize handler defers the resize and the loop renders no frame (so
// matrixWorldInverse stays stale) for up to COMPILE_HOLD_CAP_MS (main.js).
// Each wait samples the camera once per animation frame (a 250 ms fallback
// if no frame comes), bounded by CAMERA_BOUND_MS.
const CAMERA_BOUND_MS = 3000;
const CAMERA_FRAME = `() => new Promise((r) => {
  const t = setTimeout(r, 250);
  requestAnimationFrame(() => { clearTimeout(t); r(); });
})`;
// after the resize: camera.aspect AND the projection matrix's own aspect
// (P[5] / P[0]) equal the viewport's (relative 1e-9)
const CAMERA_ASPECT_WAIT = `(async () => {
  const cam = window.__dbg?.camera;
  if (!cam) return { ok: false, err: 'no __dbg.camera' };
  const frame = ${CAMERA_FRAME};
  const want = ${SMALLEST_VIEWPORT.width} / ${SMALLEST_VIEWPORT.height};
  const near = (a) => Math.abs(a - want) <= 1e-9 * want;
  const read = () => ({ aspect: cam.aspect, pAspect:
    cam.projectionMatrix.elements[5] / cam.projectionMatrix.elements[0] });
  const t0 = performance.now();
  let s = read();
  while (!(near(s.aspect) && near(s.pAspect))
    && performance.now() - t0 < ${CAMERA_BOUND_MS}) {
    await frame();
    s = read();
  }
  return { ok: near(s.aspect) && near(s.pAspect), ...s,
    vw: innerWidth, vh: innerHeight };
})()`;
// setCamera('top'), then: the projection matrix differs from the snapshot
// taken just before the call, the view matrix is FRESH — it inverts the
// camera's own current pose (position, quaternion, scale; parent applied) —
// and both hold still over two consecutive frame intervals (three samples).
// Freshness is load-bearing: the preset's orbit.apply() runs three's lookAt,
// which refreshes matrixWorldInverse from the NEW position and the OLD
// rotation before it sets the new rotation, and only a rendered main frame
// (updateMatrixWorld) completes it. Under a compile hold the view matrix has
// "changed" and holds still while it still looks the old way — the baulk
// half of the bed offscreen (the batch-10 red; a 1.2 s hold armed at
// setCamera reproduces it). A renderer frame counter is no proof: other
// render calls advance it during the hold.
const CAMERA_PRESET_WAIT = `(async () => {
  const cam = window.__dbg?.camera;
  if (!cam) return { ok: false, camOk: null, err: 'no __dbg.camera' };
  const frame = ${CAMERA_FRAME};
  const key = (m) => m.elements.join(',');
  const mul = (a, b) => {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    }
    return o;
  };
  // the camera's world matrix from its pose (three's Matrix4.compose)
  const world = () => {
    const { x, y, z, w } = cam.quaternion, s = cam.scale, q = cam.position;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2;
    const zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    const local = [(1 - (yy + zz)) * s.x, (xy + wz) * s.x, (xz - wy) * s.x, 0,
      (xy - wz) * s.y, (1 - (xx + zz)) * s.y, (yz + wx) * s.y, 0,
      (xz + wy) * s.z, (yz - wx) * s.z, (1 - (xx + yy)) * s.z, 0,
      q.x, q.y, q.z, 1];
    return cam.parent ? mul(cam.parent.matrixWorld.elements, local) : local;
  };
  // fresh: matrixWorldInverse x world(pose) is the identity
  const fresh = () => mul(cam.matrixWorldInverse.elements, world())
    .every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) <= 1e-6);
  const p0 = key(cam.projectionMatrix), v0 = key(cam.matrixWorldInverse);
  const camOk = window.__test.setCamera('top');
  const t0 = performance.now();
  let prev = null, still = 0, pMoved = false, vMoved = false, ok = false;
  while (!ok && performance.now() - t0 < ${CAMERA_BOUND_MS}) {
    await frame();
    const p = key(cam.projectionMatrix), v = key(cam.matrixWorldInverse);
    pMoved = pMoved || p !== p0;
    vMoved = vMoved || v !== v0;
    // the stillness count runs only while the view matrix is fresh
    still = fresh() && p + '|' + v === prev ? still + 1 : 0;
    prev = p + '|' + v;
    ok = pMoved && vMoved && still >= 2;
  }
  return { ok, camOk, pMoved, vMoved, fresh: fresh(), still };
})()`;

async function auditSnookerViewport(report) {
  await chrome.send('Page.navigate',
    { url: `${APP_URL}&arm=snooker-viewport` });
  await waitReady();
  await sleep(800);
  const racked = await chrome.eval(`__test.rerackKind('snooker', 1)`);
  if (racked !== true) {
    report.push({ ok: false, page: 'snooker-viewport',
      what: 'rerackKind(snooker) rejected — 22-ball frame not composable',
      rule: 'render-capacity.md §7: the snooker rack probe must be live' });
    return;
  }
  await sleep(800);
  await chrome.send('Emulation.setDeviceMetricsOverride', {
    width: SMALLEST_VIEWPORT.width, height: SMALLEST_VIEWPORT.height,
    deviceScaleFactor: 0, mobile: false,
  });
  const asp = await chrome.eval(CAMERA_ASPECT_WAIT);
  if (!asp.ok) {
    report.push({ ok: false, page: 'snooker-viewport',
      what: `camera aspect never followed the ${SMALLEST_VIEWPORT.width}x`
        + `${SMALLEST_VIEWPORT.height} resize within ${CAMERA_BOUND_MS} ms`
        + ` (aspect ${asp.aspect}, projection aspect ${asp.pAspect},`
        + ` viewport ${asp.vw}x${asp.vh}` + (asp.err ? `, ${asp.err}` : '') + ')',
      rule: 'render-capacity.md §5: the gate measures the camera it resized' });
  }
  const pre = await chrome.eval(CAMERA_PRESET_WAIT);
  const camOk = pre.camOk;
  if (!pre.ok) {
    report.push({ ok: false, page: 'snooker-viewport',
      what: `camera never took the 'top' preset within ${CAMERA_BOUND_MS} ms`
        + ` (projection changed: ${pre.pMoved}, view changed: ${pre.vMoved},`
        + ` view fresh: ${pre.fresh}, still samples: ${pre.still}`
        + (pre.err ? `, ${pre.err}` : '') + ')',
      rule: 'render-capacity.md §5: the gate measures the preset it applied' });
  }
  const proj = await chrome.eval(PROJECT_BALLS);
  report.push({
    ok: camOk === true && proj.n === 22 && proj.offscreen?.length === 0,
    page: 'snooker-viewport',
    what: `full 22-ball snooker frame inside ${SMALLEST_VIEWPORT.width}x`
      + `${SMALLEST_VIEWPORT.height} on the 'top' preset (${proj.n} balls`
      + (proj.offscreen?.length ? `, offscreen: ${proj.offscreen}` : '')
      + (proj.err ? `, ${proj.err}` : '')
      + (camOk === true ? '' : `, setCamera returned ${camOk}`) + ')',
    rule: 'render-capacity.md §5: smallest-viewport snooker legibility '
      + '(camera preset frames the full 12-ft bed)' });
  const bad = await chrome.eval(TRUNC_WALKER);
  report.push({ ok: !bad.length, page: 'snooker-viewport',
    what: 'no truncated control labels at the smallest viewport'
      + (bad.length ? ' — truncated: ' + bad.join(', ') : ''),
    rule: 'control labels never ellipsize (e2e-ui --audit law)' });
  const geo = await chrome.eval(`(() => {
    const tb = document.getElementById('ob-toolbar');
    const hud = document.getElementById('hud');
    if (!tb || !hud || !tb.children.length) return 'skip';
    const t = tb.getBoundingClientRect(), h = hud.getBoundingClientRect();
    return t.bottom <= h.top + 1 ? 'ok'
      : 'toolbar bottom ' + t.bottom + ' overlaps hud top ' + h.top;
  })()`);
  report.push({ ok: geo === 'ok' || geo === 'skip', page: 'snooker-viewport',
    what: 'toolbar clear of HUD panel at the smallest viewport'
      + (geo === 'ok' || geo === 'skip' ? '' : ' — ' + geo),
    rule: 'the design charter toolbar law at the smallest supported viewport' });
  await chrome.send('Emulation.clearDeviceMetricsOverride');
}

// ---- GH-316: SCORE-GROWTH arm ----------------------------------------------
// The blind spot that shipped the owner's clipped "P2 · 45" (build 15):
// every audit composition above builds its chips ONCE and never grows a
// value after the initial layout, so a crop line that only lands inside a
// chip once a score gains a digit was invisible to the whole wall. This arm
// drives the REAL score pipeline (the __rules staging seams → aim.js
// hudState push → hud.js chip re-render) through zero → grown → maximum
// registers per discipline × locale × device class, RE-LAYOUTS after each
// growth, and asserts the GH-316 law:
//   (1) no HUD badge ever paints PARTIALLY clipped by the strip box
//       (whole-chip law — a badge paints complete or not at all);
//   (2) the ACTIVE player's score/point chip stays FULLY visible at the
//       audited profiles (the ladder's last badge standing) and the idle
//       player's chip is whole too except where the slot cannot
//       geometrically hold both (de one-pocket) — there it yields WHOLE
//       (.ob-band-drop), never as a partial clip;
//   (3) with the snooker colour nomination armed (the owner's exact
//       cluster: state pill + score chips + fixed "Nominated:" pill on
//       phone), no badge slides under the pill.
// Device classes: desktop (runAudit) and the 852×393 coarse+notch phone
// profile of the owner report (runPhoneAudit). Locales: en + the two
// widest-growth stressors the issue names (de prefixes scores with 'S',
// zh-CN spells the player word out).
// Red-proven on the pre-fix tree: snooker [de/zh-CN too] fails (1)+(2) at
// 852×393 — the P2 chip crosses the #hud crop edge exactly like the
// owner's screenshot.
const SCORE_GROWTH_LOCALES = ['en', 'de', 'zh-CN'];
const SCORE_GROWTH_DISCIPLINES = [
  {
    name: 'snooker',
    stage: `window.__rules.activateSnooker()`,
    // arm the aim-lane colour nomination — the phone register then carries
    // the fixed corner pill (hud.js renderCall {kind:'nominate'})
    arm: `(window.__aim?.selectCallBall?.(21), true)`,
    steps: [
      { tag: 'zero', js: `window.__rules.setMatchState({
        phase: 'colour_after_red', ballOn: 'nominated_colour', shooter: 2,
        scores: { 1: 0, 2: 0 }, currentBreak: 0 })`,
      chips: [{ key: 'snooker.score', args: { player: 1, points: 0 } },
        { key: 'snooker.score', args: { player: 2, points: 0 } }] },
      { tag: 'grown', js: `window.__rules.setMatchState({
        scores: { 1: 0, 2: 45 }, currentBreak: 45 })`,
      chips: [{ key: 'snooker.score', args: { player: 1, points: 0 } },
        { key: 'snooker.score', args: { player: 2, points: 45 } }] },
      { tag: 'max', js: `window.__rules.setMatchState({
        scores: { 1: 147, 2: 147 }, currentBreak: 147 })`,
      chips: [{ key: 'snooker.score', args: { player: 1, points: 147 } },
        { key: 'snooker.score', args: { player: 2, points: 147 } }] },
    ],
  },
  {
    name: 'eight_ball',
    stage: `window.__rules.setGame('eight_ball')`,
    steps: [
      { tag: 'zero', js: `window.__rules.setMatchState({
        phase: 'play', shooter: 2, groups: null,
        onTable: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] })`,
      chips: [{ key: 'match.playerOpen', args: { player: 1 } },
        { key: 'match.playerOpen', args: { player: 2 } }] },
      // the 8-ball growth register: open → assigned (chip copy grows)
      { tag: 'grown', js: `window.__rules.setMatchState({
        groups: { 1: 'solids', 2: 'stripes' },
        onTable: [1, 2, 3, 8, 9, 10, 11] })`,
      chips: [
        { key: 'match.playerGroup', args: { player: 1, group: '@match.solids' } },
        { key: 'match.playerGroup', args: { player: 2, group: '@match.stripes' } }] },
      { tag: 'max', js: `window.__rules.setMatchState({
        groups: { 1: 'solids', 2: 'stripes' }, onTable: [1, 2, 3, 8] })`,
      chips: [
        { key: 'match.playerGroup', args: { player: 1, group: '@match.solids' } },
        { key: 'match.playerOnEight', args: { player: 2 } }] },
    ],
  },
  {
    name: 'one_pocket',
    stage: `window.__rules.setGameForTest('one_pocket', 'onepocket-v1')`,
    steps: [
      { tag: 'zero', js: `window.__rules.setMatchState({
        phase: 'play', shooter: 2, pockets: { 1: 2, 2: 5 }, target: 8,
        tallies: { 1: 0, 2: 0 }, owed: { 1: 0, 2: 0 },
        consecutiveFouls: { 1: 0, 2: 0 } })`,
      chips: [
        { key: 'onepocket.playerPocket',
          args: { player: 1, pocket: '@call.pocket.footLeft', tally: 0, target: 8 } },
        { key: 'onepocket.playerPocket',
          args: { player: 2, pocket: '@call.pocket.footRight', tally: 0, target: 8 } }] },
      { tag: 'grown', js: `window.__rules.setMatchState({
        tallies: { 1: 3, 2: 8 }, owed: { 1: 0, 2: 2 },
        consecutiveFouls: { 1: 0, 2: 2 } })`,
      chips: [
        { key: 'onepocket.playerPocket',
          args: { player: 1, pocket: '@call.pocket.footLeft', tally: 3, target: 8 } },
        { key: 'onepocket.playerPocket',
          args: { player: 2, pocket: '@call.pocket.footRight', tally: 8, target: 8 } }] },
      // the widest legal spread: both tallies + owed markers + foul streaks
      // (six chips — the squeeze-ladder stressor)
      { tag: 'max', js: `window.__rules.setMatchState({
        tallies: { 1: 8, 2: 8 }, owed: { 1: 11, 2: 12 },
        consecutiveFouls: { 1: 2, 2: 2 } })`,
      chips: [
        { key: 'onepocket.playerPocket',
          args: { player: 1, pocket: '@call.pocket.footLeft', tally: 8, target: 8 } },
        { key: 'onepocket.playerPocket',
          args: { player: 2, pocket: '@call.pocket.footRight', tally: 8, target: 8 } }] },
    ],
  },
  {
    name: 'straight_pool',
    stage: `window.__rules.setGame('straight_pool')`,
    steps: [
      { tag: 'zero', js: `window.__rules.setMatchState({
        phase: 'play', shooter: 2, scores: { 1: 0, 2: 0 }, run: 0,
        rackCount: 1, target: 100, consecutiveFouls: { 1: 0, 2: 0 } })`,
      chips: [
        { key: 'fourteenone.score', args: { player: 1, points: 0, target: 100 } },
        { key: 'fourteenone.score', args: { player: 2, points: 0, target: 100 } }] },
      { tag: 'grown', js: `window.__rules.setMatchState({
        scores: { 1: 9, 2: 45 }, run: 45, rackCount: 4 })`,
      chips: [
        { key: 'fourteenone.score', args: { player: 1, points: 9, target: 100 } },
        { key: 'fourteenone.score', args: { player: 2, points: 45, target: 100 } }] },
      { tag: 'max', js: `window.__rules.setMatchState({
        scores: { 1: 126, 2: 147 }, run: 100, rackCount: 12,
        consecutiveFouls: { 1: 2, 2: 1 } })`,
      chips: [
        { key: 'fourteenone.score', args: { player: 1, points: 126, target: 100 } },
        { key: 'fourteenone.score', args: { player: 2, points: 147, target: 100 } }] },
    ],
  },
  {
    // feature 026 (GH-343): the 10-ball chip strip — rotation target,
    // the 6.4 push-out window chip, and the 3.13 foul-streak squeeze
    name: 'ten_ball',
    stage: `window.__rules.setGame('ten_ball')`,
    steps: [
      { tag: 'zero', js: `window.__rules.setMatchState({
        phase: 'play', shooter: 1, onTable: [1,2,3,4,5,6,7,8,9,10],
        consecutiveFouls: { 1: 0, 2: 0 } })`,
      chips: [
        { key: 'match.playerOpen', args: { player: 1 } },
        { key: 'tenball.target', args: { ball: 1 } }] },
      { tag: 'grown', js: `window.__rules.setMatchState({
        phase: 'pushout', shooter: 2, onTable: [7,8,9,10],
        consecutiveFouls: { 1: 1, 2: 0 } })`,
      chips: [
        { key: 'match.playerOpen', args: { player: 2 } },
        { key: 'tenball.target', args: { ball: 7 } }] },
      // the widest legal spread: both foul streaks at two (the 3.13
      // warning surface) + the window chip — the squeeze-ladder stressor.
      // The foul chips are WARN-class badges (sanctioned GH-316 ladder
      // casualties), so the must-survive spec lists only the SCORE-TRUTH
      // chips: the shooter chip + the rotation target.
      { tag: 'max', js: `window.__rules.setMatchState({
        phase: 'pushout', shooter: 2, onTable: [10],
        consecutiveFouls: { 1: 2, 2: 2 } })`,
      chips: [
        { key: 'match.playerOpen', args: { player: 2 } },
        { key: 'tenball.target', args: { ball: 10 } }] },
    ],
  },
  {
    name: 'carom_3cushion',
    stage: `window.__rules.setGame('carom_3cushion')`,
    steps: [
      { tag: 'zero', js: `window.__rules.caromSetMatchState({
        stage: 'play', shooter: 2, points: { 1: 0, 2: 0 }, innings: 0,
        cushionsThisShot: 0 })`,
      chips: [{ key: 'carom.points', args: { player: 1, points: 0 } },
        { key: 'carom.points', args: { player: 2, points: 0 } }] },
      { tag: 'grown', js: `window.__rules.caromSetMatchState({
        points: { 1: 9, 2: 48 }, innings: 33, cushionsThisShot: 3 })`,
      chips: [{ key: 'carom.points', args: { player: 1, points: 9 } },
        { key: 'carom.points', args: { player: 2, points: 48 } }] },
      { tag: 'max', js: `window.__rules.caromSetMatchState({
        points: { 1: 38, 2: 40 }, innings: 61, cushionsThisShot: 3 })`,
      chips: [{ key: 'carom.points', args: { player: 1, points: 38 } },
        { key: 'carom.points', args: { player: 2, points: 40 } }] },
    ],
  },
];
// One eval per step: the whole-chip law over every painted badge under
// #hud, the named score chips' whole-visibility, and the pill-clearance
// check (phone: #hud-call.on is position:fixed; desktop pill is in-flow
// and skips the check). '@key' args resolve through the live t() so the
// asserted copy is the locale's real string, never a re-baked literal.
const SCORE_GROWTH_PROBE_JS = (chipSpecs) => `(() => {
  const hud = document.getElementById('hud');
  if (!hud || !window.__i18n?.t) return { err: '#hud or i18n missing' };
  const h = hud.getBoundingClientRect();
  const name = (el) => (el.id ? '#' + el.id
    : (el.textContent || '').slice(0, 28));
  // fixed surfaces inside #hud (band-S action strip, the call pill) live
  // outside the strip's box by design — exclude badges under them
  const inFixed = (el) => {
    for (let n = el; n && n !== hud; n = n.parentElement) {
      if (getComputedStyle(n).position === 'fixed') return true;
    }
    return false;
  };
  const painted = [...hud.querySelectorAll('.ob-badge')].filter((el) =>
    !inFixed(el) && el.getClientRects().length);
  const clipped = painted.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.right > h.right + 0.5 || r.left < h.left - 0.5;
  }).map(name);
  const t = window.__i18n.t;
  const missing = [];
  for (const spec of ${JSON.stringify(chipSpecs)}) {
    const args = Object.fromEntries(Object.entries(spec.args).map(([k, v]) =>
      [k, typeof v === 'string' && v.startsWith('@') ? t(v.slice(1)) : v]));
    const text = t(spec.key, args);
    // every staging shapes shooter=2, so player 2's chip is the ACTIVE
    // (accent) register — the ladder's last badge standing; the idle
    // player's chip may yield WHOLE (.ob-band-drop) where the slot cannot
    // geometrically hold both (the de one-pocket ~240px pocket/tally
    // pair), but a partial clip is the defect class for either.
    const role = spec.args.player === 2 ? 'active' : 'partner';
    // GH-538: prefer a PAINTED text match — several disciplines render
    // byte-identical chip copy (ten-ball and heyball both speak
    // match.playerOpen, "P{player}" in en/de/ko), so a first-in-document
    // match could land on another strip's chip and misread the live chip's
    // paint state (the six false ten_ball 852x393 en/de rows: heyball's
    // then-stale hidden clones shadowed the painted truth chips; hud.js
    // now clears hidden strips, and this probe measures the chip the
    // active discipline actually painted either way). A genuine drop has
    // NO painted candidate and falls through to the unpainted one — the
    // dropped/hidden classification below is unchanged.
    const cands = [...hud.querySelectorAll('.ob-badge')]
      .filter((b) => b.textContent === text);
    const el = cands.find((b) => b.getClientRects().length) ?? cands[0];
    if (!el) { missing.push(text + ' (not rendered)'); continue; }
    if (!el.getClientRects().length) {
      if (role === 'partner' && el.classList.contains('ob-band-drop')) {
        continue; // sanctioned whole-drop of the idle player's chip
      }
      missing.push(text + ' (dropped/hidden)'); continue;
    }
    const r = el.getBoundingClientRect();
    if (r.right > h.right + 0.5 || r.left < h.left - 0.5) {
      missing.push(text + ' (partially clipped)');
    }
  }
  const pill = document.querySelector('#hud-call.on');
  const pillPainted = !!pill && pill.getClientRects().length > 0;
  let underPill = [];
  if (pillPainted && getComputedStyle(pill).position === 'fixed') {
    const p = pill.getBoundingClientRect();
    underPill = painted.filter((el) => {
      const r = el.getBoundingClientRect();
      return Math.min(r.right, p.right) - Math.max(r.left, p.left) > 0.5
        && Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top) > 0.5;
    }).map(name);
  }
  return { clipped, missing, underPill, pillPainted, painted: painted.length };
})()`;

/** Drive the score-growth registers on the CURRENT page (desktop from
 * runAudit, the 852×393 coarse profile from runPhoneAudit) and push the
 * GH-316 assertions. Restores nine_ball + en before returning. */
async function auditScoreGrowth(report, device) {
  const push = (page, ok, what, rule) => report.push({ page, ok, what, rule });
  const pushClass = (page, cls, arr, rule) => push(page, !arr.length,
    `${cls}${arr.length ? ' — ' + arr.join('; ') : ''}`, rule);
  try {
    for (const d of SCORE_GROWTH_DISCIPLINES) {
      const page = `score-growth ${device} ${d.name}`;
      const staged = await chrome.eval(d.stage);
      if (staged !== true) {
        push(page, false, `discipline staging refused (${d.stage.trim()})`,
          'GH-316 score-growth arm: every discipline\'s chips are covered');
        continue;
      }
      await sleep(900); // re-rack + table rebuild settle
      for (const locale of SCORE_GROWTH_LOCALES) {
        await chrome.eval(`window.__settings.set('language', '${locale}')`);
        await sleep(500);
        for (const step of d.steps) {
          const ok = await chrome.eval(step.js);
          if (ok !== true) {
            push(`${page} [${locale}]`, false,
              `match-state staging refused at '${step.tag}'`,
              'GH-316 score-growth arm staging seam');
            break;
          }
          if (step.tag === 'zero' && d.arm) {
            await sleep(400); // aim.js derives the nomination from the fold
            await chrome.eval(d.arm);
          }
          // aim.js pushes the projection on its frame loop; the touch.js
          // band-fit pass runs one rAF later — settle both before probing
          await sleep(450);
          const f = await chrome.eval(SCORE_GROWTH_PROBE_JS(step.chips));
          const lp = `${page} [${locale}] ${step.tag}`;
          if (f.err) {
            push(lp, false, `probe unavailable — ${f.err}`,
              'GH-316 score-growth arm');
            continue;
          }
          pushClass(lp, 'no badge partially clipped after the re-layout',
            f.clipped,
            'GH-316 whole-chip law: a HUD badge paints complete or not at all');
          pushClass(lp, 'both players\' score chips painted whole',
            f.missing,
            'GH-316: score truth is the last chip the squeeze ladder may touch');
          if (d.arm) {
            // review r2 P2: without this presence gate a regressed call
            // render (or a no-op selectCallBall seam) nulls the pill and
            // the clearance leg below passes VACUOUSLY — the arm must
            // prove clearance against a really-armed, really-painted pill
            push(lp, f.pillPainted === true,
              'armed call pill composed and painted',
              'GH-316 arm: pill clearance must never pass vacuously');
          }
          pushClass(lp, 'no badge under the armed call pill',
            f.underPill,
            'touch.css §3.11: chips never slide under the pill');
        }
      }
    }
  } finally {
    await chrome.eval(`window.__rules.setGame('nine_ball')`).catch(() => {});
    await chrome.eval(`window.__settings.set('language', 'en')`).catch(() => {});
    await sleep(600);
  }
}

// ---- GH-360: the 10-ball push-out FIRE-strip button (phone arm) -------------
// The WPA 6.4 stance's phone surface is the touchwidgets #ob-push-btn pill
// on the FIRE strip (it replaced the GH-343 picker footer row — recorded
// disposition in touchwidgets.js). Per phone viewport: the STAGED open
// window (ten_ball, phase 'pushout') shows the button — geometry beside
// FIRE, the full walker classes × 7 locales, the a11y name (t('call.push'))
// + aria-pressed, click-toggle behavior with the desktop #aw-push armed
// tokens — and the SAME state at phase 'play' hides it (red-proof staging:
// a gate that never saw the closed register would pass an always-on
// button). The picker sheet must carry NO push row (single source of
// truth). Runs like auditScoreGrowth: after the base walkers so the
// discipline staging cannot leak into them; restores nine_ball + en.
async function auditPushoutStrip(report) {
  const push = (page, ok, what, rule) => report.push({ page, ok, what, rule });
  const pushClass = (page, cls, arr, rule) => push(page, !arr.length,
    `${cls}${arr.length ? ' — ' + arr.join('; ') : ''}`, rule);
  const poll = async (js, tries = 30, ms = 150) => {
    for (let i = 0; i < tries; i++) {
      if (await chrome.eval(js) === true) return true;
      await sleep(ms);
    }
    return false;
  };
  const BTN_JS = `(() => {
    const el = document.getElementById('ob-push-btn');
    if (!el) return { found: false };
    const visible = el.getClientRects().length > 0
      && getComputedStyle(el).visibility !== 'hidden';
    const r = el.getBoundingClientRect();
    return { found: true, visible, x: r.x, y: r.y, w: r.width, h: r.height,
      cy: r.y + r.height / 2, label: el.textContent,
      pressed: el.getAttribute('aria-pressed') };
  })()`;
  const stageMs = (phase) => `window.__rules.setMatchState(${JSON.stringify({
    phase, shooter: 2, breaker: 1, onTable: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    consecutiveFouls: { 1: 0, 2: 0 }, pendingDecision: null,
    foulContext: null, result: null })})`;
  // opens the picker via the status-strip indicator and reads the push
  // row's per-register truth (visibility, geometry, label, visible footer)
  const PICKER_PUSH_JS = `(async () => {
    if (window.__aim?.nominationRequired?.() !== true) {
      return { state: 'no-nomination' };
    }
    document.getElementById('hud-call')?.click?.();
    await new Promise((r) => setTimeout(r, 700));
    const sheet = document.getElementById('ob-pocket-picker');
    if (!sheet || !sheet.getClientRects().length) return { state: 'no-sheet' };
    const vis = (el) => !!el && el.getClientRects().length > 0;
    const row = document.getElementById('ob-picker-push');
    const r = row && vis(row) ? row.getBoundingClientRect() : null;
    return { state: 'open',
      rowVisible: vis(row),
      rowMin: r ? Math.min(r.width, r.height) : 0,
      rowLabel: row ? row.textContent : null,
      rowWant: window.__i18n.t('call.push'),
      footVisible: [...sheet.querySelectorAll('.ob-picker-foot button')]
        .filter(vis).map((b) => b.id) };
  })()`;
  try {
    const staged = await chrome.eval(`window.__rules.setGame('ten_ball')`);
    push('pushout phone', staged === true,
      'ten_ball staged for the push-out strip arm',
      'GH-360: the 6.4 window surface must be measurable');
    if (staged !== true) return;
    await sleep(900); // re-rack + table rebuild settle
    for (const [w, h] of PHONE_VIEWPORTS) {
      const page = `pushout phone ${w}x${h}`;
      await setPhoneMetrics(chrome, { width: w, height: h });
      await sleep(600);

      // OPEN window → the button is present beside FIRE
      push(page, await chrome.eval(stageMs('pushout')) === true,
        "phase 'pushout' staged", 'GH-360 staging seam');
      push(page, await poll(`window.__aim?.pushAvailable?.() === true`),
        'aim lane reports the 6.4 window open (pushAvailable)',
        'spec 026 §6.4: nomination.pushout drives the affordance');
      push(page, await poll(`(${BTN_JS}).visible === true`),
        'push button visible while the window is open',
        'GH-360: first-class FIRE-strip affordance (phone)');
      const geo = await chrome.eval(`(() => {
        const b = ${BTN_JS};
        const f = document.getElementById('shoot')?.getBoundingClientRect();
        return { b, fire: f ? { x: f.x, cy: f.y + f.height / 2 } : null };
      })()`);
      push(page, !!geo.fire && geo.b.visible === true
        && Math.min(geo.b.w, geo.b.h) >= 43.5
        && geo.b.x + geo.b.w <= geo.fire.x + 0.5
        && Math.abs(geo.b.cy - geo.fire.cy) <= 2,
      `button ≥44pt immediately LEFT of FIRE, centered on its band `
        + `(${JSON.stringify(geo)})`,
      'GH-360 geometry: 48px pill vertically centered on the 64px FIRE');

      // a11y name + walker classes × 7 locales (button visible)
      for (const locale of GAME_LOCALES) {
        await chrome.eval(`window.__settings.set('language', '${locale}')`);
        await sleep(450);
        const a11y = await chrome.eval(`(() => {
          const b = ${BTN_JS};
          return { ...b, want: window.__i18n.t('call.push') };
        })()`);
        push(`${page} [${locale}]`, a11y.visible === true
          && a11y.label === a11y.want && a11y.label.trim().length > 0
          && (a11y.pressed === 'true' || a11y.pressed === 'false'),
        `a11y name = t('call.push') + aria-pressed stated `
          + `(${JSON.stringify({ label: a11y.label, want: a11y.want,
            pressed: a11y.pressed })})`,
        'GH-360: i18n ×7 (call.push reused) + toggle-button semantics');
        const f = await chrome.eval(phoneWalkerJs(w, h));
        pushClass(`${page} [${locale}]`,
          'walker classes with the push button live '
          + '(tap/containment/occlusion/safe-area/truncation)',
          [...f.tap, ...f.contain, ...f.occlude, ...f.safe, ...f.trunc],
          'touch-e2e.md §4.1 classes over the GH-360 surface');
      }
      await chrome.eval(`window.__settings.set('language', 'en')`);
      await sleep(400);

      // toggle behavior + the desktop #aw-push armed tokens
      const toggled = await chrome.eval(`(() => {
        const el = document.getElementById('ob-push-btn');
        el.click();
        return { call: window.__aim.call()?.kind ?? null };
      })()`);
      push(page, toggled.call === 'push',
        `click arms the push out (call kind '${toggled.call}')`,
        'GH-360: the __aim.togglePush seam (desktop #aw-push parity)');
      // pressed + accent read in ONE eval, polled to the SETTLED armed
      // register: aria-pressed follows call() on the frame loop (the
      // signature-gated sync), so split reads can straddle a frame — a
      // real regression (armed never reaches the accent) still times out
      const ARMED_JS = `(() => {
        const el = document.getElementById('ob-push-btn');
        const probe = document.createElement('div');
        probe.style.background = 'var(--ob-accent-dim)';
        document.body.appendChild(probe);
        const want = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { pressed: el.getAttribute('aria-pressed'),
          got: getComputedStyle(el).backgroundColor, want };
      })()`;
      push(page, await poll(`(() => { const a = ${ARMED_JS};
        return a.pressed === 'true' && a.got === a.want; })()`),
      `armed register settles: aria-pressed=true with the --ob-accent-dim `
        + `fill, the desktop #aw-push tokens `
        + `(${JSON.stringify(await chrome.eval(ARMED_JS))})`,
      'GH-360: pressed tracks call().kind; one affordance across device '
        + 'classes (tokens-only law)');
      const untoggled = await chrome.eval(`(() => {
        document.getElementById('ob-push-btn').click();
        return { call: window.__aim.call() };
      })()`);
      push(page, untoggled.call === null,
        're-click disarms (call cleared)',
        'GH-360: toggle law (desktop #aw-push parity)');
      push(page, await poll(`(${BTN_JS}).pressed === 'false'`),
        'disarmed button reflects aria-pressed=false',
        'GH-360: pressed state tracks call().kind');

      // PHONE register, window still OPEN: the strip button is THE surface
      // — the picker sheet's GH-343 row stays hidden even while
      // pushAvailable (review r1: the row survives as the tablet/stale-
      // sheet fallback, so the law is per-register visibility, never
      // element absence)
      const picker = await chrome.eval(PICKER_PUSH_JS);
      push(page, picker.state === 'open' && picker.rowVisible === false
        && picker.footVisible.join(',') === 'ob-picker-safety,ob-picker-close',
      `picker row HIDDEN at phone width while the window is open; visible `
        + `footer = safety/close (${JSON.stringify(picker)})`,
      'GH-360: exactly one push-out surface per register (phone = strip)');
      if (picker.state === 'open') {
        await pressKey('Escape', 'Escape', 27);
        await sleep(400);
      }

      // RED-PROOF register: the SAME staging at phase 'play' → ABSENT
      push(page, await chrome.eval(stageMs('play')) === true,
        "phase 'play' staged (red-proof twin)", 'GH-360 staging seam');
      push(page, await poll(`(${BTN_JS}).visible !== true`),
        "button ABSENT at phase 'play' (window closed)",
        'spec 026 §6.4: the affordance exists exactly in the window');
    }

    // TABLET register (coarse ≥1024, review r1 P1): the §6 relaxation keeps
    // the desktop HUD (no fixed FIRE strip) and GH-225 hides #aimw/#aw-push
    // — the GH-343 picker row IS this register's push-out surface. Without
    // this leg the row removal shipped a tablet with NO way to declare the
    // 6.4 stance.
    {
      const page = 'pushout tablet 1024x768';
      await setPhoneMetrics(chrome, { width: 1024, height: 768 });
      await sleep(600);
      push(page, await chrome.eval(stageMs('pushout')) === true,
        "phase 'pushout' staged", 'GH-360 staging seam');
      push(page, await poll(`window.__aim?.pushAvailable?.() === true`),
        'aim lane reports the 6.4 window open (pushAvailable)',
        'spec 026 §6.4');
      await sleep(400); // a settle beat: the strip button must STAY hidden
      push(page, await chrome.eval(`(${BTN_JS}).visible !== true`),
        'FIRE-strip button never shows at coarse ≥1024 (desktop-HUD register)',
        'review r1 P1: no fixed FIRE strip to join at the tablet relaxation');
      const tp = await chrome.eval(PICKER_PUSH_JS);
      push(page, tp.state === 'open' && tp.rowVisible === true
        && tp.rowMin >= 43.5 && tp.rowLabel === tp.rowWant,
      `picker row VISIBLE ≥44pt with t('call.push') on the open tablet `
        + `window (${JSON.stringify(tp)})`,
      'review r1 P1: the GH-343 row is the tablet push-out surface');
      if (tp.state === 'open') {
        const armed = await chrome.eval(`(() => {
          document.getElementById('ob-picker-push').click();
          return window.__aim.call()?.kind ?? null;
        })()`);
        push(page, armed === 'push',
          `picker row click arms the push out (call kind '${armed}')`,
          'GH-360: same __aim.togglePush seam on every register');
        await sleep(500); // row click closes the sheet (GH-343 behavior)
        const re = await chrome.eval(`(async () => {
          document.getElementById('hud-call')?.click?.();
          await new Promise((r) => setTimeout(r, 700));
          const row = document.getElementById('ob-picker-push');
          return { pressed: row?.getAttribute('aria-pressed') ?? null };
        })()`);
        push(page, re.pressed === 'true',
          'reopened sheet renders the armed row (aria-pressed=true)',
          'GH-360: fillPicker re-reads call() at open');
        await chrome.eval(
          `document.getElementById('ob-picker-push').click(); true`);
        push(page, await poll('window.__aim.call() === null'),
          'row re-click disarms (call cleared)',
          'GH-360: toggle law on the fallback register');

        // review r2 P2: a register change WHILE the sheet is open must
        // hand the stance over live — reopen at tablet (row visible),
        // shrink to phone width mid-open: the row hides and the strip
        // button takes over without a reopen. The row click above closed
        // the sheet through the dialog exit motion (#170: teardown can
        // land late) — reopen only after the CONFIRMED close.
        await poll(`(() => {
          const s = document.getElementById('ob-pocket-picker');
          return !s || s.getClientRects().length === 0;
        })()`);
        await sleep(300);
        const reopened = await chrome.eval(PICKER_PUSH_JS);
        push(page, reopened.state === 'open' && reopened.rowVisible === true,
          `sheet reopened at tablet with the row visible (flip `
          + `precondition) (${JSON.stringify(reopened)})`,
          'review r2 P2 arm staging');
        if (reopened.state === 'open') {
          await setPhoneMetrics(chrome, { width: 844, height: 390 });
          await sleep(600);
          push(page, await poll(`(() => {
            const row = document.getElementById('ob-picker-push');
            const rowHidden = !row || row.getClientRects().length === 0;
            return rowHidden && (${BTN_JS}).visible === true;
          })()`),
          'mid-open shrink to phone: row hides, strip button takes over '
            + 'without reopening',
          'review r2 P2: register flips never strand the stance with zero '
            + 'or two surfaces');
          await pressKey('Escape', 'Escape', 27);
          await sleep(400);
        }
      }

      // GH-394: an AVAILABILITY flip WHILE the sheet is open must re-render
      // the fallback row on this register too. At coarse ≥1024
      // stripUsable() is permanently false, so the strip's `show` term is
      // pinned — pre-fix the `${show}|${armed}` resync signature never
      // moved when the 6.4 window opened or closed under an OPEN sheet,
      // and the row froze stale in BOTH directions. Reopen at tablet (the
      // r2 P2 arm above left phone metrics + a closing sheet), then flip
      // the phase under the OPEN sheet both ways. Every poll requires the
      // sheet STILL open, so a staging path that closed the sheet fails
      // loudly instead of passing the hidden-row arm vacuously.
      await setPhoneMetrics(chrome, { width: 1024, height: 768 });
      await sleep(600);
      await poll(`(() => {
        const s = document.getElementById('ob-pocket-picker');
        return !s || s.getClientRects().length === 0;
      })()`); // #170: the prior arm's Escape teardown can land late
      push(page, await chrome.eval(stageMs('pushout')) === true,
        "phase 'pushout' re-staged (GH-394 arm)", 'GH-360 staging seam');
      push(page, await poll(`window.__aim?.pushAvailable?.() === true`),
        'aim lane reports the 6.4 window open again (pushAvailable)',
        'spec 026 §6.4');
      const g394 = await chrome.eval(PICKER_PUSH_JS);
      push(page, g394.state === 'open' && g394.rowVisible === true,
        `sheet open at tablet with the row visible (GH-394 flip `
        + `precondition) (${JSON.stringify(g394)})`,
        'GH-394 arm staging');
      if (g394.state === 'open') {
        // direction 1: the window CLOSES under the open sheet → row hides
        push(page, await chrome.eval(stageMs('play')) === true,
          "phase 'play' staged mid-open", 'GH-360 staging seam');
        push(page, await poll(`window.__aim?.pushAvailable?.() !== true`),
          'aim lane reports the 6.4 window closed (pushAvailable false)',
          'spec 026 §6.4');
        push(page, await poll(`(() => {
          const s = document.getElementById('ob-pocket-picker');
          if (!s || s.getClientRects().length === 0) return false;
          const row = document.getElementById('ob-picker-push');
          return !row || row.getClientRects().length === 0;
        })()`),
        'mid-open window close: the row hides WITHOUT reopening the sheet',
        'GH-394: the resync signature carries the row\'s own avail term '
          + 'on registers where stripUsable() is pinned false');
        // direction 2 gets its OWN genuine-red staging: close the sheet,
        // reopen it while the window is CLOSED (fillPicker renders the row
        // hidden), then flip the window OPEN under the open sheet → the
        // row appears. (Flipping open right after direction 1 on the same
        // sheet would pass VACUOUSLY pre-fix: the stale row never hid, so
        // a visible-row check cannot tell stale from re-rendered — the
        // red probe proved exactly that.)
        await pressKey('Escape', 'Escape', 27);
        await poll(`(() => {
          const s = document.getElementById('ob-pocket-picker');
          return !s || s.getClientRects().length === 0;
        })()`); // #170: dialog teardown can land late
        await sleep(300);
        const closedOpen = await chrome.eval(PICKER_PUSH_JS);
        push(page, closedOpen.state === 'open'
          && closedOpen.rowVisible === false,
        `sheet reopened at phase 'play' with the row hidden (direction-2 `
          + `precondition) (${JSON.stringify(closedOpen)})`,
        'GH-394 arm staging: fillPicker renders the closed window at open');
        push(page, await chrome.eval(stageMs('pushout')) === true,
          "phase 'pushout' staged mid-open (reverse)",
          'GH-360 staging seam');
        push(page, await poll(`window.__aim?.pushAvailable?.() === true`),
          'aim lane reports the 6.4 window reopened (pushAvailable)',
          'spec 026 §6.4');
        push(page, await poll(`(() => {
          const s = document.getElementById('ob-pocket-picker');
          if (!s || s.getClientRects().length === 0) return false;
          const row = document.getElementById('ob-picker-push');
          return !!row && row.getClientRects().length > 0;
        })()`),
        'mid-open window open: the row appears WITHOUT reopening the sheet',
        'GH-394: availability flips edge the signature in both directions');
        // armed honesty mid-open (aria-pressed rides the same resync):
        // arm through the seam — the row CLICK closes the sheet (GH-343),
        // which would break the mid-open framing
        await chrome.eval(`window.__aim?.togglePush?.(); true`);
        push(page, await poll(`document.getElementById('ob-picker-push')`
          + `?.getAttribute('aria-pressed') === 'true'`),
        'mid-open arm via the seam: the OPEN row re-renders '
          + 'aria-pressed=true',
        'GH-394: the armed stance stays honest on the open sheet');
        await chrome.eval(`window.__aim?.togglePush?.(); true`);
        push(page, await poll(`document.getElementById('ob-picker-push')`
          + `?.getAttribute('aria-pressed') === 'false'`),
        'mid-open disarm: aria-pressed returns to false',
        'GH-394: toggle law under the open sheet');
        await pressKey('Escape', 'Escape', 27);
        await sleep(400);
      }
      await chrome.eval(stageMs('play'));
      await sleep(300);
    }
  } finally {
    await chrome.eval(`window.__rules.setGame('nine_ball')`).catch(() => {});
    await chrome.eval(`window.__settings.set('language', 'en')`).catch(() => {});
    await sleep(600);
  }
}

// ---- feature 014 (T013): phone-viewport audit walker ------------------------
// contracts/touch-e2e.md §4.1 — ADDITIVE to the truncation walker and printed
// strictly AFTER the desktop report + its summary line, so the desktop
// section stays BYTE-STABLE for the SC-002 compare (slice the report at the
// marker line below). Phone viewports × 7 locales over the touch surfaces;
// new assertion classes: containment (no fixed chrome outside the visual
// viewport), occlusion (no interactive control overlapped), tap-target
// floor (≥44 pt), safe-area compliance under notch emulation, plus the
// truncation/overflow law and the portrait rotate prompt.
const PHONE_MARKER = '[e2e-ui audit] ---- phone section (014-ios-touch-mode T013) ----';
const PHONE_VIEWPORTS = [[844, 390], [667, 375], [926, 428]];
/** The fold-law verdict of one foldsnap-probe result as walker `bad`
 * lines (rest-0: no atom straddles the clip edge; a clipping scroller
 * ends on a boundary; the first block whole). */
const foldBad = (L) => {
  if (!L) return ['scroller not presented'];
  const bad = [];
  if (L.cutBot.length) bad.push('the fold cuts a glyph at rest: ' + L.cutBot.slice(0, 3).join(', '));
  if (L.overflow > 0 && L.nearestBot > 1.5) bad.push('the fold sits ' + L.nearestBot.toFixed(1) + ' px off any text-line / block boundary');
  if (L.peekPx != null && L.overflow > 0 && L.peekPx < -0.5) bad.push('the first block is cut by ' + (-L.peekPx).toFixed(1) + ' px');
  return bad;
};
const PHONE_SA = { top: 0, left: 47, right: 47, bottom: 21 };

// One eval per (viewport, locale, scope): returns per-class offender lists.
// Scope: window.__auditRoot (set by the driver around popup/drawer/decision
// sweeps) restricts tap/occlusion/truncation; containment + safe-area are
// always global (fixed chrome is global by nature).
const phoneWalkerJs = (w, h) => `(() => {
  const rootEl = (window.__auditRoot && document.contains(window.__auditRoot))
    ? window.__auditRoot : document;
  const vis = (el) => el.getClientRects().length > 0
    && getComputedStyle(el).visibility !== 'hidden';
  const name = (el) => el.id ? '#' + el.id
    : el.tagName.toLowerCase() + (el.dataset && el.dataset.i18n
      ? '[' + el.dataset.i18n + ']'
      : '.' + String(el.className).split(' ')[0].slice(0, 24));
  const out = { tap: [], contain: [], occlude: [], safe: [], trunc: [] };
  const controls = [...rootEl.querySelectorAll(
    'button, [role=button], a[href], input, select, summary')]
    .filter((el) => vis(el) && !el.disabled);
  for (const el of controls) {
    // kit-upgraded natives are measured by their interactive wrapper
    const box = el.closest(
      '.ob-toggle, .ob-segmented, [data-ob=select-button], label') ?? el;
    const r = box.getBoundingClientRect();
    if (Math.min(r.width, r.height) < 43.5) {
      out.tap.push(name(el) + ' ' + r.width.toFixed(0) + 'x' + r.height.toFixed(0));
    }
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx >= 0 && cy >= 0 && cx < ${w} && cy < ${h}) {
      const hit = document.elementFromPoint(cx, cy);
      const okHit = hit && (el.contains(hit) || hit.contains(el)
        || box.contains(hit) || hit.contains(box)
        || (el.closest('label') && el.closest('label').contains(hit)));
      if (!okHit) {
        out.occlude.push(name(el) + ' covered by ' + (hit ? name(hit) : 'nothing'));
      }
    }
    let anc = box;
    let fixed = false;
    while (anc && anc !== document.body && anc.nodeType === 1) {
      if (getComputedStyle(anc).position === 'fixed') { fixed = true; break; }
      anc = anc.parentElement;
    }
    if (fixed && (r.left < ${PHONE_SA.left} - 1
        || r.right > ${w - PHONE_SA.right} + 1
        || r.top < ${PHONE_SA.top} - 1
        || r.bottom > ${h - PHONE_SA.bottom} + 1)) {
      out.safe.push(name(el) + ' [' + r.left.toFixed(0) + ',' + r.top.toFixed(0)
        + ',' + r.right.toFixed(0) + ',' + r.bottom.toFixed(0) + ']');
    }
  }
  for (const el of [...document.querySelectorAll('body *')]) {
    if (!vis(el) || getComputedStyle(el).position !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.left < -1 || r.top < -1 || r.right > ${w} + 1 || r.bottom > ${h} + 1) {
      out.contain.push(name(el) + ' [' + r.left.toFixed(0) + ','
        + r.top.toFixed(0) + ',' + r.right.toFixed(0) + ','
        + r.bottom.toFixed(0) + ']');
    }
  }
  for (const el of [...rootEl.querySelectorAll(
      'button, label, [data-i18n], .ob-badge')]) {
    if (!vis(el)) continue;
    if (el.scrollWidth > el.clientWidth + 1
        || el.scrollHeight > el.clientHeight + 1) {
      out.trunc.push(name(el));
    }
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].slice(0, 8);
  return out;
})()`;

// ---- issue #81 lane A: phone top-band contract arm (touch.css §3.11) --------
// The phone's fixed top chrome (toolbar cluster, status strip, call pill,
// warn chip, banner, hint, mode/playground chips, drill strip, power
// readout, #err card) must obey the band contract: ZERO pairwise
// intersection of VISIBLE rects (bounding boxes clipped by overflow
// ancestors — the status strip legally crops its chip row at the slot
// edge), every interactive member hit-testable (elementFromPoint returns
// it, not a covering sibling) and on the ≥44 pt floor — asserted on the
// coarse registers × en/de/ja. This is the arm that would have caught the
// entire #81 lane-A finding set (recorded frozen-driver deviation,
// the ownership ledger band-contract note). Issue #144 adds the PLAYFIELD-OCCLUSION
// dimension to the drill compositions (DRILL_FELT_JS below).
const BAND_SET = ['#ob-toolbar', '#hud', '#hud-call.on', '#ob-aimw-warn.on',
  '#banner', '#hud-hint', '#ob-mode-chips.on', '#ob-drill-chips.on',
  '#ob-mode-ind.on', // GH-156: the band-T mode indicator (read-only badge)
  '#ob-drill-dock.on', // issue #120: the drills icon dock (right-column rail)
  // ('#ob-record-dock.on' left the set in GH-225 Phase D — the record dock
  //  is retired, and with it the whole touch.css §3.12 retreat block)
  // build-4 QA: the §3.5 gauge RAIL + its LABEL join the set (the readout
  // alone was blind to the badge-over-label / strip-over-rail majors —
  // the m/s box rides mid-rail, never near band S), and the spin disc
  // joins so a wrapped band-X hint can never clip it again. The rail's
  // children (label/readout) pair with everything EXCEPT the rail itself
  // (ancestor-skip), which is exactly the contract shape.
  '.ob-touchw-gauge', '.ob-touchw-gauge-label', '#ob-spin-btn',
  '.ob-touchw-gauge-readout', '#err',
  '#ob-share-toast']; // GH-1023: the share toast joins band X on a phone
const BAND_PROBE_JS = `(() => {
  const vis = (el) => el && el.getClientRects().length > 0
    && getComputedStyle(el).visibility !== 'hidden';
  // visible rect: the bounding box intersected with every overflow-clipping
  // ancestor UP TO the nearest fixed-position box (a fixed box's containing
  // block is the viewport — ancestors beyond it do not clip it)
  const visRect = (el) => {
    const r = el.getBoundingClientRect();
    const rect = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    let cur = el;
    while (cur && cur !== document.body) {
      if (getComputedStyle(cur).position === 'fixed') break;
      const p = cur.parentElement;
      if (!p || p === document.body) break;
      const cs = getComputedStyle(p);
      if (/(hidden|clip|scroll|auto)/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
        const pr = p.getBoundingClientRect();
        rect.l = Math.max(rect.l, pr.left); rect.t = Math.max(rect.t, pr.top);
        rect.r = Math.min(rect.r, pr.right); rect.b = Math.min(rect.b, pr.bottom);
      }
      cur = p;
    }
    return rect;
  };
  const boxes = [];
  for (const sel of ${JSON.stringify(BAND_SET)}) {
    const el = document.querySelector(sel);
    if (!el || !vis(el)) continue;
    boxes.push({ sel, el, rect: visRect(el) });
  }
  const out = { present: boxes.map((b) => b.sel),
    overlap: [], dead: [], small: [] };
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      // ancestor/descendant pairs contain each other by construction (the
      // call pill and chip strips are #hud children); the contract binds
      // INDEPENDENT surfaces
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ox = Math.min(a.rect.r, b.rect.r) - Math.max(a.rect.l, b.rect.l);
      const oy = Math.min(a.rect.b, b.rect.b) - Math.max(a.rect.t, b.rect.t);
      if (ox > 0.5 && oy > 0.5) {
        out.overlap.push(a.sel + ' × ' + b.sel + ' '
          + ox.toFixed(1) + 'x' + oy.toFixed(1) + 'px');
      }
    }
  }
  const interactive = [
    ...document.querySelectorAll('#ob-toolbar > *'),
    // #120 retired the in-strip drill buttons ('#ob-drill-chips button' is
    // a dead selector — the strip is status-only badges; #144 makes it
    // pointer-inert again, probed by DRILL_FELT_JS)
    ...document.querySelectorAll('#ob-mode-chips button'),
    ...document.querySelectorAll('#ob-drill-dock button'), // #120 dock rail
    ...document.querySelectorAll('#hud-call.on, #err-x'),
  ];
  for (const el of interactive) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    const name = el.id ? '#' + el.id : el.tagName.toLowerCase();
    if (Math.min(r.width, r.height) < 43.5) {
      out.small.push(name + ' ' + r.width.toFixed(0) + 'x' + r.height.toFixed(0));
    }
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) {
      out.dead.push(name + ' hit='
        + (hit ? (hit.id ? '#' + hit.id : hit.tagName.toLowerCase()) : 'none'));
    }
  }
  return out;
})()`;
// issue #144 — PLAYFIELD-OCCLUSION dimension (additive to the band arm):
// read-only drill status chrome must never sit over the game. The felt's
// screen rect derives HONESTLY from the scene/aim seam (recorded choice):
// the kernel pocket centers (window.__rules.pockets(), flow.js) projected
// to CSS px at ball height via window.__tp.projectK (touch-cdp.mjs
// PAGE_HELPERS_JS; camera from window.__dbg, set unconditionally by
// main.js) — chosen over cushion-nose corners because the pocket seam is
// already a shipped read surface and its bbox UNDER-covers the felt
// polygon (pocket centers sit at the rail line), i.e. it is a conservative
// core, never an over-claim. FELT_MARGIN = 24px (recorded decision) shrinks
// the bbox to the slim edge allowance: a strip hugging the table's screen
// edge may overhang the outer 24px, never the core. The probe also asserts
// the #81a pointer-inert law (a tap at the strip's visible center falls
// through — elementFromPoint never resolves into the strip). Red-proven on
// the pre-#144 tree: the band-S left-anchored stack sat at y 112..130
// INSIDE the felt (top ≈ 97..101 at 844x390/667x375, 110.9 at 926x428) and
// elementFromPoint resolved to the strip's own badge span.
const FELT_MARGIN = 24;
const DRILL_FELT_JS = `(() => {
  const el = document.querySelector('#ob-drill-chips.on');
  if (!el || !el.getClientRects().length) return { err: 'strip not visible' };
  if (!window.__tp || typeof window.__rules?.pockets !== 'function') {
    return { err: 'felt seams missing (__tp / __rules.pockets)' };
  }
  let f = null;
  for (const p of window.__rules.pockets()) {
    const s = window.__tp.projectK(p.x, p.y, 0.03);
    if (!s) continue;
    f = f ? { l: Math.min(f.l, s.x), t: Math.min(f.t, s.y),
      r: Math.max(f.r, s.x), b: Math.max(f.b, s.y) }
      : { l: s.x, t: s.y, r: s.x, b: s.y };
  }
  if (!f) return { err: 'felt rect unprojectable (camera seam)' };
  // visible rect: the BAND_PROBE_JS clipping walk (overflow ancestors up
  // to the nearest fixed box — #hud legally crops the strip at its slot
  // edge, and only the VISIBLE remainder is held to the occlusion law)
  const r0 = el.getBoundingClientRect();
  const rect = { l: r0.left, t: r0.top, r: r0.right, b: r0.bottom };
  let cur = el;
  while (cur && cur !== document.body) {
    if (getComputedStyle(cur).position === 'fixed') break;
    const p = cur.parentElement;
    if (!p || p === document.body) break;
    const cs = getComputedStyle(p);
    if (/(hidden|clip|scroll|auto)/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
      const pr = p.getBoundingClientRect();
      rect.l = Math.max(rect.l, pr.left); rect.t = Math.max(rect.t, pr.top);
      rect.r = Math.min(rect.r, pr.right); rect.b = Math.min(rect.b, pr.bottom);
    }
    cur = p;
  }
  const rnd = (o) => Object.fromEntries(Object.entries(o)
    .map(([k, v]) => [k, Math.round(v)]));
  const core = { l: f.l + ${FELT_MARGIN}, t: f.t + ${FELT_MARGIN},
    r: f.r - ${FELT_MARGIN}, b: f.b - ${FELT_MARGIN} };
  const out = { occl: [], eat: [] };
  const ox = Math.min(rect.r, core.r) - Math.max(rect.l, core.l);
  const oy = Math.min(rect.b, core.b) - Math.max(rect.t, core.t);
  if (ox > 0.5 && oy > 0.5 && rect.r > rect.l && rect.b > rect.t) {
    out.occl.push('strip ' + JSON.stringify(rnd(rect)) + ' x felt-core '
      + JSON.stringify(rnd(core)) + ' by ' + ox.toFixed(1) + 'x'
      + oy.toFixed(1) + 'px');
  }
  if (rect.r > rect.l && rect.b > rect.t) {
    const cx = (Math.max(rect.l, 0) + Math.min(rect.r, innerWidth)) / 2;
    const cy = (Math.max(rect.t, 0) + Math.min(rect.b, innerHeight)) / 2;
    const hit = document.elementFromPoint(cx, cy);
    if (hit && (el.contains(hit) || hit.closest('#ob-drill-chips'))) {
      out.eat.push('strip eats the tap at (' + cx.toFixed(0) + ','
        + cy.toFixed(0) + ') hit=' + (hit.id ? '#' + hit.id
        : hit.tagName.toLowerCase()));
    }
  }
  return out;
})()`;
// GH-156 (chrome diet) — the MODE indicator joins the playfield-occlusion
// dimension: the read-only badge moved from the band-S strip (where it led
// the action chips at (54,60), directly below the help pill and over the
// felt — the owner-flagged defect) into the band-T center span under the
// GH-144 read-only law. Same derivation as DRILL_FELT_JS (kernel pocket
// bbox via __tp.projectK, 24px edge margin, #hud crop walk) + the #81a
// pointer-inert law. Red-proven by re-staging the pre-diet register (the
// indicator forced to the band-S strip top at 667x375: felt intrusion +
// the tap resolving into the badge).
const MODE_FELT_JS = `(() => {
  const el = document.querySelector('#ob-mode-ind.on');
  if (!el || !el.getClientRects().length) return { err: 'indicator not visible' };
  if (!window.__tp || typeof window.__rules?.pockets !== 'function') {
    return { err: 'felt seams missing (__tp / __rules.pockets)' };
  }
  let f = null;
  for (const p of window.__rules.pockets()) {
    const s = window.__tp.projectK(p.x, p.y, 0.03);
    if (!s) continue;
    f = f ? { l: Math.min(f.l, s.x), t: Math.min(f.t, s.y),
      r: Math.max(f.r, s.x), b: Math.max(f.b, s.y) }
      : { l: s.x, t: s.y, r: s.x, b: s.y };
  }
  if (!f) return { err: 'felt rect unprojectable (camera seam)' };
  const r0 = el.getBoundingClientRect();
  const rect = { l: r0.left, t: r0.top, r: r0.right, b: r0.bottom };
  let cur = el;
  while (cur && cur !== document.body) {
    if (getComputedStyle(cur).position === 'fixed') break;
    const p = cur.parentElement;
    if (!p || p === document.body) break;
    const cs = getComputedStyle(p);
    if (/(hidden|clip|scroll|auto)/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
      const pr = p.getBoundingClientRect();
      rect.l = Math.max(rect.l, pr.left); rect.t = Math.max(rect.t, pr.top);
      rect.r = Math.min(rect.r, pr.right); rect.b = Math.min(rect.b, pr.bottom);
    }
    cur = p;
  }
  const rnd = (o) => Object.fromEntries(Object.entries(o)
    .map(([k, v]) => [k, Math.round(v)]));
  const core = { l: f.l + ${FELT_MARGIN}, t: f.t + ${FELT_MARGIN},
    r: f.r - ${FELT_MARGIN}, b: f.b - ${FELT_MARGIN} };
  const out = { occl: [], eat: [] };
  const ox = Math.min(rect.r, core.r) - Math.max(rect.l, core.l);
  const oy = Math.min(rect.b, core.b) - Math.max(rect.t, core.t);
  if (ox > 0.5 && oy > 0.5 && rect.r > rect.l && rect.b > rect.t) {
    out.occl.push('indicator ' + JSON.stringify(rnd(rect)) + ' x felt-core '
      + JSON.stringify(rnd(core)) + ' by ' + ox.toFixed(1) + 'x'
      + oy.toFixed(1) + 'px');
  }
  if (rect.r > rect.l && rect.b > rect.t) {
    const cx = (Math.max(rect.l, 0) + Math.min(rect.r, innerWidth)) / 2;
    const cy = (Math.max(rect.t, 0) + Math.min(rect.b, innerHeight)) / 2;
    const hit = document.elementFromPoint(cx, cy);
    if (hit && (el.contains(hit) || hit.closest('#ob-mode-ind'))) {
      out.eat.push('indicator eats the tap at (' + cx.toFixed(0) + ','
        + cy.toFixed(0) + ') hit=' + (hit.id ? '#' + hit.id
        : hit.tagName.toLowerCase()));
    }
  }
  return out;
})()`;
// GH-156 review MAJOR — the crop-ORDER leg (chrome-diet SPEC §3 collapse
// rule 1). aim.js's hud.setMatch has no mode gating, so 8-ball group /
// snooker ball-on chips legally coexist with the mode indicator in
// playground/practice — and the band-T single-ended crop (safe center +
// overflow: hidden) must drop the badge BEFORE any game-state member.
// Compose the widest standing rules register (assigned 8-ball groups, live
// locale copy) at the DOM presentation layer (the BAND_FORCE_JS
// convention — geometry, not rules), then pin the order: the indicator is
// the row's LAST paint member (CSS order, then DOM position), the
// geometric rightmost, and — when the composition overflows the slot —
// never survives a clipped game-state chip. Red-proven on the wave-1 tree
// (f84aa51c): flow.js's afterend-of-#rack insert left the DOM
// [..#ob-mode-ind..#hud-match..], so the badge painted mid-row and the
// crop dropped the group chips first.
const MODE_CROP_FORCE_JS = `(() => {
  const t = window.__i18n.t;
  const g = document.getElementById('hud-groups');
  const m = document.getElementById('hud-match');
  if (!g || !m) return false;
  if (!('obAuditDisp' in m.dataset)) m.dataset.obAuditDisp = m.style.display;
  m.style.display = 'block';
  const mk = (txt, cls) => {
    const el = document.createElement('span');
    el.className = 'ob-badge' + (cls ? ' ' + cls : '');
    el.dataset.obAudit = '1';
    el.textContent = txt;
    return el;
  };
  g.append(
    mk(t('match.playerGroup', { player: 1, group: t('match.solids') }),
      'ob-badge--accent'),
    mk(t('match.playerGroup', { player: 2, group: t('match.stripes') })));
  return true;
})()`;
const MODE_CROP_UNFORCE_JS = `(() => {
  const m = document.getElementById('hud-match');
  for (const el of document.querySelectorAll('#hud-groups [data-ob-audit]')) {
    el.remove();
  }
  if (m && 'obAuditDisp' in m.dataset) {
    m.style.display = m.dataset.obAuditDisp;
    delete m.dataset.obAuditDisp;
  }
  return true;
})()`;
const MODE_CROP_ORDER_JS = `(() => {
  const hud = document.getElementById('hud');
  if (!hud) return { err: '#hud missing' };
  // GH-316: the band-fit pass may legally DROP the indicator whole
  // (.ob-band-drop, display: none) — that IS collapse rule 1's first
  // casualty in the whole-chip register, not a missing composition, so the
  // presence gate reads the .on class instead of painted rects.
  const ind = document.querySelector('#ob-mode-ind.on');
  if (!ind) return { err: 'indicator not composed' };
  const indDropped = ind.classList.contains('ob-band-drop')
    || !ind.getClientRects().length;
  // honesty guard: the forced match-chip composition must actually be in
  // the row (hud.js's onLocaleChange relabel pass — async dict fetch —
  // re-runs renderMatch over the null matchShown and can wipe the forced
  // state if it lands late; the harness re-forces once on this signal)
  const matchEl = document.getElementById('hud-match');
  const matchComposed = !!matchEl
    && document.querySelectorAll('#hud-groups [data-ob-audit]').length >= 2;
  if (!matchComposed) return { err: 'match chips not composed' };
  const kids = [...hud.children];
  const row = kids.filter((el) => {
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.display !== 'contents'
      && cs.position !== 'fixed' && el.getClientRects().length > 0;
  });
  // flex paint order: CSS order, then DOM position (the crop is the
  // reverse — the row's LAST member is the first casualty)
  const key = (el) => (Number(getComputedStyle(el).order) || 0) * 10000
    + kids.indexOf(el);
  row.sort((a, b) => key(a) - key(b));
  const name = (el) => '#' + (el.id || el.tagName.toLowerCase());
  const h = hud.getBoundingClientRect();
  const indR = indDropped ? null : ind.getBoundingClientRect();
  // GH-316 no-partial-clip law: NO painted badge may cross the strip's
  // crop edge (the pre-316 probe tolerated any clip as long as the badge
  // order was right — that glyph-blind crop is the owner's "P2 · 45" cut).
  // Fixed surfaces inside #hud (the band-S #ob-mode-chips strip, the
  // #hud-call pill) live OUTSIDE the strip's box by design — badges under
  // a fixed ancestor never join the clip test.
  const inFixed = (el) => {
    for (let n = el; n && n !== hud; n = n.parentElement) {
      if (getComputedStyle(n).position === 'fixed') return true;
    }
    return false;
  };
  const badges = [...hud.querySelectorAll('.ob-badge')].filter((el) =>
    !inFixed(el) && el.getClientRects().length);
  const clipped = badges.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.right > h.right + 0.5 || r.left < h.left - 0.5;
  });
  // priority inversion: a game-truth badge dropped whole while the mode
  // badge still paints (collapse rule 1: the indicator falls FIRST)
  const truthDropped = [...hud.querySelectorAll('.ob-badge.ob-band-drop')]
    .filter((el) => el !== ind).map(name);
  return {
    order: row.map(name),
    indDropped,
    lastIsInd: indDropped || row[row.length - 1] === ind,
    rightmost: indDropped || badges.every((el) => el === ind
      || el.getBoundingClientRect().right <= indR.right + 0.5),
    clippedBadges: clipped.map(name),
    truthDroppedWhileIndWhole: !indDropped ? truthDropped : [],
  };
})()`;
// transient composition: the maximal legal coexistence (post-foul re-aim:
// fading foul banner + #88 wrong-ball chip + rejection hint + an armed
// call pill), forced at the DOM presentation layer with the LIVE locale
// copy — a geometry sweep, not a rules test (e2e-snooker/e2e-8ball own the
// state machinery). Restored exactly after each register.
const BAND_FORCE_JS = `(() => {
  const t = window.__i18n.t;
  const b = document.getElementById('banner');
  b.textContent = t('flow.foulBanner', { reason: t('flow.foulFallback') });
  b.style.display = 'block';
  const w = document.getElementById('ob-aimw-warn');
  if (w) { w.textContent = t('aim.wrongBallWarn'); w.classList.add('on'); }
  const h = document.getElementById('hud-hint');
  h.textContent = t('playground.undoBlocked'); h.style.display = 'block';
  const c = document.getElementById('hud-call');
  if (c) {
    // build-4 QA: the WIDEST real pill register (the snooker
    // nominate-required copy, hud.js renderCall), not the short
    // t('call.required') — the §3.11 slot-cap retreat was verified against
    // copy that never reached the --ob-corner-r cap, so the content-box
    // +26px overhang (the pill sliding back over the status-strip chips)
    // was invisible to this composition. The long copy BINDS the cap in
    // en/de/ja and wraps inside it (≤3 lines ≤ 64px — the pill budget the
    // now-retired §3.12 record-dock slot was sized against; the budget
    // stands on its own, the dock that motivated it does not).
    // GH-463: the live pill copy is register-aware (mouse click / touch
    // tap) — paint what the active register really paints (tp seam;
    // feature-detected for pre-463 graphs).
    const tr = window.__i18n.tp ?? t;
    c.textContent = tr('snooker.nominateHint'); c.classList.add('on');
    const m = document.getElementById('hud-match');
    if (m && !('obAuditDisp' in m.dataset)) {
      m.dataset.obAuditDisp = m.style.display; m.style.display = 'block';
    }
  }
  // GH-225 Phase D: the forced __record.start(false) is GONE. It existed
  // only to raise the record dock's RECORDING register into the maximal
  // composition (issue #139); the dock is retired, so the force painted
  // nothing and the §3.12 retreats it exercised no longer exist. The
  // composition still carries banner + warn + hint + the widest call pill,
  // which is what the band contract is actually about.
  return true;
})()`;
const BAND_UNFORCE_JS = `(() => {
  const b = document.getElementById('banner');
  b.style.display = 'none'; b.textContent = '';
  const w = document.getElementById('ob-aimw-warn');
  if (w) { w.classList.remove('on'); w.textContent = ''; }
  const h = document.getElementById('hud-hint');
  h.style.display = 'none'; h.textContent = '';
  const c = document.getElementById('hud-call');
  if (c) {
    c.classList.remove('on'); c.textContent = '';
    const m = document.getElementById('hud-match');
    if (m && 'obAuditDisp' in m.dataset) {
      m.style.display = m.dataset.obAuditDisp; delete m.dataset.obAuditDisp;
    }
  }
  return true;
})()`;
// drill-complete composition (issue #81 lanes A×B reconciliation): the
// DRILL-COMPLETE banner is a DISTINCT surface from the generic banner
// BAND_FORCE_JS composes — drills.js marks #banner with .ob-drills-banner for
// the completion hold, and drills.css bottom-parks THAT banner on coarse
// landscape. Pre-reconciliation it collided with the band-x+112 #hud-hint on
// ≤430px-tall landscape (banner [240,303] × hint [233,275] — e2e-drills arm
// 13 caught it, but this wall only ever composed the generic top-band banner
// and missed it). Compose the completion banner (class + live completeBanner
// copy) alongside a displayed reason hint so a future band regression against
// THIS surface is caught by the audit wall too. The reconciliation (touch.css
// §3.11 yield: html.ob-touch:has(.ob-drills-banner) #hud-hint collapses on
// short landscape) drops the hint from the visible set — no overlap.
const BAND_DRILL_DONE_FORCE_JS = `(() => {
  const t = window.__i18n.t;
  const b = document.getElementById('banner');
  b.textContent = t('drills.completeBanner',
    { name: t('drills.name.circle'), score: 1, max: 1 });
  b.classList.add('ob-drills-banner');
  b.style.display = 'block';
  const h = document.getElementById('hud-hint');
  h.textContent = t('drills.newBest'); h.style.display = 'block';
  return true;
})()`;
const BAND_DRILL_DONE_UNFORCE_JS = `(() => {
  const b = document.getElementById('banner');
  b.classList.remove('ob-drills-banner');
  b.style.display = 'none'; b.textContent = '';
  const h = document.getElementById('hud-hint');
  h.style.display = 'none'; h.textContent = '';
  return true;
})()`;
// build-4 QA: the WORST playground composition — the GH-140 5-chip strip
// (snap chip present) + the GH-139 record dock in its RECORDING register
// (the §3.12 68px cap that wraps the de/ja strip at 667x375) + a REAL
// cited foul banner + the warn chip. This is the composition the QA wave
// proved the shipped audit could never see: the wrapped strip's row-2
// chip inherited app.html's `#hud button{flex:1 1 auto}` and stretched to
// a full-width pointer-opaque bar over the felt (drags dead across the
// band holding the default rack), the one-row band-S reservation let the
// banner paint through row 2, and the strip container covered the gauge
// rail/label. The banner copy is the REAL cited judgment string (3 lines
// in de at 375-class widths), not the one-line flow.foulFallback the
// generic composition forces — the #81 lanes were sized from the forced
// copy and real copy crossed them. Presentation-layer force, restored
// exactly (the BAND_FORCE_JS doctrine).
const WORST_FORCE_JS = `(() => {
  const t = window.__i18n.t;
  const b = document.getElementById('banner');
  b.textContent = t('flow.foulBanner',
    { reason: t('foul.wrong-first-ball') + ' (WPA 3.2 via 4.4/4.9)' });
  b.style.display = 'block';
  const w = document.getElementById('ob-aimw-warn');
  if (w) { w.textContent = t('aim.wrongBallWarn'); w.classList.add('on'); }
  // (the §3.12 recording-register force left with the dock — GH-225 Phase D)
  return true;
})()`;
const WORST_UNFORCE_JS = `(() => {
  const b = document.getElementById('banner');
  b.style.display = 'none'; b.textContent = '';
  const w = document.getElementById('ob-aimw-warn');
  if (w) { w.classList.remove('on'); w.textContent = ''; }
  return true;
})()`;
// strip discipline probe for the worst composition: the snap chip keeps
// its INTRINSIC width (computed flex-grow 0 — red on the app.html flex
// leak: '1' and a 583px full-width bar), and when the strip legally wraps,
// ball drags survive BESIDE the row-2 chip — a probe point in row 2's
// y-band 40px right of the chip (historically capped clear of the §3.12
// dock column; that column is gone, the probe point is unchanged)
// must hit the renderer canvas, red when the stretched bar eats it.
const WORST_STRIP_JS = `(() => {
  const strip = document.getElementById('ob-mode-chips');
  const snap = document.getElementById('ob-mode-snap');
  if (!strip || !strip.classList.contains('on') || !snap
    || !snap.getClientRects().length) {
    return { err: 'playground strip / snap chip not composed' };
  }
  const r = snap.getBoundingClientRect();
  const sr = strip.getBoundingClientRect();
  const out = { flexGrow: getComputedStyle(snap).flexGrow,
    w: +r.width.toFixed(1), stripH: +sr.height.toFixed(1),
    rows2: r.top - sr.top > 40 };
  if (out.rows2) {
    const px = Math.min(r.right + 40, innerWidth - 130);
    const py = r.top + r.height / 2;
    const hit = document.elementFromPoint(px, py);
    out.hit = hit ? (hit.id ? '#' + hit.id : hit.tagName.toLowerCase()) : 'none';
    out.reach = !!hit && hit.tagName === 'CANVAS';
    out.probe = [Math.round(px), Math.round(py)];
  }
  return out;
})()`;
// §3.11 pill slot-cap probe (build-4 QA, drill composition — the pill is
// armed there with the widest real copy): the pill's PAINTED box stays
// inside the --ob-corner-r cap (red on the content-box register: cap +
// 24px padding + 2px border) and clears the status strip's crop edge
// (red: the last chip slid 4.5–18px under the pill glass).
const PILL_RETREAT_JS = `(() => {
  const pill = document.querySelector('#hud-call.on');
  const hud = document.getElementById('hud');
  if (!pill || !pill.getClientRects().length || !hud) {
    return { err: 'call pill not armed' };
  }
  const p = pill.getBoundingClientRect();
  const h = hud.getBoundingClientRect();
  return { w: +p.width.toFixed(1),
    cap: +parseFloat(getComputedStyle(pill).maxWidth).toFixed(1),
    gap: +(p.left - h.right).toFixed(1) };
})()`;
// GH-156 review-fix hardening: hud.js's onLocaleChange relabel pass rides
// the ASYNC dict fetch — when it lands after BAND_FORCE_JS it re-runs
// renderMatch/renderCall over the null matchShown/callShown and wipes the
// forced pill (matchEl display 'none' + .on stripped; observed once at
// 926x428 de/ja during the crop-order red run). The re-arm sets the
// display DIRECTLY: BAND_FORCE_JS's dataset guard deliberately skips it
// when obAuditDisp is already captured, so re-running the force alone
// cannot recover.
const PILL_REARM_JS = `(() => {
  const t = window.__i18n.t;
  const c = document.getElementById('hud-call');
  if (!c) return false;
  // GH-463: register-aware pill copy (see BAND_FORCE_JS)
  c.textContent = (window.__i18n.tp ?? t)('snooker.nominateHint');
  c.classList.add('on');
  const m = document.getElementById('hud-match');
  if (m) {
    if (!('obAuditDisp' in m.dataset)) m.dataset.obAuditDisp = m.style.display;
    m.style.display = 'block';
  }
  return true;
})()`;
// play-mode transient leg (build-4 QA): the REAL foul re-entry coexistence
// — 3-line cited de/ja banner + warn chip + the 2-line snooker rejection
// hint — at the PLAY-mode band-x (no strips, the shortest stack). Red on
// the fixed #81 lane split: the banner crossed the warn (+76) and hint
// (+112) lanes, and the wrapped hint clipped the gauge readout and the
// spin disc at 667x375. Green under the content-aware lanes + the hint
// corner-column clearance cap.
const PLAY_FORCE_JS = `(() => {
  const t = window.__i18n.t;
  const b = document.getElementById('banner');
  b.textContent = t('flow.foulBanner',
    { reason: t('foul.wrong-first-ball') + ' (WPA 3.2 via 4.4/4.9)' });
  b.style.display = 'block';
  const w = document.getElementById('ob-aimw-warn');
  if (w) { w.textContent = t('aim.wrongBallWarn'); w.classList.add('on'); }
  const h = document.getElementById('hud-hint');
  // GH-463: the rejection hint's error copy is register-aware in flow.js —
  // paint what the active register really paints (tp seam, feature-detected)
  h.textContent = t('flow.shotRejected',
    { error: (window.__i18n.tp ?? t)('snooker.nominateRequired') });
  h.style.display = 'block';
  return true;
})()`;
const PLAY_UNFORCE_JS = `(() => {
  const b = document.getElementById('banner');
  b.style.display = 'none'; b.textContent = '';
  const w = document.getElementById('ob-aimw-warn');
  if (w) { w.classList.remove('on'); w.textContent = ''; }
  const h = document.getElementById('hud-hint');
  h.style.display = 'none'; h.textContent = '';
  return true;
})()`;
// GH-1023 share-toast leg: the Share toast composed over a live foul banner
// on a phone (a VoiceOver/keyboard activation never sends the pointerdown
// that dismisses the banner, and a banner can land while the toast is up).
// Real copy only: the cited multi-line foul banner of the play leg and the
// LONGEST toast copy (share.copiedAppNoPlan: de is the longest locale);
// withWarn adds the wrong-ball chip. Without share.js's band-X rules the
// toast keeps its top-right corner (top 52px), inside band X, over the banner.
const SHARE_TOAST_FORCE_JS = (withWarn) => `(() => {
  const t = window.__i18n.t;
  const b = document.getElementById('banner');
  const toast = document.getElementById('ob-share-toast');
  if (!b || !toast) return false;
  b.textContent = t('flow.foulBanner',
    { reason: t('foul.wrong-first-ball') + ' (WPA 3.2 via 4.4/4.9)' });
  b.classList.add('foul');
  b.style.display = 'block';
  ${withWarn ? `const w = document.getElementById('ob-aimw-warn');
  if (w) { w.textContent = t('aim.wrongBallWarn'); w.classList.add('on'); }` : ''}
  toast.textContent = t('share.copiedAppNoPlan');
  toast.style.display = 'block';
  return true;
})()`;
const SHARE_TOAST_UNFORCE_JS = `(() => {
  const b = document.getElementById('banner');
  b.style.display = 'none'; b.textContent = ''; b.classList.remove('foul');
  const w = document.getElementById('ob-aimw-warn');
  if (w) { w.classList.remove('on'); w.textContent = ''; }
  const toast = document.getElementById('ob-share-toast');
  if (toast) { toast.style.display = 'none'; toast.textContent = ''; }
  return true;
})()`;
// #err composition: synthetic PRESENTATION rows only — never routed through
// reportError/window events, so window.__test.errors (the zero-error gate)
// stays byte-untouched. Cleanup empties the box; #err:empty hides itself.
const ERR_FORCE_JS = `(() => {
  const box = document.getElementById('err');
  box.hidden = false;
  if (!document.getElementById('err-x')) {
    const x = document.createElement('button');
    x.id = 'err-x'; x.type = 'button'; x.textContent = '\\u00d7';
    x.setAttribute('aria-label', 'dismiss errors');
    x.addEventListener('click', () => { box.hidden = true; });
    box.append(x);
  }
  const row = document.createElement('div');
  row.className = 'err-row';
  const s = document.createElement('span');
  s.className = 'err-msg';
  s.textContent = 'audit probe: synthetic boot-failure card for the '
    + 'band-contract sweep (issue #81 lane A) — not a real error';
  row.append(s);
  box.append(row);
  return true;
})()`;
const ERR_UNFORCE_JS = `(() => {
  const box = document.getElementById('err');
  box.replaceChildren(); // :empty re-hides the card (app.html law)
  box.hidden = false;    // leave the boot-state attribute shape untouched
  return true;
})()`;

/** The §3.11 band-contract sweep for one phone register (w×h): pairwise
 * clearance + hit-testability + 44 pt floors over the fixed-chrome set,
 * across the collision-relevant locales, in five compositions:
 * (a) playground chips, (a2) the build-4 QA WORST composition (5 chips +
 * snap + record-dock recording register + real cited foul banner — the
 * wrapped-strip register at 667x375 de/ja), (b) practice + live drill
 * strip + forced transients (the maximal set, pill at its widest real
 * copy), (b3) the play-mode transient stack with the real multi-line
 * banner + 2-line rejection hint, (c) the #err boot-error card including
 * the #58 portrait rotate-scrim yield, and (b4, GH-1023) the share toast
 * over a live banner, with and without the wrong-ball chip. */
async function runBandContract(page, w, h, push, pushClass) {
  const BAND_LOCALES = ['en', 'de', 'ja'];
  const probeAll = async (tag) => {
    for (const locale of BAND_LOCALES) {
      await chrome.eval(`window.__settings.set('language', '${locale}')`);
      await sleep(450);
      if (tag === 'band drill') await chrome.eval(BAND_FORCE_JS);
      else if (tag === 'band drill-done') await chrome.eval(BAND_DRILL_DONE_FORCE_JS);
      else if (tag === 'band playground-max') await chrome.eval(WORST_FORCE_JS);
      else if (tag === 'band play') await chrome.eval(PLAY_FORCE_JS);
      else if (tag === 'band share-toast') await chrome.eval(SHARE_TOAST_FORCE_JS(false));
      else if (tag === 'band share-toast-warn') await chrome.eval(SHARE_TOAST_FORCE_JS(true));
      await sleep(150); // content-aware band tokens land via ResizeObserver
      const f = await chrome.eval(BAND_PROBE_JS);
      const lp = `${page} ${tag} [${locale}]`;
      pushClass(lp, `zero pairwise band overlap (${f.present.length} present)`,
        f.overlap, 'touch.css §3.11 band contract (issue #81 lane A)');
      pushClass(lp, 'interactive band chrome hit-testable', f.dead,
        'touch.css §3.11: covered controls are the lane-A defect class');
      pushClass(lp, 'interactive band chrome ≥44pt', f.small,
        'touch-e2e.md §4.1 / TAP_TARGET_MIN_PT');
      // issue #144: with the live drill staged, the strip must stay clear
      // of the felt core (24px edge margin) and pointer-inert (#81a law)
      if (tag === 'band drill' || tag === 'band drill-done') {
        const g = await chrome.eval(DRILL_FELT_JS);
        if (g.err) {
          push(lp, false, `drill-strip felt probe unavailable — ${g.err}`,
            'issue #144 playfield-occlusion dimension');
        } else {
          pushClass(lp, 'drill strip clear of the felt core '
            + `(${FELT_MARGIN}px edge margin)`, g.occl,
          'issue #144: status chrome never occludes the playfield');
          pushClass(lp, 'drill strip pointer-inert (tap falls through)',
            g.eat, 'issue #81a / #144: read-only chips never eat taps');
        }
      }
      // GH-156: whenever the mode indicator is composed (practice +
      // playground legs — every tag except 'band play'), it must stay
      // clear of the felt core and pointer-inert (the read-only band-T
      // law the drill strip already obeys). GH-316: under width pressure
      // the band-fit pass may drop the badge WHOLE (.ob-band-drop —
      // collapse rule 1's first casualty; pre-316 the same registers
      // pixel-cropped it to nothing, so nothing painted then either) —
      // 'dropped' is a sanctioned register, only a genuinely un-composed
      // indicator fails.
      const indState = await chrome.eval(`(() => {
        const el = document.querySelector('#ob-mode-ind.on');
        if (!el) return 'absent';
        if (el.getClientRects().length) return 'painted';
        return el.classList.contains('ob-band-drop') ? 'dropped' : 'hidden';
      })()`);
      if (indState === 'painted') {
        const mi = await chrome.eval(MODE_FELT_JS);
        if (mi.err) {
          push(lp, false, `mode-indicator felt probe unavailable — ${mi.err}`,
            'GH-156 playfield-occlusion dimension');
        } else {
          pushClass(lp, 'mode indicator clear of the felt core '
            + `(${FELT_MARGIN}px edge margin)`, mi.occl,
          'GH-156: the mode badge never floats over the game again');
          pushClass(lp, 'mode indicator pointer-inert (tap falls through)',
            mi.eat, 'GH-156 / #81a: read-only badges never eat taps');
        }
      } else if (tag !== 'band play' && !tag.startsWith('band share-toast')) {
        push(lp, indState === 'dropped',
          `mode indicator composed (${indState}`
          + (indState === 'dropped'
            ? ' whole under width pressure — GH-316 ladder)' : ')'),
        'GH-156: mode context always composed when not in play '
          + '(GH-316: a whole-chip drop under width pressure is sanctioned)');
      }
      // build-4 QA: pill slot-cap discipline (the pill is armed with the
      // widest real copy in the drill composition)
      if (tag === 'band drill') {
        let pr = await chrome.eval(PILL_RETREAT_JS);
        if (pr.err) {
          // one re-arm through the direct register (see PILL_REARM_JS):
          // a genuinely un-armable pill still fails below
          await chrome.eval(PILL_REARM_JS);
          await sleep(250);
          pr = await chrome.eval(PILL_RETREAT_JS);
        }
        if (pr.err) {
          push(lp, false, `pill retreat probe unavailable — ${pr.err}`,
            'touch.css §3.11 pill slot cap');
        } else {
          push(lp, pr.w <= pr.cap + 0.5,
            `call pill painted box inside the --ob-corner-r slot cap `
            + `(${JSON.stringify(pr)})`,
            'touch.css §3.11: the cap bounds the PAINTED box (border-box)');
          push(lp, pr.gap >= 0.5,
            `status strip crop edge clear of the pill (gap=${pr.gap}px)`,
            'touch.css §3.11: chips never slide under the pill');
        }
      }
      // build-4 QA: worst-composition strip discipline
      if (tag === 'band playground-max') {
        const s = await chrome.eval(WORST_STRIP_JS);
        if (s.err) {
          push(lp, false, `worst-composition strip probe — ${s.err}`,
            'build-4 QA worst composition (5 chips + snap + record dock)');
        } else {
          push(lp, s.flexGrow === '0',
            `snap chip keeps intrinsic width (flexGrow=${s.flexGrow}, `
            + `w=${s.w}px, stripH=${s.stripH}px)`,
            'modes.css: no app.html #hud-button flex leak into the chips');
          if (s.rows2) {
            push(lp, s.reach === true,
              `felt drag reachable beside the wrapped row-2 chip `
              + `(probe=${JSON.stringify(s.probe)} hit=${s.hit})`,
              'build-4 QA: a wrapped chip never becomes a full-width '
              + 'pointer-opaque bar over the felt');
          }
        }
      }
      if (tag === 'band drill') await chrome.eval(BAND_UNFORCE_JS);
      else if (tag === 'band drill-done') await chrome.eval(BAND_DRILL_DONE_UNFORCE_JS);
      else if (tag === 'band playground-max') await chrome.eval(WORST_UNFORCE_JS);
      else if (tag === 'band play') await chrome.eval(PLAY_UNFORCE_JS);
      else if (tag.startsWith('band share-toast')) await chrome.eval(SHARE_TOAST_UNFORCE_JS);
    }
    await chrome.eval(`window.__settings.set('language', 'en')`);
    await sleep(300);
  };

  // (a) playground: the #68 sandbox chips must be present AND operable
  await chrome.eval(`window.__settings.set('mode', 'playground')`);
  await sleep(700);
  const pg = await chrome.eval(`(() => {
    const c = document.getElementById('ob-mode-chips');
    return !!c && c.classList.contains('on')
      && c.querySelectorAll('button').length >= 3;
  })()`);
  push(page, pg === true, 'playground chip strip composed (mode seam)',
    'issue #68 sandbox chrome');
  if (pg) {
    // GH-156 (chrome diet): every action chip is either an ICON chip
    // carrying its meaning on title + aria-label (svg face, data-icon
    // stamped) or the stale-cache TEXT register (visible label). An
    // icon-only control with an empty accessible name is the failure.
    const chipVoice = await chrome.eval(`(() => {
      const bad = [];
      for (const b of document.querySelectorAll('#ob-mode-chips button')) {
        const svg = b.querySelector('svg');
        const label = (b.getAttribute('aria-label') || '').trim();
        const title = (b.title || '').trim();
        const text = (b.textContent || '').trim();
        if (svg && (!svg.dataset.icon || !label || !title)) {
          bad.push('#' + b.id + ' icon chip missing voice (aria/title/data-icon)');
        }
        if (!svg && !text) bad.push('#' + b.id + ' empty chip (no face, no label)');
      }
      return bad;
    })()`);
    pushClass(page, 'playground icon chips carry localized aria-label + title'
      + ' (GH-156)', chipVoice,
    'the product charter Real icons: the SVG is decorative — meaning lives on the control');
    await probeAll('band playground');
    // build-4 QA: the WORST composition — 5 chips + snap + the record
    // dock's recording register + the real cited foul banner + warn chip.
    // At 667x375 de/ja the strip legally wraps under the §3.12 cap; the
    // contract must hold THROUGH the wrap (grown band-S reservation,
    // intrinsic-width chips, gauge column clear, felt drags alive).
    const snap = await chrome.eval(
      `!!document.getElementById('ob-mode-snap')`);
    push(page, snap === true,
      'snap chip composed for the worst composition (GH-140)',
      'build-4 QA worst composition');
    if (snap) await probeAll('band playground-max');
    // (a3) GH-156 review MAJOR: crop-ORDER pin — match/game chips composed
    // alongside the mode indicator (the aim.js setMatch coexistence the
    // review names, reachable in playground). The indicator must be the
    // row's LAST paint member and the FIRST casualty of the single-ended
    // crop; where the composition actually overflows the slot the clip
    // set itself is asserted too (no game-state chip may be clipped while
    // the badge paints whole).
    for (const locale of BAND_LOCALES) {
      await chrome.eval(`window.__settings.set('language', '${locale}')`);
      await sleep(450);
      const lp = `${page} band crop-order [${locale}]`;
      let forced = await chrome.eval(MODE_CROP_FORCE_JS);
      await sleep(150);
      if (forced !== true) {
        push(lp, false, 'match-chip composition unavailable (#hud-groups)',
          'GH-156 crop-order leg (chrome-diet SPEC §3 collapse rule 1)');
      } else {
        let co = await chrome.eval(MODE_CROP_ORDER_JS);
        if (co.err) {
          // one re-force: the hud.js locale-relabel pass (async dict
          // fetch) can land after the force and re-run renderMatch over
          // the null matchShown, wiping the forced presentation state
          await chrome.eval(MODE_CROP_UNFORCE_JS);
          forced = await chrome.eval(MODE_CROP_FORCE_JS);
          await sleep(250);
          if (forced === true) co = await chrome.eval(MODE_CROP_ORDER_JS);
        }
        if (co.err) {
          push(lp, false, `crop-order probe unavailable — ${co.err}`,
            'GH-156 crop-order leg (chrome-diet SPEC §3 collapse rule 1)');
        } else {
          push(lp, co.lastIsInd === true && co.rightmost === true,
            'mode indicator paints LAST in the band-T row '
            + `(${co.indDropped
              ? 'indicator dropped whole — first casualty'
              : 'order: ' + co.order.join(' → ')})`,
            'chrome-diet SPEC §3 collapse rule 1: mode context yields first');
          // GH-316: the strip crop is whole-chip now — a badge sliced by the
          // box edge (the owner's cut "P2 · 45") is the defect class
          pushClass(lp, 'no badge partially clipped by the strip box',
            co.clippedBadges,
            'GH-316 whole-chip law: a HUD badge paints complete or not at all');
          pushClass(lp, 'game-state chips never dropped while the mode '
            + 'badge paints whole',
          co.truthDroppedWhileIndWhole,
          'GH-156 review MAJOR: crop order — rules truth outranks mode context');
        }
      }
      await chrome.eval(MODE_CROP_UNFORCE_JS);
    }
    await chrome.eval(`window.__settings.set('language', 'en')`);
    await sleep(300);
  }

  // (b) practice + drill: the maximal band set (mode strip + drill strip +
  // banner + warn chip + hint + call pill + toolbar + strip + readout)
  await chrome.eval(`window.__settings.set('mode', 'practice')`);
  await sleep(500);
  // e2e-drills truthiness convention: start() returns a truthy handle
  const drill = await chrome.eval(`!!window.__drills?.start?.('circle')`);
  push(page, drill === true, 'drill strip composed (__drills.start seam)',
    'issue #66/#80 drill chrome');
  if (drill) {
    await sleep(700);
    await probeAll('band drill');
    // (b2) issue #81 lanes A×B: the DRILL-COMPLETE banner
    // (#banner.ob-drills-banner, drills.css bottom-park) composed WHILE the
    // drill strip is up (band-x inflated by the #144 dock-rail bump,
    // `:has(#ob-drill-dock.on #ob-drill-stop)` — the exact short-landscape
    // geometry that collided the bottom-parked banner
    // with the band-x+112 reason hint). This is the coverage the generic (b)
    // banner composition missed; red-proves against the pre-reconciliation
    // tree, green under the touch.css §3.11 hint-yield seam.
    await probeAll('band drill-done');
  }
  await chrome.eval(`window.__drills?.stop?.(); true`);
  await sleep(400);
  await chrome.eval(`window.__settings.set('mode', 'play')`);
  await sleep(500);

  // (b3) build-4 QA: the PLAY-mode transient stack — real cited multi-line
  // foul banner + warn chip + the 2-line snooker rejection hint at the
  // shortest band-x (no strips). The fixed #81 lane split was sized from
  // the one-line forced copy; the content-aware lanes + the hint
  // corner-column clearance must carry the real strings.
  await probeAll('band play');

  // (b4) GH-1023: the share toast over a live foul banner (longest real
  // toast copy), then with the wrong-ball chip up too — the toast takes the
  // band-X lane under the banner (and under the chip), never over them
  await probeAll('band share-toast');
  await probeAll('band share-toast-warn');

  // (c) #err boot-error register: card clear of (and above) the toolbar,
  // dismiss on the 44 pt floor, right-edge inset held — and the #58 law:
  // the portrait rotate scrim YIELDS while #err has content
  await chrome.eval(ERR_FORCE_JS);
  await sleep(300);
  const errProbe = await chrome.eval(BAND_PROBE_JS);
  pushClass(`${page} band err`, 'error card clear of the band chrome',
    errProbe.overlap, 'touch.css §3.11: #err joins band X above the toolbar z');
  pushClass(`${page} band err`, '#err controls hit-testable + ≥44pt',
    [...errProbe.dead, ...errProbe.small],
    'issue #81 findings 6/11: pills must not intercept #err');
  await setPhoneMetrics(chrome, { width: h, height: w });
  await sleep(700);
  const rotErr = await chrome.eval(`(() => {
    const rot = document.getElementById('ob-rotate');
    const rotShown = !!rot && rot.getClientRects().length > 0;
    const x = document.getElementById('err-x');
    const r = x.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const er = document.getElementById('err').getBoundingClientRect();
    return { rotShown, vw: innerWidth,
      errRight: +er.right.toFixed(1),
      xHit: !!hit && (hit === x || x.contains(hit)) };
  })()`);
  push(`${page} band err`, rotErr.rotShown === false && rotErr.xHit === true
    && rotErr.errRight <= rotErr.vw - 4,
  `portrait: rotate scrim yields to #err, dismiss tappable, right inset `
    + `(${JSON.stringify(rotErr)})`, 'issue #58 / #81 finding 13');
  await chrome.eval(ERR_UNFORCE_JS);
  await sleep(200);
  const rotBack = await chrome.eval(`(() => {
    const rot = document.getElementById('ob-rotate');
    return !!rot && rot.getClientRects().length > 0;
  })()`);
  push(`${page} band err`, rotBack === true,
    'rotate prompt returns once #err is emptied', 'issue #58 recipe');
  await setPhoneMetrics(chrome, { width: w, height: h });
  await sleep(600);
}

// ---- issue #86: layout-stability arm (touch-e2e.md §4.1 deviation note) -----
// LAW: numeric readouts never drive container width. Two sweeps, both
// scripted through the EXISTING value chains (geometry only — gauge-drag
// operability stays in e2e-touch.mjs, independent of the #70 S19 scenario):
//   (a) #power min→max at its own step: the gauge m/s readout's box width
//       must be constant to the pixel (the pill is centered on the fixed
//       rail; a breathing box is the same defect class at readout scope);
//   (b) with the spin popup open, the elevation MIRROR min→max: the modal
//       card's bounding width must never move — swept per locale, because
//       the label text joins the same fit-content chain the fix removed.
// Both sweeps restore the original value through the same chain.
const GAUGE_READOUT_SWEEP_JS = `(() => {
  const power = document.getElementById('power');
  const read = document.querySelector('.ob-touchw-gauge-readout');
  if (!power || !read || !read.getClientRects().length) return { found: false };
  const v0 = power.value;
  const min = Number(power.min), max = Number(power.max);
  const widths = new Set();
  // GH-184: walk the perceptual RELEASE GRID (settings.js powerQuant
  // mirror — 0.01 below 2 m/s, 0.05 in [2, 3), 0.1 at/above 3) instead of
  // the step attribute, so the sweep exercises every legal rendering incl.
  // the two-decimal sub-3 registers ("1.53 m/s"); on a stale pre-184 app
  // pairing the un-pinned step attr sanitizes the fine writes to tenths
  // and the sweep degrades to the old 0.1 walk — never a false negative.
  for (let c = Math.round(min * 100); c <= Math.round(max * 100);
    c += (c < 200 ? 1 : c < 300 ? 5 : 10)) {
    power.value = String(c / 100);
    power.dispatchEvent(new Event('input', { bubbles: true }));
    widths.add(read.getBoundingClientRect().width.toFixed(2));
  }
  power.value = v0;
  power.dispatchEvent(new Event('input', { bubbles: true }));
  return { found: true, widths: [...widths].slice(0, 6) };
})()`;
const SPIN_CARD_SWEEP_JS = `(() => {
  const wrap = (window.__auditRoot && document.contains(window.__auditRoot))
    ? window.__auditRoot : null;
  if (!wrap || wrap === document) return { found: false };
  const card = wrap.querySelector('[role=dialog]') ?? wrap.firstElementChild;
  const rng = [...wrap.querySelectorAll('input[type=range]')]
    .find((el) => el.getClientRects().length > 0);
  if (!card || !rng) return { found: false };
  const v0 = rng.value;
  const min = Number(rng.min), max = Number(rng.max);
  const step = Number(rng.step) || 1;
  const widths = new Set();
  for (let v = min; v <= max + 1e-9; v += step) {
    rng.value = String(v);
    rng.dispatchEvent(new Event('input', { bubbles: true }));
    widths.add(card.getBoundingClientRect().width.toFixed(2));
  }
  rng.value = v0;
  rng.dispatchEvent(new Event('input', { bubbles: true }));
  return { found: true, widths: [...widths].slice(0, 6) };
})()`;

/** Compose a dry-break rulebook decision (WPA 4.3(d)) through the scripted
 * seams — the same recipe e2e-8ball.mjs pins on rerack seed 3. */
async function composeDecisionPrompt() {
  if (await chrome.eval(`window.__rules?.game?.()`) !== 'eight_ball'
      && await chrome.eval(`window.__rules?.setGame?.('eight_ball')`) !== true) {
    return false;
  }
  await sleep(400);
  await chrome.eval('__test.rerack(3)');
  await sleep(300);
  await chrome.eval(`window.__rules?.setMatchState?.({ shooter: 1, breaker: 1 })`);
  const err = await chrome.eval(
    '__test.shoot({ v0: 1.2, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
  if (err) return false;
  let st = 'PLAYBACK';
  for (let i = 0; i < 120 && (st === 'PLAYBACK' || st === 'SIMULATING'); i++) {
    await sleep(350);
    st = await chrome.eval('__test.state()');
  }
  for (let i = 0; i < 25; i++) {
    if (await chrome.eval(`(() => {
      const d = document.getElementById('hud-decision');
      return !!d && d.getClientRects().length > 0;
    })()`)) return true;
    await sleep(200);
  }
  return false;
}

// ---- GH-465: decision prompts are keyboard-first DIALOGS --------------------
// The b17 QA verification (issue #465) reproduced a real-user desktop route
// where the dry-break 4.3(d) prompt opened with document.activeElement left
// on BODY: no role, no autofocus, no trap — Tab walked the background chrome
// (Tab x4 to reach the first option, 3 more ESCAPED the prompt), while
// hud.js's own #71 law calls the prompt genuinely modal and the kit's other
// panels (openPanel/confirmDialog) already autofocus + trap. This arm pins
// the full dialog contract on #hud-decision:
//   (a) role=dialog + aria-modal + aria-labelledby/-describedby that resolve
//       to the live title/chooser copy
//   (b) focus-on-open: the FIRST option holds focus — a NEUTRAL pill like
//       its siblings (ruling R6 / GH-668 S5 slice 3 G6: --primary only when
//       a kind names a default, and none does; the pre-G6 renderer
//       accented it)
//   (c) trap: real Tab / Shift+Tab presses cycle the options and never land
//       on background chrome while the prompt is open
//   (d) Escape: rulebook decisions allow NO dismissal (issue #71) — the
//       prompt stays, the decision stays pending, and the refusal is
//       EXPLAINED through the passive hint, never silently swallowed
//   (e) restore: resolving the decision hands focus back to the pre-open
//       element (the kit closePanel prevFocus law)
// The #447 scene-tap PRIMARY path and the #451 replay gates are pinned by
// their own arms (e2e-onepocket S1-scene/S1-vis, e2e-share w451 watcher) —
// this arm adds only the keyboard register on top of them.
async function auditDecisionFocus(report) {
  const push = (ok, what, detail = '') => report.push({
    ok, page: 'decision',
    what: what + (ok || !detail ? '' : ' — ' + detail),
    rule: 'decision prompts carry the kit dialog contract (GH-465)',
  });
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=decision-focus` });
  await waitReady();
  await sleep(800);
  // pre-open focus anchor for the RESTORE assertion — the gear stays
  // enabled through the settle (#shoot disables itself during playback and
  // a disabled control drops focus to <body>, which would make the restore
  // assertion vacuous)
  await chrome.eval(`document.getElementById('ob-gear').focus()`);
  const composed = await composeDecisionPrompt();
  push(composed === true, 'decision prompt composable (dry-break 4.3(d))');
  if (!composed) return;
  // (a) dialog semantics
  const sem = await chrome.eval(`(() => {
    const d = document.getElementById('hud-decision');
    const lb = d.getAttribute('aria-labelledby');
    const db = d.getAttribute('aria-describedby');
    return { role: d.getAttribute('role'), modal: d.getAttribute('aria-modal'),
      label: (lb && document.getElementById(lb)?.textContent) || '',
      desc: (db && document.getElementById(db)?.textContent) || '' };
  })()`);
  push(sem.role === 'dialog', 'dialog semantics: role=dialog',
    `role=${JSON.stringify(sem.role)}`);
  push(sem.modal === 'true',
    'dialog semantics: aria-modal (the prompt locks the stroke; every choice '
    + 'is completable inside the dialog)', `aria-modal=${JSON.stringify(sem.modal)}`);
  push(!!sem.label && !!sem.desc,
    'dialog semantics: aria-labelledby/-describedby resolve to the '
    + 'title/chooser copy', JSON.stringify({ label: sem.label, desc: sem.desc }));
  const FOCUS_PROBE = `(() => {
    const d = document.getElementById('hud-decision');
    const btns = [...d.querySelectorAll('.hd-btns button')];
    const a = document.activeElement;
    return { inside: d.contains(a), idx: btns.indexOf(a), n: btns.length,
      primary: !!a && !!a.classList && a.classList.contains('ob-btn--primary'),
      at: a ? (a.id || a.tagName + ':' + (a.textContent ?? '').slice(0, 24)) : null };
  })()`;
  // (b) focus-on-open
  let f = await chrome.eval(FOCUS_PROBE);
  push(f.inside && f.idx === 0 && !f.primary,
    'focus-on-open: the first option holds focus and is a NEUTRAL pill (R6: no --primary unless the kind names a default)',
    JSON.stringify(f));
  // (c) trap: 2n+1 real Tabs must cycle the options without ever landing on
  // background chrome (the #465 route walked #replay/#rerack/#slowmo under
  // the open prompt)
  const walk = [];
  let escaped = null;
  for (let i = 0; i < 2 * f.n + 1 && escaped === null; i++) {
    await pressKey('Tab', 'Tab', 9);
    const p = await chrome.eval(FOCUS_PROBE);
    walk.push(p.idx);
    if (!p.inside) escaped = p.at;
  }
  push(escaped === null,
    `trap: ${2 * f.n + 1} Tabs stay inside the prompt and cycle the options`,
    `escaped to ${JSON.stringify(escaped)} (walk ${walk.join(',')})`);
  // trap, reverse register: Shift+Tab from the first option wraps to the last
  await chrome.eval(
    `document.querySelector('#hud-decision .hd-btns button')?.focus()`);
  const shiftTab = { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9, modifiers: 8 };
  await chrome.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...shiftTab });
  await chrome.send('Input.dispatchKeyEvent', { type: 'keyUp', ...shiftTab });
  await sleep(80);
  f = await chrome.eval(FOCUS_PROBE);
  push(f.inside && f.idx === f.n - 1,
    'trap: Shift+Tab from the first option wraps to the last',
    JSON.stringify(f));
  // (d) Escape: no dismissal — and never a silent swallow
  await pressKey('Escape', 'Escape', 27);
  await sleep(250);
  const esc = await chrome.eval(`(() => {
    const d = document.getElementById('hud-decision');
    const h = document.getElementById('hud-hint');
    return { display: d.style.display,
      pending: window.__rules?.matchState?.()?.pendingDecision?.kind ?? null,
      hint: h && h.style.display === 'block' ? h.textContent : '' };
  })()`);
  push(esc.display === 'block' && esc.pending === 'dry_break',
    'Escape is a no-op on a rulebook decision (prompt stays, decision pends)',
    JSON.stringify(esc));
  push(!!esc.hint,
    'Escape refusal is explained through the passive hint',
    `hint=${JSON.stringify(esc.hint)}`);
  // ---- review r6 (P2a): a layer pushed ABOVE the open prompt (help,
  // playback) covers it — the covered aria-modal dialog must go inert to
  // AT and input for exactly that cover's lifetime, and come back live
  // (with focus pulled back in) on exposure.
  {
    // review r11: the user's focused choice must SURVIVE the cover round-
    // trip — park focus on the SECOND option before opening help; a
    // restore that silently resets to the first option would let the
    // next Enter take a different rulebook action than the one focused
    await chrome.eval(`document
      .querySelectorAll('#hud-decision .hd-btns button')[1].focus()`);
    await chrome.eval(`window.__help.open('api')`);
    await sleep(450);
    const covered = await chrome.eval(`(() => {
      const d = document.getElementById('hud-decision');
      return { ariaHidden: d.getAttribute('aria-hidden'),
        inert: d.inert === true };
    })()`);
    push(covered.ariaHidden === 'true' && covered.inert,
      'late cover: a layer pushed above the prompt makes it INERT for the '
      + "cover's lifetime", JSON.stringify(covered));
    await chrome.eval(`window.__help.close()`);
    await sleep(450);
    const exposed = await chrome.eval(`(() => {
      const d = document.getElementById('hud-decision');
      const btns = [...d.querySelectorAll('.hd-btns button')];
      return { ariaHidden: d.getAttribute('aria-hidden'),
        inert: d.inert === true, inside: d.contains(document.activeElement),
        idx: btns.indexOf(document.activeElement) };
    })()`);
    push(exposed.ariaHidden === null && !exposed.inert && exposed.inside,
      'late cover: closing the layer sheds the inert state and hands '
      + 'focus back into the prompt', JSON.stringify(exposed));
    push(exposed.idx === 1,
      "late cover: the user's focused choice (option 2) survives the "
      + 'round-trip — never silently reset to the first option',
      JSON.stringify(exposed));
  }
  // ---- review r12 (P2): a re-render (locale flip; the break_pocket
  // default re-order is the same code path) REPLACES the option buttons —
  // the repaired focus must land on the SAME CHOICE, never reset to the
  // first option (the next Enter would take a different rulebook action).
  // dry_break enums keep their order across locales, so same choice ==
  // same index here.
  {
    await chrome.eval(`document
      .querySelectorAll('#hud-decision .hd-btns button')[1].focus()`);
    await chrome.eval(`window.__settings.set('language', 'de')`);
    await sleep(400);
    const re12 = await chrome.eval(FOCUS_PROBE);
    await chrome.eval(`window.__settings.set('language', 'en')`);
    await sleep(300);
    push(re12.inside && re12.idx === 1,
      're-render: the focused CHOICE survives a locale flip (never reset '
      + 'to the first option)', JSON.stringify(re12));
  }
  // (e) restore: resolve through the focused option; focus returns to the
  // pre-open element once the exit motion settles
  await chrome.eval(`(() => {
    const b = document.querySelector('#hud-decision .hd-btns button');
    b.focus(); b.click();
    return true;
  })()`);
  let restored = null;
  for (let i = 0; i < 20 && restored !== 'ob-gear'; i++) {
    await sleep(100);
    restored = await chrome.eval(
      'document.activeElement ? (document.activeElement.id '
      + '|| document.activeElement.tagName) : null');
  }
  push(restored === 'ob-gear',
    'restore: resolving the decision returns focus to the pre-open element',
    `activeElement=${JSON.stringify(restored)}`);

  // ---- review r8 (P2): the REAL keyboard shot flow — the user activates
  // #shoot, playback disables it (focus falls to BODY), the prompt opens
  // with an unusable prevFocus. Resolving must land on the prompt's
  // stable logical return target (#shoot, re-enabled by the routing),
  // never strand focus on BODY. (The ob-gear anchor above deliberately
  // tests the HAPPY prevFocus path; this cycle tests the degraded one.)
  {
    await chrome.eval(`document.getElementById('shoot').focus()`);
    const composed8 = await composeDecisionPrompt();
    push(composed8 === true, 'shot-flow: second decision composable');
    if (composed8) {
      // review r9: the unusable-prevFocus PRECONDITION is load-bearing —
      // if #shoot stayed enabled or kept focus, the ordinary prevFocus
      // restore would land on it and mask a broken/removed restoreTo
      const pre8 = await chrome.eval(`(() => ({
        disabled: document.getElementById('shoot').disabled === true,
        shootFocused: document.activeElement
          === document.getElementById('shoot') }))()`);
      push(pre8.disabled && !pre8.shootFocused,
        'shot-flow precondition: #shoot disabled itself and lost focus '
        + '(the captured prevFocus is unusable)', JSON.stringify(pre8));
      await chrome.eval(`(() => {
        const b = document.querySelector('#hud-decision .hd-btns button');
        b.focus(); b.click();
        return true;
      })()`);
      let restored8 = null;
      for (let i = 0; i < 20 && restored8 !== 'shoot'; i++) {
        await sleep(100);
        restored8 = await chrome.eval(
          'document.activeElement ? (document.activeElement.id '
          + '|| document.activeElement.tagName) : null');
      }
      push(restored8 === 'shoot',
        'shot-flow restore: an unusable prevFocus (BODY after #shoot '
        + 'disabled itself) falls back to the stable logical target',
        `activeElement=${JSON.stringify(restored8)}`);
    }
  }

  // ---- review r10 (P2): a covering layer OUTSIDE the dialog stack — the
  // stale-cache settings fallback shell (buildFallbackShell, no navmodal)
  // is display-flipped and never openPanel'd — must still suspend the
  // prompt: no focus steal, no Escape consumption, inert while covered,
  // handoff on the layer's display flip (no stack event fires). The probe
  // uses the kit's [data-ob-layer] external-cover convention with a
  // synthetic layer standing in for the fallback shell.
  {
    await chrome.eval(`(() => {
      const L = document.createElement('div');
      L.id = 'ob-465-extlayer';
      L.dataset.obLayer = 'modal';
      L.style.cssText = 'position:fixed;inset:20%;z-index:70;display:none;';
      document.body.appendChild(L);
      L.style.display = 'block';
      document.getElementById('ob-gear').focus();
      return true;
    })()`);
    const composedX = await chrome.eval(`window.__rules?.matchState?.()`)
      .then(() => composeDecisionPrompt());
    push(composedX === true,
      'ext-layer: decision composable under the external layer');
    if (composedX) {
      const ext1 = await chrome.eval(`(() => {
        const d = document.getElementById('hud-decision');
        return { stolen: d.contains(document.activeElement),
          ariaHidden: d.getAttribute('aria-hidden'), inert: d.inert === true };
      })()`);
      push(!ext1.stolen && ext1.ariaHidden === 'true' && ext1.inert,
        'ext-layer: the covered prompt neither steals focus nor stays '
        + 'live to AT (fallback-shell law)', JSON.stringify(ext1));
      await pressKey('Escape', 'Escape', 27);
      await sleep(250);
      const ext2 = await chrome.eval(`(() => {
        const h = document.getElementById('hud-hint');
        return { hint: h && h.style.display === 'block' ? h.textContent : '',
          pending: window.__rules?.matchState?.()?.pendingDecision?.kind
            ?? null };
      })()`);
      push(ext2.hint === '' && ext2.pending === 'dry_break',
        'ext-layer: Escape is NOT consumed by the covered prompt (the '
        + 'visible fallback layer keeps its keys)', JSON.stringify(ext2));
      await chrome.eval(
        `document.getElementById('ob-465-extlayer').style.display = 'none'`);
      await sleep(300);
      const ext3 = await chrome.eval(`(() => {
        const d = document.getElementById('hud-decision');
        return { inside: d.contains(document.activeElement),
          ariaHidden: d.getAttribute('aria-hidden'), inert: d.inert === true };
      })()`);
      push(ext3.inside && ext3.ariaHidden === null && !ext3.inert,
        'ext-layer: hiding the layer hands the prompt back (focus in, '
        + 'inert shed) with no stack event', JSON.stringify(ext3));
      await chrome.eval(`window.__rules?.decide?.(1)`);
      await sleep(300);
    }
    await chrome.eval(
      `document.getElementById('ob-465-extlayer')?.remove(); true`);
  }

  // ---- review r1 (P1): a decision that settles UNDER an open kit layer must
  // YIELD — the settings/help/playback chrome (z-70, backdropped) stays the
  // visible top layer, keeps its own trap/Escape, and never has focus stolen
  // from under the user; the prompt's trap arms only once the layers above
  // close and it becomes the visible top.
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=decision-yield` });
  await waitReady();
  await sleep(800);
  // focus the gear BEFORE clicking it: the settings modal's own restore
  // anchor is then deterministic (ob-gear), which the review r2 (P2) chain
  // assertion below rides — the yielded prompt must inherit a REAL anchor
  // when the covering modal dies with the original one
  await chrome.eval(`(() => {
    const g = document.getElementById('ob-gear');
    g.focus(); g.click();
    return true;
  })()`);
  await sleep(500); // navmodal enter + autofocus
  const inSettings = await chrome.eval(`(() => {
    const s = document.getElementById('ob-settings');
    return !!s && s.contains(document.activeElement);
  })()`);
  push(inSettings, 'yield precondition: settings modal open and focused');
  const composed2 = await composeDecisionPrompt();
  push(composed2 === true,
    'yield: decision composable while the settings modal is open');
  if (composed2) {
    const yield1 = await chrome.eval(`(() => {
      const s = document.getElementById('ob-settings');
      const d = document.getElementById('hud-decision');
      return { settingsFocused: !!s && s.contains(document.activeElement),
        stolen: d.contains(document.activeElement) };
    })()`);
    // the tooth is STOLEN (the covered prompt autofocusing under the
    // backdrop); settingsFocused rides as detail only — a settings pane
    // rebuild across the scripted game switch may drop focus to <body>
    // without any theft
    push(!yield1.stolen,
      'yield: the covered prompt never steals focus from the open modal',
      JSON.stringify(yield1));
    // review r5 (P2a): while covered, the yielded aria-modal dialog is
    // INERT — AT must not reach or activate an invisible rule choice
    // beneath the open modal (two live modal dialogs at once)
    const yieldInert = await chrome.eval(`(() => {
      const d = document.getElementById('hud-decision');
      return { ariaHidden: d.getAttribute('aria-hidden'),
        inert: d.inert === true };
    })()`);
    push(yieldInert.ariaHidden === 'true' && yieldInert.inert,
      'yield: the covered prompt is INERT to AT and input while beneath '
      + 'the modal', JSON.stringify(yieldInert));
    await pressKey('Escape', 'Escape', 27);
    await sleep(500); // settings exit motion
    const yield2 = await chrome.eval(`(() => {
      const s = document.getElementById('ob-settings');
      const open = !!s && s.getClientRects().length > 0
        && window.getComputedStyle(s).visibility !== 'hidden';
      return { settingsOpen: open,
        pending: window.__rules?.matchState?.()?.pendingDecision?.kind ?? null };
    })()`);
    push(!yield2.settingsOpen && yield2.pending === 'dry_break',
      'yield: Escape closes the VISIBLE top layer (settings), not the '
      + 'covered prompt', JSON.stringify(yield2));
    // review r4 (P2): the moment the covering layer closes, the yielded
    // prompt is the ACTIVE aria-modal dialog — its deferred autofocus
    // must fire NOW (focus parked on the background opener would let
    // Enter reactivate chrome under an open modal, and strands SR focus
    // outside it)
    const yieldTop = await chrome.eval(FOCUS_PROBE);
    push(yieldTop.inside && yieldTop.idx === 0,
      'yield: focus TRANSFERS into the prompt the moment it becomes the '
      + 'top layer (deferred autofocus)', JSON.stringify(yieldTop));
    // review r5 (P2a): exposure sheds the inert state with the handoff
    const shedInert = await chrome.eval(`(() => {
      const d = document.getElementById('hud-decision');
      return { ariaHidden: d.getAttribute('aria-hidden'),
        inert: d.inert === true };
    })()`);
    push(shedInert.ariaHidden === null && !shedInert.inert,
      'yield: exposure sheds the inert state (the prompt is live again)',
      JSON.stringify(shedInert));
    await pressKey('Tab', 'Tab', 9);
    await sleep(80);
    const yield3 = await chrome.eval(FOCUS_PROBE);
    push(yield3.inside,
      'yield: once the layer above closes, the prompt is the top layer '
      + 'again and Tab enters its trap', JSON.stringify(yield3));
    // ---- review r2 (P1): the REAL ob-pb-live stand-down (playback.css
    // hides the whole HUD chrome with visibility:hidden while the player
    // is up) must render the trapped prompt INERT — a hidden dialog that
    // still answers Escape would hint over a surface the user cannot see
    // (and its Tab preventDefault would eat the player's keyboard).
    {
      await chrome.eval(
        `document.documentElement.classList.add('ob-pb-live')`);
      await sleep(120);
      const hidden = await chrome.eval(`(() => {
        const d = document.getElementById('hud-decision');
        return getComputedStyle(d).visibility === 'hidden';
      })()`);
      push(hidden,
        'pb-live precondition: the stand-down hides the open prompt');
      await pressKey('Escape', 'Escape', 27);
      await sleep(250);
      const inert = await chrome.eval(`(() => {
        const h = document.getElementById('hud-hint');
        return { hint: h && h.style.display === 'block' ? h.textContent : '',
          pending: window.__rules?.matchState?.()?.pendingDecision?.kind
            ?? null };
      })()`);
      push(inert.hint === '' && inert.pending === 'dry_break',
        'pb-live: the hidden prompt goes key-INERT (no Escape hint over '
        + 'an invisible dialog)', JSON.stringify(inert));
      // review r3 (P2): supported pre-17.4 WebKit has no
      // Element.checkVisibility — the guard must fall back to computed
      // style. Composed for real: the API is removed in-page and the
      // hidden prompt must STAY inert through the fallback branch.
      await chrome.eval(`(() => {
        window.__cv465 = Element.prototype.checkVisibility;
        delete Element.prototype.checkVisibility;
        return typeof document.body.checkVisibility;
      })()`);
      await pressKey('Escape', 'Escape', 27);
      await sleep(250);
      const inertNoApi = await chrome.eval(`(() => {
        const h = document.getElementById('hud-hint');
        return h && h.style.display === 'block' ? h.textContent : '';
      })()`);
      await chrome.eval(`(() => {
        Element.prototype.checkVisibility = window.__cv465;
        delete window.__cv465;
        return true;
      })()`);
      push(inertNoApi === '',
        'pb-live: the guard stays inert WITHOUT checkVisibility '
        + '(computed-style fallback, pre-17.4 WebKit)',
        `hint=${JSON.stringify(inertNoApi)}`);
      await chrome.eval(
        `document.documentElement.classList.remove('ob-pb-live')`);
      await sleep(300);
      // review r7 (P2): the stand-down ends WITHOUT any stack event (the
      // player exit only removes the class — playback.js never calls
      // closePanel) — the revealed aria-modal prompt must take focus
      // back by itself, not wait for a manual Tab
      const revealed = await chrome.eval(FOCUS_PROBE);
      push(revealed.inside,
        'pb-live: ending the stand-down hands focus back into the '
        + 'revealed prompt (no manual Tab)', JSON.stringify(revealed));
    }
    // ---- review r2 (P2): the yielded prompt's restore anchor originally
    // pointed INSIDE the settings modal (whatever held focus there when
    // the prompt opened underneath); that anchor died when the modal
    // closed. Resolving the decision must land focus on the refreshed
    // anchor — the modal's own restore target (ob-gear) — never <body>.
    await chrome.eval(`window.__rules?.decide?.(1)`);
    let restored2 = null;
    for (let i = 0; i < 20 && restored2 !== 'ob-gear'; i++) {
      await sleep(100);
      restored2 = await chrome.eval(
        'document.activeElement ? (document.activeElement.id '
        + '|| document.activeElement.tagName) : null');
    }
    push(restored2 === 'ob-gear',
      'yield restore chain: resolving the yielded decision lands focus on '
      + "the covering modal's own anchor, never <body>",
      `activeElement=${JSON.stringify(restored2)}`);
  }
}

async function runPhoneAudit() {
  console.log(PHONE_MARKER);
  const report = [];
  const push = (page, ok, what, rule) => report.push({ page, ok, what, rule });
  const pushClass = (page, cls, arr, rule) => push(page, !arr.length,
    `${cls}${arr.length ? ' — ' + arr.join('; ') : ''}`, rule);
  const setRoot = (sel) => chrome.eval(sel
    ? `window.__auditRoot = document.querySelector('${sel}'); !!window.__auditRoot`
    : 'window.__auditRoot = null; true');
  // the 2026-07 button-audit pair (centring dimension + rolled-own ratchet),
  // deduped on `what` across the WHOLE phone section so re-walking an opened
  // surface only adds that surface's new controls
  // deduped PER TAG (viewport + surface), never globally: the same control can
  // measure differently at 844x390 and 926x428, and a global set would let the
  // first viewport claim every row and silence the others.
  const btnSeen = new Set();
  const btnWalk = async (tag) => {
    for (const rows of [await chrome.eval(AUDIT_WALKER), await kitButtonRows()]) {
      for (const r of rows) {
        const key = tag + '|' + r.what;
        if (btnSeen.has(key)) continue;
        btnSeen.add(key);
        push(tag, r.ok, r.what, r.rule);
      }
    }
  };

  // phone-emulated reboot: coarse must be live BEFORE the app boots
  // (main.js evaluates the media query once in startLoop)
  await setPhoneMetrics(chrome, { width: 844, height: 390 });
  const saMode = await setSafeAreaInsets(chrome, PHONE_SA);
  await chrome.send('Page.navigate', { url: `${APP_URL}&obtool=1` });
  await waitReady();
  await sleep(1500); // touch leaf loads post-boot (dynamic import)
  push('phone', saMode !== null,
    `safe-area (notch) emulation available (mode=${saMode})`,
    'touch-e2e.md §4.1: safe-area compliance under notch emulation');
  const boot = await chrome.eval(`({
    coarse: matchMedia('(pointer: coarse)').matches,
    touch: document.documentElement.classList.contains('ob-touch'),
    inst: window.__touch?.installed === true,
  })`);
  push('phone', boot.coarse === true, 'coarse pointer active on the phone boot',
    'touch-e2e.md §1 frozen emulation recipe');
  push('phone', boot.touch === true && boot.inst === true,
    `touch mode installed on coarse boot (.ob-touch=${boot.touch}, __touch=${boot.inst})`,
    'touch-input.md §2 install seam');
  // GH-463: the touch register must speak the touch verb — the register-
  // aware tp() seam serves the BASE (legacy touch-register) copy on touch
  // and reserves the `.mouse` variant for fine pointers (review r2 P2: the
  // base key keeps its pre-463 bytes so stale callers never flip register).
  // The fine-pointer mirror of this assertion rides e2e-10ball S21b.
  const reg463 = await chrome.eval(`({
    tp: window.__i18n.tp?.('call.hint') ?? null,
    base: window.__i18n.t('call.hint'),
    mouse: window.__i18n.t('call.hint.mouse'),
  })`);
  push('phone', reg463.tp === reg463.base && reg463.tp !== reg463.mouse
    && /\btap\b/i.test(reg463.tp ?? '') && !/\bclick\b/i.test(reg463.tp ?? ''),
    `call-gate copy speaks the touch register (tp="${reg463.tp}")`,
    'GH-463: instruction copy is pointer-aware (mouse click / touch tap)');
  await chrome.eval(PAGE_HELPERS_JS);

  for (const [w, h] of PHONE_VIEWPORTS) {
    const page = `phone ${w}x${h}`;
    console.log(`[e2e-ui audit] phone walker: ${w}x${h}`);
    await setPhoneMetrics(chrome, { width: w, height: h });
    await sleep(600);
    await chrome.eval(`window.__settings.set('language', 'en')`);
    await sleep(400);

    // core touch surfaces (phone-hud.md §3 layout regions)
    const core = await chrome.eval(`(() => ({
      fire: window.__tp.el('#shoot'), strip: window.__tp.el('#state'),
      aimw: window.__tp.el('#aimw'), help: window.__tp.el('#help'),
      rotate: window.__tp.el('#ob-rotate'),
      gauge: window.__tp.findGauge(), spin: window.__tp.findSpinButton(),
    }))()`);
    push(page, core.fire.found && core.fire.visible
      && Math.min(core.fire.w, core.fire.h) >= 64
      && core.fire.cx > w / 2 && core.fire.cy > h / 2,
    `FIRE pill ≥64px bottom-right (${JSON.stringify(core.fire)})`,
    'phone-hud.md §3.4');
    push(page, core.strip.found && core.strip.visible && core.strip.y >= 0
      && core.strip.x >= 0 && core.strip.x + core.strip.w <= w + 0.5
      && core.strip.cy < h * 0.25,
    `status strip on-screen in the top band (${JSON.stringify(core.strip)})`,
    'phone-hud.md §3.3');
    push(page, core.gauge.found && core.gauge.w >= 43.5 && core.gauge.h >= 200,
      `power gauge ≥44pt wide × ≥200px tall (${JSON.stringify(core.gauge)})`,
      'phone-hud.md §3.5');
    push(page, core.spin.found && Math.min(core.spin.w, core.spin.h) >= 56,
      `spin button ≥56px (${JSON.stringify(core.spin)})`, 'phone-hud.md §3.6');
    push(page, (!core.aimw.found || !core.aimw.visible)
      && (!core.help.found || !core.help.visible),
    'desktop-only panels (#aimw/#help) hidden on phone', 'phone-hud.md §3.9');
    push(page, core.rotate.found, '#ob-rotate node present (portrait-only CSS)',
      'phone-hud.md §3.1');

    // issue #86 (a): the m/s readout holds its reserved slot across the
    // full legal #power range (scripted desktop-chain sweep; the gauge
    // mirrors #power 'input' — no gesture needed for geometry)
    const gw = await chrome.eval(GAUGE_READOUT_SWEEP_JS);
    push(page, gw.found === true && gw.widths.length === 1,
      `power readout box width constant across the full #power sweep `
      + `(${JSON.stringify(gw)})`,
      'issue #86: numeric readouts never drive container width');

    // base-state assertion classes × 7 locales
    for (const locale of GAME_LOCALES) {
      await chrome.eval(`window.__settings.set('language', '${locale}')`);
      await sleep(500);
      const f = await chrome.eval(phoneWalkerJs(w, h));
      const lp = `${page} [${locale}]`;
      pushClass(lp, 'tap-target floor ≥44pt', f.tap, 'touch-e2e.md §4.1 / TAP_TARGET_MIN_PT');
      pushClass(lp, 'containment: fixed chrome inside the viewport', f.contain,
        'touch-e2e.md §4.1 containment');
      pushClass(lp, 'occlusion: interactive controls unobstructed', f.occlude,
        'touch-e2e.md §4.1 occlusion');
      pushClass(lp, 'safe-area compliance (fixed interactive chrome)', f.safe,
        'touch-e2e.md §4.1 safe-area under notch emulation');
      pushClass(lp, 'no truncation/overflow on touch chrome', f.trunc,
        'kit law: labels never ellipsize');
    }
    await chrome.eval(`window.__settings.set('language', 'en')`);
    await sleep(400);

    // 2026-07 button audit: the icon/label centring dimension + the
    // rolled-own ratchet also run in the COARSE register (the owner's defect
    // was reported on a DPR-3 phone, where a 2.50 CSS px offset is 7.50
    // device px). AUDIT_WALKER carries the centring rows; KIT_BUTTON_WALKER
    // carries the ratchet. Both walk the BASE chrome here, and again inside
    // each surface's own open cycle below (spin popup, settings sheet) —
    // AUDIT_WALKER skips boxless elements, so a closed surface is invisible to
    // it and a phone-only control there would never be judged.
    await btnWalk(page);
    await auditKitLaws(report, page, { coarse: true }); // GH-668 S5 kit laws, HUD register

    // issue #81 lane A: the §3.11 top-band contract sweep (composition
    // registers a/b/c — playground chips, drill strip + transients, #err)
    await runBandContract(page, w, h, push, pushClass);

    // spin popup sweep (geometry only — operability lives in e2e-touch.mjs)
    const spinOpened = await chrome.eval('window.__tp.clickSpin()');
    push(page, spinOpened === true, 'spin popup reachable from its button',
      'phone-hud.md §3.6');
    if (spinOpened) {
      await sleep(600);
      const pad = await chrome.eval('window.__tp.findPad()');
      push(page, pad.found && Math.min(pad.w, pad.h) >= 200,
        `spin pad ≥200px (${JSON.stringify(pad)})`, 'phone-hud.md §3.6');
      await btnWalk(`${page} spin popup`);
      await chrome.eval(`window.__auditRoot = (() => {
        const list = [...document.querySelectorAll('body *')].filter((el) =>
          getComputedStyle(el).position === 'fixed'
          && el.getClientRects().length > 0 && el.className !== 'ob-backdrop'
          && el.querySelector('input[type=range]'));
        return list[0] ?? null;
      })(); true`);
      for (const locale of GAME_LOCALES) {
        await chrome.eval(`window.__settings.set('language', '${locale}')`);
        await sleep(400);
        const f = await chrome.eval(phoneWalkerJs(w, h));
        pushClass(`${page} popup [${locale}]`,
          'popup controls ≥44pt + untruncated + unobstructed',
          [...f.tap, ...f.trunc, ...f.occlude], 'phone-hud.md §3.6/§5');
        // issue #86 (b): elevation mirror min→max sweep — the modal card's
        // bounding width is constant to the pixel in every locale
        const st = await chrome.eval(SPIN_CARD_SWEEP_JS);
        push(`${page} popup [${locale}]`,
          st.found === true && st.widths.length === 1,
          `spin card width constant across the elevation sweep `
          + `(${JSON.stringify(st)})`,
          'issue #86: numeric readouts never drive container width');
      }
      await setRoot(null);
      await pressKey('Escape', 'Escape', 27);
      await sleep(500);
    }
    await chrome.eval(`window.__settings.set('language', 'en')`);
    await sleep(300);

    // settings SHEET sweep (feature 015 contract §5, superseding phone-hud
    // §3.10 for #ob-settings): full-screen sheet, pill-strip tabs (the SAME
    // .ob-set-nav buttons, pan-x), pan-y content, action rows in the
    // #ob-settings-actions mount (Share + Re-rack since GH-225 Phase D
    // retired the Export + Record rows)
    await chrome.eval(`document.getElementById('ob-gear')?.click?.()`);
    await sleep(600);
    const sheet = await chrome.eval(`(() => {
      const d = document.getElementById('ob-settings');
      if (!d || !d.getClientRects().length) return { open: false };
      const r = d.getBoundingClientRect();
      const tabs = document.getElementById('ob-settings-tabs');
      const body = document.getElementById('ob-settings-body');
      const actions = document.getElementById('ob-settings-actions');
      return { open: true, rows: window.__tp.drawerRows(),
        touchAction: getComputedStyle(d).touchAction,
        fullscreen: r.left <= 1 && r.top <= 1
          && r.right >= innerWidth - 1 && r.bottom >= innerHeight - 1,
        tabs: tabs ? {
          count: tabs.querySelectorAll('.ob-set-nav').length,
          touchAction: getComputedStyle(tabs).touchAction,
          oneRow: [...tabs.querySelectorAll('.ob-set-nav')].every((b) =>
            Math.abs(b.getBoundingClientRect().top
              - tabs.querySelector('.ob-set-nav').getBoundingClientRect().top)
              < 2),
        } : null,
        bodyTouchAction: body ? getComputedStyle(body).touchAction : null,
        actionsVisible: !!actions && actions.getClientRects().length > 0 };
    })()`);
    push(page, sheet.open === true, 'settings sheet opens from the gear',
      '015 §5 / phone-hud.md §3.2');
    if (sheet.open) {
      push(page, sheet.fullscreen === true,
        'settings sheet is FULL-SCREEN on phone', '015 §5 presentation');
      await btnWalk(`${page} settings sheet`);
      push(page, sheet.rows.found === true && sheet.actionsVisible === true,
        `#ob-settings-actions carries the Share + Re-rack rows `
        + `(${JSON.stringify(sheet.rows)})`,
        '015 §5 actions region (phone-hud §3.2 mechanism unchanged)');
      push(page, sheet.touchAction === 'pan-y'
        && sheet.bodyTouchAction === 'pan-y',
      `sheet + content pan-y (got '${sheet.touchAction}'/`
        + `'${sheet.bodyTouchAction}')`,
      'phone-hud.md §4 defenses / 015 §5 content scroll');
      // FOUR pills since feature 034 (game migrated to the play place, after
      // 032 took equipment — the sanctioned in-slice re-cut; the
      // e2e-settings F arm mirrors it)
      push(page, !!sheet.tabs && sheet.tabs.count === 4
        && sheet.tabs.touchAction === 'pan-x' && sheet.tabs.oneRow,
      `tab strip: 4 .ob-set-nav pills, single row, pan-x `
        + `(${JSON.stringify(sheet.tabs)})`,
      '015 §5 navigation (same nav buttons as the desktop rail)');
      await setRoot('#ob-settings');
      for (const locale of GAME_LOCALES) {
        await chrome.eval(`window.__settings.set('language', '${locale}')`);
        await sleep(450);
        // walk every registry pane: panes toggle `hidden`, so offenders
        // are only measurable on the active section (015 §6).
        // NB1: `safe` is out of scope here — the tab strip scrolls pan-x by
        // design (015 §5), so scrolled-out pills legitimately extend past
        // the safe-area edge until scrolled into reach.
        // NB2: section switching runs NODE-side — page-side setTimeout
        // chains fall under headless Chrome's intensive wake-up throttling
        // (~1 tick/min after 5 min of page lifetime) and stall the run.
        const f = { tap: [], trunc: [] };
        for (const sec of SECTION_IDS) {
          await chrome.eval(`window.__settings.show('${sec}')`);
          await sleep(60);
          const one = await chrome.eval(phoneWalkerJs(w, h));
          for (const k of Object.keys(f)) {
            for (const b of one[k]) f[k].push(`${sec}:${b}`);
          }
          // the 2026-07 button pair needs the pane OPEN: panes toggle
          // `hidden`, and both walkers skip boxless elements, so a pane that
          // is not the active one is invisible to them. Two locales (en + the
          // widest, de) instead of all seven: the ratchet is locale-invariant
          // and centring only moves with the label metrics.
          if (locale === 'en' || locale === 'de') {
            await btnWalk(`${page} sheet ${sec} [${locale}]`);
          }
        }
        await chrome.eval(`window.__settings.show('assists')`); // 034: never show('game') mid-audit
        for (const k of Object.keys(f)) {
          f[k] = [...new Set(f[k])].slice(0, 8);
        }
        pushClass(`${page} sheet [${locale}]`,
          'sheet controls ≥44pt + untruncated (×6 sections)',
          [...f.tap, ...f.trunc], '015 §5 / phone-hud.md §3.10/§5');
      }
      await setRoot(null);
      await chrome.eval(`window.__settings.set('language', 'en')`);
      await sleep(300);
      await chrome.eval(`document.getElementById('ob-gear')?.click?.()`);
      await sleep(400);
    }

    // decision prompt sweep (dry-break 4.3(d), composed via the rules seams)
    const dec = await composeDecisionPrompt();
    push(page, dec === true, 'decision prompt composable (dry-break 4.3(d))',
      'touch-e2e.md §4.1 decision prompts');
    if (dec) {
      await setRoot('#hud-decision');
      for (const locale of GAME_LOCALES) {
        await chrome.eval(`window.__settings.set('language', '${locale}')`);
        await sleep(450);
        const f = await chrome.eval(phoneWalkerJs(w, h));
        pushClass(`${page} decision [${locale}]`,
          'decision options ≥44pt + untruncated + inside safe areas',
          [...f.tap, ...f.trunc, ...f.safe], 'phone-hud.md §3.10');
      }
      await setRoot(null);
      await chrome.eval(`window.__settings.set('language', 'en')`);
      await sleep(300);
      await chrome.eval('window.__rules.decide(1)');
      await sleep(400);
    }

    // pocket picker (ships with T032/US3): audited whenever the status-strip
    // call indicator opens a sheet; absence is a deferral note, not a
    // finding — T031/T035 gate the picker itself.
    const picker = await chrome.eval(`(async () => {
      if (window.__aim?.nominationRequired?.() !== true) return { state: 'no-nomination' };
      const cand = [...document.querySelectorAll('[id*="call" i], [class*="call" i]')]
        .find((el) => el.getClientRects().length > 0
          && el.getBoundingClientRect().top < innerHeight * 0.3
          && (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button'));
      if (!cand) return { state: 'no-indicator' };
      cand.click();
      await new Promise((r) => setTimeout(r, 700));
      const sheet = [...document.querySelectorAll('body *')].find((el) =>
        getComputedStyle(el).position === 'fixed'
        && el.getClientRects().length > 0
        && /picker|pocket/i.test(el.id + ' ' + el.className));
      if (!sheet) return { state: 'no-sheet' };
      const opts = [...sheet.querySelectorAll('button, [role=button]')]
        .filter((el) => el.getClientRects().length > 0);
      const small = opts.filter((el) => {
        const r = el.getBoundingClientRect();
        return Math.min(r.width, r.height) < 43.5;
      }).length;
      return { state: 'open', options: opts.length, small };
    })()`);
    if (picker.state === 'open') {
      push(page, picker.options > 0 && picker.small === 0,
        `pocket picker sheet options ≥44pt (${JSON.stringify(picker)})`,
        'phone-hud.md §3.8');
      await pressKey('Escape', 'Escape', 27);
      await sleep(400);
    } else {
      console.log(`  OK   [${page}] pocket picker ${picker.state} — audited when`
        + ' the T032 surface lands (T031/T035 gate it)');
    }

    // rotate prompt at portrait (this viewport's portrait twin)
    await setPhoneMetrics(chrome, { width: h, height: w });
    await sleep(800);
    const rot = await chrome.eval(`(() => {
      const r = window.__tp.el('#ob-rotate');
      let inert = false;
      const el = document.getElementById('ob-rotate');
      if (el && r.visible) {
        const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        inert = !!hit && (hit === el || el.contains(hit));
      }
      return { ...r, inert };
    })()`);
    push(page, rot.found && rot.visible && rot.x <= 1 && rot.y <= 1
      && rot.w >= h - 2 && rot.h >= w - 2 && rot.inert,
    `rotate prompt covers the portrait viewport, chrome inert (${JSON.stringify(rot)})`,
    'phone-hud.md §3.1 / FR-003');
    if (rot.found && rot.visible) {
      await setRoot('#ob-rotate');
      for (const locale of GAME_LOCALES) {
        await chrome.eval(`window.__settings.set('language', '${locale}')`);
        await sleep(400);
        const f = await chrome.eval(phoneWalkerJs(h, w));
        pushClass(`${page} rotate [${locale}]`, 'rotate prompt untruncated',
          f.trunc, 'phone-hud.md §3.1 two-line prompt ×7 locales');
      }
      await setRoot(null);
      await chrome.eval(`window.__settings.set('language', 'en')`);
      await sleep(300);
    }
    await setPhoneMetrics(chrome, { width: w, height: h });
    await sleep(600);
    const rot2 = await chrome.eval(`window.__tp.el('#ob-rotate')`);
    push(page, rot2.found && !rot2.visible,
      'rotate prompt hidden back in landscape', 'phone-hud.md §3.1');
  }

  // (GH-443 coarse-register leg — the rules-variant CLOSED label on the
  // 667x375 sheet, every game × locale — RETIRED by feature 034 / 525
  // S4a-mig: the picker left the settings modal for the play card's CARD
  // LIST, which has no closed control; the desktop auditVariantClosedLabels
  // arm gates the list's fit ×7 on the play place and the phone hop's play
  // block (034a-front T035) walks the same card at the coarse register.)

  // GH-668 S5 kit laws on the 667x375 SETTINGS SHEET register (step 10a kept
  // this register when the GH-443 game walk above retired with 034a-mig): the
  // modal is still a live kit surface — open it once at the tightest coarse
  // viewport and judge A1-A8 / A12 on its rendered frame per locale.
  await setPhoneMetrics(chrome, { width: 667, height: 375 });
  await sleep(600);
  {
    await chrome.eval(`document.getElementById('ob-gear')?.click?.()`);
    await sleep(500);
    for (const locale of GAME_LOCALES) {
      await chrome.eval(`window.__settings.set('language', '${locale}')`);
      await sleep(400);
      await setRoot('#ob-settings');
      await auditKitLaws(report, 'phone 667x375 sheet', { locale, coarse: true });
      await setRoot(null);
    }
    await chrome.eval(`window.__settings.set('language', 'en')`);
    await sleep(300);
    await chrome.eval(`document.getElementById('ob-gear')?.click?.()`);
    await sleep(400);
  }

  // GH-316: the SCORE-GROWTH arm, phone device class — the owner report's
  // exact profile (852×393 coarse; the notch insets from the boot-time
  // PHONE_SA emulation stay in force). Runs LAST in the phone section so
  // its discipline staging cannot leak into the walker legs above.
  await setPhoneMetrics(chrome, { width: 852, height: 393 });
  await sleep(600);
  try {
    await auditScoreGrowth(report, 'phone 852x393');
  } catch (e) {
    fail('score-growth arm unreachable (phone): ' + (e.message ?? e));
  }

  // GH-360: the 10-ball push-out FIRE-strip button — runs AFTER the base
  // walkers (same leak law as the score-growth arm) and BEFORE the GH-331
  // block's own navigation
  try {
    await auditPushoutStrip(report);
  } catch (e) {
    fail('push-out strip arm unreachable (phone): ' + (e.message ?? e));
  }
  // build 20: the game-switch progress overlay on the phone register
  try {
    await auditSwitchOverlay(report, 'phone 852x393');
  } catch (e) {
    fail('switch overlay arm unreachable (phone): ' + (e.message ?? e));
  }

  // ---- GH-331: strip hint banner × transition picker (852x393) -------------
  // The passive hint (fixed, bottom-150px band, pointer-events:none) painted
  // OVER the picker's Move row on the phone profile: z 91 > 90, and
  // openTransPicker writes S.sel directly so select()'s hint sync never ran.
  // Law: while ANY popover is open the hint HIDES (yields), restores when
  // the popover closes under a standing block selection, and its computed z
  // sits UNDER .ob-pb-pop (the stale-module belt). Own archive-armed boot
  // (the auditPlaybackCard precedent).
  {
    await setPhoneMetrics(chrome, { width: 852, height: 393 });
    await chrome.send('Page.navigate', { url: `${APP_URL}&obtool=1&archive=1` });
    await waitReady();
    await sleep(1000);
    const err331 = await chrome.eval(
      '__test.shoot({ v0: 1.6, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
    let st331 = 'PLAYBACK';
    for (let i = 0; i < 150 && (st331 === 'PLAYBACK' || st331 === 'SIMULATING'); i++) {
      await sleep(300); st331 = await chrome.eval('__test.state()');
    }
    await chrome.eval('window.__archive?.flush?.()');
    const sid331 = await chrome.eval(
      '(async () => (await window.__archive?.sessions?.())?.[0]?.id ?? null)()');
    const open331 = Number.isFinite(sid331) && !err331
      && await chrome.eval(`window.__playback.openSession(${sid331})`) === true;
    let strip331 = false;
    for (let i = 0; i < 50 && !strip331; i++) {
      await sleep(200);
      strip331 = await chrome.eval(
        'window.__playback.strip?.()?.mounted?.() === true');
    }
    if (!open331 || !strip331) {
      push('phone 852x393', false,
        'GH-331 strip-hint × picker geometry NOT audited (no session/strip)',
        'the phone hint × picker law must be measurable');
    } else {
      const g331 = await chrome.eval(`(async () => {
        const p = window.__playback;
        p.setCutPlan({ cuts: [
          { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
          { seg: 0, t: 0.5, cam: 3, transitionIn: 0, dur: 0 }], poses: [] });
        const strip = p.strip();
        strip.setExpanded(true);
        strip.select(0); // block selection → the editing hint shows
        await new Promise((r) => setTimeout(r, 150));
        const hint = document.querySelector('.ob-pb-strip-hint');
        const before = !!hint && hint.style.display !== 'none';
        strip.openTransPicker(1);
        await new Promise((r) => setTimeout(r, 150));
        const pop = document.getElementById('ob-pb-transpick');
        const hidden = !!hint && hint.style.display === 'none';
        const zHint = hint ? +getComputedStyle(hint).zIndex : null;
        const zPop = pop ? +getComputedStyle(pop).zIndex : null;
        const move = pop && [...pop.querySelectorAll('.ob-pb-transopt')][1];
        const mr = move ? move.getBoundingClientRect() : null;
        strip.closePop();
        // flyout leg: the block selection stands; the flyout must borrow
        // the band and hand it back on close (the restore law)
        strip.select(0);
        await new Promise((r) => setTimeout(r, 100));
        strip.openSlotFlyout();
        await new Promise((r) => setTimeout(r, 150));
        const hiddenFly = hint.style.display === 'none';
        strip.closePop();
        await new Promise((r) => setTimeout(r, 100));
        const restored = hint.style.display !== 'none'
          && hint.textContent === window.__i18n.t('playback.strip.editing');
        p.close();
        return { before, hidden, zHint, zPop, hiddenFly, restored,
          moveOnScreen: !!mr && mr.top >= 0 && mr.bottom <= innerHeight };
      })()`);
      push('phone 852x393', g331.before === true && g331.hidden === true
        && g331.zHint !== null && g331.zPop !== null && g331.zHint < g331.zPop
        && g331.hiddenFly === true && g331.restored === true
        && g331.moveOnScreen === true,
      'strip hint yields to the open transition picker/flyout and restores '
        + `(GH-331) — ${JSON.stringify(g331)}`,
      'GH-331: the passive hint never covers an interactive popover '
        + '(hide-on-popover + z-under-pop belt) on the phone profile');
    }
  }

  // 031 (T027): the phone shell register — obshell=1 posed page, shell
  // chrome walked at the landscape + portrait phone viewports across all
  // seven locales (44 pt both dimensions, containment, single-row rail)
  // plus the walker classes scoped to the shell root
  {
    await setPhoneMetrics(chrome, { width: 844, height: 390 });
    await chrome.send('Page.navigate',
      { url: `${APP_URL}&obtool=1&obshell=1&u=shellphone` });
    await waitReady();
    let up = false;
    for (let i = 0; i < 50 && !up; i++) {
      up = await chrome.eval('window.__shell?.isOpen?.() === true')
        .catch(() => false);
      if (!up) await sleep(200);
    }
    if (!up) {
      push('phone shell', false, 'obshell phone boot never opened the shell',
        '031 contract §4: obshell=1 poses the shell for fixtures');
    } else {
      for (const [w, h] of [[844, 390], [390, 844]]) {
        const page = `phone shell ${w}x${h}`;
        await setPhoneMetrics(chrome, { width: w, height: h });
        await sleep(500);
        for (const locale of GAME_LOCALES) {
          await chrome.eval(`window.__settings.set('language', '${locale}')`);
          await sleep(400);
          await setRoot('#ob-shell');
          await auditKitLaws(report, page, { locale, coarse: true });
          await setRoot(null);
          const g = await chrome.eval(`(() => {
            const bad = [];
            const rail = document.getElementById('ob-shell-rail');
            const els = [
              ...document.querySelectorAll('#ob-shell-rail .ob-shell-place'),
              document.getElementById('ob-shell-settings'),
              document.getElementById('ob-shell-quickplay'),
              document.querySelector('[data-ob="shell-remember"]')]
              .filter((el) => el && el.getClientRects().length // R4: the remember row folds into quick-play on coarse
                // review r4 P2: collapsed focus-reveal row (sr-only box) at rest — e2e-shell F judges its keyboard path
                && !(el.hasAttribute('data-ob-focus-reveal') && getComputedStyle(el).opacity === '0'));
            for (const el of els) {
              const r = el.getBoundingClientRect();
              const id = el.dataset.place ?? el.id ?? el.dataset.ob;
              if (r.width < 43.5 || r.height < 43.5) {
                bad.push(id + ' under 44pt (' + r.width.toFixed(1) + 'x'
                  + r.height.toFixed(1) + ')');
              }
              // rail children live in a pan-x single row (the 015 §5 phone
              // tab-strip idiom): containment is judged on the RAIL box;
              // free-standing chrome is judged on the viewport
              if (!rail.contains(el)
                && (r.left < -0.5 || r.right > innerWidth + 0.5)) {
                bad.push(id + ' breaches the viewport');
              }
              if (el.scrollWidth > el.clientWidth + 1) bad.push(id + ' clips');
            }
            const rr = rail.getBoundingClientRect();
            if (rr.left < -0.5 || rr.right > innerWidth + 0.5) {
              bad.push('rail box breaches the viewport');
            }
            const tops = [...document.querySelectorAll(
              '#ob-shell-rail .ob-shell-place')]
              .map((el) => el.getBoundingClientRect().top);
            if (Math.max(...tops) - Math.min(...tops) >= 2) {
              bad.push('rail wrapped');
            }
            // GH-534 round 7 ARM (the CENTER-SYMMETRY law, kit strip
            // control): when the rail content FITS, the block centers —
            // start/end residuals (border edge to first/last child, the
            // settings gear included) agree within 1px; overflow pans
            // under the optical-inset/scroll-padding law instead
            if (rail.scrollWidth <= rail.clientWidth + 1) {
              const rcs = getComputedStyle(rail);
              const kids = [...rail.children]
                .filter((q) => q.getClientRects().length);
              if (kids.length) {
                const rsv = kids[0].getBoundingClientRect().left
                  - (rr.left + parseFloat(rcs.borderLeftWidth));
                const rev = (rr.right - parseFloat(rcs.borderRightWidth))
                  - kids[kids.length - 1].getBoundingClientRect().right;
                if (Math.abs(rsv - rev) > 1) {
                  bad.push('rail content not centered (start residual '
                    + rsv.toFixed(2) + ' vs end ' + rev.toFixed(2) + ')');
                }
              }
            }
            // review visual audit P0 (2026-08-13): the quick-play stack must
            // stay DISJOINT from the rail, and the touch register's
            // body-level gameplay chrome must be hidden under the shell
            const qpw = document.getElementById('ob-shell-quickplay-wrap');
            const a = rail.getBoundingClientRect();
            const b = qpw.getBoundingClientRect();
            const ow = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const oh = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ow > 0 && oh > 0) {
              bad.push('quick-play stack overlaps the rail ('
                + ow.toFixed(0) + 'x' + oh.toFixed(0) + 'px)');
            }
            for (const id of ['ob-push-btn', 'ob-power-gauge', 'ob-spin-btn',
              'ob-fine-cluster']) {
              const el = document.getElementById(id);
              if (el && el.getClientRects().length
                && getComputedStyle(el).visibility !== 'hidden') {
                bad.push('#' + id + ' visible under the open shell (FR-017)');
              }
            }
            return bad;
          })()`);
          pushClass(`${page} [${locale}]`, 'shell chrome 44pt/containment/no-clip',
            g, '031 contract §6 phone register (44 pt, safe-area, never wrap)');
        }
      }
      await chrome.eval(`window.__settings.set('language', 'en')`);
      await sleep(300);
      await setRoot('#ob-shell');
      await btnWalk('phone shell');
      await setRoot(null);

      // 032 (T025): the atelier joins the phone walker — five stations at
      // both viewports ×7 locales (44 pt both dimensions, containment,
      // no h-overflow) + the cue-card SHEET geometry, then the walker
      // classes scoped to the atelier roots
      await chrome.eval(`window.__shell.go('equipment')`);
      let atl = false;
      for (let i = 0; i < 40 && !atl; i++) {
        atl = await chrome.eval('typeof window.__atelier === "object"')
          .catch(() => false);
        if (!atl) await sleep(150);
      }
      if (!atl) {
        push('phone atelier', false,
          'equipment arrival never mounted the atelier', '032 contract §3');
      } else {
        for (const [w, h] of [[844, 390], [390, 844]]) {
          const page = `phone atelier ${w}x${h}`;
          await setPhoneMetrics(chrome, { width: w, height: h });
          await sleep(400);
          for (const locale of GAME_LOCALES) {
            await chrome.eval(`window.__settings.set('language', '${locale}')`);
            await sleep(300);
            await setRoot('#ob-atelier');
            await auditKitLaws(report, page, { locale, coarse: true });
            await setRoot(null);
            const ga = await chrome.eval(`(async () => {
              const bad = [];
              for (const st of ['cues', 'table', 'cloth', 'balls', 'lighting']) {
                window.__atelier.go(st);
                await new Promise((r) => setTimeout(r, 80));
                // GH-525 dev 12: the BODY-level rail's cards + the
                // reparented cloth chips join the 44 pt walk explicitly
                for (const el of document.querySelectorAll(
                  '#ob-atelier button, #ob-atelier [role="radio"],'
                  + ' #ob-atelier-rail button,'
                  + ' #ob-atelier-rail [role="radio"]')) {
                  if (!el.getClientRects().length) continue;
                  const r = el.getBoundingClientRect();
                  const id = (el.dataset.station ?? el.dataset.color
                    ?? el.dataset.id ?? el.closest('[data-ob]')?.dataset.ob
                    ?? el.className.split(' ')[0]) + '@' + st;
                  if (r.width < 43.5 || r.height < 43.5) {
                    bad.push(id + ' under 44pt (' + r.width.toFixed(1) + 'x'
                      + r.height.toFixed(1) + ')');
                  }
                }
                // GH-525 dev 12 (the entry-10 pattern on the phone walk):
                // rail cards block-contained in the scroll viewport (0.5px;
                // inline panning is by design) + names never truncate
                const rs = window.__atelier?.rail?.();
                if (rs?.live && !rs.hidden) {
                  const rc = document.querySelector(
                    '[data-ob="atelier-rail-cards"]');
                  const rr = rc.getBoundingClientRect();
                  for (const b of rc.querySelectorAll('.ob-cardrail-card')) {
                    if (!b.getClientRects().length) continue;
                    const br = b.getBoundingClientRect();
                    if (br.top < rr.top - 0.5 || br.bottom > rr.bottom + 0.5) {
                      bad.push('rail card ' + b.dataset.id
                        + ' clipped by the rail viewport@' + st);
                    }
                    const nm = b.querySelector('.ob-cardrail-name');
                    if (nm && nm.scrollWidth > nm.clientWidth + 1) {
                      bad.push('rail card name truncated: '
                        + b.dataset.id + '@' + st);
                    }
                  }
                }
                const cards = document.getElementById('ob-atelier-cards');
                if (cards.scrollWidth > cards.clientWidth + 1) {
                  bad.push('station cards h-overflow@' + st);
                }
                // GH-534 item C (S2.5): the station strip must contain its
                // own pills on the BLOCK axis — the flex-squeeze class (the
                // capped host column + min-height:0 + the overflow-x:auto
                // scroll-container min-height zeroing let the strip shrink
                // alongside the cards scroller and clip the selected pill
                // top+bottom). Inline-axis panning is by design (the
                // shell-rail idiom), so only top/bottom are gated.
                const nav = document.getElementById('ob-atelier-carousel');
                if (!nav) {
                  bad.push('station strip missing@' + st);
                } else {
                  const nr = nav.getBoundingClientRect();
                  for (const p of nav.querySelectorAll('[data-station]')) {
                    if (!p.getClientRects().length) continue;
                    const pr = p.getBoundingClientRect();
                    if (pr.top < nr.top - 0.5 || pr.bottom > nr.bottom + 0.5) {
                      bad.push('station pill ' + p.dataset.station
                        + ' clipped by the strip@' + st);
                    }
                  }
                  // GH-534 owner round 3 ARM (the optical-inset law, phone
                  // register — the pinned full-bleed band included): the
                  // strip's first/last INLINE insets are never tighter
                  // than its block inset, at BOTH scroll extremes (the
                  // long-locale panning register). Red-proven against the
                  // pre-fix sheet (padding sp-2/sp-1).
                  const ncs = getComputedStyle(nav);
                  const sPills = [...nav.querySelectorAll('[data-station]')]
                    .filter((q) => q.getClientRects().length);
                  if (sPills.length) {
                    const save = nav.scrollLeft;
                    nav.scrollLeft = 0;
                    let nb = nav.getBoundingClientRect();
                    const fr0 = sPills[0].getBoundingClientRect();
                    const gTop = fr0.top
                      - (nb.top + parseFloat(ncs.borderTopWidth));
                    const gStart = fr0.left
                      - (nb.left + parseFloat(ncs.borderLeftWidth));
                    nav.scrollLeft = nav.scrollWidth; // clamps to max
                    nb = nav.getBoundingClientRect();
                    const lr0 = sPills[sPills.length - 1]
                      .getBoundingClientRect();
                    const gEnd = (nb.right
                      - parseFloat(ncs.borderRightWidth)) - lr0.right;
                    nav.scrollLeft = save;
                    if (gStart < gTop - 0.5 || gEnd < gTop - 0.5) {
                      bad.push('station strip inline inset tighter than its'
                        + ' block inset@' + st + ' (start '
                        + gStart.toFixed(2) + ' / end ' + gEnd.toFixed(2)
                        + ' vs block ' + gTop.toFixed(2) + ')');
                    }
                    // GH-534 round 7 ARM (the CENTER-SYMMETRY law): when
                    // the content FITS, the block centers — start and end
                    // residuals (border-edge to first/last child) agree
                    // within 1px. When it overflows, the strip pans and
                    // the optical-inset/scroll-padding law above owns the
                    // edges. Red-proven against the pre-fix start-aligned
                    // strip (start residual = inset, end = the whole free
                    // run).
                    if (nav.scrollWidth <= nav.clientWidth + 1) {
                      const kids = [...nav.children]
                        .filter((q) => q.getClientRects().length);
                      if (kids.length) {
                        const cb = nav.getBoundingClientRect();
                        const rs = kids[0].getBoundingClientRect().left
                          - (cb.left + parseFloat(ncs.borderLeftWidth));
                        const re = (cb.right
                          - parseFloat(ncs.borderRightWidth))
                          - kids[kids.length - 1]
                            .getBoundingClientRect().right;
                        if (Math.abs(rs - re) > 1) {
                          bad.push('station strip content not centered@'
                            + st + ' (start residual ' + rs.toFixed(2)
                            + ' vs end ' + re.toFixed(2) + ')');
                        }
                      }
                    }
                  }
                  // GH-525 S2.5 strip-pin ARM (the Item-C read, post-audit
                  // remedial): at rest scroll the station strip sits FULLY
                  // INSIDE the host's visible clip box on EVERY station
                  // (0.5px tolerance — no mid-pill cut). The finding-5
                  // review-remedial cap (62vh−178, overflow clip) had cut
                  // the strip mid-pill at rest on every landscape
                  // phone-sheet still; the strip now rides the host
                  // scroller as a PINNED HEADER (sticky top:0, first in
                  // visual order — the a13dc6dd pinned-actions-footer
                  // grammar mirrored to the top edge) over a strip-floored
                  // cap (max(64px, …)); heading/hint/advanced content
                  // scrolls beneath it.
                  const hostEl = document.querySelector(
                    '#ob-shell-cards > section.ob-atelier-host');
                  if (hostEl) {
                    hostEl.scrollTop = 0; // at-rest scroll is the register
                    await new Promise((r) =>
                      requestAnimationFrame(() => r()));
                    const hs = getComputedStyle(hostEl);
                    const hr = hostEl.getBoundingClientRect();
                    const clipTop = hr.top + parseFloat(hs.borderTopWidth);
                    const clipBot = hr.bottom
                      - parseFloat(hs.borderBottomWidth);
                    const sr = nav.getBoundingClientRect();
                    if (sr.top < clipTop - 0.5 || sr.bottom > clipBot + 0.5) {
                      bad.push('station strip cut by the host clip box@'
                        + st + ' (strip ' + sr.top.toFixed(2) + '..'
                        + sr.bottom.toFixed(2) + ' vs clip '
                        + clipTop.toFixed(2) + '..' + clipBot.toFixed(2)
                        + ')');
                    }
                  }
                }
                // GH-525 bare review review round-1 (finding 1) ARM: at the
                // cloth station the rail band grows the sub row (cloth
                // chips pill) ABOVE the cards — the later-painted shell
                // host must end >= 4px above the band's REAL top edge
                // (sub row included), and no VISIBLE cloth chip may be
                // hit-test occluded by the host (the evidence class: the
                // host floated over the pill and swallowed chip taps).
                // Chips scrolled out of the pan row are not judged — only
                // centers inside the scroller's visible box hit-test.
                if (st === 'cloth' && rs?.live && !rs.hidden) {
                  const host = document.querySelector(
                    '#ob-shell-cards > section.ob-atelier-host');
                  const ra = document.getElementById('ob-atelier-rail');
                  const sub = document.querySelector(
                    '[data-ob="atelier-rail-sub"]');
                  if (!host || !ra || !ra.getClientRects().length) {
                    bad.push('cloth clearance arm: host/rail missing');
                  } else if (!sub || sub.hidden
                    || !sub.getClientRects().length) {
                    bad.push('cloth sub row not visible at the cloth station');
                  } else {
                    const hbox = host.getBoundingClientRect();
                    const hb = hbox.bottom;
                    const rt = ra.getBoundingClientRect().top;
                    // GH-525 S2.5 strip-pin: on the FLOOR register (the
                    // strip-floored cap max(64px, …) binding — landscape
                    // notch budgets under 64px) the host-clears-band law
                    // lawfully YIELDS to the pinned strip's whole read
                    // (the strip wins; it is navigation — the finding-4/
                    // finding-6 floor grammar). The chip probe below then
                    // requires a tappable sliver BELOW the band instead
                    // of a clear center.
                    const stripFloor = innerWidth > innerHeight
                      && Math.abs(hbox.height - 64) <= 0.5;
                    if (hb > rt - 4 && !stripFloor) {
                      bad.push('host bottom does not clear the rail band '
                        + 'top incl. the sub row (host ' + hb.toFixed(2)
                        + ' vs rail top ' + rt.toFixed(2)
                        + ' — need >= 4px)');
                    }
                    const box = sub.querySelector(
                      '[data-ob="atelier-cloth-colors"]');
                    const br2 = box ? box.getBoundingClientRect() : null;
                    const seen = box ? [...box.querySelectorAll(
                      '.ob-cloth-chip')].filter((ch) => {
                      if (!ch.getClientRects().length) return false;
                      const r = ch.getBoundingClientRect();
                      const cx = (r.left + r.right) / 2;
                      const cy = (r.top + r.bottom) / 2;
                      return cx > br2.left + 1 && cx < br2.right - 1
                        && cy > br2.top - 1 && cy < br2.bottom + 1
                        && cy > 0 && cy < innerHeight;
                    }) : [];
                    if (!seen.length) {
                      bad.push('no visible cloth chip in the sub row');
                    }
                    // the portrait rotate prompt is a BY-DESIGN full-
                    // viewport scrim above every surface (touch.css z 80;
                    // shell.css: '#ob-rotate deliberately stays') — raw
                    // elementFromPoint would only ever see it. The probe
                    // judges the HOST-vs-rail layers beneath: it lifts the
                    // scrim for the hit-test and restores it before
                    // returning; the red condition is scoped to the
                    // finding's class (the hit resolving INSIDE the host).
                    const rot = document.getElementById('ob-rotate');
                    const rotDisp = rot ? rot.style.display : null;
                    if (rot) rot.style.display = 'none';
                    const minTop = Math.min(...seen.map((ch) =>
                      ch.getBoundingClientRect().top));
                    for (const ch of seen) {
                      const r = ch.getBoundingClientRect();
                      if (r.top > minTop + 1) continue; // top chip row only
                      const hit = document.elementFromPoint(
                        (r.left + r.right) / 2, (r.top + r.bottom) / 2);
                      if (hit && host.contains(hit) && !ch.contains(hit)) {
                        if (stripFloor) {
                          // floor register: the pinned band lawfully rides
                          // over the pill's top — the chip stays LIVE on a
                          // >= 4px tappable sliver below the host bottom
                          // (measured 12.25px at the walked 21px inset)
                          const sliver = r.bottom - hb;
                          const hit2 = sliver >= 4
                            ? document.elementFromPoint(
                              (r.left + r.right) / 2,
                              Math.min(r.bottom - 2, hb + sliver / 2))
                            : null;
                          if (!hit2 || !ch.contains(hit2)) {
                            bad.push('cloth chip ['
                              + (ch.dataset.color || 'factory')
                              + '] unreachable under the floor-register '
                              + 'band (sliver ' + sliver.toFixed(2)
                              + 'px below host ' + hb.toFixed(2) + ')');
                          }
                        } else {
                          bad.push('cloth chip ['
                            + (ch.dataset.color || 'factory')
                            + '] hit-test occluded by the host ('
                            + (hit.id
                              || String(hit.className || '').split(' ')[0]
                              || hit.tagName) + ')');
                        }
                      }
                    }
                    if (rot) rot.style.display = rotDisp;
                  }
                }
                // GH-525 bare review review round-2 (finding 5) ARM: the
                // BASE --rail host cap now carries the env() inset terms
                // (the boot-time PHONE_SA emulation holds a 21px bottom
                // inset through this walk) — the host must clear the CARD
                // band top by >= 4px at EVERY non-cloth station too (the
                // capless class: es/de landscape measured a ~13px
                // host-over-band overlap pre-fix; the cloth branch above
                // owns the sub-row band).
                if (st !== 'cloth' && rs?.live && !rs.hidden) {
                  const host = document.querySelector(
                    '#ob-shell-cards > section.ob-atelier-host');
                  const ra = document.getElementById('ob-atelier-rail');
                  if (host && ra && ra.getClientRects().length) {
                    const hbox = host.getBoundingClientRect();
                    const hb = hbox.bottom;
                    const rt = ra.getBoundingClientRect().top;
                    // GH-525 S2.5 strip-pin: the floor-register yield (see
                    // the cloth branch above) — where the strip-floored
                    // cap binds, the clearance law yields and the band's
                    // CARDS must instead stay live beneath the floored
                    // host (center below the host bottom + hit-testable;
                    // cards panned out of the rail scrollport are not
                    // judged — the chip-probe discipline).
                    const stripFloor = innerWidth > innerHeight
                      && Math.abs(hbox.height - 64) <= 0.5;
                    if (hb > rt - 4 && !stripFloor) {
                      bad.push('host bottom does not clear the rail band '
                        + 'top@' + st + ' (host ' + hb.toFixed(2)
                        + ' vs rail top ' + rt.toFixed(2)
                        + ' — need >= 4px; the base --rail env-cap law)');
                    } else if (hb > rt - 4 && stripFloor) {
                      const rc2 = document.querySelector(
                        '[data-ob="atelier-rail-cards"]');
                      const rb2 = rc2 ? rc2.getBoundingClientRect() : null;
                      const rot = document.getElementById('ob-rotate');
                      const rotDisp = rot ? rot.style.display : null;
                      if (rot) rot.style.display = 'none';
                      for (const b of (rc2 ? rc2.querySelectorAll(
                        '.ob-cardrail-card') : [])) {
                        if (!b.getClientRects().length) continue;
                        const r = b.getBoundingClientRect();
                        const cx = (r.left + r.right) / 2;
                        const cy = (r.top + r.bottom) / 2;
                        if (cx < rb2.left + 1 || cx > rb2.right - 1) {
                          continue; // panned out of the rail scrollport
                        }
                        const hit = document.elementFromPoint(cx, cy);
                        if (cy <= hb || !hit || !b.contains(hit)) {
                          bad.push('rail card ' + b.dataset.id
                            + ' not live under the floor-register host@'
                            + st + ' (center ' + cy.toFixed(2)
                            + ' vs host bottom ' + hb.toFixed(2) + ')');
                        }
                      }
                      if (rot) rot.style.display = rotDisp;
                    }
                  }
                }
              }
              // the cues deep card presents as a SHEET on coarse pointers —
              // a RAIL card tap is the healthy pick surface (dev 12; the
              // row pick stands as the degrade-register fallback).
              // GH-525 review visual-audit round 1 (finding 2): the pick
              // drives the WORST-NAME card (longest rendered name — the
              // widest card this locale can produce) so the selection-snap
              // containment arm below stresses the real worst case.
              // #1215 (the #1214 ranking): only a card a tap can select
              // competes — an aria-disabled card is browse-only (no
              // selection, no snap) — names are measured after the font set
              // settles, and the slot-width scrollWidth tie (names WRAP in
              // the slot) breaks on the name's laid-out text length, then
              // the card id (code-unit order), then DOM order.
              window.__atelier.go('cues');
              await new Promise((r) => setTimeout(r, 80));
              const rc = document.querySelector(
                '[data-ob="atelier-rail-cards"]');
              try {
                await Promise.race([document.fonts?.ready,
                  new Promise((r) => setTimeout(r, 3000))]);
              } catch { /* no Font Loading API: measure as laid out */ }
              const textLen = (el) => {
                let s = 0;
                const tw = document.createTreeWalker(el,
                  NodeFilter.SHOW_TEXT);
                for (let n = tw.nextNode(); n; n = tw.nextNode()) {
                  const rg = document.createRange();
                  rg.selectNodeContents(n);
                  for (const q of rg.getClientRects()) s += q.width;
                }
                return s;
              };
              // #1217 (paired with equipment's fix): the pick is TAPPED, as a
              // finger taps — a CDP touch on the visible part of a card that is
              // reachable (at least partly inside the strip), preferring one
              // that is NOT already whole, so the selection snap must move the
              // strip (at 844x390 on arrival, the right peek card). No setup
              // scroll: the strip is scroll-snap proximity and a user never
              // pans it programmatically.
              const inStrip = (b) => {
                const r = b.getBoundingClientRect(), m = rc.getBoundingClientRect();
                return { inside: r.right > m.left + 1 && r.left < m.right - 1,
                  whole: r.left >= m.left - 0.5 && r.right <= m.right + 0.5 };
              };
              const reachable = (b) => !!rc && inStrip(b).inside;
              const worst = rc ? [...rc.querySelectorAll(
                '.ob-cardrail-card')]
                .filter((b) => b.getAttribute('aria-disabled') !== 'true'
                  && b.getClientRects().length > 0 && reachable(b))
                .map((b, i) => {
                  const nm = b.querySelector('.ob-cardrail-name');
                  return { b, i, id: b.dataset.id ?? '', peek: !inStrip(b).whole,
                    w: nm?.scrollWidth ?? 0, len: nm ? textLen(nm) : 0 };
                })
                .sort((x, y) => (y.peek - x.peek) || (y.w - x.w)
                  || (y.len - x.len)
                  || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
                  || (x.i - y.i))[0]?.b ?? null : null;
              if (!worst) {
                // degrade register (no rail) or no reachable card: the row pick
                // keeps the shipped DOM click; the rail checks below see no pick.
                // The cards mount is static markup, so a stale cardrail leaf (the
                // cache-poison degrade) keeps it: only a LIVE rail owes a card
                document.querySelector('[data-ob="atelier-cues"] .ob-eq-prov-row__pick')
                  ?.click();
                return { bad, pickId: null,
                  rail: !!rc && window.__atelier.rail().live === true };
              }
              const r = worst.getBoundingClientRect(), m = rc.getBoundingClientRect();
              const tapAt = {
                x: Math.round((Math.max(r.left, m.left) + Math.min(r.right, m.right)) / 2),
                y: Math.round((r.top + r.bottom) / 2) };
              // at portrait the rotate prompt is the BY-DESIGN full-viewport
              // scrim above every surface (touch.css z 80): no finger reaches
              // the rail there, so the portrait cell is a rail-MECHANICS
              // check, not a user path. As the cloth probe above does, the
              // arm lifts the scrim for the hit-test and the tap, and the
              // judge eval restores it first thing
              const rot = document.getElementById('ob-rotate');
              const rotLift = !!rot && rot.getClientRects().length > 0;
              const rotDisp = rot ? rot.style.display : '';
              if (rotLift) rot.style.display = 'none';
              const at = document.elementFromPoint(tapAt.x, tapAt.y)
                ?.closest?.('.ob-cardrail-card');
              return { bad, pickId: worst.dataset.id, tapAt, rotLift, rotDisp,
                hit: at === worst ? 'pick' : (at?.dataset?.id ?? 'none') };
            })()`);
            // the tap itself is a trusted CDP touch (touch-cdp.mjs tap): it
            // disarms the rail's arrival judge exactly as a finger does
            if (ga.pickId !== null && ga.hit === 'pick') {
              await tap(chrome, ga.tapAt.x, ga.tapAt.y);
            } else if (ga.pickId !== null) {
              ga.bad.push('worst-name card ' + ga.pickId + ' not tappable at '
                + ga.tapAt.x + ',' + ga.tapAt.y + ' (hit ' + ga.hit + ')');
            } else if (ga.rail) {
              ga.bad.push('no reachable rail card to tap');
            }
            const g = await chrome.eval(`(async () => {
              if (${JSON.stringify(ga.rotLift === true)}) {
                document.getElementById('ob-rotate').style.display
                  = ${JSON.stringify(ga.rotDisp ?? '')};
              }
              const bad = ${JSON.stringify(ga.bad)};
              const pickId = ${JSON.stringify(ga.pickId ?? null)};
              const tapped = ${JSON.stringify(ga.pickId !== null && ga.hit === 'pick')};
              const rc = document.querySelector(
                '[data-ob="atelier-rail-cards"]');
              const worst = pickId === null || !tapped ? null
                : rc?.querySelector('.ob-cardrail-card[data-id="'
                  + CSS.escape(pickId) + '"]') ?? null;
              await new Promise((r) => setTimeout(r, 250));
              if (worst) {
                // #1215: the pick must BECOME the rail's selection (bounded)
                // before its snap is judged — the containment check at the end
                // never reads a card the tap did not select
                const picked = () => window.__atelier.rail().selected
                  === worst.dataset.id;
                const t0 = performance.now();
                while (!picked() && performance.now() - t0 < 3000) {
                  await new Promise((r) => setTimeout(r, 25));
                }
                if (!picked()) {
                  bad.push('worst-name card ' + worst.dataset.id
                    + ' never became the rail selection within 3000 ms'
                    + ' (selected ' + window.__atelier.rail().selected + ')');
                }
              }
              // GH-525 bare review review round-2 (finding 6) ARM: the
              // phone corner law with the Remember tick VISIBLE (the
              // widest quick-play stack) under the in-force notch
              // emulation (PHONE_SA carries a 47px right inset + 21px
              // bottom). The re-derived cap (532 + 2·env(right)) keeps
              // the strip out of the corner wherever the reserve is
              // satisfiable; where the 288px floor binds (this notched
              // landscape: 844 − 532 − 94 < 288) the reserve YIELDS by
              // design — then the overlap is lawful ONLY on the floor
              // register (rail at exactly the floor) with the quick-play
              // stack painting ABOVE the rail (F5 mount order) and its
              // controls still hittable. Pre-fix red: rail 360px wide
              // (off-floor) crossing the tick wrap by ~67px. The tick
              // attribute is restored before returning; hit-tests run in
              // landscape only (the portrait rotate scrim is by-design
              // chrome, and portrait y-bands are disjoint anyway).
              if (rc && window.__atelier.rail().live) {
                const rem = document.querySelector(
                  '[data-ob="shell-remember"]');
                const was = rem ? rem.getAttribute('aria-pressed') : null;
                if (rem) rem.setAttribute('aria-pressed', 'true');
                const qpw = document.getElementById(
                  'ob-shell-quickplay-wrap');
                const qr = qpw.getBoundingClientRect();
                const rcw = rc.getBoundingClientRect();
                const raw = document.getElementById('ob-atelier-rail')
                  .getBoundingClientRect();
                const ow = Math.min(rcw.right, qr.right)
                  - Math.max(rcw.left, qr.left);
                const oh = Math.min(rcw.bottom, qr.bottom)
                  - Math.max(rcw.top, qr.top);
                if (ow > 0 && oh > 0) {
                  if (raw.width > 288.5) {
                    bad.push('rail scrollport crosses the quick-play '
                      + 'corner OFF the 288px floor (rail '
                      + raw.width.toFixed(2) + 'px wide, overlap '
                      + ow.toFixed(0) + 'x' + oh.toFixed(0)
                      + 'px, Remember tick visible)');
                  } else if (innerWidth > innerHeight) {
                    const qp = document.getElementById('ob-shell-quickplay');
                    for (const el of [qp, rem].filter((x) => x && x.getClientRects().length)) {
                      const r2 = el.getBoundingClientRect();
                      const hit = document.elementFromPoint(
                        (r2.left + r2.right) / 2, (r2.top + r2.bottom) / 2);
                      if (!hit || !el.contains(hit)) {
                        bad.push((el.id || el.dataset.ob) + ' occluded '
                          + 'under the floor-register corner overlap ('
                          + (hit ? (hit.id
                            || String(hit.className || '').split(' ')[0]
                            || hit.tagName) : 'none') + ')');
                      }
                    }
                  }
                }
                if (rem && was !== null) {
                  rem.setAttribute('aria-pressed', was);
                }
              }
              const card = document.getElementById('ob-atelier-cue');
              if (card && !card.hidden) {
                const cr = card.getBoundingClientRect();
                if (cr.left < -0.5 || cr.right > innerWidth + 0.5
                  || cr.bottom > innerHeight + 0.5) {
                  bad.push('cue card breaches the viewport');
                }
                if (card.scrollWidth > card.clientWidth + 1) {
                  bad.push('cue card clips horizontally');
                }
                for (const b of card.querySelectorAll('button')) {
                  const r = b.getBoundingClientRect();
                  if (Math.min(r.width, r.height) < 43.5) {
                    bad.push((b.dataset.ob ?? 'card button') + ' under 44pt');
                  }
                }
                // GH-525 dev 12 phone band law: the card-rail band stays
                // DISJOINT from the sheet band (fully above its top edge)
                const ra = document.getElementById('ob-atelier-rail');
                if (ra && ra.getClientRects().length) {
                  const rb = ra.getBoundingClientRect();
                  const ow = Math.min(rb.right, cr.right)
                    - Math.max(rb.left, cr.left);
                  const oh = Math.min(rb.bottom, cr.bottom)
                    - Math.max(rb.top, cr.top);
                  if (ow > 0 && oh > 0) {
                    bad.push('card rail overlaps the sheet band ('
                      + ow.toFixed(0) + 'x' + oh.toFixed(0) + 'px)');
                  }
                }
                // GH-525 review visual-audit round 1 (finding 3) ARM: the
                // COLLAPSED sheet ends on WHOLE lines — the descriptor
                // wears the whole-line clamp, its last visible line sits
                // fully inside the sheet's visible box, and no collapsed
                // text block is sheared mid-line at the 38vh fold (the
                // evidence: the descriptor sheared mid-glyph on every
                // class phone-sheet.png).
                if (window.__atelier.rail().live
                  && !card.classList.contains('ob-atelier-cue--expanded')) {
                  card.scrollTop = 0;
                  await new Promise((r) => requestAnimationFrame(() => r()));
                  const fold = card.getBoundingClientRect().bottom;
                  const plain = card.querySelector('.ob-atelier-plain');
                  const pcs = plain ? getComputedStyle(plain) : null;
                  // NOTE: Blink computes the clamped -webkit-box as
                  // display 'flow-root' (the standard line-clamp
                  // implementation) — key on the clamp itself, never the
                  // display keyword
                  const clamped = !!pcs && (pcs.display === 'none'
                    || (pcs.webkitLineClamp !== 'none'
                      && pcs.overflowY !== 'visible'));
                  if (!clamped) {
                    bad.push('collapsed descriptor missing the whole-line '
                      + 'clamp (display=' + (pcs ? pcs.display : 'none')
                      + ' clamp=' + (pcs ? pcs.webkitLineClamp : '-') + ')');
                  } else if (pcs.display !== 'none'
                    && plain.getClientRects().length) {
                    const pr = plain.getBoundingClientRect();
                    const lh = parseFloat(pcs.lineHeight) || 24;
                    if (pr.bottom > fold + 0.5) {
                      bad.push('collapsed descriptor sheared at the fold ('
                        + pr.bottom.toFixed(2) + ' vs fold '
                        + fold.toFixed(2) + ')');
                    }
                    const lines = Math.round(pr.height / lh);
                    if (lines < 1
                      || Math.abs(pr.height - lines * lh) > 1.5) {
                      bad.push('collapsed descriptor not whole lines (h='
                        + pr.height.toFixed(2) + ' lh=' + lh.toFixed(2)
                        + ')');
                    }
                  }
                  for (const el of card.querySelectorAll(
                    'h3, .ob-atelier-actions .ob-btn')) {
                    if (!el.getClientRects().length) continue;
                    const r = el.getBoundingClientRect();
                    if (r.top < fold - 0.5 && r.bottom > fold + 0.5) {
                      bad.push((el.dataset.ob ?? el.tagName.toLowerCase())
                        + ' sheared mid-line at the collapsed fold ('
                        + r.top.toFixed(2) + '..' + r.bottom.toFixed(2)
                        + ' vs fold ' + fold.toFixed(2) + ')');
                    }
                  }
                }
              } else bad.push('cue card never presented');
              // #1217 (paired with equipment's fix): the rail is judged as a user
              // sees it — with the sheet CLOSED. At 844x390 the rail yields to
              // the sheet (ob-atelier-rail--yield) and a tapped snap stays where
              // the yield caught it; the sheet arms above needed the sheet up,
              // so the containment check runs last: close the sheet, then wait,
              // bounded, until the rail is back from its yield, the pick is
              // WHOLE inside the strip and the strip holds still over two frame
              // intervals; the containment check stays exact
              if (worst && window.__atelier.rail().selected === worst.dataset.id) {
                document.getElementById('ob-atelier-cue')
                  ?.querySelector('[data-ob="atelier-cue-close"]')?.click();
                const railEl = document.getElementById('ob-atelier-rail');
                const whole = () => {
                  const a = rc.getBoundingClientRect();
                  const b = worst.getBoundingClientRect();
                  return b.left >= a.left - 0.5 && b.right <= a.right + 0.5;
                };
                const back = () => !railEl?.classList.contains('ob-atelier-rail--yield');
                const t1 = performance.now();
                let lastX = null, stillX = 0;
                while (!(back() && whole() && stillX >= 2)
                  && performance.now() - t1 < 3000) {
                  await new Promise((r) => {
                    const t = setTimeout(r, 250);
                    requestAnimationFrame(() => { clearTimeout(t); r(); });
                  });
                  const x = rc.scrollLeft;
                  stillX = back() && x === lastX ? stillX + 1 : 0;
                  lastX = x;
                }
                // the wait passes only on its own condition: a rail still
                // yielded (hidden) has no geometry to judge, and a strip still
                // moving at the bound is not at rest — each is its own FAIL
                const rr = rc.getBoundingClientRect();
                const br = worst.getBoundingClientRect();
                if (!back()) {
                  bad.push('rail never came back from its yield within 3000 ms'
                    + ' after the sheet closed (card ' + br.left.toFixed(2) + '..'
                    + br.right.toFixed(2) + ' vs rail ' + rr.left.toFixed(2)
                    + '..' + rr.right.toFixed(2) + ', scrollLeft '
                    + rc.scrollLeft + ')');
                } else if (br.left < rr.left - 0.5 || br.right > rr.right + 0.5) {
                  // GH-525 r1 finding 2 ARM: after a rail selection the
                  // SELECTED card sits fully INLINE-inside the rail scroll
                  // viewport (0.5px tolerance) — the evidence class had the
                  // chip/right keyline clipped outside the viewport.
                  bad.push('selected worst-name card ' + worst.dataset.id
                    + ' inline-clipped by the rail viewport (card '
                    + br.left.toFixed(2) + '..' + br.right.toFixed(2)
                    + ' vs rail ' + rr.left.toFixed(2) + '..'
                    + rr.right.toFixed(2) + ', scrollLeft ' + rc.scrollLeft
                    + ', rail back after ' + Math.round(performance.now() - t1)
                    + ' ms with the sheet closed)');
                } else if (stillX < 2) {
                  bad.push('rail never came to rest within 3000 ms after the'
                    + ' sheet closed (scrollLeft ' + rc.scrollLeft + ')');
                }
              }
              return bad;
            })()`);
            // the judge above closed the sheet; the walkers after this loop
            // (btnWalk on #ob-atelier-cue) read the card presented, as the
            // DOM-click arm left it: after the verdict the selected pick is
            // re-presented (a DOM click on its card), bounded
            if (ga.pickId !== null && ga.hit === 'pick') {
              const re = await chrome.eval(`(async () => {
                const id = ${JSON.stringify(ga.pickId)};
                const card = document.getElementById('ob-atelier-cue');
                const up = () => !!card && !card.hidden
                  && window.__atelier.floatState().id === id;
                if (up()) return 'ok';
                document.querySelector('[data-ob="atelier-rail-cards"] '
                  + '.ob-cardrail-card[data-id="' + CSS.escape(id) + '"]')?.click();
                const t0 = performance.now();
                while (!up() && performance.now() - t0 < 3000) {
                  await new Promise((r) => setTimeout(r, 25));
                }
                return up() ? 'ok' : 'cue card for ' + id
                  + ' not re-presented within 3000 ms after the closed-sheet judge';
              })()`);
              if (re !== 'ok') g.push(re);
            }
            pushClass(`${page} [${locale}]`,
              'atelier chrome 44pt/containment/sheet geometry', g,
              '032 US5: 44 pt both dimensions, safe-area, sheet grammar; '
              + 'GH-525 dev 12: rail cards contained + names never '
              + 'truncate + rail band disjoint from the sheet band; '
              + 'GH-525 visual-audit r1: selected worst-name card fully '
              + 'inline-inside the rail viewport + the collapsed sheet '
              + 'ends on whole descriptor lines; '
              + 'GH-525 bare-review r1 finding 1: host clears the cloth '
              + 'rail band (sub row incl.) by >= 4px + visible chips '
              + 'hit-testable; '
              + 'GH-525 bare-review r2 finding 5: the base --rail env-cap '
              + 'clears the band at every station under the notch; '
              + 'r2 finding 6: quick-play corner (Remember tick) clear '
              + 'or lawfully floor-yielded with hittable quick-play; '
              + 'GH-525 S2.5 strip-pin: the station strip reads WHOLE '
              + 'inside the host clip at rest on every station (pinned '
              + 'header, strip-floored cap), band clearance lawfully '
              + 'floor-yielded with live cards/chip-sliver beneath');
            // GH-1001 (atelier.md §7 B20-1): the equal-height card law on the
            // landscape phone — one card height per rail, the face and the
            // name at one offset (e2e-ui-eqh.mjs; the portrait pass runs
            // under the rotate prompt)
            if (w === 844) {
              const eq = [];
              for (const st of ['cues', 'table', 'cloth', 'balls', 'lighting']) {
                await chrome.eval(`window.__atelier.go('${st}'), true`);
                await sleep(250);
                for (const m of await chrome.eval(EQH_PROBE)) eq.push(m + '@' + st);
              }
              pushClass(`${page} [${locale}]`, 'atelier rail cards one height', eq,
                'GH-1001: every rail card at one height, face + name at one offset');
              // GH-1001 + the kit sibling-row law: one STAGED frame per locale —
              // the bar's state marker, full-view / Put back / Keep pills in one
              // row under the kit laws (no other audit frame poses the bar)
              const staged = await chrome.eval(`(async () => {
                window.__atelier.go('table');
                await new Promise((r) => setTimeout(r, 250));
                const b = document.querySelector('#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])');
                if (!b) return false;
                b.click();
                for (let i = 0; i < 40; i++) {
                  await new Promise((r) => setTimeout(r, 50));
                  if (document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false) return true;
                }
                return false;
              })()`);
              if (!staged) push(`${page} [${locale}] staged`, false, 'a rail card click staged no preview', 'GH-1001: the staged bar frame');
              else {
                // the staged table re-racks and the camera reframes — the kit
                // laws read a SETTLED frame (the A2 ground sampler refuses a
                // moving still)
                await chrome.eval(`(async () => { for (let i = 0; i < 60; i++) { if (!window.__shell?.moving?.()) break; await new Promise((r) => setTimeout(r, 100)); } return true; })()`);
                await sleep(1500);
                await setRoot('#ob-atelier-rail');
                await auditKitLaws(report, `${page} staged`, { locale, coarse: true });
                await setRoot(null);
              }
              await chrome.eval(`document.querySelector('[data-ob="atelier-revert"]')?.click(), true`);
              await sleep(250);
            }
          }
        }
        // GH-525 bare review review round-2 (finding 6), the RESERVE-HOLDS
        // leg: with the right inset cleared (the other landscape
        // orientation — the suite's notch knob supports per-side insets)
        // the 266/side reserve is satisfiable at 844 (cap 312 >= the 288
        // floor), so the law is STRICT disjointness: the rail scrollport's
        // border box ends left of the Remember-ticked quick-play wrap.
        // fr is the ×7-measured worst wrap (tick-state left edge 582.45);
        // en rides as the base register. Pre-fix red: the 484-derived cap
        // left the strip edge at 602 — ~20px into the ticked wrap.
        await setPhoneMetrics(chrome, { width: 844, height: 390 });
        await setSafeAreaInsets(chrome, { ...PHONE_SA, right: 0 });
        await sleep(400);
        await chrome.eval(`window.__atelier.go('cues'), true`);
        for (const locale of ['en', 'fr']) {
          await chrome.eval(`window.__settings.set('language', '${locale}')`);
          await sleep(400);
          const g6 = await chrome.eval(`(() => {
            const rem = document.querySelector('[data-ob="shell-remember"]');
            const was = rem ? rem.getAttribute('aria-pressed') : null;
            if (rem) rem.setAttribute('aria-pressed', 'true');
            const qr = document.getElementById('ob-shell-quickplay-wrap')
              .getBoundingClientRect();
            const rr = document.querySelector(
              '[data-ob="atelier-rail-cards"]').getBoundingClientRect();
            if (rem && was !== null) rem.setAttribute('aria-pressed', was);
            if (rr.width < 287.5) {
              return 'rail scrollport under the 288 floor ('
                + rr.width.toFixed(2) + 'px)';
            }
            if (rr.right > qr.left - 0.5) {
              return 'rail scrollport border box reaches the ticked '
                + 'quick-play wrap (scrollport right ' + rr.right.toFixed(2)
                + ' vs wrap left ' + qr.left.toFixed(2) + ')';
            }
            return 'ok';
          })()`);
          push(`phone atelier 844x390`, g6 === 'ok',
            `quick-play corner reserve holds w/ Remember tick, right inset 0`
            + ` [${locale}]` + (g6 === 'ok' ? '' : ' — ' + g6),
            'GH-525 bare-review r2 finding 6: the phone cap derives from the '
            + 'measured ticked wrap (266/side) + 2·env(safe-area-inset-right)');
        }
        await setSafeAreaInsets(chrome, PHONE_SA);
        // hand the walkers back the loop's exit register (390x844)
        await setPhoneMetrics(chrome, { width: 390, height: 844 });
        await sleep(300);
        await chrome.eval(`window.__settings.set('language', 'en')`);
        await sleep(300);
        await setRoot('#ob-atelier');
        await btnWalk('phone atelier');
        await setRoot('#ob-atelier-cue');
        await btnWalk('phone atelier card');
        await setRoot(null);
      }

      // 034 (T035): the play place joins the phone walker — the shell's
      // play card at the three landscape phone registers ×7 locales (NO
      // 390x844: portrait shows #ob-rotate — protocol R10): every VISIBLE
      // play control ≥ 44 pt both dimensions; free-standing controls
      // contained in the viewport, rail cards block-contained in the rail
      // scroll viewport (overflow-y hidden; inline panning is by design —
      // the shell-rail idiom); card names never truncate (the ONE-line
      // name grows the card — GH-525 dev 12 extended to play); at 844x390
      // the section stays disjoint from #ob-shell-quickplay-wrap (the
      // FR-003 cap on the FR-017 register); then the walker classes
      // scoped to the play root. Protocol R3: appended after the atelier
      // hop in registry order (practice / replays append after this).
      await chrome.eval(`window.__shell.go('play')`);
      let ply = false;
      for (let i = 0; i < 40 && !ply; i++) {
        ply = await chrome.eval(`!!document.querySelector(
          'section[data-place="play"].ob-play-host')`).catch(() => false);
        if (!ply) await sleep(150);
      }
      if (!ply) {
        push('phone play', false, 'play arrival never mounted the play card',
          '034 contract §3: play.js is the play content (host class)');
      } else {
        for (const [w, h] of PHONE_VIEWPORTS) {
          const page = `phone play ${w}x${h}`;
          await setPhoneMetrics(chrome, { width: w, height: h });
          await sleep(400);
          for (const locale of GAME_LOCALES) {
            await chrome.eval(`window.__settings.set('language', '${locale}')`);
            await sleep(300);
            await setRoot('section[data-place="play"]');
            await auditKitLaws(report, page, { locale, coarse: true });
            await setRoot(null);
            const g = await chrome.eval(`(() => {
              const bad = [];
              const sec = document.querySelector('section[data-place="play"]');
              const games = sec.querySelector('[data-ob="play-games"]');
              const gr = games ? games.getBoundingClientRect() : null;
              const vis = (el) => el.getClientRects().length
                && getComputedStyle(el).visibility !== 'hidden';
              for (const el of sec.querySelectorAll('button, [role="radio"]')) {
                if (!vis(el)) continue;
                const r = el.getBoundingClientRect();
                const id = el.dataset.game ?? el.dataset.variantPick
                  ?? el.dataset.ob ?? el.getAttribute('value') ?? el.className;
                if (r.width < 43.5 || r.height < 43.5) {
                  bad.push(id + ' under 44pt (' + r.width.toFixed(1) + 'x'
                    + r.height.toFixed(1) + ')');
                }
                if (games && games.contains(el)) {
                  if (r.top < gr.top - 0.5 || r.bottom > gr.bottom + 0.5) {
                    bad.push(id + ' clipped by the rail viewport');
                  }
                } else if (r.left < -0.5 || r.right > innerWidth + 0.5
                  || r.top < -0.5 || r.bottom > innerHeight + 0.5) {
                  bad.push(id + ' breaches the viewport');
                }
                const nm = el.querySelector('.ob-play-card__name');
                if (nm && nm.scrollWidth > nm.clientWidth + 1) {
                  bad.push(id + ' name truncated');
                }
              }
              const sr = sec.getBoundingClientRect();
              if (sr.left < -0.5 || sr.right > innerWidth + 0.5
                || sr.top < -0.5 || sr.bottom > innerHeight + 0.5) {
                bad.push('play section breaches the viewport');
              }
              if (innerWidth === 844 && innerHeight === 390) {
                const qr = document.getElementById('ob-shell-quickplay-wrap')
                  .getBoundingClientRect();
                const ow = Math.min(sr.right, qr.right) - Math.max(sr.left, qr.left);
                const oh = Math.min(sr.bottom, qr.bottom) - Math.max(sr.top, qr.top);
                if (ow > 0 && oh > 0) {
                  bad.push('play section overlaps the quick-play stack ('
                    + ow.toFixed(0) + 'x' + oh.toFixed(0) + 'px)');
                }
              }
              return bad;
            })()`);
            pushClass(`${page} [${locale}]`,
              'play controls 44pt/containment/never-truncate', g,
              '034 FR-017 phone register (44 pt, contained) + FR-003 cap;'
              + ' e2e-ui --audit never-ellipsize law');
            // the FOLD-SNAP law (ui/foldsnap.js; GH-525 integrator, combined
            // review visual audit r1 finding 7): the body's clip edge cuts no
            // text-line / glyph atom at rest and ends on a boundary — the
            // replays block's entry-24 check, through the ONE shared probe
            pushClass(`${page} [${locale}]`, 'play body fold cuts no glyph at rest',
              foldBad(await chrome.eval(foldProbeJs('[data-ob="play-body"]'))),
              '034 play body: no glyph cut at the internal scroll fold (ui/foldsnap.js; replays entries 24/25 law)');
          }
        }
        // the walker pair on the play register, then hand back the loop's
        // exit register (390x844) exactly as the atelier hop left it
        await setPhoneMetrics(chrome, { width: 844, height: 390 });
        await sleep(300);
        await chrome.eval(`window.__settings.set('language', 'en')`);
        await sleep(300);
        await setRoot('section[data-place="play"]');
        await btnWalk('phone play');
        await setRoot(null);
        await setPhoneMetrics(chrome, { width: 390, height: 844 });
        await sleep(300);
      }

      // 036a (T025): the practice place joins the phone walker — three
      // landscape viewports x7 locales under the in-force notch emulation
      // (never 390x844: portrait shows #ob-rotate), the same geometry law
      // as the desktop shell walk judged on the coarse register, then the
      // walker classes scoped to the practice root
      await chrome.eval(`window.__shell.go('practice')`);
      let prc = false;
      for (let i = 0; i < 40 && !prc; i++) {
        prc = await chrome.eval('typeof window.__practice === "object" && document.getElementById("ob-practice")?.hidden === false')
          .catch(() => false);
        if (!prc) await sleep(150);
      }
      if (!prc) {
        push('phone practice', false,
          'practice arrival never mounted the place', '036 contract §3');
      } else {
        for (const [w, h] of [[844, 390], [667, 375], [926, 428]]) {
          const page = `phone practice ${w}x${h}`;
          await setPhoneMetrics(chrome, { width: w, height: h });
          await sleep(400);
          for (const locale of GAME_LOCALES) {
            await chrome.eval(`window.__settings.set('language', '${locale}')`);
            await sleep(300);
            await setRoot('#ob-practice');
            await auditKitLaws(report, page, { locale, coarse: true });
            await setRoot(null);
            const g = await chrome.eval(PRACTICE_GEO_WALKER);
            pushClass(`${page} [${locale}]`,
              'practice cards 44pt/containment/no-wrap', g,
              '036 FR-041 phone register: >=44 pt both dimensions, '
              + 'safe-area, titles single-line, hints <=2 lines, strip one '
              + 'row, never clip/ellipsize');
            // the FOLD-SNAP law (ui/foldsnap.js; GH-525 integrator, combined
            // review visual audit r1 finding 7 — the group clipped into the
            // assist strip's option glyphs): no atom cut at the group's
            // rest fold, the edge on a boundary — the ONE shared probe
            pushClass(`${page} [${locale}]`, 'practice group fold cuts no glyph at rest',
              foldBad(await chrome.eval(foldProbeJs('#ob-practice'))),
              '036 practice group: no glyph cut at the internal scroll fold (ui/foldsnap.js; replays entries 24/25 law)');
          }
        }
        // hand the walkers back the loop's exit register (390x844)
        await setPhoneMetrics(chrome, { width: 390, height: 844 });
        await sleep(300);
        await chrome.eval(`window.__settings.set('language', 'en')`);
        await sleep(300);
        await setRoot('#ob-practice');
        await btnWalk('phone practice');
        await setRoot(null);
      }
    }
  }

  // 035 (Ta16): the replays place joins the phone walker — 844×390 ONLY
  // (portrait renders #ob-rotate; protocol R10; the 667×375 floor and
  // 926×428 are e2e-replays arm P's). Own hop onto the posed+ARMED page
  // (`obshell=1&archive=1`, the e2e-replays POSED recipe): the obshell phone
  // page above is obtool-stamped and archive.js disarms on scripted boots
  // unless `?archive=1`, and rail ROWS need one seeded session. Per locale
  // ×7: every rail row ≥ 44 pt in both dimensions, band contained, no
  // horizontal overflow (document / rail / list), band height ≤ min(38vh,
  // 100vh − 88 − card-top), exactly ONE body-level band, #ob-rotate hidden,
  // zero intersection with the strip / quick-play stack, plus the
  // replays-scoped never-ellipsize sweep (GH-668 B-K07: `.ob-pb-title` is
  // in the sweep — the kit's last ellipsis is gone, the title WRAPS; the
  // clock · meta line under it is data that wraps too); then the walker classes scoped
  // to the rail and the card. Ta18 STACK register (035 contract §7 entry
  // 20): the band ∩ card-column measure is ASSERTED zero (the card is
  // height-capped above the band), the first row's centre and the card's
  // Open action must hit-test to themselves (paint order — the entry 18
  // occlusion finding), and a capped body must SCROLL, never clip
  // (e2e-replays arm P judges the same at 667×375 / 926×428). The opt-in
  // is dropped on exit (the auditPlaybackCard exit-path law).
  {
    const page = 'phone replays 844x390';
    let up = false;
    try {
      await setPhoneMetrics(chrome, { width: 844, height: 390 });
      await chrome.send('Page.navigate',
        { url: `${APP_URL}&obtool=1&obshell=1&archive=1&u=shellphone035` });
      await waitReady();
      for (let i = 0; i < 50 && !up; i++) {
        up = await chrome.eval('window.__shell?.isOpen?.() === true')
          .catch(() => false);
        if (!up) await sleep(200);
      }
    } catch (e) {
      push(page, false, 'armed obshell phone hop threw: ' + (e.message ?? e),
        '031 contract §4: obshell=1 poses the shell for fixtures');
    }
    if (!up) {
      push(page, false, 'armed obshell phone boot never opened the shell',
        '031 contract §4: obshell=1 poses the shell for fixtures');
    } else {
      const err = await chrome.eval(
        '__test.shoot({ v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
      let st = 'PLAYBACK';
      for (let i = 0; i < 200 && (st === 'PLAYBACK' || st === 'SIMULATING'); i++) {
        await sleep(300); st = await chrome.eval('__test.state()');
      }
      await chrome.eval('window.__archive?.flush?.()');
      const n = await chrome.eval(
        '(async () => (await window.__archive?.sessions?.())?.length ?? 0)()');
      push(page, !err && n >= 1, `one session seeded for the rail (${err ? 'shot rejected: ' + err : n + ' archived'})`,
        '035 plan §7.2: rail rows need a seeded archive (?archive=1 + one shot)');
      await chrome.eval(`window.__shell.go('replays')`);
      let rp = false;
      for (let i = 0; i < 40 && !rp; i++) {
        rp = await chrome.eval('typeof window.__replays === "object"')
          .catch(() => false);
        if (!rp) await sleep(150);
      }
      let rows = 0;
      for (let i = 0; i < 40 && rp && rows < 1; i++) {
        rows = await chrome.eval(
          `document.querySelectorAll('#ob-replays-list .ob-pb-row').length`)
          .catch(() => 0);
        if (rows < 1) await sleep(150);
      }
      if (!rp || rows < 1) {
        push(page, false, !rp ? 'replays arrival never mounted the leaf'
          : 'the rail never presented the seeded row', '035 contract §3 / §3.1');
      } else {
        for (const locale of GAME_LOCALES) {
          await chrome.eval(`window.__settings.set('language', '${locale}')`);
          await sleep(300);
          await auditKitLaws(report, page, { locale, coarse: true }); // whole frame: band + card + shell chrome
          const g = await chrome.eval(`(() => {
            const bad = [];
            const rail = document.getElementById('ob-replays-rail');
            const list = document.getElementById('ob-replays-list');
            const box = (el) => { if (!el || el.hidden || !el.getClientRects().length) return null;
              const r = el.getBoundingClientRect();
              return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
            const hit = (a, b) => !!a && !!b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
            const rb = box(rail);
            if (!rb) { bad.push('rail not visible with a seeded archive'); return { bad, card: null }; }
            const rows = [...document.querySelectorAll('#ob-replays-list .ob-pb-row')]
              .map((r) => r.getBoundingClientRect()).filter((r) => r.height > 0);
            if (!rows.length) bad.push('no rail row painted');
            for (const r of rows) {
              if (r.width < 44 || r.height < 44) {
                bad.push('rail row under 44pt (' + r.width.toFixed(0) + 'x' + r.height.toFixed(0) + ')');
                break;
              }
            }
            if (rb.x < -0.5 || rb.y < -0.5 || rb.r > innerWidth + 0.5 || rb.b > innerHeight + 0.5) {
              bad.push('band breaches the viewport ' + JSON.stringify(rb));
            }
            if (document.documentElement.scrollWidth > innerWidth + 1) {
              bad.push('document h-overflow (' + document.documentElement.scrollWidth + ' > ' + innerWidth + ')');
            }
            if (rail.scrollWidth > rail.clientWidth + 1) bad.push('rail h-overflow');
            if (list && list.scrollWidth > list.clientWidth + 1) bad.push('list h-overflow');
            const cardTop = document.getElementById('ob-shell-cards').getBoundingClientRect().top;
            const cap = Math.min(0.38 * innerHeight, innerHeight - 88 - cardTop);
            if (rb.h > cap + 0.5) bad.push('band height ' + rb.h.toFixed(0) + ' exceeds cap ' + cap.toFixed(0));
            const bands = [...document.body.children]
              .filter((el) => /^ob-replays-/.test(el.id ?? '')).map((el) => el.id);
            if (bands.length !== 1) bad.push('body-level bands ' + JSON.stringify(bands));
            const rot = document.getElementById('ob-rotate');
            if (rot && getComputedStyle(rot).display !== 'none' && rot.getClientRects().length) {
              bad.push('#ob-rotate shown in landscape');
            }
            for (const [name, sel] of [['strip', '#ob-shell-rail'],
              ['quick-play stack', '#ob-shell-quickplay-wrap']]) {
              const ob = box(document.querySelector(sel));
              if (hit(rb, ob)) bad.push('band overlaps the ' + name + ' ' + JSON.stringify(ob));
            }
            const cb = box(document.getElementById('ob-shell-cards'));
            const sb = box(document.querySelector('#ob-shell-cards > section[data-place="replays"]'));
            if (hit(rb, cb) || hit(rb, sb)) {
              bad.push('band overlaps the card column (stack register: the card must cap above the band) band '
                + JSON.stringify(rb) + ' section ' + JSON.stringify(sb));
            }
            const reach = (el, want) => { if (!el || !el.getClientRects().length) return false;
              const b = el.getBoundingClientRect();
              const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
              return !!at && at.closest(want) === el; };
            if (!reach(document.querySelector('#ob-replays-list .ob-pb-row'), '.ob-pb-row')) {
              bad.push('the first rail row centre does not hit-test to the row (occluded)');
            }
            // (the card Open pill hit-test row retired with GH-668 S5 slice 6 —
            // replays.js paints no pill on coarse pointers (ruling R15); the
            // coarse tap target's hit-test law lives in e2e-replays R1 phone)
            const body = document.getElementById('ob-replays-latest');
            const bodyScroll = body ? Math.max(0, body.scrollHeight - body.clientHeight) : 0;
            if (bodyScroll > 0 && getComputedStyle(body).overflowY !== 'auto') {
              bad.push('the capped card body clips ' + bodyScroll + 'px instead of scrolling');
            }
            // the band's clip edge never cuts a glyph at rest (035 contract
            // §7 entry 24 — the review visual audit P1): no text line box,
            // inline glyph or mode face box straddles the list's bottom
            // edge, in every locale (the title / time / day label re-flow)
            let lineClip = null; const cut = [];
            if (list) {
              lineClip = list.getBoundingClientRect().bottom;
              for (const bl of list.children) {
                if (!bl.getClientRects().length) continue;
                if (bl.getBoundingClientRect().top > lineClip + 1.5) break;
                const w = document.createTreeWalker(bl, NodeFilter.SHOW_TEXT);
                for (let n = w.nextNode(); n; n = w.nextNode()) {
                  if (!n.nodeValue.trim()) continue;
                  const rg = document.createRange(); rg.selectNodeContents(n);
                  for (const r of rg.getClientRects()) {
                    if (r.height > 0 && r.width > 0 && r.top < lineClip - 1 && r.bottom > lineClip + 1) cut.push('"' + n.nodeValue.trim().slice(0, 16) + '"');
                  }
                }
                for (const g of bl.querySelectorAll('svg, img, .ob-pb-face')) {
                  const r = g.getBoundingClientRect();
                  if (r.height > 0 && r.width > 0 && r.top < lineClip - 1 && r.bottom > lineClip + 1) cut.push(g.tagName.toLowerCase());
                }
              }
              if (cut.length) bad.push('the band clip edge cuts a glyph at rest (entry 24): ' + cut.slice(0, 4).join(', '));
            }
            // the zero-error register across the relabel transition (035
            // contract §7 entry 22): no app error, no red #err banner — the
            // observer→write→observer cycle painted the ResizeObserver loop
            // error as the banner
            const eb = document.getElementById('err');
            if (eb && !eb.hidden && eb.querySelector('.err-row')) {
              bad.push('#err banner showing: ' + [...eb.querySelectorAll('.err-msg')].map((e) => e.textContent).join(' | ').slice(0, 120));
            }
            const appErrs = (window.__test?.errors ?? []).splice(0);
            if (appErrs.length) bad.push('app errors: ' + appErrs.slice(0, 2).join(' | ').slice(0, 160));
            return { bad, stack: { band: rb, section: sb, bodyScroll, lineClip, cut: cut.length } };
          })()`);
          console.log(`[e2e-ui audit] ${page} [${locale}] STACK: ` + JSON.stringify(g.stack));
          pushClass(`${page} [${locale}]`,
            'replays band 44pt rows/containment/no-h-overflow/cap/one band/no rotate/stack (no card overlap, row + Open reachable, body scrolls, clip edge cuts no glyph)',
            g.bad, '035 contract §3.1 phone register (R-12) + §4 law 9b + §7 entries 20 / 24 (stack register, text-line snap)');
          const badR = await chrome.eval(`(() => {
            const bad = [];
            for (const el of document.querySelectorAll(
                '#ob-shell-cards section[data-place="replays"] h3,'
                + ' #ob-shell-cards section[data-place="replays"] button,'
                + ' #ob-shell-cards section[data-place="replays"] .ob-btn,'
                + ' #ob-shell-cards section[data-place="replays"] .ob-replays-day,'
                + ' #ob-shell-cards section[data-place="replays"] .ob-replays-meta,'
                + ' #ob-shell-cards section[data-place="replays"] .ob-replays-badge,'
                + ' #ob-shell-cards section[data-place="replays"] .ob-replays-empty,'
                + ' #ob-replays-rail button, #ob-replays-rail .ob-btn,'
                + ' #ob-replays-rail .ob-replays-rail-empty,'
                + ' #ob-replays-rail .ob-pb-day, #ob-replays-rail .ob-pb-badge,'
                + ' #ob-replays-rail .ob-pb-title, #ob-replays-rail .ob-pb-when,'
                + ' #ob-replays-rail .ob-pb-t, #ob-replays-rail .ob-pb-m')) {
              if (el.hidden || !el.getClientRects().length) continue;
              if (el.scrollWidth > el.clientWidth + 1) {
                bad.push((el.id ? '#' + el.id : '.' + el.className.split(' ')[0])
                  + ' "' + el.textContent.trim().slice(0, 24) + '"');
              }
            }
            return [...new Set(bad)];
          })()`);
          pushClass(`${page} [${locale}]`, 'no truncated labels inside #ob-replays-*',
            badR, '035 plan §9 gate 6: never-ellipsize inside the replays card + rail');
        }
        await chrome.eval(`window.__settings.set('language', 'en')`);
        await sleep(300);
        // the D7 LOW tier on the coarse register (entry 22): body.ob-glass-off
        // re-lays the card (the solid pack cells) — the transition must leave
        // no app error and no #err banner; the tier is restored after
        await chrome.eval(`(() => { window.__obPerfTierPrev = window.__obPerfTier; window.__obPerfTier = 'low';
          window.dispatchEvent(new Event('ob:perftier')); return true; })()`);
        await sleep(450);
        const lowBad = await chrome.eval(`(() => { const bad = [];
          if (!document.body.classList.contains('ob-glass-off')) bad.push('the low tier never reached body.ob-glass-off');
          const eb = document.getElementById('err');
          if (eb && !eb.hidden && eb.querySelector('.err-row')) {
            bad.push('#err banner showing under the low tier: ' + [...eb.querySelectorAll('.err-msg')].map((e) => e.textContent).join(' | ').slice(0, 120));
          }
          const appErrs = (window.__test?.errors ?? []).splice(0);
          if (appErrs.length) bad.push('app errors under the low tier: ' + appErrs.slice(0, 2).join(' | ').slice(0, 160));
          return bad; })()`);
        pushClass(`${page} [low tier]`, 'no app error / #err banner across the coarse register transitions (relabel x7, low tier)',
          lowBad, '035 contract §7 entry 22: the stack register writes once per frame, never inside an observer');
        await chrome.eval(`(() => { window.__obPerfTier = window.__obPerfTierPrev; delete window.__obPerfTierPrev;
          window.dispatchEvent(new Event('ob:perftier')); return true; })()`);
        await sleep(300);
        await setRoot('#ob-replays-rail');
        await btnWalk('phone replays rail');
        await setRoot('#ob-shell-cards section[data-place="replays"]');
        await btnWalk('phone replays card');
        await setRoot(null);
      }
    }
    await chrome.eval(`(() => { try {
      sessionStorage.removeItem('ob-archive-optin');
    } catch { /* storage unavailable */ } return true; })()`).catch(() => {});
  }

  // restore a sane desktop session for the trailing error gates
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(300);
  await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await chrome.send('Emulation.clearDeviceMetricsOverride');

  // LEDGER LIVENESS (2026-07 button audit): the ROLLED_OWN_OK ledger claims to
  // be a ratchet that can only SHRINK. That property only holds while every
  // line still matches a control the walker actually reaches — a line that
  // matches nothing is documentation, and deleting it could never turn the
  // gate red. Asserted here because this is the LAST audit surface in the
  // process, so LEDGER_SEEN is the union over desktop + replay + save card +
  // phone. One aggregated row (not one per entry) so a single unreachable
  // surface upstream cannot bury the report in derived reds.
  const deadLedger = ROLLED_OWN_OK.filter(([sel]) => !LEDGER_SEEN.has(sel));
  push('phone', deadLedger.length === 0,
    `ROLLED_OWN_OK ledger fully live (${LEDGER_SEEN.size}/${ROLLED_OWN_OK.length}`
    + ' entries matched a walked control'
    + (deadLedger.length
      ? ') — DEAD: ' + deadLedger.map(([sel]) => sel).join(' ') : ')'),
    'a FROZEN ledger line that no longer matches any walked control is a mute, '
    + 'not a ratchet: delete it (the conversion landed) or fix the walker '
    + 'predicate that stopped reaching it');
  // GH-668 S5: KIT_LAW_OK liveness — a row no posed frame hit is red (shrink-only)
  pushClass('kit laws', 'KIT_LAW_OK ledger liveness (dead rows)', deadLedgerRows(KIT_SEEN), 'kit-laws.mjs KIT_LAW_OK: frozen, shrink-only; every row must still match a posed frame');

  const bad = report.filter((r) => !r.ok);
  for (const r of report) {
    if (r.ok) console.log(`  OK   [${r.page}] ${r.what}`);
    else console.error(`  FAIL [${r.page}] ${r.what} — ${r.rule}`);
  }
  console.log(`[e2e-ui audit] phone walker: ${report.length} checks, `
    + `${bad.length} finding(s)`);
  if (bad.length) {
    fail(`${bad.length} phone-audit finding(s) — see FAIL lines above (SC-003)`);
  }
}

// ---- feature 024 (T017): help overlay + #ob-help pill audit extension ------
// The truncation/geometry walker extends to the OPEN overlay + the toolbar
// pill across ALL 7 locales at the standing desktop widths INCLUDING the
// 1024x640 floor (help-overlay.md §7 gate map): zero ellipsized/clipped
// labels (de/fr stress), the close control always on-screen, the panel
// contained in the viewport, the pill in the 34px toolbar family register,
// and the shipped stylesheet-version probe covering web/app/ui/help.css's
// `?v=` law. Selectors are the FROZEN data-model §3 set.
const HELP_AUDIT_WIDTHS = [[1280, 800], [1024, 640]];
const HELP_PANEL_WALKER = `(() => {
  const bad = [];
  for (const el of document.querySelectorAll(
      '#ob-help-panel h2, #ob-help-panel .ob-help__disclose,'
      + ' #ob-help-panel th, #ob-help-panel td, #ob-help-panel dt,'
      + ' #ob-help-panel dd, #ob-help-panel li, #ob-help-panel p,'
      + ' #ob-help-panel a, #ob-help-close')) {
    if (!el.getClientRects().length) continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      bad.push(el.id || el.className || el.textContent.slice(0, 24));
    }
  }
  return [...new Set(bad)];
})()`;

async function auditHelpOverlay(report) {
  const present = await chrome.eval('!!window.__help?.open');
  report.push({ ok: present, page: 'help',
    what: 'window.__help overlay surface present (024)',
    rule: 'help-overlay.md §1.3 — the audit cannot cover an absent overlay' });
  if (!present) return;
  for (const [width, height] of HELP_AUDIT_WIDTHS) {
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width, height, deviceScaleFactor: 0, mobile: false });
    await sleep(300);
    for (const locale of GAME_LOCALES) {
      await chrome.eval(`window.__settings.set('language', '${locale}')`);
      await sleep(500);
      await chrome.eval(`window.__help.open('api')`);
      await sleep(400); // panel enter motion
      const p = await chrome.eval(`(() => {
        const panel = document.getElementById('ob-help-panel');
        if (!panel || !panel.getClientRects().length) return { open: false };
        const r = panel.getBoundingClientRect();
        const close = document.getElementById('ob-help-close');
        const cr = close ? close.getBoundingClientRect() : null;
        return { open: true,
          contained: r.left >= -1 && r.top >= -1
            && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
          closeOnScreen: !!cr && cr.width > 0 && cr.left >= 0 && cr.top >= 0
            && cr.right <= innerWidth && cr.bottom <= innerHeight,
          bad: ${HELP_PANEL_WALKER},
        };
      })()`);
      report.push({
        ok: p.open && p.contained && p.closeOnScreen && !p.bad.length,
        page: 'help',
        what: `overlay clean @${width}x${height} [${locale}]`
          + (p.open ? '' : ' — never opened')
          + (p.open && !p.contained ? ' — panel breaches the viewport' : '')
          + (p.open && !p.closeOnScreen ? ' — close control off-screen' : '')
          + (p.open && p.bad.length ? ' — clipped: ' + p.bad.join('; ') : ''),
        rule: 'help overlay never ellipsizes/clips; close control on-screen '
          + 'at the 1024x640 floor (024 help-overlay.md §7 audit law)',
      });
      // toolbar pill register: the toolbar family's one 34px height + round
      // register + no truncation (the T001 before-band toolbar law extends
      // to the new pill)
      const pill = await chrome.eval(`(() => {
        const el = document.getElementById('ob-help');
        if (!el || !el.getClientRects().length) return { found: false };
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { found: true, h: +r.height.toFixed(2), radius: cs.borderRadius,
          trunc: el.scrollWidth > el.clientWidth + 1 };
      })()`);
      report.push({
        ok: pill.found && Math.abs(pill.h - 34) <= 0.5
          && pill.radius === '999px' && !pill.trunc,
        page: 'help',
        what: `#ob-help pill in the 34px toolbar register @${width}x${height} `
          + `[${locale}]` + (pill.found ? '' : ' — pill missing')
          + (pill.found && Math.abs(pill.h - 34) > 0.5 ? ` — h=${pill.h}` : '')
          + (pill.found && pill.radius !== '999px'
            ? ` — radius=${pill.radius}` : '')
          + (pill.found && pill.trunc ? ' — truncated' : ''),
        rule: 'toolbar family register: one 34px height, round pill, label '
          + 'never truncates (help-overlay.md §2 audit law)',
      });
      await chrome.eval('window.__help.close()');
      await sleep(250);
    }
  }
  await chrome.send('Emulation.clearDeviceMetricsOverride');
  await sleep(300);
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(400);
  // stylesheet-version law extension: help.css joins the loaded sheets once
  // the overlay has been built — it must carry ?v= like every other sheet
  // (auditModalMidWidths gates the global law; this pins the 024 sheet)
  await chrome.eval(`window.__help.open('api')`);
  await sleep(400);
  const helpSheet = await chrome.eval(`[...document.styleSheets]
    .map((s) => s.href).filter((h) => h && h.includes('help.css'))`);
  report.push({
    ok: helpSheet.length > 0 && helpSheet.every((h) => /[?&]v=/.test(h)),
    page: 'help',
    what: 'ui/help.css loaded with a ?v= cache-bust'
      + (helpSheet.length ? ` (${helpSheet.map((h) => h.split('/').pop()).join(', ')})`
        : ' — help.css never loaded'),
    rule: 'the ownership ledger CSS addendum: the 024 sheet ships versioned like '
      + 'every kit sheet (cache-poison law)',
  });
  await chrome.eval('window.__help.close()');
  await sleep(250);
}

// ---- build-4 QA: desktop fine-pointer target floors (WCAG 2.5.8) -----------
// The repo's only tap-target law was the coarse 44pt floor — desktop-only
// sub-24px targets were never asserted. This arm floors the QA finding set
// at >=24px min-dimension on the fine-pointer register: the equipment
// Details summaries (measured 18px), the brightness + volume range rails
// (20px), and the export audio toggle's interactive label wrapper (20px).
// Runs while the settings modal + export dialog are open (the runAudit
// walker composition); leaves the accordion state behind harmlessly (the
// audit navigates to the replay boot next).
async function auditFinePointerFloors(report) {
  const FLOOR = 24;
  // (the equipment Details summaries + brightness rail legs RE-HOMED by
  // feature 032 to the atelier — asserted in auditShellChrome on the
  // station surfaces; the resident modal legs stay below)
  await chrome.eval(`window.__settings.show('display')`);
  await sleep(150);
  const vol = await chrome.eval(`(() => {
    const el = document.getElementById('ob-set-volume');
    if (!el || !el.getClientRects().length) return null;
    const r = el.getBoundingClientRect();
    return +Math.min(r.width, r.height).toFixed(1);
  })()`);
  report.push({
    ok: vol !== null && vol >= FLOOR,
    page: 'main',
    what: `volume range rail >= ${FLOOR}px on fine pointer (${vol}px)`,
    rule: 'WCAG 2.5.8 fine-pointer floor (build-4 QA)',
  });
  const audio = await chrome.eval(`(() => {
    const t = document.getElementById('ob-x-audio');
    const box = t?.closest('.ob-toggle, label') ?? t;
    if (!box || !box.getClientRects().length) return null;
    const r = box.getBoundingClientRect();
    return +Math.min(r.width, r.height).toFixed(1);
  })()`);
  report.push({
    ok: audio !== null && audio >= FLOOR,
    page: 'main',
    what: `export audio toggle wrapper >= ${FLOOR}px on fine pointer `
      + `(${audio}px)`,
    rule: 'WCAG 2.5.8 fine-pointer floor (build-4 QA)',
  });
}

// ---- Playback save card + session list (GH-225 owner defect C) -------------
// COVERAGE GAP CLOSED: the native-control walker never reached this surface.
// The save card is only reachable through a scripted shot → archive session →
// __playback.openSession → save(), and its resolution picker lived inside a
// `display:none` Advanced disclosure that AUDIT_WALKER's visible() predicate
// skips — so a raw native <select> sat in the Playback surface for a whole
// phase while this gate stayed green. This arm navigates to its own
// archive-armed boot (`?archive=1` is REQUIRED: archive.js disarms on any
// obtool-stamped scripted boot), opens the card, EXPANDS Advanced, then runs
// the same walker plus a card-scoped truncation sweep and the pinned-head
// geometry probe. Owns its navigation + app-error gate, like the replay arm.
async function auditPlaybackCard(report) {
  const bad = (what) => report.push({ ok: false, page: 'playback', what,
    rule: 'the Playback save card must be reachable and free of native chrome' });
  await chrome.send('Page.navigate', { url: `${APP_URL}&obtool=1&archive=1` });
  await waitReady();
  await sleep(1000);
  if (!await chrome.eval('typeof window.__playback?.save === "function"')) {
    bad('playback seam unreachable — the save card was NOT audited');
    return;
  }
  const err = await chrome.eval(
    '__test.shoot({ v0: 1.6, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
  if (err) { bad(`scripted shot rejected (${err}) — save card not audited`); return; }
  let st = 'PLAYBACK';
  for (let i = 0; i < 150 && (st === 'PLAYBACK' || st === 'SIMULATING'); i++) {
    await sleep(300); st = await chrome.eval('__test.state()');
  }
  await chrome.eval('window.__archive?.flush?.()');
  // sessions() is ASYNC (the IDB read) — resolve it, do not index the promise
  const sid = await chrome.eval(
    '(async () => (await window.__archive?.sessions?.())?.[0]?.id ?? null)()');
  if (!Number.isFinite(sid)) {
    bad('no archived session (is ?archive=1 armed?) — save card NOT audited');
    return;
  }
  if (await chrome.eval(`window.__playback.openSession(${sid})`) !== true) {
    bad('__playback.openSession refused — save card NOT audited');
    return;
  }
  await sleep(600);
  await chrome.eval('window.__playback.save()');
  let open = false;
  for (let i = 0; i < 40 && !open; i++) {
    await sleep(200); open = await chrome.eval('window.__playback.cardOpen() === true');
  }
  if (!open) { bad('the save card never opened — NOT audited'); return; }
  // THE reason the native select was never flagged: the walker skips
  // display:none subtrees, and the resolution picker lives behind Advanced
  await chrome.eval(`document.querySelector('#ob-pb-card .ob-pb-adv')?.click()`);
  await sleep(300);
  // the precondition is that the Advanced SUBTREE is walkable, i.e. it passes
  // AUDIT_WALKER's own visible() predicate. The old form ANDed in
  // `select.getClientRects().length >= 0`, which is true for any element that
  // exists (and the kit-upgraded native select is hidden, so it is always 0) —
  // an assertion that could not fail (GH-238 review finding 5).
  const advWalkable = await chrome.eval(`(() => {
    const row = document.querySelector('#ob-pb-card .ob-pb-advrow');
    if (!row) return { err: 'no #ob-pb-advrow' };
    const r = row.getBoundingClientRect();
    return { on: row.classList.contains('on'),
      rects: row.getClientRects().length,
      vis: getComputedStyle(row).visibility,
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      controls: row.querySelectorAll('select, [data-ob=select-button]').length };
  })()`);
  report.push({ ok: advWalkable.on === true && advWalkable.rects > 0
    && advWalkable.vis !== 'hidden' && advWalkable.w > 0 && advWalkable.h > 0
    && advWalkable.controls > 0,
  page: 'playback',
  what: 'Advanced disclosure expanded so the resolution control is walkable '
    + `(${JSON.stringify(advWalkable)})`,
  rule: 'audit coverage: a display:none subtree hides native chrome from the walker' });
  for (const r of await chrome.eval(AUDIT_WALKER)) {
    if (!report.some((p) => p.what === r.what)) report.push({ ...r, page: 'playback' });
  }
  for (const r of await kitButtonRows()) {
    if (!report.some((p) => p.what === r.what)) report.push({ ...r, page: 'playback' });
  }
  // card-scoped truncation sweep (labels WRAP, never ellipsize) in the widest
  // locales; the destination tiles are the long-label surface
  for (const locale of ['en', 'de', 'fr']) {
    await chrome.eval(`window.__settings.set('language', '${locale}')`);
    await sleep(500);
    const clipped = await chrome.eval(`(() => {
      const out = [];
      for (const el of document.querySelectorAll(
        '#ob-pb-card button, #ob-pb-card .ob-pb-dest span,'
        + ' #ob-pb-card .ob-pb-dest small, #ob-pb-card .ob-pb-adv,'
        + ' #ob-pb-card .ob-pb-estimate, #ob-pb-panel .ob-pb-row')) {
        if (!el.getClientRects().length) continue;
        if (el.scrollWidth > el.clientWidth + 1) {
          out.push((el.className || el.tagName) + ': '
            + el.textContent.trim().slice(0, 28));
        }
      }
      return out;
    })()`);
    report.push({ ok: !clipped.length, page: 'playback',
      what: `save card labels never truncate [${locale}]`
        + (clipped.length ? ' — clipped: ' + clipped.join('; ') : ''),
      rule: 'control labels never ellipsize (e2e-ui --audit law)' });
  }
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(400);
  // pinned head (owner defect B): scroll the body to the bottom, the ✕ must
  // still hit-test at its own centre
  const pin = await chrome.eval(`(() => {
    const card = document.getElementById('ob-pb-card');
    const body = card?.querySelector('.ob-pb-card-body');
    if (!body) return { err: 'no .ob-pb-card-body scroll region' };
    body.scrollTop = body.scrollHeight;
    card.scrollTop = card.scrollHeight; // the defective frame scrolled HERE
    const x = card.querySelector('.ob-pb-close');
    const cr = card.getBoundingClientRect(), xr = x.getBoundingClientRect();
    const hit = document.elementFromPoint(xr.x + xr.width / 2, xr.y + xr.height / 2);
    return { inside: xr.top >= cr.top - 1 && xr.bottom <= cr.bottom + 1,
      hitIsX: !!hit && (hit === x || x.contains(hit)),
      hit: hit ? (hit.id || String(hit.className).slice(0, 24)) : 'none' };
  })()`);
  report.push({ ok: pin.inside === true && pin.hitIsX === true, page: 'playback',
    what: 'save-card head stays pinned with the ✕ hit-testable after the body '
      + `scrolls to the bottom${pin.err ? ' — ' + pin.err : ''}`
      + (pin.hitIsX === false ? ` — hit: ${pin.hit}` : ''),
    rule: 'scrollable-panel convention: head/foot pinned, body scrolls' });
  // GH-245: the session LIST panel walk. openSession() bypasses the list,
  // so its controls (filter chips, close, per-row delete, clear-all) were
  // judged by NOBODY — measured: the narrowed .ob-pb-filterbtn ledger line
  // was DEAD on this run's first audit, which is exactly the class of
  // coverage gap this arm exists to close (the Advanced-disclosure lesson
  // above, one surface over). Own open/close cycle, same dedupe.
  await chrome.eval('window.__playback.close()');
  await sleep(400);
  await chrome.eval('window.__playback.open()');
  await sleep(900);
  const listUp = await chrome.eval(
    `document.getElementById('ob-pb-panel')?.getClientRects().length > 0`);
  report.push({ ok: listUp === true, page: 'playback',
    what: 'session list panel opens so its controls are walkable',
    rule: 'audit coverage: openSession() bypasses the list (GH-245)' });
  for (const r of await chrome.eval(AUDIT_WALKER)) {
    if (!report.some((p) => p.what === r.what)) report.push({ ...r, page: 'playback' });
  }
  for (const r of await kitButtonRows()) {
    if (!report.some((p) => p.what === r.what)) report.push({ ...r, page: 'playback' });
  }
  const errs = await chrome.eval('window.__test.errors');
  if (errs.length) fail('app errors (playback save card): ' + errs.join(' | '));
  await chrome.eval('window.__playback.close()');
  await sleep(400);
}

// ---- GH-301: the director strip (own player open over the SAME archive
// boot as auditPlaybackCard — called right after it, same navigation).
// Coverage: the strip lane + slot pills + transition picker + slot flyout
// + capture bar walk through KIT_BUTTON_WALKER (crediting the two
// .ob-pb-strip-* ledger lines and proving every new BUTTON carries the kit
// family), the A2 geometry-equality row, and the ×7-locale truncation
// sweep over every new control surface — labels NEVER ellipsize; the strip
// blocks SWAP representation instead (amendment A1), which is exactly what
// the scrollWidth probe enforces.
async function auditDirectorStrip(report) {
  const bad = (what) => report.push({ ok: false, page: 'playback', what,
    rule: 'the GH-301 director strip must be reachable and audit-clean' });
  const sid = await chrome.eval(
    '(async () => (await window.__archive?.sessions?.())?.[0]?.id ?? null)()');
  if (!Number.isFinite(sid)) { bad('no archived session — strip NOT audited'); return; }
  if (await chrome.eval(`window.__playback.openSession(${sid})`) !== true) {
    bad('openSession refused — strip NOT audited');
    return;
  }
  await sleep(600);
  const mounted = await chrome.eval(
    'window.__playback.strip?.()?.mounted?.() === true');
  if (!mounted) { bad('strip editor not mounted — NOT audited'); return; }
  // a plan with a mid-segment cut + a fade seam so blocks, seams and the
  // picker all exist (single-shot sessions keep the whole surface on seg 0)
  const segs = await chrome.eval('window.__playback.state().durs.length');
  await chrome.eval(`window.__playback.setCutPlan({ cuts: [
    { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },
    { seg: 0, t: 0.5, cam: 3, transitionIn: 0, dur: 0 }
    ${segs > 1 ? ', { seg: 1, t: 0, cam: 5, transitionIn: 2, dur: 1.0 }' : ''}
  ], poses: [] })`);
  await sleep(300);
  // A2 geometry equality — the owner amendment as a standing audit row
  const a2 = await chrome.eval(`(() => {
    const preset = document.querySelector('.ob-pb-cam[data-cam="broadcast"]');
    const slot = document.querySelector('.ob-pb-slot');
    if (!preset || !slot) return { err: 'pills missing' };
    const box = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const lb = el.querySelector('.ob-pb-cam-l');
      const lcs = lb ? getComputedStyle(lb) : {};
      return [r.width.toFixed(1), r.height.toFixed(1), cs.padding,
        cs.borderRadius, lcs.fontSize, lcs.fontWeight].join('|');
    };
    return { preset: box(preset), slot: box(slot) }; })()`);
  report.push({ ok: !a2.err && a2.preset === a2.slot, page: 'playback',
    what: `slot pills wear the preset-pill geometry verbatim (A2) — `
      + `${JSON.stringify(a2)}`,
    rule: 'GH-301 owner amendment A2: exact geometry/typography equality' });
  // GH-330: the capture latch disables every pill with a localized reason
  // (the statically-knowable no-op wears the kit :disabled state), and the
  // pills re-arm the instant the capture exits
  const g330 = await chrome.eval(`(() => {
    window.__playback.strip().enterCapture(0);
    const p = document.querySelector('.ob-pb-cam[data-cam="broadcast"]');
    const s = document.querySelector('.ob-pb-slot[data-slot="0"]');
    const out = { pDis: !!p?.disabled, sDis: !!s?.disabled,
      pTitle: p?.title ?? '',
      want: window.__i18n.t('playback.strip.capturing'),
      fade: p ? parseFloat(getComputedStyle(p).opacity) : 1 };
    window.__playback.strip().cancelCapture();
    out.rearmed = p ? p.disabled === false : false;
    return out; })()`);
  report.push({ ok: g330.pDis && g330.sDis && g330.pTitle === g330.want
    && g330.fade < 0.5 && g330.rearmed, page: 'playback',
    what: 'capture latch disables the CAM/slot pills with the localized '
      + `reason and re-arms on exit (GH-330) — ${JSON.stringify(g330)}`,
    rule: 'GH-330: statically-knowable no-ops wear the kit disabled state' });
  // walk the strip surface with the picker + flyout OPEN so every new
  // control is judged (kit classes on buttons; ledger lines on the lane)
  await chrome.eval('window.__playback.strip().openTransPicker(1); true');
  await sleep(200);
  for (const r of await kitButtonRows()) {
    if (!report.some((p) => p.what === r.what)) report.push({ ...r, page: 'playback' });
  }
  await chrome.eval('window.__playback.strip().closePop(); true');
  // ×7 locales: every new control label fits its box (never ellipsizes)
  for (const locale of GAME_LOCALES) {
    await chrome.eval(`window.__settings.set('language', '${locale}')`);
    await sleep(500);
    const clipped = await chrome.eval(`(() => {
      const out = [];
      window.__playback.strip().openTransPicker(1);
      window.__playback.strip().enterCapture(0);
      for (const el of document.querySelectorAll(
        '.ob-pb-strip-bl, .ob-pb-slot .ob-pb-cam-l, .ob-pb-slots .ob-pb-cam-l,'
        + ' .ob-pb-transopt, .ob-pb-transdel, .ob-pb-slotact, .ob-pb-pop h4,'
        + ' .ob-pb-capbar span, .ob-pb-capsave, .ob-pb-capcancel,'
        + ' .ob-pb-strip-hint')) {
        if (!el.getClientRects().length) continue;
        if (el.scrollWidth > el.clientWidth + 1) {
          out.push((el.className || el.tagName) + ': '
            + el.textContent.trim().slice(0, 24));
        }
      }
      window.__playback.strip().cancelCapture();
      window.__playback.strip().closePop();
      return out; })()`);
    report.push({ ok: !clipped.length, page: 'playback',
      what: `director-strip labels never truncate [${locale}]`
        + (clipped.length ? ' — clipped: ' + clipped.join('; ') : ''),
      rule: 'control labels never ellipsize (A1 swaps representation instead)' });
  }
  // GH-330 ×7: a grammar-refused pill tap paints the LOCALIZED refusal hint
  // (never a silent no-op), wrapped inside the viewport, model untouched
  await chrome.eval(`window.__playback.setCutPlan({ cuts: [
    { seg: 0, t: 0, cam: 1, transitionIn: 0, dur: 0 }], poses: [] })`);
  await chrome.eval('window.__playback.strip().setExpanded(true); true');
  for (const locale of GAME_LOCALES) {
    await chrome.eval(`window.__settings.set('language', '${locale}')`);
    await sleep(500);
    const hint330 = await chrome.eval(`(() => {
      const p = window.__playback;
      p.seek(p.state().total * 0.5);
      p.strip().insertAtPlayhead(0); // static cut inside the chase span
      const h = document.querySelector('.ob-pb-strip-hint');
      if (!h) return { err: 'no hint node' };
      const r = h.getBoundingClientRect();
      return { shown: h.style.display !== 'none', text: h.textContent,
        want: window.__i18n.t('playback.strip.refusedSpan'),
        clipped: h.scrollWidth > h.clientWidth + 1,
        inVp: r.left >= 0 && r.right <= innerWidth && r.width > 0,
        cuts: p.getCutPlan().cuts.length };
    })()`);
    report.push({ ok: !hint330.err && hint330.shown
      && hint330.text === hint330.want && !hint330.clipped && hint330.inVp
      && hint330.cuts === 1, page: 'playback',
      what: `grammar-refused tap paints the localized refusal hint [${locale}]`
        + ` — ${JSON.stringify(hint330)}`,
      rule: 'GH-330: contextual refusals are never silent (transient hint)' });
  }
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(300);
  const errs = await chrome.eval('window.__test.errors');
  if (errs.length) fail('app errors (director strip): ' + errs.join(' | '));
  await chrome.eval('window.__playback.close()');
  await sleep(400);
}

// ---- 031 (feature 031 (internal spec) T024/T027): shell-chrome audit extension ------
// Own page hop onto the reserved `obshell=1` scripted opt-in (coordinator
// ruling 3 — the deterministic shell pose for fixtures): walks the shell
// rail/quick-play/remember/cards through the standing walkers (truncation ×7
// locales, native-control ban + rolled-own ratchet, icon centring) plus the
// shell's own geometry laws (single-row rail, chrome inside the viewport,
// rail ∩ quick-play disjoint).
// 036a (T025): the practice place's card-geometry law, judged by BOTH walks
// (the desktop shell walk ×7 locales and the phone walker at 844×390 /
// 667×375 / 926×428 ×7): every control ≥44 pt in both dimensions, titles
// single-line, hints ≤2 lines, the assist strip ONE row (it pans, never
// wraps), nothing clips or ellipsizes, the group inside the viewport
// (feature 036 (internal spec): FR-041, plan §3.2 budgets, contract §4 row
// e2e-ui.mjs). Returns the list of breaches (empty = clean).
const PRACTICE_GEO_WALKER = `(() => {
  const bad = [];
  const root = document.getElementById('ob-practice');
  if (!root || root.hidden) return ['#ob-practice not presented'];
  const vis = (el) => el.getClientRects().length > 0;
  const lh = (el) => { const cs = getComputedStyle(el); const v = parseFloat(cs.lineHeight);
    return Number.isFinite(v) ? v : parseFloat(cs.fontSize) * 1.2; };
  const lines = (el) => Math.round(el.getBoundingClientRect().height / lh(el));
  const name = (el) => (el.closest('[data-ob]')?.dataset.ob ?? 'practice') + '/'
    + (el.dataset.i18n ?? el.dataset.assist ?? el.dataset.ob ?? el.className.split(' ')[0]);
  // a card clips its overflow: any text/control box outside its card's box
  // is a squashed card (the clamp must scroll the group, never shrink cards)
  const inCard = (el) => { const card = el.closest('.ob-practice-card'); if (!card) return;
    const c = card.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5 || r.left < c.left - 0.5
      || r.right > c.right + 0.5) bad.push(name(el) + ' clipped by its card'); };
  const rr = root.getBoundingClientRect();
  if (rr.left < -0.5 || rr.right > innerWidth + 0.5 || rr.top < -0.5
    || rr.bottom > innerHeight + 0.5) bad.push('#ob-practice breaches the viewport');
  // the host clears the rail band (the atelier phone-walk law: >= 4px)
  // wherever the two share a horizontal span
  const rail = document.getElementById('ob-shell-rail');
  const rb = rail ? rail.getBoundingClientRect() : null;
  if (rb && rb.width && Math.min(rr.right, rb.right) - Math.max(rr.left, rb.left) > 0
    && rr.bottom > rb.top - 4) {
    bad.push('#ob-practice does not clear the rail band (bottom ' + rr.bottom.toFixed(1)
      + ' vs rail top ' + rb.top.toFixed(1) + ')');
  }
  for (const el of root.querySelectorAll('.ob-practice-title')) {
    if (!vis(el)) continue;
    if (lines(el) > 1) bad.push(name(el) + ' title wraps (' + lines(el) + ' lines)');
    if (el.scrollWidth > el.clientWidth + 1) bad.push(name(el) + ' title clips');
    inCard(el);
  }
  for (const el of root.querySelectorAll('.ob-practice-hint')) {
    if (!vis(el)) continue;
    if (lines(el) > 2) bad.push(name(el) + ' hint over 2 lines (' + lines(el) + ')');
    if (el.scrollWidth > el.clientWidth + 1) bad.push(name(el) + ' hint clips');
    inCard(el);
  }
  const strip = root.querySelector('[data-ob="practice-assist-strip"]');
  for (const el of root.querySelectorAll('button, [role="radio"]')) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) {
      bad.push(name(el) + ' under 44pt (' + r.width.toFixed(1) + 'x' + r.height.toFixed(1) + ')');
    }
    if (el.scrollWidth > el.clientWidth + 1) bad.push(name(el) + ' clips');
    if (getComputedStyle(el).textOverflow === 'ellipsis') bad.push(name(el) + ' ellipsizes');
    // strip segments live in the strip's OWN scrollport (US-7: the strip
    // PANS rather than truncating) — segments panned out of it are not
    // judged for containment (the atelier chip-probe discipline); the
    // strip box itself is judged below
    if (strip && strip.contains(el) && el !== strip) continue;
    if (r.left < -0.5 || r.right > innerWidth + 0.5) bad.push(name(el) + ' breaches the viewport');
    inCard(el);
  }
  if (strip && vis(strip)) {
    const sr = strip.getBoundingClientRect();
    if (sr.left < -0.5 || sr.right > innerWidth + 0.5) bad.push('assist strip breaches the viewport');
    inCard(strip);
    const segs = [...strip.querySelectorAll('[data-assist]')].filter(vis);
    const tops = segs.map((s) => s.getBoundingClientRect().top);
    // the kit segmented's --stack pole (GH-668 B-K03: a column of rows the
    // moment a label cannot paint on one line) is a legal form, not a wrap —
    // for EVERY consumer, not practice alone (S5 slice 4 verifier round 1 P3,
    // confirmed by the integrator: the walker rule stays, this comment names
    // the ruling)
    const stacked = strip.classList.contains('ob-segmented--stack');
    if (segs.length && !stacked && Math.max(...tops) - Math.min(...tops) >= 2) bad.push('assist strip wrapped');
    for (const s of segs) {
      const lab = s.querySelector('span') ?? s;
      if (lines(lab) > 1) bad.push('segment ' + s.dataset.assist + ' label wraps');
    }
    // overflow is lawful ONLY as a pan: content wider than the scrollport
    // needs a scrollable strip (kit .ob-strip overflow-x:auto); a wider
    // content inside a non-scrolling mount is a real clip
    const ox = getComputedStyle(strip).overflowX;
    if (strip.scrollWidth > strip.clientWidth + 1 && ox !== 'auto' && ox !== 'scroll') {
      bad.push('assist strip content overflows a non-panning mount ('
        + strip.scrollWidth + ' > ' + strip.clientWidth + ')');
    }
  }
  return bad;
})()`;

async function auditShellChrome(report) {
  await chrome.send('Page.navigate',
    { url: `${APP_URL}&obtool=1&obshell=1&u=shellwalk` });
  await waitReady();
  let up = false;
  for (let i = 0; i < 50 && !up; i++) {
    up = await chrome.eval('window.__shell?.isOpen?.() === true')
      .catch(() => false);
    if (!up) await sleep(200);
  }
  if (!up) throw new Error('obshell boot never opened the shell');
  await chrome.eval(a11InstallJs()); // GH-668 A11 reveal probe (mount law)
  for (const locale of GAME_LOCALES) {
    await chrome.eval(`window.__settings.set('language', '${locale}')`);
    await sleep(500);
    const bad = await chrome.eval(TRUNC_WALKER);
    report.push({ ok: !bad.length, page: 'shell',
      what: `no truncated shell-chrome labels [${locale}]`
        + (bad.length ? ' — truncated: ' + bad.join(', ') : '') });
    const geo = await chrome.eval(`(() => {
      const rail = document.getElementById('ob-shell-rail');
      const qp = document.getElementById('ob-shell-quickplay-wrap');
      const cards = document.getElementById('ob-shell-cards');
      if (!rail || !qp || !cards) return 'chrome missing';
      const tops = [...rail.querySelectorAll('.ob-shell-place')]
        .map((el) => el.getBoundingClientRect().top);
      if (Math.max(...tops) - Math.min(...tops) >= 2) return 'rail wrapped';
      for (const [name, el] of [['rail', rail], ['quickplay', qp],
        ['cards', cards]]) {
        const r = el.getBoundingClientRect();
        if (r.left < 0 || r.right > innerWidth || r.top < 0
          || r.bottom > innerHeight) return name + ' breaches the viewport';
      }
      const a = rail.getBoundingClientRect(), b = qp.getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 0 && h > 0) return 'rail overlaps quick-play';
      // GH-534 round 7 ARM (the CENTER-SYMMETRY law, kit strip control):
      // when the rail content FITS, the block centers — start/end
      // residuals (border edge to first/last child, the settings gear
      // included) agree within 1px; overflow pans under the
      // optical-inset/scroll-padding law instead
      if (rail.scrollWidth <= rail.clientWidth + 1) {
        const rcs = getComputedStyle(rail);
        const kids = [...rail.children]
          .filter((q) => q.getClientRects().length);
        if (kids.length) {
          const rsv = kids[0].getBoundingClientRect().left
            - (a.left + parseFloat(rcs.borderLeftWidth));
          const rev = (a.right - parseFloat(rcs.borderRightWidth))
            - kids[kids.length - 1].getBoundingClientRect().right;
          if (Math.abs(rsv - rev) > 1) {
            return 'rail content not centered (start residual '
              + rsv.toFixed(2) + ' vs end ' + rev.toFixed(2) + ')';
          }
        }
      }
      return 'ok';
    })()`);
    report.push({ ok: geo === 'ok', page: 'shell',
      what: `shell chrome geometry [${locale}]` + (geo === 'ok' ? '' : ' — ' + geo),
      rule: 'contract §6: single-row rail, chrome contained, surfaces disjoint' });
    // control walkers per place (the active card swaps per place)
    for (const placeId of ['play', 'practice', 'equipment', 'replays']) {
      await chrome.eval(`window.__shell.go('${placeId}')`);
      await sleep(100);
      // 036a (T025): the practice place presents its four cards through
      // R0's content host — bounded mount wait (plan §1.4: a cold arrival
      // only STARTS the import), then the card-geometry law in this locale
      if (placeId === 'practice') {
        let prc = false;
        for (let i = 0; i < 40 && !prc; i++) {
          prc = await chrome.eval('typeof window.__practice === "object" && document.getElementById("ob-practice")?.hidden === false')
            .catch(() => false);
          if (!prc) await sleep(150);
        }
        if (!prc) {
          report.push({ ok: false, page: 'shell',
            what: `[${locale}] practice arrival mounted the place`,
            rule: '036 contract §3: practice is the practice content' });
        } else {
          await sleep(150);
          const bad = await chrome.eval(PRACTICE_GEO_WALKER);
          report.push({ ok: !bad.length, page: 'shell',
            what: `practice cards geometry [${locale}]`
              + (bad.length ? ' — ' + bad.join(', ') : ''),
            rule: '036 FR-041: cards >=44 pt, titles single-line, hints <=2 '
              + 'lines, strip one row, never clip/ellipsize' });
        }
      }
      // 032 (T025): the equipment place presents the ATELIER — walk every
      // station's card surface (and the cues deep card with its expanders
      // OPEN) through the same walkers; the guarded atelier import lands
      // on the first equipment arrival, bounded wait below
      if (placeId === 'equipment') {
        let atl = false;
        for (let i = 0; i < 40 && !atl; i++) {
          atl = await chrome.eval('typeof window.__atelier === "object"')
            .catch(() => false);
          if (!atl) await sleep(150);
        }
        if (!atl) {
          report.push({ ok: false, page: 'shell',
            what: `[${locale}] equipment arrival mounted the atelier`,
            rule: '032 contract §3: the atelier is the equipment content' });
        } else {
          for (const st of ['cues', 'table', 'cloth', 'balls', 'lighting']) {
            await chrome.eval(`(async () => {
              window.__atelier.go('${st}');
              if ('${st}' === 'table') {
                const adv = document.querySelector(
                  '[data-ob="atelier-advanced"]');
                if (adv) adv.open = true;
              }
              if ('${st}' === 'cues') {
                // the healthy pick surface is the RAIL card (dev 12); the
                // row pick stands as the degrade-register fallback
                (document.querySelector(
                  '#ob-atelier-rail .ob-cardrail-card')
                  ?? document.querySelector(
                    '[data-ob="atelier-cues"] .ob-eq-prov-row__pick'))
                  ?.click();
                await new Promise((r) => setTimeout(r, 200));
                for (const sel of ['[data-ob="atelier-details"]',
                  '[data-ob="atelier-dossier"]']) {
                  const d = document.querySelector(sel);
                  if (d) d.open = true;
                }
              }
              return true;
            })()`);
            await sleep(120);
            const badT = await chrome.eval(TRUNC_WALKER);
            report.push({ ok: !badT.length, page: 'shell',
              what: `no truncated atelier labels [${locale}/${st}]`
                + (badT.length ? ' — truncated: ' + badT.join(', ') : '') });
            // GH-1001 (atelier.md §7 B20-1): the equal-height card law on the
            // desktop register (1280x800 = the macOS app's default window)
            const badE = await chrome.eval(EQH_PROBE);
            report.push({ ok: !badE.length, page: 'shell',
              what: `atelier rail cards one height [${locale}/${st}]`
                + (badE.length ? ' — ' + badE.join(', ') : '') });
            // GH-534 item C (S2.5): strip/heading geometry — (a) every
            // station pill's rect contained in the strip rect on the BLOCK
            // axis (0.5px tolerance; inline-axis panning is by design, the
            // shell-rail idiom), (b) the active station heading's em box
            // sits >= 1px inside the #ob-atelier-cards clip edge (the
            // tight-line-height negative half-leading shave class).
            const ageo = await chrome.eval(`(() => {
              const nav = document.getElementById('ob-atelier-carousel');
              const cards = document.getElementById('ob-atelier-cards');
              if (!nav || !cards) return 'atelier strip/cards missing';
              const nr = nav.getBoundingClientRect();
              for (const p of nav.querySelectorAll('[data-station]')) {
                if (!p.getClientRects().length) continue;
                const pr = p.getBoundingClientRect();
                if (pr.top < nr.top - 0.5 || pr.bottom > nr.bottom + 0.5) {
                  return 'station pill ' + p.dataset.station
                    + ' clipped by the strip (pill ' + pr.top.toFixed(2)
                    + '..' + pr.bottom.toFixed(2) + ' vs strip '
                    + nr.top.toFixed(2) + '..' + nr.bottom.toFixed(2) + ')';
                }
              }
              // GH-534 owner round 3 ARM (the optical-inset law): the
              // strip's first/last INLINE insets are never tighter than
              // its block inset, judged at BOTH scroll extremes so the
              // panning register (long locales) is covered too. Unequal
              // insets read as the end pill touching the r-full strip's
              // rounded wall (the owner-evidence class: selected LIGHTING
              // at a 4px end inset under an 8px block inset). Red-proven
              // against the pre-fix sheet (padding sp-2/sp-1).
              const ncs = getComputedStyle(nav);
              const stripPills = [...nav.querySelectorAll('[data-station]')]
                .filter((q) => q.getClientRects().length);
              if (stripPills.length) {
                const save = nav.scrollLeft;
                nav.scrollLeft = 0;
                let nbox = nav.getBoundingClientRect();
                const fr = stripPills[0].getBoundingClientRect();
                const gTop = fr.top
                  - (nbox.top + parseFloat(ncs.borderTopWidth));
                const gStart = fr.left
                  - (nbox.left + parseFloat(ncs.borderLeftWidth));
                nav.scrollLeft = nav.scrollWidth; // clamps to max
                nbox = nav.getBoundingClientRect();
                const lr = stripPills[stripPills.length - 1]
                  .getBoundingClientRect();
                const gEnd = (nbox.right - parseFloat(ncs.borderRightWidth))
                  - lr.right;
                nav.scrollLeft = save;
                if (gStart < gTop - 0.5 || gEnd < gTop - 0.5) {
                  return 'station strip inline inset tighter than its block'
                    + ' inset (start ' + gStart.toFixed(2) + ' / end '
                    + gEnd.toFixed(2) + ' vs block ' + gTop.toFixed(2)
                    + ') — the optical-inset law';
                }
                // GH-534 round 7 ARM (the CENTER-SYMMETRY law): when the
                // pills FIT, the content block centers — start/end
                // residuals (border edge to first/last child) agree
                // within 1px; overflow pans under the optical-inset/
                // scroll-padding law above. Red-proven against the
                // pre-fix start-aligned strip (start residual = the
                // inset, end residual = the whole free run).
                if (nav.scrollWidth <= nav.clientWidth + 1) {
                  const kids = [...nav.children]
                    .filter((q) => q.getClientRects().length);
                  if (kids.length) {
                    const cb = nav.getBoundingClientRect();
                    const rsv = kids[0].getBoundingClientRect().left
                      - (cb.left + parseFloat(ncs.borderLeftWidth));
                    const rev = (cb.right
                      - parseFloat(ncs.borderRightWidth))
                      - kids[kids.length - 1]
                        .getBoundingClientRect().right;
                    if (Math.abs(rsv - rev) > 1) {
                      return 'station strip content not centered (start'
                        + ' residual ' + rsv.toFixed(2) + ' vs end '
                        + rev.toFixed(2) + ') — the center-symmetry law';
                    }
                  }
                }
              }
              // GH-668 S5 G5 (B-EQ05, ruling R13): with the showroom rail
              // LIVE the host is heading + strip + at most ONE line — the
              // station h3 is retired there (it repeated the strip pill),
              // so the clip law judges the FIRST painted child of the
              // active section (the cues hint / the table Advanced card);
              // the degrade register keeps the h3 law verbatim.
              const railLive = window.__atelier?.rail?.().live === true;
              const h3 = cards.querySelector(
                ':scope > section:not([hidden]) > h3');
              if (railLive && h3 && h3.getClientRects().length) {
                return 'station heading painted on the live-rail register (R13: heading + strip + one line)';
              }
              const first = railLive
                ? ([...cards.querySelectorAll(':scope > section:not([hidden]) > *')]
                  .find((n) => !n.hidden && n.getClientRects().length) ?? null)
                : h3;
              if (!first || !first.getClientRects().length) {
                if (!railLive) return 'active station heading missing';
              } else {
                const ht = first.getBoundingClientRect().top;
                const ct = cards.getBoundingClientRect().top;
                if (ht < ct + 1) {
                  return 'station ' + (railLive ? 'line' : 'heading')
                    + ' shaved at the cards clip edge (top ' + ht.toFixed(2)
                    + ' vs clip edge ' + ct.toFixed(2) + ')';
                }
              }
              // GH-525 dev 12 (S2.5 item B, the entry-10 pattern extended
              // to the rail): every visible card block-contained in the
              // rail scroll viewport (0.5px tolerance; inline panning is by
              // design — the shell-rail idiom), card names never truncate
              // (the ONE-line name grows the card), and the rail band stays
              // disjoint from the quick-play corner at every locale width.
              const rs = window.__atelier?.rail?.();
              if (rs?.live && !rs.hidden) {
                const rc = document.querySelector(
                  '[data-ob="atelier-rail-cards"]');
                if (!rc || !rc.getClientRects().length) {
                  return 'rail live but its scroll viewport is unpainted';
                }
                const rr = rc.getBoundingClientRect();
                for (const b of rc.querySelectorAll('.ob-cardrail-card')) {
                  if (!b.getClientRects().length) continue;
                  const br = b.getBoundingClientRect();
                  if (br.top < rr.top - 0.5 || br.bottom > rr.bottom + 0.5) {
                    return 'rail card ' + b.dataset.id
                      + ' clipped by the rail viewport (card '
                      + br.top.toFixed(2) + '..' + br.bottom.toFixed(2)
                      + ' vs rail ' + rr.top.toFixed(2) + '..'
                      + rr.bottom.toFixed(2) + ')';
                  }
                  const nm = b.querySelector('.ob-cardrail-name');
                  if (nm && nm.scrollWidth > nm.clientWidth + 1) {
                    return 'rail card name truncated: ' + b.dataset.id;
                  }
                }
                const qp = document.getElementById('ob-shell-quickplay-wrap');
                if (qp) {
                  const qr = qp.getBoundingClientRect();
                  const ra = document.getElementById('ob-atelier-rail')
                    .getBoundingClientRect();
                  const ow = Math.min(ra.right, qr.right)
                    - Math.max(ra.left, qr.left);
                  const oh = Math.min(ra.bottom, qr.bottom)
                    - Math.max(ra.top, qr.top);
                  if (ow > 0 && oh > 0) {
                    return 'rail overlaps the quick-play corner ('
                      + ow.toFixed(0) + 'x' + oh.toFixed(0) + 'px)';
                  }
                  // GH-525 bare review review round-1 (finding 2) ARM: the
                  // corner reserve is judged at the SCROLLPORT's BORDER
                  // box — the content-box bleed hid OUTSIDE the rail
                  // element's rect, so the rail-rect overlap check above
                  // stayed green while the strip's true edge crossed the
                  // reserve — and with the Remember tick visible (the
                  // widest quick-play stack this locale can produce; fr
                  // is the measured worst). The attribute toggle is
                  // restored before returning.
                  const rem = document.querySelector(
                    '[data-ob="shell-remember"]');
                  const was = rem ? rem.getAttribute('aria-pressed') : null;
                  if (rem) rem.setAttribute('aria-pressed', 'true');
                  const qr2 = qp.getBoundingClientRect();
                  const rr2 = rc.getBoundingClientRect();
                  if (rem && was !== null) {
                    rem.setAttribute('aria-pressed', was);
                  }
                  if (rr2.right > qr2.left - 0.5) {
                    return 'rail scrollport border box reaches the '
                      + 'quick-play wrap (scrollport right '
                      + rr2.right.toFixed(2) + ' vs wrap left '
                      + qr2.left.toFixed(2) + ' with the Remember tick)';
                  }
                }
              }
              return 'ok';
            })()`);
            report.push({ ok: ageo === 'ok', page: 'shell',
              what: `atelier strip/heading/rail geometry [${locale}/${st}]`
                + (ageo === 'ok' ? '' : ' — ' + ageo),
              rule: 'GH-534 item C: pills contained in the strip box;'
                + ' GH-534 r3/r7: optical-inset + center-symmetry (the kit'
                + ' strip control laws);'
                + ' the active heading clear of the cards clip edge;'
                + ' GH-525 dev 12: rail cards contained + names never'
                + ' truncate + quick-play corner clear;'
                + ' GH-525 bare-review r1 finding 2: scrollport BORDER box'
                + ' left of the quick-play wrap w/ the Remember tick' });
            // GH-525 S2.5 capture round 3 (the ledger-fold finding): the
            // spec card's actions row is a PINNED FOOTER on the desktop
            // register — for the WORST-title cue (longest rendered card
            // name, e.g. masse_trick_dwell; the 2-line-title class whose
            // collapsed card beat the with-rail band cap by 10-34px at
            // 1280x800), Equip and Try-it must sit fully inside the
            // viewport AND the card's visible box (0.5px tolerance) at
            // the ARRIVAL scroll position with the expanders collapsed —
            // the half-cut-at-the-fold class the round-3 pack named.
            // #1214 (KF-021): the pick and its presentation are deterministic.
            // (1) Only a card a pick can present competes: an aria-disabled
            // card is browse-only (ui/cardrail.js activate) and presents
            // nothing; an unrendered card is out. Names are measured after
            // the font set settles. (2) Names WRAP in the slot (the GH-534
            // card-width law, ui/atelier.css), so scrollWidth ties at the
            // slot width for every card and the pick used to fall to DOM
            // order; the tie breaks on the name's laid-out text length (the
            // longest rendered name), then the card id (code-unit order),
            // then DOM order, and the judged id rides the OK row so a change
            // of pick is visible. (3) A bounded wait replaces the single
            // 300 ms sample: the card must present FOR THE PICK
            // (__atelier.floatState().id), so an ignored click under an
            // older card never passes, and then come to rest. The bounds
            // cover presentation and rest only — the select→float budget is
            // e2e-atelier C/H's FLOAT_BUDGET_MS — and the fold checks below
            // stay exact.
            if (st === 'cues') {
              const PRESENT_BOUND_MS = 3000; // each wait: fonts, present, rest
              const fold = await chrome.eval(`(async () => {
                const settle = (ms) => new Promise((r) => setTimeout(r, ms));
                try {
                  await Promise.race([document.fonts?.ready,
                    settle(${PRESENT_BOUND_MS})]);
                } catch { /* no Font Loading API: measure as laid out */ }
                const textLen = (el) => {
                  let s = 0;
                  const tw = document.createTreeWalker(el,
                    NodeFilter.SHOW_TEXT);
                  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
                    const rg = document.createRange();
                    rg.selectNodeContents(n);
                    for (const q of rg.getClientRects()) s += q.width;
                  }
                  return s;
                };
                const worstOf = (sel, nameSel) => [...document
                  .querySelectorAll(sel)]
                  .filter((b) => b.getAttribute('aria-disabled') !== 'true'
                    && !b.disabled && b.getClientRects().length > 0)
                  .map((b, i) => {
                    const nm = b.querySelector(nameSel);
                    return { b, i, id: b.dataset.id ?? '',
                      w: nm?.scrollWidth ?? 0, len: nm ? textLen(nm) : 0 };
                  })
                  .sort((x, y) => (y.w - x.w) || (y.len - x.len)
                    || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
                    || (x.i - y.i))[0]?.b;
                const worst = worstOf('#ob-atelier-rail .ob-cardrail-card',
                  '.ob-cardrail-name')
                  ?? worstOf('[data-ob="atelier-cues"] .ob-eq-prov-row__pick',
                    '.ob-eq-prov-row__name');
                if (!worst) return { why: 'no cue pick surface' };
                const id = worst.dataset.id ?? 'row';
                worst.click();
                const card = document.getElementById('ob-atelier-cue');
                const floated = () => window.__atelier?.floatState?.().id
                  ?? null;
                const shown = () => !!card && !card.hidden
                  && (worst.dataset.id === undefined
                    || floated() === worst.dataset.id);
                const t0 = performance.now();
                while (!shown()
                  && performance.now() - t0 < ${PRESENT_BOUND_MS}) {
                  await settle(25);
                }
                if (!shown()) {
                  if (card && !card.hidden) {
                    return { why: 'spec card presents ' + floated()
                      + ', not the pick [' + id + '], after '
                      + ${PRESENT_BOUND_MS} + ' ms' };
                  }
                  return { why: 'spec card never presented [' + id
                    + '] within ' + ${PRESENT_BOUND_MS} + ' ms (card '
                    + (card ? 'hidden' : 'missing') + ', float '
                    + floated() + ')' };
                }
                // at rest: a freshly mounted card enters with the kit's 8 px
                // rise over T_MED (ui/motion.js mount), which the old fixed
                // sample outlasted by accident — the fold is measured once
                // the card's box is unchanged over two consecutive frame
                // intervals (three samples, each after the kit's shared tick
                // in its frame; the tween's p = 0 first step repeats its
                // from-state once, so never fewer)
                const boxOf = () => {
                  const q = card.getBoundingClientRect();
                  return [q.left, q.top, q.width, q.height].join(',');
                };
                const t1 = performance.now();
                let prev = null, still = 0;
                while (still < 2
                  && performance.now() - t1 < ${PRESENT_BOUND_MS}) {
                  await new Promise((r) => requestAnimationFrame(() => r()));
                  const b = boxOf();
                  still = b === prev ? still + 1 : 0;
                  prev = b;
                }
                if (still < 2) {
                  return { why: 'spec card never came to rest [' + id
                    + '] within ' + ${PRESENT_BOUND_MS}
                    + ' ms of its presentation' };
                }
                for (const d of card.querySelectorAll('details')) {
                  d.open = false; // the collapsed arrival face
                }
                card.scrollTop = 0; // the arrival scroll position
                await new Promise((r) => requestAnimationFrame(() => r()));
                const cr = card.getBoundingClientRect();
                for (const sel of ['[data-ob="atelier-equip"]',
                  '[data-ob="atelier-tryit"]']) {
                  const el = card.querySelector(sel);
                  if (!el || !el.getClientRects().length) {
                    return { why: sel + ' missing on the card [' + id + ']' };
                  }
                  const r = el.getBoundingClientRect();
                  if (r.left < -0.5 || r.top < -0.5
                    || r.right > innerWidth + 0.5
                    || r.bottom > innerHeight + 0.5) {
                    return { why: sel + ' outside the viewport [' + id
                      + '] (' + r.top.toFixed(2) + '..' + r.bottom.toFixed(2)
                      + ' vs 0..' + innerHeight + ')' };
                  }
                  if (r.left < cr.left - 0.5 || r.top < cr.top - 0.5
                    || r.right > cr.right + 0.5
                    || r.bottom > cr.bottom + 0.5) {
                    return { why: sel + ' cut by the card fold [' + id
                      + '] (control ' + r.top.toFixed(2) + '..'
                      + r.bottom.toFixed(2) + ' vs card '
                      + cr.top.toFixed(2) + '..' + cr.bottom.toFixed(2)
                      + ')' };
                  }
                }
                return { ok: true, id };
              })()`);
              const foldOk = fold?.ok === true;
              report.push({ ok: foldOk, page: 'shell',
                what: `worst-title cue: actions row inside the arrival fold`
                  + ` [${locale}]` + (foldOk ? ` (judged ${fold.id})`
                    : ' — ' + (fold?.why ?? 'no verdict')),
                rule: 'GH-525 capture r3: the actions row is a pinned card'
                  + ' footer on desktop — never at fold mercy' });
            }
            // GH-525 bare review review round-2 (finding 2) ARM: the rail
            // keyboard walk SURVIVES a stage pick. A card activation
            // stages a preview whose ob:settings broadcast synchronously
            // rebuilds the rows — pre-fix, cardRail.update() rebuilt the
            // card nodes, the focused card left the DOM and focus fell to
            // <body>, so the very next Arrow was dead (one pick, then a
            // dead keyboard). Law (cardrail.js update): an unchanged id
            // inventory never rebuilds (refresh semantics), and a true
            // rebuild re-seats focus. TRUSTED keys via CDP (the F3 arm
            // law); en only — the mechanism is locale-invariant.
            if (st === 'cloth' && locale === 'en') {
              const focused = await chrome.eval(`(() => {
                const rc = document.querySelector(
                  '[data-ob="atelier-rail-cards"]');
                const b = rc?.querySelector(
                  '.ob-cardrail-card[aria-selected="true"]')
                  ?? rc?.querySelector('.ob-cardrail-card');
                if (!b) return false;
                b.focus();
                return document.activeElement === b;
              })()`);
              const key = async () => {
                for (const type of ['keyDown', 'keyUp']) {
                  await chrome.send('Input.dispatchKeyEvent', { type,
                    key: 'ArrowRight', code: 'ArrowRight',
                    windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
                }
              };
              let kb = focused ? 'ok' : 'no focusable cloth card';
              if (focused) {
                const s0 = await chrome.eval(
                  `window.__atelier.rail().selected`);
                await key();
                await sleep(200);
                const s1 = await chrome.eval(
                  `window.__atelier.rail().selected`);
                await key(); // immediately again — the dead-keyboard class
                await sleep(200);
                const s2 = await chrome.eval(
                  `window.__atelier.rail().selected`);
                const focusIn = await chrome.eval(`document.querySelector(
                  '[data-ob="atelier-rail-cards"]')
                  .contains(document.activeElement)`);
                // leave no staged transaction behind for the later legs
                await chrome.eval(
                  `window.__settings.preview?.revert?.(), true`);
                await sleep(150);
                if (s1 === s0) kb = `first Arrow never moved selection ('${s0}')`;
                else if (s2 === s1) {
                  kb = `second Arrow dead after the stage rebuild (stuck `
                    + `'${s1}', focus in rail: ${focusIn})`;
                } else if (!focusIn) {
                  kb = 'focus left the rail after the stage rebuild';
                }
              }
              report.push({ ok: kb === 'ok', page: 'shell',
                what: 'rail keyboard walk survives a stage pick '
                  + '(Arrow, Arrow) [en/cloth]'
                  + (kb === 'ok' ? '' : ' — ' + kb),
                rule: 'GH-525 bare-review r2 finding 2: an unchanged card '
                  + 'inventory never rebuilds (focus never churns); a true '
                  + 'rebuild re-seats focus on the same-id card' });
            }
            for (const rows of [await chrome.eval(AUDIT_WALKER),
              await kitButtonRows()]) {
              for (const r of rows) {
                const what = `[${locale === 'en' ? st : locale}] ${r.what}`;
                if (!report.some((p) => p.page === 'shell' && p.what === what)) {
                  report.push({ ...r, what, page: 'shell' });
                }
              }
            }
          }
          // leave the deep surface down for the next place iteration
          await chrome.eval(`window.__atelier.go('table'), true`);
        }
      }
      // 034 (T035): the play place — the guarded play.js import lands on
      // the first play arrival (bounded wait); play card labels never
      // truncate ×7 (card names, chips, the back leg, the carom label,
      // variant rows) and the card geometry holds (section inside the
      // viewport, rail cards block-contained in the overflow-y-hidden rail
      // viewport, section disjoint from the quick-play stack). Protocol
      // R3: appended after the atelier block in registry order.
      if (placeId === 'play') {
        let ply = false;
        for (let i = 0; i < 40 && !ply; i++) {
          ply = await chrome.eval(`!!document.querySelector(
            'section[data-place="play"].ob-play-host')`).catch(() => false);
          if (!ply) await sleep(150);
        }
        if (!ply) {
          report.push({ ok: false, page: 'shell',
            what: `[${locale}] play arrival mounted the play card`,
            rule: '034 contract §3: play.js is the play content' });
        } else {
          const badP = await chrome.eval(`(() => {
            const bad = [];
            const sec = document.querySelector('section[data-place="play"]');
            for (const el of sec.querySelectorAll(
              '.ob-play-card__name, .ob-cardrail-chip, [data-ob="play-back"],'
              + ' .ob-play-carom2b__label, [data-variant-pick]')) {
              if (!el.getClientRects().length) continue;
              if (el.scrollWidth > el.clientWidth + 1) {
                bad.push(el.dataset.ob ?? el.dataset.variantPick
                  ?? el.closest('[data-game]')?.dataset.game
                  ?? el.textContent.slice(0, 20));
              }
            }
            return [...new Set(bad)];
          })()`);
          report.push({ ok: !badP.length, page: 'shell',
            what: `no truncated play labels [${locale}]`
              + (badP.length ? ' — truncated: ' + badP.join(', ') : ''),
            rule: 'control labels never ellipsize (e2e-ui --audit law);'
              + ' 034 plan §7 never-ellipsize budgets' });
          const pgeo = await chrome.eval(`(() => {
            const sec = document.querySelector('section[data-place="play"]');
            const qp = document.getElementById('ob-shell-quickplay-wrap');
            const games = sec.querySelector('[data-ob="play-games"]');
            if (!qp || !games) return 'play chrome missing';
            const sr = sec.getBoundingClientRect();
            if (sr.left < -0.5 || sr.right > innerWidth + 0.5
              || sr.top < -0.5 || sr.bottom > innerHeight + 0.5) {
              return 'play section breaches the viewport (' + sr.top.toFixed(1)
                + '..' + sr.bottom.toFixed(1) + ' vs 0..' + innerHeight + ')';
            }
            const gr = games.getBoundingClientRect();
            for (const b of games.querySelectorAll('[data-ob="play-game"]')) {
              if (!b.getClientRects().length) continue;
              const br = b.getBoundingClientRect();
              if (br.top < gr.top - 0.5 || br.bottom > gr.bottom + 0.5) {
                return 'rail card ' + b.dataset.game
                  + ' clipped by the rail viewport (card ' + br.top.toFixed(2)
                  + '..' + br.bottom.toFixed(2) + ' vs rail ' + gr.top.toFixed(2)
                  + '..' + gr.bottom.toFixed(2) + ')';
              }
            }
            const qr = qp.getBoundingClientRect();
            const ow = Math.min(sr.right, qr.right) - Math.max(sr.left, qr.left);
            const oh = Math.min(sr.bottom, qr.bottom) - Math.max(sr.top, qr.top);
            if (ow > 0 && oh > 0) {
              return 'play section overlaps the quick-play stack ('
                + ow.toFixed(0) + 'x' + oh.toFixed(0) + 'px)';
            }
            return 'ok';
          })()`);
          report.push({ ok: pgeo === 'ok', page: 'shell',
            what: `play card geometry [${locale}]`
              + (pgeo === 'ok' ? '' : ' — ' + pgeo),
            rule: '034 FR-003: section contained, rail cards contained in the'
              + ' rail viewport, quick-play stack clear' });
        }
      }
      // 035 (Ta16): the replays place — the leaf lands on the first replays
      // arrival (guarded dynamic import; the atelier idiom above). Rail ROWS
      // need an ARMED archive and this obshell walk page is obtool-stamped
      // (archive.js disarms on scripted boots unless `?archive=1`), so the
      // first replays visit hops ONCE onto the posed+armed twin of the page
      // (`obshell=1&archive=1`, the e2e-replays POSED recipe), seeds one
      // session through the scripted-shot seam and re-enters replays; every
      // later locale walks that same page (the hop is keyed on the archive
      // opt-in itself, not on a loop counter). The opt-in is dropped from
      // sessionStorage after the LAST locale — the auditPlaybackCard
      // exit-path law: a persisted opt-in would arm the later scripted
      // boots and break the issue-#14 hermetic-boot law. Sweeps: the
      // toolbar-family TRUNC_WALKER plus a replays-scoped never-ellipsize
      // walk over the card AND the body-level rail (control labels,
      // headings, sentences, day/meta lines AND `.ob-pb-title` — GH-668
      // B-K07 retired the kit's last ellipsis: the row's identity wraps),
      // then the desktop rail geometry: contained, exactly ONE body-level
      // band, disjoint from the card column / strip / quick-play / the
      // forced #ob-shell-note (contract §4 law 9b).
      if (placeId === 'replays') {
        const armedExpr = `(() => { try {
          return sessionStorage.getItem('ob-archive-optin') === '1';
        } catch { return false; } })()`;
        if (!(await chrome.eval(armedExpr).catch(() => false))) {
          let seeded = 'hop failed';
          try {
            await chrome.send('Page.navigate', {
              url: `${APP_URL}&obtool=1&obshell=1&archive=1&u=shellwalk035` });
            await waitReady();
            let up2 = false;
            for (let i = 0; i < 50 && !up2; i++) {
              up2 = await chrome.eval('window.__shell?.isOpen?.() === true')
                .catch(() => false);
              if (!up2) await sleep(200);
            }
            if (!up2) seeded = 'the armed hop never opened the shell';
            else {
              const err = await chrome.eval(
                '__test.shoot({ v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
              let st = 'PLAYBACK';
              for (let i = 0; i < 200 && (st === 'PLAYBACK' || st === 'SIMULATING'); i++) {
                await sleep(300); st = await chrome.eval('__test.state()');
              }
              await chrome.eval('window.__archive?.flush?.()');
              const n = await chrome.eval(
                '(async () => (await window.__archive?.sessions?.())?.length ?? 0)()');
              seeded = err ? `shot rejected (${err})` : n >= 1 ? 'ok' : 'no archived session';
            }
          } catch (e) { seeded = 'hop threw: ' + (e.message ?? e); }
          report.push({ ok: seeded === 'ok', page: 'shell',
            what: `[${locale}] replays walk seeded one session on the armed hop`
              + (seeded === 'ok' ? '' : ' — ' + seeded),
            rule: '035 plan §7.2: rail rows need a seeded archive (?archive=1 + one shot)' });
          await chrome.eval(`window.__shell?.go?.('replays'), true`).catch(() => {});
          await sleep(100);
        }
        let rp = false;
        for (let i = 0; i < 40 && !rp; i++) {
          rp = await chrome.eval('typeof window.__replays === "object"')
            .catch(() => false);
          if (!rp) await sleep(150);
        }
        if (!rp) {
          report.push({ ok: false, page: 'shell',
            what: `[${locale}] replays arrival mounted the leaf`,
            rule: '035 contract §3: replays.js is the replays content' });
        } else {
          let rows = 0;
          for (let i = 0; i < 40 && rows < 1; i++) {
            rows = await chrome.eval(
              `document.querySelectorAll('#ob-replays-list .ob-pb-row').length`)
              .catch(() => 0);
            if (rows < 1) await sleep(150);
          }
          report.push({ ok: rows >= 1, page: 'shell',
            what: `[${locale}] replays rail presents the seeded row`,
            rule: '035 contract §3.1: the rail lists the archive (rows via __playback.mountList)' });
          const badT = await chrome.eval(TRUNC_WALKER);
          report.push({ ok: !badT.length, page: 'shell',
            what: `no truncated replays labels [${locale}]`
              + (badT.length ? ' — truncated: ' + badT.join(', ') : '') });
          const badR = await chrome.eval(`(() => {
            const bad = [];
            for (const el of document.querySelectorAll(
                '#ob-shell-cards section[data-place="replays"] h3,'
                + ' #ob-shell-cards section[data-place="replays"] button,'
                + ' #ob-shell-cards section[data-place="replays"] .ob-btn,'
                + ' #ob-shell-cards section[data-place="replays"] .ob-replays-day,'
                + ' #ob-shell-cards section[data-place="replays"] .ob-replays-meta,'
                + ' #ob-shell-cards section[data-place="replays"] .ob-replays-badge,'
                + ' #ob-shell-cards section[data-place="replays"] .ob-replays-empty,'
                + ' #ob-shell-cards section[data-place="replays"] .ob-replays-h3,'
                + ' #ob-replays-rail button, #ob-replays-rail .ob-btn,'
                + ' #ob-replays-rail .ob-replays-rail-empty,'
                + ' #ob-replays-rail .ob-pb-day, #ob-replays-rail .ob-pb-badge,'
                + ' #ob-replays-rail .ob-pb-title, #ob-replays-rail .ob-pb-when,'
                + ' #ob-replays-rail .ob-pb-t, #ob-replays-rail .ob-pb-m')) {
              if (el.hidden || !el.getClientRects().length) continue;
              if (el.scrollWidth > el.clientWidth + 1) {
                bad.push((el.id ? '#' + el.id : '.' + el.className.split(' ')[0])
                  + ' "' + el.textContent.trim().slice(0, 24) + '"');
              }
            }
            return [...new Set(bad)];
          })()`);
          report.push({ ok: !badR.length, page: 'shell',
            what: `no truncated labels inside #ob-replays-* [${locale}]`
              + (badR.length ? ' — truncated: ' + badR.join(', ') : ''),
            rule: '035 plan §9 gate 6: never-ellipsize inside the replays card + rail' });
          // force the transient note through the place's own honest register
          // (the e2e-replays arm P idiom) so the law-9b note clause is judged
          await chrome.eval(`window.__replays.open('no-such-session'), true`)
            .catch(() => {});
          await sleep(350);
          const rgeo = await chrome.eval(`(() => {
            const rail = document.getElementById('ob-replays-rail');
            const box = (el) => { if (!el || el.hidden || !el.getClientRects().length) return null;
              const r = el.getBoundingClientRect();
              return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
            const hit = (a, b) => !!a && !!b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
            const rb = box(rail);
            if (!rb) return 'rail not visible with a seeded archive';
            if (rb.x < -0.5 || rb.y < -0.5 || rb.r > innerWidth + 0.5 || rb.b > innerHeight + 0.5) {
              return 'rail breaches the viewport ' + JSON.stringify(rb);
            }
            const bands = [...document.body.children]
              .filter((el) => /^ob-replays-/.test(el.id ?? '')).map((el) => el.id);
            if (bands.length !== 1) return 'body-level bands ' + JSON.stringify(bands);
            for (const [name, sel] of [['card column', '#ob-shell-cards'],
              ['strip', '#ob-shell-rail'], ['quick-play', '#ob-shell-quickplay-wrap'],
              ['note', '#ob-shell-note']]) {
              const ob = box(document.querySelector(sel));
              if (hit(rb, ob)) return 'rail overlaps the ' + name + ' ' + JSON.stringify(ob);
            }
            if (!box(document.getElementById('ob-shell-note'))) return 'note not forced visible';
            return 'ok';
          })()`);
          report.push({ ok: rgeo === 'ok', page: 'shell',
            what: `replays rail geometry [${locale}]` + (rgeo === 'ok' ? '' : ' — ' + rgeo),
            rule: '035 contract §4 law 9b: one body-level band, contained, disjoint from the card column / strip / quick-play / note' });
        }
        if (locale === GAME_LOCALES[GAME_LOCALES.length - 1]) {
          await chrome.eval(`(() => { try {
            sessionStorage.removeItem('ob-archive-optin');
          } catch { /* storage unavailable */ } return true; })()`).catch(() => {});
        }
      }
      for (const rows of [await chrome.eval(AUDIT_WALKER), await kitButtonRows()]) {
        for (const r of rows) {
          const what = `[${locale === 'en' ? placeId : locale}] ${r.what}`;
          if (!report.some((p) => p.page === 'shell' && p.what === what)) {
            report.push({ ...r, what, page: 'shell' });
          }
        }
      }
      // GH-668 S5: the twelve kit laws on this posed place frame (desktop
      // register, every locale); the Tab walk + forced-state arms once (en)
      await auditKitLaws(report, 'shell ' + placeId, { locale });
      if (locale === 'en') {
        await auditKitFocus(report, 'shell ' + placeId);
        await auditKitStates(report, 'shell ' + placeId);
      }
    }
  }
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(300);
  // feature 012 (T052/SC-004), RE-HOMED by 032: the equipment TABLE
  // provenance browse lives at the atelier's table station — one row per
  // VISIBLE table entry, calibration-tier badge + pinned dimensional
  // provenance with the documented approximations (catalog data, English
  // by design); the signature notes stay user-visible (Joy 1270-vs-1260
  // repin history, snooker approximations, carom residuals).
  await chrome.eval(`window.__shell.go('equipment'), true`);
  await chrome.eval(`window.__atelier?.go('table'), true`);
  await sleep(200);
  const prov = await chrome.eval(`(async () => {
    const { catalogEntries } = await import('/dist/pool-sdk/index.js');
    const rows = [...document.querySelectorAll(
      '[data-ob="atelier-table"] .ob-eq-prov-row')].map((r) => ({
      id: r.dataset.id,
      badge: (r.querySelector('.ob-badge')?.textContent ?? '').trim(),
      text: r.querySelector('.ob-eq-prov-row__text')?.textContent ?? '',
      desc: (r.querySelector('.ob-eq-prov-row__desc')?.textContent ?? '').trim(),
      pick: r.querySelector('button.ob-eq-prov-row__pick') !== null,
      detailsClosed: (r.querySelector('details.ob-eq-prov-row__details')
        ?.open ?? null) === false,
    }));
    return { present: !!document.querySelector('[data-ob="atelier-table"]'),
      rows,
      // expected = catalog minus ui_hidden minus UI-DEMOTED
      // (pool_pro_9ft_measured, the measured table, leaves selection
      // surfaces — settings.js UI_DEMOTED / atelier.js demoted mirror;
      // kept while CURRENT, so the fresh-boot audit expects NO row for it)
      tableIds: catalogEntries('table_id')
        .filter((e) => !e.ui_hidden && e.id !== 'pool_pro_9ft_measured')
        .map((e) => e.id),
      railDemotedCard: !!document.querySelector('#ob-atelier-rail '
        + '.ob-cardrail-card[data-id="pool_pro_9ft_measured"]') };
  })()`);
  report.push({
    ok: prov.present && JSON.stringify(prov.rows.map((r) => r.id))
      === JSON.stringify(prov.tableIds),
    page: 'shell',
    what: `atelier table station lists every visible table entry `
      + `([${prov.rows.map((r) => r.id)}] vs catalog [${prov.tableIds}])`,
    rule: '012 US4/T049 re-homed by 032: provenance row per table entry' });
  for (const row of prov.rows) {
    report.push({ ok: row.text.length > 0 && row.badge.length > 0,
      page: 'shell',
      what: `table ${row.id}: provenance text + tier badge `
        + `("${row.text.slice(0, 40)}…", badge "${row.badge}")`,
      rule: 'SC-004: cited dimensional provenance displayed in the catalog' });
    report.push({
      ok: row.pick && row.desc.length > 0 && row.desc.length < 120
        && row.detailsClosed,
      page: 'shell',
      what: `table ${row.id}: pick BUTTON + short browse line `
        + `("${row.desc.slice(0, 40)}…") + closed-by-default dossier disclosure`,
      rule: '015 §7 D11 (issue #36) re-homed by 032: cards select the '
        + 'table; dossiers behind Details' });
  }
  const provRow = (id) => prov.rows.find((r) => r.id === id);
  const cn8 = provRow('chinese8_pro_9ft');
  report.push({
    ok: !!cn8 && cn8.text.includes('1270') && cn8.text.includes('1260'),
    page: 'shell',
    what: 'chinese8_pro_9ft renders the 1270-vs-1260 width repin history',
    rule: 'research.md R8 / FR-015 + GH-490: the recorded history is '
      + 'user-visible' });
  report.push({
    ok: !provRow('joy_q8_9ft'),
    page: 'shell',
    what: 'joy_q8_9ft (v15 resolve-only alias) renders NO station row',
    rule: 'GH-490 de-brand: ui_hidden entries leave the user-facing picker' });
  report.push({
    ok: !provRow('pool_pro_9ft_measured') && prov.railDemotedCard === false,
    page: 'shell',
    what: 'pool_pro_9ft_measured (UI-demoted measured table) renders '
      + 'NO station row and NO rail card on a fresh boot',
    rule: 'owner directive 2026-08-19: the owner\'s personal measured table '
      + 'leaves every selection surface (UI_DEMOTED, not ui_hidden — '
      + 'atelier.md §7 entry 22)' });
  // review r1 P1 backstop (the the ownership ledger mixed-vintage cache-poison law):
  // a STALE cached atelier.js predating the demotion still offers the card
  // and stages through settings preview.stage — fresh settings must refuse
  // the demoted id at that seam (NEW selection only; the committed base
  // stays exempt, proven in the grandfather leg below).
  const staleStage = await chrome.eval(`(() => {
    const before = window.__settings.get().equipment.table_id;
    const ret = window.__settings.preview.stage(
      'table_id', 'pool_pro_9ft_measured');
    const after = window.__settings.get().equipment.table_id;
    return { ret, before, after };
  })()`);
  report.push({
    ok: staleStage.ret === false && staleStage.after === staleStage.before,
    page: 'shell',
    what: 'preview.stage refuses the UI-demoted table on a fresh boot '
      + '(the stale-atelier backstop): ' + JSON.stringify(staleStage),
    rule: 'review r1 P1: UI_DEMOTED enforced at the settings staging seam '
      + '(mixed-vintage cache-poison law)' });
  const snook12 = provRow('wpbsa_snooker_12ft');
  report.push({ ok: !!snook12 && /approximation/i.test(snook12.text),
    page: 'shell',
    what: 'wpbsa_snooker_12ft renders its documented approximations',
    rule: 'FR-005: every geometry deviation documented in the provenance note' });
  const carom284 = provRow('umb_carom_284');
  report.push({ ok: !!carom284 && /residual/i.test(carom284.text),
    page: 'shell',
    what: 'umb_carom_284 renders its named residuals',
    rule: 'FR-014: residuals named, never modeled silently' });
  // build-4 QA fine-pointer floors, RE-HOMED by 032: the dossier Details
  // summaries (table station) + the brightness range rail (lighting
  // station) keep their >=24px fine-pointer floor on the new surface
  const floors = await chrome.eval(`(async () => {
    const dim = (el) => { const r = el.getBoundingClientRect();
      return +Math.min(r.width, r.height).toFixed(1); };
    // dossier summaries on the VISIBLE register: the option-row details on
    // the degrade/settings register, the left-column provenance details on
    // the rail register (GH-525 dev 12 re-homed the browse surface there)
    // GH-668 S5 G5 (B-EQ05, ruling R13): the rail register's provenance
    // block is the degrade register's now (the rail card carries the name
    // + badge); the disclosure the rail register paints at table is the
    // cushion Advanced summary — the same fine-pointer floor
    const summaries = [...document.querySelectorAll(
      '[data-ob="atelier-table"] .ob-eq-prov-row__details > summary,'
      + ' section[data-station="table"] [data-ob="atelier-prov"]'
      + ' .ob-atelier-prov__details summary,'
      + ' section[data-station="table"] details.ob-atelier-adv > summary')]
      .filter((el) => el.getClientRects().length).map(dim);
    window.__atelier.go('lighting');
    await new Promise((r) => setTimeout(r, 120));
    const b = document.querySelector('[data-ob="atelier-brightness"]');
    return { summaries,
      brightness: b?.getClientRects().length ? dim(b) : null };
  })()`);
  report.push({
    ok: floors.summaries.length > 0 && floors.summaries.every((d) => d >= 24),
    page: 'shell',
    what: `atelier dossier summaries >= 24px on fine pointer `
      + `(${floors.summaries.length} rows, min `
      + `${floors.summaries.length ? Math.min(...floors.summaries) : 'n/a'}px)`,
    rule: 'WCAG 2.5.8 fine-pointer floor (build-4 QA, re-homed by 032)',
  });
  report.push({
    ok: floors.brightness !== null && floors.brightness >= 24,
    page: 'shell',
    what: `atelier brightness range rail >= 24px on fine pointer `
      + `(${floors.brightness}px)`,
    rule: 'WCAG 2.5.8 fine-pointer floor (build-4 QA, re-homed by 032)',
  });
  // GH-525 bare review review round-2 (finding 4) ARM: narrow fine-pointer
  // windows. The bare corner-reserve cap (100vw − 532) hit 0 at <= 532px
  // and starved the rail while the healthy rail keeps the fallback rows
  // hidden — equipment selection unavailable. The fixed cap floors at
  // 288px; below the 820px crossover (100vw − 532 >= 288) the corner
  // reserve YIELDS and the quick-play stack must still paint above the
  // band and stay hittable (F5 mount order). 900x700 rides the healthy
  // band (368px cap); 640x700 (the half-1280 tiled-window class) sits
  // under the crossover, where the pre-fix cap left a 108px sliver that
  // cannot host one whole card — that width is the red-prove register.
  await chrome.eval(`window.__atelier.go('table'), true`);
  await sleep(200);
  for (const [nw, nh] of [[900, 700], [640, 700]]) {
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width: nw, height: nh, deviceScaleFactor: 0, mobile: false });
    await sleep(400);
    const narrow = await chrome.eval(`(() => {
      const rs = window.__atelier.rail();
      if (!rs.live || rs.hidden) return 'rail not live';
      const ra = document.getElementById('ob-atelier-rail');
      if (!ra.getClientRects().length) return 'rail unpainted';
      const rw = ra.getBoundingClientRect().width;
      if (rw < 287.5) {
        return 'rail starved to ' + rw.toFixed(2) + 'px (< the 288 floor)';
      }
      const rc = document.querySelector('[data-ob="atelier-rail-cards"]');
      const rr = rc.getBoundingClientRect();
      const vis = [...rc.querySelectorAll('.ob-cardrail-card')]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.left >= rr.left - 0.5
            && r.right <= rr.right + 0.5;
        });
      if (!vis.length) {
        return 'no card fully visible in the ' + rw.toFixed(0) + 'px rail';
      }
      const tr = vis[0].getBoundingClientRect();
      const hit = document.elementFromPoint(
        (tr.left + tr.right) / 2, (tr.top + tr.bottom) / 2);
      if (!hit || !vis[0].contains(hit)) {
        return 'visible card ' + vis[0].dataset.id + ' not hittable ('
          + (hit ? (hit.id || String(hit.className || '').split(' ')[0]
            || hit.tagName) : 'none') + ')';
      }
      const qp = document.getElementById('ob-shell-quickplay');
      const qr = qp.getBoundingClientRect();
      const qhit = document.elementFromPoint(
        (qr.left + qr.right) / 2, (qr.top + qr.bottom) / 2);
      if (!qhit || !qp.contains(qhit)) {
        return 'quick-play occluded on the yielded corner';
      }
      return 'ok';
    })()`);
    report.push({ ok: narrow === 'ok', page: 'shell',
      what: `narrow fine-pointer window ${nw}x${nh}: rail present >= 288px,`
        + ` a whole card hittable, quick-play reachable`
        + (narrow === 'ok' ? '' : ' — ' + narrow),
      rule: 'GH-525 bare-review r2 finding 4: the desktop rail cap floors at'
        + ' max(288px, 100vw − 532px); under the 820px crossover the corner'
        + ' reserve yields, never the selection surface' });
  }
  await chrome.send('Emulation.clearDeviceMetricsOverride');
  await sleep(300);
  // GRANDFATHER LEG (owner directive 2026-08-19, the grip_fitted clause):
  // a save that already HOLDS the demoted personal table keeps its row +
  // rail card while CURRENT — demotion drops NEW selection only. The
  // programmatic changeEquipment pin is the sanctioned scripted path
  // (never consults UI_DEMOTED), and the ob:settings commit wire rebuilds
  // the station rows/rail, so the reappearance below is the shipped
  // mechanism, not a test-side repaint. Restore is exact: changeEquipment
  // on table_id re-engages the recommended cushion pairing both ways.
  const grand = await chrome.eval(`(async () => {
    const on = await window.__settings.changeEquipment(
      'table_id', 'pool_pro_9ft_measured', { skipConfirm: true });
    await new Promise((r) => setTimeout(r, 400));
    const row = document.querySelector('[data-ob="atelier-table"] '
      + '.ob-eq-prov-row[data-id="pool_pro_9ft_measured"]');
    const card = document.querySelector('#ob-atelier-rail '
      + '.ob-cardrail-card[data-id="pool_pro_9ft_measured"]');
    const current = row?.getAttribute('aria-current') === 'true';
    // the committed-base EXEMPTION of the review r1 P1 backstop: while the
    // demoted id IS the committed value, re-picking it stays lawful (the
    // un-stage/revert idiom) and stages nothing
    const basePick = window.__settings.preview.stage(
      'table_id', 'pool_pro_9ft_measured');
    const basePickClean = window.__settings.get().equipment.table_id
      === 'pool_pro_9ft_measured';
    const off = await window.__settings.changeEquipment(
      'table_id', 'pool_pro_9ft', { skipConfirm: true });
    await new Promise((r) => setTimeout(r, 400));
    const rowAfter = !!document.querySelector('[data-ob="atelier-table"] '
      + '.ob-eq-prov-row[data-id="pool_pro_9ft_measured"]');
    return { on, row: !!row, card: !!card, current, basePick, basePickClean,
      off, rowAfter };
  })()`);
  report.push({
    ok: grand.on === true && grand.row && grand.card && grand.current
      && grand.basePick === true && grand.basePickClean === true
      && grand.off === true && grand.rowAfter === false,
    page: 'shell',
    what: 'demoted personal table GRANDFATHERED while current: sanctioned '
      + 'pin equips it -> station row + rail card reappear as current, '
      + 'base re-pick stays lawful; restore -> gone again ('
      + JSON.stringify(grand) + ')',
    rule: 'owner directive 2026-08-19 grandfather clause (the grip_fitted '
      + 'precedent): persisted-current saves keep resolving + rendering' });
  // COMPANION CLOTH DEMOTION (ruling A on the entry-22 flag, 2e986d57):
  // pool_worsted_measured — the companion Measured cloth — follows
  // the same precedent. Fresh boot: no station row, no rail card, and the
  // registry-driven preview.stage backstop refuses it; grandfather leg:
  // the sanctioned pin equips it -> row + card reappear as current, base
  // re-pick stays lawful, restore (pool_worsted_new, the shipped
  // default) -> gone again. Contract: atelier.md §7 entry 23.
  await chrome.eval(`window.__atelier.go('cloth'), true`);
  await sleep(300);
  const clothDemote = await chrome.eval(`(async () => {
    const sel = (root) => document.querySelector(root
      + ' [data-id="pool_worsted_measured"]');
    const freshRow = !!sel('[data-ob="atelier-cloth"]');
    const freshCard = !!document.querySelector('#ob-atelier-rail '
      + '.ob-cardrail-card[data-id="pool_worsted_measured"]');
    const stageBefore = window.__settings.get().equipment.cloth_id;
    const stageRet = window.__settings.preview.stage(
      'cloth_id', 'pool_worsted_measured');
    const stageAfter = window.__settings.get().equipment.cloth_id;
    // review r1 P1 (this slice): the DIRECT commit path — a pre-R3 cached
    // atelier calls changeEquipment(axis, id) plain — must refuse too;
    // skipConfirm IS the sanctioned trusted-pin bypass
    const directRet = await window.__settings.changeEquipment(
      'cloth_id', 'pool_worsted_measured');
    const directAfter = window.__settings.get().equipment.cloth_id;
    const on = await window.__settings.changeEquipment(
      'cloth_id', 'pool_worsted_measured', { skipConfirm: true });
    await new Promise((r) => setTimeout(r, 400));
    const row = document.querySelector('[data-ob="atelier-cloth"] '
      + '.ob-eq-prov-row[data-id="pool_worsted_measured"]');
    const card = !!document.querySelector('#ob-atelier-rail '
      + '.ob-cardrail-card[data-id="pool_worsted_measured"]');
    const current = row?.getAttribute('aria-current') === 'true';
    const basePick = window.__settings.preview.stage(
      'cloth_id', 'pool_worsted_measured');
    const basePickClean = window.__settings.get().equipment.cloth_id
      === 'pool_worsted_measured';
    // while CURRENT, a plain same-id re-commit stays a lawful no-op (the
    // grandfathered re-commit rides the same-id early return)
    const currentCommit = await window.__settings.changeEquipment(
      'cloth_id', 'pool_worsted_measured');
    const off = await window.__settings.changeEquipment(
      'cloth_id', 'pool_worsted_new', { skipConfirm: true });
    await new Promise((r) => setTimeout(r, 400));
    const rowAfter = !!document.querySelector('[data-ob="atelier-cloth"] '
      + '.ob-eq-prov-row[data-id="pool_worsted_measured"]');
    return { freshRow, freshCard, stageRet, stageBefore, stageAfter,
      directRet, directAfter, on, row: !!row, card, current, basePick,
      basePickClean, currentCommit, off, rowAfter };
  })()`);
  report.push({
    ok: clothDemote.freshRow === false && clothDemote.freshCard === false
      && clothDemote.stageRet === false
      && clothDemote.stageAfter === clothDemote.stageBefore
      && clothDemote.directRet === false
      && clothDemote.directAfter === clothDemote.stageBefore,
    page: 'shell',
    what: 'pool_worsted_measured (UI-demoted measured cloth) renders '
      + 'NO station row and NO rail card on a fresh boot; preview.stage '
      + 'AND the plain direct commit refuse it (both stale-vintage '
      + 'backstops): '
      + JSON.stringify({ freshRow: clothDemote.freshRow,
        freshCard: clothDemote.freshCard, stageRet: clothDemote.stageRet,
        directRet: clothDemote.directRet }),
    rule: 'companion ruling 2026-08-20 (atelier.md §7 entry 23) + review r1 '
      + 'P1: the owner\'s personal cloth leaves every selection surface '
      + '(UI_DEMOTED, not ui_hidden; skipConfirm = the sanctioned pin)' });
  report.push({
    ok: clothDemote.on === true && clothDemote.row && clothDemote.card
      && clothDemote.current && clothDemote.basePick === true
      && clothDemote.basePickClean === true
      && clothDemote.currentCommit === true && clothDemote.off === true
      && clothDemote.rowAfter === false,
    page: 'shell',
    what: 'demoted personal cloth GRANDFATHERED while current: sanctioned '
      + 'pin equips it -> station row + rail card reappear as current, '
      + 'base re-pick stays lawful; restore -> gone again ('
      + JSON.stringify(clothDemote) + ')',
    rule: 'companion ruling 2026-08-20 grandfather clause (the grip_fitted '
      + 'precedent): persisted-current saves keep resolving + rendering' });
  // GH-1001 (atelier.md §7 B20-1): the equal-height card law at the macOS
  // app's MINIMUM window (1024x640) — the walk above judges the 1280x800
  // default; the same probe per locale × station at the floor
  await chrome.send('Emulation.setDeviceMetricsOverride',
    { width: 1024, height: 640, deviceScaleFactor: 0, mobile: false });
  await sleep(400);
  await chrome.eval(`window.__shell.go('equipment')`);
  for (const locale of GAME_LOCALES) {
    await chrome.eval(`window.__settings.set('language', '${locale}')`);
    await sleep(500);
    for (const st of ['cues', 'table', 'cloth', 'balls', 'lighting']) {
      await chrome.eval(`window.__atelier.go('${st}'), true`);
      await sleep(250);
      // the probe passes an absent rail (its walk-wide contract) — at the
      // floor the rail must be live with cards, or the row is vacuous
      const live = await chrome.eval(`(() => { const rs = window.__atelier?.rail?.();
        return !!rs?.live && !rs.hidden && [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')]
          .filter((b) => b.getClientRects().length && b.getBoundingClientRect().width > 0).length >= 2; })()`);
      const badE = await chrome.eval(EQH_PROBE);
      report.push({ ok: live && !badE.length, page: 'shell',
        what: `atelier rail cards one height @1024x640 [${locale}/${st}]`
          + (live ? '' : ' — the rail is not live with cards')
          + (badE.length ? ' — ' + badE.join(', ') : '') });
    }
  }
  await chrome.send('Emulation.clearDeviceMetricsOverride');
  // the persisted language rides into the later reboots (the phone walk's
  // GH-463 row reads the English touch verb) — restore it as the walk above does
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(300);
  const errsShell = await chrome.eval('window.__test.errors');
  if (errsShell.length) fail('app errors (shell walk): ' + errsShell.join(' | '));
}

// ---- GH-668 S5 kit: the twelve --audit predicates (PLAN §4 A1–A12) ----------
// ONE geometry law each, exported from kit-laws.mjs so the capture tools
// reuse the law the gate enforces. Runs on every posed frame the walks
// below already produce (desktop shell places ×7 locales, the phone
// registers 844×390 / 667×375 / 926×428 + the shell / atelier / play /
// practice / replays hops, the 667×375 settings sheet). Rows a later slice
// owns ride the FROZEN KIT_LAW_OK ledger (liveness reported at the end).
const KIT_LADDER = readLadder(webDir);
const KIT_SEEN = new Set();
const KIT_SHORT = { A1: 'pill = one line', A2: 'text-2 ground', A3: 'reachability', A4: 'inline clip', A5: 'one glow',
  A6: 'pad tracks height', A7: 'height ladder', A8: 'never ellipsize', A9: 'focus visible + composed', A10: 'state registers',
  A11: 'motion ladder', A12: 'type roles', A13: 'one height per row', A14: 'equal cards per row', A15: 'coarse touch floor' };
const kitRow = (report, page, id, locale, bad, extra = '') => {
  const { red, ledgered } = applyLedger(id, bad, KIT_SEEN);
  report.push({ ok: !red.length, page,
    what: `${id} ${KIT_SHORT[id]}${locale ? ` [${locale}]` : ''}${extra}` + (red.length ? ' — ' + red.join('; ') : '')
      + (ledgered.length ? ` (ledgered ${ledgered.length})` : ''),
    rule: KIT_LAWS[id] });
};
// `client` = the CDP page to judge (default: the main audit page; the play
// fork frame rides its own hop browser — auditCaromFork)
async function auditKitLaws(report, page, { locale = 'en', coarse = false, still = true, client = chrome } = {}) {
  const [w, h, dpr] = await client.eval('[innerWidth, innerHeight, devicePixelRatio]');
  if (h > w) return; // portrait = the rotate-to-landscape register (#ob-rotate over everything; protocol R10) — not a posed frame
  const res = await client.eval(kitLawsWalkerJs({ w, h, coarse, ladder: KIT_LADDER }));
  for (const id of Object.keys(res)) kitRow(report, page, id, locale, res[id]);
  if (still) { // A2: the rendered ground, sampled from the still
    try {
      // GH-877: ONE STATE for ink + ground — a2Sample settles, reads, shoots, re-reads (clip.scale 1/dpr → a CSS-px still)
      const s = await a2Sample(client, { w, h, coarse, dpr });
      if (!s.settled) kitRow(report, page, 'A2', locale, [s.unsettled], ` (instrument: attempts ${s.attemptsUsed}, settle polls ${s.settlePollsUsed})`);
      else kitRow(report, page, 'A2', locale, judgeTextGround(s.runs, s.img, { cssW: w }), ` (${s.runs.length} runs)`);
    } catch (e) { kitRow(report, page, 'A2', locale, ['still unreadable: ' + (e.message ?? e)]); }
  }
  // A11: drain the reveal probe for this frame; a page hop (the replays
  // seeding navigation, the phone reboots) drops it — re-arm so every later
  // frame on that document is observed (the hop's own arrival is unjudged)
  const reveals = await client.eval(a11DrainJs()).catch(() => null);
  if (Array.isArray(reveals)) kitRow(report, page, 'A11', locale, judgeReveals(reveals), ` (${reveals.length} reveals)`);
  else await client.eval(a11InstallJs()).catch(() => null);
}
// A9 runtime: real Tabs through the frame (Input.dispatchKeyEvent — the only
// honest :focus-visible), bounded; a stop whose register equals its rest
// snapshot is an invisible ring, <body> before the last stop = focus dropped
async function auditKitFocus(report, page, { max = 40 } = {}) {
  const snap = await chrome.eval(a9RestSnapshotJs());
  const bad = []; const judged = new Set(); let lastIdx = -1;
  // the sequential-focus starting point may sit mid-list: walk until every
  // stop was judged once (the cycle wraps through <body> after the LAST stop
  // — lawful; <body> after any other stop = focus dropped / a dead stop)
  for (let i = 0; i < Math.min(snap.stops + 2, max) && judged.size < snap.stops; i++) {
    await pressKey('Tab', 'Tab', 9);
    await sleep(40);
    const f = await chrome.eval(a9FocusReadJs());
    if (f.body) { if (lastIdx >= 0 && lastIdx < snap.stops - 1) { bad.push(`focus dropped to <body> after ${snap.names[lastIdx] ?? lastIdx} (stop ${lastIdx + 1} of ${snap.stops})`); break; } continue; }
    if (!f.inRoot || f.idx < 0) continue;
    lastIdx = f.idx; judged.add(f.idx);
    if (!f.fv) bad.push(`${f.name} focused without :focus-visible`);
    else if (f.changed === false) bad.push(`${f.name} focused register identical to rest (ring swallowed)`);
  }
  await chrome.eval('document.activeElement && document.activeElement !== document.body && document.activeElement.blur(); true');
  kitRow(report, page, 'A9', 'en', [...new Set(bad)], ` (${snap.stops} stops)`);
}
// A10 runtime: CSS.forcePseudoState :hover / :active per kit class-set
async function auditKitStates(report, page) {
  await chrome.send('DOM.enable'); await chrome.send('CSS.enable');
  const rows = await chrome.eval(a10TagJs()); const bad = [];
  const doc = await chrome.send('DOM.getDocument', { depth: 0 });
  for (const r of rows) {
    const { nodeId } = await chrome.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: `[data-ob-a10="${r.i}"]` });
    if (!nodeId) continue;
    const rest = await chrome.eval(a10ReadJs(r.i));
    for (const ps of ['hover', 'active']) {
      await chrome.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [ps] }); await sleep(20);
      if ((await chrome.eval(a10ReadJs(r.i))) === rest) bad.push(`${r.name} (${r.sig}) :${ps} register identical to rest`);
    }
    await chrome.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
  }
  await chrome.eval(a10UntagJs());
  kitRow(report, page, 'A10', 'en', bad, ` (${rows.length} class-sets)`);
}

async function runAudit() {
  const report = [];
  // GH-668 S5 statics (node side, comment-stripped sources): A9 composition
  // companions, A10 hover guards, A11 motion ladder, A12 type hygiene —
  // literals only under their FROZEN ledgers (liveness = a dead row is red)
  {
    const fc = scanFocusCompanions(webDir);
    report.push({ ok: !fc.red.length && !fc.dead.length, page: 'static', what: 'A9 static: selected-state rules that set box-shadow / outline carry a :focus-visible companion'
      + (fc.red.length ? ' — ' + fc.red.join('; ') : '') + (fc.dead.length ? ' — dead FOCUS_OK rows: ' + fc.dead.join('; ') : ''), rule: KIT_LAWS.A9 });
    const hv = scanUnguardedHover(webDir);
    report.push({ ok: !hv.red.length && !hv.dead.length, page: 'static', what: 'A10 static: every :hover rule rides a hover / fine-pointer guard (HOVER_OK ledger live)'
      + (hv.red.length ? ' — unguarded: ' + hv.red.join('; ') : '') + (hv.dead.length ? ' — dead HOVER_OK rows: ' + hv.dead.join('; ') : ''), rule: KIT_LAWS.A10 });
    const mo = scanMotionDurations(webDir);
    report.push({ ok: mo.rows.length > 0 && !mo.red.length && !mo.dead.length && !mo.kitRows.length, page: 'static', what: 'A11 static: transition / animation durations reference var(--ob-t-*) (MOTION_OK ledger live, kit sheets literal-free)'
      + (mo.red.length ? ' — ' + JSON.stringify(mo.red).slice(0, 400) : '') + (mo.dead.length ? ' — dead rows: ' + mo.dead.join(', ') : '') + (mo.kitRows.length ? ' — kit literals: ' + JSON.stringify(mo.kitRows).slice(0, 200) : ''), rule: KIT_LAWS.A11 });
    const hy = await scanTypeHygiene(webDir);
    report.push({ ok: !hy.red.length && !hy.dead.length, page: 'static', what: `A12 static: token-grep hygiene (line-height / z-index / scrollbar / uppercase / tracking literals under HYG_OK; ${hy.ledgered} ledgered)`
      + (hy.red.length ? ' — ' + hy.red.slice(0, 8).map((r) => `${r.path}:${r.line} ${r.norm}`).join('; ') : '') + (hy.dead.length ? ' — dead rows: ' + hy.dead.join(', ') : ''), rule: KIT_LAWS.A12 });
  }
  // GH-668 fix round 4 (visual audit r1 P2, B-K11): the DESKTOP HUD frame
  // is a posed frame too — the fine-register Fire / Replay / Re-rack pills
  // (36 px before the kit's control rung) were never A7-judged: the HUD was
  // walked on the coarse register only, where those siblings are hidden.
  await auditKitLaws(report, 'main desktop (HUD)', { locale: 'en' });
  // label-truncation gate across the widest locales BEFORE opening panels
  for (const locale of ['en', 'de', 'fr', 'es']) {
    await assertNoTruncation(report, locale);
  }
  // rejection-hint banner (#hud-hint, flow.js → hud.setHint): compose the
  // REAL i18n hint text per locale (flow.shotRejected wrapping
  // flow.callRequired — the longest expected-rejection copy) and gate the
  // surface's geometry: it wraps inside its max-width, never clips, never
  // breaches the viewport. Driven through the __rules.hint test seam.
  for (const locale of GAME_LOCALES) {
    await chrome.eval(`window.__settings.set('language', '${locale}')`);
    await sleep(600);
    const geo = await chrome.eval(`(() => {
      const msg = window.__i18n.t('flow.shotRejected',
        { error: window.__i18n.t('flow.callRequired') });
      window.__rules.hint(msg);
      const el = document.getElementById('hud-hint');
      const r = el.getBoundingClientRect();
      const out = {
        clipX: el.scrollWidth > el.clientWidth + 1,
        clipY: el.scrollHeight > el.clientHeight + 1,
        offscreen: r.left < 0 || r.right > window.innerWidth,
        shown: getComputedStyle(el).display !== 'none',
      };
      window.__rules.hint(null);
      return out;
    })()`);
    report.push({
      ok: geo.shown && !geo.clipX && !geo.clipY && !geo.offscreen,
      page: 'main',
      what: `rejection hint banner fits without clipping [${locale}]`
        + (geo.shown ? '' : ' — never shown')
        + (geo.clipX ? ' — clips horizontally' : '')
        + (geo.clipY ? ' — clips vertically' : '')
        + (geo.offscreen ? ' — breaches the viewport' : ''),
      rule: 'hint text wraps inside the banner surface, never truncates (e2e-ui --audit law)',
    });
  }
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(400);
  // build-4 QA (play lane): desktop foul banner × HUD panel clearance.
  // The banner had no desktop width cap, so long REAL judgment copy (the
  // de two-foul wrong-first-ball + no-rail string — reproduced with zero
  // forcing on a replay boot) painted its z:6 glass 64.1x62.8px over the
  // z:5 panel rows at 1280x800; the shipped desktop pair set (toolbar ×
  // replay bar) never swept #banner × #hud, and en single-foul copy (the
  // only copy composed pre-build-4) happens to clear by 1.3px. Compose the
  // longest real foul copy per locale (BAND_FORCE_JS convention:
  // presentation layer only, live i18n strings, window.__test.errors
  // untouched) and assert the rects stay disjoint at both shipped desktop
  // registers — the app.html max-width cap wraps the copy instead.
  for (const [bw, bh] of [[1280, 800], [1680, 1050]]) {
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width: bw, height: bh, deviceScaleFactor: 0, mobile: false });
    await sleep(300);
    for (const locale of GAME_LOCALES) {
      await chrome.eval(`window.__settings.set('language', '${locale}')`);
      await sleep(500);
      const geo = await chrome.eval(`(() => {
        const t = window.__i18n.t;
        const b = document.getElementById('banner');
        const hud = document.getElementById('hud');
        if (!b || !hud) return { skip: true };
        b.textContent = t('flow.foulBanner', { reason:
          t('foul.wrong-first-ball') + ', ' + t('foul.no-rail-after-contact') });
        b.classList.add('foul');
        b.style.display = 'block';
        const br = b.getBoundingClientRect(), hr = hud.getBoundingClientRect();
        const ow = Math.min(br.right, hr.right) - Math.max(br.left, hr.left);
        const oh = Math.min(br.bottom, hr.bottom) - Math.max(br.top, hr.top);
        const out = {
          overlap: (ow > 0 && oh > 0)
            ? ow.toFixed(1) + 'x' + oh.toFixed(1) + 'px' : null,
          clipX: b.scrollWidth > b.clientWidth + 1,
          offscreen: br.left < 0 || br.right > innerWidth,
        };
        b.style.display = 'none'; b.textContent = '';
        b.classList.remove('foul');
        return out;
      })()`);
      report.push({
        ok: !geo.skip && !geo.overlap && !geo.clipX && !geo.offscreen,
        page: 'main',
        what: `foul banner clear of the HUD panel @${bw}x${bh} [${locale}]`
          + (geo.skip ? ' — surfaces missing' : '')
          + (geo.overlap ? ` — banner × #hud ${geo.overlap}` : '')
          + (geo.clipX ? ' — copy clips instead of wrapping' : '')
          + (geo.offscreen ? ' — breaches the viewport' : ''),
        rule: 'banner rect ∩ HUD panel rect must be empty at desktop widths '
          + '(app.html #banner cap; decoupled-surfaces law, taste r3)',
      });
    }
  }
  await chrome.send('Emulation.clearDeviceMetricsOverride');
  await sleep(300);
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(400);
  // feature 011: game selector + catalog browse (own open/close cycle)
  await auditGameCatalog(report);
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(400);
  // GH-443: the rules-variant closed-label law (own open/close cycle) —
  // every game x preset option x 7 locales through the value-setter contract
  await auditVariantClosedLabels(report);
  await chrome.eval(`window.__settings.set('language', 'en')`);
  await sleep(400);
  // GH-667 / B-K03: the carom second-ball fork frame (own hop browser)
  await auditCaromFork(report);
  // issue #36 findings 2+4: real-pointer popover reachability (own cycle)
  await auditSelectPopovers(report);
  // kit confirm dialog: geometry + register laws across all 7 locales
  await auditConfirmDialog(report);
  // build 20: the game-switch progress overlay, every phase × 7 locales
  await auditSwitchOverlay(report);
  // issue #36 owner report: mid-width modal card sweep + stylesheet ?v= law
  // (own open/close cycle; runs on the main page before any navigation)
  await auditModalMidWidths(report);
  // feature 024 (T017): open-overlay + #ob-help pill sweep x7 locales at the
  // standing widths incl. the 1024x640 floor + the help.css ?v= probe
  await auditHelpOverlay(report);
  // 2026-07 button audit: the rolled-own ratchet on the two big OVERLAY
  // surfaces. Every other ratchet call site rides an arm that exists for
  // another reason (settings+export, replay, save card, phone), which left
  // help.css's disclosure rows and the drills panel's 33 cards judged by
  // nobody — and those are exactly the surfaces where a new hand-rolled
  // button gets added. Own open/close cycle, no game state touched.
  // BOTH walkers run here, not just the ratchet: auditHelpOverlay closes the
  // overlay before any AUDIT_WALKER call and the drills panel is never open
  // during one, so the centring dimension had no reach over either surface's
  // close / disclosure / card faces.
  for (const [page, open, close] of [
    ['help', `window.__help.open('api')`, 'window.__help.close()'],
    ['drills', 'window.__drills?.open?.() ?? null', 'window.__drills?.close?.()'],
  ]) {
    await chrome.eval(open);
    await sleep(450);
    for (const rows of [await chrome.eval(AUDIT_WALKER), await kitButtonRows()]) {
      for (const r of rows) {
        if (!report.some((p) => p.page === page && p.what === r.what)) {
          report.push({ ...r, page });
        }
      }
    }
    await chrome.eval(close);
    await sleep(300);
  }
  // main page: settings + export open simultaneously (e2e-i18n convention).
  // Feature 015: the settings modal shows one registry pane at a time, so
  // the control audit activates each section via __settings.show(...) and
  // merges the deduped walks (contract §6 sanctioned walker extension).
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await chrome.eval('window.__export.open()');
  await sleep(400);
  for (const sec of SECTION_IDS) {
    await chrome.eval(`window.__settings.show('${sec}')`);
    await sleep(120);
    // GH-668 fix round 4 (B-K11): every desktop settings pane is a posed
    // frame for the kit laws — the 38 px nav rows lived here unjudged. The
    // frame is the MODAL (window.__auditRoot = #ob-settings): the export
    // modal is open beside it here (the e2e-i18n convention), and its
    // backdrop over the toolbar is this pose's artefact, not a law.
    await chrome.eval(`window.__auditRoot = document.getElementById('ob-settings') || null; true`);
    await auditKitLaws(report, 'settings ' + sec + ' (desktop)', { locale: 'en' });
    await chrome.eval('window.__auditRoot = null; true');
    for (const r of await chrome.eval(AUDIT_WALKER)) {
      if (!report.some((p) => p.page === 'main' && p.what === r.what)) {
        report.push({ ...r, page: 'main' });
      }
    }
    for (const r of await kitButtonRows()) {
      if (!report.some((p) => p.page === 'main' && p.what === r.what)) {
        report.push({ ...r, page: 'main' });
      }
    }
  }
  // build-4 QA: fine-pointer target floors (settings + export still open)
  await auditFinePointerFloors(report);
  await chrome.eval(`window.__settings.show('assists')`); // 034: never show('game') mid-audit

  // replay bar: reachable via scripted shot -> __share.encode() -> #r= boot
  try {
    const err = await chrome.eval(
      '__test.shoot({ v0: 1.5, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
    if (err) throw new Error('scripted shot rejected: ' + err);
    let st = 'PLAYBACK';
    for (let i = 0; i < 150 && st === 'PLAYBACK'; i++) {
      await sleep(400); st = await chrome.eval('__test.state()');
    }
    if (st === 'PLAYBACK') throw new Error('scripted shot never settled');
    const url = await chrome.eval('__share.encode()');
    if (typeof url !== 'string' || !url.includes('#')) {
      throw new Error('__share.encode() returned no replay URL');
    }
    // main-page app-error gate BEFORE navigating away (navigation wipes __test)
    const errs = await chrome.eval('window.__test.errors');
    if (errs.length) fail('app errors (main page): ' + errs.join(' | '));
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?obtool=1${url.slice(url.indexOf('#'))}` });
    await waitReady();
    let bar = false;
    for (let i = 0; i < 100 && !bar; i++) {
      await sleep(200);
      bar = await chrome.eval(`!!document.getElementById('ob-rp-exit')`);
    }
    if (!bar) throw new Error('replay bar (#ob-rp-exit) never appeared');
    for (const r of await chrome.eval(AUDIT_WALKER)) {
      // the replay page re-audits the HUD; only NEW controls are the bar's
      if (!report.some((p) => p.what === r.what)) report.push({ ...r, page: 'replay' });
    }
    for (const r of await kitButtonRows()) {
      if (!report.some((p) => p.what === r.what)) report.push({ ...r, page: 'replay' });
    }

    // GEOMETRY: toolbar rect ∩ replay-bar rect == empty (the design charter toolbar
    // law "collisions impossible in any locale"). The 2026-07 dual audit
    // measured a 54px overlap in the FINISHED state (widest bar: label +
    // Continue + Exit) at 1280/en, worse at ~1100 — so the check runs in
    // the finished state at both widths.
    let done = false;
    for (let i = 0; i < 150 && !done; i++) {
      await sleep(400);
      done = await chrome.eval('__share.replay().done === true');
    }
    if (!done) throw new Error('replay never reached the finished state');
    await sleep(500); // let the Continue button enter-motion settle
    const COLLIDE = `(() => {
      const tb = document.getElementById('ob-toolbar');
      const bar = document.getElementById('ob-replay');
      if (!tb || !bar || !tb.children.length) return 'skip';
      const a = tb.getBoundingClientRect(), b = bar.getBoundingClientRect();
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return (w <= 0 || h <= 0) ? 'ok'
        : 'overlap ' + (w * h).toFixed(1) + 'px² (toolbar '
          + JSON.stringify(a.toJSON()) + ' vs bar ' + JSON.stringify(b.toJSON()) + ')';
    })()`;
    for (const width of [1280, 1100]) {
      await chrome.send('Emulation.setDeviceMetricsOverride',
        { width, height: 800, deviceScaleFactor: 0, mobile: false });
      await sleep(400); // placeBar() reacts via resize/ResizeObserver
      const geo = await chrome.eval(COLLIDE);
      report.push({ ok: geo === 'ok', page: 'replay',
        what: `replay bar clear of toolbar, finished state @${width}px`
          + (geo === 'ok' ? '' : ' — ' + geo),
        rule: 'toolbar rect ∩ replay-bar rect must be empty (the design charter toolbar law)' });
    }
    await chrome.send('Emulation.clearDeviceMetricsOverride');
  } catch (e) {
    fail('replay bar unreachable — replay surface not audited: ' + (e.message ?? e));
  }

  // GH-225: the Playback save card + session list (own page hop — the card
  // needs an archive-armed boot and a scripted shot to exist at all)
  try {
    await auditPlaybackCard(report);
    // GH-301: the director strip rides the same archive-armed navigation
    await auditDirectorStrip(report);
  } catch (e) {
    fail('playback save card unreachable — surface not audited: ' + (e.message ?? e));
  } finally {
    // `?archive=1` is PERSISTED by archive.js in sessionStorage
    // (`ob-archive-optin`), so it arms every later same-tab navigation too —
    // the snooker hop below would then create a real archive and write
    // IndexedDB on a scripted boot, breaking the issue-#14 hermetic-boot law
    // (review round 1 P2). Drop the opt-in here, on every exit path.
    await chrome.eval(`(() => { try {
      sessionStorage.removeItem('ob-archive-optin');
    } catch { /* storage unavailable */ } return true; })()`).catch(() => {});
  }

  // feature 012 (T052): smallest-viewport snooker-frame legibility (own
  // page hop — it re-racks through the render-evidence seam)
  try {
    await auditSnookerViewport(report);
  } catch (e) {
    fail('snooker smallest-viewport check unreachable: ' + (e.message ?? e));
  }

  // GH-316: the SCORE-GROWTH arm, desktop device class (own page hop — it
  // stages every discipline through the __rules seams; the phone device
  // class runs inside runPhoneAudit on the coarse-booted page)
  try {
    await chrome.send('Page.navigate', { url: `${APP_URL}&arm=score-growth` });
    await waitReady();
    await sleep(1000);
    await auditScoreGrowth(report, 'desktop');
  } catch (e) {
    fail('score-growth arm unreachable (desktop): ' + (e.message ?? e));
  }

  // GH-465: decision prompts carry the kit dialog contract — focus-on-open,
  // Tab trap, Escape refusal with hint, focus restore (own page hop: it
  // switches to eight_ball and composes a real dry-break settle)
  try {
    await auditDecisionFocus(report);
  } catch (e) {
    fail('decision-focus arm unreachable: ' + (e.message ?? e));
  }

  // 031: shell chrome ×7 locales (own page hop onto obshell=1)
  try {
    await auditShellChrome(report);
  } catch (e) {
    fail('shell chrome unreachable — shell surface not audited: '
      + (e.message ?? e));
  }

  const bad = report.filter((r) => !r.ok);
  for (const r of report) {
    if (r.ok) console.log(`  OK   [${r.page}] ${r.what}`);
    else console.error(`  FAIL [${r.page}] ${r.what} — ${r.rule}`);
  }
  console.log(`[e2e-ui audit] ${report.length} visible controls, ${bad.length} native-styled`);
  if (bad.length) fail(`${bad.length} visible native-styled control(s) — see FAIL lines above`);

  // feature 014 (T013): phone-viewport walker — MUST stay the last section
  // so everything above (the desktop-viewport report) is byte-stable for
  // the SC-002 compare (touch-e2e.md §4.2 slices at PHONE_MARKER)
  try {
    await runPhoneAudit(); // prints PHONE_MARKER as its first line
  } catch (e) {
    fail('phone audit walker unreachable: ' + (e.message ?? e));
  }
}

// ---- behavior mode ----------------------------------------------------------
async function runBehavior() {
  // A. fixture select + kit imports + window keydown spy (aim.js lives on
  // window: the spy proves handled combobox keys NEVER reach it)
  const setup = await chrome.eval(`(async () => {
    const { upgradeSelect } = await import('./app/ui/select.js');
    const dialog = await import('./app/ui/dialog.js');
    const controls = await import('./app/ui/controls.js');
    const fix = document.createElement('div');
    fix.id = 'obui-fix';
    fix.style.cssText = 'position:fixed;top:16px;left:340px;z-index:80;';
    fix.innerHTML = '<select id="obui-sel">'
      + '<option value="a">Alpha</option><option value="b">Bravo</option>'
      + '<option value="c">Charlie</option><option value="d">Delta</option>'
      + '<option value="v">Victor</option></select>';
    document.body.appendChild(fix);
    const sel = fix.querySelector('select');
    const widget = upgradeSelect(sel);
    const spy = { arrows: 0, chars: 0, others: 0 };
    window.addEventListener('keydown', (e) => {
      if (!window.__uiSpyOn) return;
      if (e.key.startsWith('Arrow')) spy.arrows++;
      else if (e.key.length === 1) spy.chars++;
      else spy.others++;
    });
    let changes = 0;
    sel.addEventListener('change', () => changes++);
    window.__uiGone = (s, ms) => new Promise((res) => {
      const t0 = performance.now();
      (function poll() {
        if (!document.querySelector(s)) return res(true);
        if (performance.now() - t0 > (ms || 1500)) return res(false);
        setTimeout(poll, 30);
      })();
    });
    window.__ui = { dialog, controls, upgradeSelect, fix, sel, widget, spy,
      btn: sel.nextElementSibling,
      changes: () => changes,
      key: (t, key, init) => t.dispatchEvent(new KeyboardEvent('keydown',
        Object.assign({ key, bubbles: true, cancelable: true }, init || {}))) };
    return { hidden: sel.hidden,
      btnOb: window.__ui.btn && window.__ui.btn.dataset.ob,
      role: window.__ui.btn && window.__ui.btn.getAttribute('role'),
      label: window.__ui.btn.querySelector('.ob-select__label').textContent };
  })()`);
  check('select: upgrade hides native + builds combobox sibling',
    setup.hidden === true && setup.btnOb === 'select-button'
    && setup.role === 'combobox' && setup.label === 'Alpha',
    JSON.stringify(setup));

  // B. keyboard parity + type-ahead + stopPropagation proof
  const kb = await chrome.eval(`(async () => {
    const U = window.__ui, q = (s) => document.querySelector(s);
    const activeText = () => {
      const a = q('[data-ob="select-list"] [data-active]');
      return a ? a.textContent : null;
    };
    const out = {};
    window.__uiSpyOn = true;
    U.btn.focus();
    U.key(U.btn, 'ArrowDown');                    // closed -> opens
    out.openAfterArrowDown = !!q('[data-ob="select-list"]');
    out.expandedOpen = U.btn.getAttribute('aria-expanded');
    out.activeAtOpen = activeText();              // Alpha (selectedIndex)
    U.key(U.btn, 'ArrowDown');
    out.activeAfterDown = activeText();           // Bravo
    U.key(U.btn, 'End');
    out.activeAfterEnd = activeText();            // Victor
    U.key(U.btn, 'Home');
    out.activeAfterHome = activeText();           // Alpha
    U.key(U.btn, 'c');                            // open-state type-ahead
    out.activeAfterTypeahead = activeText();      // Charlie
    const ch0 = U.changes();
    U.key(U.btn, 'Enter');                        // commit Charlie
    out.valueAfterEnter = U.sel.value;
    out.changesOnEnter = U.changes() - ch0;
    out.closedAfterEnter = await window.__uiGone('[data-ob="select-list"]');
    out.labelAfterEnter = U.btn.querySelector('.ob-select__label').textContent;
    U.key(U.btn, 'ArrowUp');                      // closed -> opens too
    out.reopenActive = activeText();              // Charlie again
    U.key(U.btn, 'Escape');
    out.closedAfterEscape = await window.__uiGone('[data-ob="select-list"]');
    out.expandedClosed = U.btn.getAttribute('aria-expanded');
    out.focusKeptOnBtn = document.activeElement === U.btn;
    const ch1 = U.changes();
    // let the 500ms type-ahead buffer from the earlier 'c' expire first
    await new Promise((r) => setTimeout(r, 550));
    U.key(U.btn, 'v');                            // closed type-ahead commits
    out.valueAfterClosedTypeahead = U.sel.value;  // Victor ('v' is an aim hotkey)
    out.changesOnClosedTypeahead = U.changes() - ch1;
    out.spyArrows = U.spy.arrows;                 // handled keys: 0 leaks
    out.spyChars = U.spy.chars;
    const before = U.spy.others;
    U.key(U.btn, 'PageDown');                     // UNhandled: must propagate
    out.spySanity = U.spy.others - before;        // proves the spy wiring
    window.__uiSpyOn = false;
    return out;
  })()`);
  check('select: ArrowDown opens at selected option',
    kb.openAfterArrowDown && kb.expandedOpen === 'true' && kb.activeAtOpen === 'Alpha',
    JSON.stringify(kb));
  check('select: ArrowDown/Up walk options', kb.activeAfterDown === 'Bravo');
  check('select: Home/End jump', kb.activeAfterEnd === 'Victor' && kb.activeAfterHome === 'Alpha');
  check('select: open-state type-ahead moves active option', kb.activeAfterTypeahead === 'Charlie');
  check('select: Enter commits + change fires + popover closes',
    kb.valueAfterEnter === 'c' && kb.changesOnEnter === 1 && kb.closedAfterEnter
    && kb.labelAfterEnter === 'Charlie');
  check('select: ArrowUp reopens at committed option', kb.reopenActive === 'Charlie');
  check('select: Escape closes, focus stays on combobox',
    kb.closedAfterEscape && kb.expandedClosed === 'false' && kb.focusKeptOnBtn);
  check('select: closed-state type-ahead commits with change',
    kb.valueAfterClosedTypeahead === 'v' && kb.changesOnClosedTypeahead === 1);
  check('select: handled keys stopPropagation (aim.js never sees them)',
    kb.spyArrows === 0 && kb.spyChars === 0, `arrows=${kb.spyArrows} chars=${kb.spyChars}`);
  check('select: unhandled key DOES propagate (spy wiring sane)', kb.spySanity === 1);

  // C. e2e value-setter contract: sel.value= + dispatch change -> widget label
  const vs = await chrome.eval(`(() => {
    const U = window.__ui;
    U.sel.value = 'd';
    U.sel.dispatchEvent(new Event('change'));
    return { value: U.sel.value,
      label: U.btn.querySelector('.ob-select__label').textContent };
  })()`);
  check('select: e2e value-setter path syncs widget label',
    vs.value === 'd' && vs.label === 'Delta', JSON.stringify(vs));

  // D. viewport-edge flip: combobox near the bottom -> popover opens ABOVE
  const flip = await chrome.eval(`(async () => {
    const U = window.__ui, q = (s) => document.querySelector(s);
    U.fix.style.top = 'auto'; U.fix.style.bottom = '4px';
    U.btn.focus();
    U.key(U.btn, 'ArrowDown');
    const list = q('[data-ob="select-list"]');
    // wait out the entrance tween (fromTo y:8 offsets the rect; clearProps
    // drops the transform on complete) before measuring geometry
    const t0 = performance.now();
    while (list && getComputedStyle(list).transform !== 'none'
        && performance.now() - t0 < 1500) {
      await new Promise((r) => setTimeout(r, 30));
    }
    const lr = list ? list.getBoundingClientRect() : null;
    const br = U.btn.getBoundingClientRect();
    U.key(U.btn, 'Escape');
    await window.__uiGone('[data-ob="select-list"]');
    U.fix.style.bottom = 'auto'; U.fix.style.top = '16px';
    return { opened: !!lr, flipped: !!lr && lr.bottom <= br.top + 1,
      listBottom: lr && lr.bottom, btnTop: br.top, vh: innerHeight };
  })()`);
  check('select: popover flips above at the viewport bottom edge',
    flip.opened && flip.flipped, JSON.stringify(flip));

  // E. dialog: focus trap + Escape + LAYERED Escape (popover first, panel second)
  const dlg = await chrome.eval(`(async () => {
    const U = window.__ui, q = (s) => document.querySelector(s);
    const out = {};
    const panel = document.createElement('div');
    panel.id = 'obui-panel';
    panel.style.cssText = 'position:fixed;left:40%;top:30%;z-index:50;display:none;'
      + 'padding:12px;background:var(--ob-glass, rgba(20,22,26,.9));';
    panel.innerHTML = '<button id="obui-p1">One</button><button id="obui-p2">Two</button>'
      + '<select id="obui-sel2"><option value="x">Xray</option>'
      + '<option value="y">Yankee</option></select>';
    document.body.appendChild(panel);
    U.upgradeSelect(panel.querySelector('#obui-sel2'));
    const btn2 = panel.querySelector('[data-ob="select-button"]');
    let closes = 0;
    U.dialog.openPanel(panel, { backdrop: true, onClose: () => closes++ });
    out.visibleAfterOpen = getComputedStyle(panel).display !== 'none';
    out.backdropAfterOpen = !!q('.ob-backdrop');
    out.autofocus = !!document.activeElement && document.activeElement.id === 'obui-p1';
    btn2.focus();                                  // last focusable in the panel
    U.key(document.activeElement, 'Tab');
    out.tabWraps = !!document.activeElement && document.activeElement.id === 'obui-p1';
    U.key(document.activeElement, 'Tab', { shiftKey: true });
    out.shiftTabWraps = document.activeElement === btn2;
    btn2.focus();
    U.key(btn2, 'ArrowDown');                      // popover INSIDE open panel
    out.popoverOpen = !!q('[data-ob="select-list"]');
    U.key(btn2, 'Escape');                         // 1st Esc: popover ONLY
    out.popoverClosed = await window.__uiGone('[data-ob="select-list"]');
    out.panelSurvives = getComputedStyle(panel).display !== 'none' && closes === 0;
    out.backdropSurvives = !!q('.ob-backdrop');
    U.key(document.activeElement || btn2, 'Escape'); // 2nd Esc: panel
    const t0 = performance.now();
    while (getComputedStyle(panel).display !== 'none' && performance.now() - t0 < 2000) {
      await new Promise((r) => setTimeout(r, 30));
    }
    out.panelClosed = getComputedStyle(panel).display === 'none';
    out.onCloseFired = closes === 1;
    out.backdropGone = await window.__uiGone('.ob-backdrop');
    window.__uiPanel = panel;
    return out;
  })()`);
  check('dialog: openPanel shows panel + backdrop + autofocus',
    dlg.visibleAfterOpen && dlg.backdropAfterOpen && dlg.autofocus, JSON.stringify(dlg));
  check('dialog: Tab trap wraps both directions', dlg.tabWraps && dlg.shiftTabWraps);
  check('dialog: layered Escape closes ONLY the popover first',
    dlg.popoverOpen && dlg.popoverClosed && dlg.panelSurvives && dlg.backdropSurvives);
  check('dialog: second Escape closes the panel + backdrop + onClose',
    dlg.panelClosed && dlg.onCloseFired && dlg.backdropGone);

  // E2. PRESENTATION ANCHOR = the START BOUNDARY of the trap (GH-668 B-K06,
  // review r1 P2). openPanel lands focus on a [data-ob-present-focus]
  // tabindex="-1" anchor (the DVR head); focusables() excludes it, so a
  // Shift+Tab from the anchor used to fall through to native reverse
  // traversal and walk OUT of the modal onto the toolbar behind. Law: from
  // the anchor Shift+Tab wraps to the LAST member, Tab goes to the FIRST;
  // Shift+Tab from the first member still wraps to the last. Red on the
  // pre-fix bytes: the synthetic Shift+Tab is not prevented and focus stays
  // on the anchor (never reaches the last member).
  const anc = await chrome.eval(`(async () => {
    const U = window.__ui, out = {};
    const panel = document.createElement('div');
    panel.id = 'obui-panel-anchor';
    panel.style.cssText = 'position:fixed;left:40%;top:20%;z-index:50;display:none;'
      + 'padding:12px;background:var(--ob-glass, rgba(20,22,26,.9));';
    panel.innerHTML = '<h2 id="obui-anc" data-ob-present-focus>Replays</h2>'
      + '<button id="obui-a1">One</button><button id="obui-a2">Two</button>';
    document.body.appendChild(panel);
    const a1 = panel.querySelector('#obui-a1'), a2 = panel.querySelector('#obui-a2'), h = panel.querySelector('#obui-anc');
    U.dialog.openPanel(panel, { backdrop: true });
    out.anchorFocused = document.activeElement === h && h.tabIndex === -1;
    U.key(document.activeElement, 'Tab', { shiftKey: true });
    out.shiftTabFromAnchor = document.activeElement === a2;
    h.focus();
    U.key(document.activeElement, 'Tab');
    out.tabFromAnchor = document.activeElement === a1;
    U.key(document.activeElement, 'Tab', { shiftKey: true });
    out.shiftTabFromFirst = document.activeElement === a2;
    U.dialog.closePanel(panel);
    await window.__uiGone('.ob-backdrop');
    panel.remove();
    return out;
  })()`);
  check('dialog: the presentation anchor is the start boundary — Shift+Tab from it wraps to the last member, Tab to the first',
    anc.anchorFocused && anc.shiftTabFromAnchor && anc.tabFromAnchor && anc.shiftTabFromFirst, JSON.stringify(anc));

  // F. rapid open/close x20: no stranded .ob-backdrop / .ob-select__list
  const rapid = await chrome.eval(`(async () => {
    const U = window.__ui, panel = window.__uiPanel;
    for (let i = 0; i < 20; i++) {
      U.dialog.openPanel(panel, { backdrop: true });
      U.dialog.closePanel(panel);
    }
    for (let i = 0; i < 20; i++) U.btn.click();   // popover toggle, ends closed
    const t0 = performance.now();
    while (performance.now() - t0 < 2500
        && (document.querySelector('.ob-backdrop') || document.querySelector('.ob-select__list'))) {
      await new Promise((r) => setTimeout(r, 50));
    }
    return { backdrops: document.querySelectorAll('.ob-backdrop').length,
      lists: document.querySelectorAll('.ob-select__list').length,
      panelHidden: getComputedStyle(panel).display === 'none',
      expanded: U.btn.getAttribute('aria-expanded') };
  })()`);
  check('rapid x20: zero stranded backdrops/popovers, panel at rest hidden',
    rapid.backdrops === 0 && rapid.lists === 0 && rapid.panelHidden
    && rapid.expanded === 'false', JSON.stringify(rapid));

  // F2. confirm dialog (dialog.js confirmDialog): Promise<boolean> semantics,
  // SAFE initial focus (cancel), Enter=focused button / Escape=cancel /
  // backdrop=cancel, aria-modal alertdialog wiring, focus restore, danger
  // register, and zero DOM residue after every resolution path.
  const cfm = await chrome.eval(`(async () => {
    const U = window.__ui, q = (s) => document.querySelector(s);
    const out = {};
    const opts = { title: 'Switch game',
      body: 'Switching games re-racks the table. Continue?',
      confirmLabel: 'Continue', cancelLabel: 'Cancel' };
    const anchor = document.createElement('button');
    anchor.id = 'obui-cfm-anchor';
    anchor.textContent = 'anchor';
    document.body.appendChild(anchor);
    anchor.focus();

    // path 1: Enter activates the FOCUSED button (WAI-ARIA button idiom;
    // 015 fix round — a focus ring on Cancel must never fire the
    // destructive default): on the safe-focused cancel it resolves false…
    let p = U.dialog.confirmDialog(opts);
    let panel = q('[data-ob="confirm"]');
    out.role = panel && panel.getAttribute('role');
    out.modal = panel && panel.getAttribute('aria-modal');
    out.labelled = panel && document.getElementById(
      panel.getAttribute('aria-labelledby'))?.textContent === opts.title;
    out.described = panel && document.getElementById(
      panel.getAttribute('aria-describedby'))?.textContent === opts.body;
    out.backdrop = !!q('.ob-backdrop--top');
    out.safeFocus = document.activeElement
      === panel.querySelector('[data-ob="confirm-cancel"]');
    U.key(document.activeElement, 'Enter');
    out.enterOnCancelResolves = await p;
    await window.__uiGone('[data-ob="confirm"]');
    // …and on the accept button it resolves true (the fast path)
    p = U.dialog.confirmDialog(opts);
    panel = q('[data-ob="confirm"]');
    panel.querySelector('[data-ob="confirm-accept"]').focus();
    U.key(document.activeElement, 'Enter');
    out.enterOnAcceptResolves = await p;
    out.goneAfterEnter = await window.__uiGone('[data-ob="confirm"]');
    out.focusRestored1 = document.activeElement === anchor;

    // path 2: Escape = cancel
    p = U.dialog.confirmDialog(opts);
    panel = q('[data-ob="confirm"]');
    U.key(panel.querySelector('[data-ob="confirm-cancel"]'), 'Escape');
    out.escapeResolves = await p;
    out.goneAfterEscape = await window.__uiGone('[data-ob="confirm"]');

    // path 3: backdrop click = cancel
    p = U.dialog.confirmDialog(opts);
    q('.ob-backdrop--top').click();
    out.backdropResolves = await p;
    out.goneAfterBackdrop = await window.__uiGone('[data-ob="confirm"]');

    // path 4: button clicks — cancel then accept — and Tab trap at the
    // wrap edges (synthetic Tab performs no native focus advance, so only
    // the handler-driven wrap is observable — test E's convention)
    p = U.dialog.confirmDialog(opts);
    panel = q('[data-ob="confirm"]');
    const accept = panel.querySelector('[data-ob="confirm-accept"]');
    const cancel = panel.querySelector('[data-ob="confirm-cancel"]');
    accept.focus();                                // last focusable
    U.key(accept, 'Tab');                          // wraps to first (cancel)
    const wrapFwd = document.activeElement === cancel;
    U.key(cancel, 'Tab', { shiftKey: true });      // wraps back to last
    out.tabTrap = wrapFwd && document.activeElement === accept;
    panel.querySelector('[data-ob="confirm-cancel"]').click();
    out.cancelResolves = await p;
    // the settled panel exits over ~T_FAST before removal — wait for the
    // teardown so the next dialog's [data-ob] hooks are unambiguous
    await window.__uiGone('[data-ob="confirm"]');
    p = U.dialog.confirmDialog(opts);
    document.querySelector('[data-ob="confirm-accept"]').click();
    out.acceptResolves = await p;
    out.goneAfterAccept = await window.__uiGone('[data-ob="confirm"]');

    // danger register
    p = U.dialog.confirmDialog({ ...opts, danger: true });
    panel = q('[data-ob="confirm"]');
    out.dangerPanel = panel.classList.contains('ob-confirm--danger');
    out.dangerAccept = panel.querySelector('[data-ob="confirm-accept"]')
      .classList.contains('ob-btn--danger');
    panel.querySelector('[data-ob="confirm-cancel"]').click();
    await p;
    await window.__uiGone('[data-ob="confirm"]'); // exit tween + removal
    out.residue = document.querySelectorAll(
      '[data-ob="confirm"], .ob-backdrop--top').length;
    anchor.remove();
    return out;
  })()`);
  check('confirm: alertdialog + aria-modal + labelledby/describedby wiring',
    cfm.role === 'alertdialog' && cfm.modal === 'true' && cfm.labelled
    && cfm.described && cfm.backdrop, JSON.stringify(cfm));
  check('confirm: initial focus on the SAFE action (cancel)', cfm.safeFocus);
  check('confirm: Enter activates the FOCUSED button (cancel=false, accept=true)',
    cfm.enterOnCancelResolves === false && cfm.enterOnAcceptResolves === true
    && cfm.goneAfterEnter);
  check('confirm: focus returns to the opener after close', cfm.focusRestored1);
  check('confirm: Escape resolves false',
    cfm.escapeResolves === false && cfm.goneAfterEscape);
  check('confirm: backdrop click resolves false',
    cfm.backdropResolves === false && cfm.goneAfterBackdrop);
  check('confirm: Tab trap wraps between the two actions', cfm.tabTrap === true);
  check('confirm: button clicks resolve false/true',
    cfm.cancelResolves === false && cfm.acceptResolves === true
    && cfm.goneAfterAccept);
  check('confirm: danger register (panel modifier + danger accept button)',
    cfm.dangerPanel === true && cfm.dangerAccept === true);
  check('confirm: zero DOM residue after all five paths', cfm.residue === 0);

  // F3. side-nav modal (navmodal.js). Feature 015 integration CONSUMED the
  // component: settings.js builds the settings modal on it at boot (the D8
  // "integrator's choice", recorded as deviation D9), so the kit-lane
  // inertness probe flips into a consumption probe — the booted app must
  // carry exactly ONE navmodal instance, the settings modal (#ob-settings
  // wearing .ob-navmodal + the §2 instance ids). The component fixture arm
  // below still proves the generic open/navigate/close contract.
  const nm0 = await chrome.eval(`({
    settingsIsNavmodal: !!document.querySelector(
      '#ob-settings.ob-navmodal[data-ob="navmodal"]'),
    strays: [...document.querySelectorAll('[data-ob^="navmodal"], .ob-navmodal')]
      .filter((n) => n !== document.getElementById('ob-settings')
        && !n.closest('#ob-settings')).length,
    fetched: performance.getEntriesByType('resource')
      .some((r) => r.name.includes('navmodal')) })`);
  check('navmodal: consumed by the settings modal only (015 D9 — one '
    + 'instance, zero strays)',
  nm0.settingsIsNavmodal === true && nm0.strays === 0 && nm0.fetched === true,
  JSON.stringify(nm0));
  const nm = await chrome.eval(`(async () => {
    const { createNavModal } = await import('./app/ui/navmodal.js');
    const U = window.__ui, q = (s) => document.querySelector(s);
    const out = {};
    const seen = [];
    let closes = 0;
    const mk = (txt) => (pane) => {
      const d = document.createElement('div');
      d.textContent = txt;
      d.style.height = '900px'; // force per-section scrollability
      pane.append(d);
    };
    const modal = createNavModal({
      title: 'Fixture', closeLabel: 'Close',
      sections: [
        { id: 'a', label: 'Alpha', render: mk('pane-a') },
        { id: 'b', label: 'Bravo', render: mk('pane-b') },
        { id: 'c', label: 'Charlie', render: mk('pane-c') },
      ],
      onSelect: (sid) => seen.push(sid),
      onClose: () => closes++,
    });
    const anchor = document.createElement('button');
    anchor.id = 'obui-nm-anchor';
    anchor.textContent = 'anchor';
    document.body.appendChild(anchor);
    anchor.focus();

    // 015 §2 law, probed BEFORE open: ALL sections DOM-present (and
    // eagerly rendered) from build time, exactly one visible per select
    const holders = () => [...modal.el.querySelectorAll('.ob-navmodal__section')];
    out.builtSections = holders().map((h) =>
      h.dataset.section + ':' + h.textContent).join(',');
    const holderA = holders()[0];

    modal.open();
    // NB: the settings modal is a navmodal instance too (015 D9) — scope
    // every probe to the fixture's own element, never a global query
    const panel = modal.el;
    // let the entrance tween settle before geometry reads
    const t0 = performance.now();
    while (getComputedStyle(panel).transform !== 'none'
        && performance.now() - t0 < 1500) {
      await new Promise((r) => setTimeout(r, 30));
    }
    out.visible = getComputedStyle(panel).display !== 'none';
    out.role = panel.getAttribute('role');
    out.modal = panel.getAttribute('aria-modal');
    out.backdrop = !!q('.ob-backdrop--top');
    const itemsOf = () => [...panel.querySelectorAll('[data-ob="navmodal-item"]')];
    const currentOf = () => itemsOf()
      .find((b) => b.getAttribute('aria-current') === 'true')?.textContent;
    const visibleOf = () => holders().filter((h) => !h.hidden)
      .map((h) => h.textContent).join(',');
    out.labels = itemsOf().map((b) => b.textContent).join(',');
    out.focusOnActive = document.activeElement === itemsOf()[0];
    out.current0 = currentOf();
    const pane = panel.querySelector('[data-ob="navmodal-pane"]');
    out.pane0 = visibleOf();
    // keyboard nav: selection follows focus, aria-current moves, the pane
    // switches by hidden-attribute toggling ONLY (015 §2): all sections
    // stay parented, the section node is never re-created or reparented
    U.key(document.activeElement, 'ArrowDown');
    out.current1 = currentOf();
    out.focus1 = document.activeElement === itemsOf()[1];
    out.pane1 = visibleOf();
    out.stillParented = holders().length === 3
      && holders().every((h) => h.parentNode === pane);
    out.sameNode = holders()[0] === holderA;
    // per-section scroll memory
    pane.scrollTop = 120;
    U.key(document.activeElement, 'ArrowDown');   // -> c
    out.scrollReset = pane.scrollTop === 0;
    U.key(document.activeElement, 'ArrowUp');     // back to b
    out.scrollRestored = pane.scrollTop === 120;
    out.homeEnd = (() => {
      U.key(document.activeElement, 'End');
      const end = currentOf();
      U.key(document.activeElement, 'Home');
      return end === 'Charlie' && currentOf() === 'Alpha';
    })();
    // click nav
    itemsOf()[1].click();
    out.paneClick = visibleOf();
    // desktop clamp geometry + hidden phone tab stub — expected values
    // computed from the LIVE viewport (86vh can undercut the 620px pole
    // on short windows; the law is the clamp, not the pole)
    const r = panel.getBoundingClientRect();
    out.geo = { w: +r.width.toFixed(2), h: +r.height.toFixed(2),
      ew: +Math.min(880, innerWidth * 0.92).toFixed(2),
      eh: +Math.min(620, innerHeight * 0.86).toFixed(2),
      radius: getComputedStyle(panel).borderRadius };
    out.centered = Math.abs((innerWidth - r.right) - r.left) <= 1
      && Math.abs((innerHeight - r.bottom) - r.top) <= 1;
    out.tabsHidden = getComputedStyle(
      panel.querySelector('[data-ob="navmodal-tabs"]')).display === 'none';
    // Escape closes: onClose fires once, focus restored, backdrop gone
    U.key(document.activeElement, 'Escape');
    const t1 = performance.now();
    while (getComputedStyle(panel).display !== 'none'
        && performance.now() - t1 < 2000) {
      await new Promise((r2) => setTimeout(r2, 30));
    }
    out.closedByEscape = getComputedStyle(panel).display === 'none';
    out.closesAfterEscape = closes;
    out.focusRestored = document.activeElement === anchor;
    out.backdropGone = await window.__uiGone('.ob-backdrop--top');
    // reopen on a named section, close via the header button
    modal.open('c');
    out.reopenCurrent = currentOf();
    panel.querySelector('[data-ob="navmodal-close"]').click();
    const t2 = performance.now();
    while (getComputedStyle(panel).display !== 'none'
        && performance.now() - t2 < 2000) {
      await new Promise((r2) => setTimeout(r2, 30));
    }
    out.closesAfterButton = closes;
    // destroy: zero residue (the settings modal's own navmodal instance is
    // NOT residue — scope the count to fixture-created nodes, 015 D9)
    modal.destroy();
    out.destroyed = await window.__uiGone('[data-ob="navmodal"]:not(#ob-settings)');
    out.residue = [...document.querySelectorAll(
      '[data-ob^="navmodal"], .ob-navmodal, .ob-backdrop--top')]
      .filter((n) => n !== document.getElementById('ob-settings')
        && !n.closest('#ob-settings')).length;
    out.selectLog = seen.join(',');
    anchor.remove();
    return out;
  })()`);
  check('navmodal: opens as centered aria-modal dialog + backdrop',
    nm.visible && nm.role === 'dialog' && nm.modal === 'true' && nm.backdrop
    && nm.centered, JSON.stringify(nm));
  check('navmodal: desktop clamp min(880,92vw) x min(620,86vh) (015 comp-a), '
    + 'card-pole radius',
    Math.abs(nm.geo.w - nm.geo.ew) <= 0.5 && Math.abs(nm.geo.h - nm.geo.eh) <= 0.5
    && nm.geo.radius === '12px', JSON.stringify(nm.geo));
  check('navmodal: ALL sections DOM-present + rendered from build time (015 §2)',
    nm.builtSections === 'a:pane-a,b:pane-b,c:pane-c', nm.builtSections);
  check('navmodal: initial focus on the ACTIVE nav item (aria-current)',
    nm.focusOnActive && nm.current0 === 'Alpha' && nm.pane0 === 'pane-a'
    && nm.labels === 'Alpha,Bravo,Charlie');
  check('navmodal: arrow keys move selection + focus + pane content',
    nm.current1 === 'Bravo' && nm.focus1 && nm.pane1 === 'pane-b'
    && nm.homeEnd === true);
  check('navmodal: switching is hidden-toggle ONLY — sections never '
    + 're-created or reparented (015 §2)',
    nm.stillParented === true && nm.sameNode === true);
  check('navmodal: per-section scroll memory (reset on new, restored on back)',
    nm.scrollReset === true && nm.scrollRestored === true);
  check('navmodal: nav click selects', nm.paneClick === 'pane-b');
  check('navmodal: phone tab stub hidden on fine-pointer desktop',
    nm.tabsHidden === true);
  check('navmodal: Escape closes + onClose + focus restore + backdrop gone',
    nm.closedByEscape && nm.closesAfterEscape === 1 && nm.focusRestored
    && nm.backdropGone);
  check('navmodal: reopen on named section, header close button works',
    nm.reopenCurrent === 'Charlie' && nm.closesAfterButton === 2);
  check('navmodal: destroy leaves zero residue',
    nm.destroyed && nm.residue === 0);

  // G. toggle/slider keyboard walk on TRUNK HUD controls + segmented fixture
  const tg0 = await chrome.eval(`(() => { const el = document.getElementById('slowmo');
    el.focus(); return { checked: el.checked, wrapped: !!el.closest('.ob-toggle') }; })()`);
  check('toggle: trunk #slowmo is wrapped in .ob-toggle', tg0.wrapped);
  await pressKey(' ', 'Space', 32, ' ');
  const tg1 = await chrome.eval(`document.getElementById('slowmo').checked`);
  check('toggle: Space toggles #slowmo', tg1 === !tg0.checked);
  await pressKey(' ', 'Space', 32, ' ');
  const tg2 = await chrome.eval(`document.getElementById('slowmo').checked`);
  check('toggle: Space toggles #slowmo back', tg2 === tg0.checked);

  const sl0 = await chrome.eval(`(() => { const el = document.getElementById('power');
    el.focus(); return { value: el.value, val: el.style.getPropertyValue('--val'),
      isRange: el.classList.contains('ob-range') }; })()`);
  check('slider: trunk #power carries .ob-range', sl0.isRange);
  await pressKey('ArrowRight', 'ArrowRight', 39);
  const sl1 = await chrome.eval(`(() => { const el = document.getElementById('power');
    return { value: el.value, val: el.style.getPropertyValue('--val') }; })()`);
  check('slider: ArrowRight steps #power', Number(sl1.value) > Number(sl0.value),
    `${sl0.value} -> ${sl1.value}`);
  check('slider: --val fill follows keyboard input', sl1.val !== '' && sl1.val !== sl0.val,
    `${sl0.val} -> ${sl1.val}`);
  await pressKey('ArrowLeft', 'ArrowLeft', 37);   // restore

  const segCls = await chrome.eval(`(() => {
    const seg = document.createElement('div');
    seg.id = 'obui-seg';
    seg.style.cssText = 'position:fixed;top:60px;left:340px;z-index:80;';
    seg.innerHTML = '<label><input type="radio" name="obui-r" value="1" checked><span>R1</span></label>'
      + '<label><input type="radio" name="obui-r" value="2"><span>R2</span></label>'
      + '<label><input type="radio" name="obui-r" value="3"><span>R3</span></label>';
    document.body.appendChild(seg);
    window.__ui.controls.upgradeSegmented(seg);
    seg.querySelector('input').focus();
    return seg.className + '|' + seg.getAttribute('role');
  })()`);
  check('segmented: upgrade sets class + radiogroup role', segCls === 'ob-segmented|radiogroup');
  await pressKey('ArrowRight', 'ArrowRight', 39);
  const seg1 = await chrome.eval(`document.querySelector('#obui-seg input:checked').value`);
  await pressKey('ArrowRight', 'ArrowRight', 39);
  const seg2 = await chrome.eval(`document.querySelector('#obui-seg input:checked').value`);
  await pressKey('ArrowLeft', 'ArrowLeft', 37);
  const seg3 = await chrome.eval(`document.querySelector('#obui-seg input:checked').value`);
  check('segmented: arrows walk the radios', seg1 === '2' && seg2 === '3' && seg3 === '2',
    `${seg1},${seg2},${seg3}`);

  // H. self-contained motion: the page must carry NO external animation
  // global (GSAP was removed — ui/motion.js ships its own rAF tween
  // engine), and the built-in engine must actually animate and settle
  // residue-free (resting transform computes 'none' — the same J7 law the
  // geometry contracts assert).
  const late = await chrome.eval(`(async () => {
    const out = { globalLeak: !!window.gsap };
    const m = await import('./app/ui/motion.js?selfcontained=1'); // fresh cache
    const d = document.createElement('div');
    d.style.display = 'none';
    document.body.appendChild(d);
    const p = m.enter(d);
    out.shownImmediately = getComputedStyle(d).display !== 'none';
    // two frames in: the tween engine must be driving opacity below 1
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    out.midFlight = parseFloat(getComputedStyle(d).opacity) < 1;
    await p;
    out.settled = getComputedStyle(d).opacity === '1'
      && getComputedStyle(d).transform === 'none';
    await m.pulse(d);
    out.pulseResidueFree = getComputedStyle(d).transform === 'none';
    d.remove();
    return out;
  })()`);
  check('motion: page carries NO external animation global (gsap removed)',
    late.globalLeak === false, JSON.stringify(late));
  check('motion: enter() shows immediately and animates via the built-in engine',
    late.shownImmediately === true && late.midFlight === true, JSON.stringify(late));
  check('motion: settles residue-free (opacity 1, resting transform none)',
    late.settled === true && late.pulseResidueFree === true, JSON.stringify(late));

  // J. GEOMETRY CONTRACTS (the design charter "Component geometry contracts") — the
  // numeric laws behind the 009 kit wash, asserted over CDP so any regression
  // fails this gate instead of waiting for a taste review. Page helpers:
  // __uiToggleGeo measures a wrapped checkbox's track/knob box math (pseudo
  // rects are derived from computed left/top/width + transform since
  // ::after has no getBoundingClientRect); __uiVar resolves a token to its
  // computed color via a probe node.
  await chrome.eval(`(() => {
    window.__uiVar = (name) => {
      const d = document.createElement('div');
      d.style.background = 'var(' + name + ')';
      document.body.appendChild(d);
      const v = getComputedStyle(d).backgroundColor;
      d.remove();
      return v;
    };
    window.__uiToggleGeo = (input) => {
      const track = input.closest('.ob-toggle').querySelector('.ob-toggle__track');
      const r = track.getBoundingClientRect();
      const cs = getComputedStyle(track);
      const af = getComputedStyle(track, '::after');
      const bl = parseFloat(cs.borderLeftWidth);
      const brw = parseFloat(cs.borderRightWidth);
      const bt = parseFloat(cs.borderTopWidth);
      const tx = af.transform === 'none' ? 0
        : new DOMMatrixReadOnly(af.transform).m41;
      const afLeft = parseFloat(af.left);
      const afW = parseFloat(af.width);
      const padW = r.width - bl - brw;
      return {
        w: +r.width.toFixed(2), h: +r.height.toFixed(2),
        vertOff: +((bt + parseFloat(af.top) + parseFloat(af.height) / 2)
          - r.height / 2).toFixed(2),
        leftInset: +(afLeft + tx).toFixed(2),
        rightInset: +(padW - (afLeft + tx + afW)).toFixed(2),
        transform: af.transform, bg: af.backgroundColor,
      };
    };
    return true;
  })()`);

  // J1. G1 rem root: html stays UA 16px; the 14px product size lives on
  // <body>; --ob-fs--1 tokens land at the design 12px (HUD row label)
  const rem = await chrome.eval(`(() => ({
    html: getComputedStyle(document.documentElement).fontSize,
    body: getComputedStyle(document.body).fontSize,
    hudLabel: getComputedStyle(
      document.querySelector('#hud label[for="power"]')).fontSize,
  }))()`);
  check('geometry: rem root 16px / body 14px / HUD label 12px (G1)',
    rem.html === '16px' && rem.body === '14px' && rem.hudLabel === '12px',
    JSON.stringify(rem));

  // J2. G2 box-sizing: every kit-owned box (ob-* class + its ::after)
  // computes border-box. The webkit thumb is asserted at the CSSOM level:
  // getComputedStyle silently IGNORES vendor pseudo arguments (it returns
  // the input's own style), so the thumb's declared geometry + border-box
  // are read from the kit.css rules instead, and the halo/scale treatment
  // is proven hover/active-gated by selector inspection (J7 leans on this).
  const bb = await chrome.eval(`(() => {
    const els = [...document.querySelectorAll('[class^="ob-"], [class*=" ob-"]')];
    const bad = [...new Set(els
      .filter((el) => getComputedStyle(el).boxSizing !== 'border-box')
      .map((el) => el.id ? '#' + el.id : String(el.className).slice(0, 40)))];
    const track = document.querySelector('.ob-toggle__track');
    const thumbRules = [];
    for (const sheet of document.styleSheets) {
      let list;
      try { list = sheet.cssRules; } catch { continue; }
      for (const r of list) {
        if (r.selectorText && r.selectorText.includes('::-webkit-slider-thumb')) {
          thumbRules.push({ sel: r.selectorText, w: r.style.width,
            h: r.style.height, sizing: r.style.boxSizing,
            mt: r.style.marginTop, shadow: r.style.boxShadow,
            transform: r.style.transform });
        }
      }
    }
    return { kitBoxes: els.length, bad: bad.slice(0, 8),
      trackAfter: getComputedStyle(track, '::after').boxSizing, thumbRules };
  })()`);
  check('geometry: all kit boxes border-box incl. toggle ::after (G2)',
    bb.bad.length === 0 && bb.trackAfter === 'border-box', JSON.stringify(bb));
  const thumbBase = bb.thumbRules.find(
    (r) => r.sel === '.ob-range::-webkit-slider-thumb' && r.w);
  const thumbSizing = bb.thumbRules.find(
    (r) => r.sel === '.ob-range::-webkit-slider-thumb' && r.sizing);
  check('geometry: thumb declared 16x16 border-box, centered (margin-top -6px)',
    !!thumbBase && thumbBase.w === '16px' && thumbBase.h === '16px'
    && thumbBase.mt === '-6px' && thumbSizing?.sizing === 'border-box',
    JSON.stringify(bb.thumbRules));
  check('geometry: thumb halo/scale rules are hover/active-gated only',
    bb.thumbRules.every((r) => (!/5px/.test(r.shadow) && !r.transform)
      || /:hover|:active/.test(r.sel)), JSON.stringify(bb.thumbRules));

  // J3. toolbar family: ONE height (34px border-box) + ONE radius (999px)
  // across EVERY pill in the family. GH-156 (chrome diet, owner principle
  // 2): the Export/Share pills are SECONDARY actions and ship
  // icon-only — svg face (data-icon stamped) + non-empty title AND
  // aria-label; the stale-cache degrade keeps the pre-diet text pill
  // (visible label, the old 12px font family law re-binds to it). The
  // retired "three text pills share one font" check is superseded by the
  // anatomy check below.
  // GH-668 B-SH06 (S5 slice 2) — the documented "LEADING PRIMARY" exception:
  // #ob-shell-open (the hall re-entry, the app's HOME) leads the family
  // (order -1) as a LABELLED pill on fine pointers (the kit toolbar part's
  // text register: glyph + the shell.hall word, 34 tall, pill radius, the
  // ONE glass material) and the 44 icon-only circle on coarse. J3's height
  // / radius / material laws bind it too, but it is judged where it PAINTS
  // — the real-user boots of e2e-shell arm G3 (this page boots without the
  // shell, and the pill hides while the hall is open); J4's centre law does
  // NOT apply to it on fine pointers (a labelled pill has no optical-centre
  // face; the coarse icon register is centred by G3 P2).
  // (the paragraph below is the pre-G3 J3 text, kept verbatim)
  // GH-156 (chrome diet, owner principle
  // 2): the Export/Share pills are SECONDARY actions and ship
  // icon-only — svg face (data-icon stamped) + non-empty title AND
  // aria-label; the stale-cache degrade keeps the pre-diet text pill
  // (visible label, the old 12px font family law re-binds to it). The
  // retired "three text pills share one font" check is superseded by the
  // anatomy check below.
  // GH-225 Phase D: the probe was widened from the four
  // export/record/share/gear pills to the WHOLE SHIPPED family (adds
  // #ob-playback, #ob-help, #ob-drills; drops #ob-record, whose pill is
  // retired) so the material law below binds the DVR pill too — it shipped
  // in Phase C wearing the ACCENT voice (accent-dim fill, accent-line
  // border, accent-hi ink) and the four-pill probe could not see it.
  // Build-11 device feedback: an always-accent pill reads as ACTIVE. The
  // icon-anatomy leg names its subjects explicitly rather than slicing, so
  // widening the family cannot silently re-point it.
  const TB_SECONDARY = ['ob-export-btn', 'ob-share'];
  // park the pointer off every pill and let the --ob-t-fast hover
  // transition finish: a pill caught mid-transition reports an interpolated
  // oklab() and the material law below would flake (found while widening
  // this probe from 4 pills to the whole family — GH-225 Phase D). This
  // runs late in runBehavior, after many pointer interactions, so the
  // settle is what makes the widened material law deterministic.
  await chrome.send('Input.dispatchMouseEvent',
    { type: 'mouseMoved', x: 2, y: 780, buttons: 0 });
  await sleep(400);
  const tbf = await chrome.eval(`(() =>
    ['ob-playback', 'ob-export-btn', 'ob-share', 'ob-gear',
      'ob-help', 'ob-drills'].map((id) => {
      const el = document.getElementById(id);
      if (!el) return { id, missing: true };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const svg = el.querySelector('svg');
      return { id, h: +r.height.toFixed(2), radius: cs.borderRadius,
        fs: cs.fontSize, lh: cs.lineHeight,
        icon: svg ? (svg.dataset.icon ?? '') : null,
        aria: (el.getAttribute('aria-label') || '').trim().length > 0,
        title: (el.title || '').trim().length > 0,
        text: (el.textContent || '').trim().length > 0,
        bg: cs.backgroundColor, color: cs.color, blur: cs.backdropFilter };
    }))()`);
  check('geometry: toolbar pills share height 34px + radius 999px',
    tbf.every((b) => !b.missing && Math.abs(b.h - 34) <= 0.5
      && b.radius === '999px'), JSON.stringify(tbf));
  check('geometry: secondary toolbar actions are icon pills with localized '
    + 'voice (GH-156; text fallback tolerated only with a visible label)',
  tbf.filter((b) => TB_SECONDARY.includes(b.id)).every((b) => !b.missing
      && (b.icon ? (b.icon.length > 0 && b.aria && b.title) : b.text)),
  JSON.stringify(tbf.map((b) => `${b.id}:${b.icon ?? 'text'}`
      + `/aria=${b.aria}/title=${b.title}`)));
  // material law (the design charter toolbar family: "border 1px --ob-line-1 over
  // --ob-glass + backdrop blur") — the 2026-07 dual audit proved
  // height/radius/font gates alone miss a material split (record/share
  // shipped opaque --ob-bg-2 with no blur while export/gear were glass),
  // and GH-225 build-11 proved a four-pill probe misses a family member
  // shipped in the accent voice. Ink joins the law for the same reason:
  // an --ob-accent-hi glyph on the glass would still read as "active".
  check('geometry: every toolbar pill shares ONE material (bg + ink + blur)',
    tbf.every((b) => !b.missing && b.bg === tbf[0].bg && b.blur === tbf[0].blur
      && b.color === tbf[0].color)
    && tbf[0].blur !== 'none',
    JSON.stringify(tbf.map((b) => `${b.id}:${b.bg}/${b.color}/${b.blur}`)));

  // J4. icon-only pills optically centered (#49 icon system, the design charter
  // toolbar family law): the SVG face's rect center == button box center
  // ±0.5px on both axes, for #ob-gear AND the #ob-help pill. The icons ride
  // a guarded dynamic import, so poll briefly for the swap; a stale-cache
  // boot keeps the text glyph, measured via the legacy TextMetrics ink-box
  // math (the pre-#49 J4 body) so the fallback register obeys the same law.
  await chrome.eval(`(async () => {
    for (let i = 0; i < 30; i++) {
      if (document.querySelector('#ob-gear svg')
        && document.querySelector('#ob-help svg')) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  })()`);
  // GH-156: the Export/Share icon pills join the centering law when their
  // faces resolved (guarded import — brief poll, stale-cache boots legally
  // keep text pills and are skipped below, not measured as icons).
  // GH-225 Phase D dropped #ob-record from both polls with its pill.
  await chrome.eval(`(async () => {
    for (let i = 0; i < 20; i++) {
      if (document.querySelector('#ob-export-btn svg')
        && document.querySelector('#ob-share svg')
        && document.querySelector('#ob-playback svg')
        && document.querySelector('#ob-drills svg')) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  })()`);
  const iconPills = await chrome.eval(`(() => {
    const measure = (id) => {
      const g = document.getElementById(id);
      if (!g) return { id, missing: true };
      const gr = g.getBoundingClientRect();
      const svg = g.querySelector('svg');
      if (svg) {
        const r = svg.getBoundingClientRect();
        return { id, via: 'svg',
          dx: +((r.left + r.width / 2) - (gr.left + gr.width / 2)).toFixed(2),
          dy: +((r.top + r.height / 2) - (gr.top + gr.height / 2)).toFixed(2) };
      }
      const range = document.createRange();
      range.selectNodeContents(g);
      const tr = range.getBoundingClientRect();
      const cs = getComputedStyle(g);
      const cx = document.createElement('canvas').getContext('2d');
      cx.font = cs.fontWeight + ' ' + cs.fontSize + '/' + cs.lineHeight
        + ' ' + cs.fontFamily;
      const m = cx.measureText(g.textContent.trim());
      const baseline = tr.top
        + (tr.height - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2
        + m.fontBoundingBoxAscent;
      const inkMidY = (baseline - m.actualBoundingBoxAscent
        + baseline + m.actualBoundingBoxDescent) / 2;
      const inkL = tr.left
        + (tr.width - (m.actualBoundingBoxLeft + m.actualBoundingBoxRight)) / 2;
      const inkMidX = inkL + (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) / 2;
      return { id, via: 'text',
        dx: +(inkMidX - (gr.left + gr.width / 2)).toFixed(2),
        dy: +(inkMidY - (gr.top + gr.height / 2)).toFixed(2) };
    };
    // GH-156: the secondary-action pills are measured ONLY in their icon
    // register (a stale-cache text pill is a legal degrade with a visible
    // label — the pre-#156 shape — and is not an icon pill)
    // GH-225 Phase D: #ob-playback and #ob-drills join the same
    // icon-register filter (both are guarded-import SVG faces with a text
    // glyph fallback, exactly like the secondary pills)
    const sec = ['ob-export-btn', 'ob-share', 'ob-playback', 'ob-drills']
      .filter((id) => document.querySelector('#' + id + ' svg'))
      .map(measure);
    return [measure('ob-gear'), measure('ob-help'), ...sec];
  })()`);
  for (const p of iconPills) {
    check(`geometry: ${p.id} face centered in its circle ±0.5px (${p.via ?? 'missing'})`,
      !p.missing && Math.abs(p.dx) <= 0.5 && Math.abs(p.dy) <= 0.5,
      JSON.stringify(p));
  }

  // J4b. COMPONENT CONTRACT WALL for the .ob-btn icon anatomy (2026-07 button
  // audit, owner build-11 finding; ui-kit.md Amendment A1). J4 above measures
  // the SHIPPED toolbar pills; this arm measures the KIT ITSELF from the live
  // CSSOM by building the component inside a real .ob-panel, so deleting the
  // kit hunk is impossible without a red. Four asserts:
  //   (a) .ob-btn is a centred flex row (the layout contract it shipped
  //       without for 006..GH-225),
  //   (b) an icons.js face computes display:block (the de-baseline law - an
  //       inline <svg> is baseline-hung and its holder centres the BOX),
  //   (c) the face's centre sits on the CONTENT-box centre +/-0.5px,
  //   (d) the design charter's own same-row law: an icon+label pill and a
  //       byte-identical text-only sibling in the SAME row differ in height
  //       by <=0.5px (pre-fix: 37 vs 36; measured 0.00 after).
  // (a) pins display to INLINE-flex specifically and requires a non-zero gap:
  // a future `display: flex` would silently turn every kit button into a
  // full-width block, and a dropped `gap` would re-jam the face against the
  // label — both inside the old /flex/ test. INLINE-ness is read from a
  // subject in a BLOCK container, because a flex ITEM is blockified
  // (inline-flex computes as `flex` inside the measurement row itself —
  // measured, and the reason the naive assert cannot be written in-row).
  // Plus the two registers the fallback path depends on: .ob-btn--icon (the
  // icon-only pill primitive) and the TEXT-GLYPH register (a stale/absent
  // icons.js), which must land on the same optical centre.
  // Every subject is built THROUGH ui/controls.js makeButton/setButtonFace,
  // so this arm is also the factory's only gate: its anatomy, its text-glyph
  // register, and its two degrade paths (an icon-only pill with no face must
  // throw instead of shipping blank; a late setButtonFace must land in the
  // icon slot instead of replaceChildren-ing the label away).
  const kitBtn = await chrome.eval(`(async () => {
    let icons = null;
    try { icons = await import('./app/ui/icons.js'); } catch { /* stale graph */ }
    if (!icons?.icon) return { err: 'ui/icons.js unreachable' };
    let ctl = null;
    try { ctl = await import('./app/ui/controls.js'); } catch { /* stale graph */ }
    if (!ctl?.makeButton || !ctl?.setButtonFace) {
      return { err: 'ui/controls.js makeButton/setButtonFace unreachable' };
    }
    const host = document.querySelector('.ob-panel');
    if (!host) return { err: 'no live .ob-panel host' };
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;align-items:center;'
      + 'position:fixed;left:-9999px;top:8px';
    // built THROUGH the public factory, not by hand: the anatomy this arm
    // measures is the one real call sites get (a factory regression would
    // otherwise ship green \u2014 the factory had zero gate coverage on landing)
    const mk = (o) => ctl.makeButton(o);
    const iconLabel = mk({ label: 'Advanced', icon: icons.icon('gear', { size: 16 }) });
    const textOnly = mk({ label: 'Advanced' });
    const iconOnly = mk({ icon: icons.icon('gear', { size: 16 }), iconOnly: true,
      title: 'Settings', titleKey: 'settings.title' });
    const glyph = mk({ label: 'Advanced', icon: null, fallbackGlyph: '\u2699' });
    // DEGRADE PATHS the factory promises (both were holes on landing):
    //  1. iconOnly with NO face at all must THROW, not ship a blank pill,
    //  2. setButtonFace on kit anatomy must land in the icon SLOT and leave
    //     the label alone (it used to replaceChildren the label away).
    let emptyPill = 'no throw';
    try { mk({ iconOnly: true, title: 'Settings' }); } catch { emptyPill = 'throws'; }
    // the other two empty-control shapes: nothing visible at all, and a
    // whitespace label that would ship a named-but-blank control
    let emptyBtn = 'no throw';
    try { mk(); } catch { emptyBtn = 'throws'; }
    let blankLabel = 'no throw';
    try { mk({ label: '   ' }); } catch { blankLabel = 'throws'; }
    let unnamedFace = 'no throw';
    try { mk({ icon: icons.icon('gear', { size: 16 }) }); } catch { unnamedFace = 'throws'; }
    let blankGlyph = 'no throw';
    try {
      mk({ iconOnly: true, title: 'Settings', fallbackGlyph: ' ' });
    } catch { blankGlyph = 'throws'; }
    // idempotence contract, hand-built face (no data-icon): the SAME node twice
    // must be a no-op, and a DIFFERENT face of the same width must not collide
    const mkSvg = (d) => {
      const ns = 'http://www.w3.org/2000/svg';
      const sv = document.createElementNS(ns, 'svg');
      sv.setAttribute('viewBox', '0 0 20 20');
      sv.setAttribute('width', '16');
      sv.setAttribute('height', '16');
      const pt = document.createElementNS(ns, 'path');
      pt.setAttribute('d', d);
      sv.append(pt);
      return sv;
    };
    const handBuilt = mk({ label: 'Advanced', icon: mkSvg('M2 2h16v16H2z') });
    const raw = handBuilt.querySelector('svg');
    const idem = {
      same: ctl.setButtonFace(handBuilt, raw),
      other: ctl.setButtonFace(handBuilt, mkSvg('M4 4h12v12H4z')),
    };
    let labelledIconOnly = 'no throw';
    try {
      mk({ iconOnly: true, label: 'Advanced', icon: icons.icon('gear', { size: 16 }) });
    } catch { labelledIconOnly = 'throws'; }
    // the accessible name must survive a locale switch: data-i18n-title is what
    // i18n.applyDom re-localizes (and it refreshes an existing aria-label)
    const i18nName = {
      key: iconOnly.dataset.i18nTitle ?? null,
      title0: iconOnly.title,
      aria0: iconOnly.getAttribute('aria-label'),
      labelledAria: iconLabel.getAttribute('aria-label'),
    };
    document.body.append(iconOnly);
    // a REAL transition: __settings.set fire-and-forgets setLocale(), so the
    // await here is on i18n's own promise, the target locale is chosen to
    // DIFFER from the current one (a de-default browser would otherwise switch
    // to itself), and the assertion polls for applyDom instead of sleeping
    const was = window.__i18n?.locale?.() ?? 'en';
    const alt = was === 'de' ? 'fr' : 'de';
    i18nName.was = was;
    i18nName.alt = alt;
    try {
      await window.__i18n?.setLocale?.(alt);
      for (let i = 0; i < 40 && iconOnly.title === i18nName.title0; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      i18nName.locale1 = window.__i18n?.locale?.();
      i18nName.title1 = iconOnly.title;
      i18nName.aria1 = iconOnly.getAttribute('aria-label');
    } finally {
      await window.__i18n?.setLocale?.(was);
      for (let i = 0; i < 40 && window.__i18n?.locale?.() !== was; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const late = mk({ label: 'Advanced' });
    ctl.setButtonFace(late, icons.icon('gear', { size: 16 }));
    //  3. clearing a face must REMOVE the slot: .ob-btn spends a gap on every
    //     flex item, so an empty .ob-btn__icon costs a phantom 8px and pushes
    //     the label off centre. Idempotent, and re-settable.
    const cleared = mk({ label: 'Advanced', icon: icons.icon('gear', { size: 16 }) });
    //  4. the icon-only pill must not SHRINK below its declared/tap-floor box
    //     in a crowded row (width alone is a starting size). Measured OUTSIDE
    //     #hud, whose own '#hud button { flex: 1 1 auto }' (1,0,1) owns that
    //     context by design.
    const tight = document.createElement('div');
    tight.style.cssText = 'display:flex;width:60px;position:fixed;left:-9999px;top:320px';
    const squeeze = mk({ icon: icons.icon('gear', { size: 16 }), iconOnly: true,
      title: 'Settings' });
    const filler = document.createElement('div');
    filler.style.cssText = 'width:200px;flex:1 1 auto';
    tight.append(squeeze, filler);
    document.body.append(tight);
    row.append(iconLabel, textOnly, iconOnly, glyph, late, cleared, handBuilt);
    // INLINE-ness probe: the row above is a flex container, and a flex ITEM is
    // BLOCKIFIED (inline-flex -> flex), so the declared inline-ness can only be
    // read from a subject in a BLOCK box
    const blockBox = document.createElement('div');
    blockBox.style.cssText = 'display:block;position:fixed;left:-9999px;top:240px';
    const inlineProbe = mk({ label: 'Advanced', icon: icons.icon('gear', { size: 16 }) });
    blockBox.append(inlineProbe);
    host.append(blockBox);
    host.append(row);
    await new Promise((r) => setTimeout(r, 120));
    const dyOf = (el) => {
      const box = el.querySelector('svg') ?? el.querySelector('.ob-btn__icon');
      if (!box) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect(), br = box.getBoundingClientRect();
      const top = r.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
      const bot = r.bottom - parseFloat(cs.borderBottomWidth)
        - parseFloat(cs.paddingBottom);
      return +((br.top + br.height / 2) - (top + bot) / 2).toFixed(2);
    };
    // PAINTED-INK offset of an element's own text vs the owning button's
    // content-box centre. Range rects are typographic line boxes, so an
    // asymmetric glyph (or a different fallback font) reads centred while the
    // visible ink is high or low: the ink band comes from TextMetrics
    // actualBoundingBox*, the same math J4 uses for the toolbar text register.
    const inkDy = (el) => {
      const txt = (el.textContent || '').trim();
      if (!txt) return null;
      const rng = document.createRange();
      rng.selectNodeContents(el);
      const tr = rng.getBoundingClientRect();
      if (!tr.height) return null;
      const cs1 = getComputedStyle(el);
      const cx = document.createElement('canvas').getContext('2d');
      cx.font = cs1.fontWeight + ' ' + cs1.fontSize + '/' + cs1.lineHeight
        + ' ' + cs1.fontFamily;
      const m = cx.measureText(txt);
      const baseline = tr.top
        + (tr.height - m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2
        + m.fontBoundingBoxAscent;
      const inkMid = ((baseline - m.actualBoundingBoxAscent)
        + (baseline + m.actualBoundingBoxDescent)) / 2;
      const own = el.closest('button') ?? el;
      const cs2 = getComputedStyle(own);
      const r2 = own.getBoundingClientRect();
      const t2 = r2.top + parseFloat(cs2.borderTopWidth) + parseFloat(cs2.paddingTop);
      const b2 = r2.bottom - parseFloat(cs2.borderBottomWidth)
        - parseFloat(cs2.paddingBottom);
      return +(inkMid - (t2 + b2) / 2).toFixed(2);
    };
    const glyphSlot = glyph.querySelector('.ob-btn__icon');
    const clearedChanged = ctl.setButtonFace(cleared, null, '');
    const clearedTwice = ctl.setButtonFace(cleared, null, '');
    const cs = getComputedStyle(iconLabel);
    const face = iconLabel.querySelector('svg');
    const res = {
      disp: cs.display, ai: cs.alignItems, jc: cs.justifyContent, gap: cs.gap,
      gapPx: parseFloat(cs.gap),
      dispBlockBox: getComputedStyle(inlineProbe).display,
      faceDisp: face ? getComputedStyle(face).display : null,
      faceFlex: face ? getComputedStyle(face).flexGrow + '/'
        + getComputedStyle(face).flexShrink : null,
      dy: dyOf(iconLabel), dyGlyph: dyOf(glyph), dyIconOnly: dyOf(iconOnly),
      h: +iconLabel.getBoundingClientRect().height.toFixed(2),
      hText: +textOnly.getBoundingClientRect().height.toFixed(2),
      hIconOnly: +iconOnly.getBoundingClientRect().height.toFixed(2),
      wIconOnly: +iconOnly.getBoundingClientRect().width.toFixed(2),
      // factory contract: the anatomy the caller never has to write
      slots: [...iconLabel.children].map((c) => c.className).join('+'),
      glyphSlot: glyph.querySelector('.ob-btn__icon')?.textContent ?? null,
      emptyPill, emptyBtn, blankLabel, unnamedFace, blankGlyph,
      labelledIconOnly, i18nName, idem,
      // degrade: a LATE setButtonFace on kit anatomy keeps the label and
      // lands the face in a real slot (dyLate proves it is centred there)
      lateSlots: [...late.children].map((c) => c.className).join('+'),
      lateLabel: late.querySelector('.ob-btn__label')?.textContent ?? null,
      dyLate: dyOf(late),
      // TEXT-GLYPH register measured on its INK, plus the line-height:1
      // correction itself: the slot's box is centred by construction, so only
      // the ink + the slot's collapsed height can fail
      dyGlyphInk: inkDy(glyphSlot),
      dyGlyphLabelInk: inkDy(glyph.querySelector('.ob-btn__label')),
      glyphSlotH: +glyphSlot.getBoundingClientRect().height.toFixed(2),
      glyphSlotLH: parseFloat(getComputedStyle(glyphSlot).lineHeight),
      glyphSlotFS: parseFloat(getComputedStyle(glyphSlot).fontSize),
      // cleared-face register
      clearedChanged, clearedTwice,
      clearedSlots: [...cleared.children].map((c) => c.className).join('+'),
      clearedW: +cleared.getBoundingClientRect().width.toFixed(2),
      wText: +textOnly.getBoundingClientRect().width.toFixed(2),
      clearedReset: ctl.setButtonFace(cleared, icons.icon('gear', { size: 16 })),
      // crowded-row floor
      squeezeW: +squeeze.getBoundingClientRect().width.toFixed(2),
      squeezeH: +squeeze.getBoundingClientRect().height.toFixed(2),
    };
    res.clearedSlotsAfterReset = [...cleared.children]
      .map((c) => c.className).join('+');
    iconOnly.remove();
    row.remove();
    blockBox.remove();
    tight.remove();
    return res;
  })()`);
  check('geometry: kit .ob-btn is a centred INLINE-flex row with a token gap '
    + '— the layout contract behind icon+label',
  !kitBtn.err && kitBtn.dispBlockBox === 'inline-flex' && /flex/.test(kitBtn.disp)
    && kitBtn.ai === 'center' && kitBtn.jc === 'center' && kitBtn.gapPx > 0,
  JSON.stringify(kitBtn));
  check('geometry: an icons.js face in a kit .ob-btn computes display:block '
    + '(de-baseline law svg[data-icon]) and never shrinks',
  !kitBtn.err && kitBtn.faceDisp === 'block' && kitBtn.faceFlex === '0/0',
  JSON.stringify(kitBtn));
  check('geometry: kit .ob-btn face centre == content-box centre ±0.5px '
    + '(SVG, text-glyph fallback AND .ob-btn--icon registers)',
  !kitBtn.err && Math.abs(kitBtn.dy) <= 0.5 && Math.abs(kitBtn.dyGlyph) <= 0.5
    && Math.abs(kitBtn.dyIconOnly) <= 0.5, JSON.stringify(kitBtn));
  check('geometry: same-row height law — an icon+label .ob-btn matches its '
    + 'text-only sibling within 0.5px (the design charter Button/pill assert)',
  !kitBtn.err && Math.abs(kitBtn.h - kitBtn.hText) <= 0.5,
  JSON.stringify(kitBtn));
  check('geometry: .ob-btn--icon is the 34x34 icon-only pill primitive and '
    + 'HOLDS that box under flex-shrink pressure (tap-floor law)',
  !kitBtn.err && Math.abs(kitBtn.hIconOnly - 34) <= 0.5
    && Math.abs(kitBtn.wIconOnly - 34) <= 0.5
    && Math.abs(kitBtn.squeezeW - 34) <= 0.5
    && Math.abs(kitBtn.squeezeH - 34) <= 0.5, JSON.stringify(kitBtn));
  // J4b-coarse: the .ob-btn--icon 44pt floor lives inside
  // `@media (pointer: coarse) { html.ob-touch … }`, which NO gate exercised —
  // the component wall runs fine-pointer and the phone audit never builds a
  // kit fixture. Emulate the media feature + the class, rebuild the pill, and
  // assert the floor, then restore.
  // (pointer: coarse) is NOT an emulatable media FEATURE in this Chrome
  // (setEmulatedMedia leaves matchMedia false — measured); touch emulation +
  // a mobile metrics override is what flips it, the same way runPhoneAudit
  // reaches the coarse register.
  await chrome.send('Emulation.setTouchEmulationEnabled',
    { enabled: true, maxTouchPoints: 5 });
  await chrome.send('Emulation.setDeviceMetricsOverride',
    { width: 852, height: 393, deviceScaleFactor: 1, mobile: true });
  await sleep(250);
  const coarsePill = await chrome.eval(`(async () => {
    let icons = null; let ctl = null;
    try { icons = await import('./app/ui/icons.js'); } catch { /* stale */ }
    try { ctl = await import('./app/ui/controls.js'); } catch { /* stale */ }
    if (!icons?.icon || !ctl?.makeButton) return { err: 'kit unreachable' };
    const hadTouch = document.documentElement.classList.contains('ob-touch');
    document.documentElement.classList.add('ob-touch');
    const box = document.createElement('div');
    box.style.cssText = 'display:block;position:fixed;left:-9999px;top:400px';
    const pill = ctl.makeButton({ icon: icons.icon('gear', { size: 16 }),
      iconOnly: true, title: 'Settings', titleKey: 'settings.title' });
    box.append(pill);
    (document.querySelector('.ob-panel') ?? document.body).append(box);
    await new Promise((r) => setTimeout(r, 120));
    const r = pill.getBoundingClientRect();
    const cs = getComputedStyle(pill);
    const face = pill.querySelector('svg');
    const fr = face.getBoundingClientRect();
    const top = r.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
    const bot = r.bottom - parseFloat(cs.borderBottomWidth)
      - parseFloat(cs.paddingBottom);
    const res = {
      coarse: matchMedia('(pointer: coarse)').matches,
      w: +r.width.toFixed(2), h: +r.height.toFixed(2),
      dy: +((fr.top + fr.height / 2) - (top + bot) / 2).toFixed(2),
    };
    box.remove();
    if (!hadTouch) document.documentElement.classList.remove('ob-touch');
    return res;
  })()`);
  await chrome.send('Emulation.clearDeviceMetricsOverride');
  await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await sleep(250);
  check('geometry: .ob-btn--icon lifts to the 44pt COARSE floor under '
    + 'html.ob-touch + (pointer: coarse), face still centred',
  !coarsePill.err && coarsePill.coarse === true
    && Math.abs(coarsePill.w - 44) <= 0.5 && Math.abs(coarsePill.h - 44) <= 0.5
    && Math.abs(coarsePill.dy) <= 0.5, JSON.stringify(coarsePill));
  check('geometry: the TEXT-GLYPH register is centred on its INK and its slot '
    + 'stays collapsed to the glyph em box (kit line-height:1 correction)',
  !kitBtn.err && Math.abs(kitBtn.dyGlyphInk) <= 1.5
    && Math.abs(kitBtn.dyGlyphInk - kitBtn.dyGlyphLabelInk) <= 1.5
    && kitBtn.glyphSlotH <= kitBtn.glyphSlotFS + 0.5
    && kitBtn.glyphSlotLH <= kitBtn.glyphSlotFS + 0.5, JSON.stringify(kitBtn));
  check('kit: setButtonFace is IDEMPOTENT for a re-passed hand-built face and '
    + 'still distinguishes a DIFFERENT face of the same size (no key collision)',
  !kitBtn.err && kitBtn.idem?.same === false && kitBtn.idem?.other === true,
  JSON.stringify(kitBtn.idem));
  check('kit: clearing a face REMOVES the icon slot (an empty slot would spend '
    + 'the kit gap on nothing), idempotently, and a new face restores it',
  !kitBtn.err && kitBtn.clearedChanged === true && kitBtn.clearedTwice === false
    && kitBtn.clearedSlots === 'ob-btn__label'
    && Math.abs(kitBtn.clearedW - kitBtn.wText) <= 0.5
    && kitBtn.clearedReset === true
    && kitBtn.clearedSlotsAfterReset === 'ob-btn__icon+ob-btn__label',
  JSON.stringify(kitBtn));
  check('kit: ui/controls.js makeButton composes the .ob-btn anatomy '
    + '(icon slot + label slot, text-glyph register in the slot)',
  !kitBtn.err && kitBtn.slots === 'ob-btn__icon+ob-btn__label'
    && kitBtn.glyphSlot === '⚙', JSON.stringify(kitBtn));
  check('kit: makeButton refuses EVERY malformed shape (no content, blank '
    + 'label, blank glyph, unnamed face, faceless icon-only pill, LABELLED '
    + 'icon-only pill) and a LATE setButtonFace keeps the label',
  !kitBtn.err && kitBtn.emptyPill === 'throws' && kitBtn.emptyBtn === 'throws'
    && kitBtn.blankLabel === 'throws' && kitBtn.unnamedFace === 'throws'
    && kitBtn.blankGlyph === 'throws' && kitBtn.labelledIconOnly === 'throws'
    && kitBtn.lateSlots === 'ob-btn__icon+ob-btn__label'
    && kitBtn.lateLabel === 'Advanced' && Math.abs(kitBtn.dyLate) <= 0.5,
  JSON.stringify(kitBtn));
  check('kit: a factory accessible name RE-LOCALIZES on a locale switch '
    + '(data-i18n-title), and a labelled button carries no overriding aria-label',
  !kitBtn.err && !!kitBtn.i18nName?.key && kitBtn.i18nName.labelledAria === null
    && kitBtn.i18nName.locale1 === kitBtn.i18nName.alt
    && kitBtn.i18nName.aria0 === kitBtn.i18nName.title0
    && typeof kitBtn.i18nName.title1 === 'string'
    && kitBtn.i18nName.title1.length > 0
    && kitBtn.i18nName.title1 !== kitBtn.i18nName.title0
    && kitBtn.i18nName.aria1 === kitBtn.i18nName.title1,
  JSON.stringify(kitBtn.i18nName));

  // J5. HUD toggle (#slowmo): 34x20 track, knob vertically centered ±0.5,
  // symmetric 2px travel, ON = translateX(14px) + accent-hi knob; label
  // LEFT of control (one orientation law across surfaces)
  const hudTg = await chrome.eval(`(async () => {
    const el = document.getElementById('slowmo');
    const was = el.checked;
    if (was) { el.click(); await new Promise((r) => setTimeout(r, 350)); }
    const off = __uiToggleGeo(el);
    el.click();
    await new Promise((r) => setTimeout(r, 350)); // --ob-t-med knob tween
    // settle under load (fix round 5: a 13.99 px read at load average 47 — the
    // 350 ms sleep is the tween's nominal length, not a settled frame)
    for (let i = 0; i < 15 && __uiToggleGeo(el).transform !== 'matrix(1, 0, 0, 1, 14, 0)'; i++) await new Promise((r) => setTimeout(r, 100));
    const on = __uiToggleGeo(el);
    if (!was) el.click();
    const labR = document.querySelector('#hud label[for="slowmo"]')
      .getBoundingClientRect();
    const trkR = document.querySelector('#hud .ob-toggle__track')
      .getBoundingClientRect();
    return { off, on, labelRight: +labR.right.toFixed(2),
      trackLeft: +trkR.left.toFixed(2), accentHi: __uiVar('--ob-accent-hi') };
  })()`);
  const setTgChecks = (name, t) => {
    check(`geometry: ${name} track 34x20 border-box`,
      t.off.w === 34 && t.off.h === 20, `${t.off.w}x${t.off.h}`);
    check(`geometry: ${name} knob vertically centered ±0.5px`,
      Math.abs(t.off.vertOff) <= 0.5 && Math.abs(t.on.vertOff) <= 0.5,
      `off=${t.off.vertOff} on=${t.on.vertOff}`);
    check(`geometry: ${name} travel symmetric (OFF left == ON right ±0.5px)`,
      Math.abs(t.off.leftInset - t.on.rightInset) <= 0.5
      && Math.abs(t.off.leftInset - 2) <= 0.5,
      `offLeft=${t.off.leftInset} onRight=${t.on.rightInset}`);
    // #880: knobIsAccentHi (coloursEqual, not ===) — the knob bg and the
    // probe/token read can serialise the same colour in different spaces.
    check(`geometry: ${name} ON knob = translateX(14px) + accent-hi`,
      knobIsAccentHi(t),
      `${t.on.transform} bg=${t.on.bg} want=${t.accentHi}`);
    check(`geometry: ${name} label left of control (orientation law)`,
      t.labelRight < t.trackLeft,
      `labelRight=${t.labelRight} trackLeft=${t.trackLeft}`);
  };
  setTgChecks('HUD slowmo toggle', hudTg);

  // J6. G3 focus: a REAL mouse click on the toggle must not summon a focus
  // ring (:focus-visible is keyboard-only) — both directions of the flip
  const clickPt = await chrome.eval(`(() => {
    const r = document.querySelector('#hud .ob-toggle__track')
      .getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2),
      y: Math.round(r.top + r.height / 2) };
  })()`);
  const mouseClick = async () => {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await chrome.send('Input.dispatchMouseEvent',
        { type, x: clickPt.x, y: clickPt.y, button: 'left', clickCount: 1 });
    }
    await sleep(250);
  };
  const ringProbe = `(() => {
    const fv = document.querySelector(':focus-visible');
    return { checked: document.getElementById('slowmo').checked,
      focusVisible: fv ? (fv.id || fv.tagName) : null,
      trackShadow: getComputedStyle(
        document.querySelector('#hud .ob-toggle__track')).boxShadow };
  })()`;
  await mouseClick();
  const ring1 = await chrome.eval(ringProbe);
  await mouseClick(); // flip back — ring must not linger either way
  const ring2 = await chrome.eval(ringProbe);
  check('focus: no ring after real mouse click (toggle ON)',
    ring1.checked === true && ring1.focusVisible === null
    && ring1.trackShadow === 'none', JSON.stringify(ring1));
  check('focus: no ring after real mouse click (toggle OFF)',
    ring2.checked === false && ring2.focusVisible === null
    && ring2.trackShadow === 'none', JSON.stringify(ring2));

  // J7. slider resting identity: with the pointer parked on the toggle (off
  // both sliders), #power and #elev must be pixel-identical in thumb
  // treatment. Chrome exposes no computed style for vendor pseudos over
  // CDP, so identity is proven as: (a) the exact same SET of
  // ::-webkit-slider-thumb rules matches both inputs right now (thumb
  // styles are fully rule-determined given equal matches), (b) both inputs'
  // own computed styles diff to nothing (custom props like --val excluded —
  // --val paints the track gradient, never the thumb), and (c) neither is
  // stuck in a hover/active/focus-visible state (J2 proved the halo lives
  // only behind :hover/:active).
  const thumbs = await chrome.eval(`(() => {
    const power = document.getElementById('power');
    const elev = document.getElementById('elev');
    const matched = (el) => {
      const out = [];
      for (const sheet of document.styleSheets) {
        let list;
        try { list = sheet.cssRules; } catch { continue; }
        for (const r of list) {
          if (!r.selectorText
              || !r.selectorText.includes('::-webkit-slider-thumb')) continue;
          for (const sel of r.selectorText.split(',')) {
            const base = sel.replace(/::-webkit-slider-thumb/, '').trim();
            try {
              if (base === '' || el.matches(base)) { out.push(sel.trim()); break; }
            } catch { /* unmatchable selector fragment */ }
          }
        }
      }
      return out;
    };
    const styleOf = (el) => {
      const cs = getComputedStyle(el);
      const o = {};
      for (const p of cs) {
        if (!p.startsWith('--')) o[p] = cs.getPropertyValue(p);
      }
      return o;
    };
    const a = styleOf(power);
    const b = styleOf(elev);
    return {
      rulesPower: matched(power), rulesElev: matched(elev),
      diff: Object.keys(a).filter((k) => a[k] !== b[k]),
      stuck: ['power', 'elev'].filter((id) => document.getElementById(id)
        .matches(':hover, :active, :focus-visible')),
      transform: a.transform,
    };
  })()`);
  check('slider: same thumb rule set matches #power and #elev at rest',
    thumbs.rulesPower.join('|') === thumbs.rulesElev.join('|')
    && thumbs.rulesPower.length > 0,
    `power=[${thumbs.rulesPower}] elev=[${thumbs.rulesElev}]`);
  check('slider: resting computed styles identical (diff == none)',
    thumbs.diff.length === 0 && thumbs.transform === 'none',
    `diff: ${thumbs.diff.slice(0, 6).join(', ')} transform=${thumbs.transform}`);
  check('slider: neither slider stuck hover/active/focus-visible at rest',
    thumbs.stuck.length === 0, thumbs.stuck.join(', '));

  // J8. settings modal (015): same toggle laws on a settings toggle (sound),
  // and the popover column law on a real select — option text x == trigger
  // label x ±1px, list left == trigger left unless intrinsic excess, then
  // symmetric overhang (never one-sided right). The sound toggle + camera
  // select live in the `display` pane; panes toggle `hidden`, so the
  // section is activated first (contract §6 sanctioned migration).
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await sleep(500); // motion.enter + layout
  await chrome.eval(`window.__settings.show('display')`);
  await sleep(150);
  const setTg = await chrome.eval(`(async () => {
    const el = document.getElementById('ob-set-sound');
    const was = el.checked; // default ON (soundOn: true)
    if (was) { el.click(); await new Promise((r) => setTimeout(r, 350)); }
    const off = __uiToggleGeo(el);
    el.click();
    await new Promise((r) => setTimeout(r, 350));
    // settle under load (fix round 5: a 13.99 px read at load average 47 — the
    // 350 ms sleep is the tween's nominal length, not a settled frame)
    for (let i = 0; i < 15 && __uiToggleGeo(el).transform !== 'matrix(1, 0, 0, 1, 14, 0)'; i++) await new Promise((r) => setTimeout(r, 100));
    const on = __uiToggleGeo(el);
    if (!was) el.click();
    const lab = el.closest('label.ob-toggle');
    // GH-668 S5 slice 2 (B-SH07): the settings ROW label sits in column 1 as
    // label[for] and the wrapping label holds the track + the kit state word
    // (no data-i18n span inside it) — the orientation law is judged against
    // the row label; a legacy wrapped label keeps its own span
    const txt = lab.querySelector('span[data-i18n]') || document.querySelector('label[for="' + el.id + '"]');
    const rng = document.createRange();
    rng.selectNodeContents(txt);
    const labR = rng.getBoundingClientRect();
    const trkR = lab.querySelector('.ob-toggle__track').getBoundingClientRect();
    return { off, on, labelRight: +labR.right.toFixed(2),
      trackLeft: +trkR.left.toFixed(2), accentHi: __uiVar('--ob-accent-hi') };
  })()`);
  setTgChecks('settings sound toggle', setTg);

  // Two regimes (the design charter select contract): when the option content fits
  // the trigger width (camera: Orbit/Overhead) the list sits EXACTLY on the
  // trigger and the text columns coincide; when the widest option NEEDS
  // more (assist), the excess overhangs symmetrically and the whole column
  // shifts with it — the invariant that always holds is the 13px text
  // offset from the LIST edge == the trigger's own label offset.
  const popProbe = async (selId) => chrome.eval(`(async () => {
    const sel = document.getElementById('${selId}');
    const btn = sel.nextElementSibling;
    if (!btn || btn.dataset.ob !== 'select-button') return { opened: false };
    btn.click();
    const t0 = performance.now();
    let list = document.querySelector('[data-ob="select-list"]');
    while ((!list || getComputedStyle(list).transform !== 'none')
        && performance.now() - t0 < 1500) { // entrance tween offsets the rect
      await new Promise((r) => setTimeout(r, 30));
      list = document.querySelector('[data-ob="select-list"]');
    }
    if (!list) return { opened: false };
    const textX = (el) => {
      const rng = document.createRange();
      rng.selectNodeContents(el);
      return rng.getBoundingClientRect().left;
    };
    const lr = list.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    const out = { opened: true,
      dText: +(textX(list.querySelector('.ob-option'))
        - textX(btn.querySelector('.ob-select__label'))).toFixed(2),
      dLeft: +(lr.left - br.left).toFixed(2),
      overRight: +(lr.right - br.right).toFixed(2),
      excess: +Math.max(0, lr.width - br.width).toFixed(2) };
    btn.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'Escape', bubbles: true, cancelable: true }));
    await window.__uiGone('[data-ob="select-list"]');
    return out;
  })()`);
  const popChecks = (name, p) => {
    check(`popover: ${name} — option text offset == trigger label offset ±1px`,
      p.opened && Math.abs(p.dText - p.dLeft) <= 1, JSON.stringify(p));
    check(`popover: ${name} — width law (on-trigger or symmetric overhang)`,
      p.opened && Math.abs(p.dLeft + p.excess / 2) <= 1
      && p.overRight <= p.excess / 2 + 1, JSON.stringify(p));
  };
  const popFit = await popProbe('ob-set-camera');
  popChecks('fitting list (camera)', popFit);
  check('popover: fitting list sits exactly on the trigger column',
    popFit.opened && popFit.excess <= 1 && Math.abs(popFit.dLeft) <= 1
    && Math.abs(popFit.dText) <= 1, JSON.stringify(popFit));
  await chrome.eval(`window.__settings.show('assists')`); // assist pane (015)
  await sleep(150);
  const popWide = await popProbe('ob-set-assist');
  popChecks('overhanging list (assist)', popWide);
  await chrome.eval(`window.__settings.show('assists')`); // 034: never show('game') — it routes to the shell
  await chrome.eval(`document.getElementById('ob-gear').click()`); // close
  await sleep(400);

  // J9. WRAP + RADIUS LAWS (GH-667 / GH-668 S5 kit step 2 — B-K01 B-K03
  // B-K10 B-K21; the design charter G5 pill = one line, G6 pad tracks height, G8
  // measure lines). A kit LAB, not a surface walk: a 360px column (the
  // settings control rail) holds one of each part with the longest de/fr
  // copy the S5 critique measured, and the laws are asserted on computed
  // geometry — line boxes counted from Range.getClientRects tops, never
  // from character counts. Red-proven on the step-1 bytes (kit.css v020):
  // the pill wrapped inside the column, the segmented stretched to the
  // column with unequal segments, the select label ellipsized, the badge
  // painted two lines, the strip pill pad was 0.27 h. The cross-surface
  // form of these laws (A1 / A6 / A8) lands in --audit with slice 1's
  // predicate phase; this lab is the kit's own contract wall.
  const wrapLab = await chrome.eval(`(async () => {
    const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const lines = (el) => { // TEXT line boxes only (the hidden 1x1 radio
      const tops = [];         // inside a segment label is not a line)
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.data.trim()) continue;
        const r = document.createRange(); r.selectNodeContents(n);
        for (const b of r.getClientRects()) {
          if (b.width < 1 || b.height < 1) continue;
          if (!tops.some((t) => Math.abs(t - b.top) < 4)) tops.push(b.top);
        }
      }
      return tops.length;
    };
    const geo = (el) => {
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        radius: parseFloat(cs.borderRadius), padL: parseFloat(cs.paddingLeft),
        ws: cs.whiteSpace, ta: cs.textAlign, jc: cs.justifyContent,
        lh: cs.lineHeight, to: cs.textOverflow, ov: cs.overflow,
        clip: el.scrollWidth > el.clientWidth + 1, lines: lines(el) };
    };
    const DE = 'Sitzungswiederholungen öffnen und mit anderen Spielern teilen';
    const col = document.createElement('div');
    col.id = 'obui-wraplab';
    col.style.cssText = 'position:fixed;top:40px;left:40px;width:360px;'
      + 'display:flex;flex-direction:column;gap:8px;padding:8px;'
      + 'z-index:80;background:var(--ob-bg-1);';
    col.innerHTML = '<div style="display:block"><button type="button" '
      + 'class="ob-btn" data-lab="pill">' + DE + '</button></div>'
      + '<button type="button" class="ob-btn ob-btn--row" data-lab="row" '
      + 'style="width:100%"><span class="ob-btn__label">' + DE + '</span></button>'
      + '<div data-lab="seg"><label><input type="radio" name="obui-w" checked>'
      + '<span>Off</span></label><label><input type="radio" name="obui-w">'
      + '<span>Standard</span></label><label><input type="radio" '
      + 'name="obui-w"><span>Full</span></label></div>'
      + '<select data-lab="sel"><option>' + DE + ' (Simonis 860)</option></select>'
      + '<select data-lab="sel1"><option>Alpha</option></select>'
      + '<div style="display:flex;width:120px"><span class="ob-badge" '
      + 'data-lab="badge">Balls · Streak · Score</span></div>'
      + '<div class="ob-strip"><button type="button" class="ob-strip__seg" '
      + 'data-lab="seg0">Play</button><button type="button" '
      + 'class="ob-strip__seg" aria-current="true">Practice</button></div>'
      // fix round 4 (visual audit r1 P2): a DEFAULT pill STRETCHED by a 254 px
      // flex column (the lab2 pose) + a select whose copy needs THREE lines
      + '<div data-lab="autocol" style="display:flex;flex-direction:column;width:254px">'
      + '<button type="button" class="ob-btn" data-lab="autorow">' + DE + '</button></div>'
      + '<select data-lab="sel3"><option>' + DE + ' (Simonis 860) – die Standard-Hilfestufe für Einsteiger</option></select>';
    document.body.appendChild(col);
    const q = (k) => col.querySelector('[data-lab="' + k + '"]');
    window.__ui.controls.upgradeSegmented(q('seg'));
    window.__ui.upgradeSelect(q('sel')); window.__ui.upgradeSelect(q('sel1')); window.__ui.upgradeSelect(q('sel3'));
    await raf2(); // the auto-row judge + the clamp title run a frame after layout
    const auto = q('autorow');
    const autoRow = { ...geo(auto), row: auto.classList.contains('ob-btn--row'), stamp: auto.getAttribute('data-ob-autorow') };
    q('autocol').style.width = '640px'; await raf2(); // the copy fits again → the pill returns
    const autoBack = { row: auto.classList.contains('ob-btn--row'), stamp: auto.getAttribute('data-ob-autorow'), lines: lines(auto), clip: auto.scrollWidth > auto.clientWidth + 1 };
    q('autocol').style.width = '254px'; auto.textContent = 'Kurz'; await raf2(); // short copy in the narrow column → pill
    const autoShort = { row: auto.classList.contains('ob-btn--row'), lines: lines(auto), clip: auto.scrollWidth > auto.clientWidth + 1 };
    const sel3Btn = q('sel3').nextElementSibling, sel3Lab = sel3Btn.querySelector('.ob-select__label');
    const sel3 = { ...geo(sel3Btn), label: geo(sel3Lab), labelClamped: sel3Lab.scrollHeight > sel3Lab.clientHeight + 1,
      visibleLines: Math.round(sel3Lab.getBoundingClientRect().height / parseFloat(getComputedStyle(sel3Lab).lineHeight)),
      title: sel3Btn.title, full: q('sel3').options[0].textContent, oy: getComputedStyle(sel3Lab).overflowY, ox: getComputedStyle(sel3Lab).overflowX };
    const segLabels = [...q('seg').querySelectorAll('label')].map(geo);
    const selBtn = q('sel').nextElementSibling, sel1Btn = q('sel1').nextElementSibling;
    let kitEllipsis = 0;
    for (const sheet of document.styleSheets) {
      if (!/ui\\/kit\\.css/.test(sheet.href || '')) continue;
      for (const r of sheet.cssRules) if (r.style && r.style.textOverflow === 'ellipsis') kitEllipsis++;
    }
    const out = { colW: col.clientWidth - 16, pill: geo(q('pill')), row: geo(q('row')),
      seg: geo(q('seg')), segLabels, sel: geo(selBtn),
      selLabel: geo(selBtn.querySelector('.ob-select__label')), sel1: geo(sel1Btn),
      badge: geo(q('badge')), strip: geo(q('seg0')), kitEllipsis, autoRow, autoBack, autoShort, sel3 };
    col.remove();
    return out;
  })()`);
  const W = wrapLab;
  check('wrap G5 (fix round 4): a default .ob-btn stretched past its one-line label changes POLE to --row (data-ob-autorow) — 2 lines, mid radius, nothing painted outside the box',
    W.autoRow.row && W.autoRow.stamp === '1' && W.autoRow.lines === 2 && W.autoRow.radius === 10 && !W.autoRow.clip && W.autoRow.ws === 'normal',
    JSON.stringify(W.autoRow));
  check('wrap G5 (fix round 4): the pill RETURNS when the copy fits — wider column / shorter copy (re-evaluated on resize + text change)',
    !W.autoBack.row && W.autoBack.stamp === null && W.autoBack.lines === 1 && !W.autoBack.clip
    && !W.autoShort.row && W.autoShort.lines === 1 && !W.autoShort.clip, JSON.stringify({ back: W.autoBack, short: W.autoShort }));
  check('wrap B-K21 (fix round 4): a select label that needs 3 lines paints exactly TWO whole lines — clamped (no ellipsis), full text on the trigger title',
    W.sel3.visibleLines === 2 && W.sel3.labelClamped && W.sel3.title === W.sel3.full && W.sel3.label.to !== 'ellipsis'
    && W.sel3.oy === 'clip' && W.sel3.ox === 'visible' && Math.abs(W.sel3.h - 56) <= 1.5, JSON.stringify(W.sel3));
  const padRatio = (g) => g.padL / g.h;
  check('wrap G5: default .ob-btn paints ONE line and grows (nowrap, centred, r >= h/2)',
    W.pill.lines === 1 && W.pill.ws === 'nowrap' && W.pill.jc === 'center'
    && W.pill.radius >= W.pill.h / 2 && !W.pill.clip, JSON.stringify(W.pill));
  check('wrap G6: default .ob-btn inline pad >= 0.4 h (derived --ob-pill-pad)',
    padRatio(W.pill) >= 0.4, JSON.stringify(W.pill));
  check('wrap G5: .ob-btn--row wraps to 2 lines at the mid pole (r 10, lh 1.35, start, >= 44)',
    W.row.lines === 2 && W.row.radius === 10 && W.row.lh === '18.9px'
    && (W.row.ta === 'start' || W.row.ta === 'left') && W.row.jc === 'flex-start'
    && W.row.h >= 44 && !W.row.clip, JSON.stringify(W.row));
  check('wrap G8: .ob-btn--row copy caps at 2 lines (3 = copy defect)',
    W.row.lines <= 2, JSON.stringify(W.row));
  const segW = W.segLabels.map((g) => g.w);
  check('wrap B-K03: segmented is INTRINSIC — narrower than its column, never stretched',
    W.seg.w < W.colW - 1, JSON.stringify({ seg: W.seg, colW: W.colW }));
  check('wrap B-K03: segments equal width = longest label + 2 x pad',
    Math.max(...segW) - Math.min(...segW) <= 1
    && Math.abs(W.segLabels[2].w - W.segLabels[1].w) <= 1, JSON.stringify(segW));
  check('wrap B-K03: segment labels never wrap (one line, nowrap at (0,2,1))',
    W.segLabels.every((g) => g.lines === 1 && g.ws === 'nowrap'),
    JSON.stringify(W.segLabels));
  check('wrap G6 / B-K11: segment pad >= 0.4 h on the COMPACT rung (h 28, pad 13.6; fix round 5 — 29 was off the ladder)',
    W.segLabels.every((g) => padRatio(g) >= 0.4 && Math.abs(g.h - 28) <= 0.5),
    JSON.stringify(W.segLabels));
  check('wrap B-K21: select label WRAPS to 2 lines, never ellipsizes or clips',
    W.selLabel.lines === 2 && W.selLabel.to !== 'ellipsis' && W.selLabel.ov !== 'hidden'
    && !W.selLabel.clip && W.selLabel.lh === '18.9px', JSON.stringify(W.selLabel));
  check('wrap B-K21: one-line select trigger sits on the control rung (40)',
    Math.abs(W.sel1.h - 40) <= 1 && W.sel.h > W.sel1.h, JSON.stringify({ sel: W.sel, sel1: W.sel1 }));
  check('wrap A8 (kit half): kit.css carries no text-overflow: ellipsis rule',
    W.kitEllipsis === 0, 'rules=' + W.kitEllipsis);
  check('wrap B-K21: .ob-badge is ONE line even when its flex row squeezes it',
    W.badge.lines === 1 && W.badge.ws === 'nowrap', JSON.stringify(W.badge));
  check('wrap G6: .ob-strip__seg inline pad >= 0.4 h (44 -> 17.6)',
    padRatio(W.strip) >= 0.399 && Math.abs(W.strip.h - 44) <= 1, JSON.stringify(W.strip));

  // J10. SELECTED / HOVER / FOCUS REGISTERS (GH-668 S5 kit step 3 — B-K09
  // glow rail-only (ruling R1), B-K15 hover ladder + guarded hovers, B-K06
  // focus composition / no inset / tabbable-only-if-overflow /
  // focus-on-present). STATIC half: the kit sheet's own CSSOM is walked —
  // every --ob-glass-glow rule is a .ob-strip--place rule, every :hover
  // rung sits under @media (hover: hover), no :focus-visible rule carries a
  // negative outline-offset, every selected rule that owns box-shadow has
  // its :focus-visible companion composing var(--ob-focus). LIVE half: a
  // fixed lab column, REAL pointer moves (Input domain) for the hover /
  // active rungs, scrollfade + dialog imported for the tab-stop and
  // present-focus laws. Red-proven on the step-2 bytes (kit.css v021).
  const regStatic = await chrome.eval(`(() => {
    const sheetOf = (name) => [...document.styleSheets]
      .find((s) => (s.href ?? '').includes(name));
    const walk = (rules, media, out) => {
      for (const r of rules) {
        if (r.type === CSSRule.MEDIA_RULE) walk(r.cssRules, media + '|' + r.conditionText, out);
        else if (r.type === CSSRule.STYLE_RULE) out.push({ sel: r.selectorText, media,
          bs: r.style.boxShadow, oo: r.style.outlineOffset });
        else if (r.cssRules) walk(r.cssRules, media, out);
      }
      return out;
    };
    const kit = walk(sheetOf('kit.css').cssRules, '', []);
    const pb = walk(sheetOf('playback.css')?.cssRules ?? [], '', []);
    const glow = kit.filter((r) => /glass-glow/.test(r.bs));
    const hoverUnguarded = (rs) => rs.filter((r) => /:hover/.test(r.sel)
      && !/hover: ?hover/.test(r.media)).map((r) => r.sel);
    const insetRings = kit.filter((r) => /:focus-visible/.test(r.sel)
      && /^-/.test(r.oo)).map((r) => r.sel);
    const selectedSel = /\\[aria-(current|selected|checked)="true"\\]|:has\\(input:checked\\)/;
    const missing = [];
    for (const r of kit) {
      if (!r.bs || !selectedSel.test(r.sel) || /:focus-visible/.test(r.sel)) continue;
      for (const s of r.sel.split(/,\\s*/)) {
        const want = s.trim() + ':focus-visible';
        const has = kit.some((k) => k.sel.split(/,\\s*/).some((x) => x.trim() === want
          || x.trim() === s.trim().replace(/:has\\(input:checked\\)$/, ':has(input:checked):has(input:focus-visible)'))
          && /focus/.test(k.bs));
        if (!has) missing.push(s.trim());
      }
    }
    return { glowCount: glow.length, glowSels: glow.map((r) => r.sel),
      kitHoverUnguarded: hoverUnguarded(kit), pbRowHoverUnguarded: hoverUnguarded(pb)
        .filter((s) => /\\.ob-pb-row:hover/.test(s)),
      insetRings, missing,
      hoverMedia: matchMedia('(hover: hover) and (pointer: fine)').matches };
  })()`);
  const RS = regStatic;
  check('registers B-K09: kit.css carries the glow on exactly the two .ob-strip--place rules',
    RS.glowCount === 2 && RS.glowSels.every((s) => s.includes('.ob-strip--place')),
    JSON.stringify(RS.glowSels));
  check('registers B-K15: every kit.css :hover rung sits under @media (hover: hover)',
    RS.kitHoverUnguarded.length === 0, JSON.stringify(RS.kitHoverUnguarded));
  check('registers B-K15: the row renderer hover (.ob-pb-row:hover) is guarded',
    RS.pbRowHoverUnguarded.length === 0, JSON.stringify(RS.pbRowHoverUnguarded));
  check('registers B-K06: no inset (negative outline-offset) :focus-visible ring in kit.css',
    RS.insetRings.length === 0, JSON.stringify(RS.insetRings));
  check('registers B-K06: every selected rule owning box-shadow ships its :focus-visible composition',
    RS.missing.length === 0, JSON.stringify(RS.missing));
  check('registers precondition: the desktop frame matches (hover: hover) and (pointer: fine)',
    RS.hoverMedia === true, String(RS.hoverMedia));
  const regLab = await chrome.eval(`(() => {
    const tok = (v) => { const d = document.createElement('div');
      d.style.cssText = 'position:fixed;left:-9999px;top:0;background:' + v;
      document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor;
      d.remove(); return c; };
    const col = document.createElement('div');
    col.id = 'ob-s5-reglab';
    col.style.cssText = 'position:fixed;left:16px;top:16px;width:360px;padding:8px;'
      + 'display:flex;flex-direction:column;gap:12px;z-index:2147483647;'
      + 'background:var(--ob-bg-1)';
    const strip = (tag, cls, key) => {
      const n = document.createElement(tag); n.className = cls;
      for (let i = 0; i < 2; i++) {
        const b = document.createElement('button'); b.type = 'button';
        b.className = 'ob-btn ob-strip__seg'; b.dataset.lab = key + i;
        b.setAttribute('aria-current', i === 0 ? 'true' : 'false');
        b.textContent = i === 0 ? 'Current' : 'Other'; n.appendChild(b);
      }
      return n;
    };
    col.append(strip('nav', 'ob-strip ob-strip--place', 'place'),
      strip('div', 'ob-strip', 'sec'));
    const prim = document.createElement('button'); prim.type = 'button';
    prim.className = 'ob-btn ob-btn--primary'; prim.dataset.lab = 'prim';
    prim.textContent = 'Primary'; prim.style.alignSelf = 'flex-start';
    const sel = document.createElement('button'); sel.type = 'button';
    sel.className = 'ob-select'; sel.dataset.lab = 'sel'; sel.textContent = 'Select';
    col.append(prim, sel);
    document.body.appendChild(col);
    window.__s5reg = { col, tok: { dim3: tok('var(--ob-accent-dim-3)'),
      line: tok('var(--ob-accent-line)'), ink: tok('var(--ob-accent-text)'),
      wash: tok('var(--ob-line-0)'), bg2: tok('var(--ob-bg-2)') } };
    // the element's own transitions finished (the --ob-t-fast tween a hover or
    // a press starts), bounded; the style read first starts any pending one
    window.__s5settle = async (key) => {
      const el = col.querySelector('[data-lab="' + key + '"]');
      void getComputedStyle(el).backgroundColor;
      const runs = typeof el.getAnimations === 'function' ? el.getAnimations() : [];
      await Promise.race([Promise.all(runs.map((a) => a.finished.catch(() => null))),
        new Promise((r) => setTimeout(r, 1500))]);
      return runs.length;
    };
    window.__s5read = (key) => {
      const el = col.querySelector('[data-lab="' + key + '"]');
      const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
      return { bg: cs.backgroundColor, border: cs.borderTopColor, color: cs.color,
        bs: cs.boxShadow, hover: el.matches(':hover'), active: el.matches(':active'),
        x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };
    const ink = (k) => getComputedStyle(col.querySelector('[data-lab="' + k + '"]')).color;
    return { tok: window.__s5reg.tok, place0: window.__s5read('place0'),
      place1: window.__s5read('place1'), sec0: window.__s5read('sec0'),
      sec1: window.__s5read('sec1'), prim: window.__s5read('prim'),
      sel: window.__s5read('sel'), inkSec0: ink('sec0') };
  })()`);
  const RL = regLab;
  check('registers B-K09: the PLACE rail current pill wears the glow (box-shadow present)',
    RL.place0.bs !== 'none' && RL.place1.bs === 'none', JSON.stringify([RL.place0.bs, RL.place1.bs]));
  check('registers B-K09 (G9): a secondary strip current pill = dim-3 fill + accent hairline + accent ink, NO glow',
    RL.sec0.bs === 'none' && RL.sec0.bg === RL.tok.dim3 && RL.sec0.border === RL.tok.line
    && RL.sec0.color === RL.tok.ink, JSON.stringify(RL.sec0));
  const hoverAt = async (key) => {
    const p = await chrome.eval(`window.__s5read(${JSON.stringify(key)})`);
    await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await new Promise((r) => setTimeout(r, 40)); // the hover lands, then its tween runs out (settle)
    await chrome.eval(`window.__s5settle(${JSON.stringify(key)})`);
    return chrome.eval(`window.__s5read(${JSON.stringify(key)})`);
  };
  const restPrim = RL.prim.bg;
  const hSec1 = await hoverAt('sec1');
  check('registers B-K15: a hovered NON-current strip pill takes the ivory wash (--ob-line-0), not an opaque slab',
    bk15WashHover(hSec1, RL.tok), JSON.stringify(hSec1));
  const hSec0 = await hoverAt('sec0');
  check('registers B-K09: the hovered CURRENT pill keeps the G9 fill (selection outranks hover)',
    bk09CurrentHover(hSec0, RL.tok), JSON.stringify(hSec0));
  const hPrim = await hoverAt('prim');
  check('registers B-K15: primary hover = dim-3 (a 20-point step up from the dim rest, never down)',
    bk15PrimaryHover(hPrim, restPrim, RL.tok), JSON.stringify([restPrim, hPrim]));
  await chrome.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hPrim.x, y: hPrim.y,
    button: 'left', clickCount: 1 });
  await new Promise((r) => setTimeout(r, 40)); // the press lands, then its tween runs out (settle)
  await chrome.eval(`window.__s5settle('prim')`);
  const aPrim = await chrome.eval(`window.__s5read('prim')`);
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hPrim.x, y: hPrim.y,
    button: 'left', clickCount: 1 });
  check('registers B-K15: primary :active = dim-3 + an INSET press shadow (one rung past hover)',
    bk15PrimaryActive(aPrim, RL.tok), JSON.stringify(aPrim));
  const hSel = await hoverAt('sel');
  check('registers B-K15: select hover = --ob-bg-2 fill (the hairline-only step was invisible)',
    bk15SelectHover(hSel, RL.tok), JSON.stringify(hSel));
  await chrome.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
  const regFocus = await chrome.eval(`(async () => {
    const col = window.__s5reg.col;
    const sf = await import('./app/ui/scrollfade.js');
    const dlg = await import('./app/ui/dialog.js');
    const mk = (h, withBtn, preset) => {
      const s = document.createElement('div');
      s.style.cssText = 'height:60px;overflow-y:auto;border:1px solid var(--ob-line-1)';
      if (preset != null) s.tabIndex = preset;
      const inner = document.createElement('div'); inner.style.height = h + 'px';
      inner.textContent = 'copy'; s.appendChild(inner);
      if (withBtn) { const b = document.createElement('button'); b.textContent = 'x'; s.appendChild(b); }
      col.appendChild(s); sf.attachScrollFade(s); s.__obScrollFade.sync();
      return s;
    };
    const tall = mk(200, false), fit = mk(20, false), tallBtn = mk(200, true), preset = mk(20, false, 0);
    const out = { tall: tall.getAttribute('tabindex'), fit: fit.getAttribute('tabindex'),
      tallBtn: tallBtn.getAttribute('tabindex'), preset: preset.getAttribute('tabindex') };
    fit.firstChild.style.height = '200px'; fit.__obScrollFade.sync();
    out.fitGrown = fit.getAttribute('tabindex');
    tall.__obScrollFade.detach(); out.detached = tall.hasAttribute('tabindex');
    // focus-on-present: a panel whose title carries data-ob-present-focus
    const opener = document.createElement('button'); opener.textContent = 'open';
    col.appendChild(opener); opener.focus();
    const panel = document.createElement('div'); panel.className = 'ob-panel';
    panel.style.cssText = 'position:fixed;left:400px;top:16px;width:240px;display:none';
    const h2 = document.createElement('h2'); h2.textContent = 'Title'; h2.dataset.obPresentFocus = '';
    const first = document.createElement('button'); first.textContent = 'first';
    panel.append(h2, first); document.body.appendChild(panel);
    await dlg.openPanel(panel, { backdrop: false, display: 'block' });
    out.presentIsTitle = document.activeElement === h2; out.titleTabindex = h2.getAttribute('tabindex');
    await dlg.closePanel(panel);
    out.returned = document.activeElement === opener;
    panel.remove(); col.remove(); delete window.__s5reg; delete window.__s5read; delete window.__s5settle;
    return out;
  })()`);
  const RF = regFocus;
  check('registers B-K06: a clipped scroller with no tabbable child is the tab stop (tabindex 0); a fitted one carries NO tabindex (a resting -1 read as a control to the GH-676 hold exemption)',
    RF.tall === '0' && RF.fit === null && RF.fitGrown === '0', JSON.stringify(RF));
  check('registers B-K06: a scroller with a tabbable child never adds a stop (no tabindex); a consumer-set tabindex is respected; detach clears',
    RF.tallBtn === null && RF.preset === '0' && RF.detached === false, JSON.stringify(RF));
  check('registers B-K06: openPanel lands focus on the data-ob-present-focus title (tabindex -1), close returns it to the opener',
    RF.presentIsTitle === true && RF.titleTabindex === '-1' && RF.returned === true, JSON.stringify(RF));

  // J11. SCROLL + FOLD LEAVES (GH-668 S5 kit step 4 — B-K04 inline-axis
  // scrollfade + mask on paint-less hosts + the peek helper; B-K18 control
  // box fold atoms + re-snap + the band law). A kit LAB on a fixed column:
  // inline / block scrollers with and without their own paint, a 13-card
  // rail under fitPeek, and three fold scrollers (button cards, div cards
  // with consumer atoms, plain divs). Red-proven on the step-3 bytes
  // (kit.css v022): no inline attributes, no mask classes, one-third bands
  // (24/8/20), no fitPeek, the fold landed between a button's two lines
  // (98), the port stayed on a stale offset after a re-label / lang flip.
  const sfLab = await chrome.eval(`(async () => {
    const sf = await import('./app/ui/scrollfade.js');
    const col = document.createElement('div'); col.id = 'ob-s5-sflab';
    col.style.cssText = 'position:fixed;left:16px;top:16px;width:400px;padding:8px;'
      + 'display:flex;flex-direction:column;gap:12px;z-index:2147483647;background:var(--ob-bg-1)';
    document.body.appendChild(col);
    const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const settled = () => new Promise((r) => setTimeout(r, 240)); // past the band's 120 ms opacity transition
    const mk = (css, n, w, opaque) => {
      const s = document.createElement('div');
      s.style.cssText = css + (opaque ? ';background:var(--ob-bg-2);border:1px solid var(--ob-line-1)' : '');
      for (let i = 0; i < n; i++) { const b = document.createElement('button'); b.type = 'button';
        b.className = 'ob-btn'; b.textContent = 'c' + i; b.style.cssText = 'flex:0 0 ' + w + 'px;width:' + w + 'px'; s.appendChild(b); }
      col.appendChild(s); return s;
    };
    const read = (el) => { const cs = getComputedStyle(el), a = getComputedStyle(el, '::after');
      return { start: el.dataset.obFadeStart ?? null, end: el.dataset.obFadeEnd ?? null,
        top: el.dataset.obFadeTop ?? null, bottom: el.dataset.obFadeBottom ?? null,
        maskX: el.classList.contains('ob-scrollfade--mask-x'), maskY: el.classList.contains('ob-scrollfade--mask-y'),
        inline: el.classList.contains('ob-scrollfade--inline'), mask: cs.maskImage || cs.webkitMaskImage || 'none',
        w: el.style.getPropertyValue('--sf-w'), h: el.style.getPropertyValue('--sf-h'),
        afterOp: a.opacity, afterW: a.width, afterH: a.height, cw: el.clientWidth, ch: el.clientHeight,
        ow: el.scrollWidth > el.clientWidth + 1 }; };
    const out = {};
    const row = mk('display:flex;gap:8px;overflow-x:auto;width:200px;scrollbar-width:none', 6, 60, false);
    sf.attachScrollFade(row); row.__obScrollFade.sync(); await settled(); out.rowRest = read(row);
    row.scrollLeft = 1e6; await raf(); row.__obScrollFade.sync(); await settled(); out.rowEnd = read(row);
    row.scrollLeft = 50; await raf(); row.__obScrollFade.sync(); await settled(); out.rowMid = read(row);
    const fit = mk('display:flex;gap:8px;overflow-x:auto;width:380px', 2, 60, false);
    sf.attachScrollFade(fit); fit.__obScrollFade.sync(); out.fit = read(fit);
    const strip = mk('display:flex;gap:8px;overflow-x:auto;width:200px;scrollbar-width:none', 6, 60, true);
    sf.attachScrollFade(strip); strip.__obScrollFade.sync(); await settled(); out.stripRest = read(strip);
    const blk = (h, opaque) => { const s = document.createElement('div');
      s.style.cssText = 'height:' + h + 'px;overflow-y:auto;width:200px;flex:0 0 auto'
        + (opaque ? ';background:var(--ob-bg-2);border:1px solid var(--ob-line-1)' : '');
      const inner = document.createElement('div'); inner.style.height = '600px'; inner.textContent = 'copy';
      s.appendChild(inner); col.appendChild(s); sf.attachScrollFade(s); s.__obScrollFade.sync(); return s; };
    const B105 = blk(105, false), B25 = blk(25, false), B60 = blk(60, false), B200 = blk(200, false), B105o = blk(105, true);
    await settled();
    out.b105 = read(B105); out.b25 = read(B25); out.b60 = read(B60); out.b200 = read(B200); out.b105o = read(B105o);
    out.band = typeof sf.bandHeight === 'function' ? [105, 25, 60, 200].map(sf.bandHeight) : null;
    if (typeof sf.fitPeek === 'function') {
      const rail = mk('display:flex;gap:0;overflow-x:auto;width:312px;scrollbar-width:none', 13, 0, false);
      for (const c of rail.children) c.style.cssText = 'flex:0 0 var(--sf-slot, 248px);width:var(--sf-slot, 248px)';
      const pk = sf.fitPeek(rail, { peek: 40 }); await raf(); pk.sync();
      out.peek = { slot: rail.style.getPropertyValue('--sf-slot'), peek: rail.style.getPropertyValue('--sf-peek'),
        w: rail.style.getPropertyValue('--sf-w'), k: rail.dataset.obRailK ?? null, n: rail.dataset.obRailN ?? null,
        cardW: rail.children[0].getBoundingClientRect().width, end: rail.dataset.obFadeEnd ?? null,
        maskHoldsPeek: parseFloat(rail.style.getPropertyValue('--sf-w')) >= 40 + 16 };
      rail.scrollLeft = 232 * 2; await raf(); pk.sync(); out.peek2 = { k: rail.dataset.obRailK ?? null, n: rail.dataset.obRailN ?? null };
      pk.detach(); await raf(); out.peekOff = { slot: rail.style.getPropertyValue('--sf-slot'), k: rail.dataset.obRailK ?? null,
        w: rail.style.getPropertyValue('--sf-w') };
    } else out.peek = null;
    window.__s5sf = { col };
    return out;
  })()`);
  const SF = sfLab;
  check('scroll B-K04: inline fade is truthful — end only at rest, start only at the end, both mid-pan, none when fitted',
    SF.rowRest.end === '1' && SF.rowRest.start === null && SF.rowEnd.start === '1' && SF.rowEnd.end === null
      && SF.rowMid.start === '1' && SF.rowMid.end === '1' && SF.fit.start === null && SF.fit.end === null,
    JSON.stringify({ rest: SF.rowRest, end: SF.rowEnd, mid: SF.rowMid, fit: SF.fit }));
  check('scroll B-K04: a paint-less inline scroller is MASKED (mask-image gradient on the scroller, no painted band); a fitted one carries no mask',
    SF.rowRest.maskX === true && /linear-gradient/.test(SF.rowRest.mask) && parseFloat(SF.rowRest.afterOp) < 0.1
      && SF.rowRest.inline === false && SF.fit.mask === 'none',
    JSON.stringify({ rest: SF.rowRest, fit: SF.fit }));
  check('scroll B-K04: an inline scroller that owns paint (bordered strip) paints start / end BANDS at --sf-w = min(48, 20 %) and no mask',
    SF.stripRest.inline === true && SF.stripRest.maskX === false && SF.stripRest.end === '1' && parseFloat(SF.stripRest.afterOp) > 0.9
      && SF.stripRest.mask === 'none' && Math.abs(parseFloat(SF.stripRest.afterW) - Math.max(4, Math.min(48, Math.floor(SF.stripRest.cw / 5)))) < 0.5
      && Math.abs(parseFloat(SF.stripRest.afterH) - SF.stripRest.ch) < 1,
    JSON.stringify(SF.stripRest));
  check('scroll B-K18: block band = min(24, 20 % of the clip, (clip − one row) / 2), floor 4 — 105→21, 25→4, 60→12, 200→24 (leaf + kit agree)',
    SF.b105.h === '21px' && SF.b25.h === '4px' && SF.b60.h === '12px' && SF.b200.h === '24px'
      && JSON.stringify(SF.band) === '[21,4,12,24]',
    JSON.stringify({ h: [SF.b105.h, SF.b25.h, SF.b60.h, SF.b200.h], band: SF.band }));
  check('scroll B-K04: a paint-less block scroller is masked on the block axis (band opacity 0); one that owns paint keeps the --sf-h band',
    SF.b105.maskY === true && SF.b105.bottom === '1' && /linear-gradient/.test(SF.b105.mask) && parseFloat(SF.b105.afterOp) < 0.1
      && SF.b105o.maskY === false && SF.b105o.bottom === '1' && parseFloat(SF.b105o.afterOp) > 0.9 && SF.b105o.mask === 'none'
      && SF.b105o.afterH === SF.b105o.h // the bordered box clips 103 → the band law gives 20 (the band paints at --sf-h)
      && parseInt(SF.b105o.h, 10) === Math.max(4, Math.min(24, Math.floor(SF.b105o.ch / 5), Math.floor((SF.b105o.ch - 20) / 2))),
    JSON.stringify({ glass: SF.b105, opaque: SF.b105o }));
  check('scroll B-K04: fitPeek — slot = cap − 2·peek (312 → 232), band locked at peek + 16 (56), k / N published and tracking the centre card; detach restores the 20 % band',
    !!SF.peek && SF.peek.slot === '232px' && SF.peek.peek === '40px' && SF.peek.w === '56px' && SF.peek.maskHoldsPeek === true
      && Math.abs(SF.peek.cardW - 232) < 0.5 && SF.peek.k === '1' && SF.peek.n === '13' && SF.peek.end === '1'
      && SF.peek2.k === '3' && SF.peek2.n === '13' && SF.peekOff.slot === '' && SF.peekOff.k === null && SF.peekOff.w === '48px',
    JSON.stringify({ peek: SF.peek, peek2: SF.peek2, off: SF.peekOff }));
  const sfStatic = await chrome.eval(`(() => {
    const sheet = [...document.styleSheets].find((s) => (s.href ?? '').includes('kit.css'));
    const out = { maskRules: 0, maskImageRules: 0, rtMaskOff: false, rtBands: false, inlineBands: 0 };
    const walk = (rules, media) => { for (const r of rules) {
      if (r.type === CSSRule.MEDIA_RULE) { walk(r.cssRules, media + '|' + r.conditionText); continue; }
      if (r.type !== CSSRule.STYLE_RULE) { if (r.cssRules) walk(r.cssRules, media); continue; }
      const sel = r.selectorText, mi = r.style.getPropertyValue('mask-image') || r.style.getPropertyValue('-webkit-mask-image');
      if (/ob-scrollfade--mask-[xy]/.test(sel)) { out.maskRules++; if (mi && !/reduced-transparency/.test(media)) out.maskImageRules++;
        if (/reduced-transparency/.test(media) && mi === 'none') out.rtMaskOff = true; }
      if (/ob-scrollfade--inline::(before|after)/.test(sel)) { out.inlineBands++; if (/reduced-transparency/.test(media) && r.style.width === '1px') out.rtBands = true; }
    } };
    walk(sheet.cssRules, '');
    return out;
  })()`);
  check('scroll B-K04: kit.css owns the paint modes — per-axis mask rules keyed on the fade attributes, inline band pair, reduced-transparency arm (masks off, 1 px hairlines)',
    sfStatic.maskRules >= 8 && sfStatic.maskImageRules >= 1 && sfStatic.rtMaskOff === true && sfStatic.inlineBands >= 3 && sfStatic.rtBands === true,
    JSON.stringify(sfStatic));
  // C3 (GH-668 review r2 P2, fix round 5 — the pseudo-axis law): under
  // prefers-reduced-transparency the MASK-X-ONLY row (paint-less inline
  // scroller, mid-pan: start + end flags, no block flag) drops its mask and
  // paints 1 px start / end HAIRLINES spanning its height — the same
  // restoration the block panes always had. Red on the pre-fix bytes: the
  // pair stayed block-oriented at opacity 0 (clipped content, no cue).
  await chrome.send('Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  await sleep(320);
  const rtX = await chrome.eval(`(() => { const col = window.__s5sf.col; const row = col.children[0]; row.__obScrollFade.sync();
    const cs = getComputedStyle(row), a = getComputedStyle(row, '::after'), b = getComputedStyle(row, '::before');
    return { rt: matchMedia('(prefers-reduced-transparency: reduce)').matches, mask: cs.maskImage || cs.webkitMaskImage || 'none',
      start: row.dataset.obFadeStart ?? null, end: row.dataset.obFadeEnd ?? null, top: row.dataset.obFadeTop ?? null, bottom: row.dataset.obFadeBottom ?? null,
      inline: row.classList.contains('ob-scrollfade--inline'), maskX: row.classList.contains('ob-scrollfade--mask-x'),
      afterOp: a.opacity, afterW: a.width, afterH: a.height, beforeOp: b.opacity, beforeW: b.width, ch: row.clientHeight, scrollLeft: row.scrollLeft }; })()`);
  await chrome.send('Emulation.setEmulatedMedia', { features: [] });
  await sleep(200);
  check('scroll C3 (review r2): reduced transparency — a mask-x-only inline scroller loses its mask and paints 1 px start / end hairlines spanning its height (axis-aware restoration)',
    rtX.rt === true && rtX.mask === 'none' && rtX.maskX === true && rtX.inline === false && rtX.start === '1' && rtX.end === '1' && rtX.top === null && rtX.bottom === null
      && parseFloat(rtX.afterOp) > 0.9 && rtX.afterW === '1px' && Math.abs(parseFloat(rtX.afterH) - rtX.ch) < 1.5
      && parseFloat(rtX.beforeOp) > 0.9 && rtX.beforeW === '1px',
    JSON.stringify(rtX));
  // C2 (GH-668 review r2 P2, fix round 5 — the ring over a mask): the
  // paint-less block pane B105 is the tab stop (tabindex 0, no tabbable
  // child); a REAL Tab lands on it, and the ring must be VISIBLE in pixels
  // — the mask lifts while the pane wears the ring and the bottom band
  // paints. Judged as a before / after pixel diff over the 2 px ring band
  // OUTSIDE the border box (right + bottom edges; the lab column's own
  // ground behind both). Red on the pre-fix bytes: the mask clipped the
  // outer shadow to the border box — zero ring pixels.
  const ringPre = await chrome.eval(`(() => { const col = window.__s5sf.col; const pane = col.children[3];
    const pre = document.createElement('button'); pre.type = 'button'; pre.textContent = 'pre';
    pre.style.cssText = 'position:absolute;left:0;top:0;width:2px;height:2px;opacity:0.01;padding:0;border:0';
    pane.before(pre); window.__s5ring = { pane, pre }; pre.focus();
    const r = pane.getBoundingClientRect();
    return { tab: pane.getAttribute('tabindex'), bottom: pane.dataset.obFadeBottom ?? null, maskY: pane.classList.contains('ob-scrollfade--mask-y'),
      rect: { x: r.left, y: r.top, w: r.width, h: r.height }, dpr: devicePixelRatio, preFocused: document.activeElement === pre }; })()`);
  const ringShot = async () => decodePng(Buffer.from((await chrome.send('Page.captureScreenshot',
    { format: 'png', clip: { x: 0, y: 0, width: 640, height: 480, scale: 1 / (ringPre.dpr || 1) } })).data, 'base64'));
  const bandDiff = (a, b, R) => { // mean |Δ| over the 2 px band outside the right + bottom edges
    const px = (img, x, y) => { const i = (Math.round(y) * img.w + Math.round(x)) * img.bpp; return [img.px[i], img.px[i + 1], img.px[i + 2]]; }; // kit-laws decodePng: { w, h, bpp, px }
    let sum = 0, n = 0;
    const add = (x, y) => { if (x < 0 || y < 0 || x >= a.w || y >= a.h) return; const p = px(a, x, y), q = px(b, x, y); sum += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]); n++; };
    for (let y = R.y + 4; y < R.y + R.h - 4; y++) for (let dx = 2; dx < 4; dx++) add(R.x + R.w + dx, y);
    for (let x = R.x + 4; x < R.x + R.w - 4; x++) for (let dy = 2; dy < 4; dy++) add(x, R.y + R.h + dy);
    return n ? sum / n : 0; };
  const shotA = await ringShot();
  await pressKey('Tab', 'Tab', 9);
  await sleep(320);
  const ringOn = await chrome.eval(`(() => { const { pane } = window.__s5ring; const cs = getComputedStyle(pane), a = getComputedStyle(pane, '::after');
    return { focused: document.activeElement === pane, fv: pane.matches(':focus-visible'), mask: cs.maskImage || cs.webkitMaskImage || 'none',
      shadow: cs.boxShadow, afterOp: a.opacity, bottom: pane.dataset.obFadeBottom ?? null }; })()`);
  const shotB = await ringShot();
  const ringDiff = bandDiff(shotA, shotB, ringPre.rect);
  await chrome.eval(`(() => { const { pane, pre } = window.__s5ring; pane.blur(); pre.remove(); delete window.__s5ring; return true; })()`);
  check('scroll C2 (review r2): a masked paint-less pane that is the tab stop shows the kit ring in PIXELS — a real Tab focuses it (:focus-visible), the mask lifts, the bottom band paints, the 2 px ring band outside the border box changes (mean |Δ| > 24)',
    ringPre.tab === '0' && ringPre.maskY === true && ringPre.bottom === '1' && ringPre.preFocused === true
      && ringOn.focused === true && ringOn.fv === true && ringOn.mask === 'none' && ringOn.shadow !== 'none' && parseFloat(ringOn.afterOp) > 0.9 && ringDiff > 24,
    JSON.stringify({ pre: ringPre, on: ringOn, ringDiff: Number(ringDiff.toFixed(1)) }));
  // V-P1 (GH-668 visual audit r2 P1, fix round 5 — THE FIT-AWARE PAD): a kit
  // strip (ui/strip.js) narrower than its content writes --strip-pad =
  // clamp(12, (clip − Σ label) / (2 n), 0.4 h); a strip that fits keeps the
  // 0.4 h default (no property). Three widths: NARROW (floor 12, still
  // pans), MID (the fit pad between 12 and 17.6 — the content fits exactly),
  // WIDE (property cleared, 17.6). Red on the pre-fix bytes: 17.6 at every
  // width (no property, the narrow strip hides 11.2 px more label a side).
  const fitLab = await chrome.eval(`(async () => {
    const st = await import('./app/ui/strip.js'); if (typeof st.createStrip !== 'function') return { err: 'stale strip.js' };
    const col = window.__s5sf.col;
    const mount = document.createElement('div'); mount.style.cssText = 'width:300px;flex:0 0 auto'; col.appendChild(mount);
    const segs = ['Beleuchtungsstation', 'Tischoberfläche', 'Spielbälle'].map((l, i) => ({ id: 's' + i, labelKey: 'lab.s' + i, label: () => l }));
    const api = st.createStrip(mount, segs, () => {}, { dataKey: 'labfit' });
    const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await raf(); await raf();
    const geo = () => { const b = [...mount.querySelectorAll('.ob-strip__seg')]; const ms = getComputedStyle(mount);
      const labels = b.reduce((a, x) => a + x.firstElementChild.getBoundingClientRect().width + 2, 0);
      const gap = parseFloat(ms.columnGap) || 0, padX = parseFloat(ms.paddingLeft) + parseFloat(ms.paddingRight);
      return { b, labels, gap, padX }; };
    const read = () => { const { b, labels, gap, padX } = geo(); const cs = getComputedStyle(b[0]);
      const free = mount.clientWidth - padX - gap * (b.length - 1) - labels;
      return { prop: mount.style.getPropertyValue('--strip-pad'), padL: parseFloat(cs.paddingLeft), padR: parseFloat(cs.paddingRight),
        h: b[0].getBoundingClientRect().height, minH: parseFloat(cs.minHeight), fit: free / (2 * b.length),
        over: mount.scrollWidth - mount.clientWidth, cw: mount.clientWidth, n: b.length }; };
    const out = { narrow: read() };
    const g = geo(); mount.style.width = Math.round(g.labels + g.gap * 2 + g.padX + 2 * 3 * 14 + 2) + 'px'; await raf(); await raf(); out.mid = read();
    mount.style.width = '900px'; await raf(); await raf(); out.wide = read();
    api.refresh(); await raf(); out.wideRefreshed = read();
    mount.remove();
    return out; })()`);
  const FL = fitLab;
  check('strip V-P1: a NARROW kit strip (content wider than the clip) pads its segments at the 12 px floor (--strip-pad on the mount) and still pans — never the 0.4 h pad that hid more label than S4',
    !FL.err && FL.narrow.prop !== '' && Math.abs(FL.narrow.padL - 12) <= 0.06 && Math.abs(FL.narrow.padR - 12) <= 0.06 && FL.narrow.over > 1 && FL.narrow.fit < 12,
    JSON.stringify(FL.narrow ?? FL));
  check('strip V-P1: at a MID width the pad is the fit value (12 < pad < 0.4 h) and the content fits the clip exactly',
    !FL.err && FL.mid.prop !== '' && FL.mid.padL > 12.5 && FL.mid.padL < 0.4 * FL.mid.minH - 0.5 && Math.abs(FL.mid.padL - FL.mid.fit) <= 0.6 && Math.abs(FL.mid.over) <= 1,
    JSON.stringify(FL.mid ?? FL));
  check('strip V-P1: a WIDE strip clears the property and keeps the derived 0.4 h pad (17.6 on 44), through a refresh() too',
    !FL.err && FL.wide.prop === '' && Math.abs(FL.wide.padL - 0.4 * FL.wide.minH) <= 0.06 && FL.wideRefreshed.prop === '' && Math.abs(FL.wideRefreshed.padL - 0.4 * FL.wide.minH) <= 0.06,
    JSON.stringify({ wide: FL.wide, refreshed: FL.wideRefreshed }));
  const fsLab = await chrome.eval(`(async () => {
    const fs = await import('./app/ui/foldsnap.js');
    const col = window.__s5sf.col;
    const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const quiet = () => new Promise((r) => setTimeout(r, 280)); // past the leaf's live-scroll quiet window
    // budget 160: the control law folds at the third card's top (136 = two whole cards; clean window 88 ≥ the
    // 60 px cards, so the FIT RULE's fixed point keeps them atoms); the line law lands inside the third card
    const mkFold = (tag, extra) => {
      const host = document.createElement('div'); host.style.cssText = 'max-height:160px;display:flex;flex-direction:column;width:300px;flex:0 0 auto';
      const s = document.createElement('div'); s.className = 'lab-fold';
      s.style.cssText = 'overflow-y:auto;min-height:0;max-height:var(--fs-h, none);padding-bottom:var(--fs-pad, 0px);display:flex;flex-direction:column;gap:8px';
      for (let i = 0; i < 4; i++) { const c = document.createElement(tag); if (tag === 'button') c.type = 'button';
        c.className = 'lab-card'; c.style.cssText = 'display:block;flex:0 0 auto;height:60px;box-sizing:border-box;padding:10px;margin:0;border:0;'
          + 'background:var(--ob-bg-2);color:var(--ob-text-0);font:14px/20px var(--ob-font);text-align:left;width:100%;border-radius:0';
        c.innerHTML = '<div style="height:20px">line a' + i + '</div><div style="height:20px">line b' + i + '</div>'; s.appendChild(c); }
      host.appendChild(s); col.appendChild(host);
      return { s, host, h: fs.attachFoldSnap(s, Object.assign({ host }, extra || {})) };
    };
    const out = { atoms: typeof fs.DEFAULT_ATOMS === 'string' ? fs.DEFAULT_ATOMS : null };
    const A = mkFold('button'); const B = mkFold('div', { atoms: '.lab-card, ' + fs.DEFAULT_ATOMS }); const C = mkFold('div');
    await raf(); await raf();
    const st = (L) => ({ fsH: L.s.style.getPropertyValue('--fs-h'), H: L.s.clientHeight, stops: L.h.stops() });
    out.btn = st(A); out.card = st(B); out.plain = st(C);
    // the CONTROL-LAW FLOOR: a 30 px header + one 200 px button (rows every 20 px) in a 100 px budget —
    // the control law's only clean boundary above the header is the button's top (30 < 50 % of 100),
    // so the line law stands and the window is not collapsed to the header
    const D = (() => {
      const host = document.createElement('div'); host.style.cssText = 'max-height:100px;display:flex;flex-direction:column;width:300px;flex:0 0 auto';
      const s = document.createElement('div'); s.className = 'lab-fold';
      s.style.cssText = 'overflow-y:auto;min-height:0;max-height:var(--fs-h, none);padding-bottom:var(--fs-pad, 0px);display:flex;flex-direction:column;gap:0';
      const hd = document.createElement('div'); hd.style.cssText = 'height:30px;flex:0 0 auto;box-sizing:border-box;padding:5px 0;font:14px/20px var(--ob-font)'; hd.textContent = 'header'; s.appendChild(hd);
      const b = document.createElement('button'); b.type = 'button';
      b.style.cssText = 'display:block;flex:0 0 auto;height:200px;box-sizing:border-box;padding:0;margin:0;border:0;width:100%;text-align:left;font:14px/20px var(--ob-font);color:var(--ob-text-0);background:var(--ob-bg-2);border-radius:0';
      for (let i = 0; i < 10; i++) { const l = document.createElement('div'); l.style.height = '20px'; l.textContent = 'row ' + i; b.appendChild(l); }
      s.appendChild(b); host.appendChild(s); col.appendChild(host);
      return { s, host, h: fs.attachFoldSnap(s, { host }) };
    })();
    await raf(); await raf();
    out.floor = { fsH: D.s.style.getPropertyValue('--fs-h'), H: D.s.clientHeight, atoms: D.h.atoms ?? null, stops: D.h.stops(),
      atomsMax: D.h.atomsMax ?? null, capD: fs.cleanWindow?.(D.s.clientHeight) ?? null,
      btnAtoms: A.h.atoms ?? null, btnMax: A.h.atomsMax ?? null, capA: fs.cleanWindow?.(A.s.clientHeight) ?? null };
    out.lockstep = typeof fs.cleanWindow === 'function' ? [105, 25, 60, 200].map(fs.cleanWindow) : null;
    // re-snap after a re-label: rest on the first interior stop, then card 1 grows (a longer locale)
    const s1 = out.card.stops.find((v) => v > 0.5) ?? 0;
    B.s.scrollTo({ top: s1, behavior: 'instant' }); await raf(); await quiet();
    out.before = { top: B.s.scrollTop, s1 };
    B.s.children[0].firstChild.style.height = '40px'; B.s.children[0].style.height = '80px';
    await raf(); await raf(); await quiet(); await raf();
    const stops1 = B.h.stops();
    out.after = { top: B.s.scrollTop, stops: stops1, onStop: stops1.some((v) => Math.abs(v - B.s.scrollTop) <= 0.5),
      moved: Math.abs(B.s.scrollTop - s1) > 0.5, fsH: B.s.style.getPropertyValue('--fs-h') };
    // the <html lang> broadcast: a lang-keyed GAP change moves every card edge with no mutation inside
    // the scroller and no block resize — only the lang observer can hear it
    // rest on the second card's top (68); the gap change (8 → 20) moves that edge to 80 and the fold to the budget
    const sA = out.btn.stops.find((v) => Math.abs(v - 68) < 1) ?? out.btn.stops[1] ?? 0;
    A.s.scrollTo({ top: sA, behavior: 'instant' }); await raf(); await quiet();
    const style = document.createElement('style'); style.textContent = 'html[lang="xx-lab"] .lab-fold { gap: 20px !important }';
    document.head.appendChild(style);
    const lang0 = document.documentElement.getAttribute('lang');
    document.documentElement.setAttribute('lang', 'xx-lab');
    await raf(); await raf(); await quiet(); await raf();
    const stops2 = A.h.stops();
    out.lang = { from: sA, top: A.s.scrollTop, stops: stops2, onStop: stops2.some((v) => Math.abs(v - A.s.scrollTop) <= 0.5),
      moved: Math.abs(A.s.scrollTop - sA) > 0.5, fsH: A.s.style.getPropertyValue('--fs-h'), H: A.s.clientHeight };
    if (lang0 == null) document.documentElement.removeAttribute('lang'); else document.documentElement.setAttribute('lang', lang0);
    style.remove();
    A.h.detach(); B.h.detach(); C.h.detach(); D.h.detach(); col.remove(); delete window.__s5sf;
    return out;
  })()`);
  const FS = fsLab;
  check('fold B-K18: control boxes are atoms — the fold lands on the card gap (136 px = two whole cards) of a button column, never between a button’s two lines',
    /^136(\.00)?px$/.test(FS.btn.fsH) && FS.btn.H === 136 && typeof FS.atoms === 'string' && /role="radio"/.test(FS.atoms) && /button/.test(FS.atoms),
    JSON.stringify({ btn: FS.btn, atoms: FS.atoms }));
  check('fold B-K18: consumer-named card atoms land on the gap too (136); a div column that names no atoms still folds between the third card\'s text lines (inside 136..196) — the finding, kept as the guard that the atoms do it',
    /^136(\.00)?px$/.test(FS.card.fsH) && FS.card.H === 136 && parseFloat(FS.plain.fsH) > 136.5 && parseFloat(FS.plain.fsH) < 195.5 && FS.plain.H > 136 && FS.plain.H < 196,
    JSON.stringify({ card: FS.card, plain: FS.plain }));
  check('fold B-K18: re-snap — after a re-label grows a card the port leaves its stale offset for a stop of the NEW set',
    FS.before.top === FS.before.s1 && FS.before.s1 > 0 && FS.after.onStop === true && FS.after.moved === true,
    JSON.stringify({ before: FS.before, after: FS.after }));
  check('fold B-K18: re-snap on the <html lang> broadcast — a lang-keyed layout change with no mutation inside the scroller re-derives the fold (136 → the clean 160 budget) and re-settles the port on the new set',
    FS.lang.from > 0 && FS.lang.H === 160 && FS.lang.onStop === true && FS.lang.moved === true,
    JSON.stringify(FS.lang));
  check('fold B-K18: the FIT RULE — a 200 px button in a 100 px budget (clean window 60) is judged by its lines, the window stays > 50 % of the budget instead of collapsing to the 30 px header; 60 px button cards fit the cap and stay atoms',
    FS.floor.H > 50 && FS.floor.H < 100 && FS.floor.atomsMax === FS.floor.capD && FS.floor.btnMax === FS.floor.capA && FS.floor.capA >= 60
      && typeof FS.floor.btnAtoms === 'string' && /button/.test(FS.floor.btnAtoms),
    JSON.stringify(FS.floor));
  check('fold B-K18: foldsnap.cleanWindow() and scrollfade.bandHeight() stay in lockstep (clip − 2 × band for 105 / 25 / 60 / 200)',
    Array.isArray(FS.lockstep) && Array.isArray(SF.band) && FS.lockstep.every((v, i) => v === [105, 25, 60, 200][i] - 2 * SF.band[i]),
    JSON.stringify({ lockstep: FS.lockstep, band: SF.band }));
  { // GH-1168: a press on the port stops a settle already running (the leaf's law, never settle under a finger, used to
    // hold only when a settle started), and the lift lands it — a lab fold's 800 ms stretched settle, pressed 120 ms in
    const { FOLD_PRESS_LAB, judgeFoldPress } = await import('./foldsnap-press-lab.mjs');
    for (const [name, ok, detail] of judgeFoldPress(await chrome.eval(FOLD_PRESS_LAB))) check(name, ok, detail);
  }

  // K. LIVE game-switch confirm flow through the PLAY CARD (re-cut by
  // feature 034 / 525 S4a-mig — the game select left the settings modal):
  // a real click on a rail card without skipConfirm raises the KIT confirm
  // (window.confirm is gone from this path); decline keeps the current
  // card + the shell open, accept re-racks the new game and EXITS the shell
  // (the D14 place analog). window.confirm is STUBBED with a counter for
  // the K/K2/K3 live flows — the kit dialog must carry ALL THREE §4 call
  // sites natively (count asserted 0 below; spec 015 US1 zero-native sweep).
  await chrome.eval(`(() => {
    window.__nativeConfirms = 0;
    window.confirm = () => { window.__nativeConfirms++; return false; };
  })()`);
  const waitConfirm = `(async () => {
    const t0 = performance.now();
    let el = null;
    while (!el && performance.now() - t0 < 6000) {
      el = document.querySelector('[data-ob="confirm"]');
      if (!el) await new Promise((r) => setTimeout(r, 40));
    }
    return el ? el.querySelector('.ob-confirm__body').textContent : null;
  })()`;
  const { h, up: playUp } = await hopToPlay('k034');
  check('game-switch: obshell hop opens the shell at the play card', playUp);
  // NB: J6 above declares a function-scoped `mouseClick` closure (the HUD
  // toggle point, no arguments) that SHADOWS the module helper for the rest
  // of runBehavior — the card click goes straight to the Input domain
  const clickAt = async (pt) => {
    for (const type of ['mousePressed', 'mouseReleased']) {
      await h.send('Input.dispatchMouseEvent',
        { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    }
  };
  await h.eval(`(() => {
    window.__nativeConfirms = 0;
    window.confirm = () => { window.__nativeConfirms++; return false; };
  })()`);
  // the e2e-play clickEl idiom: measure the LIVE rect, never scrollIntoView
  // first (the rail's smooth horizontal scroll and the fold-snap scroller
  // would move the card after the measurement and the click lands off it)
  // …and aim at the VISIBLE part of the card: the rail (`[data-ob="play-
  // games"]`, overflow-x) and the FR-003 body scroller (`[data-ob="play-
  // body"]`, fold-snap clipped) can both cut a card at this viewport, so
  // its geometric centre may sit under a clip edge (elementFromPoint then
  // answers the section). Pan the rail INSTANTLY (scrollLeft — never the
  // leaf's smooth scrollIntoView) to centre the card, settle, then click
  // the centre of card ∩ rail ∩ body and require the hit-test to land inside
  // the card.
  const cardPt = async (id) => {
    await h.eval(`(() => {
      const el = document.querySelector('[data-ob="play-game"][data-game="${id}"]');
      const rail = document.querySelector('[data-ob="play-games"]');
      if (!el || !rail) return false;
      const r = el.getBoundingClientRect(), rr = rail.getBoundingClientRect();
      rail.scrollLeft += (r.left + r.width / 2) - (rr.left + rr.width / 2);
      return true; })()`);
    await sleep(400);
    return h.eval(`(() => {
      const el = document.querySelector('[data-ob="play-game"][data-game="${id}"]');
      if (!el || el.hidden) return null;
      let box = el.getBoundingClientRect();
      for (const sel of ['[data-ob="play-games"]', '[data-ob="play-body"]']) {
        const b = document.querySelector(sel)?.getBoundingClientRect();
        if (!b) continue;
        box = { left: Math.max(box.left, b.left), right: Math.min(box.right, b.right),
          top: Math.max(box.top, b.top), bottom: Math.min(box.bottom, b.bottom) };
      }
      if (box.right - box.left < 8 || box.bottom - box.top < 8) return null;
      const x = (box.left + box.right) / 2, y = (box.top + box.bottom) / 2;
      const hit = document.elementFromPoint(x, y);
      return hit && el.contains(hit) ? { x, y } : null; })()`);
  };
  const p1 = await cardPt('eight_ball');
  check('game-switch: the eight_ball card is on screen for a real click', !!p1, JSON.stringify(p1));
  // one-shot event witnesses on the card (diagnostic register for the
  // failure line: which pointer/click events the real click delivered)
  await h.eval(`(() => { window.__kEv = []; const el = document.querySelector('[data-ob="play-game"][data-game="eight_ball"]');
    for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) {
      el.addEventListener(t, (e) => window.__kEv.push(t + ':' + e.isTrusted + ':' + (e.defaultPrevented ? 'prevented' : 'ok')), { once: true, capture: true });
    } return true; })()`);
  if (p1) await clickAt(p1);
  const cfmBody = await h.eval(waitConfirm);
  check('game-switch: kit confirm opens with the i18n re-rack body',
    cfmBody === 'Switching games re-racks the table. Continue?',
    JSON.stringify(cfmBody) + ' events=' + JSON.stringify(await h.eval('window.__kEv'))
    + ' state=' + JSON.stringify(await h.eval(`({ moving: window.__shell.moving(), st: window.__shell.state?.() ?? null,
      note: document.getElementById('ob-shell-note')?.textContent ?? null, active: document.activeElement?.dataset?.game ?? document.activeElement?.tagName,
      touch: document.documentElement.classList.contains('ob-touch'), vw: innerWidth, vh: innerHeight,
      cur: window.__play.registry().games.find((g) => g.current)?.id ?? null })`)));
  await h.eval(
    `document.querySelector('[data-ob="confirm-cancel"]')?.click()`);
  await sleep(600); // decline path: changeGame resolves false -> the card stays
  const declined = await h.eval(`({
    game: window.__settings.get().game,
    cur: document.querySelector('[data-ob="play-games"] [aria-current="true"]')?.dataset.game ?? null,
    shellOpen: window.__shell.isOpen(), place: window.__shell.place(),
    residue: document.querySelectorAll('[data-ob="confirm"]').length })`);
  check('game-switch: decline keeps nine_ball current + the shell open at play',
    declined.game === 'nine_ball' && declined.cur === 'nine_ball'
    && declined.shellOpen === true && declined.place === 'play'
    && declined.residue === 0, JSON.stringify(declined));
  const p2 = await cardPt('eight_ball');
  if (p2) await clickAt(p2);
  if (await h.eval(waitConfirm) === null) fail('game-switch: second confirm never opened');
  await h.eval(
    `document.querySelector('[data-ob="confirm-accept"]')?.click()`);
  let switched = null;
  for (let i = 0; i < 50; i++) {
    await sleep(200);
    switched = await h.eval(`({ game: window.__settings.get().game,
      balls: window.__test.balls().length })`);
    if (switched.game === 'eight_ball' && switched.balls === 16) break;
  }
  check('game-switch: accept re-racks the 16-ball eight_ball table',
    switched.game === 'eight_ball' && switched.balls === 16,
    JSON.stringify(switched));
  // the D14 place analog (034 FR-006): the ACCEPTED pick exits the shell to
  // the fresh rack; assert it, restore nine_ball, then open the settings
  // modal so K2/K3 keep driving an OPEN modal exactly as before
  let kGone = false;
  for (let i = 0; i < 50 && !kGone; i++) {
    kGone = await h.eval(`window.__shell.isOpen() === false`);
    if (!kGone) await sleep(200);
  }
  check('game-switch: accept EXITS the shell to the table (D14 place analog)', kGone);
  check('game-switch: zero native confirms on the play-card flow',
    await h.eval('window.__nativeConfirms') === 0);
  await h.eval(
    `__settings.changeGame('nine_ball', { skipConfirm: true })`);
  await sleep(600); // restore for the checks below
  await hopBack(h, (errs) => check('game-switch: zero app-captured / console errors on the play hop',
    errs.length === 0, JSON.stringify(errs.slice(0, 3)))); // K2/K3 keep driving the OPEN modal on the untouched main page
  await chrome.eval(`(() => {
    window.__nativeConfirms = 0;
    window.confirm = () => { window.__nativeConfirms++; return false; };
  })()`);
  await chrome.eval(`document.getElementById('ob-gear').click()`); // open the modal
  await sleep(500);

  // K2. LIVE equipment-switch confirm flow (contract 015 §4 call-site 2)
  // — re-pinned for GH-534 owner ruling R1 (atelier contract §7 dev 5): a
  // re-racking equipment swap on a PRISTINE rack skips the confirm
  // entirely (fast path — still re-racks, still auto-closes per #121);
  // any progressed rack keeps the shipped confirm verbatim. Assert BOTH.
  // (032 re-cut: the modal cloth PICKER migrated to the atelier — the
  // K2 confirm-flow subject is the changeEquipment API's kit dialog, which
  // is pane-independent; the station-row pointer path is e2e-atelier arm D)
  // R1 fast path first: the K-arm restore just re-racked, so the rack is
  // pristine by construction.
  await chrome.eval(
    `window.__settings.changeEquipment('cloth_id', 'worn_slow'), true`);
  let fastCloth = null;
  for (let i = 0; i < 25 && fastCloth !== 'worn_slow'; i++) {
    await sleep(200);
    fastCloth = await chrome.eval(
      `window.__settings.get().equipment.cloth_id`);
  }
  const fastResidue = await chrome.eval(
    `document.querySelectorAll('[data-ob="confirm"]').length`);
  check('equipment-switch: PRISTINE rack takes the R1 fast path — lands '
    + 'with NO confirm (GH-534, atelier contract §7 dev 5)',
    fastCloth === 'worn_slow' && fastResidue === 0,
    JSON.stringify({ fastCloth, fastResidue }));
  // restore the cloth, then DIRTY the rack with one tap so the confirm-flow
  // assertions below exercise the progressed-rack path.
  await chrome.eval(`window.__settings.changeEquipment('cloth_id', `
    + `'pool_worsted_new', { skipConfirm: true })`);
  await sleep(600);
  await chrome.eval(
    `window.__rules?.setMatchState?.({ shooter: 1, breaker: 1 })`);
  await chrome.eval(
    '__test.shoot({ v0: 1.2, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
  {
    let st = 'PLAYBACK';
    for (let i = 0; i < 120 && (st === 'PLAYBACK' || st === 'SIMULATING'); i++) {
      await sleep(350);
      st = await chrome.eval('__test.state()');
    }
  }
  await chrome.eval(`document.getElementById('ob-gear').click()`); // re-open
  await sleep(500);
  await chrome.eval(
    `window.__settings.changeEquipment('cloth_id', 'worn_slow'), true`);
  const eqBody = await chrome.eval(waitConfirm);
  check('equipment-switch: kit confirm opens with the i18n re-rack body',
    eqBody === 'Changing equipment re-racks the table. Continue?',
    JSON.stringify(eqBody));
  await chrome.eval(
    `document.querySelector('[data-ob="confirm-cancel"]').click()`);
  await sleep(600); // decline: changeEquipment resolves false
  const eqDeclined = await chrome.eval(`({
    cloth: window.__settings.get().equipment.cloth_id,
    residue: document.querySelectorAll('[data-ob="confirm"]').length })`);
  check('equipment-switch: decline keeps the cloth',
    eqDeclined.cloth === 'pool_worsted_new'
    && eqDeclined.residue === 0,
    JSON.stringify(eqDeclined));
  await chrome.eval(
    `window.__settings.changeEquipment('cloth_id', 'worn_slow'), true`);
  if (await chrome.eval(waitConfirm) === null) {
    fail('equipment-switch: second confirm never opened');
  }
  await chrome.eval(
    `document.querySelector('[data-ob="confirm-accept"]').click()`);
  let eqSwitched = null;
  for (let i = 0; i < 50; i++) {
    await sleep(200);
    eqSwitched = await chrome.eval(
      `window.__settings.get().equipment.cloth_id`);
    if (eqSwitched === 'worn_slow') break;
  }
  check('equipment-switch: accept lands the new cloth',
    eqSwitched === 'worn_slow', JSON.stringify(eqSwitched));
  // issue #121: the accepted equipment confirm auto-closes too — re-open
  // for the K3 look flow + the trailing gear-click close
  let k2Gone = false;
  for (let i = 0; i < 50 && !k2Gone; i++) {
    k2Gone = await chrome.eval(
      `document.getElementById('ob-settings').getClientRects().length === 0`);
    if (!k2Gone) await sleep(200);
  }
  check('equipment-switch: accept AUTO-closes the settings modal (#121)',
    k2Gone);
  await chrome.eval(`document.getElementById('ob-gear').click()`); // re-open
  await sleep(500);

  // K3. LIVE look-switch confirm flow (contract 015 §4 call-site 3 — the
  // integrator-applied main.js hunk, T014): green→sp regrades live with no
  // dialog; sp→green offers a reload through the KIT confirm; decline
  // keeps the page (no reload) while the choice stays persisted.
  await chrome.eval(`window.__settings.set('look', 'tournament')`);
  await sleep(900); // live sp regrade (env rebake) settles, no dialog
  const preLook = await chrome.eval(
    `document.querySelectorAll('[data-ob="confirm"]').length`);
  check('look-switch: green→sp regrades live without a dialog', preLook === 0,
    `confirms=${preLook}`);
  await chrome.eval(
    `window.__lookSentinel = 1; window.__settings.set('look', 'green')`);
  const lookBody = await chrome.eval(waitConfirm);
  check('look-switch: kit confirm opens with the i18n reload body',
    lookBody === 'Classic green applies on reload. Reload now?',
    JSON.stringify(lookBody));
  await chrome.eval(
    `document.querySelector('[data-ob="confirm-cancel"]').click()`);
  await sleep(600);
  const lookAfter = await chrome.eval(`({
    sentinel: window.__lookSentinel,
    look: window.__settings.get().look,
    residue: document.querySelectorAll('[data-ob="confirm"]').length })`);
  check('look-switch: decline keeps the page (no reload) + persisted choice',
    lookAfter.sentinel === 1 && lookAfter.look === 'green'
    && lookAfter.residue === 0, JSON.stringify(lookAfter));

  const natives = await chrome.eval('window.__nativeConfirms');
  check('native sweep: window.confirm ZERO calls across all three live flows',
    natives === 0, `count=${natives}`);
  await chrome.eval(`__settings.changeEquipment('cloth_id',
    'pool_worsted_new', { skipConfirm: true })`);
  await sleep(600); // restore for the checks below
  await chrome.eval(`document.getElementById('ob-gear').click()`); // close
  await sleep(400);

  // J12. PARTS (GH-668 S5 kit step 5 — B-K12 .ob-card-option, B-K16
  // --glass / .ob-toolbar-pill / --toggle / --lg / --thumb + the id-block
  // migration, B-K17 .ob-prompt + the one coarse placement law, B-K19
  // navmodal clamp + row grid + state word + tab-is-heading). A kit LAB on
  // a fixed 360 px column (the phone card measure) plus LIVE reads of the
  // toolbar pills and the settings modal. Red-proven on the step-4 bytes
  // (kit.css v023): no part rules, id-styled pills carrying no kit class,
  // the modal pinned at 620 for a five-row pane.
  const partsLab = await chrome.eval(`(async () => {
    const col = document.createElement('div'); col.id = 'ob-s5-partslab';
    col.style.cssText = 'position:fixed;left:16px;top:16px;width:360px;padding:8px;'
      + 'display:flex;flex-direction:column;gap:12px;z-index:2147483647;background:var(--ob-bg-1)';
    document.body.appendChild(col);
    const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const lines = (el) => { const rects = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n; while ((n = w.nextNode())) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n);
        for (const r of rg.getClientRects()) if (r.width > 0 && !rects.some((q) => Math.abs(q.top - r.top) < 2)) rects.push(r); }
      return rects.length; };
    const ref = (css) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:-9999px;top:0;' + css;
      document.body.appendChild(d); const cs = getComputedStyle(d); const v = { bg: cs.backgroundColor, bd: cs.borderTopColor, ink: cs.color }; d.remove(); return v; };
    const REF = { g9: ref('background:var(--ob-accent-dim-3);border:1px solid var(--ob-accent-line);color:var(--ob-accent-text)'),
      solid: ref('background:var(--ob-glass-solid)'), glass: ref('background:var(--ob-glass)'),
      checked: ref('background:var(--ob-bg-3);color:var(--ob-accent-text)'), info: ref('border:1px solid var(--ob-info-line)') };
    const out = { ref: REF };
    // ---- B-K12 option card / row ----
    const card = (name, badge, extra, cls) => { const b = document.createElement('button'); b.type = 'button';
      b.className = 'ob-card-option' + (cls ? ' ' + cls : '');
      b.innerHTML = '<span class="ob-card-option__body"><span class="ob-card-option__head"><span class="ob-card-option__name">' + name
        + '</span>' + (badge ? '<span class="ob-badge ob-card-option__badge">' + badge + '</span>' : '') + '</span>'
        + (extra || '') + '</span>';
      return b; };
    const rowShort = card('9-Ball', 'WPA'); col.appendChild(rowShort);
    const rowLong = card('Chinese eight-ball (Heyball) — Joy Billiards international rules', 'JOY 2024', ''); col.appendChild(rowLong);
    const rowCur = card('Snooker', 'WPBSA'); rowCur.setAttribute('aria-current', 'true'); col.appendChild(rowCur);
    const rowDis = card('Carom', ''); rowDis.setAttribute('aria-disabled', 'true'); col.appendChild(rowDis);
    // review r1 P2: the play / atelier renderers mark INACTIVE cards aria-current="false" — a presence selector painted them selected
    const rowFalse = card('Blackball', ''); rowFalse.setAttribute('aria-current', 'false'); col.appendChild(rowFalse);
    const grid = document.createElement('div'); grid.style.cssText = 'display:flex;gap:8px;align-items:stretch'; col.appendChild(grid);
    const c1 = card('9-Ball', 'WPA', '<span class="ob-card-option__hint">WPA · Rules of Play</span><span class="ob-card-option__meta">Sep 2025</span>', 'ob-card-option--card');
    const c2 = card('Blackball', '', '<span class="ob-card-option__hint">WPA</span>', 'ob-card-option--card');
    grid.append(c1, c2);
    await raf();
    const rd = (el) => { const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      const name = el.querySelector('.ob-card-option__name'), badge = el.querySelector('.ob-card-option__badge');
      const nr = name?.getBoundingClientRect(), br = badge?.getBoundingClientRect();
      return { h: +r.height.toFixed(2), radius: cs.borderRadius, bg: cs.backgroundColor, bd: cs.borderTopColor, ink: cs.color,
        opacity: cs.opacity, align: cs.textAlign, nameLines: name ? lines(name) : 0,
        badgeBelow: !!(nr && br) && br.top >= nr.bottom - 2, badgeOneLine: badge ? lines(badge) : 0, shadow: cs.boxShadow }; };
    out.rowShort = rd(rowShort); out.rowLong = rd(rowLong); out.rowCur = rd(rowCur); out.rowDis = rd(rowDis); out.rowFalse = rd(rowFalse);
    out.c1 = rd(c1); out.c2 = rd(c2);
    out.reserve = (() => { const d = document.createElement('div');
      d.style.cssText = 'position:absolute;visibility:hidden;width:1px;height:var(--ob-card-option-reserve)';
      c1.appendChild(d); const h = d.getBoundingClientRect().height; d.remove(); return +h.toFixed(2); })();
    // ---- B-K16 voices: glass / toolbar part / toggle / lg / thumb ----
    const mkBtn = (cls, text, attrs) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls;
      b.textContent = text; for (const [k, v] of Object.entries(attrs || {})) b.setAttribute(k, v); col.appendChild(b); return b; };
    const rowB = document.createElement('div'); rowB.style.cssText = 'display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap'; col.appendChild(rowB);
    const glass = mkBtn('ob-btn ob-btn--icon ob-btn--glass ob-toolbar-pill', '?'); rowB.appendChild(glass);
    const tOff = mkBtn('ob-btn ob-btn--toggle', 'Start at the table next time', { 'aria-pressed': 'false' }); rowB.appendChild(tOff);
    const tOn = mkBtn('ob-btn ob-btn--toggle', 'Start at the table next time', { 'aria-pressed': 'true' }); rowB.appendChild(tOn);
    const lg = mkBtn('ob-btn ob-btn--primary ob-btn--lg', 'To the table'); rowB.appendChild(lg);
    const thumb = mkBtn('ob-btn ob-btn--primary ob-btn--thumb', 'FIRE'); rowB.appendChild(thumb);
    await raf();
    const pad = (el) => { const cs = getComputedStyle(el); return +(parseFloat(cs.paddingLeft) / el.getBoundingClientRect().height).toFixed(3); };
    const gcs = getComputedStyle(glass);
    out.glass = { w: glass.getBoundingClientRect().width, h: glass.getBoundingClientRect().height, bg: gcs.backgroundColor,
      blur: gcs.backdropFilter, fs: gcs.fontSize, lh: gcs.lineHeight, radius: gcs.borderRadius, z: gcs.zIndex };
    const slot = (el) => { const b = getComputedStyle(el, '::before'); return { w: b.width, h: b.height, content: b.content }; };
    out.toggle = { offW: tOff.getBoundingClientRect().width, onW: tOn.getBoundingClientRect().width, offSlot: slot(tOff), onSlot: slot(tOn),
      onBg: getComputedStyle(tOn).backgroundColor, onInk: getComputedStyle(tOn).color, offBg: getComputedStyle(tOff).backgroundColor,
      onTick: getComputedStyle(tOn, '::after').borderRightWidth, offTick: getComputedStyle(tOff, '::after').content,
      onShadow: getComputedStyle(tOn).boxShadow };
    out.lg = { h: +lg.getBoundingClientRect().height.toFixed(2), pad: pad(lg), fs: getComputedStyle(lg).fontSize };
    out.thumb = { h: +thumb.getBoundingClientRect().height.toFixed(2), pad: pad(thumb), minW: getComputedStyle(thumb).minWidth };
    // LIVE toolbar pills: every family member carries the kit part (no id
    // material left) — the J3 family law still binds them by id
    out.pills = ['ob-shell-open', 'ob-gear', 'ob-help', 'ob-drills', 'ob-playback', 'ob-share'].map((id) => { const el = document.getElementById(id);
      return { id, present: !!el, kit: !!el && el.classList.contains('ob-btn') && el.classList.contains('ob-btn--glass') && el.classList.contains('ob-toolbar-pill') }; });
    // ---- B-K17 prompt ----
    const pr = document.createElement('div'); pr.className = 'ob-prompt ob-prompt--routed'; pr.style.zIndex = '2147483647';
    pr.innerHTML = '<h3 class="ob-prompt__title">Who breaks first?</h3><span class="ob-prompt__hint">Player 1 decides · UMB Art. 23.1(c)</span>'
      + '<div class="ob-prompt__actions"><button type="button" class="ob-btn">Left start spot</button><button type="button" class="ob-btn">Right start spot</button></div>';
    document.body.appendChild(pr);
    const pb = document.createElement('div'); pb.className = 'ob-prompt'; pb.style.zIndex = '2147483647'; pb.textContent = 'Blur witness'; document.body.appendChild(pb); // FIX24 rider 2: the bare prompt keeps the smoke
    const nt = document.createElement('div'); nt.className = 'ob-prompt ob-prompt--notice'; nt.style.zIndex = '2147483647';
    nt.textContent = 'Stop the replay to start a drill'; document.body.appendChild(nt);
    await raf();
    const pcs = getComputedStyle(pr), ncs = getComputedStyle(nt), prr = pr.getBoundingClientRect(), ntr = nt.getBoundingClientRect();
    const acts = pr.querySelector('.ob-prompt__actions'), acs = getComputedStyle(acts);
    out.prompt = { align: pcs.textAlign, radius: pcs.borderRadius, padT: pcs.paddingTop, padL: pcs.paddingLeft, w: +prr.width.toFixed(1),
      centred: Math.abs((prr.left + prr.right) / 2 - innerWidth / 2) < 2, top: +prr.top.toFixed(1),
      actsJustify: acs.justifyContent, actsWrap: acs.flexWrap, bg: pcs.backgroundColor, blur: pcs.backdropFilter, bareBlur: getComputedStyle(pb).backdropFilter,
      titleFs: getComputedStyle(pr.querySelector('.ob-prompt__title')).fontSize,
      hintCaps: getComputedStyle(pr.querySelector('.ob-prompt__hint')).textTransform };
    out.notice = { topEdge: ncs.borderTopColor, balance: ncs.textWrap || ncs.textWrapStyle, bottomGap: +(innerHeight - ntr.bottom).toFixed(1),
      centred: Math.abs((ntr.left + ntr.right) / 2 - innerWidth / 2) < 2, w: +ntr.width.toFixed(1), pe: ncs.pointerEvents, align: ncs.textAlign };
    pr.remove(); pb.remove(); nt.remove();
    // ---- B-K19 navmodal row + state word (lab) ----
    const rowN = document.createElement('div'); rowN.className = 'ob-navmodal__row';
    rowN.innerHTML = '<label for="ob-s5-tg">Sound effects</label><div><input id="ob-s5-tg" type="checkbox"></div>'; col.appendChild(rowN);
    const ctl = await import('./app/ui/controls.js');
    const tgIn = rowN.querySelector('input'); const tgLab = ctl.upgradeToggle(tgIn, { states: { on: 'On', off: 'Off' } });
    await raf();
    const word = tgLab.querySelector('.ob-toggle__state');
    out.navRow = { cols: getComputedStyle(rowN).gridTemplateColumns, word: word?.textContent ?? null, wordHidden: word?.getAttribute('aria-hidden'),
      trackX: +(tgLab.querySelector('.ob-toggle__track').getBoundingClientRect().left - rowN.children[1].getBoundingClientRect().left).toFixed(1) };
    tgIn.click(); await raf(); out.navRow.wordOn = word?.textContent ?? null;
    col.remove();
    return out;
  })()`);
  const R = partsLab.ref;
  check('parts B-K12: option rows sit on the 44 floor at the mid pole (r 10), solid rung inside the pane, start-aligned',
    Math.abs(partsLab.rowShort.h - 44) <= 0.5 && partsLab.rowShort.radius === '10px' && partsLab.rowShort.bg === R.solid.bg
    && partsLab.rowShort.align === 'start' && partsLab.rowShort.badgeOneLine === 1 && !partsLab.rowShort.badgeBelow,
    JSON.stringify(partsLab.rowShort));
  check('parts B-K12: a name past the measure wraps ≤ 2 lines and the badge DROPS to its own line (never wraps the name, never the badge)',
    partsLab.rowLong.nameLines === 2 && partsLab.rowLong.badgeBelow && partsLab.rowLong.badgeOneLine === 1,
    JSON.stringify(partsLab.rowLong));
  check('parts B-K12: aria-current="false" is NOT selected — rest material, rest ink, no hairline (the VALUE law: [aria-current="true"], never the bare presence)',
    partsLab.rowFalse.bg === partsLab.rowShort.bg && partsLab.rowFalse.bd === partsLab.rowShort.bd && partsLab.rowFalse.ink === partsLab.rowShort.ink
    && partsLab.rowFalse.bg !== partsLab.rowCur.bg, JSON.stringify({ rowFalse: partsLab.rowFalse, rest: partsLab.rowShort, cur: partsLab.rowCur }));
  check('parts B-K12: aria-current = G9 (dim-3 fill + accent hairline + accent ink, no glow); aria-disabled = 0.38 (the ring companion is judged statically below — script focus never paints :focus-visible under pointer modality)',
    partsLab.rowCur.bg === R.g9.bg && partsLab.rowCur.bd === R.g9.bd && partsLab.rowCur.ink === R.g9.ink
    && partsLab.rowCur.shadow === 'none' && partsLab.rowDis.opacity === '0.38',
    JSON.stringify({ cur: partsLab.rowCur, dis: partsLab.rowDis.opacity }));
  check('parts B-K12: --card = the declared reserve — two cards with different copy share ONE height equal to the derived reserve (name 2 + hint 2 lines), not the tallest sibling',
    partsLab.c1.h === partsLab.c2.h && Math.abs(partsLab.c1.h - partsLab.reserve) <= 1
    && partsLab.c1.h >= 84 && partsLab.c1.h <= 100,
    JSON.stringify({ c1: partsLab.c1.h, c2: partsLab.c2.h, reserve: partsLab.reserve }));
  check('parts B-K16: .ob-btn--glass wears the toolbar material (bg --ob-glass + blur) at the 34 icon rung; .ob-toolbar-pill = fallback-glyph metrics fs-2 / lh 1 on the chrome layer',
    partsLab.glass.bg === R.glass.bg && partsLab.glass.blur !== 'none' && Math.abs(partsLab.glass.w - 34) <= 0.5
    && Math.abs(partsLab.glass.h - 34) <= 0.5 && partsLab.glass.fs === '19px' && partsLab.glass.lh === '19px' && partsLab.glass.radius === '999px',
    JSON.stringify(partsLab.glass));
  check('parts B-K16: every LIVE toolbar pill (gear / help / drills / playback / share; shell-open when the hall is mounted) carries the kit part — no id-styled family member left',
    partsLab.pills.every((p) => !p.present || p.kit) && partsLab.pills.filter((p) => p.present).length >= 5, JSON.stringify(partsLab.pills));
  check('parts B-K16: --toggle reserves a 16 px mark slot at rest (width identical pressed vs not), pressed = the checked register (bg-3 + accent ink + el-1) with a drawn tick (ring companion judged statically below)',
    Math.abs(partsLab.toggle.offW - partsLab.toggle.onW) < 0.5 && partsLab.toggle.offSlot.w === '16px' && partsLab.toggle.onSlot.w === '16px'
    && partsLab.toggle.onBg === R.checked.bg && partsLab.toggle.onInk === R.checked.ink && partsLab.toggle.offBg !== R.checked.bg
    && partsLab.toggle.onTick === '2px' && partsLab.toggle.offTick === 'none' && partsLab.toggle.onShadow !== 'none',
    JSON.stringify(partsLab.toggle));
  check('parts B-K16: --lg = the 48 rung with its derived pad (≥ 0.4 h), --thumb = the 64 rung (min-width 64, pad ≥ 0.4 h)',
    Math.abs(partsLab.lg.h - 48) <= 0.5 && partsLab.lg.pad >= 0.4 && Math.abs(partsLab.thumb.h - 64) <= 0.5
    && partsLab.thumb.pad >= 0.4 && partsLab.thumb.minW === '64px', JSON.stringify({ lg: partsLab.lg, thumb: partsLab.thumb }));
  // B-K17 (ORDER-LIGHT-C2-FIX21 / FIX24; GH-668 kit-owner concurrence 2026-09-16 17:35Z, rider 2): the ROUTED prompt (#ob-shell-decision's class pair)
  // rides the SOLID rung under glass — kit.css lists `.ob-prompt--routed` beside `.ob-prompt--notice` (text-dense micro-chrome over the scene,
  // B-K14 / A2) — blur none, background the resolved --ob-glass-solid; the BARE `.ob-prompt` keeps the family smoke (blur-positive witness).
  check('parts B-K17: .ob-prompt (routed) is START-aligned on the SOLID rung at the card pole (r 12, sp-3/sp-4), width = its longest option (fit-content, centred at the top when routed), title 16, caps hint, actions start-aligned + wrapping; the BARE prompt still blurs',
    partsLab.prompt.align === 'start' && partsLab.prompt.radius === '12px' && partsLab.prompt.padT === '12px' && partsLab.prompt.padL === '16px'
    && partsLab.prompt.w < 360 && partsLab.prompt.w > 200 && partsLab.prompt.centred && partsLab.prompt.top <= 13
    && partsLab.prompt.actsJustify === 'flex-start' && partsLab.prompt.actsWrap === 'wrap' && partsLab.prompt.titleFs === '16px'
    && partsLab.prompt.hintCaps === 'uppercase' && partsLab.prompt.blur === 'none' && partsLab.prompt.bg === R.solid.bg && partsLab.prompt.bareBlur !== 'none',
    JSON.stringify(partsLab.prompt));
  check('parts B-K17: the NOTICE register — 1 px info top edge, balanced wrap, bottom-centred 84 px over the rail on fine pointers, pointer-events none, start-aligned',
    partsLab.notice.topEdge === R.info.bd && /balance/.test(partsLab.notice.balance) && Math.abs(partsLab.notice.bottomGap - 84) <= 1
    && partsLab.notice.centred && partsLab.notice.pe === 'none' && partsLab.notice.align === 'start' && partsLab.notice.w <= 480,
    JSON.stringify(partsLab.notice));
  check('parts B-K19: .ob-navmodal__row = the 1fr / 320 px grid with the toggle track at the START of the control column beside its state word (Off → On on change, aria-hidden)',
    /320px$/.test(partsLab.navRow.cols) && partsLab.navRow.word === 'Off' && partsLab.navRow.wordOn === 'On'
    && partsLab.navRow.wordHidden === 'true' && partsLab.navRow.trackX <= 1, JSON.stringify(partsLab.navRow));
  // LIVE navmodal clamp: the settings modal sizes to its visible section
  // between min(420px, 86vh) and min(620px, 86vh) — the About pane no
  // longer floats in a 620 box; a pane whose content exceeds the cap rides
  // it and scrolls INSIDE. Measured over EVERY live nav section (the Game
  // pane, the step-5 cap witness, left the modal with 034a-mig — the law
  // is the clamp, not a named section): the tallest section rides the cap
  // when its pane scrolls, every section sits inside [floor, cap], the
  // modal root itself never overflows.
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await sleep(500);
  const nmClamp = await chrome.eval(`(async () => {
    const el = document.getElementById('ob-settings');
    const ids = [...document.querySelectorAll('#ob-settings [data-ob="navmodal-item"][data-section]')].map((b) => b.dataset.section);
    const pick = async (sid) => { document.querySelector('#ob-settings [data-ob="navmodal-item"][data-section="' + sid + '"]')?.click();
      await new Promise((r) => setTimeout(r, 450)); const cs = getComputedStyle(el);
      const pane = [...el.querySelectorAll('.ob-navmodal__pane, [data-ob="navmodal-pane"]')].find((n) => n.getClientRects().length && getComputedStyle(n).display !== 'none') ?? null;
      return { sid, h: +el.getBoundingClientRect().height.toFixed(1), tp: cs.transitionProperty, maxH: cs.maxHeight, minH: cs.minHeight,
        fit: el.style.height || 'css', overflowed: el.scrollHeight > el.clientHeight + 1,
        paneScrolls: !!pane && [pane, ...pane.querySelectorAll('*')].some((n) => n.scrollHeight > n.clientHeight + 1
          && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) }; };
    const rows = []; for (const sid of ids) rows.push(await pick(sid));
    const about = rows.find((r) => r.sid === 'about') ?? rows[0];
    return { rows, about, vh: innerHeight, navmodal: el.classList.contains('ob-navmodal') };
  })()`);
  await chrome.eval(`document.getElementById('ob-gear').click()`); // close
  await sleep(400);
  {
    const cap = Math.min(620, 0.86 * nmClamp.vh), floor = Math.min(420, 0.86 * nmClamp.vh);
    const rows = nmClamp.rows ?? [];
    const tallest = rows.reduce((a, r) => (!a || r.h > a.h ? r : a), null);
    const scrollers = rows.filter((r) => r.paneScrolls);
    check('parts B-K19: LIVE settings modal height = clamp(420, content, min(620px, 86vh)) over every nav section — About sizes under the cap, a scrolling pane rides the cap exactly, no section leaves [floor, cap], the root never overflows; the height transition is declared',
      nmClamp.navmodal && rows.length >= 3
      && nmClamp.about.h >= floor - 1 && nmClamp.about.h < cap - 20
      && rows.every((r) => r.h >= floor - 1 && r.h <= cap + 1 && !r.overflowed)
      && scrollers.every((r) => Math.abs(r.h - cap) <= 1)
      && (scrollers.length > 0 || (tallest && tallest.h < cap + 1))
      && /height/.test(nmClamp.about.tp) && Math.abs(parseFloat(nmClamp.about.maxH) - cap) <= 1,
      JSON.stringify({ vh: nmClamp.vh, cap, floor, tallest, scrollers: scrollers.map((r) => r.sid), rows: rows.map((r) => [r.sid, r.h, r.paneScrolls]) }));
  }
  // SYNTHETIC cap / floor witnesses (034a-mig left no live section whose
  // content exceeds the cap at 1440x900 — probed: assists / display /
  // language / about all sit at the 420 floor — so the cap clause above has
  // no live witness; this keeps a RED arm for it): a bare .ob-navmodal with a
  // 2000 px pane must measure exactly min(620px, 86vh); with a 100 px pane
  // exactly min(420px, 86vh).
  const nmSynth = await chrome.eval(`(() => {
    const mk = (h) => { const el = document.createElement('div'); el.className = 'ob-navmodal';
      el.style.cssText = 'display:flex;position:fixed;left:0;top:0;width:600px;visibility:hidden';
      const pane = document.createElement('div'); pane.style.height = h + 'px'; pane.style.flex = '0 0 auto'; el.appendChild(pane);
      document.body.appendChild(el); const r = +el.getBoundingClientRect().height.toFixed(1); el.remove(); return r; };
    return { tall: mk(2000), short: mk(100), vh: innerHeight };
  })()`);
  check('parts B-K19: SYNTHETIC .ob-navmodal — a 2000 px pane measures exactly min(620px, 86vh) (content beyond the cap rides it), a 100 px pane exactly min(420px, 86vh) (the floor)',
    Math.abs(nmSynth.tall - Math.min(620, 0.86 * nmSynth.vh)) <= 1 && Math.abs(nmSynth.short - Math.min(420, 0.86 * nmSynth.vh)) <= 1,
    JSON.stringify(nmSynth));
  // STATIC kit.css laws (CSSOM walk): the coarse notice bottom, the ONE
  // placement law for confirm + routed prompt, the tab-is-heading rule, the
  // coarse sheet standing the clamp down, the toggle focus companion.
  const partsStatic = await chrome.eval(`(() => {
    const out = { noticeCoarse: false, placement: false, paneTitle: false, sheetUncapped: false, toggleRing: false, navRowCoarse: false, cardRing: false, sheets: 0 };
    for (const s of document.styleSheets) {
      if (!s.href || !/[/]kit[.]css/.test(s.href)) continue; out.sheets++;
      let rules; try { rules = s.cssRules; } catch { continue; }
      const walk = (list, media) => { for (const r of list) {
        if (r.cssRules && r.cssRules.length && !r.selectorText) { walk(r.cssRules, media + ' ' + (r.conditionText || r.media?.mediaText || '')); continue; }
        const sel = r.selectorText || '', st = r.style; if (!st) continue; const coarse = /pointer:\\s*coarse/.test(media);
        // review r1 P2 (the VALUE law): the ring companion is keyed on [aria-current="true"], never the bare presence
        if (sel === '.ob-card-option[aria-current="true"]:focus-visible, .ob-card-option[aria-selected="true"]:focus-visible' && /var\\(--ob-focus\\)/.test(st.boxShadow) && /inset/.test(st.boxShadow)) out.cardRing = true;
        if (coarse && /\\.ob-prompt--notice/.test(sel) && /88px/.test(st.bottom) && /56vw/.test(st.maxWidth)) out.noticeCoarse = true;
        if (coarse && /\\.ob-confirm/.test(sel) && /\\.ob-prompt--routed/.test(sel) && /ob-shell-open/.test(sel) && st.right && st.maxWidth) out.placement = true;
        if (coarse && /\\.ob-navmodal__pane-title/.test(sel) && st.clipPath) out.paneTitle = true;
        if (coarse && /\\.ob-touch \\.ob-navmodal$/.test(sel) && st.maxHeight === 'none') out.sheetUncapped = true;
        if (coarse && /\\.ob-navmodal__row/.test(sel) && /46%/.test(st.gridTemplateColumns) && st.minHeight) out.navRowCoarse = true;
        if (sel === '.ob-btn--toggle[aria-pressed="true"]:focus-visible' && /var\\(--ob-focus\\)/.test(st.boxShadow)) out.toggleRing = true;
      } };
      walk(rules, '');
    }
    return out;
  })()`);
  check('parts B-K12/B-K16/B-K17/B-K19 static: kit.css declares the coarse notice bottom (88 + safe, 56vw), the ONE confirm + routed-prompt placement law under body.ob-shell-open, the tab-is-heading rule, the uncapped sheet, the coarse row grid, and the focus-ring companions of the pressed toggle and the current option card',
    partsStatic.sheets === 1 && partsStatic.noticeCoarse && partsStatic.placement && partsStatic.paneTitle && partsStatic.sheetUncapped
    && partsStatic.navRowCoarse && partsStatic.toggleRing && partsStatic.cardRing, JSON.stringify(partsStatic));
  // GREP GATE (B-K16, node side): `border-radius` / `cursor: pointer` /
  // `min-height: 44` inside web/app/*.js injected style blocks = 0 outside a
  // FROZEN ledger (shrink-only; every line names its reason and must still
  // match — liveness — so the ledger cannot rot into documentation).
  {
    const JS_STYLE_OK = [
      ['aimwidgets.js', 'gameplay instruments (aim widget frames; the warn pill → .ob-banner--info is a slice-2 item)'],
      ['export.js', 'documented degrade copy for the stale-kit rung (charter §4.1; export card → .ob-btn/.ob-progress later)'],
      ['hud.js', '.hm-wrap badge shape (HUD instrument chip, r-m) — documented'],
      ['share.js', '#ob-replay import card rows (not the toolbar pill; slice-6 adoption)'],
    ];
    const re = /border-radius|cursor:\s*pointer|min-height:\s*44/g;
    const rows = [];
    for (const f of fs.readdirSync(path.join(webDir, 'app')).filter((n) => n.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(webDir, 'app', f), 'utf8');
      const hits = (src.match(re) || []).length; if (!hits) continue;
      const ok = JS_STYLE_OK.find(([n]) => n === f);
      rows.push({ f, hits, ok: !!ok, why: ok?.[1] ?? 'UNLISTED — adopt the kit part (.ob-btn / --icon / --glass / .ob-toolbar-pill / .ob-card-option) or add a ledger line with a reason' });
    }
    const dead = JS_STYLE_OK.filter(([n]) => !rows.some((r) => r.f === n)).map(([n]) => n);
    check('parts B-K16 grep gate: border-radius / cursor: pointer / min-height: 44 in web/app/*.js style blocks = 0 outside the frozen ledger (toolbar pills migrated), and every ledger line still matches (liveness)',
      rows.every((r) => r.ok) && dead.length === 0, JSON.stringify({ rows, dead }));
  }

  // J13. MOTION (GH-668 S5 kit step 7 — B-K22 mount law). A hidden lab
  // panel goes through motion.mount() / unmount(): `hidden` flips
  // SYNCHRONOUSLY (the consumer's state stays truthful), the first painted
  // frame is the hidden pose (opacity 0, translateY 8), the rest pose has no
  // inline residue, unmount keeps painting through the exit and lands
  // display:none with no inline display, flips mid-flight continue from the
  // current pose, re-mounting a mounted panel is a no-op. Red-proven on the
  // step-6 bytes (motion.js without mount / unmount).
  const motionLab = await chrome.eval(`(async () => {
    const m = await import('./app/ui/motion.js');
    const out = { hasMount: typeof m.mount === 'function', hasUnmount: typeof m.unmount === 'function' };
    if (!out.hasMount || !out.hasUnmount) return out;
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const op = (el) => parseFloat(getComputedStyle(el).opacity);
    const inl = (el) => ({ opacity: el.style.opacity, transform: el.style.transform, display: el.style.display });
    const ty = (el) => { const p = getComputedStyle(el).transform.match(/matrix\\(([^)]*)\\)/); return p ? parseFloat(p[1].split(',')[5]) : 0; };
    const el = document.createElement('div'); el.id = 'ob-s5-motionlab';
    el.style.cssText = 'position:fixed;left:16px;top:16px;width:200px;height:80px;z-index:2147483647;background:var(--ob-bg-1)';
    el.hidden = true; document.body.appendChild(el);
    out.restHidden = getComputedStyle(el).display === 'none';
    // 1. mount from hidden
    let t0 = performance.now();
    const p1 = m.mount(el);
    out.syncHidden = el.hidden;
    out.firstOpacity = op(el); out.firstY = ty(el); out.firstDisplay = getComputedStyle(el).display;
    await raf();
    out.frame1Opacity = op(el);
    await p1;
    out.mountMs = performance.now() - t0;
    out.restOpacity = op(el); out.restTransform = getComputedStyle(el).transform; out.restInline = inl(el);
    // 2. re-mount at rest = no-op
    t0 = performance.now(); await m.mount(el); out.remountMs = performance.now() - t0; out.remountOpacity = op(el);
    // 3. unmount: hidden now, paints through the exit, lands display:none without residue
    t0 = performance.now();
    const p2 = m.unmount(el);
    out.unmountSyncHidden = el.hidden; out.unmountSyncDisplay = getComputedStyle(el).display;
    // frame 1 HOLDS the current pose (continue-from-current: an exit never
    // jumps), the fade moves from frame 2 on
    await raf(); out.exitFrame1Opacity = op(el); await raf();
    out.exitFrameOpacity = op(el);
    await p2;
    out.unmountMs = performance.now() - t0;
    out.hiddenDisplay = getComputedStyle(el).display; out.hiddenInline = inl(el);
    // 4. unmount on hidden = no-op
    t0 = performance.now(); await m.unmount(el); out.reunmountMs = performance.now() - t0; out.stillHidden = el.hidden;
    // 5. mid-flight flips continue from the current pose
    m.mount(el); await wait(70);
    out.midBeforeFlip = op(el);
    m.unmount(el);
    out.midAfterFlip = op(el); out.midHiddenAfterFlip = el.hidden;
    await wait(40);
    out.midBeforeRemount = op(el);
    const p4 = m.mount(el);
    out.midAfterRemount = op(el); out.midHiddenAfterRemount = el.hidden;
    await p4;
    out.finalOpacity = op(el); out.finalTransform = getComputedStyle(el).transform; out.finalInline = inl(el);
    out.finalDisplay = getComputedStyle(el).display;
    el.remove();
    return out;
  })()`);
  {
    const L = motionLab; const noInline = (i) => !!i && i.opacity === '' && i.transform === '' && i.display === '';
    check('motion B-K22 mount law: motion.js exports mount() / unmount()', L.hasMount && L.hasUnmount, JSON.stringify(L));
    check('motion B-K22 mount: `hidden` clears synchronously and the first painted frame is the hidden pose (opacity 0, translateY 8)',
      L.restHidden && L.syncHidden === false && L.firstDisplay !== 'none' && L.firstOpacity < 0.05 && Math.abs(L.firstY - 8) < 0.5 && L.frame1Opacity < 0.9, JSON.stringify(L));
    check('motion B-K22 mount: lands the rest pose (opacity 1, transform none) with no inline residue in ~--ob-t-med',
      L.restOpacity === 1 && L.restTransform === 'none' && noInline(L.restInline) && L.mountMs >= 150 && L.mountMs < 2500, JSON.stringify(L));
    check('motion B-K22 mount on a mounted resting panel is a no-op (no blink)', L.remountMs < 40 && L.remountOpacity === 1, JSON.stringify(L));
    check('motion B-K22 unmount: `hidden` sets synchronously, the panel keeps painting through the exit, lands display:none with no inline residue in ~--ob-t-fast',
      L.unmountSyncHidden === true && L.unmountSyncDisplay !== 'none' && L.exitFrame1Opacity === 1 && L.exitFrameOpacity < 1 && L.hiddenDisplay === 'none' && noInline(L.hiddenInline) && L.unmountMs >= 90 && L.unmountMs < 2000, JSON.stringify(L));
    check('motion B-K22 unmount on a hidden panel is a no-op', L.reunmountMs < 40 && L.stillHidden === true, JSON.stringify(L));
    check('motion B-K22 flips mid-flight continue from the current pose (no flash to 1 / 0) and land the rest pose',
      L.midBeforeFlip < 1 && Math.abs(L.midAfterFlip - L.midBeforeFlip) < 0.05 && L.midHiddenAfterFlip === true
      && L.midBeforeRemount < 1 && Math.abs(L.midAfterRemount - L.midBeforeRemount) < 0.05 && L.midHiddenAfterRemount === false
      && L.finalOpacity === 1 && L.finalTransform === 'none' && noInline(L.finalInline) && L.finalDisplay !== 'none', JSON.stringify(L));
  }

  // GREP GATE (B-K22, node side): the motion LADDER. Every transition /
  // animation duration or delay in the kit sheets, the surface sheets, the
  // app.html style blocks and the web/app/*.js injected style blocks is a
  // `var(--ob-t-*)` reference; a literal time value is red unless a FROZEN
  // ledger row (file + the exact literal set + reason) claims it — the
  // ledger only shrinks and every row must still match (liveness). kit.css
  // and tokens.css may carry no row: the kit is the law. The tokens cap the
  // ladder at 320 ms and motion.js's T_* mirror them (the "change BOTH"
  // comment becomes a test).
  {
    // the scanner + the FROZEN MOTION_OK ledger live in kit-laws.mjs since the
    // audit predicates (A11 static) judge the same law — ONE ledger, two callers
    const { rows, red, dead, kitRows, ledgered } = scanMotionDurations(webDir, MOTION_OK);
    check('motion B-K22 grep gate: transition / animation durations + delays reference var(--ob-t-*) in every kit sheet, surface sheet, app.html style block and web/app/*.js style block; literals only under the frozen ledger (liveness held); kit.css + tokens.css literal-free',
      rows.length > 0 && red.length === 0 && dead.length === 0 && kitRows.length === 0,
      JSON.stringify({ red, dead, kitRows, ledgered }));
    const tok = fs.readFileSync(path.join(webDir, 'app/ui/tokens.css'), 'utf8');
    const ms = (n) => parseFloat((tok.match(new RegExp(`--ob-t-${n}:\\s*([\\d.]+)ms`)) || [])[1]);
    const ladder = { fast: ms('fast'), med: ms('med'), slow: ms('slow') };
    const mo = await import(pathToFileURL(path.join(webDir, 'app/ui/motion.js')).href);
    ladder.js = { fast: Math.round(mo.T_FAST * 1000), med: Math.round(mo.T_MED * 1000), slow: Math.round(mo.T_SLOW * 1000) };
    check('motion B-K22 ladder: tokens --ob-t-fast / med / slow = 120 / 200 / 320 (cap 320) and motion.js T_FAST / T_MED / T_SLOW mirror them',
      ladder.fast === 120 && ladder.med === 200 && ladder.slow === 320
      && ladder.js.fast === ladder.fast && ladder.js.med === ladder.med && ladder.js.slow === ladder.slow, JSON.stringify(ladder));
  }

  // J14. TYPE ROLES + HYGIENE (GH-668 S5 kit step 8 — B-K13 G7 role
  // classes + the :lang(ja|ko|zh) caps arm, B-K23 kit font reset / one
  // scrollbar rule / glyph line height, B-K24 title + place roles, the DVR
  // titled by its launcher over a hairline). A kit LAB on a fixed column:
  // computed reads per role at en, then the SAME nodes under lang=ja / ko /
  // zh-CN / de (the arm reads the inherited lang, not the locale round
  // trip), a strip segment OUTSIDE any .ob-panel (the UA-font case), a
  // .ob-scroll pane. Red-proven on the step-7 bytes (kit.css v024).
  const rolesLab = await chrome.eval(`(async () => {
    const col = document.createElement('div'); col.id = 'ob-s5-roleslab'; col.lang = 'en';
    col.style.cssText = 'position:fixed;left:16px;top:16px;width:360px;padding:8px;display:flex;flex-direction:column;gap:8px;'
      + 'z-index:2147483647;background:var(--ob-bg-1);font-family:var(--ob-font);font-size:var(--ob-fs-0)';
    document.body.appendChild(col);
    const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = txt || 'Aim assist'; col.appendChild(e); return e; };
    const caps = mk('span', 'ob-caps'), badge = mk('span', 'ob-badge'), hint = mk('span', 'ob-prompt__hint');
    const ctl = mk('span', 'ob-control'), body = mk('span', 'ob-body'), hnt = mk('span', 'ob-hint');
    const title = mk('h3', 'ob-title'), ptitle = mk('h3', 'ob-panel__title'), place = mk('h2', 'ob-place');
    const strip = document.createElement('div'); strip.className = 'ob-strip'; col.appendChild(strip);
    const seg = document.createElement('button'); seg.type = 'button'; seg.className = 'ob-strip__seg'; seg.textContent = 'Replays'; strip.appendChild(seg);
    const host = document.createElement('div'); host.className = 'ob-x-lab'; col.appendChild(host);
    const bare = document.createElement('button'); bare.type = 'button'; bare.textContent = 'bare'; host.appendChild(bare);
    const pane = mk('div', 'ob-scroll', ''); pane.style.cssText = 'height:40px;overflow:auto'; pane.innerHTML = '<div style="height:200px"></div>';
    const ref = (css) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:-9999px;' + css; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; };
    const rd = (el) => { const cs = getComputedStyle(el); return { fs: parseFloat(cs.fontSize), fw: parseInt(cs.fontWeight, 10), lh: cs.lineHeight, tt: cs.textTransform, ls: cs.letterSpacing, ink: cs.color, fam: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim() }; };
    const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const snap = () => ({ caps: rd(caps), badge: rd(badge), hint: rd(hint), ctl: rd(ctl), body: rd(body), hnt: rd(hnt), title: rd(title), ptitle: rd(ptitle), place: rd(place), seg: rd(seg), bare: rd(bare) });
    const out = { ref: { t0: ref('color:var(--ob-text-0)'), t1: ref('color:var(--ob-text-1)'), t2: ref('color:var(--ob-text-2)') }, bodyFam: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, '').trim() };
    out.en = snap();
    for (const l of ['ja', 'ko', 'zh-CN', 'de']) { col.lang = l; await raf(); out[l] = snap(); }
    col.lang = 'en';
    const pcs = getComputedStyle(pane); out.pane = { sw: pcs.scrollbarWidth, sc: pcs.scrollbarColor };
    col.remove();
    return out;
  })()`);
  {
    const R = rolesLab; const near = (a, b, t = 0.6) => Math.abs(a - b) <= t;
    const capsOk = (r) => near(r.fs, 12) && r.fw === 620 && r.tt === 'uppercase' && near(parseFloat(r.ls), 0.72, 0.05);
    check('roles B-K13 G7 (en): caps 12/620/uppercase/+0.06em (.ob-caps ink text-2; .ob-badge / .ob-prompt__hint share the recipe with their own text-1 ink)',
      capsOk(R.en.caps) && capsOk(R.en.badge) && capsOk(R.en.hint) && R.en.caps.ink === R.ref.t2 && R.en.badge.ink === R.ref.t1 && R.en.hint.ink === R.ref.t1,
      JSON.stringify({ caps: R.en.caps, badge: R.en.badge, hint: R.en.hint, ref: R.ref }));
    check('roles B-K13 G7 (en): control 14/560/1.5 · body 14/430/1.5 text-1 · hint 12/430/1.5 text-2',
      near(R.en.ctl.fs, 14) && R.en.ctl.fw === 560 && near(parseFloat(R.en.ctl.lh), 21)
      && near(R.en.body.fs, 14) && R.en.body.fw === 430 && R.en.body.ink === R.ref.t1
      && near(R.en.hnt.fs, 12) && R.en.hnt.fw === 430 && near(parseFloat(R.en.hnt.lh), 18) && R.en.hnt.ink === R.ref.t2,
      JSON.stringify({ ctl: R.en.ctl, body: R.en.body, hnt: R.en.hnt }));
    check('roles B-K24 (en): title 16/620/1.2 text-0 ≡ .ob-panel__title; place 19/620/1.2 — two declared voices, one per rank',
      near(R.en.title.fs, 16) && R.en.title.fw === 620 && near(parseFloat(R.en.title.lh), 19.2) && R.en.title.ink === R.ref.t0
      && near(R.en.ptitle.fs, 16) && R.en.ptitle.fw === 620 && near(parseFloat(R.en.ptitle.lh), 19.2)
      && near(R.en.place.fs, 19) && R.en.place.fw === 620 && near(parseFloat(R.en.place.lh), 22.8) && R.en.place.ink === R.ref.t0,
      JSON.stringify({ title: R.en.title, ptitle: R.en.ptitle, place: R.en.place }));
    const armOk = (r) => near(r.fs, 13) && r.fw === 560 && r.tt === 'none' && (r.ls === 'normal' || parseFloat(r.ls) === 0);
    check('roles B-K13 CJK arm: under lang=ja / ko / zh-CN the caps role (.ob-caps, .ob-badge, .ob-prompt__hint) drops uppercase + tracking, 560, 13 px; lang=de restores the Latin caps voice',
      ['ja', 'ko', 'zh-CN'].every((l) => armOk(R[l].caps) && armOk(R[l].badge) && armOk(R[l].hint))
      && capsOk(R.de.caps) && capsOk(R.de.badge) && capsOk(R.de.hint)
      && ['ja', 'ko', 'zh-CN', 'de'].every((l) => near(R[l].ctl.fs, 14) && near(R[l].title.fs, 16) && near(R[l].place.fs, 19)),
      JSON.stringify({ ja: R.ja.caps, ko: R.ko.badge, zh: R['zh-CN'].hint, de: R.de.caps }));
    check('hygiene B-K23 font reset: a .ob-strip__seg <button> OUTSIDE any .ob-panel and a bare <button> inside an ob- host inherit the kit font (family = body, seg 16 px, bare 14 px) — never the UA 13.333 px',
      R.en.seg.fam === R.bodyFam && near(R.en.seg.fs, 16) && R.en.bare.fam === R.bodyFam && near(R.en.bare.fs, 14),
      JSON.stringify({ seg: R.en.seg, bare: R.en.bare, bodyFam: R.bodyFam }));
    check('hygiene B-K23 one scrollbar rule: a .ob-scroll pane computes scrollbar-width thin + the kit scrollbar-color',
      R.pane.sw === 'thin' && /\S/.test(R.pane.sc) && R.pane.sc !== 'auto', JSON.stringify(R.pane));
  }

  // J14 statics: the kit sheets carry the law in bytes (comment-stripped)
  {
    const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '');
    const kit = strip(fs.readFileSync(path.join(webDir, 'app/ui/kit.css'), 'utf8'));
    const tok = strip(fs.readFileSync(path.join(webDir, 'app/ui/tokens.css'), 'utf8'));
    const pbc = strip(fs.readFileSync(path.join(webDir, 'app/ui/playback.css'), 'utf8'));
    const wk = [...kit.matchAll(/(\S*)::-webkit-scrollbar/g)].map((m) => m[1]);
    const st = {
      oneWebkit: wk.length === 1 && wk[0] === '.ob-strip',
      oneThinRule: (kit.match(/scrollbar-width:\s*thin/g) || []).length === 1 && /\.ob-scroll[^{]*\{[^}]*scrollbar-color:\s*var\(--ob-bg-3\)/.test(kit),
      noLhLiteral: !/line-height:\s*(normal|\d*\.?\d+(px|em)?)\s*[;}]/.test(kit) && !/line-height:\s*(normal|\d*\.?\d+(px|em)?)\s*[;}]/.test(pbc),
      noTrackLiteral: !/letter-spacing:\s*-?\d*\.?\d+(px|em)?\s*[;}]/.test(kit),
      // the caps list carries the b20 status marker (.ob-status) beside the badge
      capsHome: (kit.match(/\.ob-caps\s*,\s*\.ob-badge\s*,\s*\.ob-status\s*,\s*\.ob-prompt__hint\s*\{/g) || []).length === 1 && !/\.ob-caps\s*\{/.test(tok),
      arm: /:is\(\.ob-caps,\s*\.ob-badge,\s*\.ob-status,\s*\.ob-prompt__hint\):is\(:lang\(ja\),\s*:lang\(ko\),\s*:lang\(zh\)\)/.test(kit),
      roles: ['.ob-control', '.ob-body', '.ob-hint', '.ob-place'].every((c) => (kit.match(new RegExp(c.replace('.', '\\.') + '\\s*\\{', 'g')) || []).length === 1)
        && (kit.match(/\.ob-title\s*,\s*\.ob-panel__title\s*,\s*\.ob-prompt__title\s*\{/g) || []).length === 1,
      tokens: /--ob-fs--1-cjk:\s*0\.8125rem/.test(tok) && /--ob-lh-glyph:\s*1;/.test(tok) && /--ob-track-display:\s*0\.02em/.test(tok),
      fontReset: /:where\(button, input, select, textarea, \[role="button"\]\):where\(\[class\*="ob-"\], \[class\*="ob-"\] \*\)\s*\{\s*font: inherit;/.test(kit),
      pbHairline: !/\.ob-pb-(head|foot|card-head|card-foot)[^{]*\{[^}]*dashed/.test(pbc) && /\.ob-pb-head\s*\{[^}]*border-bottom:\s*1px solid var\(--ob-line-0\)/.test(pbc),
      pbNoRestatedTitle: !/\.ob-pb-head h2\s*\{[^}]*font-size/.test(pbc),
      pbZ: !/z-index:\s*(70|59)\b/.test(pbc) && /z-index:\s*var\(--ob-z-dialog\)/.test(pbc),
    };
    check('hygiene B-K23 / B-K13 / B-K24 statics: kit.css has ONE ::-webkit-scrollbar (.ob-strip) + ONE thin rule with the kit scrollbar-color, no line-height / letter-spacing literal (kit.css + playback.css), the caps role lives ONCE in kit.css (not tokens.css) with the :lang(ja|ko|zh) arm, control / body / hint / place declared once and title ≡ panel__title ≡ prompt__title, the three new tokens, the zero-specificity font reset; playback.css head/foot hairlines (no dashed), no restated h2 title, dialog / scrim rungs',
      Object.values(st).every(Boolean), JSON.stringify(st));
  }
  // J14 DVR: titled by its launcher (B-K24 / ruling R15) over the hairline
  const dvrTitle = await chrome.eval(`(async () => {
    const p = window.__playback, i18n = window.__i18n;
    if (!p?.open || !i18n?.t) return { armed: false };
    const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const read = () => { const h = document.querySelector('#ob-pb-panel .ob-pb-head h2'); const head = document.querySelector('#ob-pb-panel .ob-pb-head');
      const cs = getComputedStyle(h); return { text: h.textContent, key: h.dataset.i18n, title: h.classList.contains('ob-title'), fs: parseFloat(cs.fontSize), fw: parseInt(cs.fontWeight, 10),
        divider: getComputedStyle(head).borderBottomStyle, dividerW: getComputedStyle(head).borderBottomWidth }; };
    const out = { armed: true, want: { place: i18n.t('shell.place.replays'), dflt: i18n.t('playback.title') } };
    await p.open({ title: 'shell.place.replays' }); await raf(); out.place = read(); p.close(); await raf();
    await p.open(); await raf(); out.dflt = read(); p.close(); await raf();
    await p.open({ title: 'no.such.key' }); await raf(); out.bad = read(); p.close(); await raf();
    return out;
  })()`);
  check('DVR B-K24: open({ title: "shell.place.replays" }) titles the list with the place noun (data-i18n rides the key), bare open() = playback.title, an unknown key falls back; the h2 wears .ob-title (16 / 620) over a 1 px SOLID hairline',
    dvrTitle.armed === true && dvrTitle.place.text === dvrTitle.want.place && dvrTitle.place.key === 'shell.place.replays'
    && dvrTitle.dflt.text === dvrTitle.want.dflt && dvrTitle.dflt.key === 'playback.title' && dvrTitle.bad.text === dvrTitle.want.dflt
    && dvrTitle.place.title && Math.abs(dvrTitle.place.fs - 16) < 0.6 && dvrTitle.place.fw === 620
    && dvrTitle.place.divider === 'solid' && dvrTitle.place.dividerW === '1px',
    JSON.stringify(dvrTitle));

  // J15. CONSUMER OVERRIDES (GH-668 S5 kit step 9 — the deletions). A static
  // grep over every surface sheet, app.html style block and web/app/*.js
  // injected style block (comment-stripped): the overrides the kit laws
  // forbid are red — a `.ob-btn` rule (not --row / --tile) re-opening
  // `white-space: normal` (G5 / B-K01), a `label` blanket that wraps or
  // flexes segments (B-K03), a `.ob-badge` that wraps (B-K21), an inset
  // focus ring (B-K06), `--ob-glass-glow` outside kit.css (G9 / B-K09),
  // a hand `mask-image` or a `[data-ob-fade-*]` pseudo band outside kit.css
  // (B-K04), an inner-card lift inside `@supports` (a second backdrop-filter
  // or --ob-glass-thin under the pane blur, B-K14) and uppercase on a strip
  // segment (R14 / B-K13). Literals survive only under a FROZEN shrink-only
  // ledger (file + selector + law + the slice that retires it; liveness =
  // a dead row is red). Red-proven on the step-8 bytes: 26 hits across
  // shell / replays / play / practice / atelier / settings-modal.
  {
    const OVERRIDE_OK = [ // [file, law, selector fragment (includes-match), reason + retiring slice]
      // (GH-668 S5 slice 3 G2 retired `ui/play.css segmented-blanket` — the play body wrap blanket no longer lists `label`)
      ['hud.js', 'badge-wrap', '#hud .ob-badge',
        'HUD match chips — GH-316 whole-chip squeeze ladder (the ONE whole-chip wrap; .hm-wrap swaps the pole, G5 kept by slice 3 G6): re-set with the S5 slice 3b HUD-family follow-up (GH-668; touch.css §3.11 work, issue filed at PR-open of the play slice)'],
    ];
    const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
    const isKit = (rel) => rel === 'ui/kit.css' || rel === 'ui/tokens.css';
    const files = ['app.html',
      ...fs.readdirSync(path.join(webDir, 'app')).filter((n) => n.endsWith('.js')),
      ...fs.readdirSync(path.join(webDir, 'app/ui')).filter((n) => /\.(css|js)$/.test(n)).map((n) => 'ui/' + n)];
    const supportsSpans = (src) => { const spans = []; const re = /@supports[^{]*\{/g; let m;
      while ((m = re.exec(src))) { let d = 1, i = m.index + m[0].length; while (i < src.length && d) { if (src[i] === '{') d++; else if (src[i] === '}') d--; i++; } spans.push([m.index, i]); }
      return spans; };
    const hits = [];
    for (const rel of files) {
      const abs = rel === 'app.html' ? path.join(webDir, rel) : path.join(webDir, 'app', rel);
      const src = strip(fs.readFileSync(abs, 'utf8'));
      const sup = supportsSpans(src);
      const re = /([^{}]*)\{([^{}]*)\}/g; let m;
      while ((m = re.exec(src))) { // innermost blocks; a JS statement end (;) never sits inside a selector
        const sel = m[1].split(';').pop().trim().replace(/\s+/g, ' '), b = m[2], at = m.index;
        const hit = (law) => hits.push({ rel, law, sel });
        if (isKit(rel)) { if (/box-shadow\s*:[^;]*\binset\b[^;]*--ob-focus/.test(b)) hit('inset-ring'); continue; }
        if (/\.ob-btn\b/.test(sel) && !/ob-btn--(row|tile)/.test(sel) && /white-space\s*:\s*normal/.test(b)) hit('pill-wrap');
        if (/(^|[\s>+~,])label\b/.test(sel) && /(white-space\s*:\s*normal|flex\s*:\s*1 1 0)/.test(b)) hit('segmented-blanket');
        if (/\.ob-badge\b/.test(sel) && /white-space\s*:\s*normal/.test(b)) hit('badge-wrap');
        if (/box-shadow\s*:[^;]*\binset\b[^;]*--ob-focus/.test(b)) hit('inset-ring');
        if (/--ob-glass-glow/.test(b)) hit('glow');
        if (/mask-image\s*:/.test(b)) hit('hand-mask');
        if (/\[data-ob-fade-(start|end|top|bottom)/.test(sel)) hit('hand-fade');
        if (sup.some(([a, z]) => at > a && at < z) && /(>\s*button|\.ob-eq-prov-row|\.ob-practice-card|\.ob-game-row|\.ob-cardrail-card)/.test(sel)
          && /(backdrop-filter\s*:\s*blur|--ob-glass-thin)/.test(b)) hit('inner-card-lift');
        if (/(ob-strip__seg|ob-atelier-station)/.test(sel) && /text-transform\s*:\s*uppercase/.test(b)) hit('strip-caps');
      }
    }
    const seen = new Set();
    const red = hits.filter((h) => { const row = OVERRIDE_OK.find(([f, law, frag]) => f === h.rel && law === h.law && h.sel.includes(frag)); if (row) seen.add(row); return !row; });
    const dead = OVERRIDE_OK.filter((row) => !seen.has(row)).map(([f, law, sel]) => `${f} ${law} ${sel}`);
    check('consumer overrides (step 9): no surface sheet / style block re-opens pill wrap on .ob-btn, wraps or flexes segment labels, wraps a badge, draws an inset focus ring, restates --ob-glass-glow, hand-masks or hand-fades a scroller, lifts an inner card inside @supports, or uppercases a strip segment — literals only under the frozen OVERRIDE_OK ledger (liveness held)',
      red.length === 0 && dead.length === 0, JSON.stringify({ red: red.map((h) => ({ ...h, sel: h.sel.slice(0, 200) })), dead, ledgered: [...seen].map((r) => r[0] + ' ' + r[1]) }));
  }

  // page-1 app-error gate BEFORE navigating away (fresh page wipes __test)
  const errs1 = await chrome.eval('window.__test.errors');
  if (errs1.length) fail('app errors (behavior page): ' + errs1.join(' | '));

  // I. reduced-motion boot: emulate the media feature, reload, kit must run
  // instant (duration ~ 0) while staying fully functional
  await chrome.send('Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await chrome.send('Page.navigate', { url: `${APP_URL}&obtool=1` });
  await waitReady();
  const rm = await chrome.eval(`(async () => {
    const m = await import('./app/ui/motion.js');
    const d = document.createElement('div');
    d.style.display = 'none';
    document.body.appendChild(d);
    const t0 = performance.now();
    await m.enter(d);
    const enterMs = performance.now() - t0;
    const shown = getComputedStyle(d).display !== 'none';
    const t1 = performance.now();
    await m.exit(d);
    const exitMs = performance.now() - t1;
    const hidden = getComputedStyle(d).display === 'none';
    d.remove();
    // B-K22 mount law under reduced motion: instant, hidden truthful, no residue
    const d2 = document.createElement('div'); d2.hidden = true; document.body.appendChild(d2);
    const t2 = performance.now(); await m.mount?.(d2); const mountMs = performance.now() - t2;
    const mounted = d2.hidden === false && getComputedStyle(d2).display !== 'none';
    const t3 = performance.now(); await m.unmount?.(d2); const unmountMs = performance.now() - t3;
    const unmounted = d2.hidden === true && getComputedStyle(d2).display === 'none'
      && d2.style.display === '' && d2.style.opacity === '' && d2.style.transform === '';
    d2.remove();
    return { mq: matchMedia('(prefers-reduced-motion: reduce)').matches,
      reduced: m.reduced, enterMs, exitMs, shown, hidden,
      hasMount: typeof m.mount === 'function', mountMs, mounted, unmountMs, unmounted };
  })()`);
  check('reduced-motion: emulated media reaches the page', rm.mq === true);
  check('reduced-motion: motion.reduced live binding is true at boot', rm.reduced === true);
  check('reduced-motion: enter/exit are instant and still land visibility',
    rm.enterMs < 80 && rm.exitMs < 80 && rm.shown && rm.hidden, JSON.stringify(rm));
  check('reduced-motion: B-K22 mount / unmount are instant, `hidden` lands truthfully with no inline residue',
    rm.hasMount && rm.mountMs < 80 && rm.unmountMs < 80 && rm.mounted && rm.unmounted, JSON.stringify(rm));
  await chrome.send('Emulation.setEmulatedMedia', { features: [] });
}

// ---- feature 024 (T015): help overlay behavior block -----------------------
// Desktop CDP arm over the FROZEN help-overlay.md selectors (§6): the three
// entry points, the three close paths with focus restore, the settings-row
// sequential hand-off, arrow-key containment (SC-008), `?` guard-set
// inertness, desktop mode ordering (SC-003 arm 1), layered Escape over the
// export dialog, the reduced-motion arm, and — LAST, it navigates under a
// Fetch intercept — the stale-graph degradation arm (no help.js ⇒ no entry
// points, app intact, zero errors). Runs red until lane A merges (T024).
async function runHelpBlock() {
  console.log('[e2e-ui] ---- 024 help overlay block ----');
  await chrome.send('Page.navigate', { url: `${APP_URL}&obtool=1&arm=help` });
  await waitReady();
  await sleep(800); // guarded help.js import settles post-boot

  const surface = await chrome.eval(`({
    help: !!window.__help, open: typeof window.__help?.open === 'function',
    close: typeof window.__help?.close === 'function',
    isOpen: typeof window.__help?.isOpen === 'function',
    mode: window.__help?.mode?.() ?? null,
    pill: !!document.getElementById('ob-help') })`);
  check('help: __help surface {open,close,isOpen,mode} + #ob-help pill',
    surface.help && surface.open && surface.close && surface.isOpen
    && surface.pill, JSON.stringify(surface));
  check("help: mode() reports 'fine' on a desktop boot (R1 signal)",
    surface.mode === 'fine', String(surface.mode));
  if (!surface.help || !surface.pill) {
    fail('help: overlay surface absent — skipping the remaining 024 arms');
    return;
  }

  // H1. toolbar pill: DOM placement + open; close via Escape; focus restore
  const h1 = await chrome.eval(`(() => {
    const pill = document.getElementById('ob-help');
    const out = { inToolbar: pill.parentElement?.id === 'ob-toolbar',
      tbOrder: pill.dataset.tbOrder };
    pill.focus();
    pill.click();
    const panel = document.getElementById('ob-help-panel');
    out.opened = !!panel && panel.getClientRects().length > 0;
    out.role = panel?.getAttribute('role');
    out.modal = panel?.getAttribute('aria-modal');
    out.labelled = !!panel?.getAttribute('aria-labelledby');
    out.isOpen = window.__help.isOpen();
    return out;
  })()`);
  check('help: pill opens the panel (role=dialog, aria-modal, labelledby)',
    h1.inToolbar && h1.tbOrder === '5' && h1.opened && h1.role === 'dialog'
    && h1.modal === 'true' && h1.labelled && h1.isOpen === true,
    JSON.stringify(h1));
  await pressKey('Escape', 'Escape', 27);
  await sleep(500);
  const h1c = await chrome.eval(`({
    open: window.__help.isOpen(),
    gone: !document.getElementById('ob-help-panel')
      || document.getElementById('ob-help-panel').getClientRects().length === 0,
    focus: document.activeElement?.id })`);
  check('help: Escape closes + focus restored to the pill',
    h1c.open === false && h1c.gone && h1c.focus === 'ob-help',
    JSON.stringify(h1c));

  // H2. `?` shortcut (produced character) opens; #ob-help-close closes
  await chrome.eval(`document.getElementById('shoot')?.focus()`);
  await pressKey('?', 'Slash', 191); // rawKeyDown: e.key === '?' (contract §3); no text pipeline (ledger §4 storm)
  await sleep(500);
  const h2 = await chrome.eval(`({
    open: window.__help.isOpen(),
    closeBtn: !!document.getElementById('ob-help-close') })`);
  check('help: `?` opens (plain-button focus passes through, aim.js law parity)',
    h2.open === true && h2.closeBtn, JSON.stringify(h2));
  await chrome.eval(`document.getElementById('ob-help-close').click()`);
  await sleep(500);
  const h2c = await chrome.eval(`({ open: window.__help.isOpen(),
    focus: document.activeElement?.id })`);
  check('help: close control closes + focus restored',
    h2c.open === false && h2c.focus === 'shoot', JSON.stringify(h2c));

  // H3. backdrop close path
  await chrome.eval(`window.__help.open('api')`);
  await sleep(400);
  const h3o = await chrome.eval('window.__help.isOpen()');
  await chrome.eval(`(document.querySelector('.ob-backdrop--top')
    ?? document.querySelector('.ob-backdrop'))?.click()`);
  await sleep(500);
  const h3 = await chrome.eval(`({ open: window.__help.isOpen(),
    backdrops: document.querySelectorAll('.ob-backdrop').length })`);
  check('help: backdrop click closes, zero stranded backdrops',
    h3o === true && h3.open === false && h3.backdrops === 0,
    JSON.stringify(h3));

  // H4. open() is a no-op while open; never throws in any machine state
  const h4 = await chrome.eval(`(() => {
    window.__help.open('api');
    const el1 = document.getElementById('ob-help-panel');
    window.__help.open('api'); // no-op, never a second panel
    const panels = document.querySelectorAll('#ob-help-panel').length;
    const same = document.getElementById('ob-help-panel') === el1;
    window.__help.close();
    return { panels, same };
  })()`);
  check('help: open() while open is a no-op (one panel, same node)',
    h4.panels === 1 && h4.same === true, JSON.stringify(h4));
  await sleep(400);

  // H5. settings About row: sequential hand-off (FR-009) — modal closes
  // FIRST via its own path, then the overlay opens; no stacked backdrop
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await sleep(500);
  await chrome.eval(`window.__settings.show('about')`);
  await sleep(200);
  const h5row = await chrome.eval(`(() => {
    const row = document.getElementById('ob-about-help');
    return { present: !!row, visible: !!row && !row.hidden
      && row.getClientRects().length > 0 };
  })()`);
  check('help: settings About row present + visible while __help exists',
    h5row.present && h5row.visible, JSON.stringify(h5row));
  await chrome.eval(`document.getElementById('ob-about-help').click()`);
  let h5 = null;
  for (let i = 0; i < 25; i++) {
    await sleep(200);
    h5 = await chrome.eval(`({
      helpOpen: window.__help.isOpen(),
      settingsGone: document.getElementById('ob-settings')
        .getClientRects().length === 0,
      backdrops: document.querySelectorAll('.ob-backdrop').length })`);
    if (h5.helpOpen && h5.settingsGone) break;
  }
  check('help: settings row — modal closes FIRST, overlay opens, no stacked '
    + 'backdrop (FR-009 sequential hand-off)',
  h5.helpOpen === true && h5.settingsGone === true && h5.backdrops <= 1,
  JSON.stringify(h5));

  // H6. arrow-key containment while open (SC-008): a real ArrowLeft/ArrowUp
  // volley must produce ZERO phi/power delta; a control press after close
  // proves the same keys DO steer again (wiring sanity)
  await chrome.eval(`window.__e2eHelp = {
    phi: window.__aim.getPhi(),
    power: document.getElementById('power').value }; true`);
  for (let i = 0; i < 6; i++) await pressKey('ArrowLeft', 'ArrowLeft', 37);
  for (let i = 0; i < 4; i++) await pressKey('ArrowUp', 'ArrowUp', 38);
  await sleep(300);
  const h6 = await chrome.eval(`({
    samePhi: window.__aim.getPhi() === window.__e2eHelp.phi,
    samePower: document.getElementById('power').value
      === window.__e2eHelp.power,
    stillOpen: window.__help.isOpen() })`);
  check('help: arrow volley with the overlay open — zero phi/power delta '
    + '(SC-008 containment)',
  h6.samePhi && h6.samePower && h6.stillOpen, JSON.stringify(h6));
  await chrome.eval('window.__help.close()');
  await sleep(500);
  await pressKey('ArrowLeft', 'ArrowLeft', 37);
  await sleep(200);
  const h6s = await chrome.eval(
    'window.__aim.getPhi() !== window.__e2eHelp.phi');
  check('help: after close the same arrow steers again (containment released '
    + '+ volley wiring sane)', h6s === true);

  // H7. `?` inert in the guard set (text control / combobox / contenteditable)
  const h7 = { input: null, combo: null, editable: null };
  await chrome.eval(`(() => {
    const fix = document.createElement('div');
    fix.id = 'ob-help-fix';
    fix.style.cssText = 'position:fixed;top:8px;left:340px;z-index:90;';
    fix.innerHTML = '<input id="ob-help-fix-in" type="text">'
      + '<div id="ob-help-fix-cb" role="combobox" tabindex="0">cb</div>'
      + '<div id="ob-help-fix-ed" contenteditable="true" tabindex="0">ed</div>';
    document.body.appendChild(fix);
  })()`);
  for (const [key, id] of [['input', 'ob-help-fix-in'],
    ['combo', 'ob-help-fix-cb'], ['editable', 'ob-help-fix-ed']]) {
    await chrome.eval(`document.getElementById('${id}').focus()`);
    await pressKey('?', 'Slash', 191); // rawKeyDown: e.key === '?' (contract §3); no text pipeline (ledger §4 storm)
    await sleep(250);
    h7[key] = await chrome.eval('window.__help.isOpen()');
    await chrome.eval('window.__help.close()'); // hygiene if a guard leaked
    await sleep(150);
  }
  await chrome.eval(`document.getElementById('ob-help-fix').remove()`);
  check('help: `?` inert in text input / [role=combobox] / contenteditable '
    + '(aim.js guard-set parity)',
  h7.input === false && h7.combo === false && h7.editable === false,
  JSON.stringify(h7));

  // H8. desktop mode ordering (SC-003 arm 1): mouse first, touch present
  // but collapsed — asserted as DOCUMENT ORDER of [data-section]
  await chrome.eval(`window.__help.open('api')`);
  await sleep(400);
  const h8 = await chrome.eval(`(() => {
    const secs = [...document.querySelectorAll(
      '#ob-help-panel section[data-section]')];
    const touch = secs.find((s) => s.dataset.section === 'touch');
    const disclose = touch?.querySelector('.ob-help__disclose');
    const region = touch?.querySelector('.ob-help__region');
    return { order: secs.map((s) => s.dataset.section).join(','),
      touchCollapsed: disclose?.getAttribute('aria-expanded') === 'false'
        && !!region?.hidden,
      headerVisible: !!disclose && disclose.getClientRects().length > 0 };
  })()`);
  check('help: desktop ordering — mouse first, all six sections, touch '
    + 'collapsed but reachable (SC-003 arm 1)',
  h8.order === 'mouse,trackpad,keyboard,touch,flow,games'
    && h8.touchCollapsed && h8.headerVisible, JSON.stringify(h8));

  // H8b. F1 regression (fix-024-f1, delivery-record §4): this suite serves
  // web/ ALONE, so the R5 guide probe misses by design and the guide anchor
  // must be NOT VISIBLE — [hidden] must actually suppress layout (the author
  // display:inline-flex rule once defeated the UA [hidden] rule; help.css
  // now pins .ob-help__guide[hidden] { display: none }).
  const h8b = await chrome.eval(`(() => {
    const a = document.querySelector('#ob-help-panel .ob-help__guide');
    if (!a) return { present: false };
    return { present: true, hidden: a.hidden,
      display: getComputedStyle(a).display,
      offsetParentNull: a.offsetParent === null,
      rects: a.getClientRects().length };
  })()`);
  check('help: guide anchor NOT VISIBLE on a web/-alone serve (F1 fix — '
    + '[hidden] anchor computes display:none, offsetParent null)',
  !h8b.present || (h8b.hidden === true && h8b.display === 'none'
    && h8b.offsetParentNull === true && h8b.rects === 0),
  JSON.stringify(h8b));

  // H8c. the project-site backlink shares H8b's law verbatim: it rides the
  // SAME probe result (never probes on its own), so this web/-alone serve
  // must leave .ob-help__site hidden AND out of layout (help.css pins
  // .ob-help__site[hidden] { display: none } on the guide's register).
  const h8c = await chrome.eval(`(() => {
    const a = document.querySelector('#ob-help-panel .ob-help__site');
    if (!a) return { present: false };
    return { present: true, hidden: a.hidden,
      display: getComputedStyle(a).display,
      offsetParentNull: a.offsetParent === null,
      rects: a.getClientRects().length };
  })()`);
  check('help: site anchor NOT VISIBLE on a web/-alone serve (shares the '
    + 'guide probe — [hidden] computes display:none, offsetParent null)',
  !h8c.present || (h8c.hidden === true && h8c.display === 'none'
    && h8c.offsetParentNull === true && h8c.rects === 0),
  JSON.stringify(h8c));

  // H8d. site-backlink stale-dictionary gate (help.js knowsSiteKey; the
  // GH-313 hasLocal register): a fresh module can meet a PRE-CHANGE cached
  // locale JSON that lacks help.games.site. Reproduced with a live locale
  // switch whose dictionary fetch is stubbed in-page to the REAL <alt>
  // dictionary MINUS that one key (the exact mixed-cache pairing; every
  // other key stays, so the rest of the relabel is warn-free). The gate
  // must blank the label (never a literal-key paint, never an [i18n]
  // missing-key entry) and keep the anchor hidden; guide — whose key
  // predates the site link — must keep its localized label. Switching back
  // re-composes the label (the stale → fresh direction); hidden persists
  // here only because THIS serve's probe misses (H8b/H8c). The anchor must
  // stay UNBOUND from data-i18n (the load-bearing half of the fix: main.js
  // applyStatic sweeps document-wide FIRST on every switch, so a bound key
  // would leak into __i18n.missing() before help's relabel could act —
  // exactly what this arm's first cut caught). Await rides i18n's own
  // setLocale promise (the H-block toolbar arm's precedent), fetch
  // restored in finally.
  const h8d = await chrome.eval(`(async () => {
    const i18n = window.__i18n;
    const site = document.querySelector('#ob-help-panel .ob-help__site');
    const guide = document.querySelector('#ob-help-panel .ob-help__guide');
    if (!i18n?.setLocale || !site) return { armed: false, site: !!site };
    const was = i18n.locale();
    const alt = was === 'de' ? 'fr' : 'de';
    const realFetch = window.fetch;
    const out = { armed: true, was, alt,
      bound: 'i18n' in site.dataset };
    try {
      window.fetch = async (url, opts) => {
        if (String(url).includes('/locales/' + alt + '.json')) {
          const d = await (await realFetch(url, opts)).json();
          delete d['help.games.site'];
          return new Response(JSON.stringify(d), { status: 200,
            headers: { 'Content-Type': 'application/json' } });
        }
        return realFetch(url, opts);
      };
      await i18n.setLocale(alt);
      out.staleLabel = site.textContent;
      out.staleHidden = site.hidden;
      out.staleGuideOk = !!guide && guide.textContent !== ''
        && guide.textContent !== 'help.games.guide';
      out.missingLeak = (i18n.missing?.() ?? [])
        .includes('help.games.site');
    } finally {
      window.fetch = realFetch;
      await i18n.setLocale(was);
    }
    out.freshLabelOk = site.textContent !== ''
      && site.textContent !== 'help.games.site';
    out.freshHidden = site.hidden;
    return out;
  })()`);
  check('help: site link stale-dictionary gate — pre-change dictionary '
    + 'blanks the t()-composed label (hidden, no literal key, no '
    + 'missing-key leak, never data-i18n-bound; guide unaffected), fresh '
    + 'dictionary re-composes it',
  h8d.armed === true && h8d.bound === false && h8d.staleLabel === ''
    && h8d.staleHidden === true && h8d.staleGuideOk === true
    && h8d.missingLeak === false && h8d.freshLabelOk === true
    && h8d.freshHidden === true,
  JSON.stringify(h8d));
  await chrome.eval('window.__help.close()');
  await sleep(400);

  // H9. layered Escape over the export dialog: topmost (help) closes first
  await chrome.eval('window.__export.open()');
  await sleep(400);
  await chrome.eval(`window.__help.open('api')`);
  await sleep(400);
  await pressKey('Escape', 'Escape', 27);
  await sleep(500);
  const h9a = await chrome.eval(`({
    help: window.__help.isOpen(),
    exportUp: !!document.querySelector('#ob-export-card')
      && document.querySelector('#ob-export-card').getClientRects().length > 0 })`);
  check('help: layered Escape — help (topmost) closes first, export survives',
    h9a.help === false && h9a.exportUp === true, JSON.stringify(h9a));
  await chrome.eval('window.__export.close()');
  await sleep(400);

  // H10. reduced-motion arm: open/close still lands under
  // prefers-reduced-motion: reduce (e2e-settings precedent)
  await chrome.send('Emulation.setEmulatedMedia',
    { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await chrome.send('Page.navigate', { url: `${APP_URL}&obtool=1&arm=help-rm` });
  await waitReady();
  await sleep(800);
  const h10 = await chrome.eval(`(async () => {
    if (!window.__help) return { present: false };
    window.__help.open('api');
    await new Promise((r) => setTimeout(r, 250));
    const opened = window.__help.isOpen()
      && document.getElementById('ob-help-panel').getClientRects().length > 0;
    window.__help.close();
    await new Promise((r) => setTimeout(r, 400));
    return { present: true, opened, closed: !window.__help.isOpen() };
  })()`);
  check('help: reduced-motion boot still opens/closes the overlay',
    h10.present && h10.opened && h10.closed, JSON.stringify(h10));
  await chrome.send('Emulation.setEmulatedMedia', { features: [] });

  // H10k. STALE-KIT pairing for the row belts (GH-668 review r1 P2; the
  // the ownership ledger mixed-cache rule): a returning client can pair FRESH
  // feature sheets with a cached kit.css that has no .ob-btn--row part.
  // Served here as the CURRENT kit MINUS its --row rules (the exact
  // pairing) under a Fetch intercept; every migrated leaf sheet must
  // degrade its rows to the ROW register (wrap / start / mid pole / 44
  // floor) through its own belt — never a nowrap pill. Red on the bytes
  // that deleted the local declarations without a belt. The handler is
  // registered BEFORE the shared H11 one and acts ONLY on the kit.css URL
  // (silent otherwise — no double continue on H11 / H12 pauses).
  const kitSrc = fs.readFileSync(path.join(webDir, 'app', 'ui', 'kit.css'), 'utf8');
  const staleKit = kitSrc
    .replace(/\.ob-btn--row \.ob-btn__label\s*\{[^}]*\}/g, '')
    .replace(/\.ob-btn--row\s*\{[^}]*\}/g, '');
  if (staleKit === kitSrc || /\.ob-btn--row\s*\{/.test(staleKit)) fail('stale-kit arm: could not synthesize a kit without the --row part');
  // review r2 P2-3 second pass of the same lab: kit.css served 404 (the kit
  // fetch fails outright — the flag flips between the two navigations)
  let kit404 = false, kit404Served = 0;
  chrome.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused' || !/\/app\/ui\/kit\.css(\?|$)/.test(params.request.url)) return;
    if (kit404) {
      kit404Served += 1;
      chrome.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 404,
        responseHeaders: [{ name: 'Content-Type', value: 'text/plain' }], body: Buffer.from('kit 404 (e2e-ui stale-kit lab)').toString('base64') });
      return;
    }
    chrome.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'text/css' }],
      body: Buffer.from(staleKit).toString('base64') });
  });
  await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*app/ui/kit.css*' }] });
  await chrome.send('Network.enable');
  await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
  await chrome.send('Page.navigate', { url: `${APP_URL}&obshell=1&arm=stale-kit` });
  await waitReady();
  await sleep(1500);
  const sk = await chrome.eval(`(async () => {
    const out = { kitHasRow: null, shell: !!window.__shell, counts: {}, bad: [] };
    for (const sh of document.styleSheets) { if (!/ui\\/kit\\.css/.test(sh.href || '')) continue; out.kitHasRow = false;
      try { for (const r of sh.cssRules) if (r.selectorText === '.ob-btn--row' || r.selectorText === '.ob-btn--row .ob-btn__label') out.kitHasRow = true; } catch {} }
    const read = (tag) => { for (const b of document.querySelectorAll('.ob-btn.ob-btn--row')) { const cs = getComputedStyle(b);
      const lab = b.querySelector(':scope > .ob-btn__label'); const lcs = lab ? getComputedStyle(lab) : null;
      const row = { tag, name: b.id || b.dataset.ob || b.dataset.i18n || (b.textContent || '').trim().slice(0, 24), ws: cs.whiteSpace, ta: cs.textAlign,
        jc: cs.justifyContent, r: cs.borderRadius, mh: cs.minHeight, lab: lcs ? lcs.whiteSpace : null };
      out.counts[tag] = (out.counts[tag] || 0) + 1;
      if (row.ws !== 'normal' || !(row.ta === 'start' || row.ta === 'left') || row.jc !== 'flex-start' || row.r !== '10px'
        || parseFloat(row.mh) < 44 || (lcs && row.lab !== 'normal')) out.bad.push(row); } };
    const landed = async () => { for (let i = 0; i < 50 && !(window.__shell?.isOpen?.() && window.__shell.moving() === false); i++) await new Promise((r) => setTimeout(r, 100)); };
    await landed(); read('hall');
    for (const p of ['replays', 'practice', 'play', 'equipment']) { try { window.__shell.go(p); } catch {} await landed(); await new Promise((r) => setTimeout(r, 500)); read(p); }
    return out; })()`);
  check('stale-kit pairing: a kit.css WITHOUT the --row part + fresh leaf sheets — every migrated .ob-btn--row still degrades to the ROW register (the leaf-sheet belts)',
    sk.kitHasRow === false && sk.shell && Object.values(sk.counts).reduce((a, b) => a + b, 0) >= 4 && sk.bad.length === 0,
    JSON.stringify(sk).slice(0, 700));
  const skErrs = await chrome.eval('window.__test.errors');
  if (skErrs.length) fail('stale-kit arm: app errors: ' + skErrs.join(' | '));
  // H10k-404 (GH-668 review r2 P2-3): the SAME lab with kit.css served 404.
  // The notice register (#ob-shell-note) lived in shell.css before slice 2
  // migrated it onto the kit .ob-prompt--notice; a shell.css without a belt
  // left the migrated notice in static flow BELOW the viewport (body
  // overflow hidden — unreachable). Law: the notice's rect sits inside the
  // viewport through the shell.css belt (fixed / inset-inline / bottom +
  // lift / z-index / max-width, no chrome). The notice is raised through the
  // replays place's honest register (`__replays.open` on a vanished id ->
  // shell.place.replays.notice.gone — the e2e-replays leg 7 idiom).
  kit404 = true; expectKit404 = true;
  await chrome.send('Page.navigate', { url: `${APP_URL}&obshell=1&arm=stale-kit-404` });
  await waitReady();
  await sleep(1500);
  const sk4 = await chrome.eval(`(async () => {
    const out = { shell: !!window.__shell, replays: false, note: null, vw: innerWidth, vh: innerHeight, errors: (window.__test?.errors || []).length };
    const landed = async () => { for (let i = 0; i < 50 && !(window.__shell?.isOpen?.() && window.__shell.moving() === false); i++) await new Promise((r) => setTimeout(r, 100)); };
    await landed();
    // the replays leaf mounts on ARRIVAL at the place (035 contract §3)
    try { window.__shell.go('replays'); } catch {}
    await landed();
    for (let i = 0; i < 80 && typeof window.__replays?.open !== 'function'; i++) await new Promise((r) => setTimeout(r, 150));
    out.replays = typeof window.__replays?.open === 'function';
    if (out.replays) { try { window.__replays.open('no-such-session'); } catch {} }
    for (let i = 0; i < 30 && !document.getElementById('ob-shell-note'); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 200));
    const n = document.getElementById('ob-shell-note');
    if (n) { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n);
      out.note = { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height, pos: cs.position, z: cs.zIndex, text: (n.textContent || '').slice(0, 40) };
      // CASCADE (review r2v P3): with kit.css 404 the shell.css belt is the
      // WINNER — its selector is :where()-wrapped (zero specificity, so the
      // kit outranks it whenever present: e2e-shell G4 proves that side), the
      // computed max-width is the belt's own declaration (resolved on a probe
      // box) and perturbing the belt's max-width in the CSSOM (restored in
      // the same task) MOVES the computed value.
      out.cascade = { kitSheets: 0, beltSel: null, beltMw: null, beltResolved: null, mw: cs.maxWidth, perturbed: null, err: '' };
      try {
        const walk = (rules, acc) => { for (const r of rules) {
          if (r.type === 4) { if (!r.media || matchMedia(r.media.mediaText).matches) walk(r.cssRules, acc); }
          else if (r.selectorText && r.style) acc.push(r); } return acc; };
        let beltRules = [];
        for (const sh of document.styleSheets) { const href = sh.href || '';
          if (/ui\\/kit\\.css/.test(href)) { try { if (sh.cssRules.length) out.cascade.kitSheets += 1; } catch {} }
          if (/ui\\/shell\\.css/.test(href)) { try { beltRules = walk(sh.cssRules, []); } catch {} } }
        const belt = beltRules.filter((r) => /#ob-shell-note\\)?$/.test(r.selectorText) && r.style.maxWidth).pop();
        if (belt) { out.cascade.beltSel = belt.selectorText; out.cascade.beltMw = belt.style.maxWidth;
          const p = document.createElement('div'); p.style.cssText = 'position:fixed;visibility:hidden;left:0;right:0;width:fit-content'; p.style.maxWidth = belt.style.maxWidth;
          document.body.appendChild(p); out.cascade.beltResolved = getComputedStyle(p).maxWidth; p.remove();
          const was = belt.style.maxWidth; belt.style.setProperty('max-width', '333px'); out.cascade.perturbed = getComputedStyle(n).maxWidth; belt.style.setProperty('max-width', was); }
      } catch (e) { out.cascade.err = String(e); } }
    return out; })()`);
  const nr = sk4.note;
  const noteInside = !!nr && nr.w > 0 && nr.h > 0 && nr.t >= 0 && nr.l >= 0 && nr.b <= sk4.vh + 0.5 && nr.r <= sk4.vw + 0.5;
  check('stale-kit lab, kit.css served 404: the shell notice (#ob-shell-note) is raised INSIDE the viewport through the shell.css belt (fixed / inset-inline / bottom + lift / z-index / max-width — no chrome)',
    kit404Served > 0 && sk4.shell && sk4.replays && noteInside,
    `kit404Served=${kit404Served} ${JSON.stringify(sk4).slice(0, 500)}`);
  const kc = sk4.cascade;
  check('stale-kit lab, kit.css served 404 (review r2v P3): the shell.css belt is :where()-wrapped (zero specificity — the kit wins when present) AND is the cascade winner here: no kit rules loaded, computed max-width == the belt\'s own declaration, a perturbed belt value moves the computed box',
    !!kc && !kc.err && kc.kitSheets === 0 && /^:where\(/.test(kc.beltSel || '') && !!kc.beltMw && kc.mw === kc.beltResolved && kc.perturbed === '333px',
    JSON.stringify(kc));
  // H10k-404-D (GH-738): the SAME lab, the ROUTED decision prompt.
  // #ob-shell-decision IS the kit .ob-prompt--routed part (S5 slice 2, PR
  // #726); with kit.css 404 it fell into static flow BEHIND the absolutely
  // positioned place cards while the critical block hides #hud-decision — a
  // pending decision was unanswerable (each answer's centre hit-tested the
  // Play card). Law: the shell.css belt (:where(), the notice belt's twin)
  // keeps the prompt FIXED inside the viewport, above the cards, at the kit's
  // routed placement; every answer's centre hit-tests the answer; a REAL
  // click / tap answers. Raised through the carom boot (the e2e-shell E /
  // G4 D1 idiom: a carom_3cushion profile boots into a pending break_spot);
  // the profile keys are restored at the end. RED on the main bytes
  // 0120202e (position static, rect 0..vw, hits B / SPAN).
  const savedProfile = await chrome.eval(`({ s: localStorage.getItem('ob-settings-v1'), sh: localStorage.getItem('ob-shell-v1') })`);
  const bootCaromDecision = async (arm) => {
    await chrome.eval(`(() => { localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'carom_3cushion' }));
      localStorage.setItem('ob-shell-v1', JSON.stringify({ v: 1, lastPlace: 'play', startAtTable: false })); return true; })()`);
    await chrome.send('Page.navigate', { url: `${APP_URL}&obshell=1&arm=${arm}` });
    await waitReady();
    return chrome.eval(`(async () => {
      const w = async (f, n, ms) => { for (let i = 0; i < n; i++) { if (f()) return true; await new Promise((r) => setTimeout(r, ms)); } return false; };
      const pend = await w(() => window.__rules?.matchState?.()?.pendingDecision?.kind === 'break_spot', 60, 250);
      // the shell module lands AFTER __test.ready on a loaded box (e2e-shell G7 r7) — wait for it, never assume it
      const shell = await w(() => typeof window.__shell?.openShell === 'function', 40, 250);
      const entry = shell && (window.__shell.isOpen() || window.__shell.openShell() === true);
      const up = await w(() => document.querySelectorAll('#ob-shell-decision .osd-btns button').length === 2, 40, 200);
      await new Promise((r) => setTimeout(r, 400));
      return { pend, entry, up }; })()`);
  };
  const READ_DEC_BELT = `(() => {
    const p = document.getElementById('ob-shell-decision');
    const out = { up: !!p, vw: innerWidth, vh: innerHeight, touch: document.documentElement.classList.contains('ob-touch'), coarse: matchMedia('(pointer: coarse)').matches,
      kitSheets: 0, errors: (window.__test?.errors || []).length, place: document.getElementById('ob-shell')?.className || '' };
    for (const sh of document.styleSheets) if (/ui\\/kit\\.css/.test(sh.href || '')) { try { if (sh.cssRules.length) out.kitSheets += 1; } catch {} }
    if (!p) return out;
    const cs = getComputedStyle(p); const r = p.getBoundingClientRect();
    out.rect = { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; out.pos = cs.position; out.z = cs.zIndex; out.top = cs.top;
    const card = document.querySelector('#ob-shell-cards > section:not([hidden])'); const c = card ? card.getBoundingClientRect() : null;
    out.card = c && { l: c.left, t: c.top, r: c.right, b: c.bottom };
    out.ovlCard = c ? Math.max(0, Math.min(r.right, c.right) - Math.max(r.left, c.left)) * Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top)) : 0;
    out.btns = [...p.querySelectorAll('.osd-btns button')].map((b) => { const br = b.getBoundingClientRect(); const cx = br.left + br.width / 2, cy = br.top + br.height / 2;
      const hit = document.elementFromPoint(cx, cy); return { cx, cy, w: br.width, h: br.height, hitIsAnswer: !!hit && (hit === b || b.contains(hit)), hit: hit ? (hit.id || hit.className || hit.tagName) : null }; });
    // CASCADE (the notice's review r2v P3 probe, on the prompt's signature
    // property): the belt is the WINNER here — its :where() rule declares
    // top, and perturbing that top in the CSSOM (restored in the same task)
    // MOVES the computed top. e2e-shell G4 D1 proves the kit side.
    out.cascade = { beltSel: null, beltTop: null, perturbed: null, err: '' };
    try { const walk = (rules, acc) => { for (const x of rules) { if (x.type === 4) { if (!x.media || matchMedia(x.media.mediaText).matches) walk(x.cssRules, acc); } else if (x.selectorText && x.style) acc.push(x); } return acc; };
      let belt = null; for (const sh of document.styleSheets) if (/ui\\/shell\\.css/.test(sh.href || '')) { try { belt = walk(sh.cssRules, []).filter((x) => /#ob-shell-decision\\)$/.test(x.selectorText) && x.style.top).pop(); } catch {} }
      if (belt) { out.cascade.beltSel = belt.selectorText; out.cascade.beltTop = belt.style.top; const was = belt.style.top; belt.style.setProperty('top', '333px'); out.cascade.perturbed = getComputedStyle(p).top; belt.style.setProperty('top', was); }
    } catch (e) { out.cascade.err = String(e); }
    return out; })()`;
  const decInside = (o) => !!o.rect && o.rect.w > 0 && o.rect.h > 0 && o.rect.t >= 0 && o.rect.l >= 0 && o.rect.b <= o.vh + 0.5 && o.rect.r <= o.vw + 0.5;
  const decHits = (o) => Array.isArray(o.btns) && o.btns.length === 2 && o.btns.every((b) => b.hitIsAnswer);
  const dA = await bootCaromDecision('stale-kit-404-decision');
  const dFine = await chrome.eval(READ_DEC_BELT);
  check('stale-kit lab, kit.css served 404 (GH-738): the ROUTED decision prompt (#ob-shell-decision) is FIXED inside the viewport through the shell.css belt at the kit\'s top-centre law (sp-3 top, centred), ABOVE the place cards (zero overlap with the open card; elementFromPoint at every answer\'s centre is the answer)',
    kit404Served > 0 && dA.pend && dA.entry && dA.up && dFine.up && dFine.kitSheets === 0 && dFine.pos === 'fixed' && decInside(dFine) && dFine.ovlCard === 0 && decHits(dFine)
      && Math.abs(dFine.rect.t - 12) <= 1 && Math.abs((dFine.rect.l + dFine.rect.r) / 2 - dFine.vw / 2) <= 1,
    JSON.stringify({ dA, dFine }).slice(0, 900));
  check('stale-kit lab, kit.css served 404 (GH-738): the decision belt is :where()-wrapped (zero specificity — the kit wins when present: e2e-shell G4 D1) AND the cascade winner here — no kit rules loaded, a perturbed belt top moves the computed top',
    !!dFine.cascade && !dFine.cascade.err && /^:where\(/.test(dFine.cascade.beltSel || '') && !!dFine.cascade.beltTop && dFine.cascade.perturbed === '333px', JSON.stringify(dFine.cascade));
  // the EQUIPMENT place <= 1180 px: the GH-698 anchor (top = 14 + 64 + sp-3
  // below the station strip, the 12 px right band) rides the shell.js
  // critical block — present under a kit 404 by construction — and takes
  // effect on the belt's fixed box
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await chrome.eval(`(async () => { try { window.__shell.go('equipment'); } catch {}
    for (let i = 0; i < 50 && !(window.__shell?.isOpen?.() && window.__shell.moving() === false && /ob-shell-at-equipment/.test(document.getElementById('ob-shell')?.className || '')); i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 600)); return true; })()`);
  const dEq = await chrome.eval(READ_DEC_BELT);
  check('stale-kit lab, kit.css served 404 (GH-738): at the EQUIPMENT place at 1024 px the prompt keeps the GH-698 anchor (top 90 = 14 + 64 + sp-3 below the station strip, the 12 px right band — the shell.js critical-block voice on the belt\'s fixed box), inside the viewport, answers hit-testable',
    dEq.up && /ob-shell-at-equipment/.test(dEq.place) && dEq.vw === 1024 && dEq.pos === 'fixed' && decInside(dEq) && Math.abs(dEq.rect.t - 90) <= 1 && Math.abs((dEq.vw - dEq.rect.r) - 12) <= 1 && decHits(dEq),
    JSON.stringify(dEq).slice(0, 700));
  await chrome.eval(`(async () => { try { window.__shell.go('play'); } catch {}
    for (let i = 0; i < 50 && !(window.__shell?.isOpen?.() && window.__shell.moving() === false && /ob-shell-at-play/.test(document.getElementById('ob-shell')?.className || '')); i++) await new Promise((r) => setTimeout(r, 100)); return true; })()`);
  await chrome.send('Emulation.clearDeviceMetricsOverride');
  await sleep(400);
  // a REAL click (hit-tested through the compositor, never .click()) answers
  const dC0 = await chrome.eval(READ_DEC_BELT);
  if (dC0.up && dC0.btns?.[0]) await mouseClick(dC0.btns[0].cx, dC0.btns[0].cy);
  await sleep(500);
  const dCAfter = await chrome.eval(`({ pend: window.__rules?.matchState?.()?.pendingDecision ?? null, gone: !document.getElementById('ob-shell-decision'), open: !!window.__shell?.isOpen?.() })`);
  check('stale-kit lab, kit.css served 404 (GH-738): a REAL click (Input.dispatchMouseEvent at answer 0\'s centre) answers the decision through the belt-placed prompt — pending null, prompt gone, the hall still open',
    dC0.up && decHits(dC0) && dCAfter.pend === null && dCAfter.gone && dCAfter.open, JSON.stringify({ btns: dC0.btns, dCAfter }));
  // the COARSE register (html.ob-touch installs on a touch boot; 852x393):
  // the belt's coarse arm = the kit's coarse placement (the band right of
  // the card column) + the kit's --ob-h-coarse floor on the answers
  await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 852, height: 393, deviceScaleFactor: 1, mobile: true });
  const dD = await bootCaromDecision('stale-kit-404-decision-coarse');
  const dCoarse = await chrome.eval(READ_DEC_BELT);
  check('stale-kit lab, kit.css served 404 (GH-738): the COARSE register (html.ob-touch, 852x393) — the belt\'s coarse arm keeps the prompt in the 12 px band right of the card column, fixed inside the viewport, above the cards; every answer is >= 44 px tall (the kit\'s --ob-h-coarse floor restated on the answers) and hit-testable at its centre',
    dD.pend && dD.entry && dD.up && dCoarse.up && dCoarse.touch && dCoarse.coarse && dCoarse.kitSheets === 0 && dCoarse.pos === 'fixed' && decInside(dCoarse) && dCoarse.ovlCard === 0
      && Math.abs((dCoarse.vw - dCoarse.rect.r) - 12) <= 1 && decHits(dCoarse) && dCoarse.btns.every((b) => b.h >= 43.5),
    JSON.stringify({ dD, dCoarse }).slice(0, 900));
  if (dCoarse.up && dCoarse.btns?.[0]) await tap(chrome, dCoarse.btns[0].cx, dCoarse.btns[0].cy);
  await sleep(500);
  const dDAfter = await chrome.eval(`({ pend: window.__rules?.matchState?.()?.pendingDecision ?? null, gone: !document.getElementById('ob-shell-decision'), open: !!window.__shell?.isOpen?.() })`);
  check('stale-kit lab, kit.css served 404 (GH-738): a REAL tap (Input.dispatchTouchEvent at answer 0\'s centre) answers the decision under the coarse register — pending null, prompt gone, the hall still open',
    dCoarse.up && dDAfter.pend === null && dDAfter.gone && dDAfter.open, JSON.stringify(dDAfter));
  await chrome.send('Emulation.clearDeviceMetricsOverride');
  await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await chrome.eval(`(() => { const set = (k, v) => v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
    set('ob-settings-v1', ${JSON.stringify(savedProfile.s)}); set('ob-shell-v1', ${JSON.stringify(savedProfile.sh)}); return true; })()`);
  const skdErrs = await chrome.eval('window.__test.errors');
  if (skdErrs.length) fail('stale-kit decision arm: app errors: ' + skdErrs.join(' | '));
  kit404 = false; expectKit404 = false;
  await chrome.send('Fetch.disable');

  // H11. stale-graph degradation arm (navigates under a Fetch intercept,
  // the settings stale-navmodal precedent): help.js replaced by a stale
  // stub ⇒ NO pill, NO `?` shortcut, NO __help, settings row hidden, game
  // playable, ZERO errors
  //
  // ONE handler answers BOTH intercept arms (H11 + H12): cdp.mjs
  // ACCUMULATES onEvent handlers, so a second registration would
  // double-answer every paused request (fulfill + continue on the same
  // requestId). Each arm enables Fetch with only its own urlPattern, so
  // the branches never overlap in flight.
  // H12's module: the REAL i18n.js with ONLY the hasLocal export keyword
  // stripped (the function stays for internal callers; the module
  // namespace loses the property) — the minimal faithful pre-GH-313
  // pairing. If the source ever renames the export the replace no-ops and
  // H12 fails loudly on a painted label (self-detecting, never vacuous).
  const i18nPre313 = fs.readFileSync(path.join(webDir, 'app/i18n.js'), 'utf8')
    .replace('export function hasLocal', 'function hasLocal');
  chrome.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (params.request.url.includes('help.js')) {
      chrome.send('Fetch.fulfillRequest', {
        requestId: params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
        body: Buffer.from('export const stale = 1; // pre-024 stale graph\n')
          .toString('base64'),
      });
    } else if (params.request.url.includes('i18n.js')) {
      chrome.send('Fetch.fulfillRequest', {
        requestId: params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
        body: Buffer.from(i18nPre313).toString('base64'),
      });
    } else if (staleIconsArm && params.request.url.includes('ui/icons.js')) {
      // the C4 toolbar-fallback arm (runToolbarFallback) rides THIS handler:
      // cdp.mjs onEvent has no off, so a second handler answering the same
      // paused request rejects with "Invalid state" and crashes the run
      chrome.send('Fetch.fulfillRequest', {
        requestId: params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }],
        body: Buffer.from('export const stale = 1; // face-less icons.js (C4 arm)\n').toString('base64'),
      }).catch(() => {});
    } else chrome.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
  });
  await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*help.js*' }] });
  await chrome.send('Network.enable');
  await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=stale-help` });
  await waitReady();
  await sleep(1200);
  const h11a = await chrome.eval(`({
    help: window.__help === undefined,
    pill: !document.getElementById('ob-help') })`);
  await pressKey('?', 'Slash', 191); // rawKeyDown: e.key === '?' (contract §3); no text pipeline (ledger §4 storm)
  await sleep(400);
  const h11b = await chrome.eval(
    `!document.getElementById('ob-help-panel')`);
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await sleep(500);
  await chrome.eval(`window.__settings.show('about')`);
  await sleep(200);
  const h11c = await chrome.eval(`(() => {
    const row = document.getElementById('ob-about-help');
    return { rowHidden: !row || row.hidden || row.getClientRects().length === 0 };
  })()`);
  await chrome.eval(`document.getElementById('ob-gear').click()`);
  await sleep(400);
  await chrome.eval('window.__e2eHelp2 = window.__aim.getPhi(); true');
  await pressKey('ArrowLeft', 'ArrowLeft', 37);
  await sleep(200);
  const h11d = await chrome.eval(
    'window.__aim.getPhi() !== window.__e2eHelp2');
  check('help: stale graph (no help.js) — no pill, no `?`, no __help, '
    + 'settings row hidden, game playable (degradation law)',
  h11a.help && h11a.pill && h11b && h11c.rowHidden && h11d === true,
  JSON.stringify({ ...h11a, noPanel: h11b, ...h11c, aimsAfter: h11d }));
  const staleErrs = await chrome.eval('window.__test.errors');
  if (staleErrs.length) fail('help: app errors (stale arm): ' + staleErrs.join(' | '));
  await chrome.send('Fetch.disable');

  // H12. pre-GH-313 i18n.js pairing (site-backlink review r2 P2): a FRESH
  // help.js meeting a CACHED i18n.js that predates the hasLocal export.
  // knowsSiteKey must read the missing export as FALSE — blank label and
  // hidden anchor even though every dictionary in play is FRESH and
  // carries the key (a has() fallback would instead pass via en.json and
  // paint English into a localized UI): degrade = HIDE, never
  // wrong-language. Served by the SHARED handler above; own Fetch
  // enable/disable pair, so the block's end state matches H11's.
  await chrome.send('Fetch.enable',
    { patterns: [{ urlPattern: '*i18n.js*' }] });
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=pre313-i18n` });
  await waitReady();
  await sleep(1200);
  const h12 = await chrome.eval(`(async () => {
    if (!window.__help || !window.__i18n) return { seams: false };
    window.__help.open('api');
    await new Promise((r) => setTimeout(r, 400));
    const site = document.querySelector('#ob-help-panel .ob-help__site');
    const guide = document.querySelector('#ob-help-panel .ob-help__guide');
    const out = {
      seams: true,
      sitePresent: !!site,
      // the dictionaries on this boot are FRESH — the key is in the en
      // universe — so a blank label can ONLY mean the gate read the
      // missing hasLocal export as FALSE (never the H8d stale-dict path)
      dictFresh: window.__i18n.keys().includes('help.games.site'),
      siteLabel: site ? site.textContent : null,
      siteHidden: site ? site.hidden : null,
      guideLabelOk: !!guide && guide.textContent !== ''
        && guide.textContent !== 'help.games.guide',
    };
    window.__help.close();
    return out;
  })()`);
  check('help: pre-GH-313 i18n.js (no hasLocal export) — site link degrades '
    + 'to HIDDEN with a blank label even over fresh dictionaries, guide '
    + 'unaffected',
  h12.seams === true && h12.sitePresent === true && h12.dictFresh === true
    && h12.siteLabel === '' && h12.siteHidden === true
    && h12.guideLabelOk === true,
  JSON.stringify(h12));
  const preErrs = await chrome.eval('window.__test.errors');
  if (preErrs.length) {
    fail('help: app errors (pre-313 arm): ' + preErrs.join(' | '));
  }
  await chrome.send('Fetch.disable');
}

// J4c (GH-245, deferred items A3/A4): the two focus RUNGS this wave adds.
// Runs on FRESH boots at the TAIL of behavior mode, after every other arm:
// a fresh document sits in the BOOT-DEFAULT focus modality (the GH-226
// navmodal note — script focus() matches :focus-visible until the session's
// first pointer interaction), so the arm needs no synthetic Tab dispatch.
// The first cut of this arm ran mid-run with CDP key events + an emulation
// window and LEAKED page state into the later help block on a loaded host
// (2/2 red with the arm, 2/2 green without) — hence the hermetic shape:
// own navigation, own app-error gate, nothing after it to poison.
async function runFocusRungs() {
  // A4 — desktop boot: #ob-export-btn wears the KIT ring, UA outline
  // suppressed (the pill was the one toolbar sibling without the rung)
  await chrome.send('Page.navigate', { url: `${APP_URL}&obtool=1` });
  await waitReady();
  await sleep(1200); // export leaf loads post-boot (guarded dynamic import)
  const exRing = await chrome.eval(`(async () => {
    const b = document.getElementById('ob-export-btn');
    if (!b) return { err: 'no #ob-export-btn' };
    const rest = getComputedStyle(b).boxShadow;
    b.focus();
    await new Promise((r) => setTimeout(r, 80));
    const cs = getComputedStyle(b);
    const res = { fv: b.matches(':focus-visible'), outline: cs.outlineStyle,
      rest, shadow: cs.boxShadow };
    b.blur();
    return res;
  })()`);
  check('focus: #ob-export-btn boot-modality focus shows the KIT ring, UA '
    + 'outline suppressed (GH-245 A4)',
  !exRing.err && exRing.fv === true && exRing.outline === 'none'
    && exRing.rest === 'none' && exRing.shadow !== 'none',
  JSON.stringify(exRing));
  const exErrs = await chrome.eval('window.__test.errors');
  if (exErrs.length) fail('focus rungs (desktop): ' + exErrs.join(' | '));
  // A3 — the REAL phone-register boot (coarse live BEFORE boot, the
  // runPhoneAudit recipe): touch.js itself installs html.ob-touch and
  // injects ui/touch.css, so the arm measures the SHIPPED graph, not an
  // injected approximation. box-shadow is ONE property: the ring must
  // COMPOSE over the FIRE pill's el-2 elevation (focusSegs > restSegs),
  // never replace or lose it.
  await setPhoneMetrics(chrome, { width: 852, height: 393, deviceScaleFactor: 1 });
  await chrome.send('Page.navigate', { url: `${APP_URL}&obtool=1` });
  await waitReady();
  // touch leaf loads post-boot (dynamic import) and INJECTS ui/touch.css —
  // the #shoot el-2 elevation this check composes over rides that sheet.
  // Load-hardening (journey-QA wave-1 lane): a fixed 1.5 s sleep raced the
  // leaf + sheet application on a loaded CI box (restSegs 0 at the early
  // read, the ring present 80 ms later — 0/2 and 0/4 observed), reading
  // the not-yet-painted rest state as a composition failure. Poll for the
  // check's OWN precondition (the resting elevation painted) instead; a
  // sheet that genuinely never paints it still exhausts the poll and
  // fails the unchanged restSegs >= 1 assertion.
  for (let i = 0; i < 60; i++) {
    if (await chrome.eval(`(() => { const b = document.getElementById('shoot');
      return !!b && getComputedStyle(b).boxShadow !== 'none'; })()`)) break;
    await sleep(250);
  }
  const fireRing = await chrome.eval(`(async () => {
    const b = document.getElementById('shoot');
    if (!b) return { err: 'no #shoot' };
    const touch = document.documentElement.classList.contains('ob-touch');
    const coarse = matchMedia('(pointer: coarse)').matches;
    const segs = (s) => (s === 'none' ? 0 : s.split('px,').length);
    const rest = getComputedStyle(b).boxShadow;
    b.focus();
    await new Promise((r) => setTimeout(r, 80));
    const cs = getComputedStyle(b);
    const res = { touch, coarse, fv: b.matches(':focus-visible'),
      disabled: b.disabled, outline: cs.outlineStyle,
      restSegs: segs(rest), focusSegs: segs(cs.boxShadow) };
    b.blur();
    return res;
  })()`);
  check('focus: coarse FIRE pill (#shoot) focus COMPOSES the kit ring over '
    + 'its el-2 elevation (GH-245 A3)',
  !fireRing.err && fireRing.touch === true && fireRing.coarse === true
    && fireRing.fv === true && fireRing.disabled === false
    && fireRing.outline === 'none'
    && fireRing.focusSegs > fireRing.restSegs && fireRing.restSegs >= 1,
  JSON.stringify(fireRing));
  const fireErrs = await chrome.eval('window.__test.errors');
  if (fireErrs.length) fail('focus rungs (phone): ' + fireErrs.join(' | '));
  await chrome.send('Emulation.clearDeviceMetricsOverride');
  await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: false });
}

// C4 (GH-668 review r2 P2, fix round 5): the toolbar TEXT FALLBACK rung. With
// icons.js stale (a Fetch intercept serves a face-less module) `#ob-share`
// keeps its word — .ob-btn.ob-btn--glass.ob-toolbar-pill with NO --icon —
// and must sit on the toolbar rung: 34 on fine pointers, 44 on coarse
// (touch emulation + mobile metrics + html.ob-touch, the runPhoneAudit
// route), never the base pill's 40. Hermetic like H11: own navigation under
// the intercept, own error gate, restores emulation. Red on the pre-fix
// bytes: 40 / 40 (the .ob-btn control rung outranked the toolbar height).
let staleIconsArm = false; // read by the help block's Fetch handler (one handler per session)
async function runToolbarFallback() {
  staleIconsArm = true; // the help block's Fetch handler serves the face-less icons.js
  await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*ui/icons.js*' }] });
  await chrome.send('Network.enable');
  await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
  await chrome.send('Page.navigate', { url: `${APP_URL}&arm=stale-icons` });
  await waitReady();
  await sleep(1200);
  const SHARE = `(() => { const b = document.getElementById('ob-share'); if (!b) return { err: 'no #ob-share' };
    const r = b.getBoundingClientRect(); const cs = getComputedStyle(b);
    return { cls: b.className, icon: b.classList.contains('ob-btn--icon'), pill: b.classList.contains('ob-toolbar-pill'), text: (b.textContent || '').trim().length > 0,
      svg: !!b.querySelector('svg'), h: r.height, minH: cs.minHeight, touch: document.documentElement.classList.contains('ob-touch'), coarse: matchMedia('(pointer: coarse)').matches }; })()`;
  const fine = await chrome.eval(SHARE);
  check('toolbar C4 (review r2): with icons.js stale #ob-share is the TEXT fallback (.ob-toolbar-pill, no --icon, no svg) on the 34 toolbar rung, not the base 40',
    !fine.err && fine.pill === true && fine.icon === false && fine.svg === false && fine.text === true && Math.abs(fine.h - 34) <= 1,
    JSON.stringify(fine));
  await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: 852, height: 393, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  const coarse = await chrome.eval(`(() => { document.documentElement.classList.add('ob-touch'); return true; })()`) && await chrome.eval(SHARE);
  check('toolbar C4 (review r2): the text fallback steps to the 44 coarse toolbar rung with touch (html.ob-touch + pointer: coarse), never 40',
    !coarse.err && coarse.pill === true && coarse.icon === false && coarse.coarse === true && coarse.touch === true && Math.abs(coarse.h - 44) <= 1,
    JSON.stringify(coarse));
  const errs = await chrome.eval('window.__test.errors');
  if (errs.length) fail('toolbar C4 arm: app errors: ' + errs.join(' | '));
  await chrome.send('Emulation.clearDeviceMetricsOverride');
  await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await chrome.send('Fetch.disable');
  staleIconsArm = false;
}

// V-P1 on the SHIPPED strips (GH-668 visual audit r2 P1, fix round 5): the
// phone station strip (844 × 390, de / fr) must show at rest at least what
// the S4 tree showed — 'Beleuchtung' ≥ 103.6 px of its 131.5, 'Éclairage'
// WHOLE (105.1) — and the practice assist strip (en / de / fr) pads at the
// 12 px floor whenever it is narrower than its content (S4's pad). Hermetic
// (own navigation, own error gate, restores emulation). Red on the pre-fix
// bytes: 77.1 / 85.7 px under the 0.4 h pad.
async function runStripFitPad() {
  await setPhoneMetrics(chrome, { width: 844, height: 390 });
  await chrome.send('Page.navigate', { url: `${APP_URL}&obtool=1&obshell=1&u=stripfit` });
  await waitReady();
  let up = false;
  for (let i = 0; i < 50 && !up; i++) {
    up = await chrome.eval('window.__shell?.isOpen?.() === true').catch(() => false);
    if (!up) await sleep(200);
  }
  if (!up) { fail('strip V-P1: obshell phone boot never opened the shell'); return; }
  const READ = (sel, key, id) => `(() => { const strip = document.querySelector(${JSON.stringify(sel)}); if (!strip) return { err: 'no strip ' + ${JSON.stringify(sel)} };
    const segs = [...strip.querySelectorAll('.ob-strip__seg')].filter((b) => b.getClientRects().length); if (!segs.length) return { err: 'no segments' };
    const seg = segs.find((b) => b.dataset[${JSON.stringify(key)}] === ${JSON.stringify(id)}) ?? segs[segs.length - 1];
    const lab = seg.firstElementChild ?? seg; const r = lab.getBoundingClientRect(); const sr = strip.getBoundingClientRect();
    const clipL = sr.left + strip.clientLeft, clipR = clipL + strip.clientWidth; const cs = getComputedStyle(seg);
    const pr = seg.getBoundingClientRect();
    return { label: lab.textContent, full: r.width, visible: Math.max(0, Math.min(r.right, clipR) - Math.max(r.left, clipL)), pad: parseFloat(cs.paddingLeft),
      pill: pr.width, pillVisible: Math.max(0, Math.min(pr.right, clipR) - Math.max(pr.left, clipL)),
      h: seg.getBoundingClientRect().height, prop: strip.style.getPropertyValue('--strip-pad'), over: strip.scrollWidth - strip.clientWidth,
      scrollLeft: strip.scrollLeft, locale: window.__i18n?.locale?.() ?? null, n: segs.length }; })()`;
  const toLocale = async (loc, sel, want) => {
    await chrome.eval(`window.__i18n?.setLocale?.(${JSON.stringify(loc)})`);
    for (let i = 0; i < 40; i++) {
      const ok = await chrome.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); return !!el && ${JSON.stringify(want)}.test(el.textContent); })()`).catch(() => false);
      if (ok) break;
      await sleep(150);
    }
    await sleep(350); // the leaf's refit (rAF) + the font swap
  };
  await chrome.eval(`window.__shell.go('equipment')`);
  for (let i = 0; i < 40; i++) {
    if (await chrome.eval(`!!document.querySelector('#ob-atelier-carousel .ob-strip__seg[data-station="lighting"]')`).catch(() => false)) break;
    await sleep(150);
  }
  await toLocale('de', '#ob-atelier-carousel [data-station="lighting"]', /Beleuchtung/);
  const de = await chrome.eval(READ('#ob-atelier-carousel', 'station', 'lighting'));
  // the audit's 103.6 / 77.1 px were the PILL's visible width (label + pads); the law judged here is the
  // label's GLYPHS: whole at rest (S4's 'BELEUCHTUNG' glyphs were whole inside its 103.6 px; the pre-fix
  // tip cut 'Beleuch|tung' to 59 of 87 px) — with the fit-aware pad the pill is whole again too
  check('strip V-P1 (B-K13 / B-K04 fit-at-rest): phone station strip de — "Beleuchtung" glyphs WHOLE at rest (pre-fix: cut under the 0.4 h pad; S4 pill 103.6 px visible), the fit-aware pad in [12, 0.4 h]',
    !de.err && /Beleuchtung/.test(de.label) && de.visible >= de.full - 0.5 && de.scrollLeft <= 0.5 && de.pad >= 11.94 && de.pad <= 0.4 * de.h + 0.06 && (de.over <= 1 || Math.abs(de.pad - 12) <= 0.06),
    JSON.stringify(de));
  await toLocale('fr', '#ob-atelier-carousel [data-station="lighting"]', /clairage/);
  const fr = await chrome.eval(READ('#ob-atelier-carousel', 'station', 'lighting'));
  check('strip V-P1 (B-K13 / B-K04 fit-at-rest): phone station strip fr — "Éclairage" glyphs WHOLE at rest again (S4 whole; pre-fix cut), the fit-aware pad in [12, 0.4 h]',
    !fr.err && /clairage/.test(fr.label) && fr.visible >= fr.full - 0.5 && fr.scrollLeft <= 0.5 && fr.pad >= 11.94 && fr.pad <= 0.4 * fr.h + 0.06 && (fr.over <= 1 || Math.abs(fr.pad - 12) <= 0.06),
    JSON.stringify(fr));
  // (the practice assist specimen of this law retired with GH-668 S5 slice 4
  // G2: `[data-ob="practice-assist-strip"]` is the kit SEGMENTED, not a strip
  // — e2e-practice P-K2 judges its fit-at-rest; the atelier station strip
  // above stays the V-P1 witness)
  await chrome.eval(`window.__i18n?.setLocale?.('en')`);
  await sleep(300);
  const errs = await chrome.eval('window.__test.errors');
  if (errs.length) fail('strip V-P1 arm: app errors: ' + errs.join(' | '));
  await chrome.send('Emulation.clearDeviceMetricsOverride');
  await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: false });
}

// ---- uiaudit (b20): kit foundation labs --------------------------------------
// The owner's "Previewing vs Keep" report: a 22 px accent badge beside a 40 px
// primary read as two buttons of different heights, and nothing measured it —
// A7 asks "is each control ON a rung", never "do siblings share ONE rung". Labs
// on fixed DOM (red-proven on the pre-fix kit bytes): the .ob-status marker
// register, the per-group auto-row pole, the A13 / A14 / A15 laws and the A3
// edge probes judged on a known-bad and a known-good fixture each, and the kit
// coarse floor read on a phone boot.
async function runUiauditLabs() {
  const LAB = (inner, w = 420) => `(() => { document.getElementById('ob-uia-lab')?.remove();
    const col = document.createElement('div'); col.id = 'ob-uia-lab'; col.lang = 'en';
    col.style.cssText = 'position:fixed;left:16px;top:16px;width:${w}px;padding:8px;z-index:2147483647;background:var(--ob-bg-1);font-family:var(--ob-font);font-size:var(--ob-fs-0)';
    col.innerHTML = ${JSON.stringify(inner)}; document.body.appendChild(col); window.__auditRoot = col; return true; })()`;
  const law = async (id, coarse = false) => chrome.eval(kitLawJs(id, { coarse, ladder: KIT_LADDER }));
  const clear = () => chrome.eval(`document.getElementById('ob-uia-lab')?.remove(); window.__auditRoot = null; true`);
  try {
    // 1. the status marker: a state, not an action — no box, no wash, no radius; caps
    //    role in accent-text with a 6 px accent dot; the caps CJK arm applies
    await chrome.eval(LAB('<span class="ob-status" id="uia-st">Previewing</span>'));
    const st = await chrome.eval(`(async () => {
      const el = document.getElementById('uia-st'); const raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const ref = (css) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;left:-9999px;' + css; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; };
      const rd = () => { const c = getComputedStyle(el), b = getComputedStyle(el, '::before');
        return { bg: c.backgroundColor, bw: parseFloat(c.borderTopWidth) || 0, rad: parseFloat(c.borderTopLeftRadius) || 0, fs: parseFloat(c.fontSize), fw: parseInt(c.fontWeight, 10), tt: c.textTransform,
          ink: c.color, dotW: parseFloat(b.width) || 0, dotH: parseFloat(b.height) || 0, dotBg: b.backgroundColor, h: el.getBoundingClientRect().height }; };
      const en = rd(); el.lang = 'ja'; await raf(); const ja = rd();
      return { en, ja, accentText: ref('color:var(--ob-accent-text)'), accent: ref('color:var(--ob-accent)') }; })()`);
    const boxless = (r) => /rgba\(0, 0, 0, 0\)|transparent/.test(r.bg) && r.bw === 0 && r.rad === 0;
    check('uiaudit .ob-status: no box (transparent, 0 border, 0 radius — never the r-full pill voice), caps 12 / 620 / uppercase in --ob-accent-text, a 6 px --ob-accent dot; ja arm 13 px, no uppercase',
      boxless(st.en) && Math.abs(st.en.fs - 12) < 0.6 && st.en.fw === 620 && st.en.tt === 'uppercase' && coloursEqual(st.en.ink, st.accentText)
      && st.en.dotW === 6 && st.en.dotH === 6 && coloursEqual(st.en.dotBg, st.accent) && Math.abs(st.ja.fs - 13) < 0.6 && st.ja.tt === 'none' && st.en.h < 28,
      JSON.stringify(st));
    // 2. A13 one height per row: badge-beside-primary (the owner's keep bar) and an
    //    icon pill beside a text pill are red; two text pills and a status marker are clean
    await chrome.eval(LAB('<div style="display:flex;gap:8px;align-items:center"><span><span class="ob-badge ob-badge--accent">Previewing</span> Not applied yet.</span>'
      + '<button class="ob-btn ob-btn--ghost">Put back</button><button class="ob-btn ob-btn--primary">Keep</button></div>'
      + '<div style="display:flex;gap:8px;align-items:center;margin-top:8px"><button class="ob-btn ob-btn--icon" aria-label="Back">&lt;</button><button class="ob-btn">Save</button></div>'));
    const a13bad = await law('A13');
    await chrome.eval(LAB('<div style="display:flex;gap:8px;align-items:center"><span><span class="ob-status">Previewing</span> Not applied yet.</span>'
      + '<button class="ob-btn ob-btn--ghost">Put back</button><button class="ob-btn ob-btn--primary">Keep</button></div>'));
    const a13good = await law('A13');
    // review r1 / r2: ONE row law under EVERY cross-axis alignment — a 40 px pill beside
    // the 64 px thumb is one row (red) whether the row aligns flex-start, center,
    // flex-end or baseline; stretch equalises the boxes (clean); a WRAPPED pair sits on
    // two lines (clean)
    const ALIGN_ROW = (al, w = 420) => `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:${al};width:${w}px"><button class="ob-btn">Shoot</button><button class="ob-btn ob-btn--thumb">FIRE</button></div>`;
    const a13al = {};
    for (const al of ['flex-start', 'center', 'flex-end', 'baseline', 'stretch']) { await chrome.eval(LAB(ALIGN_ROW(al))); a13al[al] = await law('A13'); }
    await chrome.eval(LAB(ALIGN_ROW('center', 90))); a13al.wrapped = await law('A13');
    const redRow = (v) => v.length === 1 && / 40 \/ .* 64|64 \/ .* 40/.test(v[0]);
    check('uiaudit A13 lab: the keep-bar fixture (22 px accent badge beside 40 px pills) and an icon pill beside a text pill are red; a 40 / 64 row is red under flex-start, center, flex-end AND baseline, clean when stretched or wrapped onto two lines; the .ob-status fixture is clean',
      a13bad.length === 2 && a13bad.some((v) => v.includes('[badge] 22')) && a13bad.some((v) => / 34 \/ /.test(v) && !v.includes('[badge]')) && a13good.length === 0
      && ['flex-start', 'center', 'flex-end', 'baseline'].every((al) => redRow(a13al[al])) && a13al.stretch.length === 0 && a13al.wrapped.length === 0,
      JSON.stringify({ a13bad, a13good, a13al }));
    // 3. A14 equal cards per row: top-aligned option cards of different copy length are
    //    ragged (red); stretched to one row height they are clean
    // review r2: the SAME row law as A13 — unequal cards on one row are red under
    // flex-start, center, flex-end and baseline; stretched cards are clean; a wrapped
    // pair (two lines) is clean
    const cards = (align, w = 420) => `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:${align};width:${w}px"><button class="ob-card-option" style="width:120px">Pool 9-ft</button>`
      + '<button class="ob-card-option" style="width:120px">Pool tournament 9-ft, older generation (4.56 in pockets)</button></div>';
    const a14al = {};
    for (const al of ['flex-start', 'center', 'flex-end', 'baseline', 'stretch']) { await chrome.eval(LAB(cards(al))); a14al[al] = await law('A14'); }
    await chrome.eval(LAB(cards('center', 130))); a14al.wrapped = await law('A14');
    check('uiaudit A14 lab: ragged option cards on one row are red under flex-start, center, flex-end AND baseline; stretched cards and a wrapped pair are clean',
      ['flex-start', 'center', 'flex-end', 'baseline'].every((al) => a14al[al].length === 1) && a14al.stretch.length === 0 && a14al.wrapped.length === 0,
      JSON.stringify(a14al));
    // 4. A15 coarse touch floor: a 40 px pill under the coarse register is red, 44 is clean
    await chrome.eval(LAB('<button class="ob-btn">Keep</button>')); const a15bad = await law('A15', true);
    await chrome.eval(LAB('<button class="ob-btn" style="min-height:44px">Keep</button>')); const a15good = await law('A15', true);
    const a15fine = await law('A15', false);
    check('uiaudit A15 lab: a 40 px pill on the coarse register is red, a 44 px pill is clean, and the fine register is never judged',
      a15bad.length === 1 && a15good.length === 0 && a15fine.length === 0, JSON.stringify({ a15bad, a15good }));
    // 5. A3 edge probes (GH-989): a neighbour covering the right 8 px of a control is red
    //    while its centre is clear; a clear control stays clean
    const edge = (dx) => `<div style="position:relative;height:60px"><button class="ob-btn" style="position:absolute;left:0;top:8px;width:120px">Settings</button>`
      + `<button class="ob-btn ob-btn--row" style="position:absolute;left:${dx}px;top:4px;width:150px">Start at the table</button></div>`;
    await chrome.eval(LAB(edge(112))); const a3bad = await law('A3');
    await chrome.eval(LAB(edge(136))); const a3good = await law('A3');
    check('uiaudit A3 edge probes: a neighbour over the right 8 px of a control is red (centre clear); a clear pair is clean',
      a3bad.length === 1 && /right edge covered/.test(a3bad[0]) && a3good.length === 0, JSON.stringify({ a3bad, a3good }));
    // 6. ONE POLE PER GROUP (controls.js auto-row): when one answer overflows its pill the
    //    whole group turns into rows (one shape, one height); when the copy fits, all return
    await chrome.eval(LAB('<div id="uia-grp" class="ob-prompt__actions" style="display:flex;flex-wrap:wrap;gap:8px;width:220px">'
      + '<button class="ob-btn">Yes</button><button class="ob-btn" id="uia-long">Spot the balls and break again from the kitchen</button></div>', 240));
    const RD = `[...document.querySelectorAll('#uia-grp > .ob-btn')].map((b) => ({ row: b.classList.contains('ob-btn--row'), h: Math.round(b.getBoundingClientRect().height) }))`;
    const settle = `(async () => { await import('./app/ui/controls.js'); await new Promise((r) => setTimeout(r, 1200)); return ${RD}; })()`;
    const long = await chrome.eval(settle);
    const longA13 = await law('A13');
    await chrome.eval(`document.getElementById('uia-long').textContent = 'No'; true`);
    const short = await chrome.eval(settle);
    // review r1 P2: the overflowing answer LEAVES the group (removed) — the
    // sibling it pulled into the row pole returns to a 40 px pill
    await chrome.eval(`document.getElementById('uia-long').textContent = 'Spot the balls and break again from the kitchen'; true`);
    const longAgain = await chrome.eval(settle);
    await chrome.eval(`document.getElementById('uia-long').remove(); true`);
    const removed = await chrome.eval(settle);
    check('uiaudit auto-row group: one overflowing answer turns EVERY pill of its group into a row (one pole; A13 clean on the group); when the copy fits — or the long answer is removed — the group returns to pills',
      long.every((b) => b.row) && longA13.length === 0 && short.every((b) => !b.row)
      && longAgain.every((b) => b.row) && removed.length === 1 && !removed[0].row && Math.abs(removed[0].h - 40) <= 1,
      JSON.stringify({ long, longA13, short, longAgain, removed }));
  } finally { await clear(); }
  // 7. THE KIT COARSE FLOOR (the design charter G10, stated once in kit.css): on a phone boot a
  //    bare default pill, a ghost pill, a tile, a select trigger and an option reach 44
  //    with no surface rule; the icon square, the row and the 48 rung keep their own
  await setPhoneMetrics(chrome, { width: 844, height: 390 });
  try {
    await chrome.send('Page.navigate', { url: `${APP_URL}&obtool=1&u=uia-coarse` });
    await waitReady();
    let touch = false;
    for (let i = 0; i < 40 && !touch; i++) { touch = await chrome.eval(`document.documentElement.classList.contains('ob-touch')`).catch(() => false); if (!touch) await sleep(200); }
    await chrome.eval(LAB('<button class="ob-btn" id="uia-c1">Keep</button> <button class="ob-btn ob-btn--ghost" id="uia-c2">Put back</button> '
      + '<button class="ob-btn ob-btn--tile" id="uia-c3">Tile</button> <button class="ob-select" id="uia-c4">Select</button> <div class="ob-option" id="uia-c5">Option</div> '
      + '<button class="ob-btn ob-btn--icon" id="uia-c6" aria-label="x">x</button> <button class="ob-btn ob-btn--row" id="uia-c7">Row</button> <button class="ob-btn ob-btn--lg" id="uia-c8">Lg</button>'));
    const fl = await chrome.eval(`(() => { const h = (id) => Math.round(document.getElementById(id).getBoundingClientRect().height * 10) / 10;
      const pad = parseFloat(getComputedStyle(document.getElementById('uia-c1')).paddingLeft);
      return { touch: document.documentElement.classList.contains('ob-touch'), pill: h('uia-c1'), ghost: h('uia-c2'), tile: h('uia-c3'), select: h('uia-c4'), option: h('uia-c5'), icon: h('uia-c6'), row: h('uia-c7'), lg: h('uia-c8'), pad }; })()`);
    check('uiaudit kit coarse floor (G10): under html.ob-touch a default pill / ghost pill / tile / select trigger / option are 44 with no surface rule (pill pad 17.6 = 0.4 h); icon 44, row 44, --lg 48 keep their rungs',
      fl.touch && [fl.pill, fl.ghost, fl.tile, fl.select, fl.option, fl.icon, fl.row].every((v) => Math.abs(v - 44) <= 0.5) && Math.abs(fl.lg - 48) <= 0.5 && Math.abs(fl.pad - 17.6) < 0.1,
      JSON.stringify(fl));
  } finally {
    await clear().catch(() => {});
    await chrome.send('Emulation.clearDeviceMetricsOverride');
    await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await chrome.send('Page.navigate', { url: `${APP_URL}&u=uia-back` });
    await waitReady();
  }
}

// ---- uiaudit (b20) surface arms: GH-989 hall sweep + the phone band-T law ----
// Planted red: main / the kit-foundation tip (the stack lifts only under a
// 700 px media query; band T reserves four toolbar pills and hangs its
// members from the top edge).
async function runUiauditSurfaceArms() {
  const ARM_URL = `${APP_URL}&obtool=1&obshell=1`;
  // (1) GH-989: at every narrow fine-pointer width and locale the quick-play
  // stack and the place rail never intersect, and every rail segment (the
  // gear included) is hit-testable at its centre AND 6 px inside each end
  try {
    await chrome.send('Page.navigate', { url: `${ARM_URL}&u=uia-989` });
    await waitReady();
    let up = false;
    for (let i = 0; i < 50 && !up; i++) { up = await chrome.eval('window.__shell?.isOpen?.() === true').catch(() => false); if (!up) await sleep(200); }
    check('uiaudit GH-989 sweep: the scripted shell opened', up);
    if (up) {
      // desktop windows carry no safe area: the phone audit above leaves PHONE_SA
      // (a 47 px notch inset) in force for the rest of the session, so the sweep
      // zeroes it — and judges one inset case below on purpose
      await setSafeAreaInsets(chrome, { top: 0, right: 0, bottom: 0, left: 0 });
      const bad = [];
      for (const loc of ['en', 'de']) {
        await chrome.eval(`window.__i18n?.setLocale?.(${JSON.stringify(loc)}), true`);
        for (const [w, h] of [[720, 900], [800, 600], [900, 640], [1024, 640], [1100, 700]]) {
          await chrome.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
          await sleep(500);
          const r = await chrome.eval(`(() => {
            const q = document.getElementById('ob-shell-quickplay-wrap'), rl = document.getElementById('ob-shell-rail');
            if (!q || !rl) return { err: 'missing' };
            const a = q.getBoundingClientRect(), b = rl.getBoundingClientRect();
            const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            window.__auditRoot = rl; return { ix, iy };
          })()`);
          const a3 = await chrome.eval(kitLawJs('A3', { ladder: KIT_LADDER }));
          await chrome.eval('window.__auditRoot = null; true');
          if (r.err) bad.push(`${loc} ${w}x${h}: ${r.err}`);
          else if (r.ix > 0 && r.iy > 0) bad.push(`${loc} ${w}x${h}: stack overlaps the rail ${r.ix.toFixed(0)}x${r.iy.toFixed(0)}`);
          for (const v of a3) bad.push(`${loc} ${w}x${h}: ${v}`);
        }
      }
      check('uiaudit GH-989 sweep: at 720-1100 px x en/de the quick-play stack never overlaps the place rail and every rail segment (gear included) is reachable at its centre and both ends',
        bad.length === 0, bad.slice(0, 8).join(' | '));
      // the lift is decided from MEASURED boxes: a right safe-area inset (the stack
      // moves 47 px left of its 14 px corner) still lifts it clear at en 1024 x 640.
      // An inset override on a live page fires no resize, so the band observer never
      // re-runs (the shell contract (feature 031, internal), e2e-play-stale): set the
      // inset and the metrics FIRST, then RELOAD under them and read the fresh boot
      await setSafeAreaInsets(chrome, { top: 0, right: 47, bottom: 0, left: 0 });
      await chrome.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 640, deviceScaleFactor: 1, mobile: false });
      await chrome.send('Page.navigate', { url: `${ARM_URL}&u=uia-989-inset` });
      await waitReady();
      let reup = false;
      for (let i = 0; i < 50 && !reup; i++) { reup = await chrome.eval('window.__shell?.isOpen?.() === true').catch(() => false); if (!reup) await sleep(200); }
      await chrome.eval(`window.__i18n?.setLocale?.('en'), true`);
      await sleep(500);
      const inset = await chrome.eval(`(() => {
        const q = document.getElementById('ob-shell-quickplay-wrap').getBoundingClientRect(), rl = document.getElementById('ob-shell-rail').getBoundingClientRect();
        return { stackLeft: Math.round(q.left), railRight: Math.round(rl.right), ix: Math.min(q.right, rl.right) - Math.max(q.left, rl.left), iy: Math.min(q.bottom, rl.bottom) - Math.max(q.top, rl.top),
          lift: document.getElementById('ob-shell')?.classList.contains('ob-shell-qp-lift') ?? null };
      })()`);
      await setSafeAreaInsets(chrome, { top: 0, right: 0, bottom: 0, left: 0 });
      check('uiaudit GH-989 sweep: with a 47 px right safe-area inset (en 1024 x 640, booted under it) the measured lift still keeps the stack off the rail',
        reup && !(inset.ix > 0 && inset.iy > 0), JSON.stringify({ reup, ...inset }));
    }
  } finally {
    await chrome.eval(`window.__i18n?.setLocale?.('en'), true`).catch(() => {});
    await chrome.send('Emulation.clearDeviceMetricsOverride');
  }
  // (2) phone band T: the status pill starts right of the LAST toolbar pill
  // and every band member shares the toolbar's centre line (± 1 px)
  await setPhoneMetrics(chrome, { width: 844, height: 390 });
  try {
    await chrome.send('Page.navigate', { url: `${ARM_URL}&u=uia-bandt` });
    await waitReady();
    for (let i = 0; i < 50; i++) { if (await chrome.eval(`document.documentElement.classList.contains('ob-touch') && window.__shell?.isOpen?.() === true`).catch(() => false)) break; await sleep(200); }
    await chrome.eval('window.__shell.quickPlay(), true');
    await sleep(1500);
    const g = await chrome.eval(`(() => {
      const st = document.getElementById('state');
      const pills = [...document.querySelectorAll('#ob-toolbar > *')].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
      if (!st || !st.getClientRects().length || !pills.length) return { err: 'band T not posed', st: !!st, pills: pills.length };
      const s = st.getBoundingClientRect(); const lastR = Math.max(...pills.map((p) => p.getBoundingClientRect().right));
      const cy = (r) => r.top + r.height / 2; const pc = cy(pills[0].getBoundingClientRect());
      return { pills: pills.length, stateLeft: s.left, lastPillRight: lastR, dy: Math.abs(cy(s) - pc), stateH: s.height };
    })()`);
    check('uiaudit band T (#1010): the status pill starts right of the last toolbar pill and shares the toolbar centre line (± 1 px) on the compact rung',
      !g.err && g.stateLeft >= g.lastPillRight - 0.5 && g.dy <= 1 && Math.abs(g.stateH - 28) <= 1, JSON.stringify(g));
  } finally {
    await chrome.send('Emulation.clearDeviceMetricsOverride');
    await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await chrome.send('Page.navigate', { url: `${APP_URL}&u=uia-arms-back` });
    await waitReady();
  }
  // (3) #1052: every kit select trigger is NAMED by its visible label — the
  // COMPUTED accessible name (CDP Accessibility), never an attribute read: a
  // combobox's text is its value, and the hidden native select takes its
  // <label>s out of the tree. The HUD cue + every Settings select, then the
  // three labelling patterns the kit meets (label for=, a wrapping label with
  // a caption span — the export / save-card markup — and aria-label) as lab
  // fixtures, where the name must not repeat the value.
  const norm = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const axKitSelects = async () => {
    const { root } = await chrome.send('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await chrome.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '.ob-select[role="combobox"]' });
    const meta = await chrome.eval(`[...document.querySelectorAll('.ob-select[role="combobox"]')].map((b) => {
      const sel = b.previousElementSibling?.tagName === 'SELECT' ? b.previousElementSibling : null;
      const vis = b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden';
      const labs = sel ? [...sel.labels].map((l) => (l.contains(sel)
        ? [...l.children].filter((c) => c !== sel && c !== b).map((c) => c.textContent).join(' ')
        : l.textContent).trim()).filter(Boolean) : [];
      return { id: sel?.id || null, vis, want: labs.join(' ') || sel?.getAttribute('aria-label') || null };
    })`);
    const out = [];
    for (let i = 0; i < nodeIds.length; i++) {
      if (!meta[i]?.vis) continue;
      const r = await chrome.send('Accessibility.getPartialAXTree', { nodeId: nodeIds[i], fetchRelatives: false });
      const n = r.nodes?.[0];
      out.push({ id: meta[i].id, want: meta[i].want, role: n?.role?.value ?? null, name: n?.name?.value ?? '', value: n?.value?.value ?? null });
    }
    return out;
  };
  const unnamed = (rows) => rows.filter((r) => !norm(r.name) || !r.want || norm(r.name) !== norm(r.want));
  try {
    await chrome.send('Accessibility.enable');
    await chrome.send('Page.navigate', { url: `${ARM_URL}&u=uia-1052` });
    await waitReady();
    for (let i = 0; i < 50; i++) { if (await chrome.eval('window.__shell?.isOpen?.() === true').catch(() => false)) break; await sleep(200); }
    await chrome.eval('window.__shell.quickPlay(), true');
    let cue = false;
    for (let i = 0; i < 60 && !cue; i++) { cue = await chrome.eval(`!!document.querySelector('#cue-select + .ob-select')?.getClientRects().length`).catch(() => false); if (!cue) await sleep(200); }
    const rows = cue ? await axKitSelects() : [];
    await chrome.eval(`document.getElementById('ob-gear')?.click(), true`); // __settings.show() switches panes but never opens the modal
    for (let i = 0; i < 25; i++) { if (await chrome.eval(`!!document.getElementById('ob-settings')?.getClientRects().length`).catch(() => false)) break; await sleep(200); }
    for (const pane of ['assists', 'display', 'language']) {
      await chrome.eval(`window.__settings.show(${JSON.stringify(pane)}), true`);
      await sleep(700);
      for (const r of await axKitSelects()) if (!rows.some((x) => x.id === r.id)) rows.push(r);
    }
    const bad = unnamed(rows);
    check('uiaudit #1052: every visible kit select — the HUD cue + the Settings assists / display / language selects — carries its visible label as its computed accessible name',
      cue && rows.length >= 7 && bad.length === 0, JSON.stringify({ cue, n: rows.length, bad: bad.slice(0, 6) }));
    // the labelling patterns, on fixtures (the export modal needs a recorded
    // clip; its markup is the wrapping-label row)
    await chrome.eval(`(async () => {
      const { upgradeSelect } = await import('./app/ui/select.js');
      document.getElementById('uia-ax-lab')?.remove();
      const host = document.createElement('div'); host.id = 'uia-ax-lab';
      host.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;display:flex;flex-direction:column;gap:8px;width:320px;background:#111;padding:8px';
      host.innerHTML = '<label for="uia-ax-for">Table size</label><select id="uia-ax-for"><option>9 ft</option></select>'
        + '<label><span class="ob-caps">Resolution</span> <select id="uia-ax-wrap"><option>1080p</option></select></label>'
        + '<select id="uia-ax-aria" aria-label="Frame rate"><option>60 fps</option></select>';
      document.body.appendChild(host);
      for (const sel of host.querySelectorAll('select')) upgradeSelect(sel);
      return true; })()`);
    await sleep(300);
    const lab = (await axKitSelects()).filter((r) => /^uia-ax-/.test(r.id || ''));
    const want = { 'uia-ax-for': 'table size', 'uia-ax-wrap': 'resolution', 'uia-ax-aria': 'frame rate' };
    check('uiaudit #1052 lab: label for=, a wrapping label with a caption span and aria-label each name the kit trigger — the wrapping label without repeating the value',
      lab.length === 3 && lab.every((r) => norm(r.name) === want[r.id]), JSON.stringify(lab));
  } finally {
    await chrome.eval(`document.getElementById('uia-ax-lab')?.remove(), true`).catch(() => {});
    await chrome.send('Accessibility.disable').catch(() => {});
    await chrome.send('Page.navigate', { url: `${APP_URL}&u=uia-arms-back2` });
    await waitReady();
  }
}

// ---- main -------------------------------------------------------------------
try {
  await waitReady();
  if (AUDIT) { await runAudit(); await runUiauditLabs(); await runUiauditSurfaceArms(); }
  else { await runBehavior(); await runHelpBlock(); await runFocusRungs(); await runToolbarFallback(); await runStripFitPad(); }

  // error gates (cdp suite convention): current page + whole CDP session
  const appErrors = await chrome.eval('window.__test.errors');
  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
console.log(process.exitCode
  ? (AUDIT ? 'E2E-UI AUDIT: FAIL' : 'E2E-UI: FAILED')
  : (AUDIT ? 'E2E-UI AUDIT: PASS' : 'E2E-UI PASS'));
