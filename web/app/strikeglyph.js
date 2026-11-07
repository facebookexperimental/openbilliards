// Copyright (c) Meta Platforms, Inc. and affiliates.

// strikeglyph.js — GH-364: the strike-point (击球点) teaching plate.
//
// ONE pure 2D-canvas renderer for the cue-ball-face glyph (tip contact dot
// at the record's commanded (a, b), the per-cue miscue ring, an optional
// theta/v0 readout) consumed by BOTH surfaces of the WYSIWYG pair:
//   • offline-render.js composites it INTO exported frames (spec.strike —
//     the GH-301 fade precedent: part of the rendered bytes, hashes
//     included);
//   • playback.js paints the SAME function onto the live player's preview
//     layer while the save-card option is armed (the export mirrors the
//     preview by construction — one draw function, one geometry law).
// LEAF module (previewink.js precedent): no imports, no DOM reads, no
// window seams — a pure function of (ctx, spec), deterministic per
// (params, size, text) so the export determinism contract holds
// (the video-export ruling: pre-encode frame hashes ARE the contract;
// nothing here reads a clock, RNG, DPR or live CSS).
//
// VISUAL CONTRACT: the cue-ball face + contact dot glyph ALREADY exists
// three times (hud.js drawTip, aimwidgets.js drawSpin, touchwidgets.js spin
// pad) with a recorded taste ruling — "two shading systems for the same
// concept read off-system" — so this plate reuses that exact language
// instead of forking a fourth look: flat ivory face, dashed danger miscue
// ring, faint face cross-hairs, accent contact dot with the black contrast
// outline. The dot mapping is the GH-146 law verbatim: screen position =
// the CONTACT offset (commanded (a,b) / S) in units of R, +a right, +b up.
//
// COLOR LAW (issue GH-364 brief, citing the GH-260 contrast lessons): the
// GH-260 assist-ink work measured that thin strokes drawn DIRECTLY ON CLOTH
// collapse under the display transform (median WCAG 1.22 across 252 cells —
// previewink.js header) and need the adaptive cloth-measured pass; AREA
// FILLS with their own background never collapsed (the aim.js GH-260 scope
// note — the static-tone side of the doctrine split). This plate sits on
// that side BY CONSTRUCTION: it brings its own dark scrim + ivory hairline,
// so its contrast is plate-internal and IDENTICAL on any cloth — the brief
// ruled it ("static high-contrast plate is fine, no adaptive pass").
// Literals below are the PAINTED values of the corresponding --ob-* tokens
// (text-0 ivory #efe9d8, accent #76afee, danger #c95b3f, the glass/line
// families) — burned-in video content, not chrome, hence the
// ob-color-exempt annotations (the offline-render.js fade-black precedent);
// this file is deliberately DOM-free, so tokens are mirrored at design
// time rather than resolved per draw (the fade's --ob-pb-fade/#000 shape).
//
// GEOMETRY LAW: every length derives from the DESTINATION FRAME HEIGHT
// (u = H / 1080 — the 1080p design grid), so the plate scales with output
// resolution (720p…4K) and with the live preview's DPR-scaled backing store
// by the same arithmetic (the GH-263 pin: exports must not depend on device
// DPR — nothing here is CSS-px sized). Placement (bottom-left, one margin
// off the corner) lives HERE so the two consumers cannot diverge.

// ---- the spec builder (ONE derivation for both consumers) --------------------
/** Derive the glyph parameters for a ShotRecord — the ONE place record
 * fields become plate geometry. Returns null when the record cannot carry
 * a truthful plate (missing/non-finite shot params) — consumers show
 * nothing for that segment (honest degrade, never a made-up dot).
 * Physics-first: S and the miscue ring come from the record's OWN cue/ball
 * geometry (rec.options.cue, cue-ball params.r), defaults matching
 * sdk/ts shot.ts (tip_radius 0.0106 m, pool R 0.028575 m, cap 0.5 R) — a
 * masse_trick record (cap 0.58) draws its wider legal disc.
 * Shape: { a, b, theta, v0, s, cap } — s = 1 + tip_radius/R (commanded →
 * contact divisor), cap = the cue's contact-offset miscue cap in R. */
