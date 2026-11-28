// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-ui-eqh.mjs — GH-1001 (atelier.md §7 B20-1): the e2e-ui --audit twin of
// the equal-height card law. A pure module (no browser at import — the
// instrument-import law): e2e-ui.mjs evaluates EQH_PROBE inside its own
// atelier walks (desktop shell walk per locale × station; phone walk per
// locale × station) and pushes one row per cell. The probe judges the
// PAINTED rail only: every card at one height (max − min <= 0.5 px), the
// face and the name at one offset inside every card (spread <= 0.5 px).
// The posed per-register / cross-station rows live in e2e-atelier-b20eq.mjs.

/** Page expression → [] when the rail obeys the law, else problem strings. */
export const EQH_PROBE = `(() => {
  const bad = [];
  const rs = window.__atelier?.rail?.();
  if (!rs?.live || rs.hidden) return bad;
  const R = (e) => e && !e.hidden && e.getClientRects().length ? e.getBoundingClientRect() : null;
  const cards = [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].filter((b) => R(b) && R(b).width > 0);
  if (cards.length < 2) return bad;
  const spread = (xs) => xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const hs = cards.map((b) => R(b).height);
  if (spread(hs) > 0.5) bad.push('card heights ' + Math.min(...hs).toFixed(1) + '..' + Math.max(...hs).toFixed(1));
  const off = (sel) => cards.map((b) => { const e = R(b.querySelector(sel)); return e ? e.top - R(b).top : null; }).filter((v) => v !== null);
  const ft = off('.ob-cardrail-thumb'), nt = off('.ob-cardrail-name');
  if (spread(ft) > 0.5) bad.push('face tops spread ' + spread(ft).toFixed(1) + 'px');
  if (spread(nt) > 0.5) bad.push('name tops spread ' + spread(nt).toFixed(1) + 'px');
  return bad;
})()`;
