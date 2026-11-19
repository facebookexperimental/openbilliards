// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/floor/items.js — the furniture of the event as primitives of the club props' kit (owner: floor). Each function
// builds one item in the kit's current frame: origin on the floor, +z = the item's front, metres. Sizes come from
// floor/plan.js, colours are swatches of floor/paint.js, the chairs' upholstery is the leather batch.
//
// The builder's context `c`: K (the kit), B (the batches of the item's mesh group: hard, soft, contact, cast),
// sw(name) (a swatch as a kit uv), leather() (the upholstery's uv), detail (0, 1, 2), seg(n) (segments of a round part for
// this detail), look (the tool switches), part(name, fn) (everything fn appends is recorded as that part: the arm's list
// of what an item is made of), touch / touchBox / cast (the shadow overlays on the carpet).
//
// No item here is a person or shaped like one: no operator at a camera, nothing on a chair, nothing on a hook.
import * as THREE from 'three';
import { CAM, DESK, THRESHOLD, CABLE, PLATFORM, STOOL, TOWER, REMOTE, MONITOR, BIN, CUE_STAND, WORK_LIGHT, ROAD_CASE, TROLLEY, SPOT, BALLAST, SPARE, SCUFF, SPIKE, tilted } from './plan.js';

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * A tally lamp standing on the point `p` (the middle of its foot): a dark base, the diffuser, and the core that shows
 * through the diffuser's front and back. Lit: the core at the lamp's level, the diffuser round it at three tenths (the two
 * cells of the data canvas that carry an emissive mask); unlit: dark red plastic.
 */
function tallyLamp(c, p, lit) {
  const { K, B, sw } = c;
  // (the lite room: one block)
  if (c.detail === 0) { K.box(B.hard, [0.07, 0.022, 0.024], [p[0], p[1] + 0.011, p[2]], { uv: sw(lit ? 'tally' : 'tallyOff'), b: 0 }); return; }
  // TIER LINE (owner: floor): the base room's lamp is one block, as the lite room's
  if (c.detail === 1) { K.box(B.hard, [0.07, 0.022, 0.024], [p[0], p[1] + 0.011, p[2]], { uv: sw(lit ? 'tally' : 'tallyOff'), b: 0 }); return; }
  K.box(B.hard, [0.08, 0.005, 0.03], [p[0], p[1] + 0.0025, p[2]], { uv: sw('rubber'), b: 0 });
  K.box(B.hard, [0.07, 0.019, 0.022], [p[0], p[1] + 0.0145, p[2]], { uv: sw(lit ? 'tallyRim' : 'tallyOff'), b: 0 });
  K.box(B.hard, [0.05, 0.013, 0.027], [p[0], p[1] + 0.0145, p[2]], { uv: sw(lit ? 'tally' : 'tallyOff'), b: 0 });
}

/**
 * A broadcast camera on a wheeled pedestal at full height, in the frame of what it stands on (origin on the deck under
 * the pedestal's axis). `cam` = the plan's camera (pivotOverDeck = the tilt axis over the deck, tilt = lens down, tally =
 * its lamps are lit, lead = where its cable meets the deck, local [x, z]).
 */
export function tvCamera(c, cam) {
  const { K, B, sw, detail } = c;
  const lo = detail === 0, hi = detail >= 2;
  // TIER LINE (owner: floor): below the high room a camera's round parts take 0.7 of the tier's segments (the cameras
  // stand outside the app camera's reach: no review pose is nearer than 11 m)
  const seg = hi ? c.seg : (n) => c.seg(n * 0.7);
  const H = cam.pivotOverDeck, colTop = H - CAM.drop;
  const L = CAM.lens, HS = CAM.housing, F = CAM.finder;

  // grounding: the skirt's contact on the deck (the platform owns the shadow on the carpet)
  c.touch(0.9, 0.9, 0, 0, true);

  // ---- the pedestal: a moulded skirt over three twin wheels, a telescoping column run up, a steering ring
  c.part('skirt', () => K.lathe(B.hard, [[0.26, CAM.skirtLift], [0.322, CAM.skirtLift], [0.333, CAM.skirtLift + 0.016], [0.333, 0.105], [0.333, 0.105], [0.302, CAM.skirtH - 0.045], [0.284, CAM.skirtH - 0.02],
    [0.284, CAM.skirtH - 0.02], [0.17, CAM.skirtH], [0.088, CAM.skirtH]], [0, 0, 0], { segs: seg(18), uv: sw('skirt'), k: [0.8, 1] }));
  if (hi) c.part('bumper', () => K.lathe(B.hard, [[0.331, 0.062], [0.339, 0.068], [0.339, 0.094], [0.331, 0.1]], [0, 0, 0], { segs: seg(18), uv: sw('rubber') }));
  if (hi) c.part('wheel', () => {
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + (k * 2 * Math.PI) / 3, px = Math.cos(a) * 0.262, pz = Math.sin(a) * 0.262, tx = -Math.sin(a), tz = Math.cos(a);
      for (const s of [-1, 1]) K.tube(B.hard, [px + tx * (s * 0.021 - 0.012), 0.046, pz + tz * (s * 0.021 - 0.012)], [px + tx * (s * 0.021 + 0.012), 0.046, pz + tz * (s * 0.021 + 0.012)], 0.046, 0.046, { segs: 10, uv: sw('rubber'), caps: true, k: 0.7 });
    }
  });
  // the column: three stages, each narrower than the one it slides out of; the last one is bare chrome
  const base = CAM.skirtH - 0.004, span = colTop - base, yA = base + span * CAM.stages[0], yB = base + span * CAM.stages[1];
  if (lo) c.part('column', () => K.tube(B.hard, [0, base, 0], [0, colTop, 0], 0.09, 0.062, { segs: seg(12), uv: sw('column'), k: [0.8, 1] }));
  else {
    c.part('column', () => {
      K.tube(B.hard, [0, base, 0], [0, yA, 0], 0.092, 0.092, { segs: seg(14), uv: sw('column'), k: [0.8, 1] });
      K.tube(B.hard, [0, yA, 0], [0, yB, 0], 0.077, 0.077, { segs: seg(14), uv: sw('column') });
      K.lathe(B.hard, [[0.062, colTop - 0.022], [0.1, colTop - 0.02], [0.104, colTop - 0.011], [0.1, colTop], [0, colTop]], [0, 0, 0], { segs: seg(14), uv: sw('column') });
    });
    if (hi) c.part('collar', () => { for (const [y, r] of [[yA, 0.092], [yB, 0.077]]) K.lathe(B.hard, [[r, y - 0.03], [r + 0.011, y - 0.026], [r + 0.011, y - 0.004], [r - 0.013, y]], [0, 0, 0], { segs: seg(14), uv: sw('rubber') }); });
    c.part('stage', () => K.tube(B.hard, [0, yB, 0], [0, colTop - 0.02, 0], 0.062, 0.062, { segs: seg(14), uv: sw('chrome') }));
    // the steering ring: a tube round the column's top on three spokes
    const ringY = colTop - 0.15, ringR = 0.235, tr = 0.011, n = hi ? 6 : 3;
    c.part('ring', () => {
      const prof = [];
      for (let i = 0; i <= n; i++) { const a = (i / n) * 2 * Math.PI; prof.push([ringR + tr * Math.cos(a), ringY + tr * Math.sin(a)]); }
      K.lathe(B.hard, prof, [0, 0, 0], { segs: seg(22), uv: sw('rubber') });
    });
    c.part('spoke', () => { for (let k = 0; k < 3; k++) { const a = Math.PI / 6 + (k * 2 * Math.PI) / 3; K.tube(B.hard, [Math.cos(a) * 0.058, ringY, Math.sin(a) * 0.058], [Math.cos(a) * ringR, ringY, Math.sin(a) * ringR], 0.008, 0.008, { segs: c.trim ? 3 : 5, uv: sw('column') }); } });
  }

  // ---- the pan and tilt unit under the camera
  c.part('panTilt', () => {
    K.tube(B.hard, [0, colTop, 0], [0, colTop + 0.036, 0], 0.072, 0.072, { segs: seg(12), uv: sw('housing') });
    K.box(B.hard, [0.15, 0.08, 0.15], [0, colTop + 0.075, 0], { uv: sw('housing'), b: 0.008 });
  });

  // ---- everything that tilts: cradle, plate, lens supporter, housing, box lens, hood, finder, bars
  const T = new THREE.Matrix4().makeRotationX(cam.tilt).setPosition(0, H, 0);
  K.within(T, () => {
    c.part('cradle', () => {
      K.box(B.hard, [0.13, 0.03, 0.27], [0, 0.03, 0], { uv: sw('housing'), b: 0.006 });
      if (!lo) for (const s of [-1, 1]) K.tube(B.hard, [s * 0.066, 0, 0], [s * 0.095, 0, 0], 0.046, 0.046, { segs: seg(10), uv: sw('column'), caps: true });
    });
    if (hi) c.part('wedge', () => K.box(B.hard, [0.105, 0.022, 0.32], [0, 0.056, 0.03], { uv: sw('column'), b: 0.004 }));
    c.part('supporter', () => K.box(B.hard, [0.17, 0.026, 0.6], [0, 0.078, 0.14], { uv: sw('housing'), b: 0.005 }));
    c.part('housing', () => K.box(B.hard, [HS.w, HS.h, HS.z1 - HS.z0], [0, HS.y0 + HS.h / 2, (HS.z0 + HS.z1) / 2], { uv: sw('housing'), b: 0.012 }));
    c.part('lens', () => K.box(B.hard, [L.w, L.h, L.z1 - L.z0], [0, CAM.axis, (L.z0 + L.z1) / 2], { uv: sw('lens'), b: 0.014 }));
    // the hood: four thin plates round the front element
    c.part('hood', () => {
      const z0 = L.z1 - 0.012, z1 = CAM.hood.z1, zc = (z0 + z1) / 2, len = z1 - z0, hw = CAM.hood.w / 2, hh = CAM.hood.h / 2, t = 0.006;
      for (const s of [-1, 1]) {
        K.box(B.hard, [CAM.hood.w, t, len], [0, CAM.axis + s * (hh - t / 2), zc], { uv: sw('rubber'), b: 0, k: s > 0 ? 1 : 0.7 });
        K.box(B.hard, [t, CAM.hood.h - 2 * t, len], [s * (hw - t / 2), CAM.axis, zc], { uv: sw('rubber'), b: 0 });
      }
    });
    // ROUND A5, the dress (high room): the worn edges of a matt black camera, where the coat has gone satin: a thin
    // rounded rim along the hood's two top edges and its front top edge, and along the lens's two top edges. Under a
    // directed light these are what draws the camera's outline against a dark drape (CONTRACT 17.2).
    if (c.dress && hi) c.part('edge', () => {
      // (the blank plates' finish: the black class's lightest tone. In black anodised they stood 14 levels over the faces
      // beside them in the close frame shots/floor/h4-CAM.jpg, 42 on 28: a line too faint to draw an outline)
      const z0 = L.z1 - 0.012, z1 = CAM.hood.z1, hw = CAM.hood.w / 2, hh = CAM.hood.h / 2, q = Math.PI / 4, o = { uv: sw('label'), b: 0 };
      for (const s of [-1, 1]) {
        K.box(B.hard, [0.005, 0.005, z1 - z0 - 0.006], [s * (hw - 0.0022), CAM.axis + hh - 0.0022, (z0 + z1) / 2], { ...o, rz: q });
        K.box(B.hard, [0.005, 0.005, L.z1 - L.z0 - 0.045], [s * (L.w / 2 - 0.006), CAM.axis + L.h / 2 - 0.006, (L.z0 + L.z1) / 2 - 0.012], { ...o, rz: q });
      }
      K.box(B.hard, [CAM.hood.w - 0.012, 0.005, 0.005], [0, CAM.axis + hh - 0.0022, z1 - 0.0022], { ...o, rx: q });
    });
    c.part('bezel', () => {
      K.quad(B.hard, L.w - 0.016, L.h - 0.016, [0, CAM.axis, L.z1 + 0.0015], { uv: sw('rubber'), k: 0.6 });
      // (the front ring: matt, the pedestal skirt's finish. Anodised, its lower arc stood at 255 over a hundred pixels
      // in the close frame shots/floor/f6-CAM.jpg: the lamp box in a sheen at a grazing angle)
      if (!lo) K.lathe(B.hard, [[0.098, 0], [0.113, 0], [0.113, 0.02], [0.103, 0.025]], [0, CAM.axis, L.z1 + 0.002], { rx: Math.PI / 2, segs: seg(18), uv: sw('skirt') });
    });
    // the front tally: a small lamp on top of the lens, seen from where the lens looks: the ONE red point of a camera
    // on air (the finder's lamp behind it is built dark: it faces the operator's place, and nobody stands there)
    c.part('tally', () => tallyLamp(c, [0, CAM.axis + L.h / 2, L.z1 - 0.075], cam.tally && c.look.tally));
    // the front element: a shallow dome of coated glass (the hard material's mirror swatch: it carries the lit table)
    c.part('glass', () => {
      if (lo) K.disc(B.hard, 0.098, [0, CAM.axis, L.z1 + 0.004], { rx: Math.PI / 2, segs: 10, uv: sw('glass') });
      else K.lathe(B.hard, hi ? [[0.098, 0], [0.086, 0.011], [0.062, 0.021], [0.032, 0.027], [0, 0.029]] : [[0.098, 0], [0.066, 0.02], [0, 0.029]], [0, CAM.axis, L.z1 + 0.003], { rx: Math.PI / 2, segs: seg(18), uv: sw('glass') });
    });
    if (!lo) c.part('label', () => {
      // blank plates where a maker's name would be (high room)
      if (hi) for (const s of [-1, 1]) K.box(B.hard, [0.003, 0.055, 0.15], [s * (L.w / 2 + 0.0004), CAM.axis + 0.045, 0.21], { uv: sw('label'), b: 0 });
      if (hi) K.box(B.hard, [0.003, 0.04, 0.08], [-(HS.w / 2 + 0.0004), HS.y0 + 0.17, -0.2], { uv: sw('label'), b: 0 });
      // the dark band along the lens's lower third (its two-tone side)
      for (const s of [-1, 1]) K.box(B.hard, [0.003, 0.034, 0.43], [s * (L.w / 2 + 0.0004), CAM.axis - 0.075, 0.235], { uv: sw('rubber'), b: 0 });
    });
    // the camera's number plates: a grey card in a holder on the lens's side toward the floor and one on the lens's top
    // behind the tally, both BLANK (no numeral, no letter: a plain card; grey, albedo 0.17: an off-white one stood at
    // 210 of 255 on the lens's top in shots/floor/f1-V10.jpg, a second lamp beside the tally)
    if (!lo) c.part('plate', () => {
      K.box(B.hard, [0.004, 0.085, 0.085], [L.w / 2 + 0.0028, CAM.axis + 0.03, 0.385], { uv: sw('cover'), b: 0 });
      if (hi) {
        K.box(B.hard, [0.006, 0.097, 0.097], [L.w / 2 + 0.0012, CAM.axis + 0.03, 0.385], { uv: sw('rubber'), b: 0 });
        K.box(B.hard, [0.085, 0.07, 0.004], [0, CAM.axis + L.h / 2 + 0.036, L.z1 - 0.2], { rx: -0.25, uv: sw('cover'), b: 0 });
        K.box(B.hard, [0.097, 0.012, 0.012], [0, CAM.axis + L.h / 2 + 0.006, L.z1 - 0.192], { uv: sw('rubber'), b: 0 });
      }
    });
    if (hi) {
      c.part('vent', () => { for (let i = 0; i < 5; i++) K.box(B.hard, [0.003, 0.005, 0.11], [HS.w / 2 + 0.0004, HS.y0 + 0.05 + i * 0.013, -0.2], { uv: sw('rubber'), b: 0 }); });
      c.part('panel', () => {
        K.box(B.hard, [0.1, 0.085, 0.005], [0, HS.y0 + 0.07, HS.z0 - 0.002], { uv: sw('column'), b: 0 });
        // the lens's servo block and two rings on its near side, a strip of switches on the housing
        K.box(B.hard, [0.02, 0.05, 0.16], [-(L.w / 2 + 0.009), CAM.axis - 0.06, 0.12], { uv: sw('housing'), b: 0.004 });
        for (const z of [0.3, 0.37]) K.tube(B.hard, [-(L.w / 2 - 0.002), CAM.axis - 0.03, z], [-(L.w / 2 + 0.012), CAM.axis - 0.03, z], 0.016, 0.016, { segs: 8, uv: sw('column'), caps: true });
        K.box(B.hard, [0.003, 0.012, 0.09], [-(HS.w / 2 + 0.0004), HS.y0 + 0.11, -0.2], { uv: sw('column'), b: 0 });
        // four round sockets on the rear panel, a lock knob on each tilt drum
        for (let i = 0; i < 4; i++) K.tube(B.hard, [-0.033 + i * 0.022, HS.y0 + 0.045, HS.z0 - 0.004], [-0.033 + i * 0.022, HS.y0 + 0.045, HS.z0 - 0.017], 0.0075, 0.0075, { segs: 6, uv: sw('chrome'), caps: true });
        for (const s of [-1, 1]) K.tube(B.hard, [s * 0.095, 0, 0], [s * 0.118, 0, 0], 0.014, 0.011, { segs: 6, uv: sw('rubber'), caps: true });
      });
      // the carrying handle over the housing
      c.part('handle', () => {
        const y0 = HS.y0 + HS.h - 0.004, y1 = y0 + 0.042, za = HS.z0 + 0.06, zb = HS.z1 - 0.07, o = { segs: 6, uv: sw('column') };
        K.tube(B.hard, [0.045, y0, za], [0.045, y1, za + 0.02], 0.008, 0.008, o);
        K.tube(B.hard, [0.045, y1, za + 0.02], [0.045, y1, zb - 0.02], 0.009, 0.009, { segs: 6, uv: sw('rubber') });
        K.tube(B.hard, [0.045, y1, zb - 0.02], [0.045, y0, zb], 0.008, 0.008, o);
      });
      // two looms: the lens's servo cable hanging back to the housing, the finder's cable down its back
      c.part('loom', () => {
        const hang = (a, b, sag, n) => { for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, p = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]; K.tube(B.hard, p(t0), p(t1), 0.0045, 0.0045, { segs: 4, uv: sw('rubber') }); } };
        hang([-(L.w / 2 + 0.019), CAM.axis - 0.075, 0.05], [-(HS.w / 2 + 0.004), HS.y0 + 0.06, -0.09], 0.05, 5);
        hang([0.06, F.y - 0.06, F.z + 0.02], [0.05, HS.y0 + 0.12, HS.z0 - 0.004], 0.03, 4);
      });
    }
    // the finder behind the housing: a flat monitor leaning back under a visor, its lamp on top
    c.part('finder', () => K.box(B.hard, [0.035, 0.03, 0.1], [0, HS.y0 + HS.h - 0.012, HS.z0 - 0.02], { uv: sw('column'), b: 0.004 }));
    K.within(new THREE.Matrix4().makeRotationX(F.lean).setPosition(0, F.y, F.z), () => {
      c.part('finder', () => K.box(B.hard, [F.w, F.h, F.d], [0, 0, 0], { uv: sw('housing'), b: 0.008 }));
      // (round A5, the dress: the finder is ON and shows nothing: black glass with a dim neutral glow, paint.js GLOW)
      c.part('screen', () => K.quad(B.hard, F.w - 0.034, F.h - 0.038, [0, 0, -F.d / 2 - 0.0006], { ry: Math.PI, uv: sw(c.dress ? 'glowScreen' : 'screen') }));
      // the finder's hood: a deep shade of four thin plates round the screen (the top one longest), so the screen reads
      // under the hall's light
      if (!lo) c.part('visor', () => {
        const dp = F.hood, z0 = -F.d / 2;
        K.box(B.hard, [F.w + 0.006, 0.005, dp], [0, F.h / 2 + 0.0025, z0 - dp / 2], { uv: sw('rubber'), b: 0 });
        for (const s of [-1, 1]) K.box(B.hard, [0.005, F.h, dp * 0.86], [s * (F.w / 2 + 0.0005), 0, z0 - dp * 0.43], { uv: sw('rubber'), b: 0, k: [0.8, 1] });
        if (hi) K.box(B.hard, [F.w + 0.006, 0.005, dp * 0.6], [0, -F.h / 2 - 0.0025, z0 - dp * 0.3], { uv: sw('rubber'), b: 0, k: 0.7 });
      });
      c.part('tally', () => {
        // (round A4: dark on every camera. Lit with the front lamp it made two red points per camera at V10,
        // shots/floor/f2-V10.jpg; the lit swatch's cell carries the emissive mask, the dark one's does not)
        tallyLamp(c, [0, F.h / 2 + 0.005, 0.004], false);
      });
    });
    // the pan bars with their grips, the zoom demand on the near bar, the focus demand on the other
    if (!lo) for (const s of [-1, 1]) {
      const a = [s * 0.078, 0.02, -0.05], e = [s * CAM.bars.x, CAM.bars.y, CAM.bars.z], m = lerp3(a, e, 0.64);
      c.part('bar', () => K.tube(B.hard, a, m, 0.0105, 0.0105, { segs: 6, uv: sw('column') }));
      c.part('grip', () => K.tube(B.hard, m, e, 0.018, 0.018, { segs: seg(8), uv: sw('rubber'), caps: true }));
      const d = lerp3(a, e, 0.56);
      if (s < 0) c.part('zoom', () => K.box(B.hard, [0.04, 0.045, 0.07], [d[0], d[1] + 0.03, d[2]], { uv: sw('housing'), b: 0.006 }));
      else c.part('focus', () => K.tube(B.hard, [d[0] - 0.022, d[1] + 0.03, d[2]], [d[0] + 0.022, d[1] + 0.03, d[2]], 0.026, 0.026, { segs: seg(10), uv: sw('housing'), caps: true }));
    }
    // (round A7, TIER LINE: the base room under the round's geometry builds no connector and a three-sided cable: the
    // camera is 11 m and more from every pose, and the west corner takes the triangles)
    if (!lo && !c.trim) c.part('connector', () => K.tube(B.hard, [CAM.connector.x, CAM.connector.y, CAM.connector.z + 0.004], [CAM.connector.x, CAM.connector.y, CAM.connector.z - 0.03], 0.012, 0.012, { segs: 6, uv: sw('column'), caps: true }));
  });

  // ---- the cables from the housing to the deck beside the skirt (the platform's drop takes them on from there): a
  // service loop under the housing, then TIED ALONG THE PEDESTAL: down the column inside the steering ring, held by
  // three ties, over the skirt's shoulder and down its side to the deck. The high room runs a second, thinner cable
  // beside the first and lets it hang a little off the column between the ties.
  if (!lo && cam.lead) {
    const [, py, pz] = tilted([CAM.connector.x, CAM.connector.y, CAM.connector.z - 0.03], cam.tilt);
    const p0 = [CAM.connector.x, H + py, pz], end = [cam.lead[0], CABLE.ridge * 0.6, cam.lead[1]];
    const ll = Math.hypot(cam.lead[0], cam.lead[1]) || 1, ux = cam.lead[0] / ll, uz = cam.lead[1] / ll;
    const base = CAM.skirtH - 0.004, span = colTop - base, yA = base + span * CAM.stages[0], yB = base + span * CAM.stages[1];
    // the column's radius at a height (its three stages), and the point on its side toward the cable's way out
    const colR = (y) => (y < yA ? 0.092 : y < yB ? 0.077 : 0.062);
    const on = (y, off = 0.012, side = 0) => [ux * (colR(y) + off) - uz * side, y, uz * (colR(y) + off) + ux * side];
    const ties = [colTop - 0.3, (yA + yB) / 2, base + span * 0.2];
    const run = (r, side, slack) => {
      // the loop under the housing: from the connector back and down, then in to the column's top stage
      const pts = [p0, [p0[0], p0[1] - 0.16, p0[2] - 0.11], [ux * 0.16 - uz * side, colTop - 0.12, uz * 0.16 + ux * side - 0.06], on(colTop - 0.22, r + 0.004, side)];
      // TIER LINE (owner: floor): the base room's cable touches the column at the middle tie only
      for (let i = hi ? 0 : 1; i < (hi ? ties.length : 2); i++) {
        pts.push(on(ties[i], r + 0.002, side));
        // (between two ties the cable stands a little off the column)
        if (hi && i + 1 < ties.length) pts.push(on((ties[i] + ties[i + 1]) / 2, r + 0.004 + slack, side));
      }
      // over the skirt's shoulder, down its side, onto the deck
      pts.push(on(base + 0.035, r + 0.004, side), [ux * 0.2 - uz * side, CAM.skirtH + r + 0.004, uz * 0.2 + ux * side]);
      if (hi) pts.push([ux * 0.296 - uz * side, CAM.skirtH - 0.016 + r, uz * 0.296 + ux * side]);
      pts.push([ux * 0.343 - uz * side, 0.105, uz * 0.343 + ux * side], [ux * 0.35 - uz * side, 0.03, uz * 0.35 + ux * side], [end[0] - uz * side, end[1], end[2] + ux * side]);
      for (let i = 0; i + 1 < pts.length; i++) K.tube(B.hard, pts[i], pts[i + 1], r, r, { segs: hi ? 5 : c.trim ? 3 : 4, uv: sw('rubber') });
    };
    c.part('lead', () => { run(0.0065, 0, 0.012); if (hi) run(0.004, 0.014, 0.022); });
    // the ties: a band round the column and the cables at each height (black hook-and-loop strap); the high room
    if (hi) c.part('tie', () => {
      for (const y of ties) {
        const rr = colR(y) + 0.0025;
        K.tube(B.hard, [0, y - 0.011, 0], [0, y + 0.011, 0], rr, rr, { segs: 12, uv: sw('rubber') });
        const q = on(y, 0.0085, 0.006);
        K.box(B.hard, [0.03, 0.022, 0.03], q, { ry: Math.atan2(ux, uz), uv: sw('rubber'), b: 0 });
      }
    });
  }
}