export function glyphFor(record) {
  const sh = record?.shot;
  if (!sh) return null;
  const { a, b, theta, v0 } = sh;
  if (![a, b, theta, v0].every(Number.isFinite)) return null;
  // record ball radius: the STRUCK ball's own params (cuepost.js precedent —
  // snooker/carom records differ from the pool default by ~2 mm). The
  // struck ball is the record's own Strike-event truth (the GH-383
  // record-anchored-consumer law, preview-compute.js convention): seat 2
  // of a two-cue-ball carom record strikes ball 1, never a literal 0.
  const cueId = strikeBallOf(record);
  const ballR = record?.initial?.balls?.find((x) => x?.id === cueId)?.params?.r;
  const R = Number.isFinite(ballR) && ballR > 0 ? ballR : 0.028575;
  const cue = record?.options?.cue;
  const tipR = Number.isFinite(cue?.tip_radius) && cue.tip_radius > 0
    ? cue.tip_radius : 0.0106;
  const cap = Number.isFinite(cue?.miscue_contact_cap_r)
    && cue.miscue_contact_cap_r > 0 ? cue.miscue_contact_cap_r : 0.5;
  return { a, b, theta, v0, s: 1 + tipR / R, cap };
}

/** The record's own struck ball — events[0] Strike truth (the GH-383
 * record-anchored-consumer law, preview-compute.js convention; the field
 * is serde-skipped at 0, so pool records answer the default). */
const strikeBallOf = (record) =>
  record?.events?.[0]?.kind?.Strike?.ball ?? 0;

/** Kernel-time when the plate starts its bow-out for `record` — the
 * teaching window's far edge. The derivation ladder mirrors the DVR's own
 * impact anchor (playback.js povTImpact) but pinned to the STRUCK ball
 * like preview-compute.js (Strike-event truth — seat 2 of a carom record
 * strikes ball 1): first BallBall involving the struck ball, else its
 * first cushion, else the record duration (a contactless roll keeps its
 * plate through the whole play — there is no impact to hand the eye to). */
export function impactTimeFor(record, duration) {
  const evs = record?.events ?? [];
  const cueId = strikeBallOf(record);
  for (const e of evs) {
    const k = e?.kind;
    if (k && typeof k !== 'string' && k.BallBall
      && (k.BallBall.b1 === cueId || k.BallBall.b2 === cueId)) {
      return Number.isFinite(e.t) ? e.t : duration;
    }
  }
  for (const e of evs) {
    const k = e?.kind;
    // linear rails AND pocket-jaw arcs (review r1 P2: a shot whose first
    // rail contact is a BallCircularCushion kept its plate to the record
    // end — "first cue cushion" means any cushion class)
    if (k && typeof k !== 'string' && (k.BallLinearCushion?.ball === cueId
      || k.BallCircularCushion?.ball === cueId)) {
      return Number.isFinite(e.t) ? e.t : duration;
    }
  }
  return duration;
}

