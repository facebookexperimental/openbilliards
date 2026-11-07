// Copyright (c) Meta Platforms, Inc. and affiliates.

// playback-strip.js — GH-301 director strip: the per-replay multi-camera
// cut-list EDITOR (the strip lane under the scrub bar, seam drag with
// snap-to-shot, the transition picker, custom tripod slot pills and the
// pause→frame→save capture flow). Design contract: GH-301 comment
// 5150532321 (v1 freeze) + the owner GO amendments A1 (adaptive block
// labels: full text → camera icon → color-only, accessible name persists,
// NEVER an ellipsis) and A2 (slot pills wear the EXACT preset-pill
// geometry/typography, desktop inline and phone flyout entries alike).
//
// LEAF module (cache-poison contract, the ownership ledger (internal) rule 5): reached
// ONLY via the guarded dynamic import in playback.js. The MODEL — the
// cameraPlan cut list, the §1.2 read law, the §2.1 compiler and the fade
// clock — lives in playback.js (always fresh with it); this module is pure
// EDITOR chrome over that model, reached through the `ctx` accessors the
// contract below names. Absent/stale module = the recorded degrade (§3.4):
// no lane, no slot pills, no capture, pill taps write boundary-only
// assignments — exactly the GH-273 player; savePlan still emits a valid
// plan.
//
// One static import (the playback.js/help.js law): ./i18n.js. Everything
// else — icons, the live player state, the plan writers — arrives through
// ctx and is feature-detected; every absence degrades honestly.
//
// GH-314 (D-lite): the strip RESTS as a thin sliver and expands to the
// full editing lane on any engagement (tap/select/seam drag/paused plan
// write) or via the toggle. The sliver is VISUAL-ONLY — lane box, hit
// geometry and gesture handlers are byte-identical to build 15 in both
// states — and ships only against a fresh playback.js (the ctx.ui.sync
// capability member): a stale playback.js keeps the always-expanded
// build-15 lane, a stale THIS module keeps playback.js's overlay machine
// honest through its hold/picker pins.
import { t } from './i18n.js';

// snap-to-shot radius: max(0.15 s, 8 px in time units) — contract §3.2;
// once snapped, the escape distance is 1.8× the radius (drag hysteresis).
const SNAP_SEC = 0.15;
const SNAP_PX = 8;
const SNAP_ESCAPE = 1.8;
const LONG_PRESS_MS = 600;
const FADE_MIN = 0.2, FADE_MAX = 5, FADE_STEP = 0.2, FADE_DEFAULT = 1.0;
// registry mirror for block families (playback.js owns the registry; the
// strip only needs the color-family name per §1.4 id)
const FAM = ['broadcast', 'chase', 'pov', 'overhead', 'rail', 'close'];