// a fixed hash of two small integers -> [0, 1) (no randomness: the same wear on every load)
function hash01(a, b) {
  let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/**
 * What use leaves on a platform's deck (both kinds of platform), in the frame of the deck's centre with its top at `h`:
 *   wear    the paint worn through to the board: a broken line along the step-up edge behind the nosing, scuffed
 *           patches where somebody stands behind the pedestal, the four corners (high room), short runs along the
 *           other edges (high room);
 *   mark    pale tape on the deck: three short strips at the pedestal's rim (where its wheels were set down), and a
 *           strip of black tape across the cable where it leaves the skirt. Straight strips only: nothing shaped like
 *           a letter or a numeral;
 *   cover   the camera's rain cover, folded, lying in a corner of the deck (`p.cover`).
 * `seed` = a small integer per platform, so two decks are not worn alike.
 */
function deckDress(c, p, h, seed) {
  const { K, B, sw, detail } = c;
  if (detail === 0) return;
  const hi = detail >= 2, hw = p.w / 2, hd = p.d / 2, FLAT = -Math.PI / 2, y = h + 0.0016;
  const SIDES = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
  const [ox, oz] = SIDES[p.open] ?? [1, 0];
  // a flat patch `along` x `across` whose long side runs along the edge with the outward normal (nx, nz)
  const patch = (nx, nz, t, inset, along, across, sw0 = 'wear') => K.quad(B.hard, nx ? across : along, nx ? along : across, [nx ? nx * (hw - inset - across / 2) : t, y, nz ? nz * (hd - inset - across / 2) : t], { rx: FLAT, uv: sw(sw0) });
  c.part('wear', () => {
    // the step-up edge: behind the nosing, a broken line of bare board
    const len = (ox ? p.d : p.w) - 0.1, n = hi ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const u = hash01(seed, i), v = hash01(seed + 7, i);
      const along = (len / n) * (0.35 + 0.5 * u), t = -len / 2 + (i + 0.5) * (len / n) + (v - 0.5) * 0.06;
      patch(ox, oz, t, PLATFORM.nosing + 0.006, along, 0.012 + 0.022 * v);
    }
    // where somebody stands, behind the pedestal (a platform on a block: its rear; a riser: the cover's side of the deck)
    const [bx, bz] = p.rear ? SIDES[p.rear] : [0, Math.sign(p.cover?.z || 1)];
    for (let i = 0; i < (hi ? 3 : 1); i++) {
      const u = hash01(seed + 3, i), v = hash01(seed + 5, i);
      const out = Math.min((bx ? hw : hd) - 0.2, 0.36 + 0.07 * i), off = (0.08 + 0.2 * u) * (i === 1 ? -1 : 1), a = 0.09 + 0.1 * u, b = 0.05 + 0.07 * v;
      K.quad(B.hard, bx ? b : a, bx ? a : b, [bx ? bx * out : off, y, bz ? bz * out : off], { rx: FLAT, uv: sw('wear') });
    }
    if (hi) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.quad(B.hard, 0.035, 0.035, [sx * (hw - 0.05), y, sz * (hd - 0.05)], { rx: FLAT, uv: sw('wear') });
      for (const [name, [nx, nz]] of Object.entries(SIDES)) {
        if (name === p.open) continue;
        const u = hash01(seed + 11, nx + 2 * nz + 3);
        patch(nx, nz, ((nx ? p.d : p.w) / 2 - 0.3) * (2 * u - 1), PLATFORM.kickIn + PLATFORM.kickT + 0.004, 0.1 + 0.16 * u, 0.012);
      }
    }
  });
  c.part('mark', () => {
    const r = CAM.skirtR + 0.045;
    for (let k = 0; k < 3; k++) {
      // (axis-aligned strips: one toward each of three sides of the pedestal)
      const [nx, nz] = [[0, 1], [1, 0], [-1, 0]][k], lean = (hash01(seed + 13, k) - 0.5) * 0.08;
      K.quad(B.hard, nx ? 0.07 : 0.024, nx ? 0.024 : 0.07, [nx * r + (nx ? 0 : lean), y + 0.0004, nz * r + (nz ? 0 : lean)], { rx: FLAT, uv: sw('cover') });
    }
    if (p.lead && c.look.cables) {
      // (a strip of tape pressed over the cable: a low ridge across it)
      const l = Math.hypot(p.lead[0], p.lead[1]) || 1;
      K.box(B.hard, [0.11, 0.0175, 0.048], [(p.lead[0] / l) * (l + 0.07), h + 0.0088, (p.lead[1] / l) * (l + 0.07)], { ry: Math.atan2(p.lead[0], p.lead[1]), uv: sw('tape'), b: 0.006 });
    }
  });
  if (p.cover) c.part('cover', () => {
    // three folds of a coated cloth, each a little smaller and turned a little; a strap round the bundle (high room)
    const { x, z, ry } = p.cover;
    if (!hi) { K.box(B.hard, [0.34, 0.05, 0.24], [x, h + 0.025, z], { ry, uv: sw('cover'), b: 0, k: [0.8, 1] }); return; }
    K.box(B.hard, [0.34, 0.022, 0.24], [x, h + 0.011, z], { ry, uv: sw('cover'), b: 0.008, k: [0.8, 1] });
    K.box(B.hard, [0.325, 0.02, 0.225], [x + 0.004, h + 0.031, z - 0.003], { ry: ry + 0.05, uv: sw('cover'), b: 0.008 });
    {
      K.box(B.hard, [0.3, 0.018, 0.2], [x - 0.006, h + 0.049, z + 0.004], { ry: ry - 0.04, uv: sw('cover'), b: 0.008 });
      K.box(B.hard, [0.026, 0.062, 0.25], [x + 0.05 * Math.cos(ry), h + 0.031, z - 0.05 * Math.sin(ry)], { ry, uv: sw('rubber'), b: 0.002 });
    }
  });
}

/**
 * A camera platform, square to the hall, in the frame of its centre on the floor: a deck of painted board on a frame of
 * steel box section with posts and foot plates, a kick rail on the three sides that do not carry the step-up, a pale
 * nosing on the step-up side, and the camera cable's drop over that side. `p` = the plan's platform (w, d, h, open,
 * lead / exit / land as local [x, z]).
 */