// ---- formatting (the HUD's own display grammar) -------------------------------
// v0 in m/s through the hud.js/aimwidgets.js fmtV convention; theta in
// degrees to one decimal (the aimwidgets.js readout law). Symbols (° θ m/s)
// are notation, not prose — the localized string on the plate is the
// caption the CONSUMER passes in (i18n ×7 lives with the app dictionaries,
// never in this leaf).
export const fmtV0 = (v) => (Math.round(v * 100) % 10 ? v.toFixed(2) : v.toFixed(1));
// GH-475: the two annotation halves as their own formatters — the export
// Advanced knobs toggle each independently (values are the RECORDED shot
// params carried by glyphFor, never re-derived; θ°/m·s⁻¹ symbols are
// notation, not prose — the i18n ×7 keys label the KNOBS, playback.js).
// Their EXISTENCE is also the capability surface: a fresh caller with
// annotations requested feature-detects fmtElev and throws the honest
// reload error against a cached pre-475 copy of this leaf (renderDrill).
export const fmtElev = ({ theta }) => `θ ${(theta * 180 / Math.PI).toFixed(1)}°`;
export const fmtPower = ({ v0 }) => `${fmtV0(v0)} m/s`;
export const fmtReadout = (g) => `${fmtElev(g)} · ${fmtPower(g)}`;

// The --ob-font painted stack (tokens.css), mirrored at design time — see
// the color-law note above for why this leaf never reads live CSS.
const PLATE_FONT = '"Space Grotesk", "Inter var", -apple-system, '
  + '"SF Pro Text", "Segoe UI Variable", system-ui, sans-serif';

// ---- the plate renderer --------------------------------------------------------
/**
 * Draw the strike-point plate onto `ctx` (any 2D canvas: the export
 * composite scratch or the live preview layer).
 *
 * opts:
 *   W, H     destination frame size in ctx pixels (geometry unit u=H/1080;
 *            placement anchors to the bottom-LEFT corner);
 *   alpha    plate opacity 0..1 (the linger bow-out ramps it; ≤0 draws
 *            nothing);
 *   glyph    glyphFor() result ({ a, b, theta, v0, s, cap });
 *   title    localized caption string ('' hides the caption row);
 *   readout  true → the combined theta/v0 line (fmtReadout) under the
 *            face — the pre-475 legacy flag, kept for seam callers;
 *   elev     GH-475: true → the cue-elevation half (fmtElev) on the
 *            readout row; independent of `power`;
 *   power    GH-475: true → the cue-speed half (fmtPower — the recorded
 *            v0, the HUD's m/s figure) on the readout row.
 *            The row renders when ANY of readout/elev/power is on;
 *            readout outranks the halves (it already shows both).
 */
