// Copyright (c) Meta Platforms, Inc. and affiliates.

// i18n.js — tiny runtime translator for the app UI (no deps, no build step).
// Dictionaries are flat key → template JSON files in ./locales/<locale>.json
// (en is the source of truth; every locale must carry the exact same keys —
// e2e-i18n.mjs walks all locales and asserts ZERO missing/extra keys).
//
// Locale resolution (initI18n): explicit settings choice (persisted by
// settings.js under ob-settings-v1.language) > navigator.language match >
// 'en'. setLocale() switches live: subscribers re-render their own text
// (onLocaleChange), no reload needed.
//
// Missing-key policy: t() falls back to the en dictionary, console.warn-ing
// once per key (dev signal); a key absent from en too returns the key itself.
// __i18n exposes the e2e surface (locale, keys, missing set, audit()).

export const LOCALES = ['en', 'zh-CN', 'es', 'ja', 'de', 'fr', 'ko'];
/** Native-language picker labels — intentionally NOT translated. */
export const LOCALE_NAMES = {
  en: 'English', 'zh-CN': '简体中文', es: 'Español', ja: '日本語',
  de: 'Deutsch', fr: 'Français', ko: '한국어',
};

let locale = 'en';
let dict = {};    // active locale strings
let enDict = {};  // fallback + key universe
const missing = new Set(); // keys that fell back (warned once each)
const listeners = [];

async function fetchDict(loc) {
  const url = new URL(`./locales/${loc}.json`, import.meta.url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`locale ${loc} failed to load (${res.status})`);
  return res.json();
}

/** Best supported locale for a BCP-47 tag ('zh', 'zh-TW' → zh-CN; 'es-MX' →
 * es; unknown → null). Exported for unit-style e2e checks. */
export function matchLocale(tag) {
  if (!tag) return null;
  if (LOCALES.includes(tag)) return tag;
  const base = tag.toLowerCase().split('-')[0];
  if (base === 'zh') return 'zh-CN';
  return LOCALES.find((l) => l.toLowerCase() === base) ?? null;
}

/** settings choice > navigator.languages match > en. */
export function resolveLocale(saved) {
  if (LOCALES.includes(saved)) return saved;
  const navLangs = typeof navigator !== 'undefined'
    ? (navigator.languages ?? [navigator.language]) : [];
  for (const tag of navLangs) {
    const m = matchLocale(tag);
    if (m) return m;
  }
  return 'en';
}

/** Read the persisted language choice (settings.js owns the key; reading it
 * here keeps i18n free of a circular settings import at boot). */
export function savedLanguage() {
  try {
    return JSON.parse(localStorage.getItem('ob-settings-v1') ?? '{}').language;
  } catch { return undefined; }
}

/** Keep <html lang> on the ACTIVE locale (2026-07-13 audit finding 6:
 * app.html ships lang="en" and nothing updated it — screen readers
 * mispronounce localized chrome, CJK font selection loses its hint). */
function syncHtmlLang() {
  try { document.documentElement.lang = locale; } catch { /* no DOM */ }
}

/** Boot: resolve + load dictionaries (en always, as the fallback). */
export async function initI18n(saved = savedLanguage()) {
  enDict = await fetchDict('en');
  locale = resolveLocale(saved);
  dict = locale === 'en' ? enDict : await fetchDict(locale);
  syncHtmlLang();
  return locale;
}

/** Translate key, interpolating {param} slots from params. */
export function t(key, params) {
  let tpl = dict[key];
  if (tpl === undefined) {
    if (!missing.has(key)) {
      missing.add(key);
      console.warn(`[i18n] missing key '${key}' in locale '${locale}'`);
    }
    tpl = enDict[key] ?? key;
  }
  return params
    ? tpl.replace(/\{(\w+)\}/g, (m, p) => (params[p] !== undefined ? String(params[p]) : m))
    : tpl;
}

/** True when the ACTIVE locale (or en fallback) carries the key — callers
 * with a better fallback than the raw key (equipment display_name) test
 * first so unknown ids never trip the missing-key detector. */
export function has(key) {
  return dict[key] !== undefined || enDict[key] !== undefined;
}

/** True when the ACTIVE locale's OWN dictionary carries the key — no en
 * fallback consulted (GH-313, the GH-304 residual-1 register): versioned-copy
 * seams (playback.js tBudget) degrade to their retained legacy templates when
 * THIS dictionary is stale, instead of letting has()'s en fallback paint the
 * fresh ENGLISH copy into a non-English UI (plus a missing-key warn per key).
 * ADDITIVE export — consumers reach it through a namespace import and feature-
 * detect (OWNERSHIP rule 5), so a fresh caller over a stale cached i18n.js
 * degrades to the pre-313 has() register instead of a boot-killing
 * missing-export error. */
export function hasLocal(key) {
  return dict[key] !== undefined;
}