export function platform(c, p) {
  if (p.zone === 'stand') { tower(c, p); return; }
  const { K, B, sw, detail } = c;
  const T = PLATFORM, hw = p.w / 2, hd = p.d / 2, h = p.h, under = h - T.board, f = T.frame;
  const lo = detail === 0, hi = detail >= 2;
  const SIDES = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
  // grounding: the dark under the deck (contact-size at its rim), the wide soft shadow of the platform and what stands on it
  c.touchBox(p.w + 0.06, p.d + 0.06, 0, 0);
  c.cast(p.w + 1.3, p.d + 1.3, 0, 0);
  c.part('deck', () => K.box(B.hard, [p.w, T.board, p.d], [0, h - T.board / 2, 0], { uv: sw('deck'), b: 0.003 }));
  // the joint between the deck's two boards
  if (hi) c.part('joint', () => K.quad(B.hard, 0.004, p.d - 0.012, [0, h + 0.0006, 0], { rx: -Math.PI / 2, uv: sw('rubber') }));
  deckDress(c, p, h, Math.round(Math.abs(p.x * 7 + p.z * 13)));
  // the frame under the board: a ring of box section and a middle rail
  const fx = hw - T.inset - f / 2, fz = hd - T.inset - f / 2;
  if (!lo) c.part('frame', () => {
    for (const s of [-1, 1]) {
      K.box(B.hard, [2 * fx + f, f, f], [0, under - f / 2, s * fz], { uv: sw('steel'), b: 0 });
      K.box(B.hard, [f, f, 2 * fz - f], [s * fx, under - f / 2, 0], { uv: sw('steel'), b: 0 });
    }
    K.box(B.hard, [f, f, 2 * fz - f], [0, under - f / 2, 0], { uv: sw('steel'), b: 0, k: 0.75 });
  });
  // posts at the corners and, off the lite room, at the middle of each side; a foot plate under each
  // TIER LINE (owner: floor): the posts at the middle of each side are the high room's
  const posts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [sx * fx, sz * fz]);
  if (hi) posts.push([0, -fz], [0, fz], [-fx, 0], [fx, 0]);
  const postTop = lo ? under : under - f, postW = f * 0.9;
  c.part('post', () => { for (const [x, z] of posts) K.box(B.hard, [postW, postTop - T.footH, postW], [x, (postTop + T.footH) / 2, z], { uv: sw('steel'), b: 0, k: [0.7, 1] }); });
  if (hi) c.part('foot', () => { for (const [x, z] of posts) K.box(B.hard, [T.footW, T.footH, T.footW], [x, T.footH / 2 + 0.0004, z], { uv: sw('steel'), b: 0 }); });
  // the kick rail: a board on edge along every side but the step-up
  c.part('kick', () => {
    for (const [name, [nx, nz]] of Object.entries(SIDES)) {
      if (name === p.open) continue;
      const size = nx ? [T.kickT, T.kick, p.d - 2 * T.kickIn] : [p.w - 2 * T.kickIn, T.kick, T.kickT];
      K.box(B.hard, size, [nx * (hw - T.kickIn - T.kickT / 2), h + T.kick / 2, nz * (hd - T.kickIn - T.kickT / 2)], { uv: sw('deck'), b: 0.003, k: [0.9, 1] });
    }
  });
  // steel angle brackets hold the kick rail to the deck: two per side, on its inner face
  if (hi) c.part('bracket', () => {
    for (const [name, [nx, nz]] of Object.entries(SIDES)) {
      if (name === p.open) continue;
      const along = nx ? p.d : p.w, ins = T.kickIn + T.kickT;
      for (const s of [-1, 1]) {
        const t = s * along * 0.3;
        K.box(B.hard, nx ? [0.04, 0.003, 0.04] : [0.04, 0.003, 0.04], [nx ? nx * (hw - ins - 0.02) : t, h + 0.0015, nz ? nz * (hd - ins - 0.02) : t], { uv: sw('steel'), b: 0 });
        K.box(B.hard, nx ? [0.003, 0.06, 0.04] : [0.04, 0.06, 0.003], [nx ? nx * (hw - ins - 0.0015) : t, h + 0.03, nz ? nz * (hd - ins - 0.0015) : t], { uv: sw('steel'), b: 0 });
      }
    }
  });
  // the pale nosing along the step-up side
  const [ox, oz] = SIDES[p.open] ?? [1, 0];
  if (!lo) c.part('nosing', () => K.box(B.hard, ox ? [T.nosing, 0.003, p.d - 0.02] : [p.w - 0.02, 0.003, T.nosing], [ox * (hw - T.nosing / 2 - 0.004), h + 0.0012, oz * (hd - T.nosing / 2 - 0.004)], { uv: sw('nosing'), b: 0 }));
  // the cable's drop: along the deck from beside the pedestal, over the deck's edge on the cable's side (over the kick
  // rail when that side is not the step-up), down to the carpet
  if (!lo && p.lead && p.exit && p.land && c.look.cables) {
    const [qx, qz] = SIDES[p.cableSide ?? p.open] ?? [ox, oz];
    const y = CABLE.ridge * 0.6, S = p.lead, E = p.exit, D = p.land, over = (p.cableSide ?? p.open) !== p.open;
    const top = h + T.kick + 0.006, in0 = T.kickIn + T.kickT;
    const pts = [[S[0], h + y, S[1]], ...(over
      ? [[E[0] - qx * (in0 + 0.07), h + y, E[1] - qz * (in0 + 0.07)], [E[0] - qx * (in0 + 0.012), top, E[1] - qz * (in0 + 0.012)], [E[0] - qx * (T.kickIn - 0.008), top, E[1] - qz * (T.kickIn - 0.008)], [E[0] + qx * 0.02, h - 0.03, E[1] + qz * 0.02]]
      : [[E[0] - qx * 0.06, h + y, E[1] - qz * 0.06], [E[0] + qx * 0.006, h + 0.004, E[1] + qz * 0.006]]),
    [E[0] + qx * 0.03, h * 0.55, E[1] + qz * 0.03], [D[0] - qx * 0.035, 0.035, D[1] - qz * 0.035], [D[0] + qx * 0.03, y, D[1] + qz * 0.03]];
    c.part('drop', () => { for (let i = 0; i + 1 < pts.length; i++) K.tube(B.hard, pts[i], pts[i + 1], 0.0065, 0.0065, { segs: 5, uv: sw('rubber') }); });
  }
}

/**
 * A scaffold platform on a seating block, in the frame of the deck's centre on the FLOOR (heights above the floor), as
 * a broadcast crew dresses one in a hall: the deck (board, toe boards, nosing at the open end) with a BLACK SKIRT hanging
 * from its edge to the rows on the front and on both ends (a cloth in uneven pipes that breaks on the treads; the two
 * lengths of each end overlap where the row steps: the way in); a guard rail in black tube, with a mid rail, on the three
 * closed sides; the camera's cable over the open end, down the skirt's face to the row and under the hem. Behind the
 * skirt (the high room builds it; no pose sees it): the frame, two bearers, four standards of scaffold tube on base
 * plates with screw jacks, standing on two rows' walkways at seat centres. `p` = the plan's tower (planTower: legs,
 * steps, open, rear, exit, lead, cover). The folded seats under it are the surround's.
 */
function tower(c, p) {
  const { K, B, sw, detail } = c;
  const T = PLATFORM, W = TOWER, hw = p.w / 2, hd = p.d / 2, h = p.h, f = T.frame, under = h - T.board;
  const lo = detail === 0, hi = detail >= 2;
  const SIDES = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };
  const [ox, oz] = SIDES[p.open] ?? [1, 0], [rx] = SIDES[p.rear] ?? [0, -1];
  const depthX = rx !== 0;                 // the rows' depth runs along x (an east or west block), else along z
  const segs = hi ? 8 : 5;
  const tube = (a, b, r = W.tube, uv = 'steel') => K.tube(B.hard, a, b, r, r, { segs, uv: sw(uv) });
  // (the lite room's members: a square bar between two points that differ along one axis)
  const bar = (a, b, t) => K.box(B.hard, [0, 1, 2].map((i) => Math.abs(b[i] - a[i]) || t), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], { uv: sw('skirt'), b: 0 });
  c.part('deck', () => K.box(B.hard, [p.w, T.board, p.d], [0, h - T.board / 2, 0], { uv: sw('deck'), b: 0.003 }));
  if (hi) c.part('joint', () => K.quad(B.hard, depthX ? p.w - 0.012 : 0.004, depthX ? 0.004 : p.d - 0.012, [0, h + 0.0006, 0], { rx: -Math.PI / 2, uv: sw('rubber') }));
  // (round A7, TIER LINE: the base room under the round's geometry leaves the deck's wear, marks and folded cover out:
  // the deck stands 3.2 m over the floor and every pose looks at it from below)
  if (!c.trim) deckDress(c, p, h, Math.round(Math.abs(p.x * 7 + p.z * 13)));
  // TIER LINE (owner: floor): what the skirt hides is the high room's alone: the frame under the board, the two bearers,
  // the four standards on their base plates and screw jacks
  const fx = hw - T.inset - f / 2, fz = hd - T.inset - f / 2, bearY = under - f - W.tube, legs = p.legs ?? [];
  if (hi) {
    c.part('frame', () => {
      for (const s of [-1, 1]) {
        K.box(B.hard, [2 * fx + f, f, f], [0, under - f / 2, s * fz], { uv: sw('steel'), b: 0 });
        K.box(B.hard, [f, f, 2 * fz - f], [s * fx, under - f / 2, 0], { uv: sw('steel'), b: 0 });
      }
    });
    c.part('standard', () => { for (const l of legs) tube([l.x, l.base + W.plateT + W.jack, l.z], [l.x, under - f, l.z]); });
    c.part('jack', () => {
      for (const l of legs) {
        K.box(B.hard, [W.plate, W.plateT, W.plate], [l.x, l.base + W.plateT / 2 + 0.0005, l.z], { uv: sw('steel'), b: 0 });
        tube([l.x, l.base + W.plateT, l.z], [l.x, l.base + W.plateT + W.jack, l.z], W.jackR);
        tube([l.x, l.base + W.plateT + W.jack - 0.03, l.z], [l.x, l.base + W.plateT + W.jack, l.z], 0.034);
      }
    });
    c.part('ledger', () => {
      // a bearer across the two standards of each end, from the deck's front frame rail to its rear one
      const reach = (depthX ? fx : fz) + f / 2;
      for (const e of [0, 1]) {
        const a = legs.find((l) => l.end === e && l.line === 0);
        if (a) tube(depthX ? [-reach, bearY, a.z] : [a.x, bearY, -reach], depthX ? [reach, bearY, a.z] : [a.x, bearY, reach]);
      }
    });
  }
  // THE BLACK SKIRT: hung from the deck's edge on the front and on both ends, down to the row under it. A cloth in
  // uneven pipes (their widths warped, each with its own depth, from a fixed hash) that kicks out where it breaks on
  // the tread; the high room's alone has the pipes, the base room's hangs in flat lengths, the lite room's is one quad
  // a side. Black cotton, the desk cloth's swatch.
  const steps = p.steps?.length ? p.steps : [{ from: 0, to: depthX ? p.w : p.d, h: 0 }];
  const [rdx, rdz] = SIDES[p.rear] ?? [0, -1], D = depthX ? hw : hd, A2 = depthX ? hd : hw, drapeTop = h - 0.003;
  // a point of the deck's outline: `t` metres behind the front edge, `s` = -1 | 1 the low | high end along the rows
  const edge = (t, s) => (depthX ? [rdx * (t - D), s * A2] : [s * A2, rdz * (t - D)]);
  const [cu, cv] = sw('cloth').s;
  const hang = (a, b, n, bottom, seed, lift = 0) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len;
    const cols = lo ? 1 : hi ? Math.max(2, Math.round(len / 0.07)) : Math.max(1, Math.round(len / 0.45));
    // rows: [share of the height from the top, share of the pipes' depth]; the last one is the break on the tread
    const rows = hi ? [[0, 0], [0.4, 0.55], [0.975, 1], [1, 1.6]] : [[0, 0], [1, 0.6]], nr = rows.length;
    const pipes = Math.max(1, Math.round(len / 0.2)), depth = 0.016;
    const waveAt = (t) => { const q = pipes * (t + 0.07 * Math.sin(2 * Math.PI * (1.31 * t + 0.173 * seed)) * Math.sin(Math.PI * t)), k = Math.min(pipes - 1, Math.max(0, Math.floor(q))); return (0.4 + 0.6 * hash01(seed, k)) * (1 - Math.cos(2 * Math.PI * q)) / 2; };
    const P = [], N = [], UV = [], Q = [], C = [];
    for (let i = 0; i <= cols; i++) {
      const t = i / cols, e = 0.004, wv = hi ? waveAt(t) : 0, slope = hi ? (waveAt(t + e) - waveAt(t - e)) / (2 * e * len) : 0;
      for (const [fy, fr] of rows) {
        const out = 0.006 + lift + depth * fr * wv;
        P.push(a[0] + tx * len * t + n[0] * out, drapeTop - (drapeTop - bottom) * fy, a[1] + tz * len * t + n[1] * out);
        N.push(n[0] - tx * depth * fr * slope, 0.04, n[1] - tz * depth * fr * slope); UV.push(cu, cv);
        // (a pipe's valley sees less of the hall than its ridge, the more the lower it hangs)
        C.push((1 - 0.08 * fy) * (1 - 0.28 * Math.min(1, fr) * (1 - wv)));
      }
    }
    // (counter-clockwise from outside, whichever way the length runs)
    const ccw = tz * n[0] - tx * n[1] > 0;
    for (let i = 0; i < cols; i++) for (let r = 0; r + 1 < nr; r++) Q.push(ccw ? [i * nr + r, (i + 1) * nr + r, (i + 1) * nr + r + 1, i * nr + r + 1] : [i * nr + r, i * nr + r + 1, (i + 1) * nr + r + 1, (i + 1) * nr + r]);
    K.raw(B.hard, P, N, UV, Q, C);
  };
  c.part('drape', () => {
    const seed = Math.round(Math.abs(p.x * 5 + p.z * 3));
    // the front: one length between the two front corners, down to the front row
    hang(edge(0, -1), edge(0, 1), [-rdx, -rdz], steps[0].h + 0.005, seed);
    // each end: a length per row under it (the lower one stops a few millimetres short of the next row's riser); where
    // the row steps the next length overlaps the last (a hand's width, a finger outside it): the way in on the open end
    for (const s of [-1, 1]) {
      const n = depthX ? [0, s] : [s, 0];
      steps.forEach((st, i) => hang(edge(Math.max(0, st.from - (i ? 0.09 : 0)), s), edge(st.to - (i + 1 < steps.length ? 0.004 : 0), s), n, st.h + 0.005, seed + 3 + i + (s > 0 ? 7 : 0), i ? 0.012 : 0));
    }
  });
  // the guard rail, in black tube: a post at each corner of the deck, a top rail and a mid rail on the three closed sides
  // (a matt powder coat, the pedestal skirt's finish: an anodised sheen drew a bright line along every tube at 13 m)
  const cx = hw - 0.035, cz = hd - 0.035, top = h + W.rail - W.post;
  c.part('rail', () => {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      // (round A6, TIER LINE: under the round's set the lite room's posts are three-sided bars of the same width: the
      // work lamp's mast and can take the 24 triangles that frees, and the lite room stays at its 900)
      if (lo && c.a6) K.tube(B.hard, [sx * cx, h, sz * cz], [sx * cx, top, sz * cz], 0.023, 0.023, { segs: 3, uv: sw('skirt') });
      else if (lo) bar([sx * cx, h, sz * cz], [sx * cx, top, sz * cz], 0.04); else tube([sx * cx, h, sz * cz], [sx * cx, top + W.post, sz * cz], W.post, 'skirt');
    }
    for (const [name, [nx, nz]] of Object.entries(SIDES)) {
      if (name === p.open) continue;
      const a = nx ? [nx * cx, 0, -cz] : [-cx, 0, nz * cz], b = nx ? [nx * cx, 0, cz] : [cx, 0, nz * cz];
      if (lo) { bar([a[0], top, a[2]], [b[0], top, b[2]], 0.04); continue; }
      tube([a[0], top, a[2]], [b[0], top, b[2]], W.post, 'skirt');
      // (TIER LINE, owner: floor: the mid rail is the high room's)
      if (hi) tube([a[0], h + W.mid, a[2]], [b[0], h + W.mid, b[2]], W.post, 'skirt');
    }
  });
  // the toe boards: a board on edge along every closed side
  if (!lo) c.part('kick', () => {
    for (const [name, [nx, nz]] of Object.entries(SIDES)) {
      if (name === p.open) continue;
      const size = nx ? [T.kickT, T.kick, p.d - 2 * T.kickIn - 0.08] : [p.w - 2 * T.kickIn - 0.08, T.kick, T.kickT];
      K.box(B.hard, size, [nx * (hw - T.kickIn - T.kickT / 2), h + T.kick / 2, nz * (hd - T.kickIn - T.kickT / 2)], { uv: sw('deck'), b: 0.003, k: [0.9, 1] });
    }
  });
  if (!lo) c.part('nosing', () => K.box(B.hard, ox ? [T.nosing, 0.003, p.d - 0.1] : [p.w - 0.1, 0.003, T.nosing], [ox * (hw - T.nosing / 2 - 0.004), h + 0.0012, oz * (hd - T.nosing / 2 - 0.004)], { uv: sw('nosing'), b: 0 }));
  // the cable: along the deck from beside the pedestal, over the open end's edge above the rear-most row under the deck,
  // down the skirt's face to that row's walkway and under the skirt's hem (its run from there is behind the cloth)
  if (!lo && p.lead && p.exit && p.land && c.look.cables) {
    const y = CABLE.ridge * 0.6, S = p.lead, E = p.exit, r = 0.0065, g = p.landH, face = W.hang - 0.01;
    const at = (o, yy) => [E[0] + ox * o, yy, E[1] + oz * o];
    const pts = [[S[0], h + y, S[1]], at(-0.06, h + y), at(0.01, h + 0.006), at(face - 0.008, h - 0.05), at(face, h - 0.22),
      at(face, g + 0.14), at(W.hang, g + 0.035), at(0.03, g + r), at(-0.06, g + r)];
    c.part('drop', () => { for (let i = 0; i + 1 < pts.length; i++) K.tube(B.hard, pts[i], pts[i + 1], r, r, { segs: c.trim ? 3 : 5, uv: sw('rubber') }); });
  }
}

