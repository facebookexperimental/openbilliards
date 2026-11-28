// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/lamp/face.js — the lit underside of the club look's table luminaire as plain data (CONTRACT.md 9.2). Owner: lamp.
//
// Read-only for every other module: the wood part mirrors this structure in the rail highlight, the room may bake the glow.
// Pure functions, no imports, plain numbers and arrays in and out (world metres, y up, the app's emitter rectangles as
// [{ x, y, z, w, d }]: centre, plane height, span along x and along z). room/lamp/model.js builds its geometry and
// room/lamp.js draws its panel texture from the same numbers, so what is documented here is what hangs.
//
//   lampFace(fixture)   the diffuser: per emitter rectangle a frame, lit panels, the cross bars between them, the tube strips
//   lampSpill(fixture)  the lamp's own glow as fixed emitters for room/light.js (nothing is registered by calling it)
//   lampSpillBaked()    the glow the room's bake holds (the canopy's): what room/lamp.js registers under every fixture
//   lampShield(fixture) where the skirt cuts the diffuser's light: the opening as two rectangles and four tangents
//
// `fixture` may be the emitter list, one emitter, an object with `.emitters` (the built lamp's state()), or the built lamp.

/** Frame and panel law of a rectangular face (metres unless said). */
export const FACE = Object.freeze({
  border: 0.012,        // opaque frame strip inside each edge of the emitter rectangle (at most 8 % of the short side)
  bar: 0.016,           // cross bar between two panels (at most 20 % of the short side)
  proud: 0.006,         // the frame stands this far below the diffuser
  panelPitch: 0.6,      // panels are about as long as the face is wide, and never shorter than this
  maxPanels: 6,
  tubeEnd: 0.09,        // a tube strip fades over this length at each end of its panel
  wide: 0.5,            // a face at least this wide carries three tube strips, a narrower one a single strip
  // radiance relative to a tube core (the core takes the app's own lamp-face colour)
  // (tubeEnd: the level at the very end of a panel relative to the level beside it; panel: the diffuser between two strips)
  levels: Object.freeze({ tube: 1, tubeEnd: 0.35, panel: 0.45, frame: 0.03 }),
  // the app's canopy pattern: strips centred at -0.2529, 0, +0.2529 of the short side, half width (to the 50 % level) 0.0918
  tubeOffset: 0.2529, tubeHalf: 0.0918, tubeHalfSingle: 0.3,
  // a turned shade (a small square emitter): the aperture the app draws, and the rim that frames it
  discRadius: 0.7115, discBorder: 0.008,
});

const r4 = (v) => Math.round(v * 1e4) / 1e4;

/** The emitter list of whatever was handed in ([] when nothing usable). */
export function emittersOf(fixture) {
  let list = fixture;
  try {
    if (list && typeof list.state === 'function') list = list.state();
    if (list && !Array.isArray(list) && Array.isArray(list.emitters)) list = list.emitters;
    if (list && !Array.isArray(list)) list = [list];
  } catch { list = null; }
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e && [e.x, e.y, e.z, e.w, e.d].every(Number.isFinite) && e.w > 0 && e.d > 0)
    .map((e) => ({ x: e.x, y: e.y, z: e.z, w: e.w, d: e.d }))
    .sort((a, b) => (a.x - b.x) || (a.z - b.z));
}

/** 'trough' (one rectangle) | 'pendants' (small squares) | 'troughs' (several strips). */
export function faceKind(emitters) {
  if (emitters.length === 1) return 'trough';
  if (emitters.every((e) => Math.max(e.w, e.d) <= 0.45)) return 'pendants';
  return 'troughs';
}