/** GH-463: pointer-register instruction copy. Gameplay hint keys that name
 * the user's GESTURE ("tap a pocket") carry a `<key>.mouse` variant with
 * the fine-pointer wording and a `<key>.touch` variant with the touch
 * wording; the BASE key keeps the LEGACY copy byte-identically — review r2
 * P2: a stale pre-463 hud.js/aimwidgets.js/flow.js keeps calling t(base)
 * against a fresh dictionary, so rewording the base would regress exactly
 * the deployments the mixed-cache contract protects (OWNERSHIP boot-graph
 * law). Most legacy strings already spoke the touch register (their
 * `.touch` variant repeats the base bytes), but zh-CN's call.* hints spoke
 * 点击 — the explicit `.touch` variant is what lets those say 点按 without
 * touching the base (review r4 P2). Verb pairs mirror the help overlay's
 * own per-register convention (help.controls.mouse.* vs
 * help.controls.touch.*), which the live HUD copy used to contradict on
 * desktop. The register signal is EXACTLY the pair the app itself uses to
 * pick its input grammar (help.js mode()), read at EVERY call and never
 * cached — the touch layer installs asynchronously (see the register
 * observer below). hasLocal()-guarded (review r1 P2, the GH-313 mixed-cache
 * law): the variant key must exist in the ACTIVE dictionary — has()'s en
 * fallback would paint a fresh ENGLISH hint into a non-English UI whose
 * own dictionary is stale; hasLocal degrades to the localized base copy
 * instead, never a raw-key paint. ADDITIVE export — consumers reach it
 * through a namespace import + feature detection (OWNERSHIP rule 5), so a
 * fresh caller over a stale cached i18n.js degrades to plain t() instead
 * of a boot-killing missing-export error. */
export function tp(key, params) {
  const touch = typeof window !== 'undefined'
    && (window.__touch?.installed === true
      || document.documentElement.classList.contains('ob-touch'));
  const vk = `${key}${touch ? '.touch' : '.mouse'}`;
  return hasLocal(vk) ? t(vk, params) : t(key, params);
}

/** GH-463 review r2 P2: re-render register-bearing copy when the input
 * grammar changes AFTER first paint. The touch layer arrives via a dynamic
 * import — on a cold coarse-pointer boot with a persisted call-gate game,
 * the gate can paint through tp() BEFORE `__touch.installed`/`html.ob-touch`
 * land, and the signature-gated renderers (aim.js hudSig, hud.js chip sig)
 * never re-run on their own. Re-fires the locale-change subscriber list
 * against the UNCHANGED locale, so every subscriber re-renders its own
 * text (hud/aimwidgets relabel re-run renderCall). */
export function refreshRegister() {
  for (const fn of listeners) fn(locale);
}

// Fresh-side register observer (review r4 P2): the refresh must NOT depend
// on touch.js calling in — a cached pre-463 touch leaf still installs the
// grammar (its `html.ob-touch` class add is a pre-existing install side
// effect) but knows nothing of this seam. i18n.js is in the boot graph on
// every fresh tree, so IT watches the class register and re-fires the
// subscribers on every genuine flip (edge-detected — class mutations that
// leave the register unchanged are free; the real app only ever flips it
// once, at touch install, but a register test toggling it transiently gets
// consistent copy in both directions instead of a stranded wrong-register
// paint).
if (typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
  let lastTouch = document.documentElement.classList.contains('ob-touch');
  const mo = new MutationObserver(() => {
    const now = document.documentElement.classList.contains('ob-touch');
    if (now === lastTouch) return;
    lastTouch = now;
    refreshRegister();
  });
  mo.observe(document.documentElement,
    { attributes: true, attributeFilter: ['class'] });
}

export const getLocale = () => locale;

let switchSeq = 0; // setLocale overlap guard: only the LATEST call may apply

/** Live-switch: load the dictionary, then re-render every subscriber.
 * Overlapping calls are sequenced (2026-07-21 e2e finding): the LAST call
 * wins. Every call claims the sequence token FIRST — so a revert back to the
 * CURRENT locale while another switch's fetch is still in flight cancels
 * that switch (previously it early-returned on `next === locale` and the
 * late-landing dictionary flipped the UI to the abandoned locale, diverging
 * from the persisted setting) — and a fetched dictionary is applied only if
 * no newer call superseded it while it loaded. */
export async function setLocale(next) {
  if (!LOCALES.includes(next)) return locale;
  const seq = ++switchSeq;
  if (next === locale) return locale;
  const d = next === 'en' ? enDict : await fetchDict(next);
  if (seq !== switchSeq) return locale; // superseded while fetching — discard
  dict = d;
  locale = next;
  syncHtmlLang();
  for (const fn of listeners) fn(locale);
  return locale;
}

/** Subscribe to locale switches (re-render your own text). Returns unsub. */
export function onLocaleChange(fn) {
  listeners.push(fn);
  return () => listeners.splice(listeners.indexOf(fn), 1);
}

/** Apply data-i18n / data-i18n-title attributes below root (static HTML +
 * module-built panels); safe to re-run on every locale switch. */
export function applyDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    el.title = t(el.dataset.i18nTitle);
    // an icon-only control's aria-label IS its accessible name; refreshing the
    // title while leaving the label in the creation locale strands screen
    // readers in the old language. Only ever REFRESHED, never added, so a
    // control the author left unlabelled keeps its own semantics.
    if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', el.title);
  }
}

// ---- e2e / debug surface ----------------------------------------------------
if (typeof window !== 'undefined') {
  window.__i18n = {
    locale: () => locale,
    locales: () => [...LOCALES],
    keys: () => Object.keys(enDict),
    missing: () => [...missing], // runtime fallbacks seen so far (gate: empty)
    t, tp, setLocale, resolveLocale, matchLocale,
    /** Fetch EVERY locale and diff its key set against en: the e2e missing-
     * key walk asserts every entry reports missing: [] and extra: []. */
    async audit() {
      const report = {};
      for (const loc of LOCALES) {
        const d = await fetchDict(loc);
        report[loc] = {
          keys: Object.keys(d).length,
          missing: Object.keys(enDict).filter((k) => !(k in d)),
          extra: Object.keys(d).filter((k) => !(k in enDict)),
        };
      }
      return report;
    },
  };
}