/** A folding stool in the frame of where it stands: two crossed frames of steel tube under a padded seat. Empty. */
export function stool(c) {
  const { K, B, sw, detail } = c;
  const S = STOOL, hi = detail >= 2;
  const x = S.w / 2 - 0.022, top = S.h - S.pad, r = S.tube, o = { segs: hi ? 8 : 5, uv: sw('steel') };
  c.touch(0.36, 0.4, 0, 0);
  c.part('seat', () => K.box(B.hard, [S.w, S.pad, S.d], [0, S.h - S.pad / 2, 0], { uv: sw('pad'), b: 0.008 }));
  // each frame: two struts from the floor on one side to the seat's far edge, a rung between its feet
  c.part('strut', () => {
    for (const s of [-1, 1]) {
      K.tube(B.hard, [s * x, r, -S.spread], [s * x, top, S.d / 2 - 0.03], r, r, o);
      K.tube(B.hard, [s * (x - 0.028), r, S.spread], [s * (x - 0.028), top, -S.d / 2 + 0.03], r, r, o);
    }
  });
  c.part('rung', () => {
    K.tube(B.hard, [-x, r, -S.spread], [x, r, -S.spread], r, r, o);
    K.tube(B.hard, [-(x - 0.028), r, S.spread], [x - 0.028, r, S.spread], r, r, o);
    if (hi) for (const z of [S.d / 2 - 0.03, -S.d / 2 + 0.03]) K.tube(B.hard, [-x, top - r, z], [x, top - r, z], r, r, o);
  });
  if (hi) c.part('tip', () => {
    const t = r * 1.45;
    for (const s of [-1, 1]) {
      K.tube(B.hard, [s * x - s * 0.012, t, -S.spread], [s * x + s * 0.012, t, -S.spread], t, t, { segs: 6, uv: sw('rubber'), caps: true });
      K.tube(B.hard, [s * (x - 0.028) - s * 0.012, t, S.spread], [s * (x - 0.028) + s * 0.012, t, S.spread], t, t, { segs: 6, uv: sw('rubber'), caps: true });
    }
  });
}

/**
 * A loose leather cushion: a slab whose top is pillowed (it rolls down toward its rim) and sat in (a shallow dip a little
 * behind its middle), so the hall's light falls off across it instead of lying flat on a box. size [w, thickness, d] in
 * the frame `m` (the top is the frame's +y); `uv` = the upholstery's uv ({ w } tiles, { s } a swatch); k = [bottom, top].
 */
function pillow(c, batch, [w, h, d], m, { uv, k = [0.8, 1], sag = 0.012, roll = 0.03, n = 4, creases = null } = {}) {
  // a crease: a soft valley along the segment (u0, v0)-(u1, v1) of the top, `depth` deep and `width` wide (in u, v units)
  const valley = (u, v) => {
    let s = 0;
    for (const [u0, v0, u1, v1, depth, width] of creases ?? []) {
      const du = u1 - u0, dv = v1 - v0, t = Math.max(0, Math.min(1, ((u - u0) * du + (v - v0) * dv) / (du * du + dv * dv)));
      const dist = Math.hypot(u - u0 - du * t, v - v0 - dv * t);
      s += depth * Math.exp(-((dist / width) ** 2));
    }
    return s;
  };
  const top = (u, v) => {
    const rim = Math.max(Math.abs(u), Math.abs(v));
    return h / 2 - (rim > 0.5 ? roll * ((rim - 0.5) / 0.5) ** 2 : 0) - sag * Math.max(0, 1 - (u * u + (v + 0.15) ** 2) / 0.6) - valley(u, v);
  };
  // (a valley sees less of the hall: its floor is shaded by its depth)
  const shadeAt = (u, v) => (creases ? k[1] * (1 - Math.min(0.3, valley(u, v) * 60)) : k[1]);
  const P = [], N = [], UV = [], Q = [], C = [], g = n + 1, e = 0.02, rep = uv?.w ?? 0;
  const put = (x, y, z, nx, ny, nz, shade, s, t) => { P.push(x, y, z); N.push(nx, ny, nz); if (rep) UV.push(s / rep, t / rep); else UV.push(uv.s[0], uv.s[1]); C.push(shade); return P.length / 3 - 1; };
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const u = -1 + (2 * i) / n, v = -1 + (2 * j) / n;
    put((u * w) / 2, top(u, v), (v * d) / 2, -(top(u + e, v) - top(u - e, v)) / (e * w), 1, -(top(u, v + e) - top(u, v - e)) / (e * d), shadeAt(u, v), (u * w) / 2, (v * d) / 2);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) Q.push([j * g + i, j * g + i + 1, (j + 1) * g + i + 1, (j + 1) * g + i]);
  // the sides: from the rolled rim down to the underside (the rim's normal leans out and up: a soft edge)
  const rim = [];
  for (let i = 0; i < n; i++) rim.push([-1 + (2 * i) / n, -1, 0, -1]);
  for (let j = 0; j < n; j++) rim.push([1, -1 + (2 * j) / n, 1, 0]);
  for (let i = 0; i < n; i++) rim.push([1 - (2 * i) / n, 1, 0, 1]);
  for (let j = 0; j < n; j++) rim.push([-1, 1 - (2 * j) / n, -1, 0]);
  const ring = rim.map(([u, v, nx, nz], q) => {
    // (a corner point takes the diagonal)
    const cnr = Math.abs(u) === 1 && Math.abs(v) === 1, ox = cnr ? u * Math.SQRT1_2 : nx, oz = cnr ? v * Math.SQRT1_2 : nz;
    const along = (q * (w + d)) / (2 * n);
    const a = put((u * w) / 2, top(u, v), (v * d) / 2, ox, 0.55, oz, k[1], along, 0);
    put((u * w) / 2, -h / 2, (v * d) / 2, ox, 0, oz, k[0], along, h);
    return a;
  });
  for (let q = 0; q < ring.length; q++) { const a = ring[q], b = ring[(q + 1) % ring.length]; Q.push([a, b, b + 1, a + 1]); }
  c.K.within(m, () => c.K.raw(batch, P, N, UV, Q, C));
}

/** A low upholstered chair: a plinth on four glides, a loose seat cushion, two fat arms, a leaning back with a pad. */
export function chair(c) {
  const { K, B, sw, detail } = c;
  const lea = c.leather(), soft = B.soft;
  // (round A7, TIER LINE: `lean` = the base room's west chair: 9 m from the one pose that frames it, it is built
  // without the pillowed cushions and the small bevels; `trim` = the base room under the round's geometry: a glide is
  // four-sided)
  const lean = c.item?.lean === true;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.touch(0.17, 0.17, sx * 0.27, sz * 0.26, true);
  c.touch(0.98, 0.98, 0, -0.02);
  c.cast(1.4, 1.4, 0, 0);
  c.part('glide', () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      if (detail >= 1) K.tube(B.hard, [sx * 0.27, 0, sz * 0.26], [sx * 0.27, 0.09, sz * 0.26], 0.014, 0.021, { segs: c.trim ? 4 : c.seg(8), uv: sw('chrome'), k: [0.55, 1] });
      else K.box(B.hard, [0.04, 0.09, 0.04], [sx * 0.27, 0.045, sz * 0.26], { uv: sw('rubber') });
    }
  });
  c.part('plinth', () => K.box(soft, [0.66, 0.2, 0.64], [0, 0.185, 0], { uv: lea, b: lean ? 0 : 0.02, k: [0.62, 0.95] }));
  // the loose cushions are pillowed and sat in off the lite room (a plain block there). The high room's leather is USED:
  // the seat sags deeper where somebody sits and carries creases that run from that hollow to the front corners and
  // across behind it; the back pad has two creases across it; the arms' tops are rolled, not boxes.
  const hi = detail >= 2;
  const SEAT_CREASES = [[-0.08, -0.12, -0.78, 0.82, 0.0045, 0.11], [0.14, -0.06, 0.8, 0.7, 0.004, 0.1], [-0.62, -0.5, 0.6, -0.42, 0.0035, 0.09], [0.05, 0.35, 0.3, 0.95, 0.003, 0.08]];
  const PAD_CREASES = [[-0.8, 0.28, 0.75, 0.36, 0.0035, 0.1], [-0.6, -0.3, 0.7, -0.22, 0.003, 0.09]];
  const seatM = new THREE.Matrix4().makeTranslation(0, 0.355, 0.06), padM = new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.13).setPosition(0, 0.57, -0.2);
  if (detail >= 1 && !lean) c.part('cushion', () => pillow(c, soft, [0.43, 0.15, 0.5], seatM, { uv: lea, k: [0.8, 1], sag: hi ? 0.021 : 0.014, roll: 0.035, n: hi ? 10 : 4, creases: hi ? SEAT_CREASES : null }));
  else c.part('cushion', () => K.box(soft, [0.43, 0.15, 0.5], [0, 0.355, 0.06], { uv: lea, b: 0.045, k: [0.8, 1] }));
  c.part('arm', () => {
    for (const s of [-1, 1]) {
      if (!hi) { K.box(soft, [0.135, 0.34, 0.66], [s * 0.2825, 0.45, 0], { uv: lea, b: lean ? 0 : 0.03, k: [0.78, 1] }); continue; }
      K.box(soft, [0.135, 0.27, 0.66], [s * 0.2825, 0.415, 0], { uv: lea, b: 0.02, k: [0.78, 0.96] });
      pillow(c, soft, [0.135, 0.075, 0.66], new THREE.Matrix4().makeTranslation(s * 0.2825, 0.5825, 0), { uv: lea, k: [0.9, 1], sag: 0.004, roll: 0.03, n: 4 });
    }
  });
  c.part('back', () => K.box(soft, [0.7, 0.52, 0.14], [0, 0.52, -0.29], { uv: lea, b: 0.04, rx: -0.13, k: [0.78, 1] }));
  if (detail >= 1 && !lean) c.part('pad', () => pillow(c, soft, [0.42, 0.1, 0.33], padM, { uv: lea, k: [0.86, 1], sag: 0.01, roll: 0.03, n: hi ? 8 : 4, creases: hi ? PAD_CREASES : null }));
  // the creases' own dark lines: a thin shadow line in the floor of each valley (high room)
  if (hi) c.part('crease', () => {
    const line = (M, size, list, sag0, roll) => {
      const [w, hh, d] = size;
      K.within(M, () => {
        for (const [u0, v0, u1, v1, depth] of list) {
          const n = 4, at = (t) => { const u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t, rim = Math.max(Math.abs(u), Math.abs(v)); return [(u * w) / 2, hh / 2 - (rim > 0.5 ? roll * ((rim - 0.5) / 0.5) ** 2 : 0) - sag0 * Math.max(0, 1 - (u * u + (v + 0.15) ** 2) / 0.6) - depth * 0.7, (v * d) / 2]; };
          for (let i = 0; i < n; i++) K.tube(B.hard, at(0.06 + (0.88 * i) / n), at(0.06 + (0.88 * (i + 1)) / n), 0.0016, 0.0016, { segs: 4, uv: sw('piping') });
        }
      });
    };
    line(seatM, [0.43, 0.15, 0.5], SEAT_CREASES, 0.021, 0.035);
    line(padM, [0.42, 0.1, 0.33], PAD_CREASES, 0.01, 0.03);
  });
  if (detail >= 2) c.part('piping', () => {
    // the seams' shadow lines: round the seat cushion's front, along the arms' inner top edges, across the back's top
    const r = 0.0035, o = { segs: 4, uv: sw('piping') };
    K.tube(B.hard, [-0.2, 0.397, 0.31], [0.2, 0.397, 0.31], r, r, o);
    K.tube(B.hard, [-0.2, 0.29, 0.31], [0.2, 0.29, 0.31], r, r, o);
    // (the arms' tops are rolled: their seams lie where the roll meets the arm's side, 26 mm under the crown)
    for (const s of [-1, 1]) {
      K.tube(B.hard, [s * 0.2165, 0.5935, -0.2], [s * 0.2165, 0.5935, 0.3], r, r, o);
      K.tube(B.hard, [s * 0.3485, 0.5935, -0.2], [s * 0.3485, 0.5935, 0.3], r, r, o);
      K.tube(B.hard, [s * 0.218, 0.3, 0.33], [s * 0.218, 0.585, 0.33], r, r, o);
    }
  });
  // ROUND A5, the dress: two strips of pale tape on the carpet at the front glides (where the chair is put back to), and
  // on ONE chair a towel over an arm: a folded length across the arm's top, a long end down its outer side, a short one
  // inside (the brief's own item: nothing lies on the seat, nothing is worn)
  if (c.dress) {
    // (round A7: spike tape: an L round each front glide; before it two pale strips, which read as white dashes)
    c.part('mark', () => {
      if (c.a7) { spikeL(c, -0.27, 0.26, -1, 0.05); spikeL(c, 0.27, 0.26, 1, -0.035); }
      else { tapeMark(c, -0.292, 0.322, 0.085, 0.07); tapeMark(c, 0.288, 0.326, 0.08, -0.05); }
    });
    if (c.item?.id === 'b') c.part('towel', () => {
      const s = 1, x = s * 0.2825, top = 0.622, z = 0.04, o = { uv: sw('towel'), b: 0.004 };
      K.box(B.hard, [0.151, 0.012, 0.3], [x, top + 0.006, z], { ...o, k: [0.9, 1] });
      K.box(B.hard, [0.011, 0.2, 0.3], [s * 0.3555, top - 0.094, z], { ...o, k: [0.78, 1] });
      K.box(B.hard, [0.011, 0.105, 0.3], [s * 0.2095, top - 0.0465, z], { ...o, k: [0.82, 1] });
      // (the high room: the fold's second layer, a little shorter and a little askew)
      if (hi) {
        K.box(B.hard, [0.149, 0.01, 0.284], [x, top + 0.017, z - 0.005], { ...o, ry: 0.025 });
        K.box(B.hard, [0.009, 0.13, 0.284], [s * 0.3565, top - 0.05, z - 0.005], { ...o, k: [0.85, 1] });
      }
    });
  }
}

/** A small round side table on a disc foot: a steel bottle, a folded towel and a cube of chalk on it. */
export function sideTable(c) {
  const { K, B, sw, detail } = c;
  // TIER LINE (owner: floor): below the high room the round parts take 0.7 of the tier's segments
  const seg = detail >= 2 ? c.seg : (n) => c.seg(n * 0.7);
  c.touch(0.46, 0.46, 0, 0, true);
  c.cast(0.95, 0.95, 0, 0);
  // (round A7, TIER LINE: `lean` = the base room's west table: the foot and the top in three rings each)
  const lean = c.item?.lean === true;
  c.part('base', () => K.lathe(B.hard, lean ? [[0, 0], [0.156, 0.005], [0.045, 0.02], [0.022, 0.036]] : [[0, 0], [0.15, 0], [0.156, 0.005], [0.15, 0.012], [0.045, 0.02], [0.022, 0.036]], [0, 0, 0], { segs: seg(18), uv: sw('skirt'), k: [0.7, 1] }));
  c.part('stem', () => K.tube(B.hard, [0, 0.03, 0], [0, 0.47, 0], 0.02, 0.02, { segs: seg(10), uv: sw('chrome'), k: [0.55, 1] }));
  c.part('top', () => K.lathe(B.hard, lean ? [[0.03, 0.468], [0.209, 0.474], [0.204, 0.5], [0, 0.5]] : [[0.03, 0.468], [0.2, 0.468], [0.209, 0.474], [0.21, 0.49], [0.204, 0.5], [0, 0.5]], [0, 0, 0], { segs: seg(22), uv: sw('top') }));
  if (detail < 1) return;
  // ROUND A5, the dress: what a real event puts beside a chair, and not the same on both tables
  if (c.dress) { tableDress(c, seg); return; }
  c.part('bottle', () => K.lathe(B.hard, [[0, 0], [0.03, 0], [0.034, 0.005], [0.034, 0.135], [0.03, 0.158], [0.017, 0.18], [0.017, 0.189]], [0.07, 0.5, -0.06], { segs: seg(12), uv: sw('steelBrushed') }));
  c.part('stopper', () => K.lathe(B.hard, [[0.0195, 0.187], [0.0195, 0.212], [0.015, 0.218], [0, 0.218]], [0.07, 0.5, -0.06], { segs: seg(12), uv: sw('rubber') }));
  c.part('towel', () => {
    K.box(B.hard, [0.21, 0.02, 0.13], [-0.06, 0.51, 0.03], { ry: 0.35, uv: sw('towel'), b: 0.008, k: [0.8, 1] });
    K.box(B.hard, [0.2, 0.02, 0.124], [-0.062, 0.53, 0.032], { ry: 0.31, uv: sw('towel'), b: 0.009 });
  });
  c.part('chalk', () => {
    K.box(B.hard, [0.023, 0.023, 0.023], [0.035, 0.5115, 0.118], { ry: 0.6, uv: sw('chalk'), b: 0.002 });
    if (detail >= 2) K.box(B.hard, [0.0245, 0.015, 0.0245], [0.035, 0.5078, 0.118], { ry: 0.6, uv: sw('chalkWrap'), b: 0 });
  });
}