export function drawStrikePlate(ctx, { W, H, alpha = 1, glyph, title = '',
  readout = true, elev = false, power = false } = {}) {
  if (!ctx || !glyph || !(alpha > 0) || !(H > 0) || !(W > 0)) return;
  const u = H / 1080;
  const m = plateRect({ W, H, title, readout, elev, power });
  const pad = 14 * u;
  const faceR = 52 * u;
  const capFont = 15 * u;
  const roFont = 17 * u;
  const cx = m.x + m.w / 2;
  const cy = m.y + pad + (title ? capFont * 1.5 + 4 * u : 0) + faceR;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  // -- plate scrim + hairline (its OWN background — the GH-260-informed
  //    static-contrast design; glass/line-2 family painted values) --
  ctx.beginPath();
  plateRRect(ctx, m.x, m.y, m.w, m.h, 12 * u);
  ctx.fillStyle = 'rgba(13, 17, 15, 0.82)'; // ob-color-exempt: burned-in video content (plate scrim, --ob-glass painted value)
  ctx.fill();
  ctx.lineWidth = Math.max(1, u);
  ctx.strokeStyle = 'rgba(239, 233, 216, 0.28)'; // ob-color-exempt: burned-in video content (--ob-line-2 painted value)
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // -- caption (localized by the consumer; uppercase micro-label register) --
  if (title) {
    ctx.font = `560 ${capFont}px ${PLATE_FONT}`;
    ctx.fillStyle = 'rgba(239, 233, 216, 0.8)'; // ob-color-exempt: burned-in video content (--ob-text-1 register)
    ctx.fillText(title, cx, m.y + pad + capFont * 0.62, m.w - 2 * pad);
  }
  // -- cue-ball face: flat ivory, the drawTip/drawSpin language --
  ctx.beginPath();
  ctx.arc(cx, cy, faceR, 0, 7);
  ctx.fillStyle = '#efe9d8'; // ob-color-exempt: cue-ball face (matches ball material, not UI chrome — the hud.js drawTip literal)
  ctx.fill();
  // -- miscue limit: dashed danger ring at the record cue's OWN contact
  //    cap (units of R — hud.js pins 0.5R, the default cap) --
  ctx.globalAlpha = Math.min(1, alpha) * 0.55;
  ctx.strokeStyle = '#c95b3f'; // ob-color-exempt: burned-in video content (--ob-danger painted value, the drawTip ring)
  ctx.setLineDash([6 * u, 5 * u]);
  ctx.lineWidth = Math.max(1, u);
  ctx.beginPath();
  ctx.arc(cx, cy, faceR * glyph.cap, 0, 7);
  ctx.stroke();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.setLineDash([]);
  // -- face cross-hairs --
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)'; // ob-color-exempt: marking on the ball face (the drawTip literal)
  ctx.beginPath();
  ctx.moveTo(cx - faceR, cy); ctx.lineTo(cx + faceR, cy);
  ctx.moveTo(cx, cy - faceR); ctx.lineTo(cx, cy + faceR);
  ctx.stroke();
  // -- contact dot at (a, b)/S — the GH-146 mapping: +a right, +b up --
  const dx = (glyph.a / glyph.s) * faceR;
  const dy = -(glyph.b / glyph.s) * faceR;
  const dotR = faceR * 0.12; // the drawTip dot/face ratio (s·0.05 / s·0.42)
  ctx.fillStyle = '#76afee'; // ob-color-exempt: burned-in video content (--ob-accent painted value, the tip contact dot)
  ctx.beginPath();
  ctx.arc(cx + dx, cy + dy, dotR, 0, 7);
  ctx.fill();
  ctx.lineWidth = Math.max(1, 2 * u);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'; // ob-color-exempt: dot contrast outline on the cream face (the drawTip literal)
  ctx.beginPath();
  ctx.arc(cx + dx, cy + dy, dotR, 0, 7);
  ctx.stroke();
  // -- readout row (the HUD grammar): the legacy combined line, or the
  //    GH-475 knob-selected halves (elev/power, ' · '-joined when both) --
  const roText = readout ? fmtReadout(glyph)
    : [elev ? fmtElev(glyph) : null, power ? fmtPower(glyph) : null]
      .filter(Boolean).join(' · ');
  if (roText) {
    ctx.font = `430 ${roFont}px ${PLATE_FONT}`;
    ctx.fillStyle = '#efe9d8'; // ob-color-exempt: burned-in video content (--ob-text-0 painted value)
    ctx.fillText(roText, cx, m.y + m.h - pad - roFont * 0.45,
      m.w - 2 * pad);
  }
  ctx.restore();
}

/** The plate's frame-space bounding box for opts — the ONE geometry
 * derivation (drawStrikePlate consumes it, and the e2e localization arm
 * asserts overlay-on/off pixel differences stay INSIDE this rect plus its
 * anti-aliasing apron). */
export function plateRect({ W, H, title = '', readout = true,
  elev = false, power = false } = {}) {
  const u = H / 1080;
  const faceR = 52 * u, pad = 14 * u, capFont = 15 * u, roFont = 17 * u;
  const margin = 30 * u;
  const titleH = title ? capFont * 1.5 + 4 * u : 0;
  const roH = readout || elev || power ? roFont * 1.7 : 0;
  const w = Math.max(2 * faceR, 128 * u) + 2 * pad;
  const h = titleH + 2 * faceR + roH + 2 * pad;
  return { x: margin, y: H - margin - h, w, h };
}

// Path-only rounded rect: canvas ctx.roundRect is Baseline 2023, but this
// leaf must paint identically on every engine the e2e matrix drives.
function plateRRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