function rectFace(e) {
  const alongX = e.w >= e.d;
  const long = alongX ? e.w : e.d, short = alongX ? e.d : e.w;
  const border = Math.min(FACE.border, short * 0.08);
  const bar = Math.min(FACE.bar, short * 0.2);
  const n = Math.min(FACE.maxPanels, Math.max(1, Math.round(long / Math.max(short, FACE.panelPitch))));
  const panelLong = (long - 2 * border - (n - 1) * bar) / n;
  const panelShort = short - 2 * border;
  const at = (a, c) => (alongX ? [r4(e.x + a), r4(e.z + c)] : [r4(e.x + c), r4(e.z + a)]);
  const half = (hl, hs) => (alongX ? [r4(hl), r4(hs)] : [r4(hs), r4(hl)]);
  const panels = [], gaps = [];
  for (let i = 0; i < n; i++) {
    const a = -long / 2 + border + panelLong / 2 + i * (panelLong + bar);
    panels.push({ centre: at(a, 0), half: half(panelLong / 2, panelShort / 2) });
    if (i < n - 1) gaps.push({ centre: at(a + panelLong / 2 + bar / 2, 0), half: half(bar / 2, panelShort / 2) });
  }
  const tubes = short >= FACE.wide
    ? [-FACE.tubeOffset, 0, FACE.tubeOffset].map((o) => ({ offset: r4(o * short), half: r4(FACE.tubeHalf * short) }))
    : [{ offset: 0, half: r4(FACE.tubeHalfSingle * short) }];
  return {
    shape: 'rect', long: alongX ? 'x' : 'z',
    centre: [e.x, e.y, e.z], half: [e.w / 2, e.d / 2],             // the emitter rectangle, exactly
    frame: { border: r4(border), bar: r4(bar), proud: FACE.proud, level: FACE.levels.frame },
    panels, gaps,
    panelSize: [r4(panelLong), r4(panelShort)],                    // along the long axis, across
    tubes,                                                         // inside every panel: offset across from the panel centre, half width
    tubeEnd: r4(Math.min(FACE.tubeEnd, panelLong * 0.2)),
    levels: { ...FACE.levels },
  };
}

function discFace(e) {
  const radius = FACE.discRadius * Math.max(e.w, e.d);
  return {
    shape: 'disc', long: null,
    centre: [e.x, e.y, e.z], half: [e.w / 2, e.d / 2], radius: r4(radius),
    frame: { border: FACE.discBorder, bar: 0, proud: 0, level: FACE.levels.frame },
    panels: [{ centre: [e.x, e.z], radius: r4(radius - FACE.discBorder) }], gaps: [],
    tubes: [], tubeEnd: 0,
    levels: { ...FACE.levels, edge: 0.55 },                        // a bulb behind opal glass: full in the middle, `edge` at the rim
  };
}

/**
 * The lit underside, per emitter rectangle. Returns
 *   { kind, y, rect: { cx, cz, hx, hz }, faces: [face], panels: [...all panels], frame }
 * with, per rectangular face: `centre` / `half` (the emitter rectangle exactly), `frame` { border, bar, proud, level },
 * `panels` [{ centre: [x, z], half: [hx, hz] }] in order along the long axis, `gaps` (the cross bars, same shape),
 * `panelSize`, `tubes` [{ offset, half }], `tubeEnd`, `levels`. A turned shade gives one round panel ({ centre, radius }).
 * `panels` and `frame` at the top level are those of all faces (the frame of the first), for the one-rectangle case.
 */
export function lampFace(fixture) {
  const list = emittersOf(fixture);
  if (!list.length) return null;
  const kind = faceKind(list);
  const faces = list.map((e) => (kind === 'pendants' ? discFace(e) : rectFace(e)));
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y = 0;
  for (const e of list) {
    x0 = Math.min(x0, e.x - e.w / 2); x1 = Math.max(x1, e.x + e.w / 2);
    z0 = Math.min(z0, e.z - e.d / 2); z1 = Math.max(z1, e.z + e.d / 2); y += e.y / list.length;
  }
  return {
    kind, y: r4(y), rect: { cx: r4((x0 + x1) / 2), cz: r4((z0 + z1) / 2), hx: r4((x1 - x0) / 2), hz: r4((z1 - z0) / 2) },
    faces, panels: faces.flatMap((f) => f.panels), frame: faces[0].frame,
  };
}

