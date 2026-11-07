// Copyright (c) Meta Platforms, Inc. and affiliates.

// select.js — progressive upgrade of a native <select> into a styled
// combobox + listbox popover (contract: feature 006 (internal spec)
// contracts/ui-kit.md). The native select STAYS in the DOM, hidden and
// value-authoritative: e2e/app code drives it via `sel.value = v;
// sel.dispatchEvent(new Event('change'))` and the widget label follows.
// Leaf module: imports only ui/ siblings (motion.js carries its own tween engine).
import * as motion from './motion.js';

let uid = 0;

// ---- live clamp-observer census (GH-668 S5 kit, review r3 P2) ----------------
// Every upgraded select owns ONE ResizeObserver (the two-line clamp
// re-measure below). The handle lives on the widget and destroy()
// disconnects it — the pre-fix widget discarded the handle, so an owner
// that removed an upgraded select (the playback export save-card: two
// selects per open, closeCard() refreshed them and dropped the node) left
// the observer alive, and through it the detached button and the whole
// card subtree: +2 observers per open/close cycle, unbounded. This registry
// is the wall: `observers` = live clamp observers, `detached` = live
// observers whose button already left the document (the leak signature —
// a destroy()-ed widget is out of the set before its button goes).
const liveClamps = new Set(); // { ro, btn }
export function clampCensus() {
  let detached = 0;
  for (const c of liveClamps) if (!c.btn.isConnected) detached++;
  return { observers: liveClamps.size, detached };
}
// TEST SEAM — scripted boots only (the archive.js `ob-scripted` read, set by
// ?obtool; production boots never carry it, so the window surface never
// exists there). Leaf-module law kept: a storage read, no app import.
try {
  if (sessionStorage.getItem('ob-scripted') === '1') {
    window.__obSelect = { clampCensus };
  }
} catch { /* storage unavailable */ }

/** Upgrade `sel`. Idempotent: re-upgrading refreshes the existing widget.
 * Returns { refresh(), destroy() } — call refresh() after repopulating
 * sel.options (settings.js does on locale switch); call destroy() BEFORE
 * removing an upgraded select from the document (transient cards: the
 * playback save-card, the export modal) — refresh() sweeps the popover but
 * only destroy() releases the clamp ResizeObserver (census above). */
