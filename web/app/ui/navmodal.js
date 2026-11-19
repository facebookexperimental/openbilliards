// Copyright (c) Meta Platforms, Inc. and affiliates.

// navmodal.js — generic kit modal with a left side-nav: large centered
// surface (min(880px, 92vw) × min(620px, 86vh) desktop clamp with a 208px
// rail — the 015 comp-a/plan geometry; kit.css .ob-navmodal), header
// (title + close), keyboard-navigable nav list (aria-current on the active
// item, selection follows focus), right content pane with PER-SECTION
// scroll memory (recorded on the pane by default; consumers that restyle
// the pane so an inner element owns the scroll elect it via
// api.setScroller(el)). Contract 015 §2 law: ALL sections are DOM-present from
// build time; switching toggles the `hidden` attribute only — no section
// node is ever re-created or reparented (selector stability + the e2e
// truncation walker depend on it). Modality (backdrop, focus trap,
// Escape/backdrop close, motion, reduced-motion) is delegated to dialog.js
// openPanel/closePanel.
//
// INERT until consumed: this module has zero import-time side effects and
// nothing in the app imports it yet — booting the app never requests this
// file (e2e-ui behavior arm F3 asserts both). Phone breakpoint is a CSS
// SKELETON stub behind feature 014's coarse-pointer gating law (.ob-touch
// root class AND a (pointer: coarse) media query — kit.css): full-screen
// sheet + segmented top tabs; final phone wiring lands at 014 integration.
//
// Leaf module (cache-poison contract): imports only ui/ siblings. i18n:
// callers pass ALREADY-TRANSLATED strings (title, labels, closeLabel).
import { openPanel, closePanel } from './dialog.js';
import { icon } from './icons.js'; // ui/ sibling (leaf-module law, #49)
import { attachScrollFade } from './scrollfade.js'; // GH-668 B-K19 block fade

let uid = 0;

// ---- GH-226 input-modality tracker (phantom first-open focus ring) ----
// open() places PROGRAMMATIC focus on the active nav item. Before the
// session's first real pointer interaction the browser's :focus-visible
// heuristic still sits at its keyboard-y boot default, so that script
// focus MATCHED :focus-visible and painted the kit focus ring on a
// pointer-opened modal — on the phone tab strip the overflow-x clip left
// just a stray thick accent bar on the selected pill's right side (the
// GH-226 owner artifact; reopen/tab-switch "cleared" it only because a
// real tap had flipped the heuristic by then). Track the LAST real input
// modality ourselves: a non-keyboard open() takes the quietFocus path
// below, a keyboard-driven open keeps the genuine focus indicator.
// Listeners install ONCE at first createNavModal() call — the module
// keeps zero import-time side effects (e2e-ui behavior arm F3).
let kbdModality = false;
let modalityTracked = false;
function trackModality() {
  if (modalityTracked) return;
  modalityTracked = true;
  // TRUSTED events only (both listeners): the browser's own heuristic
  // ignores synthetic dispatchEvent traffic (element.click(), the e2e
  // fixtures' U.key), so the tracker must too or the two would disagree
  window.addEventListener('keydown', (e) => {
    // modifier chords are commands, not focus navigation (the ul keydown
    // guard's convention) — they don't flip the modality to keyboard
    if (e.isTrusted && !e.ctrlKey && !e.metaKey && !e.altKey) kbdModality = true;
  }, { capture: true, passive: true });
  window.addEventListener('pointerdown', (e) => {
    if (e.isTrusted) kbdModality = false;
  }, { capture: true, passive: true });
}

/** Focus `btn` with the phantom-ring suppression marker: kit.css blanks
 * the :focus-visible ring while [data-ob-quiet-focus] is present (NEVER a
 * blanket outline:none — the rule is scoped to this marker). The marker
 * clears on the first subsequent keydown or on blur, so a keyboard user
 * gets the standard indicator from their first keystroke (a11y intact:
 * arrow/Tab navigation always shows the ring). */
function quietFocus(btn) {
  btn.setAttribute('data-ob-quiet-focus', '');
  const clear = (e) => {
    if (e?.type === 'keydown' && !e.isTrusted) return; // synthetic keys
    // don't re-arm the ring (mirrors the tracker's isTrusted law)
    btn.removeAttribute('data-ob-quiet-focus');
    btn.removeEventListener('blur', clear);
    window.removeEventListener('keydown', clear, true);
  };
  btn.addEventListener('blur', clear);
  window.addEventListener('keydown', clear, true);
  btn.focus();
}