/** The glass band of a trough: where it stands relative to the emitter plane (model.js builds it from these). */
export const BAND = Object.freeze({ from: 0.006, to: 0.052, fromSlim: 0.005, toSlim: 0.033 });

/** The lamp's own glow (the backlit glass, never the light it throws on the bed) as emitters in room/light.js terms. */
// (intensity: 2.0 is the room's level from round 3, room.js LAMP_BAND: the ceiling bay over the table reads as a warm pool;
// 0.5 until then. The room compares id, position, size and axis with its bake; the level is its own to set.)
export const SPILL = Object.freeze({ color: [1.0, 0.72, 0.42], intensity: 2.0, radius: 4.2, lift: 0.029, margin: 0.06 });

/**
 * One tube emitter along the long axis of the emitters' bounding rectangle, at the height of the glass.
 * Returns [{ id, type, position: [x, y, z], axis: [x, y, z], size: [length, radius], color: [r, g, b], intensity, radius }].
 */
export function lampSpill(fixture) {
  const f = lampFace(fixture);
  if (!f) return [];
  const alongX = f.rect.hx >= f.rect.hz;
  const long = 2 * (alongX ? f.rect.hx : f.rect.hz), short = 2 * (alongX ? f.rect.hz : f.rect.hx);
  const pend = f.kind === 'pendants';
  return [{
    id: 'lamp.band', type: 'tube',
    position: [f.rect.cx, r4(f.y + (pend ? 0.09 : SPILL.lift)), f.rect.cz],
    axis: alongX ? [1, 0, 0] : [0, 0, 1],
    size: [r4(long), r4(pend ? 0.25 : short / 2 + SPILL.margin)],
    color: SPILL.color.slice(), intensity: SPILL.intensity, radius: SPILL.radius,
  }];
}

/** The app's canopy emitter (scene/room.js: 2.05 x 0.66 m, 1.02 m over the bed): the fixture the room's bake is made under. */
export const CANOPY = Object.freeze({ x: 0, y: 1.02, z: 0, w: 2.05, d: 0.66 });

/**
 * The glow the room's bake holds: lampSpill() of the canopy. The room compares the id, position, size and axis of every
 * emitter with its baked file and falls back to its analytic light when one moved, so room/lamp.js registers THIS under
 * every fixture (the other fixtures' glow sits within 0.15 m of it; lampSpill(fixture) stays the per-fixture data).
 */
export function lampSpillBaked() { return lampSpill([CANOPY]); }

/** How far the skirt of a trough hangs below the emitter plane and stands outside the emitter rectangle (model.js builds from these). */
export const SKIRT = Object.freeze({ drop: 0.09, dropSlim: 0.05, out: 0.05, outSlim: 0.035, flare: 0.010, flareSlim: 0.004, slimUnder: 0.3 });

/**
 * Where the skirt cuts the diffuser's light, per emitter rectangle of a trough (null for turned shades): the emitting
 * rectangle, the opening at the rim (the inside of the skirt's lower edge), and the tangents of the angle off the vertical
 * at which a point below starts to lose the diffuser (`t0`: the near edge of the opening covers the near edge of the
 * diffuser) and has lost all of it (`t1`), across the lamp (`z` for a lamp along x) and along it.
 * Returns [{ face: { cx, cz, hx, hz, y }, rim: { cx, cz, hx, hz, y }, drop, across: [t0, t1], along: [t0, t1] }].
 */