/**
 * ROUND A5: what stands on a side table under the dress (the table's frame; its top is 0.5 m over the floor). Table `b`
 * keeps round A4's steel bottle and gets a clear bottle of water with a green cap and a glass; the other table carries an
 * ice bucket of brushed steel with a bottle's neck (a blue cap) standing in the ice, and a glass. Both: the folded towel
 * and the cube of chalk. No label, no print, no word: the clear things are one pale glossy finish.
 */
function tableDress(c, seg) {
  const { K, B, sw, detail } = c;
  const hi = detail >= 2, T = 0.5, second = c.item?.id === 'b';
  // (round A7, TIER LINE: under the round's geometry the base room's towels are plain slabs: a bevel of 8 mm is under
  // a pixel in every pose, and the west corner takes the triangles)
  const towel = (x, z, ry) => c.part('towel', () => {
    K.box(B.hard, [0.21, 0.02, 0.13], [x, T + 0.01, z], { ry, uv: sw('towel'), b: c.trim ? 0 : 0.008, k: [0.8, 1] });
    K.box(B.hard, [0.2, 0.02, 0.124], [x - 0.002, T + 0.03, z + 0.002], { ry: ry - 0.04, uv: sw('towel'), b: c.trim ? 0 : 0.009 });
  });
  const chalk = (x, z) => c.part('chalk', () => {
    K.box(B.hard, [0.023, 0.023, 0.023], [x, T + 0.0115, z], { ry: 0.6, uv: sw('chalk'), b: 0.002 });
    if (hi) K.box(B.hard, [0.0245, 0.015, 0.0245], [x, T + 0.0078, z], { ry: 0.6, uv: sw('chalkWrap'), b: 0 });
  });
  // ROUND A6 (CONTRACT 18: the last stand-ins). Where the room has the blended batch (`c.glassy`: the high room) the
  // steel things are steel (a rough metal at the cube's full share: the bucket's wall mirrors the lit boards and
  // seats) and the clear things are GLASS: a thin shell with an alpha (its highlight and its mirror image over the
  // scene behind it) with a thick ring where a real one shows its thickness: a tumbler's base, a bottle's foot and
  // lip. Where it has none (the base room) under the round's set: bottles in an opaque dark glass with a clear
  // highlight, tumblers the pale gloss of round A5.
  const a6 = c.a6 === true, glassy = a6 && c.glassy === true, G = glassy ? c.B.bright : B.hard;
  const glass = (x, z) => c.part('glass', () => {
    if (!glassy) { K.lathe(B.hard, [[0.027, 0.001], [0.033, 0.095], [0.0305, 0.095], [0.0255, 0.014]], [x, T, z], { segs: seg(10), uv: sw('water') }); return; }
    K.lathe(G, [[0.027, 0.016], [0.033, 0.093]], [x, T, z], { segs: seg(12), uv: sw('glassThin') });
    K.lathe(G, [[0.031, 0.093], [0.0255, 0.018]], [x, T, z], { segs: seg(12), uv: sw('glassThin') });
    // the thick base and the lip
    K.lathe(G, [[0, 0.0012], [0.0262, 0.0012], [0.027, 0.016], [0, 0.017]], [x, T, z], { segs: seg(12), uv: sw('glassThick') });
    K.lathe(G, [[0.0335, 0.0915], [0.0335, 0.0955], [0.0305, 0.0955], [0.0305, 0.0915]], [x, T, z], { segs: seg(12), uv: sw('glassThick') });
  });
  // a clear bottle: `sunk` = how deep its foot stands in something (the ice); its cap in `cap`
  const clear = (x, z, cap, sunk = 0) => {
    const prof = [[0.031, Math.max(0.001, sunk)], [0.032, 0.125], [0.027, 0.155], [0.0145, 0.18], [0.0145, 0.196]].map(([r, y]) => [r, y - sunk * 0.4]);
    c.part('bottle', () => {
      if (!glassy) { K.lathe(B.hard, prof, [x, T, z], { segs: seg(10), uv: sw(a6 ? 'bottleGlass' : 'water') }); return; }
      K.lathe(G, prof, [x, T, z], { segs: seg(12), uv: sw('glassBottle') });
      // its thick foot (where it is not sunk in the ice) and the lip under the cap
      if (!sunk) K.lathe(G, [[0, 0.0012], [0.0305, 0.0012], [0.0312, 0.012], [0, 0.013]], [x, T, z], { segs: seg(12), uv: sw('glassThick') });
      K.lathe(G, [[0.0152, 0.176 - sunk * 0.4], [0.0152, 0.193 - sunk * 0.4]], [x, T, z], { segs: seg(12), uv: sw('glassThick') });
    });
    c.part('cap', () => K.tube(B.hard, [x, T + 0.193 - sunk * 0.4, z], [x, T + 0.21 - sunk * 0.4, z], 0.0165, 0.0165, { segs: seg(8), uv: sw(cap), caps: true }));
  };
  // ROUND A7 (CONTRACT 19.1): the steel things are stainless steel on the HARD batch of every room: the hard material
  // reads the hall's cube through the env service's handle at full share, so the bucket's wall mirrors the lit carpet
  // and the boards from where it stands. The grey satin stand-in of rounds A5 and A6 and their darkened steel are gone.
  // the west corner's table (round A7): a glass and a folded towel, nothing else
  if (c.item?.id === 'w') { glass(0.075, -0.07); towel(-0.045, 0.04, 0.55); return; }
  if (!second) {
    const bx = 0.07, bz = -0.075;
    c.part('bucket', () => {
      // (outer wall, a rolled rim, the inner wall down to the ice; the ice's surface)
      // (round A6 drew it as a grey satin body: as brushed steel on the app's cube the wall was black from above and
      // the inner wall a white ring, shots/floor/m11-CAM.jpg. Round A7: steel, by the hall's cube.)
      K.lathe(B.hard, [[0.058, 0.001], [0.071, 0.122], [0.075, 0.126], [0.075, 0.132], [0.066, 0.132], [0.062, 0.102]], [bx, T, bz], { segs: seg(14), uv: sw('steelBrushed'), k: [0.8, 1] });
      K.disc(B.hard, 0.062, [bx, T + 0.102, bz], { segs: Math.max(8, seg(14)), uv: sw('water'), k: 0.9 });
    });
    clear(bx + 0.012, bz - 0.008, 'chalk', 0.09);
    glass(-0.075, -0.115);
    towel(-0.055, 0.045, -0.4);
    chalk(0.13, 0.06);
    return;
  }
  c.part('bottle', () => K.lathe(B.hard, [[0, 0], [0.03, 0], [0.034, 0.005], [0.034, 0.135], [0.03, 0.158], [0.017, 0.18], [0.017, 0.189]], [0.07, T, -0.06], { segs: seg(12), uv: sw('steelBrushed') }));
  c.part('stopper', () => K.lathe(B.hard, [[0.0195, 0.187], [0.0195, 0.212], [0.015, 0.218], [0, 0.218]], [0.07, T, -0.06], { segs: seg(12), uv: sw('rubber') }));
  clear(-0.03, -0.125, 'capGreen');
  glass(0.125, 0.05);
  towel(-0.06, 0.03, 0.35);
  chalk(0.035, 0.118);
}

/**
 * The desk by the boards: a dark cloth hanging to the floor in soft folds, a ball tray and a rack triangle on it, the
 * rest leaning on its end. `d` = the plan's desk (rest: { end, butt, tip, tipH, z }).
 */
export function desk(c, d) {
  const { K, B, sw, detail, seg } = c;
  const w = DESK.w, dp = DESK.d, h = DESK.h, fl = DESK.flare, y1 = h - 0.012, yb = 0.014;
  c.touchBox(w + 2 * fl + 0.02, dp + 2 * fl + 0.02, 0, 0);
  c.cast(1.75, 1.3, 0, 0);
  // The cloth: ONE closed sheet round the top's edge, down to where it breaks on the carpet. Along a side it hangs flat
  // under the edge and falls into soft folds toward the floor (a cosine, zero at both ends of the side). At a corner the
  // sheet's normal turns a quarter and the cloth stands OUT along the diagonal, more the lower it hangs: the fold a
  // square cloth makes at the corner of a table. Below the break the hem lies on the carpet in a ring of uneven width.
  const [u, v] = sw('cloth').s;
  const corners = [[-w / 2, -dp / 2], [w / 2, -dp / 2], [w / 2, dp / 2], [-w / 2, dp / 2]];
  const normalOf = (i) => { const a = corners[i], b = corners[(i + 1) % 4], mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2, l = Math.hypot(mx, mz) || 1; return [mx / l, mz / l]; };
  const step = detail >= 2 ? 0.045 : 0.105, fan = detail >= 2 ? 6 : 3;
  // the loop: { x, z: the point of the top's edge; nx, nz: outward; wave: the side fold's phase 0..1; slope; ear: 0..1 at a corner's diagonal }
  const loop = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4], [nx, nz] = normalOf(i), [mx, mz] = normalOf((i + 1) % 4);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len;
    const cols = Math.max(2, Math.round(len / step)), periods = Math.max(1, Math.round(len / 0.21));
    // UNEVEN folds (a cloth thrown over a table never hangs in equal pipes): the folds' widths are warped along the
    // side (zero at both ends, so the corner fans still meet it), and each fold has its own depth (0.45 to 1 of
    // DESK.fold, from a fixed hash: the same cloth on every load)
    const warp = (t) => t + 0.075 * Math.sin(2 * Math.PI * (1.37 * t + 0.31 * i + 0.11)) * Math.sin(Math.PI * t);
    const waveAt = (t) => { const q = periods * warp(t), fold = Math.min(periods - 1, Math.max(0, Math.floor(q))); return (0.45 + 0.55 * hash01(i * 7 + 3, fold)) * (1 - Math.cos(2 * Math.PI * q)) / 2; };
    for (let k = 1; k < cols; k++) {
      const t = k / cols, e = 0.004;
      loop.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, nx, nz, tx, tz, wave: waveAt(t), slope: (waveAt(t + e) - waveAt(t - e)) / (2 * e * len), ear: 0, dear: 0, lie: 0.5 + 0.5 * hash01(i * 5 + 1, k) });
    }
    // the corner at b: the normal turns from this side's to the next side's
    for (let k = 0; k <= fan; k++) {
      const s = k / fan, ang = (s * Math.PI) / 2, cs = Math.cos(ang), sn = Math.sin(ang);
      loop.push({ x: b[0], z: b[1], nx: nx * cs + mx * sn, nz: nz * cs + mz * sn, tx: -nx * sn + mx * cs, tz: -nz * sn + mz * cs, wave: 0, slope: 0, ear: Math.sin(Math.PI * s) ** 1.6, dear: Math.cos(Math.PI * s) * 1.6 });
    }
  }
  // rows: [height, share of the folds' depth, baked shade]; the last one is the break on the carpet
  const rows = [[y1, 0, 1], [h * 0.62, 0.28, 0.97], [h * 0.3, 0.72, 0.92], [yb, 1, 0.84]];
  const outAt = (q, y, share) => fl * (1 - (y - yb) / (y1 - yb)) + DESK.fold * share * q.wave + DESK.corner * share * q.ear;
  const n = loop.length, nr = rows.length;
  c.part('cloth', () => {
    const P = [], N = [], UV = [], Q = [], C = [];
    for (const q of loop) for (const [y, share, shade] of rows) {
      const out = outAt(q, y, share);
      P.push(q.x + q.nx * out, y, q.z + q.nz * out);
      const tilt = DESK.fold * share * q.slope + DESK.corner * share * q.dear * 2.2;
      N.push(q.nx - q.tx * tilt, 0.06 + 0.1 * share, q.nz - q.tz * tilt); UV.push(u, v);
      // (a fold's valley sees less of the hall than its ridge: the deeper the folds at this height, the darker the valley)
      C.push(shade * (1 - 0.3 * share * (1 - Math.max(q.wave, q.ear))));
    }
    for (let k = 0; k < n; k++) for (let r = 0; r + 1 < nr; r++) { const k2 = (k + 1) % n; Q.push([k * nr + r, k2 * nr + r, k2 * nr + r + 1, k * nr + r + 1]); }
    K.raw(B.hard, P, N, UV, Q, C);
  });
  // the hem: from the break outward, lying on the carpet; wider where a fold or a corner throws it out
  c.part('hem', () => {
    const P = [], N = [], UV = [], Q = [], C = [];
    const ring = detail >= 2 ? [[0, yb, 0.5, 0.84], [0.6, 0.007, 0.2, 0.96], [1, 0.0035, 0.5, 0.9]] : [[0, yb, 0.5, 0.86], [1, 0.0035, 0.3, 0.94]];
    for (const q of loop) {
      // (how much cloth lies on the carpet differs along the side: `lie`)
      const out = outAt(q, yb, 1), wide = DESK.hem * (0.55 + 0.45 * Math.max(q.wave, q.ear)) * (q.lie ?? 0.85);
      for (const [share, y, lean, shade] of ring) { P.push(q.x + q.nx * (out + wide * share), y, q.z + q.nz * (out + wide * share)); N.push(q.nx * lean, 1, q.nz * lean); UV.push(u, v); C.push(shade); }
    }
    const m = ring.length;
    for (let k = 0; k < n; k++) for (let r = 0; r + 1 < m; r++) { const k2 = (k + 1) % n; Q.push([k * m + r, k2 * m + r, k2 * m + r + 1, k * m + r + 1]); }
    K.raw(B.hard, P, N, UV, Q, C);
  });
  c.part('slab', () => K.box(B.hard, [w + 0.006, 0.014, dp + 0.006], [0, h - 0.007, 0], { uv: sw('cloth'), b: 0.005 }));
  // the tray (lacquered wood, a felt lining) and the rack
  const tx = -0.2 * d.rest.end, tz = 0.015;
  c.part('tray', () => {
    K.box(B.hard, [0.36, 0.008, 0.25], [tx, h + 0.004, tz], { uv: sw('tray'), b: 0.002 });
    for (const s of [-1, 1]) {
      K.box(B.hard, [0.36, 0.024, 0.008], [tx, h + 0.012, tz + s * 0.121], { uv: sw('tray'), b: 0.003 });
      K.box(B.hard, [0.008, 0.024, 0.25], [tx + s * 0.176, h + 0.012, tz], { uv: sw('tray'), b: 0.003 });
    }
  });
  if (detail >= 1) c.part('lining', () => K.quad(B.hard, 0.342, 0.232, [tx, h + 0.0086, tz], { rx: -Math.PI / 2, uv: sw('lining') }));
  // a folded polishing cloth beside the tray: the one pale thing on the black cloth
  if (detail >= 1) c.part('duster', () => {
    const dx = 0.27 * d.rest.end, dz = 0.07;
    K.box(B.hard, [0.17, 0.012, 0.12], [dx, h + 0.006, dz], { ry: -0.25, uv: sw('towel'), b: 0.005, k: [0.85, 1] });
    K.box(B.hard, [0.165, 0.01, 0.115], [dx + 0.002, h + 0.017, dz + 0.002], { ry: -0.2, uv: sw('towel'), b: 0.005 });
  });
  c.part('rack', () => {
    // a triangle of three lacquered bars, lying in the tray
    const side = 0.215, rin = side / (2 * Math.sqrt(3));
    for (let i = 0; i < 3; i++) { const a = 0.24 + (i * 2 * Math.PI) / 3; K.box(B.hard, [side + 0.012, 0.03, 0.01], [tx + Math.sin(a) * rin, h + 0.008 + 0.015, tz + Math.cos(a) * rin], { ry: a, uv: sw('wood'), b: 0.003 }); }
  });
  // ROUND A6: a second rest LYING on the desk along its front edge, a little askew, its bridge at the end away from the
  // leaning one (the base room: the shaft and one bar for the bridge)
  if (d.spare) c.part('spare', () => {
    const e = -d.rest.end, half = SPARE.length / 2, a = SPARE.turn, y = h + 0.0105, cs = Math.cos(a), sn = Math.sin(a);
    const p = (t) => [t * cs, y, SPARE.z - t * sn], butt2 = p(-e * half), tip2 = p(e * half);
    K.tube(B.hard, butt2, tip2, 0.0105, 0.0082, { segs: detail >= 2 ? 8 : 5, uv: sw('wood') });
    if (detail >= 2) {
      K.tube(B.hard, p(-e * (half + 0.006)), p(-e * (half - 0.03)), 0.0115, 0.0115, { segs: 8, uv: sw('rubber'), caps: true });
      K.tube(B.hard, p(e * (half - 0.035)), tip2, 0.0092, 0.0092, { segs: 8, uv: sw('brass'), caps: true });
      // the cross bridge lies on two of its arms' ends: one arm flat on the cloth, the other standing up
      K.tube(B.hard, [tip2[0], y - 0.002, tip2[2] - 0.04], [tip2[0], y - 0.002, tip2[2] + 0.04], 0.0048, 0.0048, { segs: 5, uv: sw('brass'), caps: true });
      K.tube(B.hard, [tip2[0], y - 0.004, tip2[2]], [tip2[0], y + 0.036, tip2[2]], 0.0048, 0.0048, { segs: 5, uv: sw('brass'), caps: true });
    } else K.box(B.hard, [0.012, 0.03, 0.07], [tip2[0], y + 0.006, tip2[2]], { uv: sw('brass'), b: 0 });
  });
  // the rest: a tapered lacquered shaft from the floor over the desk's end, a rubber bumper, a brass ferrule, a cross bridge
  const r = d.rest, butt = [r.butt, 0.024, r.z], tip = [r.tip, r.tipH, r.z];
  const len = Math.hypot(tip[0] - butt[0], tip[1] - butt[1]), ux = (tip[0] - butt[0]) / len, uy = (tip[1] - butt[1]) / len;
  c.touch(0.1, 0.1, butt[0], r.z, true);
  c.part('shaft', () => K.tube(B.hard, butt, tip, 0.0125, 0.0088, { segs: seg(8), uv: sw('wood') }));
  if (detail >= 1) {
    c.part('bumper', () => K.tube(B.hard, [butt[0] - ux * 0.008, butt[1] - uy * 0.008, r.z], [butt[0] + ux * 0.03, butt[1] + uy * 0.03, r.z], 0.0135, 0.0135, { segs: seg(8), uv: sw('rubber'), caps: true }));
    c.part('ferrule', () => K.tube(B.hard, [tip[0] - ux * 0.035, tip[1] - uy * 0.035, r.z], tip, 0.0098, 0.0098, { segs: seg(8), uv: sw('brass'), caps: true }));
    c.part('bridge', () => {
      // two crossed brass arms square to the shaft
      const px = -uy, py = ux, k = 0.055 / Math.SQRT2;
      for (const s of [-1, 1]) K.tube(B.hard, [tip[0] - px * k, tip[1] - py * k, r.z - s * k], [tip[0] + px * k, tip[1] + py * k, r.z + s * k], 0.0048, 0.0048, { segs: 5, uv: sw('brass'), caps: true });
    });
  }
}