export function createStrip(ctx) {
  // the BACKFILLED head span's selection identity (cut index -1)
  const HEAD = Symbol('head-span');
  const S = {
    lane: null, bubble: null, pop: null, capBar: null, hint: null,
    // selection = { kind: 'block'|'seam', ref } where ref is the CUT
    // OBJECT (or HEAD) — never a bare index (review r4 P2: a concurrent
    // seam drag re-sorts the array and an index selection would silently
    // re-target a different span). selIdx() resolves it per read; a ref
    // that left the plan clears the selection. Accent = SELECTED only.
    sel: null,
    slotBtns: [],       // desktop inline slot pills (CAM 1/2/3)
    slotsBtn: null,     // the phone compound CAM ▾ pill
    capture: null,      // { slot } while the capture latch is held
    mounted: false,
    noteTimer: 0,
    // GH-314 (D-lite): the strip rests as a SLIVER and expands to the
    // full editing lane. expanded is VISUAL-ONLY state — the lane box,
    // every block/seam hit geometry and every gesture handler stay
    // byte-identical to build 15 in BOTH states (the gesture-byte-identity
    // law); the sliver only thins the painted bar and fades the glyph/
    // label furniture (playback.css .ob-pb-strip--sliver). Any editing
    // engagement (block select, seam tap/drag, a paused plan write via
    // playback.js planChanged) auto-expands; the toggle collapses.
    expanded: true,
    // GH-361: WHO expanded — true only while the standing expansion was an
    // AUTO one (an editing engagement expanded the sliver as a side
    // effect). The GH-314 contract pins editing engagement "until playback
    // resumes"; without this bit the implicit expansion latched forever —
    // one paused tile tap and the immersive console never auto-hid nor
    // tap-dismissed again (the build-16 owner device report). An explicit
    // toggle expansion is the user's own register choice and stays sticky
    // (arm 19e: it pins through play until collapsed).
    autoExpanded: false,
    toggle: null,       // the expand/collapse control (fresh pairing only)
    dragActive: false,  // a seam drag holds — feeds engaged()
  };
  const pb = ctx.pb;
  const M = ctx.model;
  const fmtT = ctx.fmtT;
  // GH-314: the sliver/toggle ships ONLY against a fresh playback.js (the
  // ctx.ui.sync capability member). A STALE playback.js pairing this fresh
  // leaf keeps the build-15 always-expanded lane with no toggle — the
  // overlay machine that would pin on expansion does not exist there, so
  // the collapsed state would have nothing to hold it visible.
  const collapsible = typeof ctx.ui?.sync === 'function';
  const uiSync = () => { try { ctx.ui?.sync?.(); } catch { /* stale */ } };

  // ---- geometry: the lane is a SIBLING pointer surface under P.track ------
  // (contract §3.1 — wireTrack's setPointerCapture on P.track classifies
  // drags by ev.target inside ITS OWN surface; a sibling lane never
  // collides with that capture — the prototype proved the geometry).
  function laneGeom() {
    const P = ctx.P();
    const row2 = P?.row2, track = P?.track;
    if (!row2 || !track) return null;
    const r2 = row2.getBoundingClientRect();
    const tr = track.getBoundingClientRect();
    if (!(tr.width > 0)) return null;
    return { row2, track, left: tr.left - r2.left, width: tr.width,
      top: track.offsetTop + tr.height + 7 };
  }

  function mount() {
    const g = laneGeom();
    if (!g || !pb() || S.mounted) return;
    S.mounted = true;
    g.row2.classList.add('ob-pb-hasstrip');
    S.lane = document.createElement('div');
    S.lane.className = 'ob-pb-strip';
    S.lane.setAttribute('role', 'group');
    S.lane.setAttribute('aria-label', t('playback.strip.aria'));
    S.bubble = document.createElement('span');
    S.bubble.className = 'ob-pb-strip-bubble ob-nums';
    S.lane.appendChild(S.bubble);
    // GH-314 (D-lite): each open rests as the sliver on the fresh pairing;
    // the toggle is a kit ghost icon (voice/rungs from the kit — the
    // rolled-own ledger law) riding the lane's right end.
    S.expanded = !collapsible;
    S.autoExpanded = false;
    S.lane.classList.toggle('ob-pb-strip--sliver', !S.expanded);
    if (collapsible) {
      S.toggle = document.createElement('button');
      S.toggle.type = 'button';
      S.toggle.className = 'ob-btn ob-btn--ghost ob-btn--icon ob-pb-strip-toggle';
      S.toggle.setAttribute('aria-expanded', String(S.expanded));
      S.toggle.setAttribute('aria-label',
        t(S.expanded ? 'playback.strip.collapse' : 'playback.strip.expand'));
      S.toggle.textContent = S.expanded ? '▾' : '▴';
      S.toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        setExpanded(!S.expanded);
      });
      S.lane.appendChild(S.toggle);
    }
    g.row2.appendChild(S.lane);
    wireLane();
    buildSlotPills();
    layout();
    document.addEventListener('pointerdown', onDocDown, true);
    document.addEventListener('keydown', onDocKey, true);
    window.addEventListener('resize', layout);
    uiSync();
  }

  /** GH-314: the ONE expanded-state writer. Collapsing dismisses the
   * transient editing surfaces (popover + selection) — the sliver is the
   * resting register, not an editing one. Purely visual either way: hit
   * geometry and handlers never change (gesture-byte-identity law).
   * GH-361: `auto` marks an expansion made as a SIDE EFFECT of an editing
   * engagement (select / seam interaction / a paused plan write) — the
   * autoExpanded latch it sets releases through maybeRest() when the
   * cause ends while playing. An explicit call (the toggle, a seam
   * consumer without the flag) claims the expansion as the user's own
   * register choice — including over a standing auto expansion. */
  function setExpanded(on, { auto = false } = {}) {
    const want = collapsible ? !!on : true;
    if (S.expanded === want) {
      // an explicit claim upgrades a standing auto expansion to sticky;
      // an auto call over an explicit expansion never downgrades it
      if (!auto) S.autoExpanded = false;
      uiSync();
      return;
    }
    S.expanded = want;
    S.autoExpanded = want && auto;
    S.lane?.classList.toggle('ob-pb-strip--sliver', !want);
    if (S.toggle) {
      S.toggle.setAttribute('aria-expanded', String(want));
      S.toggle.setAttribute('aria-label',
        t(want ? 'playback.strip.collapse' : 'playback.strip.expand'));
      S.toggle.textContent = want ? '▾' : '▴';
    }
    if (!want) {
      closePop();
      if (S.sel) select(null);
    }
    uiSync();
  }

  function unmount() {
    if (!S.mounted) return;
    S.mounted = false;
    cancelCapture();
    closePop();
    S.cancelDrag?.();
    S.cancelDrag = null;
    S.lane?.remove();
    S.lane = null;
    S.bubble = null;
    S.toggle = null;
    S.dragActive = false;
    S.hint?.remove();
    S.hint = null;
    for (const b of S.slotBtns) b.remove();
    S.slotBtns = [];
    S.slotsBtn?.remove();
    S.slotsBtn = null;
    S.sel = null;
    clearTimeout(S.noteTimer);
    document.removeEventListener('pointerdown', onDocDown, true);
    document.removeEventListener('keydown', onDocKey, true);
    window.removeEventListener('resize', layout);
  }

  /** Escape dismisses the transient surfaces (review r7 P2): the popover
   * first (focus returns to its seam), then a live capture. */
  function onDocKey(e) {
    if (e.key !== 'Escape') return;
    if (S.pop) {
      const seamIdx = S.sel?.kind === 'seam' ? selIdx() : null;
      closePop();
      if (seamIdx !== null && seamIdx >= 0) {
        S.lane?.querySelector(`.ob-pb-strip-seam[data-seam="${seamIdx}"]`)
          ?.focus();
      }
      e.stopPropagation();
    } else if (S.capture) {
      cancelCapture();
      e.stopPropagation();
    } else if (S.sel && !S.dragActive) {
      // GH-334 review r1: a standing selection is its own dismissal layer —
      // Escape clears it (and its editing banner) BEFORE the player-close
      // layer in playback.js sees a bare press; the claim travels as
      // cancelBubble exactly like the popover/capture legs. Never mid-drag:
      // a re-render under a captured pointer is no dismissal either.
      select(null);
      e.stopPropagation();
    }
  }

  /** GH-361: release the AUTO-expansion latch once its cause has ended
   * WHILE PLAYING — the sliver returns as the resting register, so the
   * strip pin releases and the overlay's idle timer / tap-dismiss work
   * again (the GH-314 contract: editing engagement pins "until playback
   * resumes"). Edges: resume (playback.js setPlaying → the
   * releaseAutoExpand seam), the last engagement clearing mid-play
   * (select(null) / closePop / drag end / capture exit). While PAUSED the
   * expansion stands — the paused pin holds the overlay anyway, and the
   * resume edge settles it. An EXPLICIT toggle expansion never rests here
   * (arm 19e: it pins through play until the user collapses it). */
  function maybeRest() {
    if (!S.autoExpanded || !S.mounted || !S.expanded) return;
    if (S.pop || S.capture || S.sel || S.dragActive) return;
    if (pb()?.playing !== true) return;
    setExpanded(false);
  }

  function onDocDown(e) {
    if (S.pop && !S.pop.contains(e.target)
      && !e.target.closest?.('.ob-pb-strip-seam')
      && !e.target.closest?.('.ob-pb-slot')
      && !e.target.closest?.('.ob-pb-slots')) closePop();
    if (S.sel && !e.target.closest?.('.ob-pb-strip')
      && !e.target.closest?.('.ob-pb-cam')
      && !(S.pop && S.pop.contains(e.target))) select(null);
  }

  // ---- lane layout + spans: geometry rides the ONE beat-schedule builder
  //      (pb.cum/total are beat-inclusive — contract §2.5/§3.1) -------------
  function layout() {
    if (!S.mounted) return;
    const g = laneGeom();
    if (!g) return;
    S.lane.style.left = `${g.left}px`;
    S.lane.style.width = `${g.width}px`;
    S.lane.style.top = `${g.top}px`;
    render();
  }

  /** Camera spans over the OUTPUT timeline: [0..a0) wears the BACKFILLED
   * first cam (the §1.2 read law made visible), then one span per cut. */
  function spans() {
    const p = pb();
    const cuts = M.cuts();
    const out = [];
    if (!p) return out;
    if (!cuts.length) {
      out.push({ from: 0, to: p.total, cam: 0, cut: -1 });
      return out;
    }
    const at = (c) => ctx.view.outT(c.seg, c.t);
    out.push({ from: 0, to: at(cuts[0]), cam: cuts[0].cam, cut: -1 });
    for (let i = 0; i < cuts.length; i++) {
      out.push({ from: at(cuts[i]),
        to: i + 1 < cuts.length ? at(cuts[i + 1]) : p.total,
        cam: cuts[i].cam, cut: i });
    }
    return out;
  }

  const famOf = (cam) => (cam >= 8 ? 'custom' : (FAM[cam] ?? 'broadcast'));
  // keyboard activation for the role=button lane elements (review GH-301
  // round-1 P2): browsers synthesize clicks only for NATIVE buttons
  const onKeyActivate = (el, fn) => el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    fn(e);
  });

  function render() {
    if (!S.lane) return;
    const p = pb();
    if (!p) return;
    for (const el of [...S.lane.children]) {
      if (el !== S.bubble && el !== S.toggle) el.remove(); // GH-314: the
      // toggle is lane FURNITURE like the bubble, never a span
    }
    const total = Math.max(p.total, 1e-6);
    const sel = selIdx(); // resolved ONCE per render (object identity law)
    for (const sp of spans()) {
      if (sp.to - sp.from < 1e-6) continue;
      const b = document.createElement('span');
      // role=button + ledger entry (e2e-ui ROLLED_OWN_OK): lane furniture
      // in the .ob-pb-handle class of control, not a kit pill
      b.className = 'ob-pb-strip-block'
        + (S.sel?.kind === 'block' && sel === sp.cut
          ? ' ob-pb-strip--sel' : '');
      // identity color/label/icon all wear the APPLY-TIME id (§1.4 —
      // review round-1 P2: an empty/unknown custom id RENDERS broadcast, so
      // it must never be painted as a custom-family block)
      const shown = M.appliedCam(sp.cam);
      b.dataset.fam = famOf(shown);
      if (sp.cut >= 0) b.dataset.cut = String(sp.cut); // e2e hook (§3.1)
      b.style.left = `${(100 * sp.from / total).toFixed(3)}%`;
      b.style.width = `${(100 * (sp.to - sp.from) / total).toFixed(3)}%`;
      // A1: the ACCESSIBLE NAME persists on every representation
      const name = M.camLabel(sp.cam);
      b.setAttribute('role', 'button');
      b.tabIndex = 0;
      b.setAttribute('aria-label',
        t('playback.strip.block', { cam: name, time: fmtT(sp.from) }));
      b.title = name;
      const activate = (e) => {
        e.stopPropagation();
        select({ kind: 'block', cut: sp.cut });
      };
      b.addEventListener('click', activate);
      onKeyActivate(b, activate);
      S.lane.appendChild(b);
      applyBlockLabel(b, shown, name);
    }
    M.cuts().forEach((c, i) => {
      const s = document.createElement('span');
      s.className = 'ob-pb-strip-seam'
        + (S.sel?.kind === 'seam' && sel === i ? ' ob-pb-strip--sel' : '')
        + (seamLocked(i) ? ' ob-pb-strip-seam--lock' : '');
      s.dataset.seam = String(i);
      s.setAttribute('role', 'button');
      s.tabIndex = 0;
      s.setAttribute('aria-label',
        t('playback.strip.seam', { time: fmtT(ctx.view.outT(c.seg, c.t)) }));
      s.style.left = `${(100 * ctx.view.outT(c.seg, c.t) / total).toFixed(3)}%`;
      // keyboard path to the picker (review round-1 P2); pointer taps route
      // through the lane's own capture wiring (wireLane)
      onKeyActivate(s, () => {
        const r = s.getBoundingClientRect();
        openTransPicker(i, r.left, r.top);
      });
      const gl = document.createElement('span');
      gl.className = 'ob-pb-strip-g';
      gl.setAttribute('aria-hidden', 'true');
      // glyph by transition (§3.1): cut = thin line, move = arrow, fade = ◆
      gl.textContent = c.transitionIn === 2 ? '◆'
        : c.transitionIn === 1 ? '➔' : '❙';
      s.appendChild(gl);
      S.lane.appendChild(s);
    });
  }

  /** A1 — adaptive block labels (owner amendment): full text when it fits
   * the block's rendered width; below that the camera's ICON only (the
   * CAMS pill icons — custom slots take the tripod mark); at extreme
   * narrowness color-only (the block's family color IS the identifier).
   * NEVER an ellipsis — the representation swaps instead (the house label
   * law), and the accessible name stays on the block itself (aria-label +
   * title, applied by render() above). Missing icons.js degrades the icon
   * tier away — straight to color-only, aria intact. */
  function applyBlockLabel(b, cam, name) {
    const w = b.getBoundingClientRect().width;
    const lb = document.createElement('span');
    lb.className = 'ob-pb-strip-bl';
    lb.setAttribute('aria-hidden', 'true'); // the block carries the name
    lb.textContent = name.toUpperCase();
    b.appendChild(lb);
    b.dataset.repr = 'text';
    if (lb.scrollWidth <= w - 8) return;
    lb.remove();
    const icoNode = w >= 18 ? ctx.ico(M.camIcon(cam), 12) : null;
    if (icoNode) {
      const gi = document.createElement('span');
      gi.className = 'ob-pb-strip-bi';
      gi.setAttribute('aria-hidden', 'true');
      gi.appendChild(icoNode);
      b.appendChild(gi);
      b.dataset.repr = 'icon';
      return;
    }
    b.dataset.repr = 'color';
  }

  // ---- selection: the EDITING state (§3.2) — accent = selected only -------
  // cut -1 = the BACKFILLED head span (review r3 P2): selectable like any
  // block — a pill re-target on it writes the explicit (0, 0) anchor, so
  // the leading block's button semantics are real, never a dead control.
  /** The selection's CURRENT cut index (-1 = the head span; null = none
   * or a ref that left the plan — cleared on read). */
  function selIdx() {
    if (!S.sel) return null;
    if (S.sel.ref === HEAD) return -1;
    const i = M.cuts().indexOf(S.sel.ref);
    if (i < 0) { S.sel = null; return null; }
    return i;
  }
  function select(sel) {
    if (!sel || sel.cut === null || sel.cut === undefined || sel.cut < -1) {
      S.sel = null;
    } else if (sel.cut === -1) {
      S.sel = { kind: sel.kind, ref: HEAD };
    } else {
      const c = M.cuts()[sel.cut];
      S.sel = c ? { kind: sel.kind, ref: c } : null;
    }
    // GH-314: a selection is an editing engagement — the sliver expands
    // (and the overlay pins through seams.engaged()); GH-361: clearing the
    // last engagement mid-play rests an auto-expanded lane
    if (S.sel) setExpanded(true, { auto: true });
    else maybeRest();
    closePop();
    if (!S.hint) {
      S.hint = document.createElement('div');
      S.hint.className = 'ob-pb-strip-hint';
      document.body.appendChild(S.hint);
    }
    clearTimeout(S.noteTimer);
    syncHint(); // GH-331: one deriver (hidden under any open popover)
    render();
    // focus continuity (review r12 P2): render() rebuilt the lane nodes —
    // put focus back on the selected block so Tab keeps its place
    if (S.sel?.kind === 'block' && S.lane) {
      const i = selIdx();
      const el = i === -1
        ? S.lane.querySelector('.ob-pb-strip-block:not([data-cut])')
        : S.lane.querySelector(`.ob-pb-strip-block[data-cut="${i}"]`);
      el?.focus();
    }
    uiSync(); // GH-314: selection arms/releases the engaged pin
  }

  /** Pill re-target (§3.2): while a block is selected a CAM pill tap
   * re-cams THAT span instead of inserting. Returns true when consumed.
   * The BACKFILLED head span (cut -1) re-cams by writing the explicit
   * (0, 0) anchor — "select applies from here" from the very start. */
  function retarget(camId) {
    if (S.sel?.kind !== 'block') return false;
    const i = selIdx();
    if (i === null) return false;
    if (i === -1) {
      const w = M.writeCut({ seg: 0, t: 0, cam: camId,
        transitionIn: 0, dur: 0 }, { degenerate: true });
      if (w) select({ kind: 'block', cut: M.cuts().indexOf(w) });
      else note(t('playback.strip.refusedCap')); // (0,0) only the cap refuses
      return true;
    }
    const c = M.cuts()[i];
    if (!c) { select(null); return true; }
    const moved = M.writeCut({ seg: c.seg, t: c.t / 100, cam: camId,
      transitionIn: c.transitionIn, dur: c.dur / 100 }, { replace: c });
    if (moved) {
      select({ kind: 'block', cut: M.cuts().indexOf(moved) });
    } else {
      // GH-330 belt: a replace-write refusal is grammar-shaped (§1.5) —
      // not reachable from shipped plans today (dynamic re-targets pin to
      // t=0 and write), but a refusal must never be silent again
      note(t('playback.strip.refusedSpan'));
    }
    return true;
  }

  // seams adjacent to dynamic spans are snap-LOCKED to the boundary (§1.5)
  function seamLocked(i) {
    const cuts = M.cuts();
    const c = cuts[i];
    if (!c) return false;
    if (M.isDynamic(M.camIdAt(c.seg, c.t / 100))) return true;
    // leaving a dynamic span: the camera ruling just before this anchor
    const prev = c.t > 0
      ? M.camIdAt(c.seg, c.t / 100 - 0.001)
      : (c.seg > 0 ? M.camIdAt(c.seg - 1, Number.MAX_SAFE_INTEGER) : null);
    return prev !== null && M.isDynamic(prev);
  }

  // ---- lane pointer wiring: seam drag + snap, tap = transition picker,
  //      long-press = delete (§3.2). The lane takes ITS OWN capture. -------
  function wireLane() {
    let drag = null;
    let lp = 0;
    // teardown canceller (review r12 P2): a close mid-press must clear the
    // pending long-press + drag before the lane nodes go away
    S.cancelDrag = () => {
      clearTimeout(lp);
      drag = null;
      S.dragActive = false;
    };
    S.lane.addEventListener('pointerdown', (ev) => {
      const seamEl = ev.target.closest('.ob-pb-strip-seam');
      if (!seamEl) return;
      const i = Number(seamEl.dataset.seam);
      // hold the cut OBJECT — the live re-sort during a drag moves indices
      drag = { cut: M.cuts()[i], locked: seamLocked(i), moved: false,
        x0: ev.clientX, snapped: false };
      S.dragActive = true; // GH-314: a held seam feeds engaged()
      uiSync();
      clearTimeout(lp);
      lp = setTimeout(() => {
        // long-press = delete the cut: the block merges into its
        // predecessor (§3.2); a drag that started moving cancels this
        if (drag && !drag.moved) {
          const idx = M.cuts().indexOf(drag.cut);
          drag = null;
          S.dragActive = false; // GH-314 (uiSync rides the select below)
          if (S.bubble) S.bubble.style.display = 'none';
          if (idx >= 0) {
            select(null);
            M.deleteCut(idx);
            ctx.view.renderNow();
          }
        }
      }, LONG_PRESS_MS);
      try { S.lane.setPointerCapture(ev.pointerId); } catch { /* stale */ }
      ev.stopPropagation();
      ev.preventDefault();
    });
    S.lane.addEventListener('pointermove', (ev) => {
      if (!drag || !drag.cut) return;
      if (Math.abs(ev.clientX - drag.x0) > 3) {
        if (!drag.moved) setExpanded(true, { auto: true }); // GH-314: a
        // real seam drag is an editing engagement — the sliver expands
        // under the gesture (visual only; the drag stream is untouched)
        drag.moved = true;
        clearTimeout(lp);
      }
      if (!drag.moved) return;
      const g = laneGeom();
      const p = pb();
      if (!g || !p) return;
      const frac = Math.min(1, Math.max(0,
        (ev.clientX - g.track.getBoundingClientRect().left) / g.width));
      dragSeamTo(drag, frac * p.total, g.width);
      ev.stopPropagation();
    });
    const up = (ev) => {
      clearTimeout(lp);
      if (!drag) return;
      // a CANCELLED pointer only clears drag/long-press state (review r11
      // P2): interruptions and lost capture are never a tap
      const wasTap = !drag.moved && ev.type !== 'pointercancel';
      const cut = drag.cut;
      drag = null;
      S.dragActive = false; // GH-314: the engaged pin releases with the drag
      maybeRest(); // GH-361 (a wasTap re-engages through openTransPicker below)
      uiSync();
      S.bubble.style.display = 'none';
      document.querySelectorAll('.ob-pb-seg--lit')
        .forEach((el) => el.classList.remove('ob-pb-seg--lit'));
      // the amber snapped style retires with the drag (review r13 P3)
      S.lane?.querySelectorAll('.ob-pb-strip-seam--snap')
        .forEach((el) => el.classList.remove('ob-pb-strip-seam--snap'));
      if (wasTap) {
        const i = M.cuts().indexOf(cut);
        if (i >= 0) {
          const se = S.lane.querySelector(`.ob-pb-strip-seam[data-seam="${i}"]`);
          const r = se?.getBoundingClientRect();
          openTransPicker(i, r ? r.left : ev.clientX, r ? r.top : ev.clientY);
        }
      }
    };
    S.lane.addEventListener('pointerup', up);
    S.lane.addEventListener('pointercancel', up);
  }

  /** One drag step: quantize, snap-to-shot with hysteresis, dynamic-
   * adjacent LOCK (§1.5), write through the model (the edit-time law — the
   * engine never sees an illegal plan), light the magnetized tick + the
   * shot-label bubble (§3.2), repaint rAF-throttled (the scrubTo law). */
  function dragSeamTo(drag, T, laneW) {
    const p = pb();
    const c = drag.cut;
    const radius = Math.max(SNAP_SEC, SNAP_PX * p.total / Math.max(laneW, 1));
    let snapped = false, snapSeg = null;
    let target = T;
    // hysteresis FIRST (review r9 P2): the boundary already held keeps the
    // seam until the drag leaves ITS 1.8× escape radius — overlapping snap
    // zones on short consecutive shots must not hop early. Only then does
    // the NEAREST boundary magnetize (review r8 P2 — never first-match).
    if (drag.snapped && drag.snapSeg !== null
      && Math.abs(T - p.cum[drag.snapSeg]) <= radius * SNAP_ESCAPE) {
      snapSeg = drag.snapSeg;
    } else {
      let bd = Infinity;
      for (let s = 1; s < p.cum.length; s++) {
        const d = Math.abs(T - p.cum[s]);
        if (d <= radius && d < bd) { bd = d; snapSeg = s; }
      }
    }
    if (snapSeg !== null) {
      target = p.cum[snapSeg];
      snapped = true;
    }
    if (drag.locked) { // §1.5: a dynamic-adjacent seam cannot leave the boundary
      snapped = true;
      snapSeg = c.seg;
      target = p.cum[c.seg];
    }
    drag.snapped = snapped;
    drag.snapSeg = snapped ? snapSeg : null;
    let seg, tSec;
    if (snapped && snapSeg !== null) {
      seg = snapSeg;
      tSec = 0;
    } else {
      seg = 0;
      for (let k = p.cum.length - 1; k > 0; k--) {
        if (target >= p.cum[k]) { seg = k; break; }
      }
      tSec = Math.min(Math.max(0, target - p.cum[seg]), p.durs[seg]);
    }
    const moved = M.writeCut({ seg, t: tSec, cam: c.cam,
      transitionIn: c.transitionIn, dur: c.dur / 100 },
    { replace: c, drag: true }); // GH-324: `drag` marks the CONTINUING
    // stream — only it refuses occupied anchors (a fresh model on a stale
    // strip simply never sees the flag: build-15 pairing semantics)
    if (moved) {
      drag.cut = moved;
    } else if (snapped && !drag.locked) {
      // GH-324: the model REFUSED the move — the boundary anchor belongs
      // to ANOTHER cut (the no-destruction drag law: a continuing drag can
      // never delete it). The seam holds its last anchor, so the magnetized
      // visuals must not claim the boundary; the hysteresis latch releases
      // so the drag re-evaluates freely once the pointer leaves the
      // occupied zone.
      snapped = false;
      snapSeg = null;
      drag.snapped = false;
      drag.snapSeg = null;
    }
    ctx.view.repaint();
    // magnetized tick + snapped seam style + the shot-label bubble (§3.2)
    document.querySelectorAll('.ob-pb-seg').forEach((el) => {
      el.classList.toggle('ob-pb-seg--lit',
        snapped && Number(el.dataset.seg) === snapSeg);
    });
    const outAt = ctx.view.outT(drag.cut.seg, drag.cut.t);
    S.bubble.style.display = 'block';
    S.bubble.style.left = `${(100 * outAt / Math.max(p.total, 1e-6)).toFixed(2)}%`;
    S.bubble.classList.toggle('ob-pb-strip-bubble--snap', snapped);
    S.bubble.textContent = snapped
      ? t('playback.strip.snapped', { n: (snapSeg ?? seg) + 1 })
      : fmtT(outAt);
    const i = M.cuts().indexOf(drag.cut);
    const se = S.lane.querySelector(`.ob-pb-strip-seam[data-seam="${i}"]`);
    se?.classList.toggle('ob-pb-strip-seam--snap', snapped);
  }

  // ---- transition picker (§3.2; the §1.5 grammar enforced at the picker) --
  function closePop() {
    if (!S.pop) return;
    S.pop.remove();
    S.pop = null;
    syncHint(); // GH-331: the yielded hint re-derives with the popover gone
    maybeRest(); // GH-361: a popover closing mid-play rests an auto lane
    uiSync(); // GH-314: the picker pin releases with the popover
  }

  /** GH-331: the ONE deriver for the passive hint banner. Hidden while any
   * popover is open — the popover is the ACTIVE surface, and on the phone
   * profile (852x393) the fixed bottom-150px hint band painted OVER the
   * transition picker's Move row (the picker opens upward from the seam
   * into that band; openTransPicker writes S.sel directly, so select()'s
   * hint sync never ran). Otherwise the block-selection editing copy.
   * Transient note()s still overpaint and re-derive here on expiry. */
  function syncHint() {
    if (!S.hint) return;
    const on = !S.pop && S.sel?.kind === 'block';
    S.hint.style.display = on ? '' : 'none';
    if (on) S.hint.textContent = t('playback.strip.editing');
  }

  function openTransPicker(cutIdx, x, y) {
    closePop();
    const c = M.cuts()[cutIdx];
    if (!c) return;
    setExpanded(true, { auto: true }); // GH-314: a seam interaction
    // expands the sliver (GH-361: as an engagement side effect — auto)
    S.sel = { kind: 'seam', ref: c };
    syncHint(); // GH-331: the seam selection + opening popover yield the hint
    S.pop = document.createElement('div');
    S.pop.className = 'ob-pb-pop';
    S.pop.id = 'ob-pb-transpick';
    const h = document.createElement('h4');
    h.className = 'ob-caps'; // the kit caps voice (playback.css keeps the pad)
    h.textContent = t('playback.trans.title');
    S.pop.appendChild(h);
    // every action resolves the cut's CURRENT index at click time (review
    // r6 P2): plan writes while the picker stands re-sort the array, and a
    // captured numeric index would edit a DIFFERENT seam. A cut that left
    // the plan closes the picker instead.
    const liveIdx = () => {
      const i = M.cuts().indexOf(c);
      if (i < 0) closePop();
      return i;
    };
    const moveOk = M.moveLegal(cutIdx);
    for (const [id, key] of [[0, 'cut'], [1, 'move'], [2, 'fade']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ob-btn ob-btn--ghost ob-pb-transopt';
      b.dataset.trans = String(id);
      let label = t(`playback.trans.${key}`);
      if (id === 1 && moveOk) {
        // the derived walk duration, READ-ONLY (§1.5 — the GH-299 walk law
        // owns it; never user-set)
        const dur = M.walkDur(cutIdx);
        if (Number.isFinite(dur)) {
          label += ` · ${t('playback.trans.moveDerived', { sec: dur.toFixed(2) })}`;
        }
      }
      b.textContent = label;
      b.setAttribute('aria-pressed', String(c.transitionIn === id));
      if (id === 1 && !moveOk) b.disabled = true; // v1: POV→POV seams only,
      // and only where the GH-299 builder affords a walk
      b.addEventListener('click', () => {
        const i = liveIdx();
        if (i < 0) return;
        M.setTransition(i, id,
          id === 2 ? Math.max(FADE_MIN, c.dur / 100 || FADE_DEFAULT) : 0);
        ctx.view.renderNow();
        openTransPicker(i, x, y);
      });
      S.pop.appendChild(b);
    }
    // delete lives IN the picker too (review r4 P2): the pointer long-press
    // stays, and keyboard users reach the same removal from the seam's
    // Enter → picker path. Danger ink through the kit ghost register.
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ob-btn ob-btn--ghost ob-pb-transdel';
    del.textContent = t('playback.strip.delete');
    del.addEventListener('click', () => {
      const i = liveIdx();
      if (i < 0) return;
      closePop();
      select(null);
      M.deleteCut(i);
      ctx.view.renderNow();
    });
    S.pop.appendChild(del);
    if (c.transitionIn === 2) {
      const st = document.createElement('div');
      st.className = 'ob-pb-pop-step';
      const lbl = document.createElement('span');
      lbl.className = 'ob-nums';
      lbl.textContent = `${t('playback.trans.dur')}: ${(c.dur / 100).toFixed(2)} s`;
      const mk = (d, sTxt) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ob-btn ob-btn--ghost ob-btn--icon ob-pb-transstep';
        b.textContent = sTxt;
        b.setAttribute('aria-label',
          `${t('playback.trans.dur')} ${d > 0 ? '+' : '−'}${FADE_STEP}`);
        b.addEventListener('click', () => {
          const i = liveIdx();
          if (i < 0) return;
          const next = Math.min(FADE_MAX,
            Math.max(FADE_MIN, Math.round((c.dur / 100 + d) * 100) / 100));
          M.setTransition(i, 2, next);
          ctx.view.renderNow();
          openTransPicker(i, x, y);
        });
        return b;
      };
      st.append(mk(-FADE_STEP, '−'), lbl, mk(FADE_STEP, '+'));
      S.pop.appendChild(st);
    }
    document.body.appendChild(S.pop);
    S.pop.style.left = `${Math.max(8,
      Math.min(x, innerWidth - S.pop.offsetWidth - 8))}px`;
    S.pop.style.top = `${Math.max(8, y - S.pop.offsetHeight - 12)}px`;
    // keyboard continuity (review r7 P2): the rebuild after a transition
    // click removed the focused button — put focus on the now-selected
    // option so Escape/Tab keep working from where the user was
    S.pop.querySelector(`button[data-trans="${c.transitionIn}"]`)?.focus();
    render();
    uiSync(); // GH-314: the picker pin arms
  }

  // ---- slot pills (§3.3 + amendment A2) ------------------------------------
  /** A2: custom slot pills wear the EXACT geometry/typography of the
   * preset CAMS pills — the same class set and the same icon+label anatomy
   * playback.js's CAMS loop builds — desktop inline AND flyout entries. */
  function camPill({ label, icon, extra = '' }) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ob-btn ob-btn--tile ob-pb-cam${extra}`;
    b.setAttribute('aria-pressed', 'false');
    const gi = document.createElement('span');
    gi.setAttribute('aria-hidden', 'true');
    const node = ctx.ico(icon, 19);
    if (node) gi.replaceChildren(node);
    else gi.textContent = '◇';
    const l = document.createElement('span');
    // the preset tile's label voice verbatim (GH-301 A2 equality): the kit
    // .ob-caps carries the caps voice since GH-668 S5 G4 (playback.js)
    l.className = 'ob-caps ob-pb-cam-l';
    l.textContent = label;
    b.append(gi, l);
    return b;
  }

  const slotFilled = (slot) => M.poses().some((p) => p.slot === slot);

  function buildSlotPills() {
    const row1 = ctx.P()?.row1;
    if (!row1 || row1.querySelector('.ob-pb-slot')) return;
    const anchor = row1.querySelector('.ob-pb-grow');
    // desktop: three inline slot pills (the rail/close --desktop split)
    for (let s = 0; s < 3; s++) {
      const b = camPill({ label: t('playback.cam.slot', { n: s + 1 }),
        icon: 'cam-tripod',
        extra: ' ob-pb-cam--desktop ob-pb-slot' });
      b.dataset.slot = String(s);
      wireSlot(b, s);
      row1.insertBefore(b, anchor);
      S.slotBtns.push(b);
    }
    // phone: ONE compound CAM ▾ pill opening the 3-slot flyout (§3.3 — the
    // measured row1 budget does not fit three more pills)
    const cb = camPill({ label: `${t('playback.cam.slots')} ▾`,
      icon: 'cam-tripod', extra: ' ob-pb-slots' });
    cb.setAttribute('aria-haspopup', 'menu');
    cb.addEventListener('click', (e) => {
      e.stopPropagation();
      openSlotFlyout(cb);
    });
    row1.insertBefore(cb, anchor);
    S.slotsBtn = cb;
    syncSlotFaces();
  }

  function wireSlot(b, slot) {
    let lp = 0, pressed = false;
    b.addEventListener('pointerdown', () => {
      pressed = true;
      clearTimeout(lp);
      // long-press = (re-)capture (§3.2)
      lp = setTimeout(() => { pressed = false; enterCapture(slot); },
        LONG_PRESS_MS);
    });
    const cancel = () => { pressed = false; clearTimeout(lp); };
    b.addEventListener('pointerleave', cancel);
    b.addEventListener('pointercancel', cancel);
    const tap = () => {
      // review GH-301 round-2 P2: while a block is SELECTED a filled slot
      // pill RE-CAMS that span exactly like the preset pills (§3.2 —
      // never a stray insert beside an untouched selection)
      if (slotFilled(slot)) {
        if (retarget(8 + slot)) { ctx.view.renderNow(); return; }
        insertAtPlayhead(8 + slot);
      } else enterCapture(slot); // an empty slot's tap teaches capture
    };
    b.addEventListener('pointerup', () => {
      if (!pressed) return;
      clearTimeout(lp);
      pressed = false;
      tap();
    });
    // keyboard activation (review round-1 P2): Enter/Space on a native
    // button fires a click with NO pointer events — detail 0 is that path.
    // It opens the slot FLYOUT (review r4 P2): the flyout carries BOTH
    // actions (select/insert + re-capture), so keyboard users can replace
    // a filled pose — pointer users keep the direct tap + long-press.
    b.addEventListener('click', (e) => {
      if (e.detail === 0) openSlotFlyout(b);
    });
  }

  function openSlotFlyout(btn) {
    closePop();
    S.pop = document.createElement('div');
    S.pop.className = 'ob-pb-pop';
    S.pop.id = 'ob-pb-slotfly';
    const h = document.createElement('h4');
    h.className = 'ob-caps'; // the kit caps voice (playback.css keeps the pad)
    h.textContent = t('playback.cam.slots');
    S.pop.appendChild(h);
    for (let s = 0; s < 3; s++) {
      const row = document.createElement('div');
      row.className = 'ob-pb-pop-slotrow';
      const filled = slotFilled(s);
      // A2: the flyout entry IS the preset-pill geometry
      const tile = camPill({ label: t('playback.cam.slot', { n: s + 1 }),
        icon: 'cam-tripod', extra: ' ob-pb-slotfly-pill' });
      tile.dataset.slot = String(s);
      if (!filled) {
        tile.classList.add('ob-pb-slot--empty');
        tile.title = t('playback.cam.slotEmpty');
      }
      tile.addEventListener('click', () => {
        closePop();
        if (filled) {
          // the flyout entry follows the same re-target law (review r2 P2)
          if (retarget(8 + s)) { ctx.view.renderNow(); return; }
          insertAtPlayhead(8 + s);
        } else enterCapture(s);
      });
      const act = document.createElement('button');
      act.type = 'button';
      act.className = 'ob-btn ob-btn--ghost ob-pb-slotact';
      act.textContent = filled ? t('playback.capture.replace')
        : t('playback.capture.enter');
      act.addEventListener('click', () => {
        closePop();
        enterCapture(s);
      });
      row.append(tile, act);
      S.pop.appendChild(row);
    }
    document.body.appendChild(S.pop);
    syncHint(); // GH-331: the passive hint yields to the open flyout
    const r = btn.getBoundingClientRect();
    S.pop.style.left = `${Math.max(8,
      Math.min(r.left, innerWidth - S.pop.offsetWidth - 8))}px`;
    S.pop.style.top = `${Math.max(8, r.top - S.pop.offsetHeight - 8)}px`;
    uiSync(); // GH-314: the flyout pin arms (a popover holds the overlay)
  }

  /** Insert/update a cut at the QUANTIZED playhead, snap-assisted (§3.2 —
   * the pill law; at a shot boundary byte-identical to the GH-273 write).
   * Shared by the CAM pills (via playback.js) and the slot pills. */
  function insertAtPlayhead(camId) {
    const p = pb();
    if (!p) return false;
    const g = laneGeom();
    const snap = ctx.view.snapAssist(p.T, Math.max(SNAP_SEC,
      g ? SNAP_PX * p.total / Math.max(g.width, 1) : SNAP_SEC));
    const ok = !!M.writeCut({ seg: snap.seg, t: snap.t, cam: camId,
      transitionIn: 0, dur: 0 }, { degenerate: true });
    if (ok) ctx.view.renderNow();
    else {
      // GH-330, the CONTEXTUAL grammar refusal: the same write the pill /
      // slot-flyout tap meant, refused by the model AT THIS PLAYHEAD — a
      // silent no-op pre-fix. Say why, transiently. Only two refusals are
      // reachable here (a dynamic rig PINS to t=0 by the whole-segment law
      // and always writes): a static cut landing inside a dynamic span
      // (§1.5 midCutLegal), else the 128-cut cap — probed in writeCut's
      // own rule order.
      const dyn = M.isDynamic(M.appliedCam(camId));
      const spanDyn = !dyn && snap.t > 0
        && M.isDynamic(M.camIdAt(snap.seg, Math.max(0, snap.t - 0.001)));
      note(t(spanDyn ? 'playback.strip.refusedSpan'
        : 'playback.strip.refusedCap'));
    }
    return ok;
  }

  // ---- custom tripod capture (§3.2): pause → frame → save ------------------
  // The LATCH suppresses renderAtT's crossing re-apply + applyCam's rig
  // disarm (playback.js reads pb.captureLatch); the user frames with the
  // EXISTING in-game gestures (the player surface is pass-through; presets
  // pose THROUGH the orbit rig so "start from a preset, adjust, save"
  // works for free); Save quantizes through coords.threePosToK → integer
  // mm/decidegrees (the §1.1 quantize-at-save law).
  /** GH-330, the STATICALLY-knowable no-op: while the tripod capture holds
   * the latch, every slot-pill tap is enterCapture's guarded return (and
   * every preset-pill tap is playback.js's captureLatch return — that side
   * disables in setLatch). Wear the kit :disabled state + the localized
   * reason instead of silence, for exactly the latch's lifetime. */
  function syncCaptureDisable(on) {
    for (const b of [...S.slotBtns, S.slotsBtn]) {
      if (!b) continue;
      b.disabled = !!on;
      if (on) b.title = t('playback.strip.capturing');
      else b.removeAttribute('title');
    }
    if (!on) syncSlotFaces(); // restore the slot pills' own titles
  }

  function enterCapture(slot) {
    if (S.capture || !pb()) return;
    S.capture = { slot };
    ctx.view.pause();
    ctx.capture.setLatch(true);
    syncCaptureDisable(true);
    S.capBar = document.createElement('div');
    S.capBar.className = 'ob-pb-capbar';
    S.capBar.id = 'ob-pb-capture';
    const span = document.createElement('span');
    span.textContent = `${t('playback.cam.slot', { n: slot + 1 })} — `
      + t('playback.capture.hint');
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'ob-btn ob-btn--primary ob-pb-capsave';
    save.textContent = t('playback.capture.save');
    save.addEventListener('click', saveCapture);
    const cxl = document.createElement('button');
    cxl.type = 'button';
    cxl.className = 'ob-btn ob-btn--ghost ob-pb-capcancel';
    cxl.textContent = t('playback.capture.cancel');
    cxl.addEventListener('click', cancelCapture);
    S.capBar.append(span, save, cxl);
    document.body.appendChild(S.capBar);
  }

  function exitCapture() {
    if (!S.capture) return;
    S.capture = null;
    S.capBar?.remove();
    S.capBar = null;
    ctx.capture.setLatch(false);
    syncCaptureDisable(false); // GH-330: the pills re-arm with the latch
    maybeRest(); // GH-361 belt (capture is pause→frame→save, so normally
    // the resume edge settles this — but a stale pairing may differ)
    ctx.capture.applyAt(); // re-apply cameraAt at the playhead (§3.2)
  }

  function saveCapture() {
    if (!S.capture) return false;
    const slot = S.capture.slot;
    const pose = ctx.capture.poseFromCamera();
    if (pose && M.writePose(slot, pose)) {
      exitCapture();
      syncSlotFaces();
      note(t('playback.capture.saved', { n: slot + 1 }));
      return true;
    }
    exitCapture(); // unreadable camera (stale seam): restore honestly
    return false;
  }

  function cancelCapture() {
    exitCapture();
  }

  function note(msg) {
    if (!S.hint) {
      S.hint = document.createElement('div');
      S.hint.className = 'ob-pb-strip-hint';
      document.body.appendChild(S.hint);
    }
    S.hint.style.display = '';
    S.hint.textContent = msg;
    clearTimeout(S.noteTimer);
    S.noteTimer = setTimeout(() => {
      // GH-330/331: the expired note re-derives the banner — the editing
      // copy under a standing block selection, hidden under an open
      // popover, hidden otherwise
      syncHint();
    }, 2500);
  }

  function syncSlotFaces() {
    for (const b of S.slotBtns) {
      const s = Number(b.dataset.slot);
      b.title = slotFilled(s) ? t('playback.cam.slot', { n: s + 1 })
        : t('playback.cam.slotEmpty');
      b.classList.toggle('ob-pb-slot--empty', !slotFilled(s));
    }
  }

  function syncPressed(camId) {
    for (const b of S.slotBtns) {
      b.setAttribute('aria-pressed',
        String(camId === 8 + Number(b.dataset.slot)));
    }
    S.slotsBtn?.setAttribute('aria-pressed', String(camId >= 8));
  }

  function relabel() {
    if (!S.mounted) return;
    // body-level overlays are t()-composed OUTSIDE applyDom's reach (review
    // r6 P2): transient popovers CLOSE on a locale switch (honest — their
    // copy re-derives on reopen), the capture bar + hint re-write in place.
    closePop();
    if (S.capBar && S.capture) {
      const span = S.capBar.querySelector('span');
      if (span) {
        span.textContent = `${t('playback.cam.slot', { n: S.capture.slot + 1 })} — `
          + t('playback.capture.hint');
      }
      const sv = S.capBar.querySelector('.ob-pb-capsave');
      if (sv) sv.textContent = t('playback.capture.save');
      const cx = S.capBar.querySelector('.ob-pb-capcancel');
      if (cx) cx.textContent = t('playback.capture.cancel');
    }
    if (S.hint && S.sel?.kind === 'block') {
      S.hint.textContent = t('playback.strip.editing');
    }
    S.lane?.setAttribute('aria-label', t('playback.strip.aria'));
    // GH-314: the toggle's accessible name re-derives with the locale
    S.toggle?.setAttribute('aria-label',
      t(S.expanded ? 'playback.strip.collapse' : 'playback.strip.expand'));
    for (const b of S.slotBtns) {
      const s = Number(b.dataset.slot);
      const l = b.querySelector('.ob-pb-cam-l');
      if (l) l.textContent = t('playback.cam.slot', { n: s + 1 });
    }
    if (S.slotsBtn) {
      const l = S.slotsBtn.querySelector('.ob-pb-cam-l');
      if (l) l.textContent = `${t('playback.cam.slots')} ▾`;
    }
    syncSlotFaces();
    if (S.capture) syncCaptureDisable(true); // GH-330: reasons re-localize
    render();
  }

  /** Late ui/icons.js resolve (review r9 P3): the built-once slot pills
   * upgrade off their text fallback — playback.js's retrofitIcons calls
   * this beside its own lateFaces (blocks re-face per render already). */
  function refreshIcons() {
    for (const b of [...S.slotBtns, S.slotsBtn]) {
      if (!b) continue;
      const gi = b.querySelector('span[aria-hidden="true"]');
      const node = gi ? ctx.ico('cam-tripod', 19) : null;
      if (node) gi.replaceChildren(node);
    }
  }

  return {
    mount, unmount, layout, render, relabel, refreshIcons,
    insertAtPlayhead, retarget, syncPressed,
    // e2e/debug seams (ADDITIVE — surfaced as __playback.strip())
    seams: {
      mounted: () => S.mounted,
      // GH-314 (ADDITIVE): the D-lite sliver state + the engaged predicate
      // playback.js's overlay pins read (seam drag / selection / popover /
      // capture — "any seam/anchor interaction")
      expanded: () => S.expanded,
      setExpanded,
      // GH-361 (ADDITIVE): playback.js's resume edge — rest an
      // auto-expanded lane once playing (feature-detected by the caller;
      // a stale playback.js simply never calls it)
      releaseAutoExpand: () => maybeRest(),
      autoExpanded: () => S.autoExpanded,
      engaged: () => !!(S.pop || S.capture || S.sel || S.dragActive),
      selected: () => (S.sel ? { kind: S.sel.kind, cut: selIdx() } : null),
      select: (cut) => select(cut === null ? null : { kind: 'block', cut }),
      openTransPicker: (i) => {
        const se = S.lane?.querySelector(`.ob-pb-strip-seam[data-seam="${i}"]`);
        const r = se?.getBoundingClientRect();
        openTransPicker(i, r?.left ?? 200, r?.top ?? 300);
      },
      openSlotFlyout: () => { if (S.slotsBtn) openSlotFlyout(S.slotsBtn); },
      closePop,
      enterCapture,
      saveCapture,
      cancelCapture,
      captureActive: () => !!S.capture,
      insertAtPlayhead,
      dismiss: () => { closePop(); select(null); },
      deleteCut: (i) => {
        const ok = M.deleteCut(i);
        if (ok) { select(null); ctx.view.renderNow(); }
        return ok;
      },
      blockRepr: () => (S.lane
        ? [...S.lane.querySelectorAll('.ob-pb-strip-block')]
          .map((b) => ({ cut: b.dataset.cut ?? null, fam: b.dataset.fam,
            repr: b.dataset.repr, name: b.getAttribute('aria-label'),
            w: b.getBoundingClientRect().width }))
        : null),
    },
  };
}
