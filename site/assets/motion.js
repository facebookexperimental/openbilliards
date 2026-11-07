// Copyright (c) Meta Platforms, Inc. and affiliates.

// openbilliards brand site — motion layer (v2). No dependencies.
// A hand-rolled rAF engine in the oryzo mould, tuned with values
// state-diffed off oryzo.ai and itsoffbrand.com (see the motion
// spec): 0.3s back-out letter flips @20ms stagger, 0.9s expo-out
// char drops @20ms scrambled stagger, 1.2s inOut evidence reveals,
// 0.6s hairline draws, 0.9s quart-out count-ups, linear scroll
// scrubs. Laws: transform/opacity/clip only; native scroll; the
// whole file is a no-op under prefers-reduced-motion (final states
// are the markup's resting states — nothing is hidden without us).
// site.js keeps its four jobs; this file only adds choreography.
// v3 adds the break-record scrub act (canvas frame sequence driven
// by the shared scroll-job registry; the design system Motion "Scrub act").
(() => {
  'use strict';
  const html = document.documentElement;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches
    || !('IntersectionObserver' in window)) return;
  html.classList.add('motion');

  const ce = (cls, txt) => {
    const s = document.createElement('span');
    s.className = cls;
    if (txt !== undefined) s.textContent = txt;
    return s;
  };

  // ---- letter splitter ---------------------------------------
  // Real text stays for AT: the element keeps its full string as
  // aria-label and the split copy lives in ONE aria-hidden span
  // (the offbrand data-split pattern). Non-text children (<wbr>)
  // and whitespace survive untouched; `mk` builds each glyph.
  const split = (el, mk) => {
    // innerText, not textContent: a <br> must survive as a space in
    // the accessible name ("THE BREAK, IN…", not "BREAK,IN…")
    el.setAttribute('aria-label', (el.innerText || el.textContent).replace(/\s+/g, ' ').trim());
    const box = document.createElement('span');
    box.setAttribute('aria-hidden', 'true');
    while (el.firstChild) box.appendChild(el.firstChild);
    el.appendChild(box);
    const glyphs = [];
    // consecutive glyphs are grouped into .seg word segments —
    // bare inline-block glyph wrappers would otherwise create a
    // line-break opportunity after EVERY letter, so narrow
    // viewports could wrap "OPENBILLIARD / S" instead of at the
    // markup's <wbr>/spaces (360px audit catch).
    const walk = (node) => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          let seg = null;
          for (const ch of n.nodeValue) {
            if (/\s/.test(ch)) { seg = null; frag.appendChild(document.createTextNode(ch)); continue; }
            // han/kana wrap per character, so each opens its own
            // segment (trailing punctuation 、。」 glues to the char
            // before it) — otherwise splitting a zh/ja heading would
            // weld a whole clause into one unbreakable seg. Hangul is
            // excluded on purpose: ko breaks at spaces (keep-all).
            if (!seg || (/[⺀-ヿ㐀-鿿豈-﫿＀-￯]/.test(ch)
              && !/[、。・！），：；？」』]/.test(ch))) {
              seg = ce('seg'); frag.appendChild(seg);
            }
            const g = mk(ch, glyphs.length);
            glyphs.push(g);
            seg.appendChild(g.wrap);
          }
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      }
    };
    walk(box);
    return glyphs;
  };

  // deterministic shuffle (oryzo's "fixed random permutation")
  let seed = 42;
  const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const shuffled = (n) => {
    const a = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) {
      const k = Math.floor(rnd() * (i + 1));
      [a[i], a[k]] = [a[k], a[i]];
    }
    return a;
  };

  // one drop glyph: .lk(clip) > .lk-i(drops in from -101%). Shared
  // by the hero lockup and the section displays below.
  const mkDrop = (ch) => {
    const inner = ce('lk-i', ch);
    const wrap = ce('lk');
    wrap.appendChild(inner);
    return { wrap, inner };
  };
  // scrambled 20ms stagger onto a split's glyphs, from `base` ms
  const scramble = (glyphs, base) => {
    shuffled(glyphs.length).forEach((gi, k) => {
      glyphs[gi].inner.style.setProperty('--d', `${base + k * 20}ms`);
    });
  };

  // ---- 1 HOVER · nav letter flipper ---------------------------
  // .fl(clip) > .fl-i > [glyph, .fl-d duplicate at top:100%].
  // CSS rolls the inner to -100% on hover (0.3s back-out, 20ms
  // stagger L→R in, R→L out); JS only wraps, once.
  document.querySelectorAll('.bb-nav a:not(.bb-pill)').forEach((a) => {
    if (!a.textContent.trim()) return;
    const glyphs = split(a, (ch, i) => {
      const inner = ce('fl-i', ch);
      inner.appendChild(ce('fl-d', ch));
      inner.style.setProperty('--i', i);
      const wrap = ce('fl');
      wrap.appendChild(inner);
      return { wrap, inner };
    });
    a.style.setProperty('--n', glyphs.length);
    a.classList.add('bb-flip');
  });

  // ---- shared once-only observer (draw-ins, imagery, counts) --
  const jobs = new WeakMap(); // element -> () => void
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const job = jobs.get(e.target);
      job ? job() : e.target.classList.add('in');
    }
  }, { threshold: 0.1, rootMargin: '0px 0px -8% 0px' });

  // imagery settles 1.05 → 1.0 on entry
  document.querySelectorAll('.band-figure, .strip').forEach((el) => io.observe(el));

  // dashed hairlines draw in. Chrome factors the target's OWN
  // clip-path into IO geometry, so the fully-clipped resting hr
  // would never intersect — each rule is watched through its thin
  // wrapper div (every hr.bb-rule ships in a dedicated wrapper).
  document.querySelectorAll('hr.bb-rule').forEach((el) => {
    const w = el.parentElement;
    jobs.set(w, () => el.classList.add('in'));
    io.observe(w);
  });

  // ---- 2 ENTRANCE · section display letter drop -----------------
  // The hero move extended to the index band displays and the guide
  // page headings (the design system: display headlines "additionally
  // letter-rise"): the same split/clip machinery, 0.9s expo drop,
  // scrambled 20ms stagger — but held (.lk-hold keeps the animation
  // paused at t=0, glyphs parked above the clip) and released when
  // the shared once-observer marks the heading .in on ENTRY. The
  // letters carry the entrance, so the block reveal comes off.
  document.querySelectorAll('.band-display, h1.bb-display').forEach((el) => {
    el.classList.remove('bb-reveal', 'bb-d1');
    scramble(split(el, mkDrop), 0);
    el.classList.add('lk-hold');
    io.observe(el);
  });

  // ---- 2 ENTRANCE · count-up evidence values -------------------
  // 0.9s quart-out from 0 to the printed value. The REAL string
  // stays in the DOM twice over: visually-hidden for AT, and as
  // the visible resting text until the moment the tween starts —
  // print/never-scrolled/AT all read the true number. Digits glued
  // to identifiers (X86_64, SC-005) stay still; only free-standing
  // quantities count.
  const NUM = /\d[\d,]*(?:\.\d+)?/g;
  document.querySelectorAll('.claim-v, .spec-v').forEach((el) => {
    const text = el.textContent;
    const parts = []; // strings | {n, dec, grp}
    let last = 0, m;
    while ((m = NUM.exec(text))) {
      if (/[\w.-]/.test(text[m.index - 1] || '')) continue;
      const raw = m[0];
      parts.push(text.slice(last, m.index), {
        n: parseFloat(raw.replace(/,/g, '')),
        dec: (raw.split('.')[1] || '').length,
        grp: raw.includes(','),
      });
      last = m.index + raw.length;
    }
    if (!parts.some((p) => typeof p === 'object')) return;
    parts.push(text.slice(last));

    const cnt = ce('cnt', text);
    cnt.setAttribute('aria-hidden', 'true');
    const real = ce('bb-visually-hidden', text);
    el.textContent = '';
    el.append(real, cnt);

    jobs.set(el, () => {
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / 900);
        const e = 1 - (1 - p) ** 4; // quart-out
        cnt.textContent = parts.map((part) => {
          if (typeof part === 'string') return part;
          let s = (part.n * e).toFixed(part.dec);
          if (part.grp) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
          return s;
        }).join('');
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    io.observe(el);
  });

  // ---- shared scroll plumbing (ONE listener — the design system ruling 7) --
  // Scroll choreography registers a JOB here: a pure function of
  // scrollY, run rAF-batched off one passive listener. The hero exit
  // scrub and the break-record scrub are both jobs — one motion
  // system, one listener, values hold at any rest position.
  const scrollJobs = [];
  let scrollTicking = false;
  const runScrollJobs = () => {
    scrollTicking = false;
    for (const job of scrollJobs) job();
  };
  const queueScroll = () => {
    if (!scrollTicking) { scrollTicking = true; requestAnimationFrame(runScrollJobs); }
  };
  const addScrollJob = (job) => {
    if (!scrollJobs.length) {
      addEventListener('scroll', queueScroll, { passive: true });
      addEventListener('resize', queueScroll, { passive: true });
    }
    scrollJobs.push(job);
    job();
  };

  // ---- 2+3 · index hero: letter drop, then scroll scrub --------
  // Guide/docs pages have no .hero-media, so everything below is
  // index-only — reading surfaces get no scroll choreography.
  const hero = document.querySelector('.bb-hero-100vh');
  const media = document.querySelector('.hero-media');
  const lockup = document.querySelector('.hero-lockup');
  if (hero && media && lockup) {
    html.classList.add('scrub');

    // ENTRANCE: chars drop from -101% inside clip wrappers, 0.9s
    // expo-out, 20ms scrambled stagger (offbrand hero measurement).
    // The letters carry the h1's entrance, so the block-level
    // reveal comes off (its inline transform would fight the scrub
    // writes below anyway).
    lockup.classList.remove('bb-reveal', 'bb-d1', 'bb-d2', 'bb-d3');
    scramble(split(lockup, mkDrop), 120);

    // SCRUB: pure linear functions of scrollY — values hold at any
    // rest position (the scrub signature from the spec). Lockup
    // lags the page 0.15x (rises at 0.85x, the oryzo hero-exit
    // grammar), shrinks to 0.95 and fades out by the band edge —
    // opacity on (1-t)^2 so it front-loads and the wordmark is
    // mostly gone before it slides under the nav band; the hero
    // render drifts +6% (parallax, pre-scaled so edges never
    // show); the header goes floating past a QUARTER viewport so
    // its scrim arrives before the lockup reaches it.
    const video = media.querySelector('video');
    const nav = document.querySelector('.bb-nav');
    const apply = () => {
      const y = scrollY;
      const edge = (hero.offsetHeight || innerHeight) * 0.9;
      const t = Math.min(1, Math.max(0, y / edge));
      lockup.style.transform =
        `translate3d(0, ${(Math.min(y, edge) * 0.15).toFixed(1)}px, 0) scale(${(1 - 0.05 * t).toFixed(4)})`;
      lockup.style.opacity = ((1 - t) ** 2).toFixed(3);
      if (video) {
        video.style.transform = `translate3d(0, ${(t * 6).toFixed(2)}%, 0) scale(1.13)`;
      }
      if (nav) nav.classList.toggle('is-float', y > innerHeight * 0.25);
    };
    addScrollJob(apply);
  }

  // ---- 3 SCROLL-DRIVEN · the break-record scrub act -------------
  // (index-only; markup in index.html, styles in break.css, grammar
  // in the design system Motion "Scrub act".) The act's resting markup is the
  // complete fallback — everything below is enhancement. Data comes
  // from the frozen manifest contract at assets/break-scrub/
  // manifest.json, fetched relative to the page so any mount path
  // works. Hide semantics (the design system): only a CONFIRMED absent or
  // malformed manifest hides the act (the site ships complete before
  // the assets land); a network-layer fetch failure — file:// origins
  // block fetch, or the visitor is offline — proves nothing about the
  // manifest, so the resting poster + text timeline stays, exactly
  // what no-JS/reduced-motion readers keep.
  const act = document.querySelector('.break-act');
  if (act && typeof fetch === 'function') {
    const MDIR = 'assets/break-scrub/';
    const valid = (m) => !!m && m.version === 1
      && Number.isInteger(m.frameCount) && m.frameCount > 1
      && Array.isArray(m.frameTimes) && m.frameTimes.length === m.frameCount
      && !!m.desktop && !!m.desktop.dir && !!m.desktop.pattern
      && !!m.mobile && !!m.mobile.dir && !!m.mobile.pattern;

    const boot = (m) => {
      // variant is chosen once at boot. Decision (documented in
      // the design system): mobile gets the REAL scrub on the manifest's
      // smaller sequence — no auto-advancing degrade; a mid-session
      // resize keeps the booted variant rather than reloading frames.
      const v = matchMedia('(max-width: 768px)').matches ? m.mobile : m.desktop;
      const n = m.frameCount;
      const times = m.frameTimes;
      const T = times[n - 1] > 0 ? times[n - 1] : 1;

      // -- progress → record-time map: STRICT LINEAR (identity) ----
      // Product-owner ruling 2026-07-08 (third round of real-user
      // scrub-feel feedback; supersedes the dwell design): the scrubbed
      // video is hypersensitive to smoothness, so scroll and record
      // time are bound 1:1 — u(p) = p, du/dp constant and NEVER zero.
      // No holds, no plateaus, no dwells: any scroll input at any
      // position moves the picture immediately. The cured defect:
      // parking at a beat, scroll produced nothing, then further scroll
      // made the video LEAP forward (the plateau-exit symptom). Beat
      // emphasis is carried ONLY by the shipped non-uniform frame
      // density (1-2 ms spacing at beats — naturally silkiest exactly
      // there under a linear map) and the tick-ignition treatment on
      // the rail. manifest beats stay as rail markers + caption anchors;
      // their hold field is 0 by contract (break-scrub-verify.mjs gates
      // holds === 0), so nothing here reads it.
      // frameTimes are non-uniform (denser at beats): nearest frame
      // for a record time comes from a binary search, never a scan.
      const nearestFrame = (t) => {
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (times[mid] <= t) lo = mid; else hi = mid;
        }
        return t - times[lo] <= times[hi] - t ? lo : hi;
      };

      // -- stage DOM ------------------------------------------------
      const rail = act.querySelector('.break-rail');
      const playhead = act.querySelector('.break-playhead');
      const caption = act.querySelector('.break-caption');
      const prov = act.querySelector('.break-prov');
      const canvas = act.querySelector('.break-canvas');
      const box = act.querySelector('.break-canvas-box');
      const stage = act.querySelector('.break-stage');
      const head = act.querySelector('.break-head');
      const h2 = act.querySelector('.break-head h2');
      const lede = act.querySelector('.break-lede');
      const shade = act.querySelector('.break-shade');
      // the lede is scrub-driven once live: its entrance-reveal transition
      // would smooth (and so lag) the scroll job's opacity writes — same
      // ruling as the hero lockup, whose reveal classes come off because
      // inline transitions must never fight scrub writes.
      if (lede) lede.classList.remove('bb-reveal', 'bb-d2');
      if (!rail || !playhead || !caption || !canvas || !box || !stage) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const evs = (m.events || [])
        .filter((ev) => !!ev && typeof ev.t === 'number' && ev.t >= 0)
        .map((ev) => ({
          t: ev.t, // the record's printed time (labels, AT timeline)
          // FIRING time = the event frame's time: t is ms-rounded by the
          // producer, so it can disagree with the frame the visitor is
          // actually looking at. Igniting at the frame's own time keeps
          // tick + caption aligned with the pixels (manifest contract:
          // ev.frame is the nearest frame to ev.t).
          fire: Number.isInteger(ev.frame) && ev.frame >= 0 && ev.frame < n
            ? times[ev.frame] : Math.min(ev.t, T),
          kind: String(ev.kind || ''), label: String(ev.label || ''),
        }))
        .sort((a, b) => a.fire - b.fire || a.t - b.t);
      // simultaneous events (equal fire time — several kernel events on
      // one frame) collapse into ONE mark: a single, slightly taller tick
      // and a joined caption. One frame gets one caption, and it must
      // name everything that fires there, not just the last event passed
      // (round 1: BallBall + Airborne shared a frame and the contact
      // caption was unreachable). The AT timeline keeps every event.
      const marks = [];
      for (const ev of evs) {
        const prev = marks[marks.length - 1];
        if (prev && Math.abs(ev.fire - prev.fire) <= 1e-9) {
          prev.kinds.push(ev.kind); prev.labels.push(ev.label);
        } else {
          // mk.t = the record's printed time: the caption prints it beside
          // the running clock so a passed event never poses as current
          // (taste round 2: a stale 'ball 6' line sat under a t +2.8 s
          // clock for 44% of the scrub, a false time-event pairing)
          marks.push({ fire: ev.fire, t: ev.t, kinds: [ev.kind], labels: [ev.label], el: null });
        }
      }
      for (const mk of marks) {
        mk.el = ce(mk.kinds.length > 1 ? 'break-tick break-tick--multi' : 'break-tick');
        // linear map: a tick's rail fraction IS its record-time fraction
        mk.el.style.left = `${(mk.fire / T * 100).toFixed(3)}%`;
        rail.appendChild(mk.el);
      }
      // record provenance, read straight off the record. The RECORD prefix
      // speaks label caps; the data run (duration · frames · kernel stamp)
      // stays verbatim in mono — an uppercase 'S' is siemens, not seconds,
      // and the kernel hash is lowercase hex (round 1; break.css
      // .break-prov-data sets text-transform: none).
      if (prov) {
        prov.textContent = 'Record — ';
        prov.appendChild(ce('break-prov-data',
          `${T.toFixed(2)} s · ${n} frames`
          + (typeof m.kernel === 'string' && m.kernel ? ` · kernel ${m.kernel}` : '')));
      }
      // the (visually-hidden-when-live) fallback list is rebuilt from the
      // fetched manifest's events — the static markup already BAKES this
      // exact timeline from the frozen manifest (index.html, taste round
      // 3), so against the sealed contract this is a no-op verification;
      // textContent only, manifest is data
      const list = act.querySelector('.break-events');
      if (list && evs.length) {
        list.textContent = '';
        for (const ev of evs) {
          const li = document.createElement('li');
          li.append(ce('break-ev-kind', ev.kind), ce('', `t +${ev.t.toFixed(3)} s · ${ev.label}`));
          list.appendChild(li);
        }
      }
      const capT = ce('break-t');
      const capE = ce('break-ev');
      caption.append(capT, capE);

      // -- decoded-image cache -------------------------------------
      // Scrub never blocks on the network: an unready target frame
      // draws its nearest decoded neighbor and jumps the load queue.
      let want = 0, drawn = -1, decoded = 0;
      const src = (i) => MDIR + v.dir + '/'
        + v.pattern.replace(/#+/, (h) => String(i).padStart(h.length, '0'));
      const frames = new Array(n);
      const load = (i) => {
        if (frames[i]) return frames[i].done;
        const img = new Image();
        img.decoding = 'async';
        img.src = src(i);
        const f = { img, ready: false, done: null };
        f.done = (img.decode ? img.decode() : Promise.resolve())
          // a decode landing while a stand-in is on canvas redraws now:
          // a first-pass backlog converges between scroll events
          .then(() => { f.ready = true; decoded++; if (drawn !== want) draw(); })
          .catch(() => {}); // a missing frame is a hole; neighbors cover it
        frames[i] = f;
        return f.done;
      };
      const nearestReady = (i) => {
        for (let d = 0; d < n; d++) {
          if (frames[i - d] && frames[i - d].ready) return i - d;
          if (frames[i + d] && frames[i + d].ready) return i + d;
        }
        return -1;
      };

      // -- canvas (cover-fit draw at device pixels, dpr capped 2) ---
      // Vertical crop anchor. At wide stage aspects the cover fit crops
      // the 16:9 source top-and-bottom, and a plain center crop bisects
      // low beat-frame balls: at the 3.2:1 cap the centered band bottom
      // (y 0.778) crosses ball 1 — y 0.723-0.798 at the apex, 0.702-0.770
      // at the land beat — and land-beat ball 7 (y 0.720-0.791), measured
      // on the issue-#20 seed-19 record's pixel silhouettes.
      // Retune 2026-07 (high-speed reshoot): the anchor is now a pure
      // function of stage aspect ALONE — the reshoot's terminal frame is
      // a deliberate mid-spread freeze (silhouettes park at y 0.436-0.791
      // on the issue-#20 seed-19 record), so the old record-time ease
      // toward a deeper rest band has nothing left to clear;
      // constant-in-time won. The
      // visible band's BOTTOM pins at CROP_B once the cover fit starts
      // cropping (plain centered until ~2.58:1, where CROP_B - h/2
      // meets 0.5): re-derived on measured pixel silhouettes of all
      // five beat frames + the last 10 frames (retune lane; re-measured
      // on the issue-#20 seed-19 reshoot) — valid band-bottom
      // interval 0.813-0.863 over the whole 16:9→3.2:1 aspect
      // continuum at a 10px source margin; 0.845 balances the pinch,
      // >=26px margin to every ball edge at every aspect. Smooth in
      // aspect, constant in record time: no pop on resize, no step
      // while scrubbing, and a neighbor frame drawn during a fast
      // scrub shares the exact same crop by construction.
      const CROP_B = 0.845;
      // Horizontal twin (fix round 2): below 16:9 the cover fit crops x,
      // and the old plain-centered x-crop bisected beat-frame balls (the
      // 8-ball at a 1.27:1 stage, the 4-ball on mobile portrait — both
      // at the RIGHT edge). The seed-4 record's apex ball 5 ran to
      // x 0.990 of source width — no interior right anchor cleared it —
      // so the visible band's RIGHT edge pins
      // at the source's own right edge (CROP_X = 1): every x-crop comes
      // off the LEFT. The issue-#20 seed-19 reshoot re-measures x 0.957
      // (apex ball 5) on the right and x 0.174 (terminal ball 7) on the
      // left — the right pin stays (the simplest law, >=69px clear) and
      // a ball the SOURCE edge ever cut would be cut
      // identically at every aspect — the crop never adds a cut. The
      // left edge may sweep only to CROP_X - ASPECT_MIN/(16/9) = 0.10
      // (>=10px source margin to every silhouette, same law as y);
      // below ASPECT_MIN, measure() caps the canvas-box height so the
      // fit never crops deeper — the narrow twin of the 3.2:1 stage
      // cap. Both bands are gated by tools/render/break-scrub-verify.mjs
      // against the producer's framing.json seed boxes.
      const CROP_X = 1;
      const ASPECT_MIN = 1.6;
      let cw = 0, chh = 0, railW = 0, actTop = 0, actRange = 1;
      const draw = () => {
        const f = frames[want] && frames[want].ready ? want : nearestReady(want);
        if (f < 0 || f === drawn) return;
        const img = frames[f].img;
        const s = Math.max(cw / img.naturalWidth, chh / img.naturalHeight);
        const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
        const h = Math.min(1, chh / dh); // visible fraction of source height
        const c = Math.max(0.5, CROP_B - h / 2); // y band-center fraction
        const w = Math.min(1, cw / dw); // visible fraction of source width
        const cx = Math.max(0.5, CROP_X - w / 2); // x band-center fraction
        // band center (cx, c) of the source lands on the canvas center;
        // each axis stays plain centered until its cover overflow begins,
        // then pins its anchored edge (bottom at CROP_B, right at CROP_X)
        ctx.drawImage(img, cw / 2 - cx * dw, chh / 2 - c * dh, dw, dh);
        // the first pixels retire the poster underlay for good (fix
        // round 2): at fractional rest offsets the browser's sub-pixel
        // snapping can expose ~1 row of box background under the canvas
        // bitmap, and the poster's red 3-ball painted a sliver there
        // that read exactly like a ball bisected by the crop. Slate
        // stays; the poster was only the pre-first-decode stand-in.
        if (drawn < 0) box.style.backgroundImage = 'none';
        drawn = f;
      };

      // -- the scroll job: a pure function of scrollY ---------------
      // Head yield (round 1: the pinned head never gave the record the
      // stage): over the first YIELD_P of progress the lede fades/rises
      // out and the display headline steps down to the heading-s scale,
      // handing the pin to the canvas. Transform/opacity only; the
      // stage's enlarged layout is reserved once per resize in
      // measure(), never per frame. 0.05 re-derived for the strict-
      // linear map (the strike hold it used to track is gone): the
      // record's pre-contact run-up spans p 0 → ~0.079 (t 0.1146 s of
      // 1.45 s), so a 0.05 yield still completes before first contact,
      // over ~32vh of scroll at the 750vh act.
      const YIELD_P = 0.05;
      const headS = parseFloat(getComputedStyle(html)
        .getPropertyValue('--bb-t-h-s')) || 26;
      let litCount = -1, yieldK = -1, h2Ratio = 1, provK0 = 0.95;
      let prevP = 0;
      const job = () => {
        const p = Math.min(1, Math.max(0, (scrollY - actTop) / actRange));
        if (p !== prevP) { dirHint = p > prevP ? 1 : -1; prevP = p; }
        const t = p * T; // u = p: the strict 1:1 binding (ruling 2026-07-08)
        want = nearestFrame(t);
        if (!frames[want]) load(want); // jump the trickle queue
        draw();
        // the playhead rides the SAME linear clock as the frames: its
        // rail fraction IS p, so rail and canvas can never disagree and
        // no indicator ever claims motion the record doesn't show.
        playhead.style.transform = `translate3d(${(p * railW).toFixed(1)}px, 0, 0)`;
        capT.textContent = `t +${t.toFixed(3)} s`;
        const k = Math.min(1, p / YIELD_P);
        if (k !== yieldK) {
          yieldK = k;
          if (h2) h2.style.transform = `scale(${(1 - (1 - h2Ratio) * k).toFixed(4)})`;
          if (lede) {
            lede.style.opacity = ((1 - k) ** 2).toFixed(3);
            lede.style.transform = `translate3d(0, ${(-14 * k).toFixed(1)}px, 0)`;
            // a faded lede must not keep clickable/focusable citations
            lede.style.visibility = k >= 1 ? 'hidden' : '';
          }
          if (shade) shade.style.opacity = (1 - k).toFixed(3);
          // the provenance plate arrives only once the descending headline
          // has geometrically CLEARED it (provK0, a resize-time constant
          // from measure()) — round 2: a linear-in-k ramp faded the plate
          // in underneath the still-overlapping h2 glyphs mid-choreography
          if (prov) {
            prov.style.opacity = Math.max(0, (k - provK0) / (1 - provK0)).toFixed(3);
          }
        }
        let lit = 0;
        // ignition slack, re-derived for the strict-linear map (simpler
        // now — one error source): scroll positions quantize to whole
        // pixels while actTop is fractional, so a visitor parked hard at
        // the act's end can sit up to ~1px short of p=1 — the terminal
        // frame still draws (nearest-frame) but the Rest mark sat unlit
        // over a stale caption (retune find, ultrawide self-test). One
        // scroll pixel converts to record time at the map's ONE constant
        // rate, du/dp = 1, i.e. T/actRange — there is no steeper segment
        // any more. ≈ 0.25 ms at typical ranges, well under the 1.1 ms
        // densest frame spacing, so no tick can ignite a whole frame
        // early; tick POSITIONS stay exact. (The old 1e-9 u-round-trip
        // term is kept: t = p·T still quantizes through doubles.)
        const slack = T / actRange + 1e-9;
        while (lit < marks.length && marks[lit].fire <= t + slack) lit++;
        if (lit !== litCount) {
          litCount = lit;
          marks.forEach((mk, i) => {
            mk.el.classList.toggle('lit', i < lit);
            mk.el.classList.toggle('now', i === lit - 1);
          });
          // the event speaks with its OWN printed record time next to the
          // running clock — between events the line reads as history
          // ("clock at t+2.8, last event fired at t+0.774"), never as a
          // false current pairing (taste round 2)
          const mk = marks[lit - 1];
          capE.textContent = lit > 0
            ? ` · ${mk.kinds.join(' + ')} t +${mk.t.toFixed(3)} s — ${mk.labels.join(' · ')}`
            : ' · scroll to scrub the record';
        }
        // read-only state for the headless self-test harness (pv = the
        // playhead's rail fraction — identical to p under the strict-
        // linear map, kept as its own field so traces assert the
        // 1:1 binding directly; ready = decoded frame count)
        window.__bbBreak = { p, t, pv: p, frame: want, drawn, lit, frames: n, ready: decoded };
      };
      // geometry cache: reads happen here (resize-driven), never in
      // the per-scroll job — the job must not force layout.
      const measure = () => {
        const r = act.getBoundingClientRect();
        actTop = r.top + scrollY;
        actRange = Math.max(1, act.offsetHeight - innerHeight);
        // head-yield geometry: the compact head = marker + margins + the
        // headline at heading-s scale. The stage borrows the difference
        // through a negative margin (its layout box slides up under the
        // head, z-below it), so .break-canvas-box holds ≥55-60svh of the
        // pin; at p=0 the full-size head overlays the canvas top behind
        // the .break-shade scrim, then yields in the scroll job above.
        if (head && h2) {
          const fs = parseFloat(getComputedStyle(h2).fontSize);
          h2Ratio = fs > 0 ? Math.min(1, headS / fs) : 1;
          const compact = h2.offsetTop + h2.offsetHeight * h2Ratio + 12;
          const delta = Math.max(0, Math.round(head.offsetHeight - compact));
          stage.style.marginTop = `calc(4vh - ${delta}px)`;
          // provenance-plate gate (round 2): find the yield fraction at
          // which the scaling h2's visual bottom clears the plate top by
          // 6px — transform-origin is left top, so the untransformed
          // bottom shrinks by h2Height·(1-ratio)·k. Rects are read with
          // the transform lifted (both boxes share the pin's coordinate
          // space, and the margin set above is already applied).
          if (prov) {
            const tf = h2.style.transform;
            h2.style.transform = 'none';
            const hb = h2.getBoundingClientRect();
            const pb = prov.getBoundingClientRect();
            h2.style.transform = tf;
            const shrink = hb.height * (1 - h2Ratio);
            provK0 = shrink > 0
              ? Math.min(0.95, Math.max(0, (hb.bottom + 6 - pb.top) / shrink))
              : 0;
          }
          yieldK = -1; // ratio may have changed: re-apply the yield writes
        }
        // cover-crop guard: past ~3.7:1 NO vertical band of the 16:9
        // source clears the hop-apex frame — f0086's silhouettes span
        // y 0.319 (ball 4 on the far cushion) to 0.798 (ball 1),
        // needing >=0.48 of source height, so any deeper crop bisects
        // one or the other no matter where the anchor sits (measured on
        // the issue-#20 seed-19 reshoot's pixel silhouettes; at 21:9
        // the flex-filled box would hit 5.7:1).
        // Cap the aspect of the whole
        // STAGE at 3.2:1 (>=26px source margin) — canvas + rail + caption
        // move as one width unit, centered (break.css align-self), so
        // the ticks and captions always sit on the image they annotate
        // instead of spanning gutter-to-gutter around a pillarboxed box
        // (round 1). Height is flex-driven, independent of width.
        stage.style.width = '';
        box.style.maxHeight = '';
        const bh = box.getBoundingClientRect().height;
        const wMax = Math.round(bh * 3.2);
        if (stage.clientWidth > wMax) stage.style.width = `${wMax}px`;
        // narrow twin of that cap (fix round 2): below ASPECT_MIN the
        // cover fit would crop x past the measured safe band (the left
        // edge would cross the terminal 4-ball), so the BOX height caps
        // to hold the canvas at the floor aspect — the stage FRAMES the
        // record instead of slicing it. Rail + caption stay attached
        // under the image (flex order); the freed pin space collects at
        // the stage's foot the way the wide cap's gutters collect at
        // its sides. Mobile portrait (the frames-m variant) takes this
        // path at every phone width.
        const hMax = Math.round(box.getBoundingClientRect().width / ASPECT_MIN);
        if (box.getBoundingClientRect().height > hMax) {
          box.style.maxHeight = `${hMax}px`;
        }
        railW = rail.clientWidth;
        const dpr = Math.min(2, devicePixelRatio || 1);
        const b = box.getBoundingClientRect();
        const w = Math.max(1, Math.round(b.width * dpr));
        const h = Math.max(1, Math.round(b.height * dpr));
        if (w !== cw || h !== chh) { cw = canvas.width = w; chh = canvas.height = h; drawn = -1; }
        job();
      };

      // -- progressive load: poster + first ~16 frames on approach,
      // the rest trickled on idle. Nothing blocks the scroll path.
      // Scrub-feel fix 2026-07 (measured, 25 Mbps first visit): the old
      // single-stream head-to-tail trickle was RTT-bound (~30 frames/s
      // from frame 0 up), so a first-pass scrub ran on nearest-decoded
      // stand-ins (mean lag 7 frames, max 34, half of all wheel steps
      // > 2 frames behind). Now every pick re-aims at the CURRENT wanted
      // frame — nearest unrequested, scroll direction first, growing the
      // decode window AROUND the visitor — over STREAMS parallel chains
      // (six: the HTTP/1.1 per-host cap; four measured ~90 frames/s,
      // under the flurry's ~130/s consumption). A chain continues
      // back-to-back while the canvas visibly shows a stand-in and
      // idles (timed out, so a continuous scrub can't starve it) once
      // caught up — fetching IS the scroll path exactly when the drawn
      // frame is wrong. Unready frames still draw their nearest decoded
      // neighbor, unchanged; EAGER stays 16 (the first 16 frames cover
      // the pre-contact run-up — ~0.4 screens of scroll under the
      // linear map — and the want-centered trickle grows from there).
      const EAGER = Math.min(16, n);
      const STREAMS = 6;
      let started = false, dirHint = 1;
      const start = () => {
        if (started) return;
        started = true;
        if (typeof m.poster === 'string' && m.poster) {
          new Image().src = MDIR + m.poster;
        }
        for (let i = 0; i < EAGER; i++) load(i);
        const idle = window.requestIdleCallback
          ? (fn) => requestIdleCallback(fn, { timeout: 150 })
          : (fn) => setTimeout(fn, 120);
        // aim a few frames AHEAD of wanted in the travel direction: a
        // fetch lands ~1 RTT after aiming, and by then a moving scrub
        // has left a want-aimed window trailed by its own in-flight
        // latency (measured: 5-9 frames behind through the settle tail)
        const pick = () => {
          const aim = Math.max(0, Math.min(n - 1, want + dirHint * 8));
          for (let d = 0; d < n; d++) {
            const a = aim + dirHint * d, b = aim - dirHint * d;
            if (a >= 0 && a < n && !frames[a]) return a;
            if (b >= 0 && b < n && !frames[b]) return b;
          }
          return -1;
        };
        const trickle = () => {
          const i = pick();
          if (i < 0) return;
          // back-to-back while the pick is still NEAR the visitor (the
          // decode frontier hugs them — a parked visitor pre-fills
          // their own exit burst) or a stand-in is on canvas; idle-paced
          // beyond that
          const hot = Math.abs(i - want) < 24 || drawn !== want;
          load(i).then(() => (hot ? trickle() : idle(trickle)));
        };
        for (let s = 0; s < STREAMS; s++) idle(trickle);
      };
      const approach = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { start(); approach.disconnect(); }
      }, { rootMargin: '100% 0px 100% 0px' });
      approach.observe(act);

      // -- go live: 750vh act, sticky pin, one registered job -------
      // the lede's scroll imperative is true ONLY from here on: resting
      // markup reads a state-neutral opening sentence, because for no-JS /
      // reduced-motion / file:// visitors scrolling scrubs nothing and the
      // resting act IS the complete experience (round 2 fallback honesty —
      // the act's first line must not promise an absent interaction).
      const lead = act.querySelector('.break-lede-lead');
      if (lead) lead.textContent = 'Scroll to scrub one recorded break.';
      act.classList.add('is-live');
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(measure);
        ro.observe(box);
        ro.observe(document.documentElement); // reflow above moves actTop
      } else {
        addEventListener('resize', measure, { passive: true });
      }
      addScrollJob(job);
      measure();
    };

    fetch(MDIR + 'manifest.json')
      .then((r) => {
        // hide ONLY on confirmed absence/malformation (the design system sanctions
        // `hidden` for "manifest absent or malformed" — pre-assets, the act
        // simply is not there). A network-layer rejection lands in the
        // catch below instead: fetch is CORS-blocked on file:// origins and
        // fails offline, neither of which proves anything about the
        // manifest — those visitors keep the complete resting fallback.
        if (!r.ok) { act.hidden = true; return; }
        return r.json().then(
          (m) => { if (valid(m)) boot(m); else act.hidden = true; },
          () => { act.hidden = true; }); // JSON parse failure = malformed
      })
      .catch(() => {}); // network layer: the resting act stands
  }
})();