/** A flat aluminium threshold across a walk-in: `th.length` along the local x. */
export function threshold(c, th) {
  const { K, B, sw, detail } = c;
  c.part('strip', () => K.box(B.hard, [th.length, THRESHOLD.h, THRESHOLD.depth], [0, THRESHOLD.h / 2 + 0.001, 0], { uv: sw('alu'), b: 0.002, k: [0.7, 1] }));
  if (detail >= 2) c.part('edge', () => { for (const s of [-1, 1]) K.quad(B.hard, th.length - 0.02, 0.012, [0, THRESHOLD.h + 0.0014, s * 0.03], { rx: -Math.PI / 2, uv: sw('rubber') }); });
  // ROUND A6: worn tape on the carpet inside the walk-in (`th.scuff`: which way the island lies): a strip of grey gaffer
  // tape across the way in, laid in three pieces that do not line up, one of them walked half off (a shorter remnant
  // and a darker patch where it was). Beyond the shell's edging profile; flat on the pile.
  if (th.scuff) c.part('scuff', () => {
    const z = th.scuff * SCUFF.inside, len = th.length * SCUFF.share, x0 = -len / 2 + 0.07 * th.scuff;
    flatStrip(c, x0 + len * 0.17, z, len * 0.34, SCUFF.wide, 0.012, 'cover', 0.95);
    flatStrip(c, x0 + len * 0.52, z + 0.006, len * 0.33, SCUFF.wide, -0.02, 'cover', 0.82);
    flatStrip(c, x0 + len * 0.78, z - 0.004, len * 0.13, SCUFF.wide, 0.05, 'cover', 0.9);
    flatStrip(c, x0 + len * 0.93, z - 0.002, len * 0.13, SCUFF.wide * 0.9, 0.02, 'tape', 0.9, 0.003);
  });
}

// ---- ROUND A5: the dress of the playing floor (plan.js FLOOR_DRESS_DEFAULT; `c.dress` is true while it is built) -------

// a strip of pale tape on the carpet: `len` along the direction `ang` (about the vertical), a little proud of the pile
// (round A6, under the round's set: the same strip as two triangles flat on the pile, where round A5 built a box of
// twelve: six marks give the base room 60 triangles back for the head end's case and cart)
function tapeMark(c, x, z, len, ang, wide = 0.022) {
  if (c.a6) c.K.quad(c.B.hard, len, wide, [x, 0.004, z], { rx: -Math.PI / 2, ry: ang, uv: c.sw('towel') });
  else c.K.box(c.B.hard, [len, 0.0012, wide], [x, 0.0034, z], { ry: ang, uv: c.sw('towel'), b: 0 });
}

// ROUND A7: spike tape at a foot (fx, fz) of a thing that is set back on its marks: an L of two strips of matt cloth
// tape, SPIKE.wide wide, round the foot's outer front corner (`sx` = which side is outside), laid by hand: the side
// arm lies over the front arm at the corner, neither is square to the thing (`crook`), and on the high room the
// front arm's end is torn short. `rf` = the foot's radius.
function spikeL(c, fx, fz, sx, crook = 0.04, rf = 0.021) {
  const { K, B, sw } = c, S = SPIKE, FLAT = -Math.PI / 2;
  const cx = fx + sx * (rf + S.gap), cz = fz + rf + S.gap;      // the foot's outer front corner
  const ox = cx + sx * S.wide, oz = cz + S.wide;                // the L's outer corner
  K.quad(B.hard, S.len, S.wide, [ox - sx * S.len / 2, 0.004, cz + S.wide / 2], { rx: FLAT, ry: crook, uv: sw('spike') });
  K.quad(B.hard, S.wide, S.len * 0.8, [cx + sx * S.wide / 2, 0.0046, oz - S.len * 0.4], { rx: FLAT, ry: -crook * 0.7, uv: sw('spike'), k: 0.93 });
  if (c.detail >= 2) K.quad(B.hard, 0.02, S.wide * 0.55, [ox - sx * (S.len + 0.007), 0.004, cz + S.wide * 0.36], { rx: FLAT, ry: crook, uv: sw('spike'), k: 0.85 });
}

// ROUND A7: spike tape at a round base plate of radius `r`, in the plate's own frame (+z = where the thing looks): a T
// at the front (its bar along the rim, its stem pointing where the lens looks) and a tick at each side.
function spikeT(c, r) {
  const { K, B, sw } = c, S = SPIKE, FLAT = -Math.PI / 2, d = r + S.gap + S.wide / 2;
  K.quad(B.hard, 0.15, S.wide, [0.004, 0.004, d], { rx: FLAT, ry: 0.03, uv: sw('spike') });
  K.quad(B.hard, S.wide, 0.085, [-0.006, 0.0046, d + S.wide / 2 + 0.036], { rx: FLAT, ry: -0.04, uv: sw('spike'), k: 0.93 });
  for (const s of [-1, 1]) K.quad(B.hard, 0.085, S.wide, [s * (d + 0.018), 0.004, s > 0 ? -0.01 : 0.012], { rx: FLAT, ry: s * 0.05, uv: sw('spike'), k: s > 0 ? 1 : 0.9 });
}

/**
 * The one LOW camera: a remote camera on a short post, in the frame of the post's foot (origin on the floor, +z = the
 * lens). A steel base plate under a black coat, a post with a clamp collar, a pan drum, a yoke with the camera in it (a
 * compact housing, a zoom lens with a short round hood, a coated front element), a carrying handle, and its cable: a loop
 * behind the housing, down the post, over the base plate toward the nearest board (`r.out`: that direction in this frame).
 * Unmanned by its kind: no bars, no finder, nobody's place behind it. `r` = the plan's remote.
 */
