// Copyright (c) Meta Platforms, Inc. and affiliates.

// locale-settle.mjs — ONE definition of "the locale flip has landed" for the
// e2e suites (GH-1110 e2e-shell K05, #860 e2e-settings G5 D2/D4, e2e-replays
// R5d). i18n.setLocale() is async: it fetches the locale dictionary, then runs
// every onLocaleChange listener. A suite that fires it and sleeps a fixed
// 350-450 ms reads the OLD locale whenever a starved host serves the
// dictionary late — the recurring "the locale flip left the rail width
// unchanged" / "html lang en after setLocale(ja)" reds under load 40-55.
//
// flipLocale awaits the switch in the page and checks the page's own record
// (<html lang> and i18n.locale()); settledRead then re-reads a page-side probe
// once per animation frame until it holds still for N frames (layout that
// follows the new text — ResizeObserver ticks, rAF-scheduled band writes —
// lands inside that window). Both are bounded page-side (the switch by a
// timer, the frame loop by one deadline timer that never counts as a frame),
// so a real defect (a listener that never re-renders, a rule that never
// applies, a dictionary request that never finishes) still reaches its
// verdict with the arm's own failure line instead of hanging.

/** Await i18n.setLocale(loc) in the page, bounded page-side at `capMs`.
 * Resolves { applied, got, lang, locale, ms } (applied: the resolved locale,
 * <html lang> and i18n.locale() all say loc); a switch that rejected (a
 * refused dictionary, a throwing listener) or outran the cap resolves
 * { applied: false, err, lang, locale } — a hung dictionary request can
 * never hold the CDP call for its 600 s command deadline. On a timeout the
 * in-flight switch is cancelled (a switch to the current locale supersedes
 * it, i18n.js's switchSeq law). */
export async function flipLocale(c, loc, { capMs = 15000 } = {}) {
  return c.eval(`(async () => {
    const want = ${JSON.stringify(loc)};
    const t0 = performance.now();
    const state = () => ({ lang: document.documentElement.lang, locale: window.__i18n.locale() });
    let timer = null;
    const cap = new Promise((r) => { timer = setTimeout(() => r({ timeout: true }), ${capMs}); });
    let got = null;
    try {
      const out = await Promise.race([window.__i18n.setLocale(want).then((v) => ({ v })), cap]);
      if (out.timeout) {
        try { window.__i18n.setLocale(window.__i18n.locale()); } catch { /* best effort */ }
        return { applied: false, err: 'setLocale did not settle within ${capMs} ms', ...state() };
      }
      got = out.v;
    } catch (e) {
      return { applied: false, err: String((e && (e.stack || e.message)) || e).slice(0, 400), ...state() };
    } finally { clearTimeout(timer); }
    const s = state();
    return { applied: got === want && s.lang === want && s.locale === want,
      got, ...s, ms: Math.round(performance.now() - t0) };
  })()`);
}

/** Re-read `readExpr` (a page-side expression) once per animation frame until
 * it returns the same JSON for `frames` consecutive frames, capped at `capMs`.
 * Resolves { value, settled, n, run } — n counts the animation frames read,
 * run the equal frames that ended the read. Only a requestAnimationFrame
 * callback counts: the one timer ends the loop at the cap and never stands in
 * for a frame, so a read can never settle while an rAF-scheduled write queued
 * before it (the shell's band publish) still waits for a frame. `settled:
 * false` is a probe still moving at the cap OR fewer than `frames` frames
 * before it (n 0: no frame at all, a stalled compositor); unsettledNote()
 * words which for the caller's note, and the caller judges the value. */
export async function settledRead(c, readExpr, { frames = 3, capMs = 5000 } = {}) {
  return c.eval(`(async () => {
    const read = () => (${readExpr});
    let cap = 0;
    const deadline = new Promise((r) => { cap = setTimeout(() => r(false), ${capMs}); });
    // true on an animation frame, false at the cap — a timer is never a frame
    const frame = () => Promise.race([new Promise((r) => requestAnimationFrame(() => r(true))), deadline]);
    let last = JSON.stringify(read() ?? null);
    let same = 0;
    let n = 0;
    const t0 = performance.now();
    while (same < ${frames} && performance.now() - t0 < ${capMs}) {
      if (!(await frame())) break;
      n++;
      const s = JSON.stringify(read() ?? null);
      same = s === last ? same + 1 : 0;
      last = s;
    }
    clearTimeout(cap);
    return { value: JSON.parse(last), settled: same >= ${frames}, n, run: same };
  })()`);
}

/** The caller's words for an unsettled settledRead result: a probe still
 * moving is told apart from frames that never came or stopped coming, so a
 * stalled compositor is never triaged as layout churn. */
export function unsettledNote({ n, run }) {
  if (!n) return 'no animation frame arrived before the cap (a stalled compositor)';
  if (run === n) return `only ${n} frame(s) arrived before the cap, the probe unchanged (frames stalled or slow)`;
  return `the probe last changed at frame ${n - run} of ${n}, ${run} equal frame(s) before the cap`;
}