/** Create a side-nav modal. Returns { el, open(id?), close(), select(id),
 * current(), destroy() }.
 *
 * opts:
 *   title        string — header title + nav aria-label
 *   closeLabel   string — close button aria-label (pass a t() string)
 *   sections     [{ id, label, node? , render?(container) }] — content is
 *                built EAGERLY at construction (015 §2: all sections
 *                DOM-present from build time): `node` is adopted,
 *                otherwise `render(container)` fills the section's
 *                persistent container (called once)
 *   onSelect(id) fired after every section switch
 *   onClose()    fired whenever the modal transitions open -> closed
 *                (close button, Escape, backdrop, programmatic close())
 */
export function createNavModal(opts = {}) {
  const {
    title = '', closeLabel = 'Close', sections = [], onSelect, onClose,
  } = opts;
  trackModality(); // GH-226: first consumption arms the modality tracker
  const id = `ob-navmodal-${uid++}`;

  const el = document.createElement('div');
  el.className = 'ob-panel ob-navmodal';
  el.dataset.ob = 'navmodal';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', `${id}-title`);
  el.style.display = 'none';

  // ---- header: title + close ----
  const head = document.createElement('header');
  head.className = 'ob-navmodal__head';
  const h = document.createElement('h2');
  h.className = 'ob-panel__title';
  h.id = `${id}-title`;
  h.textContent = title;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  // --icon since GH-245: the close joins the unified 34px/44pt icon-pill
  // circle register (kit.css owns the geometry; __close keeps only the
  // text-fallback line-height)
  closeBtn.className = 'ob-btn ob-btn--ghost ob-btn--icon ob-navmodal__close';
  closeBtn.dataset.ob = 'navmodal-close';
  closeBtn.setAttribute('aria-label', closeLabel);
  const closeIcon = icon('close'); // #49 icon system; '×' = fallback only
  if (closeIcon) closeBtn.appendChild(closeIcon);
  else closeBtn.textContent = '×';
  head.append(h, closeBtn);

  // ---- phone tab stub: segmented radios mirroring the nav (CSS-hidden on
  // desktop; the coarse-pointer skeleton in kit.css shows them) ----
  const tabs = document.createElement('div');
  tabs.className = 'ob-segmented ob-navmodal__tabs';
  tabs.dataset.ob = 'navmodal-tabs';
  tabs.setAttribute('role', 'radiogroup');
  if (title) tabs.setAttribute('aria-label', title);

  // ---- grid: nav list + content pane ----
  const grid = document.createElement('div');
  grid.className = 'ob-navmodal__grid';
  const nav = document.createElement('nav');
  nav.className = 'ob-navmodal__nav';
  nav.dataset.ob = 'navmodal-nav';
  if (title) nav.setAttribute('aria-label', title);
  const ul = document.createElement('ul');
  nav.appendChild(ul);
  const pane = document.createElement('section');
  pane.className = 'ob-navmodal__pane';
  pane.dataset.ob = 'navmodal-pane';
  // GH-668 B-K06 tabbable-only-if-overflow: the pane joins the tab order
  // ONLY while it clips its section (a fitted pane was a dead stop wearing
  // an inset ring); -1 keeps it script-focusable for the trap. Re-judged on
  // every section switch and on resize (the observer also fires on open).
  pane.tabIndex = -1;
  const syncPaneStop = () => {
    const stop = pane.scrollHeight > pane.clientHeight + 1 ? 0 : -1;
    if (pane.tabIndex !== stop) pane.tabIndex = stop;
  };
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(syncPaneStop).observe(pane);
  }
  grid.append(nav, pane);
  el.append(head, tabs, grid);
  // GH-668 B-K19: the kit block fade rides the elected scroller (the pane
  // by default; setScroller() moves it) — under a pinned action bar the
  // fade is what says "more below" (the phone sheet's VOLUME row sat
  // under the bar with no cue). The leaf masks a paint-less scroller and
  // paints bands on one that owns paint; instant under reduced motion.
  attachScrollFade(pane, { axis: 'block' });

  const items = new Map(); // id -> { section, btn, radio, holder, rendered }
  for (const s of sections) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ob-navmodal__item';
    btn.dataset.ob = 'navmodal-item';
    btn.dataset.section = s.id;
    btn.textContent = s.label;
    btn.addEventListener('click', () => select(s.id, { focus: true }));
    li.appendChild(btn);
    ul.appendChild(li);

    const tab = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `${id}-tab`;
    radio.value = s.id;
    radio.addEventListener('change', () => { if (radio.checked) select(s.id); });
    const span = document.createElement('span');
    span.textContent = s.label;
    tab.append(radio, span);
    tabs.appendChild(tab);

    // 015 §2 law: content built ONCE here, holder parented to the pane for
    // the component's whole life — select() only flips `hidden`. A passed
    // `node` IS the holder (no wrapper div): the §2 frozen structure keeps
    // `section[data-section]` as the element the `hidden` toggle lands on
    // (consumers' own section nodes stay the selector-stable surface).
    let holder;
    if (s.node instanceof Element) {
      holder = s.node;
      holder.classList.add('ob-navmodal__section');
      holder.dataset.section = s.id;
    } else {
      holder = document.createElement('div');
      holder.className = 'ob-navmodal__section';
      holder.dataset.section = s.id;
      s.render?.(holder);
    }
    holder.hidden = true;
    pane.appendChild(holder);
    items.set(s.id, { section: s, btn, radio, holder });
  }

  let current = null;
  let isOpen = false;
  let scroller = pane; // scroll-memory element; consumers may re-elect it
  const scrollMem = new Map(); // section id -> scroller scrollTop

  function select(sid, { focus = false } = {}) {
    const it = items.get(sid);
    if (!it) return;
    if (sid !== current) {
      if (current) scrollMem.set(current, scroller.scrollTop);
      current = sid;
      for (const [k, v] of items) {
        if (k === sid) v.btn.setAttribute('aria-current', 'true');
        else v.btn.removeAttribute('aria-current');
        v.radio.checked = k === sid;
        v.holder.hidden = k !== sid; // §2: hidden-attribute toggling ONLY
      }
      scroller.scrollTop = scrollMem.get(sid) ?? 0;
      onSelect?.(sid);
      syncPaneStop();
    }
    if (focus) it.btn.focus();
  }

  // nav keyboard law (select.js convention): handled keys preventDefault +
  // stopPropagation — the window-level aim.js keydown handler must never
  // see list navigation. Selection follows focus.
  ul.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const order = sections.map((s) => s.id);
    const i = order.indexOf(current);
    let to = null;
    if (e.key === 'ArrowDown') to = Math.min(order.length - 1, i + 1);
    else if (e.key === 'ArrowUp') to = Math.max(0, i - 1);
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = order.length - 1;
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    select(order[to], { focus: true });
  });

  function doClose() {
    if (!isOpen) return Promise.resolve();
    isOpen = false;
    const p = closePanel(el);
    onClose?.();
    return p;
  }
  closeBtn.addEventListener('click', doClose);

  document.body.appendChild(el);

  const api = {
    el,
    current: () => current,
    select,
    /** Elect the element per-section scroll memory records/restores on
     * (default: the content pane). For consumers whose shell CSS moves the
     * scroll to an inner element (pane overflow:hidden, body scrolls). */
    setScroller(node) {
      if (!(node instanceof Element) || node === scroller) return;
      scroller.__obScrollFade?.detach?.();
      scroller = node;
      attachScrollFade(node, { axis: 'block' });
    },
    /** Open on section `sid` (default: last current, else first section). */
    open(sid) {
      select(sid ?? current ?? sections[0]?.id);
      isOpen = true;
      const p = openPanel(el, {
        display: 'flex', backdrop: true, autofocus: false,
        onClose: () => { // user-initiated Escape / backdrop click
          if (isOpen) { isOpen = false; onClose?.(); }
        },
      });
      const bd = el.previousElementSibling; // backdrop openPanel inserted
      if (bd?.classList.contains('ob-backdrop')) {
        bd.classList.add('ob-backdrop--top');
      }
      // initial focus: the ACTIVE nav item is the dialog's semantic
      // "current value" (openPanel's checked-radio idiom, applied to nav).
      // GH-226: a pointer/programmatic open takes the QUIET path — the
      // phantom :focus-visible ring never paints; a keyboard-driven open
      // keeps the genuine indicator (see trackModality above).
      const cbtn = items.get(current)?.btn;
      if (cbtn) { if (kbdModality) cbtn.focus(); else quietFocus(cbtn); }
      // stale-cache guard (cache-poison contract): fresh navmodal.js over a
      // STALE kit.css missing .ob-navmodal must stay centered/usable —
      // critical placement falls back inline (select.js place() precedent)
      if (getComputedStyle(el).position !== 'fixed') {
        el.style.cssText += ';position:fixed;inset:0;margin:auto;'
          + 'width:min(880px, 92vw);height:min(620px, 86vh);z-index:var(--ob-z-dialog, 70);';
        if (bd) bd.style.zIndex = 'var(--ob-z-scrim, 69)';
      }
      return p;
    },
    close: doClose,
    /** Tear down: close silently (no onClose) and remove all DOM. */
    destroy() {
      isOpen = false;
      closePanel(el).then(() => el.remove());
    },
  };
  return api;
}