export function remoteCamera(c, r) {
  const { K, B, sw, detail } = c;
  const hi = detail >= 2, R = REMOTE, HS = R.housing, Y = R.yoke;
  const seg = hi ? c.seg : (n) => c.seg(n * 0.7);
  c.touch(0.66, 0.66, 0, 0, true);
  c.cast(1.0, 1.0, 0, 0);
  // the base plate: a disc with a chamfered rim and a hub the post stands in
  c.part('base', () => K.lathe(B.hard, hi ? [[R.base, 0.0015], [R.base, R.baseT - 0.003], [R.base - 0.004, R.baseT], [0.052, R.baseT + 0.002], [0.044, R.baseT + 0.03], [R.post + 0.003, R.baseT + 0.044]]
    : [[R.base, 0.0015], [R.base, R.baseT], [0.05, R.baseT + 0.002], [R.post + 0.003, R.baseT + 0.044]], [0, 0, 0], { segs: seg(hi ? 20 : 16), uv: sw('skirt'), k: [0.8, 1] }));
  // (round A7, the high room: a stand in two sections, as a stand is: the black outer tube up to the clamp collar and
  // the bare inner tube above it, which is aluminium and mirrors the lit island as a pale line: against
  // the navy board the post was a black bar, shots/floor/q5-V1.jpg)
  c.part('post', () => {
    if (!(c.a7 && hi)) { K.tube(B.hard, [0, R.baseT + 0.04, 0], [0, R.postTop, 0], R.post, R.post, { segs: seg(10), uv: sw('column'), k: [0.85, 1] }); return; }
    K.tube(B.hard, [0, R.baseT + 0.04, 0], [0, R.clamp, 0], R.post, R.post, { segs: seg(10), uv: sw('column'), k: [0.85, 1] });
    K.tube(B.hard, [0, R.clamp, 0], [0, R.postTop, 0], R.post - 0.006, R.post - 0.006, { segs: seg(10), uv: sw('alu') });
  });
  if (hi) c.part('clamp', () => {
    const y = R.clamp, p = R.post;
    K.lathe(B.hard, [[p, y - 0.03], [p + 0.012, y - 0.026], [p + 0.012, y + 0.02], [p, y + 0.024]], [0, 0, 0], { segs: seg(10), uv: sw('rubber') });
    K.tube(B.hard, [p + 0.008, y, 0], [p + 0.05, y, 0], 0.011, 0.011, { segs: 6, uv: sw('rubber'), caps: true });
  });
  // the pan drum on the post, the yoke on the drum
  const yokeY = R.postTop + R.panH, armTop = R.axis + 0.035;
  // (the form under a directed light, shots/floor/h5-CAM.jpg: in one black the whole head was a silhouette. The yoke is
  // black anodised against the housing's matt paint; on the high room the drum carries a bare band, the housing's top
  // edges are worn to a lighter line as the stand cameras' are, a blank plate and three vent slots sit on the side the
  // hall's poses see, a satin ring trims the lens behind the hood and the hood's lip is a hard line)
  c.part('pan', () => {
    // (the drum and the yoke's deck in the MATT finish, roughness 0.78: their flat tops lie under the keys and the
    // standing play view sees them at eight degrees. In matt paint, 0.50, they drew two lines at 226 to 233 across the
    // head, shots/floor/h8-V1.jpg; black anodised, 0.38, the deck stood at 255 on 16 px against a bed peak of 242,
    // shots/floor/k1-V1.jpg. A finish only: no vertex moves. Round A8: the same matt coat in the head's light grey,
    // `body`: see the housing below)
    K.tube(B.hard, [0, R.postTop, 0], [0, yokeY, 0], R.pan, R.pan, { segs: seg(12), uv: sw(c.a7 ? 'body' : 'pad'), caps: true });
    if (hi) K.tube(B.hard, [0, R.postTop + 0.02, 0], [0, R.postTop + 0.03, 0], R.pan + 0.001, R.pan + 0.001, { segs: seg(12), uv: sw('label') });
  });
  c.part('yoke', () => {
    K.box(B.hard, [2 * Y.x + Y.t, Y.plate, Y.d], [0, yokeY + Y.plate / 2, 0], { uv: sw(c.a7 ? 'body' : 'pad'), b: 0.004 });
    for (const s of [-1, 1]) {
      // (round A7: the arms in a matt powder coat, not in black anodised `column`: at roughness 0.38 an arm's flat
      // cheek gave the hood's light back as a white panel, 243 of 255 against the bed's 247, in the close pose from
      // the table's side, shots/floor/a7a16-CAM.jpg. Round A8: that coat is the head's light grey, `body`)
      K.box(B.hard, [Y.t, armTop - yokeY - Y.plate, Y.d], [s * Y.x, (armTop + yokeY + Y.plate) / 2, 0], { uv: sw(c.a7 ? 'body' : 'pad'), b: 0.005 });
      // the tilt knob outside each arm, the trunnion inside it
      K.tube(B.hard, [s * (Y.x + Y.t / 2), R.axis, 0], [s * (R.reach.hw - 0.003), R.axis, 0], 0.022, 0.02, { segs: seg(8), uv: sw('rubber'), caps: true });
      if (hi) K.tube(B.hard, [s * (HS.w / 2), R.axis, 0], [s * (Y.x - Y.t / 2), R.axis, 0], 0.012, 0.012, { segs: 6, uv: sw('column') });
    }
  });
  // everything that tilts: the housing, the lens with its hood and front element, the handle
  K.within(new THREE.Matrix4().makeRotationX(r.tilt).setPosition(0, R.axis, 0), () => {
    c.part('housing', () => {
      // (round A7: the body in a MATT powder coat, roughness 0.78, under `a7`: in the stand cameras' paint,
      // `housing` at 0.50, its flat side gave the hood's light back as a white panel, 242 of 255 against the bed's
      // 247, in the close pose from the table's side, shots/floor/a7f1-CAM.jpg.
      // ROUND A8, CONTRACT 20.2 row 2: that coat is LIGHT GREY, `body` (0.43), on the body, its cover plate, the
      // yoke and the pan drum; the lens, the hood, the knobs and the stand stay black. Every face of this head gets
      // 0.27 to 0.38 units of bounce and no key (a lit stand camera gets 2.5), so in the black class's 0.04 it was a
      // silhouette before the lit board: its top read 20.8 and its side 20.9 at the TV pose's boxes [794,55 12x7] and
      // [803,66 6x10]; in grey 41.3 and 38.8, shots/floor/a8a2-CAM.jpg. A material chosen for the row, not a light.)
      K.box(B.hard, [HS.w, HS.h, HS.z1 - HS.z0], [0, 0, (HS.z0 + HS.z1) / 2], { uv: sw(c.a7 ? 'body' : 'housing'), b: 0.008 });
      // a rear panel with two sockets (high room), the lens mount's flange
      K.tube(B.hard, [0, 0, HS.z1], [0, 0, HS.z1 + 0.012], 0.052, 0.05, { segs: seg(12), uv: sw('column') });
      if (hi) {
        K.box(B.hard, [HS.w - 0.03, HS.h - 0.04, 0.004], [0, 0, HS.z0 - 0.002], { uv: sw('column'), b: 0 });
        for (const x of [-0.02, 0.03]) K.tube(B.hard, [x, -0.02, HS.z0 - 0.003], [x, -0.02, HS.z0 - 0.02], 0.009, 0.009, { segs: 6, uv: sw('chrome'), caps: true });
        // the worn top edges (two long ones, the rear one), in the blank plates' finish
        const q = Math.PI / 4, o = { uv: sw('label'), b: 0 }, ey = HS.h / 2 - 0.0036;
        // (round A7: a top cover plate in place of the three 5 mm edge bars: at 7 m a bar is two thirds of a pixel
        // and drew single grey dots on the head, shots/floor/q5-V1.jpg; a plate that takes the fills from above
        // gives the head a lit top. Round A8: in the body's coat, `body`)
        if (c.a7) K.box(B.hard, [HS.w - 0.014, 0.004, HS.z1 - HS.z0 - 0.014], [0, HS.h / 2 + 0.0018, (HS.z0 + HS.z1) / 2], { uv: sw('body'), b: 0 });
        else {
          for (const s of [-1, 1]) K.box(B.hard, [0.005, 0.005, HS.z1 - HS.z0 - 0.02], [s * (HS.w / 2 - 0.0036), ey, (HS.z0 + HS.z1) / 2], { ...o, rz: q });
          K.box(B.hard, [HS.w - 0.02, 0.005, 0.005], [0, ey, HS.z0 + 0.0036], { ...o, rx: q });
        }
        // a blank plate and three vent slots on the housing's right side (no word, no mark)
        const sx = HS.w / 2 + 0.0008;
        K.quad(B.hard, 0.058, 0.022, [sx, 0.02, -0.035], { ry: Math.PI / 2, uv: sw('label') });
        for (const k of [0, 1, 2]) K.quad(B.hard, 0.04, 0.0035, [sx, -0.022 - k * 0.009, -0.07], { ry: Math.PI / 2, uv: sw('piping') });
      }
    });
    c.part('lens', () => {
      K.tube(B.hard, [0, 0, HS.z1 + 0.012], [0, 0, R.lens.z1], R.lens.r, R.lens.r, { segs: seg(14), uv: sw('lens') });
      // the zoom ring: a ribbed rubber band round the barrel; a satin trim ring behind the hood
      if (hi) K.tube(B.hard, [0, 0, 0.115], [0, 0, 0.15], R.lens.r + 0.004, R.lens.r + 0.004, { segs: seg(14), uv: sw('rubber') });
      // (round A7: the trim ring is 20 mm long and stands 5 mm proud: three pixels of plated metal behind the hood at the standing play view)
      if (hi && c.a7) K.tube(B.hard, [0, 0, 0.16], [0, 0, 0.18], R.lens.r + 0.005, R.lens.r + 0.005, { segs: seg(14), uv: sw('chrome') });
      else if (hi) K.tube(B.hard, [0, 0, 0.168], [0, 0, 0.177], R.lens.r + 0.003, R.lens.r + 0.003, { segs: seg(14), uv: sw('chrome') });
    });
    // the hood: a short round shade (outer wall, front lip, inner wall back to the front element); its lip a hard line
    c.part('hood', () => {
      K.lathe(B.hard, [[R.lens.r + 0.002, 0], [R.hood.r, 0.012], [R.hood.r, R.hood.z1 - R.hood.z0], [R.hood.r - 0.005, R.hood.z1 - R.hood.z0], [R.lens.r - 0.002, 0.02]], [0, 0, R.hood.z0],
        { rx: Math.PI / 2, segs: seg(14), uv: sw('rubber') });
      if (hi) K.tube(B.hard, [0, 0, R.hood.z1 - (c.a7 ? 0.014 : 0.007)], [0, 0, R.hood.z1 - 0.0015], R.hood.r + 0.0008, R.hood.r + 0.0008, { segs: seg(14), uv: sw('label') });
    });
    // (the front element: a coated mirror on the hard batch of every room. Round A7: the hard material reads the HALL's
    // cube at full share, so the lens shows the hall it looks into; round A6's constant glow on this cell is deleted.
    // Round A8: under `a7` its cell is `zoom`, a zoom's summed reflection under a hard gloss: a dark glass with the
    // lamp in it as a glint, peak 194 under the bed's 247 in the close frame shots/floor/a8a5-CAM.jpg; `glass` gave
    // 31 there, shots/floor/a8c1-CAM.jpg)
    c.part('glass', () => K.lathe(B.hard, hi ? [[R.lens.r - 0.002, 0], [0.03, 0.007], [0.014, 0.011], [0, 0.012]] : [[R.lens.r - 0.002, 0], [0, 0.01]], [0, 0, R.lens.z1 - 0.004], { rx: Math.PI / 2, segs: seg(14), uv: sw(c.a7 ? 'zoom' : 'glass') }));
    c.part('handle', () => {
      const y0 = HS.h / 2 - 0.002, y1 = y0 + 0.02, o = { segs: 5, uv: sw('rubber') };
      K.tube(B.hard, [0, y1, -0.1], [0, y1, 0.02], 0.006, 0.006, o);
      if (hi) for (const z of [-0.1, 0.02]) K.tube(B.hard, [0, y0, z], [0, y1, z], 0.005, 0.005, o);
    });
  });
  // the cable: from the housing's rear in a loop down to the post, down the post's side that looks at the nearest
  // board (two ties on the high room), over the base plate to its rim and onto the carpet, where the taped run begins
  if (c.look.cables) {
    const [ux, uz] = r.out, p = R.post + 0.008, rad = 0.0055;
    const on = (y) => [ux * p, y, uz * p];
    const pts = [[0.03, R.axis - 0.02 + 0.15 * Math.sin(r.tilt), HS.z0 - 0.02], [0.03, R.axis - 0.1, HS.z0 - 0.022], [ux * 0.06, R.postTop - 0.03, uz * 0.06 - 0.05], on(R.postTop - 0.1)];
    if (hi) pts.push(on(R.clamp + 0.09), on(R.clamp - 0.1));
    pts.push(on(R.baseT + 0.075), [ux * 0.07, R.baseT + rad + 0.001, uz * 0.07], [ux * (R.base - 0.012), R.baseT + rad, uz * (R.base - 0.012)], [ux * (R.base + 0.006), 0.008, uz * (R.base + 0.006)]);
    c.part('lead', () => {
      for (let i = 0; i + 1 < pts.length; i++) K.tube(B.hard, pts[i], pts[i + 1], rad, rad, { segs: hi ? 5 : 4, uv: sw('rubber') });
      if (hi) for (const y of [R.clamp + 0.12, R.baseT + 0.12]) K.tube(B.hard, [0, y - 0.009, 0], [0, y + 0.009, 0], R.post + 0.013, R.post + 0.013, { segs: 10, uv: sw('rubber') });
    });
  }
  // ROUND A6: what holds a camera on a short post down, and its spare cable. `ballast`: a shot weight of two lobes
  // lying on the base plate beside the post, on the side away from the cable (plain black cloth, a seam between the
  // lobes: production ballast, no strap, no label). `coil` (the high room): the spare length of its cable tied in a
  // loop and strapped to the post on the cable's side, flat against it: from the table's side a ring behind the post.
  if (r.ballast) {
    const [ux, uz] = r.out, px = -uz, pz = ux, S = BALLAST, cx = px * S.at, cz = pz * S.at, ry = Math.atan2(px, pz), y = R.baseT + 0.0005;
    c.part('ballast', () => {
      if (!hi) { K.box(B.hard, [S.w, S.h, S.d], [cx, y + S.h / 2, cz], { ry, uv: sw('tape'), b: 0 }); return; }
      const lobe = (S.w - 0.02) / 2;
      for (const s of [-1, 1]) K.box(B.hard, [lobe, S.h * (s > 0 ? 1 : 0.9), S.d], [cx + Math.cos(ry) * s * (lobe / 2 + 0.01), y + (S.h * (s > 0 ? 1 : 0.9)) / 2, cz - Math.sin(ry) * s * (lobe / 2 + 0.01)], { ry: ry + s * 0.04, uv: sw('tape'), b: 0.02, k: [0.8, 1] });
      K.box(B.hard, [0.024, 0.012, S.d - 0.004], [cx, y + 0.006, cz], { ry, uv: sw('tape'), b: 0, k: 0.8 });
    });
    if (hi && c.look.cables) c.part('coil', () => {
      const off = R.post + 0.016, yk = R.clamp + 0.1, Rr = 0.082;
      for (const k of [0, 1, 2]) ring(c, B.hard, [ux * (off + k * 0.008), yk - Rr + k * 0.004, uz * (off + k * 0.008)], [0, 1, 0], [px, 0, pz], Rr - k * 0.005, 0.0055, 12, 4, 'rubber');
      // a hook-and-loop tie round the three turns and the post, where they hang
      K.tube(B.hard, [ux * 0.012, yk - 0.016, uz * 0.012], [ux * 0.012, yk + 0.008, uz * 0.012], off + 0.016, off + 0.016, { segs: 8, uv: sw('rubber') });
    });
  }
  // two strips of pale tape on the carpet where the plate was set down (toward two corners of the plan's box, which is
  // square to the hall: the strips lie along the hall's diagonals whatever way the camera looks)
  // (round A7: spike tape: a T at the plate's front and a tick at each side; none on the boards' side, where the
  // shell's edging profile lies)
  c.part('mark', () => {
    if (c.a7) { spikeT(c, R.base); return; }
    const cs = Math.cos(r.ry), sn = Math.sin(r.ry);
    for (const [wx, wz, turn] of [[-0.185, 0.19, 0.78], [0.19, -0.18, 0.84]]) tapeMark(c, wx * cs - wz * sn, wx * sn + wz * cs, 0.075, turn - r.ry);
  });
}

/**
 * A floor monitor on a wedge foot, in the frame of its foot's middle on the floor (+z = the screen's side): a flat
 * screen leaning back, black glass that is on and shows nothing but a plain level bar (no word, no digit, no mark).
 */
export function floorMonitor(c, m = null) {
  const { K, B, sw, detail } = c;
  const hi = detail >= 2, M = MONITOR;
  c.touchBox(M.w + 0.04, 0.32, 0, -0.01);
  c.cast(1.05, 0.8, 0, 0);
  c.part('foot', () => {
    // two cheeks on the carpet, a bar between them at the rear, a strut up to the screen's back
    for (const s of [-1, 1]) K.box(B.hard, [0.03, 0.045, 0.29], [s * (M.w / 2 - 0.06), 0.0235, -0.01], { uv: sw('skirt'), b: 0.004, k: [0.75, 1] });
    K.box(B.hard, [M.w - 0.12, 0.028, 0.04], [0, 0.015, -0.135], { uv: sw('skirt'), b: 0 });
    K.tube(B.hard, [0, 0.03, -0.135], [0, 0.27, -0.062], 0.011, 0.011, { segs: hi ? 6 : 4, uv: sw('column') });
    // its cable: from the screen's back down to the carpet behind the rear bar and along it to where the taped run begins
    if (m?.lead && c.look.cables) {
      const [lx, lz] = m.lead, rad = 0.0055, pts = [[0.07, 0.2, -0.085], [0.09, 0.04, -0.15], [(0.09 + lx) / 2, rad + 0.001, Math.min(-0.15, lz)], [lx, rad + 0.001, lz]];
      for (let i = 0; i + 1 < pts.length; i++) K.tube(B.hard, pts[i], pts[i + 1], rad, rad, { segs: hi ? 5 : 4, uv: sw('rubber') });
    }
  });
  // the screen: hinged on the cheeks' front, leaning back
  K.within(new THREE.Matrix4().makeRotationX(-M.lean).setPosition(0, M.lift, 0.09), () => {
    // (round A8, the base room: no bevel. 8 mm is about one pixel on the nearest case at V10 and its edge moves by
    // that much, shots/floor/a8p-base-V10-monitors.jpg: three cases pay for the third monitor)
    c.part('case', () => K.box(B.hard, [M.w, M.h, M.t], [0, M.h / 2, -M.t / 2], { uv: sw('housing'), b: c.trim8 ? 0 : 0.008 }));
    c.part('screen', () => K.quad(B.hard, M.w - 0.036, M.h - 0.046, [0, M.h / 2 + 0.003, 0.0008], { uv: sw('glowScreen') }));
    c.part('bar', () => K.quad(B.hard, M.w * 0.46, 0.02, [-0.045, M.h * 0.6, 0.0016], { uv: sw('glowBar') }));
  });
}

/** A waste bin, in the frame of its foot: a tapered tub of black plastic with a clear liner folded over its rim. */
export function wasteBin(c) {
  const { K, B, sw, detail } = c;
  const hi = detail >= 2, S = BIN, seg = hi ? c.seg : (n) => c.seg(n * 0.7);
  c.touch(0.37, 0.37, 0, 0, true);
  c.cast(0.6, 0.6, 0, 0);
  c.part('tub', () => K.lathe(B.hard, [[S.r0, 0.002], [S.r, S.h - 0.01], [S.r + 0.005, S.h - 0.008], [S.r + 0.005, S.h], [S.r - 0.004, S.h]], [0, 0, 0], { segs: seg(14), uv: sw('rubber'), k: [0.7, 1] }));
  c.part('liner', () => {
    // the bag's fold over the rim, and the dark inside of the tub under it
    K.lathe(B.hard, [[S.r + 0.0065, S.h - 0.05], [S.r + 0.008, S.h + 0.002], [S.r - 0.006, S.h + 0.005], [S.r - 0.018, S.h - 0.05]], [0, 0, 0], { segs: seg(14), uv: sw('water'), k: [0.8, 1] });
    K.disc(B.hard, S.r - 0.018, [0, S.h - 0.05, 0], { segs: Math.max(8, seg(14)), uv: sw('piping') });
  });
}

/** An empty cue stand, in the frame of its foot: a turned wooden foot, a post, a rest with two notches at its top. */
export function cueStand(c) {
  const { K, B, sw, detail } = c;
  const hi = detail >= 2, S = CUE_STAND, seg = hi ? c.seg : (n) => c.seg(n * 0.7);
  c.touch(0.34, 0.34, 0, 0, true);
  c.cast(0.5, 0.5, 0, 0);
  c.part('base', () => K.lathe(B.hard, hi ? [[S.base, 0.0015], [S.base, S.baseH - 0.007], [S.base - 0.009, S.baseH], [0.034, S.baseH + 0.004], [0.022, S.baseH + 0.028]]
    : [[S.base, 0.0015], [S.base - 0.006, S.baseH], [0.022, S.baseH + 0.028]], [0, 0, 0], { segs: seg(14), uv: sw('tray'), k: [0.8, 1] }));
  // (dark lacquered mahogany, the ball tray's finish: in pale maple the two stands were the loudest things on the floor,
  // shots/floor/g1.jpg)
  c.part('post', () => K.tube(B.hard, [0, S.baseH + 0.02, 0], [0, S.h - 0.028, 0], S.post, S.post * 0.9, { segs: seg(8), uv: sw('tray'), k: [0.85, 1] }));
  c.part('rest', () => {
    // a cross bar with three pegs: two notches a cue would lean in, lined with black rubber on the high room
    K.box(B.hard, [S.rest, 0.028, 0.02], [0, S.h - 0.016, 0], { uv: sw('tray'), b: 0.003 });
    for (const x of [-0.064, 0, 0.064]) K.box(B.hard, [0.014, 0.03, 0.034], [x, S.h - 0.015, 0.024], { uv: sw('tray'), b: 0.003 });
    if (hi) for (const x of [-0.032, 0.032]) K.box(B.hard, [0.05, 0.004, 0.03], [x, S.h - 0.027, 0.026], { uv: sw('rubber'), b: 0 });
  });
}

// ---- ROUND A6: the round's set (plan.js FLOOR_A6_DEFAULT; `c.a6` is true while it is built). `c.B.bright` is the
// high room's blended batch (steel at the cube's full share, glass shells); where a room has none it IS the hard batch,
// and `c.glassy` says which: a builder picks the finish by it. -------------------------------------------------------

// a strip of tape flat on the carpet: `len` along the direction `ang` (about the vertical), two triangles
function flatStrip(c, x, z, len, wide, ang, swatch, k = 1, y = 0.0034) {
  c.K.quad(c.B.hard, len, wide, [x, y, z], { rx: -Math.PI / 2, ry: ang, uv: c.sw(swatch), k });
}

// a closed ring of round bar in the plane spanned by the unit vectors u and v round the centre o
function ring(c, batch, o, u, v, R, r, n, sides, swatch) {
  const at = (i) => { const a = (i / n) * 2 * Math.PI, cs = Math.cos(a) * R, sn = Math.sin(a) * R; return [o[0] + u[0] * cs + v[0] * sn, o[1] + u[1] * cs + v[1] * sn, o[2] + u[2] * cs + v[2] * sn]; };
  for (let i = 0; i < n; i++) c.K.tube(batch, at(i), at(i + 1), r, r, { segs: sides, uv: c.sw(swatch) });
}

/**
 * A work lamp at a camera platform, in the frame of its mast's foot on the deck (square to the hall): a thin mast (on a
 * guard rail's corner post: a coupler over the post's top; on a riser: a flange screwed to the deck), a swivel, and a
 * 10 cm can whose lit opening sits on the plan's place (`wl.lit`), tipped down along `wl.dir` at the camera. The
 * opening's glow is a cell of the hard material's emissive map; the lamp's light is the light role's bake emitter.
 */