export function upgradeSelect(sel, opts = {}) {
  if (sel.__obSelect) { sel.__obSelect.refresh(); return sel.__obSelect; }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ob-select';
  btn.setAttribute('role', 'combobox');
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.dataset.ob = 'select-button';
  const label = document.createElement('span');
  label.className = 'ob-select__label';
  const chevron = document.createElement('span');
  chevron.className = 'ob-select__chevron';
  btn.append(label, chevron);
  const listId = `ob-select-list-${sel.id || uid++}`;

  let list = null;      // open popover UL (in document.body) or null
  let active = -1;      // keyboard-active option index
  let typeBuf = '', typeAt = 0; // type-ahead accumulator (500ms window)

  const syncLabel = () => {
    const o = sel.options[sel.selectedIndex];
    // opts.labelText(option) -> string: closed-button label override (e.g.
    // settings strips the ' · badge' suffix that its row chip already shows)
    const full = o ? o.textContent : '';
    const shown = o && opts.labelText ? opts.labelText(o) : full;
    label.textContent = shown;
    // GH-443 (no-ellipsize law): when the closed display label is a
    // SHORTENED form, the full option text stays reachable — on the
    // trigger's tooltip/accessible DESCRIPTION (the open list carries it
    // visually). Deliberately NOT aria-label (review r5 P2): the trigger's
    // NAME is its bound label (nameTrigger below — a combobox's text is its
    // VALUE, not its name, #1052), so the full option text rides `title`.
    // Cleared when the label is the full text.
    if (shown !== full && full) btn.title = full;
    else btn.removeAttribute('title');
    btn.disabled = sel.disabled;
    queueClampCheck();
  };
  // ACCESSIBLE NAME (#1052): combobox is not a name-from-content role (the
  // trigger's text is its VALUE), and hiding the native select takes its
  // bound <label>s out of the tree with it — every kit select read as an
  // unnamed "combobox". The trigger names itself from the native select's
  // own labelling, in accname order: aria-labelledby → aria-label → its
  // <label>s (for= or wrapping). A wrapping label is referenced through its
  // caption element(s), so the name never repeats the value the trigger
  // contributes as the label's descendant. A label click focuses the
  // trigger: the hidden select can no longer take the label's activation.
  const nameBase = `ob-select-name-${sel.id || uid++}`;
  let nameSeq = 0;
  const labelClicks = new Map(); // <label> -> its click forwarder (destroy() unbinds)
  const nameTrigger = () => {
    btn.removeAttribute('aria-labelledby');
    btn.removeAttribute('aria-label');
    const by = sel.getAttribute('aria-labelledby');
    const aria = sel.getAttribute('aria-label');
    if (by) { btn.setAttribute('aria-labelledby', by); return; }
    if (aria) { btn.setAttribute('aria-label', aria); return; }
    const ids = [];
    for (const lab of sel.labels ?? []) {
      const caps = lab.contains(sel)
        ? [...lab.children].filter((c) => c !== sel && c !== btn && c.textContent.trim())
        : [];
      for (const part of caps.length ? caps : [lab]) {
        if (!part.id) part.id = `${nameBase}-${nameSeq++}`;
        ids.push(part.id);
      }
      if (!labelClicks.has(lab)) {
        const fwd = (e) => {
          if (btn.contains(e.target) || btn.disabled) return;
          e.preventDefault();
          btn.focus();
        };
        lab.addEventListener('click', fwd);
        labelClicks.set(lab, fwd);
      }
    }
    if (ids.length) btn.setAttribute('aria-labelledby', ids.join(' '));
  };

  // TWO-LINE CLAMP disclosure (GH-668 B-K21, visual audit r1 P2): kit.css
  // clamps the closed label at two line boxes (overflow-y clip, no
  // ellipsis). When the copy really needs a third line the trigger's
  // `title` carries the FULL text — measured after layout (scrollHeight
  // past the clamped box), re-measured on resize (a narrower column can
  // clamp a label that fitted) and on every relabel. A shortened
  // labelText() form keeps its own title (above) regardless.
  let clampRaf = 0;
  let clampRo = null;   // the widget's ResizeObserver — disconnected in destroy()
  const clampCheck = () => {
    clampRaf = 0;
    if (!btn.isConnected) return;
    const o = sel.options[sel.selectedIndex];
    const full = o ? o.textContent : '';
    const shown = label.textContent;
    if (shown !== full) return; // the shortened form owns the title
    const clamped = label.scrollHeight > label.clientHeight + 1;
    if (clamped && full) btn.title = full;
    else if (!clamped && btn.title === full) btn.removeAttribute('title');
  };
  function queueClampCheck() {
    if (!clampRaf) clampRaf = requestAnimationFrame(clampCheck);
  }
  const clampEntry = { ro: null, btn };
  if (typeof ResizeObserver === 'function') {
    clampRo = new ResizeObserver(queueClampCheck);
    clampRo.observe(btn);
    clampEntry.ro = clampRo;
    liveClamps.add(clampEntry);
  }

  function setActive(i) {
    if (!list) return;
    const items = list.children;
    if (!items.length) return;
    active = Math.max(0, Math.min(items.length - 1, i));
    for (let k = 0; k < items.length; k++) {
      if (k === active) items[k].setAttribute('data-active', '1');
      else items[k].removeAttribute('data-active');
    }
    btn.setAttribute('aria-activedescendant', items[active].id);
    items[active].scrollIntoView({ block: 'nearest' });
  }

  function commit(i) {
    const o = sel.options[i];
    if (!o || o.disabled) return;
    if (sel.selectedIndex !== i) {
      sel.selectedIndex = i;
      // both events: app code listens 'change'; live widgets listen 'input'
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    syncLabel();
    close(true);
  }

  function place() {
    const r = btn.getBoundingClientRect();
    // zero-rect guard (2026-07-13 QA): a trigger hidden mid-flight (modal
    // closed under an open popover, display:none ancestor) reads 0x0 and
    // would park the popover at the viewport corner — sweep it instead.
    if (r.width === 0 && r.height === 0) { close(false); return; }
    // width law (the design charter select contract): the popover matches the
    // trigger column; only when the widest option's intrinsic single-line
    // width NEEDS more does the excess overhang — SYMMETRICALLY, clamped
    // to the viewport (never the old one-sided right overhang).
    list.style.minWidth = `${r.width}px`;
    const lw = list.offsetWidth; // shrink-to-fit ≥ minWidth
    const excess = Math.max(0, lw - r.width);
    const left = Math.min(r.left - excess / 2, window.innerWidth - lw - 8);
    list.style.left = `${Math.max(8, left)}px`;
    const lh = list.offsetHeight;
    // flip above when the popover would land within 16px of the bottom edge.
    // Height law (issue GH-291, kit.css .ob-select__list): max-height is
    // viewport-clamped (100dvh - 32px - safe insets; 100vh fallback), so
    // lh <= innerHeight - 32 always (innerHeight tracks the same dynamic
    // visual viewport dvh does) — when the list fits NEITHER fully below
    // NOR fully above the trigger, the flip branch's 8px top clamp pins it
    // fully inside the viewport (it overlays the trigger, macOS-select
    // style) and every option stays visible without scrolling.
    if (r.bottom + 4 + lh > window.innerHeight - 16) {
      list.style.top = `${Math.max(8, r.top - 4 - lh)}px`;
    } else {
      list.style.top = `${r.bottom + 4}px`;
    }
  }

  function buildList() {
    const ul = document.createElement('ul');
    ul.className = 'ob-select__list';
    ul.setAttribute('role', 'listbox');
    ul.dataset.ob = 'select-list';
    ul.id = listId;
    // GH-534 G3 (round-2 QA, kit half): an option press must never steal
    // focus from the combobox trigger (the canonical listbox pattern) —
    // pre-fix the mousedown blurred it to <body>, and commit()'s own
    // close(true) focus restore was cancelled whenever the same-dispatch
    // ob:settings sweep (refreshSelects → refresh → close(false)) ran
    // first, leaving EVERY value-committing mouse pick focused on body
    // (the shell key gate then ate Escape — see shell.js gateKeyDown).
    ul.addEventListener('mousedown', (e) => e.preventDefault());
    for (let i = 0; i < sel.options.length; i++) {
      const o = sel.options[i];
      const li = document.createElement('li');
      li.className = 'ob-option';
      li.setAttribute('role', 'option');
      li.dataset.ob = 'option';
      li.id = `${listId}-opt-${i}`;
      li.textContent = o.textContent; // native option text: i18n flows through
      li.setAttribute('aria-selected', i === sel.selectedIndex ? 'true' : 'false');
      if (o.disabled) li.setAttribute('aria-disabled', 'true');
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        const ul = list;
        commit(i);
        if (ul && !list) announce('ob:dismissed', ul); // the list left under the pointer
      });
      li.addEventListener('mousemove', () => { if (active !== i) setActive(i); });
      ul.appendChild(li);
    }
    return ul;
  }

  const onDocDown = (e) => {
    if (list && !list.contains(e.target) && !btn.contains(e.target)) close(false);
  };
  const onScroll = (e) => {
    if (list && !list.contains(e.target)) place(); // page scrolled: follow
  };
  const onResize = () => close(false);

  function open() {
    if (list || sel.disabled) return;
    // zero-rect guard (2026-07-13 QA): never open off a hidden trigger —
    // place() would have nothing to anchor to (viewport-corner popover)
    if (!btn.getClientRects().length) return;
    list = buildList();
    document.body.appendChild(list);
    place();
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-controls', listId);
    setActive(sel.selectedIndex >= 0 ? sel.selectedIndex : 0);
    document.addEventListener('pointerdown', onDocDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    motion.enter(list, { duration: motion.T_FAST });
  }

  function close(focusBtn) {
    if (!list) return;
    const ul = list;
    list = null;
    active = -1;
    btn.setAttribute('aria-expanded', 'false');
    btn.removeAttribute('aria-activedescendant');
    document.removeEventListener('pointerdown', onDocDown, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onResize);
    // the exiting list takes no input: a click under it during the exit
    // tween reaches the control beneath and never commits a dismissed
    // option (b20 batch 4: the click on the next trigger, ~200 ms after
    // an Escape on a loaded box, landed on the previous list's option)
    ul.style.pointerEvents = 'none';
    motion.exit(ul, { duration: motion.T_FAST }).then(() => ul.remove());
    if (focusBtn) btn.focus();
  }

  /** type-ahead: accumulate printable keys in a 500ms window, jump to the
   * first option whose label starts with the buffer (case-insensitive). */
  function typeahead(key) {
    const now = Date.now();
    if (now - typeAt > 500) typeBuf = '';
    typeAt = now;
    typeBuf += key.toLowerCase();
    for (let i = 0; i < sel.options.length; i++) {
      const o = sel.options[i];
      if (o.disabled) continue;
      if (o.textContent.trim().toLowerCase().startsWith(typeBuf)) {
        if (list) setActive(i);
        else if (sel.selectedIndex !== i) {
          sel.selectedIndex = i;
          sel.dispatchEvent(new Event('input', { bubbles: true }));
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          syncLabel();
        }
        return;
      }
    }
  }

  // #1072 sibling (b20): a list that opens or leaves under the pointer is
  // announced to the shell's continuation guard, so the rest of a
  // double-click never reaches what lies under it (a HUD cue pick fired
  // Shoot underneath; a list clamped over its trigger took the second
  // click as a pick). Keyboard paths arm nothing (the guard keys on its
  // own last trusted pointer click); without a shell nobody listens.
  const announce = (type, panel) => {
    try { window.dispatchEvent(new CustomEvent(type, { detail: { panel } })); } catch { /* no guard */ }
  };
  btn.addEventListener('click', () => {
    if (list) { close(true); return; }
    open();
    if (list) announce('ob:popover', list);
  });
  // Every handled key stops propagation: the app has a WINDOW-level keydown
  // handler (aim.js) that steers the cue on arrows and hotkeys — without
  // stopPropagation, navigating the popover would also swing the aim.
  btn.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault(); e.stopPropagation();
        list ? setActive(active + 1) : open();
        break;
      case 'ArrowUp':
        e.preventDefault(); e.stopPropagation();
        list ? setActive(active - 1) : open();
        break;
      case 'Home':
        if (list) { e.preventDefault(); e.stopPropagation(); setActive(0); }
        break;
      case 'End':
        if (list) {
          e.preventDefault(); e.stopPropagation();
          setActive(sel.options.length - 1);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault(); e.stopPropagation();
        list ? commit(active) : open();
        break;
      case 'Escape':
        // only when open: a closed combobox lets Escape reach the panel layer
        if (list) { e.preventDefault(); e.stopPropagation(); close(true); }
        break;
      case 'Tab':
        // focus is leaving: sweep the popover, let the tab move naturally
        if (list) close(false);
        break;
      default:
        if (e.key.length === 1 && e.key !== ' ') {
          e.stopPropagation(); // type-ahead chars are hotkeys ('v' = aim view)
          typeahead(e.key);
        }
    }
  });

  // focus loss (programmatic focus moves, clicks that focus elsewhere):
  // the popover must never outlive the combobox's focus. Deferred so an
  // option click (which keeps focus on the button — LIs aren't focusable)
  // and the commit path settle first.
  btn.addEventListener('blur', () => {
    setTimeout(() => {
      if (list && document.activeElement !== btn
          && !list.contains(document.activeElement)) close(false);
    }, 0);
  });

  // two-way sync: app/e2e code sets sel.value and dispatches change/input
  const onSelSync = () => {
    syncLabel();
    if (list) {
      const items = list.children;
      for (let i = 0; i < items.length; i++) {
        items[i].setAttribute('aria-selected',
          i === sel.selectedIndex ? 'true' : 'false');
      }
    }
  };
  sel.addEventListener('change', onSelSync);
  sel.addEventListener('input', onSelSync);

  sel.hidden = true; // stays in DOM, value-authoritative
  sel.after(btn);
  syncLabel();
  nameTrigger();

  const widget = {
    /** rebuild from sel.options (call after repopulating, e.g. locale switch) */
    refresh() {
      close(false);
      syncLabel();
      nameTrigger();
    },
    destroy() {
      close(false);
      // clamp teardown (review r3 P2): the observer and its pending rAF leave
      // WITH the widget — the registry entry goes first so a census taken
      // between destroy() and the owner's node removal never counts it
      if (clampRaf) { cancelAnimationFrame(clampRaf); clampRaf = 0; }
      if (clampRo) { clampRo.disconnect(); clampRo = null; }
      liveClamps.delete(clampEntry);
      sel.removeEventListener('change', onSelSync);
      sel.removeEventListener('input', onSelSync);
      for (const [lab, fwd] of labelClicks) lab.removeEventListener('click', fwd);
      labelClicks.clear();
      btn.remove();
      sel.hidden = false;
      delete sel.__obSelect;
    },
  };
  sel.__obSelect = widget;
  return widget;
}

