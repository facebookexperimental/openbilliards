// Copyright (c) Meta Platforms, Inc. and affiliates.

// bb-clip — the design-system in-place video clip. No dependencies.
// Contract, budget and the honest transfer profile live in the design system
// ("bb-clip"); markup grammar in site/README.md. One job: upgrade a
// poster tile (an <a data-clip href="…mp4"> around its poster <img>)
// into an in-place player — poster→video swap in the SAME box — with
// YouTube-style viewport autoplay under hard guardrails:
//
//   • muted + playsinline + loop, always (autoplay policy; the clips
//     themselves carry no audio track — ffprobe-verified — so there is
//     no sound affordance to build);
//   • IntersectionObserver play band: a tile plays only while ≥ 55%
//     visible, and ONLY the most-visible MAX_ON tiles play at once —
//     everything else pauses (16 concurrent decoders is a storm);
//   • staging: preload none at rest → a <video preload="metadata">
//     exists only while the tile is inside the ±60%-viewport stage
//     band; leaving it pauses AND releases src + decoder (the poster
//     <img> never left, so the box never reflows);
//   • prefers-reduced-motion / Save-Data / no-IO collapse to the
//     click-to-play register: visible play glyph, zero video bytes
//     until the visitor clicks (the reduced-motion law is absolute);
//   • per-tile fullscreen affordance (requestFullscreen, webkit
//     fallbacks incl. iOS video-only), native controls while inside;
//     hidden entirely where no fullscreen API exists — those visitors
//     keep the complete in-place player;
//   • dual-source (optional data-clip-preview): the tile plays the
//     textless preview rendition, fullscreen the full annotated source
//     (swap on entry, back on exit — see swap()); no attribute, no swap.
//
// No-JS / file:// with scripts blocked: nothing here runs and the
// resting anchor IS the experience — a plain link to the mp4.
(() => {
  'use strict';
  const PLAY_AT = 0.55;        // play-band visibility threshold
  const MAX_ON = 2;            // concurrency cap: most-visible N play
  const STAGE = '60% 0px';     // stage/release band around the viewport
  const STEPS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 1];

  const hasIO = 'IntersectionObserver' in window;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  // autoplay register vs click-to-play register, decided once at boot
  // (matching motion.js's one-shot reduced-motion read)
  const auto = hasIO && !reduced && !saveData;

  // fullscreen capability, feature-detected once. Element methods, not
  // document.fullscreenEnabled: iOS Safari has NO element fullscreen but
  // ships the video-only webkitEnterFullscreen, which is exactly enough.
  const probe = document.createElement('video');
  const fsOK = !!(probe.requestFullscreen || probe.webkitRequestFullscreen
    || probe.webkitEnterFullscreen);

  const clips = [];
  const byEl = new Map();
  let pinSeq = 0; // newest explicit play wins ties inside the cap

  const ce = (tag, cls) => {
    const el = document.createElement(tag);
    el.className = cls;
    return el;
  };

  // ---- per-clip machinery --------------------------------------
  const syncLabel = (c) => {
    const playing = !!(c.video && !c.video.paused);
    c.hit.setAttribute('aria-label', playing
      ? `Pause — ${c.title}` : `Play — ${c.title}${c.durSuffix}`);
  };

  // the tile's source: the textless preview rendition when declared,
  // else the full source (single-source tiles + graceful pre-preview
  // state — the preview files land in a later render wave)
  const tileSrc = (c) => c.preview || c.src;

  // ---- dual-source swap (data-clip-preview) ----------------------
  // Tiles play the textless preview; fullscreen owns the full annotated
  // rendition (the design system bb-clip dual-source rule). The SAME video
  // element is retargeted; currentTime carries across as a PROPORTION
  // of duration — exact for the same-timeline rendition convention, an
  // approximate forward seek for a trimmed preview, 0 when no metadata
  // is resident yet (rationale + the restart-from-0 rejection: the design system).
  const swap = (c, src) => {
    const v = c.video;
    if (!v || !c.preview || c.active === src) return;
    const frac = isFinite(v.duration) && v.duration > 0
      ? v.currentTime / v.duration : 0;
    const wasPlaying = !v.paused;
    c.active = src;
    v.src = src;
    v.addEventListener('loadedmetadata', () => {
      // released or re-swapped while loading: this seek is stale
      if (c.video !== v || c.active !== src) return;
      if (isFinite(v.duration) && v.duration > 0) v.currentTime = frac * v.duration;
    }, { once: true });
    if (wasPlaying) {
      const p = v.play();
      // refusal handling belongs to start(): a paused-by-refusal clip is
      // retried (and downgraded if it refuses again) on the next apply()
      if (p && p.catch) p.catch(() => {});
    }
  };

  const stage = (c) => {
    if (c.video) return c.video;
    const v = document.createElement('video');
    v.muted = true;
    v.setAttribute('muted', '');
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.loop = true;
    v.preload = 'metadata';
    if (c.img && (c.img.currentSrc || c.img.src)) {
      v.poster = c.img.currentSrc || c.img.src; // pre-first-frame stand-in
    }
    c.active = tileSrc(c);
    v.src = c.active;
    v.addEventListener('playing', () => {
      c.box.classList.add('is-live', 'is-playing');
      syncLabel(c);
    });
    v.addEventListener('pause', () => {
      c.box.classList.remove('is-playing');
      syncLabel(c);
    });
    // native controls exist only inside fullscreen (see enterFs); iOS
    // video-only fullscreen ends here, so the tile register — preview
    // source included — is restored in this event, not fullscreenchange
    v.addEventListener('webkitendfullscreen', () => {
      v.removeAttribute('controls');
      swap(c, tileSrc(c));
    });
    // above the poster <img>, below the slot chips + buttons (DOM order)
    c.box.insertBefore(v, c.img ? c.img.nextSibling : c.box.firstChild);
    c.video = v;
    return v;
  };

  const release = (c) => {
    if (c.video) {
      c.video.pause();
      c.video.removeAttribute('src');
      c.video.load(); // detaches network + decoder for good
      c.video.remove();
      c.video = null;
      c.active = null; // re-staging re-derives the tile source
    }
    c.pinned = 0;
    c.out = c.refused = false;
    // the stage band contains the play band, so a stage-exit is by
    // definition outside it — zero the ratio HERE: the two observers
    // deliver in creation order, and apply() running off this exit with
    // playIO's ratio still stale would restage the tile it just released
    c.ratio = 0;
    c.box.classList.remove('is-live', 'is-playing');
    if (auto) c.box.classList.remove('is-cta'); // re-entry gets autoplay again
    syncLabel(c);
  };

  const start = (c) => {
    const v = stage(c);
    if (!v.paused) return;
    const p = v.play();
    if (p && p.catch) {
      p.catch((err) => {
        // only a live, policy-shaped refusal downgrades the tile to the
        // click-to-play register (toggle()'s play() carries the gesture).
        // release() ABORTS a pending play() on purpose — load() rejects
        // it with AbortError — and a stale element's rejection says
        // nothing about the clip's current video (review r1).
        if (c.video !== v || (err && err.name === 'AbortError')) return;
        c.refused = true;
        c.box.classList.add('is-cta');
        syncLabel(c);
      });
    }
  };

  const stop = (c) => {
    if (c.video && !c.video.paused) c.video.pause();
  };

  // ---- the one scheduler: rank candidates, cap the players ------
  // Candidates: explicitly-played tiles (pinned, while any pixel is
  // visible) plus, in the autoplay register, tiles inside the play
  // band that the visitor has not paused. Most-visible MAX_ON play,
  // newest explicit play outranking ratio; everything else pauses.
  // A hidden document has NO candidates (review r2): a backgrounded tab
  // keeps its IO geometry, so without this gate the looping clips would
  // keep playing and downloading behind the visitor's back; the
  // visibilitychange re-apply below resumes them on return.
  const apply = () => {
    const cand = document.hidden ? [] : clips.filter(
      (c) => (c.pinned && c.ratio > 0)
        || (auto && c.autoplay && !c.out && !c.refused && c.ratio >= PLAY_AT));
    cand.sort((a, b) => (b.pinned - a.pinned)
      || (b.ratio - a.ratio) || (a.idx - b.idx));
    const on = new Set(cand.slice(0, MAX_ON));
    for (const c of clips) (on.has(c) ? start : stop)(c);
  };
  document.addEventListener('visibilitychange', () => apply());

  const toggle = (c) => {
    c.refused = false;
    if (c.video && !c.video.paused) {
      // an explicit pause opts the tile out of autoplay until it leaves
      // the stage band (release resets); the glyph returns as the
      // resume affordance
      c.pinned = 0;
      c.out = true;
      c.box.classList.add('is-cta');
      stop(c);
    } else {
      c.out = false;
      c.pinned = ++pinSeq;
    }
    apply();
  };

  const enterFs = (c) => {
    const v = stage(c);
    c.refused = false;
    c.out = false;
    c.pinned = ++pinSeq;
    apply(); // the play() runs inside this click, so the gesture carries
    swap(c, c.src); // fullscreen owns the FULL annotated rendition
    v.setAttribute('controls', ''); // native scrub while fullscreen
    // a FAILED entry must not strand the full rendition in the tile: no
    // exit event will ever fire for it, so roll back — controls off, tile
    // source restored (review r1: the webkitEnterFullscreen throw had only
    // stripped controls). Denial arrives three ways: a rejected promise, a
    // synchronous throw, or — prefixed webkitRequestFullscreen returns
    // undefined — the fullscreenerror EVENT (review r2), parked in fsFail
    // for the document listeners below. The readyState<1 staging step is
    // the ONE deliberate exception: fullscreen follows on the next tap.
    const back = () => {
      if (fsEl() === v) return; // never roll back a LIVE fullscreen view
      v.removeAttribute('controls');
      swap(c, tileSrc(c));
    };
    const req = v.requestFullscreen || v.webkitRequestFullscreen;
    if (req) {
      fsFail = back;
      try {
        const p = req.call(v);
        if (p && p.catch) p.catch(back); // a refused entry stays a tile
      } catch { back(); }
    } else if (v.webkitEnterFullscreen) {
      // iOS video-only fullscreen: WebKit requires BOTH resident metadata
      // and a live user gesture, and a call deferred to loadedmetadata
      // would outlive this tap's transient activation (review r1). So the
      // flow is an explicit two-step: a tap on an unstaged tile plays it
      // in place (apply() above), and the NEXT tap on the affordance —
      // metadata now resident — enters fullscreen inside its own gesture.
      // The autoplay register stages metadata on approach, so there the
      // first tap is already the second step — except on a previewed
      // tile, where the swap above resets metadata: that tap becomes the
      // staging step (full source plays in place, time carried) and the
      // NEXT tap enters fullscreen (the design system dual-source rule).
      if (v.readyState >= 1) {
        try { v.webkitEnterFullscreen(); } catch { back(); }
      } else v.removeAttribute('controls');
    }
  };

  // leaving element fullscreen strips the native controls again and
  // returns every clip to its tile source (the preview, where declared —
  // only a fullscreen entry can have swapped one to the full rendition)
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  let fsFail = null; // the pending entry's event-reported rollback (review r2)
  for (const evt of ['fullscreenchange', 'webkitfullscreenchange']) {
    document.addEventListener(evt, () => {
      fsFail = null; // any change settles the pending attempt
      if (fsEl()) return;
      for (const c of clips) {
        if (!c.video) continue;
        c.video.removeAttribute('controls');
        swap(c, tileSrc(c));
      }
    });
  }
  for (const evt of ['fullscreenerror', 'webkitfullscreenerror']) {
    document.addEventListener(evt, () => {
      const f = fsFail;
      fsFail = null;
      if (f) f();
    });
  }

  // ---- shared observers ------------------------------------------
  let stageIO = null;
  let playIO = null;
  if (hasIO) {
    stageIO = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const c = byEl.get(e.target);
        if (!c) continue;
        // approach staging (autoplay register only: the click-to-play
        // register spends zero video bytes until the visitor clicks);
        // any exit releases src + decoder whatever the register
        if (e.isIntersecting) { if (auto && c.autoplay) stage(c); }
        else release(c);
      }
      apply();
    }, { rootMargin: STAGE });
    playIO = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const c = byEl.get(e.target);
        if (c) c.ratio = e.isIntersecting ? e.intersectionRatio : 0;
      }
      apply();
    }, { threshold: STEPS });
  }

  // ---- upgrade: resting anchor -> component -----------------------
  // The anchor (a complete no-JS experience: a link to the mp4) becomes
  // a passive box; real <button>s carry the interactions — interactive
  // content must never nest inside interactive content.
  const upgrade = (a) => {
    if (!(a instanceof Element) || byEl.has(a) || a.closest('.bb-clip-hit')) return;
    const src = a.getAttribute('data-clip-src') || a.getAttribute('href');
    if (!src) return;
    const title = a.getAttribute('data-clip-title')
      || (a.getAttribute('aria-label') || '').replace(/^Play — /, '') || src;
    const dur = a.getAttribute('data-clip-duration') || '';

    const box = ce('div', a.className);
    box.classList.add('bb-clip');
    while (a.firstChild) box.appendChild(a.firstChild);
    a.replaceWith(box);

    const preview = a.getAttribute('data-clip-preview');
    const c = {
      box,
      img: box.querySelector('img'),
      src: new URL(src, location.href).href,
      preview: preview ? new URL(preview, location.href).href : null,
      active: null, // the src the staged <video> currently targets
      title,
      durSuffix: dur ? ` (${dur})` : '',
      autoplay: a.hasAttribute('data-clip-autoplay'),
      video: null,
      ratio: hasIO ? 0 : 1, // no-IO: clicks must still work
      pinned: 0,
      out: false,
      refused: false,
      idx: clips.length,
      hit: ce('button', 'bb-clip-hit'),
    };
    c.hit.type = 'button';
    box.appendChild(c.hit);
    box.appendChild(ce('span', 'bb-clip-glyph')).setAttribute('aria-hidden', 'true');
    syncLabel(c);
    c.hit.addEventListener('click', () => toggle(c));

    if (a.hasAttribute('data-clip-fullscreen') && fsOK) {
      const fs = ce('button', 'bb-clip-fs');
      fs.type = 'button';
      fs.setAttribute('aria-label', `Fullscreen — ${title}`);
      fs.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"'
        + ' stroke="currentColor" stroke-width="1.5" aria-hidden="true">'
        + '<path d="M5 1H1v4M9 1h4v4M5 13H1V9M9 13h4V9"></path></svg>';
      fs.addEventListener('click', () => enterFs(c));
      box.appendChild(fs);
    }

    if (!auto) box.classList.add('is-cta'); // click-to-play register
    clips.push(c);
    byEl.set(box, c);
    byEl.set(a, c); // guards a double upgrade of the same element
    if (stageIO) { stageIO.observe(box); playIO.observe(box); }
  };

  const init = () => document.querySelectorAll('a[data-clip]').forEach(upgrade);
  if (document.readyState === 'loading') {
    addEventListener('DOMContentLoaded', init);
  } else init();

  // tiny public surface for future pages/panels
  window.bbClip = { upgrade };
})();