export function lampShield(fixture) {
  const list = emittersOf(fixture);
  if (!list.length || faceKind(list) === 'pendants') return [];
  return list.map((e) => {
    const slim = Math.min(e.w, e.d) < SKIRT.slimUnder;
    const drop = slim ? SKIRT.dropSlim : SKIRT.drop, out = (slim ? SKIRT.outSlim : SKIRT.out) + (slim ? SKIRT.flareSlim : SKIRT.flare) - 0.017;
    const alongX = e.w >= e.d;
    const hl = (alongX ? e.w : e.d) / 2, hs = (alongX ? e.d : e.w) / 2;
    const tan = (h) => [r4(out / drop), r4((2 * h + out) / drop)];
    return {
      face: { cx: e.x, cz: e.z, hx: e.w / 2, hz: e.d / 2, y: e.y },
      rim: { cx: e.x, cz: e.z, hx: r4(e.w / 2 + out), hz: r4(e.d / 2 + out), y: r4(e.y - drop) },
      drop, across: tan(hs), along: tan(hl),
    };
  });
}

/** Node arm: throws on the first failure, returns the canopy's face. */
export function selfTest() {
  const canopy = [{ x: 0, y: 1.02, z: 0, w: 2.05, d: 0.66 }];
  const f = lampFace(canopy);
  const ok = (c, msg) => { if (!c) throw new Error(`lamp face: ${msg}`); };
  ok(f.kind === 'trough' && f.faces.length === 1 && f.panels.length === 3, 'the canopy has one face of three panels');
  const face = f.faces[0];
  // panels and bars tile the rectangle inside the border, exactly
  const sum = face.panels.reduce((s, p) => s + 2 * p.half[0], 0) + face.gaps.reduce((s, g) => s + 2 * g.half[0], 0) + 2 * face.frame.border;
  ok(Math.abs(sum - 2.05) < 1e-3, `panels + bars + border = ${sum}, want 2.05`);
  ok(Math.abs(face.panels[0].centre[0] + face.panels[2].centre[0]) < 1e-9 && Math.abs(face.panels[1].centre[0]) < 1e-9, 'the panels are symmetric about the centre');
  ok(face.tubes.length === 3 && Math.abs(face.tubes[2].offset - 0.1669) < 1e-3, 'three tube strips at the app pattern offsets');
  for (const e of [[{ x: 0, y: 1.15, z: 0, w: 2.984, d: 0.2 }], [{ x: 0.3, y: 1, z: -0.2, w: 0.35, d: 2.6 }]]) {
    const g = lampFace(e).faces[0];
    const s = g.panels.reduce((t, p) => t + 2 * p.half[g.long === 'x' ? 0 : 1], 0) + g.gaps.reduce((t, p) => t + 2 * p.half[g.long === 'x' ? 0 : 1], 0) + 2 * g.frame.border;
    ok(Math.abs(s - Math.max(e[0].w, e[0].d)) < 1e-3, 'a strip tiles along its long axis');
    ok(g.tubes.length === 1, 'a narrow face has one strip');
  }
  const p = lampFace([-0.55, 0, 0.55].map((x) => ({ x, y: 0.9, z: 0, w: 0.26, d: 0.26 })));
  ok(p.kind === 'pendants' && p.faces.length === 3 && p.faces[0].shape === 'disc', 'three small squares are pendants');
  ok(lampFace({ emitters: canopy }).panels.length === 3 && lampFace({ state: () => ({ emitters: canopy }) }).panels.length === 3, 'input forms');
  ok(lampFace(null) === null && lampFace([]) === null, 'no emitters, no face');
  const s = lampSpill(canopy);
  ok(s.length === 1 && s[0].type === 'tube' && s[0].position[1] === 1.049 && s[0].size[0] === 2.05 && s[0].size[1] === 0.39, 'the canopy spill');
  ok(JSON.stringify(lampSpillBaked()) === JSON.stringify(s), 'the baked spill is the canopy spill');
  const sh = lampShield(canopy);
  ok(sh.length === 1 && sh[0].rim.y === 0.93 && Math.abs(sh[0].rim.hz - 0.373) < 1e-9 && sh[0].across[0] < 0.5 && sh[0].across[1] > 7 && sh[0].along[1] > sh[0].across[1], 'the canopy shield');
  ok(lampShield([-0.55, 0, 0.55].map((x) => ({ x, y: 0.9, z: 0, w: 0.26, d: 0.26 }))).length === 0, 'turned shades have no skirt');
  return f;
}