export function workLight(c, wl) {
  const { K, B, sw, detail } = c;
  const W = WORK_LIGHT, lo = detail === 0, hi = detail >= 2, L = wl.lit, D = wl.dir;
  const rear = [L[0] - D[0] * W.canLen, L[1] - D[1] * W.canLen, L[2] - D[2] * W.canLen], mid = [(L[0] + rear[0]) / 2, (L[1] + rear[1]) / 2, (L[2] + rear[2]) / 2];
  const mastTop = mid[1] - 0.034, y0 = wl.mount === 'flange' ? 0.006 : TOWER.rail + 0.02;
  if (wl.mount === 'flange') c.part('flange', () => {
    K.box(B.hard, [W.flange, 0.006, W.flange], [0, 0.003, 0], { uv: sw('skirt'), b: 0 });
    K.tube(B.hard, [0, 0.006, 0], [0, 0.07, 0], W.sleeve, W.sleeve, { segs: 6, uv: sw('skirt') });
  });
  // (the coupler over the corner post's top: a sleeve a little wider than the post's tube; the lite room has none)
  else if (!lo) c.part('sleeve', () => K.tube(B.hard, [0, TOWER.rail - 0.05, 0], [0, TOWER.rail + 0.06, 0], TOWER.post + 0.006, TOWER.post + 0.006, { segs: hi ? 8 : 4, uv: sw('rubber') }));
  c.part('mast', () => K.tube(B.hard, [0, y0, 0], [0, mastTop, 0], W.mast, W.mast * 0.9, { segs: lo ? 3 : hi ? 6 : 4, uv: sw('skirt') }));
  if (!lo) c.part('swivel', () => {
    K.tube(B.hard, [0, mastTop - 0.004, 0], mid, 0.008, 0.008, { segs: 4, uv: sw('column') });
    if (hi) K.box(B.hard, [0.03, 0.03, 0.03], [0, mastTop, 0], { uv: sw('column'), b: 0.003 });
  });
  c.part('can', () => {
    K.tube(B.hard, rear, L, W.can * 0.84, W.can, { segs: lo ? 4 : hi ? 12 : 6, uv: sw('housing'), caps: true });
    // (the high room: a cooling rib round the rear, a hard lip round the opening)
    if (hi) {
      const p = (t) => [rear[0] + D[0] * t, rear[1] + D[1] * t, rear[2] + D[2] * t];
      K.tube(B.hard, p(0.012), p(0.03), W.can * 0.93, W.can * 0.93, { segs: 12, uv: sw('rubber') });
      K.tube(B.hard, p(W.canLen - 0.008), p(W.canLen + 0.004), W.can + 0.0025, W.can + 0.0025, { segs: 12, uv: sw('rubber') });
    }
  });
  // the lit opening: a disc just proud of the can's front, facing along the axis (the base room and up)
  if (!lo) c.part('lens', () => K.disc(B.hard, W.can * 0.86, [L[0] + D[0] * 0.0012, L[1] + D[1] * 0.0012, L[2] + D[2] * 0.0012], { rx: Math.acos(Math.max(-1, Math.min(1, D[1]))), ry: Math.atan2(D[0], D[2]), segs: hi ? 12 : 6, uv: sw('glowLamp') }));
  // its cable: out of the can's rear, down the mast in two ties' worth of slack, to the deck (the high room)
  if (hi && c.look.cables) c.part('lead', () => {
    const r = 0.0035, off = W.mast + 0.006, pts = [[rear[0] - D[0] * 0.004, rear[1] - D[1] * 0.004, rear[2] - D[2] * 0.004], [rear[0] * 0.5, rear[1] - 0.05, rear[2] * 0.5], [off, mastTop - 0.12, 0.004], [off, (mastTop + y0) / 2, -0.004], [off + 0.014, y0 + 0.05, 0.003]];
    if (wl.mount !== 'flange') pts.push([TOWER.post + 0.008, TOWER.rail - 0.12, 0.004], [TOWER.post + 0.008, 0.2, -0.003], [TOWER.post + 0.03, 0.012, 0.01]);
    else pts.push([off + 0.02, 0.012, 0.02]);
    for (let i = 0; i + 1 < pts.length; i++) K.tube(B.hard, pts[i], pts[i + 1], r, r, { segs: 4, uv: sw('rubber') });
  });
}

/**
 * A production flight case on castors, closed, in the frame of its middle on the floor (+z = its front, a long side):
 * black laminate panels with the lid's joint round them, an aluminium angle along each of the twelve edges, two
 * recessed latches on the front, a recessed grip on each end, four castors (the base room: the panels, the joint and
 * two runners). Blank: no stencil, no sticker, no number.
 */
export function roadCase(c) {
  const { K, B, sw, detail } = c;
  // (round A7: the edge extrusions are ALUMINIUM on the hard batch: the hard material reads the hall's own cube, which
  // holds the carpet and the boards under its horizon, not the cloth. Round A6 drew them in a matt pale finish, the
  // cell of the platforms' nosing, a stand-in: as mirror aluminium on the app's cube they showed the cube's bed, a
  // saturated blue line seen from the far end, shots/floor/m3-CAM.jpg. That stand-in is deleted.)
  const hi = detail >= 2, C = ROAD_CASE, y0 = C.castor, yc = y0 + C.h / 2, metal = 'alu', M = B.hard;
  c.touchBox(C.w + 0.02, C.d + 0.02, 0, 0);
  c.cast(0.9, 0.95, 0, 0);
  c.part('box', () => {
    K.box(B.hard, [C.w, C.h, C.d], [0, yc, 0], { uv: sw('top'), b: hi ? 0.004 : 0, k: [0.82, 1] });
    // the lid's joint: a dark line round the case a third from its top
    const yj = y0 + C.h * 0.68;
    for (const s of [-1, 1]) K.quad(B.hard, C.w - 0.02, 0.006, [0, yj, s * (C.d / 2 + 0.0008)], { ry: s > 0 ? 0 : Math.PI, uv: sw('piping') });
    if (hi) for (const s of [-1, 1]) K.quad(B.hard, C.d - 0.02, 0.006, [s * (C.w / 2 + 0.0008), yj, 0], { ry: s * Math.PI / 2, uv: sw('piping') });
  });
  c.part('castor', () => {
    if (!hi) { for (const s of [-1, 1]) K.box(B.hard, [0.07, y0 - 0.004, C.d - 0.1], [s * (C.w / 2 - 0.09), (y0 - 0.004) / 2 + 0.002, 0], { uv: sw('rubber'), b: 0 }); return; }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (C.w / 2 - 0.085), z = sz * (C.d / 2 - 0.085);
      K.box(B.hard, [0.085, 0.006, 0.07], [x, y0 - 0.003, z], { uv: sw('steel'), b: 0 });
      K.tube(B.hard, [x - 0.014, 0.037, z + sx * 0.012], [x + 0.014, 0.037, z + sx * 0.012], 0.037, 0.037, { segs: 10, uv: sw('rubber'), caps: true });
      K.box(B.hard, [0.04, 0.044, 0.012], [x, y0 - 0.028, z + sx * 0.012], { uv: sw('steel'), b: 0 });
    }
  });
  if (hi) {
    // the edge extrusions: an angle along each of the twelve edges (the blended batch's aluminium where the room has it)
    c.part('edge', () => {
      const t = 0.022, e = 0.0025, o = { uv: sw(metal), b: 0 };
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(M, [t, C.h + 2 * e, t], [sx * (C.w / 2 - t / 2 + e), yc, sz * (C.d / 2 - t / 2 + e)], o);
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) K.box(M, [C.w - 2 * t, t, t], [0, yc + sy * (C.h / 2 - t / 2 + e), sz * (C.d / 2 - t / 2 + e)], o);
        for (const sx of [-1, 1]) K.box(M, [t, t, C.d - 2 * t], [sx * (C.w / 2 - t / 2 + e), yc + sy * (C.h / 2 - t / 2 + e), 0], o);
      }
    });
    // two recessed latches on the front, across the lid's joint: a dark dish and a plain steel wing in it
    c.part('latch', () => {
      for (const s of [-1, 1]) {
        const x = s * C.w * 0.27, y = y0 + C.h * 0.68, z = C.d / 2;
        K.quad(B.hard, 0.085, 0.1, [x, y, z + 0.0012], { uv: sw('piping') });
        K.box(M, [0.05, 0.03, 0.006], [x, y + 0.004, z + 0.004], { uv: sw('chrome'), b: 0, rz: 0.5 });
      }
    });
    // a recessed grip on each end: a dark dish with a sprung bar across it
    c.part('grip', () => {
      for (const s of [-1, 1]) {
        const x = s * C.w / 2, y = y0 + C.h * 0.42;
        K.quad(B.hard, 0.15, 0.1, [x + s * 0.0012, y, 0], { ry: s * Math.PI / 2, uv: sw('piping') });
        K.tube(B.hard, [x + s * 0.006, y + 0.012, -0.055], [x + s * 0.006, y + 0.012, 0.055], 0.006, 0.006, { segs: 5, uv: sw('rubber') });
      }
    });
  }
}

/**
 * A two-shelf cart, in the frame of its middle on the floor (+z = its front, a long side): four uprights of plated tube
 * on castors, two laminate shelves with a raised rim, a lined tray on the top one, a folded cloth on the lower one.
 */
export function trolley(c) {
  const { K, B, sw, detail } = c;
  const hi = detail >= 2, T = TROLLEY, hw = T.w / 2 - 0.02, hd = T.d / 2 - 0.02, M = B.hard, plated = 'chrome';
  c.touchBox(T.w + 0.02, T.d + 0.02, 0, 0);
  c.cast(1.0, 0.8, 0, 0);
  const y0 = hi ? T.castor : 0.002;
  c.part('frame', () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.tube(M, [sx * hw, y0, sz * hd], [sx * hw, T.h + 0.03, sz * hd], T.tube, T.tube, { segs: hi ? 8 : 4, uv: sw(plated), caps: hi });
    // the push bar across one end, over the top shelf (the high room)
    if (hi) K.tube(M, [hw, T.h + 0.022, -hd], [hw, T.h + 0.022, hd], T.tube * 0.8, T.tube * 0.8, { segs: 6, uv: sw(plated) });
  });
  c.part('shelf', () => {
    for (const y of [T.shelf, T.h]) {
      K.box(B.hard, [T.w - 0.016, 0.018, T.d - 0.016], [0, y - 0.009, 0], { uv: sw('top'), b: 0, k: y === T.shelf ? 0.78 : 1 });
      // a raised rim along the two long sides (the high room)
      if (hi) for (const s of [-1, 1]) K.box(B.hard, [T.w - 0.06, 0.012, 0.008], [0, y + 0.006, s * (hd - 0.012)], { uv: sw('top'), b: 0 });
    }
  });
  if (hi) c.part('castor', () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      K.tube(B.hard, [sx * hw - 0.011, 0.03, sz * (hd - 0.008)], [sx * hw + 0.011, 0.03, sz * (hd - 0.008)], 0.03, 0.03, { segs: 8, uv: sw('rubber'), caps: true });
      K.box(B.hard, [0.03, 0.04, 0.01], [sx * hw, 0.05, sz * (hd - 0.008)], { uv: sw('steel'), b: 0 });
    }
  });
  // the tray on the top shelf (the desk's own: lacquered wood, a felt lining), set down a little askew
  const tx = -0.09, tz = 0.01, ty = T.h, a = 0.1;
  c.part('tray', () => {
    if (!hi) { K.box(B.hard, [0.34, 0.024, 0.24], [tx, ty + 0.012, tz], { ry: a, uv: sw('tray'), b: 0 }); return; }
    K.box(B.hard, [0.34, 0.008, 0.24], [tx, ty + 0.004, tz], { ry: a, uv: sw('tray'), b: 0.002 });
    const cs = Math.cos(a), sn = Math.sin(a);
    for (const s of [-1, 1]) {
      K.box(B.hard, [0.34, 0.024, 0.008], [tx + s * 0.116 * sn, ty + 0.012, tz + s * 0.116 * cs], { ry: a, uv: sw('tray'), b: 0.003 });
      K.box(B.hard, [0.008, 0.024, 0.24], [tx + s * 0.166 * cs, ty + 0.012, tz - s * 0.166 * sn], { ry: a, uv: sw('tray'), b: 0.003 });
    }
  });
  c.part('lining', () => K.quad(B.hard, 0.32, 0.22, [tx, ty + (hi ? 0.0086 : 0.0246), tz], { rx: -Math.PI / 2, ry: a, uv: sw('lining') }));
  // a folded cloth on the lower shelf (the desk's polishing cloth)
  c.part('cloth', () => {
    K.box(B.hard, [0.2, 0.014, 0.14], [0.11, T.shelf + 0.007, -0.02], { ry: -0.3, uv: sw('towel'), b: hi ? 0.005 : 0, k: [0.7, 0.85] });
    if (hi) K.box(B.hard, [0.19, 0.012, 0.13], [0.112, T.shelf + 0.02, -0.018], { ry: -0.24, uv: sw('towel'), b: 0.005, k: 0.85 });
  });
}

/**
 * A camera's spot, in the frame of the place on the floor (square to the hall): a cross of two strips of pale tape,
 * worn (one strip in two pieces, the other a shade greyer), and at the first spot a coil of the camera's cable lying
 * beside it (`sp.coil`: its middle, local [x, z]; the high room).
 */
export function spot(c, sp) {
  const { K, B, sw, detail } = c;
  const S = SPOT, t = sp.turn ?? 0.2, q = Math.PI / 4;
  c.part('cross', () => {
    flatStrip(c, 0, 0, S.len, S.wide, t + q, 'towel', 0.92);
    // the second strip was stuck down in two pieces that do not quite line up
    const a = t - q, ux = Math.cos(a), uz = -Math.sin(a), h = S.len / 4;
    flatStrip(c, ux * (h + 0.012), uz * (h + 0.012), S.len / 2 - 0.02, S.wide, a, 'cover', 1, 0.0038);
    flatStrip(c, -ux * (h + 0.008) + 0.006, -uz * (h + 0.008), S.len / 2 - 0.03, S.wide, a + 0.05, 'cover', 0.9, 0.0038);
  });
  if (sp.coil && detail >= 2 && c.look.cables) c.part('coil', () => {
    // four turns of cable lying one on another, not quite round and not quite on one middle, and its free end
    const [x, z] = sp.coil, r = 0.0065;
    for (let k = 0; k < 4; k++) ring(c, B.hard, [x + (k % 2 ? 0.006 : -0.004), r + 0.0012 + k * r * 1.55, z + (k === 2 ? 0.007 : -0.003)], [1, 0, 0], [0, 0, 1], S.coil - 0.012 * k + (k === 1 ? 0.008 : 0), r, 12, 4, 'rubber');
    K.tube(B.hard, [x + S.coil * 0.6, r + 0.001, z + S.coil * 0.72], [x + S.coil * 1.02, r + 0.001, z + S.coil * 0.2], r, r, { segs: 4, uv: sw('rubber'), caps: true });
  });
}

/**
 * One segment of a taped cable run, in the ROOM's frame on the floor (call it inside the floor's frame, not an item's):
 * a ribbon `width` wide with the cable's ridge down its middle, mitred to its neighbours (`prev` / `next` = the path's
 * points before a and after b, or null), cut into pieces of tape with a slightly different lie.
 */
export function cableRun(c, a, b, prev, next, width) {
  const { K, B, sw } = c;
  // (round A5: a run of the dress is taped in grey gaffer tape, albedo 0.17: black tape on the dark carpet did not read
  // from above, shots/floor/h3-CAM.jpg; the hall's runs outside the boards stay black)
  const [u, v] = sw(c.item?.of ? 'cover' : 'tape').s;
  const dir = (p, q) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [(q[0] - p[0]) / l, (q[1] - p[1]) / l]; };
  const d = dir(a, b), n = [-d[1], d[0]];
  const mitre = (other) => { if (!other) return n; const m = [-other[1], other[0]], k = 1 + n[0] * m[0] + n[1] * m[1]; return k < 0.2 ? n : [(n[0] + m[0]) / k, (n[1] + m[1]) / k]; };
  const mA = mitre(prev ? dir(prev, a) : null), mB = mitre(next ? dir(b, next) : null);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), pieces = Math.max(1, Math.round(len / CABLE.piece));
  const across = [[-width / 2, CABLE.edge, -0.12], [-CABLE.core, CABLE.edge + 0.0015, -0.5], [0, CABLE.ridge, 0], [CABLE.core, CABLE.edge + 0.0015, 0.5], [width / 2, CABLE.edge, 0.12]];
  c.part('tape', () => {
    for (let i = 0; i < pieces; i++) {
      const t0 = i / pieces, t1 = (i + 1) / pieces, shade = i % 2 ? 0.86 : 1;
      const P = [], N = [], UV = [], C = [], Q = [];
      for (const [t, m] of [[t0, i === 0 ? mA : n], [t1, i === pieces - 1 ? mB : n]]) {
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
        for (const [o, y, lean] of across) { P.push(x + m[0] * o, y, z + m[1] * o); N.push(n[0] * lean, 1, n[1] * lean); UV.push(u, v); C.push(shade); }
      }
      for (let k = 0; k < 4; k++) Q.push([k, k + 1, k + 6, k + 5]);
      K.raw(B.hard, P, N, UV, Q, C);
    }
  });
}
