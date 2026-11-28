// Copyright (c) Meta Platforms, Inc. and affiliates.

// practice.js — the practice place's content module (feature 036 sub-slice
// (a), program 525 S4). Contract of record:
// the practice contract (feature 036, internal) (§2 card sub-registry —
// THIS module's CARD_IDS constant is its code truth; §3 selector tree +
// window.__practice test surface; §4 seams).
//
// ALTITUDE LAW (spec rulings R-07 / R-18): cards are CONTENT of the S1
// `practice` place — not places, not stations; no prop claim (propTap is
// always false). The frozen shell contract (feature 031 (internal spec)
// shell.md) is inherited by reference: the place pose is the shell's own
// row-2 anchor through the ONE mover, entry states and input isolation are
// the shell's (§7); this module issues ZERO camera moves in (a).
//
// Reached ONLY through the shell's generic content host (CONTENT_MODULES →
// mountContent, the GH-525 S4 R0 prep entry): a guarded dynamic import at
// the FIRST practice arrival — an absent/stale module leaves the S1 stub
// cards standing (cache-poison contract). Do NOT add this module to any
// static import graph. It imports NO app module statically (i18n.js is a
// leaf every shell-era module imports); settings.js / drills.js / share.js
// are reached ONLY through the window seams (__settings / __drills /
// __share), so a practice module of any vintage runs against a settings /
// drills module of any vintage — the mixed-vintage truth FR-008 renders as
// a `loading` line that heals or hides.
//
// INERT BIRTH (plan §1.1, review r2 P1): R0 delivers the module's first
// setPlace from mountContent's `.then` with the place active AT RESOLUTION
// time — or never, if the shell closed first. The root is therefore born
// hidden; nothing paints, ticks or refreshes before the first
// setPlace('practice'), which is the ONE entry initialiser.
import { t, has, onLocaleChange } from './i18n.js';
// namespace import on purpose (OWNERSHIP rule 5 / the GH-313 hasLocal law,
// the drills.js precedent): hasLocal() is reached via the namespace and
// feature-detected, so a fresh practice.js over a stale cached i18n.js keeps
// linking and degrades to the legacy copy below.
import * as i18nNs from './i18n.js';
/** GH-668 S5 practice round 13 (review r3 P2-2): true only when the ACTIVE
 * dictionary carries the key. has() consults en.json too, so under FRESH
 * en.json + a STALE active dictionary it answered true for the slice's new
 * keys and t() painted the fresh ENGLISH copy into a non-English UI ('No
 * score at Standard-Hilfe yet', 'Stop the replay to start a drill' — plus a
 * missing-key warn per key). hasLocal absent (a pre-GH-313 i18n.js) → false
 * → the legacy copy, never a raw key. e2e-practice-stale S7. */
const hasOwn = (key) => (typeof i18nNs.hasLocal === 'function' ? i18nNs.hasLocal(key) === true : false);

// ui/practice.css version — bump on EVERY change to that sheet (?v= law).
const PRACTICE_CSS_V = '015';
// ---- stylesheet (?v= leaf law; module level — the replays idiom) ---------
// Linked by the shell's LAW 1 `prefetch()` hook in idle time: the card group
// is REVEALED only once this sheet settled (below), so with the link made
// inside the factory a "settled" (imported) module still fetched its sheet
// AT the arrival and the S1 stubs stood from the shell's ARRIVAL_HOLD_MS cap
// until it landed (issue #811: e2e-shell `A3 dl / motion rail → practice`).
// Settles on load OR error (rung 6 reveals unstyled but functional, as
// before); idempotent.
let sheetPromise = null;
let sheetSettled = false;
function ensureSheet() {
  if (sheetPromise) return sheetPromise;
  sheetPromise = new Promise((res) => {
    const settle = () => { sheetSettled = true; res(true); };
    const href = new URL(`./ui/practice.css?v=${PRACTICE_CSS_V}`, import.meta.url).href;
    let link = document.getElementById('ob-practice-css');
    // #811: the shell's boot-idle preload (#ob-practice-css-pre) is adopted under
    // this id when it carries this module's href, loaded or loading; another
    // href (a stale shell's older ?v=) is unlinked
    const pre = link ? null : document.getElementById('ob-practice-css-pre');
    if (pre && pre.href === href) { pre.id = 'ob-practice-css'; link = pre; } else pre?.remove();
    if (link?.sheet) { settle(); return; }
    if (!link) {
      link = document.createElement('link');
      link.id = 'ob-practice-css';
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }
    link.addEventListener('load', settle, { once: true });
    link.addEventListener('error', settle, { once: true });
  });
  return sheetPromise;
}
/** LAW 1 prefetch hook (shell.js): link the sheet in idle time. */
export function prefetch() {
  return ensureSheet();
}
/** The coarse register (the sheet's own media query — practice.css phone
 * block; GH-668 S5 slice 4 round 6, ruling R-PR-6 (3)). */
const COARSE = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : { matches: false };

const PLACE = 'practice';
/** Card sub-registry (contract §2 — FROZEN ids and DOM order). */
const CARD_IDS = Object.freeze(['practice-drills', 'practice-playground',
  'practice-assist', 'practice-last']);
/** MIRROR of the module-private settings.js ASSIST_LEVELS (settings.js:409;
 * `window.__settings` does not expose it and this lane may not export it —
 * the duplicated-literal law: change together). */
const PRACTICE_ASSIST_LEVELS = Object.freeze(['off', 'standard', 'practice']);
const K = 'shell.place.practice.'; // the (a) key namespace (spec §6)

/** Paint-truth toggle: [hidden] AND an inline display pair from birth — the
 * shell sheet's own display rules outrank UA [hidden] (the GH-525 S2.5
 * finding-5 boot-flash class), and the practice sheet may not have loaded
 * yet at first paint. */
const showEl = (el, on) => {
  el.hidden = !on;
  el.style.display = on ? '' : 'none';
};
const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };

export function createPractice(ctx) {
  // ctx = the shell's shellCtx(section) UNION (protocol R0 (d)): { scene,
  // camera, orbit, machine, game, mover, section, bedScale, shell: { isOpen,
  // place, goTo, exitToTable, instant, decisionPending, notice,
  // showThenOpen } }. (a) uses `section` and `shell` only and feature-
  // detects `decisionPending` / `showThenOpen` (a pre-R0 shell lacks both).
  const { section, shell } = ctx ?? {};
  if (!section || !shell) return null;

  // ---- 1. stylesheet (?v= leaf law) --------------------------------------
  // href RESOLVED FROM THE MODULE URL (atelier.js idiom; review r4 P1): a
  // literal document-relative attribute would resolve against app.html →
  // web/ui/practice.css, a 404 and an unstyled place.
  // The card group is REVEALED only once this sheet has settled (loaded OR
  // failed — rung 6 reveals unstyled but functional) so the stub→card swap
  // never paints UA-styled buttons for a frame (T035 r1 frame-step: the two
  // full-card <button>s are not kit ob-btns, nothing styles them until this
  // leaf sheet lands); a 1.5 s belt reveals regardless (a stalled sheet may
  // never cost the user the place). Until then the S1 stubs stand.
  let cssSettled = false;
  let revealPending = false;
  let reveal = null; // assigned once the DOM exists (below)
  const onCss = () => { cssSettled = true; if (revealPending) reveal?.(); };
  {
    // linked by the LAW 1 prefetch already (module level, above); idempotent
    // here for a factory reached without it. A sheet that settled before this
    // factory ran is TRUE synchronously (the earlier-instance branch, kept).
    const p = ensureSheet();
    if (sheetSettled) cssSettled = true;
    else p.then(onCss, onCss);
  }

  // kit leaves land by guarded dynamic import AFTER the DOM build (below);
  // until/unless they resolve the degrade register stands: native radios
  // as kit rows for the assist control, window.confirm for the consent.
  const kit = { confirm: null };

  // ---- 2. find the S1 stub children, keep the H2 -------------------------
  // The stubs STAND until the first setPlace('practice') retires them in the
  // SAME synchronous step that shows the card group — the replacement is
  // paint-atomic (SC-004: the section never paints a bare heading, and no
  // stub/card frame overlap; T035 visual audit r1). hidden + inline display
  // pair at retirement (paint truth: shell.css's own `.ob-shell-actions
  // { display:flex }` outranks UA [hidden]; the practice sheet's host kill
  // rule is only the belt). A failed import never reaches this module — the
  // stubs then stand (cache-poison degrade); no un-retire path is needed
  // (contentDegraded cannot gain 'practice' after this point).
  let h2 = null;
  const stubs = [];
  for (const child of [...section.children]) {
    if (child.tagName === 'H2') { h2 ??= child; continue; }
    stubs.push(child);
  }
  let stubsRetired = false;
  const retireStubs = () => {
    if (stubsRetired) return;
    stubsRetired = true;
    for (const el of stubs) showEl(el, false);
  };
  // ---- 3. the ADDITIVE host class the sheet keys its layout on -----------
  section.classList.add('ob-practice-host');
  // ---- 4. a stable id on the shell's id-less H2 BEFORE the group mounts
  // (the shell creates it with data-i18n + text only; idempotent — never
  // overwrites an existing id; review r4 P2) --------------------------------
  if (h2) h2.id ||= 'ob-practice-title';
  const titleId = h2?.id ?? 'ob-practice-title';

  // ---- 4. chrome DOM (contract §3 — ALL four cards present from build;
  // visibility toggles by hidden + the inline display pair) ---------------
  const root = document.createElement('div');
  root.id = 'ob-practice';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-labelledby', titleId);
  showEl(root, false); // BORN hidden (inert birth — see the header)

  const mkText = (tag, cls, key) => {
    const el = document.createElement(tag);
    el.className = cls;
    el.dataset.i18n = key;
    el.textContent = t(key);
    return el;
  };
  /** ACT_CARD marks an article whose whole body is the kit .ob-card-option
   * row (the row paints the rung; the article paints nothing — GH-668
   * B-PR07, ui/practice.css). Toggled on the last-drill card by ensureLine. */
  const ACT_CARD = 'ob-practice-card--act';
  const mkCard = (id, act = false) => {
    const a = document.createElement('article');
    a.className = act ? `ob-practice-card ${ACT_CARD}` : 'ob-practice-card';
    a.dataset.ob = id;
    // GH-668 S5 G7: a card's CHROME is part of the card's tap surface.
    // Chrome's touch adjustment snaps a tap on a node that answers no click
    // onto the nearest node that does, inside the touch rect — on the S5
    // phone rhythm the assist heading sits 9 px under the Free-practice
    // button, so a tap (or a 1 px creep) on the heading was delivered as a
    // click INTO that button (e2e-shell Q4(2) / Q4(3), reproduced in the
    // G7 lab: pointerup on the heading @185, click on the button @175;
    // G2's looser rhythm never hopped). A click responder on the article
    // makes the card under the finger the best candidate, so the heading
    // tap stays on the heading and acts as nothing — the shell's hold law
    // is untouched (it listens on the section).
    a.addEventListener('click', () => {});
    return a;
  };
  /** The kit card-pole anatomy (kit.css .ob-card-option: __body > __name +
   * __hint) around the two practice spans; the .ob-practice-title /
   * .ob-practice-hint classes stay as HOOKS on the same nodes (the e2e-ui
   * PRACTICE_GEO_WALKER + the 036 suite address them). */
  const ACT_ROW = 'ob-card-option ob-practice-act';
  const ACT_NAME = 'ob-card-option__name ob-practice-title';
  const ACT_HINT = 'ob-card-option__hint ob-practice-hint';
  const actBody = (title, hint) => {
    const body = document.createElement('span');
    body.className = 'ob-card-option__body';
    body.append(title, hint);
    return body;
  };
  /** Action card body: the whole card is ONE kit .ob-card-option button
   * (≥44 pt on every register — the kit's own floor; B-PR07). */
  const mkAct = (titleKey, hintKey) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = ACT_ROW;
    const title = mkText('span', ACT_NAME, titleKey);
    const hint = mkText('span', ACT_HINT, hintKey);
    b.appendChild(actBody(title, hint));
    return { b, title, hint };
  };

  // ---- seams (read at call time, never cached — mixed vintage) ----------
  const sget = () => safe(() => window.__settings?.get?.() ?? {}, {}) ?? {};
  const lastId = () => safe(() => window.__drills?.last?.() ?? null, null);
  /** The COMMIT lock the seams consult (`ctx.replayActive = () =>
   * replay.active`, share.js:733 — read by changeMode and the drills start
   * pin): a finished-not-dismissed replay reads {active:true, done:true}
   * and still locks. NOT the shell's entry-only sharedReplayLive (which
   * releases on `done`). Seam absent / throws → false (fail-open like the
   * shell's own read). */
  const replayLocked = () => safe(() => !!window.__share?.replay?.()?.active, false);
  /** GH-697 review r1 verifier (PR #706): a FINISHED shared replay is
   * resolved BEFORE the replay-lock pre-check. The lock above reads
   * {active:true, done:true} for a finished-not-dismissed replay, so a
   * share-link recipient who had watched to the end and tapped Drills /
   * Free practice / the last drill from the post-replay hall was refused
   * ("A shared replay is running") for a replay that was over — and the
   * hall never closed (every refusal is judged BEFORE the exit, so the
   * shell's own exitToTable() seam call came too late for these cards).
   * Same seam the shell calls first thing in exitToTable (share.js
   * `exitFinishedReplay`: synchronous state teardown, `replay.active`
   * false before it returns; the fresh rack follows a few microtasks
   * later). A replay still RUNNING (`done` false) is left alone and keeps
   * the refusal; seam absent (older share.js) → the guard reads as before.
   * Returns true when a finished replay was resolved by THIS action. */
  const resolveFinishedReplay = () => safe(() => {
    const S = window.__share;
    if (S?.replay?.()?.done !== true) return false;
    return S.exitFinishedReplay?.() === true;
  }, false);
  /** After a finished replay was resolved in THIS action, its teardown's
   * fresh rack lands asynchronously (exitReplay awaits the persisted-game
   * restore, then re-racks). A drill start lays the table out
   * synchronously, so it must FOLLOW that re-rack or the re-rack destroys
   * the drill's layout — a bounded wait on the pristine read (shot index 0
   * with the replay inactive), never a timer race; expired → start anyway
   * (the pin's own refusals stand). */
  const awaitFreshRack = async () => {
    for (let i = 0; i < 40 && !rackPristine(); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
  };
  /** Fail-closed pristine read (the ateliercue.js F2 idiom): only an
   * EXPLICIT true means "zero shots this rack"; an absent predicate (pre-R1
   * settings.js) counts as progressed, so the consent stands. */
  const rackPristine = () => safe(() => window.__settings?.rackPristine?.() === true, false);
  /** GH-681: a LIVE drill run — `state()` is the active snapshot with
   * `done === false` (a 0-shot run counts; the parked post-completion
   * snapshot reads done:true and is not a run to lose). Seam absent /
   * throws → false (no run to guard). */
  const drillLive = () => safe(() => window.__drills?.state?.()?.done === false, false);
  const drillLiveSnap = () => safe(() => {
    const st = window.__drills?.state?.();
    if (st?.done !== false) return null;
    const id = st.id;
    return { id, name: has(`drills.name.${id}`) ? t(`drills.name.${id}`) : id };
  }, null);
  /** The shell's conflicting-commit gate (GH-541; ctx member, feature-
   * detected — a pre-GH-541 shell refuses ENTRY under the old law, so the
   * gate is unreachable there). */
  const decisionPending = () => safe(() => shell.decisionPending?.() === true, false);

  // ---- the honest refusal register (spec R-10; contract §3 refuse()) ----
  // ONE helper shared by every card: presents the shell notice AND records
  // the key; the next SUCCESSFUL action clears it. The shell's own notice
  // is the register (`shell.notice(key)` → note(t(key)), 4 s, role=status).
  let lastNoticeKey = null;
  const refuse = (key) => {
    lastNoticeKey = key;
    safe(() => shell.notice?.(key));
    return false;
  };
  const succeed = () => { lastNoticeKey = null; };
  // GH-668 S5 slice 4 G6 (F-15's second half, the slice-2 hand-over): a
  // replay-locked refusal names the EXIT ("Stop the replay to start a
  // drill / free practice"), not the bare condition. Guarded on the ACTIVE
  // dictionary (round 13, review r3 P2-2 — has() before, which fell through
  // to the fresh English exit copy when only en.json was fresh): a cached
  // locale file without the new keys falls back to the condition key
  // rather than painting a raw key (the OWNERSHIP mixed-cache law).
  const replayKey = (card) => {
    const key = `shell.place.practice.${card}`;
    return hasOwn(key) ? key : 'shell.notice.replay';
  };

  // ---- card actions -------------------------------------------------------
  // The sequential hand-off law (shell.js practice branch precedent): the
  // shell exits through its OWN path FIRST, THEN the surface opens. Every
  // refusal is known BEFORE the exit — exitToTable() closes unconditionally
  // and reports nothing.

  /** (1) Drills (T007 / FR-004). CAPABILITY GUARD FIRST OF ALL (review r4
   * P1): read at call time; false → INERT (no exit, no notice, no refuse()
   * write) — this covers the FR-008 `loading` register AND the hidden-
   * after-3-ticks state, and the SAME routine backs the returned primary(),
   * so the shell's section hold is inert too. Then a FINISHED replay is
   * resolved (GH-697 verifier), then the replay-lock pre-check, then exit
   * → open('shell') (the existing `source` arg, drills.js:2402-2407 →
   * panel.dataset.entrySource). */
  const drillsAction = () => {
    const open = window.__drills?.open;
    if (typeof open !== 'function') return false;
    resolveFinishedReplay();
    if (replayLocked()) return refuse(replayKey('replayDrill'));
    succeed();
    shell.exitToTable();
    safe(() => open.call(window.__drills, 'shell'));
    return true;
  };

  /** (2) Free practice (T008 refusal-first, T009 F2 consent, T010
   * playground-current). ORDER (review r1 P1 — refusal checks BEFORE the
   * consent branch, else a progressed rack under a pending decision / live
   * replay opens a dialog the seam then refuses):
   *   already playground → exitToTable() ONLY, no changeMode (FR-007; the
   *     leave-playground re-rack leg stays with HUD/modal callers);
   *   (0) a FINISHED shared replay is resolved (GH-697 verifier) — the
   *       rack it leaves is the replay's, torn down by that resolution
   *       (fresh rack follows), so neither the consent nor the decision
   *       pre-check has a game of the viewer's to guard: straight to the
   *       commit, whose changeMode boolean stays authoritative;
   *   (1) replayLocked() → notice replay, stay, NO dialog;
   *   (2) rackPristine() → straight to changeMode;
   *   (3) progressed: decisionPending() → notice decision, stay, NO dialog
   *       (= changeMode's own decisionConflict, settings.js:768-775 — the
   *       pre-check and the gate agree by construction); else the consent;
   *   then REVALIDATE after the await (shell still open at practice, the
   *   per-tap token unchanged — the ateliercue.js:694-699 idiom) → the
   *   changeMode boolean is AUTHORITATIVE (spec R-10): true → exit; false →
   *   notice(decisionPending ? decision : replay), stay. */
  let pgToken = 0; // per-tap token; bumped by every cancel/exit/leave
  const playgroundAction = async () => {
    const S = window.__settings;
    if (typeof S?.changeMode !== 'function') return false; // capability guard (inert)
    if (sget().mode === 'playground') {
      succeed();
      shell.exitToTable();
      return true;
    }
    const resolved = resolveFinishedReplay();
    if (replayLocked()) return refuse(replayKey('replayFree'));
    // GH-681: the consent is gated on a LIVE drill run too, not only on
    // the rack — a 0-shot run has a pristine rack and was stopped with no
    // consent at all; the copy then names the run that is lost.
    const drill = drillLiveSnap();
    if (!resolved && (!rackPristine() || drill)) {
      if (!rackPristine() && decisionPending()) return refuse('shell.notice.decision');
      if (confirmHandle) return false; // one consent at a time (keyboard re-tap)
      const token = ++pgToken;
      const ok = await consent(drill);
      if (!ok) return false; // Cancel = full no-op
      if (token !== pgToken || !shell.isOpen() || shell.place() !== PLACE) return false;
    }
    return commitPlayground();
  };
  const commitPlayground = () => {
    // GH-681: the consent above is the USER path — the run it named is
    // stopped through the drills engine's own non-silent stop (the dock
    // Stop button's register: the "Drill stopped" toast + the abandoned
    // record on the console wire), BEFORE the mode flips (changeMode's
    // own `__drills.stop(true)` is the programmatic silent law and finds
    // nothing left to stop). Re-read at commit time: a run that ended
    // during the await is a parked snapshot, not a run to announce.
    if (drillLive()) safe(() => window.__drills?.stop?.());
    const ok = safe(() => window.__settings?.changeMode?.('playground'), false) === true;
    if (!ok) {
      return refuse(decisionPending() ? 'shell.notice.decision' : replayKey('replayFree'));
    }
    succeed();
    shell.exitToTable();
    return true;
  };

  /** F2 consent (spec R-05, plan P-R5) through the kit confirmDialog —
   * called, never re-implemented. The kit's root keeps its hard-coded
   * data-ob="confirm" (dialog.js:307); practice stamps the ADDITIVE
   * data-ob-context="practice-playground" on document.body's LAST
   * .ob-confirm[data-ob="confirm"] child on the same tick (the kit appends
   * it synchronously inside the executor) and keeps that element as the
   * handle for cancellation. Kit absent → window.confirm(t(body)). Cancel
   * default-focused (the kit's own DOM order). */
  let confirmHandle = null;
  /** `drill` (GH-681): the live run snapshot {id, name} or null — with a
   * run live the dialog speaks the drill register (the dock Stop title
   * `drills.confirmStop.title` + `${K}confirmBodyDrill` naming the run,
   * ×7), never the game-leaving "cannot be resumed" copy. */
  const consent = async (drill = null, ask = null) => {
    // GH-981: `ask` = a drill start's consent (__drills.startConsent — the
    // picker card's own copy and danger register), tagged practice-drill
    const body = ask ? ask.body : drill
      ? t(`${K}confirmBodyDrill`, { name: drill.name })
      : t(`${K}confirmBody`);
    const title = ask ? ask.title
      : drill ? t('drills.confirmStop.title') : t(`${K}confirmTitle`);
    if (typeof kit.confirm !== 'function') {
      return safe(() => window.confirm(body) === true, false);
    }
    let promise;
    try {
      promise = kit.confirm({
        title,
        body,
        confirmLabel: ask ? ask.confirm : t(`${K}confirmOk`),
        cancelLabel: t('confirm.cancel'),
        danger: ask ? ask.danger === true : false,
      });
    } catch {
      return safe(() => window.confirm(body) === true, false); // kit threw: the ladder's next rung
    }
    const panels = document.body.querySelectorAll(':scope > .ob-confirm[data-ob="confirm"]');
    const panel = panels[panels.length - 1] ?? null;
    if (panel) {
      panel.dataset.obContext = ask ? 'practice-drill' : 'practice-playground';
      confirmHandle = panel;
    }
    let ok = false;
    try { ok = (await promise) === true; } catch { ok = false; }
    if (confirmHandle === panel) confirmHandle = null;
    return ok;
  };
  /** Cancellation THROUGH THE KIT'S OWN settle(false) path — the Cancel
   * click (dialog.js:338-348 resolves false, runs closePanel, removes the
   * panel). NEVER closePanel directly (the promise and the kit teardown
   * would stay pending). Runs from onShellExit() AND from setPlace(id !==
   * 'practice') — __shell.go('play') forwards setPlace, not onShellExit. */
  const cancelConfirm = () => {
    pgToken += 1; // a stale await can never commit
    const h = confirmHandle;
    if (!h) return;
    confirmHandle = null;
    safe(() => h.querySelector('[data-ob="confirm-cancel"]')?.click());
  };

  /** (4) Last drill (T014 / FR-010): the SAME pre-checks as Free practice
   * (finished replay resolved — GH-697 verifier; replay lock; decision on
   * a progressed rack) → the start's consent (GH-981, drills.js
   * startConsent) → exitToTable() → [resolved: the bounded fresh-rack
   * wait, so the start's layout is not destroyed by the resolution's own
   * re-rack] → await __drills.start(lastId) (async, Promise<boolean> —
   * never truthy-test the promise; a resolved false after the exit is the
   * residual unknown-id class, a no-op at the table; `start` owns the
   * practice pin). */
  const lastAction = async () => {
    const id = lastId();
    const D = window.__drills;
    if (!id || typeof D?.start !== 'function') return false;
    const resolved = resolveFinishedReplay();
    if (replayLocked()) return refuse(replayKey('replayDrill'));
    if (!resolved && !rackPristine() && decisionPending()) return refuse('shell.notice.decision');
    // GH-981: the start owes the picker card's consent (a progressed game,
    // a live run), asked HERE, inside the hall, before the exit — the
    // Free-practice consent's order and revalidation. A resolved replay
    // left nothing of the viewer's to guard. Absent seam (stale drills.js):
    // the pre-fix straight start.
    const ask = resolved ? null : safe(() => D.startConsent?.(id) ?? null, null);
    if (ask) {
      if (confirmHandle) return false; // one consent at a time (keyboard re-tap)
      const token = ++pgToken;
      const ok = await consent(null, ask);
      if (!ok) return false; // Cancel = full no-op
      if (token !== pgToken || !shell.isOpen() || shell.place() !== PLACE) return false;
    }
    succeed();
    shell.exitToTable();
    if (resolved) await awaitFreshRack();
    try { await D.start(id); } catch { /* residual: a no-op at the table */ }
    return true;
  };

  const actions = {
    drills: drillsAction,
    playground: playgroundAction,
    last: lastAction,
  };

  // GH-668 S5 G7: the shell commits this place's primary on a hold's
  // RELEASE (shell.js armCardHold → primary()); the browser then delivers
  // the same touch's synthesized click, and the shell's tapShield exempts
  // everything inside the shell root — where these cards live — so that
  // click reached an act row and acted a SECOND time (Q4(3): the hold opened
  // the picker, the echo click fired Free practice and closed it). The act
  // rows drop a click that echoes a hold commit; HOLD_ECHO_MS mirrors the
  // shell's own HOLD_CLICK_MS window.
  // #1130: two bounds, either drops the echo — the commit's and the click's
  // own stamps (window.event is the release dispatching primary(); the click
  // carries its own) and the handler's clock — so the drills action's own
  // work does not move the echo out of the window, and a late-stamped click
  // (WebKit's synthetic tap click) still meets the old bound. The stamps come
  // from the shell's one stamp helper (shellCtx `shell.inputClock`); a stale
  // shell.js without the member leaves the handler's clock, the old bound.
  // #1136: only a pointer click (detail > 0) can be the hold's trailing echo;
  // a keyboard or assistive-tech activation (detail 0) always acts.
  const HOLD_ECHO_MS = 600;
  const inputClock = typeof shell?.inputClock === 'function' ? shell.inputClock : () => performance.now();
  let holdCommitAt = { input: -Infinity, handled: -Infinity };
  const holdEcho = (e) => (e?.detail ?? 0) > 0
    && (inputClock(e.timeStamp) - holdCommitAt.input < HOLD_ECHO_MS
      || performance.now() - holdCommitAt.handled < HOLD_ECHO_MS);

  // (1) Drills
  const cardDrills = mkCard(CARD_IDS[0], true);
  const drills = mkAct(`${K}drills`, `${K}drillsHint`);
  drills.b.addEventListener('click', (e) => { if (!holdEcho(e)) actions.drills(); });
  cardDrills.appendChild(drills.b);

  // (2) Free practice
  const cardPg = mkCard(CARD_IDS[1], true);
  const pg = mkAct(`${K}playground`, `${K}playgroundHint`);
  pg.b.addEventListener('click', (e) => { if (!holdEcho(e)) actions.playground(); });
  cardPg.appendChild(pg.b);

  // (3) Practice assist: title + NESTED radiogroup mount + secondary. The
  // mount `[data-ob="practice-assist-strip"]` (frozen selector) holds three
  // NATIVE radios (label > input[type=radio] + span) and becomes the kit
  // SEGMENTED on resolve (GH-668 B-PR01 / R8: controls.js upgradeSegmented;
  // B-K03 intrinsic width, equal segments, nowrap, the --stack fallback).
  // The key-gate exemption keys on
  // `[data-ob="practice-assist-strip"][data-ob-roving]`, stamped ONLY once
  // the segmented is armed (below) — never on this article, never on the
  // kit-less rung.
  const cardAssist = mkCard(CARD_IDS[2]);
  const assistTitle = mkText('span', 'ob-practice-title', `${K}assist`);
  assistTitle.id = 'ob-practice-assist-title';
  const stripMount = document.createElement('div');
  stripMount.dataset.ob = 'practice-assist-strip';
  stripMount.setAttribute('role', 'radiogroup');
  stripMount.setAttribute('aria-labelledby', assistTitle.id);
  // segments over the module's OWN frozen mirror (labels = the minted
  // compact keys assistOff/assistStandard/assistPractice — the R9 names
  // Off / Standard / Full; the modal keeps the long settings.assist* strings)
  const segs = PRACTICE_ASSIST_LEVELS.map((id) => {
    const labelKey = `${K}assist${id[0].toUpperCase()}${id.slice(1)}`;
    return { id, labelKey, label: () => t(labelKey) };
  });
  /** The control renders FROM the settings truth (the ob:settings broadcast
   * re-runs refresh), never from local state — plan R7 echo-loop guard. */
  const currentAssist = () => {
    const a = sget().assist;
    return PRACTICE_ASSIST_LEVELS.includes(a) ? a : null;
  };
  const selectAssist = (id) => {
    if (id === currentAssist()) return;
    const S = window.__settings;
    if (typeof S?.set !== 'function') return; // no seam: the control is hidden anyway
    safe(() => S.set('assist', id));
    succeed(); // a successful action clears the refusal register (contract §3)
  };
  /** ONE DOM shape on every rung: `label[data-assist] > input[type=radio]
   * + span[data-i18n]` — the kit segmented's own anatomy (controls.js, the
   * play carom fork idiom). Kit-less rung = the same NATIVE radios dressed
   * as kit rows (.ob-btn--row, GH-668 B-K01) with NO data-ob-roving: the
   * shell gate keeps ending the arrow bubble at the window (Tab / Space
   * operate them). `data-assist` rides the LABEL (the suites' selector,
   * contract §3); a radio's own `checked` is the selection state. */
  const assistInputs = {};
  const buildRadios = () => {
    stripMount.textContent = '';
    for (const s of segs) {
      const lab = document.createElement('label');
      // UNDRESSED until the kit resolves (S5 slice 4 round 2, e2e-practice P-F
      // 'segmented shape … rowDress' on the r2 tip): a label built as
      // `.ob-btn.ob-btn--row` is armed by the kit's document-wide auto-row
      // law (controls.js armAutoRow: ResizeObserver per `.ob-btn`, never
      // released when the classes come off), and its first judge in the
      // PILL form re-adds `ob-btn--row` to a SEGMENTED label. The kit-less
      // dress rides the import's own degrade paths (dressKitless below).
      lab.dataset.assist = s.id;
      const inp = document.createElement('input');
      inp.type = 'radio';
      inp.name = 'ob-practice-assist';
      inp.value = s.id;
      const txt = document.createElement('span');
      txt.dataset.i18n = s.labelKey;
      txt.textContent = s.label();
      lab.append(inp, txt);
      inp.addEventListener('change', () => { if (inp.checked) selectAssist(s.id); });
      assistInputs[s.id] = inp;
      stripMount.appendChild(lab);
    }
  };
  buildRadios();
  const more = document.createElement('button');
  more.type = 'button';
  // the kit GHOST pill at its intrinsic width, end-aligned in the card
  // column (GH-668 B-K01 / B-PR07: a secondary action, never a full-width
  // row box; the sheet places it, the kit paints it)
  more.className = 'ob-btn ob-btn--ghost';
  more.dataset.ob = 'practice-assist-more';
  more.dataset.i18n = `${K}assistMore`;
  more.textContent = t(`${K}assistMore`);
  // the shell's OWN pose-then-open (settings.show(id) → gear click →
  // theater) — the modal opens OVER the open shell; never an exit
  more.addEventListener('click', (e) => {
    if (holdEcho(e)) return;
    if (typeof shell.showThenOpen !== 'function') return;
    safe(() => shell.showThenOpen('assists'));
    succeed(); // a successful action clears the refusal register (contract §3)
  });
  // mixed-vintage truth: the secondary rides the R0 ctx member; a shell
  // without it (pre-R0 shell.js) simply has no "All assists" affordance
  showEl(more, typeof shell.showThenOpen === 'function');
  cardAssist.append(assistTitle, stripMount, more);

  // (4) Last drill: a <button> when __drills.last() is non-null, else a
  // <p> line — ONE line node at a time (the title/hint spans keep identity
  // across the swap; never two lines in the DOM).
  const cardLast = mkCard(CARD_IDS[3]);
  const lastTitle = mkText('span', 'ob-practice-title', `${K}last`);
  const lastHint = mkText('span', 'ob-practice-hint', `${K}noDrills`);
  let lastLine = null;
  // the two spans keep identity across the swap; their classes follow the
  // line's register: the kit card-option anatomy on the BUTTON, the kit
  // type roles (.ob-control / .ob-hint) on the plain <p> line
  const ensureLine = (tag) => {
    if (lastLine?.tagName === tag) return lastLine;
    const el = document.createElement(tag);
    const act = tag === 'BUTTON';
    cardLast.classList.toggle(ACT_CARD, act);
    if (act) {
      el.type = 'button';
      el.className = ACT_ROW;
      el.addEventListener('click', (e) => { if (!holdEcho(e)) actions.last(); });
      lastTitle.className = ACT_NAME;
      lastHint.className = ACT_HINT;
      el.appendChild(actBody(lastTitle, lastHint));
    } else {
      el.className = 'ob-practice-line';
      lastTitle.className = 'ob-control ob-practice-title';
      lastHint.className = 'ob-hint ob-practice-hint';
      el.append(lastTitle, lastHint);
    }
    if (lastLine) cardLast.replaceChild(el, lastLine); else cardLast.appendChild(el);
    lastLine = el;
    return el;
  };
  ensureLine('P');

  root.append(cardDrills, cardPg, cardAssist, cardLast);
  // ---- 5. mount INSIDE the glass section — never body-level -------------
  section.appendChild(root);

  // ---- kit leaves (guarded dynamic imports, feature-detected; plan §1.5
  // degrade ladder rung 1: segmented → the native radios above stand as
  // kit rows, dialog → window.confirm, motion → static) -------------------
  /** Upgrade the mount to the kit SEGMENTED (controls.js upgradeSegmented
   * adds .ob-segmented + the role and arms the --stack measure over the
   * SAME label > input children; GH-668 B-PR01 / B-K03). The kit-row
   * dressing comes off the labels (a segment paints the kit's own register).
   * ARMED = the mount's own keydown guard ends the bubble of the nav keys
   * AFTER the native radio handled them (an arrow checks the next radio
   * natively → change → selectAssist; aim.js's window handler never sees
   * it) — only then is data-ob-roving stamped, so the shell key-gate
   * exemption `[data-ob="practice-assist-strip"][data-ob-roving]` releases
   * those keys to the radios (036 contract §2 row 3 as re-defined by §9). */
  const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
  const upgradeAssist = (upgradeSegmented) => {
    upgradeSegmented(stripMount);
    for (const lab of stripMount.querySelectorAll(':scope > label')) {
      lab.classList.remove('ob-btn', 'ob-btn--row');
    }
    stripMount.addEventListener('keydown', (e) => {
      if (NAV_KEYS.includes(e.key)) e.stopPropagation();
    });
    stripMount.dataset.obRoving = '';
    refresh(); // reflect the selection (a no-op before the first setPlace)
  };
  /** kit-less rung (a refused / stale controls.js): the same NATIVE radios
   * dressed as kit rows (.ob-btn--row, GH-668 B-K01), no data-ob-roving */
  const dressKitless = () => {
    for (const lab of stripMount.querySelectorAll(':scope > label')) lab.classList.add('ob-btn', 'ob-btn--row');
  };
  import('./ui/controls.js')
    .then((m) => { if (typeof m.upgradeSegmented === 'function') upgradeAssist(m.upgradeSegmented); else dressKitless(); })
    .catch(dressKitless);
  import('./ui/dialog.js')
    .then((m) => { if (typeof m.confirmDialog === 'function') kit.confirm = m.confirmDialog; })
    .catch(() => { /* kit-less rung: window.confirm */ });
  // NO group entrance motion (T035 visual audit r1): the other places show
  // their cards statically inside the shell's own section presentation (the
  // atelier calls no enter()); a practice-only fade+rise started from
  // opacity 0 and painted a bare heading for the first frames — the SC-004
  // violation. Plan §1.6 / spec edge cases only forbid animating in under
  // reduced motion; nothing mandates an entrance. The `.ob-practice-card`
  // colour/border transitions in practice.css remain the module's only
  // motion (under prefers-reduced-motion: no-preference).
  // the card GROUP is the block-axis scrollport when the host clamps (phone
  // landscape, practice.css) and a tap's scrollIntoView can park it mid-way
  // on any register: the kit scroll-edge fade (GH-534 r7 law — a truthful
  // top/bottom band only while content is clipped) arms on it exactly as
  // the atelier arms its cards box (atelier.js). Guarded import; degrade =
  // affordance-only (the group still scrolls with no band). On desktop the
  // group never overflows, so no band ever paints there.
  import('./ui/scrollfade.js')
    .then((m) => { m.attachScrollFade?.(root); })
    .catch(() => { /* affordance-only degrade */ });
  // the FOLD-SNAP law (GH-525 integrator 2026-09-05; combined review visual
  // audit r1 finding 7 — the phone fold clipped into the assist strip's
  // option glyphs): the group's clip edge lands on a clean boundary at rest
  // and at every scrolled stop (ui/foldsnap.js, the replays entries 24 / 25
  // law); the host's clamp stays the BUDGET, the leaf writes --fs-h /
  // --fs-pad and practice.css consumes them. GH-668 B-PR04 / B-K18: the
  // card BOXES join the control-box atoms, so a clip edge never crosses a
  // card that fits the clean window — folds land on the sp-1 card gaps
  // (a card taller than the window is judged by its own controls: the
  // leaf's FIT RULE). The handle is kept: the shell's band write
  // (ob:shell-bands — the rail band moved, so the host's cap and the
  // leaf's budget moved with it) re-DERIVES the fold via refresh(); a
  // derivation ends with the leaf's own re-snap onto the new stop set.
  // resnap() alone would settle onto the stale stops, and the leaf's
  // host ResizeObserver cannot hear a cap that GROWS while the group is
  // snapped below it (the host's height does not change). refresh() is
  // rAF-coalesced inside the leaf (one derivation per frame), so this
  // listener never mutates layout inside the shell's event (the
  // undelivered-notifications trap). Guarded leaf; degrade = the clamp
  // layout (today's behaviour). Locale re-labels and block resizes are
  // heard by the leaf itself (its MutationObserver / ResizeObserver).
  // GH-668 S5 slice 4 round 3: the assist MOUNT's box joins the atoms —
  // the leaf's DEFAULT_ATOMS name the control border boxes (the three
  // `label:has(input)`), not the kit segmented GROUP around them, whose
  // 2 px pad + 1 px ring sit below the labels' bottom edge; once the pill
  // returned in every Latin locale (kit hunk #3b) the es / fr 844×390
  // fold landed exactly on the labels' bottom (--fs-h 235.53) and cut the
  // ring by 3 px at rest (P-J: "sits inside the budget yet the fold leaves
  // it cut"). With the mount as an atom the clean boundary is the group's
  // own edge (kit-less rung: the same mount, a plain radio column).
  import('./ui/foldsnap.js')
    .then((m) => {
      const fold = m.attachFoldSnap?.(root, {
        host: section,
        row: '.ob-practice-card',
        atoms: '.ob-practice-card, [data-ob="practice-assist-strip"], ' + (m.DEFAULT_ATOMS ?? ''),
      });
      if (fold?.refresh) window.addEventListener('ob:shell-bands', () => fold.refresh());
    })
    .catch(() => { /* the group scrolls without the snap */ });

  // ---- FR-008 capability register (T011; spec R-11, plan P-R4) ----------
  // While a card's seam member is undefined the card shows the `loading`
  // hint with aria-busy (mixed-vintage truth: a practice.js of this vintage
  // over a drills.js / settings.js still loading — or one that never grows
  // the member). A PRIVATE 2 s interval (the shell's capTimer is not
  // exposed) counts the ticks WITHOUT the seam: after 3 the card hides;
  // the seam appearing resets the count (heal within one tick). Ticks run
  // only while the player is at practice (started in setPlace('practice'),
  // cleared on any other place and on onShellExit).
  const CAP_TICK_MS = 2000;
  const CAP_HIDE_TICKS = 3;
  const caps = [
    { id: CARD_IDS[0], card: cardDrills, hint: drills.hint, hintKey: `${K}drillsHint`,
      present: () => typeof window.__drills?.open === 'function', misses: 0 },
    { id: CARD_IDS[1], card: cardPg, hint: pg.hint, hintKey: `${K}playgroundHint`,
      present: () => typeof window.__settings?.changeMode === 'function', misses: 0 },
  ];
  const loading = new Set(); // data-ob values currently in the register
  let capTimer = 0;
  const capTick = () => {
    for (const c of caps) c.misses = c.present() ? 0 : c.misses + 1;
    refresh();
  };
  const capStart = () => { if (!capTimer) capTimer = setInterval(capTick, CAP_TICK_MS); };
  const capStop = () => { if (capTimer) { clearInterval(capTimer); capTimer = 0; } };
  const setHint = (hint, key) => {
    if (hint.dataset.i18n === key) return;
    hint.dataset.i18n = key;
    hint.textContent = t(key);
  };
  function renderCaps() {
    for (const c of caps) {
      const ok = c.present();
      if (ok) c.misses = 0;
      const hidden = !ok && c.misses >= CAP_HIDE_TICKS;
      showEl(c.card, !hidden);
      if (ok || hidden) {
        loading.delete(c.id);
        c.hint.removeAttribute('aria-busy');
        setHint(c.hint, c.hintKey);
      } else {
        loading.add(c.id);
        c.hint.setAttribute('aria-busy', 'true');
        setHint(c.hint, `${K}loading`);
      }
    }
  }

  // ---- refresh: DOM truth from the seams; runs ONLY once armed -----------
  let armed = false; // the first setPlace('practice') arms paint/refresh
  function refresh() {
    if (!armed) return;
    renderCaps();
    const s = sget();
    // (2) playground-current (T010 / FR-007): aria-current + the `on` title
    const pgOn = s.mode === 'playground';
    if (pgOn) cardPg.setAttribute('aria-current', 'true');
    else cardPg.removeAttribute('aria-current');
    // the kit row wears the G9 register (dim-3 fill + accent hairline +
    // accent ink, no glow) off the SAME truth — the article keeps the frozen
    // attribute (contract §3) and paints no register of its own
    if (pgOn) pg.b.setAttribute('aria-current', 'true');
    else pg.b.removeAttribute('aria-current');
    const pgKey = pgOn ? `${K}playgroundOn` : `${K}playground`;
    if (pg.title.dataset.i18n !== pgKey) {
      pg.title.dataset.i18n = pgKey;
      pg.title.textContent = t(pgKey);
    }
    // (3) assist: selection reflected from the settings truth on BOTH rungs
    // (native radios: input.checked — the segmented paints
    // :has(input:checked), the kit-less rows show the radio itself); the
    // control hidden without the `set` seam, the secondary without the
    // shell's showThenOpen; the card stands while either lives. A
    // programmatic `checked` write fires no change (no echo loop).
    const a = currentAssist();
    for (const [id, inp] of Object.entries(assistInputs)) inp.checked = id === a;
    const stripOn = typeof window.__settings?.set === 'function';
    const moreOn = typeof shell.showThenOpen === 'function';
    showEl(stripMount, stripOn);
    showEl(more, moreOn);
    showEl(cardAssist, stripOn || moreOn);
    const id = lastId();
    ensureLine(id ? 'BUTTON' : 'P');
    if (!id) {
      lastHint.dataset.i18n = `${K}noDrills`;
      lastHint.textContent = t(`${K}noDrills`);
    } else {
      delete lastHint.dataset.i18n;
      const name = has(`drills.name.${id}`) ? t(`drills.name.${id}`) : id;
      const best = bestLine(id, a);
      // GH-668 S5 slice 4 (B-PR05 / the GH-144 chips law): the line is
      // nowrap ATOMS (span.seg) joined by ' · ' separator spans (span.sep)
      // — a break lands only at a separator, never inside "Assistance
      // standard"; textContent stays the byte-identical joined string.
      // (the noScoreYet SENTENCE is prose, not an atom: it wraps at its
      // own spaces — span.text — so a long locale never overflows the card)
      const atoms = [[name, 'seg']];
      if (best) {
        atoms.push([best.scored, best.prose ? 'text' : 'seg']);
        if (best.mode) atoms.push([best.mode, 'seg']);
      }
      lastHint.replaceChildren(...atoms.flatMap(([text, cls], i) => {
        const seg = document.createElement('span');
        seg.className = cls;
        seg.textContent = text;
        if (!i) return [seg];
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = ' · ';
        return [sep, seg];
      }));
      // GH-668 S5 slice 4 round 6 (ruling R-PR-6 (3)): on the COARSE
      // register the resume control's line is ONE line — a second hint
      // line bought 16 px of the phone budget in de / fr / es and put the
      // pill under every stop. Composed in full above, then MEASURED:
      // while the line wraps and a trailing QUALIFIER atom (mode, then
      // best) remains, that atom and its separator drop; the drill NAME
      // alone may then WRAP at its spaces (practice.css: the kit's A8
      // never-ellipsize law stands over the ruling's ellipsis allowance;
      // MEASURED in round 7 and restated by R-PR-8 (3): every catalog name
      // paints ONE line at this rung, the three longest (en 31 / fr 32 /
      // es 33 characters) at 175.91 / 184.05 / 187.28 px in the 228 px
      // box, so the wrap is the law for a wider future name, not a case
      // on the shelf today). Hidden (no height) = no change; reveal()
      // refreshes again once the group paints. Fine pointers keep the
      // full line (hints <= 2 lines).
      if (COARSE.matches) {
        // lines = the hint box's height over its line-height (the e2e-ui
        // practice walker's own measure); a text rect's top and the
        // clamped name box's top differ by a fraction on ONE line, so a
        // per-rect top census would read a wrap that is not there
        const wraps = () => {
          const cs = getComputedStyle(lastHint);
          const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
          return lastHint.getBoundingClientRect().height > lh * 1.5;
        };
        while (lastHint.childElementCount > 1 && wraps()) {
          lastHint.lastElementChild.remove(); // the qualifier atom
          lastHint.lastElementChild.remove(); // its separator
        }
      }
    }
  }
  /** (4) the best line at the CURRENT assist, composed from the SAME keys
   * the modal's renderPracticeCard uses (settings.js:2288-2300 — re-used by
   * key, never copied): `drills.bestRated`/`drills.rating.<band>` when the
   * catalog entry carries a rating chart, else `drills.best`;
   * `shell.place.practice.noScoreYet` ({assist} = `drills.assist.<mode>`)
   * when no record exists under this assist (R9: the card names the mode
   * the empty score is AT — the modal's `drills.notPlayed` stays its own;
   * hasLocal()-gated on the ACTIVE dictionary (round 13; was has()-guarded
   * in round 9) — `drills.notPlayed` is the fallback);
   * ' · ' + `drills.assist.<assist>` names the mode the best was set under. The
   * record is {best, plays, ts} only (drills.js:2608) — `max` and the
   * rating bands live on the list() entry; `list` absent or no entry →
   * null (name only). NO relative recency in (a). Returns ATOMS
   * ({ scored, mode } — refresh() joins them with ' · ' separator spans),
   * the noScoreYet line as a single PROSE atom (mode: null, prose: true). */
  function bestLine(id, assist) {
    const D = window.__drills;
    const entry = safe(() => (typeof D?.list === 'function'
      ? D.list().find((e) => e.id === id) : null), null);
    if (!entry) return null;
    const byAssist = safe(() => (typeof D?.bestsByAssist === 'function'
      ? D.bestsByAssist() : null), null);
    if (!byAssist) return null;
    // the modal's fallback for an out-of-range assist is its own default;
    // 'standard' mirrors settings.js DEFAULTS.assist (change together)
    const mode = assist ?? 'standard';
    const rec = byAssist[id]?.[mode] ?? null;
    if (!rec) {
      // GH-668 S5 slice 4 round 9 (review r1 P2-3): `noScoreYet` is a key
      // this slice ADDED — locale JSON is cached independently of this
      // module, so a fresh practice.js over a pre-change dictionary would
      // paint the raw key. Guarded on the ACTIVE dictionary (the OWNERSHIP
      // mixed-cache fallback register; round 13 — has() before, which fell
      // through to the fresh English sentence when only en.json was fresh):
      // absent → the legacy `drills.notPlayed` line the branch read before,
      // still a single prose atom.
      return { scored: hasOwn(`${K}noScoreYet`)
        ? t(`${K}noScoreYet`, { assist: t(`drills.assist.${mode}`) })
        : t('drills.notPlayed'),
      mode: null, prose: true };
    }
    const band = Array.isArray(entry.rating)
      ? (entry.rating.find((b) => rec.best <= b.max)
        ?? entry.rating[entry.rating.length - 1])
      : null;
    const scored = band
      ? t('drills.bestRated', { score: rec.best, max: entry.max,
        rating: t(`drills.rating.${band.label}`) })
      : t('drills.best', { score: rec.best, max: entry.max });
    return { scored, mode: t(`drills.assist.${mode}`) };
  }

  // ---- 6. wire the broadcasts — NO refresh pass here (step 7 runs it) ---
  window.addEventListener('ob:settings', () => refresh());
  onLocaleChange(() => {
    for (const el of root.querySelectorAll('[data-i18n]')) {
      el.textContent = t(el.dataset.i18n);
    }
    refresh();
  });

  // ---- 7/8. the shell-facing handle ---------------------------------------
  let active = false; // the place is practice right now (setPlace truth)
  /** Retire the S1 stubs and show the card group in ONE synchronous step —
   * the paint-atomic replacement (SC-004). No-op unless the place is still
   * practice (a place change during the sheet wait cancels the reveal). */
  reveal = () => {
    revealPending = false;
    if (!active) return;
    retireStubs();
    showEl(root, true);
    refresh();
  };
  /** DOM show/refresh ONLY (FR-012): no picker, no mode write, no confirm,
   * no exit, no mover call — the atelier try-it transit sees a pure toggle. */
  function setPlace(id) {
    const on = id === PLACE;
    if (on) {
      armed = true;
      active = true;
      capStart();
      // stubs → cards in ONE synchronous step (paint-atomic), once the leaf
      // sheet has settled (or the 1.5 s belt fires) — the stubs stand until
      if (cssSettled) reveal();
      else {
        revealPending = true;
        setTimeout(() => { if (revealPending) reveal(); }, 1500);
      }
    } else {
      active = false;
      revealPending = false;
      showEl(root, false);
      cancelConfirm(); // a practice confirm never outlives the place (P-D3)
      capStop();
    }
  }
  function onShellExit() {
    // the shell owns the card hold timer (cancelled on pointerup/cancel by
    // shell.js itself); the module's pending state is the consent dialog —
    // closed WITHOUT firing (the kit's own cancel path) — and the private
    // capability interval.
    cancelConfirm();
    capStop();
  }
  /** Cards claim no prop (ruling R-07). */
  const propTap = () => false;
  /** The Drills card's own action through its refusal register (plan
   * P-R2) — the shell's long-press hold reaches it through R0 (f)'s generic
   * card-primary hook; the T007 capability guard keeps the hold inert while
   * the card is loading/hidden. */
  const primary = () => {
    holdCommitAt = { input: inputClock(window.event?.timeStamp), handled: performance.now() };
    return actions.drills();
  };

  // ---- test surface (contract §3; additive; absent on the poisoned rung) --
  window.__practice = Object.freeze({
    cards: () => [...root.querySelectorAll(':scope > article[data-ob]')]
      .filter((a) => !a.hidden).map((a) => a.dataset.ob),
    state: () => {
      const s = sget();
      return {
        mounted: true,
        degraded: false,
        loading: [...loading],
        assist: s.assist ?? null,
        mode: s.mode ?? null,
        last: lastId(),
      };
    },
    refuse: () => lastNoticeKey,
    lastNotice: () => lastNoticeKey,
    primary,
  });

  console.log('[practice] ready (036a)');
  return { setPlace, onShellExit, propTap, primary };
}
