// Copyright (c) Meta Platforms, Inc. and affiliates.

// openbilliards brand site — the only script. No dependencies.
// Does four small jobs: scroll reveals, current-nav marking,
// mobile nav toggle, guide language switching. Everything works
// without it (reveals only hide under html.js), so file:// with
// scripts blocked still renders the full page.
(() => {
  'use strict';
  const html = document.documentElement;
  html.classList.add('js');

  // ---- scroll reveals (rise 24px + fade, once) --------------
  const reveals = document.querySelectorAll('.bb-reveal');
  const instant = matchMedia('(prefers-reduced-motion: reduce)').matches
    || !('IntersectionObserver' in window);
  if (instant) {
    reveals.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }, { threshold: 0.1, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach((el) => io.observe(el));
  }
  // Keyboard focus must never land in a hidden reveal: reveal the
  // focused element's whole .bb-reveal immediately (WCAG 2.4.7).
  // Belt-and-braces with the :focus-within rule in site.css.
  addEventListener('focusin', (e) => {
    if (e.target instanceof Element) {
      e.target.closest('.bb-reveal')?.classList.add('in');
    }
  });

  // ---- current-nav marking -----------------------------------
  // Marks the nav link whose target is (or contains) this page.
  // Works from file:// and any mount path because it compares
  // RESOLVED pathnames, normalizing ".../index.html" ≡ ".../".
  const norm = (p) => decodeURIComponent(p).replace(/index\.html$/, '');
  const here = norm(location.pathname);
  document.querySelectorAll('.bb-nav a[href]:not(.bb-pill)').forEach((a) => {
    const there = norm(new URL(a.getAttribute('href'), location.href).pathname);
    // Exact match marks any link (incl. the wordmark on the home page).
    // Section links (nav list only — never the wordmark, whose target
    // is a prefix of EVERY page) also mark their own subpages, e.g.
    // "API docs" on docs/ts.html.
    const section = !a.classList.contains('bb-wordmark')
      && there.endsWith('/') && here.startsWith(there);
    if (there === here || section) {
      a.setAttribute('aria-current', 'page');
    }
  });

  // ---- mobile nav toggle --------------------------------------
  const nav = document.querySelector('.bb-nav');
  const toggle = document.querySelector('.bb-nav-toggle');
  if (nav && toggle) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        // never strand focus in the hidden panel (WCAG 2.4.3)
        if (nav.contains(document.activeElement)) toggle.focus();
      }
    });
  }

  // ---- language switcher (guide pages) ------------------------
  // Choice persists in localStorage 'bb-lang'. Guide pages live at
  // guide/<locale>/…; switching rewrites that path segment.
  const LOCALES = ['en', 'zh-CN', 'es', 'ja', 'de', 'fr', 'ko'];
  const store = {
    get() { try { return localStorage.getItem('bb-lang'); } catch { return null; } },
    set(v) { try { localStorage.setItem('bb-lang', v); } catch {} },
  };
  const langRe = /\/guide\/(en|zh-CN|es|ja|de|fr|ko)(\/|$)/;
  const bbLang = {
    locales: LOCALES,
    get: () => store.get(),
    /** Persist `loc`; when on a guide page, jump to its twin. */
    set(loc) {
      if (!LOCALES.includes(loc)) return;
      store.set(loc);
      const m = location.pathname.match(langRe);
      if (m && m[1] !== loc) {
        location.href = location.pathname.replace(langRe, `/guide/${loc}$2`);
      }
    },
  };
  window.bbLang = bbLang;

  // Wire up switcher links: <a data-lang="ja" href="../ja/">日本語</a>.
  // The href does the navigation; we just persist the choice and
  // mark the active locale for styling/AT.
  const current = (location.pathname.match(langRe) || [])[1];
  document.querySelectorAll('[data-lang]').forEach((el) => {
    const loc = el.getAttribute('data-lang');
    if (loc === current) el.setAttribute('aria-current', 'true');
    el.addEventListener('click', () => store.set(loc));
  });
})();
